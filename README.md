# giffy-wheelhouse

A [Wheelhouse](https://github.com/chrisjowen/wheelhouse) plugin: a curated, pre-checked set of
GIFs for Firstmate to use for each occasion.

Giffy is a catalogue of 492 GIFs in 16 occasions (merged, released, preview ready, ready for
review, checks green, bug fixed, welcome back, waiting on you, on it, under way, celebration,
all done, thank you, high five, good morning, good night), each one checked to load. While it
is on, Firstmate puts one in every message about a merge, a release, work that landed or a
preview, and now and then one elsewhere, and never one for bad news. It never looks a GIF up:
it only hands out URLs from the catalogue, so there is no API key and no live search.

## Install

```sh
wheelhouse plugin install chrisjowen/giffy-wheelhouse
```

or **Settings → Plugins → Install plugin** with `chrisjowen/giffy-wheelhouse`. Wheelhouse
shows what it adds (a **GIFs** menu page) and restarts to load it. Nothing to build: it has no
dependencies.

## Turn it on

Giffy is off until you turn it on: **Settings → Plugins → Giffy**, the switch at the top. The
switch is the one control: Firstmate uses GIFs while it is on and stops when it is off, without
a restart. (On for any one project counts as on, since the chat belongs to no one project.)

## Connect Firstmate (once)

Firstmate gets its GIFs from Giffy's MCP server, which comes with the plugin. Register it with
Claude Code once, for your user, so every Firstmate session (and any crew session you watch in
Wheelhouse) has it:

```sh
claude mcp add --scope user giffy -- node ~/.wheelhouse/plugins/giffy-wheelhouse/mcp/server.mjs
```

(With `$WHEELHOUSE_PLUGINS_DIR` or `--plugins-dir`, use that directory instead of
`~/.wheelhouse/plugins`.) Claude Code starts its MCP servers when a session starts, so restart
Firstmate's session once to pick it up. `claude mcp list` should then show `giffy` as
connected. Another agent that speaks MCP can run the same command line, for example
`codex mcp add giffy -- node <same path>`.

Updating the plugin (`wheelhouse plugin update giffy-wheelhouse`) replaces the files in place,
so the registration keeps working, and the server reads a changed catalogue by itself.

## What Firstmate is told

The server's instructions, which the agent reads at the start of every session:

- Exactly one GIF in every message that reports a merge, a release, work that landed, or a
  preview ready for the captain to look at.
- Anywhere else, sparing: only where the occasion clearly fits, never more than one or two
  GIFs in a message.
- No GIF for bad news: a failure, red checks, an error, a blocked or failed task, a serious
  review or security finding, a rollback, lost work, an apology, or anything the captain needs
  to worry about. A message mixing good and bad news gets none either.
- Only a URL that `gif_for` gave, exactly as given. Never an invented, guessed, edited or
  borrowed one.
- The Markdown image on a line of its own, `![alt](url)`, which Wheelhouse's chat renders
  inline.
- GIFs are for chat messages only: never in a commit, pull request, issue, code, file or
  status line.
- If `gif_for` says Giffy is off, or that there is no GIF for the occasion, none.

Its two tools are read-only:

| Tool             | Takes          | Gives                                                                                                                                                |
| ---------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gif_for`        | `{ occasion }` | One GIF for the occasion: its Markdown image, URL, alt text and the day it was checked. It deals every GIF of an occasion once before repeating one. |
| `list_occasions` | nothing        | The occasions, when each fits and how many GIFs each has, the no-GIF rule, and whether Giffy is on.                                                  |

`occasion` takes an id (`merged`), a title (`Preview ready`) or a phrase (`PR merged`,
`ci green`). Anything that names bad news (`tests failed`, `blocked`, `security finding`) gets
no GIF, with the reason.

## Why an MCP server, and why this one

Wheelhouse plugins are read-only by contract: a plugin cannot write to Firstmate, message it
or change its settings, so turning the plugin on cannot by itself teach Firstmate anything.
What reaches an agent's session from outside is its MCP servers, whose instructions it reads at
the start and whose tools it can call. So Giffy ships one, and the plugin's switch is what the
server reads.

- **Over stdio, run by the agent.** The agent starts the server itself for each session, so it
  is there whenever Firstmate is, with nothing to launch or keep running. A plugin-declared MCP
  server (as docket's is) runs over HTTP on a companion service that the captain starts with
  **Launch** and that is gone after a reboot; Wheelhouse uses such servers to draw MCP apps,
  which Giffy has no need of (the GIF is already in the message, and a card under every reply
  would be noise). So the plugin declares no services and no MCP servers.
- **Following the switch.** The server reads Wheelhouse's `plugins.json` (in
  `$WHEELHOUSE_CONFIG_DIR`, else `$XDG_CONFIG_HOME/wheelhouse`, else `~/.config/wheelhouse`) on
  every call, and the plugin's record in `installed.json` beside its folder; off in either, it
  answers that there is no GIF to post. `GIFFY_ENABLED=1` or `0` overrides both, for running it
  outside Wheelhouse.
- **No lookup.** Every URL comes from `data/catalogue.json`, checked before it went in and
  re-checked by a script; the server never touches the network.

## The GIFs page

**GIFs** in Wheelhouse's menu browses the catalogue: a card per occasion with a still from one
of its GIFs, how many it has and when it fits; the no-GIF rule beside them; a card opens the
occasion's GIFs, moving (still, when the system asks for reduced motion), and a GIF opens on its
own, larger, with its description, when it was checked and a link to it on GIPHY. It follows
Wheelhouse's light and dark themes.

## The catalogue

Two data files, both plain JSON:

- `data/occasions.json`, written by hand: each occasion's `id`, `title`, `when` it fits,
  `aliases` the server accepts, and the GIPHY `search` words the harvest uses; and `noGif`, the
  bad-news rule and the words that mean it.
- `data/catalogue.json`, written by the scripts: each GIF's GIPHY `id`, its direct media `url`
  (`https://media.giphy.com/media/<id>/giphy.gif`, or GIPHY's downsized rendition when the full
  one is over 3 MB), `alt` text, `occasions`, the day it was last `checked`, and its GIPHY
  `page`. A GIF the re-check found dead but kept is marked `dead` with that day and never
  offered.

`data/rejected.json` lists GIFs taken out by hand, with why (ads, romance, an unsettling or
ominous scene); the harvest never adds them again.

| Script                              | Does                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run harvest`                   | Tops each occasion up to its share of the 500 from GIPHY's public search pages (no API key): GIFs rated G, not stickers, small enough for the chat, whose own title or description fits the occasion and says nothing gloomy. Each candidate is checked to load before it goes in. GIFs already there are kept. |
| `npm run recheck`                   | Checks every GIF again and drops those that no longer load; the rest get today's date. Exits 1 if any were dropped.                                                                                                                                                                                             |
| `npm run recheck:flag`              | The same, but marks dead GIFs instead of dropping them.                                                                                                                                                                                                                                                         |
| `node scripts/verify.mjs --dry-run` | Says what it finds and changes nothing (the weekly **Re-check GIFs** workflow runs this).                                                                                                                                                                                                                       |

A GIF loads when its URL answers HTTP 200, without a redirect, with an `image/*` content type,
and is not GIPHY's stand-in: GIPHY answers 200 with a stock "not found" GIF for an id it does
not have, so the check also refuses an answer carrying GIPHY's not-found headers or that GIF's
etag.

The GIFs themselves stay on GIPHY and belong to their owners; the catalogue only points at
them.

## Development

```sh
npm ci
npm run lint   # ESLint and Prettier
npm test       # node --test: catalogue, link checks, harvest parsing, MCP server, plugin manifest and page
```

Node 22 or later. `test/fixtures/plugin.schema.json` is a copy of Wheelhouse's
`packages/plugin-sdk/plugin.schema.json`, which the manifest is tested against.

| Path                         | What it is                                                              |
| ---------------------------- | ----------------------------------------------------------------------- |
| `.wheelhouse-plugin/`        | The manifest                                                            |
| `wheelhouse/server/index.js` | The plugin: the catalogue provider and the **GIFs** page                |
| `wheelhouse/ui/`             | The page's custom element, `<giffy-wheelhouse-gifs>`                    |
| `mcp/server.mjs`             | The MCP server Firstmate runs                                           |
| `lib/`                       | The catalogue, the on/off switch, the link check and GIPHY page parsing |
| `scripts/`                   | Harvest and re-check                                                    |

## Licence

MIT
