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
} from "./trackers";

// A habit's three states, as the chip cycles them: unset, done, not-done.
//
// `null` IS NOT `0`, and the distinction is the reason this is not a boolean.
// A habit nobody answered today is not a habit answered "no" — the streak
// charts count runs of `1`, the completion summary divides by the days that
// were ANSWERED, and `Diary.base` shows an empty cell rather than a tidy zero.
// `wireHabit`'s cycle has always been three-state; this is that parse, lifted
// out of it so the window reads a value exactly as the chip does.
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

// The next state in the cycle the chip and the window share.
export function nextHabitState(state: HabitState): HabitState {
  return state == null ? 1 : state === 1 ? 0 : null;
}

// How a state reads to somebody who cannot see the box.
export function describeHabitState(state: HabitState): string {
  return state === 1 ? "done" : state === 0 ? "not done" : "unset";
}

// ── which habits this note may carry ──────────────────────────────────────

// Every registered habit a note of this surface is allowed to log.
//
// A HABIT IS A BOOLEAN TRACKER AND NOTHING ELSE — the same test
// `habitTrackerFor` applies before it folds a directive into the cell, written
// once here so the window cannot offer a row the cell would refuse to draw.
// `derived` is excluded for the reason `TrackerDef.derived` gives: a computed
// value has no input widget, so there is nothing to tick.
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
      t.type === "boolean" &&
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
export function habitFromDirective(
  trackers: readonly TrackerDef[],
  line: string,
  surface: TrackerSurface | null
): TrackerDef | null {
  const body = line.split("|")[0].trim();
  const id = directiveTrackerId(body);
  if (!id) return null;
  const def = trackers.find((t) => t.id === id);
  if (!def || def.type !== "boolean" || def.derived) return null;
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
  count: number;
}

// Each habit, with how many notes beneath `folder` have logged it done.
//
// DIRECTORY-SCOPED AND DONE-ONLY, for the two reasons `tagsInFolder` gives
// about its own survey. The useful list when logging a Tuesday is what the rest
// of the week already tracks, not every boolean the vault has ever defined; and
// the number beside it has to mean something, so it counts the entries that
// answered YES rather than the ones that carry the property — a habit seeded
// blank onto thirty entries is not a habit used thirty times.
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
      if (readHabitState(fm[h.id]) === 1) {
        counts.set(h.id, (counts.get(h.id) ?? 0) + 1);
      }
    }
  }
  return habits
    .map((h) => ({
      id: h.id,
      label: h.label || h.id,
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
  state: HabitState;
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
export function setHabitState(
  rows: readonly HabitRow[],
  id: string,
  state: HabitState
): HabitRow[] {
  return rows.map((r) => (r.id === id ? { ...r, state } : r));
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
export function newHabitDef(
  label: string,
  taken: Iterable<string>,
  surface: TrackerSurface | null
): TrackerDef | null {
  const name = normaliseHabitLabel(label);
  if (name == null) return null;
  const seedSurface = surface ?? diarySurface("daily");
  return {
    id: uniquePropertyName(propertyNameFromLabel(name), taken),
    label: name,
    type: "boolean",
    surface: seedSurface,
    showInTemplate: false,
    showInBase: diaryClassOf(seedSurface) != null,
  };
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
    if ((was?.state ?? null) !== row.state) values.push([row.id, row.state]);
  }
  return { add, remove, values };
}
