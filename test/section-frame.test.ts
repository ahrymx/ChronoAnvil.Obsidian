// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { splitGlyph } from "../src/ui/section-frame";

import { readCode, readCss, readSrc } from "./sources";
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

const SRC = "src";
const sources = readdirSync(SRC)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => ({
    file: f,
    code: readFileSync(`${SRC}/${f}`, "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n"),
  }));

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
          s.file !== "section-frame.ts" &&
          s.code.includes('cls: `journal-header-bar')
      )
      .map((s) => s.file);
    expect(offenders).toEqual([]);
  });

  it("is the only thing that emits a header title or a glyph slot", () => {
    for (const { file, code } of sources) {
      if (file === "section-frame.ts") continue;
      expect(code, file).not.toContain('"journal-header-title"');
      expect(code, file).not.toContain('"journal-header-glyph"');
      expect(code, file).not.toContain('"journal-header-count"');
    }
  });

  it("keeps the classes the fold walk and the stylesheet already know", () => {
    // The frame is a CONSTRUCTOR for the element the bar has always been, not
    // a new element. headerbar.ts finds bars by class, reads their level off
    // journal-header-l1|2, and computes fold scope over the result — fifteen
    // tests of logic that has nothing to do with how a section looks.
    // Reparenting without renaming is what lets the visual change be a
    // stylesheet change.
    const frame = readSrc("section-frame");
    expect(frame).toContain("journal-header-bar journal-header-l");
    expect(frame).toContain("journal-header-widgets");
    const bar = readSrc("headerbar");
    expect(bar).toContain('".journal-header-bar"');
  });

  it("keeps the fold-walk marker off a section that owns its own children", () => {
    // The hazard that made the naive conversion worse than no conversion:
    // HeaderBar.recompute() does block.querySelectorAll(".journal-header-bar")
    // and reads the BLOCK's fold level off the first hit. An inner dashboard
    // section carrying that class is a descendant, so the enclosing dashboard
    // would take its level and fold wrong.
    const frame = readSrc("section-frame");
    const at = frame.indexOf("const marker =");
    expect(at).toBeGreaterThan(0);
    const block = frame.slice(at, at + 220);
    expect(block).toContain('owns === "blocks"');
    expect(block).toContain("journal-header-bar");
    // Both variants share the look.
    expect(frame).toContain("journal-sec journal-sec-l");
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
    expect(css).toContain(".journal-sec.is-foldable");
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
      ".journal-header-glyph",
      ".journal-header-count",
      "--am-sec-gap",
      "--am-sec-indent",
    ]) {
      expect(css, cls).toContain(cls);
    }
  });

  it("stopped drawing a two-pixel rule under every title", () => {
    // The density claim, asserted rather than eyeballed: five sections on one
    // note each spent ~52px of vertical block, and the rule was the part that
    // separated nothing in particular.
    // `.journal-sec`, not `.journal-header-bar` — the look and the fold-walk
    // marker were separated in 2.56.2 so that a section owning its own
    // children can be styled identically without joining the sibling walk.
    const css = readCss();
    const at = css.indexOf(".journal-sec {");
    const block = css.slice(at, css.indexOf("}", at));
    expect(block).not.toContain("border-bottom: 2px");
    expect(block).toContain("var(--am-sec-pad)");
    // AND THE ONE IT DOES DRAW IS THE HAIRLINE TOKEN (4.11), not a raw `1px`. The
    // bar now has two divisions in it — its own bottom rule and the strip its
    // controls sit on — and two ways of naming one number is one retune away from
    // drawing two different lines. `--am-rule` is what a CARD divides itself with,
    // which is the weight 2.56 deleted from here.
    expect(block).toContain("border-bottom: var(--am-rule-hair)");
    expect(block).not.toContain("border-bottom: 1px");
  });
});

// ── the section's actions sit on a strip of their own (4.11) ──────────────
//
// WHAT A VAULT RENDER SHOWED. On one homepage, five widget blocks each wearing
// `.journal-block-head` — a slim band, a micro-label, a hairline — and directly
// under them *📊 Trends and Statistics [0] [+ Add chart]*, a bar of a visibly
// different kind with its button crowded onto the title's line. Two idioms for one
// job on one screen.
//
// So a level-1 title line carries what NAMES and NUMBERS the section, and
// everything that ACTS goes below it on `.journal-group-foot`'s idiom. What makes
// that four declarations rather than a refactor is that the slot already exists and
// `.journal-sec` already wraps: `flex: 1 0 100%` on the actions bar IS a second row.

describe("the section's actions sit on a strip of their own", () => {
  const css = () => readCss();
  const STRIP =
    ".journal-sec-l1:not(.journal-header-bar-untitled)\n  > .journal-header-widgets.journal-widget-bar {";

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
    // `.journal-group-foot` is the same object one scale out — a hairline, air,
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
    expect(rule).toContain("border-top: var(--am-rule-hair)");
    expect(rule).toContain("padding-top: 8px");
    const foot = t.slice(
      t.indexOf(".journal-group-foot {"),
      t.indexOf("}", t.indexOf(".journal-group-foot {"))
    );
    expect(foot).toContain("border-top: var(--am-rule-hair)");
    expect(foot).toContain("padding-top: 8px");
  });

  it("is not drawn at all when the section has no actions", () => {
    // `:empty` RATHER THAN A RENDER-TIME TEST, and this is the load-bearing half:
    // `buildAddCategoryButton`, `buildScopeCycle` and every LiveWidget append into
    // this slot AFTER the frame is built, so a decision taken at draw time would be
    // wrong for exactly the sections with the most in them.
    expect(css()).toContain(
      ".journal-sec-l1 > .journal-header-widgets.journal-widget-bar:empty"
    );
    const at = css().indexOf(
      ".journal-sec-l1 > .journal-header-widgets.journal-widget-bar:empty"
    );
    expect(css().slice(at, css().indexOf("}", at))).toContain("display: none");
    // AFTER the strip rule, so the added pseudo-class is not fighting source order.
    expect(at).toBeGreaterThan(css().indexOf(STRIP));
  });

  it("leaves the untitled control strip alone", () => {
    // Study and the custom journals anchor their buttons under a real markdown
    // heading. There is no first row there, so a rule above the buttons would be a
    // rule above nothing.
    expect(STRIP).toContain(":not(.journal-header-bar-untitled)");
  });

  it("stays at level 1, and level 2 keeps its inline pills", () => {
    // A Study index draws one level-2 section per subject, each carrying a single
    // `+ Topic`. Twenty subjects would become twenty two-line rows, which is the
    // opposite of the density this buys.
    const t = css();
    expect(t).not.toContain(
      ".journal-sec-l2 > .journal-header-widgets.journal-widget-bar {"
    );
    // The pill scale is now ONE rule for both places rather than a rule and an
    // exception, because the argument was about a place and not about a level.
    const at = t.indexOf(".journal-sec-l1 > .journal-header-widgets .journal-btn,");
    expect(at, "no shared pill scale").toBeGreaterThan(0);
    const rule = t.slice(at, t.indexOf("}", at));
    expect(rule).toContain(".journal-sec-l2 .journal-header-widgets .journal-btn");
    expect(rule).toContain("font-size: var(--am-text-2xs)");
    // And it is not duplicated where it used to live. Counted on the RULE — the
    // selector followed by its brace — because a cross-reference to it in a comment
    // one file over is a third occurrence and is not a second rule.
    expect(
      t.split(".journal-sec-l2 .journal-header-widgets .journal-btn {")
    ).toHaveLength(2);
  });

  it("does not bleed to the card's edges", () => {
    // The bar's own `border-bottom` does bleed inside a section card
    // (70-section-surface.css), and `.journal-group-foot` does not. Two
    // edge-to-edge hairlines 22px apart read as a banded table; this one divides
    // the header, so it stops where the text does.
    const t = css();
    const rule = t.slice(t.indexOf(STRIP), t.indexOf("}", t.indexOf(STRIP)));
    expect(rule).not.toContain("margin: 0 calc(-1 * var(--am-sec-pad-x))");
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
    // with `owns: "children"` and therefore no `.journal-header-bar` marker); a
    // `header:` bar puts it on the BAR ITSELF (`headerbar.ts`). One selector
    // cannot reach both, and a rule written for the wrong one matches nothing —
    // which is 4.13 §3's `:has(>` fault, and looks exactly like a decision.
    const t = css();
    for (const sel of [
      ".journal-sec-fold.is-collapsed > .journal-sec > .journal-header-widgets",
      ".journal-sec-l1.journal-header-bar.is-collapsed > .journal-header-widgets",
    ]) {
      const at = t.indexOf(`${sel} {`);
      expect(at, `no rule for ${sel}`).toBeGreaterThan(0);
      expect(t.slice(at, t.indexOf("}", at)), sel).toContain("display: none");
    }
    // AND NOT AT LEVEL 2, where the buttons sit on the title LINE rather than on
    // a strip of their own. There is no second row to close there, and hiding
    // them would take a control off a bar that is still drawn.
    expect(t).not.toContain(".journal-sec-l2.journal-header-bar.is-collapsed");
    expect(t).not.toContain(
      ".journal-sec-fold.is-collapsed > .journal-sec-l2"
    );
  });

  it("closes on the Journals card's own fold too (4.13.2 §4)", () => {
    // THERE ARE THREE FOLDS, NOT TWO. `journals-section.ts::makeFoldable` marks
    // `.jjs-type` and builds its bar with `owns: "children"` — which withholds
    // `.journal-header-bar` deliberately, so an enclosing dashboard cannot read
    // its fold level off a descendant. The consequence is that it matches
    // neither rule above, and a collapsed journal went on showing `+ Subject`
    // and `+ Topic` while every other collapsed section had stopped.
    const t = css();
    const sel = ".jjs-type.is-collapsed > .journal-sec > .journal-header-widgets";
    const at = t.indexOf(`${sel} {`);
    expect(at, "no rule for the journals fold").toBeGreaterThan(0);
    expect(t.slice(at, t.indexOf("}", at))).toContain("display: none");
    // The marker really is withheld, which is why the rule cannot be shared.
    expect(readSrc("journals-section")).toContain('owns: "children"');
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
    expect(css()).not.toContain(".jjs-group.is-collapsed > .journal-sec");
    // ONE FOLD LEFT IN THAT MODULE, and it is the type's. Counted on the CALL,
    // because the function itself and the paragraphs about it still name it.
    const code = readSrc("journals-section").replace(/\/\/.*$/gm, "");
    // `makeFoldable(plugin` matches a CALL and never the definition, whose
    // parameter list starts on the next line — and it is not anchored on
    // indentation, which is what let a mutation past a sibling count in
    // `journal-cards.test.ts`.
    const calls = code.match(/makeFoldable\(plugin/g) ?? [];
    expect(calls.length, "makeFoldable is called for more than the type").toBe(1);
    expect(code).toContain("makeFoldable(plugin, section, head, foldKey(ctx.sourcePath, type.id));");
  });

  it("keeps the class the fold exclusions name, which is why no caller changed", () => {
    // `foldableSection` and `HeaderBar` both hard-code `.journal-header-widgets` so
    // a click on a control acts instead of folding the section. A wrapper element
    // would have had to be added to both, and a button that folded its own section
    // is the bug that would have shipped.
    expect(readSrc("section-frame")).toContain(
      '".journal-header-widgets, a, button, input, select"'
    );
    expect(readSrc("headerbar")).toContain(".journal-header-widgets");
    // The slot is still built by the frame, in place, with both its classes.
    expect(readSrc("section-frame")).toContain(
      'cls: "journal-widget-bar journal-header-widgets"'
    );
  });
});

// ── the glyph split ───────────────────────────────────────────────────────
//
// Every caller splits a title the same way because exactly one of them does.
// Asserted here rather than left to the DOM, for the reason applyTypeChange
// became a method in 2.55.5: a decision reachable only through a rendered
// element is a decision nobody can check.

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
    const at = t.indexOf(".journal-btn:not(.mod-cta):has(.journal-btn-icon)");
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
    expect(css()).toContain(".journal-btn:not(.mod-cta)");
  });

  it("only hides a label that has an icon to fall back on", () => {
    // A button spec may carry no icon — `BUTTON_LABELS[action] ?? { label:
    // action }` covers a hand-written directive naming an action this build
    // does not know. Hiding that label leaves an empty box that does something.
    const t = css();
    expect(t).toContain(".journal-btn:not(.mod-cta):has(.journal-btn-icon)");
    expect(t).toContain(".journal-btn:not(.mod-cta):has(.journal-btn-emoji)");
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
    // The old CSS said `.almanac-chart-error` shared the event editor's rule
    // "so it should not be a second style that drifts" — while being exactly
    // that: two selectors kept in step by hand rather than one element.
    const css = readCss();
    expect(css).not.toMatch(/^\.almanac-chart-error \{/m);
    expect(css).not.toContain(".almanac-chart-error,");
  });
});

// ── the windows that were copying the frame (2.56.11) ────────────────────
//
// §5.1's exhibit was not a count, it was a sentence already in styles.css: the
// tracker picker "borrows .almanac-editor-modal's frame (head / scrolling body
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
      expect(code, f).not.toContain('"almanac-editor-head"');
      expect(code, f).not.toContain('"almanac-editor-subtitle"');
      expect(code, f).not.toContain('"almanac-editor-footer"');
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
    expect(css).not.toContain("It borrows .almanac-editor-modal's frame");
    expect(css).toContain("It USES .almanac-editor-modal's frame");
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
    expect(css).not.toMatch(/^\.almanac-event-error/m);
    expect(css).not.toMatch(/^\.almanac-chart-error/m);
    expect(css).toContain(".almanac-editor-error");
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
    const at = css.indexOf(".journal-sec-block {");
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
  // They cannot be merged into one module — `NOT_A_CELL` evicts a `.journal-sec`
  // from a row cell, so a widget inside a group can only ever be titled by a
  // block head — so they are held together by tokens instead, and this is what
  // checks that they still are.
  const rules = (): string => readCss().replace(/\/\*[\s\S]*?\*\//g, "");
  // ANCHORED ON A NEWLINE, and this file has now been bitten by the alternative
  // twice: `indexOf(".journal-header-toggle {")` finds it inside
  // `.journal-sec-l2 > .journal-header-toggle {` first, and reads the override
  // while believing it read the base rule.
  const body = (selector: string): string => {
    const t = rules();
    const at = t.indexOf(`\n${selector}`);
    expect(at, `${selector} is gone`).toBeGreaterThan(-1);
    return t.slice(at, t.indexOf("}", at));
  };

  it("gives section and widget block titles their tokens with natural casing", () => {
    const secRule = body(".journal-header-title {");
    expect(secRule).toContain("font-size: var(--am-sec-title-size)");
    expect(secRule).toContain("color: var(--am-sec-title-ink)");
    expect(secRule).toContain("text-transform: none");

    const blockRule = body(".journal-block-head-title {");
    expect(blockRule).toContain("font-size: var(--am-bar-text)");
    expect(blockRule).toContain("color: var(--am-bar-ink)");
    expect(blockRule).toContain("text-transform: none");
  });

  it("reveals widget block heads on hover while keeping them discrete at rest", () => {
    const cardHead = body(".journal-widget-card > .journal-block-head {");
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
          / > \.journal-block-head\s*$/.test(sel) &&
          decls.includes("opacity: 0")
      );
    expect(rests.length, "the head's rest rules").toBeGreaterThanOrEqual(2);
    for (const [sel, decls] of rests) {
      expect(decls, sel.trim()).toContain("pointer-events: none");
      expect(decls, sel.trim()).toContain("position: absolute");
    }
    const raw = rules();
    // NOT FROM ANYWHERE IN THE CARD, which is the reveal this replaced.
    expect(raw).not.toContain(".journal-widget-card:hover > .journal-block-head");
    expect(raw).toContain(
      ".journal-widget-card:has(> .jbd-handle:hover) > .journal-block-head"
    );
    // AND THE BAND KEEPS ITSELF OPEN once it is, which is what lets the pointer
    // walk off the dots and into it — the one thing its own `:hover` is for, and
    // it only works because the open state takes `pointer-events` back.
    expect(raw).toContain(".journal-widget-card > .journal-block-head:hover");
  });

  it("divides both of them with the same rule weight", () => {
    // The block head drew `--am-rule` (2px) under an 11.2px label while the
    // section bar drew `--am-rule-hair` (1px) under a 15.2px one. One object
    // cannot divide itself two ways.
    expect(body(".journal-block-head {")).toContain(
      "border-bottom: var(--am-rule-hair)"
    );
    expect(body(".journal-sec {")).toContain(
      "border-bottom: var(--am-rule-hair)"
    );
  });

  it("keeps the glyph larger than the title, and says so", () => {
    // THE ONE PLACE "ONE SCALE" IS NOT LITERAL, and it is deliberate: an emoji at
    // 11.2px is a smudge, and a slot exists to align a column of titles, which it
    // can only do if what sits in it can be seen.
    for (const sel of [".journal-header-glyph {", ".journal-block-head-glyph {"]) {
      const rule = body(sel);
      expect(rule, sel).toContain("font-size: var(--am-bar-glyph)");
      expect(rule, sel).toContain("width: var(--am-sec-glyph)");
    }
  });

  it("lets no level-2 rule set a font-size", () => {
    // THE HIERARCHY INVERSION THIS RELEASE CLOSED, standing. Level 2 used to take
    // `--am-text-sm` to say "nested" — which was smaller than level 1 while level
    // 1 was 0.95em, and LARGER than it the moment level 1 became 0.7em. A subject
    // row bigger than the section containing it is the sort of thing a stylesheet
    // states rather than notices, so this is stated instead.
    // THE TITLE AND THE GLYPH, not everything nested under a level-2 bar: the
    // action pills legitimately set their own size, and they set it to the same
    // `--am-text-2xs` the title now reads — which is the point rather than an
    // exception, since the whole bar is one scale.
    const t = rules();
    for (const m of t.matchAll(/\.journal-sec-l2[^{]*\{([^}]*)\}/g)) {
      const selector = m[0].slice(0, m[0].indexOf("{"));
      if (!/header-title|header-glyph/.test(selector)) continue;
      expect(m[1], selector).not.toContain("font-size");
    }
  });

  it("puts the fold control at the right-hand end of both bars", () => {
    // 4.13 §1b. `margin-left: auto` is what moves it, and it has one owner per
    // flex line — at level 1 the actions strip is its own row and gives its auto
    // margin up, at level 2 the toggle gives its up and takes `order` instead.
    for (const sel of [".journal-header-toggle {", ".journal-sec-fold-toggle {"]) {
      const rule = body(sel);
      expect(rule, sel).toContain("margin-left: auto");
      // Sized against the bar rather than against the note: this one had no
      // width, height or icon size at all and fell back to ~18px beside an
      // 11.2px title.
      expect(rule, sel).toContain("font-size: var(--am-bar-glyph)");
      expect(rule, sel).toContain("width:");
    }
    expect(body(".journal-sec-l2 > .journal-header-toggle {")).toContain("order: 1");
  });

  it("points the chevron down when closed and up when open", () => {
    // RE-CHOSEN WITH THE MOVE. Rotating -90° pointed it right, which reads as
    // "opens rightward" beside a heading and reads as pointing off the card once
    // the control sits on the right edge. Down/up is the ordinary accordion, and
    // the base icon is now the CLOSED state — so the transform hangs off
    // `:not(.is-collapsed)`.
    const t = rules();
    expect(t).toContain(".journal-header-bar:not(.is-collapsed) .journal-header-toggle");
    expect(t).toContain(
      ".journal-sec-fold:not(.is-collapsed) > .journal-sec > .journal-sec-fold-toggle"
    );
    // SCOPED TO THESE TWO. Other chevrons in the sheet still rotate -90° and are
    // right to — `jjs-toggle` and the events list sit on the LEFT of what they
    // fold, where pointing right is what a folded heading does. The direction
    // follows the side, which is the whole reason it was re-chosen here.
    for (const sel of [
      ".journal-header-bar:not(.is-collapsed) .journal-header-toggle",
      ".journal-sec-fold:not(.is-collapsed) > .journal-sec > .journal-sec-fold-toggle",
    ]) {
      const at = t.indexOf(sel);
      expect(t.slice(at, t.indexOf("}", at))).toContain("rotate(180deg)");
    }
    expect(t).not.toContain(".journal-header-bar.is-collapsed .journal-header-toggle");
  });

  it("stands the surface down for a block that is already a card (4.59.0)", () => {
    // ONE CARD, NOT TWO. `claimOwnBlock` marks any block holding a level-1 bar
    // as a section surface, and a surface is a card — so a fence whose widget
    // block ALREADY draws one ends up inside another. It showed up the day the
    // period summary gained a bar: `.journal-overview-card` has been a card since
    // 3.2 and had never held a `header:` line, so the two had never met.
    const rule = body(".journal-sec-block:has(.journal-overview-card),");
    for (const off of ["background: none", "border: none", "padding: 0"]) {
      expect(rule).toContain(off);
    }
    // THE RUN'S EDGES CARRY THE SAME CLASSES AT THE SAME SPECIFICITY, so a single
    // selector would lose to `.is-first` and `.is-last` on exactly the blocks a
    // welded section is both of. Listing them is the assertion, not the tidiness.
    for (const at of [".is-first", ".is-last", ".is-first.is-last"]) {
      expect(rule).toContain(`.journal-sec-block${at}:has(.journal-overview-card)`);
    }
    // A DESCENDANT, NOT A CHILD, for the reason the collapsed rule below states:
    // the surface is claimed on `siblingAnchor()`, which is not always the
    // postprocessor's own element, so the card can sit a level further in.
    expect(rule).not.toContain(":has(> .journal-overview-card");
    // AND THE INNER CARD IS THE ONE THAT SURVIVES, which is the half a selector
    // cannot state. 4.1 §3.1 cancels the WIDGET's card inside a framed block;
    // here it is the outer that gives way, because the overview card's bands are
    // measured against its inset and the surface has nothing measured against
    // its own. A rule cancelling the inner one would strand all three.
    expect(rules()).not.toContain(
      ".journal-sec-block .journal-overview-card {\n  background: none"
    );
  });

  it("takes the bottom padding off a collapsed section (4.13 §4)", () => {
    // A closed section reserved 10px under a body it was not drawing — the
    // `.is-last` gap, standing under a bar whose rule had already been cancelled
    // two rules above it. The `frame: section` twin had fixed this at the foot of
    // the same file; the block variant had no rule at all, which is how a defect
    // survives in a stylesheet that argues with itself in comments.
    // ASKED FOR BY ITS WHOLE SELECTOR AS OF 4.59.0. `.journal-sec-block.is-last:has(`
    // stopped being unique that release: the surface also stands down for a block
    // that already draws its own card, which is a second `:has()` on the same two
    // classes. A prefix that matches two rules silently reads whichever comes
    // first in the file, which is a test that passes for the wrong reason the
    // moment anything is inserted above it.
    const rule = body(
      ".journal-sec-block.is-last:has(.journal-sec-l1.journal-header-bar.is-collapsed)"
    );
    expect(rule).toContain("padding-bottom: 0");
    // A DESCENDANT, NOT A CHILD, and this is the assertion rather than a comment
    // because the first cut of the rule used `:has(> …)` — which matches nothing,
    // since `claimOwnBlock` marks the note's block element and the bar is built
    // inside the widget block within it. A rule that cannot fire looks exactly
    // like a decision that was made.
    const head = "\n.journal-sec-block.is-last:has(.journal-sec-l1.journal-header-bar.is-collapsed)";
    const selector = rules().slice(
      rules().indexOf(head),
      rules().indexOf("{", rules().indexOf(head))
    );
    expect(selector).not.toContain(":has(>");
    expect(selector).toContain(".journal-sec-l1.journal-header-bar.is-collapsed");
  });

  it("does not stretch the short column's last widget (4.13.5 §2)", () => {
    // INVERTED FROM 4.13 §4, AND THE RENDER IS WHY. The rule read
    // `.journal-block-cell > :last-child { flex: 1 1 auto }`, to close the band
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
    expect(rules()).not.toContain(".journal-block-cell > :last-child");
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
