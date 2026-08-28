// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import { OBSIDIAN_DOM } from "../src/core/constants";
import {
  FoldNode,
  SecNode,
  computeFoldHidden,
  computeSectionRuns,
} from "../src/ui/headerbar";

import { readCss, readSrc } from "./sources";
// Shorthands, so a sequence of nodes reads as the note it stands for.
const bar = (level: number, collapsed = false): FoldNode => ({
  level,
  collapsed,
  heading: false,
});
const body = (): FoldNode => ({ level: 0, collapsed: false, heading: false });
const heading = (): FoldNode => ({ level: 0, collapsed: false, heading: true });

describe("a bar's scope", () => {
  it("hides nothing when nothing is folded", () => {
    expect(computeFoldHidden([bar(1), body(), body()])).toEqual([
      false,
      false,
      false,
    ]);
  });

  it("hides what follows a folded bar", () => {
    expect(computeFoldHidden([bar(1, true), body(), body()])).toEqual([
      false,
      true,
      true,
    ]);
  });

  it("keeps the folded bar itself visible", () => {
    // The only way back. A bar that hid itself would fold a section away with
    // no chevron left to unfold it.
    expect(computeFoldHidden([bar(1, true)])[0]).toBe(false);
  });

  it("ends one bar's scope at the next bar of the same level", () => {
    const out = computeFoldHidden([bar(1, true), body(), bar(1), body()]);
    expect(out).toEqual([false, true, false, false]);
  });

  it("folds nested level-2 bars away with their level-1 container", () => {
    // The conflict the holistic pass exists to settle: an expanded level-2 bar
    // inside a collapsed level-1 one is hidden, because it is inside a
    // collapsed ancestor's scope rather than because it is folded itself.
    const out = computeFoldHidden([
      bar(1, true),
      bar(2),
      body(),
      bar(2, true),
      body(),
    ]);
    expect(out).toEqual([false, true, true, true, true]);
  });

  it("does not let a level-2 bar close a level-1 scope", () => {
    const out = computeFoldHidden([bar(1, true), bar(2), body()]);
    expect(out.slice(1)).toEqual([true, true]);
  });

  it("lets a level-1 bar close a level-2 scope", () => {
    const out = computeFoldHidden([bar(2, true), body(), bar(1), body()]);
    expect(out).toEqual([false, true, false, false]);
  });

  it("ends every open scope at a markdown heading", () => {
    // Folding the Lesson template's only bar used to hide the entire note
    // below it — every heading, both widgets and the whole body.
    const out = computeFoldHidden([bar(1, true), body(), heading(), body()]);
    expect(out).toEqual([false, true, false, false]);
  });

  it("reopens nothing after a heading", () => {
    const out = computeFoldHidden([bar(1, true), heading(), body(), body()]);
    expect(out.slice(1)).toEqual([false, false, false]);
  });
});

describe("a bar and the widgets welded into its own fence", () => {
  // A `header:` and the directives beneath it in the same ```almanac fence
  // render as one block: the bar, then its widgets as the bar's SIBLINGS. The
  // walk flattens that — the block contributes a node carrying the level of
  // its first bar, then the bar and its siblings follow — so one stack governs
  // both. These are the sections the bug report named.
  const blockNode = (level: number): FoldNode => bar(level);

  it("folds the field a section is for", () => {
    // `header:🧭 Learning Path` + `path:learning-path`.
    const out = computeFoldHidden([
      blockNode(1),
      bar(1, true),
      body(), // the path field
    ]);
    expect(out).toEqual([false, false, true]);
  });

  it("folds every shelf of a Resources section", () => {
    // Three `attach:` fields in the one fence — Docs, Tutorials, Practice.
    const out = computeFoldHidden([
      blockNode(1),
      bar(1, true),
      body(),
      body(),
      body(),
    ]);
    expect(out).toEqual([false, false, true, true, true]);
  });

  it("stops a folded section at the fence that gave it a body (4.57.1)", () => {
    // THE SENTINEL, AS THE FLATTENED WALK SEES IT. A `📊 Charts` fence holds
    // its bar and its stack, so the section is complete in that block and
    // `recompute` follows it with a header-that-opens-nothing at the bar's own
    // level. What the reader put next is theirs.
    const out = computeFoldHidden([
      blockNode(1),
      bar(1, true),
      body(), // the jchart stack
      bar(1), // the sentinel: same level, never collapsed
      body(), // a page widget the reader added below
      blockNode(1), // the next section's block
      bar(1),
      body(),
    ]);
    expect(out).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("still carries a bar alone in its fence over the blocks after it", () => {
    // THE 2.x SHAPE, WHICH IS WHY THE SCOPE EXISTS AT ALL: a `header:` fence
    // with nothing under it and the section's body in the blocks that follow.
    // Every note composed before the two were welded is this, so no sentinel is
    // emitted and the walk is what it always was.
    const out = computeFoldHidden([
      blockNode(1),
      bar(1, true),
      body(), // a body block of its own
      body(), // and another
      blockNode(1), // the next section's block
      bar(1),
      body(),
    ]);
    expect(out).toEqual([false, false, true, true, false, false, false]);
  });

  it("leaves an expanded section's widgets alone", () => {
    const out = computeFoldHidden([blockNode(1), bar(1), body(), body()]);
    expect(out.every((h) => !h)).toBe(true);
  });

  it("does not hide a block by its own first bar", () => {
    // The block carries its bar's level so it closes the PREVIOUS section's
    // scope before its own visibility is decided; it must not then be hidden
    // by the scope its own bar opens.
    const out = computeFoldHidden([
      blockNode(1),
      bar(1, true),
      body(),
      blockNode(1),
      bar(1, true),
      body(),
    ]);
    expect(out).toEqual([false, false, true, false, false, true]);
  });

  it("treats an anchor bar with no fold state as content", () => {
    // An untitled `header:` (and the entry banner, which wears the same class
    // for the same shell) is a place widgets anchor, not a section: it never
    // reports itself collapsed, so it opens no scope.
    const out = computeFoldHidden([bar(1, false), body()]);
    expect(out).toEqual([false, false]);
  });
});

// ── the section surface (2.56.13, §1.6) ──────────────────────────────────
//
// A `header:` section cannot contain its body: Obsidian renders every markdown
// block separately, so the contents are the bar's following SIBLINGS — which is
// why folding is a sibling walk. There is nothing to wrap in a card, so the
// surface is made by marking the run and joining it in CSS.
//
// The marking uses the fold walk's boundaries deliberately. A section that
// folds one set of blocks and shades another would be two different claims
// about what "this section" means, and a reader would meet the disagreement the
// first time they collapsed something.

describe("section bodies are marked for the surface", () => {
  const src = readSrc("headerbar");
  // The whole method, not a fixed slice: the first version of these tests read
  // `at + 2000` and started failing the moment the method grew a helper call.
  const method = (name: string): string => {
    const at = src.indexOf(`private ${name}(`);
    expect(at, name).toBeGreaterThan(0);
    const end = src.indexOf("\n  }\n", at);
    return src.slice(at, end);
  };

  it("marks the run in the same pass that computes folding", () => {
    expect(src).toContain("private markSectionBodies(");
    // Called from recompute, so it is applied on every repaint regardless of
    // load order — the same reason markL2Body is.
    const at = src.indexOf("this.markSectionBodies(blocks)");
    expect(at).toBeGreaterThan(0);
    expect(src.lastIndexOf("private recompute", at)).toBeGreaterThan(0);
  });

  it("clears the marks every pass rather than accumulating them", () => {
    // A block leaves a section when a bar above it is edited away. A stale
    // surface class leaves a shaded orphan with no header — the failure that
    // only appears on the second render, which is the one nobody watches.
    //
    // A TOGGLE AGAINST THE COMPUTED ANSWER since 3.13 §3, which clears and
    // re-derives in one step rather than a remove loop followed by an add loop.
    // The property is the same and is now structural: every block is written on
    // every pass, so there is no path by which one keeps a class it did not
    // earn.
    const body = method("markSectionBodies");
    expect(body).toContain('toggleClass("journal-sec-block", marks[i].member)');
    expect(body).toContain('toggleClass("is-last", marks[i].last)');
    expect(body).toContain("blocks.forEach((block, i) =>");
  });

  it("ends a section on a heading, as the fold walk does", () => {
    expect(method("markSectionBodies")).toContain("this.isHeadingBlock(block)");
  });

  it("opens a surface only for a bar that can be folded", () => {
    // `data-headerKey` is set by HeaderBar and only for a `header:` that has a
    // title — the same fact `barCollapsed` reads. Asking "is it untitled" was a
    // narrower version of the question that missed the case that mattered: the
    // diary ENTRY BANNER also wears `.journal-header-bar journal-header-l1`, so
    // it opened a section and wrapped a whole daily entry — fields fence and
    // all five storage regions — in one card.
    const body = method("markSectionBodies");
    expect(body).toContain("bar?.dataset.headerKey");
    // And such a bar still CLOSES what was open — it is a level-1 header, so
    // the section before it does not run past it.
    expect(body).toMatch(
      /if \(level1 && !bar\?\.dataset\.headerKey\) \{\s*return \{\s*opens: false,\s*closes: true,/
    );
  });

  it("counts every block that is its own structure as a boundary", () => {
    // ONE LIST, AND THE LOGGING GRID WAS MISSING FROM IT (4.51.4). Reported as
    // *"the resources section in Journals merging with the trackers"*: a note
    // whose grid sits after a `header:` section drew the grid INSIDE that
    // section's surface, and collapsing the section took the grid with it.
    //
    // The grid has had its own card and its own caption since 4.21.1 — *"the
    // only section in the plugin with a card and no name"* — which is precisely
    // what every other entry in this list is here for.
    //
    // WHY IT SURVIVED SO LONG. On a note composed by 4.20 or later the grid is
    // section two, above every bar, so no section was ever open for it to fall
    // into. On older notes the markers sit inside the BANNER's fence, so the
    // block wore `.journal-study-banner` — which is in the list — and was a
    // boundary by inheritance. 4.51 suppressing the banner's directives dropped
    // that class and left the same block carrying only the tracker one.
    //
    // `.journal-page-head` JOINS IT IN 4.51.6 and before it can be reported:
    // the head is what the three banner directives became, so it stands in the
    // same place the banner classes above did — and on an older note it is
    // drawn from the same fence, which is where a section is open.
    const body = method("isSectionBoundary");
    for (const cls of [
      "journal-sec-fold",
      "journal-section-bar",
      "journal-overview-banner",
      "journal-entry-banner",
      "journal-study-banner",
      "journal-tracker-section",
      "journal-page-head",
      "journals-card",
      "journal-sec-l1",
    ]) {
      expect(body, cls).toContain(`:scope .${cls}`);
    }
  });

  it("ends a section whose own fence drew its body (4.57.1)", () => {
    // THE BUG: the homepage's last section is the charts fence, every page
    // widget a reader adds lands in a block below it, and the run took them —
    // so a logbook added to the homepage came back inside the Trends card on
    // the next reload, and folded away with the section.
    //
    // Both walks ask the one predicate, for `isSectionBoundary`'s reason: a
    // section that folds one set of blocks and shades another is two claims
    // about what "this section" means.
    expect(src).toContain("private bodyInOwnFence(");
    expect(method("markSectionBodies")).toContain("this.bodyInOwnFence(block)");
    expect(method("recompute")).toContain("this.bodyInOwnFence(block)");
  });

  it("asks it of the last bar in the block, not the first", () => {
    // Study's topic index writes `header:📖 Lessons`, its table,
    // `header:🛠️ Practice` and its table as ONE fence. The bars before the last
    // plainly have their bodies here; the only open question is the last one's,
    // and a trailing bar with nothing under it is a section still waiting for
    // its blocks.
    const body = method("bodyInOwnFence");
    expect(body).toContain("bars[bars.length - 1]");
  });

  it("does not count the grip and the drop slots as a body", () => {
    // `attachBlockHead` hangs these on every block, after whatever it drew. They
    // are empty divs today — so this changes no answer — and an icon in the grip
    // would otherwise end every section at its own bar.
    const drag = readSrc("widgets");
    expect(drag).toContain('const GRIP_CLASS = "jbd-handle";');
    expect(drag).toContain('export const HEAD_CLASS = "journal-block-head";');
    expect(drag).toContain("`jbd-slot ${cls}`");
    expect(src).toContain(
      'const BLOCK_FURNITURE = ".jbd-slot, .jbd-handle, .journal-block-head";'
    );
    expect(method("bodyInOwnFence")).toContain("sib.matches(BLOCK_FURNITURE)");
  });

  it("leaves a bar alone in its fence owning the blocks after it", () => {
    // THE 2.x SHAPE, AND WHY THE SCOPE EXISTS. A section used to be two fences
    // — a `header:` fence and a body fence — because Obsidian renders each block
    // separately and a section could not contain its own body. Every note
    // composed before the two were welded is still that, so the predicate is
    // "did this fence draw a body", and a fence that drew none keeps the walk it
    // always had.
    const body = method("bodyInOwnFence");
    expect(body).toContain("return false;");
    expect(body).toContain("this.rendersSomething(sib)");
  });

  it("stops the level-2 indent there too", () => {
    // Three passes, one predicate. A subsection that folds its own block, shades
    // its own block and then indents the page under it would be the same
    // disagreement the boundary rule exists to prevent.
    expect(method("markL2Body")).toContain("this.bodyInOwnFence(barBlock)");
  });

  it("asks that question in both walks rather than twice over", () => {
    // The fold and the shade must agree about what "this section" means — a
    // section that folds one set of blocks and shades another is two claims,
    // and a reader meets the disagreement the first time they collapse
    // something. Both call the one predicate.
    expect(method("markSectionBodies")).toContain("this.isSectionBoundary(block)");
    expect(method("markL2Body")).toContain("this.isSectionBoundary(sib)");
    expect(method("recompute")).toContain("this.isSectionBoundary(block)");
  });

  it("gives the logging grid a class no banner shares", () => {
    const widgets = readSrc("widgets");
    expect(widgets).toContain('if (drew.trackerSection) out.push("journal-tracker-section");');
    expect(widgets).toContain(
      "trackerSection: hasTrackerRegion && !isOverviewCard,"
    );
  });

  it("does not treat the diary entry banner as a section", () => {
    // The banner is the note's head. It is built as a header bar so it inherits
    // the frame's layout, which is right — and is exactly why the section walk
    // has to ask a question the class name cannot answer.
    const entry = readSrc("entryheader");
    expect(entry).toContain("journal-header-bar journal-header-l1");
    expect(entry).not.toContain("dataset.headerKey");
  });

  it("closes the surface on the last block a reader can see", () => {
    // Two ways the true last block is not the visible one: a section ending in
    // a storage region (renders nothing), and a COLLAPSED section (every body
    // block hidden, so the head block is the whole surface and has to close
    // it). Both are why this runs after the fold pass rather than beside it.
    // Split in 3.13 §3: the DOM half reads the flag, the arithmetic half lives
    // in computeSectionRuns and is asserted directly below.
    expect(method("markSectionBodies")).toContain(
      'hasClass("journal-section-hidden")'
    );
    const at = src.indexOf("export function computeSectionRuns");
    expect(at).toBeGreaterThan(0);
    expect(src.slice(at, src.indexOf("\n}\n", at))).toContain(
      "if (last === -1) last = 0;"
    );
  });

  it("gives up its inset rather than its background on a phone", () => {
    // A card costs horizontal padding twice on a ~360px column, which was the
    // mockups' objection and a real one.
    const css = readCss();
    const at = css.indexOf(".journal-sec-block {");
    expect(at).toBeGreaterThan(0);
    const narrow = css.indexOf("@container (max-width: 460px)", at);
    expect(narrow).toBeGreaterThan(0);
    // One variable, not two paddings: the header rule bleeds to the card's
    // edges by cancelling exactly this inset, so a breakpoint that changed the
    // padding without the rule knowing would leave the rule short at one width.
    expect(css.slice(narrow, narrow + 300)).toContain("--am-sec-pad-x: 8px");
  });

  it("paints the block, not the bar's siblings inside it", () => {
    // A section's body is often welded into the bar's own fence, and
    // `.journal-widget-block` is a flex column WITH A GAP — painting its
    // children individually paints stripes with the gaps showing through. Both
    // failed attempts are in this one assertion.
    const body = method("markSectionBodies");
    expect(body).toContain('block.toggleClass("journal-sec-block"');
    expect(body).not.toContain("block.children");
  });

  it("stops the bar painting a second background inside the surface", () => {
    // Two backgrounds of the same colour with different radii is how a card
    // grows a visible corner.
    const css = readCss();
    const at = css.indexOf(".journal-sec-l1.journal-header-bar {");
    expect(at).toBeGreaterThan(0);
    expect(css.slice(at, css.indexOf("}", at))).toContain("background: none");
  });

  it("rounds all four corners when one block is the whole section", () => {
    // A fence carrying a header and everything under it, or a section
    // collapsed down to its bar.
    const css = readCss();
    expect(css).toContain(".journal-sec-block.is-first.is-last");
  });
  it("rounds the bottom on a block that actually draws something", () => {
    // A section whose final block is a storage region — `<!--almanac:path-->`
    // renders nothing — would round an invisible element and leave the visible
    // one square, with an empty band of surface beneath it. That is what the
    // Learning Path drew.
    expect(method("markSectionBodies")).toContain("this.rendersSomething(");
    const check = method("rendersSomething");
    expect(check).toContain("childElementCount");
    // Not offsetHeight: reading layout during a render pass gives a different
    // answer depending on when it ran.
    expect(check).not.toContain("offsetHeight");
  });

  it("does not treat zero-width or empty comment blocks as rendering content", () => {
    const check = method("rendersSomething");
    expect(check).toContain("\\u200B");
  });


  it("contains the child margins so the run paints as one surface", () => {
    // The first attempt came out striped. These wrappers have no vertical
    // padding and no border, so a child's margins collapse THROUGH them and the
    // gap lands outside the element painting the background.
    const css = readCss();
    const at = css.indexOf(".journal-sec-block {");
    expect(at).toBeGreaterThan(0);
    const block = css.slice(at, css.indexOf("}", at));
    expect(block).toContain("display: flow-root");
  });

  it("gives an empty block no padding of its own", () => {
    const css = readCss();
    expect(css).toContain(".journal-sec-block:empty");
  });

  it("rules between the header and the body, edge to edge", () => {
    // 2.56.0 removed the full-width rule under every section title: five of
    // them ruled a page into bands and separated nothing in particular. Right
    // then, wrong once the card arrived — inside a card the rule divides the
    // header from the body, which is the one boundary the card does not draw.
    const css = readCss();
    const at = css.indexOf(
      ".journal-sec-block .journal-sec-l1.journal-header-bar {"
    );
    expect(at).toBeGreaterThan(0);
    const block = css.slice(at, css.indexOf("\n}", at));
    expect(block).toContain("border-bottom: 1px solid");
    // Full bleed: cancels the card's inset rather than sitting inside it. A
    // rule that stops short of the edges is an underline on the title.
    expect(block).toContain("calc(-1 * var(--am-sec-pad-x");
  });

  it("draws no rule under a collapsed section", () => {
    // A line along the bottom of a closed card is an edge promising content
    // that is not there.
    const css = readCss();
    const at = css.indexOf(
      ".journal-sec-block .journal-sec-l1.journal-header-bar.is-collapsed"
    );
    expect(at).toBeGreaterThan(0);
    expect(css.slice(at, css.indexOf("\n}", at))).toContain(
      "border-bottom: none"
    );
  });
});

// ── the editor is the same note (2.56.23) ────────────────────────────────
//
// Sections rendered differently in Live Preview than in reading view — but only
// in the diary. Journals were flawless, and that was the clue rather than a
// consolation: a journal section is ONE fence (`header:🧭 Learning Path` and
// the `path:` under it are the same ```almanac block), so "everything I own"
// and "everything inside my own fence" were the same set. The diary writes a
// header fence and a body fence, and there the difference is the whole feature.

describe("section scope in Live Preview", () => {
  const src = readSrc("headerbar");

  it("climbs past a widget's own container to the editor's content", () => {
    // `.markdown-rendered` is the note's container in reading view AND the
    // container of one code-block widget inside `.cm-embed-block`. Stopping at
    // both meant every fence in the editor saw only itself.
    //
    // Read from `isSectionParent` rather than from `siblingAnchor`'s body since
    // 3.13 §1.5: the predicate came out to module scope when the
    // construction-time mark became its second caller. That caller needs the
    // TEST rather than the walk — the walk always returns something, and what
    // it returns for a block the renderer has not inserted yet is an inner
    // element. Asserting it here keeps one description of what a section
    // container is, which is the point of it having moved.
    const at = src.indexOf("function isSectionParent(");
    expect(at).toBeGreaterThan(0);
    const body = src.slice(at, src.indexOf("\n}", at));
    // Read through OBSIDIAN_DOM since 3.13 §5: the class names Obsidian owns
    // now live in one table, and this asserts the RULE — which containers count
    // and which exclusion disambiguates the ambiguous one — rather than the
    // spelling, which the table's own test pins.
    expect(body).toContain("OBSIDIAN_DOM.cmContent");
    expect(body).toContain("!p.closest(`.${OBSIDIAN_DOM.widgetWrapper}`)");
    expect(OBSIDIAN_DOM.cmContent).toBe("cm-content");
    expect(OBSIDIAN_DOM.widgetWrapper).toBe("cm-embed-block");
    // And the walk still uses it, rather than having grown a second copy.
    const walk = src.slice(
      src.indexOf("private siblingAnchor()"),
      src.indexOf("\n  }", src.indexOf("private siblingAnchor()"))
    );
    expect(walk).toContain("isSectionParent(node.parentElement)");
  });

  it("recognises a heading written in the editor", () => {
    // Live Preview builds no `<h1>`; a heading is a `.cm-line` wearing
    // `HyperMD-header`. Without it a section ran through the note's own
    // headings — the one boundary the fold rule says it must respect.
    const at = src.indexOf("private isHeadingBlock(");
    const body = src.slice(at, src.indexOf("\n  }", at));
    expect(body).toContain("HyperMD-header");
  });

  it("paints a source line but never hides one", () => {
    // `.cm-line` elements are CodeMirror's to measure. `display: none` on one
    // risks a stranded cursor and buys nothing — a blank line has no content to
    // fold away — while the line still belongs to the section, which is what
    // keeps the card continuous across it.
    const at = src.indexOf("const hidden = computeFoldHidden(nodes);");
    expect(at).toBeGreaterThan(0);
    const body = src.slice(at, at + 1400);
    const guard = body.indexOf(
      "el.classList.contains(OBSIDIAN_DOM.editorLine)"
    );
    const apply = body.indexOf('toggleClass("journal-section-hidden"');
    expect(guard).toBeGreaterThan(0);
    expect(apply).toBeGreaterThan(guard);
    // The painting pass has no such exemption: the line is still in the run.
    const mark = src.indexOf("private markSectionBodies(");
    expect(src.slice(mark, src.indexOf("\n  }\n", mark))).not.toContain("cm-line");
  });
});

describe("one watcher per note, not one per bar (3.13 §2, §4)", () => {
  const src = readSrc("headerbar");

  it("shares one observer across the note's bars", () => {
    // Every bar in a note attaches to the same parent, so a per-bar observer
    // meant five on the homepage and six or seven on a journal index — and each
    // batch of appended blocks scheduled that many full-note passes, each
    // deduplicated to one per frame, all computing the same answer over the
    // same blocks in the same frame.
    expect(src).toContain("class SectionPass");
    expect(src).toContain("passes.get(parent)");
    // Exactly one place constructs an observer now.
    expect(src.match(/new MutationObserver\(/g) ?? []).toHaveLength(1);
  });

  it("keyed by WeakMap, because the key is a DOM element", () => {
    // A Map here is a leak with a nicer name: the plugin does not control the
    // lifetime of a note's section container.
    expect(src).toContain("new WeakMap<HTMLElement, SectionPass>()");
  });

  it("runs one pass per mutation batch, not one per member", () => {
    // Every bar's recompute walks the whole note and computes the same answer,
    // so any live member will do.
    const at = src.indexOf("private onMutations");
    const body = src.slice(at, src.indexOf("\n  }", at));
    expect(body).toMatch(/for \(const run of this\.members\) \{\s*run\(\);\s*return;/);
  });

  it("observes childList only, so it cannot see its own writes", () => {
    // The pass toggles classes. Classes are attributes. Moving the observer
    // must not quietly widen it.
    const at = src.indexOf("this.observer.observe(");
    expect(at).toBeGreaterThan(-1);
    const call = src.slice(at, src.indexOf(";", at));
    expect(call).toContain("childList: true");
    expect(call).not.toContain("attributes");
    expect(call).not.toContain("subtree");
  });

  it("retires on quiet rather than on a fixed duration, with a cap", () => {
    // The thing being waited for is the renderer falling silent, and silence is
    // directly observable where elapsed time is not — so this retires early on
    // a fast desktop and late on a slow phone, which is the difference a fixed
    // duration cannot express.
    //
    // The cap is not a formality: a live chart or a polling embed never falls
    // quiet, and a quiet rule without one is "watch for the whole session"
    // under another name.
    expect(src).toContain("const QUIET_MS = 500;");
    expect(src).toContain("const SETTLE_CAP_MS = 10000;");
    // The old constant is gone from the code; it survives only in the comment
    // that explains what replaced it, which is where a retired guess belongs.
    expect(src).not.toMatch(/^const SETTLE_MS/m);
    const at = src.indexOf("private arm(");
    const body = src.slice(at, src.indexOf("\n  }", at));
    expect(body).toContain("setTimeout(() => this.retire(), SETTLE_CAP_MS)");
  });

  it("resets the quiet timer on the batch, before the frame dedupe", () => {
    // A burst of mutations that coalesces into one pass is still one piece of
    // evidence that the note is still growing.
    const at = src.indexOf("private onMutations");
    const body = src.slice(at, src.indexOf("\n  }", at));
    expect(body.indexOf("this.restartQuiet()")).toBeLessThan(
      body.indexOf("if (this.queued) return;")
    );
  });

  it("clears the note's marks when the last bar leaves", () => {
    // THE FOOTER LEAK, closed from the note that left. `.mod-footer.mod-ui`
    // belongs to the leaf and is reused across file switches, so a class on it
    // outlives the note that caused it. The old comment admitted the repair had
    // nowhere to live — "a note with no header bar registers no HeaderBar and
    // never runs this pass" — which was true and was the wrong note to fix it
    // from.
    const at = src.indexOf("remove(run: () => void)");
    const body = src.slice(at, src.indexOf("\n  }", at));
    expect(body).toContain("this.clearMarks()");
    expect(body).toContain("passes.delete(this.parent)");
    const clear = src.indexOf("private clearMarks");
    const cbody = src.slice(clear, src.indexOf("\n  }", clear));
    expect(cbody).toContain("this.parent.children");
    expect(cbody).toContain('removeClass("journal-sec-block")');
  });

  it("deregisters on the bar's own teardown", () => {
    const at = src.indexOf("private joinNotePass");
    const body = src.slice(at, src.indexOf("\n  }", at));
    expect(body).toContain("pass.add(run)");
    expect(body).toContain("this.register(() => pass.remove(run))");
  });
});


describe("a titled section owns its own block (3.13)", () => {
  it("claims it at mount rather than waiting for the holistic pass", () => {
    // `markSectionBodies` answers "which of the blocks AFTER this header does it
    // own", which needs a walk. It was also the only thing answering "does this
    // header's OWN block belong to it", which needs no walk at all — a bar's
    // block is that bar's section, always.
    //
    // The cost of routing the second question through the first: a pass
    // scheduled by an EARLIER bar can run before a later bar's onload has set
    // `data-headerKey`, and the pass then skips that block entirely and the
    // section renders with no background. Reported as mobile-only; reproduced
    // on desktop.
    const src = readSrc("headerbar");
    expect(src).toContain("claimOwnBlock");
    const at = src.indexOf("private claimOwnBlock");
    const body = src.slice(at, src.indexOf("\n  }", at));
    expect(body).toContain('addClass("journal-sec-block")');
    expect(body).toContain('addClass("is-first")');
  });

  it("never claims is-last, because the body may still be arriving", () => {
    // The tempting version gives the head block `is-last` too when its fence
    // rendered a body beside it. 4.57.1 made that the right ANSWER — a fence that
    // drew a body ends its section there — and it is still the wrong thing to
    // claim at mount: this runs as the block attaches, before a `LiveWidget`
    // has built its subtree, so "my fence drew nothing beside me" is a fact
    // about the frame rather than about the section. `markSectionBodies` asks
    // the same question a pass later, when the answer is stable.
    //
    // The honest degradation is a square bottom for one frame.
    const src = readSrc("headerbar");
    const at = src.indexOf("private claimOwnBlock");
    const body = src.slice(at, src.indexOf("\n  }", at));
    expect(body).not.toContain('addClass("is-last")');
  });

  it("marks nothing when the block is not attached to the note yet", () => {
    // `siblingAnchor()` always returns SOMETHING; what it returns before the
    // renderer has inserted the block is an inner element. Marking that would
    // draw a surface inside a surface — permanently, because the pass clears
    // these classes from `parent.children` and a wrongly-marked descendant is
    // not one of them.
    const src = readSrc("headerbar");
    const at = src.indexOf("private claimOwnBlock");
    const body = src.slice(at, src.indexOf("\n  }", at));
    expect(body).toContain("if (!isSectionParent(el.parentElement)) return;");
    // And the test is shared with the walk rather than restated beside it.
    expect(src).toContain("function isSectionParent(");
  });

  it("claims the anchor, the same element the pass paints", () => {
    // markSectionBodies walks the children of the anchor's PARENT, so it paints
    // anchor-level elements. In reading view that is a block-level ancestor of
    // the ```almanac element the post-processor hands us — claiming `blockEl`
    // would nest a card inside the card the pass draws.
    //
    // HANDED THE ANCHOR SINCE 3.13.9 rather than resolving it: `whenAttached`
    // has already walked it and established that its parent is the container,
    // and resolving it twice is how the caller's precondition and the callee's
    // guard come to disagree about which element they are talking about.
    const src = readSrc("headerbar");
    const at = src.indexOf("private claimOwnBlock");
    const body = src.slice(at, src.indexOf("\n  }", at));
    expect(src).toContain("this.claimOwnBlock(el);");
    expect(body).not.toMatch(/this\.blockEl\.addClass/);
  });

  it("comes back next frame when the block is not attached yet", () => {
    // THE BUG 3.13.9 FIXED, and it is the guard above having no second half.
    // The refusal was right — marking a detached inner element paints a
    // surface inside a surface that no later pass can clear — and nothing ever
    // asked again. On a fresh vault the homepage's `🏷️ Tags` mounted detached,
    // was refused, and stayed unpainted until it was clicked: `toggle()` calls
    // `recompute()` directly, which resolves the anchor on every call.
    const src = readSrc("headerbar");
    const at = src.indexOf("private whenAttached");
    expect(at).toBeGreaterThan(0);
    const body = src.slice(at, src.indexOf("\n  }", at));
    // Attachment is READ, not waited out — the same lesson §4 learned about
    // the settle rule, one level down.
    expect(body).toContain("isSectionParent(parent)");
    expect(body).toContain("requestAnimationFrame(() => this.whenAttached())");
    // Bounded by the same cap the settle rule uses: a block not inserted after
    // ten seconds is not going to be.
    expect(body).toContain("SETTLE_CAP_MS");
    // And the poll is cancelled with the bar, so a note closed mid-render does
    // not leave a frame callback holding a detached element.
    expect(src).toContain("cancelAnimationFrame(this.attachFrame)");
  });

  it("joins the note's pass only once it knows which note", () => {
    // The half that was silently worse. `joinNotePass` read
    // `siblingAnchor().parentElement` in `onload` and either returned early —
    // the bar joining NO pass, ever — or registered a SectionPass keyed on an
    // inner wrapper, whose observer watches a subtree the note's blocks never
    // arrive in. Either way the section never repaints, and nothing says so.
    const src = readSrc("headerbar");
    expect(src).toContain("private joinNotePass(parent: HTMLElement)");
    const at = src.indexOf("private joinNotePass");
    const body = src.slice(at, src.indexOf("\n  }", at));
    expect(body).not.toContain("siblingAnchor()");
    // One caller, and it is the one that has already established the container.
    expect(src.match(/this\.joinNotePass\(/g) ?? []).toHaveLength(1);
  });

  it("schedules no pass from onload itself", () => {
    // Everything that needs to know WHERE the block sits now waits until it
    // sits there. An unconditional `requestAnimationFrame(recompute)` in
    // `onload` is a pass over whatever parent the anchor happened to resolve
    // to, which for a detached block is the wrong one.
    const src = readSrc("headerbar");
    const at = src.indexOf("onload(): void {");
    const body = src.slice(at, src.indexOf("\n  }", at));
    expect(body).toContain("this.whenAttached();");
    expect(body).not.toContain("requestAnimationFrame(() => this.recompute())");
  });

  it("claims nothing at level 2", () => {
    // A level-2 bar is a subheading inside a section, not the start of one, so
    // which run it belongs to is a real question about its neighbours.
    const src = readSrc("headerbar");
    const at = src.indexOf("private claimOwnBlock");
    const body = src.slice(at, src.indexOf("\n  }", at));
    expect(body).toMatch(/if \(this\.level !== 1\) return;/);
  });

  it("leaves the pass as the authority", () => {
    // The claim is a floor, not a verdict. `markSectionBodies` clears every one
    // of these classes at the top of its loop before re-deriving them, so a
    // block that claimed itself and then turns out to head a longer run is
    // corrected, and a bar edited away still leaves no shaded orphan — the
    // failure that only shows on the second render.
    const src = readSrc("headerbar");
    // lastIndexOf: two loops in this file open with that phrase, and the one
    // that matters is the second.
    // Written as a toggle against the computed answer since 3.13 §3 — every
    // block is written on every pass, so a claimed block that turns out to head
    // a longer run is corrected, and a bar edited away leaves no shaded orphan.
    const at = src.indexOf("blocks.forEach((block, i) =>");
    expect(at).toBeGreaterThan(0);
    const head = src.slice(at, at + 700);
    expect(head).toContain('toggleClass("journal-sec-block", marks[i].member)');
    expect(head).toContain('toggleClass("is-first", marks[i].first)');
    expect(head).toContain('toggleClass("is-last", marks[i].last)');
  });
});


// ── computeSectionRuns: the paint pass's rules, asserted (3.13 §3) ────────
//
// Before the extraction every one of these was checkable only by opening a
// dashboard and looking. Two of them produced visible bugs — a band of empty
// surface under the content, and a collapsed section with no bottom — and both
// are arithmetic over a list of flags rather than anything about the DOM.

describe("computeSectionRuns", () => {
  const node = (o: Partial<SecNode> = {}): SecNode => ({
    opens: false,
    closes: false,
    hidden: false,
    renders: true,
    ends: false,
    ...o,
  });
  const head = () => node({ opens: true });
  // A section whose fence drew its own body — every one the plugin composes.
  const whole = () => node({ opens: true, ends: true });

  it("opens a run on a head and carries it over the blocks that follow", () => {
    const m = computeSectionRuns([head(), node(), node()]);
    expect(m.map((x) => x.member)).toEqual([true, true, true]);
    expect(m.map((x) => x.first)).toEqual([true, false, false]);
    expect(m.map((x) => x.last)).toEqual([false, false, true]);
  });

  it("ends a section in its own block when the fence drew the body (4.57.1)", () => {
    // THE BUG THIS RELEASE IS FOR, as arithmetic. The homepage ends with the
    // charts section, and every page widget a reader adds lands in a block
    // below it: before this the run swallowed them, so a logbook added to the
    // homepage came back inside the Trends card after a reload — and folded
    // away with it.
    const m = computeSectionRuns([whole(), node(), node()]);
    expect(m.map((x) => x.member)).toEqual([true, false, false]);
    // Both ends land on the one block, so it rounds top and bottom.
    expect(m[0]).toEqual({ member: true, first: true, last: true });
  });

  it("still runs a section over the blocks after a bar with no body", () => {
    // The 2.x two-fence shape, which is what the run was written for and what
    // every note composed before the weld still is.
    const m = computeSectionRuns([head(), node(), node()]);
    expect(m.map((x) => x.member)).toEqual([true, true, true]);
  });

  it("gives two complete sections a block each rather than one run", () => {
    // The diary dashboard: `⏳ Open tasks`, `🕘 On this day`, Trends, `🏷️ Tags`,
    // each a fence holding its own body. Before 4.57.1 only the next bar closed
    // the previous run, which is the same rule wearing a coincidence — the last
    // section on the page had no next bar, and that is the one readers add to.
    const m = computeSectionRuns([whole(), whole(), node()]);
    expect(m.map((x) => x.member)).toEqual([true, true, false]);
    expect(m.map((x) => x.first)).toEqual([true, true, false]);
    expect(m.map((x) => x.last)).toEqual([true, true, false]);
  });

  it("marks a fully collapsed section as both of its own ends (4.13 §4)", () => {
    // THE ARITHMETIC A STYLESHEET RULE NOW DEPENDS ON, so the two are asserted
    // next to each other. Collapse a section and every member after the head is
    // hidden, the search for a last visible member finds nothing, and the
    // fallback puts `last` back on index 0 — so the head block wears `.is-first`
    // AND `.is-last`.
    //
    // That is what makes `.journal-sec-block.is-last` the right thing for
    // `70-section-surface.css` to reach when it takes the bottom padding off a
    // closed section: `.is-last` reserves 10px for the gap under a section's last
    // widget, and a closed section has no last widget. About ten of a ~46px
    // closed bar were empty surface before 4.13. If this fallback ever changes,
    // that rule silently stops firing and the padding comes back with nothing to
    // say it did.
    const m = computeSectionRuns([head(), node({ hidden: true }), node({ hidden: true })]);
    expect(m[0].member).toBe(true);
    expect(m[0].first).toBe(true);
    expect(m[0].last).toBe(true);
  });

  it("claims nothing before the first head", () => {
    // A note's own prose above the first dashboard fence is not in a section,
    // and neither is a stray block between two of them.
    const m = computeSectionRuns([node(), head(), node()]);
    expect(m.map((x) => x.member)).toEqual([false, true, true]);
  });

  it("starts a new run at the next head and closes the previous one", () => {
    const m = computeSectionRuns([head(), node(), head(), node()]);
    expect(m.map((x) => x.first)).toEqual([true, false, true, false]);
    expect(m.map((x) => x.last)).toEqual([false, true, false, true]);
  });

  it("ends a run at a closer and never makes it a member", () => {
    // A markdown heading, Obsidian's chrome, and a level-1 bar with no
    // headerKey all arrive here as the same flag: they end what is open and
    // join nothing.
    const m = computeSectionRuns([head(), node(), node({ closes: true }), node()]);
    expect(m.map((x) => x.member)).toEqual([true, true, false, false]);
    expect(m[1].last).toBe(true);
  });

  it("puts the bottom on the last block that renders something", () => {
    // THE FIRST OF THE TWO BUGS. A section ending in a storage region —
    // `<!--almanac:path-->` is a real block that renders nothing — rounded an
    // invisible element and left a band of empty surface under the content.
    const m = computeSectionRuns([head(), node(), node({ renders: false })]);
    expect(m[1].last).toBe(true);
    expect(m[2].last).toBe(false);
    // Still a member: it belongs to the section, it just cannot carry the edge.
    expect(m[2].member).toBe(true);
  });

  it("skips hidden blocks when placing the bottom", () => {
    const m = computeSectionRuns([head(), node(), node({ hidden: true })]);
    expect(m[1].last).toBe(true);
    expect(m[2].last).toBe(false);
  });

  it("makes a fully collapsed section both of its own ends", () => {
    // THE SECOND BUG. Every body block hidden means the head block is the whole
    // visible surface and has to close it — index 0 is a safe floor because the
    // head is never hidden by its own bar.
    const m = computeSectionRuns([
      head(),
      node({ hidden: true }),
      node({ hidden: true }),
    ]);
    expect(m[0]).toEqual({ member: true, first: true, last: true });
  });

  it("gives a lone head both ends", () => {
    // The welded case — Tags, Learning Path, Resources — where the block that
    // holds the bar is the whole section.
    expect(computeSectionRuns([head()])).toEqual([
      { member: true, first: true, last: true },
    ]);
  });

  it("closes the final run at the end of the note", () => {
    const m = computeSectionRuns([head(), node()]);
    expect(m[1].last).toBe(true);
  });

  it("returns one mark per node, and marks nothing for no nodes", () => {
    expect(computeSectionRuns([])).toEqual([]);
    expect(computeSectionRuns([node(), node()]).map((x) => x.member)).toEqual([
      false,
      false,
    ]);
  });
});
