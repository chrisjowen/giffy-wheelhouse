#!/usr/bin/env node
/**
 * Giffy's MCP server: how Firstmate (or any agent the captain runs) gets a
 * GIF for an occasion without looking one up. Its instructions carry the
 * rules for using GIFs in the chat, and its tools answer from the catalogue
 * in data/, every GIF of which was checked to load. It runs over stdio, with
 * no dependencies, started by the agent itself once it is registered:
 *
 *   claude mcp add --scope user giffy -- node ~/.wheelhouse/plugins/giffy-wheelhouse/mcp/server.mjs
 *
 * It follows Wheelhouse's switch for the plugin (lib/enabled.mjs): while
 * Giffy is off there, `gif_for` answers that there is no GIF to post.
 *
 * - `gif_for` ({ occasion }) gives one GIF for the occasion as a Markdown
 *   image, not repeating one until the occasion's whole list has been used.
 * - `list_occasions` lists the occasions, when each fits and how many GIFs
 *   each has, and the no-GIF rule.
 */
import { realpathSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import {
	CATALOGUE_FILE,
	Picker,
	gifsFor,
	loadCatalogue,
	loadOccasions,
	markdownImage,
	resolveOccasion
} from '../lib/catalogue.mjs';
import { giffyEnabled } from '../lib/enabled.mjs';

const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const NAME = 'giffy';
const VERSION = '0.1.0';

/** The rules, as the server's instructions; the agent reads them at the start of each session. */
export function instructions(/** @type {import('../lib/catalogue.mjs').Occasions} */ occasions) {
	const ids = occasions.occasions.map((o) => o.id).join(', ');
	return [
		'Giffy is a catalogue of GIFs for your chat messages to the captain, each checked beforehand to load. Use it while the captain has Giffy on in Wheelhouse; Wheelhouse renders a Markdown image in the chat.',
		'',
		'How to use GIFs:',
		'- Put exactly one GIF in every message that reports a merge, a release, work that landed, or a preview that is ready for the captain to look at.',
		'- Anywhere else, be sparing: only where the occasion clearly fits, and never more than one or two GIFs in a message.',
		'- No GIF for bad news: a failure, red checks, an error, a blocked or failed task, a serious review or security finding, a rollback, lost work, an apology, or anything the captain needs to worry about. A message that mixes good and bad news gets none either.',
		'- Use only a URL that gif_for gave you, exactly as given. Never invent, guess, edit or reuse a GIF URL from anywhere else: these are the ones checked to load.',
		'- Put the Markdown image gif_for gives you on a line of its own, at the end of the message, e.g. `![Nailed it](https://media.giphy.com/media/…/giphy.gif)`.',
		'- GIFs are for chat messages the captain reads. Never put one in a commit, a pull request, an issue, code, a file, or a status line.',
		'- If gif_for says Giffy is off, or that there is no GIF for the occasion, post none.',
		'',
		`Call gif_for with the occasion: ${ids}. list_occasions says when each fits.`
	].join('\n');
}

/** @param {import('../lib/catalogue.mjs').Occasions} occasions */
const TOOLS = (occasions) => [
	{
		name: 'gif_for',
		title: 'GIF for an occasion',
		description:
			'One pre-checked GIF for an occasion, as a Markdown image to put on its own line in a chat message to the captain. Answers with no GIF for bad news, or while Giffy is off in Wheelhouse.',
		inputSchema: {
			type: 'object',
			properties: {
				occasion: {
					type: 'string',
					description: `The occasion: ${occasions.occasions.map((o) => `${o.id} (${o.when})`).join('; ')}. "${occasions.noGif.id}" for bad news, which gets no GIF.`
				}
			},
			required: ['occasion'],
			additionalProperties: false
		},
		annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: false }
	},
	{
		name: 'list_occasions',
		title: 'List the occasions',
		description:
			'The occasions Giffy has GIFs for, when each fits and how many GIFs it has, and the no-GIF rule.',
		inputSchema: { type: 'object', properties: {}, additionalProperties: false },
		annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
	}
];

/** A tool result: one text block holding a JSON object, the same object as structured content. */
const result = (/** @type {Record<string, unknown>} */ value, isError = false) => ({
	content: [{ type: 'text', text: JSON.stringify(value) }],
	structuredContent: value,
	...(isError ? { isError: true } : {})
});

/**
 * The server's state and its answers, apart from the transport, for tests.
 * @param {{ env?: NodeJS.ProcessEnv, random?: () => number, catalogueFile?: string,
 *   occasionsFile?: string, pluginRoot?: string }} [o]
 */
export function createGiffy({
	env = process.env,
	random,
	catalogueFile = CATALOGUE_FILE,
	occasionsFile,
	pluginRoot
} = {}) {
	const occasions = loadOccasions(occasionsFile);
	let catalogue = loadCatalogue(catalogueFile);
	let mtime = statSync(catalogueFile).mtimeMs;
	let picker = new Picker(catalogue, random);

	/** Reads the catalogue again when it changed on disk (a re-check, or the plugin updated). */
	const fresh = () => {
		try {
			const now = statSync(catalogueFile).mtimeMs;
			if (now !== mtime) {
				catalogue = loadCatalogue(catalogueFile);
				mtime = now;
				picker = new Picker(catalogue, random);
			}
		} catch {
			// keep the catalogue already read
		}
		return catalogue;
	};

	/** @param {string} name @param {Record<string, unknown>} args */
	function call(name, args) {
		if (name === 'list_occasions') {
			const c = fresh();
			const state = giffyEnabled({ env, pluginRoot });
			return result({
				on: state.on,
				...(state.on ? {} : { note: `${state.why}, so post no GIF.` }),
				occasions: occasions.occasions.map((o) => ({
					occasion: o.id,
					title: o.title,
					when: o.when,
					gifs: gifsFor(c, o.id).length
				})),
				noGif: { occasion: occasions.noGif.id, when: occasions.noGif.when, rule: 'Post no GIF.' }
			});
		}
		if (name !== 'gif_for') throw new RpcError(-32602, `Unknown tool ${name}`);
		const asked = typeof args?.occasion === 'string' ? args.occasion : '';
		const match = resolveOccasion(occasions, asked);
		if (!match) {
			return result(
				{
					gif: null,
					reason: `No occasion called "${asked}". Use one of: ${occasions.occasions.map((o) => o.id).join(', ')}; or "${occasions.noGif.id}" for bad news.`
				},
				true
			);
		}
		if (match.kind === 'no-gif') {
			return result({
				occasion: match.rule.id,
				gif: null,
				reason: `No GIF for bad news: ${match.rule.when}`
			});
		}
		const state = giffyEnabled({ env, pluginRoot });
		if (!state.on)
			return result({
				occasion: match.occasion.id,
				gif: null,
				reason: `${state.why}, so post no GIF.`
			});
		fresh();
		const gif = picker.pick(match.occasion.id);
		if (!gif)
			return result({
				occasion: match.occasion.id,
				gif: null,
				reason: 'No GIF left for this occasion, so post none.'
			});
		return result({
			occasion: match.occasion.id,
			gif: { markdown: markdownImage(gif), url: gif.url, alt: gif.alt, checked: gif.checked },
			use: 'Put the markdown on a line of its own in your message to the captain, exactly as given.'
		});
	}

	/**
	 * One JSON-RPC message in, its answer out (null for a notification).
	 * @param {any} msg
	 */
	function handle(msg) {
		const { id, method, params } = msg ?? {};
		const isRequest = id !== undefined && id !== null;
		try {
			let value;
			switch (method) {
				case 'initialize': {
					const asked = params?.protocolVersion;
					value = {
						protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
						capabilities: { tools: { listChanged: false } },
						serverInfo: { name: NAME, title: 'Giffy', version: VERSION },
						instructions: instructions(occasions)
					};
					break;
				}
				case 'ping':
					value = {};
					break;
				case 'tools/list':
					value = { tools: TOOLS(occasions) };
					break;
				case 'tools/call':
					value = call(String(params?.name ?? ''), params?.arguments ?? {});
					break;
				default:
					if (!isRequest) return null; // notifications/initialized and the like
					throw new RpcError(-32601, `Method not found: ${method}`);
			}
			return isRequest ? { jsonrpc: '2.0', id, result: value } : null;
		} catch (e) {
			if (!isRequest) return null;
			const code = e instanceof RpcError ? e.code : -32603;
			return {
				jsonrpc: '2.0',
				id,
				error: { code, message: e instanceof Error ? e.message : String(e) }
			};
		}
	}

	return { handle, call, instructions: () => instructions(occasions) };
}

class RpcError extends Error {
	/** @param {number} code @param {string} message */
	constructor(code, message) {
		super(message);
		this.code = code;
	}
}

/** Serve over stdio: one JSON-RPC message per line each way. */
export function serveStdio(giffy = createGiffy(), input = process.stdin, output = process.stdout) {
	const lines = createInterface({ input, crlfDelay: Infinity });
	lines.on('line', (line) => {
		if (!line.trim()) return;
		let msg;
		try {
			msg = JSON.parse(line);
		} catch {
			output.write(
				`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`
			);
			return;
		}
		for (const m of Array.isArray(msg) ? msg : [msg]) {
			const answer = giffy.handle(m);
			if (answer) output.write(`${JSON.stringify(answer)}\n`);
		}
	});
	return lines;
}

/** Whether this file is the one node was asked to run (through any symlink). */
const isMain = () => {
	try {
		return import.meta.url === pathToFileURL(realpathSync(process.argv[1] ?? '')).href;
	} catch {
		return false;
	}
};

if (isMain()) serveStdio();
