// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// ── Review scheduling ─────────────────────────────────────────────────────
//
// When a journal note is next worth reopening, derived from what the note
// already says. Pure — no Obsidian — so the arithmetic is testable in
// isolation, the way charts.ts and year-stats.ts are.
//
// The whole model is two properties and one table:
//
//   confidence  how well it stuck last time (1–5, the journal built-in)
//   reviewed    when it was last actually revisited (a date, absent = never)
//
// and a due date of `(reviewed ?? date) + interval(confidence)`.
//
// DERIVED, NOT STORED. A due date is a function of two properties already on
// the note, so by the project's own test — a note exists to hold what only it
// holds — writing a third property back to disk would be storing an answer we
// can always recompute, and one that goes stale the moment either input
// changes. It also means this feature needs no migration: `reviewed` is
// additive, absent means never reviewed, and every note that already exists
// starts in the right state without being touched.

// Days until a note is due again, by how confident you were last time.
//
// The steps are roughly geometric, which is the one uncontroversial thing
// about spaced repetition: the better it stuck, the longer it can wait. They
// are deliberately NOT tuned — no ease factors, no per-note multipliers, no
// lapse handling. A schedule with parameters is a schedule that invites
// tinkering with the parameters, and the difference between this table and a
// well-tuned SM-2 is much smaller than the difference between reviewing and
// not.
//
// Out-of-range and missing values fall to the shortest interval rather than
// the longest: a note whose confidence you never set is one you have no
// evidence about, and the safe direction for no evidence is "look at it soon".
const INTERVALS: Record<number, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30,
};

export const MIN_INTERVAL_DAYS = 1;

export function reviewIntervalDays(confidence: unknown): number {
  const n = Math.round(Number(confidence));
  if (!Number.isFinite(n)) return MIN_INTERVAL_DAYS;
  return INTERVALS[n] ?? MIN_INTERVAL_DAYS;
}

// ISO date arithmetic on "YYYY-MM-DD" strings, done in UTC so a note doesn't
// change its due date when you cross a timezone. The strings never carry a
// time, so there is no clock to be wrong about — only a day count.
export function addDays(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

// What a review schedule needs from one note. Deliberately not PageInfo: this
// module is pure and shouldn't know about Obsidian's file objects, and naming
// the four fields it actually reads makes it obvious how little that is.
export interface ReviewInput {
  // The note's own date — when it was written. Lesson and Practice notes carry
  // one; Subject and Topic indexes deliberately do not.
  date?: unknown;
  reviewed?: unknown;
  confidence?: unknown;
  status?: unknown;
}

export interface ReviewSchedule {
  // The day it falls due: last touch + the interval its confidence earns.
  due: string;
  // Days until then; negative means overdue.
  inDays: number;
  // Whether it has ever been revisited, as opposed to merely written. Changes
  // what the row should say ("never reviewed" vs "last reviewed 3 weeks ago"),
  // which is a real distinction on a note you wrote months ago.
  everReviewed: boolean;
}

function isoOf(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

// The schedule for one note, or null when it has none.
//
// Null in three cases, and each is a deliberate exclusion rather than a
// failure:
//
//   • no date and never reviewed — there is nothing to count from. This is
//     what excludes Subject and Topic index notes, which carry no `date` by
//     design (otherwise buildTopicsTable would report a topic's creation day
//     as study activity). An index holds a current value; only a dated note
//     forms the series a schedule needs.
//   • completed — a finished note is not homework. Status is the user saying
//     so, and a queue that keeps surfacing things you have deliberately closed
//     is a queue you stop reading.
//   • paused — the same, said temporarily.
export function scheduleFor(
  note: ReviewInput,
  today: string
): ReviewSchedule | null {
  const status = typeof note.status === "string" ? note.status.trim() : "";
  if (status === "completed" || status === "paused") return null;

  const reviewed = isoOf(note.reviewed);
  const written = isoOf(note.date);
  const from = reviewed ?? written;
  if (!from) return null;

  const due = addDays(from, reviewIntervalDays(note.confidence));
  return {
    due,
    inDays: daysBetween(today, due),
    everReviewed: reviewed != null,
  };
}

export function isDue(schedule: ReviewSchedule): boolean {
  return schedule.inDays <= 0;
}

// One note in the queue, ready to render.
export interface ReviewItem<T> {
  note: T;
  schedule: ReviewSchedule;
}

// The due notes, most overdue first, then by how long since they were last
// touched — so a queue read top-down works through the coldest material rather
// than whatever happens to sort first by name.
//
// `limit` caps the list because the honest failure mode of a review queue is
// not "too few items" but "sixty items and no idea where to start". A capped
// list is a next action; an uncapped one is a backlog.
export function dueItems<T>(
  notes: T[],
  read: (note: T) => ReviewInput,
  today: string,
  limit?: number
): ReviewItem<T>[] {
  const out: ReviewItem<T>[] = [];
  for (const note of notes) {
    const schedule = scheduleFor(read(note), today);
    if (schedule && isDue(schedule)) out.push({ note, schedule });
  }
  out.sort((a, b) => a.schedule.inDays - b.schedule.inDays);
  return limit != null ? out.slice(0, limit) : out;
}

// How a row states its own urgency. No counts, no colour words, no "overdue by
// 12 days!" — the queue surfaces, it does not nag. An SRS that guilts you is
// the study-journal version of the "words written" stat already cut from the
// year view: trivial to compute, and exactly the kind of number that becomes a
// target.
export function describeDue(schedule: ReviewSchedule): string {
  const overdue = -schedule.inDays;
  if (overdue <= 0) return "due today";
  if (overdue === 1) return "due yesterday";
  if (overdue < 7) return `due ${overdue} days ago`;
  if (overdue < 14) return "due last week";
  if (overdue < 60) return `due ${Math.round(overdue / 7)} weeks ago`;
  return `due ${Math.round(overdue / 30)} months ago`;
}

// The counterpart for a note that is *not* due, used by the "nothing due" state
// so an empty queue can still say when it next won't be.
export function describeNext(schedule: ReviewSchedule): string {
  const days = schedule.inDays;
  if (days <= 0) return "due now";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  if (days < 14) return "next week";
  if (days < 60) return `in ${Math.round(days / 7)} weeks`;
  return `in ${Math.round(days / 30)} months`;
}

// The soonest schedule among notes that aren't due yet — what the empty state
// reports. Null when nothing is scheduled at all, which reads differently
// ("nothing to review" vs "all caught up, next on Tuesday") and should.
export function nextDue<T>(
  notes: T[],
  read: (note: T) => ReviewInput,
  today: string
): ReviewSchedule | null {
  let best: ReviewSchedule | null = null;
  for (const note of notes) {
    const schedule = scheduleFor(read(note), today);
    if (!schedule || isDue(schedule)) continue;
    if (!best || schedule.inDays < best.inDays) best = schedule;
  }
  return best;
}
