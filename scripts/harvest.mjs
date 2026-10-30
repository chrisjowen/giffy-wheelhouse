#!/usr/bin/env node
/**
 * Fill the catalogue: for each occasion in data/occasions.json, read GIPHY's
 * public search pages for its search words (no API key), keep GIFs rated G
 * that are not stickers, are small enough for the chat, say in their own title
 * or description that they fit the occasion and say nothing gloomy,
 * check each one loads, and add those that do to data/catalogue.json until
 * the occasion has its share of the 500. GIFs already there are kept, so a run
 * after a re-check tops up what the re-check dropped. GIFs listed in
 * data/rejected.json are never added, and leave the catalogue if they are in it.
 *
 *   node scripts/harvest.mjs [--per <n>] [--dry-run]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { checkAll } from '../lib/check.mjs';
import {
	CATALOGUE_FILE,
	MAX_GIFS,
	ROOT,
	gifsFor,
	loadCatalogue,
	loadOccasions,
	problems
} from '../lib/catalogue.mjs';
import { altText, mediaUrl, parseSearchPage, searchUrl } from '../lib/giphy.mjs';

const REJECTED_FILE = path.join(ROOT, 'data', 'rejected.json');

/** Words that make a GIF wrong for good news, in its title, slug or tags. */
const GLOOMY =
	/\b(obama|politic|political|president|flirt|flirting|valentine|valentines|sarcastic|sarcasm|stupid|scared|suspicious|whatever|drama|nft|crypto|real estate|birthday|halloween|christmas|lol|love|dating|joker|sponsored|pharmacy|yawn|yawning|sad|cry|crying|tears|angry|rage|mad|hate|fail|failed|failure|sink|sinking|sunk|crash|crashed|dead|death|die|dying|rip|kill|gun|blood|fire|burn|disaster|sick|vomit|puke|drunk|beer|wine|shot|shots|sexy|sex|kiss|butt|nsfw|middle finger|scream|horror|scary|zombie|trump|biden|election|politic|war|nope|no no|ugh|bored|boring|tired|exhausted|sorry|oops|confused|facepalm|disappointed|cringe)\b/i;

const args = process.argv.slice(2);
const flag = (/** @type {string} */ name) => args.includes(name);
const option = (/** @type {string} */ name) => {
	const at = args.indexOf(name);
	return at >= 0 ? args[at + 1] : undefined;
};

const occasions = loadOccasions();
const catalogue = existsSync(CATALOGUE_FILE) ? loadCatalogue() : { gifs: [] };
/** @type {{ id: string, why: string }[]} */
const rejected = existsSync(REJECTED_FILE) ? JSON.parse(readFileSync(REJECTED_FILE, 'utf8')) : [];
const rejectedIds = new Set(rejected.map((r) => r.id));
// A GIF rejected since an earlier harvest leaves the catalogue.
catalogue.gifs = catalogue.gifs.filter((g) => !rejectedIds.has(g.id));
const per = Number(option('--per') ?? Math.floor(MAX_GIFS / occasions.occasions.length));
const today = new Date().toISOString().slice(0, 10);

const sleep = (/** @type {number} */ ms) => new Promise((r) => setTimeout(r, ms));

/** @param {string} words */
async function search(words) {
	const url = searchUrl(words);
	const res = await fetch(url, {
		headers: { 'user-agent': 'Mozilla/5.0 (giffy-wheelhouse catalogue harvest)' },
		signal: AbortSignal.timeout(30_000)
	});
	if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
	return parseSearchPage(await res.text());
}

/** "Thumbs up!" → " thumbs up ", for matching whole words. */
const words = (/** @type {string} */ s) =>
	` ${s
		.toLowerCase()
		.replace(/['’]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()} `;

/**
 * Whether a GIF's own title or description says it is for the occasion: it
 * holds one of the occasion's search words or names, as whole words.
 * @param {import('../lib/giphy.mjs').Candidate} c
 * @param {import('../lib/catalogue.mjs').Occasion} occasion
 */
const relevant = (c, occasion) => {
	const text = words(`${c.title} ${c.alt}`);
	return [...(occasion.search ?? []), occasion.title, ...occasion.aliases].some((p) =>
		text.includes(words(p.replace(/-/g, ' ')))
	);
};

/** @param {import('../lib/giphy.mjs').Candidate} c */
const suitable = (c) =>
	c.rating === 'g' &&
	!c.sticker &&
	!c.hidden &&
	!rejectedIds.has(c.id) &&
	!GLOOMY.test([c.title, c.alt, c.page, ...c.tags].join(' ')) &&
	!!altText(c) &&
	!!mediaUrl(c);

/** @type {Map<string, import('../lib/catalogue.mjs').Gif>} */
const byId = new Map(catalogue.gifs.map((g) => [g.id, g]));

for (const occasion of occasions.occasions) {
	const have = gifsFor(catalogue, occasion.id).length;
	if (have >= per) {
		console.log(`${occasion.title}: ${have} already`);
		continue;
	}
	/** @type {import('../lib/giphy.mjs').Candidate[][]} */
	const lists = [];
	for (const phrase of occasion.search ?? []) {
		try {
			lists.push((await search(phrase)).filter((c) => suitable(c) && relevant(c, occasion)));
		} catch (e) {
			console.warn(`  could not search "${phrase}": ${e instanceof Error ? e.message : e}`);
		}
		await sleep(1200);
	}
	// Take from each search in turn, so one search word does not fill the occasion.
	/** @type {import('../lib/giphy.mjs').Candidate[]} */
	const ranked = [];
	const seen = new Set();
	for (let i = 0; lists.some((l) => i < l.length); i++)
		for (const l of lists)
			if (i < l.length && !seen.has(l[i].id)) {
				seen.add(l[i].id);
				ranked.push(l[i]);
			}
	const fresh = ranked.filter((c) => !byId.has(c.id)).slice(0, (per - have) * 3 + 5);
	const results = await checkAll(fresh.map((c) => /** @type {string} */ (mediaUrl(c))));
	let added = 0;
	for (const c of fresh) {
		if (have + added >= per || byId.size >= MAX_GIFS) break;
		const url = /** @type {string} */ (mediaUrl(c));
		const r = results.get(url);
		if (!r?.ok) {
			console.log(`  skip ${c.id}: ${r ? r.reason : 'not checked'}`);
			continue;
		}
		const gif = {
			id: c.id,
			url,
			alt: altText(c),
			occasions: [occasion.id],
			checked: today,
			page: c.page
		};
		byId.set(c.id, gif);
		catalogue.gifs.push(gif);
		added++;
	}
	console.log(`${occasion.title}: ${have + added} (${added} new, from ${ranked.length} suitable)`);
}

const wrong = problems(occasions, catalogue);
if (wrong.length) {
	console.error(`The catalogue has problems:\n- ${wrong.join('\n- ')}`);
	process.exit(1);
}
if (flag('--dry-run')) {
	console.log(`Dry run: ${catalogue.gifs.length} GIFs, nothing written.`);
} else {
	writeFileSync(CATALOGUE_FILE, `${JSON.stringify(catalogue, null, '\t')}\n`);
	console.log(`Wrote ${catalogue.gifs.length} GIFs.`);
}
