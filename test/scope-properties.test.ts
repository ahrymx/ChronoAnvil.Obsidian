import { quarterOverviewPath, yearOverviewPath } from "../src/core/util";
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { STUDY_JOURNAL } from "../src/journals/journal";
import { journalTemplateFiles } from "../src/journals/custom-journal";
import path from "node:path";
import { DEFAULT_PATHS } from "../src/core/constants";

// The review-scope axis, guarded at the seam.
//
// `widgets.ts::resolvePeriodBounds` decides which period a dashboard is scoped
// to by testing four frontmatter properties in a fixed order and taking the
// first that is present. That is fine — and only fine — while a note carries
// at most one of them. A note holding two would resolve to whichever branch
// happens to be written first in that function and draw a window that is
// plausible and wrong: the summary would say one period while the charts drew
// another, with nothing on screen admitting the disagreement.
//
// The assumption lives in a comment there and cannot be enforced by the type
// system, because the properties are strings in a markdown file. So it is
// enforced here instead, against the shipped assets, which are the only notes
// Almanac itself authors. This is the same shape as class-table.test.ts: a
// coupling one file depends on, whose other half lives in a file it does not
// import.

const ASSETS = path.resolve(__dirname, "../assets");

// Kept in sync with resolvePeriodBounds by hand — which is the point. Adding a
// fifth scope means adding it here, and being made to think about the
// first-match ordering while doing so.
const SCOPE_PROPS = [
  "week-start",
  "month-start",
  "quarter-start",
  "year-start",
];

function keysOf(text: string): string[] {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return [];
  const keys: string[] = [];
  for (const line of m[1].split("\n")) {
    // Only top-level keys: an indented line is a nested value, and a `#` line
    // is one of the managed-region markers the tracker sync writes.
    if (/^\s/.test(line) || line.trimStart().startsWith("#")) continue;
    const i = line.indexOf(":");
    if (i > 0) keys.push(line.slice(0, i).trim());
  }
  return keys;
}


// Every note Almanac itself authors, whatever it is made of.
//
// Was `readdirSync(ASSETS)` alone, which quietly checked three fewer files the
// moment 2.42 composed Study's content templates instead of shipping them — a
// coverage hole with no failing test to announce it. A composed template is
// still a note the plugin writes into someone's vault, so it is still bound by
// the first-match-wins rule this file exists to enforce.
const AUTHORED: { name: string; text: () => string }[] = [
  ...readdirSync(ASSETS)
    .filter((f) => f.endsWith(".md"))
    .map((name) => ({ name, text: () => readFileSync(path.join(ASSETS, name), "utf8") })),
  ...journalTemplateFiles(STUDY_JOURNAL).map((t) => ({
    name: `Study / ${t.name}`,
    text: () => t.content,
  })),
  // AND THE HOMEPAGE, COMPOSED SINCE 3.11 §1. Exactly the hole the paragraph
  // above describes, arriving a second time and from the same cause: a note
  // moved out of `assets/` into a catalogue and fell out of a list that finds
  // its members by reading a directory. It was caught this time because the
  // suite's total dropped by one when `assets/home.md` was deleted.
  //
  // It matters here specifically. The homepage carries `diary:`, whose card
  // shows this month — if the note ever gained a scope property, first-match
  // -wins would silently scope the whole page to it.
  { name: "Homepage", text: () => composeHomeNote(DEFAULT_PATHS.diaryRoot) },
  // And the Search note, composed since 3.11 §3. Added in the SAME patch that
  // composed it rather than a patch later, which is the whole lesson of the
  // paragraph above: this list finds its members by reading a directory, so
  // every note that leaves that directory has to be put back by hand.
  { name: "Search", text: () => composeSearchNote() },
];

import { composeDiaryDashboard } from "../src/diary/diary-sections";
import { composeHomeNote } from "../src/diary/home-sections";
import { composeSearchNote } from "../src/diary/search-sections";
import type { DashboardGrain } from "../src/diary/diary-sections";

describe("review scopes ↔ the notes Almanac authors", () => {
  it("finds both the shipped assets and the composed templates", () => {
    expect(readdirSync(ASSETS).filter((f) => f.endsWith(".md")).length)
      .toBeGreaterThan(0);
    // Five Study templates: two dashboards, two kinds, one page.
    expect(AUTHORED.filter((a) => a.name.startsWith("Study / "))).toHaveLength(5);
  });

  for (const { name, text } of AUTHORED) {
    it(`${name} declares at most one scope property`, () => {
      const declared = keysOf(text()).filter((k) => SCOPE_PROPS.includes(k));
      const file = name;
      expect(
        declared,
        `${file} declares ${declared.length} scope properties (${declared.join(
          ", "
        )}); resolvePeriodBounds is first-match-wins and would silently pick one`
      ).toHaveLength(declared.length > 1 ? 0 : declared.length);
    });
  }

  // The three period dashboards must each actually declare their scope, or
  // resolvePeriodBounds falls through to a plain 30-day window and the charts
  // quietly stop following the page. Note the check is for the key's
  // *presence*, not a value: all three ship blank and mean "the current one".
  // COMPOSED, NOT READ FROM DISK since 2.59.3 — the four dashboards come from
  // the diary section catalogue. The check is unchanged in substance: each must
  // declare its scope property, or resolvePeriodBounds falls through to a plain
  // 30-day window and every chart on the page quietly stops following it.
  const expected: { grain: DashboardGrain; prop: string }[] = [
    { grain: "weekly", prop: "week-start" },
    { grain: "monthly", prop: "month-start" },
    { grain: "quarterly", prop: "quarter-start" },
    { grain: "yearly", prop: "year-start" },
  ];

  for (const { grain, prop } of expected) {
    it(`the ${grain} dashboard declares ${prop}`, () => {
      const keys = keysOf(composeDiaryDashboard(grain));
      expect(keys).toContain(prop);
      // Presence, not value: all four ship blank and mean "the current one".
      expect(keys.filter((k) => SCOPE_PROPS.includes(k))).toHaveLength(1);
    });
  }
});

describe("scope dashboards are configured paths", () => {
  // Every scope dashboard is a real, renameable path in settings — the quarter
  // note joined the diary root in 2.26 and must be reachable the same way the
  // year note is, or "Set up / repair vault" would create it somewhere the
  // widgets never look.
  it("the quarter note sits under the diary root", () => {
    expect(quarterOverviewPath(DEFAULT_PATHS).startsWith(DEFAULT_PATHS.diaryRoot)).toBe(true);
    expect(quarterOverviewPath(DEFAULT_PATHS).endsWith(".md")).toBe(true);
  });

  it("the quarter note is not the year note", () => {
    // A single note cannot hold two scopes (see resolvePeriodBounds), so these
    // being distinct files is load-bearing rather than cosmetic.
    expect(quarterOverviewPath(DEFAULT_PATHS)).not.toBe(yearOverviewPath(DEFAULT_PATHS));
  });
});
