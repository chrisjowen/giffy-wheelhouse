import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	MAX_GIFS,
	Picker,
	gifsFor,
	loadCatalogue,
	loadOccasions,
	markdownImage,
	problems,
	resolveOccasion
} from '../lib/catalogue.mjs';

const occasions = loadOccasions();
const catalogue = loadCatalogue();

test('the catalogue has no problems and at most 500 GIFs', () => {
	assert.deepEqual(problems(occasions, catalogue), []);
	assert.ok(catalogue.gifs.length <= MAX_GIFS);
	assert.ok(catalogue.gifs.length >= 400, `only ${catalogue.gifs.length} GIFs`);
});

test('every occasion has GIFs to offer, and the no-GIF rule has none', () => {
	for (const o of occasions.occasions) {
		assert.ok(gifsFor(catalogue, o.id).length >= 20, `${o.id} has too few GIFs`);
	}
	assert.equal(gifsFor(catalogue, occasions.noGif.id).length, 0);
});

test('the occasions cover what the captain asked for', () => {
	const ids = occasions.occasions.map((o) => o.id);
	for (const id of [
		'merged',
		'release',
		'preview',
		'pr-ready',
		'tests-green',
		'bug-fixed',
		'welcome-back',
		'waiting-on-you',
		'working',
		'celebration',
		'good-morning',
		'good-night'
	])
		assert.ok(ids.includes(id), `no ${id} occasion`);
});

test('every GIF says when it was checked', () => {
	for (const g of catalogue.gifs) assert.match(g.checked, /^\d{4}-\d{2}-\d{2}$/);
});

test('problems() finds what is wrong', () => {
	const bad = {
		gifs: [
			{ id: 'a', url: 'https://example.com/a.gif', alt: '', occasions: ['nope'], checked: 'today' },
			{
				id: 'a',
				url: 'https://media.giphy.com/media/b/giphy.gif',
				alt: 'x',
				occasions: ['merged'],
				checked: '2026-01-01'
			}
		]
	};
	const found = problems(occasions, bad).join('\n');
	assert.match(found, /not a direct GIPHY media URL/);
	assert.match(found, /no alt text/);
	assert.match(found, /unknown occasion nope/);
	assert.match(found, /no checked date/);
	assert.match(found, /listed twice/);
	assert.match(found, /another GIF's URL/);
});

test('resolveOccasion() takes ids, titles, aliases and phrases', () => {
	const id = (/** @type {string} */ name) => {
		const r = resolveOccasion(occasions, name);
		return r === null ? null : r.kind === 'no-gif' ? 'NO GIF' : r.occasion.id;
	};
	assert.equal(id('merged'), 'merged');
	assert.equal(id('Landed'), 'merged');
	assert.equal(id('PR merged'), 'merged');
	assert.equal(id('Preview ready'), 'preview');
	assert.equal(id('ship it'), 'release');
	assert.equal(id('CI green'), 'tests-green');
	assert.equal(id('Good night'), 'good-night');
	assert.equal(id('tests failed'), 'NO GIF');
	assert.equal(id('bad news'), 'NO GIF');
	assert.equal(id('the release failed'), 'NO GIF');
	assert.equal(id('blocked'), 'NO GIF');
	assert.equal(id('quantum entanglement'), null);
	assert.equal(id(''), null);
});

test('Picker deals every GIF of an occasion once before repeating', () => {
	const picker = new Picker(catalogue, () => 0.5);
	const n = gifsFor(catalogue, 'merged').length;
	const seen = new Set();
	for (let i = 0; i < n; i++) seen.add(picker.pick('merged')?.id);
	assert.equal(seen.size, n);
	assert.ok(picker.pick('merged'));
	assert.equal(picker.pick('bad-news'), null);
});

test('Picker never deals a GIF marked dead', () => {
	const gifs = [
		{
			id: 'a',
			url: 'u',
			alt: 'A',
			occasions: ['merged'],
			checked: '2026-01-01',
			dead: '2026-02-01'
		},
		{ id: 'b', url: 'u2', alt: 'B', occasions: ['merged'], checked: '2026-01-01' }
	];
	const picker = new Picker({ gifs });
	for (let i = 0; i < 5; i++) assert.equal(picker.pick('merged')?.id, 'b');
});

test('markdownImage() keeps the alt text from breaking the Markdown', () => {
	assert.equal(
		markdownImage({
			id: 'x',
			url: 'https://m/x.gif',
			alt: 'Ship [it]',
			occasions: [],
			checked: ''
		}),
		'![Ship it](https://m/x.gif)'
	);
	assert.equal(
		markdownImage({ id: 'x', url: 'https://m/x.gif', alt: ' ', occasions: [], checked: '' }),
		'![GIF](https://m/x.gif)'
	);
});
