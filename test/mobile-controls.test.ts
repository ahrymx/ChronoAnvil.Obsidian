// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import {
  HIDE_MOBILE_OVERLAYS_CLASS,
  MOBILE_TOGGLE_BTN_CLASS,
} from "../src/ui/mobile-controls";
import { readCss } from "./sources";

describe("Mobile settings and controls", () => {
  it("defaults to overlayTogglePosition 'off' and hideOverlaysDefault false", () => {
    expect(DEFAULT_SETTINGS.mobile).toBeDefined();
    expect(DEFAULT_SETTINGS.mobile.overlayTogglePosition).toBe("off");
    expect(DEFAULT_SETTINGS.mobile.hideOverlaysDefault).toBe(false);
  });

  it("exports valid css class constants", () => {
    expect(HIDE_MOBILE_OVERLAYS_CLASS).toBe("am-hide-mobile-overlays");
    expect(MOBILE_TOGGLE_BTN_CLASS).toBe("am-mobile-toggle-btn");
  });

  it("declares touch-action: pan-y on journal-group and journal-group-pages for swipe isolation", () => {
    const css = readCss();
    const groupIdx = css.indexOf(".journal-group {");
    expect(groupIdx).toBeGreaterThan(-1);
    const groupBlock = css.slice(groupIdx, css.indexOf("}", groupIdx));
    expect(groupBlock).toContain("touch-action: pan-y;");

    const pagesIdx = css.indexOf(".journal-group-pages {");
    expect(pagesIdx).toBeGreaterThan(-1);
    const pagesBlock = css.slice(pagesIdx, css.indexOf("}", pagesIdx));
    expect(pagesBlock).toContain("touch-action: pan-y;");
  });

  it("declares flex-wrap: wrap on logbook toolbar controls for mobile screens", () => {
    const css = readCss();
    const topBarIdx = css.indexOf(".jcl-top-bar {");
    expect(topBarIdx).toBeGreaterThan(-1);
    const topBarBlock = css.slice(topBarIdx, css.indexOf("}", topBarIdx));
    expect(topBarBlock).toContain("flex-wrap: wrap;");

    const actionsIdx = css.indexOf(".jcl-actions-group {");
    expect(actionsIdx).toBeGreaterThan(-1);
    const actionsBlock = css.slice(actionsIdx, css.indexOf("}", actionsIdx));
    expect(actionsBlock).toContain("flex-wrap: wrap;");

    const statusIdx = css.indexOf(".jcl-status-row {");
    expect(statusIdx).toBeGreaterThan(-1);
    const statusBlock = css.slice(statusIdx, css.indexOf("}", statusIdx));
    expect(statusBlock).toContain("flex-wrap: wrap;");
  });

  it("declares flex-wrap: wrap on vault banner navigation and trail", () => {
    const css = readCss();
    const navIdx = css.indexOf(".am-vault-banner .avb-nav {");
    expect(navIdx).toBeGreaterThan(-1);
    const navBlock = css.slice(navIdx, css.indexOf("}", navIdx));
    expect(navBlock).toContain("flex-wrap: wrap;");

    const trailIdx = css.indexOf(".am-vault-banner .avb-trail {");
    expect(trailIdx).toBeGreaterThan(-1);
    const trailBlock = css.slice(trailIdx, css.indexOf("}", trailIdx));
    expect(trailBlock).toContain("flex-wrap: wrap;");
  });

  it("declares mobile toggle button and overlay hiding CSS rules", () => {
    const css = readCss();
    expect(css).toContain(".am-mobile-toggle-btn {");
    expect(css).toContain(".am-mobile-toggle-btn.am-mobile-toggle-left {");
    expect(css).toContain(".am-mobile-toggle-btn.am-mobile-toggle-right {");
    expect(css).toContain("body.am-hide-mobile-overlays .mobile-navbar");
    expect(css).toContain("body.am-hide-mobile-overlays .mobile-toolbar");
    expect(css).toContain("body.am-hide-mobile-overlays .view-header");
    expect(css).toContain("body.am-hide-mobile-overlays .mobile-header");
  });
});
