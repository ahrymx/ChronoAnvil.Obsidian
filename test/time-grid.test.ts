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
import {
  DEFAULT_SOURCES,
  EMPTY_WINDOW,
  GRID_SOURCES,
  MIN_WINDOW_HOURS,
  MOMENT_MINUTES,
  type GridItem,
  describeWhen,
  dayIndex,
  fitDays,
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
  spanFromDrag,
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

  it("narrows for a pane that has no room, and never widens", () => {
    expect(fitDays(7, 900)).toBe(7);
    expect(fitDays(7, 400)).toBe(3);
    expect(fitDays(7, 300)).toBe(1);
    // A reader who asked for one day meant it.
    expect(fitDays(1, 900)).toBe(1);
    expect(fitDays(3, 900)).toBe(3);
  });

  it("keeps what it was asked for until it has been measured", () => {
    // A width of zero is an element that has not been laid out yet, not a pane
    // with no room in it.
    expect(fitDays(7, 0)).toBe(7);
  });
});

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
