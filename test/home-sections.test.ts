// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import {
  JOURNALS_DASHBOARD_SECTIONS,
  composeJournalsDashboardNote,
} from "../src/journals/journals-dashboard-sections";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  homeSections,
  composeHomeNote,
  homeSectionModel,
  HOME_CSS_CLASS,
  collapseJournalsBlocks,
} from "../src/diary/home-sections";
import { DEFAULT_PATHS, HEADER_PREFIX, TRENDS_HEADING } from "../src/core/constants";
import { planLayout, segment } from "../src/core/layout";
import {
  composeFlatNote,
  parseFlatSections,
  PAGE_TITLE_LINE,
} from "../src/core/note-sections";
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

  it("locks the banner and nothing else", () => {
    // THE DIARY CARD CAME OFF THE LIST IN 4.53. It had been locked since 4.2 on
    // the argument that this page has no `links:` row, so the card's
    // destination pills are the homepage's only time navigation — and that is
    // still true of the PAGE and was never true of the VAULT. The ribbon, the
    // palette and the diary dashboard are all still there, so the lock was not
    // holding open the only door; it was refusing a reader a homepage of
    // journals and charts for nothing. `diary` in `home-sections.ts` records
    // the reversal.
    //
    // AND THE BANNER IS LOCKED AS OF 4.19, WHICH IS FELT HARDEST HERE. This
    // page's banner carries no navigation, so the argument that locks it
    // elsewhere does not apply — it is locked because ONE rule across nine
    // surfaces beats a rule a reader has to learn per page. `bannerSection`
    // states the trade and this is the test that records the cost. It is now
    // the whole of the list, which is why the name of this test changed.
    expect(HOME_SECTIONS.filter((s) => s.locked).map((s) => s.id)).toEqual([
      "banner",
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
    expect(home()).toContain(`\`\`\`almanac-charts\n${HEADER_PREFIX}${TRENDS_HEADING.replace(/^#+\s*/, "")}\n\`\`\``);
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
      // AND IT CARRIES THE THREE DESTINATIONS AS OF 4.20, where it was the bare
      // `title` from 4.5 onward. `home-sections.ts` has the argument: the
      // banner means the same thing on this page as on the other eight, and the
      // launcher's tiles are content rather than chrome.
      "title:home,diary,journals",
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
    "```almanac\nframe: section\njournals:cards\n```",
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
    expect(out).toContain("```almanac\nframe: section\njournals:cards\n```");
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
    const keepAll = ["banner", "diary", "launcher", "tasks", "on-this-day", "journals", "charts"];
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
        `\`\`\`almanac\n${WIDE_KEYWORD}\n${PAGE_TITLE_LINE}\n\`\`\``,
        `\`\`\`almanac\n${WIDE_KEYWORD}\n${PAGE_TITLE_LINE}\njournals\n\`\`\``
      )
      .replace("\n```almanac\nframe: section\njournals:cards\n```\n", "");
    const ops = model.plan(shared, [
      "banner",
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
    expect(refusal?.detail).toContain("Banner");
    expect(refusal?.detail).toContain("Split the block first");
    // AND THE FILE IS UNCHANGED, which is the promise the sentence makes.
    expect(
      model.apply(shared, [
        "banner",
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
      "banner",
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
    //
    // TWO OF THEM FROM 4.58.1: `time-grid` joins `tags` for the same reason and
    // ahead of it in catalogue order. A homepage is RECONCILED, so a section it
    // composed would appear on every homepage that already exists; offering it
    // is how the grid reaches the readers who want one without arriving for the
    // readers who do not.
    expect(own(model.addable(home()))).toEqual(["time-grid", "tags"]);
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
    expect(model.addable(home()).map((s) => s.id)).toContain("w:diary-search#1");
  });

  it("offers what a stripped homepage is missing", () => {
    const bare = "`almanac:spacer`\n```almanac\ndiary:3\n```\n";
    expect(own(model.addable(bare))).toEqual([
      "banner",
      "launcher",
      "tasks",
      "on-this-day",
      // Offered here for the ORDINARY reason rather than the opt-in one: this
      // homepage is missing nearly everything, and an opt-in section is addable
      // whether or not the page is stripped. Its place in the list is its place
      // in the catalogue.
      "time-grid",
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

  it("lets every row move, and every row but the head go", () => {
    // The lock is on existence, not on order — 2.60.2's distinction. A flat
    // note has no band arithmetic that could strand a section the way the
    // dashboard masthead strands `summary`.
    //
    // EXCEPT THE HEAD, and the exception is why this assertion is still worth
    // making: the pin is a SECOND rule, on one row, and a locked row must not
    // be caught by it.
    for (const v of model.sections()) {
      if (v.id === "banner") continue;
      expect(v.movable, v.id).toBe(true);
    }
    // THE DIARY CARD IS BOTH AS OF 4.53, and this used to be the test that
    // recorded it being neither-quite: locked, so `removable` was false, and
    // moving anyway. It is now an ordinary row and asserted as one — the two
    // flags are still two questions, and the row that answers them differently
    // is the head, one test down.
    const card = model.sections().find((v) => v.id === "diary")!;
    expect(card.removable).toBe(true);
    expect(card.movable).toBe(true);
  });

  it("fixes the banner in place, and no longer lets it go", () => {
    // 4.11. The two flags are two questions: a homepage without a title card is
    // a coherent thing to want, and a homepage with its title filed under the
    // charts is not. So the head is the one row that is removable and immovable
    // at once — which is also what makes the "fixed" pill in the editor
    // necessary, since the subtitle has no refusal to carry.
    const head = model.sections().find((v) => v.id === "banner")!;
    expect(head.movable).toBe(false);
    expect(head.removable).toBe(false);
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
    const shuffled = [...ids.filter((id) => id !== "banner"), "banner"];
    expect(model.apply(home(), shuffled)).toBeNull();
    expect(
      model.plan(home(), shuffled).some((op) => op.kind === "move")
    ).toBe(false);
  });

  it("no longer refuses to remove the diary card", () => {
    // 4.53, and the sentence it stops saying is worth naming: "Part of what a
    // homepage is, so it can't be removed. You can still move it." The refusal
    // is gone because the lock is, and BOTH halves have to go together — a
    // section with `locked: false` and a refusal would be a Remove button that
    // does nothing, which is the failure §3 is about.
    expect(model.refusal("diary", home())).toBeNull();
    // And the write agrees with the window: unticking it actually takes it out.
    const out = model.apply(home(), COMPOSED.map((s) => s.id).filter((id) => id !== "diary"));
    expect(out).not.toBeNull();
    expect(out).not.toContain("diary:");
  });

  it("refuses to remove charts that are holding the reader's own", () => {
    // OFF THE CONSTANT, NOT A LITERAL (4.26). This built its fixture by
    // replacing the title the homepage composes, so when the heading was
    // renamed the replace silently matched nothing, the fixture came back
    // without the chart line, and the assertion failed on `refusal` returning
    // null — a stale literal reported as a behaviour change.
    const bar = `${HEADER_PREFIX}${TRENDS_HEADING.replace(/^#+\s*/, "")}`;
    const withCharts = home().replace(bar, `${bar}\nchart:Mood`);
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
    // THE DIRECTIVE, NOT THE WORD (4.20). The banner's own destination row names
    // Journals, so a substring test now passes only by accident of the section
    // still being there — and would keep passing if the removal silently failed.
    expect((next ?? "").split("\n")).not.toContain("journals");
    expect(next).not.toContain("\n\n\n");
  });

  it("takes a removed widget's height with it (4.22 §5.4)", () => {
    // THE FOURTH PLACE A HEIGHT MUST NOT BE ORPHANED, and the one no drag path
    // covers: `applyFlatSections` cuts exactly the section's own line and touches
    // nothing adjacent, which is what keeps it a reconciler — so a `height:` line
    // above the removed directive would survive and size its neighbour.
    //
    // A reader removing one widget from a group and watching a DIFFERENT one
    // change shape is the failure, and it is invisible until it happens.
    const lines = home().split("\n");
    const at = lines.indexOf("journals:cards");
    expect(at, "no journals:cards directive on the homepage").toBeGreaterThan(-1);
    const sized = [...lines.slice(0, at), "height: 240", ...lines.slice(at)];
    const next = model.apply(
      sized.join("\n"),
      composedIds.filter((id) => id !== "journals")
    );
    expect(next).not.toBeNull();
    expect((next ?? "").split("\n")).not.toContain("journals");
    // AND THE HEIGHT IS GONE WITH IT, rather than left sizing whatever moved up.
    expect((next ?? "").split("\n")).not.toContain("height: 240");
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
    const want = ["banner", "diary", "launcher", "tasks", "on-this-day", "charts"];
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

// ── 4.37: the journals block becomes one card per journal ─────────────────

describe("the journals block, and the migration that upgrades it", () => {
  it("composes the card arrangement", () => {
    // THE ARGUMENT THAT REFUSED THIS HAS INVERTED. `journals` draws every journal,
    // every top-level container and every child of each — three levels on the
    // homepage — and until 4.36 that was the only place any of it could be seen.
    // 4.1 §2.2 refused a per-journal dashboard on those grounds. The dashboard
    // exists now, so enumerating a journal's contents HERE is the duplication that
    // release was written to remove.
    expect(home()).toContain("```almanac\nframe: section\njournals:cards\n```");
    expect(home()).not.toMatch(/^journals$/m);
  });

  it("still composes the bare form on the page that is about journals", () => {
    // `journals` is untouched and is still right where the reader has come to see
    // what is inside their journals. This is a change of arrangement on ONE page,
    // not a retirement.
    expect(readSrc("journals-dashboard-sections")).toContain('"journals"');
  });

  it("recognises both spellings, so repair adds no second block", () => {
    // THE LOCATOR IS THE HALF THAT PREVENTS A DUPLICATE, and it is the same shape
    // 4.36 wrote for `level-(index|cards)` for the same reason: this page is
    // RECONCILED, so a homepage written before this release must be seen as
    // already having this section rather than having a second one added beside it.
    const journals = homeSections(ROOT).find((s) => s.id === "journals");
    expect(journals, "no journals section").toBeTruthy();
    const locate = journals!.locate;
    const fence = (line: string): string => `\`\`\`almanac\nframe: section\n${line}\n\`\`\``;
    expect(locate(fence("journals")), "pre-4.37 spelling not found").toBeGreaterThan(-1);
    expect(locate(fence("journals:cards")), "current spelling not found").toBeGreaterThan(-1);
    // And a page with no journals block at all is still a miss, or repair would
    // never add the section to a homepage that genuinely lacks it.
    expect(locate("```almanac\ndiary:3\n```")).toBe(-1);
  });

  it("upgrades an existing homepage exactly, and only once", () => {
    // WHY A MIGRATION AT ALL. Repair is additive and the section is already
    // there, so `reconcileLayouts` correctly does nothing — verified by hand
    // against `repairNote`, which returned zero ops. Doing nothing leaves every
    // existing homepage on the three-level list forever, which is why this is the
    // fourth one-off migration rather than a reconciliation.
    const fresh = composeHomeNote(ROOT);
    const old = fresh.replace("journals:cards", "journals");
    expect(old).not.toBe(fresh);
    // EXACTLY the composed page: a migration that landed somewhere between the two
    // would leave a page neither version writes.
    expect(collapseJournalsBlocks(old, "journals:cards")).toBe(fresh);
    // IDEMPOTENT, which is what lets a reader run repair twice — the property
    // `ROADMAP-4.19` checks by running its migration twice against a vault.
    expect(collapseJournalsBlocks(fresh, "journals:cards")).toBeNull();
  });

  it("touches nothing outside an almanac fence, or that the reader chose", () => {
    // "journals" IS AN ORDINARY ENGLISH WORD. A reader's heading or prose must not
    // be rewritten, so the fence state is tracked rather than inferred from
    // position — a homepage may hold several fences and the reader may have moved
    // this one.
    const cards = (t: string): string | null => collapseJournalsBlocks(t, "journals:cards");
    expect(cards("journals\n")).toBeNull();
    expect(cards("# journals\n\njournals\n")).toBeNull();
    expect(cards("```js\njournals\n```")).toBeNull();
    // ALREADY RIGHT IS A NO-OP — the property that lets a reader run repair twice.
    expect(cards("```almanac\njournals:cards\n```")).toBeNull();
    // AND `journals-header:study` IS A DIFFERENT WIDGET that happens to share
    // seven letters, and it sits on every journal dashboard. Matching by prefix
    // would have rewritten it into oblivion; the directive is matched whole.
    expect(cards("```almanac\njournals-header:study\n```")).toBeNull();
    expect(collapseJournalsBlocks("```almanac\njournals-header:study\n```", "journals")).toBeNull();
    // And it does fire on the real shape, so the negatives above are not vacuous.
    expect(cards("```almanac\njournals\n```")).toBe("```almanac\njournals:cards\n```");
    // BOTH DIRECTIONS, which is new in 4.38.2 and is the half the dashboard needs:
    // that page wants the bare form back.
    expect(collapseJournalsBlocks("```almanac\njournals:cards\n```", "journals")).toBe(
      "```almanac\njournals\n```"
    );
  });

  // ── The duplication loop, closed (4.38.2) ──────────────────────────────
  //
  // A reader ran repair and the window alternated: "adds journals" one time,
  // "draw the Journals section as one card per journal" the next, and the
  // journals dashboard grew a second identical Journals section on every cycle.
  //
  // 4.37's migration claimed it *"only ever matches one page in the vault"*. The
  // journals dashboard composes a bare `journals` as its MAIN section, so the
  // migration rewrote that too, to a spelling that page's strict `locate` could
  // not find — and `reconcileLayouts` then did the correct thing with the wrong
  // input and added one.
  describe("the journals block cannot multiply", () => {
    const home = (): string => composeHomeNote(ROOT);
    const dash = (): string => composeJournalsDashboardNote();

    it("leaves the journals dashboard's own spelling alone", () => {
      // THE PAGE DECIDES, AND THE DECISION IS THE CALLER'S. The dashboard's
      // section is not a summary of somewhere else — it IS the page — so it keeps
      // the full index rather than a grid of cards.
      expect(dash()).toContain("\njournals\n");
      expect(collapseJournalsBlocks(dash(), "journals")).toBeNull();
      // And `scaffold` picks the argument from the path rather than guessing.
      const scaffold = readSrc("scaffold");
      expect(scaffold).toContain("const journalsArgumentFor = (");
      expect(scaffold).toContain(
        'normalizePath(dest) === normalizePath(paths.home) ? "journals:cards" : "journals"'
      );
    });

    it("collapses the duplicates an earlier repair already wrote", () => {
      // A vault that ran the broken migration has two or more journals fences on a
      // page, and no amount of correct behaviour from here on removes them.
      const twice = dash().replace(
        "```almanac\nframe: section\njournals\n```",
        "```almanac\nframe: section\njournals:cards\n```\n\n```almanac\nframe: section\njournals:cards\n```"
      );
      expect(twice.match(/^journals(:cards)?$/gm)).toHaveLength(2);
      const fixed = collapseJournalsBlocks(twice, "journals");
      expect(fixed, "the duplicate was not collapsed").not.toBeNull();
      // EXACTLY the composed page again — one block, the right spelling, and the
      // blank line that separated the duplicate gone with it.
      expect(fixed).toBe(dash());
    });

    it("keeps the FIRST block, so a moved section stays where it was put", () => {
      // A reader who moved their journals section up the page moved it
      // deliberately, and a migration that relocates a section is doing more than
      // it was asked.
      const moved =
        "```almanac\njournals:cards\n```\n\n# Notes\n\n```almanac\njournals\n```\n";
      expect(collapseJournalsBlocks(moved, "journals")).toBe(
        "```almanac\njournals\n```\n\n# Notes\n"
      );
    });

    it("is a fixed point after one pass, on both pages", () => {
      // THE PROPERTY THE BUG VIOLATED, stated directly: repair run twice must not
      // differ from repair run once. Both pages, both spellings, and the second
      // call must return null rather than merely the same text.
      for (const [text, keep] of [
        [home(), "journals:cards"],
        [dash(), "journals"],
      ] as const) {
        const once = collapseJournalsBlocks(text, keep) ?? text;
        expect(collapseJournalsBlocks(once, keep), keep).toBeNull();
      }
    });

    it("asks the question in exactly one place (4.38.3)", () => {
      // THE ROOT CAUSE OF THREE PATCHES IN A ROW. "Does this note already carry
      // the Journals section?" was answered in FOUR places with four spellings,
      // and 4.37's `journals:cards` broke three of them:
      //
      //   • `ensureJournalsBlock` compared the line exactly → appended a second
      //     block when a journal was created, on a CLEAN vault (4.38.3).
      //   • the dashboard's `locate` did the same → repair grew a section every
      //     run (4.38.2).
      //   • the homepage's `locate` was widened by hand in 4.37 to `journals\S*`,
      //     a fourth spelling that happened to be right — and which would also
      //     have matched `journals-header:study`.
      //
      // Each patch corrected one caller and left the others for a reader to find.
      // This asserts the shape that stops that: one definition, and no caller
      // carrying its own copy of the pattern.
      const constants = readSrc("constants");
      expect(constants).toContain("const JOURNALS_DIRECTIVE_BODY =");
      expect(constants).toContain("export const isJournalsDirective");
      expect(constants).toContain("export const JOURNALS_DIRECTIVE_LINE");
      for (const [mod, use] of [
        ["journal", "isJournalsDirective(l)"],
        ["home-sections", "isJournalsDirective(line)"],
        ["home-sections", "probe(text, JOURNALS_DIRECTIVE_LINE)"],
        ["journals-dashboard-sections", "probe(text, JOURNALS_DIRECTIVE_LINE)"],
      ] as const) {
        expect(readSrc(mod), `${mod} stopped sharing the predicate`).toContain(use);
      }
      // AND NOBODY KEEPS A PRIVATE COPY. A second literal is how the four came to
      // disagree in the first place, so the pattern must appear in one file only.
      //
      // COMMENTS STRIPPED FIRST, and the first version of this did not and FAILED:
      // `home-sections.ts` explains the bug by QUOTING the probe it replaced. That
      // is 4.37's recorded trap — an absence assertion on prose is defeated by the
      // prose explaining the absence — and a file that documents a reversal will
      // always name what it reversed.
      const code = (mod: string): string =>
        readSrc(mod)
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
      for (const mod of ["journal", "home-sections", "journals-dashboard-sections"]) {
        expect(code(mod), mod).not.toMatch(/\^journals[(\\]/);
      }
    });

    it("lets the dashboard find a block on either spelling", () => {
      // THE BELT TO THE FIX'S BRACES. With this probe the growth stops even before
      // the migration runs: a page momentarily on the other spelling is recognised
      // as having its journals section rather than judged to be missing one.
      const journals = JOURNALS_DASHBOARD_SECTIONS.find((sec) => sec.id === "journals");
      expect(journals, "no journals section on the dashboard").toBeTruthy();
      const at = journals!.locate;
      const fence = (line: string): string =>
        `\`\`\`almanac\nframe: section\n${line}\n\`\`\``;
      expect(at(fence("journals")), "composed spelling not found").toBeGreaterThan(-1);
      expect(at(fence("journals:cards")), "migrated spelling not found").toBeGreaterThan(-1);
      // A page that genuinely lacks the section is still a miss, or repair could
      // never add it to a dashboard that needs one.
      expect(at("```almanac\ndiary:3\n```")).toBe(-1);
      // AND A DIFFERENT WIDGET IS NOT IT.
      expect(at(fence("journals-header:study"))).toBe(-1);
    });
  });

  it("is offered in the repair window with the other four", () => {
    // OPT-IN, which matters more than usual: the `migrations` group is ticked
    // separately, so a reader who wants their three-level list keeps it by not
    // ticking it. Both halves have to be wired or the window offers a change it
    // will not make, or makes one it did not offer.
    const scaffold = readSrc("scaffold");
    expect(scaffold).toContain("collapseJournalsBlocks(welded, journalsArgumentFor(dash, p))");
    expect(scaffold).toContain("await this.cardJournalsBlock(dash)");
    expect(scaffold).toContain("draw the Journals section as one card per journal");
    // The dry run diffs against the LAST link in the chain, or the preview would
    // be computed against a text the migration had not been applied to. The
    // chain gained a sixth link in 4.59.0 — the period summary's header bar — so
    // the name here moved with it; the RULE is what this line pins, and it is
    // the rule that would be broken by leaving the old name behind.
    expect(scaffold).toContain("diff: diffText(original, titledSummary)");
    expect(scaffold).toContain("titleSummaryFence(carded) ?? carded");
  });
});

describe("the homepage's time grid", () => {
  // 4.58.1, and the second of the two surfaces where the grid is honest as a
  // section. `weekStartOf` falls back to the CURRENT week when the host note
  // declares no `week-start` — a miss on a month dashboard and the whole intent
  // here, because a homepage is a page about now.
  const model = homeSectionModel(ROOT);
  const grid = HOME_SECTIONS.find((s) => s.id === "time-grid")!;

  it("takes a block of its own rather than a cell", () => {
    // Seven columns of hours do not fit in half a page. The same call `charts`
    // and `tags` make, and the reason this section has no `row`.
    expect(grid.row).toBeUndefined();
    expect(grid.cell).toBeUndefined();
  });

  it("composes the header bar and the directive into one fence", () => {
    const base = home();
    const out = model.apply(base, [...model.present(base), "time-grid"]);
    expect(out).toContain(
      "```almanac\nheader:⏱️ The week by the hour\ntime-grid\n```"
    );
  });

  it("is offered, never shipped, and never repaired away", () => {
    // A homepage is RECONCILED, which is exactly why this is `optIn`: a composed
    // section would appear on every homepage that already exists, and a reader
    // who took it off would find repair putting it back.
    expect(grid.optIn).toBe(true);
    expect(home()).not.toContain("time-grid");
    const base = home();
    const out = model.apply(base, [...model.present(base), "time-grid"]);
    expect(model.apply(out, model.present(out).filter((id) => id !== "time-grid"))).toBe(
      base
    );
  });

  it("is one per page, where the widget behind it is not", () => {
    const base = home();
    const out = model.apply(base, [...model.present(base), "time-grid"]);
    expect(own(model.addable(out))).not.toContain("time-grid");
    expect(
      model.addable(out).map((s) => s.id).filter((id) => id.startsWith("w:time-grid"))
    ).toEqual([]);
    // And the widget door is closed here too, because the catalogue writes the
    // keyword — `pageWidgetKeywords` withholds it on both surfaces that have a
    // section for it.
    expect(
      model.addable(base).map((s) => s.id).filter((id) => id.startsWith("w:time-grid"))
    ).toEqual([]);
  });

  it("asks the registry's question rather than its own", () => {
    const view = model.sections(home()).find((s) => s.id === "time-grid");
    expect(view?.questions?.[0]?.values?.map((v) => v.value)).toEqual([
      "events",
      "logbooks",
      "tasks",
    ]);
  });
});
