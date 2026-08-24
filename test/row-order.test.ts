// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Moving rows around a group — 4.53.0.
//
// THE REPORT: *"the group editing controls in the section editor is a buggy
// mess"*, with one case named — a section below a group, moved upward.
//
// WHAT WAS ACTUALLY WRONG is one sentence: the editor held its arrangement as a
// flat list of ids plus one bit per row, and every control moved a row by
// swapping it with its neighbour IN THAT FLAT LIST. A block is a run, a swap is
// blind to where the run ends, and the bit that opens a block is the absence of
// a bit. So the neighbour of the row below a group is the group's LAST CELL, and
// trading places with it left the group's members no longer consecutive with a
// bit now pointing at the arrival. One press: the group the reader had was gone
// and one they had never asked for was in its place.
//
// The same shape produced four more, all of them reachable in two clicks from
// opening the window, and each of them is a case below:
//
//   - moving the group's own first row up swallowed whatever was above it;
//   - **Take out of the group** on a middle cell took the cells after it too,
//     because `joined.delete` does not remove a row from a run, it CUTS the run;
//   - **Break up the group** left the page boundaries behind, so rebuilding the
//     group brought back divisions nobody had asked for twice;
//   - a group could not be moved at all: the card had no controls of its own, so
//     moving one meant pressing an arrow on each member and watching it come
//     apart doing it.
//
// CHECKED HERE RATHER THAN IN THE WINDOW because the window is DOM and
// Obsidian's Modal base, which the suite does not render — and because the rule
// being asserted is not about drawing. `row-order.ts` is the arrangement; the
// editor draws buttons over it. Pressing a button is calling one of these.

import { describe, expect, it } from "vitest";

import {
  blocksOf,
  blockOf,
  breakUp,
  canMoveBlock,
  canMoveRow,
  dropBlock,
  dropCell,
  joinInto,
  joinables,
  keptPages,
  moveBlock,
  moveCell,
  moveRow,
  normalise,
  pagesOf,
  setPage,
  takeOut,
  unitOf,
} from "../src/core/row-order";
import type { Arrangement } from "../src/core/row-order";
import { composeHomeNote, homeSectionModel } from "../src/diary/home-sections";
import { DEFAULT_PATHS } from "../src/core/constants";
import { readSrc } from "./sources";

// The homepage's own shape, which is the arrangement every one of these bugs was
// reported against: a banner, then a group of four, then two rows on their own.
// UPDATED FOR 4.70's HOMEPAGE, AND THE BUGS ARE UNCHANGED BY IT. `upcoming`
// took `on-this-day`'s cell, so the group is still four cells with a lone row
// under it for `journals` to be moved over. What every case here is about — a
// row below a group, moved past it rather than into it — needs exactly that
// shape and does not care which widgets fill it.
//
// THIS IS A SHAPE, NOT THE PAGE. It is one row short of the real homepage,
// which also composes `time-grid` between the group and `journals`; the
// end-to-end block at the bottom of this file reads the composed note and so
// carries that row, and says why it has to.
const ROWS = ["banner", "diary", "launcher", "tasks", "upcoming", "journals", "charts"];
const GROUP = ["diary", "launcher", "tasks", "upcoming"];

const at = (
  rows: readonly string[] = ROWS,
  joined: readonly string[] = GROUP.slice(1),
  paged: readonly string[] = []
): Arrangement => ({
  rows,
  joined: new Set(joined),
  paged: new Set(paged),
});

// A band is every row that may be rearranged. The homepage has one.
const BAND = ROWS;

// What the write would be handed.
const shape = (a: Arrangement | null): string[][] =>
  a ? blocksOf(a.rows, a.joined) : [];

describe("a row below a group moves over it, not into it", () => {
  it("takes one press to get past the whole group", () => {
    // THE REPORT. `journals` sits under a group of four. One Move up used to
    // trade it with `on-this-day` — the group's last cell — and the arrangement
    // that came back was a group of `journals` and `on-this-day` with the rest
    // of the reader's group in pieces above it.
    expect(shape(moveRow(at(), BAND, "journals", -1))).toEqual([
      ["banner"],
      ["journals"],
      GROUP,
      ["charts"],
    ]);
  });

  it("and the group comes through it with the members it had", () => {
    const out = moveRow(at(), BAND, "journals", -1);
    expect(out).not.toBeNull();
    expect(blockOf(out!.rows, out!.joined, "diary")).toEqual(GROUP);
  });

  it("the same going the other way, so a row above a group steps over it", () => {
    expect(shape(moveRow(at(), BAND, "banner", 1))).toEqual([
      GROUP,
      ["banner"],
      ["journals"],
      ["charts"],
    ]);
  });

  it("never lands anything in the middle of a group, however far it travels", () => {
    // The property rather than the case: every row, moved every way, and the
    // group is still four consecutive cells in one block afterwards.
    for (const id of ROWS) {
      for (const delta of [-1, 1]) {
        const out = moveRow(at(), BAND, id, delta);
        if (!out) continue;
        const blocks = shape(out);
        const group = blocks.find((b) => b.length > 1) ?? [];
        expect([...group].sort(), `${id} ${delta}`).toEqual([...GROUP].sort());
      }
    }
  });
});

describe("a cell moves inside its group and cannot leave it", () => {
  it("trades places with the cell beside it", () => {
    expect(shape(moveRow(at(), BAND, "tasks", -1))).toEqual([
      ["banner"],
      ["diary", "tasks", "launcher", "upcoming"],
      ["journals"],
      ["charts"],
    ]);
  });

  it("keeps the group when the cell that moves is the one that opens it", () => {
    // The case `keptBlocks` was written for in 4.44.1, asserted through the
    // control a reader actually presses rather than through the helper.
    expect(shape(moveRow(at(), BAND, "diary", 1))).toEqual([
      ["banner"],
      ["launcher", "diary", "tasks", "upcoming"],
      ["journals"],
      ["charts"],
    ]);
  });

  it("has nowhere to go past either end of the group", () => {
    // NOT A REFUSED MOVE — a disabled arrow. Leaving a group is `takeOut`, which
    // is a button that says so; an arrow that sometimes ejected a cell is the
    // ambiguity this release exists to remove.
    expect(canMoveRow(BAND, at().joined, "diary", -1)).toBe(false);
    expect(canMoveRow(BAND, at().joined, "upcoming", 1)).toBe(false);
    expect(moveRow(at(), BAND, "diary", -1)).toBeNull();
    expect(moveRow(at(), BAND, "upcoming", 1)).toBeNull();
  });

  it("says which of the two things it is, before it is pressed", () => {
    expect(unitOf(BAND, at().joined, "tasks")).toBe("cell");
    expect(unitOf(BAND, at().joined, "journals")).toBe("block");
  });

  it("is not what a row on its own is offered, even asked directly", () => {
    // `moveRow` picks the unit off the arrangement, so the two can never
    // disagree — but the halves are exported and a caller could reach for the
    // wrong one. Each refuses what is not its own kind rather than improvising.
    expect(moveCell(at(), BAND, "journals", -1)).toBeNull();
  });
});

describe("the group itself moves as one thing", () => {
  it("goes down past the row below it", () => {
    expect(shape(moveBlock(at(), BAND, "diary", 1))).toEqual([
      ["banner"],
      ["journals"],
      GROUP,
      ["charts"],
    ]);
  });

  it("is asked of any of its cells, not only the one that opens it", () => {
    // The card's arrows name the block, and the block is the same block
    // whichever member is used to find it.
    expect(shape(moveBlock(at(), BAND, "upcoming", 1))).toEqual(
      shape(moveBlock(at(), BAND, "diary", 1))
    );
  });

  it("stops at the ends of its band", () => {
    const top = moveBlock(at(), BAND, "banner", -1);
    expect(top).toBeNull();
    expect(canMoveBlock(BAND, at().joined, "banner", -1)).toBe(false);
    expect(canMoveBlock(BAND, at().joined, "charts", 1)).toBe(false);
  });

  it("carries its pages with it", () => {
    const a = at(ROWS, GROUP.slice(1), ["tasks"]);
    const out = moveBlock(a, BAND, "diary", 1);
    expect(out).not.toBeNull();
    expect([...out!.paged]).toEqual(["tasks"]);
    expect(pagesOf(blockOf(out!.rows, out!.joined, "diary"), out!.paged)).toEqual([
      ["diary", "launcher"],
      ["tasks", "upcoming"],
    ]);
  });
});

describe("taking one cell out of a group", () => {
  it("does not take the cells after it as well", () => {
    // THE BUG. `joined.delete(id)` does not remove a row from a run — it cuts
    // the run at that row, so the cells below came with it. Taking `launcher`
    // out of a group of four used to leave `diary` alone and a new group of
    // `launcher`, `tasks` and `on-this-day` that the reader never named.
    expect(shape(takeOut(at(), BAND, "launcher"))).toEqual([
      ["banner"],
      ["diary", "tasks", "upcoming"],
      ["launcher"],
      ["journals"],
      ["charts"],
    ]);
  });

  it("leaves through the nearest edge, so the opener lands above the group", () => {
    expect(shape(takeOut(at(), BAND, "diary"))).toEqual([
      ["banner"],
      ["diary"],
      ["launcher", "tasks", "upcoming"],
      ["journals"],
      ["charts"],
    ]);
  });

  it("gives the group a new opener rather than a leading bit", () => {
    const out = takeOut(at(), BAND, "diary");
    expect(out!.joined.has("launcher")).toBe(false);
    expect([...out!.joined].sort()).toEqual(["tasks", "upcoming"]);
  });

  it("ends a group of two rather than leaving one member in one", () => {
    const a = at(["a", "b", "c"], ["b"]);
    expect(shape(takeOut(a, ["a", "b", "c"], "b"))).toEqual([["a"], ["b"], ["c"]]);
  });

  it("takes the row's page break with it, both ways", () => {
    // A row that leaves a group stops opening a page of it, and does not bring
    // one back when it returns. 4.34.2 said this about `takeOut` and nothing
    // said it about the join, so a row put back arrived as a break a second
    // time.
    const a = at(ROWS, GROUP.slice(1), ["tasks"]);
    const out = takeOut(a, BAND, "tasks");
    expect([...out!.paged]).toEqual([]);
    const back = joinInto(out!, out!.rows, "tasks", "diary");
    expect(back && [...back.paged]).toEqual([]);
  });
});

describe("breaking a group up", () => {
  it("gives every member the block it would have had", () => {
    expect(shape(breakUp(at(), BAND, "diary"))).toEqual([
      ["banner"],
      ["diary"],
      ["launcher"],
      ["tasks"],
      ["upcoming"],
      ["journals"],
      ["charts"],
    ]);
  });

  it("takes the pages with it", () => {
    // THE ONE `takeOut` REMEMBERED AND THIS FORGOT. A group that is not a group
    // has no pages; leaving the bits set meant a reader who broke a paged group
    // up and rebuilt it got its old boundaries back unasked.
    const a = at(ROWS, GROUP.slice(1), ["tasks"]);
    expect([...breakUp(a, BAND, "diary")!.paged]).toEqual([]);
  });

  it("says nothing to do for a row that is not in a group", () => {
    expect(breakUp(at(), BAND, "journals")).toBeNull();
  });
});

describe("making a group, and what may be joined to what", () => {
  it("names the block above, not the row above", () => {
    // Where the row above is the last cell of a group, "the row above" is a
    // member of something and the join is into the whole of that something. The
    // control says **Add to group** off exactly this answer.
    expect(joinables(BAND, at().joined, "journals")[0]).toEqual(GROUP);
    // And where both are rows on their own it is the row above, which is the
    // only case the old reading got right.
    expect(joinables(BAND, at().joined, "charts")).toContainEqual(["journals"]);
  });

  it("offers the groups further off as well as the block above", () => {
    // 4.53.2, and the whole of what the icon added. `charts` sits at the bottom
    // with `journals` between it and the group; before this it could join
    // `journals` and nothing else, so getting it into the top row meant walking
    // it up there one arrow at a time.
    expect(joinables(BAND, at().joined, "charts")).toEqual([GROUP, ["journals"]]);
  });

  it("offers a group below to a row that has nothing above it", () => {
    // THE CASE THAT HAD NO ANSWER AT ALL. `banner` opens the band, so "the block
    // above" is nothing and the old control was not drawn — a row at the top of
    // a page could never be put in a group from its own row, whatever was under
    // it. It is the same row the homepage's diary card becomes the moment it is
    // taken out of the top row (4.53.1), so the two patches met here.
    expect(joinables(BAND, at().joined, "banner")).toEqual([GROUP]);
  });

  it("offers nothing where there is no group and nothing above", () => {
    // Still nothing, and it must stay nothing: the icon is not drawn on an
    // empty list. A lone row is NOT offered another lone row further down —
    // that pair is not a group yet, so the answer is to move one under the
    // other, which the arrows already do.
    expect(joinables(["a", "b", "c"], new Set<string>(), "a")).toEqual([]);
  });

  it("offers nothing to a row that is already in a group", () => {
    // Merging two groups is a different operation with a different outcome, and
    // offering it under the words "make a group" is where the two-groups-become-
    // one surprise came from.
    expect(joinables(BAND, at().joined, "tasks")).toEqual([]);
  });

  it("puts the row in the group above it, at the end", () => {
    expect(shape(joinInto(at(), BAND, "journals", "diary"))).toEqual([
      ["banner"],
      [...GROUP, "journals"],
      ["charts"],
    ]);
  });

  it("brings a row up from further down without disturbing what it passes", () => {
    // `charts` is two blocks below the group and arrives as its last column.
    // `journals`, which it steps over, is where it was and is still on its own.
    expect(shape(joinInto(at(), BAND, "charts", "tasks"))).toEqual([
      ["banner"],
      [...GROUP, "charts"],
      ["journals"],
    ]);
  });

  it("arrives at the FRONT when it comes down from above", () => {
    // The nearest edge, which is `takeOut` read backwards. `banner` is above the
    // group, so it opens it — and the cell it displaces gains the bit that says
    // it is a continuation, which is the half of this that a swap would miss.
    const out = joinInto(at(), BAND, "banner", "launcher");
    expect(shape(out)).toEqual([["banner", ...GROUP], ["journals"], ["charts"]]);
    expect(out!.joined.has("banner")).toBe(false);
    expect(out!.joined.has("diary")).toBe(true);
  });

  it("makes take out and put back a round trip", () => {
    // Which is the reason for the nearest-edge rule rather than a nicety. A
    // reader who takes the opener out to look at it and puts it back gets the
    // group they had, not the group with its first column moved to the end.
    const out = takeOut(at(), BAND, "diary");
    expect(shape(out)).toEqual([
      ["banner"],
      ["diary"],
      GROUP.slice(1),
      ["journals"],
      ["charts"],
    ]);
    const back = joinInto(out!, out!.rows, "diary", "launcher");
    expect(shape(back)).toEqual([["banner"], GROUP, ["journals"], ["charts"]]);
  });

  it("says nothing to do when asked for a destination that is not there", () => {
    // A stale answer from a dialog the reader left open: `askJoin` reads the
    // arrangement after the await precisely so this returns null rather than
    // settling something the page no longer describes.
    expect(joinInto(at(), BAND, "journals", "journals")).toBeNull();
    expect(joinInto(at(), BAND, "tasks", "journals")).toBeNull();
    expect(joinInto(at(), BAND, "journals", "nope")).toBeNull();
  });
});

describe("dragging", () => {
  it("moves a block past a group without entering it", () => {
    // Dropped downward onto a cell of the group, so `dropOnto`'s rule puts it
    // after the whole block the cell belongs to.
    expect(shape(dropBlock(at(), BAND, "banner", "tasks"))).toEqual([
      GROUP,
      ["banner"],
      ["journals"],
      ["charts"],
    ]);
  });

  it("reorders cells inside one group", () => {
    expect(shape(dropCell(at(), BAND, "upcoming", "launcher"))).toEqual([
      ["banner"],
      ["diary", "upcoming", "launcher", "tasks"],
      ["journals"],
      ["charts"],
    ]);
  });

  it("refuses a cell drop that would cross out of the group", () => {
    expect(dropCell(at(), BAND, "tasks", "journals")).toBeNull();
    expect(dropCell(at(), BAND, "journals", "tasks")).toBeNull();
  });

  it("says nothing changed for a drop on itself", () => {
    expect(dropBlock(at(), BAND, "journals", "journals")).toBeNull();
    expect(dropCell(at(), BAND, "tasks", "tasks")).toBeNull();
  });
});

describe("the bits stay describable", () => {
  it("drops a bit on a row with nothing above it", () => {
    // One bit says "this row is with the one above it", so a bit on the first
    // row says nothing. `blocksOf` already walks past it; `normalise` stops it
    // being carried into the next move as something that might mean anything.
    const out = normalise(["a", "b"], new Set(["a"]), new Set());
    expect([...out.joined]).toEqual([]);
  });

  it("holds a page break to a row that is in a group", () => {
    const out = normalise(["a", "b"], new Set(), new Set(["b"]));
    expect([...out.paged]).toEqual([]);
  });

  it("keeps a page boundary where it is when two cells swap across it", () => {
    // BY POSITION, exactly as `keptBlocks` restores block boundaries by
    // position. The two cells either side of a boundary trade places, so one
    // crosses it going up and the other going down — which is what a reader
    // watching two rows swap expects. Carrying the bit with the row would move
    // the boundary instead and leave one page holding everything.
    const a = at(ROWS, GROUP.slice(1), ["tasks"]);
    const out = moveRow(a, BAND, "tasks", -1);
    expect(pagesOf(blockOf(out!.rows, out!.joined, "diary"), out!.paged)).toEqual([
      ["diary", "tasks"],
      ["launcher", "upcoming"],
    ]);
  });

  it("leaves the page bits alone when a move changes what is in the block", () => {
    // That reader is regrouping, and the bits are how they say so.
    const before = [["a", "b", "c"]];
    expect(keptPages(before, ["a", "c", "x", "b"], new Set(["c"]))).toEqual(
      new Set(["c"])
    );
  });

  it("toggles a page break and refuses the toggle that changes nothing", () => {
    const a = at();
    expect([...setPage(a, BAND, "tasks", true)!.paged]).toEqual(["tasks"]);
    expect(setPage(a, BAND, "tasks", false)).toBeNull();
    // A row that opens its group cannot open a page of it.
    expect(setPage(a, BAND, "diary", true)).toBeNull();
  });
});

describe("bands are not crossed, whatever moves", () => {
  // A diary entry has three, and a section may not leave the one it is in. The
  // rule is a property of the operation — rows are written back into the slots
  // their own band occupies — rather than a check performed after it.
  const MIXED = ["top", "a", "b", "c"];
  const LOWER = ["a", "b", "c"];

  it("leaves every row outside the band exactly where it was", () => {
    const out = moveBlock(at(MIXED, ["b"]), LOWER, "c", -1);
    expect(out!.rows[0]).toBe("top");
    expect(out!.rows).toEqual(["top", "c", "a", "b"]);
  });

  it("holds an immovable row's slot while the rest arrange around it", () => {
    // The pin, said as an omission: a row that is in no band is in no move, and
    // `restack` writes only the slots the band occupies.
    const out = moveBlock(at(["pin", "a", "b"], []), ["a", "b"], "b", -1);
    expect(out!.rows).toEqual(["pin", "b", "a"]);
  });
});

describe("the file it all comes out as", () => {
  // THE END OF THE PATH. Everything above is an arrangement; what a reader gets
  // is a note. `regroup` is handed the blocks this module produced, and the one
  // outcome that must never happen is a group coming apart in the file because
  // an arrow was pressed next to it.
  const model = homeSectionModel(DEFAULT_PATHS.diaryRoot, "");
  const home = (): string => composeHomeNote(DEFAULT_PATHS.diaryRoot);

  // THE PAGE, WHERE EVERYTHING ABOVE USED A SHAPE. `apply` writes the note the
  // list describes, so a list that is one row short of the homepage does not
  // exercise `regroup` — it deletes a block first and asks about what is left.
  // These are the ids `composeHomeNote` actually writes, in the order it writes
  // them: the group of four, then `time-grid` as a block of its own, then the
  // two lone rows.
  const PAGE = [
    "banner", "diary", "launcher", "tasks", "logbook",
    "time-grid", "journals", "charts",
  ];
  const PAGE_GROUP = ["diary", "launcher", "tasks", "logbook"];
  const at = (): Arrangement => ({
    rows: PAGE,
    joined: new Set(PAGE_GROUP.slice(1)),
    paged: new Set<string>(["logbook"]),
  });
  const BAND = PAGE;

  const fenceOf = (text: string): string[] => {
    const all = text.split("\n");
    const from = all.indexOf("row");
    return all.slice(from, all.indexOf("```", from));
  };

  // THE WINDOW'S OWN TWO PASSES, in the order `commit` runs them: `apply`
  // decides which sections the note has and in what order — which is where a
  // BLOCK moving past another lands — and `regroup` decides which of them share
  // a fence. Asking `regroup` alone would be asking the wrong reconciler and
  // getting a correct "nothing to do" back.
  const written = (out: Arrangement | null): string => {
    const base = model.apply(home(), [...(out?.rows ?? [])]) ?? home();
    return model.regroup?.(base, shape(out), out?.paged ? [...out.paged] : []) ?? base;
  };

  it("writes a row joined from further down into the group's fence", () => {
    // End to end, because the point of 4.53.2 is the file and the arrangement
    // is the easy half: joining from a distance is a MOVE and a bit, and the
    // move has to land inside somebody else's fence rather than beside it.
    //
    // THE TRIP, IN THE PRESSES A READER WOULD MAKE. Take the diary card out of
    // the top row, walk it down past the time grid, then put it back in the
    // group from where it now is — which is two blocks away, and is the press
    // that had no control before this release.
    //
    // `out!.rows` AND NOT `BAND` AFTER THE FIRST PRESS. A band is the rows in
    // the order they are in NOW — the window recomputes it from `this.rows` on
    // every draw — so handing the second press the list the first one started
    // from asks about an arrangement that no longer exists.
    let out = takeOut(at(), BAND, "diary");
    out = moveBlock(out!, out!.rows, "diary", 1);
    out = moveBlock(out!, out!.rows, "diary", 1);
    expect(shape(out)).toEqual([
      ["banner"],
      PAGE_GROUP.slice(1),
      ["time-grid"],
      ["diary"],
      ["journals"],
      ["charts"],
    ]);
    out = joinInto(out!, out!.rows, "diary", "logbook");
    // It came from below, so it arrives as the group's LAST column — the group
    // it left, with its first cell now its fourth, which is what "put it back
    // from over here" honestly means.
    const next = written(out);
    expect(model.blocks?.(next)?.map((b) => b.ids)).toEqual([
      ["banner"],
      [...PAGE_GROUP.slice(1), "diary"],
      ["time-grid"],
      ["journals"],
      ["charts"],
    ]);
  });

  it("moves the row past the group and leaves the fence byte for byte", () => {
    const out = moveRow(at(), BAND, "journals", -1);
    const next = written(out);
    expect(next).not.toBe(home());
    // The group's own fence is untouched: the same four cells in the same two
    // columns, which is what "moved over it" has to mean in the file.
    expect(fenceOf(next)).toEqual(fenceOf(home()));
    expect(model.blocks?.(next)?.map((b) => b.ids)).toEqual([
      ["banner"],
      PAGE_GROUP,
      ["journals"],
      ["time-grid"],
      ["charts"],
    ]);
  });

  it("writes the same group after a move that used to break it", () => {
    // WITHOUT THE FIX the arrangement handed to `regroup` here was a group of
    // `journals` and `on-this-day`, and this note came back with the reader's
    // top row in pieces.
    const next = written(moveRow(at(), BAND, "journals", -1));
    expect(next.split("\n").filter((l) => l === "row")).toHaveLength(1);
    expect(next.split("\n").filter((l) => l === "cell")).toHaveLength(1);
    expect(next.split("\n").filter((l) => l === "tab")).toHaveLength(1);
  });
});

describe("the window is thin over it", () => {
  const editor = (): string => readSrc("section-editor");

  it("keeps no reordering of its own", () => {
    // THE PROPERTY THAT STOPS THIS COMING BACK. Every one of the five bugs above
    // was a hand-written swap or splice in the window with the block bits patched
    // up beside it, which is a shape that lets the sixth be written without them.
    // AFTER THE CONSTRUCTOR, which is the one place the bits are legitimately
    // written: it is reading what the reader's file already says.
    const src = editor();
    const body = src.slice(src.indexOf("  onOpen(): void {"));
    expect(body).not.toContain("private swap(");
    expect(body).not.toMatch(/\[this\.rows\[[a-z]+\], this\.rows\[[a-z]+\]\] =/);
    for (const write of [
      "this.joined.add(",
      "this.joined.delete(",
      "this.paged.add(",
      "this.paged.delete(",
    ]) {
      expect(body, write).not.toContain(write);
    }
    // TWO WRITERS OF `rows` IN THE WHOLE WINDOW, and neither is a reorder:
    // `settle`, which takes what the module returned, and `promptAdd`, which
    // puts a newly staged section in the list. Everything that MOVES one goes
    // through the module.
    expect(body.match(/this\.rows = /g) ?? []).toHaveLength(2);
    expect(body).toContain("this.rows = next.rows;");
  });

  it("takes every change through one place", () => {
    // `settle` is the only writer of the three fields, so a control cannot be
    // added that changes two of them and forgets the third.
    const src = editor();
    expect(src).toContain("private settle(next: NextArrangement | null): void");
    expect(src.match(/this\.settle\(/g) ?? []).toHaveLength(7);
  });

  it("asks what a move will do before drawing the arrow, not after", () => {
    // The sentence on the tooltip is the whole difference between a list a
    // reader can predict and the one that was reported: "Move up past the
    // group" is available only because the unit is decided before the press.
    expect(editor()).toContain("private moveLabel(");
    expect(editor()).toContain("`Move ${where} past the group`");
  });
});
