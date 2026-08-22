// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// What "move this up" means once some of the rows are in a group. 4.53.0.
//
// ── THE BUG THIS EXISTS BECAUSE OF ───────────────────────────────────────
//
// The section editor held an arrangement as a flat list of ids plus one bit per
// row — *this row is in a block with the one above it* — and moved a row by
// SWAPPING IT WITH ITS NEIGHBOUR IN THAT FLAT LIST. Both halves are right on
// their own and together they destroy groups, because a block is a RUN and a
// swap is blind to where the run ends:
//
//   rows [A, B, C, D], with B and C in one group. Press Move up on D.
//   D and C trade places, so the group's members are no longer consecutive —
//   and the bit that said "C is with the one above it" now points at D.
//   The list comes back as A, B, then a group of D and C.
//
// One press, and the reader has lost the group they had and gained one they
// never asked for. The mirror case is worse: moving the group's FIRST row up
// swallows whatever was above it, because that row's membership is recorded as
// the ABSENCE of a bit and absence does not travel. `keptBlocks` was written in
// 4.44.1 to stop a reorder INSIDE a group doing this; it deliberately leaves a
// move that breaks a run alone, because a reader dragging a row out of a group
// is regrouping. The arrows had no way to say which of the two they meant.
//
// ── SO A MOVE NAMES ITS UNIT ─────────────────────────────────────────────
//
// A row is either a cell of a group or a block on its own, and those are two
// different things to move:
//
//   A CELL moves inside its group, and cannot leave it. Its neighbours are the
//   other cells, so the last cell has nowhere further down to go and the first
//   has nowhere further up. Leaving is `takeOut`, which is a button that says
//   so.
//
//   A BLOCK moves among the blocks of its band, and a group is ONE block. So a
//   row below a group moves UP OVER THE WHOLE GROUP rather than into the middle
//   of it — which is the report this module is written for, and it falls out of
//   the unit rather than being a check bolted onto the swap.
//
// Nothing here can produce an arrangement whose blocks are not runs, and
// nothing here changes which sections a note has. Membership changes only in
// the three functions that say so in their names — `joinInto`, `takeOut`,
// `breakUp` — and every other operation restores the boundaries it found.
// `joinInto` is the one of the three that also MOVES a row, because a block is
// a run and a row cannot join one it is not next to.
//
// ── AND IT IS PURE ───────────────────────────────────────────────────────
//
// The editor is DOM and Obsidian's Modal base, which the suite does not render.
// Holding the arrangement in one module of plain functions is what makes the
// rule above checkable at all: `test/row-order.test.ts` presses the buttons by
// calling them.

import { dropOnto } from "./drop-onto";

// An arrangement, as the editor holds it: the rows in display order and the two
// bits that cut them into groups and pages.
//
// TWO BITS AND A LIST, NOT A LIST OF LISTS. `section-editor.ts` argued for this
// shape in 4.8 and the argument still holds — every other part of that window is
// written in terms of a flat list of ids, and a list of lists would have to be
// unpacked and repacked by all of them. What was missing is not a richer
// structure; it is the handful of operations that keep the bits honest.
export interface Arrangement {
  rows: readonly string[];
  // This row shares a block with the one above it.
  joined: ReadonlySet<string>;
  // This row begins a page of its block rather than a column of the page
  // before it. Always a subset of `joined` — see `normalise`.
  paged: ReadonlySet<string>;
}

// The same three, owned by the caller. Every operation returns a whole new one
// rather than mutating in place, so a refused move is a `null` the caller can
// ignore rather than a half-applied change it has to undo.
export interface NextArrangement {
  rows: string[];
  joined: Set<string>;
  paged: Set<string>;
}

// Which rows move together when this one moves.
export type MoveUnit = "cell" | "block";

// ── reading an arrangement ────────────────────────────────────────────

// These ids cut into blocks: a run starts wherever a row is not joined to the
// one before it.
//
// TAKES THE IDS IT IS GIVEN, because it is asked the same rule about three
// different lists. The LIST asks about every row on screen, struck-through ones
// included, so a reader can see the block they are taking something out of. The
// CONTROLS ask about the rows that will actually be written, where a removed row
// is already gone. The WRITE asks about `want`. One walk, three callers.
export function blocksOf(
  ids: readonly string[],
  joined: ReadonlySet<string>
): string[][] {
  const out: string[][] = [];
  for (const id of ids) {
    if (out.length && joined.has(id)) out[out.length - 1].push(id);
    else out.push([id]);
  }
  return out;
}

// One block's rows, cut into its pages.
//
// `blocksOf`'s TWIN, ONE LEVEL IN: that one cuts a list of rows into blocks
// wherever a row is not joined to the one above it, and this cuts ONE block into
// pages wherever a row is marked as opening one. Same walk, same one bit per
// row, and neither has to count anything.
//
// THE FIRST ROW OF A BLOCK IS NEVER A BREAK, however it is marked. The `row`
// line opens page one exactly as it opens the first column, so a group's opener
// cannot begin a page.
export function pagesOf(
  block: readonly string[],
  paged: ReadonlySet<string>
): string[][] {
  const out: string[][] = [];
  block.forEach((id, i) => {
    if (i > 0 && paged.has(id)) out.push([id]);
    else if (out.length) out[out.length - 1].push(id);
    else out.push([id]);
  });
  return out;
}

// The block this row is in, or an empty list for a row that is not in the band
// at all — which is what an immovable row is (see `bandOf`).
export function blockOf(
  band: readonly string[],
  joined: ReadonlySet<string>,
  id: string
): string[] {
  return blocksOf(band, joined).find((b) => b.includes(id)) ?? [];
}

// What moving this row moves. A row in a group of one is its own block.
export function unitOf(
  band: readonly string[],
  joined: ReadonlySet<string>,
  id: string
): MoveUnit {
  return blockOf(band, joined, id).length > 1 ? "cell" : "block";
}

// Every block this row could join, in the order they are written.
//
// TWO KINDS OF DESTINATION, AND THAT IS THE WHOLE RULE (4.53.2): **the block
// directly above**, which is how a group gets made in the first place, and
// **any group already on the page**, however far away it is. Until this release
// there was only the first, and the second is the case a reader kept asking
// for — a widget three rows down from the group it belongs beside had no way in
// except pressing an arrow at it until it was adjacent, which meant walking it
// past everything in between and hoping the arrangement survived the trip.
//
// AND NOT EVERY OTHER BLOCK. A lone row far from another lone row is not
// offered: the pair are not a group yet, so joining them is not "put this in
// that", it is "invent an arrangement neither of them is in" — and offering it
// would mean the ordinary case, a page of eight ungrouped widgets, could no
// longer make a group without first answering a question with seven answers.
// Move one under the other and the block-above rule has it.
//
// EMPTY RATHER THAN NULL, because the caller no longer has one question. It
// asks how MANY, and "none" is a length like any other: no icon is drawn.
//
// ONLY A BLOCK OF ONE MAY JOIN. Merging two groups is a different operation
// with a different outcome — every cell of both ending up in one fence — and
// offering it under the same words as "put this widget beside that one" is how
// the control got its reputation. Break one up and rejoin.
//
// ASKED OF THE ROWS THAT WILL BE WRITTEN, not of the rows on screen: a block
// whose every member is being removed is not there at Save, so joining "the
// block above" would land somewhere else than the button said.
export function joinables(
  band: readonly string[],
  joined: ReadonlySet<string>,
  id: string
): string[][] {
  const blocks = blocksOf(band, joined);
  const at = blocks.findIndex((b) => b.includes(id));
  if (at < 0 || blocks[at].length !== 1) return [];
  return blocks.filter((b, i) => i !== at && (i === at - 1 || b.length > 1));
}

// ── moving, without changing what is in what ──────────────────────────

// Whether the arrows should be live. `moveRow` answers the same question by
// doing the work, and a list of ten rows asks this forty times per repaint.
export function canMoveRow(
  band: readonly string[],
  joined: ReadonlySet<string>,
  id: string,
  delta: number
): boolean {
  const blocks = blocksOf(band, joined);
  const at = blocks.findIndex((b) => b.includes(id));
  if (at < 0) return false;
  const block = blocks[at];
  if (block.length > 1) {
    const to = block.indexOf(id) + delta;
    return to >= 0 && to < block.length;
  }
  return canMoveBlock(band, joined, id, delta);
}

export function canMoveBlock(
  band: readonly string[],
  joined: ReadonlySet<string>,
  id: string,
  delta: number
): boolean {
  const blocks = blocksOf(band, joined);
  const at = blocks.findIndex((b) => b.includes(id));
  if (at < 0) return false;
  const to = at + delta;
  return to >= 0 && to < blocks.length;
}

// One press of an arrow: the cell moves inside its group, or the block moves
// among the blocks of its band.
//
// THE UNIT IS READ FROM THE ARRANGEMENT RATHER THAN PASSED IN. The caller draws
// a cell inside a card and a block as a row in the list, so it knows which it is
// looking at — and a second answer to a question the arrangement already
// answers is a second chance for the two to disagree.
export function moveRow(
  arr: Arrangement,
  band: readonly string[],
  id: string,
  delta: number
): NextArrangement | null {
  return unitOf(band, arr.joined, id) === "cell"
    ? moveCell(arr, band, id, delta)
    : moveBlock(arr, band, id, delta);
}

// A cell trades places with the cell beside it, INSIDE its group.
//
// PAGE BOUNDARIES STAY WHERE THEY ARE, which is what makes this the way to move
// a widget from one page of a group to another: the two cells either side of a
// boundary swap, so one crosses it going up and the other going down. See
// `keptPages` — the rule is the one `keptBlocks` already keeps for blocks, said
// one level in.
export function moveCell(
  arr: Arrangement,
  band: readonly string[],
  id: string,
  delta: number
): NextArrangement | null {
  const blocks = blocksOf(band, arr.joined);
  const at = blocks.findIndex((b) => b.includes(id));
  if (at < 0 || blocks[at].length < 2) return null;
  const cells = [...blocks[at]];
  const from = cells.indexOf(id);
  const to = from + delta;
  if (to < 0 || to >= cells.length) return null;
  [cells[from], cells[to]] = [cells[to], cells[from]];
  return settle(arr, band, flatten(blocks, at, cells));
}

// A whole block moves past the whole block beside it.
//
// THE ANSWER TO THE REPORT. A row below a group is a block, the group is a
// block, and one block moving past another cannot land inside it — so "move up"
// steps OVER the group rather than into it, and the group comes through the move
// with the members and the pages it had.
export function moveBlock(
  arr: Arrangement,
  band: readonly string[],
  id: string,
  delta: number
): NextArrangement | null {
  const blocks = blocksOf(band, arr.joined);
  const at = blocks.findIndex((b) => b.includes(id));
  if (at < 0) return null;
  const to = at + delta;
  if (to < 0 || to >= blocks.length) return null;
  const next = [...blocks];
  [next[at], next[to]] = [next[to], next[at]];
  return settle(arr, band, next.flat());
}

// A cell dropped on another cell of the same group.
export function dropCell(
  arr: Arrangement,
  band: readonly string[],
  from: string,
  onto: string
): NextArrangement | null {
  const blocks = blocksOf(band, arr.joined);
  const at = blocks.findIndex((b) => b.includes(from));
  if (at < 0 || blocks[at].length < 2) return null;
  if (!blocks[at].includes(onto)) return null;
  const cells = dropOnto(blocks[at], from, onto);
  if (!cells) return null;
  return settle(arr, band, flatten(blocks, at, cells));
}

// A block dropped on another block — the one carrying `onto`, whichever of its
// rows that is.
//
// DROPPING ON A GROUP PUTS THE BLOCK BESIDE THE GROUP, NOT IN IT. `dropOnto`'s
// rule decides which side: the thing you dropped on moves aside towards where
// you dragged from. A drag has meant "reorder" since 3.0 and teaching it to
// join would make the outcome depend on where inside a card the pointer let go
// — the ambiguity 4.7 removed from the page.
export function dropBlock(
  arr: Arrangement,
  band: readonly string[],
  from: string,
  onto: string
): NextArrangement | null {
  const blocks = blocksOf(band, arr.joined);
  const at = blocks.findIndex((b) => b.includes(from));
  const target = blocks.findIndex((b) => b.includes(onto));
  if (at < 0 || target < 0 || at === target) return null;
  const order = dropOnto(
    blocks.map((_, i) => i),
    at,
    target
  );
  if (!order) return null;
  return settle(arr, band, order.flatMap((i) => blocks[i]));
}

// ── changing what is in what ──────────────────────────────────────────

// This row joins the block `anchor` is in, as another column.
//
// IT ARRIVES THROUGH THE NEAREST EDGE, which is `takeOut` read backwards and is
// deliberately the same sentence: a row above the destination becomes its first
// column and a row below it becomes its last. That makes take-out and re-join a
// ROUND TRIP — press one and then the other and the page is where it started —
// where landing everything at the end would have quietly rewritten the order of
// a group the reader only meant to look at.
//
// IT MOVES, WHICH `join` DID NOT (4.53.2). The old operation was one bit and no
// movement, because the only destination it had was the block already touching
// this row. A group further down the page is not touching it, and a block is a
// RUN of consecutive rows — so arriving in one means being next to it first.
// The move and the bit are one operation here for the reason every other
// regroup in this file is: two presses that are only correct together are one
// press with a bug between them.
//
// THE BITS ARE SET, NOT INFERRED. `settle` would rebuild membership from where
// the rows land, which is right for a move and wrong for this: `keptBlocks`
// would hand back the boundaries as they were and undo the join it was asked
// to make. Same reason `takeOut` sets them by hand.
export function joinInto(
  arr: Arrangement,
  band: readonly string[],
  id: string,
  anchor: string
): NextArrangement | null {
  const blocks = blocksOf(band, arr.joined);
  const at = blocks.findIndex((b) => b.includes(id));
  if (at < 0 || blocks[at].length !== 1) return null;
  const tgt = blocks.findIndex((b) => b.includes(anchor));
  if (tgt < 0 || tgt === at) return null;
  // Which edge, asked before the block is lifted out and the indices shift.
  const above = tgt > at;
  const rest = blocks.filter((_, i) => i !== at);
  const to = above ? tgt - 1 : tgt;
  const order = rest.flatMap((b, i) =>
    i === to ? (above ? [id, ...b] : [...b, id]) : [...b]
  );
  const joined = new Set(arr.joined);
  if (above) {
    // Arriving at the front makes this row the one that OPENS the block, and a
    // block's opener is the row without the bit — so the cell it displaces
    // gains one. Get this backwards and the group comes apart into two.
    joined.delete(id);
    joined.add(rest[to][0]);
  } else {
    joined.add(id);
  }
  const paged = new Set(arr.paged);
  // A ROW ARRIVING IN A GROUP DOES NOT BRING A PAGE WITH IT. A reader who took
  // a row out of a group and put it back would otherwise get a page break they
  // asked for once, a while ago, on a different arrangement.
  paged.delete(id);
  return normalise(restack(arr.rows, band, order), joined, paged);
}

// One cell leaves its group and becomes a block of its own.
//
// IT LEAVES THROUGH THE NEAREST EDGE, and it has to leave through one: a block
// is a run of consecutive rows, so a cell taken out of the MIDDLE of a group
// cannot stay in the middle. The opener lands directly above the group and any
// other cell directly below it, which is the shortest trip in each case and the
// one a reader watching the card can follow.
//
// THE BUG THIS REPLACES. Taking a cell out used to be `joined.delete(id)` and
// nothing else, which does not remove it from the run — it CUTS the run there.
// Take the middle one of three out and it left holding the third: one group of
// two became a row on its own and a new group of the two the reader did not
// name.
export function takeOut(
  arr: Arrangement,
  band: readonly string[],
  id: string
): NextArrangement | null {
  const blocks = blocksOf(band, arr.joined);
  const at = blocks.findIndex((b) => b.includes(id));
  if (at < 0 || blocks[at].length < 2) return null;
  const rest = blocks[at].filter((x) => x !== id);
  const opener = blocks[at][0] === id;
  const order = blocks.flatMap((b, i) =>
    i === at ? (opener ? [id, ...rest] : [...rest, id]) : b
  );
  const joined = new Set(arr.joined);
  joined.delete(id);
  joined.delete(rest[0]);
  for (const x of rest.slice(1)) joined.add(x);
  const paged = new Set(arr.paged);
  paged.delete(id);
  return normalise(restack(arr.rows, band, order), joined, paged);
}

// Every member of this group leaves at once.
//
// THE ONE OPERATION ON A GROUP THAT NEEDS NO PER-ROW JUDGEMENT: they each get
// the block they would have had if nobody had put them together, in the order
// they are already in.
export function breakUp(
  arr: Arrangement,
  band: readonly string[],
  id: string
): NextArrangement | null {
  const block = blockOf(band, arr.joined, id);
  if (block.length < 2) return null;
  const joined = new Set(arr.joined);
  const paged = new Set(arr.paged);
  for (const x of block) {
    joined.delete(x);
    // A GROUP THAT IS NOT A GROUP HAS NO PAGES. `takeOut` has cleared this bit
    // since 4.34.2 and the button that empties the whole card did not, so a
    // reader who broke a paged group up and rebuilt it got its old page
    // boundaries back unasked.
    paged.delete(x);
  }
  return normalise(arr.rows, joined, paged);
}

// This cell begins a page of its group, or stops beginning one.
export function setPage(
  arr: Arrangement,
  band: readonly string[],
  id: string,
  breaks: boolean
): NextArrangement | null {
  if (!arr.joined.has(id)) return null;
  if (arr.paged.has(id) === breaks) return null;
  if (!blockOf(band, arr.joined, id).length) return null;
  const paged = new Set(arr.paged);
  if (breaks) paged.add(id);
  else paged.delete(id);
  return normalise(arr.rows, arr.joined, paged);
}

// ── keeping the bits honest ───────────────────────────────────────────

// The one arrangement the two bits cannot describe, settled once.
//
// A bit is read against the row above, so a bit on a row with nothing above it
// says nothing — and a page bit on a row that is not in a group divides a group
// that is not there. Recomputing `joined` from the blocks it already produces is
// idempotent (the walk in `blocksOf` ignores a leading bit) and makes both
// invariants structural rather than remembered at each of the places that set
// them.
export function normalise(
  rows: readonly string[],
  joined: ReadonlySet<string>,
  paged: ReadonlySet<string>
): NextArrangement {
  const out = new Set<string>();
  for (const block of blocksOf(rows, joined)) {
    for (const id of block.slice(1)) out.add(id);
  }
  const pages = new Set<string>();
  for (const id of paged) if (out.has(id)) pages.add(id);
  return { rows: [...rows], joined: out, paged: pages };
}

// The page boundaries a reordered list should carry — `keptBlocks`' sibling,
// one level in. 4.53.0.
//
// BY POSITION IN THE BLOCK, exactly as `keptBlocks` restores block boundaries by
// position in the list, and for the same reason: a boundary is a property of
// where a row SITS, and the bit that records it belongs to whichever row ends up
// there. Two cells either side of a page boundary trading places therefore swap
// pages, which is what a reader watching two rows swap expects to see — and the
// alternative, carrying the bit with the row, silently moves the boundary and
// leaves one page holding everything.
//
// A BLOCK THAT WAS BROKEN UP BY THE MOVE IS LEFT ALONE, on `keptBlocks`' rule: a
// reader whose move changed a group's membership is regrouping, and the
// functions that regroup set these bits themselves.
export function keptPages(
  before: readonly (readonly string[])[],
  rows: readonly string[],
  paged: ReadonlySet<string>
): Set<string> {
  const out = new Set(paged);
  for (const block of before) {
    if (block.length < 2) continue;
    const at = block.map((id) => rows.indexOf(id)).sort((a, b) => a - b);
    if (at[0] === -1) continue;
    if (at.some((n, i) => i > 0 && n !== at[i - 1] + 1)) continue;
    const marks = block.map((id) => paged.has(id));
    at.forEach((slot, i) => {
      if (marks[i]) out.add(rows[slot]);
      else out.delete(rows[slot]);
    });
  }
  return out;
}

// The blocks a reordered list should carry. 4.44.1, moved here in 4.53.0 so
// that the two halves of "a reorder keeps the boundaries it found" sit together.
//
// ── THE ONE BIT, AND THE ONE ARRANGEMENT IT CANNOT DESCRIBE ──────────────
//
// A block is a run of consecutive rows, so one bit per row says the whole of it,
// and the bit "survives a reorder for free": drag a row out of the middle of a
// block and it takes its flag with it.
//
// That is true of every row of a block EXCEPT THE ONE THAT OPENS IT, and the
// exception is not a corner: the opener is the row a reader drags when they want
// their group to start with something else. Its bit is the ABSENCE of a bit, and
// absence does not travel.
//
// ── SO THE BOUNDARIES ARE RESTORED BY POSITION, NOT BY ROW ───────────────
//
// A block whose members are still together after the move keeps its boundaries:
// its first row opens it and the rest are joined to it, whichever rows those now
// are. A block that was BROKEN UP by the move is left exactly as the bits
// describe it, because that reader is regrouping and the bits are how they say
// so. The two cases are told apart by one question, asked of the new order: are
// this block's rows still consecutive?
export function keptBlocks(
  before: readonly (readonly string[])[],
  rows: readonly string[],
  joined: ReadonlySet<string>
): Set<string> {
  const out = new Set(joined);
  for (const block of before) {
    if (block.length < 2) continue;
    const at = block.map((id) => rows.indexOf(id)).sort((a, b) => a - b);
    if (at[0] === -1) continue;
    if (at.some((n, i) => i > 0 && n !== at[i - 1] + 1)) continue;
    const ids = at.map((i) => rows[i]);
    out.delete(ids[0]);
    for (const id of ids.slice(1)) out.add(id);
  }
  return out;
}

// ── the plumbing the four movers share ────────────────────────────────

// One block's cells replaced, and the lot flattened back to a band order.
function flatten(
  blocks: readonly (readonly string[])[],
  at: number,
  cells: readonly string[]
): string[] {
  return blocks.flatMap((b, i) => (i === at ? [...cells] : [...b]));
}

// One band's ids written back into the slots that band occupies.
//
// SLOTS RATHER THAN A SPLICE, which is what makes "a section cannot cross the
// rule" a property of the operation rather than something checked after it. A
// diary entry has three bands; reordering one of them cannot disturb the
// positions of another's rows, and an immovable row — which is in no band at all
// — keeps the index it has while the movable ones arrange themselves around it.
function restack(
  rows: readonly string[],
  band: readonly string[],
  next: readonly string[]
): string[] {
  const inBand = new Set(band);
  const out = [...rows];
  let n = 0;
  for (let i = 0; i < out.length; i++) {
    if (inBand.has(out[i])) out[i] = next[n++];
  }
  return out;
}

// A move that keeps every block's membership, with the boundaries put back.
//
// NULL FOR A MOVE THAT CHANGES NOTHING, which is `dropOnto`'s convention and
// `moveCell`'s and `applyFlatSections`': a caller that repaints on null is a
// caller redrawing a list to leave it identical.
function settle(
  arr: Arrangement,
  band: readonly string[],
  next: readonly string[]
): NextArrangement | null {
  if (next.length !== band.length) return null;
  if (next.every((id, i) => id === band[i])) return null;
  const before = blocksOf(arr.rows, arr.joined);
  const rows = restack(arr.rows, band, next);
  return normalise(
    rows,
    keptBlocks(before, rows, arr.joined),
    keptPages(before, rows, arr.paged)
  );
}
