// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The row primitive — 4.2 §2, and its cells — 4.4 §1.
//
// WHAT IS ASSERTED HERE AND WHY IT IS THESE THINGS. The suite has no DOM, so
// the feature is pinned at the seams that are pure, which is the shape `frame:`
// established: `parseRow` and `parseCells` decide what a fence said,
// `isCellContent` and `cellPlan` decide what each of a block's children is and
// which cell it lands in, and the stylesheet carries the half that is a
// decision about selectors rather than about pixels.
//
// The CSS assertions are not decoration. The rule this whole primitive rests on
// — that a cell is its own inline-size query container — is invisible on a wide
// screen and cannot be checked any other way: without it every `@container`
// rule in styles/ goes on measuring the pane while the widget sits in a third
// of it, and the page looks right in the only place anybody develops.

import { describe, expect, it } from "vitest";
import {
  CELL_KEYWORD,
  cellWeightOf,
  isCellLine,
  isRowLine,
  parseCells,
  parseRow,
  ROW_KEYWORD,
} from "../src/core/directive-grammar";
import {
  cellPlan,
  isCellContent,
  GROUP_CLASS,
  GROUP_DIVIDER_CLASS,
  GROUP_FOOT_CLASS,
  ROW_CELL_CLASS,
  ROW_CLASS,
} from "../src/ui/widgets/row";
import { readCss, readSrc } from "./sources";

// A boundary rather than `indexOf`, for the reason frame.test.ts records: a
// class matched as a substring is a class that cannot be told from a longer one
// with the same prefix, and `.journal-block-row` is a prefix of
// `.journal-block-row-X`.
const ruleAt = (rules: string, sel: string): number =>
  rules.search(
    new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s,{]")
  );

describe("what a fence can say about being a row", () => {
  it("reads the bare line", () => {
    expect(parseRow(["row", "diary", "tasks-table"])).toEqual({
      row: true,
      error: null,
    });
  });

  it("is off in a fence that does not mention it", () => {
    // THE PROPERTY THAT MAKES THIS A MINOR, and the same one `frame:` claims: a
    // fence with no `row` line is the column it has always been.
    expect(parseRow(["diary", "tasks-table"])).toEqual({
      row: false,
      error: null,
    });
  });

  it("does not care where in the fence the line sits", () => {
    // Read before the loop rather than in it, so it is a property of the BLOCK
    // rather than of the directive it happens to precede.
    expect(parseRow(["diary", "row"]).row).toBe(true);
  });

  it("tolerates the spacing and the stray colon a reader actually types", () => {
    expect(parseRow(["  row  "]).row).toBe(true);
    // `row:` with nothing after it is not an empty ANSWER — the modifier has no
    // question. `frame:` refuses this because a frame needs a value; a row's
    // cells are its directives, so there is nothing missing here to refuse.
    expect(parseRow(["row:"]).row).toBe(true);
    expect(parseRow(["row:  "]).error).toBeNull();
  });

  it("refuses a value, and says what it would have been configuring", () => {
    // DERIVE, DON'T CONFIGURE. `row: 3` is a number that has to agree with the
    // directives beneath it, and the first thing a reader does after writing
    // one is add a fourth widget.
    const { row, error } = parseRow(["row: 3", "diary"]);
    expect(row).toBe(false);
    expect(error).toContain("row: 3");
    expect(error).toContain("directives");
  });

  it("refuses two row lines rather than making one row of six", () => {
    // A reader who wrote two `row` lines meant two rows, and one row of
    // everything is the near-miss nobody debugs. The refusal is also not a
    // limitation of the layout: a fence's `frame:` describes the whole fence, so
    // two rows in one could not wear different chrome — which is exactly what
    // the reference design's bordered row over borderless row needs.
    const { row, error } = parseRow(["row", "diary", "row", "tasks-table"]);
    expect(row).toBe(false);
    expect(error).toContain("2 row lines");
    // Names the way out, so the reader does not have to work it out.
    expect(error).toContain("almanac");
    expect(error).toContain("frame:");
  });

  it("matches the keyword exactly, so a future directive is not swallowed", () => {
    expect(isRowLine("row")).toBe(true);
    expect(isRowLine("row: 3")).toBe(true);
    expect(isRowLine("row-of-cards")).toBe(false);
    expect(isRowLine("rows")).toBe(false);
    expect(isRowLine("diary")).toBe(false);
  });

  it("keeps the keyword itself in one place", () => {
    // The literal belongs to the grammar; anywhere else it is a second spelling
    // of one name. `frame:` is held to this in appearance.test.ts and the rule
    // is not about `frame:`.
    expect(ROW_KEYWORD).toBe("row");
    const widgets = readSrc("widgets");
    expect(widgets).toContain("isRowLine");
    expect(widgets).not.toContain('startsWith("row');
    expect(widgets).not.toContain('ROW_KEYWORD = "row"');
  });
});

describe("what goes into a cell", () => {
  it("takes a widget", () => {
    expect(isCellContent(["journal-calendar"])).toBe(true);
    expect(isCellContent([])).toBe(true);
  });

  it("is an exclusion, so a widget written later needs no entry", () => {
    // The property that keeps the modifier free for directives not written yet
    // — the same argument the `frame:` modifier makes for keying off the block
    // rather than listing widgets.
    expect(isCellContent(["a-widget-invented-next-year"])).toBe(true);
  });

  it("never takes a section bar, in any of its three shapes", () => {
    // THE ONE THAT DOES NOT LOOK LIKE ANYTHING. A title squeezed into a third
    // of a pane is the visible half; the half that matters is that HeaderBar's
    // fold walk reads a bar's SIBLINGS to decide what its section owns, so a
    // bar moved into a cell makes the section fold the wrong scope — 4.1 §4's
    // last bullet, and a bug found weeks later.
    //
    // All three shapes `sectionFrame` builds, because the marker classes differ
    // and only `journal-sec` is on all of them: a titled block-owning bar, an
    // untitled one, and an inner `owns: "children"` section with no fold marker
    // at all.
    expect(
      isCellContent(["journal-sec", "journal-sec-l1", "journal-header-bar", "journal-header-l1"])
    ).toBe(false);
    expect(
      isCellContent(["journal-sec", "journal-sec-l1", "journal-header-bar-untitled"])
    ).toBe(false);
    expect(isCellContent(["journal-sec", "journal-sec-l2"])).toBe(false);
  });

  it("never takes the modifier's own error message", () => {
    // A block can carry a frame error and a good `row` line at once, and the
    // sentence explaining the first is the block talking, not something it is
    // showing.
    expect(isCellContent(["journal-frame-error"])).toBe(false);
  });
});

describe("where a row's cells divide (4.4 §1)", () => {
  it("is off in a row that does not mention it", () => {
    // THE PROPERTY THAT MAKES THIS A MINOR. A row written before 4.4 existed
    // means what it always meant: one directive, one cell.
    expect(parseCells(["row", "diary", "tasks-table"])).toEqual({
      cells: false,
      error: null,
    });
  });

  it("reads a delimiter inside a row", () => {
    expect(
      parseCells(["row", "diary:3", "cell", "tasks-table", "on-this-day"])
    ).toEqual({ cells: true, error: null });
  });

  it("refuses a delimiter in a block that is not a row", () => {
    // `cell` divides a row; in a column it divides nothing, and ignoring it
    // would leave the reader looking at a stack and a line that did nothing.
    const { cells, error } = parseCells(["diary:3", "cell", "tasks-table"]);
    expect(cells).toBe(false);
    expect(error).toContain("no row line");
    // Names both ways out.
    expect(error).toContain("Add row");
    expect(error).toContain("delete");
  });

  it("takes a width, which is what 4.4 §2 left the spelling free for", () => {
    // `cell: 2` was refused in 4.5 with "uneven columns are not built", and the
    // refusal was chosen over ignoring it precisely so this release could give
    // the spelling a meaning rather than work around one already taken.
    expect(parseCells(["row", "diary", "cell: 2", "tasks-table"])).toEqual({
      cells: true,
      error: null,
    });
    expect(cellWeightOf("cell: 2")).toBe(2);
    expect(cellWeightOf("cell")).toBe(1);
    expect(cellWeightOf("cell:")).toBe(1);
    expect(cellWeightOf("cell:  3  ")).toBe(3);
  });

  it("refuses a value that is not a width", () => {
    // A width is a whole number of shares. Half a share, a negative one and a
    // word are all things a reader might type and none of them is a column.
    for (const bad of ["cell: 1.5", "cell: -2", "cell: wide", "cell: 0"]) {
      const { cells, error } = parseCells(["row", "diary", bad, "tasks-table"]);
      expect(cells, bad).toBe(false);
      expect(error, bad).toContain("isn't a width");
      expect(cellWeightOf(bad), bad).toBeNull();
    }
  });

  it("puts no ceiling on a width, because the pane is not the grammar's to know", () => {
    // The tempting cap is the width at which a cell's basis exceeds the page and
    // the row wraps instead — making the number do nothing. But that width is a
    // fact about the PANE, and 4.3.1's lesson was that a breakpoint on the block
    // could not describe a cell. A weight too large for the pane wraps, which is
    // the layout answering correctly rather than the grammar guessing.
    expect(cellWeightOf("cell: 12")).toBe(12);
    expect(parseCells(["row", "a", "cell: 12", "b"]).error).toBeNull();
  });

  it("matches the keyword exactly, so a future directive is not swallowed", () => {
    expect(isCellLine("cell")).toBe(true);
    expect(isCellLine("cell: 2")).toBe(true);
    expect(isCellLine("cells")).toBe(false);
    expect(isCellLine("cell-grid")).toBe(false);
    expect(isCellLine("diary")).toBe(false);
  });

  it("keeps the keyword itself in one place", () => {
    expect(CELL_KEYWORD).toBe("cell");
    const widgets = readSrc("widgets");
    expect(widgets).toContain("CELL_KEYWORD");
    expect(widgets).not.toContain('startsWith("cell');
    expect(widgets).not.toContain('CELL_KEYWORD = "cell"');
  });
});

describe("which children land in which cell (4.4 §1)", () => {
  const all = (n: number): boolean[] => Array(n).fill(true);
  // A plain delimiter — one share — since most of these are about grouping
  // rather than about width.
  const at = (n: number): { at: number; weight: number } => ({ at: n, weight: 1 });

  it("groups the run between two delimiters", () => {
    // `row / diary:3 / cell / tasks-table / on-this-day` — the arrangement 4.4
    // exists for: one big widget beside two stacked small ones.
    expect(cellPlan(all(3), [{ at: 1, weight: 1 }]).cells).toEqual([[0], [1, 2]]);
  });

  it("counts children, not directives", () => {
    // WHY THE BOUNDARY IS A COUNT. A directive may append nothing — a young
    // vault's `on-this-day`, a `links:` row with none — so "the child before
    // this line" is not always a child of this line. The dispatcher records how
    // many children the block HAD, which is exact either way.
    //
    // Here the second directive drew nothing, so the delimiter after it lands
    // on the same count as the one before: two cells, not three.
    expect(cellPlan(all(2), [{ at: 1, weight: 1 }, { at: 1, weight: 1 }]).cells).toEqual([[0], [1]]);
  });

  it("drops an empty run rather than drawing an empty column", () => {
    // What makes a leading `cell` line and a bare one mean the same thing: both
    // say one cell holds the first widget.
    expect(cellPlan(all(2), [at(0), at(1)]).cells).toEqual([[0], [1]]);
    expect(cellPlan(all(2), [at(1)]).cells).toEqual([[0], [1]]);
    // And a trailing delimiter adds nothing.
    expect(cellPlan(all(2), [at(1), at(2)]).cells).toEqual([[0], [1]]);
  });

  it("leaves furniture out of every cell", () => {
    // A section bar is not cell content, and it must not shift the grouping of
    // what is: the header here sits between the two widgets and neither joins a
    // cell nor splits one.
    expect(cellPlan([true, false, true], [at(3)]).cells).toEqual([[0, 2]]);
    expect(cellPlan([true, false, true], [at(2)]).cells).toEqual([[0], [2]]);
  });

  it("gives each cell the shares its own delimiter asked for", () => {
    // 4.4 §2. The weight belongs to the cell the `cell` line OPENS, which is
    // what makes it impossible for it to disagree with anything: add a cell and
    // it brings its own share, delete one and the share goes with it.
    const plan = cellPlan(all(3), [{ at: 1, weight: 3 }]);
    expect(plan.cells).toEqual([[0], [1, 2]]);
    expect(plan.weights).toEqual([1, 3]);
  });

  it("gives the first cell one share, unless a leading delimiter opens it", () => {
    // The first cell is opened by the `row` line, not by a delimiter, so it has
    // one share by default — and the leading-`cell` spelling, which was already
    // tolerated because an empty run is dropped, is what makes the FIRST column
    // widenable at all. What a leading delimiter leaves behind is its weight.
    expect(cellPlan(all(2), [at(1)]).weights).toEqual([1, 1]);
    const led = cellPlan(all(2), [{ at: 0, weight: 2 }, at(1)]);
    expect(led.cells).toEqual([[0], [1]]);
    expect(led.weights).toEqual([2, 1]);
  });

  it("keeps weights parallel to the cells that are actually drawn", () => {
    // An empty run draws no cell, so there is one weight per DRAWN cell and not
    // one per delimiter. A weights array that counted delimiters would slide
    // out of step with the cells the moment a run was empty, and every column
    // after it would take the wrong width.
    const plan = cellPlan(all(2), [{ at: 0, weight: 4 }, { at: 1, weight: 3 }]);
    expect(plan.cells).toHaveLength(2);
    expect(plan.weights).toHaveLength(2);
    expect(plan.weights).toEqual([4, 3]);
  });

  it("gives every cell one share when nothing asks", () => {
    expect(cellPlan(all(2), []).weights).toEqual([1, 1]);
  });

  it("gives one cell EACH when a row delimits nothing", () => {
    // THE THING 4.4 IS NOT ALLOWED TO CHANGE. A row of two directives meant two
    // columns before cells existed, and the arithmetic above — one run, split by
    // nothing — would give one cell holding both. The rule lives in `cellPlan`
    // rather than in its caller so this can be asserted at all.
    //
    // ASKED OF TWO RATHER THAN THREE SINCE 4.52.1, and the change is the cap
    // rather than a weakening: three is no longer one cell each, because three
    // columns is not a thing a row draws. The rule itself is untouched — every
    // run is its own column, up to the number of columns there are.
    expect(cellPlan(all(2), []).cells).toEqual([[0], [1]]);
    // Furniture is still left out of it.
    expect(cellPlan([true, false, true], []).cells).toEqual([[0], [2]]);
  });
});

// ── the cap: a row draws two columns (4.52.1) ────────────────────────────
//
// THE BUG THIS COMES FROM, REPORTED FROM A VAULT: *"the groups can be easily
// broken and don't reflect what is shown in the editor."* Four widgets in one
// `row` fence on a note column about 1090px wide. Three cells fit at the 320px
// floor; the fourth wrapped to a line of its own and `flex-grow` stretched it to
// the full width of the group, so a column stopped reading as a column. The file
// said four, the section editor said four, and the page drew three and a band.
//
// WHY THESE ROWS ARE THE ONES. The cap is a number in `directive-grammar.ts`
// and three places deal by it — this one on the render, `regroupFlatNote`'s
// column phase in the file, and `joinInto` on an arrival. The first two MUST
// agree exactly, or a reader presses Save on a page they were happy with and
// watches two widgets swap places; `test/section-rows.test.ts` asserts the pair
// against each other on six shapes, and what is pinned here is the arithmetic
// that side of it rests on.
describe("a row draws at most two columns (4.52.1)", () => {
  const all = (n: number): boolean[] => Array(n).fill(true);

  it("deals a fourth column back into the two there are", () => {
    // 1 and 2 keep the top line, 3 goes under 1 and 4 under 2 — the reading
    // order across and then down, which is what makes this a fold rather than a
    // rearrangement. Nothing is dropped and nothing is hidden.
    expect(cellPlan(all(4), []).cells).toEqual([[0, 2], [1, 3]]);
  });

  it("deals an odd one into the emptier column", () => {
    expect(cellPlan(all(3), []).cells).toEqual([[0, 2], [1]]);
    expect(cellPlan(all(5), []).cells).toEqual([[0, 2, 4], [1, 3]]);
  });

  it("counts widgets rather than runs, which is what keeps the file in step", () => {
    // `row / a / b / cell / c / cell / d` — the first column already holds two,
    // so the third run's widget goes to the SECOND rather than to the first.
    // Dealing by run ordinal instead would send it to column one, and the
    // column phase — which moves one widget per pass, because that is what
    // `moveCell` moves — would put it in the other one on the next Save.
    const plan = cellPlan(all(4), [
      { at: 2, weight: 1 },
      { at: 3, weight: 1 },
    ]);
    expect(plan.cells).toEqual([[0, 1], [2, 3]]);
  });

  it("is one number, and the five places that use it read it", () => {
    // THE VOCABULARY RULE, ASKED OF A CONSTANT. A copy of `2` in any of these
    // would be a second answer to how many columns a row has, and the two that
    // deal — the render and the file — would drift apart the first time one of
    // them was tuned. So it lives in `directive-grammar.ts` beside `row` and
    // `cell`, where the grammar it describes is, and every reader imports it.
    expect(readSrc("directive-grammar")).toContain("export const MAX_COLUMNS = 2;");
    for (const mod of ["row", "cell-move", "cell-width", "block-drag", "note-sections"]) {
      const code = readSrc(mod);
      expect(code, mod).toContain("MAX_COLUMNS");
      // USES IT AND DOES NOT DEFINE IT, which is the whole assertion: a second
      // `const MAX_COLUMNS` anywhere is a second answer.
      expect(code, mod).not.toContain("const MAX_COLUMNS");
    }
  });

  it("leaves a row at or under the cap exactly as it found it", () => {
    // Which is every fence any catalogue in this plugin composes: the homepage's
    // row is one wide member beside a column that stacks the rest.
    expect(cellPlan(all(2), [{ at: 1, weight: 3 }])).toEqual({
      cells: [[0], [1]],
      weights: [1, 3],
    });
  });

  it("keeps a weight for each column it actually draws", () => {
    // A weight belongs to the column a `cell` line OPENS, and past the cap that
    // line opens no column — so there is no column for its share to be a share
    // OF. Two numbers describing one cell would be two answers and no rule for
    // which wins; `columnsOf` (cell-width.ts) stops at the same count so the
    // width a drag writes and the width the row draws stay one answer.
    const plan = cellPlan(all(4), [
      { at: 1, weight: 2 },
      { at: 2, weight: 3 },
      { at: 3, weight: 4 },
    ]);
    expect(plan.cells).toHaveLength(2);
    expect(plan.weights).toEqual([1, 2]);
  });
});

describe("the block lays itself out afterwards, knowing nothing", () => {
  const widgets = readSrc("widgets");
  // The `almanac` fence's processor, bounded — an order assertion over the
  // whole of a SPLIT module compares positions in an alphabetical
  // concatenation, which test/sources.ts warns is not a comparison at all.
  //
  // THE ANCHORS ARE `registerBlock`, NOT OBSIDIAN'S OWN REGISTRAR (4.18.2). The
  // three fences now register through a wrapper that keeps each rendered block
  // repaintable outside a markdown view; the bodies these bounds enclose did not
  // move, only the call that introduces them.
  const processor = ((): string => {
    const at = widgets.indexOf('registerBlock("almanac", ');
    expect(at, "the almanac fence processor is gone").toBeGreaterThan(-1);
    const end = widgets.indexOf('registerBlock(\n      "almanac-charts"', at);
    expect(end, "the processor's end is gone").toBeGreaterThan(at);
    return widgets.slice(at, end);
  })();

  it("drops the modifier from the loop rather than dispatching it", () => {
    // It says nothing about what to draw, only about how what is drawn is
    // arranged. Left in, it would reach `buildFromSpec` as an unknown keyword
    // and draw the dispatcher's own "could not read this line" notice.
    expect(processor).toContain("!isRowLine(l)");
  });

  it("lays the row out once, after the widgets, not per directive", () => {
    // `frame: section`'s shape: the loop needs no knowledge of the row, so a
    // widget written next year is a cell without being told. A call inside the
    // loop would rebuild the row on every line.
    const calls = processor.match(/layOutRow\(\s*container,/g) ?? [];
    expect(calls.length).toBe(1);
    const loopAt = processor.indexOf("for (const line of lines) {");
    expect(processor.indexOf("layOutRow(")).toBeGreaterThan(loopAt);
  });

  it("records the delimiter's position instead of dispatching it", () => {
    // The one arm that draws nothing. Taken before every other, so a `cell`
    // line can never reach `buildFromSpec` as an unknown keyword and draw the
    // dispatcher's "could not read this line" notice.
    expect(processor).toContain("if (kind === CELL_KEYWORD) {");
    expect(processor).toContain("cellBounds.push({");
    expect(processor).toContain("at: container.childElementCount,");
    // The position is taken INSIDE the loop — it is the one thing about a row
    // that is positional, and reading it before the loop like `row` and
    // `frame:` would lose the order entirely.
    const loopAt = processor.indexOf("for (const line of lines) {");
    expect(processor.indexOf("cellBounds.push(")).toBeGreaterThan(loopAt);
  });

  it("divides only when the grammar accepted the delimiters", () => {
    // A refused `cell: 2` must not silently divide the row anyway. The
    // dispatcher records a boundary only when `parseCells` said yes, so a
    // refused block draws its sentence AND renders as the row it was.
    expect(processor).toContain("if (cellSpec.cells) {");
    expect(processor).toContain("weight: cellWeightOf(line) ?? 1,");
  });

  it("lays it out before the frame wraps the block", () => {
    // Or a `frame: section` row goes into the section's body as a column of
    // cells rather than as one row.
    //
    // BOTH ENDS GUARDED, and this was found by mutating: deleting the call
    // outright left `indexOf` returning -1, which is less than any real
    // position, so the assertion passed on a feature that was not there. A
    // comparison between two positions is only a comparison when both exist.
    const row = processor.indexOf("layOutRow(");
    const frame = processor.indexOf("foldableSection(");
    expect(row, "the row is never laid out").toBeGreaterThan(-1);
    expect(frame, "the frame never wraps the block").toBeGreaterThan(-1);
    expect(row).toBeLessThan(frame);
  });
});

describe("a cell is its own query container", () => {
  const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");

  it("gives every cell an inline-size container", () => {
    // THE RULE THE WHOLE PRIMITIVE RESTS ON. Every `@container (max-width: …)`
    // rule in styles/ resolves against the nearest inline-size ancestor, which
    // until this existed was always `.journal-widget-block` — the pane. A widget
    // in a third of a pane is narrow while the block is wide, so without this
    // the tracker grid, the header bars and the calendar all go on measuring
    // the pane and stay in their wide layout at a third of the width.
    const at = ruleAt(rules, `.${ROW_CLASS} > .${ROW_CELL_CLASS}`);
    expect(at, "no cell rule").toBeGreaterThan(-1);
    const rule = rules.slice(at, rules.indexOf("}", at));
    expect(rule).toContain("container-type: inline-size");
  });

  it("lets a cell get narrower than the widest thing in it", () => {
    // `min-width: 0`, without which a flex item's floor is its content's
    // min-content width: one wide table pushes the row past the pane and the
    // note scrolls sideways instead of the cell getting narrower.
    const at = ruleAt(rules, `.${ROW_CLASS} > .${ROW_CELL_CLASS}`);
    const rule = rules.slice(at, rules.indexOf("}", at));
    expect(rule).toContain("min-width: 0");
    // The basis is the FLOOR, not zero — that is what makes the wrap below
    // work. Cells that cannot all have the floor go onto the next line rather
    // than all getting thinner.
    //
    // AND THE WEIGHT IS ON BOTH HALVES as of 4.4 §2. An exact 2:1 needs the
    // share on the basis as well as on the grow: width = N x floor + N/total x
    // leftover is proportional to N only when both carry it. Weight on the grow
    // alone gives about 1.3:1 where 2:1 was asked for, which is the kind of
    // nearly-right that reads as a rendering fault.
    expect(rule).toContain("flex-grow: var(--am-cell-weight, 1)");
    expect(rule).toContain(
      "flex-basis: calc(var(--am-row-cell-min) * var(--am-cell-weight, 1))"
    );
  });

  it("wraps rather than squeezing, and needs no cell count to do it", () => {
    // THE BREAKPOINT THIS REPLACED WAS MEASURING THE WRONG THING, and a vault
    // render is what showed it. The rule was
    // `@container (max-width: 520px) { flex-direction: column }` — the row
    // became a column when the BLOCK was narrow. But a cell is the block
    // divided by however many cells there are, so a three-cell row in a 720px
    // pane gave each widget 225px while the rule sat quiet, waiting for a width
    // it would never see. At 225px the diary calendar's quarter rail renders
    // `JaFeMar` on top of itself.
    //
    // No container query can know how many cells share a block. `flex-wrap`
    // does not need to: each cell asks for the floor, as many as fit take a
    // line, and the rest wrap — which reaches a plain column on a phone without
    // a number that has to be kept in step with anything.
    const at = ruleAt(rules, `.${ROW_CLASS}`);
    expect(at, "no row rule").toBeGreaterThan(-1);
    expect(rules).toMatch(
      new RegExp(`\\.${ROW_CLASS} \\{[^}]*flex-wrap: wrap`)
    );
    // AND THE OLD BREAKPOINT IS GONE RATHER THAN KEPT BESIDE IT. Two rules for
    // one question is how a stylesheet acquires two answers to it.
    expect(rules).not.toMatch(
      new RegExp(`@container[^{]*\\{\\s*\\.${ROW_CLASS} \\{\\s*flex-direction: column`)
    );
  });

  it("takes its floor from a token, and the token is not the widgets' own", () => {
    // 520px is where a widget switches to its COMPACT layout; ~300px is where
    // it starts to break. A row wants the second number, because a compact
    // widget in a narrow cell is the point of the primitive.
    const at = ruleAt(rules, `.${ROW_CLASS} > .${ROW_CELL_CLASS}`);
    const rule = rules.slice(at, rules.indexOf("}", at));
    expect(rule).toContain("var(--am-row-cell-min)");
    expect(rule).not.toContain("520px");

    // THE VALUE IS THE CLAIM, so it is pinned as the range the evidence
    // supports rather than as the number that happens to be there. A vault
    // render measured both ends: at 225px per cell the diary calendar's quarter
    // rail draws `JaFeMar` on top of itself, and at 355px the same rail reads
    // correctly. The floor has to sit above the first and no higher than the
    // second — above, or the row still squeezes a widget until it breaks; and
    // not higher, or a width already shown to work would start wrapping.
    //
    // A range rather than an equality, because 320 is a judgement inside that
    // window and a test asserting it exactly would fail for a better number.
    const floor = rules.match(/--am-row-cell-min:\s*(\d+)px/);
    expect(floor, "the floor is not a token").not.toBeNull();
    const px = Number(floor![1]);
    expect(px, "narrow enough to break the calendar rail").toBeGreaterThan(225);
    expect(px, "wider than a width already shown to render").toBeLessThanOrEqual(355);
  });

  it("does not move the block's own container out from under it", () => {
    // 4.1 §4 names `container-type` on `.journal-widget-block` as the rule every
    // frame value has to keep. A row EXTENDS it — the block is still a
    // container and each cell is one too — so nothing here may cancel it.
    const at = ruleAt(rules, `.${ROW_CLASS}`);
    expect(at, "no row rule").toBeGreaterThan(-1);
    const rule = rules.slice(at, rules.indexOf("}", at));
    expect(rule).not.toContain("container-type");
    // And the block's own is still there, which is the thing that would break.
    expect(rules).toMatch(
      /\.journal-widget-block\s*\{[^}]*container-type:\s*inline-size/
    );
  });

  it("gives every card in a column its own handle (4.22 §4.1)", () => {
    // ONE PER CARD, NOT ONE PER SEAM. N cards have N-1 seams between them, so a
    // mark between two of them cannot reach the LAST card in a column — which on
    // the page this release is about is the widget with the most empty rows in
    // it. A handle on every card's own bottom edge is N handles and reaches all
    // of them.
    //
    // AND IT IS BUILT INTO THE CHILD, not beside it: the card is positioned and
    // the cell is the wrong ground, so a mark hung on the cell would put every
    // handle in a column at the same height.
    const src = readSrc("row");
    expect(src).toContain("export const CARD_DIVIDER_CLASS");
    expect(src).toContain("cls: CARD_DIVIDER_CLASS");
    expect(src).toContain('"aria-label": "Drag to set the height of this widget"');
    // The column divider is the one child of a cell the reader did not put
    // there, and it is skipped by name.
    expect(src).toContain("if (child.hasClass(GROUP_DIVIDER_CLASS)) continue;");
  });

  it("marks a cell only when its width is not the default", () => {
    // `var(--am-cell-weight, 1)` means an ordinary cell needs no inline style
    // at all, so the common case leaves no mark in the DOM — the shape
    // `--am-row-cols` and `--am-ev-tint` already use. Asserted on the source
    // because the DOM write is what the stylesheet's fallback depends on.
    const src = readSrc("row");
    expect(src).toContain("if (weights[n] !== 1) {");
    expect(src).toContain('cell.style.setProperty("--am-cell-weight"');
  });

  it("stacks what a cell holds, with the block's own rhythm", () => {
    // A cell can hold more than one widget as of 4.4 §1, so it has to be a
    // column — and the gap has to be the BLOCK's, or two widgets stacked in a
    // cell read differently from the same two stacked in a block of their own,
    // and a page with both looks like two pages.
    const at = ruleAt(rules, `.${ROW_CLASS} > .${ROW_CELL_CLASS}`);
    const rule = rules.slice(at, rules.indexOf("}", at));
    // `display: flex` is asserted too, and it took a mutation to notice: with
    // `display: block` the widgets still stack, so the page looks nearly right
    // — and `flex-direction` and `gap` are both inert, so the rhythm the rest
    // of this assertion is about quietly goes away.
    expect(rule).toContain("display: flex");
    expect(rule).toContain("flex-direction: column");
    expect(rule).toContain("gap: var(--am-widget-gap)");
  });

  it("does not spell a row the way a bar is already spelled", () => {
    // TWO IDEAS SHARING A NAME is the same fault as two names for one idea, from
    // the other side. `.journal-widget-bar` already means "a row" in this
    // stylesheet — the wrapping strip inline controls accumulate into — and it
    // is not this: a bar is controls INSIDE a block, a row is the block's own
    // widgets laid across it.
    expect(ROW_CLASS).not.toContain("widget");
    expect(ruleAt(rules, ".journal-widget-row")).toBe(-1);
  });
});

describe("the box a group is drawn in — 4.9 §2", () => {
  const src = readSrc("row");

  it("wraps the row rather than replacing it", () => {
    // The row is the flex row and cannot also be the surface: a foot bar inside
    // it would be a third column. So the group is a level ABOVE, and the row is
    // untouched — which is what lets `block-drag.ts` go on finding it and
    // reading `row.children` for the cells.
    //
    // A THIRD LEVEL SINCE 4.34: the rows live in `.journal-group-pages`, which
    // is what a page swap pins a height on. The group cannot be that box —
    // its height includes the foot, and sliding the strip the reader is
    // pressing is the whole bug the pin exists to prevent.
    const at = src.indexOf("const box = createDiv({ cls: GROUP_CLASS });");
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 700)).toContain(
      "const pages = box.createDiv({ cls: GROUP_PAGES_CLASS });"
    );
    expect(src).toContain("const row = pages.createDiv({");
  });

  it("goes in at the row's own place, so a bar stays above it", () => {
    // AT THE FIRST CELL'S PLACE, not at the end of the block. A `header:` bar is
    // not a cell (`NOT_A_CELL`) and stays a direct child of the block; inserting
    // the box anywhere else would put the group above the bar that titles it, or
    // below whatever the processor drew last.
    //
    // THE FIRST CELL OF THE FIRST PAGE, as of 4.34, which is the same place: a
    // group's pages all begin where its first row began.
    expect(src).toContain(
      "container.insertBefore(box, children[plans[0].cells[0][0]]);"
    );
  });

  it("names its parts for the noun the reader is given", () => {
    // 4.9 §1: `journal-block-row` and `journal-block-cell` stay as they are —
    // no reader sees either and every CSS assertion in this suite reads them as
    // literals — and everything added takes the name the documentation uses.
    expect(GROUP_CLASS).toBe("journal-group");
    expect(GROUP_FOOT_CLASS.startsWith(`${GROUP_CLASS}-`)).toBe(true);
    expect(GROUP_DIVIDER_CLASS.startsWith(`${GROUP_CLASS}-`)).toBe(true);
    // And the fence keyword is untouched: `row` is how a group is written.
    expect(ROW_KEYWORD).toBe("row");
  });

  it("says nothing in the foot that the reader can already see", () => {
    // `N columns` was the foot's whole content from 4.9 until 4.34.2 took it
    // out. It was there because the foot needed something in it to be a bar,
    // and what it said was a count of the columns directly above it — a label
    // restating the thing it sits under, which is the empty state's "no data"
    // fault wearing a number.
    //
    // WHAT THE FOOT CARRIES NOW: the grip (block-drag.ts's), the `+`, and the
    // page numbers where there are pages. All three are controls.
    expect(src).not.toContain("GROUP_FOOT_CLASS}-count");
    expect(src).not.toContain("? \"column\" : \"columns\"");
    expect(src).not.toContain("${children.length}");
    // Comments stripped: the rule that replaced it names it, which is the
    // record of what went and why (journal-cards.test.ts does the same).
    expect(readCss().replace(/\/\*[\s\S]*?\*\//g, "")).not.toContain(
      ".journal-group-foot-count"
    );
  });
});
