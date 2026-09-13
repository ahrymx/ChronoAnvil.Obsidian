// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// 1.0.15 — the two sections a phone drew badly, and the four causes behind it.
//
// *"fix the visual overly compactness of elements in mobile resolutions ... the
// logbook and what's below sections ... everything else is good."*
//
// Three screenshots, and the four faults in them have three distinct causes and
// one theme. The theme is that every one of them is a rule that was RIGHT where
// it was written and reached somewhere it was never measured:
//
//   1. A `<button>` held by one class. Two of them, in the logbook card's head.
//      (0,1,0) loses to the app's own mobile `button` rules at (0,1,1), so the
//      stamp took a ground and a button's padding and pushed the third control
//      off the card. This sheet warns about this twice and it happened anyway,
//      which is why the assertion is mechanical now.
//   2. A `@media (max-width: 620px)` written for the SETTINGS list — four action
//      buttons, a dropdown, pills — reaching the dense row that sits on a note.
//      A phone is under 620px, so every kind-table row became three stacked
//      full-width bands: a tick alone, then the values, then a rule and one `⋯`.
//   3. A collapsed column of values that assumed every cell has one. Three of
//      six lines on the reader's Projects card were the empty placeholder.
//   4. `el.hidden` on two elements an author rule gives a `display` to, so the
//      picking bar and the add row were on screen together.
//
// WHAT THIS SUITE IS NOT. There is no jsdom and no phone here, so none of this
// is a rendering assertion — it is the set of rules the render follows, each
// naming the fault it prevents. The rendering was checked against the reader's
// screenshots, which is the only place it can be.

import { describe, expect, it } from "vitest";
import { cssRule, readCode, readCss, repoFile } from "./sources";

// The block of a `@media`/`@container` branch, from its opening line to the
// closing brace in the first column. Rules inside are indented, so a `\n}` at
// column zero is the branch's own end and nothing else's.
function branch(file: string, opener: string): string {
  const css = repoFile(file);
  const at = css.indexOf(opener);
  expect(at, opener).toBeGreaterThan(-1);
  const end = css.indexOf("\n}", at);
  expect(end, opener).toBeGreaterThan(at);
  return css.slice(at, end);
}

describe("a settings list's breakpoint stops reaching notes (cause 2)", () => {
  const NARROW = branch(
    "styles/85-tracker-controls.css",
    "@media (max-width: 620px)"
  );

  it("wraps every row except the dense one", () => {
    // Each clause of this branch is about a settings row: four action buttons
    // beside pills beside a dropdown. The dense variant is the same component on
    // a NOTE, where the actions slot holds one `⋯` and the lead holds one tick —
    // and stacking those turned a two-line row into a 250px tower on a phone.
    for (const sel of [
      ".ca-list-row:not(.is-dense) {",
      ".ca-list-row:not(.is-dense) .ca-list-main {",
      ".ca-list-row:not(.is-dense) .ca-list-actions {",
    ]) {
      expect(NARROW, sel).toContain(sel);
    }
    // And no bare selector left behind: one of the three keeping its old reach
    // is the whole fault, because the row wraps if any single clause says so.
    expect(NARROW).not.toMatch(/\n\s*\.ca-list-row \{/);
    expect(NARROW).not.toMatch(/\n\s*\.ca-list-(main|actions) \{/);
  });

  it("leaves the settings list itself alone", () => {
    // The narrowing is not a retreat from the rule. A modal's list has no
    // container to query and would simply stop wrapping if this became a
    // `@container`, which is why only the audience changed.
    expect(NARROW).toContain(".ca-settings-sub");
  });

  it("hands the dense row to the container query that owns it", () => {
    // 3.9 §3: everything responsive here is `@container`, because the question a
    // row asks is about the width of its BOX and a media query answers about the
    // window. The dense row already has one.
    expect(repoFile("styles/94-native-tables.css")).toContain(
      "@container (max-width: 460px)"
    );
  });
});

describe("a collapsed row reads as a title and a meta line (cause 3)", () => {
  const COLLAPSE = branch(
    "styles/94-native-tables.css",
    "@container (max-width: 460px)"
  );

  it("draws no line for a cell with nothing in it", () => {
    // `ChronoAnvil / — / 1 / — / Today / —` is the reader's Projects card: six
    // lines, three of them a dash. One track was still a table.
    expect(COLLAPSE).toContain(".ca-list-cell.is-empty {\n    display: none;\n  }");
  });

  it("gives the name the width and lets the values flow after it", () => {
    expect(COLLAPSE).toContain("flex-wrap: wrap");
    expect(COLLAPSE).toContain(".ca-list-main.is-columned > .ca-list-title");
    expect(COLLAPSE).toContain("flex: 0 0 100%");
  });

  it("separates drawn values only, on the general sibling combinator", () => {
    // `+` would put a mark in front of a cell whose only predecessor is an
    // undrawn one — a leading `·` on exactly the rows this rule exists for.
    expect(COLLAPSE).toContain(
      ".ca-list-cell:not(.is-empty) ~ .ca-list-cell:not(.is-empty)::before"
    );
    expect(COLLAPSE).not.toContain(".ca-list-cell + .ca-list-cell");
  });
});

describe("one spelling of 'this row has no value' (cause 3)", () => {
  it("is named once and agreed with the other producer", () => {
    // `recordCell` marks the cell and `relativeActivity` writes the same
    // character for a folder that has never been touched. Two producers, one
    // string: the day they drift, dashes come back on a phone and nothing in
    // either file says why.
    const tables = readCode("ui/tables");
    expect(tables).toContain('const EMPTY_CELL = "—";');
    expect(readCode("core/query")).toContain('if (!iso) return "—";');
    // No literal left behind in the cells tables.ts writes.
    expect(tables).not.toContain('recordCell(main, date ?? "—")');
  });

  it("marks the cell wherever the text is written, not only at build", () => {
    // Two of the three producers write after the row exists: the open-task count
    // arrives from an async body read, and a rating cell chooses between a
    // digit, a gauge and a dash.
    const tables = readCode("ui/tables");
    expect(tables).toContain('cell.toggleClass("is-empty", text === "" || text === EMPTY_CELL);');
    expect(tables).toContain("cellText(openCell,");
    expect(tables).toContain("cellText(host, EMPTY_CELL);");
  });

  it("clears the mark for a gauge, which is a value with no text", () => {
    // The cell is created empty and filled with segments. Without this the sheet
    // would hide a drawn bar at the collapse width.
    const tables = readCode("ui/tables");
    const at = tables.indexOf("const bar = host.createDiv");
    expect(at).toBeGreaterThan(-1);
    expect(tables.slice(at - 200, at)).toContain('host.removeClass("is-empty");');
  });
});

describe("the logbook card's head, at a phone's width (cause 1)", () => {
  it("names the parent, the element and the class on both buttons", () => {
    // The stamp and the three icon controls are `<button>`s that are supposed to
    // look like text and like marks. One class cannot hold that: the app reaches
    // (0,1,1) by naming the element beside a class, and on a phone it took the
    // ground, the padding and the height back.
    const css = readCss();
    expect(css).toContain(".ca-journal-capture-head > button.ca-journal-capture-time");
    expect(css).toContain(
      ".ca-journal-capture-actions > button.ca-journal-capture-btn"
    );
  });

  it("states the stamp's ground, edge, padding and height", () => {
    // Every property the app sets has to be said here, or the one left out is
    // the one that comes back.
    const rule = cssRule(".ca-journal-capture-head > button.ca-journal-capture-time");
    expect(rule).toContain("background: none");
    expect(rule).toContain("border: none");
    expect(rule).toContain("box-shadow: none");
    expect(rule).toContain("padding: 0");
    expect(rule).toContain("min-height: 0");
  });

  it("wraps, so the controls land under the head rather than outside the card", () => {
    // A tag, a stamp and three targets will not share a line on a phone however
    // honestly they are drawn. In the reader's screenshot the third control was
    // cut off at the card's edge.
    expect(cssRule(".ca-journal-capture-head")).toContain("flex-wrap: wrap");
  });

  it("keeps the type tag on one line", () => {
    // `WORK LOG` broken in half reads as two tags.
    expect(cssRule(".ca-journal-capture-type-tag")).toContain("white-space: nowrap");
  });

  it("makes the three controls real targets on a phone", () => {
    // 1.7em is 27px at a phone's text size, under §3.3's 40px floor — and these
    // three are the only way to cross an item off, correct it or remove it. The
    // shared list in `00-tokens.css` sets `min-height` alone, which would leave a
    // 27×40 target on a square, so this reads the token here instead.
    const rule = cssRule(
      "body.is-mobile .ca-journal-capture-actions > button.ca-journal-capture-btn"
    );
    expect(rule).toContain("width: var(--ca-control-min)");
    expect(rule).toContain("height: var(--ca-control-min)");
  });
});

describe("the tick, at a phone's width (cause 1 again)", () => {
  it("is sized through its element, in both axes", () => {
    // As one class this lost to the app's own checkbox rule, rendered at the
    // app's size, overflowed an 18px reserve and wrapped the row it was in.
    // Height was never declared at all.
    const rule = cssRule(".ca-list.is-editing .ca-list-lead > input.ca-list-tick");
    expect(rule).toContain("width: var(--ca-row-tick-w)");
    expect(rule).toContain("height: var(--ca-row-tick-w)");
  });

  it("grows on a phone through the property the reserve reads", () => {
    // One value moves and the heading strip's left reserve follows it, which is
    // what the shared custom property is for. Not 40px: while picking, the thing
    // a finger aims at is the whole row.
    expect(cssRule("body.is-mobile .ca-list.is-editing")).toContain(
      "--ca-row-tick-w: 24px"
    );
    expect(cssRule(".ca-list.is-editing .ca-list-row")).toContain("cursor: pointer");
  });
});
