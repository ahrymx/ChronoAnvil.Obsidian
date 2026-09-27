// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>

import { describe, expect, it } from "vitest";
import { cssRule, cssRules, readCss, readSrc } from "./sources";
import { DEFAULT_PATHS } from "../src/core/constants";
import { hostIsDiary } from "../src/ui/widgets/directive-regions";

describe("open tasks table redesign", () => {
  const src = readSrc("tables");
  const css = readCss("94-native-tables");

  it("congregates daily tasks into week buckets", () => {
    expect(src).toContain("weekBuckets");
    expect(src).toContain("isoWeek");
    expect(src).toContain("jtt-bucket");
  });

  it("congregates journal tasks into journal buckets with journal glyph & name", () => {
    expect(src).toContain("journalBuckets");
    expect(src).toContain("registeredJournalTypes(plugin)");
    expect(src).toContain("${jType.emoji} ${jType.name} Journal");
  });

  it("extracts inline tags and prints them in the eyebrow under the text", () => {
    expect(src).toContain("journal-task-tag");
    expect(src).toContain("#[a-zA-Z0-9_\\-/]+");
    expect(css).toContain(".ca-journal-tasks-table .ca-journal-task-tag");
  });

  it("provides collapsible bucket containers with toggleable chevrons", () => {
    expect(src).toContain("jtt-group-chevron");
    expect(src).toContain("is-collapsed");
    expect(css).toContain(".ca-journal-tasks-table .ca-jtt-bucket.is-collapsed");
  });

  it("scopes bare tasks-table on diary overview notes to the diary root", () => {
    const dirSrc = readSrc("directive-regions");
    expect(dirSrc).toContain("paths.diaryRoot");
    expect(dirSrc).toContain("defaultFolder = paths.diaryRoot");
  });

  // ── AND STILL DOES FROM `Dashboards/` (4.81) ─────────────────────────
  //
  // The four dashboards compose `tasks-table:,period` with an EMPTY folder,
  // which means "the host's own folder" for every other note in the vault. They
  // survived being moved out of their grain folders because the diary test is a
  // prefix on the root, not a list of the five — so the weekly dashboard still
  // gathers the tasks written in the week's entries rather than the nothing
  // that is in `Dashboards/`.
  it("keeps a moved dashboard inside the diary", () => {
    const paths = DEFAULT_PATHS;
    expect(hostIsDiary(paths, paths.diaryDashboards)).toBe(true);
    expect(hostIsDiary(paths, paths.diaryRoot)).toBe(true);
    // A period folder in the tree, and a legacy grain folder.
    expect(
      hostIsDiary(paths, `${paths.diaryRoot}/Entries/Year-2026/Quarter-2026-Q3`)
    ).toBe(true);
    expect(hostIsDiary(paths, paths.diaryWeekly)).toBe(true);
  });

  it("does not claim a folder that merely starts like the diary", () => {
    const paths = DEFAULT_PATHS;
    expect(hostIsDiary(paths, "02 - Diary Archive")).toBe(false);
    expect(hostIsDiary(paths, "03 - Journals/Study")).toBe(false);
    expect(hostIsDiary(paths, null)).toBe(false);
  });

  it("still knows a grain a reader points outside the diary", () => {
    const moved = { ...DEFAULT_PATHS, diaryWeekly: "Elsewhere/Weeks" };
    expect(hostIsDiary(moved, "Elsewhere/Weeks")).toBe(true);
    expect(hostIsDiary(moved, "Elsewhere")).toBe(false);
  });
});

// ── ONE LINE, AND THE FACTS UNDER IT (1.0.44) ────────────────────────────
//
// *"Open tasks section/widget, tasks are taking two lines where it should only
// be one. I think the tags (priority, date, time, etc.) should be moved below
// the checkbox and text, in a very small font."*
//
// TWO FAULTS IN ONE SCREENSHOT, and only one of them is the ask. The chips were
// a second COLUMN, pushed to the far end by `justify-content: space-between`
// over a wrapping row — so in a card the width of a homepage cell the two
// columns never fit and the wrap fired every time. Under it sat a regression:
// this file's `-main` override set four of the base rule's five properties, and
// 1.0.42 added the fifth (`flex-direction: column`, for the per-note row's
// text-and-eyebrow pair) where it was inherited rather than overridden. The box
// drew on one line and the text on the next, INSIDE the column, which is what
// the screenshot actually shows.
//
// THE ONE THAT WOULD BE SILENT IF IT BROKE is the override that is no longer
// there. A rule naming four of five properties reads as deliberate and behaves
// as an accident waiting on the fifth, and nothing in a render test would catch
// it coming back.

describe("a table task is one line with its facts under it", () => {
  const src = readSrc("tables");
  const rowSrc = (): string => {
    const at = src.indexOf("function buildTaskRow(");
    expect(at).toBeGreaterThan(0);
    return src.slice(at, src.indexOf("\nexport function buildTasksTable", at));
  };

  it("hangs the checkbox off the row, not off the column", () => {
    const body = rowSrc();
    expect(body).toContain('const box = rowEl.createEl("input"');
    expect(body).not.toContain('main.createEl("input"');
    // And the column is made after it, which is the order the per-note row
    // builds in — box, column, facts.
    expect(body.indexOf("const box")).toBeLessThan(body.indexOf("const main"));
  });

  it("has no chip cluster left to push to the right", () => {
    const body = rowSrc();
    for (const gone of [
      "ca-journal-task-meta",
      "ca-journal-task-chips",
      "ca-journal-task-prio",
      "ca-journal-task-at-wrap",
      "ca-jtt-due-icon",
      "ca-jtt-at-icon",
    ]) {
      expect(body, gone).not.toContain(gone);
    }
    // THE HALF THAT IS NOT IN THE MARKUP. `space-between` over a wrapping row is
    // what made two columns into two lines; both are gone with the second column.
    const row = cssRule(".ca-journal-tasks-table .ca-jtt-row");
    expect(row).not.toContain("flex-wrap");
    expect(row).not.toContain("space-between");
    expect(row).toContain("align-items: flex-start");
  });

  it("draws as a list row rather than as a card", () => {
    // `.ca-journal-task-row` is a CARD — a full border, a medium radius and
    // `--ca-elev-1` — because on a dashboard it is one. This row carries that
    // class for its tints and its box, and inherited the card with them: every
    // task in a dense list drew rounded, shadowed and outlined, in red where the
    // task was high priority, inside a list of flat group heads.
    //
    // Turned off HERE rather than weakened there, because the per-note widget is
    // a list of cards and should stay one.
    const row = cssRule(".ca-journal-tasks-table .ca-jtt-row");
    expect(row).toContain("border: none");
    expect(row).toContain("border-radius: 0");
    expect(row).toContain("box-shadow: none");
    expect(row).toContain("border-bottom: 1px solid");
    // The spine survives, because that is the tint and not the box.
    expect(row).toContain("border-left: var(--ca-rule-edge) solid transparent");
    expect(
      cssRule(".ca-journal-tasks-table .ca-jtt-row.ca-journal-task-high")
    ).toContain("border-left-color: var(--color-red, #e05561)");
  });

  it("gives every row the same `…` the per-note row has", () => {
    // *"Might as well add the hamburger menu from tasks to open-tasks for each
    // entry."* Built by the shared `taskEditButton`, so the two lists cannot end
    // up with two glyphs or two labels.
    expect(src).toContain("taskEditButton(strip, () => {");
    expect(src).toContain("openTaskEditor(");
    expect(src).not.toContain('cls: "ca-journal-task-edit"');
  });

  it("writes back to the row's own note, through the one resolver", () => {
    // THE HARD PART IS NOT THE EDIT, it is knowing which task in that note this
    // row is — a table gathers from everywhere and another pane may have edited
    // the note since the row was drawn. `resolveToggleTarget` answers it by
    // serialized line with the index only as a fallback, and all three acts go
    // through the one writer so there is one answer.
    expect(src).toContain("async function writeTaskRow(");
    expect(src).toContain("const target = resolveToggleTarget(tasks, line, indexHint);");
    expect((src.match(/resolveToggleTarget\(tasks, line, indexHint\)/g) ?? []).length).toBe(1);
    for (const act of ["tasks[at].done = true;", "tasks[at] = next;", "tasks.splice(at, 1);"]) {
      expect(src, act).toContain(act);
    }
    // It names the ROW's file, not the note the table is drawn in.
    expect(src).toContain("writeTaskRow(app, row.file, row.key, row.line, row.index");
  });

  it("overrides the shared column nowhere, which is the regression's fix", () => {
    // THE DEFECT, STATED AS A RULE. The base sets five properties on
    // `-main`; this file used to set four of them and inherit the fifth. Both
    // lists want the same column, so the base rule is the only one — and the
    // only way to keep that true is to have no rule here to drift.
    expect(
      cssRules(".ca-journal-tasks-table .ca-jtt-row .ca-journal-task-main")
    ).toEqual([]);
    const base = cssRule(".ca-journal-task-main");
    expect(base).toContain("flex-direction: column");
    expect(base).toContain("min-width: 0");
  });

  it("builds the strip through the one builder both lists use", () => {
    // Two builders emitting `ca-journal-task-eyebrow`, `-fact` and `-fact-sep`
    // by hand is how one of them gains a separator the other does not.
    expect(src).toContain("taskEyebrow(main, facts)");
    const widget = readSrc("ui/widgets/note-regions.ts");
    expect(widget).toContain("export function taskEyebrow(");
    expect(widget).toContain("taskEyebrow(main, tags.map((text) => ({ text })))");
    // ONE PLACE EACH CLASS IS SPELLED. The separator is the tell: it exists only
    // between facts, so a second builder that forgot it would look right on every
    // row with one fact and wrong on every row with two.
    expect(src).not.toContain("ca-journal-task-fact-sep");
    expect(src).not.toContain('cls: "ca-journal-task-eyebrow"');
  });

  it("keeps the priority fact first, because the tint reads position", () => {
    // `.ca-journal-task-high .ca-journal-task-eyebrow .ca-journal-task-fact
    // :first-child` is a base rule, and the row carries the priority class. A
    // reordering that put a #hashtag first would paint the hashtag red.
    const body = rowSrc();
    const prio = body.indexOf('row.task.priority === "high" ? "High" : "Low"');
    const due = body.indexOf("dueLabel(row.task.due, todayIso)");
    const tag = body.indexOf("for (const tag of tags)");
    expect(prio).toBeGreaterThan(0);
    expect(prio).toBeLessThan(due);
    expect(due).toBeLessThan(tag);
    expect(cssRule(".ca-journal-task-high .ca-journal-task-eyebrow .ca-journal-task-fact:first-child"))
      .toContain("color");
  });

  it("says a relative day where the per-note row says an absolute one", () => {
    // NOT a shared list of facts, and deliberately: this table gathers tasks
    // from everywhere, so *tomorrow* is the useful word and *27 Sep* is not.
    // `taskTags` is the other list and this file does not call it.
    expect(src).not.toContain("taskTags(");
    expect(rowSrc()).toContain("dueLabel(row.task.due, todayIso)");
    expect(readSrc("ui/widgets/note-regions.ts")).toContain("taskTags(task,");
  });

  it("prints an overdue day in red without dressing it as a pill", () => {
    expect(rowSrc()).toContain('cls: overdue ? "ca-jtt-due-overdue" : undefined');
    const rule = cssRule(".ca-journal-tasks-table .ca-jtt-due-overdue");
    expect(rule).toContain("color");
    expect(rule).not.toContain("background");
    expect(rule).not.toContain("border-radius");
  });

  it("leaves a reader's own tag in the case they typed it", () => {
    // The eyebrow uppercases. That is right for the three words this plugin
    // chose and wrong for `#Reading`, which is the same fault as a widget
    // renaming a field the reader titled.
    const rule = cssRule(".ca-journal-tasks-table .ca-journal-task-tag");
    expect(rule).toContain("text-transform: none");
    expect(cssRule(".ca-journal-task-eyebrow")).toContain("text-transform: uppercase");
  });
});
