// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Three reported UI faults, 3.19.2.
//
// The first is a regression this project introduced one release ago and is the
// reason the file leads with it: making a header bar's title editable put the
// title's GLYPH back into a slot that already had one drawn beside it, so every
// editable bar read "📖 📖 Lessons". A feature that renders its own subject
// twice is a feature nobody trusts with the write behind it.
//
// The other two are the same observation in two places: a control that acts on
// a whole section was sitting inside that section's body. "Add category" moved
// to the title bar in 3.19.0 for this reason; the task table's scope button and
// the shelf's remove control are the rest of it.
//
// THE SCOPE BUTTON DID NOT SURVIVE THE ARGUMENT. Moving it onto the bar put it
// on whichever bar happened to open the row — "🕒 Lately", above a list of
// recent notes — and the move also silently took it off every headerless fence,
// the homepage included. 5.21 removes it, and the describe that pinned the move
// now pins the removal. The reasoning is in `tables.ts` where the builder was.

import { describe, expect, it } from "vitest";
import { readCode, readCss, readSrc } from "./sources";
import { splitGlyph } from "../src/ui/section-frame";

describe("an editable title is drawn once", () => {
  it("splits the glyph off before displaying it", () => {
    // `sectionFrame` draws the glyph in its own fixed box — that box is what
    // lines section titles up down the page — and sets the slot's text to the
    // remainder. A renderer handed the slot has to do the same.
    expect(readSrc("header-title")).toContain("splitGlyph(title)");
  });

  it("edits the whole string, glyph included", () => {
    // The directive's argument is the title as written. An input pre-filled
    // with the text half alone would silently drop the glyph on every save, and
    // a reader who wants "📕 Lessons" could never type it.
    expect(readSrc("header-title")).toContain("input.value = title;");
  });

  it("is the split the frame itself performs", () => {
    // Asserted against the real function rather than a copy of its rules, so
    // the two cannot drift on a title the parser treats unusually.
    expect(splitGlyph("📖 Lessons")).toEqual({ glyph: "📖", text: "Lessons" });
    expect(splitGlyph("Lessons")).toEqual({ glyph: "", text: "Lessons" });
  });

  it("keeps the glyph honest when a rename changes it", () => {
    // The glyph lives outside the slot, so renaming "📖 Lessons" to
    // "📕 Lessons" would otherwise leave the old one beside the new text until
    // the note repainted.
    expect(readSrc("header-title")).toContain("box.setText(splitGlyph(title).glyph)");
  });
});

// ── THE SCOPE BUTTON IS GONE (5.21) ─────────────────────────────────────
//
// This file's second and third fixes were about MOVING that button: out of the
// table's body, onto the section's own actions strip, and then (3.21.2) undoing
// the absolute positioning the move had orphaned. 5.21 removes the control
// instead, so the claims below are the inverse of the ones they replace.
//
// KEPT HERE RATHER THAN DELETED WITH THE CODE. Two of the three fixes this file
// records were about a control that was still in the DOM and no longer visible
// — created, positioned against the wrong ancestor, and gone from the page. A
// sweep is how that gets noticed, and "no scope control anywhere" is a claim
// worth sweeping for precisely because the last two attempts to place this
// button both shipped it somewhere nobody could see.
describe("the task table draws no scope control", () => {
  it("has no cycle to draw", () => {
    // The builder, the state it needed, and the writer behind it are all gone.
    expect(readCode("tables")).not.toContain("export function buildScopeCycle");
    expect(readCode("tables")).not.toContain("export interface TasksScope");
    expect(readCode("directive-regions")).not.toContain(
      "export function tasksScopeFor"
    );
    expect(readCode("directive-regions")).not.toContain("async function setTasksScope");
  });

  it("takes no `hosted` flag, on either side of the seam", () => {
    // `hostedControls` on the region and `hostedScope` on the dispatcher existed
    // only to keep the bar's copy and the table's copy from both drawing. With
    // one control they were a question worth asking; with none they are a
    // parameter that can only be answered wrong.
    expect(readCode("directive-regions")).not.toMatch(/hostedControls\s*=/);
    expect(readCode("widgets")).not.toMatch(/hostedScope\s*=/);
    expect(readCode("widgets")).not.toContain("buildScopeCycle(frame.actions");
  });

  it("was answered wrong on every headerless fence, which is why", () => {
    // THE DEFECT THAT MADE THIS A REMOVAL RATHER THAN A MOVE. The processor
    // asked `scopeHeader === headerIndex - 1`; on a fence with no `header:`
    // line both sides are −1, so the table was told a bar had drawn the control
    // and no bar had. The homepage's Open tasks — a bare `tasks-table` in a
    // `cell`, with no header — therefore had no scope button from 3.19.2 on,
    // and the test written beside that change asserted the fallback EXISTED
    // rather than that it fired.
    //
    // Asserted as the absence of the comparison, because the comparison is the
    // bug: nothing may reintroduce a `-1` sentinel that doubles as a real index.
    expect(readCode("widgets")).not.toContain("scopeHeader");
  });

  it("leaves the reader a way to point the table somewhere else", () => {
    // NOT A NICETY — it is the whole reason the button could go. Every Open
    // tasks section asks for the folder in the section editor, which writes the
    // same directive argument the cycle wrote.
    for (const module of [
      "home-sections",
      "diary-sections",
      "diary-dashboard-sections",
      "journals-dashboard-sections",
      "journal-dashboard-sections",
    ]) {
      expect(readSrc(module), module).toContain('directive: "tasks-table"');
    }
  });
});

describe("an empty resources category can be removed", () => {
  const attach = (): string => readCode("attachment-widgets");

  it("offers the control on the category's own subtitle", () => {
    expect(attach()).toContain("journal-attach-remove");
  });

  it("only when the category is empty", () => {
    // The condition, in the widget's own model.
    //
    // THROUGH A GETTER SINCE 5.2, when the label row was extracted out of
    // `buildAttachments` into `buildShelfLabel`. The count is asked for at the
    // moment the button is refreshed rather than captured when it was built —
    // which is not a nicety: `items` is REASSIGNED by a reorder and by the
    // initial load, so a captured reference would answer for a model that has
    // been replaced.
    expect(attach()).toContain("const n = count();");
    expect(attach()).toContain("const empty = n === 0;");
    expect(attach()).toContain("drop.disabled = !empty;");
    expect(attach()).toContain("() => items.length");
  });

  it("and checks again against the file before writing", () => {
    // NOT BELT-AND-BRACES. The button's state is computed at render time and
    // the write happens after a confirmation the reader may have sat on — a
    // drop landing in between would make an empty shelf a full one while the
    // dialog was open.
    expect(attach()).toMatch(/const body = lines\.slice\(open \+ 1, close\)/);
    expect(attach()).toContain("isn't empty any more");
  });

  it("removes the region as well as the directive", () => {
    // A shelf owns two things in the file. Leaving the region behind would
    // orphan a comment block nothing renders and nothing can reach.
    expect(attach()).toContain("out.splice(directive, 1);");
    expect(attach()).toMatch(/out\.splice\(from, close - from \+ 1\)/);
  });

  it("leaves the file as `Add category` found it", () => {
    // `addAttachCategory` inserts a blank line with the region. Removing one
    // and not the other makes a note gain a blank line per add/remove cycle.
    expect(attach()).toMatch(/if \(from > 0 && out\[from - 1\]\.trim\(\) === ""\) from--;/);
  });

  it("refuses to remove the last one", () => {
    // A Resources section with no `attach:` renders an empty header and gives
    // the reader no way back: "Add category" appends after the last shelf, and
    // there would be none. Removing the section is the editor's job.
    expect(attach()).toContain("shelves <= 1");
  });

  it("is reachable on a phone", () => {
    // WAS: a `@media (hover: none)` branch holding this at 0.45, because the
    // control was `opacity: 0` until the shelf was hovered and there is no
    // second route to it. The comment ended "so a future removal has to argue
    // with something", so here is the argument.
    //
    // THE HOVER-REVEAL IS GONE, WHICH IS WHAT THE BRANCH COMPENSATED FOR. The
    // ✕ was an affordance on a bare label row; 5.14 made it an action on the
    // field's own head, beside *Add file* and *Add link*, both of which are
    // always drawn. A reader reported the result: one slot in a row of three
    // behaving differently from the other two. It is drawn at full opacity on
    // every pointer now, so a touch branch would be the only place it is
    // DIMMED — the policy inverted rather than applied.
    //
    // The invariant this test is about is unchanged and is asserted directly:
    // reachable without hovering. `test/hover-reveal.test.ts` still sweeps for
    // the pattern this no longer is.
    const css = readCss();
    const rule = css.slice(
      css.indexOf(".ca-journal-attach-remove {"),
      css.indexOf(".ca-journal-attach-remove svg")
    );
    expect(rule).toContain("opacity: 1");
    expect(css).not.toMatch(
      /@media \(hover: none\)[\s\S]{0,400}\.ca-journal-attach-remove/
    );
    // And no hover on the field reveals it, because there is nothing left to
    // reveal — the pair of rules that did is gone with the zero.
    expect(css).not.toContain(
      ".ca-journal-attach:hover .ca-journal-attach-remove"
    );
  });
});

describe("no style is left behind for the button that is gone", () => {
  const css = (): string => readCss();

  it("drops every rule that named it", () => {
    // 3.19.2 moved the button and left `position: absolute` behind, which put a
    // live control somewhere no reader could see and made the section look like
    // it had lost it. The mirror of that mistake is a stylesheet still carrying
    // rules for an element nothing builds, so the whole group goes.
    expect(css()).not.toContain(".ca-journal-tasks-scope");
  });

  it("drops the positioning context that existed only for it", () => {
    // `.ca-journal-tasks-table { position: relative }` was the anchor for the
    // absolute corner placement and nothing else under that class is
    // positioned. A stacking context kept for a control that no longer exists
    // is how the original orphan happened.
    const at = css().indexOf(".ca-journal-tasks-table {");
    expect(at).toBeGreaterThan(-1);
    expect(css().slice(at, css().indexOf("}", at))).not.toContain(
      "position: relative"
    );
  });
});
