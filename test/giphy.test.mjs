import assert from 'node:assert/strict';
import { test } from 'node:test';
import { altText, mediaUrl, parseSearchPage, searchUrl, tidyAlt } from '../lib/giphy.mjs';

const media = (/** @type {string} */ id, /** @type {string} */ file) =>
	`https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjEx/${id}/${file}`;

/** A search page shaped like GIPHY's: the results inside its streamed data. */
function page(/** @type {object[]} */ gifs) {
	const data = `1:{"results":[${gifs.map((g) => JSON.stringify({ type: 'gif', ...g })).join(',')}]}`;
	// A GIF split across two chunks, as GIPHY's stream does.
	const half = Math.floor(data.length / 2);
	return `<html><script>self.__next_f.push([1,${JSON.stringify(data.slice(0, half))}])</script>
		<script>self.__next_f.push([1,${JSON.stringify(data.slice(half))}])</script></html>`;
}

const nailed = {
	id: 'abc123',
	title: 'Nailed It GIF by GIPHY IRL',
	alt_text: '',
	rating: 'g',
	url: 'https://giphy.com/gifs/nailed-it-abc123',
	tags: ['success'],
	is_sticker: 0,
	images: {
		original: { url: media('abc123', 'giphy.gif'), size: '900000', width: '480' },
		downsized: { url: media('abc123', 'giphy-downsized.gif'), size: '400000', width: '300' },
		original_mp4: { mp4: media('abc123', 'giphy.mp4') }
	}
};

test('parseSearchPage() reads the GIFs out of the page', () => {
	const big = {
		...nailed,
		id: 'big9',
		title: 'Movie gif. Kronk looks at us',
		alt_text: 'Kronk looks at us and nods.',
		rating: 'pg',
		is_sticker: 1,
		images: {
			original: { url: media('big9', 'giphy.gif'), size: '9000000' },
			downsized: { url: media('big9', 'giphy-downsized.gif'), size: '1500000' }
		}
	};
	const found = parseSearchPage(page([nailed, big, nailed]));
	assert.equal(found.length, 2);
	assert.deepEqual(
		found.map((c) => [c.id, c.rating, c.sticker]),
		[
			['abc123', 'g', false],
			['big9', 'pg', true]
		]
	);
	assert.equal(found[0].renditions.original.bytes, 900000);
	assert.equal(found[0].renditions.original_mp4, undefined);
	assert.equal(mediaUrl(found[0]), 'https://media.giphy.com/media/abc123/giphy.gif');
	assert.equal(mediaUrl(found[1]), 'https://media.giphy.com/media/big9/giphy-downsized.gif');
	assert.equal(altText(found[0]), 'Nailed It');
	assert.equal(altText(found[1]), 'Kronk looks at us and nods.');
});

test('a page with nothing in it has no GIFs', () => {
	assert.deepEqual(parseSearchPage('<html></html>'), []);
});

test('mediaUrl() refuses a GIF too big for the chat', () => {
	const huge = parseSearchPage(
		page([
			{
				...nailed,
				images: {
					original: { url: media('abc123', 'giphy.gif'), size: '9000000' },
					downsized: { url: media('abc123', 'giphy-downsized.gif'), size: '5000000' }
				}
			}
		])
	)[0];
	assert.equal(mediaUrl(huge), null);
});

test('tidyAlt() tidies GIPHY titles and descriptions', () => {
	assert.equal(tidyAlt('Movie gif. Kronk looks at us.'), 'Kronk looks at us.');
	assert.equal(tidyAlt('nerd   yes'), 'Nerd yes');
	assert.equal(tidyAlt('GIF'), '');
	const long = tidyAlt(`A ${'very '.repeat(40)}long description`);
	assert.ok(long.length <= 120 && long.endsWith('…'), long);
});

test('searchUrl() makes GIPHY search addresses', () => {
	assert.equal(searchUrl('Ship It'), 'https://giphy.com/search/ship-it');
	assert.equal(searchUrl("that's a wrap"), "https://giphy.com/search/that's-a-wrap");
});
