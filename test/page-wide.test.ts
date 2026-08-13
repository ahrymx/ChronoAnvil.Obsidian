// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// A page that asks for its own width — 4.11.
//
// WHAT THIS RELEASE ACTUALLY CHANGED, so the assertions have something to be
// about. The homepage has been 1100px wide since 4.2, through `cssclasses:
// almanac-wide` in its frontmatter, and no other dashboard could ask for the same
// thing: frontmatter is out of a post-processor's reach and repair deliberately
// never edits it. So a width was a property of one composed note rather than a
// setting anybody could change.
//
// 4.11 makes it a line in the note — `wide`, in the block that draws the page's
// title — with a toggle in the cog that writes one. Three parts, and each is
// tested here: the grammar (what a fence's `wide` line says, or why it is
// refused), the pair that reads and writes it in a whole note, and the one CSS
// rule that turns the marker into a width without outranking a theme.

import { describe, expect, it } from "vitest";
import {
  WIDE_KEYWORD,
  isWideLine,
  parseWide,
} from "../src/core/directive-grammar";
import {
  composeFlatNote,
  pageIsWide,
  setPageWide,
} from "../src/core/note-sections";
import { widgetCount, widgetRun } from "../src/core/cell-move";
import {
  composeHomeNote,
  homeSectionModel,
  homeSections,
} from "../src/diary/home-sections";
import { composeSearchNote } from "../src/diary/search-sections";
import { DEFAULT_PATHS } from "../src/core/constants";
import { readCode, readCss } from "./sources";

const ROOT = DEFAULT_PATHS.diaryRoot;
const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
// Every section the homepage composes, so a `want` in these tests is about the
// width rather than about accidentally adding or removing something else.
const composedIds = homeSections(ROOT)
  .filter((s) => !s.optIn)
  .map((s) => s.id);
const withoutHead = composedIds.filter((id) => id !== "title");

// A page as the three shared catalogues compose one: a head carrying ids, then a
// block of its own.
const HEADED = [
  "`almanac:spacer`",
  "```almanac",
  "title:home,diary,journals",
  "```",
  "",
  "```almanac",
  "header:⏳ Open Tasks",
  "tasks-table:,period",
  "```",
  "",
].join("\n");

describe("what a `wide` line says", () => {
  it("is a bare keyword, like `row`", () => {
    expect(parseWide([WIDE_KEYWORD, "title"])).toEqual({
      wide: true,
      error: null,
    });
    expect(isWideLine("wide")).toBe(true);
    // EXACT, so a future `wide-something` directive is not swallowed by it.
    expect(isWideLine("wide-screen")).toBe(false);
    expect(isWideLine("title")).toBe(false);
  });

  it("says nothing about a fence that has no such line", () => {
    // THE PROPERTY THAT MAKES THIS A MINOR RATHER THAN A BREAKING CHANGE, and it
    // is the same one `frame:` and `row` are asserted on: every note written
    // before the modifier existed renders exactly as it did.
    expect(parseWide(["title", "links:today"])).toEqual({
      wide: false,
      error: null,
    });
    expect(parseWide([])).toEqual({ wide: false, error: null });
  });

  it("refuses a value, and names the one that was written", () => {
    // A page is either wide or it is not. Naming the value is what tells a reader
    // who wrote `wide: yes` that the LINE was understood and the argument was not
    // — the distinction a bare "refused" leaves them to guess at.
    const spec = parseWide([WIDE_KEYWORD + ": yes", "title"]);
    expect(spec.wide).toBe(false);
    expect(spec.error).toContain("wide: yes");
    expect(spec.error).toContain("delete the line");
  });

  it("refuses two of them, because a page is one width", () => {
    const spec = parseWide([WIDE_KEYWORD, WIDE_KEYWORD, "title"]);
    expect(spec.wide).toBe(false);
    expect(spec.error).toContain("2 wide lines");
  });

  it("refuses one in a fence that does not carry the page's title", () => {
    // THE SCOPE, REFUSED RATHER THAN RESOLVED — `parseFrame`'s rule for `frame:
    // section` beside a `header:`, applied to a scope instead of a contradiction.
    // A page has one width, so the line has one home, and the head is the block
    // that is already about the page rather than about something on it.
    //
    // The alternative is worse in both directions: honouring it anywhere would
    // make a page's width depend on which of five blocks a reader typed it in,
    // and ignoring it silently would leave them looking at a line that does
    // nothing.
    const spec = parseWide([WIDE_KEYWORD, "tasks-table:,period"]);
    expect(spec.wide).toBe(false);
    expect(spec.error).toContain("title");
    expect(spec.error).toContain("Move it");
  });

  it("is structure, so a widget leaving the block leaves it behind", () => {
    // ASSERTED THROUGH `widgetRun` RATHER THAN ON THE SET, and asserted SEPARATELY
    // from the page head's own refusals — that separation is the point. `moveCell`
    // refuses to move the head's block at all, so a test that only ever asked
    // about a head would look true whether or not this was. A width that travelled
    // into a row would be a page silently rewidened by a drop.
    expect(widgetCount([WIDE_KEYWORD, "tasks-table"])).toBe(1);
    expect(widgetRun([WIDE_KEYWORD, "tasks-table"])).toEqual({ from: 1, to: 2 });
  });
});

describe("reading and writing a page's width", () => {
  it("reads the head's own fence and nothing else", () => {
    expect(pageIsWide(HEADED)).toBe(false);
    expect(pageIsWide(setPageWide(HEADED, true)!)).toBe(true);
    // A `wide` line in another block is refused by the grammar, so it is not a
    // width — and this must agree with that rather than have its own opinion.
    const elsewhere = HEADED.replace(
      "header:⏳ Open Tasks",
      `${WIDE_KEYWORD}\nheader:⏳ Open Tasks`
    );
    expect(pageIsWide(elsewhere)).toBe(false);
  });

  it("puts the line first in the head's body", () => {
    // WHERE `composeFlatNote` ALREADY PUTS `row`, and outside `widgetRun`'s
    // content span — which is what keeps it behind when the widget under it
    // leaves.
    const out = setPageWide(HEADED, true)!;
    expect(out).toContain(`\`\`\`almanac\n${WIDE_KEYWORD}\ntitle:home,diary,journals`);
  });

  it("restores the file byte-for-byte on off-then-on", () => {
    // The promise `insertionPoint`'s own comment makes about sections, asked of a
    // modifier: a toggle a reader flips twice must leave them the file they had.
    const on = setPageWide(HEADED, true)!;
    expect(setPageWide(on, false)).toBe(HEADED);
    const home = composeHomeNote(ROOT);
    const off = setPageWide(home, false)!;
    expect(setPageWide(off, true)).toBe(home);
  });

  it("writes nothing when nothing would change", () => {
    // NULL RATHER THAN THE SAME TEXT, which is `moveCell`'s and
    // `applyFlatSections`' convention: a caller that writes on null touches a
    // reader's file to leave it identical, and the modified time then lies about
    // their vault for sync to propagate.
    expect(setPageWide(HEADED, false)).toBeNull();
    expect(setPageWide(composeHomeNote(ROOT), true)).toBeNull();
  });

  it("has nothing to say about a note with no head", () => {
    // ONE ANSWER FOR TWO QUESTIONS, deliberately: there is no line to write and
    // no second sentence to invent, and the cog is not drawn there either —
    // `buildPageTitle` IS the head.
    const headless = "`almanac:spacer`\n\n```almanac\ntasks-table\n```\n";
    expect(pageIsWide(headless)).toBe(false);
    expect(setPageWide(headless, true)).toBeNull();
    expect(setPageWide(headless, false)).toBeNull();
  });

  it("takes every `wide` line out, not the first", () => {
    // Two of them is a refusal. A toggle that removed one and left one would turn
    // a refused fence into an honoured one, which is the grammar resolving a
    // contradiction it declined to resolve.
    const twice = HEADED.replace(
      "title:home,diary,journals",
      `${WIDE_KEYWORD}\n${WIDE_KEYWORD}\ntitle:home,diary,journals`
    );
    expect(setPageWide(twice, false)).toBe(HEADED);
  });

  it("survives a section reorder, and goes when the head goes", () => {
    // THE WIDTH FOLLOWS THE HEAD, which is what `:has(.jtc-card)` already means
    // for Obsidian's own title: remove the section and the page narrows, with no
    // stale declaration left saying otherwise. Asserted so nobody "fixes" it.
    const model = homeSectionModel(ROOT);
    const home = composeHomeNote(ROOT);
    expect(pageIsWide(home)).toBe(true);
    const gone = model.apply(home, withoutHead)!;
    expect(gone).not.toContain("title");
    expect(gone).not.toContain(WIDE_KEYWORD);
    expect(pageIsWide(gone)).toBe(false);
  });

  it("comes back with the head, because the catalogue composes both", () => {
    const model = homeSectionModel(ROOT);
    const home = composeHomeNote(ROOT);
    const gone = model.apply(home, withoutHead)!;
    const back = model.apply(gone, composedIds);
    expect(back).toBe(home);
  });

  it("leaves Search narrow until somebody asks", () => {
    // The three shared catalogues compose a head with no `wide` line, so nothing
    // is silently rewidened by upgrading — a reader who wants it asks the cog.
    expect(pageIsWide(composeSearchNote(ROOT))).toBe(false);
    expect(composeSearchNote(ROOT)).not.toContain(`\n${WIDE_KEYWORD}\n`);
  });
});

describe("the toggle that writes it", () => {
  // COMMENTS STRIPPED, which is what `readCode` is for and a trap every file in
  // this project sets: page-title.ts argues at length about why the page's NAME is
  // not a frontmatter property, so a bare `not.toContain("frontmatter")` over the
  // source would fail on the paragraph explaining why there is none.
  const head = readCode("page-title");

  it("is a third item on the cog, under a separator", () => {
    // The two items above act on the page's SECTIONS and this acts on the page.
    // One list of three would read as three ways of editing the same thing.
    const code = readCode("page-title");
    expect(code).toContain("menu.addSeparator()");
    expect(code).toContain('.setTitle("Wide page")');
    expect(code.indexOf("menu.addSeparator()")).toBeGreaterThan(
      code.indexOf('.setTitle("Add a section…")')
    );
  });

  it("reads its checkmark off the card, not off the file", () => {
    // The class was put there by the render, FROM the note, and the menu is built
    // on click — so the marker is the note's answer by construction, and a second
    // read would be a second source of truth for one fact.
    const code = readCode("page-title");
    expect(code).toContain("card.hasClass(WIDE_CLASS)");
    expect(code).toContain(".setChecked(");
    // AND IT STILL READS NO FRONTMATTER, which page-widgets.test.ts asserts for
    // the whole widget and which this item must not be the exception to.
    expect(head).not.toContain("frontmatter");
    expect(head).not.toContain("metadataCache");
  });

  it("writes through the model rather than editing text itself", () => {
    // A widget that spliced lines would be a widget the suite could only test
    // through a DOM. `setPageWide` is the pure half and is tested above.
    expect(readCode("page-title")).toContain("setPageWide(text, on)");
    expect(readCode("page-title")).toContain("if (out === null) return;");
  });
});

describe("the width itself, which only the stylesheet can give", () => {
  it("is one rule, one declaration, four selectors", () => {
    // TWO MECHANISMS AND ONE WIDTH. The frontmatter class keeps homepages
    // composed before 4.11 wide; the marker gives every page the same width from
    // its own head. Two rules with the same `max-width` would be two places to
    // retune one number.
    const at = rules.indexOf(".markdown-preview-view.almanac-wide");
    expect(at, "no width rule").toBeGreaterThan(-1);
    const rule = rules.slice(at, rules.indexOf("}", at));
    expect(rule).toContain(".markdown-source-view.almanac-wide .cm-sizer");
    expect(rule).toContain(
      ".markdown-preview-view:has(.jtc-wide) .markdown-preview-sizer"
    );
    expect(rule).toContain(".markdown-source-view:has(.jtc-wide) .cm-sizer");
    expect(rule).toContain("max-width: var(--am-page-width)");
    expect(rule).not.toContain("--file-line-width");
  });

  it("puts ONE class inside `:has()`, which is what keeps a theme able to win", () => {
    // `:has()` takes the specificity of its most specific argument, so
    // `:has(.jtc-card.jtc-wide)` would weigh (0,4,0) and quietly outrank the theme
    // this rule promises not to overrule — the promise is in the comment above it
    // and the reason there is no `!important` here.
    expect(rules).toContain(":has(.jtc-wide)");
    expect(rules).not.toContain(":has(.jtc-card.");
    expect(rules).not.toMatch(/max-width: var\(--am-page-width\) !important/);
  });

  it("is applied to the head's card by the dispatcher, from the modifier", () => {
    const widgets = readCode("widgets");
    expect(widgets).toContain('querySelector<HTMLElement>(".jtc-card")?.addClass("jtc-wide")');
    expect(widgets).toContain("if (wideSpec.wide) {");
    // AND THE LINE IS DROPPED FROM THE DISPATCH LOOP, or it would reach
    // `buildFromSpec` as an unknown keyword and draw a notice instead of nothing.
    expect(widgets).toContain("!isWideLine(l)");
  });

  it("draws the refusal where the reader is looking", () => {
    expect(readCode("widgets")).toContain("if (wideSpec.error) {");
    expect(readCode("widgets")).toContain('cls: "journal-frame-error"');
  });
});

describe("nothing else composes one", () => {
  it("is written by exactly one catalogue, and only for the homepage", () => {
    // The homepage is wide because it always was. Nothing else gets a width it
    // did not ask for — which is the difference between a setting and a default
    // that has to be undone on seven pages.
    const composed = [
      composeSearchNote(ROOT),
      composeFlatNote([]),
    ];
    for (const note of composed) {
      expect(note.split("\n")).not.toContain(WIDE_KEYWORD);
    }
    expect(composeHomeNote(ROOT).split("\n")).toContain(WIDE_KEYWORD);
  });

  it("is not something repair rewrites", () => {
    // `MANAGED_ARGS` is `links` only, so step 2 cannot revert a marker, and the
    // insert step keys on the `title` keyword — which a `wide` line above it does
    // not disturb.
    expect(readCode("layout")).toContain('new Set<string>(["links"])');
  });
});
