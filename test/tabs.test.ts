// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";

import {
  TAB_KEYWORD,
  isTabLine,
  parseTabs,
} from "../src/core/directive-grammar";
import {
  delimit,
  pageSlice,
  setPageBreaks,
  splitPage,
  splitPageIn,
  tabAt,
  tabSlices,
  widgetRun,
} from "../src/core/cell-move";
import { cellWidthsOf, setCellWidths } from "../src/core/cell-width";
import { cellPlan, tabPlan } from "../src/ui/widgets/row";
import { readCss, readSrc } from "./sources";

// ── tabs: a group has pages (4.34) ────────────────────────────────────────
//
// The half of this feature a suite with no DOM can hold, which is deliberately
// most of it. `tabSlices` cuts a fence's body into pages and `tabPlan` cuts its
// rendered children into rows, and everything else about tabs is a caller of
// one of those two — the arithmetic gets everything that can possibly be given
// to it, because 4.8 spent eight patch rounds on wiring no test could reach.

describe("the grammar refuses what it cannot mean", () => {
  it("takes a page delimiter and nothing else", () => {
    expect(TAB_KEYWORD).toBe("tab");
    expect(isTabLine("tab")).toBe(true);
    expect(isTabLine("  tab  ")).toBe(true);
    // EXACT, for `isRowLine`'s reason: a directive that merely starts with the
    // same three letters is a directive, not a delimiter.
    expect(isTabLine("tabs-table")).toBe(false);
    expect(isTabLine("table:x")).toBe(false);
  });

  it("refuses a tab in a block that is not a row", () => {
    // `parseCells`' first refusal, one level up. A block that is not a row is a
    // column of widgets and has no group to page.
    const spec = parseTabs(["diary:3", "tab", "tasks-table"]);
    expect(spec.tabs).toBe(false);
    expect(spec.error).toContain("tab divides a group into pages");
    expect(spec.error).toContain("Add row above the directives");
  });

  it("refuses a value, which is a door held open", () => {
    // `tab: Charts` is the obvious next spelling and this is what keeps it
    // available: a refusal can become an acceptance without breaking a file on
    // disk, where a value accepted and ignored cannot.
    const spec = parseTabs(["row", "diary:3", "tab: 2", "tasks-table"]);
    expect(spec.tabs).toBe(false);
    expect(spec.error).toContain("tab takes no value");
    expect(spec.error).toContain("tab: 2");
  });

  it("accepts the plain delimiter in a row", () => {
    const spec = parseTabs(["row", "diary:3", "tab", "tasks-table"]);
    expect(spec).toEqual({ tabs: true, error: null });
  });

  it("says nothing about a block with no tab line", () => {
    expect(parseTabs(["row", "diary:3", "cell", "tasks-table"])).toEqual({
      tabs: false,
      error: null,
    });
  });
});

describe("a body divides into pages", () => {
  it("is one page spanning a body that has no tab line", () => {
    // THE COMPATIBILITY CLAIM, and every existing gesture rides on it: a caller
    // that never asks about pages gets exactly the answer it got before.
    const body = ["row", "diary:3", "cell", "tasks-table"];
    expect(tabSlices(body)).toEqual([{ from: 0, to: 4, page: 0 }]);
  });

  it("cuts on the delimiter, which belongs to neither side", () => {
    const body = ["row", "diary:3", "tab", "tasks-table"];
    expect(tabSlices(body)).toEqual([
      { from: 0, to: 2, page: 0 },
      { from: 3, to: 4, page: 1 },
    ]);
  });

  it("drops a page with nothing in it, trailing or doubled", () => {
    // `cellPlan`'s empty-run rule, stated over lines. A page nobody can see is
    // not a page, so the strip never draws a number that opens onto nothing.
    expect(tabSlices(["row", "diary:3", "tab"])).toEqual([
      { from: 0, to: 2, page: 0 },
    ]);
    expect(tabSlices(["row", "diary:3", "tab", "tab", "tasks-table"])).toEqual([
      { from: 0, to: 2, page: 0 },
      { from: 4, to: 5, page: 2 },
    ]);
  });

  it("numbers by delimiter, not by position in the list", () => {
    // THE HAZARD THIS EXISTS TO CLOSE. A dropped page leaves a GAP rather than
    // shifting everything after it down one — see the header on `TabSlice`.
    // Numbered by position, a gesture in the last page would be told it is in
    // the middle one and would write that page's lines.
    const slices = tabSlices([
      "row",
      "diary:3",
      "tab",
      "tab",
      "tasks-table",
      "tab",
      "on-this-day",
    ]);
    expect(slices.map((s) => s.page)).toEqual([0, 2, 3]);
  });

  it("addresses a page by its ordinal", () => {
    const body = ["row", "diary:3", "tab", "tab", "tasks-table"];
    expect(pageSlice(body, 0)).toEqual({ from: 0, to: 2 });
    // The ordinal that was dropped is absent rather than someone else's.
    expect(pageSlice(body, 1)).toBeNull();
    expect(pageSlice(body, 2)).toEqual({ from: 4, to: 5 });
  });

  it("says which page a line is in, and -1 for one in none", () => {
    const body = ["row", "diary:3", "tab", "tasks-table"];
    expect(tabAt(body, 1)).toBe(0);
    expect(tabAt(body, 3)).toBe(1);
    // The delimiter itself describes no page.
    expect(tabAt(body, 2)).toBe(-1);
  });
});

describe("the rendered children divide the same way", () => {
  const all = (n: number): boolean[] => Array.from({ length: n }, () => true);

  it("is exactly cellPlan's answer when there are no tabs", () => {
    // THE COMPATIBILITY CLAIM AGAIN, on the DOM side, and asserted rather than
    // trusted: `tabPlan` with no bounds must not merely resemble `cellPlan`, it
    // must equal it.
    const content = [true, true, true];
    const cells = [{ at: 1, weight: 2 }];
    const one = cellPlan(content, cells);
    const many = tabPlan(content, [], cells);
    expect(many).toHaveLength(1);
    expect(many[0].cells).toEqual(one.cells);
    expect(many[0].weights).toEqual(one.weights);
    expect(many[0].page).toBe(0);
  });

  it("gives each page its own columns", () => {
    // Two children in page 1 as two columns, one in page 2.
    const plans = tabPlan(all(3), [2], []);
    expect(plans).toHaveLength(2);
    expect(plans[0].cells).toEqual([[0], [1]]);
    expect(plans[1].cells).toEqual([[2]]);
  });

  it("keeps a weight inside the page that asked for it", () => {
    // `cell: 2` in page 1 must not widen page 2, which is the whole of "a
    // gesture acts on the page it was started in" seen from the plan.
    const plans = tabPlan(all(4), [2], [
      { at: 1, weight: 3 },
      { at: 3, weight: 2 },
    ]);
    expect(plans[0].weights).toEqual([1, 3]);
    expect(plans[1].weights).toEqual([1, 2]);
  });

  it("drops a page whose directives drew nothing, keeping the ordinal", () => {
    // A page can hold a directive that appends no child — `on-this-day` on a
    // young vault. There is no row to draw, and the page after it is still
    // page 2.
    const plans = tabPlan([true, true], [1, 1], []);
    expect(plans.map((p) => p.page)).toEqual([0, 2]);
  });

  it("indexes children of a later page against the whole block", () => {
    // The plan is consumed by `layOutRow`, which appends `children[i]` — so an
    // index rebased for `cellPlan` and not rebased back would move the wrong
    // widget into the wrong page.
    const plans = tabPlan(all(4), [2], []);
    expect(plans[1].cells).toEqual([[2], [3]]);
  });

  it("draws no page at all when the block has no cell content", () => {
    expect(tabPlan([false, false], [1], [])).toEqual([]);
  });
});

describe("a width is written inside one page", () => {
  const body = ["row", "diary:3", "cell", "tasks-table", "tab", "chart:x"];

  it("writes page 0 and leaves the rest as it read them", () => {
    const next = setCellWidths(body, [2, 1], 0);
    expect(next).not.toBeNull();
    // The delimiter that opens the second column now carries the weight…
    expect(next?.slice(0, 4)).toEqual(["row", "cell: 2", "diary:3", "cell"]);
    // …and page 2 is the exact lines it was read as.
    expect(next?.slice(-2)).toEqual(["tab", "chart:x"]);
  });

  it("divides the page being widened, not the fence", () => {
    // A group whose page 1 is divided and whose page 2 is not is an ordinary
    // group. Asked globally, page 2 would see page 1's delimiters and have
    // nowhere to hang a weight.
    const next = setCellWidths(
      ["row", "diary:3", "cell", "tasks-table", "tab", "chart:x", "recall"],
      [2, 1],
      1
    );
    expect(next).not.toBeNull();
    // Page 0 untouched.
    expect(next?.slice(0, 4)).toEqual(["row", "diary:3", "cell", "tasks-table"]);
    // Page 1 written out with the delimiters it always implied, and the weight.
    expect(next?.slice(4)).toEqual(["tab", "cell: 2", "chart:x", "cell", "recall"]);
  });

  it("refuses a page that is not there", () => {
    // A stale gesture: the reader edited the fence since the drag began, and
    // this function's standing answer to a disagreement is to write nothing.
    expect(setCellWidths(body, [2, 1], 5)).toBeNull();
  });

  it("reads back the widths of one page", () => {
    const divided = ["row", "cell: 3", "diary:3", "cell", "tasks-table", "tab", "chart:x"];
    expect(cellWidthsOf(divided, 0)).toEqual([3, 1]);
    expect(cellWidthsOf(divided, 1)).toEqual([1]);
  });
});

describe("the housekeeping knows a page boundary when it sees one", () => {
  it("refuses to carry a page boundary into a cell", () => {
    // A run spanning a `tab` is two pages being dragged into one column: the
    // arrival would land both and the boundary between them would be read as a
    // column boundary by nothing at all.
    expect(widgetRun(["diary:3", "tab", "tasks-table"])).toBeNull();
  });

  it("restarts the column count at every page", () => {
    // A `tab` opens its page's first cell exactly as `row` opens the fence's,
    // so the first widget after one must not be given a delimiter of its own.
    expect(delimit(["row", "diary:3", "tab", "tasks-table"]).body).toEqual([
      "row",
      "diary:3",
      "tab",
      "tasks-table",
    ]);
    // …and within a page it still divides.
    expect(delimit(["row", "diary:3", "recall", "tab", "tasks-table"]).body).toEqual([
      "row",
      "diary:3",
      "cell",
      "recall",
      "tab",
      "tasks-table",
    ]);
  });
});

describe("the wiring, where the suite cannot reach the page", () => {
  it("branches the foot on the page count rather than on a flag", () => {
    const src = readSrc("row");
    expect(src).toContain("if (rows.length === 1) {");
    expect(src).toContain("role: \"tablist\"");
  });

  it("pins a height across a swap and releases it on a timer", () => {
    // THE CLAUSE MOST EASILY GOT WRONG. A `LiveWidget` rebuild inside a group
    // still wearing a pixel height from an old swap is clipped by it — and
    // under `prefers-reduced-motion` there is no transition, so `transitionend`
    // would never fire and the pin would never come off.
    const src = readSrc("row");
    expect(src).toContain("pages.style.height = `${before}px`");
    expect(src).toContain("pages.style.height = `${after}px`");
    expect(src).toContain("pages.style.removeProperty(\"height\")");
    expect(src).toContain("window.setTimeout(");
    expect(src).not.toContain("addEventListener(\"transitionend\"");
  });

  it("lays every page out once before hiding it", () => {
    // A canvas created inside `display: none` is created at 0x0 and nothing
    // here can resize one afterwards — a chart hands its teardown to its caller
    // and no registry holds the instance.
    const src = readSrc("row");
    expect(src).toContain("pages.addClass(\"is-measuring\")");
    expect(src).toContain("requestAnimationFrame(() => pages.removeClass(\"is-measuring\"))");
  });

  it("finds the open page, not the first, when a gesture asks", () => {
    // 4.34 §6's first item: an unscoped `querySelector` took the only row there
    // was and would now take page 1 whatever the reader can see.
    const src = readSrc("block-drag");
    expect(src).toContain("`.${ROW_CLASS}:not(.${ROW_CLOSED_CLASS})`");
    // And the page it writes to is READ OFF THE ROW rather than counted, for
    // the ordinal reason `TabbedPlan` states.
    expect(src).toContain("row?.getAttribute(ROW_PAGE_ATTR)");
  });

  it("gates the swap's motion on the reader's own setting", () => {
    // The first `prefers-reduced-motion` block in twenty stylesheets, and it is
    // shared rather than a clause on the tab rule.
    const css = readCss();
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});

// ── making a page, 4.34.1 ─────────────────────────────────────────────────
//
// `tab` shipped reachable only by typing it — the state `cell: 2` sat in from
// 4.4 to 4.9, and the vault report that followed was the same one: the footer
// still said "2 columns" and nothing on the page said a page was a thing a
// group could have.

describe("a page can be made without typing one", () => {
  it("splits the last column off as a page of its own", () => {
    // The obvious gesture — append a `tab` — would do NOTHING visible, because a
    // page with no widget in it is not drawn. So the button divides instead.
    expect(splitPage(["row", "diary:3", "cell", "tasks-table"])).toEqual([
      "row",
      "diary:3",
      "tab",
      "tasks-table",
    ]);
  });

  it("replaces the delimiter rather than writing two", () => {
    // The column boundary is exactly where the page boundary goes. Writing both
    // would leave a `cell` opening nothing — what `tidyCells` exists to remove,
    // created on purpose one line earlier.
    const next = splitPage(["row", "diary:3", "cell: 2", "tasks-table"]);
    expect(next).toEqual(["row", "diary:3", "tab", "tasks-table"]);
    expect(next?.filter((l) => l === "cell: 2")).toEqual([]);
  });

  it("inserts one where the row was never divided", () => {
    expect(splitPage(["row", "diary:3", "tasks-table"])).toEqual([
      "row",
      "diary:3",
      "tab",
      "tasks-table",
    ]);
  });

  it("takes a height with the widget it sizes", () => {
    // `runWithHeight`'s rule: a height sizes the line under it, so the cut goes
    // above the height rather than between it and the card it describes.
    expect(
      splitPage(["row", "diary:3", "cell", "height: 240", "tasks-table"])
    ).toEqual(["row", "diary:3", "tab", "height: 240", "tasks-table"]);
  });

  it("splits the LAST page, leaving the ones before it alone", () => {
    expect(
      splitPage(["row", "diary:3", "tab", "tasks-table", "cell", "recall"])
    ).toEqual(["row", "diary:3", "tab", "tasks-table", "tab", "recall"]);
  });

  it("refuses to empty a page", () => {
    // Taking the only widget out of the last page would make the reader press a
    // button and watch a page disappear.
    expect(splitPage(["row", "diary:3", "tab", "tasks-table"])).toBeNull();
    expect(splitPage(["row", "diary:3"])).toBeNull();
  });

  it("refuses a block that is not a group at all", () => {
    expect(splitPage(["diary:3", "tasks-table"])).toBeNull();
  });

  it("rewrites one fence and re-emits every other as it read it", () => {
    const lines = [
      "```almanac",
      "row",
      "diary:3",
      "cell",
      "tasks-table",
      "```",
      "",
      "```almanac",
      "recall",
      "```",
    ];
    const next = splitPageIn(lines, 0);
    expect(next).toEqual([
      "```almanac",
      "row",
      "diary:3",
      "tab",
      "tasks-table",
      "```",
      "",
      "```almanac",
      "recall",
      "```",
    ]);
  });

  it("is offered on a group that has no pages yet", () => {
    // THE WHOLE POINT, and the reason the button is not inside the strip: a
    // group with no `tab` line is where a reader finds out pages exist, and a
    // control offered only once there are tabs could never be pressed.
    const src = readSrc("row");
    expect(src).toContain("if (plans[0].cells.length > 1) addPage();");
    // And withheld where there is nothing to divide, rather than drawn and
    // silently doing nothing.
    expect(src).toContain("plans[plans.length - 1].cells.length > 1");
  });

  it("asks where the block is at the click, never at the render", () => {
    // `indexNow`'s lesson, which cost 4.7 a patch: a block index taken when the
    // widget was drawn describes a note that has since been edited.
    const src = readSrc("group-tabs");
    const at = src.indexOf("async function splitHere(");
    expect(at).toBeGreaterThan(0);
    const body = src.slice(at, src.indexOf("\n}\n", at));
    expect(body).toContain("await plugin.app.vault.read(file)");
    expect(body).toContain("blockIndexAt(lines, bounds.from)");
  });
});

// ── the sections editor knows about pages, 4.34.2 ─────────────────────────
//
// The `+` in the foot makes a page out of the last column. The editor is the
// other surface: it holds the whole arrangement, the reader moves several rows
// at once, and Save writes the difference — so it states the boundaries it
// wants and `setPageBreaks` makes them true.

describe("page boundaries can be stated rather than gestured", () => {
  const body = ["row", "diary:3", "cell", "tasks-table", "cell", "recall"];

  it("promotes the delimiter above the widget that opens a page", () => {
    // Widgets are on lines 1, 3 and 5; asking for a page at line 5 turns the
    // `cell` above it into a `tab` and leaves the other alone.
    expect(setPageBreaks(body, [5])).toEqual([
      "row",
      "diary:3",
      "cell",
      "tasks-table",
      "tab",
      "recall",
    ]);
  });

  it("demotes one back to a column rather than deleting it", () => {
    // THE ASYMMETRY TO GET RIGHT. A page boundary is a column boundary that was
    // promoted, so unmaking it returns the line to `cell`. Deleting it would
    // stack the two widgets in one column — a page removed and a column lost
    // with it, from a control that only said "not a page".
    const paged = ["row", "diary:3", "tab", "tasks-table"];
    expect(setPageBreaks(paged, [])).toEqual([
      "row",
      "diary:3",
      "cell",
      "tasks-table",
    ]);
  });

  it("inserts one where the row was never divided", () => {
    expect(setPageBreaks(["row", "diary:3", "tasks-table"], [2])).toEqual([
      "row",
      "diary:3",
      "tab",
      "tasks-table",
    ]);
  });

  it("writes several at once, back to front", () => {
    // Stated rather than gestured: the editor hands over the whole arrangement,
    // so two boundaries arrive in one call and the later one must not move the
    // lines the earlier one was located at.
    expect(setPageBreaks(body, [3, 5])).toEqual([
      "row",
      "diary:3",
      "tab",
      "tasks-table",
      "tab",
      "recall",
    ]);
  });

  it("never breaks at the first widget, whatever it is asked", () => {
    // The `row` line opens page one exactly as it opens the first column.
    expect(setPageBreaks(body, [1])).toBeNull();
  });

  it("keeps a height with the widget it sizes", () => {
    expect(
      setPageBreaks(["row", "diary:3", "cell", "height: 240", "tasks-table"], [4])
    ).toEqual(["row", "diary:3", "tab", "height: 240", "tasks-table"]);
  });

  it("says nothing would change rather than rewriting the same lines", () => {
    // `moveCell`'s and `setCellWidths`' contract, for the reason they both give:
    // writing the file to say the pages are where they already were would put an
    // entry in every sync log in the vault.
    expect(setPageBreaks(["row", "diary:3", "tab", "tasks-table"], [3])).toBeNull();
  });

  it("refuses a block that is not a group", () => {
    expect(setPageBreaks(["diary:3", "tasks-table"], [1])).toBeNull();
  });

  it("drops the line instead where a column would put the page over the cap", () => {
    // 4.52.1, AND IT IS A BUG A READER REACHES IN TWO CLICKS. The demotion above
    // is right whenever there WAS a column boundary to promote. A `tab` inserted
    // above a widget that had no delimiter was not promoted from anything, so
    // demoting it INVENTS a column — and here that is a third, which a row does
    // not have.
    //
    // The homepage's own group, in one line: `diary` beside three that stack.
    // Start a page at `recall` and take it away again, and the fence has to come
    // back as it was rather than with a delimiter it never carried.
    const home = ["row", "diary:3", "cell", "tasks-table", "recall"];
    const paged = setPageBreaks(home, [4]);
    expect(paged).toEqual(["row", "diary:3", "cell", "tasks-table", "tab", "recall"]);
    expect(setPageBreaks(paged!, [])).toEqual(home);
  });

  it("moves a page up the fence without deleting the wrong line", () => {
    // THE INDEX TRAP, AND WHAT IT COSTS IS A WIDGET. Moving a page from one
    // member to an EARLIER one both demotes a `tab` and inserts one, and the
    // loop walks back to front — so the insertion happens after the demotion is
    // recorded, at a lower line, and shifts that line up by one. Acted on
    // unshifted, the pass below would splice out whatever now sits at the old
    // index, which here is the directive `b` rather than the delimiter above it.
    //
    // The demotion has to go, because `b`, `c` and `d` would be three columns of
    // one page and a row has two. What must not go with it is a line the reader
    // wrote.
    const body = ["row", "a", "b", "tab", "c", "cell", "d"];
    const out = setPageBreaks(body, [2]);
    expect(out).toEqual(["row", "a", "tab", "b", "c", "cell", "d"]);
    // Every directive that went in came out.
    expect(out!.filter((l) => ["a", "b", "c", "d"].includes(l))).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("moves a page down the fence without testing the wrong line", () => {
    // THE INDEX TRAP, AND IT IS REACHABLE FROM THE EDITOR IN ONE SAVE. Moving a
    // page from one member to a LOWER one both inserts a `tab` and demotes one,
    // and the loop walks back to front — so the insertion happens after the
    // demotion is recorded, at a lower line, and shifts it up by one. Tested at
    // the unshifted index, the cap check would read whichever line happened to
    // be there.
    //
    // Here `recall` gives up its page to `tasks-table`, which has a column of
    // its own — so the demoted line stays a `cell`, both pages are within the
    // cap, and the fence is the one the reader asked for rather than one line
    // short of it.
    const body = ["row", "diary:3", "cell", "tasks-table", "tab", "recall"];
    expect(setPageBreaks(body, [3])).toEqual([
      "row",
      "diary:3",
      "tab",
      "tasks-table",
      "cell",
      "recall",
    ]);
  });

  it("still leaves the column where there is room for one", () => {
    // THE HALF 4.34.2 IS ABOUT, UNTOUCHED. Two widgets and a demoted boundary is
    // two columns, which is what a row has — so the `cell` stays and the pair
    // are beside each other again rather than stacked.
    expect(setPageBreaks(["row", "diary:3", "tab", "tasks-table"], [])).toEqual([
      "row",
      "diary:3",
      "cell",
      "tasks-table",
    ]);
  });
});

describe("the editor carries the second bit", () => {
  const src = (): string => readSrc("section-editor");

  it("keeps it as one bit per row, like the join", () => {
    // `joined` says "this is with the one above it"; `paged` says "and it starts
    // a new page there". Two independent bits describe every arrangement a group
    // can have, and neither counts anything — which is what lets both survive a
    // reorder for free.
    expect(src()).toContain("private paged = new Set<string>();");
    expect(src()).toContain("for (const id of block.pages ?? []) this.paged.add(id);");
  });

  it("reads the bit back through the current grouping", () => {
    // A row dragged out of a group would otherwise reach the write still
    // claiming to open a page of a group it is no longer in.
    const at = src().indexOf("private pageBreaks(");
    expect(at).toBeGreaterThan(-1);
    const body = src().slice(at, at + 400);
    expect(body).toContain("this.groupsOf(ids)");
  });

  it("never lets a group's opener begin a page", () => {
    // Enforced in `pagesOf`, once, rather than at each place that sets the bit.
    //
    // AND IN `normalise` FOR THE BITS THEMSELVES, since 4.53.0. Cutting the
    // group correctly is half of it: a row that stops being in a group also has
    // to stop carrying a page bit, or a reader who breaks a group up and rebuilds
    // it gets page boundaries they asked for once, a while ago, on a different
    // arrangement. `pagesOf` says it about what is drawn and `normalise` says it
    // about what is held.
    const order = readSrc("row-order");
    const at = order.indexOf("export function pagesOf(");
    expect(at).toBeGreaterThan(-1);
    expect(order.slice(at, at + 400)).toContain("if (i > 0 && paged.has(id))");
    const norm = order.indexOf("export function normalise(");
    expect(norm).toBeGreaterThan(-1);
    expect(order.slice(norm, norm + 500)).toContain(
      "for (const id of paged) if (out.has(id)) pages.add(id);"
    );
  });

  it("stops counting columns on the card", () => {
    // `Group — 4 columns` was exactly wrong the moment a group could hold pages:
    // two pages of two columns is not four columns, and that number was the one
    // thing on the card a reader would read as a description of their page.
    expect(src()).not.toContain("${group.length} columns");
    expect(src()).toContain('pages.length > 1 ? `Group — ${pages.length} pages` : "Group"');
  });
});
