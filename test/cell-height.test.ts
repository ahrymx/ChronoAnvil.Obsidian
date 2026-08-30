// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Setting a widget's height by dragging — 4.22.
//
// `cell-width.test.ts`'S SHAPE, AND FOR ITS REASON. The gesture is a pointer
// drag and this suite has no DOM, which is the exact shape that cost 4.8 eight
// patch rounds — every one of them in the wiring between a gesture and a page,
// and not one in the arithmetic. So `cell-height.ts` was given everything that
// can be decided without a DOM, and it is pinned hard here; the half that is
// left is asserted on the source and the stylesheet, where it is written.
//
// THREE LAYERS, IN THIS ORDER: the arithmetic, the whole note, then the drawing
// and the gesture read as text.

import { describe, expect, it } from "vitest";
import {
  HEIGHT_STEP,
  heightAbove,
  resizeCell,
  runWithHeight,
  setCellHeight,
  snapHeight,
} from "../src/core/cell-height";
import { parseHeights, heightOf, isHeightLine } from "../src/core/directive-grammar";
import { tidyHeights } from "../src/core/cell-move";
import { readCss, readSrc } from "./sources";

// `cell-width.test.ts`'s helper, and the comment there is the argument for it:
// a class matched as a substring cannot be told from a longer one with the same
// prefix, and every selector that opens a rule starts a line.
const ruleAt = (rules: string, sel: string): number =>
  rules.search(
    new RegExp("(?:^|\\n)" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s,{]")
  );

const ruleFor = (rules: string, sel: string): string => {
  const at = ruleAt(rules, sel);
  expect(at, `no rule for ${sel}`).toBeGreaterThan(-1);
  const open = rules.indexOf("{", at);
  return rules.slice(open, rules.indexOf("}", open));
};

// The worked example throughout: two columns, the second holding one widget
// that the note says is 240px tall.
//
//   0 row
//   1 diary:3
//   2 cell
//   3 height: 240
//   4 on-this-day:always
const SIZED = ["row", "diary:3", "cell", "height: 240", "on-this-day:always"];
const PLAIN = ["row", "diary:3", "cell", "on-this-day:always"];

describe("where a drag lands", () => {
  it("snaps to twenties", () => {
    // The step is a fact about the module, so it is read from it rather than
    // written twice — a test that hard-coded 20 would pass the day the constant
    // changed and the snapping did not.
    expect(HEIGHT_STEP).toBe(20);
    expect(snapHeight(247, 120, 900)).toBe(240);
    expect(snapHeight(251, 120, 900)).toBe(260);
    expect(snapHeight(250, 120, 900)).toBe(260);
    for (const px of [200, 340, 500]) {
      expect(snapHeight(px + 3, 120, 900)).toBe(px);
    }
  });

  it("floors at the minimum, which the caller reads from a token", () => {
    // A drag above the top of the card is a drag to the shortest a card may be,
    // not to nothing. The floor arrives as a number because `pxToken` read it
    // out of the stylesheet — this module never learns which token it was.
    expect(snapHeight(10, 120, 900)).toBe(120);
    expect(snapHeight(-400, 120, 900)).toBe(120);
    expect(snapHeight(119, 120, 900)).toBe(120);
  });

  it("returns null at and above the height the card already wants", () => {
    // THE WHOLE OF "DRAGGING IT BACK TAKES THE LINE AWAY", and the reason it is
    // arithmetic rather than a branch in the gesture. A height that is the height
    // the card already has is not a height: writing one would put a number in the
    // reader's file that changes nothing today, goes stale the first time the
    // widget has more in it, and could then never be dragged off — because
    // dragging down would only ever make it larger.
    expect(snapHeight(400, 120, 400)).toBeNull();
    expect(snapHeight(900, 120, 400)).toBeNull();
    expect(snapHeight(380, 120, 400)).toBe(380);
  });

  it("has an answer for a card shorter than the floor, and it is to write nothing", () => {
    // Falls out of the two rules above rather than being a case of its own:
    // every height such a card could be given is at or above its natural height.
    expect(snapHeight(200, 120, 90)).toBeNull();
    expect(snapHeight(60, 120, 90)).toBeNull();
  });

  it("writes nothing for a height that is not a number", () => {
    expect(snapHeight(Number.NaN, 120, 900)).toBeNull();
    expect(snapHeight(Number.POSITIVE_INFINITY, 120, 900)).toBeNull();
  });
});

describe("which widget a height sizes", () => {
  it("is the one on the line under it", () => {
    expect(heightAbove(SIZED, 4)).toBe(240);
  });

  it("is not one two lines up", () => {
    const body = ["row", "height: 240", "cell", "diary:3"];
    expect(heightAbove(body, 3)).toBeNull();
  });

  it("is nothing at all when the line under it is a header bar", () => {
    // A `header:` bar is not a card (row.ts, `NOT_A_CELL`), so a height above one
    // sizes nothing — and the widget under the BAR is not sized either, because
    // the line above it is the bar.
    const body = ["row", "height: 240", "header: Today", "diary:3"];
    expect(heightAbove(body, 2)).toBeNull();
    expect(heightAbove(body, 3)).toBeNull();
  });

  it("cannot be claimed by a directive that drew nothing (4.22 §2)", () => {
    // THE ARGUMENT FOR LOCATING IT BY THE LINE ABOVE, asserted rather than
    // written down. `cellPlan` locates a delimiter by COUNTING CHILDREN because
    // the dispatcher cannot hand back "the child that ended the last cell" — and
    // `on-this-day` on a young vault appends nothing at all.
    //
    // A height located by that count would size the NEXT widget instead. Located
    // by the line above it cannot: the sized widget is found through the
    // `data-ca-line` stamp, and a directive that drew nothing left no stamp — so
    // `applyCardHeights` never asks about that line and the widget after it is
    // asked about its OWN line, which has no height over it.
    const body = ["row", "height: 240", "on-this-day:always", "diary:3"];
    expect(heightAbove(body, 2)).toBe(240);
    expect(heightAbove(body, 3)).toBeNull();
    // And the walk is over stamped children, which is what makes the sentence
    // above true of the page and not only of the array.
    const src = readSrc("block-drag");
    const at = src.indexOf("export function applyCardHeights(");
    expect(at).toBeGreaterThan(-1);
    const fn = src.slice(at, src.indexOf("\n}\n", at));
    expect(fn).toContain("const line = lineOf(child);");
    expect(fn).toContain("if (line === null) continue;");
    expect(fn).toContain("heightAbove(body, line)");
  });

  it("refuses a line that is out of the body", () => {
    expect(heightAbove(SIZED, 0)).toBeNull();
    expect(heightAbove(SIZED, 99)).toBeNull();
  });
});

describe("writing the line", () => {
  it("inserts one above the widget", () => {
    expect(setCellHeight(PLAIN, 3, 240)).toEqual(SIZED);
  });

  it("rewrites the one that is there", () => {
    expect(setCellHeight(SIZED, 4, 300)).toEqual([
      "row",
      "diary:3",
      "cell",
      "height: 300",
      "on-this-day:always",
    ]);
  });

  it("deletes it", () => {
    expect(setCellHeight(SIZED, 4, null)).toEqual(PLAIN);
  });

  it("keeps the widget's own indent", () => {
    const body = ["row", "  diary:3", "  cell", "  on-this-day:always"];
    expect(setCellHeight(body, 3, 240)).toEqual([
      "row",
      "  diary:3",
      "  cell",
      "  height: 240",
      "  on-this-day:always",
    ]);
  });

  it("refuses a line that is not a widget", () => {
    // A gesture naming a `row` line, a delimiter or a bar is a stale render —
    // the note has been edited since the card was drawn — and the honest answer
    // is to write nothing. `setCellWidths`' own check, asked about a line.
    for (const line of [0, 2]) {
      expect(setCellHeight(PLAIN, line, 240), String(line)).toBeNull();
    }
    const withBar = ["row", "header: Today", "diary:3"];
    expect(setCellHeight(withBar, 1, 240)).toBeNull();
  });

  it("refuses a height that is not a whole number of pixels", () => {
    expect(setCellHeight(PLAIN, 3, 240.5)).toBeNull();
    expect(setCellHeight(PLAIN, 3, 0)).toBeNull();
    expect(setCellHeight(PLAIN, 3, -20)).toBeNull();
  });

  it("is null when nothing would change", () => {
    // The contract `moveCell`, `widenCells` and `applyFlatSections` all keep, and
    // the one that covers a reader who drags a mark and thinks better of it:
    // writing the file to say a card is the height it already was would put an
    // entry in every sync log in the vault.
    expect(setCellHeight(SIZED, 4, 240)).toBeNull();
    expect(setCellHeight(PLAIN, 3, null)).toBeNull();
  });
});

describe("what travels with a widget", () => {
  it("grows the range by one line only when a height is above it", () => {
    expect(runWithHeight(SIZED, 4)).toEqual({ from: 3, to: 5 });
    expect(runWithHeight(SIZED, 1)).toEqual({ from: 1, to: 2 });
    expect(runWithHeight(PLAIN, 3)).toEqual({ from: 3, to: 4 });
  });

  it("is what the drag actually asks for (4.22 §5.1)", () => {
    // The hazard is one shape rather than four bugs: a `height:` line is
    // positional, so a range of one line leaves it behind sizing whatever moves
    // up into its place.
    const src = readSrc("block-drag");
    expect(src).toContain("runWithHeight(body, line)");
    expect(src).not.toContain("const at = { from: line, to: line + 1 };");
  });
});

describe("the same, asked of a whole note", () => {
  const NOTE = [
    "# Home",
    "",
    "```chronoanvil",
    ...PLAIN,
    "```",
    "",
    "Some prose the reader wrote.",
    "",
    "```chronoanvil",
    "title: Home",
    "wide",
    "```",
    "",
  ];

  it("sets a height in the block it was asked about", () => {
    const next = resizeCell(NOTE, 0, 3, 240);
    expect(next).not.toBeNull();
    expect(next).toContain("height: 240");
    expect((next ?? []).indexOf("height: 240")).toBe(6);
  });

  it("re-emits every other fence as the lines it was read as", () => {
    // THE RECONCILER'S PROMISE, and the property that lets structure be
    // rewritten in a file somebody else wrote.
    const next = resizeCell(NOTE, 0, 3, 240) ?? [];
    const tail = next.slice(next.indexOf("Some prose the reader wrote."));
    expect(tail).toEqual(NOTE.slice(NOTE.indexOf("Some prose the reader wrote.")));
  });

  it("comes back null when nothing would change, and touches nothing", () => {
    expect(resizeCell(NOTE, 0, 3, null)).toBeNull();
    expect(resizeCell(NOTE, 0, 0, 240)).toBeNull();
    expect(resizeCell(NOTE, 9, 3, 240)).toBeNull();
    expect(resizeCell(NOTE, -1, 3, 240)).toBeNull();
  });

  it("takes it off again", () => {
    const sized = resizeCell(NOTE, 0, 3, 240) ?? [];
    expect(resizeCell(sized, 0, 4, null)).toEqual([...NOTE]);
  });
});

describe("the grammar", () => {
  it("knows its own line", () => {
    expect(isHeightLine("height: 240")).toBe(true);
    expect(isHeightLine("  height: 240")).toBe(true);
    expect(isHeightLine("heights: 240")).toBe(false);
    expect(isHeightLine("on-this-day:always")).toBe(false);
  });

  it("reads a whole number of pixels and refuses to cap it", () => {
    // `cellWeightOf`'s rules, and its argument: a height too large for the pane
    // makes the page scroll, which is the layout answering correctly rather than
    // the grammar guessing at a monitor it cannot see.
    expect(heightOf("height: 240")).toBe(240);
    expect(heightOf("height: 99999")).toBe(99999);
    expect(heightOf("height: 1")).toBe(1);
    expect(heightOf("height: 0")).toBeNull();
    expect(heightOf("height: 24.5")).toBeNull();
    expect(heightOf("height: tall")).toBeNull();
  });

  it("refuses a height with no value, where a bare cell is fine", () => {
    // THE ONE PLACE THE TWO DIVERGE. A delimiter with no value still delimits,
    // which is why a bare `cell` means one share. A height with no value says
    // nothing at all — there is no height a reader could mean by leaving it out.
    expect(heightOf("height")).toBeNull();
    expect(heightOf("height:")).toBeNull();
    expect(parseHeights(["row", "height", "diary:3"]).error).toContain(
      "isn't a height"
    );
  });

  it("refuses a height in a block with no row, and names the two ways out", () => {
    // §5.2's whole point: a sized widget dragged out of a group carries its
    // height into a block where a card is never drawn. Saying so is the
    // difference between a gesture that explains itself and a line that quietly
    // does nothing.
    const why = parseHeights(["height: 240", "diary:3"]).error ?? "";
    expect(why).toContain("row");
    expect(why).toContain("delete the height line");
    expect(parseHeights(["row", "height: 240", "diary:3"]).error).toBeNull();
  });

  it("quotes a bad value back", () => {
    const why = parseHeights(["row", "height: tall", "diary:3"]).error ?? "";
    expect(why).toContain("height: tall");
    expect(why).toContain("pixels");
  });

  it("says nothing about a block that has none", () => {
    expect(parseHeights(PLAIN).error).toBeNull();
    expect(parseHeights([]).error).toBeNull();
  });
});

describe("a height that sizes nothing", () => {
  it("goes", () => {
    expect(tidyHeights(["row", "height: 240", "cell", "diary:3"])).toEqual([
      "row",
      "cell",
      "diary:3",
    ]);
    expect(tidyHeights(["row", "diary:3", "height: 240"])).toEqual([
      "row",
      "diary:3",
    ]);
  });

  it("stays when it is above a widget", () => {
    expect(tidyHeights(SIZED)).toEqual(SIZED);
  });

  it("is not fooled by a bar", () => {
    const body = ["row", "height: 240", "header: Today", "diary:3"];
    expect(tidyHeights(body)).toEqual(["row", "header: Today", "diary:3"]);
  });
});

describe("the drawing", () => {
  const rules = readCss();

  it("states a height, so the card can be scrolled inside it", () => {
    // A BOX SIZED BY ITS CONTENT CANNOT BE SCROLLED INSIDE, which is the first of
    // the three declarations 4.13.4 proved on the subject cards.
    const sized = ruleFor(rules, ".ca-journal-widget-card.is-sized");
    expect(sized).toContain("height: var(--ca-card-h)");
    // And it does not divide that height with its siblings.
    expect(sized).toContain("flex: 0 0 auto");
  });

  it("scrolls the body and does not shrink the head", () => {
    // THE MIDDLE ONE IS THE ONE A READER DELETES AS REDUNDANT. Without it a full
    // card's title strip is squeezed to nothing, which is the failure of the
    // three that looks like a rendering glitch rather than a layout choice.
    expect(
      ruleFor(rules, ".ca-journal-widget-card.is-sized > .ca-journal-block-head")
    ).toContain("flex: 0 0 auto");
    const body = ruleFor(
      rules,
      ".ca-journal-widget-card.is-sized > :not(.ca-journal-block-head)"
    );
    expect(body).toContain("overflow-y: auto");
    expect(body).toContain("min-height: 0");
    expect(body).toContain("flex: 1 1 auto");
  });

  it("takes its floor from a token and never from TypeScript", () => {
    // DERIVED RATHER THAN REPEATED — `pxToken`'s rule, so there is no second
    // place for the two to disagree. The fallback in the source is only for a
    // render with no computed style to read.
    expect(rules).toMatch(/--ca-card-h-min:\s*\d+px/);
    const floor = rules.match(/--ca-card-h-min:\s*(\d+)px/);
    const px = Number(floor?.[1]);
    expect(px % HEIGHT_STEP, "a floor the drag can reach and return to").toBe(0);
    expect(readSrc("block-drag")).toContain('pxToken(card, "--ca-card-h-min"');
  });

  it("leaves no mark in the DOM for a card with no stated height", () => {
    // `row.ts`'s idiom for `--ca-cell-weight`, and the reason the common case is
    // the one with no inline style at all.
    const fn = readSrc("block-drag");
    const at = fn.indexOf("export function applyCardHeights(");
    const body = fn.slice(at, fn.indexOf("\n}\n", at));
    expect(body).toContain("if (px === null) continue;");
    expect(body).toContain("child.addClass(SIZED_CLASS);");
  });
});

describe("the gesture", () => {
  const src = readSrc("block-drag");
  const fn = ((): string => {
    const at = src.indexOf("function attachCardResize(");
    expect(at, "no attachCardResize").toBeGreaterThan(-1);
    return src.slice(at, src.indexOf("\n}\n", at));
  })();

  it("is a pointer drag, so it cannot collide with a drop", () => {
    // The two families cannot both be in progress: pointer events do not fire
    // during a native drag and a native drag is not started by a `pointerdown`.
    expect(fn).toContain('divider.addEventListener("pointerdown"');
    expect(fn).toContain("setPointerCapture");
    expect(fn).not.toContain("dragstart");
  });

  it("re-reads the note at pointerdown and never before", () => {
    // `indexNow`'s lesson, which cost 4.7 a patch: every drop rewrites the note,
    // so a block index or a body taken at render time describes a page that has
    // since moved.
    expect(fn).toContain("const where = noteNow();");
    expect(fn).toContain("const body = bodyNow();");
    expect(fn.indexOf("const where = noteNow();")).toBeLessThan(
      fn.indexOf("const natural =")
    );
  });

  it("measures the natural height with the stated one taken off", () => {
    // A card wearing `is-sized` is exactly as tall as the number on it, so its
    // `scrollHeight` would report that number straight back and every card would
    // be its own natural height — which would make the drag-to-clear impossible
    // for exactly the cards that have a line to clear.
    const at = fn.indexOf("card.removeClass(SIZED_CLASS);");
    expect(at).toBeGreaterThan(-1);
    const measure = fn.slice(at, fn.indexOf("let live", at));
    expect(measure).toContain("card.style.removeProperty(CARD_H_VAR);");
    expect(measure).toContain("const natural = card.scrollHeight;");
    expect(measure).toContain("restore();");
    // And never in `track`, where it would be sixty a second.
    const track = fn.slice(fn.indexOf("const track ="), fn.indexOf("const cancel ="));
    expect(track).not.toContain("scrollHeight");
    expect(track).toContain("card.getBoundingClientRect().top");
    expect(track).toContain("snapHeight(");
  });

  it("puts it back on Escape and writes nothing", () => {
    const at = fn.indexOf("const onKey = (e: KeyboardEvent)");
    const key = fn.slice(at, fn.indexOf("};", at));
    expect(key).toContain('e.key !== "Escape"');
    expect(key).toContain("cancel()");
  });

  it("leaves no inline height behind when nothing moved", () => {
    const at = fn.indexOf("const finish =");
    const finish = fn.slice(at, fn.indexOf("\n    };", at));
    expect(finish).toContain("if (live === start)");
    expect(finish).toContain("restore();");
    expect(finish).toContain("applyHeight(plugin, file, where.block, line, live)");
  });

  it("hangs one mark on every card, the last in a column included", () => {
    // N cards have N-1 seams between them, so a mark BETWEEN two cards can never
    // reach the last card in a column — and on the homepage this release is about
    // that is the widget with the most empty rows in it.
    const row = readSrc("row");
    expect(row).toContain("cls: CARD_DIVIDER_CLASS");
    expect(row).toContain('"aria-label": "Drag to set the height of this widget"');
    // Skipped by name, because the column divider is the only thing `layOutRow`
    // puts in a cell that the reader did not.
    expect(row).toContain("if (child.hasClass(GROUP_DIVIDER_CLASS)) continue;");
  });
});
