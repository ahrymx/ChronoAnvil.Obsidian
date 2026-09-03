// Build docs/screenshots/time-grid.png — the weekly hour grid, with its three
// gestures called out.
//
// WHY THE IMAGE CARRIES NUMBERS AND NOT WORDS. test/review-checklist.test.ts
// requires every README image to be `docs/screenshots/<name>.png`, so the
// caption cannot be an SVG overlay or HTML beside the picture. Rasterising
// prose would mean a font rasteriser, and there is no font library in this
// tree. So the image carries badges and the README carries the legend, which
// also means the wording can be corrected without regenerating a PNG.
//
// IT READS THE RAW CAPTURE, NOT ITS OWN OUTPUT. The source is the untouched
// grab under screenshots/; running this twice produces the same file rather
// than badges on top of badges.
//
//   node tools/annotate-shot.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { decode, encode } from "./lib/png.mjs";
import { digit, disc, line, ring, roundRect } from "./lib/draw.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(
  ROOT, "..", "screenshots", "readme-update-assets", "sections-widgets",
  "20260903_01h25m58s_grim.png"
);
const OUT = join(ROOT, "docs", "screenshots", "time-grid.png");

const ACCENT = [150, 116, 255];
const GHOST = [236, 232, 255];
const INK = [255, 255, 255];

// THE COORDINATES ARE THE ONLY THING TO EDIT WHEN THE CAPTURE IS RETAKEN.
// Each mark names a region of the 746x790 grab and where its badge sits. The
// third one is anchored to a drag the capture caught mid-gesture: the Friday
// block is in hand and the dashed outline on Sunday is where it would land.
const MARKS = [
  {
    n: "1",
    box: { x: 534, y: 382, w: 86, h: 131 },   // an empty Saturday morning
    badge: { x: 541, y: 377 },
    arrow: { from: [577, 404], to: [577, 494] },
  },
  {
    n: "2",
    box: { x: 94, y: 546, w: 82, h: 80 },     // the Monday block
    badge: { x: 101, y: 541 },
    ripple: [135, 586],
  },
  {
    n: "3",
    box: { x: 445, y: 570, w: 87, h: 82 },    // the Friday block, in hand
    badge: { x: 452, y: 565 },
    arrow: { from: [538, 600], to: [620, 620] },
  },
];

const img = decode(readFileSync(SOURCE));

/** A line with a head on the far end. */
function arrow(target, [x0, y0], [x1, y1], colour) {
  line(target, x0, y0, x1, y1, 3, colour);
  const a = Math.atan2(y1 - y0, x1 - x0);
  for (const spread of [2.5, -2.5]) {
    line(target, x1, y1, x1 + 13 * Math.cos(a + spread), y1 + 13 * Math.sin(a + spread), 3, colour);
  }
}

for (const mark of MARKS) {
  // The region being talked about, drawn twice: a dark halo underneath so the
  // outline survives a light block as well as the grid's own dark ground.
  roundRect(img, mark.box.x - 1, mark.box.y - 1, mark.box.w + 2, mark.box.h + 2, 6, 5, [0, 0, 0], 0.45);
  roundRect(img, mark.box.x, mark.box.y, mark.box.w, mark.box.h, 5, 2.5, ACCENT);

  if (mark.arrow) {
    arrow(img, mark.arrow.from, mark.arrow.to, [0, 0, 0]);
    arrow(img, mark.arrow.from, mark.arrow.to, GHOST);
  }

  // Two rings standing in for a click, for the one gesture that is a tap
  // rather than a drag and so has no direction to draw.
  if (mark.ripple) {
    const [cx, cy] = mark.ripple;
    ring(img, cx, cy, 11, 2.5, GHOST, 0.9);
    ring(img, cx, cy, 19, 2, GHOST, 0.45);
  }

  disc(img, mark.badge.x, mark.badge.y, 14, [0, 0, 0], 0.5);
  disc(img, mark.badge.x, mark.badge.y, 12.5, ACCENT);
  ring(img, mark.badge.x, mark.badge.y, 12.5, 2, INK, 0.9);
  digit(img, mark.n, mark.badge.x, mark.badge.y, 2, INK);
}

writeFileSync(OUT, encode(img));
console.log(`time-grid.png  ${img.width}x${img.height}  ${MARKS.length} marks`);
