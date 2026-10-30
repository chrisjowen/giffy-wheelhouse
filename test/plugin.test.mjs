import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import plugin from '../wheelhouse/server/index.js';
import { checkedLine, longDate, safeUrl, thumbnail } from '../wheelhouse/ui/format.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(
	readFileSync(path.join(root, '.wheelhouse-plugin', 'plugin.json'), 'utf8')
);
// Wheelhouse's plugin.schema.json, copied from packages/plugin-sdk in chrisjowen/wheelhouse.
const schema = JSON.parse(
	readFileSync(path.join(root, 'test', 'fixtures', 'plugin.schema.json'), 'utf8')
);

test("the manifest is valid under Wheelhouse's schema", () => {
	const ajv = new Ajv2020({ strict: false });
	const validate = ajv.compile(schema);
	assert.ok(validate(manifest), JSON.stringify(validate.errors));
	assert.equal(manifest.name, 'giffy-wheelhouse');
	assert.equal(manifest.wheelhouse.enabledByDefault, false);
	for (const entry of [manifest.wheelhouse.server, manifest.wheelhouse.ui])
		assert.ok(existsSync(path.join(root, entry)), entry);
});

test('the server entry contributes exactly what the manifest lists', () => {
	assert.deepEqual(
		plugin.contributions.map((c) => ({ id: c.id, slot: c.slot })),
		manifest.wheelhouse.contributions
	);
	assert.deepEqual(plugin.services, manifest.wheelhouse.services);
	assert.deepEqual(plugin.mcpServers, manifest.wheelhouse.mcpServers);
	for (const c of plugin.contributions) {
		assert.ok(
			plugin.providers.some((p) => p.id === c.provider),
			`${c.id} has its provider`
		);
		assert.ok(
			c.render.element.startsWith(`${manifest.name}-`),
			'an element tag starts with the plugin id'
		);
	}
});

test('the page element is defined under the tag the contribution names', () => {
	const ui = readFileSync(path.join(root, manifest.wheelhouse.ui), 'utf8');
	assert.match(ui, /customElements\.define\('giffy-wheelhouse-gifs'/);
	// Only the element's own icon markup goes through innerHTML; plugin text is textContent.
	assert.deepEqual(ui.match(/innerHTML\s*=\s*[\w.]+/g), ['innerHTML = markup']);
});

test('the catalogue provider gives the page every occasion and GIF, small enough for Wheelhouse', async () => {
	const r = await plugin.providers[0].fetch(/** @type {any} */ ({}));
	assert.equal(r.available, true);
	const v = /** @type {any} */ (r).value;
	assert.ok(JSON.stringify(v).length < 256 * 1024, 'under Wheelhouse’s 256 KiB value limit');
	assert.equal(
		v.total,
		v.occasions.reduce((/** @type {number} */ n, /** @type {any} */ o) => n + o.gifs.length, 0)
	);
	assert.ok(v.occasions.every((/** @type {any} */ o) => o.title && o.when && o.gifs.length));
	assert.match(v.noGif.when, /failure/);
	assert.match(v.checkedTo, /^\d{4}-\d{2}-\d{2}$/);
});

test('the page shows smaller GIPHY renditions in its grid', () => {
	const url = 'https://media.giphy.com/media/abc123/giphy.gif';
	assert.equal(thumbnail(url, false), 'https://media.giphy.com/media/abc123/200w.gif');
	assert.equal(thumbnail(url, true), 'https://media.giphy.com/media/abc123/200w_s.gif');
	assert.equal(thumbnail('https://example.com/a.gif', true), 'https://example.com/a.gif');
});

test('the page keeps only http(s) links', () => {
	assert.equal(safeUrl('https://giphy.com/gifs/x'), 'https://giphy.com/gifs/x');
	assert.equal(safeUrl('javascript:alert(1)'), null);
	assert.equal(safeUrl(undefined), null);
});

test('the page says when the GIFs were checked, in words', () => {
	assert.match(longDate('2026-10-30'), /30.*October.*2026|October.*30.*2026/);
	assert.equal(longDate('soon'), '');
	const d = /** @type {any} */ ({ checkedFrom: '2026-10-30', checkedTo: '2026-10-30' });
	assert.match(checkedLine(d), /^Every one checked to load on /);
	assert.match(checkedLine({ ...d, checkedFrom: '2026-09-01' }), /between/);
	assert.equal(checkedLine({ ...d, checkedTo: null }), '');
});
