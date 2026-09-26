// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The icon picker's table. 1.0.42, answering *"expand the amount of icons
// available in the selection menu"* — 32 glyphs in two categories became 240 in
// fifteen.
//
// WHY A TABLE OF DATA NEEDS A TEST AT ALL. Nothing here is logic, and that is
// exactly the problem: a table this size cannot be proof-read. Two of its three
// invariants are invisible to a reader scrolling past it, and both of them are
// bugs that show up as the WINDOW LYING about the reader's own choice:
//
//   A DUPLICATE marks two tiles. The picker gives `is-selected` to every tile
//   equal to the current glyph, so the same emoji in two categories says the
//   reader has chosen two different things.
//
//   A GAP marks none. Every glyph the plugin itself ships as a default may
//   already be saved in a vault; one missing from the table renders on the page
//   while the picker shows nothing selected, which reads as "your icon is not a
//   real icon". That includes the 32 the picker used to offer — they were
//   redistributed, not replaced, and dropping one silently orphans whoever
//   picked it.
//
// The third is geometry, and it is pinned against the stylesheet rather than
// against the number 16, so the two cannot drift apart.

import { describe, expect, it } from "vitest";
import { ICON_CATEGORIES } from "../src/ui/modals";
import { cssRule, readCode, readSrc, srcFiles } from "./sources";

const tiles = ICON_CATEGORIES.flatMap((c) => c.emojis);

/** The glyphs the plugin hands out with no reader involved. */
function shippedDefaults(): Map<string, string> {
  const out = new Map<string, string>();
  for (const { path, code } of srcFiles()) {
    const bare = code
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    const patterns = [
      /\b(?:emoji|fallbackEmoji)\s*:\s*"([^"]+)"/g,
      /\bEMOJI\s*=\s*"([^"]+)"/g,
    ];
    for (const re of patterns) {
      for (const m of bare.matchAll(re)) {
        if (!out.has(m[1])) out.set(m[1], path);
      }
    }
  }
  return out;
}

// The two categories the picker shipped with, verbatim. A literal rather than a
// count, because the point is not "there are still 32" — it is that these exact
// glyphs are the ones a reader's note may already name.
const ORIGINAL_32 = [
  "💼", "🎯", "🔗", "📅", "🗒️", "💡", "🚀", "📚",
  "📝", "⚡", "📌", "🏷️", "📊", "📋", "🛠️", "🔍",
  "☕", "✨", "🧘", "🩺", "💰", "🏃", "🏆", "🎨",
  "⏱️", "⭐", "🌿", "🍎", "🏠", "✈️", "🎧", "💬",
];

describe("the icon picker's table", () => {
  it("offers a great many more icons than it used to", () => {
    // The ask was for more, and a round of "more" that adds a row is a round
    // nobody notices. Stated as a floor, not an equality: the next category is
    // an edit to one array, not to this file.
    expect(tiles.length).toBeGreaterThanOrEqual(200);
    expect(ICON_CATEGORIES.length).toBeGreaterThanOrEqual(12);
  });

  it("never lists the same glyph twice", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const cat of ICON_CATEGORIES) {
      for (const emoji of cat.emojis) {
        const first = seen.get(emoji);
        if (first) clashes.push(`${emoji} in "${first}" and "${cat.label}"`);
        else seen.set(emoji, cat.label);
      }
    }
    expect(clashes).toEqual([]);
  });

  it("carries every glyph the plugin ships as a default", () => {
    // Each of these is already on somebody's page — a built-in journal type's
    // kind, a level's fallback, a tracker class, `DEFAULT_PAGE_EMOJI`. The
    // sweep reads them out of `src/` rather than listing them, so adding a
    // built-in kind with a glyph the picker does not offer fails here.
    const defaults = shippedDefaults();
    expect(defaults.size).toBeGreaterThan(15);
    const missing = [...defaults]
      .filter(([emoji]) => !tiles.includes(emoji))
      .map(([emoji, path]) => `${emoji} (${path})`);
    expect(missing).toEqual([]);
  });

  it("keeps all thirty-two icons it used to offer", () => {
    expect(ORIGINAL_32.filter((e) => !tiles.includes(e))).toEqual([]);
  });

  it("fills whole rows of the grid it is drawn in", () => {
    // A category one short of a full row ends with a hole, which reads as a
    // missing tile rather than the end of a group. The column count comes from
    // the stylesheet: hard-coding 8 here lets a narrower grid ship with every
    // category ragged and this test still green.
    const cols = /grid-template-columns:\s*repeat\((\d+),/.exec(
      cssRule(".ca-emoji-grid")
    );
    expect(cols).not.toBeNull();
    const per = Number(cols?.[1]);
    expect(per).toBeGreaterThan(1);
    const ragged = ICON_CATEGORIES.filter((c) => c.emojis.length % per !== 0);
    expect(ragged.map((c) => `${c.label}: ${c.emojis.length}`)).toEqual([]);
  });

  it("names every category, and names each one once", () => {
    const labels = ICON_CATEGORIES.map((c) => c.label);
    expect(labels.filter((l) => l.trim() === "")).toEqual([]);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("builds the table once rather than on every open", () => {
    // It lived inside `onOpen` until the round that grew it, which rebuilt 240
    // strings per glance and — the part that matters here — put it somewhere no
    // sweep could reach. Module scope is what makes every assertion above
    // possible, so it is pinned rather than trusted.
    const code = readCode("modals");
    const table = code.indexOf("export const ICON_CATEGORIES");
    const cls = code.indexOf("export class EmojiPickerModal");
    expect(table).toBeGreaterThan(0);
    expect(table).toBeLessThan(cls);
    expect(code.slice(cls)).not.toContain("emojis: [");
  });
});

describe("the picker window at 240 tiles", () => {
  const onOpen = (): string => {
    // Anchored on the class, because three modals in this file open with the
    // same two lines and a bare `onOpen` search finds whichever comes first.
    const src = readSrc("modals");
    const cls = src.indexOf("export class EmojiPickerModal");
    expect(cls).toBeGreaterThan(0);
    const at = src.indexOf("  onOpen(): void {", cls);
    expect(at).toBeGreaterThan(0);
    return src.slice(at, src.indexOf("\n  }\n", at));
  };

  it("scrolls the grids and not the typed field", () => {
    // Obsidian's modal grows to its content and then clips at the viewport, so
    // fifteen categories put the last ones out of reach AND scrolled away the
    // Save button — the one control that can choose a glyph the table has not
    // got. The field is created before the pane and the tiles go inside it.
    const body = onOpen();
    expect(body.indexOf("ca-emoji-input")).toBeLessThan(
      body.indexOf('cls: "ca-emoji-pane"')
    );
    expect(body).toContain('pane.createDiv({ cls: "ca-emoji-grid" })');
    const pane = cssRule(".ca-emoji-pane");
    expect(pane).toContain("overflow-y: auto");
    expect(pane).toMatch(/max-height:/);
    // And a pane at its end does not hand the wheel to the note behind it.
    expect(pane).toContain("overscroll-behavior: contain");
  });

  it("opens where the reader's current glyph is", () => {
    // With two categories the marked tile was always on screen. With fifteen it
    // usually is not, and a picker that opens at the top says nothing about the
    // current choice until the reader goes looking for it.
    const body = onOpen();
    expect(body).toContain('btn.addClass("is-selected")');
    expect(body).toContain('selected?.scrollIntoView({ block: "nearest" })');
  });

  it("is wide enough for the grid it draws", () => {
    // The tiles are a fixed 38px, so a narrower window does not reflow to seven
    // columns — it overflows. The rule did not exist at all until the table grew.
    expect(cssRule(".ca-emoji-modal")).toMatch(/min-width:/);
  });
});
