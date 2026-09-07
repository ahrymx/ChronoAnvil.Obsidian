// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>

import { describe, expect, it } from "vitest";
import { readSrc, styleSheets } from "./sources";
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
    expect(pageHeadSrc).toContain('root.setAttr("data-ca-grain",');
    expect(pageHeadSrc).toContain('root.setAttr("data-ca-journal",');
    expect(vaultBannerSrc).toContain('root.setAttr("data-ca-grain", grain)');
    expect(vaultBannerSrc).toContain('root.setAttr("data-ca-journal", type.id)');
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
    expect(headCss).toContain(
      "border-left: var(--ca-head-spine) solid var(--ca-grain-spine)"
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
    expect(pageHeadSrc).toContain(
      'root.setAttr("data-ca-grain", role.role === "logbook" ? "yearly" : "daily");'
    );
  });

  it("provides default appearance settings in DEFAULT_SETTINGS", () => {
    expect(DEFAULT_SETTINGS.appearance).toBeDefined();
    expect(DEFAULT_SETTINGS.appearance?.aestheticPreset).toBe("editorial");
    expect(DEFAULT_SETTINGS.appearance?.grainAesthetics).toBe("vibrant");
  });
});
