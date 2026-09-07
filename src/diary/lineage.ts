// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// ── THE DIARY'S SPINE (4.81) ─────────────────────────────────────────────
//
// Which period contains which, what that period's note is CALLED, and where it
// lives. One module, because those three questions have one answer and the
// vault breaks in a way nobody notices when two of them disagree: a link naming
// `Week-2025-W01` while the creator writes `Week-2026-W01` is not an error, it
// is a phantom node in the graph and a chain that stops there.
//
// WHY THIS EXISTS AT ALL. 4.68 gave every composed note ONE parent link and
// argued — correctly — that a chain of parents says a daily entry is inside a
// week inside the diary, "which is true and is the one thing the canvas CANNOT
// say, because a group box has no depth". What it actually shipped was one hop
// of that chain: an entry named its GRAIN DASHBOARD, so every day in the vault
// hung off `02 - Diary`, every week off `Weekly`, and the graph drew five stars
// where the reader was promised a stream. Depth between GRAINS is not depth
// between PERIODS, and only the second one answers "which August is this day
// in".
//
// So an entry now names the period that contains it — `Day-2026-08-29` names
// `Week-2026-W35`, which names `Month-2026-08`, which names `Quarter-2026-Q3`,
// which names `Year-2026` — and the year, having no period above it, names the
// diary root. Read from the top the graph is Homepage → 02 - Diary → Year →
// Quarter → Month → Week → Day, with the overview dashboards (Weekly, Monthly,
// etc.) forming their own cleanly separated branch off 02 - Diary.
//
// EVERY NAME THIS MODULE PRODUCES HAS TO BE ONE THE CREATOR WOULD WRITE, and
// that is why the names come from `CLASS_DEFS.filePrefix` + `fileFormat` rather
// than from a second set of literals: the class table is already how a filename
// states its grain (constants.ts says so), `diary.ts` now builds its paths from
// the same two fields, and a format changed in one place cannot leave the other
// pointing at a note that will never exist.

import { App, TFile } from "obsidian";
import { CLASS_DEFS } from "../trackers/trackers";
import type { TrackerClass } from "../trackers/trackers";
import {
  filesUnder,
  folderNotePath,
  getFile,
  moment,
} from "../core/util";
import type { MomentLike } from "../core/util";

// The five diary folders, which is all of a path config this module reads.
// A structural type rather than `typeof DEFAULT_PATHS` so the pure half stays
// testable with a literal and callers keep passing their whole settings object.
export interface DiaryPaths {
  diaryRoot: string;
  diaryEntries?: string;
  diaryDashboards: string;
  // The five legacy grain folders: where a vault written before 4.81 filed its
  // entries, and where those entries still are. Nothing new is written into
  // one — see `entryFolder` — and every scan reads them anyway.
  diaryDaily: string;
  diaryWeekly: string;
  diaryMonthly: string;
  diaryQuarterly: string;
  diaryYearly: string;
}

// ── §1. WHAT CONTAINS WHAT ───────────────────────────────────────────────
//
// One step up, per grain. A table rather than an ordered list with an index
// walk, because `TRACKER_CLASSES` is ordered "shortest period first" for the
// settings dropdown and the pills — an ordering that exists for presentation
// and would silently become load-bearing the moment this read `[i + 1]`.
//
// Yearly has no parent and that is a fact about the calendar, not a gap: the
// year is where the periods stop and the vault's own structure takes over.
export const CONTAINING_GRAIN: Record<TrackerClass, TrackerClass | null> = {
  daily: "weekly",
  weekly: "monthly",
  monthly: "quarterly",
  quarterly: "yearly",
  yearly: null,
};

// The start of the period of `grain` that contains `at`.
//
// CLONED BEFORE SNAPPING, because moment's `startOf` mutates and returns the
// same instance — so a caller that walked four grains off one moment would get
// four answers all equal to the last.
export function periodStart(grain: TrackerClass, at: MomentLike): MomentLike {
  return at.clone().startOf(CLASS_DEFS[grain].unit);
}

// What the entry of `grain` covering `at` is called: `Week-2026-W35`.
//
// FROM THE PERIOD'S START, NOT FROM `at`, and the ISO week is the reason. A
// week's file is created from its Monday, and moment's `YYYY-[W]WW` pairs a
// CALENDAR year with an ISO week number — so 1 January 2027 formats as
// `2027-W53` while the file created from that week's Monday (28 December 2026)
// is `Week-2026-W53`. Snapping first means both sides format the same date and
// the quirk cancels out; the alternative is a link into a week that does not
// exist, once or twice a year, forever.
export function entryNoteName(grain: TrackerClass, at: MomentLike): string {
  const def = CLASS_DEFS[grain];
  return `${def.filePrefix}${periodStart(grain, at).format(def.fileFormat)}`;
}

// The folder this grain's entries were filed in before 4.81, and still are in
// any vault that has them. Nothing writes here — see `entryFolder` — and every
// scan reads it, which is what makes the two layouts one vault.
export function legacyGrainFolder(
  paths: DiaryPaths,
  grain: TrackerClass
): string {
  return paths[CLASS_DEFS[grain].folderKey];
}

// Where an entry written TODAY is filed: under the period that contains it.
//
// ── §1.5 THE PERIOD TREE (4.81) ──────────────────────────────────────────
//
//   02 - Diary/Entries/Year-2026/Quarter-2026-Q3/Month-2026-08/Week-2026-W35/
//     Week-2026-W35.md      the week's own note, its folder's folder note
//     Day-2026-08-29.md     the days it holds
//
// A PERIOD'S NOTE IS ITS FOLDER'S NOTE, which is the convention a journal
// subject already uses (`folderNotePath`) — so the note about August is inside
// August rather than beside it, and clicking the folder lands somewhere. A day
// has no folder because a day contains nothing.
//
// THE FOLDER NAMES ARE THE NOTE NAMES, not `2026/Q3/08`. A folder called `08`
// says nothing in a search result, a backlink pane or a breadcrumb, and the
// prefix is what `noteKindOf` reads to know a note's grain without its
// frontmatter.
//
// AND A STRADDLING WEEK IS FILED BY ITS THURSDAY, which is the one place the
// tree cannot say what the links say. `Day-2026-08-31` is inside `Month-2026-08`
// in the graph — a day is in its own month — but on disk it sits under
// `Month-2026-09/Week-2026-W36/`, because a file has one location and its week
// belongs to September. The graph is the surface that gets this right; the
// folder tree is the one that has to choose.
//
// THE CALLER HAS ALREADY VALIDATED `iso`. All three creators test it against
// `DATE_RE`/`MONTH_RE` first, and `ensureLineage` passes a `startIso` this
// module computed. An unparseable date would file an entry at the diary root
// rather than throw, which is the failure this note exists instead of.
export function entryFolder(
  paths: DiaryPaths,
  grain: TrackerClass,
  iso: string
): string {
  // THROUGH THE PARENT, NOT DOWN THE ENTRY'S OWN CHAIN. `containingPeriods`
  // answers four independent questions about one date, so a day in a straddling
  // week names its own month (August) while its week names September's — true
  // statements that do not nest. A folder tree has to nest, so each period is
  // filed by asking where its PARENT lives, and the day lands in its week's
  // folder wherever the week itself went.
  const [parent] = containingPeriods(grain, iso);
  const enclosing = parent
    ? entryFolder(paths, parent.grain, parent.startIso)
    : `${paths.diaryRoot}/Entries`;
  return grain === "daily"
    ? enclosing
    : `${enclosing}/${entryNoteName(grain, moment(iso))}`;
}

export function entryPath(
  paths: DiaryPaths,
  grain: TrackerClass,
  iso: string
): string {
  return `${entryFolder(paths, grain, iso)}/${entryNoteName(
    grain,
    moment(iso)
  )}.md`;
}

// The same entry's address in a vault written before 4.81 — flat, in the grain
// folder. Nothing writes here; `locateEntry` reads it so that an entry already
// on disk is FOUND rather than created a second time at the new address.
export function legacyEntryPath(
  paths: DiaryPaths,
  grain: TrackerClass,
  iso: string
): string {
  return `${legacyGrainFolder(paths, grain)}/${entryNoteName(
    grain,
    moment(iso)
  )}.md`;
}

// The entry for this period, wherever it is — today's tree first, then the flat
// folder its grain used to have.
//
// THE ORDER IS THE MIGRATION STORY. A vault that has never repaired keeps every
// entry in the old place and finds them all; a vault filling the tree finds the
// new ones first; a vault with both is answered correctly for each date. Two
// probes rather than a basename search, because `Day-2026-08-29` is a name a
// reader may also have used somewhere else entirely, and a creator that trusted
// a global name lookup would decline to make an entry on the strength of it.
export function locateEntry(
  app: App,
  paths: DiaryPaths,
  grain: TrackerClass,
  iso: string
): TFile | null {
  return (
    getFile(app, entryPath(paths, grain, iso)) ??
    getFile(app, legacyEntryPath(paths, grain, iso))
  );
}

// Every entry of one grain, in both layouts.
//
// ── WHY A DOZEN CALLERS COULD NOT KEEP DOING THIS THEMSELVES ─────────────
//
// The shape they all had was `filesUnder(app, paths[<grain folder>])` minus the
// folder note. Under 4.81 that folder holds the entries written BEFORE this
// release and none of the ones written after, so the calendar's underlines, the
// entry picker, the period counts, the sleep rollup and the quarter band would
// each have quietly stopped seeing new entries — twelve separate silences, none
// of them an error.
//
// TWO PASSES, UNIONED, because a vault mid-migration has entries in both places
// and both are real. The tree pass filters by `filePrefix`, which is what makes
// it safe to walk the whole diary root: only `Day-…` is a daily entry, and a
// reader's `Grocery list.md` filed in a week folder is not swept up. The legacy
// pass keeps the OLD test — everything in the folder except its note — because
// that is what those callers promised, and an entry a reader renamed by hand is
// still their entry.
//
// The folder note drops out of the tree pass for free: no dashboard is called
// `Day-anything`. It is excluded explicitly in the legacy pass, where the
// dashboard used to live and where it still does in an un-repaired vault.
export function entriesOfGrain(
  app: App,
  paths: DiaryPaths,
  grain: TrackerClass
): TFile[] {
  const prefix = CLASS_DEFS[grain].filePrefix;
  const legacy = legacyGrainFolder(paths, grain);
  const legacyNote = folderNotePath(legacy);
  const out: TFile[] = [];
  const seen = new Set<string>();
  const take = (f: TFile): void => {
    if (seen.has(f.path)) return;
    seen.add(f.path);
    out.push(f);
  };
  for (const f of filesUnder(app, paths.diaryRoot)) {
    if (f.basename.startsWith(prefix)) take(f);
  }
  for (const f of filesUnder(app, legacy)) {
    if (f.path !== legacyNote) take(f);
  }
  return out;
}

// ── §2. THE CHAIN ABOVE ONE ENTRY ────────────────────────────────────────

// One period an entry sits inside: its grain, its note's name, and the date its
// creator would be handed to make it.
export interface ContainingPeriod {
  grain: TrackerClass;
  name: string;
  startIso: string;
}

// Every period containing an entry of `grain` dated `iso`, nearest first.
//
// A day returns its week, month, quarter and year; a year returns nothing.
// `iso` is the entry's own date key — `YYYY-MM-DD` for four grains and
// `YYYY-MM` for a monthly entry, which is what `entryDateKey` hands back and
// what moment parses either way.
//
// ── THE WEEK IS THE ONLY GRAIN THAT CAN STRADDLE ITS PARENT ──────────────
//
// Week 36 of 2026 runs from 31 August to 6 September, so "which month is this
// week in" has two defensible answers and one of them has to be chosen. It is
// decided from the week's THURSDAY, which is the ISO rule that already decides
// the week's own number and its year, and the rule `rowWeekKey` uses in
// calendar.ts to underline a row. So the week belongs to the month holding four
// of its seven days, and the calendar's mark and this link can never disagree.
//
// A DAY'S MONTH IS ITS OWN MONTH, NOT ITS WEEK'S. Every grain above a day is
// computed from the day itself, so `Day-2026-08-31` is inside `Month-2026-08`
// even though its week is September's. The chain is not required to be a strict
// nesting of folders — it is a set of true statements about one date, and "31
// August is in August" is the truest of them.
export function containingPeriods(
  grain: TrackerClass,
  iso: string
): ContainingPeriod[] {
  const seed = moment(iso);
  if (!seed.isValid()) return [];
  const anchor =
    grain === "weekly" ? periodStart("weekly", seed).add(3, "days") : seed;

  const out: ContainingPeriod[] = [];
  for (let g = CONTAINING_GRAIN[grain]; g != null; g = CONTAINING_GRAIN[g]) {
    out.push({
      grain: g,
      name: entryNoteName(g, anchor),
      startIso: periodStart(g, anchor).format("YYYY-MM-DD"),
    });
  }
  return out;
}

// Where an entry hangs when no period above it has a note.
//
// Diary entries start from their year nodes (e.g. `Year-2026.md` is the root
// of the chronological period tree: Year → Quarter → Month → Week → Day),
// completely detached from the diary overview dashboard and Homepage.
export function grainFallbackName(
  _paths?: DiaryPaths,
  _grain?: TrackerClass
): string | null {
  return null;
}

// The one name an entry's hidden link should carry.
//
// NEAREST PERIOD THAT ACTUALLY HAS A NOTE, and the fallback below all of them.
// With `ensureLineage` running on every creation this is normally the immediate
// parent — but "normally" is not "always": a grain whose template is missing
// cannot be created, and an entry written before this release has ancestors
// nobody made. Walking up rather than insisting on the immediate parent is what
// keeps the period tree intact.
export function graphParentName(
  grain: TrackerClass,
  iso: string,
  exists: (period: ContainingPeriod) => boolean,
  paths: DiaryPaths
): string | null {
  for (const period of containingPeriods(grain, iso)) {
    if (exists(period)) return period.name;
  }
  return grainFallbackName(paths, grain);
}
