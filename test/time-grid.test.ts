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
  EMPTY_WINDOW,
  GRID_SOURCES,
  MIN_WINDOW_HOURS,
  MOMENT_MINUTES,
  type GridItem,
  describeWhen,
  dayIndex,
  formatClock,
  gridWindow,
  itemEnd,
  packDay,
  parseClock,
  parseSources,
  placeInWindow,
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
  it("means everything when it is empty", () => {
    expect(parseSources("")).toEqual({ sources: [...GRID_SOURCES], unknown: [] });
    expect(parseSources("   ")).toEqual({ sources: [...GRID_SOURCES], unknown: [] });
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
