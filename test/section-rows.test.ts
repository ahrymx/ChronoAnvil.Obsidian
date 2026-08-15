// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Rows in the section editor — 4.8 §2.
//
// WHAT IS BEING CHECKED. The editor learned about shared blocks in 4.2 only in
// order to refuse to touch one, and the refusal named an operation the window
// did not have: *"Split the block to move them apart."* This is that operation.
// It is checked here rather than in a vault because it REWRITES A PAGE, and the
// one outcome that must never happen is a section's lines being cut somewhere
// they were only assumed to end.

import { describe, expect, it } from "vitest";
import type { FlatSection } from "../src/core/note-sections";
import {
  flatBlocks,
  flatNoteModel,
  regroupFlatNote,
} from "../src/core/note-sections";
import { readCode } from "./sources";

// A catalogue of the smallest sections that can exist: one line each, matched
// where that line starts.
const one = (id: string, line: string): FlatSection => ({
  id,
  label: id,
  blurb: "",
  icon: "•",
  locked: false,
  render: () => ({ fence: "almanac", lines: [line] }),
  locate: (text) => text.split("\n").reduce(
    (at, l, i, all) =>
      at >= 0
        ? at
        : l.trim() === line
          ? all.slice(0, i).join("\n").length + (i ? 1 : 0)
          : -1,
    -1
  ),
});

// And one that renders two lines, so its extent inside a shared fence is a
// guess rather than a fact.
const two = (id: string, header: string, line: string): FlatSection => ({
  ...one(id, line),
  render: () => ({ fence: "almanac", lines: [header, line] }),
});

const CAT: FlatSection[] = [
  one("diary", "diary:3"),
  one("launcher", "launcher"),
  one("journals", "journals"),
  two("tasks", "header:⏳ Open tasks", "tasks-table:,period"),
  // A plain widget with no title of its own — what a column IS, as of 4.12 §A.
  // The entry above it is the same shape a dashboard writes and is the thing
  // that is now refused, so the fixture carries one of each.
  one("events", "events"),
];

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
].join("\n");

const blocksOf = (text: string): string[][] =>
  flatBlocks(text, CAT).map((b) => b.ids);

describe("what the editor is shown", () => {
  it("reports the row as one block and the rest as their own", () => {
    expect(blocksOf(PAGE)).toEqual([["diary", "launcher", "journals"], ["tasks"]]);
  });

  it("says which members can be taken out on their own", () => {
    // Cutting a section out of a shared fence means knowing where its lines
    // end, and one anchor is not a span. All three of these render one line.
    expect(flatBlocks(PAGE, CAT)[0].loose).toEqual([
      "diary",
      "launcher",
      "journals",
    ]);
  });

  it("counts a section alone in its block as loose whatever its extent", () => {
    // The whole fence is its, so nothing has to be cut out of anything.
    expect(flatBlocks(PAGE, CAT)[1].loose).toEqual(["tasks"]);
  });

  it("says which members could be a column of a group at all", () => {
    // `column` IS NOT `loose`, AND THE TWO DISAGREE IN BOTH DIRECTIONS — which
    // is why 4.12 §A made it a second field rather than a second reading of the
    // first. Here the three members of the row are each a column; the titled
    // section below is loose (the whole fence is its) and is NOT a column,
    // because the bar it carries would render below the group it titles.
    const blocks = flatBlocks(PAGE, CAT);
    expect(blocks[0].column).toEqual(["diary", "launcher", "journals"]);
    expect(blocks[1].loose).toEqual(["tasks"]);
    expect(blocks[1].column).toEqual([]);
  });

  it("refuses a frame: section fence as a column, and a bare header: too", () => {
    // The three refusals arrive as one field. `frame: section` loses its
    // modifier on the way into a cell; a bare `header:` is looser than the
    // grammar's own contradiction test and still renders a bar that cannot be
    // cell content.
    const framed = PAGE.replace(
      "```almanac\nheader:⏳ Open tasks\ntasks-table:,period\n```",
      "```almanac\nframe: section\ntasks-table:,period\n```"
    );
    expect(flatBlocks(framed, CAT)[1].column).toEqual([]);
    const bare = PAGE.replace("header:⏳ Open tasks", "header:");
    expect(flatBlocks(bare, CAT)[1].column).toEqual([]);
  });

  it("refuses a block holding the page's own name", () => {
    // The one refusal `widgetRun` does not make — `moveCell` refuses a run
    // holding `title` separately and by name, so the model says it here rather
    // than letting the editor offer a join the write declines.
    const headed = PAGE.replace(
      "```almanac\nheader:⏳ Open tasks\ntasks-table:,period\n```",
      "```almanac\ntitle\n```"
    );
    const head = flatBlocks(headed, [...CAT, one("title", "title")]).find((b) =>
      b.ids.includes("title")
    );
    expect(head?.column).toEqual([]);
  });

  it("refuses to promise a split it could only make by guessing", () => {
    const shared = PAGE.replace(
      "cell\njournals",
      "cell\nheader:⏳ Open tasks\ntasks-table:,period"
    );
    const block = flatBlocks(shared, CAT)[0];
    expect(block.ids).toContain("tasks");
    expect(block.loose).not.toContain("tasks");
  });
});

describe("taking a section out of a row", () => {
  const out = regroupFlatNote(PAGE, CAT, [["diary", "launcher"], ["journals"], ["tasks"]]);

  it("leaves it in a block of its own, in the place it was asked for", () => {
    expect(blocksOf(out!)).toEqual([["diary", "launcher"], ["journals"], ["tasks"]]);
  });

  it("takes the delimiter it was using with it", () => {
    expect(out!.split("\n").filter((l) => l === "cell")).toHaveLength(1);
  });

  it("leaves everything it did not move exactly as it read it", () => {
    expect(out).toContain("header:⏳ Open tasks");
    expect(out!.startsWith("`almanac:spacer`")).toBe(true);
  });
});

describe("breaking a row up", () => {
  it("stops calling it a row once one widget is left", () => {
    const out = regroupFlatNote(PAGE, CAT, [
      ["diary"],
      ["launcher"],
      ["journals"],
      ["tasks"],
    ]);
    expect(blocksOf(out!)).toEqual([["diary"], ["launcher"], ["journals"], ["tasks"]]);
    expect(out).not.toContain("\nrow\n");
    expect(out).not.toContain("\ncell\n");
  });
});

describe("putting a widget into a group", () => {
  // 4.12 §A REWROTE THIS DESCRIBE, AND THE OLD ONE WAS NOT WRONG ABOUT THE
  // ARITHMETIC. It joined `tasks` — a `header:⏳ Open tasks` bar over a
  // `tasks-table` — into the row, asserted that the bar travelled with its
  // widget, and passed. What it could not see is that `NOT_A_CELL` refuses a bar
  // as cell content at render, so the page drew that bar BELOW the group with
  // the first column's bar appearing to title the whole thing. The file was
  // exactly as asserted and the page was wrong.
  //
  // So the fixture is now a widget with no title of its own — which is what a
  // column is — and the titled case is asserted one describe down as a refusal.
  const OWN = PAGE.replace(
    "```almanac\nheader:⏳ Open tasks\ntasks-table:,period\n```",
    "```almanac\nevents\n```"
  );
  const out = regroupFlatNote(OWN, CAT, [
    ["diary", "launcher", "journals", "events"],
  ]);

  it("moves it in at the end, which is the order `want` asked for", () => {
    expect(blocksOf(out!)).toEqual([["diary", "launcher", "journals", "events"]]);
    const body = out!.split("\n");
    expect(body.indexOf("events")).toBeGreaterThan(body.indexOf("journals"));
  });

  it("gives it a delimiter, because this row divides itself", () => {
    expect(out!.split("\n").filter((l) => l === "cell")).toHaveLength(3);
  });

  it("leaves one block where there were two", () => {
    expect(out!.split("\n").filter((l) => l.startsWith("```almanac"))).toHaveLength(1);
  });
});

describe("a section that titles itself is not a column", () => {
  // THE CASE THE DESCRIBE ABOVE USED TO ASSERT THE OTHER WAY. `widgetRun`
  // refuses a fence carrying its own bar, and phase two of the regroup lifts a
  // joining section through exactly that — so the join does not happen and the
  // note comes back unchanged rather than half-made.
  it("declines to join it, and changes nothing", () => {
    expect(
      regroupFlatNote(PAGE, CAT, [["diary", "launcher", "journals", "tasks"]])
    ).toBeNull();
  });

  it("declines a frame: section fence for the same reason", () => {
    // Worse than the bar case in the file: `frame:` is not content, so the
    // modifier would stay behind with the fence being emptied and the section
    // would lose its bar, its title and its fold in one move.
    const framed = PAGE.replace(
      "```almanac\nheader:⏳ Open tasks\ntasks-table:,period\n```",
      "```almanac\nframe: section\ntasks-table:,period\n```"
    );
    expect(
      regroupFlatNote(framed, CAT, [["diary", "launcher", "journals", "tasks"]])
    ).toBeNull();
  });

  it("still lets it move as a block of its own", () => {
    // THE HALF THAT IS DELIBERATELY KEPT. A titled section cannot be a COLUMN;
    // it has always been able to change places, and this release does not touch
    // that. Reordering goes through `applyFlatSections`, not through `widgetRun`.
    const out = regroupFlatNote(PAGE, CAT, [["diary", "launcher"], ["journals"], ["tasks"]]);
    expect(out).not.toBeNull();
    expect(out).toContain("header:⏳ Open tasks");
  });
});

describe("making a row out of two blocks that were not one", () => {
  // THE BUG 4.12 §A FIXES, AND NOTHING REACHED IT. `regroupFlatNote` phase two
  // always joined with a `cell` target, and `arrival` returns the run BARE when
  // the destination has neither a `row` line nor a `cell` line — so pressing
  // **Make a group** on two blocks that were not already a row appended the
  // directive with no `row` line and the page stacked them. The suite missed it
  // because every join case above starts from a fence that already had both.
  const FLAT = [
    "`almanac:spacer`",
    "```almanac",
    "diary:3",
    "```",
    "",
    "```almanac",
    "launcher",
    "```",
    "",
  ].join("\n");

  const out = regroupFlatNote(FLAT, CAT, [["diary", "launcher"]]);

  it("writes the row line the page needs to draw two columns", () => {
    expect(out).not.toBeNull();
    expect(out!.split("\n").filter((l) => l === "row")).toHaveLength(1);
    expect(blocksOf(out!)).toEqual([["diary", "launcher"]]);
  });

  it("writes exactly what composing the same pair writes", () => {
    // TWO WAYS OF MAKING ONE OBJECT MUST WRITE ONE FILE — `cell-move.ts` says so
    // out loud, and this is the assertion behind the sentence. `moveCell`'s
    // `group` branch and `composeFlatNote` build a joined row the same way, so
    // the fix is to CHOOSE that branch rather than to teach `arrival` a second
    // spelling.
    const body = out!.split("\n").slice(2, -2);
    expect(body).toEqual(["row", "diary:3", "cell", "launcher"]);
  });

  it("leaves one block where there were two", () => {
    expect(out!.split("\n").filter((l) => l.startsWith("```almanac"))).toHaveLength(1);
  });
});

describe("what a regroup will not do", () => {
  it("says nothing changed rather than rewriting the file to prove it", () => {
    expect(
      regroupFlatNote(PAGE, CAT, [["diary", "launcher", "journals"], ["tasks"]])
    ).toBeNull();
  });

  it("leaves a member it cannot bound where it is", () => {
    const shared = PAGE.replace(
      "cell\njournals",
      "cell\nheader:⏳ Open tasks\ntasks-table:,period"
    );
    const out = regroupFlatNote(shared, CAT, [
      ["diary", "launcher"],
      ["tasks"],
    ]);
    // Nothing is cut out of the shared fence on a guess. Either it is left
    // alone or nothing happens at all — never a line the reader typed.
    expect(out === null || out.includes("tasks-table:,period")).toBe(true);
  });
});

describe("the window over it", () => {
  const editor = readCode("section-editor");

  it("draws a card only where a block holds more than one", () => {
    // A block of one is a row in the list, exactly as it always was — the card
    // is for the case the list could not previously describe.
    expect(editor).toContain("if (group.length < 2) {");
    expect(editor).toContain("private renderBlock(");
  });

  it("keeps a block to one run of consecutive rows", () => {
    // Which is what the catalogue means by a row (`FlatSection.row`:
    // "consecutive members only"), and what makes one bit per row enough.
    expect(editor).toContain("private joined = new Set<string>()");
    expect(editor).toContain("if (out.length && this.joined.has(id))");
  });

  it("offers no split it could not make", () => {
    // A button that plans a move the write declines is the editor lying,
    // which is what `loose` exists to prevent.
    const at = editor.indexOf('text: "Take out of the group"');
    expect(at).toBeGreaterThan(-1);
    expect(editor.slice(at, at + 500)).toContain(
      "out.disabled = !this.loose.has(section.id)"
    );
  });

  it("lets a locked section leave a row", () => {
    // The lock is on existence, not on order (2.60.2) — and the homepage's
    // locked diary card is in the row this release exists to rearrange. So the
    // block buttons sit BEFORE the refusal returns, and wear a class of their
    // own so that the assertion about the remove control still means what it
    // said.
    const block = editor.indexOf('text: "Take out of the group"');
    const refusal = editor.indexOf("if (refusal) return;");
    expect(block).toBeLessThan(refusal);
    expect(editor.slice(block - 200, block)).toContain("almanac-tpl-move");
  });

  it("previews the regroup by running it, not by diffing intentions", () => {
    // A comparison of what is on screen against what is in the file would
    // report moves `regroup` declines to make. Running the write and reading
    // its result is the only way this pane can promise what Save does.
    const at = editor.indexOf("private layoutOps()");
    expect(at).toBeGreaterThan(-1);
    const body = editor.slice(at, at + 1400);
    expect(body).toContain("this.model.regroup?.(base, want)");
    expect(body).toContain("const to = openerIn(next)");
  });

  it("counts a regroup, so Save is offered for one", () => {
    const at = editor.indexOf("private changeCount()");
    expect(editor.slice(at, at + 500)).toContain('o.kind === "regroup"');
  });

  it("writes the sections and the blocks in one go", () => {
    // `apply` decides which sections and in what order; `regroup` decides which
    // of them share a block. Two reconcilers, one write — the reader pressed
    // Save once.
    const at = editor.indexOf("protected async commit()");
    const body = editor.slice(at);
    expect(body.indexOf("this.model.apply(current, this.want)")).toBeLessThan(
      body.indexOf("this.model.regroup?.(")
    );
    expect(body.match(/vault\.modify/g) ?? []).toHaveLength(1);
  });

  it("still never asks which surface it is on", () => {
    // The rule this window has kept since 3.0, and the one a new capability is
    // most likely to break. A model without rows implements neither method and
    // gets the list it always got.
    expect(editor).toContain("Boolean(this.model.blocks && this.model.regroup)");
    for (const word of ["journal", "diary", "entry-header", "homepage"]) {
      expect(editor.toLowerCase().split(word).length - 1, word).toBeLessThan(3);
    }
  });
});

describe("the seam it arrives on", () => {
  const model = readCode("section-model");

  it("is optional, so no other surface has to answer for a row", () => {
    // The editor must not learn which surface it is on — the rule this
    // interface has kept since 3.0. A flat note is the only catalogue that
    // composes a row, so it is the only model that implements these.
    expect(model).toContain("blocks?(text: string): BlockView[];");
    expect(model).toContain("regroup?(");
    const notes = readCode("note-sections");
    // `sectionsFor(text)` RATHER THAN `sections` SINCE 4.15 §4, and the change
    // is the same fact one level deeper: how many sections a flat note has is a
    // question about the note, because a repeating widget has one per
    // occurrence. What is pinned is unchanged — that the flat model is the one
    // implementing this, off its own section list.
    expect(notes).toContain("blocks: (text) => flatBlocks(text, sectionsFor(text))");
  });

  it("counts as a change, so Save is offered for it", () => {
    // A section moving into a row does not change which sections the note has
    // or what order they are in, and it rewrites the note. Reported as a
    // `keep` it would be the plan saying "unchanged" over a write.
    expect(model).toContain('| "regroup"');
  });
});

describe("two fences claiming one section", () => {
  // THE SILENT CONTENT SWAP 4.12 §A CLOSES, and it is the worst thing in this
  // release's changelog. `ownersOf` asks each fence on its own and a `locate` is
  // a match rather than a claim, so a keyword written twice gave BOTH runs the
  // same id. `applyFlatSections`' reorder then builds `byChunk` keyed by
  // `ids[0]` — a Map, so the second entry wins — and writes that one chunk into
  // both slots. The reader's first fence came back holding the second's
  // content, on a Save whose plan said only that something moved.
  // MATCHED ON THE KEYWORD, which is how every shipped catalogue matches and is
  // the whole of why this is reachable: `locate` is deliberately blind to the
  // argument so that a reader who repoints one still has a section the editor
  // can find (`diary-dashboard-sections.ts` says so at its own `tag-index`). The
  // cost is that one keyword written twice is two matches.
  //
  // THE FIRST DRAFT OF THIS TEST USED THE FIXTURE ABOVE, whose `locate` compares
  // the whole line — so `events:upcoming:9` never matched `events`, the bug was
  // never reproduced, and the test passed against the unfixed code. Mutating it
  // is what found that; it is exactly the failure the house rules record.
  const KEYED: FlatSection[] = [
    one("diary", "diary:3"),
    {
      ...one("events", "events"),
      locate: (text) => text.search(/^events\b/m),
    },
  ];

  const TWICE = [
    "`almanac:spacer`",
    "```almanac",
    "diary:3",
    "```",
    "",
    "```almanac",
    "events",
    "```",
    "",
    "```almanac",
    "events:upcoming:9",
    "```",
    "",
  ].join("\n");

  it("gives the id to the first fence and reports the second as nobody's", () => {
    // FILE ORDER DECIDES, because it is the only choice a reader could predict.
    const blocks = flatBlocks(TWICE, KEYED);
    expect(blocks.map((b) => b.ids)).toEqual([["diary"], ["events"]]);
  });

  it("leaves the second fence exactly as it was written", () => {
    // THE PROPERTY THAT MATTERS, asked of the write rather than of the parse: a
    // run nobody owns is re-emitted byte-identically, so the reader's own copy
    // survives a reorder that used to overwrite it.
    const model = flatNoteModel({
      sections: KEYED,
      noun: "the test page",
      heldUnit: "block",
    });
    const out = model.apply(TWICE, ["events", "diary"]);
    expect(out).not.toBeNull();
    expect(out).toContain("events:upcoming:9");
    // And the two fences still hold different things — which is the whole of it.
    expect(out!.split("\n").filter((l) => l === "events")).toHaveLength(1);
    expect(
      out!.split("\n").filter((l) => l === "events:upcoming:9")
    ).toHaveLength(1);
  });
});
