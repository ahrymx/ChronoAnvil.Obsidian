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
// ca-wide` in its frontmatter, and no other dashboard could ask for the same
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
import { WIDE_PAGE_CLASS } from "../src/ui/page-width";

const ROOT = DEFAULT_PATHS.diaryRoot;
const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
// Every section the homepage composes, so a `want` in these tests is about the
// width rather than about accidentally adding or removing something else.
const composedIds = homeSections(ROOT)
  .filter((s) => !s.optIn)
  .map((s) => s.id);
const withoutHead = composedIds.filter((id) => id !== "banner");

// A page as the three shared catalogues compose one: a head carrying ids, then a
// block of its own.
const HEADED = [
  "`chronoanvil:spacer`",
  "```chronoanvil",
  "title:home,diary,journals",
  "```",
  "",
  "```chronoanvil",
  "header:⏳ Open tasks",
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
      "header:⏳ Open tasks",
      `${WIDE_KEYWORD}\nheader:⏳ Open tasks`
    );
    expect(pageIsWide(elsewhere)).toBe(false);
  });

  it("puts the line first in the head's body", () => {
    // WHERE `composeFlatNote` ALREADY PUTS `row`, and outside `widgetRun`'s
    // content span — which is what keeps it behind when the widget under it
    // leaves.
    const out = setPageWide(HEADED, true)!;
    expect(out).toContain(`\`\`\`chronoanvil\n${WIDE_KEYWORD}\ntitle:home,diary,journals`);
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
    const headless = "`chronoanvil:spacer`\n\n```chronoanvil\ntasks-table\n```\n";
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

  it("cannot be lost by removing the banner, because the banner cannot go", () => {
    // ── WHAT THIS TEST USED TO ASSERT, AND WHY IT CHANGED (4.19) ───────
    //
    // It read *"the width follows the head — remove the section and the page
    // narrows, with no stale declaration left saying otherwise"*, and it was
    // right about the mechanism: `wide` lives in the block that draws the page's
    // title, so it goes when that block goes.
    //
    // 4.19 locked the banner on every surface, so that block cannot go. The
    // mechanism is untouched and is still what `setPageWide` writes into; what
    // changed is that the reader has no route to the state this described.
    //
    // ASSERTED AS A REFUSAL RATHER THAN DELETED, because the coupling is the
    // interesting part and it is now guaranteed rather than merely tidy: there
    // is no way to end up with a `wide` line on a page whose head is gone.
    const model = homeSectionModel(ROOT);
    const home = composeHomeNote(ROOT);
    expect(pageIsWide(home)).toBe(true);
    expect(model.refusal("banner", home)).not.toBeNull();
    expect(model.apply(home, withoutHead)).toBeNull();
    expect(pageIsWide(home)).toBe(true);
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

  it("reads its checkmark off the render, not off the file", () => {
    // The class was put there by the render, FROM the note, and the menu is built
    // on click — so the marker is the note's answer by construction, and a second
    // read would be a second source of truth for one fact.
    //
    // WHICH MARKER IS THE CALLER'S SINCE 4.51.1, and the rule is unchanged. The
    // vault banner opens this same menu and has no card to read — it has the
    // view, which `page-width.ts` marks. So the marker arrives as a callback,
    // and both callers name their own; what is asserted is that neither reaches
    // for the file.
    const code = readCode("page-title");
    expect(code).toContain("const wide = isWide();");
    // ONE CALLER SINCE 5.2, AND IT IS THE VAULT BANNER'S. The other was
    // `buildPageTitle`, which read `root.hasClass(WIDE_CLASS)` off its own card
    // — a card nothing had drawn since 4.10. The callback shape stays: it is
    // what let the banner name its own marker, and it is why deleting the other
    // caller changed nothing here.
    expect(readCode("vault-banner")).toContain("host.hasClass(WIDE_PAGE_CLASS)");
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
    // composed before 4.11 wide; the view class gives every page the same width
    // from its own head. Two rules with the same `max-width` would be two places
    // to retune one number.
    const at = rules.indexOf(".markdown-preview-view.ca-wide");
    expect(at, "no width rule").toBeGreaterThan(-1);
    const rule = rules.slice(at, rules.indexOf("}", at));
    expect(rule).toContain(".markdown-source-view.ca-wide .cm-sizer");
    expect(rule).toContain(`.${WIDE_PAGE_CLASS} .markdown-preview-view .markdown-preview-sizer`);
    expect(rule).toContain(`.${WIDE_PAGE_CLASS} .markdown-source-view .cm-sizer`);
    expect(rule).toContain("max-width: var(--ca-page-width)");
    expect(rule).not.toContain("--file-line-width");
  });

  it("no longer asks `:has()` for a card a reading view is allowed to unload", () => {
    // THE 4.45.1 BUG, PINNED. `:has(.ca-jtc-wide)` reached from the view down to
    // the title card — the FIRST block on the page — and Obsidian drops a
    // section from the DOM once it is far enough from the viewport. Scrolling a
    // dashboard to the bottom therefore cancelled its own width. Nothing may
    // reach for that class from the stylesheet again.
    expect(rules).not.toContain(":has(.ca-jtc-wide)");
    // Over the comment-stripped stylesheet: the rule's own comment names the
    // class it stopped using, and it should — that is the record of why.
    expect(rules).not.toContain(".ca-jtc-wide");
  });

  it("weighs exactly what Obsidian's own width rule weighs, so a theme can win", () => {
    // Three classes a side — `.ca-wide-page .markdown-preview-view
    // .markdown-preview-sizer` against
    // `.markdown-preview-view.is-readable-line-width .markdown-preview-sizer` —
    // which is the promise the comment above the rule makes and the reason there
    // is no `!important` in it.
    const at = rules.indexOf(".markdown-preview-view.ca-wide");
    const rule = rules.slice(at, rules.indexOf("}", at));
    for (const sel of rule.split(",").map((x) => x.trim()).filter(Boolean)) {
      expect(sel.split(".").length - 1, `${sel} is not three classes`).toBe(3);
    }
    expect(rules).not.toMatch(/max-width: var\(--ca-page-width\) !important/);
  });

  it("marks the view from the FILE, on every event that can change the answer", () => {
    // A CLASS ON THE VIEW IS THE THING `HOME_CSS_CLASS` REFUSES — when it is put
    // there at render time, because Obsidian reuses a leaf across file switches
    // and the width outlives the note. What makes this the other thing is that
    // it is re-derived from the file for every open note on every event that
    // could change the answer, so a leaf showing a narrow note has the class
    // taken off on the same pass that puts it on elsewhere.
    const src = readCode("page-width");
    expect(src).toContain("pageIsWide(text)");
    expect(src).toContain('this.app.workspace.on("file-open", sweep)');
    expect(src).toContain('this.app.workspace.on("layout-change", sweep)');
    expect(src).toContain('this.app.workspace.on("active-leaf-change", sweep)');
    expect(src).toContain('this.app.metadataCache.on("changed"');
    expect(src).toContain("onLayoutReady");
    // The read that cannot disagree with what is on screen, and the guard that
    // stops a slow one writing about a note the leaf has already left.
    expect(src).toContain("cachedRead(file)");
    expect(src).toContain("if (view.file?.path !== file.path) return;");
    // And it is registered, or none of the above ever runs.
    expect(readCode("main")).toContain("this.pageWidth.register()");
  });

  it("is read by the dispatcher and dropped from the dispatch loop", () => {
    // THE MARK ON THE CARD IS GONE (5.2). The dispatcher used to answer
    // `wideSpec.wide` by putting `.ca-jtc-wide` on the head's card, which the
    // cog then read back for its checkbox. 4.45.1 had already taken the WIDTH
    // off that class, and the card itself belonged to a widget nothing had
    // rendered since 4.10 — so the query returned null on every render for a
    // year. Both ends deleted; the width comes from the file, above.
    const widgets = readCode("widgets");
    expect(widgets).not.toContain(".ca-jtc-");
    // WHAT THE DISPATCHER STILL DOES WITH THE MODIFIER. The line is dropped
    // from the dispatch loop, or it would reach `buildFromSpec` as an unknown
    // keyword and draw a notice instead of nothing.
    expect(widgets).toContain("!isWideLine(l)");
    expect(widgets).toContain("parseWide(");
  });

  it("draws the refusal where the reader is looking", () => {
    expect(readCode("widgets")).toContain("if (wideSpec.error) {");
    expect(readCode("widgets")).toContain('cls: "ca-journal-frame-error"');
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
