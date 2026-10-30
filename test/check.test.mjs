import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { GIPHY_MISSING_ETAG, checkAll, checkUrl } from '../lib/check.mjs';

/** @type {import('node:http').Server} */
let server;
let base = '';
/** @type {string[]} */
const methods = [];

before(async () => {
	server = createServer((req, res) => {
		methods.push(`${req.method} ${req.url}`);
		switch (req.url) {
			case '/ok.gif':
				res.writeHead(200, { 'content-type': 'image/gif', 'content-length': '42' });
				return res.end();
			case '/page.html':
				res.writeHead(200, { 'content-type': 'text/html' });
				return res.end();
			case '/gone.gif':
				res.writeHead(404, { 'content-type': 'text/plain' });
				return res.end();
			case '/moved.gif':
				res.writeHead(302, { location: '/ok.gif' });
				return res.end();
			case '/missing-marker.gif':
				res.writeHead(200, { 'content-type': 'image/gif', 'x-retry-not-found-metric': '1' });
				return res.end();
			case '/missing-etag.gif':
				res.writeHead(200, { 'content-type': 'image/gif', etag: `"${GIPHY_MISSING_ETAG}"` });
				return res.end();
			case '/no-head.gif':
				if (req.method === 'HEAD') {
					res.writeHead(405);
					return res.end();
				}
				res.writeHead(200, { 'content-type': 'image/gif' });
				return res.end('GIF89a');
			default:
				res.writeHead(500);
				return res.end();
		}
	});
	await new Promise((r) => server.listen(0, '127.0.0.1', () => r(null)));
	const address = /** @type {import('node:net').AddressInfo} */ (server.address());
	base = `http://127.0.0.1:${address.port}`;
});

after(() => new Promise((r) => server.close(() => r(null))));

// The real checker only takes https; the local server is http, so tests pass
// an https URL and a fetch that sends it to the local server instead.
const local = /** @type {typeof fetch} */ (
	(url, init) => fetch(String(url).replace('https://gifs.test', base), init)
);
const check = (/** @type {string} */ path) =>
	checkUrl(`https://gifs.test${path}`, { fetchImpl: local });

test('a 200 image answer counts as loading', async () => {
	assert.deepEqual(await check('/ok.gif'), { ok: true, contentType: 'image/gif', bytes: 42 });
});

test('an answer that is not an image does not', async () => {
	const r = await check('/page.html');
	assert.equal(r.ok, false);
	assert.match(/** @type {any} */ (r).reason, /not an image/);
});

test('a 404 does not', async () => {
	assert.deepEqual(await check('/gone.gif'), { ok: false, reason: 'HTTP 404' });
});

test('a redirect does not, even to an image', async () => {
	assert.deepEqual(await check('/moved.gif'), { ok: false, reason: 'HTTP 302' });
});

test("GIPHY's stand-in for a missing GIF does not", async () => {
	for (const path of ['/missing-marker.gif', '/missing-etag.gif']) {
		const r = await check(path);
		assert.equal(r.ok, false, path);
		assert.match(/** @type {any} */ (r).reason, /stand-in/);
	}
});

test('a server that refuses HEAD gets a GET', async () => {
	methods.length = 0;
	assert.equal((await check('/no-head.gif')).ok, true);
	assert.deepEqual(methods, ['HEAD /no-head.gif', 'GET /no-head.gif']);
});

test('only https URLs count', async () => {
	assert.deepEqual(await checkUrl(`${base}/ok.gif`), { ok: false, reason: 'not https' });
	assert.deepEqual(await checkUrl('not a url'), { ok: false, reason: 'not a URL' });
});

test('no answer at all does not count', async () => {
	const refuse = /** @type {typeof fetch} */ (() => Promise.reject(new Error('refused')));
	const r = await checkUrl('https://gifs.test/ok.gif', { fetchImpl: refuse });
	assert.deepEqual(r, { ok: false, reason: 'no answer (refused)' });
});

test('checkAll() checks each URL', async () => {
	const urls = ['/ok.gif', '/gone.gif', '/page.html'].map((p) => `https://gifs.test${p}`);
	const results = await checkAll(urls, { fetchImpl: local, concurrency: 2 });
	assert.deepEqual(
		urls.map((u) => results.get(u)?.ok),
		[true, false, false]
	);
});
