// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Where an entry sits among its neighbours: which entry is before it, which is
// after, and what to call them.
//
// NO LONGER A WIDGET, AS OF 3.11 §7.1. This file was the `nav` directive — the
// "‹ Tue 3 Mar  Daily  Thu 5 Mar ›" strip that daily and monthly templates
// carried — and before that an ~80-line `dataviewjs` block hand-copied into
// both. 2.18 folded that strip into `entry-header`, which draws the same
// prev/next pills beside the editable title, and the directive went on
// dispatching for three years' worth of releases with no template writing it.
//
// What survives is the part `entry-header` calls: `entryContext` answers
// "what is before and after this entry", `labelForGrain` names a period key.
// Those two were read by entryheader.ts and by nothing else, which is why this
// file still exists and why it no longer renders anything.
//
// A THIRD READER SINCE 4.27: quick capture's destination list names a grain's
// current entry, which needs `labelForGrain` and the `currentEntryKey` added
// below it. The file is now what its name says — the vocabulary of where an
// entry sits in time — rather than one widget's leftovers.

import { TFile } from "obsidian";
import type AlmanacPlugin from "../main";
import {
  CLASS_DEFS,
  noteKindOf,
} from "../trackers/trackers";
import type { TrackerClass } from "../trackers/trackers";
import type { MomentLike } from "../core/util";
import { entriesOfGrain } from "./lineage";
import {
  frontmatterOf,
  isoDate,
  moment,
} from "../core/util";





// The prev/next neighbours + friendly date title for one diary entry — the
// single source of truth shared by the full `nav` strip and the compact nav in
// the `entry-header`. Returns null if the note isn't a resolvable diary entry.
export interface EntryContext {
  // The entry's grain. Replaces `isMonthly: boolean` in 2.58.1 — a two-value
  // answer to a five-value question, which is why a weekly entry's banner said
  // "Daily": it fell into the `else`.
  grain: TrackerClass;
  // "Tue, 21 Jul 2026" for a daily note, "July 2026" for a monthly review.
  dateTitle: string;
  prev: { file: TFile; label: string } | null;
  next: { file: TFile; label: string } | null;
}

// WHERE AN ENTRY KEEPS ITS DATE, ASKED ONCE (4.21.2).
//
// Each grain stores its own period key under its own property — `journal-date`,
// `week-start`, `month`, `quarter-start`, `year-start` — with `journal-date` as
// the fallback for entries written before 2.44, which have only that one and
// still have to sort.
//
// THIS WAS WRITTEN THREE TIMES AND ONE OF THEM WAS WRONG, which is the reason
// it is a function. `entryContext` below and `dateOptions` in entryheader.ts
// spelled it identically; `subtitleFor` in the same file read `journal-date`
// ALONE. That is right for a daily entry and wrong for the other four, so a
// weekly entry's page-context strip printed the word "Weekly" where its dates
// belonged — and a daily entry printed "Daily" for the moment before Obsidian's
// metadata cache had indexed a note it had only just created.
//
// Returns "" for a note with no readable key, and the callers decide what that
// means: `entryContext` has a label to fall back to for a NAV pill, and the
// strip has nothing to say and says nothing.
export function entryDateKey(
  fm: Record<string, unknown>,
  grain: TrackerClass
): string {
  const def = CLASS_DEFS[grain];
  const raw = fm[def.dateProperty];
  const primary = raw == null ? "" : String(raw);
  const value =
    (isoDate(primary) ?? primary) || (isoDate(fm["journal-date"]) ?? "");
  return grain === "monthly" ? value.slice(0, 7) : value;
}

export function entryContext(
  plugin: AlmanacPlugin,
  file: TFile
): EntryContext {
  const app = plugin.app;
  const paths = plugin.settings.paths;
  const cur = frontmatterOf(app, file);

  // ONE WALK, FIVE GRAINS. This was two hardcoded branches — monthly, or else
  // daily — and everything downstream inherited the "or else": the picker, the
  // nav labels and the banner title all told a weekly entry it was a daily one.
  //
  // Classification goes through `classifyNote`, which is already the answer to
  // "what kind of note is this" for the tracker surfaces, rather than a second
  // journal-property-or-folder test that could disagree with it.
  // Straight to the question. This asked `classifyNote` for a tracker SURFACE,
  // substituted a journal surface for null so the call would type-check, then
  // unwrapped it back to a class and defaulted — four steps to learn one fact,
  // and the substituted `journalSurface(null)` was a lie told to the type
  // system that happened to unwrap to the same answer.
  const kind = noteKindOf(paths, file.path, cur["journal"], cur["type"]);
  const grain: TrackerClass =
    kind?.surface === "diary" ? kind.grain : "daily";
  const def = CLASS_DEFS[grain];

  // The entry's own date, from wherever its grain keeps it — see `entryDateKey`.
  const keyOf = (fm: Record<string, unknown>): string => entryDateKey(fm, grain);

  const entries = entriesOfGrain(app, paths, grain)
    .map((f) => ({ file: f, key: keyOf(frontmatterOf(app, f)) }))
    .filter((x) => x.key)
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  const meKey = keyOf(cur);
  const nice = (k: string) => labelForGrain(grain, k);
  const i = entries.findIndex((x) => x.file.path === file.path);

  return {
    grain,
    dateTitle: meKey ? nice(meKey) : def.label,
    prev:
      i > 0 ? { file: entries[i - 1].file, label: nice(entries[i - 1].key) } : null,
    next:
      i >= 0 && i < entries.length - 1
        ? { file: entries[i + 1].file, label: nice(entries[i + 1].key) }
        : null,
  };
}

// The date key of the entry a grain is *currently* on — the counterpart of
// `entryDateKey`, which reads one off a note that already exists.
//
// DERIVED FROM THE CLASS TABLE, not from five cases. `unit` is what makes
// `startOf` right for each grain, and the only shape difference is monthly's
// seven characters — exactly the slice `entryDateKey` takes, so the two produce
// the same key for the same period and `labelForGrain` renders either.
//
// Needed by quick capture's destination list (4.27): it names a grain's current
// entry before that entry necessarily exists, so it cannot read the key off a
// file the way everything before it did.
export function currentEntryKey(
  grain: TrackerClass,
  now: MomentLike = moment()
): string {
  const at = now.clone().startOf(CLASS_DEFS[grain].unit);
  return grain === "monthly" ? at.format("YYYY-MM") : at.format("YYYY-MM-DD");
}

// How a grain's date reads in a title or a picker row.
//
// Drives off `titleFormat`, whose `to` being present is what makes a grain a
// RANGE — a week is "27 Jul – 2 Aug 2026" where a day and a month are points.
export function labelForGrain(grain: TrackerClass, key: string): string {
  const def = CLASS_DEFS[grain];
  const base = moment(grain === "monthly" ? `${key}-01` : key);
  if (!base.isValid()) return key;
  if (def.titleFormat.to == null) return base.format(def.titleFormat.from);
  return `${base.format(def.titleFormat.from)} – ${base
    .clone()
    .endOf(def.unit)
    .format(def.titleFormat.to)}`;
}
