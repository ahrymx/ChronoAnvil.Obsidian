// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Year view aggregation.
//
// Everything here is pure: it takes already-indexed entries (diary-index.ts)
// plus a list of lesson facts, and returns numbers. Nothing touches the vault,
// so the arithmetic — which is where a stats page actually goes wrong — is
// unit-testable.
//
// The view answers "what did this year look like" for a *calendar* year, which
// is deliberately not what the existing chart ranges offer. `365` is a rolling
// window ending today; asking it for "2025" would silently give you
// July-to-July. A calendar year needs its own range, so `yearWindow` below is
// what the chart layer resolves against.

import { IndexedEntry } from "../diary/diary-index";
import { MonthRollup, rollupMonths } from "./quarter-stats";
import { moment } from "../core/util";

// One dated journal note, flattened to what the year view needs. Kept minimal
// so the caller does the vault reading and this file stays pure.
//
// Was `LessonFact`, counting `type === "lesson"` under the journals root — so
// the year's headline number was Study's alone and every other journal type
// contributed nothing to it. Any type's leaf note counts now; see
// year-view.ts::readJournalNotes.
export interface JournalNoteFact {
  iso: string;
  completed: boolean;
}

export interface YearStats {
  year: number;
  // Inclusive ISO bounds of the part of the year being counted. For the
  // current year this ends today, not on 31 December — see `partial`.
  start: string;
  end: string;
  // True when the year hasn't finished yet. The view must say so: 147 entries
  // is not comparable to a full year's count unless you know it covers 204
  // days, and a partial year silently compared against a whole one is the most
  // obvious way for a stats page to mislead.
  partial: boolean;
  daysElapsed: number;
  daysInYear: number;

  entryCount: number;
  // Share of elapsed days with an entry, 0–1. Denominator is elapsed days, not
  // days in year, so it doesn't collapse every January.
  entryRate: number;
  longestStreak: number;
  streakStart: string | null;
  streakEnd: string | null;

  notesCompleted: number;
  notesStarted: number;

  tasksDone: number;
  tasksOpen: number;

  entriesByMonth: number[]; // length 12, index 0 = January
  // Months that haven't happened yet, so the view can draw "not yet" rather
  // than "you wrote nothing".
  monthsElapsed: number;

  // ── the authored rollup (2.52) ─────────────────────────────────────
  //
  // Until 2.52 this page counted and nothing more: the quarter was a review
  // and the year was a statistics band, with nothing in the design saying why
  // the same object at two zooms should be two kinds of page. It rolled up
  // nothing not because a year has nothing to roll up but because
  // quarter-stats.ts named its four regions as string literals, so a second
  // consumer meant a second copy of them. test/pure-logic.test.ts has kept
  // `highlights` and `challenges` as separate regions since 2.12 explicitly so
  // that "a year-in-review can read twelve months of highlights as regions
  // rather than by parsing prose" — this is that consumer, finally written,
  // going through the same fields.ts call the quarter makes.
  months: MonthRollup[]; // length 12, index 0 = January
  reviewsWritten: number; // of 12
  goalsDone: number;
  goalsOpen: number;
}

// Days in a calendar year, leap-aware.
export function daysInYear(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

// The inclusive date bounds of a calendar year, clipped to today when the year
// is still running. This is what a `year` chart range resolves to.
export function yearWindow(
  year: number,
  todayIso: string
): { start: string; end: string; partial: boolean } {
  const start = `${year}-01-01`;
  const fullEnd = `${year}-12-31`;
  if (todayIso < start) {
    // A year entirely in the future: an empty window rather than a whole year
    // of nothing, so callers don't render 365 blank days.
    return { start, end: start, partial: true };
  }
  if (todayIso >= fullEnd) return { start, end: fullEnd, partial: false };
  return { start, end: todayIso, partial: true };
}

// Longest run of consecutive days with an entry, within the window.
//
// Separate from util.ts::entryStreak, which answers a different question — the
// streak *ending today* — and would report 0 for a past year regardless of how
// well it went. Returns the run's bounds too, since "31 days" invites "when?".
export function longestStreak(dates: string[]): {
  length: number;
  start: string | null;
  end: string | null;
} {
  const unique = Array.from(new Set(dates)).sort();
  if (unique.length === 0) return { length: 0, start: null, end: null };

  let best = 1;
  let bestStart = unique[0];
  let bestEnd = unique[0];
  let runStart = unique[0];
  let run = 1;

  for (let i = 1; i < unique.length; i++) {
    const prev = moment(unique[i - 1]).add(1, "days").format("YYYY-MM-DD");
    if (unique[i] === prev) {
      run++;
    } else {
      run = 1;
      runStart = unique[i];
    }
    if (run > best) {
      best = run;
      bestStart = runStart;
      bestEnd = unique[i];
    }
  }
  return { length: best, start: bestStart, end: bestEnd };
}

// Inclusive day count between two ISO dates.
export function daysBetween(startIso: string, endIso: string): number {
  const a = moment(startIso);
  const b = moment(endIso);
  return Math.max(0, Math.round(b.diff(a, "days")) + 1);
}

// Aggregate a year. `entries` and `lessons` may span any range; both are
// filtered to the window here so callers can hand over everything they have.
export function yearStats(
  year: number,
  entries: IndexedEntry[],
  notes: JournalNoteFact[],
  todayIso: string
): YearStats {
  const { start, end, partial } = yearWindow(year, todayIso);

  // Daily entries only. A monthly review is a summary *of* the days, so
  // counting it alongside them would inflate both the entry count and the
  // "share of days written" rate past what actually happened.
  const inYear = entries.filter(
    (e): e is IndexedEntry & { iso: string } =>
      e.kind === "daily" && e.iso != null && e.iso >= start && e.iso <= end
  );

  const entriesByMonth = new Array(12).fill(0) as number[];
  let tasksDone = 0;
  let tasksOpen = 0;
  for (const e of inYear) {
    entriesByMonth[Number(e.iso.slice(5, 7)) - 1]++;
    tasksDone += e.doneTasks;
    tasksOpen += e.openTasks;
  }

  const notesInYear = notes.filter((n) => n.iso >= start && n.iso <= end);

  // The authored rollup. Monthly reviews are gathered over the *whole* calendar
  // year rather than up to today, unlike the daily counts above: a review note
  // is dated to the month it reviews, and clipping at today would drop the
  // review of the month you are currently in the middle of writing — which is
  // the one most likely to be open beside this page. `future` on each rollup is
  // what the view uses to draw the months that haven't happened.
  const monthlyByKey = new Map<string, IndexedEntry>();
  for (const e of entries) {
    if (e.kind !== "monthly" || e.iso == null) continue;
    if (e.iso.slice(0, 4) !== String(year)) continue;
    monthlyByKey.set(e.iso.slice(0, 7), e);
  }
  const monthKeys = Array.from(
    { length: 12 },
    (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`
  );
  const months = rollupMonths(monthKeys, monthlyByKey, todayIso.slice(0, 7));

  let goalsDone = 0;
  let goalsOpen = 0;
  for (const r of months) {
    for (const g of r.goals) {
      if (g.done) goalsDone++;
      else goalsOpen++;
    }
  }

  const streak = longestStreak(inYear.map((e) => e.iso));
  const elapsed =
    todayIso < start ? 0 : daysBetween(start, end);

  return {
    year,
    start,
    end,
    partial,
    daysElapsed: elapsed,
    daysInYear: daysInYear(year),
    entryCount: inYear.length,
    entryRate: elapsed > 0 ? inYear.length / elapsed : 0,
    longestStreak: streak.length,
    streakStart: streak.start,
    streakEnd: streak.end,
    notesCompleted: notesInYear.filter((n) => n.completed).length,
    notesStarted: notesInYear.length,
    tasksDone,
    tasksOpen,
    entriesByMonth,
    monthsElapsed: partial
      ? todayIso < start
        ? 0
        : Number(end.slice(5, 7))
      : 12,
    months,
    reviewsWritten: months.filter((m) => m.path).length,
    goalsDone,
    goalsOpen,
  };
}

// Years that have any entry, newest first — the year picker's options. Always
// includes the current year even when nothing's written in it yet, so the view
// has something to open on in a fresh vault.
export function availableYears(
  entries: IndexedEntry[],
  todayIso: string
): number[] {
  const years = new Set<number>();
  for (const e of entries) {
    if (e.iso == null) continue;
    years.add(Number(e.iso.slice(0, 4)));
  }
  years.add(Number(todayIso.slice(0, 4)));
  return Array.from(years).sort((a, b) => b - a);
}
