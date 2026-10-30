/**
 * Checking that a GIF URL loads: an HTTP 200 answer, with no redirect, whose
 * content type is an image. GIPHY answers 200 with a stock "not found" GIF for
 * an id it does not have, so that answer counts as dead too: it carries
 * GIPHY's not-found markers, or the stock GIF's etag.
 */

/** The etag of GIPHY's stock "not found" GIF. */
export const GIPHY_MISSING_ETAG = '7857b47ea71f7138a937a116b9434c24';

const MISSING_HEADERS = ['x-retry-not-found-metric', 'x-fastly-s3-fallback-triggered-metric'];

/**
 * @typedef {{ ok: true, contentType: string, bytes: number | null }
 *   | { ok: false, reason: string }} CheckResult
 */

/**
 * Check one URL. `fetchImpl` is for tests.
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [o]
 * @returns {Promise<CheckResult>}
 */
export async function checkUrl(url, { fetchImpl = fetch, timeoutMs = 15_000 } = {}) {
	let parsed;
	try {
		parsed = new URL(url);
	} catch {
		return { ok: false, reason: 'not a URL' };
	}
	if (parsed.protocol !== 'https:') return { ok: false, reason: 'not https' };
	let res;
	try {
		res = await fetchImpl(url, {
			method: 'HEAD',
			redirect: 'manual',
			signal: AbortSignal.timeout(timeoutMs),
			headers: { 'user-agent': 'giffy-wheelhouse link check' }
		});
		// A server that will not answer HEAD gets one GET.
		if (res.status === 405 || res.status === 501) {
			res = await fetchImpl(url, {
				method: 'GET',
				redirect: 'manual',
				signal: AbortSignal.timeout(timeoutMs),
				headers: { 'user-agent': 'giffy-wheelhouse link check' }
			});
			await res.body?.cancel();
		}
	} catch (e) {
		return { ok: false, reason: `no answer (${e instanceof Error ? e.message : String(e)})` };
	}
	if (res.status !== 200) return { ok: false, reason: `HTTP ${res.status}` };
	const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
	if (!contentType.startsWith('image/')) {
		return { ok: false, reason: `not an image (${contentType || 'no content type'})` };
	}
	const etag = (res.headers.get('etag') ?? '').replace(/^W\//, '').replace(/"/g, '');
	if (etag === GIPHY_MISSING_ETAG || MISSING_HEADERS.some((h) => res.headers.has(h))) {
		return { ok: false, reason: "GIPHY's stand-in for a missing GIF" };
	}
	const length = Number(res.headers.get('content-length'));
	return { ok: true, contentType, bytes: Number.isFinite(length) && length > 0 ? length : null };
}

/**
 * Check many URLs, a few at a time, in order.
 * @param {string[]} urls
 * @param {{ concurrency?: number, fetchImpl?: typeof fetch, onResult?: (url: string, r: CheckResult) => void }} [o]
 * @returns {Promise<Map<string, CheckResult>>}
 */
export async function checkAll(urls, { concurrency = 8, fetchImpl, onResult } = {}) {
	/** @type {Map<string, CheckResult>} */
	const results = new Map();
	let next = 0;
	const worker = async () => {
		while (next < urls.length) {
			const url = urls[next++];
			const r = await checkUrl(url, { fetchImpl });
			results.set(url, r);
			onResult?.(url, r);
		}
	};
	await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
	return results;
}
