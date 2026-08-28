// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The diary's authored fields, declared once.
//
// A *field* is a body region a diary entry is written into — the `note:`,
// `list:`, `tasks:` and `attach:` directives the daily and monthly templates
// carry, backed by the `<!--almanac:key-->` regions notestore.ts reads and
// writes. Until 2.52 they were directive strings hand-written into two template
// assets, and the only code that knew any of them by name was quarter-stats.ts,
// which named four as string literals.
//
// That was the whole reason the rollup ladder stopped where it did. Trackers
// have a registry — declared once, normalised, surface-scoped, synced into
// templates, mirrored into Diary.base, reachable by id from anywhere — and
// regions had a convention that held because exactly one caller ever needed it.
// So the quarter rolled up three fields because someone hardcoded three fields,
// and the year rolled up nothing because nobody hardcoded it a second time.
// test/pure-logic.test.ts has kept `highlights` and `challenges` as two regions
// since 2.12 specifically so that "a year-in-review can read twelve months of
// highlights as regions rather than by parsing prose" — a consumer that was
// never written because there was nowhere to write it that wasn't a fifth copy
// of the same four literals.
//
// This module is that place. It is pure — no App, no plugin — for the same
// reason quarter-stats.ts and year-stats.ts are: the arithmetic of a summary
// page is where a summary page goes wrong, and it should be testable without a
// vault.
//
// ── what this is NOT authoritative over ───────────────────────────────
//
// notestore.ts::allNoteRegions discovers keys it was never told about, and it
// must keep doing so. A hand-edited note carrying `<!--almanac:dreams-->` is
// still indexed, still searchable, still counted, and still survives a round
// trip untouched. The registry says which regions a *review scope* rolls up; it
// says nothing about which regions exist. An unregistered region is invisible to
// the quarter and fully visible to search, and that split is deliberate — making
// this list authoritative over the parser would turn every hand-added field into
// silent data loss.

import { parseEntries } from "../diary/entries";
import { parseTasks } from "../ui/tasks";
import type { TrackerClass } from "./trackers";

// The directive verb a field renders as. Matches the widget kinds in
// widgets.ts one-for-one, because a field's declaration has to be able to
// *emit* its own directive line (see fieldDirective) — that is what lets the
// templates be checked against this list rather than drifting from it.
export type FieldKind = "note" | "list" | "tasks" | "attach";

// The `#variant` suffix on a `note:` directive. `line` is a single-line input
// that commits on Enter; `collapse` folds the content behind its label. Both
// are presentation, which is why they hang off `note` rather than being kinds
// of their own — the region content is identical either way.
export type FieldVariant = "line" | "collapse";

// What a review scope does with this field.
//
//   none   not rolled up at any scope.
//   line   one phrase per entry, attributed to its entry.
//   items  one row per line, attributed to its entry.
//   goals  task lines, counted set-versus-met.
//
// `none` is stated rather than implied, and that is the point of having the
// value at all. Before this module a field was excluded from the quarter by not
// appearing in a list of four literals, so an omission and a decision looked
// identical. Here an omission is a missing field and a `none` is an argument
// someone made.
export type FieldRollup = "none" | "line" | "items" | "goals";

export interface DiaryField {
  // The region key: `<!--almanac:focus-->`. Unique per (id, class), not
  // globally — `focus` is a field of the day *and* a field of the month, with
  // different prompts and different meanings, and they are two declarations.
  id: string;
  kind: FieldKind;
  variant?: FieldVariant;
  class: TrackerClass;
  label: string;
  placeholder?: string;
  rollup: FieldRollup;
  // What a rollup section calls this field when it gathers it. `todo` is
  // "Tasks" on a day, "Goals this month" on a month, and the quarter's own
  // section head says "Goals" — three names for one region key, agreed
  // nowhere until now.
  rollupNoun?: string;
}

// The fields the two diary templates ship, in the order they ship them.
//
// Order is load-bearing twice over: it is the order the fields appear in the
// note, and it is the order a rollup renders its sections in. One list serves
// both, so they cannot disagree.
//
// ── WHAT THE ORDER IS, AND WHY IT CHANGED IN 4.70 ────────────────────────
//
// It was "the way a review is written" — theme, then what happened, then loose
// notes, then attachments, then NEXT MONTH — with the task list last because a
// stacked page is read top to bottom and goals are the thing you leave with.
//
// The entry templates now compose two ROWS, so the page is no longer a single
// column and "last" no longer means "at the end of the reading". What the rows
// group by is WHEN A FIELD IS WRITTEN: the theme and the goals at the start of
// the period, side by side; what went well and what got in the way at the end of
// it, side by side; and the prose, the attachments and anything captured
// underneath, as wide as they want to be. That puts `todo` second rather than
// last, which is not a demotion of the review — it is the review becoming the
// SECOND row instead of the middle of a list.
//
// A ROLLUP READS THIS ORDER TOO, and the same argument carries: a month's goals
// section belongs beside its theme rather than after three months of
// highlights. `rollupFields` filters this list and nothing else reorders it.
export const DIARY_FIELDS: DiaryField[] = [
  // ── daily ───────────────────────────────────────────────────────────
  {
    id: "focus",
    kind: "note",
    variant: "line",
    class: "daily",
    label: "Today's focus",
    placeholder: "What are you focusing on today?",
    // The 2.52 change, and the cheapest one in the release: this field has
    // been authored every morning since 2.6 and read by nothing. It reaches
    // no dashboard. It surfaces on the timeline only by accident —
    // buildSnippet with no search terms takes the first non-empty region in
    // document order, and `focus` happens to be first in the template.
    rollup: "line",
    rollupNoun: "Focus",
  },
  {
    id: "highlights",
    kind: "list",
    class: "daily",
    label: "Highlights",
    placeholder: "What went well?",
    // NEW IN 3.11 §4.1, WITH THE FIELD IT DECLARES. The daily template gained
    // `highlights` and `challenges` in the same patch, and a directive in a
    // template with no declaration here is a region the rollup ladder cannot
    // see — which is the exact gap this module was written to close.
    //
    // ROLLED UP AS `items`, matching the month's. `entry-rollup` on a monthly
    // dashboard reads the days through `readRollup(regions, "daily")`, so a
    // day's highlights now reach the page you write the month on. That is the
    // whole point of the section: "to write August's Highlights you opened
    // thirty-one notes."
    rollup: "items",
    rollupNoun: "Highlights",
  },
  {
    id: "challenges",
    kind: "list",
    class: "daily",
    label: "Challenges",
    placeholder: "What got in the way?",
    rollup: "items",
    rollupNoun: "Challenges",
  },
  {
    id: "log",
    kind: "note",
    class: "daily",
    label: "Notes, reflections & learnings",
    placeholder: "Notes, reflections & learnings…",
    // Free prose, and deliberately not rolled up at any scope. The argument
    // is quarter-stats.ts's, moved here where the next person adding a field
    // can read it: three months of free prose stacked is not a review, it is
    // three months of free prose. The entry is linked instead.
    rollup: "none",
  },
  {
    id: "attachments",
    kind: "attach",
    class: "daily",
    label: "Attachments",
    // Counted, not read. diary-index.ts::countAttachments scans this region
    // for link syntax and never puts its text in the searchable body, so
    // rolling it up would gather markdown, not content.
    rollup: "none",
  },
  {
    id: "todo",
    kind: "tasks",
    class: "daily",
    label: "Tasks",
    // A day's tasks are ticked, not reviewed. They roll up through the
    // open/done counts every scope already carries (IndexedEntry.openTasks /
    // doneTasks, and tasks-table for the list) rather than as a goals section
    // — a quarter listing ninety days of "water plants" is not a review of
    // anything. The month's `todo` is the one that gets `goals`, because a
    // monthly goal accumulates instead of being ticked.
    rollup: "none",
  },
  {
    id: "capture",
    kind: "note",
    variant: "collapse",
    class: "daily",
    label: "Captured",
    placeholder: "Captured thoughts land here…",
    // Raw fragments by construction — see CAPTURE_NOTE_KEY in constants.ts,
    // which gives capture its own key precisely so it is not confused with
    // prose written on purpose. Rolling it up would surface the unsorted.
    rollup: "none",
  },

  // ── monthly ─────────────────────────────────────────────────────────
  {
    id: "focus",
    kind: "note",
    variant: "line",
    class: "monthly",
    label: "Monthly focus",
    placeholder: "What's the theme for this month?",
    rollup: "line",
    rollupNoun: "Theme",
  },
  {
    id: "highlights",
    kind: "list",
    class: "monthly",
    label: "Highlights",
    placeholder: "What went well?",
    rollup: "items",
    rollupNoun: "Highlights",
  },
  {
    id: "challenges",
    kind: "list",
    class: "monthly",
    label: "Challenges",
    placeholder: "What got in the way?",
    rollup: "items",
    rollupNoun: "Challenges",
  },
  {
    id: "log",
    kind: "note",
    class: "monthly",
    label: "Notes, reflections & learnings",
    placeholder: "Notes, reflections & learnings…",
    rollup: "none",
  },
  {
    id: "attachments",
    kind: "attach",
    class: "monthly",
    label: "Attachments",
    rollup: "none",
  },
  {
    id: "todo",
    kind: "tasks",
    class: "monthly",
    label: "Goals this month",
    // The most valuable field in the diary, and the reason the quarter page
    // exists: goals set versus met across three months is the one question no
    // single month's note can answer.
    rollup: "goals",
    rollupNoun: "Goals",
  },

  // ── weekly, quarterly, yearly ───────────────────────────────────────
  //
  // DECLARED IN 3.12, TWO GRAINS LATE. 3.11 §13.3 found these missing: the
  // registry declared `daily` and `monthly` and nothing else, while all three
  // of these grains had been shipping six authored fields apiece since 2.57.12
  // with no declaration behind any of them. Same shape as `bridgeCatalogue` in
  // 3.8 §5 — a table written when the diary had two grains and never revisited
  // when it grew to five — and it sat because `fields.test.ts` reconstructed
  // two templates out of five, so the two it checked were the two that existed.
  //
  // ── EVERY ONE OF THE EIGHTEEN IS `none`, FROM ONE ARGUMENT ──────────
  //
  // `rollup` answers "what does a review scope ABOVE this one do with the
  // field" — not "what does this field contain". The distinction is the whole
  // reason the value exists: `log` holds perfectly rollupable prose and is
  // `none` at both declared grains because stacking three months of free prose
  // is not a review.
  //
  // Nothing reads these grains as a source, and that is a decision on record
  // rather than a gap. `RollupGrain` in entry-rollup.ts is `daily | monthly`,
  // deliberately: *"a week and a month are written FROM their days, a quarter
  // from its months. Weeks under a quarter and quarters under a year are review
  // surfaces rather than sources — a quarter summarising four weekly reviews is
  // a summary of summaries, which is what `recap` is for and does better."*
  // `quarter-stats.ts` and `year-stats.ts` both read `monthly` for the same
  // reason. So there is no scope above a week, a quarter or a year that gathers
  // them, and `none` is what that sentence spells.
  //
  // WHICH MEANS THIS BLOCK CHANGES NO BEHAVIOUR, and saying so is the honest
  // part. `rollupFields()` filters `none` out, so these eighteen add nothing to
  // any rollup and `readRollup(regions, "weekly")` returns exactly what it
  // returned before: nothing. What changes is that it now returns nothing
  // because a declaration says so, where before it returned nothing because
  // there was no declaration — and those looked identical from the outside,
  // which is the confusion this module was built to end.
  //
  // The guard is the test, not the data: `fields.test.ts` reconstructs all five
  // templates now, so a placeholder edited in an asset without being edited
  // here fails on any grain rather than on two of them.
  //
  // NOTE THE PER-GRAIN WORDING IS REAL AND NOT COPY-PASTE. `focus` is labelled
  // "Focus" here and "Monthly focus" at the month; `log` is "Notes" here and
  // "Notes, reflections & learnings" at the month. Those are the templates'
  // own strings and the reconstruction test is exact, so they are transcribed
  // rather than harmonised — harmonising them would be a content change hiding
  // inside a registry patch.

  {
    id: "focus",
    kind: "note",
    variant: "line",
    class: "weekly",
    label: "Focus",
    placeholder: "What's the theme for this week?",
    rollup: "none",
  },
  {
    id: "highlights",
    kind: "list",
    class: "weekly",
    label: "Highlights",
    placeholder: "What went well?",
    rollup: "none",
  },
  {
    id: "challenges",
    kind: "list",
    class: "weekly",
    label: "Challenges",
    placeholder: "What got in the way?",
    rollup: "none",
  },
  {
    id: "log",
    kind: "note",
    class: "weekly",
    label: "Notes",
    placeholder: "Notes, reflections & learnings\u2026",
    rollup: "none",
  },
  {
    id: "attachments",
    kind: "attach",
    class: "weekly",
    label: "Attachments",
    rollup: "none",
  },
  {
    id: "todo",
    kind: "tasks",
    class: "weekly",
    label: "Goals this week",
    rollup: "none",
  },
  {
    id: "focus",
    kind: "note",
    variant: "line",
    class: "quarterly",
    label: "Focus",
    placeholder: "What's the theme for this quarter?",
    rollup: "none",
  },
  {
    id: "highlights",
    kind: "list",
    class: "quarterly",
    label: "Highlights",
    placeholder: "What went well?",
    rollup: "none",
  },
  {
    id: "challenges",
    kind: "list",
    class: "quarterly",
    label: "Challenges",
    placeholder: "What got in the way?",
    rollup: "none",
  },
  {
    id: "log",
    kind: "note",
    class: "quarterly",
    label: "Notes",
    placeholder: "Notes, reflections & learnings\u2026",
    rollup: "none",
  },
  {
    id: "attachments",
    kind: "attach",
    class: "quarterly",
    label: "Attachments",
    rollup: "none",
  },
  {
    id: "todo",
    kind: "tasks",
    class: "quarterly",
    label: "Goals this quarter",
    rollup: "none",
  },
  {
    id: "focus",
    kind: "note",
    variant: "line",
    class: "yearly",
    label: "Focus",
    placeholder: "What's the theme for this year?",
    rollup: "none",
  },
  {
    id: "highlights",
    kind: "list",
    class: "yearly",
    label: "Highlights",
    placeholder: "What went well?",
    rollup: "none",
  },
  {
    id: "challenges",
    kind: "list",
    class: "yearly",
    label: "Challenges",
    placeholder: "What got in the way?",
    rollup: "none",
  },
  {
    id: "log",
    kind: "note",
    class: "yearly",
    label: "Notes",
    placeholder: "Notes, reflections & learnings\u2026",
    rollup: "none",
  },
  {
    id: "attachments",
    kind: "attach",
    class: "yearly",
    label: "Attachments",
    rollup: "none",
  },
  {
    id: "todo",
    kind: "tasks",
    class: "yearly",
    label: "Goals this year",
    rollup: "none",
  },
];

// ── lookup ────────────────────────────────────────────────────────────

// Every field of one entry class, in template order.
export function fieldsForClass(cls: TrackerClass): DiaryField[] {
  return DIARY_FIELDS.filter((f) => f.class === cls);
}

// One field, by the pair that identifies it. Undefined for a region key that
// isn't registered — which is a legitimate state (see the header), not an
// error, so this returns rather than throws.
export function getField(
  id: string,
  cls: TrackerClass
): DiaryField | undefined {
  return DIARY_FIELDS.find((f) => f.id === id && f.class === cls);
}

// The fields a review scope gathers from one entry class, in template order.
// Everything downstream iterates this rather than naming ids.
export function rollupFields(cls: TrackerClass): DiaryField[] {
  return fieldsForClass(cls).filter((f) => f.rollup !== "none");
}

// The directive line this field renders as, exactly as the shipped templates
// carry it: `<kind>:<id>[#variant][:placeholder]|<label>`.
//
// This exists so the assets can be checked against the registry rather than
// trusted to match it. A field whose placeholder is edited in one place and not
// the other is the drift this whole module is against, and a test that
// reconstructs both templates from this list catches it on the commit that
// introduces it instead of the release that ships it.
export function fieldDirective(f: DiaryField): string {
  const head = f.variant ? `${f.id}#${f.variant}` : f.id;
  const body = f.placeholder ? `${head}:${f.placeholder}` : head;
  return `${f.kind}:${body}|${f.label}`;
}

// ── reading a field out of an entry ───────────────────────────────────

// A region list as diary-index.ts hands it over. Named so this module needn't
// import IndexedEntry (and so callers holding raw allNoteRegions output can use
// it directly) — the rollup only ever needs the key/content pairs.
export type NoteRegions = readonly { key: string; content: string }[];

export function regionContent(regions: NoteRegions, key: string): string {
  return regions.find((r) => r.key === key)?.content ?? "";
}

// The first non-empty line of a region.
//
// A `#line` field holds one line by contract — the widget prevents Enter from
// inserting a break — but a hand-edited region might hold several, and taking
// the first is better than rendering a paragraph into a slot sized for a
// phrase. Moved here verbatim from quarter-stats.ts, which is no longer the
// only caller.
export function firstLine(text: string): string {
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t) return t;
  }
  return "";
}

// One field's contribution to a rollup.
//
// `items` and `goals` rather than a discriminated union on `rollup`, because
// every consumer wants to render a list of sections and a union would make each
// one switch before it could. A `line` field yields zero or one item; an
// `items` field yields as many as were written; a `goals` field fills `goals`
// and leaves `items` empty. The field itself is carried so a renderer has the
// noun and the kind without a second lookup.
export interface FieldValue {
  field: DiaryField;
  items: string[];
  goals: { text: string; done: boolean }[];
}

// Read one field out of an entry's regions.
export function readField(
  regions: NoteRegions,
  field: DiaryField
): FieldValue {
  const content = regionContent(regions, field.id);
  switch (field.rollup) {
    case "line": {
      const one = firstLine(content);
      return { field, items: one ? [one] : [], goals: [] };
    }
    case "items":
      return { field, items: parseEntries(content), goals: [] };
    case "goals":
      return {
        field,
        items: [],
        goals: parseTasks(content).map((t) => ({ text: t.text, done: t.done })),
      };
    case "none":
      return { field, items: [], goals: [] };
  }
}

// Every rollupable field of an entry, in template order. The one call a review
// scope makes per entry — quarter-stats.ts and year-stats.ts both go through
// here, so the two cannot disagree about what a month contributes.
export function readRollup(
  regions: NoteRegions,
  cls: TrackerClass
): FieldValue[] {
  return rollupFields(cls).map((f) => readField(regions, f));
}

// A single field's value out of a rollup, by id. For the consumers that still
// want one field by name (the quarter's month cards quote `focus` under the
// month, which is a layout, not a section).
export function valueOf(
  values: readonly FieldValue[],
  id: string
): FieldValue | undefined {
  return values.find((v) => v.field.id === id);
}

// The single line of a `line` field, or "" when it wasn't written.
export function lineOf(values: readonly FieldValue[], id: string): string {
  return valueOf(values, id)?.items[0] ?? "";
}

// The items of an `items` field, or [] when it wasn't written.
export function itemsOf(values: readonly FieldValue[], id: string): string[] {
  return valueOf(values, id)?.items ?? [];
}

// The goals of a `goals` field, or [] when it wasn't written.
export function goalsOf(
  values: readonly FieldValue[],
  id: string
): { text: string; done: boolean }[] {
  return valueOf(values, id)?.goals ?? [];
}
