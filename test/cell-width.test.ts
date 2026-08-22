// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Setting a column's width by dragging — 4.9 §3.
//
// WHY THIS FILE IS AS LARGE AS IT IS. The gesture is a pointer drag and the
// suite has no DOM, which is the exact shape that cost 4.8 eight patch rounds:
// every one of them was in the wiring between a gesture and a page, and not one
// was in `moveCell`. The answer that release arrived at is to give the pure half
// everything it can possibly be given, and then to pin it hard. So `snapRatio`
// and `setCellWidths` decide where the pointer lands and what that writes, and
// what is left in block-drag.ts is coordinates.
//
// THE OTHER HALF IS ASSERTED ON THE SOURCE AND THE STYLESHEET, in this suite's
// idiom and for `widget-row.test.ts`'s stated reason: a rule that is invisible
// on a wide screen and cannot be reached any other way is worth pinning where it
// is written.

import { describe, expect, it } from "vitest";
import {
  MAX_SHARES,
  cellWidthsIn,
  cellWidthsOf,
  setCellWidths,
  snapRatio,
  widenCells,
} from "../src/core/cell-width";
import { readCss, readSrc } from "./sources";

// A boundary rather than `indexOf`, for the reason frame.test.ts records: a
// class matched as a substring cannot be told from a longer one with the same
// prefix, and `.journal-group` is a prefix of `.journal-group-foot`.
//
// AND IT IS ANCHORED TO THE START OF A LINE (4.13.1 §4), which is the other half
// of the same lesson and cost this suite a red run to learn. §4 added
// `.journal-block-cell > .journal-widget-card + .journal-widget-card::before`
// EARLIER in the sheet than `.journal-widget-card`'s own rule, and a search for
// the bare class with a trailing-boundary match found the seam's declarations
// and reported the card as having lost its border. Every selector this helper is
// asked for opens its own rule, so every one of them starts a line; a
// DESCENDANT mention never does.
const ruleAt = (rules: string, sel: string): number =>
  rules.search(
    new RegExp("(?:^|\\n)" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s,{]")
  );

// The declarations of the rule this selector opens, sliced from the BRACE so an
// anchor that reaches back past the previous rule's closing brace still reads
// the right block.
const ruleFor = (rules: string, sel: string): string => {
  const at = ruleAt(rules, sel);
  expect(at, `no rule for ${sel}`).toBeGreaterThan(-1);
  const open = rules.indexOf("{", at);
  return rules.slice(open, rules.indexOf("}", open));
};

describe("where the pointer snaps to", () => {
  it("gives exactly one share each at the halfway point", () => {
    // THE ONE STOP THAT HAS TO BE EXACT, because it is the one every group
    // starts at and the one a reader drags back to when they change their mind.
    // `[2, 2]` and `[3, 3]` are the same proportion and neither is a number
    // anybody would type; the loop runs in order of increasing total and only
    // replaces on a strict improvement, which is what makes the simplest pair
    // win a tie.
    expect(snapRatio(0.5)).toEqual([1, 1]);
  });

  it("offers eleven ratios and no more", () => {
    // `a + b <= 6` over every pair of whole shares. Eleven is not a target
    // picked for its own sake — it is what that bound produces, and the bound is
    // there because a seventh share adds ratios a few pixels from their
    // neighbours, which reads as sliding rather than snapping.
    const seen = new Set<string>();
    for (let i = 0; i <= 2000; i++) seen.add(snapRatio(i / 2000).join(":"));
    expect(seen.size).toBe(11);
    expect([...seen].sort()).toEqual([
      "1:1",
      "1:2",
      "1:3",
      "1:4",
      "1:5",
      "2:1",
      "2:3",
      "3:1",
      "3:2",
      "4:1",
      "5:1",
    ]);
  });

  it("never returns a pair that adds up past what it was given", () => {
    // THE WHOLE REASON IT TAKES A CAP. A cell's basis is its weight times the
    // column floor, so a pair asking for more shares than the row has room for
    // makes the row WRAP — and it would wrap under the pointer, mid-drag. The
    // grammar cannot cap a weight (`cellWeightOf` says why: a cap there could
    // not describe a monitor); a gesture holding the row can measure one.
    for (let cap = 2; cap <= MAX_SHARES; cap++) {
      for (let i = 0; i <= 200; i++) {
        const [a, b] = snapRatio(i / 200, cap);
        expect(a + b, `at cap ${cap}, fraction ${i / 200}`).toBeLessThanOrEqual(cap);
        expect(Math.min(a, b)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("gives a two-column page its three reachable ratios", () => {
    // What a 1100px homepage can actually hold: 1:1 asks for 650px and 2:1 for
    // 970px, where 3:1 asks for 1290px and would stack. This is the cap the
    // gesture computes, expressed as the set a reader is offered.
    const seen = new Set<string>();
    for (let i = 0; i <= 500; i++) seen.add(snapRatio(i / 500, 3).join(":"));
    expect([...seen].sort()).toEqual(["1:1", "1:2", "2:1"]);
  });

  it("is monotonic — dragging right never narrows the left column", () => {
    // A snapping control that went backwards anywhere in its travel would feel
    // broken in a way no single assertion about a stop would catch.
    let last = 0;
    for (let i = 0; i <= 600; i++) {
      const [a, b] = snapRatio(i / 600);
      const share = a / (a + b);
      expect(share).toBeGreaterThanOrEqual(last);
      last = share;
    }
  });

  it("takes a pointer outside the pair as a pointer at its end", () => {
    // Nothing in the gesture produces one — the fraction is measured against the
    // pair's own rect — but a fraction is arithmetic and arithmetic arrives from
    // callers not yet written.
    expect(snapRatio(-4)).toEqual([1, 5]);
    expect(snapRatio(9)).toEqual([5, 1]);
    expect(snapRatio(Number.NaN)).toEqual([1, 1]);
  });

  it("answers an even split where there is no room for two columns", () => {
    // A row too narrow for two columns at the floor has already wrapped, and the
    // gesture refuses before it gets here. The loop starts at a total of two, so
    // a smaller cap runs it zero times and the even split it starts at is the
    // answer — which is why there is no clamp for this and must not be one.
    expect(snapRatio(0.9, 1)).toEqual([1, 1]);
    expect(snapRatio(0.9, 0)).toEqual([1, 1]);
    // And a cap larger than the set is the set.
    expect(snapRatio(0.9, 99)).toEqual([5, 1]);
  });

  it("reads an undivided row as one column per widget", () => {
    // `cellPlan`'s own rule, which the gesture's starting point has to agree
    // with: a row of two directives meant two columns before `cell` existed. Get
    // this wrong and a resize refuses every row nobody divided by hand, because
    // the column count would never match the cells on screen.
    expect(cellWidthsOf(["row", "diary:3", "tasks-table"])).toEqual([1, 1]);
  });

  it("stops at the cap, because that is what the row draws (4.52.1)", () => {
    // THE SAME AGREEMENT, ON A FENCE THAT ASKS FOR TOO MANY. This read three
    // columns until 4.52.1 and the row now draws two — so the count `capColumns`
    // arrives at on the render and the count this arrives at in the file are the
    // one number `setCellWidths` compares against. Left at three, every divider
    // on a legacy fence would refuse to drag: the gesture bails when the weights
    // and the cells on screen no longer describe the same row.
    expect(cellWidthsOf(["row", "header:Hi", "a", "b", "c"])).toEqual([1, 1]);
  });
});

describe("what a width writes into the note", () => {
  const EVEN = ["row", "diary:3", "tasks-table"];

  it("leaves an even, undivided row exactly as it found it", () => {
    // A row with no `cell` line is already one column per directive — that is
    // what the absence MEANS. Dividing it to say the columns are the width they
    // already are would put a delimiter between every pair of a page that never
    // asked for cells, which is the trade `composeFlatNote` declines from the
    // other end.
    expect(setCellWidths(EVEN, [1, 1])).toBeNull();
  });

  it("writes an undivided row out when one column is widened", () => {
    // There is nowhere to hang a weight until the delimiters an undivided row
    // implies are on the page. `delimit` is `cell-move.ts`'s and does exactly
    // this and nothing else.
    expect(setCellWidths(EVEN, [2, 1])).toEqual([
      "row",
      "cell: 2",
      "diary:3",
      "cell",
      "tasks-table",
    ]);
  });

  it("opens the first column with a leading delimiter", () => {
    // THE SPELLING THAT MAKES THE FIRST COLUMN WIDENABLE AT ALL. The `row` line
    // opens it and a `row` takes no value (4.2 refused `row: 3`), so the weight
    // needs a delimiter of its own — which `cellPlan` has honoured since 4.4 §2
    // and no writer has produced until now.
    const out = setCellWidths(EVEN, [2, 1]);
    expect(out?.[1]).toBe("cell: 2");
    expect(out?.indexOf("cell: 2")).toBeLessThan(out?.indexOf("diary:3") ?? -1);
  });

  it("drops the leading delimiter when the first column goes back to even", () => {
    // A leading bare `cell` opens no run and asks for one share, so it says
    // nothing at all — `tidyCells`' own rule, applied to the one delimiter
    // `tidyCells` deliberately keeps.
    const wide = ["row", "cell: 2", "diary:3", "cell", "tasks-table"];
    expect(setCellWidths(wide, [1, 1])).toEqual([
      "row",
      "diary:3",
      "cell",
      "tasks-table",
    ]);
  });

  it("writes a bare cell for one share, never `cell: 1`", () => {
    // `cell` and `cell: 1` mean the same thing to `cellWeightOf`, and the
    // shorter one is what every other writer in this project produces. Two
    // spellings of one idea is what this project spends releases removing.
    const out = setCellWidths(["row", "a", "cell: 3", "b"], [2, 1]);
    expect(out).toEqual(["row", "cell: 2", "a", "cell", "b"]);
    expect(out?.join("\n")).not.toContain("cell: 1");
  });

  it("says nothing changed when the widths are the ones already written", () => {
    // NULL-MEANS-NO-CHANGE, which is `moveCell`'s contract and covers a reader
    // dragging a divider and letting go where they picked it up. Writing the
    // file to say the columns are the width they were would put an entry in
    // every sync log in the vault.
    const wide = ["row", "cell: 2", "diary:3", "cell", "tasks-table"];
    expect(setCellWidths(wide, [2, 1])).toBeNull();
  });

  it("keeps a header out of the count, because a bar is not a column", () => {
    // `row.ts` states it from the DOM side and `isWidget` from the file side: a
    // `header:` bar is content and is not a cell. A rule that counted it would
    // put the second column's weight on the first one's delimiter.
    expect(setCellWidths(["row", "header:Hi", "diary:3", "cell", "tasks"], [1, 3])).toEqual([
      "row",
      "header:Hi",
      "diary:3",
      "cell: 3",
      "tasks",
    ]);
  });

  it("weighs a column that holds a stack, not each widget in it", () => {
    // A cell has held more than one widget since 4.4 §1. The homepage's aside is
    // three widgets in one column, and its width is one number.
    expect(
      setCellWidths(["row", "diary:3", "cell", "launcher", "tasks-table"], [2, 1])
    ).toEqual(["row", "cell: 2", "diary:3", "cell", "launcher", "tasks-table"]);
  });

  it("refuses a count that no longer describes the row", () => {
    // The weights were worked out from the cells on screen and the body is
    // re-read at the moment of the write. If the two disagree the reader has
    // edited the fence mid-drag, and writing widths against columns that have
    // moved is worse than writing nothing.
    expect(setCellWidths(EVEN, [2, 1, 1])).toBeNull();
    expect(setCellWidths(EVEN, [])).toBeNull();
  });

  it("refuses a block that is not a row at all", () => {
    // `cell` divides a row; in a column it divides nothing, which is what
    // `parseCells` refuses in the grammar and what this refuses in the write.
    expect(setCellWidths(["diary:3", "tasks-table"], [2, 1])).toBeNull();
  });

  it("refuses a weight that is not a whole number of shares", () => {
    expect(setCellWidths(EVEN, [1.5, 1])).toBeNull();
    expect(setCellWidths(EVEN, [0, 1])).toBeNull();
    expect(setCellWidths(EVEN, [-2, 1])).toBeNull();
    expect(setCellWidths(EVEN, [Number.NaN, 1])).toBeNull();
  });

  it("keeps a delimiter that opens nothing, because it is not this gesture's", () => {
    // A trailing delimiter is not a column and is not something a resize was
    // asked about. Tidying it would be a reconciler rewriting structure it was
    // not pointed at, which 3.15 §2.3 forbids — `moveCell` tidies only where a
    // run left from, and for the same reason.
    const out = setCellWidths(["row", "a", "cell", "b", "cell"], [2, 1]);
    expect(out?.filter((l) => l === "cell").length).toBe(2);
    expect(out?.[out.length - 1]).toBe("cell");
  });

  it("leaves an indented fence indented", () => {
    // `splitDirective` trims, so a fence written inside a list would otherwise
    // be un-indented one delimiter at a time by a writer that did not look.
    const out = setCellWidths(["  row", "  a", "  cell: 4", "  b"], [1, 2]);
    expect(out).toEqual(["  row", "  a", "  cell: 2", "  b"]);
  });
});

describe("reading the widths back off a body", () => {
  it("calls a column with no delimiter one share", () => {
    // The first column is opened by the `row` line, so its weight is one unless
    // a leading delimiter says otherwise. This is the starting point a drag
    // measures against and what makes Escape a restore.
    expect(cellWidthsOf(["row", "a", "cell", "b"])).toEqual([1, 1]);
    expect(cellWidthsOf(["row", "cell: 3", "a", "cell: 2", "b"])).toEqual([3, 2]);
  });

  it("round-trips whatever it just wrote", () => {
    // The property that keeps the gesture honest across two drags: what is read
    // back has to be what was written, or the second drag starts from a number
    // the file does not say.
    for (const weights of [[2, 1], [1, 3], [3, 2], [1, 1]]) {
      const body = setCellWidths(["row", "a", "cell", "b"], weights) ?? [
        "row",
        "a",
        "cell",
        "b",
      ];
      expect(cellWidthsOf(body), weights.join(":")).toEqual(weights);
    }
  });

  it("treats a value that is not a width as one share", () => {
    // `parseCells` refuses the fence and draws the reason; this is the other
    // half of the same moment, and a resize must not read `cell: wide` as a
    // number it can do arithmetic on.
    expect(cellWidthsOf(["row", "cell: wide", "a", "cell", "b"])).toEqual([1, 1]);
  });
});

describe("the same two, asked of a whole note", () => {
  const note = [
    "`almanac:spacer`",
    "",
    "```almanac",
    "row",
    "diary:3",
    "cell",
    "tasks-table",
    "```",
    "",
    "```almanac",
    "journals",
    "```",
    "",
  ];

  it("rewrites one fence and re-emits every other line verbatim", () => {
    // The reconciler's promise `rebuild` makes one file over, and the property
    // that lets structure be rewritten in a file somebody else wrote.
    const out = widenCells(note, 0, [2, 1]);
    expect(out).not.toBeNull();
    expect(out?.slice(0, 3)).toEqual(["`almanac:spacer`", "", "```almanac"]);
    expect(out?.slice(-5)).toEqual(["", "```almanac", "journals", "```", ""]);
    expect(out?.join("\n")).toContain("row\ncell: 2\ndiary:3\ncell\ntasks-table");
  });

  it("hands back a note it did not touch byte-identical, or nothing at all", () => {
    // Two spellings of "nothing happened" would be one too many: the caller
    // checks for null and writes on anything else, so an unchanged ARRAY here
    // would be a write of an identical file.
    expect(widenCells(note, 0, [1, 1])).toBeNull();
    expect(widenCells(note, 1, [2, 1])).toBeNull();
    expect(widenCells(note, 9, [2, 1])).toBeNull();
    expect(widenCells(note, -1, [2, 1])).toBeNull();
  });

  it("reads a block's current widths, and declines a block with no row", () => {
    expect(cellWidthsIn(note, 0)).toEqual([1, 1]);
    // A block that is not a group has no columns to weigh, which is not the
    // same answer as "its columns are all one".
    expect(cellWidthsIn(note, 1)).toBeNull();
    expect(cellWidthsIn(note, 9)).toBeNull();
  });
});

describe("the gesture, where only the source can be read", () => {
  const src = readSrc("block-drag");
  const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");

  it("is a pointer drag, so it cannot collide with a drop", () => {
    // 4.8 §3 deferred this whole gesture on the grounds that the divider a
    // reader would drag is the strip the drop slots already use. It is not: a
    // pointer drag and an HTML5 drag are different event families that cannot
    // both be in progress, which is half of why the collision does not exist.
    const at = src.indexOf("function attachResize(");
    expect(at).toBeGreaterThan(-1);
    const fn = src.slice(at, src.indexOf("\n}\n", at));
    expect(fn).toContain('divider.addEventListener("pointerdown"');
    expect(fn).toContain("setPointerCapture");
    expect(fn).not.toContain("dragstart");
  });

  it("is inert while something is in the air", () => {
    // The other half, and belt and braces on top of the event families: a slot
    // is `display: none` until `is-slotting`, so at rest there is nothing in the
    // gap to collide with — and while there is, the divider takes no pointer.
    expect(
      ruleFor(rules, ".journal-widget-block.is-slotting .journal-group-divider")
    ).toContain("pointer-events: none");
  });

  it("refuses a boundary that a wrap has taken away", () => {
    // The one check no stylesheet can make. A row wraps rather than squeezing,
    // so on a narrow pane a divider drawn at a cell's left edge is at the start
    // of a NEW LINE, with no column to its left to trade width with. No
    // container query can ask it — 4.3.1 is the release that established a query
    // cannot know the cell count.
    expect(src).toContain("if (left.offsetTop !== right.offsetTop) return;");
  });

  it("measures the row rather than assuming a page width", () => {
    // The cap `snapRatio` is asked for. Both lengths are tokens, so a copy of
    // either in TypeScript would be a second place they have to agree — and the
    // one that goes stale is the one no test is looking at.
    expect(src).toContain('pxToken(row, "--am-row-cell-min"');
    expect(src).toContain('pxToken(row, "--am-widget-gap"');
    expect(src).toContain("snapRatio(");
  });

  it("previews through the same variable the file will produce", () => {
    // The stylesheet reads `var(--am-cell-weight, 1)` on both the grow and the
    // basis (4.4 §2), so the columns follow the pointer through the exact
    // declarations the written note renders with. A separate preview is a second
    // answer that can disagree with the first.
    expect(src).toContain('left.style.setProperty("--am-cell-weight"');
    expect(src).toContain('right.style.setProperty("--am-cell-weight"');
  });

  it("puts it back on Escape and writes nothing", () => {
    // The undo a gesture with no dialog has. A drag that is already moving the
    // thing it is about needs no confirmation; what it needs is a way out that
    // costs nothing.
    const at = src.indexOf("const onKey = (e: KeyboardEvent)");
    expect(at).toBeGreaterThan(-1);
    const fn = src.slice(at, src.indexOf("};", at));
    expect(fn).toContain('e.key !== "Escape"');
    expect(fn).toContain("cancel()");
  });

  it("leaves no inline weight behind when nothing moved", () => {
    // `row.ts` leaves no inline style at all on a cell of one share, so the
    // common case has no mark in the DOM. A drag that ended where it started
    // must not be the thing that puts one there.
    const at = src.indexOf("const finish = (e: PointerEvent)");
    expect(at).toBeGreaterThan(-1);
    const fn = src.slice(at, src.indexOf("\n    };", at));
    expect(fn).toContain("live[0] === start[n - 1] && live[1] === start[n]");
    expect(fn).toContain("restore();");
  });
});

describe("the divider and the box, as drawn", () => {
  const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");

  it("sits inside the cell on its right, positioned back into the gap", () => {
    // A divider INSIDE a cell is the safe side of 4.8 §8.3: a cell is an
    // inline-size query container, containment makes it a stacking context, and
    // a `z-index` cannot lift anything out of one. That cost the drop slots a
    // release and costs this nothing, because nothing else is drawn in the gap.
    const rule = ruleFor(rules, ".journal-group-divider");
    expect(rule).toContain("position: absolute");
    expect(rule).toContain("cursor: col-resize");
    expect(rule).toContain("left: calc(var(--am-widget-gap) / -2 - 6px)");
  });

  it("is a wide target with a narrow mark", () => {
    // 4.8.3's lesson about the slots, said again: the generosity belongs in the
    // target and the precision in the drawing. A 2px line that is also a 2px hit
    // area is not something a hand can find.
    expect(ruleFor(rules, ".journal-group-divider")).toContain("width: 12px");
    expect(ruleFor(rules, ".journal-group-divider::after")).toContain("width: 2px");
  });

  it("is quieter than the cards it holds", () => {
    // THE DOUBLING IS THE POINT OF CARE. Cards keep their own boxes, so this is
    // a card inside a card — which reads as intentional only if the box recedes:
    // a ground next to the page's own where the cards take the card colour, and
    // a thinner line than the `--am-rule` every card in that file uses.
    const box = ruleFor(rules, ".journal-group");
    expect(box).toContain("background: var(--background-primary-alt)");
    expect(box).toContain("border: var(--am-rule-hair) solid");
    expect(box).not.toContain("box-shadow");
    // The cards inside are the loud ones, and stay so.
    expect(ruleFor(rules, ".journal-widget-card")).toContain(
      "border: var(--am-rule) solid"
    );
  });

  it("has given the seam away, and drawn nothing twice (4.22 §4.2)", () => {
    // 4.13.1 §4 drew a mark between two stacked widgets as a `::before` on the
    // second card and left it inert, because there was no grammar for a widget's
    // height. 4.22 added the grammar, so the mark became an element with a hit
    // area and a drag on it — and the pseudo-element went, rather than the two
    // being drawn side by side.
    //
    // THE RULE'S ABSENCE IS THE ASSERTION. Two marks meaning "here is a boundary
    // you can pull on" drawn two ways is the fault 4.13 §1 found in the title
    // bars, and the way it comes back is a deletion that was made a comment.
    expect(rules).not.toContain(
      ".journal-block-cell > .journal-widget-card + .journal-widget-card::before"
    );
    // AND THE DRAWING IS THE CARD'S OWN EDGE, AS OF 4.34.3. It was a 28px pill
    // centred in the gap between two cards — punctuation dropped between the
    // widgets, which on a group of three left the eye working out which card
    // each mark belonged to. It runs the full width of the card's bottom edge
    // now, so what lights up is the edge of the thing the drag resizes.
    //
    // THE COLUMN DIVIDER IS UNCHANGED and is still the pill: it divides two
    // cells that are side by side, and there is no single edge for it to be.
    const seam = ruleFor(rules, ".journal-card-divider::after");
    const mark = ruleFor(rules, ".journal-group-divider::after");
    for (const decl of ["width: 100%", "height: var(--am-rule)"]) {
      expect(seam, decl).toContain(decl);
    }
    expect(seam).not.toContain("width: 28px");
    expect(mark).toContain("height: 28px");
    expect(seam).toContain("background: var(--background-modifier-border)");
    const strip = ruleFor(rules, ".journal-card-divider");
    expect(strip).toContain("opacity: 0");
    expect(strip).toContain("transition: opacity 120ms ease");
    // Revealed by a hover on the GROUP, exactly as the divider is: a boundary a
    // reader has to find before it appears is discoverable only by accident.
    expect(rules).toContain(".journal-group:hover .journal-card-divider,");
  });

  it("makes it a control, and gives it something to resolve against", () => {
    // THE GENEROSITY IN THE TARGET AND THE PRECISION IN THE DRAWING: a 12px hit
    // area against a 2px line, which is what lets the drawing be a hairline on
    // an edge. The old seam took no hit area at all and said
    // `pointer-events: none`, because it set nothing.
    const strip = ruleFor(rules, ".journal-card-divider");
    expect(strip).toContain("height: 12px");
    expect(strip).toContain("cursor: row-resize");
    expect(strip).not.toContain("pointer-events: none");
    // Inert under a drag, which is the belt to the braces the two event families
    // already give (see `attachCardResize`).
    expect(rules).toContain(
      ".journal-widget-block.is-slotting .journal-card-divider {"
    );
    // An element positioned into the gap BELOW its card needs the card
    // positioned, or every mark in a column resolves against the cell and lands
    // at the same height.
    //
    // EVERY `.journal-widget-card {` RULE, NOT THE FIRST. The card is described
    // by two of them — the surface it shares with a headed block, then the column
    // it is on its own — and `ruleFor` answers with whichever comes first. A
    // test that asked only that one would pass on the day the declaration moved
    // into the other, and fail on the day it moved back.
    const bodies = rules
      .split("\n.journal-widget-card {")
      .slice(1)
      .map((rest) => rest.slice(0, rest.indexOf("}")));
    expect(bodies.length, "no .journal-widget-card rule").toBeGreaterThan(0);
    expect(bodies.some((b) => b.includes("position: relative"))).toBe(true);
  });

  it("keys the seam on the card, never on a bare sibling", () => {
    // The first child of every cell after the first is `.journal-group-divider`,
    // so `> * + *` would draw a seam above that cell's FIRST card — the one place
    // in the group where there is no boundary at all. `row.ts` builds the divider
    // first precisely so nothing walking the cell mistakes it for content, and a
    // universal selector would be the one thing that still did.
    expect(readSrc("row")).toContain("cls: GROUP_DIVIDER_CLASS");
    expect(rules).not.toContain(".journal-block-cell > * + *");
  });

  it("is withheld where the block already paints", () => {
    // The four-case rule the block head already follows. A canvas tile has given
    // up its chrome and a section run is already inside somebody's card; a box
    // in either is the doubling this whole design is about, one level out.
    const rule = ruleFor(
      rules,
      ".journal-widget-block.is-unframed .journal-group,\n.journal-sec-block .journal-group"
    );
    expect(rule).toContain("background: none");
    expect(rule).toContain("border: none");
    expect(rule).toContain("padding: 0");
  });

  it("says nothing in the foot that the reader can already see", () => {
    // 4.9 put `N columns` here because the foot needed content to be a bar at
    // all. 4.34.2 took it out: the columns are directly above it, so the label
    // restated what the reader was looking at — and the foot now carries three
    // controls instead (the grip, the `+`, and the page numbers where a group
    // has pages).
    const src = readSrc("row");
    expect(src).not.toContain('? "column" : "columns"');
    // Comments stripped: the rule that replaced it names it, which is the
    // record of what went and why (journal-cards.test.ts does the same).
    expect(readCss().replace(/\/\*[\s\S]*?\*\//g, "")).not.toContain(
      ".journal-group-foot-count"
    );
  });

  it("draws no divider on the first column", () => {
    // The left edge of a group is not between anything.
    const src = readSrc("row");
    const at = src.indexOf("if (n > 0) {");
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 200)).toContain("GROUP_DIVIDER_CLASS");
  });
});

describe("making a group on the page", () => {
  const src = readSrc("block-drag");
  const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");

  it("takes the widget run, so a modifier never travels", () => {
    // `widgetRun` is the rule: a `frame:` line describes the block being emptied
    // rather than the widget leaving it, so carrying one in would silently
    // restyle the group it just made. A block holding two widgets offers no cell
    // range, sets no `CELL_TYPE`, and its drag never lights these up — declined
    // before it lights rather than refused on drop, which is 4.8.7's rule.
    const at = src.indexOf('"jbd-slot-side jbd-slot-side-left"');
    expect(at).toBeGreaterThan(-1);
    const call = src.slice(at, at + 200);
    expect(call).toContain("CELL_TYPE");
    expect(call).toContain("(p) => p.cell");
    expect(call).not.toContain("p.whole");
  });

  it("is not offered by a group, and not to itself", () => {
    // A block that is already a group has column slots of its own, which say
    // exactly where an arrival goes; a side cannot, because it would have to
    // name a boundary the reader did not point at. And a block is not its own
    // other column — `inFlight` is what says so, during `dragover`.
    //
    // AND NOT BY A SECTION EITHER, as of 4.12 §A: a block that draws its own
    // title bar cannot be a column, so it must not offer a landing place that
    // would make it one. Two conditions in one omission — `row` is geometry,
    // `section` is what the fence says — and a reader meets both as a quarter
    // that never lights.
    expect(src).toContain("if (!row && !section) {");
    expect(src).toContain("inFlight.block === i");
    // BOTH OF THEM, counted. A bare `toContain` passes on the left quarter alone
    // and says nothing about the right — which is the "matched the right call in
    // the wrong one of three sites" failure the house rules record.
    expect(src.match(/\(\) => !isSelf\(\)/g)?.length).toBe(2);
  });

  it("is drawn only where the block is wide enough to split", () => {
    // 660px is two cells at the floor plus the gap. A quarter offering a group
    // that would collapse the instant it was made is a control that cannot do
    // its job, and `empty.ts`'s rule is that such a control is not drawn.
    //
    // ASKED OF THE BLOCK, not of the pane: the block establishes the query
    // container and is exactly the thing that has to hold two columns.
    const at = rules.indexOf("@container (min-width: 660px)");
    expect(at).toBeGreaterThan(-1);
    const query = rules.slice(at, rules.indexOf("\n}", rules.indexOf("\n  }", at)));
    expect(query).toContain(".jbd-slot-side");
    expect(query).toContain("display: block");
    // Held back everywhere else, at the specificity `.is-slotting .jbd-slot`
    // turns them on with — a bare `display: none` would lose.
    expect(rules).toContain(
      ".journal-widget-block.is-slotting .jbd-slot-side {\n  display: none;\n}"
    );
  });

  it("makes room by standing the halves back, not by stacking on them", () => {
    // 4.8.4 is the release that established the two kinds of slot may not
    // overlap: a cell is a stacking context, so no ordering of z-indexes could
    // have worked and the answer is different GROUND. Four zones that tile the
    // block is that answer for the quarters.
    const at = rules.indexOf("@container (min-width: 660px)");
    const query = rules.slice(at, at + 900);
    expect(query).toContain(".jbd-slot-above:not(.jbd-slot-edge)");
    expect(query).toContain("left: 25%");
    expect(query).toContain("right: 25%");
  });
});
