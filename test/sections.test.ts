// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The shared reconciler vocabulary — 5.24.
//
// WHAT IS BEING CHECKED, AND WHY IT IS CHECKED HERE. Four surfaces edit their
// notes through four planners, and until this release each carried its own copy
// of the pieces below: sift a plan into the sets a writer needs, decide where a
// new block goes, permute the blocks a reorder names, put a cut cell back in
// its row. The surface suites — `home-sections`, `dashboard-sections`,
// `journal-sections`, `entry-sections`, `section-rows` — check what each of
// those SURFACES does, and they are the real regression net. What they cannot
// check is the piece itself at the edges no catalogue happens to reach.
//
// So this file is deliberately about the seams: an empty plan, a band with one
// member, a chunk nobody owns, an id `want` names and the file does not have.
// Every one of those is a state a fifth surface would arrive in on its first
// day, and the point of the merge was that it should not have to discover them.

import { describe, expect, it } from "vitest";
import type { SectionOp } from "../src/core/section-model";
import type { Chunk, Section } from "../src/core/sections";
import {
  addOps,
  bindSection,
  finalOrder,
  foreignOp,
  insertionPoint,
  moveOpsFor,
  permuteChunks,
  plannedWrites,
} from "../src/core/sections";

// A catalogue entry with nothing in it but the fields a test names. `render`
// and `locate` are required by the type and unread by everything below except
// the binding tests, which say so.
const sec = (
  id: string,
  extra: Partial<Section<void>> = {}
): Section<void> => ({
  id,
  label: id[0].toUpperCase() + id.slice(1),
  blurb: `about ${id}`,
  icon: "square",
  locked: false,
  render: () => [{ kind: "fence", info: "chronoanvil", lines: [`${id}:`] }],
  locate: (text) => text.indexOf(`${id}:`),
  ...extra,
});

const mapOf = (...s: Section<void>[]): Map<string, Section<void>> =>
  new Map(s.map((x) => [x.id, x]));

const op = (kind: SectionOp["kind"], sectionId: string | null): SectionOp => ({
  kind,
  sectionId,
  label: sectionId ?? "—",
  detail: "",
});

describe("plannedWrites", () => {
  it("says there is nothing to do for a plan of keeps", () => {
    const w = plannedWrites([op("keep", "a"), op("keep", "b")]);
    expect(w.any).toBe(false);
    expect(w.removing.size).toBe(0);
    expect(w.adding).toEqual([]);
  });

  it("says there is nothing to do for an empty plan", () => {
    expect(plannedWrites([]).any).toBe(false);
  });

  // A `foreign` op names no section, and counting it as work would make every
  // note holding a reader's own fence report a pending write for ever.
  it("does not count a foreign block as work", () => {
    expect(plannedWrites([op("foreign", null)]).any).toBe(false);
  });

  // Each of the five on its own, because `any` is an OR and an OR is the shape
  // that silently loses a term.
  it.each([
    ["remove", "removing"],
    ["add", "adding"],
    ["move", "moving"],
    ["reconfigure", "rewriting"],
    ["extend", "extending"],
  ] as const)("counts a lone %s as work", (kind) => {
    expect(plannedWrites([op(kind, "a")]).any).toBe(true);
  });

  it("keeps the order the reader asked for in `adding`", () => {
    const w = plannedWrites([op("add", "c"), op("add", "a"), op("add", "b")]);
    expect(w.adding).toEqual(["c", "a", "b"]);
  });
});

describe("insertionPoint", () => {
  const order = ["a", "b", "c", "d"];

  it("puts a section after the last preceding one the file has", () => {
    const chunks = [{ ids: ["a"] }, { ids: ["d"] }];
    expect(insertionPoint(chunks, order, "b")).toBe(1);
  });

  it("puts one whose successors are all absent at the end", () => {
    expect(insertionPoint([{ ids: ["a"] }], order, "d")).toBe(1);
  });

  it("puts one whose predecessors are all absent at the front", () => {
    expect(insertionPoint([{ ids: ["c"] }, { ids: ["d"] }], order, "a")).toBe(0);
  });

  // A chunk nobody owns — the spacer, a reader's own fence, the blank line
  // between two blocks — is skipped rather than ranked, so a note with prose
  // above its first section still puts a new one below that section.
  it("steps over a chunk with no sections in it", () => {
    const chunks = [{ ids: [] }, { ids: ["a"] }, { ids: [] }, { ids: ["d"] }];
    expect(insertionPoint(chunks, order, "b")).toBe(2);
  });

  it("puts the first section of an empty file at the end of its chunks", () => {
    expect(insertionPoint([{ ids: [] }], order, "a")).toBe(1);
  });

  // THE RANK IS THE LAST OF A CHUNK'S SECTIONS, which is what makes a row of
  // two behave as one block: `b` outranks `a`, so a section between `b` and `d`
  // lands BELOW the whole fence rather than inside it.
  it("ranks a shared block by its last section", () => {
    const chunks = [{ ids: ["a", "b"] }, { ids: ["d"] }];
    expect(insertionPoint(chunks, order, "c")).toBe(1);
  });
});

describe("permuteChunks", () => {
  const chunk = (id: string): Chunk => ({ ids: [id], lines: [id] });

  it("reorders the chunks `want` names", () => {
    const chunks = [chunk("a"), chunk("b"), chunk("c")];
    permuteChunks(chunks, ["c", "b", "a"]);
    expect(chunks.map((c) => c.ids[0])).toEqual(["c", "b", "a"]);
  });

  // A section the reader never touched must not be dropped because it was not
  // in the list — `desiredOrder`'s second half, checked from this end.
  it("keeps a section `want` does not mention", () => {
    const chunks = [chunk("a"), chunk("b"), chunk("c")];
    permuteChunks(chunks, ["c", "a"]);
    expect(chunks.map((c) => c.ids[0])).toEqual(["c", "a", "b"]);
  });

  // A foreign block has no correct destination, so it stays where it is and the
  // sections trade the slots they had — the rule every reconciler states.
  it("leaves a chunk nobody owns at its own index", () => {
    const chunks = [chunk("a"), { ids: [], lines: ["mine"] }, chunk("b")];
    permuteChunks(chunks, ["b", "a"]);
    expect(chunks.map((c) => c.lines[0])).toEqual(["b", "mine", "a"]);
  });

  it("permutes within a band and never across one", () => {
    const chunks = [chunk("head"), chunk("x"), chunk("y")];
    const band = (id: string): string => (id === "head" ? "head" : "body");
    permuteChunks(chunks, ["y", "x", "head"], band, ["head", "body"]);
    expect(chunks.map((c) => c.ids[0])).toEqual(["head", "y", "x"]);
  });

  it("carries a chunk's own fields through the permutation", () => {
    const chunks = [
      { ids: ["a"], lines: ["a"], filler: false },
      { ids: ["b"], lines: ["b"], filler: true },
    ];
    permuteChunks(chunks, ["b", "a"]);
    expect(chunks.map((c) => c.filler)).toEqual([true, false]);
  });
});

describe("addOps and finalOrder", () => {
  const byId = mapOf(sec("a"), sec("b"), sec("c"));

  it("adds in the order the reader asked, not the catalogue's", () => {
    const { ops, adding } = addOps(
      ["c", "a"],
      () => false,
      byId,
      (s) => `adds ${s.label.toLowerCase()}`
    );
    expect(adding).toEqual(["c", "a"]);
    expect(ops.map((o) => o.detail)).toEqual(["adds c", "adds a"]);
  });

  it("skips an id the catalogue cannot resolve", () => {
    const { adding } = addOps(["a", "zz"], () => false, byId, () => "");
    expect(adding).toEqual(["a"]);
  });

  it("skips one the file already has", () => {
    const { adding } = addOps(["a", "b"], (id) => id === "a", byId, () => "");
    expect(adding).toEqual(["b"]);
  });

  // The entry catalogue's gate, and its only caller. A section the surface
  // refuses to admit must not appear in `adding` either — the writer walks that
  // list, so an op with no id behind it would be a promise nothing keeps.
  it("leaves a refused section out of both the ops and the ids", () => {
    const { ops, adding } = addOps(
      ["a", "b"],
      () => false,
      byId,
      () => "",
      (s) => s.id === "b"
    );
    expect(adding).toEqual(["b"]);
    expect(ops).toHaveLength(1);
  });

  it("reports the arrangement the adds and removes will leave behind", () => {
    const { surviving, target } = finalOrder(["a", "b", "c"], ["c", "a"], []);
    expect(surviving).toEqual(["a", "c"]);
    expect(target).toEqual(["c", "a"]);
  });

  it("counts an added section into the target but not the survivors", () => {
    const { surviving, target } = finalOrder(["a"], ["b", "a"], ["b"]);
    expect(surviving).toEqual(["a"]);
    expect(target).toEqual(["b", "a"]);
  });
});

describe("moveOpsFor", () => {
  const byId = mapOf(sec("a"), sec("b"), sec("c"));

  it("reports nothing when the order is unchanged", () => {
    expect(moveOpsFor(["a", "b"], ["a", "b"], [], byId)).toEqual([]);
  });

  it("reports the minimal set rather than everything that shifted", () => {
    const ops = moveOpsFor(["a", "b", "c"], ["c", "a", "b"], [], byId);
    expect(ops.map((o) => o.sectionId)).toEqual(["c"]);
  });

  // A band of one has no permutation but the identity, and a loop over it must
  // produce an empty list rather than a move nobody asked for.
  it("reports nothing for a band with one member", () => {
    const banded = mapOf(
      sec("head", { band: "head" }),
      sec("x", { band: "body" }),
      sec("y", { band: "body" })
    );
    const ops = moveOpsFor(
      ["head", "x", "y"],
      ["y", "x", "head"],
      [],
      banded,
      ["head", "body"]
    );
    // One move inside the body, and `head` is not among them: its band holds
    // one member, so the `want` that named it last could not be acted on.
    expect(ops).toHaveLength(1);
    expect(ops.map((o) => o.sectionId)).not.toContain("head");
  });

  // A `want` that interleaves two bands is not refused with a message because
  // it is not REPRESENTABLE — each band is reordered against its own part of
  // the list, so a mixed list resolves to the same permutations as a clean one.
  it("resolves an interleaved want to the same moves as a partitioned one", () => {
    const banded = mapOf(
      sec("h1", { band: "head" }),
      sec("h2", { band: "head" }),
      sec("b1", { band: "body" }),
      sec("b2", { band: "body" })
    );
    const order = ["h1", "h2", "b1", "b2"];
    const mixed = moveOpsFor(order, ["h2", "b2", "h1", "b1"], [], banded, [
      "head",
      "body",
    ]);
    const clean = moveOpsFor(order, ["h2", "h1", "b2", "b1"], [], banded, [
      "head",
      "body",
    ]);
    expect(mixed).toEqual(clean);
  });
});

describe("foreignOp", () => {
  it("is silent when there is nothing foreign", () => {
    expect(foreignOp(0, "block", "in this file")).toBeNull();
  });

  // Singular and plural both, which three of the four surfaces got wrong on
  // their own: they hard-coded "aren't" and reported "1 block ... aren't".
  it("agrees with itself about number", () => {
    expect(foreignOp(1, "block", "in this file")?.detail).toBe(
      "1 block in this file isn't the catalogue's; left alone"
    );
    expect(foreignOp(2, "block", "in this file")?.detail).toBe(
      "2 blocks in this file aren't the catalogue's; left alone"
    );
  });

  it("names no section, because a foreign block is nobody's", () => {
    expect(foreignOp(1, "line", "in this entry's widget fence")?.sectionId).toBe(
      null
    );
  });
});

describe("bindSection", () => {
  interface Ctx {
    grain: string;
  }
  const fromCtx = (): Section<Ctx> => ({
    id: "x",
    label: "X",
    blurb: "b",
    icon: "square",
    locked: false,
    row: (c) => (c.grain === "week" ? "lately" : undefined),
    bar: (c) => `header: ${c.grain}`,
    optIn: (c) => c.grain === "year",
    render: (c, opts) => [
      { kind: "fence", info: "chronoanvil", lines: [`x: ${c.grain}`, ...(opts ? ["opt"] : [])] },
    ],
    locate: (text, c) => text.indexOf(c.grain),
  });

  it("resolves the three fields that may be a function of the context", () => {
    const bound = bindSection(fromCtx(), { grain: "week" });
    expect(bound.row).toBe("lately");
    expect(bound.bar).toBe("header: week");
    expect(bound.optIn).toBe(false);
  });

  it("closes the context into render and locate", () => {
    const bound = bindSection(fromCtx(), { grain: "month" });
    expect(bound.render(undefined)).toEqual([
      { kind: "fence", info: "chronoanvil", lines: ["x: month"] },
    ]);
    expect(bound.locate("a month here", undefined)).toBe(2);
  });

  // The journal template's refusal: a cell there is a cell because the READER
  // put it in the widget form, so handing the title back would reverse them.
  it("withholds the solo bar when the surface asks it to", () => {
    expect(bindSection(fromCtx(), { grain: "week" }, { keepBar: false }).bar)
      .toBeUndefined();
  });

  // A layout's overrides are a DEFAULT and a reader's choice is an ANSWER, so
  // the answer wins and a choice that says nothing leaves the default alone.
  it("puts a surface's defaults under the caller's options", () => {
    const seen: unknown[] = [];
    const section: Section<Ctx, Record<string, unknown>> = {
      ...fromCtx(),
      render: (_c, opts) => {
        seen.push(opts);
        return [];
      },
    };
    const bound = bindSection(section, { grain: "week" }, {
      defaults: { form: "preset", extra: 1 },
    });
    bound.render(undefined, { form: "widget" });
    bound.render(undefined);
    expect(seen).toEqual([
      { form: "widget", extra: 1 },
      { form: "preset", extra: 1 },
    ]);
  });

  it("draws through the surface's own renderer where it has one", () => {
    const bound = bindSection(fromCtx(), { grain: "week" }, {
      renderWith: (s, c, opts) =>
        s.render(c, opts).map((b) =>
          b.kind === "fence" ? { ...b, lines: b.lines.slice(1) } : b
        ),
    });
    expect(bound.render(undefined)).toEqual([
      { kind: "fence", info: "chronoanvil", lines: [] },
    ]);
  });

  // NOT `...section`. `applies`, `default` and `parts` are typed for the
  // context and the row machinery reads none of them; carrying them onto a
  // bound section would put a parameter on it that nothing can supply.
  it("does not carry the members that take a context", () => {
    const bound = bindSection(
      { ...fromCtx(), applies: () => true, default: () => true },
      { grain: "week" }
    ) as Record<string, unknown>;
    expect(bound.applies).toBeUndefined();
    expect(bound.default).toBeUndefined();
  });

  it("carries the plain data a window draws", () => {
    const bound = bindSection(
      { ...fromCtx(), pinned: true, repeatable: true, cell: "aside", tab: true },
      { grain: "week" }
    );
    expect(bound.pinned).toBe(true);
    expect(bound.repeatable).toBe(true);
    expect(bound.cell).toBe("aside");
    expect(bound.tab).toBe(true);
  });
});
