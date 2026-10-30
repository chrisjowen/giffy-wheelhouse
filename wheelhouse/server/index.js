/**
 * Giffy's Wheelhouse plugin: its GIFs page, a menu page that browses the
 * catalogue by occasion. The page's one provider hands the catalogue to the
 * page's element (`<giffy-wheelhouse-gifs>`, in ../ui/index.js). The
 * catalogue is the plugin's own data, read from its own files when Wheelhouse
 * loads it; nothing here looks a GIF up, and nothing reads the fleet.
 *
 * GIFs reach Firstmate's chat through Giffy's MCP server (../../mcp/server.mjs),
 * which Firstmate's agent runs itself once it is registered, and which follows
 * this plugin's switch in Settings → Plugins (see the README).
 *
 * @typedef {import('../../lib/catalogue.mjs').Gif} Gif
 */
import { gifsFor, loadCatalogue, loadOccasions } from '../../lib/catalogue.mjs';

/** What the page shows: each occasion with its GIFs, and the no-GIF rule. Plain JSON. */
export function pageData(occasions = loadOccasions(), catalogue = loadCatalogue()) {
	const live = catalogue.gifs.filter((g) => !g.dead);
	const checked = live.map((g) => g.checked).sort();
	return {
		total: live.length,
		checkedFrom: checked[0] ?? null,
		checkedTo: checked.at(-1) ?? null,
		occasions: occasions.occasions.map((o) => ({
			id: o.id,
			title: o.title,
			when: o.when,
			gifs: gifsFor(catalogue, o.id).map((g) => ({
				id: g.id,
				url: g.url,
				alt: g.alt,
				checked: g.checked,
				...(g.page ? { page: g.page } : {})
			}))
		})),
		noGif: { title: occasions.noGif.title, when: occasions.noGif.when }
	};
}

export default {
	providers: [
		{
			id: 'catalogue',
			scope: 'fleet',
			ttlMs: 5 * 60_000,
			async fetch() {
				return {
					available: true,
					value: pageData(),
					source: 'the Giffy catalogue',
					observedAt: null
				};
			}
		}
	],
	contributions: [
		{
			slot: 'nav.page',
			id: 'gifs',
			title: 'GIFs',
			provider: 'catalogue',
			render: { element: 'giffy-wheelhouse-gifs' }
		}
	],
	services: [],
	mcpServers: []
};
