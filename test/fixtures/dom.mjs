/**
 * Just enough of the DOM for the GIFs page to render in Node: elements, text,
 * a shadow root, clicks and a custom-element registry. Markup given to
 * innerHTML is kept unparsed as one raw-HTML node, so a test can tell text the
 * page rendered as text from text it handed to the HTML parser.
 */

export class Text {
	constructor(/** @type {string} */ data) {
		this.data = data;
	}
}

export class RawHtml {
	constructor(/** @type {string} */ markup) {
		this.markup = markup;
	}
}

class Parent {
	/** @type {(Element | Text | RawHtml)[]} */
	childNodes = [];

	/** @param {...(Element | Text | RawHtml | string)} nodes */
	append(...nodes) {
		for (const n of nodes) this.childNodes.push(typeof n === 'string' ? new Text(n) : n);
	}

	/** @param {...(Element | Text | RawHtml | string)} nodes */
	replaceChildren(...nodes) {
		this.childNodes = [];
		this.append(...nodes);
	}

	set innerHTML(/** @type {string} */ markup) {
		this.replaceChildren(new RawHtml(markup));
	}

	querySelector() {
		return null;
	}
}

export class Element extends Parent {
	/** @type {Map<string, string>} */
	attributes = new Map();
	/** @type {{ type: string, fn: (e: { target: Element }) => void }[]} */
	listeners = [];

	constructor(/** @type {string} */ tag) {
		super();
		this.tagName = tag.toUpperCase();
	}

	setAttribute(/** @type {string} */ k, /** @type {string} */ v) {
		this.attributes.set(k, String(v));
	}

	getAttribute(/** @type {string} */ k) {
		return this.attributes.get(k) ?? null;
	}

	/** @param {string} type @param {(e: { target: Element }) => void} fn */
	addEventListener(type, fn) {
		this.listeners.push({ type, fn });
	}

	click() {
		for (const l of this.listeners) if (l.type === 'click') l.fn({ target: this });
	}

	focus() {}

	showModal() {}

	get content() {
		return { firstElementChild: this };
	}
}

class HTMLElement extends Element {
	/** @type {Parent | null} */
	shadowRoot = null;

	constructor() {
		super('custom');
	}

	attachShadow() {
		this.shadowRoot = new Parent();
		return this.shadowRoot;
	}
}

/** Puts the shim on globalThis, for a module that expects a browser. */
export function installDom() {
	/** @type {Map<string, typeof HTMLElement>} */
	const registry = new Map();
	Object.assign(globalThis, {
		HTMLElement,
		document: { createElement: (/** @type {string} */ tag) => new Element(tag) },
		customElements: {
			get: (/** @type {string} */ tag) => registry.get(tag),
			define: (/** @type {string} */ tag, /** @type {typeof HTMLElement} */ c) =>
				registry.set(tag, c)
		}
	});
}

/** Every node under a root, depth first. @param {Parent} root */
export function* walk(root) {
	for (const n of root.childNodes) {
		yield n;
		if (n instanceof Element) yield* walk(n);
	}
}
