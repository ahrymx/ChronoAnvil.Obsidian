// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// What a drop onto something means. 4.45.1.
//
// THIS FILE EXISTS BECAUSE THREE SURFACES GOT IT WRONG THE SAME WAY. The chart
// grid, the journal cards and the section editor each wrote the same four-line
// splice, each inserted before the target in both directions, and each carried a
// comment explaining why the arithmetic was safe. It was safe; it was answering
// a different question. Two of those three had tests, and both tests asserted
// the defect underneath a comment describing the rule they meant.
//
// So the rule is asserted once, here, over the primitive all three now call —
// and each surface is asserted only to REACH it, in its own file. That is
// `journal-order.test.ts`'s own structure, said again for the same reason.

import { describe, expect, it } from "vitest";
import { dropOnto } from "../src/core/drop-onto";
import { readCode } from "./sources";

const L = ["a", "b", "c", "d"];

describe("the direction of a drop", () => {
  it("lands AFTER the target when the drag went down", () => {
    // "The thing you dropped on moves aside towards where you dragged from."
    expect(dropOnto(L, "a", "c")).toEqual(["b", "c", "a", "d"]);
  });

  it("lands BEFORE the target when the drag went up", () => {
    expect(dropOnto(L, "d", "b")).toEqual(["a", "d", "b", "c"]);
  });

  it("swaps neighbours in both directions, which is the drop that used to do nothing", () => {
    // THE REPORTED BUG. Downward onto the next item: lift `a` out, insert it
    // before the `b` that has just moved up into its place, and the list is
    // unchanged — so the commonest drag of all wrote nothing and read as broken.
    expect(dropOnto(L, "a", "b")).toEqual(["b", "a", "c", "d"]);
    expect(dropOnto(L, "b", "a")).toEqual(["b", "a", "c", "d"]);
  });

  it("is symmetric: a drop and the drop back are inverses", () => {
    // The property that makes a wrong direction obvious to a reader rather than
    // only to a test — undoing a drag is dragging it back.
    const there = dropOnto(L, "a", "c") as string[];
    expect(dropOnto(there, "a", "b")).toEqual(L);
  });

  it("moves a thing as far as it was dragged, rather than trading places", () => {
    // LIFT-AND-INSERT, NOT SWAP — the part the three old comments had right.
    // `d` onto `a` puts `d` first and pushes the rest down; a swap would put `a`
    // last, which is a move the reader can neither see nor have asked for.
    expect(dropOnto(L, "d", "a")).toEqual(["d", "a", "b", "c"]);
  });

  it("reaches both ends", () => {
    expect(dropOnto(L, "a", "d")).toEqual(["b", "c", "d", "a"]);
    expect(dropOnto(L, "d", "a")).toEqual(["d", "a", "b", "c"]);
  });
});

describe("the moves that are not moves", () => {
  it("answers null for a drop on itself", () => {
    expect(dropOnto(L, "b", "b")).toBeNull();
  });

  it("answers null for something that is not in the list, either end", () => {
    expect(dropOnto(L, "z", "b")).toBeNull();
    expect(dropOnto(L, "b", "z")).toBeNull();
  });

  it("answers null for a list too short to reorder", () => {
    expect(dropOnto(["a"], "a", "a")).toBeNull();
    expect(dropOnto([], "a", "b")).toBeNull();
  });

  it("never mutates what it was given", () => {
    const before = [...L];
    dropOnto(L, "a", "d");
    expect(L).toEqual(before);
  });

  it("keeps the caller's own objects rather than copies of them", () => {
    // Every surface here hangs state off these objects — a chart's spec, a
    // journal's kinds and trackers. A permutation that mapped them through
    // anything would be one careless spread away from dropping a field.
    const objs = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const out = dropOnto(objs, objs[0], objs[2]) as { id: number }[];
    expect(out[2]).toBe(objs[0]);
  });
});

describe("the three surfaces ask it rather than writing it again", () => {
  it("is called by the chart grid, the journal cards and the section editor", () => {
    expect(readCode("charts")).toContain("dropOnto(specs.map((s) => s.key), fromKey, ontoKey)");
    expect(readCode("journal-order")).toContain("dropOnto(journalOrder(plugin), fromId, ontoId)");
    expect(readCode("section-editor")).toContain("dropOnto(this.rows, from, id)");
  });

  it("leaves no copy of the splice behind in any of them", () => {
    // THE TRIPWIRE. If a fourth surface — or a revert of one of these three —
    // writes `rest.splice(rest.indexOf(x), 0, y)` again, it is reintroducing
    // exactly this bug, and it should turn this red rather than ship.
    for (const mod of ["charts", "journal-order", "section-editor", "journals-cards"]) {
      expect(readCode(mod), mod).not.toMatch(/splice\(\s*rest\.(indexOf|findIndex)/);
    }
  });
});
