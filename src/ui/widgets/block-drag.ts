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

import type AlmanacPlugin from "../../main";
import { blockIndexAt } from "../../core/block-move";
import { splitGlyph } from "../section-frame";
import { moveCell, widgetRun } from "../../core/cell-move";
import type { CellSource, CellTarget } from "../../core/cell-move";
import { cellWidthsIn, snapRatio, widenCells } from "../../core/cell-width";
import {
  DIVIDER_INDEX_ATTR,
  GROUP_CLASS,
  GROUP_DIVIDER_CLASS,
  GROUP_FOOT_CLASS,
  ROW_CELL_CLASS,
  ROW_CLASS,
} from "./row";
import { boundsOf } from "../header-title";
import { getFile } from "../../core/util";

// The one drag type this file speaks. There were two until 4.8.1, the other
// being a whole block; see the header for why that one went.
const CELL_TYPE = "text/almanac-cell";

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
const BLOCK_TYPE = "text/almanac-block";

export const HEAD_CLASS = "journal-block-head";
export const CARD_CLASS = "journal-widget-card";

// Which line of the fence body drew this element, and how many lines that body
// has. Written by `stampLines`, read by the gesture. 4.8 §1.4.
const GRIP_CLASS = "jbd-handle";

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
let inFlight: { block: number; whole: boolean } | null = null;

// Which drag this is, so a block can cache what it worked out for the last one.
// Bumped once per `dragstart`; see `indexInDrag`.
let dragSeq = 0;
const LINE_ATTR = "data-am-line";
const BODY_ATTR = "data-am-body";

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
// `.journal-header-glyph` already states and the reason this shares its shape.
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
// add a level to a subtree that `.journal-overview-card > .journal-live-widget`
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
  // THE STAMP COMES WITH IT. The card is what a reader grabs, so the card is
  // what has to know which line it is — and it knows because the widget it was
  // built around was told first. Re-deriving it here would mean counting
  // children a second time, against a list that is halfway through being
  // rewritten.
  const line = widget.getAttribute(LINE_ATTR);
  if (line !== null) card.setAttribute(LINE_ATTR, line);
  card.appendChild(widget);
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
  host.addClass("jbd-host");
  return host.createDiv({
    cls: `${GRIP_CLASS} ${cls}`.trim(),
    attr: { "aria-label": label, draggable: "true" },
  });
}

// The line a stamped element came from, or null on anything unstamped.
function lineOf(el: Element | null): number | null {
  const raw = el?.getAttribute(LINE_ATTR);
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
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
  "journal-sec",
  "journal-sec-fold",
  "journal-header-bar",
  // A widget's own.
  "journal-overview-banner",
  "jjs-hero",
  "journal-entry-header",
  "journal-study-header",
];

// Whether this element already announces itself, in which case a head of ours
// would be a second one.
//
// THE FIRST CHILD, NOT A SEARCH. A band deeper inside belongs to something
// further in — a cell's widget draws its own, and a block is not that widget —
// and what decides this is whether the TOP of this element is already a band.
function hasOwnBar(container: HTMLElement): boolean {
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
  plugin: AlmanacPlugin,
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
// (`--am-row-cell-min`, `--am-widget-gap`); a copy of either in TypeScript is a
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
  plugin: AlmanacPlugin,
  file: TFile,
  block: number,
  weights: readonly number[]
): Promise<void> {
  const text = await plugin.app.vault.read(file);
  const next = widenCells(text.split("\n"), block, weights);
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
  plugin: AlmanacPlugin,
  file: TFile,
  divider: HTMLElement,
  row: HTMLElement,
  cells: readonly HTMLElement[],
  n: number,
  noteNow: () => { block: number; lines: string[] } | null
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
    const start = cellWidthsIn(where.lines, where.block);
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
    const floorPx = pxToken(row, "--am-row-cell-min", 320);
    const gapPx = pxToken(row, "--am-widget-gap", 10);
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
      left.style.getPropertyValue("--am-cell-weight"),
      right.style.getPropertyValue("--am-cell-weight"),
    ];
    let live: [number, number] = [start[n - 1], start[n]];

    const restore = (): void => {
      const pairs: [HTMLElement, string][] = [
        [left, was[0]],
        [right, was[1]],
      ];
      for (const [el, value] of pairs) {
        if (value) el.style.setProperty("--am-cell-weight", value);
        else el.style.removeProperty("--am-cell-weight");
      }
    };

    // LIVE PREVIEW IS AN INLINE VARIABLE AND NOTHING ELSE. The stylesheet
    // already reads `var(--am-cell-weight, 1)` on both the grow and the basis
    // (4.4 §2), so the columns follow the pointer through the same declarations
    // the file will produce — what the reader sees during the drag is what the
    // note will render as, rather than a separate preview that can disagree.
    const show = (a: number, b: number): void => {
      live = [a, b];
      left.style.setProperty("--am-cell-weight", String(a));
      right.style.setProperty("--am-cell-weight", String(b));
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
      void applyWidths(plugin, file, where.block, next);
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
  plugin: AlmanacPlugin,
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
    // padding — the shape `.journal-entry-header` and `.journal-study-header`
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

  // One landing place. `where` is asked at the drop rather than built into the
  // slot, because a block's index and its body length are both facts about a
  // file that every drop rewrites — `indexNow`'s lesson, and the same bug if it
  // is ignored here.
  // `needs` is the shape this slot takes — see `BLOCK_TYPE`. `range` reads the
  // matching half of the payload, so the slot that accepted the drag is the one
  // that decides which lines move.
  const slot = (
    host: HTMLElement,
    cls: string,
    needs: string,
    range: (src: CellPayload) => { from: number; to: number } | undefined,
    where: () => CellTarget | null,
    // Whether this slot would do anything for the drag in the air. Default is
    // "yes"; only the two block slots ask, and only about a whole block.
    live: () => boolean = () => true
  ): void => {
    const el = host.createDiv({ cls: `jbd-slot ${cls}` });
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
      const src = readPayload(evt, ctx.sourcePath);
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
  //   column each; the block's own two slots are 16px bands along its top and
  //   bottom, which is its padding — the strip that is visibly outside the row.
  //
  //   EVERY OTHER BLOCK IS ALL PLACES. Its top half means "above this block" and
  //   its bottom half "below it".
  const row = container.querySelector<HTMLElement>(`.${ROW_CLASS}`);
  const cells = Array.from(row?.children ?? []).filter(
    (c): c is HTMLElement =>
      c instanceof HTMLElement && c.hasClass(ROW_CELL_CLASS)
  );

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
  const edge = row ? " jbd-slot-edge" : "";
  slot(container, `jbd-slot-above${edge}`, BLOCK_TYPE, (p) => p.whole, () => {
    const i = indexNow();
    return i === null ? null : { kind: "block", at: i };
  }, () => !noop(indexInDrag()));
  slot(container, `jbd-slot-below${edge}`, BLOCK_TYPE, (p) => p.whole, () => {
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
    slot(container, "jbd-slot-side jbd-slot-side-left", CELL_TYPE, (p) => p.cell, beside("left"), () => !isSelf());
    slot(container, "jbd-slot-side jbd-slot-side-right", CELL_TYPE, (p) => p.cell, beside("right"), () => !isSelf());
  }

  // WHERE EACH COLUMN STARTS, in the file's own numbering. A cell's first
  // stamped descendant is the widget that opens it, and the stamp is the line
  // that drew that widget — so a slot names a place in the FILE rather than a
  // position in the row.
  const opens = cells.map((cell) => lineOf(cell.querySelector(`[${LINE_ATTR}]`)));

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
      // PAST THE LAST LINE, read from the file rather than from a stamp: the end
      // of the body is the one position no child can carry, and `moveCell`
      // clamps anything past it anyway.
      const body = bodyNow();
      return body ? { kind: "cell", block: i, at: body.length } : null;
    };

    for (const child of Array.from(cell.children)) {
      if (!(child instanceof HTMLElement)) continue;
      const line = lineOf(child);
      if (line === null) continue;

      if (before !== null) {
        slot(child, "jbd-slot-before", CELL_TYPE, (p) => p.cell, () => {
          const i = indexNow();
          return i === null ? null : { kind: "cell", block: i, at: before };
        });
      }
      slot(child, "jbd-slot-after", CELL_TYPE, (p) => p.cell, after);
      slot(child, "jbd-slot-over", CELL_TYPE, (p) => p.cell, () => {
        const i = indexNow();
        return i === null ? null : { kind: "stack", block: i, at: line, after: false };
      });
      slot(child, "jbd-slot-under", CELL_TYPE, (p) => p.cell, () => {
        const i = indexNow();
        return i === null ? null : { kind: "stack", block: i, at: line, after: true };
      });
      slot(child, "jbd-slot-swap", CELL_TYPE, (p) => p.cell, () => {
        const i = indexNow();
        return i === null ? null : { kind: "swap", block: i, at: line };
      });
    }
  });

  // ── WHAT CAN BE PICKED UP ─────────────────────────────────────────

  // One source. The ranges are asked at the drag rather than closed over,
  // because a block's body is a fact about a file every drop rewrites.
  const source = (
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
    grip.addEventListener("dragstart", (evt) => {
      const block = indexNow();
      const at = ranges();
      if (block === null || !at) {
        evt.preventDefault();
        return;
      }
      const payload = JSON.stringify({ block, path: ctx.sourcePath, ...at });
      // ONE TYPE PER SHAPE THIS DRAG MAY TAKE. A slot checks for its own and
      // declines everything else, during `dragover`, before the reader has
      // committed to anything. See `BLOCK_TYPE`.
      evt.dataTransfer?.setData(BLOCK_TYPE, payload);
      if (at.cell) evt.dataTransfer?.setData(CELL_TYPE, payload);
      evt.dataTransfer?.setData("text/plain", "");
      dragSeq++;
      inFlight = { block, whole };
      dim.addClass("is-dragging");
    });
    grip.addEventListener("dragend", () => {
      inFlight = null;
      dim.removeClass("is-dragging");
      container.removeClass("is-slotting");
    });
  };

  // EVERY WIDGET IN A CELL, whether or not it wears a card. The children of a
  // cell are what `layOutRow` put there — a card for a widget that could be
  // named, the widget itself for one that draws its own band — and both are
  // stamped with the line that drew them, which is the only thing a drag needs.
  //
  // ITS TWO RANGES ARE THE SAME ONE LINE: a widget leaving a row for a block of
  // its own takes exactly what it took to another column.
  for (const cell of cells) {
    for (const child of Array.from(cell.children)) {
      if (!(child instanceof HTMLElement)) continue;
      const line = lineOf(child);
      if (line === null) continue;
      const at = { from: line, to: line + 1 };
      source(child, "Drag to move this widget", false, () => ({
        whole: at,
        cell: at,
      }));
    }
  }

  // AND THE BLOCK ITSELF, ALWAYS. 4.8.5.
  //
  // Its whole body when it lands as a block — modifiers, delimiters and all,
  // which is what makes this a block move rather than a re-render. Only the
  // widget and the bar over it when it lands in a column, because a `frame:` or
  // `row` line describes the block being emptied rather than the widget leaving
  // it; `widgetRun` is that rule, and it says null for a block holding two
  // widgets, which is what withholds `CELL_TYPE` and with it every column slot
  // on the page.
  // AND ITS GRIP LIVES IN THE GROUP'S FOOT, WHERE THERE IS ONE (4.9 §2.2).
  //
  // WHAT THIS REPLACES, AND WHY THAT IS A DELETION RATHER THAN A MOVE. Every
  // grip is centred over the top edge of the thing it drags, which on a row of
  // three put the BLOCK's grip and the MIDDLE widget's at the same two
  // coordinates — two sets of dots on top of each other, read from a vault as
  // one duplicated. 4.8.6 shoved the block's to the left with `jbd-aside`: a
  // class whose entire content was "get out of the way of grips I cannot see".
  //
  // The foot is not a better place to hide it. It is the group's OWN edge — the
  // one strip on the box that belongs to the box rather than to anything in it
  // — so the collision cannot happen from there, and `jbd-aside` goes with the
  // problem it was working around rather than being carried forward as a rule
  // nobody can re-derive. A control that has somewhere of its own to be does not
  // need an exception.
  //
  // AND THE BOX IS WHAT DIMS, not the strip: see `source`'s `dim`.
  const box = container.querySelector<HTMLElement>(`.${GROUP_CLASS}`);
  const foot = box?.querySelector<HTMLElement>(`.${GROUP_FOOT_CLASS}`) ?? null;
  source(
    foot ?? container,
    foot ? "Drag to move this group" : "Drag to move this block",
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
      attachResize(plugin, file, divider, row, cells, n, noteNow);
    }
  }
}
