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
import { cellPlan } from "../src/ui/widgets/row";
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

// TWO COLUMNS, WHICH IS ALL A ROW HAS AS OF 4.52.1 — and the shape the
// homepage's own catalogue composes: one wide member beside a column that
// stacks the rest. It was three columns until this release, and `MAX_COLUMNS`
// carries the argument for why that is no longer a thing a fence can ask for.
// The cap's own behaviour is asserted at the bottom of this file, on fences
// written before it existed.
const PAGE = [
  "`almanac:spacer`",
  "```almanac",
  "row",
  "diary:3",
  "cell",
  "launcher",
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
      "journals",
      "header:⏳ Open tasks\ntasks-table:,period"
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

  it("divides itself ONCE, because a row has two columns (4.52.1)", () => {
    // THIS EXPECTED THREE DELIMITERS UNTIL 4.52.1, one per member after the
    // first, and that is exactly the fence the cap exists to stop being
    // written: four columns need 1310px of floor and the note column is about
    // a thousand. The arrival stacks at the foot of the emptier column instead,
    // so a group of four is a 2x2 and the one delimiter is the seam between
    // its two columns.
    expect(out!.split("\n").filter((l) => l === "cell")).toHaveLength(1);
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
      "journals",
      "header:⏳ Open tasks\ntasks-table:,period"
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
    //
    // COUNTED OVER THE MEMBERS THE SAVE WILL WRITE, since 4.53.0. A struck-
    // through row is not in that file, so a "group" of one member and the row it
    // is replacing is two rows and no group — and drawing a card round it
    // promised one the write would not make.
    expect(editor).toContain("if (kept.length < 2) {");
    expect(editor).toContain("private renderBlock(");
  });

  it("keeps a block to one run of consecutive rows", () => {
    // Which is what the catalogue means by a row (`FlatSection.row`:
    // "consecutive members only"), and what makes one bit per row enough.
    //
    // THE WALK MOVED TO `core/row-order.ts` IN 4.53.0. The editor kept the bit
    // and improvised the arrangement around it — four hand-written swaps and
    // splices, each having to remember what a block is — which is how a move
    // could hand the write a run that was not one.
    expect(editor).toContain("private joined = new Set<string>()");
    expect(readCode("row-order")).toContain("if (out.length && joined.has(id))");
    expect(editor).toContain("return blocksOf(ids, this.joined);");
  });

  it("offers no split it could not make", () => {
    // A button that plans a move the write declines is the editor lying,
    // which is what `loose` exists to prevent.
    //
    // AN ICON IN `lead` SINCE 4.53.1, so the anchor is the label rather than
    // the text: the control moved under the arrows, where "up, down, out" are
    // three answers to one question. An icon button with no accessible name is
    // the thing that move could have cost, so the name is asserted here too.
    const at = editor.indexOf('"aria-label": "Take out of the group"');
    expect(at).toBeGreaterThan(-1);
    expect(editor.slice(at - 200, at)).toContain('lead.createEl("button"');
    expect(editor.slice(at, at + 600)).toContain('setIcon(out, "unlink")');
    expect(editor.slice(at, at + 600)).toContain(
      "out.disabled = !this.loose.has(section.id)"
    );
  });

  it("keeps the split with the arrows and away from Remove", () => {
    // 4.53.1, and the reason the control moved. `lead` is the column the
    // arrows are in and the reason they are not beside the remove toggle —
    // "move this up" next to "remove this" is one slip from being expensive —
    // so a third mover belongs in the same column and not in the actions row.
    const out = editor.indexOf('"aria-label": "Take out of the group"');
    const arrows = editor.indexOf('cls: "almanac-tpl-arrow"');
    expect(arrows).toBeGreaterThan(-1);
    // Drawn after the two chevrons, so it is under them and not over them.
    expect(arrows).toBeLessThan(out);
    expect(editor.slice(out - 200, out)).toContain(
      'cls: "almanac-tpl-arrow almanac-tpl-leave"'
    );
    // And it is no longer one of the pills on the actions line.
    expect(editor).not.toContain('text: "Take out of the group"');
  });

  it("draws the way in where it draws the way out", () => {
    // 4.53.2, and it is one slot rather than two: a row is in a group or it is
    // not, so exactly one of the two icons is ever drawn on a row. Putting the
    // opposites anywhere but the same place would make a reader hunt for the
    // mirror of a control they had just used.
    const join = editor.indexOf('cls: "almanac-tpl-arrow almanac-tpl-join"');
    const leave = editor.indexOf('cls: "almanac-tpl-arrow almanac-tpl-leave"');
    expect(join).toBeGreaterThan(-1);
    expect(leave).toBeGreaterThan(-1);
    expect(editor).toContain('setIcon(make, "link")');
    expect(editor).toContain('setIcon(out, "unlink")');
    // Both in `lead`, under the arrows, and neither on the actions line.
    expect(editor.slice(join - 200, join)).toContain('lead.createEl("button"');
    expect(editor.slice(leave - 200, leave)).toContain('lead.createEl("button"');
  });

  it("reaches a group that is not the block above it", () => {
    // The whole of what the icon added. `joinables` answers with a LIST — the
    // block above plus every group on the page — where `joinTarget` answered
    // with the one block that happened to be touching, so a widget three rows
    // under the group it belonged in had to be walked there one arrow at a
    // time.
    expect(editor).toContain("joinables(band, this.joined, section.id)");
    expect(editor).not.toContain("joinTarget(");
    expect(readCode("row-order")).toContain(
      "return blocks.filter((b, i) => i !== at && (i === at - 1 || b.length > 1));"
    );
  });

  it("asks which group only when there is more than one", () => {
    // `only` FIRST, and it is `modals.ts`' rule rather than a shortcut: that
    // block draws the line at whether the choice IS the request or is
    // bookkeeping for it. The reader pressed a button on a specific row that
    // means "put this in a group"; with one destination the page has already
    // answered, and the ordinary note — where the only destination is the block
    // above — stays at the one press it has always been.
    // Sliced between the two declarations rather than through `fnBody`, which
    // walks to the next TOP-LEVEL declaration and would hand back the rest of
    // the class from a method in the middle of one.
    const from = editor.indexOf("private async askJoin(");
    expect(from).toBeGreaterThan(-1);
    const ask = editor.slice(from, editor.indexOf("private joinLabel(", from));
    expect(ask).toContain("only(targets) ??");
    expect(ask).toContain("promptChoice(");
    // AND THE ARRANGEMENT IS READ AFTER THE AWAIT. The window stays live while
    // the dialog is open, so a band captured before it is a list and not a
    // promise about the arrangement it came from.
    expect(ask.indexOf("await")).toBeLessThan(ask.indexOf("this.settle("));
    expect(ask).toContain("joinInto(this.arrangement, band, id, pick[0])");
  });

  it("lets a locked section leave a row", () => {
    // The lock is on existence, not on order (2.60.2) — a section a reader may
    // not delete is still a section they may rearrange, and a row of two cells
    // is exactly where the two questions come apart. So the block buttons are
    // drawn BEFORE the refusal returns.
    //
    // THE HOMEPAGE'S DIARY CARD USED TO BE THE EXAMPLE and is not one any more
    // (4.53): it is an ordinary removable row now. The rule outlives the
    // example, which is why this test still stands — `links` and the four
    // dashboards' mastheads are locked, and any of them may share a row.
    const block = editor.indexOf('"aria-label": "Take out of the group"');
    const refusal = editor.indexOf("if (refusal) return;");
    expect(block).toBeGreaterThan(-1);
    expect(block).toBeLessThan(refusal);
  });

  it("previews the regroup by running it, not by diffing intentions", () => {
    // A comparison of what is on screen against what is in the file would
    // report moves `regroup` declines to make. Running the write and reading
    // its result is the only way this pane can promise what Save does.
    const at = editor.indexOf("private layoutOps()");
    expect(at).toBeGreaterThan(-1);
    const body = editor.slice(at, at + 1400);
    expect(body).toContain("this.model.regroup?.(base, want,");
    // AND THE PAGES GO WITH THE BLOCKS (4.34.2). The preview runs the SAME
    // write Save runs, so a pane that passed the groupings and not the page
    // breaks would promise a file that Save does not produce.
    expect(body).toContain("this.pageBreaks(idsOf(this.want))");
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

// ── pages, written from the editor's arrangement (4.34.2) ─────────────────
//
// Phases one to three put the right sections in the right blocks and the right
// order. Phase four says where the PAGES of a block divide, and it runs last
// for a reason it is worth restating here: a page boundary sits between two
// columns, so placing one before the columns have settled would leave it
// holding whatever happened to be beside it when phase three finished.

describe("where a group's pages divide", () => {
  it("writes a tab at the section the arrangement named", () => {
    const out = regroupFlatNote(
      PAGE,
      CAT,
      [["diary", "launcher", "journals"], ["tasks"]],
      ["launcher"]
    );
    expect(out).not.toBeNull();
    const body = out!.split("\n");
    // The delimiter that opened `launcher` as a column is the one PROMOTED —
    // not a second line added beside it — so the fence comes back with a `tab`
    // where its `cell` was and no delimiter left over.
    expect(body.filter((l) => l === "tab")).toHaveLength(1);
    expect(body.filter((l) => l === "cell")).toHaveLength(0);
    expect(body.indexOf("tab")).toBeLessThan(body.indexOf("launcher"));
  });

  it("reads its own writing back as the page it wrote", () => {
    // THE ROUND TRIP, WHICH IS THE ONLY THING THAT PROVES THE TWO SIDES AGREE.
    // `regroup` writes the line; `flatBlocks` is what the editor opens with. If
    // these disagreed, the window would reopen showing no pages and the next
    // Save would flatten them.
    const out = regroupFlatNote(
      PAGE,
      CAT,
      [["diary", "launcher", "journals"], ["tasks"]],
      ["launcher"]
    );
    const block = flatBlocks(out!, CAT).find((b) => b.ids.includes("diary"));
    expect(block?.ids).toEqual(["diary", "launcher", "journals"]);
    expect(block?.pages).toEqual(["launcher"]);
  });

  it("takes a page boundary away again, leaving the column", () => {
    const paged = regroupFlatNote(
      PAGE,
      CAT,
      [["diary", "launcher", "journals"], ["tasks"]],
      ["launcher"]
    )!;
    const flat = regroupFlatNote(paged, CAT, [
      ["diary", "launcher", "journals"],
      ["tasks"],
    ], []);
    expect(flat).not.toBeNull();
    expect(flat!.split("\n").filter((l) => l === "tab")).toHaveLength(0);
    // AND THE COLUMN SURVIVES IT. Removing a page must not stack the two
    // widgets that were either side of it: the `tab` goes back to being the
    // `cell` it was promoted from, so `diary` and `launcher` are two columns
    // again rather than one.
    expect(flat!.split("\n").filter((l) => l === "cell")).toHaveLength(1);
    expect(blocksOf(flat!)).toEqual([["diary", "launcher", "journals"], ["tasks"]]);
  });

  it("leaves the pages alone when it is not told about them", () => {
    // `undefined` IS NOT AN EMPTY LIST. A surface with no pages, and every
    // caller written before they existed, must not delete the pages of a note
    // that has them.
    const paged = regroupFlatNote(
      PAGE,
      CAT,
      [["diary", "launcher", "journals"], ["tasks"]],
      ["launcher"]
    )!;
    const again = regroupFlatNote(paged, CAT, [
      ["diary", "launcher", "journals"],
      ["tasks"],
    ]);
    // Nothing to do at all — the blocks already match and no page was named.
    expect(again).toBeNull();
    expect(paged.split("\n").filter((l) => l === "tab")).toHaveLength(1);
  });
});


// ── the cap: a row holds two columns (4.52.1) ─────────────────────────────
//
// THE BUG THIS COMES FROM, REPORTED FROM A VAULT: *"the groups can be easily
// broken and don't reflect what is shown in the editor."* Four widgets in one
// `row` fence, on a note column about 1090px wide. Three cells fit at the 320px
// floor; the fourth wrapped to a line of its own and stretched to the full width
// of the group, so a column stopped reading as a column.
//
// THE CAP IS A NUMBER (`MAX_COLUMNS`) AND THREE PLACES DEAL BY IT: `capColumns`
// on the render, the column phase here in the file, and `joinInto` on an
// arrival. What is asserted below is the first two AGAINST EACH OTHER, because
// that is the pair that can hurt somebody: if they disagreed, a reader would
// press Save on a page they were happy with and watch two widgets swap places.

describe("a group is dealt into two columns", () => {
  // A CATALOGUE OF SIX ONE-LINE SECTIONS, so a fence can ask for more columns
  // than the cap without any of them being a section whose extent is a guess.
  // `CAT` above holds a titled one, which `widgetRun` refuses as a column —
  // a refusal asserted three describes up and not the subject here.
  const LINES = ["a", "b", "c", "d", "e", "f"];
  const WIDE = LINES.map((line) => one(line, line));

  // The columns of a fence, read back as the ids in each. Written out of the
  // text rather than out of `flatBlocks`, because `BlockView.ids` is a flat list
  // and what is being checked here is exactly the structure it flattens away.
  const columnsIn = (text: string): string[][] => {
    const out: string[][] = [[]];
    let inside = false;
    for (const line of text.split("\n")) {
      if (line.startsWith("```almanac")) { inside = true; continue; }
      if (line.startsWith("```")) { inside = false; continue; }
      if (!inside || line === "row") continue;
      if (line === "cell") { out.push([]); continue; }
      if (LINES.includes(line)) out[out.length - 1].push(line);
    }
    return out;
  };

  // The same fence, written the way a reader's own note has it: one `cell` line
  // per column after the first.
  const fenceOf = (columns: readonly (readonly string[])[]): string =>
    [
      "`almanac:spacer`",
      "```almanac",
      "row",
      ...columns.flatMap((column, n) => [...(n > 0 ? ["cell"] : []), ...column]),
      "```",
      "",
    ].join("\n");

  const wideBlocks = (text: string): string[][] =>
    flatBlocks(text, WIDE).map((b) => [...b.ids]);

  // And what `cellPlan` draws for it — every child present, one boundary per
  // delimiter, which is what the dispatcher hands it.
  const drawnFor = (columns: readonly (readonly string[])[]): string[][] => {
    const flat = columns.flat();
    const bounds: { at: number; weight: number }[] = [];
    let seen = 0;
    columns.forEach((column, n) => {
      if (n > 0) bounds.push({ at: seen, weight: 1 });
      seen += column.length;
    });
    return cellPlan(flat.map(() => true), bounds).cells.map((cell) =>
      cell.map((i) => flat[i])
    );
  };

  const shapes: string[][][] = [
    [["a"], ["b"], ["c"]],
    [["a"], ["b"], ["c"], ["d"]],
    [["a"], ["b"], ["c"], ["d"], ["e"]],
    [["a", "b"], ["c"], ["d"]],
    [["a"], ["b"], ["c", "d"]],
    [["a"], ["b"], ["c"], ["d"], ["e"], ["f"]],
  ];

  for (const shape of shapes) {
    it(`writes what the render draws, for ${shape.length} columns`, () => {
      // THE ASSERTION THIS WHOLE DESCRIBE EXISTS FOR. `capColumns` folds the
      // render one child at a time and the column phase moves the file one
      // widget at a time; both ask `dealInto` in the same order, and this is
      // what says so. A page that changed shape on Save would be a worse bug
      // than the wrap this release fixes.
      const text = fenceOf(shape);
      const out = regroupFlatNote(text, WIDE, wideBlocks(text));
      expect(columnsIn(out ?? text)).toEqual(drawnFor(shape));
    });
  }

  it("deals a fence of four into a 2x2 and leaves it there", () => {
    // AND IT SETTLES. The dealt file is what the editor reads back, so the next
    // Save is handed a `want` built from it and finds nothing to do — which is
    // the property that keeps a note out of every sync log in the vault.
    const text = fenceOf([["a"], ["b"], ["c"], ["d"]]);
    const out = regroupFlatNote(text, WIDE, wideBlocks(text))!;
    expect(columnsIn(out)).toEqual([["a", "c"], ["b", "d"]]);
    expect(regroupFlatNote(out, WIDE, wideBlocks(out))).toBeNull();
  });

  it("loses nobody on the way", () => {
    // The cheapest thing that could possibly go wrong with a fold, and the one
    // worth stating on its own: a reader's widget is never dropped to make the
    // arithmetic come out.
    const shape = [["a"], ["b"], ["c"], ["d"], ["e"]];
    const text = fenceOf(shape);
    const out = regroupFlatNote(text, WIDE, wideBlocks(text))!;
    expect(columnsIn(out).flat().sort()).toEqual(shape.flat().sort());
  });

  it("leaves a group already within the cap byte-identical", () => {
    // Which is every fence any catalogue in this plugin composes. A phase that
    // rewrote those would be a Save reshaping a homepage nobody touched.
    expect(regroupFlatNote(PAGE, CAT, blocksOf(PAGE))).toBeNull();
  });
});
