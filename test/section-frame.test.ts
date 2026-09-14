// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";
import { splitGlyph } from "../src/ui/section-frame";

import { readCode, readCss, readSrc, srcFiles } from "./sources";
// ── one section frame ─────────────────────────────────────────────────────
//
// This file is the mechanism, not a nicety. The 2.56 plan counts 39
// header-shaped components in styles.css across 27 class-prefix families, and
// every one of them was written by someone who needed a titled collapsible
// section and had nothing to reach for. `widgets.ts` alone held three
// character-for-character copies of the same four lines.
//
// That is the third time this codebase has produced the shape for the reason:
// `createListRow` in 2.55.4, the wizard rail in 2.55.5, this now. What the
// first two taught is that extracting the thing is the easy half — the half
// that lasts is the assertion that stops a fourth copy, because the pressure
// that made the first three has not gone anywhere.
//
// SCANS CODE, NOT COMMENTS. The same distinction vocabulary.test.ts draws: a
// comment quoting the classes a bar used to build by hand is a record of what
// changed, and rewriting those would be revising the minutes.

// ── AND IT HAS TO ACTUALLY SCAN THE TREE (5.10) ───────────────────────
//
// This list was built with `readdirSync("src")` — no recursion — against a
// tree whose only top-level `.ts` file is `main.ts`. Every sweep below was
// therefore reading one irrelevant module and reporting the invariant held.
//
// THAT IS NOT A COSMETIC FAULT. It is the exact failure the comment above
// describes and exists to prevent: while the sweep was scanning nothing, three
// private section heads were added — the Trackers head and the Recall head in
// 5.7-5.9, on top of the tally's — each with its own left-hand chevron and its
// own forty lines of copied CSS, all against a green suite. A guard rail that
// silently covers one file is worse than none, because the green is read as an
// answer.
//
// `srcFiles` is in test/sources.ts beside the other source readers, so the
// next sweep finds a walker instead of writing a fifth copy of this loop, and
// it yields PATHS rather than module names — "widgets" does not tell anyone
// which of eleven files broke the rule.
const sources = srcFiles().map(({ path, code }) => ({
  file: path,
  code: code
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n"),
}));

// The one file allowed to build the frame's own markup.
const FRAME = "src/ui/section-frame.ts";

describe("the section header is built in one place", () => {
  it("lives in its own module, reachable from anywhere", () => {
    // Its own module from the first commit, exactly as list-row.ts had to be:
    // widgets.ts imports half the plugin, so anything defined inside it cannot
    // be imported back out. That is the whole mechanism of the duplication.
    const frame = readSrc("section-frame");
    expect(frame).toContain("export function sectionFrame(");
  });

  it("is the only thing that emits a header bar", () => {
    // The class is what HeaderBar's fold walk finds, so a second emitter is
    // not merely inconsistent — it is a section that folds by accident or not
    // at all, depending on which four lines were copied.
    const offenders = sources
      .filter(
        (s) =>
          s.file !== FRAME &&
          s.code.includes('cls: `ca-journal-header-bar')
      )
      .map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it("is the only thing that emits a header title or a glyph slot", () => {
    for (const { file, code } of sources) {
      if (file === FRAME) continue;
      expect(code, file).not.toContain('"ca-journal-header-title"');
      expect(code, file).not.toContain('"ca-journal-header-glyph"');
      expect(code, file).not.toContain('"ca-journal-header-count"');
    }
  });

  it("is the only thing that builds a section's fold bar", () => {
    // ── THE ALLOWANCE LIST RETIRED (5.14) ────────────────────────────────
    //
    // What stood here: `.ca-journal-note-collapse-bar`, the `note:` FIELD bar —
    // chevron on the left, uppercase micro-label, no hairline, no actions slot
    // — with THREE files allowed to build it, because a field was a different
    // object from a section and the field family owned its own head. The test
    // stopped a fourth SECTION head from being copied off it and could not
    // stop a fourth FIELD head, which is what `path:`, `attach:` and the
    // capture log each turned out to be.
    //
    // A field is now `foldableSection` through `fieldFrame`, so
    // the list has nothing to hold: no module outside this one builds a head
    // of either kind. The assertion is the rule with no exceptions to state.
    for (const { file, code } of sources) {
      if (file === FRAME) continue;
      expect(code, file).not.toContain("ca-journal-note-collapse-bar");
      expect(code, file).not.toContain("ca-journal-tasks-head");
      expect(code, file).not.toContain("ca-journal-recall-head");
      expect(code, file).not.toContain('"ca-journal-sec-fold-toggle"');
    }

    // AND THERE IS NO FIELD-SIZED HEAD LEFT TO COPY. 5.14 first gave the frame
    // a `variant: "field"` — a third size of the bar, `ca-journal-sec-field` in
    // place of `ca-journal-sec-l<n>` — and this test guarded the class against a
    // renderer spelling it. The reader rejected that size before release, so
    // `fieldFrame` builds a level-1 section like every other fold and the
    // class exists nowhere, which is a stronger form of the same guard: the
    // sweep below is over the WHOLE tree, `section-frame.ts` included.
    for (const { file, code } of sources) {
      expect(code, file).not.toContain("ca-journal-sec-field");
      expect(code, file).not.toContain('variant: "field"');
    }
    const frame = readSrc("section-frame");
    expect(frame).toContain("export function fieldFrame(");
    // One head, still: the point of 5.14 that survives its own revert.
    expect(frame).toContain("foldableSection(");
  });

  it("draws every field's head through the frame, and withholds it by one rule", () => {
    // ── DECISION 2, ASSERTED WHERE IT IS DECIDED (5.14) ───────────────────
    //
    // Seven field kinds, one head. `fieldHead` in note-field.ts states the two
    // branches once — no label or already titled from outside means no head and
    // the controls go into the bar that named it; otherwise `fieldFrame` — and
    // every renderer calls it rather than restating them. Before this release
    // `buildTasks` was the only one that knew about the titled case, and it
    // knew by carrying two `cls:` strings for CSS to choose between.
    const head = readSrc("note-field");
    expect(head).toContain("export function fieldHead(");
    expect(head).toContain("fieldFrame(");
    for (const file of [
      "src/ui/widgets/note-regions.ts",
      "src/ui/widgets/attachment-widgets.ts",
      "src/ui/widgets/recall-widgets.ts",
      "src/ui/widgets/log-list.ts",
    ]) {
      const code = sources.find((s) => s.file === file)!.code;
      expect(code, file).toContain("fieldHead({");
    }

    // THE TOOLS SURVIVE THE WITHHELD HEAD, which is the half of the rule that
    // is easy to lose: a Study note's `tasks:` under `header:✅ Tasks` draws no
    // title and still shows Compact and its progress readout. 5.10 fixed that
    // once for this one widget by hand; the frame now owes it to all seven.
    expect(head).toContain("barActions");
    expect(head).toContain("ca-journal-field-tools");
  });

  it("is given the host the section's body goes into", () => {
    // RULE ONE, ASSERTED STRUCTURALLY. `sectionFrame` APPENDS its bar, so the
    // host it is handed decides where the title lands relative to the content.
    // Every renderer here is passed two elements — the `container` it fills and
    // the `blockEl` the fold walks — and passing the second builds the bar into
    // a parent that already holds the filled first, which puts the title under
    // the section it names.
    //
    // That is not a matter of taste and it is not only cosmetic: the fold is
    // computed from the bar's LATER siblings, so a bar that arrives last folds
    // nothing at all. Both chart renderers were in that state from 5.7 to 5.9
    // and both looked fine in the stylesheet.
    //
    // A renderer that must draw first MOVES its nodes into the frame's body
    // afterwards — the `frame: section` idiom in widgets/index.ts — so there is
    // no case this refuses that has no answer.
    for (const { file, code } of sources) {
      expect(code, file).not.toContain("sectionFrame(blockEl");
      expect(code, file).not.toContain("foldableSection(blockEl");
    }
  });

  it("puts the chart sections' bars above their bodies", () => {
    // The same rule read off the two files that broke it, because "does not
    // pass blockEl" is satisfied by a call that is merely in the wrong PLACE.
    // Both renderers draw an empty state and a chart host into `container`, and
    // the frame has to be built before either.
    for (const module of ["chart-grid", "index"]) {
      const code = sources.find((s) =>
        s.file === `src/ui/widgets/${module}.ts`
      )!.code;
      const frame = code.indexOf("sectionFrame(container");
      const empty = code.indexOf("ca-journal-chart-empty");
      expect(frame, module).toBeGreaterThan(0);
      expect(empty, module).toBeGreaterThan(0);
      expect(frame, module).toBeLessThan(empty);
    }
  });

  it("lets a section block keep its own padding when the widget is the block (5.10)", () => {
    // THE MEASURED HALF OF "EVERY SECTION COLLAPSES TO THE SAME HEIGHT".
    // `--ca-sec-bar-h` makes the BAR one height whatever it carries; this is the
    // BLOCK around it. `.ca-journal-tracker-section` is the one widget whose
    // block can BE the section block — a `header:` fence whose body is the
    // logging grid — and the rule that stopped it drawing a second card was
    // zeroing the section's padding with it. On a Study subject that closed
    // Trackers ~16px shorter than the four sections under it.
    //
    // Asserted as a SPLIT: the chrome rule names all three selectors, the
    // padding rule names only the two where the tracker block sits INSIDE
    // something else.
    const t = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    const chrome = t.indexOf(
      ".ca-journal-sec-block .ca-journal-widget-block.ca-journal-tracker-section,"
    );
    expect(chrome, "no tracker chrome rule").toBeGreaterThan(0);
    const chromeRule = t.slice(chrome, t.indexOf("}", chrome));
    expect(chromeRule).toContain(
      ".ca-journal-sec-block.ca-journal-widget-block.ca-journal-tracker-section"
    );
    expect(chromeRule).toContain("background: none");
    expect(chromeRule).not.toContain("padding");
    // The padding rule is the next one, and the self-selector is NOT in it.
    const pad = t.indexOf(
      ".ca-journal-sec-block .ca-journal-widget-block.ca-journal-tracker-section,",
      chrome + 1
    );
    expect(pad, "no tracker padding rule").toBeGreaterThan(0);
    const padRule = t.slice(pad, t.indexOf("}", pad));
    expect(padRule).toContain("padding: 0");
    expect(padRule).not.toContain(
      ".ca-journal-sec-block.ca-journal-widget-block.ca-journal-tracker-section"
    );
  });

  it("has retired the two private heads the framing wave added", () => {
    // THE PAIR, AGAIN — the rules AND the markup, for the reason the quarter
    // cards taught below. `.ca-journal-tracker-head` and the Recall head's
    // chevron/title family were ~90 lines of copied CSS between them, each
    // shipped with a `display: none` rule to hide whichever of the two bars a
    // section ended up with second. Deleting one half would have left either
    // dead rules or an unstyled bar, and the second is the one that renders.
    //
    // SCANS RULES, NOT PROSE, the same distinction the source sweep above
    // draws: `styles/` is where the argument for a deletion is written down,
    // and 50-entry-header.css explains the tracker head's removal by naming
    // it. A comment recording what went is not the thing coming back.
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    for (const cls of [
      ".ca-journal-tracker-head",
      ".ca-journal-recall-chevron",
      ".ca-journal-recall-title-left",
    ]) {
      expect(css, cls).not.toContain(cls);
    }
    for (const { file, code } of sources) {
      for (const cls of [
        "ca-journal-tracker-head",
        "ca-journal-recall-chevron",
        "ca-journal-recall-title-left",
      ]) {
        expect(code, `${file} / ${cls}`).not.toContain(cls);
      }
    }
    // AND THE RULE THAT HID THE LOSER IS GONE TOO. A stylesheet that deletes
    // one of two bars is the tell that two were being drawn — it took the
    // tasks region's Compact toggle and its progress readout off every Study
    // note for three releases, silently, because the thing hidden was a whole
    // head and not just a title.
    expect(css).not.toContain(
      ".ca-journal-sec-block .ca-journal-tasks-head {"
    );
  });

  it("keeps the classes the fold walk and the stylesheet already know", () => {
    // The frame is a CONSTRUCTOR for the element the bar has always been, not
    // a new element. headerbar.ts finds bars by class, reads their level off
    // ca-journal-header-l1|2, and computes fold scope over the result — fifteen
    // tests of logic that has nothing to do with how a section looks.
    // Reparenting without renaming is what lets the visual change be a
    // stylesheet change.
    const frame = readSrc("section-frame");
    expect(frame).toContain("ca-journal-header-bar ca-journal-header-l");
    expect(frame).toContain("ca-journal-header-widgets");
    const bar = readSrc("headerbar");
    expect(bar).toContain('".ca-journal-header-bar"');
  });

  it("keeps the fold-walk marker off a section that owns its own children", () => {
    // The hazard that made the naive conversion worse than no conversion:
    // HeaderBar.recompute() does block.querySelectorAll(".ca-journal-header-bar")
    // and reads the BLOCK's fold level off the first hit. An inner dashboard
    // section carrying that class is a descendant, so the enclosing dashboard
    // would take its level and fold wrong.
    const frame = readSrc("section-frame");
    const at = frame.indexOf("const marker =");
    expect(at).toBeGreaterThan(0);
    const block = frame.slice(at, at + 220);
    expect(block).toContain('owns === "blocks"');
    expect(block).toContain("ca-journal-header-bar");
    // Both variants share the look, and there is one spelling of it again:
    // the composed class had a second arm for the field size while 5.14 was
    // being written, and the size went before the release did.
    expect(frame).toContain("ca-journal-sec ca-journal-sec-l${opts.level}");
  });

  it("lets one section put a link in the title slot", () => {
    // A subject's name in the Journals section opens that subject, with
    // Obsidian's hover preview wired to it. No other section's title is
    // clickable, and that single exception is why journals-section.ts could not
    // be converted alongside the quarter and year dashboards — those were a
    // mechanical swap and this needed a capability.
    //
    // The SLOT is still the frame's, which is the point: the size, the
    // truncation and the alignment match every other section, and only what
    // goes inside it is the caller's.
    const frame = readSrc("section-frame");
    expect(frame).toContain("titleRender?: (slot: HTMLElement) => void");
    const js = readSrc("journals-section");
    expect(js).toContain("titleRender: (slot) =>");
    expect(js).toContain("folderLink(plugin, slot, folder");
  });

  it("takes a glyph given separately as well as one split from the title", () => {
    // A `header:` directive is one line of markdown, so its glyph arrives
    // inside the title. The Journals section resolves its own per level and has
    // always had it as an element — asking it to concatenate a string the frame
    // would immediately re-split would be the frame demanding a shape for its
    // own convenience.
    const frame = readSrc("section-frame");
    expect(frame).toContain("const glyph = opts.glyph ?? split.glyph;");
  });

  it("owns the fold chevron for children-scoped sections", () => {
    // Four selectors agreeing with each other became one on the frame. The
    // rules were `.jjs-type-head.is-foldable` and `.jjs-group-head.is-foldable`
    // paired with two hover variants, and the elements they named no longer
    // carry those classes — so leaving them would have shipped an unstyled
    // chevron on every subject row.
    const css = readCss();
    expect(css).toContain(".ca-journal-sec.is-foldable");
    expect(css).not.toMatch(/\.jjs-(type|group)-head\.is-foldable/);
  });

  it("has retired the three families it replaced", () => {
    // The scoreboard's first real movement: 32 header roots to 28.
    const css = readCss();
    for (const cls of [
      ".jq-section-head {",
      ".jyr-section-head {",
      ".jjs-type-head {",
      ".jjs-group-head {",
    ]) {
      expect(css, cls).not.toContain(cls);
    }
  });

  it("and no caller still emits the markup they styled", () => {
    // THE HALF THAT WAS MISSING, and the defect it would have caught is the
    // reason 3.6 §9 exists. The test above asserts the RULES are gone; nothing
    // asserted the MARKUP was. `renderQuarterCards` kept building
    // `.jq-section-head` / `-title` / `-note` for four releases after the rules
    // that styled them were deleted, so the year page's Quarters heading
    // rendered as two unstyled adjacent spans — `Quarters0 of 12 entries`, with
    // no gap, because a retired rule cannot supply one.
    //
    // A stylesheet assertion and a source assertion that never meet is exactly
    // how source text says what was meant and is wrong about the DOM. These two
    // are neighbours now.
    for (const module of ["quarter-view", "year-view", "journals-section"]) {
      const src = readCode(module);
      for (const cls of ["jq-section-head", "jyr-section-head", "jjs-type-head", "jjs-group-head"]) {
        expect(src, `${module} / ${cls}`).not.toContain(cls);
      }
    }
  });

  it("styles the new slots", () => {
    const css = readCss();
    for (const cls of [
      ".ca-journal-header-glyph",
      ".ca-journal-header-count",
      "--ca-sec-gap",
      "--ca-sec-indent",
    ]) {
      expect(css, cls).toContain(cls);
    }
  });

  it("stopped drawing a two-pixel rule under every title", () => {
    // The density claim, asserted rather than eyeballed: five sections on one
    // note each spent ~52px of vertical block, and the rule was the part that
    // separated nothing in particular.
    // `.ca-journal-sec`, not `.ca-journal-header-bar` — the look and the fold-walk
    // marker were separated in 2.56.2 so that a section owning its own
    // children can be styled identically without joining the sibling walk.
    const css = readCss();
    const at = css.indexOf(".ca-journal-sec {");
    const block = css.slice(at, css.indexOf("}", at));
    expect(block).not.toContain("border-bottom: 2px");
    expect(block).toContain("var(--ca-sec-pad)");
    // AND THE ONE IT DOES DRAW IS THE HAIRLINE TOKEN (4.11), not a raw `1px`. The
    // bar now has two divisions in it — its own bottom rule and the strip its
    // controls sit on — and two ways of naming one number is one retune away from
    // drawing two different lines. `--ca-rule` is what a CARD divides itself with,
    // which is the weight 2.56 deleted from here.
    expect(block).toContain("border-bottom: var(--ca-rule-hair)");
    expect(block).not.toContain("border-bottom: 1px");
  });
});

// ── the section's actions sit on a strip of their own (4.11) ──────────────
//
// WHAT A VAULT RENDER SHOWED. On one homepage, five widget blocks each wearing
// `.ca-journal-block-head` — a slim band, a micro-label, a hairline — and directly
// under them *📊 Trends and Statistics [0] [+ Add chart]*, a bar of a visibly
// different kind with its button crowded onto the title's line. Two idioms for one
// job on one screen.
//
// So a level-1 title line carries what NAMES and NUMBERS the section, and
// everything that ACTS goes below it on `.ca-journal-group-foot`'s idiom. What makes
// that four declarations rather than a refactor is that the slot already exists and
// `.ca-journal-sec` already wraps: `flex: 1 0 100%` on the actions bar IS a second row.

describe("the section's actions sit on a strip of their own", () => {
  const css = () => readCss();
  const STRIP =
    ".ca-journal-sec-l1:not(.ca-journal-header-bar-untitled)\n  > .ca-journal-header-widgets.ca-journal-widget-bar {";

  it("is the slot that was already there, made a full row", () => {
    const t = css();
    const at = t.indexOf(STRIP);
    expect(at, "no actions strip").toBeGreaterThan(0);
    const rule = t.slice(at, t.indexOf("}", at));
    expect(rule).toContain("flex: 1 0 100%");
    // The anchored-right rule it overrides pushes itself right with `margin-left:
    // auto`; on a full row that would be a no-op with a stale intent in it.
    expect(rule).toContain("margin-left: 0");
  });

  it("divides the header with the group foot's hairline, not the card's rule", () => {
    // `.ca-journal-group-foot` is the same object one scale out — a hairline, air,
    // right-aligned — and the two must agree or the page has two kinds of strip
    // again.
    //
    // THE AIR IS 8px AS OF 4.13.8 §36, AND THE PAIR MOVED TOGETHER, which is what
    // this case is really pinning. At 4px the section strip put a bordered,
    // filled control two pixels under its own rule — measured on the Monthly
    // overview, hairline at y=374 and the scope button's box at y=376 — and read
    // as sitting on it. The foot holds a word and did not need the extra four
    // pixels; it takes them because a pair that is one decision moves as one.
    //
    // ASSERTED AS A PAIR AND AS A VALUE. The value alone would let one move; the
    // pair alone would let both drift back to 4px together.
    const t = css();
    const rule = t.slice(t.indexOf(STRIP), t.indexOf("}", t.indexOf(STRIP)));
    expect(rule).toContain("border-top: var(--ca-rule-hair)");
    expect(rule).toContain("padding-top: 8px");
    const foot = t.slice(
      t.indexOf(".ca-journal-group-foot {"),
      t.indexOf("}", t.indexOf(".ca-journal-group-foot {"))
    );
    expect(foot).toContain("border-top: var(--ca-rule-hair)");
    expect(foot).toContain("padding-top: 8px");
  });

  it("is not drawn at all when the section has no actions", () => {
    // `:empty` RATHER THAN A RENDER-TIME TEST, and this is the load-bearing half:
    // `buildAddCategoryButton` and every LiveWidget append into this slot AFTER
    // the frame is built, so a decision taken at draw time would be
    // wrong for exactly the sections with the most in them.
    expect(css()).toContain(
      ".ca-journal-sec-l1 > .ca-journal-header-widgets.ca-journal-widget-bar:empty"
    );
    const at = css().indexOf(
      ".ca-journal-sec-l1 > .ca-journal-header-widgets.ca-journal-widget-bar:empty"
    );
    expect(css().slice(at, css().indexOf("}", at))).toContain("display: none");
    // AFTER the strip rule, so the added pseudo-class is not fighting source order.
    expect(at).toBeGreaterThan(css().indexOf(STRIP));
  });

  it("leaves the untitled control strip alone", () => {
    // Study and the custom journals anchor their buttons under a real markdown
    // heading. There is no first row there, so a rule above the buttons would be a
    // rule above nothing.
    expect(STRIP).toContain(":not(.ca-journal-header-bar-untitled)");
  });

  it("stays at level 1, and level 2 keeps its inline pills", () => {
    // A Study index draws one level-2 section per subject, each carrying a single
    // `+ Topic`. Twenty subjects would become twenty two-line rows, which is the
    // opposite of the density this buys.
    const t = css();
    expect(t).not.toContain(
      ".ca-journal-sec-l2 > .ca-journal-header-widgets.ca-journal-widget-bar {"
    );
    // The pill scale is now ONE rule for both places rather than a rule and an
    // exception, because the argument was about a place and not about a level.
    const at = t.indexOf(".ca-journal-sec-l1 > .ca-journal-header-widgets .ca-journal-btn,");
    expect(at, "no shared pill scale").toBeGreaterThan(0);
    const rule = t.slice(at, t.indexOf("}", at));
    expect(rule).toContain(".ca-journal-sec-l2 .ca-journal-header-widgets .ca-journal-btn");
    expect(rule).toContain("font-size: var(--ca-text-2xs)");
    // And it is not duplicated where it used to live. Counted on the RULE — the
    // selector followed by its brace — because a cross-reference to it in a comment
    // one file over is a third occurrence and is not a second rule.
    expect(
      t.split(".ca-journal-sec-l2 .ca-journal-header-widgets .ca-journal-btn {")
    ).toHaveLength(2);
  });

  it("does not bleed to the card's edges", () => {
    // The bar's own `border-bottom` does bleed inside a section card
    // (70-section-surface.css), and `.ca-journal-group-foot` does not. Two
    // edge-to-edge hairlines 22px apart read as a banded table; this one divides
    // the header, so it stops where the text does.
    const t = css();
    const rule = t.slice(t.indexOf(STRIP), t.indexOf("}", t.indexOf(STRIP)));
    expect(rule).not.toContain("margin: 0 calc(-1 * var(--ca-sec-pad-x))");
  });

  it("closes with the section, on both kinds of fold (4.13.1 §2)", () => {
    // 4.11 let the strip draw while the section was collapsed and 70-section-
    // surface.css recorded that as "by design". The next render disagreed: a
    // closed *OPEN TASKS* with a hairline and a *Below* under it reads as a
    // section that did not close, and the two lines in the object are the title
    // and a control.
    //
    // TWO RULES, BECAUSE THE TWO FOLDS MARK DIFFERENT ELEMENTS. `frame: section`
    // puts `is-collapsed` on the WRAPPER (`foldableSection`, which builds its bar
    // with `owns: "children"` and therefore no `.ca-journal-header-bar` marker); a
    // `header:` bar puts it on the BAR ITSELF (`headerbar.ts`). One selector
    // cannot reach both, and a rule written for the wrong one matches nothing —
    // which is 4.13 §3's `:has(>` fault, and looks exactly like a decision.
    //
    // ONE RULE WITH TWO SELECTORS AS OF 5.10, where it was two rules. The pair
    // became a trio when the Journals card's private fold arrived, and the trio
    // is what this file's next case is about: a fold that joins a selector LIST
    // is one line, and a fold that has to copy a whole rule is one nobody
    // notices was not copied.
    const t = css();
    const sels = [
      ".ca-journal-sec-fold.is-collapsed > .ca-journal-sec > .ca-journal-header-widgets",
      ".ca-journal-sec-l1.ca-journal-header-bar.is-collapsed > .ca-journal-header-widgets",
    ];
    const at = t.indexOf(`${sels[0]},`);
    expect(at, "no shared rule for the two folds").toBeGreaterThan(0);
    const rule = t.slice(at, t.indexOf("}", at));
    for (const sel of sels) expect(rule, sel).toContain(sel);
    expect(rule).toContain("display: none");
    // AND NOT AT LEVEL 2, where the buttons sit on the title LINE rather than on
    // a strip of their own. There is no second row to close there, and hiding
    // them would take a control off a bar that is still drawn.
    expect(t).not.toContain(".ca-journal-sec-l2.ca-journal-header-bar.is-collapsed");
    expect(t).not.toContain(
      ".ca-journal-sec-fold.is-collapsed > .ca-journal-sec-l2"
    );
  });

  it("closes the Journals card with the same rule, not a third one (5.10)", () => {
    // WHAT THIS TEST USED TO ASSERT: *"there are three folds, not two"* — a rule
    // naming `.ca-jjs-type.is-collapsed` because `journals-section.ts::
    // makeFoldable` marked an element of its own, matched neither selector
    // above, and left a collapsed journal showing `+ Subject` while every other
    // collapsed section on the page had stopped.
    //
    // Three folds was never a decision anybody took; it was two files each
    // solving privately what `foldableSection` solves. A journal type is built
    // by it now, `.ca-jjs-type` is worn BY the fold wrapper rather than by an
    // element around it, and the pair above reaches it unchanged — so the
    // assertion is that the third rule is GONE and the shared one covers it.
    const t = css().replace(/\/\*[\s\S]*?\*\//g, "");
    expect(t).not.toContain(
      ".ca-jjs-type.is-collapsed > .ca-journal-sec > .ca-journal-header-widgets"
    );
    expect(readSrc("journals-section")).toContain("foldableSection(");
    expect(readSrc("journals-section")).not.toContain("makeFoldable(");
    // `owns: "children"` is `foldableSection`'s to set, and it must still be
    // set: the marker is withheld so an enclosing dashboard cannot read its fold
    // level off a descendant.
    expect(readSrc("section-frame")).toContain('{ ...opts, owns: "children" }');
  });

  it("does not write the same rule for a subject, which cannot use it", () => {
    // Written in and taken out once already. In 4.13.2 it would have matched
    // nothing because a subject that had a create button never folded and one
    // that folded had an empty slot; as of 4.13.3 it cannot match at all — a
    // subject is a CARD, so `makeFoldable` is not called for one and there is no
    // stack under it for a chevron to close.
    //
    // A rule that cannot fire is indistinguishable from a decision that was
    // made, which is the fault 4.13 §3 caught in this same file.
    expect(css()).not.toContain(".jjs-group.is-collapsed > .ca-journal-sec");
    // ONE FOLD LEFT IN THAT MODULE, and it is the type's. Counted on the CALL,
    // because the paragraphs about what went still name it.
    //
    // THE CALL IS `foldableSection` AS OF 5.10 and the count is the claim: a
    // subject is a card, and a card has no stack under it for a chevron to
    // close. Reaching for the shared fold does not change that — it removes the
    // reason a second one would be written.
    const code = readSrc("journals-section").replace(/\/\/.*$/gm, "");
    const calls = code.match(/foldableSection\(/g) ?? [];
    expect(calls.length, "a fold for more than the type").toBe(1);
    expect(code).toContain("foldKey(ctx.sourcePath, type.id)");
  });

  it("keeps the class the fold exclusions name, which is why no caller changed", () => {
    // `foldableSection` and `HeaderBar` both hard-code `.ca-journal-header-widgets` so
    // a click on a control acts instead of folding the section. A wrapper element
    // would have had to be added to both, and a button that folded its own section
    // is the bug that would have shipped.
    expect(readSrc("section-frame")).toContain(
      '".ca-journal-header-widgets, a, button, input, select"'
    );
    expect(readSrc("headerbar")).toContain(".ca-journal-header-widgets");
    // The slot is still built by the frame, in place, with both its classes.
    expect(readSrc("section-frame")).toContain(
      'cls: "ca-journal-widget-bar ca-journal-header-widgets"'
    );
  });
});

// ── the glyph split ───────────────────────────────────────────────────────
//
// Every caller splits a title the same way because exactly one of them does.
// Asserted here rather than left to the DOM, for the reason applyTypeChange
// became a method in 2.55.5: a decision reachable only through a rendered
// element is a decision nobody can check.

describe("a field wears the section's own head — 5.14", () => {
  // ── THE REVERT, PINNED ─────────────────────────────────────────────────
  //
  // 5.14 unified the diary's seven field heads and first drew the result at a
  // third size: `variant: "field"`, an uppercase `--ca-text-xs` eyebrow, no
  // hairline, no glyph slot, a `--ca-field-bar-h` of its own, and a rule
  // cancelling the card 70-section-surface.css paints on every fold.
  //
  // The reader rejected the size — "I do not like the eyebrow headers" — and
  // named the head they wanted: the one the journals surface draws. So the
  // unification stands and the size is gone, which is a thing worth asserting
  // in both directions. The eyebrow was reached for because the four labels it
  // replaced were eyebrows, and the same reasoning would reach for it again.
  const css = () => readCss().replace(/\/\*[\s\S]*?\*\//g, "");

  it("builds the field head at level 1, through the same frame", () => {
    const frame = readSrc("section-frame");
    const at = frame.indexOf("export function fieldFrame(");
    expect(at).toBeGreaterThan(0);
    const body = frame.slice(at, at + 600);
    expect(body).toContain("foldableSection(");
    expect(body).toContain("level: 1");
    // The marker the three stand-down rules read. It is the whole of what
    // `fieldFrame` adds on top of an ordinary fold.
    expect(body).toContain('addClass("ca-journal-field")');
  });

  it("leaves no third size of the bar in the stylesheet", () => {
    const t = css();
    expect(t).not.toContain("ca-journal-sec-field");
    expect(t).not.toContain("--ca-field-bar-h");
    // AND NOTHING TAKES THE CARD BACK OFF THE WRAPPER. That was the shape of
    // the rejected treatment — the fold kept its class and a rule cancelled
    // the fill, the border and the radius 70-section-surface.css had just
    // painted — so the check is on the three declarations rather than on the
    // selector: a rule whose SUBJECT is the bare field wrapper may adjust its
    // spacing (the flex column supplies the gap) and may not undraw its box.
    //
    // "BARE" IS TWO CONDITIONS, and both are load-bearing.
    //
    // THE FIELD IS THE SUBJECT — the rightmost compound — with `:has()` stripped
    // first. `.ca-journal-tasks:has(> .ca-journal-sec-fold.ca-journal-field)`
    // names the field only to say what its own subject CONTAINS, and that rule
    // stands the WIDGET's card down, which is required rather than forbidden.
    // Without the strip this test reads the argument as the subject and fails
    // the very rule that fixed the doubling it exists to catch.
    //
    // AND THERE IS NO ANCESTOR. A field inside a section card gives its own box
    // up (70-section-surface.css), so those rules cancel all three declarations
    // on purpose. What must never happen is the UNSCOPED cancel — the shape of
    // the rejected treatment, where a field is never a card anywhere.
    for (const rule of t.split("}")) {
      const [selectors, body = ""] = rule.split("{");
      const bare = selectors.replace(/:has\([^)]*\)/g, "");
      const unscoped = bare.split(",").some((sel) => {
        const parts = sel.trim().split(/[\s>+~]+/).filter(Boolean);
        return (
          parts.length === 1 && parts[0].includes("ca-journal-field")
        );
      });
      if (!unscoped) continue;
      for (const decl of ["background:", "border:", "border-radius:"]) {
        expect(body, decl).not.toContain(decl);
      }
    }
  });

  it("keeps one gap between seven fields, whatever kind they are (5.15)", () => {
    // WHAT 5.14 LEFT HALF DONE. `tasks:` and the capture log had their wrappers
    // stood down — box AND margin — because the frame inside draws the card.
    // `note:`, `list:` and `attach:` kept `margin: 0 0 0.9em`, which is what
    // each needed when it was an unlabelled box stacked in a fence.
    //
    // SO AN ENTRY'S RHYTHM DEPENDED ON WHICH KIND EACH FIELD WAS: 24px under
    // five of them (`--ca-widget-gap` plus the wrapper's own margin), 10px
    // under the other two, and 10px under whichever happened to be last. Two
    // fields dragged past each other took their gaps with them, so the page
    // re-spaced itself around a drop nobody asked for — half of *"it seems to
    // let the user place sections at odd positions"*.
    const t = css();
    for (const kind of ["note", "list", "attach"]) {
      const at = t.indexOf(
        `.ca-journal-${kind}:has(> .ca-journal-sec-fold.ca-journal-field)`
      );
      expect(at, `${kind} keeps a margin of its own`).toBeGreaterThan(0);
    }
    // AND THE CONDITION IS THE ONE THE OTHER TWO ALREADY USE, so this is one
    // rule with five hosts rather than a special case — and a bare `note:`
    // under a section bar, which draws no frame, matches none of them and
    // keeps the margin it has always had.
    expect(t).toContain(".ca-journal-note:last-child");
  });

  it("closes to the same height as every other section head", () => {
    // The reader's second report — "sections collapsed are not the same size"
    // — is answered by `--ca-sec-bar-h` rather than by a token of its own, so
    // a closed field and a closed section are one box rather than two boxes
    // that happen to agree.
    const t = css();
    expect(t).toContain(
      ".ca-journal-sec-l1:not(.ca-journal-header-bar-untitled) {"
    );
    expect(t).toMatch(/min-height:\s*var\(--ca-sec-bar-h\)/);
  });

  it("draws exactly one box around a field, in all three places", () => {
    const t = css();
    // 1. On a diary entry the field IS the card: nothing stands it down, and
    //    the two widgets that draw a surface of their own stand theirs down
    //    instead. THE WRAP IS THE OUTER ELEMENT — `buildTasks` and the capture
    //    log create it and hand it to `fieldHead`, which builds the field card
    //    inside it — so these are `:has(>` rather than descendant selectors.
    //    Written the other way round they match nothing at all, and a vault
    //    render showed the doubling this is here to stop.
    expect(t).toContain(
      ".ca-journal-tasks:has(> .ca-journal-sec-fold.ca-journal-field)"
    );
    expect(t).toContain(
      ".ca-journal-capture-log:has(> .ca-journal-sec-fold.ca-journal-field)"
    );
    expect(t).not.toContain(".ca-journal-field .ca-journal-tasks");
    expect(t).not.toContain(".ca-journal-field .ca-journal-capture-log");
    // 2. Inside a section the field's card stands down, so a Study topic's
    //    three Resources shelves are three parts of one card.
    expect(t).toContain(
      ".ca-journal-sec-block .ca-journal-sec-fold.ca-journal-field"
    );
    // 3. …and the section it is inside keeps its OWN surface, which the
    //    `:has()` stand-down took away for one release because a field wears
    //    the same wrapper class a `frame: section` fence does.
    expect(t).toContain(
      ".ca-journal-sec-fold:not(.ca-journal-field)"
    );
    expect(t).not.toMatch(
      /:has\(\s*\.ca-journal-sec-fold\s*\)/
    );
  });
});

describe("splitGlyph", () => {
  it("lifts a leading emoji out of the title", () => {
    expect(splitGlyph("📖 Lessons")).toEqual({ glyph: "📖", text: "Lessons" });
  });

  it("handles a glyph with a variation selector", () => {
    // "⚗️" is two code points. Splitting on whitespace rather than on a
    // character count is what makes that a non-event.
    expect(splitGlyph("⚗️ Chemistry")).toEqual({
      glyph: "⚗️",
      text: "Chemistry",
    });
  });

  it("leaves a title with no glyph entirely alone", () => {
    expect(splitGlyph("Learning Path")).toEqual({
      glyph: "",
      text: "Learning Path",
    });
  });

  it("does not mistake a first word for a glyph", () => {
    // The failure this guards: any test for "short leading token" makes
    // "On this day" render an "On" chip. A glyph has no letters or digits in
    // it, which is a property rather than a length.
    expect(splitGlyph("On this day").glyph).toBe("");
    expect(splitGlyph("2026 in review").glyph).toBe("");
  });

  it("keeps a non-Latin title as a title", () => {
    // \\p{L} rather than [a-z]: a section headed in Greek is a headed section,
    // and treating its first word as a glyph would put it in a 1.3em box.
    expect(splitGlyph("Μαθηματικά σήμερα").glyph).toBe("");
  });

  it("keeps the rest of a multi-word title together", () => {
    expect(splitGlyph("🎓 Study this week").text).toBe("Study this week");
  });

  it("survives a title that is only a glyph", () => {
    // No trailing text to split off, so it stays the title — an empty title
    // with a glyph beside it would render a section with no name.
    expect(splitGlyph("📖")).toEqual({ glyph: "", text: "📖" });
  });

  it("trims without losing anything", () => {
    expect(splitGlyph("  📖   Lessons  ")).toEqual({
      glyph: "📖",
      text: "Lessons",
    });
  });
});

// ── the actions strip stays one line (2.56.6, re-argued in 4.11) ─────────
//
// WHAT IT WAS: reported from a ~460px pane, every section with a button drew two
// rows — the title on one and the buttons wrapped onto the next, floating above
// the section's own rule. 2.53 fought the same wrap from the other side; the
// comment on `chart-edit` records three toolbar buttons pushing the first chart
// off the screen, and the answer then was to delete a button. There was nothing
// left to delete, so the LABELS went.
//
// WHAT IT IS NOW: at level 1 the second row is DELIBERATE — 4.11 gives the actions
// a strip of their own — so "a collapsed section costs one line" is not the promise
// any more. The rule is unchanged and its job is one level in: keep the STRIP to
// one line, because four labelled buttons in a 440px sidebar wrap inside it and a
// two-row strip is the same floating chrome one scale down. Every assertion below
// survives verbatim; only what they are for has moved.

describe("section actions in a narrow pane", () => {
  const css = () => readCss();

  it("drops the labels rather than the buttons", () => {
    const t = css();
    const at = t.indexOf(".ca-journal-btn:not(.mod-cta):has(.ca-journal-btn-icon)");
    expect(at).toBeGreaterThan(0);
    // Inside a container query, so a narrow sidebar on a wide screen collapses
    // too — the pane is what the row has to fit into, not the window.
    expect(t.lastIndexOf("@container (max-width: 460px)", at)).toBeGreaterThan(0);
  });

  it("keeps the label on the section's one CTA", () => {
    // Icon-only was applied to every button in 2.56.6 and that broke the copy:
    // an empty Lessons section says «Press "Lesson" above to add one», and the
    // button it names had become a wordless square. The secondary actions can
    // afford to be icons — they are recognisable and their labels survive as
    // tooltips — but the one action a section is telling you to press should
    // say what it is.
    expect(css()).toContain(".ca-journal-btn:not(.mod-cta)");
  });

  it("only hides a label that has an icon to fall back on", () => {
    // A button spec may carry no icon — `BUTTON_LABELS[action] ?? { label:
    // action }` covers a hand-written directive naming an action this build
    // does not know. Hiding that label leaves an empty box that does something.
    const t = css();
    expect(t).toContain(".ca-journal-btn:not(.mod-cta):has(.ca-journal-btn-icon)");
    expect(t).toContain(".ca-journal-btn:not(.mod-cta):has(.ca-journal-btn-emoji)");
  });

  it("keeps the label reachable when it is not drawn", () => {
    // buildButton sets aria-label and title from the same string, which is what
    // makes hiding it a layout change rather than a loss. Asserted here because
    // the CSS above silently depends on it.
    const w = readSrc("widgets");
    const at = w.indexOf("const hover = spec.tooltip ?? spec.label;");
    expect(at).toBeGreaterThan(0);
    const block = w.slice(at, at + 220);
    expect(block).toContain('setAttr("aria-label", hover)');
    expect(block).toContain('setAttr("title", hover)');
  });

  it("makes a kind's create button its section's CTA", () => {
    // Was `primary: kind.id === type.kinds[0]?.id`, which was right when
    // several create buttons shared one toolbar. Since 2.56 each sits alone in
    // its own section header, and the rule tinted Lessons' action and not
    // Practice's for a reason — which kind is listed first in Settings — that
    // is invisible on the page.
    const w = readSrc("widgets");
    const at = w.indexOf("label: `New ${kind.label}`");
    expect(at).toBeGreaterThan(0);
    expect(w.slice(at, at + 120)).toContain("primary: true");
  });

  it("names the button the empty state tells you to press", () => {
    // The kind's label is "Lesson" and the button reads "New Lesson", so the
    // callout pointed at something not on the screen. Both derive from
    // `kind.label`, so they agree by construction now.
    const t = readSrc("tables");
    expect(t).toContain("Press “New ${kind.label}” above");
  });

  it("draws every create action at the same weight", () => {
    // "New Lesson" and "New Practice" are the same verb in two adjacent
    // sections of one note, and were a CTA and a grey button respectively.
    // Nobody chose that: new-practice was the only create action in the table
    // without `primary`.
    const w = readSrc("widgets");
    for (const id of [
      '"new-journal"',
      '"new-lesson"',
      '"new-practice"',
      '"chart-add"',
      '"journal-chart-add"',
    ]) {
      const at = w.indexOf(`  ${id}: {`);
      expect(at, id).toBeGreaterThan(0);
      expect(w.slice(at, w.indexOf("\n", at)), id).toContain("primary: true");
    }
  });
});

// ── the two chart editors are built from the same parts (2.56.10) ────────
//
// §4's finding: the diary's chart editor is a two-step wizard with a rail, a
// shared error line and a shared footer, and the journal's extended `Modal` and
// hand-rolled all of it. They were merely different before 2.55.5 and became
// different in a way a reader meets in one session, because both are reachable
// from the year dashboard. This is the bill.

describe("the journal chart editor uses the shared frame", () => {
  const src = (f: string) => readSrc(f);
  // Code only. This file explains at length what it deliberately is NOT — not
  // stepped, no longer emptying its own contentEl — and an explanation naming
  // the thing it stopped doing is the record of the change, not a use of it.
  const codeOf = (f: string) =>
    src(f)
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");

  it("extends EditorModal", () => {
    expect(src("journal-chart-ui.ts")).toContain(
      "class JournalChartEditModal extends EditorModal"
    );
  });

  it("is NOT a wizard, which is where the plan was wrong", () => {
    // §4.2 said "onto SteppedEditorModal, two steps". The diary's editor has
    // seven fields with real dependencies; this one has three and none, and
    // splitting three independent fields over two pages is §3's complaint one
    // level up — the same argument that makes the tracker wizard drop its
    // middle step when a type has nothing to configure.
    const s = codeOf("journal-chart-ui.ts");
    expect(s).not.toContain("SteppedEditorModal");
    expect(s).not.toContain("stepList()");
  });

  it("stopped hand-rolling the parts the frame owns", () => {
    const s = codeOf("journal-chart-ui.ts");
    // Its own <h3>, its own error div, its own button row, its own onOpen.
    expect(s).not.toContain('createEl("h3"');
    expect(s).not.toContain("errorEl");
    expect(s).not.toContain("modal-button-container");
    expect(s).not.toContain("onOpen(): void");
  });

  it("repaints through the frame when starting another chart", () => {
    // It used to call `contentEl.empty()` then `onOpen()` again, which rebuilt
    // the head and footer along with the fields — and under the frame would
    // have thrown away the shared error element with them.
    const s = codeOf("journal-chart-ui.ts");
    const at = s.indexOf("private startAnother()");
    expect(at).toBeGreaterThan(0);
    const body = s.slice(at, at + 600);
    expect(body).toContain("this.refreshBody()");
    expect(body).not.toContain("contentEl.empty()");
  });

  it("retired the error line that existed to not drift", () => {
    // The old CSS said `.ca-chart-error` shared the event editor's rule
    // "so it should not be a second style that drifts" — while being exactly
    // that: two selectors kept in step by hand rather than one element.
    const css = readCss();
    expect(css).not.toMatch(/^\.ca-chart-error \{/m);
    expect(css).not.toContain(".ca-chart-error,");
  });
});

// ── the windows that were copying the frame (2.56.11) ────────────────────
//
// §5.1's exhibit was not a count, it was a sentence already in styles.css: the
// tracker picker "borrows .ca-editor-modal's frame (head / scrolling body
// / footer) so the two windows read as the same kind of object". It extended
// `Modal` and rebuilt those three elements by hand — a component that wanted
// the shared thing badly enough to reimplement its markup, described accurately
// by someone who could see the problem and had no cheap way to fix it.

describe("editors reach the frame instead of copying it", () => {
  const src = (f: string) => readSrc(f);
  const codeOf = (f: string) =>
    src(f)
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");

  it("has the tracker picker on the frame", () => {
    expect(src("tracker-picker.ts")).toContain(
      "class TrackerPickerModal extends EditorModal"
    );
  });

  it("has the kind-change confirmation on the frame", () => {
    expect(src("kind-change.ts")).toContain(
      "class KindChangeModal extends EditorModal"
    );
  });

  it("stops hand-building the frame's own elements", () => {
    // The classes are the frame's to emit. A window writing them itself is one
    // stylesheet change away from looking like a different app.
    for (const f of ["tracker-picker.ts", "kind-change.ts"]) {
      const code = codeOf(f);
      expect(code, f).not.toContain('"ca-editor-head"');
      expect(code, f).not.toContain('"ca-editor-subtitle"');
      expect(code, f).not.toContain('"ca-editor-footer"');
    }
  });

  it("routes Enter through the frame's hook rather than a second listener", () => {
    // The picker's Enter-takes-the-first-match is an override now. The frame
    // already binds Enter on single-line inputs, so a keydown listener on the
    // search box would have been two answers to one key.
    const code = codeOf("tracker-picker.ts");
    expect(code).toContain("protected async onEnterKey()");
    expect(code).not.toContain('search.addEventListener("keydown"');
  });

  it("keeps resolving its promise exactly once, on close", () => {
    // Both windows answer a caller's `await` rather than saving. Whatever route
    // reaches the end — a row, the CTA, Cancel, Escape — onClose is the single
    // place that settles it, and it must still run the frame's own teardown.
    for (const f of ["tracker-picker.ts", "kind-change.ts"]) {
      const code = codeOf(f);
      const at = code.indexOf("onClose(): void {");
      expect(at, f).toBeGreaterThan(0);
      expect(code.slice(at, at + 300), f).toContain("super.onClose()");
    }
  });

  it("no longer describes the picker as borrowing the frame", () => {
    const css = readCss();
    expect(css).not.toContain("It borrows .ca-editor-modal's frame");
    expect(css).toContain("It USES .ca-editor-modal's frame");
  });
});

// ── the last two, and the one the frame owed them (2.56.12) ──────────────

describe("every editor is on the shared frame", () => {
  const src = (f: string) => readSrc(f);
  const codeOf = (f: string) =>
    src(f)
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");

  it("has all five of §5.2's list on it", () => {
    const on: [string, string][] = [
      ["journal-chart-ui.ts", "JournalChartEditModal"],
      ["tracker-picker.ts", "TrackerPickerModal"],
      ["kind-change.ts", "KindChangeModal"],
      ["capture.ts", "CaptureModal"],
      ["event-ui.ts", "EventEditModal"],
    ];
    for (const [f, cls] of on) {
      expect(codeOf(f), cls).toMatch(
        new RegExp(`class ${cls} extends (Stepped)?EditorModal`)
      );
    }
  });

  it("leaves the generic primitives on Modal", () => {
    // PromptModal, ConfirmModal and NewNoteModal are not editors: no head, no
    // body, no footer to share. Converting them would be the frame spreading
    // for its own sake.
    expect(codeOf("modals.ts")).toContain("extends Modal");
  });

  it("has one error line in the plugin, not one per window", () => {
    const css = readCss();
    expect(css).not.toMatch(/^\.ca-event-error/m);
    expect(css).not.toMatch(/^\.ca-chart-error/m);
    expect(css).toContain(".ca-editor-error");
  });
});

// A failed write must not cost the reader what they typed. Until 2.56.12 the
// frame's `await this.commit()` was bare, so a throw became an unhandled
// rejection — every call site is `void this.trySubmit()` — and the window sat
// there having apparently done nothing.

describe("a commit that fails keeps the window open", () => {
  const frame = () => readSrc("editor-modal");

  it("catches, reports in the error line, and does not close", () => {
    const t = frame();
    const at = t.indexOf("try {\n      await this.commit();");
    expect(at).toBeGreaterThan(0);
    const block = t.slice(at, at + 400);
    expect(block).toContain("this.showError(this.commitFailureMessage())");
    // The `return` before `this.close()` is the whole point.
    expect(block.indexOf("return;")).toBeLessThan(block.indexOf("this.close()"));
  });

  it("lets a window say what it was writing", () => {
    expect(frame()).toContain("protected commitFailureMessage()");
    for (const f of ["capture.ts", "event-ui.ts"]) {
      expect(readSrc(f), f).toContain(
        "commitFailureMessage()"
      );
    }
  });

  it("has capture reporting an empty note in the error line, not a toast", () => {
    // A toast about the field you are looking at is a message delivered
    // somewhere other than where the problem is.
    const t = readSrc("capture");
    const at = t.indexOf("protected validate()");
    expect(at).toBeGreaterThan(0);
    expect(t.slice(at, at + 200)).toContain("Nothing to capture.");
  });
});

// ── the edge has to be a pixel (2.56.19) ─────────────────────────────────
//
// The section card shipped with a 0.5px border and it was invisible. The number
// came from a mockup, not from this plugin — it was the only sub-pixel border
// among the 147 in the stylesheet. At device-pixel-ratio 1 a 0.5px line has no
// pixel to occupy, so the renderer approximates it by dropping the alpha, and
// against a border colour already chosen to be quiet that is nothing at all.

describe("borders are visible at 1x", () => {
  it("draws the section card's edge at a whole pixel", () => {
    const css = readCss();
    const at = css.indexOf(".ca-journal-sec-block {");
    expect(at).toBeGreaterThan(0);
    // Declarations only. The rule's comment records what the value used to be
    // and why it changed, which is the record rather than the value.
    const block = css
      .slice(at, css.indexOf("\n}", at))
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(block).toContain("border-left: 1px solid");
    expect(block).not.toContain("0.5px");
  });

  it("has no sub-pixel border anywhere in the stylesheet", () => {
    // Not style policing: a border nobody can see is a border that will be
    // re-added by the next person who notices the card has no edge.
    const css = readCss();
    const declarations = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const subpixel = [
      ...declarations.matchAll(
        /border(?:-(?:top|right|bottom|left))?:\s*0?\.\d+px/g
      ),
    ].map((m) => m[0]);
    expect(subpixel).toEqual([]);
  });
});

describe("one bar, at one scale (4.13 §1)", () => {
  // WHAT THIS SUITE COULD NOT SEE UNTIL SOMEBODY LOOKED. Two modules title a
  // block — `sectionFrame` for a fence carrying `header:` or `frame: section`,
  // `buildHead` for a bare one — and nothing anywhere compared them. The first
  // vault render of the three dashboards showed `tasks-table` as `⏳ OPEN TASKS`
  // at 11.2px on the homepage and `⏳ Open Tasks` at 15.2px on both dashboards,
  // from one string in `SECTION_TITLES`, with the quieter of the two drawing the
  // HEAVIER rule. Nobody chose any of that; it fell out of which page composed a
  // modifier.
  //
  // They cannot be merged into one module — `NOT_A_CELL` evicts a `.ca-journal-sec`
  // from a row cell, so a widget inside a group can only ever be titled by a
  // block head — so they are held together by tokens instead, and this is what
  // checks that they still are.
  const rules = (): string => readCss().replace(/\/\*[\s\S]*?\*\//g, "");
  // ANCHORED ON A NEWLINE, and this file has now been bitten by the alternative
  // twice: `indexOf(".ca-journal-header-toggle {")` finds it inside
  // `.ca-journal-sec-l2 > .ca-journal-header-toggle {` first, and reads the override
  // while believing it read the base rule.
  const body = (selector: string): string => {
    const t = rules();
    const at = t.indexOf(`\n${selector}`);
    expect(at, `${selector} is gone`).toBeGreaterThan(-1);
    return t.slice(at, t.indexOf("}", at));
  };

  it("gives section and widget block titles their tokens with natural casing", () => {
    const secRule = body(".ca-journal-header-title {");
    expect(secRule).toContain("font-size: var(--ca-sec-title-size)");
    expect(secRule).toContain("color: var(--ca-sec-title-ink)");
    expect(secRule).toContain("text-transform: none");

    const blockRule = body(".ca-journal-block-head-title {");
    expect(blockRule).toContain("font-size: var(--ca-bar-text)");
    expect(blockRule).toContain("color: var(--ca-bar-ink)");
    expect(blockRule).toContain("text-transform: none");
  });

  it("reveals widget block heads on hover while keeping them discrete at rest", () => {
    const cardHead = body(".ca-journal-widget-card > .ca-journal-block-head {");
    expect(cardHead).toContain("opacity: 0");
    // AND IT OVERLAYS RATHER THAN OPENING A GAP (4.34.3). It animated
    // `max-height` from 0, which is height the card did not have a moment
    // earlier — so hovering a widget in a group pushed its own content down and
    // made its cell taller than the ones beside it. A label about a widget was
    // rearranging the widget.
    expect(cardHead).toContain("position: absolute");
    expect(cardHead).not.toContain("max-height");
    // AND NEITHER HOST HAS A HIT AREA OF ITS OWN AT REST (4.34.4, fixed in
    // 4.34.5). The trigger is the grip's 44px box and nothing else — the head
    // names what the grip picks up, so the two appear together. A full-width
    // strip along the top edge still opened the band on the way past, because
    // the top of a card is something a pointer crosses to get anywhere else.
    //
    // ASKED OF EVERY REST RULE, NOT OF THE CARD'S. 4.34.4 set this on the card
    // and missed the block — the same head with a second host — so a widget
    // outside a group went on opening its band to any pointer near its top edge,
    // and the same control behaved two ways on one page. A test that named one
    // host could not have caught that, which is why this one enumerates them.
    const rests = rules()
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("}")
      .map((r) => r.split("{"))
      .filter(
        ([sel, decls]) =>
          sel !== undefined &&
          decls !== undefined &&
          / > \.ca-journal-block-head\s*$/.test(sel) &&
          decls.includes("opacity: 0")
      );
    expect(rests.length, "the head's rest rules").toBeGreaterThanOrEqual(2);
    for (const [sel, decls] of rests) {
      expect(decls, sel.trim()).toContain("pointer-events: none");
      expect(decls, sel.trim()).toContain("position: absolute");
    }
    const raw = rules();
    // NOT FROM ANYWHERE IN THE CARD, which is the reveal this replaced.
    expect(raw).not.toContain(".ca-journal-widget-card:hover > .ca-journal-block-head");
    expect(raw).toContain(
      ".ca-journal-widget-card:has(> .ca-jbd-handle:hover) > .ca-journal-block-head"
    );
    // AND THE BAND KEEPS ITSELF OPEN once it is, which is what lets the pointer
    // walk off the dots and into it — the one thing its own `:hover` is for, and
    // it only works because the open state takes `pointer-events` back.
    expect(raw).toContain(".ca-journal-widget-card > .ca-journal-block-head:hover");
  });

  it("divides both of them with the same rule weight", () => {
    // The block head drew `--ca-rule` (2px) under an 11.2px label while the
    // section bar drew `--ca-rule-hair` (1px) under a 15.2px one. One object
    // cannot divide itself two ways.
    expect(body(".ca-journal-block-head {")).toContain(
      "border-bottom: var(--ca-rule-hair)"
    );
    expect(body(".ca-journal-sec {")).toContain(
      "border-bottom: var(--ca-rule-hair)"
    );
  });

  it("keeps the glyph larger than the title, and says so", () => {
    // THE ONE PLACE "ONE SCALE" IS NOT LITERAL, and it is deliberate: an emoji at
    // 11.2px is a smudge, and a slot exists to align a column of titles, which it
    // can only do if what sits in it can be seen.
    for (const sel of [".ca-journal-header-glyph {", ".ca-journal-block-head-glyph {"]) {
      const rule = body(sel);
      expect(rule, sel).toContain("font-size: var(--ca-bar-glyph)");
      expect(rule, sel).toContain("width: var(--ca-sec-glyph)");
    }
  });

  it("lets no level-2 rule set a font-size", () => {
    // THE HIERARCHY INVERSION THIS RELEASE CLOSED, standing. Level 2 used to take
    // `--ca-text-sm` to say "nested" — which was smaller than level 1 while level
    // 1 was 0.95em, and LARGER than it the moment level 1 became 0.7em. A subject
    // row bigger than the section containing it is the sort of thing a stylesheet
    // states rather than notices, so this is stated instead.
    // THE TITLE AND THE GLYPH, not everything nested under a level-2 bar: the
    // action pills legitimately set their own size, and they set it to the same
    // `--ca-text-2xs` the title now reads — which is the point rather than an
    // exception, since the whole bar is one scale.
    const t = rules();
    for (const m of t.matchAll(/\.ca-journal-sec-l2[^{]*\{([^}]*)\}/g)) {
      const selector = m[0].slice(0, m[0].indexOf("{"));
      if (!/header-title|header-glyph/.test(selector)) continue;
      expect(m[1], selector).not.toContain("font-size");
    }
  });

  it("puts the fold control at the right-hand end of both bars", () => {
    // 4.13 §1b. `margin-left: auto` is what moves it, and it has one owner per
    // flex line — at level 1 the actions strip is its own row and gives its auto
    // margin up, at level 2 the toggle gives its up and takes `order` instead.
    for (const sel of [".ca-journal-header-toggle {", ".ca-journal-sec-fold-toggle {"]) {
      const rule = body(sel);
      expect(rule, sel).toContain("margin-left: auto");
      // Sized against the bar rather than against the note: this one had no
      // width, height or icon size at all and fell back to ~18px beside an
      // 11.2px title.
      expect(rule, sel).toContain("font-size: var(--ca-bar-glyph)");
      expect(rule, sel).toContain("width:");
    }
    expect(body(".ca-journal-sec-l2 > .ca-journal-header-toggle {")).toContain("order: 1");
  });

  it("points the chevron down when closed and up when open", () => {
    // RE-CHOSEN WITH THE MOVE. Rotating -90° pointed it right, which reads as
    // "opens rightward" beside a heading and reads as pointing off the card once
    // the control sits on the right edge. Down/up is the ordinary accordion, and
    // the base icon is now the CLOSED state — so the transform hangs off
    // `:not(.is-collapsed)`.
    const t = rules();
    expect(t).toContain(".ca-journal-header-bar:not(.is-collapsed) .ca-journal-header-toggle");
    expect(t).toContain(
      ".ca-journal-sec-fold:not(.is-collapsed) > .ca-journal-sec > .ca-journal-sec-fold-toggle"
    );
    // SCOPED TO THESE TWO. Other chevrons in the sheet still rotate -90° and are
    // right to — `jjs-toggle` and the events list sit on the LEFT of what they
    // fold, where pointing right is what a folded heading does. The direction
    // follows the side, which is the whole reason it was re-chosen here.
    for (const sel of [
      ".ca-journal-header-bar:not(.is-collapsed) .ca-journal-header-toggle",
      ".ca-journal-sec-fold:not(.is-collapsed) > .ca-journal-sec > .ca-journal-sec-fold-toggle",
    ]) {
      const at = t.indexOf(sel);
      expect(t.slice(at, t.indexOf("}", at))).toContain("rotate(180deg)");
    }
    expect(t).not.toContain(".ca-journal-header-bar.is-collapsed .ca-journal-header-toggle");
  });

  it("stands the surface down for a block that is already a card (4.59.0)", () => {
    // ONE CARD, NOT TWO. `claimOwnBlock` marks any block holding a level-1 bar
    // as a section surface, and a surface is a card — so a fence whose widget
    // block ALREADY draws one ends up inside another. It showed up the day the
    // period summary gained a bar: `.ca-journal-overview-card` has been a card since
    // 3.2 and had never held a `header:` line, so the two had never met.
    const rule = body(".ca-journal-sec-block:has(.ca-journal-overview-card),");
    for (const off of ["background: none", "border: none", "padding: 0"]) {
      expect(rule).toContain(off);
    }
    // THE RUN'S EDGES CARRY THE SAME CLASSES AT THE SAME SPECIFICITY, so a single
    // selector would lose to `.is-first` and `.is-last` on exactly the blocks a
    // welded section is both of. Listing them is the assertion, not the tidiness.
    for (const at of [".is-first", ".is-last", ".is-first.is-last"]) {
      expect(rule).toContain(`.ca-journal-sec-block${at}:has(.ca-journal-overview-card)`);
    }
    // A DESCENDANT, NOT A CHILD, for the reason the collapsed rule below states:
    // the surface is claimed on `siblingAnchor()`, which is not always the
    // postprocessor's own element, so the card can sit a level further in.
    expect(rule).not.toContain(":has(> .ca-journal-overview-card");
    // AND THE INNER CARD IS THE ONE THAT SURVIVES, which is the half a selector
    // cannot state. 4.1 §3.1 cancels the WIDGET's card inside a framed block;
    // here it is the outer that gives way, because the overview card's bands are
    // measured against its inset and the surface has nothing measured against
    // its own. A rule cancelling the inner one would strand all three.
    expect(rules()).not.toContain(
      ".ca-journal-sec-block .ca-journal-overview-card {\n  background: none"
    );
  });

  it("takes the bottom padding off a collapsed section (4.13 §4)", () => {
    // A closed section reserved 10px under a body it was not drawing — the
    // `.is-last` gap, standing under a bar whose rule had already been cancelled
    // two rules above it. The `frame: section` twin had fixed this at the foot of
    // the same file; the block variant had no rule at all, which is how a defect
    // survives in a stylesheet that argues with itself in comments.
    // ASKED FOR BY ITS WHOLE SELECTOR AS OF 4.59.0. `.ca-journal-sec-block.is-last:has(`
    // stopped being unique that release: the surface also stands down for a block
    // that already draws its own card, which is a second `:has()` on the same two
    // classes. A prefix that matches two rules silently reads whichever comes
    // first in the file, which is a test that passes for the wrong reason the
    // moment anything is inserted above it.
    const rule = body(
      ".ca-journal-sec-block.is-last:has(.ca-journal-sec-l1.ca-journal-header-bar.is-collapsed)"
    );
    expect(rule).toContain("padding-bottom: 0");
    // A DESCENDANT, NOT A CHILD, and this is the assertion rather than a comment
    // because the first cut of the rule used `:has(> …)` — which matches nothing,
    // since `claimOwnBlock` marks the note's block element and the bar is built
    // inside the widget block within it. A rule that cannot fire looks exactly
    // like a decision that was made.
    const head = "\n.ca-journal-sec-block.is-last:has(.ca-journal-sec-l1.ca-journal-header-bar.is-collapsed)";
    const selector = rules().slice(
      rules().indexOf(head),
      rules().indexOf("{", rules().indexOf(head))
    );
    expect(selector).not.toContain(":has(>");
    expect(selector).toContain(".ca-journal-sec-l1.ca-journal-header-bar.is-collapsed");
  });

  it("does not stretch the short column's last widget (4.13.5 §2)", () => {
    // INVERTED FROM 4.13 §4, AND THE RENDER IS WHY. The rule read
    // `.ca-journal-block-cell > :last-child { flex: 1 1 auto }`, to close the band
    // of nothing a shorter column left above the group's foot. It closed it in
    // the wrong place: stretching the last CARD does not stretch a month grid, so
    // the homepage's diary card ran to the taller column's bottom with 88px of
    // filled, bordered card under its content. A short column reading as short is
    // ordinary; a card with an empty band at the bottom reads as broken.
    //
    // Asserted on the whole sheet rather than through `body()`, which requires
    // the rule to exist. The selector is specific enough that a re-introduction
    // anywhere would be caught, and that is what this is watching for — the
    // argument for the rule is intuitive and will be made again.
    expect(rules()).not.toContain(".ca-journal-block-cell > :last-child");
  });

  it("emits the block head's glyph under its own class", () => {
    // `journal-header-glyph` HAS ONE OWNER, asserted at the top of this file, and
    // that ownership is worth more than the two slots sharing a name — they share
    // their tokens, which is where drift would actually hurt.
    const src = readCode("block-drag");
    expect(src).toContain("splitGlyph(title)");
    expect(src).toContain("-glyph`");
    expect(src).not.toContain('"journal-header-glyph"');
  });
});
