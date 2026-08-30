// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The token scales, and the rules that keep them scales.
//
// 3.9 §4 added three — spacing, control padding, elevation. Most of what
// follows is not about those three but about the property a token file has to
// have before adding to it is safe: a reference and a definition must not be
// able to drift apart quietly. They had, in 164 places, and nothing noticed
// because the drift was in dead code.

import { describe, expect, it } from "vitest";
import { allSrcNames, readCss, readSrc, repoFile } from "./sources";
import { OBSIDIAN_DOM } from "../src/core/constants";

// Every `--ca-…` the sheet defines ANYWHERE, including the single-line rules
// that set a tint or a span. Deliberately not anchored to the line start: a
// definition may share its line with a selector, and anchoring is what made an
// earlier cut of this file report `--ca-ev-tint` as undefined when it is
// defined eight times in 93-calendars.css.
function definedAnywhere(css: string): Set<string> {
  return new Set(
    [...css.matchAll(/(?<!var\(\s*)(--ca-[a-z0-9-]+)\s*:/g)].map((m) => m[1])
  );
}

// Tokens 00-tokens.css defines are UNCONDITIONAL: it is the first file the
// bundle concatenates and it ships with the plugin, so those properties always
// have a value. Anything defined only by a scoped rule, or set on an element
// from TypeScript, is conditional and may genuinely be absent.
function unconditional(): Set<string> {
  return new Set(
    [
      // COMMENTS OUT FIRST, for the reason the guard below records: prose in this
      // file names tokens, and a sentence beginning `--ca-border-inner: …` at the
      // start of a comment line is not a definition.
      ...repoFile("styles/00-tokens.css")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .matchAll(/^\s*(--ca-[a-z0-9-]+)\s*:/gm),
    ].map((m) => m[1])
  );
}

// Properties no stylesheet defines, because an element carries them inline.
//
// EVERY ENTRY HERE IS AN EXEMPTION FROM THE GUARD BELOW, so the list is the
// guard's weak point rather than a footnote to it. 3.12 removed
// `--ca-heat-max-w`, which was on it because 3.10 assumed anything referenced
// and undefined must be set from TypeScript. Nothing set it: it was a dangling
// reference living off its own fallback, and the whitelist is what let it.
//
// The rule for adding to this list: find the `setProperty` call. If there
// isn't one, the token is missing, not optional.
const SET_FROM_TS = new Set([
  // 4.4 §2: a cell of a row may ask for a number of shares, set on the element
  // by row.ts. Absent on an ordinary cell, which is why the stylesheet reads it
  // with a fallback.
  "--ca-cell-weight",
  // 4.22 §3.1: how tall the note says one widget's card is, set on the card by
  // block-drag.ts. Absent on a card with no stated height, which is every card
  // until somebody drags one — so `is-sized` is what guards the declaration
  // rather than a fallback on the read.
  "--ca-card-h",
  "--ca-row-cols",
  "--ca-tracker-cell-h",
  "--ca-chart-row-track",
  // 4.55: how many hours the time grid's window spans, set on each day column
  // by time-grid-view.ts so the hour lines can be `calc(100% / n)` rather than
  // a pixel step. The number is the week's content, not a design decision, so
  // it has no sensible value in the token file.
  "--ca-tg-hours",
  // 4.62: where the current minute falls in that window, as a fraction, set on
  // the grid body by time-grid-view.ts and moved by a minute ticker. Absent
  // whenever now is outside the window — which is what `.ca-tg-now` being
  // removed from the DOM says, so there is no reading of it to guard.
  "--ca-tg-at",
  // 4.62: how many day columns the grid is drawing — seven, or three, or one,
  // decided by the directive and narrowed by the pane. Set on the grid by
  // time-grid-view.ts and read by the three rows' templates, so a number that
  // belongs to one week's rendering is not a design constant in the token file.
  "--ca-tg-cols",
]);

describe("a token reference resolves to a token", () => {
  it("defines every --ca- custom property it reads", () => {
    // THE ONE THAT EARNS ITS KEEP. A misspelled var() is not an error in CSS,
    // it is an empty string: the declaration is dropped and the element renders
    // with no padding, no radius or no colour at all. Nothing in the build
    // catches it, and the symptom shows up wherever the rule happened to apply
    // rather than near the typo.
    const css = readCss();
    const have = definedAnywhere(css);
    const missing = [
      ...new Set(
        [...css.matchAll(/var\(\s*(--ca-[a-z0-9-]+)/g)].map((m) => m[1])
      ),
    ].filter((t) => !have.has(t) && !SET_FROM_TS.has(t));
    expect(missing).toEqual([]);
  });
});

describe("a token that names a theme colour is declared on `body` (4.42)", () => {
  it("reads nothing on :root that :root does not itself define", () => {
    // ── THREE RELEASES OF WHITE CARD BORDERS, AND THIS IS THE RULE ───────
    //
    // `--ca-border-inner` was a `color-mix` over two theme variables on `:root`,
    // and every card that read it drew a **`#dadada`** edge — `currentColor`,
    // the initial `border-color`, which is what an element gets when the colour
    // it asked for is invalid.
    //
    // **OBSIDIAN DECLARES ITS COLOURS ON `body`.** `.theme-dark` and
    // `.theme-light` are classes on `body`; `:root` is the `html` element and has
    // none of them.
    //
    // **AND A CUSTOM PROPERTY'S `var()` REFERENCES ARE SUBSTITUTED ON THE ELEMENT
    // THAT DECLARES IT**, not on the element that uses it. So a theme colour
    // aliased on `:root` resolves against an element that has never had one, and
    // the token is invalid for everything that inherits it.
    //
    // 4.40.1 WROTE THIS GUARD FOR `color-mix` ONLY, on the theory that a lone
    // `var()` was somehow lazier. It is not — `--ca-surface-inset:
    // var(--background-primary-alt)` on `:root` was broken by exactly the same
    // mechanism, and it was still broken after the mix moved to `body`, because
    // the mix was reading IT. Nine tokens were affected; the guard that would
    // have caught all nine is this one, and it is barely longer.
    const css = repoFile("styles/00-tokens.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const at = css.indexOf(":root {");
    expect(at).toBeGreaterThan(-1);
    const root = css.slice(at, css.indexOf("\n}", at));
    // What :root defines for itself is fair game: the spacing scale is seven
    // `calc()`s over a unit declared four lines above them, and the type scale
    // reads its own steps. That is the case this must not forbid.
    const own = new Set(
      [...root.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1])
    );
    const offenders: string[] = [];
    for (const d of root.matchAll(/(--[a-z0-9-]+):\s*([^;]*)/g)) {
      for (const r of d[2].matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
        if (!own.has(r[1])) offenders.push(`${d[1]} reads ${r[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("declares each of the nine on `body` instead", () => {
    // Named individually rather than counted, so deleting one to make the guard
    // above pass is not a way through.
    const css = repoFile("styles/00-tokens.css");
    const body = css.slice(css.indexOf("\nbody {"), css.indexOf("body.theme-light"));
    for (const t of [
      "--ca-surface-card",
      "--ca-surface-raised",
      "--ca-surface-inset",
      "--ca-border-subtle",
      "--ca-border-hover",
      "--ca-border-focus",
      "--ca-bar-ink",
      "--ca-sec-title-ink",
    ]) {
      expect(body, t).toContain(`${t}: var(--`);
    }
  });

  it("gives the seam a value that cannot fail, and a twin for light", () => {
    // WHAT IS GIVEN UP: the mix adapted to whatever border colour a theme
    // declared. It also never once drew. An adaptive value that renders as
    // `currentColor` is not adaptive, and `--ca-slot-edge` is the proof a plain
    // one works — measured at #333333 over #232323 on the same screenshot that
    // showed this token still white.
    const css = repoFile("styles/00-tokens.css").replace(/\/\*[\s\S]*?\*\//g, "");
    const root = css.slice(css.indexOf(":root {"), css.indexOf("\n}"));
    expect(root).toMatch(/--ca-border-inner: rgba\(255, 255, 255, [\d.]+\);/);
    expect(css).toMatch(
      /body\.theme-light \{[\s\S]*?--ca-border-inner: rgba\(0, 0, 0, [\d.]+\);/
    );
    // AND NOWHERE IS IT A MIX AGAIN.
    expect(css).not.toMatch(/--ca-border-inner:\s*color-mix/);
  });
});

describe("a fallback means the token can be missing", () => {
  it("carries no fallback on a token 00-tokens.css defines", () => {
    // §4.2 recorded this as two harmless spellings of one thing:
    // `var(--ca-radius-pill, 999px)` beside the bare form. It was neither
    // confined to the pill radius nor harmless.
    //
    // SIX tokens carried fallbacks across 164 call sites, and 48 of those named
    // a value that DISAGREED with the token they shadowed — `--ca-radius-md`
    // fell back to 8px where the token is 10px, `--ca-text-sm` to 0.9em where
    // it is 0.85em, `--ca-radius-sm` to 5px, 6px and 7px in different files.
    // They are the pre-token literals, left behind when the tokens were
    // introduced and never revisited when the tokens were later retuned.
    //
    // None could ever fire, which is exactly why they rotted: dead code that
    // looks like a considered default. The rule that replaces them — a fallback
    // is a claim that this property may be absent, and for anything in
    // 00-tokens.css that claim is false.
    //
    // ── COMMENTS STRIPPED FIRST, AND 4.40 IS WHY ─────────────────────────
    //
    // This scraped the raw bundle, so a COMMENT explaining why a fallback would
    // not have helped — *"`var(--ca-border-inner, fallback)` does not help
    // either; the fallback is for a property that is NOT SET"* — reported itself
    // as the offence it was warning about. A file documenting a rule quotes the
    // thing the rule forbids; that is what documenting it means. The house rule
    // is on record for TypeScript (`home-sections.ts` tripped it the same way in
    // 4.38.3) and it is the same rule here: **an absence assertion must be told
    // what it is allowed to read.**
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    const always = unconditional();
    const offenders = [
      ...new Set(
        [...css.matchAll(/var\(\s*(--ca-[a-z0-9-]+)\s*,/g)].map((m) => m[1])
      ),
    ].filter((t) => always.has(t));
    expect(offenders).toEqual([]);
  });

  it("carries one on a property that really is optional", () => {
    // The other half, and the reason the rule above is scoped rather than
    // absolute. A chart row's height, an event's tint, a table's column count
    // — these are set by a scoped rule or an inline style, so they are absent
    // most of the time and a bare var() would render the declaration away.
    const css = readCss();
    const always = unconditional();
    for (const t of ["--ca-ev-tint", "--ca-row-cols"]) {
      expect(always.has(t), `${t} must not be in 00-tokens.css`).toBe(false);
      expect(css.includes(`var(${t},`), t).toBe(true);
    }
  });
});

describe("the spacing scale (3.9 §4)", () => {
  it("is seven steps of exactly N units, and the unit is 2px", () => {
    // The property that makes it a scale rather than seven numbers someone
    // liked, and the whole argument for spelling it numerically where every
    // other scale in this file is named. If a step stops being N units the
    // name starts lying and the reason for the naming decision is gone.
    //
    // EXPRESSED AS A MULTIPLE SINCE PATCH 7, which is what makes the mobile
    // override one line instead of seven — and what keeps 2N true on both
    // platforms rather than only on the one the literals were typed for.
    const tokens = repoFile("styles/00-tokens.css");
    expect(tokens).toMatch(/--ca-space-unit:\s*2px;/);
    for (let n = 1; n <= 7; n++) {
      expect(tokens, `--ca-space-${n}`).toMatch(
        new RegExp(`--ca-space-${n}:\\s*calc\\(var\\(--ca-space-unit\\) \\* ${n}\\);`)
      );
    }
    expect(tokens).not.toMatch(/--ca-space-8:/);
  });

  it("has the controls patch 6 named reading it", () => {
    // Patch 6's boundary, spot-checked against the class list
    // tools/space-pass.mjs owns. Layout paddings deliberately still hold
    // literals — §4.3 leaves those alone until there is a reason beyond
    // tidiness — so this asserts the controls moved, not that the sheet did.
    const css = readCss();
    for (const decl of [
      ".ca-list-pill {",
      ".ca-journal-btn-ghost {",
      // `.jt-tag-pill` until 3.14 §4.3, which retired the cloud and its three
      // size tiers with it. The row that replaced it reads the same scale.
      ".ca-jt-tag-row {",
    ]) {
      const at = css.indexOf(decl);
      expect(at, decl).toBeGreaterThan(-1);
      const body = css.slice(at, css.indexOf("}", at));
      expect(body, decl).toMatch(/padding:[^;]*var\(--ca-space-/);
    }
  });

  it("rounds an odd control padding up, never down", () => {
    // The snapping rule, and the reason it has one. §3's complaint is that
    // nothing in this sheet asserts a touch target; rounding a control's
    // padding DOWN would make the smallest targets smaller, which is the one
    // direction this release must not move them. Costs at most 1px a side.
    expect(repoFile("tools/space-pass.mjs")).toContain(
      "px % 2 === 1 ? px + 1 : px"
    );
  });
});

describe("the elevation scale (3.9 §4)", () => {
  it("has no inline drop shadow left", () => {
    // The shape of the problem §4.1 names: 3.8 patch 11 wrote
    // `0 -8px 24px rgba(0,0,0,0.4)` at a call site because there was nothing to
    // reach for. There is now, so a fifth has somewhere to go — and this fails
    // if it does not go there.
    //
    // DROP shadows only. A ring or an inset spine is not elevation: it is a
    // border drawn with a shadow because a border would change the box, and it
    // reads a theme colour rather than a black alpha.
    const drops = (
      readCss().match(/box-shadow:[^;]*rgba\(0,\s*0,\s*0[^;]*;/g) ?? []
    ).filter((s) => !s.includes("inset"));
    expect(drops).toEqual([]);
  });
});

describe("the mobile control shape (3.12 §14.1, §14.2)", () => {
  it("derives the corner from the same token as the height", () => {
    // A capsule reads as a pill while a control is short — at a desktop
    // control's ~26px, 999px resolves to a 13px corner. It reads as a lozenge
    // once the box is tall, which is what 3.10's 40px floor made several
    // controls, and what turned the recap notice's two-word "Add it" into a
    // blob.
    //
    // Both properties read `--ca-control-min`, so the floor and the corner
    // cannot drift into disagreeing about what shape a control is.
    const css = readCss();
    expect(css).toMatch(
      /--ca-control-round:\s*calc\(var\(--ca-control-min\) \* 0\.35\)/
    );
    // 0.35 and not 0.5: half the height IS a capsule, so deriving it that way
    // would reproduce the bug from the token instead of from a literal.
    expect(css).not.toMatch(/--ca-control-round:\s*calc\(var\(--ca-control-min\) \* 0\.5\)/);
  });

  it("applies the floor and the corner to one selector list", () => {
    // Two lists is how one gains a member and the other does not.
    const css = readCss();
    const at = css.indexOf("min-height: var(--ca-control-min)");
    expect(at).toBeGreaterThan(-1);
    const body = css.slice(at, css.indexOf("}", at));
    expect(body).toContain("border-radius: var(--ca-control-round)");
  });

  it("hides only the label, never the button's accessible name", () => {
    // The compaction is safe because buildButton already sets `aria-label` and
    // `title` from the same string it renders into `.ca-journal-btn-label`. If
    // that ever stops being true, hiding the span starts hiding the name.
    expect(readSrc("button-widgets")).toContain('btn.setAttr("aria-label", hover)');
    expect(readSrc("button-widgets")).toContain('cls: "ca-journal-btn-label", text: spec.label');
    const css = readCss();
    expect(css).toMatch(
      /body\.is-mobile \.ca-journal-header-widgets \.ca-journal-btn \.ca-journal-btn-label \{\s*display: none;/
    );
  });
});

// ── Obsidian's DOM, named once (3.13 §5) ─────────────────────────────────

describe("the class names Obsidian owns live in one table", () => {
  it("has no second copy of any of them in src/", () => {
    // THE WHOLE POINT OF THE TABLE, and the only thing it buys. Every entry is
    // load-bearing and one of them being wrong has already cost a release:
    // `markdown-rendered` is the note's container in reading view AND the
    // container of a single code-block widget inside `.cm-embed-block`, so
    // treating it as "the note" made every fence in Live Preview see only
    // itself.
    //
    // The plugin's entire section system is derived from block-level sibling
    // walks over these containers, so "what breaks if Obsidian renames one"
    // should be answerable by reading one table rather than by grepping a
    // 1,300-line file.
    const offenders: string[] = [];
    for (const name of allSrcNames()) {
      if (name === "constants") continue;
      const src = readSrc(name);
      for (const value of Object.values(OBSIDIAN_DOM)) {
        // Quoted, so a mention inside a `//` comment or a CSS-ish selector
        // string is not mistaken for a use. A real second copy is a literal.
        if (src.includes(`"${value}"`) || src.includes(`'${value}'`)) {
          offenders.push(`${name}: ${value}`);
        }
      }
    }
    // If this fails, the fix is to import OBSIDIAN_DOM — not to add an
    // exemption here.
    expect(offenders).toEqual([]);
  });

  it("still spells each of them the way Obsidian does", () => {
    // The table is only useful while it is right, and nothing else in the
    // codebase now carries these strings to disagree with it.
    expect(OBSIDIAN_DOM).toMatchObject({
      previewSection: "markdown-preview-section",
      cmSizer: "cm-sizer",
      cmContent: "cm-content",
      markdownRendered: "markdown-rendered",
      widgetWrapper: "cm-embed-block",
      editorLine: "cm-line",
      viewFooter: "mod-footer",
      viewUi: "mod-ui",
      readingHeadingWrapper: "el-h",
      editorHeading: "HyperMD-header",
      editorHeadingLevel: "cm-header",
    });
  });

  it("covers the three the survey missed", () => {
    // §5 named eight, found by grepping string literals. `el-h[1-6]`,
    // `HyperMD-header` and `cm-header` are written inside REGEXES, so they did
    // not turn up — and they are exactly as load-bearing: without them a
    // section in Live Preview ran straight through the note's own headings,
    // the one boundary the fold rule says it must respect.
    const src = readSrc("headerbar");
    expect(src).toContain("OBSIDIAN_DOM.readingHeadingWrapper");
    expect(src).toContain("OBSIDIAN_DOM.editorHeading");
    expect(src).toContain("OBSIDIAN_DOM.editorHeadingLevel");
    // Built once at module scope, so the regex here is the matching rule and
    // the names stay in the table.
    expect(src).toMatch(/const READING_HEADING = new RegExp\(/);
    expect(src).toMatch(/const EDITOR_HEADING = new RegExp\(/);
  });
});

describe("the bar scale (4.13 §1)", () => {
  const css = readCss();

  it("declares the four tokens one header bar is made of", () => {
    // WHY THEY ARE TOKENS AND NOT FOUR PAIRS OF DECLARATIONS. Two modules title a
    // block and neither may own the other's classes, so the only thing that can
    // hold them together is a shared name. Before 4.13 they agreed about nothing
    // and nothing noticed for four releases.
    const root = unconditional();
    for (const token of [
      "--ca-bar-text",
      "--ca-bar-track",
      "--ca-bar-ink",
      "--ca-bar-glyph",
    ]) {
      expect([...root], token).toContain(token);
    }
  });

  it("puts the three that read our own tokens in :root, and the ink on body", () => {
    // ── THIS TEST ALREADY KNEW THE RULE, AND THEN EXEMPTED THE ONE TOKEN IT
    //    APPLIED TO (4.42) ────────────────────────────────────────────────
    //
    // It read: *"a token whose value reads `--interactive-accent` or its
    // siblings MUST be declared on `body`, because a custom property is
    // substituted where it is DECLARED and `:root` is one level above where
    // Obsidian puts those"* — which is exactly right, and is the fault behind
    // three releases of white card borders.
    //
    // It then said these four *"read `--ca-text-*` and `--text-muted`, which are
    // ours and the theme's ordinary inherited ink — so `:root` is right"*.
    // **`--text-muted` is not ordinary inherited ink; it is a theme variable
    // declared on `body`, the same as `--interactive-accent`.** The rule was
    // written down, and then an exemption was invented for the single token it
    // caught. `--ca-bar-ink` has been invalid since it was written.
    //
    // WHAT THE FAILURE OF THIS ONE TEST IS WORTH RECORDING FOR: a guard that
    // names the offenders it knows about will be talked out of the ones it does
    // not. The replacement in `a token that names a theme colour…` asks the
    // structural question instead — does `:root` define what this token reads —
    // and has no room for a judgement call about which theme variables are
    // really theme variables.
    const file = repoFile("styles/00-tokens.css");
    const bodyAt = file.indexOf("\nbody {");
    expect(bodyAt, "the body block moved").toBeGreaterThan(0);
    const line = (t: string): string =>
      file.split("\n").find((l) => l.trim().startsWith(`${t}:`)) ?? "";
    // Three read `--ca-*`, which `:root` defines for itself.
    for (const t of ["--ca-bar-text", "--ca-bar-track", "--ca-bar-glyph"]) {
      expect(line(t), t).toBeTruthy();
      expect(file.indexOf(line(t)), t).toBeLessThan(bodyAt);
    }
    // The fourth reads the theme's, so it lives where the theme's are.
    expect(line("--ca-bar-ink")).toContain("var(--text-muted)");
    expect(file.indexOf(line("--ca-bar-ink"))).toBeGreaterThan(bodyAt);
  });

  it("gives none of them a fallback", () => {
    // The rule this file already enforces for every token it defines: a fallback
    // on a token that IS defined here is a second value that silently wins
    // whenever the first lookup breaks, which is the same failure with the
    // evidence removed.
    for (const line of repoFile("styles/00-tokens.css").split("\n")) {
      if (!/^\s*--ca-bar-/.test(line)) continue;
      expect(line, line).not.toMatch(/var\([^)]+,/);
    }
  });

  it("is what both title rules read", () => {
    // The tokens existing is worth nothing on its own; this is the half that
    // makes them load-bearing. Asserted here as well as in section-frame.test.ts
    // because this file is where somebody comes to delete an unused token.
    for (const token of ["--ca-bar-text", "--ca-bar-ink"]) {
      const uses = [...css.matchAll(new RegExp(`var\\(${token}\\)`, "g"))];
      expect(uses.length, token).toBeGreaterThanOrEqual(2);
    }
  });
});
