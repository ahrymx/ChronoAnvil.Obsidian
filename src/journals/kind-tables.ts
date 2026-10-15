// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// What ONE INDEX NOTE says about one of its note types' tables. 1.0.33.
//
// ── THE READER'S ASK, AND WHY 1.0.32 DID NOT COVER IT ────────────────────
//
// *"that works for defaults, but there's no over-ride per index note-kind. A
// user might have added new note types into a topic, or maybe even, changed
// their mind for what they want 'Lessons' to be rated on for that particular
// index page."*
//
// 1.0.32 gave a kind its own column headings, and that answer is a fact about
// the JOURNAL: every Study topic in the vault calls the column whatever the
// Lesson kind calls it. Which is right for the common case and has no way of
// saying *on this page*. A topic whose lessons are worth grading on accuracy
// rather than confidence, or a note type a reader added for one subject, wants
// an answer that is one index note wide.
//
// ── IN THE NOTE'S FRONTMATTER, ON `pagelayout`'S PRECEDENT ───────────────
//
// `setPageTemplate` is the same shape one scope down: a per-NOTE override of a
// journal-level default, written by a `⋯` on the thing it configures, stored as
// one lowercase property. Everything that recommends it there recommends it
// here, and the two alternatives are both worse in a way worth recording:
//
//   * THE `kind-table:` LINE CANNOT CARRY IT. Four places in `journal-plan.ts`
//     decide whether a section's part is present by comparing a line against the
//     part's `probe` LITERALLY — `present.has(p.probe.trim())`. A group whose
//     table line grew an argument would read as missing to `missingParts`, which
//     would compose a second one, AND as a stray id to `strayParts`, which would
//     delete the group. Teaching four comparisons a tolerant match to store a
//     column heading is a change to the reconciler for a change to a word.
//
//   * A PATH-KEYED RECORD IN SETTINGS DIES ON RENAME. `collapsedNoteSections` is
//     keyed `"<notePath>::<title>"` and can afford to: a lost fold costs one
//     click. A lost column heading is the reader's own writing.
//
// ── THE SHAPE, WHICH IS TWO LEVELS AND NOT THREE ─────────────────────────
//
//     kindtables:
//       lesson:
//         rated: accuracy
//         cols: [status, modified]
//         name: Exercise
//         rating: Score
//
// `rated` and `cols` sit beside the headings rather than under a nested
// `headings:` map because neither can collide with one: the heading keys are
// `KIND_COLUMN_KEYS` — `name`, `rating`, `status`, `created`, `modified`,
// `statusdate` — and neither of these is among them. A third level of YAML buys
// nothing and costs a reader looking at their own note two more indents to read
// past.
//
// ── AND `cols` IS WHICH COLUMNS, IN ORDER (1.0.71) ──────────────────────
//
// The reader's ask was about the window rather than the record: *"make columns
// drop-down menus instead of free-text"*, and what the dropdowns choose is
// which columns this page draws. 1.0.67 refused this answer and named the
// reason, which was STORAGE rather than scope:
//
//   *"a presence answer there would have to be a list whose EMPTY value means
//   'none on this page' while its ABSENCE means 'inherit' — a distinction
//   Obsidian's own property editor does not reliably preserve."*
//
// That is still true of a plain list and is why this one is never empty.
// `RATED_NONE` is the same `-` sentinel one field over, doing the same job: a
// page that wants the title alone stores `cols: ["-"]`, which is present and
// says so. Absent is the journal's own answer, as it is for every other field
// here. One spelling per state — `setPageTemplate`'s scar, which this file
// already cites for `rated`.
//
// THE NAME COLUMN IS NOT IN THE LIST, and cannot be. `cols[0]` is the row's
// TITLE — `recordList` draws it as the link a reader presses to open the note
// — so it is not a column a page can move or drop, it is the row. The list is
// everything AFTER it, which is also the only part the window offers.
//
// ── ROLES AGAIN, NOT TRACKER IDS (1.0.32'S RULE, UNCHANGED) ──────────────
//
// The headings are keyed by what the column IS. A page that re-rates its lessons
// from Confidence to Accuracy keeps the word the reader chose for its rating
// column, which is the answer that needs no explaining.

import type { App, TFile } from "obsidian";
import { frontmatterOf } from "../core/util";
import { KIND_COLUMN_KEYS, type KindColumnSource } from "./kind-columns";

// The one property, spelled once.
//
// LOWERCASE AND UNSEPARATED, which is `PAGE_TEMPLATE_KEY`'s shape and the only
// other property this plugin owns on an index note. A `ca-` prefix is this
// codebase's rule for CSS CLASSES and has never been its rule for frontmatter —
// `type`, `date`, `status` and `pagelayout` are all bare.
export const KIND_TABLES_KEY = "kindtables";

// The other property one index note owns: which note types it lists that are
// NOT the journal's own. 1.0.33.
//
// ── THE READER'S ASK, THE SECOND HALF ────────────────────────────────────
//
// *"test!!! was added directly into Web Design index page, but its appearing on
// the settings page (where only the defaults should be, Lesson & Cheatsheet)"*.
//
// A note type added from a card is marked `local` on the journal — it still
// exists there, because a `type:` value, a template and a create button all have
// to resolve — and the journal stops OFFERING it. This is the other half: the
// page that asked for it says so, and `childrenParts` composes a group for a
// local kind exactly where this names it.
//
// ── WHY BOTH HALVES ARE NEEDED, WHICH IS NOT OBVIOUS ─────────────────────
//
// The flag alone would delete the group. `strayParts` removes a `kind-table:`
// line whose id is not among the section's parts — that is 1.0.23's prune, and
// it is how a kind that LEAVES a journal stops drawing a red *"Unknown note
// type"* group on every dashboard. A kind composed for nobody is indistinguish-
// able from a kind nobody has, so the page has to claim it.
//
// The claim alone would not be enough either: without the flag, `missingParts`
// would go on offering the group to every other index note in the journal, which
// is the behaviour being removed.
//
// ── A LIST OF IDS, WHICH IS WHAT OBSIDIAN RENDERS BEST ───────────────────
//
// `kindtables` above is a map because its entries have fields. This has none —
// a page either lists a type or it does not — so it is the plain multi-value
// property Obsidian's own property editor draws as chips.
export const PAGE_TYPES_KEY = "notetypes";

// The ids this page claims, in the order it wrote them.
//
// TOLERANT OF A SCALAR, because a one-entry list is a string as often as it is a
// list once a reader has been through the property editor — the same shape
// `noteTypeOf` and every other frontmatter reader in this plugin accepts.
export function pageTypesIn(fm: Record<string, unknown>): string[] {
  const raw = fm[PAGE_TYPES_KEY];
  const many = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  const out: string[] = [];
  for (const one of many) {
    if (typeof one !== "string") continue;
    const id = one.trim();
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

// The same, off a file — the shape every other frontmatter reader here takes,
// and tolerant of a null file so a caller need not check first.
export function pageTypesOf(app: App, file: TFile | null): string[] {
  return file ? pageTypesIn(frontmatterOf(app, file)) : [];
}

// The list with one id added, or `null` where it is already there.
//
// `null` RATHER THAN THE SAME LIST, so the writer can decline to touch the file
// at all — `setPageTemplate`'s posture, and the reason a second press of the same
// control moves no bytes.
export function withPageType(
  fm: Record<string, unknown>,
  kindId: string
): string[] | null {
  const id = kindId.trim();
  if (!id) return null;
  const here = pageTypesIn(fm);
  if (here.includes(id)) return null;
  return [...here, id];
}

// The list with one id taken out, or `null` where it was never there.
//
// THE OTHER DIRECTION EXISTS BECAUSE THE TYPE CAN OUTLIVE THE PAGE (1.0.33).
// *"removing a non-default page-kind that happens to have been created on two
// different index page is getting removed from both on repair"* — a type listed
// on two cards is removed from ONE of them by taking the claim off that card,
// and the journal keeps the kind for the card that still lists it. Only the last
// card's removal takes the kind off the journal.
export function withoutPageType(
  fm: Record<string, unknown>,
  kindId: string
): string[] | null {
  const here = pageTypesIn(fm);
  if (!here.includes(kindId)) return null;
  return here.filter((id) => id !== kindId);
}

// The value of `rated` that means *this page scores them on nothing*.
//
// A SENTINEL THAT CANNOT BE A TRACKER ID, and `slugify` is what proves it:
// every id is built by lowercasing, replacing every run of non-alphanumerics
// with `-`, and then stripping leading and trailing dashes — so a lone `-`
// slugifies to the empty string and no tracker can ever answer to it.
//
// ABSENT IS NOT THIS. A kind with no `rated` entry inherits the journal's, which
// is the state every index note in every vault is in today; `-` is the reader
// saying no on this page. One word for each, because `setPageTemplate`'s scar is
// exactly the cost of giving one state two spellings.
export const RATED_NONE = "-";

/** What one index note says about one of its note types. */
export interface KindTableOverride {
  /** A tracker id, `RATED_NONE`, or absent for the journal's own answer. */
  rated?: string;
  /**
   * The column roles after the name, in draw order; `[RATED_NONE]` for the
   * title alone; absent for the journal's own answer. Never empty — see the
   * sentinel's note at the top of this file.
   */
  cols?: string[];
  /** Column role → the word this page calls it. */
  headings?: Record<string, string>;
}

const HEADING_KEYS = new Set<string>(KIND_COLUMN_KEYS);

// Everything the note says, by kind id.
//
// TOLERANT OF EVERY SHAPE A READER CAN TYPE, because this property is in their
// frontmatter and Obsidian's property editor will happily turn a map into a
// list. Anything that is not an object of objects is read as nothing said,
// which is the state the vault is in anyway.
export function kindTablesIn(
  fm: Record<string, unknown>
): Record<string, KindTableOverride> {
  const raw = fm[KIND_TABLES_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, KindTableOverride> = {};
  for (const [kindId, value] of Object.entries(raw as Record<string, unknown>)) {
    const one = cleanOverride(value);
    if (one) out[kindId.trim()] = one;
  }
  return out;
}

// One kind's entry, always an object so callers need no null branch.
export function kindTableOverride(
  fm: Record<string, unknown>,
  kindId: string
): KindTableOverride {
  return kindTablesIn(fm)[kindId.trim()] ?? {};
}

// The same, read off a file.
export function kindTableOverrideOf(
  app: App,
  file: TFile | null,
  kindId: string
): KindTableOverride {
  if (!file) return {};
  return kindTableOverride(frontmatterOf(app, file), kindId);
}

// One stored entry, with everything this build does not understand dropped.
//
// A BLANK HEADING IS NOT AN OVERRIDE — `headingOf`'s rule, applied at the read
// as well as at the write, because a reader can empty the box in Obsidian's own
// property editor and a blank word over a column is nobody's answer.
export function cleanOverride(raw: unknown): KindTableOverride | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: KindTableOverride = {};
  const headings: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    // `cols` IS THE ONE LIST-VALUED FIELD, so it is read before the string
    // guard below rather than after it. A reader who typed one value into
    // Obsidian's property editor has a scalar where this expects a list, which
    // is the same tolerance `pageTypesIn` states one property over.
    if (key === "cols") {
      const list = cleanCols(value);
      if (list) out.cols = list;
      continue;
    }
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (!text) continue;
    if (key === "rated") out.rated = text;
    else if (HEADING_KEYS.has(key)) headings[key] = text;
  }
  if (Object.keys(headings).length > 0) out.headings = headings;
  return Object.keys(out).length > 0 ? out : null;
}

// One stored `cols` value as a list of roles, or null for *nothing said*.
//
// EVERY REJECTION IS THE SAME ANSWER AS SAYING NOTHING, which is this file's
// rule for the whole property: an entry a build does not understand reads as
// absent, and absent is the state every vault is already in. An empty list is
// among those rejections — it is the value the sentinel exists to replace, and
// a page that really means the title alone says `["-"]`.
//
// UNKNOWN ROLES ARE KEPT, for `cleanHeadings`' reason: a list written by a
// later build naming a column this one has not got must survive a Save here,
// or opening an old vault in a new one silently prunes it. `kindColumns` is
// where an unknown role draws nothing.
export function cleanCols(raw: unknown): string[] | null {
  const many = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  const out: string[] = [];
  for (const one of many) {
    if (typeof one !== "string") continue;
    const text = one.trim();
    // DE-DUPLICATED, because the window swaps a role between two slots and a
    // record holding it twice would draw the column twice.
    if (!text || out.includes(text)) continue;
    out.push(text);
  }
  return out.length > 0 ? out : null;
}

/** True where the note says nothing at all about this kind. */
export function isBlankOverride(over: KindTableOverride): boolean {
  return (
    over.rated === undefined &&
    over.cols === undefined &&
    over.headings === undefined
  );
}

// One entry rebuilt from its parts, with every empty field left out.
//
// ── WHY THE `with*` FUNCTIONS GO THROUGH THIS (1.0.71) ──────────────────
//
// Each of them changes ONE field and has to carry the others across, and each
// used to spell that carrying out: `withHeading` restated `rated`, `withRated`
// restated `headings`. That shape is correct for exactly as long as the number
// of fields does not change, and the moment `cols` arrived it was two places
// that would silently drop it — the field would survive a rename and vanish on
// the next re-rating, which is a defect a reader sees once and cannot explain.
//
// One builder, three callers: a fourth field is added here and the carrying
// follows. The omit-when-empty rule is the same one `withKindTable` relies on
// — `isBlankOverride` is what decides the entry leaves the note altogether.
function compactOverride(parts: {
  rated?: string;
  cols?: string[];
  headings?: Record<string, string>;
}): KindTableOverride {
  const headings = parts.headings ?? {};
  return {
    ...(parts.rated !== undefined ? { rated: parts.rated } : {}),
    ...(parts.cols && parts.cols.length > 0 ? { cols: [...parts.cols] } : {}),
    ...(Object.keys(headings).length > 0 ? { headings: { ...headings } } : {}),
  };
}

// The kind as THIS PAGE draws it: the journal's answer with the note's over it.
//
// ONE MERGE, AND EVERY READER GOES THROUGH IT. `kindColumns` already takes a
// `KindColumnSource` rather than a `JournalKind` — 1.0.32 made it structural so
// the Settings draft could ask — and that is exactly the seam an override needs.
// Nothing downstream learns that a page can disagree with its journal.
export function pageKind(
  kind: KindColumnSource,
  over: KindTableOverride
): KindColumnSource {
  const rating =
    over.rated === undefined
      ? kind.rating
      : over.rated === RATED_NONE
        ? undefined
        : over.rated;
  const headings = { ...(kind.headings ?? {}), ...(over.headings ?? {}) };
  return {
    label: kind.label,
    ...(rating ? { rating } : {}),
    // THE LIST REPLACES, IT DOES NOT MERGE (1.0.71). A page that names its
    // columns has named all of them — the order is half the answer, and an
    // order merged with another order is not an order. `dates` stays the
    // journal's and is simply not consulted while `cols` is present, which is
    // `kindColumns`' branch rather than a second rule here.
    ...(over.cols ? { cols: [...over.cols] } : kind.dates ? { dates: kind.dates } : {}),
    ...(Object.keys(headings).length > 0 ? { headings } : {}),
  };
}

// What to store for one column, given what the reader typed and what the page
// would say without it.
//
// `packHeadings`' RULE, ONE SCOPE DOWN, and the fallback is the difference. The
// Settings box compares against the DERIVATION, because that is what it would
// fall back to; this compares against the JOURNAL'S OWN WORD, because that is
// what this page would fall back to. Typing the word that is already there
// stores nothing, so a heading a reader did not really change still follows the
// note type when the note type is renamed.
// ── AND THERE IS NO `withHeading` ANY MORE (1.0.72) ────────────────────
//
// *"Remove the pencil to edit the titles, I don't think it is necessary."* The
// window's per-slot rename was this field's only writer, so the writer goes
// with the control rather than sitting here unreachable — `test/dead-code.ts`'
// own subject, and 1.0.69 deleted 324 lines for the same reason.
//
// THE FIELD IS STILL READ, and that is not an oversight. `cleanOverride` takes
// it, `pageKind` lays it over the type's words and `isBlankOverride` counts it,
// so an index page that already carries a word from 1.0.33 keeps drawing it.
// Removing the read would re-word a reader's table on an update, which is a
// worse thing to do to a vault than leaving an answer only Settings can change.
// *Use the note type's own settings* is still the way out of one.

// The same for the rating, where `null` means *stop saying anything*.
export function withRated(
  over: KindTableOverride,
  rated: string | null
): KindTableOverride {
  return compactOverride({
    ...over,
    ...(rated !== null ? { rated } : { rated: undefined }),
  });
}

// The same for the column list, where `null` means *stop saying anything* and
// an empty list means *the title alone*.
//
// THE SENTINEL IS WRITTEN HERE AND NOWHERE ELSE, so no caller has to know it.
// A window hands this what the reader picked — which is a list that can be
// empty, because a reader can take every column off — and the one value that
// cannot be stored is turned into the one that can.
export function withCols(
  over: KindTableOverride,
  cols: readonly string[] | null
): KindTableOverride {
  return compactOverride({
    ...over,
    cols: cols === null ? undefined : cols.length > 0 ? [...cols] : [RATED_NONE],
  });
}

// The whole property, with one kind's entry replaced — or removed where the
// entry has become blank.
//
// `undefined` MEANS DELETE THE PROPERTY, which is `setPageTemplate`'s contract:
// absent is what "the journal's own answer" already spells everywhere else, so
// an empty map left behind would be a second spelling of it sitting in the
// reader's frontmatter for ever.
export function withKindTable(
  fm: Record<string, unknown>,
  kindId: string,
  over: KindTableOverride
): Record<string, KindTableOverride> | undefined {
  const all = kindTablesIn(fm);
  const id = kindId.trim();
  if (isBlankOverride(over)) delete all[id];
  else all[id] = over;
  return Object.keys(all).length > 0 ? all : undefined;
}

// What `processFrontMatter` writes: the flat two-level object, not this
// module's interface.
//
// SEPARATE FROM THE MERGE ABOVE because the stored shape and the read shape are
// deliberately different — `headings` is a nested map in here and is flattened
// onto the entry on disk, for the reason at the top of this file. One function
// does the flattening so the writer cannot invent a third shape.
export function storedKindTables(
  all: Record<string, KindTableOverride>
): Record<string, Record<string, string | string[]>> {
  const out: Record<string, Record<string, string | string[]>> = {};
  for (const [kindId, over] of Object.entries(all)) {
    const entry: Record<string, string | string[]> = {};
    if (over.rated !== undefined) entry["rated"] = over.rated;
    // A LIST, WHICH IS WHAT OBSIDIAN RENDERS BEST — the same argument
    // `PAGE_TYPES_KEY` makes one property over. It is never empty, so the
    // property editor has chips to draw rather than a blank it may not keep.
    if (over.cols !== undefined) entry["cols"] = [...over.cols];
    for (const [key, value] of Object.entries(over.headings ?? {})) {
      entry[key] = value;
    }
    if (Object.keys(entry).length > 0) out[kindId] = entry;
  }
  return out;
}
