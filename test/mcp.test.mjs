import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { configDir, giffyEnabled } from '../lib/enabled.mjs';
import { loadCatalogue } from '../lib/catalogue.mjs';
import { createGiffy } from '../mcp/server.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(here, '..', 'mcp', 'server.mjs');
const temp = mkdtempSync(path.join(os.tmpdir(), 'giffy-test-'));
after(() => rmSync(temp, { recursive: true, force: true }));

/** A Wheelhouse config directory with Giffy's switch as given (undefined: no entry). */
function config(/** @type {boolean | undefined} */ enabled) {
	const dir = mkdtempSync(path.join(temp, 'config-'));
	const plugins = enabled === undefined ? {} : { 'giffy-wheelhouse': { enabled } };
	writeFileSync(path.join(dir, 'plugins.json'), JSON.stringify({ plugins }));
	return dir;
}

const env = (/** @type {boolean | undefined} */ enabled) => ({
	WHEELHOUSE_CONFIG_DIR: config(enabled)
});

/** @param {ReturnType<typeof createGiffy>} giffy @param {string} occasion */
const gifFor = (giffy, occasion) => giffy.call('gif_for', { occasion }).structuredContent;

test('the switch is read from plugins.json, and is off by default', () => {
	assert.equal(giffyEnabled({ env: env(true) }).on, true);
	assert.equal(giffyEnabled({ env: env(false) }).on, false);
	assert.equal(giffyEnabled({ env: env(undefined) }).on, false);
	assert.equal(giffyEnabled({ env: { WHEELHOUSE_CONFIG_DIR: path.join(temp, 'none') } }).on, false);
	assert.equal(giffyEnabled({ env: { ...env(false), GIFFY_ENABLED: '1' } }).on, true);
	assert.equal(giffyEnabled({ env: { ...env(true), GIFFY_ENABLED: '0' } }).on, false);
});

test('on for any one project counts as on, as for Wheelhouse fleet pages', () => {
	const dir = mkdtempSync(path.join(temp, 'config-'));
	const write = (/** @type {object} */ entry) =>
		writeFileSync(
			path.join(dir, 'plugins.json'),
			JSON.stringify({ plugins: { 'giffy-wheelhouse': entry } })
		);
	write({ projects: { wheelhouse: true } });
	assert.equal(giffyEnabled({ env: { WHEELHOUSE_CONFIG_DIR: dir } }).on, true);
	write({ enabled: false, projects: { wheelhouse: false } });
	assert.equal(giffyEnabled({ env: { WHEELHOUSE_CONFIG_DIR: dir } }).on, false);
});

test("Wheelhouse's config directory is found as Wheelhouse finds it", () => {
	assert.equal(configDir({ WHEELHOUSE_CONFIG_DIR: '/a' }), '/a');
	assert.equal(configDir({ XDG_CONFIG_HOME: '/x' }), path.join('/x', 'wheelhouse'));
	assert.equal(configDir({}), path.join(os.homedir(), '.config', 'wheelhouse'));
});

test('a plugin turned off with wheelhouse plugin disable is off', () => {
	const plugins = path.join(temp, 'plugins');
	const root = path.join(plugins, 'giffy-wheelhouse');
	mkdirSync(root, { recursive: true });
	const record = (/** @type {boolean} */ enabled) =>
		writeFileSync(
			path.join(plugins, 'installed.json'),
			JSON.stringify({
				schema: 'wheelhouse-installed-plugins.v1',
				plugins: { 'giffy-wheelhouse': { enabled } }
			})
		);
	record(false);
	assert.equal(giffyEnabled({ env: env(true), pluginRoot: root }).on, false);
	record(true);
	assert.equal(giffyEnabled({ env: env(true), pluginRoot: root }).on, true);
});

test('gif_for gives a checked GIF from the catalogue as a Markdown image', () => {
	const giffy = createGiffy({ env: env(true) });
	const urls = new Set(loadCatalogue().gifs.map((g) => g.url));
	const r = /** @type {any} */ (gifFor(giffy, 'merged'));
	assert.equal(r.occasion, 'merged');
	assert.ok(urls.has(r.gif.url), 'a URL from the catalogue');
	assert.equal(r.gif.markdown, `![${r.gif.alt}](${r.gif.url})`);
	assert.match(r.gif.checked, /^\d{4}-\d{2}-\d{2}$/);
});

test('gif_for gives no GIF for bad news', () => {
	const giffy = createGiffy({ env: env(true) });
	for (const occasion of ['bad-news', 'tests failed', 'blocked', 'security finding']) {
		const r = /** @type {any} */ (gifFor(giffy, occasion));
		assert.equal(r.gif, null, occasion);
		assert.match(r.reason, /No GIF for bad news/);
	}
});

test('gif_for gives no GIF while Giffy is off', () => {
	const r = /** @type {any} */ (gifFor(createGiffy({ env: env(false) }), 'release'));
	assert.equal(r.gif, null);
	assert.match(r.reason, /off in Wheelhouse.*post no GIF/);
});

test('gif_for says which occasions there are when it does not know one', () => {
	const r = createGiffy({ env: env(true) }).call('gif_for', { occasion: 'zebra crossing' });
	assert.equal(r.isError, true);
	assert.match(/** @type {any} */ (r.structuredContent).reason, /Use one of: merged, release/);
});

test('list_occasions lists each occasion with its count, and the no-GIF rule', () => {
	const r = /** @type {any} */ (
		createGiffy({ env: env(true) }).call('list_occasions', {}).structuredContent
	);
	assert.equal(r.on, true);
	assert.ok(r.occasions.length >= 12);
	assert.ok(r.occasions.every((/** @type {any} */ o) => o.gifs > 0 && o.when));
	assert.equal(r.noGif.occasion, 'bad-news');
});

test('the instructions carry the rules for using GIFs', () => {
	const text = createGiffy({ env: env(true) }).instructions();
	assert.match(text, /exactly one GIF in every message that reports a merge, a release/);
	assert.match(text, /work that landed, or a preview/);
	assert.match(text, /never more than one or two GIFs in a message/);
	assert.match(text, /No GIF for bad news/);
	assert.match(text, /Never invent, guess, edit/);
	assert.match(text, /Never put one in a commit, a pull request/);
});

/** Talk to the server as an agent does: one JSON-RPC message per line over stdio. */
async function session(/** @type {object[]} */ messages, /** @type {NodeJS.ProcessEnv} */ extra) {
	const child = spawn(process.execPath, [SERVER], {
		env: { ...process.env, GIFFY_ENABLED: '', ...extra },
		stdio: ['pipe', 'pipe', 'inherit']
	});
	const lines = [];
	let buffer = '';
	const want = messages.filter((m) => 'id' in m).length;
	const done = new Promise((resolve) => {
		child.stdout.on('data', (chunk) => {
			buffer += chunk;
			let at;
			while ((at = buffer.indexOf('\n')) >= 0) {
				lines.push(JSON.parse(buffer.slice(0, at)));
				buffer = buffer.slice(at + 1);
				if (lines.length === want) resolve(null);
			}
		});
	});
	for (const m of messages) child.stdin.write(`${JSON.stringify(m)}\n`);
	await done;
	child.kill();
	return lines;
}

test('the server speaks MCP over stdio', async () => {
	const [init, list, call, missing] = await session(
		[
			{
				jsonrpc: '2.0',
				id: 1,
				method: 'initialize',
				params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't' } }
			},
			{ jsonrpc: '2.0', method: 'notifications/initialized' },
			{ jsonrpc: '2.0', id: 2, method: 'tools/list' },
			{
				jsonrpc: '2.0',
				id: 3,
				method: 'tools/call',
				params: { name: 'gif_for', arguments: { occasion: 'preview ready' } }
			},
			{ jsonrpc: '2.0', id: 4, method: 'resources/list' }
		],
		env(true)
	);
	assert.equal(init.result.protocolVersion, '2025-06-18');
	assert.equal(init.result.serverInfo.name, 'giffy');
	assert.match(init.result.instructions, /No GIF for bad news/);
	assert.deepEqual(
		list.result.tools.map((/** @type {any} */ t) => [t.name, t.annotations.readOnlyHint]),
		[
			['gif_for', true],
			['list_occasions', true]
		]
	);
	const value = JSON.parse(call.result.content[0].text);
	assert.equal(value.occasion, 'preview');
	assert.match(
		value.gif.markdown,
		/^!\[.+\]\(https:\/\/media\.giphy\.com\/media\/\w+\/[\w-]+\.gif\)$/
	);
	assert.deepEqual(call.result.structuredContent, value);
	assert.equal(missing.error.code, -32601);
});
