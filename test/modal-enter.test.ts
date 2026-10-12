// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Enter inside an editor window (1.0.59).
//
// THE REPORT WAS "number habits cant be created", and the cause was none of
// the habits window's own code. `EditorModal.onOpen` puts one `keydown`
// listener on the whole modal so that Enter in a single-line field submits it,
// and it did that EVEN WHEN A FIELD HAD JUST HANDLED ENTER ITSELF. So Enter in
// the habits add box added the habit and then saved and closed the window on
// top of it — which merely looked brisk while the add row had one field, and
// became "it does nothing" once 1.0.56 gave it four: a reader filling in
// "Least" pressed Enter, the shape boxes had no handler of their own, and the
// window saved a draft nobody had touched and shut, saying *"Nothing to change
// — this entry's habits are as they were"*.
//
// Two halves, and the sweep below is what makes the rule bite: the frame
// yields to a field that called `preventDefault()`, and every field that means
// something by Enter calls it.

import { describe, it, expect } from "vitest";
import { readCode } from "./sources";

const frame = (): string => readCode("editor-modal");

// Every window built on the frame that handles Enter inside its own body.
const WINDOWS = [
  "habits-editor",
  "tags-editor",
  "attach-categories-editor",
  "section-editor",
] as const;

describe("the frame's Enter listener", () => {
  it("exists, and is still narrow", () => {
    const f = frame();
    const at = f.indexOf('contentEl.addEventListener("keydown"');
    expect(at).toBeGreaterThan(0);
    const body = f.slice(at, at + 900);
    // A textarea keeps Enter for newlines, and a <button> or <select> has its
    // own meaning for it — Enter on Cancel must cancel.
    expect(body).toContain("if (!(target instanceof HTMLInputElement)) return;");
    expect(body).toContain('if (target.type === "checkbox" || target.type === "radio") return;');
    expect(body).toContain("void this.onEnterKey();");
  });

  it("stands down for a keystroke a field already claimed", () => {
    const f = frame();
    const at = f.indexOf('contentEl.addEventListener("keydown"');
    const body = f.slice(at, at + 900);
    expect(body).toContain("if (e.defaultPrevented) return;");
    // BEFORE THE SUBMIT, which is the whole of it: a guard after
    // `onEnterKey()` would read like the rule and do nothing.
    const guard = body.indexOf("if (e.defaultPrevented) return;");
    expect(guard).toBeGreaterThan(0);
    expect(body.indexOf("void this.onEnterKey();")).toBeGreaterThan(guard);
  });

  it("reads the claim off preventDefault, not off stopPropagation", () => {
    // `preventDefault` is the signal because it is the one every such field
    // ALREADY sends — see the sweep below. Requiring `stopPropagation` would
    // have meant editing six handlers to fix one frame, and leaving the
    // seventh, written next year, broken in a way nothing reports.
    const f = frame();
    const at = f.indexOf('contentEl.addEventListener("keydown"');
    expect(f.slice(at, at + 900)).not.toContain("stopPropagation");
  });
});

// Every Enter BRANCH in a file's keydown handlers, sliced to where the branch
// ends — the next key test, or 200 characters, whichever comes first.
//
// SLICED TO THE BRANCH, AND THAT IS NOT FUSSINESS. The first version of this
// sweep read the whole handler, and a rename field's handler tests Enter and
// then Escape: deleting `preventDefault()` from its ENTER branch left the
// assertion passing on the one in its ESCAPE branch. Measured, by exactly that
// mutant, before this version was written.
const enterBranches = (code: string): string[] => {
  const out: string[] = [];
  for (const chunk of code.split('addEventListener("keydown"').slice(1)) {
    const body = chunk.slice(0, 900);
    const keys = [...body.matchAll(/\b(?:e|evt)\.key\s*[!=]==\s*"/g)].map(
      (m) => m.index
    );
    for (let i = 0; i < keys.length; i += 1) {
      const at = keys[i];
      if (!body.slice(at, at + 24).includes('"Enter"')) continue;
      const next = keys[i + 1] ?? at + 200;
      out.push(body.slice(at, Math.min(next, at + 200)));
    }
  }
  return out;
};

describe("every field that means something by Enter says so", () => {
  // THE SWEEP THAT MAKES THE GUARD BITE. A handler that commits on Enter and
  // forgets `preventDefault()` is not refused by anything — it simply does its
  // own thing and then gets the window saved out from under it, which is the
  // bug above wearing a different hat.
  for (const name of WINDOWS) {
    it(`${name}: every Enter handler claims the keystroke`, () => {
      const branches = enterBranches(readCode(name));
      expect(branches.length, `${name} handles Enter somewhere`).toBeGreaterThan(0);
      for (const branch of branches) {
        expect(branch, `${name}: an Enter branch without preventDefault`).toContain(
          "preventDefault()"
        );
      }
    });
  }

  it("counts them, so a handler cannot be dropped from the sweep unnoticed", () => {
    // Seven today: an add box and a rename field in each of the three list
    // windows — habits, tags, attachment categories — and the arrangement
    // window's template name. The number is here because a sweep over an empty
    // set is the shape that passes for the wrong reason, and because a window
    // added later with an unclaimed Enter handler would otherwise just quietly
    // not be swept.
    const total = WINDOWS.reduce(
      (n, name) => n + enterBranches(readCode(name)).length,
      0
    );
    expect(total).toBe(7);
  });
});

describe("the habits add row, which is where this was reported", () => {
  it("adds on Enter and leaves the window open to add another", () => {
    const code = readCode("habits-editor");
    const at = code.indexOf("const enterAdds = ");
    expect(at).toBeGreaterThan(0);
    const body = code.slice(at, at + 300);
    expect(body).toContain('if (evt.key !== "Enter") return;');
    // The claim, and then the add. With the frame's guard in place this is now
    // the WHOLE effect of the keystroke — before 1.0.59 it was the first half
    // of "add it, then save and close".
    expect(body).toContain("evt.preventDefault();");
    expect(body).toContain("commit();");
  });

  it("puts the cursor back in the add field, which only matters now", () => {
    // Before 1.0.59 the keystroke closed the window, so there was no next
    // field to focus. With it staying open, `renderBody` empties the body and
    // the element that had focus goes with it — a reader naming three habits
    // in a row would be reaching for the mouse between each one.
    const code = readCode("habits-editor");
    expect(code).toContain("private focusAdd = false;");
    // SET BY AN ADD AND BY NOTHING ELSE. The type picker, a cloud pill and a
    // finished rename all repaint too, and none of them is the reader asking
    // to type another name.
    expect(code.split("this.focusAdd = true;")).toHaveLength(3);
    const at = code.indexOf("if (this.focusAdd) {");
    expect(at).toBeGreaterThan(0);
    const body = code.slice(at, at + 200);
    expect(body).toContain("this.focusAdd = false;");
    expect(body).toContain("window.setTimeout(() => input.focus(), 0);");
    // And it is the LAST thing `renderAdd` does, after the element exists.
    expect(code.indexOf("private renderUsed()")).toBeGreaterThan(at);
  });
});
