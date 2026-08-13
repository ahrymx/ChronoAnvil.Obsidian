// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  homeSections,
  composeHomeNote,
  homeSectionModel,
  HOME_CSS_CLASS,
} from "../src/diary/home-sections";
import { DEFAULT_PATHS } from "../src/core/constants";
import { planLayout, segment } from "../src/core/layout";
import { composeFlatNote, parseFlatSections } from "../src/core/note-sections";
import type { FlatSection } from "../src/core/note-sections";
import {
  SEARCH_SECTIONS,
  composeSearchNote,
} from "../src/diary/search-sections";
import { cellPlan } from "../src/ui/widgets/row";
import { isPageWidgetId } from "../src/core/widget-sections";
import type { SectionView } from "../src/core/section-model";
import { readCss, readSrc } from "./sources";
import { WIDE_KEYWORD } from "../src/core/directive-grammar";

const ASSETS = resolve(__dirname, "..", "assets");
// The catalogue takes the vault's configured diary root, because `tag-index`
// now says which folder it counts rather than the renderer assuming one
// (3.11 §6). Tests use the shipped default.
const ROOT = DEFAULT_PATHS.diaryRoot;
const HOME_SECTIONS = homeSections(ROOT);
const home = (): string => composeHomeNote(ROOT);
// What the homepage is COMPOSED from, which since 3.13 §11 is not the same as
// what it OFFERS: `on-this-day` is `optIn`, so the editor lists it and
// `composeHomeNote` does not write it. Everything asserting a round trip
// through the composed note takes this list; everything asserting what the
// catalogue holds takes HOME_SECTIONS.
const COMPOSED = HOME_SECTIONS.filter((s) => !s.optIn);

// The catalogue's OWN sections, out of a list the model answered with.
//
// 4.12 §C appended every page widget the homepage does not already manage to the
// same list, which is what `addable` is for — but most cases here are asking
// about the homepage's catalogue rather than about the door, and a case that
// means one should not be written as if it meant both.
const own = (views: readonly SectionView[]): string[] =>
  views.map((v) => v.id).filter((id) => !isPageWidgetId(id));
const composedIds = COMPOSED.map((s) => s.id);

describe("the home catalogue is data, which is the point", () => {
  it("gives every section an id, a label, a blurb and an icon", () => {
    for (const s of HOME_SECTIONS) {
      expect(s.id, s.id).toBeTruthy();
      expect(s.label, s.id).toBeTruthy();
      expect(s.blurb, s.id).toBeTruthy();
      expect(s.icon, s.id).toBeTruthy();
    }
  });

  it("has no duplicate ids", () => {
    const ids = HOME_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("locates each of its own sections in the note it composes", () => {
    // The property every catalogue rests on: a section it WROTE must be a
    // section it can FIND, or the editor offers to add a second copy of
    // something already there.
    const text = home();
    for (const s of COMPOSED) {
      expect(s.locate(text), s.id).toBeGreaterThanOrEqual(0);
    }
  });

  it("locks the diary card and nothing else", () => {
    // A vault whose homepage has no way into the diary is worse than one with
    // no homepage: the diary card's destination pills are the note's only
    // navigation, since there is no `links:` row on it.
    expect(HOME_SECTIONS.filter((s) => s.locked).map((s) => s.id)).toEqual([
      "diary",
    ]);
  });

  it("guards the charts section against an untick", () => {
    // Not locked and not freely removable either — the one section here where
    // those are different answers. Same rule as the four dashboards'.
    const charts = HOME_SECTIONS.find((s) => s.id === "charts");
    expect(charts?.holds).toBeDefined();
    expect(charts?.holds?.("chart:Mood\nchart:Energy")).toBe(2);
    expect(charts?.holds?.("nothing here")).toBe(0);
  });
});

describe("what the homepage composes to", () => {
  it("opens with the spacer, on line 0 of the file", () => {
    // Documented as sitting directly above the first widget so a click at the
    // top of the note does not land inside it.
    //
    // LINE 0 OF THE FILE AGAIN AS OF 4.11, which is where it was before 4.2 §2.
    // That release gave the homepage a `cssclasses` key for its width and pushed
    // the spacer under it; 4.11 puts the width in the head's own fence, where the
    // cog can write one and where every other dashboard now carries it — so the
    // homepage has no frontmatter at all and is a flat note in full.
    const lines = home().split("\n");
    expect(lines[0]).toBe("`almanac:spacer`");
    expect(lines).not.toContain("---");
  });

  it("merges a row and nothing else", () => {
    // THE TRAP 3.11 §12 NAMES, restated for 4.2 §2 rather than relaxed.
    // `composeDiaryDashboard` welds a BAND into a single fence because the
    // masthead is one card; copying that rule here would collapse the whole
    // page into one fence, and every section would still `locate` fine, so
    // nothing else would notice.
    //
    // A row is the opposite of that merge: sections that SAID they are one
    // block, by name. So the count is one fence per row plus one per section
    // that has no row — computed from the catalogue rather than written as a
    // number, so a section added later is counted rather than forgotten.
    const composed = HOME_SECTIONS.filter((s) => !s.optIn);
    const expected = composed.filter(
      (s, i) => !s.row || s.row !== composed[i - 1]?.row
    ).length;
    const fences = segment(home().split("\n")).filter((s) => s.kind === "fence");
    expect(fences).toHaveLength(expected);
    // And the page is not one fence, which is what the trap actually is.
    expect(fences.length).toBeGreaterThan(1);
  });

  it("composes the top row as one block, in catalogue order", () => {
    expect(home()).toContain(
      "```almanac\nrow\ndiary:3\ncell\nlauncher\ntasks-table\non-this-day:always\n```"
    );
  });

  it("stacks the two small widgets in one cell, and the diary card in its own", () => {
    // 4.4 §3, and the arrangement the render asked for: the diary card is a
    // greeting, a stat strip, a month grid and an agenda; the other two are a
    // list and a list. Two halves, not three thirds.
    expect(home()).toContain(TOP_ROW);
    const tasks = HOME_SECTIONS.find((s) => s.id === "tasks");
    const otd = HOME_SECTIONS.find((s) => s.id === "on-this-day");
    const diary = HOME_SECTIONS.find((s) => s.id === "diary");
    expect(tasks?.cell).toBeTruthy();
    expect(otd?.cell).toBe(tasks?.cell);
    expect(HOME_SECTIONS.find((s) => s.id === "launcher")?.cell).toBe(tasks?.cell);
    // Absent is not a value: the diary card names no cell, so it gets its own.
    expect(diary?.cell).toBeUndefined();
  });

  it("writes a delimiter only where the cell changes", () => {
    // NEVER BEFORE THE FIRST MEMBER — that one opens the row's first cell by
    // being first, and a leading `cell` line is one a reader has to read past
    // to find out it means nothing. And never between two sections that named
    // the same cell.
    const note = home();
    const open = note.indexOf("```almanac\nrow");
    expect(open, "the top row is gone").toBeGreaterThan(-1);
    const body = note.slice(open + "```almanac\n".length);
    const rowLines = body.slice(0, body.indexOf("```")).split("\n").filter(Boolean);
    expect(rowLines).toEqual([
      "row",
      "diary:3",
      "cell",
      "launcher",
      "tasks-table",
      "on-this-day:always",
    ]);
  });

  it("writes no delimiter at all when no section names a cell", () => {
    // THE PROPERTY THAT KEEPS 4.4 ADDITIVE. A catalogue where nobody declares a
    // cell composes exactly the note it composed before cells existed — not the
    // same note with a delimiter between every pair, which renders identically
    // and reads as noise the reader did not write.
    const cell = (id: string, line: string, row?: string): FlatSection => ({
      id,
      label: id,
      blurb: "",
      icon: "🔹",
      locked: false,
      ...(row ? { row } : {}),
      render: () => ({ fence: "almanac", lines: [line] }),
      locate: (t) => t.search(new RegExp(`^${line}\\b`, "m")),
    });
    const note = composeFlatNote([
      cell("a", "diary", "r"),
      cell("b", "journals", "r"),
    ]);
    expect(note).toContain("```almanac\nrow\ndiary\njournals\n```");
    expect(note).not.toContain("cell");
  });

  it("gives two sections that name no cell one each, not one between them", () => {
    // ABSENT IS NOT A VALUE, and it took a mutation to test this properly. The
    // homepage cannot tell the two readings apart — its row is one undeclared
    // section followed by two that name the same cell — so a catalogue where a
    // DIVIDED row also holds two undeclared sections is what distinguishes
    // them. Read as a value, those two would share a cell and the page would
    // silently lose a column.
    const cell = (id: string, line: string, name?: string): FlatSection => ({
      id,
      label: id,
      blurb: "",
      icon: "🔹",
      locked: false,
      row: "r",
      ...(name ? { cell: name } : {}),
      render: () => ({ fence: "almanac", lines: [line] }),
      locate: (t) => t.search(new RegExp(`^${line}\\b`, "m")),
    });
    const note = composeFlatNote([
      cell("a", "diary"),
      cell("b", "journals"),
      cell("c", "timeline", "x"),
    ]);
    expect(note).toContain(
      "```almanac\nrow\ndiary\ncell\njournals\ncell\ntimeline\n```"
    );
    // And the same rule one level down, where the delimiters are read back.
    expect(cellPlan([true, true], []).cells).toEqual([[0], [1]]);
  });

  it("never merges across fence kinds, or a block's kind is whoever got there first", () => {
    // NOT REACHABLE FROM THE SHIPPED CATALOGUES, which is why it is built here:
    // the charts section is the only `almanac-charts` fence and it is in no
    // row, so nothing on the homepage can exercise the guard. That makes it
    // exactly the kind of condition that rots — a catalogue that later put a
    // charts section in a row would compose a fence whose kind silently
    // belonged to whichever section came first, and every directive in it would
    // be read by the wrong processor.
    const fake: FlatSection[] = [
      {
        id: "a",
        label: "A",
        blurb: "",
        icon: "🅰️",
        locked: false,
        row: "r",
        render: () => ({ fence: "almanac", lines: ["diary"] }),
        locate: (t) => t.search(/^diary\b/m),
      },
      {
        id: "b",
        label: "B",
        blurb: "",
        icon: "🅱️",
        locked: false,
        row: "r",
        render: () => ({ fence: "almanac-charts", lines: ["chart:Mood"] }),
        locate: (t) => t.search(/^chart:/m),
      },
    ];
    const note = composeFlatNote(fake);
    expect(note).toContain("```almanac\nrow\ndiary\n```");
    expect(note).toContain("```almanac-charts\nrow\nchart:Mood\n```");
    expect(segment(note.split("\n")).filter((s) => s.kind === "fence")).toHaveLength(2);
  });

  it("only joins a row's members while they are consecutive", () => {
    // A ROW IS A BLOCK AND A BLOCK IS CONTIGUOUS, so two sections carrying the
    // same row id with another section between them are not a row. The
    // catalogue's ORDER is what makes a row, which keeps that fact in one
    // place — and without this the third section would be spliced into the
    // second's block, a page the reader never asked for.
    //
    // Also not reachable from the shipped catalogue, and found by mutating: the
    // homepage's row members are adjacent, so nothing there tells the two
    // implementations apart.
    const cell = (id: string, line: string, row?: string): FlatSection => ({
      id,
      label: id,
      blurb: "",
      icon: "🔹",
      locked: false,
      ...(row ? { row } : {}),
      render: () => ({ fence: "almanac", lines: [line] }),
      locate: (t) => t.search(new RegExp(`^${line}\\b`, "m")),
    });
    const note = composeFlatNote([
      cell("a", "diary", "r"),
      cell("b", "journals"),
      cell("c", "timeline", "r"),
    ]);
    expect(segment(note.split("\n")).filter((s) => s.kind === "fence")).toHaveLength(3);
    expect(note).not.toContain("journals\ntimeline");
  });

  it("keeps the charts block in its own almanac-charts fence", () => {
    expect(home()).toContain("```almanac-charts\nheader:📊 Trends and Statistics\n```");
  });

  it("separates every fence with exactly one blank line", () => {
    // `appendSectionMarkdown` and the section walk both read these, so a note
    // that gains or loses one reads as a section boundary moving.
    expect(home()).not.toContain("```\n\n\n```");
    expect(home()).not.toContain("```\n```");
  });

  it("declares no frontmatter, and asks for its width in the note", () => {
    // THE OLD FORM OF THIS TEST — "declares no frontmatter" — came back in 4.11,
    // and what it was always really asserting is unchanged: unlike a period
    // dashboard, the homepage is not navigated by a property and must not grow
    // one.
    //
    // 4.2 §2 made it declare `cssclasses` for its WIDTH, because nothing else
    // could reach Obsidian's sizer. 4.11 can: a `wide` line in the block that
    // draws the page's title, marked on the card, read with `:has()` — which is
    // the mechanism every other dashboard uses and the one the cog writes. So the
    // key is gone and the setting is in the note, where a reader can see it.
    expect(home()).not.toContain("---");
    expect(home()).not.toContain("cssclasses");
    expect(home().split("\n").slice(0, 4)).toEqual([
      "`almanac:spacer`",
      "```almanac",
      WIDE_KEYWORD,
      "title",
    ]);
  });

  it("gives the page a width of its own, in the stylesheet", () => {
    // THE HALF THE NOTE CANNOT CARRY. The frontmatter names a class; the class
    // means nothing until a rule reads it, and the rule has to reach Obsidian's
    // own sizer in BOTH views — a page that changed width when you clicked into
    // it would read as a rendering fault.
    //
    // Asserted on the stylesheet because that is where the decision lives: the
    // page takes `--am-page-width` rather than `--file-line-width`, which is a
    // number about how many characters read comfortably in a line of prose.
    const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    const at = rules.indexOf(`.markdown-preview-view.${HOME_CSS_CLASS}`);
    expect(at, "no reading-view width rule").toBeGreaterThan(-1);
    const rule = rules.slice(at, rules.indexOf("}", at));
    expect(rule).toContain(`.markdown-source-view.${HOME_CSS_CLASS} .cm-sizer`);
    expect(rule).toContain("max-width: var(--am-page-width)");
    expect(rule).not.toContain("--file-line-width");
  });

  it("states which folder the tag cloud counts", () => {
    // 3.11 §6. `tag-index` used to default to the diary root inside the
    // renderer — the only folder-scoped directive that did not scope to its
    // host. Now the default matches its three siblings and the homepage says
    // what it means, in the note, where a reader can change it.
    //
    // ASSERTED ON THE SECTION RATHER THAN ON THE COMPOSED NOTE AS OF 4.1 §2.1,
    // because the section is `optIn` now and the homepage no longer writes it.
    // The rule it is here to pin is unchanged and still load-bearing: the
    // moment a reader adds Tags back, the folder has to be in the line.
    const tags = homeSections(ROOT).find((s) => s.id === "tags");
    expect(tags?.render().lines).toContain(`tag-index:${ROOT}`);
    expect(tags?.render().lines).not.toContain("tag-index");
  });

  it("finds the tag section however the folder is repointed", () => {
    // `locate` matches the keyword, not the argument, so a reader who aims
    // the cloud at their own folder still has a section the editor can find
    // and remove.
    //
    // Built by adding the section back rather than by reading it out of the
    // shipped note, for the reason above — and that is the case that matters,
    // since after 4.1 the only homepage with a tag cloud on it is one whose
    // reader put it there.
    const withTags = homeSectionModel(ROOT).apply(home(), [
      ...composedIds,
      "tags",
    ]) as string;
    const mine = withTags.replace(`tag-index:${ROOT}`, "tag-index:99 - Mine");
    expect(homeSectionModel(ROOT).present(mine)).toContain("tags");
  });

  it("no longer ships as an asset", () => {
    // Composed as of 3.11 §1. Two descriptions of one arrangement is what
    // 2.59.3 deleted the dashboard assets to avoid.
    expect(readdirSync(ASSETS)).not.toContain("home.md");
  });
});

// The homepage's own top row — diary, tasks and on this day in one block —
// which 4.2 §2 composes and which is now the shape these rules are really
// about. It was a hand-built fixture until the catalogue grew a row.
//
// A BLOCK THE READER DID NOT MAKE, and that is the change: these refusals and
// cuts now run on a page Almanac writes, so "it only happens if you arranged it
// yourself" stopped being the safety net and the behaviour has to be right.
const TOP_ROW = "```almanac\nrow\ndiary:3\ncell\nlauncher\ntasks-table\non-this-day:always\n```";

// A block holding a section whose extent is NOT one line: Tags is a `header:`
// bar and its directive. Hand-built, because no catalogue composes one — which
// is exactly why the refusal it triggers still needs a test.
const MULTILINE_ROW = (): string =>
  home().replace(
    "```almanac\njournals\n```",
    `\`\`\`almanac\nrow\njournals\nheader:🏷️ Tags\ntag-index:${ROOT}\n\`\`\``
  );

describe("a block holding two sections is the unit (4.2 §2)", () => {
  const model = homeSectionModel(ROOT);

  it("is the shape the homepage now composes", () => {
    // The fixtures below assert against the real page rather than a
    // replacement, so this is the one thing that has to hold for the rest to
    // mean anything.
    expect(home()).toContain(TOP_ROW);
    expect(MULTILINE_ROW(), "multiline fixture matched nothing").not.toBe(home());
  });

  it("cuts one cell out and leaves the block standing", () => {
    // THE CASE THE ROW MADE ORDINARY. Every cell of the top row renders one
    // line, so its extent is known rather than inferred: unticking On this day
    // takes that line and nothing else — the `row` line stays, the other two
    // cells stay, and the block is still a block.
    const out = model.apply(home(), ["diary", "tasks", "journals", "charts"]);
    expect(out).not.toBeNull();
    expect(out).toContain("```almanac\nrow\ndiary:3\ncell\ntasks-table\n```");
    expect(out).not.toContain("on-this-day");
    // The rest of the page is untouched.
    expect(out).toContain("```almanac\njournals\n```");
  });

  it("says it is removing it, and then removes it", () => {
    // The plan and the apply have to agree — the whole point of the 4.2 work.
    const ops = model.plan(home(), ["diary", "tasks", "journals", "charts"]);
    expect(ops.find((o) => o.sectionId === "on-this-day")?.kind).toBe("remove");
  });

  it("leaves the delimiter behind when a cell is emptied, and that is harmless", () => {
    // THE ONE 4.4 §3 SAID TO LOOK AT FIRST. Unticking both sections of the
    // right-hand cell leaves `row / diary:3 / cell` — a delimiter with nothing
    // after it.
    //
    // IT IS LEFT, AND THAT IS THE DECISION. Removing it would mean the apply
    // pass deleting a line the reader did not untick, which is the formatter
    // behaviour this catalogue refuses everywhere else — and it would be
    // deleting the one line that says where a cell they may want back goes.
    // `cellPlan` drops empty runs precisely so this costs nothing: the block
    // renders as the single cell it now is.
    const out = model.apply(home(), ["diary", "journals", "charts"]);
    expect(out).not.toBeNull();
    expect(out).toContain("```almanac\nrow\ndiary:3\ncell\n```");
    expect(out).not.toContain("tasks-table");
    expect(out).not.toContain("on-this-day");
    // And the row it leaves is a row of one cell, not a row with a hole in it.
    expect(cellPlan([true], [{ at: 1, weight: 1 }]).cells).toEqual([[0]]);
  });

  it("refuses a cell whose extent is more than one line", () => {
    // THE REFUSAL THAT STANDS, and the line between the two behaviours. Tags is
    // a `header:` bar plus its directive, so where it ends could only be worked
    // out from where its neighbours' anchors sit — and inferring it wrong
    // deletes a line the reader wrote. `applyFlatSections` is a reconciler.
    const note = MULTILINE_ROW();
    const keepAll = ["title", "diary", "launcher", "tasks", "on-this-day", "journals", "charts"];
    const ops = model.plan(note, keepAll);
    const tags = ops.find((o) => o.sectionId === "tags");
    expect(tags?.kind).toBe("keep");
    expect(tags?.detail).toContain("one block with");
    expect(tags?.detail).toContain("Journals");
    // And it does not quietly write anyway.
    expect(model.apply(note, keepAll)).toBeNull();
  });

  it("removes the whole block when every cell is unticked", () => {
    // The path that always worked and must keep working. The top row cannot
    // reach it — the diary card is locked, so that block can never be emptied —
    // so this uses the multi-line fixture, where both cells are removable.
    const note = MULTILINE_ROW();
    const out = model.apply(note, ["diary", "tasks", "on-this-day", "charts"]);
    expect(out).not.toBeNull();
    expect(out).not.toContain("tag-index");
    expect(out).not.toContain("\njournals");
    expect(out).toContain("almanac-charts");
  });

  it("does not make a cell a unit of its own, and says so truthfully", () => {
    // 4.4 §3's first open question, answered: a CELL is not a move unit this
    // release. The reorder pass permutes blocks, and two sections stacked in
    // one cell are a smaller version of the same thing — so the refusal that
    // already existed covers it, and covers it honestly: it names the sections
    // the block holds rather than a block the reader cannot see.
    const ops = model.plan(home(), ["on-this-day", "diary", "tasks", "journals", "charts"]);
    const refusal = ops.find((o) => o.detail.includes("moves with it"));
    expect(refusal?.sectionId).toBe("on-this-day");
    expect(refusal?.detail).toContain("Diary");
    expect(refusal?.detail).toContain("Open tasks");
    expect(ops.filter((o) => o.kind === "move")).toHaveLength(0);
  });

  it("refuses to move one cell out of its block", () => {
    // The reorder pass permutes CHUNKS and a chunk is a block, so a move naming
    // one cell of a row could never happen. It used to be reported anyway.
    const ops = model.plan(home(), ["on-this-day", "diary", "tasks", "journals", "charts"]);
    expect(ops.filter((o) => o.kind === "move")).toHaveLength(0);
    const refusal = ops.find((o) => o.detail.includes("moves with it"));
    expect(refusal, "no explanation for the move that cannot happen").toBeDefined();
    expect(refusal?.kind).toBe("keep");
  });

  it("will not move a block that holds the page head, and names it", () => {
    // 4.11, AND IT IS THE ONE ROUTE `holdPinned` CANNOT SEE. That function
    // permutes ids and a chunk is a BLOCK, so a reader who typed the head and
    // another section into one fence could move the OTHER section and take the
    // head along with it. The refusal lands on the section that was asked to
    // move, because a plan names what the reader did.
    const shared = home()
      .replace(
        `\`\`\`almanac\n${WIDE_KEYWORD}\ntitle\n\`\`\``,
        `\`\`\`almanac\n${WIDE_KEYWORD}\ntitle\njournals\n\`\`\``
      )
      .replace("\n```almanac\njournals\n```\n", "");
    const ops = model.plan(shared, [
      "title",
      "diary",
      "launcher",
      "tasks",
      "on-this-day",
      "journals",
      "charts",
    ]);
    expect(ops.filter((o) => o.kind === "move")).toHaveLength(0);
    const refusal = ops.find((o) => o.detail.includes("always first"));
    expect(refusal?.kind).toBe("keep");
    expect(refusal?.sectionId).toBe("journals");
    expect(refusal?.detail).toContain("Page title");
    expect(refusal?.detail).toContain("Split the block first");
    // AND THE FILE IS UNCHANGED, which is the promise the sentence makes.
    expect(
      model.apply(shared, [
        "title",
        "diary",
        "launcher",
        "tasks",
        "on-this-day",
        "journals",
        "charts",
      ])
    ).toBeNull();
  });

  it("still moves a section that has a block of its own", () => {
    // The refusal must not spread. Charts is in its own block and moves past
    // the row freely, and the row keeps its cells in the order they were
    // written.
    const out = model.apply(home(), [
      "charts",
      "title",
      "diary",
      "launcher",
      "tasks",
      "on-this-day",
      "journals",
    ]);
    expect(out).not.toBeNull();
    expect(out!.indexOf("almanac-charts")).toBeLessThan(out!.indexOf("row"));
    expect(out).toContain(TOP_ROW);
  });

  it("composes exactly one shared block, and every cell of it is cuttable", () => {
    // THE PROPERTY THAT REPLACES "no catalogue composes one". A catalogue may
    // now compose a shared block — but only of sections whose extent is one
    // line, or it would be shipping a page whose cells the reader cannot
    // remove. Asserted over both flat pages so Search cannot grow one quietly.
    for (const [note, sections] of [
      [home(), HOME_SECTIONS],
      [composeSearchNote(), SEARCH_SECTIONS],
    ] as const) {
      for (const run of parseFlatSections(note, sections)) {
        if (run.sectionIds.length < 2) continue;
        for (const id of run.sectionIds) {
          const s = sections.find((x) => x.id === id);
          expect(s?.render().lines.length, `${id} is a cell of more than one line`).toBe(1);
        }
      }
    }
  });
});

describe("the home model", () => {
  const model = homeSectionModel(ROOT);

  it("never asks which surface it is on", () => {
    // Asserted the way the other catalogues assert it: the module must not
    // import a grain, a note kind or a journal type.
    const src = readFileSync(
      resolve(__dirname, "..", "src", "diary", "home-sections.ts"),
      "utf8"
    );
    expect(src).not.toContain("TrackerClass");
    expect(src).not.toContain("noteKindOf");
    expect(src).not.toContain("JournalType");
  });

  it("reports every composed section as present", () => {
    expect(model.present(home())).toEqual(composedIds);
  });

  it("offers the one section it does not compose", () => {
    // 4.1 §2.1's `tags`, and only that as of 4.2 §2 — `on-this-day` is composed
    // again, as a cell of the top row. The distinction the count is really
    // about survives whichever way the number goes: a section REMOVED FROM THE
    // SHIPPED LAYOUT is still offered, where one TAKEN AWAY would not be.
    //
    // In catalogue order, which is the order the editor lists them in.
    //
    // ASKED OF THE CATALOGUE'S OWN SECTIONS, as of 4.12 §C. Every page widget the
    // homepage has no opinion about is now also addable, appended after
    // everything here — so the question this case is asking has to say which half
    // it means. The widget half gets its own cases below.
    expect(own(model.addable(home()))).toEqual(["tags"]);
  });

  it("offers every page widget it does not already manage", () => {
    const offered = model.addable(home()).map((s) => s.id);
    const widgets = offered.filter(isPageWidgetId);
    expect(widgets.length).toBeGreaterThan(10);
    // AFTER EVERYTHING THE CATALOGUE HAS AN OPINION ABOUT, which is not a rule
    // this file states — `insertionPoint` ranks by catalogue position and the
    // tail is last, so a widget lands at the end of the page for free.
    expect(offered.slice(-widgets.length)).toEqual(widgets);
    // AND NOT THE SIX IT ALREADY WRITES. The de-dup is derived by showing each
    // catalogue `locate` the line the widget would write, because a `locate` is a
    // function and that is the only honest way to ask it what it matches.
    for (const claimed of [
      "diary",
      "launcher",
      "tasks-table",
      "on-this-day",
      "journals",
      "tag-index",
    ]) {
      expect(widgets, claimed).not.toContain(`w:${claimed}`);
    }
  });

  it("still offers diary-search, which the diary card used to swallow", () => {
    // `diary`'s locator was `/^diary\b/m` until 4.12, and `\b` matches at a
    // hyphen — so the Diary card claimed a `diary-search` fence. The de-dup probe
    // would then have withheld the search widget from the one page most likely to
    // want it, for a reason nobody could have guessed. The locator now says what
    // may follow the keyword.
    expect(model.addable(home()).map((s) => s.id)).toContain("w:diary-search");
  });

  it("offers what a stripped homepage is missing", () => {
    const bare = "`almanac:spacer`\n```almanac\ndiary:3\n```\n";
    expect(own(model.addable(bare))).toEqual([
      "title",
      "launcher",
      "tasks",
      "on-this-day",
      "journals",
      "charts",
      "tags",
    ]);
  });

  it("puts every row in one band", () => {
    // One band, so `group` is null and the editor's "two rows may swap when
    // their groups match" reads as "any two rows may swap".
    for (const v of model.sections()) expect(v.group, v.id).toBeNull();
  });

  it("lets every row move, including the locked one", () => {
    // The lock is on existence, not on order — 2.60.2's distinction. A flat
    // note has no band arithmetic that could strand a section the way the
    // dashboard masthead strands `summary`.
    //
    // EXCEPT THE HEAD, and the exception is why this assertion is still worth
    // making: the pin is a SECOND rule, on one row, and the locked rows must not
    // be caught by it. `diary` is locked and still moves.
    for (const v of model.sections()) {
      if (v.id === "title") continue;
      expect(v.movable, v.id).toBe(true);
    }
    const locked = model.sections().find((v) => v.id === "diary")!;
    expect(locked.removable).toBe(false);
    expect(locked.movable).toBe(true);
  });

  it("fixes the page title in place, and still lets it go", () => {
    // 4.11. The two flags are two questions: a homepage without a title card is
    // a coherent thing to want, and a homepage with its title filed under the
    // charts is not. So the head is the one row that is removable and immovable
    // at once — which is also what makes the "fixed" pill in the editor
    // necessary, since the subtitle has no refusal to carry.
    const head = model.sections().find((v) => v.id === "title")!;
    expect(head.movable).toBe(false);
    expect(head.removable).toBe(true);
    expect(model.refusal("title", home())).toBeNull();
  });

  it("holds the page title at the top however the ids arrive", () => {
    // The editor never offers the move — `bandOf` puts an immovable row in no
    // band — so this is about every OTHER caller: a command, a stale window, a
    // future one. `holdPinned` is asked in the plan and again in the write, so
    // the preview and the file cannot disagree.
    // COMPOSED rather than every id: an opt-in section in the `want` is an ADD,
    // and an add is a change — which would make this pass or fail for a reason
    // that has nothing to do with the pin.
    const ids = COMPOSED.map((s) => s.id);
    const shuffled = [...ids.filter((id) => id !== "title"), "title"];
    expect(model.apply(home(), shuffled)).toBeNull();
    expect(
      model.plan(home(), shuffled).some((op) => op.kind === "move")
    ).toBe(false);
  });

  it("refuses to remove the diary card, and names the fix", () => {
    const why = model.refusal("diary", home());
    expect(why).toContain("cannot be removed");
    expect(why).toContain("move it");
  });

  it("refuses to remove charts that are holding the reader's own", () => {
    const withCharts = home().replace(
      "header:📊 Trends and Statistics",
      "header:📊 Trends and Statistics\nchart:Mood"
    );
    expect(model.refusal("charts", withCharts)).toContain("Remove it first");
    // And allows it once they are gone.
    expect(model.refusal("charts", home())).toBeNull();
  });

  it("returns null when nothing would change", () => {
    // Idempotence made structural rather than claimed: a second call has
    // nothing left to return.
    expect(model.apply(home(), composedIds)).toBeNull();
  });

  it("removes a section and the gap it leaves", () => {
    // `journals` is the worked example since 4.1 moved `tags` off the shipped
    // page: it is the composed section that is neither locked nor holding
    // anything of the reader's, which is what makes it freely removable.
    const next = model.apply(
      home(),
      composedIds.filter((id) => id !== "journals")
    );
    expect(next).not.toBeNull();
    expect(next).not.toContain("journals");
    expect(next).not.toContain("\n\n\n");
  });

  it("restores the file exactly on remove-then-re-add", () => {
    // The property worth having because a test can check it: insertion is
    // anchored to the sections the file has, not to an absolute position.
    const ids = composedIds;
    const without = model.apply(home(), ids.filter((id) => id !== "journals"));
    expect(without).not.toBeNull();
    expect(model.apply(without as string, ids)).toBe(home());
  });

  it("leaves a reader's own block alone and says so", () => {
    // THE FIXTURE IS AN INLINE WIDGET, AND IT HAS TO BE, AS OF 4.12 §C. This was
    // `sleep-summary` — a perfectly good stand-in for "a fence the reader wrote"
    // until every page widget became a section the catalogue can name, at which
    // point the block stopped being foreign and this case stopped testing
    // anything. `slider:` is in `NOT_PAGE_WIDGETS` for a stated reason (it writes
    // one frontmatter property, so it belongs on the note that records it), so it
    // is a directive that renders, is not a page widget, and never will be —
    // which makes the exclusion table load-bearing here rather than decorative.
    const mine = home() + "\n```almanac\nslider:Mood|Mood\n```\n";
    const ops = model.plan(mine, HOME_SECTIONS.map((s) => s.id));
    const foreign = ops.find((o) => o.kind === "foreign");
    // AND IT AGREES WITH ITSELF ABOUT NUMBER. This said "1 block ... aren't"
    // until 4.2 §2 — the count was pluralised and the verb was not. It went
    // unseen because the only note that reached this line in a test had one
    // foreign block, which is also the case a reader meets most often.
    expect(foreign?.detail).toContain("1 block");
    expect(foreign?.detail).toContain("isn't the catalogue's");
    const two = mine + "\n```almanac\nslider:Mood|Mood\n```\n";
    const bothOps = model.plan(two, HOME_SECTIONS.map((s) => s.id));
    expect(bothOps.find((o) => o.kind === "foreign")?.detail).toContain(
      "2 blocks in this file aren't"
    );
    // And a rearrangement does not eat it.
    const moved = model.apply(mine, ["diary", "charts", "journals"]);
    expect(moved).toContain("slider:Mood|Mood");
  });

  it("does not report the page's own frontmatter as a stray block", () => {
    // THE REGRESSION 4.2 §2 CAUSED AND THIS PINS. `segment` has no concept of
    // frontmatter, so the homepage's opening `---` run arrives as raw lines
    // owned by no section — and the moment `composeHomeNote` started writing
    // `cssclasses`, every freshly composed homepage opened the section window
    // saying "1 block in this file isn't the catalogue's; left alone", about a
    // line the plugin had just written itself.
    //
    // Asserted on a PRISTINE composed note, because that is the case that must
    // be silent: a page nobody has touched has nothing to report.
    const ops = model.plan(home(), composedIds);
    expect(ops.find((o) => o.kind === "foreign")).toBeUndefined();
  });

  it("still reports a stray block on a note that has frontmatter", () => {
    // The other half, and the reason the fix is a leading-run rule rather than
    // "ignore raw runs": a reader's own fence under their own frontmatter is
    // still theirs and must still be reported. A fix that made the note quiet
    // would have traded a false alarm for a silence.
    const mine = home() + "\n```almanac\nslider:Mood|Mood\n```\n";
    expect(model.plan(mine, composedIds).find((o) => o.kind === "foreign"))
      .toBeDefined();
  });

  it("reads a mid-note --- as the reader's rule, not as frontmatter", () => {
    // The care the fix needs, and it took a mutation to write this test
    // properly. A `---` anywhere but the top of the file is a thematic break
    // somebody typed; treating one as frontmatter swallows everything up to the
    // NEXT `---`, so a run that should be reported as the reader's becomes one
    // that is not reported at all — a false alarm traded for a silence.
    //
    // TWO RULES WITH PROSE BETWEEN THEM, because that is the shape that tells
    // the two implementations apart. One rule alone never closes, and an
    // unterminated block is handed back whole by either — which is why the
    // first version of this test passed against the bug.
    const withRules = home() + "---\n\nSome notes of my own.\n\n---\n";
    expect(model.plan(withRules, composedIds).find((o) => o.kind === "foreign"))
      .toBeDefined();
  });

  it("does not read a rule under the reader's own opening prose as frontmatter", () => {
    // The third shape, and the one the opening-line guard is really for. A note
    // that begins with a paragraph and then a rule has a `---` in its first run
    // that is not at the top of it. A rule that searched the run for `---`
    // instead of requiring it on line 0 would take the paragraph as frontmatter
    // and the page would stop reporting the reader's own writing.
    const body = home().slice(home().indexOf("`almanac:spacer`"));
    const withIntro = "Some notes of my own.\n\n---\n\n" + body;
    expect(model.plan(withIntro, composedIds).find((o) => o.kind === "foreign"))
      .toBeDefined();
  });

  it("plans a move without naming the sections that merely shifted", () => {
    // moveOps reports the minimal set: dragging one section past another
    // shifts the index of everything between them, and a plan that named all
    // of those would say several things happened when one did.
    const ops = model.plan(home(), ["diary", "charts", "journals"]);
    const moves = ops.filter((o) => o.kind === "move");
    expect(moves).toHaveLength(1);
  });

  it("applies only what the plan named", () => {
    // The property the whole preview rests on.
    const want = ["title", "diary", "launcher", "tasks", "on-this-day", "charts"];
    const ops = model.plan(home(), want);
    const removed = ops.filter((o) => o.kind === "remove").map((o) => o.sectionId);
    expect(removed).toEqual(["journals"]);
    const next = model.apply(home(), want) as string;
    // Everything else survives byte-for-byte.
    for (const id of want) {
      const s = HOME_SECTIONS.find((x) => x.id === id);
      expect(s?.locate(next), id).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("what the homepage deliberately does not offer", () => {
  it("has no journals-header, upcoming-events or sleep-summary section", () => {
    // 3.11 §8, and the reason is on record: the journals card already carries
    // the activity band, the diary card already ends with the upcoming-events
    // agenda, and sleep is a chart. Each would be a second way to see
    // something the page already shows once.
    //
    // Pinned as a test because "we decided not to" is invisible in a
    // catalogue, and the next reader's instinct on finding three dispatching
    // widgets with no section will be to add them.
    const ids = HOME_SECTIONS.map((s) => s.id);
    expect(ids).not.toContain("journals-header");
    expect(ids).not.toContain("upcoming");
    expect(ids).not.toContain("sleep-summary");
    expect(home()).not.toContain("journals-header");
    expect(home()).not.toContain("events:upcoming");
    expect(home()).not.toContain("sleep-summary");
  });
});

describe("on this day ships again, as a cell (4.2 §2)", () => {
  const model = homeSectionModel(ROOT);

  it("writes it as a cell, without adding a block to the page", () => {
    // 3.13 §11 TOOK IT OFF THE PAGE, AND 4.2 §2 ANSWERS THAT ARGUMENT RATHER
    // THAN IGNORING IT. Both halves of it were about a block in a COLUMN: that
    // it appears unannounced after a reader's first year, and that it was the
    // one block here about the past on a note that is about NOW. In a row it
    // arrives in a cell that is already drawn, and it is a third of a row
    // rather than a band pushing the page down.
    //
    // IT COSTS NO BLOCK, which is the assertion that says so. The page has one
    // more fence than it did in 4.3 — 4.5's title card — and this section is
    // not it: `on-this-day` is a line inside the row's second cell, sharing a
    // block with two other widgets.
    expect(home()).toContain("on-this-day");
    const rowBlock = home().slice(home().indexOf("```almanac\nrow"));
    expect(rowBlock.slice(0, rowBlock.indexOf("```", 3))).toContain("on-this-day");
  });

  it("keeps it in the catalogue, addable, movable and removable", () => {
    // §11.4's whole argument. Deleting the entry would have left an existing
    // homepage's block unmanaged — not listed, not movable, not removable —
    // which is the failure `tags` was catalogued to prevent: "removing it by
    // hand is how a reader ends up with a homepage they are afraid to let
    // repair touch."
    const otd = HOME_SECTIONS.find((s) => s.id === "on-this-day");
    expect(otd).toBeDefined();
    expect(otd?.locked).toBe(false);
    const view = model.sections().find((v) => v.id === "on-this-day");
    expect(view?.movable).toBe(true);
    expect(model.refusal("on-this-day", home())).toBeNull();
  });

  it("comes back in a block of its own once it has been taken out", () => {
    // A CELL THAT LEAVES A ROW DOES NOT REJOIN IT, and this is the documented
    // cost of `FlatSection.row` rather than a defect: `renderFlatSection`
    // composes one section and knows nothing about its neighbours, so a
    // re-added section arrives in a block of its own. The alternative is
    // writing into a block the reader may have arranged since, which is the
    // formatter behaviour this catalogue refuses everywhere else.
    //
    // It is still a FULL CITIZEN, which is what §11.4 was really protecting:
    // it can be taken out and put back, and the page is coherent both times.
    const without = model.apply(home(), ["diary", "tasks", "journals", "charts"]) as string;
    expect(without).not.toContain("on-this-day");
    const back = model.apply(without, composedIds) as string;
    expect(back).toContain("on-this-day");
    expect(back).toContain("```almanac\non-this-day:always\n```");
    // The row it left is still a row, with the cell that stayed — and the
    // delimiter still marks where the second one was.
    expect(back).toContain("```almanac\nrow\ndiary:3\ncell\ntasks-table\n```");
  });

  it("leaves an existing homepage's block alone when repair runs", () => {
    // THE ROW §11.4 TURNS ON. `planLayout` deletes a directive the note has
    // and the shipped layout does not ONLY when `RETIRED_WIDGETS` names it,
    // and this widget is not retired — it still ships on Search. So a vault
    // set up before 3.13 keeps five sections through every repair, one set up
    // between 3.13 and 4.1 has four, one set up after has three, and none of
    // them is wrong.
    //
    // 4.1 §2.4 IS THIS ROW, WIDENED. `tags` is now the second directive in the
    // same position, so it is asserted beside `on-this-day` rather than
    // separately: the rule is "nothing is removed from an existing homepage",
    // and it is one rule.
    const older = model.apply(home(), ["diary", "on-this-day", "journals", "charts", "tags"]) as string;
    const ops = planLayout(older.split("\n"), home().split("\n"));
    expect(ops.filter((o) => o.keyword === "on-this-day")).toHaveLength(0);
    expect(ops.filter((o) => o.keyword === "tag-index")).toHaveLength(0);
  });

  it("is read by the composer and by nothing else", () => {
    // §11.4 proposed a new `ships?: boolean` for this and `optIn` already was
    // it, word for word — "offered but not shipped: in `sections()` and
    // `addable`, absent from `compose`". The rule that made the proposed field
    // safe is the one that matters and it survives the renaming: only
    // `composeFlatNote` may ask. `plan`, `apply`, `refusal`, `addable` and
    // `present` are all about the note in front of the reader, and this field
    // is about the note the plugin would write from nothing.
    const t = readSrc("note-sections");
    // ASSERTED AS *WHERE*, NOT AS *HOW MANY*, as of 4.4 §3. The count was two
    // and is now three — the declaration, the composer's skip, and the
    // composer's own look-ahead for which rows divide themselves — and a test
    // that pins a number fails for a reader that moved as loudly as for one
    // that appeared somewhere it should not.
    //
    // The rule has never been about the count. It is that only
    // `composeFlatNote` may ask: `plan`, `apply`, `refusal`, `addable` and
    // `present` are all about the note in front of the reader, and this field
    // is about the note the plugin would write from nothing.
    const reads = t.split("\n").filter((l) => /\boptIn\b/.test(l) && !l.trim().startsWith("//"));
    expect(reads[0]).toContain("optIn?: boolean");
    const at = t.indexOf("export function composeFlatNote(");
    const body = t.slice(at, t.indexOf("\n}", at));
    for (const line of reads.slice(1)) {
      expect(body, `optIn is read outside the composer: ${line.trim()}`).toContain(line);
    }
  });
});
