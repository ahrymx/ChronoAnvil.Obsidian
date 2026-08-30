// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>

import { describe, expect, it } from "vitest";
import { readCss, readSrc } from "./sources";
import { DEFAULT_SETTINGS } from "../src/core/settings";

describe("aesthetic presets and grain styling", () => {
  const css = readCss("99-aesthetic-presets");
  const tokens = readCss("00-tokens");
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

  it("provides default appearance settings in DEFAULT_SETTINGS", () => {
    expect(DEFAULT_SETTINGS.appearance).toBeDefined();
    expect(DEFAULT_SETTINGS.appearance?.aestheticPreset).toBe("editorial");
    expect(DEFAULT_SETTINGS.appearance?.grainAesthetics).toBe("vibrant");
  });
});
