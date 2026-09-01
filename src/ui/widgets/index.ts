// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import {
  App,
  MarkdownPostProcessorContext,
  TFile,
} from "obsidian";
import type ChronoAnvilPlugin from "../../main";
import { buildYearSummary } from "../../review/year-view";
import { buildQuarterSummary } from "../../review/quarter-view";
import { buildPeriodRecap } from "../../review/recap-view";
import { buildEntryRollup, rollupGrainOf } from "../../diary/entry-rollup";
import { keywordOf } from "../../core/layout";
import {
  buildDiarySearch,
} from "../../diary/diary-retrieval";
import { buildJournalContext } from "../../journals/study-header";
// The one copy of what each superseded band spelling means. See the two arms
// in `buildFromSpec` that read it.
import { STATS_BAND_ALIASES } from "../../journals/stats-band";
import {
  buildMonthSummary,
  buildWeekSummary,
} from "../../diary/calendar";
import { frontmatterOf, parseHeaderDirective } from "../../core/util";
import { HeaderBar } from "../headerbar";
import { buildScopeCycle } from "../tables";
import { HeaderSite, attachHeaderRename, boundsOf } from "../header-title";
import {
  CAPTURE_NOTE_KEY,
  HEADER_PREFIX,
  RETIRED_WIDGETS,
  TRACKER_MARK_START,
} from "../../core/constants";
import {
  readNoteRegion,
  reconcileRegionWrite,
  writeNoteRegion,
  ensureNoteRegions,
} from "../../core/notestore";
import {
  WidgetHost,
  EntryControlHost,
  buildSpacer,
  buildSelect,
  buildSlider,
  buildTimeOrDate,
} from "./controls";
import {
  buildList,
  buildPath,
  buildTasks,
} from "./note-regions";
import {
  buildAddCategoryButton,
  buildAttachments,
} from "./attachment-widgets";
import { buildRecall } from "./recall-widgets";
import { NoteWriteScheduler } from "./note-write-scheduler";
import {
  NoteFieldHost,
  buildNote,
  noteFoldState,
  noteKeyOf,
  setNoteFold,
} from "./note-field";
import { buildButton } from "./button-widgets";
import { buildNowButton } from "../../diary/periodnav";
import type { Unit as PeriodGrain } from "../../diary/periodnav";
import { buildChartGrid, CHART_GRID_EMPTY } from "./chart-grid";
import { buildCaptureLog } from "./capture-log-widget";
import { buildLogbook } from "./logbook-widget";
import { buildTimeGrid } from "../../diary/time-grid-view";
import {
  buildBridgeNotesRegion,
  buildBridgeReadingsRegion,
} from "./bridge-widgets";
import {
  buildActivityChartRegion,
  buildCalendarRegion,
  buildEventsRegion,
  buildJournalBreakdownRegion,
  buildJournalTallyRegion,
  buildJournalChartRegion,
  buildJournalSearchRegion,
  buildJournalRecentRegion,
  buildJournalsHeaderRegion,
  buildJournalCardRegion,
  buildJournalCardsRegion,
  buildJournalsRegion,
  buildKindTableRegion,
  buildLinksRegion,
  buildOnThisDayRegion,
  buildPagesTableRegion,
  buildReviewQueueRegion,
  buildTagIndexRegion,
  buildTasksTableRegion,
  tasksScopeFor,
  buildTimelineRegion,
  buildStatsBandRegion,
  buildLevelCardsRegion,
  buildLevelIndexRegion,
} from "./directive-regions";
import {
  liveScopedWidget,
  liveFrontmatterWidget,
  liveDiaryWidget,
} from "./live-widgets";
import { mountBlock, mountInline, type BlockRenderer } from "../livewidget";
import { resolvePeriodBounds } from "../../charts/chart-widgets";
import {
  attachTrackerRemove,
  buildHabitChip,
  buildSleep,
  buildTracker,
  buildTrackerAddCell,
} from "./tracker-controls";
import {
  TrackerDef,
  getTracker,
  getBuiltinTracker,
  recomputeSleepInFrontmatter,
} from "../../trackers/trackers";
import { buildSleepSummary } from "../../trackers/sleep";
import { buildTrackerStat } from "../../trackers/tracker-stat";
import {
  describeSurfaceMismatch,
  directiveAllowedOn,
  directiveTrackerId,
  journalTypeNamer,
  noteSurfaceOf,
  isManagedTemplate,
} from "../../trackers/entry-trackers";
import {
  parseChartDirectives,
} from "../../charts/charts";
import {
  buildEntryContext,
} from "../../diary/entryheader";
import { buildPeriodNav } from "../../diary/periodnav";
import { foldableSection, sectionFrame } from "../section-frame";
import { bannerSuppressed } from "../vault-banner";
import type { FoldStore } from "../section-frame";
import {
  CELL_KEYWORD,
  TAB_KEYWORD,
  TITLE_KEYWORD,
  cellWeightOf,
  hasTitledBar,
  isFrameLine,
  isHeightLine,
  isRowLine,
  isSectionFence,
  isTitleLine,
  isWideLine,
  parseCells,
  parseFrame,
  parseHeights,
  parseRow,
  parseTabs,
  parseWide,
} from "../../core/directive-grammar";
import type { FrameValue } from "../../core/directive-grammar";
import { layOutRow } from "./row";
import type { CellBound } from "./row";
import { tabHandle } from "./group-tabs";
import {
  applyCardHeights,
  attachBlockHead,
  cardWidget,
  stampLines,
} from "./block-drag";
import { livePageHead } from "./page-head";
import { buildLauncher, LAUNCHER_DEFAULT } from "./launcher";
import {
  JournalChartSpec,
  journalChartDirective,
  parseJournalChartDirectives,
} from "../../charts/journal-charts";



// The directives that open a journal note's banner. Named once because three
// places ask "is this a banner?" — the composite list, the flag that welds the
// tracker grid beneath it, and entry-trackers.ts's region placement — and a
// literal in each is how the second spelling gets forgotten in one of them.
export const JOURNAL_BANNER_KINDS = new Set(["journal-header"]);

// Every directive that makes its fence a BANNER. 4.21.
//
// ── WHY THIS EXISTS, AND WHY `hasOwnBar` COULD NOT ANSWER IT ──────────
//
// 4.19.1 fixed a dashboard drawing a head reading "🔗 Links" above the page's
// own name, by adding `.ca-jtc-card` to `hasOwnBar`'s list of bands. That was the
// right fix for the surface it was tested on and the wrong mechanism, and the
// next render found out: an ENTRY's banner fence opens with the links row, so
// the block's first child is `.ca-journal-links-card` — and `hasOwnBar` asks only
// about the FIRST CHILD, deliberately, because "a band deeper inside belongs to
// something further in".
//
// So the entry banner drew the same wrong head, and the journal banner would
// have the day anything was composed above `journal-header`.
//
// THE QUESTION `hasOwnBar` ANSWERS IS "IS THE TOP OF THIS BLOCK A BAND". The
// question that had to be answered is "IS THIS BLOCK A BANNER", and those come
// apart the moment a banner has more than one row. A banner is never named by a
// widget inside it — it names the note — so the rule belongs where the name is
// chosen, which is `blockTitle`.
//
// `title` IS IN THE SET, AND IT IS NOT A "BANNER WIDGET". It is structural in
// `widget-registry.ts` and the two others are `reason: "banner"`. What this set
// answers is not "which widgets are banners" but "which directives make the
// fence holding them one", and the page's own name does exactly that.
export const BANNER_KINDS = new Set([
  TITLE_KEYWORD,
  "entry-header",
  ...JOURNAL_BANNER_KINDS,
]);

// Every directive the VAULT BANNER stands in for. 4.51.5, narrowed in 4.51.6.
//
// ONE WORD, AND IT IS NOT A BANNER. `links:` is a row of `resolveTarget`
// destinations, which is precisely what the bar's own nav is — so with the bar
// on it is the same four buttons drawn again in a card, which is what the vault
// render showed. It is dropped.
//
// THE THREE BANNER DIRECTIVES ARE NO LONGER IN THIS SET (4.51.6). They were,
// for five patches, and drew nothing — a `required: true` section rendering
// nothing is a section waiting to be deleted. They draw the PAGE HEAD now: the
// note's own name in a page's face, over what kind of note it is. See
// `page-head.ts`, which holds the argument for why that is not the bar's job
// done twice.
//
// KEPT SEPARATE FROM `BANNER_KINDS` rather than widening it, because widening
// it would make a lone `links:` fence report itself as a banner to `blockTitle`,
// to `chromeClasses` and to the section editor — three answers changed to avoid
// declaring one set.
export const SUPPRESSED_KINDS = new Set(["links"]);

// The widget kinds that sit INLINE in a widget-bar row — sliders, selects,
// steppers, buttons, tracker cells. Everything else renders as its own
// full-width block.
//
// WHY THE EXCEPTION LIST AND NOT THE RULE
//
// This was COMPOSITE_KINDS until 2.56.25: the thirty-nine full-width kinds,
// listed, with the seven inline ones implied by absence. Inverting it is not
// tidying. It changes what a kind does when someone forgets to add it, and the
// old default was the unsafe one.
//
// Forgetting used to mean a full-width block got the inline treatment: wrapped
// in a widget-bar row and collapsed to content width inside a flex column.
// That is exactly what happened to `list` in 2.12, and it is quiet — the
// widget still works, it just looks wrong in a way nobody attributes to a
// missing set entry. Forgetting now means an inline control renders on its own
// row, which is visible the first time you look at the note.
//
// The list is also the minority (7 against 39) and a coherent one: these are
// the controls bound to a single frontmatter value, the same set ./controls.ts
// and ./tracker-controls.ts were extracted around. "Is this an inline control?"
// has an answer you can hold in your head; "is this one of thirty-nine
// full-width kinds?" does not.
//
// A test asserts every entry here is a kind the switch actually dispatches,
// because absence is now the default and a typo would otherwise be silent.
// The four period summaries. A fence containing one is a dashboard masthead:
// it takes the card, and its navigator becomes the anchor a following
// `button:` joins.
//
// A SET RATHER THAN A PREFIX TEST on "-summary", because `sleep-summary` and
// `confidence-summary` are neither period summaries nor mastheads, and a rule
// that read their names would give a journal note a dashboard's frame.
const OVERVIEW_KINDS = new Set([
  "week-summary",
  "month-summary",
  "quarter-summary",
  "year-summary",
  // `level-cards` DRAWS CARDS, so it takes the card modifier for the reason
  // this set exists (4.36). Without it a `frame: section` fence would keep the
  // block's own card AND add a section bar, which is 4.1 §3.1's two borders
  // arguing — and the journal dashboard composes exactly that fence.
  "level-cards",
]);

// What a directive calls itself when it has to title its own section.
//
// `frame: section` (4.1 §3.1) needs a title and a bare `month-summary` fence
// has none. The alternative was carrying it in the modifier —
// `frame: section: 🗓 This month` — which strains a one-line grammar and puts a
// colon inside a value; this is §3.3's other option, and the string is the same
// one a catalogue would otherwise have written into a `header:`.
//
// A TABLE RATHER THAN A FIELD ON EACH BUILDER, for `OVERVIEW_KINDS`' reason
// one table up: the builders are forty functions in nine files, and a property
// threaded through all of them to be read in one place is a worse trade than a
// list that can be read at a glance and tested as a whole.
//
// GLYPH INCLUDED, because `splitGlyph` in section-frame.ts takes the emoji off
// the front and gives it the fixed slot that makes a column of section titles
// line up. A title with no glyph gets no slot and still renders.
//
// NOT EVERY DIRECTIVE IS HERE, and that is deliberate rather than unfinished. A
// directive with no entry cannot title itself, so `frame: section` on it is
// refused out loud rather than silently downgraded to `none` — see the frame
// block at the foot of the processor.
// What a block drew, as the three facts the chrome depends on.
export interface BlockComposites {
  entryBanner: boolean;
  overviewCard: boolean;
  studyBanner: boolean;
  // A tracker section: the fence holds a marked tracker region and is not a
  // banner (4.21).
  //
  // WHY IT NEEDED A CLASS. 4.20 moved the logging grid out of the banner into a
  // fence of its own, which took it out of the banner's CARD as well — that was
  // the point — and left it as loose widget cards on the page background with
  // nothing enclosing them. A section that is a section should look like one.
  //
  // NOT ON A BANNER THAT STILL HOLDS THE MARKERS. Every entry composed before
  // 4.20 keeps its region inside the banner's fence, where the banner's own card
  // already frames it; a second frame there would be a card inside a card.
  trackerSection: boolean;
  // A page banner: the fence holds this page's own name (4.19).
  //
  // THE FOURTH OF A FAMILY, and the reason it had to join it is the reason the
  // other three exist. `title` drew `.ca-jtc-card` when this was written — its
  // own border, radius, background and figure; it draws `livePageHead`'s
  // `.ca-journal-page-head` now, which paints a bottom rule and no box — and
  // `links:` draws `.ca-journal-links-card` with a border and radius of its own.
  // Welded into one fence by 4.19's banner, and left alone, they render as TWO
  // cards stacked with no gap: the exact
  // "resemblance instead of a card" this file's `isEntryBanner` comment
  // describes, arriving on the surface that had avoided it by keeping its two
  // halves in two blocks.
  //
  // So the block draws the box and the children go flat, which is what
  // `.ca-journal-entry-banner > .ca-journal-links-card` and
  // `.ca-journal-overview-card > .ca-journal-links-card` already do for the two
  // surfaces that got here first.
  pageBanner: boolean;
}

// Which classes a block's frame adds, given what it drew.
//
// PURE, AND SEPARATED FROM THE DOM for `tagSourcesOf`'s reason: the interesting
// half is a rule over three booleans and a value, and a rule that can be
// asserted is worth more than one that can be eyeballed on a dashboard. It is
// also the rule most likely to be broken by accident — §4 lists five things a
// change of frame is likely to quietly break, and "the card came back" is the
// one a screenshot would catch late.
//
// `.ca-journal-widget-block` IS NOT IN ANY OF THESE LISTS, and must not be: it
// carries `container-type: inline-size`, the query container every `@container`
// rule in styles/ depends on. It is applied when the block is created and no
// frame removes it.
export function chromeClasses(
  frame: FrameValue,
  drew: BlockComposites
): string[] {
  if (frame !== "card") {
    // One class covering everything the block can hold, rather than one per
    // widget. See styles/05-inline-widgets.css.
    return ["is-unframed"];
  }
  const out: string[] = [];
  if (drew.entryBanner) out.push("ca-journal-entry-banner");
  if (drew.overviewCard) out.push("ca-journal-overview-card");
  if (drew.studyBanner) out.push("ca-journal-study-banner");
  // ── TWO BANNERS, NOT FOUR (4.21.1) ─────────────────────────────────
  //
  // THE COUNT WAS THE DEFECT. 4.19 settled that every page gets ONE banner and
  // 4.20 settled what a banner holds, and neither asked how many banners the
  // plugin DRAWS. The answer was three — `.ca-journal-page-banner` for the eight
  // dashboard-shaped surfaces, `.ca-journal-entry-banner` for the five entry
  // grains, `.ca-journal-study-banner` for journal notes — plus the overview band,
  // which is not one and is named as if it were. Three implementations of one
  // idea is three places a change has to be made and two places it will be
  // forgotten, which is exactly what the "🔗 LINKS" head was: a fix applied to
  // the surface it was reported on and to neither of the other two.
  //
  // SO THERE ARE TWO: the LARGE banner a page you navigate to announces itself
  // with, and this, the SLIM one a note you write in identifies itself with. An
  // entry and a journal leaf are the same kind of page — a note with a name, a
  // way back, and a cog — and every rule that says how that looks is written
  // once, against this class.
  //
  // THE OLD TWO SURVIVE ALONGSIDE IT rather than being renamed away. They still
  // carry what genuinely differs: an entry welds a links card to the band and a
  // journal note does not, and every note composed before 4.20 keeps its logging
  // grid inside whichever of the two its fence is. A rename would have touched
  // eight files for no rendered change, which 4.19 declined for the overview
  // band and declines again here.
  if (drew.entryBanner || drew.studyBanner) out.push("ca-journal-slim-banner");
  // LAST, AND IT NEVER SHARES A BLOCK WITH THE OTHER THREE. A page's own name
  // and a note's identity strip are two answers to "which note is this", and a
  // fence holding both would be the doubling 4.19 exists to remove — the entry
  // and journal catalogues compose no `title:` line for exactly that reason.
  // The order still matters for a hand-written fence that does it anyway: the
  // page banner's box is the outer one, so it is applied after.
  if (drew.pageBanner) out.push("ca-journal-page-banner");
  // AFTER THE BANNERS, AND NEVER WITH ONE. A fence is a banner or it is the
  // tracker section; the flag below is computed from "has markers AND is not a
  // banner", so the two cannot both be set — this order is what a reader of the
  // class list sees rather than a tie being broken.
  if (drew.trackerSection) out.push("ca-journal-tracker-section");
  return out;
}



const SECTION_TITLES: Record<string, string> = {
  diary: "📆 Today",
  "week-summary": "📅 This week",
  "month-summary": "📅 This month",
  "quarter-summary": "📅 This quarter",
  "year-summary": "📅 This year",
  journals: "📚 Journals",
  // `journals:cards` shares the keyword, so it shares the title — the table is
  // keyed on the KEYWORD, which is what `frame: section` reads off the fence.
  // Two entries would be two names for one section, and the arrangement is not
  // what the bar should be announcing.
  //
  // TWO ENTRIES WERE DELETED HERE IN 4.12, and both had been dead for a while:
  // `calendar`, retired in 3.11 (see `RETIRED_WIDGETS`), and `month-nav`, which
  // was never a keyword at all — the directive is `period-nav`. A title for a
  // widget nothing dispatches is not inert: `frame: section` looks up the first
  // line whose keyword is in this table, so a dead entry is a fence that would
  // have folded under a name for a widget that cannot render. Nothing found
  // them because nothing compared this table against the switch;
  // `test/widget-registry.test.ts` now does, in both directions.
  "entry-rollup": "📖 What the days said",
  "period-recap": "📝 Recap",
  timeline: "📜 All entries",
  // ONE TITLE FOR EVERY LOGBOOK, and it is generic where the widget is not.
  // This table is keyed on the KEYWORD — `journals:cards` shares its entry with
  // `journals` two dozen lines up for the same reason — so it cannot say "Work
  // log" for one argument and "Meetings" for another. It does not need to: both
  // catalogues that compose a logbook write a `header:` bar naming it, and this
  // is what a fence titled by `frame: section` alone falls back to.
  logbook: "🗒️ Logbook",
  "time-grid": "⏱️ The week by the hour",
  "on-this-day": "🕘 On this day",
  upcoming: "⏭️ Coming up",
  "tracker-stat": "📉 Tracker",
  "tasks-table": "⏳ Open tasks",
  "tag-index": "🏷️ Tags",
  "review-queue": "🔁 Review",
  "journal-search": "🔎 Find",
  "journal-recent": "🕒 Lately",
  "diary-search": "🔎 Search",
  "topics-table": "🗂 Topics",
  // The band gets a head; the tally does not, because it draws its own title
  // from the tracker it names — exactly as `journal-breakdown` beside it does,
  // and for the same reason: a page can hold two tallies and one head saying
  // "Tally" over both would name neither.
  //
  // THREE WORDS, ONE BAND, AND THE HEADS DIFFER ON PURPOSE (4.46). A
  // `frame: section` fence is titled from the KEYWORD on its first line, so the
  // two aliases must keep entries or a note composed before this release loses
  // its head and draws onto the page's own background — the exact defect 4.15
  // §1 found on six widgets, one of which was `topic-stats`. Each alias keeps
  // the name it has always drawn, because the note on disk did not change; the
  // aliases' entries are further down this table where they have always been.
  "stats-band": "🔢 Stats",
  "journal-totals": "🧮 Totals",
  "journal-tally": "🧮 Status",
  "pages-table": "📄 Pages",
  "kind-table": "🗂 Notes",
  "activity-chart": "📈 Activity",
  // THE NAME THE CATALOGUE ALREADY GIVES IT (`home-sections.ts`, "Overview navigator"), and
  // it is here for what the name BRINGS rather than for the name. A widget the
  // map cannot name gets no head and no card, so the launcher was four tiles on
  // the page's own background beside three widgets that each had a surface —
  // the one block on the homepage that looked unfinished. 4.8.1.
  launcher: "🧭 Overview navigator",
  // ── the six that had none, 4.15 §1 ──────────────────────────────────
  //
  // THE COMMENT ABOVE WAS TRUE OF SIX MORE WIDGETS AND SAID SO ABOUT ONE. A
  // widget this map cannot name gets no head and no card, so `events`,
  // `sleep-summary`, `period-nav`, `journals-header`, `topic-stats` and `links`
  // drew their content straight onto the page's background beside neighbours
  // that each had a surface. 4.8.1 diagnosed exactly this for the launcher and
  // fixed the one instance in front of it; nothing compared the two tables, so
  // the other six kept the defect the fix was written for.
  //
  // NOW ASSERTED RATHER THAN NOTICED. `test/widget-registry.test.ts` pins that
  // every `WIDGETS` key has a line here, which is the check that would have
  // caught all six and the reason a seventh cannot appear.
  //
  // THE GLYPH IS THE REGISTRY'S OWN, not a second choice made here. The two
  // tables answer different questions and are kept apart on purpose, but a
  // widget wearing one emoji in the add list and another over its card would be
  // them disagreeing about what a thing looks like, which is not one of the
  // questions either is for.
  "journal-card": "📓 Journal card",
  "level-index": "🗂️ What's below",
  // THE SECTION'S OWN NAME ON THE PAGE THAT COMPOSES IT (4.36). Not "What's
  // below" a second time: `level-index` and `level-cards` answer one question,
  // and two blocks on one page headed identically would read as a duplicate
  // rather than as two arrangements a reader chose between.
  "level-cards": "🗂️ Contents",
  events: "🎉 Events",
  "sleep-summary": "😴 Sleep",
  "period-nav": "⏮️ Go to period",
  "journals-header": "🔥 Activity",
  "topic-stats": "📈 Topics",
  links: "🔗 Links",
};

// What this block's head calls it, when the block is one thing.
//
// THE SAME TITLES `frame: section` USES, and deliberately not a second list.
// A block that would be titled "📚 Journals" by the modifier is the same block
// under a head, and two tables would start disagreeing about the day one of
// them gained an entry.
//
// EXACTLY ONE, OR NONE. A row fence holds `diary`, `tasks-table` and
// `on-this-day` — three things the map can name — and picking the first would
// have the head announce a third of what is under it, above two columns that
// carry their own titles. `frame: section` may take the first because a section
// is one thing BY DECLARATION: the modifier says so and the widget it names is
// what the fence is for. A head is drawn on every block, including the ones
// nobody declared anything about, so it says nothing rather than something
// wrong. Repeats of one kind still count as one — a fence with two calendars is
// still a block of calendars.
//
// PURE, for `chromeClasses`' reason: it is a rule over a list of lines, and the
// failure it guards against — a head naming the wrong widget — is the kind that
// gets noticed weeks later on somebody's dashboard.
export function blockTitle(lines: readonly string[]): string | null {
  const keywords = lines.map((l) => l.split("|")[0].split(":")[0].trim());
  // A BANNER IS NEVER NAMED BY A WIDGET INSIDE IT — see `BANNER_KINDS`. It names
  // the note, so a head above it is a second answer to the question it exists to
  // answer, and the head this drew was "🔗 Links" on every page whose banner
  // carries a navigation row.
  //
  // ASKED FIRST, before the one-nameable-thing rule, because it is not a tie to
  // break: a banner fence with exactly one nameable widget in it is the failing
  // case rather than the safe one.
  if (keywords.some((k) => BANNER_KINDS.has(k))) return null;
  const named = new Set(keywords.filter((k) => SECTION_TITLES[k]));
  const only = [...named];
  return only.length === 1 ? SECTION_TITLES[only[0]] : null;
}

const INLINE_KINDS = new Set([
  "slider",
  "select",
  "time",
  "date",
  "tracker",
  "sleep",
  "button",
]);





// Widgets that render their own label as part of themselves, and so must not
// also be wrapped in the generic `journal-widget-labeled` span. These are
// exactly the kinds whose builder takes a `label` argument in the dispatch
// switch below — a test asserts the two stay in step, because the failure mode
// is silent and ugly rather than loud: a duplicated label plus a full-width
// block squashed to content width by the inline wrapper.
const SELF_LABELLED_KINDS = new Set([
  "note",
  "list",
  "tasks",
  "path",
  "attach",
  "recall",
]);

// The `,period` suffix on a `tasks-table:` directive, matched only at the end
// of the argument so a folder path containing commas (a subject named
// "Reading, Writing") is never truncated by the flag parse. See the
// `tasks-table` case for why this is a suffix match and not a pipe or a split.


// The contracts the extracted widget modules ask for. NoteFieldHost extends
// PluginNoteRegionHost, which extends NoteRegionHost, so listing the leaf here
// asserts all three — and TypeScript checks every member of the chain. The
// attachment and recall modules used to declare their own identically-shaped
// interfaces; those collapsed into PluginNoteRegionHost in 2.56.25, because
// three names for one shape implied a distinction none of them made.
export class Widgets implements
    WidgetHost,
    NoteFieldHost,
    EntryControlHost
{
  // `app` is readonly-public rather than private because NoteRegionHost names
  // it: the body-region widgets in ./note-regions.ts reach the vault through
  // it. `readonly` keeps the only thing that mattered about `private` here —
  // nothing outside reassigns it — while letting the interface be satisfied.
  constructor(
    readonly app: App,
    readonly plugin: ChronoAnvilPlugin
  ) {}

  // Where a `frame: section` remembers whether it is folded.
  //
  // THE SAME STORE THE HEADER BARS USE — `settings.collapsedNoteSections`,
  // whose keys are `"<notePath>::<title>"`. These are namespaced `"::frame:"`
  // so the two cannot collide, which is the rule journals-section.ts already
  // follows for its own keys.
  //
  // Fire-and-forget on the write, as `makeFoldable` is: a failed save costs a
  // remembered fold, not correctness, and awaiting it would make a click on a
  // chevron wait for disk.
  private foldStore(): FoldStore {
    return {
      isCollapsed: (key) =>
        this.plugin.settings.collapsedNoteSections?.[key] === true,
      setCollapsed: (key, value) => {
        if (!this.plugin.settings.collapsedNoteSections) {
          this.plugin.settings.collapsedNoteSections = {};
        }
        const map = this.plugin.settings.collapsedNoteSections;
        if (value) map[key] = true;
        else delete map[key];
        void this.plugin.saveSettings();
      },
    };
  }

  // Every fenced ChronoAnvil language goes through here rather than through
  // `registerMarkdownCodeBlockProcessor` directly, so that each rendered block
  // keeps the arguments it was drawn with and can draw itself again later. That
  // is what lets `repaintOpenNotes` reach a block rendered outside a markdown
  // view — an embed, an export, a dashboard plugin calling
  // `MarkdownRenderer.render` — where there is no note to re-render. See
  // ui/livewidget.ts for the registry and why each drawing is scoped to its own
  // component.
  //
  // EVERY LANGUAGE IS REGISTERED TWICE, under its current name and under the
  // `almanac` name the plugin used before the rename. An info string is matched
  // literally by Obsidian: an unregistered one renders as a plain code block,
  // so without this every dashboard and entry in a vault written before the
  // rename would show its directives as literal text. Writing only ever emits
  // the current spelling (FENCE_OPEN), so a note re-saved by the plugin
  // upgrades itself, and `tools/migrate-vault.mjs` does the rest in one pass.
  private registerBlock(lang: string, render: BlockRenderer): void {
    const legacy = lang.replace(/^chronoanvil/, "almanac");
    for (const info of legacy === lang ? [lang] : [lang, legacy]) {
      this.plugin.registerMarkdownCodeBlockProcessor(info, (source, el, ctx) =>
        mountBlock(source, el, ctx, render)
      );
    }
  }

  register(): void {
    // Legacy single-widget syntax: `chronoanvil:kind:...` written as inline
    // code. Still needed for spots that must stay on one line — e.g. the
    // per-topic buttons the plugin writes into the homepage's study table,
    // where a table cell can't contain a fenced block. New notes should
    // prefer the ```chronoanvil block below.
    //
    // `mountInline` does the replacement that used to be written out here, for
    // the same reason `registerBlock` exists: a widget that swapped itself in
    // and was never heard from again could not be repainted, and these are
    // precisely the buttons whose labels a kind rename changes.
    this.plugin.registerMarkdownPostProcessor((el, ctx) => {
      const codes = Array.from(el.querySelectorAll("code"));
      for (const code of codes) {
        if (code.closest("pre")) continue; // skip fenced code blocks
        const text = code.textContent ?? "";
        // Both spellings, for the same reason `registerBlock` takes both: these
        // spans are written into table cells the plugin itself authored, and a
        // vault predating the rename is full of them.
        if (!text.startsWith("chronoanvil:") && !text.startsWith("almanac:"))
          continue;
        mountInline(code, ctx, (scoped) => this.build(text, scoped));
      }
    });

    // Preferred syntax: a fenced ```chronoanvil block, one directive per line.
    // Keeps a note's own content free of scattered inline call-outs — all
    // of a section's plugin-rendered controls collapse into a single call
    // site, and it reads cleanly in source/edit mode the same way a
    // `dataviewjs` or `tracker` block does.
    this.registerBlock("chronoanvil", (source, el, ctx) => {
      const rawLines = source.split("\n").map((l) => l.trim());
      // The managed region's markers are comments, so they are filtered out of
      // `lines` below with every other `#` line. They are still worth knowing
      // about: a block that declares a tracker region is a logging block even
      // when the region is currently empty, and that is what lets the grid keep
      // its "+ Add tracker" tile after the last tracker is removed — and what
      // gives a monthly review, whose region ships empty, somewhere to add one.
      const hasTrackerRegion = rawLines.some((l) => l === TRACKER_MARK_START);
      // WHO SUPPLIES THIS BLOCK'S CHROME, read once before the loop. 4.1 §3.
      //
      // The modifier is dropped from `lines` rather than given a `case` in the
      // switch, because it is not a directive: it says nothing about what to
      // draw, only about what to draw it inside. Leaving it in would send it
      // through `buildFromSpec` as an unknown keyword.
      const frameSpec = parseFrame(
        rawLines.filter((l) => l.length > 0 && !l.startsWith("#"))
      );
      // WHETHER THIS BLOCK IS ONE ROW, read in the same place and dropped for
      // the same reason. 4.2 §2. The two modifiers are independent: a row wears
      // whatever frame the fence asked for, and a fence with no `row` line is
      // the column it has always been.
      const rowSpec = parseRow(
        rawLines.filter((l) => l.length > 0 && !l.startsWith("#"))
      );
      // WHERE ITS CELLS DIVIDE, if it says. 4.4 §1. Read here with the other
      // two modifiers, but NOT dropped from `lines` the way they are: `frame:`
      // and `row` describe the whole block and can be read in any order, and
      // this one means "here". The loop below has to meet it in sequence.
      const cellSpec = parseCells(
        rawLines.filter((l) => l.length > 0 && !l.startsWith("#"))
      );
      // AND WHERE ITS PAGES DIVIDE (4.34 §1). `parseCells`' twin one level up,
      // read here for the same reason and dropped from `lines` for the same one
      // — a `tab` means "here", so the loop meets it in sequence exactly as it
      // meets a `cell`.
      const tabSpec = parseTabs(
        rawLines.filter((l) => l.length > 0 && !l.startsWith("#"))
      );
      // AND HOW WIDE THE PAGE IS (4.11). Read with the other block modifiers,
      // dropped from `lines` like two of them, and the only one that says
      // something about the NOTE — which is why `parseWide` refuses it in a fence
      // that does not carry the page's title, rather than this call site checking.
      const wideSpec = parseWide(
        rawLines.filter((l) => l.length > 0 && !l.startsWith("#"))
      );
      // AND HOW TALL ONE WIDGET IS (4.22 §1). Read here for the refusals only:
      // unlike the four above, this modifier has no block-wide fact to hand back
      // — a fence may hold as many heights as it has cards, and each belongs to
      // the line under it. `applyCardHeights` reads them one at a time, from the
      // body, after the cards exist.
      //
      // DROPPED FROM `lines`, like `frame:`, `row` and `wide` and unlike `cell`.
      // A height means "here" the way a delimiter does, but nothing in the LOOP
      // needs to meet it: the delimiter has to be met in sequence because it
      // divides the children being appended, and a height is read off the body
      // afterwards by the line it sits above.
      const heightSpec = parseHeights(
        rawLines.filter((l) => l.length > 0 && !l.startsWith("#"))
      );
      // WHAT THE LOOP DISPATCHES, AND WHERE EACH OF IT CAME FROM. 4.8 §1.4.
      //
      // The filter is unchanged and `lines` is the same list it always was. What
      // is new is `lineAt`, which is parallel to it and holds the index each
      // survivor had in the fence's BODY — the file's own numbering, before the
      // comments and the modifiers were dropped.
      //
      // A DRAG NEEDS THE FILE'S NUMBER, NOT THE LOOP'S. A card is one directive
      // line, and moving it means naming that line to `moveCell`. The loop's
      // index counts what survived the filter, which on any fence with a
      // `frame:` line or a comment in it is a different number — and writing the
      // wrong one moves the wrong widget, silently, in the reader's note.
      const kept = rawLines
        .map((l, at) => ({ l, at }))
        .filter(
          ({ l }) =>
            l.length > 0 &&
            !l.startsWith("#") &&
            !isFrameLine(l) &&
            !isRowLine(l) &&
            !isWideLine(l) &&
            !isHeightLine(l)
        );
      // ── AND THE BANNER'S OWN LINES, WHEN THE VAULT BAR IS DRAWING ──────
      //
      // 4.51.1, and it is the second attempt. 4.51 suppressed a banner by
      // returning `null` from the widget's case, and `null` from a case is how
      // this loop is told a directive is UNKNOWN — so every suppressed banner
      // rendered a red *"Unknown ChronoAnvil widget: journal-header"* where the
      // banner had been. Trading one wrong block for a worse one.
      //
      // A SUPPRESSED BANNER IS NOT A DIRECTIVE THAT FAILED. It is a line with
      // nothing to draw, which is a fact about the FENCE rather than about the
      // widget — so it is answered here, where the fence's lines are chosen,
      // and the loop below never learns the bar exists.
      //
      // `BANNER_KINDS` IS THE LIST, not a second one written from memory of it.
      // That is exactly the mistake 4.51 made: it guarded the two directives
      // called "header" and missed `title`, which is what a DASHBOARD's banner
      // is — and the set has said so since 4.21, in as many words. One list,
      // read here.
      //
      // `links:` IS THE WHOLE OF IT (4.51.5), WHICH 4.51.1 GOT WRONG. That release
      // kept the row on the argument that it carries *where you are in time*.
      // It does not: the three `links:` lines this plugin composes are
      // `home,today,scopes#diary`, `today,scopes#diary` and `home[,up]` — every
      // one of them a VAULT destination out of `resolveTarget`, which is the
      // table the bar's own row reads. A period dashboard's prev/next is
      // `period-nav`, a separate directive, and an entry's day navigator lives
      // on the tracker strip. Neither is touched.
      //
      // So the row was the bar's four destinations drawn a second time, in a
      // card, six lines below them — reported as exactly that. What it had that
      // the bar did not is `scopes` and `up`, and both are answered rather than
      // dropped: the bar carries an Overviews control on the diary surface (see
      // `vault-banner.ts`), and `up` is what the trail has always been.
      //
      // `at` IS PRESERVED BY THE FILTER, so a drag still names the file's own
      // line number. Filtering `kept` rather than `rawLines` is what keeps that
      // true.
      const quiet = bannerSuppressed(this.plugin, ctx.sourcePath);
      const drawable = quiet
        ? kept.filter(({ l }) => !SUPPRESSED_KINDS.has(keywordOf(l)))
        : kept;

      // A FENCE THAT WAS ONLY A BANNER DRAWS NOTHING AT ALL — no block, no
      // border, no head. The homepage's banner is a bare `title` and nothing
      // else, so an empty framed card is exactly what the reader would see.
      if (drawable.length === 0 && kept.length > 0) return;

      const lines = drawable.map((k) => k.l);
      const lineAt = drawable.map((k) => k.at);

      // WHICH OF THIS FENCE'S LINES NOTHING MAY MOVE (4.11).
      //
      // The page head, and only the page head. A block holding the page's own
      // name is pinned in the section editor, so it must be pinned on the page
      // too — and `attachBlockHead` is where the page's gestures are attached, so
      // it is where the fact has to arrive.
      //
      // COMPUTED HERE RATHER THAN SNIFFED IN `block-drag`, and the reason is
      // arithmetic rather than taste: `lineAt` is the FENCE'S own numbering, taken
      // on the way into the same filter every directive is read through, and it is
      // the numbering `stampLines` and `moveCell` speak. A predicate over the raw
      // text inside block-drag would have to recount past the comments, the
      // `frame:` line and the `row` line to say the same thing — which is the
      // off-by-a-modifier bug `lineAt` exists to have fixed once.
      const fixed = drawable.filter(({ l }) => isTitleLine(l)).map(({ at }) => at);

      // WHETHER THIS FENCE TITLES ITSELF (4.12 §A), for the same reason and in
      // the same place. A block that draws its own section bar cannot be a
      // column of a group, so it must not offer its side quarters as a landing
      // place — and the fence's lines are what says so.
      //
      // ASKED OF `rawLines` RATHER THAN OF `lines`, which is the whole of the
      // care needed here: `lines` has already had the `frame:` line filtered
      // out, so `isSectionFence` asked of it would see a `frame: section` fence
      // as a plain one and light the quarters on exactly the block that loses
      // its bar, its title and its fold when something lands there. Blanks and
      // comments are dropped because `parseFrame` counts its own lines and a
      // commented-out modifier is not one.
      const sectionFence = isSectionFence(
        rawLines.filter((l) => l.length > 0 && !l.startsWith("#"))
      );

      const container = el.createDiv({ cls: "ca-journal-widget-block" });

      // A CONTRADICTION IS SHOWN, NOT RESOLVED (§3.3). `header:` and
      // `frame: section` both title the block, so a fence with both asked twice
      // and the grammar refuses it. Drawing the reason where the fence is means
      // the reader finds it while looking at the two lines they just wrote —
      // which is the whole argument against a silent precedence rule.
      if (frameSpec.error) {
        container.createDiv({
          cls: "ca-journal-frame-error",
          text: `ChronoAnvil: ${frameSpec.error}`,
        });
      }
      // The row modifier's refusals, drawn the same way and in the same class.
      // ONE CLASS FOR BOTH, because it is one idea — a modifier that could not
      // be honoured, said where the reader is looking — and a second class
      // styled identically is the doubling this project keeps removing.
      if (rowSpec.error) {
        container.createDiv({
          cls: "ca-journal-frame-error",
          text: `ChronoAnvil: ${rowSpec.error}`,
        });
      }
      if (cellSpec.error) {
        container.createDiv({
          cls: "ca-journal-frame-error",
          text: `ChronoAnvil: ${cellSpec.error}`,
        });
      }
      if (tabSpec.error) {
        container.createDiv({
          cls: "ca-journal-frame-error",
          text: `ChronoAnvil: ${tabSpec.error}`,
        });
      }
      // And the height modifier's. This is the one a reader meets by ACCIDENT —
      // §5.2: a sized widget dragged out of a group into a block of its own
      // carries its `height:` with it and lands somewhere it cannot mean
      // anything. Saying so is the difference between a gesture that explains
      // itself and a line that quietly does nothing.
      if (heightSpec.error) {
        container.createDiv({
          cls: "ca-journal-frame-error",
          text: `ChronoAnvil: ${heightSpec.error}`,
        });
      }
      // And the width modifier's, in the same class for the same reason — a
      // modifier that could not be honoured, said where the reader is looking.
      if (wideSpec.error) {
        container.createDiv({
          cls: "ca-journal-frame-error",
          text: `ChronoAnvil: ${wideSpec.error}`,
        });
      }
      // `bar` is the row simple widgets accumulate into. When a `header:`
      // directive opens a header bar, `bar` points at that header's right-hand
      // widget group so the section's controls anchor into the header rather
      // than sitting in a loose row beneath it. `headerGroup` is non-null only
      // while a header bar is open, which also lets a `links` row (normally a
      // full-width composite) tuck into the header instead. A composite widget
      // (other than links-in-header) or a new header closes the current bar.
      let bar: HTMLElement | null = null;
      let headerGroup: HTMLElement | null = null;
      // The last bar that ended up holding logging cells. The "+ Add tracker"
      // tile is appended to it once the whole block is built, rather than as a
      // directive in the note: the control has to be there on notes written
      // before it existed, and a control that manages the note's directives
      // shouldn't itself be one of them (removing the last tracker would take
      // the button with it, leaving no way back).
      let trackerBar: HTMLElement | null = null;
      // The bar that inline widgets land in, opened on demand.
      //
      // ONE COPY. This was written out twice, verbatim including its fourteen
      // lines of comment, because the habit-chip branch and the general inline
      // branch each open a bar. 3.6 patch 7 had to add to it, and a third
      // divergent copy is how the two would start disagreeing about what a
      // masthead footer contains.
      //
      // A bar inside a masthead is the period's actions — "Keep this week", and
      // now the jump back to the current period — so it is tagged and welded to
      // the banner above it by CSS.
      //
      // WELDED RATHER THAN MOVED, and the difference is the whole reason this
      // is not `headerGroup`. 3.2 patch 6 first put the period button INSIDE
      // the summary's nav stack, which reads better and cannot work: the
      // summary is a `LiveWidget` and `rerender()` rebuilds its subtree on
      // every metadata change the diary folders emit. A button parented there
      // Set once an `entry-header` has been rendered into this block. It turns
      // the block into the entry banner (see .journal-entry-banner in
      // A dashboard masthead: the fence holds a period summary, so the card is
      // the block's rather than the summary widget's. 3.2 §3.
      let isOverviewCard = false;
      let overviewHost: HTMLElement | null = null;
      // WHICH grain, kept as well as whether, because the footer's "This Week"
      // button needs a unit and the footer is built later in the loop, by which
      // point `kind` is `button`. Read off the summary directive that set the
      // flag rather than passed down from the composer: the two would be one
      // more pair to keep in step, and the directive is already the thing that
      // decides what the card is.
      // The single "Habits" cell every boolean tracker in this block folds
      // into, created lazily at the first one. It takes that first habit's
      // position in the grid, so a note that opens with Mood and Exercise
      // still opens with Mood and Exercise — the later habits join the cell
      // rather than the cell moving to meet them.
      let habitsCell: HTMLElement | null = null;
      let overviewGrain: PeriodGrain | null = null;
      // survives until the first entry is edited and then vanishes, with the
      // directive still in the file. So both of this bar's buttons are siblings
      // the postprocessor owns, and only their POSITION is borrowed.
      const openActionsBar = (): HTMLElement => {
        const parent = overviewHost ?? container;
        const created = parent.createDiv({ cls: "ca-journal-widget-bar" });
        if (!isOverviewCard) return created;
        created.addClass("ca-journal-overview-actions");
        // FIRST CHILD, so it takes the row's left edge. 3.6 patch 7 moved it
        // out of the band, where it was the heaviest thing in the masthead and
        // the least important control in it. The footer is where a control that
        // acts on the whole card belongs, next to the only other one.
        if (overviewGrain) {
          created.appendChild(buildNowButton(this.plugin, ctx, overviewGrain));
        }
        return created;
      };
      // The page head this fence drew, if the bar is on and it drew one. Not a
      // flag: what the code below needs is the ELEMENT, so that a strip which
      // prepends to the block lands under the note's name rather than over it.
      let pageHead: HTMLElement | null = null;
      // How many TITLED header bars this fence has already drawn. It is the
      // handle a rename uses to find its own line back in the file, so it counts
      // exactly what the file counts: an untitled `header:` renders no title,
      // is not renameable, and is skipped on both sides (see `headerTitleSpan`).
      let headerIndex = 0;
      // ── DOES ANYTHING ELSE TITLE THIS FENCE (5.10) ───────────────────
      //
      // A widget that carries a head of its own — the `tasks:` region is the
      // one left — must not draw it under a section bar that already names the
      // block. Two heads for one section is what the 5.7-5.9 wave produced
      // three times over, and the stylesheet was left hiding the loser: the
      // `tasks:` head's Compact toggle and progress readout went with it, so a
      // control disappeared from every Study note to settle a layout question.
      //
      // ONE ANSWER FOR THE FENCE, unlike `hostedScope` beside it, which is per
      // directive because a fence may hold a hosted table and an unhosted one.
      // A title is not like that: a `header:` bar names everything under it.
      //
      // AND `frame: section` COUNTS AS A TITLE, because it draws one — from the
      // first directive `SECTION_TITLES` knows, further down this function. A
      // fence with no `header:` line but a `frame: section` modifier is still a
      // named section, so a widget inside it that titled itself as well would be
      // the same two-heads defect arriving by the other door. When no line in
      // the fence is in that table the frame refuses out loud and draws no head,
      // which is why the lookup is asked rather than the modifier alone.
      const fenceTitled =
        hasTitledBar(lines) ||
        (frameSpec.frame === "section" &&
          lines.some(
            (l) => SECTION_TITLES[l.split("|")[0].split(":")[0].trim()] !== undefined
          ));
      // Which titled header this fence's shelves hang under, or -1 for a fence
      // with none. Computed in one pass up front rather than discovered during
      // the loop, because the button has to be placed when its header is drawn
      // and the `attach:` line proving it is a Resources bar comes later.
      // Which titled header this fence's task table hangs under, on the same
      // reasoning as `shelfHeader`: the scope button is a section-level control
      // and belongs on the section's own strip rather than inside its body.
      const headerOwning = (keyword: string): number => {
        let seen = -1;
        for (const line of lines) {
          const kw = line.split("|")[0].split(":")[0].trim();
          if (kw === keyword) return seen;
          if (kw !== "header") continue;
          if (parseHeaderDirective(line.slice(line.indexOf(":") + 1).trim()).title) {
            seen++;
          }
        }
        return -1;
      };
      const scopeHeader = headerOwning("tasks-table");
      const shelfHeader = ((): number => {
        let seen = -1;
        for (const line of lines) {
          const kw = line.split("|")[0].split(":")[0].trim();
          if (kw === "attach") return seen;
          if (kw !== "header") continue;
          if (parseHeaderDirective(line.slice(line.indexOf(":") + 1).trim()).title) {
            seen++;
          }
        }
        return -1;
      })();

      // WHERE EACH CELL OF THE ROW ENDS, as the number of children the block
      // had when the dispatcher met the delimiter. 4.4 §1, and `cellPlan` says
      // why it is a count rather than a node: a directive may append nothing,
      // so "the child before this line" is not always a child of this line.
      const cellBounds: CellBound[] = [];

      // AND WHERE EACH PAGE OF THE GROUP ENDS (4.34 §2). `cellBounds`' shape
      // exactly — a count of children rather than a node — because a `tab` above
      // a directive that draws nothing has the identical problem a `cell` there
      // has, and it has one answer.
      const tabBounds: number[] = [];

      // The widgets a head can be put above, paired with the name to put in it.
      //
      // RECORDED AT THE APPEND, because that is the only place both halves are
      // in hand: the element and the directive `kind` that produced it. A pass
      // afterwards would be reading classes to guess at directives, which is the
      // shape `blockTitle` exists to avoid one level up.
      const named: { el: HTMLElement; title: string }[] = [];

      // WHICH LINE DREW WHICH CHILD, as the number of children the block had
      // when the dispatcher reached that line. 4.8 §1.4.
      //
      // THE SHAPE `cellBounds` ALREADY USES, and taken at the TOP of the loop
      // for the reason it has to be: nearly every arm below ends in `continue`,
      // so anything recorded at the bottom would be recorded for the arms that
      // happen not to. A count taken on the way in is exact whatever the arm
      // does — including drawing nothing, which leaves no child to claim and no
      // claim on the next line's child.
      const drawn: { at: number; line: number }[] = [];

      for (const [n, line] of lines.entries()) {
        drawn.push({ at: container.childElementCount, line: lineAt[n] });
        const kind = line.split("|")[0].split(":")[0].trim();

        // The cell delimiter draws nothing and dispatches nothing — it records
        // a position and steps aside. Taken before every other arm so it can
        // never reach `buildFromSpec` as an unknown keyword.
        if (kind === CELL_KEYWORD) {
          // The weight comes from the same line, read through the grammar
          // rather than off the text — `parseCells` has already refused
          // anything that is not a width, so `?? 1` is the delimiter with no
          // value rather than a fallback for a bad one.
          if (cellSpec.cells) {
            cellBounds.push({
              at: container.childElementCount,
              weight: cellWeightOf(line) ?? 1,
            });
          }
          continue;
        }

        // The page delimiter, on the same terms and taken in the same place: it
        // draws nothing, dispatches nothing, records a position and steps aside.
        // Before every other arm so it can never reach `buildFromSpec` as an
        // unknown keyword.
        if (kind === TAB_KEYWORD) {
          if (tabSpec.tabs) tabBounds.push(container.childElementCount);
          continue;
        }

        // `header:<emoji + title>` — render a full-width header bar that
        // carries the section title on the left and anchors the following
        // simple widgets (buttons/pickers, or a links row) to the right. This
        // replaces the old "markdown heading + loose button row" pairing with
        // one unified component on the home, review and journal dashboards.
        if (kind === "header") {
          // `header:<title>` or `header:<level>:<title>` where level is 1 or 2.
          // Level controls both styling (1 = container, 2 = nested/indented)
          // and collapse scope: collapsing a level-1 bar hides following blocks
          // until the next bar of level ≤ 1, so a level-1 "Journals" bar folds
          // away its level-2 type bars too, while a level-2 bar folds only its
          // own body. Unprefixed defaults to level 1.
          const { level, title } = parseHeaderDirective(
            line.slice(line.indexOf(":") + 1).trim()
          );
          // A title-less `header:` anchors its widgets under the section's
          // existing markdown heading (used by Study / custom journals, whose
          // `###` heading is a structural boundary that has to stay). A titled
          // `header:<text>` carries its own title (home / review dashboards).
          //
          // CLICK-TO-EDIT SINCE 3.18 follow-ups §2. The title slot is handed to
          // `attachHeaderRename`, which rewrites this very line — the bar knows
          // which header it is because it IS that header, which is the ambiguity
          // the section editor's title box could not resolve and the reason that
          // box now points here. Rendered through `titleRender` so the slot, its
          // truncation and its alignment stay the frame's.
          //
          // COUNTED BEFORE THE FRAME IS BUILT, because the count is what
          // identifies the line: `headerIndex` is this bar's position among the
          // TITLED headers of this fence, in render order, which is exactly the
          // order `headerTitleSpan` re-derives from the file.
          const site: HeaderSite = {
            bounds: boundsOf(ctx, el),
            index: headerIndex,
            title,
          };
          if (title) headerIndex++;
          const frame = sectionFrame(container, {
            title,
            level,
            untitled: !title,
            ...(title
              ? {
                  titleRender: (slot: HTMLElement) =>
                    attachHeaderRename(this.plugin, slot, ctx, site),
                }
              : {}),
          });
          if (title) {
            // A titled bar owns its section: make it collapse everything after
            // it up to the next same-or-higher-level bar, with persisted state.
            //
            // The fold key is built from the DIRECTIVE's title, glyph and all,
            // which is why `title` is passed here rather than the split text —
            // changing it would orphan every section a reader has folded.
            ctx.addChild(
              new HeaderBar(
                this.plugin,
                frame.root,
                el,
                ctx.sourcePath,
                title,
                level
              )
            );
          }
          // THE SECTION'S OWN ACTION, HOSTED RATHER THAN DIRECTED (3.18
          // follow-ups §1). "Add category" is a Resources-section action that
          // used to sit in the attach widget's toolbar, on every shelf — three
          // times on Study's Topic index. It cannot be written as a `button:`
          // directive because those resolve to registered create-actions and
          // this one acts on the note's own fence, so the bar hosts it instead.
          //
          // ON THE HEADER THAT OWNS THE SHELVES, not on every header in the
          // fence: `shelfHeader` is the index of the last titled header before
          // this fence's first `attach:` line, which is the bar the shelves
          // actually render under. A fence with no `attach:` gets nothing.
          if (title && shelfHeader === headerIndex - 1) {
            frame.actions.appendChild(buildAddCategoryButton(this, ctx));
          }
          // The task table's scope button, on the bar rather than inside the
          // table (3.19.2). Drawn here, by the processor, because the table is
          // a LiveWidget that rebuilds its whole subtree on any change under
          // its folder — a control it owned but parented into this bar would be
          // duplicated on every rebuild. It stays correct without being rebuilt
          // because cycling rewrites the directive and the note repaints.
          if (title && scopeHeader === headerIndex - 1) {
            const line = lines.find(
              (l) => l.split("|")[0].split(":")[0].trim() === "tasks-table"
            );
            const rest = line?.slice(line.indexOf(":") + 1) ?? "";
            const scope = tasksScopeFor(
              this.plugin,
              line && line.includes(":") ? rest : "",
              ctx
            );
            if (scope) buildScopeCycle(frame.actions, scope);
          }
          // Following widgets flow into this group; keep it as `bar`.
          headerGroup = frame.actions;
          bar = headerGroup;
          continue;
        }

        // Boolean trackers don't become cells of their own — they become
        // chips in one shared Habits cell. Intercepted before buildFromSpec
        // because the generic label wrapper is precisely what the chip
        // replaces: the tracker's name belongs *in* the chip, not in an
        // eyebrow above a lone checkbox.
        if (kind === "tracker") {
          const habit = this.habitTrackerFor(line, ctx);
          if (habit) {
            if (!bar) {
            bar = openActionsBar();
          }
            bar.addClass("ca-journal-tracker-bar");
            trackerBar = bar;
            if (!habitsCell || habitsCell.parentElement !== bar) {
              habitsCell = this.habitsCell();
              bar.appendChild(habitsCell);
            }
            // An inline `tracker:<id>|Label` override names the chip, exactly
            // as it would have named the eyebrow. A bare trailing `|` names
            // nothing, so it falls back rather than producing a nameless pill.
            const barIdx = line.indexOf("|");
            const override =
              barIdx === -1 ? "" : line.slice(barIdx + 1).trim();
            const label = override || habit.label || habit.id;
            buildHabitChip(this, habitsCell, habit, label, line, ctx);
            continue;
          }
        }

        const widget = this.buildFromSpec(
          line,
          ctx,
          scopeHeader === headerIndex - 1,
          fenceTitled
        );

        if (!widget) {
          bar = null;
          headerGroup = null;
          // A directive this plugin used to ship is not a typo and the note is
          // not broken — it is old. `year-nav` was retired into the Yearly
          // Overview banner in 2.52, and a red "Unknown ChronoAnvil widget" with no
          // hint of what replaced it is the worst of both readings. Say what
          // happened and name the command that fixes it.
          const retired = RETIRED_WIDGETS[keywordOf(line)];
          container.createSpan({
            cls: retired ? "ca-journal-widget-retired" : "ca-journal-widget-error",
            text: retired
              ? `${keywordOf(line)} was retired in ${retired.since} — ${retired.note}. Run "Set up / repair vault" to update this note.`
              : `Unknown ChronoAnvil widget: ${line}`,
          });
          continue;
        }

        // A links row, or the period navigator, directly under a header
        // anchors into the header bar rather than becoming its own full-width
        // block — they read as the header's own controls, matching the layout
        // of a diary entry's top bar.
        if ((kind === "links" || kind === "period-nav") && headerGroup) {
          headerGroup.appendChild(widget);
          continue;
        }

        // A standalone links card (`links:…#diary`) is its own full-width block
        // — the titlebar-capped bar up under the spacer — not a passenger in a
        // widget bar. Detect it by the card class buildLinks sets for the
        // area-titled form and append it straight to the container.
        if (kind === "links" && widget.hasClass("ca-journal-links-card")) {
          bar = null;
          headerGroup = null;
          container.appendChild(widget);
          continue;
        }

        // The date navigator, directly under a links card, joins that card's
        // pill row rather than becoming a block of its own — the same tuck the
        // `headerGroup` case above performs, for the surface that has a links
        // card instead of a header bar.
        //
        if (!INLINE_KINDS.has(kind)) {
          bar = null;
          headerGroup = null;
          overviewHost = null;
          // ── A HEAD IS NOT A BANNER, AND TAKES NONE OF ITS CHROME (4.51.6) ──
          //
          // These three flags choose the block's CARD — the accent wash of
          // `.ca-journal-page-banner`, the slim band of the other two. While the
          // bar is on, the same three directives draw the page head instead,
          // and a head in a banner's card is the furniture this release was
          // asked to remove: *"the old Banner Sections need to be completely
          // remade into stylistic property/page titles."*
          //
          if (BANNER_KINDS.has(kind)) {
            pageHead = widget;
          }
          // The three flags above and `BANNER_KINDS` are one fact told twice —
          // which of them a block drew, and whether it drew any. They are kept
          // apart because the flags choose CHROME (three classes, three looks)
          // and the set answers a question about the block's NAME.
          // A fence holding a period summary is a masthead, and the card
          // belongs to the fence rather than to the summary — one fence is one
          // container, which is the whole of 3.2. Set before the append so a
          // grain whose summary fails to build still gets the frame.
          if (OVERVIEW_KINDS.has(kind)) {
            isOverviewCard = true;
            overviewGrain = kind.replace(/-summary$/, "") as PeriodGrain;
            if (rowSpec.row && kind !== "level-cards") {
              overviewHost = container.createDiv({
                cls: "ca-journal-card ca-journal-overview-card",
              });
              overviewHost.appendChild(widget);
              if (SECTION_TITLES[kind]) {
                named.push({ el: overviewHost, title: SECTION_TITLES[kind] });
              }
            } else {
              container.appendChild(widget);
              if (SECTION_TITLES[kind]) {
                named.push({ el: widget, title: SECTION_TITLES[kind] });
              }
            }
          } else {
            container.appendChild(widget);
            if (SECTION_TITLES[kind]) {
              named.push({ el: widget, title: SECTION_TITLES[kind] });
            }
          }
        } else {
          if (!bar) {
            bar = openActionsBar();
          }
          // `tracker:` directives are the daily-note logging modules (Mood,
          // steppers, times, selects); the `sleep` directive is the coupled
          // Wake-Up + Bedtime built-in module. Both are daily-note logging
          // cells, so tag each and promote its bar to a grid — they render as
          // bordered, equal-height/width cells that reflow cleanly, without
          // disturbing header/dashboard bars, which carry buttons/links rather
          // than logging widgets.
          if (kind === "tracker" || kind === "sleep") {
            widget.addClass("ca-journal-tracker-cell");
            bar.addClass("ca-journal-tracker-bar");
            attachTrackerRemove(this, widget, line, ctx);
            trackerBar = bar;
          }
          bar.appendChild(widget);
        }
      }

      // Every logging grid gets the add tile, including grids in notes that
      // predate it — the note needs no migration to gain the control.
      //
      // A block that declares a marked region but currently holds no trackers
      // gets an empty grid carrying just the tile. Without this the control is
      // a directive's passenger in practice: removing the last tracker took the
      // button with it and left no way back, which is the trap the comment
      // above was written to avoid. It is also what a monthly review needs —
      // its region ships empty until there are monthly tracker defaults to fill
      // it, and an empty region with no way to add to it is a dead end.
      if (!trackerBar && hasTrackerRegion && !isManagedTemplate(this.plugin, ctx.sourcePath)) {
        trackerBar = container.createDiv({
          cls: "ca-journal-widget-bar ca-journal-tracker-bar",
        });
      }
      if (trackerBar && !isManagedTemplate(this.plugin, ctx.sourcePath)) {
        trackerBar.appendChild(buildTrackerAddCell(this, ctx));
      }



      // The entry card's footer — the date stepper and the entry's `⋯`, 3.7.
      //
      // LAST, AND THAT IS THE WHOLE POINT. The controls used to be a second row
      // inside the header band, so the card read title → controls → grid and its
      // chrome sat in the middle of the thing it acts on. Appending here puts it
      // under the grid AND under the add-tile, which is the same place the
      // overview masthead has kept its own footer since 3.6 patch 7.
      //
      // A SIBLING THE POSTPROCESSOR OWNS, for the reason the overview footer
      // records: `entry-header` is a LiveWidget, so anything parented into its
      // subtree is deleted on the next frontmatter change. The header no longer
      // builds these controls at all — it hands back a band with the title in
      // it — so there is nothing here to reparent and nothing to stack up.
      // ── THE PAGE-CONTEXT STRIP, ON THE TRACKER BLOCK (4.21) ─────────
      //
      // It was the entry BANNER's footer until 4.21 — the stepper and the `⋯`
      // under the logging grid. 4.20 moved the grid into a section of its own
      // and 4.21 finished the thought: the banner is the file's name, its
      // navigation and the cog, so the alias and the stepper went with the grid
      // rather than being left behind in a band that no longer holds anything
      // they belong to. The cog went the other way, up into the banner.
      //
      // ON THE TRACKER BLOCK, WHICH IS WHY THIS IS KEYED ON `hasTrackerRegion`
      // RATHER THAN ON THE BANNER. On a note composed by 4.20 or later they are
      // two blocks; on every entry that already exists the markers are still
      // inside the banner's fence, so the strip lands there — the same place it
      // has always been drawn, on the same note it has always been drawn on.
      // One condition, both shapes, and nothing to migrate.
      //
      // A SIBLING THE POSTPROCESSOR OWNS, unchanged: `entry-header` is a
      // LiveWidget, and the alias editor writes frontmatter, so a control
      // parented into its subtree would delete itself mid-edit.
      // AND ONLY ON A DIARY ENTRY. `hasTrackerRegion` is true on a journal note
      // too — 4.20 gave that surface a tracker section as well — and an entry's
      // strip would tell it which day it was. `entryContextFor` is the same
      // question `section-insert.ts` asks to decide which catalogue a note has,
      // so the two cannot disagree about what an entry is.
      if (
        hasTrackerRegion &&
        this.plugin.sections.entryContextFor(ctx.sourcePath) &&
        !isManagedTemplate(this.plugin, ctx.sourcePath)
      ) {
        const strip = buildEntryContext(this.plugin, ctx, true);
        // PREPENDED ON THE NEW SHAPE, APPENDED ON THE OLD ONE, and the two are
        // the same decision rather than a special case. On a note composed by
        // 4.20 or later this block is the tracker section and the strip is its
        // HEAD; on every entry that already exists the markers are still in the
        // banner's fence, so this block is the banner and the strip is the
        // FOOTER it has been since 3.7 — under the grid, where that release put
        // it. Neither reader sees anything move.
        if (strip) {
          if (pageHead) pageHead.insertAdjacentElement("afterend", strip);
          else container.prepend(strip);
        }
      }

      // AND THE JOURNAL NOTE'S OWN, which says its level and its kind.
      //
      // ── AND NOT A FOLD BAR OF ITS OWN (5.10) ──────────────────────────
      //
      // What stood here between 5.8 and 5.10 was `buildTrackerSectionHead`: a
      // private collapse bar with the chevron on the LEFT, an uppercase
      // micro-label and no hairline — which is the bar a `note:` FIELD wears,
      // built in a file that is not section-frame.ts. It was added as a
      // fallback for notes that carry no `header:` line over their trackers,
      // and it solved that by giving the vault two looks for one object: a
      // proper section bar on a note composed by 5.9 or later, a field bar on
      // every older one.
      //
      // THE CATALOGUE IS WHERE THE TITLE COMES FROM. `journal-sections.ts`
      // emits `header:📊 Trackers`, so the section folds, aligns and reads like
      // every other one; and a note composed before that is REPAIRED rather
      // than decorated — `missingSoloBar` reports the absent bar to the Section
      // Editor and writing it adds the one line. A reader gets the same object
      // on both notes, and gets told it changed.
      //
      // `buildJournalContext` came out with the fallback and comes back with
      // it. It was never the thing being replaced; it was standing in the spot
      // the fallback wanted.
      if (hasTrackerRegion && !isOverviewCard) {
        const facts = buildJournalContext(this.plugin, ctx);
        // Under the head, for the reason one block up.
        if (facts) {
          if (pageHead) pageHead.insertAdjacentElement("afterend", facts);
          else container.prepend(facts);
        }
      }

      // ── THE ROW, LAID OUT AFTER THE LOOP ────────────────────────────
      //
      // Everything above is unchanged by the modifier, exactly as it is by
      // `frame:`: the same widgets, built in the same order, into the same
      // container, with the same live children. `layOutRow` moves what it finds
      // into cells and knows nothing about what any of them are — see row.ts for
      // why a section bar is not one of them.
      //
      // BEFORE THE FRAME, so a `frame: section` row goes into the section's body
      // as one row rather than as a column of cells.
      //
      // AND EVERY WIDGET IN A ROW GETS ITS OWN CARD FIRST. `cardWidget` wraps
      // in place — one wrapper where one widget was — so the block still has
      // the same number of children in the same order and `cellPlan`'s recorded
      // counts still point at the same boundaries. Wrapping AFTER the row would
      // have to find the widgets again inside the cells; wrapping before is the
      // same operation with nothing to look up.
      // AND EVERY CHILD IS TOLD WHICH LINE IT CAME FROM, before either of them
      // moves it. `stampLines` reads the counts taken during the loop against
      // the children as they stand now — which is the last moment the two agree,
      // since `layOutRow` is about to move them into cells and `cardWidget` is
      // about to put a wrapper where a widget was.
      stampLines(container, drawn, rawLines.length);

      // AND EVERY SIZED CARD IS TOLD ITS HEIGHT (4.22 §3.1), between the two,
      // and the order is load-bearing in both directions. AFTER the cards,
      // because the height belongs to the CARD — `cardWidget` copies the
      // widget's `data-ca-line` onto the wrapper it builds, so by now the card is
      // the stamped thing and there is nothing to look up. BEFORE the row,
      // because after it the children have been moved into cells and the walk
      // would have to find them again — the same sentence the comment above
      // already makes about `cardWidget` itself.
      if (rowSpec.row) {
        for (const { el, title } of named) cardWidget(el, title);
        applyCardHeights(container, rawLines);
        // AND WHERE THE READER LEFT IT, on a group that has pages (4.34 §4).
        //
        // THE KEY IS ASKED FOR HERE AND NOWHERE ELSE. `blockIndexAt` needs the
        // note's text and this block's place in it; both are on the render
        // context, and a group with no `tab` line never asks — so a page of
        // ordinary blocks does no segmenting it did not do before.
        // A HANDLE ON EVERY GROUP, not only on one that already has pages —
        // the `+` in the foot is how the first page gets made, so a group with
        // no `tab` line is exactly where it has to be offered. Resolving the
        // note position stays behind `count > 1` inside `tabHandle`, so an
        // ordinary page of groups still segments nothing.
        layOutRow(
          container,
          cellBounds,
          tabBounds,
          tabHandle(this.plugin, ctx, container, tabBounds.length + 1)
        );
      }

      // ── THE ENTRY BANNER'S BANDS, IN BANNER ORDER (4.21.1) ──────────
      //
      // THE NAME LEADS. An entry's fence composes `links:` above `entry-header`
      // and has since 3.2, so the pill row was drawn first and the note's name
      // sat under it — while the page banner drew its name first and welded its
      // destinations below. 4.21.1 settled the arrangement one way for all three
      // banners, and this is where an entry gets it.
      //
      // IN THE DOM RATHER THAN IN THE MARKDOWN, and that is the whole reason
      // this is here instead of in `entry-sections.ts`. Swapping the composed
      // lines would need a migration — repair is additive-and-retired-only and
      // cannot move one — and until every note took it the vault would hold both
      // arrangements at once, which is the defect rather than the fix. Moving
      // the node keeps ONE arrangement on every entry ever written, changes no
      // file, and keeps reading order and tab order equal to what is on screen,
      // which a CSS `order` would not.


      // ── THE CHROME, CHOSEN AFTER THE LOOP ───────────────────────────
      //
      // Everything above is unchanged by the modifier: the same widgets are
      // built, in the same order, into the same container, with the same
      // controls and the same live children. A frame is a BORDER — changing it
      // is not a read-only mode, and nothing here may reach back into what was
      // drawn.
      // `card` is the default and is byte-identical to before the modifier
      // existed; `section` and `none` both withhold the composite class and
      // take `is-unframed` instead. The rule is `chromeClasses`, which is pure
      // and tested; this line is only its application.
      for (const cls of chromeClasses(frameSpec.frame, {
        entryBanner: false,
        overviewCard: isOverviewCard,
        studyBanner: false,
        pageBanner: false,
        trackerSection: hasTrackerRegion && !isOverviewCard,
      })) {
        if (!rowSpec.row || cls === "is-unframed") {
          container.addClass(cls);
        }
      }

      // ── AND THE MARK THAT WENT WITH THE OLD HEAD (4.11 → 5.2) ───────
      //
      // `if (wideSpec.wide) container.querySelector(".ca-jtc-card")…` stood here
      // and is deleted. It stopped setting the width in 4.45.1 — a reading view
      // unloads the first block of a long dashboard, so a `:has()` reaching up
      // from the card lost the page its width at the bottom of a scroll, and
      // `ui/page-width.ts` derives it from the FILE now and marks the view. What
      // kept the line alive after that was the cog's *Wide page* checkbox, which
      // read the class back off the card it was drawn on.
      //
      // Both ends of that are gone: `.ca-jtc-card` is `buildPageTitle`'s and
      // nothing has drawn it since 4.10, so this query has returned null on
      // every render for a year. The vault banner's cog asks its own marker
      // (`WIDE_PAGE_CLASS`, on the view) through the callback `sectionsMenuFor`
      // takes for exactly this reason.
      //
      // `wideSpec` IS STILL READ — it reports a malformed `wide` line above, and
      // `pageIsWide` answers the same question from the file for the width itself.

      if (frameSpec.frame === "section") {
        if (!hasTitledBar(lines)) {
          // THE WIDGET TITLES ITSELF, because `sectionFrame` requires a title and
          // a bare `month-summary` fence has none. The title comes from the
          // directive rather than from the modifier: `frame: section: 🗓 Today`
          // would strain a one-line grammar and put a colon inside a value, and
          // the string is the same one a catalogue would have written into a
          // `header:` anyway.
          //
          // WRAPPED AFTER THE FACT rather than built into, so the loop above
          // needs no knowledge of the frame at all. Moving rendered nodes is safe
          // — a `MarkdownRenderChild` is bound to its element, not to its parent,
          // and a LiveWidget rebuilds its own subtree wherever that subtree sits.
          const kind = lines.map((l) => l.split("|")[0].split(":")[0].trim())
            .find((k) => SECTION_TITLES[k]);
          if (kind) {
            const drawn = Array.from(container.children);
            const { body } = foldableSection(
              container,
              { title: SECTION_TITLES[kind], level: 1 },
              this.foldStore(),
              `${ctx.sourcePath}::frame:${kind}`
            );
            for (const node of drawn) body.appendChild(node);
          } else {
            // REFUSED OUT LOUD RATHER THAN DOWNGRADED. Falling back to `none`
            // here would render the block unframed and leave the reader looking
            // at a `frame: section` line that did nothing, with no way to tell
            // whether the modifier or the widget was at fault.
            container.createDiv({
              cls: "ca-journal-frame-error",
              text: "ChronoAnvil: nothing in this block can title its own section, so frame: section has no title to use. Add a header: bar instead, or use frame: none.",
            });
          }
        }
      }

      // ── THE HEAD AND ITS HANDLE, LAST OF ALL ────────────────────────
      //
      // 4.7. After the row and after the frame, and the order is load-bearing
      // both ways: attached before `layOutRow` it would be a child of the block
      // when the cells are collected, and `isCellContent` would put the handle
      // in a column of its own. Attached last it is furniture on the block, the
      // way a section bar is — outside the row, outside the fold.
      //
      // THE TITLE IS READ OFF THE FENCE, not off what was drawn: `blockTitle`
      // names the block when the block is one nameable thing and says nothing
      // when it is three in a row. A block that drew its own bar is handed the
      // title anyway and ignores it — `hasOwnBar` is the DOM's answer and it
      // wins, because a section has already said what it is.
      //
      // AND A ROW NAMES ITS WIDGETS RATHER THAN ITSELF. Every widget in a row
      // now carries its own head, so a one-widget row would say the same thing
      // twice — once over the row and once inside it. The widgets keep the name
      // because they are what a reader is looking at; the block keeps the grip.
      //
      // Draws nothing when `getSectionInfo` cannot locate the block, which is
      // an embed, an export, or any render outside a live view.
      attachBlockHead(
        this.plugin,
        container,
        ctx,
        rowSpec.row ? null : blockTitle(lines),
        fixed,
        sectionFence
      );
    });

    // The Trends & Statistics section: a single ```chronoanvil-charts fence. Its
    // `chart:` directive lines drive a 2-per-row grid of chart tiles; an
    // optional leading `header:` directive turns the whole section into one
    // self-titled block — the title on the left, the Add / Edit… / Remove…
    // toolbar anchored on the right, in the same header bar the Journals'
    // Study section uses. Without that directive (older vaults whose Trends
    // title is still a separate ```chronoanvil header block above this one) the
    // toolbar renders on its own so the title isn't duplicated. Each chart is
    // drawn straight into its cell by chart-render.ts (Chart.js for line/bar,
    // plain DOM for the summary + calendar heatmap) — no Tracker plugin.
    this.registerBlock(
      "chronoanvil-charts",
      (source, el, ctx) => {
        const lines = source.split("\n");
        const specs = parseChartDirectives(lines);
        const headerLine = lines
          .map((l) => l.trim())
          .find((l) => l.startsWith(HEADER_PREFIX));
        const header = headerLine
          ? parseHeaderDirective(headerLine.slice(HEADER_PREFIX.length))
          : null;
        const container = el.createDiv({ cls: "ca-journal-widget-block" });
        buildChartGrid(this, container, specs, ctx, el, header);
        // A CHARTS FENCE IS A BLOCK LIKE ANY OTHER (4.7). It was the only one
        // on the homepage without a grip, and being last that also meant
        // nothing could be put below it — the two halves of the same omission,
        // reported from a vault. `blockCount` has always counted it; only the
        // gesture had not been attached.
        attachBlockHead(this.plugin, container, ctx);
      }
    );

    // A journal note's own charts section: a single
    // ```chronoanvil-journal-charts fence whose `jchart:` lines drive a stack of
    // trend / breakdown widgets under an Add / Edit… / Remove… toolbar. The
    // diary's section above and this one are deliberately parallel rather than
    // merged — see journal-charts.ts for why the two spec shapes stay apart.
    this.registerBlock(
      "chronoanvil-journal-charts",
      (source, el, ctx) => {
        const lines = source.split("\n");
        const specs = parseJournalChartDirectives(lines);
        const headerLine = lines
          .map((l) => l.trim())
          .find((l) => l.startsWith(HEADER_PREFIX));
        const header = headerLine
          ? parseHeaderDirective(headerLine.slice(HEADER_PREFIX.length))
          : null;
        const container = el.createDiv({ cls: "ca-journal-widget-block" });
        this.buildJournalChartStack(container, specs, ctx, el, header);
        attachBlockHead(this.plugin, container, ctx);
      }
    );
  }

  // The journal charts section: its header/toolbar plus the charts themselves.
  //
  // A STACK, NOT A GRID, and not for want of copying. The diary's tiles are
  // small comparable things two to a row; these two are not. A weakest-first
  // ranking is a horizontal bar chart whose whole readability is bar length,
  // and a trend at half width is a trend you squint at. So they render
  // full-width, one below the next, which is also exactly how the same two
  // widgets have looked since they were written by hand — nothing about the
  // way a chart appears changes by moving into the region.
  private buildJournalChartStack(
    container: HTMLElement,
    specs: JournalChartSpec[],
    ctx: MarkdownPostProcessorContext,
    blockEl: HTMLElement,
    header: { level: number; title: string } | null
  ): void {
    const buttons = [buildButton(this, "journal-chart-add", ctx)];
    // Edit… / Remove… resolve their target through a picker, so they are only
    // useful once a chart exists.
    if (specs.length > 0) {
      // One button, same as the diary's toolbar above — the editor it opens
      // carries the Delete. See buildChartGrid for why.
      buttons.push(buildButton(this, "journal-chart-edit", ctx));
    }

    if (header) {
      // The count is the number of charts this section actually holds, and it
      // is what stops a folded Charts section being opaque. Passed as a number
      // rather than as `null` because this caller genuinely knows — `specs` is
      // right here — which is the distinction the frame asks for.
      //
      // INTO `container`, AND BEFORE ITS BODY (5.10). The diary's grid carries
      // the argument in full; this is the same defect in the same shape, and
      // the two were introduced together. A journal note's Charts section was
      // drawing its Confidence widgets above its own title, and folding it hid
      // nothing, because the bar had no later siblings to hide.
      const frame = sectionFrame(container, {
        title: header.title,
        level: header.level,
        count: specs.length,
      });
      for (const btn of buttons) frame.actions.appendChild(btn);
      ctx.addChild(
        new HeaderBar(
          this.plugin,
          frame.root,
          blockEl,
          ctx.sourcePath,
          header.title,
          header.level
        )
      );
    } else {
      const toolbar = container.createDiv({ cls: "ca-journal-chart-toolbar" });
      for (const btn of buttons) toolbar.appendChild(btn);
    }

    if (specs.length === 0) {
      container.createDiv({
        cls: "ca-journal-chart-empty",
        text: CHART_GRID_EMPTY,
      });
      return;
    }

    // Each spec is turned back into the directive it stands for and built by
    // the ordinary directive path. THE point of the region: it manages a list,
    // it does not render. A chart added here and the same chart written by
    // hand are the same object, take the same refusal, and are live-scoped by
    // the same code — so there is no second implementation to drift, and no
    // way for the region to draw something a hand-written line could not.
    const stack = container.createDiv({ cls: "ca-journal-jchart-stack" });
    for (const spec of specs) {
      const widget = this.buildFromSpec(journalChartDirective(spec), ctx);
      if (widget) stack.appendChild(widget);
    }
  }

  // Build the Trends & Statistics section: its header/toolbar plus the chart
  // grid. When `header` is set the section is self-titled — the toolbar sits in
  // a collapsible header bar beside the title (the Study-section look);
  // otherwise the toolbar renders as a plain row beneath a separate title bar.

  // One chart tile: eyebrow label + the natively-rendered chart (or an in-tile
  // notice if the tracker is gone / not chartable).
  //
  // The tile's footprint is decided here and expressed as a class; the grid
  // geometry itself is CSS. `spanOf` returns the chart's own `+size=` when it
  // has one and derives it from the type and window length otherwise, so a long
  // trend takes the width and a long calendar heatmap takes the height. The
  // `small` case adds no class, which keeps the common tile's markup exactly
  // what it was.
  //
  // Note the size is decided per render, not stored: a `period` chart moved
  // from the weekly overview to the year dashboard resizes itself, because the
  // window it draws changed. That is the same live-rebuild path the charts
  // already use for their data.

  // The range control in a chart tile's own title bar.
  //
  // A CYCLE, not a dropdown, and the choice is about where the control lives
  // rather than about taste. Changing a chart's window was a five-step trip —
  // Edit…, pick the chart out of a list, find the Time range field, choose,
  // save — for the one setting a reader changes idly and often ("what did this
  // look like over the year?"). The other fields on that form are decisions you
  // make once when you create the chart; this is the one you poke at while
  // reading. So it comes out onto the tile, where the thing it changes is
  // visible while you change it.
  //
  // A cycle rather than a dropdown because there are at most five values, the
  // control has to fit beside an eyebrow label, and a select on a tile that is
  // one grid cell wide on mobile is mostly chevron. The button reads as the
  // current range, which is also information the tile did not previously
  // carry at all — two charts of one tracker over different windows looked
  // identical.
  //
  // It writes to the note. The range is part of the chart's directive, so a
  // window someone chose survives a reload the way every other chart setting
  // does; a transient view state would be a different feature that this button
  // would then be a confusing way to reach.

  // Resolve the period a "period"-ranged chart should follow, from the host
  // note's own frontmatter: `week-start` (weekly dashboard) → that ISO week's
  // Mon–Sun, `quarter-start` → that quarter, `year-start` → that year, or
  // `month-start` → that calendar month. Returns null only when the note is not
  // a period dashboard at all (e.g. a chart dropped on a plain note) —
  // resolveChartWindow then falls back to a plain 30-day window.
  //
  // Which property wins when a note somehow declares two is decided by
  // PERIOD_PROPERTIES in charts.ts, not here; see the invariant note there.
  // This used to be a chain of four `if` branches, which was fine while this
  // was the only caller — the chart editor is now a second one (it needs the
  // unit to show what size a chart will be given automatically), and the order
  // is shared rather than written out twice.

  // A period property's value as a moment, falling back to today when it's
  // blank or unparseable (same tolerance as the week/month summaries).

  // Public as part of NoteRegionHost — see the note at the top of
  // note-regions.ts. The body-region widgets need to find the file they are
  // rendered into, and an interface cannot be satisfied by a private member.
  fileOf(ctx: MarkdownPostProcessorContext): TFile | null {
    const f = this.app.vault.getAbstractFileByPath(ctx.sourcePath);
    return f instanceof TFile ? f : null;
  }

  // Wrap a frontmatter-driven builder in a host element that re-renders when
  // the note's *own* metadata changes. Used for the week / month summaries
  // so picking a different period updates them live.

  // Wrap a cross-file aggregation builder (topics-table, confidence-summary,
  // tag-index) in a host that re-renders when *any* file under `scopeFolder`
  // changes — logging a lesson has to refresh the subject's Topics table,
  // not just the host note itself.
  //
  // Takes one folder or several: the Journals hero aggregates across every
  // registered journal type's root at once, so a single-scope signature would
  // leave it live only for whichever root it happened to name.

  // Wrap a retrieval widget (search / on-this-day / timeline) in a host scoped
  // to *both* entry folders. These read the whole diary rather than one folder,
  // and a monthly review is as searchable as the days it summarises, so a
  // single-folder scope would leave half the index stale on screen.
  //
  // Debounced harder than the default: these repaint by re-reading the index,
  // and the edit that triggers a repaint is usually the user typing in an entry
  // in a neighbouring pane. 600ms keeps that from re-reading on every keystroke
  // while still feeling live when they stop.
  //
  // `alsoHost` additionally refreshes when the *host* note changes. The year
  // view needs it: its picker rewrites this note's `year-start` property, and
  // without watching the host that write would move the charts (which read the
  // property directly) while leaving the summary showing the old year.

  // Wrap a builder that reads one *other* file in a host that re-renders when
  // either that file or the host note changes. The events note is the case
  // this exists for: an upcoming list on the homepage has to notice an event
  // added from the calendar three sections above it, and neither of the other
  // two wrappers covers "watch a single file that isn't mine".

  // Public because the extracted controls in ./controls.ts take a WidgetHost
  // rather than the whole class, and an interface cannot be satisfied by a
  // private member. The pair is the entire contract those builders have with
  // this class; see the note at the top of controls.ts.
  currentValue(
    ctx: MarkdownPostProcessorContext,
    prop: string
  ): unknown {
    const file = this.fileOf(ctx);
    if (!file) return undefined;
    return frontmatterOf(this.app, file)[prop];
  }

  async write(
    ctx: MarkdownPostProcessorContext,
    prop: string,
    value: string | number | null
  ): Promise<void> {
    const file = this.fileOf(ctx);
    if (!file) return;
    // Writing Wake-Up or Bedtime re-derives the coupled Sleep value in the same
    // frontmatter transaction, so hours-asleep is always consistent with the
    // two times it's computed from (and never lags a cache pass).
    const wake = getBuiltinTracker(this.plugin, "wake");
    const bed = getBuiltinTracker(this.plugin, "bed");
    const affectsSleep = prop === wake?.id || prop === bed?.id;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      if (value === null || value === "") delete fm[prop];
      else fm[prop] = value;
      if (affectsSleep) recomputeSleepInFrontmatter(this.plugin, fm);
    });
  }

  // Entry point for the legacy inline-code syntax: `chronoanvil:kind:...`.
  private build(
    text: string,
    ctx: MarkdownPostProcessorContext
  ): HTMLElement | null {
    // Strip whichever prefix the span actually carries — the legacy `almanac:`
    // is four characters shorter, so slicing a fixed width would eat the first
    // four characters of the directive itself.
    return this.buildFromSpec(text.slice(text.indexOf(":") + 1), ctx);
  }

  // Entry point for the ```chronoanvil block syntax: one directive per line,
  // no "chronoanvil:" prefix needed since the fence already scopes it. Shared
  // with the legacy path above. Grammar: `kind:rest[|Label]`. The label is
  // optional and only meaningful for slider/time/date/select — buttons and
  // the composite widgets (nav/calendar/month-summary) carry
  // their own labels/headers.
  private buildFromSpec(
    spec: string,
    ctx: MarkdownPostProcessorContext,
    // True when this fence's header bar is already drawing the widget's own
    // section-level controls. Only `tasks-table` reads it today; it is a
    // parameter rather than state because the answer is per DIRECTIVE, not per
    // fence — a fence may hold a hosted table and an unhosted one.
    hostedScope = false,
    // True when a titled `header:` bar in this fence already names the block.
    // A widget that draws its own head withholds it — see the note at
    // `fenceTitled`, which is where this is decided.
    fenceTitled = false
  ): HTMLElement | null {
    const barIdx = spec.indexOf("|");
    const label = barIdx === -1 ? null : spec.slice(barIdx + 1).trim();
    const body = barIdx === -1 ? spec : spec.slice(0, barIdx);

    const colon = body.indexOf(":");
    const kind = colon === -1 ? body : body.slice(0, colon);
    const rest = colon === -1 ? "" : body.slice(colon + 1);

    // `tracker:<id>` carries no inline args — its label defaults to the
    // one set in Settings → Trackers unless the note overrides it with
    // `tracker:<id>|Custom Label`.
    const effectiveLabel =
      label ?? (kind === "tracker" ? getTracker(this.plugin, rest.trim())?.label ?? null : null);

    // A logging module that doesn't belong on this kind of entry draws as a
    // refusal rather than as a working control. The picker won't create one
    // (entry-trackers.ts::trackerOptions), but a note can still hold one: it
    // was hand-written, pasted from another entry, or was legitimate until the
    // tracker's surface changed in Settings.
    //
    // The refusal is deliberately visible and inert rather than silent. Hiding
    // it would leave a property in the frontmatter with no sign of where it
    // came from; drawing it would let the entry keep writing a value into a
    // series that can't hold it. What it must never do is delete anything —
    // the × on the cell removes the widget and keeps any reading already
    // logged, which is the existing, safe path out.
    if (kind === "tracker" || kind === "sleep") {
      const surface = noteSurfaceOf(this.app, this.plugin, ctx.sourcePath);
      const trackers = this.plugin.settings.trackers;
      if (surface != null && !directiveAllowedOn(trackers, body, surface)) {
        // No label wrapper: the message names the tracker itself, and a
        // labelled refusal reads as a control that failed rather than a
        // widget that shouldn't be here.
        return createSpan({
          cls: "ca-journal-widget-error ca-journal-tracker-misplaced",
          text: describeSurfaceMismatch(
            trackers,
            body,
            surface,
            journalTypeNamer(this.plugin)
          ),
        });
      }
    }

    let widget: HTMLElement | null;
    switch (kind) {
      case "slider":
        widget = buildSlider(this, rest, ctx);
        break;
      case "spacer":
        // A deliberately inert top-of-note element. Written inline as
        // `chronoanvil:spacer` on line 0 so that when a note opens (or is clicked
        // from the navigator) the cursor spawns *here* rather than inside the
        // first ```chronoanvil fence — which would render that fence as raw source
        // ("expand" it). Inline (not a fenced block) so the cursor resting on
        // its own line only ever reveals a short code span, never a wall of
        // directives.
        //
        // QUIETENED, NOT REMOVED, WHERE THE VAULT BAR DRAWS (4.51.1). The
        // wordmark on a hairline is a top boundary, and with the bar above it
        // that is a second one — the first vault render shows both, stacked.
        //
        // BUT THE ELEMENT STAYS, because its primary job is not decoration: it
        // is *"where the cursor lands on open, so the first real ```chronoanvil
        // block below it isn't rendered raw"*. Deleting it would trade a
        // duplicate rule for a fence that expands into source the moment a note
        // is opened, which is the failure it was written to prevent.
        widget = buildSpacer(bannerSuppressed(this.plugin, ctx.sourcePath));
        break;

      case "time":
        widget = buildTimeOrDate(this, rest, ctx, "time");
        break;
      case "date":
        widget = buildTimeOrDate(this, rest, ctx, "date");
        break;
      case "select":
        widget = buildSelect(this, rest, ctx);
        break;
      case "note":
        // Free-text entry rendered as a real widget rather than an editable
        // callout. Unlike a `>[!focus]` callout in Live Preview — where
        // clicking places a cursor in the document and reveals/selects the
        // callout's own markup — this is a self-contained control: focusing it
        // selects nothing but the field. Its text persists to the note *body*
        // inside `<!--chronoanvil:key-->` markers (see notestore.ts), not
        // frontmatter, so long prose stays readable in the raw file. Not
        // live-wrapped: the box is the edit surface, so we don't rebuild it out
        // from under the cursor on every write. Full-width (a COMPOSITE_KIND).
        //
        // ── EXCEPT THE CAPTURE REGION, WHICH IS A LIST (4.28) ──────────
        //
        // Dispatched on the KEY rather than on a verb of its own, and that is
        // the decision worth defending. `note:capture#collapse:…|Captured` is
        // written into five template assets, three catalogue directives and a
        // dozen assertions that pin it byte for byte; a new verb would rewrite
        // all of them to change nothing a reader can see, because the region,
        // the key, the fold and the label all stay exactly as they were. What
        // changed is only how the same text is drawn.
        //
        // And the key IS the identity here: `constants.ts` gives capture its
        // own region precisely so it is not confused with prose written on
        // purpose, and this is that distinction becoming visible. The
        // precedent is one file over — `note-field.ts` already reads
        // `key === CAPTURE_NOTE_KEY` to decide the fold default.
        widget =
          noteKeyOf(rest) === CAPTURE_NOTE_KEY
            ? buildCaptureLog(this, rest, ctx, label, {
                collapsible: rest.includes("#collapse"),
                startCollapsed: () =>
                  noteFoldState(this.plugin, ctx.sourcePath, CAPTURE_NOTE_KEY),
                onFold: (v: boolean) =>
                  void setNoteFold(this.plugin, ctx.sourcePath, CAPTURE_NOTE_KEY, v),
              })
            : buildNote(this, rest, ctx, label);
        break;
      case "tasks":
        // ChronoAnvil's own task manager. Reads/writes real task lines stored in the
        // note body's `<!--chronoanvil:<key>-->` region (see tasks.ts for the line
        // format), rendered as an interactive list: checkbox, editable text,
        // priority + due controls, delete, and an add-input. Not the Tasks
        // plugin — self-contained, no external dependency.
        widget = buildTasks(this, rest, ctx, label, fenceTitled);
        break;
      case "path":
        // A re-orderable checklist rendered as a table: each step has a
        // checkbox, editable text, up/down move buttons, and a delete. Shares
        // the ChronoAnvil task line format and body region with `tasks:` (so a step
        // is just a ChronoAnvil task), but presents order as meaningful and gives
        // explicit reorder controls instead of priority/due. Used for a Topic's
        // Learning Path, where sequence is the point.
        widget = buildPath(this, rest, ctx, label);
        break;
      case "list":
        widget = buildList(this, rest, ctx, label);
        break;
      case "recall":
        // `recall:<key>[|Label]` — question/answer pairs over the same body
        // region the other content widgets use (see recall.ts for the line
        // format), rendered as cards whose answers are hidden behind a reveal.
        // Grading a card writes Confidence and stamps Last reviewed on the note
        // the cards belong to — which is what turns the review queue and the
        // confidence trend from things you feed by hand into things that feed
        // themselves.
        widget = buildRecall(this, rest, ctx, label);
        break;
      case "attach":
        // The multi-purpose attachments field: an image gallery plus a row of
        // link/file chips, over the same `<!--chronoanvil:<key>-->` body region the
        // other body-backed widgets use. Accepts dropped/pasted files, pasted
        // URLs, and links dragged in from the vault itself.
        widget = buildAttachments(this, rest, ctx, label);
        break;
      case "tracker":
        widget = buildTracker(this, rest, ctx);
        break;
      case "sleep":
        // Coupled Wake-Up + Bedtime control with a live "asleep / awake"
        // readout. Its own writes re-derive the Sleep property.
        widget = buildSleep(this, ctx);
        break;
      // EVERY DIARY GRAIN IS A SOURCE, so the scope is the diary root rather than
      // the daily folder: `scopesFor` decides which folder a tracker's readings
      // live in, and a monthly tracker's band must repaint when a monthly entry
      // is written. `sleep-summary` below can scope to `diaryDaily` because the
      // two built-ins it reads are daily by construction; this one cannot.
      case "tracker-stat":
        return liveScopedWidget(this.plugin, ctx, this.plugin.settings.paths.diaryRoot, () =>
          buildTrackerStat(this.plugin, rest)
        );
      case "sleep-summary":
        return liveScopedWidget(this.plugin, ctx, this.plugin.settings.paths.diaryDaily, () =>
          buildSleepSummary(this.plugin)
        );
      case "button":
        widget = buildButton(this, rest, ctx);
        break;
      // ── THE IN-NOTE BANNERS (4.51) ──────────────────────────────────
      //
      // NOTHING IS REWRITTEN AND NOTHING IS RETIRED. Both directives stay in
      // every note; while the vault bar is on, the FENCE drops their lines
      // before this switch is reached — see `drawable`, which reads
      // `BANNER_KINDS`. Turning the bar off restores every note exactly as it
      // was, which is what makes the release reversible, and it is why neither
      // word is in `RETIRED_WIDGETS`: an entry there is an instruction to
      // `planLayout` to REMOVE the word from a reader's note, which would
      // delete the fallback.
      //
      // A LATER RELEASE MAKES THESE A SMALLER SECONDARY BANNER rather than
      // deleting them, which is the other reason to leave the words alone.
      //
      // THE SUPPRESSION IS NOT HERE, AND 4.51.1 IS WHY. Returning `null` from a
      // case is how this switch says *unknown directive*, so the first cut drew
      // a red "Unknown ChronoAnvil widget: journal-header" where each banner had
      // been. A line with nothing to draw is a fact about the fence.
      case "entry-header":
      case "journal-header":
        return livePageHead(this.plugin, ctx);
      case "links":
        return buildLinksRegion(this.plugin, rest, ctx);
      case "period-nav": {
        // The weekly/monthly dashboards' date finder. Self-renders on its own
        // shifts/picks (and rebuilds with the note on any full re-render), so
        // it needs no live wrapper — which also keeps it inline in the header.
        //
        // ALL FOUR UNITS, as of 2.57.0. This read
        // `rest.trim() === "month" ? "month" : "week"` — a two-branch
        // conditional over a four-value set, so `period-nav:quarter` and
        // `period-nav:year` both silently built a WEEK navigator and wrote
        // `week-start` onto a quarter or year dashboard. periodnav.ts's own
        // header documents `period-nav:quarter`, and its META table has had
        // entries for all four the whole time; only the routing was narrow.
        // Same shape as the bug formatPeriodLabel was extracted for in 2.52,
        // one layer up.
        const arg = rest.trim();
        const unit =
          arg === "month" || arg === "quarter" || arg === "year" ? arg : "week";
        return buildPeriodNav(this.plugin, ctx, unit);
      }
      // `diary:N` ONLY, as of 3.11 §7.1. `calendar` and `calendar:agenda`
      // shared this case and were written by no shipped note in the plugin's
      // history — see RETIRED_WIDGETS.calendar.
      case "diary":
        return buildCalendarRegion(this.plugin, rest, ctx);
      case "events":
        return buildEventsRegion(this.plugin, rest, ctx);
      // ONE BUILDER, TWO DOORS (4.70). `upcoming:5` and `events:upcoming:5` are
      // the same list from the same function, so the widget a reader adds from
      // the section window cannot drift from the one already in their note. See
      // `WIDGETS.upcoming` for why it is a keyword rather than an argument.
      case "upcoming":
        return buildEventsRegion(
          this.plugin,
          `upcoming${rest.trim() ? `:${rest.trim()}` : ""}`,
          ctx
        );
      case "time-grid":
        // THE WHOLE VAULT IS THE SCOPE, and `""` is what that spells: the grid
        // reads events, every region-backed logbook and every task with a due
        // date, and those live wherever their notes do. `folderPrefix("")` is
        // the empty string, which matches every path — 4.44.0's fix, used here
        // deliberately rather than tripped over.
        return liveScopedWidget(this.plugin, ctx, "", () =>
          buildTimeGrid(this.plugin, rest, ctx)
        );
      case "year-summary":
        // Live on both the diary folders (the numbers) and this note (the
        // year-start property the picker rewrites).
        return liveDiaryWidget(this.plugin, ctx, () => buildYearSummary(this.plugin, ctx), true);
      case "diary-search":
        // Scoped to both entry folders: a new or edited entry has to change
        // what a search over it returns.
        return liveDiaryWidget(this.plugin, ctx, () => buildDiarySearch(this.plugin, ctx));
      case "on-this-day":
        return buildOnThisDayRegion(this.plugin, rest, ctx);
      case "timeline":
        return buildTimelineRegion(this.plugin, rest, ctx);
      case "week-summary":
        return liveFrontmatterWidget(this.plugin, ctx, () =>
          buildWeekSummary(this.plugin, ctx)
        );
      case "logbook":
        // THE DIARY'S UNDATED LAYER (4.52). `logbook:work` draws the items in
        // `02 - Diary/Logbooks/Work log.md` wherever the line is written, which
        // makes it the one region-backed widget that does not read the note it
        // sits on — see `writeRegionOf`.
        //
        // NOT LIVE-WRAPPED, and for the `note:` field's reason: the list is the
        // edit surface, so rebuilding it out from under an open card is the one
        // thing it must not do. It watches its own file instead, which is what
        // lets an item arriving from another pane appear without taking the
        // card the reader is typing in.
        widget = buildLogbook(this, rest, ctx);
        break;
      case "month-summary":
        return liveFrontmatterWidget(this.plugin, ctx, () =>
          buildMonthSummary(this.plugin, ctx)
        );
      case "quarter-summary":
        return liveFrontmatterWidget(this.plugin, ctx, () =>
          buildQuarterSummary(this.plugin, ctx)
        );
      case "period-recap":
        // Live over the diary roots AND this note, like `year-summary`: the
        // rollup is read out of the monthly entries, so editing one has to
        // repaint it, and the period it is scoped to lives in this note's own
        // frontmatter, which the banner's picker rewrites.
        return liveDiaryWidget(
          this.plugin,
          ctx,
          () => buildPeriodRecap(this.plugin, ctx, rest),
          true
        );
      case "entry-rollup": {
        // Scoped by the host note's period property, resolved inside the
        // build closure so a period-nav click re-reads it and repaints —
        // the same reason tasks-table resolves its bounds there rather
        // than once at first paint. Live over the entries' own folder, so
        // writing a focus into today's entry updates the rollup.
        //
        // `entry-rollup:month` GATHERS MONTHLY ENTRIES (3.11 §5); bare is
        // `daily` as it always was. The live folder follows the grain — a
        // month rollup watching the daily folder would never repaint when a
        // monthly entry changed, which is the bug that comes free with adding
        // an argument and forgetting the subscription under it.
        const grain = rollupGrainOf(rest);
        return liveScopedWidget(
          this.plugin,
          ctx,
          grain === "monthly"
            ? this.plugin.settings.paths.diaryMonthly
            : this.plugin.settings.paths.diaryDaily,
          () =>
            buildEntryRollup(
              this.plugin,
              resolvePeriodBounds(this.plugin, ctx),
              grain
            )
        );
      }
      // ONE QUESTION, ONE WIDGET, TWO SPELLINGS (4.16 §1). `level-index` asks
      // what is below a folder and draws whichever answer it gets; `topics-table`
      // is the older word for the same question asked of the host note, and it
      // keeps drawing because every shipped Subject index note carries it. It is
      // an `alias` in `NOT_PAGE_WIDGETS` rather than an entry in
      // `RETIRED_WIDGETS`, and §3 is emphatic about the difference: a retired
      // keyword is one `planLayout` REMOVES from a reader's note on repair, so
      // retiring a word that still renders would delete a working table.
      //
      // THE OLD WORD TAKES NO ARGUMENT and is handed `rest` anyway — which is
      // empty for every line that exists, and for a hand-typed `topics-table:x`
      // resolves through the same refusal any other bad scope gets rather than
      // being silently ignored.
      case "topics-table":
      case "level-index":
        return buildLevelIndexRegion(this.plugin, ctx, rest);
      // THE SAME QUESTION IN CARDS (4.36 §2). A keyword rather than an argument
      // on the line above, because that directive spends both pieces of its one
      // argument on a journal and a folder and the folder may hold slashes —
      // see the registry entry, which makes the case at length. The two share
      // `levelScope`, so an unresolvable argument reads the same either way.
      case "level-cards":
        return buildLevelCardsRegion(this.plugin, ctx, rest);
      // THE ONE BAND, AND THE TWO WORDS THAT STILL REACH IT (4.46 §5).
      //
      // `topic-stats` sits in every Study Topic index in every vault and
      // `journal-totals` in every Exercise Block index, so both go on
      // dispatching as aliases rather than being retired: an entry in
      // `RETIRED_WIDGETS` is an instruction to `planLayout` to REMOVE the word
      // from a reader's note, which would delete a working band. That is 4.16
      // §3's rule, and this is its third application.
      //
      // EACH ALIAS RESOLVES TO THE PRESET IT ALWAYS WAS. Neither old word took
      // an argument, so `rest` is empty for every line that exists on disk and
      // the preset comes from here — which is the only place that knows which
      // of the two spellings was written.
      case "topic-stats":
      case "journal-totals":
        // THE PRESET COMES FROM THE TABLE, NOT FROM HERE (4.46.1). It was two
        // string literals, which made this the second of three places that knew
        // what an old word means — and the third, the section editor's question,
        // had no way to know at all. `STATS_BAND_ALIASES` is the one copy.
        return buildStatsBandRegion(this.plugin, STATS_BAND_ALIASES[kind], label, ctx);
      case "stats-band":
        return buildStatsBandRegion(this.plugin, rest, label, ctx);
      case "kind-table":
        return buildKindTableRegion(this.plugin, rest, ctx);
      case "pages-table":
        return buildPagesTableRegion(this.plugin, ctx);
      case "confidence-trend":
      case "journal-chart":
        return buildJournalChartRegion(this.plugin, kind, rest, label, ctx);
      case "journal-breakdown":
        return buildJournalBreakdownRegion(this.plugin, rest, label, ctx);
      case "journal-tally":
        return buildJournalTallyRegion(this.plugin, rest, label, ctx, fenceTitled);
      case "review-queue":
        return buildReviewQueueRegion(this.plugin, rest, ctx);
      case "journal-search":
        return buildJournalSearchRegion(this.plugin, rest, ctx);
      case "journal-recent":
        return buildJournalRecentRegion(this.plugin, rest, ctx);
      case "tag-index":
        return buildTagIndexRegion(this.plugin, rest, ctx);
      case "tasks-table":
        // `hostedControls` — the header bar has already drawn the scope button,
        // so the table must not draw a second one. See `scopeHeader`.
        return buildTasksTableRegion(this.plugin, rest, ctx, hostedScope);
      case "activity-chart":
        return buildActivityChartRegion(this.plugin, ctx);
      case "title":
        return livePageHead(this.plugin, ctx);
      case "launcher":
        // A grid of places to go. `launcher` alone draws the default four;
        // `launcher:diary,search` draws those two. A LIST rather than a single
        // argument, so an unknown id costs its own tile and nothing else.
        return buildLauncher(
          this.plugin,
          ctx,
          rest.trim() ? rest.split(",") : LAUNCHER_DEFAULT
        );
      case "journals":
        // `journals` draws every journal as ONE card; `journals:cards` draws
        // one card PER journal, as a grid (4.2 §1). An argument rather than a
        // second keyword, because it is the same idea in a second arrangement
        // and §3 refuses a synonym — the grammar's `keyword[:argument]` slot
        // is exactly this, and `journals` had never used it.
        if (rest === "cards") return buildJournalCardsRegion(this.plugin, ctx);
        // REFUSED, NOT FALLEN BACK. `journals:card` singular quietly drawing
        // the list is the near-miss nobody debugs, because it reads as the
        // feature not working rather than as the word being wrong. `null`
        // reaches the dispatcher's own "unknown widget" notice, which names
        // the line it could not read.
        //
        // AND SINCE 4.15 THERE IS A WORD THAT WORKS. `journals:card` is what a
        // reader types when they want ONE journal, which is exactly what
        // `journal-card:<id>` now draws — so the refusal names it rather than
        // only declining. It stays a refusal: turning a spelling that has always
        // been rejected into a feature would hand a page to every vault that
        // ever typed it, which is not something anybody asked for.
        if (rest === "card") {
          return createDiv({
            cls: "ca-journal-widget-error",
            text: "journals:card isn't a directive. For every journal as one card use `journals`, for a grid of them use `journals:cards`, and for one named journal use `journal-card:<journal>`.",
          });
        }
        if (rest) return null;
        return buildJournalsRegion(this.plugin, ctx);
      case "journal-card":
        // ONE NAMED JOURNAL, AND A PAGE MAY HOLD SEVERAL (4.15 §4). The first
        // widget in the registry that `repeats`, which is a fact about the
        // SECTION MODEL rather than about this switch — nothing here counts
        // anything, because a second `journal-card` line is simply a second
        // line that draws a card.
        return buildJournalCardRegion(this.plugin, ctx, rest);
      case "journals-header":
        // BARE IS EVERY JOURNAL, AND STAYS SO (4.36 §3). The argument narrows
        // the band to one; without it the numbers and the strip cover every
        // registered journal exactly as they always have, so no note in any
        // vault renders differently for having been written before this.
        return buildJournalsHeaderRegion(this.plugin, ctx, rest);
      // The join, both ways (2.57.0). Two cases rather than one with a mode
      // argument: `bridge-notes` reads the index and `bridge-readings` reads
      // the tracker series, which are different stores with different caching,
      // and a single case would have made that a runtime branch instead of a
      // spelling the reader picks.
      case "bridge-notes":
        return buildBridgeNotesRegion(this.plugin, rest, label, ctx);
      case "bridge-readings":
        return buildBridgeReadingsRegion(this.plugin, rest, label, ctx);
      default:
        return null;
    }

    // Widgets that draw their own label are skipped here, or they'd get a
    // second one. The generic wrapper is an inline span+control pair, so
    // missing this list is not a small cosmetic slip: a full-width block
    // widget gets a duplicate label AND collapses to content width inside the
    // flex column, which is what happened when `list` was added in 2.12 and
    // this was still a hand-maintained `kind === … ||` chain.
    if (!widget || !effectiveLabel || SELF_LABELLED_KINDS.has(kind))
      return widget;
    const labeled = createSpan({ cls: "ca-journal-widget-labeled" });
    labeled.createSpan({ cls: "ca-journal-widget-label", text: effectiveLabel });
    labeled.appendChild(widget);
    return labeled;
  }

  // chronoanvil:slider:Prop[:min:max:step]

  // chronoanvil:time:Prop  /  chronoanvil:date:Prop

  // chronoanvil:spacer — a full-width branded line, used inline on line 0 of a
  // note so the cursor lands here on open instead of inside the first ```chronoanvil
  // fence. Doubles as a light top boundary above the header block. The wordmark
  // is set via a data attr so it can be themed/overridden in CSS.

  // chronoanvil:note:Prop[:placeholder][|Label]
  //
  // A free-text field bound to frontmatter `Prop`. Meant to replace editable
  // callouts like `>[!focus]` for user-entered prose: focusing it selects the
  // field only, never the surrounding note markup. Auto-grows to fit its
  // content and commits on blur / when focus leaves (the same `change`
  // semantics the time/date/select widgets use), so it never writes a
  // frontmatter transaction on every keystroke.

  // Debounced body writes live in their own object so the timer table has a
  // single owner — see ./note-write-scheduler.ts.
  readonly noteWrites = new NoteWriteScheduler(this);

  // Atomic body write: read-modify-write the whole file, replacing just this
  // key's region. vault.process serializes concurrent edits, so two fields
  // writing near-simultaneously can't lose each other's content.
  //
  // AND IT NO LONGER OVERWRITES A CAPTURE THAT ARRIVED UNDERNEATH IT (4.27 §1).
  // `baseline` is the region text the caller's buffer was derived from. Anything
  // appended since then rides along after the value being written, so a field
  // that never saw the append cannot delete it. `test/capture.test.ts` has
  // asserted that loss since it was written and said in its own comment that
  // the fix belongs here — "never letting the field write a value older than
  // what's on disk" — rather than in `writeNoteRegion`, which is right to do
  // what it is told.
  //
  // THE RE-READ IS THE TEXT `vault.process` HANDS US, never a `vault.read`
  // before the call. Reading outside would re-open the read-modify-write window
  // `notestore.ts` warns about in `appendToNoteRegion`'s own header, and would
  // make the merge itself the race it exists to close.
  async writeNoteRegionToFile(
    ctx: MarkdownPostProcessorContext,
    key: string,
    value: string,
    baseline?: string
  ): Promise<void> {
    const file = this.fileOf(ctx);
    if (!file) return;
    await this.writeRegionOf(file, key, value, baseline);
  }

  // THE SAME WRITE, TO A FILE THE CALLER NAMES (4.52).
  //
  // Every region widget until now has written to the note it was drawn on, so
  // resolving the file from the ctx and doing the write were one method. A
  // `logbook:` widget breaks that: it is drawn on the homepage and writes to
  // `Work log.md`, because a logbook is a note and the widget is a view of it.
  //
  // SO THE FILE MOVED INTO THE PARAMETER AND THE MERGE STAYED HERE, rather than
  // the widget doing its own `vault.process`. The reconcile above is the only
  // thing standing between a list on screen and an append that arrived
  // underneath it, and a second write path would be a second place to forget
  // it — which is the fault 4.27 closed, re-opened by a caller instead of by a
  // line.
  async writeRegionOf(
    file: TFile,
    key: string,
    value: string,
    baseline?: string
  ): Promise<void> {
    await this.app.vault.process(file, (text) =>
      writeNoteRegion(
        text,
        key,
        baseline == null
          ? value
          : reconcileRegionWrite(readNoteRegion(text, key), baseline, value)
      )
    );
  }

  // Create an empty region for `key` if the file has none yet, so the raw body
  // carries a stable, hand-editable anchor even before anything is typed.
  async ensureNoteRegion(file: TFile, key: string): Promise<void> {
    await this.app.vault.process(file, (text) => {
      const next = ensureNoteRegions(text, [key]);
      return next ?? text;
    });
  }

  // Whether this entry's Captured log already holds a context note for one
  // scale reading (tracker + value). Async because captures live in the note
  // body, not the metadata cache; the picker calls it to decide whether to show
  // the pencil filled. Matched on tracker + value, so a note follows its
  // reading — move Mood 4→5 and the 4's note no longer counts as "this
  // reading's note" (it stays in the log as the record it is).

  // chronoanvil:list:<key>[:placeholder][|Label]
  //
  // A list of prose entries — one per line in the `<!--chronoanvil:<key>-->` region
  // (see entries.ts). Sits between `note:` and `tasks:`: `note:` is one blob of
  // free text, `tasks:` is a list of things with state, and this is a list of
  // things without any.
  //
  // It exists because a `note:` field renders a `<textarea>`, and a textarea has
  // no per-line DOM — so two highlights typed on two lines can only ever look
  // like one paragraph that happens to wrap. Separate rows need separate
  // elements, which means a different widget, not different CSS.
  //
  // Typing is deliberately identical to the textarea it replaces: type, press
  // Enter, keep typing. Enter commits the current row and opens the next one
  // rather than inserting a newline; Backspace at the start of an empty row
  // removes it and returns to the end of the previous one. There is no "add"
  // button because there is nothing to click — a trailing empty row is always
  // present and is where you start.

  // One entry row: a bullet and an auto-growing textarea. A textarea rather than
  // an input because an entry is a sentence and has to wrap; Enter is
  // intercepted so it never actually inserts the newline that would split the
  // entry in two.

  // chronoanvil:tasks:<key>[|Label]
  //
  // ChronoAnvil's self-contained task manager. Task lines live in the note body's
  // `<!--chronoanvil:<key>-->` region (hidden by the region-hider, so this widget is
  // the only way to see/edit them). The whole list is re-serialized and written
  // back on every mutation via vault.process (atomic), so concurrent field
  // writes can't clobber each other. The current model is held in a closure and
  // re-rendered locally after each change — the region is the source of truth on
  // load, the widget's model while open.

  // Render a single task row into `list`. Callbacks are wired by buildTasks so
  // this stays a pure view-builder. Priority is a 3-way cycle button; due is a
  // native date input; text is an inline editable field.

  // chronoanvil:path:<key>[|Label]
  //
  // A re-orderable checklist, for a Topic's Learning Path where the order of
  // steps is the content. Stored exactly like `tasks:` — ChronoAnvil task lines in
  // the note body's `<!--chronoanvil:<key>-->` region — so a step is a task and the
  // region round-trips through the same parse/serialize. The difference is
  // presentation: rows render as a table with explicit up/down move buttons
  // (order matters here, so it's a first-class control) and a delete, plus the
  // done checkbox and editable text. No priority/due controls: a learning path
  // is a sequence, not a due-dated backlog.

  // Render one Learning Path row as a table row. Pure view-builder; callbacks
  // are wired by buildPath. Move buttons disable at the ends (first row can't go
  // up, last can't go down) so the control communicates the boundary rather than
  // silently no-opping.

  // ── chronoanvil:recall:<key>[|Label] ────────────────────────────────────────
  //
  // Question/answer cards over a body region, with the answer hidden behind a
  // reveal. Grading a card writes Confidence and stamps Last reviewed on the
  // note the cards belong to.
  //
  // This is the widget the last two releases were built for. The review queue
  // schedules from Confidence and Last reviewed; the confidence trend plots
  // Confidence over time; and until now nothing wrote either one except the
  // reader, by hand, and the ✓ on a queue row (which stamps the date but has no
  // grade to record). One click that both tests you and updates the schedule is
  // what closes both loops.
  //
  // Two views, one region. Cards are the default because studying is what the
  // widget is for; the pencil flips to an editable list for authoring the deck.
  // Not two directives: a deck you cannot edit where you read it is a deck you
  // edit in the raw file, and the region is deliberately parked inside an HTML
  // comment where Obsidian won't render it.

  // Where a recall block's grades go, and whether they can go anywhere.
  //
  // Returns the note to write to plus the label to show for it, or a refusal
  // with the reason. The refusal case is real rather than defensive: a `recall:`
  // block on a Subject or Topic index resolves to that index, which carries no
  // `date` and whose `type` is not one of its journal's kinds — so a Confidence
  // written there is read by nothing. `confidenceStats` filters it out, and so
  // does the queue's `leafNotes`. Writing a property that nothing reads is worse
  // than declining to: it looks like it worked.

  // Write one sitting's verdict. Both properties resolve through the registry
  // (`confidenceProperty` and `reviewProperties` already do the same) rather
  // than being spelled out here, so a relabelled built-in doesn't leave this
  // writing a dead key — and both land in one processFrontMatter transaction,
  // because a note stamped reviewed without its new rating would be scheduled
  // off the old one.
  //
  // WHICH rating is the note's kind's business as of 2.36: a Lesson deck
  // grades into Confidence, a Practice deck into Accuracy. Same arithmetic,
  // same scale, different question — "did I remember this" against "did I get
  // these right" — and averaging the two gave a topic a number that meant
  // neither. `ratingPropertyOf` falls back to Confidence for any kind that
  // declares nothing, so a journal written before this is unchanged.

  // chronoanvil:attach:<key>[|Label]
  //
  // The multi-purpose attachments field. One body region (`<!--chronoanvil:<key>-->`,
  // the same store `note:` and `tasks:` use) holds a plain-markdown list of
  // links; this renders it as two zones — a thumbnail gallery for images and a
  // chip row for everything else — and accepts content four ways:
  //
  //   • drop files from the OS          → filed into the vault, linked, shown
  //   • paste an image from clipboard   → same, named from the pattern setting
  //   • paste a URL (or click Add link) → a link chip
  //   • drag a note/image from the vault → linked in place, nothing copied
  //
  // Everything written is ordinary markdown (`![[path]]`, `[[note]]`,
  // `[title](url)`) so the region stays meaningful without the plugin — see
  // attachments.ts for the grammar. Anything already in the region that isn't a
  // link (this field used to be a plain textarea) survives as a text chip
  // rather than being dropped on the first write.

  // One image tile: the thumbnail, its caption, and a ⋯ menu. Missing targets
  // render as a labelled placeholder rather than a broken image, so a moved or
  // deleted file is obvious and still removable.

  // One non-image chip: vault files/notes, hyperlinks, and the free-text lines
  // an older `note:`-backed field may have left in the region.

  // Drag-to-reorder. The custom MIME type is what tells the zone's drop
  // handler "this is my own tile moving" rather than an incoming file.

  // The per-item ⋯ / right-click menu.

  // Open an attachment: a hyperlink goes to the browser, a vault file opens in
  // Obsidian. Unsafe schemes (a hand-edited `javascript:` line) are refused.

  // Resolve a vault link target (full path, shortest-form link, with or
  // without extension) to a file, relative to the host note.

  // Write a dropped/pasted/picked file into the vault and return it. The
  // destination follows Settings → Attachments: ChronoAnvil's own folder tree, the
  // vault's own attachment setting, or beside the note.

  // Pick (and create) the folder a new attachment goes in, then resolve a
  // free file name inside it.

  // "Remove and delete file": confirm (unless turned off), move the file to
  // the trash per the user's Obsidian deletion preference, and report whether
  // the caller should drop the item from the list.

  // A full-bleed image viewer. Only images are navigable, so the gallery's own
  // order is what the arrows follow. Built on demand and torn down on close —
  // the key handler is bound to the overlay, which holds focus, so nothing
  // outlives it.

  // chronoanvil:select:Prop:opt1=Label 1,opt2=Label 2

  // The trailing cell of a logging grid: a dashed, empty-looking tile that
  // opens the picker of trackers this entry doesn't yet show. It reads as
  // "there is room for more here", which is the point — an occasional tracker
  // is only useful if adding it on the day costs one tap.
  //
  // It is a real grid cell rather than a button beside the grid so it inherits
  // the two-per-row layout and never orphans itself on a line of its own.

  // A small × in a logging cell's top-right corner, removing that module from
  // this entry (never from Settings, and never the value already logged — see
  // entry-trackers.ts::pruneProperties). Hidden until the cell is hovered or
  // the button itself is focused, so the grid stays calm while you're logging;
  // CSS reveals it permanently on touch devices, which have no hover.

  // tracker:<id> — reads its type/range/options from Settings → Trackers
  // and dispatches to the right underlying widget. `id` is the only arg;
  // everything else about the tracker lives in settings, not the note.

  // −/+ stepper for number-type trackers. Reads/writes the same frontmatter
  // property a slider would, so switching a tracker's type in settings
  // doesn't strand any previously logged values.
  //
  // Display state is tracked locally (`known`) rather than re-read from
  // metadataCache after every write: processFrontMatter's promise resolves
  // once the file is saved, but Obsidian updates its cache on a separate,
  // slightly-delayed pass, so reading it back immediately can return the
  // value from *before* this write — every click then shows one step
  // behind the property it just set. Writing optimistically from the same
  // number we send to the file keeps the widget and frontmatter in lockstep,
  // and also keeps rapid clicks correct without waiting on that cache.

  // Face/word picker for a scale tracker. The configured faces (low→high) are
  // spread evenly across the tracker's min..max range and snapped to its step,
  // so a tap writes a clean numeric value — the same property a stepper or
  // chart reads. Returns null when there's no usable bounded range or fewer
  // than two faces, so buildTracker can fall back to the stepper.

  // Checkbox for a boolean/habit tracker. Stores 1 for done, 0 for
  // explicitly-not-done, and clears the property when returned to "unset" — the
  // three states matter for a habit: a logged 0 ("I didn't meditate today") is
  // real data that a completion-rate average should count, distinct from a day
  // with no entry at all. Clicking cycles unset → done → not-done → unset, so
  // all three are reachable by tap without a separate control.
  //
  // 0/1 rather than true/false so it charts and averages like any number: the
  // mean is the completion rate, the streak chart reads the same property, and
  // Diary.base shows a tidy 0/1 column.

  // The unset → done → not-done → unset cycle, and the three-state paint that
  // goes with it, shared by the standalone checkbox above and the chip below.
  // One behaviour, two shells: `mark` is what shows the ✓/✗, `press` is what
  // takes the click, and in the standalone case they are the same element.
  //
  // `onState` lets a shell react to the value beyond the mark itself — the
  // chip tints its whole pill, which is what makes a row of them readable at a
  // glance rather than a row of small boxes you have to look *at*.

  // ── The Habits cell ─────────────────────────────────────────────────────
  //
  // A boolean tracker is one bit of information, and it was being given a
  // whole logging cell to hold it: an eyebrow label, 76px of height and half
  // the grid's width, for a box you tick. Four habits filled the entry banner
  // and pushed everything that actually has a magnitude — mood, sleep, the
  // steppers — off the first screen.
  //
  // So the booleans on a note collapse into ONE cell titled "Habits", each
  // becoming a named chip inside it. The tracker's own label moves into the
  // chip beside its box, which is where it was always doing its work: an
  // eyebrow reading "EXERCISE" over a lone checkbox says the same thing twice.
  // Chips wrap, so ten habits cost the grid one cell of a few rows rather than
  // ten cells of one.
  //
  // Nothing about the note changes: this is a rendering of the same
  // `tracker:<id>` lines, each chip still carries its own remove ×, and a
  // boolean rendered anywhere but a logging grid (an inline `chronoanvil:tracker:`,
  // say) still gets the standalone checkbox above.
  private habitsCell(): HTMLElement {
    const cell = createSpan({
      cls: "ca-journal-widget ca-journal-tracker-cell ca-journal-habits-cell",
    });
    cell.createSpan({ cls: "ca-journal-widget-label", text: "Habits" });
    cell.createSpan({ cls: "ca-journal-habits-row" });
    return cell;
  }

  // One habit inside that cell. The chip is a <div> holding two buttons rather
  // than a button holding a button — nested interactive elements are invalid
  // and, more practically, the remove × inside a pressable pill would toggle
  // the habit on its way to removing it.

  // Whether a directive should join the Habits cell: a boolean tracker this
  // note is actually allowed to log.
  //
  // The surface test is the same one buildFromSpec applies, and it is asked
  // here so that a MISPLACED boolean still takes the normal path and draws its
  // visible refusal. Folding it into the chips would hide the one thing the
  // refusal exists to say.
  private habitTrackerFor(
    line: string,
    ctx: MarkdownPostProcessorContext
  ): TrackerDef | null {
    const body = line.split("|")[0].trim();
    const id = directiveTrackerId(body);
    if (!id) return null;
    const def = getTracker(this.plugin, id);
    if (!def || def.type !== "boolean" || def.derived) return null;
    const surface = noteSurfaceOf(this.app, this.plugin, ctx.sourcePath);
    if (
      surface != null &&
      !directiveAllowedOn(this.plugin.settings.trackers, body, surface)
    ) {
      return null;
    }
    return def;
  }

  // Coupled Wake-Up + Bedtime control. Two time inputs shown as one unit with a
  // live "😴 Xh Ym asleep · ☀️ Xh Ym awake" readout; changing either re-derives
  // the Sleep property (via write()). Reads the pair's ids/labels from the
  // built-in registry so a relabelled Wake-Up/Bedtime still works.

  // chronoanvil:button:<action>[:arg]
  // `button:log:<trackerId>:<delta>` is handled separately since its label
  // is generated from the tracker + delta rather than a fixed lookup.

  // Builds a "+2 📖" / "−0.5 km" style label for a `log:<id>:<delta>`
  // button straight from the tracker's own settings — no per-button
  // registration needed to add a new quick-log button.
  // Label for a type-scoped journal button: `button:<typeId>:<sub>[:arg]`.
  // Returns null when `action` isn't a registered journal type, so the
  // caller falls through to the global BUTTON_LABELS map (which still holds
  // the diary/chart/week/month buttons and the legacy unscoped Study ones).


  // Dispatch a sub-action for a specific journal type. Same set of verbs for
  // every type; the manager reads depth/kinds off the type itself.
  // The container a bare `new-topic` should add to: the host note's own
  // folder, but only when that note really is one of this type's top-level
  // containers (a subject folder note directly under the type's root).
  //
  // This exists so a Subject dashboard's New Topic button can stop carrying
  // `{{name}}`, resolved at creation. That literal was wrong the moment the
  // subject folder was renamed, and wrong in the worst way: newContainer
  // would happily create the vanished folder again and file the new topic
  // inside it, leaving two subjects where the reader renamed one. Reading the
  // folder at click time cannot go stale. Anywhere else — the homepage's
  // Journals section, most obviously — this returns "" and the button prompts
  // for a subject exactly as before.


}
