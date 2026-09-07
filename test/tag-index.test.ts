// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import { tagSourcesOf } from "../src/ui/tables";
import {
  DIARY_SECTIONS,
  composeDiaryDashboard,
  renderDiarySection,
  sectionsForDashboard,
  type DashboardGrain,
} from "../src/diary/diary-sections";
import { homeSections } from "../src/diary/home-sections";
import { DEFAULT_PATHS } from "../src/core/constants";
import { readCss, readSrc } from "./sources";

const GRAINS: DashboardGrain[] = ["weekly", "monthly", "quarterly", "yearly"];
const tags = () => DIARY_SECTIONS.find((s) => s.id === "tags");

// ── the source rule (3.14 §4.1) ───────────────────────────────────────────
//
// A tag's source is the FIRST PATH SEGMENT BENEATH THE SCOPE, and the whole
// value of stating it that way is what it does at the two ends: it names the
// journals under a journals root rather than the forty topic folders under
// them, and it names nothing at all under a scope whose notes sit directly in
// it — which is what makes the column self-retiring rather than something the
// caller has to decide to suppress.

describe("where a tag's notes came from", () => {
  it("names the first folder beneath the scope, not the note's parent", () => {
    // The rule the column exists for. `Algebra` is the note's parent and
    // `Mathematics` is the answer: a reader on a diary dashboard scoped to the
    // journals root is asking which journal, not which topic.
    expect(
      tagSourcesOf(
        [
          "03 - Journals/Mathematics/Algebra/Quadratics.md",
          "03 - Journals/Mathematics/Calculus/Limits.md",
          "03 - Journals/Cooking/Bread/Sourdough.md",
        ],
        "03 - Journals"
      )
    ).toEqual(["Cooking", "Mathematics"]);
  });

  it("gives a note sitting directly in the scope no source", () => {
    // It is not beneath anything; it is in the thing itself. The alternative —
    // naming the scope's own folder — puts a value in the column that answers
    // a question the column is not asking.
    expect(
      tagSourcesOf(["02 - Diary/Index.md"], "02 - Diary")
    ).toEqual([]);
  });

  it("comes back empty for a scope whose notes are all direct", () => {
    // THE SELF-RETIRING HALF. A journal with no topic folders, or any leaf
    // folder of notes, produces no sources — so `buildTagIndex` draws no
    // column rather than one repeating a single word down the page.
    expect(
      tagSourcesOf(
        [
          "03 - Journals/Cooking/Sourdough.md",
          "03 - Journals/Cooking/Focaccia.md",
        ],
        "03 - Journals/Cooking"
      )
    ).toEqual([]);
  });

  it("dedupes and sorts, so the cell reads the same on every row", () => {
    expect(
      tagSourcesOf(
        [
          "d/Weekly/w1.md",
          "d/Daily/2026-01-01.md",
          "d/Weekly/w2.md",
          "d/Monthly/m1.md",
        ],
        "d"
      )
    ).toEqual(["Daily", "Monthly", "Weekly"]);
  });

  it("tolerates a trailing slash on the scope", () => {
    expect(tagSourcesOf(["a/b/c.md"], "a/")).toEqual(["b"]);
  });

  it("treats an empty scope as the vault root", () => {
    // The homepage's pre-3.11 spelling resolved to the vault root, and a
    // reader may still point one there by hand.
    expect(tagSourcesOf(["03 - Journals/M/x.md", "readme.md"], "")).toEqual([
      "03 - Journals",
    ]);
  });

  it("ignores a path outside the scope rather than mangling it", () => {
    // Cannot arrive through `pagesUnder`; asserted so the function is total
    // rather than trusting its caller. `03 - JournalsX` is the case a naive
    // `startsWith(root)` gets wrong.
    expect(
      tagSourcesOf(["03 - JournalsX/M/x.md", "03 - Journals/M/y.md"], "03 - Journals")
    ).toEqual(["M"]);
  });
});

// ── the widget (3.14 §4.2, §4.3) ──────────────────────────────────────────

describe("the tag table", () => {
  it("draws the source column only where there is more than one source", () => {
    const src = readSrc("tables");
    expect(src).toContain("const showSource = everySource.size > 1;");
  });

  it("keeps one row per tag, with the note list under it", () => {
    // A tag used in three journals is one row with three source pills. The
    // summary line says "N tags across M notes", and a row per tag-and-source
    // contradicts the header immediately above it.
    const src = readSrc("tables");
    const at = src.indexOf("export function buildTagIndex");
    const body = src.slice(at, src.indexOf("\n}", src.indexOf("return root;", at)));
    expect(body).toContain("for (const [tag, files] of sorted)");
    expect(body.match(/createEl\("details"/g) ?? []).toHaveLength(1);
    expect(body).toContain('createEl("ul", { cls: "ca-jt-tag-list" })');
  });

  it("retired the three size tiers with the cloud", () => {
    // §4.3. They encoded the count as visual weight because a cloud has no
    // column for a number — and the count pill was drawn beside them the whole
    // time. Two encodings of one number on one row is what the table removes.
    const src = readSrc("tables");
    const css = readCss();
    for (const gone of ["jt-tag-cloud", "jt-tag-pill", "jt-tag-sm", "jt-tag-lg"]) {
      expect(src, gone).not.toContain(gone);
      expect(css, gone).not.toContain(gone);
    }
  });

  it("keeps the two clicks distinct now the button sits in the row", () => {
    // The search control moved inside the `<summary>`, whose default action is
    // the toggle. Without this, "search everywhere" would also expand the
    // local list — one click, two outcomes, which is what the separate control
    // exists to avoid.
    const src = readSrc("tables");
    const at = src.indexOf("jt-tag-search");
    const body = src.slice(at, src.indexOf("jt-tag-list", at));
    expect(body).toContain("evt.preventDefault();");
    expect(body).toContain("evt.stopPropagation();");
  });
});

// ── the dashboard section (3.14 §2, §3) ───────────────────────────────────

describe("Tags on a diary dashboard", () => {
  it("is offered on every grain and shipped on none", () => {
    // Two answers to two questions. A tag cloud reads a folder rather than a
    // period, so no grain wants it less than another; and four dashboards each
    // growing an identical cloud over the same folder is one view drawn four
    // times.
    for (const grain of GRAINS) {
      const ids = sectionsForDashboard({ grain }).map((s) => s.id);
      expect(ids, grain).toContain("tags");
      expect(composeDiaryDashboard(grain), grain).not.toContain("tag-index");
    }
  });

  it("writes the folder it reads, instead of taking the host's", () => {
    // THE FINDING THE RELEASE IS BUILT ON (§2). A bare `tag-index` reads the
    // host note's own parent — right on a journal index, which sits in the
    // folder it indexes, and wrong here: `02 - Diary/Weekly` holds the
    // overview and the weekly entries and almost never a tag, so the section
    // would draw its empty state on the surface it was just added to.
    const rendered = renderDiarySection(tags()!, {
      grain: "weekly",
      diaryRoot: "99 - Mine",
    });
    expect(rendered).toContain("tag-index:99 - Mine");
    expect(rendered).not.toMatch(/^tag-index\s*$/m);
  });

  it("falls back to the shipped diary root when nobody supplied one", () => {
    // Reachable only from a caller with no settings to consult — the composer
    // builds its context from a grain alone and never renders this section,
    // because it is opt-in. Pinned because a fallback that is right in the
    // common case is exactly what hides being reached in the uncommon one.
    expect(renderDiarySection(tags()!, { grain: "monthly" })).toContain(
      `tag-index:${DEFAULT_PATHS.diaryRoot}`
    );
  });

  it("has the editor's context carry the configured root", () => {
    // The other half of the fallback above: the one caller that renders this
    // section in anger holds the plugin, so it supplies the path the reader
    // actually configured rather than the one this vault shipped with.
    const src = readSrc("ui/section-insert");
    expect(src).toContain("diaryRoot: this.plugin.settings.paths.diaryRoot,");
  });

  it("matches the directive rather than the header it retitled", () => {
    const section = tags()!;
    expect(section.locate("```chronoanvil\nheader:🐈 Whatever\ntag-index:x\n```")).toBeGreaterThanOrEqual(0);
    expect(section.locate("```chronoanvil\nheader:🏷️ Tags\n```")).toBe(-1);
  });

  it("shares its id and icon with the homepage's entry", () => {
    // One widget under one name on three surfaces. An id that drifted would
    // make the two rows read as unrelated things in an editor a reader opens
    // on both in the same session — the rule `search-sections.test.ts` already
    // asserts for the other shared section.
    const home = homeSections(DEFAULT_PATHS.diaryRoot).find(
      (s) => s.id === "tags"
    );
    expect(home).toBeDefined();
    expect(tags()?.icon).toBe(home?.icon);
    expect(tags()?.label).toBe(home?.label);
  });

  it("is not on a diary entry", () => {
    // An entry is a day. A cloud over the diary root on every daily note is
    // the same page three hundred and sixty-five times.
    expect(readSrc("entry-sections")).not.toContain("tag-index");
  });
});
