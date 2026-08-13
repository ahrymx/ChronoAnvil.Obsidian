// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// One card per journal — 4.2 §1, the frame only.
//
// WHAT IS ASSERTED HERE. The suite has no DOM, so what can be pinned is the
// two decisions that will be argued with later and the CSS shape the layout
// depends on: that this is an ARGUMENT rather than a second keyword, and that
// nothing is drawn that cannot do its job. The pure parts — the hue and the
// banner source — are exercised directly.

import { describe, expect, it } from "vitest";
import { hueOf } from "../src/journals/journals-cards";
import { readCss, readSrc } from "./sources";

describe("the grid is an arrangement, not a second widget", () => {
  it("is reached through the journals keyword's argument", () => {
    // 4.1 §3 refuses a `widget:` namespace because one idea gets one name, and
    // this is the same idea — every journal, drawn — in a second arrangement.
    // The grammar's `keyword[:argument]` slot is what an arrangement goes in.
    const widgets = readSrc("widgets");
    expect(widgets).toContain('if (rest === "cards")');
    // And no second keyword appeared beside it.
    expect(widgets).not.toContain('case "journal-cards"');
    expect(widgets).not.toContain('case "journals-cards"');
  });

  it("refuses an unknown argument rather than falling back", () => {
    // `journals:card` singular quietly drawing the list is the near-miss
    // nobody debugs: it reads as the feature not working rather than as the
    // word being wrong. Returning null reaches the dispatcher's own unknown-
    // widget notice, which names the line it could not read.
    const widgets = readSrc("widgets");
    const at = widgets.indexOf('case "journals":');
    const arm = widgets.slice(at, widgets.indexOf("case ", at + 10));
    expect(arm).toContain("if (rest) return null;");
    // The bare form still works, which is the half a refusal could break.
    expect(arm).toContain("buildJournalsRegion(this.plugin, ctx)");
  });

  it("shares one section title with the keyword it belongs to", () => {
    // `frame: section` reads SECTION_TITLES off the KEYWORD. A second entry
    // would be a second name for one section, and the arrangement is not what
    // a title bar should announce.
    const widgets = readSrc("widgets");
    expect(widgets).toContain('journals: "📚 Journals"');
    expect(widgets).not.toContain('"journals:cards":');
  });
});

describe("nothing dead is drawn", () => {
  const src = readSrc("journals-cards");

  it("draws only actions that resolve to something", () => {
    // THE RULE THAT SHAPED WHAT "just the frame" COULD INCLUDE. The reference
    // design has four action glyphs per card; this has two, because two are
    // all that reach a behaviour today. 4.1 §6.2 states it for the mobile
    // launcher — "a control that cannot do its job should not be drawn" — and
    // it is not a rule about mobile.
    //
    // Every `action(` call must pass a handler that calls something. Asserted
    // by counting rather than by reading the names, so a third glyph added
    // without a behaviour fails here.
    const calls = src.match(/\n {2}action\(actions,/g) ?? [];
    expect(calls.length).toBe(2);
    expect(src).toContain("openIndex(plugin, type)");
    expect(src).toContain("plugin.journals.newTopLevel(type)");
  });

  it("has no disabled or placeholder control", () => {
    // The shapes a deferred control usually arrives as.
    expect(src).not.toContain("disabled");
    expect(src).not.toContain("is-placeholder");
    expect(src).not.toContain("TODO");
  });

  it("says what will appear and how, when there are no journals", () => {
    // `empty.ts`'s rule. `emptyCallout` REPLACES content, which is this case —
    // there is no grid to draw and the callout stands in for it.
    expect(src).toContain("emptyCallout(");
    expect(src).toContain("Settings → Almanac → Journals");
  });
});

describe("a card's ground is derived, not configured", () => {
  it("reads the banner off the journal's own index note", () => {
    // 4.1 §2.5: a derived value follows a rename and a configured one goes
    // stale. A journal's index note moves with its folder for free, and
    // `banner:` in frontmatter is the convention Obsidian banner plugins
    // already read — so a reader who has one gets it with no new setting.
    const src = readSrc("journals-cards");
    // SCOPED TO `bannerOf`'s BODY. This asserted the call appeared anywhere in
    // the module and did not bite when mutated, because `folderNotePath(type
    // .root)` is also how the title links and how `openIndex` resolves — three
    // uses, and the test was pinning whichever it found first.
    const at = src.indexOf("export function bannerOf(");
    expect(at, "bannerOf is gone").toBeGreaterThan(-1);
    const body = src.slice(at, src.indexOf("\n}", at));
    expect(body).toContain("folderNotePath(type.root)");
    expect(body).toContain("fm.banner");
    expect(body).toContain("metadataCache");
    // And §11's refusal of new settings keys survives.
    expect(src).not.toContain("settings.journalBanner");
  });

  it("gives a journal the same hue every time", () => {
    // DERIVED FROM THE ID, NOT ASSIGNED. Two journals must not swap colours
    // when a third is added or one is renamed — which an assigned palette
    // index does, and which is the same argument `foldKey` makes for keying on
    // the id rather than the position.
    expect(hueOf("study")).toBe(hueOf("study"));
    expect(hueOf("cooking")).not.toBe(hueOf("study"));
    // In range for `hsl()`, for every input including the degenerate one.
    for (const id of ["study", "cooking", "", "a", "a-very-long-journal-id"]) {
      expect(hueOf(id), id).toBeGreaterThanOrEqual(0);
      expect(hueOf(id), id).toBeLessThan(360);
    }
  });

  it("does not shift when an unrelated journal is renamed", () => {
    // The property the test above is really about, stated as the scenario it
    // protects: one journal's colour is a fact about that journal.
    const before = ["study", "cooking", "fitness"].map(hueOf);
    const after = ["study", "gardening", "fitness"].map(hueOf);
    expect(after[0]).toBe(before[0]);
    expect(after[2]).toBe(before[2]);
  });
});

describe("the grid answers to the widget's width", () => {
  const rules = readCss().replace(/\/\*[\s\S]*?\*\//g, "");

  it("sizes its columns off the container, not the viewport", () => {
    // `.journal-widget-block` establishes `container-type: inline-size`, so an
    // intrinsic track sizes to the PANE, the canvas node or the tile. A media
    // query here would answer to the window, which is the thing 4.1 §1's
    // two-node-width test was built to catch.
    const at = rules.indexOf(".jjc-grid {");
    expect(at, "no .jjc-grid rule").toBeGreaterThan(-1);
    const rule = rules.slice(at, rules.indexOf("}", at));
    expect(rule).toContain("auto-fill");
    expect(rule).toContain("minmax(");
  });

  it("gives every card in a row one height", () => {
    // A banner with an aspect-ratio grows with the column and leaves the
    // titles in a row at different heights, which is what stops a grid reading
    // as a grid. A fixed height is the whole reason this is stated.
    const at = rules.indexOf(".jjc-banner {");
    const rule = rules.slice(at, rules.indexOf("}", at));
    expect(rule).toMatch(/height:\s*\d+px/);
    expect(rule).not.toContain("aspect-ratio");
  });

  it("is not swept into the unframed reset", () => {
    // 4.1.2's list is for a card a widget draws as its own FRAME, which the
    // block's frame should replace. Here the cards ARE the content — a grid
    // with its cards flattened is a list, not an unframed grid. Pinned because
    // the list is the one thing in §5's shape that has to be kept in step, and
    // the obvious next edit is to add every card class to it.
    expect(rules).not.toContain(".journal-widget-block.is-unframed .jjc-card");
  });

  it("matches the border weight of the cards beside it", () => {
    // `--am-rule` is 2px and is for a RULE — a divider between bands. A card's
    // outline is 1px here, as `.journals-card` forty lines up already is.
    const at = rules.indexOf(".jjc-card {");
    const rule = rules.slice(at, rules.indexOf("}", at));
    expect(rule).toContain("border: 1px solid");
  });
});

// ── The journals list, as subject cards (4.13.3) ─────────────────────────
//
// The third arrangement in three releases, and the third is the maintainer's
// choice off a mockup rather than a reading of a screenshot: one card per
// TOP-LEVEL layer — a Study Subject, a Cooking Cuisine — with its children as
// lines inside it and no card of their own.
//
// 4.13.2's table is what it replaces, so the assertions that pinned the table
// are retargeted rather than deleted: what a topic row says is unchanged, and
// where it says it is not.

describe("a subject is a card", () => {
  const src = () => readSrc("journals-section");
  const code = () => src().replace(/\/\/.*$/gm, "");

  it("lays its subjects in a grid that answers to the widget", () => {
    // Bars are full-width by nature and cards are not: four cards in a column
    // would each waste two-thirds of a wide page. `auto-fill` with a min track
    // rather than a media query, because the column count has to answer to the
    // PANE — or the canvas node, or the row cell — which is what
    // `container-type: inline-size` makes askable and what 4.3.1 established a
    // breakpoint on the block cannot describe.
    expect(code()).toContain('createDiv({ cls: "jjs-grid" })');
    const css = readCss();
    const at = css.indexOf("\n.jjs-grid {");
    expect(at, "no .jjs-grid rule").toBeGreaterThan(0);
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toContain("auto-fill");
    expect(rule).toContain("minmax(");
    expect(css.slice(at, css.indexOf("}", at))).not.toContain("@media");
  });

  it("keeps the section frame for its head, and restates none of it", () => {
    // THE WHOLE REASON THIS IS CHEAP. The chosen mockup's head is a recessed
    // band with a glyph in a fixed slot and a name in small caps at
    // `--am-bar-text` — which is what a level-2 `sectionFrame` bar has been
    // since 4.13 §1. The card adds a ground and an edge; the title, its
    // truncation, its glyph slot and its link are the frame's.
    expect(code()).toContain("sectionFrame(card, {");
    expect(code()).toContain("level: 2");
    const css = readCss();
    const at = css.indexOf("\n.jjs-card > .journal-sec {");
    expect(at, "no banded head rule").toBeGreaterThan(0);
    const head = css.slice(at, css.indexOf("}", at));
    expect(head).toContain("background: var(--background-secondary)");
    expect(head).toContain("border-bottom: 1px solid");
    // And it restates no type property — those come from the frame.
    expect(head).not.toContain("text-transform");
    expect(head).not.toContain("font-size");
  });

  it("lets the name read in the bar's own ink rather than overriding it", () => {
    // The link sat inside `.journal-header-title` overriding the INK to
    // `--text-normal`, which is what made a subject read as bold text in a bar
    // instead of as the bar's title. Variant B is that override removed.
    const css = readCss();
    const at = css.indexOf("\n.jjs-group-name {");
    expect(at).toBeGreaterThan(0);
    expect(css.slice(at, css.indexOf("}", at))).toContain(
      "color: var(--am-bar-ink)"
    );
  });

  it("draws a card on the quieter ground, under the section that holds it", () => {
    // 4.9 §2.2's rule for the row group, one family over: a card inside a card
    // reads as deliberate only if the inner one is the quieter. The section card
    // is `--background-secondary`; these sit on the page's alt ground inside it.
    const css = readCss();
    const at = css.indexOf("\n.jjs-card {");
    expect(at).toBeGreaterThan(0);
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toContain("background: var(--background-primary-alt)");
    expect(rule).toContain("border: 1px solid");
    // The head bleeds by the card's own clip rather than by negative margins —
    // the manoeuvre every other band in this project makes by hand.
    expect(rule).toContain("overflow: hidden");
  });

  it("says the same two things about a child that the table said", () => {
    // The ARRANGEMENT changed and the reading did not: when a note under it was
    // last dated, and what is open beneath it. Per-kind counts and an average
    // rating were refused for the table and a card does not revive them.
    expect(code()).toContain("folderActivity(plugin.app, sub.path)");
    expect(code()).toContain("relativeActivity(lastActive)");
    expect(code()).toContain("sumBodyTasks(");
    expect(code()).toContain("if (!openCell.isConnected) return;");
    // And the numbers still come from `topics-table`'s own helper, which is the
    // half of 4.13.2 that had to survive the redesign: a subject's dashboard and
    // this card must not hold two opinions about when a topic was last worked.
    const tables = readSrc("tables");
    expect(tables).toContain("export function folderActivity(");
    // `buildTopicsTable` BECAME `folderRollup` IN 4.16 §1 — same arithmetic, same
    // helper, taking the folder it describes instead of reading the note it was
    // rendered in. The shared-helper rule this pins is untouched by that; the
    // name it was anchored on was not.
    const at = tables.indexOf("export function folderRollup(");
    expect(at, "the folder rollup").toBeGreaterThan(0);
    expect(tables.slice(at)).toContain("folderActivity(app, tf.path)");
  });

  it("gives the record list back, because a card is not a table", () => {
    // 4.13.2 exported `recordList` for the table; a card has no heading strip —
    // that was the rejected variant, whose difficulty was the column key
    // repeating once per card — and table roles over three rows with no header
    // describe a table that is not there. The three callers left are all inside
    // tables.ts again.
    expect(code()).not.toContain("recordList");
    expect(code()).not.toContain("recordCell");
    const tables = readSrc("tables");
    expect(tables).not.toContain("export function recordList(");
    expect(tables).not.toContain("export function recordCell(");
  });

  it("draws every child and scrolls, rather than capping the list", () => {
    // A card cannot fold, and 4.13.3 answered that by showing eight and linking
    // the rest to the subject's own note. 4.13.4 answers it without hiding
    // anything: the body is a stated height and a long list scrolls inside it.
    expect(code()).toContain("for (const sub of subs) topicRow(");
    expect(code()).not.toContain("TOPICS_SHOWN");
    // Comments stripped — the rule that replaced those names them, and that
    // account is worth more than the assertion's convenience.
    expect(readCss().replace(/\/\*[\s\S]*?\*\//g, "")).not.toContain(
      ".jjs-card-more"
    );
  });

  it("states the height as four rows, and lets the body scroll", () => {
    // FOUR LINES PLUS THE BAR, whatever a card holds. The arithmetic is written
    // out in the rule rather than pre-multiplied, so the four is visible in the
    // place a reader would go looking for it.
    const css = readCss();
    const at = css.indexOf("\n.jjs-card-body {");
    expect(at, "no card body rule").toBeGreaterThan(0);
    const body = css.slice(at, css.indexOf("}", at));
    expect(body).toContain("--jjs-rows: 4");
    expect(body).toContain("height: calc(");
    expect(body).toContain("var(--jjs-row-h) * var(--jjs-rows)");
    expect(body).toContain("overflow-y: auto");
    // `border-box`, because Obsidian sets it per component rather than globally
    // — the trap `.jjh-stat` already records — and the padding is inside the
    // stated height.
    expect(body).toContain("box-sizing: border-box");
  });

  it("stops a row sizing or shrinking itself, which is what makes four countable", () => {
    // Two halves of one thing. The row's height is STATED, on `.cal-week`'s
    // precedent: a box whose height comes from its content cannot be counted.
    // And it does not shrink — the body is a flex column with a fixed height, so
    // without `flex: 0 0 auto` the rows would divide that height between them
    // instead of overflowing it, and the scroll would never happen.
    // Comments stripped BEFORE the slice: two of the declarations here are
    // explained in place, and one of those explanations contains the word this
    // rule must not declare.
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    const at = css.indexOf("\n.jjs-card-row {");
    expect(at).toBeGreaterThan(0);
    const row = css.slice(at, css.indexOf("}", at));
    expect(row).toContain("height: var(--jjs-row-h)");
    expect(row).toContain("flex: 0 0 auto");
    expect(row).not.toContain("padding");
    // And a long name ellipses rather than wrapping, or it would push its own
    // row past the stated height and the count would stop being true.
    const linkAt = css.indexOf(".jjs-card-row .jjs-row-link {");
    expect(linkAt, "no ellipsis rule").toBeGreaterThan(0);
    const link = css.slice(linkAt, css.indexOf("}", linkAt));
    expect(link).toContain("text-overflow: ellipsis");
    expect(link).toContain("white-space: nowrap");
    expect(link).toContain("min-width: 0");
  });

  it("draws nothing but a head on a flat journal's card", () => {
    // 4.13.4. `primaryKindButton` put one `+ {kind}` on every card of a
    // single-layer journal, which is 2.51's own complaint — a button repeated
    // down a column while the thing that varies is the short bit on the left —
    // reappearing at one per card. The create path is not lost: the JOURNAL's
    // bar carries `+ {top level}`, and the note-level action survives in the
    // command palette, in `button:<type>:new-<kind>`, and on the container's own
    // index.
    expect(code()).not.toContain("primaryKindButton");
    expect(code()).not.toContain("addButtons(frame.actions, primaryKind");
    // The type's own two buttons stay, which is the half that must not go with
    // it — `addButtons` has exactly one caller and it is the journal's bar.
    //
    // COUNTED WITHOUT ANCHORING ON INDENTATION, which is how the first version
    // of this assertion let a mutation through: it matched `\n  addButtons(`,
    // and a second call added one level deeper simply did not match. Two
    // occurrences in the module — the definition and the one call — and the
    // definition is on its own line so the arithmetic is stable.
    const uses = code().match(/addButtons\(/g) ?? [];
    expect(uses.length, "addButtons gained or lost a caller").toBe(2);
    expect(code()).toContain("function addButtons(");
    expect(code()).toContain("addButtons(frame.actions, specs);");
  });

  it("folds the journal and no longer folds the subject", () => {
    // The trade the maintainer took with this shape. A reader's existing subject
    // fold keys stay in `collapsedNoteSections`, unread and unmigrated: the map
    // is per note and per id, so a stale entry costs nothing and rewriting a
    // reader's settings to tidy ours is the worse trade.
    // `makeFoldable(plugin` matches a CALL and never the definition, whose own
    // parameter list starts on the next line. Not anchored on indentation: that
    // is what let a mutation past this file's `addButtons` count.
    const calls = code().match(/makeFoldable\(plugin/g) ?? [];
    expect(calls.length).toBe(1);
    // Comments stripped: two paragraphs record that a subject used to fold and
    // why the selector for it is deliberately absent, and that account is worth
    // more than the assertion's convenience.
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toContain(".jjs-group.is-collapsed");
    expect(css).toContain(".jjs-type.is-collapsed");
  });

  it("counts nothing on either bar", () => {
    // "1 subject" over a list of one subject, and "1 topic" over the topic that
    // follows it: a tally of rows already on the screen.
    expect(code()).not.toContain("note: countLabel");
    // `countLabel` itself survives with one caller — a CARD in `journals:cards`
    // says "4 subjects" about a list it does not show, which is a reading rather
    // than a tally.
    expect(readSrc("journals-cards")).toContain("countLabel(");
  });

  it("leaves the search result row alone, which shares the class name", () => {
    // `.jjs-row` is built by TWO modules for two unrelated objects, and only the
    // topic row's rules were the journals card's to delete. This is the
    // substring trap this project keeps writing down, in class-name form.
    expect(readSrc("journal-search")).toContain('cls: "jjs-row"');
    expect(readCss()).toContain(".jjs-row {");
    // Comments stripped — the paragraphs that replaced those rules name them.
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toContain(".jjs-row-name");
    // What stayed: the link, which a card's line still wears.
    expect(code()).toContain('"jjs-row-link"');
  });
});

// ── The banner (4.13.2 §3) ────────────────────────────────────────────────

describe("the journals banner is the last band to lose its wash", () => {
  const body = (sel: string): string => {
    const css = readCss();
    const at = css.indexOf(`\n${sel} {`);
    expect(at, `no rule for ${sel}`).toBeGreaterThan(0);
    return css.slice(at, css.indexOf("}", at));
  };

  it("paints no accent under the band, on either surface it is drawn", () => {
    // `.jjs-hero` is the band inside the card; `.jjh-root` is the same widget
    // rendered bare by the `journals-header` directive. They washed at the same
    // 0.07 and must stop together, or the standalone one becomes the last tinted
    // object in the plugin by omission.
    for (const sel of [".jjs-hero", ".jjh-root"]) {
      expect(body(sel), sel).not.toContain("--interactive-accent-rgb");
    }
    // The hairline that divides the band from the list stays: with no fill it is
    // the only thing left saying where the band ends.
    expect(body(".jjs-hero")).toContain("border-bottom: 1px solid");
  });

  it("draws its four numbers as a band rather than a box", () => {
    // A bordered, rounded, filled rectangle with four internally ruled cells is
    // a card inside a card — the argument `.jdh-stats` made in 2.51.2 before it
    // was deleted, applied to the twin that outlived it.
    const stats = body(".jjh-stats");
    expect(stats).not.toContain("border: 1px solid");
    expect(stats).not.toContain("background:");
    expect(stats).toContain("border-top: 1px solid");
    // And the rules between the cells went with the box.
    expect(readCss()).not.toContain(".jjh-stat + .jjh-stat");
  });
});

// ── The heatmap fills the pane (4.13.3) ───────────────────────────────────

describe("the activity strip is sized by its container", () => {
  it("asks for a floor and a fraction, in one expression used by both grids", () => {
    // 53 fixed 10px columns is about 660px, and the journals dashboard is wider
    // than that — so the band's strip sat in the left two-thirds of the card
    // with a scrollbar under a year that had room to be drawn whole.
    // `minmax(floor, 1fr)` keeps both behaviours without a measurement: a narrow
    // pane is unchanged and still scrolls, a wide one shares out the surplus.
    const src = readSrc("journals-header");
    expect(src).toContain(
      "`repeat(${STRIP_WEEKS}, minmax(var(--jjh-cell), 1fr))`"
    );
    // ONE EXPRESSION, TWO GRIDS. The caption row's own comment insists the two
    // agree about their tracks or every label drifts off the week it names; a
    // second literal is how they would come to disagree.
    expect(src).toContain("months.style.gridTemplateColumns = tracks;");
    expect(src).toContain("grid.style.gridTemplateColumns = tracks;");
    // And no resize listener came with it — the thing this project keeps
    // refusing, because intrinsic sizing answers to the widget's width and a
    // window listener cannot see it.
    expect(src).not.toContain("addEventListener(\"resize\"");
  });

  it("lets a cell take its height from the column it landed in", () => {
    // With the columns free to grow, a fixed row height makes every cell a
    // landscape rectangle: a year of days has to stay a grid of squares.
    const css = readCss();
    const at = css.indexOf("\n.jjh-strip {");
    expect(at).toBeGreaterThan(0);
    const strip = css.slice(at, css.indexOf("}", at));
    expect(strip).toContain("grid-template-rows: repeat(7, auto)");
    // `max-content` was what stopped the fractions resolving: a fraction needs a
    // definite width to be a fraction OF.
    expect(strip).not.toContain("width: max-content");
    const cellAt = css.indexOf("\n.jjh-strip .jjh-cell {");
    expect(cellAt, "no scoped cell rule").toBeGreaterThan(0);
    expect(css.slice(cellAt, css.indexOf("}", cellAt))).toContain(
      "aspect-ratio: 1"
    );
  });

  it("leaves the legend swatches at a fixed size", () => {
    // `.jjh-cell` is also five swatches under the strip, in a flex row with
    // nothing to stretch to. A legend swatch is a KEY to the sizes in the grid
    // rather than one of them, which is why the fluid rule is scoped and the
    // bare one still states both dimensions.
    const css = readCss();
    const at = css.indexOf("\n.jjh-cell {");
    expect(at).toBeGreaterThan(0);
    const bare = css.slice(at, css.indexOf("}", at));
    expect(bare).toContain("width: var(--jjh-cell)");
    expect(bare).toContain("height: var(--jjh-cell)");
    expect(readSrc("journals-header")).toContain('cls: "jjh-cell is-empty"');
  });
});
