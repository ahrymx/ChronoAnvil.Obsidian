// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// What a drop ONTO something means, for every list in this plugin. 4.45.1.
//
// ── THE BUG THIS EXISTS BECAUSE OF ───────────────────────────────────────
//
// Three surfaces let a reader drag one thing onto another to reorder a list —
// the chart grid, the journal cards, and the section editor's rows — and all
// three had written the same four lines:
//
//     const rest = items.filter((x) => x !== from);
//     rest.splice(rest.indexOf(onto), 0, from);
//
// Each carried a comment claiming the arithmetic was safe because both indices
// are read AFTER the lift. That is true, and it is the answer to a different
// question. Reading the destination after the removal stops the index drifting;
// it does not decide WHICH SIDE of the destination the arrival belongs on, and
// this inserts before it, always.
//
// So a downward drop landed one place short of where it was let go — and the
// commonest downward drop of all, ONTO THE VERY NEXT ITEM, changed nothing at
// all: lift it out, insert it before the thing that is now in its place, and
// the list you get back is the list you started with. The reader drags a chart
// onto the one below it, nothing happens, they drag it two down and it works.
// That is precisely what was reported.
//
// ── THE RULE ─────────────────────────────────────────────────────────────
//
// A DROP TAKES THE TARGET'S PLACE AND PUSHES IT BACK THE WAY YOU CAME. Drag
// something down onto X and it lands AFTER X; drag it up onto X and it lands
// BEFORE X. Both sentences are the same sentence — *the thing you dropped on
// moves aside towards where you dragged from* — and it is the only reading
// under which dropping on your neighbour swaps the two, which is what a reader
// doing it expects to see and the gesture they will try first.
//
// It is still LIFT-AND-INSERT, NOT SWAP, which is what the three comments
// replaced by this one were really defending: dragging a card three places up
// moves it three places rather than trading it with whatever happened to be
// there. Only the adjacent case looks like a swap, and only because with one
// place between them the two descriptions agree.
//
// ── AND IT IS ONE FUNCTION ───────────────────────────────────────────────
//
// One name per idea. Three copies of a four-line splice is three chances to get
// the side wrong, and it went wrong in all three — the journal cards' own test
// even DESCRIBED this rule in its comment while asserting the behaviour that
// broke it. A fourth surface will want this; it should call it rather than
// write it again.
//
// NULL FOR A MOVE THAT CHANGES NOTHING, which is the convention `setPageWide`,
// `applyFlatSections` and `moveCell` already keep: a caller that writes on null
// is a caller that touches a reader's file to leave it identical. Dropping
// something on itself, and naming something that is not in the list, are both
// that answer rather than an error — a drag that ends where it started is a
// reader changing their mind, and that is not a failure to report.
//
// COMPARED BY `===`, so the caller decides what identity means. The two list
// surfaces here hold strings (a chart key, a journal id, a section id); a
// caller holding objects passes their ids and maps back, which is what
// `reorderCharts` does and why this takes no key function.
export function dropOnto<T>(items: readonly T[], from: T, onto: T): T[] | null {
  if (from === onto) return null;
  const fromAt = items.indexOf(from);
  const ontoAt = items.indexOf(onto);
  if (fromAt < 0 || ontoAt < 0) return null;
  const rest = items.filter((x) => x !== from);
  // Read after the lift — the half the old code had right — and then offset by
  // the DIRECTION of the drag, which is the half it did not.
  const at = rest.indexOf(onto);
  rest.splice(fromAt < ontoAt ? at + 1 : at, 0, from);
  // AND THERE IS NO "CHANGED NOTHING" CHECK AFTER THIS, because with the
  // direction right there is nothing left for it to catch: two distinct members
  // of a list, dropped one on the other, always come back in a different order.
  // The version that inserted before the target in both directions DID need one
  // — the adjacent downward drop landed exactly where it started — and a check
  // that quietly absorbed that is part of why it went unnoticed. All three
  // callers hold ids that are unique in their list (a chart key, a journal id, a
  // section instance id), which is what makes "distinct members" true.
  return rest;
}
