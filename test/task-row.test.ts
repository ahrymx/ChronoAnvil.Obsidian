// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// A task is one line, an eyebrow and a `…`. 1.0.42.
//
// *"now improve the tasks section/widget. I think we can enforce compact mode
// and remove the larger format; shrink the date picker to just a calendar icon,
// add a priority button, a cross button to remove a task, and a clock icon for
// time. add a small font eyebrow for the chosen properties"* — and then, before
// any of it was written: *"actually, make it one button (…) to open a edit task
// window which is similar to the event window editor."*
//
// THE SECOND MESSAGE IS THE STRONGER FORM OF THE FIRST. Four icon buttons on
// every row is the roomy row again with smaller controls: the same second line,
// the same width spent on affordances nobody has used yet, and a calendar glyph
// that has to open something anyway. One button opening one window costs the row
// 22 pixels and gives the four controls as much space as they each want.
//
// WHAT THIS FILE REPLACES. `test/tasks-density.test.ts` pinned the `#compact`
// flag through its whole life — the grammar, the question on two catalogues, the
// round trip on a leaf and on an entry, and the renderer's read. The flag is
// gone (see the first describe below for why that is a consequence and not a
// choice) and its grammar coverage is the one part worth keeping, retargeted at
// the flag that remains.

import { describe, expect, it } from "vitest";
import {
  hasToken,
  splitArgHead,
  WIDGET_TOKEN,
  withToken,
} from "../src/core/directive-grammar";
import { newTask, taskTags } from "../src/ui/tasks";
import type { ChronoAnvilTask } from "../src/ui/tasks";
import { composeEntryTemplate } from "../src/diary/entry-sections";
import { goldenNotes } from "./golden-notes";
import { rowForm } from "../src/ui/section-editor";
import { cssRule, readCode, readCss, readSrc } from "./sources";

// ── the flag that went, and the one that stayed ───────────────────────

describe("the density flag is gone, and that is arithmetic", () => {
  it("has no token, no question and no rules left", () => {
    // NOT A SCOPE CALL. `#compact` chose between two row shapes; the reader
    // deleted one of them, so the flag chooses between one shape and the same
    // shape. Keeping it would have been a box in the section editor that writes
    // a token the renderer reads and does nothing with.
    const model = readCode("core/note-sections");
    expect(model).not.toContain("TASKS_COMPACT");
    expect(model).not.toContain("tasksDensityQuestion");
    // And nobody asks it. Both catalogues that compose a task list declared the
    // question by importing that one function, so its absence from them is the
    // whole unwiring.
    for (const file of ["diary/entry-sections", "journals/journal-sections"]) {
      expect(readCode(file), file).not.toContain("tasksDensityQuestion");
    }
    // The renderer, and the stylesheet that drew what the flag chose.
    expect(readCode("ui/widgets/note-regions")).not.toContain("is-compact");
    expect(readCss()).not.toContain(".ca-journal-tasks.is-compact");
  });

  it("is not asked of any note this plugin composes", () => {
    // ASKED OF THE FILES, not of the catalogue — the same sweep the flag was
    // introduced under, now proving the other direction. A `tasks:` line with a
    // flag question still attached to it is the state this asserts is gone.
    let seen = 0;
    for (const note of goldenNotes()) {
      if (!note.text.split("\n").some((l) => /^tasks:/.test(l))) continue;
      seen++;
      const asking = note
        .model()
        .sections(note.text)
        // A flag whose answer is a `#token` ON THE SECTION'S OWN LINE, which is
        // the mechanism the density question used and the banner's `actions`
        // does not — that one is a modifier LINE in the fence, and it is the
        // reason this filter asks for the token rather than for the kind.
        .filter((s) =>
          (s.questions ?? []).some((q) => q.kind === "flag" && q.token)
        );
      expect(asking.map((s) => s.id), note.name).toEqual([]);
    }
    expect(seen).toBe(5);
  });

  it("is left on a line that already carries it, and read past", () => {
    // THE `#collapse` PRECEDENT, AND THE REASON THERE IS NO MIGRATION. A reader
    // who ticked Compact during the one release that offered it has `#compact`
    // on their `tasks:` line. Rewriting their note to take a word out of it is a
    // write nobody asked for, over a preference that is now the only option — so
    // the grammar goes on parsing it off the region key and nothing acts on it.
    expect(splitArgHead("todo#compact").key).toBe("todo");
    expect(splitArgHead("todo#compact").tokens).toEqual(["compact"]);
    // Which is the defect an UNparsed flag would be, and it is a silent one:
    // `todo#compact` is a plausible-looking key for a region nothing has ever
    // written, so the field renders empty and says nothing about why.
    for (const file of [
      "ui/widgets/note-regions",
      "ui/widgets/attachment-widgets",
      "ui/widgets/recall-widgets",
      "ui/widgets/note-field",
    ]) {
      expect(readCode(file), file).not.toContain('rest.split(":")[0]');
    }
  });
});

describe("the `#token` grammar, with one flag left to carry", () => {
  // These four cases were written for `#compact` and are the reason the flag
  // could be added to a directive at all. `#widget` — the form answer, written
  // on a field's own line because a diary entry's seven fields share one fence —
  // is now the only flag the section editor writes, so it inherits them.
  it("reads and writes without touching anything else on the line", () => {
    expect(withToken("tasks:todo|Tasks", WIDGET_TOKEN, true)).toBe(
      "tasks:todo#widget|Tasks"
    );
    expect(withToken("tasks:todo#widget|Tasks", WIDGET_TOKEN, false)).toBe(
      "tasks:todo|Tasks"
    );
    expect(hasToken("tasks:todo#widget|Tasks", WIDGET_TOKEN)).toBe(true);
    expect(hasToken("tasks:todo|Tasks", WIDGET_TOKEN)).toBe(false);
    // A placeholder is the reader's own text and may hold anything at all.
    expect(
      withToken(
        "note:capture#collapse:Captured thoughts land here…|Captured",
        WIDGET_TOKEN,
        true
      )
    ).toBe("note:capture#collapse#widget:Captured thoughts land here…|Captured");
  });

  it("leaves the line alone when it already says what was asked", () => {
    // THE PROPERTY EVERY CALLER DEPENDS ON. A Save that changes nothing must
    // write no bytes, or opening the editor and pressing the button rewrites
    // every note in the vault — and `applySections` returning null for "nothing
    // to do" is computed by comparing the text it built against the text it was
    // given.
    for (const line of ["tasks:todo|Tasks", "tasks:todo#widget|Tasks"]) {
      expect(withToken(line, WIDGET_TOKEN, hasToken(line, WIDGET_TOKEN))).toBe(
        line
      );
    }
  });

  it("carries a flag it does not know, in the order it was written", () => {
    // Nothing here judges a token: `#collapse` is composed into five template
    // assets, `#compact` is on the notes of anyone who ticked it, and a flag a
    // later release adds must survive this one's writes.
    const line = "note:capture#collapse:Captured…|Captured";
    const on = withToken(line, WIDGET_TOKEN, true);
    expect(splitArgHead("capture#collapse#widget:Captured…").tokens).toEqual([
      "collapse",
      "widget",
    ]);
    expect(withToken(on, WIDGET_TOKEN, false)).toBe(line);
  });

  it("refuses a line with nothing to hang a flag on", () => {
    // `tasks` alone is not a directive this plugin composes — every field names
    // the region it owns — and inventing `tasks:#widget` for one would be
    // writing an empty region key into a reader's note to record a preference.
    expect(withToken("tasks", WIDGET_TOKEN, true)).toBe("tasks");
    expect(withToken("tasks:", WIDGET_TOKEN, true)).toBe("tasks:");
    expect(withToken("tasks:|Tasks", WIDGET_TOKEN, true)).toBe("tasks:|Tasks");
  });

  it("is parsed by ONE reader, which is the reason it is in the grammar", () => {
    // The editor writes this and the renderer reads it, and they are on opposite
    // sides of the tree. `buildNote` had the parse first — `#collapse`, `#line` —
    // written inline; a second copy in `buildTasks` is two answers to "what does
    // a `#` mean here" that agree until one of them is edited.
    for (const file of ["ui/widgets/note-regions", "ui/widgets/note-field"]) {
      const code = readCode(file);
      expect(code, file).toContain("splitArgHead(");
      expect(code, file).not.toContain('indexOf("#")');
    }
    // `noteKeyOf` IS `splitArgHead(rest).key` under the name the store gave it
    // — *"the binding between a widget and its text"* — so the four that only
    // need the key ask it, and the two that also need a token ask the grammar.
    expect(readCode("core/notestore")).toContain('const hash = head.indexOf("#");');
  });
});

// ── the row ───────────────────────────────────────────────────────────

describe("one line, and the height of one line", () => {
  it("draws the box, the words and nothing between them", () => {
    const code = readCode("ui/widgets/note-regions");
    // The three elements a row is. `-main` is a COLUMN holding the text and the
    // eyebrow, which is why the box and the button centre against the pair
    // rather than against the words alone.
    for (const cls of [
      "ca-journal-task-check",
      "ca-journal-task-main",
      "ca-journal-task-text",
    ]) {
      expect(code, cls).toContain(cls);
    }
    expect(cssRule(".ca-journal-task-row")).toContain("align-items: center");
    expect(cssRule(".ca-journal-task-row")).not.toContain(
      "flex-direction: column"
    );
    expect(cssRule(".ca-journal-task-main")).toContain("flex-direction: column");
    // A row whose words can outgrow their track must let them, and a flex child
    // will not shrink below its content without this.
    expect(cssRule(".ca-journal-task-main")).toContain("min-width: 0");
  });

  it("has no second line to draw, in the code or in the stylesheet", () => {
    const code = readCode("ui/widgets/note-regions");
    const css = readCss();
    for (const dead of [
      "ca-journal-task-meta",
      "ca-journal-task-chips",
      "ca-journal-task-prio",
      "ca-journal-task-due",
      "ca-journal-task-at",
      "ca-journal-task-del",
    ]) {
      expect(code, dead).not.toContain(dead);
    }
    // THE STYLESHEET IS ASKED A NARROWER QUESTION, because three of those names
    // are still drawn — by the Open-tasks TABLE (`buildTaskRow` in
    // `src/ui/tables.ts`), which has a priority chip and an hour pill of its own
    // and shared the widget's rules for them. What must be gone is an UNSCOPED
    // rule: one sitting in the dashboard file for a consumer in another file is
    // how a rule outlives the element it was written for.
    for (const moved of [
      "ca-journal-task-prio-icon",
      "ca-journal-task-at-wrap",
      "ca-journal-task-meta",
      "ca-journal-task-chips",
    ]) {
      const rules = (css.match(new RegExp(`^[^\\n{}]*\\.${moved}\\b[^\\n{}]*\\{`, "gm")) ?? []);
      expect(rules.length, moved).toBeGreaterThan(0);
      for (const r of rules) {
        expect(r, moved).toContain(".ca-journal-tasks-table");
      }
    }
    // And the row's own deleted controls leave no rule at all, under any scope.
    for (const gone of ["ca-journal-task-del", "ca-journal-tasks.is-compact"]) {
      expect(css, gone).not.toContain(`.${gone}`);
    }
    // And the callbacks those controls were wired through. `renderTaskRow` takes
    // three now, which is the interface saying the same thing — asked of ITS
    // declaration rather than of the file, because `renderPathRow` two hundred
    // lines up is a different widget that legitimately has an `onDelete`.
    const at = code.indexOf("export function renderTaskRow(");
    const decl = code.slice(at, code.indexOf("): void {", at));
    for (const gone of ["onPriority", "onDue", "onAt", "onDelete"]) {
      expect(decl, gone).not.toContain(gone);
    }
    expect(decl).toContain("onToggle: () => void;");
    expect(decl).toContain("onEdit: () => void;");
    expect(code).toContain("onEdit: () => {");
  });

  it("keeps the tints, which were never the pill", () => {
    // THE ONE THING THE DELETED CHIP DID THAT THE EYEBROW DOES NOT. A high task
    // reads as urgent from across the page, before any word on it is read — so
    // the row's own wash and spine stay, on the class the renderer still writes.
    expect(readCode("ui/widgets/note-regions")).toContain(
      "ca-journal-task-${task.priority}"
    );
    for (const p of ["high", "low", "normal"]) {
      expect(
        cssRule(`.ca-journal-task-row.ca-journal-task-${p}`),
        p
      ).toContain("border-left-color");
    }
  });
});

describe("the add row, and the line under it", () => {
  const code = readCode("ui/widgets/note-regions");
  const at = code.indexOf('cls: "ca-journal-tasks-add"');
  const build = code.slice(at, code.indexOf("const persist", at));

  it("puts the count beside the box it counts for", () => {
    // *"push the count onto the same line as the input field."*
    //
    // AND THAT ENDS A CLASS OF BUG RATHER THAN MOVING A PILL. The readout was
    // built in `chrome.actions()` — the field HEAD's slot — which took two fixes
    // in this release alone: a strip drawn over an empty card for a count of
    // `0/0`, and *"0/1 Done from tasks widget in a group behaves oddly?"*, where
    // a titled group's bar is not the field's bar and the count landed above both
    // columns. A head can belong to something larger than the field, so what the
    // FIELD says about itself has to be inside the field.
    expect(build).toContain(
      'progressEl ??= addRow.createDiv({ cls: "ca-journal-tasks-progress" })'
    );
    expect(code).not.toContain("chrome\n      .actions()");
    expect(code).not.toContain("chrome.actions()");
    // It is still built only when there is something to read — a lone "0/0 done"
    // beside an empty box is a readout of nothing — and removed rather than
    // hidden, so nothing in the row is a hidden child.
    expect(code).toContain("progressEl?.remove()");
    expect(code).not.toContain('progressEl.style.display = "none"');
  });

  it("does not draw the actions slot at all any more", () => {
    // The consequence worth pinning: with nothing in `buildTasks` asking for it,
    // the slot stays `:empty` and the stylesheet goes on hiding it, which is what
    // keeps a fresh Tasks card down to a title and a box to type in. The slot
    // itself is not dead — `note-field.ts` lends it to a bar that names the
    // field, and `recall-widgets.ts` still fills it (`test/recall.test.ts`).
    expect(cssRule(".ca-journal-field-tools:empty")).toContain("display: none");
  });

  it("closes the row with a rule rather than with whitespace", () => {
    // *"place a divider below the input row."* — a box to type in and a count of
    // what is below it are one thing, and the rule says where that stops and the
    // list starts.
    const rule = cssRule(".ca-journal-tasks-add");
    expect(rule).toContain("border-bottom");
    // `margin-bottom` ALONE WOULD PUT THE RULE TIGHT UNDER THE INPUT, since a
    // margin is outside the border — so the space is split either side, EQUALLY,
    // and the two halves are asserted together because a line that is 8px from
    // one neighbour and 4px from the other belongs to the nearer one.
    expect(rule).toContain("padding: 0 0 var(--ca-space-4)");
    expect(rule).toContain("margin-bottom: var(--ca-space-4)");
    // AND IT IS TWICE THE LIST'S OWN GAP, which is what keeps the divider from
    // reading as one more boundary between two task rows.
    expect(cssRule(".ca-journal-tasks-list")).toContain("gap: var(--ca-space-2)");
    // And the count cannot be squeezed by the input it shares the row with.
    expect(cssRule(".ca-journal-tasks-progress")).toContain("flex: 0 0 auto");
  });

  it("has no plus glyph, and no rule for one", () => {
    // *"Remove the ➕ icon."* It was `setIcon` on a SPAN, so it was never
    // pressable: the placeholder says "Add a task…" and Enter or a blur is the
    // act. A glyph that looks like a button and is not is worse than none.
    expect(code).not.toContain("ca-journal-tasks-add-icon");
    // ASKED OF `buildTasks`, not of the file: `buildPath`'s add row two hundred
    // lines up still has its own `circle-plus`, and the reader asked about the
    // task list. Removing it there too would be answering a question nobody put.
    expect(build).not.toContain("circle-plus");
    expect(readCss()).not.toContain("ca-journal-tasks-add-icon");
    expect(build).toContain('addInput.placeholder = "Add a task…"');
  });
});

describe("the eyebrow says what was chosen", () => {
  const task = (over: Partial<ChronoAnvilTask> = {}): ChronoAnvilTask => ({
    ...newTask("Write it down"),
    ...over,
  });
  // The day formatter is the caller's, so this pure function can be asked what
  // it does without a clock — and the renderer's own formatter is the only thing
  // in the row that needs `moment`.
  const day = (iso: string): string => `«${iso}»`;

  it("says nothing about a plain task", () => {
    // *"the chosen properties"* — a task with no priority, no day and no hour
    // has chosen nothing, and an eyebrow reading "NORMAL" on every row in a list
    // is a word that carries no information.
    expect(taskTags(task(), day)).toEqual([]);
    expect(taskTags(task({ priority: "normal" }), day)).toEqual([]);
  });

  it("names a priority that is not the default", () => {
    expect(taskTags(task({ priority: "high" }), day)).toEqual(["High"]);
    expect(taskTags(task({ priority: "low" }), day)).toEqual(["Low"]);
  });

  it("puts the day before the hour, and the priority before both", () => {
    // The order the row reads left to right, and it is the order of how much a
    // reader scanning a list is looking for each part.
    expect(
      taskTags(task({ priority: "high", due: "2026-10-01", at: "09:30" }), day)
    ).toEqual(["High", "«2026-10-01»", "09:30"]);
    expect(taskTags(task({ due: "2026-10-01" }), day)).toEqual(["«2026-10-01»"]);
  });

  it("drops an hour with no day to hang it on", () => {
    // `parseTaskLine` refuses that pair on the next read, so an eyebrow that
    // printed it would be showing a time the file is about to forget. The modal
    // clears `at` when the day goes; this is the other end of the same rule, for
    // a line somebody hand-wrote.
    expect(taskTags(task({ at: "09:30" }), day)).toEqual([]);
  });

  it("is drawn as text and not as controls", () => {
    // NOTHING HERE IS CLICKABLE, which is the whole distinction from the chips it
    // replaces: the row states what is true about itself and the `…` is where it
    // is changed. A border would make it look like the pill it is not.
    const code = readCode("ui/widgets/note-regions");
    expect(code).toContain("ca-journal-task-eyebrow");
    expect(code).toContain("ca-journal-task-fact-sep");
    // NOT `-tag`, WHICH IS TAKEN: `.ca-journal-task-tag` is the Open-tasks
    // table's `#hashtag` chip, pulled out of the task's own text. Two meanings
    // for one class survive only as long as both rules stay scoped.
    expect(code).not.toContain('cls: "ca-journal-task-tag"');
    const rule = cssRule(".ca-journal-task-eyebrow");
    expect(rule).toContain("var(--ca-text-2xs)");
    expect(rule).not.toContain("border");
    // The plugin's small-label voice, which is what makes type that size legible.
    expect(rule).toContain("text-transform: uppercase");
    expect(rule).toContain("letter-spacing");
  });
});

describe("the one button", () => {
  it("is the only control on the row besides the box", () => {
    const code = readCode("ui/widgets/note-regions");
    const at = code.indexOf("export function renderTaskRow(");
    expect(at).toBeGreaterThan(-1);
    const body = code.slice(at, code.indexOf("\n}", at));
    expect(body.match(/createEl\("button"/g) ?? []).toHaveLength(1);
    expect(body).toContain("ca-journal-task-edit");
    expect(body).toContain('setIcon(edit, "ellipsis")');
    // A button in a form-shaped widget that does not say `type="button"` submits
    // something, eventually.
    expect(body).toContain('type: "button"');
    // And it says what it opens, for a pointer that hovers and for a screen
    // reader that cannot see the glyph at all.
    expect(body).toContain('"aria-label": "Edit task"');
  });

  it("is reachable by a pointer that cannot hover", () => {
    // THE RULE THAT IS NOT A PHONE RULE. The old delete button faded out at rest
    // and there was a second route to everything else on the row; there is no
    // second route to this one — priority, due date, time and Delete are all
    // behind it — so a touch device must be able to see it.
    expect(cssRule(".ca-journal-task-row:hover .ca-journal-task-edit")).toContain(
      "opacity: 1"
    );
    expect(readCss()).toMatch(
      /@media \(hover: none\) \{\s*\.ca-journal-task-edit \{\s*opacity: 0\.7/
    );
  });

  it("hands the window a task and takes back a task", () => {
    const code = readCode("ui/widgets/note-regions");
    expect(code).toContain("openTaskEditor(");
    // FIELD BY FIELD, not by replacing the object. The row's task is the same
    // object `serializeTasks` walks and `moveTask` reorders; swapping the array
    // entry would be a second place that has to know the array's shape.
    for (const f of ["task.text = next.text", "task.priority = next.priority"]) {
      expect(code, f).toContain(f);
    }
    // Then the file, then the list — in that order, because a render that read
    // before the write would draw the old row.
    expect(code).toMatch(/persist\(\);\s*\n\s*render\(\);/);
    // And the delete callback is the list's business rather than the window's.
    expect(code).toContain("tasks.splice(index, 1)");
  });
});

describe("the window it opens", () => {
  const src = readSrc("task-edit.ts");
  const code = readCode("ui/task-edit");

  it("is on the shared frame, with the event editor's shape", () => {
    // *"similar to the event window editor"* — which is the frame rather than a
    // look: the head, the error line, the footer and the Enter-saves rule all
    // come from `EditorModal`, and `test/section-frame.test.ts` is where that
    // list is kept.
    expect(code).toMatch(/class TaskEditModal extends EditorModal/);
    expect(code).toContain('"Edit task"');
    expect(code).toContain('"Save"');
    // The one thing the fields cannot say.
    expect(src).toContain("Stored in this note, in the list you opened it from.");
  });

  it("asks the four questions the row stopped asking", () => {
    for (const name of ["Task", "Priority", "Due date", "Time"]) {
      expect(code, name).toContain(`.setName("${name}")`);
    }
    // The priority bar is the event editor's segmented control, and the ACTIVE
    // button wears the tint the row's spine will take — the answer and its
    // consequence in one colour.
    expect(code).toContain("ca-task-prio-bar");
    expect(code).toContain("ca-task-prio-btn");
    expect(cssRule('.ca-task-prio-btn.is-active[data-ca-prio="high"]')).toContain(
      "--color-red"
    );
    expect(cssRule(".ca-task-prio-btn.is-active")).toContain(
      "background: var(--background-primary)"
    );
    // Native pickers, which is what a date and an hour want to be.
    expect(code).toContain('t.inputEl.type = "date"');
    expect(code).toContain('t.inputEl.type = "time"');
  });

  it("removes the hour with the day rather than disabling it", () => {
    // `parseTaskLine` drops an `at` with no `due` on the next read, so a window
    // that let both stand would show the reader a time the file was about to
    // forget. The redraw happens at the moment the day goes, not at the Save.
    expect(code).toContain("if (!this.draft.due) this.draft.at = null;");
    expect(code).toMatch(/if \(!this\.draft\.due\) return;\s*\n\s*new Setting\(host\)/);
  });

  it("edits a copy, so Cancel is a cancel", () => {
    // The row's own object is what the widget persists from; editing it in place
    // would have written every keystroke the moment anything else called
    // `render`.
    expect(code).toContain(
      "this.draft = { ...task, extraFields: [...task.extraFields] };"
    );
    expect(code).toContain("this.onSave({ ...this.draft, text: this.draft.text.trim() })");
  });

  it("refuses to save a task with no words, and nothing else", () => {
    // Everything else on this form is optional by design: a task with no day, no
    // hour and no priority is the plain `- ( ) text` line the format calls its
    // minimal clean form.
    expect(code).toContain('return this.draft.text.trim() ? null : "A task needs some words."');
    const at = code.indexOf("protected validate()");
    const body = code.slice(at, code.indexOf("\n  }", at));
    expect(body).not.toContain("due");
    expect(body).not.toContain("priority");
  });

  it("offers Delete only where there is somewhere to delete from", () => {
    // The shape `EventEditModal` uses for a NEW event: a caller with nowhere to
    // delete from must not be offered a control that would do nothing.
    expect(code).toContain("if (this.onDelete) {");
    expect(code).toContain('cls: "mod-warning"');
    // AND NO CONFIRMATION, unlike an event's. Deleting a special event takes a
    // date off every year it applies to and out of a store nothing else shows;
    // deleting a task removes one line from a list the reader is looking at, and
    // Obsidian's own undo has the note.
    expect(code).not.toContain("ConfirmModal");
  });

  it("owns no store", () => {
    // A task lives in a note's region and the widget that drew the row is the
    // thing that knows how to write it — so this module reads no vault, holds no
    // file and schedules nothing.
    for (const dep of ["vault", "writeNoteRegion", "MetadataCache"]) {
      expect(code, dep).not.toContain(dep);
    }
  });
});

// ── and the thing the row wears that is not about the row ─────────────

describe("the pill the row wears", () => {
  it("says what the form answer says, wherever there is one", () => {
    // *"make the pill follow the form answer. Homepage already does this, make
    // this standard"* — and the homepage did it by accident rather than by
    // asking. A flat note's widget-form section is barless, a barless fence is
    // what `widgetRun` calls a column, and the column test then reported
    // "Widget". Nothing about a diary entry's FENCE changes when one of its
    // fields is drawn bare — the band is one fence either way — so the same
    // test went on saying "Section" over a ticked Show as widget.
    const base = { fixed: false, column: false, joined: false };
    expect(rowForm({ ...base, widgetForm: true })).toBe("Widget");
    expect(rowForm({ ...base, widgetForm: false })).toBe("Section");
    // AND IT OUTRANKS THE ARRANGEMENT RATHER THAN BEING CHECKED AFTER IT. A
    // barless fence in a column that the reader has just ticked back to
    // **Show as section** is a section, and the pill has to say so before the
    // Save proves it.
    expect(rowForm({ ...base, column: true, widgetForm: false })).toBe("Section");
    expect(rowForm({ ...base, joined: true, widgetForm: false })).toBe("Section");
    expect(rowForm({ ...base, column: true, widgetForm: true })).toBe("Widget");
  });

  it("falls back to the arrangement for a row with nothing to answer", () => {
    // The rule every surface used for every row until now, kept for the rows
    // that still have nothing else to say: a fence that is a column, or a
    // section welded inside another block, has no head of its own either.
    const base = { fixed: false, widgetForm: null };
    expect(rowForm({ ...base, column: false, joined: false })).toBe("Section");
    expect(rowForm({ ...base, column: true, joined: false })).toBe("Widget");
    expect(rowForm({ ...base, column: false, joined: true })).toBe("Widget");
  });

  it("says neither word about a row the reader cannot arrange", () => {
    // A banner, or a grid welded into one. Not a thing anybody arranges, so a
    // word about how it is arranged is a word about something they cannot act
    // on — and this is the one case that must survive the form answer, since a
    // fixed row can perfectly well have one.
    for (const widgetForm of [null, true, false]) {
      expect(rowForm({ fixed: true, widgetForm, column: true, joined: false })).toBe(
        null
      );
    }
  });

  it("makes the same call the control beside it makes", () => {
    // THE PROPERTY THAT FAILING QUIETLY IS THE WHOLE BUG: a pill and a checkbox
    // on one row, six pixels apart, disagreeing about the same answer. They
    // agree by making the same decision rather than matching decisions —
    // `drawnAsWidget` is `renderFormQuestion`'s two branches in its order.
    const editor = readCode("ui/section-editor");
    expect(editor).toContain("private drawnAsWidget(");
    const at = editor.indexOf("private drawnAsWidget(");
    const body = editor.slice(at, editor.indexOf("\n  }", at));
    // The cell rule, then the answer — which is what the box does.
    expect(body).toContain("block.length > 1 && block[0] !== section.id");
    expect(body).toContain("this.shownAnswer(section, q) === WIDGET_FORM");
    // And the pill is derived nowhere else.
    expect(editor).not.toContain('{ text: "Section", tone: "accent" }');
    expect(editor.match(/rowForm\(/g) ?? []).toHaveLength(2);
  });
});

// A task list is still one per note and still on two catalogues. The `#compact`
// suite proved that by counting the flag questions; with the flag gone the count
// is zero everywhere, so the shape is asserted directly instead.
describe("what draws a task list", () => {
  it("is one field on a diary entry and the opt-in section on a leaf", () => {
    const entry = composeEntryTemplate("daily");
    expect(entry.split("\n").filter((l) => /^tasks:/.test(l))).toEqual([
      "tasks:todo|Tasks",
    ]);
  });
});
