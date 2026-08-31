// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The settings tab holds still.
//
// WHY THIS FILE EXISTS. A screen recording of someone using the tab end to end
// showed five faults, none of which throws, fails a type check or breaks a
// test: they are all things the page DOES while a reader is looking at it.
//
//   1. Every change repainted the tab from the top. Twenty-five handlers end in
//      `display()`, which empties `containerEl` — and emptying it collapses the
//      scroll height, so the reader was thrown back to the masthead. Reordering
//      a custom tracker, a button three quarters of the way down the page, cost
//      a scroll per press.
//   2. The repaint also cleared the search box and reset the category pill to
//      All Settings, because both lived in locals inside `display()`.
//   3. A search left every group it had opened permanently expanded, because
//      the `toggle` listener could not tell "the filter revealed this" from
//      "the reader opened this".
//   4. Picking a longer dropdown value widened the control, narrowed the
//      description beside it, re-wrapped the description and moved every row
//      below down the page.
//   5. Three tables with the same five headings, stacked in the same group,
//      each sized its own columns; and the capture matrix's headings sat 9px
//      off the switches they name.
//
// Each of those is one line away from coming back, and none of them would be
// noticed by anything already in this suite — which is the argument for
// pinning them here rather than trusting the next screen recording.

import { describe, expect, it } from "vitest";
import { readCss, readSrc, repoFile } from "./sources";

const src = () => readSrc("settings");
const css = () => readCss();

function rule(selector: string): string {
  const at = css().indexOf(`\n${selector} {`);
  expect(at, `no rule for ${selector}`).toBeGreaterThan(0);
  return css().slice(at, css().indexOf("\n}", at));
}

describe("a repaint puts the reader back where they were", () => {
  it("routes every handler through refresh(), leaving display() as the builder", () => {
    // THE ASSERTION IS THE COUNT, NOT THE SPELLING. `display()` is Obsidian's
    // entry point and has to keep working when Obsidian calls it; what must not
    // happen is a handler calling it, because a handler is always a repaint of
    // a page someone is already looking at. Exactly one call site remains and
    // it is the one inside `refresh()`.
    const text = src();
    const calls = text.match(/this\.display\(\)/g) ?? [];
    expect(calls).toHaveLength(1);

    const refresh = text.slice(
      text.indexOf("private refresh(): void {"),
      text.indexOf("private refreshDerivedPaths")
    );
    expect(refresh).toContain("this.display();");

    // And there are plenty of handlers, so the one call above is not "nobody
    // repaints any more".
    expect((text.match(/this\.refresh\(\)/g) ?? []).length).toBeGreaterThan(20);
  });

  it("finds the scroller rather than assuming containerEl is it", () => {
    // `containerEl` IS the scrolling element in Obsidian's settings modal
    // today. Hard-coding that makes the fix silently do nothing anywhere else,
    // and doing nothing is the exact bug — so the walk is the assertion.
    // Walking up while `scrollTop` is 0 cannot pick the wrong element: if
    // nothing is scrolled there is nothing to restore.
    const refresh = src().slice(
      src().indexOf("private refresh(): void {"),
      src().indexOf("private refreshDerivedPaths")
    );
    expect(refresh).toContain("scroller.scrollTop === 0");
    expect(refresh).toContain("scroller.parentElement");
    expect(refresh).toContain("scroller.scrollTop = top");
  });

  it("keeps the query and the category on the instance, not in display()", () => {
    // Both were `let`s inside `display()`, so a repaint reset them to blank and
    // "all" while the groups the reader had filtered down to came back.
    const text = src();
    expect(text).toMatch(/^ {2}private query = "";$/m);
    expect(text).toMatch(/^ {2}private activeTabId = "all";$/m);
    expect(text).not.toMatch(/let activeTabId/);
    // Seeded back into the box it was typed in.
    expect(text).toContain("value: this.query,");
  });

  it("draws the tab already filtered", () => {
    // Without a call at the end of display(), a repaint under an active query
    // paints every group and then takes them away on the next input event.
    const text = src();
    const display = text.slice(text.indexOf("  display(): void {"));
    const wired = display.indexOf('searchInput.addEventListener("input", updateFilter);');
    expect(wired).toBeGreaterThan(0);
    expect(display.indexOf("updateFilter();", wired)).toBeGreaterThan(wired);
  });
});

describe("a search reveals a group without re-deciding it", () => {
  it("marks the element it is about to move instead of raising a flag", () => {
    // A `filtering = true / … / false` pair around the loop would guard
    // nothing: `toggle` on a <details> is QUEUED, not dispatched, so the flag
    // is back to false before the first event arrives. The marker rides on the
    // element and is consumed by the one toggle it belongs to.
    const text = src();
    expect(text).toContain('g.dataset.caFilterOpen = "1";');
    expect(text).toContain("delete details.dataset.caFilterOpen;");
    expect(text).not.toMatch(/private filtering/);
  });

  it("is silent about a no-op, so the marker cannot outlive its toggle", () => {
    // Setting `open` to what it already is fires nothing, and a marker left
    // behind would be eaten by the reader's next real click on that group.
    const text = src();
    const setOpen = text.slice(
      text.indexOf("const setOpen ="),
      text.indexOf("const groups = containerEl.querySelectorAll")
    );
    expect(setOpen).toContain("if (g.open === open) return;");
  });

  it("puts the folds back when the query is cleared", () => {
    // The reader's own answer is kept on the element because
    // `collapsedSettingsGroups` has no entry for a group nobody has touched —
    // its default is an argument to group(), which nothing outside group()
    // knows.
    const text = src();
    expect(text).toContain('details.dataset.caOpen = String(details.open);');
    expect(text).toContain('setOpen(g, g.dataset.caOpen === "true");');
  });
});

describe("nothing moves under the cursor when a value changes", () => {
  it("gives a settings row's control a fixed basis", () => {
    // `flex: 0 1 auto` sized the control to its content, so a longer answer
    // ate the description's width and re-wrapped it. The right edge does not
    // move either way — `justify-content: flex-end` pins it — so what this
    // changes is the LEFT edge, which is the one the description is measured
    // against.
    const control = rule(
      ".ca-settings-body > .setting-item > .setting-item-control,\n.ca-section-fold-body > .setting-item > .setting-item-control"
    );
    expect(control).toContain("flex: 0 0 var(--ca-settings-control-w)");
    expect(control).toContain("max-width: var(--ca-settings-control-w)");
  });

  it("defines that width as a token, unconditionally and without a fallback", () => {
    // The house rule: a `--ca-*` read has to be defined in 00-tokens.css, and a
    // token defined unconditionally must not carry a comma fallback — a
    // fallback on a token that is always set is a second value nobody
    // maintains. test/tokens.test.ts sweeps this generally; the point here is
    // that the settings width is one of them.
    const tokens = repoFile("styles/00-tokens.css");
    expect(tokens).toContain("--ca-settings-control-w: 250px;");
    expect(css()).not.toContain("var(--ca-settings-control-w,");
  });

  it("releases the basis where the row stacks", () => {
    // Below the container-query breakpoint the description sits ABOVE the
    // control rather than beside it, so there is nothing left to reflow and a
    // fixed basis would only make the control narrower than its row.
    const stack = css().indexOf(
      ".ca-settings .setting-item:not(.setting-item-inline) {"
    );
    expect(stack).toBeGreaterThan(0);
    // The nearest `@container` above the stacking rule is the one that owns it.
    const opens = css().slice(0, stack).lastIndexOf("@container (max-width: 520px)");
    expect(opens).toBeGreaterThan(0);
    const block = css().slice(opens, css().indexOf("\n}\n", stack));
    expect(block).toContain(
      ".ca-settings-body > .setting-item > .setting-item-control"
    );
    expect(block).toContain("flex: 1 1 auto");
  });

  it("makes the control fill its column instead of its answer", () => {
    // A select that grows with its selected option is the same reflow wearing a
    // different hat.
    expect(css()).toMatch(
      /\.ca-settings-body\s*>\s*\.setting-item\s*>\s*\.setting-item-control\s*>\s*select,/
    );
  });
});

describe("tables that sit under each other share one grid", () => {
  it("hands the three tracker tables the same columns", () => {
    // Diary built-ins, journal built-ins and custom carry the same five
    // headings and stack in the same group. Each sized itself from its own
    // rows, so "Surface" started at x=1057 in the first and x=1017 in the
    // third. One array, three call sites — they cannot drift apart again.
    const text = src();
    expect(text).toContain("private static readonly TRACKER_COLS");
    expect(
      (text.match(/widths: ChronoAnvilSettingTab\.TRACKER_COLS/g) ?? []).length
    ).toBe(3);
  });

  it("makes the colgroup binding rather than advisory", () => {
    // A <colgroup> under `table-layout: auto` is a suggestion the browser is
    // free to ignore the moment a cell wants more room, which is exactly when
    // the three tables disagreed.
    const fixed = rule(".ca-settings-table.is-fixed");
    expect(fixed).toContain("table-layout: fixed");
    // And a floor, so narrow panes scroll the wrap instead of crushing the
    // columns — the wrap already carries `overflow-x: auto`.
    expect(fixed).toMatch(/min-width: \d+px/);
    expect(rule(".ca-settings-table-wrap")).toContain("overflow-x: auto");
  });

  it("stops a nowrap pill from spilling out of a fixed column", () => {
    // Fixed columns do not grow for a long pill. `inline-block` is load-bearing:
    // `text-overflow` has nothing to act on while the pill is inline, which is
    // what a bare createSpan() produces.
    const guard = rule(
      ".ca-settings-table.is-fixed .ca-list-pill,\n.ca-settings-table.is-fixed .ca-col-name-sub"
    );
    expect(guard).toContain("display: inline-block");
    expect(guard).toContain("text-overflow: ellipsis");
  });
});

describe("a column of switches lines up with the heading over it", () => {
  it("centres the heading as well as the cell", () => {
    // `th` inherits the table's left alignment while `.ca-col-grain` centres
    // its cell, so the two ends of the same column were aligned differently.
    // Both are told the same thing now, and the renderer marks which columns
    // they are rather than the stylesheet guessing.
    expect(rule(".ca-settings-table th.ca-col-grain-head")).toContain(
      "text-align: center"
    );
    expect(src()).toContain("centerFrom: 1,");
    expect(src()).toContain('th.addClass("ca-col-grain-head");');
  });

  it("centres at every level between the cell and the switch", () => {
    // Centring only the outer wrapper left the box centred and the switch at
    // one end of it: Obsidian's `.setting-item-control` justifies to flex-end
    // and carries the platform's own padding. Measured 9px left of the
    // column's middle on every grain but the first.
    const chain = rule(
      ".ca-settings-table .ca-col-grain .ca-list-toggle,\n" +
        ".ca-settings-table .ca-col-grain .ca-list-toggle .setting-item,\n" +
        ".ca-settings-table .ca-col-grain .ca-list-toggle .setting-item-control"
    );
    expect(chain).toContain("justify-content: center");
    expect(chain).toContain("width: 100%");
  });

  it("spaces the grains evenly rather than by heading length", () => {
    // "Daily" and "Quarterly" are not the same width, and letting each column
    // take its heading's width spaced five identical switches at five
    // different intervals.
    expect(src()).toContain("60 / matrix.grains.length");
  });
});

describe("the derived paths under a root line up", () => {
  it("uses a grid track rather than a minimum width on the label", () => {
    // `min-width: 11ch` aligns the values of every row whose label is shorter
    // than 11ch and ragged-edges the rest. Under 02 · Diary that was most of
    // them — "Quarterly entries" and "Period dashboards" started their paths
    // 10px right of the other eight.
    const grid = rule(".ca-path-children");
    expect(grid).toContain("display: grid");
    expect(grid).toContain("grid-template-columns: max-content minmax(0, 1fr)");
    expect(rule(".ca-path-child")).toContain("display: contents");
    expect(rule(".ca-path-child-label")).not.toContain("min-width");
  });
});

describe("a wizard's footer stays where the reader aimed", () => {
  it("floors the body at the tallest step it has drawn", () => {
    // Obsidian centres a modal, so a step that is 200px shorter than the one
    // before it does not just shrink — the whole window moves up and takes the
    // footer with it. Measured on the journal wizard: Next at y=700, and the
    // Back/Save pair that replaced it at y=588.
    //
    // The floor is MEASURED, not declared: no number written in a stylesheet
    // knows how tall a step comes out on a reader's font and pane, and a flat
    // height would give a two-field step a screenful of nothing.
    const modal = readSrc("editor-modal");
    expect(modal).toContain("private tallestStep = 0;");
    const goTo = modal.slice(
      modal.indexOf("protected goTo(index: number): void {"),
      modal.indexOf("// Every step's objection")
    );
    // Measured BEFORE the step changes — refreshFrame() empties the body.
    expect(goTo.indexOf("this.tallestStep = Math.max")).toBeLessThan(
      goTo.indexOf("this.refreshFrame()")
    );
    expect(goTo).toContain("this.body.style.minHeight");
  });

  it("leans on the frame's own cap rather than inventing a second one", () => {
    // `.ca-editor-body` scrolls under a max-height on `.ca-editor-modal`, so
    // what `offsetHeight` reports is already clamped and the floor cannot push
    // the window past what that rule allows. A max-height written beside the
    // min-height would be a second answer to the same question.
    expect(rule(".ca-editor-modal")).toContain("max-height:");
    expect(rule(".ca-editor-body")).toContain("overflow-y: auto");
  });
});
