// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Categories window: what a Resources section keeps its attachments under.
//
// WHAT IT REPLACES, AND WHY A WINDOW IS THE ANSWER. Each shelf's head carried a
// ✕ that removed the category — faint, then plain (5.14), disabled with a
// tooltip whenever the shelf had anything in it. Every part of that was
// defensible on its own and the set of them was not: a per-shelf control for a
// SECTION-level list (the same category error 3.18 §1 corrected for *Add
// category*), repeated once per shelf, offering one of the three edits a list
// needs. Renaming was not offered at all — a reader who wanted "Films" instead
// of "Videos" had to add a category, move every file across and remove the old
// one.
//
// So it goes the way the Tags and Habits cells went: one door on the section's
// own title bar, and a dialogue behind it where the list can be read as a list.
// Adding, renaming and removing are three different edits, at least one of them
// needs typing, and a window has an unambiguous moment of Save.
//
// ONE DOOR, NOT TWO. *Add category* was on that bar and is now the add field
// inside this window. Leaving it beside a Categories button would be two
// controls on one strip doing overlapping jobs, which is the thing the bar was
// tidied to stop.
//
// NOTHING WRITES UNTIL SAVE, and for a category that promise is load-bearing: a
// removal takes a region out of the note. The window hands back the list it is
// SHOWING and `planAttachCategories` works out the difference against the file
// as it is at that moment — see `attach-categories.ts` for the two guards that
// survive from the ✕ and why the diff is computed there rather than here.
//
// A RENAME KEEPS THE KEY. `attach:<key>|<Label>` is bound to a
// `<!--chronoanvil:<key>` region, so renaming the key would mean moving every
// attachment in it. The label is the only half a reader is asking about, and
// the window says so rather than leaving it to be discovered.

import { App, setIcon } from "obsidian";
import { EditorModal } from "./editor-modal";
import type ChronoAnvilPlugin from "../main";
import {
  ATTACH_FORMATS,
  nextAttachFormat,
  normaliseCategoryLabel,
  type AttachCategoryRow,
  type AttachFormat,
} from "./attach-categories";

// A category as the window is handed it: what the note has, plus how much is
// in it — which is the whole of what decides whether it can be removed.
//
// AND HOW MANY OF THEM ARE NOT IMAGES (1.0.49 §6), which is the whole of what
// decides whether *Image gallery* is offered. Two numbers rather than the list
// of attachments itself: this window never shows what is in a category, only
// what that implies about the controls on its row, and handing it the items
// would be handing it a second copy of the shelf's model to go stale.
export interface AttachCategorySeed {
  key: string;
  label: string;
  items: number;
  others: number;
  format: AttachFormat;
}

interface Row {
  // Stable within this sitting, so `editing` can name a row that has no key.
  id: string;
  key: string | null;
  label: string;
  items: number;
  others: number;
  format: AttachFormat;
}

export class AttachCategoriesEditor extends EditorModal {
  private rows: Row[];
  private pending = "";
  private fresh = 0;
  // Which row is open for renaming, or null. One at a time, for the reason the
  // tags window gives: two open editors over one list is a merge conflict a
  // reader cannot see.
  private editing: string | null = null;
  // Whether this window is still on screen. The rename field commits on blur
  // and closing blurs it, so Escape fires `finish()` on the way out and would
  // repaint a detached body. Same guard, same reason as `TagsEditor`.
  private open_ = true;

  constructor(
    app: App,
    plugin: ChronoAnvilPlugin,
    section: string,
    seeds: readonly AttachCategorySeed[],
    private readonly onSave: (rows: AttachCategoryRow[]) => Promise<void>
  ) {
    super(
      app,
      plugin,
      "Categories",
      // The subtitle names the section, because that is what the list belongs
      // to and this window can be reached from any Resources bar in the note.
      section ? `In ${section}` : "In this note's Attachments section",
      "Save"
    );
    this.rows = seeds.map((s) => ({
      id: s.key,
      key: s.key,
      label: s.label,
      items: s.items,
      others: s.others,
      format: s.format,
    }));
  }

  protected renderBody(): void {
    this.body.empty();
    this.body.addClass("ca-tags-editor");
    this.body.addClass("ca-attach-cats-editor");
    this.renderCurrent();
    this.renderAdd();
  }

  // ── the list ─────────────────────────────────────────────────────────────

  private renderCurrent(): void {
    const wrap = this.body.createDiv({ cls: "ca-tags-section" });
    wrap.createDiv({ cls: "ca-tags-heading", text: "In this section" });

    if (this.rows.length === 0) {
      // An empty list is a state Save refuses, so the empty text says what
      // would fix it rather than describing the hole.
      wrap.createDiv({
        cls: "ca-tags-empty",
        text: "No categories — add one below, or Cancel to put the ones you removed back.",
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
      el.createSpan({ cls: "ca-tags-name", text: row.label });

      // WHAT IT HOLDS, IN THE SLOT THAT SAYS SO. The count is the reason the ✕
      // beside it is live or not, and a disabled control whose reason is only
      // in a tooltip is the shape this window was opened to improve on. A row
      // with no storage yet says so instead of saying zero.
      el.createSpan({
        cls: "ca-tags-count",
        text:
          row.key == null
            ? "new"
            : row.items === 0
              ? "empty"
              : `${row.items} item${row.items === 1 ? "" : "s"}`,
      });

      // ── WHAT SHAPE THE SHELF DRAWS (1.0.49 §6) ───────────────────────
      //
      // *"now implement format options into the category editor for different
      // ways to render the documents/links/images."*
      //
      // ONE BUTTON THAT CYCLES, on the reader's call, rather than a `<select>`
      // per row: it is the size of the arrows beside it, and the name it is
      // showing lives in the tooltip and the `aria-label` the way every other
      // icon control in this window's rows does.
      //
      // THE ICON IS THE READING. A cycling control has to say what it is on
      // now, not what pressing it would do — so the glyph is the current
      // format's and the sentence names both halves: this is X, press for Y.
      //
      // THE GATE IS `offeredFormats`', not this button's. *Image gallery* is
      // withheld from a category holding anything that is not an image, and
      // `nextAttachFormat` is where that is decided — a row showing a format
      // the gate would withhold keeps it, which is what stops a reader being
      // stranded outside their own choice when a PDF lands on a gallery shelf.
      const fmt = (): void => {
        const now =
          ATTACH_FORMATS.find((f) => f.value === row.format) ??
          ATTACH_FORMATS[0];
        const then = nextAttachFormat(row.format, row.others);
        const btn = el.createEl("button", {
          cls: "ca-journal-btn-ghost ca-attach-cats-format",
          attr: { type: "button" },
        });
        setIcon(btn.createSpan({ cls: "ca-journal-btn-icon" }), now.icon);
        const why =
          then === row.format
            ? `${now.label} — ${now.hint}`
            : `${now.label} — ${now.hint}. Press for ${
                ATTACH_FORMATS.find((f) => f.value === then)?.label ?? ""
              }`;
        btn.setAttr("aria-label", why);
        btn.setAttr("title", why);
        btn.addEventListener("click", () => {
          row.format = then;
          this.clearError();
          this.renderBody();
        });
      };
      fmt();

      // ── ORDER IS THE READER'S (1.0.49) ───────────────────────────────
      //
      // *"It would be good to be able to reorder categories in the editor
      // too."* The directive order is the render order — a Resources section
      // draws its shelves down the page in the order its fence lists them — so
      // until now the only way to put a category where you wanted it was to
      // remove the ones after it and add them again, which the emptiness guard
      // makes impossible for any category with anything in it.
      //
      // ARROWS RATHER THAN DRAG, the same answer `path:` and the section editor
      // give, and for the same reason: a list of this length is three presses
      // at most, a drag needs a pointer, and a disabled arrow says "this one is
      // already at the end" where a dead drop zone says nothing.
      //
      // THE LIST IS THE ANSWER, NOT A SEQUENCE OF MOVES — the window hands back
      // the rows in the order they are showing and `planAttachCategories` works
      // out what that means for the file. A move is therefore free: it costs
      // what a rename costs, and a move that is undone before Save costs
      // nothing at all.
      const at = this.rows.indexOf(row);
      const move = (delta: number, icon: string, word: string): void => {
        const btn = el.createEl("button", {
          cls: "ca-journal-btn-ghost ca-attach-cats-move",
          attr: { type: "button" },
        });
        setIcon(btn.createSpan({ cls: "ca-journal-btn-icon" }), icon);
        const to = at + delta;
        const can = to >= 0 && to < this.rows.length;
        btn.disabled = !can;
        btn.toggleClass("is-static", !can);
        const why = can
          ? `Move ${row.label} ${word}`
          : `${row.label} is already ${delta < 0 ? "first" : "last"}`;
        btn.setAttr("aria-label", why);
        btn.setAttr("title", why);
        btn.addEventListener("click", () => {
          if (!can) return;
          const next = this.rows.slice();
          next.splice(to, 0, ...next.splice(at, 1));
          this.rows = next;
          this.clearError();
          this.renderBody();
        });
      };
      move(-1, "chevron-up", "up");
      move(1, "chevron-down", "down");

      const edit = el.createEl("button", {
        cls: "ca-journal-btn-ghost",
        attr: { type: "button", "aria-label": `Rename ${row.label}` },
      });
      setIcon(edit.createSpan({ cls: "ca-journal-btn-icon" }), "pencil");
      edit.addEventListener("click", () => {
        this.editing = row.id;
        this.renderBody();
      });

      const drop = el.createEl("button", {
        cls: "ca-journal-btn-ghost ca-tags-remove",
        attr: { type: "button" },
      });
      setIcon(drop.createSpan({ cls: "ca-journal-btn-icon" }), "x");
      // EMPTY IS THE WHOLE CONDITION, carried over from the ✕ this window
      // replaces, including the sentence it used. A category's region is where
      // the reader's files live and there is nothing left behind to recover
      // from, so the control is offered only where "remove" costs the empty box
      // it names. Disabled rather than hidden: a control that vanishes on some
      // rows and not others is harder to read than a quiet one.
      const canGo = row.key == null || row.items === 0;
      drop.disabled = !canGo;
      drop.toggleClass("is-static", !canGo);
      const why = canGo
        ? `Remove ${row.label}`
        : `${row.label} still has ${row.items} item${
            row.items === 1 ? "" : "s"
          } — remove them first`;
      drop.setAttr("aria-label", why);
      drop.setAttr("title", why);
      drop.addEventListener("click", () => {
        if (!canGo) return;
        this.rows = this.rows.filter((r) => r.id !== row.id);
        this.clearError();
        this.renderBody();
      });
    }
  }

  // Renaming reaches the LABEL and nothing else — see the header. The field's
  // title says it, because "does this move my files" is the question a reader
  // is entitled to have answered before they type.
  private renderRename(list: HTMLElement, row: Row): void {
    const el = list.createDiv({ cls: "ca-tags-row is-editing" });
    const input = el.createEl("input", {
      cls: "ca-tags-input",
      attr: {
        type: "text",
        value: row.label,
        "aria-label": `Rename ${row.label}`,
        title: "Renames the category on this note. Nothing in it moves.",
      },
    });
    const finish = (): void => {
      if (!this.open_) return;
      const next = normaliseCategoryLabel(input.value);
      if (next != null) row.label = next;
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

  // ── adding ───────────────────────────────────────────────────────────────

  private renderAdd(): void {
    const wrap = this.body.createDiv({ cls: "ca-tags-section" });
    const row = wrap.createDiv({ cls: "ca-tags-add" });
    const input = row.createEl("input", {
      cls: "ca-tags-input",
      attr: {
        type: "text",
        placeholder: "New category…",
        "aria-label": "New category",
      },
    });
    const commit = (): void => {
      const label = normaliseCategoryLabel(input.value);
      if (label == null) {
        this.showError(
          "That isn't a usable category name — it needs a letter or a digit in it."
        );
        return;
      }
      // TWO CATEGORIES NAMED "Books" IS TWO CATEGORIES, as it has been since
      // 3.18 — the key suffixes and both shelves work. Unlike a habit, a
      // category is a box in one note rather than a row in a registry, so
      // joining an existing one is not a thing a reader could have meant.
      this.rows.push({
        id: `new-${this.fresh++}`,
        key: null,
        label,
        items: 0,
        // A category with nothing in it has nothing that is not an image, so
        // every format is on offer from the moment it is typed.
        others: 0,
        format: "default",
      });
      this.pending = "";
      this.clearError();
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

    // WHAT SAVE IS ABOUT TO DO, said before it happens. A new category writes
    // two things into the note — a line in the section's fence and a region
    // below it — and a removal takes both away. A reader is owed that sentence
    // at the moment they are deciding, not afterwards from a Notice.
    wrap.createDiv({
      cls: "ca-attach-cats-note",
      text: "A category is a line in this section and a block in the note that stores what you drop on it. Renaming changes the title only, and the shape button changes how a shelf draws what it holds — nothing in it moves.",
    });
  }

  protected validate(): string | null {
    // THE FLOOR, where the reader can still act on it. A Resources section with
    // no `attach:` line renders an empty header with no way back into it, so
    // the write refuses the last removal as well (`planAttachCategories`) —
    // but by then the window has closed and the Notice is all there is. Here
    // the list is still on screen and both routes out are one gesture away.
    if (this.rows.length === 0) {
      return "An Attachments section needs at least one category. Add one here, or remove the whole section from “Edit sections…”.";
    }
    return null;
  }

  onClose(): void {
    this.open_ = false;
    super.onClose();
  }

  protected async commit(): Promise<void> {
    await this.onSave(
      this.rows.map((r) => ({ key: r.key, label: r.label, format: r.format }))
    );
  }
}
