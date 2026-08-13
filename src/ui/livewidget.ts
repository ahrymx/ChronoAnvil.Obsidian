// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Generalizes the old private `FrontmatterWidget` (widgets.ts) that the
// week/month summaries used — rebuild on the host note's own metadata
// changing — into a widget that can rebuild on *any* file change matching
// a caller-supplied predicate. The native table widgets (tables.ts) need
// that: logging a lesson has to refresh the subject's Topics table, not
// just re-render when the subject's own index note changes.
//
// The metadataCache "changed" event fires *after* the cache updates, so a
// rebuild always reads the new value. Debounced so a burst of changes
// (e.g. the migration pass rewriting several notes at once) coalesces
// into a single rebuild instead of one per file.

import { App, MarkdownRenderChild, MarkdownView, TFile } from "obsidian";

export interface LiveWidgetOptions {
  build: () => HTMLElement;
  // Whether a changed file should trigger a rebuild. Typically a scope
  // check — "is this file under my folder?" — rather than an exact path
  // match, so cross-file aggregation (topics-table, confidence-summary,
  // tag-index) stays live.
  shouldRefresh: (changed: TFile) => boolean;
  // Whether a created/deleted/renamed vault path should trigger a rebuild.
  // The metadataCache "changed" event only ever fires for a *file*, and only
  // once its content is parsed — so a widget whose shape is made of folders
  // (the Journals banner: one section per type, one group per subject folder)
  // never hears about a new, renamed or deleted folder at all. Supplying this
  // registers the vault's own create/delete/rename events alongside.
  shouldRefreshPath?: (path: string) => boolean;
  // Coalesce bursts of "changed" events into one rebuild. Default ~150ms.
  debounceMs?: number;
  // Tear-down for the previous build's resources (e.g. a Chart.js instance),
  // run before each rebuild and once on unload. The DOM itself is cleared
  // separately; this is for anything that outlives its element.
  onCleanup?: () => void;
}

const DEFAULT_DEBOUNCE_MS = 150;

export class LiveWidget extends MarkdownRenderChild {
  private timer: number | null = null;

  constructor(
    private app: App,
    hostEl: HTMLElement,
    private opts: LiveWidgetOptions
  ) {
    super(hostEl);
  }

  onload(): void {
    this.rerender();
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (!this.opts.shouldRefresh(file)) return;
        this.scheduleRerender();
      })
    );

    const pathTest = this.opts.shouldRefreshPath;
    if (pathTest) {
      const onPath = (path: string) => {
        if (!pathTest(path)) return;
        this.scheduleRerender();
      };
      this.registerEvent(this.app.vault.on("create", (f) => onPath(f.path)));
      this.registerEvent(this.app.vault.on("delete", (f) => onPath(f.path)));
      // Rename fires with the *new* file and its old path; either side moving
      // in or out of scope is a reason to repaint.
      this.registerEvent(
        this.app.vault.on("rename", (f, oldPath) => {
          onPath(f.path);
          onPath(oldPath);
        })
      );
    }
  }

  // Force a rebuild now, bypassing the debounce. For controls that change what
  // the widget shows without touching any file the scope watches — the
  // Journals banner's own Refresh, which re-reads folders that may have been
  // created outside the vault (synced in, edited on disk).
  refresh(): void {
    if (this.timer != null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.rerender();
  }

  onunload(): void {
    if (this.timer != null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.opts.onCleanup?.();
  }

  private scheduleRerender(): void {
    if (this.timer != null) window.clearTimeout(this.timer);
    const delay = this.opts.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.rerender();
    }, delay);
  }

  private rerender(): void {
    this.opts.onCleanup?.();
    this.containerEl.empty();
    this.containerEl.appendChild(this.opts.build());
  }
}

// Repaint every open note. 3.20.1.
//
// WHY THIS IS NEEDED AT ALL. Every live thing in a rendered note refreshes on a
// FILE event — `LiveWidget` watches `metadataCache.changed` and the vault's
// create/delete/rename — because until now everything that could change what a
// note shows was, in the end, a file. A note type's LABEL is not: it lives in
// settings, and renaming one changes the words on buttons, empty states and
// headings in notes no file event will ever mention.
//
// So renaming a note type left every open dashboard stale — a heading reading
// "Seminars" above a button still reading "New Lesson", which is precisely the
// disagreement the rename existed to remove.
//
// WHY NOT `LiveWidget.refresh()`. A widget rebuilds its own subtree, and the
// button beside it is not in that subtree: buttons, headers and the section
// frame are drawn by the block processor, once, when the note is rendered. Only
// re-rendering the note re-runs it. Half a repaint would have fixed the empty
// state and left the button, which is the same complaint one control smaller.
//
// WHY NOT TOUCH THE FILE. Writing a note to provoke a repaint would put an edit
// in the reader's undo history, move its modified time, and — on a synced
// vault — send a change nobody made. The settings changed; the notes did not.
export function repaintOpenNotes(app: App): void {
  for (const leaf of app.workspace.getLeavesOfType("markdown")) {
    const view = leaf.view;
    if (view instanceof MarkdownView) {
      // `true` for a FULL rebuild: a partial one reuses cached sections, and
      // the cached section is exactly the stale thing here.
      view.previewMode?.rerender(true);
    }
  }
}
