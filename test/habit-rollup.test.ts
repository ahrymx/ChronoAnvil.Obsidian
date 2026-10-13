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
  GRAIN_MARK,
  NEEDS_GRAIN,
  grainOfUnit,
  grainsOf,
  habitRollupAnswer,
  habitRollupArg,
  habitRollupLine,
  habitRollupRows,
  habitRuns,
  habitSlots,
  noteWithHabitRollup,
  parseHabitRollupArg,
  resolveGrain,
  rollupGroups,
  rollupWindow,
  type HabitRollupAnswer,
  type HabitRollupRow,
} from "../src/trackers/habit-rollup";
import {
  numberStripCells,
  rollupFoldKey,
  rollupIdle,
  rollupFigure,
  rollupSeeds,
  rollupSub,
  rollupRegistry,
  slotNoun,
  stripCells,
  stripShade,
  valueRange,
} from "../src/ui/widgets/habit-rollup-view";
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
import {
  TRACKER_CLASSES,
  diarySurface,
  type TrackerClass,
  type TrackerDef,
} from "../src/trackers/trackers";
import { readSrc, readCode, readCss, cssRule, cssRules, fnBody } from "./sources";
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

// A number habit, 1.0.56 — the other half of what the word now means.
const metre = (id: string, grain = "daily", unit?: string): TrackerDef =>
  ({
    id,
    label: id,
    type: "number",
    unit,
    surface: diarySurface(grain as (typeof TRACKER_CLASSES)[number]),
  }) as TrackerDef;

// A habit on SEVERAL grains, which is the shape 1.0.55 dropped without a word.
const spread = (id: string, ...grains: string[]): TrackerDef =>
  ({
    id,
    label: id,
    type: "boolean",
    surface: { kind: "diary", classes: grains },
  }) as unknown as TrackerDef;

// An answer, spelled out, so a test that cares about one field says so and the
// other two cannot drift into being the thing it accidentally asserts.
const ans = (
  ids: string[] = [],
  grains: HabitRollupAnswer["grains"] = {},
  strip = true
): HabitRollupAnswer => ({ ids, grains, strip });

// ── THE GRAMMAR ───────────────────────────────────────────────────────────
//
// One line, two answers in it, and the ordinary form has neither. The flag is
// a word in the comma list rather than a `#token` because `withToken` returns
// the line untouched when the argument has no key — `parseHabitRollupArg`'s own
// note carries the argument, and these are the forms it claims to read.
describe("the habit-rollup grammar", () => {
  it("reads the bare keyword as every habit, with strips", () => {
    expect(parseHabitRollupArg("")).toEqual(ans());
  });

  it("reads a list as the reader's order", () => {
    // ORDER IS THE ANSWER, not a set: the window's arrows write it and the card
    // draws it back. A parse that sorted would make the up arrow a no-op.
    expect(parseHabitRollupArg("Gym,Read").ids).toEqual(["Gym", "Read"]);
    expect(parseHabitRollupArg("Read,Gym").ids).toEqual(["Read", "Gym"]);
  });

  it("reads the flag anywhere in the list, and takes it out of the ids", () => {
    expect(parseHabitRollupArg("Read,no-strip")).toEqual(
      ans(["Read"], {}, false)
    );
    // The `tasks-table:,period` idiom — a leading empty member is the "no
    // argument, one flag" spelling and must not arrive as an id.
    expect(parseHabitRollupArg(",no-strip")).toEqual(ans([], {}, false));
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
      // AND EVERY GRAIN FORM (1.0.56). A suffix that parses and re-emits
      // differently is a window that rewrites a line it was only reading.
      "habit-rollup:Read@weekly",
      "habit-rollup:Read@weekly,Gym",
      "habit-rollup:Read,Gym@monthly,no-strip",
      "habit-rollup:Read@daily,Gym@yearly,Floss@quarterly",
    ]) {
      const arg = line.includes(":") ? line.slice(line.indexOf(":") + 1) : "";
      const answer = parseHabitRollupArg(arg);
      expect(habitRollupLine(answer)).toBe(line);
    }
  });

  it("writes no colon at all for the default", () => {
    // THE DEFAULT WRITES NOTHING — the attachments round's rule, pointed at
    // membership. A composed section is the bare keyword, so a habit defined
    // next month appears without anybody editing a note.
    expect(habitRollupLine(ans())).toBe(HABIT_ROLLUP_DIRECTIVE);
    expect(habitRollupArg(ans())).toBe("");
    expect(habitRollupLine(ans([], {}, false))).toBe(
      `habit-rollup:${NO_STRIP_FLAG}`
    );
  });

  it("drops the blanks a hand-edited line can carry", () => {
    expect(habitRollupArg(ans([" Read ", "", "Gym"]))).toBe("Read,Gym");
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
    //
    // AND `through` IS THE PERIOD ITSELF (1.0.64), which the clip used to throw
    // away: *"the day strips should always match the dashboard period range"*.
    // The counts stop at `end` and the strip runs to `through`, so the two
    // readings the card makes are two fields and not one compromise.
    expect(rollupWindow(...MONTH, "2026-10-12")).toEqual({
      start: "2026-10-01",
      end: "2026-10-12",
      through: "2026-10-31",
    });
  });

  it("takes a finished period whole", () => {
    expect(rollupWindow(...MONTH, "2026-11-04")).toEqual({
      start: "2026-10-01",
      end: "2026-10-31",
      through: "2026-10-31",
    });
    // The last day of the period is still the period, not the day after it.
    expect(rollupWindow(...MONTH, "2026-10-31")).toEqual({
      start: "2026-10-01",
      end: "2026-10-31",
      through: "2026-10-31",
    });
    // A FINISHED PERIOD HAS NOTHING AHEAD OF IT, which is what makes the strip
    // the same picture for ever once the month is over.
    const done = rollupWindow(...MONTH, "2026-11-04");
    expect(done?.end).toBe(done?.through);
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

  const win = { start: "2026-10-01", end: "2026-10-07", through: "2026-10-07" };
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

  it("carries the rest of the period as a SECOND list, not as a flag", () => {
    // ── *"THE DAY STRIPS SHOULD ALWAYS MATCH THE DASHBOARD PERIOD RANGE"* ───
    //
    // The reader said this twice, which is why it is a model change rather than
    // a stylesheet one. A month opened on its twelfth drew twelve marks; it has
    // to draw thirty-one.
    //
    // AND `slots` COULD NOT SIMPLY GROW TO HOLD THEM. Eleven counts on this row
    // divide by `slots.length` — the rate, the two runs, the average, every
    // "23 of 31" in `rollupSub` — and the module's own head is an argument that
    // a partial period compared against a whole one is how a stats card
    // misleads by arithmetic alone. A flag on each slot would have been the
    // other shape and leaves all eleven of those sites to remember it.
    const { app } = vaultOf(WEEK);
    const [read] = habitRollupRows(app, DEFAULT_PATHS, habits, {
      start: "2026-10-01",
      end: "2026-10-04",
      through: "2026-10-07",
    });
    // THE COUNTS STOP AT TODAY.
    expect(read.slots).toHaveLength(4);
    expect(read.rate).toBeCloseTo(3 / 4);
    // AND THE STRIP'S OWN LIST CARRIES THE REMAINDER, in order, with no key in
    // both lists — which is the arithmetic the strip concatenates on.
    expect(read.ahead.map((s) => s.key)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
    ]);
    const lived = new Set(read.slots.map((s) => s.key));
    expect(read.ahead.some((s) => lived.has(s.key))).toBe(false);
    expect(read.slots.length + read.ahead.length).toBe(7);
  });

  it("has nothing ahead of it once the period is over", () => {
    // Which is what makes the strip the same picture for ever once the month
    // has ended — and is the case a `slots`-vs-`through` subtraction would get
    // wrong by a day at either end.
    const { app } = vaultOf(WEEK);
    const [read] = habitRollupRows(app, DEFAULT_PATHS, habits, win);
    expect(read.ahead).toEqual([]);
    // A GRAIN COARSER THAN A DAY COUNTS ITS OWN SLOTS AHEAD, not days — the
    // `ahead` list is `habitSlots` at the ROW's grain, like `slots` beside it,
    // so a weekly habit on a month opened in its first week gets the three or
    // four weeks left and not twenty-four days.
    const [review] = habitRollupRows(
      app,
      DEFAULT_PATHS,
      [habit("Review", "weekly")],
      { start: "2026-10-01", end: "2026-10-07", through: "2026-10-31" }
    );
    expect(review.grain).toBe("weekly");
    expect(review.ahead.length).toBeLessThan(5);
    expect(review.ahead.every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.key))).toBe(
      true
    );
    // AND NOTHING AHEAD HAS A STATE. They are slots nobody has reached, so a
    // reading on one would be a note from the future.
    expect(review.ahead.every((s) => s.state == null)).toBe(true);
    expect(review.ahead.every((s) => !s.written)).toBe(true);
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

  // ── DEFECT 1, WALKED (1.0.55 → 1.0.56) ─────────────────────────────────
  //
  // THE TEST THAT FAILS ON 1.0.55 AND IS THE REASON THIS ROUND EXISTS. A habit
  // on two grains asked `scopesFor(def)[0]`, which answers through
  // `diaryClassOf`, which returns `null` for a set of more than one ON PURPOSE
  // — so the habit drew no row and no refusal either. Three fixtures, because
  // the fix has three arms and only one of them is "it appears at all".
  describe("a habit on more than one grain", () => {
    const both = spread("Stretch", "daily", "weekly");
    const ANY = {
      id: "Stretch",
      label: "Stretch",
      type: "boolean",
      surface: { kind: "any" },
    } as unknown as TrackerDef;

    const vault = () =>
      vaultOf({
        ...Object.fromEntries([
          day("2026-10-01", { Stretch: 1 }),
          day("2026-10-02", { Stretch: 1 }),
        ]),
        [`${DEFAULT_PATHS.diaryWeekly}/Week-2026-W41.md`]: {
          "week-start": "2026-10-05",
          Stretch: 1,
        },
      }).app;

    it("is read at the dashboard's own grain when it names it", () => {
      const [row] = habitRollupRows(vault(), DEFAULT_PATHS, [both], win, {}, "daily");
      expect(row.grain).toBe("daily");
      expect(row.done).toBe(2);
    });

    it("is read at the grain the reader chose, over the dashboard's", () => {
      const month = { start: "2026-10-01", end: "2026-10-31" };
      const [row] = habitRollupRows(
        vault(),
        DEFAULT_PATHS,
        [both],
        month,
        { Stretch: "weekly" },
        "daily"
      );
      expect(row.grain).toBe("weekly");
      expect(row.done).toBe(1);
      expect(row.slots.length).toBeLessThan(6);
    });

    it("draws no row where the dashboard's grain is not one of its own", () => {
      // AND THIS IS NOT THE OLD BUG. The row is absent for a stated reason the
      // card counts and the window fixes — 1.0.55 dropped it when the habit
      // named TWO grains however well either fitted, which these three cases
      // together are what separate.
      const month = { start: "2026-10-01", end: "2026-10-31" };
      expect(
        habitRollupRows(vault(), DEFAULT_PATHS, [both], month, {}, "monthly")
      ).toEqual([]);
      // A STALE CHOICE IS NOT HONOURED EITHER. `quarterly` is not one of this
      // habit's grains, so the line is read as saying nothing.
      expect(
        habitRollupRows(
          vault(),
          DEFAULT_PATHS,
          [both],
          month,
          { Stretch: "quarterly" },
          "monthly"
        )
      ).toEqual([]);
    });

    it("reads a tracker admitted everywhere at whatever grain the dashboard is", () => {
      // `kind: "any"` FALLS OUT rather than being decided: every grain is
      // among its own, so clause 3 always fires and there is nothing to ask.
      const [row] = habitRollupRows(vault(), DEFAULT_PATHS, [ANY], win, {}, "daily");
      expect(row.grain).toBe("daily");
      const month = { start: "2026-10-01", end: "2026-10-31" };
      const [weekly] = habitRollupRows(
        vault(),
        DEFAULT_PATHS,
        [ANY],
        month,
        {},
        "weekly"
      );
      expect(weekly.grain).toBe("weekly");
    });

    it("needs no dashboard and no choice for a habit that names one grain", () => {
      // THE PROPERTY WORTH PROTECTING, and the reason clause 2 sits above
      // clause 3: nothing changes denominator for the habits every vault
      // already has. This is 1.0.55's behaviour, asserted so widening cannot
      // quietly take it.
      const [row] = habitRollupRows(
        vault(),
        DEFAULT_PATHS,
        [habit("Stretch")],
        win,
        {},
        "monthly"
      );
      expect(row.grain).toBe("daily");
    });
  });

  // ── THE NUMBER HALF (1.0.56) ───────────────────────────────────────────
  describe("a number habit", () => {
    const NUM = Object.fromEntries([
      day("2026-10-01", { Run: 5 }),
      day("2026-10-02", { Run: 0 }),
      day("2026-10-03", { Run: "nope" }),
      // An entry that exists and never answered it: written, not logged.
      day("2026-10-04", {}),
      day("2026-10-06", { Run: 7 }),
    ]);

    it("totals, averages and counts the slots it was LOGGED on", () => {
      const { app } = vaultOf(NUM);
      const [run] = habitRollupRows(
        app,
        DEFAULT_PATHS,
        [metre("Run", "daily", "km")],
        win
      );
      expect(run.type).toBe("number");
      expect(run.slots).toHaveLength(7);
      // ZERO IS A READING. `0` is logged and counted, which is the boundary
      // `readHabitNumber` exists for — a falsy check here would lose a day the
      // reader recorded.
      expect(run.logged).toBe(3);
      expect(run.total).toBe(12);
      expect(run.mean).toBe(4);
      // AND THE DENOMINATORS DISAGREE ON PURPOSE: five entries exist, three of
      // them carry a reading, and the period is seven days long. A fixture
      // where any two of those coincided would prove none of it.
      expect(run.written).toBe(5);
      expect(run.unit).toBe("km");
    });

    it("refuses an average over nothing rather than reporting NaN", () => {
      const { app } = vaultOf(Object.fromEntries([day("2026-10-01", {})]));
      const [run] = habitRollupRows(app, DEFAULT_PATHS, [metre("Run")], win);
      expect(run.logged).toBe(0);
      expect(run.total).toBe(0);
      expect(run.mean).toBeNull();
      expect(run.unit).toBeNull();
    });

    it("averages a window of nothing but zeroes rather than refusing", () => {
      // `numbers.length` AND NOT `total` is the guard, and these two fixtures
      // are what separate them: a week of zeroes has a mean, and it is 0.
      const { app } = vaultOf(
        Object.fromEntries([day("2026-10-01", { Run: 0 }), day("2026-10-02", { Run: 0 })])
      );
      const [run] = habitRollupRows(app, DEFAULT_PATHS, [metre("Run")], win);
      expect(run.mean).toBe(0);
      expect(run.logged).toBe(2);
    });

    it("keeps both readings of one stored value, from one walk", () => {
      // The slot carries `state` AND `value`: one vault walk, two column
      // renderers. A boolean row reads the first and a number row the second.
      const { app, reads } = vaultOf(NUM);
      const [run] = habitRollupRows(app, DEFAULT_PATHS, [metre("Run")], win);
      expect(run.slots[0].value).toBe(5);
      expect(run.slots[1].value).toBe(0);
      expect(run.slots[2].value).toBeNull();
      expect(run.slots[0].state).toBe(1);
      expect(reads()).toBe(Object.keys(NUM).length);
    });

    it("is a number row only because the definition is", () => {
      const { app } = vaultOf(NUM);
      const [bool] = habitRollupRows(app, DEFAULT_PATHS, [habit("Run")], win);
      expect(bool.type).toBe("boolean");
    });
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

  // ── THE SLOTS NOBODY HAS REACHED (1.0.64) ───────────────────────────────
  it("marks the tail the period has not reached, counted from the end", () => {
    // `ahead` IS A COUNT AND NOT A PREDICATE, because the caller knows exactly
    // how many it appended and this function already walks by index. A
    // predicate would need a date and a today, which is a second clock inside a
    // pure function that has none.
    const cells = stripCells(slots([1, 0, null, null]), 2);
    expect(cells.map((c) => c.ahead)).toEqual([false, false, true, true]);
    // AND AN UNREACHED SLOT IS NOT A MISSED ONE. They arrive identical —
    // `state: null, written: false` — so this flag is the only thing that tells
    // them apart, which is why the default has to be 0 and not something
    // derived.
    expect(stripCells(slots([1, 0, null, null])).every((c) => !c.ahead)).toBe(
      true
    );
  });

  it("names an unlived group without tallying it", () => {
    // "0 of 7" IS A TRUE SENTENCE ABOUT SEVEN DAYS NOBODY HAS REACHED and a
    // false one about this habit. A year card opened in January would otherwise
    // read forty-nine weeks of failure.
    const year = slots(Array(364).fill(1));
    const cells = stripCells(year, 357);
    expect(cells).toHaveLength(52);
    expect(cells[51].ahead).toBe(true);
    expect(cells[51].label).not.toContain("of 7");
    expect(cells[51].label).toContain("–");
    // THE LIVED GROUPS KEEP THEIR TALLY, which is the half of this a `label`
    // rewritten for every group would have taken away.
    expect(cells[0].ahead).toBe(false);
    expect(cells[0].label).toContain("7 of 7");
  });

  it("counts a group straddling today as lived", () => {
    // THE CASE THE ARITHMETIC HAD TO CHOOSE. A group of seven whose first three
    // days happened and whose last four have not is one mark, and it has to be
    // either tallied or not. Lived: it holds readings, and a mark that said
    // nothing about three logged days would lose them — the tally is over the
    // group's own length, so a partial group reads light rather than absent.
    const states: HabitState[] = Array(364).fill(null);
    for (let i = 0; i < 3; i++) states[i] = 1;
    const cells = stripCells(slots(states), 361);
    expect(cells[0].ahead).toBe(false);
    expect(cells[0].ratio).toBeCloseTo(3 / 7);
    expect(cells[0].label).toContain("3 of 7");
    expect(cells[1].ahead).toBe(true);
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
      type: "boolean",
      logged: 0,
      total: 0,
      mean: null,
      unit: null,
      ...over,
    }) as Parameters<typeof rollupSub>[0];

  it("says the counts the ring cannot carry, in the accepted order", () => {
    expect(rollupSub(row({}))).toBe("23 of 31 days · streak 5 · best 9");
  });

  it("omits a current run of zero", () => {
    // "streak 0" is a true statement that reads as a broken counter, and the
    // best run beside it already says what the habit is capable of.
    expect(rollupSub(row({ current: 0 }))).toBe("23 of 31 days · best 9");
  });

  // ── AND THE DENOMINATOR SAYS WHICH CALENDAR (1.0.61) ───────────────────
  //
  // THE WHOLE TABLE AND NOT ONE GRAIN, driven over `TRACKER_CLASSES` so a sixth
  // one fails this rather than passing it. A `toContain("1 of 12")` here would
  // be satisfied by every grain at once, which is the shape that measures
  // nothing.
  it("names the unit the denominator counts, for every grain", () => {
    const said = TRACKER_CLASSES.map((grain) =>
      rollupSub(row({ grain, slots: Array(12).fill({ state: 1 }), done: 1, current: 1, best: 3 }))
    );
    expect(said).toEqual([
      "1 of 12 days · streak 1 · best 3",
      "1 of 12 weeks · streak 1 · best 3",
      "1 of 12 months · streak 1 · best 3",
      "1 of 12 quarters · streak 1 · best 3",
      "1 of 12 years · streak 1 · best 3",
    ]);
  });

  // BOTH HALVES OF THE PLURAL IN ONE TEST. Either one alone passes against a
  // `slotNoun` that never pluralises or one that always does.
  it("agrees with the count in front of it, not with the row", () => {
    const one = { slots: [{ state: 1 }], done: 1, current: 1, best: 1 };
    expect(rollupSub(row({ grain: "weekly", ...one }))).toBe(
      "1 of 1 week · streak 1 · best 1"
    );
    expect(
      rollupSub(row({ grain: "weekly", slots: Array(2).fill({ state: 1 }), done: 1, current: 1, best: 1 }))
    ).toBe("1 of 2 weeks · streak 1 · best 1");
  });

  // THE STREAKS STAY BARE, which is a decision and not an oversight: the noun
  // is already on the denominator and in the heading above the row.
  it("leaves the two runs without a noun", () => {
    expect(rollupSub(row({}))).toContain("streak 5 · best 9");
    expect(rollupSub(row({}))).not.toContain("streak 5 days");
  });

  it("says so when the period has not started", () => {
    expect(rollupSub(row({ slots: [] }))).toBe("nothing yet");
  });

  // ── THE NUMBER'S OWN SENTENCE (1.0.56) ─────────────────────────────────
  const num = (over: Record<string, unknown>) =>
    row({ type: "number", logged: 23, total: 128.4, mean: 128.4 / 23, ...over });

  it("reports an average and a logged count, and no streak at all", () => {
    // A RUN OF A QUANTITY IS NOT A DEFINED THING. `habitRuns` is not asked of a
    // number row, and the fixture carries `current: 5` and `best: 9` so that a
    // branch falling through to the boolean sentence says so.
    expect(rollupSub(num({ unit: "km" }))).toBe(
      "avg 5.6 km · 23 of 31 days logged"
    );
    expect(rollupSub(num({}))).toBe("avg 5.6 · 23 of 31 days logged");
    expect(rollupSub(num({}))).not.toContain("streak");
  });

  it("averages over the slots it was LOGGED on, which the sentence says", () => {
    // 128.4 OVER 23 AND NOT OVER 31: a mean over elapsed days answers a
    // question nobody asked. The two denominators are both in the sentence, so
    // a reader can see which one the average used.
    expect(rollupSub(num({}))).toContain("23 of 31");
    expect(rollupSub(num({ logged: 31, mean: 128.4 / 31 }))).toBe(
      "avg 4.1 · 31 of 31 days logged"
    );
  });

  it("says nothing was logged rather than printing an empty average", () => {
    expect(rollupSub(num({ logged: 0, total: 0, mean: null }))).toBe(
      "nothing logged · 0 of 31 days logged"
    );
    // AND A MEAN OF ZERO IS NOT NOTHING. `mean == null` and not `!mean`: a
    // fortnight of zeroes averaged 0, and the refusal above is for a window
    // with no readings in it at all.
    expect(rollupSub(num({ logged: 2, total: 0, mean: 0 }))).toBe(
      "avg 0 · 2 of 31 days logged"
    );
  });

  it("still says nothing yet for a period that has not started", () => {
    expect(rollupSub(num({ slots: [] }))).toBe("nothing yet");
  });
});

// ── GRAIN ON THE CARD (1.0.61) ────────────────────────────────────────────
//
// `HabitRollupRow.grain` has existed since 1.0.56 and had no reader in the view
// at all: on a quarterly dashboard a daily habit drew 92 marks saying `1 of 92`
// and a weekly one 13 saying `1 of 13`, one under the other, with nothing on
// the card naming a calendar. These are the three answers to that.
describe("rollupGroups", () => {
  const row = (id: string, grain: TrackerClass) =>
    ({ id, label: id, grain, type: "boolean" }) as HabitRollupRow;

  it("gathers the rows in canonical grain order however they arrive", () => {
    // THE FIXTURE IS OUT OF ORDER ON PURPOSE. A partition that kept
    // first-appearance order would give the reverse of this and pass a test
    // written over an already-sorted list.
    const got = rollupGroups([
      row("a", "weekly"),
      row("b", "daily"),
      row("c", "yearly"),
    ]);
    expect(got.map((g) => g.grain)).toEqual(["daily", "weekly", "yearly"]);
  });

  it("keeps the reader's own order inside a group", () => {
    // `habitRollupIds` writes an explicit list precisely so the sequence is
    // theirs, and the window's chevrons move a habit within its group. A
    // comparator over grain indices would be free to reshuffle ties.
    const got = rollupGroups([row("c", "daily"), row("a", "daily"), row("b", "daily")]);
    expect(got[0].rows.map((r) => r.id)).toEqual(["c", "a", "b"]);
    expect(fnBody("rollupGroups", "habit-rollup")).not.toContain(".sort(");
  });

  it("emits nothing for a grain with no rows", () => {
    const got = rollupGroups([row("a", "daily")]);
    // BOTH CLAIMS. A `toBeGreaterThan(0)` on the length alone passes on five
    // groups, four of them empty, which is the shape this is guarding.
    expect(got).toHaveLength(1);
    expect(got.every((g) => g.rows.length > 0)).toBe(true);
  });

  it("is empty for no rows at all", () => {
    expect(rollupGroups([])).toEqual([]);
  });
});

describe("slotNoun", () => {
  const row = (grain: TrackerClass, slots: number) =>
    ({ grain, slots: Array(slots).fill({ state: null }) }) as HabitRollupRow;

  it("is CLASS_DEFS' own word for one slot of the grain", () => {
    expect(TRACKER_CLASSES.map((c) => slotNoun(row(c, 1)))).toEqual([
      "day",
      "week",
      "month",
      "quarter",
      "year",
    ]);
  });

  it("agrees with the count, not with the row", () => {
    expect(slotNoun(row("quarterly", 1))).toBe("quarter");
    expect(slotNoun(row("quarterly", 4))).toBe("quarters");
  });
});

describe("rollupFigure", () => {
  // EVERY NUMBER IN THIS FIXTURE IS DIFFERENT, which is `vacuous-sweep-rule`'s
  // second shape: `logged`, `written`, `done`, `slots.length` and `rate` must
  // all disagree, or a mutant swapping two of them survives.
  const num = (over: Partial<HabitRollupRow> = {}) =>
    ({
      label: "Run",
      grain: "daily",
      type: "number",
      slots: Array(8).fill({ state: null }),
      done: 2,
      written: 6,
      rate: 2 / 8,
      logged: 4,
      total: 128.4,
      mean: 32.1,
      unit: "km",
      ...over,
    }) as HabitRollupRow;

  const bool = (over: Partial<HabitRollupRow> = {}) =>
    ({
      label: "Read",
      grain: "daily",
      type: "boolean",
      slots: Array(31).fill({ state: 1 }),
      done: 23,
      written: 26,
      rate: 23 / 31,
      logged: 0,
      total: 0,
      mean: null,
      unit: null,
      ...over,
    }) as HabitRollupRow;

  it("draws a boolean's rate, exactly as the card always did", () => {
    expect(rollupFigure(bool())).toBe("74%");
  });

  it("refuses a figure for a period with no slots", () => {
    // `rate == null` IS A CLAIM ABOUT NOTHING, which is the refusal `rate`
    // itself makes: 0 of 0 is not 0%.
    expect(rollupFigure(bool({ slots: [], rate: null }))).toBe("—");
    expect(rollupFigure(num({ slots: [], logged: 0 }))).toBe("—");
  });

  it("prints a number's total with its unit, and no sigma", () => {
    expect(rollupFigure(num())).toBe("128.4 km");
    expect(rollupFigure(num({ unit: null }))).toBe("128.4");
  });

  it("tells a logged window of zeroes from a window with nothing in it", () => {
    // THE PAIR, because either one alone passes against a `!row.total` guard.
    expect(rollupFigure(num({ logged: 2, total: 0 }))).toBe("0 km");
    expect(rollupFigure(num({ logged: 0, total: 0 }))).toBe("—");
  });

  it("returns a string and nothing else, now that the ring is gone", () => {
    // IT RETURNED `{ frac, figure }` UNTIL 1.0.64, and `frac` had exactly one
    // reader: the ring the reader has now taken off the card. A function
    // returning a number nothing reads is how a later hand concludes the number
    // must matter — and the number in question was the one a reader is most
    // likely to reach for and wrong (`logged / slots`, never `rate`). The
    // reasoning stays in the comment above it; the field does not.
    expect(typeof rollupFigure(num())).toBe("string");
    const code = readCode("habit-rollup-view");
    expect(code).not.toContain("rollupLead");
    expect(code).not.toContain("frac:");
  });
});

describe("rollupIdle", () => {
  it("is the type's own idea of nothing", () => {
    // THE 1.0.56 `is-logged` DEFECT, ON THE SECOND SURFACE. That one muted
    // every number habit's name on a diary entry for ever; this card asked
    // `done === 0` of a row whose `done` is "slots that rounded to >= 0.5", so a
    // habit logged at 0.2 km on twenty days was drawn muted above its own sub
    // line reading `avg 0.2 km · 20 of 31 days logged`.
    const num = { type: "number", done: 0, written: 20, logged: 20 } as HabitRollupRow;
    expect(rollupIdle(num)).toBe(false);
    expect(rollupIdle({ ...num, logged: 0 })).toBe(true);
  });

  it("is still the kept count on a boolean", () => {
    const row = { type: "boolean", done: 0, written: 2, logged: 5 } as HabitRollupRow;
    expect(rollupIdle(row)).toBe(true);
    expect(rollupIdle({ ...row, done: 1 })).toBe(false);
  });
});

// ── THE NUMBER'S STRIP (1.0.56) ───────────────────────────────────────────
describe("valueRange", () => {
  const slots = (values: (number | null)[]) =>
    values.map((v, i) => ({
      key: `k${i}`,
      label: `l${i}`,
      state: null,
      value: v,
      written: v != null,
    })) as Parameters<typeof valueRange>[0];

  it("is the window's own least and greatest, not the tracker's declared range", () => {
    // `drawStrip`'s RULE, carried to a fourth strip: a tracker scaled 1–5 whose
    // readings all sit between 3 and 4 would otherwise draw thirty cells of one
    // shade.
    expect(valueRange(slots([3, 3.5, 4]))).toEqual({ lo: 3, hi: 4 });
  });

  it("ignores the slots with no reading, including the written ones", () => {
    expect(valueRange(slots([null, 7, null, 2]))).toEqual({ lo: 2, hi: 7 });
  });

  it("is null for a window with nothing in it, which is not a range of zero", () => {
    expect(valueRange(slots([null, null]))).toBeNull();
    expect(valueRange(slots([0, 0]))).toEqual({ lo: 0, hi: 0 });
  });
});

describe("numberStripCells", () => {
  const slots = (values: (number | null)[]) =>
    values.map((v, i) => ({
      key: `k${i}`,
      label: `l${i}`,
      state: null,
      value: v,
      written: v != null,
    })) as Parameters<typeof numberStripCells>[0];

  it("shades every mark and never draws a binary one", () => {
    // A QUANTITY HAS NO done/not-done READING — 2 km is not "done" and 0 km is
    // not "not done" — so `single` is false at every width and `drawStrip`
    // takes the shade arm for all of them.
    const cells = numberStripCells(slots([1, 5, 10]), null);
    expect(cells.map((c) => c.single)).toEqual([false, false, false]);
    expect(cells.map((c) => c.ratio)).toEqual([0, 4 / 9, 1]);
  });

  it("gives the window's least reading fraction zero, which is still a mark", () => {
    // AND THE DRAWING DOES NOT TREAT IT AS BLANK: the boolean arm's `> 0` is
    // what would, which is why `drawStrip` asks the type before it asks the
    // ratio.
    const [least] = numberStripCells(slots([2, 9]), null);
    expect(least.ratio).toBe(0);
    expect(stripShade(least.ratio!)).toBe(1);
    expect(readCode("habit-rollup-view")).toContain(
      "if (cell.ratio != null && (number || cell.ratio > 0)) {"
    );
  });

  it("draws a flat window full rather than empty", () => {
    // `sparkFraction`'s OWN BOUNDARY, and the section's sparkline agrees with
    // it: "every day the same" is not "every day the least".
    expect(numberStripCells(slots([4, 4, 4]), null).map((c) => c.ratio)).toEqual(
      [1, 1, 1]
    );
  });

  it("says nothing for a slot with no reading", () => {
    const [, blank] = numberStripCells(slots([5, null]), null);
    expect(blank.ratio).toBeNull();
    expect(blank.label).toContain("nothing logged");
  });

  it("names each mark with its value and its unit", () => {
    const [one] = numberStripCells(slots([5.25]), "km");
    expect(one.label).toBe("l0: 5.3 km");
    expect(numberStripCells(slots([5.25]), null)[0].label).toBe("l0: 5.3");
  });

  it("groups a year into sevens and averages each group's LOGGED slots", () => {
    // ONE 10 KM RUN IN A WEEK READS AS 10 KM, not as 1.4 — the same
    // logged-not-written distinction the row's own mean makes.
    const year = Array<number | null>(364).fill(null);
    year[0] = 10;
    const cells = numberStripCells(slots(year), "km");
    expect(cells).toHaveLength(52);
    expect(cells[0].label).toContain("l0");
    expect(cells[0].label).toContain("l6");
    expect(cells[0].label).toContain("10 km");
    expect(cells[1].ratio).toBeNull();
  });

  // ── THE SLOTS NOBODY HAS REACHED (1.0.64) ───────────────────────────────
  it("scales by the LIVED readings and says nothing of the rest", () => {
    // ── AN EQUIVALENT MUTANT, MEASURED AND RECORDED ─────────────────────────
    //
    // `valueRange(slots)` in place of `valueRange(slots.slice(0, lived))`
    // SURVIVES every behavioural assertion in this file, and has to: an unlived
    // slot carries `value: null`, and `valueRange` skips the nulls, so the two
    // expressions cannot disagree on any input `drawStrip` can build. That is
    // `vacuous-sweep-rule`'s own exception — a mutant nothing can kill is not a
    // gap in the suite, it is two spellings of one function.
    //
    // IT IS STILL THE WRONG SPELLING. The next hand to give an unlived slot a
    // default of 0 would silently rescale every strip on the card, and the
    // normaliser would be the one line that could no longer be read as meaning
    // the lived window. So the slice is pinned as a SHAPE, which is the only
    // thing that can hold it, and the behaviour below is pinned separately.
    expect(fnBody("numberStripCells", "habit-rollup-view")).toContain(
      "valueRange(slots.slice(0, lived))"
    );
    const cells = numberStripCells(slots([2, 9, null, null]), "km", 2);
    expect(cells.map((c) => c.ahead)).toEqual([false, false, true, true]);
    expect(cells[0].ratio).toBe(0);
    expect(cells[1].ratio).toBe(1);
    // AND AN UNREACHED MARK IS NOT "nothing logged". It is a mark with no
    // sentence of its own, because there is nothing yet to say about it —
    // `drawStrip` appends the one word that does apply.
    expect(cells[2].label).toBe("l2");
    expect(cells[2].label).not.toContain("nothing logged");
    expect(cells[1].label).toContain("9 km");
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
    const out = noteWithHabitRollup(note, body, "habit-rollup", ans(["Read"]));
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
    expect(noteWithHabitRollup(note, body, "habit-rollup", ans())).toBeNull();
    expect(
      noteWithHabitRollup(
        ["x", "habit-rollup:Read,Gym", "y"],
        { from: 0, to: 3 },
        "habit-rollup:Read,Gym",
        ans(["Read", "Gym"])
      )
    ).toBeNull();
  });

  it("returns null when the line is no longer where the block says it is", () => {
    // The other half of the `null`, and the caller tells them apart by asking
    // first — a stale block range is a `notify.fail`, not a silent no-op.
    expect(
      noteWithHabitRollup(note, { from: 1, to: 2 }, "habit-rollup", ans(["Read"]))
    ).toBeNull();
    expect(
      noteWithHabitRollup(note, body, "habit-rollup:Gone", ans(["Read"]))
    ).toBeNull();
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
      ans(["Gym", "Read"])
    )!;
    expect(out[0]).toBe("habit-rollup:Read");
    expect(out[2]).toBe("habit-rollup:Gym,Read");
  });

  it("keeps the indentation a reader's own line has", () => {
    const out = noteWithHabitRollup(
      ["  habit-rollup"],
      { from: 0, to: 1 },
      "habit-rollup",
      ans([], {}, false)
    )!;
    expect(out[0]).toBe("  habit-rollup:no-strip");
  });

  it("reorders a membership without disturbing the flag, and the reverse", () => {
    const line = "habit-rollup:Read,Gym,no-strip";
    const moved = noteWithHabitRollup(
      [line],
      { from: 0, to: 1 },
      line,
      ans(["Gym", "Read"], {}, false)
    )!;
    expect(moved[0]).toBe("habit-rollup:Gym,Read,no-strip");
    const stripped = noteWithHabitRollup(
      [line],
      { from: 0, to: 1 },
      line,
      ans(["Read", "Gym"])
    )!;
    expect(stripped[0]).toBe("habit-rollup:Read,Gym");
  });
});

describe("habitRollupAnswer", () => {
  const rows = (...on: [string, boolean][]) =>
    on.map(([id, shown]) => ({ id, shown }));
  const registry = ["Read", "Gym", "Floss"];
  const ids = (
    r: readonly { id: string; shown: boolean; grain?: TrackerClass | null }[]
  ): string[] => habitRollupAnswer(r, registry, true).ids;

  it("collapses every habit ticked, in registry order, to the empty list", () => {
    // WHY THIS IS A FUNCTION rather than `rows.filter(shown).map(id)`. An
    // explicit list of everything looks identical on screen and is not the same
    // answer: it silently excludes the habit the reader defines next month, and
    // nothing on the dashboard would say why the new one never appeared.
    expect(
      ids(rows(["Read", true], ["Gym", true], ["Floss", true]), registry)
    ).toEqual([]);
  });

  it("writes the list out when the reader hid one", () => {
    expect(
      ids(rows(["Read", true], ["Gym", false], ["Floss", true]), registry)
    ).toEqual(["Read", "Floss"]);
  });

  it("writes the full list out for a reorder, because order is only a list", () => {
    // THE ONE PLACE THE TWO RULES MEET. A reader who ticks everything and moves
    // one row gets the full list — the alternative is a gesture the window
    // accepts and the note cannot hold.
    expect(
      ids(rows(["Gym", true], ["Read", true], ["Floss", true]), registry)
    ).toEqual(["Gym", "Read", "Floss"]);
  });

  it("does not collapse a shorter list that happens to be in order", () => {
    expect(
      ids(rows(["Read", true], ["Gym", true], ["Floss", false]), registry)
    ).toEqual(["Read", "Gym"]);
  });
});

// ── WHICH GRAIN (1.0.56) ──────────────────────────────────────────────────
describe("grainsOf", () => {
  it("reads the SET, which is what scopesFor refuses to", () => {
    expect(grainsOf(habit("Read"))).toEqual(["daily"]);
    expect(grainsOf(spread("Stretch", "daily", "weekly"))).toEqual([
      "daily",
      "weekly",
    ]);
  });

  it("returns the five in canonical order however the settings wrote them", () => {
    // FILTERED THROUGH `TRACKER_CLASSES` rather than returned as stored, so the
    // window's groups are in the registry's order and not in the order three
    // checkboxes happened to be ticked in.
    expect(grainsOf(spread("Odd", "yearly", "daily", "monthly"))).toEqual([
      "daily",
      "monthly",
      "yearly",
    ]);
  });

  it("is every grain for a tracker admitted everywhere, and none for a journal", () => {
    expect(
      grainsOf({ surface: { kind: "any" } } as unknown as TrackerDef)
    ).toEqual([...TRACKER_CLASSES]);
    expect(
      grainsOf({
        surface: { kind: "journal", journals: [] },
      } as unknown as TrackerDef)
    ).toEqual([]);
  });
});

describe("resolveGrain", () => {
  const two: TrackerClass[] = ["daily", "weekly"];

  it("takes the reader's choice first", () => {
    expect(resolveGrain(two, "weekly", "daily")).toBe("weekly");
  });

  it("refuses a choice the habit cannot honour", () => {
    // A note carrying `stretch@monthly` for a habit since moved off months is a
    // STALE LINE, not an instruction — and honouring it would read notes that
    // hold no readings at all.
    expect(resolveGrain(two, "monthly", "daily")).toBe("daily");
    expect(resolveGrain(two, "monthly", "quarterly")).toBe(NEEDS_GRAIN);
  });

  it("asks nothing of a habit that names one grain", () => {
    // CLAUSE 2 ABOVE CLAUSE 3, which is the property worth protecting: the
    // dashboard is ignored entirely, so every habit in every vault today keeps
    // the denominator 1.0.55 gave it.
    expect(resolveGrain(["weekly"], undefined, "monthly")).toBe("weekly");
    expect(resolveGrain(["weekly"], undefined, null)).toBe("weekly");
  });

  it("falls back to the dashboard's own grain where the habit names it", () => {
    expect(resolveGrain(two, undefined, "daily")).toBe("daily");
    expect(resolveGrain(two, undefined, "weekly")).toBe("weekly");
  });

  it("asks, rather than picking one of two defensible denominators", () => {
    expect(resolveGrain(two, undefined, "quarterly")).toBe(NEEDS_GRAIN);
    expect(resolveGrain(two, undefined, null)).toBe(NEEDS_GRAIN);
  });

  it("is null for a habit on no diary grain at all, which is not the same answer", () => {
    // `null` AND `NEEDS_GRAIN` ARE DIFFERENT OUTCOMES: one is a journal tracker
    // the rollup never could read, the other is a habit waiting to be told.
    // The window lists the second and does not mention the first.
    expect(resolveGrain([], undefined, "daily")).toBeNull();
    expect(resolveGrain([], "daily", "daily")).toBeNull();
  });
});

describe("grainOfUnit", () => {
  it("maps a dashboard's period unit onto the grain of the same name", () => {
    // DERIVED FROM `CLASS_DEFS` rather than hand-written, which is why the four
    // are asserted here: `periodnav`'s Unit and `periodNoun` agreeing is the
    // whole reason there is no fifth table.
    expect(grainOfUnit("week")).toBe("weekly");
    expect(grainOfUnit("month")).toBe("monthly");
    expect(grainOfUnit("quarter")).toBe("quarterly");
    expect(grainOfUnit("year")).toBe("yearly");
    expect(grainOfUnit("day")).toBe("daily");
  });

  it("is null for no unit and for a word that is not one", () => {
    expect(grainOfUnit(null)).toBeNull();
    expect(grainOfUnit("fortnight")).toBeNull();
  });
});

describe("the grain suffix", () => {
  it("cuts at the LAST mark, so an id may hold one", () => {
    // `@work` IS A LEGAL PROPERTY NAME, which is the documented collision this
    // grammar accepts — `no-strip` accepts the same one as a habit label.
    const answer = parseHabitRollupArg("@work@daily");
    expect(answer.ids).toEqual(["@work"]);
    expect(answer.grains).toEqual({ "@work": "daily" });
  });

  it("leaves a part that is nothing but a mark alone", () => {
    // `> 0` AND NOT `>= 0`: cutting at position 0 would leave an empty id and
    // a habit nothing can match.
    expect(parseHabitRollupArg(`${GRAIN_MARK}daily`).ids).toEqual([
      `${GRAIN_MARK}daily`,
    ]);
    expect(parseHabitRollupArg(`${GRAIN_MARK}daily`).grains).toEqual({});
  });

  it("reads an unrecognised word as part of the id, not as a half-refusal", () => {
    // A HABIT CALLED `read@someday`, rather than a habit called `read` whose
    // grain was dropped — the second would silently report the wrong thing.
    const answer = parseHabitRollupArg("read@someday");
    expect(answer.ids).toEqual(["read@someday"]);
    expect(answer.grains).toEqual({});
  });

  it("takes the grain word in any case, like the flag beside it", () => {
    expect(parseHabitRollupArg("Read@WEEKLY").grains).toEqual({
      Read: "weekly",
    });
  });

  it("survives the flag, in either order", () => {
    expect(parseHabitRollupArg("Read@weekly,no-strip")).toEqual(
      ans(["Read"], { Read: "weekly" }, false)
    );
    expect(parseHabitRollupArg("no-strip,Read@weekly")).toEqual(
      ans(["Read"], { Read: "weekly" }, false)
    );
  });
});

describe("the all-ticked collapse and a chosen grain", () => {
  const registry = ["Read", "Gym"];
  const all = (grain?: TrackerClass) => [
    { id: "Read", shown: true, grain: grain ?? null },
    { id: "Gym", shown: true, grain: null },
  ];

  it("still writes nothing when nobody chose a grain", () => {
    expect(habitRollupAnswer(all(), registry, true)).toEqual(ans());
  });

  it("writes the list out when one habit carries a grain", () => {
    // THE COLLAPSE IS "SAY NOTHING AND FOLLOW THE VAULT", and a grain is
    // something to say. A chooser the window accepts and the note drops is the
    // same failure a dropped reorder would have been.
    expect(habitRollupAnswer(all("weekly"), registry, true)).toEqual(
      ans(["Read", "Gym"], { Read: "weekly" })
    );
    expect(habitRollupArg(habitRollupAnswer(all("weekly"), registry, true))).toBe(
      "Read@weekly,Gym"
    );
  });

  it("carries no grain for a habit the reader hid", () => {
    // The grains map is built from the SHOWN rows, so a hidden habit's stale
    // choice does not travel into a line that no longer names it.
    expect(
      habitRollupAnswer(
        [
          { id: "Read", shown: false, grain: "weekly" },
          { id: "Gym", shown: true, grain: null },
        ],
        registry,
        true
      )
    ).toEqual(ans(["Gym"]));
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
    expect(doc).toContain(
      "`habit-rollup[:<habit id>[@<grain>],…][,no-strip]`"
    );
    // AND THE PROSE SAYS WHICH SURFACE EACH OF THE TWO IS FOR, which is the
    // one question a reader with both in the Trackers list will have.
    expect(doc).toContain("**The Habits rollup.**");
    expect(doc).toContain("**The Habits section.**");
  });
});

// ── THE DRAWING AND THE WINDOW ────────────────────────────────────────────
describe("the card's shape", () => {
  it("draws no ring, and leaves statRing its one remaining caller (1.0.64)", () => {
    // THE REVERSAL. 1.0.61 gave both row types a ring, on the reader's own
    // *"one lead shape for both"*; 1.0.64 takes it off both, on the reader's
    // *"figure only, no ring"*. Eight rings down a quarterly card, most of them
    // drawn empty, were the largest thing on it — and the strip under each row
    // draws the same proportion slot by slot, which is strictly more.
    //
    // SWEPT ON THE COMMENT-STRIPPED SOURCE, because the prose above `drawRow`
    // names the ring and the function that drew it in order to record why
    // neither is there. A sweep over `readSrc` would be satisfied by that
    // paragraph and could never fail.
    const code = readCode("habit-rollup-view");
    expect(code).not.toContain("statRing");
    expect(code).not.toContain("ca-hrollup-lead");
    expect(code).not.toContain("<circle");
    // AND THE RING ITSELF IS NOT DEAD. `statStrip` draws one, which is the only
    // caller it had before 1.0.61 borrowed it — `test/dead-code.test.ts` is the
    // general form of this, and naming the surviving call site here is what
    // tells a later hand the removal was scoped to this card.
    expect(readSrc("stat-strip")).toContain("export function statRing(");
    expect(fnBody("statStrip", "stat-strip")).toContain("statRing(");
  });

  it("is live over the entries it is made of", () => {
    // Memory `live-widget-path-scope`: a widget made of WHICH files exist must
    // pass `shouldRefreshPath`, scoped to what its builder reads.
    //
    // ── THE DEFECT 1.0.55 SHIPPED, AND THE TEST THAT MISSED IT ─────────
    //
    // This asserted `paths.diaryDaily` and passed, because that is what the arm
    // said — and `paths.diaryDaily` is `02 - Diary/Daily`, the PRE-4.81 folder.
    // Entries have been filed under `diaryRoot`'s period tree since, so in any
    // vault written this year the scope matched nothing and the card never
    // repainted. A test can only assert the folder is the RIGHT one by naming
    // the function that computes it from the same expressions the reader uses,
    // which is `diaryEntryFolders`; naming a path constant is how the first one
    // agreed with the bug.
    //
    // Comments stripped, because the arm carries a paragraph of them between
    // the `case` and the call this is about.
    const index = readCode("widgets");
    expect(index).toContain('case "habit-rollup":');
    expect(index).toMatch(
      /case "habit-rollup":[\s\S]{0,80}liveScopedWidget\([\s\S]{0,120}diaryEntryFolders\(this\.plugin\.settings\.paths\)/
    );
    expect(index).not.toMatch(
      /case "habit-rollup":[\s\S]{0,200}paths\.diaryDaily/
    );
    expect(index).toMatch(
      /case "habit-rollup":[\s\S]{0,240}buildHabitRollup\(this\.plugin, ctx, rest\)/
    );
  });

  it("watches every folder an entry can be in, from one expression", () => {
    // ONE LIST, TWO SHAPES. `diaryEntryScope` is the predicate the calendar
    // watches with and `diaryEntryFolders` is the same six folders unprefixed,
    // because `liveScopedWidget` applies `folderPrefix` itself. Derived from
    // each other so a seventh folder cannot reach one and not the other.
    const lineage = readCode("lineage");
    expect(lineage).toContain(
      "const prefixes = diaryEntryFolders(paths).map(folderPrefix);"
    );
    const folders = fnBody("diaryEntryFolders", "lineage");
    expect(folders).toContain("paths.diaryRoot");
    expect(folders).toContain("legacyGrainFolder(paths, g)");
    expect(folders).toContain("Object.keys(CONTAINING_GRAIN)");
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
    expect(seeds).toContain(
      "answer.ids.length ? answer.ids : habits.map((h) => h.id)"
    );
  });

  // ── ONE LEAD SHAPE FOR BOTH ROW TYPES (1.0.61) ─────────────────────────
  //
  // 1.0.56's `Σ 128` IS THE THING THIS REVERSES, and the reader reversed it:
  // a number had no rate so it got no ring, which left two different pictures
  // down one column and a symbol the card never explained. Every row now reads
  // *picture, figure, name*.
  it("reads figure, name, sub — in that order, and nothing between", () => {
    const row = fnBody("drawRow", "habit-rollup-view");
    const code = readCode("habit-rollup-view");
    // THE ORDER IS THE READER'S SECOND CALL: *"the sub line moves right after
    // the name"*. Pinned to the right edge it sat a card's width from the habit
    // it was counting; the slack falls at the end of the row now, where nothing
    // is reading. Asserted as THREE POSITIONS and not three substrings, because
    // all three spans existed before this round and only their order changed —
    // a `toContain` trio would pass on the old card.
    const pct = row.indexOf('cls: "ca-hrollup-pct"');
    const name = row.indexOf('cls: "ca-hrollup-name"');
    const sub = row.indexOf('cls: "ca-hrollup-sub"');
    expect(pct).toBeGreaterThan(0);
    expect(name).toBeGreaterThan(pct);
    expect(sub).toBeGreaterThan(name);
    expect(row).toContain('el.createSpan({ cls: "ca-hrollup-pct", text: figure })');
    // ONE FIGURE FOR BOTH TYPES, through the one function that knows which
    // figure a type gets.
    expect(row).toContain("const figure = rollupFigure(row);");
    expect(code.match(/rollupFigure\(/g)).toHaveLength(2);
    // The Σ and the span it labelled are both gone from the tree.
    expect(code).not.toContain("Σ");
    expect(code).not.toContain("ca-hrollup-total");
    // AND THE SENTENCE HANGS OFF THE NAME. It used to hang off the ring; with
    // the ring gone the row itself is `display: contents` and has no box to
    // hover, so a `title` on the row would never be read by anyone.
    expect(row).toContain('name.setAttr("title", said)');
    expect(row).toContain('name.setAttr("aria-label", said)');
  });

  // ── THE GRAIN GROUPS ON THE CARD (1.0.61) ──────────────────────────────
  it("gives each grain a section of head and body (1.0.65)", () => {
    const build = fnBody("buildHabitRollup", "habit-rollup-view");
    // ONE SECTION PER GROUP, ON THE LIST, with the head and the rows inside it.
    // 1.0.61 refused this wrapper and was right to: a container is a second
    // grid, and every group's figures would line up only with each other —
    // 1.0.31's records-table bug for the fourth time. Subgrid is what made the
    // container free, and the stylesheet carries that argument.
    expect(build).toMatch(
      /for \(const group of rollupGroups\(rows\)\) \{[\s\S]*?const sect = list\.createDiv\(\{ cls: "ca-hrollup-sect" \}\);/
    );
    expect(build).toContain('sect.createEl("button", {');
    expect(build).toContain('cls: "ca-hrollup-head"');
    expect(build).toContain("text: TRACKER_CLASS_LABELS[group.grain],");
    // THE HEAD IS A `<button>` AND NOT A DIV WITH A CLICK ON IT. It toggles its
    // section, so Enter and Space have to work, and nothing in this file should
    // be re-implementing either.
    expect(build).not.toContain('createDiv({ cls: "ca-hrollup-head"');
    // AND THE ROWS GO IN THE BODY, which is the half that folds.
    expect(build).toContain('const body = sect.createDiv({ cls: "ca-hrollup-body" });');
    expect(build).toContain(
      "for (const row of group.rows) drawRow(body, row, label, answer.strip);"
    );
    const head = build.indexOf('cls: "ca-hrollup-head"');
    const body = build.indexOf("const body =");
    expect(head).toBeGreaterThan(0);
    expect(body).toBeGreaterThan(head);
  });

  it("says how many habits a closed section is holding", () => {
    // A HEADER THAT FOLDS EIGHT HABITS AWAY AND THEN READS AS IT DID WITH ONE
    // is a control whose own state is invisible. The count is off the group's
    // own rows, so it cannot disagree with what unfolding shows.
    const build = fnBody("buildHabitRollup", "habit-rollup-view");
    expect(build).toMatch(
      /cls: "ca-hrollup-head-count",\s*text: String\(group\.rows\.length\),/
    );
    // IT IS THE DRAWN ROWS AND NOT THE REGISTRY'S. `rows` is already the
    // reader's own list where the directive names one, so a habit they hid is
    // not counted in the section it is not in.
    expect(build).not.toContain("String(all.length)");
    expect(build).not.toContain("String(seeds.length)");
  });

  it("folds the body and never the head", () => {
    // `foldableSection`'s OWN RULE, and the reason: a section that folded itself
    // away entirely would leave the reader nothing to click to get it back.
    const build = fnBody("buildHabitRollup", "habit-rollup-view");
    expect(build).toContain('sect.toggleClass("is-closed", closed)');
    expect(build).not.toContain('head.toggleClass("is-closed"');
    // THE STATE IS SAID OUT LOUD AS WELL AS DRAWN. A chevron that only turns is
    // a fold a screen reader cannot report.
    expect(build).toContain('head.setAttr("aria-expanded", String(!closed))');
    // AND THE CLICK ASKS THE STORE, NOT THE DOM. Reading the class back would
    // work until something else toggled it, and the store is the thing that has
    // to end up agreeing with the picture.
    expect(build).toContain("const next = !folds.isCollapsed(key);");
    expect(build).toContain("folds.setCollapsed(key, next);");
    // THE RULE'S BODY AND NOT ITS SELECTOR. `toContain` on the selector alone
    // measured VACUOUS — `opacity: 0.5` under the same selector survives it, and
    // a "folded" section that is merely faint still takes its whole height.
    //
    // AND IT IS OUTSIDE THE `@supports` BLOCK, so the fold works whether or not
    // the section got a box: `display: none` here outranks the
    // `display: contents` on the plain `.ca-hrollup-body` on specificity alone.
    expect(cssRule(".ca-hrollup-sect.is-closed .ca-hrollup-body")).toContain(
      "display: none"
    );
  });

  it("remembers a closed section per note and grain, storing only the closure", () => {
    const code = readCode("habit-rollup-view");
    // THE ONE RECORD EVERY FOLD IN THIS PLUGIN KEEPS ITS ANSWER IN, namespaced
    // so it cannot collide with a title a reader wrote — the rule `::frame:`,
    // `::note:`, `::reveal:` and `::calendar:` all followed.
    expect(code).toContain("`${sourcePath}::hrollup:${grain}`");
    expect(rollupFoldKey("Diary/2026-Q4.md", "weekly")).toBe(
      "Diary/2026-Q4.md::hrollup:weekly"
    );
    expect(rollupFoldKey("a.md", "daily")).not.toBe(rollupFoldKey("b.md", "daily"));
    expect(rollupFoldKey("a.md", "daily")).not.toBe(rollupFoldKey("a.md", "weekly"));
    // ── ABSENT MEANS OPEN, SO ONLY A CLOSURE IS STORED ────────────────────
    //
    // `Widgets.foldStore()`'s policy and not `directive-regions.ts`'. The
    // calendar's two panels ship CLOSED, so "the reader opened this" is a fact
    // only a stored `false` can carry; these ship OPEN, so a stored `false`
    // would be a row recording that nothing happened — in a map that is pruned
    // by path and otherwise only ever grows.
    const store = fnBody("rollupFolds", "habit-rollup-view");
    expect(store).toContain("if (value) map[key] = true;");
    expect(store).toContain("else delete map[key];");
    expect(store).toContain("=== true");
    // FIRE AND FORGET, as every other fold write is: a failed save costs a
    // remembered section, not correctness, and awaiting it would make a click
    // on a header wait for disk.
    expect(store).toContain("void plugin.saveSettings();");
    expect(store).not.toContain("await");
  });

  it("draws the heading even when every habit shares one grain", () => {
    // THE CASE THAT DECIDED IT. Suppressing a lone heading was the obvious
    // economy and fails twice: `@container (max-width: 360px)` hides
    // `.ca-hrollup-sub`, so on a phone an all-daily card would say nothing at
    // all about its grain — and the window behind the door draws exactly one
    // heading on such a vault, so the card would be the only surface with a
    // second rule.
    const build = fnBody("buildHabitRollup", "habit-rollup-view");
    expect(build).not.toMatch(/groups\.length\s*>\s*1/);
    expect(build).not.toMatch(/new Set\([\s\S]{0,60}grain/);
  });

  it("takes its heading words from the table the window reads", () => {
    const code = readCode("habit-rollup-view");
    expect(code).toContain("TRACKER_CLASS_LABELS[group.grain]");
    // NO SIXTH HAND-WRITTEN TABLE OF THE FIVE WORDS. `TRACKER_CLASS_LABELS` is
    // derived from `CLASS_DEFS`, and the window's headings are the same read.
    expect(code).not.toMatch(/"(Daily|Weekly|Monthly|Quarterly|Yearly) entries"/);
    expect(readCode("habit-rollup-editor")).toContain("TRACKER_CLASS_LABELS[");
  });

  it("stamps the SECTION's grain under a name the ring cannot see", () => {
    // THE HAZARD, AND IT IS NOT HYPOTHETICAL. `[data-ca-grain]` binds
    // `--ca-grain-accent` five ways in the presets sheet, and one of the rules
    // reading it is `[data-ca-grain] .ca-stat-ring-val`. A `var()` is
    // substituted on the element that DECLARES the property, so an element
    // wearing that attribute would repaint any ring inside it — which the
    // reader ruled out in 1.0.61: the tint is the strip's and nowhere else.
    const build = fnBody("buildHabitRollup", "habit-rollup-view");
    expect(build).toContain('sect.setAttr("data-ca-row-grain", group.grain)');
    // ONE STAMP PER SECTION, NOT ONE PER ROW (1.0.65). A group IS one grain, so
    // the row was writing a fact about its section n times — and the header
    // strip cannot tint itself with a property its own children declare. The
    // rows still read it, because a custom property inherits through
    // `display: contents`, which is what the section is without subgrid.
    expect(fnBody("drawRow", "habit-rollup-view")).not.toContain(
      "data-ca-row-grain"
    );
    // `readCode`, SO THE PROSE ABOVE MAY NAME THE TRAP it is warning about.
    const code = readCode("habit-rollup-view");
    expect(code).not.toContain('"data-ca-grain"');
    expect(code).not.toContain("--ca-grain-accent");
    expect(code.match(/data-ca-row-grain/g)).toHaveLength(1);
  });

  it("names the slot in the strip's own tooltip", () => {
    // `"no entry for that day"` WAS HARDCODED, on a card that draws thirteen
    // weekly marks across a quarter. The expression and not the wording, since
    // a refusal whose condition is gone keeps its sentence.
    const strip = fnBody("drawStrip", "habit-rollup-view");
    expect(strip).toContain("const noun = CLASS_DEFS[row.grain].periodNoun");
    expect(strip).toContain("`no entry for that ${noun}`");
    expect(readCode("habit-rollup-view")).not.toContain("no entry for that day");
  });

  it("draws the whole period, lived slots first and the rest blanked", () => {
    // *"The day strips should always match the dashboard period range."* The
    // strip is the one reader of `row.ahead`, and this is the arithmetic the
    // two lists have to agree on.
    const strip = fnBody("drawStrip", "habit-rollup-view");
    // BLANKED ON THE WAY IN, so a slot nobody has reached cannot carry a
    // reading however it was built. `row.ahead` is `habitSlots`' output and
    // those fields are already empty — this is the statement, and it is what
    // makes the `is-ahead` arm below the only thing that can paint them.
    expect(strip).toContain("const rest: HabitSlotReading[] = row.ahead.map");
    expect(strip).toMatch(/state: null,\s*value: null,\s*written: false,/);
    // LIVED FIRST AND THE COUNT FROM THE END, which is what `stripCells`' and
    // `numberStripCells`' `ahead` parameter means. Reversed, every lived mark
    // would be drawn as unreached and the whole strip would go faint.
    expect(strip).toContain("const all = [...row.slots, ...rest];");
    expect(strip).toContain("numberStripCells(all, row.unit, rest.length)");
    expect(strip).toContain("stripCells(all, rest.length)");
    // CONCATENATED BEFORE GROUPING AND NOT AFTER. Grouping each list on its own
    // would end the lived half in a stub — three days shaded over three days
    // reads as a bad week rather than a short one, which is the same argument
    // `stripCells` groups from the period's own start for.
    const cells = strip.indexOf("const cells =");
    expect(cells).toBeGreaterThan(strip.indexOf("const all ="));
    // AND THE UNREACHED ARM COMES FIRST AND LEAVES. Below it sit the two arms
    // that read `state` and `ratio`, and both would paint an unreached mark:
    // the single arm as "nothing recorded", the shade arm as a null ratio with
    // the bare label. A mark the reader is told nothing about is the one the
    // clip exists to avoid.
    const ahead = strip.indexOf("if (cell.ahead) {");
    expect(ahead).toBeGreaterThan(0);
    expect(strip.indexOf("if (cell.single) {")).toBeGreaterThan(ahead);
    expect(strip).toContain('el.addClass("is-ahead")');
    expect(strip).toContain('el.setAttr("aria-label", `${cell.label}: not yet`)');
    expect(
      strip.slice(ahead, strip.indexOf("if (cell.single) {"))
    ).toContain("continue;");
  });

  it("mutes a row by the type's own idea of nothing", () => {
    expect(fnBody("drawRow", "habit-rollup-view")).toContain(
      'el.toggleClass("is-idle", rollupIdle(row))'
    );
  });

  it("counts the habits waiting for a grain from the list the window shows", () => {
    // ONE ANSWER, NOT TWO. The card's count and the window's trailing group are
    // the same array filtered the same way — a second function returning the
    // same number is the shape that stays consistent until somebody edits one.
    const build = fnBody("buildHabitRollup", "habit-rollup-view");
    expect(build).toContain("const seeds = rollupSeeds(habits, all, answer, dash)");
    expect(build).toContain("seeds.filter((s) => s.grain == null).length");
    expect(build).toContain("const dash = grainOfUnit(period.unit)");
    // The dashboard's grain reaches the read as a fallback, not as a filter.
    expect(build).toContain("answer.grains,");
  });

  it("says which of the two reasons an empty card has", () => {
    // Until 1.0.56 a multi-grain habit vanished with no sentence anywhere.
    const build = fnBody("buildHabitRollup", "habit-rollup-view");
    expect(build).toContain("before it can be read — choose one below.");
    expect(build).toContain("no longer in the vault");
  });

  // ── THE WINDOW'S GROUPS (1.0.56) ───────────────────────────────────────
  it("groups the window's rows by the model's own resolution", () => {
    const code = readCode("habit-rollup-editor");
    // `resolveGrain` AND NOT FOUR CLAUSES WRITTEN AGAIN: the card and the
    // window must place a habit in the same grain, and asking the same function
    // is the only way that survives an edit to it.
    expect(code).toContain(
      "resolveGrain(row.grains, row.chosen ?? undefined, this.dashboard)"
    );
    // The five grains in canonical order, and the waiting group last.
    expect(code).toContain("[...TRACKER_CLASSES, NEEDS_GRAIN] as const");
    // Headings are the registry's own words, not a fourth hand-copy of them.
    expect(code).toContain("TRACKER_CLASS_LABELS[key]");
    // An empty group is not drawn: five headings on an all-daily vault is four
    // sentences about nothing.
    expect(code).toContain("if (!members?.length) continue;");
  });

  it("sets a group rather than inverting it", () => {
    // A reader who sees "some" and clicks wants all of them, not the
    // complement of what they already have.
    const code = readCode("habit-rollup-editor");
    expect(code).toContain("for (const row of members) row.shown = !all;");
    expect(code).not.toContain("row.shown = !row.shown;\n      }\n    });\n    const name");
    // Three states, two glyphs: mixed is a class, not a mark nobody has met.
    expect(code).toContain('tick.toggleClass("is-mixed", on > 0 && !all)');
  });

  it("gives a waiting row its chooser and no tick", () => {
    // Ticking something the rollup cannot read is a control whose only effect
    // is to write an id the renderer then skips.
    const row = fnBody("renderRow", "habit-rollup-editor");
    expect(row).toContain("const waiting = this.groupOf(row) === NEEDS_GRAIN;");
    expect(row).toContain("if (!waiting) {");
    expect(row).toContain("if (row.grains.length > 1) this.renderGrain(el, row);");
  });

  it("offers a habit its OWN grains and nothing else", () => {
    // A habit on daily and weekly offered a monthly option is offered a grain
    // with no slots in it — which is the 1.0.55 defect, through a dropdown.
    const grain = fnBody("renderGrain", "habit-rollup-editor");
    expect(grain).toContain("for (const grain of row.grains) {");
    expect(grain).toContain('sel.createEl("option", { value: "", text: "Not chosen" })');
    expect(grain).toContain("row.chosen = row.grains.find((g) => g === picked) ?? null;");
    expect(grain).not.toContain("TRACKER_CLASSES");
  });

  it("moves a row within its group, and in the list the answer is built from", () => {
    const row = fnBody("renderRow", "habit-rollup-editor");
    expect(row).toContain("const can = to >= 0 && to < members.length;");
    // THE SWAP IS IN `this.rows`: the group's array is a view, and a move made
    // only in it is a gesture that survives until Save and then vanishes.
    expect(row).toContain("const from = next.indexOf(row);");
    expect(row).toContain("const onto = next.indexOf(members[to]);");
    expect(row).toContain('btn.toggleClass("is-static", !can)');
  });

  it("refuses a list of habits that are all waiting, with the guard stated", () => {
    const code = readCode("habit-rollup-editor");
    expect(code).toContain(
      "if (shown.length && shown.every((r) => this.groupOf(r) === NEEDS_GRAIN)) {"
    );
    expect(code).toContain("is waiting for a grain");
  });

  it("saves one answer, grains included", () => {
    const code = readCode("habit-rollup-editor");
    expect(code).toContain(
      "this.rows.map((r) => ({ id: r.id, shown: r.shown, grain: r.chosen }))"
    );
    expect(code).toContain("habitRollupAnswer(");
  });

  it("says which count a number habit's row is showing", () => {
    const row = fnBody("renderRow", "habit-rollup-editor");
    expect(row).toContain('row.type === "number" ? " logged" : ""');
  });
});

// ── THE WINDOW'S SEEDS (1.0.56) ───────────────────────────────────────────
describe("rollupSeeds", () => {
  const rowFor = (id: string, over: Record<string, unknown> = {}) =>
    ({
      id,
      label: id,
      grain: "daily",
      type: "boolean",
      slots: [{}, {}, {}],
      done: 2,
      written: 3,
      current: 0,
      best: 0,
      rate: 2 / 3,
      logged: 1,
      total: 9,
      mean: 9,
      unit: null,
      ...over,
    }) as unknown as Parameters<typeof rollupSeeds>[1][number];

  const journal = {
    id: "Confident",
    label: "Confident",
    type: "boolean",
    surface: { kind: "journal", journals: [] },
  } as unknown as TrackerDef;

  it("lists a habit the card has no row for, which is the whole point", () => {
    // A HABIT WAITING FOR A GRAIN HAS NO ROW BY CONSTRUCTION — that is what
    // waiting means — so a window built from rows would list every habit except
    // the ones it exists to settle.
    const seeds = rollupSeeds(
      [spread("Stretch", "daily", "weekly")],
      [],
      ans(),
      "monthly"
    );
    expect(seeds).toHaveLength(1);
    expect(seeds[0].grain).toBeNull();
    expect(seeds[0].grains).toEqual(["daily", "weekly"]);
    // Nothing to report yet, and the window says so rather than printing 0 of 0.
    expect(seeds[0].slots).toBe(0);
  });

  it("does not list a habit on no diary grain at all", () => {
    // Offering a journal tracker a chooser of five grains it is not logged on
    // is a control that cannot help — and it is exactly the set the card skips.
    expect(rollupSeeds([journal], [], ans(), "daily")).toEqual([]);
    expect(rollupRegistry([journal, habit("Read")])).toEqual(["Read"]);
  });

  it("keeps the reader's choice apart from what it resolved to", () => {
    // A habit sitting in the Weekly group because the DASHBOARD is weekly has
    // chosen nothing; a `<select>` showing it as chosen would write that grain
    // into the note the next time anything else was saved.
    const both = spread("Stretch", "daily", "weekly");
    const [auto] = rollupSeeds([both], [], ans(), "weekly");
    expect(auto.grain).toBe("weekly");
    expect(auto.chosen).toBeNull();
    const [said] = rollupSeeds([both], [], ans([], { Stretch: "daily" }), "weekly");
    expect(said.grain).toBe("daily");
    expect(said.chosen).toBe("daily");
    // A STALE CHOICE IS NOT DRAWN AS ONE.
    const [stale] = rollupSeeds(
      [both],
      [],
      ans([], { Stretch: "monthly" }),
      "weekly"
    );
    expect(stale.chosen).toBeNull();
    expect(stale.grain).toBe("weekly");
  });

  it("carries the count each type means", () => {
    // A number habit's `done` would otherwise be the slots whose reading
    // happened to equal 1 — true, and about nothing.
    const [bool] = rollupSeeds([habit("Read")], [rowFor("Read")], ans(), "daily");
    expect(bool.done).toBe(2);
    const [num] = rollupSeeds(
      [metre("Run")],
      [rowFor("Run", { type: "number" })],
      ans(),
      "daily"
    );
    expect(num.done).toBe(1);
    expect(num.type).toBe("number");
  });

  it("ticks everything for a bare line, and the reader's order first", () => {
    const habits = [habit("Read"), habit("Gym"), habit("Floss")];
    expect(rollupSeeds(habits, [], ans(), "daily").map((x) => x.shown)).toEqual([
      true,
      true,
      true,
    ]);
    const named = rollupSeeds(habits, [], ans(["Floss", "Read"]), "daily");
    expect(named.map((x) => x.id)).toEqual(["Floss", "Read", "Gym"]);
    expect(named.map((x) => x.shown)).toEqual([true, true, false]);
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
    // THREE TRACKS, FIGURE / NAME / SUB (1.0.64) — where it was four with the
    // ring first and the sub pinned last. The terminating semicolon is in the
    // expectation on purpose: `vacuous-sweep-rule`'s fourth shape is an
    // expected value that is a PREFIX of the one it replaced, and
    // `auto minmax(0, max-content) minmax(0, 1fr)` is not a prefix of the old
    // list but `auto minmax(0, 1fr)` — the narrow-width override — is a prefix
    // of plenty.
    const list = cssRules(".ca-hrollup-list");
    expect(list[0]).toContain(
      "grid-template-columns: auto minmax(0, max-content) minmax(0, 1fr);"
    );
    // `max-content` ON THE NAME, so one column of names ends where the longest
    // one does and every sub line starts at the same place. A ragged left edge
    // down a column of counts is what stops a list of nine scanning.
    expect(list[0]).not.toContain("grid-template-columns: auto auto");
    expect(cssRule(".ca-hrollup-row")).toContain("display: contents");
    // And the name truncates rather than pushing the sub off the card, which is
    // what `minmax(0, …)` and not a bare `max-content` buys.
    expect(cssRule(".ca-hrollup-name")).toContain("text-overflow: ellipsis");
    expect(cssRule(".ca-hrollup-name")).toContain("min-width: 0");
    // AT PHONE WIDTH THE SUB GOES AND THE NAME TAKES THE SLACK. Leaving three
    // tracks there would stop the name at its longest sibling and hold the
    // leftover in a track with nothing in it.
    expect(list).toHaveLength(2);
    expect(list[1]).toContain("grid-template-columns: auto minmax(0, 1fr);");
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
    expect(strip).not.toContain("flex-wrap");
    // ── A CELL HAS A CEILING (1.0.64) ───────────────────────────────────────
    //
    // `minmax(0, 1fr)` SIZED A MARK BY THE CARD AND NOT BY THE CALENDAR, which
    // is most of *"the rollup is visually messy"*: two slots on a week card
    // drew two slabs three hundred pixels wide. `10px` is a mark's size, and
    // the strip's LENGTH is what says how long the period is.
    //
    // `minmax(0, 10px)` AND NOT `10px`, so the ceiling is a ceiling: ninety-two
    // marks at ten pixels is wider than any card, and a track whose maximum is
    // fixed shares the space it actually has instead of overflowing. The
    // left-alignment is arithmetic rather than a declaration — the tracks no
    // longer add up to the row, so the leftover falls at the end.
    expect(strip).toContain("grid-auto-columns: minmax(0, 10px);");
    expect(strip).not.toContain("minmax(0, 1fr)");
  });

  it("gives a mark the three vocabularies its three meanings need", () => {
    // A base rule that means "nothing recorded", so the gaps are drawn; the
    // binary pair for a single slot; a four-step ramp for a grouped one; and
    // from 1.0.64 a fourth reading — a slot the period has not reached yet.
    expect(cssRule(".ca-hrollup-cell")).toContain("background");
    expect(cssRules(".ca-hrollup-cell.is-done")).toHaveLength(1);
    expect(cssRules(".ca-hrollup-cell.is-not-done")).toHaveLength(1);
    expect(cssRules(".ca-hrollup-cell.is-ahead")).toHaveLength(1);
    for (const n of [1, 2, 3, 4]) {
      expect(cssRule(`.ca-hrollup-cell.ca-act-${n}`)).toContain("background:");
    }
    // ── THE EMPTY MARK AND THE UNREACHED ONE ARE NOT THE SAME MARK ──────────
    //
    // *"The day strips should always match the dashboard period range"*, so the
    // strip draws the eighteen days left in the month as well as the twelve
    // that were missed — and if those looked alike the strip would report a
    // month of failure on its second day. Fainter than the empty mark and the
    // same size, so the edge between them is where today is.
    const ahead = cssRule(".ca-hrollup-cell.is-ahead");
    expect(ahead).not.toBe(cssRule(".ca-hrollup-cell"));
    expect(ahead).toContain("var(--background-modifier-border) 40%");
    // AND IT IS A BACKGROUND AND NOT A SIZE OR AN OPACITY. `opacity` would take
    // the gap between the marks with it on any theme whose card is not the
    // body's colour, and a shorter mark would make the strip's own length — the
    // thing that says how long the period is — read as two strips.
    expect(ahead).not.toContain("opacity");
    expect(ahead).not.toContain("height");
  });

  it("gives both kinds of row one figure cell and no picture (1.0.64)", () => {
    // `.ca-hrollup-total` AND ITS `span 2` ARE GONE, from 1.0.61: a number used
    // to take the ring's track and the figure's with one span. `.ca-hrollup-lead`
    // and its `is-cover` variant are gone from 1.0.64, which is the reader's
    // *"figure only, no ring"* — so there is no picture track left either, and
    // the figure is the first thing on every line.
    expect(cssRules(".ca-hrollup-total")).toHaveLength(0);
    expect(cssRules(".ca-hrollup-lead")).toHaveLength(0);
    expect(cssRules(".ca-hrollup-lead.is-cover .ca-stat-ring-val")).toHaveLength(
      0
    );
    const pct = cssRule(".ca-hrollup-pct");
    expect(pct).toContain("font-variant-numeric: tabular-nums");
    expect(pct).toContain("text-align: right");
    expect(cssRules(".ca-hrollup-list").some((r) => r.includes("span"))).toBe(
      false
    );
    // NO SELECTOR OF THIS CARD'S TOUCHES A RING AT ALL, which is what keeps the
    // `[data-ca-grain] .ca-stat-ring-val` hazard below unreachable from here:
    // the sweep that mattered was never about weight, it was about a descendant
    // selector finding a ring inside a row that had bound the grain property.
    // SWEPT WITH THE PROSE TAKEN OUT. The block this replaced is still in the
    // stylesheet as a comment naming both class and ring, which is the whole of
    // why it is readable — and `[^{}]*` runs through a comment happily, so a
    // sweep over the raw sheet matches that paragraph and can never pass.
    const bare = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    expect(bare).not.toMatch(/\.ca-hrollup[\w-]*[^{}]*\.ca-stat-ring/);
  });

  it("heads a grain's section across the one grid (1.0.65)", () => {
    // `grid-column: 1 / -1` IS THE STRIP'S OWN TRICK, now spanning the SECTION's
    // subgridded tracks rather than the list's — which are the same tracks, and
    // that is the whole of why a container is safe here and was not in 1.0.61.
    const head = cssRule(".ca-hrollup-head");
    expect(head).toContain("grid-column: 1 / -1");
    expect(head).toContain("text-transform: uppercase");
    expect(head).toContain("var(--text-muted)");
    // ── `obsidian-button-height` ──────────────────────────────────────────
    //
    // A chip-shaped `<button>` is 30px in this app until all three of these are
    // reset, and "no visual change" is the signature of forgetting one. The
    // head became a button in 1.0.65 because it toggles its section.
    expect(head).toContain("height: auto");
    expect(head).toContain("min-height: 0");
    expect(head).toContain("border: 0");
    expect(head).toContain("cursor: pointer");
    // TINTED WITH ITS OWN GRAIN, which is the one thing on the card that names
    // the section without being read. It works only because the stamp moved up
    // to the section: the head is a child of the element that declares it.
    expect(head).toContain("var(--ca-hrollup-grain)");
    // EXACTLY ONE RULE AND ONE HOVER, so no narrow-width override can hide the
    // one line that still says the grain once `.ca-hrollup-sub` goes.
    expect(cssRules(".ca-hrollup-head")).toHaveLength(1);
    expect(cssRules(".ca-hrollup-head:hover")).toHaveLength(1);
    // THE AIR BETWEEN SECTIONS IS THE LIST'S ROW GAP NOW. The old
    // `:not(:first-child)` margin was an exception to keep in step with; the
    // list's only children are sections, so the gap is simply between them.
    expect(
      cssRules(".ca-hrollup-list > .ca-hrollup-head:not(:first-child)")
    ).toHaveLength(0);
    // AND THE MUTING NEVER REACHES IT. The head is the body's sibling, so this
    // needs no rule — and must not acquire one.
    expect(cssRules(".ca-hrollup-row.is-idle .ca-hrollup-head")).toHaveLength(0);
  });

  it("frames and bands a section, and only where subgrid exists (1.0.65)", () => {
    // ── A `display: contents` ELEMENT HAS NO BOX, SO IT CANNOT BE PAINTED ───
    //
    // The 1.0.63 lesson on a second surface. Subgrid gives the section and the
    // row a box while still using the LIST's tracks, so a frame and a band
    // become possible without the second grid that 1.0.61 refused the wrapper
    // over. Everything paintable therefore lives behind the `@supports` guard
    // and the fallback is the 1.0.64 card, unframed and unbanded.
    for (const sel of [".ca-hrollup-sect", ".ca-hrollup-body"]) {
      const rules = cssRules(sel);
      expect(rules[0]).toContain("display: contents");
      expect(rules.some((r) => r.includes("grid-template-columns: subgrid"))).toBe(
        true
      );
    }
    const sect = cssRules(".ca-hrollup-sect");
    expect(sect.some((r) => r.includes("border-radius"))).toBe(true);
    // `overflow: hidden` IS WHAT MAKES THE CORNERS MEAN ANYTHING — the head's
    // tint and the first band both run to the edge, and an unclipped child
    // squares them off again.
    expect(sect.some((r) => r.includes("overflow: hidden"))).toBe(true);
    // ONE BAND PER HABIT, COVERING ITS STRIP, RESTARTING AT EACH SECTION. All
    // three fall out of the shape rather than out of a declaration: the ROW is
    // the box, the strip is inside it, and `:nth-child` counts within the body.
    expect(cssRule(".ca-hrollup-row:nth-child(odd)")).toContain(
      "background: var(--ca-zebra)"
    );
    expect(cssRules(".ca-hrollup-strip:nth-child(odd)")).toHaveLength(0);
    expect(cssRules(".ca-hrollup-cell:nth-child(odd)")).toHaveLength(0);
    // AND THE STRIP'S OWN MARGIN BECOMES PADDING INSIDE THE BAND. A margin
    // there would leave a stripe of card showing through every band.
    expect(cssRule(".ca-hrollup-row .ca-hrollup-strip")).toContain(
      "margin-bottom: 0"
    );
    // NO INLINE PADDING ON A SUBGRID, ANYWHERE. A subgrid's padding comes out of
    // its first and last tracks, so a section that padded itself would hold its
    // figure column somewhere no other section does — the exact misalignment
    // this whole shape exists to prevent.
    for (const r of [...sect, ...cssRules(".ca-hrollup-body"), ...cssRules(".ca-hrollup-row")]) {
      expect(r).not.toMatch(/padding(-inline|-left|-right)?:/);
    }
  });

  it("ramps every filled mark in the row's own grain (1.0.64)", () => {
    expect(cssRule(".ca-hrollup-cell.is-done")).toContain(
      "background: var(--ca-hrollup-grain)"
    );
    // ── THE REVERSAL, AND WHY ───────────────────────────────────────────────
    //
    // 1.0.61's eighth call tinted a KEPT boolean mark by grain and left a
    // grouped mark on the `--ca-act-*` ramp, on the argument that a shade means
    // the same amount of activity everywhere this plugin draws one. In the
    // vault that read as a fault rather than a rule: one list, two palettes, a
    // daily habit orange on one line and green on the next — and a number's
    // strip, whose marks are ALL grouped, took no grain at all.
    //
    // A LIGHTNESS RAMP OF ONE HUE SAYS BOTH THINGS AT ONCE: the hue is the
    // grain, the lightness is how much. So the four stops are mixes of the
    // row's own property, and the top stop is the property itself — the same
    // colour `is-done` paints, which is what makes a full group and a kept slot
    // the same mark.
    for (const n of [1, 2, 3] as const) {
      const rule = cssRule(`.ca-hrollup-cell.ca-act-${n}`);
      expect(rule).toContain("color-mix(in srgb, var(--ca-hrollup-grain)");
      expect(rule).not.toContain(`--ca-act-${n}`);
    }
    expect(cssRule(".ca-hrollup-cell.ca-act-4")).toContain(
      "background: var(--ca-hrollup-grain)"
    );
    // AND THE RAMP STILL RAMPS. Four stops that all resolved to the same mix
    // would pass every assertion above and draw one flat colour, which is the
    // first shape `vacuous-sweep-rule` records: read the percentages out and
    // require them to ascend.
    const steps = [1, 2, 3].map((n) => {
      const m = /var\(--ca-hrollup-grain\) (\d+)%/.exec(
        cssRule(`.ca-hrollup-cell.ca-act-${n}`)
      );
      expect(m).not.toBeNull();
      return Number(m?.[1]);
    });
    expect(steps).toEqual([...steps].sort((a, b) => a - b));
    expect(new Set(steps).size).toBe(3);
    // MIXED TOWARD `transparent` AND NOT TOWARD A SURFACE COLOUR, so a card on
    // any theme ramps toward its own background rather than toward the one this
    // was written on.
    for (const n of [1, 2, 3]) {
      expect(cssRule(`.ca-hrollup-cell.ca-act-${n}`)).toContain(", transparent)");
    }
    // THE BASE RULE AND THE OUTLINE ARE STILL UNTOUCHED. They mean "no reading"
    // and "a reading of no", which are facts about the slot and not about how
    // much — a grain on either would say a habit was logged where it was not.
    expect(cssRule(".ca-hrollup-cell")).not.toContain("--ca-hrollup-grain");
    expect(cssRule(".ca-hrollup-cell.is-not-done")).not.toContain(
      "--ca-hrollup-grain"
    );
    expect(cssRule(".ca-hrollup-cell.is-ahead")).not.toContain(
      "--ca-hrollup-grain"
    );
    // AND THE OTHER STRIPS KEEP THE RAMP. `tracker-stat.ts`'s and the journal's
    // draw one tracker over time with no grain to speak of, which is the
    // reading `--ca-act-*` was made for; this round is scoped to the one card
    // that lists several grains at once.
    expect(cssRule(".ca-tstat-cell.ca-act-4")).toContain("var(--ca-act-4)");
  });

  it("binds the grain through a private property, never the page's (1.0.61)", () => {
    const palette: Record<string, string> = {
      daily: "--ca-grain-daily",
      weekly: "--ca-grain-weekly",
      monthly: "--ca-grain-monthly",
      quarterly: "--ca-grain-quarterly",
      yearly: "--ca-grain-yearly",
    };
    for (const grain of TRACKER_CLASSES) {
      // ON THE SECTION AS OF 1.0.65. A group IS one grain, and the header strip
      // tints itself with this property — which it can only do if the element
      // declaring it is an ancestor of the head. The rows still read it: a
      // custom property inherits through `display: contents`, which is what a
      // section is on a browser without subgrid.
      const rule = cssRule(`.ca-hrollup-sect[data-ca-row-grain="${grain}"]`);
      expect(rule).toContain(`--ca-hrollup-grain: var(${palette[grain]})`);
      // THE SAME HAZARD BY THE OTHER DOOR. Binding `--ca-grain-accent` here
      // would recolour this row's ring whether or not the selector that reads
      // it matches, because a `var()` resolves against the declaring ancestor.
      expect(rule).not.toContain("--ca-grain-accent");
    }
    // The default is declared once, on `body` and not `:root`, because it reads
    // a theme colour (4.42) — `tokens.test.ts` is the general form of that.
    expect(cssRule("body")).toContain(
      "--ca-hrollup-grain: var(--interactive-accent)"
    );
    expect(cssRule(":root")).not.toContain("--ca-hrollup-grain");
    // AND NO ROLLUP SELECTOR ANYWHERE REACHES A RING. With the ring off the
    // card the hazard is no longer about this sheet at all, but the attribute
    // name is still load-bearing: `data-ca-grain` on a row would rebind
    // `--ca-grain-accent` for everything inside it, and the presets sheet reads
    // that property through a DESCENDANT selector onto any ring a later round
    // puts back. A private attribute binding a private property reaches nothing
    // it was not pointed at.
    // `[data-ca-grain=…]` ITSELF IS NOT THE THING TO FORBID — the presets sheet
    // binds the DASHBOARD's grain through it five ways and has since 4.80, and
    // `vault-banner.ts` stamps it on the leaf. What must never exist is a
    // selector that puts it on a part of this card.
    for (const sel of ["row", "sect", "head", "cell", "strip"]) {
      expect(readCss()).not.toContain(`.ca-hrollup-${sel}[data-ca-grain`);
    }
  });

  it("keeps monochrome monochrome (1.0.61)", () => {
    // `body.ca-grain-monochrome` resets `--ca-grain-accent` and its three
    // companions — every channel the grain palette had until this one. The five
    // bindings above read the raw palette tokens, which that preset never
    // touches, so without this a reader who asked for one colour got five.
    expect(cssRule("body.ca-grain-monochrome .ca-hrollup-row")).toContain(
      "--ca-hrollup-grain: var(--interactive-accent)"
    );
  });

  it("gives the window's group headings a row of their own", () => {
    const group = cssRule(".ca-hrollup-group");
    expect(group).toContain("display: flex");
    expect(group).toContain("align-items: center");
    // `.ca-tags-heading` is a block with its own bottom margin everywhere else
    // in this family, and inside a flex row that margin takes the tick off the
    // text's baseline.
    expect(cssRule(".ca-hrollup-group .ca-tags-heading")).toContain(
      "margin-bottom: 0"
    );
    // Air between groups and not above the first one, without a
    // `:first-child` exception.
    expect(cssRule(".ca-tags-list + .ca-hrollup-group")).toContain(
      "margin-top"
    );
    expect(cssRules(".ca-hrollup-tick.is-mixed")).toHaveLength(1);
    expect(cssRule(".ca-hrollup-grain")).toContain("max-width");
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
    // TWO TRACKS AND NOT THREE (1.0.64): with the sub hidden a third track
    // would hold the leftover and the name would stop at its longest sibling
    // with a void after it.
    expect(
      cssRules(".ca-hrollup-list").some((r) =>
        r.includes("grid-template-columns: auto minmax(0, 1fr);")
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
