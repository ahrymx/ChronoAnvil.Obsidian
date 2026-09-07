// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The page grounds, named once (4.80).
//
// WHY A TABLE AND NOT A DROPDOWN FULL OF LITERALS
//
// A ground is three things that have to agree: an id, a class in
// `styles/12-grounds.css`, and a row in the settings dropdown. Spelling one of
// them wrong is not an error anywhere — the class simply never matches and the
// reader picks a texture that does nothing. Both the dropdown and the class
// list are derived from this table, so the only way to add a ground is to add
// it here, and `page-grounds.test.ts` checks the stylesheet has the other half.
//
// The families are not decoration either. Nineteen options in one flat list is
// a wall; grouped into five, a reader who wants "something like paper" reads
// four rows and stops.

/** The five families, in the order the settings dropdown lists them. */
export type PageGroundFamilyId =
  | "paper"
  | "weave"
  | "print"
  | "light"
  | "crystal";

/** A ground, or `off` — which paints nothing at all. */
export type PageGroundId =
  | "off"
  | "dotgrid"
  | "graph"
  | "ruled"
  | "hatch"
  | "iso"
  | "check"
  | "argyle"
  | "zigzag"
  | "carbon"
  | "halftone"
  | "scanline"
  | "pinstripe"
  | "candy"
  | "seigaiha"
  | "stardust"
  | "facet"
  | "smoke";

/** How much of the pattern film is let through. */
export type PageGroundStrength = "faint" | "standard" | "full";

export interface PageGroundFamilySpec {
  id: PageGroundFamilyId;
  name: string;
  // What the family is for, shown as the dropdown's group label so the reason
  // to pick one travels with the names.
  note: string;
}

export interface PageGroundSpec {
  id: Exclude<PageGroundId, "off">;
  name: string;
  family: PageGroundFamilyId;
  // One line for the reader, in the dropdown row itself.
  note: string;
}

export const PAGE_GROUND_FAMILIES: PageGroundFamilySpec[] = [
  { id: "paper", name: "Paper", note: "desk surfaces, safest under dense text" },
  { id: "weave", name: "Weave & tile", note: "geometry that repeats on a tile" },
  { id: "print", name: "Print & screen", note: "reproduction artefacts" },
  { id: "light", name: "Ground & light", note: "no repeat you can point at" },
  { id: "crystal", name: "Crystal", note: "facets and a single light catch" },
];

export const PAGE_GROUNDS: PageGroundSpec[] = [
  // ── Paper ──────────────────────────────────────────────────────────────
  {
    id: "dotgrid",
    name: "Dot grid",
    family: "paper",
    note: "Minor dots every 24px, a heavier one every fifth",
  },
  {
    id: "graph",
    name: "Graph paper",
    family: "paper",
    note: "16px minor rules under a 96px major",
  },
  {
    id: "ruled",
    name: "Ruled lines",
    family: "paper",
    note: "27px baselines and one margin rule in the theme accent",
  },
  {
    id: "hatch",
    name: "Crosshatch",
    family: "paper",
    note: "Two hairline families at plus and minus 45 degrees",
  },
  {
    id: "iso",
    name: "Isometric",
    family: "paper",
    note: "30, 150 and vertical — isometric drafting paper",
  },
  // ── Weave & tile ───────────────────────────────────────────────────────
  {
    id: "check",
    name: "Checkerboard",
    family: "weave",
    note: "Two offset diagonals at 44px",
  },
  {
    id: "argyle",
    name: "Argyle",
    family: "weave",
    note: "A diamond lattice with crossing hairlines",
  },
  {
    id: "zigzag",
    name: "Zigzag",
    family: "weave",
    note: "Chevron bands from four corner gradients",
  },
  {
    id: "carbon",
    name: "Carbon fibre",
    family: "weave",
    note: "The 27/207 weave, tinted down to a whisper",
  },
  // ── Print & screen ─────────────────────────────────────────────────────
  {
    id: "halftone",
    name: "Halftone",
    family: "print",
    note: "A 45 degree dot screen at 20px — newsprint",
  },
  {
    id: "scanline",
    name: "Scanlines",
    family: "print",
    note: "1px in 4, under a CRT falloff",
  },
  {
    id: "pinstripe",
    name: "Pinstripe",
    family: "print",
    note: "One hairline family at 45 degrees, 14px apart",
  },
  {
    id: "candy",
    name: "Candy stripe",
    family: "print",
    note: "26px diagonal bands with a hairline on the seam",
  },
  // ── Ground & light ─────────────────────────────────────────────────────
  {
    id: "seigaiha",
    name: "Wave scales",
    family: "light",
    note: "Seigaiha — overlapping fans, brickworked",
  },
  {
    id: "stardust",
    name: "Star dust",
    family: "light",
    note: "Four coprime dot grids under a vignette",
  },
  // ── Crystal ────────────────────────────────────────────────────────────
  {
    id: "facet",
    name: "Facet",
    family: "crystal",
    note: "Conic sweeps cut by cleavage hairlines",
  },
  {
    id: "smoke",
    name: "Smoke",
    family: "crystal",
    note: "The same at twice the scale, hairlines removed",
  },
];

export const PAGE_GROUND_STRENGTHS: { id: PageGroundStrength; name: string }[] =
  [
    { id: "faint", name: "Faint (behind a calendar or a table)" },
    { id: "standard", name: "Standard" },
    { id: "full", name: "Full (a texture you are meant to notice)" },
  ];

/** The marker class every ground shares, which is what the shared film reads. */
export const PAGE_GROUND_MARKER = "ca-ground";

/** The class one ground is drawn by. */
export function groundClass(id: Exclude<PageGroundId, "off">): string {
  return `${PAGE_GROUND_MARKER}-${id}`;
}

/** The class one strength is set by. */
export function strengthClass(level: PageGroundStrength): string {
  return `${PAGE_GROUND_MARKER}-${level}`;
}

// Every class this feature can leave on `body`, so unloading is a list and not
// a memory of what was applied. The marker is first because it is the one that
// turns the films on at all.
export const PAGE_GROUND_CLASSES: string[] = [
  PAGE_GROUND_MARKER,
  ...PAGE_GROUNDS.map((g) => groundClass(g.id)),
  ...PAGE_GROUND_STRENGTHS.map((s) => strengthClass(s.id)),
];

/** The grounds of one family, in table order. */
export function groundsInFamily(family: PageGroundFamilyId): PageGroundSpec[] {
  return PAGE_GROUNDS.filter((g) => g.family === family);
}
