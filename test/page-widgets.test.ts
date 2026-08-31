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
    expect(LAUNCHER_DEFAULT).toEqual(["week", "month", "quarter", "year"]);
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
    // The page cog's half of the same rule. A menu that opens and then explains
    // it cannot help is worse than no menu — which is what the ⋯ on a journal
    // note already does, and why `sectionsMenuFor` answers null BEFORE anything
    // builds a button from it.
    const title = readSrc("page-title");
    expect(title).toContain("canEditSections(notePath)");
    expect(title).toContain("return null;");
    // AND THE CALLER HONOURS THE NULL. The button was `buildPageTitle`'s until
    // 5.2, and that widget had been unreachable since 4.10; the vault banner is
    // the surface that draws this cog now, and it composes the menu only when
    // there is one.
    expect(readCode("ui/vault-banner")).toContain("if (build) build(menu);");
    // The predicate is one line and cannot grow a second opinion about which
    // notes are editable.
    expect(readSrc("section-insert")).toContain(
      "return this.surfaceOfNote(notePath) !== null;"
    );
  });
});

describe("the page's name is drawn once, by the head that ships", () => {
  // REWRITTEN IN 5.2, AND THE OLD FORM IS THE REASON. Six assertions here
  // described `buildPageTitle`'s card — its surface, its 2em title, its unframed
  // reset, the container query that steps it down in a sidebar — and all six
  // passed for a year after 4.10 stopped rendering it, because they read a
  // module nothing imported and CSS nothing matched. The widget and its rules
  // were deleted in 5.2; what a reader actually sees is `.ca-journal-page-head`,
  // asserted in page-head.test.ts, and the one claim worth keeping here is the
  // one about Obsidian's own title.
  const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");

  it("hides Obsidian's inline title wherever a banner draws the name", () => {
    // DERIVED, NOT DECLARED. The obvious fix is a second `cssclasses` value
    // beside `ca-wide`, and it goes stale the moment a reader removes the block:
    // the class stays, Obsidian's title stays hidden, and the page has no title
    // at all. `:has()` asks a question the note answers for itself.
    const at = rules.indexOf(
      ".markdown-preview-view:has(.ca-journal-banner-name) .inline-title"
    );
    expect(at, "the inline title is not hidden in reading view").toBeGreaterThan(-1);
    const rule = rules.slice(at, rules.indexOf("}", at));
    // Both views: a name that appears once when read and twice when edited is
    // the same defect with a smaller audience.
    expect(rule).toContain(
      ".markdown-source-view:has(.ca-journal-banner-name) .inline-title"
    );
    expect(rule).toContain("display: none");
    // And no second frontmatter class was invented for it.
    expect(readCode("home-sections")).not.toContain("ca-titled");
    expect(rules).not.toContain(".ca-titled");
  });

  it("does not reuse the retired page-index family", () => {
    // `.jpt-*` was the page index's private family and was retired into the
    // shared record-list builder; appearance.test.ts fails the build if it comes
    // back.
    expect(readSrc("page-title")).not.toContain("jpt-");
  });

  it("left no rule behind for the card it replaced", () => {
    expect(rules).not.toContain(".ca-jtc-");
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
    // mistake, and `--ca-row-cell-min` puts the homepage's cell in exactly that
    // band. A declared count can skip three. A fitted one cannot.
    const at = ruleAt(rules, ".ca-jlx-grid");
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
    expect(readCode("widgets")).toContain('launcher: "🧭 Overview navigator"');
    expect(readCode("home-sections")).toContain('label: "Overview navigator"');
  });
});
