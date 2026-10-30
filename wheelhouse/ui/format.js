/**
 * Words and URLs for the GIFs page, kept apart from the element so they can
 * be tested without a browser.
 *
 * @typedef {import('./index.js').PageData} PageData
 */

/** Only http(s) links, as Wheelhouse's own blocks allow. */
export function safeUrl(/** @type {string | undefined} */ href) {
	try {
		const u = new URL(String(href));
		return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
	} catch {
		return null;
	}
}

/**
 * A smaller GIPHY rendition of a GIF for the grid: `200w.gif` moving, or
 * `200w_s.gif` still. Other URLs are used as they are.
 * @param {string} url @param {boolean} still
 */
export function thumbnail(url, still) {
	const m = /^(https:\/\/media\.giphy\.com\/media\/[A-Za-z0-9]+\/)[\w-]+\.gif$/.exec(url);
	return m ? `${m[1]}${still ? '200w_s.gif' : '200w.gif'}` : url;
}

/** "2026-10-30" → "30 October 2026", in the reader's own way of writing dates. */
export function longDate(/** @type {string | null} */ day) {
	if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
	return new Intl.DateTimeFormat(undefined, {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC'
	}).format(new Date(`${day}T12:00:00Z`));
}

/** When the GIFs were checked, in words. */
export function checkedLine(/** @type {PageData} */ d) {
	if (!d.checkedTo) return '';
	if (d.checkedFrom === d.checkedTo)
		return `Every one checked to load on ${longDate(d.checkedTo)}.`;
	return `Every one checked to load, between ${longDate(d.checkedFrom)} and ${longDate(d.checkedTo)}.`;
}
