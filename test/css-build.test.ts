// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { composeCss, stripComments } from "../tools/build-css.mjs";
import { ROOT } from "./sources";

// ── the shipped stylesheet is the sources minus their prose ───────────────
//
// WHAT THIS IS FOR. The build concatenated styles/ verbatim until 5.0.1, and
// 58.6% of the 885 KB that produced was comment text — the design arguments,
// which run to paragraphs and are the best thing in the directory. Every byte
// was parsed by every vault on every launch, phones included, and none of it
// was legible where it landed: the reader of an argument has the repository
// open, and the reader of the plugin folder has a generated file.
//
// So the build strips them. That is a change to the artefact every user runs,
// made by a hand-rolled state machine over 885 KB of text, and the way it goes
// wrong is silent — CSS parsers do not report a rule they failed to understand,
// they drop it. The first test below is therefore the one that matters, and it
// is deliberately written against a DIFFERENT implementation than the build's.

const STYLES = join(ROOT, "styles");

const sources = (): { name: string; css: string }[] =>
  readdirSync(STYLES)
    .filter((f) => f.endsWith(".css"))
    .sort()
    .map((name) => ({ name, css: readFileSync(join(STYLES, name), "utf8") }));

// Comments out, whitespace flattened. Independent of the build on purpose: it
// is a regex where the build is a character walk, so the two agreeing is
// evidence rather than a tautology. Using the build's own stripper to check the
// build's own stripper would assert that a function equals itself.
//
// Replaces a comment with a SPACE where the build replaces it with nothing.
// That is not a discrepancy to fix — a CSS tokeniser drops comments without
// emitting whitespace, so the build is the spec-correct one — it is what makes
// this check able to SEE the difference. A comment sitting between two
// compound selectors (`.a/*x*/.b`) would normalise to `.a .b` here and `.a.b`
// there, and the assertion would fail rather than pass on a changed selector.
//
// WHAT IT DELIBERATELY CANNOT SEE, stated so nobody mistakes it for total: two
// spaces becoming one. Runs collapse on both sides, so a build that reflowed
// the whitespace INSIDE a rule passes here — and should, because that is the
// one difference CSS does not read. What survives the flattening is every
// token and the separation between them, which is why `.a .b` collapsing to
// `.a.b` still fails. Mutating the stripper to eat the character before each
// comment, or to collapse all whitespace, passes this test; mutating it to
// change one property name does not. That is the intended sensitivity.
const flatten = (css: string): string =>
  css
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("the CSS build strips comments and nothing else", () => {
  it("produces a stylesheet identical to the sources once whitespace is flattened", () => {
    const parts = sources();
    expect(parts.length).toBeGreaterThan(1);

    const before = flatten(parts.map((p) => p.css).join("\n"));
    const after = flatten(composeCss(parts));

    // Compared as whole strings so a failure names an offset. `toBe` on 345 KB
    // prints a diff nobody can read, so find the divergence first and assert on
    // a window around it — the point of failing is to say WHERE.
    if (before !== after) {
      let i = 0;
      while (i < before.length && i < after.length && before[i] === after[i]) i++;
      const window = (s: string): string => s.slice(Math.max(0, i - 100), i + 100);
      expect.fail(
        `The build changed the stylesheet at offset ${i}, not just its ` +
          `comments and whitespace.\n` +
          `  sources: …${window(before)}…\n` +
          `  built:   …${window(after)}…`
      );
    }
    expect(after).toBe(before);
  });

  it("actually removes the prose", () => {
    // The size claim, as a floor rather than a number. Pinning "358 KB" would
    // fail on the next paragraph anyone writes in styles/, which is the
    // opposite of the behaviour being encouraged.
    const parts = sources();
    const source = parts.reduce((n, p) => n + p.css.length, 0);
    const built = composeCss(parts).length;

    expect(built).toBeLessThan(source * 0.6);

    // And what remains is not prose. The banner and the per-file markers are
    // comments by construction; beyond those there should be almost nothing.
    const comments = [...composeCss(parts).matchAll(/\/\*[\s\S]*?\*\//g)]
      .map((m) => m[0].length)
      .reduce((a, b) => a + b, 0);
    expect(comments).toBeLessThan(built * 0.02);
  });

  it("keeps the licence notice and one marker per source file", () => {
    // styles.css is a file a reader HOLDS — see tools/package.mjs on conveyed
    // copies. The per-file SPDX headers in styles/ are ordinary comments and are
    // now stripped, so the one notice at the top is the only one left.
    const built = composeCss(sources());
    expect(built.startsWith("/*!")).toBe(true);
    expect(built).toContain("AGPL-3.0-or-later");
    expect(built).toContain("Copyright (C) 2026 AhryMX");

    for (const { name } of sources()) {
      expect(built, `no marker for ${name}`).toContain(`/*! ${name} */`);
    }
  });

  it("keeps a /*! comment and drops a plain one", () => {
    const css = "/* gone */\n.a { color: red }\n/*! kept */\n.b { color: blue }";
    const out = stripComments("x.css", css);
    expect(out).not.toContain("gone");
    expect(out).toContain("/*! kept */");
    expect(out).toContain(".a { color: red }");
    expect(out).toContain(".b { color: blue }");
  });

  it("still refuses a comment that closes early", () => {
    // The 4.x bug the walk was written for, asserted behaviourally now that the
    // walk is importable. A stray `*/` ends the comment early, the text after it
    // parses as a selector, and the CSS parser silently drops the rule that
    // follows. pure-logic.test.ts holds the same line from the other side, by
    // walking styles/ itself.
    expect(() => stripComments("x.css", "/* a */ b */ .c { }")).toThrow(
      /closes a comment that was not open/
    );
    expect(() => stripComments("x.css", ".a { } /* never closed")).toThrow(
      /ends inside an unclosed/
    );
  });

  it("has no comment delimiter inside a string in styles/", () => {
    // THE ASSUMPTION THE STRIPPER RESTS ON, asserted rather than assumed.
    //
    // The walk does not track string literals, so `content: "/*"` or a data URI
    // holding `*/` would fool it — and 00-tokens.css and 97-vault-banner.css
    // both carry inline SVG data URIs, which is exactly where such a thing
    // would arrive without anyone noticing. Neither exists today. If one ever
    // does, this fails HERE, naming the file, rather than in a browser as a
    // rule that quietly stopped applying.
    for (const { name, css } of sources()) {
      for (const m of css.matchAll(/(["'])((?:[^\\\n]|\\.)*?)\1/g)) {
        expect(
          m[2].includes("/*") || m[2].includes("*/"),
          `${name} has a comment delimiter inside a string: ${m[0].slice(0, 80)}. ` +
            `stripComments does not tokenise strings, so this would cut the ` +
            `stylesheet in the wrong place. Escape it or move it out of styles/.`
        ).toBe(false);
      }
    }
  });
});
