// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Prose block window: one block of writing, and the four things a reader
// can say about it.
//
// WHAT IT REPLACES. Nothing, and that is the point — every answer here was
// already reachable and only through *Edit sections…*, a window that lists
// every section of the note so that a reader standing on their third prose
// block could rename it. The Attachments and What's-below cogs took the same
// route for the same reason (1.0.49 §3, 1.0.69): a section-level question
// belongs on the section, and a cog on its title row is where the other two
// sections now keep theirs.
//
// ONE BLOCK, WHICH IS WHAT THE SECTION EDITOR CANNOT BE. That window is the
// note: its rows are the note's sections, its Save plans a whole composition,
// and a prose block is one row in it. This window is opened FROM a block and
// knows which — `nth` — so every control on it writes to that block's marker
// and to no other.
//
// NOTHING WRITES UNTIL SAVE, including the removal. The tick marks the block to
// go and the write happens once, in `commit`, through the same `apply` the
// section editor presses — so a reader who ticks it and presses Cancel has a
// note nobody touched.
//
// AND THE WINDOW RE-READS BEFORE IT WRITES. `section-editor.ts` states the rule
// and the reason: a window a reader can leave open is a long gap, and on a note
// being written in, what a stale write would drop is the writing.
//
// ── WHY IT DRAWS ITS OWN FIELDS ──────────────────────────────────────────
//
// `SectionEditorModal.renderQuestions` draws these same four kinds and could
// not be shared: it is a method over that window's `answers`, `dirty` and
// `original` maps, and its `readable` falls back to reading a directive's
// argument out of the whole file. A prose question names no directive — the
// catalogue says so four times, because prose composes no fence — so the
// fallback is dead here and what is left is a label, a control and the
// `settled` sentence. That is this file's `field` and the three renderers under
// it, and they take their wording from the SAME places: `fieldLabelOf` for the
// box's name, `q.on`/`q.off` for the tick, `q.placeholder` for what empty gets
// you, `q.settled` for the block that has no markers to write to.

import { App, TFile } from "obsidian";

import { EditorModal } from "./editor-modal";
import type ChronoAnvilPlugin from "../main";
import { getFile } from "../core/util";
import { notify } from "../core/notify";
import {
  FLAG_OFF,
  FLAG_ON,
  fieldLabelOf,
  type FlagQuestion,
  type LinesQuestion,
  type SectionQuestion,
  type SectionView,
  type SectionModel,
  type TitleQuestion,
} from "../core/section-model";
import { proseIdFor } from "../journals/journal-sections";

// Why this block's window could not be opened, in the reader's words.
//
// A NOTICE RATHER THAN A WINDOW WITH A SENTENCE IN IT. The cog is only ever
// drawn on a block the painter found in the file it is painting, so every one
// of these is a surface this plugin does not compose — a prose bracket a reader
// copied into an ordinary note, or a note whose journal has been unregistered.
// What they need is the fact, not a dialogue.
const UNRECOGNISED =
  "ChronoAnvil: this note isn't one a registered journal composes, so its " +
  "prose blocks have no settings to change.";

export async function openProseWindow(
  app: App,
  plugin: ChronoAnvilPlugin,
  path: string,
  nth: number
): Promise<boolean> {
  const file = getFile(app, path);
  if (!file) return false;
  const resolved = plugin.sections.modelForNote(path);
  if (!resolved) {
    notify.info(UNRECOGNISED);
    return false;
  }
  const text = await app.vault.read(file);
  const id = proseIdFor(nth);
  // THE VIEW IS THE MODEL'S, NOT THIS WINDOW'S. `sections(text)` expands the
  // one catalogue row into one row per block in the file and carries both
  // halves this window needs: the questions the row declares, and what THIS
  // block's marker already answers (`SectionView.answered`, per instance id
  // since 4.47). Nothing here reads the file for an answer.
  const view = resolved.model.sections(text).find((v) => v.id === id);
  if (!view) {
    notify.info(UNRECOGNISED);
    return false;
  }
  new ProseWindow(app, plugin, {
    file,
    text,
    model: resolved.model,
    view,
  }).open();
  return true;
}

interface ProseWindowSpec {
  file: TFile;
  text: string;
  model: SectionModel;
  view: SectionView;
}

class ProseWindow extends EditorModal {
  // What the reader has said in this sitting, and nothing they have not.
  //
  // TOUCHED KEYS ONLY, which is `SectionChoice.options`' whole contract:
  // `reconfigured` treats the presence of options as the signal that an answer
  // moved, and a window that handed back every box would ask the writer to
  // rewrite a marker nobody edited.
  private answers: Record<string, string | undefined> = {};
  private removing = false;

  constructor(
    app: App,
    plugin: ChronoAnvilPlugin,
    private spec: ProseWindowSpec
  ) {
    super(
      app,
      plugin,
      spec.view.label,
      `${spec.file.basename} — this block of writing, and what it opens with.`,
      "Save"
    );
  }

  private get questions(): readonly SectionQuestion[] {
    return this.spec.view.questions ?? [];
  }

  // What the control shows: what the reader has said, else what the marker
  // says, else nothing. `section-editor.ts::shownAnswer`'s rule with its
  // whole-file fallback removed — see the header.
  private shown(q: SectionQuestion): string {
    const held = this.answers[q.key];
    if (typeof held === "string") return held;
    return this.spec.view.answered?.[q.key] ?? "";
  }

  // Whether this question has anything to read or write on this block.
  //
  // THE MODEL'S ANSWER, AND ONLY IT. A prose question's answer lives on the
  // opening marker, so a block written before 5.6 marked where it starts has
  // nowhere to keep one — `answeredIn` supplies no key for it and the field
  // shows `settled` instead of a control the reader could press to no effect.
  private readable(q: SectionQuestion): boolean {
    return this.spec.view.answered?.[q.key] !== undefined;
  }

  private shows(q: SectionQuestion): boolean {
    const gate = q.shownWhen;
    if (!gate) return true;
    const by = this.questions.find((x) => x.key === gate.key);
    if (!by) return true;
    const value = this.shown(by);
    const now = by.kind === "flag" ? (value === FLAG_OFF ? FLAG_OFF : FLAG_ON) : value;
    return now === gate.is;
  }

  private answer(key: string, value: string | undefined): void {
    this.answers[key] = value;
    this.clearError();
  }

  protected renderBody(): void {
    const field = (q: SectionQuestion): HTMLElement => {
      const wrap = this.body.createDiv({ cls: "ca-tpl-field" });
      wrap.createSpan({ cls: "ca-tpl-field-label", text: fieldLabelOf(q) });
      return wrap;
    };

    for (const q of this.questions) {
      if (!this.shows(q)) continue;
      if (!this.readable(q)) {
        // THE LABEL STAYS, UNLIKE THE SECTION EDITOR'S VERSION, and the
        // difference is the shape of the two windows. There the sentence sits
        // in a row that already names the section and the question beside it;
        // here the form is a column of labelled fields, and a bare sentence in
        // the middle of one would be a refusal with nothing to say what it is
        // refusing.
        const note = field(q).createDiv({
          cls: "ca-tpl-choice-fixed",
          text: q.settled?.text ?? "set when added",
        });
        if (q.settled?.hint) note.title = q.settled.hint;
        continue;
      }
      if (q.kind === "title") this.renderTitle(field(q), q);
      else if (q.kind === "flag") this.renderFlag(field(q), q);
      else if (q.kind === "lines") this.renderLines(field(q), q);
    }

    this.renderRemoval();
  }

  // PLACEHOLDER, NEVER PRE-FILLED, which is the section editor's rule and the
  // same reason: empty means "the head this block would have anyway", and
  // seeding the box with it would write today's default into the marker as
  // though the reader had chosen it.
  private renderTitle(host: HTMLElement, q: TitleQuestion): void {
    const input = host.createEl("input", {
      type: "text",
      cls: "ca-tpl-title-input",
    });
    input.placeholder = q.placeholder;
    input.setAttribute("aria-label", `Set ${q.label}`);
    input.title = `Set ${q.label}. Leave empty for “${q.placeholder}”.`;
    input.value = this.shown(q);
    input.addEventListener("change", () => {
      this.answer(q.key, input.value.trim() || "");
    });
  }

  // TICKED MEANS ON, and the label says what ticking DOES — `renderFlagQuestion`
  // settled both and the box here reads the same way, because the reader meets
  // the two in the same vault an hour apart.
  private renderFlag(host: HTMLElement, q: FlagQuestion): void {
    const wrap = host.createDiv({ cls: "ca-tpl-form" });
    const box = wrap.createEl("input", {
      type: "checkbox",
      cls: "ca-tpl-form-box",
    });
    box.id = `ca-prose-flag-${q.key}`;
    const label = wrap.createEl("label", {
      cls: "ca-tpl-form-label",
      text: q.on,
    });
    label.htmlFor = box.id;
    box.checked = this.shown(q) !== FLAG_OFF;
    box.title = box.checked ? q.off : q.on;
    box.setAttribute("aria-label", q.on);
    box.addEventListener("change", () => {
      this.answer(q.key, box.checked ? FLAG_ON : FLAG_OFF);
      // A QUESTION THIS TICK HIDES TAKES ITS ANSWER WITH IT, for the editor's
      // reason: otherwise a reader who ticks, types headings and unticks again
      // has Save write a box they can no longer see.
      for (const dep of this.questions) {
        if (dep.shownWhen?.key === q.key && !this.shows(dep)) {
          this.answer(dep.key, undefined);
        }
      }
      this.refreshBody();
    });
  }

  private renderLines(host: HTMLElement, q: LinesQuestion): void {
    const box = host.createEl("textarea", { cls: "ca-tpl-lines" });
    box.rows = q.rows ?? 5;
    box.placeholder = q.placeholder;
    box.spellcheck = false;
    box.setAttribute("aria-label", `Set ${q.label}, one per line`);
    box.title = `Set ${q.label}, one per line. Leave empty for the default.`;
    box.value = this.shown(q);
    box.addEventListener("change", () => {
      const lines = box.value
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      this.answer(q.key, lines.length ? lines.join("\n") : undefined);
    });
  }

  // ── AND THE ONE THING THAT IS NOT AN ANSWER ──────────────────────────
  //
  // REMOVING THE BLOCK IS A TICK HERE AND NOT A BUTTON, so that this window
  // keeps one Save and one write. It is the same answer the section editor's
  // row gives — the id is simply left out of `want` — and the refusal that
  // governs it is the model's, asked of THIS block: the first prose block is
  // what a leaf note cannot be without, and the rest are the reader's.
  private renderRemoval(): void {
    const refusal = this.spec.model.refusal(this.spec.view.id, this.spec.text);
    const wrap = this.body.createDiv({ cls: "ca-tpl-field" });
    wrap.createSpan({ cls: "ca-tpl-field-label", text: "This block" });
    if (refusal) {
      const note = wrap.createDiv({ cls: "ca-tpl-choice-fixed", text: refusal });
      note.title = refusal;
      return;
    }
    const form = wrap.createDiv({ cls: "ca-tpl-form" });
    const box = form.createEl("input", {
      type: "checkbox",
      cls: "ca-tpl-form-box",
    });
    box.id = "ca-prose-remove";
    const label = form.createEl("label", {
      cls: "ca-tpl-form-label",
      text: "Remove this block",
    });
    label.htmlFor = box.id;
    box.checked = this.removing;
    box.setAttribute("aria-label", "Remove this block");
    box.addEventListener("change", () => {
      this.removing = box.checked;
      this.clearError();
      this.refreshBody();
    });
  }

  private touched(): boolean {
    return this.removing || Object.keys(this.answers).length > 0;
  }

  protected validate(): string | null {
    return this.touched() ? null : "Nothing to save.";
  }

  protected async commit(): Promise<void> {
    const current = await this.app.vault.read(this.spec.file);
    if (current !== this.spec.text) {
      notify.fail(
        "ChronoAnvil: this note changed while the window was open — nothing " +
          "was written. Reopen the cog to see it as it is now."
      );
      return;
    }

    const id = this.spec.view.id;
    // THE NOTE'S OWN SECTIONS, IN THE NOTE'S OWN ORDER, with this block's
    // answers attached to this block alone. Every other id goes back as a bare
    // string, which `reconfigured` reads as "nothing to say about it" — so the
    // write touches one marker and leaves the rest of the composition exactly
    // as the reader has it.
    const want = this.spec.model
      .present(current)
      .filter((each) => !(this.removing && each === id))
      .map((each) => (each === id ? { id: each, options: this.answers } : each));
    const next = this.spec.model.apply(current, want);
    if (next === null) {
      notify.info("ChronoAnvil: nothing to change — this block is as it was.");
      return;
    }
    await this.app.vault.modify(this.spec.file, next);
    notify.ok(
      this.removing
        ? `${this.spec.view.label} removed from ${this.spec.file.basename}`
        : `${this.spec.view.label} updated`
    );
  }
}
