// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Setting one widget's height by dragging the mark under its card. 4.22 §2.
//
// ── WHAT THIS IS, NEXT TO `cell-width.ts` ────────────────────────────────
//
// That file sets how wide a group's COLUMNS are; this one sets how tall one CARD
// in a column is. They are the same gesture turned ninety degrees and they are
// deliberately not the same code, because the two answers have different shapes:
// a width is a share of a row and is meaningless alone, so `snapRatio` returns a
// PAIR; a height is a number of pixels belonging to one card, so everything here
// is about one line and the widget under it.
//
// ── WHY A HANDLE PER CARD AND NOT A HANDLE PER SEAM ──────────────────────
//
// The obvious reading of "make the seam a control" is the divider's shape
// exactly — a mark between two cards, dragged, setting the pair. Two facts about
// the page rule it out.
//
// A COLUMN HAS NO FIXED TOTAL TO DIVIDE. Two columns share a row of known width,
// which is what makes `snapRatio`'s pair of shares meaningful: give one column
// more and the other has less, and the two always add to the row. Two cards share
// nothing — a column is as tall as what is in it — so a pair of height shares
// would need a total height invented first.
//
// AND IT CANNOT REACH THE CARD THAT NEEDS IT. N cards have N-1 seams between
// them, so the last card in every column is unreachable, and on the homepage this
// release is about that is the widget with the most empty rows in it. A handle on
// every card's own bottom edge is N handles, reaches all of them, and is one
// sentence rather than two: the mark under a card sets that card's height.
//
// ── EVERYTHING DECIDABLE WITHOUT A DOM IS DECIDED HERE ───────────────────
//
// `cell-width.ts`'s stated reason, and it is this file's too: a pointer gesture
// is the one thing this suite cannot run — 4.8 spent eight patch rounds on wiring
// no test could reach, and not one of them was in the arithmetic. So the snap,
// the read-back, the rewrite and the whole-note wrapper are all here, and what is
// left in `block-drag.ts` is coordinates.

import {
  HEIGHT_KEYWORD,
  heightOf,
  isHeightLine,
} from "./directive-grammar";
import { fencesOf } from "./block-move";
import { isWidget } from "./cell-move";

// What a drag snaps to, in pixels.
//
// TWENTY, WHICH IS ABOUT A LINE OF TEXT. Small enough that a reader who wants a
// particular height can reach it, large enough that the card does not follow the
// pointer pixel for pixel and write a number nobody chose. `snapRatio` snaps to
// the ratios a person would have typed; this snaps to the heights they would
// have.
export const HEIGHT_STEP = 20;

// The leading whitespace of a line, so an inserted height sits where the line it
// sizes sits. `splitDirective` trims the keyword, so a fence written with
// indented lines reads correctly and would be un-indented by a writer that did
// not look. (`cell-width.ts` has the same three lines and the same reason; they
// are five characters of regex and sharing them would couple two modules that
// otherwise only meet in `cell-move.ts`.)
const indentOf = (line: string): string => /^\s*/.exec(line)?.[0] ?? "";

// How a height is spelled. There is only one spelling — a height with no value
// is refused by the grammar and says why — so this has none of `spell`'s branch.
const spell = (indent: string, px: number): string =>
  `${indent}${HEIGHT_KEYWORD}: ${px}`;

// Where the pointer's height rounds to, or null when the card should have no
// stated height at all.
//
// `min` is the floor, which the caller reads back from `--am-card-h-min` rather
// than repeating here — `pxToken`'s rule, and the reason the token lives in the
// stylesheet.
//
// `natural` is the height the card would have if nobody had asked, measured
// before it was sized.
//
// NULL AT AND ABOVE NATURAL, AND THAT NULL IS THE WHOLE OF "DRAGGING IT BACK
// TAKES THE LINE AWAY". It is `setCellWidths`' rule about an even row said again:
// a height that is the height the card already wants is not a height. Writing one
// would put a number in the reader's file that changes nothing today and goes
// stale the first time the widget has more in it — and there would then be no
// gesture that could remove it, because dragging down would only ever make it
// bigger.
export function snapHeight(
  px: number,
  min: number,
  natural: number
): number | null {
  // ARITHMETIC ARRIVES FROM CALLERS THAT HAVE NOT BEEN WRITTEN YET. Nothing in
  // the gesture produces a non-finite height — the drag is clamped to the card —
  // but a function that answers "what should be written" must have an answer for
  // "nothing sensible", and that answer is to write nothing.
  if (!Number.isFinite(px)) return null;
  const floor = Number.isFinite(min) && min > 0 ? Math.round(min) : HEIGHT_STEP;
  const want = Math.max(floor, Math.round(px / HEIGHT_STEP) * HEIGHT_STEP);
  // A CARD SHORTER THAN THE FLOOR CANNOT BE SIZED, and falls out of the line
  // above rather than being a case here: every height it could be given is at or
  // above its natural height, so every drag on it clears the line.
  if (Number.isFinite(natural) && want >= natural) return null;
  return want;
}

// The height stated for the widget on line `line`, or null when it has none.
//
// ── THE RENDER-SIDE RULE, STATED ONCE AND NOWHERE ELSE ───────────────────
//
// A WIDGET'S HEIGHT IS THE `height:` LINE IMMEDIATELY ABOVE ITS OWN DIRECTIVE
// LINE. Not the nearest one above it, not the one that opened its cell — the line
// before it, and nothing else.
//
// This is the one place 4.22 could have repeated 4.4 §1's hardest problem and
// does not. `cellPlan` locates a delimiter by COUNTING CHILDREN, because the
// dispatcher cannot hand back "the child that ended the last cell": a directive
// may append nothing, and `on-this-day` on a young vault is exactly that
// directive. A height located by a count would inherit the same hazard with a
// worse failure — a `height:` above a directive that drew nothing would silently
// size the NEXT widget, which is a reader's layout changing for a reason nothing
// on the page explains.
//
// Located by the line above, it cannot. The widget it sizes is found through the
// `data-am-line` stamp `stampLines` already writes, and a directive that drew
// nothing leaves no stamp to find.
//
// AND IT IS ASKED OF A WIDGET. A `header:` bar is not a card (row.ts,
// `NOT_A_CELL`), so a height above one sizes nothing — the same answer the render
// gives, arrived at here rather than left to a caller to remember.
export function heightAbove(
  body: readonly string[],
  line: number
): number | null {
  if (line <= 0 || line >= body.length) return null;
  if (!isWidget(body[line])) return null;
  const above = body[line - 1];
  return isHeightLine(above) ? heightOf(above) : null;
}

// The fence body with the widget on line `line` set to `px` pixels tall — or
// with its height taken away, when `px` is null — and null when nothing would
// change.
//
// NULL-MEANS-NO-CHANGE is `moveCell`'s contract, `widenCells`' and
// `applyFlatSections`', and here it covers the reader who drags a mark and thinks
// better of it: writing the file to say a card is the height it already was would
// put an entry in every sync log in the vault.
//
// REFUSES UNLESS THE LINE IS A WIDGET. A gesture that named a `row` line, a
// delimiter or a `header:` bar is a stale render — the note has been edited since
// the card was drawn — and the honest answer is to write nothing. That is
// `setCellWidths`' own check applied to a line instead of to a length.
export function setCellHeight(
  body: readonly string[],
  line: number,
  px: number | null
): string[] | null {
  if (line < 0 || line >= body.length) return null;
  if (!isWidget(body[line])) return null;
  if (px !== null && (!Number.isInteger(px) || px < 1)) return null;

  const has = line > 0 && isHeightLine(body[line - 1]);
  const next = [...body];
  if (px === null) {
    if (!has) return null;
    next.splice(line - 1, 1);
  } else if (has) {
    next[line - 1] = spell(indentOf(next[line]), px);
  } else {
    next.splice(line, 0, spell(indentOf(next[line]), px));
  }

  return next.join("\n") === body.join("\n") ? null : next;
}

// The lines a widget takes with it when it moves: its own, and the height above
// it when there is one.
//
// SMALL, AND §5 IS WHY IT EXISTS. A `height:` line is positional, so a drag that
// carried the directive and left the height behind would leave that height sizing
// whatever moved up into its place — a layout gesture silently resizing an
// unrelated widget, which is precisely the class of failure 4.8 spent eight
// patches on. Every range `block-drag.ts` builds for a widget in a cell goes
// through here, so there is one answer rather than one per drag path.
export function runWithHeight(
  body: readonly string[],
  line: number
): { from: number; to: number } {
  const from = line > 0 && isHeightLine(body[line - 1]) ? line - 1 : line;
  return { from, to: line + 1 };
}

// ── THE SAME, ASKED OF A WHOLE NOTE ──────────────────────────────────────

// The note with block `block`'s widget on body line `line` set to this height,
// or null when nothing would change.
//
// `widenCells`' SHAPE EXACTLY, including the part that matters most: EVERY OTHER
// FENCE IS RE-EMITTED AS THE LINES IT WAS READ AS. That is the reconciler's
// promise `rebuild` makes one file over, and it is what lets structure be
// rewritten in a file somebody else wrote.
export function resizeCell(
  lines: readonly string[],
  block: number,
  line: number,
  px: number | null
): string[] | null {
  const { at, segs } = fencesOf(lines);
  if (block < 0 || block >= at.length) return null;
  const fence = segs[at[block]];
  const next = setCellHeight(fence.slice(1, -1), line, px);
  if (!next) return null;
  const out = segs.map((seg, i) =>
    i === at[block] ? [seg[0], ...next, "```"] : [...seg]
  );
  return out.flat();
}
