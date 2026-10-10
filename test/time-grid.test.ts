// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The week against the hours — the arithmetic. 4.55.
//
// WHAT THESE ASSERT, and why the list is short. `time-grid.ts` is the half of
// the feature with numbers in it, and there are exactly four numbers that can
// be wrong in a way a reader would see:
//
//   • THE WINDOW. Drawn too wide, every block is a sliver; drawn too narrow, a
//     block is missing and nothing says so. It also has to be stable — the same
//     week must produce the same rail twice, or a repaint jumps.
//   • THE PLACEMENT. `top` and `height` are fractions of that window, so an
//     off-by-one in the span is a block drawn at the wrong hour, which is worse
//     than a block not drawn at all: it is legible and false.
//   • THE PACKING. The only real algorithm here. Two things at the same time
//     must sit side by side, and a cluster must share one width.
//   • THE ARGUMENT. An unknown source word has to come back as unknown, because
//     the alternative is a grid quietly missing a third of itself.
//
// The widened grammars are tested where they live — `mins` in
// `log-items.test.ts`, `at` in `pure-logic.test.ts`, `duration` in
// `events.test.ts` — because each of them is that file's format, not this
// file's.

import { describe, expect, it } from "vitest";
import { readCode, readCss, readSrc, styleSheets } from "./sources";
import {
  DEFAULT_SOURCES,
  EMPTY_WINDOW,
  GRID_SOURCES,
  MIN_WINDOW_HOURS,
  MOMENT_MINUTES,
  type GridItem,
  describeWhen,
  dayIndex,
  COMPACT_MIN_MINUTES,
  COMPACT_RAIL_STEP,
  FULL_DAY_WINDOW,
  boxDay,
  laneRowCount,
  laneRuns,
  packBoxes,
  packLaneRuns,
  placeSpan,
  tallyAllDay,
  type AllDayItem,
  type LaneRun,
  railHours,
  shortHourLabel,
  SNAP_MINUTES,
  formatClock,
  gridWindow,
  itemEnd,
  minuteAt,
  movedTo,
  nowOffset,
  packDay,
  parseClock,
  parseDays,
  parseSources,
  placeInWindow,
  resizedTo,
  resolveOffSources,
  spanFromDrag,
  timeGridFilterKey,
  visibleDays,
  weekDates,
} from "../src/diary/time-grid";

// A block, named by when it is, because that is all these tests read off one.
function at(start: number, mins: number | null = null, key = "k"): GridItem {
  return {
    source: "events",
    color: "blue",
    title: "thing",
    day: 0,
    start,
    mins,
    key,
  };
}

const hm = (h: number, m = 0): number => h * 60 + m;

describe("the clock", () => {
  it("reads a padded hour and a hand-typed one alike", () => {
    // `STAMP_RE` has taken `9:05` since 4.28 and `AT_RE` takes it too. A grid
    // that dropped the item would be the one surface in the plugin that
    // disagrees with the file about what a time is.
    expect(parseClock("09:05")).toBe(545);
    expect(parseClock("9:05")).toBe(545);
    expect(parseClock(" 14:32 ")).toBe(872);
  });

  it("is null for anything that is not a time", () => {
    expect(parseClock(null)).toBeNull();
    expect(parseClock("")).toBeNull();
    expect(parseClock("noon")).toBeNull();
    expect(parseClock("24:00")).toBeNull();
    expect(parseClock("12:60")).toBeNull();
    expect(parseClock("2026-08-21")).toBeNull();
  });

  it("wraps past midnight rather than printing an hour that does not exist", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(hm(14, 32))).toBe("14:32");
    expect(formatClock(hm(25, 30))).toBe("01:30");
  });
});

describe("a moment is not a span", () => {
  it("gives a moment room without giving it a length", () => {
    const moment = at(hm(14, 32));
    expect(moment.mins).toBeNull();
    expect(itemEnd(moment)).toBe(hm(14, 32) + MOMENT_MINUTES);
  });

  it("says the minute for a moment and both ends for a span", () => {
    expect(describeWhen(at(hm(14, 32)))).toBe("14:32");
    expect(describeWhen(at(hm(9), 90))).toBe("09:00–10:30");
  });
});

describe("the window the grid draws", () => {
  it("opens on a working day when the week is empty", () => {
    expect(gridWindow([])).toEqual(EMPTY_WINDOW);
    expect(EMPTY_WINDOW.endHour - EMPTY_WINDOW.startHour).toBeGreaterThanOrEqual(
      MIN_WINDOW_HOURS
    );
  });

  it("covers the earliest start and the latest end, padded to whole hours", () => {
    const win = gridWindow([at(hm(7, 20), 30), at(hm(19, 10), 45)]);
    expect(win).toEqual({ startHour: 7, endHour: 20 });
  });

  it("never closes tighter than the floor", () => {
    // One stand-up in a week. Without the floor the rail would hold two labels
    // and the block would be the whole column.
    const win = gridWindow([at(hm(10), 20)]);
    expect(win.endHour - win.startHour).toBe(MIN_WINDOW_HOURS);
  });

  it("pads downward first, so a morning meeting stays near the top", () => {
    const win = gridWindow([at(hm(9), 30)]);
    expect(win.startHour).toBe(9);
    expect(win.endHour).toBe(9 + MIN_WINDOW_HOURS);
  });

  it("walks backwards only when it has run out of day", () => {
    // 21:00 cannot be padded eight hours forward — there are three left.
    const win = gridWindow([at(hm(21), 30)]);
    expect(win.endHour).toBe(24);
    expect(win.startHour).toBe(24 - MIN_WINDOW_HOURS);
  });

  it("clips at midnight rather than growing a second day", () => {
    // The column below the last hour is tomorrow, and tomorrow is a column
    // already on screen.
    const win = gridWindow([at(hm(23), 180)]);
    expect(win.endHour).toBe(24);
  });

  it("holds a moment inside the window it opened", () => {
    const moment = at(hm(23, 55));
    const win = gridWindow([moment]);
    const { top, height } = placeInWindow(moment, win);
    expect(win.endHour).toBe(24);
    expect(top).toBeLessThan(1);
    expect(height).toBeGreaterThan(0);
  });
});

describe("the window makes room for now (4.62)", () => {
  it("draws the same rail as before when nothing asks it not to", () => {
    // THE ARGUMENT IS OPTIONAL AND ABSENT IS THE OLD BEHAVIOUR. Every existing
    // assertion above calls this function with one argument; this pins that
    // that is still the whole contract.
    expect(gridWindow([at(hm(7, 20), 30), at(hm(19, 10), 45)], {})).toEqual({
      startHour: 7,
      endHour: 20,
    });
  });

  it("keeps the working day when an empty week is being looked at inside it", () => {
    // 10:40 is already in 08:00–18:00, so there is nothing to widen. An empty
    // week must not become "the eight hours after now".
    expect(gridWindow([], { contains: hm(10, 40) })).toEqual(EMPTY_WINDOW);
  });

  it("stretches an empty week to reach an evening", () => {
    const win = gridWindow([], { contains: hm(19, 30) });
    expect(win.startHour).toBe(EMPTY_WINDOW.startHour);
    expect(win.endHour).toBe(20);
  });

  it("stretches an empty week backwards to reach an early start", () => {
    const win = gridWindow([], { contains: hm(6, 5) });
    expect(win.startHour).toBe(6);
    expect(win.endHour).toBe(EMPTY_WINDOW.endHour);
  });

  it("widens a week that has content, rather than moving it", () => {
    // The 09:00 meeting stays where it was; the window grows down to 21:00.
    const win = gridWindow([at(hm(9), 60)], { contains: hm(20, 15) });
    expect(win.startHour).toBe(9);
    expect(win.endHour).toBe(21);
  });

  it("obeys the floor after the minute has been folded in", () => {
    // 12:10, one 20-minute item at 12:00: the content spans one hour and the
    // minute adds nothing, so the floor is still what decides the window.
    const win = gridWindow([at(hm(12), 20)], { contains: hm(12, 10) });
    expect(win.endHour - win.startHour).toBe(MIN_WINDOW_HOURS);
    expect(win.startHour).toBe(12);
  });

  it("still clips at midnight with a minute late in the day", () => {
    const win = gridWindow([at(hm(9), 30)], { contains: hm(23, 59) });
    expect(win.endHour).toBe(24);
  });
});

describe("how many days are drawn (4.62)", () => {
  const week = weekDates("2026-08-17"); // Mon 17 – Sun 23

  it("reads the second piece of the argument, and empty is the whole week", () => {
    expect(parseDays("")).toEqual({ days: 7, unknown: null });
    expect(parseDays("3")).toEqual({ days: 3, unknown: null });
    expect(parseDays(" 1 ")).toEqual({ days: 1, unknown: null });
  });

  it("refuses a count it does not draw, rather than picking one", () => {
    // The same manners `parseSources` has about an unknown source: the caller
    // draws the refusal and names what is legal.
    expect(parseDays("5").unknown).toBe("5");
    expect(parseDays("week").unknown).toBe("week");
    expect(parseDays("5").days).toBe(7);
  });

  it("draws the whole week when asked for it", () => {
    expect(visibleDays(week, 7, "2026-08-19")).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("centres a narrow window on today", () => {
    expect(visibleDays(week, 3, "2026-08-19")).toEqual([1, 2, 3]);
    expect(visibleDays(week, 1, "2026-08-19")).toEqual([2]);
  });

  it("clamps at both ends rather than borrowing a day from another week", () => {
    expect(visibleDays(week, 3, "2026-08-17")).toEqual([0, 1, 2]);
    expect(visibleDays(week, 3, "2026-08-23")).toEqual([4, 5, 6]);
  });

  it("opens at the start of a week that is not this one", () => {
    expect(visibleDays(week, 3, "2026-03-04")).toEqual([0, 1, 2]);
  });

});

// `fitDays`, `NARROW_3_PX` and `NARROW_1_PX` were tested here and called by
// nothing in `src/`, and they answered the opposite question to the one a
// narrow pane now asks: they cut a phone down to three days or one, where the
// compact grid draws all seven at a density that fits. Two unreachable answers
// to one question is one more than the file needs, so they are gone.

describe("the now line", () => {
  const win = { startHour: 8, endHour: 18 };

  it("is a fraction of the window, not of the day", () => {
    expect(nowOffset(win, hm(8))).toBe(0);
    expect(nowOffset(win, hm(13))).toBeCloseTo(0.5, 10);
    expect(nowOffset(win, hm(18))).toBe(1);
  });

  it("is nothing at all outside the window", () => {
    // A clamped line would say it is eight o'clock at a quarter past six, and a
    // reader has no reason to doubt a line.
    expect(nowOffset(win, hm(7, 59))).toBeNull();
    expect(nowOffset(win, hm(18, 1))).toBeNull();
    expect(nowOffset(win, 0)).toBeNull();
  });

  it("agrees with placeInWindow about where a minute is", () => {
    // The line and a block starting at the same minute have to land on the same
    // pixel, or the grid contradicts itself.
    const item = at(hm(11, 30), 30);
    expect(nowOffset(win, hm(11, 30))).toBeCloseTo(
      placeInWindow(item, win).top,
      10
    );
  });

  it("has nowhere to be in a window with no span", () => {
    expect(nowOffset({ startHour: 9, endHour: 9 }, hm(9))).toBeNull();
  });
});

describe("where a block sits", () => {
  const win = { startHour: 8, endHour: 18 };

  it("puts the top of the window at 0 and the foot at 1", () => {
    expect(placeInWindow(at(hm(8), 60), win).top).toBe(0);
    const last = placeInWindow(at(hm(17), 60), win);
    expect(last.top + last.height).toBeCloseTo(1, 10);
  });

  it("measures a block as a fraction of the window, not of the day", () => {
    const { top, height } = placeInWindow(at(hm(13), 90), win);
    expect(top).toBeCloseTo(0.5, 10);
    expect(height).toBeCloseTo(90 / 600, 10);
  });

  it("clips a block that starts before the window instead of drawing it over the heads", () => {
    const { top, height } = placeInWindow(at(hm(6), 180), win);
    expect(top).toBe(0);
    expect(height).toBeCloseTo(60 / 600, 10);
  });

  it("clips a block that runs past the foot", () => {
    const { top, height } = placeInWindow(at(hm(17), 240), win);
    expect(top).toBeCloseTo(0.9, 10);
    expect(top + height).toBe(1);
  });

  it("never returns a negative height for something outside the window", () => {
    expect(placeInWindow(at(hm(2), 30), win).height).toBe(0);
    expect(placeInWindow(at(hm(22), 30), win).height).toBe(0);
  });
});

describe("two things at the same time", () => {
  it("leaves a day of separate blocks full width", () => {
    const out = packDay([at(hm(9), 30, "a"), at(hm(11), 30, "b")]);
    expect(out.map((i) => [i.key, i.col, i.cols])).toEqual([
      ["a", 0, 1],
      ["b", 0, 1],
    ]);
  });

  it("puts two overlapping blocks side by side", () => {
    const out = packDay([at(hm(9), 60, "a"), at(hm(9, 30), 60, "b")]);
    expect(out.map((i) => [i.key, i.col, i.cols])).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
    ]);
  });

  it("treats a touching edge as free, not as an overlap", () => {
    // 09:00–10:00 and 10:00–11:00 are consecutive meetings, and a reader who
    // saw them at half width would read that as a clash.
    const out = packDay([at(hm(9), 60, "a"), at(hm(10), 60, "b")]);
    expect(out.every((i) => i.cols === 1)).toBe(true);
  });

  it("gives one width to a whole cluster, even where only the middle overlaps both", () => {
    // The case that looks broken when each item is measured against only what
    // it personally overlaps: three widths in a row, which reads as a meaning.
    const out = packDay([
      at(hm(9), 60, "a"),
      at(hm(9, 30), 120, "long"),
      at(hm(11), 60, "b"),
    ]);
    expect(new Set(out.map((i) => i.cols))).toEqual(new Set([2]));
    expect(out.find((i) => i.key === "long")?.col).toBe(1);
    // `a` freed column 0 at 10:00, so `b` takes it back rather than opening a third.
    expect(out.find((i) => i.key === "b")?.col).toBe(0);
  });

  it("reuses a sub-column once it is free", () => {
    const out = packDay([
      at(hm(9), 30, "a"),
      at(hm(9), 240, "all"),
      at(hm(10), 30, "b"),
    ]);
    expect(out.find((i) => i.key === "a")?.col).toBe(0);
    expect(out.find((i) => i.key === "b")?.col).toBe(0);
    expect(out.every((i) => i.cols === 2)).toBe(true);
  });

  it("packs a moment beside a span that starts in the same minute", () => {
    // The whole point of `MOMENT_MINUTES`: without it the moment has no extent
    // and the span is drawn over the top of it.
    const out = packDay([at(hm(14), null, "note"), at(hm(14), 60, "call")]);
    expect(out.every((i) => i.cols === 2)).toBe(true);
    expect(new Set(out.map((i) => i.col))).toEqual(new Set([0, 1]));
  });

  it("is stable — the same day packs the same way twice", () => {
    const day = [at(hm(9), 60, "a"), at(hm(9), 30, "b"), at(hm(9, 15), 90, "c")];
    const once = packDay(day).map((i) => [i.key, i.col, i.cols]);
    expect(packDay(day.slice().reverse()).map((i) => [i.key, i.col, i.cols])).toEqual(
      once
    );
  });

  it("does not mutate what it was given", () => {
    const day = [at(hm(9), 60, "a"), at(hm(9, 30), 60, "b")];
    packDay(day);
    expect(day.every((i) => !("col" in i))).toBe(true);
  });

  it("returns every item it was given", () => {
    const day = Array.from({ length: 12 }, (_, i) =>
      at(hm(9) + i * 20, 60, `k${i}`)
    );
    expect(packDay(day)).toHaveLength(12);
  });
});

describe("the week", () => {
  it("is seven consecutive dates from its first day", () => {
    expect(weekDates("2026-08-17")).toEqual([
      "2026-08-17",
      "2026-08-18",
      "2026-08-19",
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
    ]);
  });

  it("crosses a month end", () => {
    expect(weekDates("2026-08-30")[2]).toBe("2026-09-01");
  });

  it("places a date in a column, and refuses one outside the week", () => {
    expect(dayIndex("2026-08-17", "2026-08-17")).toBe(0);
    expect(dayIndex("2026-08-17", "2026-08-23")).toBe(6);
    expect(dayIndex("2026-08-17", "2026-08-24")).toBeNull();
    expect(dayIndex("2026-08-17", "2026-08-16")).toBeNull();
  });
});

describe("the directive's argument", () => {
  it("means the three scheduled sources when it is empty", () => {
    // NOT `GRID_SOURCES`, which is every word the argument will TAKE. Captures
    // are nameable and not default: forty fragments a day would bury the three
    // meetings the grid was built to draw, and a directive written before they
    // were drawable must keep meaning what it meant.
    expect(parseSources("")).toEqual({ sources: [...DEFAULT_SOURCES], unknown: [] });
    expect(parseSources("   ")).toEqual({ sources: [...DEFAULT_SOURCES], unknown: [] });
    expect(DEFAULT_SOURCES).not.toContain("captures");
    // Nameable, though — which is the whole of the asymmetry.
    expect(GRID_SOURCES).toContain("captures");
  });

  it("takes captures when they are asked for by name", () => {
    expect(parseSources("captures,events")).toEqual({
      sources: ["captures", "events"],
      unknown: [],
    });
  });

  it("reads a comma-joined list, in the order it was written", () => {
    expect(parseSources("tasks, events")).toEqual({
      sources: ["tasks", "events"],
      unknown: [],
    });
  });

  it("is not case-sensitive and forgives spacing", () => {
    expect(parseSources(" Events ,LOGBOOKS ").sources).toEqual([
      "events",
      "logbooks",
    ]);
  });

  it("names a word it does not know rather than drawing two of three sources", () => {
    expect(parseSources("event,tasks")).toEqual({
      sources: ["tasks"],
      unknown: ["event"],
    });
  });

  it("counts a source named twice once", () => {
    expect(parseSources("events,events").sources).toEqual(["events"]);
  });
});

// ── the grid as somewhere to write (4.62) ────────────────────────────
//
// A drag that reads back as the wrong minute is the one failure in this feature
// a reader cannot catch before it happens: the block lands where the pointer
// was, the file says something else, and the two are only ever compared later.
// So the reading is tested at the edges — the top of the window, the foot of
// it, past the foot of it, and backwards.

describe("a pointer, read as a minute", () => {
  const win = { startHour: 8, endHour: 18 };

  it("reads the top of the window as the hour it starts at", () => {
    expect(minuteAt(win, 0)).toBe(hm(8));
  });

  it("reads the foot of the window as the hour it ends at", () => {
    expect(minuteAt(win, 1)).toBe(hm(18));
  });

  it("snaps to the quarter hour, both ways", () => {
    // 10:53 is not a time anyone meant to write.
    expect(minuteAt(win, (hm(10, 53) - hm(8)) / hm(10))).toBe(hm(11));
    expect(minuteAt(win, (hm(10, 5) - hm(8)) / hm(10))).toBe(hm(10));
    expect(minuteAt(win, (hm(10, 8) - hm(8)) / hm(10))).toBe(hm(10, 15));
  });

  it("gives a drag that left the element the last minute on screen", () => {
    // Not midnight, and not the hour under the pointer: the hours outside the
    // window were not drawn, so they were not aimed at.
    expect(minuteAt(win, 2.4)).toBe(hm(18));
    expect(minuteAt(win, -3)).toBe(hm(8));
  });
});

describe("a drag, read as a block", () => {
  it("reads the same block whichever way it was drawn", () => {
    const down = spanFromDrag(hm(14), hm(15, 30));
    const up = spanFromDrag(hm(15, 30), hm(14));
    expect(down).toEqual({ start: hm(14), mins: 90 });
    expect(up).toEqual(down);
  });

  it("makes a click one slot rather than nothing", () => {
    // And rather than a moment: a moment is something you record about a minute
    // that has been, never something you draw on a Thursday to come.
    expect(spanFromDrag(hm(9), hm(9))).toEqual({ start: hm(9), mins: SNAP_MINUTES });
  });
});

describe("moving a block", () => {
  it("says nothing changed when it landed where it started", () => {
    // The caller writes a file on a non-null answer, and a file rewritten with
    // its own contents still shows up in the vault's history as a change.
    expect(movedTo(at(hm(9), 60), { day: 0, start: hm(9) })).toBe(null);
  });

  it("moves the day and the minute together", () => {
    const moved = movedTo(at(hm(9), 60), { day: 3, start: hm(11, 30) });
    expect(moved?.day).toBe(3);
    expect(moved?.start).toBe(hm(11, 30));
    expect(moved?.mins).toBe(60);
  });

  it("keeps a block inside its own day at the foot", () => {
    // Otherwise a two-hour meeting dragged to 23:30 is written as ending at
    // 01:30 tomorrow — in a column that is already on screen and is not this
    // one.
    const moved = movedTo(at(hm(9), 120), { day: 0, start: hm(23, 30) });
    expect(moved?.start).toBe(hm(22));
  });

  it("keeps a moment inside the day too, with nothing to reserve for it", () => {
    // `MOMENT_MINUTES` is room on the grid, not length in the file, so it must
    // not push the last legal minute of the day back off midnight.
    const moved = movedTo(at(hm(9), null), { day: 0, start: hm(23, 45) });
    expect(moved?.start).toBe(hm(23, 45));
    expect(moved?.mins).toBe(null);
  });
});

describe("resizing a block", () => {
  it("takes the new end and keeps the start", () => {
    const bigger = resizedTo(at(hm(9), 60), hm(10, 30));
    expect(bigger?.start).toBe(hm(9));
    expect(bigger?.mins).toBe(90);
  });

  it("never shrinks past one slot", () => {
    // A drag up past the block's own top would otherwise write a negative
    // duration, and `0` is the moment marker — neither is a length.
    expect(resizedTo(at(hm(9), 60), hm(8))?.mins).toBe(SNAP_MINUTES);
  });

  it("refuses a moment, which has no length to drag", () => {
    expect(resizedTo(at(hm(9), null), hm(11))).toBe(null);
  });

  it("says nothing changed when the length is the length it had", () => {
    expect(resizedTo(at(hm(9), 60), hm(10))).toBe(null);
  });
});

describe("mobile controls and horizontal scrolling", () => {
  it("keeps the rail, corner and lane label sticky on horizontal scroll", () => {
    const css = readCss();
    const cornerIdx = css.indexOf(".ca-tg-corner {");
    expect(cornerIdx).toBeGreaterThan(-1);
    expect(css.slice(cornerIdx, css.indexOf("}", cornerIdx))).toContain("position: sticky;");
    expect(css.slice(cornerIdx, css.indexOf("}", cornerIdx))).toContain("left: 0;");

    const railIdx = css.indexOf(".ca-tg-rail {");
    expect(railIdx).toBeGreaterThan(-1);
    expect(css.slice(railIdx, css.indexOf("}", railIdx))).toContain("position: sticky;");
    expect(css.slice(railIdx, css.indexOf("}", railIdx))).toContain("left: 0;");

    const laneIdx = css.indexOf(".ca-tg-lane-label {");
    expect(laneIdx).toBeGreaterThan(-1);
    expect(css.slice(laneIdx, css.indexOf("}", laneIdx))).toContain("position: sticky;");
    expect(css.slice(laneIdx, css.indexOf("}", laneIdx))).toContain("left: 0;");
  });

  it("handles touch long-press and slop before dragging on mobile", () => {
    const src = readSrc("time-grid-view");
    expect(src).toContain("TOUCH_LONG_PRESS_MS");
    expect(src).toContain("TOUCH_SLOP_PX");
    expect(src).toContain("evt.pointerType === \"touch\"");
  });
});

// ── the compact week (1.0.18, and every width in 1.0.26) ─────────────
//
// IT WAS A BREAKPOINT AND IT IS A MODE. Until 1.0.26 these were two halves of
// one assertion: the container query had to raise `--ca-tg-compact`, and
// `time-grid-view` had to ask for it rather than measure a width of its own,
// because a grid drawn at fifteen pixels an hour and wired for dragging is the
// failure both halves existed to prevent.
//
// THE READER TOOK THE WIDTH OUT OF IT: *"Time-grid should have a smaller mode
// on big displays just the same as on mobile, with a toggle to go in and make
// edits and create events."* Compact is the resting shape at every width, the
// stored flag is the whole answer, and the stylesheet keys off
// `.ca-tg:not(.is-expanded)`. The hazard is unchanged and the guard is the same
// `compact` flag — it is simply decided one step earlier, by the reader.

describe("the rail, when there is no room for it", () => {
  it("marks every hour and both ends of the window at step 1", () => {
    expect(railHours({ startHour: 8, endHour: 12 }, 1)).toEqual([8, 9, 10, 11, 12]);
    // Twenty-four hours is twenty-five marks: `endHour` is an instant, and the
    // grid ends at it.
    expect(railHours(FULL_DAY_WINDOW, 1)).toHaveLength(25);
  });

  it("steps by three when compact, and never past the foot", () => {
    // Nine marks, because midnight lands on the step at both ends of the day
    // and the foot of the window is a real hour.
    expect(railHours(FULL_DAY_WINDOW, COMPACT_RAIL_STEP)).toEqual([
      0, 3, 6, 9, 12, 15, 18, 21, 24,
    ]);
    // 8 to 18 is ten hours: the mark that would land at 20 is dropped, not
    // pulled back to 18 — two labels three hours apart in words and one hour
    // apart in pixels is a rail that has stopped meaning anything.
    expect(railHours({ startHour: 8, endHour: 18 }, 3)).toEqual([8, 11, 14, 17]);
  });

  it("keeps the foot when the step lands on it", () => {
    expect(railHours({ startHour: 6, endHour: 18 }, 3)).toEqual([6, 9, 12, 15, 18]);
  });

  it("refuses a step that would draw every mark twice", () => {
    expect(railHours({ startHour: 8, endHour: 10 }, 0)).toEqual([8, 9, 10]);
  });

  it("says the hour in the least room a label can take", () => {
    expect(shortHourLabel(0)).toBe("12a");
    expect(shortHourLabel(3)).toBe("3a");
    expect(shortHourLabel(11)).toBe("11a");
    expect(shortHourLabel(12)).toBe("12p");
    expect(shortHourLabel(21)).toBe("9p");
    // The meridiem is what shrinks, never the hour: without it 3 and 15 would
    // be the same label.
    expect(shortHourLabel(3)).not.toBe(shortHourLabel(15));
  });

  it("wraps a window that runs to the end of the day", () => {
    expect(shortHourLabel(24)).toBe("12a");
  });
});

// The tail of the stylesheet: every rule that applies to a grid nobody has
// opened for editing, from the first of them to the end of the file.
function compactRules(): string {
  // ── THE ANCHOR MOVED WITH THE MECHANISM (1.0.26) ───────────────────────
  //
  // This took `indexOf("@container (max-width: 400px)")`, which held for
  // exactly as long as the time grid was the only widget with a compact form.
  // 1.0.21 gave the events deck one at the same breakpoint, in a stylesheet
  // that sorts BEFORE this one — so the slice started there and ran to the end
  // of the file, which still contained every assertion below and also contained
  // `.ca-tg-corner`'s BASE rule. `indexOf` found that one, and a test about
  // what the corner does when compact started reading what it does at every
  // width. It failed on `overflow: hidden`, which is the honest outcome: the
  // assertion had stopped being about the compact block.
  //
  // It was then anchored on `--ca-tg-compact: 1`, the flag the view read back,
  // and that property is retired. TWO THINGS CHANGED HERE RATHER THAN ONE. The
  // anchor is the selector that IS the mode — no other widget can spell it — and
  // the haystack is THIS STYLESHEET rather than the concatenation, which is what
  // `styleSheets()` exists for. `readCss` joins every source with its prose
  // intact, so a retirement note in `00-tokens.css` naming the selector it
  // replaced was enough to move the slice to the top of the sheet: the same
  // failure the 1.0.21 note above describes, arriving from the one direction a
  // better anchor could not help with.
  const sheet = styleSheets().find((s) => s.name === "99-time-grid.css");
  expect(sheet).toBeDefined();
  const css = sheet?.css ?? "";
  const open = css.indexOf(".ca-tg:not(.is-expanded)");
  expect(open).toBeGreaterThan(-1);
  return css.slice(open);
}

describe("the compact week", () => {
  const compactBlock = compactRules;

  it("is a mode the reader holds, not a width the stylesheet measures", () => {
    const css = readCss();
    // THE RETIRED CHANNEL, ASSERTED GONE FROM BOTH ENDS. A property still
    // declared in `00-tokens.css` and read by nothing is the shape this widget
    // already carries two of (`gridWindow`, `MIN_WINDOW_HOURS`); one still READ
    // by the view after the stylesheet stopped raising it would be worse — a
    // grid permanently editable, handles and all, at 360px.
    // THE READ AND THE DECLARATION, not the word: the property is named in two
    // obituaries, which is the house's way of keeping a retirement findable.
    // What must not exist is anything that still USES it.
    expect(css).not.toContain("--ca-tg-compact:");
    expect(readSrc("time-grid-view")).not.toContain("readCompact()");
    expect(readSrc("time-grid-view")).not.toContain(
      'getPropertyValue("--ca-tg-compact")'
    );
    // And the mode is one class, spelled the one way.
    expect(compactBlock()).toContain(".ca-tg:not(.is-expanded) {");
  });

  it("leaves the narrow query only what is genuinely about width", () => {
    // The bar wrapping onto two rows is about a phone and always was — it is
    // the one rule this block never undid when the grid was expanded, which is
    // the sentence that decided what stayed behind.
    const block = compactBlock();
    const query = block.slice(block.indexOf("@container (max-width: 400px)"));
    expect(query).toContain(".ca-tg-bar");
    expect(query).toContain("flex-wrap: wrap");
    // A WIDTH NO LONGER DECIDES THE MODE. It still decides what fits, which is
    // what an ordinary responsive rule is for — see the name reveal below. What
    // must not come back is the grid's own SHAPE being read off the box.
    expect(query).not.toContain("--ca-tg-row");
    expect(query).not.toContain(".ca-tg-blk {");
    expect(query).not.toContain(".ca-tg-scroll");
  });

  it("fits the whole day and the whole week with nothing scrolling", () => {
    const block = compactBlock();
    // 24px SINCE 1.0.27, WHICH IS THE SECTION'S OWN FIFTY PIXELS: the reader
    // called both modes *"somewhat too cramped"*, and with nothing scrolling
    // here the day's height IS the section's — 24 hours at 24px is 576 against
    // 528. The expanded half takes the same fifty on the scroller's cap.
    expect(block).toContain("--ca-tg-row: 24px");
    expect(readCss()).toContain("max-height: min(70vh, 670px)");
    // Thirty rather than twenty-four: the corner's "W38" and the rail's "12a"
    // are a flex cell with no overflow and an absolutely positioned label, so
    // at 24px neither clipped — both drew past the left edge of the grid.
    expect(block).toContain("--ca-tg-gutter: 30px");
    // The 74px column floor is what made a phone scroll sideways.
    expect(block).toContain("minmax(0, 1fr)");
    expect(block).toContain("min-width: 0");
    expect(block).toContain("overflow: visible");
    expect(block).toContain("max-height: none");
  });

  it("draws a box rather than a block, and no handle on it", () => {
    const block = compactBlock();
    // Sixteen pixels is what a digit needs. The arithmetic reaches it first —
    // forty-five minutes, 18px at the 24px row — and this is the floor under
    // that. The two numbers moved apart in the direction that agrees more.
    expect(block).toContain("min-height: 16px");
    expect(block).toContain(".ca-tg-grip");
    expect(block).toContain("cursor: default");
  });

  it("names a box of one where a column is wide enough to hold a name", () => {
    // THE REPORT: *"The cards are missing text in read mode."* And the report
    // it has to be answered WITHOUT reopening is 1.0.19's, from the other
    // width: *"entries are too small"*, which is why the text came out in the
    // first place. Seven columns divide 360px into 45 each.
    const block = compactBlock();
    // Hidden by default, revealed by a width — and it is the stylesheet that
    // holds the width, not a second measurement in the view.
    const hide = block.indexOf(".ca-tg:not(.is-expanded) .ca-tg-blk-title,");
    expect(hide).toBeGreaterThan(-1);
    expect(block.slice(hide, block.indexOf("}", hide))).toContain("display: none");
    const reveal = block.indexOf("@container (min-width: 560px)");
    expect(reveal).toBeGreaterThan(hide);
    const shown = block.slice(reveal, block.indexOf("\n}", reveal));
    expect(shown).toContain(".ca-tg-blk-title");
    expect(shown).toContain(".ca-tg-chip-title");
    expect(shown).toContain("text-overflow: ellipsis");

    // And the view draws the span for a box of ONE only — a box groups by
    // colour, so naming it after the earliest of four names it after the wrong
    // thing three times in four.
    const src = readSrc("time-grid-view");
    const at = src.indexOf("  if (alone) {");
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, src.indexOf("}", at));
    expect(body).toContain('cls: "ca-tg-blk-title", text: lead.title');
    expect(src).toContain('cls: "ca-tg-chip-title", text: only.title');
    // The count is still the whole of what a box of several says.
    expect(src).toContain('el.createSpan({ cls: "ca-tg-count", text: String(box.items.length) });');
  });

  it("takes the words off the all-day gutter and keeps the row's name", () => {
    // *"'all day' text can be removed, as the row's colour is enough context
    // for what it is."* Enough context for a reader looking at it, and none at
    // all for one who cannot see it — so the words go to the two places that
    // cost no pixels rather than nowhere.
    const src = readSrc("time-grid-view");
    expect(src).not.toContain('cls: "ca-tg-lane-label", text: "all day"');
    expect(src).toContain('attr: { title: "All day", "aria-label": "All day" }');
    // The cell itself stays: it is the lane's first COLUMN as well as its
    // label, and a lane without it slides every day one column left.
    expect(src).toContain('cls: "ca-tg-lane-label"');
    // What it keeps in the stylesheet is the half that was never about words.
    const css = readCss();
    const at = css.indexOf(".ca-tg-lane-label {");
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toContain("position: sticky");
    expect(rule).toContain("var(--ca-tg-lane-bg)");
    expect(rule).not.toContain("text-overflow");
    expect(rule).not.toContain("letter-spacing");
    // And the compact override that gave two words a second line is gone with
    // the words. Matched as the SELECTOR — the obituary left behind names the
    // rule, which is what an obituary is for.
    expect(compactBlock()).not.toContain(
      ".ca-tg:not(.is-expanded) .ca-tg-lane-label"
    );
  });

  it("gives the week a row and the controls a row", () => {
    const block = compactBlock();
    // The bar is one flex row at every width; below the breakpoint it wraps,
    // and the span takes a whole row so the wrap lands between them rather
    // than inside the date.
    expect(block).toContain("flex-wrap: wrap");
    expect(block).toContain("flex: 1 0 100%");
    // And this one is NOT undone when the grid is expanded: expanding gives
    // the hours back, it does not widen the phone.
    expect(block).not.toContain(".ca-tg.is-expanded .ca-tg-bar");
  });

  it("keeps the gutter's three labels inside the gutter", () => {
    const block = compactBlock();
    const corner = block.indexOf(".ca-tg-corner {");
    expect(corner).toBeGreaterThan(-1);
    expect(block.slice(corner, block.indexOf("}", corner))).toContain(
      "overflow: hidden"
    );
    // The hour marks are positioned against the corner's own right edge.
    const hour = block.indexOf(".ca-tg-hour {");
    expect(hour).toBeGreaterThan(-1);
    expect(block.slice(hour, block.indexOf("}", hour))).toContain("right: 3px");
  });

  it("draws the way out at every width, because there is always something to leave", () => {
    const css = readCss();
    const at = css.indexOf(".ca-tg-expand {");
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, css.indexOf("}", at))).toContain("display: inline-flex");
    // And it is the LAST thing in the bar on a wrapped one, which is the only
    // rule about it a width still decides.
    const block = compactBlock();
    const query = block.slice(block.indexOf("@container (max-width: 400px)"));
    expect(query).toContain(".ca-tg-expand");
    expect(query).toContain("margin-left: auto");
  });

  it("needs no second copy of every rule to put the desk grid back", () => {
    // THIS IS WHAT THE REVERSAL BOUGHT. Every compact rule used to be undone by
    // a `.ca-tg.is-expanded` twin nested in the same query — two declarations
    // per property, in two places, kept in step by hand. The base rules ARE the
    // expanded grid now, so the twins are gone and the numbers live once.
    const css = readCss();
    expect(css).not.toContain(".ca-tg.is-expanded .ca-tg-blk");
    expect(css).not.toContain(".ca-tg.is-expanded .ca-tg-scroll");
    expect(css).toContain("--ca-tg-row: 50px");
    expect(css).toContain("minmax(74px, 1fr)");
    expect(css).toContain("cursor: crosshair");
  });

  it("holds the mode itself rather than measuring the box it is in", () => {
    const src = readSrc("time-grid-view");
    // ONE FLAG, AND THE SAME ONE THAT SETS THE ROW HEIGHT. A drag handle wired
    // against a row height decided somewhere else is the failure the old
    // `getComputedStyle` round trip existed to prevent; a flag that decides both
    // cannot have the disagreement at all.
    expect(src).toContain("let compact = !expanded;");
    expect(src).toContain("compact = !expanded;");
    expect(src).not.toContain("getComputedStyle");
    expect(src).not.toContain("new ResizeObserver");
    // The render child the observer lived in is retired; the one beside it,
    // which owns a timer for the same reason, is not.
    expect(src).not.toContain("new CompactWatcher(");
    expect(src).toContain("class NowTicker extends MarkdownRenderChild");
  });

  it("says what the toggle is for, which is editing", () => {
    const src = readSrc("time-grid-view");
    expect(src).toContain("Edit the week");
    expect(src).toContain("back to the compact week");
    expect(src).toContain('setIcon(btn, expanded ? "minimize-2" : "pencil");');
  });

  it("wires no gesture on a grid with no room for one", () => {
    const src = readSrc("time-grid-view");
    expect(src).toContain("if (!opts.compact) {");
    // The press that opens is not a gesture about a minute, so it stays.
    expect(src).toContain("wire(plugin, block, placed.key)");
  });

  it("draws its columns and its lane in boxes, from the arithmetic", () => {
    const src = readSrc("time-grid-view");
    expect(src).toContain("packBoxes(boxDay(mine, COMPACT_MIN_MINUTES))");
    expect(src).toContain("drawBox(plugin, col, box, win)");
    expect(src).toContain("tallyAllDay(mine)");
    expect(src).toContain('cls: "ca-tg-count"');
  });

  it("offers the list rather than opening one of several", () => {
    const src = readSrc("time-grid-view");
    const at = src.indexOf("function wireStack(");
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, at + 1400);
    expect(body).toContain("new Menu()");
    expect(body).toContain("openTimeGridItem(plugin, entry.key)");
    // And from a keyboard, where there is no pointer to hang a menu on.
    expect(body).toContain("menu.showAtPosition(");
    expect(body).toContain('evt.key !== "Enter"');
  });

  it("keeps the thing that opens reachable from a keyboard", () => {
    const src = readSrc("time-grid-view");
    const at = src.indexOf("function wire(");
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, at + 2000);
    expect(body).toContain('el.setAttribute("tabindex", "0")');
    expect(body).toContain('evt.key !== "Enter"');
  });

  it("remembers an expanded grid under the key the chips already use", () => {
    const src = readSrc("time-grid-view");
    expect(src).toContain("loadTimeGridExpanded");
    expect(src).toContain("saveTimeGridExpanded");
    expect(src).toContain("plugin.settings.timeGridExpanded");
    expect(src).toContain("timeGridFilterKey(ctx.sourcePath, rest)");
  });
});

// ── boxes, and the counts in them (1.0.18) ───────────────────────────
//
// THE SECOND HALF OF THE COMPACT GRID, and the half a reader complained about.
// 1.0.18 fit the whole week on a phone and then drew a half-hour meeting as a
// hairline; these are the numbers that stop that happening. A box is at least
// `COMPACT_MIN_MINUTES` tall, and what would land on top of one of its own
// colour goes inside it with a count.

// ── the grid's surfaces (1.0.19) ─────────────────────────────────────
//
// THE TINTS ARE TOKENS AND THE TOKENS ARE ON `body`, which is the whole of
// what a stylesheet test can check about a colour — and it is the half that
// has gone wrong before: a theme colour aliased on `:root` resolves against
// an element that has never had a theme, and every rule reading it draws
// `currentColor`. `tokens.test.ts` owns that rule; this owns the reads.

describe("the lane and today are the theme's own colour", () => {
  it("tints the lane rather than leaving it a shade off the grid", () => {
    const css = readCss();
    const at = css.indexOf(".ca-tg-lane {");
    expect(at).toBeGreaterThan(-1);
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toContain("var(--ca-tg-lane-bg)");
    expect(rule).toContain("var(--ca-tg-lane-edge)");
    // The label is sticky over the lane and paints its own ground, so it has
    // to be the same one or it draws a notch in the tint.
    const label = css.indexOf(".ca-tg-lane-label {");
    expect(css.slice(label, css.indexOf("}", label))).toContain(
      "var(--ca-tg-lane-bg)"
    );
  });

  it("stops drawing today as a column somebody is hovering", () => {
    const css = readCss();
    const at = css.indexOf(".ca-tg-col.is-today {");
    expect(at).toBeGreaterThan(-1);
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toContain("var(--ca-tg-today-bg)");
    expect(rule).not.toContain("--background-modifier-hover");
  });

  it("gives every compact rail label a line to point at", () => {
    // Three hours of rows is 300% of one, and a compact window always starts
    // at midnight — which is what keeps the darker line under the label.
    expect(compactRules()).toContain("calc(300% / var(--ca-tg-hours))");
    expect(compactRules()).toContain("var(--ca-tg-line-major)");
  });
});

describe("boxes on a compact week", () => {
  // A block of a named colour, because colour is what these group by.
  const tinted = (
    start: number,
    mins: number | null,
    color: string,
    key: string
  ): GridItem => ({ ...at(start, mins, key), color, title: key });

  it("grows a thing too short to see to the least a box can be", () => {
    const [box] = boxDay([tinted(540, 20, "blue", "a")], COMPACT_MIN_MINUTES);
    expect(box.start).toBe(540);
    expect(box.end).toBe(540 + COMPACT_MIN_MINUTES);
    expect(box.items.map((i) => i.key)).toEqual(["a"]);
  });

  it("leaves a thing long enough to see its own length", () => {
    const [box] = boxDay([tinted(540, 120, "blue", "a")], COMPACT_MIN_MINUTES);
    expect(box.end).toBe(660);
  });

  it("gives a moment room to be seen without claiming it took time", () => {
    // The item's own `mins` is untouched — the view reads it back to decide
    // whether to draw the flat foot.
    const [box] = boxDay([tinted(872, null, "teal", "m")], COMPACT_MIN_MINUTES);
    expect(box.end - box.start).toBe(COMPACT_MIN_MINUTES);
    expect(box.items[0].mins).toBeNull();
  });

  it("counts what it cannot draw apart", () => {
    const boxes = boxDay(
      [tinted(540, 30, "blue", "a"), tinted(560, 30, "blue", "b")],
      COMPACT_MIN_MINUTES
    );
    expect(boxes).toHaveLength(1);
    expect(boxes[0].items.map((i) => i.key)).toEqual(["a", "b"]);
    // The foot is the last thing in it, floored like any other: 09:20 + 45.
    expect(boxes[0].end).toBe(605);
  });

  it("merges on the drawn box and not on the minutes", () => {
    // 09:00–09:20 and 09:30–09:50 do not overlap in minutes, and at 22px an
    // hour they overlap on screen — because the first is forty-five minutes
    // tall the moment it is drawn. Comparing the items would draw the second
    // one on top of the first and call it two bars.
    const boxes = boxDay(
      [tinted(540, 20, "blue", "a"), tinted(570, 20, "blue", "b")],
      COMPACT_MIN_MINUTES
    );
    expect(boxes).toHaveLength(1);
    expect(boxes[0].items).toHaveLength(2);
  });

  it("keeps a morning and an evening apart", () => {
    const boxes = boxDay(
      [tinted(540, 30, "blue", "am"), tinted(1080, 30, "blue", "pm")],
      COMPACT_MIN_MINUTES
    );
    expect(boxes.map((b) => b.items.length)).toEqual([1, 1]);
  });

  it("never merges two colours, however close they sit", () => {
    const boxes = boxDay(
      [tinted(540, 30, "blue", "meeting"), tinted(545, 30, "red", "task")],
      COMPACT_MIN_MINUTES
    );
    expect(boxes).toHaveLength(2);
    expect(boxes.map((b) => b.color)).toEqual(["blue", "red"]);
  });

  it("draws in reading order whatever order it was handed", () => {
    const boxes = boxDay(
      [tinted(1080, 30, "blue", "late"), tinted(540, 30, "red", "early")],
      COMPACT_MIN_MINUTES
    );
    expect(boxes.map((b) => b.items[0].key)).toEqual(["early", "late"]);
  });

  it("is nothing at all on a day with nothing on it", () => {
    expect(boxDay([], COMPACT_MIN_MINUTES)).toEqual([]);
  });

  it("sets two colours side by side when they share an hour", () => {
    const packed = packBoxes(
      boxDay(
        [tinted(540, 60, "blue", "a"), tinted(560, 60, "red", "b")],
        COMPACT_MIN_MINUTES
      )
    );
    expect(packed.map((b) => b.cols)).toEqual([2, 2]);
    expect(packed.map((b) => b.col).sort()).toEqual([0, 1]);
  });

  it("gives one colour's box the whole column", () => {
    const packed = packBoxes(
      boxDay(
        [tinted(540, 60, "blue", "a"), tinted(560, 60, "blue", "b")],
        COMPACT_MIN_MINUTES
      )
    );
    expect(packed).toHaveLength(1);
    expect(packed[0].cols).toBe(1);
    expect(packed[0].items).toHaveLength(2);
  });

  it("places a box by its own foot", () => {
    // Which is not its first item's: `placeInWindow` would put a 09:00 box
    // twenty minutes tall whatever else was inside it.
    expect(placeSpan(0, 720, FULL_DAY_WINDOW)).toEqual({ top: 0, height: 0.5 });
    const [box] = boxDay([tinted(540, 20, "blue", "a")], COMPACT_MIN_MINUTES);
    const { height } = placeSpan(box.start, box.end, FULL_DAY_WINDOW);
    expect(height).toBeCloseTo(COMPACT_MIN_MINUTES / 1440, 6);
  });
});

describe("the all-day lane, counted", () => {
  const due = (color: string, key: string): AllDayItem => ({
    source: "tasks",
    color,
    title: key,
    day: 2,
    key,
    // A task's identity is its own and its day's — it can never span, and
    // `laneRuns` is what would group two of them if it could.
    ident: `${key}:2`,
    pos: "solo",
  });

  it("is one chip per colour, holding everything of it", () => {
    const tallies = tallyAllDay([due("red", "a"), due("red", "b"), due("blue", "c")]);
    expect(tallies.map((t) => t.color)).toEqual(["red", "blue"]);
    expect(tallies[0].items.map((i) => i.key)).toEqual(["a", "b"]);
    expect(tallies[1].items).toHaveLength(1);
  });

  it("keeps the order the lane already drew them in", () => {
    const tallies = tallyAllDay([due("blue", "c"), due("red", "a")]);
    expect(tallies.map((t) => t.color)).toEqual(["blue", "red"]);
  });

  it("is nothing at all on a day with nothing due", () => {
    expect(tallyAllDay([])).toEqual([]);
  });
});

// ── 1.0.49: a trip is one chip across its own columns ───────────────────
//
// THE REPORT: *"time calendar not showing any text on mobile view (possibly to
// narrow?)"* It IS too narrow, and `99-time-grid.css` holds the measurement
// that says so — a name is hidden below 560px because seven columns divide
// 360px into 45 each, which was 1.0.19's answer to the opposite report.
//
// THE ANSWER IS A WIDER BOX, NOT A SMALLER BREAKPOINT. A four-day trip already
// owns four of those columns; it was simply being drawn as four stubs. One chip
// across them has 180px, on the same phone, at the same font size, with
// 1.0.19's finding intact for a box of one day.

describe("the all-day lane, as spans", () => {
  const week = [0, 1, 2, 3, 4, 5, 6];
  // One day of a multi-day event. `pos` is the TRUE span's, straight off
  // `EventOccurrence` — which is the whole reason a chip can know that the
  // trip began before the week it is drawn in.
  const trip = (
    id: string,
    day: number,
    pos: AllDayItem["pos"],
    color = "blue"
  ): AllDayItem => ({
    source: "events",
    color,
    title: id,
    day,
    key: `event:${id}:day${day}`,
    ident: `event:${id}`,
    pos,
  });
  const task = (day: number, text: string): AllDayItem => ({
    source: "tasks",
    color: "red",
    title: text,
    day,
    key: `task:n.md:${text}`,
    ident: `task:n.md:${text}:${day}`,
    pos: "solo",
  });

  it("welds the days of one trip into a single run", () => {
    const runs = laneRuns(
      [trip("t", 1, "start"), trip("t", 2, "mid"), trip("t", 3, "end")],
      week
    );
    expect(runs).toHaveLength(1);
    expect(runs[0].col).toBe(1);
    expect(runs[0].span).toBe(3);
    expect(runs[0].members).toHaveLength(3);
    // ONE MEMBER SPEAKS FOR THE RUN, and it is the first drawn day: that is
    // whose key the chip's press follows.
    expect(runs[0].item.key).toBe("event:t:day1");
    // A trip whose both ends are on screen is capped at neither.
    expect(runs[0].clipLeft).toBe(false);
    expect(runs[0].clipRight).toBe(false);
  });

  it("caps the end that runs out of the week, not out of the window", () => {
    // A trip that began last month: `pos` on its first DRAWN day is "mid", so
    // the chip is capped square at the left even though the lane has no item
    // to the left of it to notice. The items alone could not answer this —
    // which is why `pos` is on the model rather than inferred from adjacency.
    const [run] = laneRuns([trip("t", 0, "mid"), trip("t", 1, "end")], week);
    expect(run.clipLeft).toBe(true);
    expect(run.clipRight).toBe(false);
    const [other] = laneRuns([trip("u", 5, "start"), trip("u", 6, "mid")], week);
    expect(other.clipLeft).toBe(false);
    expect(other.clipRight).toBe(true);
    // AND THE DAY A TRIP ENDS IS THE ONLY DAY OF IT ON SCREEN. Both ends of
    // the predicate have to be read as "this is not where the thing begins /
    // ends" rather than as a list of the two middles, or a trip reaching into
    // this week from the last one is drawn with a rounded start it never had.
    const [tail] = laneRuns([trip("v", 0, "end")], week);
    expect(tail.clipLeft).toBe(true);
    expect(tail.clipRight).toBe(false);
    const [head] = laneRuns([trip("w", 6, "start")], week);
    expect(head.clipLeft).toBe(false);
    expect(head.clipRight).toBe(true);
  });

  it("never caps a thing that is the whole of itself", () => {
    // "solo" is a task, a birthday, a one-day event. It is not a middle and it
    // is not an end, so a predicate written as "not the start" alone would cap
    // every chip in the lane and claim each one continued into a week nobody
    // can look at.
    const [chore] = laneRuns([task(2, "water")], week);
    expect([chore.clipLeft, chore.clipRight]).toEqual([false, false]);
    const [party] = laneRuns([trip("b", 4, "solo")], week);
    expect([party.clipLeft, party.clipRight]).toEqual([false, false]);
  });

  it("clips a narrowed window to the columns actually drawn", () => {
    // A 3-day view of a 5-day trip. The run is the three drawn days and both
    // ends are caps, which falls out of `pos` without the function being told
    // the window was narrowed.
    const items = [
      trip("t", 1, "start"),
      trip("t", 2, "mid"),
      trip("t", 3, "mid"),
      trip("t", 4, "mid"),
      trip("t", 5, "end"),
    ];
    const [run] = laneRuns(items, [2, 3, 4]);
    expect(run.col).toBe(0);
    expect(run.span).toBe(3);
    expect(run.clipLeft).toBe(true);
    expect(run.clipRight).toBe(true);
  });

  it("splits one ident into two runs across a gap", () => {
    // NOT A SHAPE A SPAN CAN HAVE, which is exactly why it is asserted: the
    // alternative is one chip drawn across a day the thing is not on.
    const runs = laneRuns([trip("t", 1, "mid"), trip("t", 4, "mid")], week);
    expect(runs.map((r) => [r.col, r.span])).toEqual([
      [1, 1],
      [4, 1],
    ]);
  });

  it("asks the day whether two cells are adjacent, not the column", () => {
    // THE AGREEMENT THAT WOULD STOP BEING TRUE QUIETLY. `visibleDays` returns
    // a contiguous window, so for every grid the plugin can draw today the two
    // questions have the same answer. On a window of Monday, Wednesday and
    // Friday they do not: Monday's chip is drawn NEXT TO Wednesday's, and a
    // run welded on column adjacency would be a trip drawn across a Tuesday it
    // does not cover.
    const runs = laneRuns([trip("t", 0, "start"), trip("t", 2, "end")], [0, 2, 4]);
    expect(runs.map((r) => [r.col, r.span])).toEqual([
      [0, 1],
      [1, 1],
    ]);
  });

  it("never groups two things that merely share a day", () => {
    const runs = laneRuns([task(2, "water"), trip("t", 2, "solo")], week);
    expect(runs).toHaveLength(2);
    expect(runs.every((r) => r.span === 1)).toBe(true);
    // And two identical task lines on consecutive days stay two things: the
    // day welded into `ident` is what stops a repeated chore reading as a trip.
    const chores = laneRuns([task(2, "water"), task(3, "water")], week);
    expect(chores.map((r) => r.span)).toEqual([1, 1]);
  });

  it("keeps the order the lane already drew them in", () => {
    // `tallyAllDay`'s rule, for the same reason: the sources produced these in
    // an order and re-sorting them is a reordering nobody asked for.
    const runs = laneRuns([trip("b", 4, "solo"), trip("a", 0, "solo")], week);
    expect(runs.map((r) => r.item.title)).toEqual(["b", "a"]);
  });

  it("places only what spans more than one column", () => {
    // A box of one day is an ordinary all-day item in an ordinary cell, where
    // the count chip can still fold four of them into one `4`. It has nothing
    // to gain from a row of its own and would cost the lane a row to say so.
    const runs = laneRuns([task(2, "water"), trip("t", 3, "start"), trip("t", 4, "end")], week);
    const { placed, spill } = packLaneRuns(runs, 3);
    expect(placed).toHaveLength(1);
    expect(placed[0].span).toBe(2);
    expect(placed[0].row).toBe(0);
    expect(spill.map((r) => r.item.title)).toEqual(["water"]);
    expect(laneRowCount(placed)).toBe(1);
  });

  it("stacks two overlapping trips onto two rows", () => {
    const runs = laneRuns(
      [
        trip("t", 0, "start"),
        trip("t", 1, "mid"),
        trip("t", 2, "end"),
        trip("u", 1, "start", "green"),
        trip("u", 2, "mid", "green"),
        trip("u", 3, "end", "green"),
      ],
      week
    );
    const { placed } = packLaneRuns(runs, 3);
    expect(placed.map((r) => [r.item.title, r.row])).toEqual([
      ["t", 0],
      ["u", 1],
    ]);
    expect(laneRowCount(placed)).toBe(2);
  });

  it("reuses a row once the trip on it has ended", () => {
    // FIRST FIT, LEFT TO RIGHT — the property that makes a repaint produce the
    // same rows as the paint before it. Two trips that do not overlap share a
    // row rather than growing the lane for nothing.
    const runs = laneRuns(
      [
        trip("t", 0, "start"),
        trip("t", 1, "end"),
        trip("u", 3, "start", "green"),
        trip("u", 4, "end", "green"),
      ],
      week
    );
    const { placed } = packLaneRuns(runs, 3);
    expect(placed.map((r) => r.row)).toEqual([0, 0]);
    expect(laneRowCount(placed)).toBe(1);
  });

  it("shares a row with a trip that ends where the next begins", () => {
    // THE BOUNDARY CASE THE TEST ABOVE CANNOT SEE. A row is free FROM the
    // column after the trip on it, so a Monday-Tuesday trip and a
    // Wednesday-Thursday one are one row — and the off-by-one that reads it as
    // two is invisible on any pair with a day between them.
    const runs = laneRuns(
      [
        trip("t", 0, "start"),
        trip("t", 1, "end"),
        trip("u", 2, "start", "green"),
        trip("u", 3, "end", "green"),
      ],
      week
    );
    const { placed } = packLaneRuns(runs, 3);
    expect(placed.map((r) => [r.col, r.row])).toEqual([
      [0, 0],
      [2, 0],
    ]);
  });

  it("spills what will not fit back into its days instead of hiding it", () => {
    // THE WORST CASE OF THIS FEATURE IS THE BEHAVIOUR THAT PRECEDED IT. A
    // phone's lane has room for one chip, so the second overlapping trip is
    // returned to the caller to be drawn in its day cells — where the count
    // chip picks it up. Nothing is dropped.
    const runs = laneRuns(
      [
        trip("t", 0, "start"),
        trip("t", 1, "mid"),
        trip("t", 2, "end"),
        trip("u", 1, "start", "green"),
        trip("u", 2, "end", "green"),
      ],
      week
    );
    const { placed, spill } = packLaneRuns(runs, 1);
    expect(placed.map((r) => r.item.title)).toEqual(["t"]);
    expect(spill.map((r) => r.item.title)).toEqual(["u"]);
    // Every member of it, so the days can draw them one at a time.
    expect(spill[0].members).toHaveLength(2);
  });

  it("accounts for every drawn item exactly once", () => {
    // THE INVARIANT THE VIEW DEPENDS ON. The day cells draw the spill and the
    // lane draws the placed runs, so an item in both is a trip counted twice
    // and an item in neither has vanished from the week.
    const items = [
      trip("t", 0, "start"),
      trip("t", 1, "mid"),
      trip("t", 2, "end"),
      trip("u", 1, "start", "green"),
      trip("u", 2, "end", "green"),
      task(2, "water"),
      task(6, "post"),
    ];
    for (const rows of [0, 1, 2, 3]) {
      const { placed, spill } = packLaneRuns(laneRuns(items, week), rows);
      const seen = [...placed, ...spill].flatMap((r: LaneRun) => r.members.map((m) => m.key));
      expect(new Set(seen).size).toBe(seen.length);
      expect(new Set(seen)).toEqual(new Set(items.map((i) => i.key)));
    }
  });

  it("is nothing at all on a lane with nothing in it", () => {
    expect(laneRuns([], week)).toEqual([]);
    expect(packLaneRuns([], 3)).toEqual({ placed: [], spill: [] });
    expect(laneRowCount([])).toBe(0);
  });
});

describe("the lane draws a span where a cell cannot", () => {
  it("places the chip on the lane, past the gutter", () => {
    const src = readSrc("time-grid-view");
    // THE GUTTER IS COLUMN 1, so the first drawn day is column 2. Off by one
    // here is a trip drawn a day early, which is legible and false — the same
    // argument `placeInWindow` is tested on.
    expect(src).toContain("`${2 + run.col} / span ${run.span}`");
    expect(src).toContain("chip.style.gridRow = String(run.row + 1);");
    // And the day cells sit under however many rows the spans took.
    expect(src).toContain("cell.style.gridRow = String(spanRows + 1);");
    // ONE ROW ON A PHONE, THREE WHEN EXPANDED.
    expect(src).toContain("opts.compact ? 1 : 3");
  });

  it("draws a spill in its day's cell and a placed run nowhere else", () => {
    // The view's half of the accounting invariant above: what the cells draw
    // comes from `spill`, so a trip drawn as a chip cannot also be counted in
    // four day boxes.
    const src = readSrc("time-grid-view");
    const at = src.indexOf("const perDay = new Map<number, AllDayItem[]>();");
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, src.indexOf("cols.forEach", at))).toContain("for (const run of spill)");
    expect(src).toContain("const mine = perDay.get(day) ?? [];");
  });

  it("asks the events store for the occurrence, not just the definition", () => {
    // `eventsOnDay` returns definitions: it expands a one-day window and throws
    // the occurrence away. `pos` is the part the lane needs, so the week is
    // expanded once and read per day.
    // READ WITH THE COMMENTS OUT, because the note above the new call names
    // the function it replaced — which is where that argument belongs and
    // which a substring sweep cannot tell from a live call.
    expect(readCode("time-grid-view")).not.toContain("eventsOnDay");
    const src = readSrc("time-grid-view");
    expect(src).toContain("expandEvents(defs, dates[0], dates[dates.length - 1])");
    expect(src).toContain("pos: occ.pos");
    expect(src).toContain("ident: `event:${def.id}`");
    // AND A TASK'S IDENT CARRIES ITS DAY. A task's key is its file and its
    // text, with no date in it — one task has one due date — so two identical
    // chore lines in one note due on consecutive days would share an ident and
    // group into a two-day trip that does not exist. The pure function cannot
    // see this; it is handed the idents.
    expect(src).toContain("ident: `${key}:${day}`");
    expect(src).toContain('pos: "solo"');
  });

  it("names a span at every width, and a box of one still only where it fits", () => {
    // THE WHOLE POINT OF THE ROUND, and it is written as an exemption to the
    // 560px gate rather than a replacement for it: 1.0.19's finding about a
    // 45px column is still live, and a chip spanning two columns is not one.
    const block = compactRules();
    const hide = block.indexOf(".ca-tg:not(.is-expanded) .ca-tg-blk-title,");
    const reveal = block.indexOf("@container (min-width: 560px)");
    const span = block.indexOf(
      ".ca-tg:not(.is-expanded) .ca-tg-chip.is-span .ca-tg-chip-title"
    );
    expect(hide).toBeGreaterThan(-1);
    expect(reveal).toBeGreaterThan(hide);
    // LAST, because it is the same specificity as the query's rule and has to
    // win at every width.
    expect(span).toBeGreaterThan(reveal);
    const shown = block.slice(span, block.indexOf("}", span));
    expect(shown).toContain("display: block");
    expect(shown).toContain("text-overflow: ellipsis");
    // The hour blocks are NOT exempted: a block is one column wide whatever
    // its duration, so nothing about it got wider.
    expect(shown).not.toContain("ca-tg-blk-title");
  });

  it("keeps the gutter a column rather than one row's cell", () => {
    // The lane grows rows now. Left to auto-place, the gutter would sit beside
    // the top span and leave the day cells a column short.
    expect(readCss("99-time-grid")).toMatch(
      /\.ca-tg-lane-label \{[^}]*grid-row: 1 \/ -1/
    );
  });
});

describe("a repaint leaves nothing behind", () => {
  it("draws the empty line inside the element paint clears", () => {
    const src = readSrc("time-grid-view");
    // It was `grid.parentElement?.parentElement?.createDiv`, two levels above
    // the element `paint` empties, so an empty week grew one more of these on
    // every chip press.
    expect(src).not.toContain("parentElement?.parentElement?.createDiv");
    const at = src.indexOf('cls: "ca-tg-empty"');
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at - 200, at)).toContain("grid.createDiv(");
  });

  it("puts the previous minute timer down before starting another", () => {
    const src = readSrc("time-grid-view");
    expect(src).toContain("opts.ticker.current?.unload()");
    const at = src.indexOf("new NowTicker(");
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at - 400, at)).toContain("opts.ticker.current?.unload()");
  });
});

describe("filter toggles state persistence", () => {
  it("formats filter keys consistently", () => {
    expect(timeGridFilterKey("02 - Diary/Home.md")).toBe("02 - Diary/Home.md::time-grid");
    expect(timeGridFilterKey("02 - Diary/Home.md", "")).toBe("02 - Diary/Home.md::time-grid");
    expect(timeGridFilterKey("02 - Diary/Home.md", "events,tasks|5")).toBe(
      "02 - Diary/Home.md::time-grid:events,tasks|5"
    );
  });

  it("resolves saved off sources against available sources", () => {
    const available = ["events", "logbooks", "tasks"] as const;
    expect(resolveOffSources(undefined, available)).toEqual(new Set());
    expect(resolveOffSources(["tasks"], available)).toEqual(new Set(["tasks"]));
    expect(resolveOffSources(["tasks", "captures"], available)).toEqual(new Set(["tasks"]));
  });

  it("resets to empty set if all available sources were saved as off", () => {
    const available = ["events", "tasks"] as const;
    expect(resolveOffSources(["events", "tasks"], available)).toEqual(new Set());
  });

  it("wires time-grid view to load and save filter toggles", () => {
    const src = readSrc("time-grid-view");
    expect(src).toContain("loadTimeGridFilters");
    expect(src).toContain("saveTimeGridFilters");
    expect(src).toContain("plugin.settings.timeGridFilters");
  });
});
