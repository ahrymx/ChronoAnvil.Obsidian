// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Moving a widget in and out of a row — 4.8 §1's arithmetic.
//
// WHY ALL OF IT IS PURE, for `block-move.test.ts`' reason one level down: the
// drag is a gesture the suite cannot make, but what a drop MEANS is a function
// from (a note, a run of lines, a slot) to a note. The delimiters are the half
// that goes wrong quietly — a `cell` line on the wrong side of an arrival
// renders as two widgets stacked in one column, which looks like a layout bug
// and is a line in a file.

import { describe, expect, it } from "vitest";
import { moveCell, widgetCount, widgetRun } from "../src/core/cell-move";
import { readCode, readCss, readSrc } from "./sources";

// The head class, spelled once so the assertion below cannot drift from it.
const HEAD = "journal-block-head";

// The homepage's shape: a divided row of three, then a titled block, with the
// composer's own spacing throughout.
const PAGE = [
  "`almanac:spacer`",
  "```almanac",
  "row",
  "diary:3",
  "cell",
  "launcher",
  "cell",
  "journals",
  "```",
  "",
  "```almanac",
  "header:⏳ Open tasks",
  "tasks-table:,period",
  "```",
  "",
];

// A row that never divided itself: 4.2's markup, one cell per directive.
const PLAIN = [
  "```almanac",
  "row",
  "diary:3",
  "journals",
  "```",
  "",
  "```almanac",
  "links:home",
  "```",
  "",
];

// The body of block `n`, as the lines between its fences.
const body = (out: string[] | null, n: number): string[] => {
  expect(out).not.toBeNull();
  const fences: string[][] = [];
  let open: string[] | null = null;
  for (const line of out!) {
    if (line.startsWith("```") && line.trim() !== "```") {
      open = [];
      continue;
    }
    if (line.trim() === "```" && open) {
      fences.push(open);
      open = null;
      continue;
    }
    open?.push(line);
  }
  return fences[n];
};

describe("taking a widget out of a row", () => {
  it("gives it a block of its own and leaves the row with the rest", () => {
    const out = moveCell(PAGE, { block: 0, from: 5, to: 6 }, { kind: "block", at: 2 });
    expect(body(out, 0)).toEqual(["row", "diary:3", "cell", "launcher"]);
    expect(body(out, 2)).toEqual(["journals"]);
  });

  it("drops the delimiter that is left opening nothing", () => {
    const out = moveCell(PAGE, { block: 0, from: 5, to: 6 }, { kind: "block", at: 2 });
    // The `cell` line that used to open the third column would otherwise sit at
    // the end of the body saying a cell is there.
    expect(body(out, 0).filter((l) => l === "cell")).toHaveLength(1);
  });

  it("stops calling the block a row once one widget is left", () => {
    const once = moveCell(PAGE, { block: 0, from: 5, to: 6 }, { kind: "block", at: 2 })!;
    const twice = moveCell(once, { block: 0, from: 3, to: 4 }, { kind: "block", at: 3 })!;
    expect(body(twice, 0)).toEqual(["diary:3"]);
  });

  it("puts it where the slot pointed rather than at the end", () => {
    const out = moveCell(PAGE, { block: 0, from: 5, to: 6 }, { kind: "block", at: 0 });
    expect(body(out, 0)).toEqual(["journals"]);
    expect(body(out, 1)).toEqual(["row", "diary:3", "cell", "launcher"]);
  });
});

describe("moving a card inside its row", () => {
  it("re-opens the cell it landed in front of", () => {
    // Third to first. The delimiter goes AFTER the arriving run: the one that
    // used to open the diary's cell now opens the journals', so the added one
    // is what re-opens the diary's.
    const out = moveCell(PAGE, { block: 0, from: 5, to: 6 }, { kind: "cell", block: 0, at: 1 });
    expect(body(out, 0)).toEqual([
      "row",
      "journals",
      "cell",
      "diary:3",
      "cell",
      "launcher",
    ]);
  });

  it("takes the delimiter with it when it lands at the end", () => {
    const out = moveCell(PAGE, { block: 0, from: 1, to: 2 }, { kind: "cell", block: 0, at: 8 });
    expect(body(out, 0)).toEqual([
      "row",
      "cell",
      "launcher",
      "cell",
      "journals",
      "cell",
      "diary:3",
    ]);
  });

  it("refuses a drop on either side of where the card already is", () => {
    expect(moveCell(PAGE, { block: 0, from: 3, to: 4 }, { kind: "cell", block: 0, at: 3 })).toBeNull();
    // The slot after a card names the line below it, which is the same place.
    expect(moveCell(PAGE, { block: 0, from: 3, to: 4 }, { kind: "cell", block: 0, at: 4 })).toBeNull();
  });
});

describe("putting a widget into a row", () => {
  it("carries the block's title in with it and drops the emptied fence", () => {
    const out = moveCell(
      PAGE,
      { block: 1, from: 0, to: 2 },
      { kind: "cell", block: 0, at: 8 }
    );
    expect(body(out, 0)).toEqual([
      "row",
      "diary:3",
      "cell",
      "launcher",
      "cell",
      "journals",
      "cell",
      "header:⏳ Open tasks",
      "tasks-table:,period",
    ]);
    // One block left, and no run of blank lines where the other one was.
    expect(out!.filter((l) => l.startsWith("```almanac"))).toHaveLength(1);
    expect(out!.join("\n")).not.toContain("\n\n\n");
  });

  it("leaves a row that never divided itself undivided", () => {
    const out = moveCell(
      PLAIN,
      { block: 1, from: 0, to: 1 },
      { kind: "cell", block: 0, at: 4 }
    );
    expect(body(out, 0)).toEqual(["row", "diary:3", "journals", "links:home"]);
  });

  it("refuses to move a line between fences of different kinds", () => {
    const mixed = [
      "```almanac",
      "row",
      "diary:3",
      "journals",
      "```",
      "",
      "```almanac-charts",
      "chart: mood",
      "```",
      "",
    ];
    expect(
      moveCell(mixed, { block: 1, from: 0, to: 1 }, { kind: "cell", block: 0, at: 3 })
    ).toBeNull();
  });
});

describe("what it will not do", () => {
  it("refuses a range that names no widget", () => {
    expect(
      moveCell(PAGE, { block: 0, from: 4, to: 5 }, { kind: "block", at: 2 })
    ).toBeNull();
  });

  it("refuses an empty range, and a block that is not there", () => {
    expect(moveCell(PAGE, { block: 0, from: 3, to: 3 }, { kind: "block", at: 2 })).toBeNull();
    expect(moveCell(PAGE, { block: 7, from: 0, to: 1 }, { kind: "block", at: 2 })).toBeNull();
    expect(moveCell(PAGE, { block: 0, from: 3, to: 4 }, { kind: "cell", block: 9, at: 0 })).toBeNull();
  });

  it("leaves every line it did not move exactly as it read it", () => {
    const out = moveCell(PAGE, { block: 0, from: 5, to: 6 }, { kind: "block", at: 2 })!;
    expect(out[0]).toBe("`almanac:spacer`");
    expect(out).toContain("header:⏳ Open tasks");
    expect(out).toContain("tasks-table:,period");
  });
});

// ── the page head, which nothing may move and nothing may join (4.11) ─
//
// THE ARITHMETIC'S HALF OF AN ANSWER THE GEOMETRY ALSO GIVES. `attachBlockHead`
// draws no grip and no slot on the block holding the head, so a reader cannot
// reach any of these. A CALLER can — a command, a layout transfer, a gesture
// written later by someone who read block-drag.ts and not this file — and the
// refusal is worth having where the write is.
describe("the page head is not a source and not a destination", () => {
  // A page as 4.10 composes one: the head first, then a row, then a titled block.
  const HEADED = [
    "`almanac:spacer`",
    "```almanac",
    "title:home,diary,journals",
    "```",
    "",
    "```almanac",
    "row",
    "diary:3",
    "cell",
    "journals",
    "```",
    "",
    "```almanac",
    "header:⏳ Open tasks",
    "tasks-table:,period",
    "```",
    "",
  ];

  it("will not lift it, as a block or as a column", () => {
    // ONE TEST FOR TWO SHAPES, because both are a run containing the directive:
    // the whole body when the block travels, and the one line when it is dropped
    // into somebody else's column.
    expect(
      moveCell(HEADED, { block: 0, from: 0, to: 1 }, { kind: "block", at: 2 })
    ).toBeNull();
    expect(
      moveCell(HEADED, { block: 0, from: 0, to: 1 }, { kind: "cell", block: 1, at: 0 })
    ).toBeNull();
    expect(
      moveCell(HEADED, { block: 0, from: 0, to: 1 }, { kind: "group", block: 2, side: "left" })
    ).toBeNull();
  });

  it("will not put anything in its block, by any of the four merges", () => {
    // `group` makes the head's block a row; `cell`, `stack` and `swap` put
    // something inside one. All four are "something else now lives in the block
    // that holds the page's name".
    const from = { block: 2, from: 1, to: 2 };
    expect(moveCell(HEADED, from, { kind: "group", block: 0, side: "left" })).toBeNull();
    expect(moveCell(HEADED, from, { kind: "group", block: 0, side: "right" })).toBeNull();
    expect(moveCell(HEADED, from, { kind: "cell", block: 0, at: 0 })).toBeNull();
    expect(moveCell(HEADED, from, { kind: "stack", block: 0, at: 0 })).toBeNull();
    expect(moveCell(HEADED, from, { kind: "swap", block: 0, at: 0 })).toBeNull();
  });

  it("will not put a block above it", () => {
    // The same promise `holdPinned` makes in the section editor. Two surfaces
    // must not disagree about which end of the page the name is at.
    expect(
      moveCell(HEADED, { block: 2, from: 1, to: 2 }, { kind: "block", at: 0 })
    ).toBeNull();
  });

  it("still moves everything else on the page", () => {
    // THE REFUSAL MUST NOT SPREAD, which is the assertion that makes the three
    // above worth anything: a page with a head is otherwise an ordinary page.
    const out = moveCell(
      HEADED,
      { block: 2, from: 0, to: 2 },
      { kind: "block", at: 1 }
    );
    expect(out).not.toBeNull();
    expect(out!.join("\n")).toContain("title:home,diary,journals");
    // And the head is still the first fence.
    expect(out!.filter((l) => l.startsWith("```"))[0]).toBe("```almanac");
    expect(out!.indexOf("title:home,diary,journals")).toBeLessThan(
      out!.indexOf("header:⏳ Open tasks")
    );
  });

  it("says nothing about a page that has no head", () => {
    // Every fixture above this line is such a page, and they all still move —
    // asserted directly so a `findIndex` returning -1 cannot start meaning
    // "block -1 is the head".
    expect(
      moveCell(PAGE, { block: 1, from: 1, to: 2 }, { kind: "block", at: 0 })
    ).not.toBeNull();
  });
});

describe("stacking a widget into a column that already has one", () => {
  it("adds no delimiter, so the two share the cell", () => {
    // 4.8.6. A cell has held more than one widget since 4.4 §1 and nothing
    // could put a second one there — every arrival opened a column.
    const out = moveCell(
      PAGE,
      { block: 0, from: 5, to: 6 },
      { kind: "stack", block: 0, at: 3, after: true }
    );
    expect(body(out, 0)).toEqual(["row", "diary:3", "cell", "launcher", "journals"]);
  });

  it("puts it above when that is the half that was pointed at", () => {
    const out = moveCell(
      PAGE,
      { block: 0, from: 5, to: 6 },
      { kind: "stack", block: 0, at: 3, after: false }
    );
    expect(body(out, 0)).toEqual(["row", "diary:3", "cell", "journals", "launcher"]);
  });

  it("writes an undivided row out before stacking into it", () => {
    // In a row with no `cell` line the ABSENCE means one column per directive,
    // so there is no way to say "these two share a column" without saying where
    // every other column divides. Structure only: the row renders as it did.
    const out = moveCell(
      PLAIN,
      { block: 1, from: 0, to: 1 },
      { kind: "stack", block: 0, at: 1, after: true }
    );
    expect(body(out, 0)).toEqual(["row", "diary:3", "links:home", "cell", "journals"]);
  });

  it("carries a widget in from another block and drops the emptied fence", () => {
    const out = moveCell(
      PAGE,
      { block: 1, from: 0, to: 2 },
      { kind: "stack", block: 0, at: 1, after: true }
    );
    expect(body(out, 0)).toEqual([
      "row",
      "diary:3",
      "header:⏳ Open tasks",
      "tasks-table:,period",
      "cell",
      "launcher",
      "cell",
      "journals",
    ]);
    expect(out!.filter((l) => l.startsWith("```almanac"))).toHaveLength(1);
  });

  it("refuses a widget dropped on its own two halves", () => {
    // Every widget's stacking halves point at its own line, so this is the
    // commonest drop a reader makes and it means "I have changed my mind".
    for (const after of [true, false]) {
      expect(
        moveCell(PAGE, { block: 0, from: 5, to: 6 }, { kind: "stack", block: 0, at: 5, after })
      ).toBeNull();
    }
  });
});

describe("swapping two widgets", () => {
  it("trades them, leaving every column with the count it had", () => {
    const out = moveCell(
      PAGE,
      { block: 0, from: 1, to: 2 },
      { kind: "swap", block: 0, at: 5 }
    );
    expect(body(out, 0)).toEqual(["row", "journals", "cell", "launcher", "cell", "diary:3"]);
  });

  it("works across two blocks, and takes the bar with the widget", () => {
    const out = moveCell(
      PAGE,
      { block: 1, from: 0, to: 2 },
      { kind: "swap", block: 0, at: 3 }
    );
    expect(body(out, 0)).toEqual([
      "row",
      "diary:3",
      "cell",
      "header:⏳ Open tasks",
      "tasks-table:,period",
      "cell",
      "journals",
    ]);
    expect(body(out, 1)).toEqual(["launcher"]);
  });

  it("is undone by repeating it", () => {
    const once = moveCell(PAGE, { block: 0, from: 1, to: 2 }, { kind: "swap", block: 0, at: 5 })!;
    const twice = moveCell(once, { block: 0, from: 1, to: 2 }, { kind: "swap", block: 0, at: 5 })!;
    expect(twice).toEqual([...PAGE]);
  });

  it("refuses a widget dropped on itself, and a range that overlaps", () => {
    expect(moveCell(PAGE, { block: 0, from: 3, to: 4 }, { kind: "swap", block: 0, at: 3 })).toBeNull();
    expect(moveCell(PAGE, { block: 1, from: 0, to: 2 }, { kind: "swap", block: 1, at: 1 })).toBeNull();
  });

  it("refuses a target that is not a widget", () => {
    expect(moveCell(PAGE, { block: 0, from: 1, to: 2 }, { kind: "swap", block: 0, at: 2 })).toBeNull();
  });
});

describe("what a whole block offers a row", () => {
  it("refuses a block that titles itself", () => {
    // THIS INVERTS A CASE THAT PASSED FOR FOUR RELEASES, and the case was not
    // wrong about the arithmetic — it was wrong about the page. `widgetRun`
    // accepted `header:` + one widget and handed back the bar with its widget,
    // so the drop wrote both into a cell. Then `NOT_A_CELL` refused the bar as
    // cell content at render, `layOutRow` inserted the group at the first CELL
    // child's index, and the bar came out BELOW the group it was meant to title
    // — with the other column's bar appearing to title the whole thing and
    // `HeaderBar`'s sibling walk folding all of it. The file was fine and the
    // page was wrong, which is why nothing here caught it.
    //
    // 4.12 §A: a section is not a widget. What a block gives a row is a widget
    // and nothing that draws a title over it.
    expect(widgetRun(["header:⏳ Open tasks", "tasks-table:,period"])).toBeNull();
  });

  it("refuses a bare header: too, which is looser than the grammar's own test", () => {
    // `parseFrame`'s contradiction needs a NAMED bar — an untitled `header:`
    // does not compete with `frame: section` for the title. This refusal is not
    // about naming: an untitled bar still renders `.journal-sec`, is still
    // evicted by `NOT_A_CELL`, and still lands below the group. So
    // `hasSectionBar` is deliberately looser than `hasTitledBar`, and this is
    // the case that says so.
    expect(widgetRun(["header:", "tasks-table"])).toBeNull();
  });

  it("refuses a frame: section block, whose modifier would stay behind", () => {
    // Worse than the header case rather than the same: the run is the CONTENT
    // span, and `frame:` is not content — so a `frame: section` block hands over
    // its widget bare and keeps the modifier with the fence it is emptying. The
    // section loses its bar, its title and its fold in one move.
    expect(widgetRun(["frame: section", "tasks-table"])).toBeNull();
  });

  it("leaves the modifier behind with the fence it describes", () => {
    // `frame: none` is a fact about the block being emptied, not about the
    // widget leaving it — carrying one into a row would restyle the row.
    expect(widgetRun(["frame: none", "links:home"])).toEqual({ from: 1, to: 2 });
  });

  it("refuses a block holding two widgets", () => {
    // Not because it is hard: because putting them in a row means deciding
    // whether they are one column or two, and nobody has asked the reader.
    expect(widgetRun(["diary:3", "journals"])).toBeNull();
    expect(widgetRun(["row", "diary:3", "journals"])).toBeNull();
  });

  it("refuses a modifier caught between two content lines", () => {
    expect(widgetRun(["header:x", "frame: none", "links:home"])).toBeNull();
  });

  it("leaves a height behind too (4.22 §5.3)", () => {
    // A WHOLE BLOCK DRAGGED INTO A CELL. `HEIGHT_KEYWORD` is in `STRUCTURE`, so
    // `isContent` says no and the content span stops short of it — which is the
    // promise this file already makes about modifiers, and correct here for the
    // same reason: a height describes a CARD, and the fence being emptied has
    // none. The height that must travel is the one above a widget already inside
    // a group, and `runWithHeight` carries that one.
    expect(widgetRun(["height: 240", "links:home"])).toEqual({ from: 1, to: 2 });
    expect(widgetRun(["height: 240"])).toBeNull();
  });
});

describe("what a block keeps when a widget leaves it (4.22 §5.4)", () => {
  // `pruned` is not exported — it is reached through `moveCell`, which is where
  // the property actually matters: what the reader is left looking at.
  const GROUP = [
    "```almanac",
    "row",
    "diary:3",
    "cell",
    "height: 240",
    "on-this-day:always",
    "```",
    "",
  ];

  it("drops a height that has stopped sizing anything", () => {
    // The widget under it went to a block of its own and took its height with
    // it. Nothing must be left describing a card that is not there.
    const out = moveCell(
      GROUP,
      { block: 0, from: 3, to: 5 },
      { kind: "block", at: 1 }
    );
    expect(out).not.toBeNull();
    const left = (out ?? []).slice(0, (out ?? []).indexOf("```") + 1);
    expect(left).not.toContain("height: 240");
  });

  it("drops them with the row, because a card is only drawn inside one", () => {
    // A ROW OF ONE IS NOT A ROW, so the `row` line goes — and with no row there
    // are no cards, so a height left here would draw `parseHeights`' refusal on a
    // block the reader never touched.
    const out = moveCell(
      GROUP,
      { block: 0, from: 1, to: 2 },
      { kind: "block", at: 1 }
    );
    expect(out).not.toBeNull();
    const left = (out ?? []).slice(0, (out ?? []).indexOf("```") + 1);
    expect(left).not.toContain("row");
    expect(left).not.toContain("height: 240");
  });
});

describe("the gesture that reaches this", () => {
  const src = readSrc("block-drag");

  it("speaks one type per shape the drag may take", () => {
    // A column and a block are different shapes of the same move, and a source
    // offers one, the other or both. The type is what a slot reads during
    // `dragover` — it cannot read the data — so a slot declines before the
    // reader has committed rather than on drop.
    expect(src).toContain('const CELL_TYPE = "text/almanac-cell"');
    expect(src).toContain('const BLOCK_TYPE = "text/almanac-block"');
    // ONE `dragstart`, because there is one way to pick something up. Two
    // sources feed it — a widget in a cell, and a block — and they differ in
    // which types they set rather than in how they start.
    expect(src.match(/addEventListener\("dragstart"/g) ?? []).toHaveLength(1);
    const at = src.indexOf('addEventListener("dragstart"');
    const body = src.slice(at, at + 900);
    expect(body).toContain("evt.dataTransfer?.setData(BLOCK_TYPE, payload)");
    expect(body).toContain("if (at.cell) evt.dataTransfer?.setData(CELL_TYPE, payload)");
  });

  it("carries a range per shape, because the answer depends on where it lands", () => {
    // A block dropped onto another block moves its WHOLE body, modifiers and
    // all. The same block dropped into a column moves only the widget and the
    // bar over it, because a `frame:` or `row` line describes the block being
    // emptied rather than the widget leaving it.
    expect(src).toContain("whole: { from: number; to: number }");
    expect(src).toContain("cell?: { from: number; to: number }");
    // The slot that accepted the drag is the one that picks.
    expect(src).toContain("slot(container, `jbd-slot-above${edge}`, BLOCK_TYPE, (p) => p.whole");
    expect(src).toContain('slot(child, "jbd-slot-before", CELL_TYPE, (p) => p.cell');
    // A block holding two widgets has no cell range, which is what withholds
    // `CELL_TYPE` and with it every column slot on the page.
    expect(src).toContain("cell: widgetRun(body) ?? undefined");
  });

  it("will not carry a card across a split into another note", () => {
    // A block index means nothing outside the file it was counted in. Two notes
    // open side by side would otherwise let a card name whichever block of the
    // OTHER note happened to have that number — and move it.
    expect(src).toContain("if (p.path !== path) return null;");
    expect(src).toContain("readPayload(evt, ctx.sourcePath)");
  });

  it("stops a slot's drop from also reaching the block under it", () => {
    // A slot sits inside a block that is itself a drop target for the other
    // gesture. Without this a drag carrying both types lands twice — once as a
    // cell and once as a swap.
    const at = src.indexOf("const slot = (");
    expect(at).toBeGreaterThan(-1);
    const rule = src.slice(at, src.indexOf("// ABOVE AND BELOW", at));
    expect(rule).toContain("evt.stopPropagation()");
  });

  it("asks where a slot points at the drop rather than at the render", () => {
    // `indexNow`'s lesson, one level down: a block's index and its body length
    // are both facts about a file that every drop rewrites.
    const at = src.indexOf("slot(container, `jbd-slot-above${edge}`");
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 400)).toContain("indexNow()");
    expect(src).toContain("const dst = where();");
  });

  it("keeps a block's slots to itself, and puts them away again", () => {
    // `dragleave` fires when the pointer crosses into a child, so an
    // unconditional clear would close the slots at the moment the reader
    // reaches for one.
    expect(src).toContain("container.contains(to)");
    // And a drag abandoned over a block it did not start on has no `dragend`
    // to hear, so the first pointer movement afterwards clears up.
    const at = src.indexOf('addEventListener("mouseover"');
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 200)).toContain('removeClass("is-slotting")');
  });
});

describe("which line drew which widget", () => {
  const widgets = readCode("widgets");

  it("keeps the file's own numbering, not the loop's", () => {
    // The filter drops comments, blanks and the modifiers, so the loop's index
    // is a different number on any fence that has one of those in it — and
    // writing the wrong one moves the wrong widget.
    //
    // ONE MORE FILTER IN 4.51.1 and the property is unchanged, which is the
    // point of asserting `.at` rather than the list's name: a suppressed banner
    // drops MORE lines, and each survivor still carries the number it had in
    // the file. A filter that rebuilt the index instead of carrying it is the
    // failure this row is for.
    expect(widgets).toContain("const lineAt = drawable.map((k) => k.at)");
    expect(widgets).toContain("drawn.push({ at: container.childElementCount");
  });

  it("stamps before either the cards or the row move anything", () => {
    const stamp = widgets.indexOf("stampLines(container, drawn");
    const card = widgets.indexOf("for (const { el, title } of named) cardWidget");
    const row = widgets.indexOf("layOutRow(");
    expect(stamp).toBeGreaterThan(-1);
    expect(stamp).toBeLessThan(card);
    expect(stamp).toBeLessThan(row);
  });

  it("hands the stamp to the card built around the widget", () => {
    // The card is what a reader grabs, so the card is what has to know which
    // line it is.
    const src = readSrc("block-drag");
    const at = src.indexOf("export function cardWidget");
    expect(src.slice(at, src.indexOf("\n}", at))).toContain("setAttribute(LINE_ATTR");
  });
});

describe("the landing places, as drawn", () => {
  const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
  // The declarations of the rule this selector opens. Sliced from the BRACE
  // rather than from the selector, so an anchor that reaches back past the
  // previous rule's `}` still reads the right block.
  const ruleFor = (sel: string): string => {
    const at = rules.indexOf(sel);
    expect(at, `no rule for ${sel}`).toBeGreaterThan(-1);
    const open = rules.indexOf("{", at);
    return rules.slice(open, rules.indexOf("}", open));
  };

  it("takes no space, so nothing moves under the pointer", () => {
    const rule = ruleFor(".jbd-slot {");
    expect(rule).toContain("position: absolute");
    // Drawn only while something is in the air — the rule the grip follows.
    expect(rule).toContain("display: none");
  });

  it("is a target a hand can find, not a bar you must hit", () => {
    // WHAT A VAULT REPORTED AS *"drag and drop does not work at all"*: the first
    // version made the hit area and the indicator the same 18px, half of it
    // outside the block, revealed only once the pointer was already inside. The
    // column slots were 18px wide in a 10px gap, which is worse.
    //
    // The hit area is now half a block or half a column; the 3px bar is drawn by
    // `::after`. Generosity in the target, precision in the drawing.
    // A block's two halves, and a widget's five parts — each a share of what it
    // is drawn on rather than a number of pixels.
    expect(ruleFor(".jbd-slot-above,")).toMatch(/height: 50%/);
    for (const sel of [".jbd-slot-before,", ".jbd-slot-over,", ".jbd-slot-swap {"]) {
      expect(ruleFor(sel), sel).toMatch(/\d+%/);
    }
    expect(rules).toContain(".jbd-slot::after {");
    // And no fixed pixel size is left on either — that was the fault. (The row
    // block's edge bands are the one deliberate exception; see `jbd-slot-edge`.)
    expect(ruleFor(".jbd-slot-above,")).not.toMatch(/height: \d+px/);
    expect(ruleFor(".jbd-slot-before,")).not.toMatch(/width: \d+px/);
  });

  it("tiles what it covers, so no point on a block means nothing", () => {
    // Above and below halve the block; before and after halve each column and
    // sit above them, which is what makes the middle of a row mean "this
    // column" while its top and bottom edges still mean "out of the row".
    expect(ruleFor(".jbd-slot-above {")).toContain("top: 0");
    // Anchored on the previous rule's brace: `.jbd-slot-below` also appears as
    // the second selector of the pair's shared rule, and that one carries the
    // height rather than the offset.
    expect(ruleFor("}\n.jbd-slot-below {")).toContain("top: 50%");
    expect(ruleFor("}\n.jbd-slot-before {")).toContain("left: 0");
    expect(ruleFor("}\n.jbd-slot-after {")).toContain("right: 0");
    // TWO PER CELL, not one at each end of the row: a cell's right half names
    // the boundary after it, which is the gap the first version left open.
    const src = readSrc("block-drag");
    const at = src.indexOf("cells.forEach((cell, n)");
    expect(at, "the row is not tiled").toBeGreaterThan(-1);
    const body = src.slice(at, src.indexOf("── WHAT CAN BE PICKED UP", at));
    expect(body).toContain("jbd-slot-before");
    expect(body).toContain("jbd-slot-after");
    expect(body).toContain("opens[n + 1]");
  });

  it("keeps the two kinds of target off each other's ground", () => {
    // THE BUG A VAULT FOUND: *"drag works for the row on the homepage, but not
    // outside."* Both kinds were drawn on a row block, and the block's own slots
    // painted over every cell slot — so a drag they DECLINE (a block being
    // carried into a row) was declined across the whole row, with the slots that
    // would have taken it sitting underneath, unreachable.
    //
    // IT IS NOT A `z-index` MISTAKE, which is why the fix is structural.
    // `container-type: inline-size` is on the cell (4.2 §2) and implies layout
    // containment, layout containment creates a stacking context, and a
    // `z-index` inside one cannot rise above anything outside it. No ordering of
    // the two numbers could have worked.
    const src = readSrc("block-drag");
    // On a row block the block's own slots become 16px bands along its edges —
    // the block's padding, which is the strip visibly outside the row — and the
    // cells tile everything between them.
    expect(src).toContain('const edge = row ? " jbd-slot-edge" : ""');
    // A share of the block with a floor and a ceiling — it was a flat 16px,
    // which is the block's own padding and about a fingertip.
    expect(ruleFor(".jbd-slot-edge {")).toContain("clamp(");
    expect(ruleFor(".jbd-slot-edge {")).toContain("z-index: 5");
    expect(ruleFor(".jbd-slot-before,")).toContain("top: 0");
    expect(ruleFor(".jbd-slot-before,")).toContain("bottom: 0");
  });

  it("keeps the grip out of anything that can be hidden", () => {
    // THE OTHER HALF OF THE SAME REPORT: *"the bottom-most sections are missing
    // their drag icons."* The grip used to sit inside the block's head, and a
    // head is `display: none` on a block inside a section run and on an unframed
    // one — so every block under a section header lost its grip.
    const src = readSrc("block-drag");
    const at = src.indexOf("function attachGrip(");
    const fn = src.slice(at, src.indexOf("\n}", at));
    expect(fn).not.toContain(HEAD);
    expect(fn).toContain("host.createDiv(");
    expect(fn).toContain('host.addClass("jbd-host")');
  });

  it("puts one grip on a thing however many times it is asked", () => {
    // From a vault: *"the drag icon can also duplicate for new widgets/sections
    // moved into the block."* A drop rewrites the note, the block re-renders,
    // and a widget whose element Obsidian reuses arrives already wearing one.
    const src = readSrc("block-drag");
    const at = src.indexOf("function attachGrip(");
    const fn = src.slice(at, src.indexOf("\n}", at));
    expect(fn).toContain("?.remove()");
    expect(fn.indexOf("?.remove()")).toBeLessThan(fn.indexOf("host.createDiv("));
  });

  it("hangs a group's own grip in its foot, and keeps nothing of the dodge", () => {
    // Every grip is centred over the top edge of what it drags, so on a row of
    // three the block's and the middle widget's landed on the same two
    // coordinates. 4.8.6 shoved the block's aside; 4.9 §2.2 gives it the group's
    // foot instead — the box's own edge, with nothing else on it — so the
    // collision cannot arise rather than being stepped around.
    const src = readSrc("block-drag");
    expect(src).toContain("const foot = box?.querySelector<HTMLElement>");
    expect(src).toContain('foot ? "Drag to move this group" : "Drag to move this block"');
    expect(ruleFor(".journal-group-foot > .jbd-handle {")).toContain("left: 0");
    // AND THE EXCEPTION IS GONE FROM BOTH SIDES. A rule kept "just in case"
    // after the thing it worked around has been removed is the kind nobody can
    // re-derive and nobody dares delete.
    //
    // THE USE, NOT THE WORD. Both files still explain the deletion in a comment,
    // which is the record of why the foot is where it is; what must not survive
    // is the class being applied or styled. `rules` has its comments stripped.
    expect(src).not.toContain('addClass("jbd-aside")');
    expect(rules).not.toContain(".jbd-aside");
  });

  it("dims the box, not the strip the grip sits in", () => {
    // The grip is positioned against the thing it drags, and for a group that
    // thing is the BOX while the grip lives in the foot. A 14px strip going half
    // transparent on its own says nothing about what is moving.
    const src = readSrc("block-drag");
    const at = src.indexOf("dim: HTMLElement = host");
    expect(at).toBeGreaterThan(-1);
    expect(src).toContain('dim.addClass("is-dragging")');
    expect(src).not.toContain('host.addClass("is-dragging")');
  });

  it("draws five places on a widget in a row, not one", () => {
    // 4.8.6: *"inserting is only possible in a new column right now, which is
    // half-baked."* A cell has held more than one widget since 4.4 §1 and every
    // arrival opened a column. The five read outward — edges are the row, the
    // middle is the widget.
    for (const sel of ["before", "after", "over", "under", "swap"]) {
      expect(readSrc("block-drag"), sel).toContain(`"jbd-slot-${sel}"`);
    }
    // The middle is the largest of the five, because a swap is the one drop
    // that needs no aim.
    expect(ruleFor(".jbd-slot-before,")).toContain("width: 20%");
    expect(ruleFor(".jbd-slot-over,")).toContain("height: 20%");
    // And its mark is a ring rather than a bar: a bar says which side of a line
    // the arrival goes, and a swap has no side.
    expect(ruleFor(".jbd-slot-swap::after {")).toContain("border");
  });

  it("refuses the two places a block is already in", () => {
    // THE BUG A VAULT FOUND: *"the Trends section on the homepage doesn't seem
    // to like to be moved (only the homepage instance)."* Trends is the last
    // block of the homepage; the block above it is Journals; and "below
    // Journals" is where Trends already is. `moveCell` returned null, nothing
    // was written, and the block appeared to refuse to move.
    //
    // NOTHING WAS WRONG WITH THE ARITHMETIC. The fault is that a slot which
    // cannot do anything still lit up and still took the drop — `empty.ts`'s
    // "nothing dead is drawn", applied to a landing place.
    const src = readSrc("block-drag");
    expect(src).toContain("const noop = (at: number | null): boolean =>");
    // AND IT FAILS OPEN. A slot that cannot work out its own index declines
    // nothing — a refusal computed from a missing answer is how one uncertain
    // block turns into a page where nothing can be dropped at all.
    expect(src).toContain("at !== null &&");
    // Asked before the slot lights up, not on drop.
    const at = src.indexOf("if (!live()) return;");
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 120)).toContain("evt.preventDefault()");
    // And only for a whole block: a WIDGET dropped below its own block has left
    // its row, which is a real change.
    expect(src).toContain("inFlight.whole &&");
  });

  it("opens a block's landing places for either shape of drag", () => {
    // THE BUG A VAULT REPORTED TWICE. This condition read `CELL_TYPE` alone,
    // from when a cell was the only thing a drag could be. 4.8.5 gave a whole
    // block its drag back under a type of its own, and a block that cannot
    // become a column sets ONLY that type — so dragging one added `is-slotting`
    // nowhere, no slot was ever displayed, and nothing could be dropped
    // anywhere on the page.
    //
    // The homepage's Trends fence is the clearest case: a `header:` line and no
    // charts, so `widgetRun` withholds the cell range and it was the one block
    // on that page that could not be moved.
    const src = readSrc("block-drag");
    const at = src.indexOf('container.addEventListener("dragover"');
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, src.indexOf("});", at));
    expect(body).toContain("CELL_TYPE");
    expect(body).toContain("BLOCK_TYPE");
  });

  it("asks a block's index once per drag, not once per pointer movement", () => {
    // `dragover` fires on every movement, and `indexNow` segments the whole
    // note twice. Sixty times a second, on every block the pointer crosses, is
    // enough to make the gesture feel as though it is refusing to work.
    const src = readSrc("block-drag");
    expect(src).toContain("if (cached?.seq !== dragSeq)");
    expect(src).toContain("dragSeq++");
    // The two callbacks that run per event use the cached answer.
    expect(src).toContain("() => !noop(indexInDrag())");
  });

  it("draws a grip on every block, wherever the page is", () => {
    // 4.8.5, from a vault: *"the 02 diary dashboard's sections can only be moved
    // from the section editor and the grips are missing."* A page with no row
    // had no sources and no targets — the gesture was homepage-only by accident
    // of where rows happen to be composed.
    const src = readSrc("block-drag");
    // UNCONDITIONALLY, which is the whole of what 4.8.5 restored: the call is
    // not inside any `if`, and the only thing 4.9 changed is WHERE the grip
    // hangs — `foot ?? container`, so a block with no group still gets its own.
    expect(src).toContain("source(\n    foot ?? container,");
    expect(rules).not.toContain(".jbd-handle-join");
  });
});

describe("making a group out of two blocks", () => {
  // Two plain widgets, each in its own fence — which is what the gesture is
  // aimed at as of 4.12 and what the homepage is actually made of.
  //
  // THIS FIXTURE USED TO CARRY A `header:` OVER EACH WIDGET, because that is
  // what a dashboard is made of, and the whole describe was pinning the corrupt
  // page §A exists to close. The titled version now lives one describe down as
  // a refusal, which is the honest place for it: the shape is still what a
  // dashboard writes, and it is still not a group.
  const TWO = [
    "```almanac",
    "tag-index",
    "```",
    "",
    "```almanac",
    "tasks-table:,period",
    "```",
    "",
  ];

  it("puts the arrival beside what the target already held", () => {
    // THE SHAPE IS `composeFlatNote`'S, WHICH IS THE POINT. That function has
    // built a joined row as `row` / first / `cell` / second since 4.8, and the
    // section editor's **Make a group** produces exactly it. Two ways of making
    // one object must write one file, or a reader who uses both gets two
    // spellings of the same page.
    const out = moveCell(TWO, { block: 1, from: 0, to: 1 }, {
      kind: "group",
      block: 0,
      side: "right",
    });
    expect(body(out, 0)).toEqual([
      "row",
      "tag-index",
      "cell",
      "tasks-table:,period",
    ]);
    // AND THE SOURCE FENCE IS GONE, with the blank line that separated it —
    // `pruned` returns null for a body with nothing left in it, which is
    // `applyLayout`'s manners and the reason a page's rhythm survives a drag.
    expect(out?.filter((l) => l === "```almanac").length).toBe(1);
  });

  it("puts it on the other side when the other side is asked for", () => {
    const out = moveCell(TWO, { block: 1, from: 0, to: 1 }, {
      kind: "group",
      block: 0,
      side: "left",
    });
    expect(body(out, 0)).toEqual([
      "row",
      "tasks-table:,period",
      "cell",
      "tag-index",
    ]);
  });

  it("leaves a modifier at the top, above the row line", () => {
    // `frame:` describes the block and is read before the loop, so where it sits
    // does not change what it does — but it is the reader's line and it goes
    // where `docs/reference.md` shows it, not wherever a splice happened to put
    // it. A `row` line buried under a directive is a fence nobody can scan.
    const framed = [
      "```almanac",
      "frame: none",
      "tag-index",
      "```",
      "",
      "```almanac",
      "tasks-table",
      "```",
      "",
    ];
    expect(
      body(moveCell(framed, { block: 1, from: 0, to: 1 }, { kind: "group", block: 0, side: "right" }), 0)
    ).toEqual(["frame: none", "row", "tag-index", "cell", "tasks-table"]);
  });

  it("refuses a target that is already a group", () => {
    // A group has column slots of its own, which say exactly where an arrival
    // goes. A SIDE cannot: it would have to name a boundary the reader did not
    // point at. The gesture withholds the quarters from a row block, and this is
    // the arithmetic saying the same thing.
    expect(
      moveCell(PAGE, { block: 1, from: 0, to: 2 }, { kind: "group", block: 0, side: "left" })
    ).toBeNull();
  });

  it("refuses to make a group out of one block and itself", () => {
    expect(
      moveCell(TWO, { block: 0, from: 0, to: 1 }, { kind: "group", block: 0, side: "left" })
    ).toBeNull();
  });

  it("refuses a destination that titles itself, which is the other end of §A", () => {
    // THE REFUSAL THE SOURCE ONE DOES NOT COVER. `widgetRun` stops a titled
    // block being dragged INTO a column; this stops a plain widget being dropped
    // ONTO a titled block's quarter, which reaches the same corrupt page from
    // the other end. Both are needed, and `block-drag.ts` withholds the quarters
    // so a reader never gets far enough to meet either.
    const titled = [
      "```almanac",
      "header:🏷️ Tags",
      "tag-index",
      "```",
      "",
      "```almanac",
      "tasks-table:,period",
      "```",
      "",
    ];
    expect(
      moveCell(titled, { block: 1, from: 0, to: 1 }, { kind: "group", block: 0, side: "right" })
    ).toBeNull();
    // And a `frame: section` destination, whose modifier the arrival would sit
    // under while the bar it names is drawn for the whole group.
    const framed = [
      "```almanac",
      "frame: section",
      "journals",
      "```",
      "",
      "```almanac",
      "tasks-table:,period",
      "```",
      "",
    ];
    expect(
      moveCell(framed, { block: 1, from: 0, to: 1 }, { kind: "group", block: 0, side: "right" })
    ).toBeNull();
  });

  it("refuses to cross fence kinds", () => {
    // `almanac-charts` holds chart specs and `almanac` holds directives; a line
    // that crosses between them is a widget the block cannot render, and the
    // reader would see a broken card rather than a refusal.
    const mixed = [
      "```almanac",
      "tag-index",
      "```",
      "",
      "```almanac-charts",
      "activity",
      "```",
      "",
    ];
    expect(
      moveCell(mixed, { block: 1, from: 0, to: 1 }, { kind: "group", block: 0, side: "right" })
    ).toBeNull();
  });

  it("declines a block that has nothing to show", () => {
    const hollow = ["```almanac", "frame: none", "```", "", "```almanac", "tag-index", "```", ""];
    expect(
      moveCell(hollow, { block: 1, from: 0, to: 1 }, { kind: "group", block: 0, side: "right" })
    ).toBeNull();
  });
});

describe("a leading delimiter, which is the one that carries a width", () => {
  it("survives the tidy that removes the ones opening nothing", () => {
    // `tidyCells` drops a delimiter that opens no column, and a LEADING one
    // opens no run — what it leaves behind is its WEIGHT, which is the whole
    // spelling that makes the first column widenable. `opensSomething` scans
    // forward to the next widget, so `cell: 2` above `diary:3` is kept; a rule
    // that looked only at what was immediately after it would take the width off
    // the first column on the next unrelated move.
    const wide = [
      "```almanac",
      "row",
      "cell: 2",
      "diary:3",
      "cell",
      "launcher",
      "cell",
      "journals",
      "```",
      "",
    ];
    // Take the last column out to a block of its own, which runs `pruned` and
    // `tidyCells` over what is left.
    const out = moveCell(wide, { block: 0, from: 6, to: 7 }, { kind: "block", at: 1 });
    expect(body(out, 0)).toEqual(["row", "cell: 2", "diary:3", "cell", "launcher"]);
  });

  it("is kept because of what it opens, not because of what follows it", () => {
    // THE READING THAT HAS TO BE A SCAN. `opensSomething` looks FORWARD to the
    // next widget rather than at the next line, because a `header:` bar is not a
    // column (row.ts, `NOT_A_CELL`) — so a delimiter with a bar under it is
    // still looking for its cell. A next-line reading gives the same answer on
    // every fixture without a bar in it, which is why this one has two.
    const barred = [
      "```almanac",
      "row",
      "cell: 3",
      "header:🏷️ Tags",
      "tag-index",
      "cell",
      "header:⏳ Open tasks",
      "tasks-table",
      "cell",
      "journals",
      "```",
      "",
    ];
    const out = moveCell(barred, { block: 0, from: 8, to: 9 }, { kind: "block", at: 1 });
    expect(body(out, 0)).toEqual([
      "row",
      "cell: 3",
      "header:🏷️ Tags",
      "tag-index",
      "cell",
      "header:⏳ Open tasks",
      "tasks-table",
    ]);
  });
});

describe("how many widgets a block holds", () => {
  it("counts directives and not the bar over them", () => {
    // The count `widgetRun` turns on. It is ONE OF TWO CONDITIONS as of 4.12,
    // and the comment here used to say it was the whole of "whether a block may
    // become a column" — which was true when it was written and stopped being
    // true the moment `isSectionFence` was added above it. Two widgets is still
    // a question about delimiters nobody has been asked; one widget under a
    // title bar is now a different refusal with a different reason, and this
    // function does not make it. It still counts the directives and not the bar,
    // which is what a `header:` line being content-but-not-a-cell means.
    expect(widgetCount(["header:⏳ Open tasks", "tasks-table:,period"])).toBe(1);
    expect(widgetCount(["row", "diary:3", "cell", "journals"])).toBe(2);
    expect(widgetCount(["frame: none", "# a note to self", "", "links:home"])).toBe(1);
  });
});
