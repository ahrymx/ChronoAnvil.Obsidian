// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  SEARCH_SECTIONS,
  composeSearchNote,
  searchSectionModel,
} from "../src/diary/search-sections";
import { homeSections, composeHomeNote } from "../src/diary/home-sections";
import { DEFAULT_PATHS } from "../src/core/constants";
import { segment } from "../src/core/layout";
import { isPageWidgetId } from "../src/core/widget-sections";

const ASSETS = resolve(__dirname, "..", "assets");
const ROOT = DEFAULT_PATHS.diaryRoot;
const HOME_SECTIONS = homeSections(ROOT);
const search = (): string => composeSearchNote();

describe("the search catalogue", () => {
  it("gives every section an id, a label, a blurb and an icon", () => {
    for (const s of SEARCH_SECTIONS) {
      expect(s.id, s.id).toBeTruthy();
      expect(s.label, s.id).toBeTruthy();
      expect(s.blurb, s.id).toBeTruthy();
      expect(s.icon, s.id).toBeTruthy();
    }
  });

  it("locates each of its own sections in the note it composes", () => {
    const text = search();
    for (const s of SEARCH_SECTIONS) {
      expect(s.locate(text), s.id).toBeGreaterThanOrEqual(0);
    }
  });

  it("locks the search box and nothing else", () => {
    // The note is named Search, is the target of the ribbon entry and of the
    // "Search the diary" command. A Search note with no search box is a broken
    // link rather than a customisation.
    // AND THE BANNER, AS OF 4.19 — it carries this page's navigation row now, so
    // it inherited that row's lock. `bannerSection` argues the trade.
    expect(SEARCH_SECTIONS.filter((s) => s.locked).map((s) => s.id)).toEqual([
      "banner",
      "search",
    ]);
  });

  it("holds nothing of the reader's", () => {
    // Every section here is a view over entries stored elsewhere, so no
    // removal can cost anyone a word they wrote and none declares `holds`.
    for (const s of SEARCH_SECTIONS) expect(s.holds, s.id).toBeUndefined();
  });

  it("moved the links row out of the search fence and into the banner", () => {
    // ── THE PARAGRAPH THIS REPLACES WAS WRONG BY 4.19, IN BOTH HALVES ──
    //
    // It read: *"Not promoted to a section of its own: that would mean inventing
    // a band for a single row on a note with no masthead. `layout.ts` rewrites
    // `links:` wherever it finds one, so the row is maintained without a
    // catalogue entry holding it."*
    //
    // The first half stopped applying when the banner arrived: there is no band
    // to invent, because the row joins the section that draws the page's name.
    // The second half stopped being TRUE in 4.18, when repair moved onto
    // `SectionModel` — `MANAGED_ARGS` is read only by `planLayout`/`applyLayout`,
    // and no composed note reaches those any more. So the row was maintained by
    // nothing, and belonged to a section a reader could remove.
    const fences = segment(search().split("\n")).filter((s) => s.kind === "fence");
    const at = (probe: string): string =>
      fences.map((f) => f.lines.join("\n")).find((f) => f.includes(probe))!;

    const box = at("diary-search");
    expect(box).not.toContain("links:");
    expect(box).toContain("header:🔎 Search the diary");

    const banner = at("title:");
    expect(banner).toContain("links:today,scopes#diary");
    // `home` moved to the head rather than being dropped — the pairing this
    // release has to keep true on every page that gave the pill up.
    expect(search()).toContain("title:home,diary,journals");
  });

  it("writes one fence per section and does not merge them", () => {
    const fences = segment(search().split("\n")).filter((s) => s.kind === "fence");
    expect(fences).toHaveLength(SEARCH_SECTIONS.length);
  });

  it("no longer ships as an asset", () => {
    expect(readdirSync(ASSETS)).not.toContain("search.md");
  });
});

describe("the two flat notes, where they overlap", () => {
  // THE GUARD 3.11 §12 ASKS FOR. §1.2 accepts duplication between the two
  // catalogues for a stated reason, and the failure mode of accepted
  // duplication is the one `shippedNotes`' own header describes: "a second
  // enumeration written from the same memory that forgot the first."
  //
  // `on-this-day` is the whole overlap, and it is spelled differently in each.
  // Pinning both spellings is what keeps the difference deliberate rather than
  // something a later reader "fixes" into agreement.
  //
  // THE OVERLAP IS NOW BETWEEN CATALOGUES RATHER THAN BETWEEN NOTES (3.13
  // §11). The homepage still OFFERS the section — it is `optIn`, not gone —
  // so both catalogues still carry it and this guard still has two things to
  // compare. What it can no longer do is read the homepage's spelling out of
  // the composed note, because the composed note no longer contains one.

  it("spells on-this-day the same way on both notes now", () => {
    // THE DIFFERENCE IS GONE, AND WHAT REMOVED IT IS WORTH RECORDING. The two
    // notes disagreed for three releases: Search kept the empty state because
    // retrieval is that page's job, and the homepage wrote the bare form
    // because a block claiming to be about the past, with nothing in it, was
    // not worth a band on a page about now.
    //
    // A ROW ENDS THE ARGUMENT rather than settling it. A cell that draws
    // nothing still takes its share of the row, so the bare form on the
    // homepage is not an absence — it is a third of the top row left blank.
    // Both notes reserve the space, so both explain it.
    const home = HOME_SECTIONS.find((s) => s.id === "on-this-day");
    expect(home?.render().lines).toContain("on-this-day:always");
    expect(search()).toContain("on-this-day:always");
  });

  it("composes it on Search only, as of 4.70", () => {
    // THE COMPOSED NOTES, WHERE THE TWO NOW DIVERGE AND THE CATALOGUES DO NOT.
    // The test above pins the SPELLING and finds it identical in both
    // catalogues; this one pins where the spelling is actually WRITTEN, and
    // 4.70 made those different questions.
    //
    // `upcoming` took the homepage's cell — 3.13 §11's unanswered half, that
    // the homepage is the one note about now and this is the one block on it
    // about the past — so the homepage OFFERS the section and composes no line
    // for it. Search, whose whole job is retrieval, composes it as it always
    // has.
    //
    // WHICH MAKES THE EMPTY STATE SEARCH'S REASON ALONE NOW. A block on a page
    // about the past is space already given to this widget, and space that has
    // been given has to say what it is for — otherwise a vault younger than a
    // year shows a heading with nothing under it.
    expect(composeHomeNote(ROOT)).not.toContain("on-this-day");
    expect(composeSearchNote()).toContain("on-this-day:always");
  });

  it("gives the same id to the same widget on both notes", () => {
    // Different spellings, same section identity. An id that drifted would
    // make the two notes' rows read as unrelated things in an editor a reader
    // opens on both in the same session.
    expect(HOME_SECTIONS.some((s) => s.id === "on-this-day")).toBe(true);
    expect(SEARCH_SECTIONS.some((s) => s.id === "on-this-day")).toBe(true);
  });

  it("uses the same icon for it on both notes", () => {
    const home = HOME_SECTIONS.find((s) => s.id === "on-this-day");
    const srch = SEARCH_SECTIONS.find((s) => s.id === "on-this-day");
    expect(home?.icon).toBe(srch?.icon);
  });

  it("shares exactly two sections, and both are deliberate", () => {
    // This said "no OTHER section" and was written with an instruction: if it
    // ever fails, the two catalogues have started converging and the decision
    // is worth REVISITING rather than worked around. 4.10 is that revision, and
    // the answer is a second shared section rather than a weakened rule.
    //
    // `title` is shared because it is the one section that is not about what a
    // page CONTAINS — every page has a name, every page can be edited, and a
    // head that existed on some pages and not others is the defect this release
    // closes. `on-this-day` is shared for the reason two rows over: it is the
    // same widget doing the same job on both notes.
    //
    // A THIRD would still mean what this test always meant. The list is
    // enumerated rather than counted so that adding one is a decision somebody
    // writes down here.
    const shared = HOME_SECTIONS.map((s) => s.id).filter((id) =>
      SEARCH_SECTIONS.some((s) => s.id === id)
    );
    expect(shared).toEqual(["banner", "on-this-day"]);
  });
});

describe("the search model", () => {
  const model = searchSectionModel();

  it("reports every composed section as present", () => {
    expect(model.present(search())).toEqual(SEARCH_SECTIONS.map((s) => s.id));
  });

  it("offers none of its own sections on a complete Search note, only widgets", () => {
    // THIS ASSERTED ZERO UNTIL 4.12 §C, and the half it was really about is
    // still zero: a catalogue that composed a note must not then offer to add
    // what it just wrote. What is new is the widget door, which is by definition
    // everything the catalogue does NOT have an opinion about.
    const offered = model.addable(search()).map((s) => s.id);
    expect(offered.filter((id) => !isPageWidgetId(id))).toEqual([]);
    expect(offered.length).toBeGreaterThan(10);
  });

  it("does not offer a widget it already writes, including one inside a fence", () => {
    const offered = model.addable(search()).map((s) => s.id);
    // The three this note writes as sections of its own. ASKED ON THE INSTANCE
    // ID, because that is what an add list holds as of 4.56 — the bare form is
    // generated by nothing, so asserting its absence would assert nothing.
    const keywordsOffered = new Set(
      offered.map((id) => id.slice("w:".length).split("#")[0])
    );
    for (const written of ["diary-search", "on-this-day", "timeline"]) {
      expect(keywordsOffered, written).not.toContain(written);
    }
    // AND THE ONE THAT IS NOT A SECTION AT ALL, which is the case that made the
    // de-dup probe symmetric. `links:today,scopes#diary` lives INSIDE the search
    // fence and no `SEARCH_SECTIONS` entry locates it — so asking "does the
    // catalogue claim the line `links`?" says no, and generating it would have
    // produced a section `present()` reports on a note the reader never touched.
    // The second direction — "would this widget claim a line the catalogue
    // writes?" — is what catches it.
    expect(search()).toContain("links:");
    expect(keywordsOffered).not.toContain("links");
  });

  it("refuses to remove the search box, and names the fix", () => {
    const why = model.refusal("search", search());
    expect(why).toContain("can't be removed");
    expect(why).toContain("move it");
  });

  it("lets the other two go", () => {
    expect(model.refusal("timeline", search())).toBeNull();
    expect(model.refusal("on-this-day", search())).toBeNull();
  });

  it("returns null when nothing would change", () => {
    expect(model.apply(search(), SEARCH_SECTIONS.map((s) => s.id))).toBeNull();
  });

  it("restores the file exactly on remove-then-re-add", () => {
    const ids = SEARCH_SECTIONS.map((s) => s.id);
    const without = model.apply(search(), ids.filter((id) => id !== "timeline"));
    expect(without).not.toBeNull();
    expect(without).not.toContain("timeline");
    expect(model.apply(without as string, ids)).toBe(search());
  });

  it("puts every row in one band and lets every row move", () => {
    // ONE BAND FOR EVERY ROW INCLUDING THE HEAD, because the head is fixed by
    // DECLARATION here rather than by being alone in a band of its own — which is
    // how the four period dashboards do it, and the difference is the whole
    // reason `FlatSection` grew a flag instead of a band model.
    for (const v of model.sections()) {
      expect(v.group, v.id).toBeNull();
      if (v.id === "banner") continue;
      expect(v.movable, v.id).toBe(true);
    }
  });

  it("fixes the banner in place, and no longer lets it go", () => {
    const head = model.sections().find((v) => v.id === "banner")!;
    expect(head.movable).toBe(false);
    expect(head.removable).toBe(false);
    // AND IT NO LONGER LETS IT GO (4.19). The banner carries this page's
    // navigation row, so `links`' lock travels with it — see `bannerSection`.
    expect(model.refusal("banner", search())).not.toBeNull();
    // And a `want` that asks for it last is not a move.
    const ids = SEARCH_SECTIONS.map((s) => s.id);
    expect(
      model.apply(search(), [...ids.filter((id) => id !== "banner"), "banner"])
    ).toBeNull();
  });
});
