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

describe("the task table's scope button is on the bar", () => {
  it("is drawn by the processor, into the header's actions", () => {
    expect(readCode("widgets")).toContain("buildScopeCycle(frame.actions, scope)");
  });

  it("is not owned by the widget that rebuilds", () => {
    // `liveScopedWidget` rebuilds the table's whole subtree on any change under
    // its folder. A control the widget owned but parented into a bar it does
    // not own would be duplicated on every rebuild — the welded-ownership
    // hazard the widget layer already documents.
    expect(readCode("widgets")).toContain("hostedScope");
    expect(readCode("directive-regions")).toContain("hostedControls");
  });

  it("draws exactly one, wherever it ends up", () => {
    // The table still draws its own when no header hosts one — a fence with a
    // `tasks-table` and no `header:` is legal and must not lose the control.
    expect(readCode("directive-regions")).toMatch(
      /hostedControls\s*\?\s*null\s*:/
    );
  });

  it("reads the same scope the table does", () => {
    // Shared resolution rather than a second derivation: a button announcing a
    // state the table is not in is worse than no button. The parsing is subtle
    // enough on its own — a trailing `,period` stripped before the keyword is
    // read, and a folder that may contain a comma.
    expect(readCode("directive-regions")).toContain("export function tasksScopeFor");
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
    // The hover-reveal policy (3.9 §3.3). There is no second route to this
    // control, so with no touch branch it would be invisible rather than faint.
    // `test/hover-reveal.test.ts` enforces this mechanically; this names the
    // case so a future removal has to argue with something.
    const css = readCss();
    expect(css).toMatch(
      /@media \(hover: none\)[\s\S]{0,400}\.ca-journal-attach-remove/
    );
  });
});

describe("the scope button is visible where it was moved to", () => {
  const css = (): string => readCss();
  const rule = (): string =>
    css().slice(
      css().indexOf(".ca-journal-tasks-scope {"),
      css().indexOf(".ca-journal-tasks-scope:hover")
    );

  it("is an ordinary flex item, not an absolutely positioned corner control", () => {
    // 3.21.2. Moving the button into the header bar (3.19.2) left this rule
    // behind: `position: absolute; top: 0; right: 0` pinned it to the corner of
    // the TABLE's wrapper, which is what it was drawn inside until then. In the
    // actions strip it positioned itself against whatever ancestor happened to
    // be positioned and vanished — created, in the DOM, and nowhere a reader
    // could see. The section looked like it had lost its control.
    //
    // Declarations only; the rule explains what it stopped doing and a naive
    // substring check trips on its own explanation.
    const declarations = rule()
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.includes(":"));
    expect(declarations).not.toContain("position: absolute;");
    expect(declarations).toContain("flex: 0 0 auto;");
  });

  it("keeps the corner treatment where it is still drawn in the table", () => {
    // A fence carrying `tasks-table` with no `header:` above it has no actions
    // strip to host the control, so the table draws its own — and that case
    // must not lose the placement the absolute rule was written for.
    expect(css()).toContain(".ca-journal-tasks-table > .ca-journal-tasks-scope");
    const scoped = css().slice(
      css().indexOf(".ca-journal-tasks-table > .ca-journal-tasks-scope")
    );
    expect(scoped).toContain("position: absolute;");
  });

  it("has a positioning context for that fallback", () => {
    expect(css()).toMatch(/\.ca-journal-tasks-table \{[^}]*position: relative;/);
  });
});
