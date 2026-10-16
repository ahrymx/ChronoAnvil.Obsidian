// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// One fold record, one debounce, and two readers of both.
//
// WHY THIS IS ITS OWN MODULE AS OF 1.0.79. All of it lived in `headerbar.ts`,
// private, which was right while a header bar was the only thing in the plugin
// that folded. A prose block's head now folds too (1.0.79) and `prose-bar.ts`
// cannot import `headerbar.ts`: that file imports `PROSE_BLOCK_CLASS` from
// `prose-surface.ts`, which imports `prose-bar.ts`, so the import would close a
// three-module ring — and `test/module-cycles.test.ts` blesses four tangles and
// this is not one of them.
//
// TWO TIMERS ON ONE SETTINGS OBJECT WOULD HAVE BEEN THE QUIETER MISTAKE. The
// debounce exists because *"a fold is a glance, people fold and unfold several
// in a row"*, and a second copy of it would have had two `saveSettings` calls
// racing over one `data.json` — benign today, because both mutate the in-memory
// record first and last-write-wins writes the same thing, and not the kind of
// thing to leave standing on the argument that it happens to be benign.

import type ChronoAnvilPlugin from "../main";

// One shared timer rather than one per control: folding three sections in a row
// should be one write, not three. Module-level because the controls are
// separate objects with no common owner — `MarkdownRenderChild`s in reading
// mode, a CodeMirror widget in Live Preview — and a fold survives the one that
// made it being torn down by a re-render.
let persistTimer: number | null = null;
const PERSIST_DELAY_MS = 400;

// Fold state stays in settings, so it syncs with everything else — a section
// folded on one device is folded on the next. What it should NOT do is write
// `data.json` on every chevron click: the in-memory value updates immediately
// (every reader below sees it on the next line); only the persist is deferred.
export function schedulePersist(plugin: ChronoAnvilPlugin): void {
  if (persistTimer !== null) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    void plugin.saveSettings();
  }, PERSIST_DELAY_MS);
}

// ABSENT MEANS OPEN, which is four of the record's six namespaces and now five.
// `settings.ts` holds the one exception — the calendar's panels, which ship
// collapsed and therefore store `false` explicitly — and the reason a sixth
// namespace costs nothing: *nothing ever reads a key it did not write*.
export function collapsedAt(plugin: ChronoAnvilPlugin, key: string): boolean {
  return plugin.settings.collapsedNoteSections?.[key] === true;
}

// AND A FOLD IS STORED AS `true` OR AS NOTHING. A reader who has never folded
// anything writes no row, and unfolding deletes rather than storing `false` —
// `pruneCollapsedSections` keeps the record from growing without bound, and it
// can only prune what the absence already means.
export function setCollapsedAt(
  plugin: ChronoAnvilPlugin,
  key: string,
  collapsed: boolean
): void {
  if (!plugin.settings.collapsedNoteSections) {
    plugin.settings.collapsedNoteSections = {};
  }
  const map = plugin.settings.collapsedNoteSections;
  if (collapsed) map[key] = true;
  else delete map[key];
  schedulePersist(plugin);
}
