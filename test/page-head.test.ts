// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The page head — 4.10.
//
// WHAT THIS RELEASE ACTUALLY FIXED, so the assertions have something to be
// about: `buildPageTitle` draws the page's name and a cog whose menu opens the
// section editor, and it is gated on `canEditSections` — which answers yes for
// the homepage, Search, both folder-note dashboards, the four period
// dashboards, entries and journal notes. It was DRAWN on one of them, because
// the cog only appears where a catalogue composes `title`, and only the
// homepage did. The editor worked on nine surfaces and was clickable on one.
//
// So the load-bearing assertions here are the composition ones — seven pages
// compose it — and the repair one, which lives in layout.test.ts because that
// is where `applyLayout` is tested. Everything else is the look, which this
// suite can only reach through the stylesheet.

import { describe, expect, it } from "vitest";
import { readCss, readSrc } from "./sources";
import { composeHomeNote } from "../src/diary/home-sections";
import { composeSearchNote } from "../src/diary/search-sections";
import { composeDiaryDashboardNote } from "../src/diary/diary-dashboard-sections";
import { composeJournalsDashboardNote } from "../src/journals/journals-dashboard-sections";
import { composeDiaryDashboard } from "../src/diary/diary-sections";
import { composeEntryTemplate } from "../src/diary/entry-sections";
import { PAGE_TITLE_IDS, PAGE_TITLE_LINE, locateTitle } from "../src/core/note-sections";
import { isTitleLine } from "../src/core/directive-grammar";
import { DEFAULT_PATHS } from "../src/core/constants";
import { TRACKER_CLASSES } from "../src/trackers/trackers";

const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");

// A boundary rather than `indexOf`, and ANCHORED TO A LINE START — both halves
// earned. `.jtc-link` is a prefix of `.jtc-link-icon`, so a bare match reads the
// wrong rule; and `readCss` concatenates the folder alphabetically, so
// `05-inline-widgets.css`'s `is-unframed .jtc-card` reset comes hundreds of
// lines before the real `.jtc-card` in `60-heroes-and-banners.css`. Anchoring on
// the line the selector OPENS is what tells a rule from a mention of it.
const ruleFor = (sel: string): string => {
  const at = rules.search(
    new RegExp("(^|\n)" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[,{]")
  );
  expect(at, `no rule for ${sel}`).toBeGreaterThan(-1);
  const open = rules.indexOf("{", at);
  return rules.slice(open, rules.indexOf("}", open));
};

// A module's code with its comments taken off.
//
// EVERY ASSERTION BELOW THAT SAYS "THIS FILE DOES NOT DO X" NEEDS THIS. The
// files in this project explain what they deliberately do NOT do, at length, by
// name — so a bare `not.toContain("jn-pill")` fails on the paragraph arguing
// why there are no pills here.
const code = (name: string): string =>
  readSrc(name).replace(/\/\/.*$/gm, "");

// The seven pages that gain a head, by the note each composes.
const HEADED: [string, string][] = [
  ["Search", composeSearchNote()],
  ["the diary folder note", composeDiaryDashboardNote()],
  ["the journals folder note", composeJournalsDashboardNote()],
  ...(["weekly", "monthly", "quarterly", "yearly"] as const).map(
    (g): [string, string] => [`the ${g} dashboard`, composeDiaryDashboard(g)]
  ),
];

describe("every dashboard opens with its own name", () => {
  it("composes the head onto all seven", () => {
    // THE ASSERTION THE RELEASE IS. Seven, enumerated, so adding an eighth
    // dashboard without a head is a test that fails rather than a page a reader
    // finds.
    expect(HEADED).toHaveLength(7);
    for (const [name, text] of HEADED) {
      expect(text, name).toContain(PAGE_TITLE_LINE);
    }
  });

  it("puts it first, above everything the page holds", () => {
    // It names the page, so it sits above the things the page contains — and
    // `applyLayout` anchors its insert against the units that follow, so being
    // first in the catalogue is also what puts it at the top of a note that
    // predates it.
    for (const [name, text] of HEADED) {
      const head = text.indexOf(PAGE_TITLE_LINE);
      const firstFence = text.indexOf("```almanac");
      expect(head, name).toBeGreaterThan(firstFence);
      // Nothing else opens a fence before it.
      expect(text.slice(0, head).match(/```almanac/g), name).toHaveLength(1);
    }
  });

  it("draws exactly one, per page", () => {
    for (const [name, text] of HEADED) {
      expect(text.match(/^title:/gm), name).toHaveLength(1);
    }
  });
});

describe("what the head carries", () => {
  it("is the vault's three places, not the calendar's", () => {
    // The head answers "where am I in the VAULT" and the `links:` row answers
    // "where am I in TIME". That split is why both rows survive this release,
    // and it is the thing an edit is most likely to lose.
    expect([...PAGE_TITLE_IDS]).toEqual(["home", "diary", "journals"]);
    for (const id of PAGE_TITLE_IDS) {
      expect(PAGE_TITLE_LINE).toContain(id);
    }
    // None of the ladder's rungs are here; that row still has them.
    for (const id of ["week", "month", "quarter", "year", "scopes", "today"]) {
      expect(PAGE_TITLE_LINE, id).not.toContain(id);
    }
  });

  it("adds nothing to the destination table", () => {
    // `resolveTarget` is the one answer to "where does `diary` go", shared with
    // `links:` and the launcher. A second table would be the one nobody
    // updates — so the head had to be spellable with ids that already resolve,
    // and it is.
    const links = readSrc("links");
    for (const id of PAGE_TITLE_IDS) {
      expect(links, id).toContain(`case "${id}":`);
    }
  });

  it("reads that table rather than drawing its own pills", () => {
    // BOTH HALVES. `resolveTarget` is reused, so there is one answer; the pill
    // MARKUP is not, because a `.jn-pill` row inside the card would make the
    // head read as one more card with one more pill row in it.
    expect(code("page-title")).toContain("resolveTarget(plugin, file, id)");
    expect(code("page-title")).not.toContain("jn-pill");
    expect(code("page-title")).toContain("jtc-link");
  });

  it("draws nothing dead, and no empty row", () => {
    // A vault with no journals root has no Journals link — rather than one that
    // opens nothing, which is `empty.ts`'s rule applied to navigation. And if
    // every id declines, the row itself is not drawn: an empty strip under the
    // title is height spent on nothing, on a head whose brief was minimal.
    const src = readSrc("page-title");
    expect(src).toContain("if (!target || (!target.file && !target.action)) return;");
    expect(src).toContain("if (nav.childElementCount) root.appendChild(nav);");
  });

  it("lights the page you are on instead of linking to it", () => {
    // `links.ts` argues this at length: a row whose contents change per page is
    // a menu you have to read every time, where a fixed set with one lit is a
    // position you can read at a glance.
    const src = readSrc("page-title");
    const at = src.indexOf("if (target.file?.path === sourcePath) {");
    expect(at).toBeGreaterThan(-1);
    expect(src.slice(at, at + 300)).toContain("is-here");
    expect(ruleFor(".jtc-link.is-here")).toContain("--interactive-accent");
  });
});

describe("the homepage is unchanged, which is the scope holding", () => {
  it("carries the same destination row as every other page (4.20)", () => {
    // ── THE ARGUMENT THIS REVERSES ────────────────────────────────────
    //
    // From 4.5 to 4.19 the homepage composed the BARE form, and the reason was
    // real: the launcher is already on this page as CONTENT in a cell, shipping
    // with Diary and Journals among its four tiles, so ids here draw two of the
    // same destinations twice on one screen.
    //
    // 4.20 weighs that against what it cost — the banner meaning something
    // different on this page than on the other eight. A reader learns the banner
    // once, and the homepage was the one place its row was missing, which reads
    // as unfinished rather than as considered. `home-sections.ts` carries the
    // full argument, including why the two rows are not the same object: this is
    // chrome you read to know where you are, and the launcher is content you
    // click.
    const home = composeHomeNote(DEFAULT_PATHS.diaryRoot);
    expect(home).toContain(PAGE_TITLE_LINE);
    // And the bare form is gone from it: `title` on its own line would be a
    // second head.
    expect(home).not.toContain("\ntitle\n");
  });

  it("and a bare title draws no navigation at all", () => {
    // The property that keeps the homepage byte-identical to what it drew
    // before this release. Asserted at the default rather than through a DOM:
    // an empty list is what the dispatcher passes for a bare keyword, and an
    // empty list has nothing to render.
    const src = readSrc("page-title");
    expect(src).toContain("ids: readonly string[] = []");
    expect(src).toContain("if (!wanted.length) return root;");
    const widgets = readSrc("widgets");
    expect(widgets).toContain('rest.trim() ? rest.split(",") : []');
  });

  it("finds both spellings, and no frontmatter key", () => {
    // `locate` decides whether a section is PRESENT and where it sits. A reader
    // with a `title: My Page` property and no head would otherwise be told the
    // head is already there, and never offered one.
    expect(locateTitle("title")).toBe(0);
    expect(locateTitle(PAGE_TITLE_LINE)).toBe(0);
    expect(locateTitle("---\ntitle: My Page\n---\n")).toBe(-1);
    expect(locateTitle("---\ntitle: 2026\n---\n")).toBe(-1);
    // And it still finds a real one further down a note that has both.
    expect(locateTitle(`---\ntitle: My Page\n---\n\n${PAGE_TITLE_LINE}\n`)).toBeGreaterThan(0);
  });
});

describe("entries and journal notes were not touched", () => {
  it("compose no head", () => {
    // THE NEGATIVE CHECK THAT PROVES THE SCOPE. Both already rename the note
    // from their own banner — `entry-header` and `study-header` — so a head
    // above either is the page's name twice, which is the fault the homepage's
    // card was patched for in 4.5.1.
    for (const grain of TRACKER_CLASSES) {
      expect(composeEntryTemplate(grain), grain).not.toContain("title:");
      expect(composeEntryTemplate(grain), grain).not.toMatch(/^title$/m);
    }
  });

  it("and keep Home in their links row, because nothing else offers it", () => {
    for (const grain of TRACKER_CLASSES) {
      expect(composeEntryTemplate(grain), grain).toContain(
        "links:home,today,scopes#diary"
      );
    }
  });
});

describe("the head is drawn as the page, not as another card", () => {
  it("clips its figure to its own corners", () => {
    // BOTH DECLARATIONS ARE LOAD-BEARING. The figure is an absolutely
    // positioned layer: without `overflow` it paints past the rounded corners
    // into square ones, and without `position` it resolves against whatever
    // ancestor is positioned — in Live Preview the code-block widget, in
    // reading view the note's sizer. That is the fault 4.7.0 shipped with the
    // grip, from the same cause.
    const card = ruleFor(".jtc-card");
    expect(card).toContain("position: relative");
    expect(card).toContain("overflow: hidden");
  });

  it("figures its ground on a layer of its own, from one token", () => {
    // A layer rather than a background on the card, so no text inherits an
    // opacity — and one token rather than a number baked into a gradient, so
    // the figure can be turned down without editing a hatch.
    const fig = ruleFor(".jtc-card::before");
    expect(fig).toContain("var(--am-head-figure)");
    expect(fig).toContain("repeating-linear-gradient");
    expect(fig).toContain("pointer-events: none");
    // The accent wash is derived, not a hex.
    expect(fig).toContain("var(--interactive-accent)");
    expect(fig).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("turns the figure up rather than redefining it in light mode", () => {
    // Dark ink on a light ground needs more of it to read as texture. Keyed on
    // Obsidian's own theme class, which is the only thing that knows.
    expect(rules).toContain(".theme-light .jtc-card");
    expect(ruleFor(".theme-light .jtc-card")).toContain("--am-head-figure");
  });

  it("sets the page's name in the one face that is not the UI sans", () => {
    expect(ruleFor(".jtc-title-text")).toContain("var(--am-head-face)");
    // AND THE INPUT MATCHES IT, or the card jumps as you click to rename.
    expect(ruleFor(".jtc-title-input")).toContain("var(--am-head-face)");
  });

  it("keeps the family's radius and border, which is what makes it belong", () => {
    const card = ruleFor(".jtc-card");
    expect(card).toContain("var(--am-radius-md)");
    expect(card).toContain("var(--background-modifier-border)");
  });

  it("separates its two rows with the figure, not a rule", () => {
    // Asked for, and a decision rather than an omission: a hairline would make
    // the head two stacked things, where the whole point is that it is one
    // thing that says two.
    expect(ruleFor(".jtc-nav")).not.toContain("border-top");
    expect(ruleFor(".jtc-nav")).not.toContain("border:");
  });

  it("sets its destinations in the caps voice every key label uses", () => {
    const link = ruleFor(".jtc-link");
    expect(link).toContain("var(--am-caps-weight)");
    expect(link).toContain("var(--am-caps-tracking)");
    expect(link).toContain("var(--am-text-2xs)");
  });

  it("still gives its card up where the block paints one", () => {
    // 4.1 §5's list, kept in step. A head inside an unframed block or under a
    // block head is the same box in a box the reset list exists to remove, and
    // 4.10 changed what `.jtc-card` draws without changing that.
    const reset = rules.indexOf(".has-head .jtc-card");
    expect(reset).toBeGreaterThan(-1);
    expect(rules).toContain(".journal-widget-block.is-unframed .jtc-card");
  });

  it("hides Obsidian's own title wherever it is drawn", () => {
    // Derived from the card rather than declared in frontmatter, so it follows
    // the block instead of going stale when the block is removed — and it is
    // what makes six more pages stop saying their name twice, with no new
    // selector.
    expect(rules).toContain(":has(.jtc-card) .inline-title");
  });
});

// ── the head cannot be moved (4.11) ───────────────────────────────────
//
// The section editor's half is asserted in home-sections, search-sections and
// dashboard-sections — the flag, the arrows and the plan. This is the PAGE's
// half, which has no DOM to test in: the drag is a gesture the suite cannot make,
// so what is checked is the one fact the gesture is derived from and the shape of
// the gate it feeds.
describe("nothing on the page can pick the head up", () => {
  it("computes which lines are fixed from the fence's own numbering", () => {
    // `lineAt` is the numbering taken on the way into the SAME filter every
    // directive is read through, so a `frame:` line or a comment above the head
    // cannot shift it. A predicate over the raw text inside block-drag.ts would
    // have to recount past both.
    const w = code("widgets");
    // READ FROM WHAT WILL BE DRAWN, not from every line the fence holds
    // (4.51.1). A suppressed banner's `title` line is no longer in the block, so
    // pinning a position it does not occupy would fix the widget that took its
    // place.
    expect(w).toContain(
      "drawable.filter(({ l }) => isTitleLine(l)).map(({ at }) => at)"
    );
    // `fixed` is still the last thing computed from `kept` and is still passed
    // straight through; 4.12 added `sectionFence` after it, computed in the same
    // place for the same reason — the dispatcher is holding the fence's lines and
    // block-drag would have to infer the fact from rendered children.
    expect(w).toMatch(/attachBlockHead\([\s\S]{0,250}?fixed,\s*\n?\s*sectionFence\s*\n?\s*\)/);
  });

  it("withholds every gesture from one gate rather than six guards", () => {
    // The grip, the two block slots, the two side quarters, the per-widget slots
    // and the resize divider are all below this line. Naming them one at a time
    // is six places to forget the seventh — the shape `bandOf` already refuses in
    // the editor.
    const b = code("block-drag");
    const gate = b.indexOf("if (fixed.length) return;");
    expect(gate).toBeGreaterThan(0);
    // AFTER the head is drawn and after `boundsOf`: a name is true in an embed,
    // and only the gesture is being declined.
    expect(b.indexOf("buildHead(container, title)")).toBeLessThan(gate);
    expect(b.indexOf("if (!boundsOf(ctx, container)) return;")).toBeLessThan(gate);
    // and before every one of them.
    // The CALL SITES, not the definitions — `attachGrip` and `slot` are declared
    // near the top of the file and would pass this by accident.
    for (const after of [
      "jbd-slot-above",
      "jbd-slot-side jbd-slot-side-left",
      "Drag to move this block",
      "const grip = attachGrip(host, label)",
    ]) {
      expect(b.indexOf(after), after).toBeGreaterThan(gate);
    }
  });

  it("asks the fence body a different question than the note (on purpose)", () => {
    // `locateTitle` searches a WHOLE NOTE, frontmatter included, so it must tell
    // `title:home,diary,journals` from a reader's `title: My Page` property.
    // `isTitleLine` is asked of a line already inside an ```almanac fence, where
    // no YAML property can occur, and it has to agree with `splitDirective` —
    // which is how every other keyword in the dispatcher is read.
    expect(isTitleLine("title")).toBe(true);
    expect(isTitleLine("title:home,diary,journals")).toBe(true);
    expect(isTitleLine("title-something")).toBe(false);
    expect(isTitleLine("tasks-table:,period")).toBe(false);
    // The disagreement, stated as a test so nobody "fixes" it into one rule.
    expect(isTitleLine("title: My Page")).toBe(true);
    expect(locateTitle("title: My Page")).toBe(-1);
  });
});
