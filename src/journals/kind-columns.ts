// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// What a kind's table calls its columns. 1.0.32.
//
// ── THE HEADINGS WERE DERIVED AND THERE WAS NOWHERE TO ARGUE ─────────────
//
// The reader's ask: *"there needs to be a way to edit these headers for page
// kinds, especially for trackers such as confidence or accuracy."*
//
// A kind table's four headings came from four different places and not one of
// them was the table: the name from `kind.label`, `Date` from a literal in the
// render, and the two tracker columns from the REGISTRY's label for whichever
// tracker the kind is rated on and for `status`. So the only way to change the
// word over the Confidence column was to rename the Confidence tracker — which
// renames it in the tracker cell a reader fills in, in the stats band, in the
// chart legend and in every other journal that uses it. A table's column
// heading is a fact about THAT TABLE, and it had no field.
//
// ── ROLES, NOT PROPERTY NAMES ───────────────────────────────────────────
//
// The override is keyed by what the column IS — `name`, `rating`, `status` —
// and not by the tracker it happens to read. A kind re-rated from
// Confidence to Accuracy keeps the word the reader chose for its rating column,
// which is the answer that needs no explaining; keying on the tracker id would
// have silently dropped it and left a stale entry behind under the old id.
//
// ── AND THREE MORE, WHICH ARE WHEN RATHER THAN WHAT (1.0.67) ─────────────
//
// Four was the whole set until the reader asked for *"the way date flags are
// used and updated"* to become legible: the table could say what a note's
// status IS and had no way of saying how long it had been that way, which is
// the question an index is for.
//
// So the set is now columns about WHAT THE NOTE SAYS — its name, its rating,
// its status — and three about WHEN SOMETHING HAPPENED to it: `created`,
// `modified` and `statusdate`. The split matters because the two kinds resolve
// differently. A `what` column reads a frontmatter property, and
// `kindTableProperties` is the list of those; of the three `when` columns, ONE
// IS NOT A PROPERTY AT ALL (`modified` is the file's own mtime) and one appears
// only on a transition (`statusdate` is absent until a status changes).
// `kindTableProperties` therefore does NOT grow — it would be promising the
// template writes keys it does not.
//
// ── AND `date` IS NOT ONE OF THEM, AS OF 1.0.68 ─────────────────────────
//
// It was the second column here from the beginning and it has been removed, on
// the reader's call, after they read the table and asked whether `date` was
// defunct. It is the opposite of defunct — it is the busiest date the journal
// system has — but none of what it does is REPORTING, which is all a column can
// do. `date:` decides which day the banner subtitle says, which day an index
// counts as its last activity, where a note sits on a chart's x-axis, and —
// the one that bites — WHICH DAILY NOTE A TRACKER WRITTEN FROM THIS NOTE LANDS
// IN (`ui/widgets/tracker-controls.ts`, `diary/capture.ts`). It is an anchor
// the reader may move, not a fact about the note's history.
//
// Beside `created` it also read as a worse copy of it, which is how this came
// up: both are filled from the same `fillTemplate` call at creation, so they
// agree on every note nobody has backdated — and `created` is the one of the
// pair that must NOT be edited, because `recencyMs` ranks on it.
//
// THE PROPERTY IS UNTOUCHED. Nothing migrates, `templateFrontmatter` still
// writes `date:` on every leaf, `diary-link` still stamps it, and the generated
// Bases file still lists it in `properties:` and in every view — which is the
// surface a reader queries an anchor from. What is gone is the column, its
// heading override and its rename row in the group's `⋯`.
//
// They are OPTIONAL in the way `rating` already is, and that is the whole of why
// the presence rule below is not new machinery. `rating` is absent where the
// kind declares none; these are absent where the kind has not ticked them. The
// difference is only that their default is not "off" for all three — see
// `KIND_DATE_DEFAULTS`.
//
// ── AND ONE PAGE MAY PICK ITS OWN, IN ITS OWN ORDER (1.0.71) ────────────
//
// *"make columns drop-down menus instead of free-text"* — and what the
// dropdowns in the Note types window choose is which columns that one index
// note draws. `KindColumnSource.cols` is the field; `kind-tables.ts` is where
// it is stored and why the list is never empty.
//
// IT REPLACES THE DERIVATION RATHER THAN FILTERING IT, which is what makes
// ORDER expressible at all: a set could say the rating is drawn and could not
// say it is drawn last. `dates` is therefore not consulted while `cols` is
// present — a page that has named its columns has named all of them, and a
// page naming a date column its note type never ticked on gets it.
//
// THE NAME IS STILL NOT A COLUMN. It is `cols[0]` and it is the row's title —
// `recordList` draws it as the link — so it leads every list and is not in the
// record. `offerableColumns` is what the window offers, and it is the name's
// absence that makes that list exactly the choosable ones.
//
// ── WHY IT IS ITS OWN MODULE ────────────────────────────────────────────
//
// Two callers need the same answer and neither may import the other. The table
// draws the headings; the kind editor in Settings shows each column's DERIVED
// word as the placeholder over the box that overrides it, so a reader can see
// what they are changing from. `ui/tables.ts` already reaches `settings-editors`
// through `kind-create`, so the editor reaching back into the table would be a
// cycle — `list-row.ts` records what that costs and why the shared thing moves
// out instead.

import type ChronoAnvilPlugin from "../main";
import { getBuiltinTracker, getTracker } from "../trackers/trackers";
import type { TrackerDef } from "../trackers/trackers";

// The column roles a kind's table can have, in the order the table draws them.
//
// THE `what` COLUMNS FIRST, THEN THE THREE `when` ONES, and the order is the
// drawn order rather than a grouping for the reader of this file: a table reads
// left to right as the note's own facts and then its history. Appending rather
// than interleaving also means a reader who ticks a date column on sees it
// arrive at the end instead of pushing their status column along.
export const KIND_COLUMN_KEYS = [
  "name",
  "rating",
  "status",
  "created",
  "modified",
  "statusdate",
] as const;

export type KindColumnKey = (typeof KIND_COLUMN_KEYS)[number];

// The three a kind decides for itself, which is the same list again without the
// ones that are never a choice. Derived from nothing — spelled out, because it
// is also the tick order in Settings and the two must agree.
export const KIND_DATE_KEYS = ["created", "modified", "statusdate"] as const;

export type KindDateKey = (typeof KIND_DATE_KEYS)[number];

// WHICH OF THE THREE A SILENT KIND DRAWS.
//
// The reader's call: *"Modified by default"*, the other two offered. "When did I
// last touch this" is the question an index gets asked, and it is the one of the
// three that needs no setting up — it reads the file, so it is right on a note
// made before this release and on a note edited outside the plugin.
//
// NOT ALL-OFF, which is what made a departures record necessary rather than a
// plain list of what is on. See `packDates`.
export const KIND_DATE_DEFAULTS: Record<KindDateKey, boolean> = {
  created: false,
  modified: true,
  statusdate: false,
};

// THE PROPERTY A STATUS CHANGE IS STAMPED INTO. 1.0.67.
//
// ONE LOWERCASE WORD, which is `PAGE_TEMPLATE_KEY`'s rule — *"matching
// `created`, `status`, `parent` and `order`, the four other properties this
// plugin writes into a note and reads back"*. `statusdate` reads as *the date on
// the status*; `changed` on its own would have been a synonym for `modified`
// sitting next to it in the same frontmatter, which is a key a reader has to
// guess at.
//
// IT IS THE ONE NEW STORED FACT IN THIS ROUND, and it has to be stored: the
// instant a status changed is not recoverable from the note afterwards.
// `modified` is the file's mtime and `created` already exists, so neither is
// written. `review.ts` states the rule both of those follow — *"DERIVED, NOT
// STORED … writing a third property back to disk would be storing an answer we
// can always recompute"* — and this is the case it does not cover.
export const STATUS_DATE_KEY = "statusdate";

// "Confidence" from "🎯 Confidence" — the registry label with its leading glyph
// stripped.
//
// MOVED HERE FROM `tables.ts` IN 1.0.32, unchanged. It was private there, and
// the editor needs the same word or the placeholder over the override box would
// disagree with the heading the box overrides — which is a worse kind of wrong
// than no placeholder at all.
//
// `fallback` rather than a fixed string, because the callers disagree about
// what to say when there is no definition: a band has nothing better than the
// generic word, while a kind table has the property's own id, which is at least
// the thing the column is reading.
export function ratingNoun(def: TrackerDef | null, fallback: string): string {
  if (!def) return fallback;
  return def.label.replace(/^[^\p{L}\p{N}]+/u, "").trim() || fallback;
}

export interface KindColumn {
  key: KindColumnKey;
  // The frontmatter property this column reads. Empty for `name`, which reads
  // the note's own filename and is the column the others hang off.
  property: string;
  // What the column is called when the kind says nothing — the derivation that
  // was the only answer before this module existed.
  fallback: string;
  // What it is called here and now: the kind's word where it has one.
  heading: string;
}

// The minimum a caller has to hold to ask. Deliberately structural rather than
// `JournalKind`: Settings asks about a DRAFT — a `JournalKindConfig` being
// edited, which has no `templates` and no `pages` yet — and a signature that
// demanded the built kind would have sent the editor to build one.
export interface KindColumnSource {
  label: string;
  rating?: string;
  headings?: Record<string, string>;
  // Which of the three date columns this kind draws, as DEPARTURES from
  // `KIND_DATE_DEFAULTS`. Absent means the defaults whole. See `packDates`.
  dates?: Record<string, boolean>;
  // The columns AFTER THE NAME, in draw order, where one page has chosen them
  // for itself. 1.0.71.
  //
  // ABSENT IS THE DERIVATION, which is every kind in every journal: the rating
  // where there is one, then the status, then whichever date columns `dates`
  // ticks on. Present, it replaces all three of those answers at once — a page
  // that names its columns has named them, and `dates` is not consulted.
  //
  // IT IS NOT A SECOND WAY TO SET A JOURNAL'S DEFAULTS. Nothing in Settings
  // writes this; `pageKind` is the only thing that fills it in, from the one
  // index note's own frontmatter. The two live at different scopes on purpose
  // — `dates` is what every Lesson table in the vault draws, this is what one
  // topic's does.
  cols?: readonly string[];
}

// A kind's table columns, in order, each with the word it shows and the word it
// would show if the reader cleared the box.
//
// THE RATING COLUMN IS ABSENT WHERE THE KIND IS NOT RATED, which is the same
// rule `kindTableProperties` has always followed — *"its rating if it declares
// one and nothing where it doesn't"*. A stored heading for a column that is not
// drawn is kept rather than pruned: unrating a kind by accident and re-rating it
// should not cost the reader the word they chose.
export function kindColumns(
  plugin: ChronoAnvilPlugin,
  kind: KindColumnSource
): KindColumn[] {
  const statusId = getBuiltinTracker(plugin, "status")?.id ?? "status";
  const statusDef = getTracker(plugin, statusId) ?? null;
  const ratingId = kind.rating ?? null;
  const ratingDef = ratingId ? getTracker(plugin, ratingId) ?? null : null;

  // ONE DESCRIPTOR PER ROLE, BUILT IN ONE PLACE (1.0.71). The derivation below
  // and a page's own list both need the same answer for the same role, and two
  // constructions of it are two chances to give a column a different property
  // in one of them — which draws the right heading over the wrong cell.
  //
  // NULL WHERE THE KIND CANNOT DRAW IT, which is only the rating: a page may
  // name a `rating` column on a type that is rated on nothing, and the honest
  // answer is no column rather than a heading over an empty gauge.
  const describe = (key: string): KindColumn | null => {
    switch (key) {
      case "name":
        return { key: "name", property: "", fallback: kind.label, heading: "" };
      case "rating":
        return ratingId
          ? {
              key: "rating",
              property: ratingId,
              fallback: ratingNoun(ratingDef, ratingId),
              heading: "",
            }
          : null;
      case "status":
        return {
          key: "status",
          property: statusId,
          fallback: ratingNoun(statusDef, "Status"),
          heading: "",
        };
      case "created":
        return { key: "created", property: "created", fallback: "Created", heading: "" };
      case "modified":
        // `modified` READS NO PROPERTY, and the empty string already means that
        // here — it is what `name` carries, which reads the note's filename. The
        // cell goes to `file.stat.mtime`; there is no `modified:` key in a vault
        // and 1.0.67 deliberately did not create one.
        return { key: "modified", property: "", fallback: "Modified", heading: "" };
      case "statusdate":
        return {
          key: "statusdate",
          property: STATUS_DATE_KEY,
          // "Status changed", OFF THE STATUS TRACKER'S OWN WORD. A reader who
          // renames Status to State gets "State changed" — which is 1.0.32's
          // rule and the whole reason a column is keyed by its role. A literal
          // here would be the fourth place the word lived.
          fallback: `${ratingNoun(statusDef, "Status")} changed`,
          heading: "",
        };
      // A ROLE THIS BUILD HAS NOT GOT draws nothing. `cleanCols` keeps an
      // unknown entry so a list written by a later build survives a Save here;
      // this is the other half of that, and it is the same silence a date
      // column nobody ticked gets.
      default:
        return null;
    }
  };

  // THE NAME IS NOT A CHOICE AND NEVER IN THE LIST. `cols[0]` is what
  // `recordList` draws as the row's TITLE — the link a reader presses to open
  // the note — so it is the row rather than a column of it, and a page that
  // could drop it would be a page of rows nobody can open.
  const out: KindColumn[] = [describe("name") as KindColumn];

  if (kind.cols) {
    // ── WHAT THIS ONE PAGE PICKED (1.0.71) ──────────────────────────────
    //
    // In the ORDER IT PICKED, which is the half of the answer a set could not
    // carry, and `dates` is not consulted: a page naming its columns has named
    // all of them. `RATED_NONE` is the list that means *the title alone* — see
    // `kind-tables.ts` for why that state has a spelling rather than an empty
    // list — and it describes nothing, so it falls out here with every other
    // unknown role.
    for (const key of kind.cols) {
      const col = describe(key);
      // Never the name twice: it is already the title, and a page that named
      // it would draw the note's own filename in a second cell beside itself.
      if (col && key !== "name") out.push(col);
    }
  } else {
    if (ratingId) out.push(describe("rating") as KindColumn);
    out.push(describe("status") as KindColumn);
    // ── AND THE DATE COLUMNS THIS KIND HAS TICKED ON (1.0.67) ────────────
    //
    // In `KIND_DATE_KEYS` order rather than the record's, so two kinds with the
    // same three ticks draw them the same way round.
    const ticks = datesOf(kind);
    for (const key of KIND_DATE_KEYS) {
      if (ticks[key]) out.push(describe(key) as KindColumn);
    }
  }

  for (const col of out) col.heading = headingOf(kind, col.key, col.fallback);
  return out;
}

// Every role a kind's table could draw after its name, in the order the
// derivation would draw them. 1.0.71.
//
// WHAT THE WINDOW'S DROPDOWNS OFFER, and it is derived from `kindColumns`
// rather than listed again: a role that cannot be drawn must not be offered,
// and `describe` is where that is decided. Asking with `cols` cleared is how
// this gets the WHOLE set rather than the page's chosen subset — the
// derivation's own ticks are ignored too, because a page may add a date column
// its note type has not ticked on.
export function offerableColumns(
  plugin: ChronoAnvilPlugin,
  kind: KindColumnSource
): KindColumn[] {
  const all = { ...kind, cols: KIND_COLUMN_KEYS as readonly string[] };
  return kindColumns(plugin, all).filter((c) => c.key !== "name");
}

// Which date columns a kind draws: the defaults with its own answers over them.
//
// READ THROUGH HERE AND NOWHERE ELSE, so the default is applied once. A caller
// testing `kind.dates?.modified` would get `undefined` for the common case and
// read it as off, which is the one mistake this field's shape invites.
export function datesOf(kind: KindColumnSource): Record<KindDateKey, boolean> {
  const out = { ...KIND_DATE_DEFAULTS };
  for (const key of KIND_DATE_KEYS) {
    const said = kind.dates?.[key];
    if (typeof said === "boolean") out[key] = said;
  }
  return out;
}

// What to store, given what the ticks hold.
//
// DEPARTURES FROM THE DEFAULT ONLY, WHICH IS `packHeadings`' RULE ON A BOOLEAN.
// A kind that wants exactly what every kind wants stores nothing, so the common
// case leaves no record and `settings.json` does not grow three keys per note
// type to say "as expected".
//
// IT ALSO SETTLES THE AMBIGUITY A PLAIN LIST WOULD HAVE HAD. `dates: []` and no
// `dates` at all are the same value through enough of the stack to be worth
// avoiding — a `normaliseKinds` pass, a JSON round trip, a reader's own edit —
// and with a non-empty default they have to mean opposite things: "none" and
// "the defaults". A record of departures has no empty case: all three off is
// `{ modified: false }`, which is present and says so.
export function packDates(
  ticks: Record<KindDateKey, boolean>
): Record<string, boolean> | undefined {
  const out: Record<string, boolean> = {};
  for (const key of KIND_DATE_KEYS) {
    if (ticks[key] !== KIND_DATE_DEFAULTS[key]) out[key] = ticks[key];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// What survives a round trip through the editor, given what was stored.
//
// CARRIED, NOT REBUILT, for keys this build does not know about — `cleanHeadings`
// below records why, and a fourth date column added here would be in exactly
// that position for one release.
export function cleanDates(raw: unknown): Record<string, boolean> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "boolean") continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// ── THE STAMP, WRITTEN IN THE TRANSACTION THAT MOVES THE STATUS ──────────
//
// Called from inside a `processFrontMatter` callback, which is why it takes the
// map and returns nothing: the value and its date land in ONE transaction, so
// the pair can never be read half-written or lag a cache pass. That is exactly
// `recomputeSleepInFrontmatter`'s arrangement — Wake-Up and Bedtime re-derive
// Sleep in the same callback — and this is the second instance of it.
//
// HERE RATHER THAN BESIDE ITS CALLERS, because there are two of them and they
// may not import each other: the widget renderer's `write` is the dropdown's
// channel, and the generic Properties window can set or clear any key including
// this one. A status changed from the property editor is still a status changed,
// and one helper is what makes both answers the same. It is the same argument
// the head of this file makes for `ratingNoun` living here.
//
// ONLY ON A CHANGE, which is the part worth measuring. Re-picking the status a
// note already has must not move its date — a reader who opens the dropdown,
// looks, and picks what was already there has changed nothing, and a table
// saying otherwise is worse than one saying nothing. This is the no-op-write
// rule (`header-title.ts`, `entryheader.ts`) applied one level in: *"a
// processFrontMatter that leaves a file identical still moves its modified time,
// which is a lie about the reader's vault that sync then propagates."*
//
// A CLEARED STATUS CLEARS THE DATE rather than stamping one. "No status" has no
// date to report, which is the reading `pruneProperties` takes of an emptied
// tracker property, and leaving the old stamp behind would date a status the
// note no longer has.
export function stampStatusChange(
  fm: Record<string, unknown>,
  prop: string,
  statusId: string,
  before: unknown,
  now: string
): void {
  if (prop !== statusId) return;
  const after = fm[statusId];
  if (sameStatus(before, after)) return;
  if (after == null || after === "") delete fm[STATUS_DATE_KEY];
  else fm[STATUS_DATE_KEY] = now;
}

// Whether the status is the one it already was.
//
// STRINGIFIED AND TRIMMED, on `isCompletedStatus`' argument — *"`status` is a
// property a reader can type by hand as easily as pick from the dropdown"*, so
// the stored value may be anything YAML made of it. Absent and empty are the
// same answer here; both mean the note does not say.
function sameStatus(a: unknown, b: unknown): boolean {
  const word = (v: unknown): string =>
    v == null ? "" : String(v).trim();
  return word(a) === word(b);
}

// The word one column shows. Blank and whitespace are NOT an override — a
// reader who empties the box is asking for the derived word back, not for a
// column with no heading over it.
export function headingOf(
  kind: KindColumnSource,
  key: KindColumnKey,
  fallback: string
): string {
  return kind.headings?.[key]?.trim() || fallback;
}

// What to store, given what the boxes hold.
//
// EMPTY ENTRIES ARE DROPPED AND SO ARE THE ONES THAT SAY NOTHING. A heading
// equal to its own derivation is not an override; keeping it would pin the word
// as it stood when the box was touched, so renaming the Confidence tracker later
// would move the word everywhere EXCEPT the table the reader had visited. That
// is `normaliseKinds`' rule for `plural`, which drops an override the pluraliser
// already produces, applied to the same shape of field.
export function packHeadings(
  entries: { key: KindColumnKey; value: string; fallback: string }[]
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const { key, value, fallback } of entries) {
    const text = value.trim();
    if (!text || text === fallback.trim()) continue;
    out[key] = text;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// What survives a round trip through the editor, given what was stored.
//
// CARRIED, NOT REBUILT, for keys this build does not know about. `normaliseKinds`
// rebuilds a kind row from the fields the window edits, and 3.20.1 records what
// that cost `plural`: a field the window did not know about was dropped by
// pressing Save. A future column role added here would be in exactly that
// position for one release, so unknown keys are kept rather than filtered.
export function cleanHeadings(
  raw: unknown
): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (text) out[key] = text;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
