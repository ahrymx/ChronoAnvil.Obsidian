// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// THE HELPER THAT STOPS A CSS ASSERTION QUIETLY PASSING. 4.35.3.
//
// A test helper needs its own test more than most code does, because everything
// downstream of it inherits its bugs as PASSES. `cssRule` exists to close two
// failure modes that both end in a green suite — an unanchored match reading
// the wrong rule, and a missing selector returning "" — so those two are what
// this file pins.

import { describe, expect, it } from "vitest";
import { cssRule, cssRules, readCss } from "./sources";

describe("cssRule finds the rule it was asked for", () => {
  it("returns the declarations of a real rule", () => {
    const rule = cssRule(".jjs-card");
    expect(rule).toContain("var(--am-border-inner)");
    expect(rule).toContain("border-radius");
  });

  it("stops at the rule's own closing brace", () => {
    // The bound. An unbounded slice runs on into whatever follows.
    expect(cssRule(".jjs-card")).not.toContain("{");
  });
});

describe("cssRule is anchored, which indexOf is not", () => {
  it("does not match a selector that merely ENDS with the name", () => {
    // THE 4.35.1 CASE. `.almanac-section-head-fold .almanac-section-title {`
    // contains `.almanac-section-title {` as a substring, so a plain indexOf
    // reads the descendant override — which states the opposite value.
    const bare = cssRule(".almanac-section-title");
    expect(bare).toContain("flex: 1 1 auto");
    const nested = cssRule(".almanac-section-head-fold .almanac-section-title");
    expect(nested).toContain("flex: 0 0 auto");
    expect(bare).not.toBe(nested);
  });

  it("matches a name inside a comma-separated selector list", () => {
    // `.jjs-card-when, .jjs-card-open { … }` is one rule naming two things, and
    // asking for either must find it.
    expect(cssRule(".jjs-card-when")).toContain("font-size");
    expect(cssRule(".jjs-card-open")).toBeTruthy();
  });
});

describe("cssRule throws rather than handing back nothing", () => {
  it("throws on a selector that does not exist", () => {
    // THE FAILURE THAT LOOKS LIKE A PASS. `indexOf` returns -1, the slice comes
    // back empty, and every `not.toContain` on it succeeds while asserting
    // nothing at all. A rename must break the test that guards it.
    expect(() => cssRule(".almanac-not-a-real-selector")).toThrow(
      /No CSS rule/
    );
  });

  it("names the selector in the error, so the failure says what to fix", () => {
    expect(() => cssRule(".almanac-not-a-real-selector")).toThrow(
      /almanac-not-a-real-selector/
    );
  });
});

describe("cssRules reaches inside at-rules", () => {
  it("finds a rule that appears both bare and in a container query", () => {
    // `.am-stats[data-cols="4"]` is declared at the top level and again inside
    // `@container (max-width: 480px)`. A helper that stopped at the top level
    // would silently miss the half that does the collapsing.
    const all = cssRules('.am-stats[data-cols="4"]');
    expect(all.length).toBeGreaterThan(1);
  });

  it("agrees with the raw stylesheet about what exists", () => {
    // A floor, so a scanner bug that returned nothing cannot pass the file.
    expect(readCss()).toContain(".jjs-card");
    expect(cssRules(".jjs-card").length).toBe(1);
  });
});
