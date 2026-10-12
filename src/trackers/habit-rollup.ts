// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Habits rollup's arithmetic (1.0.55).
//
// ── THE HALF OF THE LADDER THAT HAD A REGISTRY AND NO ROLLUP ──────────────
//
// `fields.ts` says it about itself: *"Trackers have a registry — declared once,
// normalised, surface-scoped, synced into templates, mirrored into Diary.base,
// reachable by id from anywhere — and regions had a convention that held
// because exactly one caller ever needed it."* And the convention is the half
// that got the ladder: `recap` and `entry-rollup` aggregate the authored
// regions across a period, while nothing in the vault answered *what did my
// habits do this month*.
//
// THIS IS NOT THE CHARTS SECTION AND DOES NOT REPLACE IT. `chronoanvil-charts`
// is a manager of series the reader configured, answering what shape a number
// made over time. This answers what a habit DID over one period, in the
// vocabulary a habit has — a rate, a run, a calendar of days kept — which is
// `diary-dashboard-sections.ts`'s own distinction about `sleep-summary`:
// *"'shortest night' is an extreme rather than a trend. Neither is a line a
// chart draws."*
//
// ── THE GRAIN COMES OFF THE TRACKER, NOT OFF THE DASHBOARD ───────────────
//
// The fields ladder reads ONE RUNG DOWN — a month reads weeks (1.0.48) —
// because a field is authored at every grain. A tracker is logged on its own
// surface and nowhere else, so a monthly dashboard rolling up weekly entries
// would read four notes that hold no readings at all. Every row here reads the
// habit's OWN grain across the whole period, which is the question
// `scopesFor` already answers for charts.
//
// Pure except for `habitRollupRows`, which is the one vault read and is kept to
// the end of the file for it.

import type { App } from "obsidian";
import { moment } from "../core/util";
import { frontmatterOf, periodCoverage } from "../core/util";
import { scopesFor } from "../charts/charts";
import { currentEntryKey, entryDateKey, labelForGrain } from "../diary/nav";
import { entriesOfGrain } from "../diary/lineage";
import type { DiaryPaths } from "../diary/lineage";
import { readHabitState, type HabitState } from "./habits";
import { CLASS_DEFS, type TrackerClass, type TrackerDef } from "./trackers";

export const HABIT_ROLLUP_DIRECTIVE = "habit-rollup";

// Anchored at both ends: `habit-rollup-weekly` would be another keyword, and a
// `\b` alone would match it. The argument is deliberately not part of this —
// the catalogue rule is that `locate` finds a section by its KEYWORD, so a
// reader who hides three habits still has a section the editor can find.
export const HABIT_ROLLUP_PROBE = new RegExp(
  `^${HABIT_ROLLUP_DIRECTIVE}(:|\\s*$)`,
  "m"
);

// The one flag, as a word in the argument rather than a `#token`.
//
// WHY NOT A TOKEN. `withToken` returns the line untouched when the argument has
// no key (`directive-grammar.ts`: `if (!key) return line`), and this
// directive's ordinary form has no argument at all — so the token grammar
// cannot express "every habit, no strip". A word in a comma list is the
// `tasks-table:,period` idiom, which is the plugin's established spelling for
// *no argument, one flag*, and it costs what that one costs: a habit whose id
// is literally `no-strip` reads as the flag. Said here rather than discovered.
export const NO_STRIP_FLAG = "no-strip";

/** What a `habit-rollup` line asks for. */
export interface HabitRollupAnswer {
  // Empty means EVERY habit THE VAULT HAS, which is why ticking them all in the
  // window writes nothing: an explicit list would silently exclude the habit the
  // reader defines next month, and nothing on the dashboard would say why the
  // new one never appeared. `default writes NOTHING` — the rule the attachment
  // formats landed on, pointed at membership.
  //
  // NOT "every habit with a reading in this period", which was the other
  // candidate and is a worse default for one reason: a habit kept in July and
  // dropped in August would silently leave the August card, which is the month
  // a reader most wants to see it missing from.
  ids: string[];
  strip: boolean;
}

export function parseHabitRollupArg(argument: string): HabitRollupAnswer {
  const parts = argument
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const flag = (p: string): boolean => p.toLowerCase() === NO_STRIP_FLAG;
  return { ids: parts.filter((p) => !flag(p)), strip: !parts.some(flag) };
}

/** The argument text for an answer, empty when the answer is the default. */
export function habitRollupArg(
  ids: readonly string[],
  strip: boolean
): string {
  const parts = ids.map((s) => s.trim()).filter(Boolean);
  if (!strip) parts.push(NO_STRIP_FLAG);
  return parts.join(",");
}

/** The whole directive line, with no `:` at all when there is nothing to say. */
export function habitRollupLine(
  ids: readonly string[],
  strip: boolean
): string {
  const arg = habitRollupArg(ids, strip);
  return arg ? `${HABIT_ROLLUP_DIRECTIVE}:${arg}` : HABIT_ROLLUP_DIRECTIVE;
}

// ── the period, slot by slot ──────────────────────────────────────────────

/** One entry-sized step of a grain: the week of a daily habit is seven. */
export interface HabitSlot {
  // The grain's own date key — `YYYY-MM` for a monthly habit, a day otherwise,
  // exactly as `currentEntryKey` and `entryDateKey` both spell it, so a slot
  // and the note that fills it meet on one string.
  key: string;
  // The slot's FIRST DAY, which is what the window is compared against. A
  // period sits on a timeline at its own start — `pointDate`'s rule, and the
  // reason a week straddling the 1st of a month is that month's slot only when
  // its Monday is.
  date: string;
  label: string;
}

// A window that cannot terminate the loop is a hung render, so the walk is
// capped. 366 days is the longest honest answer (`daysInYear`), and the margin
// is there so the cap can never be the thing that truncates a real year.
const SLOT_CAP = 400;

// Every slot of `grain` whose first day falls in [startIso, endIso].
//
// THE STEPPING UNIT IS NOT THE SNAPPING UNIT, which `periodsAround` found out
// the hard way: `CLASS_DEFS.weekly.unit` is `isoWeek` so that `startOf` lands
// on a Monday, and `add` has no such unit — it would step by nothing and hand
// back one Monday repeated. Stepped by a plain week and snapped afterwards.
//
// STEPPED FROM THE WINDOW'S START RATHER THAN FROM THE SLOT BEFORE IT, for
// `periodsAround`'s reason: moment clamps a month-length step to the landing
// month, so walking off one origin cannot skip February.
export function habitSlots(
  grain: TrackerClass,
  startIso: string,
  endIso: string
): HabitSlot[] {
  const from = moment(startIso);
  if (!from.isValid() || !moment(endIso).isValid() || endIso < startIso) {
    return [];
  }
  const snap = CLASS_DEFS[grain].unit;
  const step = snap === "isoWeek" ? "weeks" : `${snap}s`;
  const out: HabitSlot[] = [];
  const seen = new Set<string>();
  for (let n = 0; n < SLOT_CAP; n++) {
    const at = from.clone().add(n, step).startOf(snap);
    const date = at.format("YYYY-MM-DD");
    if (date > endIso) break;
    // A LEADING PARTIAL SLOT IS NOT THIS PERIOD'S. The first step of a monthly
    // dashboard snapped to an ISO week lands in the previous month, and that
    // week's readings belong to the dashboard that holds its Monday.
    if (date < startIso) continue;
    const key = currentEntryKey(grain, at);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ key, date, label: labelForGrain(grain, key) });
  }
  return out;
}

// The part of a period that has actually happened, as a window to read.
//
// `null` FOR A PERIOD THAT HAS NOT BEGUN, which a dashboard can be scoped to by
// one click of its navigator. Not an empty window and not the whole one: a
// quarter nobody has lived yet has no slots, and a rate over it is a claim
// about nothing.
//
// CLIPPED TO TODAY OTHERWISE, and `periodCoverage` is both the arithmetic and
// the argument — *"a partial period silently compared against a whole one is
// the most obvious way for a stats page to mislead"*. It was written for the
// review dashboards' "N of M days logged" and this is the same denominator
// question asked about one habit.
export function rollupWindow(
  startIso: string,
  endIso: string,
  todayIso: string
): { start: string; end: string } | null {
  const cover = periodCoverage(startIso, endIso, todayIso);
  if (!cover.started) return null;
  return { start: startIso, end: cover.partial ? todayIso : endIso };
}

export interface HabitSlotReading extends HabitSlot {
  state: HabitState;
  // Whether that slot has an entry at all — 1.0.54's distinction, and the
  // reason this does not read `collectPoints`: the collector skips a null
  // value, so an unwritten day and an unanswered one arrive as the same
  // absence, and the strip has to be able to tell them apart.
  written: boolean;
}

export interface HabitRollupRow {
  id: string;
  label: string;
  grain: TrackerClass;
  // Dense and in order, one per elapsed slot — which is what makes a run over
  // this array a run over the calendar. See `habitRuns`.
  slots: HabitSlotReading[];
  done: number;
  // Slots that have an entry, done or not. Not the rate's denominator; it is
  // what the tooltip says when the two numbers disagree.
  written: number;
  current: number;
  best: number;
  // `done / slots.length`, and `null` for a period that has not started — a
  // ring drawn from 0/0 is a claim about nothing.
  rate: number | null;
}

// The current and longest runs of kept slots.
//
// A RUN OVER THIS ARRAY IS A RUN OVER CONSECUTIVE DAYS, because `habitSlots`
// emits every slot including the empty ones. That is the whole reason the dense
// array exists, and it is why neither of the two functions that already count
// streaks is called here:
//
//   `streakStats` (charts.ts) counts consecutive POINTS, and `collectPoints`
//   emits no point for a day that was not answered — so a habit done on Monday
//   and Friday reads as a streak of two.
//
//   `longestStreak` (year-stats.ts) compares `date + 1 day`, which is right for
//   a daily habit and wrong for every coarser one: consecutive months are not
//   adjacent days. (On the daily grain the two agree exactly, and the suite
//   cross-checks them for that reason.)
//
// An unwritten slot breaks the run, like an unanswered one: nothing in the
// vault says the habit was kept that day.
export function habitRuns(slots: readonly { state: HabitState }[]): {
  current: number;
  best: number;
} {
  let best = 0;
  let run = 0;
  for (const slot of slots) {
    run = slot.state === 1 ? run + 1 : 0;
    if (run > best) best = run;
  }
  return { current: run, best };
}

// ── the one vault read ────────────────────────────────────────────────────

// Each habit's row, read across the window.
//
// ONE WALK PER GRAIN, NOT ONE LOOKUP PER HABIT PER DAY. 1.0.54's week strip
// asks `locateEntry` seven times, which is right for seven days and is 365 × N
// here. Every habit of one grain reads the same notes, so the frontmatter is
// gathered once and the habits read their own property out of it — which also
// means the cost does not grow with the number of habits.
//
// DATED BY THE ENTRY'S OWN KEY (`entryDateKey`) rather than by its filename.
// `collectPoints` dates by the basename because a chart needs an x for a note a
// reader may have renamed; this needs to meet `habitSlots` on `currentEntryKey`'s
// spelling, and those two functions are each other's counterpart by
// construction. A note with no readable key is not in any slot, and that is the
// same answer the nav strip gives it.
export function habitRollupRows(
  app: App,
  paths: DiaryPaths,
  defs: readonly TrackerDef[],
  window: { start: string; end: string } | null
): HabitRollupRow[] {
  const grainOf = new Map<string, TrackerClass>();
  for (const def of defs) {
    // The FOLDER scope is first in `scopesFor` and the bucketed one second, so
    // `[0]` is never `daily-by-month` — but the union says it could be, and a
    // cast is the thing that stops being true when that list changes.
    const scope = scopesFor(def)[0];
    if (scope == null || scope === "daily-by-month") continue;
    grainOf.set(def.id, scope);
  }

  const read = new Map<TrackerClass, Map<string, Record<string, unknown>>>();
  for (const grain of new Set(grainOf.values())) {
    const byKey = new Map<string, Record<string, unknown>>();
    for (const file of entriesOfGrain(app, paths, grain)) {
      const fm = frontmatterOf(app, file);
      const key = entryDateKey(fm, grain);
      if (key) byKey.set(key, fm);
    }
    read.set(grain, byKey);
  }

  const rows: HabitRollupRow[] = [];
  for (const def of defs) {
    const grain = grainOf.get(def.id);
    if (grain == null) continue;
    const byKey = read.get(grain) ?? new Map();
    const slots = (
      window ? habitSlots(grain, window.start, window.end) : []
    ).map((slot) => {
      const fm = byKey.get(slot.key);
      return {
        ...slot,
        state: fm ? readHabitState(fm[def.id]) : null,
        written: fm != null,
      };
    });
    const done = slots.filter((s) => s.state === 1).length;
    rows.push({
      id: def.id,
      label: def.label || def.id,
      grain,
      slots,
      done,
      written: slots.filter((s) => s.written).length,
      ...habitRuns(slots),
      rate: slots.length ? done / slots.length : null,
    });
  }
  return rows;
}

// ── the write behind the window ───────────────────────────────────────────

// The note with this section's directive rewritten. `null` when nothing would
// change, or when the line is no longer where the caller says it is.
//
// SHAPED ON `noteWithBandEdit`, which is the same problem one release earlier:
// everything that decides what the file should say is here and takes strings,
// and the caller does the reading and the writing. A `null` covers both "the
// answer is what is already there" and "this block has no line to splice" — the
// caller tells them apart by asking first, which is what `apply` does.
//
// MATCHED ON THE LINE AS RENDERED rather than on the keyword alone, because a
// dashboard may hold two of these and a window opened on one must not rewrite
// the other. The indentation is kept: a directive inside a list item is still
// that reader's line.
export function noteWithHabitRollup(
  lines: readonly string[],
  body: { from: number; to: number },
  current: string,
  ids: readonly string[],
  strip: boolean
): string[] | null {
  const want = current.trim();
  const to = Math.min(body.to, lines.length);
  for (let i = Math.max(0, body.from); i < to; i++) {
    const line = lines[i];
    if (line.trim() !== want) continue;
    const indent = line.slice(0, line.length - line.trimStart().length);
    const next = `${indent}${habitRollupLine(ids, strip)}`;
    if (next === line) return null;
    const out = [...lines];
    out[i] = next;
    return out;
  }
  return null;
}

// The id list a window's rows come to, given what the registry offers.
//
// EVERY HABIT TICKED, IN REGISTRY ORDER, IS THE EMPTY LIST — which is the whole
// reason this is a function rather than `rows.filter(shown).map(id)`. An
// explicit list of everything looks identical on screen and is not the same
// answer: it silently excludes the habit the reader defines next month, and
// nothing on the dashboard would say why the new one never appeared.
//
// A REORDER MUST BE WRITTEN OUT, and that is the one place the two rules meet.
// Order is only expressible as a list, so a reader who ticks everything and
// moves one row gets the full list — the alternative is a gesture the window
// accepts and the note cannot hold.
export function habitRollupIds(
  rows: readonly { id: string; shown: boolean }[],
  registry: readonly string[]
): string[] {
  const shown = rows.filter((r) => r.shown).map((r) => r.id);
  const same =
    shown.length === registry.length &&
    shown.every((id, i) => id === registry[i]);
  return same ? [] : shown;
}
