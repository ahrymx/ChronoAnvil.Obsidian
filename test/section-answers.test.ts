// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// 3.15: a section can be asked where to look.
//
// The release's own risk is stated in §8 and it is one sentence — a dialog that
// rewrites directive lines is a dialog that can lose a hand edit — so most of
// this file is about lines that must NOT change. The four real `tasks-table`
// spellings, a label somebody retitled, a folder with a comma in it, a scope
// keyword: each is a line the catalogue would have spelled differently and each
// has to come back byte for byte unless the window said otherwise.

import { describe, expect, it } from "vitest";
import { readCode } from "./sources";
import {
  argSpanIn,
  readArg,
  spliceArg,
  splitDirective,
  splitPeriodFlag,
  SCOPE_ALL,
} from "../src/core/directive-grammar";
import { argCandidates } from "../src/ui/arg-suggest";
import {
  questionIsRequired,
  reconfigured,
  withAnswers,
} from "../src/core/section-model";
import type { SectionQuestion } from "../src/core/section-model";
import { sectionContext } from "../src/journals/journal-sections";
import { journalSectionModel } from "../src/journals/journal-plan";
import { STUDY_JOURNAL } from "../src/journals/journal";
import { diarySectionModel } from "../src/diary/diary-sections";
import { homeSectionModel } from "../src/diary/home-sections";

// The four spellings that actually ship, plus the two the grammar allows and
// nothing composes.
const SPELLINGS: [string, string][] = [
  ["tasks-table", ""],
  ["tasks-table:03 - Journals", "03 - Journals"],
  ["tasks-table:,period", ""],
  ["tasks-table:02 - Diary/Weekly,period", "02 - Diary/Weekly"],
  ["tasks-table: 03 - Journals ", "03 - Journals"],
  ["tasks-table:Reading, Writing", "Reading, Writing"],
];

describe("patch 0: one grammar, in one place", () => {
  it("splits the label off before anything else sees the argument", () => {
    // `buildFromSpec`'s rule, which every directive already lives under: the
    // first `|` ends the body. A parser that missed this would read "My tags"
    // as part of a folder path.
    const d = splitDirective("tag-index:03 - Journals|My tags");
    expect(d.keyword).toBe("tag-index");
    expect(d.argument).toBe("03 - Journals");
    expect(d.label).toBe("My tags");
  });

  it("reads `,period` as a trailing suffix and never as a comma split", () => {
    // The Subject Index template ships `tasks-table:{{folder}}`, and a subject
    // named "Reading, Writing" resolves to a folder path with a comma in it.
    // This is the bug that already has a paragraph explaining it in
    // directive-regions.ts, which is why there is now one parser rather than a
    // second one written beside it.
    expect(splitPeriodFlag("Reading, Writing")).toEqual({
      arg: "Reading, Writing",
      period: false,
    });
    expect(splitPeriodFlag("Reading, Writing,period")).toEqual({
      arg: "Reading, Writing",
      period: true,
    });
  });

  it("and directive-regions imports it rather than declaring its own", () => {
    const src = readCode("ui/widgets/directive-regions");
    expect(src).toContain('from "../../core/directive-grammar"');
    expect(src).not.toContain("const PERIOD_FLAG_RE =");
  });

  it("finds the answer's span in every spelling that ships", () => {
    for (const [line, expected] of SPELLINGS) {
      const span = argSpanIn([line], "tasks-table");
      expect(span, line).not.toBeNull();
      expect(readArg([line], span!), line).toBe(expected);
    }
  });

  it("and writing into a span leaves the rest of the line alone", () => {
    // Each of these is a line somebody could have typed. What comes back
    // differs from what went in by the folder and by nothing else.
    const cases: [string, string, string][] = [
      ["tasks-table", "03 - Journals", "tasks-table:03 - Journals"],
      ["tasks-table:old", "new", "tasks-table:new"],
      ["tasks-table:old", "", "tasks-table"],
      ["tasks-table:,period", "Weekly", "tasks-table:Weekly,period"],
      ["tasks-table:Weekly,period", "", "tasks-table:,period"],
      ["tag-index:old|My tags", "new", "tag-index:new|My tags"],
      ["tag-index|My tags", "new", "tag-index:new|My tags"],
      ["tag-index:old|My tags", "", "tag-index|My tags"],
      ["journal-search", SCOPE_ALL, "journal-search:all"],
    ];
    for (const [before, value, after] of cases) {
      const span = argSpanIn([before], splitDirective(before).keyword)!;
      expect(spliceArg([before], span, value).join(""), before).toBe(after);
    }
  });

  it("and a `,period` line never loses the colon that anchors its flag", () => {
    // `tasks-table,period` is a directive whose keyword is "tasks-table,period",
    // which renders as an unknown widget. This is the one case where clearing
    // the answer must NOT clear the separator, and it is why the span carries a
    // flag rather than a rule the caller reapplies.
    const span = argSpanIn(["tasks-table:X,period"], "tasks-table")!;
    expect(span.keepColon).toBe(true);
    expect(spliceArg(["tasks-table:X,period"], span, "")[0]).toBe(
      "tasks-table:,period"
    );
  });
});

describe("patch 1: the answer can be read back, label and all", () => {
  const bridge: SectionQuestion = {
    kind: "choice",
    key: "target",
    label: "a journal to pull from",
    directive: "bridge-notes",
    values: [{ value: "meal", label: "Meal" }],
    empty: "no kinds",
  };

  it("round-trips what the catalogue composes", () => {
    // §2.2's property, stated over lines rather than over a string, because
    // that is what every catalogue emits. `directive()` writes it; the span
    // reads it; the two cannot disagree, because there is only one parser.
    const composed = ["bridge-notes:meal|From the journals"];
    const span = argSpanIn(composed, "bridge-notes")!;
    expect(readArg(composed, span)).toBe("meal");
  });

  it("and puts a new answer back without disturbing the label", () => {
    const next = withAnswers(
      ["bridge-notes:meal|My journals"],
      [bridge],
      { target: "lesson" }
    );
    expect(next[0]).toBe("bridge-notes:lesson|My journals");
  });

  it("and leaves lines alone when the window changed nothing", () => {
    const lines = ["header:🔁 Review", "review-queue:all"];
    expect(withAnswers(lines, [bridge], undefined)).toEqual(lines);
    expect(withAnswers(lines, [], { target: "meal" })).toEqual(lines);
  });

  it("and skips a question whose directive is not in these lines", () => {
    const lines = ["tag-index:03 - Journals"];
    expect(withAnswers(lines, [bridge], { target: "meal" })).toEqual(lines);
  });
});

describe("patch 2: reconfigure is what a changed answer is called", () => {
  it("is a section already present that carries options", () => {
    expect(reconfigured(["tags", "charts"], ["tags", "charts"])).toEqual([]);
    expect(
      reconfigured(["tags", "charts"], [{ id: "tags", options: { folder: "X" } }])
    ).toEqual(["tags"]);
    // Being ADDED is not being reconfigured: there is no line yet, so the
    // catalogue composes one from the same answers.
    expect(
      reconfigured(["charts"], [{ id: "tags", options: { folder: "X" } }])
    ).toEqual([]);
    // Options present but empty is still an answer — "" means the host folder.
    expect(
      reconfigured(["tags"], [{ id: "tags", options: { folder: "" } }])
    ).toEqual(["tags"]);
  });

  it("and the footer counts it, because Save is disabled at zero", () => {
    // Without this the release does not work at all: a reader who changed an
    // answer and nothing else would be shown "No changes", disabled, over a
    // plan naming one.
    const src = readCode("section-editor");
    const at = src.indexOf("private changeCount()");
    expect(at).toBeGreaterThan(0);
    expect(src.slice(at, at + 400)).toContain('o.kind === "reconfigure"');
  });
});

describe("patch 3: the folder control", () => {
  it("offers keywords first, and only while they match", () => {
    const folders = ["03 - Journals", "03 - Journals/Maths", "02 - Diary"];
    const kw = [{ value: SCOPE_ALL, label: "Every journal" }];
    expect(argCandidates("", folders, kw)[0]).toEqual({
      value: "all",
      label: "Every journal",
      keyword: true,
    });
    // Typing a path drops the keyword rather than pinning it to the top.
    expect(argCandidates("diary", folders, kw).map((c) => c.value)).toEqual([
      "02 - Diary",
    ]);
    // And the keyword is findable by its NAME, not only by its spelling — a
    // reader looking for "every journal" has not learned the word `all`.
    expect(argCandidates("every", folders, kw).map((c) => c.value)).toEqual([
      "all",
    ]);
  });

  it("and narrows folders on the whole path, shallowest first", () => {
    const folders = ["03 - Journals/Maths", "03 - Journals", "02 - Diary"];
    expect(argCandidates("journ", folders).map((c) => c.value)).toEqual([
      "03 - Journals",
      "03 - Journals/Maths",
    ]);
  });

  it("and is Obsidian's control rather than one of ours", () => {
    const src = readCode("arg-suggest");
    expect(src).toContain("extends AbstractInputSuggest");
  });
});

describe("patch 4: seven entries, and the surfaces that cannot answer", () => {
  const study = () => STUDY_JOURNAL;

  it("asks on a journal NOTE, where there is a host folder", () => {
    const ctx = {
      ...sectionContext(study(), { noteKind: "index", depth: 0 }),
      hostFolder: "03 - Journals/Maths",
    };
    const asking = journalSectionModel(ctx)
      .sections()
      .filter((s) => s.questions?.length)
      .map((s) => s.id);
    expect(asking.length).toBeGreaterThan(0);
    for (const s of journalSectionModel(ctx).sections()) {
      for (const q of s.questions ?? []) {
        if (q.kind !== "folder") continue;
        expect(q.hostFolder).toBe("03 - Journals/Maths");
      }
    }
  });

  it("and asks nothing answerable on a TEMPLATE, which has no host folder", () => {
    // The failure this prevents: a journal template is composed once and used
    // in every folder of its level, so a path typed into one would be written
    // literally into every note made from it afterwards. `journal-sections.ts`
    // declined to interpolate `{{folder}}` for this reason years before there
    // was a dialog that could do it by hand.
    //
    // Not a surface test. The catalogue simply has nothing to resolve the
    // default against, and the editor draws no live control where the model
    // gave it none.
    const ctx = sectionContext(study(), { noteKind: "index", depth: 0 });
    for (const s of journalSectionModel(ctx).sections()) {
      for (const q of s.questions ?? []) {
        if (q.kind !== "folder") continue;
        expect(q.hostFolder ?? null).toBeNull();
      }
    }
  });

  it("and the editor's rule for drawing one is the model's silence", () => {
    const src = readCode("section-editor");
    // Two ways to answer no, both of them the model's.
    //
    // THE DIRECTIVE-LESS RULE GAINED A DOOR IN 5.6, AND IT IS STILL THE
    // MODEL'S. A `lines` question writes markdown rather than a directive
    // argument, so "has no directive" stopped being the same sentence as
    // "cannot be read back"; what makes it drawable is that the model handed
    // over an answer for it, which is `SectionView.answered` and nothing the
    // editor worked out for itself. A question no model answers still draws
    // nothing, which is the original rule intact.
    expect(src).toContain(
      "if (!q.directive) return section.answered?.[q.key] !== undefined;"
    );
    expect(src).toContain('q.kind === "folder" && q.hostFolder == null');
    // And no surface ever named in this window.
    for (const word of ["template", "journal", "dashboard", "diaryRoot"]) {
      expect(src.toLowerCase(), word).not.toContain(`"${word}`);
    }
  });

  it("and every folder question is optional, so no row becomes unaddable", () => {
    // §4's difference, carried by the model rather than assumed by the editor:
    // a folder question's empty state is a working directive — the host note's
    // own folder — so a reader who answers nothing still gets a section.
    const dash = diarySectionModel({ grain: "weekly", hostFolder: "02 - Diary/Weekly" });
    const home = homeSectionModel("02 - Diary", "");
    for (const model of [dash, home]) {
      for (const s of model.sections()) {
        for (const q of s.questions ?? []) {
          if (q.kind === "folder") expect(questionIsRequired(q)).toBe(false);
        }
      }
    }
  });
});

describe("§8: the risk, tested rather than intended", () => {
  it("copies an untouched section out byte for byte", () => {
    // The property `applySections` has had since it was written, and the one
    // patch 5 was most likely to cost. Every spelling here is one the catalogue
    // would NOT have chosen — a hand-typed folder, an extra space, a retitled
    // label, a comma in a path — and a Save that changes nothing else must
    // return them unchanged.
    const dash = diarySectionModel({ grain: "weekly", hostFolder: "02 - Diary/Weekly" });
    const text = [
      "```chronoanvil",
      "header:⏳ Open tasks",
      "tasks-table: Reading, Writing ,period",
      "```",
      "",
      "```chronoanvil",
      "header:🏷️ Tags",
      "tag-index:02 - Diary|My tags",
      "```",
      "",
    ].join("\n");
    const present = dash.present(text);
    expect(present.length).toBeGreaterThan(0);
    // No options anywhere: nothing was touched, so there is nothing to do.
    expect(dash.apply(text, present)).toBeNull();
  });

  it("and rewrites exactly one span when the window says one changed", () => {
    const dash = diarySectionModel({ grain: "weekly", hostFolder: "02 - Diary/Weekly" });
    const text = [
      "```chronoanvil",
      "header:🏷️ Tags",
      "tag-index:02 - Diary|My tags",
      "```",
      "",
      "```chronoanvil",
      "header:⏳ Open tasks",
      "tasks-table: Reading, Writing ,period",
      "```",
      "",
    ].join("\n");
    const present = dash.present(text);
    const next = dash.apply(
      text,
      present.map((id) =>
        id === "tags" ? { id, options: { folder: "03 - Journals" } } : id
      )
    );
    expect(next).not.toBeNull();
    // The answer moved…
    expect(next!).toContain("tag-index:03 - Journals|My tags");
    // …and the neighbouring line, which the catalogue would have spelled
    // differently, is untouched to the character.
    expect(next!).toContain("tasks-table: Reading, Writing ,period");
    // As is everything else: one line differs from the original, and it is that
    // one.
    const before = text.split("\n");
    const after = next!.split("\n");
    expect(after.length).toBe(before.length);
    const changed = before.filter((l, i) => l !== after[i]);
    expect(changed).toEqual(["tag-index:02 - Diary|My tags"]);
  });

  it("and the plan says reconfigure where Save would rewrite", () => {
    const dash = diarySectionModel({ grain: "weekly", hostFolder: "02 - Diary/Weekly" });
    const text = ["```chronoanvil", "header:🏷️ Tags", "tag-index:02 - Diary", "```", ""].join(
      "\n"
    );
    const present = dash.present(text);
    const ops = dash.plan(
      text,
      present.map((id) =>
        id === "tags" ? { id, options: { folder: "03 - Journals" } } : id
      )
    );
    const op = ops.find((o) => o.sectionId === "tags");
    expect(op?.kind).toBe("reconfigure");
    expect(op?.detail).toContain("03 - Journals");
  });
});
