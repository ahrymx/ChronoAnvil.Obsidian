// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Habits window: this entry's habits, and the ones the folder around it
// logs.
//
// THE SAME WINDOW AS TAGS', DELIBERATELY, down to the three sections and the
// order they come in — a list of what this note carries, a field that adds one,
// and a cloud of what the folder uses. Two cells in the same tracker grid hold
// a LIST rather than a value, and `tags-editor.ts`' whole argument for a
// dialogue is about lists rather than about tags: "adding, renaming and
// removing are three different edits and at least one of them needs typing".
// A reader who has met one of these windows has met both.
//
// WHAT THIS WINDOW CAN DO THAT TAGS' CANNOT, and why it has to. A habit's row
// carries its READING — the three-state box the chip cycles — because of the
// overflow this round also adds: once a cell with nine habits shows two rows
// and a `+7` card, the window is the only way to reach the seven. A membership
// editor would have made the collapse a loss of function.
//
// NOTHING HERE WRITES UNTIL SAVE, and for a habit that promise is worth more
// than it is for a tag: the draft holds note membership, per-note readings,
// registry renames and registry rows yet to exist, and `habitWrites` works out
// the difference at the end. So Cancel is free even after creating a habit and
// renaming two others, and the vault is touched once (see
// `EntryTrackers.applyHabitDraft`).

import { App, setIcon } from "obsidian";
import { EditorModal } from "./editor-modal";
import type ChronoAnvilPlugin from "../main";
import type { TrackerDef, TrackerSurface } from "../trackers/trackers";
import {
  addHabitRow,
  describeHabitState,
  habitsInFolder,
  hasHabit,
  newHabitDef,
  nextHabitState,
  normaliseHabitLabel,
  removeHabitRow,
  setHabitState,
  type HabitDraft,
  type HabitRow,
  type HabitUse,
} from "../trackers/habits";
import { trackerDirective } from "../trackers/entry-trackers";

export class HabitsEditor extends EditorModal {
  private rows: HabitRow[];
  private renamed: Record<string, string> = {};
  private created: TrackerDef[] = [];
  private readonly used: HabitUse[];
  private pending = "";
  // Which habit is open for renaming, or null. One at a time, for the reason
  // the tags window gives: two open editors over one list is a merge conflict
  // a reader cannot see.
  private editing: string | null = null;
  // Whether this window is still on screen. The rename field commits on blur
  // and closing the window blurs it, so Escape would otherwise repaint a body
  // that is no longer in the document — `tags-editor.ts` carries the full note.
  private open_ = true;

  constructor(
    app: App,
    plugin: ChronoAnvilPlugin,
    private readonly folder: string,
    private readonly surface: TrackerSurface | null,
    // Every habit this note's surface admits, registry order. The cloud is
    // drawn from this; passing it in rather than reading the registry here
    // keeps the one "what is a habit" test (`habitsForSurface`) in the model.
    private readonly habits: readonly TrackerDef[],
    rows: readonly HabitRow[],
    private readonly onSave: (draft: HabitDraft) => Promise<void>
  ) {
    super(
      app,
      plugin,
      "Habits",
      // Names the folder, because the cloud below is scoped to it and a list of
      // habits with no stated scope is a list a reader has to guess the
      // boundaries of.
      folder ? `On this entry, and what ${folder} already logs` : "On this entry",
      "Save"
    );
    this.rows = rows.map((r) => ({ ...r }));
    this.used = habitsInFolder(app, habits, folder);
  }

  protected renderBody(): void {
    this.body.empty();
    this.body.addClass("ca-tags-editor");
    this.body.addClass("ca-habits-editor");
    this.renderCurrent();
    this.renderAdd();
    this.renderUsed();
  }

  // The label to show for a habit: the rename in the draft if there is one,
  // otherwise the registry's. NOT the chip's effective name — a note carrying
  // a `tracker:<id>|Label` override shows that override on its chip, and a
  // window that displayed it would be offering to rename one thing while
  // renaming another.
  private nameOf(row: HabitRow): string {
    return this.renamed[row.id] ?? row.label;
  }

  private labelOf(use: HabitUse): string {
    return this.renamed[use.id] ?? use.label;
  }

  // ── this entry's habits ─────────────────────────────────────────────────

  private renderCurrent(): void {
    const wrap = this.body.createDiv({ cls: "ca-tags-section" });
    wrap.createDiv({ cls: "ca-tags-heading", text: "On this entry" });

    if (this.rows.length === 0) {
      wrap.createDiv({
        cls: "ca-tags-empty",
        text: "No habits on this entry yet — add one below, or pick from what this folder logs.",
      });
      return;
    }

    const list = wrap.createDiv({ cls: "ca-tags-list" });
    for (const row of this.rows) {
      if (this.editing === row.id) {
        this.renderRename(list, row);
        continue;
      }
      const el = list.createDiv({ cls: "ca-tags-row" });

      // THE READING, AS THE CHIP DRAWS IT — same glyphs, same cycle, same
      // classes, so the box in the window and the box on the entry are visibly
      // one control in two places rather than two controls that agree.
      const box = el.createEl("button", {
        cls: "ca-journal-habit-box ca-habits-box",
        attr: { type: "button" },
      });
      const paintBox = (): void => {
        box.toggleClass("is-done", row.state === 1);
        box.toggleClass("is-not-done", row.state === 0);
        box.setText(row.state === 1 ? "✓" : row.state === 0 ? "✗" : "");
        const state = describeHabitState(row.state);
        box.setAttr("aria-label", `${this.nameOf(row)}: ${state}`);
        box.setAttr("title", `${this.nameOf(row)}: ${state}`);
      };
      paintBox();
      box.addEventListener("click", () => {
        // Through the model's cycle and back into the draft, rather than
        // toggling the element: the draft is what Save reads, and a box that
        // painted itself without recording the answer is the oldest bug in
        // this shape.
        this.rows = setHabitState(this.rows, row.id, nextHabitState(row.state));
        this.renderBody();
      });

      el.createSpan({ cls: "ca-tags-name", text: this.nameOf(row) });

      const edit = el.createEl("button", {
        cls: "ca-journal-btn-ghost",
        attr: { type: "button", "aria-label": `Rename ${this.nameOf(row)}` },
      });
      setIcon(edit.createSpan({ cls: "ca-journal-btn-icon" }), "pencil");
      edit.addEventListener("click", () => {
        this.editing = row.id;
        this.renderBody();
      });

      const drop = el.createEl("button", {
        cls: "ca-journal-btn-ghost ca-tags-remove",
        attr: {
          type: "button",
          "aria-label": `Remove ${this.nameOf(row)} from this entry`,
        },
      });
      setIcon(drop.createSpan({ cls: "ca-journal-btn-icon" }), "x");
      drop.addEventListener("click", () => {
        // FROM THE ENTRY, NOT FROM THE VAULT. One verb, one meaning (1.0.43):
        // the habit stays defined in Settings and keeps every reading it has
        // on every other entry — this takes its widget off this note, exactly
        // as the × on its chip does.
        this.rows = removeHabitRow(this.rows, row.id);
        this.renderBody();
      });
    }
  }

  // Renaming reaches the REGISTRY, which is the one edit in this window that
  // leaves the note. The subtitle of the field says so rather than leaving a
  // reader to find out from the Diary.base column header.
  private renderRename(list: HTMLElement, row: HabitRow): void {
    const el = list.createDiv({ cls: "ca-tags-row is-editing" });
    const input = el.createEl("input", {
      cls: "ca-tags-input",
      attr: {
        type: "text",
        value: this.nameOf(row),
        "aria-label": `Rename ${this.nameOf(row)} everywhere`,
        title: "Renames this habit in Settings, on every entry and in Diary.base",
      },
    });
    const finish = (): void => {
      if (!this.open_) return;
      const next = normaliseHabitLabel(input.value);
      // A rename to something unusable keeps the old name rather than dropping
      // it — the tags window's rule, and the same reasoning: the reader can see
      // what they typed, and silently losing a habit they meant to keep is the
      // failure worth avoiding.
      if (next != null && next !== row.label) this.renamed[row.id] = next;
      else if (next != null) delete this.renamed[row.id];
      this.editing = null;
      this.renderBody();
    };
    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        finish();
      }
      if (evt.key === "Escape") {
        // Escape cancels the RENAME, not the window — a reader half way
        // through fixing a name does not mean "discard everything".
        evt.preventDefault();
        evt.stopPropagation();
        this.editing = null;
        this.renderBody();
      }
    });
    input.addEventListener("blur", finish);
    window.setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }

  // ── adding ──────────────────────────────────────────────────────────────

  private renderAdd(): void {
    const wrap = this.body.createDiv({ cls: "ca-tags-section" });
    const row = wrap.createDiv({ cls: "ca-tags-add" });
    const input = row.createEl("input", {
      cls: "ca-tags-input",
      attr: {
        type: "text",
        placeholder: "New habit…",
        "aria-label": "New habit",
        list: "ca-habits-suggest",
      },
    });
    // A native `<datalist>` over what the folder logs, for the reasons the tags
    // window gives: it filters as you type, it is keyboard-navigable for free,
    // and it does not fight the modal for focus. Typing a name that is already
    // a habit therefore ADDS that habit rather than defining a second one with
    // the same label — see `commit` below.
    const suggest = row.createEl("datalist");
    suggest.id = "ca-habits-suggest";
    for (const use of this.used) {
      suggest.createEl("option", { value: this.labelOf(use) });
    }

    const commit = (): void => {
      const name = normaliseHabitLabel(input.value);
      if (name == null) {
        this.showError(
          "That isn't a usable habit name — it needs a letter or a digit in it."
        );
        return;
      }
      // AN EXISTING HABIT IS JOINED, NOT DUPLICATED. A reader who types
      // "Exercise" into a vault that already has an Exercise habit means that
      // one; defining a second `Exercise2` property beside it would split a
      // year of readings in two and is the kind of thing nobody notices until
      // a chart is wrong.
      const known = this.habits.find(
        (h) => (h.label || h.id).toLowerCase() === name.toLowerCase()
      );
      if (known) {
        if (hasHabit(this.rows, known.id)) {
          this.showError("This entry already has that habit.");
          return;
        }
        this.rows = addHabitRow(this.rows, {
          id: known.id,
          directive: trackerDirective(known.id),
          label: known.label || known.id,
          state: null,
        });
        this.pending = "";
        this.renderBody();
        return;
      }

      // A NEW ONE IS DEFINED, and `taken` carries the ids this sitting has
      // already claimed as well as the registry's, so two habits typed one
      // after the other cannot be handed the same property name.
      const def = newHabitDef(
        name,
        [
          ...this.plugin.settings.trackers.map((t) => t.id),
          ...this.created.map((t) => t.id),
        ],
        this.surface
      );
      if (!def) {
        this.showError(
          "That isn't a usable habit name — it needs a letter or a digit in it."
        );
        return;
      }
      this.created.push(def);
      this.rows = addHabitRow(this.rows, {
        id: def.id,
        directive: trackerDirective(def.id),
        label: def.label,
        state: null,
      });
      this.pending = "";
      this.renderBody();
    };

    input.addEventListener("input", () => {
      this.pending = input.value;
      this.clearError();
    });
    input.addEventListener("keydown", (evt) => {
      if (evt.key !== "Enter") return;
      evt.preventDefault();
      commit();
    });
    input.value = this.pending;

    const btn = row.createEl("button", {
      cls: "ca-journal-btn",
      text: "Add",
      attr: { type: "button" },
    });
    btn.addEventListener("click", commit);

    // WHAT PRESSING ADD IS ABOUT TO DO, said before it happens. A tag is a
    // string in this note; a habit typed here becomes a row in Settings →
    // Trackers that every entry of this kind can then log, and a reader is
    // owed that sentence at the moment they are deciding whether to type.
    wrap.createDiv({
      cls: "ca-habits-note",
      text: "A new habit is added to Settings → Trackers and put on this entry. Existing entries are untouched.",
    });
  }

  // ── what the folder logs ────────────────────────────────────────────────

  private renderUsed(): void {
    if (this.used.length === 0) return;
    const wrap = this.body.createDiv({ cls: "ca-tags-section" });
    wrap.createDiv({
      cls: "ca-tags-heading",
      text: `Logged in ${this.folder || "this vault"}`,
    });
    const cloud = wrap.createDiv({ cls: "ca-tags-used" });
    for (const use of this.used) {
      const has = hasHabit(this.rows, use.id);
      const pill = cloud.createEl("button", {
        cls: has ? "ca-tags-pill is-on" : "ca-tags-pill",
        attr: { type: "button" },
      });
      pill.createSpan({ text: this.labelOf(use) });
      // The count is how many entries beneath the folder logged it DONE, so a
      // habit nobody has kept reads 0 rather than reading like a new one.
      pill.createSpan({ cls: "ca-tags-count", text: String(use.count) });
      // A pill TOGGLES, so the same control adds and removes and the cloud
      // doubles as a picture of what this entry carries.
      pill.addEventListener("click", () => {
        this.rows = has
          ? removeHabitRow(this.rows, use.id)
          : addHabitRow(this.rows, {
              id: use.id,
              directive: trackerDirective(use.id),
              label: use.label,
              state: null,
            });
        this.renderBody();
      });
    }
  }

  protected validate(): string | null {
    // Nothing to reject: a name went through `normaliseHabitLabel` at the
    // moment it was typed and a pill can only name a habit the registry
    // already holds, so the draft cannot carry an unusable row by the time
    // Save is reachable. Stated rather than left blank because "this window
    // validates nothing" is a claim about the edits, not an omission.
    return null;
  }

  onClose(): void {
    this.open_ = false;
    super.onClose();
  }

  protected async commit(): Promise<void> {
    await this.onSave({
      rows: this.rows.map((r) => ({
        ...r,
        label: this.renamed[r.id] ?? r.label,
      })),
      renamed: { ...this.renamed },
      created: this.created.map((d) => ({ ...d })),
    });
  }
}
