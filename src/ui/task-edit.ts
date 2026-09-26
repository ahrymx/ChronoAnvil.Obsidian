// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// One window for everything a task is, besides its text. 1.0.42.
//
// *"actually, make it one button (…) to open a edit task window which is
// similar to the event window editor."*
//
// WHAT THIS REPLACES IS A SECOND LINE ON EVERY ROW. A task used to carry its
// own priority pill, a date input, a time input and a delete button — four
// controls, on a line of their own, on every task in every list, whether or not
// any of them had been used. Ticking one thing off a list is the common act and
// it cost a row twice the height for controls that are not part of it.
//
// AND THE FORM IS THE EVENT EDITOR'S, DELIBERATELY. A special event and a task
// are the same shape of small record — a title, a when, and a way to say how
// much it matters — and the reader has already learned one of those windows.
// `EditorModal` is the frame both sit in, which is what makes "similar to the
// event window editor" a matter of reusing the frame rather than of copying a
// look: the head, the error line, the footer and the Enter-saves rule all come
// from there.
//
// IT EDITS A DRAFT AND HANDS IT BACK. This module owns no store: a task lives
// in a note's `<!--chronoanvil:todo-->` region, and the widget that drew the row
// is the thing that knows how to write it. So `commit` calls back with the
// edited copy and the caller persists — the same shape `openEventEditor` has
// with its `onDone`, minus the writing, because a region write needs a file and
// a scheduler this window has no business holding.

import { App, Setting } from "obsidian";
import { EditorModal } from "./editor-modal";
import type ChronoAnvilPlugin from "../main";
import type { ChronoAnvilTask, TaskPriority } from "./tasks";

// The three answers, in the order the bar draws them: least first, so the bar
// reads left to right as "how much does this matter".
const PRIORITIES: { id: TaskPriority; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "normal", label: "Normal" },
  { id: "high", label: "High" },
];

class TaskEditModal extends EditorModal {
  private draft: ChronoAnvilTask;
  // The hour field's own slot, so choosing or clearing a day can redraw the one
  // control that depends on it without rebuilding the field the reader is in.
  private atHost: HTMLElement | null = null;

  constructor(
    app: App,
    plugin: ChronoAnvilPlugin,
    task: ChronoAnvilTask,
    private onSave: (next: ChronoAnvilTask) => void,
    private onDelete: (() => void) | null
  ) {
    super(
      app,
      plugin,
      "Edit task",
      // The one thing the fields cannot say. A task is stored in this note, in
      // the region the list is drawn from — not in settings, and not in a
      // vault-wide store, which is the difference a reader coming from the
      // event editor most needs told.
      "Stored in this note, in the list you opened it from.",
      "Save"
    );
    // A COPY, so Cancel is a cancel. The row's own object is the widget's and is
    // what it persists from; editing it in place would have written every
    // keystroke the moment anything else called `render`.
    this.draft = { ...task, extraFields: [...task.extraFields] };
  }

  protected renderBody(): void {
    const body = this.body;
    this.contentEl.addClass("ca-task-modal");

    new Setting(body).setName("Task").addText((t) => {
      t.setPlaceholder("What needs doing")
        .setValue(this.draft.text)
        .onChange((v) => {
          this.draft.text = v;
        });
      window.setTimeout(() => t.inputEl.focus(), 0);
    });

    // THREE ANSWERS AND ONE FIELD, as a segmented bar — the event editor's
    // Recurrence control, which is the same question shape: a small closed set
    // where seeing the alternatives IS the control.
    const prio = new Setting(body)
      .setName("Priority")
      .setDesc("Normal is the absence of a choice, and is not printed on the row.");
    const bar = prio.controlEl.createDiv({ cls: "ca-task-prio-bar" });
    for (const p of PRIORITIES) {
      const on = this.draft.priority === p.id;
      const btn = bar.createEl("button", {
        cls: `ca-task-prio-btn${on ? " is-active" : ""}`,
        text: p.label,
        attr: {
          type: "button",
          "aria-pressed": on ? "true" : "false",
          // The stylesheet tints the ACTIVE button with the spine colour this
          // choice will paint on the row, so the answer and its consequence are
          // the same hue. An attribute rather than a class because it is the
          // button's identity, not its state.
          "data-ca-prio": p.id,
        },
      });
      btn.addEventListener("click", () => {
        this.draft.priority = p.id;
        bar.findAll(".ca-task-prio-btn").forEach((el) => {
          el.removeClass("is-active");
          el.setAttribute("aria-pressed", "false");
        });
        btn.addClass("is-active");
        btn.setAttribute("aria-pressed", "true");
      });
    }

    new Setting(body)
      .setName("Due date")
      .setDesc("Leave empty for a task with no day.")
      .addText((t) => {
        t.inputEl.type = "date";
        t.inputEl.addClass("ca-task-date");
        t.setValue(this.draft.due ?? "").onChange((v) => {
          this.draft.due = v || null;
          // THE HOUR GOES WITH THE DAY, and it goes at the moment the day does
          // rather than at the save. `parseTaskLine` drops an `at` with no `due`
          // on the next read, so a window that let both stand would show the
          // reader a time the file was about to forget.
          if (!this.draft.due) this.draft.at = null;
          this.renderAt();
        });
      });

    this.atHost = body.createDiv();
    this.renderAt();
  }

  // The hour, drawn only where there is a day to hang it on.
  //
  // REMOVED RATHER THAN DISABLED. A disabled field is a control the reader is
  // invited to wonder about; the sentence under Due date already says what a
  // task with no day is, and an empty slot says the rest.
  private renderAt(): void {
    const host = this.atHost;
    if (!host) return;
    host.empty();
    if (!this.draft.due) return;
    new Setting(host)
      .setName("Time")
      .setDesc("Optional. A task with an hour is drawn as a block on the time grid.")
      .addText((t) => {
        t.inputEl.type = "time";
        t.inputEl.addClass("ca-task-time");
        t.setValue(this.draft.at ?? "").onChange((v) => {
          this.draft.at = v || null;
        });
      });
  }

  protected renderFooter(footer: HTMLElement): void {
    const cancel = footer.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());

    // NO CONFIRMATION, UNLIKE AN EVENT'S. Deleting a special event takes a date
    // off every year it applies to and out of a settings store nothing else
    // shows; deleting a task removes one line from a list the reader is looking
    // at, and Obsidian's own undo has the note. A dialog over that is a dialog
    // over the ordinary act of finishing with something.
    if (this.onDelete) {
      const del = footer.createEl("button", {
        text: "Delete",
        cls: "mod-warning",
      });
      del.addEventListener("click", () => {
        this.onDelete?.();
        this.close();
      });
    }

    const save = footer.createEl("button", {
      text: this.saveLabel,
      cls: "mod-cta",
    });
    save.addEventListener("click", () => void this.trySubmit());
  }

  protected validate(): string | null {
    // THE ONE THING A TASK CANNOT BE. Everything else on this form is optional
    // by design — a task with no day, no hour and no priority is the plain
    // `- ( ) text` line the format calls its minimal clean form.
    return this.draft.text.trim() ? null : "A task needs some words.";
  }

  protected async commit(): Promise<void> {
    this.onSave({ ...this.draft, text: this.draft.text.trim() });
  }
}

// The one door onto that window.
//
// `onDelete` IS OPTIONAL AND ITS ABSENCE DRAWS NO BUTTON, which is the shape
// `EventEditModal` uses for a new event: a caller that has nowhere to delete
// from must not be offered a control that would do nothing.
export function openTaskEditor(
  app: App,
  plugin: ChronoAnvilPlugin,
  task: ChronoAnvilTask,
  onSave: (next: ChronoAnvilTask) => void,
  onDelete: (() => void) | null = null
): void {
  new TaskEditModal(app, plugin, task, onSave, onDelete).open();
}
