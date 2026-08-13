// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Tags window: this note's tags, and the ones the folder around it uses.
//
// DIALOGUE-BASED, WHICH IS A DECISION ABOUT WHERE THE EDIT HAPPENS rather than
// about how much room there is. The alternative — a text input in the section
// itself — was the obvious shape and is the one to argue against: an inline
// field has to decide what a half-typed tag means on every keystroke, so it
// either writes `#dee` to the note on the way to `#deep-work` or it needs a
// commit control, at which point it is a dialogue drawn badly. A window has an
// unambiguous moment of Save, which is also the only moment the note is
// touched.
//
// NOTHING HERE WRITES UNTIL SAVE. The three edits (§`tags.ts`) are pure list
// functions over a draft; `commit` writes the draft once, in one frontmatter
// transaction. So Cancel is free, Escape is free, and a reader who removes
// four tags and changes their mind has changed nothing.

import { App, setIcon } from "obsidian";
import { EditorModal } from "./editor-modal";
import type AlmanacPlugin from "../main";
import {
  addTag,
  normaliseTag,
  removeTag,
  renameTag,
  tagsInFolder,
  type TagUse,
} from "../trackers/tags";

export class TagsEditor extends EditorModal {
  private draft: string[];
  private readonly used: TagUse[];
  private pending = "";
  // Which tag is open for renaming, or null. One at a time: two open editors
  // over one list is a merge conflict a reader cannot see.
  private editing: string | null = null;
  // Whether this window is still on screen.
  //
  // THE RENAME FIELD COMMITS ON BLUR, and closing the window blurs it — so
  // Escape, or a click on the backdrop, fires `finish()` on the way out and
  // then repaints a body that is no longer in the document. Nothing is written
  // (the draft only reaches the note through `commit`, and `commit` only runs
  // from Save), so this is not a data hazard; it is a repaint of a detached
  // element, which is the kind of thing that works until the day something in
  // the paint path reads a layout.
  private open_ = true;

  constructor(
    app: App,
    plugin: AlmanacPlugin,
    private readonly folder: string,
    tags: readonly string[],
    private readonly onSave: (tags: string[]) => Promise<void>
  ) {
    super(
      app,
      plugin,
      "Tags",
      // The subtitle names the folder, because the suggestion list below is
      // scoped to it and a list of tags with no stated scope is a list a
      // reader has to guess the boundaries of.
      folder ? `On this note, and what ${folder} already uses` : "On this note",
      "Save"
    );
    this.draft = [...tags];
    this.used = tagsInFolder(app, folder);
  }

  protected renderBody(): void {
    this.body.empty();
    this.body.addClass("almanac-tags-editor");
    this.renderCurrent();
    this.renderAdd();
    this.renderUsed();
  }

  // ── this note's tags ────────────────────────────────────────────────────

  private renderCurrent(): void {
    const wrap = this.body.createDiv({ cls: "almanac-tags-section" });
    wrap.createDiv({ cls: "almanac-tags-heading", text: "On this note" });

    if (this.draft.length === 0) {
      // An empty state rather than an empty box: the window is reached from a
      // section that says "Tags" and showing nothing under that heading reads
      // as broken rather than as empty.
      wrap.createDiv({
        cls: "almanac-tags-empty",
        text: "No tags yet — add one below, or pick from what this folder uses.",
      });
      return;
    }

    const list = wrap.createDiv({ cls: "almanac-tags-list" });
    for (const tag of this.draft) {
      if (this.editing === tag) {
        this.renderRename(list, tag);
        continue;
      }
      const row = list.createDiv({ cls: "almanac-tags-row" });
      row.createSpan({ cls: "almanac-tags-name", text: `#${tag}` });

      const edit = row.createEl("button", {
        cls: "journal-btn-ghost",
        attr: { type: "button", "aria-label": `Rename #${tag}` },
      });
      setIcon(edit.createSpan({ cls: "journal-btn-icon" }), "pencil");
      edit.addEventListener("click", () => {
        this.editing = tag;
        this.renderBody();
      });

      const drop = row.createEl("button", {
        cls: "journal-btn-ghost almanac-tags-remove",
        attr: { type: "button", "aria-label": `Remove #${tag}` },
      });
      setIcon(drop.createSpan({ cls: "journal-btn-icon" }), "x");
      drop.addEventListener("click", () => {
        this.draft = removeTag(this.draft, tag);
        this.renderBody();
      });
    }
  }

  private renderRename(list: HTMLElement, tag: string): void {
    const row = list.createDiv({ cls: "almanac-tags-row is-editing" });
    const input = row.createEl("input", {
      cls: "almanac-tags-input",
      attr: { type: "text", value: tag, "aria-label": `Rename #${tag}` },
    });
    const finish = (): void => {
      if (!this.open_) return;
      const next = normaliseTag(input.value);
      // A rename to something unusable keeps the old tag rather than dropping
      // it. The reader can see what they typed; silently deleting a tag they
      // meant to keep is the failure worth avoiding.
      if (next != null) this.draft = renameTag(this.draft, tag, next);
      this.editing = null;
      this.renderBody();
    };
    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        finish();
      }
      if (evt.key === "Escape") {
        // Escape cancels the RENAME, not the window. The modal's own Escape
        // handler would close everything, which is not what a reader who is
        // half way through fixing a typo means by it.
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
    const wrap = this.body.createDiv({ cls: "almanac-tags-section" });
    const row = wrap.createDiv({ cls: "almanac-tags-add" });
    const input = row.createEl("input", {
      cls: "almanac-tags-input",
      attr: {
        type: "text",
        placeholder: "New tag…",
        "aria-label": "New tag",
        list: "almanac-tags-suggest",
      },
    });
    // A native `<datalist>` rather than a suggestion popover: it filters as
    // you type, it is keyboard-navigable for free, and it does not fight the
    // modal for focus the way a second floating layer inside a window does.
    const suggest = row.createEl("datalist");
    suggest.id = "almanac-tags-suggest";
    for (const { tag } of this.used) suggest.createEl("option", { value: tag });

    const commit = (): void => {
      const next = addTag(this.draft, input.value);
      if (next.length !== this.draft.length) {
        this.draft = next;
        this.pending = "";
        this.renderBody();
        return;
      }
      // Nothing changed: either it was unusable or the note already has it.
      // Both are worth saying, because "I pressed Add and nothing happened" is
      // the same experience for two different reasons.
      this.showError(
        normaliseTag(input.value) == null
          ? "That isn't a usable tag — letters, digits, - _ and / only."
          : "This note already has that tag."
      );
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
      cls: "journal-btn",
      text: "Add",
      attr: { type: "button" },
    });
    btn.addEventListener("click", commit);
  }

  // ── what the folder uses ────────────────────────────────────────────────

  private renderUsed(): void {
    if (this.used.length === 0) return;
    const wrap = this.body.createDiv({ cls: "almanac-tags-section" });
    wrap.createDiv({
      cls: "almanac-tags-heading",
      text: `Used in ${this.folder || "this vault"}`,
    });
    const cloud = wrap.createDiv({ cls: "almanac-tags-used" });
    for (const { tag, count } of this.used) {
      const has = this.draft.some((t) => t.toLowerCase() === tag.toLowerCase());
      const pill = cloud.createEl("button", {
        cls: has ? "almanac-tags-pill is-on" : "almanac-tags-pill",
        attr: { type: "button" },
      });
      pill.createSpan({ text: `#${tag}` });
      pill.createSpan({ cls: "almanac-tags-count", text: String(count) });
      // A pill TOGGLES, so the same control adds and removes and the list
      // doubles as a picture of what this note carries. One control, one
      // meaning: pressed means on this note.
      pill.addEventListener("click", () => {
        this.draft = has
          ? removeTag(this.draft, tag)
          : addTag(this.draft, tag);
        this.renderBody();
      });
    }
  }

  protected validate(): string | null {
    // Nothing to reject: every edit above went through `normaliseTag` at the
    // moment it was made, so the draft cannot hold an unusable tag by the time
    // Save is reachable. Stated rather than left empty because "this window
    // validates nothing" is a claim about the edits, not an omission.
    return null;
  }

  onClose(): void {
    this.open_ = false;
    super.onClose();
  }

  protected async commit(): Promise<void> {
    await this.onSave([...this.draft]);
  }
}
