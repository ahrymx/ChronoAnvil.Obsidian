// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// `level-cards` — the card arrangement of `level-index`'s question. 4.36 §2.
//
// WHAT CAN BE ASSERTED WITHOUT A DOM, which is what this suite has. Three
// things, and they are the three the design actually rests on:
//
//   • THE PAIRING RULE is `hasLevelBelow`, a pure function of the journal's
//     shape, so what a two-level journal draws and what a flat one draws can be
//     asserted directly rather than looked at.
//   • THE TWO WIDGETS SHARE ONE RESOLVER, which is a fact about the module and
//     is what stops the refusals drifting into two vocabularies.
//   • THE LAYOUT IS A CONTAINER QUERY, which is the property 4.3.1 spent a
//     release establishing and the one a rewrite is most likely to lose.
//
// What is NOT here is anything about what the cards look like. `test/journal-
// dashboard.test.ts` covers the page that composes them.

import { describe, expect, it } from "vitest";
import { hasLevelBelow, containerDepth } from "../src/ui/tables";
import { JOURNAL_PRESETS, buildJournalType } from "../src/journals/journal";
import type { JournalType } from "../src/journals/journal";
import { WIDGETS } from "../src/core/widget-registry";
import { cssRule, readCss, readSrc } from "./sources";

const TYPES: JournalType[] = JOURNAL_PRESETS.map((p) => buildJournalType(p.config));
const byId = (id: string): JournalType => {
  const t = TYPES.find((x) => x.id === id);
  if (!t) throw new Error(`no preset ${id}`);
  return t;
};

// A 1px solid edge in the inner-card ink, on one side, however it is SPELLED.
//
// ── WHY THIS IS A PREDICATE AND NOT A STRING (4.40) ──────────────────────
//
// These assertions read `border: 1px solid var(--am-border-inner)` and broke
// when 4.40 split that shorthand into longhands — a change made for a fault in a
// different rule, which these tests then reported as a regression in this one.
// The fault: **a `var()` that does not resolve invalidates the whole shorthand**,
// so a colour that fails takes the width and the STYLE with it and the border
// vanishes. `journal-cards.test.ts` carries the render that found it.
//
// What these tests mean is that the pair carries a 1px solid edge in that ink on
// that side. Which of the two legal spellings states it is the stylesheet's
// business, and a test that picks one blocks the other — RESUME.md's rule from
// 4.39.0, met again from the opposite direction.
const hasEdge = (rule: string, side = ""): boolean =>
  rule.includes(`border${side}: 1px solid var(--am-border-inner)`) ||
  (rule.includes(`border${side}-width: 1px`) &&
    rule.includes(`border${side}-style: solid`) &&
    rule.includes(`border${side}-color: var(--am-border-inner)`));

describe("a pair is a question about the journal's shape", () => {
  it("pairs a container that has a level below it, and only that", () => {
    // THE STRUCTURE'S OWN ANSWER, NOT THE FOLDER'S CONTENTS — 4.16 §1's
    // correction, which this widget inherits by using the same predicate. A
    // Subject with no Topics yet is a Subject WITH NO TOPICS, not a deepest
    // level, so it draws its pair with an empty list rather than being redrawn
    // as something else the day its first topic lands.
    const study = byId("study");
    expect(hasLevelBelow(study, `${study.root}/Maths`)).toBe(true);
    expect(hasLevelBelow(study, `${study.root}/Maths/Algebra`)).toBe(false);
  });

  it("decides from the structure, and reads nothing else to decide it", () => {
    // A MECHANISM ASSERTION, AND IT IS DELIBERATE — `RESUME.md` §2.2 warns
    // against exactly this, so the reason is worth writing down. The PROPERTY
    // here is what the widget DRAWS, and this suite has no DOM to draw into, so
    // the two assertions above pin `hasLevelBelow` and would go on passing if
    // the builder stopped calling it. Mutation-checked: swapping the call for
    // `journalChildFolders(...).length > 0` — the exact misreading 4.16 §1 was
    // written to correct — passed every one of them.
    //
    // So the call site is pinned instead. It is a weaker test of a stronger
    // fact: emptiness is not depth, and a Subject with no Topics yet must not be
    // redrawn as a deepest level the day its first topic lands.
    const src = readSrc("tables").replace(/\/\/.*$/gm, "");
    const at = src.indexOf("export function buildLevelCards(");
    const body = src.slice(at, src.indexOf("function containerCard(", at));
    expect(body).toContain("const paired = hasLevelBelow(type, child.path)");
    expect(body).not.toContain(".length > 0");
  });

  it("draws singles for a one-level journal, and pairs for a two", () => {
    // The release's own sentence — "a two-level journal draws pairs and a flat
    // one draws singles" — asserted across every preset a reader can start
    // from rather than about the one the author had open.
    const shape = (t: JournalType): boolean =>
      hasLevelBelow(t, `${t.root}/Anything`);
    expect(shape(byId("study"))).toBe(true);
    expect(shape(byId("projects"))).toBe(true);
    expect(shape(byId("exercise-diet"))).toBe(false);
    expect(shape(byId("media"))).toBe(false);
  });

  it("refuses the deepest level rather than drawing notes as cards", () => {
    // A card is a container. At the deepest level what is below a folder is
    // NOTES — nothing to list, nothing to roll up — and quietly drawing
    // something else is the near-miss `journals:card` is refused for. The
    // refusal names the widget that does answer there, which is the half a bare
    // "not supported" would leave the reader to guess.
    const src = readSrc("tables");
    const at = src.indexOf("export function buildLevelCards(");
    expect(at, "buildLevelCards is gone").toBeGreaterThan(0);
    const body = src.slice(at, src.indexOf("\n// The left card", at));
    expect(body).toContain("if (!hasLevelBelow(type, folder.path))");
    // The backticks are escaped in the source, because the sentence quotes a
    // directive inside a template literal.
    expect(body).toContain("Use \\`level-index\\` to list them.");
  });

  it("asks the level below by depth, never by Study's word", () => {
    // `containerDepth` is what makes the widget type-agnostic: the level below a
    // Subject is a Topic and the level below an Area is a Project, and neither
    // spelling appears in the builder.
    const study = byId("study");
    expect(containerDepth(study, study.root)).toBe(-1);
    expect(containerDepth(study, `${study.root}/Maths`)).toBe(0);
    // COMMENTS STRIPPED FIRST, which is the idiom `preset-validation.test.ts`
    // documents and the trap this project keeps re-entering: the paragraphs
    // explaining why the builder holds no Study literals necessarily QUOTE
    // them, so a scan of the raw text fails on its own account of itself.
    const src = readSrc("tables").replace(/\/\/.*$/gm, "");
    const at = src.indexOf("export function buildLevelCards(");
    const body = src.slice(at, src.indexOf("export function buildTopicStats(", at));
    expect(body).not.toContain("Topic");
    expect(body).not.toContain("Subject");
  });
});

describe("one question, one resolver", () => {
  it("routes both arrangements through levelScope", () => {
    // `levelScope` is EXPORTED for exactly this, and its own comment says what
    // the alternative costs: a second, narrower copy was written in 4.16, drifted
    // the moment the resolution rule grew past one line, and went on prepending
    // the journal root to a path that already had one. Two widgets asking the
    // same question must not hold two answers.
    const src = readSrc("tables");
    for (const fn of ["buildLevelIndex", "buildLevelCards"]) {
      const at = src.indexOf(`export function ${fn}(`);
      expect(at, fn).toBeGreaterThan(0);
      expect(src.slice(at, at + 900), fn).toContain(
        "levelScope(plugin, ctx, argument)"
      );
    }
  });

  it("watches the same tree, from the same scope function", () => {
    const regions = readSrc("directive-regions");
    for (const fn of ["buildLevelIndexRegion", "buildLevelCardsRegion"]) {
      const at = regions.indexOf(`export function ${fn}(`);
      expect(at, fn).toBeGreaterThan(0);
      expect(regions.slice(at, at + 600), fn).toContain(
        "levelIndexScope(plugin, ctx, argument)"
      );
    }
  });

  it("takes level-index's two arguments verbatim", () => {
    // THE PROOF THAT THIS IS AN ARRANGEMENT AND NOT A SECOND FEATURE. The
    // registry entry is where the two could drift apart silently — a folder
    // argument gaining a keyword on one and not the other would make the
    // sections editor offer two different questions for one scope.
    const index = WIDGETS["level-index"];
    const cards = WIDGETS["level-cards"];
    // THE SHAPE, NOT THE WORDING. Each entry phrases its own question — "the
    // journal to index" against "the journal to show" — and that is the one
    // field the two SHOULD differ in, because the box is asked on behalf of a
    // named widget. Everything that decides what the answer MEANS has to match.
    expect(cards.arg?.kind).toBe(index.arg?.kind);
    expect(
      cards.arg && "source" in cards.arg ? cards.arg.source : null
    ).toBe(index.arg && "source" in index.arg ? index.arg.source : null);
    expect(cards.arg2).toEqual(index.arg2);
    expect(cards.argJoin).toBe(index.argJoin);
    expect(cards.repeats).toBe(index.repeats);
  });

  it("is a keyword rather than an argument, and the switch says so", () => {
    // `journals:cards` put an arrangement in the argument slot because that
    // keyword had one free. This one does not: both pieces are spent on a
    // journal and a folder, and the folder may hold slashes, so there is no
    // third piece. A `case` is the only expressible form.
    const widgets = readSrc("widgets");
    expect(widgets).toContain('case "level-cards":');
    expect(widgets).not.toContain('rest === "cards"\n        return buildLevelIndex');
  });
});

describe("the block's chrome, which the composed page depends on", () => {
  it("names itself, so `frame: section` has a title to use", () => {
    // A directive with no `SECTION_TITLES` entry cannot title itself, so
    // `frame: section` on it is refused out loud — and the journal dashboard
    // composes exactly that fence.
    const widgets = readSrc("widgets");
    expect(widgets).toContain('"level-cards": "🗂️ Contents"');
    // AND NOT THE SAME NAME AS ITS SIBLING. `level-index` is "What's below";
    // two blocks on one page headed identically would read as a duplicate
    // rather than as two arrangements a reader chose between.
    expect(widgets).toContain('"level-index": "🗂️ What\'s below"');
  });

  it("declares itself a card, so a section frame withholds the block's own", () => {
    // 4.1 §3.1's doubling: a card-drawing widget in a fence that also carries a
    // bar gives the container both, and the page draws two borders, two paddings
    // and two backgrounds arguing. `OVERVIEW_KINDS` is what tells the frame to
    // withhold one, and this widget draws cards.
    const widgets = readSrc("widgets");
    const at = widgets.indexOf("const OVERVIEW_KINDS = new Set([");
    expect(at, "no OVERVIEW_KINDS").toBeGreaterThan(0);
    expect(widgets.slice(at, widgets.indexOf("]);", at))).toContain(
      '"level-cards"'
    );
  });
});

describe("the layout answers to the block, not the window", () => {
  it("sizes its columns off the container", () => {
    // `.journal-widget-block` establishes `container-type: inline-size`, so an
    // intrinsic track sizes to the PANE, the canvas node or the tile. A media
    // query here is the fault 4.3.1 spent a release on: a breakpoint on the
    // block cannot describe a cell.
    const rule = cssRule(".jld-grid");
    expect(rule).toContain("auto-fill");
    expect(rule).toContain("minmax(");
  });

  it("keeps a pair together as one cell of that grid", () => {
    // Two siblings in the grid can be split by a wrap — one container's card
    // beside another's contents, which is a grid actively lying — and cannot
    // stack together when the space runs out. The wrapper spans two tracks and
    // owns its own arrangement.
    const rule = cssRule(".jld-pair");
    expect(rule).toContain("grid-column: span 2");
    expect(rule).toContain("grid-template-columns: 1fr 1fr");
  });

  it("stacks the pair under the width two cards need, by container query", () => {
    // THE ONE ASSERTION THAT WOULD SURVIVE A REWRITE INTO MEDIA QUERIES AND
    // SHOULD NOT. `cssRules` reaches inside `@container` blocks and not inside
    // `@media` ones, so a rule that moved would fail here rather than silently
    // start answering to the window.
    const stacked = cssRule(".jld-pair").split("\n");
    expect(stacked.some((l) => l.includes("grid-template-columns: 1fr;"))).toBe(
      true
    );
    // And the breakpoint is the grid's own arithmetic rather than a second
    // opinion about when things are narrow: two 260px tracks plus the gap.
    expect(enclosingQuery(".jld-pair")).toContain("max-width: 560px");
  });

  it("gives the container card the shared stat strip, not a band of its own", () => {
    // 4.35's outcome note in one line: the strip collapses on an `@container`
    // query rather than an `@media` one, which is the difference between a card
    // that reads correctly in a 400px pane and one that does not. What the card
    // adds is quieter type — the numbers are a subtitle here, not the section.
    const body = fn("containerCard");
    expect(body).toContain("statStrip(body, cards)");
    expect(cssRule(".jld-card-body .am-stat-value")).toContain("font-size");
  });
});

// ── 4.36.3: the cleanup ────────────────────────────────────────────────

describe("a pair is one box, not two boxes side by side", () => {
  it("puts the border on the pair and takes it off the cards inside", () => {
    // 4.36.1 drew a container and its contents as two bordered cards with the
    // grid's gap between them — two unrelated objects that happen to be
    // adjacent, on a page whose whole claim is that they belong together.
    const pair = cssRule(".jld-pair");
    expect(hasEdge(pair)).toBe(true);
    expect(pair).toContain("overflow: hidden");
    // `gap: 0` IS WHAT MAKES THE DIVIDER A BORDER. With a gap the line between
    // the panes is a strip of the page's ground showing through, which is a
    // second boundary rather than one.
    expect(pair).toContain("gap: 0");
    // And the panes are the same height, which two panes of one box are by
    // definition — `align-items: start` was right when they were two boxes.
    expect(pair).toContain("align-items: stretch");

    const inner = cssRule(".jld-pair > .jld-card");
    expect(inner).toContain("border: none");
    expect(inner).toContain("border-radius: 0");
  });

  it("draws exactly one divider inside it, and turns it when the pair stacks", () => {
    // A vertical rule between two STACKED boxes is a line down the left of the
    // lower one, which is worse than no line at all. The edge moves with the
    // arrangement rather than the arrangement being left to imply itself.
    //
    // ASKED FOR BY NAME AND NOT BY POSITION (4.38). This was
    // `.jld-pair > .jld-card:first-child` until the pair took a single head: the
    // head is the first child now, so that selector stopped matching the left pane
    // and the divider disappeared. `:first-of-type` would have been worse than
    // broken — every box here is a `div`, so it would have matched the head — and
    // `.jld-container` is a name the left pane has carried since 4.36.
    expect(hasEdge(cssRule(".jld-pair > .jld-container"), "-inline-end")).toBe(
      true
    );
    expect(readCss()).not.toContain(".jld-pair > .jld-card:first-child");
    const stacked = cssRule(".jld-pair > .jld-container");
    expect(stacked).toContain("border-inline-end: none");
    expect(hasEdge(stacked, "-block-end")).toBe(true);
    // Same query as the one that stacks them, so the two can never disagree.
    expect(enclosingQuery(".jld-pair > .jld-container")).toContain(
      "max-width: 560px"
    );
  });

  it("carries one head across both panes, spanning the tracks (4.38)", () => {
    // TWO HEADS WERE TWO KINDS OF THING PITCHED IDENTICALLY: the left was a
    // container's name and a link, the right a level noun that goes nowhere, both
    // at title weight on one band. Nothing about them said which was which, and
    // the hue band had a seam where they met.
    const body = fn("buildLevelCards");
    expect(body).toContain("containerHead(plugin, ctx, pair, type, child");
    // The pair was already a grid, so spanning is the whole layout cost.
    expect(cssRule(".jld-pair > .journal-sec")).toContain("grid-column: 1 / -1");
    // `1 / -1` AND NOT `span 2`, because the template drops to one track under
    // 560px and the head has to follow it rather than claim a track that is gone.
    expect(cssRule(".jld-pair > .journal-sec")).not.toContain("span 2");
    // And the head's own band rules name both boxes a container can be — the pair
    // when there is a level below, the card when there is not.
    expect(cssRule(".jld-pair > .journal-sec")).toContain("min-height:");
    expect(cssRule(".jld-card > .journal-sec")).toContain("min-height:");
  });

  it("keeps one head for both arrangements rather than two that can drift", () => {
    // The single card and the pair draw the SAME head — same name, same glyph, same
    // link, same ＋ — so it is one function called with a different host rather
    // than a `sectionFrame` call in each builder.
    expect(fn("containerCard")).toContain("containerHead(plugin, ctx, card, type");
    expect(fn("containerCard")).not.toContain("sectionFrame(");
    expect(fn("childrenCard")).not.toContain("sectionFrame(");
    // The ＋ is the head's, and optional: a container at the deepest container
    // level has nothing to create, so it gets a head with no control rather than a
    // disabled one.
    const head = fn("containerHead");
    expect(head).toMatch(/if \(below\) \{[\s\S]*?addHeadButton/);
  });

  it("says what each pane holds in the pane, as a caption and not a title", () => {
    // The change of TYPE is the point. A title beside a title is two things that
    // look the same and behave differently; caps at `--am-text-2xs` is the
    // plugin's treatment for a thing that NAMES A REGION and cannot be mistaken
    // for a destination.
    expect(fn("paneLabel")).toContain('cls: "jld-pane-label"');
    expect(fn("paneLabel")).toContain("text.toUpperCase()");
    const label = cssRule(".jld-pane-label");
    expect(label).toContain("var(--am-caps-weight)");
    expect(label).toContain("var(--am-caps-tracking)");
    // BOTH PANES TAKE ONE, which is what gives the two halves a shared first line;
    // a caption on the list alone would have put them a line out of step.
    //
    // THE GUARD IS PART OF THE ASSERTION, and the first version of this omitted it
    // and let a mutation through: `if (false && level) paneLabel(card, level.noun)`
    // still CONTAINS the call, so a test asking only for the text passed while the
    // strip pane lost its caption and the two panes went a line out of step again.
    // What has to be pinned is that a pane inside a pair — `!head` — reaches it.
    expect(fn("containerCard")).toMatch(
      /if \(!head && level\) paneLabel\(card, level\.noun\)/
    );
    expect(fn("childrenCard")).toContain("paneLabel(card, plural(below.noun))");
    // AND IT IS A SIBLING OF THE BODY IN BOTH, not a child. In the list pane it has
    // to be: that body is a stated four rows that SCROLLS, so a caption inside it
    // would ride away on the first scroll and spend one of the four rows.
    expect(fn("childrenCard")).toMatch(
      /paneLabel\(card,[\s\S]*?createDiv\(\{ cls: "jjs-card-body" \}\)/
    );
    // The strip pane copies the list body's 2px so the first figure and the first
    // row land on one line; the list body's own padding is left alone, because its
    // height calc counts it and shrinking it would clip the fourth row.
    expect(cssRule(".jld-pane-label + .jld-card-body")).toContain("padding-top: 2px");
    expect(readCss()).not.toContain(".jld-pane-label + .jjs-card-body");
  });

  it("has a rule under the head, which 4.36.3 wrongly claimed it had removed", () => {
    // THIS ASSERTION IS THE CORRECTION OF A TEST THAT COULD NOT FAIL, and the
    // clearest example this project has produced of the trap `RESUME.md` §2.2 is
    // about. It read:
    //
    //     expect(cssRule(".jld-card > .journal-sec")).not.toContain("border-bottom");
    //
    // and it passed, and the border was there the whole time. 4.36.3 removed the
    // DECLARATION from that rule; `.journal-sec`'s base rule still paints
    // `var(--am-rule-hair) solid var(--background-modifier-border)` on every bar
    // in the plugin, and nothing cancels it for a card head — the sheet's only
    // `border-bottom: none` rules are scoped to `.journal-header-bar` variants,
    // and a card head carries `owns: "children"` so it is not one.
    //
    // Found by decoding the pixels of a screenshot, not by reading: down a card
    // the column runs head-colour, then #333333, then body-colour.
    //
    // WHAT THE TEST ASKED WAS THE WRONG QUESTION. "Does this rule mention the
    // property" is answerable without knowing anything about what lands on the
    // element; the cascade is the thing under test. So it asks instead which rule
    // is in charge, and pins the fact that nothing cancels it.
    expect(cssRule(".journal-sec")).toContain("border-bottom: var(--am-rule-hair)");
    expect(readCss()).not.toContain(".jld-card > .journal-sec.is-");
    const head = cssRule(".jld-card > .journal-sec");
    expect(head).not.toContain("border-bottom: none");
    // And the head is coloured, which is what makes keeping the line right rather
    // than merely inherited — a hairline at the foot of a coloured band is where
    // the colour stops, not a fourth repetition of the card's edge.
    expect(head).toContain("background:");
  });

  it("stops the stat strip drawing hairlines inside a card", () => {
    // `.am-stats` divides its cells by showing a border-coloured ground through
    // the gaps, which is right for a framed masthead band and is, inside a card,
    // a grid drawn inside a box drawn inside a section.
    const strip = cssRule(".jld-card-body .am-stats");
    expect(strip).toContain("background: transparent");
    expect(cssRule(".jld-card-body .am-stat")).toContain("background: transparent");
  });
});

describe("the head wears the journal's own hue (4.37)", () => {
  it("paints from --jjc-hue, set on the grid by the builder", () => {
    // ON THE GRID, NOT PER CARD, because every card in one grid belongs to one
    // journal — a card reading it from an ancestor cannot disagree with its
    // siblings.
    expect(fn("buildLevelCards")).toContain(
      'root.style.setProperty("--jjc-hue", String(hueOf(type.id)))'
    );
    expect(cssRule(".jld-card > .journal-sec")).toContain("var(--jjc-hue");
  });

  it("mixes into a theme surface rather than stating a literal colour", () => {
    // ONE DEFINITION FOR BOTH THEMES, which is why this is `color-mix` and not
    // the mockup's `hsl(h 34% 22%)`. That literal is a dark band — right in the
    // dark theme, and a dark band under dark text in the light one, needing a
    // `.theme-light` override and a second value to keep in step. Mixing the hue
    // INTO a theme surface lets the base move and the tint ride it.
    //
    // `00-tokens.css` states the policy this follows: theme-specific values go
    // below the `:root` close, and the reason `--am-border-inner` needs no
    // override is that *"every term is a variable, so it resolves per theme."*
    const head = cssRule(".jld-card > .journal-sec");
    expect(head).toContain("color-mix(");
    expect(head).toContain("var(--background-primary-alt)");
    expect(cssRule(".jld-card > .journal-sec")).not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  it("is the same material as the journals card's banner, not a second colour", () => {
    // `.jjc-banner`'s own base is `hsl(var(--jjc-hue) 45% 42%)`, and the head
    // takes that and dilutes it. A reader arrives at a dashboard from a homepage
    // card, so the two wearing one hue at two strengths is the point; two
    // separately-chosen saturations that happen to share a hue would drift the
    // first time either was tuned.
    expect(cssRule(".jld-card > .journal-sec")).toContain("hsl(var(--jjc-hue, 260) 45% 42%)");
    expect(cssRule(".jjc-banner")).toContain("hsl(var(--jjc-hue, 260) 45% 42%)");
  });

  it("states its own height so the pair's band has no step in it (4.38)", () => {
    // MEASURED ON THE RENDER: 37px on the left pane, 42px on the right. The hue
    // band's whole argument is that it reads as ONE strip across ONE box, and it
    // had a 5px step at the divider — because the right head holds the ＋ and a
    // 13.6px icon with 6px of vertical padding is taller than the title's line
    // box. A flex item taller than its siblings grows the container, so a control
    // was deciding how tall a head was.
    const head = cssRule(".jld-card > .journal-sec");
    expect(head).toContain("min-height:");
    // THE NUMBER IS THE TITLE'S, not a round 37 — `1.35` is
    // `.journal-header-title`'s line-height and `--am-sec-title-size` its size, so
    // a reader who scales their font or a release that retunes the token moves the
    // band with it. A literal px would silently clip the title instead.
    expect(head).toContain("var(--am-sec-title-size)");
    expect(head).not.toMatch(/min-height:\s*\d+px/);
    // AND THE PADDING IS INSIDE THE FLOOR. Obsidian sets box-sizing per component
    // rather than globally — `.jjs-card-body` states this and `.jjh-stat` records
    // the trap — so without this the 12px is added on top and the band lands at
    // 49px, taller than the 42px step the min-height was added to remove.
    expect(head).toContain("box-sizing: border-box");
    // AND THE BUTTON IS TAKEN OUT OF THE ARGUMENT. `padding-block: 0` is what
    // stops it exceeding the band; `align-self: stretch` is what gives the hit
    // area back, because a stretched flex item is exactly its container's content
    // height and cannot be the thing that grows it.
    //
    // MUTATION-CHECKED: dropping `padding-block: 0` and keeping only the
    // `min-height` still passes a test that asks about the head alone — the head
    // would be 37px MINIMUM and the button would push it to 42px anyway. Both
    // halves are the mechanism, so both are pinned.
    const add = cssRule(".jld-head-add");
    expect(add).toContain("padding-block: 0");
    expect(add).toContain("align-self: stretch");
  });

  it("lets the band grow on a phone, on both heads at once", () => {
    // THE TAP FLOOR IS TALLER THAN THE TITLE. `--am-control-min` is 40px under
    // `body.is-mobile` and applies to `.journal-btn-ghost`, so on a phone the ＋
    // would overflow a 37px band and reintroduce the step this fixed. The band
    // takes the floor instead — and on EVERY card head, which is the part that
    // matters: what has to match is the two panes of a pair, not any number.
    const mobile = cssRule("body.is-mobile .jld-card > .journal-sec");
    expect(mobile).toContain("var(--am-control-min)");
    // Not one rule with a `max()`: `--am-control-min` is the string `auto` on the
    // desktop, and `auto` is not a length a `max()` can take.
    expect(cssRule(":root")).toContain("--am-control-min: auto");
  });

  it("keeps hueOf where both readers can reach it", () => {
    // It was private to `journals-cards.ts`, which `tables.ts` cannot import —
    // that file imports `tables.ts` for the strip's numbers, so the edge would
    // close a cycle in one hop. Same wall 4.36 hit with `childRow`, same answer.
    expect(readSrc("journal")).toContain("export function hueOf(");
    expect(readSrc("journals-cards")).not.toContain("export function hueOf(");
    // And the note it left behind says where it went, so a reader following the
    // old location is not left guessing.
    expect(readSrc("journals-cards")).toContain("`hueOf` MOVED TO `journal.ts`");
  });
});

describe("the add tile is the size of the slot it opens (4.37)", () => {
  it("spans a pair's footprint where the grid draws pairs", () => {
    // A tile that always took one track left half a row of nothing whenever the
    // grid drew pairs, because a pair spends both tracks and the tile wrapped
    // alone onto the next row.
    //
    // `span 2` IS `.jld-pair`'s OWN DECLARATION, which is what makes them line up
    // rather than merely both being wide.
    expect(cssRule(".jld-grid.is-paired .jld-add-tile")).toContain("grid-column: span 2");
    expect(cssRule(".jld-pair")).toContain("grid-column: span 2");
  });

  it("decides from the journal's shape, not from a width", () => {
    // Whether this grid draws pairs is a fact about the declared structure,
    // known before layout. A container query here would be asking the viewport a
    // question only the journal can answer — and it is the same predicate the
    // pairing itself uses, so the tile cannot disagree with the cards beside it.
    const body = fn("buildLevelCards");
    expect(body).toContain(
      "tops.some((child) => hasLevelBelow(type, child.path))"
    );
    expect(body).toContain('root.addClass("is-paired")');
    // NOT inside a query — mutation-checked by moving the rule into one.
    expect(enclosingQuery(".jld-grid.is-paired .jld-add-tile")).toBe("");
  });
});

describe("the strip collapses against the card it is in", () => {
  it("makes the card a query container", () => {
    // THE BUG THIS FIXES IS 4.3.1's, ONE LEVEL DOWN. `96-stat-strip.css`
    // collapses a four-cell strip at 480px measured against the nearest
    // container, which was `.journal-widget-block` — the whole section, never
    // that narrow on a desktop. A card is ~330px inside it, so four cells sat at
    // ~80px each and "AVG CONFIDENCE" rendered as "AVG CONFIDEN / CE" with its
    // value pushed onto a third line.
    //
    // No new rule was needed for the ordinary case: the shared query resolves
    // against whatever container is nearest, and this declaration is what makes
    // that the card.
    expect(cssRule(".jld-card")).toContain("container-type: inline-size");
    // And the shared rule still names no ancestor, which is what lets it serve
    // both. A selector scoped to the block here would have been the special case.
    expect(cssRule('.am-stats[data-cols="4"]')).toContain("grid-template-columns");
    expect(readCss()).not.toContain(".journal-widget-block .am-stats[data-cols");
  });

  it("collapses four cells earlier in a card than the shared rule does", () => {
    // What 480px misses is a block between about 480 and 530px: the grid has
    // dropped to one column, so the card is wider than the threshold and still
    // too narrow for four labels. 560px is the number the pair stacks at, for
    // the same reason — it is where two things stop fitting beside each other.
    expect(
      enclosingQuery('.jld-card-body .am-stats[data-cols="4"]')
    ).toContain("max-width: 560px");
  });

  it("gives the rating cell a label the width of the three beside it (4.38)", () => {
    // The query above buys the four cells room; this stops the fourth one needing
    // more than the others. "avg confidence" was the only label on either card
    // grid long enough to wrap in a 240px track, and it was also the only one of
    // the four that tried to say how it was computed — "notes", "last" and "open"
    // are one word each and none of them explains itself. `buildTopicStats` keeps
    // the "avg" because it is a wide hero strip that prints the /5 denominator
    // too; that is a different object and it is left alone deliberately.
    expect(fn("containerCard")).toContain("label: ratingWord(ratingDef)");
    // Comments stripped — the note above the declaration quotes the string it
    // replaced, which is exactly the trap 4.37 recorded: an absence assertion on
    // prose is defeated by the prose explaining the absence.
    expect(fn("containerCard")).not.toContain("`avg ${");
    // And the two grids agree, because a reader crosses from one to the other.
    expect(readSrc("journals-cards").replace(/\/\/.*$/gm, "")).toContain(
      "label: ratingWord(ratingDef)"
    );
  });
});

describe("the create control belongs to the surface, not to the card", () => {
  it("has no action row left on a card", () => {
    // The row carried an *Open* button beside a bare ＋, and both were answering
    // questions the card had already answered: the card's TITLE is the link that
    // opens it — 4.13.3's rule, and the reason `titleRender` exists — and a ＋ on
    // a card is ambiguous about what it adds, which is why it had to be a menu.
    const src = readSrc("tables");
    expect(src).not.toContain("jld-actions");
    expect(src).not.toContain("function containerActions(");
    // The rules go with the markup rather than being left for a later reader to
    // wonder about — 2.56.2's rule, and this file's own habit.
    expect(readCss()).not.toContain(".jld-actions");
  });

  it("closes the grid with a tile that makes what the grid lists", () => {
    // TWICE, AND COUNTING IS THE POINT. The grid has two exits — the empty
    // state and the populated one — and each has to close with the tile. A
    // `toContain` cannot tell them apart: mutation-checked by deleting the call
    // that closes the populated grid, which left the empty branch's identical
    // line to satisfy the assertion and passed.
    expect(calls(fn("buildLevelCards"), "addTile(plugin, type, folder, level.noun)")).toBe(2);
  });

  it("puts the list's control in a head and nothing in its body (4.37)", () => {
    // WHAT THIS REPLACES. 4.36.3 closed the children card's body with a dashed
    // row, and it cost one of the four rows `.jjs-card-body` allows — a card
    // holding two topics showed two topics and a control — on a body whose every
    // other row is a topic.
    //
    // THE HEAD IS THE PAIR'S AS OF 4.38, which moved the assertion rather than
    // weakening it: the ＋ was always adding a child of the CONTAINER — `folder`
    // here is that container, not this list — so putting it on the container's one
    // head is where it belonged all along. `containerHead` is the caller now.
    expect(fn("childrenCard")).not.toContain("addHeadButton");
    expect(fn("containerHead")).toContain(
      "addHeadButton(plugin, type, folder, below)"
    );
    // Nothing is appended to the body but rows. Mutation-checked: putting the
    // control back with `body.appendChild(...)` fails here.
    expect(fn("childrenCard")).not.toContain("body.appendChild(add");
    expect(readSrc("tables")).not.toContain("jld-add-row");
    expect(readCss()).not.toContain(".jld-add-row {");
    // AND THE SLOT WAS ALWAYS THERE. Both cards discarded `sectionFrame`'s return
    // value until 4.37, which is the whole reason the control had nowhere to go.
    expect(fn("containerHead")).toContain("const frame = sectionFrame(host, {");
  });

  it("gives the head control a label it draws and hides, not a bare glyph", () => {
    // A bare ＋ on a card head has the ambiguity that forced the OLD control to
    // be a menu — add what? — and a permanently labelled button spends the
    // title's width on a 330px card. So the label is rendered and collapsed.
    const body = fn("addHeadButton");
    expect(body).toContain('cls: "journal-btn-ghost jld-head-add"');
    expect(body).toContain('cls: "journal-btn-label"');
    // THE TOOLTIP IS NOT A NICETY HERE, IT IS THE ANSWER FOR EVERYONE WITHOUT A
    // HOVER — the same condition `50-entry-header.css` attaches to its own label
    // hiding. A keyboard, a screen reader and a touch device all read this.
    expect(body).toContain('"aria-label": label');
    expect(body).toContain("title: label");

    // Revealed by the CARD, not by the button: hovering a 20px square to find out
    // what it does is the discovery problem, not the answer to it.
    const shown = cssRule(
      ".jld-card:hover > .journal-sec .jld-head-add .journal-btn-label"
    );
    expect(shown).toContain("opacity: 1");
    // `max-width` and not `display`, because the point is that it OPENS — a
    // label toggled on `display` appears at full width in one frame, which reads
    // as a glitch rather than as a control answering.
    //
    // MUTATION-CHECKED, AND THE FIRST VERSION OF THIS DID NOT CATCH IT: asserting
    // only `max-width: 0` and `max-width` on the reveal passed with
    // `display: none` in place of `display: inline-block`, which satisfies both
    // and removes the label from layout entirely — there is nothing left to
    // transition. The laid-out box IS the mechanism, so it is what gets pinned.
    expect(shown).toContain("max-width");
    const rest = cssRule(".jld-head-add .journal-btn-label");
    expect(rest).toContain("max-width: 0");
    expect(rest).toContain("display: inline-block");
    expect(rest).toContain("transition:");
    // And on a device with no hover it is simply open, which is the plugin's own
    // rule — *"a control revealed by hover is a control that does not exist."*
    expect(enclosingMedia(".jld-head-add .journal-btn-label")).toContain("hover: none");
  });

  it("states both ＋ sizes rather than inheriting them (4.38)", () => {
    // THE HEAD ＋ WAS 12.24px AND NOTHING SAID SO: `.journal-btn-ghost` is
    // `--am-text-sm` (0.85em → 13.6px) and its icon rule is `0.9em` of that. Two
    // inherited multiplications, and the result was the smallest mark on the card
    // while being the tallest thing in its band. 15px is the title's cap height
    // beside it, so the control reads as belonging to the name.
    const head = cssRule(".jld-head-add.journal-btn-ghost .journal-btn-icon");
    expect(head).toContain("--jld-head-glyph: 15px");
    expect(head).toContain("width: var(--jld-head-glyph)");
    // THREE CLASSES, AND WITHOUT THE THIRD THIS RULE WOULD DO NOTHING.
    // `.journal-btn-ghost .journal-btn-icon` in 85-tracker-controls.css is two
    // classes, and 85 sorts AFTER 60 — so at equal specificity the shared rule wins.
    // Mutation-checked by dropping `.journal-btn-ghost` from the selector.
    const css = readCss();
    expect(css.indexOf(".jld-head-add.journal-btn-ghost .journal-btn-icon")).toBeLessThan(
      css.indexOf(".journal-btn-ghost .journal-btn-icon {")
    );
    // THE TILE'S GLYPH HAD NO RULE AT ALL — an unstyled span carrying whatever
    // `setIcon` left in it. Bigger than the head's on purpose: on an empty surface
    // the ＋ is the content, where in a head it is one control beside a title. Two
    // named values rather than two literals, so nobody "fixes" them into agreement.
    const tile = cssRule(".jld-add-icon");
    expect(tile).toContain("--jld-add-glyph: 20px");
    expect(tile).toContain("width: var(--jld-add-glyph)");
    expect(cssRule(".jld-add-icon svg")).toContain("width: 100%");
  });

  it("routes the top level to the entry point that accepts it", () => {
    // `newContainer` REFUSES `depth <= 0` — it exists to nest under a parent and
    // says so — and the grid on a journal dashboard is pointed at the journal
    // ROOT, whose `containerDepth` is -1. So the tile there is asking for depth
    // 0 and would have hit that refusal on every dashboard in every vault.
    const body = fn("addContainer");
    expect(body).toContain("depth <= 0");
    expect(body).toContain("newTopLevel(type)");
    expect(body).toContain("newContainer(type, depth, parent.name)");
  });

  it("reads as an empty slot, in the vocabulary a tracker already uses", () => {
    // A reader who has met "the dashed blank at the end is how you add one" once
    // should not have to learn a second way of being offered the same thing.
    const add = cssRule(".jld-add");
    expect(add).toContain("dashed");
    expect(add).toContain("background: transparent");
    expect(add).toContain("color: var(--text-muted)");
    const hover = cssRule(".jld-add:hover");
    expect(hover).toContain("border-color: var(--interactive-accent)");
    expect(hover).toContain("color: var(--text-normal)");
    // The same treatment the tracker bar's add cell carries, which is where the
    // vocabulary comes from.
    const tracker = cssRule(
      ".journal-tracker-bar .journal-tracker-cell.journal-tracker-add"
    );
    expect(tracker).toContain("dashed");
    expect(tracker).toContain("background: transparent");
  });

  it("gives the tile a card's height rather than a stub's", () => {
    // The tile is the slot a card would occupy, so it matches the cards beside
    // it — against the grid's `align-items: start`, which is what leaves a notch
    // of ground under a short control.
    expect(cssRule(".jld-add-tile")).toContain("align-self: stretch");
    expect(cssRule(".jld-grid")).toContain("align-items: start");
  });

  it("offers the tile in the empty state and stops citing a control elsewhere", () => {
    // A JOURNAL ON THE DAY IT IS MADE is the state this page is most often first
    // seen in, and the one where the tile is the only thing on the surface. The
    // callout used to send the reader to the Journals section for a control that
    // is now under their cursor.
    const body = fn("buildLevelCards");
    // The empty branch is the FIRST of the two — see the count above.
    const empty = body.slice(0, body.indexOf("for (const child of tops)"));
    expect(empty).toContain("addTile(plugin, type, folder, level.noun)");
    expect(body).not.toContain("from this journal's row in the Journals section");
    // One column there, because a callout is not a card and should not take a
    // 260px track with the control alongside it.
    expect(cssRule(".jld-grid.is-empty")).toContain("grid-template-columns");
  });

  it("stops the empty children card quoting a button that is gone", () => {
    // Prose that quotes a control breaks silently every time the control moves,
    // and this sentence had already been reworded once for that reason. The row
    // under it is the answer, so the sentence states the fact and stops.
    const body = fn("childrenCard");
    expect(body).not.toContain("beside this card");
    expect(body).toContain("jjs-empty-row");
  });
});

// The source of one top-level function, by name. The suite scrapes `tables.ts`
// in several places and the previous spelling sliced to the name of the NEXT
// function — which silently became `slice(at, -1)`, the whole rest of the file,
// the moment that next function was deleted. A test that cannot fail is worse
// than no test, so the end is found structurally instead.
/**
 * Which `@media` block a selector's last rule sits inside, or "".
 *
 * `enclosingQuery`'s twin, and separate rather than parameterised because the two
 * are asking different questions: a container query is a fact about the WIDGET's
 * width and a media query is a fact about the DEVICE. `hover: none` is genuinely
 * the second kind — it is not a size — which is the one case in this file where
 * `@media` is right and `@container` would be wrong.
 */
function enclosingMedia(selector: string): string {
  const css = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks: { head: string; from: number; to: number }[] = [];
  for (let i = css.indexOf("@media"); i >= 0; i = css.indexOf("@media", i + 1)) {
    const open = css.indexOf("{", i);
    if (open < 0) continue;
    let depth = 1;
    let j = open + 1;
    for (; j < css.length && depth > 0; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
    }
    blocks.push({ head: css.slice(i, open).trim(), from: open, to: j });
  }
  const at = css.lastIndexOf(`${selector} {`);
  if (at < 0) return "";
  const inside = blocks.filter((b) => at > b.from && at < b.to);
  return inside.length ? inside[inside.length - 1].head : "";
}

/** How many times `needle` appears in `body` — for assertions about EXITS. */
function calls(body: string, needle: string): number {
  return body.split(needle).length - 1;
}

function fn(name: string): string {
  // COMMENTS COME OFF FIRST, and this file is the reason the idiom is written
  // down. `childrenCard`'s comment QUOTES the sentence it replaced — *"add one
  // with the ＋ beside this card"* — so the assertion that the wording is gone
  // was failing on the note explaining that it had gone.
  const src = readSrc("tables")
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("//"))
    .join("\n");
  const at = src.indexOf(`function ${name}(`);
  if (at < 0) throw new Error(`no function ${name} in tables.ts`);
  // Top-level declarations start in column 0, so the next line matching that is
  // the end of this one — `const`/`function`/`export` alike.
  const end = src.slice(at).search(/\n(?:export |function |const )/);
  return end < 0 ? src.slice(at) : src.slice(at, at + end);
}

// Whether a selector's rule is written inside a `@container` block, and which.
//
// `cssRule` RETURNS DECLARATIONS AND SAYS NOTHING ABOUT WHAT ENCLOSES THEM,
// which is right for every other reader and is exactly the fact this one case is
// about: the rule that stacks a pair has to answer to the BLOCK, and a rewrite
// into `@media` would leave the declarations identical.
function enclosingQuery(selector: string): string {
  // COMMENTS COME OFF FIRST, which is this repository's documented idiom for
  // scraping and is load-bearing here rather than tidy: `05-inline-widgets.css`
  // QUOTES a `@container (max-width: 520px) { flex-direction: column }` inside
  // a comment, so both the search for the query and the brace counting below
  // would otherwise read prose as structure.
  const css = readCss().replace(/\/\*[\s\S]*?\*\//g, "");

  // Every `@container` block, with the extent its braces actually cover. The
  // previous spelling took the nearest `@container` BEFORE the selector without
  // checking that its block was still open, which reports a query for a rule
  // that merely follows one.
  const blocks: { head: string; from: number; to: number }[] = [];
  for (let i = css.indexOf("@container"); i >= 0; i = css.indexOf("@container", i + 1)) {
    const open = css.indexOf("{", i);
    if (open < 0) continue;
    let depth = 1;
    let j = open + 1;
    for (; j < css.length && depth > 0; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") depth--;
    }
    blocks.push({ head: css.slice(i, open).trim(), from: open, to: j });
  }

  // The LAST rule with this selector. Where there is a base rule as well it
  // comes first and sits outside every query, which is the case this helper was
  // written for; where there is only the one, it is the one asked about.
  const at = css.lastIndexOf(`${selector} {`);
  if (at < 0) return "";
  const inside = blocks.filter((b) => at > b.from && at < b.to);
  return inside.length ? inside[inside.length - 1].head : "";
}
