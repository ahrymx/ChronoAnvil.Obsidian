// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import {
  loggedDays,
  ROLLUP_FOLDER,
  rollupDateLabel,
  rollupDays,
  rollupGrainOf,
} from "../src/diary/entry-rollup";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { IndexedEntry } from "../src/diary/diary-index";
import { readCode } from "./sources";

// A minimal IndexedEntry. Only the fields rollupDays reads are meaningful; the
// rest exist to satisfy the type, the same shape quarter-stats.test.ts uses.
function entry(
  iso: string | null,
  regions: { key: string; content: string }[],
  kind = "daily"
): IndexedEntry {
  return {
    path: `02 - Diary/Weekly/Day-${iso}.md`,
    file: null as never,
    iso,
    surface: "diary",
    kind,
    title: "",
    mood: null,
    trackers: {},
    tags: [],
    events: [],
    text: "",
    regions,
    openTasks: 0,
    doneTasks: 0,
    attachments: 0,
    typeId: null,
    crumbs: [],
  };
}

const focus = (iso: string, text: string) =>
  entry(iso, [{ key: "focus", content: text }]);

describe("rollupDays", () => {
  it("gathers the focus line of each day in the window", () => {
    const days = rollupDays(
      [focus("2026-07-02", "ship the report"), focus("2026-07-01", "plan")],
      "2026-07-01",
      "2026-07-31"
    );
    expect(days.map((d) => d.iso)).toEqual(["2026-07-01", "2026-07-02"]);
    expect(days[1].values[0].items).toEqual(["ship the report"]);
  });

  it("reads forwards, not newest-first like the timeline", () => {
    // A review is composed by reading the month in the order it happened.
    // Every retrieval surface in the plugin is newest-first; this one isn't,
    // and the difference is deliberate.
    const days = rollupDays(
      [focus("2026-07-20", "c"), focus("2026-07-05", "a"), focus("2026-07-12", "b")],
      "2026-07-01",
      "2026-07-31"
    );
    expect(days.map((d) => d.values[0].items[0])).toEqual(["a", "b", "c"]);
  });

  it("omits a logged day that wrote nothing rollupable", () => {
    // Twenty-five blank rows is a reminder that you didn't write, not
    // information — the same argument anniversaries makes for empty years.
    const days = rollupDays(
      [
        focus("2026-07-01", "plan"),
        entry("2026-07-02", [{ key: "log", content: "some prose" }]),
        entry("2026-07-03", []),
      ],
      "2026-07-01",
      "2026-07-31"
    );
    expect(days.map((d) => d.iso)).toEqual(["2026-07-01"]);
  });

  it("never gathers the log region", () => {
    const days = rollupDays(
      [
        entry("2026-07-01", [
          { key: "focus", content: "plan" },
          { key: "log", content: "three paragraphs of prose" },
          { key: "capture", content: "a stray thought" },
        ]),
      ],
      "2026-07-01",
      "2026-07-31"
    );
    const flat = JSON.stringify(days);
    expect(flat).toContain("plan");
    expect(flat).not.toContain("three paragraphs");
    expect(flat).not.toContain("stray thought");
  });

  it("excludes days outside the window at both ends", () => {
    const days = rollupDays(
      [focus("2026-06-30", "before"), focus("2026-07-15", "in"), focus("2026-08-01", "after")],
      "2026-07-01",
      "2026-07-31"
    );
    expect(days.map((d) => d.values[0].items[0])).toEqual(["in"]);
  });

  it("ignores monthly reviews", () => {
    // The month's own review is what this page is being written into; rolling
    // it up beneath itself would quote the note back at its author.
    const days = rollupDays(
      [
        entry("2026-07-01", [{ key: "focus", content: "the theme" }], "monthly"),
        focus("2026-07-02", "a day"),
      ],
      "2026-07-01",
      "2026-07-31"
    );
    expect(days.map((d) => d.values[0].items[0])).toEqual(["a day"]);
  });

  it("skips a dateless note rather than sorting it to the front", () => {
    const days = rollupDays(
      [entry(null, [{ key: "focus", content: "no date" }]), focus("2026-07-02", "dated")],
      "2026-07-01",
      "2026-07-31"
    );
    expect(days).toHaveLength(1);
  });

  it("takes only the first line of a line field", () => {
    const days = rollupDays(
      [focus("2026-07-01", "the phrase\na second line someone pasted")],
      "2026-07-01",
      "2026-07-31"
    );
    expect(days[0].values[0].items).toEqual(["the phrase"]);
  });

  it("returns nothing for an empty window", () => {
    expect(rollupDays([], "2026-07-01", "2026-07-31")).toEqual([]);
  });
});

describe("loggedDays", () => {
  it("counts every daily entry in the window, written or not", () => {
    // The denominator of "6 of 28 entries": six days said something out of
    // twenty-eight logged is a different month from six out of six.
    const entries = [
      focus("2026-07-01", "plan"),
      entry("2026-07-02", []),
      entry("2026-07-03", [{ key: "log", content: "prose" }]),
      focus("2026-08-01", "next month"),
    ];
    expect(loggedDays(entries, "2026-07-01", "2026-07-31")).toBe(3);
  });

  it("excludes monthly reviews from the count", () => {
    const entries = [
      focus("2026-07-01", "plan"),
      entry("2026-07-01", [], "monthly"),
    ];
    expect(loggedDays(entries, "2026-07-01", "2026-07-31")).toBe(1);
  });
});

// ── 3.11 §5: the widget learns which grain it gathers ─────────────────

describe("which grain a rollup gathers", () => {
  const monthly = (iso: string, text: string) =>
    entry(iso, [{ key: "focus", content: text }], "monthly");

  it("reads day from a bare directive with no host to ask", () => {
    // The fallback for a caller holding no bounds, which is what a bare
    // directive read at every host before 1.0.48.
    expect(rollupGrainOf("")).toBe("daily");
    expect(rollupGrainOf("   ")).toBe("daily");
    expect(rollupGrainOf("", null)).toBe("daily");
  });

  it("reads month from the singular spelling", () => {
    // `:month`, matching `month-start` and `tasks-table:…,month` rather than
    // the index kind `monthly`. The fence language is singular throughout.
    expect(rollupGrainOf("month")).toBe("monthly");
    expect(rollupGrainOf("MONTH")).toBe("monthly");
    expect(rollupGrainOf("day")).toBe("daily");
    expect(rollupGrainOf("week")).toBe("weekly");
  });

  it("falls back rather than refusing an unknown argument", () => {
    // A typo renders the bare behaviour rather than an error box. The section
    // catalogue writes this argument, so a wrong one can only come from a
    // reader typing it, and the widget above it already explains itself.
    //
    // `weekly` IS STILL A TYPO even now that a week is a grain: the fence
    // language is singular, so `:week` is the spelling and `:weekly` is the
    // index kind leaking into a directive.
    expect(rollupGrainOf("weekly")).toBe("daily");
    expect(rollupGrainOf("nonsense")).toBe("daily");
    expect(rollupGrainOf("nonsense", "month")).toBe("weekly");
  });

  it("gathers monthly entries and ignores the days beside them", () => {
    // THE HALF OF §5 THAT IS REAL CODE. `rollupDays` filtered
    // `e.kind !== "daily"` with the spelling hardcoded, so a quarter could not
    // have rolled up months even where the section allowed it.
    const entries = [
      monthly("2026-01-01", "ship the thing"),
      monthly("2026-02-01", "rest"),
      focus("2026-01-14", "a day inside the same window"),
    ];
    const got = rollupDays(entries, "2026-01-01", "2026-03-31", "monthly");
    expect(got.map((d) => d.iso)).toEqual(["2026-01-01", "2026-02-01"]);
  });

  it("still gathers days when asked for days, with months present", () => {
    const entries = [
      monthly("2026-01-01", "ship the thing"),
      focus("2026-01-14", "a day"),
    ];
    expect(rollupDays(entries, "2026-01-01", "2026-03-31").map((d) => d.iso)).toEqual([
      "2026-01-14",
    ]);
  });

  it("counts logged entries of the grain it was asked for", () => {
    // `loggedDays` feeds the "2 of 3" pill. Counting days while listing months
    // would have made the pill read 0 of 31 on a quarter.
    const entries = [
      monthly("2026-01-01", "a"),
      monthly("2026-02-01", "b"),
      focus("2026-01-14", "a day"),
    ];
    expect(loggedDays(entries, "2026-01-01", "2026-03-31", "monthly")).toBe(2);
    expect(loggedDays(entries, "2026-01-01", "2026-03-31")).toBe(1);
  });

  it("keeps a month with no rollupable content out of the list", () => {
    // Same rule as for days, and worth pinning at the new grain: a blank row
    // is a reminder that you did not write rather than information.
    const entries = [
      entry("2026-01-01", [{ key: "log", content: "prose" }], "monthly"),
      monthly("2026-02-01", "wrote something"),
    ];
    expect(
      rollupDays(entries, "2026-01-01", "2026-03-31", "monthly").map((d) => d.iso)
    ).toEqual(["2026-02-01"]);
  });
});

// ── 1.0.48: A BARE DIRECTIVE IS ONE RUNG BELOW ITS HOST ───────────────

// THE BUG THIS IS THE GATE FOR. *"the diary section 'what the entries said'
// does not look correct on the monthly overview dashboard, where it shows the
// days for the entire month but should show the week grains."*
//
// The monthly dashboard composes `entry-rollup` bare, `rollupGrainOf` read a
// bare directive as `daily` whatever hosted it, and a month is two rungs above a
// day — so the one page in the vault written FROM four weekly reviews listed
// thirty-one days instead.
describe("the grain a bare rollup gathers", () => {
  it("is one rung below the host period, for each of the four units", () => {
    expect(rollupGrainOf("", "week")).toBe("daily");
    expect(rollupGrainOf("", "month")).toBe("weekly");
    expect(rollupGrainOf("", "quarter")).toBe("monthly");
    // A YEAR BREAKS THE RULE ON PURPOSE. One rung below a year is a quarter, and
    // a quarter is a review surface rather than a source — `year-stats` reads
    // `monthly` on the same argument. The section declines a year outright, so
    // this is only the answer for a reader who adds the card to one.
    expect(rollupGrainOf("", "year")).toBe("monthly");
  });

  it("lets an explicit argument override the rung, which is the only way to ask for days", () => {
    // The reader who wants their month listed by day has somewhere to say so,
    // and before this release they did not — `:day` and bare were one line typed
    // two ways.
    expect(rollupGrainOf("day", "month")).toBe("daily");
    expect(rollupGrainOf("month", "week")).toBe("monthly");
  });

  it("names a folder for every grain it can gather", () => {
    // THE TERNARY THIS REPLACED WAS EXHAUSTIVE OVER TWO GRAINS. The dispatcher
    // chose `diaryMonthly` for a month and `diaryDaily` for everything else, so
    // a weekly rollup would have watched the daily folder and sat still while a
    // week's focus was written under it. A record typed by `RollupGrain` cannot
    // gain a grain without gaining its folder.
    expect(ROLLUP_FOLDER).toEqual({
      daily: "diaryDaily",
      weekly: "diaryWeekly",
      monthly: "diaryMonthly",
    });
  });
});

describe("gathering weekly entries", () => {
  const week = (iso: string, text: string) =>
    entry(iso, [{ key: "focus", content: text }], "weekly");

  it("gathers the weeks in the month and ignores the days beside them", () => {
    const entries = [
      week("2026-08-31", "close the quarter out"),
      week("2026-09-07", "rest"),
      focus("2026-09-09", "a day inside the same window"),
      entry("2026-09-01", [{ key: "focus", content: "the month" }], "monthly"),
    ];
    expect(
      rollupDays(entries, "2026-09-01", "2026-09-30", "weekly").map((d) => d.iso)
    ).toEqual(["2026-09-07"]);
  });

  it("reads all four of a week's rollupable fields", () => {
    // THE HALF OF THIS THAT IS NOT IN THIS FILE. `rollupDays` filters on the
    // registry, and every weekly field was `rollup: "none"` — so a monthly
    // dashboard switched to weeks with the registry untouched would have drawn
    // an empty list and said "nothing to gather yet" about a month of written
    // weekly reviews. See `fields.test.ts` for the declarations themselves.
    const got = rollupDays(
      [
        entry(
          "2026-09-07",
          [
            { key: "focus", content: "ship it" },
            { key: "highlights", content: "- shipped\n- slept" },
            { key: "challenges", content: "- the build" },
            { key: "todo", content: "- (x) write the docs\n- ( ) the rest" },
            { key: "log", content: "free prose nobody rolls up" },
          ],
          "weekly"
        ),
      ],
      "2026-09-01",
      "2026-09-30",
      "weekly"
    );
    expect(got).toHaveLength(1);
    expect(got[0].values.map((v) => v.field.id)).toEqual([
      "focus",
      "highlights",
      "challenges",
      "todo",
    ]);
    expect(got[0].values.map((v) => v.field.rollupNoun)).toEqual([
      "Theme",
      "Highlights",
      "Challenges",
      "Goals",
    ]);
  });

  it("counts logged weeks for the pill rather than days", () => {
    const entries = [
      week("2026-09-07", "a"),
      week("2026-09-14", ""),
      focus("2026-09-09", "a day"),
    ];
    expect(loggedDays(entries, "2026-09-01", "2026-09-30", "weekly")).toBe(2);
    expect(
      rollupDays(entries, "2026-09-01", "2026-09-30", "weekly").map((d) => d.iso)
    ).toEqual(["2026-09-07"]);
  });
});

// ── AND THE SUBSCRIPTION UNDER IT (1.0.48) ────────────────────────────

// THE BUG THIS IS THE GATE FOR, AND IT IS A SILENT ONE. A rollup is a
// `liveScopedWidget`: it watches one folder and repaints when a file in it
// changes. The dispatcher picked that folder with `grain === "monthly" ?
// diaryMonthly : diaryDaily` — exhaustive over two grains, quietly wrong over
// three — so the first weekly rollup would have watched the DAILY folder and sat
// there while a week's focus was written underneath it. Nothing would have
// errored; the widget would simply have been stale until the note was reopened,
// which is the failure mode the comment beside that ternary already warns about
// for months.
//
// A SWEEP RATHER THAN A RENDER, because the suite has no DOM and this is a
// statement about which of two tables the dispatcher reads.
describe("the folder a rollup watches", () => {
  const src = readCode("ui/widgets");

  it("comes from the grain table rather than from a branch on one grain", () => {
    expect(src).toContain("this.plugin.settings.paths[ROLLUP_FOLDER[grain]]");
    expect(src).not.toContain('grain === "monthly"');
  });

  it("is chosen for the grain the host period asks for", () => {
    // The two halves that have to agree: the grain is derived from the host
    // note's period unit, and the folder is derived from that grain. A derived
    // grain with a hardcoded folder is the same defect with the branch moved.
    expect(src).toContain("resolvePeriodBounds(this.plugin, ctx)?.unit ?? null");
  });
});

// ── WHAT A ROW'S DATE PILL SAYS (1.0.48) ────────────────────────────

// TWO BUGS FROM ONE SCREENSHOT, and both are about a pill sized and worded for
// a day being handed something that is not one.
//
// *"weeks in month rollup should say the week days (in screenshot it says 7
// sept which is just the first day of the week). as for the quarter dashboard
// rollup, im not sure what g or p is hinting at, but I think it and the year
// can be replaced by a 3 letter shorthand month name."*
//
// The `g` and the `p` were "Aug" and "Sep" clipped by a 42px column whose
// overflow is cut off the FRONT — a quarter's rollup read "g 2026" and
// "p 2026". The week said "7 Sep", which is its `week-start` and reads as a
// daily row that lost its weekday.
describe("the date pill", () => {
  it("gives a week its days rather than the first of them", () => {
    expect(rollupDateLabel("2026-09-07", "weekly")).toEqual({
      figure: "7–13",
      unit: "Sep",
      title: "week of 7 Sep 2026",
    });
  });

  it("names both months when the week crosses one", () => {
    // "28–4 Sep" states a range that runs backwards. This is the only row in
    // the widget that can need two months, and a month's rollup holds at most
    // one of them.
    expect(rollupDateLabel("2026-09-28", "weekly")).toMatchObject({
      figure: "28–4",
      unit: "Sep–Oct",
    });
  });

  it("gives a month its name and no year", () => {
    // The year cannot vary inside one of these lists — a quarter holds three
    // months of one year, a year twelve — and the head above the list already
    // names the period. An empty `unit` is what tells the view to draw one span
    // rather than two, so this is the assertion that keeps the month's pill from
    // sitting 5px off the edge of every other row's.
    expect(rollupDateLabel("2026-08-01", "monthly")).toEqual({
      figure: "Aug",
      unit: "",
      title: "August 2026",
    });
  });

  it("leaves a day exactly as it was", () => {
    // The grain that was never wrong, pinned because both fixes above are
    // branches added beside it.
    expect(rollupDateLabel("2026-09-07", "daily")).toEqual({
      figure: "7",
      unit: "Mon",
      title: "Monday 7 September 2026",
    });
  });

  it("wears the grain so the sheet can size the column for it", () => {
    // THE WIDTH IS THE OTHER HALF OF THE CLIPPING BUG. `.ca-jer-date` is a
    // fixed 42px so every line of text starts on one edge; the fix is one width
    // per grain rather than a ragged column, and the view says which grain by a
    // state class on the root. A rule for a grain that the view never marks is a
    // rule that does nothing.
    const view = readCode("diary/entry-rollup");
    expect(view).toContain('daily: "is-daily"');
    expect(view).toContain('weekly: "is-weekly"');
    expect(view).toContain('monthly: "is-monthly"');
    expect(view).toContain('cls: ["ca-journal-table", "ca-jer-rollup", GRAIN_CLASS[grain]]');

    const sheet = readFileSync(
      resolve(__dirname, "..", "styles", "95-special-events.css"),
      "utf8"
    );
    expect(sheet).toContain(".ca-jer-rollup.is-weekly .ca-jer-date");
    expect(sheet).toContain(".ca-jer-rollup.is-monthly .ca-jer-date");
  });
});
