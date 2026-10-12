// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Habits window's model.
//
// WHY THIS EXISTS, AND WHY IT IS SHAPED LIKE `tags.ts`. A diary entry's
// booleans collapse into one Habits cell, and until now that cell was a
// read-only consequence of the note's `tracker:` lines: the only way to put a
// habit on an entry was the generic "+ Add tracker" tile, the only way to take
// one off was the × on its chip, and a cell holding more habits than two rows
// could show simply CLIPPED the rest — `max-height: 40px; overflow: hidden` on
// `.ca-journal-habits-row`, with nothing to say so. Tags had the same three
// gaps and closed them with a window; this is the same answer for the same
// reasons, so the arithmetic lives beside the DOM rather than in it.
//
// WHERE IT DIFFERS FROM TAGS, WHICH IS THE WHOLE DESIGN PROBLEM. A tag is a
// string in one note's frontmatter: adding one touches that note and nothing
// else. A habit is a `TrackerDef` in the registry plus a `tracker:<id>` line in
// the note plus a frontmatter property holding the reading — three places, two
// of them shared with every other entry in the vault. So this module keeps the
// three apart:
//
//   `habitsForSurface` / `habitsInFolder` — what the registry offers this note.
//   `HabitDraft` and its edits               — membership and readings, per note.
//   `newHabitDef`                            — the registry row a typed name
//                                              becomes, mirroring the seed
//                                              `tracker-picker.ts` hands the
//                                              editor on "+ New tracker…".
//
// WHAT A HABIT IS, AS OF 1.0.56, AND WHY THE WORD MOVED. It was "a boolean
// tracker" through 1.0.55, and the reader has widened it: *"Habits should no
// longer mean just the boolean tracker. Habits can be either boolean or number
// trackers."* Both answer the same question about a day — did I, and how much —
// and both were being drawn in a 66px cell that suits neither. `HABIT_TYPES` is
// that sentence, read by everything downstream, and `isHabitType` is the only
// place a type is compared against it.
//
// THE WIDENING IS NOT UNIFORM, AND THE ONE EXCEPTION IS THE CHIP. A habit's
// resting place in the grid is a 14px chip with a tick in it, and a number has
// no tick; so the grid's fold-in asks `def.type === "boolean"` directly
// (`widgets/index.ts`) and a number habit keeps its own stepper cell until a
// Habits section takes both off the grid. Everything else — this window, the
// section, the rollup, the folder cloud — asks `isHabitType`.
//
// Nothing here writes. Every function is total and pure over its arguments,
// which is what lets the window hold a draft, let the reader remove four
// habits and change their mind, and touch the vault exactly once at Save.

import type { App } from "obsidian";
import { pagesUnder } from "../core/query";
import { frontmatterOf, moment } from "../core/util";
import { locateEntry } from "../diary/lineage";
import type { DiaryPaths } from "../diary/lineage";
import {
  directiveAllowedOn,
  directiveTrackerId,
  noteHasDirective,
  noteTrackerDirectives,
} from "./entry-trackers";
import {
  diaryClassOf,
  diarySurface,
  propertyNameFromLabel,
  surfaceAdmits,
  uniquePropertyName,
  type TrackerDef,
  type TrackerSurface,
  type TrackerType,
} from "./trackers";

// A habit's three states, as the chip cycles them: unset, done, not-done.
//
// `null` IS NOT `0`, and the distinction is the reason this is not a boolean.
// A habit nobody answered today is not a habit answered "no" — the streak
// charts count runs of `1`, `Diary.base` shows an empty cell rather than a tidy
// zero, and the rollup's strip draws the unanswered day instead of closing the
// gap up. `wireHabit`'s cycle has always been three-state; this is that parse,
// lifted out of it so the window reads a value exactly as the chip does.
//
// WHAT A RATE DIVIDES BY IS A SEPARATE QUESTION, and this comment used to
// answer it wrongly — "divides by the days that were ANSWERED". The rollup
// divides by the days that have ELAPSED (`HabitRollupRow.rate`), which is the
// only denominator a reader can check: 23 of 31 is a month they can count, and
// 23 of 23 would report a perfect month to somebody who logged three weeks and
// stopped. `written` is kept beside it so the card can still say how much of
// the period was filled in at all.
export type HabitState = 1 | 0 | null;

// What a frontmatter value means as a habit reading.
//
// FORGIVING IN THE TWO WAYS A VAULT IS. ChronoAnvil's own checkbox writes `1`
// and `0`, but a reader who ticked the property in Obsidian's panel wrote
// `true`, and one who imported from elsewhere may have written `"1"`. All of
// them are what that entry MEANS, so all of them are read — and only numbers
// are ever written back, which is the same one-way widening `readTags` applies
// to the three shapes of a `tags:` property.
export function readHabitState(value: unknown): HabitState {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return n >= 0.5 ? 1 : 0;
}

// What a frontmatter value means as a NUMBER habit's reading (1.0.56).
//
// `buildStepper`'s OWN COERCION, LIFTED OUT OF IT. That control already has to
// decide what `""`, `"4.2"` and `"about three"` mean before it can add 1 to
// them, and its answer — *"a non-numeric or empty stored value shows as '—' and
// starts stepping from def.min/0"* — is the only answer the rest of the plugin
// may give, or a reader's strip and a reader's stepper would disagree about
// whether Tuesday was logged.
//
// A ZERO IS A READING. `0` is falsy and finite, and a habit logged as zero
// kilometres is a day that was answered; the rollup counts it in `logged` and
// the sparkline draws it at the floor. That is the whole reason this returns
// `number | null` rather than leaning on `|| null` anywhere.
export function readHabitNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// The next state in the cycle the chip and the window share.
export function nextHabitState(state: HabitState): HabitState {
  return state == null ? 1 : state === 1 ? 0 : null;
}

// How a state reads to somebody who cannot see the box.
export function describeHabitState(state: HabitState): string {
  return state === 1 ? "done" : state === 0 ? "not done" : "unset";
}

// ── which habits this note may carry ──────────────────────────────────────

// ── WHICH TRACKER TYPES ARE HABITS (1.0.56) ───────────────────────────────
//
// TWO, AND THE LIST IS HERE SO NOTHING COUNTS THEM BY HAND. A boolean asks
// *did I*, a number asks *how much*, and the reader's call is that both are
// habits. The other five are not, each for its own reason: a `scale` was
// offered and withdrawn (*"I changed my mind on emoji scale"*), a `time` and a
// `date` answer *when* rather than *whether*, a `select` is a category, and
// `tags` is a list that already has a cell of its own.
//
// AN ARRAY RATHER THAN A UNION BECAUSE THE WINDOW ITERATES IT. The add row
// offers one control per member, so a third type would be a row in a window
// rather than an edit to a condition.
export const HABIT_TYPES = ["boolean", "number"] as const;

export type HabitType = (typeof HABIT_TYPES)[number];

export function isHabitType(type: TrackerType): type is HabitType {
  return (HABIT_TYPES as readonly TrackerType[]).includes(type);
}

// Every registered habit a note of this surface is allowed to log.
//
// A HABIT IS A BOOLEAN OR A NUMBER — `isHabitType` above, which is the same
// test `habitFromDirective` applies to a note's line, written once so the
// window cannot offer a row the section would refuse to draw. `derived` is
// excluded for the reason `TrackerDef.derived` gives: a computed value has no
// input widget, so there is nothing to tick and nothing to step.
//
// SURFACE-FILTERED, because the alternative is a window that offers a monthly
// habit on a Tuesday and then watches the add fail its own check. `null` means
// a note whose surface could not be resolved, where nothing is refused —
// matching `directiveAllowedOn`'s own answer to the same argument.
export function habitsForSurface(
  trackers: readonly TrackerDef[],
  surface: TrackerSurface | null
): TrackerDef[] {
  return trackers.filter(
    (t) =>
      isHabitType(t.type) &&
      !t.derived &&
      (surface == null || surfaceAdmits(t.surface, surface))
  );
}

// ── THE SECTION'S OWN WORD (1.0.54) ───────────────────────────────────────
//
// One keyword, read by three things: the entry catalogue composes it, the
// dispatcher draws it, and the Habits CELL stands down when it is present. That
// last reader is what makes the grid's cell *derived* rather than migrated —
// removing the line puts the cell back, with every chip and every reading
// intact, because nothing was ever rewritten to take it away.
export const HABITS_DIRECTIVE = "habits";

// The catalogue's probe. Anchored whole: `habits` is a word, and a `habits-week`
// keyword invented later must not answer for this one.
export const HABITS_PROBE = new RegExp(`^${HABITS_DIRECTIVE}$`, "m");

// Does this note draw a Habits section?
//
// FENCE-SCOPED, THROUGH `noteHasDirective`, AND THE REGEX ABOVE IS NOT ENOUGH
// HERE. The catalogue's probe runs over a structure parse and is the shape every
// other section's is; this one is asked of the raw note by the renderer, where a
// false positive silently empties a reader's Habits cell. `noteHasDirective`
// already carries the argument — *a directive named in prose is not a
// directive, the shipped documentation note quotes half the catalogue* — and
// this release puts the word `habits` in exactly that document.
export function noteHasHabitsSection(text: string): boolean {
  return noteHasDirective(
    text.split("\n"),
    (line) => line.trim() === HABITS_DIRECTIVE
  );
}

// ── WHICH OF A NOTE'S LINES IS A HABIT (1.0.54) ───────────────────────────
//
// THE TEST ABOVE, ASKED OF A DIRECTIVE INSTEAD OF A REGISTRY ROW. This was a
// private method of the widget dispatcher (`habitTrackerFor`) and the claim one
// screen up — *the same test `habitTrackerFor` applies, written once here* —
// was half true: the two agreed, in two places, by inspection. They are one
// function now, because the Habits section asks the question about a note it is
// not drawing the grid of, from a different fence, and a third copy would be
// the one that drifts.
//
// A BARE `|Label` IS CUT FIRST, for the reason the chip's own label note gives:
// `tracker:Medication|Morning meds` is that habit's line and the override names
// the chip, not the tracker.
//
// THE SURFACE TEST IS WHY A MISPLACED BOOLEAN IS NOT A HABIT HERE. A monthly
// boolean written onto a daily entry takes the ordinary tracker path and draws
// its visible refusal; answering `null` is what leaves it there to do that.
//
// BOTH HABIT TYPES, AS OF 1.0.56, AND THE GRID STILL ASKS A SECOND QUESTION.
// This says *is this line a habit*; the grid's fold-in then asks *and is it a
// boolean*, because only a boolean becomes a chip. Widening here is what makes
// a number vacate its cell when a Habits section is on the note — the two
// questions are separate on purpose, and `widgets/index.ts` carries the note
// about why.
export function habitFromDirective(
  trackers: readonly TrackerDef[],
  line: string,
  surface: TrackerSurface | null
): TrackerDef | null {
  const body = line.split("|")[0].trim();
  const id = directiveTrackerId(body);
  if (!id) return null;
  const def = trackers.find((t) => t.id === id);
  if (!def || !isHabitType(def.type) || def.derived) return null;
  if (!directiveAllowedOn(trackers, body, surface)) return null;
  return def;
}

// One habit a note carries, and the line it carries it on.
//
// `directive` IS CARRIED RATHER THAN DERIVED from the id, because the line in
// the note is what a remove has to match — rebuilding `tracker:<id>` from the
// definition would hand the write a string a hand-labelled note does not
// contain, and the row would silently fail to come off.
export interface HabitEntry {
  def: TrackerDef;
  directive: string;
}

// What a habit is CALLED on this note.
//
// AN INLINE `|Label` WINS, which is the chip's own rule — *"an inline
// `tracker:<id>|Label` override names the chip, exactly as it would have named
// the eyebrow"* — and a bare trailing `|` names nothing, so it falls back
// rather than producing a nameless row. Here rather than at the two surfaces
// that need it: the Habits cell and the Habits section must agree about a
// renamed habit or the same entry has two names for one thing.
export function habitLabelOf(def: TrackerDef, directive: string): string {
  const bar = directive.indexOf("|");
  const override = bar === -1 ? "" : directive.slice(bar + 1).trim();
  return override || def.label || def.id;
}

// Every habit this note draws, in document order.
//
// EVERY FENCE, NOT THE MARKED REGION, which is `noteTrackerDirectives`' own
// distinction and the right one here for its stated reason: the renderer walks
// fences rather than regions, so a habit hand-placed outside the managed
// markers is one the reader can see and tick. A section that listed only the
// region's would be a list that disagrees with the note.
export function habitsOnNote(
  trackers: readonly TrackerDef[],
  text: string,
  surface: TrackerSurface | null
): HabitEntry[] {
  const out: HabitEntry[] = [];
  for (const directive of noteTrackerDirectives(text.split("\n"))) {
    const def = habitFromDirective(trackers, directive, surface);
    if (def) out.push({ def, directive });
  }
  return out;
}

export interface HabitUse {
  id: string;
  label: string;
  // Which of the two the count is a sentence about — see the note below on why
  // `4` means two different things for the two types.
  type: HabitType;
  count: number;
}

// Each habit, with how many notes beneath `folder` have logged it done.
//
// DIRECTORY-SCOPED AND ANSWERED-ONLY, for the two reasons `tagsInFolder` gives
// about its own survey. The useful list when logging a Tuesday is what the rest
// of the week already tracks, not every habit the vault has ever defined; and
// the number beside it has to mean something, so it counts the entries that
// ANSWERED rather than the ones that carry the property — a habit seeded blank
// onto thirty entries is not a habit used thirty times.
//
// "ANSWERED" IS NOT "DONE", AND 1.0.56 IS WHY. Through 1.0.55 this counted
// `=== 1`, which is the only sentence a boolean has. A number habit has no
// "yes": thirty entries logging 4.2km are thirty uses, and a count of zero
// beside the busiest habit in the vault would be the pill lying about its own
// list. `habitAnswered` is the per-type test, and the cloud's `title` says
// which word it means — because for a boolean the two differ, and a reader
// looking at `Gym 4` is owed the knowledge that four is how many days it was
// kept and not how many days it was asked.
//
// Reads frontmatter through the metadata cache, so a habit logged before this
// window existed still counts.
export function habitsInFolder(
  app: App,
  habits: readonly TrackerDef[],
  folder: string
): HabitUse[] {
  const counts = new Map<string, number>();
  for (const { fm } of pagesUnder(app, folder)) {
    for (const h of habits) {
      // A boolean still counts the days it was KEPT, which is the stronger and
      // more useful statement where the type can make it; a number counts the
      // days it was logged at all, which is the only one it can.
      const hit =
        h.type === "number"
          ? readHabitNumber(fm[h.id]) != null
          : readHabitState(fm[h.id]) === 1;
      if (hit) counts.set(h.id, (counts.get(h.id) ?? 0) + 1);
    }
  }
  return habits
    .map((h) => ({
      id: h.id,
      label: h.label || h.id,
      type: h.type === "number" ? ("number" as const) : ("boolean" as const),
      count: counts.get(h.id) ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

// ── THE WEEK BEHIND A HABIT (1.0.54) ──────────────────────────────────────
//
// A chip says whether a habit was done TODAY, which is one bit about a thing
// nobody keeps for one day. The Habits section draws the week it sits in, and
// this is the arithmetic for it.
//
// READ, NEVER STORED. Each day's answer is already written — it is a property
// in that entry's frontmatter, put there by the same box this section draws —
// so a cached copy on the host note would be a second truth that goes stale the
// moment yesterday is edited. The read is cheap enough to do every paint:
// `locateEntry` resolves a name and the metadata cache answers for the
// frontmatter, so this is SEVEN CACHE LOOKUPS AND NO FILE READS, and it costs
// the same on a vault of ten entries as on one of ten thousand. That is why
// this and not `pagesUnder` (which walks the folder, as `habitsInFolder` must,
// because its question is about every note) or `collectPoints` (which reads a
// whole grain's readings to plot them).
//
// THE WEEK IS THE ISO WEEK, Monday first, and it is the Days calendar's own
// definition — `monthGrid` lays its rows out from `startOf("isoWeek")` for the
// reason that every row of a month calendar then IS a week. A habit strip that
// started on Sunday would disagree with the calendar in the Link to diary
// window about which days are "this week", in a plugin where a weekly entry is
// an ISO week by `CLASS_DEFS`.
export interface HabitDay {
  iso: string;
  // The column's letter, and it comes from this day rather than from a typed
  // list of seven. A `["M","T","W",…]` constant beside the dates is two things
  // that can disagree about which column is which — the 1.0.53 lesson about a
  // legend that spelled its own states instead of reading them off the table
  // the cells read off.
  head: string;
  // The day's full name, for the dot that cannot carry one.
  label: string;
}

export interface HabitReading extends HabitDay {
  state: HabitState;
  // The same stored value, read as a number (1.0.56).
  //
  // BOTH, FROM ONE WALK, AND NEITHER IS A SPARE FIELD. These are two readings
  // of one property rather than two properties: the boolean column's dots want
  // `state`, the number column's sparkline wants `value`, and which is
  // meaningful depends on the HABIT, not on the day. So a reading of `4.2`
  // honestly carries `state: 1` as well — nothing asks a number habit for its
  // state, and the alternative is two vault walks for one week.
  value: number | null;
  // Whether that day has an entry at all.
  //
  // TWO FACTS, ONE MARK, AND THE SECOND IS IN THE TOOLTIP. A day nobody wrote
  // and a day whose habit nobody answered are different things and they look
  // the same, deliberately: both are "nothing recorded", and a third mark on a
  // 10px dot is how 1.0.52's calendar legend became unreadable. The `title`
  // says which, where there is room to say it.
  written: boolean;
}

// Monday to Sunday of the week holding `anchorIso`. Empty for an unparseable
// date, which is an answer a caller can draw nothing from.
//
// THE HEADS COME WITH THE DAYS so that the column letters and the dots under
// them are one list. The section draws the heads once and the readings once per
// habit; both read this.
export function habitWeek(anchorIso: string): HabitDay[] {
  const at = moment(anchorIso);
  if (!at.isValid()) return [];
  const mon = at.clone().startOf("isoWeek");
  return Array.from({ length: 7 }, (_, i) => {
    const day = mon.clone().add(i, "days");
    return {
      iso: day.format("YYYY-MM-DD"),
      // By grapheme, not by `slice(0, 1)`: a locale whose minimal weekday name
      // is outside the BMP would be cut in half by an index into the string.
      head: Array.from(day.format("dd"))[0] ?? "",
      label: day.format("dddd, D MMM"),
    };
  });
}

// One habit's readings across that week.
//
// DAILY ENTRIES, WHICH IS NOT A GUESS ABOUT WHERE A HABIT LIVES but the only
// grain whose seven notes ARE a week. `habitsForSurface` will admit a habit
// declared on any surface; what this function answers is narrower and is said
// in its name.
export function habitWeekReadings(
  app: App,
  paths: DiaryPaths,
  id: string,
  anchorIso: string
): HabitReading[] {
  return habitWeek(anchorIso).map((day) => {
    const file = locateEntry(app, paths, "daily", day.iso);
    return {
      ...day,
      state: file ? readHabitState(frontmatterOf(app, file)[id]) : null,
      value: file ? readHabitNumber(frontmatterOf(app, file)[id]) : null,
      written: file != null,
    };
  });
}

// ── the draft ─────────────────────────────────────────────────────────────

// One row of the window: a habit on this entry, and what it reads.
//
// `directive` IS CARRIED RATHER THAN DERIVED from the id, because the line in
// the note is the thing the remove has to match and a hand-written
// `tracker:Medication|Morning meds` is still that habit's line. Rebuilding it
// from the id would hand `removeTrackerDirective` a string the note does not
// contain, and the row would silently fail to come off.
export interface HabitRow {
  id: string;
  directive: string;
  // The registry's label, which is what the pencil renames. NOT the chip's
  // effective name: a note carrying a `|Label` override shows that override on
  // its chip, and a window that displayed it would be offering to rename one
  // thing while renaming another.
  label: string;
  // Which control answers it (1.0.56). CARRIED, NOT LOOKED UP, for
  // `directive`'s own reason one paragraph up: the window holds a draft, and a
  // row that re-read the registry on every repaint would change shape under a
  // reader who renamed the habit in Settings in another tab.
  type: HabitType;
  // What the reader has answered, as the number that will be written.
  //
  // ONE FIELD FOR BOTH TYPES, AND IT IS NOT A COMPROMISE. `HabitState` is
  // `1 | 0 | null`, which is already a `number | null`, so a boolean's three
  // states and a number's range are the same channel — and `HabitWrites.values`
  // has been `[string, number | null][]` since this window existed. `habitWrites`
  // therefore needs no branch at all: the difference between the draft and the
  // note is one comparison whatever the type is, which is what keeps the
  // cancelling-pair promise (a reading cycled back to where it started is not
  // written) true for a stepper without re-earning it.
  //
  // Read a boolean row's state back with `habitRowState`, which narrows it
  // through the same forgiving parse the chip uses.
  reading: number | null;
}

// A boolean row's three-state reading, narrowed from the shared field.
export function habitRowState(row: HabitRow): HabitState {
  return readHabitState(row.reading);
}

// Which habit type a registry row is, as one of the two.
//
// NARROWING RATHER THAN ASSERTING. `TrackerDef.type` is one of seven, and every
// caller of this has already been through `habitsForSurface` or
// `habitFromDirective`, so the answer is known — but a `def.type as HabitType`
// is the kind of cast that stops being true when an eighth type is added, and
// this one simply cannot be wrong.
export function habitTypeOf(def: TrackerDef): HabitType {
  return def.type === "number" ? "number" : "boolean";
}

// The draft row for a habit the note carries, reading its stored value.
//
// ONE BUILDER FOR FIVE CALL SITES, which is why it exists: the per-type parse
// (`readHabitNumber` for one, `readHabitState` for the other) is the thing that
// would have been copied four times and gone wrong in the fourth. `value` is
// the raw frontmatter value, or nothing for a habit being put on the entry now.
export function habitRowFor(
  def: TrackerDef,
  directive: string,
  value?: unknown
): HabitRow {
  const type = habitTypeOf(def);
  return {
    id: def.id,
    directive,
    label: def.label || def.id,
    type,
    reading: type === "number" ? readHabitNumber(value) : readHabitState(value),
  };
}

export interface HabitDraft {
  rows: HabitRow[];
  // Registry labels the reader changed, by habit id. Held apart from `rows`
  // because a rename is the one edit in this window that reaches outside the
  // note, so Save has to be able to ask for exactly the ones that did.
  renamed: Record<string, string>;
  // Habits to define, in the order they were typed. A `TrackerDef` already,
  // not a pending name: `newHabitDef` needs the ids already taken to make a
  // unique one, and asking that question at Save for a batch would have each
  // new habit unaware of the one typed before it.
  created: TrackerDef[];
}

export function hasHabit(rows: readonly HabitRow[], id: string): boolean {
  return rows.some((r) => r.id === id);
}

// Put a habit on the draft. Idempotent, like `addTag`: a habit already on the
// entry is left exactly where it is, state and all.
export function addHabitRow(
  rows: readonly HabitRow[],
  row: HabitRow
): HabitRow[] {
  if (hasHabit(rows, row.id)) return [...rows];
  return [...rows, row];
}

export function removeHabitRow(
  rows: readonly HabitRow[],
  id: string
): HabitRow[] {
  return rows.filter((r) => r.id !== id);
}

// Set one row's reading, keeping its position.
//
// TAKES A NUMBER RATHER THAN A STATE (1.0.56), which is the one signature this
// widening changed. A boolean caller passes `nextHabitState(habitRowState(row))`
// and gets exactly the old behaviour; a stepper passes its value.
export function setHabitReading(
  rows: readonly HabitRow[],
  id: string,
  reading: number | null
): HabitRow[] {
  return rows.map((r) => (r.id === id ? { ...r, reading } : r));
}

// A habit's name as the reader typed it, or null if it could not be one.
//
// Deliberately looser than `normaliseTag`: a habit's label is prose shown in a
// pill — "Morning meds", "10k steps" — and the only thing it has to survive is
// `propertyNameFromLabel`, which keeps letters and digits and drops the rest.
// So the one refusal is a name with nothing in it to make a property out of,
// which is the case that would otherwise produce a tracker with an empty id.
export function normaliseHabitLabel(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name === "") return null;
  if (propertyNameFromLabel(name) === "") return null;
  return name;
}

// The registry row a typed name becomes.
//
// THE SEED IS `tracker-picker.ts`'s, with the type already answered. That
// function's two notes apply here unchanged and are the reason this does not
// invent its own defaults: the surface comes from the note the reader is
// standing on, and `showInTemplate` stays OFF because naming a habit on
// today's entry is not a claim about every entry — "a reader who wants it on
// every entry can turn that on in Settings; a reader who didn't want it there
// is spared having to notice that it happened". `showInBase` follows the diary
// class, so a daily habit still earns its 0/1 column.
//
// `taken` is passed rather than read off the plugin so a batch of names typed
// in one sitting cannot collide: each call is given the ids the ones before it
// claimed.
//
// THE SHAPE IS THE 1.0.56 ADDITION, and it is optional because the overwhelming
// majority of habits typed into that field are booleans — a reader who picks
// "Number" in the window has said so, and everything else keeps the one-argument
// behaviour it had. `min`, `max` and `unit` are each optional WITHIN the number
// shape too: `buildStepper` already handles all three being absent (it steps
// from `def.min ?? 0` and shows a bare value), so a reader who wants a count and
// not a range leaves them blank rather than inventing bounds. `step` is left
// undefined and defaults to 1 at the control, which is the right unit for a
// habit somebody is counting by hand.
export interface HabitShape {
  type: HabitType;
  min?: number | null;
  max?: number | null;
  unit?: string | null;
}

export function newHabitDef(
  label: string,
  taken: Iterable<string>,
  surface: TrackerSurface | null,
  shape: HabitShape = { type: "boolean" }
): TrackerDef | null {
  const name = normaliseHabitLabel(label);
  if (name == null) return null;
  const seedSurface = surface ?? diarySurface("daily");
  const def: TrackerDef = {
    id: uniquePropertyName(propertyNameFromLabel(name), taken),
    label: name,
    type: shape.type,
    surface: seedSurface,
    showInTemplate: false,
    showInBase: diaryClassOf(seedSurface) != null,
  };
  // SET ONLY WHERE THE READER ANSWERED. An explicit `min: undefined` on the
  // object is not the same thing as an absent key once this round-trips
  // through `JSON` into `data.json` — and a `min: null` would be a bound of
  // null, which `buildStepper` clamps against.
  if (shape.type === "number") {
    if (shape.min != null) def.min = shape.min;
    if (shape.max != null) def.max = shape.max;
    if (shape.unit) def.unit = shape.unit;
  }
  return def;
}

// ── what Save has to do ───────────────────────────────────────────────────

export interface HabitWrites {
  // Directives to put on the note, and to take off it.
  add: string[];
  remove: string[];
  // Readings that changed, as `[property, value]`. `null` deletes the key: a
  // habit returned to unset should leave the entry reading exactly as it did
  // before anyone answered it, which is `tagsValue`'s argument about `tags: []`
  // applied to one property.
  values: [string, number | null][];
}

// The difference between the note as it was and the draft, as writes.
//
// COMPUTED RATHER THAN RECORDED, so the window does not have to keep a journal
// of the reader's keystrokes: a habit added and removed again cancels, a state
// cycled back to where it started is not written, and the note is touched only
// where the two actually differ. The same property that makes Cancel free
// makes Save minimal.
export function habitWrites(
  before: readonly HabitRow[],
  draft: HabitDraft
): HabitWrites {
  const add: string[] = [];
  const remove: string[] = [];
  const values: [string, number | null][] = [];

  for (const row of before) {
    if (!hasHabit(draft.rows, row.id)) remove.push(row.directive);
  }
  for (const row of draft.rows) {
    const was = before.find((r) => r.id === row.id);
    if (!was) add.push(row.directive);
    // ONE COMPARISON, BOTH TYPES — see `HabitRow.reading`. A row the reader
    // never touched compares equal and is not written, which is what makes
    // Save minimal and Cancel free.
    if ((was?.reading ?? null) !== row.reading) {
      values.push([row.id, row.reading]);
    }
  }
  return { add, remove, values };
}
