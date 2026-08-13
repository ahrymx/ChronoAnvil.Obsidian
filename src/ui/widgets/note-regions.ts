// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Widgets that own a region of the note's BODY rather than a frontmatter key.
//
// THE DISTINCTION THIS MODULE DRAWS
//
// A slider writes `mood: 4` into frontmatter and is done — that is what
// WidgetHost in ./controls.ts describes, two methods wide. A list, a learning
// path, or a task block cannot work that way. Their content is prose that
// belongs in the note where the reader can see it, so each one owns a marked
// region of the body and rewrites that region in place.
//
// That is a genuinely different contract, and it is worth its own interface
// rather than more methods on WidgetHost: find the file, make sure the region
// exists, write the region back. Four members covering three widgets that had
// otherwise been sharing 313 lines of near-identical scaffolding inside a
// 4,700-line class.
//
// WHY THE ROW RENDERERS SIT HERE TOO
//
// renderEntryRow, renderPathRow and renderTaskRow had no dependency on the
// class at all — they were already pure functions that happened to be written
// as private methods. Being private is what kept them from being reused or
// tested directly; nothing else did. They move as they were.

import { MarkdownPostProcessorContext, TFile, setIcon } from "obsidian";
import type { App } from "obsidian";
import type AlmanacPlugin from "../../main";
import {
  EntryEdit,
  applyEntryBackspace,
  applyEntryCommit,
  applyEntryEnter,
  normalizeEntry,
  parseEntries,
  serializeEntries,
} from "../../diary/entries";
import { isValidNoteKey, readNoteRegion } from "../../core/notestore";
import {
  AlmanacTask,
  TaskPriority,
  moveTask,
  newTask,
  parseTasks,
  serializeTasks,
} from "../tasks";

/**
 * What a body-region widget needs in order to persist itself.
 *
 * Deliberately narrow, and deliberately NOT an extension of WidgetHost: a
 * widget either writes a frontmatter value or owns a region of the body, and
 * the two have no members in common. A builder that needs both should take
 * both, so that the fact is visible at the call site.
 */
export interface NoteRegionHost {
  readonly app: App;
  fileOf(ctx: MarkdownPostProcessorContext): TFile | null;
  ensureNoteRegion(file: TFile, key: string): Promise<void>;
  writeNoteRegionToFile(
    ctx: MarkdownPostProcessorContext,
    key: string,
    value: string
  ): Promise<void>;
}

/**
 * The note-region contract plus the plugin.
 *
 * Three modules extracted from the Widgets class in 2.56.25 — attachments,
 * recall and the note: field — each needed exactly this, and each declared its
 * own interface for it. Because TypeScript is structural those three were
 * already interchangeable, so the separate names did not buy a separate
 * contract; they only implied one, and put three near-identical entries in the
 * class's `implements` clause where one belonged.
 *
 * A widget that genuinely needs more than this should extend it and say what
 * — as NoteFieldHost does with its scheduler — rather than restate it.
 */
export interface PluginNoteRegionHost extends NoteRegionHost {
  readonly plugin: AlmanacPlugin;
}

export function renderEntryRow(
  list: HTMLElement,
  text: string,
  placeholder: string,
  cb: {
    onCommit: (value: string) => void;
    onEnter: (value: string) => void;
    onBackspaceEmpty: () => void;
  }
): void {
  const row = list.createDiv({
    cls: `journal-list-row${text ? "" : " is-empty"}`,
  });
  row.createSpan({ cls: "journal-list-bullet" });

  const input = row.createEl("textarea", { cls: "journal-list-input" });
  input.rows = 1;
  input.value = text;
  if (placeholder) input.placeholder = placeholder;

  const autoGrow = (): void => {
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  };
  input.addEventListener("input", autoGrow);
  // Height can only be measured once the element is in the document; a frame's
  // delay is enough and avoids a layout read during the build.
  window.setTimeout(autoGrow, 0);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      cb.onEnter(input.value);
      return;
    }
    // Only when the row is empty and the caret is at its start, so Backspace
    // still deletes characters normally everywhere else.
    if (
      e.key === "Backspace" &&
      input.value === "" &&
      input.selectionStart === 0
    ) {
      e.preventDefault();
      cb.onBackspaceEmpty();
    }
  });

  input.addEventListener("blur", () => {
    // A re-render triggered by another row's commit blurs this one; comparing
    // against the value it was rendered with keeps that from writing a no-op.
    if (normalizeEntry(input.value) !== text) cb.onCommit(input.value);
  });
}


export function renderPathRow(
  table: HTMLElement,
  step: AlmanacTask,
  index: number,
  count: number,
  cb: {
    onToggle: () => void;
    onText: (value: string) => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onDelete: () => void;
  }
): void {
  const row = table.createDiv({
    cls: `journal-path-row${step.done ? " is-done" : ""}`,
  });

  // Step number, so the sequence reads at a glance even before the buttons.
  row.createDiv({ cls: "journal-path-num", text: String(index + 1) });

  const box = row.createEl("input", {
    type: "checkbox",
    cls: "journal-path-check",
  });
  box.checked = step.done;
  box.addEventListener("change", () => cb.onToggle());

  const text = row.createEl("input", {
    type: "text",
    cls: "journal-path-text",
  });
  text.value = step.text;
  const commitText = (): void => {
    const v = text.value.trim();
    if (v && v !== step.text) cb.onText(v);
  };
  text.addEventListener("blur", commitText);
  text.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      text.blur();
    }
  });

  const moves = row.createDiv({ cls: "journal-path-moves" });
  const up = moves.createEl("button", {
    cls: "journal-path-move",
    attr: { "aria-label": "Move step up", type: "button" },
  });
  setIcon(up, "chevron-up");
  up.disabled = index === 0;
  up.addEventListener("click", () => cb.onMoveUp());

  const down = moves.createEl("button", {
    cls: "journal-path-move",
    attr: { "aria-label": "Move step down", type: "button" },
  });
  setIcon(down, "chevron-down");
  down.disabled = index === count - 1;
  down.addEventListener("click", () => cb.onMoveDown());

  const del = row.createEl("button", {
    cls: "journal-path-del",
    attr: { "aria-label": "Delete step", type: "button" },
  });
  setIcon(del, "x");
  del.addEventListener("click", () => cb.onDelete());
}


export function renderTaskRow(
  list: HTMLElement,
  task: AlmanacTask,
  cb: {
    onToggle: () => void;
    onText: (value: string) => void;
    onPriority: (p: TaskPriority) => void;
    onDue: (d: string | null) => void;
    onDelete: () => void;
  }
): void {
  const row = list.createDiv({
    cls: `journal-task-row journal-task-${task.priority}${
      task.done ? " is-done" : ""
    }`,
  });

  // Checkbox
  const box = row.createEl("input", {
    type: "checkbox",
    cls: "journal-task-check",
  });
  box.checked = task.done;
  box.addEventListener("change", () => cb.onToggle());

  // Editable text (commits on blur / Enter)
  const text = row.createEl("input", {
    type: "text",
    cls: "journal-task-text",
  });
  text.value = task.text;
  const commitText = (): void => {
    const v = text.value.trim();
    if (v && v !== task.text) cb.onText(v);
  };
  text.addEventListener("blur", commitText);
  text.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      text.blur();
    }
  });

  // Priority cycle: normal → high → low → normal
  const prioBtn = row.createEl("button", {
    cls: "journal-task-prio",
    attr: { "aria-label": "Cycle priority", type: "button" },
  });
  const PRIO_ORDER: TaskPriority[] = ["normal", "high", "low"];
  const PRIO_ICON: Record<TaskPriority, string> = {
    high: "chevrons-up",
    normal: "minus",
    low: "chevrons-down",
  };
  setIcon(prioBtn, PRIO_ICON[task.priority]);
  prioBtn.addEventListener("click", () => {
    const next =
      PRIO_ORDER[(PRIO_ORDER.indexOf(task.priority) + 1) % PRIO_ORDER.length];
    cb.onPriority(next);
  });

  // Due date
  const due = row.createEl("input", {
    type: "date",
    cls: "journal-task-due",
  });
  if (task.due) due.value = task.due;
  due.addEventListener("change", () => cb.onDue(due.value || null));

  // Delete
  const del = row.createEl("button", {
    cls: "journal-task-del",
    attr: { "aria-label": "Delete task", type: "button" },
  });
  setIcon(del, "x");
  del.addEventListener("click", () => cb.onDelete());
}


export function buildList(
  host: NoteRegionHost,
  rest: string,
  ctx: MarkdownPostProcessorContext,
  label: string | null
): HTMLElement {
  // `key[:placeholder]` — same grammar as `note:`, minus the `#variant` slot,
  // since a list has only one rendering.
  const colon = rest.indexOf(":");
  const key = (colon === -1 ? rest : rest.slice(0, colon)).trim();
  const placeholder = colon === -1 ? "" : rest.slice(colon + 1).trim();

  const wrap = createDiv({ cls: `journal-list journal-list--${key}` });
  if (label) wrap.createDiv({ cls: "journal-list-label", text: label });

  if (!isValidNoteKey(key)) {
    wrap.createDiv({
      cls: "journal-widget-error",
      text: `Invalid list key: "${key}"`,
    });
    return wrap;
  }

  const list = wrap.createDiv({ cls: "journal-list-rows" });

  // In-memory model, same contract as buildTasks: the region is the source of
  // truth on load, this is the source of truth while the widget is open. All
  // mutation goes through the pure transitions in entries.ts.
  let entries: string[] = [];
  // Which row to focus after the next render, and whether to put the caret at
  // its end. -1 means "don't steal focus" — the default, so an edit that
  // changes nothing can't yank the caret out of another field.
  let focusAfterRender = -1;
  let focusAtEnd = false;

  const persist = (): void => {
    void host.writeNoteRegionToFile(ctx, key, serializeEntries(entries));
  };

  // Apply one transition and repaint. `changed` is an identity comparison —
  // the transitions return the *same* array when nothing moved — so a no-op
  // edit costs neither a disk write nor a repaint. There are many of those:
  // every row commits on blur whether or not it was touched.
  //
  // Repainting is further limited to edits that change the row *set* or need
  // the caret moved. Editing a row's text in place needs no repaint (the
  // textarea already shows what was typed), and repainting anyway is actively
  // harmful: rebuilding the rows on blur tears out the element a click was
  // travelling towards, so clicking straight from one row into another would
  // land on a detached node.
  const apply = (edit: EntryEdit): void => {
    const changed = edit.entries !== entries;
    if (!changed && edit.focus < 0) return;
    const structural = edit.entries.length !== entries.length;
    entries = edit.entries;
    focusAfterRender = edit.focus;
    focusAtEnd = edit.focusAtEnd;
    if (changed) persist();
    if (structural || edit.focus >= 0) render();
  };

  const render = (): void => {
    list.empty();
    // The trailing blank is the "type here" affordance and is never
    // persisted — serializeEntries drops empties — so the model can carry it
    // without it ever reaching the file.
    const rows = [...entries, ""];
    rows.forEach((text, index) => {
      const isTrailing = index === entries.length;
      renderEntryRow(list, text, isTrailing ? placeholder : "", {
        // Every handler reads `entries` at call time rather than closing over
        // the value it was rendered with. That is what makes a duplicated
        // callback harmless: rebuilding the rows blurs the focused textarea,
        // so Enter fires its own commit and then this row's blur commit too,
        // and the second one has to see the model the first one produced.
        onCommit: (value) => apply(applyEntryCommit(entries, index, value)),
        onEnter: (value) => apply(applyEntryEnter(entries, index, value)),
        onBackspaceEmpty: () => apply(applyEntryBackspace(entries, index)),
      });
    });

    if (focusAfterRender >= 0) {
      const target = list.children[focusAfterRender]?.querySelector(
        "textarea"
      ) as HTMLTextAreaElement | null;
      if (target) {
        target.focus();
        if (focusAtEnd) {
          target.selectionStart = target.selectionEnd = target.value.length;
        }
      }
      focusAfterRender = -1;
      focusAtEnd = false;
    }
  };

  const file = host.fileOf(ctx);
  if (file) {
    void host.app.vault.read(file).then((text) => {
      entries = parseEntries(readNoteRegion(text, key));
      render();
      void host.ensureNoteRegion(file, key);
    });
  } else {
    render();
  }

  return wrap;
}


export function buildPath(
  host: NoteRegionHost,
  rest: string,
  ctx: MarkdownPostProcessorContext,
  label: string | null
): HTMLElement {
  const key = rest.split(":")[0].trim();
  const wrap = createDiv({ cls: "journal-path" });
  if (label) wrap.createDiv({ cls: "journal-path-label", text: label });

  if (!isValidNoteKey(key)) {
    wrap.createDiv({
      cls: "journal-widget-error",
      text: `Invalid path key: "${key}"`,
    });
    return wrap;
  }

  const addRow = wrap.createDiv({ cls: "journal-path-add" });
  const addInput = addRow.createEl("input", {
    type: "text",
    cls: "journal-path-add-input",
  });
  addInput.placeholder = "Add a step…";
  const table = wrap.createDiv({ cls: "journal-path-list" });

  // In-memory model; the region is the source of truth on load, this array
  // thereafter. Steps are Almanac tasks (order = array order = on-disk order).
  let steps: AlmanacTask[] = [];

  const persist = (): void => {
    void host.writeNoteRegionToFile(ctx, key, serializeTasks(steps));
  };

  // A move re-runs persist+render only when the array identity actually
  // changes (moveTask returns the same array for a no-op, e.g. "up" on the
  // first row), so an edge move costs nothing.
  const move = (from: number, to: number): void => {
    const next = moveTask(steps, from, to);
    if (next === steps) return;
    steps = next;
    persist();
    render();
  };

  const render = (): void => {
    table.empty();
    if (steps.length === 0) {
      table.createDiv({ cls: "journal-path-empty", text: "No steps yet." });
    }
    steps.forEach((step, index) => {
      renderPathRow(table, step, index, steps.length, {
        onToggle: () => {
          step.done = !step.done;
          persist();
          render();
        },
        onText: (value) => {
          step.text = value;
          persist();
        },
        onMoveUp: () => move(index, index - 1),
        onMoveDown: () => move(index, index + 1),
        onDelete: () => {
          steps.splice(index, 1);
          persist();
          render();
        },
      });
    });
  };

  const addStep = (): void => {
    const text = addInput.value.trim();
    if (!text) return;
    // Append (not unshift): a new step goes to the end of the path, since the
    // list is ordered and the newest step is usually the next thing to do.
    steps.push(newTask(text));
    addInput.value = "";
    persist();
    render();
    addInput.focus();
  };
  addInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addStep();
    }
  });
  addInput.addEventListener("blur", addStep);

  const file = host.fileOf(ctx);
  if (file) {
    void host.app.vault.read(file).then((text) => {
      steps = parseTasks(readNoteRegion(text, key));
      render();
      void host.ensureNoteRegion(file, key);
    });
  } else {
    render();
  }

  return wrap;
}


export function buildTasks(
  host: NoteRegionHost,
  rest: string,
  ctx: MarkdownPostProcessorContext,
  label: string | null
): HTMLElement {
  const key = rest.split(":")[0].trim();
  const wrap = createDiv({ cls: "journal-tasks" });
  if (label) wrap.createDiv({ cls: "journal-tasks-label", text: label });

  if (!isValidNoteKey(key)) {
    wrap.createDiv({
      cls: "journal-widget-error",
      text: `Invalid tasks key: "${key}"`,
    });
    return wrap;
  }

  const addRow = wrap.createDiv({ cls: "journal-tasks-add" });
  const addInput = addRow.createEl("input", {
    type: "text",
    cls: "journal-tasks-add-input",
  });
  addInput.placeholder = "Add a task…";
  const list = wrap.createDiv({ cls: "journal-tasks-list" });

  // In-memory model. Populated from the body region on load; thereafter the
  // widget mutates this and persists + re-renders.
  let tasks: AlmanacTask[] = [];

  const persist = (): void => {
    void host.writeNoteRegionToFile(ctx, key, serializeTasks(tasks));
  };

  const render = (): void => {
    list.empty();
    if (tasks.length === 0) {
      list.createDiv({
        cls: "journal-tasks-empty",
        text: "No tasks yet.",
      });
    }
    tasks.forEach((task, index) => {
      renderTaskRow(list, task, {
        onToggle: () => {
          task.done = !task.done;
          persist();
          render();
        },
        onText: (value) => {
          task.text = value;
          persist();
        },
        onPriority: (p) => {
          task.priority = p;
          persist();
          render();
        },
        onDue: (d) => {
          task.due = d;
          persist();
        },
        onDelete: () => {
          tasks.splice(index, 1);
          persist();
          render();
        },
      });
    });
  };

  const addTask = (): void => {
    const text = addInput.value.trim();
    if (!text) return;
    tasks.unshift(newTask(text));
    addInput.value = "";
    persist();
    render();
    addInput.focus();
  };
  addInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTask();
    }
  });
  addInput.addEventListener("blur", addTask);

  // Load current tasks from the body region, then ensure the region exists so
  // the raw file carries a stable anchor even before the first task.
  const file = host.fileOf(ctx);
  if (file) {
    void host.app.vault.read(file).then((text) => {
      tasks = parseTasks(readNoteRegion(text, key));
      render();
      void host.ensureNoteRegion(file, key);
    });
  } else {
    render();
  }

  return wrap;
}
