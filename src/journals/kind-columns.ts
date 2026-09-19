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
// ── FOUR ROLES, NOT FOUR PROPERTY NAMES ─────────────────────────────────
//
// The override is keyed by what the column IS — `name`, `date`, `rating`,
// `status` — and not by the tracker it happens to read. A kind re-rated from
// Confidence to Accuracy keeps the word the reader chose for its rating column,
// which is the answer that needs no explaining; keying on the tracker id would
// have silently dropped it and left a stale entry behind under the old id.
//
// Four is also the whole set. These are not arbitrary columns: `kindTable-
// Properties` decides what a kind's table has, and it has exactly a date, a
// rating where the kind declares one, and a status.
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
export const KIND_COLUMN_KEYS = ["name", "date", "rating", "status"] as const;

export type KindColumnKey = (typeof KIND_COLUMN_KEYS)[number];

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

  const out: KindColumn[] = [
    { key: "name", property: "", fallback: kind.label, heading: "" },
    { key: "date", property: "date", fallback: "Date", heading: "" },
  ];
  if (ratingId) {
    out.push({
      key: "rating",
      property: ratingId,
      fallback: ratingNoun(ratingDef, ratingId),
      heading: "",
    });
  }
  out.push({
    key: "status",
    property: statusId,
    fallback: ratingNoun(statusDef, "Status"),
    heading: "",
  });

  for (const col of out) col.heading = headingOf(kind, col.key, col.fallback);
  return out;
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
