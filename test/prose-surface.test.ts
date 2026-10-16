// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import {
  cssRule,
  cssRules,
  fnBody,
  readCode,
  readSrc,
  styleSheets,
} from "./sources";
import { proseSpansIn, proseSurfaceSpans } from "../src/journals/journal-sections";
import { livePreviewSpans, proseMarkFor } from "../src/ui/prose-surface";

const OPEN = "<!--chronoanvil-prose-->";
const SHUT = "<!--/chronoanvil-prose-->";

const note = (...lines: string[]): string => lines.join("\n");

describe("what a prose surface covers", () => {
  it("covers the writing and neither marker", () => {
    // An opener renders as nothing in reading mode and is hidden in Live
    // Preview, so a surface that included its row would open with a blank band.
    const lines = [OPEN, "## Overview", "", "Some words.", SHUT];
    expect(proseSurfaceSpans(lines)).toEqual([{ from: 1, to: 3, head: "Prose", nth: 1 }]);
  });

  it("trims the blank lines the composer leaves at each end", () => {
    // The template writes a blank after the opener and before the closer, and a
    // reader who presses Enter twice under their last paragraph leaves more.
    // Blank rows are not rows of prose.
    const lines = [OPEN, "", "", "Words.", "", "", SHUT];
    expect(proseSurfaceSpans(lines)).toEqual([{ from: 3, to: 3, head: "Prose", nth: 1 }]);
  });

  it("gives an empty block no surface at all", () => {
    // A prose block a reader has emptied is a legitimate state — see
    // `proseTitlesIn` on why an empty array is not null — and a band of colour
    // with nothing in it is chrome saying "something could go here".
    expect(proseSurfaceSpans([OPEN, "", SHUT])).toEqual([]);
    expect(proseSurfaceSpans([OPEN, SHUT])).toEqual([]);
  });

  it("finds each block of a note that has several", () => {
    // Prose is repeatable as of 1.0.36; each block is its own surface rather
    // than one surface running from the first opener to the last closer.
    const lines = [
      OPEN, "First.", SHUT,
      "```chronoanvil",
      "tasks:todo",
      "```",
      OPEN, "Second.", SHUT,
    ];
    expect(proseSurfaceSpans(lines)).toEqual([
      { from: 1, to: 1, head: "Prose", nth: 1 },
      { from: 7, to: 7, head: "Prose 2", nth: 2 },
    ]);
  });

  it("paints a note written before the rename", () => {
    // `<!--chronoanvil-skeleton-->` is what every note composed between 5.6 and
    // 1.0.36 carries, and `proseSpansIn` reads both spellings — so this inherits
    // that contract rather than restating it.
    const lines = ["<!--chronoanvil-skeleton-->", "Words.", "<!--/chronoanvil-skeleton-->"];
    expect(proseSurfaceSpans(lines)).toEqual([{ from: 1, to: 1, head: "Prose", nth: 1 }]);
  });

  it("paints nothing on a note with no markers", () => {
    // Every note written before 5.6, and every note a reader made by hand. The
    // pre-5.6 answer to everything about prose is "there is no marked block
    // here", and an unpainted note is that answer showing.
    expect(proseSurfaceSpans(["# Title", "", "Words."])).toEqual([]);
  });
});

describe("where a rendered block stands in the prose", () => {
  const TEXT = note(
    "---",
    "type: lesson",
    "---",
    "",
    OPEN,
    "",
    "## Overview",
    "",
    "A paragraph.",
    "",
    "## Notes",
    "",
    "Another.",
    "",
    SHUT,
    "",
    "%% chronoanvil-graph %%"
  );

  const mark = (from: number, to: number) => proseMarkFor(TEXT, from, to);

  it("carries the first end on the block the writing starts in", () => {
    expect(mark(6, 6)).toEqual({ member: true, first: true, last: false, head: "Prose", nth: 1 });
  });

  it("carries the last end on the block it ends in", () => {
    expect(mark(12, 12)).toEqual({ member: true, first: false, last: true, head: null, nth: 1 });
  });

  it("carries neither in the middle", () => {
    expect(mark(8, 8)).toEqual({ member: true, first: false, last: false, head: null, nth: 1 });
    expect(mark(10, 10)).toEqual({ member: true, first: false, last: false, head: null, nth: 1 });
  });

  it("carries both when one block is the whole of it", () => {
    // A paragraph spanning every line of the writing, which is what a reader
    // who has not used a heading has.
    expect(proseMarkFor(note(OPEN, "One line.", SHUT), 1, 1)).toEqual({
      member: true,
      first: true,
      last: true,
      head: "Prose",
      nth: 1,
    });
  });

  it("belongs to nothing outside the markers", () => {
    // The frontmatter, the marker rows themselves and the graph block below.
    expect(mark(1, 2).member).toBe(false);
    expect(mark(4, 4).member).toBe(false);
    expect(mark(14, 14).member).toBe(false);
    expect(mark(16, 16).member).toBe(false);
  });

  it("holds an end that reaches past it, rather than only one that equals it", () => {
    // A reader who deletes the blank the composer left makes the first block
    // start one line earlier than `span.from`. The rounding belongs to whatever
    // block reaches the end, not to the one whose number matches.
    expect(proseMarkFor(TEXT, 4, 6)).toEqual({
      member: true,
      first: true,
      last: false,
      head: "Prose",
      nth: 1,
    });
    expect(proseMarkFor(TEXT, 12, 15)).toEqual({
      member: true,
      first: false,
      last: true,
      head: null,
      nth: 1,
    });
  });
});

describe("the surface is paint and never a write", () => {
  const src = () => readCode("prose-surface");

  it("touches no note", () => {
    // *"It is important that prose is not put into a code block so that standard
    // markdown syntax still works."* The stronger form of that promise is that
    // this feature has no write path at all: it adds a class to rows that were
    // already being drawn. A reader who uninstalls the plugin is left with the
    // markdown they typed.
    for (const write of [
      "vault.modify",
      "vault.create",
      "processFrontMatter",
      "Decoration.replace",
      "```",
    ]) {
      expect(src()).not.toContain(write);
    }
    // `Decoration.widget` LEFT THIS LIST IN 1.0.78 and the promise did not
    // change with it. The bar is chrome drawn beside the writing, the same as
    // the background and the hairline; what the list is about is the file, and
    // the three vault calls above are still absent. The cog's window is the
    // only thing here that writes, it lives in another module, and it writes
    // on a reader's Save.
    expect(src()).toContain("Decoration.widget({");
  });

  it("paints the rows with a line decoration and nothing else", () => {
    // A mark decoration wraps the text and would paint the words. A line
    // decoration puts a class on the element CodeMirror already draws for that
    // row, which is why the reader's own markdown keeps rendering inside it.
    expect(src()).toContain("Decoration.line({");
    expect(src()).toContain('Decoration.line({ class: cls.join(" ") })');
    expect(src()).not.toContain("Decoration.mark");
  });

  it("stands down in source mode, the way the markers do", () => {
    // `marker-lines.ts`' gate and the same bargain: source mode is where a
    // reader goes to see the file as it is.
    expect(src()).toContain("state.field(editorLivePreviewField, false) === true");
  });

  it("refuses where Obsidian will not say which lines these are", () => {
    // An embed, an export, a dashboard plugin calling `MarkdownRenderer.render`.
    // `header-title.ts` states the rule: null is an answer, not a failure.
    expect(src()).toContain("const info = ctx.getSectionInfo(el);");
    expect(src()).toContain("if (!info) return;");
  });

  it("names its ends apart from the section pass's", () => {
    // `markSectionBodies` writes `is-first`/`is-last` on EVERY block of the note
    // as a toggle against its own answer, so sharing the spelling would let one
    // pass strip what the other had just written.
    expect(src()).toContain('"is-prose-first"');
    expect(src()).toContain('"is-prose-last"');
    expect(src()).not.toContain('toggleClass("is-first"');
  });
});

describe("the prose surface is the section surface, not a copy of it", () => {
  // ── IT SHIPPED MINIMAL AND THE READER REVERSED IT ──────────────────────
  //
  // The first cut was a tint and nothing else — `--ca-surface-inset`, no
  // borders — on the argument that a section's border says *this is a unit the
  // plugin drew and can fold* and prose is neither. *"make it match the surface
  // of sections/widgets (with rounded corners, exactly the same)"*: a reader
  // does not read a border as a claim about who authored a block, and prose is
  // not a different KIND of thing from the sections around it.
  //
  // THE TESTS ARE EQUALITY RATHER THAN A LIST OF DECLARATIONS, which is the
  // only form that can hold. Spelling out "background, border-left, radius" here
  // would let the two surfaces drift apart the first time one of them gained a
  // property nobody thought to add to this file. One rule, so one body.
  const paired: [string, string][] = [
    [".ca-journal-sec-block", ".ca-prose-block"],
    [".ca-journal-sec-block.is-first", ".ca-prose-block.is-prose-first"],
    [".ca-journal-sec-block.is-last", ".ca-prose-block.is-prose-last"],
    [
      ".ca-journal-sec-block.is-first.is-last",
      ".ca-prose-block.is-prose-first.is-prose-last",
    ],
  ];

  const sheet = (name: string): string => {
    const found = styleSheets().find((f) => f.name.endsWith(name));
    if (!found) throw new Error(`No stylesheet ${name}`);
    return found.css;
  };

  it("sits in the same selector list, which is what makes it the same rule", () => {
    // ONE RULE, SO ONE BODY. Two rules with matching declarations is exactly how
    // "exactly the same" stops being true — quietly, at the first change to a
    // radius or a border colour, in the half somebody remembered to edit.
    const css = sheet("70-section-surface.css");
    for (const [section, prose] of paired) {
      expect(css, prose).toContain(`${section},\n${prose} {`);
    }
  });

  it("carries no body a section does not, because it authors none", () => {
    // The other half of the same claim, read off the compiled sheet rather than
    // off its source: every rule that paints prose is a rule that paints a
    // section, so there is nothing for the two to disagree about.
    //
    // A SUBSET RATHER THAN AN EQUALITY, and the reason is the reader of this
    // file and not the stylesheet: `cssRules` splits a selector list on commas
    // without minding the ones inside a `:not(…)`, so the widget-card rule in
    // 05-inline-widgets — which EXCLUDES `.ca-journal-sec-block` — reads as a
    // rule that names it. Prose is not in that exclusion list and should not be.
    //
    // EXCEPT SPACING, AS OF 1.0.39. *"give the prose block surface increased
    // padding and margin so that the text is not right at the borders."* A
    // section's inset is sized for widgets, which pad themselves; prose is text
    // and needs more. So a rule of prose's own may exist — and may hold nothing
    // but padding, margin and the inset variable. A colour, a border or a
    // radius in one fails here, which is the half of "exactly the same" that
    // still stands.
    const spacing = /^(?:padding(?:-[a-z]+)?|margin(?:-[a-z]+)?|--ca-sec-pad-x)$/;
    for (const [section, prose] of paired) {
      const ours = cssRules(prose);
      expect(ours, `${prose} has no rule`).not.toHaveLength(0);
      const shared = cssRules(section);
      expect(ours.some((body) => shared.includes(body)), prose).toBe(true);
      for (const body of ours) {
        if (shared.includes(body)) continue;
        for (const decl of body.split(";").map((d) => d.trim()).filter(Boolean)) {
          expect(decl.split(":")[0].trim(), `${prose}: ${decl}`).toMatch(spacing);
        }
      }
    }
  });

  it("sits further in from its border than a section does (1.0.39)", () => {
    const css = sheet("70-section-surface.css");
    expect(css).toContain(".ca-prose-block {\n  --ca-sec-pad-x: 20px;\n}");
    expect(css).toContain("  .ca-prose-block {\n    --ca-sec-pad-x: 14px;\n  }");
    // And its own phone inset comes AFTER the shared one, or the shared 8px wins.
    expect(css.indexOf("--ca-sec-pad-x: 14px")).toBeGreaterThan(
      css.indexOf("--ca-sec-pad-x: 8px")
    );
    // Live Preview restates the inset, since a `.cm-line` carries CodeMirror's.
    const LP = ".markdown-source-view.mod-cm6 .cm-content > .cm-line.ca-prose-block";
    expect(cssRules(LP).join("\n")).toContain("padding-left: var(--ca-sec-pad-x)");
    expect(cssRule(`${LP}.is-prose-first`)).toContain("padding-top: 14px");
    expect(cssRule(`${LP}.is-prose-last`)).toContain("padding-bottom: 16px");
  });

  it("is a card, with the corners the reader asked for", () => {
    // The equality above is the real guard; this is the sentence it is standing
    // in for, so a failure reads as something rather than as two strings.
    const base = cssRule(".ca-prose-block");
    expect(base).toContain("border-left: 1px solid var(--ca-border-subtle)");
    expect(base).toContain("border-right: 1px solid var(--ca-border-subtle)");
    expect(cssRule(".ca-prose-block.is-prose-first")).toContain(
      "border-radius: var(--ca-radius-md) var(--ca-radius-md) 0 0"
    );
    expect(cssRule(".ca-prose-block.is-prose-last")).toContain(
      "border-radius: 0 0 var(--ca-radius-md) var(--ca-radius-md)"
    );
    expect(cssRule(".ca-prose-block.is-prose-first.is-prose-last")).toContain(
      "border-radius: var(--ca-radius-md)"
    );
  });

  it("gives up the same inset on a phone", () => {
    // A card costs its horizontal padding twice on a ~360px column, so prose
    // narrows at the same breakpoint — to its own value (14px, below) since
    // 1.0.39, rather than a section's 8px.
    expect(sheet("70-section-surface.css")).toContain(
      "  .ca-journal-sec-block,\n  .ca-prose-block {\n    --ca-sec-pad-x: 8px;"
    );
  });

  it("follows the aesthetic presets by the same means", () => {
    // A preset that repainted the sections and left the writing on the theme's
    // own grey would be the one place the two came apart.
    const css = sheet("99-aesthetic-presets.css");
    expect(css).toContain(".ca-journal-sec-block,\n.ca-prose-block {");
    expect(css).toContain(
      ".ca-journal-sec-block.is-first,\n.ca-prose-block.is-prose-first {"
    );
    expect(css).toContain(
      ".ca-journal-sec-block.is-last,\n.ca-prose-block.is-prose-last {"
    );
    // AND IT IS OFF THE ONE PRESET RULE IT COULD ONLY LOSE BY (1.0.38).
    // Technical sets `--ca-radius-md: 4px` on the body, so the end rules in
    // 70-section-surface.css already draw its angular corner. The blanket
    // `border-radius: 4px` it used to sit on drew that corner on every member
    // of a run instead — a notch at every seam.
    expect(css).not.toContain("body.ca-preset-technical .ca-prose-block");
    expect(css).not.toContain("body.ca-preset-technical .ca-journal-sec-block");
  });

  it("gives up its margins at the ends and nowhere else", () => {
    // The one rule prose has that a section does not, and the one selector it
    // cannot share: a section's blocks are widgets, where an interior margin is
    // chrome, and prose's are paragraphs and headings, where it is the reader's
    // own structure. Zeroing every one would close the air above `## Notes`.
    expect(cssRule(".ca-prose-block.is-prose-first > :first-child")).toContain(
      "margin-top: 0"
    );
    expect(cssRule(".ca-prose-block.is-prose-last > :last-child")).toContain(
      "margin-bottom: 0"
    );
    expect(cssRules(".ca-prose-block > :first-child")).toHaveLength(0);
  });

  it("is registered for both modes, from one rule", () => {
    const main = readCode("main.ts");
    expect(main).toContain("this.registerEditorExtension(proseSurface(this));");
    expect(main).toContain(
      "this.registerMarkdownPostProcessor((el, ctx) => paintProse(el, ctx, this));"
    );
    // And the one rule both painters read is the pure one, so the two cannot
    // disagree about where a block begins.
    expect(readCode("prose-surface")).toContain("proseSurfaceSpans(");
    expect(readSrc("journal-sections")).toContain(
      "export function proseSurfaceSpans("
    );
  });
});

describe("the surface survives Live Preview, where a block is a line", () => {
  const LP = ".markdown-source-view.mod-cm6 .cm-content > .cm-line.ca-prose-block";

  it("takes the host's line spacing away, because a margin is a hole", () => {
    // *"some lines do not have the surface, but most do."* They all are; the
    // gaps are Obsidian's own margins on `.HyperMD-header-N`, on a code fence's
    // two ends, on a rule and on a quote — page showing through a card.
    const rule = cssRule(LP);
    expect(rule).toContain("margin-top: 0");
    expect(rule).toContain("margin-bottom: 0");
    // AND A WIDGET'S MARGIN IS NOT THE LINE'S. The rows Obsidian fills with a
    // rendered element rather than with text — a `---`, a code fence's two
    // marker rows — kept their hole after the margins above were zeroed,
    // because the margin belongs to the child and collapses through a line
    // that has no vertical padding. The base rule says `flow-root` for exactly
    // this reason; it is restated here because `.cm-line` is Obsidian's
    // element first and arrives with a `display` of its own.
    expect(rule).toContain("display: flow-root");
    expect(cssRule(".ca-prose-block")).toContain("display: flow-root");
  });

  it("is written long enough to outrank the host rather than shouting", () => {
    // The spacing it is undoing is `.markdown-source-view.mod-cm6 .HyperMD-…`,
    // which no single class can beat. `!important` would win the same argument
    // and take the reader's snippets down with it.
    for (const selector of [LP, `${LP}.is-prose-last`, `${LP}:not(.is-prose-first)`, `${LP}:not(.is-prose-last)`]) {
      expect(cssRule(selector), selector).not.toContain("!important");
    }
    expect(LP.split(" ").filter((x) => x.startsWith("."))).toHaveLength(3);
  });

  it("gives the run's own bottom margin back to the last line", () => {
    // The gap under the writing is the surface's and not a hole in it.
    expect(cssRule(`${LP}.is-prose-last`)).toContain(
      "margin-bottom: var(--ca-widget-gap)"
    );
  });

  it("squares every line that is not an end of the run", () => {
    // *"maybe only apply to first and last line within the html fence of each
    // prose block?"* — which is what `is-prose-first`/`is-prose-last` already
    // do. Said again as `:not()` because a `.cm-line` is a shared surface: the
    // section pass writes `is-first` on the same element, and Obsidian rounds
    // a code fence's first and last line.
    const first = cssRule(`${LP}:not(.is-prose-first)`);
    expect(first).toContain("border-top-left-radius: 0");
    expect(first).toContain("border-top-right-radius: 0");
    expect(first).toContain("box-shadow: none");
    const last = cssRule(`${LP}:not(.is-prose-last)`);
    expect(last).toContain("border-bottom-left-radius: 0");
    expect(last).toContain("border-bottom-right-radius: 0");
  });

  it("reaches a horizontal rule, which is not a line to decorate", () => {
    // A `---` arrives as `<hr class="cm-line">` — Obsidian replaces the whole
    // line with a block, so a LINE decoration has nothing to attach to and the
    // row comes back unpainted however the lines around it are marked. The `~`
    // before and the `:has(~ …)` after say STRICTLY INSIDE A RUN, so a row
    // before the first line or after the last one matches neither half.
    //
    // `hr` IS NAMED rather than `.cm-line` excluded. "Anything unpainted
    // between two prose lines" would also name the ordinary source lines
    // between two prose BLOCKS — a whole section of the note, painted as
    // though it were writing.
    // AND IT IS THE CLASS, NOT THE ELEMENT. The dump reads `hr cm-line` in the
    // class column, so the row is something WEARING a class called `hr`; the
    // type selector this rule was first written with never touched it. Both
    // are asked for, the class because that is what the evidence says.
    const fill = cssRule(
      `${LP} ~ .hr:has(~ .cm-line.ca-prose-block)`
    );
    expect(cssRules(`${LP} ~ hr:has(~ .cm-line.ca-prose-block)`)).toEqual([fill]);
    // The other arm: whatever else Obsidian decides to mount into
    // `.cm-content` where a line would be, minus the rendered block below.
    expect(
      cssRules(
        `${LP} ~ :not(.cm-line):not(.cm-embed-block):has(~ .cm-line.ca-prose-block)`
      )
    ).toEqual([fill]);
    expect(fill).toContain("background: var(--background-secondary)");
    expect(fill).toContain("border-left: 1px solid var(--ca-border-subtle)");
    expect(fill).toContain("border-right: 1px solid var(--ca-border-subtle)");
    // AND IT LEAVES A RENDERED BLOCK ALONE. Two prose blocks with a section
    // between them is the ordinary shape of a journal note, and the element
    // between those two runs is a ```chronoanvil fence inside `.cm-embed-block`
    // — a card already. The exclusion is the whole safety of the rule.
    expect(readSrc("core/constants")).toContain('widgetWrapper: "cm-embed-block"');
  });

  it("says the fill again at the host's weight, for every line", () => {
    // The rows that kept coming back unpainted were not unmarked. Read off the
    // editor's own DOM with the computed colour beside each row, every one of
    // them carried `ca-prose-block` and computed `rgba(0, 0, 0, 0)`: a code
    // fence's two marker rows, and every row of a blockquote. Obsidian styles
    // those from `.markdown-source-view.mod-cm6 .HyperMD-…`, which is three
    // classes against one.
    //
    // GENERAL, NOT A THIRD SPECIAL CASE. Quotes and fences are what that note
    // happened to contain; a table, a list and a callout are the same rule
    // with a different class on it.
    const fill = cssRule(
      `${LP}:not(.HyperMD-codeblock-bg):not(.HyperMD-codeblock-begin):not(.HyperMD-codeblock-end)`
    );
    expect(fill).toContain("background: var(--background-secondary)");

    // AND THE EXCEPTION IS NAMED RATHER THAN THE CASES — the code, and as of
    // 1.0.40 the fence's two marker rows with it. They are the panel's now.
    for (const end of ["begin", "end"]) {
      expect(cssRules(`${LP}.HyperMD-codeblock-${end}`), end).not.toContainEqual(fill);
    }
  });

  it("draws a code block as a panel rather than a full-bleed stripe", () => {
    // Reading mode makes a code block a CHILD of the card, so the card's
    // padding holds it off both edges. Live Preview makes it the same rows as
    // the writing, and a background painted on a row reaches the row's edges.
    //
    // THE INSET IS DRAWN, NOT MEASURED: two card-coloured strips over the ends
    // of the row leave Obsidian's own code colour exactly as Obsidian computed
    // it. A margin would pull the CARD's side borders in with it and notch the
    // surface.
    const row = cssRule(`${LP}.HyperMD-codeblock-bg`);
    expect(row).toContain("inset 6px 0 0 0 var(--background-secondary)");
    expect(row).toContain("inset -6px 0 0 0 var(--background-secondary)");
    expect(row).not.toContain("--code-background");
    expect(row).not.toContain("margin-left");

    // THE FENCE ROWS ARE THE PANEL'S (1.0.40): *"dark shade the backtick lines
    // as well as the content."* Same rule as the code rows — inset and all —
    // plus the code shade, because Obsidian leaves these two transparent.
    for (const end of ["begin", "end"]) {
      const rules = cssRules(`${LP}.HyperMD-codeblock-${end}`);
      expect(rules, end).toContain(row);
      expect(rules.join("\n"), end).toContain("background: var(--code-background)");
    }

    // AND THE CARD'S BORDERS SURVIVE EVERY FENCE ROW (1.0.40): *"fix border
    // disappearing"*. Obsidian's code-row styling outranks the one-class
    // surface rule, so the borders are said again at this weight.
    expect(row).toContain("border-left: 1px solid var(--ca-border-subtle)");
    expect(row).toContain("border-right: 1px solid var(--ca-border-subtle)");

    // SO THE PANEL IS SQUARE. A radius on a row that carries the card's side
    // borders bends the card's edge in at both ends of every fence.
    const css = styleSheets()
      .map((f) => f.css)
      .join("\n")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const codeRules = css.split("}").filter((r) => r.includes("HyperMD-codeblock"));
    expect(codeRules.length).toBeGreaterThan(0);
    for (const r of codeRules) expect(r).not.toMatch(/border-radius:\s*var/);
  });

  it("paints a table as part of the card, not a hole in it (1.0.40)", () => {
    // *"tables break the prose block surface in live preview."* A rendered
    // table is a `.cm-embed-block.cm-table-widget`, which the in-between rule
    // above declines to paint — rightly, since a ```chronoanvil card is one
    // too. So a table is asked for by name, strictly inside a run.
    const table = cssRule(
      `${LP} ~ .cm-embed-block.cm-table-widget:has(~ .cm-line.ca-prose-block)`
    );
    expect(table).toContain("background: var(--background-secondary)");
    expect(table).toContain("border-left: 1px solid var(--ca-border-subtle)");
    expect(table).toContain("border-right: 1px solid var(--ca-border-subtle)");
    // Its own margins were the gap; flow-root keeps the table's inside.
    expect(table).toContain("margin-top: 0");
    expect(table).toContain("margin-bottom: 0");
    // And not wider than the lines around it: Obsidian hangs the widget out
    // past the text column with negative side margins.
    // Obsidian's own geometry beat these at weight alone, so they are said
    // with `!important`.
    expect(table).toContain("margin-left: 0 !important");
    expect(table).toContain("margin-right: 0 !important");
    expect(table).toContain("width: auto !important");
    expect(table).toContain("display: flow-root");
    // And it sits in from the border by the writing's own inset.
    expect(table).toContain("padding-left: var(--ca-sec-pad-x)");
    expect(table).toContain("padding-right: var(--ca-sec-pad-x)");
    // AND THE WIDGET SETS THE INSET, because it is a sibling of the prose
    // lines and inherits nothing from them: read-only, the `var()` was invalid
    // and the padding computed to 0px under any weight.
    const own = cssRules(
      `${LP} ~ .cm-embed-block.cm-table-widget:has(~ .cm-line.ca-prose-block)`
    ).join("\n");
    expect(own).toContain("--ca-sec-pad-x: 20px");
    expect(own).toContain("--ca-sec-pad-x: 14px");
  });

  it("ends a Live Preview run on a drawn row when a table is at an end (1.0.40)", () => {
    // A table's rows are replaced by a widget, and a line decoration on a
    // replaced line is never drawn — a run ending on one had no last line.
    const lines = [
      "<!--chronoanvil-prose-->",
      "",
      "| a | b |",
      "|---|---|",
      "| 1 | 2 |",
      "",
      "<!--/chronoanvil-prose-->",
    ];
    expect(livePreviewSpans(lines)).toEqual([{ from: 1, to: 5, head: "Prose", nth: 1 }]);
    // Writing at the ends keeps the trimmed span it always had.
    const written = [...lines];
    written.splice(2, 0, "Intro.");
    written.splice(6, 0, "Outro.");
    expect(livePreviewSpans(written)).toEqual([{ from: 2, to: 6, head: "Prose", nth: 1 }]);
    // No blank to take: the span is left alone rather than stepping onto the
    // bracket.
    const tight = lines.filter((l) => l !== "");
    expect(livePreviewSpans(tight)).toEqual([{ from: 1, to: 3, head: "Prose", nth: 1 }]);
    // And the painter reads it.
    expect(readCode("ui/prose-surface.ts")).toContain(
      "for (const span of livePreviewSpans(doc.toString().split(\"\\n\")))"
    );
  });

  it("paints display maths as part of the card, not a hole in it (1.0.41)", () => {
    // *"ChronoAnvil's Prose blocks need to support LaTeX."* A `$$` block is
    // mounted exactly as a table is — `div.math.math-block.cm-embed-block`,
    // per the editor's own DOM — so it came back through the same hole the
    // in-between rule leaves for a `.cm-embed-block`.
    //
    // ONE SELECTOR LIST, NOT A SECOND RULE. "Exactly the same" is a property
    // that has to survive the next edit to the stylesheet, and matching
    // declarations in two places is how it stops being true.
    const table = `${LP} ~ .cm-embed-block.cm-table-widget:has(~ .cm-line.ca-prose-block)`;
    const math = `${LP} ~ .cm-embed-block.math-block:has(~ .cm-line.ca-prose-block)`;
    for (const rule of cssRules(table)) expect(cssRules(math)).toContain(rule);
    // Three of them: the paint, the inset, and the inset at phone width. The
    // fourth rule maths is in is the scroll below, which a table does not need.
    expect(cssRules(table)).toHaveLength(3);
  });

  it("scrolls an equation wider than the card inside it (1.0.41)", () => {
    // The report came with a reading-mode screenshot of a `\begin{aligned}`
    // block leaving the card at the right border and carrying on across the
    // page behind it. MathJax does not wrap and cannot be asked to, so wide
    // content scrolls inside itself — 99-time-grid.css's rule for the week
    // grid, arriving at the other thing here that cannot be made narrower.
    const scroll = cssRule(".ca-prose-block .math-block");
    // EVERY SPELLING OF THE ELEMENT IS IN THE SAME RULE, because the surface
    // class lands somewhere different in each mode: on the block Obsidian
    // wrapped the maths in, on the maths block itself where the equation IS
    // the block, and on the sibling widget Live Preview mounts.
    for (const also of [
      ".ca-journal-sec-block .math-block",
      ".ca-journal-sec-block.math-block",
      ".ca-prose-block.math-block",
      `${LP} ~ .cm-embed-block.math-block:has(~ .cm-line.ca-prose-block)`,
    ]) {
      expect(cssRules(also), also).toContain(scroll);
    }
    // BOTH AXES ARE NAMED, per the grid: one axis set makes the other scroll by
    // accident. A maths box's height is its content's, so the answer down is
    // `hidden` rather than a cap.
    expect(scroll).toContain("overflow-x: auto");
    expect(scroll).toContain("overflow-y: hidden");

    // AND IT IS THE MATHS BLOCK THAT SCROLLS, NEVER THE SURFACE. `overflow` on
    // a member block would clip what is allowed to leave one — the frame's
    // hover controls sit outside their block — and a card that scrolled would
    // take the whole run's writing with it.
    for (const surface of [".ca-journal-sec-block", ".ca-prose-block", LP]) {
      expect(cssRules(surface).join("\n"), surface).not.toContain("overflow");
    }
  });

  it("ends a Live Preview run on a drawn row when maths is at an end (1.0.41)", () => {
    // Display maths is the second thing Live Preview mounts instead of
    // drawing, and it arrived at `livePreviewSpans` as the table's bug word
    // for word: a cheat sheet that ends on an equation had no last line, so
    // nothing carried `is-prose-last` and the card stopped above the maths.
    const lines = [
      "<!--chronoanvil-prose-->",
      "",
      "$$",
      "\\frac{18}{24} = \\frac{3}{4}",
      "$$",
      "",
      "<!--/chronoanvil-prose-->",
    ];
    expect(livePreviewSpans(lines)).toEqual([{ from: 1, to: 5, head: "Prose", nth: 1 }]);

    // A one-line `$$ x $$` is the same row: Obsidian mounts that one too, and
    // where it does not the run merely ends on the blank line below it — the
    // air the table rule has accepted since 1.0.40.
    const oneLine = [
      "<!--chronoanvil-prose-->",
      "",
      "$$ \\frac{3}{4} $$",
      "",
      "<!--/chronoanvil-prose-->",
    ];
    expect(livePreviewSpans(oneLine)).toEqual([{ from: 1, to: 3, head: "Prose", nth: 1 }]);

    // Writing at the ends keeps the trimmed span it always had — an equation
    // in the MIDDLE of the writing is reached by the stylesheet, not by this.
    const written = [...lines];
    written.splice(2, 0, "Simplify by the HCF:");
    written.splice(7, 0, "Which is in its lowest terms.");
    expect(livePreviewSpans(written)).toEqual([{ from: 2, to: 7, head: "Prose", nth: 1 }]);

    // AND `$$` MID-LINE IS NOT A BLOCK. Obsidian draws it inside the row, the
    // row is a `.cm-line`, and the decoration lands on it as it always did.
    const inline = [
      "<!--chronoanvil-prose-->",
      "",
      "Divide by the HCF: $$ \\frac{18}{24} = \\frac{3}{4} $$",
      "",
      "<!--/chronoanvil-prose-->",
    ];
    expect(livePreviewSpans(inline)).toEqual([{ from: 2, to: 2, head: "Prose", nth: 1 }]);
  });

  it("leaves a `$$` a reader printed inside a code fence alone (1.0.41)", () => {
    // `markerLinesIn`'s reason one file over: a reader writing ABOUT LaTeX puts
    // `$$` in a ```` ``` ```` block, and a code fence's rows are drawn — they
    // are the `HyperMD-codeblock-bg` rows the stylesheet paints. Counting one
    // as mounted would step the run's end off a row that was working.
    const lines = [
      "<!--chronoanvil-prose-->",
      "",
      "```",
      "$$",
      "x = 1",
      "$$",
      "```",
      "",
      "<!--/chronoanvil-prose-->",
    ];
    expect(livePreviewSpans(lines)).toEqual([{ from: 2, to: 6, head: "Prose", nth: 1 }]);
  });

  it("ends a section run rather than being taken into one", () => {
    // The brace to that belt, and the only one of the two that removes the
    // cause: a bar titles a WIDGET section, and prose is the note itself. A run
    // that swallowed a paragraph was invisible until its end classes landed and
    // drew a rounded edge across the middle of the writing.
    const bar = readCode("ui/headerbar.ts");
    expect(bar).toContain('import { PROSE_BLOCK_CLASS } from "./prose-surface";');
    const boundary = bar.slice(bar.indexOf("private isSectionBoundary("));
    expect(boundary.slice(0, boundary.indexOf("return !!block.querySelector"))).toContain(
      "if (block.hasClass(PROSE_BLOCK_CLASS)) return true;"
    );
  });
});

// ── THE HEAD, AND THE COG THAT RIDES IT (1.0.75, 1.0.78) ─────────────────
//
// *"can we give the prose blocks a header like other sections?"* — and then
// *"I think prose blocks could definetely benefit from the cog."*
//
// A SECTION'S HEAD IS AN ELEMENT A RENDERER BUILT; prose has no renderer. In
// reading mode it is the note's own blocks and in Live Preview it is the
// `.cm-line`s CodeMirror measures, so 1.0.75 put the NAME on the row that
// already carried `is-prose-first` in a `data-ca-prose-head` attribute and let
// the stylesheet draw it with `content: attr(…)`. One declaration, both modes,
// no node.
//
// THAT IS SPENT, BECAUSE A COG IS A `<button>` AND A PSEUDO-ELEMENT HOLDS NO
// CHILDREN. The row is an element now — `ui/prose-bar.ts` builds it, out of a
// title and one `settings` button — and the two painters host it differently:
// reading mode prepends it into the block that carries `is-prose-first`,
// exactly where the `::before` drew, and Live Preview mounts a BLOCK WIDGET
// above the writing which takes that class off the line and wears it itself.
//
// AND THE ONE THING 1.0.75 SAID THAT WAS SIMPLY WRONG: *"a block widget in the
// editor would be a new atomic range at the top of the reader's writing."* It
// is not. `Decoration.widget({ block: true })` is a zero-length point that
// adds no document position, and CodeMirror already moves a cursor out of one
// — *"If a position is in/near a block widget, move it to a nearby text line"*
// (`@codemirror/view`). `marker-lines.ts` was left untouched for this round.
//
// THE CHEVRON IS STILL REFUSED. It was asked for in the same breath as the cog
// and the answer has not changed: `headerbar.ts` never hides a source line in
// Live Preview — *"A SOURCE LINE IS NEVER HIDDEN, only painted"* — so a fold
// arrow here would work in reading mode and sit dead in the editor, which is
// 1.0.73's omission-with-extra-pixels.
describe("the head, and the cog that rides it (1.0.75, 1.0.78)", () => {
  const src = () => readCode("prose-surface");
  const bar = () => readCode("ui/prose-bar.ts");

  it("is an element, and the attribute it replaced is gone from both halves", () => {
    // AN INVARIANT SPENT IS REWRITTEN, NEVER QUIETLY BROKEN. 1.0.75's rule was
    // "an attribute and not an element"; the cog is what overturned it, so the
    // attribute must be gone from the painter AND from the stylesheet — a
    // selector left asking for it would draw a second hairline over the bar.
    expect(src()).not.toContain("PROSE_HEAD_ATTR");
    expect(src()).not.toContain("data-ca-prose-head");
    for (const sheet of styleSheets()) {
      expect(sheet, "data-ca-prose-head").not.toContain("data-ca-prose-head");
    }
    expect(cssRules(".ca-prose-block.is-prose-first[data-ca-prose-head]::before")).toHaveLength(0);
    expect(cssRules(".ca-prose-block.is-prose-first::before")).toHaveLength(0);
  });

  it("is built in one place and hosted in two", () => {
    // THE DOM IS THE BAR MODULE'S, which is what keeps the two modes agreeing
    // about what a prose head looks like. A painter decides WHERE the row goes;
    // neither decides what is in it.
    expect(bar()).toContain('export const PROSE_BAR_CLASS = "ca-prose-bar";');
    expect(bar()).toContain('export const PROSE_BAR_TITLE_CLASS = "ca-prose-bar-title";');
    expect(bar()).toContain('export const PROSE_BAR_COG_CLASS = "ca-prose-bar-cog";');
    expect(bar()).toContain('export const PROSE_BAR_HOST_CLASS = "ca-prose-bar-host";');
    for (const named of ["buildProseBar", "clearProseBar", "PROSE_BAR_HOST_CLASS"]) {
      expect(src(), named).toContain(named);
    }
    expect(src()).toContain('} from "./prose-bar";');
    // And the bar module builds no decoration and reads no document: it is
    // handed a title, a number and a thunk.
    expect(bar()).not.toContain("Decoration");
    expect(bar()).not.toContain("getSectionInfo");
  });

  it("names the default block, numbered, and the reader's own block by its name", () => {
    expect(proseSurfaceSpans([OPEN, "Words.", SHUT])[0].head).toBe("Prose");
    const two = [OPEN, "One.", SHUT, "", OPEN, "Two.", SHUT];
    expect(proseSurfaceSpans(two).map((s) => s.head)).toEqual([
      "Prose",
      "Prose 2",
    ]);
    const titled = ["<!--chronoanvil-prose:Chapter one-->", "Words.", SHUT];
    expect(proseSurfaceSpans(titled)[0].head).toBe("Chapter one");
  });

  it("numbers off the block and not off the surfaces it produced", () => {
    // AN EMPTIED BLOCK HAS NO SURFACE — see `proseSurfaceSpans`, which skips it
    // — so numbering off the output array would call the reader's SECOND block
    // *Prose* the moment they emptied the first. The reader can see both
    // blocks in the file; the number has to count what is there.
    const lines = [OPEN, "", SHUT, "", OPEN, "Words.", SHUT];
    expect(proseSurfaceSpans(lines)).toEqual([
      { from: 5, to: 5, head: "Prose 2", nth: 2 },
    ]);
  });

  it("carries the ordinal to the cog, so the window opens on one block", () => {
    // THE NUMBER IS THE BLOCK'S ADDRESS and not a label: `proseIdFor(nth)` is
    // what the window looks the section view up by. It had to travel because
    // the head was already computing it for the name, and because a bar on the
    // second block of a note must not open a window onto the first.
    const two = [OPEN, "One.", SHUT, "", "<!--chronoanvil-prose#bare-->", "Two.", SHUT];
    expect(proseSurfaceSpans(two).map((s) => s.nth)).toEqual([1, 2]);
    // AND IT REACHES READING MODE'S MARK, which is the half a reader meets
    // first: `paintProse` builds the bar off `mark.nth`, so a mark that always
    // said 1 would put a cog on every block that opened the FIRST block's
    // window — the defect nobody sees until they rename the wrong one.
    const text = note(OPEN, "One.", SHUT, "", OPEN, "Two.", SHUT);
    expect(proseMarkFor(text, 1, 1).nth).toBe(1);
    expect(proseMarkFor(text, 5, 5).nth).toBe(2);
    // A ROW IN NO BLOCK IS ZERO, which is the one value `proseIdFor` is never
    // asked for — a mark with no head builds no bar.
    expect(proseMarkFor(note("Nothing here."), 0, 0)).toEqual({
      member: false,
      first: false,
      last: false,
      head: null,
      nth: 0,
    });
  });

  it("rides the first row only, which is what makes it one head", () => {
    // The bar lands on `.is-prose-first`, so a head on every row would be a
    // title repeated down the whole of the writing.
    const text = note(OPEN, "", "## Overview", "", "A paragraph.", "", SHUT);
    expect(proseMarkFor(text, 2, 2).head).toBe("Prose");
    expect(proseMarkFor(text, 4, 4).head).toBeNull();
  });

  it("is taken off a row that has stopped being the top of the block", () => {
    // `toggleClass`'s reason, on the element: a post-processor runs again over a
    // block Obsidian re-renders in place, and a bar that is only ever BUILT is
    // a head stranded in the middle of the writing.
    const body = fnBody("paintProse", "prose-surface");
    expect(body).toContain("if (mark.head === null) {");
    expect(body).toContain("clearProseBar(el);");
    expect(body).toContain("buildProseBar(");
    expect(body).toContain("{ title: mark.head, nth: mark.nth, path: () => ctx.sourcePath },");
  });

  it("rebuilds without emptying the host, because the host is the reader's block", () => {
    // `host.empty()` WOULD TAKE THE PARAGRAPH WITH IT. In reading mode the host
    // IS the first rendered block of the writing — a `## ` heading, a
    // paragraph — so the sweep names the bar's own class and removes only that.
    const clear = fnBody("clearProseBar", "ui/prose-bar.ts");
    expect(clear).toContain("old.hasClass(PROSE_BAR_CLASS)");
    expect(clear).toContain("old.remove()");
    expect(bar()).not.toContain("host.empty()");
    // AND BUILDING IS CLEARING FIRST, so a second pass leaves one bar rather
    // than two, and `prepend` keeps it above the markdown rather than under it.
    const build = fnBody("buildProseBar", "ui/prose-bar.ts");
    expect(build).toContain("clearProseBar(host);");
    expect(build).toContain("host.prepend(bar);");
  });

  it("wears `settings`, the same glyph the other two cogs wear", () => {
    // *"I'm trying to remove '...' for some sections, so far this has been done
    // for attachments and what's below. I think prose blocks could definetely
    // benefit from the cog."* Three sections, one glyph, one word for it.
    expect(bar()).toContain('setIcon(btn, "settings");');
    for (const other of [
      "ui/note-types-window.ts",
      "ui/widgets/attachment-widgets.ts",
    ]) {
      expect(readCode(other), other).toContain('setIcon(btn, "settings");');
    }
    // A BUTTON, SO IT IS TABBABLE AND ANNOUNCES ITSELF, and it says what it
    // opens rather than naming its own shape.
    expect(bar()).toContain('createEl("button"');
    expect(bar()).toContain('"aria-label": COG_LABEL');
    expect(bar()).toContain('type: "button"');
  });

  it("keeps the press off the row under it", () => {
    // The cog sits on top of the reader's own markdown in reading mode and on
    // top of a CodeMirror widget in the editor. A press that bubbled would
    // place a cursor, follow a link, or toggle a checkbox in the first line of
    // the writing.
    const press = fnBody("buildProseCog", "ui/prose-bar.ts");
    expect(press).toContain("evt.preventDefault();");
    expect(press).toContain("evt.stopPropagation();");
  });

  it("reads the note's path at the press and not before", () => {
    // A `path: string` CAPTURED AT BUILD TIME IS A STALE ANSWER. A reading-mode
    // bar outlives a rename, and a Live Preview widget outlives the file in its
    // pane being swapped — CodeMirror reuses a widget whose `eq` says it is the
    // same one. So the spec carries a thunk, and the editor's thunk asks the
    // view which file it is showing at the moment the reader clicks.
    expect(bar()).toContain("path: () => string | null;");
    expect(fnBody("buildProseCog", "ui/prose-bar.ts")).toContain("const path = spec.path();");
    expect(src()).toContain(
      "path: () => view.state.field(editorInfoField, false)?.file?.path ?? null,"
    );
    expect(fnBody("paintProse", "prose-surface")).toContain("path: () => ctx.sourcePath");
  });

  it("mounts the editor's bar as a block widget above the writing", () => {
    // `side: -1` PUTS IT BEFORE THE LINE at the same position, which is what
    // makes it the top of the card rather than a row inside it. `block: true`
    // is legal here and nowhere else in this file's neighbourhood: CodeMirror
    // refuses block decorations from a plugin-provided facet and accepts them
    // from a `StateField`, which is what this already was.
    const body = fnBody("proseIn", "prose-surface");
    expect(body).toContain("block: true,");
    expect(body).toContain("side: -1,");
    expect(body).toContain("new ProseBarWidget(span.head, span.nth, plugin)");
    // AND NO WIDGET WHERE THERE IS NO HEAD, which is 1.0.77's tick reaching the
    // editor: a `#bare` block gets rows and no bar at all.
    expect(body).toContain("if (span.head === null || span.from >= doc.lines) continue;");
  });

  it("moves the card's top edge onto the widget, because that is where it is", () => {
    // `is-prose-first` ZEROES THE TOP MARGIN AND ROUNDS THE TOP CORNERS. With a
    // bar above it the first `.cm-line` is no longer the top of anything, so
    // the class rides the widget and the line keeps the interior rule — leave
    // it on both and the card draws two top edges one gap apart.
    const body = fnBody("proseIn", "prose-surface");
    expect(body).toContain("if (n === span.from && span.head === null) cls.push(PROSE_FIRST_CLASS);");
    expect(src()).toContain(
      'cls: [PROSE_BLOCK_CLASS, PROSE_FIRST_CLASS, PROSE_BAR_HOST_CLASS].join(" "),'
    );
  });

  it("tells CodeMirror when two widgets are the same bar", () => {
    // A WIDGET WITHOUT `eq` IS REBUILT ON EVERY TRANSACTION, which costs the
    // cog its focus and the row a repaint on every keystroke. The two fields
    // the DOM depends on are the title and the ordinal; the plugin is the same
    // object for the life of the field, and the path is read at the press.
    expect(src()).toContain("eq(other: ProseBarWidget): boolean {");
    expect(src()).toContain(
      "return other.title === this.title && other.nth === this.nth;"
    );
    // AND IT HANDLES ITS OWN EVENTS. `ignoreEvent` returning true keeps
    // CodeMirror from reading a press on the cog as a press on the document.
    expect(src()).toContain("ignoreEvent(): boolean {");
  });

  it("gives the editor's host no vertical margin, and that is a height and not a look", () => {
    // CodeMirror measures a block widget's height from its box and adds the
    // result to the height map. A margin is outside that box, so the editor
    // would believe every prose card starts a gap higher than it does and the
    // scroll would drift by one gap per block.
    const host = cssRule(".markdown-source-view.mod-cm6 .cm-content > .ca-prose-bar-host");
    expect(host).toContain("margin-top: 0");
    expect(host).toContain("margin-bottom: 0");
  });

  it("wears the section bar's own type, token for token", () => {
    // THE ROW IT SITS ON IS THE READER'S MARKDOWN — a `## ` heading, a
    // paragraph, a list — so nothing may be inherited. Everything a title
    // settles is settled here, off the tokens the bar's own title reads, so a
    // retune of the bar reaches this head with it.
    const head = cssRule(".ca-prose-bar");
    const barRule = cssRule(".ca-journal-header-title");
    for (const declaration of [
      "font-size: var(--ca-sec-title-size)",
      "font-weight: 600",
      "line-height: 1.35",
      "color: var(--ca-sec-title-ink)",
      "letter-spacing: normal",
      "text-transform: none",
    ]) {
      expect(head, declaration).toContain(declaration);
      expect(barRule, declaration).toContain(declaration);
    }
    // A long name ellipsises rather than wrapping, which is the bar's rule too:
    // two lines of head push the writing down by a row whose cause the reader
    // cannot see. ON A FLEX ROW IT TAKES `min-width: 0` AS WELL — a flex item's
    // floor is its content, so without it the title grows and the COG is what
    // leaves the line.
    const title = cssRule(".ca-prose-bar-title");
    for (const declaration of [
      "overflow: hidden",
      "text-overflow: ellipsis",
      "white-space: nowrap",
    ]) {
      expect(title, declaration).toContain(declaration);
      expect(barRule, declaration).toContain(declaration);
    }
    expect(title).toContain("min-width: 0");
    expect(head).toContain("display: flex");
    // And the division under it is the bar's, down to the token.
    expect(head).toContain(
      "border-bottom: var(--ca-rule-hair) solid var(--background-modifier-border)"
    );
    expect(cssRule(".ca-journal-sec")).toContain(
      "border-bottom: var(--ca-rule-hair) solid var(--background-modifier-border)"
    );
  });

  it("is the same cog as the other two, from one rule rather than three blocks", () => {
    // 1.0.69 WROTE THIS RULE DOWN AND THEN WROTE A SECOND BLOCK ANYWAY. The
    // third cog is where it costs something: a second place for the 30px reset
    // to be forgotten in is how `obsidian-button-height` announces itself on a
    // `<button>` in a ~20px head.
    const cog = cssRule(".ca-prose-bar-cog");
    for (const other of [".ca-journal-field-cats", ".ca-journal-note-types-cog"]) {
      expect(cssRule(other), other).toBe(cog);
    }
    expect(cssRule(".ca-prose-bar-cog .svg-icon")).toBe(
      cssRule(".ca-journal-note-types-cog .svg-icon")
    );
    expect(cssRule(".ca-prose-bar-cog:hover")).toBe(
      cssRule(".ca-journal-note-types-cog:hover")
    );
    // THE RESET ITSELF, named rather than left to the shared rule: app.css
    // gives every button `height: var(--input-height)`, which no amount of
    // padding, font-size or line-height reaches.
    expect(cog).toContain("height: 1.4em");
    expect(cog).toContain("min-height: 0");
    expect(cog).toContain("cursor: pointer");
  });

  it("draws no chevron, because a fold cannot act in the editor", () => {
    // ASKED FOR IN THE SAME BREATH AS THE COG AND REFUSED. `headerbar.ts` never
    // hides a source line in Live Preview — *"A SOURCE LINE IS NEVER HIDDEN,
    // only painted"* — so a fold arrow on this head would work in reading mode
    // and sit dead in the editor, which is the omission with extra pixels.
    for (const glyph of ["chevron", "triangle", "collapse", "fold"]) {
      expect(bar().toLowerCase(), glyph).not.toContain(glyph);
    }
    // ONE CONTROL ON THE ROW, so the title itself is not a press either.
    expect(cssRule(".ca-prose-bar")).not.toContain("cursor");
    expect(cssRules(".ca-prose-bar-title").join("\n")).not.toContain("cursor");
    const build = fnBody("buildProseBar", "ui/prose-bar.ts");
    expect(build).toContain("bar.appendChild(buildProseCog(spec, plugin));");
    expect((bar().match(/addEventListener/g) ?? []).length).toBe(1);
  });
});

// ── AND THE BLOCK THAT WEARS NONE (1.0.77) ───────────────────────────────
//
// *"add a hide title row button"*. The answer is `#bare` on the opening marker
// — see `test/prose.test.ts` for the grammar and the write — and what reaches
// the two painters is one thing: a `head` of null.
describe("the block that wears no head (1.0.77)", () => {
  const BARE = "<!--chronoanvil-prose#bare-->";
  const NAMED_BARE = "<!--chronoanvil-prose#bare:Chapter one-->";

  it("is still a surface, and still paints every row of the writing", () => {
    // THE HEAD IS THE ONLY THING THE FLAG TAKES. A reader hiding the title row
    // asked for one piece of chrome to go, not for their prose to stop being a
    // prose block — the background, the padding and both edge classes stay.
    expect(proseSurfaceSpans([BARE, "Words.", SHUT])).toEqual([
      { from: 1, to: 1, head: null, nth: 1 },
    ]);
    const text = note(BARE, "", "## Overview", "", "A paragraph.", "", SHUT);
    const mark = proseMarkFor(text, 2, 2);
    expect(mark.member).toBe(true);
    expect(mark.first).toBe(true);
    expect(mark.head).toBeNull();
  });

  it("keeps its name while the head is gone", () => {
    // THE NAME SURVIVES THE HEAD GOING, which is the whole reason the two are
    // separate answers on one marker — a reader who hides the row and shows it
    // again gets their own word back, not an empty box.
    expect(proseSurfaceSpans([NAMED_BARE, "Words.", SHUT])[0].head).toBeNull();
    expect(proseSpansIn([NAMED_BARE, "Words.", SHUT])[0]).toEqual({
      open: 0,
      close: 2,
      key: "prose",
      title: "Chapter one",
      bare: true,
    });
  });

  it("names one block and not the one beside it", () => {
    // THE FLAG IS PER BLOCK, like the name and the number: a note may hold one
    // block with a head and one without, and the ordinal still counts every
    // block in the file.
    const two = [OPEN, "One.", SHUT, "", BARE, "Two.", SHUT];
    expect(proseSurfaceSpans(two)).toEqual([
      { from: 1, to: 1, head: "Prose", nth: 1 },
      { from: 5, to: 5, head: null, nth: 2 },
    ]);
    // AND IN THE OTHER ORDER, which is what says the flag is read off each
    // opener rather than carried between them: a block's answer must not
    // outlive the block it was written on.
    const flip = [BARE, "One.", SHUT, "", OPEN, "Two.", SHUT];
    expect(proseSurfaceSpans(flip)).toEqual([
      { from: 1, to: 1, head: null, nth: 1 },
      { from: 5, to: 5, head: "Prose 2", nth: 2 },
    ]);
  });

  it("builds no bar at all, rather than an empty one", () => {
    // AN EMPTY BAR WOULD STILL DRAW, because `.ca-prose-bar` carries the
    // hairline and the air under it — a blank band above the writing on every
    // block whose head the reader asked to go. So neither painter builds one:
    // reading mode takes any existing bar off and returns, and the editor's
    // widget is never added.
    const paint = fnBody("paintProse", "prose-surface");
    expect(paint).toContain("if (mark.head === null) {");
    expect(paint).toContain("clearProseBar(el);");
    const body = fnBody("proseIn", "prose-surface");
    expect(body).toContain("if (span.head === null || span.from >= doc.lines) continue;");
    // AND THE CARD'S TOP EDGE STAYS ON THE LINE WHERE THERE IS NO BAR TO TAKE
    // IT. This is the one place the two 1.0.77/1.0.78 answers meet: a `#bare`
    // block's first row is still the top of the card, so `is-prose-first` goes
    // where it always went.
    expect(body).toContain(
      "if (n === span.from && span.head === null) cls.push(PROSE_FIRST_CLASS);"
    );
  });

  it("hands the editor's decoration a head that may be null", () => {
    // ONE TYPE THROUGH BOTH PAINTERS. `livePreviewSpans` widens the run to the
    // blank line above a table or a `$$`, so a head declared `string` here
    // would have been a cast at exactly the place the two shapes meet.
    expect(livePreviewSpans([BARE, "Words.", SHUT])).toEqual([
      { from: 1, to: 1, head: null, nth: 1 },
    ]);
    // ONE TYPE, NAMED ONCE. `livePreviewSpans` returns the model's own
    // `ProseSurface`, so a `head` declared `string` would have been a cast at
    // exactly the place the two shapes meet.
    expect(readCode("prose-surface")).toContain(
      "export function livePreviewSpans(lines: readonly string[]): ProseSurface[] {"
    );
    expect(readSrc("journal-sections")).toContain("head: string | null;");
  });
});
