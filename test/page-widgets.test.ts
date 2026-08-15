// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The page title card and the launcher — 4.5.
//
// WHAT IS ASSERTED HERE. The suite has no DOM, so both widgets are pinned where
// they are decisions rather than drawings: which destinations exist and where
// they resolve from, that nothing dead is drawn, that the rename has ONE
// implementation, and the stylesheet rules a screenshot would otherwise be the
// only witness to.

import { describe, expect, it } from "vitest";
import { LAUNCHER_DEFAULT } from "../src/ui/widgets/launcher";
import { readCode, readCss, readSrc } from "./sources";

const ruleAt = (rules: string, sel: string): number =>
  rules.search(
    new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\\s,{]")
  );

describe("the launcher shares one destination table", () => {
  const src = readSrc("launcher");
  const links = readSrc("links");

  it("resolves through core/links rather than keeping its own list", () => {
    // TWO TABLES WOULD BE TWO ANSWERS to "where does `search` go", and the
    // second is the one nobody updates. `resolveTarget` was made public for
    // this and is the only thing the launcher knows about destinations.
    expect(src).toContain("resolveTarget(plugin, file, id)");
    expect(links).toContain("export function resolveTarget(");
    // No private copy of the ids and no second switch over them.
    expect(src).not.toContain('case "search"');
    expect(src).not.toContain("getFile(plugin.app, paths");
  });

  it("names the three destinations 4.5 added, each derived", () => {
    // The dashboards are FOLDER NOTES derived from the configured roots, which
    // is how `section-insert.ts` resolves the same two notes — rename the
    // folder and the path follows, where a settings key would go stale.
    const at = links.indexOf('case "diary":');
    expect(at, "no diary destination").toBeGreaterThan(-1);
    const arm = links.slice(at, links.indexOf('case "search":', at));
    expect(arm).toContain("folderNotePath(paths.diaryRoot)");
    expect(arm).toContain("folderNotePath(paths.journalsRoot)");
    // Capture is not a file — the shape `today` already uses for a destination
    // that is a window rather than a note.
    //
    // ANCHORED ON THE CLAIM, NOT ON THE CALL'S ARITY (4.27). This read
    // `openCapture(plugin)` and broke when capture learned to take the note the
    // pill was drawn in — a change that leaves the claim above entirely intact.
    // The assertion is "this destination opens a window instead of resolving a
    // file", so it says that. Same move as section-choice.test.ts:511.
    expect(arm).toContain("action: () => openCapture(");
    expect(arm).toContain("file: null");
  });

  it("draws a default set, so the directive is writable bare", () => {
    expect(LAUNCHER_DEFAULT).toEqual(["diary", "search", "journals", "capture"]);
    const widgets = readSrc("widgets");
    expect(widgets).toContain("rest.trim() ? rest.split(\",\") : LAUNCHER_DEFAULT");
  });
});

describe("nothing dead is drawn (4.5 §2)", () => {
  const src = readSrc("launcher");

  it("skips a destination that resolves to nothing", () => {
    // No journals root configured, no Journals tile — rather than a tile that
    // opens nothing, or a greyed one, which 4.1 §6.2 refuses in as many words.
    expect(src).toContain("if (!target) continue;");
    expect(src).toContain("if (!target.file && !target.action) continue;");
  });

  it("has no disabled or placeholder tile", () => {
    // The shapes a dead control usually arrives as.
    expect(src).not.toContain("disabled");
    expect(src).not.toContain("is-placeholder");
    expect(src).not.toContain("setDisabled");
  });

  it("says what would appear and how, when nothing resolves", () => {
    // `emptyCallout` REPLACES content, which is this case: there is no grid to
    // draw and the sentence stands in for it.
    //
    // THE GATE IS ASSERTED, NOT JUST THE TEXT. The first form of this checked
    // that `emptyCallout(` appeared in the file, which stayed true when a
    // mutation made it unreachable — a sentence nobody can reach is not an
    // empty state. So: the count that gates it, and the increment that feeds
    // the count.
    expect(src).toContain("if (drawn === 0) {");
    expect(src).toContain("drawn++;");
    expect(src).toContain("emptyCallout(");
    expect(src).toContain("set up / repair vault");
  });

  it("draws no cog where there is nothing for it to open", () => {
    // The title card's half of the same rule. A menu that opens and then
    // explains it cannot help is worse than no menu — which is what the ⋯ on a
    // journal note already does, and why this asks BEFORE building the button.
    const title = readSrc("page-title");
    expect(title).toContain("canEditSections(notePath)");
    expect(title).toContain("if (build) {");
    // The predicate is one line and cannot grow a second opinion about which
    // notes are editable.
    expect(readSrc("section-insert")).toContain(
      "return this.surfaceOfNote(notePath) !== null;"
    );
  });
});

describe("the page title is the file's name", () => {
  const src = readSrc("page-title");

  it("renames the note rather than storing a second title", () => {
    // The argument is older than this widget: the filename is what the quick
    // switcher, the graph, every backlink and every table display, and a
    // `title` property beside it would let those disagree.
    expect(src).toContain("attachNoteRename(plugin.app, titleRow, file,");
    // THROUGH `readCode`, WHICH STRIPS COMMENTS. The first form of this matched
    // the paragraph above the widget explaining why it does NOT read
    // frontmatter — a test failing on its own justification, which is the
    // source-text trap this suite names as the 4.0.2 rule.
    const code = readCode("page-title");
    expect(code).not.toContain("frontmatter");
    expect(code).not.toContain("metadataCache");
  });

  it("keeps the cog away from the click-to-edit title", () => {
    // study-header.ts puts its own ⋯ in the crumb row and says why: "a control
    // next to it would be a control one slip away from renaming the note."
    // Here the whole width is between them, which is what space-between does.
    const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    const at = ruleAt(rules, ".jtc-row");
    expect(at, "no title row rule").toBeGreaterThan(-1);
    expect(rules.slice(at, rules.indexOf("}", at))).toContain(
      "justify-content: space-between"
    );
  });

  it("says the page's name once, and works that out from the card", () => {
    // THE FIRST VAULT RENDER SHOWED IT TWICE — Obsidian's inline title above,
    // the card below, the plugin's copy the smaller of the two.
    //
    // DERIVED, NOT DECLARED. The obvious fix is a second `cssclasses` value
    // beside `almanac-wide`, and it goes stale the moment a reader removes the
    // title block: the class stays, Obsidian's title stays hidden, and the page
    // has no title at all. `:has()` asks a question the note answers for
    // itself, so the inline title comes back when the card goes.
    const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    const at = rules.indexOf(".markdown-preview-view:has(.jtc-card) .inline-title");
    expect(at, "the inline title is not hidden in reading view").toBeGreaterThan(-1);
    const rule = rules.slice(at, rules.indexOf("}", at));
    // Both views: a name that appears once when read and twice when edited is
    // the same defect with a smaller audience.
    expect(rule).toContain(".markdown-source-view:has(.jtc-card) .inline-title");
    expect(rule).toContain("display: none");
    // ── AND ON EVERY SURFACE THAT DRAWS A NAME, NOT JUST THIS ONE ────
    //
    // The rule shipped in 4.5.1 naming `.jtc-card`, which is the LARGE banner's
    // name card and appears on the eight dashboard-shaped surfaces only. A diary
    // entry and a journal leaf drew Obsidian's inline title AND their banner's
    // copy of the same name for eleven releases — the exact doubling this rule
    // exists to remove, on the two page kinds a reader is in most.
    //
    // The condition is "a block on this page already draws the file's name with
    // a rename on it", and `journal-banner-name` is what marks that on both slim
    // banners. Asserted for both views, like the pair above, because that is the
    // half of this rule that has been forgotten before.
    for (const view of ["markdown-preview-view", "markdown-source-view"]) {
      expect(rule, view).toContain(
        `.${view}:has(.journal-banner-name) .inline-title`
      );
    }
    // And no second frontmatter class was invented for it.
    expect(readCode("home-sections")).not.toContain("almanac-titled");
    expect(rules).not.toContain(".almanac-titled");
  });

  it("is at least as big as the title it replaces", () => {
    // It started at 1.5em to match the journals hero, which was right while it
    // was one heading among several and wrong once it became the page's only
    // title — smaller than what it replaced reads as a lesser copy, which is
    // how the render looked.
    const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    const at = ruleAt(rules, ".jtc-title-text");
    const rule = rules.slice(at, rules.indexOf("}", at));
    const size = /font-size:\s*([\d.]+)em/.exec(rule);
    expect(size, "no font size on the page title").not.toBeNull();
    expect(Number(size![1])).toBeGreaterThanOrEqual(2);
    // And it steps down in a narrow block rather than wrapping across three
    // lines in a sidebar — on the BLOCK's width, not the window's.
    expect(rules).toMatch(
      /@container \(max-width: \d+px\) \{\s*\.jtc-title-text,\s*\.jtc-title-input \{\s*font-size:/
    );
  });

  it("draws a card, on the surface every other card takes", () => {
    // IT SHIPPED FLAT AND THAT WAS WRONG. The argument was that two heavy
    // surfaces stacked read as one thing announced twice; in a vault, a bare
    // name above a page of bordered cards read as a heading somebody forgot to
    // finish. The surface is 91-card-surface.css's, not a fourth opinion about
    // what a card looks like.
    const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    // ANCHORED TO THE START OF A LINE, not by `ruleAt`. The class now appears in
    // two selectors — its own rule and the unframed reset — and the reset sorts
    // earlier in the concatenation, so a substring search finds the rule that
    // takes the surface AWAY and asserts the opposite of what is meant.
    const at = rules.indexOf("\n.jtc-card {");
    expect(at, "no title card rule of its own").toBeGreaterThan(-1);
    const rule = rules.slice(at, rules.indexOf("}", at));
    expect(rule).toContain("background: var(--background-secondary)");
    expect(rule).toContain("border: 1px solid var(--background-modifier-border)");
    expect(rule).toContain("border-radius: var(--am-radius-md)");
  });

  it("gives that card up in an unframed block", () => {
    // 4.1 §5's ONE THING THAT HAS TO BE KEPT IN STEP: keying the frame off the
    // block covers every widget, EXCEPT a widget that draws a card inside it —
    // only the widget knows it did. In a canvas node or another plugin's tile
    // the node IS the frame, so a card inside one is the doubling `frame:`
    // exists to remove. Three widgets were on that list; this is the fourth.
    const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    const at = ruleAt(rules, ".journal-widget-block.is-unframed .jtc-card");
    expect(at, ".jtc-card is not in the unframed reset").toBeGreaterThan(-1);
    const rule = rules.slice(at, rules.indexOf("}", at));
    expect(rule).toContain("background: none");
    expect(rule).toContain("padding: 0");
    // AND `.jjc-card` STAYS OUT OF IT, which is the distinction: the journals
    // grid's cards ARE the content, and a grid with its cards flattened is a
    // list. This card is the block's own frame.
    expect(rules).not.toContain(".journal-widget-block.is-unframed .jjc-card");
  });

  it("does not reuse the retired page-index family", () => {
    // `.jpt-*` was the page index's private family and was retired into the
    // shared record-list builder; appearance.test.ts fails the build if it
    // comes back. This widget is a different thing and takes a free prefix.
    expect(src).not.toContain("jpt-");
  });
});

describe("the launcher's grid answers to its cell", () => {
  const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");

  it("has three shapes and never a fourth", () => {
    // THE RULE THE HOMEPAGE NEEDS. The launcher's first home is a cell of a
    // row, so its width is a third of a page or the whole of a phone depending
    // on nothing it can see: four across when there is room, two by two in a
    // cell, one column when there is not.
    //
    // IT WAS `auto-fit` WITH A FLOOR UNTIL 4.8.1, which is the same idea done
    // by arithmetic — and that arithmetic has a bad middle. At a width that
    // fits three, three go across and the fourth drops onto a line of its own;
    // a ragged 3 + 1 is the one arrangement of four things that reads as a
    // mistake, and `--am-row-cell-min` puts the homepage's cell in exactly that
    // band. A declared count can skip three. A fitted one cannot.
    const at = ruleAt(rules, ".jlx-grid");
    expect(at, "no launcher grid rule").toBeGreaterThan(-1);
    const rule = rules.slice(at, rules.indexOf("}", at));
    expect(rule).toContain("repeat(2, 1fr)");
    expect(rule).not.toContain("auto-fit");
    // The other two shapes, each behind a query on the CELL — which is a
    // container because 4.2 §2 made every cell one.
    expect(rules).toContain("repeat(4, 1fr)");
    expect(rules).not.toContain("repeat(3, 1fr);\n}");
  });

  it("gives the launcher a name, and with it a surface", () => {
    // A widget the title map cannot name gets no head and no card, so this was
    // four tiles on the page's own background beside three widgets that each
    // had one. The name is the catalogue's own, not a second one.
    expect(readCode("widgets")).toContain('launcher: "🧭 Go to"');
    expect(readCode("home-sections")).toContain('label: "Go to"');
  });
});
