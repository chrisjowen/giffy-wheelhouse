/**
 * The catalogue: the occasions (`data/occasions.json`, written by hand) and
 * the GIFs for them (`data/catalogue.json`, written by the harvest and
 * re-check scripts). Every GIF in it was checked to load on its `checked`
 * date; one the re-check found dead but kept (`--flag`) has `dead` and is
 * never offered.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OCCASIONS_FILE = path.join(ROOT, 'data', 'occasions.json');
export const CATALOGUE_FILE = path.join(ROOT, 'data', 'catalogue.json');
export const MAX_GIFS = 500;

/**
 * @typedef {{ id: string, title: string, when: string, aliases: string[], search?: string[] }} Occasion
 * @typedef {{ id: string, title: string, when: string, aliases: string[] }} NoGifRule
 * @typedef {{ occasions: Occasion[], noGif: NoGifRule }} Occasions
 * @typedef {{ id: string, url: string, alt: string, occasions: string[], checked: string,
 *   page?: string, dead?: string }} Gif
 * @typedef {{ gifs: Gif[] }} Catalogue
 */

/** @param {string} file */
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** @returns {Occasions} */
export function loadOccasions(file = OCCASIONS_FILE) {
	return readJson(file);
}

/** @returns {Catalogue} */
export function loadCatalogue(file = CATALOGUE_FILE) {
	return readJson(file);
}

/** "Tests green!" → "tests-green". */
export const slug = (/** @type {string} */ s) =>
	String(s)
		.toLowerCase()
		.replace(/['’]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');

/**
 * Which occasion a name means: an occasion's id, title or alias, or the
 * no-GIF rule's. Null when it means none.
 * @param {Occasions} occasions
 * @param {string} name
 * @returns {{ kind: 'occasion', occasion: Occasion } | { kind: 'no-gif', rule: NoGifRule } | null}
 */
export function resolveOccasion(occasions, name) {
	const s = slug(name);
	if (!s) return null;
	const names = (/** @type {{ id: string, title: string, aliases: string[] }} */ o) => [
		o.id,
		slug(o.title),
		...o.aliases.map(slug)
	];
	const rule = occasions.noGif;
	if (names(rule).includes(s)) return { kind: 'no-gif', rule };
	const exact = occasions.occasions.find((o) => names(o).includes(s));
	if (exact) return { kind: 'occasion', occasion: exact };
	// "pr-merged-and-landed" → the first occasion one of whose names it holds as a word run.
	const words = `-${s}-`;
	if (names(rule).some((n) => words.includes(`-${n}-`))) return { kind: 'no-gif', rule };
	const loose = occasions.occasions.find((o) => names(o).some((n) => words.includes(`-${n}-`)));
	return loose ? { kind: 'occasion', occasion: loose } : null;
}

/** The GIFs that may be offered for an occasion, in catalogue order. */
export const gifsFor = (/** @type {Catalogue} */ catalogue, /** @type {string} */ occasionId) =>
	catalogue.gifs.filter((g) => !g.dead && g.occasions.includes(occasionId));

/** A GIF as the Markdown image the chat renders. */
export function markdownImage(/** @type {Gif} */ gif) {
	const alt = gif.alt.replace(/[[\]\\]/g, '').trim() || 'GIF';
	return `![${alt}](${gif.url})`;
}

/**
 * Picks GIFs for occasions without repeating one until the occasion's whole
 * list has been used: each occasion's list is shuffled, then dealt in turn.
 */
export class Picker {
	/** @type {Map<string, string[]>} */
	#decks = new Map();

	/** @param {Catalogue} catalogue @param {() => number} [random] */
	constructor(catalogue, random = Math.random) {
		this.catalogue = catalogue;
		this.random = random;
	}

	/** @param {string} occasionId @returns {Gif | null} */
	pick(occasionId) {
		const all = gifsFor(this.catalogue, occasionId);
		if (!all.length) return null;
		let deck = (this.#decks.get(occasionId) ?? []).filter((id) => all.some((g) => g.id === id));
		if (!deck.length) {
			deck = all.map((g) => g.id);
			for (let i = deck.length - 1; i > 0; i--) {
				const j = Math.floor(this.random() * (i + 1));
				[deck[i], deck[j]] = [deck[j], deck[i]];
			}
		}
		const id = deck.shift();
		this.#decks.set(occasionId, deck);
		return all.find((g) => g.id === id) ?? null;
	}
}

/**
 * What is wrong with the catalogue, if anything: each problem in plain words.
 * @param {Occasions} occasions
 * @param {Catalogue} catalogue
 * @returns {string[]}
 */
export function problems(occasions, catalogue) {
	const out = [];
	const ids = new Set(occasions.occasions.map((o) => o.id));
	if (ids.size !== occasions.occasions.length) out.push('two occasions share an id');
	if (ids.has(occasions.noGif.id)) out.push('the no-GIF rule shares an id with an occasion');
	if (!Array.isArray(catalogue.gifs)) return [...out, 'the catalogue has no gifs list'];
	if (catalogue.gifs.length > MAX_GIFS) out.push(`more than ${MAX_GIFS} GIFs`);
	const seenIds = new Set();
	const seenUrls = new Set();
	for (const g of catalogue.gifs) {
		const who = g?.id ?? JSON.stringify(g);
		if (!g || typeof g.id !== 'string' || !g.id) out.push(`a GIF without an id: ${who}`);
		if (seenIds.has(g.id)) out.push(`${who} is listed twice`);
		seenIds.add(g.id);
		if (seenUrls.has(g.url)) out.push(`${who} repeats another GIF's URL`);
		seenUrls.add(g.url);
		if (
			typeof g.url !== 'string' ||
			!/^https:\/\/media\.giphy\.com\/media\/[A-Za-z0-9]+\/[\w-]+\.gif$/.test(g.url)
		)
			out.push(`${who} has a URL that is not a direct GIPHY media URL`);
		else if (!g.url.includes(`/media/${g.id}/`)) out.push(`${who} has another GIF's URL`);
		if (typeof g.alt !== 'string' || !g.alt.trim()) out.push(`${who} has no alt text`);
		if (!Array.isArray(g.occasions) || !g.occasions.length) out.push(`${who} has no occasions`);
		else
			for (const o of g.occasions)
				if (!ids.has(o)) out.push(`${who} names an unknown occasion ${o}`);
		if (typeof g.checked !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(g.checked))
			out.push(`${who} has no checked date`);
		if (g.dead !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(g.dead)))
			out.push(`${who} has a dead mark that is not a date`);
	}
	return out;
}
