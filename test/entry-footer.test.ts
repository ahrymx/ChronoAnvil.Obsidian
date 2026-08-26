// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// 3.7: the entry card grows the footer the overview card already had — and
// 4.21, where that footer became the tracker section's page-context strip.
//
// WHAT 4.21 CHANGED AND WHAT IT KEPT. 4.20 settled that a banner is the file's
// name, its navigation and the cog; 4.21 acted on it. The alias title and the
// date stepper left the banner and joined the tracker section as its head strip;
// the cog went the other way, up into the banner beside the name it acts on.
//
// The three failure modes below are unchanged, because they are about the SEAM
// rather than about where the seam is:
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

  it("builds the strip as its own element, beside the header", () => {
    expect(entry()).toContain("export function buildEntryContext(");
    expect(entry()).toContain('cls: "journal-widget-bar journal-entry-context"');
  });

  it("and the banner keeps the file's name, the cog, and nothing else", () => {
    // The row that used to hold them. Its class is gone from the stylesheet
    // too, so a stray copy would render unstyled rather than looking right.
    expect(entry()).not.toContain("jeh-controls");
    expect(readCss()).not.toContain("jeh-controls");
    // The stepper is assembled once, on the strip. `buildEntryHeader` runs
    // inside a LiveWidget; a second copy there is a second stepper.
    expect(entry().match(/buildDatePicker\(plugin, navGroup/g) ?? []).toHaveLength(1);
    const head = entry().slice(
      entry().indexOf("export function buildEntryHeader("),
      entry().indexOf("export function buildEntryContext(")
    );
    expect(head).not.toContain("navPill(");

    // ── THE NAME IS THE FILE'S (4.21) ───────────────────────────────
    //
    // The banner drew the `title` FRONTMATTER PROPERTY until this release,
    // falling back to a formatted date — so an entry was the one Almanac page
    // whose banner did not show what the note is called, against a rule
    // `page-title.ts` had already settled for every other surface. The alias is
    // not deleted; it is on the strip, where the entry's other facts are.
    expect(head).toContain("attachNoteRename(app, titleWrap, file");
    expect(head).not.toContain("TITLE_PROP");
  });

  it("and the cog comes UP into the banner, through the same shared button", () => {
    // discoverability.test.ts asserts the control exists and that its guard
    // comes first. This one asserts where it is: beside the name it acts on,
    // rather than under the logging grid two bands away from it.
    const head = entry().slice(
      entry().indexOf("export function buildEntryHeader("),
      entry().indexOf("export function buildEntryContext(")
    );
    expect(head).toContain("attachEntryMenu(plugin, wrap,");
    const strip = entry().slice(entry().indexOf("export function buildEntryContext("));
    expect(strip).not.toContain("attachEntryMenu(");
  });

  it("puts the alias on the strip rather than in the banner", () => {
    const strip = entry().slice(entry().indexOf("export function buildEntryContext("));
    expect(strip).toContain("TITLE_PROP");
    expect(strip).toContain("buildDatePicker(plugin, navGroup");
  });

  it("and gives the rename a wrapper of its own, so it cannot eat the cog", () => {
    // ── THE TRAP `attachNoteRename` SETS FOR ITS CALLERS (4.21.1) ────
    //
    // It swaps the name for an input with `row.empty()` and swaps it back the
    // same way, so anything else parented in the row it is handed is destroyed
    // by the first rename and does not come back. That is silent: the banner
    // renders correctly, and the cog disappears the first time someone renames
    // their note and never returns until the file is reopened.
    //
    // All three banners take the same precaution — the name goes in a wrapper
    // and the control goes beside the wrapper — and it is asserted here because
    // the natural way to write the flip that put the cog in the leaf's title row
    // is the way that walks into it.
    for (const [file, wrapper] of [
      ["entryheader", "titleWrap"],
      ["study-header", "titleWrap"],
      ["page-title", "titleRow"],
    ] as const) {
      const src = readCode(file);
      expect(src, file).toContain(`attachNoteRename(`);
      // Whatever the wrapper is called, it is not the element the control is
      // attached to: `wrap`/`row` hold both, the wrapper holds only the name.
      const call = new RegExp(`attachNoteRename\\((?:plugin\\.)?app, ${wrapper},`);
      expect(src, file).toMatch(call);
    }
    // And the two that carry a cog put it on the PARENT of that wrapper.
    expect(readCode("entryheader")).toContain("attachEntryMenu(plugin, wrap,");
    expect(readCode("study-header")).toContain(
      "attachBannerMenu(plugin, titleRow,"
    );
  });
});

describe("the two slim banners are one banner (4.21.1)", () => {
  it("draws the name band before the row of destinations, on both", () => {
    // THE ARRANGEMENT WAS TWO ARRANGEMENTS. The page banner opened with the
    // note's name and welded its destinations beneath; both slim banners opened
    // with navigation and put the name under it. One concept, drawn three ways
    // on nine surfaces.
    //
    // A LEAF FLIPS IN ITS BUILDER, because its two bands are that builder's own
    // children and their order is source order.
    const leaf = readCode("study-header");
    const head = leaf.slice(leaf.indexOf("export function buildStudyHeader("));
    expect(head.indexOf('cls: "jsh-titlerow')).toBeGreaterThan(0);
    expect(head.indexOf('cls: "jsh-titlerow')).toBeLessThan(
      head.indexOf('cls: "jsh-nav')
    );

    const w = readCode("widgets");
    expect(w).toContain("if (pageHead) pageHead.insertAdjacentElement(\"afterend\", strip)");
    expect(w).not.toContain("order: 2");
  });

  it("and the date navigator is built with the formatted date label", () => {
    const entry = readCode("entryheader");
    expect(entry).toContain("const dateLabel = entryDateLabel(app, file, grain);");
    expect(entry).toContain('trigger.createSpan({ cls: "jeh-datenav-label", text: dateLabel });');
  });

  it("and the redundant tracking caption header is removed from the block", () => {
    const w = readCode("widgets");
    expect(w).not.toContain("buildTrackerHead");
    expect(w).not.toContain("TRACKING_LABEL");
  });

  it("and saving puts the band back, because nothing else will (4.21.3)", () => {
    // ── THE BUG: ENTER WROTE THE FILE AND LEFT THE FIELD OPEN ───────
    //
    // Only the CANCEL branch restored the rendered band. The SAVE branch wrote
    // frontmatter and returned, on the unstated assumption that something would
    // re-render the strip — and nothing does, because this strip is deliberately
    // not a LiveWidget (a live host would rebuild the input mid-edit). Leaving
    // the note and coming back "fixed" it, because that is the rebuild the code
    // had been waiting for.
    const src = readCode("entryheader");
    const at = src.indexOf("const commit = async (save: boolean)");
    expect(at).toBeGreaterThan(0);
    const commit = src.slice(at, src.indexOf("input.addEventListener", at));
    // ONE RESTORE, AFTER EITHER OUTCOME — not a second copy in the save branch,
    // which is how the two would start disagreeing about what "restored" means.
    expect(commit.match(/renderTitle\(\);/g) ?? []).toHaveLength(1);
    expect(commit).toContain("titleWrap.appendChild(titleEl)");
    // And the captured value is updated, or the band it re-renders would show
    // what was there before the edit.
    expect(commit).toContain("title = next;");
    expect(src).toContain("let title = typeof fm[TITLE_PROP]");
    // The state class is CLEARED as well as set: `titleEl` is the same element
    // across renders, so a note that was empty when the strip was built would
    // otherwise draw its first saved title in the "nothing here yet" face.
    expect(src).toContain('titleEl.removeClass("jec-title-empty")');
    // AND NOTHING IS WRITTEN WHEN NOTHING WOULD CHANGE: a no-op
    // `processFrontMatter` still moves the file's modified time, which sync then
    // propagates as a change the reader did not make.
    expect(commit).toContain("if (next !== title)");
  });

  it("and the field a click opens is the width of the words it is editing", () => {
    // The CSS half of this is the selector weight (appearance.test.ts). The
    // other half is the WIDTH, and it cannot be CSS: an input's box comes from
    // its `size` attribute, and the wrapper around it is shrink-to-fit — it
    // carries the `margin-right: auto` that pushes the navigator to the far edge
    // — so a percentage width would resolve against a box the input is itself
    // sizing.
    const src = readCode("entryheader");
    expect(src).toContain("input.size = Math.max(input.value.length + 1, 18)");
    // AND IT TRACKS WHAT IS TYPED, so a title that outgrows the field widens it
    // rather than scrolling its own beginning out of view.
    expect(src).toContain('input.addEventListener("input", fit)');
  });

  it("and a date it cannot read is drawn as nothing, not as the grain's name", () => {
    // THE REPORT: a new daily entry's caption read **"Daily"** and became
    // "Fri 14 Aug 2026" the moment a title was saved. `subtitleFor` fell back to
    // `entryContext`'s `dateTitle`, which is `CLASS_DEFS[grain].label` when
    // there is no key — so a page-kind noun was standing in for a date.
    //
    // AND IT WAS PERMANENT ON THREE GRAINS, not just cold-cache-brief on one:
    // that function read `journal-date` alone, while weekly, quarterly and
    // yearly entries keep their key under `week-start` / `quarter-start` /
    // `year-start`. It was the third copy of a lookup `entryDateKey` now owns.
    const src = readCode("entryheader");
    expect(src).not.toContain("function subtitleFor(");
    expect(src).toContain("entryDateKey(frontmatterOf(app, file), grain)");
    expect(src).toContain("if (!key) return null;");
    // The one lookup, and the two other callers that had it right now share it
    // rather than spelling it a second and third time.
    expect(readCode("nav")).toContain("export function entryDateKey(");
    expect(src.match(/def\.dateProperty/g) ?? []).toHaveLength(0);
  });
});

describe("the footer is welded by the block that owns the card", () => {
  it("placed by the postprocessor, not parented into the live header", () => {
    // The distinction 3.2 paid for and 3.6 patch 7 paid for again: a control
    // PARENTED INTO a LiveWidget's subtree is destroyed on its next rebuild.
    // `entry-header` rebuilds on every change to the note's own frontmatter —
    // which is to say, every time the reader edits the title the footer is
    // there to sit beneath.
    const w = readCode("widgets");
    expect(w).toContain("buildEntryContext(this.plugin, ctx, true)");
    expect(w).toContain("container.prepend(strip)");
  });

  it("heads the tracker section under the page head or at the top of the block", () => {
    const w = readCode("widgets");
    const at = w.indexOf("buildEntryContext(this.plugin, ctx, true)");
    const after = w.slice(at, at + 260);
    expect(after).toContain("if (pageHead) pageHead.insertAdjacentElement(\"afterend\", strip)");
    expect(after).toContain("else container.prepend(strip)");
  });

  it("and only where there is a tracker region, and only on a diary entry", () => {
    // `hasTrackerRegion` is true on a journal note too — 4.20 gave that surface
    // a tracker section as well — and an entry's strip would tell it which day
    // it was.
    const w = readCode("widgets");
    const at = w.indexOf("buildEntryContext(this.plugin, ctx, true)");
    const guard = w.slice(at - 400, at);
    expect(guard).toContain("hasTrackerRegion");
    expect(guard).toContain("entryContextFor(ctx.sourcePath)");
  });
});

// THE OLD SHAPE'S LOOK, WHICH 4.21 DID NOT TOUCH. Every entry that already
// exists keeps its markers in the banner's fence, so the strip is still that
// card's footer there — same band, same rules, renamed class. What follows
// asserts the shape a reader's existing notes still render in.
describe("the band reads as a footer and not as the overview's", () => {
  const css = readCss();
  const rule = (): string => {
    const at = css.indexOf(".journal-entry-banner > .journal-widget-bar.journal-entry-context");
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
      ".journal-entry-banner:has(> .journal-entry-context) .journal-tracker-bar"
    );
  });

  it("and the trailing control pushes rather than the bar splitting", () => {
    // `space-between` would strand the alias mid-row on a note with no
    // navigator, which is the shape this band has always had to survive.
    expect(rule()).not.toContain("space-between");
    // AND THERE IS EXACTLY ONE AUTO MARGIN IN THE ROW (4.21.1). Flexbox does
    // not let two of them compete — it splits the free space equally between
    // them — so a second one does not lose, it parks its element half way
    // along the band. 4.21 left one on the alias wrapper and one on the cog,
    // and 4.21.1 took the control's when the control moved to the banner.
    const push = ".jec-title-wrap";
    const at = css.indexOf(`\n${push} {`);
    expect(at, push).toBeGreaterThan(0);
    expect(css.slice(at, css.indexOf("}", at))).toContain("margin-right: auto");
    expect(css).not.toContain(".journal-entry-context > .jeh-more,");
  });

  it("and the control it holds can still be revealed by hovering the card", () => {
    // The `⋯` is faint until hover, and the rule that reveals it names the CARD
    // rather than a band inside it. That distinction has been got wrong twice —
    // once after 3.7 moved the control to the footer and once after 4.21 moved
    // it to the name band — and both times the control simply never lit.
    expect(css).toContain(".journal-slim-banner:hover .jeh-more");
    expect(css).toContain(".journal-slim-banner:hover .jsh-more");
  });

  it("and the date list opens over the card rather than off its edge", () => {
    const at = css.indexOf(".journal-entry-context .jeh-datenav-menu");
    expect(at).toBeGreaterThan(0);
    const menu = css.slice(at, css.indexOf("}", at));
    expect(menu).toContain("bottom: calc(100% + 6px)");
    expect(menu).toContain("transform: none");
  });
});

describe("the title band is given room for the title", () => {
  it("pads evenly, and on one rule for both slim banners", () => {
    // 3.7 GAVE THE ENTRY'S BAND ITS OWN 20/19 PADDING and the reason still
    // holds: the band holds one line, sitting between two hairlines with
    // nothing anchored to either edge, so an asymmetric inset reads as the
    // title having slipped rather than as emphasis.
    //
    // WHAT CHANGED IN 4.21.1 IS WHERE IT IS WRITTEN. That rule was an entry's
    // alone, which is how the leaf's band ended up 24px shorter under a comment
    // claiming the two matched. The air belongs to the band, not to the page
    // kind, so it is on the shared class and there is nowhere left for one of
    // them to keep a private copy.
    const css = readCss();
    const at = css.indexOf(".journal-slim-banner .journal-banner-name {");
    expect(at).toBeGreaterThan(0);
    const rule = css.slice(at, css.indexOf("}", at));
    const pad = /padding:\s*(\d+)px\s+\d+px\s+(\d+)px/.exec(rule);
    expect(pad, "no shorthand padding on the name band").not.toBeNull();
    // Even, to within the optical correction a cap-height line wants.
    expect(Math.abs(Number(pad?.[1]) - Number(pad?.[2]))).toBeLessThanOrEqual(1);
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
