// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import { TFile } from "./obsidian-stub";
import {
  daysInQuarter,
  quarterOfDate,
  quarterStartDate,
  quarterStats,
  quarterWindow,
} from "../src/review/quarter-stats";
import { IndexedEntry } from "../src/diary/diary-index";
import { resolveChartWindow } from "../src/charts/charts";

function daily(iso: string, over: Partial<IndexedEntry> = {}): IndexedEntry {
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

// A Monthly Entry, with the body regions the quarter rolls up. `iso` is the
// review's `journal-date` — the 1st of its month, as openOrCreateMonth writes.
function review(
  monthKey: string,
  regions: { key: string; content: string }[],
  title = ""
): IndexedEntry {
  const file = new TFile(`02 - Diary/Monthly/Month-${monthKey}.md`);
  return {
    ...daily(`${monthKey}-01`),
    path: file.path,
    file: file as unknown as IndexedEntry["file"],
    kind: "monthly",
    title,
    regions,
  };
}

describe("quarterOfDate", () => {
  it("maps a date onto its quarter key", () => {
    expect(quarterOfDate("2026-01-31")).toBe("2026-Q1");
    expect(quarterOfDate("2026-03-01")).toBe("2026-Q1");
    expect(quarterOfDate("2026-04-01")).toBe("2026-Q2");
    expect(quarterOfDate("2026-07-14")).toBe("2026-Q3");
    expect(quarterOfDate("2026-12-31")).toBe("2026-Q4");
  });
});

describe("quarterStartDate", () => {
  // This is the value written into `quarter-start`, so resolvePeriodBounds has
  // to be able to read it straight back — always the 1st of the first month.
  it("is the first day of the quarter's first month", () => {
    expect(quarterStartDate("2026-Q1")).toBe("2026-01-01");
    expect(quarterStartDate("2026-Q2")).toBe("2026-04-01");
    expect(quarterStartDate("2026-Q3")).toBe("2026-07-01");
    expect(quarterStartDate("2026-Q4")).toBe("2026-10-01");
  });
});

describe("daysInQuarter", () => {
  it("sums the three months, leap-aware", () => {
    expect(daysInQuarter("2026-Q1")).toBe(31 + 28 + 31);
    expect(daysInQuarter("2024-Q1")).toBe(31 + 29 + 31); // leap
    expect(daysInQuarter("2026-Q2")).toBe(30 + 31 + 30);
    expect(daysInQuarter("2026-Q3")).toBe(31 + 31 + 30);
    expect(daysInQuarter("2026-Q4")).toBe(31 + 30 + 31);
  });
});

describe("quarterWindow", () => {
  it("a finished quarter spans its full bounds", () => {
    expect(quarterWindow("2026-Q1", "2026-07-25")).toEqual({
      start: "2026-01-01",
      end: "2026-03-31",
      fullEnd: "2026-03-31",
      partial: false,
    });
  });

  // The running quarter is clipped to today, so the coverage rate divides by
  // days that have actually happened rather than by the whole quarter — the
  // same reason yearWindow clips, one scale down.
  it("a running quarter ends today and says it is partial", () => {
    expect(quarterWindow("2026-Q3", "2026-07-25")).toEqual({
      start: "2026-07-01",
      end: "2026-07-25",
      fullEnd: "2026-09-30",
      partial: true,
    });
  });

  it("a quarter entirely ahead of today is an empty window, not 92 blank days", () => {
    const w = quarterWindow("2026-Q4", "2026-07-25");
    expect(w.start).toBe("2026-10-01");
    expect(w.end).toBe("2026-10-01");
    expect(w.partial).toBe(true);
  });
});

describe("quarterStats", () => {
  const TODAY = "2026-08-15";

  it("counts daily entries in the quarter, and only up to today", () => {
    const s = quarterStats(
      "2026-Q3",
      [
        daily("2026-06-30"), // previous quarter
        daily("2026-07-02"),
        daily("2026-07-03"),
        daily("2026-08-14"),
        daily("2026-09-20"), // inside the quarter but in the future
      ],
      TODAY
    );
    expect(s.dailyCount).toBe(3);
    expect(s.partial).toBe(true);
    expect(s.daysInQuarter).toBe(92);
  });

  it("returns three month rollups even when nothing was written", () => {
    const s = quarterStats("2026-Q3", [], TODAY);
    expect(s.months.map((m) => m.monthKey)).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
    expect(s.reviewsWritten).toBe(0);
    expect(s.months.every((m) => m.path === null)).toBe(true);
  });

  // A month with no review is an explicit gap, not an omitted row: dropping it
  // would make a two-month quarter look like a complete one.
  it("marks a month that hasn't happened as future, and one that was skipped as not", () => {
    const s = quarterStats("2026-Q3", [], TODAY);
    expect(s.months.map((m) => m.future)).toEqual([false, false, true]);
  });

  it("rolls up focus, highlights and challenges under the month that wrote them", () => {
    const s = quarterStats(
      "2026-Q3",
      [
        review("2026-07", [
          { key: "focus", content: "Ship the rewrite\n" },
          { key: "highlights", content: "Shipped 2.25\nWent to the coast\n" },
          { key: "challenges", content: "Sleep was poor\n" },
          { key: "log", content: "Three paragraphs of prose that must not appear." },
        ]),
        review("2026-08", [{ key: "highlights", content: "Rested\n" }]),
      ],
      TODAY
    );

    expect(s.reviewsWritten).toBe(2);
    expect(s.months[0].focus).toBe("Ship the rewrite");
    expect(s.months[0].highlights).toEqual(["Shipped 2.25", "Went to the coast"]);
    expect(s.months[0].challenges).toEqual(["Sleep was poor"]);
    expect(s.months[1].highlights).toEqual(["Rested"]);
    expect(s.months[2].highlights).toEqual([]);
  });

  // `log` is free prose and deliberately not rolled up. Pinned as a test
  // because "it renders nothing" is exactly the kind of intentional absence a
  // later change reintroduces by accident.
  it("never surfaces the monthly log region", () => {
    const s = quarterStats(
      "2026-Q3",
      [review("2026-07", [{ key: "log", content: "Long prose." }])],
      TODAY
    );
    const m = s.months[0];
    expect(m.focus).toBe("");
    expect(m.highlights).toEqual([]);
    expect(m.challenges).toEqual([]);
    expect(m.goals).toEqual([]);
  });

  it("counts goals set versus met across the whole quarter", () => {
    const s = quarterStats(
      "2026-Q3",
      [
        review("2026-07", [
          { key: "todo", content: "- (x) Finish the plan\n- ( ) Call the dentist" },
        ]),
        review("2026-08", [
          { key: "todo", content: "- (x) Book the trip [priority:: high]" },
        ]),
      ],
      TODAY
    );
    expect(s.goalsDone).toBe(2);
    expect(s.goalsOpen).toBe(1);
    expect(s.months[0].goals).toEqual([
      { text: "Finish the plan", done: true },
      { text: "Call the dentist", done: false },
    ]);
    expect(s.months[1].goals[0].text).toBe("Book the trip");
  });

  it("takes only the first line of focus, since the slot is sized for a phrase", () => {
    const s = quarterStats(
      "2026-Q3",
      [review("2026-07", [{ key: "focus", content: "\n\nConsolidate\nStray second line" }])],
      TODAY
    );
    expect(s.months[0].focus).toBe("Consolidate");
  });

  it("divides coverage by elapsed days, not by the whole quarter", () => {
    // Two days into Q3: 2 entries out of 2 elapsed days is 100%, not 2%.
    const s = quarterStats(
      "2026-Q3",
      [daily("2026-07-01"), daily("2026-07-02")],
      "2026-07-02"
    );
    expect(s.daysElapsed).toBe(2);
    expect(s.entryRate).toBe(1);
  });

  it("a quarter that hasn't started has no elapsed days and no divide-by-zero", () => {
    const s = quarterStats("2026-Q4", [], "2026-07-25");
    expect(s.daysElapsed).toBe(0);
    expect(s.entryRate).toBe(0);
  });
});

// Charts on the quarter note are the ordinary charts manager, scoped by each
// chart's `period` range against the note's `quarter-start`.
describe("quarter-scoped chart windows", () => {
  const quarter = {
    start: "2026-07-01",
    end: "2026-09-30",
    unit: "quarter" as const,
  };

  it("shows the quarter exactly for a heatmap or summary", () => {
    expect(resolveChartWindow("period", quarter, false, "2026-08-15")).toEqual({
      start: "2026-07-01",
      end: "2026-09-30",
    });
  });

  // The load-bearing one. A week widens to 30 days and a month to 90 so a short
  // period doesn't read as a few lonely points; a quarter must not, for the
  // year's reason one scale down — the page exists to bound one quarter, and a
  // chart quietly showing six months where it says three is close to invisible.
  it("does not widen a quarter for a trend chart", () => {
    expect(resolveChartWindow("period", quarter, true, "2026-08-15")).toEqual({
      start: "2026-07-01",
      end: "2026-09-30",
    });
  });

  it("still widens a month, so the zero is specific to the quarter", () => {
    const month = { start: "2026-07-01", end: "2026-07-31", unit: "month" as const };
    expect(resolveChartWindow("period", month, true, "2026-08-15").start).toBe(
      "2026-05-03"
    );
  });
});
