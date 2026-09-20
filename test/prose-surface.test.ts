// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import { cssRule, cssRules, readCode, readSrc, styleSheets } from "./sources";
import { proseSurfaceSpans } from "../src/journals/journal-sections";
import { proseMarkFor } from "../src/ui/prose-surface";

const OPEN = "<!--chronoanvil-prose-->";
const SHUT = "<!--/chronoanvil-prose-->";

const note = (...lines: string[]): string => lines.join("\n");

describe("what a prose surface covers", () => {
  it("covers the writing and neither marker", () => {
    // An opener renders as nothing in reading mode and is hidden in Live
    // Preview, so a surface that included its row would open with a blank band.
    const lines = [OPEN, "## Overview", "", "Some words.", SHUT];
    expect(proseSurfaceSpans(lines)).toEqual([{ from: 1, to: 3 }]);
  });

  it("trims the blank lines the composer leaves at each end", () => {
    // The template writes a blank after the opener and before the closer, and a
    // reader who presses Enter twice under their last paragraph leaves more.
    // Blank rows are not rows of prose.
    const lines = [OPEN, "", "", "Words.", "", "", SHUT];
    expect(proseSurfaceSpans(lines)).toEqual([{ from: 3, to: 3 }]);
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
      { from: 1, to: 1 },
      { from: 7, to: 7 },
    ]);
  });

  it("paints a note written before the rename", () => {
    // `<!--chronoanvil-skeleton-->` is what every note composed between 5.6 and
    // 1.0.36 carries, and `proseSpansIn` reads both spellings — so this inherits
    // that contract rather than restating it.
    const lines = ["<!--chronoanvil-skeleton-->", "Words.", "<!--/chronoanvil-skeleton-->"];
    expect(proseSurfaceSpans(lines)).toEqual([{ from: 1, to: 1 }]);
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
    expect(mark(6, 6)).toEqual({ member: true, first: true, last: false });
  });

  it("carries the last end on the block it ends in", () => {
    expect(mark(12, 12)).toEqual({ member: true, first: false, last: true });
  });

  it("carries neither in the middle", () => {
    expect(mark(8, 8)).toEqual({ member: true, first: false, last: false });
    expect(mark(10, 10)).toEqual({ member: true, first: false, last: false });
  });

  it("carries both when one block is the whole of it", () => {
    // A paragraph spanning every line of the writing, which is what a reader
    // who has not used a heading has.
    expect(proseMarkFor(note(OPEN, "One line.", SHUT), 1, 1)).toEqual({
      member: true,
      first: true,
      last: true,
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
    });
    expect(proseMarkFor(TEXT, 12, 15)).toEqual({
      member: true,
      first: false,
      last: true,
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
      "Decoration.widget",
      "```",
    ]) {
      expect(src()).not.toContain(write);
    }
  });

  it("paints only the rows, which is what a line decoration is", () => {
    // A mark decoration wraps the text and would paint the words; a widget puts
    // something on screen that is not in the file. `Decoration.line` puts a
    // class on the element CodeMirror already draws for that row.
    expect(src()).toContain("Decoration.line({ class: cls.join(\" \") })");
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
    for (const [section, prose] of paired) {
      const ours = cssRules(prose);
      expect(ours, `${prose} has no rule`).not.toHaveLength(0);
      for (const body of ours) expect(cssRules(section)).toContain(body);
    }
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
    // A card costs its horizontal padding twice on a ~360px column. A prose
    // block that kept 12px beside sections that dropped to 8px would be the
    // stagger §1.6 is about, at the one width where it costs the most.
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
    expect(main).toContain("this.registerEditorExtension(proseSurface());");
    expect(main).toContain(
      "this.registerMarkdownPostProcessor((el, ctx) => paintProse(el, ctx));"
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
    const fill = cssRule(`${LP}:not(.HyperMD-codeblock-bg)`);
    expect(fill).toContain("background: var(--background-secondary)");

    // AND THE EXCEPTION IS NAMED RATHER THAN THE CASES. The code keeps the
    // code's own colour; its two MARKER rows are excluded from the exception,
    // because that is where Obsidian draws the block's top and bottom and they
    // belong to the card.
    for (const end of ["begin", "end"]) {
      expect(cssRules(`${LP}.HyperMD-codeblock-${end}`), end).toEqual([fill]);
    }
  });

  it("draws a code block as a panel rather than a full-bleed stripe", () => {
    // Reading mode makes a code block a CHILD of the card, so the card's
    // padding holds it off both edges. Live Preview makes it the same rows as
    // the writing, and a background painted on a row reaches the row's edges.
    //
    // THE INSET IS DRAWN, NOT MEASURED: two card-coloured strips over the ends
    // of the row leave Obsidian's own code colour exactly as Obsidian computed
    // it, so this file never names a token for it and cannot drift when a
    // theme changes one. A margin would pull the CARD's side borders in with
    // it and notch the surface.
    const row = cssRule(`${LP}.HyperMD-codeblock-bg`);
    expect(row).toContain("inset 6px 0 0 0 var(--background-secondary)");
    expect(row).toContain("inset -6px 0 0 0 var(--background-secondary)");
    expect(row).not.toContain("--code-background");
    expect(row).not.toContain("margin-left");

    // The corners belong to the code, so they go on its first and last row and
    // not on the fence's marker rows — those are where Obsidian draws its
    // label, and they belong to the card. The third rule is a block of ONE
    // line, which is both ends at once and would otherwise take only the last.
    const head = `${LP.replace(" > ", " > .HyperMD-codeblock-begin-bg + ")}.HyperMD-codeblock-bg`;
    expect(cssRule(head)).toContain(
      "border-radius: var(--ca-radius-sm) var(--ca-radius-sm) 0 0"
    );
    expect(
      cssRule(`${LP}.HyperMD-codeblock-bg:has(+ .HyperMD-codeblock-end-bg)`)
    ).toContain("border-radius: 0 0 var(--ca-radius-sm) var(--ca-radius-sm)");
    expect(
      cssRule(`${head}:has(+ .HyperMD-codeblock-end-bg)`)
    ).toContain("border-radius: var(--ca-radius-sm)");
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
