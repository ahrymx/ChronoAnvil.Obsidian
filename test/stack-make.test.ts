// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Making a stack from the section editor — 5.29.
//
// WHAT WAS MISSING. 5.28 named the arrangement and taught the file to say it:
// `stack` on the fence, a card in *Edit sections…* that says *Stack*, a button
// that breaks one up. Nothing made one. The weld happened at COMPOSE time, so
// a note written before 5.28, or one where the reader had unticked the logging
// grid and ticked it back, had three cards and no gesture that could join
// them. The reader asked for the other half:
//
//   *"the section editor needs a way for users to initiate the banner as a
//   stack. perhaps it has a special link button different from other sections
//   (highlighted or different icon), then approved widgets (for now that is
//   trackers and what's below) can be linked into the stack."*
//
// WHAT IS ASSERTED HERE, in the order the press travels:
//
//   THE ARRANGEMENT — `weldInto` and the third bit, in `row-order.ts`, which is
//   pure and is where every rule about what may be welded to what lives.
//
//   THE WRITE — the `weld` target in `cell-move.ts` and the phase in
//   `regroupFlatNote` that chooses it, ending in the assertion this feature is
//   really for: the fence the READER makes is the fence the COMPOSER makes,
//   byte for byte.
//
//   THE DOORS — which of the two buttons is drawn, and when. One per state, so
//   the window never offers two ways to do one thing.

import { describe, expect, it } from "vitest";
import {
  blocksOf,
  breakUp,
  moveBlock,
  normalise,
  takeOut,
  weldInto,
  type Arrangement,
} from "../src/core/row-order";
import { moveCell } from "../src/core/cell-move";
import { STACK_KEYWORD, isStackLine } from "../src/core/directive-grammar";
import { STUDY_JOURNAL } from "../src/journals/journal";
import { composeTemplate } from "../src/journals/custom-journal";
import {
  defaultSectionIds,
  templateTargets,
} from "../src/journals/journal-sections";
import type { SectionContext } from "../src/journals/journal-sections";
import { journalSectionModel } from "../src/journals/journal-plan";
import { readCss, readSrc } from "./sources";

// ── the arrangement ───────────────────────────────────────────────────

const ROWS = ["banner", "trackers", "prose", "children"];

const at = (
  rows: readonly string[] = ROWS,
  joined: readonly string[] = [],
  stacked: readonly string[] = []
): Arrangement => ({
  rows,
  joined: new Set(joined),
  paged: new Set(),
  stacked: new Set(stacked),
});

const shape = (a: Arrangement | null): string[][] =>
  a ? blocksOf(a.rows, a.joined) : [];

describe("the third bit", () => {
  it("welds a row into the host's block, at the end", () => {
    const out = weldInto(at(), ROWS, "trackers", "banner");
    expect(shape(out)).toEqual([["banner", "trackers"], ["prose"], ["children"]]);
    expect([...(out?.stacked ?? [])]).toEqual(["trackers"]);
  });

  it("brings a row up from further down and lands it at the end", () => {
    // A WELD HAS NO NEAREST EDGE. `joinInto` arrives through the closest one so
    // that take-out and re-join are a round trip; a stack's opener is the
    // section whose fence it is, so everything else lands after it however far
    // it travelled.
    const start = weldInto(at(), ROWS, "trackers", "banner")!;
    const out = weldInto(start, ROWS, "children", "banner");
    expect(shape(out)).toEqual([
      ["banner", "trackers", "children"],
      ["prose"],
    ]);
    expect([...(out?.stacked ?? [])].sort()).toEqual(["children", "trackers"]);
  });

  it("welds onto any row of the host's block, not only the one that opens it", () => {
    // The reader points at the card. `children` naming `banner` and `children`
    // naming `trackers` are the same request once the two are one block, which
    // is the chain `composeSectionRuns` follows on the compose side.
    const start = weldInto(at(), ROWS, "trackers", "banner")!;
    const out = weldInto(start, ROWS, "children", "trackers");
    expect(shape(out)).toEqual([
      ["banner", "trackers", "children"],
      ["prose"],
    ]);
  });

  it("travels down past a host that is above nothing", () => {
    // A row ABOVE its host still lands after it, because the host opens the
    // fence. `joinInto` would have put it in front.
    const rows = ["trackers", "banner", "prose"];
    const out = weldInto(at(rows), rows, "trackers", "banner");
    expect(shape(out)).toEqual([["banner", "trackers"], ["prose"]]);
  });

  it("refuses a row that is already in a block with something", () => {
    const start = weldInto(at(), ROWS, "trackers", "banner")!;
    expect(weldInto(start, ROWS, "trackers", "banner")).toBeNull();
  });

  it("is spread across the whole block, because a fence is one arrangement", () => {
    // `parseStack` refuses a fence that is also a row, so half a stack is not a
    // shape the file can hold. Marking the second member marks all of them.
    const out = normalise(
      ["a", "b", "c"],
      new Set(["b", "c"]),
      new Set(),
      new Set(["b"])
    );
    expect([...out.stacked].sort()).toEqual(["b", "c"]);
  });

  it("drops the bit from a row that is in no block", () => {
    const out = normalise(["a", "b"], new Set(), new Set(), new Set(["b"]));
    expect([...out.stacked]).toEqual([]);
  });

  it("comes off the row that leaves and stays on the ones that remain", () => {
    const three = weldInto(
      weldInto(at(), ROWS, "trackers", "banner")!,
      ROWS,
      "children",
      "banner"
    )!;
    const out = takeOut(three, ROWS, "children");
    expect(shape(out)).toEqual([["banner", "trackers"], ["prose"], ["children"]]);
    expect([...(out?.stacked ?? [])]).toEqual(["trackers"]);
  });

  it("comes off every row when the stack is broken up", () => {
    const two = weldInto(at(), ROWS, "trackers", "banner")!;
    const out = breakUp(two, ROWS, "banner");
    expect(shape(out)).toEqual([["banner"], ["trackers"], ["prose"], ["children"]]);
    expect([...(out?.stacked ?? [])]).toEqual([]);
  });

  it("survives a move of the whole block, which is what a bit has to do", () => {
    // The reader welds, then moves the card down the page. A bit that did not
    // travel would silently unstack the thing they had just made.
    const two = weldInto(at(), ROWS, "trackers", "banner")!;
    const out = moveBlock(two, ROWS, "banner", 1);
    expect(shape(out)).toEqual([["prose"], ["banner", "trackers"], ["children"]]);
    expect([...(out?.stacked ?? [])]).toEqual(["trackers"]);
  });
});

// ── the write ─────────────────────────────────────────────────────────

const fence = (...body: string[]): string =>
  ["```chronoanvil", ...body, "```"].join("\n");

const bodyOf = (text: string, n = 0): string[] => {
  const out: string[][] = [];
  let open: string[] | null = null;
  for (const line of text.split("\n")) {
    if (line.trim().startsWith("```chronoanvil")) {
      open = [];
      continue;
    }
    if (open && line.trim() === "```") {
      out.push(open);
      open = null;
      continue;
    }
    open?.push(line);
  }
  return out[n] ?? [];
};

describe("the weld target", () => {
  const NOTE = [fence("journal-header"), "", fence("header:📊 Trackers", "tracker:status")].join("\n");

  it("appends the run under a divider and opens the fence with the word", () => {
    const out = moveCell(
      NOTE.split("\n"),
      { block: 1, from: 0, to: 2 },
      { kind: "weld", block: 0 }
    );
    expect(out).not.toBeNull();
    expect(bodyOf(out!.join("\n"))).toEqual([
      // ONE LINE OPENING THE HOST, ONE OPENING THE ARRIVAL (5.29). The word
      // declares the fence and divides it, which is the whole of what lets the
      // section come back OUT again: `hasKnownExtent` says no for anything
      // rendering more than one line, so without a divider the grid could be
      // welded and never unwelded.
      STACK_KEYWORD,
      "journal-header",
      STACK_KEYWORD,
      "header:📊 Trackers",
      "tracker:status",
    ]);
    // NO `cell` ANYWHERE. That is the whole difference between the two
    // arrangements, and the one thing a reader would see instantly if it were
    // wrong: two columns where they asked for two bands.
    expect(out!.join("\n")).not.toContain("\ncell");
  });

  it("opens the fence once, and each arrival after that", () => {
    // A HOST THAT ALREADY SAYS IT IS A STACK does not say it twice: the top
    // line is the fence's declaration and the host's own opener, and a second
    // one there would open a section with nothing in it.
    const three = [
      fence(STACK_KEYWORD, "journal-header", "tracker:status"),
      "",
      fence("header:🗂️ Topics", "level-index"),
    ].join("\n");
    const out = moveCell(
      three.split("\n"),
      { block: 1, from: 0, to: 2 },
      { kind: "weld", block: 0 }
    );
    const body = bodyOf(out!.join("\n"));
    expect(body.filter((l) => isStackLine(l.trim()))).toHaveLength(2);
    expect(body[0]).toBe(STACK_KEYWORD);
    expect(body[3]).toBe(STACK_KEYWORD);
    expect(body.slice(4)).toEqual(["header:🗂️ Topics", "level-index"]);
  });

  it("takes the divider back out with the section that leaves", () => {
    // `CellSource.drop`, and the reason it exists: the line says where a
    // section starts INSIDE the fence, so a section that has left may not carry
    // it — and it may not stay behind either, opening a part with nothing in it
    // that would swallow whatever came next.
    const welded = fence(
      STACK_KEYWORD,
      "journal-header",
      STACK_KEYWORD,
      "header:📊 Trackers",
      "tracker:status"
    );
    const out = moveCell(
      welded.split("\n"),
      { block: 0, from: 2, to: 5, drop: 1 },
      { kind: "block", at: 1 }
    );
    expect(out).not.toBeNull();
    expect(bodyOf(out!.join("\n"), 0)).toEqual([STACK_KEYWORD, "journal-header"]);
    expect(bodyOf(out!.join("\n"), 1)).toEqual([
      "header:📊 Trackers",
      "tracker:status",
    ]);
  });

  it("refuses a range that is nothing but the line it drops", () => {
    const welded = fence(STACK_KEYWORD, "journal-header", STACK_KEYWORD, "tracker:status");
    expect(
      moveCell(
        welded.split("\n"),
        { block: 0, from: 2, to: 3, drop: 1 },
        { kind: "block", at: 1 }
      )
    ).toBeNull();
  });

  it("refuses a destination that is already a row", () => {
    // `parseStack` refuses a fence that claims both arrangements, so the write
    // must not be able to produce one.
    const rowed = [
      fence("row", "diary:3", "cell", "tasks-table"),
      "",
      fence("tracker:status"),
    ].join("\n");
    expect(
      moveCell(rowed.split("\n"), { block: 1, from: 0, to: 1 }, { kind: "weld", block: 0 })
    ).toBeNull();
  });

  it("is the one kind the page head's block accepts", () => {
    // 4.11's rule stands for everything that could DISPLACE the head — this is
    // the exception 5.28 earned, and the proof it is narrow.
    const src = { block: 1, from: 0, to: 2 } as const;
    expect(
      moveCell(NOTE.split("\n"), src, { kind: "weld", block: 0 })
    ).not.toBeNull();
    expect(
      moveCell(NOTE.split("\n"), src, { kind: "cell", block: 0, at: 1 })
    ).toBeNull();
    expect(
      moveCell(NOTE.split("\n"), src, { kind: "group", block: 0, side: "right" })
    ).toBeNull();
  });

  it("still refuses to move the page head itself, or to swap with it", () => {
    const stacked = fence(
      STACK_KEYWORD,
      "journal-header",
      "header:🗂️ Topics",
      "level-index"
    );
    // The head as a source. Line 1 of the body, because line 0 is the word.
    expect(
      moveCell(stacked.split("\n"), { block: 0, from: 1, to: 2 }, { kind: "block", at: 1 })
    ).toBeNull();
    // AND THE WORD ITSELF IS NOT A RUN. It describes the block; `STRUCTURE`
    // says so, and until 5.29 it did not — a `stack` line could be lifted into
    // a fence of its own, and every widget count in `cell-move.ts` read a
    // stacked fence as one directive wider than it is.
    expect(
      moveCell(stacked.split("\n"), { block: 0, from: 0, to: 1 }, { kind: "block", at: 1 })
    ).toBeNull();
    // And nothing trades places inside its fence either. Widening the rule for
    // a swap was tried, so that two welded sections could be reordered, and put
    // back: phase three of `regroupFlatNote` swaps ONE LINE, which is a column
    // holding one directive and not a section spanning a header, a region and a
    // table — it would have traded an anchor and left the rest behind.
    expect(
      moveCell(
        stacked.split("\n"),
        { block: 0, from: 2, to: 4 },
        { kind: "swap", block: 0, at: 1 }
      )
    ).toBeNull();
  });
});

// ── the file the two paths write ──────────────────────────────────────

// The subject index, as the composer writes it: one stack of three.
const composed = (): { ctx: SectionContext; text: string } => {
  const found = templateTargets(STUDY_JOURNAL)
    .map((t) => ({
      ctx: t.ctx,
      text: composeTemplate(
        t.ctx,
        defaultSectionIds(t.ctx),
        STUDY_JOURNAL.layout?.[t.key]
      ),
    }))
    .find(({ text }) => text.split("\n").some((l) => l.trim() === STACK_KEYWORD));
  if (!found) throw new Error("no template composes a stack");
  return found;
};

// The same note as it would be WITHOUT the weld: each section in a fence of its
// own, in the same order, each wearing the bar it wears standing alone. This is
// the note a reader has if they wrote it before 5.28 or unticked the grid and
// ticked it back.
const APART = [
  "---",
  "type: subject",
  "---",
  "`chronoanvil:spacer`",
  fence("journal-header"),
  "",
  fence(
    "header:📊 Trackers",
    "# chronoanvil:trackers:start",
    "tracker:status",
    "# chronoanvil:trackers:end"
  ),
  "",
  fence("header:🗂️ Topics", "button:study:new-container", "level-index"),
  "",
].join("\n");

describe("the fence the reader makes", () => {
  it("is the fence the composer makes", () => {
    // THE ASSERTION THIS FEATURE IS FOR. `cell-move.ts` states the rule out
    // loud for rows — *two ways of making one object must write one file* — and
    // a stack a reader welds must be the same object as one the plugin
    // composed, or the next release supports two spellings of one card.
    //
    // IT IS ALSO WHAT PINS THE DROPPED BAR. The composer drops the title the
    // grid wears standing alone (`soloBarOf`) and keeps the index's head, which
    // `render` composes — so a weld that dropped neither, or both, fails here
    // rather than in somebody's vault.
    const { ctx, text } = composed();
    const model = journalSectionModel(ctx);
    const blocks = model.blocks!(APART);
    expect(blocks.map((b) => b.ids)).toEqual([["banner"], ["trackers"], ["children"]]);
    const ids = blocks.flatMap((b) => b.ids);
    const out = model.regroup!(APART, [ids], [], ids.slice(1));
    expect(out).not.toBeNull();
    expect(bodyOf(out!)).toEqual(bodyOf(text));
  });

  it("comes back as one block that says it is a stack", () => {
    const { ctx } = composed();
    const model = journalSectionModel(ctx);
    const ids = model.blocks!(APART).flatMap((b) => b.ids);
    const out = model.regroup!(APART, [ids], [], ids.slice(1))!;
    const blocks = model.blocks!(out);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].ids).toEqual(ids);
    expect(blocks[0].stack).toBe(true);
  });

  it("makes a row when the same rows are asked for as a group", () => {
    // THE GUARD BITES. The blocks are identical and only the fourth argument
    // differs, so this is the one thing that decides which arrangement gets
    // written — and it is the reader's answer rather than anything derivable
    // from either file.
    const { ctx } = composed();
    const model = journalSectionModel(ctx);
    const ids = model.blocks!(APART).flatMap((b) => b.ids);
    const asRow = model.regroup!(APART, [ids], [], []);
    // The banner refuses to be a column at all (its fence holds the note's
    // name), so asking for a row of these three writes nothing rather than
    // writing the wrong thing.
    expect(asRow === null || !bodyOf(asRow).some((l) => isStackLine(l.trim()))).toBe(
      true
    );
  });

  // ── AND THE WAY BACK OUT, WHICH IS 5.29's SECOND HALF ───────────────
  //
  // THE REPORT, the day the weld shipped: *"One of these widgets' lines can't
  // be told apart from others in its block, so the group can't be broken up",
  // is the tooltip I get when trying to break up a stack group.* It was true.
  // `hasKnownExtent` asks the CATALOGUE whether a section renders one line, and
  // the answer is no for a logging grid and no for a head-and-table — so every
  // member of every stack this plugin composes was refused, and the button the
  // weld had just made a use for was drawn disabled.
  //
  // The fix is the one a row has had since 4.4: the file SAYS where each
  // section starts. This is that fix asserted end to end, and the assertion is
  // the strongest one available — the note comes back byte-for-byte as the note
  // the weld was performed on.
  it("breaks the stack up, into the fences it was welded from", () => {
    const { ctx } = composed();
    const model = journalSectionModel(ctx);
    const ids = model.blocks!(APART).flatMap((b) => b.ids);
    const welded = model.regroup!(APART, [ids], [], ids.slice(1))!;
    // Every member is loose, which is the whole of what changed: the fence
    // divides them, so what the editor offers and what the write performs are
    // the same list.
    expect(model.blocks!(welded)[0].loose).toEqual(ids);
    const apart = model.regroup!(welded, ids.map((id) => [id]), [], []);
    expect(apart).toBe(APART);
  });

  it("takes one member out and leaves the rest welded", () => {
    // The other gesture on the same machinery: a stack of three becomes a stack
    // of two and a card, rather than an all-or-nothing.
    const { ctx } = composed();
    const model = journalSectionModel(ctx);
    const ids = model.blocks!(APART).flatMap((b) => b.ids);
    const welded = model.regroup!(APART, [ids], [], ids.slice(1))!;
    const out = model.regroup!(
      welded,
      [["banner", "trackers"], ["children"]],
      [],
      ["trackers"]
    )!;
    const blocks = model.blocks!(out);
    expect(blocks.map((b) => b.ids)).toEqual([["banner", "trackers"], ["children"]]);
    expect(blocks[0].stack).toBe(true);
    expect(blocks[1].stack).toBe(false);
    // AND IT GOES BACK IN. The two directions are one rule read twice, so a
    // round trip through the middle state has to land on the file it left.
    expect(
      model.regroup!(out, [ids], [], ids.slice(1))
    ).toBe(welded);
  });

  it("leaves the word on a stack that does not say where its sections start", () => {
    // THE 5.28 SPELLING, AND THE HONEST DEGRADATION. A fence carrying one
    // `stack` line holds one part, so the sections in it cannot be told apart —
    // `loose` says so, phase one moves nothing, and the fence stays as it is
    // whatever the arrangement asked for. Taking the word off would describe a
    // card the reader is still looking at as something else.
    //
    // This is the note `missingStackLine` repairs into, and it is what every
    // stack was until this release.
    const { ctx, text } = composed();
    const model = journalSectionModel(ctx);
    const lines = text.split("\n");
    const first = lines.findIndex((l) => isStackLine(l.trim()));
    const undivided = lines
      .filter((l, at) => at === first || !isStackLine(l.trim()))
      .join("\n");
    const ids = model.blocks!(undivided).flatMap((b) => b.ids);
    expect(model.blocks!(undivided)[0].loose).toEqual([ids[0]]);
    const out = model.regroup!(undivided, ids.map((id) => [id]), [], []);
    expect(out === null || bodyOf(out).some((l) => isStackLine(l.trim()))).toBe(true);
  });

  it("takes the word off a fence that is no longer shared", () => {
    const { ctx } = composed();
    const model = journalSectionModel(ctx);
    const ids = model.blocks!(APART).flatMap((b) => b.ids);
    const welded = model.regroup!(APART, [ids], [], ids.slice(1))!;
    // Two sections leave by being removed, which is `apply`'s door rather than
    // this one; what is asserted is the fence that is left.
    const alone = model.regroup!(
      welded,
      [["banner"]],
      [],
      []
    );
    // `banner` alone in its fence: still two directives, and no stack.
    if (alone !== null) {
      expect(bodyOf(alone).some((l) => isStackLine(l.trim()))).toBe(false);
    }
  });
});

// ── the doors ─────────────────────────────────────────────────────────

describe("which button the window draws", () => {
  const editor = (): string => readSrc("section-editor");

  it("asks the catalogue which sections may be welded", () => {
    // §2's rule: the editor must not learn which surface it is on. It reads a
    // field; it never names `trackers` or `children`.
    const src = editor();
    expect(src).toContain("this.view(id)?.stacks === section.id");
    expect(src).toContain("const host = section.stacks;");
    expect(src).not.toContain('"trackers"');
    expect(src).not.toContain('"children"');
  });

  it("carries it from the journal catalogue's own field", () => {
    const { ctx } = composed();
    const views = journalSectionModel(ctx).sections("");
    const welds = views.filter((v) => v.stacks !== undefined);
    expect(welds.length).toBeGreaterThan(0);
    for (const v of welds) expect(v.stacks).toBe("banner");
    // And the banner is not one of them: a host does not weld into itself.
    expect(views.find((v) => v.id === "banner")?.stacks).toBeUndefined();
  });

  it("offers the host's button only while there is no stack", () => {
    const src = editor();
    const at = src.indexOf("// A HOST, and only while it has guests to take");
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, at + 700);
    expect(body).toContain("if (!guests.length) return;");
    expect(body).toContain("if (this.isStack(mine)) return;");
  });

  it("offers a guest's button only once there is one", () => {
    const src = editor();
    const at = src.indexOf("if (host && this.rows.includes(host)");
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, at + 700);
    expect(body).toContain(
      "if (!this.isStack(block) || block.includes(section.id)) return;"
    );
  });

  it("is a different icon from the one that makes a group", () => {
    // The reader asked for it: *"a special link button different from other
    // sections (highlighted or different icon)"*. Both, and each does a
    // different job — the icon tells the operations apart, the colour makes the
    // one that is not on every row findable.
    const src = editor();
    expect(src).toContain('setIcon(make, "link")');
    expect(src).toContain('setIcon(b, "layers")');
    const css = readCss();
    // THE STACK'S OWN HUE, the same token the editor's stack card is washed
    // with, so the button, the card it makes and the wash on it are one colour
    // story rather than three decisions.
    const at = css.indexOf(".ca-tpl-weld {\n  color:");
    expect(at).toBeGreaterThan(-1);
    expect(css.slice(at, css.indexOf("}", at))).toContain("--ca-ev-teal");
    const host = css.indexOf(".ca-tpl-weld-host {");
    expect(host).toBeGreaterThan(-1);
    expect(css.slice(host, css.indexOf("}", host))).toContain("--ca-ev-teal");
  });

  it("says which arrangement a row is leaving", () => {
    const src = editor();
    expect(src).toContain("const noun = welded ? \"stack\" : \"group\";");
    expect(src).toContain('"aria-label": `Take out of the ${noun}`');
  });

  it("does not offer to take the section the others are welded into out of its own fence", () => {
    const src = editor();
    expect(src).toContain(
      "out.disabled = !this.loose.has(section.id) || (welded && opens);"
    );
  });

  it("offers no page inside a stack", () => {
    // A page divides a row's columns and a stack has none, so the control would
    // write a `tab` line the reader's own note then reports as an error.
    const src = editor();
    expect(src).toContain(
      "if (this.joined.has(section.id) && !this.stacked.has(section.id)) {"
    );
  });

  it("hands the weld to the write beside the blocks and the pages", () => {
    const src = editor();
    expect(src).toContain("this.welds(idsOf(this.want))");
    // Read back through the blocks the write will make, on `pageBreaks`' rule.
    expect(src).toContain("private welds(ids: readonly string[]): string[] {");
    expect(src).toContain("group.filter((id, i) => i > 0 && this.stacked.has(id))");
  });

  // ── AND WHAT IT SAYS WHEN IT REFUSES (5.29) ────────────────────────
  //
  // THE REPORT: *"One of these widgets' lines can't be told apart from others
  // in its block, so thr group can't be broken up", is the tooltip I get when
  // trying to break up a stack group.* The refusal is real on a note composed
  // before the divider existed; the sentence was wrong twice over — it called
  // the reader's stack a group, and the way out it named ("move it out of the
  // block by hand") is the operation the button itself performs.
  it("tells a stack how to become breakable, and does not call it a group", () => {
    const src = editor();
    const at = src.indexOf("if (split.disabled) {");
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, src.indexOf("split.addEventListener", at));
    expect(body).toContain('noun === "stack"');
    expect(body).toContain("This stack doesn't say where each section starts");
    // The way out is a Save, because the repair is what writes the lines.
    expect(body).toContain("Save the note");
    // And the old sentence survives for the arrangement it was written about.
    expect(body).toContain("the group can't be broken up");
  });

  it("says the same thing about one row of a stack", () => {
    const src = editor();
    const at = src.indexOf("} else if (out.disabled) {");
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, at + 900);
    expect(body).toContain("out.title = welded");
    expect(body).toContain("this one can't be split out");
  });
});

// ── the way back out ──────────────────────────────────────────────────

describe("what the window may offer, on the note it is looking at", () => {
  // THE EDITOR'S BUTTONS ARE `loose` AND NOTHING ELSE — `split.disabled` reads
  // it for the whole block, `out.disabled` for one row — so these are the two
  // controls the reader pressed, asked of the model rather than of the DOM.
  it("enables break-up over a stack the file divides", () => {
    const { ctx } = composed();
    const model = journalSectionModel(ctx);
    const ids = model.blocks!(APART).flatMap((b) => b.ids);
    const welded = model.regroup!(APART, [ids], [], ids.slice(1))!;
    const block = model.blocks!(welded)[0];
    // `kept.slice(1).every((id) => this.loose.has(id))` is the button's own
    // condition, which is every member but the opener.
    expect(block.ids.slice(1).every((id) => block.loose.includes(id))).toBe(true);
  });

  it("refuses it over one the file does not, which is what the sentence is for", () => {
    const { ctx, text } = composed();
    const model = journalSectionModel(ctx);
    const lines = text.split("\n");
    const first = lines.findIndex((l) => isStackLine(l.trim()));
    const undivided = lines
      .filter((l, at) => at === first || !isStackLine(l.trim()))
      .join("\n");
    const block = model.blocks!(undivided)[0];
    expect(block.ids.length).toBeGreaterThan(1);
    expect(block.ids.slice(1).every((id) => block.loose.includes(id))).toBe(false);
  });
});
