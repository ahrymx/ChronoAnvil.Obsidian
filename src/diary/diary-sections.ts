// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// What is on a diary dashboard, as data.
//
// WHY THIS EXISTS. A journal note can gain a section because journal sections
// are a catalogue: each one knows its id, whether it applies here, and what
// markdown it renders, and `SectionInserter` reads that to add one to a live
// note. The diary had no such thing — `weekly-overview.md` was a file in
// `assets/`, copied verbatim at scaffold time — so there was nothing to
// enumerate, nothing to ask "does this belong here", and nowhere for an editor
// to put a section. 3.0's diary section editing had no object to edit.
//
// This is that object. It is deliberately the same shape as `JournalSection`:
// an id and a blurb for a picker, an `applies` predicate, and a `render` that
// returns fence blocks.
//
// WHAT IT MUST NOT DO YET. Patch 3 of the 2.59 plan generates markdown and
// changes nothing: `composeDiaryDashboard` reproduces the four shipped assets
// BYTE FOR BYTE, and a test diffs them. Scaffold still copies the files. That
// diff is the gate — if it is not exact, the composition is wrong somewhere
// subtle and patch 4 must not start.
//
// WHAT THE CATALOGUE ALREADY EXPOSED. Writing the four dashboards down as one
// description made three divergences visible that were invisible as four files:
//
//   - The monthly dashboard has no "keep this month" button, where weekly,
//     quarterly and yearly all do — even though monthly entries exist and are
//     the oldest of the five.
//   - The yearly dashboard has no Open Tasks section, and its charts block has
//     no header where every other one does. THE SECOND OF THESE WAS FIXED IN
//     3.9 — it was a bug, and the one this paragraph said needed "a patch that
//     is allowed to change behaviour". The absent Open Tasks section is the
//     decision (2.58.6: a year of open tasks grouped by source note is a
//     page-long list nobody reads) and stays.
//   - `year-start` is written `: ""` where the other three write a bare `:`.
//     FIXED IN 3.11 §7.4 — see `frontmatter` below. It was neither a bug nor a
//     decision but a third thing the original list had no room for: a byte
//     preserved for a diff that had already been retired.
//
// ALL THREE ARE NOW ANSWERED, which is what the recording was for. The note
// this paragraph used to end with — "telling them apart is a question for a
// patch that is allowed to change behaviour" — took three releases to work
// through, and the divergences were only ever visible because the four
// dashboards had been written down as one description.

import { CLASS_DEFS } from "../trackers/trackers";
import { DEFAULT_PATHS, HEADER_PREFIX, TRENDS_HEADING } from "../core/constants";
import { segment } from "../core/layout";
import {
  SectionModel,
  SectionWant,
  idsOf,
  optionsFor,
  SectionOp,
  SectionQuestion,
  SectionView,
  describeAnswers,
  desiredOrder,
  holdPinned,
  moveOps,
  reconfigured,
  withAnswers,
} from "../core/section-model";
import { BANNER_ID, PAGE_TITLE_LINE, locateTitle } from "../core/note-sections";

// What "the host note's own folder" is on this dashboard, for a plan line. A
// dashboard sits in its grain's folder — `02 - Diary/Weekly` — which is exactly
// the folder that made this section's default wrong in 3.14 and is worth
// naming rather than alluding to.
export function diaryHostLabel(ctx: DiaryDashboardContext): string {
  return ctx.hostFolder || "this note's folder";
}
import { periodPropertyFor } from "../charts/charts";
import type { PeriodBounds } from "../charts/charts";
import type { TrackerClass } from "../trackers/trackers";

// The dashboards, which is every grain except daily.
//
// A daily entry IS the note — there is nothing for a daily dashboard to
// summarise — so `daily` has no dashboard and asking for one is a caller error
// rather than an empty result.
export type DashboardGrain = Exclude<TrackerClass, "daily">;

export interface DiaryDashboardContext {
  grain: DashboardGrain;
  // The vault's configured diary root, for the one section that has to name a
  // folder (3.14 §2.3). Optional, and the optionality is the interesting part.
  //
  // WHY IT IS NOT REQUIRED. `composeDiaryDashboard` builds a context from a
  // grain and nothing else, and it never renders the section that reads this,
  // because Tags is `optIn` and the composer skips those. The caller that DOES
  // render it is the editor, and `section-insert.ts::diaryContextFor` holds the
  // plugin and supplies the configured path. Making it required would put a
  // field on fifty-nine call sites to be read by one.
  //
  // The fallback is `DEFAULT_PATHS.diaryRoot` — the shipped value, correct for
  // every vault that has not repointed its diary, and reachable only from a
  // caller with no settings to consult. `test/diary-sections.test.ts` pins that
  // the editor's context carries the configured one, because the fallback being
  // right in the common case is exactly what would hide it being reached.
  diaryRoot?: string;
  // The folder the dashboard note itself sits in, when the caller knows it —
  // what an empty folder answer resolves to (3.15 §10.9). Optional for
  // `diaryRoot`'s reason and read by the same caller: the composer builds a
  // context from a grain and never draws a control, and
  // `section-insert.ts::diaryContextFor` holds the note.
  hostFolder?: string | null;
}

export interface DiarySection {
  // What this section can be asked, and where the answer is written. Absent on
  // every section that can write its own directive without asking anybody
  // anything, which is most of them.
  questions?: (ctx: DiaryDashboardContext) => SectionQuestion[];
  id: string;
  // Shown in a picker. Present now so 3.0's editor has something to list, and
  // because writing the label beside the markdown is what stops the two
  // drifting.
  label: string;
  blurb: string;
  // The glyph a row is tokened with. Added in 3.0 with the shared interface:
  // journal sections have carried one since the catalogue existed, and a list
  // of dashboard sections drawn without them read as a different list from the
  // one two clicks away.
  //
  // Where the section renders a header bar this is that bar's own emoji, so the
  // row and the note agree — the same rule `JournalSection.icon` follows.
  icon: string;
  // LOCKED sections cannot be removed.
  //
  // `links` and `summary` are locked; the three below them are not.
  //
  // Position is still the reader's for everything except `links` — a dashboard
  // whose banner someone wants below their charts is a preference about their
  // own note, and `summary` keeps that freedom. See `pinned`.
  locked: boolean;
  // PINNED sections cannot be MOVED either. 3.2 §4, and the argument is
  // `EntrySection.pinned`'s — stated there at length rather than twice, because
  // it is one decision about one row that happens to appear on two surfaces.
  pinned?: boolean;
  // Which band of the page this section belongs to, and therefore which fence.
  //
  // NEW IN 3.2 PATCH 3, AND IT IS THE PATCH. A dashboard used to be a flat list
  // — one section, one fence, every one reorderable against every other. §3
  // fuses navigation and the period summary into a single card, and a single
  // card is a single fence, so those two stop being independent blocks and
  // become directive lines sharing one. That is the entry's `fence: "own" |
  // "shared"` distinction arriving on the other diary surface, which is what
  // this release is for.
  //
  // A SECTION MAY NOT CROSS BETWEEN BANDS, and that is the second half of §4's
  // rule rather than a new one. "Navigation is the top row" is not enforced by
  // pinning navigation alone: a reader who drags the charts above it has moved
  // nothing that was pinned and has still put something above the top row. The
  // band is what makes that unreachable, the same way the rule on an entry
  // makes it unreachable there — by there being nowhere to drop it, not by a
  // check that says no.
  //
  // ── AND THERE ARE THREE OF THEM AS OF 4.10 ─────────────────────────
  //
  // `head` is the page's own name and the places it can go. It is a band rather
  // than the first member of the masthead, and the reason is not taste:
  //
  //   A BAND IS A FENCE. `masthead` is in `ONE_FENCE`, so everything in it is
  //   welded into a single block — and `assetUnits` marks only the FIRST
  //   directive of a block insertable, with `fences` being the whole block. Put
  //   the head first in the masthead and `applyLayout` step 3, meeting a
  //   dashboard that predates this release, inserts the entire masthead a
  //   second time: two navigation rows, two banners, two buttons. Put it second
  //   and it is never insertable at all, so no existing dashboard would ever
  //   get one.
  //
  //   BANDS ARE CONTIGUOUS. A `body` section composed above the masthead would
  //   split the body in two, and the partition below — which reorders each band
  //   against its own part of `want` — assumes each band is one run.
  //
  // So the head is its own fence, its own group in the editor, and alone in its
  // band: immovable by the arithmetic `isMovable` already does, rather than by
  // a rule that had to be written.
  band: "head" | "masthead" | "body";
  // How many lines of the READER'S OWN content this section is holding in this
  // note, for a section whose body is theirs rather than the catalogue's.
  //
  // §4 of the 3.0 plan states the rule as "a section that owns a region owns
  // the reader's writing, so it inherits the removal refusal automatically". A
  // dashboard has no regions — but `charts` owns a fence whose body is chart
  // directives the reader added through the chart editor, which is the same
  // fact wearing dashboard clothes. So the rule is expressed as "what does this
  // section hold" rather than as "does it have a region", and the one section
  // that holds something says so.
  //
  // Absent means the section's body is entirely the catalogue's and removing it
  // costs nothing but the section.
  holds?: (text: string) => number;
  // Whether this section belongs on this dashboard. The field that earns the
  // catalogue on its own: "Open Tasks belongs on a week but not a year" is a
  // question the four asset files could only answer by being different.
  applies: (ctx: DiaryDashboardContext) => boolean;
  // OFFERED HERE, BUT NOT SHIPPED HERE. New in 3.9 §2, and it is the third
  // answer to a question that previously had two.
  //
  // `applies` used to decide both "may a reader add this" and "does a fresh
  // vault get this", because `composeDiaryDashboard` walks exactly the sections
  // that apply. Those are different questions and 3.9 is the release that needs
  // them separated: the recap is a section every year and quarter dashboard may
  // have, and one that neither gets by default.
  //
  // WHAT IT CHANGES, precisely: `composeDiaryDashboard` skips it, so the
  // shipped note does not contain it and `reconcileLayouts` — which converges a
  // note toward the composed text — has no unit for it and will neither insert
  // it nor, later, take it back out. Everything else treats it as an ordinary
  // section: it is in `sectionsForDashboard`, so the editor lists it, `addable`
  // offers it, `locate` finds it once added, and removal is the ordinary path.
  //
  // Absent means the ordinary case: applies here, therefore ships here.
  //
  // A PREDICATE, SINCE 3.11 §5, where `entry-rollup` became the first section
  // that is opt-in at one grain and shipped at another: a quarter's rollup
  // overlaps its recap and is offered rather than assumed, while a week's and
  // a month's overlap nothing. A bare `true` is still the common case and
  // still reads as "offered everywhere it applies, shipped nowhere".
  optIn?: boolean | ((ctx: DiaryDashboardContext) => boolean);
  // The lines inside this section's fence, and which fence.
  // `opts` is what the reader chose for this instance — see the same parameter
  // on `EntrySection.directive`, which it mirrors deliberately. A dashboard
  // section that ignores it is the ordinary case.
  render: (
    ctx: DiaryDashboardContext,
    opts?: Record<string, unknown>
  ) => { fence: string; lines: string[] };
  // Where this section already is in a note's text, or -1.
  //
  // Needed before anything can ask "is this section already here", which is the
  // question that separates a template generator from a section model: a
  // generator writes the whole file, an editor has to add the one thing that is
  // missing without duplicating the six that are not.
  //
  // Matches the DIRECTIVE, not the header. A reader retitles a header — that is
  // what the `header:` argument is for — and matching on it would make a
  // renamed section invisible and then offer to add a second copy.
  locate: (text: string) => number;
}

// Find a directive at the start of a line, ignoring what follows it.
const probe = (text: string, re: RegExp): number => text.search(re);

const always = (): boolean => true;

// How many charts the reader has configured in this text.
//
// Counted off the `chart:` directives rather than by parsing them, because the
// question is "is there anything of yours here" and a malformed directive is
// still theirs. `parseChartDirectives` would silently skip one it could not
// read, which on a removal path means dropping the line that most needed
// keeping.
const chartLinesIn = (text: string): number =>
  text.split("\n").filter((l) => /^\s*chart:/.test(l)).length;

// The period noun a directive is spelled with: `week-summary`, `new-quarter`.
// Taken from the class table rather than the grain id, because the grain is
// `weekly` and the directive is `week` — one is an adjective and the other is
// the period itself, which is exactly the distinction `periodNoun` was added
// for in 2.58.0.
const noun = (ctx: DiaryDashboardContext): string =>
  CLASS_DEFS[ctx.grain].periodNoun;

export const DIARY_SECTIONS: DiarySection[] = [
  {
    id: BANNER_ID,
    label: "Banner",
    blurb:
      "The page's own name, where it can go in the vault and in time, and the control that renames it and edits its sections.",
    icon: "🏷️",
    // LOCKED AS OF 4.19, WHERE THE HEAD WAS NOT. The head was removable — *a
    // page without a title card is a coherent thing to want* — and `links` was
    // not — *a vault where some dashboards can get home and others cannot is
    // worse than one with no links at all*. Merging them makes one block that
    // cannot hold both rules, and the navigation one is the stronger: a missing
    // title costs a label the tab already shows, and a missing links row costs
    // the way out of the page. `bannerSection` states the same trade for the
    // flat notes and this is that decision, once, not twice.
    locked: true,
    // PINNED, unchanged and still the stronger of the two claims 3.2 §4 makes.
    // Navigation being the top row is a convention; a page's own NAME being
    // somewhere other than the top is a page with its title in the middle of it.
    pinned: true,
    // ITS OWN BAND, WHICH IS ITS OWN FENCE — AND THAT IS NOW THE MERGE RATHER
    // THAN AN OBSTACLE TO IT.
    //
    // 4.10 put the head in a band of its own and gave the reason: in the
    // masthead it would be welded into the navigation block, and `applyLayout`
    // step 3 — meeting a dashboard older than that release — would either insert
    // the entire masthead a second time or never insert the head at all, because
    // `assetUnits` marks only a block's FIRST directive insertable.
    //
    // THAT OBJECTION WAS ABOUT `applyLayout`, AND REPAIR STOPPED GOING THROUGH
    // IT IN 4.18. `repair-plan.ts` reconciles composed notes through
    // `SectionModel`, which matches on SECTION IDENTITY rather than on a
    // keyword's position in a block — it was moved there precisely because the
    // keyword reconciler could not see past the first directive of a welded
    // fence. So the hazard that made the head a band of one is gone, and what
    // the band does now is the opposite job: `ONE_FENCE` does not contain
    // `head`, so a head band holding two sections' worth of lines composes as
    // ONE fence, which is exactly the block this release wants. The mechanism
    // did not change; the thing it was protecting against did.
    band: "head",
    applies: always,
    render: () => ({
      fence: "almanac",
      lines: [
        PAGE_TITLE_LINE,
        // `home` LEFT THIS LINE IN 4.10 — the title line above carries it, and
        // two pills to the same page on one screen is the doubling that release
        // began and this one finishes.
        //
        // AND THE CLAIM THAT USED TO BE HERE WAS FALSE, WHICH IS WORTH THE
        // SENTENCE. It read: *"Repair applies it to notes that already exist
        // without a migration: `links` is in `MANAGED_ARGS`, so step 2 rewrites
        // the arguments wherever it finds them."* That was true when it was
        // written and stopped being true in 4.18: `MANAGED_ARGS` is read only by
        // `planLayout`/`applyLayout`, and `reconcileLayouts` now sends every note
        // carrying a `surface` — all eight composed notes, these four among them
        // — through `repairNote` instead. Step 2 of THAT pass is `planFlags`,
        // which reads `MANAGED_FLAGS` and nothing else. So no dashboard written
        // before 4.10 has ever had this argument rewritten, and 4.19 must carry
        // its own migration rather than inherit one that was not running.
        //
        // AND THE ENTRY'S ROW STILL KEEPS `home`, which is not drift. An entry
        // has no `title:` line — `entry-header` already renames the note, so a
        // second name above it would be the page's name twice — so nothing else
        // on an entry offers Home. `masthead.test.ts` asserts the difference is
        // exactly that one id.
        "links:today,scopes#diary",
      ],
    }),
    // EITHER LINE ANCHORS IT — `bannerSection` argues this in full. The short
    // version: the head was removable until this release, so a dashboard with a
    // navigation row and no title line is a state a reader was invited into, and
    // a title-only anchor would compose them a second navigation row.
    locate: (text) => {
      const at = locateTitle(text);
      return at >= 0 ? at : probe(text, /^links:/m);
    },
  },
  {
    id: "summary",
    label: "Period summary",
    // THE WORD "BANNER" LEFT THIS SENTENCE IN 4.19, and the reason is one row
    // up: the section above is now called Banner, so a dashboard listed two
    // sections that both claimed to be the banner. The label was always "Period
    // summary" and stays it; only the blurb was overreaching.
    blurb: "What this period holds, and its date navigator.",
    icon: "🗓",
    // LOCKED, and the one that most obviously has to be: without it the
    // dashboard has no date navigation and no way to say which period it is
    // scoped to. It stops being a dashboard rather than losing a feature —
    // `entry-header`'s argument exactly.
    locked: true,
    // The other half of the masthead. Locked as before, and immovable as of
    // patch 3 — see `isMovable`, which derives that rather than declaring it.
    band: "masthead",
    applies: always,
    render: (ctx) => ({
      fence: "almanac",
      lines: [
        `${noun(ctx)}-summary`,
        // All four now. Monthly was the exception until 3.3 — not by argument
        // but by age: `new-monthly` was written when the monthly note was a
        // "review" and the only way to make one was to be asked which month.
        // The other three grew scoped buttons in 2.57 and monthly was never
        // brought along.
        `button:new-${noun(ctx)}`,
      ],
    }),
    locate: (text) => probe(text, /^(day|week|month|quarter|year)-summary\b/m),
  },
  {
    id: "recap",
    label: "Recap",
    blurb: "Goals, highlights and challenges from the entries in this period.",
    icon: "📝",
    // THE CONTENT OF THIS SECTION IS NOT IN THIS NOTE. Goals, highlights and
    // challenges are read out of the monthly entries every render — `itemsOf`
    // and `goalsOf`, unchanged by 3.9 — so removing the section removes a view
    // of them and not one word of anyone's writing. Freely removable, and no
    // `holds`.
    locked: false,
    band: "body",
    // The two grains whose banners used to draw this, and both of them, because
    // doing one is worse than doing neither: `year-view.ts` imports
    // `renderGoals` and `renderList` from `quarter-view.ts` precisely so the
    // two cannot drift, and sectioning the year alone would put that drift back
    // — a foldable recap at one zoom and a wall inside a banner at the other,
    // from one set of functions.
    applies: (ctx) => ctx.grain === "yearly" || ctx.grain === "quarterly",
    // OPT-IN, WHICH IS A DECISION AND NOT A DEFAULT NOBODY CHOSE. The complaint
    // that started §2 is that the banner is a document: the recap is unbounded,
    // it pushes the stats band — the part a banner is FOR — off screen, and a
    // reader who wants the numbers and not the recap cannot say so. Shipping
    // the section ON would answer the last third of that and leave the first
    // two exactly as they were on every existing dashboard.
    //
    // So the banner goes short for everyone and the recap is a thing you ask
    // for. THE COST IS REAL AND IS PAID FOR ELSEWHERE: a reader who upgrades
    // sees less than they saw yesterday, which is the one outcome the roadmap
    // names as needing to be designed out. `renderRecapMoved` in
    // ../review/recap-view.ts is that mitigation — the banner says where the
    // recap went and offers to put it back, and it says so only when there is
    // something to have lost.
    optIn: true,
    render: (ctx) => ({
      fence: "almanac",
      lines: [`header:📝 Recap`, `period-recap:${noun(ctx)}`],
    }),
    locate: (text) => probe(text, /^period-recap\b/m),
  },
  {
    id: "entry-rollup",
    // "entries" RATHER THAN "days" SINCE 3.11 §5, because the section now
    // gathers days on a week and a month and months on a quarter, and the
    // editor row is one string for all three. The HEADER inside the note stays
    // grain-specific — see `render` — since that is read in place, where the
    // grain is obvious and the vaguer word would be a small loss of meaning.
    label: "What the entries said",
    blurb: "Each entry of the grain below, rolled up.",
    icon: "📖",
    // Reads the entries below it and holds nothing of its own, so removing it
    // takes a view away and no writing with it.
    locked: false,
    band: "body",
    // WEEKLY, MONTHLY AND QUARTERLY AS OF 3.11 §5. This read "Monthly only,
    // today. Whether a quarter should roll up its months is a real question and
    // not this patch's." It was two narrownesses in a trenchcoat, and only the
    // second was written down: the SECTION applied to monthly alone, and the
    // WIDGET was hardcoded to daily entries, so a quarter could not have rolled
    // up months even where the section was allowed.
    //
    // Weekly costs nothing and is the one that was missing most. A week's seven
    // days are already what `rollupDays` returns for the host's bounds, and
    // `week-summary`'s table shows status, mood and task counts — it does not
    // show a word anyone wrote. "What the days said" on a week is what makes a
    // weekly entry writable without opening seven notes, which is the argument
    // the monthly version was built on in the first place.
    //
    // NOT ON A YEAR. Twelve monthly entries would be defensible; a year of
    // daily ones is not, and `entry-rollup:month` on a year would need the
    // section to carry a grain the reader never chose. The argument is
    // `open-tasks`' from 2.58.6 and it is left where it is.
    applies: (ctx) =>
      ctx.grain === "weekly" ||
      ctx.grain === "monthly" ||
      ctx.grain === "quarterly",
    // OPT-IN ON A QUARTER ONLY, and this is the one place in this catalogue
    // where `optIn` varies by grain rather than being a property of the
    // section.
    //
    // A quarter's `recap` already surfaces goals, highlights and challenges
    // from its monthly entries. `entry-rollup:month` surfaces each month's
    // fields as a list. Those are close enough to be a fair complaint —
    // an aggregate and a list of the same source — and different enough to
    // both exist. So the quarter gets the choice and does not get it made for
    // it. Weekly and monthly overlap nothing and ship on.
    optIn: (ctx) => ctx.grain === "quarterly",
    render: (ctx) =>
      ctx.grain === "quarterly"
        ? {
            fence: "almanac",
            lines: [
              "header:📖 What the months said",
              // `:month`, singular, matching `month-start` and
              // `tasks-table:…,month` rather than the index's `monthly`.
              "entry-rollup:month",
            ],
          }
        : {
            fence: "almanac",
            lines: ["header:📖 What the days said", "entry-rollup"],
          },
    locate: (text) => probe(text, /^entry-rollup\b/m),
  },
  {
    questions: (ctx) => [
      {
        kind: "folder",
        key: "folder",
        label: "the folder to collect tasks from",
        directive: "tasks-table",
        hostFolder: ctx.hostFolder ?? null,
      },
    ],
    id: "open-tasks",
    label: "Open tasks",
    blurb: "Still-open Almanac tasks from entries inside this period.",
    icon: "⏳",
    // The tasks live in the entries this aggregates, not here. Removing the
    // table removes a view of them and touches not one task.
    locked: false,
    // Not on a year: a year of open tasks grouped by source note is a
    // page-long list nobody reads (2.58.6).
    band: "body",
    applies: (ctx) => ctx.grain !== "yearly",
    render: () => ({
      fence: "almanac",
      lines: ["header:⏳ Open tasks", "tasks-table:,period"],
    }),
    locate: (text) => probe(text, /^tasks-table\b/m),
  },
  {
    id: "charts",
    label: "Trends and statistics",
    blurb: "The charts manager for this period.",
    icon: "📊",
    // NOT LOCKED, AND NOT FREELY REMOVABLE EITHER — the one section on a
    // dashboard where those are different answers.
    //
    // A reader who wants no charts on their year should be able to say so; a
    // reader with nine charts configured must not lose them to an untick. The
    // `holds` callback is what separates the two, and it is the same shape as
    // the entry catalogue's region test: removal is refused while the section
    // is holding something of theirs, and the fix is named — clear it, then
    // remove.
    locked: false,
    holds: (text) => chartLinesIn(text),
    band: "body",
    applies: always,
    render: () => ({
      fence: "almanac-charts",
      // EVERY GRAIN, AS OF 3.9. The yearly dashboard's charts block carried no
      // header, and this line read `ctx.grain === "yearly" ? [] : [...]` with a
      // comment saying "preserved, not corrected".
      //
      // It was a defect, not a decision, and 2.59.3's catalogue header said as
      // much when it recorded the divergence: "Two of them are probably bugs
      // and one is probably a decision, and telling them apart is a question
      // for a patch that is allowed to change behaviour." This is that patch.
      //
      // WHAT IT LOOKED LIKE. `registerMarkdownCodeBlockProcessor` renders the
      // Add / Edit… toolbar on its own when there is no `header:` — a
      // deliberate path, for vaults whose Trends title is still a separate
      // block above the fence (see `mergeTrendsSection`). The year note has no
      // such block and never had one, so it got the fallback with nothing to
      // fall back to: no title, no fold arrow, no count, just a bare "Add
      // chart" button. Which then reads as belonging to whatever section
      // precedes it — harmless while the thing above was a banner, and
      // actively wrong the moment 3.9 §2 put a section there.
      //
      // The year is not a special case in any other respect here: same fence,
      // same manager, same specs. The absence was age, not argument.
      lines: [`${HEADER_PREFIX}${TRENDS_HEADING.replace(/^#+\s*/, "")}`],
    }),
    locate: (text) => probe(text, /^```almanac-charts/m),
  },
  {
    // TAGS ON A DASHBOARD — 3.14 §3. The section already existed on the
    // homepage and on every journal index; this is the third surface, and the
    // first one where the widget's own default is wrong rather than merely
    // improvable.
    //
    // `tag-index` with no argument reads the host note's own parent, which is
    // the rule `tasks-table`, `review-queue` and `journal-search` all follow
    // and the one this directive was brought into line with in 3.11 §6. On a
    // journal index that is exactly right — an index note sits in the folder it
    // indexes. Here the host's folder is `02 - Diary/Weekly`, which holds the
    // overview and the weekly entries and almost never a tag, so a bare
    // directive draws the empty state on the surface a reader just added it to.
    //
    // SO THE ARGUMENT IS COMPOSED, exactly as the homepage's is, and for 3.11
    // §6's reason: "the note now states its own scope, which is what makes it
    // editable rather than magic." The path is resolved here, by the catalogue,
    // and lands in the reader's note where they can change it — by hand today,
    // and from the dialog when the section editor learns to read an answer back
    // (3.15).
    //
    // NOT A QUESTION, deliberately. A section that cannot be added without an
    // answer needs a control to answer with, and that control is 3.15's whole
    // subject. Asking here would mean either importing that release's risk or
    // inventing a second, worse control to avoid it.
    questions: (ctx) => [
      {
        kind: "folder",
        key: "folder",
        label: "the folder to read tags from",
        directive: "tag-index",
        // 3.14 composed this argument because the host's own folder is the
        // WRONG default here — `02 - Diary/Weekly` holds period notes and
        // almost never a tag. So the placeholder names what empty would mean
        // and the composed path is what the reader actually finds in the field.
        hostFolder: ctx.hostFolder ?? null,
      },
    ],
    id: "tags",
    label: "Tags",
    blurb: "Every tag under the diary, most-used first, and which folder it came from.",
    icon: "🏷️",
    // Nothing of the reader's lives in this section: the tags are in their
    // notes, and removing the table removes a view of them.
    locked: false,
    band: "body",
    // EVERY GRAIN, AND OPT-IN ON EVERY GRAIN — two answers to two questions
    // (3.9 §2). A tag cloud reads a folder, not a period, so there is no grain
    // where it makes less sense than another, which is `applies`. And a
    // dashboard's job is the period: four dashboards each silently growing an
    // identical cloud over the same folder would be one view drawn four times,
    // which is `optIn`.
    applies: always,
    optIn: true,
    render: (ctx) => ({
      fence: "almanac",
      lines: [
        "header:🏷️ Tags",
        `tag-index:${ctx.diaryRoot ?? DEFAULT_PATHS.diaryRoot}`,
      ],
    }),
    // MATCHES THE KEYWORD, NOT THE ARGUMENT, so a reader who repoints the
    // cloud at their own folder still has a section the editor can find — the
    // rule the homepage's entry states and every catalogue follows.
    locate: (text) => probe(text, /^tag-index\b/m),
  },
];

// Which of this dashboard's sections the note already has, in the order they
// appear. The diary half of `detectSections`.
export function detectDiarySections(
  text: string,
  ctx: DiaryDashboardContext
): string[] {
  return sectionsForDashboard(ctx)
    .map((s) => ({ id: s.id, at: s.locate(text) }))
    .filter((s) => s.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((s) => s.id);
}

// What could still be added here: applies to this grain, and is not already in
// the note. The diary half of `addableSections`, and the call 3.0's editor
// makes.
export function addableDiarySections(
  ctx: DiaryDashboardContext,
  text: string
): DiarySection[] {
  const present = new Set(detectDiarySections(text, ctx));
  return sectionsForDashboard(ctx).filter((s) => !present.has(s.id));
}

// One section's markdown, for adding it to a note that lacks it.
export function renderDiarySection(
  section: DiarySection,
  ctx: DiaryDashboardContext,
  opts?: Record<string, unknown>
): string {
  const { fence, lines } = section.render(ctx, opts);
  return ["```" + fence, ...lines, "```"].join("\n");
}

// Is this section opt-in on THIS dashboard? See `DiarySection.optIn`.
export function isOptIn(
  section: DiarySection,
  ctx: DiaryDashboardContext
): boolean {
  return typeof section.optIn === "function"
    ? section.optIn(ctx)
    : section.optIn === true;
}

export function sectionsForDashboard(
  ctx: DiaryDashboardContext
): DiarySection[] {
  return DIARY_SECTIONS.filter((s) => s.applies(ctx));
}

// The frontmatter a dashboard declares: its period property, blank.
//
// Blank is the point — the note says it is a weekly dashboard before it has
// chosen a week, which is why `periodUnitOf` tests for the KEY's presence and
// not for a value.
function frontmatter(ctx: DiaryDashboardContext): string[] {
  // The PERIOD property (`month-start`), not the grain's `dateProperty`.
  //
  // Those are two different things and the byte-diff found it: `dateProperty`
  // is where an ENTRY keeps its own date — `journal-date` for daily, `month`
  // for monthly — where a dashboard declares which period it is currently
  // scoped to. Weekly, quarterly and yearly happen to use the same key for
  // both, so three of the four passed while the composition was wrong; monthly
  // is the one grain where they differ, and it failed.
  //
  // Through `periodPropertyFor` rather than `${noun}-start` so this is the same
  // derivation `periodUnitOf` and `resolvePeriodBounds` read, not a fourth
  // spelling of it.
  // `periodNoun`, not `unit`: PeriodBounds speaks in periods ("week") where the
  // class table's `unit` is a moment unit ("isoWeek"). For the four dashboard
  // grains those nouns ARE the four period units — which is why the cast is
  // safe here and would not be if `daily` were a dashboard grain, and
  // DashboardGrain excludes it precisely because a daily entry is the note.
  const prop = periodPropertyFor(noun(ctx) as PeriodBounds["unit"]);
  // ALL FOUR WRITE A BARE `:` AS OF 3.11 §7.4. The yearly dashboard wrote
  // `year-start: ""` and three lines of comment explained that this was
  // byte-preserved — from 2.59.2's diff against the shipped assets, which
  // 2.59.3 retired in the same breath as introducing it (*"it existed to prove
  // the composition reproduced what shipped, which is a migration question and
  // not a standing one"*).
  //
  // It is the last of the three divergences this file's header recorded. The
  // yearly charts header was a defect and was fixed in 3.9; the monthly note's
  // missing button was age and was fixed in 3.3; this one is neither — it is a
  // quoted empty string where three siblings have no value at all, and
  // `periodUnitOf` tests for the KEY's presence rather than for a value, so
  // both spellings always meant the same thing to every reader of them.
  return ["---", `${prop}:`, "---"];
}

// A dashboard's whole markdown.
//
// Reproduces the shipped assets exactly as of 2.59.2 — the blank line between
// fences, the spacer above the first one, and the absence of a trailing blank
// line after the last. Those are not incidental: `appendSectionMarkdown` and
// the section walk both read the blank lines, and a file that gains one at the
// end reads as a section with nothing in it.
export function composeDiaryDashboard(grain: DashboardGrain): string {
  const ctx = { grain };

  // ONE FENCE PER BAND-AND-FENCE-KIND RUN, not one per section (3.2 patch 3).
  //
  // The masthead's two sections write into a single ```almanac block, because
  // Obsidian renders each fence as its own block and two blocks cannot be made
  // into one card no matter how they are styled — the limit 2.18.4 already hit
  // on an entry, and the whole of §1. The body's sections are independent
  // blocks and stay independent.
  //
  // ONLY THE MASTHEAD MERGES. The first attempt merged any consecutive
  // same-fence sections in one band, which is wrong in a way that is invisible
  // until you read the output: every body section renders into an `almanac`
  // fence too, so the whole page below the card collapsed into a single block —
  // Open Tasks welded to the rollup, and `assetUnits` seeing one unit where the
  // repair path needs three.
  //
  // The band is the reason a fence merges, not the mechanism. `masthead` means
  // "these sections are one card"; `body` means "these are independent blocks",
  // and independent blocks are exactly what they already were.
  //
  // The `fence` agreement is still required on top: `charts` renders into an
  // `almanac-charts` fence, so a rule keyed on the band alone would fuse chart
  // specs into a directive block the day a chart section joined the masthead.
  const ONE_FENCE: ReadonlySet<DiarySection["band"]> = new Set(["masthead"]);
  const blocks: string[] = [];
  let run: { fence: string; band: string; lines: string[] } | null = null;
  const flush = (): void => {
    if (run) blocks.push(["```" + run.fence, ...run.lines, "```"].join("\n"));
    run = null;
  };
  // OPT-IN SECTIONS ARE NOT COMPOSED — 3.9 §2. `sectionsForDashboard` answers
  // "what may this dashboard have", which is the editor's question; this
  // function answers "what does a fresh one come with", which is a different
  // one. See `DiarySection.optIn`.
  //
  // The consequence that matters is downstream: `reconcileLayouts` diffs a live
  // note against this text, so a section absent here is a section repair never
  // adds — and, because `planLayout` only ever deletes a RETIRED_WIDGETS
  // keyword, never removes either once a reader has added it.
  for (const s of sectionsForDashboard(ctx).filter((s) => !isOptIn(s, ctx))) {
    const { fence, lines } = s.render(ctx);
    if (
      run &&
      run.fence === fence &&
      run.band === s.band &&
      ONE_FENCE.has(s.band)
    ) {
      run.lines.push(...lines);
      continue;
    }
    flush();
    run = { fence, band: s.band, lines: [...lines] };
  }
  flush();
  return (
    [...frontmatter(ctx), "`almanac:spacer`"].join("\n") +
    "\n" +
    blocks.join("\n\n") +
    "\n"
  );
}

// ── editing a dashboard that already exists ───────────────────────────
//
// PATCH 1 OF THE 3.0 PLAN, and the half of it this file owes.
//
// 2.60.2 put `links` and `entry-header` in the entry catalogue as locked and
// argued that the lock is on EXISTENCE, NOT POSITION — that someone who wants
// their links below the banner is expressing a preference and taking nothing
// away. The refusal message says so to the reader in those words: "You can move
// it, though." There was no move. `journal-plan.ts` has had one since 2.54;
// neither diary catalogue did, so a reader who followed that message found
// nothing, and three places — the comment, the changelog and the message itself
// — asserted a capability that did not exist.
//
// That is worse than an unbuilt feature. An unbuilt feature is absent; this one
// was promised. So it is the first thing 3.0 builds.
//
// THE SAME OP AS THE JOURNALS', NOT A SECOND ONE. `move` already exists with a
// planner, a preview and an apply that preserves the reader's own lines
// byte-for-byte. A diary reorder that rebuilt the file from the catalogue would
// be a formatter, which is the distinction `layout.ts` keeps a list about — so
// this splices segments verbatim exactly as `applySections` does, and every
// untouched run is re-emitted as the lines it was read as.

// One contiguous run of a dashboard, attributed. `sectionId` is null for a run
// the catalogue did not write — the reader's own prose, a hand-added fence,
// the frontmatter — and those are reported and never moved.
interface DashboardRun {
  // Every section this segment holds, in the order their directives appear.
  //
  // A LIST AS OF 3.2 PATCH 3. It was one id, which was right while one section
  // meant one fence and became the same silent defect `parseEntry` carried one
  // surface over: a merged fence resolved to whichever section's `locate`
  // matched first, and the other vanished from the editor about to rewrite
  // around it. Empty for a run the catalogue did not write.
  sectionIds: string[];
  from: number;
  to: number;
  // Blank separators and the frontmatter block: structure rather than content.
  // Counting them as the reader's own blocks would have every untouched
  // dashboard report "two blocks here aren't the catalogue's" — true, useless
  // and alarming.
  filler: boolean;
}

const isBlank = (lines: string[]): boolean =>
  lines.every((l) => l.trim() === "");

// Which sections own a segment, by running the catalogue's own `locate` probes
// against that segment alone, in the order they appear inside it.
//
// `locate` rather than a keyword signature, because `locate` is what the
// catalogue already declares and what `detectDiarySections` already trusts. A
// second way of finding a section in a file is a second thing to keep in step
// with the first — and the two only have to disagree once for a section to
// become invisible to the editor that is about to rewrite around it.
//
// Restricted to the sections that APPLY to this grain, so a `tasks-table`
// someone hand-added to a yearly dashboard stays foreign and is left alone
// rather than being adopted and then offered for removal.
function ownersOf(lines: string[], ctx: DiaryDashboardContext): string[] {
  const text = lines.join("\n");
  return sectionsForDashboard(ctx)
    .map((s) => ({ id: s.id, at: s.locate(text) }))
    .filter((s) => s.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((s) => s.id);
}

// A dashboard as the sections it contains, in file order.
//
// The inverse of composeDiaryDashboard, and deliberately conservative: a
// section is present iff its own fence is present.
export function parseDiarySections(
  text: string,
  ctx: DiaryDashboardContext
): DashboardRun[] {
  // A SECTION IS ITS FIRST RUN, AND NOTHING AFTER IT — the guard
  // `parseFlatSections` grew in 4.12 §A, arriving here in 4.19 because this is
  // the release that makes it reachable by shipping rather than by hand.
  //
  // `locate` is one anchor per section, so two fences holding the same anchor
  // BOTH come back owning that id. Downstream, `applyDiarySections`' reorder
  // keys `byChunk` on a chunk's first id and a `Map` keeps the last write under
  // a key: the two chunks collapse into one object which is then written into
  // both slots. The first fence's content is replaced by the second's, on Save,
  // with nothing in the plan saying so.
  //
  // WHAT MAKES IT REACHABLE NOW: the banner takes either a `title:` or a
  // `links:` line as its anchor, so on a dashboard that still has its two
  // fences unwelded, both match. Before this release it needed a reader to type
  // a duplicate directive by hand.
  //
  // A SET RATHER THAN A SMARTER `ownersOf`, for the reason the flat note gives:
  // the second fence then owns nothing, which every path downstream already
  // knows how to treat — it becomes a run the catalogue does not manage,
  // re-emitted byte-identically and reported as such. A silent content swap
  // becomes a line in the Changes tab saying a block here was left alone.
  //
  // FILE ORDER DECIDES, because `segs` is in file order and this walks it once.
  const claimed = new Set<string>();
  const segs = segment(text.split("\n"));
  return segs.map((seg, i) => {
    const owners = (seg.kind === "fence" ? ownersOf(seg.lines, ctx) : []).filter(
      (id) => {
        if (claimed.has(id)) return false;
        claimed.add(id);
        return true;
      }
    );
    return {
      sectionIds: owners,
      from: i,
      to: i,
      filler:
        !owners.length &&
        (isBlank(seg.lines) || (i === 0 && seg.lines[0]?.trim() === "---")),
    };
  });
}

// Why this section cannot be removed from THIS dashboard, or null if it can.
//
// TWO REASONS, IN THIS ORDER, and the order is the entry catalogue's for the
// entry catalogue's reason. Locked first, because "this is part of what a
// dashboard is" is true regardless of what the reader has put in it, and
// telling someone to delete their charts before removing a banner that was
// never going anywhere would send them to do pointless work.
//
// The refusal NAMES THE FIX, because one that only says no sends someone
// looking for a setting that does not exist.
// Whether this section has anywhere to go, by the rule `EntrySection.isMovable`
// states: pinned is fixed by decision, and alone among its band's movable
// members is fixed by arithmetic.
//
// PATCH 3 IS WHERE THIS STOPS BEING FREE. Before the masthead existed, every
// dashboard section could trade places with every other, so `summary` carried
// "You can move it, though." and it was true. Fusing it into one card with
// navigation makes it the only unpinned member of a two-section band, so it
// loses its move — not to a new rule, but to the same arithmetic that stranded
// `entry-header`. That is a real cost of §3 and is priced in the roadmap rather
// than discovered in a message that quietly stopped being accurate.
//
// GRAIN-BLIND ON PURPOSE. `applies` narrows the body per grain — a yearly
// dashboard has one body section — but the two masthead sections are on every
// grain, and they are the only ones a refusal ever reaches. The editor asks
// through `viewOf`, which does know the grain.
export function isMovable(
  section: DiarySection,
  ctx?: DiaryDashboardContext
): boolean {
  if (section.pinned) return false;
  const band = (ctx ? sectionsForDashboard(ctx) : DIARY_SECTIONS).filter(
    (s) => s.band === section.band && !s.pinned
  );
  return band.length > 1;
}

// AND THERE IS NO `pinned` BRANCH, WHICH THERE WAS FROM 4.10 UNTIL 4.11.
//
// It read `${label} is the first thing on every dashboard. It can't be removed or
// moved.` and it was written when `links` was the only pinned section — pinned AND
// locked, so the sentence was true of the only row that could reach it. 4.10 added
// a pinned section that is deliberately NOT locked, and the branch then refused to
// remove the page head on every period dashboard: against its own `locked: false`,
// against this catalogue's comment on it, and against the two flat catalogues that
// compose the same head and always allowed it.
//
// The fix is a deletion rather than a condition, because the fall-through is
// already correct: `links` is locked and reaches the locked branch, whose
// `isMovable` arm already says "and cannot be removed"; `title` is not locked and
// reaches the end, which is null. A pin belongs to `isMovable`, which is the
// function about order — and the editor now says "fixed" on the row, which is
// where a reader looking for the reason should find it.
export function diaryRemovalRefusal(
  section: DiarySection,
  text: string
): string | null {
  if (section.locked) {
    return isMovable(section)
      ? "Part of every dashboard, so it can't be removed. You can still move it."
      : "Part of every dashboard, so it can't be removed or moved.";
  }
  const held = section.holds?.(text) ?? 0;
  if (held > 0) {
    return `Holds ${held} chart${held === 1 ? "" : "s"}. Remove ${
      held === 1 ? "it" : "them"
    } first, then remove the section.`;
  }
  return null;
}

// What changing this dashboard's sections to `want` would do.
export function planDiarySections(
  text: string,
  ctx: DiaryDashboardContext,
  requested: readonly SectionWant[]
): SectionOp[] {
  const runs = parseDiarySections(text, ctx);
  const order = runs.flatMap((r) => r.sectionIds);
  const present = new Set(order);
  const byId = new Map(sectionsForDashboard(ctx).map((s) => [s.id, s]));

  // 3.2 §4: a pinned section keeps the index the file gives it, whatever the
  // reader dragged. Normalised HERE rather than checked at each use, so the
  // plan and the write cannot disagree about where it ended up — the same
  // reason `planDiarySections` is the only input to `applyDiarySections`.
  const want = holdPinned(
    order,
    idsOf(requested),
    (id) => byId.get(id)?.pinned === true
  );

  const rewriting = new Set(reconfigured(order, requested));

  const ops: SectionOp[] = [];

  // Removals, keeps and reconfigures, in file order, so the plan reads down the
  // file.
  for (const id of order) {
    const section = byId.get(id);
    if (!section) continue;
    if (want.includes(id)) {
      ops.push({
        kind: rewriting.has(id) ? "reconfigure" : "keep",
        sectionId: section.id,
        label: section.label,
        detail: rewriting.has(id)
          ? describeAnswers(
              section.questions?.(ctx) ?? [],
              optionsFor(requested, id),
              diaryHostLabel(ctx)
            )
          : "unchanged",
      });
      continue;
    }
    const refusal = diaryRemovalRefusal(section, text);
    if (refusal) {
      // ASKED FOR AND REFUSED, AND SAID SO. Silently keeping a section the
      // reader unticked would be the editor lying, which is the thing the
      // whole feature exists not to do.
      ops.push({
        kind: "keep",
        sectionId: section.id,
        label: section.label,
        detail: refusal,
      });
      continue;
    }
    ops.push({
      kind: "remove",
      sectionId: section.id,
      label: section.label,
      detail: `removes ${section.label.toLowerCase()}`,
    });
  }

  const adding: string[] = [];
  for (const id of want) {
    if (present.has(id)) continue;
    const section = byId.get(id);
    if (!section) continue;
    adding.push(id);
    ops.push({
      kind: "add",
      sectionId: id,
      label: section.label,
      detail: `adds ${section.label.toLowerCase()}`,
    });
  }

  // Moves, worked out from what the order will be once the adds and removes
  // have happened — so a move is reported against the final arrangement rather
  // than an intermediate one nobody will ever see.
  //
  // PER BAND AS OF 3.2 PATCH 3, which is `planEntrySections`' partition arriving
  // here. A `want` that interleaves the masthead with the body is not refused
  // with a message because it is not REPRESENTABLE: each band is reordered
  // against the part of `want` that belongs to it, so a list that mixes them
  // resolves to the same two permutations as one that does not. The masthead
  // band holds one pinned section and one stranded by arithmetic, so its
  // permutation is always the identity — but writing the partition generally is
  // the same code, and it is the code that stops a body section climbing above
  // navigation.
  for (const band of ["head", "masthead", "body"] as const) {
    const inBand = (id: string): boolean => byId.get(id)?.band === band;
    const surviving = order.filter((id) => inBand(id) && want.includes(id));
    const target = want.filter(
      (id) => inBand(id) && (surviving.includes(id) || adding.includes(id))
    );
    ops.push(...moveOps(surviving, target, (id) => byId.get(id)?.label));
  }

  // Anything the catalogue did not write, counted rather than named: the
  // reader knows what their own blocks are, and the useful fact is that the
  // plan is not going to touch them.
  const foreign = runs.filter((r) => !r.sectionIds.length && !r.filler).length;
  if (foreign) {
    ops.push({
      kind: "foreign",
      sectionId: null,
      label: "—",
      detail: `${foreign} block${
        foreign === 1 ? "" : "s"
      } in this file aren't the catalogue's; left alone`,
    });
  }

  return ops;
}

// The dashboard with `want`'s sections, or null if nothing would change.
//
// SPLICES SEGMENTS VERBATIM, which is the property that makes this a
// reconciler rather than a formatter. Every untouched run is re-emitted as the
// exact lines it was read as, so a reader's three blank lines, their odd
// indentation and their hand-written blocks all survive byte-for-byte.
// Rebuilding the file by re-joining sections with a standard separator would
// have been shorter and would have quietly reformatted every file it touched.
//
// Calls planDiarySections first and applies only what it named. That is the
// property the whole preview rests on, and it is asserted by test rather than
// assumed.
export function applyDiarySections(
  text: string,
  ctx: DiaryDashboardContext,
  requested: readonly SectionWant[]
): string | null {
  const ops = planDiarySections(text, ctx, requested);
  const byPin = new Map(sectionsForDashboard(ctx).map((s) => [s.id, s]));
  // The same normalisation the plan performed, from the same helper and the
  // same file order. Recomputed rather than returned by `planDiarySections`,
  // which answers in ops and would have to grow a second return value to carry
  // it — and a plan that hands the writer a private extra is a plan the preview
  // no longer fully describes.
  const want = holdPinned(
    parseDiarySections(text, ctx).flatMap((r) => r.sectionIds),
    idsOf(requested),
    (id) => byPin.get(id)?.pinned === true
  );
  const removing = new Set(
    ops
      .filter((o) => o.kind === "remove")
      .map((o) => o.sectionId)
      .filter((id): id is string => id !== null)
  );
  const adding = ops
    .filter((o) => o.kind === "add")
    .map((o) => o.sectionId)
    .filter((id): id is string => id !== null);
  const moving = ops.some((o) => o.kind === "move");
  const rewriting = new Set(
    ops
      .filter((o) => o.kind === "reconfigure")
      .map((o) => o.sectionId)
      .filter((id): id is string => id !== null)
  );
  if (!removing.size && !adding.length && !moving && !rewriting.size) {
    return null;
  }

  const segs = segment(text.split("\n"));
  const runs = parseDiarySections(text, ctx);
  const byId = new Map(sectionsForDashboard(ctx).map((s) => [s.id, s]));

  // A chunk is a run's lines plus every section that run holds. The masthead is
  // the one chunk with two, and it is never removed — both its sections are
  // locked — so the removal branch below still only ever sees a single-section
  // chunk. Written over the list anyway: a chunk that lost one of two sections
  // would need its fence rewritten rather than dropped, and that is a case this
  // release does not create and must not silently mishandle if a later one
  // does.
  interface Chunk {
    ids: string[];
    lines: string[];
  }
  const chunks: Chunk[] = [];
  for (let ri = 0; ri < runs.length; ri++) {
    const run = runs[ri];
    const lines: string[] = [];
    for (let i = run.from; i <= run.to; i++) lines.push(...segs[i].lines);
    const doomed = run.sectionIds.filter((id) => removing.has(id));
    if (!doomed.length || doomed.length !== run.sectionIds.length) {
      // Answers spliced into their own span; everything else in the chunk is
      // the reader's line, unchanged. See `withAnswers`.
      let out = lines;
      for (const id of run.sectionIds) {
        if (!rewriting.has(id)) continue;
        out = withAnswers(
          out,
          byId.get(id)?.questions?.(ctx) ?? [],
          optionsFor(requested, id)
        );
      }
      chunks.push({ ids: run.sectionIds, lines: out });
      continue;
    }
    // Removed. Take the blank separator that followed it too — otherwise every
    // removal leaves a widening gap behind.
    if (runs[ri + 1]?.filler && isBlank(segs[runs[ri + 1].from].lines)) ri++;
  }

  // Insertions, positioned against the catalogue's order: after the last
  // preceding section the file actually has, else before the earliest
  // following one, else at the end. A reader who reordered their dashboard
  // keeps their order and gets the new block somewhere sensible.
  const order = sectionsForDashboard(ctx).map((s) => s.id);
  for (const id of adding) {
    const section = byId.get(id);
    if (!section) continue;
    const at = insertionPoint(chunks, order, id);
    chunks.splice(at, 0, {
      ids: [id],
      lines: [
        "",
        ...renderDiarySection(section, ctx, optionsFor(requested, id)).split("\n"),
      ],
    });
  }

  // Reordering, last, so it is a permutation of the final set rather than of
  // an intermediate one.
  //
  // SECTIONS MOVE AROUND FOREIGN BLOCKS, WHICH KEEP THEIR INDEX. That is the
  // only rule available: a reader's own fence sitting between two sections
  // being swapped has no correct destination, so it stays put and the sections
  // trade the slots they had. Blank separators keep their positions for the
  // same reason — permuting filler would be reformatting a file to no end.
  //
  // PER BAND, matching the plan. A chunk belongs to the band of the sections in
  // it, so the masthead's chunk and the body's chunks permute among their own
  // slots and never trade — which is what keeps a body block from landing above
  // navigation, without a check anywhere saying so.
  if (moving) {
    for (const band of ["head", "masthead", "body"] as const) {
      const slots: number[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const first = chunks[i].ids[0];
        if (first && byId.get(first)?.band === band) slots.push(i);
      }
      const occupants = slots.map((i) => chunks[i].ids[0]);
      const desired = desiredOrder(
        occupants,
        want.filter((id) => byId.get(id)?.band === band)
      );
      const byIdChunk = new Map(slots.map((i) => [chunks[i].ids[0], chunks[i]]));
      slots.forEach((slot, n) => {
        const wanted = byIdChunk.get(desired[n]);
        if (wanted) chunks[slot] = wanted;
      });
    }
  }

  const next = chunks.flatMap((c) => c.lines).join("\n");
  return next === text ? null : next;
}

// Where a new section goes, in chunk space. Anchored to the sections the file
// actually has rather than to an absolute position, so a dashboard someone
// rearranged keeps its arrangement.
//
// ONE PASS, STOPPING AT THE FIRST SECTION THAT OUTRANKS IT — journal-plan's
// rule, and it earns its keep here for the same reason: it makes
// remove-then-re-add restore the file exactly, which is the property worth
// having because it is the one a test can check.
function insertionPoint(
  chunks: { ids: string[] }[],
  order: string[],
  id: string
): number {
  const rank = order.indexOf(id);
  let after = -1;
  for (let i = 0; i < chunks.length; i++) {
    // A chunk ranks by the LAST of its sections: the masthead outranks a new
    // body block by way of `summary`, not of `links`, so an added section lands
    // below the whole card rather than between its two rows.
    const ranks = chunks[i].ids
      .map((k) => order.indexOf(k))
      .filter((r) => r !== -1);
    if (!ranks.length) continue;
    if (Math.max(...ranks) > rank) return after === -1 ? i : after + 1;
    after = i;
  }
  return after === -1 ? chunks.length : after + 1;
}

// ── the shared interface ──────────────────────────────────────────────

// The two bands of a dashboard, named for the reader rather than for the code.
//
// A dashboard reported `group: null` — one band — until 3.2 patch 3 gave it a
// masthead. The editor's reordering rule is unchanged and still has no surface
// test in it ("two rows may swap when their groups match"); what changed is
// that this surface now answers the question with something other than null.
// ── AND TWO OF THE THREE WERE RENAMED IN 4.19 ─────────────────────────
//
// Each of the top two bands now holds exactly ONE section — the banner, and the
// period summary that the navigation row left behind — so the old plural
// readings were wrong in the same way: "the masthead" named a card of two rows
// that is now one, and "the page head" named the half of the banner that existed
// before it had the other half.
//
// AND THEY ARE STILL TWO BANDS, WHICH IS THE POINT. Collapsing them into one
// would let the banner and the overview trade places, and a page whose name sits
// below its date navigator is what `pinned` was added to prevent. Two bands of
// one each is not redundancy; it is the arrangement stated in the only place
// that can enforce it.
const BANDS: Record<DiarySection["band"], string> = {
  head: "The banner",
  masthead: "The overview",
  body: "The page below",
};

const viewFor =
  (ctx: DiaryDashboardContext) =>
  (s: DiarySection): SectionView => ({
    ...viewOf(s),
    ...(s.questions ? { questions: s.questions(ctx) } : {}),
    // Grain-aware, unlike the refusal: a yearly dashboard has one body section,
    // so there is nothing for it to trade places with and its arrows should say
    // so. `isMovable` works that out from `applies` rather than from a table.
    movable: isMovable(s, ctx),
  });

const viewOf = (s: DiarySection): SectionView => ({
  id: s.id,
  label: s.label,
  movable: isMovable(s),
  blurb: s.blurb,
  icon: s.icon,
  removable: !s.locked,
  // TWO BANDS AS OF 3.2 PATCH 3. This said "ONE BAND. A dashboard is a stack of
  // fences with nothing separating a structural half from a personal one" —
  // true until the masthead fused navigation and the period summary into one
  // card, which is exactly such a separation. The editor's rule is unchanged
  // and still has no surface test in it; this surface simply stopped answering
  // null.
  group: BANDS[s.band],
});

// This dashboard, as the editor sees it.
export function diarySectionModel(ctx: DiaryDashboardContext): SectionModel {
  const find = (id: string): DiarySection | undefined =>
    sectionsForDashboard(ctx).find((s) => s.id === id);
  return {
    sections: () => sectionsForDashboard(ctx).map(viewFor(ctx)),
    present: (text) => detectDiarySections(text, ctx),
    addable: (text) => addableDiarySections(ctx, text).map(viewFor(ctx)),
    refusal: (id, text) => {
      const s = find(id);
      return s ? diaryRemovalRefusal(s, text) : null;
    },
    plan: (text, want) => planDiarySections(text, ctx, want),
    apply: (text, want) => applyDiarySections(text, ctx, want),
  };
}
