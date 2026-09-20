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

import { Notice, TFile } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import { JOURNAL_DATE_PROPERTY } from "../core/constants";
import {
  hasNoteRegion,
  readNoteRegion,
  writeNoteRegion,
} from "../core/notestore";
import { frontmatterOf, getFile, moment, today } from "../core/util";
import { CLASS_DEFS, TRACKER_CLASSES } from "../trackers/trackers";
import type { TrackerClass } from "../trackers/trackers";
import { currentEntryKey, labelForGrain } from "./nav";
import { entryNoteName, locateEntry } from "./lineage";
import {
  hasTarget,
  newAttachment,
  parseAttachments,
  serializeAttachments,
} from "../ui/attachments";
import { promptDetailedSuggester, promptText } from "../ui/modals";
import type { DetailedChoice } from "../ui/modals";

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
function statedDate(fm: Record<string, unknown>): string | null {
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

// How far back each grain reaches from the anchor, counted in its own periods.
//
// NOT ONE NUMBER FOR ALL FIVE, because a period is the unit and the units are
// three orders of magnitude apart: fourteen years is a list nobody scrolls, and
// fourteen days is a fortnight. These are roughly a season of days, two months
// of weeks, a year of months, two years of quarters and half a decade of years
// — enough that the answer is usually on screen, short enough that the five
// groups together fit a suggester without paging.
//
// THE WINDOW IS NOT THE REACH. *Another date…* re-anchors the whole list, so
// nothing here is a limit on which period can be chosen — only on which ones
// are offered without being asked for.
const REACH: Record<TrackerClass, number> = {
  daily: 14,
  weekly: 8,
  monthly: 12,
  quarterly: 8,
  yearly: 5,
};

// The value of the row that re-anchors the list. Not a number, so it cannot
// collide with the indices every other row carries.
const ANOTHER_DATE = "another-date";

// Every period on offer for an anchor date, grouped by grain and newest first.
//
// PURE, AND EXPORTED FOR THAT REASON. It takes a date and returns keys: no app,
// no vault, no settings. The half that needs a vault is which of these entries
// already exists, and that is the row's DESCRIPTION rather than its identity —
// so the arithmetic that decides what a fortnight of days back from 1 March
// means can be checked without standing a vault up, which is where the
// off-by-one lives.
export function diaryTargets(anchorIso: string): DiaryTarget[] {
  const at = moment(anchorIso);
  if (!at.isValid()) return [];
  const out: DiaryTarget[] = [];
  for (const grain of TRACKER_CLASSES) {
    // ── THE STEPPING UNIT IS NOT THE SNAPPING UNIT ────────────────────
    //
    // `CLASS_DEFS.weekly.unit` is `isoWeek`, which is what makes `startOf` land
    // on a Monday and is why `currentEntryKey` is spelled that way. `subtract`
    // has no such unit and would step by NOTHING — eight rows all naming this
    // week. Stepping by a plain week and snapping afterwards gives the same
    // eight Mondays with no second opinion about where a week begins.
    //
    // AND THE PLURAL IS DELIBERATE. moment normalises either spelling; the test
    // stub's `shift` understands only the plural, and until this release it
    // answered an unknown unit by returning the date unchanged — so a singular
    // `month` here would have passed the suite while every row said September.
    // The stub throws now, for `startOf`'s reason, and this side says the word
    // both of them know.
    const snap = CLASS_DEFS[grain].unit;
    const step = snap === "isoWeek" ? "weeks" : `${snap}s`;
    // SNAPPED BEFORE IT IS STEPPED, which is the month-end bug and not a
    // tidiness. 31 March minus one month is 28 February for moment and 3 March
    // for a naive `setMonth` — so stepping from the anchor itself would make a
    // list that skips February and names March twice, once a year, in whichever
    // implementation is less careful. The first of the month minus n months
    // cannot overflow for any grain here, so the question never arises.
    const from = at.clone().startOf(snap);
    for (let back = 0; back < REACH[grain]; back++) {
      out.push({
        grain,
        key: currentEntryKey(grain, from.clone().subtract(back, step)),
      });
    }
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

// One row per target: what it is called, what its entry is called, and whether
// that entry is already written.
//
// THE FILENAME IS IN THE DESCRIPTION AND THAT IS NOT DECORATION.
// `DetailedChoiceModal` filters on the description as well as the label, so
// `Week-2026-W38` in the description is what makes the list answer to `W38`,
// to `2026-09` and to `Q3` — none of which appear in a label like
// *14 – 20 Sep 2026*.
//
// AND IT SAYS WHEN IT WOULD CREATE ONE. This action makes the entry where there
// is none, which is the right behaviour — filing a page under a week you have
// not written yet is a reasonable thing to want — and a reader should be able to
// see which rows would do it before pressing one.
function targetChoices(
  plugin: ChronoAnvilPlugin,
  targets: readonly DiaryTarget[]
): DetailedChoice[] {
  const paths = plugin.settings.paths;
  return targets.map((target, i) => {
    const def = CLASS_DEFS[target.grain];
    const name = entryNoteName(target.grain, moment(targetStartIso(target)));
    const exists = locateEntry(plugin.app, paths, target.grain, target.key);
    return {
      value: String(i),
      label: labelForGrain(target.grain, target.key),
      description: exists ? `${name} — already written` : `${name} — a new entry`,
      group: `${def.periodNoun[0].toUpperCase()}${def.periodNoun.slice(1)}s`,
    };
  });
}

// Ask which entry this page belongs under.
//
// A LOOP RATHER THAN RECURSION, because *Another date…* can be pressed as often
// as a reader likes and each press is the same question about a different
// anchor. Esc on the list is the only way out that is not an answer — a typed
// date that is cancelled or malformed returns to the list rather than abandoning
// the action, which is what a reader who mistyped one character wants.
async function askForEntry(
  plugin: ChronoAnvilPlugin,
  anchorIso: string
): Promise<DiaryTarget | null> {
  let anchor = anchorIso;
  for (;;) {
    const targets = diaryTargets(anchor);
    const picked = await promptDetailedSuggester(
      plugin.app,
      [
        ...targetChoices(plugin, targets),
        {
          value: ANOTHER_DATE,
          label: "Another date…",
          description: "Move the list to a date of your own",
          group: "Elsewhere",
        },
      ],
      "Link this note to…"
    );
    if (picked == null) return null;
    if (picked === ANOTHER_DATE) {
      const typed = await askForDate(plugin, anchor);
      if (typed != null) anchor = typed;
      continue;
    }
    const at = Number(picked);
    if (Number.isInteger(at) && targets[at]) return targets[at];
    return null;
  }
}

export async function linkPageToDiary(
  plugin: ChronoAnvilPlugin,
  notePath: string
): Promise<void> {
  const file = getFile(plugin.app, notePath);
  if (!file) {
    new Notice("Open a note first.");
    return;
  }

  const already = statedDate(frontmatterOf(plugin.app, file));

  // ANCHORED ON THE PAGE'S OWN DATE WHERE IT HAS ONE. The reader is always
  // asked now — see the block at the top of this file for why five grains left
  // nothing to assume — and anchoring is what keeps that from being a question
  // they have to answer from scratch: a dated page opens with its own day as
  // the first row of the list.
  const target = await askForEntry(plugin, already ?? today());
  if (target == null) return;

  // WRITTEN ONLY WHERE THERE IS NONE, which is what it has always done and is
  // now load-bearing: the picker can file a page under any period, and a button
  // labelled "link" may not rewrite a date the reader put there themselves.
  const startIso = targetStartIso(target);
  if (!already) {
    await plugin.app.fileManager.processFrontMatter(file, (front) => {
      front[JOURNAL_DATE_PROPERTY] = startIso;
    });
  }

  // `reveal: false`: the reader pressed a button in the page they are reading,
  // and taking them out of it is not what they asked for. The same argument
  // quick capture makes for the same flag.
  const entry = await plugin.diary.openOrCreateEntry(target.grain, target.key, {
    reveal: false,
  });
  if (!entry) return;

  const linked = await linkFromEntry(plugin, entry, file);
  // THE STAMP IS SAID ONLY WHERE IT HAPPENED. A page that already stated a date
  // keeps it, so a notice claiming "Dated …" on that path would be reporting a
  // write that did not occur — and this is the only place the reader can see
  // that a frontmatter key was touched at all.
  const dated = already ? "" : `Dated ${startIso}. `;
  const where = labelForGrain(target.grain, target.key);
  new Notice(
    dated +
      (linked
        ? `Linked to ${where}.`
        : `${where} has no attachments field to link from.`)
  );
}

// Move the list to a date of the reader's own.
//
// `askForDate` SURVIVES 1.0.29 AS A NAVIGATION AID rather than as the answer.
// What it returns is an ANCHOR — the date the list is rebuilt around — so the
// thing being typed is a day, which is the one period a `YYYY-MM-DD` box can
// express. It no longer decides which entry the page is filed under, and it is
// no longer on the path a reader takes unless they ask for it.
//
// SEEDED WITH THE CURRENT ANCHOR rather than with today, so nudging the list a
// year back is an edit of four characters.
async function askForDate(
  plugin: ChronoAnvilPlugin,
  anchorIso: string
): Promise<string | null> {
  const input = await promptText(
    plugin.app,
    "Move the list to which date? (YYYY-MM-DD)",
    "YYYY-MM-DD",
    anchorIso
  );
  if (input == null) return null;
  const d = input.trim();
  if (!DATE_RE.test(d)) {
    new Notice("Use the format YYYY-MM-DD");
    return null;
  }
  return d;
}

// Put a link to `page` in `entry`'s attachments region. Answers whether it
// landed: false means the entry has no such region to write into.
//
// READ-MODIFY-WRITE INSIDE `vault.process`, where `appendToNoteRegion` would
// have been a straight append. The dedupe needs the current list in hand —
// pressing the button twice must not add the page twice, and `hasTarget` is the
// same check a second drop of the same file makes — and `process` is what
// serialises the read against every other body write, which is the hazard the
// append path exists to avoid.
async function linkFromEntry(
  plugin: ChronoAnvilPlugin,
  entry: TFile,
  page: TFile
): Promise<boolean> {
  let wrote = false;
  await plugin.app.vault.process(entry, (text) => {
    const items = parseAttachments(readNoteRegion(text, ATTACH_KEY));
    if (hasTarget(items, page.path)) {
      wrote = true;
      return text;
    }
    if (!hasNoteRegion(text, ATTACH_KEY)) return text;
    wrote = true;
    return writeNoteRegion(
      text,
      ATTACH_KEY,
      serializeAttachments([...items, newAttachment(page.path, page.basename)])
    );
  });
  return wrote;
}
