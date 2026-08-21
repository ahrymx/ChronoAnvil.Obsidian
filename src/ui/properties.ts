// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// A note's frontmatter, in a window. 4.51.6.
//
// ── WHY IT IS A WINDOW AND NOT A PANEL ───────────────────────────────────
//
// Obsidian draws the property editor between the note's title and its first
// block — six rows of key and value on a diary entry, above everything the
// reader opened the note to write in. On an Almanac note most of what is in it
// is already on screen: Mood, Sleep, Wake-Up and Bedtime are the tracker grid,
// drawn as controls rather than as rows; `journal-date` and `journal` are what
// the bar's trail and the head's eyebrow are derived from.
//
// What is left is plumbing — `created`, `type`, a stray key from a template —
// which is reference material rather than something a reader looks at while
// writing. **So it goes behind a button**, and the note opens with the note.
//
// ── IT WRITES THROUGH `processFrontMatter`, AND ONLY WHAT IT UNDERSTANDS ─
//
// A value this editor cannot render is shown and NOT touched: nested objects
// and lists of objects keep their row, greyed, saying so. An editor that
// flattened them to a string would be the one operation in this plugin that
// destroys a reader's data, and it would do it silently — the note would look
// fine and the structure would be gone.

import { App, Modal, Setting, TFile, setIcon } from "obsidian";
import { notify } from "../core/notify";

/** What kind of control a value gets, decided once. */
type Shape = "text" | "number" | "boolean" | "list" | "opaque";

/**
 * Which control a frontmatter value earns.
 *
 * PURE AND EXPORTED, because it is the whole of the decision this window makes
 * and the only part of it that can be checked without a vault.
 *
 * `null` AND `undefined` ARE TEXT, NOT OPAQUE. An empty property is the normal
 * state of a template's fields — Obsidian writes `Mood:` with nothing after it
 * — and a reader clicking Properties to fill one in must find a field rather
 * than a refusal.
 */
export function shapeOf(value: unknown): Shape {
  if (value === null || value === undefined) return "text";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "text";
  if (Array.isArray(value)) {
    return value.every((v) => v === null || typeof v !== "object")
      ? "list"
      : "opaque";
  }
  return "opaque";
}

/**
 * The text a list is edited as, and the list a text is saved as.
 *
 * COMMA-SEPARATED, WHICH IS WHAT `tags` ALREADY LOOKS LIKE in every vault that
 * has them. Empty entries are dropped rather than saved as `""`, because a
 * trailing comma is a typo and not a value.
 */
export function listToText(value: unknown): string {
  return Array.isArray(value) ? value.map((v) => String(v ?? "")).join(", ") : "";
}

export function textToList(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Keys in the order a reader should meet them: Almanac's first, then the rest. */
export function orderedKeys(
  fm: Record<string, unknown>,
  first: readonly string[]
): string[] {
  const known = first.filter((k) => k in fm);
  const rest = Object.keys(fm)
    .filter((k) => !first.includes(k))
    .sort((a, b) => a.localeCompare(b));
  return [...known, ...rest];
}

export function openProperties(app: App, file: TFile): void {
  new PropertiesModal(app, file).open();
}

// The properties Almanac writes, in the order it writes them — so the window
// opens on what the plugin put there rather than on whatever sorts first.
const ALMANAC_FIRST = [
  "title",
  "journal-date",
  "week-start",
  "month-start",
  "quarter-start",
  "year-start",
  "journal",
  "type",
  "date",
  "created",
] as const;

class PropertiesModal extends Modal {
  constructor(app: App, private file: TFile) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("am-props-modal");
    contentEl.empty();
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private frontmatter(): Record<string, unknown> {
    return { ...(this.app.metadataCache.getFileCache(this.file)?.frontmatter ?? {}) };
  }

  // REBUILT AFTER A WRITE RATHER THAN PATCHED. A rename or a removal changes
  // which rows exist and in what order, and a window that patched one row would
  // be showing a list the file no longer has.
  private render(): void {
    const { contentEl } = this;
    contentEl.empty();

    const head = contentEl.createDiv({ cls: "amp-head" });
    setIcon(head.createSpan({ cls: "amp-head-icon" }), "list");
    head.createDiv({ cls: "amp-head-text", text: "Properties" });
    head.createDiv({ cls: "amp-head-note", text: this.file.basename });

    const fm = this.frontmatter();
    const keys = orderedKeys(fm, ALMANAC_FIRST);
    const body = contentEl.createDiv({ cls: "amp-body" });

    if (keys.length === 0) {
      body.createDiv({
        cls: "amp-empty",
        text: "This note has no properties yet.",
      });
    }
    for (const key of keys) this.renderRow(body, key, fm[key]);

    new Setting(contentEl.createDiv({ cls: "amp-foot" }))
      // WORDS, NOT A GLYPH. This shipped as `.setButtonText(…).setIcon("plus")`
      // and rendered as a bare `+`: Obsidian's `setIcon` REPLACES the button's
      // content, so the second call threw the first one away. A `+` alone in a
      // window of fields is a control a reader has to guess at, and the window
      // has room for four words.
      .addButton((b) =>
        b.setButtonText("Add a property…").onClick(() => void this.addProperty())
      )
      .addButton((b) => b.setButtonText("Done").setCta().onClick(() => this.close()));
  }

  private renderRow(body: HTMLElement, key: string, value: unknown): void {
    const shape = shapeOf(value);
    const row = new Setting(body).setName(key);
    row.settingEl.addClass("amp-row");

    if (shape === "opaque") {
      // SHOWN AND NOT TOUCHED. See the module head: flattening a nested value
      // to a string is the one operation here that would destroy data, and it
      // would do it silently.
      row.setDesc("A list or object — edit this one in the note itself.");
      row.settingEl.addClass("amp-row-opaque");
      return;
    }

    if (shape === "boolean") {
      row.addToggle((c) =>
        c.setValue(value === true).onChange((v) => void this.write(key, v))
      );
    } else if (shape === "number") {
      row.addText((c) => {
        c.inputEl.type = "number";
        c.setValue(String(value ?? ""));
        // ON BLUR, NOT ON EVERY KEYSTROKE. `processFrontMatter` rewrites the
        // file, and a write per character is a write per character into the
        // reader's vault and their sync.
        c.inputEl.addEventListener("blur", () => {
          const raw = c.getValue().trim();
          const n = Number(raw);
          if (raw === "") void this.write(key, null);
          else if (Number.isFinite(n)) void this.write(key, n);
          else notify.info(`${key} needs a number.`);
        });
      });
    } else if (shape === "list") {
      row.setDesc("Separate with commas.");
      row.addText((c) => {
        c.setValue(listToText(value));
        c.inputEl.addEventListener("blur", () =>
          void this.write(key, textToList(c.getValue()))
        );
      });
    } else {
      row.addText((c) => {
        c.setValue(value === null || value === undefined ? "" : String(value));
        c.inputEl.addEventListener("blur", () => {
          const next = c.getValue();
          void this.write(key, next === "" ? null : next);
        });
      });
    }

    row.addExtraButton((b) =>
      b
        .setIcon("trash-2")
        .setTooltip(`Remove ${key}`)
        .onClick(() => void this.remove(key))
    );
  }

  // `null` MEANS "LEAVE THE KEY, EMPTY IT" and removal means "take the key
  // away". They are different states in a note's frontmatter and a reader can
  // reach both: an empty `Mood:` is what a template writes, and a template's
  // field that is gone is a field the note has opted out of.
  private async write(key: string, value: unknown): Promise<void> {
    await this.app.fileManager.processFrontMatter(this.file, (fm) => {
      fm[key] = value;
    });
  }

  private async remove(key: string): Promise<void> {
    await this.app.fileManager.processFrontMatter(this.file, (fm) => {
      delete fm[key];
    });
    this.render();
  }

  private async addProperty(): Promise<void> {
    const name = await promptForName(this.app);
    if (!name) return;
    const fm = this.frontmatter();
    if (name in fm) {
      notify.info(`${name} is already on this note.`);
      return;
    }
    await this.write(name, null);
    this.render();
  }
}

// One field, one answer. Deliberately not `promptSuggester`: there is no list
// to choose from, and a free-text name is the whole of the question.
function promptForName(app: App): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = new Modal(app);
    let settled = false;
    const finish = (v: string | null): void => {
      if (settled) return;
      settled = true;
      resolve(v);
      modal.close();
    };
    modal.titleEl.setText("Add a property");
    const input = modal.contentEl.createEl("input", {
      type: "text",
      attr: { placeholder: "Property name" },
    });
    input.addClass("amp-name-input");
    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        finish(input.value.trim() || null);
      }
    });
    new Setting(modal.contentEl).addButton((b) =>
      b
        .setButtonText("Add")
        .setCta()
        .onClick(() => finish(input.value.trim() || null))
    );
    modal.onClose = () => finish(null);
    modal.open();
    window.setTimeout(() => input.focus(), 0);
  });
}
