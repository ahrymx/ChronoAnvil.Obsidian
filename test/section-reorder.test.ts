// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Changing a group is a change — 4.44.1.
//
// THE REPORT: reorganising in the section editor did not flag as a savable
// action, and adding or removing something was the only way to wake the button
// up. What made it specific to reordering INSIDE a group is that a group is one
// fence: the plan's reorder pass permutes blocks, so a move naming two cells of
// one row was answered with "moves with it. Split the block to move them apart."
// The footer counts ops, that op is a `keep`, and the count was zero.
//
// AND THE WRITE COULD ALREADY DO IT. `regroupFlatNote` has had a phase for the
// order inside a block since 4.8. Nothing was missing at the bottom of this;
// what was missing is that no pass NAMED the change, and the one that refused it
// was speaking for a write that was never going to be asked.
//
// THE SAME SILENCE HAD A SECOND VICTIM: **Start a page here**. `regroup` does
// four things, the pane that reports it could see one of them, and the two it
// could not — the order inside a block, and where its pages begin — are the two
// controls a reader presses and watches nothing happen.
//
// The cases below run the model rather than reading it: what a reorder produces
// is a file, and a file is the thing that was wrong.

import { describe, expect, it } from "vitest";

import { composeHomeNote, homeSectionModel } from "../src/diary/home-sections";
import { cellMoveOps, pageBreakOps } from "../src/core/section-model";
// `keptBlocks` MOVED TO `core/row-order.ts` IN 4.53.0, beside the operations
// that call it and beside `keptPages`, which is the same rule about the other
// bit. The behaviour asserted below is unchanged; only its address is.
import { keptBlocks } from "../src/core/row-order";
import { DEFAULT_PATHS } from "../src/core/constants";
import { readSrc } from "./sources";

const ROOT = DEFAULT_PATHS.diaryRoot;
const model = homeSectionModel(ROOT, "");
const home = (): string => composeHomeNote(ROOT);

// The homepage's own top row, which is the group this release is about: the
// diary card in one column, and three widgets stacked in the other.
const GROUP = ["diary", "launcher", "tasks", "on-this-day"];

// What the editor hands `regroup`: the rows cut into blocks.
const blocks = (order: readonly string[]): string[][] => [
  ["banner"],
  order.filter((id) => GROUP.includes(id)),
  ["journals"],
  ["charts"],
];

const swapped = (a: string, b: string): string[] => {
  const out = [...GROUP];
  const i = out.indexOf(a);
  const j = out.indexOf(b);
  [out[i], out[j]] = [out[j], out[i]];
  return out;
};

// The fence the group lives in, as lines, so a case can say what changed and
// what did not.
const fenceOf = (text: string): string[] => {
  const all = text.split("\n");
  const at = all.indexOf("row");
  const end = all.indexOf("```", at);
  return all.slice(at, end);
};

describe("the plan stops refusing a move that never leaves the block", () => {
  const refusal = (want: readonly string[]): string | undefined =>
    model
      .plan(home(), [...want])
      .find((o) => o.detail?.includes("moves with it"))?.detail;

  it("says nothing about two cells of one row trading places", () => {
    const want = ["banner", ...swapped("launcher", "tasks"), "journals", "charts"];
    expect(refusal(want)).toBeUndefined();
  });

  it("says nothing when the cell that moves is the one that opens the block", () => {
    const want = ["banner", ...swapped("diary", "launcher"), "journals", "charts"];
    expect(refusal(want)).toBeUndefined();
  });

  it("still refuses a move that takes a section THROUGH the block", () => {
    // The refusal was never wrong about this one, and it names the way out. A
    // section landing in the middle of a group is a regroup, not a reorder.
    const want = [
      "banner",
      "diary",
      "launcher",
      "tasks",
      "journals",
      "on-this-day",
      "charts",
    ];
    expect(refusal(want)).toContain("Split the block to move them apart");
  });

  it("emits no `move` of its own either, so one reorder is counted once", () => {
    // The op belongs to the pass that performs it — `layoutOps`, which runs the
    // write and reports what it did. Two passes naming one change would put 2 on
    // the button for one drag.
    const want = ["banner", ...swapped("launcher", "tasks"), "journals", "charts"];
    expect(model.plan(home(), want).filter((o) => o.kind === "move")).toEqual([]);
  });
});

describe("the write reorders the cells and changes nothing else", () => {
  it("puts the cells in the order it was handed", () => {
    const out = model.regroup?.(
      home(),
      blocks(swapped("launcher", "tasks")),
      []
    );
    expect(out).not.toBeNull();
    expect(fenceOf(out as string)).toEqual([
      "row",
      "diary:3",
      "cell",
      "tasks-table",
      "launcher",
      "on-this-day:always",
    ]);
  });

  it("does not turn a stack into a third column", () => {
    // THE BUG PHASE THREE HAD, and it is why this release touches the write at
    // all. The move used a `cell` target, which OPENS a column — so a reorder
    // inside the aside's stack came back as `cell / tasks-table / cell /
    // launcher`, and a page that had two columns had three.
    const out = model.regroup?.(
      home(),
      blocks(swapped("launcher", "tasks")),
      []
    ) as string;
    expect(fenceOf(out).filter((l) => l === "cell")).toHaveLength(1);
    expect(fenceOf(home()).filter((l) => l === "cell")).toHaveLength(1);
  });

  it("moves the opening cell without breaking the row", () => {
    const out = model.regroup?.(
      home(),
      blocks(swapped("diary", "launcher")),
      []
    ) as string;
    expect(fenceOf(out)).toEqual([
      "row",
      "launcher",
      "cell",
      "diary:3",
      "tasks-table",
      "on-this-day:always",
    ]);
  });

  it("leaves every other block of the note byte-identical", () => {
    const out = model.regroup?.(
      home(),
      blocks(swapped("launcher", "tasks")),
      []
    ) as string;
    const untouched = (text: string): string =>
      text
        .split("\n\n")
        .filter((block) => !block.includes("row"))
        .join("\n\n");
    expect(untouched(out)).toBe(untouched(home()));
  });

  it("puts the group back exactly when the reorder is undone", () => {
    const once = model.regroup?.(home(), blocks(swapped("launcher", "tasks")), []) as string;
    expect(model.regroup?.(once, blocks(GROUP), [])).toBe(home());
  });
});

describe("what the dry run reports", () => {
  const ids = (text: string): string[][] =>
    (model.blocks?.(text) ?? []).map((b) => [...b.ids]);
  const label = (id: string): string | undefined =>
    model.sections(home()).find((s) => s.id === id)?.label;

  it("names the reorder, minimally, in the plan's own words", () => {
    const out = model.regroup?.(home(), blocks(swapped("launcher", "tasks")), []) as string;
    const ops = cellMoveOps(ids(home()), ids(out), label);
    expect(ops).toHaveLength(1);
    expect(ops[0].kind).toBe("move");
    expect(ops[0].detail).toBe("moves above On this day");
  });

  it("finds a block whose FIRST cell moved, which is why it matches on members", () => {
    const out = model.regroup?.(home(), blocks(swapped("diary", "launcher")), []) as string;
    const ops = cellMoveOps(ids(home()), ids(out), label);
    expect(ops.map((o) => o.label)).toEqual(["Diary"]);
  });

  it("says nothing when nothing moved", () => {
    expect(cellMoveOps(ids(home()), ids(home()), label)).toEqual([]);
  });

  it("leaves a block that gained or lost a member to the regroup ops", () => {
    // Reported twice, under two different words, is the failure this skip
    // exists to avoid — "Go to joins one block with Diary" already says it.
    const before = [["a", "b", "c"]];
    const after = [["a", "b"], ["c"]];
    expect(cellMoveOps(before, after, (id) => id)).toEqual([]);
  });
});

describe("starting a page inside a group", () => {
  const blocked = (pages: readonly string[]): string | null =>
    model.regroup?.(home(), blocks(GROUP), [...pages]) ?? null;
  const view = (text: string): { ids: string[]; pages: string[] }[] =>
    (model.blocks?.(text) ?? []).map((b) => ({ ids: [...b.ids], pages: [...b.pages] }));
  const label = (id: string): string | undefined =>
    model.sections(home()).find((s) => s.id === id)?.label;

  it("writes the boundary the button asked for", () => {
    // Phase four was never the broken part, and this says so: the `tab` lands
    // above the section that carries the bit, and above nothing else.
    const out = blocked(["tasks"]) as string;
    expect(fenceOf(out)).toEqual([
      "row",
      "diary:3",
      "cell",
      "launcher",
      "tab",
      "tasks-table",
      "on-this-day:always",
    ]);
    expect(view(out)[1].pages).toEqual(["tasks"]);
  });

  it("is named by the dry run, which is what the footer counts", () => {
    // THE WHOLE OF THE BUG. The write worked, the card re-drew with `Page 1` and
    // `Page 2` bands, and Save stayed disabled over "No changes" — because the
    // pane compared which BLOCK each section was in, and a `tab` line moves
    // nothing between blocks.
    const out = blocked(["tasks"]) as string;
    const ops = pageBreakOps(view(home()), view(out), label);
    expect(ops).toHaveLength(1);
    expect(ops[0].kind).toBe("regroup");
    expect(ops[0].label).toBe("Open tasks");
    expect(ops[0].detail).toBe("Open tasks starts a new page of its group");
  });

  it("names the other direction too, because the control is a toggle", () => {
    // "Join the page before" is the only way to unmake a page from this window.
    // A change that can be made and not unmade is half a control.
    const paged = blocked(["tasks"]) as string;
    const ops = pageBreakOps(view(paged), view(home()), label);
    expect(ops.map((o) => o.detail)).toEqual(["Open tasks joins the page before it"]);
  });

  it("names two breaks in the group's own order", () => {
    const out = blocked(["launcher", "on-this-day"]) as string;
    expect(pageBreakOps(view(home()), view(out), label).map((o) => o.label)).toEqual([
      "Go to",
      "On this day",
    ]);
  });

  it("says nothing when the pages did not move", () => {
    expect(pageBreakOps(view(home()), view(home()), label)).toEqual([]);
    const paged = blocked(["tasks"]) as string;
    expect(pageBreakOps(view(paged), view(paged), label)).toEqual([]);
  });

  it("leaves a block that gained or lost a member to the regroup ops", () => {
    const before = [{ ids: ["a", "b", "c"], pages: ["b"] }];
    const after = [{ ids: ["a", "b"], pages: [] }, { ids: ["c"], pages: [] }];
    expect(pageBreakOps(before, after, (id) => id)).toEqual([]);
  });

  it("takes the page back out, leaving the group it found (4.52.1)", () => {
    // 4.34.2's RULE, WITH THE ONE CASE IT COULD NOT SEE. *"The column stays
    // either way: removing a page boundary puts the two sections back beside
    // each other rather than stacking them, because a page break is a column
    // break that was promoted."* True whenever there WAS one to promote — and
    // the boundary above `tasks-table` was not: the homepage stacks those three
    // in one column, so the `tab` was inserted rather than promoted.
    //
    // THIS ASSERTED THE DEMOTION UNTIL 4.52.1 and the demotion was inventing a
    // column. The fence came back with three where the reader had two, and with
    // the cap in place those three are then dealt into two that are not the two
    // they started with — a page added and removed rearranging the homepage.
    //
    // SO THE STRONGEST FORM OF IT IS THE ONE TO ASSERT: byte-for-byte the note
    // that was composed. A boundary a reader can add and remove has to leave
    // nothing behind, and anything weaker than this would pass while a
    // delimiter, an indent or a blank line survived the round trip.
    const paged = blocked(["tasks"]) as string;
    const back = model.regroup?.(paged, blocks(GROUP), []) as string;
    expect(back).toBe(home());
    expect(fenceOf(back)).toEqual([
      "row",
      "diary:3",
      "cell",
      "launcher",
      "tasks-table",
      "on-this-day:always",
    ]);
    expect(model.blocks?.(back)?.[1].pages).toEqual([]);
  });

});

describe("the one bit a reorder could not survive", () => {
  // `joined` is one bit per row — "this row is with the one above it" — and the
  // row that OPENS a block is described by the absence of one. Absence does not
  // travel, so moving the opener handed the write a different arrangement.
  const bitsFor = (rows: readonly string[]): Set<string> =>
    new Set(rows.filter((id) => GROUP.includes(id) && id !== GROUP[0]));

  const groups = (rows: readonly string[], joined: ReadonlySet<string>): string[][] => {
    const out: string[][] = [];
    for (const id of rows) {
      if (out.length && joined.has(id)) out[out.length - 1].push(id);
      else out.push([id]);
    }
    return out;
  };

  const ROWS = ["banner", ...GROUP, "journals", "charts"];

  it("keeps the group together when its first row moves down", () => {
    const rows = ["banner", ...swapped("diary", "launcher"), "journals", "charts"];
    const bits = bitsFor(ROWS);
    // WITHOUT the fix: `launcher` is still flagged as joined, so it joins the
    // BANNER's block, and `diary` opens one of its own. One drag, two wrong
    // blocks — and the banner holds the page title, which nothing may join.
    expect(groups(rows, bits)[0]).toEqual(["banner", "launcher"]);
    expect(groups(rows, keptBlocks(groups(ROWS, bits), rows, bits))).toEqual([
      ["banner"],
      ["launcher", "diary", "tasks", "on-this-day"],
      ["journals"],
      ["charts"],
    ]);
  });

  it("changes nothing for a reorder that does not touch the opener", () => {
    const rows = ["banner", ...swapped("launcher", "tasks"), "journals", "charts"];
    const bits = bitsFor(ROWS);
    expect([...keptBlocks(groups(ROWS, bits), rows, bits)].sort()).toEqual(
      [...bits].sort()
    );
  });

  it("leaves the bits alone when a row is dragged OUT of the block", () => {
    // That reader is regrouping, and the bits are how they say so — restoring
    // boundaries there would undo the gesture.
    const rows = ["banner", "diary", "launcher", "tasks", "journals", "on-this-day", "charts"];
    const bits = bitsFor(ROWS);
    expect(keptBlocks(groups(ROWS, bits), rows, bits)).toEqual(bits);
  });

  it("holds a group of one to no boundary at all", () => {
    expect(keptBlocks([["solo"]], ["solo"], new Set())).toEqual(new Set());
  });
});

describe("the window asks both of them", () => {
  const src = readSrc("section-editor");

  it("restores the boundaries after an arrow and after a drop", () => {
    // Two reorder paths, one rule. A fix in one of them is a window where the
    // arrows are safe and the drag is not.
    //
    // ASSERTED OF THE MODULE THAT OWNS THE RULE, AS OF 4.53.0. The window used
    // to carry two hand-written reorders with a `keptBlocks` call bolted to the
    // end of each, which is exactly the shape that lets a third one be written
    // without it — and the third one was the group card's, which had no reorder
    // at all. Every move now goes through `settle`, so there is one place the
    // boundaries can be restored and no way to add a mover that skips it.
    const order = readSrc("row-order");
    expect(order).toContain("keptBlocks(before, rows, arr.joined)");
    expect(order).toContain("keptPages(before, rows, arr.paged)");
    expect(src).not.toContain("keptBlocks(");
    for (const mover of [
      "moveCell(",
      "moveBlock(",
      "dropCell(",
      "dropBlock(",
    ]) {
      const at = order.indexOf(`export function ${mover}`);
      expect(at, mover).toBeGreaterThan(-1);
      expect(order.slice(at, order.indexOf("\n}", at)), mover).toContain(
        "return settle("
      );
    }
  });

  it("counts what the dry run found, because Save is disabled at zero", () => {
    // Every phase `regroup` has is named by one of these three, which is the
    // property that was missing rather than any one of the calls.
    expect(src).toContain("cellMoveOps(");
    expect(src).toContain("pageBreakOps(was, now, label)");
    expect(src).toContain('o.kind === "move"');
    expect(src).toContain('o.kind === "regroup"');
  });
});
