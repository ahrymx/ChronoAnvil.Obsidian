// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>

import { describe, expect, it } from "vitest";
import { cssRule, readCss, readSrc, styleSheets } from "./sources";
import { DEFAULT_SETTINGS } from "../src/core/settings";

describe("aesthetic presets and grain styling", () => {
  // ONE MODULE, NAMED (5.31.2). These read `readCss("99-aesthetic-presets")`,
  // which takes no argument: every one of them was asserting against the whole
  // concatenated folder while reading as though it were about one file. That is
  // harmless for a `toContain` and silently wrong for a `not.toContain`, which
  // is exactly what this release needed to add.
  const sheet = (name: string): string => {
    const found = styleSheets().find((f) => f.name === `${name}.css`);
    expect(found, `no stylesheet ${name}.css`).toBeTruthy();
    return found!.css;
  };
  const css = sheet("99-aesthetic-presets");
  const tokens = sheet("00-tokens");
  const headCss = sheet("98-page-head");
  const pageHeadSrc = readSrc("page-head");
  const vaultBannerSrc = readSrc("vault-banner");

  it("defines all 5 temporal grain color tokens in 00-tokens.css", () => {
    expect(tokens).toContain("--ca-grain-daily:");
    expect(tokens).toContain("--ca-grain-daily-rgb:");
    expect(tokens).toContain("--ca-grain-weekly:");
    expect(tokens).toContain("--ca-grain-weekly-rgb:");
    expect(tokens).toContain("--ca-grain-monthly:");
    expect(tokens).toContain("--ca-grain-monthly-rgb:");
    expect(tokens).toContain("--ca-grain-quarterly:");
    expect(tokens).toContain("--ca-grain-quarterly-rgb:");
    expect(tokens).toContain("--ca-grain-yearly:");
    expect(tokens).toContain("--ca-grain-yearly-rgb:");
  });

  it("binds grain-specific active accent variables in CSS", () => {
    expect(css).toContain('[data-ca-grain="daily"]');
    expect(css).toContain('[data-ca-grain="weekly"]');
    expect(css).toContain('[data-ca-grain="monthly"]');
    expect(css).toContain('[data-ca-grain="quarterly"]');
    expect(css).toContain('[data-ca-grain="yearly"]');
    expect(css).toContain('[data-ca-journal]');
  });

  it("supports Editorial Monastic and Technical HUD presets in CSS", () => {
    expect(css).toContain("body.ca-preset-editorial");
    expect(css).toContain("body.ca-preset-technical");
    expect(css).toContain("body.ca-grain-monochrome");
    expect(css).toContain("body.ca-grain-subtle");
  });

  it("stamps data-ca-grain and data-ca-journal in page-head.ts and vault-banner.ts", () => {
    expect(pageHeadSrc).toContain('root.setAttr("data-ca-surface", said.surface)');
    expect(pageHeadSrc).toContain('el.setAttr("data-ca-grain", grain)');
    expect(vaultBannerSrc).toContain('view.setAttr("data-ca-grain", grain)');
    // ── AND THE JOURNAL HALF MOVED TO ONE PAINTER (1.0.42) ──────────────
    //
    // Both files wrote `data-ca-journal` and the two accent properties by hand,
    // which is three statements duplicated; 1.0.42 made it five and moved the
    // lot into `journal.ts::paintJournalRung`. The assertion follows the fact
    // rather than the spelling: the two surfaces still stamp the journal, and
    // the one place that does it is where to look.
    expect(pageHeadSrc).toContain("paintJournalRung(app, file, type, identity)");
    expect(vaultBannerSrc).toContain(
      "paintJournalRung(this.app, file, type, [root, view])"
    );
    expect(readSrc("journals/journal")).toContain(
      'el.setAttr("data-ca-journal", type.id)'
    );
  });

  // ── THE RUNG (1.0.42) ─────────────────────────────────────────────────
  //
  // *"Journal levels (and pages) look too similar which makes it easy to lose
  // which index table you're looking at."* One accent per journal is what made
  // every note in Study the same magenta, so the accent became one per RUNG —
  // and the rung also steps the head's mass and tiles the kind's glyph, because
  // colour is never the only cue on this surface.

  it("binds the rung's mass on one attribute, under both intensity modifiers", () => {
    // (0,1,0) FOR THE RUNG AND (0,1,1) FOR THE MODIFIERS, which is the whole of
    // why the tint alpha is bound here and not set inline beside the accent it
    // is computed from. A reader who chose Subtle or Monochrome must not have it
    // undone by the note they opened, and an inline style would beat both.
    const tier = cssRule("[data-ca-tier]");
    expect(tier).toContain("--ca-head-spine-k");
    expect(tier).toContain("--ca-head-title-k");
    expect(tier).toContain("--ca-grain-tint");
    expect(tier).toContain("var(--ca-tier-t, 0)");
    // The modifiers still override the tint, and monochrome still resets the
    // accent the ramp writes inline.
    expect(cssRule("body.ca-grain-subtle")).toContain("--ca-grain-tint");
    expect(cssRule("body.ca-grain-monochrome")).toContain("--ca-journal-accent");
  });

  it("scales the spine and the title rather than restating them", () => {
    // A rung binding `--ca-head-spine: 2px` would out-specify the PRESET that
    // owns it — Editorial sets 2px and Technical 3px on `body` — so every
    // journal head would snap to one spine under every preset. A factor
    // composes with whatever the preset resolved, and reads 1 everywhere else.
    expect(cssRule(":root")).toContain("--ca-head-spine-k: 1");
    expect(cssRule(":root")).toContain("--ca-head-title-k: 1");
    expect(headCss).toContain("var(--ca-head-spine) * var(--ca-head-spine-k)");
    // The presets still set a TOKEN on the body class and never a property —
    // "keeps the spine's width a token in both files" already asserts that
    // against comment-stripped CSS, which is the only way to assert it.
    expect(css).toContain("--ca-head-spine:");
  });

  it("tiles the kind's glyph unconditionally, gated only by having one", () => {
    // This sheet's rule since 5.31.2: the head's rules are not gated on an
    // attribute, because six pages of the vault carry none. `none` is a legal
    // background-image, so a page with no rung paints no film and needs no gate.
    const film = cssRule(".ca-jph-film");
    expect(film).toContain("var(--ca-head-glyph, none)");
    expect(film).toContain("filter: grayscale(1)");
    // AND PLAIN ALPHA, NOT `mix-blend-mode: overlay`, which is what it shipped
    // with and what drew nothing. Overlay over a backdrop darker than mid-grey
    // is `2 * Cb * Cs`, so on the Editorial card a mid-grey glyph resolved to the
    // card's own value exactly — the texture moved a dark theme by seven of 255
    // levels at its brightest pixel and by none everywhere else.
    // `--ca-tex-grain` survives the same operator because its noise spans full
    // black to full white; a greyscaled emoji is all middle.
    expect(film).not.toContain("mix-blend-mode");
    // Density is arithmetic off the rung, so a three-level journal gets thirds
    // and this sheet holds no per-rung table.
    expect(film).toContain("var(--ca-tier-t, 0)");
    // The film is z-index -1, which only stops above the wash inside a stacking
    // context — `position: relative` alone is not one.
    expect(cssRule(".ca-journal-page-head")).toContain("isolation: isolate");
  });

  // ── ONE PSEUDO-ELEMENT, ONE OWNER (1.0.42) ────────────────────────────
  //
  // The film was written as `.ca-journal-page-head::before` and that was a
  // defect the whole suite passed: inside a `stack` that pseudo is ALREADY the
  // card's full-height spine, and two rules over one pseudo resolve per
  // property rather than picking a winner. The spine would have kept the
  // stack's geometry and colour and inherited the film's `grayscale(1)`, its
  // quarter opacity and its left-edge mask — a colour the reader chose, reduced
  // to a grey smudge, with nothing red in CI. Hence a real element, and hence
  // this test: the film may never move back onto the head's own pseudos.
  it("leaves the head's own pseudo-elements to the stack", () => {
    // Every claim on either pseudo, across the whole bundle, with what precedes
    // it. The stack's scoped spine is the only one allowed.
    const bare = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    const claims = [
      ...bare.matchAll(/([.\w-]*)\s*\.ca-journal-page-head::(before|after)/g),
    ].map((m) => `${m[1]} .ca-journal-page-head::${m[2]}`.trim());
    expect([...new Set(claims)].sort()).toEqual([
      // The head's bottom rule, which is a pseudo since 5.31.2 so that a stack
      // can cancel the LINE without cancelling `border-bottom`…
      ".ca-journal-page-head::after",
      // …which is what this does. And that is the whole list: `::before` was the
      // stack's full-height spine until 1.0.42 moved it onto the card's own
      // border, so the head now has one pseudo spoken for and one free. The
      // assertion is the SHAPE — a second claim on either, from any file, is how
      // two rules end up resolving one pseudo per property instead of picking a
      // winner, which is a defect a suite of unit tests cannot see.
      ".ca-journal-stack .ca-journal-page-head::after",
    ]);
  });

  it("draws the film inside a stack too, which is where the vault lives", () => {
    // IT SHIPPED SWITCHED OFF THERE AND THAT WAS THE BUG. The head's `::before`
    // was the card's full-height spine, so the head was `position: static` and
    // the film — absolute against the head — would have resolved against the
    // CARD and tiled every band. Suppressing it answered the collision and not
    // the report: a reader's journal pages ARE stacks, so a feature off inside a
    // stack is a feature off. The spine moved to the card's own border instead,
    // which `test/journal-stack.test.ts` holds.
    expect(readCss()).not.toContain(".ca-journal-stack .ca-jph-film");
    // And nothing takes the head's `position` or its isolation back.
    const inStack = cssRule(".ca-journal-stack .ca-journal-page-head");
    expect(inStack).not.toContain("position:");
    expect(inStack).not.toContain("isolation:");
  });

  // ── THE SPINE STOPPED BEING A GRAIN'S (5.31.2) ────────────────────────
  //
  // Four gated selectors here drew the page head's spine, gutter and wash, and
  // four more its eyebrow colour. `page-head.ts` writes `data-ca-grain` on a
  // diary entry and a period dashboard and `data-ca-journal` on a note inside a
  // registered journal — so SIX pages matched none of the eight and drew a bold
  // line of text over a hairline: the Homepage, Search, the Diary folder note,
  // every Logbook page, and the journals root's own folder note.

  it("no longer gates the head's spine on an attribute", () => {
    expect(css).not.toContain("border-left: 3px solid var(--ca-grain-spine)");
    expect(css).not.toContain(".ca-journal-page-head[data-ca-grain] .ca-jph-eyebrow");
    // SCALED BY THE RUNG SINCE 1.0.42, and the token is still what the presets
    // set — see "scales the spine and the title rather than restating them".
    expect(headCss).toContain(
      "border-left: calc(var(--ca-head-spine) * var(--ca-head-spine-k)) solid"
    );
    expect(headCss).toContain("color: var(--ca-grain-accent)");
  });

  it("still binds the colour per grain, and lets it inherit", () => {
    // WHAT IS LEFT HERE IS THE BINDING, which is what this file is for. A
    // custom property reaches a descendant on its own, so the four
    // `[data-ca-grain] .ca-journal-page-head` selectors that existed to paint a
    // head under an ancestor carrying the attribute are not needed either.
    expect(css).toContain('[data-ca-grain="daily"]');
    expect(css).toContain("--ca-grain-spine: var(--ca-grain-daily)");
  });

  it("dresses a head that is neither a grain nor a journal from the tokens", () => {
    // The journals root's own folder note is IN no journal — it is the page
    // that lists them — so nothing binds its colour, and `00-tokens.css` is the
    // answer. This is why that page cost no TypeScript.
    expect(tokens).toContain("--ca-grain-accent: var(--interactive-accent);");
    expect(tokens).toContain("--ca-grain-spine: var(--ca-grain-accent);");
  });

  it("sets a preset's spine as the token the rule beneath it also reads", () => {
    // `border-left-width: 2px` reached the border and not the pseudo-element
    // under it, so an editorial head's bottom rule went on being pulled back by
    // 3px and overhung its own spine by one.
    expect(css).toContain("--ca-head-spine: 2px");
    // COMMENTS OFF FOR THIS ONE: the paragraph above the rule names the
    // declaration it replaced, which is the point of the paragraph and would
    // otherwise be the thing this assertion found.
    expect(css.replace(/\/\*[\s\S]*?\*\//g, "")).not.toContain("border-left-width");
    expect(tokens).toContain("--ca-head-spine: var(--ca-rule-edge);");
  });

  it("gives the two diary roles that are not periods a grain of their own", () => {
    // The Diary folder note and every Logbook page. Daily for the first because
    // `diaryRoleOf` returns `dashboard` for the Daily folder's own note as well
    // — `OVERVIEW_UNIT` has no entry for that grain — and one role cannot hold
    // two colours. Yearly for a logbook: the widest window the palette has.
    // ONE FUNCTION SINCE 1.0.42, because three readers now need this answer —
    // the attribute, the rung, and the *Change the page icon* action's seed —
    // and the mass channel disagreeing with the colour channel is how a Logbook
    // would end up with yearly amber behind a daily's weight.
    expect(pageHeadSrc).toContain(
      'return role.role === "logbook" ? "yearly" : "daily";'
    );
    expect(pageHeadSrc).toContain("const grain = diaryGrainOf(plugin, file);");
    expect(pageHeadSrc).toContain('el.setAttr("data-ca-grain", grain)');
    expect(pageHeadSrc).toContain("paintRung(identity, grainRung(grain)");
  });

  // ── AND THE DIARY TOOK THE SAME DEPTH CHANNEL (1.0.42) ────────────────
  //
  // *"After it is done for Journals, it would make sense to also implement the
  // same choice for the diary dashboards."* Only the depth half travelled: the
  // five period hues have been hand-tuned since 4.80, so there is no accent to
  // compute — which is why `grainRung` returns no colour and `paintJournalRung`
  // does.
  it("ramps a diary page on the same three properties as a journal's", () => {
    // ONE WRITER FOR BOTH, which is the invariant: the ramp is read by one
    // `calc()` and two writers is how the two halves of one feature drift.
    for (const name of ["page-head", "vault-banner"]) {
      expect(readSrc(name === "page-head" ? "ui/widgets/page-head" : "ui/vault-banner"))
        .toContain("paintRung(");
    }
    const writer = readSrc("ui/rung");
    expect(writer).toContain('"data-ca-tier"');
    expect(writer).toContain('"--ca-tier-t"');
    expect(writer).toContain('"--ca-head-glyph"');
  });

  it("reads the grain accent for the rung's tint, not the journal's", () => {
    // A dashboard has a rung and NO `--ca-journal-accent`, so the journal token
    // resolved to nothing here and `--ca-grain-tint` became the
    // guaranteed-invalid value — every diary page would have lost its wash.
    const tier = cssRule("[data-ca-tier]");
    expect(tier).toContain("var(--ca-grain-accent-rgb)");
    expect(tier).not.toContain("--ca-journal-accent-rgb");
  });

  it("provides default appearance settings in DEFAULT_SETTINGS", () => {
    expect(DEFAULT_SETTINGS.appearance).toBeDefined();
    expect(DEFAULT_SETTINGS.appearance?.aestheticPreset).toBe("editorial");
    expect(DEFAULT_SETTINGS.appearance?.grainAesthetics).toBe("vibrant");
  });
});
