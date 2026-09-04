// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// 3.18 follow-ups §1: "Add category" belongs in the title bar.
//
// The move is small and the claim behind it is not: *Add file* is a SHELF-level
// action and *Add category* is a SECTION-level one, so a row holding both
// asserted a relationship that does not exist. The tests that matter are
// therefore about placement and about count — one bar, one button — rather than
// about the behaviour, which did not change and already had somewhere to live.

import { describe, expect, it } from "vitest";
import { readCode, readSrc } from "./sources";
import { studyComposed } from "./study-template";

const attach = (): string => readCode("attachment-widgets");
const widgets = (): string => readCode("widgets");

describe("where the button is", () => {
  it("is no longer built into the shelf toolbar", () => {
    // The toolbar builds `.ca-journal-attach-btn`s. "Add category" is not one of
    // them any more; *Add file* and *Add link* still are, because those really
    // are shelf actions.
    const src = attach();
    expect(src).toContain('addFileBtn.createSpan({ text: "Add file" })');
    expect(src).toContain('addLinkBtn.createSpan({ text: "Add link" })');
    expect(src).not.toContain('addCatBtn.createSpan({ text: "Add category" })');
  });

  it("is built as a header action instead", () => {
    const src = attach();
    expect(src).toContain("export function buildAddCategoryButton");
    // Styled as a header button, not as an attach one — it has moved into a row
    // whose other members are `journal-btn`s.
    expect(src).toMatch(/buildAddCategoryButton[\s\S]{0,600}journal-btn/);
  });

  it("is anchored by the renderer, into the bar the shelves hang under", () => {
    const src = widgets();
    expect(src).toContain("buildAddCategoryButton(this, ctx)");
    expect(src).toContain("shelfHeader === headerIndex - 1");
  });

  it("still does the same thing it always did", () => {
    // `addAttachCategory` was already note-local and shelf-independent — it
    // appends after the LAST `attach:` line whichever shelf called it — which is
    // why this is a move rather than a rewrite.
    const src = attach();
    expect(src).toContain("addAttachCategory(deps, ctx.sourcePath, label)");
    expect(src).toContain('promptText(deps.app, "Name this category"');
  });

  it("does not fold the section it is sitting on", () => {
    // The bar toggles its section on click. A button inside it that let the
    // click through would collapse Resources every time somebody added a shelf.
    const src = readSrc("attachment-widgets");
    expect(src).toMatch(/buildAddCategoryButton[\s\S]{0,900}stopPropagation/);
  });
});

describe("the duplication it removes", () => {
  it("Study's Topic index has three shelves and one Resources header", () => {
    // The measurement the follow-up made: three `attach:` lines meant three
    // identical buttons doing one thing. One header bar means one button.
    //
    // COMPOSED WITH `resources` NAMED (5.20). Study no longer ships the section
    // on its Topic index; what it still ships is the three-shelf override that
    // makes this measurement three rather than one, and that is what the test
    // is about.
    const lines = studyComposed("Topic Index.md", ["banner", "resources"]).split("\n");
    const shelves = lines.filter((l) => /^\s*attach:/.test(l));
    expect(shelves.length).toBe(3);
    const resources = lines.filter((l) => l.trim() === "header:📚 Resources");
    expect(resources.length).toBe(1);
  });

  it("a fence with no shelves gets no button", () => {
    // `shelfHeader` is -1 for such a fence, and -1 never equals a header index,
    // so the Review, Charts and Lessons bars are untouched.
    expect(widgets()).toContain("return -1;");
  });
});
