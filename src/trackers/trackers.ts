// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { App, Notice, parseYaml, stringifyYaml } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import {
  TRACKER_MARK_START,
  isTrackerMarkStart,
  TRACKER_MARK_END,
  isTrackerMarkEnd,
  FENCE_OPEN,
  FENCE_CLOSE,
  BUILTIN_ORDER,
  DEFAULT_MOOD_FACES,
  builtinTemplate,
} from "../core/constants";
import {
  basename,
  dashboardGrainOf,
  getFile,
  normaliseTypeValue,
  sleepHours,
} from "../core/util";

// ── Types ─────────────────────────────────────────────────────────────

// The kind of value a tracker holds, which decides its input widget and how it
// charts.
//   number  — a magnitude, −/+ stepper
//   time    — a clock time, stored minutes-since-midnight
//   date    — a calendar date
//   select  — one of a fixed set of string values, a dropdown
//   scale   — a small bounded ordinal (1..5-ish) rendered as a face/word
//             picker rather than a stepper, and eligible to colour the diary
//             calendar's heat map. This is Mood generalised: Mood was the only
//             tracker that could carry `faces` and feed the heatmap, and there
//             was nothing mood-specific about wanting to rate energy, focus,
//             anxiety or pain on the same 1–5 scale with the same widget. The
//             type — not the built-in id — now carries that behaviour, so a
//             user-defined scale tracker gets the picker and can be the heatmap
//             source, and Mood is just the scale tracker that ships enabled.
//   boolean — did-it-happen, a checkbox storing 0/1 so it averages to a
//             completion rate and charts as one. Its natural companion is the
//             streak chart type (see ChartType).
//   tags    — a LIST rather than a value, written to Obsidian's own `tags`
//             frontmatter property and managed from a dialogue. The one
//             tracker type whose reading is not a measurement: it exists
//             because an Obsidian tag is only a tag where Obsidian's parser
//             can see it, and it cannot see inside a fence — which is where
//             this plugin puts everything. See `trackers/tags.ts`.
export type TrackerType =
  | "number"
  | "time"
  | "date"
  | "select"
  | "scale"
  | "boolean"
  | "tags";

// Types that hold a list rather than a scalar, and therefore cannot chart,
// cannot be a Diary.base column, and take no min/max/options in the editor.
// A predicate rather than `=== "tags"` for `isScaleType`'s reason: three
// places ask, and a literal in each is what leaves one of them behind.
export function isListType(t: TrackerType): boolean {
  return t === "tags";
}

// The types that render a face/word picker and may feed the calendar heat map.
// A single-element set today, but named because three places ask the question
// ("is this a scale?") and a literal `=== "scale"` in each is the kind of thing
// that a second scale-like type later would leave one of them behind.
export function isScaleType(t: TrackerType): boolean {
  return t === "scale";
}

// ── Tracker classes ───────────────────────────────────────────────────
//
// A tracker belongs to exactly one *class*, naming the period it measures and
// therefore the kind of entry it may be logged on. Mood is a daily thing;
// "Savings" is a monthly one. Before 2.19 the two were independent flags
// (`showInDaily` / `showInMonthly`) and a tracker could be on both — which
// meant a daily module could be dropped into a monthly review, where the
// reading it produces is not the same measurement under a shared name but a
// different measurement wearing one. One `Mood` property written from both a
// day and a month is two incompatible series in one key: the charts have to
// ask which folder they came from, the frontmatter can't say, and any average
// over the mixture is arithmetic on unlike quantities.
//
// So the class is a single value rather than a set of switches. Illegal states
// stop being representable: there is no "both", so nothing downstream needs a
// rule for it.
//
// Weekly, quarterly and yearly belong here eventually. Everything class-shaped
// is table-driven off CLASS_DEFS below — adding one is an entry there plus a
// template — so the union is the only place that has to know they exist.
export type TrackerClass =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "yearly";

// Everything that differs between classes, in one table. Kept together (rather
// than as parallel switch statements in the sync, the picker and the settings
// tab) because a new class is otherwise a scavenger hunt: the value of naming
// the differences once is that the fifth place to change stops being the one
// you forget.
export interface TrackerClassDef {
  // Settings pills, editor dropdown.
  label: string;
  // Prose: "…on every new daily entry".
  adjective: string;
  // "…is a monthly tracker" / "no monthly trackers are defined yet".
  noun: string;
  // File name under paths.templatesDiary whose managed region this class owns.
  templateFile: string;
  // The bundled asset (under assets/) that scaffolds templateFile. Named here
  // so the scaffold's source and destination both derive from one table rather
  // than a second hardcoded pair in scaffold.ts that has to be kept in step by
  // hand — exactly the drift the class table exists to remove.
  // The `journal:` frontmatter value entries of this class carry. Doubles as
  // the literal a Diary.base view's filter names when it is scoped to them.
  journalProperty: string;
  // ── how this grain reads and how its entries are named (2.58.0) ──────
  //
  // WHY THESE ARE HERE AND NOT IN A UI TABLE BESIDE THIS ONE. The counter-case
  // is real: `folderKey` is a fact about the vault and `titleFormat` is a date
  // format, and merging them means classifyNote and the template sync import a
  // module carrying presentation. It does not survive what this table is FOR —
  // see the note above it. A second table keyed by TrackerClass reintroduces
  // the scavenger hunt exactly where 2.57.12 proved one table removes it: three
  // grains were added there with no code change outside this record.
  //
  // The presentation line was already crossed anyway (`label`, `adjective` and
  // `noun` are strings for pills and prose), and `Record<TrackerClass, T>`
  // makes a missing entry a compile error either way — so the two tables differ
  // in discoverability, not safety.
  //
  // THE LINE THAT IS ACTUALLY DEFENDED: every field here is PLAIN DATA. If one
  // ever needs a DOM node, a moment instance or an import this module does not
  // already have, it does not belong in the table. That test can be applied;
  // "presentation versus vault" cannot.

  // The period itself, as a word: "day", "week". Distinct from `noun`, which is
  // the tracker adjective ("daily") used in "no daily trackers are defined".
  // This one goes in "Jump to week" and "Earliest week".
  periodNoun: string;
  // The moment unit this grain steps by, for a picker's prev/next.
  unit: "day" | "isoWeek" | "month" | "quarter" | "year";
  // How an entry of this grain is named: prefix, then the date in `fileFormat`.
  // `Day-2026-07-21`, `Week-2026-W30`. These two are what lets one walk replace
  // the two hardcoded regexes in chart-render.ts and diary/entryheader.ts, and
  // they are the reason §4 of the plan folds into this release rather than
  // needing these fields added a second time.
  filePrefix: string;
  fileFormat: string;
  // How an entry names itself in its own banner.
  //
  // An OBJECT because a week is a RANGE — "27 Jul – 2 Aug 2026" — where a day
  // and a month are points. `to` absent means a point, and the absence is the
  // signal rather than a separate `isRange` flag that could disagree with it.
  titleFormat: { from: string; to?: string };
  // The frontmatter key carrying this entry's own date.
  //
  // MISSED BY PATCH 1, and found by patch 2 the moment `entryContext` had to be
  // generalised — which is what staging a table before its readers is for. The
  // grains do not share a source: a daily entry carries `journal-date`, a
  // monthly one carries `month`, and the three added in 2.57.12 carry the same
  // `*-start` property their dashboards use. Deriving the date from the
  // FILENAME instead was the tempting alternative (patch 1 already describes
  // those), and it was declined: it would make the note's name authoritative
  // over its own frontmatter, so renaming a file would silently move the entry.
  dateProperty: string;
  // Which configured path holds this class's entries.
  folderKey:
    | "diaryDaily"
    | "diaryWeekly"
    | "diaryMonthly"
    | "diaryQuarterly"
    | "diaryYearly";
}

export const CLASS_DEFS: Record<TrackerClass, TrackerClassDef> = {
  daily: {
    label: "Daily",
    adjective: "daily",
    noun: "daily",
    templateFile: "Daily.md",
    journalProperty: "Daily Notes",
    dateProperty: "journal-date",
    periodNoun: "day",
    unit: "day",
    filePrefix: "Day-",
    fileFormat: "YYYY-MM-DD",
    titleFormat: { from: "dddd D MMMM YYYY" },
    folderKey: "diaryDaily",
  },
  weekly: {
    label: "Weekly",
    adjective: "weekly",
    noun: "weekly",
    templateFile: "Weekly Entry.md",
    journalProperty: "Weekly Entry",
    dateProperty: "week-start",
    periodNoun: "week",
    unit: "isoWeek",
    filePrefix: "Week-",
    fileFormat: "YYYY-[W]WW",
    titleFormat: { from: "D MMM", to: "D MMM YYYY" },
    folderKey: "diaryWeekly",
  },
  monthly: {
    label: "Monthly",
    adjective: "monthly",
    noun: "monthly",
    templateFile: "Monthly Entry.md",
    journalProperty: "Monthly Entry",
    dateProperty: "month",
    periodNoun: "month",
    unit: "month",
    filePrefix: "Month-",
    fileFormat: "YYYY-MM",
    titleFormat: { from: "MMMM YYYY" },
    folderKey: "diaryMonthly",
  },
  quarterly: {
    label: "Quarterly",
    adjective: "quarterly",
    noun: "quarterly",
    templateFile: "Quarterly Entry.md",
    journalProperty: "Quarterly Entry",
    dateProperty: "quarter-start",
    periodNoun: "quarter",
    unit: "quarter",
    filePrefix: "Quarter-",
    fileFormat: "YYYY-[Q]Q",
    titleFormat: { from: "[Q]Q YYYY" },
    folderKey: "diaryQuarterly",
  },
  yearly: {
    label: "Yearly",
    adjective: "yearly",
    noun: "yearly",
    templateFile: "Yearly Entry.md",
    journalProperty: "Yearly Entry",
    dateProperty: "year-start",
    periodNoun: "year",
    unit: "year",
    filePrefix: "Year-",
    fileFormat: "YYYY",
    titleFormat: { from: "YYYY" },
    folderKey: "diaryYearly",
  },
};

// Canonical order: shortest period first, which is also the order the settings
// dropdown and the pills read in.
export const TRACKER_CLASSES: TrackerClass[] = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
];

export function isTrackerClass(v: unknown): v is TrackerClass {
  return typeof v === "string" && (TRACKER_CLASSES as string[]).includes(v);
}

// ── Tracker surfaces ──────────────────────────────────────────────────
//
// A class says which *period* a tracker measures, and every field of
// CLASS_DEFS assumes the thing measured is a diary entry: a template file
// whose managed region owns it, a diary folder key, the `journal:` literal a
// Diary.base view filters on. A tracker on a Study lesson has none of those.
// Adding a third TrackerClass would mean a row of the class table with most of
// its columns empty, and scopesFor — whose entire job is that it cannot offer
// a wrong scope — would start returning one.
//
// So the axis above class is the *surface*: where a tracker may be logged at
// all. A diary surface carries a class, and everything class-shaped keeps
// working off CLASS_DEFS unchanged. A journal surface names a journal type
// instead, and its folder follows from that type's root exactly as a class's
// follows from its folderKey.
//
// `typeId: null` means *every registered journal*. Only the built-ins use
// it. "A new custom journal gets confidence and status" is a statement about
// what the picker offers, and saying it once here costs nothing — whereas
// seeding a copy per type would mean several registry entries sharing one id,
// which the registry cannot represent: `id` is the frontmatter property, the
// `tracker:` directive's argument and getTracker's key, all at once.
// A DIARY SURFACE IS A SET; A JOURNAL SURFACE IS NOT.
//
// One tracker, many grains. Before 2.57.8 a diary tracker named exactly one
// class, so "Mood on every grain" meant five separate registry entries with the
// same name, type, range, icon and bounds — five things to keep in step by
// hand, and a rename that silently corrected one of them. That is the drift
// CLASS_DEFS was written to remove, reappearing one level up.
//
// The settings tab could have grouped the duplicates under one heading, and
// that was the tempting fix: it would have made five rows LOOK like one thing
// while leaving five things that can disagree, which is worse than the honest
// mess because the disagreement is now hidden. The duplicates should not exist.
//
// Journal surfaces stay singular on purpose. "This tracker is on Study and on
// Recipes" is a different claim from "this tracker is on every grain of the
// diary": the grains are one thing measured at five resolutions, where two
// journal types are two subjects that happen to share a word. A `typeId: null`
// already says "every type" for the case that genuinely means it.
//
// REVISITED IN 2.59.5 AND DELIBERATELY LEFT ALONE. The asymmetry is now visible
// in the UI as well as the type: 2.58.3's grain checkboxes appear for a diary
// tracker and not a journal one, so if this ever becomes a set the control has
// two shapes and one of them is a dropdown pretending to be a set — which is
// the failure 2.57.9 fixed for the diary.
//
// It is left singular because the thing that would justify changing it does not
// exist: a tracker someone wants on two journals but not all of them. Inventing
// that case to make the union symmetrical would be symmetry for its own sake,
// and `typeId: null` already covers "all of them".
//
// THE FIELD THAT CHANGES, if it ever does, is this one — `typeId: string | null`
// becomes `typeIds: string[]`, `null` retires, and `surfaceAcceptsType`,
// `describeSurface`, the editor row and `seedingPhrase` all follow. Written down
// so the next person reads a decision rather than an oversight.
// A GLOBAL SURFACE IS A THIRD KIND, not a diary surface with every grain
// ticked and not a journal surface with a null type. Both of those were tried
// on paper and both are lies the rest of the code would then have to live
// with: `diaryClassesOf` would report five grains for a tracker that measures
// no period, and `surfaceFolders` would answer with the diary for something
// that belongs to a Lesson as much as to a Tuesday. `kind: "any"` says the
// true thing — this tracker is admitted everywhere — and every function below
// that asks a question a global tracker has no answer to keeps returning the
// empty answer it already returns for the surface that cannot answer it.
export type TrackerSurface =
  | { kind: "diary"; classes: TrackerClass[] }
  | { kind: "journal"; typeId: string | null }
  | { kind: "any" };

// A note's surface is a set of one.
//
// Slightly odd to read and the alternative was worse: a second type for "the
// class a note is" would mean every comparison site choosing which of the two
// it wanted, and `surfaceAdmits` is exactly the place that must not have to.
export function diarySurface(...classes: TrackerClass[]): TrackerSurface {
  return { kind: "diary", classes };
}

export function journalSurface(typeId: string | null): TrackerSurface {
  return { kind: "journal", typeId };
}

// Everywhere: every diary grain and every journal type, present and future.
export function anySurface(): TrackerSurface {
  return { kind: "any" };
}

export function isAnySurface(s: TrackerSurface): boolean {
  return s.kind === "any";
}

export function isJournalSurface(s: TrackerSurface): boolean {
  return s.kind === "journal";
}

// The diary classes a surface carries — empty for a journal surface.
export function diaryClassesOf(s: TrackerSurface): TrackerClass[] {
  return s.kind === "diary" ? s.classes : [];
}

// The single class a surface carries, or null.
//
// Kept for the callers that hold a NOTE's surface, which is always a set of
// one. It returns null for a multi-class tracker rather than picking the first,
// because "the class" of a tracker on three grains is not a question with an
// answer, and quietly answering it with `classes[0]` is how a five-grain
// tracker would end up filed under Daily everywhere.
export function diaryClassOf(s: TrackerSurface): TrackerClass | null {
  return s.kind === "diary" && s.classes.length === 1 ? s.classes[0] : null;
}

// Whether a tracker's surface admits a note belonging to journal type
// `typeId`. A null typeId on the tracker means every type.
export function surfaceAcceptsType(s: TrackerSurface, typeId: string): boolean {
  if (s.kind === "any") return true;
  return s.kind === "journal" && (s.typeId == null || s.typeId === typeId);
}

// Whether a tracker on surface `t` may be logged on a note whose surface is
// `note`. Deliberately not an equality test: a note's surface always names one
// concrete grain or journal type, a tracker's may name several.
export function surfaceAdmits(
  t: TrackerSurface,
  note: TrackerSurface
): boolean {
  // Asked of the TRACKER's surface first, and only of the tracker's: a note is
  // never `any` — `surfaceOf` resolves one concrete grain or one type — so
  // this is not a wildcard match on both sides that could quietly admit
  // anything to anything.
  if (t.kind === "any") return true;
  if (note.kind === "any") return false;
  if (note.kind === "diary") {
    return (
      t.kind === "diary" && note.classes.some((c) => t.classes.includes(c))
    );
  }
  return note.typeId != null && surfaceAcceptsType(t, note.typeId);
}

// A tracker that records nothing: a diary surface with no grain ticked.
//
// Representable rather than forbidden, because the state exists while someone
// is editing — the editor refuses it with a notice on the way out. What must
// not happen is it being silently treated as "all grains" or as "daily".
export function recordsNothing(s: TrackerSurface): boolean {
  return s.kind === "diary" && s.classes.length === 0;
}

// A stable grouping key, for the settings tab's per-surface sections and for
// any Map keyed by surface. Never persisted — `surface` itself is what goes to
// disk — so its exact spelling is free to change.
export function surfaceKey(s: TrackerSurface): string {
  if (s.kind === "any") return "any";
  return s.kind === "diary"
    ? `diary:${[...s.classes].sort().join("+") || "none"}`
    : `journal:${s.typeId ?? "*"}`;
}

// How a surface reads in a sentence: "…can't be logged on a monthly entry",
// "…is a Cooking tracker". `typeName` resolves a type id to its display name;
// callers holding the plugin pass one. It falls back to the raw id so a
// tracker scoped to a journal type that has since been deleted still describes
// itself instead of rendering "undefined".
export function describeSurface(
  s: TrackerSurface,
  typeName?: (typeId: string) => string | undefined
): string {
  if (s.kind === "any") return "any";
  if (s.kind === "diary") {
    if (s.classes.length === 0) return "unrecorded";
    return s.classes.map((c) => CLASS_DEFS[c].adjective).join(" / ");
  }
  if (s.typeId == null) return "journal";
  return typeName?.(s.typeId) ?? s.typeId;
}

// The same, capitalised for a label or a button ("Daily", "Cooking").
export function describeSurfaceLabel(
  s: TrackerSurface,
  typeName?: (typeId: string) => string | undefined
): string {
  if (s.kind === "any") return "Any note";
  if (s.kind === "diary") {
    if (s.classes.length === 0) return "No grain";
    return s.classes.map((c) => CLASS_DEFS[c].label).join(" / ");
  }
  if (s.typeId == null) return "All journals";
  return typeName?.(s.typeId) ?? s.typeId;
}

// A built-in tracker is one the plugin owns and formats specially, rather than
// a plain user-defined registry entry. Its property name, type and range are
// fixed (locked in Settings — only an on/off toggle, plus a scale tracker's
// heatmap + faces settings, are editable); the plugin renders it with a
// purpose-built widget:
//   mood   — a scale (emoji-face picker), ships enabled, default heatmap source
//   energy — a scale, ships disabled: rate the day's energy 1–5
//   focus  — a scale, ships disabled: rate the day's focus 1–5
//   wake   — morning wake time, coupled with `bed`
//   bed    — evening bedtime, coupled with `wake`
//   sleep  — a DERIVED number (hours asleep), computed from wake+bed on write,
//            never entered by hand, but chartable like any other number
//
// mood/energy/focus are all `type: "scale"` and interchangeable in every way
// except which ships on — the point of the scale family. They are listed
// separately as built-ins (rather than one built-in the user clones) so their
// ids and faces are stable across vaults and upgrades, the way Mood's always
// were.
export type BuiltinKind =
  | "tags"
  | "mood"
  | "energy"
  | "focus"
  | "wake"
  | "bed"
  | "sleep"
  | "confidence"
  | "status"
  | "reviewed"
  | "accuracy";

// The built-ins that live on a journal surface rather than the diary. Both
// carry `typeId: null` — every registered journal — which is why adding a
// custom journal seeds nothing: the trackers already apply to it.
//
// They are built-ins rather than seeded custom trackers for the same reason
// Mood is: the property names are load-bearing outside the registry.
// `confidence` is read by the confidence rail and the Lessons table's `base`
// block; `status` is a column in two `base` views and the thing year-view.ts
// counts completed lessons by. A user renaming either would break a template,
// so the id is locked and only the label is theirs.
export const JOURNAL_BUILTINS: BuiltinKind[] = [
  "confidence",
  "status",
  "reviewed",
  "accuracy",
];

// The scale built-ins, in render order. Everything that iterates "the scale
// trackers the plugin ships" reads this rather than re-listing the literals.
export const SCALE_BUILTINS: BuiltinKind[] = ["mood", "energy", "focus"];

export interface TrackerDef {
  // Frontmatter property name. Also used as the widget id (`tracker:<id>`)
  // and, if showInBase, the Diary.base column key. Changing this on an
  // existing tracker effectively creates a new one — old entries keep
  // whatever property they already had written.
  id: string;
  // Shown as the widget label and the Diary.base column header.
  label: string;
  type: TrackerType;
  // number-only. Missing min/max means unbounded that direction.
  min?: number;
  max?: number;
  step?: number;
  // number-only, cosmetic suffix on the stepper ("km", "chapters"...).
  unit?: string;
  // How daily values collapse when a chart buckets them by month
  // (ChartScope "daily-by-month"). Absent means mean — see ChartReduce.
  // Number-shaped trackers only: a select or a checkbox has no arithmetic.
  reduce?: ChartReduce;
  // select-only, raw "value=Label,value2=Label2" (same grammar as the
  // existing `select:` widget directive).
  options?: string;
  // Where this tracker may be logged at all: a diary class, or a journal type.
  // Not a display preference — a daily tracker is refused by the monthly
  // review's picker, and a Study tracker by a Cooking note. See TrackerSurface.
  surface: TrackerSurface;
  // Auto-inserted into its class's template (frontmatter key + widget block),
  // so every new entry of that class starts with it. Off means the tracker
  // still exists, still charts, still gets a Diary.base column, and is one tap
  // away from "+ Add tracker" on the entries where it happened — it just isn't
  // seeded onto the ones where it didn't. That is the whole point of an
  // occasional tracker, and it is orthogonal to the class: "which entries may
  // carry this" and "which of them start with it" are different questions.
  //
  // DIARY SURFACES ONLY. A journal type has several templates (one index per
  // level, one per note kind) and type-only scoping cannot say which of them a
  // tracker belongs on — "confidence on Lesson but not Practice" is not
  // expressible. Nothing rewrites a journal type's templates either: the sync
  // below runs over TRACKER_CLASSES against paths.templatesDiary, and
  // scaffold.ts writes a journal template once and never touches it again. So
  // a journal type's templates are the user's to edit, this flag is forced
  // false for a journal surface (normalizeTrackers) and hidden from the editor.
  showInTemplate: boolean;
  // Auto-added as a column in Diary.base. Diary surfaces only, for the plain
  // reason that Diary.base holds diary entries: a journal tracker's column
  // would be blank in every row by construction, and syncDiaryBase resolves
  // which views to write to from the tracker's *class*, which a journal
  // surface has none of.
  showInBase: boolean;

  // ── Built-in-only fields (undefined on custom trackers) ──────────────
  // Marks this as a plugin-owned built-in and names which one. Locks the
  // property name/type/range in Settings and selects the special widget.
  builtin?: BuiltinKind;
  // A computed value (the `sleep` built-in): written automatically from other
  // trackers, so it gets no input widget in the daily note — only a column and
  // a chartable frontmatter property.
  derived?: boolean;
  // scale-only: colour the diary calendar's heat map from this tracker (and
  // feed the monthly average). Mirrors settings.moodTrackerId (the single
  // global heatmap source — the calendar can shade one thing); the scale row's
  // "Heatmap" toggle is the control. At most one tracker has this set.
  heatmap?: boolean;
  // scale-only: the ordered picker faces, low→high across min..max (e.g.
  // 😞 😕 😐 🙂 😄, or words like "Low Mid High"). A tap writes the numeric
  // value that face maps to. Kept named `faces` — the historical name — even
  // though a face can now be any short glyph or word.
  faces?: string[];
}

// The chart kinds. line/bar/summary/month read one tracker over time; the two
// added in 2.20 answer questions those can't:
//   scatter — two trackers plotted against each other (one point per entry
//             that has both), for "does more sleep track with better mood?".
//             The only chart that reads two series, so it carries a second
//             tracker on ChartSpec.
//   streak  — for a boolean/habit tracker: the run of consecutive logged-true
//             entries, and the current/longest run. Reads one tracker like the
//             time-series charts but reduces it differently.
export type ChartType =
  | "none"
  | "line"
  | "bar"
  | "summary"
  | "month"
  | "scatter"
  | "streak";
// "period" derives the range from the note's own week-start / month-start
// property (the dashboard's period) instead of a trailing-from-today window,
// so a chart on a weekly/monthly dashboard tracks that dashboard automatically.
// `period` resolves against the host note's own period property (week-start /
// month-start / year-start). `365` is a *rolling* window ending today, which is
// deliberately not the same thing as a calendar year — asking it for "2025"
// would silently give you July-to-July, so the year view scopes charts with
// `period` against a `year-start` note instead of adding a "year" literal here.
export type ChartRange = "period" | "30" | "90" | "365" | "all";

// Which note kind a chart reads its values from (2.18.6).
//
// Identical to TrackerClass by construction, and since 2.19 that is no longer
// a coincidence to be managed but the point: a tracker belongs to one class,
// so its values exist in exactly one folder and the chart's scope is *derived*
// from the tracker rather than asked about (see chart-ui.ts::scopesFor). The
// field survives on ChartSpec because charts already on disk carry it, and
// because a future class could be readable at more than one granularity.
//
// It stays a distinct type rather than an alias so that a class which is not a
// chartable source — should one arrive — doesn't silently become one.
//
// The third value landed in 2.52. `daily-by-month` reads the daily entries and
// buckets them into one point per month, which is the better answer for
// anything already tracked daily: it computes the same twelve points a year
// that a monthly tracker would, out of history that already exists, instead of
// asking the user to start logging a second tracker on the review note.
//
// It waited on a per-tracker choice of reduction, because mean is right for
// Weight and Mood and sum is right for kilometres run, and nothing in
// TrackerType distinguishes them — both are `number`. That choice is
// TrackerDef.reduce now; see it for why the default is mean.
//
// It is what makes a quarter or year chart readable at all. A `period` line
// chart on the year note plots 365 raw daily points and on the quarter 92 —
// PERIOD_TREND_TRAILING_DAYS pins both to no trailing widening, correctly, so
// the window was right and only the resolution was wrong.
export type ChartScope = TrackerClass | "daily-by-month";

// ONE COMPOUND, DELIBERATELY LEFT ALONE.
//
// The 2.58 plan argued that a scope should become a GRAIN plus an optional
// BUCKET, because the compounds multiply — weekly-by-month, daily-by-quarter —
// and a flat union enumerating the product gets long and then wrong. That
// remains the right shape and it is not this patch: restructuring the type
// touches every chart caller, where widening it to the five grains touches the
// collector and nothing else.
//
// So `daily-by-month` stays as the sole legacy compound, and the plan's own
// stopping point is taken rather than invented — §4 records it in advance. The
// signal to do the restructure is a SECOND compound being wanted; adding one
// alongside this is the change that should not be made quietly.

// How several daily values collapse into one bucketed point.
//
// Optional, defaulting to mean, and the asymmetry is deliberate: mean is right
// for every tracker the plugin currently ships (the three scales, Sleep, and
// anything shaped like a measurement), and sum is right only for count-like
// trackers — kilometres run, pages read — which a user adds themselves. A
// wrong mean reads as a plausible number; a wrong sum reads as a wildly
// inflated one, so the safer of the two is the one that applies silently.
//
// TWO READERS SINCE 4.35, and the second is what gives this field a meaning on
// a journal at all. It was written for `daily-by-month` bucketing, which is a
// DIARY path — so on a journal tracker the control that sets it (*"chart by
// month: average / total"*) was visibly present and did nothing whatever.
// `journal-totals` reads it as the answer to "does this quantity add up",
// which is the same question the diary asks and the only one this field has
// ever encoded. Duration and Distance say `sum` and land in the totals band;
// Intensity and `confidence` say nothing and stay out of it.
export type ChartReduce = "mean" | "sum";

// How much of the chart grid one chart occupies (2.46).
//
// Named rather than dimensional ("2x1"), for two reasons. The grid's column
// count is a variable (`--ca-chart-cols`, styles.css), so a span is stored as
// "wider than one column" rather than "two columns" and survives the grid being
// widened to three or four without every directive on disk meaning something
// different. And they read in the editor dropdown without a legend — "Wide" is
// self-describing where "2x1" needs to be told which number is which.
//
// The cols/rows each name maps to lives in exactly one table (SPAN_CELLS in
// charts.ts) so the vocabulary and its geometry can't drift apart.
export type ChartSpan = "small" | "wide" | "tall" | "large";

export function getTracker(
  plugin: ChronoAnvilPlugin,
  id: string
): TrackerDef | undefined {
  return plugin.settings.trackers.find((t) => t.id === id);
}

export function isBuiltin(t: TrackerDef): boolean {
  return t.builtin != null;
}

// Look up a built-in by its kind rather than its (user-facing, relabelable-but-
// not-here) id — so the sleep coupling and heat-map code never hard-code the
// literal "Mood"/"Wake-Up"/"Bedtime" strings.
export function getBuiltinTracker(
  plugin: ChronoAnvilPlugin,
  kind: BuiltinKind
): TrackerDef | undefined {
  return plugin.settings.trackers.find((t) => t.builtin === kind);
}

// Whether an input built-in (mood/wake/bed) is currently turned on — i.e. it
// shows up somewhere. "Off" leaves the definition in the registry (locked,
// re-enableable) but contributes nothing to the template or base.
export function builtinEnabled(t: TrackerDef): boolean {
  return t.showInTemplate || t.showInBase;
}

function isTrackerSurface(v: unknown): v is TrackerSurface {
  if (typeof v !== "object" || v === null) return false;
  const s = v as { kind?: unknown; classes?: unknown; typeId?: unknown };
  if (s.kind === "diary")
    return Array.isArray(s.classes) && s.classes.every(isTrackerClass);
  if (s.kind === "journal") {
    return s.typeId === null || typeof s.typeId === "string";
  }
  if (s.kind === "any") return true;
  return false;
}

// VALIDATION, NOT MIGRATION, and the distinction is why this survived the 2.41
// purge that removed everything around it. `data.json` is a file a user may
// edit by hand, so a tracker can arrive with a surface that is misspelled,
// half-written or absent, and that possibility has no expiry date — unlike the
// pre-2.19 `trackerClass` string this function used to convert, which no
// config in existence carries any more.
//
// So: anything unrecognisable falls back to the daily diary, the surface every
// tracker had before there was a choice. Undefined `showInTemplate` means the
// field is simply missing, and the safe reading of a missing "seed this onto
// every new entry" is no.
function withSurface(t: TrackerDef): TrackerDef {
  const out = { ...t };
  if (!isTrackerSurface(out.surface)) out.surface = diarySurface("daily");
  if (typeof out.showInTemplate !== "boolean") out.showInTemplate = false;
  // Both flags are diary-only (see TrackerDef). Forced rather than trusted:
  // the pair survives a move from a diary surface to a journal one, and a
  // leftover `showInBase: true` would put a column for a journal tracker into
  // Diary.base — blank in every row — and record it in syncedBaseTrackerIds,
  // where the next sync would treat it as a column the plugin owns.
  if (diaryClassOf(out.surface) == null) {
    out.showInTemplate = false;
    out.showInBase = false;
  }
  return out;
}

// Bring a saved tracker list into a consistent shape on load and after any
// structural change. Pure (no Obsidian), so it's unit-testable:
//   • validate each entry's surface, defaulting an unusable one (see
//     withSurface),
//   • re-assert each built-in's locked fields (type, derived, surface) without
//     touching the user's on/off + Mood heatmap/faces choices,
//   • inject any missing input built-in (mood/wake/bed) so they always exist,
//   • treat Wake-Up + Bedtime + Sleep as ONE superset governed solely by
//     `sleepEnabled`: on → all three present and shown together (wake/bed as
//     the coupled control, Sleep as the derived column); off → all three
//     hidden and the derived Sleep dropped entirely,
//   • order the built-ins canonically first, custom trackers after (in order).
// WHICH OF A SET OF INCOMING TRACKERS THE REGISTRY SHOULD GAIN. 4.35 §1.2.
//
// ONE RULE, TWO CALLERS, AND THAT IS THE POINT OF EXTRACTING IT. Adoption
// (`JournalImporter.register`) has applied a manifest's trackers since 3.18
// under exactly this rule; installing a preset needs the same one. Two paths
// that seed the registry from outside it must not hold the rule twice, or the
// day one of them is corrected the other keeps the bug — so the adoption
// path's existing tests now also pin the preset path, which is the proof the
// two really are shared rather than merely alike.
//
// NEVER OVERWRITES AN ID THE VAULT ALREADY DEFINES. An import must not be able
// to redefine `status`, and a preset must not clobber a tracker the reader has
// tuned: a vault that has made `Distance` a date keeps its own, and the widget
// that wanted a number simply omits it. Silence is correct here — the reader
// did not ask to install a tracker, they asked to install a journal.
//
// De-dupes within `incoming` too, so a caller assembling seeds from several
// presets cannot push one id twice; and preserves the order it was given,
// because that is the order the editor will list them in.
//
// Pure: it returns what to ADD and pushes nothing itself.
export function trackersToSeed(
  existing: TrackerDef[],
  incoming: TrackerDef[]
): TrackerDef[] {
  const known = new Set(existing.map((t) => t.id));
  const out: TrackerDef[] = [];
  for (const t of incoming) {
    if (known.has(t.id)) continue;
    known.add(t.id);
    out.push(t);
  }
  return out;
}

export function normalizeTrackers(
  input: TrackerDef[],
  sleepEnabled: boolean
): TrackerDef[] {
  const byKind = new Map<BuiltinKind, TrackerDef>();
  const customs: TrackerDef[] = [];

  for (const raw of input) {
    // Resolve the surface first, so everything below reasons about one shape
    // rather than two — a built-in's locked fields are re-asserted over the
    // converted entry, not over whichever era the config was saved in.
    const t = withSurface(raw);
    const kind = t.builtin;
    if (!kind) {
      customs.push(t);
      continue;
    }
    if (byKind.has(kind)) continue; // dedupe a doubled built-in — first wins
    const tmpl = builtinTemplate(kind);
    // Keep the user's label / on-off toggles / range; re-assert the fields that
    // must stay fixed for the special widgets + coupling to work.
    const merged: TrackerDef = {
      ...t,
      builtin: kind,
      type: tmpl.type,
      derived: tmpl.derived,
      // A built-in's surface is fixed, and not by configuration. Every diary
      // built-in measures a day: Mood asks how today went; Wake-Up and Bedtime
      // are one night's two clock times; Sleep is the hours between them. A
      // month has no night to read the pair against, and "how was July" is a
      // genuinely different question from "how was the 14th" even though both
      // would land in a property called Mood. Re-asserted rather than merely
      // defaulted so a config saved with Mood opted into the monthly review —
      // which 2.18.5 through 2.18.7 allowed — is corrected on load rather than
      // carried forward.
      surface: tmpl.surface,
    };
    // A scale built-in must keep a usable face set. Re-seed from its own
    // template's faces (mood's ☀️ set, energy's ⚡ set…) rather than a single
    // default, so a corrupted Energy doesn't come back wearing Mood's faces.
    // The heatmap flag is only *defaulted* for Mood (the historical source);
    // energy/focus ship with it off, and either can be promoted in Settings.
    if (SCALE_BUILTINS.includes(kind)) {
      if (!Array.isArray(merged.faces) || merged.faces.length < 2) {
        merged.faces = tmpl.faces ? [...tmpl.faces] : [...DEFAULT_MOOD_FACES];
      }
      if (kind === "mood" && merged.heatmap == null) merged.heatmap = true;
    }
    // Wake-Up + Bedtime aren't independently toggleable: they're part of the
    // Sleep superset, so their visibility always tracks `sleepEnabled`.
    if (kind === "wake" || kind === "bed") {
      merged.showInTemplate = sleepEnabled;
      merged.showInBase = sleepEnabled;
    }
    if (kind === "tags") {
      // A list is not a column and not a template seed. `withSurface` already
      // forces both off for any surface without a single diary class, which
      // `any` is; re-asserted here so the reason is written where the built-in
      // is rather than inferred from a guard three functions away.
      merged.showInTemplate = false;
      merged.showInBase = false;
    }
    if (kind === "sleep") {
      // The derived value never takes hand input.
      merged.showInTemplate = false;
      if (merged.unit == null) merged.unit = tmpl.unit;
    }
    byKind.set(kind, merged);
  }

  // Seed any missing input built-in. mood/energy/focus (the scales), the
  // wake/bed pair, and the two journal built-ins — sleep is handled by the
  // block below, keyed on sleepEnabled.
  //
  // The journal pair is seeded unconditionally, without consulting which
  // journal types are registered. That is what `typeId: null` buys: there is
  // nothing per-type to look up, so this stays pure and a vault with no
  // journal types at all simply holds two trackers nothing currently offers —
  // exactly as it already holds Energy and Focus switched off.
  // The scales come from their own templates unchanged: energy and focus ship
  // disabled, so a vault that never turned them on stays exactly as it was, and
  // Mood ships enabled exactly as before. wake/bed track the sleep toggle.
  for (const kind of [
    ...SCALE_BUILTINS,
    "wake",
    "bed",
    ...JOURNAL_BUILTINS,
    // Seeded unconditionally, for `typeId: null`'s reason one step further on:
    // a global tracker has nothing to look up at all, so a vault holds it the
    // moment it loads and puts it wherever the reader puts it.
    "tags",
  ] as const) {
    if (!byKind.has(kind)) {
      const seeded = builtinTemplate(kind);
      if (kind === "wake" || kind === "bed") {
        seeded.showInTemplate = sleepEnabled;
        seeded.showInBase = sleepEnabled;
      }
      byKind.set(kind, seeded);
    }
  }
  if (sleepEnabled) {
    if (!byKind.has("sleep")) byKind.set("sleep", builtinTemplate("sleep"));
  } else {
    byKind.delete("sleep");
  }

  const ordered = BUILTIN_ORDER.map((k) => byKind.get(k)).filter(
    (t): t is TrackerDef => t != null
  );
  return [...ordered, ...customs];
}

// Recompute the derived Sleep value for one note's frontmatter object, in
// place. Called inside a processFrontMatter callback right after a Wake-Up or
// Bedtime write, so the stored hours-asleep never drifts from the two times it
// depends on. No-op when Sleep is disabled or either time is missing.
export function recomputeSleepInFrontmatter(
  plugin: ChronoAnvilPlugin,
  fm: Record<string, unknown>
): void {
  const wake = getBuiltinTracker(plugin, "wake");
  const bed = getBuiltinTracker(plugin, "bed");
  const sleep = getBuiltinTracker(plugin, "sleep");
  if (!wake || !bed || !sleep) return;
  const hrs = sleepHours(fm[bed.id], fm[wake.id]);
  if (hrs == null) delete fm[sleep.id];
  else fm[sleep.id] = hrs;
}

// ── Deriving a property name from a label ────────────────────────────────
//
// A tracker's `id` is its frontmatter key; its `label` is what a human reads.
// They were two independent fields, and the second one nobody asked for: a
// reader who types "🏃 KM" wants the property to be KM, and the only thing the
// separate field bought them was the chance to leave it on `NewTracker3` and
// find that spelling in their notes a month later. So the id now FOLLOWS the
// label until the reader says otherwise (settings-editors.ts) — the same move
// the journal-type editor already makes with its name → id, for the same
// reason.
//
// What comes out has to be usable as a YAML key without quoting and readable
// in the properties panel, so:
//   • the leading emoji goes — it is decoration on the label, and an emoji in
//     a frontmatter key is a key nobody can type into a Bases filter;
//   • words join in PascalCase rather than keeping their spaces, because a
//     spaced key has to be quoted the moment anything touches it
//     programmatically, and the built-ins ("Mood", "Sleep") set the precedent;
//   • a word's existing capitalisation survives, so "KM" stays "KM" rather
//     than becoming "Km".
//
// Pure and exported for the tests: the whole value of deriving this is that it
// is predictable, and a derivation nobody can assert on is not.
export function propertyNameFromLabel(label: string): string {
  // Split on anything that isn't a letter or a digit. `\p{L}`/`\p{N}` rather
  // than [a-z0-9] so an accented or non-Latin label produces a key rather than
  // producing nothing at all — an emoji is neither, so it drops out here
  // without needing its own pass.
  const words = label.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return words
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

// The same, made unique against the ids already in use. `exclude` is the
// tracker being edited, which must not collide with itself.
export function uniquePropertyName(
  base: string,
  taken: Iterable<string>,
  exclude?: string
): string {
  const used = new Set(taken);
  if (exclude != null) used.delete(exclude);
  if (base === "") return "";
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}${n++}`;
  return id;
}

// Parse a select tracker's "val=Label,val2=Label2" into pairs, same
// grammar the `select:` widget directive already uses.
export function parseSelectOptions(
  raw: string | undefined
): { value: string; label: string }[] {
  return (raw ?? "")
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf("=");
      return eq === -1
        ? { value: pair, label: pair }
        : { value: pair.slice(0, eq).trim(), label: pair.slice(eq + 1).trim() };
    });
}

// ── Sync into vault ───────────────────────────────────────────────────
// Pushes the current tracker list into the live daily template (frontmatter
// keys + the ```chronoanvil widget block) and Diary.base (columns), so defining
// a tracker once in Settings is enough — no hand-editing template files.
// Idempotent and safe to call after every structural settings change: it
// only ever touches the plugin-managed region (bounded by TRACKER_MARK_*
// comments) or, in Diary.base, the columns it remembers creating itself.
export async function syncTrackersIntoVault(
  app: App,
  plugin: ChronoAnvilPlugin
): Promise<void> {
  const parts: string[] = [];
  for (const cls of TRACKER_CLASSES) {
    if (await syncEntryTemplate(app, plugin, cls)) {
      parts.push(`${CLASS_DEFS[cls].adjective} template`);
    }
  }
  if (await syncDiaryBase(app, plugin)) parts.push("Diary.base");

  new Notice(
    parts.length === 0
      ? "ChronoAnvil: trackers already in sync ✅"
      : `ChronoAnvil: synced trackers into ${parts.join(" + ")} ✅`
  );
}

// ── Entry scopes ─────────────────────────────────────────────────────────
// An entry's scope *is* its tracker class: the daily note takes the daily
// trackers, the monthly review the monthly ones. Kept as a distinct name
// because the two read differently at the call site — a note has a scope, a
// tracker has a class — but they are one set of values by construction, so a
// new class arrives on both sides at once and can't be added to one and
// forgotten on the other.
export type EntryScope = TrackerClass;

// The template a class owns, and the membership test for it. Membership is the
// conjunction the class system exists to enforce: right class AND opted into
// the template. Before 2.19 only the second half existed, which is how a daily
// module could reach the monthly review.
function templatePath(plugin: ChronoAnvilPlugin, cls: TrackerClass): string {
  return `${plugin.settings.paths.templatesDiary}/${CLASS_DEFS[cls].templateFile}`;
}

function showsIn(cls: TrackerClass): (t: TrackerDef) => boolean {
  return (t) => diaryClassOf(t.surface) === cls && t.showInTemplate;
}

// The trackers a given surface may use at all, template-seeded or not. This is
// what the per-entry picker offers, and it is the only place the rule "a
// tracker belongs to one surface" turns into "this note may not have that
// widget".
export function trackersOnSurface(
  trackers: TrackerDef[],
  surface: TrackerSurface
): TrackerDef[] {
  return trackers.filter((t) => surfaceAdmits(t.surface, surface));
}

// ── Which surface a note is ──────────────────────────────────────────────
//
// Pure so it can be unit-tested and so the widget renderer, the picker and the
// commands all decide identically — three answers to "is this a monthly note?"
// is how a rule like this rots.
//
// For a diary entry the `journal` property wins over the folder, because it is
// what the entry itself says it is and what Diary.base and the search filters
// already key off; a note moved out of its folder is still a monthly review.
// The folders are the fallback for an entry whose frontmatter is missing or
// hand-mangled, and the diary templates are named explicitly because a
// template is not in either folder yet is unambiguously of its class.
//
// A journal note has no equivalent of the `journal` property — its `type:`
// frontmatter names the note *kind* (lesson, practice), not the journal type —
// so it resolves by path alone, against each registered type's root.
//
// A journal type's own templates live under its templatesFolder, which is not
// under its root, so they resolve to null. That is deliberate now: unlike a
// diary template, nothing regenerates them, so a directive written there is
// the user's and should stay (see TrackerDef.showInTemplate).
// One registered journal type's root, for resolving a journal surface from a
// path. A type's own `root(plugin)` is a settings value, so this is resolved
// by the caller (entry-trackers.ts::noteSurfaceOf) and passed in — classifyNote
// stays pure.
export interface JournalRootRef {
  typeId: string;
  root: string;
  // The `type` frontmatter values this journal recognises as its own notes
  // (journal.ts::recognisedTypeValues). Optional so the diary-only callers can
  // keep passing a bare {typeId, root}; when absent the path test stands alone,
  // which is the pre-2.34 behaviour.
  types?: string[];
}

export interface EntryPathConfig {
  // THE TREE'S ROOT (4.81), OPTIONAL. A 4.81 entry lives in no grain folder —
  // it is inside the periods that contain it — so the prefix pass below needs
  // to know where the diary is. Optional because the five grain keys are not:
  // a caller with an old-shaped config keeps the folder pass and loses only the
  // classification of notes it cannot have yet.
  diaryRoot?: string;
  // Optional for the same reason: only the dashboard pass reads it.
  diaryDashboards?: string;
  diaryDaily: string;
  diaryWeekly: string;
  diaryMonthly: string;
  diaryQuarterly: string;
  diaryYearly: string;
  templatesDiary: string;
  // Optional so the diary-only callers (the template sync, the reading count)
  // can keep passing plugin.settings.paths unchanged.
  journalRoots?: JournalRootRef[];
}

function pathInFolder(notePath: string, folder: string): boolean {
  return folder !== "" && (notePath === folder || notePath.startsWith(`${folder}/`));
}

// The journal type a note belongs to, by path, or null.
//
// LONGEST ROOT WINS. Until 2.45 this was load-bearing for the default layout:
// Study's root was `paths.journalsRoot` itself while a custom journal's derived
// root is `${journalsRoot}/${name}`, so every custom-journal note sat under
// *both* roots and Study's was the shorter one — matching in registration order
// resolved the lot to Study. Study now owns one folder under the journals root
// like everything else, so the default roots are disjoint siblings. The rule
// stays because a root is a settings value: nothing stops one type's root being
// pointed inside another's, and this is the only reading of that which doesn't
// depend on declaration order.
//
// Ties can't happen: the custom-journal editor refuses a root already claimed
// by another type (settings-editors.ts), because two types sharing one root
// would make this a coin flip rather than a rule.
export function journalTypeOfPath(
  roots: JournalRootRef[],
  notePath: string
): string | null {
  return journalRootFor(roots, notePath)?.typeId ?? null;
}

// The same rule, returning the whole ref — classifyNote needs the recognised
// type values off it, and two copies of longest-root-wins is exactly the sort
// of duplication that rule's own comment warns about.
export function journalRootFor(
  roots: JournalRootRef[],
  notePath: string
): JournalRootRef | null {
  const byDepth = [...roots].sort((a, b) => b.root.length - a.root.length);
  for (const r of byDepth) {
    if (pathInFolder(notePath, r.root)) return r;
  }
  return null;
}

// Which surface a note presents: a diary class, a journal type, or null.
//
// The diary passes run first and are unchanged — the `journal` property, then
// the diary folders, then the diary templates. A diary entry is never under a
// journal root, so the two halves cannot disagree, and putting the journal
// pass last means a vault that points a diary folder inside the journals root
// still reads its entries as diary entries.
//
// Null means *unclassified*, and unclassified stays deliberately permissive —
// the homepage, a weekly dashboard, a scratch file. The surface rule exists to
// keep entries from borrowing each other's modules, not to police tracker
// grids wherever else someone puts one.
// WHAT A NOTE IS, ONCE.
//
// One resolver for both surfaces, introduced in 2.59.1. `classifyNote` below is
// now a thin adapter over it, and it answers in the vocabulary a caller
// actually wants: a diary note has a GRAIN, a journal note has a TYPE. The
// TrackerSurface it used to return is a tracker's *scope*, which is a different
// idea that happened to share a shape — a surface can name several grains,
// where a note is exactly one thing.
//
// The value is not tidiness. Every cross-cutting feature has to ask about both
// halves of the vault, and two entry points is a standing invitation to handle
// the half you were thinking about: `entryContext` ran its own
// journal-property-or-folder test until 2.58.1 and could have drifted from this
// one silently, because both returned plausible answers.
//
// Null means UNCLASSIFIED, and unclassified is permissive. The surface rule
// exists to stop entries borrowing each other's modules, not to police notes
// the plugin does not understand.
export type NoteKind =
  | { surface: "diary"; grain: TrackerClass }
  | { surface: "journal"; typeId: string };

export function noteKindOf(
  paths: EntryPathConfig,
  notePath: string,
  journalProperty?: unknown,
  noteType?: unknown
): NoteKind | null {
  const journal =
    typeof journalProperty === "string" ? journalProperty.trim() : "";

  // Declared kind first, then folder, then template path. A note that SAYS what
  // it is outranks where it sits, so a daily entry filed somewhere odd is still
  // a daily entry.
  for (const grain of TRACKER_CLASSES) {
    if (journal !== "" && journal === CLASS_DEFS[grain].journalProperty) {
      return { surface: "diary", grain };
    }
  }
  // THEN THE FILENAME, INSIDE THE DIARY (4.81). The period tree files
  // `Day-2026-08-29.md` under `Year-2026/Quarter-2026-Q3/Month-2026-08/
  // Week-2026-W35/`, which is in NO grain folder — so the folder pass below,
  // alone, classified every entry written after 4.81 as null.
  //
  // The prefix is a real declaration and not a guess: `entryNoteName` writes it
  // from `CLASS_DEFS[grain].filePrefix`, the same table read here, and the five
  // prefixes are mutually exclusive. Scoped to the diary root so a reader's
  // `Week-in-review.md` elsewhere in the vault is not swept up.
  if (paths.diaryRoot != null && pathInFolder(notePath, paths.diaryRoot)) {
    const name = basename(notePath);
    for (const grain of TRACKER_CLASSES) {
      if (name.startsWith(CLASS_DEFS[grain].filePrefix)) {
        return { surface: "diary", grain };
      }
    }
  }
  // The four period dashboards, at either address. Before the folder pass
  // because it answers the same question exactly where that one used to: until
  // 4.81 a dashboard WAS its grain folder's note, and moving the file into
  // `Dashboards/` would otherwise have made the weekly dashboard gainless.
  const dashboard = dashboardGrainOf(paths, notePath);
  if (dashboard) return { surface: "diary", grain: dashboard };
  // The grain folders, for every vault written before 4.81 — and for a reader
  // who keeps filing entries there by hand.
  for (const grain of TRACKER_CLASSES) {
    if (pathInFolder(notePath, paths[CLASS_DEFS[grain].folderKey])) {
      return { surface: "diary", grain };
    }
  }
  for (const grain of TRACKER_CLASSES) {
    if (
      notePath === `${paths.templatesDiary}/${CLASS_DEFS[grain].templateFile}`
    ) {
      return { surface: "diary", grain };
    }
  }

  // Path first, then the note's own `type`. Study's root is the whole journals
  // tree, so the path test alone made every stray note under it a Study note —
  // and two separate refusals (describeSurfaceMismatch since 2.27,
  // journalChartRefusal since 2.32) then told that note it was in the wrong
  // journal. See journal.ts::journalTypeOfNote for the full history.
  const ref = journalRootFor(paths.journalRoots ?? [], notePath);
  if (!ref) return null;
  if (ref.types && ref.types.length > 0) {
    const value = normaliseTypeValue(noteType);
    if (value == null || !ref.types.includes(value)) return null;
  }
  return { surface: "journal", typeId: ref.typeId };
}

// A note's kind, expressed as the tracker surface that may be logged on it.
//
// Kept as an adapter rather than removed: a NOTE's surface is a set of one, and
// every caller comparing a tracker's surface against a note's wants that shape.
// Making them all unwrap a NoteKind would push the conversion to a dozen sites
// instead of holding it here.
export function classifyNote(
  paths: EntryPathConfig,
  notePath: string,
  journalProperty?: unknown,
  noteType?: unknown
): TrackerSurface | null {
  const kind = noteKindOf(paths, notePath, journalProperty, noteType);
  if (kind == null) return null;
  return kind.surface === "diary"
    ? diarySurface(kind.grain)
    : journalSurface(kind.typeId);
}

// The folders a surface's readings live in. One for a diary class or a single
// journal type; every journal root for a `typeId: null` built-in.
export function surfaceFolders(
  paths: EntryPathConfig,
  surface: TrackerSurface
): string[] {
  if (surface.kind === "any") {
    // Everywhere readings could live. Nothing asks this of a global tracker
    // today — the one that exists neither charts nor syncs a column — and
    // answering with the union rather than with nothing is what keeps that a
    // fact about this tracker instead of a hole in the function.
    const diary = TRACKER_CLASSES.map((c) => paths[CLASS_DEFS[c].folderKey]);
    const journals = (paths.journalRoots ?? []).map((r) => r.root);
    return [...diary, ...journals].filter(Boolean);
  }
  if (surface.kind === "diary") {
    const folder = paths[CLASS_DEFS[surface.classes[0]].folderKey];
    return folder ? [folder] : [];
  }
  const roots = paths.journalRoots ?? [];
  if (surface.typeId == null) return roots.map((r) => r.root).filter(Boolean);
  const hit = roots.find((r) => r.typeId === surface.typeId);
  return hit?.root ? [hit.root] : [];
}

function diaryBasePath(plugin: ChronoAnvilPlugin): string {
  return `${plugin.settings.paths.infrastructureRoot}/Diary.base`;
}

// Replace the lines strictly between a start/end marker (both kept,
// neither line touched) with `body`. If the markers are missing, `body`
// is appended just before `fallbackBefore` (or at the end) with markers
// added fresh — so older vaults, or an unmanaged template, self-repair on
// first sync instead of silently doing nothing.
function spliceMarkedRegion(
  lines: string[],
  body: string[],
  fallbackInsertAt: number
): { lines: string[]; changed: boolean } {
  const startIdx = lines.findIndex((l) => isTrackerMarkStart(l));
  const endIdx = lines.findIndex((l) => isTrackerMarkEnd(l));

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = lines.slice(0, startIdx + 1);
    const after = lines.slice(endIdx);
    const current = lines.slice(startIdx + 1, endIdx);
    const changed = current.join("\n") !== body.join("\n");
    return { lines: [...before, ...body, ...after], changed };
  }

  // Markers missing — insert a fresh managed region.
  const insertAt = Math.min(fallbackInsertAt, lines.length);
  const region = [TRACKER_MARK_START, ...body, TRACKER_MARK_END];
  return {
    lines: [...lines.slice(0, insertAt), ...region, ...lines.slice(insertAt)],
    changed: true,
  };
}

// A fenced code block: `open` is the index of its opening ```chronoanvil line,
// `close` the index of its closing ``` line.
interface FencedBlock {
  open: number;
  close: number;
}

// Every ```chronoanvil fenced block occurring after line index `after`.
function findChronoAnvilBlocks(lines: string[], after: number): FencedBlock[] {
  const blocks: FencedBlock[] = [];
  let i = after + 1;
  while (i < lines.length) {
    if (lines[i].trim() === FENCE_OPEN) {
      const close = lines.findIndex((l, j) => j > i && l.trim() === FENCE_CLOSE);
      if (close === -1) break; // unterminated fence — give up
      blocks.push({ open: i, close });
      i = close + 1;
    } else {
      i++;
    }
  }
  return blocks;
}

function blockInner(lines: string[], block: FencedBlock): string[] {
  return lines.slice(block.open + 1, block.close);
}

// A `nav` block is one whose body contains the bare `nav` directive. Tracker
// directives must never be *inserted* into it — mixing the two is exactly the
// duplication this guards against.
function blockIsNav(lines: string[], block: FencedBlock): boolean {
  return blockInner(lines, block).some((l) => l.trim() === "nav");
}

function blockHasTrackerRegion(lines: string[], block: FencedBlock): boolean {
  return blockInner(lines, block).some((l) => isTrackerMarkStart(l));
}

// Drop the marker-bounded tracker region (markers included) from a block's
// body lines. Used to undo a region an older, buggy sync mistakenly wrote
// into the nav block.
function removeTrackerRegion(
  inner: string[]
): { lines: string[]; changed: boolean } {
  const s = inner.findIndex((l) => isTrackerMarkStart(l));
  const e = inner.findIndex((l) => isTrackerMarkEnd(l));
  if (s !== -1 && e !== -1 && e >= s) {
    return {
      lines: [...inner.slice(0, s), ...inner.slice(e + 1)],
      changed: true,
    };
  }
  return { lines: inner, changed: false };
}

// Blank frontmatter keys for a template's managed region: one per tracker in
// that scope, plus the derived Sleep key when the scope carries the pair it is
// computed from (so the property is declared even though it's auto-written,
// never hand-entered). Only the daily scope ever does — see normalizeTrackers.
function scopeFrontmatterKeys(
  plugin: ChronoAnvilPlugin,
  scope: EntryScope
): string[] {
  const shows = showsIn(scope);
  const keys = plugin.settings.trackers.filter(shows).map((t) => t.id);
  const wake = getBuiltinTracker(plugin, "wake");
  const bed = getBuiltinTracker(plugin, "bed");
  const sleep = getBuiltinTracker(plugin, "sleep");
  if (sleep && wake && bed && shows(wake) && shows(bed) && !keys.includes(sleep.id)) {
    keys.push(sleep.id);
  }
  return keys.map((id) => `${id}:`);
}

// Widget directives for a template's managed block. Built-ins get their
// special forms: Mood renders via `tracker:Mood` (an emoji-face picker), and
// Wake-Up + Bedtime collapse into a single coupled `sleep` control. The Sleep
// superset is all-or-nothing (governed by settings.sleepEnabled), so whenever
// the derived Sleep exists both times are shown and always couple. Everything
// else is a plain `tracker:<id>`.
function scopeWidgetLines(
  plugin: ChronoAnvilPlugin,
  scope: EntryScope
): string[] {
  const shows = showsIn(scope);
  const members = plugin.settings.trackers.filter(shows);
  const wake = getBuiltinTracker(plugin, "wake");
  const bed = getBuiltinTracker(plugin, "bed");
  const sleepOn = getBuiltinTracker(plugin, "sleep") != null;
  const coupled = sleepOn && !!wake && shows(wake) && !!bed && shows(bed);

  const out: string[] = [];
  let emittedSleep = false;
  for (const t of members) {
    if (coupled && (t.builtin === "wake" || t.builtin === "bed")) {
      // One `sleep` widget stands in for the wake+bed pair.
      if (!emittedSleep) {
        out.push("sleep");
        emittedSleep = true;
      }
      continue;
    }
    out.push(`tracker:${t.id}`);
  }
  return out;
}

async function syncEntryTemplate(
  app: App,
  plugin: ChronoAnvilPlugin,
  scope: EntryScope
): Promise<boolean> {
  const file = getFile(app, templatePath(plugin, scope));
  if (!file) return false; // template not scaffolded yet — nothing to sync

  const original = await app.vault.read(file);
  const lines = original.split("\n");

  // 1. Frontmatter keys: one blank "Id:" per daily tracker (+ derived Sleep),
  //    inside the first "---" ... "---" block only.
  const fmEnd = lines.indexOf("---", 1);
  const fmBody = scopeFrontmatterKeys(plugin, scope);
  let fmChanged = false;
  let afterFm = lines;
  let fmEndAdjusted = fmEnd;
  if (fmEnd !== -1) {
    const spliced = spliceMarkedRegion(lines.slice(0, fmEnd), fmBody, fmEnd);
    fmChanged = spliced.changed;
    afterFm = [...spliced.lines, ...lines.slice(fmEnd)];
    fmEndAdjusted = spliced.lines.length; // "---" now sits here
  }

  // 2. Widget block: one `tracker:<id>` directive per daily tracker, inside
  //    the dedicated ```chronoanvil block that hosts the tracker region.
  //
  //    The template ships with *two* chronoanvil blocks — a `nav` block and a
  //    separate trackers block — so "the first chronoanvil block after
  //    frontmatter" is the wrong target: it's the nav block. Dropping a
  //    fresh tracker region there duplicated the whole section, since the
  //    real region already lived (correctly) in the second block. We instead
  //    pick the block that actually hosts trackers, and never *insert* into
  //    a nav block.
  const widgetBody = scopeWidgetLines(plugin, scope);
  let finalLines = afterFm;
  let widgetChanged = false;

  const blocks = findChronoAnvilBlocks(afterFm, fmEndAdjusted);

  // Self-heal a vault already corrupted by the old logic: if a real trackers
  // block exists elsewhere, strip any tracker region that leaked into a nav
  // block. Requiring that a non-nav block already owns the region means we
  // only ever remove a genuine duplicate — never a region a user chose to
  // place alongside `nav` in a single hand-merged block.
  const canonicalExists = blocks.some(
    (b) => !blockIsNav(afterFm, b) && blockHasTrackerRegion(afterFm, b)
  );
  if (canonicalExists) {
    // Right-to-left so earlier block indices stay valid as we edit above them.
    for (const block of [...blocks].reverse()) {
      if (!blockIsNav(afterFm, block)) continue;
      const stripped = removeTrackerRegion(blockInner(afterFm, block));
      if (!stripped.changed) continue;
      afterFm = [
        ...afterFm.slice(0, block.open + 1),
        ...stripped.lines,
        ...afterFm.slice(block.close),
      ];
      widgetChanged = true;
    }
  }

  // Choose the block to sync into, in order of preference:
  //   1. a non-nav block that already holds the tracker region (canonical),
  //   2. otherwise the first non-nav block (fresh region inserted safely),
  //   3. otherwise a nav block that already holds the region — safe, since
  //      splicing only touches the marker-bounded span, leaving `nav` intact
  //      (covers a deliberate hand-merged block).
  // If none qualifies (e.g. only a bare nav block, or no chronoanvil block at
  // all), widget placement is left to the user; frontmatter keys are still
  // synced above.
  const current = findChronoAnvilBlocks(afterFm, fmEndAdjusted);
  const nonNav = current.filter((b) => !blockIsNav(afterFm, b));
  const target =
    nonNav.find((b) => blockHasTrackerRegion(afterFm, b)) ??
    nonNav[0] ??
    current.find((b) => blockHasTrackerRegion(afterFm, b));

  if (target) {
    const inner = blockInner(afterFm, target);
    const spliced = spliceMarkedRegion(inner, widgetBody, inner.length);
    finalLines = [
      ...afterFm.slice(0, target.open + 1),
      ...spliced.lines,
      ...afterFm.slice(target.close),
    ];
    widgetChanged = widgetChanged || spliced.changed;
  }

  const updated = finalLines.join("\n");
  if (updated === original) return false;
  await app.vault.modify(file, updated);
  return fmChanged || widgetChanged;
}

// Whether a Diary.base view can hold a column for `cls`.
//
// A view scoped to one class never holds another's readings, so giving it
// those columns adds nothing but empty space — the shipped "Monthly Entries"
// view would gain Mood, Wake-Up and Bedtime columns that are blank in every
// row by construction.
//
// Eligibility is read off the view's own filter text: a view is excluded only
// when it names *another* class's `journal` value. An unfiltered view (the
// shipped "Recent Entries", which mixes both) names none, so it takes every
// class's columns — right, because it is the one view where a monthly reading
// and a daily one legitimately share a table.
//
// Matching on the filter string rather than parsing the expression is
// deliberate. Bases filters are a small expression language the plugin doesn't
// own, and a substring test degrades safely in the direction that costs least:
// a filter this misreads gains a column it didn't need, which is visible and
// removable. A parser that misreads one drops a column silently, or throws
// mid-sync and leaves the file half-written.
//
// Pure and exported so the rule can be tested directly — the sync around it
// needs a vault.
export function viewAcceptsClass(
  filters: unknown,
  cls: TrackerClass
): boolean {
  const text = typeof filters === "string" ? filters : "";
  return TRACKER_CLASSES.every(
    (other) => other === cls || !text.includes(CLASS_DEFS[other].journalProperty)
  );
}

async function syncDiaryBase(
  app: App,
  plugin: ChronoAnvilPlugin
): Promise<boolean> {
  const file = getFile(app, diaryBasePath(plugin));
  if (!file) return false; // Diary.base not scaffolded yet

  const original = await app.vault.read(file);
  // Diary.base is a user-editable YAML document with a dynamic, open-ended
  // shape (arbitrary `properties`/`views` keys the plugin and the user both
  // write). Typing it precisely buys little and fights every access below, so
  // it stays `any` deliberately.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let doc: any;
  try {
    doc = parseYaml(original) ?? {};
  } catch (e) {
    console.error("[ChronoAnvil] could not parse Diary.base, skipping sync", e);
    return false;
  }
  if (typeof doc !== "object" || doc === null) doc = {};

  const previouslySynced = new Set(plugin.settings.syncedBaseTrackerIds);
  // Diary surfaces only. Diary.base holds diary entries, so a journal
  // tracker's column would be blank in every row by construction — and the
  // view-selection below is keyed on the tracker's class, which a journal
  // surface has none of. normalizeTrackers forces the flag off for a journal
  // surface as well; this is the second half of the same rule, kept here so
  // the sync is correct even if it is ever handed an un-normalised list.
  const wantBase = plugin.settings.trackers.filter(
    (t) => t.showInBase && diaryClassOf(t.surface) != null
  );
  const wantIds = new Set(wantBase.map((t) => t.id));

  doc.properties = doc.properties ?? {};
  let changed = false;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orderedViews: any[] = (doc.views ?? []).filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (view: any) => Array.isArray(view.order)
  );

  // Which views each class's columns belong in (see viewAcceptsClass).
  // Resolved once per class rather than per tracker: the answer depends only
  // on the class, and the sweep below compares by object identity.
  const viewsByClass = new Map(
    TRACKER_CLASSES.map((cls) => [
      cls,
      orderedViews.filter((view) => viewAcceptsClass(view.filters, cls)),
    ])
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const viewsForClass = (cls: TrackerClass): any[] => viewsByClass.get(cls) ?? [];

  // Add/update columns for trackers currently marked showInBase.
  for (const t of wantBase) {
    const key = t.id;
    const existing = doc.properties[key];
    if (!existing || existing.displayName !== t.label) {
      doc.properties[key] = { ...existing, displayName: t.label };
      changed = true;
    }
    for (const view of viewsForClass(diaryClassOf(t.surface) as TrackerClass)) {
      if (!view.order.includes(key)) {
        view.order.push(key);
        changed = true;
      }
    }
  }

  // Remove columns for trackers the plugin previously added but which are
  // no longer showInBase (renamed, deleted, toggled off — or reclassified, so
  // its column now belongs in a different set of views). Every ordered view is
  // swept rather than only the ones the tracker's *current* class would have
  // written to: after a class change those are precisely the wrong ones, and
  // the stale column would sit in the view nobody is looking at any more.
  // Still narrow in the way that matters — only ids the plugin recorded adding
  // are touched, so a column the user added by hand is never removed.
  for (const oldId of previouslySynced) {
    if (wantIds.has(oldId)) continue;
    if (doc.properties && oldId in doc.properties) {
      delete doc.properties[oldId];
      changed = true;
    }
    for (const view of orderedViews) {
      const idx = view.order.indexOf(oldId);
      if (idx !== -1) {
        view.order.splice(idx, 1);
        changed = true;
      }
    }
  }

  // A tracker that stayed in the base but changed class has a column sitting
  // in views it no longer belongs to. It isn't in `previouslySynced`'s removal
  // pass (it is still wanted), so sweep the views its class now excludes —
  // but only for a column the plugin itself put there, keeping the same
  // hands-off rule as the pass above.
  for (const t of wantBase) {
    if (!previouslySynced.has(t.id)) continue;
    const allowed = new Set(
      viewsForClass(diaryClassOf(t.surface) as TrackerClass)
    );
    for (const view of orderedViews) {
      if (allowed.has(view)) continue;
      const idx = view.order.indexOf(t.id);
      if (idx !== -1) {
        view.order.splice(idx, 1);
        changed = true;
      }
    }
  }

  plugin.settings.syncedBaseTrackerIds = Array.from(wantIds);
  await plugin.saveSettings();

  if (!changed) return false;
  // OBSIDIAN'S YAML, NOT js-yaml. Both are the same library underneath —
  // Obsidian bundles it — but reaching it through the host means the plugin
  // ships no YAML parser of its own, which is a smaller bundle and one less
  // third-party advisory to answer for on a public listing.
  //
  // `stringifyYaml` takes no options, so the `{ lineWidth: -1 }` this used to
  // pass is no longer ours to set. THAT IS NOT LOAD-BEARING, and the test
  // beside it says so rather than leaving it to be assumed: a folded emission
  // reparses to the same document, because YAML folding of a quoted scalar
  // reads back as the single space it replaced. What line width changes is how
  // the file LOOKS after a sync, not what Bases reads out of it — and Bases
  // reads it with this same parser.
  const out = stringifyYaml(doc);
  await app.vault.modify(file, out);
  return true;
}

// ── Referential integrity: trackers that name a journal type ─────────────
//
// A tracker's surface may name a journal type by id, and a journal type can be
// deleted. Until 2.41 deletion was a bare `splice` out of `customJournals`,
// which left every tracker scoped to that type as a zombie: `describeSurface`
// falls back to the raw id, so it went on rendering under a heading for a type
// that no longer existed, while `surfaceAdmits` could never match it again
// because no note could classify as that type. Invisible to every picker, and
// still occupying the registry and data.json.
//
// The rule is that a delete must SAY what it is about to do to them, and the
// two honest answers are both offered — neither is obviously right. Widening a
// tracker to all journals keeps the readings already written and reachable;
// deleting it is what someone removing a whole journal usually means. Silently
// orphaning is the only answer that is definitely wrong.

// The trackers whose surface names `typeId`. Never the `typeId: null`
// wildcard: it means "every registered journal", so it survives any one
// of them going away.
export function trackersScopedToType(
  trackers: TrackerDef[],
  typeId: string
): TrackerDef[] {
  return trackers.filter(
    (t) => t.surface.kind === "journal" && t.surface.typeId === typeId
  );
}

export type OrphanResolution = "widen" | "delete";

// Apply a resolution, returning the new tracker list. Pure, so the settings tab
// and any future caller (a vault repair, a command) resolve identically.
export function resolveOrphanedTrackers(
  trackers: TrackerDef[],
  typeId: string,
  how: OrphanResolution
): TrackerDef[] {
  const orphaned = new Set(trackersScopedToType(trackers, typeId).map((t) => t.id));
  if (orphaned.size === 0) return trackers;
  if (how === "delete") return trackers.filter((t) => !orphaned.has(t.id));
  return trackers.map((t) =>
    orphaned.has(t.id) ? { ...t, surface: journalSurface(null) } : t
  );
}

// Every journal-type id a tracker names but no registered type provides.
//
// Reported rather than repaired, in the same spirit as pathwatch's rename
// notice: a dangling id can also mean a type the user is midway through
// re-creating, and silently rewriting their registry would be the plugin
// making that decision for them.
export function danglingTypeIds(
  trackers: TrackerDef[],
  registeredIds: Set<string>
): string[] {
  const out = new Set<string>();
  for (const t of trackers) {
    if (t.surface.kind !== "journal") continue;
    const id = t.surface.typeId;
    if (id != null && !registeredIds.has(id)) out.add(id);
  }
  return [...out];
}
