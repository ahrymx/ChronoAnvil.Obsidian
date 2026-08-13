// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Finding the block a rendered widget came from. 4.7, cut back in 4.8.1.
//
// ── WHAT THIS WAS, AND WHAT IS LEFT ──────────────────────────────────────
//
// 4.7 made a block draggable and this file was the write behind it: `segment`
// cuts a note into blocks that round-trip verbatim, and a drop swapped two of
// them. 4.8.1 removed that gesture at a vault's request — a block is moved from
// the section editor, which plans and previews where a drag could only write —
// so `swapBlocks` and `blockCount` went with their only caller rather than
// staying as two tested functions nobody calls.
//
// WHAT SURVIVES IS THE LOOKUP. `blockIndexAt` turns a rendered block's line
// range into the index `moveCell` speaks, and `fencesOf` is the one answer to
// "which segments are fences, and where". The cell gesture needs both.
//
// ── WHY A BLOCK MOVE WAS NEVER A SECTION REORDER ─────────────────────────
//
// Kept because it is the argument for cell-move.ts as well, and it is the one a
// reader is most likely to try to undo. The obvious implementation of any of
// this is a desired ORDER of section ids handed to `applyFlatSections`, which
// already reorders. It does not work: a section sharing a block with another
// cannot be moved, because the reorder pass permutes CHUNKS and a chunk is a
// block — *"On this day is in one block with Diary and Open tasks and moves
// with it."*
//
// The homepage's top row IS such a block, so a gesture over it would be asking
// to move three sections at once, each refused individually, and the plan would
// come back with three refusals for something obviously legal. So a gesture
// moves LINES, not sections: the reader picked something up and put it
// somewhere, and nothing about which catalogue entries live inside it changes.
//
// ── AND IT STAYS A RECONCILER ────────────────────────────────────────────
//
// Every segment is re-emitted as the exact lines it was read as. Nothing is
// reformatted, no directive is re-rendered, and a run this does not touch is
// byte-identical afterwards — which is `applyFlatSections`' own promise, kept
// by construction rather than by care.

import { segment } from "./layout";

// Where each fence sits in the note's segment list, and the segments themselves.
//
// RAW RUNS ARE NOT BLOCKS. A reader's own prose between two blocks is theirs,
// it is not a block, and it never moves — the same promise `applyFlatSections`
// makes when it says a foreign run keeps its index.
//
// EXPORTED FOR `cell-move.ts`, which moves a line between the same blocks this
// counts. A second copy of "which segments are fences, and where" is how the
// two files would come to disagree about what block 2 is — which is the one
// thing they must never do, since a drag hands an index from one to the other.
export function fencesOf(lines: readonly string[]): {
  at: number[];
  segs: string[][];
} {
  const segs = segment([...lines]).map((s) => s.lines);
  const at: number[] = [];
  segs.forEach((seg, i) => {
    if (segment([...seg])[0]?.kind === "fence") at.push(i);
  });
  return { at, segs };
}

// Which block — counting fences from the top — holds this line.
//
// The bridge from a RENDERED block to one a move can name: `boundsOf` gives a
// line range for the block a reader grabbed something out of, and this turns it
// into the index `moveCell` speaks in. Null when the line is in no fence, which
// is a real answer for a click on prose.
export function blockIndexAt(
  lines: readonly string[],
  line: number
): number | null {
  const { at, segs } = fencesOf(lines);
  let start = 0;
  const startOf: number[] = [];
  for (let i = 0; i < segs.length; i++) {
    startOf[i] = start;
    start += segs[i].length;
  }
  for (let b = 0; b < at.length; b++) {
    const from = startOf[at[b]];
    const to = from + segs[at[b]].length - 1;
    if (line >= from && line <= to) return b;
  }
  return null;
}
