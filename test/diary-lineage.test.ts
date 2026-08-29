// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import { App, TFile } from "obsidian";
import {
  CONTAINING_GRAIN,
  containingPeriods,
  entriesOfGrain,
  entryFolder,
  entryNoteName,
  entryPath,
  legacyEntryPath,
  grainFallbackName,
  graphParentName,
  periodStart,
} from "../src/diary/lineage";
import type { ContainingPeriod } from "../src/diary/lineage";
import { CLASS_DEFS, TRACKER_CLASSES } from "../src/trackers/trackers";
import { DEFAULT_PATHS } from "../src/core/constants";
import { graphLinksSection, setGraphLinks } from "../src/core/note-sections";
import { composeEntryTemplate } from "../src/diary/entry-sections";
import { moment } from "../src/core/util";

// ── The diary's spine ─────────────────────────────────────────────────────
//
// 4.68 gave every note ONE parent and said the point was depth — "a daily entry
// is inside a week inside the diary". What it shipped was depth between GRAINS:
// every day named `02 - Diary`, so the graph drew a star per grain and no
// vault's stream ever ran Year → Quarter → Month → Week → Day. These pin the
// hop-by-hop version of that claim, and the two properties that make it safe to
// draw: every name resolves to a note the creator would write, and nothing is
// ever named that does not exist.

describe("what contains what", () => {
  it("walks day → week → month → quarter → year and stops", () => {
    expect(containingPeriods("daily", "2026-08-29").map((p) => p.name)).toEqual([
      "Week-2026-W35",
      "Month-2026-08",
      "Quarter-2026-Q3",
      "Year-2026",
    ]);
    expect(containingPeriods("weekly", "2026-08-24").map((p) => p.name)).toEqual(
      ["Month-2026-08", "Quarter-2026-Q3", "Year-2026"]
    );
    expect(containingPeriods("monthly", "2026-08").map((p) => p.name)).toEqual([
      "Quarter-2026-Q3",
      "Year-2026",
    ]);
    expect(
      containingPeriods("quarterly", "2026-07-01").map((p) => p.name)
    ).toEqual(["Year-2026"]);
    // The year is where the periods stop. Not a gap — see CONTAINING_GRAIN.
    expect(containingPeriods("yearly", "2026-01-01")).toEqual([]);
  });

  it("gives every grain but the year exactly one parent", () => {
    for (const grain of TRACKER_CLASSES) {
      expect(CONTAINING_GRAIN[grain], grain).toBe(
        grain === "yearly" ? null : CONTAINING_GRAIN[grain]
      );
    }
    // The chain is a chain: following it from the shortest grain reaches the
    // longest, so no grain can be orphaned by a table edit.
    let g = CONTAINING_GRAIN["daily"];
    const walked = ["daily"];
    while (g) {
      walked.push(g);
      g = CONTAINING_GRAIN[g];
    }
    expect(walked).toEqual(TRACKER_CLASSES);
  });

  it("hands each period the date its own creator takes", () => {
    const [week, month, quarter, year] = containingPeriods(
      "daily",
      "2026-08-29"
    );
    // A period's start, because that is what `openOrCreatePeriodEntry` and
    // `openOrCreateMonth` are given — never the date of the entry inside it.
    expect(week.startIso).toBe("2026-08-24"); // the Monday
    expect(month.startIso).toBe("2026-08-01");
    expect(quarter.startIso).toBe("2026-07-01");
    expect(year.startIso).toBe("2026-01-01");
  });

  it("refuses to guess from a date it cannot read", () => {
    expect(containingPeriods("daily", "")).toEqual([]);
    expect(containingPeriods("daily", "not a date")).toEqual([]);
  });
});

// ── The names have to be the creator's names ──────────────────────────────
//
// An unresolved wikilink is not inert: Obsidian's graph draws a node for it. So
// a link naming a week the creator would spell differently is not a typo, it is
// a phantom node and a chain that stops there — the same class of bug as the
// four folder names that survived eleven releases in `graphLinksSection`.

describe("naming a period's note", () => {
  it("spells every grain the way the class table does", () => {
    const at = moment("2026-08-29");
    for (const grain of TRACKER_CLASSES) {
      const def = CLASS_DEFS[grain];
      expect(entryNoteName(grain, at), grain).toBe(
        `${def.filePrefix}${periodStart(grain, at).format(def.fileFormat)}`
      );
    }
    expect(entryNoteName("daily", at)).toBe("Day-2026-08-29");
    expect(entryNoteName("weekly", at)).toBe("Week-2026-W35");
    expect(entryNoteName("monthly", at)).toBe("Month-2026-08");
    expect(entryNoteName("quarterly", at)).toBe("Quarter-2026-Q3");
    expect(entryNoteName("yearly", at)).toBe("Year-2026");
  });

  // THE ONE THAT COST A COMMENT IN `entryNoteName`. `YYYY-[W]WW` pairs a
  // CALENDAR year with an ISO week number, so 1 January 2027 formats as
  // `2027-W53` while the file made from that week's Monday is `Week-2026-W53`.
  // Snapping to the period's start before formatting is what makes both sides
  // spell the same week.
  it("names the week a year boundary falls in the way the file is named", () => {
    // The Monday of the week holding 1 Jan 2027 is 28 Dec 2026.
    const fromTheWeeksOwnStart = entryNoteName("weekly", moment("2026-12-28"));
    expect(fromTheWeeksOwnStart).toBe("Week-2026-W53");
    for (const day of ["2026-12-31", "2027-01-01", "2027-01-03"]) {
      expect(
        containingPeriods("daily", day)[0].name,
        day
      ).toBe(fromTheWeeksOwnStart);
    }
    // And the other direction: a week starting in December that belongs to the
    // next ISO year keeps the spelling its own Monday produces.
    expect(containingPeriods("daily", "2025-12-31")[0].name).toBe(
      entryNoteName("weekly", moment("2025-12-29"))
    );
  });

  // ── THE PERIOD TREE ────────────────────────────────────────────────────
  //
  // A new entry is filed under the periods that contain it, and a period's own
  // note is its folder's folder note — the convention a journal subject already
  // uses. A day has no folder because a day contains nothing.
  it("files a new entry under the periods that contain it", () => {
    expect(entryPath(DEFAULT_PATHS, "daily", "2026-08-29")).toBe(
      "02 - Diary/Entries/Year-2026/Quarter-2026-Q3/Month-2026-08/Week-2026-W35/Day-2026-08-29.md"
    );
    expect(entryPath(DEFAULT_PATHS, "weekly", "2026-08-24")).toBe(
      "02 - Diary/Entries/Year-2026/Quarter-2026-Q3/Month-2026-08/Week-2026-W35/Week-2026-W35.md"
    );
    expect(entryPath(DEFAULT_PATHS, "monthly", "2026-08")).toBe(
      "02 - Diary/Entries/Year-2026/Quarter-2026-Q3/Month-2026-08/Month-2026-08.md"
    );
    expect(entryPath(DEFAULT_PATHS, "quarterly", "2026-07-01")).toBe(
      "02 - Diary/Entries/Year-2026/Quarter-2026-Q3/Quarter-2026-Q3.md"
    );
    expect(entryPath(DEFAULT_PATHS, "yearly", "2026-01-01")).toBe(
      "02 - Diary/Entries/Year-2026/Year-2026.md"
    );
  });

  it("puts a week's own note in the folder its days go in", () => {
    // The one property the tree is FOR: a reader who opens the week folder sees
    // the week's note and the seven days it holds, not eight files in a list of
    // three hundred.
    expect(entryFolder(DEFAULT_PATHS, "daily", "2026-08-29")).toBe(
      entryFolder(DEFAULT_PATHS, "weekly", "2026-08-24")
    );
  });

  // The straddle, on disk this time. In the graph `Day-2026-08-31` names
  // `Month-2026-08` because a day is in its own month; a file has one location
  // and its week belongs to September, so this is where the tree and the links
  // deliberately differ.
  it("files a straddling week's days with the week", () => {
    expect(entryPath(DEFAULT_PATHS, "daily", "2026-08-31")).toBe(
      "02 - Diary/Entries/Year-2026/Quarter-2026-Q3/Month-2026-09/Week-2026-W36/Day-2026-08-31.md"
    );
    expect(containingPeriods("daily", "2026-08-31")[1].name).toBe(
      "Month-2026-08"
    );
  });

  it("still knows where a vault written before 4.81 filed the same entry", () => {
    expect(legacyEntryPath(DEFAULT_PATHS, "daily", "2026-08-29")).toBe(
      `${DEFAULT_PATHS.diaryDaily}/Day-2026-08-29.md`
    );
    expect(legacyEntryPath(DEFAULT_PATHS, "quarterly", "2026-07-01")).toBe(
      `${DEFAULT_PATHS.diaryQuarterly}/Quarter-2026-Q3.md`
    );
  });
});

// ── The week is the only grain that can straddle its parent ───────────────

describe("a week that spans two months", () => {
  // Week 36 of 2026 runs 31 Aug – 6 Sep. Decided from its Thursday, which is
  // the ISO rule that already decides its number and the rule `rowWeekKey` uses
  // to underline a calendar row.
  it("belongs to the month holding four of its seven days", () => {
    expect(containingPeriods("weekly", "2026-08-31").map((p) => p.name)).toEqual(
      ["Month-2026-09", "Quarter-2026-Q3", "Year-2026"]
    );
  });

  it("still puts each of its days in the day's own month", () => {
    const august = containingPeriods("daily", "2026-08-31");
    expect(august[0].name).toBe("Week-2026-W36");
    expect(august[1].name).toBe("Month-2026-08");
    const september = containingPeriods("daily", "2026-09-01");
    expect(september[0].name).toBe("Week-2026-W36");
    expect(september[1].name).toBe("Month-2026-09");
  });

  // The same rule at a year boundary: the week of 28 Dec 2026 – 3 Jan 2027 has
  // its Thursday on 31 December, so it is December's and 2026's.
  it("keeps a new year's week with the year its Thursday is in", () => {
    expect(containingPeriods("weekly", "2026-12-28").map((p) => p.name)).toEqual(
      ["Month-2026-12", "Quarter-2026-Q4", "Year-2026"]
    );
  });
});

// ── Nothing is ever named that does not exist ─────────────────────────────

describe("choosing the link an entry carries", () => {
  const has =
    (...names: string[]) =>
    (p: ContainingPeriod) =>
      names.includes(p.name);

  it("names the nearest period that has a note", () => {
    expect(
      graphParentName("daily", "2026-08-29", has("Week-2026-W35"), DEFAULT_PATHS)
    ).toBe("Week-2026-W35");
    // No week, no month: it walks up rather than pointing at a note nobody made.
    expect(
      graphParentName("daily", "2026-08-29", has("Year-2026"), DEFAULT_PATHS)
    ).toBe("Year-2026");
    expect(
      graphParentName(
        "daily",
        "2026-08-29",
        has("Week-2026-W35", "Year-2026"),
        DEFAULT_PATHS
      )
    ).toBe("Week-2026-W35");
  });

  it("falls back to null when no period exists", () => {
    const none = () => false;
    expect(graphParentName("daily", "2026-08-29", none, DEFAULT_PATHS)).toBeNull();
    expect(graphParentName("weekly", "2026-08-24", none, DEFAULT_PATHS)).toBeNull();
    // A year has nothing above it in any vault, so it starts the entry tree
    // detached from the overview dashboards.
    expect(graphParentName("yearly", "2026-01-01", none, DEFAULT_PATHS)).toBeNull();
  });

  // DERIVED FROM THE CONFIGURED FOLDER, not written out. A reader who renames
  // the diary root still has a diary, and a literal `[[02 - Diary]]` would be a
  // phantom the moment they did.
  it("follows a renamed diary root", () => {
    const moved = {
      ...DEFAULT_PATHS,
      diaryRoot: "Journal",
      diaryDashboards: "Journal/Boards",
    };
    expect(grainFallbackName(moved, "daily")).toBeNull();
    expect(grainFallbackName(moved, "weekly")).toBeNull();
    expect(grainFallbackName(moved, "yearly")).toBeNull();
    expect(entryPath(moved, "weekly", "2026-08-24")).toBe(
      "Journal/Entries/Year-2026/Quarter-2026-Q3/Month-2026-08/Week-2026-W35/Week-2026-W35.md"
    );
  });

  it("falls back to null for all five grains", () => {
    const none = () => false;
    for (const grain of TRACKER_CLASSES) {
      expect(graphParentName(grain, "2026-08-29", none, DEFAULT_PATHS)).toBeNull();
    }
  });
});

// ── Re-aiming the hidden block ────────────────────────────────────────────

describe("setGraphLinks", () => {
  const linksIn = (text: string): string[] => {
    const m = /%% almanac-graph %%\n(.*)/.exec(text);
    return m ? [...m[1].matchAll(/\[\[([^\]|]+)\|/g)].map((x) => x[1]) : [];
  };

  it("re-aims the block a composed template arrives with", () => {
    for (const grain of TRACKER_CLASSES) {
      const filled = setGraphLinks(composeEntryTemplate(grain), [
        "Week-2026-W35",
      ]);
      expect(linksIn(filled), grain).toEqual(["Week-2026-W35"]);
      // One block, not two: the template's own link is replaced, not joined.
      expect(filled.match(/almanac-graph/g)?.length, grain).toBe(1);
    }
  });

  it("appends one to a note that has none", () => {
    const bare = "---\nweek-start: 2026-08-24\n---\n";
    const out = setGraphLinks(bare, ["Month-2026-08"]);
    expect(linksIn(out)).toEqual(["Month-2026-08"]);
    expect(out.startsWith(bare.trimEnd())).toBe(true);
  });

  it("is idempotent, which is what makes it safe on every creation", () => {
    const once = setGraphLinks(composeEntryTemplate("daily"), ["Week-2026-W35"]);
    expect(setGraphLinks(once, ["Week-2026-W35"])).toBe(once);
  });

  it("keeps the zero-width alias, so the link stays invisible", () => {
    const out = setGraphLinks(composeEntryTemplate("daily"), ["Year-2026"]);
    expect(out).toContain(graphLinksSection(["Year-2026"]).trim());
    expect(out).toContain("[[Year-2026|​]]");
  });

  it("does not mangle a name holding a replacement pattern", () => {
    const out = setGraphLinks(composeEntryTemplate("daily"), ["Diary $& Notes"]);
    expect(linksIn(out)).toEqual(["Diary $& Notes"]);
  });

  it("leaves a note alone when asked for no links at all", () => {
    const tpl = composeEntryTemplate("daily");
    expect(setGraphLinks(tpl, [])).toBe(tpl);
  });
});

// ── Finding the entries, in a vault that is half-migrated ─────────────────
//
// Twelve call sites walked `paths[<grain folder>]` and subtracted the folder
// note. Under the tree that folder holds only what was written before 4.81, so
// each of them would have gone quietly blind to new entries: no heat on the
// calendar, no underline, no entry in the picker, no sleep average. One walk
// answers for both layouts.

// A vault as `filesUnder` sees one: markdown paths and nothing else.
const vaultOf = (paths: readonly string[]): App =>
  ({
    vault: { getMarkdownFiles: (): TFile[] => paths.map((p) => new TFile(p)) },
  }) as unknown as App;

const HALF_MIGRATED = vaultOf([
  "Homepage.md",
  // Written before 4.81: flat, in the grain folders, dashboards as folder notes.
  "02 - Diary/Daily/Day-2026-07-01.md",
  "02 - Diary/Daily/Daily.md",
  "02 - Diary/Weekly/Week-2026-W27.md",
  "02 - Diary/Weekly/Weekly.md",
  // Written after: inside the periods that contain them.
  "02 - Diary/Entries/Year-2026/Year-2026.md",
  "02 - Diary/Entries/Year-2026/Quarter-2026-Q3/Quarter-2026-Q3.md",
  "02 - Diary/Entries/Year-2026/Quarter-2026-Q3/Month-2026-08/Month-2026-08.md",
  "02 - Diary/Entries/Year-2026/Quarter-2026-Q3/Month-2026-08/Week-2026-W35/Week-2026-W35.md",
  "02 - Diary/Entries/Year-2026/Quarter-2026-Q3/Month-2026-08/Week-2026-W35/Day-2026-08-29.md",
  // The dashboards at their 4.81 address, and a note that is not an entry.
  "02 - Diary/Dashboards/Weekly.md",
  "02 - Diary/Dashboards/Yearly.md",
  "02 - Diary/Entries/Year-2026/Quarter-2026-Q3/Month-2026-08/Groceries.md",
  // A reader's own note, outside the diary, whose name starts like an entry.
  "01 - Material/Week-in-review.md",
]);

describe("every entry of one grain", () => {
  const namesOf = (grain: Parameters<typeof entriesOfGrain>[2]): string[] =>
    entriesOfGrain(HALF_MIGRATED, DEFAULT_PATHS, grain)
      .map((f) => f.path)
      .sort();

  it("finds both layouts at once", () => {
    expect(namesOf("daily")).toEqual([
      "02 - Diary/Daily/Day-2026-07-01.md",
      "02 - Diary/Entries/Year-2026/Quarter-2026-Q3/Month-2026-08/Week-2026-W35/Day-2026-08-29.md",
    ]);
    expect(namesOf("weekly")).toEqual([
      "02 - Diary/Entries/Year-2026/Quarter-2026-Q3/Month-2026-08/Week-2026-W35/Week-2026-W35.md",
      "02 - Diary/Weekly/Week-2026-W27.md",
    ]);
    expect(namesOf("yearly")).toEqual(["02 - Diary/Entries/Year-2026/Year-2026.md"]);
  });

  it("returns no dashboard, at either of its two addresses", () => {
    // The dashboards carry the same properties as an entry — as a CURSOR onto
    // whatever period you last looked at — so counting one makes the current
    // period always claim an entry, and the claim moves as you browse.
    for (const grain of TRACKER_CLASSES) {
      const paths = entriesOfGrain(HALF_MIGRATED, DEFAULT_PATHS, grain).map(
        (f) => f.path
      );
      expect(paths, grain).not.toContain("02 - Diary/Dashboards/Weekly.md");
      expect(paths, grain).not.toContain("02 - Diary/Dashboards/Yearly.md");
      expect(paths, grain).not.toContain("02 - Diary/Weekly/Weekly.md");
      expect(paths, grain).not.toContain("02 - Diary/Daily/Daily.md");
    }
  });

  it("leaves alone what is not an entry", () => {
    const all = TRACKER_CLASSES.flatMap((g) => namesOf(g));
    // In the tree, only the prefix makes a note an entry — a shopping list
    // filed in the August folder is not a monthly review.
    expect(all).not.toContain(
      "02 - Diary/Entries/Year-2026/Quarter-2026-Q3/Month-2026-08/Groceries.md"
    );
    // And the prefixes are the plugin's, not the vault's: the scan is scoped to
    // the diary, so a reader's own `Week-in-review` stays their own note.
    expect(all).not.toContain("01 - Material/Week-in-review.md");
    expect(all).not.toContain("Homepage.md");
  });

  it("counts a file once when the grain folder is inside the diary", () => {
    // `02 - Diary/Daily` is under `02 - Diary`, so both passes reach the same
    // file. The default layout is this layout, so a duplicate here would double
    // every count the calendar and the period picker print.
    const daily = entriesOfGrain(HALF_MIGRATED, DEFAULT_PATHS, "daily");
    expect(new Set(daily.map((f) => f.path)).size).toBe(daily.length);
  });

  it("keeps an entry a reader renamed by hand in the old folder", () => {
    // The legacy pass is the OLD test — everything in the grain folder but its
    // note — because that is what the twelve callers promised. Only the tree
    // pass filters by prefix, where the prefix is the only thing that says what
    // a note is.
    const renamed = vaultOf([
      "02 - Diary/Daily/2026-07-02 Thursday.md",
      "02 - Diary/Daily/Daily.md",
    ]);
    expect(
      entriesOfGrain(renamed, DEFAULT_PATHS, "daily").map((f) => f.path)
    ).toEqual(["02 - Diary/Daily/2026-07-02 Thursday.md"]);
  });
});
