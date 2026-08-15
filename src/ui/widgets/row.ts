// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The row primitive: the widgets in this block, side by side. 4.2 §2.
//
// ── WHAT THIS IS ─────────────────────────────────────────────────────────
//
// `.journal-widget-block` has been a flex COLUMN since the first fence, and
// every page Almanac composes is that column repeated. 4.2 §2.1 counts what a
// homepage of rows needs and finds three of the four pieces already built — a
// composed page whose blocks are data, per-block chrome (`frame:`), and widths
// that answer to the pane rather than the window. The missing one is this: a way
// to say *these widgets are one row*.
//
// The grammar is in directive-grammar.ts beside `frame:`, and says there why a
// row is a fence rather than a marker spanning several. This file is the other
// half: what that line does to the DOM.
//
// ── WRAPPED AFTER THE FACT ───────────────────────────────────────────────
//
// The processor builds every widget exactly as it did before, into the same
// container, in the same order, and this runs afterwards over what it finds.
// That is `frame: section`'s shape and it is deliberate: the loop needs no
// knowledge of the row, so a widget written next year is a cell without being
// told. Moving rendered nodes is safe — a `MarkdownRenderChild` is bound to its
// element rather than to its parent, and a `LiveWidget` rebuilds its own subtree
// wherever that subtree has been put.
//
// ── AND A SECTION BAR IS NOT A CELL ──────────────────────────────────────
//
// The one rule with any content in it, and it is worth stating twice. A
// `header:` bar in a row fence stays where it is, full width, above the row.
//
// The visible reason is that a title squeezed into a third of a pane is not a
// title. The one that matters more does not look like anything: `HeaderBar`'s
// fold walk finds a bar and then reads its SIBLINGS to decide what the section
// owns (headerbar.ts — "walking the bar's parent rather than the block picks up
// exactly the widgets the fence rendered beside it"). Move the bar into a cell
// and the walk's answer changes silently — the section folds the wrong scope,
// which is 4.1 §4's last bullet and the kind of bug that is found weeks later.
//
// Keying on `journal-sec` rather than on `journal-header-bar` catches both
// variants: `sectionFrame` gives every bar the look class and only a
// block-owning one the fold marker, and neither belongs in a cell.

// Where a cell begins, and how wide it asks to be.
//
// `at` is the number of children the block had when the dispatcher met the
// delimiter; `weight` is the shares that delimiter asked for. See `cellPlan`
// for why the position is a count rather than a node.
export interface CellBound {
  at: number;
  weight: number;
}

// A row's cells, as the children in each and the shares each asked for. The two
// arrays are parallel and the same length — one entry per cell that is drawn,
// which is not the same as one per delimiter, because an empty run draws none.
export interface RowPlan {
  cells: number[][];
  weights: number[];
}

// The row, and one cell per widget in it.
//
// NOT `journal-widget-row`, though that is the obvious name, because
// `.journal-widget-bar` already means "a row" in this stylesheet — the wrapping
// strip that inline controls accumulate into. Two names for one idea is what
// this project spends releases removing; two ideas sharing a name is the same
// fault from the other side. A bar is inline controls INSIDE a block; a row is
// the block's own widgets laid across it.
export const ROW_CLASS = "journal-block-row";
export const ROW_CELL_CLASS = "journal-block-cell";

// The surface a group is drawn on, and the strip along its foot. 4.9 §2.
//
// ── WHY THE ROW GREW A WRAPPER ───────────────────────────────────────────
//
// A row has been a grammar since 4.2 and rearrangeable since 4.8, and it has
// never been a thing a reader can SEE: the block paints no chrome for it, so
// what is on the page is two cards side by side and nothing saying they are one
// object. The row itself cannot become that surface — it is the flex row, and a
// foot bar inside it would be a third column.
//
// NEW NAMES RATHER THAN A RENAME. `journal-block-row` and `journal-block-cell`
// stay exactly as they are: every CSS assertion in the suite reads them as
// literals and a reader never sees either, so renaming them would be a large
// diff for no reader-visible gain. The parts 4.9 adds take `journal-group-*`,
// which is the noun the documentation now uses.
export const GROUP_CLASS = "journal-group";
export const GROUP_FOOT_CLASS = "journal-group-foot";

// The edge between two columns, which is where a width is set (4.9 §3).
//
// A CHILD OF THE CELL ON ITS RIGHT, absolutely positioned back into the gap —
// the trick `.jbd-slot-before` already uses. Being sealed inside a cell is the
// SAFE side of 4.8 §8.3: a cell is a query container, containment makes it a
// stacking context, and a `z-index` cannot lift anything out of one. Nothing
// else is drawn in that gap at rest, so there is nothing here to be sealed away
// from.
export const GROUP_DIVIDER_CLASS = "journal-group-divider";

// Which boundary a divider sits on: the cell to its right. Read by the gesture,
// which needs the pair either side of it and gets one of them from the DOM.
export const DIVIDER_INDEX_ATTR = "data-am-divider";

// The bottom edge of one card, which is where a height is set (4.22 §4).
//
// ONE PER CARD, NOT ONE PER SEAM, and `cell-height.ts`'s header has the whole
// argument. The short of it: N cards have N-1 seams between them, so a mark
// between two cards can never reach the LAST card in a column — and on the page
// this release is about, that is the widget with the most empty rows in it.
//
// A CHILD OF THE CARD, NOT OF THE CELL, which is the opposite choice from the
// column divider above and made for the reason the seam's own comment already
// gives: the mark sits in the gap at the card's edge, and with nothing positioned
// between it and the cell every mark in a column would resolve against the cell
// and land at the same height. The card is positioned; the cell is the wrong
// ground.
export const CARD_DIVIDER_CLASS = "journal-card-divider";

// What a block can hold that is furniture rather than a widget.
//
// `journal-sec` — every section bar, titled or not, block-owning or not. See
// the header of this file.
//
// `journal-frame-error` — the sentence a refused modifier draws. It is the
// block explaining itself, not something the block is showing, and a fence can
// carry a frame error and a good `row` line at once.
const NOT_A_CELL = ["journal-sec", "journal-frame-error"];

// Whether a child of the block goes into a cell at all.
//
// NAMED FOR WHAT IT ANSWERS. This was `isRowCell` while one child was one cell,
// and 4.4 §1 made that false: a cell can hold several children now, so a child
// is CONTENT of a cell rather than a cell itself. One name per idea cuts both
// ways — a name that has stopped describing its rule is a second meaning
// hiding in the first.
//
// PURE, AND SEPARATE FROM THE DOM for `chromeClasses`' reason: the interesting
// half is a rule over a class list, and a rule that can be asserted is worth
// more than one that can be eyeballed on a dashboard. It is also stated as an
// EXCLUSION rather than as a list of what may go in a cell — a widget added
// later belongs without an entry here, which is the property that keeps the
// modifier free for directives not written yet.
export function isCellContent(classes: readonly string[]): boolean {
  return !classes.some((c) => NOT_A_CELL.includes(c));
}

// Which of a block's children make up each cell of its row. 4.4 §1.
//
// THE PART THE ROADMAP SAID WOULD BE THE HARD ONE, reduced to arithmetic so it
// can be tested without a DOM. `content[i]` is whether child `i` goes in a cell
// at all; `boundaries` is where the dispatcher met a `cell` line, recorded as
// the number of children the block had at that moment. The result is one group
// of child indices per cell, in order.
//
// AND EACH CARRIES ITS WIDTH. 4.4 §2: a `cell` line may ask for a number of
// shares, and the weight belongs to the cell that line OPENS. A cell with no
// delimiter of its own — the first one, opened by `row` — is one share.
//
// WHY A COUNT AND NOT A NODE. The dispatcher cannot hand back "the child that
// ended the last cell", because a directive may append nothing — `on-this-day`
// on a young vault, a `links:` row with no links — and a delimiter after one of
// those would then point at whatever came before it instead. A count is exact
// whether or not the line above it drew anything.
//
// AN EMPTY RUN IS DROPPED rather than drawn as an empty column, which is what
// makes a leading `cell` line and a bare one mean the same thing (see
// CELL_KEYWORD). It also covers two delimiters in a row, and a delimiter after
// a directive that drew nothing.
//
// NO DELIMITERS MEANS ONE CELL EACH, and this case lives here rather than in
// the caller because it is a rule and not a shortcut. A row of two directives
// meant two columns before 4.4 existed, so the arithmetic below — which would
// give ONE cell holding both — is not what an undelimited row means. Keeping
// the exception here keeps it testable; keeping it in `layOutRow` would have
// put the one thing that must not change behind a DOM the suite does not have.
export function cellPlan(
  content: readonly boolean[],
  boundaries: readonly CellBound[]
): RowPlan {
  if (boundaries.length === 0) {
    return {
      cells: content.flatMap((isContent, i) => (isContent ? [[i]] : [])),
      weights: content.filter(Boolean).map(() => 1),
    };
  }
  const at = new Map(boundaries.map((b) => [b.at, b.weight]));
  const cells: number[][] = [];
  const weights: number[] = [];
  let open: number[] = [];
  // THE FIRST CELL IS OPENED BY THE `row` LINE, not by a delimiter, so it has
  // one share unless a leading `cell: N` opens it explicitly — which is the
  // spelling that makes the first column widenable at all. An empty run is
  // still dropped; what a leading delimiter leaves behind is its WEIGHT.
  let openWeight = 1;
  for (let i = 0; i < content.length; i++) {
    const mark = at.get(i);
    if (mark !== undefined) {
      if (open.length) {
        cells.push(open);
        weights.push(openWeight);
        open = [];
      }
      openWeight = mark;
    }
    if (content[i]) open.push(i);
  }
  if (open.length) {
    cells.push(open);
    weights.push(openWeight);
  }
  return { cells, weights };
}

// Lay this block's widgets out side by side, in the cells it asked for.
//
// `boundaries` is empty for a row with no `cell` line — the 4.2 shape, one cell
// per child. `cellPlan` owns that case; this function does not know it exists.
//
// Does nothing when the block has no cell content — an empty
// `.journal-block-row` is a wrapper around nothing, and a fence holding only a
// `header:` bar and a `row` line has asked for a row of no widgets. Nothing
// drawn is the honest answer.
export function layOutRow(
  container: HTMLElement,
  boundaries: readonly CellBound[] = []
): void {
  const children = Array.from(container.children).filter(
    (n): n is HTMLElement => n instanceof HTMLElement
  );
  const content = children.map((c) => isCellContent(Array.from(c.classList)));
  const { cells: groups, weights } = cellPlan(content, boundaries);
  if (groups.length === 0) return;

  // AT THE FIRST CELL'S PLACE, not at the end of the block: a header bar above
  // the widgets must stay above them, and appending would put the row after
  // anything the processor drew last.
  //
  // THE GROUP IS WHAT GOES THERE NOW, with the row inside it (4.9 §2.1). It is
  // inserted at exactly the place the row used to be, so nothing about which
  // children stay outside it changes — a bar above the widgets is still above
  // the whole group.
  //
  // `attachBlockHead` finds the row with an unscoped `querySelector` and reads
  // `row.children` for the cells, and the stylesheet only ever styles
  // `.journal-block-row` bare; both survive the extra level untouched.
  const box = createDiv({ cls: GROUP_CLASS });
  const row = box.createDiv({ cls: ROW_CLASS });
  container.insertBefore(box, children[groups[0][0]]);
  groups.forEach((group, n) => {
    const cell = row.createDiv({ cls: ROW_CELL_CLASS });
    // ONE DIVIDER PER INTERNAL BOUNDARY, and none on the first cell — the left
    // edge of the group is not between anything. It is added BEFORE the cell's
    // content so it is not caught by anything walking `cell.children` for
    // widgets; every such walk reads the line stamp, which a divider has not
    // got.
    if (n > 0) {
      cell.createDiv({
        cls: GROUP_DIVIDER_CLASS,
        attr: {
          [DIVIDER_INDEX_ATTR]: String(n),
          "aria-label": "Drag to set the width of these columns",
        },
      });
    }
    // ONLY WHEN IT IS NOT ONE. The stylesheet reads `var(--am-cell-weight, 1)`,
    // so an ordinary cell needs no inline style at all and the common case
    // leaves no mark in the DOM — the same shape `--am-row-cols` and
    // `--am-ev-tint` already use for a value only some instances have.
    if (weights[n] !== 1) {
      cell.style.setProperty("--am-cell-weight", String(weights[n]));
    }
    for (const i of group) cell.appendChild(children[i]);
    // ONE HANDLE PER CARD, ON THE CARD, APPENDED LAST (4.22 §4.1).
    //
    // AFTER the append, because it goes INSIDE each child rather than beside
    // them — so the child has to be here first — and because appending it last
    // is what keeps it out of the way of everything that reads a card's own
    // children: `applyCardHeights` and the drag walk both skip it, since it
    // carries no line stamp, and the `is-sized` scroll rule in the stylesheet
    // never sees it because an absolutely positioned child of a flex container
    // is not a flex item.
    //
    // AND ON EVERY CHILD OF THE CELL, including the last one in the column and
    // including a widget that draws its own band and wears no card. Both came
    // through `isCellContent`, so both are things the reader put in the fence.
    //
    // THE ONE CHILD THAT IS NOT is the column divider this loop just built, and
    // it is skipped by name rather than by asking about the line stamp — the
    // stamp is block-drag.ts's word and this file has no reason to learn it, and
    // the divider is the only thing `layOutRow` puts in a cell that the reader
    // did not.
    for (const child of Array.from(cell.children)) {
      if (!(child instanceof HTMLElement)) continue;
      if (child.hasClass(GROUP_DIVIDER_CLASS)) continue;
      child.createDiv({
        cls: CARD_DIVIDER_CLASS,
        attr: { "aria-label": "Drag to set the height of this widget" },
      });
    }
  });

  // ── THE FOOT (4.9 §2.2) ─────────────────────────────────────────────
  //
  // A slim strip under the columns carrying the two things the group has to say
  // about ITSELF: how many columns it has, and where to pick it up.
  //
  // UNDER RATHER THAN OVER, which is the one placement decision here. The top of
  // a group is where every card inside it draws its own head, and a bar across
  // that would be a title above a row of titles — the doubling 4.7.2 spent a
  // patch removing. The foot is the one edge of the box with nothing on it.
  //
  // THE GRIP IS NOT BUILT HERE. `attachBlockHead` owns every grip on the page —
  // it is the only thing that knows whether this block can be located in its
  // file at all, and a grip that cannot move anything must not be drawn. This
  // builds the strip and the count; block-drag.ts hangs the grip on it.
  const foot = box.createDiv({ cls: GROUP_FOOT_CLASS });
  foot.createSpan({
    cls: `${GROUP_FOOT_CLASS}-count`,
    text: `${groups.length} ${groups.length === 1 ? "column" : "columns"}`,
  });
}
