// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// 3.7: the entry card grows the footer the overview card already had.
//
// Another visual release, and masthead.test.ts's opening note applies here
// unchanged: what a suite can hold is not the look but everything the look
// rests on. Three things, and each has a failure mode that ships silently.
//
//   The footer is built by the BLOCK, not by the header widget. Get this wrong
//   and it works until the reader edits their title, at which point the
//   LiveWidget rebuild takes the stepper with it.
//
//   The header no longer builds the controls at all. A split that leaves the
//   old row in place draws both.
//
//   The crumb names the page kind at every grain. The old shape had branches
//   for two grains and a fall-through for the other three, which is how a
//   weekly entry's crumb came to read `Week-2026-W32`.

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readCode, readCss, readSrc } from "./sources";
import { CLASS_DEFS, TRACKER_CLASSES } from "../src/trackers/trackers";

describe("the controls leave the title band", () => {
  const entry = () => readCode("entryheader");

  it("builds the footer as its own element, beside the header", () => {
    expect(entry()).toContain("export function buildEntryFooter(");
    expect(entry()).toContain('cls: "journal-widget-bar journal-entry-actions"');
  });

  it("and the header keeps nothing but the title", () => {
    // The row that used to hold them. Its class is gone from the stylesheet
    // too, so a stray copy would render unstyled rather than looking right.
    expect(entry()).not.toContain("jeh-controls");
    expect(readCss()).not.toContain("jeh-controls");
    // The stepper is assembled once, in the footer. `buildEntryHeader` runs
    // inside a LiveWidget; a second copy there is a second stepper.
    expect(entry().match(/buildDatePicker\(plugin, navGroup/g) ?? []).toHaveLength(1);
    const head = entry().slice(
      entry().indexOf("export function buildEntryHeader("),
      entry().indexOf("export function buildEntryFooter(")
    );
    expect(head).not.toContain("navPill(");
    expect(head).not.toContain("attachEntryMenu(");
  });

  it("and the `⋯` goes with it, through the same shared button", () => {
    // discoverability.test.ts asserts the control exists and that its guard
    // comes first. This one asserts it moved: same call, new host.
    const foot = entry().slice(entry().indexOf("export function buildEntryFooter("));
    expect(foot).toContain("attachEntryMenu(plugin, bar,");
  });
});

describe("the footer is welded by the block that owns the card", () => {
  it("appended by the postprocessor, not parented into the live header", () => {
    // The distinction 3.2 paid for and 3.6 patch 7 paid for again: a control
    // PARENTED INTO a LiveWidget's subtree is destroyed on its next rebuild.
    // `entry-header` rebuilds on every change to the note's own frontmatter —
    // which is to say, every time the reader edits the title the footer is
    // there to sit beneath.
    const w = readCode("widgets");
    expect(w).toContain("buildEntryFooter(this.plugin, ctx)");
    expect(w).toContain("container.appendChild(footer)");
  });

  it("after the grid and after the add tile, which is what makes it a footer", () => {
    // Appending before either would put it in the middle of the card — the
    // exact placement 3.7 exists to undo, one band lower down.
    const w = readCode("widgets");
    const tile = w.indexOf("buildTrackerAddCell(this, ctx)");
    const footer = w.indexOf("buildEntryFooter(this.plugin, ctx)");
    expect(tile).toBeGreaterThan(0);
    expect(footer).toBeGreaterThan(tile);
  });

  it("and only on an entry card", () => {
    const w = readCode("widgets");
    const at = w.indexOf("buildEntryFooter(this.plugin, ctx)");
    expect(w.slice(at - 200, at)).toContain("if (isEntryBanner) {");
  });
});

describe("the band reads as a footer and not as the overview's", () => {
  const css = readCss();
  const rule = (): string => {
    const at = css.indexOf(".journal-entry-banner > .journal-widget-bar.journal-entry-actions");
    expect(at).toBeGreaterThan(0);
    return css.slice(at, css.indexOf("}", at));
  };

  it("takes the card's lower edge, with a rule above it", () => {
    expect(rule()).toContain("border-top");
    expect(rule()).toContain("margin: 0 -14px -12px");
    expect(rule()).toContain("var(--background-secondary-alt)");
  });

  it("and does not wear the overview's species marker", () => {
    // The accent edge means "this page summarises the ones below it". An entry
    // is not that page, and 3.2's whole split is that the two cards say so.
    expect(rule()).not.toContain("border-left");
  });

  it("so the grid stops at the rule rather than at the card", () => {
    // The grid's own `-12px` bottom margin welds it to the card's edge. With a
    // footer under it that margin pulls it THROUGH the footer's top rule.
    expect(css).toContain(
      ".journal-entry-banner:has(> .journal-entry-actions) .journal-tracker-bar"
    );
  });

  it("and the trailing control pushes rather than the bar splitting", () => {
    // `space-between` would strand the stepper mid-row on a managed template,
    // where the `⋯` is deliberately not drawn at all.
    const at = css.indexOf(".journal-entry-actions > .jeh-more");
    expect(at).toBeGreaterThan(0);
    expect(css.slice(at, css.indexOf("}", at))).toContain("margin-left: auto");
    expect(rule()).not.toContain("space-between");
  });

  it("and the control it holds can still be revealed by hovering the card", () => {
    // The `⋯` is faint until hover. Its reveal was scoped to the title band,
    // which is a hover target it is no longer inside.
    expect(css).toContain(".journal-entry-banner:hover .jeh-more");
  });

  it("and the date list opens over the card rather than off its edge", () => {
    const at = css.indexOf(".journal-entry-actions .jeh-datenav-menu");
    expect(at).toBeGreaterThan(0);
    const menu = css.slice(at, css.indexOf("}", at));
    expect(menu).toContain("bottom: calc(100% + 6px)");
    expect(menu).toContain("transform: none");
  });
});

describe("the title band is given room for the title", () => {
  it("pads evenly, now that it holds one line instead of two", () => {
    const css = readCss();
    const at = css.lastIndexOf(".journal-entry-banner .journal-entry-header {");
    expect(at).toBeGreaterThan(0);
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toContain("padding-top");
    expect(rule).toContain("padding-bottom");
  });
});

describe("the breadcrumb trail, and its removal (4.8.1)", () => {
  it("is gone, along with the bar it was the right-hand half of", () => {
    // WHAT IT WAS FOR, so that nobody rebuilds it by accident. The trail named
    // what a diary page IS — "Daily entry", "Weekly overview" — in the tinted
    // area titlebar across the top of the links card. 3.7 had already cut it
    // down from `Daily › Mon 3 Aug 2026`, on the grounds that a crumb repeating
    // the title one row above it in smaller grey text is the same fact twice.
    //
    // 4.8.1 finishes that argument rather than reversing it. The block's own
    // head now names the block, so the strip was a THIRD statement of the same
    // thing — and the weakest of the three, because it named the folder.
    const l = readCode("links");
    expect(l).not.toContain("diaryCrumbs");
    expect(l).not.toContain("journalsCrumbs");
    expect(l).not.toContain("buildAreaTitlebar");
    // The card survives it: the pill row still needs a frame to be one object.
    expect(l).toContain("journal-links-card");
  });

  it("took its module with it rather than leaving one nobody calls", () => {
    expect(existsSync(resolve(__dirname, "../src/ui/area-titlebar.ts"))).toBe(false);
    expect(readCss()).not.toContain(".am-titlebar");
  });

  it("and every grain still has a label, because the class table is not its", () => {
    // The trail read this map, and the map is not the trail's: the entry
    // navigator, the section catalogues and the tracker editor all name a grain
    // from it. Removing a reader must not cost the word.
    for (const grain of TRACKER_CLASSES) {
      expect(CLASS_DEFS[grain].label, grain).toBeTruthy();
    }
  });
});

describe("what did not change", () => {
  it("the fence is still the fence the composer writes", () => {
    // 3.7 moves DOM, not directives. A footer that needed a line in the note
    // would need a migration for every entry already written — and would be a
    // control a reader could delete from under themselves, which is the trap
    // the add-tile comment in widgets/index.ts describes.
    const entry = readSrc("entry-sections");
    for (const grain of TRACKER_CLASSES) {
      expect(entry, grain).not.toContain(`entry-footer`);
    }
  });
});
