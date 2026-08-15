// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Moving one widget between the blocks of a note. 4.8 §1.
//
// ── WHAT THIS IS, NEXT TO `block-move.ts` ────────────────────────────────
//
// 4.7 moves a BLOCK: two fences trade places and nothing inside either of them
// is read. This moves a WIDGET: one directive line leaves the fence it is in
// and arrives somewhere else — another cell of the same row, another block's
// row, or a block of its own that did not exist a moment ago.
//
// They are the same kind of operation over the same list — `segment` cuts the
// note into fences and everything else, both of them splice that list, and both
// re-emit every run they did not touch as the exact lines it was read as. What
// separates them is the unit, and the unit is what a reader grabbed.
//
// ── AN INSERT, WHERE THE BLOCK DRAG IS A SWAP ────────────────────────────
//
// 4.7 chose a swap and gave good reasons: symmetric, no gap arithmetic, undone
// by repeating it. A swap cannot express THE HALF THIS RELEASE EXISTS FOR — take
// this widget out of the row — because there is no partner to put back in its
// place. So this is an insert, and what makes an insert honest is that the
// reader can SEE where it will land: the gesture drops into a drawn slot rather
// than at a seam whose meaning depends on which half of a block the pointer is
// in. See block-drag.ts for the slots and 4.8 §1.2 for why that is not the
// target 4.7 removed.
//
// ── AND THE DELIMITERS ARE THE PART THAT GOES WRONG QUIETLY ──────────────
//
// A `cell` line divides a row. Every rule below is one sentence about keeping
// what the OTHER cells say true while one of them moves, and each is stated at
// the function that owns it: `tidyCells` (a delimiter that opens nothing),
// `arrival` (the new one goes after the run, not before), `pruned` (a row of
// one is not a row).
//
// A wrong answer here does not throw. It renders as two widgets stacked in one
// column, or a column that has quietly become twice as wide, on a page the
// reader will next open in a week.

import { fencesOf } from "./block-move";
import {
  CELL_KEYWORD,
  FRAME_KEYWORD,
  HEADER_KEYWORD,
  HEIGHT_KEYWORD,
  ROW_KEYWORD,
  WIDE_KEYWORD,
  isCellLine,
  isFrameLine,
  isHeightLine,
  isRowLine,
  isSectionFence,
  isTitleLine,
  splitDirective,
} from "./directive-grammar";

// Which lines of a block a drag picked up, as an index range into the fence's
// BODY — the lines between the ``` pair, as the file has them.
//
// A RANGE RATHER THAN A LINE, because a block's own head is a cell source too:
// a full-width block holding `header:⏳ Open tasks` and `tasks-table:,period`
// is one widget with its title, and the title travels with it. A card in a row
// is the one-line case of the same thing.
//
// HALF-OPEN, `[from, to)`, so an empty range is expressible and is refused
// rather than being the same value as a one-line one.
export interface CellSource {
  block: number;
  from: number;
  to: number;
}

// Where the run is going.
//
// TWO KINDS, NOT ONE WITH A FLAG, because they are answers to different
// questions and carry different coordinates. `cell` says WHICH BLOCK and where
// in its body; `block` says only where among the blocks, because the block it
// names does not exist yet.
export type CellTarget =
  // A COLUMN OF ITS OWN, opened before the body line at `at`. `at` at or past
  // the end of the body means "after everything", which is the slot at the
  // right-hand end of a row.
  | { kind: "cell"; block: number; at: number }
  // THE SAME COLUMN AS THE WIDGET ON LINE `at`, stacked above it or below it.
  // 4.8.6: a cell has held more than one widget since 4.4 §1 and nothing could
  // put a second one there — every arrival opened a column, which is half the
  // grammar.
  | { kind: "stack"; block: number; at: number; after: boolean }
  // PLACES WITH THE WIDGET ON LINE `at`. Nothing is inserted and nothing is
  // removed: the two runs trade, wherever they are.
  | { kind: "swap"; block: number; at: number }
  // BESIDE EVERYTHING BLOCK `block` HOLDS, which makes that block a group. 4.9
  // §4. The one kind that changes what the target block IS rather than where
  // something sits inside it: the fence gains a `row` line, and what it already
  // held becomes the other column.
  //
  // A SIDE RATHER THAN A LINE, because there is no row yet and so no column
  // boundary to name. Two places exist and both of them are "the whole of the
  // other block" — which is exactly the two quarters the gesture draws.
  | { kind: "group"; block: number; side: "left" | "right" }
  // As a block of its own, before block `at`. `at` equal to the number of
  // blocks means at the end of the note.
  | { kind: "block"; at: number };

// The keywords that describe a block rather than draw in it.
//
// `header` IS NOT ONE OF THEM, and that is the distinction this set exists to
// draw. A header draws — it is the bar at the top of a section — but it is not a
// CELL, which row.ts states from the other side (`NOT_A_CELL`) and states at
// length. What this set is asked is "would the block still show anything if
// every other line went", and a fence holding a header and nothing else shows a
// title over an empty space. So a header counts as content here and does not
// count as a cell there, and neither file is wrong.
//
// `wide` IS ONE OF THEM (4.11), and it earns it on this set's own question rather
// than because it happens to sit in a fence nothing may move. A page's width shows
// nothing: a fence holding `wide` and nothing else draws an empty block that has
// made the note wider, so "would the block still show anything if every other line
// went" answers no. Registering it also keeps the line BEHIND when a widget leaves
// the block, which is the promise `widgetRun` already makes about modifiers — a
// width travelling into a row would be a page silently rewidened by a drop.
//
// AND IT IS NAMED HERE ONLY, unlike `row`, `cell` and `frame`, which `isContent`
// also tests for by hand. Those three predate the set and the doubling is
// harmless; a fourth copy would be a fourth place to keep in step for no gain,
// since a keyword in this set is already not content.
//
// `height` IS ONE OF THEM (4.22 §5.3), and it earns it on the same question.
// A height draws nothing: a fence holding `height: 240` and nothing else is an
// empty block that has described a card which is not there. Registering it also
// keeps the line BEHIND when a WHOLE BLOCK is dragged into a cell — `widgetRun`'s
// content span stops at it — which is right for the reason that file already
// gives about modifiers: a height describes a card, and the fence being emptied
// has none. The height that must TRAVEL is the one above a widget inside a group,
// and that one is carried by `runWithHeight` rather than by this set.
const STRUCTURE = new Set<string>([
  ROW_KEYWORD,
  CELL_KEYWORD,
  FRAME_KEYWORD,
  WIDE_KEYWORD,
  HEIGHT_KEYWORD,
]);

// Whether this body line draws anything at all.
//
// Blanks and `#` comments are neither structure nor content — the processor
// filters both before it dispatches, and a block of nothing but comments draws
// nothing.
function isContent(line: string): boolean {
  const t = line.trim();
  if (!t || t.startsWith("#")) return false;
  if (isRowLine(t) || isCellLine(t) || isFrameLine(t)) return false;
  return !STRUCTURE.has(splitDirective(t).keyword);
}

// Whether this body line is a widget, as opposed to the bar over one.
//
// The count that decides whether a whole block may be dragged INTO a cell: one
// widget and its title is a thing that fits in a column, and two widgets is a
// decision about where the delimiter goes that the reader has not made. 4.8
// §1.1, and §2 is where that decision has somewhere to be made.
//
// EXPORTED FOR `cell-width.ts` (4.9 §3.3), which walks the same body to find
// where each COLUMN starts. Two copies of "is this line a widget" is exactly the
// second meaning hiding in the first that the one-name-per-idea rule exists to
// stop: this one already knows that a `header:` bar is content and not a cell,
// and a resize has to make the same call for the same reason.
export function isWidget(line: string): boolean {
  return isContent(line) && splitDirective(line.trim()).keyword !== HEADER_KEYWORD;
}

// How many widgets this block holds, counting from its body.
//
// EXPORTED FOR THE GESTURE, which asks it of a block's own lines to decide
// whether that block's head may be picked up as a cell. Asking it here rather
// than counting rendered children keeps the answer in the file's terms — a
// directive that drew nothing today is still a widget in the note.
export function widgetCount(body: readonly string[]): number {
  return body.filter(isWidget).length;
}

// The run a whole block offers when it is dragged into a cell, or null when it
// has none to offer. 4.8 §1.1.
//
// WHAT A BLOCK CAN GIVE A ROW is one widget and the bar over it — the shape of
// every full-width section on the page, `header:⏳ Open tasks` above
// `tasks-table:,period`. Two widgets is not refused because it is hard; it is
// refused because putting them in a row means deciding whether they are one
// column or two, and the reader has not been asked. §2's card is where that
// question has somewhere to be asked.
//
// AND THE MODIFIERS STAY BEHIND. `frame: none` describes the block that is
// being emptied, not the widget leaving it, and carrying one into a row would
// silently restyle the row. So the run is the CONTENT span — first content line
// to last — and a modifier caught inside that span refuses the drag rather than
// travelling in it. In practice a modifier sits at the top of a fence, where it
// is outside the span and simply stays with the fence that is about to go.
export function widgetRun(
  body: readonly string[]
): { from: number; to: number } | null {
  // AND A BLOCK THAT TITLES ITSELF GIVES NOTHING (4.12 §A). One line, and it is
  // the whole of "only widgets can be grouped" on the source side, because
  // everything downstream reads this function rather than repeating its rule:
  //
  //   • `block-drag.ts` sets `CELL_TYPE` and the payload's `cell` range only
  //     where there is a run, and the side quarters gate on both — so no
  //     quarter LIGHTS UP during `dragover`. The gesture is declined before the
  //     reader commits to it, which is 4.8.7's rule and the reason there is no
  //     notice anywhere in this release.
  //   • `regroupFlatNote` phase two lifts a joining section through this, so the
  //     editor's **Make a group** cannot write the same page from the other end.
  //   • `moveCell`'s `group` branch loses its source.
  //
  // WHAT IT DELIBERATELY KEEPS. The block's own grip and its above/below slots:
  // a titled section still REORDERS, and always could. And the per-widget grips
  // inside a `frame: section` row are untouched, because a widget in a cell
  // never consults this — the run is what a WHOLE BLOCK offers.
  //
  // THIS WAS THE ADVERTISED BEHAVIOUR UNTIL NOW, which is why it is a refusal
  // rather than a fix: `widgetRun` accepted `header:` + one widget, so the drop
  // wrote the bar into the cell, `NOT_A_CELL` evicted it at render, and
  // `layOutRow` inserted the group at the first CELL child's index — leaving the
  // second column's bar below the group and the first appearing to title the
  // whole thing. It worked in the file and was wrong on the page.
  if (isSectionFence(body)) return null;
  if (widgetCount(body) !== 1) return null;
  const at = body.flatMap((l, i) => (isContent(l) ? [i] : []));
  if (!at.length) return null;
  const from = at[0];
  const to = at[at.length - 1] + 1;
  const caught = body
    .slice(from, to)
    .some((l) => isRowLine(l) || isCellLine(l) || isFrameLine(l));
  return caught ? null : { from, to };
}

const bodyOf = (fence: readonly string[]): string[] => fence.slice(1, -1);

const wrap = (open: string, body: readonly string[]): string[] => [
  open,
  ...body,
  "```",
];

// Whether the delimiter at `i` opens a cell that has anything in it.
//
// A `cell` line means "the next cell starts here". One with no cell content
// before the next delimiter opens nothing — which is what a departure leaves
// behind, and what a trailing one always was. `cellPlan` already drops the
// empty run it produces, so this is not a correctness fix; it is not leaving a
// line in the reader's file that says something about a cell that is not there.
function opensSomething(body: readonly string[], i: number): boolean {
  for (let j = i + 1; j < body.length; j++) {
    if (isCellLine(body[j])) return false;
    // A header is not cell content (row.ts, `NOT_A_CELL`), so a delimiter
    // followed by one is still looking for its cell.
    if (isWidget(body[j])) return true;
  }
  return false;
}

function tidyCells(body: readonly string[]): string[] {
  return body.filter((line, i) => !isCellLine(line) || opensSomething(body, i));
}

// The body with any `height:` line that sizes nothing taken out. 4.22 §5.4.
//
// `tidyCells`' MIRROR, AND THE SAME STANDARD. A height sizes the widget on the
// NEXT line and nothing else — `heightAbove` states that rule once — so a height
// whose next line is not a widget is a line describing a card that is not there,
// which is exactly what a departure leaves behind.
//
// WHY THIS IS ARITHMETIC AND NOT A RULE TO REMEMBER. A height is positional, and
// four different gestures can move the widget under one: a drag to another
// column, a drag out to a block of its own, a whole block dragged into a cell,
// and a section removed in the editor. Three of those already come through
// `pruned`. Answering it here means the fourth path added after this release gets
// the same answer without its author having to know the hazard exists.
//
// IT TOUCHES NOTHING ELSE. A height above a widget is the reader's, means what it
// says, and stays — including one above a widget this function is not otherwise
// interested in.
export function tidyHeights(body: readonly string[]): string[] {
  return body.filter(
    (line, i) => !isHeightLine(line) || isWidget(body[i + 1] ?? "")
  );
}

// What the block a run LEFT should look like, or null when it should go.
//
// THREE RULES, AND THEY ONLY EVER TOUCH LINES THAT DESCRIBE A SHAPE — `row`,
// `cell`, `height`, and the fence itself. Nothing here can reach a directive or a
// word the reader typed, which is the property that lets a reconciler rewrite
// structure at all. A `height:` is the one of the four a reader is likely to have
// typed by hand, so it is only ever removed when what it described has gone: the
// row that drew the cards, or the widget on the line under it.
function pruned(body: readonly string[]): string[] | null {
  // AN EMPTIED FENCE GOES. An `almanac` fence with no directives left renders
  // as an empty card — `applyLayout` drops one for the same reason, in the same
  // words.
  if (!body.some(isContent)) return null;
  // A ROW OF ONE IS NOT A ROW. The block renders identically either way, so
  // this is about what the file says: `row` over a single directive is a claim
  // about a shape that is no longer there, and the next reader to open the note
  // has to work out that it means nothing.
  //
  // AND THE HEIGHTS GO WITH THE ROW. A height sizes a CARD, `cardWidget` only
  // builds cards inside a row, and `parseHeights` refuses a height outside one
  // out loud. So leaving them here would hand the reader an error message on a
  // block they did not touch — the widget that stayed behind, wearing a refusal
  // about a line it never had a use for.
  if (widgetCount(body) < 2) {
    return body.filter(
      (l) => !isRowLine(l) && !isCellLine(l) && !isHeightLine(l)
    );
  }
  return tidyHeights(tidyCells(body));
}

// The run as it arrives, with the delimiter its new cell needs.
//
// THE DELIMITER GOES AFTER THE RUN, and this is the rule most easily got
// backwards. Landing in front of an existing cell means the delimiter that used
// to open that cell now opens OURS — so the one we add is what re-opens theirs.
// Put it before the run instead and the arrival merges into its neighbour: two
// widgets in one column, which renders as a stack and reads as a bug in the
// layout engine rather than as a line in a file.
//
// AT THE END OF THE BODY THERE IS NOTHING TO RE-OPEN, so it goes before —
// the only place the other spelling is right.
//
// AND AN UNDIVIDED ROW STAYS UNDIVIDED. A row with no `cell` line is already
// one cell per directive; adding the first delimiter would divide a row the
// reader never divided, and every other cell would keep its meaning only by
// coincidence. `composeFlatNote` makes the same choice from the other end and
// says so: a page that never asked for cells should not gain a delimiter
// between every pair.
function arrival(
  body: readonly string[],
  run: readonly string[],
  at: number
): string[] {
  if (!body.some(isRowLine) || !body.some(isCellLine)) return [...run];
  return at >= body.length
    ? [CELL_KEYWORD, ...run]
    : [...run, CELL_KEYWORD];
}

// An undivided row, written out with the delimiters it always meant.
//
// WHY A STACK NEEDS THIS AND AN INSERT DOES NOT. A row with no `cell` line is
// one column per directive — that is what the absence MEANS — so there is no
// way to say "these two share a column" without saying where every other column
// divides. `composeFlatNote` makes the same trade from the other end and
// declines it for a page that never asked for cells; here the reader HAS asked,
// by dropping one widget onto another.
//
// STRUCTURE ONLY. It inserts `cell` lines and moves nothing, so the row it
// produces renders identically to the one it was given — which is what makes it
// safe to do to a file somebody else wrote.
//
// `map[i]` is where the original line `i` ended up, so a caller holding a line
// number from before can still find its widget afterwards.
//
// EXPORTED FOR `cell-width.ts` (4.9 §3.3), which needs it for the same reason a
// stack does and states it in its own words: a weight has nowhere to be written
// until the delimiters an undivided row implies are on the page.
export function delimit(body: readonly string[]): { body: string[]; map: number[] } {
  const out: string[] = [];
  const map: number[] = [];
  let seen = 0;
  for (let i = 0; i < body.length; i++) {
    if (isWidget(body[i])) {
      if (seen > 0) out.push(CELL_KEYWORD);
      seen++;
    }
    map[i] = out.length;
    out.push(body[i]);
  }
  map[body.length] = out.length;
  return { body: out, map };
}

// The body with `range` replaced by `run`.
const splice = (
  body: readonly string[],
  range: { from: number; to: number },
  run: readonly string[]
): string[] => [...body.slice(0, range.from), ...run, ...body.slice(range.to)];

// Whether a raw run is a separator rather than the reader's writing.
const isBlankRun = (seg: readonly string[]): boolean =>
  seg.every((l) => l.trim() === "");

// The note with this run moved. Null when nothing would change.
//
// NULL-MEANS-NO-CHANGE is `swapBlocks`' contract and `applyFlatSections`', and
// it covers the case a reader makes every time they think better of a drag:
// picking a card up and dropping it back where it was. Writing the file to say
// nothing happened would put an entry in every sync log in the vault.
export function moveCell(
  lines: readonly string[],
  src: CellSource,
  dst: CellTarget
): string[] | null {
  const { at, segs } = fencesOf(lines);
  if (src.block < 0 || src.block >= at.length) return null;
  const srcFence = segs[at[src.block]];
  const srcBody = bodyOf(srcFence);
  if (src.from < 0 || src.to > srcBody.length || src.from >= src.to) return null;
  const run = srcBody.slice(src.from, src.to);
  // A RUN OF STRUCTURE IS NOT A WIDGET. Nothing in the gesture can produce one
  // — a slot is drawn from a stamped directive — but a range is arithmetic and
  // arithmetic arrives from callers that have not been written yet.
  if (!run.some(isContent)) return null;

  if (dst.kind === "block") {
    if (dst.at < 0 || dst.at > at.length) return null;
  } else {
    if (dst.block < 0 || dst.block >= at.length) return null;
    // A FENCE KIND IS NOT A DETAIL. `almanac-charts` holds chart specs and
    // `almanac` holds directives; a line that crosses between them is a widget
    // the block cannot render, and the reader would see a broken card rather
    // than a refusal. `composeFlatNote` refuses the same crossing when it
    // builds a row, and in the same terms.
    if (segs[at[dst.block]][0].trim() !== srcFence[0].trim()) return null;
  }

  // ── THE PAGE HEAD IS NOT A SOURCE AND NOT A DESTINATION (4.11) ───────
  //
  // REFUSED IN THE ARITHMETIC AS WELL AS IN THE GEOMETRY, which is this project's
  // standing pattern and not belt-and-braces for its own sake. `attachBlockHead`
  // draws no grip and no slot on the block holding the head, and the section
  // editor puts an immovable row in no band — so nothing a reader can touch
  // reaches these three lines. What reaches them is a caller: a command, a layout
  // transfer, a future gesture written by someone who has read the geometry and
  // not this file. The rule belongs where the write is.
  //
  // THREE SHAPES, WHICH ARE EVERY WAY THE HEAD COULD MOVE OR BE MERGED WITH:
  //
  //   AS A SOURCE — its whole block, or its one line lifted as a column. Both are
  //   a `run` containing the `title` directive, so one test covers them.
  //
  //   AS A DESTINATION THAT MERGES — `group` makes the head's block into a row,
  //   `cell`, `stack` and `swap` put something inside one. All four are "something
  //   else now lives in the block that holds the page's name".
  //
  //   AS A DESTINATION ABOVE IT — a block inserted at or before the head's index.
  //   `holdPinned` guarantees the same thing on the editor's side, and the two
  //   must not be able to disagree about which end of the page the name is at.
  const headBlock = at.findIndex((i) => bodyOf(segs[i]).some(isTitleLine));
  if (run.some(isTitleLine)) return null;
  if (dst.kind === "block") {
    if (headBlock !== -1 && dst.at <= headBlock) return null;
  } else if (dst.block === headBlock) {
    return null;
  }

  // The two edited bodies, keyed by the segment they belong to. One entry when
  // a card moves within its own row, which is the case that has to be done as
  // one edit rather than as a removal and an insertion into a stale body.
  const edited = new Map<number, string[] | null>();

  // ── TWO KINDS THAT ARE NOT INSERTS ──────────────────────────────────

  // PLACES WITH THE WIDGET ON LINE `at`. 4.8.6.
  //
  // NOTHING IS INSERTED AND NOTHING IS REMOVED, so none of the delimiter rules
  // below apply: the row keeps exactly the columns it had and each one keeps its
  // count. That is the whole appeal of a swap and the reason it is worth having
  // beside the insert rather than instead of it — 4.7 argued the same thing for
  // blocks, and 4.8 §1.2 says why an insert was needed as well.
  if (dst.kind === "swap") {
    const there = { from: dst.at, to: dst.at + 1 };
    const dstBody = bodyOf(segs[at[dst.block]]);
    if (there.to > dstBody.length || there.from < 0) return null;
    const theirs = dstBody.slice(there.from, there.to);
    if (!theirs.some(isContent)) return null;
    if (dst.block === src.block) {
      // OVERLAPPING RANGES ARE NOT TWO WIDGETS. A widget dropped on itself is
      // the commonest case and is caught here rather than by the equality check
      // at the end, because a partial overlap would splice nonsense first.
      if (src.from < there.to && there.from < src.to) return null;
      // The later range first, so the earlier one's indices still hold.
      const [a, b] =
        src.from < there.from
          ? [{ r: src, run: theirs }, { r: there, run }]
          : [{ r: there, run }, { r: src, run: theirs }];
      edited.set(
        at[src.block],
        splice(splice(srcBody, b.r, b.run), a.r, a.run)
      );
    } else {
      edited.set(at[src.block], splice(srcBody, src, theirs));
      edited.set(at[dst.block], splice(dstBody, there, run));
    }
    return rebuild(lines, segs, edited, -1, srcFence, run);
  }

  // THE SAME COLUMN AS THE WIDGET ON LINE `at`. 4.8.6.
  //
  // NO DELIMITER IS ADDED, which is the whole of what makes this a stack rather
  // than a column: the run lands beside its target inside whatever cell the
  // target is in, and `cellPlan` reads two directives with nothing between them
  // as one cell holding both.
  //
  // AN UNDIVIDED ROW HAS TO BE WRITTEN OUT FIRST, because in one the absence of
  // delimiters MEANS one column per directive — see `delimit`.
  if (dst.kind === "stack") {
    const same = dst.block === src.block;
    // A WIDGET DROPPED ON ITSELF. Its own two stacking halves point at its own
    // line, which is the commonest drop a reader makes and means "I have
    // changed my mind" every time.
    if (same && dst.at >= src.from && dst.at < src.to) return null;
    const base = same
      ? [...srcBody.slice(0, src.from), ...srcBody.slice(src.to)]
      : bodyOf(segs[at[dst.block]]);
    // Where the target sits once the run has been lifted out of the same body.
    let line = same && dst.at > src.from ? dst.at - run.length : dst.at;
    if (line < 0 || line >= base.length) return null;
    let body = base;
    if (body.some(isRowLine) && !body.some(isCellLine)) {
      const spread = delimit(body);
      body = spread.body;
      line = spread.map[line];
    }
    const to = line + (dst.after ? 1 : 0);
    if (same && to === src.from) return null;
    // TIDIED ONLY WHERE THE RUN LEFT FROM. Lifting a widget out of its own row
    // can leave two delimiters with nothing between them, which is `tidyCells`'
    // case exactly; the other block's body gained a line and lost nothing.
    const next = tidyCells([...body.slice(0, to), ...run, ...body.slice(to)]);
    edited.set(at[src.block], same ? next : pruned([...srcBody.slice(0, src.from), ...srcBody.slice(src.to)]));
    if (!same) edited.set(at[dst.block], next);
    return rebuild(lines, segs, edited, -1, srcFence, run);
  }

  // TWO BLOCKS BECOME ONE GROUP. 4.9 §4.
  //
  // THE ONLY MOVE THAT MAKES A ROW, and the reason it is here rather than in the
  // section editor is the same reason the drag exists at all: a group is a thing
  // about a PAGE, and until now the only way to make one was a window two clicks
  // away, under a label describing a list.
  //
  // WHAT ARRIVES IS THE WIDGET RUN, NOT THE FENCE BODY. `widgetRun` is the rule
  // and block-drag.ts sets the drag types from it: a `frame:` line describes the
  // block being emptied rather than the widget leaving it, so carrying one in
  // would silently restyle the group it just made. A block holding two widgets
  // offers no run and its drag never lights this slot up.
  if (dst.kind === "group") {
    // A BLOCK IS NOT ITS OWN OTHER COLUMN. The gesture declines this during
    // `dragover` (`inFlight`, 4.8.7), which is where a reader should meet it;
    // this is the arithmetic saying the same thing to callers not yet written.
    if (dst.block === src.block) return null;
    const dstBody = bodyOf(segs[at[dst.block]]);
    // A GROUP IS NOT MADE OUT OF A GROUP. A block that is already a row has
    // column slots of its own, which say exactly where the arrival goes; this
    // one cannot, because the side it names would have to mean a boundary the
    // reader did not point at. `rows of rows` is refused for its own reasons —
    // this is the smaller statement that a target with a `row` line is somebody
    // else's case.
    if (dstBody.some(isRowLine)) return null;
    // AND A GROUP IS NOT MADE OUT OF A SECTION (4.12 §A). The refusal in
    // `widgetRun` closes the gesture from the SOURCE end — a titled block offers
    // no run, so it cannot be dragged into a column. This is the same page
    // reached from the other end: a plain widget dropped ONTO a titled block's
    // quarter would turn that block into a row, and its bar would then render
    // below the group it titles for exactly the reasons `widgetRun` lists.
    //
    // TWO EDITS, GEOMETRY AND ARITHMETIC, which is this project's standing
    // pattern: `block-drag.ts` withholds the quarters so nothing lights up, and
    // this says the same thing to callers not yet written.
    if (isSectionFence(dstBody)) return null;
    if (!dstBody.some(isContent)) return null;
    // MODIFIERS STAY AT THE TOP, where the reader wrote them and where
    // `docs/reference.md` shows them. `row` goes under them and above the
    // content, which is `composeFlatNote`'s own spelling for a fence with no
    // modifiers in it.
    let cut = 0;
    while (
      cut < dstBody.length &&
      (isFrameLine(dstBody[cut]) || dstBody[cut].trim() === "")
    ) {
      cut++;
    }
    const mods = dstBody.slice(0, cut);
    const rest = dstBody.slice(cut);
    // ONE DELIMITER, BETWEEN THE TWO. The row is being written from nothing, so
    // there is no neighbouring cell whose opener has to be re-made — `arrival`'s
    // rule is about landing in a row that already has columns, and this is the
    // case where there are exactly two and the line between them is the only one
    // there is.
    //
    // AND THE SHAPE IS `composeFlatNote`'S, WHICH IS THE POINT. That function
    // builds a joined row as `[ROW_KEYWORD, ...first, CELL_KEYWORD, ...second]`
    // and the section editor's **Make a group** has produced exactly that since
    // 4.8. Two ways of making one object must write one file, or a reader who
    // uses both gets two spellings of the same page and the next release has to
    // support both. A `header:` bar travelling with its widget is therefore
    // whatever it already was on that path — this is not the place that decides
    // it, and deciding it differently here is how the two would drift.
    edited.set(
      at[src.block],
      pruned([...srcBody.slice(0, src.from), ...srcBody.slice(src.to)])
    );
    edited.set(at[dst.block], [
      ...mods,
      ROW_KEYWORD,
      ...(dst.side === "left"
        ? [...run, CELL_KEYWORD, ...rest]
        : [...rest, CELL_KEYWORD, ...run]),
    ]);
    return rebuild(lines, segs, edited, -1, srcFence, run);
  }


  if (dst.kind === "cell" && dst.block === src.block) {
    const rest = [
      ...srcBody.slice(0, src.from),
      ...srcBody.slice(src.to),
    ];
    // WHERE THE SLOT POINTS, AFTER THE REMOVAL. The gesture names a body line
    // in the block as it stands; taking the run out from above it moves it up
    // by exactly the run's length.
    const to = dst.at <= src.from ? dst.at : dst.at - run.length;
    // A DROP WHERE IT ALREADY IS. Both slots either side of a card name the
    // place that card is in, and putting something back where it was is not a
    // move — it is a reader changing their mind, which is a write that must not
    // happen. Read against `rest` so the two spellings of "here" are one.
    if (to === src.from) return null;
    edited.set(at[src.block], tidyCells([
      ...rest.slice(0, to),
      ...arrival(rest, run, to),
      ...rest.slice(to),
    ]));
  } else {
    edited.set(at[src.block], pruned([
      ...srcBody.slice(0, src.from),
      ...srcBody.slice(src.to),
    ]));
    if (dst.kind === "cell") {
      const body = bodyOf(segs[at[dst.block]]);
      const to = Math.min(Math.max(dst.at, 0), body.length);
      edited.set(at[dst.block], [
        ...body.slice(0, to),
        ...arrival(body, run, to),
        ...body.slice(to),
      ]);
    }
  }

  // Where a new block would go, as a SEGMENT index, resolved before anything is
  // spliced. Indices shift when the source fence is dropped; a position taken
  // now cannot.
  const newAt =
    dst.kind === "block"
      ? dst.at < at.length
        ? at[dst.at]
        : segs.length
      : -1;

  return rebuild(lines, segs, edited, newAt, srcFence, run);
}

// The note, with these bodies rewritten and — for a move that makes one — a new
// fence spliced in at `newAt`.
//
// SHARED BY ALL FOUR KINDS, because the difference between them is entirely in
// which bodies changed. Everything from here down is the reconciler's promise:
// a segment nobody edited is re-emitted as the exact lines it was read as.
function rebuild(
  lines: readonly string[],
  segs: readonly string[][],
  edited: ReadonlyMap<number, string[] | null>,
  newAt: number,
  srcFence: readonly string[],
  run: readonly string[]
): string[] | null {
  const out: string[] = [];
  // Whether the fence we just dropped left a separator with nothing to
  // separate. One blank line goes with it, which is `applyLayout`'s manners
  // when it drops a fence and the reason a page's rhythm survives a drag.
  let owed = false;
  for (let i = 0; i <= segs.length; i++) {
    if (i === newAt) out.push(...wrap(srcFence[0], run), "");
    if (i === segs.length) break;
    const seg = segs[i];
    if (edited.has(i)) {
      const body = edited.get(i);
      if (body) out.push(...wrap(seg[0], body));
      else owed = true;
      continue;
    }
    if (owed && isBlankRun(seg)) {
      owed = false;
      // The run less one blank line, which is exactly the separator the dropped
      // fence was using. A run of one blank disappears; a longer one keeps the
      // spacing the reader chose for what is left.
      if (seg.length > 1) out.push(...seg.slice(1));
      continue;
    }
    owed = false;
    out.push(...seg);
  }

  return out.join("\n") === lines.join("\n") ? null : out;
}
