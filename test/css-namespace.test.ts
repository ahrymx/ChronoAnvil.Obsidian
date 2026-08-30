// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { composeCss } from "../tools/build-css.mjs";
import { ROOT, styleSheets } from "./sources";

// ── one namespace, and the reason it has to be one ────────────────────────
//
// A plugin's stylesheet is loaded into the reader's vault ALONGSIDE their
// theme, their snippets and every other plugin they run, in one flat global
// scope with no isolation of any kind. `.card`, `.wide`, `.stats` and
// `.journal-header-bar` are not this plugin's names in that scope — they are
// everybody's, and the last stylesheet to load wins.
//
// This shipped 1,456 classes under about forty ad-hoc prefixes: `journal-`
// (315 of them), `jjs-`, `jbd-`, `jtc-`, `cal-`, `sb-`, and `ams-`/`amp-` from
// when the plugin was called Almanac. Only 414 carried a prefix that was the
// project's own. 5.0.1 folded all of it under `ca-`.
//
// WHAT GOES WRONG WITHOUT THIS TEST is not a crash. A class this plugin drops
// back into the shared scope collides silently: the reader's theme restyles
// something here, or this restyles something there, and the report that comes
// back is "the calendar looks wrong in Minimal" with no way to act on it. The
// namespace is the only thing preventing that, and a namespace with holes in
// it is not one — so the invariant is asserted rather than remembered.

const ALLOWED = new Set([
  // OBSIDIAN'S OWN, which this plugin reads and must spell exactly. These are
  // the whole legitimate case for an unprefixed class: an element the host
  // built, or a hook the host looks for.
  "app-header", "callout", "callout-content", "callout-icon", "callout-title",
  "callout-title-inner", "clickable-icon", "cm-editor", "cm-scroller",
  "cm-sizer", "dropdown", "inline-title", "internal-link",
  "markdown-preview-sizer", "markdown-preview-view", "markdown-reading-view",
  "markdown-source-view", "metadata-container", "mobile-header",
  "mobile-navbar", "mobile-toolbar", "mod-cta",
  "modal-button-container", "modal-close-button", "modal-content", "open",
  "setting-item", "setting-item-control",
  "setting-item-info", "setting-item-inline", "setting-item-name",
  "status-bar", "svg-icon", "tag", "theme-dark", "theme-light", "view-content",
  "view-header", "view-header-title-container", "workspace-leaf",
  "workspace-leaf-content", "workspace-mobile-header",

  // NOT OURS TO RENAME, because it is in the reader's notes. `cssclasses:
  // almanac-wide` was written into every homepage this plugin scaffolded
  // before the rename, by hand in some vaults, and the property is the user's
  // file. New notes get `ca-wide`; this stays so an un-migrated vault keeps
  // its wide pages. See tools/migrate-vault.mjs, which rewrites it on request.
  "almanac-wide",
]);

// COLLISION EXEMPTIONS: words that coincide with a `.ca-X` CSS class name
// when stripped of `ca-`, but are genuinely not classes (HTML elements,
// icons, frontmatter keys, directive names, section IDs, or ID prefixes).
const COLLIDES = new Set([
  // STEMS that build IDs rather than classes
  "bridge-", "journal-", "logbook-",

  // DIRECTIVE NAMES and section ids that share spelling with their wrapper class
  "bridge", "journal-breakdown", "journal-card", "journal-recent", "journal-tally",
  "stats", "stats-band",

  // DOMAIN WORDS, enum values, icon names and frontmatter properties
  "input", "journal-date", "kind", "kinds", "list", "repair", "settings", "wide",
]);

const COLLISION_USED = new Set<string>();

const selectorText = (): string => {
  let css = composeCss(styleSheets());
  css = css.replace(/\/\*![\s\S]*?\*\//g, " ");
  css = css.replace(/url\(\s*(["']?)data:[\s\S]*?\1\s*\)/g, " ");
  css = css.replace(/content:\s*"(?:[^"\\]|\\.)*"/g, " ");
  return [...css.matchAll(/([^{}]*)\{/g)].map((m) => m[1]).join(" ");
};

const prefixed = (name: string): boolean =>
  // `is-` and `has-` are STATE, not identity — Obsidian's own convention, and
  // they only ever appear compounded onto a class of ours (`.ca-cal-cell.is-
  // today`), so they never sit alone in the global scope.
  name.startsWith("ca-") || name.startsWith("is-") || name.startsWith("has-");

const used = new Set<string>();
const check = (name: string): boolean => {
  if (prefixed(name)) return true;
  if (ALLOWED.has(name)) {
    used.add(name);
    return true;
  }
  return false;
};

describe("every class this plugin ships is in one namespace", () => {
  it("prefixes every class in a selector in the shipped stylesheet", () => {
    // COMPOSED, NOT `readCss()`. `readCss` returns the styles/ SOURCES, and
    // this sweep reads selector text as "everything left of a `{`" — so every
    // design argument in the directory arrived as selectors, and the first run
    // of this test reported `.mjs`, `.png` and `.isMobile` among 76 findings.
    // The build strips the prose, and the built file is also the artefact that
    // lands in the vault, which is what the claim is actually about.
    const selectors = selectorText();
    const names = [...selectors.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map((m) => m[1]);

    expect(names.length).toBeGreaterThan(3000);

    const loose = [...new Set(names.filter((n) => !check(n)))].sort();
    expect(
      loose,
      `${loose.length} class(es) in styles/ sit in the global scope with no ` +
        `namespace: ${loose.join(", ")}. Prefix them with \`ca-\`, or — if the ` +
        `class is Obsidian's own and this rule only READS it — add it to ` +
        `ALLOWED above with a line saying which host element it names.`
    ).toEqual([]);
  });

  it("prefixes every class the plugin puts on an element", () => {
    // THE OTHER HALF, AND THE HALF THAT ROTS FIRST. A stylesheet is swept by
    // the test above whether or not anyone thinks about it; a class applied in
    // TypeScript is typed one call at a time, and the 5.0.1 fold found 71 that
    // no stylesheet sweep could have seen, because the CSS had already moved.
    //
    // ASKED FROM THE STYLESHEET, NOT FROM THE CALL SITE, and that is the whole
    // design of this check. Written first as "sweep `cls:` and `addClass(`",
    // it passed two mutations it was written to catch: `settingsButton(host,
    // "jeh-more")` hands a class to a helper, and calendar.ts builds one in a
    // `const classes = []` array — neither is a shape a context sweep knows.
    // There is no list of shapes that stays complete, because the next one is
    // written next week.
    //
    // So it inverts the question. For every class the stylesheet defines as
    // `.ca-X`, the bare `X` must not appear as a whole token in any string
    // literal in src/. That needs no theory about how the class reaches an
    // element — a concatenation, an array, a helper argument and a `cls:` are
    // all just the name sitting in a string. Paired with the sweep above it is
    // complete in both directions: a NEW unprefixed rule fails there, and
    // APPLYING a prefixed class by its old bare name fails here.
    const defined = new Set(
      [...selectorText().matchAll(/\.ca-([a-z][a-z0-9-]*)/g)].map((m) => m[1])
    );
    expect(defined.size).toBeGreaterThan(1000);

    const bad: string[] = [];
    for (const path of tsFiles(join(ROOT, "src"))) {
      const rel = path.slice(ROOT.length + 1);
      const lines = readFileSync(path, "utf8").split("\n");
      lines.forEach((line, n) => {
        // Comment prose names classes constantly and applies none.
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        for (const lit of line.matchAll(/"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*?)`/g)) {
          // `${…}` is a hole, and becomes a token boundary rather than
          // vanishing — otherwise a STEM like `cal-mood-${bucket}` would read
          // as the whole class `cal-mood-1` and be missed.
          const text = (lit[1] ?? lit[2] ?? "").replace(/\$\{[^}]*\}/g, " ");
          // A class list is bare lowercase names separated by spaces. A path,
          // a sentence or a selector is not one, and reading them as class
          // lists is where the false positives live.
          if (!/^[\sa-z0-9_-]*$/.test(text)) continue;
          for (const token of text.split(/\s+/)) {
            if (!token || token.startsWith("ca-") || token.startsWith("is-")) continue;
            if (token.startsWith("has-") || COLLIDES.has(token)) {
              COLLISION_USED.add(token);
              continue;
            }
            const hit =
              defined.has(token) ||
              // A trailing `-` is a stem: the class is composed at runtime.
              (token.endsWith("-") && [...defined].some((d) => d.startsWith(token)));
            if (hit) bad.push(`${rel}:${n + 1} applies "${token}" (.ca-${token} is the class)`);
          }
        }
      });
    }
    expect(
      bad.sort(),
      `class(es) applied by their pre-5.0.1 bare name. The stylesheet has ` +
        `moved to \`ca-\` and these have not, so they now style nothing — and ` +
        `they are back in the global scope, where the reader's theme can ` +
        `reach them. Prefix each one.`
    ).toEqual([]);
  });

  it("keeps the allowlist honest", () => {
    // An allowlist nobody prunes stops being a list of exceptions and becomes
    // a list of things that were once exceptions. Every entry has to still be
    // reachable, so that deleting the last use of a host class deletes its
    // licence to be unprefixed too.
    //
    // Depends on both sweeps above having run — vitest runs a file's tests in
    // order, so this is the last one.
    const unused = [...ALLOWED].filter((n) => !used.has(n)).sort();
    expect(
      unused,
      `${unused.length} allowlisted name(s) no longer appear anywhere: ` +
        `${unused.join(", ")}. Delete them.`
    ).toEqual([]);

    const unusedCollisions = [...COLLIDES].filter((n) => !COLLISION_USED.has(n)).sort();
    expect(
      unusedCollisions,
      `${unusedCollisions.length} collision exemption(s) no longer appear anywhere: ` +
        `${unusedCollisions.join(", ")}. Delete them.`
    ).toEqual([]);
  });
});

const tsFiles = (dir: string): string[] =>
  readdirSync(dir)
    .sort()
    .flatMap((entry) => {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) return tsFiles(p);
      return entry.endsWith(".ts") ? [p] : [];
    });
