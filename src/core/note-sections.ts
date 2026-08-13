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
  instanceId,
  instanceIdOf,
  instanceSectionFor,
  locateNth,
  nextInstanceId,
  pageWidgetSections,
  repeatableInstances,
} from "./widget-sections";
import type { VaultLists } from "./widget-registry";
import { fencesOf } from "./block-move";
import { moveCell, widgetRun } from "./cell-move";
import type { CellTarget } from "./cell-move";
import {
  CELL_KEYWORD,
  ROW_KEYWORD,
  WIDE_KEYWORD,
  isRowLine,
  isTitleLine,
  isWideLine,
  parseWide,
  argSpansIn,
  readArg,
} from "./directive-grammar";
import {
  BlockView,
  SectionModel,
  SectionOp,
  SectionQuestion,
  SectionView,
  SectionWant,
  describeAnswers,
  desiredOrder,
  partsOf,
  holdPinned,
  idsOf,
  moveOps,
  optionsFor,
  reconfigured,
  withAnswers,
} from "./section-model";

// One section of a flat note.
//
// Deliberately the smallest of the four section shapes in the project. There is
// no `applies` (nothing varies — a note has the sections it has), no `band`
// (there is one), and no context parameter on `render`.
//
// AND THERE IS NOW ONE `pinned`, WHICH THERE WAS NOT (4.11). This interface used
// to say "no `pinned` (position is the reader's throughout)", and that sentence
// was true for exactly as long as every section of a flat note was one more
// widget. 4.10 put the page's own NAME at the top of four of them, and a name is
// not a widget: `DiarySection.pinned` argues it one file over and the argument
// carries across unchanged — *a page's own name being somewhere other than the
// top is a page with its title in the middle of it*.
//
// WHAT DOES NOT CARRY ACROSS IS THE BAND HALF. On a dashboard the head is
// `band: "head"`, and a band of one is immovable by the arithmetic `isMovable`
// already does — the flag is a second statement of the same fact there. A flat
// note has one band, so there is no arithmetic to lean on and the flag is the
// whole of the mechanism here.
export interface FlatSection {
  id: string;
  label: string;
  blurb: string;
  // The glyph a row is tokened with. Where the section renders a header bar
  // this is that bar's own emoji, so the row and the note agree — the rule
  // `DiarySection.icon` and `JournalSection.icon` both follow. Where a section
  // draws its own card and has no header line, it is chosen to match what the
  // card shows.
  icon: string;
  // LOCKED sections cannot be removed. They can still be moved: the lock is on
  // existence, not on order — 2.60.2's distinction, and it holds here without
  // qualification because a flat note has no band arithmetic that could strand
  // a section the way the dashboard masthead strands `summary`.
  locked: boolean;
  // PINNED sections cannot be moved. They can still be REMOVED, which is the
  // other half of the same distinction and the reason these are two fields
  // rather than one: the page head is a coherent thing to want gone — the note's
  // name is in the tab, the file explorer and the window — and an incoherent
  // thing to want third.
  //
  // ABSENT MEANS NO, and every section but one leaves it out. `viewOf` turns it
  // into `SectionView.movable`, which is where the editor reads it; nothing in
  // this file asks it directly except the two `holdPinned` calls that keep the
  // write side honest when a stale `want` disagrees.
  pinned?: boolean;
  // How many lines of the READER'S OWN content this section holds, for a
  // section whose body is theirs rather than the catalogue's. Absent means
  // removing it costs nothing but the section.
  holds?: (text: string) => number;
  // Offered but not shipped: in `sections()` and `addable`, absent from
  // `compose`. `DiarySection.optIn`'s meaning exactly.
  optIn?: boolean;
  // Whether a page may hold more than one of these. 4.15 §4.
  //
  // ABSENT MEANS ONE, which every section in every catalogue means and which is
  // what the whole model assumed before this field: a section is located by one
  // anchor and owns one run. A repeating section does not change that — it is
  // one of a family whose members each own a run — and this flag exists so the
  // ADD LIST knows to keep offering it once it is present. `viewOf` carries it
  // out to `SectionView.repeatable`, which is where the editor reads it.
  repeatable?: boolean;
  // Which composed ROW this section is a cell of, or absent for a section that
  // takes a block of its own. 4.2 §2.
  //
  // AN ID RATHER THAN A FLAG, because a page has more than one row and adjacent
  // rows have to be told apart — two rows running together would compose as one
  // block of six cells, which is the near-miss the `row` grammar refuses when a
  // reader types it and which a composer must not create by accident.
  //
  // CONSECUTIVE MEMBERS ONLY. A row is a block, a block is a contiguous run of
  // the note, so two sections with the same `row` and another section between
  // them are not a row and are not composed as one. The catalogue's order is
  // what makes a row, which keeps this one fact in one place.
  //
  // A SECTION IN A ROW STILL RENDERS ALONE when it is ADDED back later, because
  // `renderFlatSection` composes one section and knows nothing about its
  // neighbours. That is the honest outcome rather than a gap: re-adding gives
  // the reader the section in a block of its own, which they can then move into
  // the row by hand. Guessing that it wanted to rejoin a row would mean writing
  // into a block they may have arranged since.
  row?: string;
  // Which CELL of that row this section shares, or absent for a section that
  // takes a cell of its own. 4.4 §3.
  //
  // AN ID FOR `row`'s REASON, one level in: a row has more than one cell, and
  // two sections that happen to be adjacent are not in the same one unless they
  // say so. Consecutive members of a row carrying the same id share a cell and
  // stack inside it; anything else starts the next cell.
  //
  // ABSENT IS NOT A VALUE. Two sections that both leave this out do NOT share a
  // cell — they each get their own, which is what a row meant before cells
  // existed. That is the property that keeps this additive: a catalogue where
  // nobody declares a cell composes exactly the note it composed before, `cell`
  // lines and all, which is to say none.
  //
  // `renderFlatSection` ignores it, as it ignores `row`, and for the same
  // reason: a section added back arrives in a block of its own rather than
  // writing itself into a cell the reader may have rearranged since.
  cell?: string;
  render: (opts?: Record<string, unknown>) => { fence: string; lines: string[] };
  // What this section can be asked, and where the answer is written.
  //
  // A FUNCTION OF THE SPEC rather than a literal, for `EntrySection.questions`'
  // reason one file over: the answers are what THIS VAULT defines — here, what
  // the host note's own folder resolves to — and a catalogue that hardcoded one
  // would be describing a vault rather than reading it.
  questions?: (spec: FlatNoteSpec) => SectionQuestion[];
  // Where this section already is in a note's text, or -1.
  //
  // MATCHES THE DIRECTIVE, NOT THE HEADER, which is the rule both diary
  // catalogues state and the reason is the same: a reader retitles a header —
  // that is what the `header:` argument is for — and matching on it would make
  // a renamed section invisible and then offer to add a second copy.
  locate: (text: string) => number;
}

// What the head is composed as, and the ids it carries. 4.10.
//
// THE THREE DESTINATIONS ARE THE VAULT'S, NOT THE CALENDAR'S. Home, Diary and
// Journals are the three places a reader goes rather than three points in time —
// which is what keeps this row and the `links:` row from being two answers to
// one question. That one keeps Today and the scope ladder; this one keeps the
// three top-level pages, and `home` leaves the `links:` line because it was the
// only destination both had.
export const PAGE_TITLE_IDS = ["home", "diary", "journals"] as const;
export const PAGE_TITLE_LINE = `title:${PAGE_TITLE_IDS.join(",")}`;

// Where a `title` line is in a note, or -1.
//
// A COLON WITH NOTHING SPACED AFTER IT, which is the whole of what tells a
// directive from a YAML key. `title` on its own is the homepage's bare form and
// `title:home,diary,journals` is every other page's; a reader's frontmatter
// `title: My Page` is neither, and matching it would report the section present
// on a note that has no head and then decline to offer one. Every directive this
// plugin writes is `keyword:value` with no space, so this is the grammar's own
// shape rather than a guard invented here.
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

// The head, as the three flat-note catalogues compose it.
//
// ONE DEFINITION, THREE CATALOGUES. Search, the diary folder note and the
// journals folder note compose exactly the same section, and three copies is
// three places for the ids to drift — which is the fault `resolveTarget` was
// exported in 4.5 to prevent, one level up. The homepage keeps its own, because
// it composes the BARE form: it already has the launcher doing this job as
// content in a cell, and a second copy as chrome would be the same destinations
// twice on one page.
//
// NOT LOCKED, on the homepage's argument for the same object: a page without a
// title card is a coherent thing to want — the note's name is in the tab, the
// file explorer and the window.
//
// PINNED, AND THAT IS 4.11's WHOLE CHANGE HERE. The four period dashboards have
// said this since 4.10 (`DIARY_SECTIONS`' own `title`, `pinned: true` plus a band
// of one); the four flat surfaces said nothing, so on the homepage, Search and
// both folder notes the head could be dragged under the charts, arrowed down the
// list, and pulled into a group by the row beneath it. One catalogue, one flag,
// and the two heads are now one decision rather than two.
export const PAGE_TITLE_SECTION: FlatSection = {
  id: "title",
  label: "Page title",
  blurb:
    "The page's own name, where it can go, and the control that renames it and edits its sections.",
  icon: "🏷️",
  locked: false,
  pinned: true,
  render: () => ({ fence: "almanac", lines: [PAGE_TITLE_LINE] }),
  locate: locateTitle,
};

// A flat note's whole markdown.
//
// NO FENCE MERGING, and this is the one thing a reader coming from
// `composeDiaryDashboard` must not carry across. That function welds a band's
// sections into a single fence, because the masthead is one card and Obsidian
// renders each block as its own sibling. A flat note has no masthead: every
// section is an independent block and always was. Copying the merge rule here
// would fuse the whole page into one fence — the exact failure 3.2 patch 3 hit
// on its first attempt, where "every body section renders into an `almanac`
// fence too, so the whole page below the card collapsed into a single block".
//
// The spacer is line 0 for the reason the banner's is: it stops a click at the
// top of the note landing inside the first widget.
export function composeFlatNote(sections: readonly FlatSection[]): string {
  // ROWS ARE THE ONE MERGE, AND THEY ARE NOT THE MERGE THE PARAGRAPH ABOVE
  // FORBIDS. What that one warns against is welding a BAND into a fence —
  // fusing sections that merely follow each other, which would collapse the
  // page. A row is the opposite: a run of sections that have SAID they are one
  // block, named by `row`, and a section without the field is untouched.
  //
  // The `row` line goes in first, before any directive, which is where a reader
  // would type it and where `parseRow` reads it from regardless.
  // WHICH ROWS DIVIDE THEMSELVES AT ALL, computed before the loop. A row where
  // nobody declares a cell composes with no `cell` lines — the 4.2 markup,
  // unchanged — and one where somebody does gets a delimiter wherever the id
  // changes. Without this a page that never asked for cells would still gain a
  // delimiter between every pair, which renders identically and reads as noise
  // the reader did not write.
  const divided = new Set(
    sections.filter((s) => !s.optIn && s.row && s.cell !== undefined).map((s) => s.row)
  );
  // Two sections share a cell only when both NAME the same one. Absent is not a
  // value: it means "a cell of my own", so two of them are two cells.
  const sameCell = (a: string | undefined, b: string | undefined): boolean =>
    a !== undefined && a === b;

  const runs: { fence: string; lines: string[] }[] = [];
  let openRow: string | null = null;
  let openCell: string | undefined;
  for (const s of sections) {
    if (s.optIn) continue;
    const { fence, lines } = s.render();
    const last = runs[runs.length - 1];
    // A row continues only while the id AND the fence kind hold. The second
    // condition is not hypothetical: the charts section is an `almanac-charts`
    // fence and could never share a block with an `almanac` one, and a
    // catalogue that asked for it would otherwise compose a fence whose kind
    // silently belongs to whichever section came first.
    if (s.row && s.row === openRow && last && last.fence === fence) {
      // The delimiter goes in only where the cell CHANGES, and never before the
      // first member — that one opens the row's first cell by being first, and
      // a leading delimiter would be a `cell` line the reader has to read past
      // to find out it means nothing.
      if (divided.has(s.row) && !sameCell(openCell, s.cell)) {
        last.lines.push(CELL_KEYWORD);
      }
      last.lines.push(...lines);
      openCell = s.cell;
      continue;
    }
    openRow = s.row ?? null;
    openCell = s.cell;
    runs.push({ fence, lines: s.row ? [ROW_KEYWORD, ...lines] : [...lines] });
  }
  const blocks = runs.map((r) =>
    ["```" + r.fence, ...r.lines, "```"].join("\n")
  );
  return "`almanac:spacer`\n" + blocks.join("\n\n") + "\n";
}

export function renderFlatSection(
  section: FlatSection,
  opts?: Record<string, unknown>
): string {
  const { fence, lines } = section.render(opts);
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
interface FlatRun {
  sectionIds: string[];
  // Which line of this run each of its sections is on, counted from the run's
  // first line — the opening fence included, which is the base both callers of
  // it already use.
  //
  // RECORDED BY THE WALK THAT ATTRIBUTED THEM (4.15 §4). It used to be worked
  // out again from the section's own anchor, which was one derivation too many
  // even before it stopped being possible: an instance's anchor is an ordinal
  // over the whole note, and asked of one fence every card in it answers with
  // the first card's line.
  lineOf: Record<string, number>;
  index: number;
  filler: boolean;
}

const isBlank = (lines: string[]): boolean =>
  lines.every((l) => l.trim() === "");

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
const withoutFrontmatter = (lines: string[]): string[] => {
  if (lines[0]?.trim() !== "---") return lines;
  // Where it closes, or -1 when it never does — an opening `---` with no close
  // is not frontmatter, and `slice(0)` hands the run back whole, which is the
  // right answer for it. Written as one expression rather than as a guard and a
  // branch: a second path here would be a path no test can tell from this one.
  const close = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  return lines.slice(close + 1);
};

// Which sections this fence holds, and which of its lines each one is on.
//
// WHY THE ORDINAL IS COUNTED HERE AND NOT INSIDE A `locate` (4.15 §4). An
// instance's id says WHICH occurrence it is — `w:journal-card#2` is the second
// `journal-card` line in the note — and a `locate` cannot answer that, because
// this function asks each fence about itself. Every fence containing a card
// would see it as the first one, so a note with three cards would report three
// copies of `#1` and hand two runs to nobody.
//
// So the count runs along the walk instead. `seen` is carried across the
// segments by `parseFlatSections`, which is the only thing that reads the note
// in order, and this is the single place an ordinal is decided.
//
// AND THE LINE COMES BACK WITH IT, which removes a re-derivation rather than
// adding one: `cellLineIn` used to work the same answer out a second time from
// the section's own anchor, and for an instance it could not — every card in a
// fence would report the fence's first card's line. Two callers needed that
// number and both have the run in hand.
function ownersOf(
  lines: string[],
  sections: readonly FlatSection[],
  seen?: Map<string, number>
): { id: string; line: number }[] {
  const text = lines.join("\n");
  const lineAt = (at: number): number => text.slice(0, at).split("\n").length - 1;
  const found: { id: string; at: number }[] = [];
  // The keywords whose sections are instances, taken from the list this note's
  // model was built with rather than from the registry — so a catalogue that
  // manages one itself is not second-guessed here.
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
    let n = seen?.get(keyword) ?? 0;
    // EVERY OCCURRENCE IN THIS FENCE, not just the first: a reader may group two
    // cards into one block, and each is its own section with its own line.
    for (let k = 1; ; k++) {
      const at = locateNth(keyword, k)(text);
      if (at < 0) break;
      found.push({ id: instanceId(keyword, ++n), at });
    }
    seen?.set(keyword, n);
  }
  return found
    .sort((a, b) => a.at - b.at)
    .map((f) => ({ id: f.id, line: lineAt(f.at) }));
}

export function parseFlatSections(
  text: string,
  sections: readonly FlatSection[]
): FlatRun[] {
  const segs = segment(text.split("\n"));
  // A SECTION IS ITS FIRST RUN, AND NOTHING AFTER IT (4.12 §A).
  //
  // THE BUG THIS CLOSES LOSES A READER'S CONTENT, SILENTLY. `ownersOf` is asked
  // of each fence on its own, and a `locate` is a match rather than a claim — so
  // two fences holding one keyword BOTH come back owning that id. Downstream,
  // `applyFlatSections`' reorder builds `byChunk` keyed by `chunks[i].ids[0]`,
  // and a `Map` keeps the last entry written under a key: the two chunks become
  // one object, which is then written into both slots. The first fence's content
  // is replaced by the second's, on Save, with nothing in the plan saying so.
  //
  // Reachable by hand today — write `on-this-day` twice on the Search note and
  // reorder anything — and about to be reachable by clicking, because §C makes a
  // keyword an id the window offers.
  //
  // A SET RATHER THAN A SMARTER `ownersOf`, and the difference is what it turns
  // the failure INTO. The second fence now owns nothing, so it is a run with no
  // `sectionIds` — which every path already knows how to treat: `flatBlocks`
  // skips it, `applyFlatSections` re-emits it byte-identically, and the plan
  // reports it as one block that is not the catalogue's. A silent content swap
  // becomes a line in the Changes tab saying a block here was left alone.
  //
  // FILE ORDER IS WHAT DECIDES, because `segs` is in file order and this walks
  // it once. The first fence in the note is the one the catalogue manages, which
  // is the only choice a reader could predict without reading this comment.
  //
  // AN INSTANCE CANNOT BE CLAIMED TWICE ANYWAY (4.15 §4), which is worth saying
  // beside the set rather than instead of it: a repeating widget's ordinal is
  // handed out by `seen` as the walk passes each occurrence, so no two runs are
  // ever offered the same one and the filter below never fires for one. The set
  // still guards every other section, which is what it was written for.
  const claimed = new Set<string>();
  const seen = new Map<string, number>();
  return segs.map((seg, i) => {
    const held = seg.kind === "fence" ? ownersOf(seg.lines, sections, seen) : [];
    const owners = held
      .filter((o) => {
        if (claimed.has(o.id)) return false;
        claimed.add(o.id);
        return true;
      })
      .map((o) => o.id);
    const lineOf: Record<string, number> = {};
    for (const o of held) if (claimed.has(o.id)) lineOf[o.id] = o.line;
    // The note's opening run carries its frontmatter, because `segment` lumps
    // every non-fence line before the first fence into one raw run. Only this
    // run can hold frontmatter, and only here is a leading `---` anything other
    // than a thematic break.
    const body = i === 0 ? withoutFrontmatter(seg.lines) : seg.lines;
    return {
      sectionIds: owners,
      lineOf,
      index: i,
      // The spacer counts as filler along with the blank separators and the
      // frontmatter: all three are structure, and reporting them as "a block
      // here isn't the catalogue's" would be true, useless and alarming on
      // every untouched note.
      filler:
        !owners.length &&
        (isBlank(body) ||
          body.every(
            (l) => l.trim() === "" || l.trim() === "`almanac:spacer`"
          )),
    };
  });
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
    return `${section.label} is part of what ${noun} is and cannot be removed. You can move it, though.`;
  }
  const held = section.holds?.(text) ?? 0;
  if (held > 0) {
    return `${section.label} has ${held} ${heldUnit}${
      held === 1 ? "" : "s"
    } in it. Remove ${held === 1 ? "it" : "them"} first, then remove the section.`;
  }
  return null;
}

export interface FlatNoteSpec {
  sections: readonly FlatSection[];
  // The folder this note itself sits in, when the caller knows it — what an
  // empty folder answer resolves to (3.15 §10.9). Absent means the caller could
  // not say, and a folder question drawn from it stays inert rather than
  // promising a default it cannot name.
  //
  // The homepage sits at the vault root, so its value is the empty string —
  // which is a KNOWN folder rather than an absent one, and the distinction is
  // exactly why this is `string | null | undefined` and not just falsy.
  hostFolder?: string | null;
  // What THIS VAULT can answer a widget's argument with. 4.15 §4.
  //
  // THE THING `needs-vault-answer` SAID WAS MISSING. `widget-registry.ts`
  // withholds five keywords from the add list because each must name a tracker,
  // a note kind or a journal, and this spec carried "the catalogue, the host
  // folder and two nouns" — nothing that could say what a vault contains. Its
  // note quotes the price of the fix as widening this type and threading the
  // lists through the model constructors, and that is what this field is.
  //
  // SUPPLIED BY THE CALLER THAT OPENED THE WINDOW, for `hostFolder`'s reason one
  // field up: only that caller knows which vault it is in. `note-sections.ts`
  // opens by forbidding itself to carry anything that says which note it is on
  // or what this vault contains, and that rule is honoured rather than broken —
  // this is data handed IN, not read.
  //
  // ABSENT IS A VAULT THAT COULD NOT BE ASKED, not an empty one, and both come
  // out as the same empty list with the same sentence over it. A journal
  // template has no vault to speak of and a test fixture has none either; both
  // want the question drawn as "there is nothing to choose" rather than as a
  // dropdown with no entries.
  vault?: VaultLists;
  // The page, named as the reader would name it, for refusal messages.
  noun: string;
  // What `holds` counts, singular. "chart" on the homepage.
  heldUnit: string;
}

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
const hasKnownExtent = (section: FlatSection | undefined): boolean =>
  section?.render().lines.length === 1;

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
  const runs = parseFlatSections(text, sections);
  const order = runs.flatMap((r) => r.sectionIds);
  const sharers = sharersIn(runs);
  const present = new Set(order);
  const byId = new Map(sections.map((s) => [s.id, s]));
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
    // On this day on a page Almanac itself wrote would be refused, which is a
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
      ops.push({
        kind: rewriting.has(id) ? "reconfigure" : "keep",
        sectionId: section.id,
        label: section.label,
        detail: rewriting.has(id)
          ? describeAnswers(
              section.questions?.(spec) ?? [],
              optionsFor(requested, id),
              hostLabel(spec)
            )
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

  // Moves, against the arrangement the adds and removes will leave behind, so
  // a move is reported against the final order rather than an intermediate one
  // nobody will ever see. One band, so no partition.
  const surviving = order.filter((id) => want.includes(id));
  const target = want.filter(
    (id) => surviving.includes(id) || adding.includes(id)
  );
  // A SECTION IN A SHARED BLOCK TRAVELS WITH THE BLOCK. The reorder pass
  // permutes CHUNKS and a chunk is a block, so a move naming one of two
  // sections inside one is a move that cannot happen — and reporting it would
  // be the same lie the removal above refuses. Everything around it is
  // unaffected: a section in its own block still moves past a shared one
  // freely, and the shared block goes with whichever of its own sections the
  // reorder carries.
  for (const op of moveOps(surviving, target, (id) => byId.get(id)?.label)) {
    const with_ = op.sectionId ? sharers.get(op.sectionId) : undefined;
    if (!with_?.length) {
      ops.push(op);
      continue;
    }
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

  const foreign = runs.filter((r) => !r.sectionIds.length && !r.filler).length;
  if (foreign) {
    ops.push({
      kind: "foreign",
      sectionId: null,
      label: "—",
      detail: `${foreign} block${foreign === 1 ? "" : "s"} in this file ${
        foreign === 1 ? "isn't" : "aren't"
      } the catalogue's; left alone`,
    });
  }

  return ops;
}

// The note with `want`'s sections, or null if nothing would change.
//
// SPLICES SEGMENTS VERBATIM, the property that makes this a reconciler rather
// than a formatter: every untouched run is re-emitted as the exact lines it was
// read as, so a reader's blank lines, indentation and hand-written blocks all
// survive byte-for-byte.
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
  const runs = parseFlatSections(text, sections);
  const byId = new Map(sections.map((s) => [s.id, s]));

  interface Chunk {
    ids: string[];
    lines: string[];
  }
  const chunks: Chunk[] = [];
  for (let ri = 0; ri < runs.length; ri++) {
    const run = runs[ri];
    let lines = [...segs[run.index].lines];
    const doomed = run.sectionIds.filter((id) => removing.has(id));
    // A CELL CUT OUT OF A BLOCK THAT IS STAYING. Only reachable for a section
    // whose extent is one line — `planFlatSections` refuses the rest — so this
    // takes exactly the line the catalogue wrote and nothing adjacent to it.
    // The block's own `row` line, its `frame:` line and anything the reader put
    // beside them are untouched, which is what keeps this a reconciler.
    if (doomed.length && doomed.length !== run.sectionIds.length) {
      const cut = new Set<number>();
      for (const id of doomed) {
        const at = cellLineIn(byId.get(id), run);
        if (at !== null) cut.add(at);
      }
      lines = lines.filter((_, i) => !cut.has(i));
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
        if (!rewriting.has(id)) continue;
        const section = byId.get(id);
        if (!section) continue;
        out = withAnswers(
          out,
          section.questions?.(spec) ?? [],
          optionsFor(requested, id)
        );
      }
      chunks.push({ ids: run.sectionIds, lines: out });
      continue;
    }
    // Removed. Take the blank separator that followed it too — otherwise every
    // removal leaves a widening gap behind.
    if (runs[ri + 1]?.filler && isBlank(segs[runs[ri + 1].index].lines)) ri++;
  }

  const order = sections.map((s) => s.id);
  for (const id of adding) {
    const section = byId.get(id);
    if (!section) continue;
    const at = insertionPoint(chunks, order, id);
    const body = renderFlatSection(section, optionsFor(requested, id)).split(
      "\n"
    );
    // WHICH SIDE THE BLANK LINE GOES ON, and it is not always the same side.
    //
    // A composed note is `almanac:spacer` and then the blocks joined by a blank
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
  if (moving) {
    const slots: number[] = [];
    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i].ids[0]) slots.push(i);
    }
    const occupants = slots.map((i) => chunks[i].ids[0]);
    const desired = desiredOrder(occupants, want);
    const byChunk = new Map(slots.map((i) => [chunks[i].ids[0], chunks[i]]));
    slots.forEach((slot, n) => {
      const wanted = byChunk.get(desired[n]);
      if (wanted) chunks[slot] = wanted;
    });
  }

  const next = chunks.flatMap((c) => c.lines).join("\n");
  return next === text ? null : next;
}

// Where a new section goes, in chunk space. Anchored to the sections the file
// actually has rather than to an absolute position, so a note someone
// rearranged keeps its arrangement — and remove-then-re-add restores the file
// exactly, which is the property worth having because a test can check it.
function insertionPoint(
  chunks: { ids: string[] }[],
  order: string[],
  id: string
): number {
  const rank = order.indexOf(id);
  let after = -1;
  for (let i = 0; i < chunks.length; i++) {
    const ranks = chunks[i].ids
      .map((k) => order.indexOf(k))
      .filter((r) => r !== -1);
    if (!ranks.length) continue;
    if (Math.max(...ranks) > rank) return after === -1 ? i : after + 1;
    after = i;
  }
  return after === -1 ? chunks.length : after + 1;
}

const viewFor =
  (spec: FlatNoteSpec, text?: string) =>
  (s: FlatSection): SectionView => {
    const questions = s.questions?.(spec);
    return {
      ...viewOf(s),
      // Resolved against the spec, because only the caller that opened the
      // window knows which file it opened. See `FlatNoteSpec.hostFolder`.
      ...(questions ? { questions } : {}),
      ...(questions && text !== undefined
        ? { answered: answersOn(s, questions, text) }
        : {}),
    };
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
function answersOn(
  s: FlatSection,
  questions: readonly SectionQuestion[],
  text: string
): Record<string, string> {
  const out: Record<string, string> = {};
  const at = s.locate(text);
  if (at < 0) return out;
  const lines = text.split("\n");
  const line = text.slice(0, at).split("\n").length - 1;
  for (const q of questions) {
    if (!q.directive) continue;
    const span = argSpansIn(lines, q.directive).find((sp) => sp.line === line);
    if (!span) continue;
    const whole = readArg(lines, span);
    // A COMPOUND ARGUMENT IS READ BACK THROUGH THE FUNCTION THAT WROTE IT
    // (4.16). Two questions share one argument, so each control has to be shown
    // its own piece — and `partsOf` is the only thing that knows where one ends.
    out[q.key] = q.part ? partsOf(whole, q.part.of, q.part.join)[q.part.at] : whole;
  }
  return out;
}

const viewOf = (s: FlatSection): SectionView => ({
  id: s.id,
  label: s.label,
  blurb: s.blurb,
  icon: s.icon,
  removable: !s.locked,
  // NOTHING IS STRANDED BY ARITHMETIC HERE, which is what this line used to say
  // in full: a flat note has one band, so no section is immovable because of
  // where the other sections are, the way the dashboard masthead makes `summary`
  // immovable by being alone in its band. That is still true and is no longer the
  // whole answer.
  //
  // THE ONE ROW THAT DOES NOT MOVE SAYS SO ITSELF (4.11). The head is immovable
  // by DECLARATION rather than by arithmetic — `FlatSection.pinned` — and this is
  // the only place that reads it, because `SectionView.movable` is the only thing
  // the editor asks. `bandOf` puts an immovable row in no band at all, which
  // makes it not a drag source, not a drop target, and the host of two disabled
  // arrows: three behaviours from one omission, none of them a check about which
  // section this is.
  movable: !s.pinned,
  // ONE BAND, so null, which is what the editor's "two rows may swap when
  // their groups match" rule reads as "any two rows may swap".
  group: null,
  ...(s.repeatable ? { repeatable: true } : {}),
});

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
  // `run.index`, which is the numbering `whereIs` already speaks.
  const segs = segment(text.split("\n"));
  const bodyOf = (index: number): string[] => segs[index]?.lines.slice(1, -1) ?? [];
  return parseFlatSections(text, sections)
    .filter((run) => run.sectionIds.length > 0)
    .map((run) => {
      const body = bodyOf(run.index);
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
      // make: `moveCell` refuses a run holding `title` separately and by name, so
      // this asks the same question here rather than letting the window offer a
      // join the write declines.
      const isColumn =
        !body.some(isTitleLine) &&
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
  const block = at.indexOf(run.index);
  if (block === -1) return null;
  const body = segs[run.index].slice(1, -1);
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
  blocks: readonly (readonly string[])[]
): string | null {
  const want = blocks.filter((b) => b.length > 0);
  // Which block each section is SUPPOSED to be in, by the id of the section
  // that opens it — an id rather than an index, because indices are what all
  // this rewriting invalidates.
  const owner = new Map<string, string>();
  for (const b of want) for (const id of b) owner.set(id, b[0]);

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
    const dst: CellTarget = to.body.some(isRowLine)
      ? { kind: "cell", block: to.block, at: to.body.length }
      : { kind: "group", block: to.block, side: "right" };
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
  // section that should be in column `i` is moved in front of whatever is
  // there — so every pass settles one more column from the left and the walk
  // cannot undo its own work.
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
        { kind: "cell", block: onto.block, at: onto.line }
      );
      if (!next) break;
      lines = next;
      moved = true;
      break;
    }
    if (!moved) break;
  }

  const out = lines.join("\n");
  return out === text ? null : out;
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
  const base = [...spec.sections, ...pageWidgetSections(spec.sections)];

  // ── and the instances THIS TEXT holds (4.15 §4) ───────────────────────
  //
  // THE LIST STOPPED BEING A CONSTANT, AND ONLY HERE. A repeating widget has one
  // section per occurrence, so how many sections a surface has is a question
  // about a note rather than about a catalogue. Every method below already takes
  // the text — that is what made this cheap — so each asks for the list it needs
  // and nothing caches one across two different notes.
  //
  // THE BASE IS STILL BUILT ONCE, because `pageWidgetSections` probes every
  // catalogue section's `locate` and is the expensive half; the instances are a
  // line count.
  //
  // AND `sections()` IS THE ONE METHOD WITH NO TEXT, so it takes one. The three
  // models that cannot repeat ignore the parameter and are untouched — the same
  // shape `blocks` and `regroup` already have, where a surface fact arrives or
  // does not.
  const sectionsFor = (text?: string): FlatSection[] =>
    text === undefined ? base : [...base, ...repeatableInstances(spec.sections, text)];

  const specFor = (text?: string): FlatNoteSpec => ({
    ...spec,
    sections: sectionsFor(text),
  });

  // AN ID RESOLVES EVEN WHEN NOTHING LISTED IT. `repeatableInstances` offers what
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
    regroup: (text, blocks) => regroupFlatNote(text, sectionsFor(text), blocks),
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
