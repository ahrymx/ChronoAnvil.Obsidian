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
  MAX_COLUMNS,
  ROW_KEYWORD,
  TAB_KEYWORD,
  WIDE_KEYWORD,
  isCellLine,
  isFrameLine,
  isHeightLine,
  isRowLine,
  isSectionFence,
  isTabLine,
  isPageHeadLine,
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
  // 4.34. A page boundary draws nothing, exactly as a column boundary draws
  // nothing — and this one line is what keeps every count in this file right:
  // `isWidget` reads `isContent`, `widgetCount` reads `isWidget`, and a `tab`
  // counted as a widget would let a two-widget block believe it has three.
  TAB_KEYWORD,
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
  if (!t || t.startsWith("#") || t.startsWith("```")) return false;
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
export function isWidget(line: string): boolean {
  const kw = splitDirective(line.trim()).keyword;
  return isContent(line) && kw !== HEADER_KEYWORD && kw !== "button";
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
  if (isSectionFence(body)) return null;
  if (widgetCount(body) !== 1) return null;
  const at = body.flatMap((l, i) => (isContent(l) ? [i] : []));
  if (!at.length) return null;
  const from = at[0];
  const to = at[at.length - 1] + 1;
  // AND A PAGE BOUNDARY IS CAUGHT LIKE THE REST (4.34 §6). A run spanning a
  // `tab` line is two pages of a group being dragged into one cell — the
  // arrival would land both, the boundary between them would be read as a
  // column boundary by nothing at all, and what the reader would get is two
  // widgets stacked with a dead line between them.
  const caught = body
    .slice(from, to)
    .some((l) => isRowLine(l) || isCellLine(l) || isFrameLine(l) || isTabLine(l));
  return caught ? null : { from, to };
}

// ── the pages of one fence ────────────────────────────────────────────
//
// WHERE EACH PAGE OF A GROUP BEGINS AND ENDS, in the body's own line numbering.
// 4.34 §1.3.
//
// THE ONE NEW PRIMITIVE THIS FEATURE ADDS, and everything else about tabs is a
// caller of it. `cellPlan`, `columnsOf`, `setCellWidths` and `delimit` all keep
// their exact contracts; they are handed a slice instead of the whole body. A
// design that taught each of them about tabs would be four implementations of
// one walk, and the first bug would be a `cell` in tab 2 counted as a column of
// tab 1.
//
// ONE SLICE PER **DRAWN** PAGE, which is `cellPlan`'s own rule about empty runs
// stated over lines rather than over children: a page with no widget in it is a
// page nobody can see, so a trailing `tab`, two in a row and a `tab` above a
// directive that drew nothing all produce nothing here.
//
// A BODY WITH NO `tab` LINE IS ONE SLICE SPANNING IT — so a caller that never
// asks about pages gets today's answer, which is the property that makes every
// existing gesture keep working on every existing note.
//
// THE SLICE INCLUDES THE BLOCK'S OWN MODIFIERS on the first page only, because
// that is where they are written and they describe the whole fence. A caller
// that needs to ask "is this a row?" must therefore ask it of the BODY and not
// of a slice — `setCellWidths` does exactly this, and it is the reason that
// function takes both.
// ── `page` IS AN ORDINAL, NOT A POSITION IN THIS LIST ────────────────────
//
// It counts the `tab` delimiters above the slice, so the first page is 0
// whether or not it drew anything and the third is 2 whether or not the second
// did. That distinction is the one hazard in this feature that is invisible
// from either side alone:
//
//   `tabPlan` drops a page whose directives APPENDED NO CHILDREN — `on-this-day`
//   on a young vault, a `links:` row with nothing to link — because there is no
//   row to draw. This walk drops a page with no WIDGET LINE, which is not the
//   same set: a page can hold a directive that renders nothing.
//
// So a group whose page 2 drew nothing has DOM rows [1, 3] and line slices
// [1, 2, 3]. Numbered by position, a divider dragged in the second visible row
// would be told it is page 1 and would write page 2's widths — a resize
// corrupting a row nobody is looking at, which is exactly 4.34 §6's rule about
// gestures not crossing a page. Numbered by delimiter, both sides say 2, and
// the missing ordinal is simply absent from one of them.
export interface TabSlice {
  from: number;
  to: number;
  page: number;
}

export function tabSlices(body: readonly string[]): TabSlice[] {
  const holdsWidget = (from: number, to: number): boolean =>
    body.slice(from, to).some(isWidget);

  const out: TabSlice[] = [];
  let from = 0;
  let page = 0;
  for (let i = 0; i < body.length; i++) {
    if (!isTabLine(body[i])) continue;
    if (holdsWidget(from, i)) out.push({ from, to: i, page });
    // The delimiter itself belongs to neither page: it closes the one before it
    // and opens the one after, which is `cell`'s rule and the reason a slice
    // starts on the line AFTER the line that opened it.
    from = i + 1;
    page++;
  }
  if (holdsWidget(from, body.length)) {
    out.push({ from, to: body.length, page });
  }
  return out;
}

// One page's lines, by its ordinal, or null when it has none.
//
// THE ONLY WAY THE WRITERS ADDRESS A PAGE, so the ordinal rule above is applied
// in one place rather than by every caller doing its own `find`.
export function pageSlice(
  body: readonly string[],
  page: number
): { from: number; to: number } | null {
  const slice = tabSlices(body).find((s) => s.page === page);
  // WITHOUT THE ORDINAL, deliberately. A caller holding one of these is about to
  // do arithmetic on lines; handing it the page number as well invites a second
  // reading of which page it is in, and there is already exactly one.
  return slice ? { from: slice.from, to: slice.to } : null;
}

// ── making a page (4.34.1) ────────────────────────────────────────────
//
// A GRAMMAR WITH NO WAY TO REACH IT IS A GRAMMAR NOBODY USES, and this project
// has the receipt: `cell: 2` worked from 4.4 and shipped unused in every build
// until 4.9 gave it a divider to drag, because the only way to ask for one was
// to type it. `tab` shipped in exactly that state and this is the other half.
//
// WHY IT IS A SPLIT AND NOT AN "ADD". The obvious gesture is a `+` that appends
// a `tab` line — and it would do nothing at all, visibly. A page with no widget
// in it is not drawn, by design and by the rule `tabSlices` states, so appending
// a delimiter at the end of a fence produces a line in the file and no change on
// the screen. That is worse than no button.
//
// So the button takes the LAST COLUMN OF THE LAST PAGE and gives it a page of
// its own. The reader presses `+` on a two-column group and gets `[1] [2]` with
// a column each — which is the thing they were trying to find out about — and
// the second press splits again from what is left.
//
// AND THE DELIMITER IS REPLACED WHERE THERE IS ONE. If the last column was
// opened by a `cell`, that line BECOMES the `tab`: the column boundary is
// exactly where the page boundary goes, so writing both would leave a delimiter
// that opens nothing — the thing `tidyCells` exists to clean up, created on
// purpose one line earlier.
//
// A HEIGHT TRAVELS WITH ITS WIDGET, which is `runWithHeight`'s rule applied
// here: a `height:` sizes the line under it, so the cut goes above the height
// rather than between it and the card it describes.
export function splitPage(body: readonly string[]): string[] | null {
  if (!body.some(isRowLine)) return null;
  const pages = tabSlices(body);
  const last = pages[pages.length - 1];
  if (!last) return null;

  // TWO WIDGETS OR IT IS NOT A SPLIT. Taking the only widget out of a page
  // leaves that page empty, which draws nothing — the reader would press a
  // button and watch a page disappear.
  const widgets = [];
  for (let i = last.from; i < last.to; i++) {
    if (isWidget(body[i])) widgets.push(i);
  }
  if (widgets.length < 2) return null;

  let cut = widgets[widgets.length - 1];
  while (cut - 1 >= last.from && isHeightLine(body[cut - 1])) cut--;

  const indent = /^\s*/.exec(body[cut])?.[0] ?? "";
  const above = cut - 1;
  if (above >= last.from && isCellLine(body[above])) {
    const next = [...body];
    next[above] = `${/^\s*/.exec(body[above])?.[0] ?? ""}${TAB_KEYWORD}`;
    return next;
  }
  return [...body.slice(0, cut), `${indent}${TAB_KEYWORD}`, ...body.slice(cut)];
}

// The body with its page boundaries at exactly these widget lines. 4.34.2.
//
// WHAT THE SECTIONS EDITOR NEEDS, AND WHY IT IS NOT `splitPage`. That one is a
// gesture — take the last column and make a page of it — and it is the right
// shape for a `+` in a foot, where the reader is pointing at a thing and asking
// for one more. The editor is the other kind of surface entirely: it holds the
// WHOLE arrangement, the reader moves several rows at once, and Save writes the
// difference. So it states the boundaries it wants and this makes them true.
//
// `openers` ARE BODY LINE NUMBERS OF WIDGETS, one per widget that should begin a
// page. The first widget of the block is never one — the `row` line opens page
// one, exactly as it opens the first column — and one named there is ignored
// rather than refused, because the editor computing the same rule again is the
// second copy of a rule this file already owns.
//
// IT WRITES BOTH DIRECTIONS. A boundary that should be there and is not becomes
// a `tab`; one that is there and should not be becomes a `cell` — NOT nothing,
// because the two widgets it separates are still separate columns, and deleting
// the line would stack them. That is the asymmetry to get right: a page boundary
// is a column boundary that has been promoted, so demoting it returns it to what
// it was rather than removing it.
//
// A HEIGHT TRAVELS WITH ITS WIDGET, on `splitPage`'s rule and for its reason.
// ── A RUN IS NOT A COLUMN, PAST THE CAP (4.52.1) ─────────────────────────
//
// A run is what a delimiter opens; a COLUMN is what gets drawn. Below
// `MAX_COLUMNS` they are the same thing and this file had no reason to tell
// them apart. Above it they are not: the extra runs are DEALT into the columns
// there are, which `capColumns` (row.ts) does on the render and
// `regroupFlatNote`'s column phase writes into the file. So this walk answers
// *what does the fence say*, and `columnsOf` (cell-width.ts) answers *what does
// the row draw* by stopping at the cap.
//
// EVERY WIDGET LINE, NOT JUST THE FIRST. `columnsOf` needs only where a column
// starts; the phase that writes the cap into the file needs to know how many
// widgets each column already holds and which line is its foot, and both are
// this list. One walk, three answers, and no second reading of where a boundary
// is — which is the thing two readings of a fence always turn into.
export interface ColumnRun {
  // The `cell` line that opened it, or -1 for the one the `row` line opens and
  // for every column of an undivided row.
  opener: number;
  // The body lines its widgets sit on, in order. Never empty: a run with no
  // widget in it is not a column and is not returned.
  widgets: number[];
}

export function runsOf(body: readonly string[]): ColumnRun[] {
  if (!body.some(isCellLine)) {
    return body.flatMap((line, i) =>
      isWidget(line) ? [{ opener: -1, widgets: [i] }] : []
    );
  }
  const out: ColumnRun[] = [];
  let opener = -1;
  let widgets: number[] = [];
  for (let i = 0; i < body.length; i++) {
    if (isCellLine(body[i])) {
      if (widgets.length) {
        out.push({ opener, widgets });
        widgets = [];
      }
      opener = i;
      continue;
    }
    if (isWidget(body[i])) widgets.push(i);
  }
  if (widgets.length) out.push({ opener, widgets });
  return out;
}

// How many widgets each drawn column holds, one entry per column, after the
// deal. 4.52.1.
//
// WHO ASKS, AND WHAT FOR. `regroupFlatNote`'s column phase and its join both
// have to pick which of a full row's two columns a widget goes into, and both
// answer *the one holding fewer, and the first on a tie*. That is one rule with
// two callers, so the count it needs is one function rather than a walk in each
// — and the deal is in it, because a run past the cap is already part of the
// column it was dealt into and its widgets are already on that column's line.
export function columnLoadOf(runs: readonly ColumnRun[]): number[] {
  const load = runs.slice(0, MAX_COLUMNS).map(() => 0);
  runs.forEach((run, n) => {
    if (!load.length) return;
    load[n % load.length] += run.widgets.length;
  });
  return load;
}


export function setPageBreaks(
  body: readonly string[],
  openers: readonly number[]
): string[] | null {
  if (!body.some(isRowLine)) return null;
  const widgets: number[] = [];
  for (let i = 0; i < body.length; i++) if (isWidget(body[i])) widgets.push(i);
  if (widgets.length < 2) return null;

  const want = new Set(openers);
  // BACK TO FRONT, so an insertion does not move the lines the earlier
  // boundaries were located at — `setCellWidths`' own rule, one file over.
  const out = [...body];
  // WHERE A `tab` WENT BACK TO BEING A `cell`, kept for the pass below.
  //
  // AND HOW MANY LINES HAD BEEN INSERTED WHEN IT WAS RECORDED. The loop walks
  // back to front, so every insertion it makes AFTER this one is at a lower line
  // — which shifts this index up by one each time. `after` is what turns the
  // index the loop saw into the index the finished body has, and without it a
  // call that both adds a page low in the fence and removes one above it would
  // test the wrong line.
  const demoted: { at: number; after: number }[] = [];
  let inserted = 0;
  for (let n = widgets.length - 1; n >= 1; n--) {
    let cut = widgets[n];
    while (cut - 1 > widgets[n - 1] && isHeightLine(out[cut - 1])) cut--;
    const above = cut - 1;
    const isTab = above >= 0 && isTabLine(out[above]);
    const isCell = above >= 0 && isCellLine(out[above]);
    const indent = /^\s*/.exec(out[above] ?? out[cut])?.[0] ?? "";
    if (want.has(widgets[n])) {
      if (isTab) continue;
      if (isCell) out[above] = `${indent}${TAB_KEYWORD}`;
      else {
        out.splice(cut, 0, `${/^\s*/.exec(out[cut])?.[0] ?? ""}${TAB_KEYWORD}`);
        inserted++;
      }
      continue;
    }
    if (isTab) {
      out[above] = `${indent}${CELL_KEYWORD}`;
      demoted.push({ at: above, after: inserted });
    }
  }

  // AND A DEMOTION MAY NOT LEAVE A PAGE OVER THE CAP. 4.52.1.
  //
  // 4.34.2's RULE, WITH THE ONE CASE IT COULD NOT SEE. *"The column stays either
  // way: removing a page boundary puts the two sections back beside each other
  // rather than stacking them, because a page break is a column break that was
  // promoted."* True whenever there was a column break to promote — and a `tab`
  // added above a widget that had no delimiter of its own was never promoted
  // from anything, so demoting it INVENTS a column.
  //
  // THE BUG THAT IS, AND IT IS ONE A READER REACHES IN TWO CLICKS. The homepage
  // is two columns: `diary` beside the three that stack. Start a page at Open
  // tasks and take it away again, and the fence comes back with a delimiter it
  // never had — three columns, which the cap then deals into two that are not
  // the two the reader started with. A page added and removed must leave the
  // group it found.
  //
  // SO THE COLUMN STAYS WHERE THERE IS ROOM FOR IT AND THE LINE GOES WHERE
  // THERE IS NOT, which keeps 4.34.2's sentence true of every group it was
  // written about and makes it true of the ones it was not.
  //
  // BACK TO FRONT AGAIN, so a line removed never moves one still to be looked
  // at — `demoted` is collected in descending order already, since the loop
  // above walks that way.
  for (const { at: was, after } of demoted) {
    const at = was + (inserted - after);
    const span =
      tabSlices(out).find((s) => at >= s.from && at < s.to) ??
      { from: 0, to: out.length, page: 0 };
    if (runsOf(out.slice(span.from, span.to)).length <= MAX_COLUMNS) continue;
    out.splice(at, 1);
  }
  return out.join("\n") === body.join("\n") ? null : out;
}

// The note with block `block`'s last column split off as a page of its own.
//
// `widenCells`' SHAPE, and for its reason: the gesture hands over a file and a
// block number and gets a file back, and every other fence is re-emitted as the
// exact lines it was read as.
export function splitPageIn(
  lines: readonly string[],
  block: number
): string[] | null {
  const { at, segs } = fencesOf(lines);
  if (block < 0 || block >= at.length) return null;
  const next = splitPage(segs[at[block]].slice(1, -1));
  if (!next) return null;
  const out = segs.map((seg, i) =>
    i === at[block] ? [seg[0], ...next, "```"] : [...seg]
  );
  return out.flat();
}

// Which page a body line is in, as an ordinal, or -1.
//
// FOR THE GESTURES, which are handed a line number by a stamp in the DOM and
// have to know which page's arithmetic to do. -1 is a line in no drawn page —
// a modifier above the first widget, or a `tab` delimiter itself — and every
// caller reads it as "do not touch", which is the honest answer for a line that
// describes no page.
export function tabAt(body: readonly string[], line: number): number {
  const slice = tabSlices(body).find((s) => line >= s.from && line < s.to);
  return slice ? slice.page : -1;
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
    // AND A PAGE BOUNDARY ENDS THE SEARCH (4.34). A `cell` at the foot of tab 1
    // opens nothing: the next widget is on the next PAGE, and a column cannot
    // reach across one. Without this line the last delimiter of every page but
    // the last would be kept alive by the first widget of the page after it.
    if (isTabLine(body[j])) return false;
    // A header is not cell content (row.ts, `NOT_A_CELL`), so a delimiter
    // followed by one is still looking for its cell.
    if (isWidget(body[j])) return true;
  }
  return false;
}

export function tidyCells(body: readonly string[]): string[] {
  return body.filter((line, i) => !isCellLine(line) || opensSomething(body, i));
}

// Whether the `tab` delimiter at `i` opens a page that has anything in it.
//
// `opensSomething`'s TWIN, one level up, and deliberately a separate function
// rather than a parameterised one: the two stop on different things — a column
// ends at the next `cell` OR the next `tab`, a page ends only at the next `tab`
// — and folding that into one walk with a flag would hide the asymmetry that is
// the whole difference between the two delimiters.
function opensPage(body: readonly string[], i: number): boolean {
  for (let j = i + 1; j < body.length; j++) {
    if (isTabLine(body[j])) return false;
    if (isWidget(body[j])) return true;
  }
  return false;
}

// The body with any `tab` line that pages nothing taken out. 4.34 §6.
//
// `tidyCells`' MIRROR, AND WHAT A DEPARTURE LEAVES BEHIND. Drag the only widget
// out of tab 2 and the `tab` line that opened it is still there, saying there is
// a page where there is none — the strip would draw `[1] [2]` and `[2]` would be
// empty. `tabSlices` already declines to draw it, so this is not a correctness
// fix; it is not leaving a line in the reader's file that describes a page that
// is not there.
export function tidyTabs(body: readonly string[]): string[] {
  return body.filter((line, i) => !isTabLine(line) || opensPage(body, i));
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
  // AN EMPTIED FENCE GOES. A `chronoanvil` fence with no directives left renders
  // as an empty card — `applyLayout` drops one for the same reason, in the same
  // words.
  if (!body.some(isWidget)) return null;
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
  //
  // AND THE PAGES GO WITH IT TOO (4.34). A block of one widget is not a row, so
  // it is not a group, so it has no pages — and a `tab` line left on it would be
  // refused out loud by `parseTabs` for having no `row`, which is the same
  // error-on-a-block-they-did-not-touch this branch already exists to prevent.
  if (widgetCount(body) < 2) {
    return body.filter(
      (l) =>
        !isRowLine(l) && !isCellLine(l) && !isTabLine(l) && !isHeightLine(l)
    );
  }
  // TABS TIDIED BEFORE CELLS, and the order is load-bearing. `opensSomething`
  // stops at a page boundary, so removing an emptied `tab` line first is what
  // lets the `cell` above it see the widget that has become its own again. The
  // other order leaves a delimiter that opens nothing.
  return tidyHeights(tidyCells(tidyTabs(body)));
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
//
// AND "UNDIVIDED" IS ASKED OF THE PAGE, NOT OF THE FENCE (4.34 §6). A group can
// have a divided tab 1 and an undivided tab 2, and the question this rule turns
// on — *does this row already say where its columns are?* — is a question about
// the row the run is landing in. Asked of the whole body, an arrival into an
// undivided tab 2 would gain a delimiter because tab 1 has one, which divides a
// row the reader never divided; asked the other way round, a landing in a
// divided tab 1 would merge into its neighbour. Both are the bug this function's
// header describes, reached through the delimiter added one level up.
//
// AND `at` AT THE END OF A PAGE IS THE END OF THE BODY'S CASE. A run landing at
// the last line of tab 1 has nothing in that page to re-open, so the delimiter
// goes before it, exactly as it does at the end of the fence.
function arrival(
  body: readonly string[],
  run: readonly string[],
  at: number
): string[] {
  if (!body.some(isRowLine)) return [...run];
  const page = tabSlices(body).find((s) => at >= s.from && at <= s.to);
  const span = page ?? { from: 0, to: body.length };
  if (!body.slice(span.from, span.to).some(isCellLine)) return [...run];
  return at >= span.to
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
// AND THE COUNT RESTARTS AT EVERY PAGE (4.34 §6). A `tab` line opens its page's
// first cell exactly as `row` opens the fence's first one, so the first widget
// after a `tab` is already in a column and must not be given a delimiter of its
// own. Without the reset, writing out an undivided two-page group puts a `cell`
// immediately after every `tab` — which `cellPlan` drops as an empty run, so it
// would render correctly and read as a file full of lines that do nothing.
export function delimit(body: readonly string[]): { body: string[]; map: number[] } {
  const out: string[] = [];
  const map: number[] = [];
  let seen = 0;
  for (let i = 0; i < body.length; i++) {
    if (isTabLine(body[i])) seen = 0;
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
    // A FENCE KIND IS NOT A DETAIL. `chronoanvil-charts` holds chart specs and
    // `chronoanvil` holds directives; a line that crosses between them is a widget
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
  //
  // AND THE HEAD IS A BANNER ON TWO OF THE THREE SURFACES (5.11). This asked
  // `isTitleLine`, which is the DASHBOARD's head and no part of a journal note
  // or a diary entry — so all three refusals were silently inapplicable on the
  // two surfaces whose head is `journal-header` / `entry-header`, and a cell
  // could be dropped into the block that names the note. `isPageHeadLine` is the
  // same question asked of all three spellings.
  const headBlock = at.findIndex((i) => bodyOf(segs[i]).some(isPageHeadLine));
  if (run.some(isPageHeadLine)) return null;
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
    if (isSectionFence(dstBody)) return null;
    if (widgetCount(dstBody) !== 1) return null;
    if (!dstBody.some(isContent)) return null;
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
