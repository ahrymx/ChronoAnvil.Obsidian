// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Joining a page to the diary. 1.0.11.
//
// ── WHAT "LINKED TO THE DIARY" MEANS, SINCE NOTHING SAID SO BEFORE ──────
//
// There was no such concept in the tree: no attach function, no frontmatter key
// that meant it, no index entry point. What there WAS is a key the whole diary
// already reads and nothing ever writes — `JOURNAL_DATE_PROPERTY`, spelled
// `date:`. `diary-index.ts` builds a journal note's index row from it, and
// `bridge-widgets.ts` refuses to offer a bridge to a note that lacks it. A page
// with that property is on the diary's timeline; a page without one is not.
//
// So this action is that property, written. Stamping it turns on search,
// on-this-day and the bridge together, because all three were already asking.
//
// ── AND THE HALF THAT IS VISIBLE ────────────────────────────────────────
//
// A property is invisible, and an action whose whole effect is a frontmatter
// key a reader cannot see is an action they will press twice and then stop
// trusting. So the day gets told about the page as well: a link to it lands in
// the entry's attachments region, where the plugin ALREADY puts vault links
// dragged in by hand and already draws them as chips. Nothing here invents a
// storage format — `newAttachment` classifies it and `serializeAttachmentLine`
// spells it, exactly as a drop would.
//
// WHY THE ATTACHMENTS REGION AND NOT THE PROSE. The standing rule is that this
// plugin writes into `<!--chronoanvil:key-->` regions and never into a reader's
// loose markdown. `attachments` is the region on every grain's template whose
// content type is "things this day points at", which is what a linked page is.
// `log` and `focus` are the reader's sentences and are not ours to append to.
//
// A DAY WITH NO ATTACHMENTS REGION STILL GETS THE PROPERTY. An entry written
// before the field existed, or one whose reader removed it, is not a reason to
// refuse the half that works — the notice says which half happened.
//
// ── AND IT IS A PICKER, AND IT IS NOT ONLY DAYS (1.0.29) ────────────────
//
// The reader's ask: *"improve the 'Link to Diary' action to a selector dropdown
// (instead of manually entering the note's name). Also allow selecting weeks,
// months, quarters, or years."*
//
// Both halves are one change, because the typed box is what limited this to
// days. `YYYY-MM-DD` is the shape of one grain, so a prompt that validates it
// cannot express a quarter, and the action could only ever mean "the day". A
// list can hold five grains at once and has to name each row anyway — so the
// control that stops the typing is the same control that adds the periods.
//
// WHAT THE LIST HOLDS. Every period of every grain within reach of an ANCHOR
// date, newest first, grouped by grain: a fortnight of days, eight weeks,
// twelve months, eight quarters, five years. Each row is labelled the way the
// diary labels that period everywhere else (`labelForGrain`) and described by
// the entry's own filename plus whether that entry is already written — which
// is also what makes the list searchable by `W38`, by `2026-09` or by `Q3`,
// since `DetailedChoiceModal` matches the description as well as the label.
//
// THE ANCHOR IS THE PAGE'S OWN DATE WHERE IT HAS ONE, and today where it does
// not. That is what keeps the list short without making it shallow: a page
// stating `date: 2019-06-14` opens on June 2019 and its five containing periods
// are the first rows of each group.
//
// AND THE TYPED DATE SURVIVES AS THE WAY TO MOVE THE ANCHOR, not as the answer.
// *Another date…* is the last row; it asks for a `YYYY-MM-DD` and then re-opens
// the list around it. So reach is unbounded in every grain — a quarter in 2014
// is two gestures — while the thing a reader types is a date rather than a
// period, which is the one shape typing is good at.
//
// ── AND THE PROPERTY IS STILL NEVER OVERWRITTEN ─────────────────────────
//
// 1.0.11 skipped the prompt entirely for a page that already stated a date, so
// that a reader could not answer differently from their own frontmatter and
// have it silently rewritten. The skip is gone — with five grains there is no
// single true answer even for a dated page, since the day, week, month, quarter
// and year containing that date are five legitimate destinations and the button
// cannot choose between them.
//
// What made the skip necessary is kept instead, and it was already the code:
// `date:` is written only where there is none. A page that states one keeps it
// exactly as the reader wrote it, whichever entry they file the page under —
// which is the honest split, because the property is WHEN THIS HAPPENED and the
// attachment is WHERE IT IS FILED, and those are two different facts.

// ── AND THE LIST BECAME A WINDOW, AND IT RUNS BOTH WAYS (1.0.51) ────────
//
// *"trying to link a journal page to diary but its not showing all days? I
// think it might be better to put the link options into its own window instead
// of the dropdown file picker/search."*
//
// WHAT WAS ACTUALLY BROKEN, AND IT WAS NOT THE CONTROL. `diaryTargets` built a
// window of periods reaching BACKWARDS from the anchor and nowhere else. A page
// dated 22 September could not be filed under any day after it — today
// included — and the suggester's search box made that worse rather than better,
// because a `SuggestModal` FILTERS A LIST IT WAS HANDED: typing `Day-2026-1` to
// reach October asked a list of fourteen September days whether any of them
// were called that, and the honest answer was *No results found*. A search box
// over a generated list is a promise the list cannot keep.
//
// So two things change and only one of them is the window. The list reaches
// forwards as well as back and pages further in either direction on demand; and
// the box above it AIMS the list instead of filtering it whenever what was
// typed is a date. That rule is one sentence — *a date moves the list,
// anything else narrows it* — and it is the whole of why the box can now answer
// a question the old one could not.
//
// WHY A WINDOW RATHER THAN A BETTER SUGGESTER. A suggester is a single pick
// that closes on contact, and this action had grown two more jobs: saying which
// periods the page is ALREADY filed under, and taking one of those back. Both
// are list-shaped, both want to be seen next to each other, and neither
// survives a control that vanishes the moment you touch it. It goes the way the
// Tags, Habits and Categories lists went — one window, a tick per row, and
// NOTHING WRITTEN UNTIL SAVE — which is the fourth time that shape has been the
// answer and is by now the house rule rather than a resemblance.
//
// A TICK, NOT A PICK, is what the two new jobs make of the old one. The row
// says what is true now and the tick says what should be true; the difference
// between those two is the write. Filing a page under both the day and the
// month used to be the action run twice and is now two ticks, and unfiling it —
// which had no gesture at all, only opening the entry and removing the chip by
// hand — is the same tick going the other way.
//
// THE STAMP FOLLOWS THE FINEST GRAIN LINKED, and still only where `date:` is
// absent. One Save can link four periods; the property is a single day, so it
// takes the most precise of them — the day over the week over the year — which
// is the one that says the most and is the one the reader is most likely to
// have meant. Nothing about the rule above it changes: a page that states a
// date keeps the date it states, whatever it is filed under.

// ── AND THE DAYS BECAME A CALENDAR, AND THE LINK GOT A DESTINATION (1.0.52) ──
//
// Two more things the reader asked for one round later, and they are
// independent of each other.
//
// THE DAYS TAB IS A MONTH GRID. *"I think the days should be groups into weeks,
// and weeks are how the view cycles"* — and a grid groups them by being one:
// every row of it is an ISO week, and ◀ ▶ step a month. See `monthGrid` for
// what the shape costs (a cell cannot carry a sentence) and what it buys. The
// other four tabs stay lists, because five to twelve periods have no second
// dimension to lay out.
//
// AND A SAVE SAYS WHERE IT LANDS. Every link this action has ever written went
// into the region keyed `attachments` — the first shelf of the entry's
// Attachments field — which was the only shelf there was in 1.0.29 and is one
// of two in a note composed since 1.0.49 §5. The window now has a Section and a
// Category field, one pair for the whole Save, and an entry missing either of
// them gets it composed rather than counted as a miss. `landLink` is that
// write, and it is pure.

import { TFile } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import { JOURNAL_DATE_PROPERTY } from "../core/constants";
import {
  hasNoteRegion,
  readNoteRegion,
  writeNoteRegion,
} from "../core/notestore";
import { frontmatterOf, getFile, moment, today } from "../core/util";
import { CLASS_DEFS, TRACKER_CLASSES, noteKindOf } from "../trackers/trackers";
import type { TrackerClass } from "../trackers/trackers";
import { currentEntryKey, entryDateKey, labelForGrain } from "./nav";
import { diaryEntryScope, entryNoteName, locateEntry } from "./lineage";
import {
  hasTarget,
  newAttachment,
  parseAttachments,
  serializeAttachments,
  withoutTarget,
} from "../ui/attachments";
import {
  applyAttachCategories,
  attachFormatOf,
  planAttachCategories,
  readAttachCategories,
} from "../ui/attach-categories";
import type { AttachCategoryRow } from "../ui/attach-categories";
import {
  ENTRY_ATTACH_CATEGORIES,
  ENTRY_SECTIONS,
  addSectionToNote,
} from "./entry-sections";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The region every grain's template gives its attachments field. One spelling,
// here, because `entry-sections.ts` writes `attach:attachments|Attachments` on
// all five grains and a second copy of that key would rot silently — the link
// would simply stop arriving, with nothing failing.
const ATTACH_KEY = "attachments";

// The date this page already claims, if it claims one.
//
// A STRING, WHATEVER YAML MADE OF IT. `date: 2026-09-13` parses as a Date in
// some vaults and a string in others depending on quoting, and a `Date` here
// would reach `openOrCreateDay` as `[object Date]`. Anything that is not
// already an ISO day is treated as absent and the reader is asked — which is
// also the right answer for `date: soon`.
export function statedDate(fm: Record<string, unknown>): string | null {
  const raw = fm[JOURNAL_DATE_PROPERTY];
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return DATE_RE.test(t) ? t : null;
}

// ── the list ─────────────────────────────────────────────────────────────

// One period the page could be filed under: which grain, and that grain's own
// key for the period — `YYYY-MM-DD` for four of them and `YYYY-MM` for a month,
// which is what `Diary.openOrCreateEntry` takes and what `labelForGrain` reads.
export interface DiaryTarget {
  grain: TrackerClass;
  key: string;
}

// One period, named once, so a Map can be keyed by it and a test can say which
// row it means. `:` is safe as the separator because no grain's key contains
// one — four of them are `YYYY-MM-DD` and the fifth is `YYYY-MM`.
export function targetId(target: DiaryTarget): string {
  return `${target.grain}:${target.key}`;
}

// How many periods of its own grain one press of *Earlier* or *Later* adds, and
// how many the list opens with below the anchor.
//
// NOT ONE NUMBER FOR ALL FIVE, because a period is the unit and the units are
// three orders of magnitude apart: fourteen years is a list nobody scrolls, and
// fourteen days is a fortnight. These are roughly a fortnight of days, two
// months of weeks, a year of months, two years of quarters and half a decade of
// years.
//
// THE PAGE IS NOT THE REACH, and as of 1.0.51 that is true in both directions.
// *Later* and *Earlier* add another page each time they are pressed and the
// find box re-aims the list at any date at all, so nothing here is a limit on
// which period can be chosen — only on how much arrives unasked.
export const REACH: Record<TrackerClass, number> = {
  daily: 14,
  weekly: 8,
  monthly: 12,
  quarterly: 8,
  yearly: 5,
};

// The periods of one grain around an anchor date, newest first: `fwd` of them
// after the anchor's own period, then that period, then `back` before it.
//
// PURE, AND EXPORTED FOR THAT REASON. It takes a date and returns keys: no app,
// no vault, no settings. The half that needs a vault is which of these entries
// already exists, and that is the row's DESCRIPTION rather than its identity —
// so the arithmetic that decides what a fortnight of days back from 1 March
// means can be checked without standing a vault up, which is where the
// off-by-one lives.
//
// IT REACHES FORWARD AS OF 1.0.51, which is the defect this round is about. It
// used to run backwards only, so a page dated in September could not be filed
// under a day in October by any gesture the window offered — and the search box
// above it could not help, because a suggester filters the list it is handed
// and October was never in it.
export function periodsAround(
  grain: TrackerClass,
  anchorIso: string,
  back: number,
  fwd = 0
): string[] {
  const at = moment(anchorIso);
  if (!at.isValid()) return [];
  // ── THE STEPPING UNIT IS NOT THE SNAPPING UNIT ────────────────────
  //
  // `CLASS_DEFS.weekly.unit` is `isoWeek`, which is what makes `startOf` land
  // on a Monday and is why `currentEntryKey` is spelled that way. `add` has no
  // such unit and would step by NOTHING — eight rows all naming this week.
  // Stepping by a plain week and snapping afterwards gives the same eight
  // Mondays with no second opinion about where a week begins.
  //
  // AND THE PLURAL IS DELIBERATE. moment normalises either spelling; the test
  // stub's `shift` understands only the plural, and until 1.0.29 it answered an
  // unknown unit by returning the date unchanged — so a singular `month` here
  // would have passed the suite while every row said September. The stub throws
  // now, for `startOf`'s reason, and this side says the word both of them know.
  const snap = CLASS_DEFS[grain].unit;
  const step = snap === "isoWeek" ? "weeks" : `${snap}s`;
  // STEPPED FROM THE ANCHOR ITSELF, AND SNAPPED ONLY ONCE — by
  // `currentEntryKey`, which is where every other caller in the plugin decides
  // what a period's key is. 1.0.29 snapped here as well, against the month-end
  // bug: 31 March minus one month is 3 March for a naive `setMonth`, so a list
  // stepping off the anchor would skip February and name March twice. moment
  // CLAMPS instead — it answers 28 February — and every row is stepped off the
  // same origin rather than off the row before it, so the overflow has two
  // reasons it cannot arise and the second snap had none of its own. It was
  // measured in 1.0.51: a mutant that removed it changed no row in any grain
  // at any anchor, which is a line the suite could not have defended.
  const from = at.clone();
  const out: string[] = [];
  const top = Math.max(0, Math.trunc(fwd));
  const bottom = -Math.max(0, Math.trunc(back));
  for (let n = top; n >= bottom; n--) {
    out.push(currentEntryKey(grain, from.clone().add(n, step)));
  }
  return out;
}

// The ISO day a target's period begins on — the date a page filed under it is
// stamped with.
//
// A MONTH'S KEY IS SEVEN CHARACTERS and every other grain's is already the
// start day, so this is the one shape difference in the whole file. `date:` is
// a day whatever the period, because it is the only date vocabulary the diary
// reads: a page filed under Q3 is dated to the day Q3 began, and the entry it
// hangs off is the precise statement.
export function targetStartIso(target: DiaryTarget): string {
  return target.grain === "monthly" ? `${target.key}-01` : target.key;
}

// ── the find box ─────────────────────────────────────────────────────────

// A period a reader can type, and the grain whose shape they typed.
//
// EVERY SPELLING THE LIST ITSELF SHOWS, which is the test this has to pass: a
// row's description is its entry's filename, so `Day-2026-10-12`,
// `Week-2026-W41`, `Month-2026-10`, `Quarter-2026-Q4` and `Year-2026` are the
// strings a reader has in front of them when they decide to type. Each is
// accepted with or without its prefix, because the bare key is what the rest of
// the plugin writes and what a reader who knows the format will reach for.
const QUERY_FORMS: { re: RegExp; iso: (m: RegExpMatchArray) => string }[] = [
  // A day. The end of a day is the day, so this form bounds nothing itself and
  // leaves `2026-13-01` and `2026-02-30` to the round-trip below — which
  // catches both, because the date it produces is not the date that was typed.
  // Bounding them here as well was measured and removed: the mutant that
  // loosened the pattern changed no answer, which is two guards where one is
  // doing the work.
  { re: /^(\d{4})-(\d{2})-(\d{2})$/, iso: (m) => `${m[1]}-${m[2]}-${m[3]}` },
  // An ISO week, by its number. 4 January is in week 1 in every year by
  // definition, so the Monday of week n is that week's Monday plus n-1 weeks —
  // which is the one piece of week arithmetic that needs no calendar lookup.
  {
    re: /^(\d{4})-?[Ww](0?[1-9]|[1-4]\d|5[0-3])$/,
    iso: (m) =>
      moment(`${m[1]}-01-04`)
        .startOf("isoWeek")
        .add(Number(m[2]) - 1, "weeks")
        .endOf("isoWeek")
        .format("YYYY-MM-DD"),
  },
  // A quarter.
  {
    re: /^(\d{4})-?[Qq]([1-4])$/,
    iso: (m) =>
      moment(`${m[1]}-${String((Number(m[2]) - 1) * 3 + 1).padStart(2, "0")}-01`)
        .endOf("quarter")
        .format("YYYY-MM-DD"),
  },
  // A month. THIS one bounds its number and the day form does not, which is
  // not an inconsistency: a month is aimed at its LAST day, so `2026-13` would
  // roll into 2027 and then round-trip against itself perfectly. The same goes
  // for the week number below. Only a form whose answer IS what was typed can
  // leave the checking to the round-trip.
  {
    re: /^(\d{4})-(0[1-9]|1[0-2])$/,
    iso: (m) => moment(`${m[1]}-${m[2]}-01`).endOf("month").format("YYYY-MM-DD"),
  },
  // A year.
  {
    re: /^(\d{4})$/,
    iso: (m) => `${m[1]}-12-31`,
  },
];

// The anchor a typed query aims the list at, or null if it named no period.
//
// IT RETURNS THE PERIOD'S LAST DAY, not its first, and that is what makes one
// rule serve five grains. The list runs newest first from its anchor, so
// aiming at the END of what was typed puts the whole of it on screen below:
// `2026-10` on the Days tab opens on 31 October with the rest of the month
// under it, and on the Months tab opens on October itself. Aiming at the first
// of the month would have shown one day of October and then September.
//
// A DATE AIMS, ANYTHING ELSE NARROWS. That is the whole contract of the box
// above the list, and it is the half the old suggester could not have: a
// `SuggestModal` filters the rows it was handed, so a date outside the window
// it was built with had no row to match and the reader was told *No results
// found* about a day that exists.
export function anchorFromQuery(query: string): string | null {
  const raw = query.trim();
  if (!raw) return null;
  // The entry prefixes, off the class table rather than spelled again here —
  // `Day-`, `Week-`, `Month-`, `Quarter-`, `Year-`. A reader copying a filename
  // out of the row above should not have to edit it first.
  let bare = raw;
  for (const grain of TRACKER_CLASSES) {
    const prefix = CLASS_DEFS[grain].filePrefix;
    if (bare.toLowerCase().startsWith(prefix.toLowerCase())) {
      bare = bare.slice(prefix.length);
      break;
    }
  }
  for (const form of QUERY_FORMS) {
    const m = bare.match(form.re);
    if (!m) continue;
    const iso = form.iso(m);
    // ROUND-TRIPPED, not merely parsed. 29 February in a common year is a date
    // a `Date` accepts and answers 1 March to, and a list silently aimed one
    // day past what was typed is worse than one that declines to move.
    const at = moment(iso);
    return at.isValid() && at.format("YYYY-MM-DD") === iso ? iso : null;
  }
  return null;
}

// ── the Days tab is a calendar (1.0.52) ──────────────────────────────────
//
// *"I think the days should be groups into weeks, and weeks are how the view
// cycles."* — and then, asked whether a calendar would be neater: *"Would a
// calendar 30 day be a neater choice for the day tab?"*
//
// It is, and for a reason beyond neatness: EVERY ROW OF A MONTH GRID IS AN ISO
// WEEK. Heading a flat list with week numbers is a way of DRAWING weeks; a
// calendar simply is one, and the grouping the reader asked for comes out of
// the shape rather than out of a second pass over the rows. Thirty scrolling
// rows become five, and which days of a month are written — and which this note
// is filed under — are visible at a glance instead of by reading.
//
// DAYS ONLY. The other four tabs are five to twelve periods with no second
// dimension, so a list is right for them and they keep `periodsAround`. This is
// the one grain where a list fights the data.
//
// WHAT A CELL CANNOT CARRY. A row said `Day-2026-10-11 — already written`; a
// cell holds a number and a mark. So that sentence moves to the caption under
// the grid, which names whatever cell was last touched, and to the cell's own
// `title`. Nothing is lost and nothing is invented: the caption is the row.
//
// OUT-OF-MONTH CELLS ARE BLANK rather than being the neighbouring month's days.
// A grid that offered 28 September in the October view would have two ways to
// reach the same day and a ◀ ▶ that sometimes changed nothing — and the step is
// the cycle the reader asked for.

export interface GridWeek {
  // The Monday, as the weekly grain's own key — so a week in the gutter is the
  // same string the Weeks tab would name, with no second definition of where a
  // week starts.
  key: string;
  // `W40`. The gutter's whole text.
  label: string;
  // Seven cells, Monday first. `null` is a day of another month.
  days: (string | null)[];
}

export interface MonthGrid {
  month: string;
  label: string;
  weeks: GridWeek[];
}

// The calendar for whatever month a date falls in.
//
// PURE, LIKE `periodsAround`, AND FOR THE SAME REASON: the arithmetic is where
// the off-by-one lives and none of it needs a vault. The two weeks a reader is
// most likely to find wrong — the one that straddles the turn of the month and
// the one that straddles the turn of the year — are a fixture and an assertion
// here rather than something to notice in a vault.
//
// IT STARTS AT `startOf("isoWeek")` OF THE FIRST, which is what makes the first
// row a week rather than a partial one, and it runs while the Monday is still
// inside the month — so a month whose last day is a Monday gets its sixth row.
export function monthGrid(anchorIso: string): MonthGrid | null {
  const at = moment(anchorIso);
  if (!at.isValid()) return null;
  const first = at.clone().startOf("month");
  const last = at.clone().endOf("month");
  const month = first.format("YYYY-MM");
  const weeks: GridWeek[] = [];
  let cur = first.clone().startOf("isoWeek");
  // A BOUND ON THE LOOP AS WELL AS A CONDITION. Six is every month's maximum
  // and the condition is what ends it; the count is what stops a date library
  // that refused to advance from hanging the window instead of drawing a wrong
  // calendar.
  for (let n = 0; n < 6 && cur.valueOf() <= last.valueOf(); n++) {
    const days: (string | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const day = cur.clone().add(d, "days");
      days.push(day.format("YYYY-MM") === month ? day.format("YYYY-MM-DD") : null);
    }
    weeks.push({ key: cur.format("YYYY-MM-DD"), label: cur.format("[W]WW"), days });
    cur = cur.clone().add(1, "weeks");
  }
  return { month, label: first.format("MMMM YYYY"), weeks };
}

// The day names the grid heads its columns with, Monday first — the order
// `startOf("isoWeek")` puts them in, read off a real week rather than typed out,
// so the two cannot disagree about where the row begins.
export function weekdayHeads(): string[] {
  const from = moment("2026-01-05");
  return [0, 1, 2, 3, 4, 5, 6].map((n) => from.clone().add(n, "days").format("ddd"));
}

// ── where the link lands (1.0.52) ────────────────────────────────────────
//
// *"There also needs to be a field for the attachments field and the category
// (if the attachments section is not on the target, create the section with the
// default categories)."*
//
// Until now this action put every link in the region keyed `attachments`, which
// is the first category of the entry's Attachments field — **Files & Links**.
// That was the only shelf there was when it was written; §5 of 1.0.49 gave a
// fresh entry a second one and the Categories window lets a reader add as many
// as they like, and this action could reach none of them.
//
// ONE PAIR OF FIELDS FOR THE WHOLE SAVE, which is the reader's call and the
// honest one: a Save is almost always one period, and a pair of selects on
// every ticked row would be a column of dropdowns answering the same question.
//
// AND IT CREATES WHAT IS NOT THERE. A period with no entry is already created
// when it is linked — that has been true since 1.0.29 — so an entry with no
// Attachments field being refused was the one asymmetry left: the reader asked
// for the link to land and got a count of what could not. A missing field is
// composed exactly as a fresh entry's is (`addSectionToNote`, so the two cannot
// disagree about what the section is), and a missing category is added through
// the Categories window's own plan — not by writing an `attach:` line here,
// which would be the second place that knows what one looks like.
export interface AttachSectionRef {
  id: string;
  label: string;
}

// The sections of an entry that hold attachments, off the catalogue rather than
// spelled here. `family: "attach"` is already the declaration that a section's
// lines are shelves (`entry-sections.ts` says what it buys), so a second
// attachment-bearing section would appear in this field by being declared and
// in nothing else.
//
// THE CATALOGUE IS A PARAMETER, AND A MEASUREMENT IS WHY. A mutant that filtered
// on `label === "Attachments"` instead of on the family survived every test
// that could be written against the shipped catalogue — there is exactly one
// attachment-bearing section in it, so the two filters cannot disagree about
// today's entries and no fixture could tell them apart. Taking the list as an
// argument is what lets a test hand it a second one and prove that the family
// is what decides. The default is the catalogue, so no caller passes it.
export function attachSections(
  sections: readonly { id: string; label?: string; family?: string }[] = ENTRY_SECTIONS
): AttachSectionRef[] {
  return sections
    .filter((s) => s.family === "attach")
    .map((s) => ({ id: s.id, label: s.label ?? s.id }));
}

// One shelf the window offers, by the key it is stored under and the name it
// shows. BOTH, because the two are needed for different halves of the write:
// the key is how an existing shelf is recognised, and the label is what a shelf
// that has to be created is created as.
export interface LinkCategory {
  key: string;
  label: string;
}

export interface LinkDest {
  section: string;
  key: string;
  label: string;
}

// Where a Save lands when nobody has changed the fields: the first category of
// the Attachments field, which is the region this action has always written to.
// Off `ENTRY_ATTACH_CATEGORIES` so the default here and the default a fresh
// entry ships with are one statement.
export function defaultDest(): LinkDest {
  const section = attachSections()[0];
  const cat = ENTRY_ATTACH_CATEGORIES[0];
  return {
    section: section?.id ?? cat.key,
    key: cat.key,
    label: cat.label,
  };
}

// Every shelf the Category field offers.
//
// THE SHIPPED TWO, PLUS WHATEVER THE ENTRIES AROUND THE ANCHOR HAVE. A reader
// who has added *Receipts* to their days should find it in this field, and the
// only way to know it exists is to read an entry — the categories live in a code
// fence, so the metadata cache cannot answer it.
//
// BOUNDED AT FIVE READS, which is the whole of why it is the anchor's own
// periods and not a walk of the diary: the five entries containing the anchor
// date are the ones a Save is most likely to be about, and five `cachedRead`s
// is a cost a window can pay while it opens. A shelf on no entry near the
// anchor is still reachable — the Categories window on that entry — and this
// field is not the only door onto it.
//
// KEYED, NOT LABELLED. Two entries can hold the same shelf under one key with
// two different names; the first label wins, because the list is drawn once and
// a duplicate row saying `Images` twice is worse than one saying it by the name
// the nearest entry uses.
export async function categoryCatalogue(
  plugin: ChronoAnvilPlugin,
  anchorIso: string
): Promise<LinkCategory[]> {
  const out: LinkCategory[] = ENTRY_ATTACH_CATEGORIES.map((c) => ({ ...c }));
  const seen = new Set(out.map((c) => c.key));
  const at = moment(anchorIso);
  if (!at.isValid()) return out;
  for (const grain of TRACKER_CLASSES) {
    const entry = locateEntry(
      plugin.app,
      plugin.settings.paths,
      grain,
      currentEntryKey(grain, at)
    );
    if (!entry) continue;
    const text = await plugin.app.vault.cachedRead(entry);
    for (const cat of readAttachCategories(text)) {
      if (seen.has(cat.key)) continue;
      seen.add(cat.key);
      out.push({ key: cat.key, label: cat.label });
    }
  }
  return out;
}

// ── what the page is already filed under ─────────────────────────────────

// Every region of an entry a link could be filed in: its categories, and the
// section's own key whether or not a directive names it.
//
// `ATTACH_KEY` IS IN THE LIST EVEN WITH NO `attach:` LINE FOR IT. An entry
// written before 1.0.49 §5 keeps its files in that region, and an entry whose
// directive line somebody deleted by hand keeps them there too — so a question
// asked only of the directives would answer "not filed here" about a note that
// plainly is, and the tick beside it would offer to file it twice.
function attachRegions(text: string): string[] {
  const keys = [ATTACH_KEY, ...readAttachCategories(text).map((c) => c.key)];
  return [...new Set(keys)].filter((key) => hasNoteRegion(text, key));
}

// Whether this entry has the page on any of its shelves.
//
// EVERY CATEGORY, NOT THE FIRST ONE (1.0.52). It asked `attachments` alone,
// which was every shelf there was when it was written and is now the shelf a
// link lands on by default — so a note the reader filed under *Images* read as
// not filed at all: the row offered to link it again, and Save put a second
// copy of it in a second region.
export function pageInEntry(text: string, pagePath: string): boolean {
  return attachRegions(text).some((key) =>
    hasTarget(parseAttachments(readNoteRegion(text, key)), pagePath)
  );
}

// And take it off whichever shelves have it.
//
// ALL OF THEM, for `pageInEntry`'s reason read the other way: a removal that
// cleared one region while the row's "linked" came from another would leave the
// tick doing nothing the reader could see, forever.
//
// IT TOUCHES THE REGIONS AND NOTHING ELSE. A link to this note in the entry's
// prose is the reader's sentence; it is not what filed the note here and it is
// not ours to edit.
export function dropLink(
  text: string,
  pagePath: string
): { text: string; removed: boolean } {
  let out = text;
  let removed = false;
  for (const key of attachRegions(text)) {
    const items = parseAttachments(readNoteRegion(out, key));
    const kept = withoutTarget(items, pagePath);
    if (kept.length === items.length) continue;
    removed = true;
    out = writeNoteRegion(out, key, serializeAttachments(kept));
  }
  return { text: out, removed };
}

// Every period whose entry already carries a link to this page, as `targetId`
// strings.
//
// THE CANDIDATES COME FROM THE LINK GRAPH AND THE ANSWER COMES FROM THE REGION.
// `resolvedLinks` is Obsidian's own index of which note points at which, so
// finding the handful of diary entries that mention this page at all costs no
// file reads; but a page NAMED in a day's prose is not a page FILED under that
// day, and only the attachments regions can tell the two apart. So the graph
// narrows it to a few files and each of those is read once and asked properly.
//
// WHICH MATTERS BECAUSE THE TICK IS ALSO THE UNDO. A row marked "linked" offers
// to take the link back, and a removal that went looking in the reader's own
// sentences would be the one thing this plugin has always refused to do.
//
// ASKED ONCE, BEFORE THE WINDOW OPENS. Reading a file is asynchronous and a
// render is not, so the window is handed a finished set rather than a promise
// per row.
export async function linkedPeriods(
  plugin: ChronoAnvilPlugin,
  pagePath: string
): Promise<Set<string>> {
  const app = plugin.app;
  const paths = plugin.settings.paths;
  const inDiary = diaryEntryScope(paths);
  const out = new Set<string>();
  const graph = app.metadataCache.resolvedLinks ?? {};
  for (const [source, targets] of Object.entries(graph)) {
    if (!targets?.[pagePath]) continue;
    if (!inDiary(source)) continue;
    const file = getFile(app, source);
    if (!file) continue;
    const fm = frontmatterOf(app, file);
    const kind = noteKindOf(paths, file.path, fm["journal"], fm["type"]);
    if (kind?.surface !== "diary") continue;
    const key = entryDateKey(fm, kind.grain);
    if (!key) continue;
    const text = await app.vault.cachedRead(file);
    if (!pageInEntry(text, pagePath)) continue;
    out.add(targetId({ grain: kind.grain, key }));
  }
  return out;
}

// ── one row of the window ────────────────────────────────────────────────

// What a period looks like on screen: its own label, its entry's filename, and
// whether that entry has been written yet.
//
// THE FILENAME IS NOT DECORATION. It is the string a reader types into the find
// box — `anchorFromQuery` accepts every spelling shown here — and it is the
// only thing on the row that says which of five notes a click would reach. On
// the Days tab, where a cell has no room for it, it is the cell's `title` and
// the caption under the grid.
export interface DiaryRow {
  target: DiaryTarget;
  label: string;
  note: string;
  exists: boolean;
}

export function describeTarget(
  plugin: ChronoAnvilPlugin,
  target: DiaryTarget
): DiaryRow {
  return {
    target,
    label: labelForGrain(target.grain, target.key),
    note: entryNoteName(target.grain, moment(targetStartIso(target))),
    exists: !!locateEntry(plugin.app, plugin.settings.paths, target.grain, target.key),
  };
}

// ── ONE VOCABULARY, DRAWN TWO WAYS (1.0.53) ─────────────────────────────
//
// *"improve all tabs to improve readability and smart coloring"*, said of five
// screenshots in which the calendar carried three marks and the four lists
// carried none: every row of a list was the same weight and the same colour,
// and the one thing that differed between them — whether the entry exists —
// was a phrase halfway down a faint second line that fifteen rows repeated.
// Fifteen rows that differ only in a repeated phrase is a list nobody reads.
//
// So the states a period can be in are named ONCE and spelled once, and both
// shapes read the same three functions from here: `stateWord` for what a tick
// will do, `rowSentence` for the whole phrase — the cell's tooltip, the caption
// under the grid, and a row's `title` — and `isNow` for the one landmark every
// tab has. The window turns them into classes in a single place (`marks`), so
// a legend cannot be true of one tab and false of four.

// What a tick will do, in the reader's words. Four states and they are the four
// a reader needs to tell apart: nothing, filed, about to be filed, about to
// stop being filed. "Remove" rather than any other verb — 1.0.43's house rule.
//
// HERE RATHER THAN IN THE WINDOW as of 1.0.53, because the legend now names
// three of these four states and read its own copy of the words until it was
// moved. A legend spelled separately from the thing it explains goes stale.
export function stateWord(was: boolean, now: boolean): string {
  if (was && now) return "linked";
  if (was && !now) return "to remove";
  if (!was && now) return "to link";
  return "";
}

// The sentence a period says about itself.
//
// ONE PHRASING, THREE DRAWINGS: a cell has no room for it and keeps it in its
// tooltip, the caption under the grid IS it, and a row shows the filename and
// keeps the rest in its title. Three copies of
// `exists ? "already written" : "a new entry"` is three chances for the two
// shapes to disagree about the same day — and there were three copies.
export function rowSentence(row: DiaryRow, was: boolean, now: boolean): string {
  const said = stateWord(was, now);
  return `${row.note} — ${row.exists ? "already written" : "a new entry"}${
    said ? ` — ${said}` : ""
  }`;
}

// Is this the period we are in? The calendar has marked today since 1.0.52;
// this is the same question asked of a week, a month, a quarter and a year,
// which is the landmark the four list tabs had none of. A reader scanning
// twelve months for "where am I" was reading twelve labels.
//
// `now` IS A PARAMETER so the claim is observable without faking a clock.
export function isNow(target: DiaryTarget, now: string = today()): boolean {
  const at = moment(now);
  if (!at.isValid()) return false;
  return currentEntryKey(target.grain, at) === target.key;
}

// WHICH PERIOD A LIST BREAKS ITSELF ON. Twelve months running past the turn of
// a year with nothing to mark it is half the readability complaint, and the
// grain above is the obvious ruler: weeks group under their month, months and
// quarters under their year.
//
// DAYS ARE ABSENT because the calendar already groups them — every row of the
// grid is an ISO week with its number in the gutter, which is the grouping the
// reader asked for and the reason the grid exists. Years are absent because a
// decade is not a period this plugin has.
export const GROUP_GRAIN: Partial<Record<TrackerClass, TrackerClass>> = {
  weekly: "monthly",
  monthly: "yearly",
  quarterly: "yearly",
};

export interface RowGroup {
  // The containing period's own key, which is what the list compares to decide
  // that a heading is due. The label is for reading and this is for deciding.
  key: string;
  label: string;
}

// A WEEK BELONGS TO THE MONTH IT STARTS IN, and `targetStartIso` is what
// decides that rather than a second opinion about where a week sits: the week
// of 28 September is under September, the same month its entry's `date:` lands
// in. Any other answer would put one week under two headings or none.
export function groupOf(target: DiaryTarget): RowGroup | null {
  const over = GROUP_GRAIN[target.grain];
  if (!over) return null;
  const at = moment(targetStartIso(target));
  if (!at.isValid()) return null;
  const key = currentEntryKey(over, at);
  return { key, label: labelForGrain(over, key) };
}

// ── the write ────────────────────────────────────────────────────────────

// One row's answer, where it differs from what the file says.
export interface DiaryLinkEdit {
  target: DiaryTarget;
  link: boolean;
}

export interface DiaryLinkResult {
  linked: number;
  removed: number;
  // Periods that could not take the link: an entry with no chronoanvil fence to
  // compose the field into, which is an entry a reader has rewritten by hand.
  // Counted rather than thrown, because the other half of the action — the
  // property — still happened.
  missed: number;
  // The day `date:` was stamped with, or null if the page already stated one.
  stamped: string | null;
  // Entries that gained an Attachments field, and entries that gained the
  // category the reader chose (1.0.52). Said in the notice because both are
  // writes into a reader's note that they did not separately ask for.
  madeSections: number;
  madeCategories: number;
}

// Which of several linked periods the property should name.
//
// THE FINEST GRAIN, which is `TRACKER_CLASSES`' own order and not a second
// opinion about it. One Save can file a page under the day, the week and the
// year at once; `date:` is a single day, so it takes the most precise statement
// on offer rather than whichever row happened to be ticked first.
export function stampTarget(edits: readonly DiaryLinkEdit[]): DiaryTarget | null {
  for (const grain of TRACKER_CLASSES) {
    const hit = edits.find((e) => e.link && e.target.grain === grain);
    if (hit) return hit.target;
  }
  return null;
}

// What filing a page under one entry does to that entry's text (1.0.52).
//
// PURE STRING→STRING, which is what makes the three steps testable: compose a
// missing field, add a missing shelf, put the link on it. The old version was
// three lines inside `vault.process` and could only be asserted by reading its
// source.
//
// IT ANSWERS WITH THE TEXT IT WOULD WRITE AND WHAT IT HAD TO MAKE, so the
// caller's `vault.process` is a `return landing.text` and the notice counts
// come off the same call that did the work.
export interface LinkLanding {
  text: string;
  landed: boolean;
  madeSection: boolean;
  madeCategory: boolean;
}

export function landLink(
  text: string,
  grain: TrackerClass,
  dest: LinkDest,
  page: { path: string; title: string }
): LinkLanding {
  const no: LinkLanding = {
    text,
    landed: false,
    madeSection: false,
    madeCategory: false,
  };
  // ALREADY FILED HERE IS LANDED, AND IT IS ASKED FIRST (measured).
  //
  // It used to be asked of the chosen shelf alone, further down, which is the
  // same narrow question `pageInEntry` was fixed for one section up — and the
  // consequence was worse here: a note filed under *Images* and saved again
  // with the Category field on *Files & Links* got a SECOND copy of itself in
  // the same entry, and a Save that found nothing on the chosen shelf would
  // compose a category to put it on. One entry, one copy, whichever shelf it is
  // on; the window has one tick per period and cannot mean anything else.
  if (pageInEntry(text, page.path)) {
    return { text, landed: true, madeSection: false, madeCategory: false };
  }

  let out = text;
  let madeSection = false;
  let madeCategory = false;

  // THE FIELD, IF IT IS NOT THERE. Composed by the catalogue's own function so
  // an entry that gains Attachments this way is the same section — two
  // categories, two regions — that a fresh entry ships with and that *Add a
  // section…* writes. `null` means there is no widget fence to compose it into,
  // which is the one case this still has to decline.
  if (!readAttachCategories(out).length) {
    const section = ENTRY_SECTIONS.find(
      (s) => s.family === "attach" && s.id === dest.section
    );
    if (!section) return no;
    const made = addSectionToNote(out, { grain }, section);
    if (made == null) return no;
    out = made;
    madeSection = true;
  }

  // WHICH SHELF. By key first, because that is the storage; by label second,
  // because two entries can keep the same shelf under two keys — one composed
  // by this plugin and one a reader typed — and a reader choosing *Images*
  // means the shelf called Images, not the key that usually backs it.
  const cats = readAttachCategories(out);
  const want = dest.label.trim().toLowerCase();
  let key =
    cats.find((c) => c.key === dest.key)?.key ??
    cats.find((c) => c.label.trim().toLowerCase() === want)?.key ??
    null;

  // THE SHELF, IF IT IS NOT THERE. Through the Categories window's own plan, so
  // the directive line and the region behind it are written by the one function
  // that knows what a category is — and so the key is the one `newCategoryKey`
  // would give it rather than a second slugification of the same label.
  if (key == null) {
    const rows: AttachCategoryRow[] = cats.map((c) => ({
      key: c.key,
      label: c.label,
      format: attachFormatOf(c.tokens),
    }));
    rows.push({ key: null, label: dest.label, format: "default" });
    const plan = planAttachCategories(out, rows);
    if (!plan || plan.adds.length !== 1) return no;
    out = applyAttachCategories(out, plan);
    key = plan.adds[0].key;
    madeCategory = true;
  }

  const items = parseAttachments(readNoteRegion(out, key));
  // A DIRECTIVE WITH NO REGION BEHIND IT. `applyAttachCategories` writes both,
  // so this is a note somebody has edited by hand; there is nowhere to put the
  // link and inventing a region under a fence we did not compose is not this
  // function's call.
  if (!hasNoteRegion(out, key)) return no;
  return {
    text: writeNoteRegion(
      out,
      key,
      serializeAttachments([...items, newAttachment(page.path, page.title)])
    ),
    landed: true,
    madeSection,
    madeCategory,
  };
}

export async function applyDiaryLinks(
  plugin: ChronoAnvilPlugin,
  page: TFile,
  edits: readonly DiaryLinkEdit[],
  dest: LinkDest = defaultDest()
): Promise<DiaryLinkResult> {
  const out: DiaryLinkResult = {
    linked: 0,
    removed: 0,
    missed: 0,
    stamped: null,
    madeSections: 0,
    madeCategories: 0,
  };
  const already = statedDate(frontmatterOf(plugin.app, page));

  // WRITTEN ONLY WHERE THERE IS NONE, which is what it has always done and is
  // now load-bearing twice over: the window can file a page under any period,
  // and a control labelled "link" may not rewrite a date the reader put there
  // themselves.
  const stamp = stampTarget(edits);
  if (!already && stamp) {
    const startIso = targetStartIso(stamp);
    await plugin.app.fileManager.processFrontMatter(page, (front) => {
      front[JOURNAL_DATE_PROPERTY] = startIso;
    });
    out.stamped = startIso;
  }

  for (const edit of edits) {
    if (edit.link) {
      // `reveal: false`: the reader pressed a button in the note they are
      // reading, and taking them out of it is not what they asked for. The same
      // argument quick capture makes for the same flag.
      const entry = await plugin.diary.openOrCreateEntry(
        edit.target.grain,
        edit.target.key,
        { reveal: false }
      );
      if (!entry) {
        out.missed++;
        continue;
      }
      const landing = await linkFromEntry(
        plugin,
        entry,
        page,
        edit.target.grain,
        dest
      );
      if (landing.landed) out.linked++;
      else out.missed++;
      if (landing.madeSection) out.madeSections++;
      if (landing.madeCategory) out.madeCategories++;
      continue;
    }
    // A REMOVAL NEVER MAKES AN ENTRY. Ticking a period off that has no note is
    // not a thing a reader can do — the row could not have been marked linked —
    // but a file removed between the window opening and Save is, and creating
    // it in order to take something out of it would be absurd.
    const entry = locateEntry(
      plugin.app,
      plugin.settings.paths,
      edit.target.grain,
      edit.target.key
    );
    if (!entry) continue;
    if (await unlinkFromEntry(plugin, entry, page)) out.removed++;
  }
  return out;
}

// What the notice says afterwards.
//
// SAID WHERE IT HAPPENED AND NOWHERE ELSE. A page that already stated a date
// keeps it, so a notice claiming "Dated …" on that path would be reporting a
// write that did not occur — and this is the only place the reader can see that
// a frontmatter key was touched at all. The same rule is why the two creation
// counts are clauses of their own: composing a field into somebody's entry is a
// larger write than the one they asked for.
export function linkNotice(result: DiaryLinkResult, only: string | null): string {
  const parts: string[] = [];
  if (result.stamped) parts.push(`Dated ${result.stamped}`);
  if (result.linked) {
    parts.push(
      only && result.linked === 1 ? `linked to ${only}` : `linked ${result.linked}`
    );
  }
  if (result.removed) parts.push(`removed ${result.removed}`);
  if (result.madeSections) {
    parts.push(`added an attachments field to ${result.madeSections}`);
  }
  if (result.madeCategories) {
    parts.push(`added the category to ${result.madeCategories}`);
  }
  if (result.missed) {
    parts.push(`${result.missed} with nowhere to put the link`);
  }
  if (!parts.length) return "Nothing to change.";
  const said = parts.join(", ");
  return `${said.charAt(0).toUpperCase()}${said.slice(1)}.`;
}

// ── THE OPENER LIVES WITH THE WINDOW (1.0.66) ───────────────────────────
//
// `linkPageToDiary` used to stand here, and the `import { DiaryLinkWindow }`
// above it closed a cycle: this module imported the window and the window
// imports nine functions back out of this one. See `ui/diary-link-window.ts`,
// which now holds it — everything it needs out of this file is already exported
// for the window's own use, so the move cost nothing but the import line.

// Put a link to `page` on one of `entry`'s shelves.
//
// READ-MODIFY-WRITE INSIDE `vault.process`, where `appendToNoteRegion` would
// have been a straight append. The dedupe needs the current list in hand —
// pressing the button twice must not add the page twice, and `hasTarget` is the
// same check a second drop of the same file makes — and `process` is what
// serialises the read against every other body write, which is the hazard the
// append path exists to avoid. As of 1.0.52 the same callback may also compose
// a section and add a category, which is three edits to one text and exactly
// one reason more to be inside `process` rather than around it.
async function linkFromEntry(
  plugin: ChronoAnvilPlugin,
  entry: TFile,
  page: TFile,
  grain: TrackerClass,
  dest: LinkDest
): Promise<LinkLanding> {
  let out: LinkLanding = {
    text: "",
    landed: false,
    madeSection: false,
    madeCategory: false,
  };
  await plugin.app.vault.process(entry, (text) => {
    out = landLink(text, grain, dest, { path: page.path, title: page.basename });
    return out.text || text;
  });
  return out;
}

// And take it out again (1.0.51). Answers whether anything was there to remove.
//
// THE SAME COMPARISON THE ADD MAKES. `withoutTarget` is `hasTarget`'s pair in
// `attachments.ts` for that reason and not for tidiness: a removal that matched
// more loosely than the add would take out a chip the reader put there, and one
// that matched more strictly would leave the row saying "linked" forever with a
// tick that does nothing.
async function unlinkFromEntry(
  plugin: ChronoAnvilPlugin,
  entry: TFile,
  page: TFile
): Promise<boolean> {
  let wrote = false;
  await plugin.app.vault.process(entry, (text) => {
    const { text: next, removed } = dropLink(text, page.path);
    wrote = removed;
    return next;
  });
  return wrote;
}
