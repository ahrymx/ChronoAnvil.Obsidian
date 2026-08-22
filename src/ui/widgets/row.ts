// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { dealInto, MAX_COLUMNS } from "../../core/directive-grammar";

// The row primitive: the widgets in this block, side by side. 4.2 §2.
//
// ── THE ONE IMPORT (4.52.1) ──────────────────────────────────────────────
//
// This file had none, and the reason it had none is worth keeping: it draws a
// row out of a list of children and can be tested with neither a vault nor a
// settings object. `directive-grammar.ts` costs that nothing — it imports
// nothing itself and is string arithmetic over fence lines — and `MAX_COLUMNS`
// has to be ONE number, shared with the two files that read the same columns
// out of the file rather than out of the DOM (`cell-width.ts`, and
// `regroupFlatNote`'s column phase). A copy here would be a second answer to
// how many columns a row has, which is the exact fault this project's
// vocabulary file exists to prevent.
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

// ── the pages of a group, and the strip that switches them (4.34) ────────
//
// `journal-group-pages` wraps the rows and is what a swap pins a height on; the
// group itself cannot be, because its height includes the foot and sliding the
// strip the reader is pressing is the bug the pin exists to prevent.
export const GROUP_PAGES_CLASS = "journal-group-pages";
export const GROUP_TABS_CLASS = "journal-group-tabs";
export const GROUP_TAB_CLASS = "journal-group-tab";
export const GROUP_ADD_CLASS = "journal-group-add";

// A page that is not the open one.
//
// EXPORTED BECAUSE `block-drag.ts` MUST NOT FIND IT. That file locates the row
// with an unscoped `querySelector`, which took the only row there was and now
// takes the FIRST of several — so every gesture on a two-page group would act
// on page 1 whatever the reader could see. It selects on this class instead, and
// the two files share the literal rather than agreeing about a string.
export const ROW_CLOSED_CLASS = "is-closed";

// A page that has just been revealed, for the length of one frame.
export const ROW_ENTERING_CLASS = "is-entering";

// Which page of its group a row is, as the delimiter ordinal `TabbedPlan`
// explains. Read by `block-drag.ts`, which has to tell the width writers which
// page a divider belongs to.
export const ROW_PAGE_ATTR = "data-am-page";

// How long a swap is given before its pinned height is released.
//
// MATCHES THE STYLESHEET'S OWN NUMBER, which is `120ms` — the duration
// `opacity 120ms ease` and `transform 120ms ease` already use a dozen times
// over. The margin is for the frame the class change costs; overshooting is
// free, because the pin is invisible and releasing it early is what clips a
// rebuild.
const SWAP_MS = 200;

// What the render needs from whatever owns the reader's place in this group.
//
// AN INTERFACE, NOT THE PLUGIN, on `FoldStore`'s argument (section-frame.ts):
// this file draws a group out of a list of children and can be tested with
// neither a vault nor a settings object, and the moment it imports one it can be
// tested with neither.
export interface TabHandle {
  // Which page was open when this block last rendered.
  open: number;
  // The reader picked a page. Persisting it is the caller's business.
  onOpen(index: number): void;
  // The group hands back the only way to change pages, so a command and a click
  // go through one path and the height is managed either way.
  attach(control: TabControl): void;
  // Split this group's last column off as a page of its own — the `+` in the
  // foot. Null where the block cannot be located in its file at all, which is
  // `attachBlockHead`'s rule for every gesture that writes: a control that
  // cannot do anything must not be drawn.
  addPage: (() => void) | null;
}

export interface TabControl {
  count: number;
  at(): number;
  to(index: number): void;
  // The group's own box. A register of these has to be able to tell a live
  // control from one whose subtree a `LiveWidget` rebuild has already thrown
  // away, and `isConnected` on the element is the only answer that cannot go
  // stale.
  el: HTMLElement;
}

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

// A row's cells, held to `MAX_COLUMNS`. 4.52.1.
//
// DEALT RATHER THAN TRUNCATED, and `MAX_COLUMNS` carries the argument for the
// cap itself. What belongs here is what dealing DOES to a plan: every child of
// every run past the cap is handed to `dealInto`, one at a time, so a row of
// four draws 1 and 2 on the top line with 3 under 1 and 4 under 2 — and not one
// widget is dropped or hidden.
//
// ONE WIDGET AT A TIME, NOT ONE RUN AT A TIME, and the difference is the whole
// reason this can be trusted. `regroupFlatNote`'s column phase writes the same
// deal into the file by moving one widget per pass, because that is what
// `moveCell` moves; a fold that took a three-widget run as a unit would put
// those three somewhere the Save then puts them one by one, and the page would
// rearrange itself the first time anybody pressed Save. Dealing the same units
// in the same order is what makes the render and the file one answer.
//
// THE CELLS ARE INDEX LISTS, SO DEALING IS CONCATENATION. A cell has held
// several children since 4.4 §1; a folded column is that same list with another
// run appended, which is a shape every walk over `cells` already handles. There
// is nothing here for `layOutRow` to know about.
//
// AND THE EXTRA RUNS' WEIGHTS GO WITH THEIR DELIMITERS. A weight belongs to the
// column a `cell` line OPENS, and past the cap that line opens no column — so
// there is no column for its share to be a share OF. Keeping it would mean two
// numbers describing one cell and no rule for which wins. `columnsOf`
// (cell-width.ts) reads the file the same way and stops at the same count, so
// the widths the gesture writes and the widths the row draws stay one answer.
//
// A ROW AT OR UNDER THE CAP IS RETURNED UNTOUCHED — the same object, not a copy
// — which is every fence any catalogue in this plugin composes. The homepage's
// row is two columns and always has been; this function is here for the fences
// readers build themselves.
function capColumns(plan: RowPlan): RowPlan {
  if (plan.cells.length <= MAX_COLUMNS) return plan;
  const cells = plan.cells.slice(0, MAX_COLUMNS).map((cell) => [...cell]);
  for (const extra of plan.cells.slice(MAX_COLUMNS)) {
    for (const child of extra) {
      cells[dealInto(cells.map((cell) => cell.length))].push(child);
    }
  }
  return { cells, weights: plan.weights.slice(0, MAX_COLUMNS) };
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
    return capColumns({
      cells: content.flatMap((isContent, i) => (isContent ? [[i]] : [])),
      weights: content.filter(Boolean).map(() => 1),
    });
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
  return capColumns({ cells, weights });
}

// ── the pages of one group ────────────────────────────────────────────
//
// ONE `RowPlan` PER PAGE. 4.34 §2.
//
// `cellPlan` IS UNCHANGED AND IS CALLED ONCE PER PAGE, which is the whole of
// this feature's arithmetic. Every rule that function documents — an empty run
// draws nothing, no delimiters means one cell each, a leading delimiter keeps
// its weight and drops its run — now holds PER PAGE, which is what those rules
// have to mean once a fence can hold more than one row. Teaching `cellPlan`
// about tabs instead would put two levels of delimiter in one loop, and the
// first bug would be a `cell` in tab 2 counted as a column of tab 1.
//
// `tabs` IS THE SAME SHAPE AS `CellBound.at` — the number of children the block
// had when the dispatcher met the delimiter — and for the identical reason,
// which `cellPlan` states in full: a directive may append nothing, so "the child
// before this line" is not always a child of this line.
//
// AN EMPTY PAGE IS DROPPED, exactly as an empty cell is. A trailing `tab`, two in
// a row, and a `tab` above a directive that drew nothing all produce no page —
// so the strip never draws a number that opens onto nothing.
//
// NO TABS MEANS ONE PAGE, and that is the compatibility claim in one line: a
// block with no `tab` line gets exactly `cellPlan`'s answer for the same input,
// wrapped in an array of one.
// AND EACH CARRIES ITS ORDINAL, WHICH IS NOT ITS POSITION IN THIS LIST.
// `page` counts the delimiters above it, so a page that drew nothing leaves a
// gap in the numbering rather than shifting everything after it down one.
// `tabSlices` (cell-move.ts) numbers the body's lines the same way and its
// header has the whole argument: the two sides drop DIFFERENT pages — this one
// drops a page that appended no children, that one drops a page with no widget
// line — so a shared count would put a divider drag in one page and its write in
// another.
export interface TabbedPlan extends RowPlan {
  page: number;
}

export function tabPlan(
  content: readonly boolean[],
  tabs: readonly number[],
  cells: readonly CellBound[]
): TabbedPlan[] {
  // IN THE ORDER THE DELIMITERS WERE MET, AND NOT DEDUPED. Two `tab` lines with
  // nothing between them are two delimiters and therefore two ordinals, even
  // though they open one page between them — the body has two `tab` lines and
  // numbers them the same way.
  const bounds = [0, ...tabs, content.length];

  const out: TabbedPlan[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const from = Math.max(0, Math.min(bounds[i], content.length));
    const to = Math.max(from, Math.min(bounds[i + 1], content.length));
    if (to <= from) continue;
    // REBASED, NOT FILTERED. `cellPlan` speaks in indices into the array it is
    // given, so a page's delimiters have to be moved into that page's numbering
    // — and the indices it returns are moved back below. A delimiter exactly on
    // the seam belongs to the page it opens, which is the page starting here.
    const plan = cellPlan(
      content.slice(from, to),
      cells
        .filter((b) => b.at >= from && b.at < to)
        .map((b) => ({ at: b.at - from, weight: b.weight }))
    );
    if (plan.cells.length === 0) continue;
    out.push({
      cells: plan.cells.map((group) => group.map((n) => n + from)),
      weights: plan.weights,
      page: i,
    });
  }
  return out;
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
  boundaries: readonly CellBound[] = [],
  tabBounds: readonly number[] = [],
  tabs: TabHandle | null = null
): void {
  const children = Array.from(container.children).filter(
    (n): n is HTMLElement => n instanceof HTMLElement
  );
  const content = children.map((c) => isCellContent(Array.from(c.classList)));
  const plans = tabPlan(content, tabBounds, boundaries);
  if (plans.length === 0) return;

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
  // THE PAGES GET A BOX OF THEIR OWN, and it is what the height is pinned on
  // during a swap (4.34 §A). The group cannot be that box: its height includes
  // the foot, so transitioning it would slide the strip the reader is pressing.
  // With one page this is a wrapper around one row and costs a div.
  const pages = box.createDiv({ cls: GROUP_PAGES_CLASS });
  container.insertBefore(box, children[plans[0].cells[0][0]]);

  const rows = plans.map(({ cells: groups, weights, page }) => {
    // STAMPED WITH ITS ORDINAL, so a gesture inside it can name the page it is
    // in without counting rows — see `TabbedPlan` for why counting would be
    // wrong. This is the same shape as `data-am-line`: the DOM carrying the one
    // fact about the file that cannot be re-derived from what is on screen.
    const row = pages.createDiv({
      cls: ROW_CLASS,
      attr: { [ROW_PAGE_ATTR]: String(page) },
    });
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
    return row;
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

  // ── ONE PAGE: THE COUNT, EXACTLY AS BEFORE ──────────────────────────
  //
  // A group with no `tab` line is what it has always been, down to the sentence
  // in its foot. This branch is the compatibility claim made visible, and it is
  // the first thing 4.34's vault checks look at.
  // THE `+` IS ON EVERY GROUP, INCLUDING THIS ONE (4.34.1).
  //
  // A group with no pages is where a reader finds out that a group can have
  // them, and it is the only place the first one can be made — so a control
  // offered only once there are already tabs could never be pressed. It appears
  // on hover, which is the grip's idiom and the divider's, so a group at rest
  // looks exactly as it did.
  const addPage = (): void => {
    if (!tabs?.addPage) return;
    const button = foot.createEl("button", {
      cls: GROUP_ADD_CLASS,
      text: "+",
      attr: {
        type: "button",
        "aria-label": "Split the last column into a page of its own",
      },
    });
    button.addEventListener("click", () => tabs.addPage?.());
  };

  // ── THE COUNT IS GONE (4.34.2) ──────────────────────────────────────
  //
  // `N columns` was the foot's whole content in 4.9 and it never earned the
  // strip. What it said, the reader could already see — the columns are RIGHT
  // THERE, and counting them was a label restating the thing it sat under. 4.9
  // put it there because the foot needed something in it to be a bar at all;
  // the foot now has the grip, the `+` and, where there are pages, the strip.
  //
  // A LABEL THAT NAMES WHAT IS VISIBLE IS THE SAME FAULT AS AN EMPTY STATE THAT
  // SAYS "no data" — it spends a line to say nothing the reader did not have.
  if (rows.length === 1) {
    // ONLY WHERE THERE IS SOMETHING TO SPLIT. One column is one widget, and
    // taking it out would leave the page it came from empty — `splitPage`
    // refuses that, so offering the button here would be a control that
    // silently does nothing.
    if (plans[0].cells.length > 1) addPage();
    return;
  }

  // ── SEVERAL: THE STRIP REPLACES THE COUNT (4.34 §3) ─────────────────
  //
  // The count told a reader how many columns they could SEE. With pages they can
  // see one page's worth, and the numbers already say how many there are — so
  // the strip takes the count's place rather than crowding in beside it.
  // WHAT IS STORED IS THE PAGE'S ORDINAL, NOT ITS PLACE IN THIS LIST. Everything
  // else about a page is numbered by delimiter — `TabbedPlan`, `tabSlices`, the
  // row's own stamp — and the store has to agree, or the reader's place would
  // shift the first time a page that used to draw nothing started drawing.
  const pageOf = (n: number): number => plans[n].page;

  // A STORED PAGE THAT IS NO LONGER THERE READS AS THE FIRST, not as the last.
  // The reader deleted a `tab` line; page 1 is where a group with no memory
  // starts and it is the only answer that does not depend on how many pages
  // there used to be. Nothing is written back — see `openTabFor`.
  const wanted = tabs?.open ?? 0;
  const found = plans.findIndex((plan) => plan.page === wanted);
  const open = found === -1 ? 0 : found;
  const strip = foot.createDiv({
    cls: GROUP_TABS_CLASS,
    attr: { role: "tablist", "aria-label": "Pages in this group" },
  });

  const buttons = rows.map((row, n) => {
    row.setAttr("role", "tabpanel");
    // A BARE `1` READ ALOUD IS NOT A CONTROL, which is the whole of why these
    // carry a label the eye never sees.
    const button = strip.createEl("button", {
      cls: GROUP_TAB_CLASS,
      text: String(n + 1),
      attr: {
        type: "button",
        role: "tab",
        "aria-label": `Page ${n + 1} of ${rows.length}`,
      },
    });
    return button;
  });

  // WHICH PAGE IS SHOWING, AND EVERY STATEMENT OF IT IN ONE PLACE. The class,
  // the `aria-selected` and the `tabindex` are three spellings of one fact, and
  // three call sites setting them separately is how a strip comes to look
  // selected and read unselected.
  let current = open;
  const paint = (n: number): void => {
    rows.forEach((row, i) => {
      row.toggleClass(ROW_CLOSED_CLASS, i !== n);
      row.setAttr("aria-hidden", i === n ? "false" : "true");
    });
    buttons.forEach((button, i) => {
      button.toggleClass("is-open", i === n);
      button.setAttr("aria-selected", i === n ? "true" : "false");
      // ONE STOP FOR THE WHOLE STRIP, which is what a tablist is: Tab reaches
      // it, then the arrows move inside it. Nine pages must not be nine stops
      // on the way to the next widget.
      button.tabIndex = i === n ? 0 : -1;
    });
  };

  // ── THE SWAP: MEASURE BEFORE REVEALING (4.34 §A) ────────────────────
  //
  // Tab 1 is a tall table and tab 2 a short chart, so an unmanaged switch yanks
  // the foot up under the pointer and the reader's next press lands on whatever
  // moved into that spot. On a control meant to be pressed repeatedly that is
  // the worst kind of small bug: nothing is broken and it feels broken.
  //
  // THE ORDER IS THE WHOLE TRICK, and it is one browser task, so nothing between
  // these lines is ever painted:
  //
  //   1. read the height we are leaving;
  //   2. swap the classes, which lays the incoming row out;
  //   3. read the height we are going to;
  //   4. pin the old one, flush it, then set the new one — which transitions.
  //
  // AND IT IS WHY A CHART IN A CLOSED PAGE IS NOT A 0x0 CANVAS. Step 2 gives the
  // incoming row a real box before step 4 reveals it, so Chart.js's own resize
  // observation sees 0 -> real exactly as it does when a folded section opens.
  // Nothing here reaches into a chart, and nothing can: `renderLineOrBar` hands
  // its teardown to its caller and no registry holds the instance.
  let settle: number | null = null;
  const swapTo = (n: number): void => {
    if (n === current || n < 0 || n >= rows.length) return;
    const before = pages.offsetHeight;
    paint(n);
    const after = pages.offsetHeight;
    current = n;

    // THE INCOMING ROW ARRIVES rather than appearing. `is-entering` is removed
    // on the next frame, which is what makes it a transition and not a jump —
    // set and cleared in the same task, the browser would only ever see the end
    // state.
    rows[n].addClass(ROW_ENTERING_CLASS);
    pages.style.height = `${before}px`;
    // Read once so the pinned value is the transition's start rather than a
    // value the browser coalesces with the one on the next line.
    void pages.offsetHeight;
    pages.addClass("is-swapping");
    pages.style.height = `${after}px`;
    requestAnimationFrame(() => rows[n].removeClass(ROW_ENTERING_CLASS));

    // A TIMER RATHER THAN `transitionend`, and it is not laziness. Under
    // `prefers-reduced-motion` there is no transition and the event never fires
    // — so the pinned height would never be released, and the next rebuild that
    // changed the content would be clipped by a stale pixel value. A timer fires
    // either way.
    //
    // AND IT IS CLEARED ON EVERY SWAP, so eight presses in a row leave one
    // pending release rather than eight racing ones.
    if (settle !== null) window.clearTimeout(settle);
    settle = window.setTimeout(() => {
      settle = null;
      pages.removeClass("is-swapping");
      // THE PIN COMES OFF, AND THIS IS THE CLAUSE TO GET RIGHT. A `LiveWidget`
      // rebuilds its own subtree whenever its scope changes; a group still
      // wearing a pixel height from a swap ten minutes ago would clip whatever
      // the rebuild drew.
      pages.style.removeProperty("height");
    }, SWAP_MS);
  };

  buttons.forEach((button, n) => {
    button.addEventListener("click", () => {
      swapTo(n);
      tabs?.onOpen(pageOf(n));
    });
    // THE ARROWS MOVE INSIDE THE STRIP, which is what `role="tablist"` promises
    // a screen reader. The commands in actions.ts are for when the strip does
    // not have focus, which is nearly always.
    button.addEventListener("keydown", (evt) => {
      const step = evt.key === "ArrowRight" ? 1 : evt.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      evt.preventDefault();
      const to = (current + step + rows.length) % rows.length;
      swapTo(to);
      tabs?.onOpen(pageOf(to));
      buttons[to].focus();
    });
  });

  // THE HANDLE THE KEYBIND DRIVES. `swapTo` is a closure over this group's own
  // rows and its own pinned height, so a command cannot switch a page without
  // the height being managed — there is no second path into the swap, which is
  // how the two stay in step.
  if (tabs) {
    const handle = tabs;
    tabs.attach({
      count: rows.length,
      at: () => current,
      // SWAP AND REMEMBER, in that order and in one place. A command that moved
      // the page without telling the store would leave the reader on a page that
      // reverts the next time the block renders — which is the shape of bug that
      // looks like the store is broken and is really a second path into the
      // swap.
      to: (n) => {
        swapTo(n);
        handle.onOpen(pageOf(n));
      },
      el: box,
    });
  }

  // ── LAID OUT ONCE BEFORE IT IS EVER HIDDEN (4.34 §A) ────────────────
  //
  // Every widget in every page is BUILT at render — the dispatcher records its
  // cell and line stamps as `container.childElementCount`, so a page built later
  // would break every count on the block. Only the BOX is withheld.
  //
  // So the closed pages spend one frame laid out and invisible rather than
  // absent: `is-measuring` puts them out of flow at full width, which gives
  // every canvas in them a real box at the moment it is created, and the class
  // comes off on the next frame. A `display: none` from the start is the 0x0
  // canvas, and one frame of it is not visible to anyone.
  pages.addClass("is-measuring");
  paint(open);
  requestAnimationFrame(() => pages.removeClass("is-measuring"));

  // AFTER THE STRIP, so `+` reads as "one more of these" rather than as a
  // control of its own. Only where the last page still has two columns to
  // divide — see the branch above.
  if (plans[plans.length - 1].cells.length > 1) addPage();
}
