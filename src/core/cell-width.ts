// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Setting a column's width by dragging the edge between two of them. 4.9 §3.
//
// ── WHAT THIS IS, NEXT TO `cell-move.ts` ─────────────────────────────────
//
// That file moves a WIDGET between the columns of a group. This one moves no
// widget at all: it changes how wide the columns are, which is a number rather
// than a place. Both write `cell` lines and neither may touch a directive, so
// they read the same body and are kept apart by what they are allowed to say.
//
// `cell: 2` has worked since 4.4 §2 and has shipped unused in every build since
// 4.7.0, because the only way to ask for it was to type it. 4.8 §3 deferred the
// gesture on the grounds that the divider a reader would drag is the strip the
// drop slots already use — which turned out not to be true (block-drag.ts says
// why, at the divider), so this is the half that was waiting.
//
// ── TWO FUNCTIONS, AND BOTH ARE PURE ─────────────────────────────────────
//
// A resize is a pointer gesture, and a pointer gesture is the one thing this
// suite has no way to run: 4.8 spent eight patch rounds on wiring no test could
// reach (RESUME §3). So everything about it that CAN be decided without a DOM is
// decided here — where the pointer snaps to, and what that writes into the note
// — and what is left in block-drag.ts is coordinates.
//
// ── WHY THERE IS A CAP HERE WHEN THE GRAMMAR REFUSED ONE ─────────────────
//
// `cellWeightOf` puts no upper bound on a weight and states the reason: the
// width at which a cell's basis exceeds the pane and the row wraps instead is a
// fact about the PANE, and 4.3.1's lesson is that the grammar cannot know it —
// "a cap here could not describe a monitor".
//
// That argument is about the GRAMMAR and it still holds; `setCellWidths` below
// writes any weight it is handed. The cap lives in `snapRatio`, which is asked
// by a gesture that has the row in its hand and can measure it. A drag that
// snapped to 4:1 on a 1100px page would ask for 1610px of basis, the row would
// wrap, and the two cards would stack UNDER THE POINTER mid-drag — which is the
// "a gap opens under the pointer" failure the drop slots were made absolute to
// avoid. So the caller measures and passes `maxTotal`, and the reader is offered
// the ratios their window can actually hold. A weight too large for the pane
// still wraps; it is simply no longer something a drag can produce by accident.

import { CELL_KEYWORD, isCellLine, isRowLine, MAX_COLUMNS, splitDirective } from "./directive-grammar";
import { fencesOf } from "./block-move";
import { delimit, pageSlice, runsOf } from "./cell-move";

// The largest a group's shares may add up to.
//
// SIX, WHICH IS ELEVEN RATIOS. Every pair `(a, b)` with `a, b >= 1` and
// `a + b <= 6` gives one of eleven distinct proportions — 1:1, 1:2, 1:3, 2:3,
// 1:4, 1:5 and the five mirrors — and each of them is a number a person would
// have typed. Seven would add 1:6, 2:5 and 3:4, which land within a few pixels
// of their neighbours on any real page and would make the divider feel like it
// was sliding rather than snapping.
export const MAX_SHARES = 6;

// Floating-point slack, so two ratios that are the same distance from the
// pointer are treated as tied rather than being ordered by their last bit.
const EPSILON = 1e-9;

// The pair of shares closest to where the pointer is, out of the ones that fit.
//
// `fraction` is the LEFT cell's share of the two — the pointer's position along
// the pair of columns it divides, between 0 and 1.
//
// `maxTotal` is what the row can hold, in shares: see the header. The default is
// the whole set, which is what a test asks for and what a caller that cannot
// measure should get.
//
// SIMPLEST PAIR WINS A TIE, which is the property that makes 0.5 give exactly
// `[1, 1]` and not `[2, 2]` or `[3, 3]`. The loop runs in order of increasing
// total and only replaces on a STRICT improvement, so the first pair to express
// a proportion is the one kept — and the number that reaches the note is the one
// a reader would have written.
export function snapRatio(
  fraction: number,
  maxTotal: number = MAX_SHARES
): [number, number] {
  // A ROW WITH NO ROOM FOR TWO COLUMNS NEEDS NO CLAMP, because the loop below
  // starts at a total of two and simply does not run — and the answer it does
  // not overwrite is the even split this starts at. A `Math.max(2, …)` here
  // would be a second statement of that, which no test could tell from its
  // absence.
  const cap = Number.isFinite(maxTotal)
    ? Math.min(MAX_SHARES, Math.floor(maxTotal))
    : MAX_SHARES;
  // A pointer outside the pair is a pointer at its end. Nothing in the gesture
  // produces one — the drag is clamped to the row — but a fraction is arithmetic
  // and arithmetic arrives from callers that have not been written yet.
  const want = Number.isFinite(fraction)
    ? Math.min(1, Math.max(0, fraction))
    : 0.5;
  let best: [number, number] = [1, 1];
  let bestOff = Infinity;
  for (let total = 2; total <= cap; total++) {
    for (let a = 1; a < total; a++) {
      const off = Math.abs(a / total - want);
      if (off < bestOff - EPSILON) {
        bestOff = off;
        best = [a, total - a];
      }
    }
  }
  return best;
}

// The leading whitespace of a line, so a rewritten delimiter sits where the one
// it replaces sat. `splitDirective` trims the keyword, so a fence written with
// indented lines reads correctly and would be un-indented one line at a time by
// a writer that did not look.
const indentOf = (line: string): string => /^\s*/.exec(line)?.[0] ?? "";

// How a weight is spelled. A share of one is the plain delimiter — `cell: 1`
// and `cell` mean the same thing to `cellWeightOf`, and the shorter one is what
// every other writer in this project produces.
const spell = (indent: string, weight: number): string =>
  weight === 1 ? `${indent}${CELL_KEYWORD}` : `${indent}${CELL_KEYWORD}: ${weight}`;

// Which line opens each drawn column, and which delimiter opened it.
//
// THE SAME READING `cellPlan` MAKES, one level down: it walks a block's rendered
// children, this walks the body those children came from, and both drop a run
// with nothing in it. A `header:` bar is not a column (row.ts, `NOT_A_CELL`), so
// a delimiter followed by one is still looking for its cell.
//
// `opener` is -1 for a column no delimiter opened — the first one, which the
// `row` line opens, and every column of an undivided row.
//
// AND AN UNDIVIDED ROW IS ONE COLUMN PER WIDGET, which is a rule and not a
// shortcut. `cellPlan` states it from the DOM side in exactly those terms: a row
// of two directives meant two columns before 4.4 existed, so the walk below —
// which would find ONE column holding both — is not what the absence of
// delimiters means. Reading it any other way would tell the gesture that a
// three-widget row has one column, and the resize would refuse every row nobody
// had divided by hand.
function columnsOf(
  body: readonly string[]
): { opener: number; firstWidget: number }[] {
  // STOPPING AT THE CAP IS THE WHOLE OF THE CHANGE (4.52.1). A fence asking for
  // four columns draws two, so a gesture that measured four would write widths
  // onto delimiters that open nothing — and `setCellWidths`' own count check
  // would then refuse every drag on the row instead. The drawn columns are the
  // first `MAX_COLUMNS` runs; the rest are dealt into them and bring no share of
  // their own, which `capColumns` states from the render's side.
  return runsOf(body)
    .slice(0, MAX_COLUMNS)
    .map(({ opener, widgets }) => ({ opener, firstWidget: widgets[0] }));
}

// The fence body with these per-column weights, or null when nothing would
// change.
//
// NULL-MEANS-NO-CHANGE is `moveCell`'s contract and `applyFlatSections`', and it
// covers what a reader does every time they drag a divider and think better of
// it: writing the file to say the columns are the width they already were would
// put an entry in every sync log in the vault.
//
// ── FOUR RULES, EACH OF THEM ONE SENTENCE ────────────────────────────────
//
// AN UNDIVIDED ROW IS WRITTEN OUT FIRST. A row with no `cell` line is one column
// per directive — that is what the absence MEANS — so there is nowhere to hang
// the first weight until the delimiters it implies are on the page. `delimit`
// is `cell-move.ts`'s, does exactly this and nothing else, and the row it
// produces renders identically to the one it was given.
//
// AND ONLY WHEN IT HAS TO BE. Every weight of one is the row it already is, so
// an even row stays undivided rather than gaining a delimiter between every pair
// — which is the trade `composeFlatNote` declines from the other end, made here
// for the same reason.
//
// THE FIRST COLUMN NEEDS A LEADING DELIMITER, because the `row` line opens it
// and a `row` takes no value (4.2 refused `row: 3` and says why). `cellPlan`
// has honoured a leading `cell: N` since 4.4 §2 — it keeps the WEIGHT and drops
// the empty run — and `composeFlatNote` deliberately never writes one, so this
// is the first writer that does. It goes immediately above the widget it opens,
// which is where a reader will look for it.
//
// AND A LEADING BARE `cell` IS DROPPED rather than written. It opens no run and
// asks for one share, so it says nothing at all — `tidyCells`' own rule, applied
// to the one delimiter `tidyCells` deliberately keeps.
//
// WHAT IT WILL NOT TOUCH: a delimiter that opens no column. A trailing one, or
// the first of two in a row, is not this gesture's business — a resize that
// tidied lines the reader did not point at would be a reconciler rewriting
// structure it was not asked about, which is what 3.15 §2.3 forbids.
// ── AND IT IS ASKED OF ONE PAGE (4.34 §6) ────────────────────────────────
//
// `page` is an index into `tabSlices`. A group's pages each have their own
// columns and their own widths, and the divider a reader drags is inside one of
// them — so every question below is asked of that page's lines and every write
// is offset back into the body.
//
// DEFAULTS TO 0, which on a body with no `tab` line is the whole body: the
// signature every existing caller already uses, answering exactly what it
// answered before. That is not a convenience, it is the compatibility claim, and
// `test/tabs.test.ts` asserts it rather than trusting it.
//
// THE ROW LINE IS STILL ASKED OF THE WHOLE BODY. `row` is a block modifier
// written once at the top, so only the first page's slice contains it — asking a
// slice would refuse every gesture on every page but the first.
export function setCellWidths(
  body: readonly string[],
  weights: readonly number[],
  page = 0
): string[] | null {
  if (!body.some(isRowLine)) return null;
  if (!weights.length) return null;
  if (!weights.every((w) => Number.isInteger(w) && w >= 1)) return null;

  // A PAGE THAT IS NOT THERE IS A STALE GESTURE, and the answer is the one this
  // function already gives for a count that disagrees: write nothing. The
  // reader has edited the fence since the drag began.
  const span = pageSlice(body, page);
  if (!span) return null;

  const seg = body.slice(span.from, span.to);

  // AN EVEN ROW THAT IS ALREADY UNDIVIDED IS THE ROW BEING ASKED FOR, and this
  // is the ONLY thing standing between it and a delimiter between every pair.
  // The line below would otherwise write it out to hang weights of one on it,
  // and the reader who never asked for cells would get a fence full of them.
  if (weights.every((w) => w === 1) && !seg.some(isCellLine)) return null;

  // AND `delimit` IS FOR AN UNDIVIDED ROW ONLY. Run on a body that already has
  // delimiters it would add a second one before every widget, which is why this
  // asks about the body rather than about the weights.
  //
  // ASKED OF THE PAGE, because a group whose tab 1 is divided and whose tab 2 is
  // not is an ordinary group: the global reading would see tab 1's delimiters
  // and leave tab 2 with nowhere to hang a weight.
  const next = seg.some(isCellLine) ? [...seg] : delimit(seg).body;
  const columns = columnsOf(next);
  // A COUNT THAT DISAGREES IS A STALE GESTURE. The weights were worked out from
  // the cells on screen, and the note is re-read at the moment of the write —
  // `indexNow`'s lesson, one file over. If the two no longer agree, the reader
  // has edited the fence mid-drag and the honest answer is to write nothing.
  if (columns.length !== weights.length) return null;

  // BACK TO FRONT, so an insertion does not move the lines the later columns
  // were located at.
  for (let n = columns.length - 1; n >= 0; n--) {
    const { opener, firstWidget } = columns[n];
    const weight = weights[n];
    if (opener >= 0) {
      if (n === 0 && weight === 1) next.splice(opener, 1);
      else next[opener] = spell(indentOf(next[opener]), weight);
      continue;
    }
    if (weight !== 1) {
      next.splice(firstWidget, 0, spell(indentOf(next[firstWidget]), weight));
    }
  }

  // BACK INTO THE BODY THE PAGE CAME OUT OF. Every other page is re-emitted as
  // the exact lines it was read as — `widenCells`' own promise, one level down,
  // and the property that lets a width be written into a fence somebody else
  // arranged.
  const out = [
    ...body.slice(0, span.from),
    ...next,
    ...body.slice(span.to),
  ];
  return out.join("\n") === body.join("\n") ? null : out;
}

// What the columns of this body currently weigh, one per drawn column.
//
// READ BACK FROM THE FILE rather than from the rendered cells' inline styles,
// because the gesture needs a starting point that `setCellWidths` will agree
// with: a weight the DOM shows and the body does not is a weight this function
// is about to overwrite. It is also what makes an Escape mid-drag a restore
// rather than a second write.
export function cellWidthsOf(body: readonly string[], page = 0): number[] {
  const span = pageSlice(body, page);
  if (!span) return [];
  const seg = body.slice(span.from, span.to);
  return columnsOf(seg).map(({ opener }) => {
    if (opener < 0) return 1;
    const raw = splitDirective(seg[opener]).argument.trim();
    if (!raw || !/^\d+$/.test(raw)) return 1;
    const n = Number(raw);
    return n >= 1 ? n : 1;
  });
}

// ── THE SAME TWO, ASKED OF A WHOLE NOTE ──────────────────────────────────
//
// `moveCell`'s shape, and for its reason: the gesture should hand over a file
// and a block number and get a file back. Everything between those two is
// arithmetic over a list of lines, which is the half a suite with no DOM can
// actually hold — 4.8's eight patch rounds were every one of them in the wiring
// and not one in `moveCell`, and the way to keep that record is to leave the
// gesture nothing to be wrong about.

// The note with block `block`'s columns set to these widths, or null when
// nothing would change.
//
// EVERY OTHER FENCE IS RE-EMITTED AS THE EXACT LINES IT WAS READ AS, which is
// the reconciler's promise `rebuild` makes one file over and the property that
// lets structure be rewritten in a file somebody else wrote.
export function widenCells(
  lines: readonly string[],
  block: number,
  weights: readonly number[],
  page = 0
): string[] | null {
  const { at, segs } = fencesOf(lines);
  if (block < 0 || block >= at.length) return null;
  const fence = segs[at[block]];
  const next = setCellWidths(fence.slice(1, -1), weights, page);
  if (!next) return null;
  const out = segs.map((seg, i) =>
    i === at[block] ? [seg[0], ...next, "```"] : [...seg]
  );
  return out.flat();
}

// What block `block`'s columns weigh right now, or null when it has no row.
//
// ASKED OF THE FILE AT THE MOMENT THE DRAG STARTS, never cached across one —
// `indexNow`'s lesson in block-drag.ts, which cost a release: every drop
// rewrites the note, and a number taken at render time describes a page that
// has since moved.
export function cellWidthsIn(
  lines: readonly string[],
  block: number,
  page = 0
): number[] | null {
  const { at, segs } = fencesOf(lines);
  if (block < 0 || block >= at.length) return null;
  const body = segs[at[block]].slice(1, -1);
  return body.some(isRowLine) ? cellWidthsOf(body, page) : null;
}
