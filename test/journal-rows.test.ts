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
  journalTemplateFiles,
} from "../src/journals/custom-journal";
import {
  findSection,
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

// The Study subject index — the container page the shipped row is on.
const subject = () => {
  const target = templateTargets(STUDY_JOURNAL).find((t) =>
    t.file.includes("subject")
  );
  if (!target) throw new Error("no subject template");
  const file = journalTemplateFiles(STUDY_JOURNAL).find(
    (f) => f.name === target.file
  );
  if (!file) throw new Error("no subject file");
  return { text: file.content, ctx: target.ctx, model: journalSectionModel(target.ctx) };
};

const shape = (model: ReturnType<typeof journalSectionModel>, text: string) =>
  model.blocks!(text).map((b) => b.ids.join("+"));

describe("a journal note's blocks (5.11)", () => {
  it("reports the shipped row as one block with two columns", () => {
    const { text, model } = subject();
    expect(model.blocks).toBeTypeOf("function");
    expect(model.regroup).toBeTypeOf("function");
    const row = model.blocks!(text).find((b) => b.ids.length > 1);
    expect(row?.ids).toEqual(["review", "tasks"]);
    // Both cells, not just the one that opens the fence — the pill the editor
    // draws is "Column" for each of them and "Section" for none.
    expect([...(row?.column ?? [])].sort()).toEqual(["review", "tasks"]);
  });

  it("does not call the page banner a column", () => {
    // THE LATENT DEFECT THIS RELEASE FOUND. Every head refusal in `cell-move.ts`
    // and the column test in `flatBlocks` keyed on `title` alone, which is the
    // flat catalogues' banner keyword. A journal note's is `journal-header` and
    // a diary entry's is `entry-header`, so both were invisible to a rule
    // written to protect them: the banner was a groupable one-line widget, and
    // a cell could be moved into it.
    const { text, model } = subject();
    const banner = model.blocks!(text).find((b) => b.ids.includes("banner"));
    expect(banner?.ids).toEqual(["banner"]);
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
    // The tracker grid too, and it is the case the rule was restated for: its
    // "+ Add tracker" is a tile inside the grid, not a control in the bar, so
    // nothing is stranded when the bar comes off.
    expect(offered("trackers")).toBe("header:📊 Trackers");
    // NOT offered, and each for the one reason: something in the fence is
    // anchored INTO the bar and has nowhere to go without it. `children` opens
    // with a `button:` ("New Topic"), `charts` with `jchart:` ("+ Add chart"),
    // and `banner` composes no bar to drop in the first place.
    for (const id of ["banner", "children", "charts"]) {
      expect(offered(id), id).toBeUndefined();
    }
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
    // reader's answer. `trackers` is the case: no `folder` question to hide it.
    const { text, model } = subject();
    const answered = (t: string, id: string) =>
      model.sections(t).find((v) => v.id === id)?.answered?.form;
    expect(answered(text, "trackers")).toBe("section");
    const widget = model.apply(
      text,
      model.present(text).map((id) =>
        id === "trackers" ? { id, options: { form: "widget" } } : id
      )
    ) as string;
    expect(widget).toContain("```chronoanvil\n# chronoanvil:trackers:start");
    expect(answered(widget, "trackers")).toBe("widget");
    // And the row still offers the question, which is the other half of the
    // same gate.
    const view = model.sections(widget).find((v) => v.id === "trackers");
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

  it("still repairs a barless section that has no widget form", () => {
    // THE OTHER SIDE OF THE SAME RULE, and the reason the guard is drawn around
    // the toggle rather than around "barless". On THIS page Open tasks is the
    // second cell of the shipped row, so it composes no bar of its own — the
    // row's belongs to Review, which opens it — and the toggle is not offered
    // to it here (it is on every other Study note, where the section stands
    // alone). Cut out of the row it is a fence with nothing over it and no
    // answer behind that, which is an omission: `soloBarOf` has the title a
    // cell takes when it stops being one, and the repair still writes it.
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
    expect(ops.find((o) => o.sectionId === "tasks")?.kind).toBe("extend");
    const fixed = model.apply(apart as string, model.present(apart as string));
    expect(fixed).toContain("header:⏳ Open tasks");
  });
});

describe("grouping a journal note (5.11)", () => {
  it("refuses to make a cell of a section that still titles itself", () => {
    // Not a defect — the refusal IS the reason the toggle exists. A fence that
    // carries a `header:` line is a section, and a section is not a column.
    const { text, model } = subject();
    const want = [
      ["banner"], ["trackers"], ["children"],
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
        ["banner"], ["trackers"], ["children"],
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
      "banner", "children", "trackers", "review+tasks", "find+progress", "charts",
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
        ["banner"], ["trackers"], ["children"],
        ["find", "progress"],
        ["review", "tasks"], ["charts"],
      ],
      []
    ) as string;
    const apart = model.regroup!(
      grouped,
      [
        ["banner"], ["trackers"], ["children"],
        ["find"], ["progress"],
        ["review", "tasks"], ["charts"],
      ],
      []
    );
    expect(apart).not.toBeNull();
    expect(shape(model, apart as string)).toEqual([
      "banner", "children", "trackers", "review+tasks", "find", "progress", "charts",
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
describe("the tracker grid and the stats band (5.18)", () => {
  const topic = () => {
    const target = templateTargets(STUDY_JOURNAL).find((t) =>
      t.file.includes("topic")
    );
    if (!target) throw new Error("no topic template");
    const file = journalTemplateFiles(STUDY_JOURNAL).find(
      (f) => f.name === target.file
    );
    if (!file) throw new Error("no topic file");
    return {
      text: file.content,
      ctx: target.ctx,
      model: journalSectionModel(target.ctx),
    };
  };

  it("composes them as one group of two pages, untitled", () => {
    const { text, model } = topic();
    expect(text).toContain(
      [
        "```chronoanvil",
        "row",
        "# chronoanvil:trackers:start",
        "tracker:status",
        "# chronoanvil:trackers:end",
        "tab",
        "stats-band",
        "```",
      ].join("\n")
    );
    // NO BAR ANYWHERE IN IT. A row carries one title composed by the cell that
    // opens it, and this row deliberately has none — 5.16 derives the group's
    // head from the cells, so the box is headed by the widgets themselves.
    expect(text).not.toContain("header:📊 Trackers\nrow");
    expect(text).not.toContain("row\nheader:");
    // And the editor reads the fence back as one block of two columns.
    const row = model.blocks!(text).find((b) => b.ids.includes("stats"));
    expect(row?.ids).toEqual(["trackers", "stats"]);
    expect([...(row?.column ?? [])].sort()).toEqual(["stats", "trackers"]);
  });

  it("gives the grid its own title back where there is no band", () => {
    // A container index composes no band (`stats` is the deepest index's
    // question), so the row comes down to one member and `soloBar` puts the
    // grid's own name back. Exercise & Diet is the leaf-index case of the same
    // thing: it ships without the band at all.
    const subjectText = subject().text;
    expect(subjectText).toContain(
      [
        "```chronoanvil",
        "header:📊 Trackers",
        "# chronoanvil:trackers:start",
        "tracker:status",
        "# chronoanvil:trackers:end",
        "```",
      ].join("\n")
    );
    expect(subjectText).not.toContain("row\n# chronoanvil:trackers:start");

    const exercise = buildJournalType(
      JOURNAL_PRESETS.find((p) => p.id === "exercise-diet")!.config
    );
    const block = journalTemplateFiles(exercise).find((f) =>
      f.name.includes("block")
    );
    expect(block?.content).toContain("header:📊 Trackers");
    expect(block?.content).not.toContain("stats-band");
    expect(block?.content).not.toContain("\nrow\n");
  });

  it("takes the band off and puts it back byte for byte", () => {
    // THE RECONCILER'S HALF, and the reason `rowDelimiter` was hoisted out of
    // the flat-note one: an arrival spliced into the fence with no delimiter is
    // welded onto the page above it, so Stats re-added from the section editor
    // would have come back as a second widget in the grid's own tab rather than
    // as a page of its own.
    const { text, ctx } = topic();
    const present = sectionsPresent(text, ctx);
    expect(present).toContain("stats");
    const without = applySections(
      text,
      ctx,
      present.filter((id) => id !== "stats")
    )!;
    // The grid is alone in the fence, so the row is undone and the title it was
    // not composing comes back.
    expect(without).toContain(
      "```chronoanvil\nheader:📊 Trackers\n# chronoanvil:trackers:start"
    );
    expect(without).not.toContain("\ntab\n");
    expect(applySections(without, ctx, present)).toBe(text);
  });
});
