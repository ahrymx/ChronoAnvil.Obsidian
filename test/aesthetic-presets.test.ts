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
    expect(tokens).toContain("--am-grain-daily:");
    expect(tokens).toContain("--am-grain-daily-rgb:");
    expect(tokens).toContain("--am-grain-weekly:");
    expect(tokens).toContain("--am-grain-weekly-rgb:");
    expect(tokens).toContain("--am-grain-monthly:");
    expect(tokens).toContain("--am-grain-monthly-rgb:");
    expect(tokens).toContain("--am-grain-quarterly:");
    expect(tokens).toContain("--am-grain-quarterly-rgb:");
    expect(tokens).toContain("--am-grain-yearly:");
    expect(tokens).toContain("--am-grain-yearly-rgb:");
  });

  it("binds grain-specific active accent variables in CSS", () => {
    expect(css).toContain('[data-am-grain="daily"]');
    expect(css).toContain('[data-am-grain="weekly"]');
    expect(css).toContain('[data-am-grain="monthly"]');
    expect(css).toContain('[data-am-grain="quarterly"]');
    expect(css).toContain('[data-am-grain="yearly"]');
    expect(css).toContain('[data-am-journal]');
  });

  it("supports Editorial Monastic and Technical HUD presets in CSS", () => {
    expect(css).toContain("body.am-preset-editorial");
    expect(css).toContain("body.am-preset-technical");
    expect(css).toContain("body.am-grain-monochrome");
    expect(css).toContain("body.am-grain-subtle");
  });

  it("stamps data-am-grain and data-am-journal in page-head.ts and vault-banner.ts", () => {
    expect(pageHeadSrc).toContain('root.setAttr("data-am-surface", said.surface)');
    expect(pageHeadSrc).toContain('root.setAttr("data-am-grain",');
    expect(pageHeadSrc).toContain('root.setAttr("data-am-journal",');
    expect(vaultBannerSrc).toContain('root.setAttr("data-am-grain", grain)');
    expect(vaultBannerSrc).toContain('root.setAttr("data-am-journal", type.id)');
  });

  it("provides default appearance settings in DEFAULT_SETTINGS", () => {
    expect(DEFAULT_SETTINGS.appearance).toBeDefined();
    expect(DEFAULT_SETTINGS.appearance?.aestheticPreset).toBe("modern");
    expect(DEFAULT_SETTINGS.appearance?.grainAesthetics).toBe("vibrant");
  });
});
