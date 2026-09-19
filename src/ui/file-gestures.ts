// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The two gestures every link in Obsidian answers, for the ones this plugin
// draws itself. 1.0.30.
//
// ── THE BAR'S LINKS WERE NOT BEHAVING LIKE LINKS ─────────────────────────
//
// The reader's ask: *"chronoanvil's headbar should allow middle-click and
// possibly right click functionality. middle-click opens the clicked page into
// a new tab, right click can just open the usual file right click context
// menu."*
//
// Every crumb and every destination on the vault bar is an element with a
// `click` handler that calls `openFile`, which replaces what is in the pane.
// That is the whole of what they did. A middle-click did nothing at all — worse
// than nothing on a desktop, where the button starts Electron's autoscroll
// instead — and a right-click got the editor's own menu for the note UNDER the
// bar, which is a menu about a different file than the thing being pointed at.
//
// ── WHY A HELPER AND NOT A HANDLER PER SITE ──────────────────────────────
//
// There are three of these on the bar and more elsewhere, and the parts that
// are easy to get wrong are the parts that are invisible when they are wrong:
// the `mousedown` that stops autoscroll, the `stopPropagation` that keeps a
// crumb's menu from also being the bar's, and the SOURCE string, which is the
// only thing telling every other plugin's `file-menu` listener what kind of
// place this menu was opened from. One function, one set of answers.
//
// ── WHAT IT DELIBERATELY DOES NOT TOUCH ──────────────────────────────────
//
// THE PLAIN CLICK. It stays the caller's, because on the bar a click is not
// always an open: `resolveTarget`'s `today` and `capture` are *"a destination
// that is not a file"* and run an action instead. A helper that owned `click`
// would have to be told about that, and the rule it would be enforcing already
// lives at the call site in one line. What this owns is the two gestures that
// have no meaning except "this points at a file", which is exactly the set the
// reader named.

import { App, Menu, TFile } from "obsidian";

// What a `file-menu` listener is told about where the menu came from.
//
// OBSIDIAN'S OWN WORD FOR THIS PLACE. The core sources are `file-explorer-
// context-menu`, `link-context-menu`, `pane-more-options`, `tab-header` and
// `sidebar-context-menu`, and a crumb IS a link — a reader right-clicking one
// wants the menu they get right-clicking `[[Homepage]]`, which is this source's
// menu. Inventing a `ca-` source of our own would be truthful about who drew
// the element and would quietly drop every item another plugin adds for links.
export const LINK_MENU_SOURCE = "link-context-menu";

// Give an element the middle-click and right-click a link has.
//
// IDEMPOTENT IT IS NOT — call it once per element, at the point the element is
// built. Everything here is an ordinary element listener on a node this plugin
// owns, so it dies with the node and needs no teardown; see the review
// checklist, which sweeps `document` and `window` and deliberately not these.
export function attachFileGestures(
  app: App,
  el: HTMLElement,
  file: TFile,
  source: string = LINK_MENU_SOURCE
): void {
  // MIDDLE-CLICK IS `auxclick`, NOT `click`. A `click` listener never sees
  // button 1 in any browser written this decade; reading `evt.button` inside
  // one is the version of this that looks right and is dead code.
  el.addEventListener("auxclick", (evt) => {
    if (evt.button !== 1) return;
    evt.preventDefault();
    evt.stopPropagation();
    void app.workspace.getLeaf("tab").openFile(file);
  });

  // AND THE AUTOSCROLL HAS TO BE REFUSED ON `mousedown`, which is the event
  // that starts it. Cancelling the `auxclick` is too late: by then the pane is
  // already in scroll mode with a drift cursor stuck to the pointer, and the
  // note the reader just opened in a new tab is scrolling on its own.
  el.addEventListener("mousedown", (evt) => {
    if (evt.button === 1) evt.preventDefault();
  });

  // RIGHT-CLICK IS OBSIDIAN'S MENU, ASSEMBLED BY OBSIDIAN. `file-menu` is how
  // the file explorer and every internal link build theirs; triggering it is
  // what makes Open in new tab, Rename, Delete, Move to… and whatever the
  // reader's other plugins add appear here without this file knowing any of
  // their names. Building a menu of our own would be a second, shorter, stale
  // copy of a menu the reader already knows.
  el.addEventListener("contextmenu", (evt) => {
    evt.preventDefault();
    // STOPPED HERE, so the editor's own context menu for the note the bar sits
    // above does not open as well. Two menus for one click, the second one
    // about a different file, was the state before this.
    evt.stopPropagation();
    const menu = new Menu();
    app.workspace.trigger("file-menu", menu, file, source);
    menu.showAtMouseEvent(evt);
  });
}
