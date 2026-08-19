// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// How wide a page is, marked on the VIEW rather than found in it. 4.45.1.
//
// ── THE BUG ──────────────────────────────────────────────────────────────
//
// 4.11 gave every dashboard a `wide` line in the block that draws its title,
// and carried it into CSS the only way a post-processor can reach an ancestor:
// the render put a `jtc-wide` class on the title card, and the stylesheet
// reached up with `.markdown-preview-view:has(.jtc-wide) .markdown-preview-sizer`.
//
// A READING VIEW DOES NOT KEEP THE WHOLE NOTE IN THE DOM. Obsidian renders
// sections as they come near the viewport and drops them again when they go far
// enough away — the same fact `repaintOpenNotes` states from the other side when
// it explains why a render site is pruned when its element leaves the document.
// The title card is the FIRST block on the page. Scroll a dashboard to the
// bottom, or give it enough charts that it grows one, and the card is unloaded —
// `:has()` stops matching, and the page snaps back to Obsidian's own width with
// every widget in it collapsing to its narrow layout. Nothing had gone wrong
// with the note; the evidence had simply scrolled away.
//
// ── WHY THIS IS NOT THE THING 4.11 REFUSED ───────────────────────────────
//
// `HOME_CSS_CLASS`'s comment refuses "a class put on the view at render time",
// and it is right: `OBSIDIAN_DOM.viewFooter` exists because such a class
// outlived the note that caused it — Obsidian reuses a leaf across file
// switches, so a width stuck to the next note opened in that tab.
//
// The refusal is of a class put on at RENDER time, and that is the part this
// does not do. The width is not carried out of a rendered block here; it is
// DERIVED FROM THE FILE, by the same `pageIsWide` the cog writes with, and
// re-derived for every open note whenever the workspace or that note changes.
// A leaf showing a note that does not ask for the width has the class removed
// on the same pass that adds it elsewhere, so there is nothing for it to outlive.
//
// The reader-facing half of 4.11 is untouched: the declaration is still one
// `wide` line in the block they are looking at, deleting it still narrows the
// page, and no part of Almanac writes it back.
//
// ── AND IT IS STILL ONE MECHANISM ────────────────────────────────────────
//
// The `:has()` rules are GONE rather than kept as a belt-and-braces. Two
// carriers of one decision is two things to disagree — and they would, for
// exactly as long as it takes a card to be unloaded, which is the interval this
// whole file is about. `almanac-wide` in frontmatter stays, because it is not a
// second mechanism for this decision: it is Obsidian's own class on the view,
// applied by Obsidian from the file, and it is all that keeps a homepage
// composed before 4.11 wide.

import { App, MarkdownView, TFile } from "obsidian";
import type AlmanacPlugin from "../main";
import { pageIsWide } from "../core/note-sections";

// The class the stylesheet reaches for. Spelled once, here, and imported by the
// test that pins the rule to it.
export const WIDE_PAGE_CLASS = "am-wide-page";

export class PageWidth {
  constructor(private app: App, private plugin: AlmanacPlugin) {}

  register(): void {
    // FOUR EVENTS AND ONE SWEEP, because there is no event that means "a leaf
    // is now showing a different note" on its own:
    //
    //   `file-open`          — the ordinary case, a note opened in a leaf.
    //   `layout-change`      — a split, a tab closed, a pane moved: leaves
    //                          appear and disappear without any file opening.
    //   `active-leaf-change` — a leaf restored from a workspace layout, which
    //                          fires neither of the two above.
    //   metadata `changed`   — the note ITSELF changed. This is what makes the
    //                          cog's toggle take effect, and what narrows the
    //                          page again when a reader deletes the line by
    //                          hand or removes the whole title section.
    //
    // The sweep is idempotent and re-reads from the file every time, so a
    // duplicate event costs a cached read and two class checks. That is the
    // right trade against trying to work out which event implies which.
    const sweep = (): void => this.sweep();
    this.plugin.registerEvent(this.app.workspace.on("file-open", sweep));
    this.plugin.registerEvent(this.app.workspace.on("layout-change", sweep));
    this.plugin.registerEvent(this.app.workspace.on("active-leaf-change", sweep));
    this.plugin.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        // ONLY THE VIEWS SHOWING THAT FILE. A vault-wide sweep on every
        // metadata change would re-read every open note each time the reader
        // stops typing for a moment, and a note's width is nobody else's
        // business.
        for (const view of this.markdownViews()) {
          if (view.file?.path === file.path) void this.apply(view);
        }
      })
    );
    // The notes already open when the plugin loads. `onLayoutReady` rather than
    // straight away, because before it the workspace may still be restoring and
    // `getLeavesOfType` answers about a half-built layout.
    this.app.workspace.onLayoutReady(() => this.sweep());
  }

  private markdownViews(): MarkdownView[] {
    return this.app.workspace
      .getLeavesOfType("markdown")
      .map((leaf) => leaf.view)
      .filter((v): v is MarkdownView => v instanceof MarkdownView);
  }

  private sweep(): void {
    for (const view of this.markdownViews()) void this.apply(view);
  }

  // One view, re-derived from its own file.
  private async apply(view: MarkdownView): Promise<void> {
    const file = view.file;
    if (!(file instanceof TFile)) {
      view.containerEl.removeClass(WIDE_PAGE_CLASS);
      return;
    }
    // `cachedRead`, WHICH IS THE READ FOR A QUESTION ABOUT DISPLAY. It answers
    // from the same in-memory copy Obsidian renders from, so this cannot
    // disagree with what is on screen and cannot cost a disk hit per event.
    const text = await this.app.vault.cachedRead(file);
    // THE VIEW MAY HAVE MOVED ON while that resolved — a reader clicking
    // through a folder faster than the reads settle. Answering for the file
    // that is showing NOW is the only safe write; the event for the newer file
    // has its own pass in flight.
    if (view.file?.path !== file.path) return;
    view.containerEl.toggleClass(WIDE_PAGE_CLASS, pageIsWide(text));
  }
}
