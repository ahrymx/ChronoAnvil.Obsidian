// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// A note that is a flat stack of fences, as a `SectionModel`.
//
// WHY THIS EXISTS, AND WHY IT IS NOT THE DESIGN 3.11 §1.2 REJECTED
//
// The homepage and the Search note both needed a catalogue, and the question
// put to the design was whether one model should cover both — `applies` keyed
// on which note it is on, the way `DiarySection.applies` keys on grain. That
// was rejected, and correctly: the four period dashboards ARE one page at four
// zooms, so a grain is a parameter of one description. The homepage and Search
// are two pages. A model spanning them would have to carry which note it is on
// as a field, and `section-model.ts` opens by forbidding exactly that.
//
// So there are two catalogues, and this is not a third. THE SPLIT IS BETWEEN
// DATA AND BEHAVIOUR:
//
//   • WHICH sections a note has, what they render, what they are called, what
//     may be removed — that is the catalogue, and there is one per note.
//   • HOW a flat list of fenced sections is planned, spliced, reordered and
//     refused — that is arithmetic over a list, and it does not know or care
//     what is in the list.
//
// Nothing here can answer "which note am I on", because nothing here is ever
// told. `flatNoteModel` is handed a list and a noun and has no other input.
// That is the same seam `moveOps`, `holdPinned` and `longestCommonSubsequence`
// already sit on one file over — shared machinery that the three existing
// catalogues call and none of them is defined by.
//
// WHAT A "FLAT" NOTE IS, precisely: one band, one fence per section, no
// frontmatter the catalogue owns, and no context. That is the homepage and it
// is Search. It is NOT a diary dashboard — those have two bands, a masthead
// whose two sections share a fence, a grain, and a period property — which is
// why `diary-sections.ts` keeps its own implementation rather than being
// rewritten onto this. Collapsing the two would mean this file growing a band
// model and a merge rule for one caller, which is how a shared helper becomes
// a second catalogue with extra steps.

import { segment } from "./layout";
import {
  addOps,
  barlessRuns,
  fenceBlock,
  joinRowChunk,
  rowDelimiter,
  finalOrder,
  foreignOp,
  insertionPoint,
  moveOpsFor,
  permuteChunks,
  plannedWrites,
  soleFence,
} from "./sections";
import {
  isBlank,
  isFillerRun,
  optInOf,
  parseSectionRuns,
  rowOf,
  soloBarOf,
  viewOf,
} from "./sections";
import type { Chunk, OwnedRun, RowMember } from "./sections";
// Re-exported because this is where the composers look for them: `rowRuns` is
// here and its member type moved out from under it in 5.24, along with the
// arrival rule the reconcilers ask.
export type { RowMember };
export { rowDelimiter };
import type { NoteSpec, Section } from "./sections";
import {
  instanceSectionFor,
  nextInstanceId,
  pageWidgetKeywords,
  widgetInstances,
} from "./widget-sections";
import { fencesOf } from "./block-move";
import {
  columnLoadOf,
  moveCell,
  runsOf,
  setPageBreaks,
  tabSlices,
  tidyCells,
  tidyHeights,
  tidyTabs,
  widgetRun,
} from "./cell-move";
import type { CellTarget } from "./cell-move";
import {
  CELL_KEYWORD,
  TAB_KEYWORD,
  LINKS_KEYWORD,
  MAX_COLUMNS,
  dealInto,
  ROW_KEYWORD,
  TITLE_KEYWORD,
  WIDE_KEYWORD,
  HEADER_KEYWORD,
  isHeightLine,
  isLinksLine,
  isRowLine,
  isTabLine,
  isPageHeadLine,
  isWideLine,
  parseWide,
  argSpansIn,
  readArg,
  splitDirective,
  dropSoloBar,
  soloBar,
  undoRowOfOne,
} from "./directive-grammar";
import {
  BlockView,
  SectionModel,
  SectionOp,
  SectionQuestion,
  SectionView,
  SectionWant,
  WIDGET_FORM,
  formAt,
  describeAnswers,
  partsOf,
  holdPinned,
  idsOf,
  optionsFor,
  reconfigured,
  withAnswers,
} from "./section-model";

// One section of a flat note.
//
// `Section` WITH NO CONTEXT, WHICH IS WHAT "FLAT" MEANS. The type moved to
// `core/sections.ts` in 5.22 — the same move `SectionOp` made in 3.0 and
// `SectionBlock` made alongside this one — and the name stays here because
// every importer in the tree spells it this way and a flat surface is a real
// thing to be a section OF.
//
// WHAT IT LOST IN THE MOVE IS NOTHING, and what it GAINED is the fields the
// other three catalogues needed: `band`, `applies`, `default`, `parts`,
// `probe`, `ownsRegion`. A flat note has one band and no variation, so it
// leaves all six out and composes exactly the note it composed before.
//
// `Ctx` IS `void` HERE. `render` and `locate` take it and ignore it, which is
// why the catalogue literals below are written `render: () => …` and
// `render: (_ctx, opts) => …`: a shorter function is assignable to a longer
// signature, so a section that has nothing to say about a context does not
// have to name one. The arguments those fields' comments used to make in this
// file are made in `core/sections.ts` now, in full and once.
export type FlatSection = Section<void>;

// What the head is composed as. 4.10, and BARE since 5.2.
//
// ── THE IDS ARE GONE, AND THEY HAD NOT DRAWN ANYTHING FOR A YEAR ─────────
//
// `PAGE_TITLE_IDS` was `["home", "diary", "journals"]`, and the line every
// dashboard carried was `title:home,diary,journals` — three vault destinations
// rendered as a second row under the page's name by `buildPageTitle`, which was
// the 4.5 head. 4.10 replaced that head with `livePageHead`, the dispatcher's
// `case "title"` went with it, and nothing has read the argument since: the
// renderer takes a context and no ids at all. The grammar went on documenting a
// list, eight catalogues went on writing one, and the page went on ignoring it.
//
// So the directive is what it renders: `title`, with nothing after it.
//
// NOTHING IS REWRITTEN IN A READER'S VAULT. `locateTitle` matches both forms —
// its regex has always allowed the bare one, because the homepage used it — and
// repair is additive-and-retired-only, so an existing note keeps the line it
// has and renders exactly as before. New notes are composed without it.
//
// AND THE DESTINATIONS THEMSELVES ARE STILL DESTINATIONS. `resolveTarget` is
// the one table that answers "where does `diary` go" — shared by `links:` and
// the launcher — and all three ids are still in it, so a reader who wants that
// row writes `links:home,diary,journals` and gets one.
//
// NOT BECAUSE "THE LAUNCHER ALREADY DRAWS THEM", which is what this file, the
// old head and `home-sections.ts` all claimed and which 5.2 checked: the
// launcher's default is `["week", "month", "quarter", "year"]`, the four PERIOD
// dashboards. It has never shipped a Diary or a Journals tile unless a reader
// named one. The argument that the row was redundant was wrong on the facts;
// the row goes because nothing drew it, which is a different reason.
export const PAGE_TITLE_LINE = TITLE_KEYWORD;

// Where a `title` line is in a note, or -1.
//
// A COLON WITH NOTHING SPACED AFTER IT, which is the whole of what tells a
// directive from a YAML key. `title` on its own is what every page composes
// since 5.2, and `title:home,diary,journals` is what the notes written before it
// carry; a reader's frontmatter `title: My Page` is neither, and matching it
// would report the section present on a note that has no head and then decline
// to offer one. Every directive this plugin writes is `keyword:value` with no
// space, so this is the grammar's own shape rather than a guard invented here.
//
// BOTH FORMS ARE READ AND ONLY THE BARE ONE IS WRITTEN, which is what makes the
// 5.2 change invisible in an existing vault: the optional group has always been
// optional, because the homepage was bare from 4.5.
export const locateTitle = (text: string): number =>
  text.search(/^title(?::\S*)?\s*$/m);

// ── how wide this page is, read and written (4.11) ─────────────────────
//
// THE PAIR THE COG TOGGLES. `parseWide` says what a FENCE asked for and knows
// nothing about notes; these two ask and answer the same question of a whole note,
// which is what a menu item has to work with — it is handed a path and has to end
// up with a file.
//
// HERE RATHER THAN IN `directive-grammar.ts`, on the split that file's header
// draws: it is the grammar of a line and takes no view of what a note is. And here
// rather than in `page-title.ts`, because a widget that edited notes would be a
// widget the suite could only test through a DOM. `locateTitle` already lives here
// and this is the same fact one level out.

// Whether this note's head asks for a wide page.
export function pageIsWide(text: string): boolean {
  const at = locateTitle(text);
  if (at < 0) return false;
  const lines = text.split("\n");
  const line = text.slice(0, at).split("\n").length - 1;
  const fence = fenceHolding(lines, line);
  return fence !== null && parseWide(fence.body).wide;
}

// The note with its head's `wide` line added or removed, or null when nothing
// would change.
//
// NULL FOR "NOTHING TO DO", which is `applyFlatSections`', `moveCell`'s and
// `widenCells`' convention: a caller that writes on null is a caller that touches
// a reader's file to leave it identical, and Obsidian's own modified-time is the
// thing that then lies about it.
//
// NULL FOR "NOWHERE TO PUT IT" AS WELL, and the two are deliberately one answer. A
// note with no head has nothing that is about the page, so there is no line to
// write and no second sentence to invent — the cog is not drawn there either,
// because `buildPageTitle` is the head.
//
// AND IT SPLICES ONE LINE. Every other line of the fence, and every other fence,
// comes out byte-identical — the property that makes this a reconciler rather than
// a formatter, and the reason `argSpanIn`/`spliceArg` are not used: those write an
// ARGUMENT into a directive, and this is a whole line that has none.
export function setPageWide(text: string, on: boolean): string | null {
  const at = locateTitle(text);
  if (at < 0) return null;
  const lines = text.split("\n");
  const line = text.slice(0, at).split("\n").length - 1;
  const fence = fenceHolding(lines, line);
  if (!fence) return null;
  const has = fence.body.some(isWideLine);
  if (has === on) return null;
  const out = [...lines];
  if (on) {
    // FIRST IN THE BODY, where `composeFlatNote` already puts `row` and where both
    // other modifiers are read from regardless of order. A modifier at the top of
    // a fence is also outside `widgetRun`'s content span, which is what keeps it
    // behind when the widget under it leaves.
    out.splice(fence.from + 1, 0, WIDE_KEYWORD);
  } else {
    // EVERY `wide` LINE IN THE FENCE, not the first: two of them is a refusal
    // (`parseWide`), and a toggle that turned a refusal into one honoured line
    // would be resolving a contradiction the grammar declined to resolve.
    const kill = new Set(
      fence.body.flatMap((l, i) => (isWideLine(l) ? [fence.from + 1 + i] : []))
    );
    return out.filter((_, i) => !kill.has(i)).join("\n");
  }
  return out.join("\n");
}

// The fence containing note line `line`, as its body and its opening index.
//
// `fencesOf` answers in SEGMENTS, which is the right unit for a move and the wrong
// one here: this needs the note's own line numbers, because that is what
// `locateTitle` gives and what a splice takes. Walking the fences is three lines
// and cannot disagree with `segment` about where one ends, because it asks the same
// list.
function fenceHolding(
  lines: readonly string[],
  line: number
): { from: number; body: string[] } | null {
  const { at, segs } = fencesOf(lines);
  let start = 0;
  const startOf: number[] = [];
  for (let i = 0; i < segs.length; i++) {
    startOf[i] = start;
    start += segs[i].length;
  }
  for (const b of at) {
    const from = startOf[b];
    const to = from + segs[b].length;
    if (line >= from && line < to) {
      return { from, body: segs[b].slice(1, -1) };
    }
  }
  return null;
}

// ── THE BANNER (4.19) ─────────────────────────────────────────────────
//
// ONE SECTION THAT SAYS WHICH NOTE THIS IS AND WHERE IT GOES. Until this
// release a page answered that in two rows — a `title` section and, on the
// dashboards, a `links` section in another band — and on Search in one and a
// HALF, because the navigation row was a line inside the search block. Three
// shapes for one idea, and a reader editing sections saw two rows where the
// page shows one strip.
//
// THE WORD IS NOT NEW. `widget-registry.ts` has carried `banner` as a formal
// exclusion reason since 4.12 — *"What a page IS rather than something on it. A
// second banner is a second answer to 'which note is this'"* — and both
// `entry-header` and `journal-header` have been labelled "Banner" in their
// catalogues for longer than that. What 4.19 does is extend a name that covered
// two of nine surfaces to all nine, not coin one. The alternatives were all
// taken: `header:` is the section bar, "page head" was this object's name while
// it was only half of itself (and "block head" is a third thing — every block
// wears one), and "masthead" is the dashboard band plus a description
// `page-title.ts` rejects for this card by name.
//
// LOCKED, WHICH IS 4.19's ONE LOSS AND IS STATED RATHER THAN BURIED. The head
// was removable on the argument that *"a page without a title card is a coherent
// thing to want — the note's name is in the tab, the file explorer and the
// window"*, and `links` was locked on the argument that *"a vault where some
// pages can get home and others cannot is worse than one with no links at all"*.
// One block cannot be both, and the navigation argument is the stronger of the
// two: a missing title card costs a reader a label they have three other copies
// of, and a missing links row costs them the way out of the page. So the banner
// is locked everywhere — including on the homepage, whose banner carries no
// links row at all. That last case is the price of ONE rule instead of two, and
// a rule that held on five surfaces and not the other four would be a rule a
// reader has to learn per page.
//
// PINNED, unchanged from 4.11 and for its reason: a page whose own name is
// somewhere other than the top is a page with its title in the middle of it.
//
// ONE BLOCK, STILL TWO DIRECTIVES. `title:` carries where you are in the VAULT
// and `links:` carries where you are in TIME; `page-title.ts` argues that split
// at length and `page-head.test.ts` pins it. What merges here is the FENCE, not
// the grammar — `PAGE_TITLE_IDS` is untouched and neither line learns the
// other's destinations. Obsidian renders a fence as one block, so one fence is
// one strip, which is the whole of what "the same block" had to mean.
//
// (`PAGE_TITLE_IDS` was deleted in 5.2 — `title:` carries no destinations any
// more, so the split above is now between a line that names the page and a line
// that navigates time. The `links:` half is unchanged.)
// The id every catalogue's banner shares.
//
// SPELLED ONCE because five catalogues now use it and `repair-plan.ts` matches
// sections by id: a sixth spelling would be a section repair could not find.
export const BANNER_ID = "banner";

export interface BannerSpec {
  // `ids` WAS HERE AND IS NOT COMING BACK (5.2). It carried the vault
  // destinations for the `title:` line, and the homepage was the one surface
  // that left it out — on the argument that its launcher already draws those
  // tiles as content, so ids would be the same destinations twice, six lines
  // above themselves. That argument turned out to apply everywhere: the head
  // that drew the row was replaced in 4.10 and the ids have rendered nothing on
  // any surface since. See `PAGE_TITLE_LINE`.
  //
  // The `links:` argument this page's banner composes, or absent for a page
  // whose time navigation is a widget of its own.
  //
  // ABSENT ON THREE OF THE FOUR FLAT PAGES, and each has already argued it. The
  // homepage's navigation is the diary card's destination pills, which is why
  // no links section was ever written there. (That was also the argument that
  // locked `diary` until 4.53; the lock went and the layout fact did not.)
  // Both folder notes' navigation is likewise the card they are a folder note
  // for. Search is the one that carries a row, and until 4.19 it carried it
  // INSIDE the search block, where no section owned it and the editor could not
  // show it.
  links?: string;
  // Whether the banner seeds the page's width. `wide` is a fact about the NOTE
  // read from the block that draws its title (4.11), so it belongs to whichever
  // section that is — which is now this one.
  wide?: boolean;
}

// The banner, as a flat note's catalogue composes it.
//
// A FACTORY RATHER THAN A CONSTANT, which is what 4.19 changes about the shape
// of this export. `PAGE_TITLE_SECTION` was one frozen object three catalogues
// shared and the homepage could not, so the homepage kept a near-copy — two
// definitions of one decision, which is exactly the drift `resolveTarget` was
// exported in 4.5 to prevent one level up. Every difference between the four
// pages is now a field of `BannerSpec`, so there is one definition and four
// arguments to it.
export function bannerSection(spec: BannerSpec = {}): FlatSection {
  return {
    id: BANNER_ID,
    label: "Banner",
    blurb: spec.links
      ? "The page's own name, where it can go in the vault and in time, and the control that renames it and edits its sections."
      : "The page's own name, where it can go, and the control that renames it and edits its sections.",
    icon: "🏷️",
    category: "structure",
    locked: true,
    pinned: true,
    render: () => fenceBlock({
      fence: "chronoanvil",
      lines: [
        // THE MODIFIER FIRST, where `composeFlatNote` already puts `row` and
        // where `parseWide` reads it from regardless of order. A modifier at the
        // top of a fence is also outside `widgetRun`'s content span, which is
        // what keeps it behind when the widget under it leaves — and `setPageWide`
        // splices at exactly this position.
        ...(spec.wide ? [WIDE_KEYWORD] : []),
        TITLE_KEYWORD,
        ...(spec.links ? [`${LINKS_KEYWORD}:${spec.links}`] : []),
      ],
    }),
    // TWO ANCHORS, AND THE SECOND ONE IS NOT BELT-AND-BRACES.
    //
    // Anchoring on the title line is what reports the banner PRESENT on a note
    // that still has its two lines in two fences — so repair adds nothing there
    // and the note keeps rendering as it always has. The weld is a migration,
    // not a repair (`mergeBannerFences`).
    //
    // BUT THE PAGE HEAD WAS REMOVABLE UNTIL THIS RELEASE, and a reader who took
    // that offer has a note with a `links:` row and no title line — not a
    // corrupted note, a note in a state 4.10 explicitly invited. On a title-only
    // anchor the banner reports ABSENT there, repair composes a whole new one,
    // and the reader ends up with two navigation rows: the 4.18 duplicate-page-
    // head failure, re-made in the release that was cleaning up after it.
    //
    // So the banner is present if EITHER of its lines is. This is the "either
    // spelling" rule `journal-sections.ts` already uses for a renamed section,
    // applied to a merge instead of a rename — and it is why `parseDiarySections`
    // needed the `claimed` set `parseFlatSections` has had since 4.12: two
    // fences can now match one id, and the first run is the section.
    locate: (text) => {
      const at = locateTitle(text);
      return at >= 0 ? at : text.search(/^links:/m);
    },
  };
}

// A note whose banner is still two fences, welded into one. Null when there is
// nothing to do.
//
// ── WHY THIS IS A MIGRATION AND NOT PART OF REPAIR ────────────────────
//
// Repair is additive-and-retired-only, and `repairNote` asserts it — it may add
// a section the release ships and the note lacks, strike a retired directive,
// and rewrite an argument it owns. Moving a line from one block to another is
// none of those three, and `layout.ts` says what to do with a change that is
// none of those three: *"the answer is to ship it as a one-off migration next to
// migrateTrends, not to teach this module a fourth verb."* So this is that, and
// it runs in the `migrations` group where a reader opts into it separately.
//
// ── WHAT IT REFUSES, WHICH IS MOST OF WHAT IT COULD DO ────────────────
//
// It welds ONE links line out of the fence IMMEDIATELY BELOW the banner, and it
// declines every other arrangement:
//
//   • no `title` line at all — nothing to weld onto, and no second sentence to
//     invent. `setPageWide` answers the same way for the same reason;
//   • a banner that already holds a links line — the note is on this release,
//     and running twice must be the same as running once;
//   • anything but blank lines between the two fences. A reader who put a widget
//     between their title card and their navigation row ARRANGED that, and a
//     migration that hoisted the row past it would be rewriting a page they
//     made rather than one this plugin composed;
//   • no links line below at all — the homepage and both folder notes compose
//     no navigation row and never did, so on those this is correctly a no-op.
//
// The donor fence keeps everything else it had, in order, and is dropped only if
// the links line was the whole of it — an empty fence renders as an empty block
// and is worse than the seam this closes.
//
// PURE, AND NULL FOR "NOTHING TO DO", which is this file's convention
// (`setPageWide`, `applyFlatSections`) and exists so a caller cannot touch a
// reader's file to leave it identical — Obsidian's modified time is the thing
// that then lies about it, and sync propagates the lie.
export function mergeBannerFences(text: string): string | null {
  const at = locateTitle(text);
  if (at < 0) return null;
  const lines = text.split("\n");
  const titleLine = text.slice(0, at).split("\n").length - 1;

  const { at: fenceAt, segs } = fencesOf(lines);
  const startOf: number[] = [];
  let start = 0;
  for (let i = 0; i < segs.length; i++) {
    startOf[i] = start;
    start += segs[i].length;
  }

  // Which fence holds the title line. `fenceHolding` answers this one level up
  // and in the note's own line numbers, which is what a splice takes; this needs
  // the SEGMENT index, because the block it welds from is "the next segment"
  // rather than "so many lines down".
  const banner = fenceAt.find((seg) => {
    const from = startOf[seg];
    return titleLine >= from && titleLine < from + segs[seg].length;
  });
  if (banner === undefined) return null;

  const bannerBody = segs[banner].slice(1, -1);
  if (bannerBody.some(isLinksLine)) return null;

  const donor = fenceAt.find((seg) => seg > banner);
  if (donor === undefined) return null;
  for (let i = banner + 1; i < donor; i++) {
    if (segs[i].some((l) => l.trim() !== "")) return null;
  }

  const donorBody = segs[donor].slice(1, -1);
  const row = donorBody.findIndex(isLinksLine);
  if (row < 0) return null;

  const rebuilt = (seg: string[], body: readonly string[]): string[] => [
    seg[0],
    ...body,
    seg[seg.length - 1],
  ];
  const kept = donorBody.filter((_, i) => i !== row);

  const out: string[] = [];
  for (let i = 0; i < segs.length; i++) {
    if (i === banner) {
      out.push(...rebuilt(segs[i], [...bannerBody, donorBody[row]]));
    } else if (i === donor) {
      if (kept.length) out.push(...rebuilt(segs[i], kept));
    } else if (kept.length === 0 && i > banner && i < donor) {
      // The blank run that separated the two blocks goes with the block it
      // separated. Left behind it would be a widening gap where a card used to
      // be, which is a change to how the page LOOKS made by a migration that
      // was only asked to move a line.
      continue;
    } else {
      out.push(...segs[i]);
    }
  }
  return out.join("\n");
}

// A flat note's whole markdown.
//
// NO FENCE MERGING, and this is the one thing a reader coming from
// `composeDiaryDashboard` must not carry across. That function welds a band's
// sections into a single fence, because the masthead is one card and Obsidian
// renders each block as its own sibling. A flat note has no masthead: every
// section is an independent block and always was. Copying the merge rule here
// would fuse the whole page into one fence — the exact failure 3.2 patch 3 hit
// on its first attempt, where "every body section renders into a `chronoanvil`
// fence too, so the whole page below the card collapsed into a single block".
//
// The spacer is line 0 for the reason the banner's is: it stops a click at the
// top of the note landing inside the first widget.
// ── one row rule, four catalogues ─────────────────────────────────────

// `row` and `bar`, READ FOR A SURFACE WHOSE CONTEXT IS `void`.
//
// `Section.row` and `.bar` are `string | ((ctx) => string | undefined)` since
// 5.22, because ONE catalogue needs the function form: the journal one serves a
// container index and a leaf index from a single entry, and a row a section
// joins on one and not the other cannot be a constant. Nothing in a flat note
// varies that way, so every literal in every flat catalogue writes a string —
// and these two exist so that fact is stated once here rather than as a cast at
// each of the dozen places that read the field.
//
// TOLERANT OF A MISSING SECTION, which is why they take `undefined`: the reads
// below are overwhelmingly `byId.get(id)?.bar`, and a helper that refused that
// shape would turn a widening into a rewrite of every caller.
const flatRow = (s: FlatSection | undefined): string | undefined =>
  s && rowOf(s, undefined);
const flatBar = (s: FlatSection | undefined): string | undefined =>
  s && soloBarOf(s, undefined);

// A catalogue's sections, grouped into the fences they compose to. 4.70.
//
// ── WHY THIS IS A FUNCTION AND NOT FOUR COPIES OF A LOOP ─────────────────
//
// The rule was `composeFlatNote`'s alone until this release, because flat notes
// were the only surface whose section type had a `row` field. 4.70 gives the
// other three the same field, and a rule stated four times is four things that
// can disagree about what a `cell` line means — which is the fault
// `dealInto` was hoisted to prevent one level down, in this same grammar, for
// exactly this reason.
//
// So the decision lives here once and the four composers differ only in what
// they do with the runs afterwards: a flat note joins them with a spacer on top,
// a dashboard adds its graph links, an entry template partitions by band first,
// and a journal template has markdown blocks between them.
//
// ── WHAT IT DECIDES ──────────────────────────────────────────────────────
//
// A run continues while the row id holds AND the fence kind holds. The second
// condition is not hypothetical: a charts section is a `chronoanvil-charts` fence
// and could never share a block with a `chronoanvil` one, and a catalogue that
// asked for it would otherwise compose a fence whose kind silently belongs to
// whichever section came first.
//
// The `row` line goes in first, before any directive, which is where a reader
// would type it and where `parseRow` reads it from regardless.
//
// ── OPT-IN IS THE CALLER'S ───────────────────────────────────────────────
//
// Every catalogue spells "not composed by default" differently — `optIn` is a
// boolean here, a predicate on the diary side, and `chosenSectionIds` on the
// journal side — so the members handed in are the ones that are actually being
// written. That also keeps `divided` honest: an opt-in section declaring a cell
// must not put a delimiter into a row it is not in.
export function rowRuns<T extends RowMember>(
  members: readonly T[],
  render: (member: T) => { fence: string; lines: string[] },
  // WHETHER A MEMBER WITH NO ROW OF ITS OWN JOINS THE ONE BEFORE IT. 4.70.
  //
  // FALSE IS "A SECTION IS A BLOCK", which is what a flat note, a dashboard and
  // a journal template all mean: a section that has not asked to share takes a
  // fence of its own, and that is the shape those three have always composed.
  //
  // TRUE IS "A BAND IS A BLOCK", which is what a diary ENTRY means and what its
  // composer has hardcoded since 3.2 patch 2 — see `composeEntryTemplate`, where
  // the argument for one fence per band is made in full. An entry's shared band
  // is a single card holding Focus, Highlights, Challenges and the rest, and
  // splitting it per section would put a border between every field on the page.
  //
  // WHAT IT DOES NOT DO IS WELD ACROSS A ROW. An unrowed member joins the run
  // before it only when that run is also unrowed; one that follows a row starts
  // a new block instead. Without that clause the first field after a two-cell
  // row would silently become its third cell — a column the reader never asked
  // for, in a fence they cannot see the shape of.
  weld = false
): { fence: string; lines: string[] }[] {
  // WHICH ROWS DIVIDE THEMSELVES AT ALL, computed before the loop. A row where
  // nobody declares a cell composes with no `cell` lines — the 4.2 markup,
  // unchanged — and one where somebody does gets a delimiter wherever the id
  // changes. Without this a page that never asked for cells would still gain a
  // delimiter between every pair, which renders identically and reads as noise
  // the reader did not write.
  const divided = new Set(
    members.filter((s) => s.row && s.cell !== undefined).map((s) => s.row)
  );
  // Two sections share a cell only when both NAME the same one. Absent is not a
  // value: it means "a cell of my own", so two of them are two cells.
  const sameCell = (a: string | undefined, b: string | undefined): boolean =>
    a !== undefined && a === b;

  const runs: {
    fence: string;
    lines: string[];
    members: number;
    // The opener's, and read only where `members` stayed at one — a run that
    // kept its row already carries the band's bar.
    bar?: string;
  }[] = [];
  let openRow: string | undefined;
  let openCell: string | undefined;
  for (const s of members) {
    const { fence, lines } = render(s);
    const last = runs[runs.length - 1];
    const continues =
      last !== undefined &&
      last.fence === fence &&
      (s.row !== undefined ? s.row === openRow : weld && openRow === undefined);
    if (continues) {
      // The delimiter goes in only where the cell or page CHANGES, and never before the
      // first member — that one opens the row's first cell by being first, and
      // a leading delimiter would be a line the reader has to read past
      // to find out it means nothing.
      if (s.tab) {
        last.lines.push(TAB_KEYWORD);
      } else if (divided.has(s.row) && !sameCell(openCell, s.cell)) {
        last.lines.push(CELL_KEYWORD);
      }
      last.lines.push(...lines);
      last.members += 1;
      openCell = s.cell;
      continue;
    }
    openRow = s.row;
    openCell = s.cell;
    runs.push({
      fence,
      lines: s.row ? [ROW_KEYWORD, ...lines] : [...lines],
      members: 1,
      bar: s.bar,
    });
  }
  // A ROW OF ONE IS NOT A ROW, and it is composed as though it had never been
  // asked for. 4.70.
  //
  // WHY THIS ARRIVED WITH THE OTHER THREE CATALOGUES. A flat note's membership
  // is fixed — the homepage's row has had the same four sections since 4.2 — so
  // a run could not lose members and the case never came up. A dashboard's does:
  // `applies` is per grain, so a row pairing the entry rollup with the open-task
  // table is two cells on a week and one on a year, where the rollup does not
  // apply. Left in, that composes `row` over a single directive — a line that
  // renders identically to no line at all and that a reader would have to read
  // past to discover means nothing, which is the same objection `divided`
  // already makes about a `cell` delimiter nobody asked for.
  //
  // DECIDED HERE RATHER THAN BY THE CATALOGUE, because the alternative is every
  // row id becoming a function of the context — four catalogues each restating
  // which of their sections happen to coincide on which grain, and each able to
  // get it wrong in a way that only shows up in composed markdown.
  //
  // AND IT GETS A TITLE WHILE THE ROW IS COMING OFF, because the cell left
  // behind is usually the one that composed no bar — see `soloBar`, which is
  // the same rule the reconciler applies when a reader unticks the opener of a
  // row that is already in a file. One answer, both directions.
  return runs.map(({ fence, lines, members, bar }) =>
    members === 1 && lines[0] === ROW_KEYWORD
      ? { fence, lines: soloBar(lines.slice(1), bar) }
      : { fence, lines }
  );
}

export function composeFlatNote(sections: readonly FlatSection[]): string {
  // ROWS ARE THE ONE MERGE, AND THEY ARE NOT THE MERGE THE PARAGRAPH ABOVE
  // FORBIDS. What that one warns against is welding a BAND into a fence —
  // fusing sections that merely follow each other, which would collapse the
  // page. A row is the opposite: a run of sections that have SAID they are one
  // block, named by `row`, and a section without the field is untouched.
  //
  // THE RULE ITSELF MOVED TO `rowRuns` IN 4.70, when the other three catalogues
  // gained the same two fields. Nothing about what this composes changed; see
  // that function for why one copy rather than four.
  const runs = rowRuns(
    sections
      .filter((s) => !optInOf(s, undefined))
      // `RowMember` IS THE RESOLVED SHAPE, which is what the journal composer
      // already hands it: `row` and `bar` are read here, once, and the row rule
      // downstream never learns that either could have been a function.
      .map((s) => ({ ...s, row: flatRow(s), bar: flatBar(s) })),
    (s) => soleFence(s.render())
  );
  const blocks = runs.map((r) =>
    ["```" + r.fence, ...r.lines, "```"].join("\n")
  );
  return "`chronoanvil:spacer`\n" + blocks.join("\n\n") + "\n";
}

export function renderFlatSection(
  section: FlatSection,
  opts?: Record<string, unknown>
): string {
  const { fence, lines } = soleFence(section.render(undefined, opts));
  return ["```" + fence, ...lines, "```"].join("\n");
}

// Which of this note's sections the text already has, in the order they appear.
export function detectFlatSections(
  text: string,
  sections: readonly FlatSection[]
): string[] {
  return sections
    .map((s) => ({ id: s.id, at: s.locate(text) }))
    .filter((s) => s.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((s) => s.id);
}

export function addableFlatSections(
  text: string,
  sections: readonly FlatSection[]
): FlatSection[] {
  const present = new Set(detectFlatSections(text, sections));
  return sections.filter((s) => !present.has(s.id));
}

// One contiguous run of a note, attributed. `sectionIds` is empty for a run the
// catalogue did not write — the reader's own prose, a hand-added fence — and
// those are reported and never moved.
// One run of a flat note.
//
// `OwnedRun` UNDER THIS FILE'S NAME (5.23). The shape moved to
// `core/sections.ts` with the walk that produces it; the alias stays because
// six functions here take one and `FlatRun` is what they call it. `index` became
// `from` in the move — a flat run is always one segment, so `from === to`, and
// the two-field form is what a journal run needs to absorb its regions.
type FlatRun = OwnedRun;

// A leading frontmatter block, taken off.
//
// FRONTMATTER IS THE NOTE'S STRUCTURE, NOT A BLOCK IN IT — the same claim the
// `filler` rule below already makes about the spacer, and it earns it the same
// way: `segment` has no concept of frontmatter, so a note's opening `---` run
// arrives here as ordinary raw lines, owned by no section, and is reported as
// "1 block in this file isn't the catalogue's; left alone". True, useless, and
// alarming on a page the reader has not touched.
//
// It went unnoticed until 4.2 §2, when the homepage gained a `cssclasses` key
// and every freshly composed one started saying it. A homepage a reader had
// added their own properties to has been saying it all along.
//
// ONLY AT THE TOP OF THE FILE, which is the whole of the care needed here: a
// `---` anywhere else is a thematic break a reader typed, and treating one as
// frontmatter would silently swallow the prose beneath it — turning a run that
// SHOULD be reported as the reader's into one that is not reported at all.
// The index of the line the frontmatter CLOSES on, or -1 when there is none.
//
// EXPORTED IN 4.29 for the reader who needs the boundary rather than the tail:
// reloading a page's body has to keep the frontmatter byte-for-byte, and
// `journal-date`, the events stamp and the reader's alias all live in it. One
// rule, one name — this is the same expression `withoutFrontmatter` has always
// used, with the same care taken over the same edge, and both read it here.
export function frontmatterEnd(lines: readonly string[]): number {
  if (lines[0]?.trim() !== "---") return -1;
  // Where it closes, or -1 when it never does — an opening `---` with no close
  // is not frontmatter, and `slice(0)` hands the run back whole, which is the
  // right answer for it. Written as one expression rather than as a guard and a
  // branch: a second path here would be a path no test can tell from this one.
  return lines.findIndex((l, i) => i > 0 && l.trim() === "---");
}

const withoutFrontmatter = (lines: string[]): string[] =>
  lines.slice(frontmatterEnd(lines) + 1);

// One page's frontmatter, another page's body.
//
// MOVED HERE FROM `entry-template.ts::reloadEntryBody` IN 4.33, because the
// journals needed the same write and the function never had a diary thought in
// it — it is `frontmatterEnd` twice and a join. Keeping a second copy in the
// journals would have been two answers to "what does reloading a page keep",
// and the two would eventually disagree about the malformed case below, which
// is the one nobody looks at.
//
// It is also a net deletion: `withoutFrontmatter` directly above is the second
// half of this, written a second time, and now shares the expression.
//
// FRONTMATTER IS KEPT BYTE-FOR-BYTE, and on both surfaces that is load-bearing
// rather than polite. An entry's `journal-date` scopes it to its period, its
// events stamp is written once at creation and never re-synced, and `title:` is
// the reader's own words. A journal note's `type:` is what classifies it at all,
// its level keys say where it belongs, its rating property holds a reading, and
// a PAGE's `parent:` is the only thing tying it to the note it is a page of.
//
// Returns null when nothing would change, which is `applyEntrySections`' and
// `applyLayout`'s convention and matters for the same reason: a rewrite that
// changes nothing still bumps mtime, and on the diary side mtime is the source
// of truth for what is stale.
export function replaceBody(text: string, composed: string): string | null {
  const lines = text.split("\n");
  const end = frontmatterEnd(lines);
  // No frontmatter to keep — the whole file is the body. Every page either
  // composer writes has some, so this is the malformed case rather than a
  // supported one, and replacing everything is what the reader asked for on a
  // file with nothing to preserve.
  //
  // CALLERS ON THE JOURNAL SIDE REFUSE BEFORE REACHING IT. A page with no
  // frontmatter has no `parent:`, and there is nothing in the body to recover
  // it from — so `journal-template-manager.ts` declines rather than letting
  // this arm do something defensible on an entry and destructive on a page.
  const head = end === -1 ? [] : lines.slice(0, end + 1);
  const body = withoutFrontmatter(composed.split("\n"));
  const next = [...head, ...body].join("\n");
  return next === text ? null : next;
}

// The inverse of `composeFlatNote`, and deliberately conservative: a section is
// present iff its own fence is present.
//
// THE WALK IS `parseSectionRuns`', IN `core/sections.ts` (5.23). This function
// and `parseDiarySections` were the same forty lines — the claim-once set, the
// instance tally carried across the segments, the `lineOf` map — and the second
// said so in its own comment. What is left here is the one thing the two
// genuinely disagreed about, below.
export function parseFlatSections(
  text: string,
  sections: readonly FlatSection[]
): FlatRun[] {
  return parseSectionRuns(segment(text.split("\n")), sections, undefined, (seg, i) =>
    // FRONTMATTER IS TAKEN OFF RATHER THAN TESTED FOR, which is this surface's
    // answer and not the dashboard's. The note's opening run carries its
    // frontmatter, because `segment` lumps every non-fence line before the
    // first fence into one raw run; only this run can hold frontmatter, and
    // only here is a leading `---` anything other than a thematic break.
    //
    // WHAT THE DIFFERENCE COSTS, stated so nobody unifies it by eye: an opening
    // run holding frontmatter AND a paragraph of the reader's prose is FOREIGN
    // here and FILLER on a dashboard. Both are defensible; neither is going to
    // be changed under cover of a refactor.
    //
    // The spacer counts as filler along with the blank separators and the
    // frontmatter: all three are structure, and reporting them as "a block here
    // isn't the catalogue's" would be true, useless and alarming on every
    // untouched note.
    isFillerRun(i === 0 ? withoutFrontmatter(seg.lines) : seg.lines, {
      spacer: true,
    })
  );
}

// Why this section cannot be removed from THIS note, or null if it can.
//
// TWO REASONS, IN THIS ORDER, and the order is the one both diary catalogues
// use: locked first, because "this is part of what the page is" is true
// regardless of what the reader has put in it, and telling someone to clear a
// region before removing something that was never going anywhere sends them to
// do pointless work.
//
// `noun` is the page in the reader's words — "the homepage" — so the refusal
// reads as a sentence about their note rather than about a catalogue.
//
// AND THERE IS DELIBERATELY NO `pinned` BRANCH (4.11). A pin is about ORDER; this
// function is about EXISTENCE, and the page head is the section that proves the
// two are different questions — it cannot be moved and it can be removed, which
// three catalogues' comments argue for and which a reader with the note's name in
// their tab, their file explorer and their window is entitled to. A branch here
// would refuse the removal in order to enforce the order, which is the mistake
// `diaryRemovalRefusal` made from 4.10 until this release found it.
export function flatRemovalRefusal(
  section: FlatSection,
  text: string,
  noun: string,
  heldUnit: string
): string | null {
  if (section.locked) {
    // AND WHETHER IT CAN BE MOVED IS ASKED, NOT ASSUMED (4.19).
    //
    // This said "You can move it, though." unconditionally, and was true for as
    // long as it was reachable: no flat section had ever been both `locked` and
    // `pinned`, so the only sections that got here could all move. The banner is
    // both — locked because it carries the way out of the page, pinned because a
    // page's name belongs at the top — and the old sentence would answer a
    // reader's "why can't I remove this" by sending them to do a thing the
    // editor also refuses.
    //
    // `diaryRemovalRefusal` has branched on exactly this since 4.11, having hit
    // exactly this bug one catalogue over and one release earlier. This is that
    // fix, arriving here with the section that needed it.
    return section.pinned
      ? `Part of what ${noun} is, so it can't be removed or moved.`
      : `Part of what ${noun} is, so it can't be removed. You can still move it.`;
  }
  const held = section.holds?.(text) ?? 0;
  if (held > 0) {
    return `Holds ${held} ${heldUnit}${held === 1 ? "" : "s"}. Remove ${
      held === 1 ? "it" : "them"
    } first, then remove the section.`;
  }
  return null;
}

// `NoteSpec` WITH NO CONTEXT, for `FlatSection`'s reason and by the same move.
// The field prose — what an absent `hostFolder` means, why an unaskable vault
// and an empty one come out the same — is in `core/sections.ts` with the type.
export type FlatNoteSpec = NoteSpec<void>;

// How to say "the host note's own folder" for THIS note, in a plan line. The
// homepage's own folder is the vault root, which has no name a reader would
// recognise, so it gets one.
export function hostLabel(spec: FlatNoteSpec): string {
  if (spec.hostFolder == null) return "this note's folder";
  return spec.hostFolder || "the vault root";
}

// Which sections share a block with another, and with whom.
//
// A BLOCK IS THE UNIT ONCE TWO SECTIONS ARE IN IT. `ownersOf` has always
// returned a LIST, so a fence holding two sections was always representable —
// and until 4.2 §2 nothing could produce one, because every catalogue composes
// one fence per section. The `row` modifier makes one a reader can type, which
// turned a latent shape into a reachable one.
//
// What it reached was a lie. `applyFlatSections` keeps a run whole unless EVERY
// section in it is being removed, so unticking one of two previewed as "removes
// journals" and then wrote nothing at all — the editor claiming an edit it does
// not make, which is the failure the refusal path twenty lines down exists to
// prevent for a different reason.
//
// AND THE FIX IS A REFUSAL, NOT AN EXTENT RULE. The tempting repair is to work
// out which LINES inside the fence belong to the doomed section and cut those.
// It cannot be done honestly: a section's `locate` is one anchor, not a span,
// and a section like Tags is a `header:` line plus its directive — so the extent
// would have to be inferred from where the neighbouring anchors sit. Inferring
// it wrong deletes a line the reader wrote. `applyFlatSections` is a RECONCILER
// and says so — "every untouched run is re-emitted as the exact lines it was
// read as" — and 3.15 §2.3 forbids exactly this: an editor that rewrites lines
// somebody typed is a formatter, and §8 names it as the risk that destroys work.
//
// So a shared section keeps its place and the plan says why, in a sentence that
// names the block it is in and the way out of it. The same rule covers moving:
// a section in a shared block travels with the block, because the chunk the
// reorder permutes IS the block.
function sharersIn(runs: readonly FlatRun[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const run of runs) {
    if (run.sectionIds.length < 2) continue;
    for (const id of run.sectionIds) {
      out.set(id, run.sectionIds.filter((other) => other !== id));
    }
  }
  return out;
}

// Whether where this section ENDS is known rather than guessed.
//
// A section that renders one line occupies the line its `locate` anchor sits
// on and no other. That is a fact about what the catalogue wrote. A section
// that renders two — Tags, a `header:` bar and its directive — has an extent
// that could only be worked out from where its neighbours' anchors sit, and
// guessing it wrong deletes a line the reader typed.
//
// ONE PREDICATE, TWO CALLERS, and it is one rather than two because it was two:
// the plan refused what it could not place and `cellLineIn` re-derived the same
// condition to decide what it could cut. Mutating the second one changed
// nothing, because the first had already turned that case away — a gate behind
// a gate, where the one behind can rot without a test noticing. Now there is a
// single rule and either caller asking it is the same question.
const hasKnownExtent = (section: FlatSection | undefined): boolean => {
  if (!section) return false;
  return (
    soleFence(section.render()).lines.length === 1 ||
    soleFence(section.render(undefined, { form: WIDGET_FORM })).lines.length === 1
  );
};

// Which line of a block is this section's own, or null when that is not a
// question with an answer.
//
// READ OFF THE RUN AS OF 4.15 §4, not re-derived. It used to ask the section's
// own `locate` a second time, of the block it had already been attributed to —
// which was correct for as long as a section had one anchor anywhere. An
// instance's anchor is an ordinal over the WHOLE note, so asked of a single
// fence every card in it answers with that fence's first card, and a partial
// removal would cut the wrong line. `parseFlatSections` knows the answer because
// it is the walk that assigned it; this reads what that recorded.
//
// A SECTION THE RUN DOES NOT LIST IS NULL, which is the same answer the missing
// anchor used to give and the safe one for the same reason.
function cellLineIn(
  section: FlatSection | undefined,
  run: FlatRun
): number | null {
  if (!hasKnownExtent(section) || !section) return null;
  return run.lineOf[section.id] ?? null;
}

// ── reordering INSIDE one block (4.44.1) ──────────────────────────────
//
// THE RULE ABOVE IS ABOUT LEAVING A BLOCK, AND IT WAS READ AS BEING ABOUT
// MOVING AT ALL. "A section in a shared block travels with the block, because
// the chunk the reorder permutes IS the block" — true of the chunk permutation,
// and it made every move naming a grouped section a refusal, including the one
// move that never leaves the fence: two cells of one row trading places.
//
// The editor OFFERS that move. A grouped row is in a band, so it has arrows,
// it is a drag source and it is a drop target — and on the homepage four of the
// seven rows are in one group, so the commonest reorder on the commonest page
// was the refused one. The reader dragged, the list re-drew in the new order,
// the footer said "No changes", and Save was disabled. Nothing told them why:
// the sentence naming the block is in the Changes tab, behind a tab nobody
// opens when the button says there is nothing to save.
//
// AND THE WRITE COULD ALWAYS DO IT. Nothing crosses a fence, no fence is
// created or emptied, no delimiter changes meaning: the anchors trade lines
// inside one body and every `row`, `cell`, `tab` and `frame` line stays exactly
// where it was. That is why this is a permutation here rather than a call into
// `moveCell` — the cell machinery exists for a widget CHANGING blocks, and
// borrowing it would be re-deriving a structure that is not moving.
//
// WHAT IT REFUSES, AND EACH IS THE SAME REFUSAL AS BEFORE:
//
//   • A member whose extent is a guess (`hasKnownExtent`) — the same predicate
//     the partial removal asks, for the same reason: a section rendering a bar
//     and a directive has an end nothing can bound, so its lines cannot be
//     lifted without guessing.
//   • A member being removed in the same save. The cut below is computed from
//     `run.lineOf`, so the two edits share one set of indices and would have to
//     agree about the order they happen in. They do not have to be able to.
//   • A member that is pinned — the page head, which `holdPinned` has already
//     put back where the file has it.
//   • An arrangement that INTERLEAVES the block with anything else. That is a
//     section moving INTO or THROUGH the group, which is the move the refusal
//     was always about and which this does not touch: the members have to come
//     out contiguous, in some order, or the answer is no.
//
// Null for "nothing to do" as well as for "cannot" — the two are the same
// answer to the caller, which is `applyFlatSections`' own null-means-no-change
// contract one level down.
function cellOrderIn(
  run: FlatRun,
  target: readonly string[],
  byId: Map<string, FlatSection>
): string[] | null {
  const ids = run.sectionIds;
  if (ids.length < 2) return null;
  for (const id of ids) {
    if (!target.includes(id)) return null;
    if (!hasKnownExtent(byId.get(id))) return null;
    if (byId.get(id)?.pinned === true) return null;
    if (run.lineOf[id] == null) return null;
  }
  const at = ids.map((id) => target.indexOf(id)).sort((a, b) => a - b);
  if (at[at.length - 1] - at[0] !== at.length - 1) return null;
  const next = at.map((i) => target[i]);
  return next.every((id, i) => id === ids[i]) ? null : next;
}

// "Diary" / "Diary and Journals" / "Diary, Journals and Tags" — the co-tenants,
// named so the sentence reads as one about the reader's page.
const andList = (labels: string[]): string =>
  labels.length <= 1
    ? labels.join("")
    : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;

export function planFlatSections(
  text: string,
  spec: FlatNoteSpec,
  requested: readonly SectionWant[]
): SectionOp[] {
  const { sections, noun, heldUnit } = spec;
  const planSegs = segment(text.split("\n"));
  const runs = parseFlatSections(text, sections);
  const order = runs.flatMap((r) => r.sectionIds);
  const byId = new Map(sections.map((s) => [s.id, s]));
  // The solo-bar repair, in `core/sections.ts` since 5.24 along with the whole
  // of its argument — which this file used to carry and which the dashboard
  // planner carried a second time.
  const barless = barlessRuns(runs, planSegs, byId, undefined, requested, spec);
  const sharers = sharersIn(runs);
  const present = new Set(order);
  // A PINNED SECTION KEEPS THE INDEX THE FILE GIVES IT, whatever the window was
  // holding when Save was pressed. `planDiarySections` normalises here for the
  // stated reason that the plan and the write must not disagree about where a
  // section ended up, and it is the same reason here — with one of its own on top:
  // the editor already declines to offer the move (`bandOf` puts an immovable row
  // in no band), so anything that reaches this line is a `want` built somewhere
  // else. A command, a stale window, a future caller. The refusal belongs in the
  // model rather than in the one window that happens to ask politely.
  const want = holdPinned(
    order,
    idsOf(requested),
    (id) => byId.get(id)?.pinned === true
  );
  const rewriting = new Set(reconfigured([...present], requested));

  const ops: SectionOp[] = [];

  // WHO IS ACTUALLY GOING, decided before a single op is written.
  //
  // It has to be a pass of its own, because whether one section can be removed
  // depends on what happens to another: a block is removed whole or kept whole,
  // and a section stays for THREE reasons — the reader kept it, it is locked or
  // holding content, or a section it shares a block with is staying for either
  // of those. The last is the one that needs a second look at the answer, which
  // is what a single loop in file order cannot do.
  const refusals = new Map<string, string>();
  const going = new Set<string>();
  for (const id of order) {
    const section = byId.get(id);
    if (!section || want.includes(id)) continue;
    const refusal = flatRemovalRefusal(section, text, noun, heldUnit);
    if (refusal) refusals.set(id, refusal);
    else going.add(id);
  }
  // A SECTION WHOSE BLOCK HOLDS ONE THAT IS STAYING, STAYS WITH IT. Removing it
  // alone means cutting lines out of a block the reader arranged, and where
  // those lines end cannot be known — a section's `locate` is one anchor, not a
  // span. Unticking every section in a block still empties it, which is the
  // path that always worked.
  //
  // ONE PASS IS ENOUGH, AND THE INVARIANT IS WORTH WRITING DOWN because the
  // obvious defensive shape here is a loop to a fixed point. Every section in a
  // run has the same co-tenants, so if one of them is staying, every other
  // member sees it on this pass and is refused for that reason. A refusal can
  // therefore never cascade into one this pass would miss — which was checked
  // by mutating: the second iteration never ran.
  for (const id of [...going]) {
    const staying = (sharers.get(id) ?? []).filter((o) => !going.has(o));
    if (!staying.length) continue;
    // UNLESS ITS EXTENT IS KNOWN RATHER THAN GUESSED, which is the whole of the
    // distinction and the reason this is not a softening of the refusal — see
    // `hasKnownExtent`. Cutting a one-line cell takes exactly what the
    // catalogue wrote and cannot reach a line the reader added.
    //
    // It matters because 4.2 composes a row: the homepage's top block holds
    // three sections, one of them locked. Without this, unticking Open tasks or
    // On this day on a page ChronoAnvil itself wrote would be refused, which is a
    // page the reader cannot manage.
    if (hasKnownExtent(byId.get(id))) continue;
    going.delete(id);
    refusals.set(
      id,
      `${byId.get(id)?.label ?? id} is in one block with ${andList(
        staying.map((o) => byId.get(o)?.label ?? o)
      )}, so it cannot be removed on its own. Untick the whole block, or split it into separate blocks first.`
    );
  }

  // Removals, keeps and reconfigures, in file order, so the plan reads down the
  // file.
  for (const id of order) {
    const section = byId.get(id);
    if (!section) continue;
    if (want.includes(id)) {
      // A TITLE IS A MISSING PART, and `extend` is the word for a section short
      // of something it should have. A reconfigure still wins the label — it is
      // the one that rewrites a line the reader may have edited — and says both.
      const noBar = barless.get(id);
      const barDetail = "this block has no title over it — one will be added";
      ops.push({
        kind: rewriting.has(id) ? "reconfigure" : noBar ? "extend" : "keep",
        sectionId: section.id,
        label: section.label,
        detail: rewriting.has(id)
          ? describeAnswers(
              section.questions?.(undefined, spec) ?? [],
              optionsFor(requested, id),
              hostLabel(spec)
            ) + (noBar ? `; ${barDetail}` : "")
          : noBar
            ? barDetail
            : "unchanged",
      });
      continue;
    }
    const refusal = refusals.get(id);
    if (refusal) {
      // ASKED FOR AND REFUSED, AND SAID SO. Silently keeping a section the
      // reader unticked would be the editor lying.
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

  const added = addOps(
    want,
    (id) => present.has(id),
    byId,
    (s) => `adds ${s.label.toLowerCase()}`
  );
  const adding = added.adding;
  ops.push(...added.ops);

  // Moves, against the arrangement the adds and removes will leave behind, so
  // a move is reported against the final order rather than an intermediate one
  // nobody will ever see. One band, so no partition.
  const { target } = finalOrder(order, want, adding);
  // A SECTION IN A SHARED BLOCK TRAVELS WITH THE BLOCK. The reorder pass
  // permutes CHUNKS and a chunk is a block, so a move naming one of two
  // sections inside one is a move that cannot happen — and reporting it would
  // be the same lie the removal above refuses. Everything around it is
  // unaffected: a section in its own block still moves past a shared one
  // freely, and the shared block goes with whichever of its own sections the
  // reorder carries.
  const runOf = new Map(
    runs.flatMap((r) => r.sectionIds.map((id) => [id, r] as [string, FlatRun]))
  );
  for (const op of moveOpsFor(order, want, adding, byId)) {
    const with_ = op.sectionId ? sharers.get(op.sectionId) : undefined;
    if (!with_?.length) {
      ops.push(op);
      continue;
    }
    // UNLESS THE MOVE STAYS INSIDE THE BLOCK (4.44.1), which is the one shape of
    // "moves with it" that does not move the block at all — two cells of one row
    // trading places. `regroupFlatNote`'s phase three settles the order inside a
    // block and always has; what this refusal did was tell the reader it could
    // not be done, in the one window that then went on to do it.
    //
    // SILENT HERE RATHER THAN A `move` OP, because the op belongs to the pass
    // that performs it. `section-editor.ts::layoutOps` runs `regroup` as a dry
    // run and reports what it ACTUALLY did — the rule that pane was built on —
    // and a `move` from this function beside a `move` from that one would count
    // one reorder twice on the button the reader is looking at.
    const inside = op.sectionId ? runOf.get(op.sectionId) : undefined;
    if (inside && cellOrderIn(inside, target, byId)) continue;
    // AND A BLOCK HOLDING A PINNED SECTION DOES NOT TRAVEL AT ALL (4.11). This is
    // the one route to moving the page head that `holdPinned` cannot see: it
    // permutes ids, and a chunk is a BLOCK — so a reader who typed the head and
    // another section into one fence could move that other section and take the
    // head along with it. The head is held in place, its co-tenant is reported as
    // moving, and the write carries both.
    //
    // REFUSED ON THE CO-TENANT rather than on the head, because the co-tenant is
    // what was asked to move and a plan names what the reader did. The sentence
    // says which block, which is the way out of it — the same shape the removal
    // refusal above uses, for the same reason.
    const pinnedWith = with_.filter((o) => byId.get(o)?.pinned === true);
    if (pinnedWith.length) {
      ops.push({
        kind: "keep",
        sectionId: op.sectionId,
        label: op.label,
        detail: `${op.label} is in one block with ${andList(
          pinnedWith.map((o) => byId.get(o)?.label ?? o)
        )}, which is always first, so nothing in that block can be moved. Split the block first.`,
      });
      continue;
    }
    ops.push({
      kind: "keep",
      sectionId: op.sectionId,
      label: op.label,
      detail: `${op.label} is in one block with ${andList(
        with_.map((o) => byId.get(o)?.label ?? o)
      )} and moves with it. Split the block to move them apart.`,
    });
  }

  const foreign = foreignOp(
    runs.filter((r) => !r.sectionIds.length && !r.filler).length,
    "block",
    "in this file"
  );
  if (foreign) ops.push(foreign);

  return ops;
}

// The note with `want`'s sections, or null if nothing would change.
//
// SPLICES SEGMENTS VERBATIM, the property that makes this a reconciler rather
// than a formatter: every untouched run is re-emitted as the exact lines it was
// read as, so a reader's blank lines, indentation and hand-written blocks all
// survive byte-for-byte.
// ── A FLAT NOTE'S ROW LOSING A CELL, AND GETTING IT BACK (4.70) ──────────
//
// THE HOMEPAGE HAS COMPOSED A ROW SINCE 4.2 AND NEITHER HALF OF THIS WORKED.
// Untick Launcher and the fence loses its line correctly; tick it again and it
// comes back as a BLOCK OF ITS OWN, above the row it was a cell of. The page
// the reader restored is not the page they started with, and the only way back
// is to drag the widget into the group by hand. Four years of releases and one
// test away from being noticed: `dashboard-sections.test.ts` checks exactly this
// round trip, and picks the first freely removable section on each page — which
// on all three of its pages was one that had no row.
//
// 4.70 PUT ROWS ON THOSE PAGES, so the test found it. The fix is the pair
// `diary-sections.ts` names in full — read `cutFromRun` and `joinRowChunk`
// there for the argument, which is the same argument and is not restated here.
// What differs is only what each catalogue can see: a flat note cuts by LINE,
// because `parseFlatSections` recorded which line is whose and `hasKnownExtent`
// has already refused the sections whose extent is a guess.

// Does this section compose a title bar of its own?
//
// ONLY ASKED OF A SECTION WHOSE EXTENT IS KNOWN, so its widget form is one line
// and a `header:` in its section form is therefore the bar the toggle drops.
// That is what makes the line above an anchor attributable at all.
const isBarLine = (line: string): boolean =>
  splitDirective(line.trim()).keyword === HEADER_KEYWORD;

const composesBar = (section: FlatSection | undefined): boolean => {
  if (!section) return false;
  const lines = soleFence(section.render()).lines;
  return (
    lines.length > 1 && splitDirective(lines[0]).keyword === HEADER_KEYWORD
  );
};

// A ROW OF ONE IS NOT A ROW — `undoRowOfOne` in `directive-grammar.ts` is the
// rule and the argument, shared with the two catalogues that cut by keyword
// rather than by line.
//
// ASKED ONLY WHERE THE CATALOGUE WROTE THE ROW, which the caller decides and is
// the whole of what keeps this a reconciler. A reader's own `row:cards` fence
// holding two `journal-card:` widgets is a row THEY made, out of widget sections
// that declare no `row` at all; cutting one of the two must leave their grammar
// exactly as they typed it, argument included. So the caller asks it only when
// every section in the run declares a row, which is true of a composed one and
// false of every hand-built fence.

export function applyFlatSections(
  text: string,
  spec: FlatNoteSpec,
  requested: readonly SectionWant[]
): string | null {
  const { sections } = spec;
  const ops = planFlatSections(text, spec, requested);
  // The same normalisation the plan performed, from the same helper and the same
  // file order. Recomputed rather than returned by `planFlatSections`, on
  // `applyDiarySections`' argument: that function answers in ops and would have to
  // grow a second return value to carry it, and a plan that hands the writer a
  // private extra is a plan the preview no longer fully describes.
  const want = holdPinned(
    parseFlatSections(text, sections).flatMap((r) => r.sectionIds),
    idsOf(requested),
    (id) => sections.find((s) => s.id === id)?.pinned === true
  );
  const { removing, adding, moving, rewriting, extending, any } =
    plannedWrites(ops);
  if (!any) return null;

  const segs = segment(text.split("\n"));
  const runs = parseFlatSections(text, sections);
  const byId = new Map(sections.map((s) => [s.id, s]));

  // The order the reorder pass is measured against, computed exactly as the plan
  // computes it — this is the second half of the note above about recomputing
  // `want` rather than being handed it, one question further in.
  const chunks: Chunk[] = [];
  for (let ri = 0; ri < runs.length; ri++) {
    const run = runs[ri];
    let lines = [...segs[run.from].lines];
    const doomed = run.sectionIds.filter((id) => removing.has(id));
    // A CELL CUT OUT OF A BLOCK THAT IS STAYING. Only reachable for a section
    // whose extent is one line — `planFlatSections` refuses the rest — so this
    // takes exactly the line the catalogue wrote and nothing adjacent to it.
    // The block's own `row` line, its `frame:` line and anything the reader put
    // beside them are untouched, which is what keeps this a reconciler.
    //
    // ONE EXCEPTION, AND IT IS THE OTHER HALF OF THE SAME RULE (4.22 §5.4). A
    // `height:` line immediately above the line being cut is not adjacent
    // furniture that happens to be nearby — it IS that section's, because a
    // height sizes the widget on the next line and nothing else. Left behind, it
    // would size whatever moved up into the gap, which is a reader removing one
    // widget from a group and watching a different one change shape.
    //
    // TAKEN HERE AS WELL AS IN `tidyHeights`, WHICH IS NOT A DOUBLE FIX. That
    // one runs in `pruned`, on the drag paths; this reconciler never calls it,
    // and the two answers together are what makes "a height cannot be orphaned"
    // true of every path rather than of most of them.
    if (doomed.length && doomed.length !== run.sectionIds.length) {
    //
    // AND ITS `header:` BAR, ON EXACTLY THE SAME ARGUMENT ONE LINE FURTHER UP
    // (4.70). A bar composed by a cell is that cell's — `composesBar` is what
    // decides so, and only a section whose widget form is a single line can
    // answer yes. Left behind, it titles whichever cell moved up into the gap,
    // which is the `height:` failure again with a label on it.
      const cut = new Set<number>();
      for (const id of doomed) {
        const at = cellLineIn(byId.get(id), run);
        if (at === null) continue;
        cut.add(at);
        let above = at - 1;
        if (above > 0 && isHeightLine(lines[above])) {
          cut.add(above);
          above--;
        }
        if (above > 0 && composesBar(byId.get(id)) && isBarLine(lines[above])) {
          cut.add(above);
        }
      }
      const remaining = tidyHeights(tidyCells(tidyTabs(lines.filter((_, i) => !cut.has(i)))));
      // THE SURVIVOR'S OWN TITLE, WHERE THERE IS EXACTLY ONE SURVIVOR. Untick
      // the cell that opened the row and the one left behind is the barless
      // one — a fence of content with nothing above it. `soloBar` fills that
      // gap and nothing else; a run with two cells left still has its bar.
      const kept = run.sectionIds.filter((id) => !removing.has(id));
      lines = run.sectionIds.every((id) => flatRow(byId.get(id)) !== undefined)
        ? undoRowOfOne(
            remaining,
            kept.length === 1 ? flatBar(byId.get(kept[0])) : undefined
          )
        : remaining;
    }
    // ALL OF THE RUN'S SECTIONS, OR NONE OF THEM — the whole-block path, which
    // is unchanged and still the only one that deletes a fence. A block emptied
    // by the cut above cannot reach it, because a partial removal by definition
    // leaves a section behind.
    if (!doomed.length || doomed.length !== run.sectionIds.length) {
      // THE ONLY WRITE THAT TOUCHES A LINE THE READER MAY HAVE EDITED, and it
      // is a splice into one span rather than a re-render of the line: the
      // label, the spacing and any spelling the catalogue would not have chosen
      // all survive. Only a section the window reported as `reconfigure` is
      // passed through at all.
      let out = lines;
      for (const id of run.sectionIds) {
        // The title the plan said this block was missing, added before the
        // answers so it cannot land between a directive and its argument span.
        // Asked of `needsSoloBar` again rather than trusted from the op, which
        // is this file's rule wherever a preview promises a write.
        if (extending.has(id)) {
          out = soloBar(out, flatBar(byId.get(id)));
        }
        if (!rewriting.has(id)) continue;
        const section = byId.get(id);
        if (!section) continue;
        out = withAnswers(
          out,
          // ── THE FORM QUESTION IS THE OPENER'S (5.21) ────────────────
          //
          // `withAnswers`' widget branch filters every `header:` line in the
          // chunk it is handed, and a chunk holding two cells has ONE bar
          // between them — the band's, composed by the cell that opens the row.
          // So a form answer arriving for the second cell took the whole
          // group's title off: `open-tasks` answered *widget* and the Lately
          // band lost its head, which is not what either answer meant.
          //
          // AND THE OPENER'S ANSWER IS KEPT, WHICH IS THE OTHER HALF. Its bar
          // IS the group's, so the toggle on the group card writes through here
          // — see `renderBlock` in `section-editor.ts`, where the control lives.
          // `journal-plan.ts` has had the refusal since 5.11 and had it as
          // "a run of one", which refused the opener along with the rest; both
          // paths now say the same sentence and say it the same way.
          section
            .questions?.(undefined, spec)
            .filter((q) => q.kind !== "form" || id === run.sectionIds[0]) ?? [],
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

  const order = sections.map((s) => s.id);
  for (const id of adding) {
    const section = byId.get(id);
    if (!section) continue;
    // A CELL GOES BACK INTO ITS ROW, NOT BESIDE IT. `joinFlatRowChunk` is what
    // makes remove-then-re-add a round trip for a grouped section; everything
    // below is the block path, unchanged, and is what runs when the row is not
    // on this page.
    if (
      joinRowChunk(
        chunks,
        section,
        undefined,
        byId,
        order,
        optionsFor(requested, id)
      )
    ) {
      continue;
    }
    const at = insertionPoint(chunks, order, id);
    // AND A CELL THAT COULD NOT REJOIN ONE IS COMPOSING A BLOCK OF ITS OWN, so
    // it takes the title a block of its own needs — `soloBar`'s third door.
    // Without it, ticking a barless cell onto a page whose row opener is not
    // there hands back exactly the headless fence the other doors exist to stop.
    const body = soloBar(
      renderFlatSection(section, optionsFor(requested, id)).split("\n"),
      flatBar(section)
    );
    // WHICH SIDE THE BLANK LINE GOES ON, and it is not always the same side.
    //
    // A composed note is `chronoanvil:spacer` and then the blocks joined by a blank
    // line — so the separator sits BETWEEN two blocks and there is none between
    // the spacer and the first one. Removal already knows this: it takes the
    // blank that FOLLOWS the section it drops, which is what keeps the note from
    // growing a gap every time something is removed.
    //
    // Inserting a leading blank is right for every position except the top, and
    // the top was unreachable until 4.10: the first section of every flat note
    // was locked, so nothing could be removed from there and nothing could be
    // added back. The page head is removable and first, which made
    // remove-then-re-add produce `spacer / blank / head / block` where the
    // composer writes `spacer / head / blank / block` — the same note, one
    // newline apart, and a broken promise. `insertionPoint`'s own comment is
    // that promise: "remove-then-re-add restores the file exactly, which is the
    // property worth having because a test can check it."
    //
    // FIRST MEANS "NO SECTION BEFORE IT", not "chunk zero" — the spacer, and any
    // prose a reader keeps above the blocks, are chunks with no ids.
    const first = !chunks.slice(0, at).some((c) => c.ids.length);
    chunks.splice(at, 0, {
      ids: [id],
      lines: first ? [...body, ""] : ["", ...body],
    });
  }

  // Reordering last, so it is a permutation of the final set.
  //
  // SECTIONS MOVE AROUND FOREIGN BLOCKS, WHICH KEEP THEIR INDEX. A reader's own
  // fence sitting between two sections being swapped has no correct
  // destination, so it stays put and the sections trade the slots they had.
  if (moving) permuteChunks(chunks, want);

  const next = chunks
    .flatMap((c) => c.lines)
    .join("\n")
    .replace(/\n{3,}%% chronoanvil-graph %%/g, "\n\n%% chronoanvil-graph %%");
  return next === text ? null : next;
}

const viewFor =
  (spec: FlatNoteSpec, text?: string) =>
  (s: FlatSection): SectionView => {
    // Resolved against the spec, because only the caller that opened the window
    // knows which file it opened. See `FlatNoteSpec.hostFolder`.
    const questions = s.questions?.(undefined, spec);
    // THE SHAPE IS `viewOf`'s, IN `core/sections.ts` (5.22). What this file used
    // to state — that a flat note has one band, so `group` is null and nothing
    // is stranded by arithmetic; and that the one row which does not move says
    // so itself through `pinned` — are that function's two defaults, argued
    // there. What is left here is the policy only this surface knows.
    return viewOf(s, {
      questions,
      ...(questions && text !== undefined
        ? { answered: answersOn(s.locate(text), questions, text) }
        : {}),
    });
  };

// What this section's OWN line already says, per question. 4.15 §4.
//
// THE WINDOW COULD NOT ASK THIS AND THE MODEL CAN. `section-editor.ts::answerIn`
// reads an answer back by finding the directive in the whole file, and refuses
// when it appears more than once — 3.18 added that refusal after `header:`, which
// repeats once per section, handed two boxes the same value and drew a control
// over another section's title. The refusal is right for a window holding a file
// and no extents.
//
// A REPEATING WIDGET MAKES ITS DIRECTIVE PLURAL BY DESIGN, so that refusal would
// take the selector away from every card the moment a page had two — which is
// the feature. The model does not have to guess: it located the section, so it
// knows which line is that section's, and reads the answer off that line alone.
//
// ONLY WHERE THE ANCHOR IS THE DIRECTIVE ITSELF, which is every widget section
// and no catalogue section whose question names a `header:` bar above its own
// anchor. Those fall through to the window's existing path and behave exactly as
// they did — this is additive, and deliberately narrower than it could be.
//
// TAKES THE OFFSET RATHER THAN THE SECTION, AS OF 4.58.0, because the dashboard
// catalogue needs the same answer and does not have a `FlatSection` to hand —
// its widget rows are `DiarySection`s adapted from one. `locate` was the only
// thing this ever read off the section, so passing its result is the whole of
// what the two callers have in common, and neither has to reconstruct a shape
// for the other.
export function answersOn(
  at: number,
  questions: readonly SectionQuestion[],
  text: string
): Record<string, string> {
  const out: Record<string, string> = {};
  if (at < 0) return out;
  const lines = text.split("\n");
  const line = text.slice(0, at).split("\n").length - 1;
  for (const q of questions) {
    // A FORM IS READ OFF THE FENCE, NOT OFF A LINE'S ARGUMENT (4.59.0), which is
    // why it is answered before the `directive` guard below rather than through
    // it. The question names `header` so the editor knows the answer is
    // WRITABLE — see `SectionEditorModal.readable` — but a section drawn as a
    // widget has no header line to read, and "there is no bar" is precisely the
    // answer rather than the absence of one.
    if (q.kind === "form") {
      out[q.key] = formAt(lines, line);
      continue;
    }
    if (!q.directive) continue;
    const span = argSpansIn(lines, q.directive, Infinity, q.part?.join).find(
      (sp) => sp.line === line
    );
    if (!span) continue;
    const whole = readArg(lines, span);
    // A COMPOUND ARGUMENT IS READ BACK THROUGH THE FUNCTION THAT WROTE IT
    // (4.16). Two questions share one argument, so each control has to be shown
    // its own piece — and `partsOf` is the only thing that knows where one ends.
    out[q.key] = q.part ? partsOf(whole, q.part.of, q.part.join)[q.part.at] : whole;
  }
  return out;
}


// ── rows, as the editor sees them ─────────────────────────────────────
//
// 4.8 §2. The catalogue has composed rows since 4.2 and the editor could only
// refuse to touch one; these two functions are the refusal turned into an
// operation. Everything they do is `moveCell`, which is lines over `segment` —
// so a regroup keeps every promise a reorder keeps, including that a run it
// does not touch comes out byte-identical.

// Which block each section is in, and which of them can leave on their own.
export function flatBlocks(
  text: string,
  sections: readonly FlatSection[]
): BlockView[] {
  const byId = new Map(sections.map((s) => [s.id, s]));
  // THE FENCE'S OWN LINES, WHICH THIS DID NOT NEED UNTIL 4.12. `loose` is a
  // question about the CATALOGUE — what does this section render — and could be
  // answered from `sections` alone. `column` is a question about the FILE: what
  // is actually in this fence, including a `header:` line the reader typed that
  // no catalogue entry knows about. So the segments are read here and indexed by
  // `run.from`, which is the numbering `whereIs` already speaks.
  const segs = segment(text.split("\n"));
  const bodyOf = (index: number): string[] => segs[index]?.lines.slice(1, -1) ?? [];
  return parseFlatSections(text, sections)
    .filter((run) => run.sectionIds.length > 0)
    .map((run) => {
      const body = bodyOf(run.from);
      // WHETHER THIS BLOCK MAY TAKE PART IN A GROUP, asked of the block and
      // answered for every section in it — because a column is a whole fence's
      // worth of lines, which is what `widgetRun` bounds.
      //
      // TWO WAYS TO BE A COLUMN, AND THE FIRST IS EASY TO FORGET: a block that is
      // ALREADY a row holds columns, one per member, and `widgetRun` refuses it —
      // correctly, because a row has more than one widget in it and cannot be
      // lifted whole. Reading `widgetRun` alone would therefore say "not a
      // column" about the only blocks that are made of nothing else, and **Add to
      // group** would never be offered again.
      //
      // `widgetRun` IS THE OTHER HALF, AND IT IS THE RULE RATHER THAN A COPY OF
      // IT (4.12 §A). It already refuses a fence that titles itself and a fence
      // holding two widgets, and it is the same function `moveCell` consults on
      // the write — so the button the editor draws and the move the Save performs
      // cannot disagree.
      //
      // AND NEVER THE PAGE HEAD, which is the one refusal `widgetRun` does not
      // make: `moveCell` refuses a run holding the page's name separately and by
      // name, so this asks the same question here rather than letting the window
      // offer a join the write declines.
      //
      // `isPageHeadLine` RATHER THAN `isTitleLine` AS OF 5.11, which is the same
      // widening `moveCell` takes and for the same reason: a journal note's head
      // is `journal-header` and an entry's is `entry-header`, so the narrower
      // question answered "not the head" about the one block on those pages that
      // is.
      const isColumn =
        !body.some(isPageHeadLine) &&
        (body.some(isRowLine) || widgetRun(body) !== null);
      return {
        ids: [...run.sectionIds],
        // A SECTION ALONE IN ITS BLOCK IS ALWAYS LOOSE, whatever its extent: the
        // whole fence is its, so nothing has to be cut out of anything. The
        // extent question is only ever about sharing.
        loose:
          run.sectionIds.length === 1
            ? [...run.sectionIds]
            : run.sectionIds.filter((id) => hasKnownExtent(byId.get(id))),
        column: isColumn ? [...run.sectionIds] : [],
        // WHICH OF THEM A `tab` LINE OPENS (4.34.2). Read from the fence rather
        // than remembered, on `column`'s own argument: this is a question about
        // the FILE, and the reader may have typed the line by hand.
        //
        // ANCHORED THE WAY `setPageBreaks` ANCHORS, walking back over a
        // `height:` before looking for the delimiter — a height sizes the line
        // under it, so it sits between the boundary and the widget. Two readings
        // of where a boundary is would put the editor's ticks and the write's
        // lines one row apart.
        pages: run.sectionIds.filter((id) => {
          const at = run.lineOf[id];
          if (at == null) return false;
          let above = at - 2;
          while (above >= 0 && isHeightLine(body[above])) above--;
          return above >= 0 && isTabLine(body[above]);
        }),
      };
    });
}

// Which block index a section is in right now, and where its lines are.
//
// TWO ANSWERS FROM ONE WALK, because they are the same lookup: the fence a
// section was attributed to, counted among the fences, and the line inside it
// its anchor sits on.
function whereIs(
  lines: readonly string[],
  sections: readonly FlatSection[],
  id: string
): { block: number; line: number | null; body: string[] } | null {
  const { at, segs } = fencesOf(lines);
  const runs = parseFlatSections(lines.join("\n"), sections);
  const run = runs.find((r) => r.sectionIds.includes(id));
  if (!run) return null;
  const block = at.indexOf(run.from);
  if (block === -1) return null;
  const body = segs[run.from].slice(1, -1);
  // BODY-RELATIVE, because that is what `moveCell` speaks and what `body` is.
  // The run records its lines counted from the opening fence, so the marker
  // comes off here — one subtraction at the one caller that wants the other
  // base, rather than two bases recorded and a caller having to know which.
  const at0 = cellLineIn(sections.find((s) => s.id === id), run);
  return {
    block,
    line: at0 === null ? null : at0 - 1,
    body,
  };
}

// Where a section joining block `block` should land, in that block's own lines.
//
// THE LAST PAGE IS THE ONE THAT MATTERS, because that is where an append lands:
// `arrival` (cell-move.ts) finds the page containing the target line, and the
// target line for a join has always been the end of the body. A group whose
// page 1 is full and whose page 2 has room is not full.
//
// NULL MEANS "NOT A ROW, SO THERE IS NO COLUMN TO COUNT", and the caller makes
// that block a group instead — the branch 4.12 §A added and the reason a join
// into a fence that was never a row writes `row` and `cell` at all.
function joinInto(body: readonly string[], block: number): CellTarget | null {
  if (!body.some(isRowLine)) return null;
  const pages = tabSlices(body);
  const span = pages[pages.length - 1] ?? { from: 0, to: body.length };
  const runs = runsOf(body.slice(span.from, span.to));
  if (runs.length < MAX_COLUMNS) {
    return { kind: "cell", block, at: body.length };
  }
  // THE FOOT OF THAT COLUMN, WHICH IS THE LAST WIDGET DEALT INTO IT — not the
  // last widget of its opening run. Past the cap a run is already part of a
  // column, so a fence asking for four has column one holding runs 1 and 3, and
  // an arrival stacking under run 1 would land ABOVE run 3's widgets rather
  // than at the bottom of what the reader can see.
  const column = dealInto(columnLoadOf(runs));
  let foot = -1;
  runs.forEach((run, n) => {
    if (n % MAX_COLUMNS === column) foot = run.widgets[run.widgets.length - 1];
  });
  if (foot < 0) return null;
  return { kind: "stack", block, at: span.from + foot, after: true };
}

// The note with its sections grouped into these blocks. 4.8 §2.
//
// ONE MOVE AT A TIME, RE-READ EACH TIME, and that is not timidity. Every move
// rewrites the note: a fence emptied by a departure disappears, a row of one
// stops being a row, and both change what block index every section after them
// has. A pass that computed all the moves up front would be computing most of
// them against a note that no longer exists — which is `indexNow`'s bug, in a
// loop, over somebody's page.
//
// TWO PHASES, AND THE ORDER IS THE WHOLE ALGORITHM. Everything that must leave
// a block leaves first, so that when the joins run, every section that has to
// move into a row is alone in a fence and can be lifted whole. Doing it the
// other way round means joining a section that is still sharing a block with
// one that is about to leave.
export function regroupFlatNote(
  text: string,
  sections: readonly FlatSection[],
  blocks: readonly (readonly string[])[],
  pages?: readonly string[]
): string | null {
  const want = blocks.filter((b) => b.length > 0);
  // Which block each section is SUPPOSED to be in, by the id of the section
  // that opens it — an id rather than an index, because indices are what all
  // this rewriting invalidates.
  const owner = new Map<string, string>();
  for (const b of want) for (const id of b) owner.set(id, b[0]);

  // HOW BIG EACH SECTION'S BLOCK WAS BEFORE ANY OF THIS, read once and never
  // again. The last phase hands a title back to a cell that has just STOPPED
  // being one, and "just" is the whole of the gate — see it for why a section
  // that was already alone must not be touched.
  const wasWith = new Map<string, number>();
  for (const b of flatBlocks(text, sections)) {
    for (const id of b.ids) wasWith.set(id, b.ids.length);
  }

  let lines = text.split("\n");
  // A CEILING RATHER THAN A `while (true)`. Each pass makes exactly one move
  // and every move settles at least one section, so twice the sections is
  // slack; what the bound really buys is that a rule I have got wrong costs a
  // note that is not regrouped rather than a plugin that does not return.
  const ceiling = sections.length * 2 + 4;

  // PHASE ONE: out. A section sharing a block with one it should not be with
  // takes a block of its own, directly after the one it is leaving.
  //
  // MEASURED AGAINST THE MEMBER THAT OPENS THE BLOCK, not against every other
  // member. A block is where its first section is; everyone else is either in
  // the same desired block as that one or is in the wrong place. Asking "does
  // anybody here disagree with me" instead marks the whole block as leaving —
  // including the section the block belongs to — and the first thing to move
  // out is then whichever one happened to be listed first.
  for (let pass = 0; pass < ceiling; pass++) {
    const now = flatBlocks(lines.join("\n"), sections);
    const leaving = now
      .filter((b) => b.ids.length > 1)
      .flatMap((b) =>
        b.ids
          .slice(1)
          .filter((id) => owner.get(id) !== owner.get(b.ids[0]))
          .filter((id) => b.loose.includes(id))
      );
    if (!leaving.length) break;
    // THE LAST ONE OUT FIRST, and it is the difference between breaking a row
    // of three into `a | b | c` and into `a | c | b`. Every departure lands
    // directly after the block it left, so taking them from the front puts each
    // new block in front of the one before it — the tail of the row comes out
    // reversed. Taking them from the back means each one lands after a block
    // that has not moved yet, and the order the reader is looking at survives.
    const at = whereIs(lines, sections, leaving[leaving.length - 1]);
    if (at?.line == null) break;
    const next = moveCell(
      lines,
      { block: at.block, from: at.line, to: at.line + 1 },
      { kind: "block", at: at.block + 1 }
    );
    // A MOVE THAT CHANGES NOTHING WOULD LOOP FOREVER. `moveCell` returns null
    // for exactly that, so it is the loop's own stop condition rather than
    // something checked separately and forgotten.
    if (!next) break;
    lines = next;
  }

  // ── BETWEEN ONE AND TWO: A BORROWED TITLE COMES OFF (5.14) ──────────
  //
  // `dropSoloBar` is `soloBar`'s inverse and this is the third caller of the
  // pair — `rowRuns` composes it, `joinRowChunk` takes it off, and a regroup
  // does both. A cell that stood alone wears the title the phase below hands
  // it; carried into a group it would be a second full-width bar inside a row
  // fence, which is the two-heads defect this release has spent two patches on.
  //
  // HERE RATHER THAN INSIDE PHASE TWO, and after phase one for the reason phase
  // one exists: everything that had to leave has left, so every section about
  // to join is alone in a fence and the bar over it is unambiguously its own.
  // Phase two then lifts `widgetRun`, which travels with whatever is above the
  // directive — so the line has to be gone before the lift rather than after.
  //
  // NON-OPENERS ONLY. The first member of a block keeps what it has: its bar,
  // if it has one, is that block's bar and titles the whole of it, which is
  // exactly what a section opening a group is entitled to do.
  //
  // MATCHED AGAINST THE DECLARED STRING, which `dropSoloBar` does and is the
  // safety here: a title the reader wrote or renamed is not this line, so it
  // stays.
  for (const b of want) {
    for (const id of b.slice(1)) {
      const bar = flatBar(sections.find((s) => s.id === id));
      if (!bar) continue;
      const at = whereIs(lines, sections, id);
      if (!at) continue;
      const next = replaceBlockBody(lines, at.block, dropSoloBar(at.body, bar));
      if (next) lines = next;
    }
  }

  // PHASE TWO: in. A section whose block is opened by another one joins that
  // block, at the end of it, which is the order `want` asked for.
  for (let pass = 0; pass < ceiling; pass++) {
    const now = flatBlocks(lines.join("\n"), sections);
    const home = new Map<string, string>();
    for (const b of now) for (const id of b.ids) home.set(id, b.ids[0]);
    const joining = want
      .flatMap((b) => b.slice(1))
      .find((id) => home.get(id) !== owner.get(id));
    if (!joining) break;
    const from = whereIs(lines, sections, joining);
    const to = whereIs(lines, sections, owner.get(joining) ?? "");
    if (!from || !to) break;
    // LIFTED WHOLE, which is what phase one guarantees: a section alone in its
    // fence travels with the bar over it, and `widgetRun` refuses anything
    // else rather than cutting a fence it cannot bound.
    const run = widgetRun(from.body);
    if (!run) break;
    // WHICH JOIN THIS IS, ASKED OF THE DESTINATION (4.12 §A).
    //
    // THE BUG THIS FIXES, AND IT WAS REACHABLE FROM THE FIRST BUTTON PRESS. This
    // always used a `cell` target — correct for a destination that is already a
    // row, and silently wrong for one that is not. `arrival` returns the run
    // BARE when the destination has neither a `row` line nor a `cell` line, and
    // says why in its own words: an undivided row stays undivided. That rule is
    // about a row; a block that is not one yet has no `row` line for the arrival
    // to join, so the directive was appended to the fence and the page STACKED
    // the two sections instead of drawing two columns.
    //
    // Nothing caught it because `test/section-rows.test.ts` only ever joined
    // into a fence that already had `row` and `cell` in it — which is every
    // fence the homepage composes, and none of the ones a reader makes by
    // pressing **Make a group** on two blocks the catalogue wrote separately.
    //
    // `group` IS THE RIGHT BRANCH RATHER THAN A SECOND SPELLING IN `arrival`,
    // and that is the whole of the fix: it writes `[...mods, row, ...rest, cell,
    // ...run]`, which is byte-identical to what `composeFlatNote` writes for the
    // same pair. `cell-move.ts` demands exactly that out loud — *two ways of
    // making one object must write one file* — so choosing the branch keeps one
    // spelling where teaching `arrival` about rows-that-are-not-rows would have
    // made two.
    //
    // `side: "right"` because a join APPENDS, which is the order `want` asked
    // for and what phase three then settles.
    // AND A FULL ROW STACKS RATHER THAN OPENING A THIRD COLUMN (4.52.1).
    // `joinInto` is the whole of that: it returns the `cell` target this line
    // always built while the row has room, and the foot of the emptier column
    // once it has not. The `group` branch below is unchanged and cannot be
    // affected — a block that is not a row has no columns to be full of.
    const dst: CellTarget =
      joinInto(to.body, to.block) ?? { kind: "group", block: to.block, side: "right" };
    const next = moveCell(lines, { block: from.block, ...run }, dst);
    if (!next) break;
    lines = next;
  }

  // PHASE THREE: order, inside a block. The two phases above put the right
  // sections in the right blocks; which COLUMN each one is only settles here,
  // because a join always appends and `applyFlatSections` reorders blocks
  // rather than what is inside one.
  //
  // ONE STEP PER PASS, AND EACH STEP FIXES THE LEFTMOST DISAGREEMENT. The
  // section that should be in column `i` trades places with whatever is there —
  // so every pass settles one more column from the left and the walk cannot
  // undo its own work.
  //
  // A SWAP RATHER THAN AN INSERT, SINCE 4.44.1, AND THE DIFFERENCE IS A COLUMN
  // THE READER DID NOT ASK FOR. This used `{ kind: "cell" }`, which OPENS a
  // column at the target — right for a section arriving from another block, and
  // wrong for two that are already here: a homepage whose aside stacks three
  // widgets in one cell came back with the reordered one in a `cell` of its own,
  // so a reorder silently became a three-column row.
  //
  // `swap` is the target built for exactly this and says so: "nothing is
  // inserted and nothing is removed, so none of the delimiter rules apply — the
  // row keeps exactly the columns it had and each one keeps its count." The
  // stacking, the widths and the pages are all somebody else's answers, and a
  // reorder has no business changing any of them.
  //
  // A HEIGHT STAYS WITH THE SLOT, which is what the one other `swap` caller
  // already does (`block-drag.ts` carries the dragged widget's height and leaves
  // the target's where it is). Two widgets trading columns keep the sizes their
  // columns had; that is a statement worth making rather than a gap, and making
  // it differently here would be two answers to one question.
  for (let pass = 0; pass < ceiling; pass++) {
    const now = flatBlocks(lines.join("\n"), sections);
    let moved = false;
    for (const b of want) {
      const here = now.find((n) => n.ids[0] === b[0] || n.ids.includes(b[0]));
      if (!here || here.ids.length < 2) continue;
      const wrong = b.findIndex((id, i) => here.ids[i] !== id);
      if (wrong === -1) continue;
      const from = whereIs(lines, sections, b[wrong]);
      const onto = whereIs(lines, sections, here.ids[wrong]);
      if (from?.line == null || onto?.line == null) break;
      const next = moveCell(
        lines,
        { block: from.block, from: from.line, to: from.line + 1 },
        { kind: "swap", block: onto.block, at: onto.line }
      );
      if (!next) break;
      lines = next;
      moved = true;
      break;
    }
    if (!moved) break;
  }

  // PHASE FOUR: pages, inside a block. 4.34.2.
  //
  // LAST, AND THE ORDER IS AS LOAD-BEARING AS THE FIRST THREE. A page boundary
  // is a delimiter between two COLUMNS, so it can only be placed once the
  // columns are settled and in the order the reader asked for — put it earlier
  // and phase three's moves would carry widgets across a boundary that was
  // already written, leaving the pages holding whatever happened to be beside
  // them.
  //
  // AND IT MOVES NOTHING. Phases one to three are `moveCell` — lines leave
  // fences and arrive in others. This one only rewrites delimiters inside a
  // fence whose contents are already right, which is why it can be a single
  // pass where the others are settle loops: there is nothing for it to
  // invalidate.
  //
  // `undefined` MEANS LEAVE THEM ALONE. A surface with no pages, and every
  // caller written before they existed, passes nothing and reaches none of this
  // — which is not the same as passing an empty list, and the difference is a
  // Save on one note silently flattening another's pages.
  if (pages) {
    const wanted = new Set(pages);
    for (let pass = 0; pass < ceiling; pass++) {
      const now = flatBlocks(lines.join("\n"), sections);
      let written = false;
      for (const block of now) {
        if (block.ids.length < 2) continue;
        const at = whereIs(lines, sections, block.ids[0]);
        if (!at) continue;
        // THE OPENER IS NEVER A BOUNDARY, which `setPageBreaks` also refuses —
        // stated here as a `slice(1)` so the two agree by construction rather
        // than by both remembering.
        const openers: number[] = [];
        for (const id of block.ids.slice(1)) {
          if (!wanted.has(id)) continue;
          const where = whereIs(lines, sections, id);
          if (where?.line != null) openers.push(where.line);
        }
        const next = setPageBreaks(at.body, openers);
        if (!next) continue;
        const rebuilt = replaceBlockBody(lines, at.block, next);
        if (!rebuilt) continue;
        lines = rebuilt;
        written = true;
        break;
      }
      if (!written) break;
    }
  }

  // PHASE FIVE: columns, inside a page. 4.52.1.
  //
  // THE CAP WRITTEN INTO THE FILE. `MAX_COLUMNS` says a row draws two columns
  // and `capColumns` (row.ts) makes that true of the RENDER whatever the fence
  // asks for — so a note nobody has saved since 4.52.1 already looks right. This
  // is the other half: the next time the section editor saves that note, the
  // file says what the page has been drawing.
  //
  // WITHOUT IT THE TWO DISAGREE FOREVER, and that is the complaint this release
  // came from — *"the groups... don't reflect what is shown in the editor"* —
  // arriving from the other direction. A fence whose body lists four columns
  // while the page draws two is a reader reading their own note and being told
  // something that is not so.
  //
  // ── LAST, AND EVERY PHASE ABOVE IS A REASON ──────────────────────────────
  //
  // AFTER THREE, because phase three settles the order inside a block by
  // comparing `want` against the file's order, and dealing CHANGES that order —
  // a fence of four comes out `1 3 2 4`. Deal first and phase three reads that
  // as the wrong order and undoes it, one swap per pass, until the ceiling
  // stops it. Deal after and the order phase has already finished; the next
  // Save is handed a `want` built from the dealt file and agrees with it, which
  // is what makes this idempotent.
  //
  // AFTER FOUR, AND THIS IS THE EDGE THAT IS EASY TO GET WRONG. A cap belongs
  // to a PAGE rather than to a fence — `tabPlan` calls `cellPlan` once per page,
  // so a two-page group draws two columns in each and a fence of three columns
  // split down the middle is already legal. Deal before the boundaries are
  // written and that fence is dealt into two columns first and paged second, so
  // a reader asking for a page break gets their widgets rearranged instead.
  // Phase four is what says where the pages are; this reads its answer.
  //
  // ── SO THE WALK IS OVER `tabSlices` ──────────────────────────────────────
  //
  // One page at a time, every line offset back into the body — `setCellWidths`'
  // shape one file over, and for its reason: a group whose page 1 is full and
  // whose page 2 has room is not full.
  //
  // ONE WIDGET PER PASS, RE-READ EACH TIME, which is the loop the three phases
  // above already are and for the reason `regroupFlatNote` gives at its head: a
  // move rewrites the fence, and every line number computed before it is a line
  // number in a note that no longer exists.
  for (let pass = 0; pass < ceiling; pass++) {
    const now = flatBlocks(lines.join("\n"), sections);
    let dealt = false;
    for (const block of now) {
      const at = whereIs(lines, sections, block.ids[0]);
      if (!at || !at.body.some(isRowLine)) continue;
      const spans = tabSlices(at.body);
      const pageSpans = spans.length ? spans : [{ from: 0, to: at.body.length }];
      let move: { from: number; to: number } | null = null;
      let onto: CellTarget | null = null;
      for (const span of pageSpans) {
        const runs = runsOf(at.body.slice(span.from, span.to));
        if (runs.length <= MAX_COLUMNS) continue;
        // THE COLUMNS AS THEY STAND, WHICH IS THE FIRST `MAX_COLUMNS` RUNS —
        // not the dealt load `joinInto` asks for. That one counts a widget in
        // the column it will be drawn in, which is the right answer for an
        // arrival from outside and the wrong one here: the run being dealt is
        // the run being asked about, so counting it as already placed would
        // send it to the column it is already in and the pass would move
        // nothing.
        const column = dealInto(columnLoadOf(runs.slice(0, MAX_COLUMNS)));
        const foot = runs[column].widgets[runs[column].widgets.length - 1];
        const first = runs[MAX_COLUMNS].widgets[0];
        move = { from: span.from + first, to: span.from + first + 1 };
        onto = { kind: "stack", block: at.block, at: span.from + foot, after: true };
        break;
      }
      if (!move || !onto) continue;
      const next = moveCell(lines, { block: at.block, ...move }, onto);
      // A MOVE THAT CHANGES NOTHING WOULD LOOP FOREVER, which is the stop
      // condition every phase above uses and the reason `moveCell` returns null
      // for it rather than the lines it was given.
      if (!next) continue;
      lines = next;
      dealt = true;
      break;
    }
    if (!dealt) break;
  }

  // ── PHASE SIX: THE TITLE A CELL TAKES BACK (5.14) ───────────────────
  //
  // THE REPORT: *"I broke up the 'inside this week' group … open tasks is
  // rendering as a widget despite it not being toggled."* It was. The open-task
  // table is the second cell of that band and composes no bar — the rollup
  // beside it writes the single one the fence gets, because a bar is a section's
  // title strip and a row is one section — so the cell that left carried a
  // `tasks-table` line and nothing else into a fence of its own. A block with no
  // title over it is drawn as a bare widget, which is what the reader saw, on a
  // row the editor was still labelling *Section*.
  //
  // `soloBar`'S FOURTH DOOR, and the same one behind the other three: `rowRuns`
  // composes a row of one this way, `cutFromRun` hands the survivor a title when
  // a removal empties the seat beside it, the add path titles a cell that could
  // not rejoin its row — and now the gesture that does exactly what those three
  // describe, from the window where the reader asks for it.
  //
  // ONLY A CELL THAT HAS JUST STOPPED BEING ONE, which `wasWith` is for and is
  // the whole of what keeps this from being the 5.11 overwrite. A barless lone
  // block has two causes — a title never given, and a reader who answered *show
  // as widget* on a section that offers the toggle — and nothing in the file
  // tells them apart. This does not have to ask: it looks at the block the
  // section was in a moment ago, and a section that was ALREADY alone is not
  // touched however barless it is. Only one that was a column of a group, in the
  // note as this function received it, is handed the name the catalogue has for
  // it standing alone.
  //
  // AND `soloBar` STILL DECLINES A FENCE THAT TITLES ITSELF, under any wording
  // or through `frame: section`. A group broken up into cells that each drew
  // their own bar is left exactly as it is.
  //
  // LAST, because every phase above moves lines between fences and this one only
  // adds a line to a fence that is already settled — the same argument phase
  // four makes for its own placement, and there is nothing after it to
  // invalidate.
  for (const block of flatBlocks(lines.join("\n"), sections)) {
    if (block.ids.length !== 1) continue;
    const id = block.ids[0];
    if ((wasWith.get(id) ?? 1) < 2) continue;
    const bar = flatBar(sections.find((s) => s.id === id));
    if (!bar) continue;
    const at = whereIs(lines, sections, id);
    if (!at) continue;
    const next = replaceBlockBody(lines, at.block, soloBar(at.body, bar));
    if (next) lines = next;
  }

  const out = lines.join("\n");
  return out === text ? null : out;
}

// One fence's body, replaced. The counterpart of `whereIs`, which reads one.
//
// EVERY OTHER FENCE IS RE-EMITTED AS THE EXACT LINES IT WAS READ AS — the
// promise `widenCells` and `splitPageIn` both make, and the property that lets
// structure be rewritten in a file somebody else arranged.
function replaceBlockBody(
  lines: readonly string[],
  block: number,
  body: readonly string[]
): string[] | null {
  const { at, segs } = fencesOf(lines);
  if (block < 0 || block >= at.length) return null;
  const out = segs.map((seg, i) =>
    i === at[block] ? [seg[0], ...body, "```"] : [...seg]
  );
  return out.flat();
}

export function flatNoteModel(spec: FlatNoteSpec): SectionModel {
  // THE CATALOGUE, PLUS EVERY PAGE WIDGET IT HAS NO OPINION ABOUT (4.12 §C).
  //
  // HERE AND NOWHERE ELSE, WHICH IS THE WHOLE OF THE SEAM. All four flat
  // catalogues build their model through this function, and every one of them
  // composes its note by handing `composeFlatNote` the bare exported array. So
  // adding the tail at this one point gives the widget door to all four surfaces
  // and to nothing that writes a file: `composeHomeNote`, `composeSearchNote` and
  // both dashboards' composers cannot see it, which makes "no composed note
  // changes" true by construction rather than by `optIn` being honoured.
  //
  // It also leaves `SEARCH_SECTIONS` and its two siblings exactly the arrays they
  // were, which matters more than it looks: the suite uses their `length` as a
  // fence count and their ids as a whole-catalogue `want`, and growing them would
  // silently turn each of those into a request to add thirty widgets.
  //
  // THE SPEC IS WIDENED RATHER THAN THE CALLS PATCHED, because `planFlatSections`
  // and `applyFlatSections` each destructure `spec.sections` themselves — a tail
  // added anywhere but here would be visible to the window and invisible to the
  // write, which is the worst of the three possible mistakes.
  // WHICH KEYWORDS THIS CATALOGUE LEAVES FREE, PROBED ONCE. The probe reads every
  // catalogue section's `locate` and is the expensive half; what a text holds is
  // a line count.
  const keywords = pageWidgetKeywords(spec.sections, spec.supplies ?? []);

  // ── and the instances THIS TEXT holds (4.15 §4, all widgets since 4.56) ─
  //
  // THE LIST STOPPED BEING A CONSTANT, AND ONLY HERE. A widget has one section
  // per occurrence, so how many sections a surface has is a question about a
  // note rather than about a catalogue. Every method below already takes the
  // text — that is what made this cheap — so each asks for the list it needs and
  // nothing caches one across two different notes.
  //
  // AND `sections()` IS THE ONE METHOD WITH NO TEXT, so it takes one. The three
  // models that cannot repeat ignore the parameter and are untouched — the same
  // shape `blocks` and `regroup` already have, where a surface fact arrives or
  // does not.
  //
  // NO TEXT NOW MEANS NO WIDGETS, WHERE IT USED TO MEAN THE UNREPEATABLE ONES.
  // A widget section is an occurrence and an occurrence is a fact about a note,
  // so with nothing to count there is nothing honest to list — and a caller with
  // a note in hand is every caller in the tree.
  const sectionsFor = (text?: string): FlatSection[] =>
    text === undefined
      ? [...spec.sections]
      : [...spec.sections, ...widgetInstances(keywords, text)];

  const specFor = (text?: string): FlatNoteSpec => ({
    ...spec,
    sections: sectionsFor(text),
  });

  // AN ID RESOLVES EVEN WHEN NOTHING LISTED IT. `widgetInstances` offers what
  // the text holds plus one spare; a reader staging three new cards in one
  // session reaches past that, and those ids are built from their own spelling
  // instead. See `instanceSectionFor`.
  const find = (id: string, text?: string): FlatSection | undefined =>
    sectionsFor(text).find((s) => s.id === id) ??
    instanceSectionFor(id) ??
    undefined;

  return {
    sections: (text) => sectionsFor(text).map(viewFor(specFor(text), text)),
    present: (text) => detectFlatSections(text, sectionsFor(text)),
    addable: (text) =>
      addableFlatSections(text, sectionsFor(text)).map(viewFor(specFor(text), text)),
    refusal: (id, text) => {
      const s = find(id, text);
      return s
        ? flatRemovalRefusal(s, text, spec.noun, spec.heldUnit)
        : null;
    },
    plan: (text, want) => planFlatSections(text, specWithWanted(specFor(text), want), want),
    apply: (text, want) => applyFlatSections(text, specWithWanted(specFor(text), want), want),
    instanceOf: (id, text, taken) => nextInstanceId(id, text, taken),
    // THE ONLY MODEL THAT IMPLEMENTS THESE, and it is not an accident of who
    // got there first: a flat note is the only surface whose catalogue composes
    // a row. See `SectionModel.blocks`.
    blocks: (text) => flatBlocks(text, sectionsFor(text)),
    regroup: (text, blocks, pages) =>
      regroupFlatNote(text, sectionsFor(text), blocks, pages),
  };
}

// The spec, with a section for every instance id the caller is asking about.
//
// WHY THE WANT HAS TO BE CONSULTED AT ALL. `planFlatSections` and
// `applyFlatSections` look each wanted id up in `spec.sections`, and a section
// they cannot find is one they silently skip. The text's instances plus one
// spare cover every id the window can OFFER; they do not cover the second and
// third new card a reader stages in one session, whose ids are legal, meaningful
// and simply not in any list built from a text that has none of them.
//
// So the wanted ids are resolved the same way `find` resolves them — from their
// own spelling — and appended. Anything already present is left alone, so this
// only ever adds, and only ever adds instances.
function specWithWanted(
  spec: FlatNoteSpec,
  want: readonly SectionWant[]
): FlatNoteSpec {
  const have = new Set(spec.sections.map((s) => s.id));
  const extra = idsOf(want)
    .filter((id) => !have.has(id))
    .flatMap((id) => instanceSectionFor(id) ?? []);
  return extra.length ? { ...spec, sections: [...spec.sections, ...extra] } : spec;
}

// ── ONE PARENT, NOT A SPOKE TO THE MIDDLE (4.68) ─────────────────────────
//
// Hidden zero-width wikilinks in a `chronoanvil-graph` comment, so Obsidian's
// Graph View and Local Graph know how the vault's composed notes hang together.
//
// UNTIL 4.68 EVERY COMPOSED NOTE NAMED `Homepage` HERE, and the graph had two
// hubs rather than one. The second was `ChronoAnvil.canvas`: a canvas node IS a
// link, so a map that points at eighteen surfaces is an eighteen-spoke star in
// the graph whether anyone wanted one or not. Two mechanisms were drawing the
// same wheel over the same set of notes, and the reader got both on top of each
// other.
//
// Only one of the two can be given up. A map that stops pointing at the vault
// is not a map, so the canvas keeps its star and this stops drawing a second
// one: a note names its PARENT and nothing else, and only the three surfaces
// that genuinely hang off the homepage — the diary dashboard, the journals
// dashboard and Search — still name it.
//
// What that buys is not just "one hub": a star says every note is equally near
// the middle, which is false, and a chain of parents says a daily entry is
// inside a week inside the diary, which is true and is the one thing the canvas
// CANNOT say, because a group box has no depth.
//
// EVERY NAME HERE MUST RESOLVE TO A NOTE THE SCAFFOLD WRITES. An unresolved
// wikilink is not inert — Obsidian draws it as a node — so a stale literal
// invents a vault the reader does not have. Four of them survived here for
// eleven releases (`02 - Weekly` and friends, the pre-2.57 folder names) and a
// fifth in the journals. `test/canvas-builder.test.ts` now fails on any name
// outside the scaffold's own list.
//
// ── WHAT 4.68 GOT ONE HOP SHORT OF (4.81) ────────────────────────────────
//
// The paragraph above promises depth — "a daily entry is inside a week inside
// the diary" — and what a COMPOSED note can say is depth between GRAINS: a
// weekly entry template names `Weekly`, which names `02 - Diary`. Every day in
// a vault named the same one note, so the graph drew a star per grain and the
// stream the promise describes existed in no vault.
//
// Depth between PERIODS cannot be composed, because the parent's NAME depends
// on the entry's date and a template has no date. So it is written when the
// entry is created: `setGraphLinks` below re-aims this block, `lineage.ts`
// decides what at, and this function keeps composing exactly what it always
// did — the shipped notes, the dashboards, the five templates, the logbooks.
export function graphLinksSection(links: readonly string[]): string {
  if (!links || links.length === 0) return "";
  const wikilinks = links.map((l) => `[[${l}|\u200B]]`).join(" ");
  return `\n\n%% chronoanvil-graph %%\n%% ${wikilinks} %%\n`;
}

// The same block, re-aimed — the half a COMPOSED note never needs.
//
// A shipped note is composed from nothing on every repair, so `graphLinksSection`
// is all it has ever taken. An ENTRY is not composed: it is a template filled in
// once and then owned by whoever writes in it, and the one thing about it that
// stays ChronoAnvil's is this comment. `diary.ts` fills the template, then points
// this line at the period the entry sits inside — see `graphParentName`.
//
// APPENDS WHEN THERE IS NO BLOCK, rather than declining. An entry written before
// 4.68 has none at all, and a note with no hidden link is a node with no edges:
// it floats. Adding a comment to the end of a file is the smallest thing that
// can be added to it, and it is the only text in an entry this plugin claims.
//
// THE REPLACEMENT IS A FUNCTION, NOT A STRING, because `$&` and friends are
// special in a replacement string and a folder a reader named `Diary $ Notes`
// would otherwise land here mangled.
export function setGraphLinks(text: string, links: readonly string[]): string {
  const validLinks = (links ?? []).filter(
    (l) => typeof l === "string" && l.trim() !== ""
  );
  if (validLinks.length === 0) {
    return GRAPH_BLOCK_RE.test(text)
      ? text
          .replace(GRAPH_BLOCK_RE, "")
          .replace(/\n{3,}/g, "\n\n")
          .replace(/\s*$/, "") + "\n"
      : text;
  }
  const block = graphLinksSection(validLinks);
  return GRAPH_BLOCK_RE.test(text)
    ? text.replace(GRAPH_BLOCK_RE, () => block.trim())
    : text.replace(/\s*$/, "") + block;
}

// The block as it is written above: the marker line, then the links line.
const GRAPH_BLOCK_RE = /%% chronoanvil-graph %%\n%%[^\n]*%%/;
