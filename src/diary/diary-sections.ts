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
  HEADER_KEYWORD,
  cutFromFence,
  dropSoloBar,
  needsSoloBar,
  soloBar,
  isSectionFence,
  isCellLine,
  isRowLine,
  ROW_KEYWORD,
  splitDirective,
} from "../core/directive-grammar";
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
  WIDGET_FORM,
  formQuestion,
} from "../core/section-model";
import type { FlatNoteSpec, FlatSection } from "../core/note-sections";
import {
  BANNER_ID,
  PAGE_TITLE_LINE,
  answersOn,
  flatBlocks,
  locateTitle,
  regroupFlatNote,
  rowRuns,
  graphLinksSection,
} from "../core/note-sections";
import {
  instanceIdOf,
  instanceId,
  instanceSectionFor,
  locateNth,
  nextInstanceId,
  pageWidgetKeywords,
  widgetInstances,
  widgetLine,
  widgetQuestions,
} from "../core/widget-sections";
import { WIDGETS } from "../core/widget-registry";
import type { VaultLists } from "../core/widget-registry";

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
  // What THIS VAULT can answer a widget's argument with — `FlatNoteSpec.vault`'s
  // field, arriving on the surface that grew widgets in 4.58.0.
  //
  // SUPPLIED BY THE CALLER THAT OPENED THE WINDOW, for `hostFolder`'s reason one
  // line up: only that caller knows which vault it is in. `modelForSurface`
  // already held the lists and already threaded them into the four flat
  // surfaces; the dashboard branch is the one that dropped them on the floor,
  // because until this release it had nothing to ask.
  //
  // ABSENT IS A VAULT THAT COULD NOT BE ASKED, not an empty one, and both come
  // out as the same empty list with the same sentence over it — exactly the
  // posture a null `hostFolder` already takes.
  vault?: VaultLists;
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
  // Which composed ROW this section is a cell of, and which CELL of it — 4.70.
  //
  // `FlatSection.row` AND `.cell`, VERBATIM IN MEANING, and the argument for
  // both is made there at length rather than a second time here: an id rather
  // than a flag because a page has more than one row; consecutive members only,
  // because a row is a block and a block is contiguous; and absent `cell` is not
  // a value, so two sections that both leave it out get a cell each.
  //
  // WHY A DASHBOARD DID NOT HAVE THESE UNTIL NOW. The composer's merge rule was
  // keyed on the BAND — "these sections are one card" — and the one band that
  // ever merged, `masthead`, was retired in 4.58.0 leaving `ONE_FENCE` empty. So
  // the four period dashboards could only ever compose a column of stacked
  // blocks, whatever the renderer supported. `rowRuns` is the rule they now
  // share with the other three catalogues.
  //
  // AND THEY ARE NOT FUNCTIONS OF THE CONTEXT, deliberately. A row pairing two
  // sections whose `applies` disagree on some grain composes with one member
  // there, and `rowRuns` drops the `row` line from a run of one — so a catalogue
  // says which sections belong together and never has to restate which grains
  // that happens to be true on.
  row?: string;
  cell?: string;
  // `RowMember.bar`: the title this cell puts on when its row has come down to
  // it alone. Declared by the cells that compose none — the ones the paragraph
  // above `BODY_ROW` says carry the band's bar for them — because the section
  // that carries it is freely removable. See `soloBar`.
  bar?: string;
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
  // ── AND THERE ARE TWO OF THEM AS OF 4.58.0 ─────────────────────────
  //
  // THERE WERE THREE, AND THE THIRD WAS A RESTRICTION NOBODY ARGUED FOR.
  // `masthead` was added in 3.2 patch 3 to hold navigation and the period
  // summary as one card; 4.19 moved navigation into the banner and left the
  // summary alone in a band. A band of one movable section is a section that
  // cannot move — that is all `isMovable` does — so the overview was immobile as
  // a side effect of a card that no longer existed. It is `body` now, and the
  // band is gone rather than emptied, because an empty band is a rule waiting to
  // be re-broken.
  //
  // `head` is the page's own name and the places it can go. It stays its own
  // band, and the reason is not taste:
  //
  //   BANDS ARE CONTIGUOUS. A `body` section composed above the banner would
  //   split the body in two, and the partition below — which reorders each band
  //   against its own part of `want` — assumes each band is one run. So a band
  //   is what makes "the page's name is the top of the page" unreachable, rather
  //   than a check somewhere that says no.
  //
  // So the head is its own fence, its own group in the editor, and alone in its
  // band: immovable by the arithmetic `isMovable` already does, on top of the
  // `pinned` flag that says the same thing by declaration.
  band: "head" | "body";
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
  // Whether a dashboard may hold more than one of these. `FlatSection.repeatable`
  // exactly, and for the same reader: the ADD LIST reads it to know that a
  // section already present is still worth offering.
  //
  // ABSENT MEANS ONE, which every section in this catalogue means. Only the
  // widget instances `widgetDiarySections` adapts in ever set it — a catalogue
  // section is located by one anchor and owns one run, and a second copy of Open
  // Tasks would be two ids fighting over one fence.
  repeatable?: boolean;
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

// What the period summary's own bar is called, per grain.
//
// THE SAME FOUR STRINGS `SECTION_TITLES` HOLDS, and written out here rather than
// imported from there for the reason every catalogue in this plugin writes its
// `header:` text literally: that table lives in `ui/widgets/index.ts`, which
// imports half the plugin, and a catalogue is data. `tags` writes "🏷️ Tags"
// beside a `SECTION_TITLES["tag-index"]` that says the same thing, and the two
// answer different questions — this is the title a fence CARRIES, that is the
// one a fence with no bar is given.
const SUMMARY_TITLES: Record<string, string> = {
  week: "📅 This week",
  month: "📅 This month",
  quarter: "📅 This quarter",
  year: "📅 This year",
};

const summaryBar = (ctx: DiaryDashboardContext): string =>
  `${HEADER_PREFIX}${SUMMARY_TITLES[noun(ctx)] ?? "📅 This period"}`;

// ── THE BODY ROW, 4.70 ───────────────────────────────────────────────────
//
// A period dashboard shipped as four blocks stacked down a page — the summary,
// the rollup, the tasks table and the charts — and could not have shipped as
// anything else: the composer merged by BAND, the only band that ever merged
// was retired in 4.58.0, and `DiarySection` had no way to say "these two are
// one block" until this release gave it `row`.
//
// THE ROLLUP AND THE TASKS TABLE ARE THE PAIR, and they are the right one
// because they are the same question asked twice. "What the days said" is what
// the entries of this period wrote; "Open tasks" is what those same entries
// left undone. Both read the period's own children, both are lists, and neither
// is a card — so neither loses chrome by taking a column.
//
// WHICH IS WHY THE BAR SAYS "INSIDE THIS WEEK" AND NOT "WHAT THE DAYS SAID". A
// `header:` in a row fence is drawn once, full width, above both columns
// (`row.ts`), so it titles the BAND; the old wording would have been a sentence
// about the left column printed over the right one as well.
//
// TWO CELLS AT `--ca-row-cell-min` PLUS THE GAP IS 660px, AND A PERIOD
// DASHBOARD IS NOT `wide`. That is deliberate and it fits: `MAX_COLUMNS` is two
// precisely because two is the count that survives a default note column, and
// the wrap below it is the phone collapse rather than a layout coming apart. No
// `wide` line is composed here — it would change the whole page's width for a
// new vault and leave every existing dashboard narrower than its sibling, which
// is a divergence additive reconciliation cannot close.
const BODY_ROW = "body-row";

const ROLLUP_TITLES: Record<string, string> = {
  week: "📖 Inside this week",
  month: "📖 Inside this month",
  quarter: "📖 Inside this quarter",
  year: "📖 Inside this year",
};

const rollupBar = (ctx: DiaryDashboardContext): string =>
  `${HEADER_PREFIX}${ROLLUP_TITLES[noun(ctx)] ?? "📖 Inside this period"}`;

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
      fence: "chronoanvil",
      lines: [
        PAGE_TITLE_LINE,
      ],
    }),
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
    // 📅 SINCE 4.59.0, BECAUSE THE SECTION NOW HAS A BAR TO AGREE WITH. The row's
    // token is its bar's own emoji wherever a section renders one — the rule
    // `diary-move.test.ts` pins across this whole catalogue — and the four bars
    // are "📅 This week/month/quarter/year", the strings `SECTION_TITLES` has
    // carried for these directives since they were nameable. 🗓 was a token for a
    // row that titled nothing, and there was nothing for it to disagree with.
    icon: "📅",
    // LOCKED, and the one that most obviously has to be: without it the
    // dashboard has no date navigation and no way to say which period it is
    // scoped to. It stops being a dashboard rather than losing a feature —
    // `entry-header`'s argument exactly.
    locked: true,
    // ── THE BODY, NOT A BAND OF ITS OWN (4.58.0) ─────────────────────
    //
    // It was `masthead` from 3.2 patch 3 until this release, and that band held
    // exactly one movable section: this one. `isMovable` is arithmetic over a
    // band — alone among your band's movable members means nowhere to go — so
    // the band was the whole of why the overview could not be moved. The lock
    // on REMOVAL is unchanged and argued three lines up; what went is a
    // restriction on ORDER that no comment in this file ever claimed to want,
    // and that the refusal string had to apologise for.
    //
    // THE RULE IT LEAVES BEHIND IS THE ONE WORTH KEEPING: the banner is `head`,
    // alone, pinned, and every other section on the page is `body`. A page whose
    // name sits in the middle of it is still unreachable, because that is what
    // `head` and `pinned` were for; a reader who wants their charts above the
    // period summary is expressing a preference about their own note, which is
    // the sentence `DiarySection.locked` has used about position since 2.60.2.
    //
    // AND THE COMPOSED NOTE IS BYTE-IDENTICAL, which is what made this a band
    // change rather than a release. `composeDiaryDashboard` welded a band's
    // sections into one fence only for `masthead`, and a band of one has nothing
    // to weld — so this section was already its own block and still is. The
    // weld went with the band; see `composeDiaryDashboard`.
    band: "body",
    applies: always,
    // ── A SECTION, SO IT WEARS A SECTION'S BAR (4.59.0) ──────────────
    //
    // IT HAD NONE, AND NOTHING HAD DECIDED THAT. Every other section on a
    // dashboard is a `header:` line welded to its directive — Open tasks, What
    // the days said, Tags, Trends — and this one was the directive alone, so the
    // one section a dashboard cannot remove was also the one a reader could not
    // fold. The card is what made it look deliberate: a period summary already
    // draws chrome, so the missing bar read as a design rather than an omission.
    //
    // THE BAR GOES INSIDE THE CARD, which is the part that needed CSS rather
    // than a line. `.ca-journal-overview-card` is a real card — background, border,
    // inset — and a bar dropped into it would be a second border arguing with
    // the first. It becomes the card's TOP BAND instead, bleeding the padding
    // and carrying the rule beneath it, which is the manoeuvre
    // `.ca-journal-slim-banner .ca-journal-banner-name` makes one card over and the
    // reason that rule's comment says every band in this plugin makes it.
    //
    // THE QUESTION BELOW IS WHAT KEEPS THE OTHER FORM AVAILABLE. See it.
    render: (ctx, opts) => ({
      fence: "chronoanvil",
      lines: [
        // THE ANSWER READ HERE IS THE ADD PATH'S ONLY. A section already in the
        // file is re-formed by `withAnswers`, which writes the bar line in or
        // out of the fence the reader has; this is what a section composed
        // FRESH is written as, and unanswered means the bar — which is what
        // every dashboard shipped before this release holds.
        ...(opts?.form === WIDGET_FORM ? [] : [summaryBar(ctx)]),
        `${noun(ctx)}-summary`,
        // All four now. Monthly was the exception until 3.3 — not by argument
        // but by age: `new-monthly` was written when the monthly note was a
        // "review" and the only way to make one was to be asked which month.
        // The other three grew scoped buttons in 2.57 and monthly was never
        // brought along.
        `button:new-${noun(ctx)}`,
      ],
    }),
    // ── AND THE WIDGET FORM, FOR A READER WHO WANTS IT IN A ROW ──────
    //
    // A SECTION CANNOT BE A COLUMN OF A GROUP, and that is a fact about the
    // renderer rather than a policy: `isSectionFence` refuses a fence that
    // titles itself, because `layOutRow` inserts the group at the first cell
    // child and a bar is not cell content — so the bar would render below the
    // group it was meant to title and `HeaderBar`'s walk would fold all of it.
    // Giving this section a bar therefore takes something away, and the toggle
    // is how it is given back.
    //
    // ONE ROW IN THE PICKER, NOT TWO. The alternative was a `week-summary`
    // widget offered beside the section — but the section is locked, so a
    // dashboard would then hold two summaries, and on a page where it were not
    // the two rows would draw the same directive and differ by a line the reader
    // cannot see. One directive, one row, two forms is the honest shape, and it
    // is why `FormQuestion` is a question rather than a second catalogue entry.
    questions: (ctx) => [formQuestion(summaryBar(ctx), HEADER_KEYWORD)],
    // STILL MATCHES ANY GRAIN'S SUMMARY, deliberately, and the bar changes
    // nothing about that: a reader who retitled the bar, or turned the section
    // into a widget, or changed which period this note is about, still has a
    // dashboard whose summary the editor can find.
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
    //
    // ── COMPOSED AS OF 4.70, AND §2's ARGUMENT IS WHAT ALLOWS IT ─────────
    //
    // Read the paragraph above again: every sentence of it is about the RECAP
    // BEING IN THE BANNER. Unbounded content pushing the stats band off screen,
    // a reader who cannot say they want the numbers without the wall of text, a
    // banner that is a document. None of that is true of a section — it is
    // foldable, it is below the summary rather than inside it, and it can be
    // removed with one untick. The flag was a transition, and the transition is
    // three releases old.
    //
    // WHAT IT COST BY STAYING: a quarterly dashboard shipped with TWO blocks on
    // it and a yearly with ONE, which are the thinnest pages in the vault and
    // are the pages whose whole purpose is to look back over a long stretch.
    // `period-recap` is the widget that does that and it appeared on no page a
    // repaired vault composes.
    //
    // AND `renderRecapMoved` STAYS. It fires when a banner still holds recap
    // content the section is not showing, which is a state this flip does not
    // change — an existing dashboard gains the section by reconciliation and
    // keeps whatever its banner had.
    render: (ctx, opts) => ({
      fence: "chronoanvil",
      lines: [
        ...(opts?.form === WIDGET_FORM ? [] : ["header:📝 Recap"]),
        `period-recap:${noun(ctx)}`,
      ],
    }),
    questions: () => [formQuestion("header:📝 Recap")],
    locate: (text) => probe(text, /^period-recap\b/m),
  },
  {
    // THE REGISTRY'S OWN QUESTION, ASKED FROM HERE. `time-grid`'s three sources
    // are declared once, in `widget-registry.ts`, and this composes the same
    // directive — so it asks through `widgetQuestions` rather than re-typing the
    // list. See that function for why it is exported.
    questions: () => [
      formQuestion("header:⏱️ The week by the hour"),
      ...widgetQuestions("time-grid"),
    ],
    id: "time-grid",
    label: "Time grid",
    // THE REGISTRY'S SENTENCE TOO, because this is the same widget offered
    // through a second door and a reader meeting it on a dashboard should read
    // what a reader meeting it on a year page reads.
    blurb: WIDGETS["time-grid"].blurb,
    icon: WIDGETS["time-grid"].glyph,
    // Nothing of the reader's lives here: the meetings, the log items and the
    // tasks are in their own notes, and removing the grid removes a view of them.
    locked: false,
    band: "body",
    // ── WEEKLY ALONE, AND IT IS THE DIRECTIVE THAT DECIDES ───────────────
    //
    // `time-grid` draws THE HOST NOTE'S WEEK: `weekStartOf` reads `week-start`
    // from the note's frontmatter and falls back to the current week when there
    // is none. A weekly dashboard declares `week-start`, so the grid is scoped to
    // the period the page is about and `period-nav:week` re-scopes both together
    // — which is the whole argument for it being a section of that page.
    //
    // THE OTHER THREE GRAINS DECLARE `month-start`, `quarter-start` AND
    // `year-start`. None of those is a week, so on a monthly dashboard scoped to
    // March the grid would draw whatever week today is in — a block about now on
    // a page about then. A section of a period dashboard is about that period;
    // this one could not be.
    //
    // AND IT IS STILL ADDABLE THERE, AS A WIDGET, which is the point of the two
    // doors. `pageWidgetKeywords` withholds a keyword the grain's catalogue
    // writes, so weekly offers the section and the other three offer the card —
    // exactly the split `tasks-table` has had since 2.58.6, where a year is the
    // grain with no Open Tasks section and a reader who wants one anyway may add
    // it. What a reader loses on a month page is the claim that the grid is part
    // of what a month dashboard IS, which is a claim that would not be true.
    applies: (ctx) => ctx.grain === "weekly",
    // OFFERED, NEVER SHIPPED. 3.9 §2. Every weekly dashboard in every vault
    // predates this section, and a release that silently grew a seven-column
    // grid on all of them would be deciding something for people who did not ask.
    //
    // ── SHIPPED AS OF 4.70, ON THIS GRAIN AND THE HOMEPAGE ──────────────
    //
    // THE PARAGRAPH ABOVE IS AN ARGUMENT ABOUT A RELEASE AND NOT ABOUT A PAGE,
    // and it has been true of every release since — which is how a widget built
    // in 4.55, extended in 4.58 and given a day count in 4.62 came to appear on
    // no page a repaired vault composes. "Nobody asked for it" is indistinguish-
    // able from "nobody has seen it" when the only way to see it is to type its
    // keyword.
    //
    // AND THE THING IT WAS CAUTIOUS ABOUT IS WHAT RECONCILIATION IS FOR. A
    // section that stops being `optIn` is ADDED to an existing note, at the
    // composed position, with nothing reordered and nothing removed — so the
    // cost to a reader who did not ask is one foldable block they can untick,
    // which is the same cost every other section on the page already carries.
    // The changelog names this flip because it is what an existing vault sees.
    //
    // FULL WIDTH, ABOVE THE BODY ROW, AND NOT IN IT. Seven columns of hours do
    // not take a 320px cell — 4.62's day count exists so a narrow column CAN
    // ask for three days, and a weekly dashboard is the one page in the vault
    // whose subject is the whole week. Narrowing it here would be answering a
    // question the page does not have.
    render: (_ctx, opts) => ({
      fence: "chronoanvil",
      lines: [
        ...(opts?.form === WIDGET_FORM
          ? []
          : ["header:⏱️ The week by the hour"]),
        widgetLine("time-grid", opts),
      ],
    }),
    // MATCHES THE KEYWORD, NOT THE ARGUMENT — the rule every catalogue follows,
    // so a reader who narrows the grid to `time-grid:events` still has a section
    // the editor can find rather than a second one it offers to add.
    locate: (text) => probe(text, /^time-grid\b/m),
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
    //
    // ── THE QUARTER GETS IT TOO, AS OF 4.70 ─────────────────────────────
    //
    // The overlap above is real and the conclusion drawn from it was wrong by
    // one step. "Close enough to be a fair complaint" is an argument for the
    // two not being REDUNDANT, and the flag answered a different question — it
    // decided the quarter should have neither by default, because `recap` was
    // `optIn` as well. A quarterly dashboard therefore shipped as a summary, a
    // task table and a charts fence: three blocks, none of them about what was
    // written during the quarter.
    //
    // BOTH FLIP TOGETHER OR NEITHER SHOULD, which is the coupling that was
    // missing. The recap is the aggregate and the rollup is the list; a page
    // about three months is entitled to both, and a reader who finds them
    // repetitive removes one — which is the choice the flag was trying to
    // give and gave by withholding both.
    render: (ctx, opts) =>
      ctx.grain === "quarterly"
        ? {
            fence: "chronoanvil",
            lines: [
              ...(opts?.form === WIDGET_FORM ? [] : [rollupBar(ctx)]),
              // `:month`, singular, matching `month-start` and
              // `tasks-table:…,month` rather than the index's `monthly`.
              "entry-rollup:month",
            ],
          }
        : {
            fence: "chronoanvil",
            lines: [
              ...(opts?.form === WIDGET_FORM ? [] : [rollupBar(ctx)]),
              "entry-rollup",
            ],
          },
    // OPENS THE BODY ROW, AND SO CARRIES ITS BAR — see the note on `BODY_ROW`
    // above the catalogue for why the wording is the band's rather than this
    // section's.
    row: BODY_ROW,
    questions: (ctx) => [formQuestion(rollupBar(ctx), HEADER_KEYWORD)],
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
    blurb: "Still-open ChronoAnvil tasks from entries inside this period.",
    icon: "⏳",
    // The tasks live in the entries this aggregates, not here. Removing the
    // table removes a view of them and touches not one task.
    locked: false,
    // Not on a year: a year of open tasks grouped by source note is a
    // page-long list nobody reads (2.58.6).
    band: "body",
    applies: (ctx) => ctx.grain !== "yearly",
    // SECOND CELL OF THE BODY ROW (4.70), SO IT COMPOSES NO BAR. The rollup
    // beside it carries the one this fence gets — "Inside this week" is true of
    // the still-open tasks as well, which is the whole reason these two are the
    // pair. A toggle here would offer a second full-width strip over the same
    // band.
    //
    // AND ON A YEAR IT IS NOT THERE AT ALL, which costs nothing: `rowRuns` drops
    // the `row` line from a run of one, so a grain where only the rollup applies
    // composes exactly the block it composed before rows existed.
    row: BODY_ROW,
    // AND ITS OWN TITLE BACK IF THE ROLLUP IS NOT THERE, which is the case the
    // paragraph above did not have: `entry-rollup` is `locked: false`, so the
    // cell that titles this band can be unticked and leave the table headless.
    // `soloBar` fills exactly that gap — on a year, where the rollup does not
    // APPLY, it does the same for the same reason.
    bar: "header:⏳ Open tasks",
    render: () => ({ fence: "chronoanvil", lines: ["tasks-table:,period"] }),
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
      fence: "chronoanvil-charts",
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
    locate: (text) => probe(text, /^```chronoanvil-charts/m),
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
      fence: "chronoanvil",
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
//
// WIDGETS INCLUDED AS OF 4.58.0, AND WITHOUT A SPECIAL CASE. An instance's
// `locate` is the nth occurrence in the whole text, which is what this function
// hands it — so the instances a note holds come back at their own offsets and
// the spare behind each returns -1, which is already spelled "not present".
export function detectDiarySections(
  text: string,
  ctx: DiaryDashboardContext
): string[] {
  return sectionsForDashboard(ctx, text)
    .map((s) => ({ id: s.id, at: s.locate(text) }))
    .filter((s) => s.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((s) => s.id);
}

// What could still be added here: applies to this grain, and is not already in
// the note. The diary half of `addableSections`, and the call 3.0's editor
// makes.
//
// AND A WIDGET NEVER LEAVES THE PICKER, which falls out of the rule rather than
// being an exception to it. `widgetInstances` offers every instance the text
// holds plus the one that would come next; the held ones are present and the
// spare is not, so exactly one row per keyword survives this filter however many
// cards the page already has. A catalogue section behaves the other way and
// should — it is withheld once the page has it, because a second copy would be
// two ids claiming one fence.
export function addableDiarySections(
  ctx: DiaryDashboardContext,
  text: string
): DiarySection[] {
  const present = new Set(detectDiarySections(text, ctx));
  return sectionsForDashboard(ctx, text).filter((s) => !present.has(s.id));
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

// ── the widget door, on the surface that did not have one (4.58.0) ────
//
// WHAT WAS WRONG. `flatNoteModel` appends every page widget this vault's
// registry offers to whatever catalogue it was handed, and it is the ONLY place
// in the tree that does — so the homepage, Search, both folder notes and both
// vault dashboards list a SECTIONS group and a WIDGETS group, and a period
// dashboard listed six rows and offered one. Nothing decided that. The four
// grains got their own model in 3.0 because a dashboard's fences are not a flat
// note's, and the widget tail arrived in 4.12 on the other side of that seam.
//
// A READER CANNOT SEE THE SEAM, WHICH IS WHY IT HAD TO GO. The two windows are
// one window, opened from the same cog, over notes that sit two clicks apart. A
// picker that offers thirty cards on the Home note and one on the Weekly note is
// describing the plugin's file layout to somebody who has never seen it.
//
// ── AND IT IS THE SAME DOOR, NOT A SECOND ONE ─────────────────────────
//
// Everything below adapts rather than reimplements: `pageWidgetKeywords` decides
// which keywords are free, `widgetInstances` builds the sections, and the two
// functions here only change their shape. A dashboard section renders from a
// GRAIN and a flat one does not, which is the whole of the difference and the
// whole of what these two conversions carry.
//
// THE COMPOSER NEVER SEES THEM. `composeDiaryDashboard` calls
// `sectionsForDashboard` with no text, which is the arity that answers with the
// catalogue alone — so a fresh dashboard is composed exactly as it was, and
// `reconcileLayouts`, which diffs a live note against that text, has no unit for
// a widget and will neither insert one nor take one back out. That is the same
// guarantee `flatNoteModel` gives by adding its tail in the model rather than in
// the catalogue, made the same way.

// A dashboard section as the flat machinery needs to see it: no grain.
//
// NOT "FOR THE PROBE ONLY" ANY MORE, AND THAT COMMENT WAS THE BUG (4.70.1).
// It read: *"`pageWidgetKeywords` asks two questions of a catalogue … Nothing
// downstream of it reads this shape."* True when it was written in 4.58.0, and
// false as of the line below it in this file: `diarySectionModel` hands the same
// conversion to `flatBlocks` and `regroupFlatNote`, which is how a period
// dashboard's blocks and its regroup are computed at all. So the shape is read
// by the section editor, and anything it drops the editor cannot see.
//
// IT DROPPED `opts`, WHICH IS THE ONE THING `hasKnownExtent` ASKS TWICE. That
// predicate decides whether a section can be cut out of a shared fence, and it
// asks by rendering BOTH forms: a section is loose if EITHER the section form or
// the widget form is a single line. `render: () => s.render(ctx)` threw the
// argument away, so both probes came back with the section form — and every
// section that composes a `header:` bar answered "two lines" to a question whose
// whole point is that the bar is the BAND's line and not the section's.
//
// Nothing showed it until 4.70, because until 4.70 no dashboard section shared a
// fence with another, so `loose` was never consulted: a section alone in its
// block is loose whatever its extent. The first release to compose rows here is
// the first release where the answer mattered, and *What the entries said* — the
// section that opens the body row and therefore carries its bar — came back
// refused, with *Take out of the group* and *Start a page here* both disabled.
const asFlat = (s: DiarySection, ctx: DiaryDashboardContext): FlatSection => ({
  id: s.id,
  label: s.label,
  blurb: s.blurb,
  icon: s.icon,
  locked: s.locked,
  render: (opts) => s.render(ctx, opts),
  locate: s.locate,
});

// A widget instance as a dashboard section.
//
// `body`, ALWAYS, and that is the only placement decision here. A widget is
// content the reader added, and the one band that is not content is the banner —
// which is `head` for exactly that reason. So a card lands on the page below,
// where it can be dragged among the sections it was added beside.
//
// NEVER LOCKED, NEVER PINNED, ALWAYS OPT-IN. `widgetSection` states the first
// two — *"it is there because a reader added it, so it is theirs to move and
// theirs to remove"* — and the third is what keeps it out of `composeDiaryDashboard`
// even on the paths that DO pass a text.
//
// `applies` IS `always`, WHICH IS NOT A SHRUG. A widget's own registry decides
// where it makes sense, and it has already decided: `pageWidgetKeywords` withheld
// every keyword this grain's catalogue writes or claims, and `NOT_PAGE_WIDGETS`
// withheld everything that is not a page widget at all. A grain test on top of
// those would be this file inventing an opinion about a registry it does not own.
const asDiary = (s: FlatSection): DiarySection => ({
  id: s.id,
  label: s.label,
  blurb: s.blurb,
  icon: s.icon,
  locked: false,
  band: "body",
  optIn: true,
  ...(s.repeatable ? { repeatable: true as const } : {}),
  applies: always,
  render: (_ctx, opts) => s.render(opts),
  ...(s.questions
    ? {
        // THE TWO FIELDS A WIDGET'S QUESTION ACTUALLY READS, and the other three
        // are shaped rather than meant. `FlatNoteSpec` is the type
        // `FlatSection.questions` takes; `argQuestions` reads `hostFolder` and
        // `vault` from it and nothing else, so the catalogue, the noun and the
        // held unit are filled with what a dashboard would say if asked. Passing
        // a partial cast instead would be the same lie with less of it visible.
        questions: (ctx: DiaryDashboardContext) =>
          s.questions!({
            sections: [],
            hostFolder: ctx.hostFolder,
            vault: ctx.vault,
            noun: "dashboard",
            heldUnit: "chart",
          } satisfies FlatNoteSpec),
      }
    : {}),
  locate: s.locate,
});

// Which page widgets this grain's catalogue leaves free, probed once per grain.
//
// CACHED, WHERE `flatNoteModel` REFUSED TO CACHE, and the difference is what the
// key can be. That function is handed an ARRAY which `homeSections(diaryRoot)`
// deliberately rebuilds on every call, so a cache would have had to key on an
// identity that is new each time. This one is keyed on the grain, of which there
// are four, and the input is `DIARY_SECTIONS` — a module constant. The answer
// cannot go stale between two calls with the same key unless the catalogue is
// edited, which is a source change.
//
// AND `diaryRoot` IS NOT PART OF THE KEY, deliberately. It changes what the Tags
// section renders INSIDE its directive; it cannot change which KEYWORDS the
// catalogue writes, which is the only thing the probe reads.
const KEYWORDS = new Map<DashboardGrain, string[]>();
const widgetKeywords = (ctx: DiaryDashboardContext): string[] => {
  const hit = KEYWORDS.get(ctx.grain);
  if (hit) return hit;
  const out = pageWidgetKeywords(
    DIARY_SECTIONS.filter((s) => s.applies(ctx)).map((s) => asFlat(s, ctx))
  );
  KEYWORDS.set(ctx.grain, out);
  return out;
};

// Every widget instance this text holds, plus the one that would come next.
export function widgetDiarySections(
  ctx: DiaryDashboardContext,
  text: string
): DiarySection[] {
  return widgetInstances(widgetKeywords(ctx), text).map(asDiary);
}

// The section for a widget instance id, built from the id alone.
//
// SO THAT AN ID NEED NOT HAVE BEEN LISTED, which is `flatNoteModel`'s reason
// stated once more: the lists above offer what a text holds plus one spare, and
// a reader staging three new cards in one session reaches past that. The id says
// what it is, so the lookup can be exact rather than deeper.
export function diaryWidgetSectionFor(id: string): DiarySection | null {
  const flat = instanceSectionFor(id);
  return flat ? asDiary(flat) : null;
}

// What this dashboard offers.
//
// WITH A TEXT: the catalogue for this grain, plus every widget instance the note
// holds and the spare behind each. WITHOUT ONE: the catalogue, which is what
// this function has always answered and what `composeDiaryDashboard` needs.
//
// NO TEXT MEANS NO WIDGETS, WHERE IT COULD HAVE MEANT THE UNREPEATABLE ONES.
// `flatNoteModel` argues this and the argument is the same here: a widget
// section is an OCCURRENCE, and an occurrence is a fact about a note, so with
// nothing to count there is nothing honest to list.
export function sectionsForDashboard(
  ctx: DiaryDashboardContext,
  text?: string
): DiarySection[] {
  const catalogue = DIARY_SECTIONS.filter((s) => s.applies(ctx));
  return text === undefined
    ? catalogue
    : [...catalogue, ...widgetDiarySections(ctx, text)];
}

// The list above, plus a section for every instance id the caller is asking
// about. `note-sections.ts::specWithWanted`, one surface over and for its
// reason: `planDiarySections` and `applyDiarySections` look each wanted id up
// and silently skip one they cannot find, and the text's instances plus one
// spare do not cover the second and third card a reader stages in one session.
const sectionsWanting = (
  ctx: DiaryDashboardContext,
  text: string,
  want: readonly SectionWant[]
): DiarySection[] => {
  const sections = sectionsForDashboard(ctx, text);
  const have = new Set(sections.map((s) => s.id));
  return [
    ...sections,
    ...idsOf(want)
      .filter((id) => !have.has(id))
      .flatMap((id) => diaryWidgetSectionFor(id) ?? []),
  ];
};

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
  // The masthead's two sections write into a single ```chronoanvil block, because
  // Obsidian renders each fence as its own block and two blocks cannot be made
  // into one card no matter how they are styled — the limit 2.18.4 already hit
  // on an entry, and the whole of §1. The body's sections are independent
  // blocks and stay independent.
  //
  // ONLY THE MASTHEAD MERGES. The first attempt merged any consecutive
  // same-fence sections in one band, which is wrong in a way that is invisible
  // until you read the output: every body section renders into a `chronoanvil`
  // fence too, so the whole page below the card collapsed into a single block —
  // Open Tasks welded to the rollup, and `assetUnits` seeing one unit where the
  // repair path needs three.
  //
  // The band is the reason a fence merges, not the mechanism. `masthead` means
  // "these sections are one card"; `body` means "these are independent blocks",
  // and independent blocks are exactly what they already were.
  //
  // The `fence` agreement is still required on top: `charts` renders into an
  // `chronoanvil-charts` fence, so a rule keyed on the band alone would fuse chart
  // specs into a directive block the day a chart section joined the masthead.
  //
  // ── AND IT IS EMPTY AS OF 4.58.0, WHICH IS NOT THE SAME AS GONE ──────
  //
  // `masthead` was its only member and `masthead` no longer exists: the period
  // summary is a `body` section, so the composed dashboard is one fence per
  // section from top to bottom. It was ALREADY that — a band of one has nothing
  // to weld — which is why moving the summary changed no byte of any composed
  // note, and `diary-assets.test.ts` pins that rather than trusting it.
  //
  // The set stays because the band is still the only thing that could make two
  // sections one card, and the next release that wants one should re-open this
  // line rather than rediscover the argument above it.
  //
  // ── AND IT IS GONE AS OF 4.70, REPLACED BY A ROW ID ──────────────────
  //
  // The line above invited "the next release that wants one should re-open this
  // line rather than rediscover the argument above it". This is that release,
  // and the answer it arrives at is that the band was never the right unit: a
  // band is a REGION OF THE PAGE, and "these two sections are one block" is a
  // fact about two sections. `DiarySection.row` says it directly, in the words
  // three other catalogues already use, and `rowRuns` is the one implementation
  // of what it means.
  //
  // WHAT THE BAND STILL DOES IS UNCHANGED: it decides which sections may be
  // reordered against which, and it keeps the head above the body. It simply no
  // longer decides what shares a fence.
  const blocks: string[] = [];
  // OPT-IN SECTIONS ARE NOT COMPOSED — 3.9 §2. `sectionsForDashboard` answers
  // "what may this dashboard have", which is the editor's question; this
  // function answers "what does a fresh one come with", which is a different
  // one. See `DiarySection.optIn`.
  //
  // The consequence that matters is downstream: `reconcileLayouts` diffs a live
  // note against this text, so a section absent here is a section repair never
  // adds — and, because `planLayout` only ever deletes a RETIRED_WIDGETS
  // keyword, never removes either once a reader has added it.
  for (const run of rowRuns(
    sectionsForDashboard(ctx).filter((s) => !isOptIn(s, ctx)),
    (s) => s.render(ctx)
  )) {
    blocks.push(["```" + run.fence, ...run.lines, "```"].join("\n"));
  }
  return (
    [...frontmatter(ctx), "`chronoanvil:spacer`"].join("\n") +
    "\n" +
    blocks.join("\n\n") +
    // The parent, and only the parent — see `graphLinksSection`. A period
    // dashboard is inside the diary; the diary is what names the homepage.
    graphLinksSection(["02 - Diary"])
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
//
// ── AND A WIDGET IS COUNTED ACROSS SEGMENTS, NOT INSIDE ONE (4.58.0) ──
//
// A widget instance's `locate` is `locateNth(keyword, n)` — the nth line in the
// TEXT IT IS SHOWN. This function shows it one fence, so asking `w:events#2` to
// find itself in the fence that holds the second Events card would fail (there
// is one occurrence in there, not two) and `w:events#1` would match it instead.
// Every card after the first would answer to the wrong id, and the reorder keys
// its chunks on ids.
//
// So the repeating keywords are counted with a walking tally rather than probed:
// `seen` carries how many of each keyword the fences ABOVE this one held, and
// each occurrence in this one takes the next number. `parseFlatSections` has
// done exactly this since 4.15 and this is that function's loop, transposed.
//
// EVERY OCCURRENCE IN THIS FENCE, not just the first: a reader may group two
// cards into one block, and each is its own section with its own line.
function ownersOf(
  lines: string[],
  sections: readonly DiarySection[],
  seen: Map<string, number>
): string[] {
  const text = lines.join("\n");
  const found: { id: string; at: number }[] = [];
  const repeating = new Set<string>();
  for (const s of sections) {
    const inst = instanceIdOf(s.id);
    if (inst) {
      repeating.add(inst.keyword);
      continue;
    }
    const at = s.locate(text);
    if (at >= 0) found.push({ id: s.id, at });
  }
  for (const keyword of repeating) {
    let n = seen.get(keyword) ?? 0;
    for (let k = 1; ; k++) {
      const at = locateNth(keyword, k)(text);
      if (at < 0) break;
      found.push({ id: instanceId(keyword, ++n), at });
    }
    seen.set(keyword, n);
  }
  return found.sort((a, b) => a.at - b.at).map((f) => f.id);
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
  // Hoisted, so the probe that produced the keyword list runs once for the whole
  // file rather than once per fence.
  const sections = sectionsForDashboard(ctx, text);
  // How many of each repeating keyword the fences above this one held. One map
  // for the walk, which is what makes the tally continuous — see `ownersOf`.
  const seen = new Map<string, number>();
  const segs = segment(text.split("\n"));
  return segs.map((seg, i) => {
    const owners = (
      seg.kind === "fence" ? ownersOf(seg.lines, sections, seen) : []
    ).filter((id) => {
      if (claimed.has(id)) return false;
      claimed.add(id);
      return true;
    });
    return {
      sectionIds: owners,
      from: i,
      to: i,
      filler:
        !owners.length &&
        (isBlank(seg.lines) ||
          (i === 0 && seg.lines[0]?.trim() === "---") ||
          seg.lines.every(
            (l) =>
              l.trim() === "" ||
              l.trim() === "`chronoanvil:spacer`" ||
              l.trim().startsWith("%%") ||
              l.trim().startsWith("[[")
          )),
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
// AND 4.58.0 IS WHERE IT STOPS COSTING ANYTHING. 3.2 patch 3 fused the period
// summary into a masthead card with navigation, which made it the only unpinned
// member of a two-section band and took its move away — not to a new rule, but
// to this arithmetic. 4.19 dissolved the card and left the band, so the cost
// outlived the thing it was paid for: a heading over one row, and a section
// immobile for a reason that had stopped being true four releases earlier.
// `summary` is a `body` section now, so "You can move it, though." is once again
// what this function answers about it.
//
// WHICH LEAVES EXACTLY ONE IMMOVABLE ROW ON A DASHBOARD, and it is the banner —
// pinned by declaration, and alone in `head` besides. That is the rule the whole
// surface is meant to have: the page's name is the top of the page, and
// everything below it is the reader's to arrange.
//
// GRAIN-BLIND ON PURPOSE. `applies` narrows the body per grain, but the two
// sections a refusal ever reaches — the banner and the period summary — are on
// every grain. The editor asks through `viewFor`, which does know the grain.
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

// ── THE BAR ON A DASHBOARD THAT PREDATES IT (4.59.0) ─────────────────────
//
// `ensureTrendsHeader`'s SHAPE EXACTLY, and for its reason. Repair is ADDITIVE:
// it adds a section this release ships and the note lacks, and `repairNote`
// throws on anything else. The summary is already on every dashboard — what
// changed is the line above it — so there is nothing for repair to add and the
// page would keep the untitled fence forever. `charts.ts` names this escape
// where it took it, and this is the same escape for the same shape of change.
//
// PURE, TEXT IN AND TEXT-OR-NULL OUT, which is what lets the repair window show
// the diff before anything is written. `scaffold.ts` chains it with the other
// five on one text so a reader reads one diff per page.
//
// TWO FENCES IT LEAVES ALONE, and both are a reader having decided something:
//
//   • ONE THAT ALREADY HAS A BAR. Titled by this migration on an earlier run, or
//     composed with one, or renamed since — `attachHeaderRename` rewrites the
//     title in place, so a second pass must not put ours back above theirs.
//
//   • ONE IN A ROW GROUP. A `row`/`cell` fence is the widget form, which exists
//     precisely so the summary can be a column of a group — `isSectionFence`
//     refuses a self-titling fence as cell content, so titling it here would
//     break the layout the reader built and drop the bar below the group it
//     appeared to title. The toggle in the section editor is the same decision
//     said in the window; this walk must not overrule it.
//
// A READER WHO TOGGLED THE WIDGET FORM WITHOUT GROUPING IT does get the bar back
// if they tick `migrations` in the repair window. That is the trade the other
// five make too — the group is ticked separately precisely so a reader who wants
// their pages left alone leaves it unticked — and it costs one toggle to undo.
export function titleSummaryFence(text: string): string | null {
  const lines = text.split("\n");
  const segs = segment(lines);
  let at = 0;
  for (const seg of segs) {
    const open = at;
    at += seg.lines.length;
    if (seg.kind !== "fence") continue;
    const body = seg.lines.slice(1, -1);
    if (!body.some((l) => /^(day|week|month|quarter|year)-summary\b/.test(l.trim()))) {
      continue;
    }
    // ALREADY FRAMED AS A SECTION IS ALREADY TITLED (4.68.1). This asked
    // `hasSectionBar`, which sees a `header:` line and nothing else — but a fence
    // carrying `frame: section` draws its own section chrome, and that is what
    // `composeDiaryDashboard` writes:
    //
    //     ```chronoanvil
    //     frame: section
    //     month-summary
    //     ```
    //
    // So this migration wanted to insert a `header:` line into a note the
    // scaffolder had just composed, and `Set up / repair vault` offered a FORMAT
    // MIGRATION for `02 - Diary.md` on a vault created minutes earlier. It
    // converged after one apply, which is the only reason it was a wart rather
    // than the 4.38.2 loop — but a plugin offering to migrate its own current
    // output is telling the reader their vault is out of date when it is not.
    //
    // `isSectionFence` is the predicate that already answers this question for
    // the drag and the section editor, and it is the union of the two ways a
    // fence titles itself. Asking the narrower one here was the whole defect.
    if (isSectionFence(body)) return null;
    if (body.some((l) => isRowLine(l) || isCellLine(l))) return null;
    const keyword = body
      .map((l) => l.trim().split(":")[0])
      .find((k) => /^(day|week|month|quarter|year)-summary$/.test(k));
    const title = SUMMARY_TITLES[(keyword ?? "").replace(/-summary$/, "")];
    if (!title) return null;
    const out = [...lines];
    out.splice(open + 1, 0, `${HEADER_PREFIX}${title}`);
    return out.join("\n");
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
  const planSegs = segment(text.split("\n"));
  // THE TEXT AND THE WANT BOTH, because either can name a section this grain's
  // catalogue does not hold: the text names the widget cards it already carries,
  // and the want names the ones the reader staged this session. A section
  // neither list resolves is one this function silently skips, which is how a
  // staged third card used to vanish between the preview and the write.
  const byId = new Map(
    sectionsWanting(ctx, text, requested).map((s) => [s.id, s])
  );

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

  // ── A CELL ALREADY ON DISK WITH NO TITLE OVER IT (5.9) ──────────────
  //
  // `soloBar` titles a lone cell when a page is COMPOSED without its row's
  // opener and when one is CUT out of a fence. Neither reaches a page written
  // before those rules existed — untick the rollup on a week, in any release
  // before this one, and the tasks table beside it was left in a fence with
  // nothing over it — and its reader has no gesture that fixes it: unticking
  // the table and ticking it back composed the same headless fence. So the plan
  // looks, reports it as an `extend`, and the write adds one line.
  // `needsSoloBar` is the gate and says why.
  const barless = new Map<string, string>();
  for (const run of runs) {
    if (run.sectionIds.length !== 1) continue;
    const only = byId.get(run.sectionIds[0]);
    const lines: string[] = [];
    for (let i = run.from; i <= run.to; i++) lines.push(...planSegs[i].lines);
    if (!only?.row || !needsSoloBar(lines, only.bar)) continue;
    barless.set(only.id, only.bar as string);
  }

  const ops: SectionOp[] = [];

  // Removals, keeps and reconfigures, in file order, so the plan reads down the
  // file.
  for (const id of order) {
    const section = byId.get(id);
    if (!section) continue;
    if (want.includes(id)) {
      // A TITLE IS A MISSING PART, and `extend` is the word for a section short
      // of one. A reconfigure still wins the label — it is the one that rewrites
      // a line the reader may have edited — and reports both.
      const noBar = barless.get(id);
      const barDetail = "this block has no title over it — one will be added";
      ops.push({
        kind: rewriting.has(id) ? "reconfigure" : noBar ? "extend" : "keep",
        sectionId: section.id,
        label: section.label,
        detail: rewriting.has(id)
          ? describeAnswers(
              section.questions?.(ctx) ?? [],
              optionsFor(requested, id),
              diaryHostLabel(ctx)
            ) + (noBar ? `; ${barDetail}` : "")
          : noBar
            ? barDetail
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
  for (const band of ["head", "body"] as const) {
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

// ── A ROW LOSING ONE OF ITS CELLS (4.70) ─────────────────────────────────
//
// THE CASE `applyDiarySections` PREDICTED AND DID NOT HANDLE. Its chunk loop
// carries the sentence *"a chunk that lost one of two sections would need its
// fence rewritten rather than dropped, and that is a case this release does not
// create and must not silently mishandle if a later one does"* — written in
// 4.19 about the masthead, which could not reach it because both its sections
// were locked. This is the later release: `entry-rollup` and `open-tasks` share
// a fence and BOTH are unlocked, so unticking either one is an ordinary press.
//
// WHAT IT DID WITHOUT THIS. `doomed.length !== run.sectionIds.length` fell
// through to the keep-it branch, the chunk was re-emitted whole, no other op
// fired, and `applyDiarySections` returned null — "nothing to do" — for a save
// the reader had just made. The section window closed and the block was still
// there.
//
// THE CUT ITSELF IS `cutFromFence` (4.70), shared with the journal-template
// planner, which asks the same question of the same grammar — cut by keyword
// rather than by line text, spare a keyword a survivor also writes, and take the
// `row` line with the second-to-last cell. What is computed HERE is only which
// keywords belong to whom, which is the part that needs this catalogue.
//
// NULL WHERE IT CANNOT SEE ITS WAY, and the caller keeps the chunk whole. That
// is a refusal that shows — the block stays on the page and the plan says the
// section is still there — rather than a cut that takes a line it guessed at.
function cutFromRun(
  lines: readonly string[],
  doomed: readonly string[],
  keeping: readonly string[],
  byId: Map<string, DiarySection>,
  ctx: DiaryDashboardContext
): string[] | null {
  const keywordsOf = (id: string): string[] => {
    const section = byId.get(id);
    if (!section) return [];
    return section.render(ctx).lines.map((l) => splitDirective(l).keyword);
  };
  const spare = new Set(keeping.flatMap(keywordsOf));
  const cutting = new Set(doomed.flatMap(keywordsOf));
  // THE SURVIVOR'S OWN TITLE WHERE ONE CELL IS LEFT (5.9) — the bar came out
  // with the cell that composed it, and `soloBar` is what stops the remaining
  // one being a fence of content with nothing above it.
  return cutFromFence(
    lines,
    cutting,
    spare,
    keeping.length === 1 ? byId.get(keeping[0])?.bar : undefined
  );
}

// ── A CELL REJOINING THE ROW IT LEFT (4.70) ──────────────────────────────
//
// THE OTHER HALF OF `cutFromRun`, AND THE PROPERTY IT EXISTS FOR: remove a
// section and put it back, and the file is the file you started with. That is
// the rule `insertionPoint` names as the reason it stops at the first section
// that outranks the new one — *"it makes remove-then-re-add restore the file
// exactly, which is the property worth having because it is the one a test can
// check"* — and a cut cell breaks it, because the ordinary add path composes a
// FENCE and the cell came out of one.
//
// So a section that declares a `row` looks for that row's fence first, and puts
// its line back inside it. Only then does it fall through to a block of its own.
//
// WHERE IN THE FENCE: by catalogue rank, ahead of the first member that
// outranks it. The same rule as `insertionPoint` one level in, so the two
// cannot disagree about what order a page is in.
//
// AND THE `row` LINE COMES BACK WITH IT, because `cutFromRun` took it when the
// fence fell to one cell. A fence that gained a second directive without it
// would be two widgets stacked in one block rather than a row of two.
//
// FALSE FOR "NOT MY ROW", which includes the ordinary case of a row whose other
// cells are not on the page: there is nothing to join, and a block of its own is
// exactly right.
function joinRowChunk(
  chunks: { ids: string[]; lines: string[] }[],
  section: DiarySection,
  ctx: DiaryDashboardContext,
  byId: Map<string, DiarySection>,
  order: readonly string[],
  opts: Record<string, unknown> | undefined
): boolean {
  if (!section.row) return false;
  const at = chunks.findIndex(
    (c) =>
      c.ids.length > 0 &&
      c.ids.every((id) => byId.get(id)?.row === section.row)
  );
  if (at < 0) return false;

  const chunk = chunks[at];
  // AND THE SOLO BAR COMES BACK OFF FIRST — `dropSoloBar`, `soloBar`'s inverse.
  // `cutFromRun` gave the survivor a title when the cut left it alone; the cell
  // arriving beside it composes the band's again, so the borrowed one goes and
  // remove-then-re-add stays the round trip this function exists for.
  const base = chunk.ids.reduce(
    (out, id) => dropSoloBar(out, byId.get(id)?.bar),
    chunk.lines as readonly string[]
  );
  const rank = order.indexOf(section.id);
  // The first member that outranks the arrival, by the keyword it writes — the
  // same probe `cutFromRun` cuts by, so the two agree about which line is whose.
  const later = chunk.ids.find((id) => order.indexOf(id) > rank);
  const laterKeywords = later
    ? new Set(byId.get(later)?.render(ctx).lines.map((l) => splitDirective(l).keyword))
    : null;
  // Default: last line before the fence closes.
  let insertAt = base.length;
  for (let n = base.length - 1; n >= 0; n--) {
    if (base[n].trim() === "```") {
      insertAt = n;
      break;
    }
  }
  if (laterKeywords) {
    const found = base.findIndex((l) =>
      laterKeywords.has(splitDirective(l.trim()).keyword)
    );
    if (found >= 0) insertAt = found;
  }

  const lines = [...base];
  if (!lines.some((l) => isRowLine(l.trim()))) {
    const open = lines.findIndex((l) => l.trim().startsWith("```"));
    lines.splice(open + 1, 0, ROW_KEYWORD);
    if (insertAt > open) insertAt++;
  }
  lines.splice(insertAt, 0, ...section.render(ctx, opts).lines);

  chunks[at] = {
    ids: [...chunk.ids, section.id].sort(
      (a, b) => order.indexOf(a) - order.indexOf(b)
    ),
    lines,
  };
  return true;
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
  const byPin = new Map(
    sectionsWanting(ctx, text, requested).map((s) => [s.id, s])
  );
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
  // A missing title is a write like any other, so it counts towards "anything to
  // do" — the plan already named it, and a plan that promises a line the writer
  // then declines to add is the disagreement this module is built not to have.
  const extending = new Set(
    ops
      .filter((o) => o.kind === "extend")
      .map((o) => o.sectionId)
      .filter((id): id is string => id !== null)
  );
  if (
    !removing.size &&
    !adding.length &&
    !moving &&
    !rewriting.size &&
    !extending.size
  ) {
    return null;
  }

  const segs = segment(text.split("\n"));
  const runs = parseDiarySections(text, ctx);
  const byId = new Map(
    sectionsWanting(ctx, text, requested).map((s) => [s.id, s])
  );

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
    const keeping = run.sectionIds.filter((id) => !removing.has(id));
    if (doomed.length && keeping.length) {
      const cut = cutFromRun(lines, doomed, keeping, byId, ctx);
      if (cut) {
        let out = cut;
        for (const id of keeping) {
          if (!rewriting.has(id)) continue;
          out = withAnswers(
            out,
            byId.get(id)?.questions?.(ctx) ?? [],
            optionsFor(requested, id)
          );
        }
        chunks.push({ ids: keeping, lines: out });
        continue;
      }
    }
    if (!doomed.length || doomed.length !== run.sectionIds.length) {
      // Answers spliced into their own span; everything else in the chunk is
      // the reader's line, unchanged. See `withAnswers`.
      let out = lines;
      for (const id of run.sectionIds) {
        // The title the plan said this block was missing, added before the
        // answers so it cannot land inside a directive's argument span.
        if (extending.has(id)) out = soloBar(out, byId.get(id)?.bar);
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
  // WIDGETS RANK BELOW EVERY CATALOGUE SECTION, which is what putting them at
  // the tail of `sectionsForDashboard` already says. `insertionPoint` walks this
  // list to find the first section that outranks the new one, so a card added to
  // a dashboard nobody has rearranged lands at the bottom of the page — which is
  // where a reader who has not thought about position is least surprised to find
  // it, and one drag from anywhere else.
  const order = sectionsForDashboard(ctx, text).map((s) => s.id);
  for (const id of adding) {
    const section = byId.get(id);
    if (!section) continue;
    // A CELL GOES BACK INTO ITS ROW BEFORE IT GETS A BLOCK OF ITS OWN — see
    // `joinRowChunk`, which is what makes remove-then-re-add a round trip for a
    // section that shares a fence.
    if (joinRowChunk(chunks, section, ctx, byId, order, optionsFor(requested, id))) {
      continue;
    }
    const at = insertionPoint(chunks, order, id);
    // AND A CELL THAT COULD NOT REJOIN ONE IS COMPOSING A BLOCK OF ITS OWN, so
    // it takes the title a block of its own needs — `soloBar`'s third door.
    chunks.splice(at, 0, {
      ids: [id],
      lines: [
        "",
        ...soloBar(
          renderDiarySection(section, ctx, optionsFor(requested, id)).split("\n"),
          section.bar
        ),
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
    for (const band of ["head", "body"] as const) {
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

  const next = chunks
    .flatMap((c) => c.lines)
    .join("\n")
    .replace(/\n{3,}%% chronoanvil-graph %%/g, "\n\n%% chronoanvil-graph %%");
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
// ── AND THE OVERVIEW'S BAND WENT IN 4.58.0 ────────────────────────────
//
// "The overview" named a band holding exactly one section, and a band of one is
// a section that cannot be moved. The card it was named for stopped existing in
// 4.19, when navigation went into the banner; what survived it was a heading
// over a single row and an arithmetic lock nothing in this file wanted.
//
// TWO BANDS, AND THE REMAINING ONE IS THE WHOLE RULE. `head` holds the banner
// and nothing else, so the page's own name cannot be dragged into the middle of
// the page — which is what `pinned` was added to prevent and what a band is the
// only thing able to enforce. Everything else is "The page below", and where it
// sits in there is the reader's.
const BANDS: Record<DiarySection["band"], string> = {
  head: "The banner",
  body: "The page below",
};

const viewFor =
  (ctx: DiaryDashboardContext, text?: string) =>
  (s: DiarySection): SectionView => {
    const questions = s.questions?.(ctx);
    return {
      ...viewOf(s),
      ...(questions ? { questions } : {}),
      // WHAT THIS SECTION'S OWN LINE ALREADY SAYS (4.58.0), and it is the
      // repeating widgets that need it. The window reads an answer back by
      // finding the directive in the whole file and REFUSES when it appears more
      // than once — a refusal that is right for a window holding a file and no
      // extents, and that would blank the selector on every Events card the
      // moment a dashboard held two. The model located the section, so it knows
      // which line is that section's and reads the answer off that line alone.
      ...(questions && text !== undefined
        ? { answered: answersOn(s.locate(text), questions, text) }
        : {}),
      // Grain-aware, unlike the refusal: a yearly dashboard has fewer body
      // sections, so `isMovable` works out from `applies` rather than from a
      // table whether a row has anywhere to go.
      movable: isMovable(s, ctx),
    };
  };

const viewOf = (s: DiarySection): SectionView => ({
  id: s.id,
  label: s.label,
  movable: isMovable(s),
  blurb: s.blurb,
  icon: s.icon,
  removable: !s.locked,
  // TWO BANDS AS OF 3.2 PATCH 3, AND STILL TWO AFTER 4.58.0 TOOK ONE AWAY AND
  // 4.10 HAD ADDED ONE. This said "ONE BAND. A dashboard is a stack of fences
  // with nothing separating a structural half from a personal one" — true until
  // the masthead, and true again of everything below the banner. The editor's
  // rule is unchanged through all of it and still has no surface test in it.
  group: BANDS[s.band],
  ...(s.repeatable ? { repeatable: true } : {}),
});

// This dashboard, as the editor sees it.
export function diarySectionModel(ctx: DiaryDashboardContext): SectionModel {
  // AN ID RESOLVES EVEN WHEN NOTHING LISTED IT — `flatNoteModel`'s rule, and
  // its reason: the lists offer what the text holds plus one spare, and a reader
  // staging three new cards in one session reaches past that. Those ids are
  // built from their own spelling instead.
  const find = (id: string, text?: string): DiarySection | undefined =>
    sectionsForDashboard(ctx, text).find((s) => s.id === id) ??
    diaryWidgetSectionFor(id) ??
    undefined;
  return {
    sections: (text) => sectionsForDashboard(ctx, text).map(viewFor(ctx, text)),
    present: (text) => detectDiarySections(text, ctx),
    addable: (text) =>
      addableDiarySections(ctx, text).map(viewFor(ctx, text)),
    refusal: (id, text) => {
      const s = find(id, text);
      return s ? diaryRemovalRefusal(s, text) : null;
    },
    plan: (text, want) => planDiarySections(text, ctx, want),
    apply: (text, want) => applyDiarySections(text, ctx, want),
    // A dashboard holds more than one of a widget as of 4.58.0, so it owes the
    // editor the id to stage for the next copy. See `SectionModel.instanceOf`.
    instanceOf: (id, text, taken) => nextInstanceId(id, text, taken),
    blocks: (text) =>
      flatBlocks(
        text,
        sectionsForDashboard(ctx, text).map((s) => asFlat(s, ctx))
      ),
    regroup: (text, blocks, pages) =>
      regroupFlatNote(
        text,
        sectionsForDashboard(ctx, text).map((s) => asFlat(s, ctx)),
        blocks,
        pages
      ),
  };
}
