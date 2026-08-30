// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import { readCode, readCss } from "./sources";

// ── a refusal that can be acted on (4.17 §1 and §2) ───────────────────────
//
// The report: a reader deleted a journal's folders in the file explorer, came
// back to make the journal again, and was told the folder was already taken by
// a journal whose folder they could see was gone. The advice — "give this one a
// different name" — is advice for a collision with something that EXISTS.
//
// These are source assertions, and the header of `kind-table.test.ts` states
// the limit they share: the modal needs an Obsidian, which this suite has no
// stub for. What can be pinned is which branch is chosen, what each one says,
// and that only one of them carries a button.

const editor = (): string => readCode("editor-modal");
const settings = (): string => readCode("settings-editors");

describe("a validation problem may carry its own fix", () => {
  it("still accepts a plain string, which is what every other validate returns", () => {
    // THE WIDENING IS THE DESIGN. Four independent modal families implement
    // `validate()` and none of them changed — a second method threaded through
    // each would have left two ways to say the same thing everywhere it did not
    // reach.
    const src = editor();
    expect(src).toContain("export type ValidationProblem =");
    expect(src).toContain("| string");
    expect(src).toContain("protected abstract validate(): ValidationProblem | null;");
    // AND THE WIZARD'S PER-STEP VALIDATION WIDENED WITH IT, or the journal
    // wizard — the one modal that needs this — could carry an action on Save
    // and not on Next, which is the button it actually presses.
    expect(src).toContain("validate?: () => ValidationProblem | null;");
  });

  it("has no second validate method behind the first", () => {
    // The tempting shape is `validate()` for the string and `validateRich()`
    // for the action, defaulting to wrapping the first. That is the "gate
    // behind a gate" the house rules forbid, and the two always end up
    // disagreeing about which is authoritative.
    expect(editor()).not.toContain("validateRich");
  });

  it("draws the message as its own element, with the button under it", () => {
    const src = editor();
    expect(src).toContain('cls: "ca-editor-error-text"');
    expect(src).toContain('cls: "ca-editor-error-action"');
    // NO BUTTON WITHOUT AN ACTION. Every refusal in the plugin but one has no
    // fix to offer, and an empty control on a red panel is worse than none.
    expect(src).toContain("if (!action) return;");
  });

  it("re-submits after the action, so pressing it finishes the job", () => {
    // A button that resolves the refusal and leaves the reader looking at the
    // same red line has not finished what they pressed it for.
    //
    // SCOPED TO `showError`, WHICH IS THE POINT OF THE SLICE. The first draft
    // searched from `action.run()` to the end of the FILE, and
    // `SteppedEditorModal.onEnterKey` two hundred lines below also calls
    // `await this.trySubmit()` — so deleting the re-submit from this handler
    // left the assertion passing against a completely unrelated method. An
    // anchor that another function answers is an anchor for neither.
    const src = editor();
    const at = src.indexOf("protected showError(");
    expect(at, "showError").toBeGreaterThan(0);
    const end = src.indexOf("\n  protected clearError(", at);
    expect(end, "showError has an end").toBeGreaterThan(at);
    const body = src.slice(at, end);
    const ran = body.indexOf("await action.run()");
    expect(ran).toBeGreaterThan(0);
    expect(body.indexOf("await this.trySubmit()", ran)).toBeGreaterThan(ran);
    // AND IT CLEARS THE OLD MESSAGE FIRST, or the refusal that has just been
    // resolved is still on screen while the form re-checks itself.
    expect(body).toContain("this.clearError();");
  });

  it("disables the button while its action runs", () => {
    // It runs a write and then a save. A second click in flight would delete a
    // journal that is already gone and then refuse for a reason nobody could
    // act on.
    expect(editor()).toContain("btn.disabled = true;");
  });

  it("styles the button as ordinary, not as a second alarm or a second CTA", () => {
    const css = readCss();
    expect(css).toContain("\n.ca-editor-error-action {");
    // NOT `mod-cta` — that reads as the thing the reader came to press, which
    // is Save — and NOT `mod-warning` on a panel that is already red.
    const src = editor();
    expect(src).not.toContain('cls: "ca-editor-error-action mod-cta"');
    expect(src).not.toContain('cls: "ca-editor-error-action mod-warning"');
  });
});

describe("the root-collision refusal", () => {
  it("names the journal that holds the folder", () => {
    // It never did. "already another journal's folder" is a sentence about an
    // anonymous party, and the reader cannot go and do anything about a journal
    // they have not been told the name of.
    expect(settings()).toContain(
      "is already ${cfg.name}'s folder, and two journals sharing a root can't be told apart from a note's path."
    );
  });

  it("asks whether that journal's folders are still there", () => {
    // FINDING 2, AND THE WHOLE REASON THE REPORT WAS CONFUSING. The stale case
    // and the live case used to get identical advice and only one of them was
    // true.
    const src = settings();
    expect(src).toContain("const onDisk = journalFoldersOnDisk(this.app, cfg);");
    expect(src).toContain("if (onDisk.length > 0) {");
  });

  it("offers a button only where the folders are gone", () => {
    const src = settings();
    // The live branch: named, pointed at the route, no action — unregistering
    // a journal somebody is still using is not the quick way past a wizard
    // step. It returns a bare string, which is what "no action" IS.
    expect(src).toContain(
      "Give this one a different name, or delete ${cfg.name} from Settings → ChronoAnvil → Journals first."
    );
    // The stale branch: the only one that gets an action.
    expect(src).toContain('label: `Delete “${cfg.name}” and continue`');
    const live = src.indexOf("Journals first.`");
    const stale = src.indexOf("and continue`");
    expect(live).toBeGreaterThan(0);
    expect(stale).toBeGreaterThan(live);
  });

  it("widens the orphaned trackers rather than deleting them", () => {
    // UNLIKE THE ROW, WHICH ASKS. This fires mid-wizard from a button whose
    // label promises one outcome; quietly destroying trackers behind it would
    // be the opposite of what "and continue" says. Widening keeps every reading
    // ever logged, which is the answer that cannot lose work.
    expect(settings()).toContain('run: () => removeJournal(this.plugin, index, "widen")');
  });

  it("finds the colliding journal once, not once per sentence", () => {
    // `rootIsFree` returned a boolean and is GONE rather than kept beside the
    // finder. A predicate answering half the question invites a second loop
    // finding the same journal again, which is how a message and a button end
    // up meaning different journals.
    const src = settings();
    expect(src).toContain("private rootHolder(root: string)");
    expect(src).not.toContain("private rootIsFree(");
  });
});
