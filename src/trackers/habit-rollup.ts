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
// habit's OWN grain across the whole period.
//
// ── THE DEFECT THAT ANSWER SHIPPED WITH, AND ITS FIX (1.0.56) ────────────
//
// 1.0.55 asked `scopesFor(def)[0]`, on the reasoning that charts had already
// answered "which grain holds this tracker's readings". It had — for the
// trackers that name ONE. `scopesFor` answers through `diaryClassOf`, and that
// function returns `null` for `classes.length !== 1` *on purpose*: a tracker
// logged on days AND weeks has no single scope a chart could plot. So
// `scopesFor` returned `[]`, the row was skipped, and a habit on two grains —
// or a `kind: "any"` habit — vanished from every rollup with no row, no
// refusal and nothing in the card to say it had happened.
//
// Which is the reader's own ask: *"not all trackers are on daily entries"*.
// `grainsOf` reads `surface.classes` DIRECTLY, which is what that field has
// been since 2.57.8, and `resolveGrain` decides between them. `scopesFor` is
// left exactly as it is — it is right about charts, and the same `null` makes a
// multi-grain tracker unchartable, which is a different surface with its own
// round to come.
//
// Pure except for `habitRollupRows`, which is the one vault read and is kept to
// the end of the file for it.

import type { App } from "obsidian";
import { moment } from "../core/util";
import { frontmatterOf, periodCoverage } from "../core/util";
import { currentEntryKey, entryDateKey, labelForGrain } from "../diary/nav";
import { entriesOfGrain } from "../diary/lineage";
import type { DiaryPaths } from "../diary/lineage";
import {
  habitTypeOf,
  readHabitNumber,
  readHabitState,
  type HabitState,
  type HabitType,
} from "./habits";
import {
  CLASS_DEFS,
  TRACKER_CLASSES,
  isTrackerClass,
  type TrackerClass,
  type TrackerDef,
} from "./trackers";

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

// ── WHICH GRAIN A HABIT IS READ AT (1.0.56) ──────────────────────────────

// The character that puts a grain on a member of the list.
//
// A SUFFIX ON A MEMBER, NOT A SECOND FLAG. The argument is a flat comma list
// with one bare word in it and no namespace for another, so a rollup-wide
// `grain=weekly` has nowhere to go — and it would be the wrong shape anyway:
// the answer is PER HABIT, because a rollup drawing a daily habit beside a
// weekly one is the ordinary case. `@` costs what `no-strip` costs, and in the
// same way: a habit whose id contains an `@` followed by one of the five grain
// words reads as that habit at that grain. `lastIndexOf` is what keeps
// `@work@daily` resolving to the id `@work`.
export const GRAIN_MARK = "@";

// What the window hands back for a habit it cannot place.
export const NEEDS_GRAIN = "ambiguous";

// Every diary grain a habit is logged on, in canonical order.
//
// NOT `scopesFor`, AND THE FILE HEADER SAYS WHY AT LENGTH. This reads
// `surface.classes` — the SET, which is what that field has held since 2.57.8 —
// rather than asking a function whose whole contract is to refuse a set.
//
// `kind: "any"` IS EVERY GRAIN, which falls out rather than being decided: a
// tracker admitted everywhere is admitted on each of the five, and the effect
// in `resolveGrain` below is that such a habit reads at whatever grain the
// dashboard is. A journal surface is NOT a diary grain at all and returns
// nothing — the rollup lives on the four diary dashboards and a Study tracker
// has no slots there.
//
// FILTERED THROUGH `TRACKER_CLASSES` RATHER THAN RETURNED AS STORED, so the
// order is the canonical one however the settings checkboxes wrote it. The
// window groups by this and "the one it names" below picks the first.
export function grainsOf(def: TrackerDef): TrackerClass[] {
  const surface = def.surface;
  if (surface.kind === "any") return [...TRACKER_CLASSES];
  if (surface.kind !== "diary") return [];
  return TRACKER_CLASSES.filter((c) => surface.classes.includes(c));
}

// The grain this rollup reads a habit at, or why it cannot.
//
// `null`   — not a diary habit; it has no slots here and never had.
// a grain  — read it there.
// NEEDS_GRAIN — the reader has to say, and the card says how many are waiting.
//
// TAKES THE SET AND NOT THE DEFINITION, so the window can ask the same question
// of a seed. The card and the window must agree about which habits are waiting
// — a count drawn from one function and a list drawn from another is two
// answers that LOOK consistent for as long as nobody edits either.
//
// THE ORDER OF THE FOUR CLAUSES IS THE READER'S ANSWER, which was *"nothing —
// it must be chosen"* with the note *"or the dashboard own grain as default"*.
// Both, arranged so each is true where it is the better answer:
//
//   1. A CHOICE WINS, and a choice the habit cannot honour does not. A note
//      carrying `stretch@weekly` for a habit that has since been moved to days
//      only is a stale line, not an instruction.
//   2. ONE GRAIN NEEDS NO QUESTION. This is every habit in every vault today,
//      and it is exactly 1.0.55's behaviour — nothing changes denominator for
//      a habit that names one grain, which is the property worth protecting.
//   3. THE DASHBOARD'S OWN GRAIN, where the habit names it. A weekly rollup of
//      a daily+weekly habit reading its weekly entries is the answer somebody
//      would have given by hand, and it is invisible rather than surprising.
//   4. OTHERWISE, ASK. A daily+weekly habit on a QUARTERLY dashboard has two
//      defensible denominators and the plugin should not pick one silently —
//      which is what 1.0.55 did, by dropping the row.
export function resolveGrain(
  grains: readonly TrackerClass[],
  chosen: TrackerClass | undefined,
  dashboard: TrackerClass | null
): TrackerClass | typeof NEEDS_GRAIN | null {
  if (!grains.length) return null;
  if (chosen && grains.includes(chosen)) return chosen;
  if (grains.length === 1) return grains[0];
  if (dashboard && grains.includes(dashboard)) return dashboard;
  return NEEDS_GRAIN;
}

// The diary grain a dashboard's period unit names.
//
// DERIVED FROM `CLASS_DEFS`, not a fifth hand-written table. `periodNoun` is
// already "week"/"month"/"quarter"/"year" and `periodnav`'s `Unit` is already
// those four words, so the map exists and only needed reading. A `daily`
// dashboard has no period property and never reaches here.
export function grainOfUnit(unit: string | null): TrackerClass | null {
  if (!unit) return null;
  return TRACKER_CLASSES.find((c) => CLASS_DEFS[c].periodNoun === unit) ?? null;
}

/** One grain's rows, drawn under one heading. */
export interface HabitRollupGroup {
  grain: TrackerClass;
  rows: HabitRollupRow[];
}

// The rows gathered by the grain they are read at, in `TRACKER_CLASSES` order
// (1.0.61).
//
// HERE AND NOT IN THE VIEW, which is this pair of files' own division: the
// arithmetic is this module and `-view` is the DOM over it. An ordering is a
// claim about rows, and the suite has no DOM to check a claim made inside a
// loop body.
//
// A STABLE PARTITION AND NOT A SORT. A reader who moved Read above Gym with the
// window's chevron still sees that order inside the group — `habitRollupIds`
// writes an explicit list precisely so the sequence is theirs, and a comparator
// over grain indices would be free to reshuffle ties. Five passes over a list
// of habits, and stability is structural rather than a property of a comparator
// somebody may later change.
//
// AND IT IS THE ORDER THE WINDOW ALREADY MOVES THINGS IN. `HabitRollupEditor`'s
// chevrons swap a habit *"in its own group's members, not in `this.rows`"*, so
// a per-group order is the only one the UI can produce; the card was the one
// surface ignoring it. Nothing is rewritten — the stored list keeps whatever
// order it has, and this partitions it for drawing.
//
// NOT UNIFIED WITH THE EDITOR'S OWN `groupOf`, which groups SEEDS — their grain
// is `TrackerClass | null` and they need the `NEEDS_GRAIN` bucket this cannot
// have, since a habit waiting for a grain has no row at all.
export function rollupGroups(
  rows: readonly HabitRollupRow[]
): HabitRollupGroup[] {
  return TRACKER_CLASSES.map((grain) => ({
    grain,
    rows: rows.filter((r) => r.grain === grain),
  })).filter((g) => g.rows.length > 0);
}

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
  // Which grain to read a habit at, by id, for the habits the reader has
  // chosen one for (1.0.56). ABSENT IS NOT A DEFAULT — `resolveGrain` decides,
  // and most habits never appear here because they name one grain and there is
  // nothing to choose.
  grains: Record<string, TrackerClass>;
  strip: boolean;
}

export function parseHabitRollupArg(argument: string): HabitRollupAnswer {
  const parts = argument
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const flag = (p: string): boolean => p.toLowerCase() === NO_STRIP_FLAG;
  const ids: string[] = [];
  const grains: Record<string, TrackerClass> = {};
  for (const part of parts) {
    if (flag(part)) continue;
    // `lastIndexOf`, AND `> 0` RATHER THAN `>= 0`. A habit id may itself hold
    // an `@` — a reader's property named `@work` is legal YAML — so the cut is
    // taken at the LAST one, and a part that is nothing but a suffix keeps its
    // `@`. An unrecognised word after it is not a grain, which makes the whole
    // part an id: `read@someday` names a habit called `read@someday` rather
    // than being half-refused into a habit called `read`.
    const at = part.lastIndexOf(GRAIN_MARK);
    if (at > 0) {
      const word = part.slice(at + GRAIN_MARK.length).toLowerCase();
      if (isTrackerClass(word)) {
        const id = part.slice(0, at);
        ids.push(id);
        grains[id] = word;
        continue;
      }
    }
    ids.push(part);
  }
  return { ids, grains, strip: !parts.some(flag) };
}

/** The argument text for an answer, empty when the answer is the default. */
export function habitRollupArg(answer: HabitRollupAnswer): string {
  const parts = answer.ids
    .map((s) => s.trim())
    .filter(Boolean)
    .map((id) => {
      const grain = answer.grains[id];
      return grain ? `${id}${GRAIN_MARK}${grain}` : id;
    });
  if (!answer.strip) parts.push(NO_STRIP_FLAG);
  return parts.join(",");
}

/** The whole directive line, with no `:` at all when there is nothing to say. */
export function habitRollupLine(answer: HabitRollupAnswer): string {
  const arg = habitRollupArg(answer);
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
  // The same stored value read as a number, for a `number` habit (1.0.56).
  // BOTH READINGS, FROM ONE WALK, and deliberately not a union: the walk is
  // the expensive part and a row knows its own `type`, so the column that
  // draws it reads the field it means and ignores the other. `HabitReading`
  // carries the pair for the same reason.
  value: number | null;
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
  // Which half of the card this row is, 1.0.56. A `boolean` row reports a rate
  // and streaks; a `number` row reports a total, a mean and how many slots
  // carried a reading at all.
  type: HabitType;
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
  // ── the number half, meaningless on a boolean row ──────────────────────
  //
  // `logged` IS NOT `written`. A day with an entry that never answered this
  // habit is written and not logged, and on a number habit that difference is
  // the whole denominator: a mean over elapsed days answers a question nobody
  // asked ("how much per day of the month"), while a mean over logged days
  // answers the reader's ("how much on the days I recorded it").
  logged: number;
  total: number;
  // `total / logged`, and `null` when nothing was logged — the same refusal
  // `rate` makes, for the same reason.
  mean: number | null;
  // The tracker's own unit, carried so the drawn row does not read the
  // registry again. `null` when the definition names none.
  unit: string | null;
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
  window: { start: string; end: string } | null,
  // The grains the reader chose, by habit id — the window's answer, straight
  // off the directive.
  chosen: Readonly<Record<string, TrackerClass>> = {},
  // The grain of the dashboard this rollup is drawn on, which is the fallback
  // for a habit that lives on several and names this one among them.
  dashboard: TrackerClass | null = null
): HabitRollupRow[] {
  const grainOf = new Map<string, TrackerClass>();
  for (const def of defs) {
    // `resolveGrain`, NOT `scopesFor`. Until 1.0.56 this line read
    // `scopesFor(def)[0]`, which answers through `diaryClassOf` and so returned
    // nothing at all for a habit on two grains or on `kind: "any"` — the habit
    // drew no row, and no refusal either. See this module's head.
    const grain = resolveGrain(grainsOf(def), chosen[def.id], dashboard);
    if (grain == null || grain === NEEDS_GRAIN) continue;
    grainOf.set(def.id, grain);
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
        value: fm ? readHabitNumber(fm[def.id]) : null,
        written: fm != null,
      };
    });
    const done = slots.filter((s) => s.state === 1).length;
    const numbers = slots
      .map((s) => s.value)
      .filter((v): v is number => v != null);
    const total = numbers.reduce((sum, v) => sum + v, 0);
    rows.push({
      id: def.id,
      label: def.label || def.id,
      grain,
      type: habitTypeOf(def),
      slots,
      done,
      written: slots.filter((s) => s.written).length,
      ...habitRuns(slots),
      rate: slots.length ? done / slots.length : null,
      logged: numbers.length,
      total,
      // `numbers.length` AND NOT `total`, so a window of nothing but zeroes
      // reads `avg 0` rather than refusing to average.
      mean: numbers.length ? total / numbers.length : null,
      unit: def.unit ?? null,
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
  answer: HabitRollupAnswer
): string[] | null {
  const want = current.trim();
  const to = Math.min(body.to, lines.length);
  for (let i = Math.max(0, body.from); i < to; i++) {
    const line = lines[i];
    if (line.trim() !== want) continue;
    const indent = line.slice(0, line.length - line.trimStart().length);
    const next = `${indent}${habitRollupLine(answer)}`;
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
//
// A CHOSEN GRAIN ALSO FORCES THE LIST, and that is 1.0.56's addition. The
// collapse is "say nothing and follow the vault", and a grain is something to
// say — so an answer carrying one is written out even when every habit is
// ticked in registry order. The alternative is a chooser the window accepts and
// the note drops, which is the same failure a reorder would have been.
export function habitRollupAnswer(
  rows: readonly { id: string; shown: boolean; grain?: TrackerClass | null }[],
  registry: readonly string[],
  strip: boolean
): HabitRollupAnswer {
  const shown = rows.filter((r) => r.shown);
  const grains: Record<string, TrackerClass> = {};
  for (const row of shown) if (row.grain) grains[row.id] = row.grain;
  const ids = shown.map((r) => r.id);
  const same =
    !Object.keys(grains).length &&
    ids.length === registry.length &&
    ids.every((id, i) => id === registry[i]);
  return same ? { ids: [], grains: {}, strip } : { ids, grains, strip };
}
