// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Habits rollup (1.0.55): the period overviews' first tracker section.
//
// WHAT IS WORTH ASSERTING, as everywhere in this suite: the arithmetic, which
// `trackers/habit-rollup.ts` holds and which has no DOM in it at all — the
// slots of a period, what a run over them is, and what a window's Save writes.
// The card and the window are then source-shape assertions.
//
// AND THE TWO FUNCTIONS THIS ONE DELIBERATELY DOES NOT CALL have tests of their
// own here, because "we did not reuse `streakStats`" is a claim a reader will
// want to see paid for: the Monday-and-Friday case is exactly the answer the
// cheaper reuse would have given, and the daily-grain cross-check against
// `longestStreak` is the other half — the two must agree where the coarser
// grains are what separates them.

import { describe, it, expect } from "vitest";
import { App, TFile } from "obsidian";
import {
  HABIT_ROLLUP_DIRECTIVE,
  HABIT_ROLLUP_PROBE,
  NO_STRIP_FLAG,
  habitRollupArg,
  habitRollupIds,
  habitRollupLine,
  habitRollupRows,
  habitRuns,
  habitSlots,
  noteWithHabitRollup,
  parseHabitRollupArg,
  rollupWindow,
} from "../src/trackers/habit-rollup";
import { rollupSub, stripCells, stripShade } from "../src/ui/widgets/habit-rollup-view";
import { longestStreak } from "../src/review/year-stats";
import { type HabitState } from "../src/trackers/habits";
import { DEFAULT_PATHS } from "../src/core/constants";
import { WIDGETS, isPageWidget } from "../src/core/widget-registry";
import {
  DIARY_SECTIONS,
  composeDiaryDashboard,
  detectDiarySections,
  diarySectionModel,
} from "../src/diary/diary-sections";
import { TRACKER_CLASSES, diarySurface, type TrackerDef } from "../src/trackers/trackers";
import { readSrc, readCode, cssRule, cssRules, fnBody } from "./sources";
import { BUNDLED_ASSETS } from "../generated/bundled-assets";

// A boolean tracker on one diary grain — a habit, which is what the type IS
// rather than a kind of its own (1.0.54's finding).
const habit = (id: string, grain = "daily"): TrackerDef =>
  ({
    id,
    label: id,
    type: "boolean",
    surface: diarySurface(grain as (typeof TRACKER_CLASSES)[number]),
  }) as TrackerDef;

// ── THE GRAMMAR ───────────────────────────────────────────────────────────
//
// One line, two answers in it, and the ordinary form has neither. The flag is
// a word in the comma list rather than a `#token` because `withToken` returns
// the line untouched when the argument has no key — `parseHabitRollupArg`'s own
// note carries the argument, and these are the forms it claims to read.
describe("the habit-rollup grammar", () => {
  it("reads the bare keyword as every habit, with strips", () => {
    expect(parseHabitRollupArg("")).toEqual({ ids: [], strip: true });
  });

  it("reads a list as the reader's order", () => {
    // ORDER IS THE ANSWER, not a set: the window's arrows write it and the card
    // draws it back. A parse that sorted would make the up arrow a no-op.
    expect(parseHabitRollupArg("Gym,Read").ids).toEqual(["Gym", "Read"]);
    expect(parseHabitRollupArg("Read,Gym").ids).toEqual(["Read", "Gym"]);
  });

  it("reads the flag anywhere in the list, and takes it out of the ids", () => {
    expect(parseHabitRollupArg("Read,no-strip")).toEqual({
      ids: ["Read"],
      strip: false,
    });
    // The `tasks-table:,period` idiom — a leading empty member is the "no
    // argument, one flag" spelling and must not arrive as an id.
    expect(parseHabitRollupArg(",no-strip")).toEqual({ ids: [], strip: false });
    expect(parseHabitRollupArg("no-strip,Read").ids).toEqual(["Read"]);
    expect(parseHabitRollupArg(" NO-STRIP ").strip).toBe(false);
  });

  it("round-trips every form through the writer", () => {
    for (const line of [
      "habit-rollup",
      "habit-rollup:Gym",
      "habit-rollup:Read,Gym",
      "habit-rollup:no-strip",
      "habit-rollup:Read,Gym,no-strip",
    ]) {
      const arg = line.includes(":") ? line.slice(line.indexOf(":") + 1) : "";
      const answer = parseHabitRollupArg(arg);
      expect(habitRollupLine(answer.ids, answer.strip)).toBe(line);
    }
  });

  it("writes no colon at all for the default", () => {
    // THE DEFAULT WRITES NOTHING — the attachments round's rule, pointed at
    // membership. A composed section is the bare keyword, so a habit defined
    // next month appears without anybody editing a note.
    expect(habitRollupLine([], true)).toBe(HABIT_ROLLUP_DIRECTIVE);
    expect(habitRollupArg([], true)).toBe("");
    expect(habitRollupLine([], false)).toBe(`habit-rollup:${NO_STRIP_FLAG}`);
  });

  it("drops the blanks a hand-edited line can carry", () => {
    expect(habitRollupArg([" Read ", "", "Gym"], true)).toBe("Read,Gym");
  });

  it("is anchored at both ends", () => {
    // `habit-rollup-weekly` would be a different keyword and `\b` alone would
    // match it — which is the mistake `locate` makes once and then draws the
    // wrong section's editor.
    expect(HABIT_ROLLUP_PROBE.test("habit-rollup")).toBe(true);
    expect(HABIT_ROLLUP_PROBE.test("habit-rollup:Read")).toBe(true);
    expect(HABIT_ROLLUP_PROBE.test("habit-rollup-weekly")).toBe(false);
    expect(HABIT_ROLLUP_PROBE.test("habit-rollupx")).toBe(false);
    // Not a mention of the word in prose, and not an indented one: the shipped
    // documentation note lists this keyword in a plain code block, which is the
    // fixture 1.0.54 found out the hard way that a probe needs.
    expect(HABIT_ROLLUP_PROBE.test("The habit-rollup widget")).toBe(false);
  });
});

// ── THE WINDOW A RATE IS MEASURED OVER ────────────────────────────────────
describe("rollupWindow", () => {
  const MONTH = ["2026-10-01", "2026-10-31"] as const;

  it("clips a running period to today", () => {
    // A MONTH HALF GONE MUST NOT READ AS HALF MISSED. This is the whole reason
    // the window exists, and `periodCoverage` is both the arithmetic and the
    // argument behind it.
    expect(rollupWindow(...MONTH, "2026-10-12")).toEqual({
      start: "2026-10-01",
      end: "2026-10-12",
    });
  });

  it("takes a finished period whole", () => {
    expect(rollupWindow(...MONTH, "2026-11-04")).toEqual({
      start: "2026-10-01",
      end: "2026-10-31",
    });
    // The last day of the period is still the period, not the day after it.
    expect(rollupWindow(...MONTH, "2026-10-31")).toEqual({
      start: "2026-10-01",
      end: "2026-10-31",
    });
  });

  it("refuses a period that has not begun", () => {
    // One click of the dashboard navigator gets a reader here. `null` rather
    // than an empty window or the whole one: a rate over a quarter nobody has
    // lived yet is a claim about nothing.
    expect(rollupWindow(...MONTH, "2026-09-30")).toBeNull();
  });
});

// ── THE SLOTS ─────────────────────────────────────────────────────────────
describe("habitSlots", () => {
  it("gives a daily habit one slot per day, inclusive at both ends", () => {
    const slots = habitSlots("daily", "2026-10-01", "2026-10-07");
    expect(slots).toHaveLength(7);
    expect(slots.map((s) => s.key)).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
    ]);
    // The key and the date are the same string on the daily grain, and the
    // label is the nav strip's — never a second date format.
    expect(slots[0].date).toBe("2026-10-01");
  });

  it("gives a monthly habit the month keys of a year", () => {
    const slots = habitSlots("monthly", "2026-01-01", "2026-12-31");
    expect(slots).toHaveLength(12);
    // `YYYY-MM`, which is what `entryDateKey` reads off a monthly entry — a
    // slot and the note that fills it have to meet on one string.
    expect(slots[0].key).toBe("2026-01");
    expect(slots[11].key).toBe("2026-12");
    // AND FEBRUARY IS NOT SKIPPED. Stepped from the window's start rather than
    // from the slot before it, because moment clamps a month-length step to the
    // landing month — `periodsAround` found that out first.
    expect(slots.map((s) => s.key)).toContain("2026-02");
  });

  it("drops a leading week whose Monday is in the month before", () => {
    // October 2026 opens on a Thursday, so the ISO week containing the 1st
    // begins on 2026-09-28. That week's readings belong to September's
    // dashboard — the one holding its Monday — and this is the `continue` that
    // says so.
    const slots = habitSlots("weekly", "2026-10-01", "2026-10-31");
    expect(slots.every((s) => s.date >= "2026-10-01")).toBe(true);
    expect(slots[0].date).toBe("2026-10-05");
  });

  it("steps a week by weeks, not by the unit it snaps with", () => {
    // `CLASS_DEFS.weekly.unit` is `isoWeek` so `startOf` lands on a Monday, and
    // `add` has no such unit — a walk that stepped by it would hand back one
    // Monday repeated, which is what the dedupe would then reduce to a single
    // slot. Four or five distinct Mondays is the whole assertion.
    const slots = habitSlots("weekly", "2026-10-01", "2026-10-31");
    expect(slots.length).toBeGreaterThan(3);
    expect(new Set(slots.map((s) => s.key)).size).toBe(slots.length);
  });

  it("is empty for a window that is not one", () => {
    expect(habitSlots("daily", "2026-10-05", "2026-10-01")).toEqual([]);
    expect(habitSlots("daily", "not a date", "2026-10-01")).toEqual([]);
  });

  it("caps the walk, and the cap cannot truncate a real year", () => {
    // A window that cannot terminate the loop is a hung render. 366 days is the
    // longest honest answer, so a leap year must come back whole.
    expect(habitSlots("daily", "2024-01-01", "2024-12-31")).toHaveLength(366);
    expect(
      habitSlots("daily", "2020-01-01", "2029-12-31").length
    ).toBeLessThanOrEqual(400);
  });
});

// ── THE RUNS ──────────────────────────────────────────────────────────────
describe("habitRuns", () => {
  const of = (states: HabitState[]): { state: HabitState }[] =>
    states.map((state) => ({ state }));

  it("counts consecutive SLOTS, which is the whole reason it exists", () => {
    // THE CASE THAT KILLS A `streakStats` SUBSTITUTION. Done Monday, nothing
    // Tuesday to Thursday, done Friday: `collectPoints` emits no point for an
    // unanswered day, so a streak over points reads 2 — a habit kept twice in a
    // week reported as a two-day run. Over the dense slot array it is 1.
    expect(habitRuns(of([1, null, null, null, 1]))).toEqual({
      current: 1,
      best: 1,
    });
  });

  it("breaks a run on a NO and on a day nobody answered alike", () => {
    // Nothing in the vault says the habit was kept that day, which is the only
    // thing a streak claims.
    expect(habitRuns(of([1, 1, 0, 1])).best).toBe(2);
    expect(habitRuns(of([1, 1, null, 1])).best).toBe(2);
  });

  it("reports the run ending at the window's last slot as the current one", () => {
    expect(habitRuns(of([1, 1, 1, 0, 1, 1]))).toEqual({ current: 2, best: 3 });
    // And zero when the last slot is not kept — which `rollupSub` then declines
    // to print, because "streak 0" reads as a broken counter.
    expect(habitRuns(of([1, 1, 1, 0])).current).toBe(0);
  });

  it("is empty for an empty period", () => {
    expect(habitRuns([])).toEqual({ current: 0, best: 0 });
  });

  it("agrees with longestStreak on the daily grain, exactly", () => {
    // THE OTHER HALF OF THE ARGUMENT. `longestStreak` compares `date + 1 day`,
    // which is right for days and wrong for every coarser grain — so the reason
    // it is not called is the coarser grains, not a disagreement about days.
    // If these two ever diverge on a daily habit, one of them is wrong.
    const cases: HabitState[][] = [
      [1, 1, 1, 0, 1],
      [1, null, null, null, 1],
      [0, 0, 0],
      [1, 1, 0, 1, 1, 1, 1],
      [null, 1, 1, null],
    ];
    const slots = habitSlots("daily", "2026-10-01", "2026-10-07");
    for (const states of cases) {
      const dates = states
        .map((state, i) => (state === 1 ? slots[i].date : null))
        .filter((d): d is string => d != null);
      expect(habitRuns(of(states)).best).toBe(longestStreak(dates).length);
    }
  });
});

// ── THE READ ──────────────────────────────────────────────────────────────
describe("habitRollupRows", () => {
  // One walk per grain is the performance claim, and this counter is how it is
  // measured rather than asserted: the stub counts the calls the real vault
  // would make.
  const vaultOf = (
    notes: Record<string, Record<string, unknown>>
  ): { app: App; reads: () => number } => {
    const files = Object.keys(notes).map((p) => new TFile(p));
    let reads = 0;
    const app = {
      vault: { getMarkdownFiles: (): TFile[] => files },
      metadataCache: {
        getFileCache: (f: TFile) => {
          reads++;
          return { frontmatter: notes[f.path] };
        },
      },
    } as unknown as App;
    return { app, reads: () => reads };
  };

  const DAILY = `${DEFAULT_PATHS.diaryDaily}`;
  const day = (iso: string, fm: Record<string, unknown>) => [
    `${DAILY}/Day-${iso}.md`,
    { "journal-date": iso, ...fm },
  ] as const;

  const WEEK = Object.fromEntries([
    day("2026-10-01", { Read: 1, Gym: 1 }),
    day("2026-10-02", { Read: 1, Gym: 0 }),
    day("2026-10-03", { Read: 1 }),
    day("2026-10-04", { Read: 0, Gym: 1 }),
    // 2026-10-05 has no entry at all.
    day("2026-10-06", { Read: 1, Gym: 1 }),
    day("2026-10-07", { Read: 1, Gym: 1 }),
  ]);

  const win = { start: "2026-10-01", end: "2026-10-07" };
  const habits = [habit("Read"), habit("Gym")];

  it("divides by the slots that have ELAPSED, not by the ones written", () => {
    // THE DENOMINATOR IS THE CARD'S CLAIM and this is the sentence the reader
    // accepted: "23 of 31". Dividing by the days that were answered would
    // report a perfect week to somebody who filled in four days of it, which is
    // the one way a stats card can mislead by arithmetic alone.
    const { app } = vaultOf(WEEK);
    const [read] = habitRollupRows(app, DEFAULT_PATHS, habits, win);
    expect(read.slots).toHaveLength(7);
    expect(read.done).toBe(5);
    expect(read.rate).toBeCloseTo(5 / 7);
    // And `written` is kept beside it, which is what lets the tooltip say how
    // much of the period was filled in at all.
    expect(read.written).toBe(6);
  });

  it("tells a NO, an unanswered day and a missing entry apart", () => {
    // 1.0.54's distinction, carried up a grain. `collectPoints` cannot make it —
    // it skips a null value — and it is the whole reason the frontmatter map
    // exists instead of the chart collector.
    const { app } = vaultOf(WEEK);
    const [, gym] = habitRollupRows(app, DEFAULT_PATHS, habits, win);
    const by = new Map(gym.slots.map((s) => [s.key, s]));
    expect(by.get("2026-10-02")).toMatchObject({ state: 0, written: true });
    expect(by.get("2026-10-03")).toMatchObject({ state: null, written: true });
    expect(by.get("2026-10-05")).toMatchObject({ state: null, written: false });
    // None of the three counts as kept, and only the last two are a gap in the
    // record rather than an answer.
    expect(gym.done).toBe(4);
    expect(gym.written).toBe(6);
  });

  it("reads each entry once however many habits there are", () => {
    // ONE WALK PER GRAIN. 1.0.54's week strip asks `locateEntry` seven times,
    // which is right for seven days and is 365 × N here — and the cost of this
    // one does not grow with the number of habits, which is the half that a
    // "reads the folder once" assertion alone would not catch.
    const one = vaultOf(WEEK);
    habitRollupRows(one.app, DEFAULT_PATHS, [habit("Read")], win);
    const many = vaultOf(WEEK);
    habitRollupRows(
      many.app,
      DEFAULT_PATHS,
      ["Read", "Gym", "Floss", "Walk", "Write"].map((id) => habit(id)),
      win
    );
    expect(many.reads()).toBe(one.reads());
    // And `locateEntry` is not in the module at all, which is the other way to
    // write the same claim.
    expect(readCode("habit-rollup")).not.toContain("locateEntry");
  });

  it("gives every registered habit a row, including one with nothing in it", () => {
    // A HABIT WITH NO READINGS IS STILL THE ANSWER. Dropping the row would be
    // the plugin deciding "you did not do this" is uninteresting, which is one
    // of the things a reader opens a rollup to find out.
    const { app } = vaultOf(WEEK);
    const rows = habitRollupRows(
      app,
      DEFAULT_PATHS,
      [...habits, habit("Floss")],
      win
    );
    expect(rows.map((r) => r.id)).toEqual(["Read", "Gym", "Floss"]);
    const floss = rows[2];
    expect(floss.done).toBe(0);
    expect(floss.rate).toBe(0);
    expect(floss.slots).toHaveLength(7);
  });

  it("has no slots and no rate for a period that has not started", () => {
    // `rollupWindow`'s `null`, carried through: 0/0 is not 0%.
    const { app } = vaultOf(WEEK);
    const [read] = habitRollupRows(app, DEFAULT_PATHS, habits, null);
    expect(read.slots).toEqual([]);
    expect(read.rate).toBeNull();
    expect(read).toMatchObject({ done: 0, written: 0, current: 0, best: 0 });
  });

  it("reads a habit at its OWN grain, not the dashboard's", () => {
    // THE DESIGN FACT SETTLED BEFORE ANY OF THIS WAS WRITTEN. The fields ladder
    // reads one rung down (1.0.48); a tracker is logged on its own surface and
    // nowhere else, so a monthly dashboard rolling a weekly habit up out of
    // daily entries would read notes that hold no readings at all.
    const { app } = vaultOf({
      ...WEEK,
      [`${DEFAULT_PATHS.diaryWeekly}/Week-2026-W40.md`]: {
        "week-start": "2026-09-28",
        Review: 1,
      },
      [`${DEFAULT_PATHS.diaryWeekly}/Week-2026-W41.md`]: {
        "week-start": "2026-10-05",
        Review: 1,
      },
    });
    const [review] = habitRollupRows(
      app,
      DEFAULT_PATHS,
      [habit("Review", "weekly")],
      { start: "2026-10-01", end: "2026-10-31" }
    );
    expect(review.grain).toBe("weekly");
    // Four or five Mondays in October, never 31 days — and W40's Monday is in
    // September, so its reading is not in this month's rate.
    expect(review.slots.length).toBeLessThan(6);
    expect(review.slots.map((s) => s.key)).not.toContain("2026-09-28");
    expect(review.done).toBe(1);
  });

  it("skips a tracker with no diary grain rather than guessing one", () => {
    const { app } = vaultOf(WEEK);
    const journal = {
      id: "Confident",
      label: "Confident",
      type: "boolean",
      surface: { kind: "journal", journals: [] },
    } as unknown as TrackerDef;
    expect(habitRollupRows(app, DEFAULT_PATHS, [journal], win)).toEqual([]);
  });
});

// ── THE STRIP ─────────────────────────────────────────────────────────────
describe("stripCells", () => {
  const slots = (states: HabitState[]) =>
    states.map((state, i) => ({
      key: `k${i}`,
      date: `d${i}`,
      label: `l${i}`,
      state,
      written: state != null,
    }));

  it("is one cell per slot while the period is short enough to be", () => {
    // A month and a quarter are both under the cap, so every day gets its own
    // mark — binary, because a day is done or not and shading it would invent a
    // quantity it does not have.
    const cells = stripCells(slots(Array(92).fill(1)));
    expect(cells).toHaveLength(92);
    expect(cells.every((c) => c.single)).toBe(true);
  });

  it("draws the empty slots rather than closing the gaps up", () => {
    // `drawStrip`'s own promise, kept: *"a strip that closed up its holes would
    // show a perfect month to somebody who logged four days"*. It is also why
    // `habitSlots` emits the empty days at all.
    const cells = stripCells(slots([1, null, 1]));
    expect(cells).toHaveLength(3);
    expect(cells[1]).toMatchObject({ single: true, state: null, written: false });
  });

  it("groups a year into sevens, with a density per group", () => {
    // 365 days is the only period that reaches the cap. Grouped from the
    // PERIOD'S OWN START rather than into ISO weeks, so every mark covers the
    // same span: a calendar grouping gives the first bucket however many days
    // are left in the week it begins in, and a three-day stub shaded over three
    // days reads as a bad week rather than a short one.
    const year = stripCells(slots(Array(364).fill(1)));
    expect(year).toHaveLength(52);
    expect(year.every((c) => !c.single)).toBe(true);
    expect(year[0].ratio).toBe(1);
  });

  it("shades a group by what it kept, and says nothing for an empty one", () => {
    const states: HabitState[] = Array(364).fill(null);
    for (let i = 0; i < 7; i++) states[i] = i < 3 ? 1 : 0;
    const cells = stripCells(slots(states));
    expect(cells[0].ratio).toBeCloseTo(3 / 7);
    // A group with no entry at all is `null`, not 0 — a week nobody logged is
    // not a week nobody kept, and the drawing has no class for the first.
    expect(cells[1].ratio).toBeNull();
    expect(cells[1].written).toBe(false);
  });

  it("names the span a grouped cell covers, since a 3px mark carries no date", () => {
    const cells = stripCells(slots(Array(364).fill(1)));
    expect(cells[0].label).toContain("l0");
    expect(cells[0].label).toContain("l6");
    expect(cells[0].label).toContain("7 of 7");
  });

  it("maps a density onto the four shades the chart strips use", () => {
    // A COLOUR MEANS THE SAME AMOUNT WHEREVER THIS PLUGIN DRAWS ONE, so the
    // mapping is four equal stops and the top one has to include a ratio of
    // exactly 1 — `* 4` would hand out a fifth class that no stylesheet has a
    // rule for, and a perfect week would come out unshaded.
    expect(stripShade(1)).toBe(4);
    expect(stripShade(0.999)).toBe(4);
    expect(stripShade(0.8)).toBe(4);
    expect(stripShade(0.75)).toBe(3);
    expect(stripShade(0.51)).toBe(3);
    expect(stripShade(0.5)).toBe(2);
    expect(stripShade(0.26)).toBe(2);
    expect(stripShade(0.25)).toBe(1);
    // THE SEVEN FRACTIONS A GROUP CAN ACTUALLY HAVE, which is the mapping a
    // reader meets: a week of 7 kept days is the top shade, 5 and 4 the third,
    // 3 and 2 the second, 1 the lightest.
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((n) => stripShade(n / 7))).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4,
    ]);
    // The floor is 1 and never 0: a group with nothing kept never reaches here,
    // because `drawStrip` leaves it classless — the base rule is what an empty
    // mark looks like, which is `tracker-stat.ts`'s argument for the same ramp.
    expect(stripShade(1 / 7)).toBe(1);
    expect(stripShade(0)).toBe(1);
    expect(readSrc("habit-rollup-view")).toContain(
      "el.addClass(`ca-act-${stripShade(cell.ratio)}`)"
    );
  });

  it("drops no slot when the last group is short", () => {
    const cells = stripCells(slots(Array(365).fill(1)));
    expect(cells).toHaveLength(53);
    expect(cells[52].ratio).toBe(1);
  });
});

describe("rollupSub", () => {
  const row = (over: Record<string, unknown>) =>
    ({
      id: "Read",
      label: "Read",
      grain: "daily",
      slots: Array(31).fill({ state: 1 }),
      done: 23,
      // DELIBERATELY NOT 31. The counts say what ELAPSED, not what was filled
      // in, and a fixture where the two agree cannot tell the two readings
      // apart — which is the arithmetic the card's whole claim rests on.
      written: 26,
      current: 5,
      best: 9,
      rate: 23 / 31,
      ...over,
    }) as Parameters<typeof rollupSub>[0];

  it("says the counts the ring cannot carry, in the accepted order", () => {
    expect(rollupSub(row({}))).toBe("23 of 31 · streak 5 · best 9");
  });

  it("omits a current run of zero", () => {
    // "streak 0" is a true statement that reads as a broken counter, and the
    // best run beside it already says what the habit is capable of.
    expect(rollupSub(row({ current: 0 }))).toBe("23 of 31 · best 9");
  });

  it("says so when the period has not started", () => {
    expect(rollupSub(row({ slots: [] }))).toBe("nothing yet");
  });
});

// ── THE WRITE ─────────────────────────────────────────────────────────────
describe("noteWithHabitRollup", () => {
  const note = [
    "```chronoanvil",
    "header:✅ Habits this month",
    "habit-rollup",
    "```",
  ];
  const body = { from: 1, to: 3 };

  it("rewrites the one line, leaving every other byte alone", () => {
    const out = noteWithHabitRollup(note, body, "habit-rollup", ["Read"], true);
    expect(out).toEqual([
      "```chronoanvil",
      "header:✅ Habits this month",
      "habit-rollup:Read",
      "```",
    ]);
  });

  it("returns null when the answer is what is already there", () => {
    // IDENTITY IS NOT A WRITE. The window's Save closes without touching the
    // file, which is what makes the `vault.modify` count a fact about the
    // reader's gesture rather than about every Save.
    expect(noteWithHabitRollup(note, body, "habit-rollup", [], true)).toBeNull();
    expect(
      noteWithHabitRollup(
        ["x", "habit-rollup:Read,Gym", "y"],
        { from: 0, to: 3 },
        "habit-rollup:Read,Gym",
        ["Read", "Gym"],
        true
      )
    ).toBeNull();
  });

  it("returns null when the line is no longer where the block says it is", () => {
    // The other half of the `null`, and the caller tells them apart by asking
    // first — a stale block range is a `notify.fail`, not a silent no-op.
    expect(
      noteWithHabitRollup(note, { from: 1, to: 2 }, "habit-rollup", ["Read"], true)
    ).toBeNull();
    expect(noteWithHabitRollup(note, body, "habit-rollup:Gone", ["Read"], true))
      .toBeNull();
  });

  it("rewrites the line it was opened on, not the first one in the file", () => {
    // A dashboard may hold two of these, and a window opened on one must not
    // rewrite the other — which is why the match is on the line AS RENDERED.
    const two = [
      "habit-rollup:Read",
      "",
      "habit-rollup:Gym",
    ];
    const out = noteWithHabitRollup(
      two,
      { from: 0, to: 3 },
      "habit-rollup:Gym",
      ["Gym", "Read"],
      true
    )!;
    expect(out[0]).toBe("habit-rollup:Read");
    expect(out[2]).toBe("habit-rollup:Gym,Read");
  });

  it("keeps the indentation a reader's own line has", () => {
    const out = noteWithHabitRollup(
      ["  habit-rollup"],
      { from: 0, to: 1 },
      "habit-rollup",
      [],
      false
    )!;
    expect(out[0]).toBe("  habit-rollup:no-strip");
  });

  it("reorders a membership without disturbing the flag, and the reverse", () => {
    const line = "habit-rollup:Read,Gym,no-strip";
    const moved = noteWithHabitRollup(
      [line],
      { from: 0, to: 1 },
      line,
      ["Gym", "Read"],
      false
    )!;
    expect(moved[0]).toBe("habit-rollup:Gym,Read,no-strip");
    const stripped = noteWithHabitRollup(
      [line],
      { from: 0, to: 1 },
      line,
      ["Read", "Gym"],
      true
    )!;
    expect(stripped[0]).toBe("habit-rollup:Read,Gym");
  });
});

describe("habitRollupIds", () => {
  const rows = (...on: [string, boolean][]) =>
    on.map(([id, shown]) => ({ id, shown }));
  const registry = ["Read", "Gym", "Floss"];

  it("collapses every habit ticked, in registry order, to the empty list", () => {
    // WHY THIS IS A FUNCTION rather than `rows.filter(shown).map(id)`. An
    // explicit list of everything looks identical on screen and is not the same
    // answer: it silently excludes the habit the reader defines next month, and
    // nothing on the dashboard would say why the new one never appeared.
    expect(
      habitRollupIds(rows(["Read", true], ["Gym", true], ["Floss", true]), registry)
    ).toEqual([]);
  });

  it("writes the list out when the reader hid one", () => {
    expect(
      habitRollupIds(rows(["Read", true], ["Gym", false], ["Floss", true]), registry)
    ).toEqual(["Read", "Floss"]);
  });

  it("writes the full list out for a reorder, because order is only a list", () => {
    // THE ONE PLACE THE TWO RULES MEET. A reader who ticks everything and moves
    // one row gets the full list — the alternative is a gesture the window
    // accepts and the note cannot hold.
    expect(
      habitRollupIds(rows(["Gym", true], ["Read", true], ["Floss", true]), registry)
    ).toEqual(["Gym", "Read", "Floss"]);
  });

  it("does not collapse a shorter list that happens to be in order", () => {
    expect(
      habitRollupIds(rows(["Read", true], ["Gym", true], ["Floss", false]), registry)
    ).toEqual(["Read", "Gym"]);
  });
});

// ── THE CATALOGUE ─────────────────────────────────────────────────────────
describe("the rollup in the tables", () => {
  it("is a page widget that needs a period", () => {
    const row = WIDGETS["habit-rollup"];
    expect(row).toBeTruthy();
    expect(row.category).toBe("trackers");
    expect(row.needs).toBe("period");
    expect(isPageWidget("habit-rollup")).toBe(true);
    // NO `arg`. Membership is a list and the add list asks one question — the
    // window is where a list is answered.
    expect(row.arg).toBeUndefined();
    expect(row.args).toBeUndefined();
  });

  it("does not collide with the Habits section's own bar", () => {
    // 1.0.54's `ALIAS_TITLES` row is `✅ Habits`, and `dropSoloBar` matches a
    // bar string EXACTLY — two sections whose titles were each other's prefix
    // would be fine, but two that were equal would not.
    expect(WIDGETS["habit-rollup"].bar).toBe("✅ Habits this period");
    expect(WIDGETS["habit-rollup"].bar).not.toBe("✅ Habits");
  });

  it("is composed on all four overviews, with the period in its title", () => {
    const want: Record<string, string> = {
      weekly: "✅ Habits this week",
      monthly: "✅ Habits this month",
      quarterly: "✅ Habits this quarter",
      yearly: "✅ Habits this year",
    };
    for (const [grain, title] of Object.entries(want)) {
      const text = composeDiaryDashboard(grain as "weekly");
      expect(detectDiarySections(text, { grain: grain as "weekly" })).toContain(
        "habit-rollup"
      );
      expect(text).toContain(`header:${title}`);
      expect(text).toContain("\nhabit-rollup\n");
    }
  });

  it("is offered in Trackers, unlocked and holding nothing", () => {
    const section = DIARY_SECTIONS.find((s) => s.id === "habit-rollup")!;
    expect(section.category).toBe("trackers");
    expect(section.locked).toBeFalsy();
    expect(section.band).toBe("body");
    // NO `holds`: the readings are in the entries, put there by the box on each
    // one. Removing this section removes a view of them, which is the whole
    // difference from `charts` — a chart spec exists nowhere else.
    expect(section.holds).toBeUndefined();
    expect(DIARY_SECTIONS.find((s) => s.id === "charts")!.holds).toBeTruthy();
  });

  it("is found by the editor after the reader hides three habits", () => {
    const section = DIARY_SECTIONS.find((s) => s.id === "habit-rollup")!;
    const text = composeDiaryDashboard("monthly").replace(
      "\nhabit-rollup\n",
      "\nhabit-rollup:Read,Gym,no-strip\n"
    );
    expect(section.locate!(text, { grain: "monthly" })).toBeGreaterThanOrEqual(0);
    expect(detectDiarySections(text, { grain: "monthly" })).toContain(
      "habit-rollup"
    );
  });

  it("goes on and comes off, byte for byte", () => {
    const model = diarySectionModel({ grain: "quarterly" });
    const text = composeDiaryDashboard("quarterly");
    const without = model.apply(
      text,
      detectDiarySections(text, { grain: "quarterly" }).filter(
        (id) => id !== "habit-rollup"
      )
    )!;
    expect(without).not.toContain("habit-rollup");
    const back = model.apply(
      without,
      detectDiarySections(text, { grain: "quarterly" })
    )!;
    expect(back).toBe(text);
  });

  it("is listed in the shipped documentation, with its flag", () => {
    const doc = BUNDLED_ASSETS["documentation.md"];
    expect(doc).toContain("`habit-rollup[:<habit ids>][,no-strip]`");
    // AND THE PROSE SAYS WHICH SURFACE EACH OF THE TWO IS FOR, which is the
    // one question a reader with both in the Trackers list will have.
    expect(doc).toContain("**The Habits rollup.**");
    expect(doc).toContain("**The Habits section.**");
  });
});

// ── THE DRAWING AND THE WINDOW ────────────────────────────────────────────
describe("the card's shape", () => {
  it("draws the ring through the one statRing definition", () => {
    // `vacuous-sweep-rule`, third shape: assert the CALL SITE. A second inline
    // SVG here would pass "the ring exists" and be the drift the extraction was
    // done to prevent.
    const view = readSrc("habit-rollup-view");
    expect(view).toContain("statRing(ring, row.rate ?? 0)");
    expect(view).not.toContain("<circle");
    expect(readSrc("stat-strip")).toContain("export function statRing(");
    expect(fnBody("statStrip", "stat-strip")).toContain("statRing(");
  });

  it("is live over the entries it is made of", () => {
    // Memory `live-widget-path-scope`: a widget made of WHICH files exist must
    // pass `shouldRefreshPath`, scoped to what its builder reads — the daily
    // folder, not the diary root.
    // Comments stripped, because the arm carries a paragraph of them between
    // the `case` and the call this is about.
    const index = readCode("widgets");
    expect(index).toContain('case "habit-rollup":');
    expect(index).toMatch(
      /case "habit-rollup":[\s\S]{0,80}liveScopedWidget\([\s\S]{0,120}paths\.diaryDaily/
    );
    expect(index).toMatch(
      /case "habit-rollup":[\s\S]{0,240}buildHabitRollup\(this\.plugin, ctx, rest\)/
    );
  });

  it("asks for the block's range at the save, never at the render", () => {
    // `block-drag.ts`'s rule and its reason: every write to this note moves the
    // lines under a range that was kept.
    const apply = fnBody("apply", "habit-rollup-view");
    expect(apply).toContain("ctx.getSectionInfo(anchor)");
    expect(apply).toContain("vault.read(file)");
    expect(apply).toContain("notify.fail");
  });

  it("has no writing control on it at all", () => {
    // READ-ONLY THROUGHOUT, which is the difference from 1.0.54's section. Every
    // mark belongs to another note — thirty of them on a month — so there is
    // nothing here a click could honestly change. The door and the window are
    // the only writers.
    const view = readCode("habit-rollup-view");
    expect(view).not.toContain("wireHabit");
    expect(view).not.toContain("setHabitState");
    expect(view).not.toContain("ca-journal-habit-box");
  });

  it("refuses a surface with no period, in a sentence", () => {
    const build = fnBody("buildHabitRollup", "habit-rollup-view");
    expect(build).toContain("resolvePeriodBounds");
    // THE BRANCH AND THE SENTENCE TOGETHER. A refusal nothing reaches reads
    // exactly like a refusal, and the whole point is the widget declining
    // rather than drawing a plausible, unrelated set of days.
    expect(readCode("habit-rollup-view")).toMatch(
      /if \(!period\) \{[\s\S]{0,300}habit-rollup needs a dashboard period\.[\s\S]{0,200}return root;/
    );
  });

  it("hangs the door inside the card and not on the bar", () => {
    // 1.0.49 §1's defect, avoided: the Categories control was hosted by the
    // `header:` line above its fence, and a fence written without one had no
    // door. *Show as widget* takes this section's bar off, so a control living
    // there would come and go with it.
    const door = fnBody("drawDoor", "habit-rollup-view");
    // THE EXACT CALL, because `ca-hrollup-foot` is a PREFIX of
    // `ca-hrollup-foot-note` and a `toContain` on the bare class passes on the
    // sentence two lines below it — which is a mutant renaming the container
    // surviving a test that reads like it names it.
    expect(door).toContain('createDiv({ cls: "ca-hrollup-foot" })');
    expect(door).toContain("ca-habits-door");
    expect(door).not.toContain("headTools");
    expect(door).toContain("isManagedTemplate");
  });

  it("keeps the coverage sentence out from behind the template refusal", () => {
    // The branch used to `return` before the note was appended, which would have
    // taken the one fact on that row with nothing to do with editing the line.
    const door = fnBody("drawDoor", "habit-rollup-view");
    const refusal = door.indexOf("isManagedTemplate");
    const note = door.indexOf("ca-hrollup-foot-note");
    expect(refusal).toBeGreaterThan(-1);
    expect(note).toBeGreaterThan(refusal);
    expect(door.slice(refusal, note)).not.toMatch(/\n {4}return;/);
  });

  it("shows the reader what they are choosing between", () => {
    const window = readSrc("habit-rollup-editor");
    // The window's counts are this period's, which is what a reader deciding
    // what to hide needs to see before they hide it.
    expect(window).toContain("ca-hrollup-count");
    expect(window).toContain("${row.done} of ${row.slots}");
    // And the empty list is unsayable, which is the grammar refusing rather
    // than taste: an empty list means EVERY habit, so a saved "none" would come
    // back as all of them ticked.
    // `protected validate()` — a class member rather than a function, so this
    // reads the module. THE GUARD AND NOT ONLY THE SENTENCE: a refusal whose
    // condition is gone still carries its wording, and the wording is the half
    // that does nothing.
    expect(window).toContain("protected validate(): string | null {");
    expect(window).toContain(
      "if (this.rows.length && !this.rows.some((r) => r.shown)) {"
    );
    expect(window).toContain("has nothing to report");
  });

  it("opens on what the card is showing, every habit when nothing is chosen", () => {
    const seeds = fnBody("rollupSeeds", "habit-rollup-view");
    expect(seeds).toContain("ids.length ? ids : all.map((r) => r.id)");
  });
});

// ── THE STYLESHEET ────────────────────────────────────────────────────────
describe("the rollup's CSS", () => {
  it("is one grid, and the rows are its items", () => {
    // 1.0.31's records-table fix for the third time (1.0.54's section was the
    // second). The same tracks on each row AS ITS OWN grid sizes each `auto`
    // track to that row's own content, so "100%" and "8%" being different
    // widths would start every name somewhere else.
    expect(cssRule(".ca-hrollup-list")).toContain("display: grid");
    expect(cssRule(".ca-hrollup-list")).toContain(
      "grid-template-columns: auto auto minmax(0, 1fr) auto"
    );
    expect(cssRule(".ca-hrollup-row")).toContain("display: contents");
    // And the name truncates rather than pushing the counts off the card, which
    // is what `minmax(0, 1fr)` and not `1fr` buys.
    expect(cssRule(".ca-hrollup-name")).toContain("text-overflow: ellipsis");
    expect(cssRule(".ca-hrollup-name")).toContain("min-width: 0");
  });

  it("gives the strip the whole width of the card, on its own line", () => {
    const strip = cssRule(".ca-hrollup-strip");
    // `grid-column: 1 / -1` on an item whose row is already full puts it on the
    // next line of the LIST's grid — which is how a `display: contents` row
    // carries two visual lines without a second container, and therefore
    // without the second grid the block above is about.
    expect(strip).toContain("grid-column: 1 / -1");
    // One track per mark and no wrapping: a fixed-width mark with `flex-wrap`
    // reflows a month into two and a half lines on a phone, which reads as a
    // second week of nothing.
    expect(strip).toContain("grid-auto-flow: column");
    expect(strip).toContain("grid-auto-columns: minmax(0, 1fr)");
    expect(strip).not.toContain("flex-wrap");
  });

  it("gives a mark the two vocabularies its two meanings need", () => {
    // A base rule that means "nothing recorded", so the gaps are drawn; the
    // binary pair for a single day; and the chart strips' own four shades for a
    // grouped one, so a colour means the same amount wherever it is drawn.
    expect(cssRule(".ca-hrollup-cell")).toContain("background");
    expect(cssRules(".ca-hrollup-cell.is-done")).toHaveLength(1);
    expect(cssRules(".ca-hrollup-cell.is-not-done")).toHaveLength(1);
    for (const n of [1, 2, 3, 4]) {
      expect(cssRule(`.ca-hrollup-cell.ca-act-${n}`)).toContain(
        `var(--ca-act-${n})`
      );
    }
  });

  it("puts the door and the coverage sentence on one row", () => {
    const foot = cssRule(".ca-hrollup-foot");
    expect(foot).toContain("justify-content: space-between");
    expect(cssRule(".ca-hrollup-foot-note")).toContain("var(--text-muted)");
  });

  it("keeps the rate and the name at phone width and drops the counts", () => {
    // Every fact in "23 of 31 · streak 5 · best 9" is in the strip underneath,
    // and a three-fact line has no ellipsis a reader could act on.
    const narrow = cssRules(".ca-hrollup-sub");
    expect(narrow.some((r) => r.includes("display: none"))).toBe(true);
    expect(
      cssRules(".ca-hrollup-list").some((r) =>
        r.includes("grid-template-columns: auto auto minmax(0, 1fr);")
      )
    ).toBe(true);
  });

  it("adds four rules to the house window shape and no more", () => {
    // The rows are `.ca-tags-row`'s — Tags, Habits, Categories and now this.
    // A window that restyled the row would be the fourth spelling of one list.
    for (const sel of [
      ".ca-hrollup-tick.is-on",
      ".ca-hrollup-count",
      ".ca-hrollup-move.is-static",
      ".ca-hrollup-note",
    ]) {
      expect(cssRules(sel)).toHaveLength(1);
    }
    // BOTH ROWS, counted: the habit rows and the strip switch are each a
    // `.ca-tags-row`, so a test for one occurrence passes while the other has
    // grown a shape of its own.
    const editor = readSrc("habit-rollup-editor");
    expect(editor.match(/ca-tags-row/g)).toHaveLength(2);
  });
});
