// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Prose block window, 1.0.78.
//
// *"can a collapse chevron and gear cog (for prose section editor/commands
// window be added to the new title row on the prose blocks?"* — and then, when
// the glyph was in question: *"I'm trying to remove '...' for some sections, so
// far this has been done for attachments and what's below. I think prose blocks
// could definetely benefit from the cog."*
//
// THE THIRD COG, AND THE FIRST ON A SECTION WITH NO FENCE. Attachments got one
// in 1.0.49 §3 and What's below in 1.0.69, both on a `sectionFrame`'s head.
// Prose composes no fence — *"It is important that prose is not put into a code
// block so that standard markdown syntax still works."* — so its bar is built
// by `ui/prose-bar.ts` and the cog is appended to that. What the three share is
// the control and the kind of window behind it, not the slot.
//
// AND THE CHEVRON WAS REFUSED, in the same breath it was asked for:
// `headerbar.ts` never hides a source line in Live Preview — *"A SOURCE LINE IS
// NEVER HIDDEN, only painted"* — so a fold arrow would act in reading mode and
// sit dead in the editor. `test/prose-surface.test.ts` holds that one, beside
// the bar it would have ridden on.
//
// WHAT THIS SUITE CAN REACH. The window is DOM and this suite has none, so it
// is pinned by its source shape through `test/sources.ts`, as every render path
// in this repo is. What the window WRITES is tested where the record is:
// `test/prose.test.ts` for the marker grammar, `test/section-model.test.ts` for
// `reconfigured`'s reading of `options`, and the planner's own suites for the
// headings. This file holds the door, the form, and the four claims the move
// made.

import { describe, expect, it } from "vitest";
import { fnBody, readCode, readSrc, srcFiles } from "./sources";

const win = () => readCode("ui/prose-window");
const bar = () => readCode("ui/prose-bar");

// ONE METHOD, BOUNDED AT THE NEXT ONE — which `fnBody` cannot do: its end
// marker is the next TOP-LEVEL declaration, so a slice taken at a class member
// runs to the end of the file and an assertion about `renderTitle` would pass
// on a line in `commit`. That is the vacuous shape `fnBody`'s own header warns
// about, met one scope in. Local rather than a widening, because the fix for
// the shared helper is a boundary change under 186 files.
const method = (name: string): string => {
  const text = readSrc("ui/prose-window");
  const at = new RegExp(
    `\\n {2}(?:private|protected|public) (?:async )?(?:get )?${name}\\b`
  ).exec(text);
  if (!at) throw new Error(`No method "${name}" on ProseWindow`);
  const rest = text.slice(at.index + 1);
  const next = /\n {2}(?:private|protected|public|constructor)\b/.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
};

// ── the door ─────────────────────────────────────────────────────────────

describe("the cog is one door onto one block", () => {
  it("is opened from the bar and nowhere else", () => {
    // ONE DOOR, NOT TWO, which is this release's window rule: the cog is the
    // only caller, so there is no second route that could drift from it.
    expect(bar()).toContain('import { openProseWindow } from "./prose-window";');
    expect(bar()).toContain("void openProseWindow(plugin.app, plugin, path, spec.nth);");
    const callers = srcFiles().filter(
      (f) =>
        !f.path.endsWith("ui/prose-window.ts") && f.code.includes("openProseWindow(")
    );
    expect(callers.map((f) => f.path)).toEqual(["src/ui/prose-bar.ts"]);
  });

  it("is handed WHICH block, which is what the section editor cannot be", () => {
    // *Edit sections…* is the NOTE: its rows are the note's sections and its
    // Save plans a whole composition, so a reader standing on their third prose
    // block had to find that row in a list. The ordinal travels from the bar to
    // the window to `proseIdFor`, and the window looks up one view by it.
    expect(win()).toContain("nth: number");
    expect(win()).toContain("const id = proseIdFor(nth);");
    expect(win()).toContain("resolved.model.sections(text).find((v) => v.id === id);");
  });

  it("asks the model for the view rather than reading the file for answers", () => {
    // `sections(text)` EXPANDS ONE CATALOGUE ROW INTO ONE ROW PER BLOCK and
    // carries both halves this window needs: the questions the row declares and
    // what THIS block's marker already answers. A window that re-read the
    // marker would be a second parser of a grammar that has four readers
    // already.
    const body = fnBody("openProseWindow", "ui/prose-window");
    expect(body).toContain("plugin.sections.modelForNote(path)");
    expect(body).toContain("await app.vault.read(file);");
    for (const parse of ["proseSpansIn", "bracketOpen", "#bare", "chronoanvil-prose"]) {
      expect(win(), parse).not.toContain(parse);
    }
  });

  it("says why it cannot open, and says it as a notice", () => {
    // THE COG IS ONLY DRAWN ON A BLOCK THE PAINTER FOUND, so every refusal here
    // is a surface this plugin does not compose — a bracket copied into an
    // ordinary note, or a note whose journal has been unregistered. What the
    // reader needs is the fact, not a dialogue with one sentence in it.
    expect(win()).toContain(
      '"ChronoAnvil: this note isn\'t one a registered journal composes, so its "'
    );
    expect((win().match(/notify\.info\(UNRECOGNISED\)/g) ?? []).length).toBe(2);
    // A MISSING FILE IS NOT A NOTICE. A path that no longer resolves means the
    // note was renamed or removed under an open pane; the bar goes with it.
    expect(fnBody("openProseWindow", "ui/prose-window")).toContain(
      "if (!file) return false;"
    );
  });
});

// ── the form ─────────────────────────────────────────────────────────────

describe("the four things a reader can say about one block", () => {
  it("draws the row's own questions, in the catalogue's order", () => {
    // THE QUESTIONS ARE THE SECTION'S, NOT THIS WINDOW'S. A fifth question
    // added to the prose row appears here without this file changing, which is
    // the whole of why `SectionView.questions` exists.
    expect(win()).toContain("return this.spec.view.questions ?? [];");
    const body = method("renderBody");
    expect(body).toContain("for (const q of this.questions) {");
    expect(body).toContain('if (q.kind === "title") this.renderTitle(field(q), q);');
    expect(body).toContain('else if (q.kind === "flag") this.renderFlag(field(q), q);');
    expect(body).toContain('else if (q.kind === "lines") this.renderLines(field(q), q);');
    // A KIND WITH NO BRANCH DRAWS NOTHING rather than something wrong — the
    // prose row declares exactly these three and no other catalogue row can
    // reach this file.
    expect(body).not.toContain("else {");
  });

  it("takes its wording from where the section editor takes it", () => {
    // THE READER MEETS THE TWO WINDOWS IN THE SAME VAULT AN HOUR APART, so
    // every string is read from the question rather than written here: the box's
    // name, the tick's label, what empty gets you, and the sentence a block
    // with no markers gets instead of a control.
    expect(win()).toContain("text: fieldLabelOf(q)");
    expect(win()).toContain("text: q.on,");
    expect(win()).toContain("input.placeholder = q.placeholder;");
    expect(win()).toContain('text: q.settled?.text ?? "set when added",');
    // AND THE SAME CLASSES, so a retune of one form reaches the other.
    for (const cls of [
      "ca-tpl-field",
      "ca-tpl-field-label",
      "ca-tpl-form",
      "ca-tpl-form-box",
      "ca-tpl-form-label",
      "ca-tpl-title-input",
      "ca-tpl-lines",
      "ca-tpl-choice-fixed",
    ]) {
      expect(win(), cls).toContain(`"${cls}"`);
      expect(readCode("ui/section-editor"), cls).toContain(`"${cls}"`);
    }
  });

  it("keeps the label over a question it cannot ask", () => {
    // THE SECTION EDITOR DROPS IT AND THIS KEEPS IT, and the difference is the
    // shape of the two windows: there the sentence sits in a row that already
    // names the section and the question beside it, here the form is a column
    // of labelled fields and a bare sentence in the middle of one would be a
    // refusal with nothing to say what it is refusing.
    const body = method("renderBody");
    expect(body).toContain("if (!this.readable(q)) {");
    expect(body).toContain("const note = field(q).createDiv({");
    expect(body).toContain("if (q.settled?.hint) note.title = q.settled.hint;");
    // AND "READABLE" IS THE MODEL'S ANSWER, never an inspection of the file: a
    // block written before the markers existed has nowhere to keep an answer,
    // and `answeredIn` supplies no key for it.
    expect(method("readable")).toContain(
      "this.spec.view.answered?.[q.key] !== undefined"
    );
  });

  it("never pre-fills the title box with the head it would have anyway", () => {
    // THE SECTION EDITOR'S RULE AND THE SAME REASON: empty means "the head this
    // block would have", and seeding the box with today's default would write
    // it into the marker as though the reader had chosen it. So the default is
    // the placeholder, which `proseHeadLabel` derives and numbers per block.
    const body = method("renderTitle");
    expect(body).toContain("input.placeholder = q.placeholder;");
    expect(body).toContain("input.value = this.shown(q);");
    expect(body).not.toContain("input.value = q.placeholder");
    // AN EMPTIED BOX IS AN ANSWER, not an absence: `""` is what clears a name
    // back to the default, and `undefined` would be "the reader said nothing".
    expect(body).toContain('this.answer(q.key, input.value.trim() || "");');
  });

  it("reads a tick as on unless the answer says off", () => {
    // `renderFlagQuestion`'S RULE, RESTATED: `on` says what ticking DOES, and a
    // box labelled *Hide the title* would be ticked on every note that shows
    // one — a control that lies about its own state.
    const body = method("renderFlag");
    expect(body).toContain("box.checked = this.shown(q) !== FLAG_OFF;");
    expect(body).toContain("this.answer(q.key, box.checked ? FLAG_ON : FLAG_OFF);");
    // A QUESTION THIS TICK HIDES TAKES ITS ANSWER WITH IT, or a reader who
    // ticks, types headings and unticks again has Save write a box they can no
    // longer see.
    expect(body).toContain("if (dep.shownWhen?.key === q.key && !this.shows(dep)) {");
    expect(body).toContain("this.answer(dep.key, undefined);");
    expect(body).toContain("this.refreshBody();");
  });

  it("gates the headings box on the tick above it, off the question's own rule", () => {
    // `shownWhen` IS THE CATALOGUE'S, so the gate cannot drift from the editor's
    // reading of the same field. A flag reads on unless it says off here too,
    // which is the one place the two windows could have disagreed.
    const body = method("shows");
    expect(body).toContain("const gate = q.shownWhen;");
    expect(body).toContain("if (!gate) return true;");
    expect(body).toContain(
      'const now = by.kind === "flag" ? (value === FLAG_OFF ? FLAG_OFF : FLAG_ON) : value;'
    );
    expect(body).toContain("return now === gate.is;");
    expect(readSrc("journals/journal-sections")).toContain(
      'shownWhen: { key: "defaults", is: FLAG_ON },'
    );
  });

  it("drops an emptied headings box rather than storing a blank", () => {
    // EMPTY IS "THE DEFAULT", not "no headings" — that answer is the tick above
    // it. A blank string in `options` would ask the planner to compose a
    // skeleton of nothing, which is a different note from the one the box was
    // emptied on.
    const body = method("renderLines");
    expect(body).toContain("this.answer(q.key, lines.length ? lines.join(\"\\n\") : undefined);");
    expect(body).toContain(".map((l) => l.trim())");
    expect(body).toContain(".filter(Boolean)");
  });
});

// ── the removal ──────────────────────────────────────────────────────────

describe("removing the block is a tick, and the model decides whether it is offered", () => {
  it("is a tick rather than a button, so the window keeps one Save", () => {
    // NOTHING WRITES UNTIL SAVE, INCLUDING THE REMOVAL. A button would be a
    // second write path out of a window whose other four answers are still
    // sitting in a draft, and a reader who pressed it and then Cancel would
    // have a note already changed.
    const body = method("renderRemoval");
    expect(body).toContain('text: "Remove this block",');
    expect(body).toContain("this.removing = box.checked;");
    expect(win()).not.toContain("ca-tpl-remove");
    expect(win()).not.toContain("ConfirmModal");
  });

  it("asks the model about THIS block and shows the refusal in the tick's place", () => {
    // THE FIRST PROSE BLOCK IS WHAT A LEAF NOTE CANNOT BE WITHOUT and the rest
    // are the reader's — `locked: true` on one catalogue row, scoped by ordinal
    // where the refusal is asked. A dead tick with a tooltip would be 1.0.73's
    // own complaint; the sentence takes its place.
    const body = method("renderRemoval");
    expect(body).toContain(
      "const refusal = this.spec.model.refusal(this.spec.view.id, this.spec.text);"
    );
    expect(body).toContain("if (refusal) {");
    expect(body).toContain('cls: "ca-tpl-choice-fixed", text: refusal');
    expect(body).toContain("return;");
  });

  it("is removal and not deletion, in the word on the box", () => {
    // 1.0.43's one verb. The block goes out of the composition; the writing in
    // it goes with the markers, and nothing is deleted from the vault.
    expect(win()).not.toContain("Delete");
    expect(win()).not.toContain("delete this");
  });
});

// ── the write ────────────────────────────────────────────────────────────

describe("one Save, one write, and a re-read before it", () => {
  it("re-reads the note and declines rather than clobbering it", () => {
    // `section-editor.ts` STATES THE RULE AND THE REASON: a window a reader can
    // leave open is a long gap, and on a note being written in, what a stale
    // write would drop is the writing. This window is opened from the note the
    // reader is looking at, so the gap is as short as it ever gets and the
    // chance of a keystroke inside it is as high.
    const body = method("commit");
    expect(body).toContain("const current = await this.app.vault.read(this.spec.file);");
    expect(body).toContain("if (current !== this.spec.text) {");
    expect(body).toContain("notify.fail(");
    expect(body).toContain("was written. Reopen the cog to see it as it is now.");
    // AND IT DECLINES RATHER THAN RE-PLANNING against the new text: the answers
    // in the draft were read off a marker that may no longer be there.
    expect(body.slice(body.indexOf("if (current !== this.spec.text) {"))).toContain("return;");
  });

  it("writes this block's answers to this block alone", () => {
    // EVERY OTHER ID GOES BACK AS A BARE STRING, which `reconfigured` reads as
    // "nothing to say about it" — the signal is the PRESENCE of `options`, not a
    // comparison — so the write touches one marker and leaves the rest of the
    // composition exactly as the reader has it.
    const body = method("commit");
    expect(body).toContain(".present(current)");
    expect(body).toContain(
      ".map((each) => (each === id ? { id: each, options: this.answers } : each));"
    );
    expect(body).toContain(".filter((each) => !(this.removing && each === id))");
    expect(body).toContain("const next = this.spec.model.apply(current, want);");
  });

  it("hands back the keys the reader touched and no others", () => {
    // `SectionChoice.options`' WHOLE CONTRACT. A window that handed back every
    // box would ask the writer to rewrite a marker nobody edited — which on
    // this section means re-composing the headings under a block whose reader
    // only renamed it.
    expect(win()).toContain(
      "private answers: Record<string, string | undefined> = {};"
    );
    expect(method("answer")).toContain("this.answers[key] = value;");
    // AND AN UNTOUCHED WINDOW HAS NOTHING TO SAVE, said as a sentence rather
    // than by writing the note back unchanged.
    expect(method("touched")).toContain(
      "return this.removing || Object.keys(this.answers).length > 0;"
    );
    expect(method("validate")).toContain(
      'return this.touched() ? null : "Nothing to save.";'
    );
  });

  it("writes once, and says what it did", () => {
    const body = method("commit");
    expect((body.match(/vault\.modify/g) ?? []).length).toBe(1);
    expect(body).toContain("await this.app.vault.modify(this.spec.file, next);");
    // A PLAN THAT CHANGES NOTHING IS A NOTICE, not a write: `apply` answering
    // null is the model saying the note already reads this way.
    expect(body).toContain("if (next === null) {");
    expect(body).toContain(
      '"ChronoAnvil: nothing to change — this block is as it was."'
    );
    // AND THE REMOVAL AND THE EDIT GET DIFFERENT WORDS, because they are the
    // two things a reader could have just done and the Notice is all they see.
    expect(body).toContain("removed from ${this.spec.file.basename}");
    expect(body).toContain("${this.spec.view.label} updated");
  });

  it("names the block it is editing, in the window's own head", () => {
    // THE VIEW'S LABEL, which `rowFor` has already numbered — *Prose 2* on the
    // second block — so a reader with three of them can see which one they
    // opened without reading the fields.
    expect(win()).toContain("      spec.view.label,");
    expect(win()).toContain(
      "      `${spec.file.basename} — this block of writing, and what it opens with.`"
    );
    expect(win()).toContain('      "Save"');
  });
});
