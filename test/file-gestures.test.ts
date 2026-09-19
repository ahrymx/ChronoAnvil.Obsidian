// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The bar's links behave like links — 1.0.30.
//
// The reader's ask: *"chronoanvil's headbar should allow middle-click and
// possibly right click functionality. middle-click opens the clicked page into
// a new tab, right click can just open the usual file right click context
// menu."*
//
// WHY THIS IS A SOURCE-SHAPE FILE AND NOT A DOM ONE. There is no jsdom in this
// suite — `banner-reveal.test.ts` states that and reads its wiring off the
// source for the same reason. What is worth pinning here is not "a listener
// fires": it is the four choices inside it that are invisible when wrong, and
// each one of those cost something to learn:
//
//   `auxclick` and not `click`, because a `click` listener never sees button 1;
//   a `mousedown` refusal, because that is the event autoscroll starts on;
//   Obsidian's `file-menu` and not a menu of our own, because the reader asked
//     for *the usual* menu and ours would be a short stale copy of it;
//   the gestures only where the destination is a FILE, because two of the bar's
//     four destinations are windows.

import { describe, expect, it } from "vitest";

import { LINK_MENU_SOURCE } from "../src/ui/file-gestures";
import { readSrc } from "./sources";

const gestures = (): string => readSrc("ui/file-gestures");

describe("the gesture helper", () => {
  it("opens a new tab on the middle button, and only that button", () => {
    const t = gestures();
    expect(t).toContain('el.addEventListener("auxclick"');
    expect(t).toContain("if (evt.button !== 1) return;");
    expect(t).toContain('app.workspace.getLeaf("tab").openFile(file)');
    // NOT `getLeaf(false)`, which is `openFile`'s own leaf — the pane you are
    // looking at. A middle-click that replaced the current note would be a
    // plain click with extra steps, and is what the helper exists to not be.
    expect(t).not.toContain("getLeaf(false)");
  });

  it("refuses the autoscroll on the event that starts it", () => {
    // Cancelling `auxclick` is too late: Electron is already in scroll mode
    // with a drift cursor on the pointer by then, so the note that just opened
    // in a new tab scrolls on its own.
    const t = gestures();
    expect(t).toContain('el.addEventListener("mousedown"');
    expect(t).toContain("if (evt.button === 1) evt.preventDefault();");
  });

  it("asks Obsidian to build the right-click menu", () => {
    // The ask said *"the usual file right click context menu"*, and the only
    // way to have the usual one is to have Obsidian assemble it — Rename,
    // Delete, Move to…, Open in new tab, plus whatever the reader's other
    // plugins add for links, none of which this file can know the names of.
    const t = gestures();
    expect(t).toContain('el.addEventListener("contextmenu"');
    expect(t).toContain('app.workspace.trigger("file-menu", menu, file, source)');
    expect(t).toContain("menu.showAtMouseEvent(evt)");
    // And the editor's own menu, which is about the note UNDER the bar rather
    // than the note being pointed at, must not open alongside it.
    expect(t).toContain("evt.stopPropagation();");
  });

  it("tells a listener this menu came from a link", () => {
    // One of Obsidian's own source words, not a `ca-` one. A plugin adding
    // items for links keys off this string; a private source would be honest
    // about who drew the element and would silently drop every one of them.
    expect(LINK_MENU_SOURCE).toBe("link-context-menu");
  });

  it("leaves the plain click alone", () => {
    // Deliberate: on the bar a click is not always an open. `today` and
    // `capture` run an action, and the rule that an action wins already lives
    // at the call site in one line.
    expect(gestures()).not.toContain('addEventListener("click"');
  });
});

describe("where the bar wears them", () => {
  it("puts them on every crumb of the trail", () => {
    // `renderCrumb` is the trail on BOTH banners — the vault bar's and the
    // journal header's — so the one call is what makes them agree.
    const t = readSrc("study-header");
    expect(t).toContain("attachFileGestures(app, a, file);");
  });

  it("puts them on the destinations that are notes, and not on the windows", () => {
    // `resolveTarget` gives `today` and `capture` `file: null` — *"a
    // destination that is not a file"* — and the guard is what keeps a middle
    // -click on Capture from opening a window in a tab it has no business in.
    const t = readSrc("vault-banner");
    expect(t).toContain("if (dest) attachFileGestures(this.app, btn, dest);");
  });

  it("puts them on the note the bar is sitting on", () => {
    // The trail's tail. It is the one crumb that is not a link and the most
    // obvious thing on the bar to right-click.
    expect(readSrc("vault-banner")).toContain(
      "attachFileGestures(this.app, here, file);"
    );
  });

  it("never asks a menu to be about the wrong file", () => {
    // THE BUG THE RIGHT-CLICK HALF REPLACES. Before this, right-clicking a
    // crumb got the editor's menu for the note the bar sits above — a menu
    // about a different file than the thing under the pointer, which is the
    // kind of wrong that looks like it worked. Every call site passes the
    // crumb's OWN destination.
    const t = readSrc("vault-banner");
    expect(t).not.toContain("attachFileGestures(this.app, btn, file)");
  });
});
