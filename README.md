A self-contained journaling and study-journal system for [Obsidian](https://obsidian.md).
Daily and monthly diary entries, user-defined journals (subjects, projects,
recipes — whatever you keep), a tracker registry that spans both, and native
charts, calendars, tables and dashboards drawn by the plugin itself.

It replaces Templater, Meta Bind, Tracker, Tasks and Dataview for this workflow.
[Bases](https://help.obsidian.md/bases) is still needed for the standalone
`.base` files.

## Install

Download `main.js`, `manifest.json`, `styles.css`, and `assets` from a
[release](../../releases) and put them in
`<vault>/.obsidian/plugins/almanac/`. Enable it in **Settings → Community
plugins**, then run **Almanac: Maintenance: set up / repair vault** to scaffold the folders
and dashboards.

## Build from source

```bash
npm install
npm test          # 2,550 tests
npm run package   # -> dist/almanac/, ready to copy into a vault
```

`npm run dev` watches. `./build.sh` is a thin wrapper that installs
dependencies first if they are missing.

## What it does

- **Diary** — daily and monthly entries, a calendar with heat map and special
  events, an entry navigator, week/month/quarter/year dashboards, full-text
  search with date, tag and tracker filters, on-this-day and a timeline.
- **Journals** — define your own journals with their own levels and note types.
  A built-in Study journal (subjects → topics → lessons and practice) ships as
  an optional preset.
- **Trackers** — define one once and it is synced into the templates and
  `Diary.base`. Steppers, scales, times, dates, dropdowns, habit chips. Any
  tracker can be added to a single entry on the day.
- **Charts** — line, bar, calendar heat map, scatter, streak and summary, drawn
  natively from your own frontmatter. Per-note chart sections on dashboards and
  journal index notes.
- **Quick capture** straight into any entry that can hold one, review queues, recall decks,
  attachments and task rollups.

## Documentation

- [Reference](docs/reference.md) — every widget directive, tracker type,
  journal concept and chart option, plus the project layout.
- [What it replaces](docs/what-it-replaces.md) — the plugins this took over
  from, and what each one used to do.
- [Changelog](CHANGELOG.md) — reader-facing release notes.
- [Dev log](docs/dev-log.md) — every release with its reasoning.

## Contributing

Issues and pull requests are welcome. The test suite is the contract: `npm test`
must pass, `npm run typecheck` and `npx eslint src test` must be clean. Many
tests assert *why* something is written the way it is — if one fails, read its
comment before changing it.

Contributions come with licensing terms of their own — see
[CONTRIBUTING.md](./CONTRIBUTING.md). The short version: you keep your
copyright, and your work is published under the AGPL-3.0 like everything else.

## License

Copyright © 2026 AhryMX <contact@ahrymx.dev>

Licensed under the **[GNU Affero General Public License v3.0 or later](./LICENSE)**,
with attribution and naming terms under its section 7.

You are free to use, study, modify, redistribute and sell this software. In
return you must preserve the copyright and licence notices, keep the
attribution *"Almanac, originally developed by AhryMX"*, mark a modified
version as different from the original, license your version under the
AGPL-3.0, and make the complete corresponding source available to everyone who
receives it — including users who reach it over a network.

Ordinary use is free and needs no permission, for companies too: the copyleft
obligations apply when you distribute or offer a network service, not when you
use the plugin in your own vault.

Fork freely — but pick your own name and say where it came from. Section 7 of
the licence bars using "Almanac" or "AhryMX" for publicity or in a way that
implies this project endorses your version.

[LICENSING.md](./LICENSING.md) is the plain-English guide with an FAQ.
Third-party components bundled into `main.js` (Chart.js, @kurkle/color, js-yaml
— all MIT) are attributed in [NOTICE](./NOTICE).
