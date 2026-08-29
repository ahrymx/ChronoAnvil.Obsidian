// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Wrappers that rebuild a widget when the thing it reads changes.
//
// Four of them, differing only in WHAT they watch: one note's frontmatter, one
// file's contents, every file under a set of folders, or the diary roots. Each
// takes a builder and hands back a host element that re-runs it on the relevant
// vault event.
//
// They were private methods on the Widgets class, which meant the twenty-five
// case bodies in the directive switch that use them could not move out of that
// class either — a case that calls `this.liveScopedWidget(...)` is welded to
// `this`. Lifting these four is what unblocks the rest: the 514 lines of inline
// logic still in the switch call these more than anything else, and they can
// now be extracted one at a time without dragging the class along.
//
// They take `plugin` rather than a host interface because that is all they
// need. AlmanacPlugin extends Obsidian's Plugin, so `plugin.app` covers the
// vault access; nothing here reads or writes a widget value.

import { MarkdownPostProcessorContext, normalizePath } from "obsidian";
import type AlmanacPlugin from "../../main";
import { folderPrefix } from "../../core/util";
import { LiveWidget } from "../livewidget";

export function liveScopedWidget(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  scopeFolder: string | string[],
  build: () => HTMLElement,
  onCleanup?: () => void
): HTMLElement {
  const host = createDiv({ cls: "journal-live-widget" });
  const folders = Array.isArray(scopeFolder) ? scopeFolder : [scopeFolder];
  // `folderPrefix`, NOT `normalizePath(f) + "/"` (4.44.0). A widget scoped to
  // the vault root watched the prefix `"//"` and so never refreshed for any
  // file but its own host note — the table would draw the right rows on first
  // paint and then sit there while tasks were ticked underneath it. The root's
  // prefix is `""`, which matches every path, which is what "watch the whole
  // vault" has to mean.
  const prefixes = folders.map(folderPrefix);
  // ONE PREDICATE, ASKED OF BOTH KINDS OF EVENT (4.50.2). `shouldRefresh` is
  // handed a `TFile` and `shouldRefreshPath` a bare path, and they are the same
  // question — is this in my scope — so the string form is the one that
  // actually decides and the file form defers to it. Two spellings of one scope
  // is how a widget comes to watch two slightly different folders.
  const inScope = (path: string): boolean =>
    path === ctx.sourcePath || prefixes.some((p) => path.startsWith(p));
  ctx.addChild(
    new LiveWidget(plugin.app, host, {
      build,
      shouldRefresh: (f) => inScope(f.path),
      // ── A FILE THAT MOVES OUT OF SCOPE NEVER FIRED ANYTHING (4.50.2) ────
      //
      // `metadataCache.on("changed")` is a CONTENT event. It fires when a file
      // is parsed, and a rename parses nothing — so every folder-scoped widget
      // in this plugin drew its rows on first paint and then sat there while
      // notes were moved, renamed and deleted underneath it.
      //
      // IT WENT UNNOTICED FOR AS LONG AS NOTHING MOVED A FILE. Creating a note
      // fires `changed` once its body is written, which is why *New title*
      // always appeared to work; a reader dragging a note between folders in the
      // explorer was the only way to see it, and then the stale table looks like
      // Obsidian being slow rather than like a bug.
      //
      // 4.50's bin is what made it a REPORT: *Move to bin* left the row on
      // screen, so the reader pressed it again — and Obsidian mutates a `TFile`
      // in place on rename, so the second press binned the file at its NEW path.
      // `The Avengers-2026-08-20-2026-08-20.md`, from one row that should have
      // been gone.
      //
      // `LiveWidget` has handled both sides of a rename since it was written —
      // *"either side moving in or out of scope is a reason to repaint"* — and
      // this is the option that was never passed to reach it.
      shouldRefreshPath: inScope,
      onCleanup,
    })
  );
  return host;
}


export function liveFileWidget(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  watchPath: string,
  build: () => HTMLElement
): HTMLElement {
  const host = createDiv({ cls: "journal-live-widget" });
  const watched = normalizePath(watchPath);
  ctx.addChild(
    new LiveWidget(plugin.app, host, {
      build,
      shouldRefresh: (f) => f.path === ctx.sourcePath || f.path === watched,
    })
  );
  return host;
}


export function liveFrontmatterWidget(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  build: () => HTMLElement
): HTMLElement {
  const host = createDiv({ cls: "journal-live-widget" });
  ctx.addChild(
    new LiveWidget(plugin.app, host, {
      build,
      shouldRefresh: (f) => f.path === ctx.sourcePath,
    })
  );
  return host;
}


export function liveDiaryWidget(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  build: () => HTMLElement,
  alsoHost = false
): HTMLElement {
  const paths = plugin.settings.paths;
  // THE ROOT, THEN THE TWO LEGACY FOLDERS (4.81). An entry written under the
  // period tree is at `02 - Diary/Year-2026/…`, which starts with neither of
  // the two folders this listed — so writing a day no longer repainted the
  // calendar beside it. The root covers the tree and both folders in the
  // default layout; the two stay for a vault that points a grain elsewhere.
  const prefixes = Array.from(
    new Set([paths.diaryRoot, paths.diaryDaily, paths.diaryMonthly])
  ).map((f) => normalizePath(f) + "/");
  const host = createDiv({ cls: "journal-live-widget" });
  ctx.addChild(
    new LiveWidget(plugin.app, host, {
      build,
      shouldRefresh: (f) =>
        prefixes.some((p) => f.path.startsWith(p)) ||
        (alsoHost && f.path === ctx.sourcePath),
      shouldRefreshPath: (path) =>
        prefixes.some((p) => path.startsWith(p)) ||
        (alsoHost && path === ctx.sourcePath),
      // The year picker's own write should feel immediate, so the host-note
      // case isn't held behind the 600ms edit debounce the diary folders use.
      debounceMs: alsoHost ? 120 : 600,
    })
  );
  return host;
}
