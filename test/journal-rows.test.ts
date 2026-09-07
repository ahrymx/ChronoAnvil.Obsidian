// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Rows on a journal note — 5.11.
//
// WHAT WAS WRONG. The Study subject template has shipped a two-cell row since
// 4.70: Due and open holds the review queue beside the open-task table. The
// section editor could not see it. `journalSectionModel` implemented neither
// `blocks` nor `regroup`, so `hasRows` was false, no group card was drawn, and
// every row of the list carried the "Section" pill — including the two that
// were columns of a group the reader could not touch. A plugin whose whole
// argument is that the reader may rearrange anything shipped one arrangement
// that was arrangeable only by the people who wrote it.
//
// AND WHY THAT NEEDED THE FORM TOGGLE FIRST. `isSectionFence` refuses a fence
// that titles itself as a column, which is the right refusal — a bar inside a
// row would title the whole band. So a journal section could not become a cell
// until it could be asked to draw itself without its bar, which is the 4.59
// question the other three catalogues already ask and this one did not.
//
// The file is checked here rather than in a vault because every case below
// REWRITES A PAGE.

import { describe, expect, it } from "vitest";
import { isPageHeadLine, PAGE_HEAD_KEYWORDS } from "../src/core/directive-grammar";
import { JOURNAL_PRESETS, STUDY_JOURNAL } from "../src/journals/journal";
import {
  buildJournalType,
  composeTemplate,
  journalTemplateFiles,
} from "../src/journals/custom-journal";
import {
  findSection,
  questionsOf,
  templateTargets,
  widgetFormBar,
} from "../src/journals/journal-sections";
import {
  applySections,
  journalSectionModel,
  sectionsPresent,
} from "../src/journals/journal-plan";
import {
  composeJournalsDashboardNote,
  journalsDashboardSectionModel,
} from "../src/journals/journals-dashboard-sections";
import { composeDiaryDashboard, diarySectionModel } from "../src/diary/diary-sections";

// ── THE ROWS ARE COMPOSED, NOT SHIPPED (5.20) ────────────────────────────
//
// Every group this file is about — Review beside Open tasks on a container
// index, the tracker grid paged with the stats band on a leaf one — was a
// SHIPPED row until 5.20 turned all four of those sections off by default.
// Reading the templates off disk therefore stopped producing a row at all, and
// eight tests failed on a null rather than on anything about grouping.
//
// The grammar is unchanged: a group is still what the catalogue welds when two
// adjacent sections are both composed, and `rowRuns` still decides it. So the
// fixtures name the sections and the tests go on asking the question they were
// written to ask.
//
// STATS IS ABSENT FROM THE CONTAINER LIST DELIBERATELY. "The grid alone gets
// its title back" is one of the cases below, and a container index is where
// that has always been true — one level above the notes, the band's numbers are
// already a column each in the children table.
const CONTAINER_IDS = [
  "banner",
  "trackers",
  "children",
  "review",
  "tasks",
  "progress",
  "find",
  "charts",
];
const LEAF_INDEX_IDS = [
  "banner",
  "trackers",
  "stats",
  "children",
  "path",
  "review",
  "resources",
  "charts",
];

const studyIndex = (stem: string, ids: string[]) => {
  const target = templateTargets(STUDY_JOURNAL).find((t) =>
    t.file.includes(stem)
  );
  if (!target) throw new Error(`no ${stem} template`);
  return {
    text: composeTemplate(target.ctx, ids, STUDY_JOURNAL.layout?.[target.key]),
    ctx: target.ctx,
    model: journalSectionModel(target.ctx),
  };
};

// The Study subject index — the container page the row is on.
const subject = () => studyIndex("subject", CONTAINER_IDS);

const shape = (model: ReturnType<typeof journalSectionModel>, text: string) =>
  model.blocks!(text).map((b) => b.ids.join("+"));

describe("a journal note's blocks (5.11)", () => {
  it("reports the shipped row as one block with two columns", () => {
    const { text, model } = subject();
    expect(model.blocks).toBeTypeOf("function");
    expect(model.regroup).toBeTypeOf("function");
    // FOUND BY ITS COLUMNS, NOT BY ITS LENGTH (5.28). A block of more than one
    // id is no longer only ever a row: the banner and the tracker grid share a
    // fence now and report as one block of two. What separates them is exactly
    // the field this test is about — a row's members are columns and the
    // welded pair's are not.
    const row = model
      .blocks!(text)
      .find((b) => b.ids.length > 1 && b.column.length > 0);
    expect(row?.ids).toEqual(["review", "tasks"]);
    // Both cells, not just the one that opens the fence — the pill the editor
    // draws is "Widget" for each of them and "Section" for none. (The word was
    // "Column" when this was written and the sentence outlived it; the pill is
    // still decided by ARRANGEMENT, which is the fact the assertion is about,
    // and not by anything the 5.27 subjects touch.)
    expect([...(row?.column ?? [])].sort()).toEqual(["review", "tasks"]);
  });

  it("does not call the page banner a column", () => {
    // THE LATENT DEFECT THIS RELEASE FOUND. Every head refusal in `cell-move.ts`
    // and the column test in `flatBlocks` keyed on `title` alone, which is the
    // flat catalogues' banner keyword. A journal note's is `journal-header` and
    // a diary entry's is `entry-header`, so both were invisible to a rule
    // written to protect them: the banner was a groupable one-line widget, and
    // a cell could be moved into it.
    //
    // AND THE WELD MADE THE QUESTION SHARPER (5.28). The banner's fence now
    // holds the tracker grid and the note's index as well, so the block really
    // is three sections — the one arrangement where a head shares a fence with
    // something else. It is still not a row: no member is a column, so no cell
    // may be dropped into it and none carries the "Widget" pill.
    const { text, model } = subject();
    const banner = model.blocks!(text).find((b) => b.ids.includes("banner"));
    expect(banner?.ids).toEqual(["banner", "trackers", "children"]);
    expect(banner?.column).toEqual([]);
  });

  it("knows all three page heads by name", () => {
    expect([...PAGE_HEAD_KEYWORDS].sort()).toEqual([
      "entry-header",
      "journal-header",
      "title",
    ]);
    for (const keyword of PAGE_HEAD_KEYWORDS) {
      expect(isPageHeadLine(keyword)).toBe(true);
      expect(isPageHeadLine(`${keyword}:something`)).toBe(true);
    }
    expect(isPageHeadLine("journal-search")).toBe(false);
    expect(isPageHeadLine("header:🔎 Find")).toBe(false);
  });
});

describe("the widget form of a journal section (5.11)", () => {
  it("is offered exactly where the bar is the only thing above one widget", () => {
    const { ctx } = subject();
    const offered = (id: string) => {
      const section = findSection(id, ctx);
      return section ? widgetFormBar(section, ctx) : "NO SUCH SECTION";
    };
    // Offered: a `header:` line and a widget under it, and nothing else.
    expect(offered("find")).toBe("header:🔎 Find");
    expect(offered("review")).toBe("header:🔁 Due and open");
    expect(offered("progress")).toBe("header:📈 Progress");
    // NOT offered, and each for the one reason: something in the fence is
    // anchored INTO the bar and has nowhere to go without it. `children` opens
    // with a `button:` ("New Topic"), `charts` with `jchart:` ("+ Add chart"),
    // and `banner` composes no bar to drop in the first place.
    for (const id of ["banner", "children", "charts"]) {
      expect(offered(id), id).toBeUndefined();
    }
    // AND `trackers` JOINED THEM IN 5.28, from the other direction. It used to
    // be the case the rule was restated for — its "+ Add tracker" is a tile
    // inside the grid rather than a control in the bar, so nothing was stranded
    // when the bar came off. Welded into the banner it composes no bar of its
    // own at all, and a toggle for a bar that is not there is a box that says
    // nothing and writes nothing back.
    expect(offered("trackers")).toBeUndefined();
  });

  it("round-trips through the fence, and the fence is where the answer lives", () => {
    const { text, model } = subject();
    const widget = model.apply(
      text,
      model.present(text).map((id) =>
        id === "find" ? { id, options: { form: "widget" } } : id
      )
    );
    expect(widget).not.toBeNull();
    expect(widget).toContain("```chronoanvil\njournal-search\n```");
    expect(widget).not.toContain("header:🔎 Find");
    // Read back off the file rather than off what was asked for.
    const answered = (t: string) =>
      model.sections(t).find((v) => v.id === "find")?.answered?.form;
    expect(answered(widget as string)).toBe("widget");
    expect(answered(text)).toBe("section");
    // And back again.
    const back = model.apply(
      widget as string,
      model.present(widget as string).map((id) =>
        id === "find" ? { id, options: { form: "section" } } : id
      )
    );
    expect(back).toBe(text);
  });

  it("reads the answer back for a section that declares no questions", () => {
    // THE HALF THAT WAS MISSING FOR ONE TURN. `SectionView.answered` was gated
    // on the catalogue's DECLARED `questions` field, and four of the eight
    // sections the toggle reaches declare nothing at all — so the editor drew
    // the box for them and never told it what the file said. It came up unticked
    // over a fence with no bar, and saving that wrote the bar back over the
    // reader's answer. `progress` is the case: no `folder` question to hide it.
    // (It was `trackers` until 5.28 welded that one into the banner, where it
    // composes no bar and is therefore not asked. The gate is the same gate.)
    const { text, model } = subject();
    const answered = (t: string, id: string) =>
      model.sections(t).find((v) => v.id === id)?.answered?.form;
    expect(answered(text, "progress")).toBe("section");
    const widget = model.apply(
      text,
      model.present(text).map((id) =>
        id === "progress" ? { id, options: { form: "widget" } } : id
      )
    ) as string;
    expect(widget).toContain("```chronoanvil\nactivity-chart\n```");
    expect(widget).not.toContain("header:📈 Progress");
    expect(answered(widget, "progress")).toBe("widget");
    // And the row still offers the question, which is the other half of the
    // same gate.
    const view = model.sections(widget).find((v) => v.id === "progress");
    expect((view?.questions ?? []).some((q) => q.kind === "form")).toBe(true);
  });

  it("is not told it is missing a title while the answer is the reader's", () => {
    // The 5.10 repair offers a section the `header:` line its catalogue entry
    // composes. Once the same section can be drawn as a widget, a fence with no
    // bar has two causes and this one cannot tell them apart — so it goes quiet
    // rather than writing the reader's answer away on the next save.
    const { text, model } = subject();
    const widget = model.apply(
      text,
      model.present(text).map((id) =>
        id === "find" ? { id, options: { form: "widget" } } : id
      )
    ) as string;
    const ops = model.plan(widget, model.present(widget));
    expect(ops.filter((o) => o.kind !== "keep")).toEqual([]);
    expect(model.apply(widget, model.present(widget))).toBeNull();
  });

  it("offers the toggle to a cell too, on the bar it wears alone (5.21)", () => {
    // WHAT CHANGED, AND WHAT IT COST. This case used to assert the opposite,
    // on the argument 5.18 wrote out in `test/section-model.test.ts`: *"a cell
    // of a row is already a widget, and the control for it is the group card's
    // Ungroup rather than a form toggle on a section that is not one."*
    //
    // That argument is right while the section IS a cell, and it runs out one
    // gesture later. Ungrouping hands the cell its solo title — `undoRowOfOne`
    // and the cut path both do — so the reader ends up with a titled Open tasks
    // and, because `widgetFormBar` asked what the section RENDERS on this
    // surface and it renders barless here, no control anywhere to take the
    // title off again. The bar arrives by a gesture and cannot leave by one.
    //
    // So the bar a cell would drop is `soloBarOf`: the same line `soloBar`
    // splices and `withAnswers` removes, which is what makes answering the
    // question a round trip rather than a third writer.
    const { ctx } = subject();
    const tasks = findSection("tasks", ctx)!;
    expect(widgetFormBar(tasks, ctx)).toBe("header:⏳ Open tasks");
    expect(
      questionsOf(tasks, ctx).some((q) => q.kind === "form")
    ).toBe(true);
  });

  it("and pays for it by leaving a stale barless cell alone", () => {
    // THE PRICE, ASSERTED RATHER THAN DISCOVERED. 5.11's rule is that a barless
    // fence under a toggle is an ANSWER, not an omission — `declaredBar` goes
    // quiet for any section that carries one — so the 5.10 repair no longer
    // offers Open tasks the title it used to. A page written before the cut
    // path titled its cells keeps the headless fence it has.
    //
    // That is the cheap side of the trade and it is 5.11's own: repairing would
    // overwrite an answer the reader gave, on a save they asked for something
    // else in. What they get instead is the control — the toggle above is in
    // the same window as the sentence that would have offered the repair.
    const { text, model } = subject();
    const apart = model.regroup!(
      text,
      shape(model, text).map((b) => b.split("+")).map((ids) =>
        ids.length > 1 ? [ids[0]] : ids
      ).concat([["tasks"]]),
      []
    );
    expect(apart).not.toBeNull();
    const ops = model.plan(apart as string, model.present(apart as string));
    expect(ops.find((o) => o.sectionId === "tasks")?.kind).not.toBe("extend");
  });

  it("composes the answer rather than reversing it (5.21)", () => {
    // WHERE THE TOGGLE NEARLY DID NOTHING. `sectionBlocks` honours the answer
    // and hands `composeSectionRuns` a fence with no bar in it, and the very
    // next thing that function did was pass `soloBarOf` to `rowRuns` — which
    // welds the title back on for any run that has come down to one member.
    // Open tasks alone IS such a run, so a stored layout answering `widget`
    // composed a titled section: the answer honoured and then undone inside one
    // call, with no gesture in between that a reader could see.
    //
    // Reachable from a saved layout, which is where a section's `options` live
    // — the same field `label` and `headings` already ride in.
    // The row is broken up first — Review left out — so Open tasks is the run
    // of one this is about. With Review beside it the fence takes the ROW's
    // title and there is no solo bar for anything to reverse.
    const target = templateTargets(STUDY_JOURNAL).find((t) =>
      t.file.includes("subject")
    )!;
    const alone = CONTAINER_IDS.filter((id) => id !== "review");
    const bare = composeTemplate(target.ctx, alone, {
      order: alone,
      options: { tasks: { form: "widget" } },
    });
    expect(bare).toContain("tasks-table");
    expect(bare).not.toContain("header:⏳ Open tasks");

    // AND NOT AT THE COST OF THE CELL THAT NEVER ANSWERED: the same run, with
    // nothing said about it, still gets the title `soloBar` exists to give it.
    // The guard reads the section's own options, not the shape of the run.
    const titled = composeTemplate(target.ctx, alone, { order: alone });
    expect(titled).toContain("header:⏳ Open tasks");
  });

  it("still repairs a barless section that has no widget form", () => {
    // THE OTHER SIDE OF THE SAME RULE, AND THE REASON THE GUARD IS DRAWN AROUND
    // THE TOGGLE RATHER THAN AROUND "BARLESS". `children` opens with a
    // `button:` — "New Topic", anchored INTO its bar with nowhere to go once
    // the bar does — so it has no widget form, a fence of its own with no title
    // over it can only be a page behind the catalogue, and the repair still
    // writes the line.
    //
    // It used to be `tasks` that made this point, which is the whole of what
    // 5.21 changed: that section now has somewhere for the answer to come from
    // and this one still does not.
    const { text, ctx, model } = subject();
    const children = findSection("children", ctx)!;
    expect(widgetFormBar(children, ctx)).toBeUndefined();

    const stale = text.replace("header:🗂️ Topics\n", "");
    expect(stale).not.toBe(text);
    const ops = model.plan(stale, model.present(stale));
    expect(ops.find((o) => o.sectionId === "children")?.kind).toBe("extend");
  });
});

describe("grouping a journal note (5.11)", () => {
  it("refuses to make a cell of a section that still titles itself", () => {
    // Not a defect — the refusal IS the reason the toggle exists. A fence that
    // carries a `header:` line is a section, and a section is not a column.
    const { text, model } = subject();
    // THE STACK IS ASKED FOR AS THE STACK IT IS, which it was not before 5.29
    // and did not need to be: naming its three members as three blocks used to
    // be a request the write refused — the grid and the index have no extent
    // the file states, so phase one could not move them and the fence stayed as
    // it was. It CAN move them now, one `stack` line each, so leaving the old
    // spelling here would quietly make this a test about breaking a stack up.
    // What it is about is the row, which is unchanged.
    const want = [
      ["banner", "trackers", "children"],
      ["find", "progress"],
      ["review", "tasks"], ["charts"],
    ];
    expect(model.regroup!(text, want, [])).toBeNull();
  });

  it("makes a group of two widgets, and reads it back as one", () => {
    const { text, model } = subject();
    const widgets = model.apply(
      text,
      model.present(text).map((id) =>
        id === "find" || id === "progress" ? { id, options: { form: "widget" } } : id
      )
    ) as string;
    const grouped = model.regroup!(
      widgets,
      [
        // As above: the stack asked for as one block, so that the only thing
        // this regroup is asking for is the group.
        ["banner", "trackers", "children"],
        ["find", "progress"],
        ["review", "tasks"], ["charts"],
      ],
      []
    );
    expect(grouped).not.toBeNull();
    expect(grouped).toContain(
      "```chronoanvil\nrow\njournal-search\ncell\nactivity-chart\n```"
    );
    expect(shape(model, grouped as string)).toEqual([
      // FIND BEFORE REVIEW (5.20): the shipped Subject index pinned its own
      // order until this release, and with the pin gone this is the catalogue's
      // — `find` sits above the queue in the array. What the test is about is
      // the grouping, which is unchanged.
      // `banner+trackers` is the 5.28 weld, not a group the reader made — see
      // "does not call the page banner a column" above.
      "banner+trackers+children", "find+progress", "review+tasks", "charts",
    ]);
    // AND IT SETTLES. The editor re-reads the file it just wrote; a second pass
    // that found anything to do would loop the window.
    const ids = model.present(grouped as string);
    expect(model.plan(grouped as string, ids).filter((o) => o.kind !== "keep")).toEqual([]);
    expect(model.apply(grouped as string, ids)).toBeNull();
    expect(
      model.regroup!(grouped as string, shape(model, grouped as string).map((b) => b.split("+")), [])
    ).toBeNull();
  });

  it("breaks a group up without taking the reader's answer back", () => {
    const { text, model } = subject();
    const widgets = model.apply(
      text,
      model.present(text).map((id) =>
        id === "find" || id === "progress" ? { id, options: { form: "widget" } } : id
      )
    ) as string;
    const grouped = model.regroup!(
      widgets,
      [
        ["banner", "trackers", "children"],
        ["find", "progress"],
        ["review", "tasks"], ["charts"],
      ],
      []
    ) as string;
    const apart = model.regroup!(
      grouped,
      [
        ["banner", "trackers", "children"],
        ["find"], ["progress"],
        ["review", "tasks"], ["charts"],
      ],
      []
    );
    expect(apart).not.toBeNull();
    expect(shape(model, apart as string)).toEqual([
      "banner+trackers+children", "find", "progress", "review+tasks", "charts",
    ]);
    // Two blocks, each one widget, each still in the form the reader chose —
    // this is why `asFlat` leaves `RowMember.bar` unanswered.
    expect(apart).toContain("```chronoanvil\njournal-search\n```");
    expect(apart).toContain("```chronoanvil\nactivity-chart\n```");
    expect(apart).not.toContain("header:🔎 Find");
    expect(
      model.plan(apart as string, model.present(apart as string)).filter((o) => o.kind !== "keep")
    ).toEqual([]);
  });
});

describe("the same guard on the other two catalogues (5.11)", () => {
  it("leaves a flat note's widget answer alone", () => {
    // `planFlatSections` had the wart the journal side had: open the editor on
    // a dashboard whose Recently written had been turned into a widget and it
    // offered the title back, and saving took the answer away.
    const model = journalsDashboardSectionModel();
    const text = composeJournalsDashboardNote();
    const widget = model.apply(
      text,
      model.present(text).map((id) =>
        id === "recent" ? { id, options: { form: "widget" } } : id
      )
    ) as string;
    expect(widget).toContain("```chronoanvil\njournal-recent:all\n```");
    expect(model.plan(widget, model.present(widget)).filter((o) => o.kind !== "keep")).toEqual([]);
    expect(model.apply(widget, model.present(widget))).toBeNull();
  });

  it("leaves a diary period's widget answer alone", () => {
    // And here it bit hardest: the summary and the rollup word their bar from
    // the grain, so a reader who dropped the title on a week would have been
    // handed it back every time the editor opened.
    const ctx = { grain: "weekly" } as const;
    const model = diarySectionModel(ctx);
    const text = composeDiaryDashboard("weekly");
    const ids = model.present(text);
    const asking = model
      .sections(text)
      .filter((v) => ids.includes(v.id) && (v.questions ?? []).some((q) => q.kind === "form"))
      .map((v) => v.id);
    expect(asking.length).toBeGreaterThan(0);
    const widget = model.apply(
      text,
      ids.map((id) => (asking.includes(id) ? { id, options: { form: "widget" } } : id))
    ) as string;
    expect(widget).not.toBeNull();
    expect(
      model.plan(widget, model.present(widget)).filter((o) => o.kind === "extend")
    ).toEqual([]);
  });
});

// ── THE STATE ROW — THE GRID AND THE BAND, PAGED (5.18) ──────────────────
//
// The reader arranged the four shipped journals in a vault and the plugin was
// asked to ship what came out. The pair this file is about is the one that
// needed catalogue work rather than an order: a leaf index draws the tracker
// grid and the stats band as ONE group with two tabs. See `STATE_ROW` in
// `journal-sections.ts` for why it is paged rather than columned, and why it
// carries no band title where "🔁 Due and open" does.
describe("the tracker grid and the stats band (5.18, rewritten in 5.28)", () => {
  const topic = () => studyIndex("topic", LEAF_INDEX_IDS);

  // WHAT 5.18 BUILT AND WHY IT IS GONE. A leaf index composed the grid and the
  // stats band as one untitled row of two pages — the grid's `row: stateRow`,
  // the band's `tab: true` — so that a note's state read as one box instead of
  // two stacked cards. 5.28 took the same 90px out of the same note by welding
  // the grid into the banner's fence instead, and a section that is inside the
  // banner cannot also open a row beside the band. The pairing is not forbidden,
  // only unshipped: **Add to group** still puts the band wherever the reader
  // wants it, and the argument 4.70 made for a tab rather than a column is
  // recorded where the row used to be declared.
  //
  // The tests below are the same three questions asked of the new shape.

  it("puts the grid in the banner and the band on a card of its own", () => {
    const { text, model } = topic();
    expect(text).toContain(
      [
        "```chronoanvil",
        // AND THE FENCE SAYS WHICH ARRANGEMENT IT IS (5.28). `stack` is to
        // sections under each other what `row` is to cells beside each other,
        // and it opens the fence for the same reason a `row` line does.
        //
        // AND WHERE EACH SECTION STARTS (5.29): one line per member, which is
        // `cell`'s other half arriving three releases late. The grid is welded
        // into the banner's fence AND can be taken back out of it, which it
        // could not be while the boundary was something only the composer knew.
        "stack",
        "journal-header",
        "stack",
        "# chronoanvil:trackers:start",
        "tracker:status",
        "# chronoanvil:trackers:end",
        "```",
      ].join("\n")
    );
    // The band keeps the title the row used to deny it — one card, one head,
    // and nothing above it that could be mistaken for its own.
    expect(text).toContain("```chronoanvil\nheader:🔢 Stats\nstats-band\n```");
    // NO ROW AND NO TAB. Both delimiters are gone from this note entirely:
    // there is no group here to draw a box around.
    expect(text).not.toContain("\nrow\n");
    expect(text).not.toContain("\ntab\n");
    // And the editor reads the banner's fence as one block of two sections,
    // neither of them a column — the weld, not a group.
    const banner = model.blocks!(text).find((b) => b.ids.includes("trackers"));
    expect(banner?.ids).toEqual(["banner", "trackers"]);
    expect(banner?.column).toEqual([]);
    const band = model.blocks!(text).find((b) => b.ids.includes("stats"));
    expect(band?.ids).toEqual(["stats"]);
  });

  it("still gives a lone cell its title back, and ships no state row anywhere", () => {
    // THE MECHANISM THAT SURVIVED. `rowRuns` collapses a row that comes down to
    // one member and hands the survivor its `soloBar`; that is what made the
    // grid's title reappear when the band was turned off, and it is what makes
    // Due and open's reappear when the open-task table is. The 5.18 case is
    // gone; the rule it exercised is not, so it is exercised here instead.
    const { text, ctx } = subject();
    expect(text).toContain(
      "```chronoanvil\nrow\nheader:🔁 Due and open\nreview-queue\ntasks-table\n```"
    );
    const present = sectionsPresent(text, ctx);
    const alone = applySections(
      text,
      ctx,
      present.filter((id) => id !== "tasks")
    )!;
    expect(alone).toContain(
      "```chronoanvil\nheader:🔁 Due and open\nreview-queue\n```"
    );
    expect(alone).not.toContain("\nrow\n");

    // AND THE SWEEP, over every template every preset generates: no shipped
    // file pairs the grid with the band, and none writes a `row` delimiter
    // immediately above the tracker markers. This bit before the change — the
    // Study topic index and the Exercise & Diet block index both composed
    // exactly that string — which is why it is worth keeping now that it does
    // not.
    for (const preset of JOURNAL_PRESETS) {
      const type = buildJournalType(preset.config);
      for (const file of journalTemplateFiles(type)) {
        expect(file.content, file.name).not.toContain(
          "row\n# chronoanvil:trackers:start"
        );
        expect(file.content, file.name).not.toContain("tab\nstats-band");
        // Where a preset composes the grid at all, it composes it inside the
        // banner's fence and therefore without a bar of its own.
        if (file.content.includes("# chronoanvil:trackers:start")) {
          // THE DIVIDER SITS BETWEEN THEM AS OF 5.29 — one `stack` line per
          // section, so that the grid can be taken back out of the fence it
          // was welded into. What this is asserting is unchanged: the two are
          // in ONE fence, with nothing but structure between them.
          expect(file.content, file.name).toContain(
            "journal-header\nstack\n# chronoanvil:trackers:start"
          );
          expect(file.content, file.name).not.toContain("header:📊 Trackers");
        }
      }
    }
  });

  it("takes the band off and puts it back byte for byte", () => {
    // THE RECONCILER'S HALF, and the reason `rowDelimiter` was hoisted out of
    // the flat-note one: an arrival spliced into the fence with no delimiter is
    // welded onto the page above it, so Stats re-added from the section editor
    // would have come back as a second widget in the grid's own tab rather than
    // as a page of its own. The band is its own card now and the splice is the
    // simpler one, but the round trip is the assertion either way.
    const { text, ctx } = topic();
    const present = sectionsPresent(text, ctx);
    expect(present).toContain("stats");
    const without = applySections(
      text,
      ctx,
      present.filter((id) => id !== "stats")
    )!;
    expect(without).not.toContain("stats-band");
    expect(without).not.toContain("header:🔢 Stats");
    // The banner is untouched by the band's leaving — the grid is inside it and
    // stays there.
    expect(without).toContain(
      "```chronoanvil\nstack\njournal-header\nstack\n# chronoanvil:trackers:start"
    );
    expect(applySections(without, ctx, present)).toBe(text);
  });
});
