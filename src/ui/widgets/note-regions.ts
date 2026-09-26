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
import type ChronoAnvilPlugin from "../../main";
import {
  EntryEdit,
  applyEntryBackspace,
  applyEntryCommit,
  applyEntryEnter,
  normalizeEntry,
  parseEntries,
  serializeEntries,
} from "../../diary/entries";
import { isValidNoteKey, noteKeyOf, readNoteRegion } from "../../core/notestore";
import { splitArgHead } from "../../core/directive-grammar";
import { moment } from "../../core/util";
import {
  ChronoAnvilTask,
  moveTask,
  newTask,
  parseTasks,
  serializeTasks,
  taskTags,
} from "../tasks";
import { openTaskEditor } from "../task-edit";
import { fieldFoldStore, fieldHead } from "./note-field";

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
    value: string,
    // See note-write-scheduler.ts: absent means "no baseline, do not merge".
    baseline?: string
  ): Promise<void>;
  // The same write, to a file the caller names rather than the one it was drawn
  // on — what a `logbook:` widget needs, since it draws another note's items
  // (4.52). `writeNoteRegionToFile` is this with the file resolved from the ctx.
  writeRegionOf(
    file: TFile,
    key: string,
    value: string,
    baseline?: string
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
  readonly plugin: ChronoAnvilPlugin;
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
    cls: `ca-journal-list-row${text ? "" : " is-empty"}`,
  });
  row.createSpan({ cls: "ca-journal-list-bullet" });

  const input = row.createEl("textarea", { cls: "ca-journal-list-input" });
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
  step: ChronoAnvilTask,
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
    cls: `ca-journal-path-row${step.done ? " is-done" : ""}`,
  });

  const main = row.createDiv({ cls: "ca-journal-path-main" });

  // Step number badge
  const num = main.createDiv({ cls: "ca-journal-path-num", text: String(index + 1) });
  num.setAttr("title", `Step ${index + 1}`);

  const box = main.createEl("input", {
    type: "checkbox",
    cls: "ca-journal-path-check",
    attr: {
      "aria-label": step.done ? `Mark step ${index + 1} incomplete` : `Mark step ${index + 1} complete`,
    },
  });
  box.checked = step.done;
  box.addEventListener("change", () => cb.onToggle());

  const text = main.createEl("input", {
    type: "text",
    cls: "ca-journal-path-text",
    attr: { "aria-label": `Step ${index + 1} description` },
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

  const actions = row.createDiv({ cls: "ca-journal-path-actions" });
  const moves = actions.createDiv({ cls: "ca-journal-path-moves" });
  const up = moves.createEl("button", {
    cls: "ca-journal-path-move",
    attr: { "aria-label": "Move step up", title: "Move up", type: "button" },
  });
  setIcon(up, "chevron-up");
  up.disabled = index === 0;
  up.addEventListener("click", () => cb.onMoveUp());

  const down = moves.createEl("button", {
    cls: "ca-journal-path-move",
    attr: { "aria-label": "Move step down", title: "Move down", type: "button" },
  });
  setIcon(down, "chevron-down");
  down.disabled = index === count - 1;
  down.addEventListener("click", () => cb.onMoveDown());

  const del = actions.createEl("button", {
    cls: "ca-journal-path-del",
    attr: { "aria-label": "Delete step", title: "Delete step", type: "button" },
  });
  setIcon(del, "x");
  del.addEventListener("click", () => cb.onDelete());
}


// ── ONE LINE, AND ONE BUTTON FOR THE REST (1.0.42) ─────────────────────
//
// *"now improve the tasks section/widget. I think we can enforce compact mode
// and remove the larger format… actually, make it one button (…) to open a edit
// task window which is similar to the event window editor."*
//
// WHAT THIS ROW WAS. Two lines: a box and the text on the first, and on the
// second a priority pill, a date input, a time input and a delete button —
// four controls, drawn on every task in every list whether or not any of them
// had ever been used. Ticking something off is the common act on a list and it
// cost a row twice the height for chrome that is not part of it. A `#compact`
// flag existed to fold the second line into the first; it is gone with the line
// it folded, because a list has one shape now and a flag with one answer is not
// a question.
//
// WHAT IT IS. A box, the text, and a `…` that opens `openTaskEditor` — where
// the priority, the day, the hour and Delete live, in the frame the event
// editor uses. See `task-edit.ts` for why that window is the event window's
// shape rather than a copy of its look.
//
// AND THE PROPERTIES ARE STILL ON THE ROW, JUST NOT AS CONTROLS. `taskTags`
// prints what was chosen under the text, small — the cost of putting a property
// behind a window is that the row stops showing it, and a list where you open
// three windows to find what is due tomorrow is worse than the two-line row
// this replaces.
//
// THE DAY IS FORMATTED HERE, because `tasks.ts` is a pure string↔model module
// by its own header and Obsidian's `moment` is the renderer's import.
export function renderTaskRow(
  list: HTMLElement,
  task: ChronoAnvilTask,
  cb: {
    onToggle: () => void;
    onText: (value: string) => void;
    // The one control that is not the box or the text. Everything that used to
    // be a chip on the second line is behind it.
    onEdit: () => void;
  }
): void {
  const row = list.createDiv({
    cls: `ca-journal-task-row ca-journal-task-${task.priority}${
      task.done ? " is-done" : ""
    }`,
  });

  const box = row.createEl("input", {
    type: "checkbox",
    cls: "ca-journal-task-check",
    attr: { "aria-label": task.done ? "Mark task incomplete" : "Mark task complete" },
  });
  box.checked = task.done;
  box.addEventListener("change", () => cb.onToggle());

  // THE TEXT AND ITS EYEBROW IN ONE COLUMN, so the box and the `…` centre
  // against the pair rather than against the first of them — a row whose task
  // has a due date would otherwise hang its checkbox off the top.
  const main = row.createDiv({ cls: "ca-journal-task-main" });

  const text = main.createEl("input", {
    type: "text",
    cls: "ca-journal-task-text",
    attr: { "aria-label": "Task description" },
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

  // NOTHING CHOSEN, NOTHING DRAWN. The strip is built only where there is
  // something in it, so a plain task is one line of text and the eyebrow means
  // something wherever it appears. `:empty` would hide it too; not making it is
  // one fewer element per row on a list that can be long.
  const tags = taskTags(task, (iso) => {
    const d = moment(iso);
    if (!d.isValid()) return iso;
    // THE YEAR ONLY WHEN IT IS NOT THIS ONE. An eyebrow is four or five
    // characters of room; "27 Sep" is the answer nearly every time, and the
    // year is what tells a reader the one date that is not.
    return d.year() === moment().year() ? d.format("D MMM") : d.format("D MMM YYYY");
  });
  if (tags.length) {
    const eyebrow = main.createDiv({ cls: "ca-journal-task-eyebrow" });
    tags.forEach((t, i) => {
      if (i > 0) {
        eyebrow.createSpan({ cls: "ca-journal-task-fact-sep", text: "·" });
      }
      eyebrow.createSpan({ cls: "ca-journal-task-fact", text: t });
    });
  }

  const edit = row.createEl("button", {
    cls: "ca-journal-task-edit",
    attr: {
      "aria-label": "Edit task",
      title: "Edit task — priority, due date, time, delete",
      type: "button",
    },
  });
  setIcon(edit, "ellipsis");
  edit.addEventListener("click", () => cb.onEdit());
}


export function buildList(
  host: NoteRegionHost,
  rest: string,
  ctx: MarkdownPostProcessorContext,
  label: string | null,
  titled = false,
  barActions: HTMLElement | null = null
): HTMLElement {
  // `key[:placeholder]` — same grammar as `note:`, minus the `#variant` slot,
  // since a list has only one rendering.
  const { key, tail } = splitArgHead(rest);
  const placeholder = tail.slice(1).trim();

  const wrap = createDiv({ cls: `ca-journal-list ca-journal-list--${key}` });
  // A LIST FOLDS NOW, WHICH IS THE HALF OF 5.14 A READER ASKS FOR FIRST.
  // Highlights and Challenges are two of the longest fields on a monthly entry
  // and were the only two in the plugin with no way to put them away.
  const chrome = fieldHead({
    wrap,
    key,
    label,
    titled,
    barActions,
    store: fieldFoldStore(host, ctx.sourcePath),
  });

  if (!isValidNoteKey(key)) {
    chrome.body.createDiv({
      cls: "ca-journal-widget-error",
      text: `Invalid list key: "${key}"`,
    });
    return wrap;
  }

  const list = chrome.body.createDiv({ cls: "ca-journal-list-rows" });

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
  label: string | null,
  titled = false,
  barActions: HTMLElement | null = null
): HTMLElement {
  // THROUGH `noteKeyOf`, WHICH IS THE ONE PARSE OF A REGION KEY (1.0.42). This
  // read was `rest.split(":")[0]`, which is right up to the moment a `#token`
  // appears on the head — and two of them do now, `#compact` and `#widget`. An
  // unparsed one is a region key of `capture#widget`: a field pointed at a span
  // nothing writes, which renders empty, loses nothing and says nothing either.
  const key = noteKeyOf(rest);
  const wrap = createDiv({ cls: "ca-journal-path" });
  const chrome = fieldHead({
    wrap,
    key,
    label,
    titled,
    barActions,
    store: fieldFoldStore(host, ctx.sourcePath),
  });

  if (!isValidNoteKey(key)) {
    chrome.body.createDiv({
      cls: "ca-journal-widget-error",
      text: `Invalid path key: "${key}"`,
    });
    return wrap;
  }

  const addRow = chrome.body.createDiv({ cls: "ca-journal-path-add" });
  const addIcon = addRow.createSpan({ cls: "ca-journal-path-add-icon" });
  setIcon(addIcon, "circle-plus");
  const addInput = addRow.createEl("input", {
    type: "text",
    cls: "ca-journal-path-add-input",
  });
  addInput.placeholder = "Add a step…";
  const table = chrome.body.createDiv({ cls: "ca-journal-path-list" });

  // In-memory model; the region is the source of truth on load, this array
  // thereafter. Steps are ChronoAnvil tasks (order = array order = on-disk order).
  let steps: ChronoAnvilTask[] = [];

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
      table.createDiv({ cls: "ca-journal-path-empty", text: "No steps yet." });
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
  // `PluginNoteRegionHost`, NOT `NoteRegionHost`, AS OF 1.0.42 — and the widening
  // is the one thing the `…` button costs. `EditorModal` is constructed with the
  // plugin, every other door onto an editor already has one, and the host this
  // is called with is the dispatcher itself, which has carried both since 2.56.25.
  host: PluginNoteRegionHost,
  rest: string,
  ctx: MarkdownPostProcessorContext,
  label: string | null,
  // ── WHETHER A SECTION BAR ALREADY NAMES THIS BLOCK (5.10, 5.14) ────────
  //
  // 5.10 wrote this: *"`tasks:` is a FIELD, and its bar belongs to the family
  // `note:` and the capture log wear — a label, a chevron on the left, no
  // hairline. That is a consistent family and it is not the thing this release
  // is correcting."* It was a consistent family of one file's opinion: `list:`
  // and `path:` drew a label and no fold, and `attach:` drew a label row
  // outside its own box. 5.14 is the release that corrects it, and the branch
  // this comment guards is now `fieldHead`'s, asked once for all six.
  //
  // What 5.10 corrected stands unchanged: the `checklist` section renders
  // `header:✅ Tasks` over a single `tasks:tasks` field, and a field that drew
  // its own head under that bar made two heads for one section. Titled, this
  // keeps its tools and gives up its title and its fold — and the tools go INTO
  // the bar's actions slot now rather than into a bare strip under it, which is
  // where they were always meant to be.
  titled = false,
  barActions: HTMLElement | null = null
): HTMLElement {
  // ── THE DIRECTIVE'S OWN FLAGS, AND THERE ARE NONE LEFT (1.0.42) ─────
  //
  // `tasks:todo#compact|Tasks` was read here for one build. The spacing of the
  // list had been a button in this head, then a section option written as a
  // `#compact` flag on this line — and it is neither now, because *"I think we
  // can enforce compact mode and remove the larger format"*. A list has one
  // shape, and a question with one answer is not a question. See `renderTaskRow`
  // for what that shape is, and `tasksDensityQuestion`'s grave in
  // `core/note-sections.ts` for why the flag is not simply ignored.
  //
  // STILL THROUGH `splitArgHead` RATHER THAN A SPLIT ON `:`. A line written by
  // the build that had the flag still says `tasks:todo#compact|Tasks`, and an
  // unparsed `#compact` is a region key of `todo#compact` — a field pointed at a
  // region nothing writes, which renders empty and loses the reader's list. The
  // token is read and discarded, which is `#collapse`'s arrangement exactly.
  const { key } = splitArgHead(rest);
  const wrap = createDiv({ cls: "ca-journal-tasks" });

  // ── THE LABEL, AND NO FALLBACK FOR IT (1.0.42) ──────────────────────
  //
  // *"tasks ticked as show as widget but still renders titlebar"*, and this line
  // was the whole of it: `label ?? "Tasks"`. A field is drawn as a widget by
  // having its `|Title` taken off — that is what the section/widget toggle
  // writes and what `fieldHead` reads — so a renderer that supplies a title of
  // its own for a line that has none is a renderer that cannot be told to stop
  // drawing one. Six field kinds pass `label` straight through; this was the
  // seventh, and the odd one out since before the toggle existed.
  //
  // WHAT IT COSTS IS A HEAD ON A HAND-WRITTEN `tasks:mykey`, which is the rule
  // every other field already follows: no label names nothing, and an empty bar
  // is a rule ruled across the page for no reason. `fieldHead` states it.
  const chrome = fieldHead({
    wrap,
    key,
    label,
    titled,
    barActions,
    store: fieldFoldStore(host, ctx.sourcePath),
  });

  // ── THE READOUT SITS ON THE ADD ROW (1.0.42) ────────────────────────
  //
  // *"push the count onto the same line as the input field."*
  //
  // AND THAT ENDS A CLASS OF BUG RATHER THAN MOVING A PILL. The count used to be
  // built in `chrome.actions()` — the field head's slot — which took two fixes
  // in this release alone: one for the strip being drawn over an empty card for a
  // count of `0/0`, and one for *"0/1 Done from tasks widget in a group behaves
  // oddly?"*, where a titled group's bar is not the field's bar and the readout
  // ended up above both columns. Both are the same shape of fault: a head can
  // belong to something larger than the field, so anything the FIELD says about
  // itself has to be inside the field.
  //
  // IT IS STILL BUILT ONLY WHEN THERE IS SOMETHING TO READ, for a smaller reason
  // now: a lone "0/0 done" beside an empty box is a readout of nothing. And
  // `chrome.actions()` is no longer called from here at all, so the slot stays
  // `:empty` and the stylesheet goes on hiding it — which is what keeps a fresh
  // Tasks card down to a title and a box to type in.
  let progressEl: HTMLElement | null = null;

  if (!isValidNoteKey(key)) {
    chrome.body.createDiv({
      cls: "ca-journal-widget-error",
      text: `Invalid tasks key: "${key}"`,
    });
    return wrap;
  }

  const addRow = chrome.body.createDiv({ cls: "ca-journal-tasks-add" });
  // NO GLYPH BEFORE THE BOX. *"Remove the ➕ icon."* — the placeholder already
  // says "Add a task…", and a plus that is not a button says the same word twice
  // while looking like something to press.
  const addInput = addRow.createEl("input", {
    type: "text",
    cls: "ca-journal-tasks-add-input",
  });
  addInput.placeholder = "Add a task…";
  const list = chrome.body.createDiv({ cls: "ca-journal-tasks-list" });

  // In-memory model. Populated from the body region on load; thereafter the
  // widget mutates this and persists + re-renders.
  let tasks: ChronoAnvilTask[] = [];

  const updateProgress = (): void => {
    if (tasks.length === 0) {
      // REMOVED RATHER THAN HIDDEN, so the slot it lives in goes back to being
      // `:empty` — which is what the stylesheet is watching for. A reader who
      // clears the last task gets the card a fresh one has.
      progressEl?.remove();
      progressEl = null;
      return;
    }
    progressEl ??= addRow.createDiv({ cls: "ca-journal-tasks-progress" });
    const done = tasks.filter((t) => t.done).length;
    progressEl.textContent = `${done}/${tasks.length} done`;
  };

  const persist = (): void => {
    void host.writeNoteRegionToFile(ctx, key, serializeTasks(tasks));
  };

  const render = (): void => {
    list.empty();
    updateProgress();
    if (tasks.length === 0) {
      const empty = list.createDiv({ cls: "ca-journal-tasks-empty" });
      setIcon(empty.createSpan({ cls: "ca-journal-tasks-empty-icon" }), "check-check");
      empty.createSpan({ text: "No tasks yet — add one above." });
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
        // ── AND EVERYTHING ELSE, IN ONE WINDOW (1.0.42) ─────────────
        //
        // THE WRITE STAYS HERE, WHICH IS WHY THE WINDOW HANDS BACK A TASK
        // RATHER THAN SAVING ONE. A task lives in this note's region and this
        // closure is what holds the list, the region key and the scheduler;
        // `task-edit.ts` holds a form. Splitting it the other way would have
        // put a note write behind a modal that has no file.
        //
        // ASSIGNED FIELD BY FIELD RATHER THAN BY REPLACING THE OBJECT, because
        // `tasks[index]` is what the rest of this closure closes over and what
        // the next `render` reads — a fresh object in the array would leave the
        // row's own handlers writing into one nothing persists.
        onEdit: () => {
          openTaskEditor(
            host.app,
            host.plugin,
            task,
            (next) => {
              task.text = next.text;
              task.priority = next.priority;
              task.due = next.due;
              task.at = next.at;
              persist();
              render();
            },
            () => {
              tasks.splice(index, 1);
              persist();
              render();
            }
          );
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
