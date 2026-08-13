// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import { TFile } from "./obsidian-stub";
import {
  availableYears,
  daysBetween,
  daysInYear,
  longestStreak,
  yearStats,
  yearWindow,
  JournalNoteFact,
} from "../src/review/year-stats";
import { IndexedEntry } from "../src/diary/diary-index";
import { resolveChartWindow } from "../src/charts/charts";

function entry(iso: string, over: Partial<IndexedEntry> = {}): IndexedEntry {
  const file = new TFile(`02 - Diary/Weekly/Day-${iso}.md`);
  return {
    path: file.path,
    file: file as unknown as IndexedEntry["file"],
    iso,
    kind: "daily",
    title: `Day-${iso}`,
    mood: null,
    trackers: {},
    tags: [],
    events: [],
    text: "",
    regions: [],
    openTasks: 0,
    doneTasks: 0,
    attachments: 0,
    ...over,
  };
}

const lesson = (iso: string, completed: boolean): JournalNoteFact => ({ iso, completed });

describe("daysInYear", () => {
  it("handles common and leap years", () => {
    expect(daysInYear(2025)).toBe(365);
    expect(daysInYear(2024)).toBe(366);
  });

  it("handles the century rules", () => {
    expect(daysInYear(1900)).toBe(365);
    expect(daysInYear(2000)).toBe(366);
  });
});

describe("daysBetween", () => {
  it("counts inclusively", () => {
    expect(daysBetween("2026-01-01", "2026-01-01")).toBe(1);
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(31);
  });

  it("spans a leap day", () => {
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(3);
  });
});

describe("yearWindow", () => {
  it("clips a running year to today", () => {
    const w = yearWindow(2026, "2026-07-23");
    expect(w).toEqual({ start: "2026-01-01", end: "2026-07-23", partial: true });
  });

  it("gives a finished year its full bounds", () => {
    const w = yearWindow(2025, "2026-07-23");
    expect(w).toEqual({ start: "2025-01-01", end: "2025-12-31", partial: false });
  });

  it("treats 31 December as complete", () => {
    expect(yearWindow(2026, "2026-12-31").partial).toBe(false);
  });

  // A future year must not render as 365 blank days.
  it("returns an empty window for a year not yet begun", () => {
    const w = yearWindow(2027, "2026-07-23");
    expect(w.start).toBe(w.end);
    expect(w.partial).toBe(true);
  });
});

describe("longestStreak", () => {
  it("finds the longest run and its bounds", () => {
    const r = longestStreak([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
      "2026-01-10",
    ]);
    expect(r.length).toBe(3);
    expect(r.start).toBe("2026-01-01");
    expect(r.end).toBe("2026-01-03");
  });

  it("returns zero for no dates", () => {
    expect(longestStreak([])).toEqual({ length: 0, start: null, end: null });
  });

  it("handles a single day", () => {
    expect(longestStreak(["2026-03-04"]).length).toBe(1);
  });

  it("ignores duplicates", () => {
    expect(longestStreak(["2026-01-01", "2026-01-01", "2026-01-02"]).length).toBe(2);
  });

  it("does not need sorted input", () => {
    expect(longestStreak(["2026-01-03", "2026-01-01", "2026-01-02"]).length).toBe(3);
  });

  it("counts across a month boundary", () => {
    expect(longestStreak(["2026-01-31", "2026-02-01"]).length).toBe(2);
  });

  it("counts across a leap day", () => {
    expect(
      longestStreak(["2024-02-28", "2024-02-29", "2024-03-01"]).length
    ).toBe(3);
  });

  // Unlike util.ts::entryStreak this is not anchored to today, so a past
  // year's best run still reports.
  it("finds a run that ended long ago", () => {
    const r = longestStreak(["2020-05-01", "2020-05-02", "2020-05-03"]);
    expect(r.length).toBe(3);
  });
});

describe("yearStats", () => {
  const entries = [
    entry("2026-01-01", { doneTasks: 2, openTasks: 1 }),
    entry("2026-01-02", { doneTasks: 1 }),
    entry("2026-03-15"),
    entry("2025-06-01"), // different year
    entry("2026-02-01", { kind: "monthly" }), // a review, not a day
  ];
  const lessons = [
    lesson("2026-01-05", true),
    lesson("2026-02-10", true),
    lesson("2026-03-01", false),
    lesson("2025-01-05", true), // different year
  ];

  it("counts only daily entries in the year", () => {
    const s = yearStats(2026, entries, lessons, "2026-07-23");
    expect(s.entryCount).toBe(3);
  });

  // A monthly review summarises the days; counting it beside them would
  // inflate both the count and the rate past what actually happened.
  it("excludes monthly reviews from the entry count", () => {
    const s = yearStats(2026, entries, lessons, "2026-07-23");
    expect(s.entryCount).not.toBe(4);
  });

  it("marks a running year partial and ends it today", () => {
    const s = yearStats(2026, entries, lessons, "2026-07-23");
    expect(s.partial).toBe(true);
    expect(s.end).toBe("2026-07-23");
    expect(s.daysElapsed).toBe(204);
  });

  it("rates entries against elapsed days, not the whole year", () => {
    const s = yearStats(2026, [entry("2026-01-01")], [], "2026-01-02");
    expect(s.daysElapsed).toBe(2);
    expect(s.entryRate).toBeCloseTo(0.5);
  });

  it("aggregates tasks across the year's entries", () => {
    const s = yearStats(2026, entries, lessons, "2026-07-23");
    expect(s.tasksDone).toBe(3);
    expect(s.tasksOpen).toBe(1);
  });

  it("counts completed and started journal notes separately", () => {
    const s = yearStats(2026, entries, lessons, "2026-07-23");
    expect(s.notesCompleted).toBe(2);
    expect(s.notesStarted).toBe(3);
  });

  it("buckets entries by month", () => {
    const s = yearStats(2026, entries, lessons, "2026-07-23");
    expect(s.entriesByMonth[0]).toBe(2); // January
    expect(s.entriesByMonth[2]).toBe(1); // March
    expect(s.entriesByMonth[1]).toBe(0); // February — the review doesn't count
    expect(s.entriesByMonth).toHaveLength(12);
  });

  it("reports how many months have happened", () => {
    expect(yearStats(2026, entries, lessons, "2026-07-23").monthsElapsed).toBe(7);
    expect(yearStats(2025, entries, lessons, "2026-07-23").monthsElapsed).toBe(12);
  });

  it("handles a year with nothing in it", () => {
    const s = yearStats(2019, entries, lessons, "2026-07-23");
    expect(s.entryCount).toBe(0);
    expect(s.entryRate).toBe(0);
    expect(s.longestStreak).toBe(0);
    expect(s.notesCompleted).toBe(0);
  });

  it("handles a future year without dividing by zero", () => {
    const s = yearStats(2030, entries, lessons, "2026-07-23");
    expect(s.daysElapsed).toBe(0);
    expect(s.entryRate).toBe(0);
    expect(s.monthsElapsed).toBe(0);
  });

  it("reports a finished year in full", () => {
    const s = yearStats(2025, entries, lessons, "2026-07-23");
    expect(s.partial).toBe(false);
    expect(s.start).toBe("2025-01-01");
    expect(s.end).toBe("2025-12-31");
    expect(s.entryCount).toBe(1);
  });
});

describe("availableYears", () => {
  it("lists years with entries, newest first", () => {
    const years = availableYears(
      [entry("2024-01-01"), entry("2026-01-01"), entry("2025-01-01")],
      "2026-07-23"
    );
    expect(years).toEqual([2026, 2025, 2024]);
  });

  it("always offers the current year, even in an empty vault", () => {
    expect(availableYears([], "2026-07-23")).toEqual([2026]);
  });

  it("does not duplicate the current year", () => {
    expect(availableYears([entry("2026-03-01")], "2026-07-23")).toEqual([2026]);
  });
});

// Charts on the year note are the ordinary charts manager, scoped by each
// chart's `period` range against the note's `year-start`. These pin that the
// resolution is actually a calendar year — the reason the year view doesn't
// just reuse the existing `365` range.
describe("year-scoped chart windows", () => {
  const year = { start: "2025-01-01", end: "2025-12-31", unit: "year" as const };

  it("shows the year exactly for a heatmap or summary", () => {
    expect(resolveChartWindow("period", year, false, "2026-07-23")).toEqual({
      start: "2025-01-01",
      end: "2025-12-31",
    });
  });

  // A week or month is widened so a short period doesn't read as a few lonely
  // points. A year must not be: widening would bleed the previous year into a
  // view whose entire purpose is to show one year.
  it("does not widen a year for a trend chart", () => {
    expect(resolveChartWindow("period", year, true, "2026-07-23")).toEqual({
      start: "2025-01-01",
      end: "2025-12-31",
    });
  });

  it("still widens a week for a trend chart", () => {
    const week = { start: "2026-07-20", end: "2026-07-26", unit: "week" as const };
    expect(resolveChartWindow("period", week, true, "2026-07-23").start).toBe(
      "2026-06-27"
    );
  });

  // `365` is a rolling window ending today: asking it for "2025" would give
  // July-to-July. That's the whole reason `year` goes through `period`.
  it("is not the same as the rolling 365-day range", () => {
    const rolling = resolveChartWindow("365", null, true, "2026-07-23");
    expect(rolling.start).toBe("2025-07-24");
  });
});

describe("the year's authored rollup", () => {
  const review = (month: string, regions: { key: string; content: string }[]) =>
    entry(`${month}-01`, { kind: "monthly", regions, path: `M-${month}.md` });

  it("rolls up twelve months, present or not", () => {
    // A month with no review note is still a row: an unwritten month and an
    // unwritten field are the same shape, so the view draws one empty section
    // rather than branching.
    const s = yearStats(2026, [review("2026-03", [])], [], "2026-12-31");
    expect(s.months).toHaveLength(12);
    expect(s.months.map((m) => m.monthKey)[0]).toBe("2026-01");
    expect(s.reviewsWritten).toBe(1);
  });

  it("counts goals set versus met across the whole year", () => {
    const s = yearStats(
      2026,
      [
        review("2026-03", [{ key: "todo", content: "- (x) a\n- ( ) b" }]),
        review("2026-09", [{ key: "todo", content: "- (x) c" }]),
      ],
      [],
      "2026-12-31"
    );
    expect(s.goalsDone).toBe(2);
    expect(s.goalsOpen).toBe(1);
  });

  it("gathers highlights and challenges under the month that wrote them", () => {
    const s = yearStats(
      2026,
      [
        review("2026-03", [
          { key: "highlights", content: "loan approved\nbrother's birthday" },
          { key: "challenges", content: "slept badly" },
        ]),
      ],
      [],
      "2026-12-31"
    );
    const march = s.months[2];
    expect(march.highlights).toEqual(["loan approved", "brother's birthday"]);
    expect(march.challenges).toEqual(["slept badly"]);
  });

  it("never gathers the monthly log", () => {
    const s = yearStats(
      2026,
      [review("2026-03", [{ key: "log", content: "three paragraphs of prose" }])],
      [],
      "2026-12-31"
    );
    expect(JSON.stringify(s.months)).not.toContain("three paragraphs");
  });

  it("ignores reviews from other years", () => {
    const s = yearStats(2026, [review("2025-03", [])], [], "2026-12-31");
    expect(s.reviewsWritten).toBe(0);
  });

  it("keeps the current month's review, which the daily window would clip", () => {
    // Daily counts stop at today; monthly reviews don't. The review of the
    // month you are in the middle of is the one most likely to be open beside
    // this page, and clipping at today would drop it.
    const s = yearStats(2026, [review("2026-07", [])], [], "2026-07-05");
    expect(s.reviewsWritten).toBe(1);
  });

  it("marks months after this one as future", () => {
    const s = yearStats(2026, [], [], "2026-07-05");
    expect(s.months[6].future).toBe(false); // July, the current month
    expect(s.months[7].future).toBe(true); // August
  });

  it("does not count monthly reviews as diary entries", () => {
    const s = yearStats(2026, [review("2026-03", [])], [], "2026-12-31");
    expect(s.entryCount).toBe(0);
  });
});
