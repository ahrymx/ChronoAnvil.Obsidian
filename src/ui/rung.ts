// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.


// ── A NOTE'S RUNG, WRITTEN ONTO ITS ELEMENTS (1.0.42) ────────────────────
//
// *"Journal levels (and pages) look too similar which makes it easy to lose
// which index table you're looking at… After it is done for Journals, it would
// make sense to also implement the same choice for the diary dashboards."*
//
// The two domains answer "how deep is this page" from different tables —
// `JournalType.levels` and `kinds` for a journal, `CONTAINING_GRAIN` for the
// diary — and then say the same three things to the stylesheet. This module is
// those three things, once, so that the two halves of one feature cannot drift
// into two features.
//
// NO IMPORT FROM `journals/` OR `diary/`, DELIBERATELY. Both of those already
// import from `ui/`, so a type from either would close a cycle. A rung is four
// plain numbers and a string by the time it reaches here, which is all this
// needs to know.

/** Where a note sits on its domain's ramp, and what glyph it carries. */
export interface RungMark {
  /** 0-based, outermost first. */
  step: number;
  /** How many rungs the domain has — computed, never a literal. */
  of: number;
  /** 0..1, what the stylesheet ramps on. */
  t: number;
  emoji: string;
}

// ── THE RUNG'S GLYPH, AS A TILE (1.0.42) ────────────────────────────────
//
// *"Could the Icon be used as a repeating texture background on the banner? I
// think it would be a better visual than just a single plate."*
//
// One SVG data URI per rung, tiled across the head by `98-page-head.css`. The
// shape of the value is not new — `--ca-tex-grain` in `00-tokens.css` is the
// same thing for the page ground's noise — but that one is DECLARED, because it
// never varies. This one is a different glyph per note, so it is the first data
// URI in this plugin built in TypeScript.
//
// ── SIZE-INDEPENDENT, SO THE STYLESHEET OWNS THE DENSITY ───────────────
//
// The cell is 100 units and the glyphs are sized in those units, so the whole
// tile scales with `background-size` and the URI does not have to be rebuilt to
// change how dense the film is. That is what lets the depth channel be one
// `calc()` off `--ca-tier-t` instead of five strings from here.
//
// ── TWO GLYPHS ON A DIAGONAL, NOT ONE IN THE MIDDLE ────────────────────
//
// A single centred glyph repeats as a visible grid, which reads as a table
// behind the title. Offsetting a second, smaller one onto the opposite diagonal
// breaks the rows up and the repeat reads as a texture.
//
// ── `encodeURIComponent`, NOT A HAND-ESCAPE ────────────────────────────
//
// An emoji is multi-byte and a reader's own kind may carry any of them,
// including the variation selector in `🛠️`. Encoding the whole document is also
// what keeps `<`, `>`, `"` and `#` out of the CSS value — a raw `#` would be
// read as a fragment and truncate the URI, which is why `--ca-tex-grain` spells
// its one `#` as `%23`.
// AND THE FONT IS NAMED, which a page never has to do. An SVG used as a
// `background-image` is loaded as its own IMAGE DOCUMENT: it inherits nothing
// from the page — not the theme's font stack, not Obsidian's — and falls back to
// whatever the platform hands an unstyled `<text>`, which on a serif default is
// a font with no emoji coverage at all. Naming the three platform emoji families
// is the difference between a texture and an empty band, and `sans-serif` is
// there so a glyph that is not an emoji (a reader's kind may carry any string)
// still draws.
const GLYPH_FONT =
  "Apple Color Emoji,Segoe UI Emoji,Noto Color Emoji,Twemoji Mozilla,sans-serif";

export function glyphTile(emoji: string): string {
  const at = (x: number, y: number, size: number): string =>
    `<text x="${x}" y="${y}" font-size="${size}" font-family="${GLYPH_FONT}" ` +
    `text-anchor="middle" dominant-baseline="central">${emoji}</text>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">` +
    `${at(28, 28, 54)}${at(78, 78, 39)}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// ── A PAGE MAY NAME ITS OWN GLYPH (1.0.42) ──────────────────────────────
//
// *"add a entry to the banner actions menu to change the icon"*. A rung's glyph
// comes from the MODEL — a level's `fallbackEmoji`, a kind's `emoji`, a grain's
// — which is right for "all my Cheatsheets" and wrong for "this one page". This
// key is the per-note answer, and the two are not in competition: the journal
// editor already changes a kind's glyph for every note that has it.
//
// ONE FLAT WORD, no hyphen and no prefix, which is this plugin's frontmatter
// convention and not a preference — `kindtables`, `notetypes`, `pagelayout` and
// `prose` are the neighbours it has to sit beside in a reader's properties
// panel. Not `icon`: that key belongs to a widely-installed icon plugin, and a
// reader running both would find each of us reading the other's value.
export const PAGE_ICON_KEY = "pageicon";

// The override this note carries, or null.
//
// A STRING, TRIMMED, AND ANYTHING NON-EMPTY IS ACCEPTED. The picker offers
// emoji, but the value reaches an SVG `<text>` and a reader who typed `Σ` into
// their properties panel meant it — the tile names `sans-serif` after the three
// emoji families for exactly this. What is refused is only what would draw
// nothing: a blank, or a value that is not a string at all.
export function pageIconOf(fm: Record<string, unknown>): string | null {
  const raw = fm[PAGE_ICON_KEY];
  if (typeof raw !== "string") return null;
  const val = raw.trim();
  return val === "" ? null : val;
}

// Stamps a rung onto every element that carries it, or clears one.
//
// `icon` OVERRIDES THE RUNG'S OWN GLYPH AND NOTHING ELSE. The step, the ramp
// and therefore the mass, the tone and the film's density all stay the rung's —
// a reader changing the picture on a page is not telling us it is a different
// depth, and letting an icon move the ramp would make the one obvious control
// silently rewrite the channel the ramp exists to carry.
//
// IT REMOVES WHAT IT DOES NOT SET, which is `vault-banner.ts`' rule rather than
// either domain's: a leaf is REUSED across file switches, so a glyph left on the
// view is one that outlives the note that caused it — a stray note under a
// journal root would wear the last Cheatsheet's texture, and the Homepage would
// wear yesterday's sun. `page-head.ts` builds a fresh element every time and the
// removals are no-ops there.
export function paintRung(
  els: readonly HTMLElement[],
  rung: RungMark | null,
  icon: string | null = null
): void {
  for (const el of els) {
    if (!rung) {
      el.removeAttribute("data-ca-tier");
      el.style.removeProperty("--ca-tier-t");
      el.style.removeProperty("--ca-head-glyph");
      continue;
    }
    el.setAttr("data-ca-tier", String(rung.step));
    // THREE DECIMALS, because the ramp is read by `calc()` and a rung of a
    // three-level journal is a third. A full float in an inline style is noise
    // in every devtools inspection of a head for no visible difference.
    el.style.setProperty("--ca-tier-t", String(Math.round(rung.t * 1000) / 1000));
    el.style.setProperty("--ca-head-glyph", glyphTile(icon ?? rung.emoji));
  }
}
