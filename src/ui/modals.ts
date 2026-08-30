// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { App, Modal, Notice, Setting, SuggestModal } from "obsidian";

// A single-line text prompt. Resolves to the entered string, or null if
// the user cancels (Esc / clicking away / empty submit when not allowed).
class PromptModal extends Modal {
  private resolve!: (value: string | null) => void;
  private value: string;
  private submitted = false;

  constructor(
    app: App,
    private title: string,
    private placeholder: string,
    initial: string,
    private opts: PromptOptions = {}
  ) {
    super(app);
    this.value = initial;
  }

  openAndGetValue(resolve: (value: string | null) => void): void {
    this.resolve = resolve;
    this.open();
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.title });
    // A SENTENCE UNDER THE TITLE, where the caller has one to say. The folder
    // prompt needs to state what an empty field means, and a title long enough
    // to carry that is a title nobody reads.
    if (this.opts.description) {
      contentEl.createEl("p", {
        text: this.opts.description,
        cls: "setting-item-description",
      });
    }

    const input = contentEl.createEl("input", {
      type: "text",
      value: this.value,
    });
    input.placeholder = this.placeholder;
    input.style.width = "100%";
    input.style.marginBottom = "0.75em";
    // Type-ahead, where the caller has a list to offer. It attaches to the
    // input rather than replacing this modal with a suggester, so a reader can
    // still type an answer that is not in the list — which is the whole reason
    // 3.15 §3.1 wanted a field here instead of a menu.
    this.opts.attach?.(input, (picked) => this.submit(picked));
    input.focus();
    input.select();

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.submit(input.value);
      }
    });

    const btnRow = contentEl.createDiv({ cls: "modal-button-container" });
    const ok = btnRow.createEl("button", { text: "OK", cls: "mod-cta" });
    ok.addEventListener("click", () => this.submit(input.value));
    const cancel = btnRow.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
  }

  private submit(v: string): void {
    this.submitted = true;
    this.value = v;
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolve(this.submitted ? this.value : null);
  }
}

// What a prompt can be given beyond its four strings. Optional, and every
// existing caller passes none — the same shorthand `SectionWant` uses, for the
// same reason: the common case should not have to say at greater length what it
// was already saying.
export interface PromptOptions {
  // A sentence under the title, for a field whose EMPTY state means something.
  description?: string;
  // Hangs a suggester off the input. The callback is what a click on a
  // suggestion means — the value is taken and the prompt closes with it, so a
  // picked answer costs one gesture rather than pick-then-OK.
  attach?: (
    input: HTMLInputElement,
    onPick: (value: string) => void
  ) => void;
}

export function promptText(
  app: App,
  title: string,
  placeholder = "",
  initial = "",
  opts: PromptOptions = {}
): Promise<string | null> {
  return new Promise((resolve) => {
    new PromptModal(app, title, placeholder, initial, opts).openAndGetValue(
      resolve
    );
  });
}

// One template option offered in the "Layout" field below — the id selects
// which template file gets read, the label is what the dropdown shows.
//
// "LAYOUT" IS THE USER-FACING WORD for what the code calls a
// JournalTemplateVariant, and the two names are a wart worth admitting to
// rather than papering over. 2.54.7 shipped three words for one concept —
// "variant" in the code, "Template type" in this popup, "layout" in the docs —
// which is two too many for a thing a reader has to recognise in three places.
// The strings are unified; the type name is not, because renaming it touches
// six files for no behaviour and this comment is the whole of the mapping.
// If it ever grows a fourth name, rename the type instead of adding to this.
export interface TemplateChoice {
  id: string;
  label: string;
}

export interface NewNoteDetails {
  title: string;
  templateId: string;
  // Which layout this note's own PAGES are built from, when it can hold any.
  // Empty is the journal's page default — see `page-default.ts`, which owns
  // what that means and never learns there is a window.
  pageTemplateId: string;
}

// Everything the window asks. 4.50.
//
// AN OBJECT RATHER THAN SIX POSITIONAL ARGUMENTS. It took four and grew two,
// and `promptNewNote(app, heading, placeholder, templates, pageLabel, pages)`
// is a call nobody can read at the call site. The two callers are `newNote` and
// `newPage`, which is the other half of *"the new title/page dialogue"* — until
// this release that one was a bare `promptText` with no template field at all.
export interface NewNotePrompt {
  heading: string;
  titlePlaceholder: string;
  // What this note is built from. `label` names the surface — "Layout" on a
  // title, "Layout" on a page — and the rows are the surface's own list.
  layoutLabel: string;
  templates: TemplateChoice[];
  // Which row opens selected. Absent is the first, which is every default.
  templateId?: string;
  // What this note's PAGES are built from, for a kind that can hold them.
  //
  // ABSENT RATHER THAN EMPTY for a surface with no pages — a page has no pages,
  // and §1's argument for drawing a one-option field is an argument about a
  // PAIR, not about a field with nothing behind it at all.
  pages?: {
    label: string;
    templates: TemplateChoice[];
    templateId: string;
  };
}

// Title + what it is built from + what its pages are built from, all visible in
// one window. Used whenever a journal leaf note or page is created — folded
// into one modal rather than a title prompt followed by a separate template
// picker, the same "one window, every field visible" move the chart and event
// editors already make.
//
// ── EVERY FIELD IS DRAWN, INCLUDING AT ONE OPTION (4.50 §1) ──────────────
//
// The Layout field was gated on `templates.length > 1`, and the reason given was
// a real one: *"a required dropdown with one option labelled Generic on every
// new-note popup in the plugin — a control that looks like a decision and is
// not."*
//
// THAT ARGUMENT IS ABOUT A LONE DROPDOWN AND THIS IS A PAIR. Two fields side by
// side are not two decisions with one option each; they are the STATEMENT of
// what this note and its pages will be built from, and the second is a reader's
// only introduction to the idea that a title HAS a page default — which is the
// thing the `⋯` on its row then changes.
//
// AND HALF A PAIR IS WORSE THAN NEITHER HALF. Under the old gate, a journal with
// one title layout and two page layouts drew *Page layout* alone, and a reader
// could not tell whether *Layout* was missing because there was nothing to
// choose or because the plugin had chosen for them.
//
// What survives of 2.54.7 is the half about the WORD: the default row is named
// after the thing it makes ("Title", "⭐ Page default"), never "Generic", which
// read as a category nobody picked.
class NewNoteModal extends Modal {
  private resolve!: (value: NewNoteDetails | null) => void;
  private submitted = false;
  private title = "";
  private templateId: string;
  private pageTemplateId: string;

  constructor(app: App, private prompt: NewNotePrompt) {
    super(app);
    // The asked-for row where there is one, else the first — which is the
    // default on every list this window is given, because `pageLayoutChoices`
    // and `kind.templates` both put it there.
    this.templateId = prompt.templateId ?? prompt.templates[0]?.id ?? "";
    this.pageTemplateId = prompt.pages?.templateId ?? "";
  }

  openAndGetValue(resolve: (value: NewNoteDetails | null) => void): void {
    this.resolve = resolve;
    this.open();
  }

  onOpen(): void {
    const { contentEl, prompt } = this;
    contentEl.createEl("h3", { text: prompt.heading });

    new Setting(contentEl).setName("Title").addText((t) => {
      t.setPlaceholder(prompt.titlePlaceholder).onChange((v) => {
        this.title = v;
      });
      t.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.submit();
        }
      });
      window.setTimeout(() => t.inputEl.focus(), 0);
    });

    // Both fields, at every count — see the block above this class for why the
    // `length > 1` gate that used to be here is gone.
    this.dropdown(contentEl, prompt.layoutLabel, prompt.templates, this.templateId, (v) => {
      this.templateId = v;
    });
    if (prompt.pages) {
      this.dropdown(
        contentEl,
        prompt.pages.label,
        prompt.pages.templates,
        this.pageTemplateId,
        (v) => {
          this.pageTemplateId = v;
        }
      );
    }

    const btnRow = contentEl.createDiv({ cls: "modal-button-container" });
    const ok = btnRow.createEl("button", { text: "OK", cls: "mod-cta" });
    ok.addEventListener("click", () => this.submit());
    const cancel = btnRow.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
  }

  private dropdown(
    host: HTMLElement,
    name: string,
    rows: TemplateChoice[],
    value: string,
    onChange: (v: string) => void
  ): void {
    new Setting(host).setName(name).addDropdown((d) => {
      for (const choice of rows) d.addOption(choice.id, choice.label);
      d.setValue(value).onChange(onChange);
    });
  }

  private submit(): void {
    this.submitted = true;
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolve(
      this.submitted
        ? {
            title: this.title,
            templateId: this.templateId,
            // EMPTY WHERE THE SURFACE HAS NO PAGES, never the stale value of a
            // field that was not drawn. A caller reading this back writes it
            // into a note, and a page id on a kind that cannot hold pages is a
            // property nothing would ever read.
            pageTemplateId: this.prompt.pages ? this.pageTemplateId : "",
          }
        : null
    );
  }
}


// ── saving an arrangement under a name ────────────────────────────────
//
// What a layout is called, and which note kinds may be created from it.
// 3.18 follow-ups §5.
//
// ONE WINDOW, EVERY FIELD VISIBLE, which is the move `NewNoteModal` above
// already makes and for the same reason: the alternative here was a name prompt
// followed by a second modal asking about kinds, and a reader who cancels the
// second one has already committed to the first. Naming a layout and saying
// where it applies are two halves of one decision.
//
// THE KIND LIST IS HIDDEN AT ONE KIND, the rule the "Layout" dropdown above
// spells out: a control whose value cannot change spends a reader's attention
// and returns nothing. A journal with a single kind gets exactly the name prompt
// it had before this existed, which is what makes this additive rather than a
// new step in an old path.
//
// THE SAVING KIND IS TICKED AND CANNOT BE UNTICKED. A layout saved from a
// Lesson is a Lesson layout; letting it be saved applying to nothing would
// store a recipe nothing can cook, and letting it apply to Practice ALONE would
// silently move the arrangement off the note the reader is looking at. So the
// origin is fixed and the others are the opt-in.
export interface LayoutKindChoice {
  id: string;
  label: string;
}

export interface LayoutSaveDetails {
  label: string;
  kinds: string[];
}

class LayoutSaveModal extends Modal {
  private resolve!: (value: LayoutSaveDetails | null) => void;
  private submitted = false;
  private label = "";
  private picked: Set<string>;

  constructor(
    app: App,
    private heading: string,
    private placeholder: string,
    private kinds: LayoutKindChoice[],
    private originId: string
  ) {
    super(app);
    this.picked = new Set([originId]);
  }

  openAndGetValue(resolve: (value: LayoutSaveDetails | null) => void): void {
    this.resolve = resolve;
    this.open();
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.heading });

    new Setting(contentEl).setName("Name").addText((t) => {
      t.setPlaceholder(this.placeholder).onChange((v) => {
        this.label = v;
      });
      t.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          this.submit();
        }
      });
      window.setTimeout(() => t.inputEl.focus(), 0);
    });

    if (this.kinds.length > 1) {
      new Setting(contentEl)
        .setName("Available for")
        .setDesc(
          "Which kinds of note can be created from this layout. Each gets its own template file."
        );
      for (const kind of this.kinds) {
        const origin = kind.id === this.originId;
        new Setting(contentEl).setName(kind.label).addToggle((tg) => {
          tg.setValue(this.picked.has(kind.id));
          tg.setDisabled(origin);
          tg.onChange((v) => {
            if (v) this.picked.add(kind.id);
            else this.picked.delete(kind.id);
          });
        });
      }
    }

    const btnRow = contentEl.createDiv({ cls: "modal-button-container" });
    const ok = btnRow.createEl("button", { text: "Save", cls: "mod-cta" });
    ok.addEventListener("click", () => this.submit());
    const cancel = btnRow.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
  }

  private submit(): void {
    this.submitted = true;
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
    // The origin is re-added rather than trusted: a disabled toggle cannot be
    // turned off through the UI, and this is the invariant rather than the
    // control's behaviour.
    this.picked.add(this.originId);
    this.resolve(
      this.submitted
        ? { label: this.label, kinds: [...this.picked] }
        : null
    );
  }
}

export function promptLayoutSave(
  app: App,
  heading: string,
  placeholder: string,
  kinds: LayoutKindChoice[],
  originId: string
): Promise<LayoutSaveDetails | null> {
  return new Promise((resolve) => {
    new LayoutSaveModal(
      app,
      heading,
      placeholder,
      kinds,
      originId
    ).openAndGetValue(resolve);
  });
}


// ── renaming a note type from its heading ─────────────────────────────
//
// "Lessons" became "Seminars" on one dashboard. The note type is still Lesson,
// so the button under it still says New Lesson. 3.20.
//
// WHY IT IS ASKED AND NOT INFERRED. Three reasons, and any one is enough:
//
//   THE PLURAL DOES NOT INVERT. The heading is `kindPlural(kind)`; the type's
//   own name is the singular. `singularGuess` is a guess and says so — the
//   pluraliser is already wrong often enough to need a stored override, and
//   backwards is harder still. A field the reader confirms costs one glance; a
//   silent derivation costs a journal-wide rename to a word nobody typed.
//
//   THE SCOPE IS DIFFERENT BY AN ORDER OF MAGNITUDE. Renaming a heading edits
//   one line in one note. Renaming a note type changes every dashboard in the
//   journal, every create button, every command and every empty state. A
//   note-local gesture must not silently perform a journal-global write — that
//   is the guarantee the whole section-editing subsystem is built on.
//
//   A ONE-WAY BINDING IS WORSE THAN NONE. Headings already written into notes
//   are the reader's text and are never rewritten unasked, so a type rename
//   cannot propagate back down. If heading→type wrote silently, the two would
//   agree in one direction only, which is the "two records of one arrangement"
//   failure this codebase keeps naming.
//
// SO THE READER IS TOLD WHAT EACH BUTTON COSTS AND PICKS. "Just this heading"
// is the 3.19.0 behaviour and a legitimate answer — a per-note heading override
// is an established concept (`SectionOverrides.fields`). "Rename the note type"
// goes through the ordinary relabel, which preserves the kind's id, so no note
// is declassified and no template file is orphaned.
export interface KindRenameChoice {
  scope: "heading" | "kind";
  label: string;
}

class KindRenameModal extends Modal {
  private resolve!: (value: KindRenameChoice | null) => void;
  private picked: KindRenameChoice | null = null;
  private label: string;

  constructor(
    app: App,
    private heading: string,
    private kindLabel: string,
    guess: string
  ) {
    super(app);
    this.label = guess;
  }

  openAndGetValue(resolve: (value: KindRenameChoice | null) => void): void {
    this.resolve = resolve;
    this.open();
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: "Rename the note type too?" });

    const p = contentEl.createEl("p", { cls: "ca-modal-note" });
    p.appendText("“");
    p.createEl("strong", { text: this.heading });
    p.appendText("” is the heading for the ");
    p.createEl("strong", { text: this.kindLabel });
    p.appendText(
      " note type. Renaming just the heading changes it on this note only — the button below it, its commands, and every other dashboard keep the old name."
    );

    new Setting(contentEl)
      .setName("Note type name")
      .setDesc(
        "The singular, as it appears on buttons: “New …”. Check it — this is a guess from the heading."
      )
      .addText((t) => {
        t.setValue(this.label).onChange((v) => {
          this.label = v;
        });
        t.inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            this.pick("kind");
          }
        });
        window.setTimeout(() => {
          t.inputEl.focus();
          t.inputEl.select();
        }, 0);
      });

    const btnRow = contentEl.createDiv({ cls: "modal-button-container" });
    const only = btnRow.createEl("button", { text: "Just this heading" });
    only.addEventListener("click", () => this.pick("heading"));
    const both = btnRow.createEl("button", {
      text: "Rename the note type",
      cls: "mod-cta",
    });
    both.addEventListener("click", () => this.pick("kind"));
  }

  private pick(scope: "heading" | "kind"): void {
    const label = this.label.trim();
    // An empty name is not a decision, and the CTA is where a reader lands on
    // Enter — so it refuses rather than renaming the type to nothing.
    if (scope === "kind" && !label) {
      new Notice("Give the note type a name, or choose “Just this heading”.");
      return;
    }
    this.picked = { scope, label };
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
    // CLOSING IS "JUST THIS HEADING", NOT A CANCEL. The heading rename has
    // already been committed by the time this opens — this window is only ever
    // about the SECOND, larger write. Treating dismissal as a cancel would
    // imply it had undone the first, which it cannot and must not.
    this.resolve(this.picked ?? { scope: "heading", label: "" });
  }
}

export function promptKindRename(
  app: App,
  heading: string,
  kindLabel: string,
  guess: string
): Promise<KindRenameChoice | null> {
  return new Promise((resolve) => {
    new KindRenameModal(app, heading, kindLabel, guess).openAndGetValue(resolve);
  });
}

export function promptNewNote(
  app: App,
  prompt: NewNotePrompt
): Promise<NewNoteDetails | null> {
  return new Promise((resolve) => {
    new NewNoteModal(app, prompt).openAndGetValue(resolve);
  });
}

// A yes/no confirmation. Resolves true only if the confirm button is pressed —
// Esc, clicking away and Cancel all resolve false, so a destructive caller
// can treat "anything but an explicit yes" as a no.
class ConfirmModal extends Modal {
  private confirmed = false;

  constructor(
    app: App,
    private title: string,
    private message: string,
    private confirmLabel: string,
    private destructive: boolean,
    private resolve: (ok: boolean) => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.title });
    contentEl.createEl("p", { text: this.message });

    const btnRow = contentEl.createDiv({ cls: "modal-button-container" });
    const ok = btnRow.createEl("button", {
      text: this.confirmLabel,
      cls: this.destructive ? "mod-warning" : "mod-cta",
    });
    ok.addEventListener("click", () => {
      this.confirmed = true;
      this.close();
    });
    const cancel = btnRow.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    cancel.focus();
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolve(this.confirmed);
  }
}

// A confirmation with more than one way to say yes. 4.50.2.
//
// ── WHY `confirmAction` COULD NOT ANSWER THIS ────────────────────────────
//
// *Move to bin* on a title with pages is not one question with a yes and a no.
// It is *"the note and its pages, or just the pages?"* — two affirmative
// answers, and a reader who has to pick between them BEFORE opening the dialogue
// is picking without having read what either one takes.
//
// 4.50 shipped it as two menu rows and it was reported as clutter: two entries
// whose difference is a scope, sitting under a menu whose other rows are a
// single list. **The choice belongs where the consequence is described**, which
// is the same move 4.48 made putting a control on the thing it changes.
//
// ── A SECOND MODAL, NOT A FLAG ON THE FIRST ──────────────────────────────
//
// `ConfirmModal` resolves a BOOLEAN, and every one of its two dozen callers
// reads that boolean. Widening it to return a string would make each of them
// answer a question it does not have. This one resolves the value of the button
// pressed, and dismissal — Esc, clicking away, Cancel — is `null`, so a caller
// can still treat "anything but an explicit choice" as a no.
export interface ActionChoice {
  // What the caller gets back. Its own vocabulary, not this file's.
  value: string;
  label: string;
  // Paints it `mod-cta`. At most one, and it is the answer a reader who is not
  // reading wants — never the wider-reaching of two.
  cta?: boolean;
}

class ActionModal extends Modal {
  private picked: string | null = null;

  constructor(
    app: App,
    private title: string,
    private message: string,
    private choices: ActionChoice[],
    private resolve: (value: string | null) => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.title });
    contentEl.createEl("p", { text: this.message });

    const btnRow = contentEl.createDiv({ cls: "modal-button-container" });
    // CANCEL FIRST AND FOCUSED, which is `ConfirmModal`'s arrangement and its
    // reason: a reader who presses Enter on a window they have not read has not
    // agreed to anything.
    const cancel = btnRow.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    for (const choice of this.choices) {
      const b = btnRow.createEl("button", {
        text: choice.label,
        ...(choice.cta ? { cls: "mod-cta" } : {}),
      });
      b.addEventListener("click", () => {
        this.picked = choice.value;
        this.close();
      });
    }
    cancel.focus();
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolve(this.picked);
  }
}

export function promptAction(
  app: App,
  title: string,
  message: string,
  choices: ActionChoice[]
): Promise<string | null> {
  return new Promise((resolve) => {
    new ActionModal(app, title, message, choices, resolve).open();
  });
}

export function confirmAction(
  app: App,
  title: string,
  message: string,
  confirmLabel = "Confirm",
  destructive = false
): Promise<boolean> {
  return new Promise((resolve) => {
    new ConfirmModal(
      app,
      title,
      message,
      confirmLabel,
      destructive,
      resolve
    ).open();
  });
}

// A fuzzy picker over a fixed list of string choices.
//
// `display` lets a caller hand in rows that are unique without being what the
// reader should see — promptChoice tags each row with its index so two
// identically-labelled items stay distinguishable. Absent, a row is its own
// label, which is every other caller.
class ChoiceModal extends SuggestModal<string> {
  private resolved = false;

  constructor(
    app: App,
    private choices: string[],
    prompt: string,
    private resolve: (value: string | null) => void,
    private display: (row: string) => string = (row) => row
  ) {
    super(app);
    this.setPlaceholder(prompt);
  }

  getSuggestions(query: string): string[] {
    const q = query.toLowerCase();
    // Filtered on what is shown, not on the raw row: matching the index tag
    // would let "3" find an unrelated entry.
    return this.choices.filter((c) =>
      this.display(c).toLowerCase().includes(q)
    );
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    el.setText(this.display(value));
  }

  onChooseSuggestion(value: string): void {
    this.resolved = true;
    this.resolve(value);
  }

  onClose(): void {
    // If nothing was chosen, resolve null once the modal closes.
    window.setTimeout(() => {
      if (!this.resolved) this.resolve(null);
    }, 0);
  }
}

// A suggester whose rows carry a second line.
//
// ChoiceModal's rows are bare strings, which is right for picking a subject or
// a tracker — the name is the whole of what there is to know. A section is
// not: "Recall cards" means nothing without "question-and-answer cards;
// grading writes this note's rating", and that blurb is a field on the section
// precisely so the picker and the wizard's schematic describe it the same way.
export interface DetailedChoice {
  value: string;
  label: string;
  description: string;
  // Which run of the list this belongs to, drawn as a heading over the first
  // row that carries it. 4.15 §3.
  //
  // ABSENT IS THE UNGROUPED LIST, which is every caller but one and is drawn
  // exactly as it was before this field existed — the same posture `group` and
  // `movable` take on `SectionView`.
  //
  // A RUN, NOT A KEY. The heading is drawn where the value CHANGES rather than
  // for each distinct string, so the caller's order is what makes a group and
  // this modal never sorts. That matters because the order is an argument:
  // `renderAdd` puts the page's own sections above the widgets so a list of
  // twenty-eight does not bury the two the page was designed around, and a
  // modal that regrouped would be overruling it.
  group?: string;
}

class DetailedChoiceModal extends SuggestModal<DetailedChoice> {
  private resolved = false;
  // What the last query left on screen, so a row can ask whether it opens a
  // run. `renderSuggestion` is handed a value and not an index, and the
  // filtered list is the only thing that knows which rows are adjacent — the
  // groups shift as a reader types, which is correct: a heading over a run that
  // the query has emptied would be a label for nothing.
  private shown: DetailedChoice[] = [];

  constructor(
    app: App,
    private choices: DetailedChoice[],
    prompt: string,
    private resolve: (value: string | null) => void
  ) {
    super(app);
    this.setPlaceholder(prompt);
  }

  getSuggestions(query: string): DetailedChoice[] {
    const q = query.toLowerCase();
    // Descriptions are searched as well as labels, so "search" finds Find and
    // "heatmap" finds Progress. A reader looking for a widget knows what it
    // does more reliably than what this catalogue decided to call it.
    this.shown = this.choices.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
    );
    return this.shown;
  }

  renderSuggestion(value: DetailedChoice, el: HTMLElement): void {
    el.addClass("ca-choice-detailed");
    // The heading goes BESIDE the row, not inside it — 4.16, and this is a bug
    // fix for how 4.15 §3 shipped it.
    //
    // WHAT WENT WRONG, AND IT WAS VISIBLE IN THE FIRST RENDER. The heading was
    // built as a child of the suggestion, on the reasoning that a child "is what
    // the modal's own markup allows". A suggestion is one element and Obsidian
    // paints the hover and the keyboard selection onto that element — so the
    // heading was inside the highlight, and *Widgets* lit up as part of *Diary
    // search* and was clickable as it. A label for the twenty rows below it was
    // drawn as though it belonged to the one row after it.
    //
    // A SIBLING IS BOTH FIXES AT ONCE. It is outside the highlight because it is
    // outside the element, and it is unselectable because Obsidian tracks the
    // items it created rather than counting the container's children — a plain
    // div among them takes no click handler and no place in the keyboard walk.
    //
    // FALLS BACK TO THE CHILD, because `renderSuggestion` promises nothing about
    // whether the item is in the tree yet. Where it is not, a heading inside the
    // row is still better than no heading at all — that is the shipped behaviour
    // this replaces, and it is the wrong-looking one rather than the broken one.
    const at = this.shown.indexOf(value);
    if (value.group && (at <= 0 || this.shown[at - 1]?.group !== value.group)) {
      const head = createDiv({ cls: "ca-choice-group", text: value.group });
      if (el.parentElement) el.parentElement.insertBefore(head, el);
      else el.prepend(head);
    }
    el.createDiv({ cls: "ca-choice-label", text: value.label });
    el.createDiv({ cls: "ca-choice-desc", text: value.description });
  }

  onChooseSuggestion(value: DetailedChoice): void {
    this.resolved = true;
    this.resolve(value.value);
  }

  onClose(): void {
    window.setTimeout(() => {
      if (!this.resolved) this.resolve(null);
    }, 0);
  }
}

export function promptDetailedSuggester(
  app: App,
  choices: DetailedChoice[],
  prompt: string
): Promise<string | null> {
  return new Promise((resolve) => {
    new DetailedChoiceModal(app, choices, prompt, resolve).open();
  });
}

// ── asking only when there is something to ask ────────────────────────
//
// A control whose value cannot change is worse than no control: it spends a
// reader's attention and returns nothing, and it teaches that there is a
// decision here where there is none. 2.54.7 found a required "Template type"
// dropdown with exactly one option, labelled "Generic", on every new-note popup
// in the plugin — it had been there for releases.
//
// The rule was already known and applied three separate ways with three
// separate inline arguments: charts-manager short-circuits its picker at one
// spec, chart-ui.ts guards its scope dropdown with "Only a question when there
// are two answers", and modals.ts hid the layout field at one layout. Naming
// it once is most of the value here; the rest is the places that missed it.
//
// AND ONE OF THE THREE WAS RIGHT ABOUT A LONE CONTROL AND WRONG ABOUT A PAIR
// (4.50). `NewNoteModal` draws its layout field at one option now, because the
// field is no longer only a choice — beside *Page layout* it is the STATEMENT
// of what this note and its pages are built from, and the reader's only
// introduction to the fact that a title has a page default at all. A dropdown
// that says something true when it cannot be changed is not the control this
// rule is about. The block above that class makes the case at length.
//
// BUT NOT EVERYWHERE, and this is the part a blanket rule gets wrong.
// Auto-selecting the only option is right when the option is INCIDENTAL to what
// the reader asked for, and wrong when it IS what they asked for:
//
//   RIGHT — "Create the note in which folder?" with one folder. The reader
//   asked to create a note; the folder is bookkeeping, and a dialog offering
//   one answer is a keystroke charged for nothing.
//
//   WRONG — "Remove which tracker from this entry?" with one tracker.
//   Auto-firing there performs a destructive act the reader never confirmed,
//   and "there was only one" is not consent.
//
//   WRONG — "Add which section to this note?" with one section. The section is
//   the substance of the request, not its bookkeeping. Auto-picking writes a
//   block the reader was never shown the name of.
//
// So: `only` for the incidental case, and a comment at each site that keeps its
// picker explaining which of the two it is. A helper that could not tell them
// apart would have made the destructive case a one-line mistake.
export function only<T>(items: T[]): T | null {
  return items.length === 1 ? items[0] : null;
}

export function promptSuggester(
  app: App,
  choices: string[],
  prompt: string
): Promise<string | null> {
  return new Promise((resolve) => {
    new ChoiceModal(app, choices, prompt, resolve).open();
  });
}

// Pick one of `items`, described by `label`, and get the ITEM back.
//
// promptSuggester resolves to the label it showed, which leaves every caller
// holding a string it has to map back to the thing it meant — invariably as
// `items[labels.indexOf(chosen)]`. That is correct exactly while no two labels
// match, and four callers had labels that could:
//
//   two charts of one tracker with the same shape and no title describe
//   identically, and a subject page carrying the trend and the ranking of one
//   tracker is the documented common case;
//   two trackers may share a display label, and both may sit on one entry.
//
// indexOf then returns the first match, so the second chart or tracker is
// unreachable — Edit… always opens the first and Remove… always takes the
// first, however many times you pick the other one. Nothing errors; the wrong
// object is simply the one that moves.
//
// Returning the item removes the lookup rather than fixing it. The labels stay
// free to collide, because they no longer have to be unique to be correct.
export function promptChoice<T>(
  app: App,
  items: T[],
  label: (item: T) => string,
  prompt: string
): Promise<T | null> {
  // Index-tagged so the modal's own strings are unique even when the labels
  // are not: ChoiceModal resolves by value, and two identical entries in its
  // list would put us back where we started. The tag is stripped for display.
  const rows = items.map((item, i) => `${i}\u0000${label(item)}`);
  return new Promise((resolve) => {
    new ChoiceModal(
      app,
      rows,
      prompt,
      (picked) => {
        if (picked == null) return resolve(null);
        const at = Number(picked.slice(0, picked.indexOf("\u0000")));
        resolve(Number.isInteger(at) && items[at] !== undefined ? items[at] : null);
      },
      (row) => row.slice(row.indexOf("\u0000") + 1)
    ).open();
  });
}

// A confirmation whose message IS a plan: notes on the left, one line per
// change under each.
//
// WHY NOT `confirmAction` WITH A JOINED STRING (3.13 §9.3). The property that
// makes a repair preview trustworthy is that it cannot drift from the repair,
// *because it is the repair minus the write*. That survives only if the dialog
// renders the same structure the plan is computed in — a `LayoutChange[]`
// grouped by note, one line per op — rather than a sentence summarising it. A
// summary is a second description of the same facts, which is the shape this
// release spent §7 removing.
//
// Cancel is the default and every dismissal declines: Esc, the backdrop and the
// close button all resolve false, and the confirm button is never focused.
class PlanModal extends Modal {
  private confirmed = false;

  constructor(
    app: App,
    private title: string,
    private lead: string,
    private groups: { label: string; lines: string[] }[],
    private confirmLabel: string,
    private resolve: (ok: boolean) => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.title });
    contentEl.createEl("p", { text: this.lead });

    const list = contentEl.createDiv({ cls: "ca-plan" });
    for (const g of this.groups) {
      const group = list.createDiv({ cls: "ca-plan-note" });
      group.createDiv({ cls: "ca-plan-name", text: g.label });
      const ul = group.createEl("ul", { cls: "ca-plan-ops" });
      for (const line of g.lines) ul.createEl("li", { text: line });
    }

    const btnRow = contentEl.createDiv({ cls: "modal-button-container" });
    const ok = btnRow.createEl("button", {
      text: this.confirmLabel,
      cls: "mod-warning",
    });
    ok.addEventListener("click", () => {
      this.confirmed = true;
      this.close();
    });
    const cancel = btnRow.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    cancel.focus();
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolve(this.confirmed);
  }
}

export function confirmPlan(
  app: App,
  title: string,
  lead: string,
  groups: { label: string; lines: string[] }[],
  confirmLabel = "Go ahead"
): Promise<boolean> {
  return new Promise((resolve) => {
    new PlanModal(app, title, lead, groups, confirmLabel, resolve).open();
  });
}

// ── Emoji Picker Modal ──────────────────────────────────────────────────
export class EmojiPickerModal extends Modal {
  private resolve: (value: string | null) => void = () => {};
  private current: string;

  constructor(app: App, current: string) {
    super(app);
    this.current = current || "🗒️";
  }

  openAndGetValue(resolve: (value: string | null) => void): void {
    this.resolve = resolve;
    this.open();
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("ca-emoji-modal");

    contentEl.createEl("h3", { text: "Choose an icon" });

    new Setting(contentEl)
      .setName("Custom icon")
      .setDesc("Type or paste any emoji or symbol")
      .addText((t) => {
        t.setValue(this.current);
        t.inputEl.addClass("ca-emoji-input");
        t.inputEl.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            const val = t.getValue().trim();
            this.resolve(val || this.current);
            this.close();
          }
        });
      })
      .addButton((b) =>
        b.setButtonText("Save").setCta().onClick(() => {
          const input = contentEl.querySelector(".ca-emoji-input") as HTMLInputElement;
          const val = input?.value?.trim();
          this.resolve(val || this.current);
          this.close();
        })
      );

    const categories: { label: string; emojis: string[] }[] = [
      {
        label: "Productivity & Work",
        emojis: [
          "💼", "🎯", "🔗", "📅", "🗒️", "💡", "🚀", "📚",
          "📝", "⚡", "📌", "🏷️", "📊", "📋", "🛠️", "🔍"
        ],
      },
      {
        label: "Personal & Lifestyle",
        emojis: [
          "☕", "✨", "🧘", "🩺", "💰", "🏃", "🏆", "🎨",
          "⏱️", "⭐", "🌿", "🍎", "🏠", "✈️", "🎧", "💬"
        ],
      },
    ];

    for (const cat of categories) {
      contentEl.createDiv({ cls: "ca-emoji-cat-title", text: cat.label });
      const grid = contentEl.createDiv({ cls: "ca-emoji-grid" });
      for (const emoji of cat.emojis) {
        const btn = grid.createEl("button", {
          cls: "ca-emoji-tile",
          text: emoji,
        });
        if (emoji === this.current) btn.addClass("is-selected");
        btn.addEventListener("click", () => {
          this.resolve(emoji);
          this.close();
        });
      }
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export function promptEmoji(app: App, current = "🗒️"): Promise<string | null> {
  return new Promise((resolve) => {
    new EmojiPickerModal(app, current).openAndGetValue(resolve);
  });
}
