// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The bridge block's window: what this bridge joins, and how much of it.
//
// WHAT IT REPLACES. On the diary side, one question reachable only through
// *Edit sections…*; on the journal side, nothing at all. `core/bridge.ts` has
// held window resolution, a closed selector set, eight refusals and a
// checksummed snapshot layer since 2.57, and what a reader could reach of it
// was the tracker the catalogue hard-coded. The engine was finished and had no
// doors — which is the whole of 1.0.89, and the reason the answer to *"retire
// them or upgrade?"* was upgrade.
//
// A COG ON THE SECTION'S OWN TITLE ROW, which is where the reader asked for it
// and where the Attachments, What's-below and Prose cogs already are (1.0.49
// §3, 1.0.69, 1.0.78). `bridgeHeader` draws the bar, so the cog goes in the
// frame's action slot beside the chevron and nothing here knows about chrome.
//
// ONE BLOCK, WHICH IS WHAT THE SECTION EDITOR CANNOT BE — `prose-window.ts`
// states the argument in full and this window is built to its shape: the view
// is the MODEL'S, every answer goes back through the same `apply` the section
// editor presses, nothing is written until Save, and the file is re-read before
// it is written.
//
// ── AND IT IS REFUSED BEFORE IT IS WRITTEN, NOT AFTER ────────────────────
//
// `planBridge` is asked of the TEXT THE SAVE WOULD PRODUCE. §2.3's rule is
// that a bridge is refused twice — in the editor and at render — so that a
// hand-written directive and one whose target lost its date property both say
// why instead of going quiet. This is the third place, and it is the only one
// that can PREVENT a refusal rather than report it: the reader hears "a Recipe
// has no date, so there is nothing to join on" while the window is still open
// and their answer is still theirs to change.
//
// VALIDATING THE RESULT RATHER THAN A MODEL OF IT is deliberate. The window
// could compose a directive from its own answers and check that; then the
// string it checked and the string `apply` writes would be two compositions of
// one line, and the failure mode is a window that approves what the renderer
// then refuses. So the plan is applied and the RESULTING TEXT is what gets
// asked.
//
// AND THE THING THAT ANSWERS IS HANDED IN, which is the whole reason this file
// imports no renderer. Assembling a bridge's host facts and its catalogue is
// `bridge-widgets.ts`' job and reaching back for the two functions that do it
// would tangle the two modules — the mistake `test/module-cycles.test.ts`
// records under *"no longer runs the diary link through one"*, where an opener
// imported for one call put a model and a window in one component. The caller
// already holds those facts; it passes a `refusalIn` the way `bridgeHeader`
// takes a `FoldStore`, and this window asks a question instead of knowing an
// answer.

import { App, TFile } from "obsidian";

import { EditorModal } from "./editor-modal";
import type ChronoAnvilPlugin from "../main";
import { PICK_JOIN, splitPicks } from "../core/directive-grammar";
import { getFile } from "../core/util";
import { notify } from "../core/notify";
import {
  FLAG_OFF,
  FLAG_ON,
  fieldLabelOf,
  questionIsRequired,
  type ChoiceQuestion,
  type FlagQuestion,
  type SectionModel,
  type SectionQuestion,
  type SectionView,
  type TextQuestion,
} from "../core/section-model";

// Why the renderer would refuse the text a save would write, or null if it
// would draw it. See the header: the caller supplies it, because the caller is
// what already knows how to ask.
export type BridgeRefusalCheck = (text: string) => string | null;

// Why this block's window could not be opened, in the reader's words.
//
// A NOTICE RATHER THAN A WINDOW WITH A SENTENCE IN IT, for `prose-window.ts`'s
// reason: the cog is only drawn on a bridge this plugin rendered, so every one
// of these is a surface no catalogue composes — a directive copied into an
// ordinary note, or a note whose journal has been unregistered. What the reader
// needs is the fact, not a dialogue.
const UNRECOGNISED =
  "ChronoAnvil: this note isn't one a registered journal or the diary " +
  "composes, so its bridge has no settings to change.";

export async function openBridgeWindow(
  app: App,
  plugin: ChronoAnvilPlugin,
  path: string,
  refusalIn: BridgeRefusalCheck
): Promise<boolean> {
  const file = getFile(app, path);
  if (!file) return false;
  const resolved = plugin.sections.modelForNote(path);
  if (!resolved) {
    notify.info(UNRECOGNISED);
    return false;
  }
  const text = await app.vault.read(file);
  // ONE `bridge` ID PER CATALOGUE, which is why this needs no ordinal the way
  // `openProseWindow` does — `snapshotKeyFor` anticipates two bridges on one
  // note and the section machinery cannot produce that shape, which
  // `core/bridge.ts` records and 1.0.89 does not change.
  const view = resolved.model.sections(text).find((v) => v.id === "bridge");
  if (!view) {
    notify.info(UNRECOGNISED);
    return false;
  }
  new BridgeWindow(app, plugin, {
    file,
    text,
    refusalIn,
    model: resolved.model,
    view,
  }).open();
  return true;
}

interface BridgeWindowSpec {
  file: TFile;
  text: string;
  refusalIn: BridgeRefusalCheck;
  model: SectionModel;
  view: SectionView;
}

class BridgeWindow extends EditorModal {
  // What the reader has said in this sitting, and nothing they have not —
  // `SectionChoice.options`' contract, stated at `prose-window.ts`'s `answers`.
  private answers: Record<string, string | undefined> = {};

  constructor(
    app: App,
    plugin: ChronoAnvilPlugin,
    private spec: BridgeWindowSpec
  ) {
    super(
      app,
      plugin,
      spec.view.label,
      `${spec.file.basename} — what this bridge joins, and how much of it.`,
      "Save"
    );
  }

  private get questions(): readonly SectionQuestion[] {
    return this.spec.view.questions ?? [];
  }

  // What the control shows: what the reader has said, else what the note says,
  // else nothing. `prose-window.ts::shown`'s rule, and the note's half is the
  // model's `answered` — which for a question owning a PIECE of a compound
  // argument is that piece and not the whole span, because `answersInText` runs
  // `partsOf` after the read. That is what keeps the filters box from coming up
  // holding the target's name.
  private shown(q: SectionQuestion): string {
    const held = this.answers[q.key];
    if (typeof held === "string") return held;
    return this.spec.view.answered?.[q.key] ?? "";
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
      // A MULTI CHOICE IS A DIFFERENT CONTROL AND THE SAME ANSWER (1.0.95) —
      // see `ChoiceQuestion.multi`, which is why the branch is here and not a
      // kind of its own.
      if (q.kind === "choice" && q.multi) this.renderPicks(field(q), q);
      else if (q.kind === "choice") this.renderChoice(field(q), q);
      else if (q.kind === "text") this.renderText(field(q), q);
      else if (q.kind === "flag") this.renderFlag(field(q), q);
    }
  }

  // Which days the list shows, as a tick. 1.0.94.
  //
  // TICKED MEANS ON AND THE LABEL SAYS WHAT TICKING DOES, which is
  // `prose-window.ts::renderFlag`'s rule and `renderFlagQuestion`'s before it:
  // the reader meets all three in one vault an hour apart.
  //
  // UNTICKED IS THE DEFAULT, AND THAT IS WHERE THIS DIFFERS FROM THE PROSE
  // TICK. There the absent answer is `FLAG_ON` — `#bare`'s absence means the
  // head is drawn — so it reads `!== FLAG_OFF`. Here the flag's absence is a
  // bridge written before this release, which lists the days that carry a
  // reading, so only `FLAG_ON` ticks the box. Reading it the other way would
  // show every bridge in every vault as already widened.
  private renderFlag(host: HTMLElement, q: FlagQuestion): void {
    const wrap = host.createDiv({ cls: "ca-tpl-form" });
    const box = wrap.createEl("input", {
      type: "checkbox",
      cls: "ca-tpl-form-box",
    });
    box.id = `ca-bridge-flag-${q.key}`;
    const label = wrap.createEl("label", {
      cls: "ca-tpl-form-label",
      text: q.on,
    });
    label.htmlFor = box.id;
    box.checked = this.shown(q) === FLAG_ON;
    box.title = box.checked ? q.off : q.on;
    box.setAttribute("aria-label", q.on);
    box.addEventListener("change", () => {
      this.answer(q.key, box.checked ? FLAG_ON : FLAG_OFF);
    });
  }

  // Several of a closed set, as a tick per row. 1.0.95.
  //
  //   "cycle through enabled trackers (enabled/choosen in the settings window)"
  //
  // TICKS AND NOT `<select multiple>`. The native control needs a ctrl-click to
  // add a second value and a ctrl-click to keep the first, which is a gesture
  // nothing else in this plugin asks for and which silently clears the reader's
  // whole answer when they get it wrong. A column of checkboxes says what is in
  // and what is out at a glance and costs one click per change — and it is the
  // `renderFlag` row above, drawn once per value, so the two controls in this
  // window are made of the same parts.
  //
  // THE ORDER IS THE READER'S AND IS NOT RECOMPUTED (see `ChoiceQuestion.multi`).
  // A newly ticked value is APPENDED to the answer that is already there, and
  // unticking removes one and leaves the rest where they were. Sweeping
  // `q.values` and collecting the ticked ones would be one line shorter and
  // would reorder the cycle — and so move which tracker the block draws — every
  // time the reader opened this window and changed anything.
  //
  // AN INDEX IN THE `id`, NOT THE VALUE. A tracker id is a frontmatter property
  // name, so it may hold a space; `label.htmlFor` has to match the box exactly,
  // and an `id` with a space in it is one the label cannot address.
  private renderPicks(host: HTMLElement, q: ChoiceQuestion): void {
    if (!q.values.length) {
      host.createSpan({ cls: "ca-tpl-choice-empty", text: q.empty });
      return;
    }
    const picks = host.createDiv({ cls: "ca-tpl-picks" });
    q.values.forEach((v, i) => {
      const row = picks.createDiv({ cls: "ca-tpl-form" });
      const box = row.createEl("input", {
        type: "checkbox",
        cls: "ca-tpl-form-box",
      });
      box.id = `ca-bridge-pick-${q.key}-${i}`;
      const label = row.createEl("label", {
        cls: "ca-tpl-form-label",
        text: v.label,
      });
      label.htmlFor = box.id;
      box.checked = splitPicks(this.shown(q)).includes(v.value);
      box.setAttribute("aria-label", v.label);
      box.addEventListener("change", () => {
        const now = splitPicks(this.shown(q));
        const next = box.checked
          ? [...now, v.value]
          : now.filter((x) => x !== v.value);
        // UNDEFINED WHEN NOTHING IS LEFT, which is the empty row of the
        // dropdown this replaces and means the same thing: no answer, so the
        // section composes its `emptyLabel` default. An empty STRING would be
        // an answer of no trackers, and `planBridge` would refuse the line the
        // save produced — correctly, and for a question the reader thought they
        // had cleared rather than broken.
        this.answer(q.key, next.length ? next.join(PICK_JOIN) : undefined);
      });
    });
  }

  // NOTHING TO CHOOSE FROM IS A SENTENCE, NOT AN EMPTY MENU — the section
  // editor's rule, and the catalogue supplies the wording for exactly this
  // case: a vault with no dated journal kinds, or none with a chartable
  // tracker, is told what is missing and where to get it.
  private renderChoice(host: HTMLElement, q: ChoiceQuestion): void {
    if (!q.values.length) {
      host.createSpan({ cls: "ca-tpl-choice-empty", text: q.empty });
      return;
    }
    const select = host.createEl("select", { cls: "ca-tpl-choice" });
    select.setAttribute("aria-label", `Choose ${q.label}`);
    select.title = `Choose ${q.label}`;
    // THE FIRST ROW IS A PROMPT OR AN ANSWER, AND `emptyLabel` DECIDES WHICH
    // (4.46) — the same two sentences `renderChoiceQuestion` draws, because the
    // reader meets the two windows in one vault an hour apart.
    const none = select.createEl("option", {
      text: q.emptyLabel ? `${q.emptyLabel} (default)` : `Choose ${q.label}…`,
      value: "",
    });
    none.disabled = q.emptyLabel === undefined;
    const current = this.shown(q);
    none.selected = !current;
    for (const v of q.values) {
      const opt = select.createEl("option", { text: v.label, value: v.value });
      opt.selected = current === v.value;
    }
    select.addEventListener("change", () => {
      this.answer(q.key, select.value || undefined);
    });
  }

  // The filter tail, as a box.
  //
  // A TEXT BOX AND NOT FIVE CONTROLS, WHICH REVERSES WHAT THE PLAN ASKED FOR.
  // The plan wanted one control per selector, on the argument that the closed
  // set IS the promise — and the set being closed is what makes the box safe
  // rather than what rules it out. `BRIDGE_SELECTORS` is validated against the
  // RAW tokens before `parseQuery` sees them, so a typed `sort:asc` is refused
  // by name and `is:` misspelled does not become a search term: the reader is
  // told what they typed and what the five words are, which is the same
  // knowledge five dropdowns would carry and strictly more than they could
  // express. Five controls can say `tag:x`; they cannot say `tag:x tag:y`, and
  // `parseQuery` can.
  //
  // THE PLACEHOLDER IS THE DOCUMENTATION. It names the two commonest selectors
  // in a working example, which is the one place a reader who has never seen
  // `assets/documentation.md` will meet them.
  private renderText(host: HTMLElement, q: TextQuestion): void {
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

  protected validate(): string | null {
    if (Object.keys(this.answers).length === 0) return "Nothing to save.";
    // A REQUIRED QUESTION CANNOT BE UNANSWERED BACKWARDS. The diary side's
    // target is a `choice` with no empty state, and clearing it would write
    // `bridge-notes:` — the unconfigured directive patch 7 exists to stop the
    // editor producing. `questionIsRequired` is the one place that rule lives.
    for (const q of this.questions) {
      if (questionIsRequired(q) && !this.shown(q).trim()) {
        return `Choose ${q.label} — a bridge with nothing to join cannot be drawn.`;
      }
    }
    return null;
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
    // THE NOTE'S OWN SECTIONS, IN THE NOTE'S OWN ORDER, with this bridge's
    // answers attached to it alone — `prose-window.ts::commit`'s shape, and
    // every other id goes back as a bare string, which `reconfigured` reads as
    // "nothing to say about it".
    const want = this.spec.model
      .present(current)
      .map((each) => (each === id ? { id: each, options: this.answers } : each));
    const next = this.spec.model.apply(current, want);
    if (next === null) {
      notify.info("ChronoAnvil: nothing to change — this bridge is as it was.");
      return;
    }

    const refusal = this.spec.refusalIn(next);
    if (refusal) {
      this.showError(refusal);
      return;
    }

    await this.app.vault.modify(this.spec.file, next);
    notify.ok(`${this.spec.view.label} updated`);
  }
}
