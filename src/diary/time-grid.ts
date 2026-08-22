// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The week laid against the hours — the arithmetic, with no vault in it. 4.55.
//
// WHY THIS FILE EXISTS, AND WHY IT HOLDS NO `App`
//
// Almanac has three calendar-family widgets and every one of them is a DAY
// GRID: a cell per day, and what happened that day listed inside it. Two of its
// stores have carried an hour since 4.52 — `EventDef.time`, the field that
// makes a meeting a meeting, and `LogItem.time`, on every capture and every
// logbook item — and nothing in the plugin could draw one. `time-grid` is the
// view that can.
//
// Everything a time grid does that a day grid does not is arithmetic: where a
// block starts, how tall it is, and what to do when two of them want the same
// minute. That is the part worth testing directly, so it is the part that lives
// here — no `App`, no `TFile`, no DOM, on `events.ts`' own terms and
// `cell-move.ts`' and `layout.ts`'. `time-grid-view.ts` asks the vault and
// draws; this decides.
//
// ── THE WINDOW IS DERIVED, NOT FIXED AT TWENTY-FOUR HOURS ────────────
//
// A day is 1,440 minutes and a reader uses maybe 600 of them. Drawn whole, a
// week is a wall of empty night with a thin band of content in it, and every
// block is too short to read. So the grid shows the hours the week actually
// uses, padded out to whole hours — which means the same widget is a working
// day on one note and an evening on another, without a setting.
//
// ── A MOMENT IS NOT A SHORT SPAN ─────────────────────────────────────
//
// An item with no duration is a fact about a minute: "I thought of this at
// 14:32". It has no length to draw, and drawing it as a small block would be a
// claim about how long it took. It is given `MOMENT_MINUTES` of room so that a
// span cannot land on top of it and hide it, and the view draws it with a flat
// foot so the two read differently. Nothing here invents a duration for it: its
// `mins` stays null all the way through.

import { addDays, daysBetween } from "../events/events";

// Which stores a grid draws. The directive's argument names these.
export type GridSource = "events" | "logbooks" | "tasks";

export const GRID_SOURCES: readonly GridSource[] = [
  "events",
  "logbooks",
  "tasks",
];

// One thing on the grid, already resolved to a column and a minute.
//
// FLAT, AND CARRYING NO REFERENCE TO WHAT IT CAME FROM. A `GridItem` holding an
// `EventDef` would make this module's tests need events, and the view is the
// half that knows how to open a thing anyway — it keeps its own map from the
// item's `key` back to the source object.
export interface GridItem {
  source: GridSource;
  // The swatch NAME — one of `EVENT_COLORS`, never a colour literal. The view
  // turns it into a class; a literal here would be a colour chosen without a
  // theme in front of it.
  color: string;
  title: string;
  // Which column, 0-6 from the start of the week the grid is drawing.
  day: number;
  // Minutes past midnight.
  start: number;
  // Minutes of length, or null for a moment. Never 0 — see `readMinutes`.
  mins: number | null;
  // Opaque handle the view uses to get back to the thing this came from.
  key: string;
}

// Something true of a whole day: a task due with no hour on it.
export interface AllDayItem {
  source: GridSource;
  color: string;
  title: string;
  day: number;
  key: string;
}

// A `GridItem` with its place inside an overlap worked out.
export interface PlacedItem extends GridItem {
  // Which sub-column, 0-based.
  col: number;
  // How many sub-columns the cluster it belongs to needed.
  cols: number;
}

export interface GridWindow {
  // Whole hours, `startHour` inclusive and `endHour` exclusive as an instant —
  // an 8-to-18 window is ten hours of rail with eleven labels on it.
  startHour: number;
  endHour: number;
}

// What a moment occupies FOR LAYOUT ONLY, so a span starting in the same minute
// is packed beside it instead of over it. Never drawn as a duration and never
// written to a note.
export const MOMENT_MINUTES = 18;

// The grid never closes tighter than this, so a week holding one 20-minute
// stand-up is not a single fat band with an hour rail of two labels.
export const MIN_WINDOW_HOURS = 8;

// A week with nothing in it. A working day rather than a midnight-to-midnight
// stripe: an empty grid is a thing a reader is about to put something INTO, and
// the hours they will reach for are these.
export const EMPTY_WINDOW: GridWindow = { startHour: 8, endHour: 18 };

// `HH:mm` to minutes past midnight, or null.
//
// TAKES `9:05` AS WELL AS `09:05`, which is `STAMP_RE`'s allowance and
// `AT_RE`'s: the pickers write a padded hour and a reader editing the raw file
// does not, and refusing theirs would make the note ours rather than theirs.
export function parseClock(value: string | null | undefined): number | null {
  if (typeof value !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Minutes past midnight back to `HH:mm`, padded. Minutes past the end of the
// day wrap, so a block running to 25:30 is described as ending at 01:30 rather
// than at an hour that does not exist.
export function formatClock(minutes: number): string {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// What an item occupies on the rail, moments included.
export function itemEnd(item: GridItem): number {
  return item.start + (item.mins ?? MOMENT_MINUTES);
}

// The seven dates a week covers, from its first day.
export function weekDates(startIso: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) out.push(addDays(startIso, i));
  return out;
}

// Which column a date falls in, or null when it is not in this week.
export function dayIndex(startIso: string, iso: string): number | null {
  const n = daysBetween(startIso, iso);
  return n >= 0 && n < 7 ? n : null;
}

// The hours to draw, from what the week holds.
//
// GROWS DOWNWARD FIRST. A week whose content spans two hours has to be padded
// to eight, and padding it upward would push a 9am meeting to the bottom of the
// grid with six hours of empty morning above it. Later hours are where the rest
// of a day goes, so the window opens that way and only walks backwards when it
// has run out of day.
export function gridWindow(items: GridItem[]): GridWindow {
  if (!items.length) return { ...EMPTY_WINDOW };

  let lo = Infinity;
  let hi = -Infinity;
  for (const item of items) {
    lo = Math.min(lo, item.start);
    hi = Math.max(hi, itemEnd(item));
  }

  let startHour = Math.max(0, Math.floor(lo / 60));
  // Clamped at midnight: an event running past it is CLIPPED at the foot of the
  // column rather than stretching the grid into a second day, because the
  // column below the last hour belongs to tomorrow and tomorrow is a different
  // column already on screen.
  let endHour = Math.min(24, Math.ceil(hi / 60));

  while (endHour - startHour < MIN_WINDOW_HOURS && endHour < 24) endHour++;
  while (endHour - startHour < MIN_WINDOW_HOURS && startHour > 0) startHour--;

  return { startHour, endHour };
}

// Where a block sits in its column, as fractions of the window — 0 at the top,
// 1 at the foot. Fractions rather than pixels so the stylesheet carries no
// arithmetic and the grid holds at any pane width.
//
// CLIPPED AT BOTH ENDS rather than allowed to overhang: a block that started
// before the window would draw above the rail and over the day heads.
export function placeInWindow(
  item: GridItem,
  win: GridWindow
): { top: number; height: number } {
  const winStart = win.startHour * 60;
  const winSpan = (win.endHour - win.startHour) * 60;
  const top = Math.max(0, Math.min(1, (item.start - winStart) / winSpan));
  const rawEnd = (itemEnd(item) - winStart) / winSpan;
  const end = Math.max(0, Math.min(1, rawEnd));
  return { top, height: Math.max(0, end - top) };
}

// One day's items, each given a sub-column inside whatever it overlaps.
//
// THE ALGORITHM. Sort by start, then by end. Walk the list keeping a CLUSTER of
// everything whose ranges touch; the cluster ends the moment an item starts at
// or after the furthest end so far. Inside a cluster each item takes the lowest
// sub-column still free at its own start, and every member is then told how
// many columns the cluster needed, so the whole cluster divides the width
// evenly and blocks line up down the day.
//
// WHY THE WHOLE CLUSTER SHARES ONE WIDTH, rather than each item being measured
// against only what it personally overlaps: the second is tighter and looks
// broken. Three meetings in a row where only the middle one overlaps both
// neighbours would draw at three different widths, and a reader reads a width
// as a meaning. A cluster is the unit that reads as "these are at the same
// time".
//
// TIES GO TO THE EARLIER-ENDING ITEM, which puts the short thing on the left
// and the long thing beside it — the order a reader scans, and stable, so a
// repaint never reshuffles a day that did not change.
export function packDay(items: GridItem[]): PlacedItem[] {
  const sorted = items
    .slice()
    .sort((a, b) => a.start - b.start || itemEnd(a) - itemEnd(b));

  const out: PlacedItem[] = [];
  let cluster: PlacedItem[] = [];
  let clusterEnd = -Infinity;

  const flush = (): void => {
    if (!cluster.length) return;
    // `colEnds[c]` is when sub-column `c` next becomes free.
    const colEnds: number[] = [];
    for (const item of cluster) {
      let c = 0;
      while (colEnds[c] !== undefined && colEnds[c] > item.start) c++;
      colEnds[c] = itemEnd(item);
      item.col = c;
    }
    for (const item of cluster) item.cols = colEnds.length;
    out.push(...cluster);
    cluster = [];
    clusterEnd = -Infinity;
  };

  for (const item of sorted) {
    if (cluster.length && item.start >= clusterEnd) flush();
    cluster.push({ ...item, col: 0, cols: 1 });
    clusterEnd = Math.max(clusterEnd, itemEnd(item));
  }
  flush();
  return out;
}

// The directive's argument, read.
//
// AN UNKNOWN WORD IS A REFUSAL, NOT A SHRUG. `time-grid:event` is a typo for
// `events` and drawing two of the three sources silently would leave a reader
// staring at a grid missing its meetings with nothing to tell them why. The
// caller draws the refusal and names the legal words — the shape
// `journal-chart` and `logbook:` already refuse in.
export function parseSources(arg: string): {
  sources: GridSource[];
  unknown: string[];
} {
  const words = arg
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w !== "");
  if (!words.length) return { sources: [...GRID_SOURCES], unknown: [] };

  const sources: GridSource[] = [];
  const unknown: string[] = [];
  for (const word of words) {
    if ((GRID_SOURCES as readonly string[]).includes(word)) {
      // Named twice is named once: a duplicate would draw every item of that
      // source on top of itself and pack each one against its own twin.
      if (!sources.includes(word as GridSource)) sources.push(word as GridSource);
    } else if (!unknown.includes(word)) {
      unknown.push(word);
    }
  }
  return { sources, unknown };
}

// How a block says when it is, under its title. A moment says the minute it
// happened; a span says both ends, because "14:00" on a two-hour block is the
// half of the fact the block is already drawing.
export function describeWhen(item: GridItem): string {
  if (item.mins == null) return formatClock(item.start);
  return `${formatClock(item.start)}–${formatClock(itemEnd(item))}`;
}
