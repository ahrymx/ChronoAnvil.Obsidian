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
  ctx.addChild(
    new LiveWidget(plugin.app, host, {
      build,
      shouldRefresh: (f) =>
        f.path === ctx.sourcePath || prefixes.some((p) => f.path.startsWith(p)),
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
  const prefixes = Array.from(
    new Set([paths.diaryDaily, paths.diaryMonthly])
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
