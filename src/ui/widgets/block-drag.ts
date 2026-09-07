// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// A block's head, and dragging a widget between the cells of a row. 4.7, 4.8.
//
// ── WHAT A GESTURE MOVES HERE, AND WHAT IT NO LONGER DOES ────────────────
//
// 4.7 made a whole block draggable: two blocks trading places on a drop. 4.8.1
// REMOVED THAT, at a vault's request — *"a block should only be moved from the
// section editor menu"* — and the reason it is a removal rather than a bug fix
// is worth writing down, because the gesture worked.
//
// A block drag and the section editor were two ways to do one thing, and they
// were not equally good at it. The editor plans, shows what it will change,
// lets a reader change their mind six times, and can express what a drag cannot
// — adding a section, removing one, splitting a block. The drag could only swap
// two, only on a page already showing them, and it wrote on release. Keeping
// both meant every block on every page carrying a permanent invitation to the
// weaker one.
//
// WHAT SURVIVES IS THE CELL. A widget inside a row still has a grip, because
// there the gesture is the ONLY way: the editor arranges blocks, and which
// column a widget sits in is not something it has words for. See cell-move.ts.
//
// ── A HEAD, WHICH IS WHAT THE GRIP WAS ALWAYS LIVING IN ──────────────────
//
// A block with a `header:` bar has somewhere for a grip to sit and a name for
// what it is holding. A block without one had neither, so 4.7.2 gave every
// block its own head: a slim bar with the block's name in it (`blockTitle`).
//
// THE BAR OUTLIVED THE GRIP, and that is the whole of what 4.8.1 changed here.
// It was never only a handle rail — a page of blocks each showing a quiet label
// reads as a page, and the labels are the same ones the section editor uses, so
// what a reader drags in that window is named the same as what they see here.
//
// A HEAD WITH NOTHING TO SAY IS NOT DRAWN AT ALL. It used to keep the grip and
// give up its bar; with no grip left to keep, an unnameable block simply has no
// head. Four ways that happens, two of them this file's:
//
//   THE BLOCK'S TOP IS ALREADY A BAR. A section says its own name; a second bar
//   over that one is a blank strip above a real header.
//
//   NOTHING CAN NAME THE BLOCK. `blockTitle` refuses a row of three widgets and
//   anything the section titles do not cover, and an empty bar is a rule ruled
//   across a page for no reason.
//
// The other two are the stylesheet's, because the classes that decide them
// arrive after the render: a block inside a section RUN (`journal-sec-block`)
// is already under someone else's bar, and an `is-unframed` block has given up
// its chrome and cannot be handed a bar back.
//
// ── AND NO GRIP WHERE THE BLOCK CANNOT BE FOUND ──────────────────────────
//
// `boundsOf` returns null in an embed, an export and any render outside a live
// view. A widget that cannot be located in the file cannot be moved in it, so
// it gets no grip rather than a grip that fails — the rule the title card's cog
// follows, and `empty.ts`'s "nothing dead is drawn" applied to a gesture. The
// head is still drawn: a name is true wherever it is read.
//
// ── NO POP-UP AFTER A DROP ───────────────────────────────────────────────
//
// The section dialog plans, previews and asks. A drag does none of those, and
// that is correct: the gesture IS the consent, and a confirmation after a
// direct manipulation is the dialog again with extra motions. The blocks
// visibly move; saying so in a toast is the same confirmation arriving after
// the fact, on every drag.

import { TFile } from "obsidian";
import type { MarkdownPostProcessorContext } from "obsidian";

import type ChronoAnvilPlugin from "../../main";
import { blockIndexAt } from "../../core/block-move";
import { splitGlyph } from "../section-frame";
import { moveCell, pageSlice, widgetRun } from "../../core/cell-move";
import type { CellSource, CellTarget } from "../../core/cell-move";
import { cellWidthsIn, snapRatio, widenCells } from "../../core/cell-width";
import { MAX_COLUMNS } from "../../core/directive-grammar";
import {
  heightAbove,
  resizeCell,
  runWithHeight,
  snapHeight,
} from "../../core/cell-height";
import {
  CARD_DIVIDER_CLASS,
  DIVIDER_INDEX_ATTR,
  GROUP_CLASS,
  GROUP_DIVIDER_CLASS,
  GROUP_HEAD_CLASS,
  ROW_CELL_CLASS,
  ROW_CLASS,
  ROW_CLOSED_CLASS,
  ROW_PAGE_ATTR,
} from "./row";
import { boundsOf } from "../header-title";
import { getFile } from "../../core/util";
import { panDuringDrag } from "../drag-scroll";

// The one drag type this file speaks. There were two until 4.8.1, the other
// being a whole block; see the header for why that one went.
const CELL_TYPE = "text/ca-cell";

// And a second one, which says WHAT THIS DRAG MAY BE — a column, a block, or
// both. 4.8.5.
//
// A column and a block are different shapes of the same move, and a source can
// offer one, the other or both. A widget in a row is both: it can take another
// column, or leave for a block of its own. A block holding two widgets is only
// ever a block — putting two widgets in one column is a decision about
// delimiters nobody has made. A row is only ever a block, for the same reason.
//
// TYPES RATHER THAN A FIELD IN THE PAYLOAD, and that is not a stylistic choice:
// `dragover` can read `dataTransfer.types` and cannot read the data. A slot that
// had to look inside the payload could only refuse ON DROP, after lighting up
// and promising the drop would work — which is the "accept it and then explain
// yourself" failure this project refuses everywhere else.
const BLOCK_TYPE = "text/ca-block";

export const HEAD_CLASS = "ca-journal-block-head";
export const CARD_CLASS = "ca-journal-widget-card";

// Which line of the fence body drew this element, and how many lines that body
// has. Written by `stampLines`, read by the gesture. 4.8 §1.4.
const GRIP_CLASS = "ca-jbd-handle";

// What is in the air, for the slots that would be a no-op. 4.8.7.
//
// A MODULE VARIABLE, NOT THE DOM, and every block on the page shares it because
// they share this module. `dataTransfer` cannot answer it: `dragover` may read
// the TYPES of a drag and not its data, which is the whole reason a permission
// is a type here — but "which block is this" is a number, and a number needs
// somewhere to live for the length of one gesture.
//
// Null between drags. Set at `dragstart`, cleared at `dragend`, and read by
// nothing else.
//
// `frees` IS WHETHER PICKING THIS UP CLOSES A COLUMN (4.52.1), which the two
// column-opening slots need and cannot work out for themselves: they are asked
// during `dragover`, where a drag's DATA is unreadable by design, and the fact
// they want is about the cell the drag came OUT of. Measured once at
// `dragstart`, where the element is in hand.
let inFlight: { block: number; whole: boolean; frees: boolean } | null = null;

// Which drag this is, so a block can cache what it worked out for the last one.
// Bumped once per `dragstart`; see `indexInDrag`.
let dragSeq = 0;
const LINE_ATTR = "data-ca-line";
const BODY_ATTR = "data-ca-body";
// THE LAST LINE OF A CHILD THAT DREW MORE THAN ONE (5.16). Absent on every
// child that is one directive, which is nearly all of them — see `markSpan`.
const SPAN_ATTR = "data-ca-span";

// The head itself, which a block and a widget build the same way.
//
// ONE BUILDER FOR BOTH, because the two are the same object at two scales: a
// slim bar naming what is under it, with room for a grip. A second copy would
// be where the block's head and the widget's started disagreeing about their
// markup, and the stylesheet dresses both from one class.
//
// A TITLE IS NOT OPTIONAL, as of 4.8.1. It was, and the untitled form was a
// bar that gave up everything except the grip — which is what a block with no
// name got. With the block grip gone there is nothing for an untitled head to
// hold, so the callers decide not to build one rather than building one that
// says nothing.
//
// AND THE GLYPH SITS IN A SLOT, AS OF 4.13 §1. It used to be the first characters
// of the title string — so `📆 Today` and `Trends` started their words at
// different x positions, and the homepage's five heads read as a ragged column.
// That is the same defect `splitGlyph` was written for one file over, and this is
// the same fix: the emoji is peeled off into a fixed-width slot and the titles
// line up. A head whose title carries no glyph gets no slot, because indenting
// every title to align the ones that have one is the worse trade — the rule
// `.ca-journal-header-glyph` already states and the reason this shares its shape.
//
// `journal-block-head-glyph` RATHER THAN `journal-header-glyph`, deliberately:
// `test/section-frame.test.ts` asserts that no module but `section-frame.ts`
// emits that literal, and one owner per class is worth more than one name. The
// two read the same tokens, so they cannot drift on the values that matter.
export function buildHead(host: HTMLElement, title: string): HTMLElement {
  const head = host.createDiv({ cls: HEAD_CLASS });
  const { glyph, text } = splitGlyph(title);
  if (glyph) head.createSpan({ cls: `${HEAD_CLASS}-glyph`, text: glyph });
  head.createDiv({ cls: `${HEAD_CLASS}-title`, text });
  return head;
}

// Put a widget in a card of its own, with its name at the top of it. 4.7.2.
//
// A CARD PER WIDGET, NOT PER CELL. A `cell` may hold three widgets stacked —
// the homepage's aside holds the launcher, open tasks and on this day — and one
// head over the three of them would have to name all three or say nothing. Each
// widget can name itself, so each gets its own.
//
// WRAPPED IN PLACE, which keeps every count that was taken before it: the
// wrapper replaces the widget at the widget's own index, so `cellPlan`'s
// boundaries — recorded as "how many children the block had" — still point at
// the same places, and `isCellContent` reads the wrapper exactly as it read the
// widget.
//
// ONLY INSIDE A ROW. A block that is not a row wears its head itself, and a
// wrapper there would put a second card inside the block's own. It would also
// add a level to a subtree that `.ca-journal-overview-card > .ca-journal-live-widget`
// and its like reach into with `>` — inside a row those selectors already stop
// at the cell, which is what makes this scope the safe one as well as the asked
// for one.
export function cardWidget(widget: HTMLElement, title: string): void {
  const parent = widget.parentElement;
  if (!parent) return;
  // A WIDGET THAT ALREADY HAS A BAND KEEPS IT AND GETS NOTHING. The rule the
  // block follows, one level down: the diary card says DIARY across its own top
  // and does not need "📆 Today" said above it in smaller letters.
  if (hasOwnBar(widget)) return;
  const card = createDiv({ cls: `${CARD_CLASS} has-head` });
  parent.insertBefore(card, widget);
  buildHead(card, title);
  carryStamp(widget, card);
  card.appendChild(widget);
}

// Move a child's stamps onto the wrapper that has just been put around it.
//
// THE STAMP COMES WITH IT. `stampLines` marks every DIRECT child of a block
// with the line of the directive that drew it, and a wrapper takes that child's
// place — so the wrapper is what a reader now grabs and the wrapper is what has
// to know which line it is. Re-deriving it would mean counting children a
// second time, against a list halfway through being rewritten.
//
// AND ITS SPAN WITH IT, for a widget bar: how many lines the thing being
// grabbed is.
//
// A FUNCTION SINCE 5.26.1, WHERE IT WAS `cardWidget`'S LAST SIX LINES. There is
// a second wrapper now — the field frame a band puts around a widget added to a
// diary entry — and it is built in `widgets/index.ts`, which cannot see these
// two attribute names and must not be given them one at a time. One operation,
// named, is what stops the second wrapper from carrying half of what the first
// one carries.
export function carryStamp(from: HTMLElement, to: HTMLElement): void {
  const line = from.getAttribute(LINE_ATTR);
  if (line !== null) to.setAttribute(LINE_ATTR, line);
  const span = from.getAttribute(SPAN_ATTR);
  if (span !== null) to.setAttribute(SPAN_ATTR, span);
}

// What a card wears when the note says how tall it is, and where the number
// goes. 4.22 §3.
//
// AN INLINE CUSTOM PROPERTY, WHICH IS `--ca-cell-weight`'s IDIOM — the
// stylesheet holds the three declarations and this holds the one number, so the
// common case leaves no mark in the DOM at all. A card with no height keeps the
// markup it had before this release existed.
export const SIZED_CLASS = "is-sized";
const CARD_H_VAR = "--ca-card-h";

// Give every child that the note states a height for that height.
//
// CALLED BETWEEN `cardWidget` AND `layOutRow`, and index.ts says why in both
// directions. What it walks is the block's children as they stand at that
// moment: a card for a widget that could be named, the widget itself for one
// that draws its own band, and both stamped with the line that drew them.
//
// THE BODY IS THE FENCE'S, UNFILTERED. `heightAbove` reads the line above the
// widget's own, so it needs the file's numbering — the same numbering
// `data-ca-line` carries — and not the loop's.
//
// A DIRECTIVE THAT DREW NOTHING IS WHY THIS IS SAFE. It left no child, so there
// is nothing here to walk, so a `height:` above it sizes nothing: §2's whole
// argument, and it costs a line of code because the argument was won in the
// arithmetic rather than here.
export function applyCardHeights(
  container: HTMLElement,
  body: readonly string[]
): void {
  for (const child of Array.from(container.children)) {
    if (!(child instanceof HTMLElement)) continue;
    const line = lineOf(child);
    if (line === null) continue;
    const px = heightAbove(body, line);
    if (px === null) continue;
    child.addClass(SIZED_CLASS);
    child.style.setProperty(CARD_H_VAR, `${px}px`);
  }
}

// Tell every child of this block which line of the fence drew it. 4.8 §1.4.
//
// `drawn` is what the dispatcher recorded on its way past each line: the number
// of children the block had at that moment. So the line that drew child `i` is
// the LAST one that had reached the block before child `i` existed — which is
// the same reading `cellPlan` makes of `cellBounds`, and it is exact for the
// same reason. A directive that drew nothing recorded a count identical to the
// next one's and is simply passed over; it never claims a child that is not
// its.
//
// THE BLOCK IS TOLD ITS OWN LENGTH TOO, because the slot at the end of a row
// points one past the last line and there is no child to read that from.
export function stampLines(
  container: HTMLElement,
  drawn: readonly { at: number; line: number }[],
  bodyLength: number
): void {
  container.setAttribute(BODY_ATTR, String(bodyLength));
  Array.from(container.children).forEach((el, i) => {
    if (!(el instanceof HTMLElement)) return;
    let line: number | null = null;
    for (const d of drawn) {
      if (d.at > i) break;
      line = d.line;
    }
    if (line !== null) el.setAttribute(LINE_ATTR, String(line));
  });
}

// Put a grip on this thing, laid over its own top edge.
//
// ONE PLACEMENT, AND IT USED TO BE TWO. The grip went inside the element's head
// where it had one, and over its top edge where it did not — which read well and
// had a fault the stylesheet could reach: a head is HIDDEN on a block inside a
// section run (`journal-sec-block`, added by `SectionPass` after the render) and
// on an `is-unframed` block, and a grip inside a hidden head is a hidden grip.
// That is what a vault saw as *"the bottom-most sections are missing their drag
// icons"* — every block under a section header, which on a dashboard is most of
// them.
//
// The general fault is worth naming rather than patching: the head is a LABEL
// and the grip is a CONTROL, and hanging a control inside something that four
// different rules are allowed to hide is a dependency between two things that
// have no reason to share a fate. So the grip is positioned against the thing
// being dragged and nothing else — which is 4.7.1's own conclusion about a strip
// with no head to sit in, arrived at again from the other direction.
//
// It lands in the same place it did: a head sits at the top of its block, so a
// grip over the block's first 10px is over the head's upper half either way.
function attachGrip(host: HTMLElement, label: string, cls = ""): HTMLElement {
  // ONE GRIP PER THING, EVEN IF ASKED TWICE (4.8.6). Reported from a vault as
  // *"the drag icon can also duplicate for new widgets/sections moved into the
  // block"*: a drop rewrites the note, the block re-renders, and a widget whose
  // element Obsidian reuses arrives already wearing one. Removing what is there
  // is cheaper than working out which of the paths in reduces to a second call,
  // and it is correct whichever of them did.
  host.querySelector(`:scope > .${GRIP_CLASS}`)?.remove();
  // The positioning context the grip resolves against. Added here rather than
  // asked of the stylesheet, because the host is whatever drew the thing — a
  // card, a block, or a widget with a band of its own — and this file cannot
  // know which class that is.
  host.addClass("ca-jbd-host");
  return host.createDiv({
    cls: `${GRIP_CLASS} ${cls}`.trim(),
    attr: { "aria-label": label, draggable: "true" },
  });
}

// ── THE ONE CHILD THAT IS NOT ONE DIRECTIVE ───────────────────────────
//
// `stampLines` stamps every direct child with the line of the last directive
// whose render reached it, and the inline kinds — `tracker:`, `sleep`,
// `slider:`, `button:` and the rest — all land in ONE `.ca-journal-widget-bar`
// together. So the bar carries the line of the FIRST of them, and a drag
// reading that stamp alone picks up one directive and moves it out from under
// the nine still drawn inside the element the reader is holding. An entry's
// tracker grid is exactly this: one bar, one stamp, ten cells.
//
// 5.15 ANSWERED THAT BY WITHHOLDING THE GESTURE, AND 5.16 GIVES IT A RANGE.
// The bar got no grip and no places of its own, which fixed the wrong move by
// removing the move — and a vault read the result as what it was: *"these
// widgets headers are missing the drag icons."* A head over something the
// reader cannot pick up is a card that says less than the cards beside it.
//
// A SECOND STAMP, WRITTEN BY THE ONLY CODE THAT KNOWS THE ANSWER. The dispatch
// loop appends each inline directive to the bar in turn, so it is holding the
// run's last line at the moment it appends the last cell; nothing downstream
// can re-derive that, because the DOM has one element where the file has ten
// lines. `markSpan` records it, `spanOf` reads it back, and everything else in
// this file goes on treating the bar as one widget.
//
// AND A MARKED REGION IS STAMPED AS ITS MARKERS, WHICH IS WHY THE SPAN IS A
// PAIR RATHER THAN A COUNT. A tracker grid is delimited by
// `# chronoanvil:trackers:start` and its `end`; both are filtered out before
// the dispatch loop ever runs (see `kept`), so no child is ever stamped with
// them, and "+ Add tracker" writes between them. A range from the first
// `tracker:` to the last would carry the cells out of their own region and
// leave the markers behind. `markRegion` is `index.ts` saying so: the grid's
// range is marker to marker, so the region travels whole and lands whole.
//
// THE CARD COUNTS AS THE BAR. `cardWidget` wraps the bar in place and copies
// both stamps onto the wrapper, so by the time a grip is hung the stamped child
// is the CARD and the bar is inside it.
export function markSpan(el: HTMLElement, last: number): void {
  el.setAttribute(SPAN_ATTR, String(last));
}

// The whole of a marked region, markers included, as the range that moves it.
export function markRegion(el: HTMLElement, first: number, last: number): void {
  el.setAttribute(LINE_ATTR, String(first));
  el.setAttribute(SPAN_ATTR, String(last));
}

// A CHILD NO DIRECTIVE DREW HAS NO LINE, and `index.ts` has exactly one: the
// empty grid a note gets when it declares a tracker region and holds no
// trackers yet. `stampLines` would hand it the line of whatever was drawn
// before it — a stamp that names another widget's directive — so it is cleared
// rather than left to be picked up.
export function clearStamp(el: HTMLElement): void {
  el.removeAttribute(LINE_ATTR);
  el.removeAttribute(SPAN_ATTR);
}

// The line a stamped element came from, or null on anything unstamped.
function lineOf(el: Element | null): number | null {
  const raw = el?.getAttribute(LINE_ATTR);
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// The last line of a child that drew a run of them, or null for the ordinary
// child that drew one.
function spanOf(el: Element | null): number | null {
  const raw = el?.getAttribute(SPAN_ATTR);
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// What a stamped child carries: its own line, a `height:` line above it where
// there is one, and every line to the end of its run where it drew more than
// one.
//
// ONE HELPER FOR THE THREE PLACES THAT ASK — a widget in a cell, a widget in a
// bare fence, and the slots that point at either. They disagreed once, in 4.22,
// and the symptom was a height line left behind sizing whatever moved up into
// its place.
function runOf(
  body: readonly string[] | null,
  line: number,
  span: number | null
): { from: number; to: number } {
  const base = body ? runWithHeight(body, line) : { from: line, to: line + 1 };
  return span === null ? base : { from: base.from, to: Math.max(base.to, span + 1) };
}

// Whether this widget is the only thing in its column. 4.52.1.
//
// WHY A SLOT NEEDS IT. `MAX_COLUMNS` says a row draws two columns, so the two
// slots that open one — the left and right edges of every card in a group — must
// not light up on a row that already has both. Except when the drag is coming
// out of THAT ROW and out of a cell holding nothing else: the column it leaves
// closes as the new one opens, so the count is unchanged and the reader is
// rearranging rather than adding. Refusing that would take away the only way to
// move a widget from the right column to the left of the left one.
//
// THE STAMPED CHILDREN ARE THE WIDGETS. A divider is a child of the cell too
// (`GROUP_DIVIDER_CLASS`, added before the content for exactly this kind of
// walk) and carries no line stamp, which is what makes the count exact.
//
// FALSE FOR ANYTHING NOT IN A CELL, which is every whole-block drag: a block
// arriving from elsewhere in the note frees no column in the row it lands in.
function onlyInItsCell(el: HTMLElement): boolean {
  const cell = el.closest(`.${ROW_CELL_CLASS}`);
  if (!cell) return false;
  return cell.querySelectorAll(`[${LINE_ATTR}]`).length === 1;
}

// The bands that are already a head: a section's bar, and the six a widget
// draws for itself.
//
// A LIST, AND THE SAME COST THE RESET LIST CARRIES. 05-inline-widgets.css says
// it where it names the four widgets that draw a card inside the block: keying
// off the container covers everything for the container's own chrome, but a
// band a WIDGET drew has to be named, because only that widget knows it drew
// one. The tell is the same — a rule with a negative margin cancelling a card's
// padding, which is what a band is.
//
// The cost of missing one is two bars stacked, which is what the homepage's
// diary cell showed: the hero `.jc-diary-header` painted said DIARY across the
// top of that card already, and a head saying "📆 Today" above it was the same
// sentence twice in two type sizes.
//
// THAT ENTRY IS GONE AS OF 4.13.1 §3, WITH THE BAND. The diary card opens on an
// actions strip now, which is a row of controls and not a name — so the card no
// longer says what it is, and the head above it is the only thing that does. A
// class in this list that nothing can carry is worse than an omission: it reads
// as a decision protecting something, and the thing it protects does not exist.
const BANDS = [
  // A section bar, and the wrapper `frame: section` builds around one.
  "ca-journal-sec",
  "ca-journal-sec-fold",
  "ca-journal-header-bar",
  // A widget's own.
  "ca-journal-overview-banner",
  "ca-jjs-hero",
  "ca-journal-entry-header",
  "ca-journal-study-header",
  // THE PAGE'S OWN NAME (4.19.1), AND THE OMISSION COST A HEAD READING "LINKS".
  //
  // 4.19 welded `title:` and `links:` into one banner fence. `blockTitle` reads
  // a head off the fence by finding the one keyword with a `SECTION_TITLES`
  // entry — `title` has none and `links` has "🔗 Links", so exactly one matched
  // and every dashboard drew a bar naming the page after the smaller of the two
  // widgets in it. `blockTitle`'s own comment names that failure: *"a head
  // naming the wrong widget — the kind that gets noticed weeks later on
  // somebody's dashboard."* It was noticed in the first render.
  //
  // THE FIX BELONGS HERE RATHER THAN IN `blockTitle`, because this list is
  // already the answer to the question being asked. The paragraph at the top of
  // this file states the rule — *a band a WIDGET drew has to be named, because
  // only that widget knows it drew one* — and the page's own name band is
  // exactly that. Teaching `blockTitle` to skip a fence holding `title` would be
  // a second mechanism deciding one fact, and the two would drift the first time
  // a banner grew a third line.
  //
  // `.ca-jtc-card` WAS THE FIRST ENTRY AND LEFT IN 5.2. It was the 4.5 head's
  // card, and 4.10 replaced that head without touching this list, so the name
  // 4.19.1 added here has matched nothing since. The band a page banner draws
  // today is `.ca-journal-page-head`, and it is the `pageBanner` flag on
  // `chromeClasses` in `index.ts` rather than this list that shapes it — which
  // is the mechanism that file's own comment block argues for at length.
  "ca-journal-overview-card",
];

// Whether this element already announces itself, in which case a head of ours
// would be a second one.
//
// THE FIRST CHILD, NOT A SEARCH. A band deeper inside belongs to something
// further in — a cell's widget draws its own, and a block is not that widget —
// and what decides this is whether the TOP of this element is already a band.
function hasOwnBar(container: HTMLElement): boolean {
  if (BANDS.some((c) => container.classList.contains(c))) return true;
  const first = container.firstElementChild;
  if (!first) return false;
  return BANDS.some((c) => first.classList.contains(c));
}

// What a drag carries: the block it came from, and the lines it is — once per
// shape it may take.
//
// TWO RANGES, BECAUSE THE ANSWER DEPENDS ON WHERE IT LANDS and the payload is
// written before that is known. A block dropped onto another block moves its
// WHOLE fence body, modifiers and all; the same block dropped into a column
// moves only the widget and the bar over it, because a `frame:` or `row` line
// describes the block being emptied rather than the widget leaving it. One range
// each, decided by the slot that takes the drop.
interface CellPayload {
  block: number;
  path: string;
  // The lines to move when it lands as a block. Always present.
  whole: { from: number; to: number };
  // The lines to move when it lands in a column, where it may. Absent is what
  // `CELL_TYPE` not being set already says; both are written from one answer.
  cell?: { from: number; to: number };
}

function readPayload(evt: DragEvent, path: string): CellPayload | null {
  const raw = evt.dataTransfer?.getData(BLOCK_TYPE) || evt.dataTransfer?.getData(CELL_TYPE);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as CellPayload;
    if (p.path !== path) return null;
    const ok = (r?: { from: number; to: number }): boolean =>
      !r || (Number.isFinite(r.from) && Number.isFinite(r.to));
    return Number.isFinite(p.block) && p.whole && ok(p.whole) && ok(p.cell)
      ? p
      : null;
  } catch {
    // A payload this cannot read is another plugin's drag wearing our type,
    // which is not a thing that happens — but a `JSON.parse` on a string from
    // outside is a throw waiting for the one day it does.
    return null;
  }
}

async function applyMove(
  plugin: ChronoAnvilPlugin,
  file: TFile,
  src: CellSource,
  dst: CellTarget
): Promise<void> {
  const text = await plugin.app.vault.read(file);
  const next = moveCell(text.split("\n"), src, dst);
  // `moveCell`'s null is "nothing would change" — a card put back where it was
  // picked up, which is what a reader who thinks better of a drag has asked
  // for. Writing the file to say nothing happened would put an entry in every
  // sync log in the vault for a gesture that did not move anything.
  if (!next) return;
  await plugin.app.vault.modify(file, next.join("\n"));
}

// A length written in the stylesheet, read back in pixels.
//
// DERIVED RATHER THAN REPEATED, which is this project's oldest rule applied to a
// number instead of to a path. The column floor and the gap are tokens
// (`--ca-row-cell-min`, `--ca-widget-gap`); a copy of either in TypeScript is a
// second place they have to agree, and the one that goes stale is the one no
// test is looking at. The fallback is only for a render with no computed style
// to read — an export, a detached node — where the gesture is not running
// anyway.
function pxToken(el: HTMLElement, name: string, fallback: number): number {
  const raw = getComputedStyle(el).getPropertyValue(name).trim();
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// The note with this block's columns set to these widths.
//
// THE SAME PATH A DROP TAKES, deliberately: read the file, rewrite one fence
// body, write it back once. A resize is a different gesture with the same
// contract — `widenCells` returns null for "nothing would change" exactly as
// `moveCell` does, and for the same reason.
async function applyWidths(
  plugin: ChronoAnvilPlugin,
  file: TFile,
  block: number,
  weights: readonly number[],
  // Which page of the group these columns are in (4.34 §6). The writer slices
  // the fence to that page and leaves every other one as the exact lines it was
  // read as.
  page: number
): Promise<void> {
  const text = await plugin.app.vault.read(file);
  const next = widenCells(text.split("\n"), block, weights, page);
  if (!next) return;
  await plugin.app.vault.modify(file, next.join("\n"));
}

// Dragging the edge between two columns to set how wide they are. 4.9 §3.
//
// ── A POINTER DRAG, WHERE EVERYTHING ELSE HERE IS AN HTML5 ONE ───────────
//
// Not a preference. A native drag carries a PAYLOAD to a TARGET — which is the
// right model for "this widget goes in that column" and the wrong one for this:
// there is nothing being carried and nowhere it is going. What a resize needs is
// a continuous position, sixty times a second, with the element still in the
// reader's hand; that is `pointermove`, and `setPointerCapture` keeps it coming
// even when the pointer outruns the 12px strip it started on.
//
// It is also what makes §3.2's argument work: the two gestures cannot collide
// because they are not the same kind of event.
//
// ── WHAT IS DECIDED HERE AND WHAT IS DECIDED IN `cell-width.ts` ──────────
//
// Here: pixels. Where the pointer is, how wide the row is, and how many shares
// that leaves room for. There: which ratio that is and what it writes. The split
// is 4.8's lesson stated as a shape — eight patch rounds, every one of them in
// the wiring between a gesture and a page, and not one in the arithmetic — so
// the arithmetic gets everything that can possibly be given to it.
function attachResize(
  plugin: ChronoAnvilPlugin,
  file: TFile,
  divider: HTMLElement,
  row: HTMLElement,
  cells: readonly HTMLElement[],
  n: number,
  noteNow: () => { block: number; lines: string[] } | null,
  page: number
): void {
  divider.addEventListener("pointerdown", (evt) => {
    if (evt.button !== 0) return;
    const left = cells[n - 1];
    const right = cells[n];
    if (!left || !right) return;
    // A WRAPPED ROW HAS NO BOUNDARY HERE, and this is the one check no
    // stylesheet can make. A row wraps rather than squeezing (4.3.1), so on a
    // narrow pane a divider drawn at a cell's left edge is at the start of a
    // NEW LINE — there is no column to its left and nothing to trade width
    // with. `offsetTop` is what "on the same line" means and there is no
    // container query that can ask it, because the answer depends on how many
    // cells there are and 4.3.1 is the release that established a query cannot
    // know that.
    if (left.offsetTop !== right.offsetTop) return;
    const where = noteNow();
    if (!where) return;
    const start = cellWidthsIn(where.lines, where.block, page);
    // A COUNT THAT DISAGREES IS A STALE RENDER. The cells are what the last
    // render drew and the weights are what the file says now; if the two no
    // longer describe the same row, the honest answer is to do nothing rather
    // than to write widths against columns that have moved.
    if (!start || start.length !== cells.length) return;

    evt.preventDefault();
    // THE BLOCK UNDER IT MUST NOT HEAR THIS. A divider sits inside a cell inside
    // a block, and every widget under it has controls of its own; a resize that
    // also counted as a click on a day cell would be a gesture one slip away
    // from every one of them.
    evt.stopPropagation();
    divider.setPointerCapture(evt.pointerId);
    divider.addClass("is-resizing");
    row.addClass("is-resizing");

    // HOW MANY SHARES THIS ROW CAN HOLD, which is the cap `snapRatio` is asked
    // for and the whole reason it takes one. A cell's basis is its weight times
    // the floor, so a pair asking for more shares than the row has room for
    // makes the row WRAP — and it would wrap under the pointer, mid-drag, which
    // is the "a gap opens under the pointer" failure the drop slots were made
    // absolute to avoid. The grammar cannot cap a weight (`cellWeightOf` says
    // why, at length: a cap there could not describe a monitor); a gesture with
    // the row in its hand can measure one.
    const floorPx = pxToken(row, "--ca-row-cell-min", 320);
    const gapPx = pxToken(row, "--ca-widget-gap", 10);
    const fits = Math.floor(
      (row.clientWidth - gapPx * (cells.length - 1)) / floorPx
    );
    // The other columns keep what they have, so what is left is the pair's.
    const cap = fits - start.reduce((sum, w, i) => (i === n - 1 || i === n ? sum : sum + w), 0);

    // WHAT THE TWO CELLS WORE BEFORE, so Escape is a restore rather than a
    // second write. `row.ts` leaves no inline style at all on a cell of one
    // share, so the empty string is a real value here and means "take it off
    // again".
    const was = [
      left.style.getPropertyValue("--ca-cell-weight"),
      right.style.getPropertyValue("--ca-cell-weight"),
    ];
    let live: [number, number] = [start[n - 1], start[n]];

    const restore = (): void => {
      const pairs: [HTMLElement, string][] = [
        [left, was[0]],
        [right, was[1]],
      ];
      for (const [el, value] of pairs) {
        if (value) el.style.setProperty("--ca-cell-weight", value);
        else el.style.removeProperty("--ca-cell-weight");
      }
    };

    // LIVE PREVIEW IS AN INLINE VARIABLE AND NOTHING ELSE. The stylesheet
    // already reads `var(--ca-cell-weight, 1)` on both the grow and the basis
    // (4.4 §2), so the columns follow the pointer through the same declarations
    // the file will produce — what the reader sees during the drag is what the
    // note will render as, rather than a separate preview that can disagree.
    const show = (a: number, b: number): void => {
      live = [a, b];
      left.style.setProperty("--ca-cell-weight", String(a));
      right.style.setProperty("--ca-cell-weight", String(b));
    };

    const track = (e: PointerEvent): void => {
      // MEASURED EVERY TIME, not captured once. On a two-column group the pair
      // spans the whole row whatever the ratio, so this is exactly stable and
      // the divider stays under the pointer. On three or more the pair's own
      // span changes as it takes shares from the rest, and re-measuring is what
      // keeps the pointer and the edge together through that.
      const a = left.getBoundingClientRect();
      const b = right.getBoundingClientRect();
      const span = b.right - a.left;
      if (span <= 0) return;
      const [wa, wb] = snapRatio((e.clientX - a.left) / span, cap);
      if (wa !== live[0] || wb !== live[1]) show(wa, wb);
    };

    // ARROWS RATHER THAN DECLARATIONS, and not for style: a hoisted `function`
    // can be called before the guards above have run, so TypeScript refuses to
    // carry their narrowing into one. The four of them reference each other, so
    // `stop` is written last and the three that call it close over it.
    const cancel = (): void => {
      stop();
      restore();
    };

    const finish = (e: PointerEvent): void => {
      track(e);
      stop();
      // NOTHING MOVED IS NOT A WRITE. `widenCells` would say so too — it returns
      // null when the body it would produce is the body it was given — but the
      // inline styles are this side's to clean up, and leaving them on would put
      // a mark in the DOM for the common case that `row.ts` deliberately keeps
      // clear.
      if (live[0] === start[n - 1] && live[1] === start[n]) {
        restore();
        return;
      }
      const next = [...start];
      next[n - 1] = live[0];
      next[n] = live[1];
      void applyWidths(plugin, file, where.block, next, page);
    };

    // ESCAPE PUTS IT BACK, which is the undo a gesture with no dialog has. A
    // drag that is already moving the thing it is about needs no confirmation
    // (this file's header says why) — what it needs is a way out that costs
    // nothing, and the key every reader already tries is the one.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      cancel();
    };

    const stop = (): void => {
      divider.removeClass("is-resizing");
      row.removeClass("is-resizing");
      divider.releasePointerCapture?.(evt.pointerId);
      divider.removeEventListener("pointermove", track);
      divider.removeEventListener("pointerup", finish);
      divider.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", onKey, true);
    };

    divider.addEventListener("pointermove", track);
    divider.addEventListener("pointerup", finish);
    divider.addEventListener("pointercancel", cancel);
    // CAPTURING, so the note's own editor does not eat the key first.
    window.addEventListener("keydown", onKey, true);
  });
}

// The note with one widget's card set to this height, or with its height taken
// away when `px` is null.
//
// `applyWidths`' PATH EXACTLY: read the file, rewrite one fence body, write it
// back once, and do nothing at all when `resizeCell` says nothing would change.
async function applyHeight(
  plugin: ChronoAnvilPlugin,
  file: TFile,
  block: number,
  line: number,
  px: number | null
): Promise<void> {
  const text = await plugin.app.vault.read(file);
  const next = resizeCell(text.split("\n"), block, line, px);
  if (!next) return;
  await plugin.app.vault.modify(file, next.join("\n"));
}

// Dragging the mark under a card to set how tall it is. 4.22 §4.3.
//
// `attachResize`'s MIRROR, with the same five properties and for the same
// reasons — a pointer drag rather than an HTML5 one, live preview through the
// declaration the file will produce, the note re-read at `pointerdown` and never
// before, Escape restores and writes nothing, and nothing moved is not a write.
// Only what differs is argued below.
function attachCardResize(
  plugin: ChronoAnvilPlugin,
  file: TFile,
  divider: HTMLElement,
  card: HTMLElement,
  noteNow: () => { block: number; lines: string[] } | null,
  bodyNow: () => string[] | null
): void {
  divider.addEventListener("pointerdown", (evt) => {
    if (evt.button !== 0) return;
    // THE CARD KNOWS WHICH LINE IT IS, because `cardWidget` copied the widget's
    // stamp onto it. There is no counting here and no boundary to locate — a
    // height belongs to ONE line, which is the whole reason §4.1 puts a handle
    // on every card instead of a mark on every seam.
    const line = lineOf(card);
    if (line === null) return;
    const where = noteNow();
    const body = bodyNow();
    if (!where || !body) return;
    // A LINE PAST THE END IS A STALE RENDER, which is `attachResize`'s count
    // check asked about a line instead of a length. `setCellHeight` refuses a
    // line that is not a widget as well, so the write cannot land wrong; this
    // is only so a stale card does not take the pointer and pretend.
    if (line >= body.length) return;

    evt.preventDefault();
    // THE BLOCK UNDER IT MUST NOT HEAR THIS, for `attachResize`'s reason.
    evt.stopPropagation();
    divider.setPointerCapture(evt.pointerId);
    divider.addClass("is-resizing");
    card.addClass("is-resizing");

    const start = heightAbove(body, line);
    const min = pxToken(card, "--ca-card-h-min", 120);

    // WHAT THE CARD WORE BEFORE, so Escape is a restore rather than a second
    // write — and `row.ts`'s rule again: an unsized card has no inline style at
    // all, so the empty string is a real value and means "take it off".
    const was = card.style.getPropertyValue(CARD_H_VAR);
    const wasSized = card.hasClass(SIZED_CLASS);

    const restore = (): void => {
      if (was) card.style.setProperty(CARD_H_VAR, was);
      else card.style.removeProperty(CARD_H_VAR);
      if (wasSized) card.addClass(SIZED_CLASS);
      else card.removeClass(SIZED_CLASS);
    };

    // THE HEIGHT THE CARD WOULD HAVE IF NOBODY HAD ASKED, and it is what makes
    // dragging downward past the content CLEAR the line rather than write an
    // ever-larger number.
    //
    // MEASURED WITH THE STATED HEIGHT TAKEN OFF, which is the only way to ask
    // it: a card wearing `is-sized` is exactly as tall as the number on it, so
    // its `scrollHeight` would report that number straight back and every card
    // would be its own natural height. One reflow, once, at `pointerdown` —
    // never in `track`, where it would be sixty a second.
    card.removeClass(SIZED_CLASS);
    card.style.removeProperty(CARD_H_VAR);
    card.addClass("is-measuring-natural");
    const natural = card.scrollHeight;
    card.removeClass("is-measuring-natural");
    restore();

    let live: number | null = start;

    // LIVE PREVIEW IS THE CLASS AND THE INLINE VARIABLE AND NOTHING ELSE —
    // exactly what `applyCardHeights` will put back when the note re-renders, so
    // what the reader sees during the drag is what the note will render as.
    const show = (px: number | null): void => {
      live = px;
      if (px === null) {
        card.removeClass(SIZED_CLASS);
        card.style.removeProperty(CARD_H_VAR);
        return;
      }
      card.addClass(SIZED_CLASS);
      card.style.setProperty(CARD_H_VAR, `${px}px`);
    };

    const track = (e: PointerEvent): void => {
      // THE CARD'S OWN TOP, measured every time for `attachResize`'s reason: the
      // cards below this one move as it grows, and on a wrapped row the whole
      // column can move. The top of the card is where its height is measured
      // from, so it is what the pointer's distance is taken against.
      const px = snapHeight(
        e.clientY - card.getBoundingClientRect().top,
        min,
        natural
      );
      if (px !== live) show(px);
    };

    // ARROWS RATHER THAN DECLARATIONS, for `attachResize`'s reason.
    const cancel = (): void => {
      stop();
      restore();
    };

    const finish = (e: PointerEvent): void => {
      track(e);
      stop();
      // NOTHING MOVED IS NOT A WRITE. `resizeCell` would say so too, but the
      // class and the inline style are this side's to clean up and leaving them
      // on would put a mark in the DOM for the common case that `row.ts` and
      // `applyCardHeights` both deliberately keep clear.
      if (live === start) {
        restore();
        return;
      }
      void applyHeight(plugin, file, where.block, line, live);
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      cancel();
    };

    const stop = (): void => {
      divider.removeClass("is-resizing");
      card.removeClass("is-resizing");
      divider.releasePointerCapture?.(evt.pointerId);
      divider.removeEventListener("pointermove", track);
      divider.removeEventListener("pointerup", finish);
      divider.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", onKey, true);
    };

    divider.addEventListener("pointermove", track);
    divider.addEventListener("pointerup", finish);
    divider.addEventListener("pointercancel", cancel);
    // CAPTURING, so the note's own editor does not eat the key first.
    window.addEventListener("keydown", onKey, true);
  });
}

// The two drag handles that resize rather than move: the divider between two
// columns, and the one on the bottom edge of every card in them.
//
// EXTRACTED FROM `attachBlockHead` IN 5.2. It is the tail of that function and
// the only part of it that wires a POINTER gesture — everything above is the
// native drag-and-drop grammar, slots and grips. `attachResize` and
// `attachCardResize` own the physics; this only decides which element gets
// which, and the two loops that decide it are short enough to read together.
//
// ONLY WHERE THERE IS A ROW. A block that is not a group has no columns to
// divide and no cards drawn by `layOutRow` to size.
function wireResizeHandles(
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext,
  file: TFile,
  container: HTMLElement,
  row: HTMLElement,
  cells: readonly HTMLElement[],
  openPage: number,
  indexNow: () => number | null,
  bodyNow: () => string[] | null
): void {
  // WHERE THIS BLOCK IS AND WHAT THE FILE SAYS, both asked at `pointerdown`
  // and never before. `indexNow`'s lesson, which cost 4.7 a patch: every drop
  // rewrites the note, so a block index or a body taken at render time
  // describes a page that has since moved.
  const noteNow = (): { block: number; lines: string[] } | null => {
    const i = indexNow();
    if (i === null) return null;
    const text = ctx.getSectionInfo(container)?.text;
    return text === undefined ? null : { block: i, lines: text.split("\n") };
  };
  for (const divider of Array.from(
    row.querySelectorAll<HTMLElement>(`.${GROUP_DIVIDER_CLASS}`)
  )) {
    const n = Number(divider.getAttribute(DIVIDER_INDEX_ATTR));
    if (!Number.isInteger(n) || n < 1 || n >= cells.length) continue;
    attachResize(plugin, file, divider, row, cells, n, noteNow, openPage);
  }

  // ── AND SETTING A WIDGET'S HEIGHT (4.22 §4.3) ───────────────────────
  //
  // The same argument, one axis over: a pointer drag cannot collide with a
  // native one, and `.is-slotting .journal-card-divider` is inert in the
  // stylesheet for the same belt-and-braces reason.
  //
  // ASKED OF THE CARD RATHER THAN OF AN INDEX. A column divider needs to know
  // which boundary it is on and carries `data-ca-divider` to say so; a card
  // divider needs only the card it is inside, and the card already knows which
  // line it is. So there is no attribute here and nothing to keep in step.
  for (const divider of Array.from(
    row.querySelectorAll<HTMLElement>(`.${CARD_DIVIDER_CLASS}`)
  )) {
    const card = divider.parentElement;
    if (!(card instanceof HTMLElement)) continue;
    attachCardResize(plugin, file, divider, card, noteNow, bodyNow);
  }
}

// What one landing place looks like from the outside — see `slot`, which is
// where they are made. Named so the wiring below can be handed the factory
// rather than being written inside the function that owns it.
type SlotFn = (
  host: HTMLElement,
  cls: string,
  needs: string,
  range: (src: CellPayload) => { from: number; to: number } | undefined,
  where: () => CellTarget | null,
  live?: () => boolean
) => void;

// The five places on every widget in the row, for every widget in every cell.
//
// EXTRACTED FROM `attachBlockHead` IN 5.2. The essay above the call says what
// the five are and why a swap takes the middle; this is the loop that draws
// them, and it is the same five for every card, which is exactly what makes it
// a thing worth naming rather than a passage to read through.
//
// TAKES `slot` RATHER THAN MAKING ONE. The factory closes over the block, its
// file and its container — everything a drop has to rewrite — and it is the
// caller that has those. What is here is only WHICH slots exist and WHERE each
// one points.
function wireCellSlots(
  cells: readonly HTMLElement[],
  opens: readonly (number | null)[],
  slot: SlotFn,
  indexNow: () => number | null,
  hasRoom: () => boolean,
  // WHERE THIS PAGE ENDS, which is the end of the BODY only on the last one
  // (5.16). A group with two pages is one fence, so the line after the last
  // widget on page 1 is page 2's `tab` delimiter — and a column opened at
  // `body.length` from a card on page 1 opened it after everything on page 2.
  endNow: () => number | null
): void {
  cells.forEach((cell, n) => {
  const before = opens[n];
  // WHERE THE NEXT COLUMN STARTS, or the end of the body for the last one:
  // the two of them are what "a column of my own, after this cell" means.
  const after = (): CellTarget | null => {
    const i = indexNow();
    if (i === null) return null;
    const next = opens[n + 1];
    if (next !== null && next !== undefined) {
      return { kind: "cell", block: i, at: next };
    }
    // PAST THE LAST LINE OF THIS PAGE, read from the file rather than from a
    // stamp: the end of a page is the one position no child can carry, and
    // `moveCell` clamps anything past it anyway.
    const end = endNow();
    return end === null ? null : { kind: "cell", block: i, at: end };
  };

  for (const child of Array.from(cell.children)) {
    if (!(child instanceof HTMLElement)) continue;
    const line = lineOf(child);
    if (line === null) continue;
    // WHERE THIS CHILD ENDS, WHICH IS ITS OWN LINE FOR ALL BUT ONE OF THEM
    // (5.16). A widget bar drew a run, and its two stacking places are about
    // the run rather than about its first line: "below the tracker grid" is
    // after the LAST of them, and pointing at the first would land a widget
    // between two tracker cells — inside the bar the reader dropped it under.
    const span = spanOf(child);
    const ends = span ?? line;

    if (before !== null) {
      slot(child, "ca-jbd-slot-before", CELL_TYPE, (p) => p.cell, () => {
        const i = indexNow();
        return i === null ? null : { kind: "cell", block: i, at: before };
      }, hasRoom);
    }
    slot(child, "ca-jbd-slot-after", CELL_TYPE, (p) => p.cell, after, hasRoom);
    slot(child, "ca-jbd-slot-over", CELL_TYPE, (p) => p.cell, () => {
      const i = indexNow();
      return i === null ? null : { kind: "stack", block: i, at: line, after: false };
    });
    slot(child, "ca-jbd-slot-under", CELL_TYPE, (p) => p.cell, () => {
      const i = indexNow();
      return i === null ? null : { kind: "stack", block: i, at: ends, after: true };
    });
    // AND A RUN IS NOT A SWAP TARGET. `moveCell`'s swap trades the run in hand
    // for ONE line of the destination — the shape the target payload can carry
    // — so a swap onto a widget bar would take one `tracker:` line out of the
    // middle of a grid and leave the rest of the region around the arrival.
    // The two stacking places are the whole grammar a run has; the middle of it
    // belongs to nobody, which is exactly what 5.15 drew for a bare fence's
    // widgets and for the same reason.
    if (span === null) {
      slot(child, "ca-jbd-slot-swap", CELL_TYPE, (p) => p.cell, () => {
        const i = indexNow();
        return i === null ? null : { kind: "swap", block: i, at: line };
      });
    }
  }
});
}

// What a drag SOURCE looks like from the outside: a host to hang the grip on,
// what to call it, whether it is the whole block, what lines it carries, and
// what goes dim while it is in the air.
type SourceFn = (
  host: HTMLElement,
  label: string,
  whole: boolean,
  ranges: () => Omit<CellPayload, "block" | "path"> | null,
  dim?: HTMLElement
) => void;

// The factory behind those. EXTRACTED FROM `attachBlockHead` IN 5.2 — the grip
// half of the same split that took `slot`'s shape out as a type: what a source
// DOES is one thing used twice, and WHERE the two of them go is the caller's
// business and stays there.
//
// A FACTORY RATHER THAN FIVE MORE PARAMETERS. Every source on a block shares
// the same three facts — which container, which note, which block index right
// now — and closing over them once is what lets the two call sites read as the
// two decisions they are.
function makeSource(
  container: HTMLElement,
  sourcePath: string,
  indexNow: () => number | null
): SourceFn {
// One source. The ranges are asked at the drag rather than closed over,
// because a block's body is a fact about a file every drop rewrites.
return (
  host: HTMLElement,
  label: string,
  whole: boolean,
  ranges: () => Omit<CellPayload, "block" | "path"> | null,
  // WHAT GOES DIM, which is not always what holds the grip (4.9 §2.2). A grip
  // is positioned against the thing it drags, and for a group that thing is
  // the BOX while the grip lives in the box's foot — a slim strip going half
  // transparent on its own would say nothing about what is moving. Defaults to
  // the host, which is every other caller.
  dim: HTMLElement = host
): void => {
  const grip = attachGrip(host, label);
  // HOW THE READER REACHES THE REST OF THE PAGE (4.57). A native drag stops
  // the pane scrolling — the browser owns the input stream and sends the page
  // drag events and nothing else — so a homepage taller than its pane could
  // only be rearranged among the blocks that happened to be on screen. See
  // `drag-scroll.ts`, which turns `dragover` coordinates into an edge band.
  let stopPan: (() => void) | null = null;
  grip.addEventListener("dragstart", (evt) => {
    const block = indexNow();
    const at = ranges();
    if (block === null || !at) {
      evt.preventDefault();
      return;
    }
    const payload = JSON.stringify({ block, path: sourcePath, ...at });
    // ONE TYPE PER SHAPE THIS DRAG MAY TAKE. A slot checks for its own and
    // declines everything else, during `dragover`, before the reader has
    // committed to anything. See `BLOCK_TYPE`.
    evt.dataTransfer?.setData(BLOCK_TYPE, payload);
    if (at.cell) evt.dataTransfer?.setData(CELL_TYPE, payload);
    evt.dataTransfer?.setData("text/plain", "");
    dragSeq++;
    inFlight = { block, whole, frees: onlyInItsCell(host) };
    dim.addClass("is-dragging");
    stopPan = panDuringDrag(grip);
  });
  grip.addEventListener("dragend", () => {
    stopPan?.();
    stopPan = null;
    inFlight = null;
    dim.removeClass("is-dragging");
    container.removeClass("is-slotting");
  });
};
}

// The factory behind every landing place on a block. EXTRACTED FROM
// `attachBlockHead` IN 5.2, alongside `makeSource`, and for the same reason:
// what a slot IS is one shape used seven times, and WHICH seven a block draws
// is the caller's argument — the essay it is written in stays there with it.
function makeSlot(
  plugin: ChronoAnvilPlugin,
  file: TFile,
  sourcePath: string,
  container: HTMLElement
): SlotFn {
// One landing place. `where` is asked at the drop rather than built into the
// slot, because a block's index and its body length are both facts about a
// file that every drop rewrites — `indexNow`'s lesson, and the same bug if it
// is ignored here.
// `needs` is the shape this slot takes — see `BLOCK_TYPE`. `range` reads the
// matching half of the payload, so the slot that accepted the drag is the one
// that decides which lines move.
return (
  host: HTMLElement,
  cls: string,
  needs: string,
  range: (src: CellPayload) => { from: number; to: number } | undefined,
  where: () => CellTarget | null,
  // Whether this slot would do anything for the drag in the air. Default is
  // "yes"; only the two block slots ask, and only about a whole block.
  live: () => boolean = () => true
): void => {
  const el = host.createDiv({ cls: `ca-jbd-slot ${cls}` });
  el.addEventListener("dragover", (evt) => {
    if (!evt.dataTransfer?.types.includes(needs)) return;
    // DECLINED BEFORE IT LIGHTS UP, not on drop. A slot that accepts a drag
    // and then writes nothing is the editor lying about what it will do,
    // which is the failure the whole plan-before-write rule exists to avoid —
    // here it is a landing place rather than a dialog.
    if (!live()) return;
    evt.preventDefault();
    el.addClass("is-live");
  });
  el.addEventListener("dragleave", () => el.removeClass("is-live"));
  el.addEventListener("drop", (evt) => {
    const src = readPayload(evt, sourcePath);
    if (!src) return;
    evt.preventDefault();
    // THE BLOCK UNDER IT MUST NOT ALSO HEAR THIS. A slot sits inside a block
    // that is itself listening, and a drop heard twice is a move made twice.
    evt.stopPropagation();
    el.removeClass("is-live");
    container.removeClass("is-slotting");
    const at = range(src);
    const dst = where();
    if (at && dst) void applyMove(plugin, file, { block: src.block, ...at }, dst);
  });
};
}

// Give this block its head, and its cells their grips.
//
// `title` is what the head calls the block — `blockTitle`'s answer, which is
// null wherever a block is not one nameable thing.
//
// `fixed` is which of the fence's body lines nothing may pick up or drop into,
// given as the FENCE'S OWN LINE NUMBERS so it is the same numbering `lineAt`,
// `stampLines` and `moveCell` all speak. Empty for every block but one: the one
// holding the page head. 4.11.
export function attachBlockHead(
  plugin: ChronoAnvilPlugin,
  container: HTMLElement,
  ctx: MarkdownPostProcessorContext,
  title: string | null = null,
  fixed: readonly number[] = [],
  // WHETHER THIS FENCE DRAWS ITS OWN SECTION CHROME — 4.12 §A. A `header:` line
  // or `frame: section`, computed by the dispatcher.
  //
  // A PARAMETER RATHER THAN A LOOK AT THE DOM, on `fixed`'s own argument one
  // line up: the dispatcher is holding the fence's lines, and this file would
  // have to infer the same fact from rendered children. `hasOwnBar` is the
  // inference already available here and it is the WRONG question — it is a
  // superset that includes `journal-overview-banner` and `jjs-hero`, which are
  // widgets, so using it would withhold the quarters from the homepage's diary
  // card, one of the few blocks that IS groupable.
  //
  // IT ONLY WITHHOLDS THE QUARTERS. The block keeps its grip and its
  // above/below slots, because a titled section still reorders. See
  // `widgetRun`, which closes the same gesture from the source end.
  section = false
): void {
  // THE HEAD IS DRAWN FIRST AND UNCONDITIONALLY, because a name is true
  // wherever it is read — including in an embed, an export, and every other
  // place `boundsOf` declines to locate the block. Only the GESTURE needs to
  // know where the block is, and everything below the gate does.
  //
  // TWO REASONS TO DRAW NO HEAD, and they are about the bar rather than about
  // the grip that used to live in it: the block's top is already a bar, which
  // says its name and leaves room above it; or nothing here can name the block,
  // and a bar with nothing in it is a rule ruled across a page for no reason.
  //
  // ASKED BEFORE THE HEAD EXISTS, because the head is prepended and would
  // otherwise be the first child of an empty block answering about itself.
  if (title && !hasOwnBar(container)) {
    buildHead(container, title);
    // AND THE BLOCK IS TOLD, because a bar needs a card under it. A titled head
    // on the page's own background is a label floating above a card rather than
    // the head of one, so the block draws the card and the head bleeds its
    // padding — the shape `.ca-journal-entry-header` and `.ca-journal-study-header`
    // already have. The stylesheet withholds it from a block that has chrome
    // already; this class only says the head is there.
    container.addClass("has-head");
  }

  // ONLY A GATE, AND ONLY THE GESTURE'S. Whether this block can be located at
  // all does not change while the note is open — an embed is an embed — so it
  // is asked once. WHERE it is does change, on every drop, and is asked again
  // below.
  if (!boundsOf(ctx, container)) return;

  // AND A SECOND GATE, WHICH IS THE WHOLE OF "THE PAGE TITLE IS IMMOVABLE" ON
  // THIS SIDE (4.11).
  //
  // ONE RETURN RATHER THAN FIVE GUARDS, and that is the point. Everything below
  // this line is the gesture: the block's own grip, the slot above it, the slot
  // below it, the two side quarters that turn a block into a column of a group,
  // the per-widget grips and slots inside a row, and the divider that resizes
  // one. A block that must not move needs all of them withheld, and naming them
  // one at a time is five places to forget the sixth — which is exactly the shape
  // `bandOf` refuses in the section editor, where an immovable row is not in any
  // band rather than being checked at each of three sites.
  //
  // THE HEAD IS STILL DRAWN, ABOVE. A name is true wherever it is read; only the
  // gesture is being declined.
  //
  // AND A READER WHO TYPES `title` INTO A ROW FENCE LOSES THAT BLOCK'S GESTURES
  // ENTIRELY. Deliberate, and it is what keeps this in step with the model:
  // `planFlatSections` refuses to move a block holding a pinned section for the
  // same reason and in the same words. The alternative — withholding the head's
  // own grip while leaving the block's — would be a page where the thing that
  // must not move can be moved by picking up its neighbour.
  if (fixed.length) return;

  const file = getFile(plugin.app, ctx.sourcePath);
  if (!(file instanceof TFile)) return;

  // WHICH BLOCK THIS IS, ASKED AT THE MOMENT IT MATTERS.
  //
  // THE BUG THIS FIXES, REPORTED FROM A VAULT: *"some sections do not move, but
  // others will be re-arranged instead."* The line range was resolved once, at
  // render, and kept. Every drop rewrites the note, so a block that did not
  // itself re-render went on pointing at the lines it used to occupy — which
  // after one move belong to a different block. The gesture then moved that one
  // instead, correctly, from the wrong premise.
  //
  // `getSectionInfo` re-reads the live document, so asking again costs nothing
  // and is the only way to be right about a note that has changed since.
  const indexNow = (): number | null => {
    const bounds = boundsOf(ctx, container);
    if (!bounds) return null;
    const text = ctx.getSectionInfo(container)?.text ?? "";
    return blockIndexAt(text.split("\n"), bounds.from);
  };

  // The same answer, but asked once per drag rather than once per `dragover`.
  //
  // `dragover` fires on every movement of the pointer, and `indexNow` segments
  // the whole note — twice, since `fencesOf` re-segments each run to classify
  // it. Asking that sixty times a second, on every block the pointer crosses,
  // is enough to make the gesture feel like it is refusing to work, which is
  // half of what a vault reported. The note cannot change during a drag: no
  // write happens until the drop, so one answer per drag is exact rather than
  // merely cheaper.
  let cached: { seq: number; index: number | null } | null = null;
  const indexInDrag = (): number | null => {
    if (cached?.seq !== dragSeq) cached = { seq: dragSeq, index: indexNow() };
    return cached.index;
  };

  // This fence's body, as the file has it right now.
  //
  // READ FROM THE DOCUMENT, NOT FROM THE RENDER, for `indexNow`'s reason: the
  // processor's copy of these lines is what the block was built from, and every
  // drag rewrites the note. `getSectionInfo` bounds the fence and the lines
  // between its two ``` are its body — which is the numbering `moveCell` speaks
  // and the one the stamps were taken in.
  const bodyNow = (): string[] | null => {
    const info = ctx.getSectionInfo(container);
    if (!info) return null;
    return info.text.split("\n").slice(info.lineStart + 1, info.lineEnd);
  };

  // A CARD IN THE AIR OPENS THIS BLOCK'S LANDING PLACES. The class is on the
  // block and the slots are its own children, so no block has to be told
  // anything by another one — a drag announces itself by arriving.
  container.addEventListener("dragover", (evt) => {
    // EITHER TYPE OPENS THIS BLOCK'S LANDING PLACES, and the missing half of
    // that condition is the bug a vault reported twice.
    //
    // This read `CELL_TYPE` alone, from 4.8.4, when a cell was the only thing
    // a drag could be. 4.8.5 gave a whole BLOCK its drag back under a type of
    // its own — and a block that cannot become a column sets ONLY that type.
    // So dragging one added `is-slotting` nowhere, no slot was ever displayed,
    // and nothing could be dropped anywhere on the page.
    //
    // WHICH BLOCKS THOSE ARE is what made it look like one section's problem:
    // `widgetRun` withholds the cell range from a block that does not hold
    // exactly one widget. The homepage's Trends fence holds a `header:` line
    // and nothing else — no charts are composed into it — so it is the one
    // block on that page with no cell range, and the one block that could not
    // be moved. Every other page's sections mostly hold one widget each, which
    // is why it looked like a homepage fault until sections with two showed the
    // same thing.
    const types = evt.dataTransfer?.types;
    if (!types?.includes(CELL_TYPE) && !types?.includes(BLOCK_TYPE)) return;
    container.addClass("is-slotting");
  });

  // LEAVING FOR A CHILD IS NOT LEAVING. `dragleave` fires on the block when the
  // pointer crosses into anything inside it — a cell, a card, a slot — so an
  // unconditional clear puts the slots away at the exact moment the reader
  // reaches for one, and the following `dragover` brings them back.
  container.addEventListener("dragleave", (evt) => {
    const to = evt.relatedTarget;
    if (to instanceof Node && container.contains(to)) return;
    container.removeClass("is-slotting");
  });

  // AND A DRAG THAT ENDED SOMEWHERE ELSE LEAVES NOTHING BEHIND. `dragend` only
  // fires on the element the drag started from, so a block the reader passed
  // over and abandoned (Escape, or a drop somewhere else) would keep its slots
  // open. Pointer events do not fire during a native drag, so the first mouse
  // movement afterwards is both a reliable signal that the drag is over and the
  // cheapest one available.
  container.addEventListener("mouseover", () => {
    container.removeClass("is-slotting");
  });

  // ── THE SLOTS, AND THE CARDS THAT AIM AT THEM ─────────────────────────

  const slot = makeSlot(plugin, file, ctx.sourcePath, container);

  // WHICH SLOTS A BLOCK DRAWS, AND WHY THE TWO KINDS MAY NOT OVERLAP (4.8.4).
  //
  // THE BUG THAT SETTLED THIS, REPORTED FROM A VAULT: *"drag works for the row
  // on the homepage, but not outside."* Both kinds were drawn over each other on
  // a row block, and the one on top won every drop — which is not what the
  // z-indexes say, and is exactly what the browser does.
  //
  // `container-type: inline-size` IS A STACKING CONTEXT. It is on the block (for
  // every `@container` rule in styles/) and on the cell (4.2 §2, so a widget in
  // a third of a row measures that third). Inline-size containment implies
  // LAYOUT containment, and layout containment creates a stacking context — so a
  // cell slot's `z-index` is confined INSIDE its cell, and the cell itself sits
  // at `z-index: auto` in the block. ANY positive z-index on a direct child of
  // the block therefore beats every slot inside every cell, whatever the numbers
  // say. No ordering of the two could have worked.
  //
  // So the two kinds are given different GROUND rather than different numbers:
  //
  //   A ROW BLOCK IS COLUMNS, EXCEPT AT ITS EDGES. Its cells tile it, half a
  //   column each; the block's own two slots are bands along its top and bottom,
  //   which is its padding — the strip that is visibly outside the row.
  //
  //   EVERY OTHER BLOCK IS ALL PLACES. Its top half means "above this block" and
  //   its bottom half "below it".
  //
  // AND THE EDGES ARE A HARD EDGE NOW, NOT A GENEROUS ONE (4.54 §1). 4.8.7 let
  // the two bands grow to a quarter of the block each so a hand could find them,
  // and a quarter of a tall group is 72px of "outside the row" lying over the
  // top and bottom of every column in it. A vault found what that costs: *"a
  // cell can not be dragged above a cell that is at the top, because the wrong
  // box highlights."* The first card in a column has its five places entirely
  // inside the band, and the paragraph above says why no z-index could get them
  // out — so nothing could ever be dropped above the top widget of a group.
  //
  // THE STYLESHEET SWAPS THE GROUND RATHER THAN THE NUMBERS, which is this
  // release's own rule turned around: the CELL is lifted over the bands while a
  // drag is in the air, and the bands are given the space OUTSIDE the block to
  // make up what they lost. See `.jbd-slot-edge` and `--ca-slot-reach`. Nothing
  // changes on this side, and the reason it is written down here is that the two
  // halves of the fix are in different files and neither reads as deliberate
  // alone.
  // THE OPEN PAGE, NOT THE FIRST ONE (4.34 §6). This was
  // `querySelector(.${ROW_CLASS})`, which took the only row there was — and a
  // group with pages has one row per page, all of them in the document at once.
  // Unqualified, every gesture on a two-page group would have acted on page 1
  // whatever the reader could see: the slots would open over cells that are not
  // on screen, and a divider drag would resize a row nobody is looking at.
  //
  // `:not(.is-closed)` is exact for both shapes, because a group with one page
  // never carries the class.
  const row = container.querySelector<HTMLElement>(
    `.${ROW_CLASS}:not(.${ROW_CLOSED_CLASS})`
  );
  const cellsIn = (host: HTMLElement | null): HTMLElement[] =>
    Array.from(host?.children ?? []).filter(
      (c): c is HTMLElement =>
        c instanceof HTMLElement && c.hasClass(ROW_CELL_CLASS)
    );
  const cells = cellsIn(row);
  // ── AND EVERY PAGE'S CELLS, NOT ONLY THE OPEN PAGE'S (5.16) ─────────
  //
  // A group with pages has one row per page, all of them in the document at
  // once, and swapping pages is a class toggle — `paint` in row.ts flips
  // `is-closed` and nothing re-renders. So the gesture, hung once against the
  // row that happened to be open, was hung against that row FOREVER: a reader
  // who pressed [2] got a page of cards with no grips and no landing places,
  // and a head that opened over nothing to pick up. Reported from a vault as
  // one of six states — the page-2 card with its name and no dots.
  //
  // THE RESIZE STAYS ON THE OPEN PAGE, and that is not an oversight: a divider
  // drag writes column widths into ONE page's slice of the body (`widenCells`
  // takes the ordinal), the handles are pointer targets rather than drop
  // targets, and 4.34 §6 wired them to the open row for exactly that reason.
  // What is safe to hang everywhere is what is addressed by a STAMP — a grip
  // reads its child's own line, a slot reads its cell's — plus this page's own
  // end, which is why `pageSlice` is asked per row rather than once.
  //
  // A HIDDEN PAGE'S SLOTS COST NOTHING. `is-closed` takes the row out of the
  // layout, so nothing in it can be hovered, dragged from, or dropped on until
  // the reader opens it — at which point it behaves like the page they were
  // already on, which is the whole of what was missing.
  const pageRows = Array.from(
    container.querySelectorAll<HTMLElement>(`.${ROW_CLASS}`)
    // NOT A NESTED GROUP'S ROWS. `querySelectorAll` reaches through the cells
    // into whatever a widget drew, and a fence inside a cell owns its own
    // gesture — the same scoping `:scope >` states for the header bar below,
    // asked of a shape that has a wrapper between it and this block.
  ).filter((r) => r.closest(`.${ROW_CELL_CLASS}`) === null);
  const allCells = pageRows.flatMap(cellsIn);
  // WHICH PAGE THAT IS, for the writers that speak in body lines. `widenCells`
  // and `cellWidthsIn` take a page ordinal and do their arithmetic inside that
  // page's slice; handing them the default 0 would write tab 1's widths from
  // tab 2's divider.
  //
  // READ OFF THE ROW RATHER THAN COUNTED. `TabbedPlan` has the argument: a page
  // whose directives drew nothing has a row in the file and none on the screen,
  // so the nth row on screen is not the nth page in the note. The stamp is the
  // ordinal both sides agree on.
  const openPage = Number(row?.getAttribute(ROW_PAGE_ATTR) ?? 0) || 0;

  // WHICH OF THIS BLOCK'S CHILDREN ARE WIDGETS A READER MAY REORDER, asked here
  // rather than at the loop that hangs their grips, because the answer decides
  // the shape of the block's OWN two slots as well — see `edge`, below.
  //
  // The two refusals it encodes are the loop's, and each is stated where it is
  // used: not a row, and not a section. 5.14; the lift to here is 5.15. A third
  // stood beside them until 5.16 — not the widget bar — and it is gone with the
  // rest of that withholding: a bar carries its run now, so it is a widget in
  // this list like any other.
  const loose =
    row || section
      ? []
      : Array.from(container.children).filter(
          (c): c is HTMLElement =>
            c instanceof HTMLElement && lineOf(c) !== null
        );
  // WHETHER THIS FENCE HANDED ITS PLACES OUT TO ITS WIDGETS. One widget keeps
  // everything on the block — its grip, and its two halves — because the block
  // IS that widget. More than one, and the block is a stack a reader arranges,
  // which is a different surface with different targets.
  const perWidget = loose.length > 1;

  // ABOVE AND BELOW: this block's place in the note, which is what a block drag
  // means and what a widget leaving a row is asking for. 4.8.5 restored it to
  // every block after a vault found the alternative — *"the 02 diary dashboard's
  // sections can only be moved from the section editor and the grips are
  // missing"* — which is 4.8.1's removal read back from a page with no row on
  // it: nothing there could be picked up, and nothing could be put anywhere.
  // AND A PLACE A BLOCK IS ALREADY IN IS NOT A PLACE IT CAN GO (4.8.7).
  //
  // THE BUG THIS FIXES, REPORTED FROM A VAULT: *"the Trends section on the
  // homepage doesn't seem to like to be moved (only the homepage instance,
  // works correctly in other dashboards)."* Trends is the LAST block of the
  // homepage and the only one under it is Journals — so the nearest target when
  // dragging it upward is the Journals block, and the half of it a reader
  // reaches first, coming from below, is the lower one. "Below Journals" is
  // where Trends already is. `moveCell` correctly returned null, nothing was
  // written, and the block appeared to refuse to move.
  //
  // NOTHING WAS WRONG WITH THE ARITHMETIC, which is why this took a while to
  // see: the fault is that a slot which cannot do anything still lit up and
  // still took the drop. `empty.ts`'s rule — nothing dead is drawn — applied to
  // a landing place.
  //
  // ONLY FOR A WHOLE BLOCK. A WIDGET dropped below the block it is in has left
  // its row, which is a real change and the reason `whole` is on the payload.
  const noop = (at: number | null): boolean =>
    at !== null &&
    inFlight !== null &&
    inFlight.whole &&
    (inFlight.block === at || inFlight.block === at - 1);

  // AND IT FAILS OPEN. A slot that cannot work out its own index declines
  // NOTHING — the drop then asks again properly and `moveCell` refuses if it
  // must. A refusal computed from a missing answer is how one uncertain block
  // turns into a page where nothing can be dropped at all, which is the failure
  // this whole item exists to end.
  // ── AND A STACK'S BANDS ARE ITS EDGES TOO (5.15) ──────────────────────
  //
  // WHAT A READER SAW, mid-drag on a diary entry: *"the drag-section editing
  // system could use some refining. It seems to let the user place sections at
  // odd positions."* Screenshotted three times, and each shot says the same
  // thing — the pointer is over the middle of a field and what lights up is the
  // accent bar on the block's own top or bottom edge, "outside this fence".
  //
  // THIS IS 4.54 §1 ARRIVING A SECOND TIME. The essay under `.ca-jbd-slot-edge`
  // tells it about a row: the block's two halves TILE it, so a card's own five
  // places are inside them and the band takes every drop the reader meant for a
  // card. The answer there was to swap the ground rather than the numbers —
  // bands to the block's edges, columns lifted over what is left.
  //
  // A BARE FENCE BECAME THE SAME SHAPE IN 5.14 AND THE BANDS DID NOT MOVE. Its
  // widgets got two places each; the block kept two halves over the whole of
  // it. A field's own targets are strips (`ca-jbd-slot-loose` widens them to
  // the whole card, which is the other half of this fix) and everything the
  // strips do not cover is still the band — so the commonest aim on the page,
  // the middle of a card, means "take this field out of the fence".
  //
  // SO THE CONDITION IS THE SAME QUESTION IN BOTH SHAPES: does anything inside
  // this block draw places of its own? A row's cells do and a stack's widgets
  // now do, and in both the block's own two mean the one thing nothing inside
  // it can say — beside all of it. That is an edge, and it is where they go.
  //
  // AND THE GESTURE IS NOT WITHDRAWN, only moved to where it means something. A
  // field can still leave the fence; it is asked for at the strip above the
  // block or the one below it, plus `--ca-slot-reach` outside, which is exactly
  // the aim a reader takes to say "out here" rather than "in there".
  const edge = row || perWidget ? " ca-jbd-slot-edge" : "";
  slot(container, `ca-jbd-slot-above${edge}`, BLOCK_TYPE, (p) => p.whole, () => {
    const i = indexNow();
    return i === null ? null : { kind: "block", at: i };
  }, () => !noop(indexInDrag()));
  slot(container, `ca-jbd-slot-below${edge}`, BLOCK_TYPE, (p) => p.whole, () => {
    const i = indexNow();
    return i === null ? null : { kind: "block", at: i + 1 };
  }, () => {
    const i = indexInDrag();
    return !noop(i === null ? null : i + 1);
  });

  // ── MAKING A GROUP ON THE PAGE (4.9 §4) ───────────────────────────────
  //
  // A BLOCK THAT IS NOT A GROUP GAINS TWO SIDE QUARTERS, and its above/below
  // halves give up their outer quarters to make room — four zones, which is the
  // same reading outward the five on a widget in a group already use: the sides
  // are beside this block, the middle is above and below it.
  //
  // ONLY WHERE THERE IS ROOM TO SPLIT, asked of the block rather than guessed
  // at: `@container (min-width: 660px)` in the stylesheet, which is two cells at
  // the 320px floor plus the gap. A quarter offering a group that would wrap the
  // instant it was made is a control that cannot do its job, which `empty.ts`
  // says is not drawn.
  //
  // IT NEEDS `CELL_TYPE` AND READS `p.cell`, which is the whole of what keeps it
  // honest. `widgetRun` is the rule that decides that range: one widget and the
  // bar over it, with modifiers left behind, because a `frame:` line describes
  // the block being emptied rather than the widget leaving it. A block holding
  // two widgets offers no cell range, sets no `CELL_TYPE`, and its drag never
  // lights these up — declined before it lights rather than refused on drop,
  // which is 4.8.7's rule. The section editor's **Add to group** is where that
  // block's reader is sent, and it is the surface that can ask the question a
  // gesture cannot: which of the two widgets goes in which column.
  //
  // AND A BLOCK IS NOT ITS OWN OTHER COLUMN. A single-widget block offers a cell
  // range and so lights up its OWN quarters; `inFlight` is what says no.
  //
  // AND A SECTION IS NOT A COLUMN EITHER (4.12 §A). `row` is geometry — this
  // block already has columns, so its quarters would name a boundary the reader
  // did not point at — and `section` is the file: this block titles itself, so a
  // widget landing beside it would put its bar below the group. Two conditions,
  // one omission, and the reader meets it as a quarter that never lights.
  if (!row && !section) {
    const isSelf = (): boolean => {
      const i = indexInDrag();
      return i !== null && inFlight !== null && inFlight.block === i;
    };
    const beside = (side: "left" | "right") => (): CellTarget | null => {
      const i = indexNow();
      return i === null ? null : { kind: "group", block: i, side };
    };
    slot(container, "ca-jbd-slot-side ca-jbd-slot-side-left", CELL_TYPE, (p) => p.cell, beside("left"), () => !isSelf());
    slot(container, "ca-jbd-slot-side ca-jbd-slot-side-right", CELL_TYPE, (p) => p.cell, beside("right"), () => !isSelf());
  }

  // WHERE EACH COLUMN STARTS, in the file's own numbering. A cell's first
  // stamped descendant is the widget that opens it, and the stamp is the line
  // that drew that widget — so a slot names a place in the FILE rather than a
  // position in the row.
  const opensOf = (of: readonly HTMLElement[]): (number | null)[] =>
    of.map((cell) => lineOf(cell.querySelector(`[${LINE_ATTR}]`)));

  // FIVE PLACES ON EVERY WIDGET IN THE ROW, and they are the grammar 4.4 §1
  // already had, drawn (4.8.6). A cell has been able to hold more than one
  // widget since that release, and until now every arrival opened a COLUMN —
  // which is *"only possible in a new column right now, which is half-baked"*.
  //
  // The five read outward from the widget: its edges are the row, its middle is
  // the widget itself.
  //
  //   LEFT AND RIGHT EDGES — a column of its own, before or after this cell.
  //   TOP AND BOTTOM — the same column as this widget, above it or below it.
  //   THE MIDDLE — trade places with this widget.
  //
  // A SWAP IS THE MIDDLE BECAUSE IT NEEDS NO EDGE. It is the one drop that is
  // about the widget rather than about a place beside it, so it takes the part
  // of the widget that is not next to anything — and it is symmetric, which
  // means a reader who lands on it by accident undoes it by repeating it.
  // WHETHER A COLUMN OF ITS OWN IS A PLACE THIS DRAG CAN GO. 4.52.1.
  //
  // A ROW DRAWS TWO COLUMNS (`MAX_COLUMNS`), so the two slots that OPEN one —
  // the left and right edges of every card in the group — have nothing to offer
  // once there are two. `empty.ts`'s rule applied to a landing place, which is
  // the same reading 4.8.7 made of the block slots one screen up: a slot that
  // lights up and then writes something the reader did not ask for is the editor
  // lying about what it will do.
  //
  // AND THE READER KEEPS EVERY REARRANGEMENT. A widget alone in a column of THIS
  // row still lights them, because its column closes as the new one opens — so
  // moving the right-hand widget to the left of the left-hand one is still a
  // drag rather than a trip to the section editor. The three slots that do not
  // open a column — above, below, and the swap in the middle — are untouched and
  // are how a third widget joins a full row.
  const hasRoomIn = (of: readonly HTMLElement[]) => (): boolean =>
    of.length < MAX_COLUMNS ||
    (inFlight !== null && inFlight.frees && inFlight.block === indexNow());

  for (const pageRow of pageRows) {
    const pageCells = cellsIn(pageRow);
    // ITS OWN ORDINAL, off the row rather than counted, for `pageSlice`'s
    // argument — `TabbedPlan`'s rule: a page whose directives drew nothing has a
    // row in the file and none on the screen.
    const page = Number(pageRow.getAttribute(ROW_PAGE_ATTR) ?? 0) || 0;
    wireCellSlots(
      pageCells,
      opensOf(pageCells),
      slot,
      indexNow,
      hasRoomIn(pageCells),
      () => {
        const body = bodyNow();
        if (!body) return null;
        // A GROUP WITH NO `tab` LINE HAS ONE SLICE COVERING THE WHOLE BODY, so
        // this is the end of the body for every group that has never been
        // paged — which is what it was before pages existed.
        return pageSlice(body, page)?.to ?? body.length;
      }
    );
  }

  // ── WHAT CAN BE PICKED UP ─────────────────────────────────────────

  const source = makeSource(container, ctx.sourcePath, indexNow);

  // EVERY WIDGET IN A CELL, whether or not it wears a card. The children of a
  // cell are what `layOutRow` put there — a card for a widget that could be
  // named, the widget itself for one that draws its own band — and both are
  // stamped with the line that drew them, which is the only thing a drag needs.
  //
  // ITS TWO RANGES ARE THE SAME ONE LINE: a widget leaving a row for a block of
  // its own takes exactly what it took to another column.
  for (const cell of allCells) {
    for (const child of Array.from(cell.children)) {
      if (!(child instanceof HTMLElement)) continue;
      const line = lineOf(child);
      if (line === null) continue;
      // AND A WIDGET BAR CARRIES ITS WHOLE RUN — see `markSpan`. It is the one
      // child that is not one directive, and until 5.16 it was the one child
      // with no grip at all, which a vault reported as a head that could not be
      // picked up: *"these widgets headers are missing the drag icons."*
      const span = spanOf(child);
      // AND A STATED HEIGHT TRAVELS WITH THE WIDGET IT SIZES (4.22 §5.1, §5.2).
      // A `height:` line is positional, so a range of one line would leave it
      // behind sizing whatever moved up into its place — a layout gesture
      // silently resizing an unrelated widget, which is the class of failure 4.8
      // spent eight patches on. `runWithHeight` is the one answer, asked of the
      // body at the moment of the drag rather than closed over, for the reason
      // this comment block already gives about every other range here.
      //
      // ITS TWO RANGES STAY THE SAME RANGE. A widget dragged out to a block of
      // its own still takes what it took to another column — and there its
      // height cannot mean anything, which `parseHeights` says out loud rather
      // than leaving a line that quietly does nothing.
      source(child, "Drag to move this widget", false, () => {
        const at = runOf(bodyNow(), line, span);
        return { whole: at, cell: at };
      });
    }
  }

  // ── AND EVERY WIDGET IN A BARE FENCE (5.14) ───────────────────────────
  //
  // WHAT A READER SAW. A diary entry composes three fences — the banner, the
  // tracker grid, and one SHARED fence holding Focus, Highlights, Challenges,
  // Notes, Attachments, Tasks and Captured. Those seven now draw as seven
  // cards, so the page reads as seven sections; the block's single grip sits on
  // the top edge of the block, which is the top edge of the FIRST card, and the
  // other six have nothing. Reported as *"only trackers and today's focus have
  // the grabbers"*, which is exactly right and describes the grip lying about
  // its own scope as much as it describes six missing ones.
  //
  // THE GRAMMAR IS THE ROW'S, MINUS THE COLUMNS. A widget in a cell has had
  // five places since 4.8.6 — a column before it, a column after it, above it,
  // below it, and a swap. Two of those are about COLUMNS and a bare fence has
  // none; the swap is a third gesture on a surface that is asking for one. So a
  // loose widget gets the two that stack, `moveCell`'s `stack` target with the
  // block index on both ends, which is a reorder inside the fence and is the
  // one thing the reader asked for.
  //
  // ITS TWO RANGES ARE THE SAME RUN, verbatim from the cell loop above and for
  // the same reason: a widget dragged to a block of its own takes exactly what
  // it took past its neighbour. `runWithHeight` so a `height:` line travels
  // with the widget it sizes rather than staying behind to size whatever moves
  // up into its place.
  //
  // ── AND THE THREE CONDITIONS, EACH OF WHICH IS A REFUSAL ──────────────
  //
  // NOT A ROW. Its cells already draw all five places per widget, and the essay
  // above says why two kinds of slot may not overlap: a cell is a
  // `container-type` and therefore a stacking context, so these would be sealed
  // inside it and lose every drop to the cell's own.
  //
  // NOT A SECTION. `section` is the dispatcher's answer to "does this fence
  // draw its own chrome" — a `header:` line or `frame: section`. Such a fence
  // is a SECTION and its lines are that section's body: a `header:2:` group
  // head over a table, a bar over the widgets it names. Reordering those
  // against each other by dragging produces a table above the head that names
  // it, which is a question the Section Editor asks properly and a gesture
  // cannot. It is also what keeps the bar out of this loop — the bar is a
  // stamped child too, and a fence's own title is not one of its widgets.
  //
  // MORE THAN ONE. A fence holding a single widget already has a grip that
  // means that widget, on the block, and there is nowhere inside it to reorder
  // to. Drawing a second one over the first is 4.8.6's duplicate.
  //
  // AND THE WIDGET BAR IS ONE OF THEM AS OF 5.16, WITH A RANGE RATHER THAN A
  // LINE. It is the one child that is not one directive — see `markSpan` — and
  // 5.15 kept it out of this loop rather than teach the loop to ask. `runOf` is
  // that question asked once, so the bar reorders inside a bare fence the way
  // every other widget in it does and lands with its whole run.
  if (perWidget) {
    for (const child of loose) {
      const line = lineOf(child);
      if (line === null) continue;
      const span = spanOf(child);
      const ends = span ?? line;
      const at = (): { from: number; to: number } =>
        runOf(bodyNow(), line, span);
      source(child, "Drag to move this widget", false, () => {
        const run = at();
        return { whole: run, cell: run };
      });
      // `ca-jbd-slot-loose` IS THE HALF OF THE CARD EACH OF THESE TAKES (5.15).
      //
      // A widget in a CELL has five places and its middle is the fifth — a
      // swap — so its top and bottom strips are a fifth of the height each and
      // the middle is the largest target. A widget in a STACK has two, and a
      // stack is not a surface a swap makes sense on, so the middle belongs to
      // nobody. It went to the block's band, which is the bug above.
      //
      // THE TWO TILE THE CARD INSTEAD: above this widget, below this widget,
      // half each, full width. There is then nowhere on a field that means
      // something other than what a reader pointing at that field means, which
      // is the same rule the row's four zones are drawn to.
      slot(child, "ca-jbd-slot-over ca-jbd-slot-loose", CELL_TYPE, (p) => p.cell, () => {
        const i = indexNow();
        return i === null
          ? null
          : { kind: "stack", block: i, at: line, after: false };
      });
      slot(child, "ca-jbd-slot-under ca-jbd-slot-loose", CELL_TYPE, (p) => p.cell, () => {
        const i = indexNow();
        return i === null
          ? null
          : { kind: "stack", block: i, at: ends, after: true };
      });
    }
  }

  // AND THE BLOCK ITSELF, UNLESS ITS WIDGETS ARE HOLDING ITS GRIPS. 4.8.5, and
  // the exception is 5.15.
  //
  // Its whole body when it lands as a block — modifiers, delimiters and all,
  // which is what makes this a block move rather than a re-render. Only the
  // widget and the bar over it when it lands in a column, because a `frame:` or
  // `row` line describes the block being emptied rather than the widget leaving
  // it; `widgetRun` is that rule, and it says null for a block holding two
  // widgets, which is what withholds `CELL_TYPE` and with it every column slot
  // on the page.
  // AND ITS GRIP LIVES ON THE GROUP'S HEAD, WHERE THERE IS ONE (5.14; 4.9 §2.2
  // for the half of this that has not changed).
  //
  // WHAT THIS REPLACES, AND WHY THAT IS A DELETION RATHER THAN A MOVE. Every
  // grip is centred over the top edge of the thing it drags, which on a row of
  // three put the BLOCK's grip and the MIDDLE widget's at the same two
  // coordinates — two sets of dots on top of each other, read from a vault as
  // one duplicated. 4.8.6 shoved the block's to the left with `jbd-aside`: a
  // class whose entire content was "get out of the way of grips I cannot see".
  //
  // The strip is not a better place to hide it. It is the group's OWN edge — a
  // band on the box that belongs to the box rather than to anything in it — so
  // the collision cannot happen from there, and `jbd-aside` goes with the
  // problem it was working around rather than being carried forward as a rule
  // nobody can re-derive. A control that has somewhere of its own to be does not
  // need an exception.
  //
  // AND IN 5.14 THAT EDGE IS THE TOP ONE. 4.9 put it at the bottom because the
  // group had no top edge to put it on — every card drew its own head there and
  // a strip across them would have been a title above a row of titles. The
  // group has a head now (row.ts), so the grip goes where a grip goes: centred
  // over the top edge of the thing it drags, which is what every other grip on
  // the page does and what `jbd-aside` was an exception to.
  //
  // THE COLLISION STILL DOES NOT COME BACK, and the reason is that the head is
  // a STRIP ABOVE the cards rather than a line across them. A card's own grip
  // hangs 4px inside its top edge; the block's now hangs 4px inside the head's,
  // which is a band's height further up. They can share an x and cannot share a
  // place.
  //
  // AND ON THE SECTION BAR WHERE THE BLOCK HAS ONE (5.10). A bar is the block's
  // own top edge in exactly the sense the foot is the group's, so a grip there
  // collides with nothing inside the section and does not float above the card.
  //
  // ONE LOOKUP, INSIDE `container`, and the second one this replaced is worth
  // naming: it asked `container.parentElement` first, because for three
  // releases the bar was appended to the BLOCK instead of into `container` and
  // could not be found from here. That shape is gone — see `chart-grid.ts` —
  // and a handle that can anchor onto a sibling of the block it drags is a
  // control that outlives its own subject.
  //
  // AND THE BOX IS WHAT DIMS, not the strip and not the bar: see `source`'s
  // `dim`. Dimming a title while its body stays lit says the title is moving.
  //
  // ── AND WHERE THERE IS NO EDGE OF ITS OWN, THERE IS NO GRIP (5.15) ────
  //
  // WHAT A READER SAW, on the release that gave a bare fence's widgets grips of
  // their own: *"there seems to be a dragger for the entire group of sections
  // on diary entries? it is not necessary."* Exactly so, and the two halves of
  // that sentence are two different faults.
  //
  // IT IS NOT NECESSARY. An entry's shared fence IS the entry — Focus through
  // Captured, with only the banner (immovable, `fixed`) and the tracker grid
  // around it. The move this grip offers is "put all seven above the trackers",
  // which is not a thing anybody has wanted; the move readers do want is one
  // field past another, and that is the seven grips the loop above just hung.
  //
  // AND IT COULD NOT SAY THAT IT WAS THE ENTIRE GROUP. This is the deeper half.
  // Every essay on this page turns on a grip being centred over the top edge of
  // THE THING IT DRAGS, which is how a reader knows what is in their hand. A
  // group has a head to say it with and a section has its bar; a bare fence has
  // neither, so `container` was the fallback — and a bare fence's top edge is
  // the first widget's top edge. 5.14 read that as a collision and shoved the
  // dots aside with `has-widget-grips`, which is `jbd-aside` under a new name:
  // a grip parked somewhere it does not mean anything, next to a card it does
  // not drag. The obituary above says a control that has somewhere of its own
  // to be does not need an exception. The converse is this line: a control with
  // nowhere of its own to be, whose subject is already reachable a better way,
  // is not moved — it is withheld.
  //
  // ONLY WHERE THE WIDGETS TOOK OVER, which is why this reads `perWidget` and
  // not `!head && !bar`. A fence holding ONE widget also falls back to
  // `container`, and there the fallback is honest: the block IS that widget,
  // its top edge is that widget's, and nothing else on it has a grip. Taking
  // that away is 4.8.1's removal again — *"the grips are missing"* — and it is
  // the whole reason 4.8.5 put this back for every block.
  //
  // THE BLOCK IS STILL A DESTINATION. Its `above` and `below` slots are drawn
  // well before this line and accept `BLOCK_TYPE` from anywhere; what has gone
  // is this block's own ability to be picked up as one, not the page's ability
  // to put something next to it.
  const box = container.querySelector<HTMLElement>(`.${GROUP_CLASS}`);
  const head = box?.querySelector<HTMLElement>(`.${GROUP_HEAD_CLASS}`) ?? null;
  const bar = container.querySelector<HTMLElement>(
    ":scope > .ca-journal-header-bar"
  );
  if (!perWidget) {
    source(
      head ?? bar ?? container,
      head ? "Drag to move this group" : "Drag to move this block",
      true,
      () => {
        const body = bodyNow();
        if (!body?.length) return null;
        return {
          whole: { from: 0, to: body.length },
          cell: widgetRun(body) ?? undefined,
        };
      },
      box ?? container
    );
  }

  // ── SETTING A COLUMN'S WIDTH (4.9 §3) ─────────────────────────────────
  //
  // WHY THIS IS NOT THE COLLISION 4.8 §3 FEARED, which deferred the whole
  // gesture on the grounds that the divider a reader would drag is the strip the
  // drop slots already use. Two reasons, and both are facts rather than
  // judgements:
  //
  //   A SLOT IS `display: none` UNTIL `is-slotting`, and only a drag already in
  //   the air adds that class. At rest — which is when a reader reaches for a
  //   divider — there is nothing in the gap to collide with.
  //
  //   A POINTER DRAG AND A `dragstart` ARE DIFFERENT EVENT FAMILIES. Pointer
  //   events do not fire during a native drag and a native drag is not started
  //   by a `pointerdown`, so the two gestures cannot both be in progress.
  //
  // Belt and braces, in the stylesheet: `.is-slotting .journal-group-divider`
  // takes `pointer-events: none`, so even a divider under a drag is inert.
  if (row) {
    wireResizeHandles(
      plugin,
      ctx,
      file,
      container,
      row,
      cells,
      openPage,
      indexNow,
      bodyNow
    );
  }
}
