// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The canvas palette, against the token file it is a copy of.
//
// WHY A COPY EXISTS AT ALL. Every colour in this plugin is a `--am-*` custom
// property, read by a stylesheet — and a `.canvas` file is JSON that Obsidian
// draws itself. Our stylesheet never sees it, so `var(--am-ev-teal)` in a
// canvas node's `color` is not a colour, it is a string Obsidian will fail to
// parse. The hexes therefore have to be written a second time in TypeScript.
//
// A REFERENCE AND A DEFINITION THAT CAN DRIFT QUIETLY is the exact hazard
// `test/tokens.test.ts` was written for — it opens by recording that they had
// drifted in 164 places, "and nothing noticed because the drift was in dead
// code". This is the same guard for the same reason, one file along: change a
// hue in `00-tokens.css` and the canvas keeps painting the old one, on a
// surface nobody re-opens often enough to catch it by eye.
//
// So the rule is: `CANVAS_HUE` is not allowed to be an independent palette. It
// is `--am-ev-*`, and this test is what makes that sentence true.

import { describe, expect, it } from "vitest";
import { repoFile } from "./sources";
import { CANVAS_HUE } from "../src/core/canvas-builder";
import { EVENT_COLORS } from "../src/events/events";

// The `--am-ev-<name>` definitions in the token file, as a name→hex map.
//
// COMMENTS OUT FIRST, on `test/tokens.test.ts`'s own argument: prose in these
// files names tokens, and a sentence beginning `--am-ev-teal: …` at the start
// of a comment line is not a definition.
function tokenHues(): Record<string, string> {
  const css = repoFile("styles/00-tokens.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/^\s*--am-ev-([a-z]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/gm)) {
    out[m[1]] = m[2].toLowerCase();
  }
  return out;
}

describe("canvas palette", () => {
  it("matches --am-ev-* in styles/00-tokens.css, colour for colour", () => {
    const tokens = tokenHues();
    // Guard the guard: if the token names ever change shape, this test must
    // fail loudly rather than compare an empty map against an empty map and
    // pass while asserting nothing.
    expect(Object.keys(tokens).length).toBeGreaterThanOrEqual(EVENT_COLORS.length);

    const drift: string[] = [];
    for (const name of EVENT_COLORS) {
      const token = tokens[name];
      const canvas = CANVAS_HUE[name]?.toLowerCase();
      if (token !== canvas) drift.push(`--am-ev-${name}: ${token} but CANVAS_HUE.${name}: ${canvas}`);
    }
    expect(drift).toEqual([]);
  });

  it("covers every event colour, so a logbook's own hue always resolves", () => {
    // `hueOfBook` falls back to grey for an unknown name; a MISSING name here
    // would mean a registered logbook silently loses its colour.
    for (const name of EVENT_COLORS) {
      expect(CANVAS_HUE[name], `no canvas hue for ${name}`).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(Object.keys(CANVAS_HUE).sort()).toEqual([...EVENT_COLORS].sort());
  });

  it("holds no Obsidian preset index", () => {
    // What the prototype shipped: "1", "2", "4", "5", "6" — a palette this
    // plugin has no relationship with. A hex is the whole point.
    for (const [name, hex] of Object.entries(CANVAS_HUE)) {
      expect(hex, `${name} is a preset index, not a colour`).not.toMatch(/^[1-6]$/);
    }
  });
});
