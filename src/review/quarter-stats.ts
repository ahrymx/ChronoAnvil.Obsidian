// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Quarter view aggregation.
//
// Pure, like year-stats.ts: it takes already-indexed entries (diary-index.ts)
// and returns numbers and strings. Nothing here touches the vault, so the
// arithmetic — which is where a summary page actually goes wrong — is
// unit-testable without an App.
//
// What this rolls up, and what it deliberately doesn't.
//
// A quarter has no entries of its own. It is a review *scope*, so everything
// on the page is derived from the three Monthly Entries it spans plus the
// daily entries underneath them.
//
// Which regions those are is no longer decided here. Until 2.52 this module
// named four of them as string literals — `focus`, `highlights`, `challenges`,
// `todo` — and was the *only* code in the plugin that knew a region by name.
// That is why the rollup ladder stopped at the quarter: the year rolled up
// nothing because rolling it up would have meant a second copy of the same four
// literals. They live in fields.ts now, with the argument for each attached to
// the field rather than to this comment, and both this module and year-stats.ts
// read the same list.
//
// The asymmetry that remains is worth keeping in mind: the quality of this page
// is capped by how structured the authored level is, and the day is much less
// structured than the month.

import { IndexedEntry } from "../diary/diary-index";
import { FieldValue, goalsOf, itemsOf, lineOf, readRollup } from "../trackers/fields";
import { moment, quarterMonths } from "../core/util";

// One month's contribution to the quarter. A month with no review note still
// gets a row — "you didn't write August" is information, and omitting it would
// make a two-month quarter look like a complete one.
export interface MonthRollup {
  monthKey: string; // "2026-07"
  label: string; // "July"
  path: string | null; // the review note, or null when it doesn't exist yet
  title: string;
  // Every rollupable monthly field, in template order — what a generic
  // renderer iterates. The four named accessors below are derived from this
  // and exist only while quarter-view.ts still renders section by section;
  // they go when it renders from `fields` the way the year view will.
  fields: FieldValue[];
  focus: string;
  highlights: string[];
  challenges: string[];
  goals: { text: string; done: boolean }[];
  // True when the month lies entirely in the future — the view draws "not yet"
  // rather than "you skipped it", the same distinction the year view makes.
  future: boolean;
}

export interface QuarterStats {
  quarter: string; // "2026-Q3"
  year: number;
  q: number; // 1–4
  // Inclusive ISO bounds of the part of the quarter being counted. For a
  // running quarter this ends today, not on the last day — see `partial`.
  start: string;
  end: string;
  // Full bounds of the quarter regardless of today, for the page title.
  fullStart: string;
  fullEnd: string;
  partial: boolean;
  daysElapsed: number;
  daysInQuarter: number;

  dailyCount: number;
  // Share of elapsed days with a daily entry, 0–1. Denominator is elapsed
  // days, not days in quarter, so a quarter three days old doesn't read as 3%.
  entryRate: number;

  months: MonthRollup[]; // always three, in calendar order
  reviewsWritten: number; // 0–3

  goalsDone: number;
  goalsOpen: number;
}

// "2026-07-14" → "2026-Q3". Kept here rather than reusing util's
// quarterOfMonth at every call site so this module reads in date space.
export function quarterOfDate(iso: string): string {
  const year = iso.slice(0, 4);
  const m = Number(iso.slice(5, 7));
  return `${year}-Q${Math.floor((m - 1) / 3) + 1}`;
}

// The first day of a quarter, as the `quarter-start` property holds it.
export function quarterStartDate(quarter: string): string {
  return `${quarterMonths(quarter)[0]}-01`;
}

// The inclusive date bounds of a quarter, clipped to today while it is still
// running. Mirrors yearWindow in year-stats.ts, including the future case:
// a quarter entirely ahead of today returns an empty window rather than
// ninety-odd blank days.
export function quarterWindow(
  quarter: string,
  todayIso: string
): { start: string; end: string; fullEnd: string; partial: boolean } {
  const months = quarterMonths(quarter);
  const start = `${months[0]}-01`;
  const fullEnd = endOfMonth(months[2]);
  if (todayIso < start) return { start, end: start, fullEnd, partial: true };
  if (todayIso >= fullEnd) return { start, end: fullEnd, fullEnd, partial: false };
  return { start, end: todayIso, fullEnd, partial: true };
}

// Days in a "YYYY-MM" month, leap-aware. Arithmetic rather than a moment call,
// for the reason year-stats.ts writes its own daysInYear: this is the kind of
// number a summary page gets quietly wrong, and a pure function is one that
// can be tested without a date library standing in the way.
export function daysInMonth(monthKey: string): number {
  const year = Number(monthKey.slice(0, 4));
  const m = Number(monthKey.slice(5, 7));
  if (m === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

// Total days in a quarter.
export function daysInQuarter(quarter: string): number {
  return quarterMonths(quarter).reduce((n, m) => n + daysInMonth(m), 0);
}

// The last day of a "YYYY-MM" month, as an ISO date.
function endOfMonth(monthKey: string): string {
  return `${monthKey}-${String(daysInMonth(monthKey)).padStart(2, "0")}`;
}

// Inclusive day count between two ISO dates.
function daysBetween(start: string, end: string): number {
  if (end < start) return 0;
  return moment(end).diff(moment(start), "days") + 1;
}

// Roll up a run of months from their authored review notes.
//
// Shared by the quarter (three months) and the year (twelve), because the two
// scopes are the same operation at different widths and the release that gave
// the year a rollup is the release that would otherwise have produced a second
// copy of it. It lives here rather than in year-stats.ts because the quarter is
// where the rollup was invented and where MonthRollup is declared; both go
// through fields.ts::readRollup, so neither scope can disagree with the other
// about what a monthly review contributes.
export function rollupMonths(
  months: string[],
  monthlyByKey: Map<string, IndexedEntry>,
  thisMonthKey: string
): MonthRollup[] {
  return months.map((monthKey) => {
    const e = monthlyByKey.get(monthKey);
    // A month with no review note still reads its (absent) regions rather than
    // being special-cased to empty: readRollup returns a value per registered
    // field either way, so an unwritten month and an unwritten field are the
    // same shape, and the view draws one empty section rather than branching.
    const fields = readRollup(e?.regions ?? [], "monthly");
    return {
      monthKey,
      label: moment(`${monthKey}-01`).format("MMMM"),
      path: e?.path ?? null,
      title: e?.title ?? "",
      fields,
      focus: lineOf(fields, "focus"),
      highlights: itemsOf(fields, "highlights"),
      challenges: itemsOf(fields, "challenges"),
      goals: goalsOf(fields, "todo"),
      future: monthKey > thisMonthKey,
    };
  });
}

export function quarterStats(
  quarter: string,
  entries: IndexedEntry[],
  todayIso: string
): QuarterStats {
  const months = quarterMonths(quarter);
  const { start, end, fullEnd, partial } = quarterWindow(quarter, todayIso);
  const fullStart = `${months[0]}-01`;

  const monthlyByKey = new Map<string, IndexedEntry>();
  let dailyCount = 0;
  for (const e of entries) {
    // Dateless notes can't fall in a quarter. Diary entries always carry a
    // date — the diary indexer skips anything that doesn't — so this is a
    // type-level guard rather than a case that arises, but it is the honest
    // one now that IndexedEntry spans journal notes too.
    if (e.iso == null) continue;
    if (e.iso < fullStart || e.iso > fullEnd) continue;
    if (e.kind === "monthly") {
      monthlyByKey.set(e.iso.slice(0, 7), e);
    } else if (e.iso <= end) {
      // Daily entries are counted only up to today. A daily note dated in the
      // future would otherwise inflate a running quarter's coverage past the
      // days that have actually happened.
      dailyCount++;
    }
  }

  const thisMonthKey = todayIso.slice(0, 7);
  const rollups = rollupMonths(months, monthlyByKey, thisMonthKey);

  let goalsDone = 0;
  let goalsOpen = 0;
  for (const r of rollups) {
    for (const g of r.goals) {
      if (g.done) goalsDone++;
      else goalsOpen++;
    }
  }

  const daysElapsed = todayIso < fullStart ? 0 : daysBetween(start, end);

  return {
    quarter,
    year: Number(quarter.slice(0, 4)),
    q: Number(quarter.slice(6)),
    start,
    end,
    fullStart,
    fullEnd,
    partial,
    daysElapsed,
    daysInQuarter: daysInQuarter(quarter),
    dailyCount,
    entryRate: daysElapsed > 0 ? dailyCount / daysElapsed : 0,
    months: rollups,
    reviewsWritten: rollups.filter((r) => r.path).length,
    goalsDone,
    goalsOpen,
  };
}
