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
