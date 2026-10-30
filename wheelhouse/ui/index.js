/**
 * Giffy's GIFs page as a custom element, `<giffy-wheelhouse-gifs>`.
 * Wheelhouse imports this bundle and sets the catalogue provider's value on
 * the element as `data` (see ../server/index.js). The page opens on the
 * occasions, each a card with a still from one of its GIFs; a card drills in
 * to that occasion's GIFs, and a GIF opens on its own, larger, with its
 * description. It styles itself with Wheelhouse's CSS variables, so it
 * follows the light and dark themes, and shows stills instead of moving GIFs
 * in the grid when the system asks for reduced motion.
 *
 * @typedef {{ id: string, url: string, alt: string, checked: string, page?: string }} PageGif
 * @typedef {{ id: string, title: string, when: string, gifs: PageGif[] }} PageOccasion
 * @typedef {{ total: number, checkedFrom: string | null, checkedTo: string | null,
 *   occasions: PageOccasion[], noGif: { title: string, when: string } }} PageData
 */

import { checkedLine, longDate, safeUrl, thumbnail } from './format.js';

const STYLE = `
	:host { display: block; color: var(--foreground, #14213d); font: inherit; }
	* { box-sizing: border-box; }
	h2, h3 { font-family: var(--font-display, Georgia, serif); font-weight: 600; margin: 0; line-height: 1.3; }
	p { margin: 0; }
	button { font: inherit; color: inherit; }
	:focus-visible { outline: 2px solid var(--ring, var(--sea, #1d6fa5)); outline-offset: 2px; }

	.banner {
		position: relative; overflow: hidden;
		display: flex; gap: 1.25rem; align-items: center;
		padding: 1.25rem 1.5rem 1.75rem;
		border: 1px solid var(--hair, var(--border, #e2dccd));
		border-radius: calc(var(--radius, 0.5rem) + 4px);
		background: var(--card, #fffdf7);
	}
	.banner .flag { flex: none; width: 3rem; height: 3rem; color: var(--sea, #1d6fa5); }
	.banner h2 { font-size: 1.25rem; }
	.banner .lede { margin-top: 0.25rem; color: var(--muted-foreground, #585448); max-width: 42rem; line-height: 1.55; }
	.banner .meta { margin-top: 0.5rem; font-size: 0.8125rem; color: var(--muted-foreground, #585448); }
	.banner .waves { position: absolute; left: 0; right: 0; bottom: 0; width: 100%; height: 10px; color: var(--sea, #1d6fa5); opacity: 0.35; }

	[role='listitem'] { display: flex; min-width: 0; }
	.grid { display: grid; gap: 1rem; margin-top: 1.5rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 13.5rem), 1fr)); }

	.card {
		display: flex; flex-direction: column; text-align: left; cursor: pointer;
		width: 100%; padding: 0; overflow: hidden;
		border: 1px solid var(--hair, var(--border, #e2dccd));
		border-radius: var(--radius, 0.5rem);
		background: var(--card, #fffdf7);
		transition: border-color 160ms ease-out, transform 160ms ease-out;
	}
	.card:hover { border-color: var(--sea, #1d6fa5); }
	.card:active { transform: scale(0.99); }
	.card .art { aspect-ratio: 4 / 3; width: 100%; height: auto; background: var(--muted, #f1ece0); display: block; object-fit: cover; }
	.card .body { padding: 0.75rem 0.875rem 0.875rem; display: grid; gap: 0.25rem; }
	.card h3 { font-size: 1rem; }
	.card .when { font-size: 0.8125rem; color: var(--muted-foreground, #585448); line-height: 1.45;
		display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
	.card .count { font-size: 0.75rem; color: var(--sea, #1d6fa5); margin-top: 0.125rem; }

	.nogif {
		display: flex; flex-direction: column; justify-content: center; gap: 0.5rem;
		padding: 1rem 1.125rem; min-height: 100%;
		border: 1px dashed var(--border, #d6cdb8); border-radius: var(--radius, 0.5rem);
		color: var(--muted-foreground, #585448);
	}
	.nogif svg { width: 1.75rem; height: 1.75rem; color: var(--muted-foreground, #585448); }
	.nogif h3 { color: var(--foreground, #14213d); font-size: 1rem; }
	.nogif p { font-size: 0.8125rem; line-height: 1.45; }

	.back {
		display: inline-flex; align-items: center; gap: 0.375rem; min-height: 2.75rem;
		margin-top: 1.25rem; padding: 0 0.75rem 0 0.5rem; cursor: pointer;
		border: 1px solid var(--hair, var(--border, #e2dccd)); border-radius: 999px;
		background: transparent; color: var(--sea, #1d6fa5);
	}
	.back:hover { background: var(--accent, #f1ece0); }
	.back svg { width: 1rem; height: 1rem; }
	.heading { margin-top: 1.25rem; }
	.heading h2 { font-size: 1.25rem; }
	.heading p { margin-top: 0.25rem; color: var(--muted-foreground, #585448); }

	.tile {
		display: flex; flex-direction: column; gap: 0.5rem; padding: 0; cursor: pointer; text-align: left;
		width: 100%; border: none; background: none;
	}
	.tile img {
		width: 100%; height: auto; aspect-ratio: 4 / 3; object-fit: cover; display: block;
		border-radius: var(--radius, 0.5rem); border: 1px solid var(--hair, var(--border, #e2dccd));
		background: var(--muted, #f1ece0); transition: border-color 160ms ease-out;
	}
	.tile:hover img { border-color: var(--sea, #1d6fa5); }
	.tile span { font-size: 0.8125rem; color: var(--muted-foreground, #585448); line-height: 1.4;
		display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

	dialog {
		width: min(36rem, calc(100vw - 2rem)); max-height: calc(100vh - 2rem); padding: 0; overflow: hidden;
		border: 1px solid var(--hair, var(--border, #e2dccd)); border-radius: calc(var(--radius, 0.5rem) + 4px);
		background: var(--card, #fffdf7); color: var(--foreground, #14213d);
		scrollbar-width: none;
	}
	dialog::backdrop { background: rgb(10 20 35 / 0.5); }
	dialog .big { display: block; width: 100%; height: auto; min-height: 12rem; max-height: 60vh; object-fit: contain; background: var(--muted, #f1ece0); }
	dialog .info { padding: 1rem 1.25rem 1.25rem; display: grid; gap: 0.5rem; }
	dialog .info .meta { font-size: 0.8125rem; color: var(--muted-foreground, #585448); }
	dialog .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end; margin-top: 0.5rem; }
	dialog .actions a, dialog .actions button {
		display: inline-flex; align-items: center; min-height: 2.75rem; padding: 0 1rem; cursor: pointer;
		border-radius: var(--radius, 0.5rem); text-decoration: none; font-size: 0.875rem;
	}
	dialog .actions a { color: var(--sea, #1d6fa5); border: 1px solid var(--hair, var(--border, #e2dccd)); }
	dialog .actions button { border: none; background: var(--primary, #14213d); color: var(--primary-foreground, #fffdf7); }

	@media (max-width: 30rem) {
		.banner { padding: 1rem 1rem 1.5rem; }
		.banner .flag { display: none; }
	}
	.quiet { margin-top: 1.5rem; color: var(--muted-foreground, #585448); }
	@media (prefers-reduced-motion: reduce) { .card, .tile img { transition: none; } .card:active { transform: none; } }
`;

/** A pennant on a mast, the banner's mark. */
const FLAG = `<svg class="flag" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<path d="M12 42V6" /><path d="M12 8c6-3 10 3 17 0s9 0 9 0v14s-3-3-9 0-11-3-17 0" />
	<circle cx="12" cy="5" r="1.5" /><path d="M6 42h14" /></svg>`;

/** A row of small waves along the banner's foot. */
const WAVES = `<svg class="waves" viewBox="0 0 240 10" preserveAspectRatio="none" aria-hidden="true">
	<path d="M0 6 Q 7.5 0 15 6 T 30 6 T 45 6 T 60 6 T 75 6 T 90 6 T 105 6 T 120 6 T 135 6 T 150 6 T 165 6 T 180 6 T 195 6 T 210 6 T 225 6 T 240 6" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>`;

const NO_GIF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
	<circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></svg>`;

const CHEVRON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>`;

/**
 * @param {string} tag
 * @param {Record<string, string> | null} [attrs]
 * @param {(Node | string | null | undefined)[]} [children]
 */
function h(tag, attrs, children = []) {
	const el = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs ?? {})) el.setAttribute(k, v);
	for (const c of children) if (c !== null && c !== undefined) el.append(c);
	return el;
}

/** Markup for our own fixed icons only, never plugin text. */
function icon(/** @type {string} */ markup) {
	const t = document.createElement('template');
	t.innerHTML = markup;
	return /** @type {Element} */ (t.content.firstElementChild);
}

/** A GIF image that falls back to the checked URL if a smaller rendition will not load. */
function gifImage(
	/** @type {PageGif} */ gif,
	/** @type {string} */ src,
	/** @type {string} */ className
) {
	const img = /** @type {HTMLImageElement} */ (
		h('img', {
			src,
			alt: gif.alt,
			loading: 'lazy',
			decoding: 'async',
			class: className,
			width: '200',
			height: '150'
		})
	);
	img.addEventListener(
		'error',
		() => {
			if (img.src !== gif.url) img.src = gif.url;
		},
		{ once: true }
	);
	return img;
}

class GiffyGifs extends HTMLElement {
	/** @type {PageData | null} */
	#data = null;
	/** @type {string | null} the occasion drilled into */
	#open = null;

	constructor() {
		super();
		this.attachShadow({ mode: 'open' });
	}

	/** @param {PageData} value */
	set data(value) {
		this.#data = value;
		if (this.#open && !value?.occasions?.some((o) => o.id === this.#open)) this.#open = null;
		this.render();
	}

	get data() {
		return this.#data;
	}

	connectedCallback() {
		this.render();
	}

	get #still() {
		return (
			typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
		);
	}

	/** @param {string | null} id */
	show(id) {
		this.#open = id;
		this.render();
		const focus = this.shadowRoot?.querySelector(id ? '.back' : `[data-occasion]`);
		/** @type {HTMLElement | null | undefined} */ (focus)?.focus({ preventScroll: true });
		this.scrollIntoView?.({ block: 'start', behavior: this.#still ? 'auto' : 'smooth' });
	}

	render() {
		const root = this.shadowRoot;
		if (!root) return;
		const style = h('style', null, [STYLE]);
		const d = this.#data;
		if (!d || !Array.isArray(d.occasions)) {
			root.replaceChildren(style, h('p', { class: 'quiet' }, ['Reading the catalogue…']));
			return;
		}
		const occasion = this.#open ? d.occasions.find((o) => o.id === this.#open) : null;
		root.replaceChildren(
			style,
			this.#banner(d),
			...(occasion ? this.#occasion(occasion) : this.#occasions(d))
		);
	}

	/** @param {PageData} d */
	#banner(d) {
		const n = d.occasions.length;
		return h('header', { class: 'banner' }, [
			icon(FLAG),
			h('div', null, [
				h('h2', null, [`${d.total} GIFs on board, for ${n} occasion${n === 1 ? '' : 's'}`]),
				h('p', { class: 'lede' }, [
					'Firstmate puts one in every message about a merge, a release, work that landed or a preview, ' +
						'and now and then one elsewhere, never more than two. Bad news gets none.'
				]),
				h('p', { class: 'meta' }, [checkedLine(d)])
			]),
			icon(WAVES)
		]);
	}

	/** @param {PageData} d */
	#occasions(d) {
		const cards = d.occasions.map((o) => {
			const first = o.gifs[0];
			const card = h('button', { type: 'button', class: 'card', 'data-occasion': o.id }, [
				first ? gifImage(first, thumbnail(first.url, true), 'art') : h('span', { class: 'art' }),
				h('span', { class: 'body' }, [
					h('h3', null, [o.title]),
					h('span', { class: 'when' }, [o.when]),
					h('span', { class: 'count' }, [`${o.gifs.length} GIF${o.gifs.length === 1 ? '' : 's'}`])
				])
			]);
			card.setAttribute('aria-label', `${o.title}: ${o.gifs.length} GIFs. ${o.when}`);
			card.addEventListener('click', () => this.show(o.id));
			return card;
		});
		const none = h('div', { class: 'nogif' }, [
			icon(NO_GIF),
			h('h3', null, ['Bad news gets no GIF']),
			h('p', null, [d.noGif.when])
		]);
		return [
			h('div', { class: 'grid', role: 'list', 'aria-label': 'Occasions' }, [
				...cards.map((c) => wrap(c)),
				wrap(none)
			])
		];
	}

	/** @param {PageOccasion} o */
	#occasion(o) {
		const back = h('button', { type: 'button', class: 'back' }, [icon(CHEVRON), 'All occasions']);
		back.addEventListener('click', () => this.show(null));
		const still = this.#still;
		const tiles = o.gifs.map((g) => {
			const tile = h('button', { type: 'button', class: 'tile' }, [
				gifImage(g, thumbnail(g.url, still), ''),
				h('span', { 'aria-hidden': 'true' }, [g.alt])
			]);
			tile.setAttribute('aria-label', `Open: ${g.alt}`);
			tile.addEventListener('click', () => this.#zoom(g, o));
			return wrap(tile);
		});
		return [
			back,
			h('div', { class: 'heading' }, [h('h2', null, [o.title]), h('p', null, [o.when])]),
			o.gifs.length
				? h('div', { class: 'grid', role: 'list', 'aria-label': `${o.title} GIFs` }, tiles)
				: h('p', { class: 'quiet' }, ['No GIFs here yet.'])
		];
	}

	/** One GIF, larger, in a dialog. @param {PageGif} g @param {PageOccasion} o */
	#zoom(g, o) {
		const page = safeUrl(g.page);
		const close = h('button', { type: 'button' }, ['Close']);
		const dialog = /** @type {HTMLDialogElement} */ (
			h('dialog', { 'aria-label': g.alt }, [
				gifImage(g, g.url, 'big'),
				h('div', { class: 'info' }, [
					h('p', null, [g.alt]),
					h('p', { class: 'meta' }, [`${o.title} · checked to load on ${longDate(g.checked)}`]),
					h('div', { class: 'actions' }, [
						page
							? h('a', { href: page, target: '_blank', rel: 'noreferrer' }, ['Open on GIPHY'])
							: null,
						close
					])
				])
			])
		);
		close.addEventListener('click', () => dialog.close());
		dialog.addEventListener('click', (e) => {
			if (e.target === dialog) dialog.close(); // a click on the backdrop
		});
		dialog.addEventListener('close', () => dialog.remove());
		this.shadowRoot?.append(dialog);
		dialog.showModal();
		close.focus();
	}
}

/** A grid item. */
function wrap(/** @type {Element} */ el) {
	return h('div', { role: 'listitem' }, [el]);
}

if (typeof customElements !== 'undefined' && !customElements.get('giffy-wheelhouse-gifs')) {
	customElements.define('giffy-wheelhouse-gifs', GiffyGifs);
}
