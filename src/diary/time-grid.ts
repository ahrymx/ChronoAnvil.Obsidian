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
// ChronoAnvil has three calendar-family widgets and every one of them is a DAY
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
export type GridSource = "events" | "logbooks" | "tasks" | "captures";

export const GRID_SOURCES: readonly GridSource[] = [
  "events",
  "logbooks",
  "tasks",
  "captures",
];

// What an EMPTY argument draws, which is not all of them (4.62).
//
// CAPTURES ARE NAMEABLE AND NOT DEFAULT, and that asymmetry is the decision. A
// capture is a thought recorded at a minute — forty of them in a day, most of
// them one line — and a grid that showed them by default would bury the three
// meetings it was built to draw under an afternoon of fragments. But a day of
// captures laid against the clock is exactly the picture a reader wants when
// they are asking where the day went, so `time-grid:captures` and
// `time-grid:captures,events` say so and get it.
//
// IT ALSO KEEPS EVERY GRID ALREADY IN A VAULT DRAWING WHAT IT DREW. An
// argumentless directive written in 4.55 means the same three sources it has
// always meant.
export const DEFAULT_SOURCES: readonly GridSource[] = [
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

// The entire 24-hour day window (00:00 to 24:00).
export const FULL_DAY_WINDOW: GridWindow = { startHour: 0, endHour: 24 };

// The default hour to open/scroll the grid viewport to (6:00 AM).
export const DEFAULT_OPEN_HOUR = 6;

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
//
// ── `contains`, AND WHY THE WINDOW TAKES AN ARGUMENT AT ALL (4.62) ───
//
// The now line has to have somewhere to be. A window derived purely from
// content is a window that need not hold the current minute — a week whose only
// meeting is at 09:00 draws 09:00–17:00, and at 19:20 on the Thursday of that
// week the line would have nowhere to go on a grid that is nominally showing
// NOW. So the view passes the current minute when the week it is drawing is the
// current one, and the window is widened to include it.
//
// WIDENED, NOT CENTRED. The minute joins the content as one more thing that has
// to fit; everything below is unchanged, which is what keeps a busy week's rail
// exactly where it was before this argument existed.
export function gridWindow(
  items: GridItem[],
  opts?: { contains?: number }
): GridWindow {
  const contains = opts?.contains;

  // AN EMPTY WEEK KEEPS ITS WORKING DAY. `EMPTY_WINDOW` is a considered answer
  // to "what hours will a reader reach for", and deriving 10:00–18:00 from the
  // fact that it happens to be 10:40 would throw that away for a number that
  // means nothing about the week. The minute only ever stretches it.
  if (!items.length) {
    const win = { ...EMPTY_WINDOW };
    if (contains == null) return win;
    win.startHour = Math.max(0, Math.min(win.startHour, Math.floor(contains / 60)));
    win.endHour = Math.min(24, Math.max(win.endHour, Math.ceil(contains / 60)));
    return win;
  }

  let lo = Infinity;
  let hi = -Infinity;
  for (const item of items) {
    lo = Math.min(lo, item.start);
    hi = Math.max(hi, itemEnd(item));
  }
  if (contains != null) {
    lo = Math.min(lo, contains);
    hi = Math.max(hi, contains);
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

// Where the current minute sits in the window, as a fraction — or null when it
// is not in it at all. 4.62.
//
// NULL RATHER THAN A CLAMP, and that is the whole of the decision. A line
// pinned to the top edge of a grid showing 08:00–18:00 at 06:15 says it is
// eight o'clock, which is a legible falsehood — the worst kind this widget can
// tell, because a reader has no reason to doubt a line. Outside the window
// there is nothing honest to draw, so nothing is drawn.
//
// TAKES THE MINUTE RATHER THAN READING A CLOCK, so this file still holds no
// `moment` and the boundaries are testable without waiting for one.
export function nowOffset(win: GridWindow, minutes: number): number | null {
  const start = win.startHour * 60;
  const span = (win.endHour - win.startHour) * 60;
  if (span <= 0) return null;
  if (minutes < start || minutes > start + span) return null;
  return (minutes - start) / span;
}

// ── the grid as somewhere to write (4.62) ────────────────────────────
//
// Everything above turns a note into a picture. These four turn a gesture back
// into a time, and they are here rather than in the view for the usual reason:
// "what does a drag from 40% to 65% of an eight-hour window mean" is arithmetic
// with an answer that can be wrong, and a wrong answer moves a reader's meeting
// to the wrong hour. The view owns the pointer; this owns the minute.
//
// A QUARTER OF AN HOUR IS THE UNIT. A grid row is an hour of maybe 34 pixels,
// so a pixel is about two minutes and an unsnapped drag writes `10:53` — a time
// nobody meant, in a file they have to read. Fifteen minutes is the coarsest
// unit that can still say every time people actually schedule.
export const SNAP_MINUTES = 15;

// A fraction down the window back to a minute of the day, snapped.
//
// CLAMPED TO THE WINDOW, NOT TO THE DAY. A pointer can leave the element — a
// drag that keeps going past the foot of the grid is a real thing a reader
// does — and the honest reading of it is the last minute the grid was showing,
// because the hours below the window are not on screen to have been aimed at.
export function minuteAt(win: GridWindow, fraction: number): number {
  const start = win.startHour * 60;
  const span = (win.endHour - win.startHour) * 60;
  const raw = start + Math.max(0, Math.min(1, fraction)) * span;
  const snapped = Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES;
  return Math.max(start, Math.min(start + span, snapped));
}

// Two minutes from one drag, in whichever order they were dragged, as a block.
//
// UPWARDS IS THE SAME BLOCK AS DOWNWARDS. Drawing from 15:00 up to 14:00 is a
// perfectly ordinary way to say "an hour before that meeting", and refusing it
// would be the widget being pedantic about a direction the reader has no reason
// to think about.
//
// A ZERO-LENGTH DRAG IS A CLICK, AND A CLICK MEANS ONE SLOT. It cannot mean a
// moment: a moment is a fact you record about a minute that has passed, and
// nothing you draw on a future Thursday is that.
export function spanFromDrag(a: number, b: number): { start: number; mins: number } {
  const start = Math.min(a, b);
  const mins = Math.max(SNAP_MINUTES, Math.abs(b - a));
  return { start, mins };
}

// The same item, somewhere else. Returns null when the move changes nothing, so
// a caller can refuse to write a file for a drag that landed where it started.
//
// THE DAY IS CLAMPED BY THE CALLER, NOT HERE. Which columns exist is a fact
// about how many days are on screen and which week is being drawn — this file
// knows neither, and a recurring event that may not leave its column is a rule
// about events, not about grids.
export function movedTo(
  item: GridItem,
  to: { day: number; start: number }
): GridItem | null {
  // Kept inside the day at both ends: a block dragged off the bottom would
  // otherwise be written as ending tomorrow, in a column that is already on
  // screen and is not this one.
  const length = item.mins ?? 0;
  const start = Math.max(0, Math.min(1440 - length, to.start));
  if (to.day === item.day && start === item.start) return null;
  return { ...item, day: to.day, start };
}

// The same item, longer or shorter. Null for no change, and null for a moment:
// a moment has no length to drag, which is why the view gives it no handle.
export function resizedTo(item: GridItem, end: number): GridItem | null {
  if (item.mins == null) return null;
  const mins = Math.max(
    SNAP_MINUTES,
    Math.min(1440 - item.start, Math.round(end) - item.start)
  );
  if (mins === item.mins) return null;
  return { ...item, mins };
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

// ── how many days of the week are drawn (4.62) ───────────────────────
//
// SEVEN IS THE DEFAULT AND THE ONLY ONE THAT NEEDS NO REASON. The other two are
// answers to where the widget ended up: 4.58 offered it on every page and
// 4.58.1/4.61 made it a column of a row group, and seven columns in a third of
// a dashboard is about forty pixels a day — narrower than the word "Wed".
//
// A NARROWER WINDOW ON THE SAME WEEK, NEVER A DIFFERENT WEEK. The host note's
// `week-start` still decides what is read; this decides how much of it is on
// screen. That is what keeps `period-nav:week` the only thing that navigates.
export const DAY_COUNTS = [7, 3, 1] as const;
export type DayCount = (typeof DAY_COUNTS)[number];

// Below these widths a grid cannot honestly draw the count it was asked for.
// Numbers rather than a media query because the choice is WHICH days, and CSS
// can hide a column but cannot decide that the three to keep are the three
// around today.
export const NARROW_3_PX = 520;
export const NARROW_1_PX = 330;

// The second piece of the argument, read. Empty is the whole week.
export function parseDays(arg: string): {
  days: DayCount;
  unknown: string | null;
} {
  const word = arg.trim();
  if (word === "") return { days: 7, unknown: null };
  const n = Number(word);
  if ((DAY_COUNTS as readonly number[]).includes(n)) {
    return { days: n as DayCount, unknown: null };
  }
  return { days: 7, unknown: word };
}

// What a pane this wide can actually draw, given what it was asked for.
//
// NARROWS ONLY. A reader who asked for one day gets one day in a pane wide
// enough for seven — they said what they wanted and the pane does not disagree
// with them, it only ever admits it has no room.
export function fitDays(asked: DayCount, width: number): DayCount {
  if (width <= 0) return asked;
  if (width < NARROW_1_PX) return 1;
  if (width < NARROW_3_PX) return Math.min(asked, 3) as DayCount;
  return asked;
}

// Which columns of the week to draw, as indices into its seven dates.
//
// CENTRED ON TODAY WHERE THE WEEK HOLDS IT — a three-day grid on this week is
// yesterday, today, tomorrow — and clamped at both ends, so the Monday of a
// week never draws a column belonging to the week before. On any other week it
// opens at the start, because a March page has no today to centre on.
export function visibleDays(
  dates: string[],
  days: DayCount,
  todayIso: string
): number[] {
  const span = Math.max(1, Math.min(days, dates.length));
  if (span >= dates.length) return dates.map((_, i) => i);
  const today = dates.indexOf(todayIso);
  const first =
    today < 0
      ? 0
      : Math.max(0, Math.min(dates.length - span, today - Math.floor((span - 1) / 2)));
  const out: number[] = [];
  for (let i = 0; i < span; i++) out.push(first + i);
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
  if (!words.length) return { sources: [...DEFAULT_SOURCES], unknown: [] };

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
