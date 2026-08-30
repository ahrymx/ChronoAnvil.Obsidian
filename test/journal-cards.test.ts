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
import {
  buildJournalType,
  hueOf,
  JOURNAL_PRESETS,
  JournalManager,
} from "../src/journals/journal";
import { cardStatChoices } from "../src/journals/journals-cards";
import { kindPlural } from "../src/journals/journal-sections";
import { scopesForMeasure } from "../src/journals/stats-band";
import { cssRule, cssRules, readCode, readCss, readSrc } from "./sources";

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
    // ── AND IN 4.38 THE COUNT IS ZERO, WHICH STRENGTHENS THE RULE ──────────
    //
    // This counted `action(actions, …)` calls and required exactly two. Both are
    // gone, and not because they stopped resolving: they resolved to controls the
    // card ALREADY HAD. *Open* is what the title link does, and ＋ is the ⋯ menu's
    // second entry — so the card drew three controls for two actions, which is the
    // duplication 4.36.3 deleted from the level cards for the same reason.
    //
    // The rule this suite is named for is about drawing nothing dead; a duplicate is
    // a stricter case of the same thing, so the assertion inverts rather than
    // relaxing. `action` went with its callers.
    expect(src).not.toContain("action(actions,");
    expect(src).not.toContain("function action(");
    expect(src).toContain("`action` STOOD HERE AND IS DELETED WITH ITS ROW");
    // BOTH BEHAVIOURS SURVIVE, on the one control that was not a duplicate. Losing
    // them with the row is the mutation that matters here.
    expect(src).toContain("openIndex(plugin, type)");
    expect(src).toContain("plugin.journals.newTopLevel(type)");
    expect(src).toContain('overflowButton(banner, "ca-jjc-menu"');
    // And the row's own rules went too, or a class nothing builds keeps its styling.
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toContain(".jjc-actions");
    expect(css).not.toContain(".jjc-action ");
  });

  it("has no disabled or placeholder control", () => {
    // The shapes a deferred control usually arrives as.
    expect(src).not.toContain("disabled");
    expect(src).not.toContain("is-placeholder");
    expect(src).not.toContain("TODO");
  });

  it("draws the New journal tile when there are no journals", () => {
    // A vault without any journals draws the grid ending in the New journal tile
    // rather than replacing it with an empty callout, so the creation affordance
    // is always available directly on the homepage.
    expect(src).toContain('cls: "ca-jld-add ca-jld-add-tile ca-jjc-add"');
    expect(src).toContain("plugin.openJournalSettings();");
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

  it("separates the ids the PRESETS ACTUALLY HAVE (4.42.1)", () => {
    // ── THE TEST THIS REPLACES MEASURED AN ID NO VAULT HAS ───────────────
    //
    // 4.42 asserted a >40° separation across `["study", "projects", "exercise",
    // "media"]` and passed. **The preset's id is `exercise-diet`.** On the real
    // four, the stride it introduced put Projects at 278° and Exercise & Diet at
    // 261° — 17° apart, where the un-stepped sums had been 26°. The change made
    // the shipped vault worse and its test said it was fine, because the test was
    // measuring a journal that does not exist.
    //
    // SO THE IDS COME FROM THE PRESETS THEMSELVES, not from a literal beside the
    // assertion. A fixture that restates a value the source already holds can
    // only ever be checked against the fixture.
    const ids = JOURNAL_PRESETS.map((p) => p.id);
    expect(ids, "the presets are what a new vault gets").toContain("exercise-diet");
    const apart = (a: number, b: number): number => {
      const d = Math.abs(a - b) % 360;
      return Math.min(d, 360 - d);
    };
    const hues = ids.map(hueOf);
    for (let i = 0; i < hues.length; i++) {
      for (let j = i + 1; j < hues.length; j++) {
        expect(
          apart(hues[i], hues[j]),
          `${ids[i]} ${hues[i]}° vs ${ids[j]} ${hues[j]}°`
        ).toBeGreaterThan(40);
      }
    }
  });

  it("is fitted to those four, and says so", () => {
    // THE HONEST LIMIT OF WHAT THE TEST ABOVE PROVES. The stride was chosen by
    // trying every coprime value against the four real ids and taking the best —
    // so a green suite means *these four are arranged well*, not that a hash
    // guarantees separation. It cannot: two arbitrary ids can always land close.
    // Recorded here so the next reader does not mistake the assertion for one.
    expect(readSrc("journal")).toContain("A hash cannot promise separation");
  });

  it("still reaches every hue, so the spread costs no colours", () => {
    // COPRIME IS THE PART THAT IS NOT FITTED TO THE FOUR IDS. Any stride sharing
    // a factor with 360 visits only 360/gcd hues and collides in cycles — 138
    // would reach sixty. 59 is prime, so the map is a BIJECTION: every hue stays
    // reachable and no two sums are pushed onto one that were not already equal.
    //
    // ASSERTED THROUGH THE PUBLIC FUNCTION AND NOT ON THE CONSTANT, which is the
    // point — the stride was changed once already, and a test naming the number
    // would have had to change with it while proving nothing about the property.
    // Single characters have distinct sums by construction, so distinct hues are
    // exactly what coprimality buys.
    const seen = new Set<number>();
    for (let c = 1; c <= 200; c++) seen.add(hueOf(String.fromCharCode(c)));
    // 200 distinct sums must give 200 distinct hues; any shared factor with 360
    // would collapse them.
    expect(seen.size).toBe(200);
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
    // `.ca-journal-widget-block` establishes `container-type: inline-size`, so an
    // intrinsic track sizes to the PANE, the canvas node or the tile. A media
    // query here would answer to the window, which is the thing 4.1 §1's
    // two-node-width test was built to catch.
    const at = rules.indexOf(".ca-jjc-grid {");
    expect(at, "no .ca-jjc-grid rule").toBeGreaterThan(-1);
    const rule = rules.slice(at, rules.indexOf("}", at));
    expect(rule).toContain("auto-fill");
    expect(rule).toContain("minmax(");
  });

  it("gives every card in a row one height", () => {
    // A banner with an aspect-ratio grows with the column and leaves the
    // titles in a row at different heights, which is what stops a grid reading
    // as a grid. A fixed height is the whole reason this is stated.
    const at = rules.indexOf(".ca-jjc-banner {");
    const rule = rules.slice(at, rules.indexOf("}", at));
    expect(rule).toMatch(/height:\s*\d+px/);
    expect(rule).not.toContain("aspect-ratio");
  });

  it("ends every card in a row on one line, not where its content stopped (4.38)", () => {
    // A FIXED BANNER WAS NOT ENOUGH, which is why this is a second assertion
    // rather than an edit to the one above. Measured on the render: Study's card
    // was 15px taller than Media's beside it, and the banners were identical —
    // Study declares a rating, its fourth cell's label wrapped to a second line,
    // and `align-items: start` let the card end there. So one label's length was
    // deciding a row's alignment.
    const at = rules.indexOf(".ca-jjc-grid {");
    const rule = rules.slice(at, rules.indexOf("}", at));
    expect(rule).toContain("align-items: stretch");
    // AND THE SLACK HAS SOMEWHERE TO GO, which is what makes `stretch` safe here
    // and would not make it safe on an arbitrary grid: the card is a column
    // flexbox and its BODY takes the growth, so a stretched card gains empty
    // space under its strip rather than stretching its banner or its head.
    const card = rules.slice(rules.indexOf(".ca-jjc-card {"));
    expect(card.slice(0, card.indexOf("}"))).toContain("flex-direction: column");
    const body = rules.slice(rules.indexOf(".ca-jjc-body {"));
    expect(body.slice(0, body.indexOf("}"))).toContain("flex: 1 1 auto");
  });

  it("pitches the title as a link, not as a control (4.38)", () => {
    // BOTH ARE PURPLE AND THEY ARE NOT THE SAME PURPLE. Sampled off the render:
    // `--interactive-accent` is #8a5cf5, the FILL of a primary button and of a
    // selected day; `--text-accent` is #a68af9, what Obsidian paints an internal
    // link. This title opens the journal's folder note — it is a link — so the
    // card was the one place that gesture was pitched as a button.
    const at = rules.indexOf(".ca-jjc-title {");
    const rule = rules.slice(at, rules.indexOf("}", at));
    expect(rule).toContain("color: var(--text-accent)");
    expect(rule).not.toContain("--interactive-accent");
    // THE PRECEDENT IS THE BREADCRUMB, and this assertion is here because the
    // first version of it named the journals-section titles instead and FAILED —
    // `.ca-jjs-group-name` is `--ca-bar-ink` and `.ca-jjs-row-link` is `--text-normal`.
    // The crumb pill is the plugin's other link to a container's folder note,
    // which is the same gesture rather than merely the same neighbourhood.
    //
    // `cssRule` AND NOT AN indexOf SLICE, which is how this was first written and
    // why it failed a second time: `30-header-bars.css` states that selector
    // TWICE — :613 makes the trail `--text-faint !important` and :650 overrides it
    // to `--text-accent !important` — so a slice from the first `{` reads the
    // loser. `cssRule` joins every rule with the selector, and the later one wins
    // the cascade because both carry `!important` and both are in one file.
    expect(cssRule(".ca-jsh-crumbs a.ca-jn-pill")).toContain("var(--text-accent)");
  });

  it("is not swept into the unframed reset", () => {
    // 4.1.2's list is for a card a widget draws as its own FRAME, which the
    // block's frame should replace. Here the cards ARE the content — a grid
    // with its cards flattened is a list, not an unframed grid. Pinned because
    // the list is the one thing in §5's shape that has to be kept in step, and
    // the obvious next edit is to add every card class to it.
    expect(rules).not.toContain(".ca-journal-widget-block.is-unframed .ca-jjc-card");
  });

  it("matches the border weight of the cards beside it", () => {
    // `--ca-rule` is 2px and is for a RULE — a divider between bands. A card's
    // outline is 1px here, as `.ca-journals-card` forty lines up already is.
    const at = rules.indexOf(".ca-jjc-card {");
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

describe("a journal is a card that holds its own (4.41)", () => {
  it("is a box, not a rule between two bars", () => {
    // WHAT THIS REPLACES: `.ca-jjs-type + .ca-jjs-type { border-top: 1px }`. The
    // journal's name was a bare bar on the section's ground with its subject
    // cards loose beneath, so the only thing binding a journal to its cards was
    // the gap before the next title — the SAME gap that separates two cards
    // inside one journal.
    const type = cssRule(".ca-jjs-type");
    expect(type).toContain("background: var(--background-secondary)");
    expect(type).toContain("border: 1px solid var(--background-modifier-border)");
    expect(type).toContain("border-radius: var(--ca-radius-md)");
    // The head's tint is full-bleed, so the corners have to be the card's.
    expect(type).toContain("overflow: hidden");
  });

  it("separates the cards with air rather than a line", () => {
    // A list of BARS needs a rule to be read as separate sections; a list of
    // cards is separated by the gap between them, and a line as well is the
    // boundary drawn twice — which is what `--ca-border-inner` exists for.
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toContain(".ca-jjs-type + .ca-jjs-type");
    const list = cssRule(".ca-jjs-list");
    expect(list).toContain("gap: var(--ca-widget-gap)");
    // The same gap above the first card as between the rest, so it clears the
    // hero's own bottom edge by the amount the second clears the first.
    expect(list).toContain("padding-top: var(--ca-widget-gap)");
  });

  it("puts the journal's hue on the journal's own head", () => {
    // `hueOf(type.id)` is set on `.ca-jjs-type` by `buildType` and already tints
    // every subject card's head one level down — which is why chem and maths
    // wear the same red: the hue is the JOURNAL's, said once per card and never
    // by the journal. This is the tint being drawn by the thing it identifies.
    const head = cssRule(".ca-jjs-type > .ca-journal-sec");
    expect(head).toContain("hsl(var(--jjc-hue, 260) 45% 42%)");
    expect(head).toContain("var(--background-secondary)");
  });

  it("keeps the hue on the cards inside, and makes the two ranks differ", () => {
    // BOTH BANDS, on the maintainer's call: a subject card read on its own — at
    // the bottom of a scroll, or in a narrow pane — still has to say which
    // journal it belongs to.
    //
    // WHICH MAKES THE TWO NUMBERS THE DECISION. The bands mix into different
    // grounds (#282828 out here, #232323 in there) and that five-unit difference
    // is diluted by the tint to nothing: at 30% both ways they compute to
    // #4b2e2e and #472a2b, four units of red apart. The parent is drawn stronger
    // BECAUSE it is the parent.
    const outer = /(\d+)%,\s*\n?\s*var\(--background-secondary\)/.exec(
      cssRule(".ca-jjs-type > .ca-journal-sec")
    );
    const inner = /(\d+)%,\s*\n?\s*var\(--background-primary-alt\)/.exec(
      cssRule(".ca-jjs-card > .ca-journal-sec")
    );
    expect(outer?.[1], "the journal band states a mix percentage").toBeTruthy();
    expect(inner?.[1], "the card band states a mix percentage").toBeTruthy();
    expect(Number(outer?.[1])).toBeGreaterThan(Number(inner?.[1]));
    // And by enough to see. Computed: 40% over #282828 is #563030 against the
    // card's #472a2b — fifteen units of red, a step rather than a smudge.
    expect(Number(outer?.[1]) - Number(inner?.[1])).toBeGreaterThanOrEqual(10);
  });

  it("drops the head's under-edge when the card is folded", () => {
    // The body is `display: none` when folded, so the head's bottom border would
    // land one pixel inside the card's own — the doubled boundary again, in the
    // one state where it is guaranteed rather than possible.
    expect(cssRule(".ca-jjs-type.is-collapsed > .ca-journal-sec")).toContain(
      "border-bottom: none"
    );
  });

  it("indents the grid from the card's edge by a card body's own margin", () => {
    // So a subject card's rows and the grid that holds them are indented by the
    // same amount from their own edges.
    const body = cssRule(".ca-jjs-type-body");
    expect(body).toContain("padding: 0 12px 8px");
    expect(cssRule(".ca-jjs-card-body")).toContain("padding: 2px 12px 0");
  });
});

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
    expect(code()).toContain('createDiv({ cls: "ca-jjs-grid" })');
    const css = readCss();
    const at = css.indexOf("\n.ca-jjs-grid {");
    expect(at, "no .ca-jjs-grid rule").toBeGreaterThan(0);
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toContain("auto-fill");
    expect(rule).toContain("minmax(");
    expect(css.slice(at, css.indexOf("}", at))).not.toContain("@media");
  });

  it("keeps the section frame for its head, and restates none of it", () => {
    // THE WHOLE REASON THIS IS CHEAP. The chosen mockup's head is a recessed
    // band with a glyph in a fixed slot and a name in small caps at
    // `--ca-bar-text` — which is what a level-2 `sectionFrame` bar has been
    // since 4.13 §1. The card adds a ground and an edge; the title, its
    // truncation, its glyph slot and its link are the frame's.
    expect(code()).toContain("sectionFrame(card, {");
    expect(code()).toContain("level: 2");
    const css = readCss();
    const at = css.indexOf("\n.ca-jjs-card > .ca-journal-sec {");
    expect(at, "no banded head rule").toBeGreaterThan(0);
    const head = css.slice(at, css.indexOf("}", at));
    // THE GROUND IS THE JOURNAL'S HUE AS OF 4.38, and it was
    // `var(--background-secondary)` here for four releases on a figure/ground
    // argument that was sound about the wrong colour: decoded off the render,
    // `--background-secondary` is #282828 and that is ALSO the section card's own
    // ground, so the head was not a lid but the section apparently showing through
    // a hole. Same mix and same base as the level cards' heads, because the two
    // families are one material.
    expect(head).toContain("hsl(var(--jjc-hue, 260) 45% 42%)");
    expect(head).toContain("var(--background-primary-alt)");
    expect(head).not.toContain("var(--background-secondary)");
    // PER TYPE AND NOT PER CARD: every card in one group belongs to one journal, so
    // a card reading the hue from an ancestor cannot disagree with its siblings.
    expect(readSrc("journals-section")).toContain(
      'section.style.setProperty("--jjc-hue", String(hueOf(type.id)))'
    );
    expect(head).toContain("border-bottom: 1px solid");
    // And it restates no type property — those come from the frame.
    expect(head).not.toContain("text-transform");
    expect(head).not.toContain("font-size");
  });

  it("lets the name read in the bar's own ink rather than overriding it", () => {
    // The link sat inside `.ca-journal-header-title` overriding the INK to
    // `--text-normal`, which is what made a subject read as bold text in a bar
    // instead of as the bar's title. Variant B is that override removed.
    const css = readCss();
    const at = css.indexOf("\n.ca-jjs-group-name {");
    expect(at).toBeGreaterThan(0);
    expect(css.slice(at, css.indexOf("}", at))).toContain(
      "color: var(--ca-bar-ink)"
    );
  });

  it("draws a card on the quieter ground, under the section that holds it", () => {
    // 4.9 §2.2's rule for the row group, one family over: a card inside a card
    // reads as deliberate only if the inner one is the quieter. The section card
    // is `--background-secondary`; these sit on the page's alt ground inside it.
    const css = readCss();
    const at = css.indexOf("\n.ca-jjs-card {");
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
    // READ FROM `tables.ts` SINCE 4.36, where `childRow` now lives so that the
    // journals card and `level-cards` draw one row rather than two that agree.
    const row = readSrc("tables").replace(/\/\/.*$/gm, "");
    expect(row).toContain("folderActivity(plugin.app, sub.path)");
    expect(row).toContain("relativeActivity(lastActive)");
    expect(row).toContain("sumBodyTasks(");
    expect(row).toContain("if (!openCell.isConnected) return;");
    // And the card still calls it, rather than having grown a copy back.
    expect(code()).toContain("childRow(plugin, ctx, body, sub)");
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
    expect(code()).toContain("for (const sub of subs) childRow(");
    expect(code()).not.toContain("TOPICS_SHOWN");
    // Comments stripped — the rule that replaced those names them, and that
    // account is worth more than the assertion's convenience.
    expect(readCss().replace(/\/\*[\s\S]*?\*\//g, "")).not.toContain(
      ".jjs-card-more"
    );
  });

  it("clips on the row boundary rather than showing a sliver of a fifth (4.38.2)", () => {
    // MEASURED ON THE RENDER: a card showed enough of row five under row four to
    // read as a clipped letter rather than as a scroll. The arithmetic was right
    // and the BOX MODEL was not — `overflow` clips at the PADDING box, not the
    // content box, so the body's 10px of bottom padding was a 10px window onto
    // whatever came next. A scroll container whose height is stated in rows cannot
    // have bottom padding: the padding IS a partial row.
    const body = cssRule(".ca-jjs-card-body");
    expect(body).toContain("padding: 2px 12px 0");
    // The height counts the TOP padding only now. Pinned as the expression rather
    // than a number, so the four stays visible and a reader who scales their font
    // still gets four whole rows.
    expect(body).toContain("var(--jjs-row-h) * var(--jjs-rows) + (var(--jjs-rows) - 1) * 1px + 2px");
    expect(body).not.toContain("+ 12px");
    // AND THE SPACE MOVED RATHER THAN VANISHED, to the place it always meant:
    // between the last row and the card's edge, outside the scroller. Both card
    // families, because both use this body.
    expect(cssRule(".ca-jjs-card")).toContain("padding-bottom: 10px");
    expect(cssRule(".ca-jld-card")).toContain("padding-bottom: 10px");
  });

  it("states the height as four rows, and lets the body scroll", () => {
    // FOUR LINES PLUS THE BAR, whatever a card holds. The arithmetic is written
    // out in the rule rather than pre-multiplied, so the four is visible in the
    // place a reader would go looking for it.
    const css = readCss();
    const at = css.indexOf("\n.ca-jjs-card-body {");
    expect(at, "no card body rule").toBeGreaterThan(0);
    const body = css.slice(at, css.indexOf("}", at));
    expect(body).toContain("--jjs-rows: 4");
    expect(body).toContain("height: calc(");
    expect(body).toContain("var(--jjs-row-h) * var(--jjs-rows)");
    expect(body).toContain("overflow-y: auto");
    // `border-box`, because Obsidian sets it per component rather than globally
    // — the trap `.ca-jjh-stat` already records — and the padding is inside the
    // stated height.
    expect(body).toContain("box-sizing: border-box");
  });

  it("stops a row sizing or shrinking itself, which is what makes four countable", () => {
    // Two halves of one thing. The row's height is STATED, on `.ca-cal-week`'s
    // precedent: a box whose height comes from its content cannot be counted.
    // And it does not shrink — the body is a flex column with a fixed height, so
    // without `flex: 0 0 auto` the rows would divide that height between them
    // instead of overflowing it, and the scroll would never happen.
    // Comments stripped BEFORE the slice: two of the declarations here are
    // explained in place, and one of those explanations contains the word this
    // rule must not declare.
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    const at = css.indexOf("\n.ca-jjs-card-row {");
    expect(at).toBeGreaterThan(0);
    const row = css.slice(at, css.indexOf("}", at));
    expect(row).toContain("height: var(--jjs-row-h)");
    expect(row).toContain("flex: 0 0 auto");
    expect(row).not.toContain("padding");
    // And a long name ellipses rather than wrapping, or it would push its own
    // row past the stated height and the count would stop being true.
    const linkAt = css.indexOf(".ca-jjs-card-row .ca-jjs-row-link {");
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

  it("makes both empty states the control instead of describing one (4.38)", () => {
    // TWO SENTENCES POINTED AT CHROME AND THE CHROME MOVED. The card's body read
    // *"add one from this journal's row above"* and the type's read *"Create one
    // from the buttons on the row above"* — and 4.36–4.37 deleted the row both
    // named. The card's own comment had already noticed the pattern once (the
    // string had gone stale before, which is why it named a place rather than a
    // label) and drawn the wrong conclusion: a place is no more stable than a word.
    const src = code();
    expect(src).not.toContain("row above");
    expect(src).not.toContain("from the buttons");
    // The affordance IS the empty state, and it is `addTile` — the same dashed slot
    // the level grid ends with, imported rather than reimplemented, for the reason
    // `childRow` already is.
    expect(src).toContain("body.appendChild(addTile(plugin, type, folder, childLevel.noun))");
    // AND THE TYPE'S EMPTY STATE PUTS ITS TILE IN A CARD, IN A GRID (4.38.4) —
    // the same grid the populated branch draws, with one cell in it, so the two
    // states are one arrangement rather than two.
    expect(src).toContain('body\n        .createDiv({ cls: "ca-jjs-grid" })');
    expect(src).toContain("addCardTile(plugin, type, root, topLevel.noun)");
    expect(readSrc("tables")).toContain("export function addTile(");
    // AND WHERE THE TILE IS DRAWN, IT IS THE WHOLE EMPTY STATE (4.39.1). The
    // branch used to draw three things that said one thing: the title `No
    // subjects yet`, the sentence `Subjects appear here automatically.`, and then
    // this tile. An empty card in an otherwise empty grid already says the level
    // is empty — that is the entire reason 4.38.4 gave the tile card chrome — so
    // the two lines restating it go.
    //
    // ASSERTED AS AN ORDERING, NOT AN ABSENCE, and deliberately: both strings are
    // still in this function, because the no-folder branch below still uses them.
    // A `not.toContain` would be asserting the opposite of the truth. What is
    // actually claimed is that the tile branch RETURNS before any `.ca-jjs-empty`
    // exists.
    const branch = src.slice(
      src.indexOf("if (tops.length === 0) {"),
      src.indexOf("const grid = body.createDiv")
    );
    expect(branch).toMatch(
      /if \(root\) \{\s*body\s*\.createDiv\(\{ cls: "ca-jjs-grid" \}\)[\s\S]*?return section;\s*\}/
    );
    expect(branch.indexOf("return section;")).toBeLessThan(
      branch.indexOf('cls: "ca-jjs-empty"')
    );
    // A REGISTERED JOURNAL WHOSE ROOT DOES NOT EXIST YET is the one state where
    // nothing is drawn unless the words draw it — `getFolder` returns null there,
    // and the tile's action needs the parent to work out which level it is
    // creating. So both lines survive, on the far side of that return.
    const noFolder = branch.slice(branch.indexOf('cls: "ca-jjs-empty"'));
    expect(noFolder).toContain("appear here automatically.");
    // AND THE TITLE NAMES WHAT IS MISSING (4.38.4). It read "No study journals
    // yet" over a line reading "Subjects appear here automatically" — the two
    // disagreed about what was absent, and the title was the wrong one: the
    // journal is right there, titled two lines up. `splitGlyph` went with it.
    expect(noFolder).toContain("text: `No ${plural(topLevel.noun).toLowerCase()} yet`");
    expect(src).not.toContain("splitGlyph(type.name)");
    // In a card the tile takes the whole stated body, so an empty card is the
    // height of the four-row cards beside it in the grid.
    const fill = cssRule(".ca-jjs-card-body > .ca-jld-add-tile");
    expect(fill).toContain("flex: 1 1 auto");
    // And it may shrink below the 92px floor, because `--jjs-rows` is a variable and
    // a narrower body would otherwise clip the tile against its own overflow.
    expect(fill).toContain("min-height: 0");
  });

  it("draws the slot's edge a hair above the surface, not against it (4.40)", () => {
    // MEASURED COMPLAINT, and the reader's own words: *"the tiles have
    // ant-pattern lines around them now, and it is too jarring. Tone it down,
    // similar colour to the surface."*
    //
    // Both shapes of the offer read the same token, which is what stops them
    // being two decisions: the card is the dashed slot in a grid, and the tile is
    // the dashed slot inside a card that has content of its own.
    expect(cssRule(".ca-jjs-card-add")).toContain(
      "border-color: var(--ca-slot-edge)"
    );
    expect(cssRule(".ca-jld-add")).toContain(
      "border-color: var(--ca-slot-edge) !important"
    );
    // A PLAIN VALUE, NOT A MIX. The one edge on the page drawn ONLY as an edge
    // must not be able to fail the way `--ca-border-inner` did — see the
    // shorthand test below, which is the same release and the same fault.
    const token = readCss().slice(readCss().indexOf("--ca-slot-edge:"));
    expect(token.slice(0, 80)).toMatch(/--ca-slot-edge: rgba\(/);
    // AND IT RESOLVES PER THEME. A white hair over a near-white card is
    // invisible, so the light theme gets a dark one rather than the same value.
    expect(readCss()).toMatch(
      /body\.theme-light \{[\s\S]*?--ca-slot-edge: rgba\(0, 0, 0/
    );
  });

  it("never puts an unresolvable colour inside a border shorthand (4.40)", () => {
    // ── THE FAULT THIS PINS, WHICH COST A RELEASE TO FIND ────────────────
    //
    // The add card came back **3px `#dadada` dashed** on
    // `20260818_20h01m16s_grim.png`, and neither number is in any rule: `medium`
    // is the initial `border-width` and computes to 3px, and `currentColor` is
    // the initial `border-color`, which under a journals widget is
    // `--text-normal`. Two initial values at once is a signature, not a
    // coincidence.
    //
    // **A `var()` that does not resolve invalidates the WHOLE shorthand**, not
    // just the colour — width, style and colour all revert. So `.ca-jjs-card` lost
    // its border entirely wherever `--ca-border-inner` failed, and the one place
    // a style was stated separately (`.ca-jjs-card-add`'s `dashed`) got the rope.
    //
    // In longhands the same failure costs the colour and nothing else. That is
    // the rule, and it is general: a token that is COMPUTED — a `color-mix`, a
    // `light-dark`, anything a renderer might not support — cannot go in a
    // shorthand beside declarations that must survive it.
    const css = readCss();
    const shorthands = [
      ...css.matchAll(/^\s*(border(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?):[^;]*;/gm),
    ].filter((m) => m[0].includes("var(--ca-border-inner)"));
    expect(shorthands.map((m) => m[0].trim())).toEqual([]);
    // The colour is still asked for — this is a change of shape, not a retreat
    // to the plain border the token was introduced to replace.
    expect(css).toContain("border-color: var(--ca-border-inner)");
  });

  it("draws the card's own edge with a value that cannot fail (4.42)", () => {
    // THIRD DIAGNOSIS AND THE ONE THAT HOLDS. 4.40 blamed the border shorthand
    // (real, fixed, not the cause). 4.40.1 blamed `:root` and moved the mix to
    // `body` — right about the placement, and the next screenshot still measured
    // `#dadada` on chem, Maths and proj1, because the mix was reading
    // `--ca-surface-inset`, a `:root` alias broken the same way.
    //
    // The general rule and its guard are in `tokens.test.ts`. What is checked
    // HERE is the thing the reader sees: the card's edge is a literal, so no
    // resolution can take it away.
    const edge = cssRule(".ca-jjs-card");
    expect(edge).toContain("border-color: var(--ca-border-inner)");
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    const root = css.slice(css.indexOf(":root {"), css.indexOf("\n}"));
    expect(root).toMatch(/--ca-border-inner: rgba\(/);
    // AND THE PROOF A LITERAL WORKS IS ON THE SAME SCREENSHOT: `--ca-slot-edge`
    // measured #333333 over #232323, exactly its arithmetic, in the same render
    // where this token was still white.
    expect(root).toMatch(/--ca-slot-edge: rgba\(/);
  });

  it("does not offer the same create twice per journal (4.38.1)", () => {
    // MEASURED ON THE RENDER: every journal on the page drew `＋ Subject` on its
    // head AND a "New subject" tile at the end of its grid, about 40px apart.
    // Four journals, four duplicated buttons — and 4.38 had introduced the tile
    // without noticing the button it made redundant.
    //
    // THE TILE IS WHAT SURVIVES, on its own merits rather than because it is
    // newer: it sits where the thing it makes will appear, at the end of the list
    // of them. A button on a section head is chrome ABOUT the section.
    const src = code();
    expect(src).toContain("const specs: BtnSpec[] = [];");
    expect(src).toMatch(
      /if \(!root\) \{\s*specs\.push\(\{\s*label: topLevel\.noun/
    );
    // AND THE CHILD BUTTON WENT TOO IN 4.38.4, on the maintainer's call that a
    // second control on every journal's title bar is noise the page does not earn.
    //
    // THE GAP IT LEAVES IS ALSO A DECISION (4.39.1). A ＋ on the subject card's own
    // head was offered and declined: **the homepage is read-only for topics.** It
    // lists what is in a journal; making things in it belongs to that journal's
    // dashboard and to the command palette. Pinned so the obvious "fix" is known to
    // have been refused rather than missed.
    expect(src).not.toMatch(/if \(childLevel\) \{\s*specs\.push\(/);
    expect(src).not.toContain("newContainer(type, 1)");
    // AND THE BUTTON RETURNS WHERE THE TILE CANNOT BE. `buildType` draws the tile
    // only when the journal's root folder exists; without this guard a registered
    // journal whose folder was never made would have no create path at all.
    expect(src).toContain("if (root) grid.appendChild(addCardTile(");
    // Nothing drawn where there is nothing to draw — an empty `.ca-jjs-actions` div
    // inside the widgets bar defeats the `:empty` rule that hides an unused slot.
    expect(src).toContain("if (specs.length > 0) addButtons(frame.actions, specs);");
  });

  it("wears a card so it matches the cards beside it (4.38.4)", () => {
    // The builder's body, comment-stripped — the note above it quotes the class
    // names it is about.
    const build = ((): string => {
      const src = readSrc("tables").replace(/^\s*\/\/.*$/gm, "");
      const at = src.indexOf("export function addCardTile(");
      expect(at, "addCardTile is gone").toBeGreaterThan(-1);
      return src.slice(at, src.indexOf("\n}", at));
    })();
    // A naked dashed button beside a run of bordered cards reads as a control that
    // wandered into the grid. Wrapped, it wears the same ground, border and radius
    // its neighbours have — which is what an EMPTY subject card already looks like
    // one column over, since `buildGroup` puts the same tile in its body.
    expect(build).toContain('cls: "ca-jjs-card ca-jjs-card-add"');
    expect(build).toContain('cls: "ca-jjs-card-body"');
    expect(build).toContain("addTile(plugin, type, parent, noun)");
    // NO STATED HEIGHT ON ITS BODY. Four rows exists to make a LIST countable and
    // this body holds one control; it fills instead, so the card takes its height
    // from the row and MATCHES rather than merely resembling.
    const add = cssRule(".ca-jjs-card-add > .ca-jjs-card-body");
    expect(add).toContain("height: auto");
    expect(add).toContain("flex: 1 1 auto");
    // AND A `div` IS WHAT MADE THE HEIGHT POSSIBLE. `.ca-jjs-grid` has been
    // `align-items: stretch` since 4.38.1 and the tile still did not stretch:
    // Obsidian gives form controls a definite height, and `align-self: stretch` is
    // ignored on any item whose height is not `auto`, so a `<button>` sat at its
    // 92px minimum beside 160px cards. Measured on
    // `dev-screenshots/20260818_15h58m26s_grim.png` — 96px against 160px.
    expect(build).toContain("createDiv(");
    expect(build).not.toContain("createEl(\"button\"");
  });

  it("survives a theme that paints every button (4.39.1)", () => {
    // MEASURED, AND IT HAD NEVER WORKED. Sampled off
    // `dev-screenshots/20260818_17h32m11s_grim.png`, the tile's interior is
    // #333333 with a solid #3c3c3c edge — pixel for pixel what the Refresh button
    // beside it renders, which is a button that is MEANT to look like one. A theme
    // painting `<button>` is (0,1,1) and a bare `.ca-jld-add` is (0,1,0), so the
    // dashed-edge/no-ground vocabulary was silently not drawing.
    //
    // Nothing in the stylesheet could have caught this: the rule was present and
    // correct and simply lost. It took a render. What a test CAN hold is that the
    // three declarations carrying the vocabulary are defended.
    //
    // ── AND IT ASKS FOR THE PROPERTIES, NOT THE SHORTHAND (4.40) ─────────
    //
    // This read `border:` and broke when 4.40 split that shorthand into
    // longhands — a change made for a fault in a different rule, which this test
    // then reported as a regression in this one. It was pinning the SHAPE of the
    // fix rather than what the fix guarantees, which is the trap RESUME.md
    // records from 4.39.0: *a test that pins the workaround blocks the fix.*
    // What must hold is that every property carrying the vocabulary is defended
    // — however it is spelled.
    const add = cssRule(".ca-jld-add");
    const declaring = (prop: string): string | undefined => {
      // Either the longhand or the shorthand that governs it — the guarantee is
      // about the property, and which spelling states it is the author's choice.
      const shorthand = prop.startsWith("border-") ? "border" : prop;
      return add
        .split("\n")
        .find((l) => [prop, shorthand].includes(l.split(":")[0].trim()));
    };
    for (const prop of ["border-style", "border-color", "background", "box-shadow"]) {
      const line = declaring(prop);
      expect(line, `no ${prop} on .ca-jld-add`).toBeTruthy();
      expect(line, `${prop} is undefended`).toContain("!important");
    }
    // AND THE HOVER SHOUTS AS LOUD, or the base rule wins against it — an
    // `!important` declaration is only beaten by another one.
    const hover = cssRule(".ca-jld-add:hover");
    expect(hover).toContain("border-color: var(--interactive-accent) !important");
    expect(hover).toContain("background: var(--background-modifier-hover) !important");
  });

  it("draws one boundary round an empty card, not two (4.39.1)", () => {
    // With the tile's dash restored, an add card drew the card's solid border AND
    // the tile's dashed one 13px inside it — the over-drawing `--ca-border-inner`
    // exists to stop. This card has no head and no content, so the CARD is the
    // empty slot: it takes the dash and the tile becomes the label in it.
    expect(cssRule(".ca-jjs-card-add")).toContain("border-style: dashed");
    const inner = cssRule(".ca-jjs-card-add .ca-jld-add-tile");
    expect(inner).toContain("border: none !important");
    expect(inner).toContain("background: transparent !important");
    // A tile inside a REAL subject card keeps its dash — there the card is a named
    // object with a head and the dashed box marks the empty part of it.
    expect(cssRule(".ca-jjs-card-body > .ca-jld-add-tile")).not.toContain("border: none");
  });

  it("does not collapse to a pill when it is the only thing there (4.39.1)", () => {
    // `.ca-jjs-card-body > .ca-jld-add-tile` zeroes the tile's 92px floor so it can
    // shrink inside a body whose height is STATED. Right there, wrong in an add
    // card, where the body has no stated height and the grid has nothing to
    // stretch against: a journal with no containers rendered a 29px pill.
    expect(cssRule(".ca-jjs-grid > .ca-jjs-card-add:only-child .ca-jld-add-tile")).toContain(
      "min-height: 64px"
    );
    // `:only-child` IS THE WHOLE CONDITION. With cards beside it the row's height
    // is the answer and a floor would fight it — including the flat journal whose
    // card is a head and nothing else.
    //
    // 64px AND NOT 92px SINCE 4.42, because the shape changed with it: alone in
    // the grid the card is the full width of the section now, and 92px of dashed
    // box across a 700px pane is the "large empty box" `.ca-jld-grid.is-paired`
    // named when it made the same trade. Its number, reused rather than picked.
    expect(cssRule(".ca-jld-grid.is-paired .ca-jld-add-tile")).toContain("min-height: 64px");
  });

  it("does not repeat its own label in a tooltip (4.42)", () => {
    // MEASURED: on `20260818_20h59m08s_grim.png` a tooltip reading "New project"
    // is open under a tile whose visible label reads "New project". A `title`
    // that repeats the words on the control tells a pointer user nothing, and a
    // screen reader announces the name twice.
    const tiles = readCode("tables");
    const addTile = tiles.slice(
      tiles.indexOf("export function addTile("),
      tiles.indexOf("export function addCardTile(")
    );
    expect(addTile).toContain('attr: { type: "button", "aria-label": label }');
    expect(addTile).not.toContain("title: label");
    // The visible label is what carries it, and nothing hides that label at any
    // width — which is the condition under which dropping the tooltip is safe.
    expect(addTile).toContain('cls: "ca-jld-add-label", text: label');
    expect(readCss()).not.toContain(".ca-jld-add-label");
    // The homepage's "New journal" tile is the same shape and lost the same
    // duplicate.
    expect(readCode("journals-cards")).not.toContain("title: label");
  });

  it("keeps the tooltip on the head ＋, where it says something else", () => {
    // THE DISTINCTION THIS TURNS ON, and it is why the rule is not "no titles":
    // `addHeadButton` shows "Topic" and its tooltip says "New topic" — different
    // strings — and that button collapses to icon-only under 460px, where the
    // tooltip is the only text there is.
    const tiles = readCode("tables");
    const head = tiles.slice(
      tiles.indexOf('cls: "ca-journal-btn-ghost ca-jld-head-add"') - 400,
      tiles.indexOf('cls: "ca-journal-btn-ghost ca-jld-head-add"') + 400
    );
    expect(head).toContain("title: label");
    expect(head).toContain('cls: "ca-journal-btn-label", text: noun');
  });

  it("fills the row when it is the only thing on it (4.42.1)", () => {
    // ── 4.42 WROTE `auto / -1` AND IT DID THE OPPOSITE OF WHAT IT SAID ───
    //
    // Measured on `20260818_21h25m06s_grim.png`: four empty journals, and every
    // one drew its slot in track 2 with **track 1 bare** — a gap in FRONT of the
    // tile rather than behind it.
    //
    // The reason is in the spec, not the browser: an item with an `auto` start
    // and a definite end is given a span of 1 (§8.1.1), so `auto / -1` means "one
    // track, ending at the last line" — always the last track. Study and Projects
    // looked right by luck, because with two tracks and one card the last track
    // is also the next free one.
    //
    // AND THE TEST THAT PASSED THIS is the lesson: it asserted the DECLARATION
    // (`grid-column: auto / -1`) rather than what the declaration had to achieve,
    // so it could only ever have confirmed that the wrong value was still there.
    // What is asserted now is the two cases, by selector.
    const alone = cssRule(".ca-jjs-grid > .ca-jjs-card-add:only-child");
    expect(alone).toContain("grid-column: 1 / -1");
    // BESIDE CARDS, NOTHING AT ALL — ordinary auto-placement already fills the
    // next free track, which is the whole of what the broken rule was reaching
    // for and was true before 4.42 touched it.
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toContain("grid-column: auto / -1");
    expect(cssRules(".ca-jjs-grid > .ca-jjs-card-add").join("\n")).not.toContain(
      "grid-column"
    );
  });

  it("ends the subject grid's row on one line, tile included (4.38.1)", () => {
    // `.ca-jjc-grid` was corrected to `stretch` in 4.38 and THIS grid was missed, so
    // the render showed a 163px card, a 163px card and a 90px tile on one row —
    // the tile falling back to its `min-height` and reading as a small button
    // rather than as an empty slot. `.ca-jld-add-tile`'s own `align-self: stretch`
    // did not carry it, so the container is what states it.
    expect(cssRule(".ca-jjs-grid")).toContain("align-items: stretch");
    expect(cssRule(".ca-jld-add-tile")).toContain("align-self: stretch");
    // `.ca-jld-grid` KEEPS `start`, and that is not an oversight: its tile spans the
    // full row and sits alone on it, so there is nothing beside it to match and
    // stretching would make it as tall as a whole card pair.
    expect(cssRule(".ca-jld-grid")).toContain("align-items: start");
  });

  it("lets the tile glyph size actually reach the glyph (4.38.1)", () => {
    // 4.38 wrote `.ca-jld-add-icon { --jld-add-glyph: 20px; width: … }` and the ＋ did
    // not change, because `.ca-jld-add .svg-icon` was already sizing the SVG to a flat
    // 15px — two classes against `.ca-jld-add-icon svg`'s one class and one element,
    // so the older rule outranked the newer one. The 4.38 test asked whether the
    // new rule said 20px, not whether anything else outranked it; the render is
    // what caught it.
    //
    // Both rules read the same custom property now, so they are one decision
    // rather than two numbers to keep in step. The property is declared on
    // `.ca-jld-add-icon`, which is the svg's parent, so it inherits down.
    const shared = cssRule(".ca-jld-add .svg-icon");
    expect(shared).toContain("var(--jld-add-glyph");
    expect(shared).not.toMatch(/width:\s*15px/);
    expect(cssRule(".ca-jld-add-icon")).toContain("--jld-add-glyph: 20px");
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
    expect(css).toContain(".ca-jjs-type.is-collapsed");
  });

  it("counts nothing on either bar, and countLabel is gone with its last caller", () => {
    // "1 subject" over a list of one subject, and "1 topic" over the topic that
    // follows it: a tally of rows already on the screen.
    expect(code()).not.toContain("note: countLabel");
    // `countLabel` SURVIVED 4.13.2 ON ONE CALLER and is deleted in 4.37 with it.
    // The distinction that kept it alive is still drawn — a card says "4 subjects"
    // about a list it does not show, a reading rather than a tally — but a stat
    // cell splits the number from the noun, so there is nothing for a function
    // returning the formatted phrase to be put into. The reading is the strip's
    // fourth cell now.
    expect(readSrc("journals-section")).not.toContain("export function countLabel(");
    expect(readSrc("journals-cards").replace(/\/\/.*$/gm, "")).not.toContain(
      "countLabel("
    );
    // The note saying so is where the function was, so a reader looking for it
    // finds the reason rather than a gap.
    expect(readSrc("journals-section")).toContain("`countLabel` STOOD HERE AND IS DELETED");
  });

  it("leaves the search result row alone, which shares the class name", () => {
    // `.ca-jjs-row` is built by TWO modules for two unrelated objects, and only the
    // topic row's rules were the journals card's to delete. This is the
    // substring trap this project keeps writing down, in class-name form.
    expect(readSrc("journal-search")).toContain('cls: "ca-jjs-row"');
    expect(readCss()).toContain(".ca-jjs-row {");
    // Comments stripped — the paragraphs that replaced those rules name them.
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toContain(".jjs-row-name");
    // What stayed: the link, which a card's line still wears — drawn from
    // `tables.ts` since 4.36, along with the rest of the row.
    expect(readSrc("tables")).toContain('"ca-jjs-row-link"');
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
    // `.ca-jjs-hero` is the band inside the card; `.ca-jjh-root` is the same widget
    // rendered bare by the `journals-header` directive. They washed at the same
    // 0.07 and must stop together, or the standalone one becomes the last tinted
    // object in the plugin by omission.
    for (const sel of [".ca-jjs-hero", ".ca-jjh-root"]) {
      expect(body(sel), sel).not.toContain("--interactive-accent-rgb");
    }
    // The hairline that divides the band from the list stays: with no fill it is
    // the only thing left saying where the band ends.
    expect(body(".ca-jjs-hero")).toContain("border-bottom: 1px solid");
  });

  it("names the period and not the roster (4.38.4)", () => {
    // It read `Last 12 months · Study · Projects · Exercise & Diet · Media` — a
    // line that gets LONGER the more journals a reader has, which is the case it is
    // most likely to be read in, and wraps on a sidebar.
    //
    // The roster was also the half a reader did not need: this band is the whole
    // section's, the section is titled Journals, and every journal in the vault is
    // in it by definition. The PERIOD is what narrows it, and nothing else on the
    // page says it.
    const src = readSrc("journals-header");
    expect(src).toContain('cls: "ca-jjh-eyebrow", text: "Last 12 months"');
    expect(src).not.toContain("typeNames");
    // `types` IS STILL THE SCOPE it always was — the band's numbers read it, and a
    // reader's own `journals-header:study` still covers one journal. Only the
    // label changed.
    expect(src).toContain("types.map(");
  });

  it("keeps the colour key out of the scroller it explains (4.38)", () => {
    // MEASURED, AND IT CORRECTED THE FINDING THAT SENT ME LOOKING. The report was
    // that this strip "overflows its section and clips its cell labels"; the stat
    // band fits and clips nothing. What clips is the LEGEND — because it was built
    // on `stripWrap`, four lines after `stripWrap.scrollLeft = scrollWidth`, so the
    // key to the shades rode the year off to the left and "Less" rendered as "ss"
    // on exactly the panes narrow enough to need it.
    // `dev-screenshots/20260817_13h45m10s_grim.png` shows it; the wider dashboard
    // shot does not, because there the strip fits and never scrolls.
    const src = readSrc("journals-header");
    expect(src).toContain('const legend = root.createDiv({ cls: "ca-jjh-legend" })');
    expect(src).not.toContain('stripWrap.createDiv({ cls: "ca-jjh-legend" })');
    // AND THE SCROLL ITSELF IS UNTOUCHED, which is the half that must not be
    // "fixed" along with it: 3.12 §14.5's argument is that a year read from the
    // wrong end is worse than a year that scrolls, and the strip is deliberately
    // scrollable rather than shrunk. A legend simply is not part of the year.
    expect(src).toContain("stripWrap.scrollLeft = stripWrap.scrollWidth;");
    expect(cssRule(".ca-jjh-strip-wrap")).toContain("overflow-x: auto");
  });

  it("puts a journal's create controls on its title line (4.38)", () => {
    // `30-header-bars.css` makes a level-1 actions slot a full-width second row,
    // and that rule stays what it is — this is one section saying its two small
    // controls fit on the line, not a reversal of the measured decision about
    // controls under a hairline. It bought back ~34px per journal on a band whose
    // right half was empty.
    const row = cssRule(".ca-jjs-type > .ca-journal-sec > .ca-journal-header-widgets.ca-journal-widget-bar");
    expect(row).toContain("flex: 0 0 auto");
    expect(row).toContain("margin-left: auto");
    expect(row).toContain("border-top: none");
    // The base rule is untouched, which is what keeps this scoped. Matched as text
    // rather than through `cssRule`, because that selector is written across two
    // lines in the source and the helper compares a selector string exactly.
    const css = readCss();
    const baseAt = css.indexOf(".ca-journal-sec-l1:not(.ca-journal-header-bar-untitled)");
    expect(baseAt, "the level-1 strip rule was renamed").toBeGreaterThan(0);
    expect(css.slice(baseAt, css.indexOf("}", baseAt))).toContain("flex: 1 0 100%");
    // SPECIFICITY IS A TIE AND FILENAME ORDER BREAKS IT — four class selectors
    // each — so the override only works because `build-css` concatenates in sorted
    // order and 30 precedes 60. Asserted because a rename would flip it silently.
    expect(css.indexOf(".ca-journal-sec-l1:not(.ca-journal-header-bar-untitled)")).toBeLessThan(
      css.indexOf(".ca-jjs-type > .ca-journal-sec > .ca-journal-header-widgets")
    );
  });

  it("ends both card grids in the slot for the next card, and narrows neither (4.38)", () => {
    // TWO GRIDS, ONE MEASURED COMPLAINT: `.ca-jjs-grid` drew two 334px tracks for one
    // subject and `.ca-jjc-grid` four tracks for two journals, so both ran about half
    // empty. The obvious fix was a smaller track minimum and it is the wrong one —
    // `auto-fill` had ALREADY made more tracks than there were cards, so a smaller
    // minimum makes more empty tracks. The gap is a count.
    expect(cssRule(".ca-jjs-grid")).toContain("minmax(260px, 1fr)");
    expect(cssRule(".ca-jjc-grid")).toContain("minmax(240px, 1fr)");
    // The subject grid takes the shared tile, whose action is a folder — wrapped
    // in a card since 4.38.4 so it matches the cards beside it.
    expect(readSrc("journals-section")).toContain(
      "if (root) grid.appendChild(addCardTile(plugin, type, root, topLevel.noun))"
    );
    // THE JOURNAL GRID'S TILE IS NOT `addTile`, AND THAT IS THE POINT. Every other
    // tile makes a folder; a journal is a declared type with levels, kinds and
    // trackers, written by `scaffold.createJournalType` from a settings draft. So
    // this one goes where journals are actually made — the same destination the
    // empty state beside it already names in words.
    const cards = readSrc("journals-cards");
    expect(cards).toContain('cls: "ca-jld-add ca-jld-add-tile ca-jjc-add"');
    expect(cards).toContain("plugin.openJournalSettings();");
    expect(cards).not.toContain("addTile(");
    // The click is swallowed, or the section's head folds and the cards open notes
    // because Settings was asked for.
    expect(cards).toMatch(/openJournalSettings[\s\S]{0,80}$|stopPropagation\(\);[\s\S]{0,120}openJournalSettings/);
  });

  it("draws its four numbers as a band rather than a box", () => {
    // A bordered, rounded, filled rectangle with four internally ruled cells is
    // a card inside a card — the argument `.jdh-stats` made in 2.51.2 before it
    // was deleted, applied to the twin that outlived it.
    const stats = body(".ca-jjh-stats");
    expect(stats).not.toContain("border: 1px solid");
    expect(stats).not.toContain("background:");
    expect(stats).toContain("border-top: 1px solid");
    // And the rules between the cells went with the box.
    expect(readCss()).not.toContain(".ca-jjh-stat + .ca-jjh-stat");
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
    const at = css.indexOf("\n.ca-jjh-strip {");
    expect(at).toBeGreaterThan(0);
    const strip = css.slice(at, css.indexOf("}", at));
    expect(strip).toContain("grid-template-rows: repeat(7, auto)");
    // `max-content` was what stopped the fractions resolving: a fraction needs a
    // definite width to be a fraction OF.
    expect(strip).not.toContain("width: max-content");
    const cellAt = css.indexOf("\n.ca-jjh-strip .ca-jjh-cell {");
    expect(cellAt, "no scoped cell rule").toBeGreaterThan(0);
    expect(css.slice(cellAt, css.indexOf("}", cellAt))).toContain(
      "aspect-ratio: 1"
    );
  });

  it("leaves the legend swatches at a fixed size", () => {
    // `.ca-jjh-cell` is also five swatches under the strip, in a flex row with
    // nothing to stretch to. A legend swatch is a KEY to the sizes in the grid
    // rather than one of them, which is why the fluid rule is scoped and the
    // bare one still states both dimensions.
    const css = readCss();
    const at = css.indexOf("\n.ca-jjh-cell {");
    expect(at).toBeGreaterThan(0);
    const bare = css.slice(at, css.indexOf("}", at));
    expect(bare).toContain("width: var(--jjh-cell)");
    expect(bare).toContain("height: var(--jjh-cell)");
    expect(readSrc("journals-header")).toContain('cls: "ca-jjh-cell is-empty"');
  });
});

describe("a card row names its columns (4.35.2)", () => {
  // `childRow` MOVED TO `tables.ts` IN 4.36, and these follow it. The row is
  // drawn by two widgets now — the journals card and `level-cards` — and
  // `journals-section.ts` already imports from `tables.ts`, so that is the only
  // home the two can share without a cycle. What the row SAYS is unchanged,
  // which is what these three have always been about.
  const src = () => readSrc("tables");

  it("labels the activity cell in both states", () => {
    // Populated it reads "3d ago" and explains itself; empty it is a bare em
    // dash beside another bare em dash, which is every row on a journal the
    // reader has just made.
    expect(src()).toContain('when.setAttr("title", "Last activity")');
    expect(src()).toContain('"Last activity: none yet"');
  });

  it("labels the open-tasks cell, and rewrites it when the count lands", () => {
    // The cell ships a placeholder because ChronoAnvil tasks live in note bodies
    // and are invisible to the metadata cache. A label written once would
    // describe the placeholder forever.
    expect(src()).toContain('openCell.setAttr("title", "Open tasks")');
    expect(src()).toContain('"Open tasks: counting…"');
    expect(src()).toContain('"No open tasks"');
  });

  it("says task or tasks, like every other count in this file", () => {
    expect(src()).toContain('open === 1 ? "task" : "tasks"');
  });

  it("adds no header row, because the body's height is stated in rows", () => {
    // A header would cost one of the four notes a card can show. The labels are
    // the version of this that is free.
    expect(src()).not.toContain("jjs-card-head-row");
  });
});

// ── 4.37: the card acquires a body ──────────────────────────────────────

describe("a journal's card carries its numbers", () => {
  // COMMENTS COME OFF, and this file is the third place in two releases where
  // that has been load-bearing rather than tidy. Every absence asserted below —
  // no `/5`, no `countLabel(` — is a thing the code's own comments QUOTE while
  // explaining why it is gone, so a scrape that keeps them tests the explanation
  // instead of the code. The one assertion that is genuinely ABOUT a comment says
  // so and reads the raw source.
  const card = (): string => {
    const src = readSrc("journals-cards").replace(/\/\/.*$/gm, "");
    const at = src.indexOf("export function buildCard(");
    if (at < 0) throw new Error("no buildCard");
    return src.slice(at, src.indexOf("\nfunction cardFourth(", at));
  };

  // THE FOURTH CELL LEFT `buildCard` IN 4.47, because it stopped being a
  // derivation and became a reader's choice WITH that derivation as its
  // fallback. It is read separately so the assertions below cannot pass on the
  // strength of something that merely happens to sit in the same file.
  const fourth = (): string => {
    const src = readSrc("journals-cards").replace(/\/\/.*$/gm, "");
    const at = src.indexOf("function cardFourth(");
    if (at < 0) throw new Error("no cardFourth");
    return src.slice(at, src.indexOf("\nexport function cardStatChoices(", at));
  };

  it("reads the numbers the dashboard reads, rather than computing its own", () => {
    // 4.13.3's rule for these two families — *"what is still shared is the thing
    // that actually mattered: the NUMBERS"* — and the property it buys is that a
    // journal's card and the dashboard it opens cannot disagree about what is in
    // it. Every figure comes from a function `containerCard` already calls,
    // scoped to the journal's root instead of one container.
    const body = card();
    expect(body).toContain("folderActivity(plugin.app, type.root)");
    expect(body).toContain("sumBodyTasks(");
    expect(body).toContain("relativeActivity(lastActive)");
    // And the strip is the shared component, not a band that looks like one.
    expect(body).toContain("statStrip(strip, cards)");
  });

  it("fills open tasks in place, because the cache cannot see them", () => {
    // `- ( )` lines live in note BODIES and are invisible to the metadata cache,
    // so the cell ships a placeholder and fills on resolve — the idiom `childRow`
    // and `containerCard` both use. The `isConnected` guard is what stops a
    // resolved read writing into a card the reader has already navigated away
    // from.
    const body = card();
    expect(body).toContain('{ label: "open", value: "…" }');
    expect(body).toContain("if (!openCell.isConnected) return;");
  });

  it("always draws four cells, unlike the container card's three-or-four", () => {
    // A GRID OF CARDS IS READ ACROSS, so a card with three cells beside cards
    // with four breaks the row — and there is always something honest for the
    // fourth to say, because a journal that rates nothing still has a count of
    // what is in it. The container card can drop to three because its neighbour
    // in a pair is a list, not another strip.
    //
    // 4.47 MADE THAT CELL A READER'S CHOICE AND THE GUARANTEE HAD TO SURVIVE IT.
    // It survives structurally rather than by argument: the cell is pushed
    // unconditionally, and the function that fills it returns a card rather than
    // a card-or-nothing, so neither a choice nor an absent one can shorten the
    // row.
    expect(card()).toContain(
      "cards.push(cardFourth(plugin, type, tops.length, ratingDef));"
    );
    const body = fourth();
    expect(body).toMatch(/\): StatCard \{/);
    expect(body).not.toMatch(/\): StatCard \| null/);
    // The two alternatives the derivation chooses between are both still there,
    // and the count is what the function falls out to when nothing else applies.
    expect(body).toContain("label: ratingWord(ratingDef)");
    expect(body).toContain("plural(type.levels[0].noun).toLowerCase()");
    expect(body.trimEnd().endsWith("return count();\n}")).toBe(true);
  });

  it("keeps the derivation as what an untouched journal gets", () => {
    // 4.47 §5: `cardStat` absent means TODAY'S RULE — the rating where the
    // journal declares one, the count of what is below otherwise — so every
    // journal that already exists draws the cell it drew yesterday and nobody
    // has to be told about a field to keep what they had.
    const body = fourth();
    expect(body).toContain("const chosen = type.cardStat ?? null;");
    // The absent choice takes the SAME branch the rating always took, rather
    // than a branch of its own that would have to be kept in step with it.
    expect(body).toContain('chosen === "rating" || chosen === null');
    // And it is still conditional on the journal declaring a rating: a journal
    // that grades nothing falls to the count, chosen or not.
    expect(body).toMatch(/chosen === "rating" \|\| chosen === null\) && ratingDef/);
    // `below` HAS NO ARM, because it is what everything else falls through to.
    // It had one, and a mutation could break it with the suite still green.
    expect(body).not.toContain('chosen === "below"');
  });

  it("is allowed the rating cell, and the 2.44 objections are answered", () => {
    // `journals-header.ts` deleted an "avg confidence" cell in 2.44 with three
    // reasons. Two were bugs: it averaged across every kind of every type, and it
    // printed `/5` beside a configurable range. The third was a scope — *"the
    // band spans every registered journal at once."* A CARD IS ONE JOURNAL, and
    // that note's own conclusion is the permission: *"an average rating is a fact
    // about one journal."*
    const body = fourth();
    // The kind filter is the fix for the first objection and is what this reads.
    expect(body).toContain("confidenceKinds(plugin, type.root, ratingDef.id)");
    // No denominator anywhere, which is the second.
    expect(body).not.toContain("/5");
    expect(body).not.toMatch(/\$\{[^}]*\}\s*\/\s*\$\{/);
    // An em dash rather than 0.0 when nothing is graded — an average of no
    // readings is absent, not zero.
    expect(body).toContain('conf ? conf.avg : "—"');
    // And the band it was removed from still has no rating cell; this is not a
    // reversal of that decision, which was about a multi-journal scope.
    expect(readSrc("journals-header")).toContain("NO AVERAGE RATING HERE");
  });

  it("offers only the numbers one card can answer", () => {
    // 4.47 §5. THE FIRST THREE CELLS ARE FIXED, so offering `notes`, `last` or
    // `open` would be a card saying one thing twice; `kinds` and `totals` fill
    // an unknown number of cells and there is exactly one slot. What is left is
    // the rating, the count of what is below, and the per-kind counts.
    const study = buildJournalType(JOURNAL_PRESETS[0].config);
    const rated = cardStatChoices(study, {
      id: "confidence",
      label: "Confidence",
      type: "number",
    });
    const values = rated.map((r) => r.value);
    expect(values).toContain("rating");
    expect(values).toContain("below");
    for (const kind of study.kinds) expect(values).toContain(`kind:${kind.id}`);
    // The band's vocabulary, not a second one — one set of words for "a number
    // about a journal", which is what lets a reader move between the two.
    for (const value of values) expect(scopesForMeasure(value)).toContain("journal");
    // Nothing that the other three cells already say, and nothing that expands.
    expect(values).not.toContain("notes");
    expect(values).not.toContain("last");
    expect(values).not.toContain("open");
    expect(values).not.toContain("kinds");
    expect(values).not.toContain("totals");
  });

  it("does not offer a rating to a journal that grades nothing", () => {
    // BUILT FROM THE TYPE. A menu row that draws an em dash whatever is under it
    // is the "nothing dead is drawn" rule with an extra step, and the derivation
    // it would set is the one such a journal already falls to.
    const study = buildJournalType(JOURNAL_PRESETS[0].config);
    const values = cardStatChoices(study, null).map((r) => r.value);
    expect(values).not.toContain("rating");
    expect(values[0]).toBe("below");
    // And the rating goes FIRST where there is one, because it is the cell the
    // card drew before anyone could choose.
    const rated = cardStatChoices(study, {
      id: "confidence",
      label: "Confidence",
      type: "number",
    });
    expect(rated[0].value).toBe("rating");
  });

  it("names the journal's own note types rather than numbering them", () => {
    // A row reading "kind:lesson" is the id leaking into the menu. `kindPlural`
    // is what the rest of this plugin titles a kind with, so the menu and the
    // cell it fills agree on the word.
    const study = buildJournalType(JOURNAL_PRESETS[0].config);
    const rows = cardStatChoices(study, null);
    for (const row of rows) {
      expect(row.label).not.toContain(":");
      expect(row.label.length).toBeGreaterThan(0);
    }
    const kind = study.kinds[0];
    expect(rows.find((r) => r.value === `kind:${kind.id}`)?.label).toBe(
      kindPlural(kind)
    );
  });

  it("is chosen from the card's own menu, ticked on what is drawn", () => {
    // 4.47 §5: THE CONTROL BESIDE THE THING IT CHANGES. Settings → Journals is
    // where a journal is DEFINED and a card's fourth cell is not a definition,
    // and the ⋯ is built on click so it already describes the journal as it is.
    const src = readSrc("journals-cards");
    expect(src).toContain("cardStatChoices(type, ratingDef)");
    // The tick has to name the DERIVATION where nothing is chosen, or a reader
    // opening the menu on an untouched journal sees four rows and no answer.
    expect(src).toContain(
      'row.value === (type.cardStat ?? (ratingDef ? "rating" : "below"))'
    );
    expect(src).toContain("plugin.journals.setCardStat(type, row.value)");
    // `setSubmenu` IS NOT ON OBSIDIAN'S PUBLIC TYPES, so it is probed — and a
    // probe that fails has to leave the setting REACHABLE. The first cut
    // returned, which drew the word "Fourth number" over nothing at all.
    expect(src).toContain("const target: Menu = sub ?? menu;");
    expect(src).not.toContain("if (!sub) return;");
  });

  it("stores the choice on the journal, and picking it again undoes it", async () => {
    // STORED ON THE JOURNAL so every surface that draws its card agrees. Deleted
    // rather than written empty on the way back: absent is the state every
    // journal starts in, and a key present with no value would be a third state
    // that `cardFourth`'s `?? null` cannot tell from the first.
    const cfg = { ...JOURNAL_PRESETS[0].config, id: "study" };
    let saves = 0;
    let repaints = 0;
    const plugin = {
      settings: { customJournals: [cfg] },
      saveSettings: async (): Promise<void> => {
        saves += 1;
      },
      // `repaintOpenNotes` asks the workspace for its markdown leaves, which is
      // the only observable this fake needs to prove the repaint happened.
      app: {
        workspace: {
          getLeavesOfType: (): unknown[] => {
            repaints += 1;
            return [];
          },
        },
      },
    };
    const manager = new JournalManager({} as never, plugin as never);
    const type = buildJournalType(cfg);

    await manager.setCardStat(type, "below");
    expect(cfg.cardStat).toBe("below");
    expect(saves).toBe(1);
    // 4.48, AND THIS IS THE BUG 4.47 SHIPPED. The save alone left the card
    // showing the old number until the note was reopened — `saveSettings`
    // writes `data.json` and re-renders nothing, which is 3.20.1's finding
    // arriving on a third surface.
    expect(repaints).toBe(1);

    await manager.setCardStat(type, "kind:lesson");
    expect(cfg.cardStat).toBe("kind:lesson");

    await manager.setCardStat(type, "kind:lesson");
    expect("cardStat" in cfg).toBe(false);
    expect(saves).toBe(3);
  });

  it("tells a journal it cannot store this on, rather than swallowing it", async () => {
    // `saveVariant`'s rule one screen up, in its own words: a bare return on an
    // unrecognised journal is indistinguishable from a save that worked. A
    // built-in that is not in `customJournals` has nowhere to keep the answer.
    let saves = 0;
    const plugin = {
      settings: { customJournals: [] },
      saveSettings: async (): Promise<void> => {
        saves += 1;
      },
      app: { workspace: { getLeavesOfType: (): unknown[] => [] } },
    };
    const manager = new JournalManager({} as never, plugin as never);
    const type = buildJournalType(JOURNAL_PRESETS[0].config);
    await manager.setCardStat(type, "below");
    expect(saves).toBe(0);
    // The saying is the point — a bare return here would pass the line above
    // and leave a reader watching a menu tick that never appears.
    const src = readSrc("journal").replace(/\/\/.*$/gm, "");
    const at = src.indexOf("async setCardStat(");
    expect(src.slice(at, src.indexOf("async newTopLevel(", at))).toContain(
      "new Notice("
    );
  });

  it("collapses its strip against the card, not the pane", () => {
    // 4.36.3's fix on `.ca-jld-card`, which was 4.3.1's lesson one level down,
    // applied to the family with the identical problem: a card in a 240px track
    // would otherwise hold four cells at ~54px each, because the shared rule
    // measures the nearest container and the nearest one was the whole section.
    expect(cssRule(".ca-jjc-card")).toContain("container-type: inline-size");
    // Quieter than a strip on a page, for the reason `.ca-jld-card-body` states —
    // and the dividers come off, because four hairline-boxed cells directly under
    // a saturated banner is a table bolted to a photograph.
    expect(cssRule(".ca-jjc-stats .ca-stats")).toContain("background: transparent");
    expect(cssRule(".ca-jjc-stats .ca-stat")).toContain("background: transparent");
  });

  it("drops the subtitle the count used to live in", () => {
    expect(readSrc("journals-cards")).not.toContain('cls: "jjc-sub"');
    expect(readCss()).not.toContain(".jjc-sub {");
  });

  it("answers its own header comment rather than leaving it standing", () => {
    // The file opened with *"THE FRAME, AND THE FRAME ONLY"* and deferred the
    // card's content for eight minors. Shipping the content makes that paragraph
    // false, and a false paragraph at the top of a file is worse than no
    // paragraph — this is the same fix 4.36 made to `docs/reference.md`'s "Six
    // notes are written" over a table of eight.
    const src = readSrc("journals-cards");
    // ASSERTED POSITIVELY, AND THE REASON IS A LESSON WORTH KEEPING: an ABSENCE
    // assertion on prose is self-defeating here. A file that documents a reversal
    // quotes what it reversed — that is what makes it readable — so
    // `not.toContain("THE FRAME, AND THE FRAME ONLY")` and
    // `not.toContain("is deferred")` were both tried and both failed on the
    // paragraph explaining that neither is true any more. Stripping comments is no
    // help when the comment IS the subject.
    //
    // So what is pinned is the new heading and the fact that it dates itself. A
    // header that went back to promising content later would fail on the first.
    expect(src).toContain("THE FRAME, AND THEN THE CONTENT");
    expect(src).toContain("completed in 4.37");
    // The rule that shaped it DOES survive and is still true — two action glyphs
    // rather than the reference's four, because two resolve to something real.
    expect(src).toContain("NOTHING DEAD IS DRAWN");
  });
});
