#!/usr/bin/env node
/**
 * Re-check every GIF in data/catalogue.json: each must answer HTTP 200, with
 * no redirect, as an image, and not as GIPHY's stand-in for a missing GIF
 * (see lib/check.mjs). A GIF that loads gets today's date as `checked`.
 *
 *   node scripts/verify.mjs            # drop the GIFs that no longer load
 *   node scripts/verify.mjs --flag     # keep them, marked `dead` with today's date, never offered
 *   node scripts/verify.mjs --dry-run  # say what it finds, change nothing
 *
 * Exits 1 when any GIF did not load, so CI or a scheduled run notices.
 * `npm run harvest` afterwards tops up what was dropped.
 */
import { writeFileSync } from 'node:fs';
import { checkAll } from '../lib/check.mjs';
import { CATALOGUE_FILE, loadCatalogue, loadOccasions, problems } from '../lib/catalogue.mjs';

const args = new Set(process.argv.slice(2));
const flagOnly = args.has('--flag');
const dryRun = args.has('--dry-run');
const today = new Date().toISOString().slice(0, 10);

const occasions = loadOccasions();
const catalogue = loadCatalogue();
const wrong = problems(occasions, catalogue);
if (wrong.length) {
	console.error(`The catalogue has problems:\n- ${wrong.join('\n- ')}`);
	process.exit(1);
}

let done = 0;
const results = await checkAll(
	catalogue.gifs.map((g) => g.url),
	{
		onResult: () => {
			done++;
			if (process.stdout.isTTY)
				process.stdout.write(`\rChecked ${done} of ${catalogue.gifs.length}`);
		}
	}
);
if (process.stdout.isTTY) process.stdout.write('\n');

/** @type {{ gif: import('../lib/catalogue.mjs').Gif, reason: string }[]} */
const dead = [];
for (const gif of catalogue.gifs) {
	const r = results.get(gif.url);
	if (r?.ok) {
		gif.checked = today;
		delete gif.dead;
	} else {
		dead.push({ gif, reason: r && !r.ok ? r.reason : 'not checked' });
		if (flagOnly) gif.dead = today;
	}
}
if (!flagOnly) {
	const gone = new Set(dead.map((d) => d.gif.id));
	catalogue.gifs = catalogue.gifs.filter((g) => !gone.has(g.id));
}

for (const { gif, reason } of dead) console.log(`Did not load: ${gif.url} (${reason})`);
const kept = catalogue.gifs.filter((g) => !g.dead).length;
console.log(
	dead.length
		? `${kept} GIFs load; ${dead.length} did not and ${flagOnly ? 'are marked dead' : 'were dropped'}.`
		: `All ${kept} GIFs load.`
);
if (dryRun) console.log('Dry run: nothing written.');
else writeFileSync(CATALOGUE_FILE, `${JSON.stringify(catalogue, null, '\t')}\n`);
process.exit(dead.length ? 1 : 0);
