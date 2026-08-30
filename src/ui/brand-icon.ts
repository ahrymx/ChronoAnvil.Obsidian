// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The ChronoAnvil mark: an anvil whose waist is an hourglass.
//
// ONE DRAWING, TWO PLACES. The ribbon button and the banner tile are the only
// two things in the plugin that stand for the product rather than for one of
// its features, and they were saying different things — a borrowed `book-open`
// in the ribbon, the vault's initials in the tile. Both now draw this.
//
// WHY IT IS REGISTERED RATHER THAN NAMED. `addRibbonIcon` and `setIcon` accept
// a registered icon id, and Obsidian ships Lucide's set under those names.
// Nothing in Lucide is an anvil, so the mark has to be registered with
// `addIcon` first — that is the whole reason this module exists.
//
// THE TWO GRIDS. The mark is authored on Lucide's 24-unit grid so its weight
// and joinery match the built-ins it sits beside in the ribbon. `addIcon`
// renders on a 100-unit grid. The `scale()` below is that conversion and the
// only reason the paths are not used directly; keep authoring in 24 and let the
// transform do the rest, because a path re-typed at 100 units drifts from the
// icons it is supposed to match.

import { addIcon } from "obsidian";

export const BRAND_ICON_ID = "chronoanvil-mark";

// 24-grid, y 4 → 20 so the mark sits centred on the grid rather than low. The
// three parts are the anvil's slab (with the horn tapering left), the hourglass
// that stands in for its waist, and the flared base.
export const BRAND_ICON_PATHS: readonly string[] = [
  "M20 4H7.5L3.5 6.5 7.5 9H20Z",
  "M9.3 9h5.4L12 12.75l2.7 3.75H9.3L12 12.75Z",
  "M7.5 16.5h9l1.5 3.5H6Z",
];

// 1.5 rather than Lucide's default 2: the mark carries three enclosed shapes
// where most Lucide icons carry one, and at 2 the hourglass waist closes up at
// ribbon size.
export const BRAND_ICON_STROKE = 1.5;

// 24 → 100. Written out rather than left as `100/24` so the string this
// produces is stable and diffable.
const SCALE = 100 / 24;

// The inner SVG `addIcon` takes. `currentColor` is what lets one drawing serve
// a ribbon button, an accent-filled tile and a hovered menu item without three
// copies tinted three ways.
export const BRAND_ICON_SVG = [
  `<g transform="scale(${SCALE.toFixed(4)})" fill="none" stroke="currentColor"`,
  ` stroke-width="${BRAND_ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round">`,
  BRAND_ICON_PATHS.map((d) => `<path d="${d}"/>`).join(""),
  `</g>`,
].join("");

// Registered once, from `onload`, before anything asks for the id.
//
// IDEMPOTENT BY OBSIDIAN'S OWN BEHAVIOUR: `addIcon` overwrites an existing id,
// so a plugin reload during development replaces the drawing instead of
// stacking a second one.
export function registerBrandIcon(): void {
  addIcon(BRAND_ICON_ID, BRAND_ICON_SVG);
}
