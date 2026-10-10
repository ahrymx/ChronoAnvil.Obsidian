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
import { cssRule, readCode, readCss, readSrc } from "./sources";
import { splitGlyph } from "../src/ui/section-frame";
import {
  applyAttachCategories,
  attachFormatOf,
  planAttachCategories,
  readAttachCategories,
  type AttachCategoryRow,
} from "../src/ui/attach-categories";

describe("an editable title is drawn once", () => {
  it("splits the glyph off before displaying it", () => {
    // `sectionFrame` draws the glyph in its own fixed box — that box is what
    // lines section titles up down the page — and sets the slot's text to the
    // remainder. A renderer handed the slot has to do the same.
    expect(readSrc("header-title")).toContain("splitGlyph(title)");
  });

  it("edits the NAME, and leaves the icon to its own control", () => {
    // THE CLAIM HERE WAS THE OPPOSITE UNTIL 1.0.9: *"an input pre-filled with
    // the text half alone would silently drop the glyph on every save, and a
    // reader who wants '📕 Lessons' could never type it"*. Both halves of that
    // are answered rather than overruled — the save path rejoins the glyph
    // (`joinGlyph`), and a glyph typed into the name is still read as one — so
    // what is left of the old argument is an emoji sitting in a text box that
    // is otherwise the section's name.
    //
    // ANCHORED TO THIS CONTROL, because the file holds three renames and
    // `attachNoteRename` genuinely does edit a whole string: the assertion this
    // replaces went on passing after the change by matching THAT one, which is
    // the quiet pass this suite's helpers exist to stop.
    const src = readSrc("header-title");
    const at = src.indexOf("export function attachHeaderRename");
    const end = src.indexOf("export function attachPropertyRename");
    expect(at).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(at);
    const body = src.slice(at, end);
    expect(body).toContain("input.value = textOf();");
    expect(body).not.toContain("input.value = title;");
  });

  it("rejoins the two halves on the way back to the file", () => {
    // The directive's argument is still the title as written — one string with
    // the icon in it — so nothing about the FILE changed, only which control
    // edits which half of it.
    const src = readSrc("header-title");
    expect(src).toContain("export function joinGlyph");
    expect(src).toContain("joinGlyph(glyphOf(), typed)");
  });

  it("reads a glyph typed into the name as the icon", () => {
    // Otherwise pasting "📕 Lessons" into a field whose icon is already 📖
    // composes "📖 📕 Lessons" on disk. The same `splitGlyph` question the bar
    // asks when it renders, asked on the way in.
    expect(readSrc("header-title")).toContain("const typedSplit = splitGlyph(typed);");
    expect(readSrc("header-title")).toContain("typedSplit.glyph\n        ? typed");
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
    //
    // ONE REDRAW RATHER THAN A PATCH TO THE OLD ELEMENT (1.0.9). This used to
    // be `box.setText(splitGlyph(title).glyph)` — right while the slot held a
    // character, wrong now it holds a button, because setting text on the box
    // would delete the control. `render` draws both halves from `title`, so
    // there is one description of what the bar shows instead of two.
    const src = readSrc("header-title");
    expect(src).not.toContain("box.setText(splitGlyph(title).glyph)");
    const at = src.indexOf("  const render = (): void => {");
    expect(at).toBeGreaterThan(0);
    expect(src.slice(at, src.indexOf("\n  };", at))).toContain("renderGlyph();");
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

// 3.19.2's third fault, as 1.0.49 left it.
//
// THE DESCRIBE THAT STOOD HERE pinned the shelf's ✕: offered on the category's
// own head, live only while the shelf was empty, re-checked against the file
// before writing, removing the region as well as the directive, leaving the
// blank line as `Add category` found it, refusing the last one, and reachable
// without a hover.
//
// EVERY ONE OF THOSE INVARIANTS SURVIVES; the control does not. A category is a
// SECTION-level thing and that was a per-shelf control for it — the same
// category error 3.18 §1 corrected for *Add category* and left half-done. The
// guards moved into `attach-categories.ts` as pure functions, which is why this
// describe can now assert them against a model rather than against the text of
// a click handler.
describe("an empty resources category can still be removed", () => {
  const attach = (): string => readCode("attachment-widgets");

  const note = (shelves: string[], bodies: Record<string, string[]> = {}): string =>
    [
      "```chronoanvil",
      "header:📎 Attachments",
      ...shelves.map((k) => `attach:${k}|${k[0].toUpperCase()}${k.slice(1)}`),
      "```",
      ...shelves.flatMap((k) => ["", `<!--chronoanvil:${k}`, ...(bodies[k] ?? []), "-->"]),
    ].join("\n");

  const keep = (text: string, keys: string[]): AttachCategoryRow[] =>
    readAttachCategories(text)
      .filter((c) => keys.includes(c.key))
      .map((c) => ({ key: c.key, label: c.label, format: attachFormatOf(c.tokens) }));

  it("is not offered on the shelf any more", () => {
    // Nothing builds `.ca-journal-attach-remove`, which is what makes the
    // stylesheet sweep below a removal rather than a cosmetic tidy.
    expect(attach()).not.toContain("journal-attach-remove");
    expect(attach()).not.toContain("buildShelfRemove");
  });

  it("only when the category is empty", () => {
    const text = note(["books", "films"], { films: ["- [Trailer](https://x.test)"] });
    const plan = planAttachCategories(text, keep(text, []));
    expect(plan?.removes.map((c) => c.key)).toEqual(["books"]);
    // And the one that is refused comes back with what it holds, so the
    // reader is told which shelf and how much is in it.
    expect(plan?.kept).toEqual([
      { key: "films", label: "Films", items: 1, tokens: [], tail: "" },
    ]);
  });

  it("checks against the file rather than against the window", () => {
    // NOT BELT-AND-BRACES. The row's ✕ is drawn from a count taken when the
    // window opened, and the write happens whenever the reader presses Save —
    // a drop landing in between would make an empty shelf a full one while the
    // dialog sat open. The plan is computed from the file's text, so the
    // refusal above is that same check and there is no second one to disagree.
    const before = note(["books", "films"]);
    const rows = keep(before, ["films"]);
    const after = note(["books", "films"], { books: ["- ![[a.png]]"] });
    expect(planAttachCategories(before, rows)?.removes.map((c) => c.key)).toEqual(["books"]);
    expect(planAttachCategories(after, rows)?.removes).toEqual([]);
    expect(planAttachCategories(after, rows)?.kept.map((c) => c.key)).toEqual(["books"]);
  });

  it("removes the region as well as the directive", () => {
    // A shelf owns two things in the file. Leaving the region behind would
    // orphan a comment block nothing renders and nothing can reach.
    const text = note(["books", "films"]);
    const plan = planAttachCategories(text, keep(text, ["films"]));
    const out = applyAttachCategories(text, plan!);
    expect(out).not.toContain("attach:books|");
    expect(out).not.toContain("<!--chronoanvil:books");
    expect(out).toContain("attach:films|Films");
    expect(out).toContain("<!--chronoanvil:films");
  });

  it("leaves the file as adding one found it", () => {
    // Adding a category writes a blank line with the region. Removing one and
    // not the other makes a note gain a blank line per add/remove cycle.
    const base = note(["books"]);
    const added = applyAttachCategories(
      base,
      planAttachCategories(base, [
        ...keep(base, ["books"]),
        { key: null, label: "Films" },
      ])!
    );
    const back = applyAttachCategories(
      added,
      planAttachCategories(added, keep(added, ["books"]))!
    );
    expect(back).toBe(base);
  });

  it("refuses to remove the last one", () => {
    // A Resources section with no `attach:` renders an empty header and gives
    // the reader no way back into it. Removing the section is the editor's job,
    // and both the window and the write say so.
    const text = note(["books"]);
    const plan = planAttachCategories(text, []);
    expect(plan?.floor).toBe(true);
    expect(plan?.removes).toEqual([]);
    expect(applyAttachCategories(text, plan!)).toBe(text);
    expect(attach()).toContain("needs one category");
  });

  it("lets the last one go when a new one is taking its place", () => {
    // The floor is about what is LEFT, not about what is removed — a reader
    // replacing their only category has not emptied the section.
    const text = note(["books"]);
    const plan = planAttachCategories(text, [{ key: null, label: "Films" }]);
    expect(plan?.floor).toBe(false);
    const out = applyAttachCategories(text, plan!);
    expect(readAttachCategories(out).map((c) => c.label)).toEqual(["Films"]);
    expect(out).not.toContain("<!--chronoanvil:books");
    expect(out).toContain("<!--chronoanvil:films");
  });

  it("is reachable on a phone", () => {
    // WAS: a `@media (hover: none)` branch holding the shelf's ✕ at 0.45,
    // because it was `opacity: 0` until the shelf was hovered and there was no
    // second route to it. 5.14 dropped the hover-reveal; 1.0.49 drops the
    // control.
    //
    // The invariant is unchanged and now belongs to the window: its remove is
    // `.ca-tags-remove`, a row control in a modal, which has never been
    // hover-revealed. `test/hover-reveal.test.ts` sweeps for the pattern.
    const css = readCss();
    expect(css).not.toContain(".ca-journal-attach-remove");
    expect(css).not.toContain(".ca-journal-attach:hover");
    expect(cssRule(".ca-tags-remove:hover")).toContain("--text-error");
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
