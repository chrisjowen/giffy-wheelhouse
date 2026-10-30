/**
 * Reading GIF candidates from GIPHY's public search pages, for the harvest
 * script only. A search page (`https://giphy.com/search/<words>`) carries its
 * first results as JSON inside the page's streamed data, so no API key is
 * needed. Nothing at runtime searches: the plugin only ever reads the
 * catalogue the harvest wrote.
 */

/**
 * @typedef {{ id: string, title: string, alt: string, rating: string, page: string,
 *   tags: string[], sticker: boolean, hidden: boolean,
 *   renditions: Record<string, { url: string, bytes: number | null, width: number | null }> }} Candidate
 */

/** The search page for some words. */
export const searchUrl = (/** @type {string} */ words) =>
	`https://giphy.com/search/${encodeURIComponent(words.trim().toLowerCase().replace(/\s+/g, '-'))}`;

/**
 * Every GIF object in a search page's HTML, in the order the page lists them.
 * @param {string} html
 * @returns {Candidate[]}
 */
export function parseSearchPage(html) {
	const chunks = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)];
	let text = '';
	for (const m of chunks) {
		try {
			text += JSON.parse(m[1]);
		} catch {
			// a chunk that is not a JSON string is not one we need
		}
	}
	/** @type {Map<string, Candidate>} */
	const found = new Map();
	for (const raw of objectsStarting(text, '{"type":"gif","id":"')) {
		let o;
		try {
			o = JSON.parse(raw);
		} catch {
			continue;
		}
		if (typeof o?.id !== 'string' || found.has(o.id)) continue;
		found.set(o.id, toCandidate(o));
	}
	return [...found.values()];
}

/** Each balanced JSON object in `text` that starts with `prefix`. */
function* objectsStarting(/** @type {string} */ text, /** @type {string} */ prefix) {
	let i = 0;
	while ((i = text.indexOf(prefix, i)) >= 0) {
		let depth = 0;
		let inString = false;
		let j = i;
		for (; j < text.length; j++) {
			const c = text[j];
			if (inString) {
				if (c === '\\') j++;
				else if (c === '"') inString = false;
			} else if (c === '"') inString = true;
			else if (c === '{') depth++;
			else if (c === '}' && --depth === 0) break;
		}
		yield text.slice(i, j + 1);
		i = j + 1;
	}
}

/** @param {any} o @returns {Candidate} */
function toCandidate(o) {
	/** @type {Candidate['renditions']} */
	const renditions = {};
	for (const [name, r] of Object.entries(o.images ?? {})) {
		const url = /** @type {any} */ (r)?.url;
		if (typeof url !== 'string' || !/\.gif(\?|$)/.test(url)) continue;
		const n = (/** @type {unknown} */ v) =>
			Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;
		renditions[name] = {
			url,
			bytes: n(/** @type {any} */ (r).size),
			width: n(/** @type {any} */ (r).width)
		};
	}
	const tags = [...(o.tags ?? []), ...(o.featured_tags ?? []), ...(o.user_tags ?? [])].filter(
		(t) => typeof t === 'string'
	);
	return {
		id: o.id,
		title: typeof o.title === 'string' ? o.title : '',
		alt: typeof o.alt_text === 'string' ? o.alt_text : '',
		rating: typeof o.rating === 'string' ? o.rating : '',
		page: typeof o.url === 'string' ? o.url : `https://giphy.com/gifs/${o.id}`,
		tags,
		sticker: o.is_sticker === 1 || o.is_sticker === true,
		hidden: !!(o.is_hidden || o.is_removed),
		renditions
	};
}

/**
 * The direct media URL to keep for a candidate: the full GIF when it is small
 * enough for the chat, else GIPHY's downsized one; null when neither is.
 * The URL is GIPHY's plain form, `https://media.giphy.com/media/<id>/<file>.gif`.
 * @param {Candidate} c
 * @param {{ maxBytes?: number }} [o]
 */
export function mediaUrl(c, { maxBytes = 3_000_000 } = {}) {
	for (const name of ['original', 'downsized']) {
		const r = c.renditions[name];
		if (!r || r.bytes === null || r.bytes > maxBytes) continue;
		const file = r.url.split('?')[0].split('/').pop();
		if (!file || !/^[\w-]+\.gif$/.test(file)) continue;
		return `https://media.giphy.com/media/${c.id}/${file}`;
	}
	return null;
}

/**
 * A GIF's alt text from its own description or title, tidied:
 * "Go For It GIF by GIPHY IRL" → "Go For It", "Movie gif. Kronk looks at us…"
 * → "Kronk looks at us…". Empty when there is nothing to say.
 */
export function altText(/** @type {Candidate} */ c) {
	return tidyAlt(
		(c.alt || c.title).replace(/\s+(GIF|Sticker)(\s+by\s+.*)?$/i, '').replace(/\s+by\s+.*$/i, '')
	);
}

/** Drops GIPHY's "Movie gif." kind of prefix, squeezes spaces, starts with a capital, keeps it short. */
export function tidyAlt(/** @type {string} */ text) {
	const from = text
		.replace(/^[A-Za-z0-9 '’&-]{0,40}\bgif[.:]\s*/i, '')
		.replace(/\s+/g, ' ')
		.trim();
	if (!from || /^(gif|sticker)$/i.test(from)) return '';
	const capital = from[0].toUpperCase() + from.slice(1);
	if (capital.length <= 120) return capital;
	const cut = capital.slice(0, 118);
	return `${cut.slice(0, cut.lastIndexOf(' ') > 60 ? cut.lastIndexOf(' ') : 118).replace(/[\s,;:.]+$/, '')}…`;
}
