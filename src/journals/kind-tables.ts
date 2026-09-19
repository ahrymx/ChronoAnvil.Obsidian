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
// `setPageLayout` is the same shape one scope down: a per-NOTE override of a
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
//         name: Exercise
//         rating: Score
//
// `rated` sits beside the headings rather than under a nested `headings:` map
// because it cannot collide with one: the heading keys are `KIND_COLUMN_KEYS` —
// `name`, `date`, `rating`, `status` — and `rated` is none of them. A third
// level of YAML buys nothing and costs a reader looking at their own note two
// more indents to read past.
//
// ── ROLES AGAIN, NOT TRACKER IDS (1.0.32'S RULE, UNCHANGED) ──────────────
//
// The headings are keyed by what the column IS. A page that re-rates its lessons
// from Confidence to Accuracy keeps the word the reader chose for its rating
// column, which is the answer that needs no explaining.

import type { App, TFile } from "obsidian";
import { frontmatterOf } from "../core/util";
import {
  KIND_COLUMN_KEYS,
  type KindColumnKey,
  type KindColumnSource,
} from "./kind-columns";

// The one property, spelled once.
//
// LOWERCASE AND UNSEPARATED, which is `PAGE_LAYOUT_KEY`'s shape and the only
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
// at all — `setPageLayout`'s posture, and the reason a second press of the same
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
// saying no on this page. One word for each, because `setPageLayout`'s scar is
// exactly the cost of giving one state two spellings.
export const RATED_NONE = "-";

/** What one index note says about one of its note types. */
export interface KindTableOverride {
  /** A tracker id, `RATED_NONE`, or absent for the journal's own answer. */
  rated?: string;
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
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (!text) continue;
    if (key === "rated") out.rated = text;
    else if (HEADING_KEYS.has(key)) headings[key] = text;
  }
  if (Object.keys(headings).length > 0) out.headings = headings;
  return Object.keys(out).length > 0 ? out : null;
}

/** True where the note says nothing at all about this kind. */
export function isBlankOverride(over: KindTableOverride): boolean {
  return over.rated === undefined && over.headings === undefined;
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
export function withHeading(
  over: KindTableOverride,
  key: KindColumnKey,
  value: string,
  inherited: string
): KindTableOverride {
  const text = value.trim();
  const headings = { ...(over.headings ?? {}) };
  if (!text || text === inherited.trim()) delete headings[key];
  else headings[key] = text;
  const out: KindTableOverride = {
    ...(over.rated !== undefined ? { rated: over.rated } : {}),
    ...(Object.keys(headings).length > 0 ? { headings } : {}),
  };
  return out;
}

// The same for the rating, where `null` means *stop saying anything*.
export function withRated(
  over: KindTableOverride,
  rated: string | null
): KindTableOverride {
  return {
    ...(rated !== null ? { rated } : {}),
    ...(over.headings ? { headings: { ...over.headings } } : {}),
  };
}

// The whole property, with one kind's entry replaced — or removed where the
// entry has become blank.
//
// `undefined` MEANS DELETE THE PROPERTY, which is `setPageLayout`'s contract:
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
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [kindId, over] of Object.entries(all)) {
    const entry: Record<string, string> = {};
    if (over.rated !== undefined) entry["rated"] = over.rated;
    for (const [key, value] of Object.entries(over.headings ?? {})) {
      entry[key] = value;
    }
    if (Object.keys(entry).length > 0) out[kindId] = entry;
  }
  return out;
}
