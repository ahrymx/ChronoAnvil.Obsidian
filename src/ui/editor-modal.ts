// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The shared editor-modal chrome.
//
// Every list-managed thing in ChronoAnvil — a tracker, a journal type, a chart —
// is edited in a window of the same shape: a title, an optional subtitle, a
// body of fields that some of those fields re-render, an error line, and a
// Cancel/Save footer where Save is the CTA and Enter submits.
//
// It lives in a module of its own rather than beside the first editor that
// needed it, because the chart editor is the third one to want it and the
// second one to have been written without it. Importing the frame from
// settings-editors.ts would have dragged the journal-type wizard's whole
// dependency graph — journal, custom-journal, journal-sections — into
// chart-ui.ts for the sake of a base class that knows about none of them.
//
// Since 2.55.5 it holds two frames rather than one. `EditorModal` is the
// single page; `SteppedEditorModal` below is the same window with a rail, a
// Back/Next footer and per-step validation. Three editors are stepped now
// (journal, tracker, chart) and they live in two modules that cannot import
// each other, which is the whole argument for the second class being here.

import { App, Modal } from "obsidian";
import type ChronoAnvilPlugin from "../main";

// Why a save was refused, and — where there is one — the thing that would fix it.
//
// A STRING IS STILL A PROBLEM (4.17 §1), which is the whole shape of this: every
// `validate()` in the plugin returns one today, four independent modal families
// implement it, and none of them changes. Widening the RETURN type reaches all
// of them at once; threading a second method through would have to visit each,
// and would leave two ways to say the same thing for the ones it never reached.
//
// AND THERE IS NO SECOND `validate()`. The tempting shape is `validate()` for
// the string and `validateRich()` for the action, defaulting to wrapping the
// first — a gate behind a gate, and the house rule against it exists because the
// two always end up disagreeing about which is authoritative.
//
// WHAT AN ACTION IS FOR: a refusal the reader cannot act on from where they are
// standing. The case this was built for is a journal wizard blocked by a
// registration whose folder no longer exists — the fix is one button and is
// otherwise four clicks away in another window, behind the wizard that is
// refusing. It is NOT for "here is a shortcut": an action that a reader could
// plausibly not want is a decision, and a refusal is the wrong place to ask for
// one.
export type ValidationProblem =
  | string
  | {
      message: string;
      // Runs, then re-submits. See `showError`.
      action?: { label: string; run: () => Promise<void> };
    };

export abstract class EditorModal extends Modal {
  protected body!: HTMLElement;
  private errorEl: HTMLElement | null = null;
  private footerEl: HTMLElement | null = null;
  private headEl: HTMLElement | null = null;

  // The strings this window was CONSTRUCTED with, readable directly.
  //
  // `protected readonly`, not private, and this is the fix for a real bug
  // rather than a convenience. A stepped subclass needs the constructed
  // subtitle for a step that has no subtitle of its own, and the only way to
  // reach it used to be `super.subtitleText()` — a call through a method the
  // subclass had itself overridden. In 2.54.5 that closed a loop (stepList →
  // super.subtitleText → the override → stepList) and the Edit window opened
  // blank, because the RangeError landed inside onOpen before the heading,
  // the body or the footer existed. A field cannot be overridden, so reading
  // one cannot recurse; the trap is gone rather than commented.
  constructor(
    app: App,
    protected plugin: ChronoAnvilPlugin,
    protected readonly baseHeading: string,
    protected readonly baseSubtitle: string,
    protected readonly saveLabel: string
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.addClass("ca-editor-modal");

    this.headEl = contentEl.createDiv({ cls: "ca-editor-head" });
    this.renderHead();

    this.body = contentEl.createDiv({ cls: "ca-editor-body" });
    this.renderBody();

    this.errorEl = contentEl.createDiv({ cls: "ca-editor-error" });
    this.errorEl.hide();

    this.footerEl = contentEl.createDiv({ cls: "ca-editor-footer" });
    this.renderFooter(this.footerEl);

    // Enter submits, but only from a single-line text field. Deliberately
    // narrow: a textarea needs Enter for newlines (emoji maps, note kinds),
    // and a <button> or <select> already has its own Enter behaviour — so
    // Enter on Cancel must cancel, not save.
    contentEl.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const target = e.target;
      if (!(target instanceof HTMLInputElement)) return;
      // Checkboxes and radios use Enter/Space for their own toggling; every
      // other input here is a single-line text field. Testing for what to
      // *exclude* rather than for type === "text" keeps this working whether
      // or not Obsidian's TextComponent sets an explicit type attribute.
      if (target.type === "checkbox" || target.type === "radio") return;
      e.preventDefault();
      void this.onEnterKey();
    });
  }

  private renderHead(): void {
    const head = this.headEl;
    if (!head) return;
    head.empty();
    head.createEl("h3", { text: this.headingText() });
    const sub = this.subtitleText();
    if (sub) {
      head.createEl("p", { cls: "ca-editor-subtitle", text: sub });
    }
    this.decorateHead(head);
  }

  // Overridable so a stepped modal can retitle itself as it advances. The
  // stored strings stay the default, which is what the other two editors use.
  protected headingText(): string {
    return this.baseHeading;
  }
  protected subtitleText(): string {
    return this.baseSubtitle;
  }
  // A hook for chrome that belongs above the fields (the wizard's step rail).
  protected decorateHead(_head: HTMLElement): void {}

  // The default footer: Cancel, then the save CTA. Overridden by the wizard,
  // which needs Back/Next as well and a CTA whose label changes per step.
  protected renderFooter(footer: HTMLElement): void {
    const cancel = footer.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());
    const save = footer.createEl("button", {
      text: this.saveLabel,
      cls: "mod-cta",
    });
    save.addEventListener("click", () => void this.trySubmit());
  }

  // What Enter in a text field does. Submitting is right for a one-page form;
  // the wizard overrides it to advance instead, because Enter on the first
  // field of a four-step flow should not create the journal.
  protected async onEnterKey(): Promise<void> {
    await this.trySubmit();
  }

  // Re-render just the fields, keeping the frame. Used when a field changes
  // which other fields apply (a tracker's type, a journal's depth) — the old
  // inline version had to redraw the entire settings tab for this.
  protected refreshBody(): void {
    this.body.empty();
    this.renderBody();
  }

  // Re-render the head alone — the title, the subtitle and the step rail.
  //
  // Narrower than refreshFrame on purpose. A stepped window can change how
  // many steps it has without changing which one you are on (pick a tracker
  // type with nothing to configure and the middle step goes away), and the
  // only thing on screen that is wrong afterwards is the rail. Redrawing the
  // body for it would rebuild the field the reader is standing in, which is
  // how the flat form used to snatch focus back to the Label on every type
  // change.
  protected refreshHead(): void {
    this.renderHead();
  }

  // Re-render the frame around the fields too. Only the wizard needs this: a
  // step change moves the title, the rail and the footer buttons at once.
  protected refreshFrame(): void {
    this.renderHead();
    this.clearError();
    if (this.footerEl) {
      this.footerEl.empty();
      this.renderFooter(this.footerEl);
    }
    this.refreshBody();
  }

  protected showError(problem: ValidationProblem): void {
    if (!this.errorEl) return;
    const { message, action } =
      typeof problem === "string" ? { message: problem, action: undefined } : problem;
    this.errorEl.empty();
    this.errorEl.createDiv({ cls: "ca-editor-error-text", text: message });
    this.errorEl.show();
    if (!action) return;

    // THE ACTION RE-SUBMITS, and that is what makes it a fix rather than an
    // errand. A button that resolves the refusal and leaves the reader looking
    // at the same red line has not finished the job it was drawn for — the
    // reader pressed it because they wanted the thing they had already asked
    // for. If something ELSE is wrong, the next refusal says so, which is the
    // form working normally rather than a case anybody has to write.
    const btn = this.errorEl.createEl("button", {
      text: action.label,
      cls: "ca-editor-error-action",
    });
    btn.addEventListener("click", () => {
      void (async () => {
        // DISABLED FIRST. This runs a write and then a save; a second click
        // while the first is in flight would delete a journal that is already
        // gone and then refuse for a reason nobody could act on.
        btn.disabled = true;
        try {
          await action.run();
        } catch (err) {
          console.error("ChronoAnvil: error action failed", err);
          this.showError(this.commitFailureMessage());
          return;
        }
        this.clearError();
        await this.trySubmit();
      })();
    });
  }

  protected clearError(): void {
    this.errorEl?.hide();
  }

  protected async trySubmit(): Promise<void> {
    const problem = this.validate();
    if (problem) {
      this.showError(problem);
      return;
    }
    // A commit that throws leaves the window OPEN with the message in its own
    // error line, rather than rejecting into nothing.
    //
    // Until 2.56.12 the await was bare, so a failed write produced an unhandled
    // rejection — every call site is `void this.trySubmit()` — and a window that
    // simply sat there having apparently done nothing. `validate()` guards what
    // the form can know; this guards what it cannot, which is everything on the
    // other side of the write: a file gone, a folder read-only, a vault
    // mid-sync. The text the reader typed is still on screen either way, and
    // that is the part that matters.
    try {
      await this.commit();
    } catch (err) {
      console.error("ChronoAnvil: save failed", err);
      this.showError(this.commitFailureMessage());
      return;
    }
    this.close();
  }

  // Overridable because a window that knows what it was writing can say so.
  protected commitFailureMessage(): string {
    return "Couldn't save — nothing was written, and what you typed is still here.";
  }

  onClose(): void {
    this.contentEl.empty();
  }

  protected abstract renderBody(): void;
  // Return a message to block the save, or null to allow it. A message may
  // carry the action that would clear it — see `ValidationProblem`.
  protected abstract validate(): ValidationProblem | null;
  protected abstract commit(): Promise<void>;
}

// ── The stepped variant ────────────────────────────────────────────────────
//
// WHY THIS IS HERE AND NOT IN settings-editors.ts
//
// The 2.55 plan said both new wizards could "reuse EditorModal's step
// machinery, which 2.54.5 already generalised — showsSteps exists, the rail
// exists, Back/Next exists". Every one of those did exist. None of them were
// in EditorModal: they were private members of JournalEditModal, five hundred
// lines inside settings-editors.ts, and the chart editor lives in a module
// that deliberately cannot import that file (see the header above — importing
// the frame from settings-editors.ts would drag journal, custom-journal and
// journal-sections into chart-ui.ts for the sake of a base class that knows
// about none of them).
//
// So the choice was to copy the rail, the footer and the step arithmetic into
// two more files, or to lift them one module down to where the frame already
// lives. 2.55.4 had just finished paying for the first option: `createListRow`
// was defined inside settings-editors.ts, the template editor could not import
// it back, and it grew its own rows that looked different one click away. A
// wizard rail is a smaller thing to duplicate and would have gone the same way.
//
// WHAT A SUBCLASS OWES
//
// `stepList()`, and nothing else. Everything below is derived from it: the
// heading, the subtitle, the rail, which buttons the footer draws, what Enter
// does, and where Back goes. A step that should not be drawn should not be in
// the list — the chrome counts what it is given rather than being told
// separately, which is the coupling that blanked the Edit window once already.
export interface WizardStep {
  title: string;
  subtitle: string;
  render: (host: HTMLElement) => void;
  // Blocks Next. Per-step so the flow complains about the field in front of
  // you rather than about one three steps back.
  validate?: () => ValidationProblem | null;
}

export abstract class SteppedEditorModal extends EditorModal {
  // Protected so a regression test can advance to a step and ask what the
  // window would draw. That test is the only cover the blank-window bug has,
  // and it is worth more than the visibility.
  protected step = 0;

  protected abstract stepList(): WizardStep[];

  // Whether the wizard chrome is on: the step rail, the Back/Next footer and
  // the per-step head strings.
  //
  // Phrased as "is there more than one page", which is the question, and which
  // JournalEditModal spent two releases NOT daring to phrase this way — asking
  // it made the chrome depend on the step list while the step list depended on
  // the chrome. That cycle is gone: a step list may read `baseSubtitle`, which
  // is a field, and a field cannot call back into an override. Overridable for
  // the one case that is neither a form nor a flow — see ChartEditModal, which
  // has a single step when the vault holds nothing chartable.
  protected get showsSteps(): boolean {
    return this.stepList().length > 1;
  }

  // Whether Save is offered before the last step.
  //
  // FALSE for something being created, TRUE for something that already exists,
  // and the difference is not a preference. A new thing has not been through
  // its own steps yet, so the end of the flow is the first moment every answer
  // has been seen. An existing thing arrived with every answer already filled
  // in and valid, and the reader almost always came to change one of them —
  // making them press Next past two screens they did not come for to commit a
  // relabel is the wall this release is about, in a new shape.
  //
  // Save is the CTA whenever it is drawn, so there is never a screen with two.
  protected get savableFromAnyStep(): boolean {
    return false;
  }

  // The label on the button that commits. Defaults to the string the window
  // was constructed with, which is already "Add tracker" / "Save" / "Add
  // chart" at every call site.
  protected finalLabel(): string {
    return this.saveLabel;
  }

  // Open on a later step. Set before open(), so nothing has been drawn yet and
  // there is no repaint to do. Clamped rather than trusted: an out-of-range
  // deep link should land on the last step, never on a blank window.
  startAt(step: number): void {
    this.step = Math.max(0, Math.min(step, this.stepList().length - 1));
  }

  protected headingText(): string {
    if (!this.showsSteps) return this.baseHeading;
    return this.stepList()[this.step].title;
  }

  protected subtitleText(): string {
    if (!this.showsSteps) return this.baseSubtitle;
    return this.stepList()[this.step].subtitle;
  }

  // The step rail: one pip per step, the passed ones clickable so a reader can
  // go back and look without losing the ones after it.
  protected decorateHead(head: HTMLElement): void {
    if (!this.showsSteps) return;
    const rail = head.createDiv({ cls: "ca-wizard-rail" });
    this.stepList().forEach((s, i) => {
      const pip = rail.createDiv({
        cls: `ca-wizard-pip${i === this.step ? " is-current" : ""}${
          i < this.step ? " is-done" : ""
        }`,
      });
      pip.createSpan({ cls: "ca-wizard-pip-n", text: String(i + 1) });
      pip.createSpan({ text: s.title });
      if (i < this.step) pip.addEventListener("click", () => this.goTo(i));
    });
  }

  protected renderBody(): void {
    this.stepList()[this.step].render(this.body);
  }

  protected renderFooter(footer: HTMLElement): void {
    if (!this.showsSteps) {
      super.renderFooter(footer);
      return;
    }
    const last = this.step === this.stepList().length - 1;

    const cancel = footer.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());

    // Anything that is neither navigation nor the CTA: the chart editor's
    // Delete, and its "Add and start another". Between Cancel and Back so the
    // two ends of the footer stay where a reader expects them on every step.
    this.decorateFooter(footer, last);

    if (this.step > 0) {
      const back = footer.createEl("button", { text: "Back" });
      back.addEventListener("click", () => this.goTo(this.step - 1));
    }

    if (!last) {
      const next = footer.createEl("button", { text: "Next" });
      // Next is the CTA only while it is the only way forward. Where Save sits
      // beside it, Save is the action and Next is navigation.
      if (!this.savableFromAnyStep) next.addClass("mod-cta");
      next.addEventListener("click", () => this.advance());
    }

    if (last || this.savableFromAnyStep) {
      const save = footer.createEl("button", {
        text: this.finalLabel(),
        cls: "mod-cta",
      });
      save.addEventListener("click", () => void this.trySubmit());
    }
  }

  // A hook for footer controls that are not Cancel, Back, Next or Save.
  protected decorateFooter(_footer: HTMLElement, _last: boolean): void {}

  // Enter advances rather than submitting. On a three-step flow, Enter in the
  // name field creating the tracker outright would skip both steps that exist
  // to be looked at.
  protected async onEnterKey(): Promise<void> {
    if (!this.showsSteps) {
      await super.onEnterKey();
      return;
    }
    if (this.step === this.stepList().length - 1) await this.trySubmit();
    else this.advance();
  }

  protected advance(): void {
    const problem = this.stepList()[this.step].validate?.() ?? null;
    if (problem) {
      this.showError(problem);
      return;
    }
    this.goTo(this.step + 1);
  }

  protected goTo(index: number): void {
    this.step = Math.max(0, Math.min(index, this.stepList().length - 1));
    this.refreshFrame();
  }

  // Every step's objection, in order, so Save enforces the whole form however
  // the reader reached the button. Per-step validation gates Next; this gates
  // the commit, and `savableFromAnyStep` means the two are no longer the same
  // path. A subclass with a rule that belongs to no single step overrides this
  // and calls `super.validate()` first.
  protected validate(): ValidationProblem | null {
    for (const step of this.stepList()) {
      const problem = step.validate?.() ?? null;
      if (problem) return problem;
    }
    return null;
  }
}
