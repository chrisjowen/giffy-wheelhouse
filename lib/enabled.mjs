/**
 * Whether Giffy is on in Wheelhouse, read the way Wheelhouse reads it, so
 * the MCP server Firstmate runs follows the switch on Wheelhouse's Plugins
 * page without Wheelhouse having to tell it anything.
 *
 * - `plugins.json` in Wheelhouse's config directory (`$WHEELHOUSE_CONFIG_DIR`,
 *   else `$XDG_CONFIG_HOME/wheelhouse`, else `~/.config/wheelhouse`):
 *   `plugins["giffy-wheelhouse"]`. The plugin is off by default, so no entry,
 *   or no file, means off. GIFs go in Firstmate's chat, which belongs to no
 *   one project, so Giffy is on when it is on for every project (`enabled`)
 *   or for any one (`projects.<id>`), as Wheelhouse shows its fleet page.
 * - `installed.json` beside the plugin's install directory, when the server
 *   runs from one (`~/.wheelhouse/plugins/giffy-wheelhouse/`): a plugin turned
 *   off with `wheelhouse plugin disable` (`plugins["giffy-wheelhouse"].enabled`
 *   false there) is not loaded, so it is off too.
 *
 * `GIFFY_ENABLED=1` (or `0`) overrides both, for a server run outside
 * Wheelhouse.
 */
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './catalogue.mjs';

export const PLUGIN_ID = 'giffy-wheelhouse';

/** Wheelhouse's config directory, as Wheelhouse works it out. */
export function configDir(env = process.env) {
	if (env.WHEELHOUSE_CONFIG_DIR) return env.WHEELHOUSE_CONFIG_DIR;
	if (env.XDG_CONFIG_HOME) return path.join(env.XDG_CONFIG_HOME, 'wheelhouse');
	return path.join(os.homedir(), '.config', 'wheelhouse');
}

/** @param {string} file */
function readJson(file) {
	try {
		return JSON.parse(readFileSync(file, 'utf8'));
	} catch {
		return undefined;
	}
}

/**
 * @param {{ env?: NodeJS.ProcessEnv, pluginRoot?: string }} [o]
 * @returns {{ on: boolean, why: string }}
 */
export function giffyEnabled({ env = process.env, pluginRoot = ROOT } = {}) {
	if (env.GIFFY_ENABLED === '1') return { on: true, why: 'GIFFY_ENABLED is 1' };
	if (env.GIFFY_ENABLED === '0') return { on: false, why: 'GIFFY_ENABLED is 0' };
	if (path.basename(pluginRoot) === PLUGIN_ID) {
		const installed = readJson(path.join(path.dirname(pluginRoot), 'installed.json'));
		if (installed?.plugins?.[PLUGIN_ID]?.enabled === false)
			return { on: false, why: 'Giffy is turned off with wheelhouse plugin disable' };
	}
	const entry = readJson(path.join(configDir(env), 'plugins.json'))?.plugins?.[PLUGIN_ID];
	const projects = entry?.projects && typeof entry.projects === 'object' ? entry.projects : {};
	if (entry?.enabled === true || Object.values(projects).includes(true))
		return { on: true, why: 'Giffy is on in Wheelhouse' };
	return { on: false, why: 'Giffy is off in Wheelhouse (Settings → Plugins)' };
}
