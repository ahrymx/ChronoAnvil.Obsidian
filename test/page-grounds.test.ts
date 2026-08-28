// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The page grounds (4.80), and the one thing that can go wrong with nineteen
// of anything: the list and the stylesheet drifting apart.
//
// A GROUND THAT IS IN THE TABLE AND NOT IN THE CSS IS NOT AN ERROR ANYWHERE.
// The class is applied, matches no rule, and the reader picks a texture that
// does nothing — no exception, no warning, nothing in the console. The pair of
// assertions below is the only place that catches it, and they run in both
// directions because a rule with no table row is the same bug facing the other
// way: dead CSS nobody can reach.

import { describe, expect, it } from "vitest";
import { readSrc, styleSheets } from "./sources";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import {
  PAGE_GROUNDS,
  PAGE_GROUND_CLASSES,
  PAGE_GROUND_FAMILIES,
  PAGE_GROUND_MARKER,
  PAGE_GROUND_STRENGTHS,
  groundClass,
  groundsInFamily,
  strengthClass,
} from "../src/core/page-grounds";

const grounds = (): string => sheet("12-grounds.css");

// The selector one ground is drawn by, spelled the way the stylesheet spells
// it. Written once here so a change to the surface the ground paints is one
// edit in this file rather than nineteen.
const filmSelector = (id: string): string =>
  `body.${groundClass(id as never)} .workspace-leaf-content[data-type="markdown"]::before`;

const sheet = (name: string): string => {
  const found = styleSheets().find((s) => s.name === name);
  if (!found) throw new Error(`styles/${name} is missing.`);
  return found.css;
};

/** The leaf a ground paints, which every selector in the feature is scoped to. */
const LEAF = '.workspace-leaf-content[data-type="markdown"]';

/** The surfaces that would hide a ground if any of them stayed opaque. */
const SURFACES = [
  ".markdown-reading-view",
  ".markdown-preview-view",
  ".markdown-source-view",
  ".cm-editor",
  ".cm-scroller",
];

// Flat rules only, which is all either file has. A selector list is split so
// each member can be weighed on its own — the cascade weighs them that way too.
function rules(css: string): { selectors: string[]; body: string }[] {
  return [
    ...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g),
  ]
    .map((m) => ({
      selectors: m[1]
        .split(",")
        .map((x) => x.trim())
        .filter((x) => x.length > 0 && !x.startsWith("@")),
      body: m[2],
    }))
    .filter((r) => r.selectors.length > 0);
}

// Specificity as one comparable number. No `#id` appears anywhere in this
// plugin's sheets, so classes, attributes and pseudo-classes share a column and
// elements take the one below it.
function weigh(selector: string): number {
  const classes = (selector.match(/\.[a-z0-9_-]+/gi) ?? []).length;
  const attrs = (selector.match(/\[[^\]]*\]/g) ?? []).length;
  const pseudoClasses = (selector.match(/(?<!:):[a-z-]+(?:\([^)]*\))?/gi) ?? [])
    .length;
  const elements = (
    selector.match(/(?:^|[\s>+~])(?![.[:])[a-z][a-z0-9-]*/gi) ?? []
  ).length;
  return (classes + attrs + pseudoClasses) * 100 + elements;
}

describe("the ground table and the stylesheet agree", () => {
  it("draws every ground the table offers", () => {
    const css = grounds();
    const missing = PAGE_GROUNDS.filter((g) => !css.includes(filmSelector(g.id)));
    expect(missing.map((g) => g.id)).toEqual([]);
  });

  it("offers every ground the stylesheet draws", () => {
    // The other direction. A rule left behind by a rename is unreachable, and
    // unreachable CSS is what a reader finds when they go looking for the
    // texture a changelog promised.
    const known = new Set(PAGE_GROUNDS.map((g) => groundClass(g.id)));
    const drawn = [
      ...new Set(
        [...grounds().matchAll(/body\.(am-ground-[a-z0-9]+) \.workspace-leaf/g)].map(
          (m) => m[1]
        )
      ),
    ];
    expect(drawn.filter((c) => !known.has(c))).toEqual([]);
    expect(drawn.length).toBe(PAGE_GROUNDS.length);
  });

  it("gives each of the three strengths a rule", () => {
    const css = grounds();
    for (const level of PAGE_GROUND_STRENGTHS) {
      const at = css.indexOf(`body.${strengthClass(level.id)} {`);
      expect(at, level.id).toBeGreaterThan(-1);
      expect(css.slice(at, css.indexOf("}", at)), level.id).toContain(
        "--am-tex-strength:"
      );
    }
  });
});

describe("the shared film, which is what makes a pattern a surface", () => {
  const css = grounds();

  it("puts both films behind the note's content and above its background", () => {
    // `z-index: -1` is the whole of it, and it only holds inside a stacking
    // context — which `position: relative` alone does not make. Without the
    // isolation the films sink behind the workspace and are never seen.
    expect(css).toContain("isolation: isolate");
    const at = css.indexOf(
      `body.${PAGE_GROUND_MARKER} .workspace-leaf-content[data-type="markdown"]::before,`
    );
    expect(at).toBeGreaterThan(-1);
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toContain("z-index: -1");
    expect(rule).toContain("pointer-events: none");
  });

  it("wears the same grain over every pattern", () => {
    // The argument for a shared layer rather than a noise layer in each stack:
    // a new ground is grainy by existing, and nothing below can hold an opinion
    // about how grainy the plugin is.
    // Anchored on the token and not on the selector: `::after {` also ends the
    // two-selector rule that sets up both films, and indexOf finds that one.
    const at = css.indexOf("var(--am-tex-grain)");
    expect(at).toBeGreaterThan(-1);
    const rule = css.slice(css.lastIndexOf("{", at), css.indexOf("}", at));
    expect(
      css.slice(0, css.lastIndexOf("{", at))
    ).toMatch(
      /body\.am-ground \.workspace-leaf-content\[data-type="markdown"\]::after\s*$/
    );
    expect(rule).toContain("mix-blend-mode: overlay");
    // No pattern carries its own, which is the half that keeps it shared.
    const perPattern = [...css.matchAll(/var\(--am-tex-grain\)/g)];
    expect(perPattern.length).toBe(1);
  });

  it("stops the surfaces above it painting over it", () => {
    // Obsidian paints the reading view, the editor and the scroller, and each
    // of the three presets paints one as well. Any one left opaque hides the
    // ground completely.
    for (const surface of SURFACES) {
      expect(css, surface).toContain(
        `body.${PAGE_GROUND_MARKER} ${LEAF} ${surface}`
      );
    }
    expect(css).toContain("background-color: transparent");
  });

  it("out-weighs every preset rule that paints the same surface", () => {
    // ── THE BUG THIS GUARD IS MADE OF ────────────────────────────────────
    //
    // Grounds shipped showing on Modern Fluent and on nothing else. The
    // clearing rule read `body.am-ground .markdown-preview-view`, and both
    // other presets carry `body.am-preset-editorial .markdown-preview-view`
    // with a background on it — the same weight, one element and two classes.
    // At equal specificity the later declaration wins and the bundle
    // concatenates in filename order, so `99-aesthetic-presets.css` repainted
    // the surface opaque. Modern Fluent has no such rule, which is the only
    // reason two thirds of the feature looked fine.
    //
    // A STRING MATCH WOULD NOT HAVE CAUGHT IT and would not catch it coming
    // back: the old selector was present, correct, and outranked. So this
    // compares weights, and it reads both sides out of the stylesheets rather
    // than naming them — a fourth preset painting the same surfaces is caught
    // by the same assertion on the day it is written.
    const painters = rules(sheet("99-aesthetic-presets.css"))
      .filter((r) => /background-color/.test(r.body))
      .flatMap((r) => r.selectors)
      .filter((sel) => SURFACES.some((s) => sel.includes(s)));
    // If this is ever zero the guard has stopped guarding anything.
    expect(painters.length).toBeGreaterThan(0);

    const clears = rules(css)
      .filter((r) => /background-color:\s*transparent/.test(r.body))
      .flatMap((r) => r.selectors);

    for (const painter of painters) {
      const surface = SURFACES.find((s) => painter.includes(s)) as string;
      const mine = clears.filter((c) => c.includes(surface));
      expect(mine.length, `nothing clears ${surface}`).toBeGreaterThan(0);
      expect(
        Math.max(...mine.map(weigh)),
        `"${painter}" outranks the ground's clearing rule`
      ).toBeGreaterThan(weigh(painter));
    }
  });

  it("reads the strength token bare, since 00-tokens.css defines it", () => {
    // The house rule tokens.test.ts enforces globally, asserted here as well
    // because this is the file where somebody adds a twentieth pattern.
    expect(css).toContain("opacity: var(--am-tex-strength)");
    expect(css).not.toMatch(/var\(--am-tex-[a-z0-9-]+\s*,/);
  });
});

describe("the table itself", () => {
  it("has nineteen grounds in five families, none of them empty", () => {
    expect(PAGE_GROUNDS.length).toBe(19);
    expect(PAGE_GROUND_FAMILIES.length).toBe(5);
    for (const family of PAGE_GROUND_FAMILIES) {
      expect(groundsInFamily(family.id).length, family.id).toBeGreaterThan(0);
    }
    // Every ground belongs to a family the dropdown will render a group for.
    const known = new Set(PAGE_GROUND_FAMILIES.map((f) => f.id));
    expect(PAGE_GROUNDS.filter((g) => !known.has(g.family))).toEqual([]);
  });

  it("spells each id once", () => {
    const ids = PAGE_GROUNDS.map((g) => g.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("names every class the feature can leave on body", () => {
    // The list `apply()` clears from. One ground missing from it is one ground
    // that stacks with the next one the reader picks.
    for (const g of PAGE_GROUNDS) {
      expect(PAGE_GROUND_CLASSES, g.id).toContain(groundClass(g.id));
    }
    for (const s of PAGE_GROUND_STRENGTHS) {
      expect(PAGE_GROUND_CLASSES, s.id).toContain(strengthClass(s.id));
    }
    expect(PAGE_GROUND_CLASSES).toContain(PAGE_GROUND_MARKER);
  });
});

describe("the reader's half", () => {
  it("clears the whole set before applying one", () => {
    const src = readSrc("appearance");
    expect(src).toContain("body.removeClasses(PAGE_GROUND_CLASSES)");
    expect(src).toContain("document.body.removeClasses(PAGE_GROUND_CLASSES)");
  });

  it("adds the marker only when a ground is chosen", () => {
    // Off has to cost nothing. Without the marker the shared film rules do not
    // match, so a vault with no ground gets no overlay at all rather than a
    // transparent one on every note.
    const src = readSrc("appearance");
    expect(src).toMatch(/const ground = s\.pageGround \?\? "off";/);
    expect(src).toMatch(/if \(ground !== "off"\) \{[\s\S]*?addClass\(PAGE_GROUND_MARKER\)/);
  });

  it("builds the dropdown from the table, grouped by family", () => {
    // Nineteen literals in the settings file is how the settings file and the
    // stylesheet come to disagree.
    const src = readSrc("settings");
    expect(src).toContain("for (const family of PAGE_GROUND_FAMILIES)");
    expect(src).toContain('d.selectEl.createEl("optgroup"');
    expect(src).toContain("for (const ground of groundsInFamily(family.id))");
    expect(src).toContain("for (const level of PAGE_GROUND_STRENGTHS)");
    expect(src).toContain('d.addOption("off"');
  });

  it("ships off, at standard", () => {
    expect(DEFAULT_SETTINGS.appearance?.pageGround).toBe("off");
    expect(DEFAULT_SETTINGS.appearance?.pageGroundStrength).toBe("standard");
  });
});
