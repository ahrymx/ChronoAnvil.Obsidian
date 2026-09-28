// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";

import { srcFiles } from "./sources";

// ── "layout" is not a word this plugin says to a reader (1.0.46) ───────────
//
// WHY THIS EXISTS. Until 1.0.46 there were two words for three things: a
// template FILE in a journal's templates folder, the DEFAULT arrangement that
// file is composed from (`cfg.layout[key]`), and a SAVED NAMED arrangement
// (`cfg.variants`, `settings.entryLayouts`). The section editor drew a tab
// called *Layout* that stored nothing, beside a footer button called *Save as
// layout…* that stored everything, and the window that MANAGED the saved ones
// was called *Template…*. `core/vocabulary.ts` holds the definition that
// replaced all of it: a template is a saved arrangement of sections, and there
// is no second noun.
//
// A DEFINITION IN A COMMENT IS NOT A RESERVATION. `vocabulary.ts`' own header
// makes that argument about `page`, which drifted into nine meanings while a
// comment said it had one. The retired word comes back the way every retired
// word comes back — one string at a time, in a file nobody was thinking about
// the rule in — so the rule is a sweep.
//
// THE SHAPE IS `test/css-namespace.test.ts`'S, deliberately: every string
// literal in `src/`, comment lines skipped, against a named allowlist. It needs
// no theory about how a string reaches the screen, which is what made the class
// sweep catch the three shapes a call-site sweep missed.
//
// AND IT IS THE `Almanac` CONTRACT'S SIBLING (`test/product-name.test.ts`): a
// token kept in code for read-compatibility, absent from every reader-facing
// sentence. `pagelayout:` was the one exception that MOVED instead — a
// frontmatter key the reader types, so it became `pagetemplate:` with the old
// spelling still read. `test/legacy-tokens.test.ts` is that half.

// Lucide's icon ids. Not ours, not shown, and not renameable.
const ICONS = new Set([
  "layout-list",
  "layout-template",
  "layout-dashboard",
  "layout-grid",
  "layout-change",
]);

// The ordinary-English survivors, each an exact string. Exact rather than a
// pattern: "layout" as a word for how something is arranged on screen is fine,
// and the way that licence turns back into the retired noun is by being loose.
const ALLOWED = new Set([
  // Settings → Appearance. This is CSS-and-screen layout, and no reader has
  // ever confused it with a stored object, because it is not a countable one.
  "Mobile layout options and overlay controls",
]);

const isModulePath = (text: string): boolean => /^[.@/][\w./@-]*$/.test(text);

describe("the reader is never shown the word “layout”", () => {
  it("does not appear in any string literal in src/", () => {
    const bad: string[] = [];
    let scanned = 0;

    for (const { path, code } of srcFiles()) {
      code.split("\n").forEach((line, n) => {
        // Comment prose discusses the retired word constantly — it has to, or
        // the history of why it is retired could not be written down.
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        for (const lit of line.matchAll(
          /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*?)`/g
        )) {
          // `${…}` is a HOLE, and it is code rather than prose: `${layout.label}`
          // is a local reading a stored field, and the stored spellings are
          // format tokens that deliberately did not move. Blanked rather than
          // removed, so a hole stays a word boundary — the same call
          // `css-namespace.test.ts` makes about class stems.
          const text = (lit[1] ?? lit[2] ?? lit[3] ?? "").replace(
            /\$\{[^}]*\}/g,
            " "
          );
          scanned++;
          if (!/\blayouts?\b/i.test(text)) continue;
          if (isModulePath(text) || ICONS.has(text) || ALLOWED.has(text)) continue;
          bad.push(`${path}:${n + 1}  ${JSON.stringify(text)}`);
        }
      });
    }

    // A sweep that quietly scans nothing reports the invariant as held.
    expect(scanned).toBeGreaterThan(5000);
    expect(
      bad.sort(),
      `“layout” is retired as a reader-facing noun as of 1.0.46 — a saved ` +
        `arrangement of sections is a TEMPLATE. See src/core/vocabulary.ts for ` +
        `the definition and for the three senses that do survive. If one of ` +
        `these is ordinary English about how something is arranged on screen, ` +
        `add the exact string to ALLOWED in this file.`
    ).toEqual([]);
  });

  it("keeps the allowlist honest", () => {
    // An allowlist nobody prunes stops being a list of exceptions and becomes a
    // list of things that were once exceptions. `css-namespace.test.ts` makes
    // the same check for the same reason.
    const all = srcFiles()
      .map((f) => f.code)
      .join("\n");
    for (const text of [...ALLOWED, ...ICONS]) {
      expect(all, `${text} is allowlisted and no longer used`).toContain(text);
    }
  });

  it("states the definition and the boundary in vocabulary.ts", () => {
    const vocab = srcFiles().find((f) => f.path === "src/core/vocabulary.ts");
    expect(vocab).toBeTruthy();
    const code = vocab!.code;
    // The consts the rest of the plugin reads the word from.
    expect(code).toContain('export const TEMPLATE = "template"');
    expect(code).toContain('export const TEMPLATES = "templates"');
    expect(code).toContain('export const TEMPLATE_TITLE = "Template"');
    // And the boundary, which is the half that keeps a later sweep from eating
    // `core/layout.ts` and the stored keys.
    expect(code).toContain("core/layout.ts");
    expect(code).toContain("entryLayouts");
  });
});
