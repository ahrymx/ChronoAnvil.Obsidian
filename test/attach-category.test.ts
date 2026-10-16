// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// 3.18 follow-ups §1: the categories control belongs in the title bar.
//
// The move is small and the claim behind it is not: *Add file* is a SHELF-level
// action and a CATEGORY is a SECTION-level one, so a row holding both asserted
// a relationship that does not exist. The tests that matter are therefore about
// placement and about count — one bar, one button — rather than about the
// behaviour, which did not change and already had somewhere to live.
//
// 1.0.49 FINISHED THE ARGUMENT. The button was *Add category*, one of the three
// edits a list needs; the shelf's ✕ was the second, drawn once per shelf on the
// field head, and a rename was not offered at all. The bar's button now opens
// the Categories window and the ✕ is gone — one door onto the whole list.
//
// AND 1.0.49 §3 MADE IT ONE CONTROL. *"the diary and journal attachment
// sections should look more similar."* The bar hosted a labelled pill in
// `frame.actions` — a full-width second row at level 1 — and a field head
// hosted a bare cog on its title row, because the two were added for two
// different reports. Both now go through `headTools`, onto the title row of
// whichever head they are on. The placement claim is therefore stronger than
// 3.18's rather than changed: one bar, one button, and the same button.

import { describe, expect, it } from "vitest";
import { cssRule, cssRules, readCode, readCss, readSrc } from "./sources";
import {
  ATTACH_FORMATS,
  applyAttachCategories,
  planAttachCategories,
  readAttachCategories,
} from "../src/ui/attach-categories";
import { studyComposed } from "./study-template";
import {
  ENTRY_ATTACH_CATEGORIES,
  composeEntryTemplate,
} from "../src/diary/entry-sections";
import {
  JOURNAL_SECTIONS,
  type JournalSection,
} from "../src/journals/journal-sections";

const attach = (): string => readCode("attachment-widgets");
const widgets = (): string => readCode("widgets");

describe("where the button is", () => {
  it("is no longer built into the shelf toolbar", () => {
    // The toolbar builds `.ca-journal-attach-btn`s. The categories control is
    // not one of them any more; *Add file* and *Add link* still are, because
    // those really are shelf actions.
    const src = attach();
    expect(src).toContain('addFileBtn.createSpan({ text: "Add file" })');
    expect(src).toContain('addLinkBtn.createSpan({ text: "Add link" })');
    expect(src).not.toContain('addCatBtn.createSpan({ text: "Add category" })');
  });

  it("is one button, not a second one beside the old one", () => {
    // The 1.0.49 fork, settled: the add field moved INSIDE the window rather
    // than staying on the bar next to it. Two controls on one strip doing
    // overlapping jobs is the thing the bar was tidied to stop.
    const src = attach();
    expect(src).not.toContain('text: "Add category"');
    expect(src).not.toContain("buildAddCategoryButton");
  });

  it("is one control for both surfaces, not one shape each (1.0.49 §3)", () => {
    // *"the diary and journal attachment sections should look more similar."*
    // The bar's labelled pill is gone: there is one builder, and the labelled
    // shape it replaced must not survive anywhere — not as a second exported
    // function, not as a dead branch, and not under its old name in `index.ts`.
    const src = attach();
    expect(src).toContain("export function buildCategoriesGlyph");
    expect(src).not.toContain("buildCategoriesButton");
    expect(widgets()).not.toContain("buildCategoriesButton");
    // A pill is a label and a `journal-btn`. The cog is neither.
    expect(src).not.toContain('text: "Categories"');
    expect(src).not.toContain("ca-journal-btn-label");
    expect(src).not.toContain("ca-journal-btn ca-journal-btn-subtle");
    // ONE BUILDER, so the two placements cannot drift apart again.
    expect((src.match(/export function buildCategories/g) ?? []).length).toBe(1);
  });

  it("is anchored by the renderer, onto the bar's own title row", () => {
    const src = widgets();
    // THE BAR'S OWN TITLE GOES WITH IT (1.0.49), because a note can carry more
    // than one Resources section and the window's subtitle names the one the
    // reader pressed.
    expect(src).toContain("buildCategoriesGlyph(this, ctx, title)");
    expect(src).toContain("shelfHeader === headerIndex - 1");
    // AND THROUGH THE SHARED SLOT (1.0.49 §3), not into `frame.actions` —
    // which at level 1 is `flex: 1 0 100%`, a whole row for one cog.
    expect(src).toContain("headTools(frame.root).appendChild(");
    expect(src).not.toMatch(/frame\.actions\.appendChild\(\s*buildCategories/);
  });

  it("still writes where it always wrote", () => {
    // The write was already note-local and shelf-independent — it appends after
    // the LAST `attach:` line whichever shelf called it — which is why 3.18 was
    // a move rather than a rewrite, and why 1.0.49 could widen it into a draft
    // without changing where a new category lands.
    const src = attach();
    expect(src).toContain("saveAttachCategories(deps, ctx.sourcePath, rows)");
    // AND IT DOES NOT WRITE WHEN THERE IS NOTHING TO WRITE. A reader who opens
    // the window, reads the list and presses Save should not find the note in
    // their sync history — `vault.modify` with identical content still moves
    // the file's mtime. Pinned as a shape because the write is the one half of
    // this round a suite with no vault cannot execute.
    expect(src).toContain("if (next !== text) await deps.app.vault.modify(file, next);");
    const text = [
      "```chronoanvil",
      "header:📎 Attachments",
      "attach:books|Books",
      "attach:films|Films",
      "```",
      "",
      "<!--chronoanvil:books",
      "-->",
      "",
      "<!--chronoanvil:films",
      "-->",
    ].join("\n");
    const rows = readAttachCategories(text).map((c) => ({ key: c.key, label: c.label }));
    const out = applyAttachCategories(
      text,
      planAttachCategories(text, [...rows, { key: null, label: "Papers" }])!
    ).split("\n");
    // After the last shelf, inside the fence; its region after the fence close.
    expect(out[4]).toBe("attach:papers|Papers");
    expect(out[5]).toBe("```");
    expect(out.indexOf("<!--chronoanvil:papers")).toBeGreaterThan(5);
  });

  it("asks the note what it has when it is pressed, not when it is drawn", () => {
    // The window's rows carry an item count, and that count is what decides
    // whether a row can be removed. One captured at render time would be the
    // count before the reader dropped anything on the shelf.
    //
    // ON THE SHARED OPENER AS OF 1.0.49's SECOND ROUND, which is the whole
    // reason there is one: the bar's button and the head's glyph both wire
    // through `wireCategories`, so this contract is asserted once and cannot
    // hold on one surface and not the other.
    const src = attach();
    expect(src).toMatch(
      /function wireCategories[\s\S]{0,900}addEventListener\("click"[\s\S]{0,600}vault\.read/
    );
    expect(src).toMatch(/function wireCategories[\s\S]{0,1200}categoryItemCount/);
    // AND THE CONTROL GOES THROUGH IT rather than wiring its own listener.
    // There is one control again as of 1.0.49 §3 and the opener stays its own
    // function: a second surface wanting this door — a command, a context menu
    // — must not have to copy a vault read and three guards.
    expect(src).toMatch(/buildCategoriesGlyph[\s\S]{0,900}wireCategories\(btn/);
    // ONE LISTENER OPENS IT, AND ONE WINDOW IS CONSTRUCTED. Either number
    // reaching two is the drift this shape exists to prevent.
    expect(
      (src.match(/addEventListener\("click"[\s\S]{0,500}AttachCategoriesEditor/g) ?? [])
        .length
    ).toBe(1);
    expect((src.match(/new AttachCategoriesEditor\(/g) ?? []).length).toBe(1);
  });

  it("does not fold the section it is sitting on", () => {
    // The bar toggles its section on click, and so does a field head. A button
    // inside either that let the click through would collapse the section every
    // time somebody opened the window.
    const src = readSrc("attachment-widgets");
    expect(src).toMatch(/function wireCategories[\s\S]{0,1200}stopPropagation/);
  });
});

// ── THE SECOND SURFACE (1.0.49) ────────────────────────────────────────
//
// *"attachments section missing the options menu, it might be worth putting it
// next to the sections chevron"*. The control was hosted only by a titled
// `header:` bar, so a Resources fence written without one lost its only
// categories door when the per-shelf ✕ came off. The field's own head is where
// the reader pointed and is the one place such a fence has.
describe("where the button is when there is no bar", () => {
  it("is the same window from both places, not a second window", () => {
    const src = attach();
    expect(src).toContain("export function buildCategoriesGlyph");
    // ICON ONLY: a labelled pill on a line of text would be the largest thing
    // in the head. The name it drops lives in the two attributes, and nowhere
    // else — one declaration, one read, as of 1.0.49 §3.
    expect(src).toContain("const CATEGORIES_LABEL =");
    expect(src).toContain("const CATEGORIES_HINT =");
    expect((src.match(/CATEGORIES_LABEL/g) ?? []).length).toBe(2);
    expect((src.match(/CATEGORIES_HINT/g) ?? []).length).toBe(2);
    expect(src).toMatch(/buildCategoriesGlyph[\s\S]{0,700}setIcon\(btn, "settings"\)/);
    expect(src).toMatch(
      /buildCategoriesGlyph[\s\S]{0,700}cls: "ca-journal-field-cats"/
    );
  });

  it("goes on the title row of a head that is the section's", () => {
    // `chrome.head()` is non-null exactly where the field drew a head of its
    // own. It is null where a bar names the field, and there a shelf's tools
    // join the second-row strip rather than going missing.
    const src = attach();
    expect(src).toContain("const tools = chrome.head() ?? chrome.actions();");
    // AND THE DOOR IS NOT ON THAT SLOT (§4). It was for one round, when the
    // first shelf doubled as the section; the section has a head of its own
    // now and the door is on that one — a cog on a SHELF is the per-shelf
    // category error the ✕ was removed for.
    expect(src).toMatch(/if \(ownsCategories\) \{\s*root = createDiv/);
    expect(src).not.toContain(
      'tools.appendChild(buildCategoriesGlyph(deps, ctx, label ?? ""));'
    );
    // ONE PLACEMENT PER SURFACE, so a section can never grow two doors. Three
    // mentions across the whole module and that is the budget: the declaration
    // and the section head here, the bar in `index.ts`, nothing else.
    expect((src.match(/buildCategoriesGlyph\(/g) ?? []).length).toBe(2);
    expect((widgets().match(/buildCategoriesGlyph\(/g) ?? []).length).toBe(3);
  });

  it("is placed beside the chevron, not after it", () => {
    // The fold is the outermost control on every head in the plugin. A settings
    // icon landing outside it would move the one thing a reader never has to
    // look for.
    const src = readSrc("note-field");
    expect(src).toContain("head: () => headTools(built.frame.root)");
    // AND A FIELD WITH NO HEAD SAYS SO rather than inventing a row to put it
    // on — that is what the `?? chrome.actions()` fallback is answering.
    expect(src).toMatch(/head: \(\) => null/);
    // THE PLACEMENT ITSELF LIVES IN ONE PLACE (1.0.49 §3), because a header bar
    // needs the same slot and had none. Each selector in the list is a head
    // this has to land on the FIRST row of: after a chevron is past the fold,
    // after the widgets slot is a third row.
    const frame = readSrc("section-frame");
    expect(frame).toContain("export function headTools(bar: HTMLElement): HTMLElement");
    expect(frame).toMatch(
      /const before =\s*bar\.querySelector\(":scope > \.ca-journal-header-toggle"\) \?\?\s*bar\.querySelector\(":scope > \.ca-journal-sec-fold-toggle"\) \?\?\s*bar\.querySelector\(":scope > \.ca-journal-header-widgets"\);/
    );
    expect(frame).toContain("if (before) bar.insertBefore(slot, before);");
    expect(frame).toContain("else bar.appendChild(slot);");
    // IDEMPOTENT, because two callers share one head — a section's cog and a
    // shelf's toolbar — and two boxes would be two rows.
    expect(frame).toContain(
      'const found = bar.querySelector(":scope > .ca-journal-head-tools");'
    );
    expect(frame).toContain("if (found instanceof HTMLElement) return found;");
  });

  it("is exactly one door per fence, and never two", () => {
    const src = widgets();
    // The bar hosts it where `shelfHeader` names a header; the glyph where it
    // is -1. The two conditions cannot both hold.
    expect(src).toContain("shelfHeader === headerIndex - 1");
    expect(src).toContain("shelfHeader === -1 && line.trim() === firstShelf");
    // ONE PER FENCE, NOT ONE PER SHELF — compared against the fence's first
    // `attach:` line rather than counted with a flag, because the loop
    // `continue`s past several kinds of line before reaching a field.
    expect(src).toMatch(
      /const firstShelf =\s*lines\.find\(\(l\) => keywordOf\(l\) === "attach"\)\?\.trim\(\) \?\? null;/
    );
  });

  it("sizes the glyph against the chevron it sits beside", () => {
    // A control on a line of text has one job — to be that line's height. Both
    // read `--ca-bar-glyph` and both are a 1.4em box holding a 1.1em icon.
    const chevron = cssRule(".ca-journal-sec-fold-toggle");
    const glyph = cssRule(".ca-journal-field-cats");
    for (const decl of ["font-size: var(--ca-bar-glyph)", "width: 1.4em", "height: 1.4em"]) {
      expect(chevron, decl).toContain(decl);
      expect(glyph, decl).toContain(decl);
    }
    expect(cssRule(".ca-journal-field-cats .svg-icon")).toContain("width: 1.1em");
    // THE 30px RESET, which is the fourth time this release. app.css gives every
    // `<button>` `height: var(--input-height)`, and a declared height alone does
    // not win it — `min-height: 0` is the other half.
    expect(glyph).toContain("min-height: 0");
    expect(glyph).toContain("padding: 0");
  });

  it("takes the chevron's push rather than splitting it", () => {
    // Two `margin-left: auto` in one flex line SHARE the free space, which
    // would park the glyph in the middle of the head. So the slot takes the
    // push and the adjacency rules hand each chevron's own back.
    expect(cssRule(".ca-journal-head-tools")).toContain("margin-left: auto");
    expect(cssRule(".ca-journal-head-tools + .ca-journal-sec-fold-toggle")).toContain(
      "margin-left: 0"
    );
    expect(cssRule(".ca-journal-sec-fold-toggle")).toContain("margin-left: auto");
    // BOTH CHEVRONS, as of 1.0.49 §3 — the two heads name theirs differently
    // and the slot is on both now, so one rule would have fixed one head and
    // left the other splitting the space.
    expect(cssRule(".ca-journal-head-tools + .ca-journal-header-toggle")).toContain(
      "margin-left: 0"
    );
    expect(cssRule(".ca-journal-header-toggle")).toContain("margin-left: auto");
    // AND AN EMPTY SLOT IS NOT A GAP, the same way the tools strip collapses.
    expect(cssRule(".ca-journal-head-tools:empty")).toContain("display: none");
  });

  it("is two slots on one head, doing two different jobs", () => {
    // The second row is what this field can do to its CONTENTS, where it is a
    // row of its own; the title row is the end of the line the name is on.
    // Keeping them apart is why `head()` exists at all.
    const src = readSrc("note-field");
    expect(src).toContain("ca-journal-field-tools");
    expect(cssRule(".ca-journal-field-tools")).toContain("justify-content: flex-end");
    expect(cssRule(".ca-journal-head-tools")).toContain("flex: 0 0 auto");
  });

  it("left no trace of the field-only name it had (1.0.49 §3)", () => {
    // The slot is on two surfaces now, so a class calling it a field's would be
    // a name that lies. Swept rather than renamed-and-forgotten: an orphaned
    // rule styling an element nothing builds is the 3.19.2 mistake in reverse.
    //
    // `readCss` reads the SOURCES, comments included, so the prose retiring the
    // old name writes it without its dot.
    const css = readCss();
    expect(css).not.toContain(".ca-journal-field-head-tools");
    expect(readSrc("note-field")).not.toContain("field-head-tools");
    expect(attach()).not.toContain("field-head-tools");
  });
});

// ── A CATEGORY NESTS, IT DOES NOT BECOME A SECTION (1.0.49) ────────────
//
// *"new category got incorrectly inserted as a new section when it should be
// nested."* A Resources section nests its categories under a `header:` bar —
// Study's Topic index has three shelves under one. A diary entry's Attachments
// field has no bar and cannot be given one: its fence holds six other fields
// and a `header:` line in it would claim every one of them. So the second
// category rendered as a second card at the same level as the first.
describe("where a second category goes when no bar owns the shelves", () => {
  it("is the same predicate that hosts the categories door", () => {
    // One rule, said once: where a bar owns the shelves it names the section
    // and they are equal siblings under it; where none does, the FIRST shelf
    // is the section and the rest nest in its card.
    const src = widgets();
    expect(src).toContain(
      'const nestInto =\n          kind === "attach" && shelfHeader === -1 ? shelfBody : null;'
    );
    expect(src).toContain("let shelfBody: HTMLElement | null = null;");
  });

  it("opens the section on the first shelf and nests every later one", () => {
    const src = widgets();
    // The first shelf hands back the body the rest build into; a later one is
    // already inside it, so it is not a block of this fence at all and skips
    // the card, the name and the field band below.
    expect(src).toContain(
      'if (kind === "attach" && shelfHeader === -1) {\n          if (nestInto) continue;\n          shelfBody = widget.querySelector(".ca-journal-attach-body");\n        }'
    );
    // THE CLASS IS THE CONTRACT, and as of §4 the body it marks is the
    // SECTION's where this field drew one — exactly one element per widget
    // carries it, because the read above is a `querySelector` and two nested
    // candidates would be answered by document order rather than by intent.
    expect(attach()).toContain(
      '(shelves ?? chrome.body).addClass("ca-journal-attach-body");'
    );
  });

  it("builds the SAME head nested as it does unnested (1.0.49 §3)", () => {
    // *"the diary and journal attachment sections should look more similar."*
    // The nested shelf had a `shelfHead` of its own — a hand-built label row
    // with a tools div and no fold — written because a card inside a card would
    // be a box in a box. True, and already handled by the stand-down rule
    // below: so the hand-built head is gone and a nested shelf asks for the
    // ordinary field head, which is the head a journal shelf wears.
    const src = attach();
    expect(src).not.toContain("function shelfHead");
    expect(src).toContain("const chrome = fieldHead({");
    expect((src.match(/fieldHead\(\{/g) ?? []).length).toBe(1);
    // AND NO SHELF BORROWS A BAR, which was `nested ? false : titled` until
    // 1.0.74 and is now not asked at all — see "the name of a lone category"
    // below. The branch of `fieldHead` that WITHHOLDS a head is unreachable
    // from here, and a shelf with no head of its own cannot be drawn.
    //
    // READ OFF THE CALL AND NOT OFF THE FILE. `not.toContain("barActions")` on
    // the whole module passes nothing and fails on `AttachToolbarActions`,
    // which ends in those letters — the prefix trap this codebase keeps
    // meeting, met here on a suffix.
    const call = src.slice(src.indexOf("const chrome = fieldHead({"));
    const args = call.slice(0, call.indexOf("});"));
    expect(args).not.toContain("titled");
    expect(args).not.toContain("barActions");
    expect(args.match(/\n\s*\w+,/g)).toEqual(["\n    wrap,", "\n    key,", "\n    label,", "\n    store,"]);
    // A FOLD OF ITS OWN COMES WITH THE HEAD, keyed per category off the store
    // that was already threaded through here — and off the SAME store the
    // section's own fold uses, since both are this note's fields.
    expect(src).toContain("const store = fieldFoldStore(deps, ctx.sourcePath);");
    expect(src).toMatch(
      /const chrome = fieldHead\(\{[\s\S]{0,900}\n {4}store,\n {2}\}\);/
    );
  });

  it("nests into the section's body rather than into the fence", () => {
    // The wrapper is created INSIDE the host, so the loop has nothing to append
    // — which is what the `continue` above is for.
    const src = attach();
    expect(src).toContain("root = nestInto\n      ? nestInto.createDiv({ cls: shelfCls })");
    // AND THE FIRST SHELF IS CREATED INSIDE THE SECTION IT JUST DREW, with the
    // same class a later one gets — which is the whole of "every shelf is a
    // shelf".
    expect(src).toContain(
      "const wrap = shelves ? shelves.createDiv({ cls: shelfCls }) : root;"
    );
    expect(src).toContain(
      "const shelfCls = `ca-journal-attach ca-journal-attach-shelf ca-journal-attach--${key}`;"
    );
  });

  it("gives the section a head of its own, not the first category's (§4)", () => {
    // *"I do think it would be better if the diary also had a distinct
    // headerbar instead of the first categorie doing double duty."* The head
    // cannot come from the note — a `header:` line in a diary entry's shared
    // fence claims Tasks and every field after it, which is the fact that made
    // the first shelf the section in §2 — so the renderer draws it.
    const src = attach();
    expect(src).toContain('export const ATTACH_SECTION_TITLE = "Attachments";');
    expect(src).toMatch(
      /if \(ownsCategories\) \{[\s\S]{0,200}fieldFrame\(\s*root,\s*\{ title: ATTACH_SECTION_TITLE \},/
    );
    // A CONSTANT AND NOT THE FIRST LABEL, which is the point: a section named
    // after its first category is the double duty this removes, and renaming
    // that category would otherwise rename the section.
    expect(src).not.toMatch(/fieldFrame\([\s\S]{0,60}\{ title: label/);
    // THE DOOR GOES ON THAT HEAD, in the same place a bar hosts it.
    expect(src).toMatch(
      /headTools\(section\.frame\.root\)\.appendChild\(\s*buildCategoriesGlyph\(deps, ctx, ATTACH_SECTION_TITLE\)/
    );
    // AND IT IS NO LONGER ON A SHELF. `ownsCategories` used to put the cog in
    // the first shelf's own tools slot; two doors onto one list is what the
    // per-shelf ✕ was removed for.
    expect(src).not.toContain(
      'tools.appendChild(buildCategoriesGlyph(deps, ctx, label ?? ""));'
    );

    // ITS FOLD IS ITS OWN. Keyed off the first shelf so two barless fences in
    // one note fold separately, and `#` cannot appear in a category key — so
    // the section's chevron can never be the shelf's.
    expect(src).toContain("`${key}#shelves`");

    // THE FIRST SHELF SITS UNDER A HEAD, NOT UNDER A SHELF, so the between-shelves
    // gap comes off it.
    expect(cssRule(".ca-journal-attach-shelf:first-child")).toContain(
      "margin-top: 0"
    );

    // AND BOTH EXITS HAND BACK THE SECTION, not the shelf inside it. There are
    // two: the invalid-key error and the ordinary end. `wrap` is a child of the
    // section's body on this path, so returning it would hand the caller a node
    // to re-parent OUT of the head that was just drawn — the error would land
    // on a bare shelf and the section would never reach the page. The error
    // path is the one a type checker cannot tell apart, since both are
    // elements.
    expect((src.match(/^ {2,4}return root;$/gm) ?? []).length).toBe(2);
    expect(src).not.toContain("return wrap;");
  });

  it("gives every shelf its name and its two buttons on one line", () => {
    const src = attach();
    // THE NAME COMES FROM THE FIELD HEAD, which is what makes a nested shelf
    // and a journal shelf the same thing. `label` is the directive's, so a
    // shelf with no `|Label` falls into the branch that draws no head at all —
    // unchanged, and the reason `head()` can return null.
    expect(src).toContain("const chrome = fieldHead({");
    expect(src).toMatch(/const chrome = fieldHead\(\{\s*wrap,\s*key,\s*label,/);
    // ONE LINE, NOT A ROW OF ITS OWN — and in BOTH sections as of 1.0.49 §3.
    // `actions()` is the level-1 actions slot, `flex: 1 0 100%`, so a Resources
    // section with three shelves was four rows of chrome over three empty drop
    // zones.
    expect(src).toContain("const tools = chrome.head() ?? chrome.actions();");
    expect(src).toContain(
      "buildAttachToolbar(deps, tools, { ingestFiles, add, persist, render });"
    );
    // THE PILLS ARE `<button>`s, SO THE 30px RESET — fifth time this release.
    // They sat on a row of their own, where 30px is just a tall row; on the
    // title row an unreset pill inflates `--ca-sec-bar-h` on every shelf head.
    const pill = cssRule(".ca-journal-attach-btn");
    expect(pill).toContain("height: auto");
    expect(pill).toContain("min-height: 0");
    // THE SLOT IS SIZED FOR CONTROLS, not for one icon.
    expect(cssRule(".ca-journal-head-tools")).toContain("gap: var(--ca-space-2)");
  });

  it("reads as nested with nothing but the card it is in (1.0.49 §3)", () => {
    // A band inside a card that already has a border, a fill and a fold would
    // be a box in a box — which is why the nested shelf never had a card. What
    // it DID have was an indent and a left hairline, and on the reader's call
    // those are gone too: *"no indent at all"*, so the shelf sits flush exactly
    // as a journal shelf sits under its bar, and the card's own border is the
    // only thing saying the shelf belongs to it.
    const rule = cssRule(".ca-journal-attach-shelf");
    expect(rule).not.toContain("padding-left:");
    expect(rule).not.toContain("border-left:");
    expect(rule).not.toContain("background:");
    expect(rule).not.toContain("border-radius:");
    // WHAT SURVIVES IS NOT NESTING AT ALL: the gap between two shelves.
    expect(rule).toContain("margin: var(--ca-space-3) 0 0");

    // AND THE FLATTENING IS THE RULE THAT WAS ALREADY THERE. A `.ca-journal-field`
    // inside another fold stands its card down to a flat head with a hairline —
    // which is both why the hand-built head was unnecessary and why a nested
    // shelf now looks like a journal one. The middle selector is the nested case.
    const stood = cssRule(
      ".ca-journal-sec-fold .ca-journal-sec-fold.ca-journal-field"
    );
    expect(stood).toContain("background: none");
    expect(stood).toContain("border: none");
    expect(stood).toContain("border-radius: 0");

    // The hand-built head's classes go with it rather than being left to style
    // an element nothing builds — the 3.19.2 mistake in reverse.
    const css = readCss();
    expect(css).not.toContain(".ca-journal-attach-shelf-head");
    expect(css).not.toContain(".ca-journal-attach-shelf-name");
    expect(attach()).not.toContain("attach-shelf-head");
    expect(attach()).not.toContain("attach-shelf-name");
  });

  it("leaves a fence a bar DOES own exactly as it was", () => {
    // Study's three shelves stay three equal cards under one Resources bar —
    // `shelfHeader` is that bar's index there, so `nestInto` is null for all
    // three and nothing about this round reaches them.
    const src = widgets();
    expect(src).toContain("shelfHeader === headerIndex - 1");
    expect(src).toMatch(/kind === "attach" && shelfHeader === -1/);
    const lines = studyComposed("Topic Index.md", ["banner", "resources"]).split("\n");
    expect(lines.filter((l) => /^\s*attach:/.test(l)).length).toBe(3);
    expect(lines.filter((l) => l.trim() === "header:📎 Attachments").length).toBe(1);
  });
});

describe("the duplication it removes", () => {
  it("Study's Topic index has three shelves and one Attachments header", () => {
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
    const resources = lines.filter((l) => l.trim() === "header:📎 Attachments");
    expect(resources.length).toBe(1);
  });

  it("a fence with no shelves gets no button and no glyph", () => {
    // TWO HALVES SINCE 1.0.49, because -1 stopped meaning "nobody". The bar
    // button still asks `shelfHeader === headerIndex - 1`, and -1 never equals
    // a header index, so the Review, Charts and Lessons bars are untouched. The
    // glyph asks for -1 — which such a fence does have — and is saved by the
    // other half of its condition: `firstShelf` is null for a fence with no
    // `attach:` line, and no line's text equals null.
    const src = widgets();
    expect(src).toContain("return -1;");
    expect(src).toContain('lines.find((l) => keywordOf(l) === "attach")?.trim() ?? null');
    expect(src).toContain("line.trim() === firstShelf");
  });
});

// 1.0.49 §4: *"Rename this section to 'Attachments' for both the diary and
// journal."* The two halves were `📚 Resources` (journal) and `Attachments`
// (diary), which is the same section under two names, so the catalogue entry
// moved to the reader's word. What may NOT move with it is the id: `locate`
// finds the section by its `attach:` directive, and a stored template names it
// by id — a renamed id is a template that no longer resolves.
describe("the name both halves go by (§4)", () => {
  const resources = (): JournalSection => {
    const found = JOURNAL_SECTIONS.find((s) => s.id === "resources");
    if (!found) throw new Error("the resources section is gone");
    return found;
  };

  const headerOf = (sec: JournalSection): string => {
    const fence = sec.render({} as never).find((b) => b.kind === "fence");
    const line = (fence as { lines: string[] }).lines.find((l) =>
      l.startsWith("header:")
    );
    return line?.slice("header:".length) ?? "";
  };

  it("is the reader's word in the catalogue, under the old id", () => {
    expect(resources().label).toBe("Attachments");
    // THE ID IS NOT PART OF THE RENAME. It is the join between a stored
    // template's section list and this entry, and it is not shown anywhere.
    expect(resources().id).toBe("resources");
  });

  it("writes that name into a new section, and offers it in the title box", () => {
    // DERIVED FROM ONE SPELLING RATHER THAN ASSERTED TWICE. The placeholder is
    // the greyed text in *Edit sections…*' title box; the header line is what
    // the renderer writes if the reader leaves it alone. A box that suggests a
    // different name from the one the section gets is the bug this forbids.
    const sec = resources();
    const box = sec.questions?.({} as never)?.find((q) => q.kind === "title");
    expect(box?.placeholder).toBe(headerOf(sec));
    expect(headerOf(sec)).toContain("Attachments");
    expect(headerOf(sec)).not.toContain("Resources");
  });

  it("does not say the name twice, on either half", () => {
    // THE DOUBLE DUTY IN WORDS. §4 took the section's head off the first
    // category; a category NAMED `Attachments` under a head that already says
    // `Attachments` puts it back as a label. The journal's ships as `Files`
    // under its `header:` bar.
    const fence = resources().render({} as never).find((b) => b.kind === "fence");
    const shelves = (fence as { lines: string[] }).lines.filter((l) =>
      l.startsWith("attach:")
    );
    expect(shelves).toEqual(["attach:resources|Files"]);

    // AND THE DIARY'S IS `Files & Links` AS OF §5, which is the reader's word
    // and the end of the §4 measurement rather than a reversal of it. The label
    // could not move alone — `plain-markdown.ts` exports a region under the
    // directive's own label, and `fields.ts` is the per-region registry a sweep
    // compares that export against — so what §4 measured was one half of a
    // two-part rename. Both halves move together here, and `fields.test.ts`
    // reconstructs the whole template out of the registry either way.
    expect(ENTRY_ATTACH_CATEGORIES.map((c) => c.label)).toEqual([
      "Files & Links",
      "Images",
    ]);
    expect(ENTRY_ATTACH_CATEGORIES[0].key).toBe("attachments");
    for (const grain of ["daily", "weekly", "monthly", "quarterly", "yearly"] as const) {
      const text = composeEntryTemplate(grain);
      expect(text, grain).toContain("attach:attachments|Files & Links\n");
      expect(text, grain).toContain("attach:images|Images\n");
      expect(text, grain).not.toContain("|Attachments");
    }
  });

  it("left the old name only where a reader already typed it", () => {
    // `📚 Resources` survives in no shipped default. It survives in notes — a
    // note carrying that `header:` line keeps it, because the line is the
    // reader's text and the fold key is built from it — which is why there is
    // no migration and nothing to sweep for in `src/`.
    const src = readCode("journal-sections");
    expect(src).not.toContain("📚 Resources");
  });
});

// ── THE NAME OF A LONE CATEGORY (1.0.74) ───────────────────────────────────
//
// *"Files title is missing on the attachments section despite it existing"*,
// with two screenshots of a Study topic: 📎 Attachments, two buttons, a drop
// zone — and the Categories window open beside it listing one category called
// Files that the section never says the name of.
//
// THE CAUSE WAS `fenceTitled && soleField`, the dispatcher's rule for every
// field kind: a bar that names the fence names the one field under it, so that
// field withholds its own head and puts its controls on the bar. Right for a
// `checklist` section's single `tasks:` — the bar and the field are the same
// thing said twice. Wrong for a shelf, and §4 is where it stopped being right:
// a section's name became a CONSTANT rather than its first category's, so a bar
// over shelves names the SECTION and there is no count of shelves at which it
// starts naming one of them.
//
// WHAT IT COST, said as a shape worth recognising: a NAME that appeared and
// disappeared with an unrelated COUNT. One category drew no head; adding a
// second gave both of them one. Same family as 1.0.73's missing ✕ — a control
// or a label that goes missing rather than explaining itself — and the same
// answer: draw it, and let what the line says decide what it reads.
describe("the name of a lone category (1.0.74)", () => {
  const resources = (): JournalSection => {
    const found = JOURNAL_SECTIONS.find((s) => s.id === "resources");
    if (!found) throw new Error("the resources section is gone");
    return found;
  };

  it("ships one named category under a differently named bar", () => {
    // THE FIXTURE IS THE DEFECT'S OWN SHAPE: one `attach:` line, a `header:`
    // bar over it, and two different words. The section drew the bar's and
    // never the line's.
    const fence = resources().render({} as never).find((b) => b.kind === "fence");
    const lines = (fence as { lines: string[] }).lines;
    const shelves = lines.filter((l) => l.startsWith("attach:"));
    expect(shelves).toEqual(["attach:resources|Files"]);
    expect(lines.filter((l) => l.startsWith("header:"))).toHaveLength(1);
    expect(lines[0]).toContain("Attachments");
    expect(lines[0]).not.toContain("Files");
  });

  it("takes neither of the arguments that could take that name away", () => {
    // READ OFF THE SIGNATURE, because a default parameter is how the coupling
    // would come back: a caller that stops passing `titled` leaves the
    // parameter sitting there for the next one to pass again.
    const src = attach();
    const at = src.indexOf("export function buildAttachments(");
    expect(at).toBeGreaterThan(-1);
    const sig = src.slice(at, src.indexOf("): HTMLElement {", at));
    expect(sig).toContain("label: string | null,");
    expect(sig).toContain("ownsCategories = false,");
    expect(sig).toContain("nestInto: HTMLElement | null = null");
    expect(sig).not.toContain("titled");
    expect(sig).not.toContain("barActions");
  });

  it("is the one field kind the dispatcher does not title from the fence", () => {
    // AND THE CONTRAST IS THE POINT. The rule is not withdrawn — six kinds
    // still take both arguments, and `section-frame.test.ts` holds the sweep
    // that keeps them honest. Only the shelf opts out, because only the shelf
    // sits under a bar that names something else.
    const src = widgets();
    const arm = src.slice(src.indexOf('case "attach":'));
    const call = arm.slice(0, arm.indexOf("break;"));
    expect(call).toContain("buildAttachments(this, rest, ctx, label, ownsCategories, nestInto)");
    expect(call).not.toContain("fenceTitled");
    expect(call).not.toContain("barActions");
    expect(src).toContain("buildTasks(this, rest, ctx, label, fenceTitled, barActions)");
  });

  it("still draws nothing for a line that names nothing", () => {
    // THE OTHER HALF OF `fieldHead`'S FIRST BRANCH, and it is the half that
    // keeps this from being a head drawn unasked: `attach:scratch` with no `|`
    // has no name, and a bar ruled across a card for no reason is what that
    // refusal is for. So the answer follows the LINE, not the count of lines.
    expect(readCode("note-field")).toContain("if (opts.titled || !label) {");
  });
});

// ── THE THREE SHAPES A SHELF CAN DRAW (1.0.49 §6) ──────────────────────────
//
// *"now implement format options into the category editor for different ways to
// render the documents/links/images. I'm thinking default (kitchen sink, how it
// is now), image gallery (makes image previews larger), ordered lists (good for
// links)."*
//
// The model is tested in `attach-categories.test.ts`; this is the half that
// reaches the page — the class the zone wears, the lane each item goes down,
// and the control that chooses.
describe("the shape a shelf draws (§6)", () => {
  // Every `minmax(Npx` floor under a selector, base rule and container query
  // alike — `cssRules` walks into `@container`, so both come back from one
  // call and the narrow width is checked by the same assertion as the wide one.
  const floors = (selector: string): number[] =>
    [...cssRule(selector).matchAll(/minmax\((\d+)px/g)].map((m) => Number(m[1]));

  it("wears the format's own class, and the default wears none", () => {
    const src = attach();
    // OFF THE ONE DECLARATION. The class is looked up rather than composed, so
    // the stylesheet's selector and this element's class are the same string in
    // the same place — and `default`'s `null` is what makes a note nobody has
    // asked about render through exactly the rules it did before.
    expect(src).toContain(
      'const formatCls = ATTACH_FORMATS.find((f) => f.value === format)?.cls;'
    );
    expect(src).toContain("if (formatCls) zone.addClass(formatCls);");
    expect(ATTACH_FORMATS.find((f) => f.value === "default")?.cls).toBeNull();

    // And every class that exists is styled. Derived from the declaration, so
    // a fourth format cannot ship a class the stylesheet has never heard of.
    for (const f of ATTACH_FORMATS) {
      if (!f.cls) continue;
      const rules =
        cssRules(`.ca-journal-attach-zone.${f.cls} .ca-journal-attach-gallery`)
          .length +
        cssRules(`.ca-journal-attach-zone.${f.cls} .ca-journal-attach-chips`)
          .length;
      expect(rules, f.value).toBeGreaterThan(0);
    }
  });

  it("reads the format off the same `#` head the key comes off", () => {
    // `noteKeyOf` has stripped flags since 1.0.42, so this cannot be mistaken
    // for part of a region key — and going through `splitArgHead` is what keeps
    // the two halves of one parse from drifting.
    const src = attach();
    expect(src).toContain(
      "const format = attachFormatOf(splitArgHead(rest).tokens);"
    );
    expect(src).not.toContain('rest.split("#")');
  });

  it("makes the gallery's previews bigger at both widths", () => {
    // COMPARED, NOT RESTATED. Asserting "220px" here would be the same number
    // written in two places, which is what §4 learned not to do: the claim is
    // that this format is LARGER than the default, at the wide width and at the
    // narrow one, and that is what is measured.
    const plain = floors(".ca-journal-attach-gallery");
    const big = floors(
      ".ca-journal-attach-zone.is-gallery .ca-journal-attach-gallery"
    );
    expect(plain).toHaveLength(2);
    expect(big).toHaveLength(2);
    big.forEach((n, i) => expect(n).toBeGreaterThan(plain[i]));
    // `auto-fill` is kept, which is why a floor is the control at all: one
    // image fills one column rather than stretching across the note.
    expect(
      cssRule(".ca-journal-attach-zone.is-gallery .ca-journal-attach-gallery")
    ).toContain("auto-fill");
    expect(
      cssRule(".ca-journal-attach-zone.is-gallery .ca-journal-attach-thumb")
    ).toContain("aspect-ratio");
  });

  it("sends everything down one lane in list form, numbered", () => {
    const src = attach();
    // THE FORMAT IS ASKED BEFORE THE KIND, which is the whole of the reader's
    // *"images should not have a preview, just the link to them"*: in `list`
    // the gallery lane is left empty and an image is a numbered chip like
    // everything else.
    expect(src).toContain(
      'const tiled = format === "list" ? [] : items.filter((a) => a.kind === "image");'
    );
    expect(src).toContain('if (format !== "list" && item.kind === "image")');
    // ONE FLAG CARRIES BOTH THE NUMBER AND THE CHEVRONS' ENDS, and it is the
    // LENGTH rather than the ordinal: `index` is already this row's position,
    // so a separate number would be the same fact passed twice.
    expect(src).toContain('format === "list" ? items.length : null');
    expect(src).toContain('cls: "ca-journal-attach-index",');
    // A READER COUNTS FROM ONE.
    expect(src).toContain("text: `${index + 1}.`,");

    // The lane becomes a column, and a column that cannot wrap into a second
    // one beside itself — which is what a height cap on a fold would do to it.
    const lane = cssRule(
      ".ca-journal-attach-zone.is-list .ca-journal-attach-chips"
    );
    expect(lane).toContain("flex-direction: column");
    expect(lane).toContain("flex-wrap: nowrap");
    expect(cssRule(".ca-journal-attach-index")).toContain("tabular-nums");
  });

  it("gives every row the height of the kind with two lines", () => {
    // *"some links have a subtext while others don't, so make the ones that
    // don't the same size as the ones that do."* A chip's body is one line or
    // two — a captioned link shows its host underneath — and in a numbered
    // column that is a list of two different heights.
    const body = cssRule(
      ".ca-journal-attach-zone.is-list .ca-journal-attach-chip-body"
    );
    expect(body).toContain("min-height");
    // COMPUTED FROM THE TYPE, NOT TYPED IN: the title's own line box plus the
    // sub's, so the tokens stay the only place a size is stated. A literal
    // height here would be the same number derived twice.
    expect(body).toContain("var(--ca-text-2xs)");
    expect(body).not.toMatch(/min-height:\s*[\d.]+(px|em|rem);/);
    // And the lone line sits in the middle of the room it was given, which is
    // what puts it level with the icon and the number beside it.
    expect(body).toContain("justify-content: center");
    // And the body is what takes the width of the row, which is also what
    // pushes the two move chevrons to its right-hand end.
    expect(body).toContain("flex: 1 1 auto");
  });

  it("puts two move chevrons on a numbered row, and only there", () => {
    // *"The ordered list needs chevrons on the cards themselves."* An ordered
    // list is about its order, and dragging was the only way to change one.
    const src = attach();
    expect(src).toContain('cls: "ca-journal-attach-move"');
    expect(src).toContain('move(-1, "chevron-up", "up");');
    expect(src).toContain('move(1, "chevron-down", "down");');
    // `listOf` IS THE WHOLE CONDITION — the same flag the number is on, so a
    // gallery's tiles and a wrapping row of chips, where "up" and "down" name
    // nothing a reader can see, do not get them.
    // ANCHORED ON THE BLOCK ITSELF, not on a gap wide enough to reach it: a
    // mutant that opened this with `if (true)` was matched by the SPAN from
    // the number's own `listOf` test down to the chevrons, and survived
    // (1.0.49 §6). Both uses are counted too, so one cannot quietly go.
    expect(src).toContain("if (listOf !== null) {\n    const move = ");
    expect((src.match(/if \(listOf !== null\) \{/g) ?? []).length).toBe(2);
    // THROUGH THE DRAG'S OWN HANDLER, so one definition of what moving a row
    // means and one write behind both gestures.
    expect(src).toContain("cb.onReorder(index, to);");
    // An end of the list is drawn as an end rather than silently doing
    // nothing, which is the Categories window's rule one level up.
    expect(src).toContain('btn.toggleClass("is-static", !can);');
    expect(src).toContain("is already ${delta < 0 ? \"first\" : \"last\"}");
    // A control inside the chip is not the chip being pressed.
    expect(src).toMatch(/e\.stopPropagation\(\);\n {8}if \(!can\) return;/);
    // AND THE 30px RESET: app.css gives every button `--input-height`, and
    // nothing but this pair in this rule escapes it.
    const btn = cssRule(".ca-journal-attach-move");
    expect(btn).toContain("height: auto");
    expect(btn).toContain("min-height: 0");
    expect(cssRule(".ca-journal-attach-move.is-static")).toContain("opacity");
  });

  it("puts one shape button on every row of the window", () => {
    const src = readCode("attach-categories-editor");
    // The icon, both sentences and the step are all the declaration's — the
    // window holds no list of formats of its own.
    expect(src).toContain('cls: "ca-journal-btn-ghost ca-attach-cats-format"');
    expect(src).toContain("const then = nextAttachFormat(row.format, row.others);");
    // AND IT IS DRAWN, IN THE SLOT IT BELONGS IN. Measured: a mutant that
    // deleted the CALL and left the builder standing passed every assertion in
    // this case, because they were all about the definition (1.0.49 §6). The
    // position is pinned with it — between what the category holds and the
    // arrows that move it, which is where the reader was shown it.
    expect(src).toMatch(
      /cls: "ca-tags-count"[\s\S]*?\n {6}fmt\(\);[\s\S]*?"ca-journal-btn-ghost ca-attach-cats-move"/
    );
    // ONE OF THEM. A second call draws a second button, and the ordering
    // assertion above is satisfied by the first — measured (1.0.49 §6).
    expect((src.match(/^ {6}fmt\(\);$/gm) ?? []).length).toBe(1);
    expect(src).toContain("setIcon(btn.createSpan({ cls: \"ca-journal-btn-icon\" }), now.icon);");
    // THE ICON IS THE READING, not the action: a cycling control has to say
    // what it is on now, and the sentence names both halves.
    expect(src).toMatch(/aria-label[\s\S]{0,40}why/);
    expect(src).toContain("Press for");
    // No spelling of a format lives here.
    expect(src).not.toContain("Image gallery");
    expect(src).not.toContain('"gallery"');
    // A new row is every format's to choose, because an empty category holds
    // nothing that is not an image.
    expect(src).toMatch(/others: 0,[\s\S]{0,80}format: "default",/);
  });

  it("hands the window the two numbers its controls answer to", () => {
    // What it holds decides whether the ✕ is live; how much of that is not an
    // image decides whether the gallery is offered. Both read when the door is
    // pressed rather than when the shelf was built, like the count always was.
    expect(attach()).toMatch(
      /items: categoryItemCount\(text, cat\.key\),[\s\S]{0,400}others: categoryNonImageCount\(text, cat\.key\),[\s\S]{0,80}format: attachFormatOf\(cat\.tokens\),/
    );
  });
});
