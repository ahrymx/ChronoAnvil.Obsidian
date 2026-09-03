// Build docs/screenshots/themes.png — the same homepage under five themes, cut
// into five diagonal bands.
//
// WHAT THIS REPLACES. docs/screenshots/README.md described this composite for
// several releases while themes.png was a plain capture, byte-identical to one
// of the sources below, and told a maintainer to "re-run the compositor" that
// did not exist. This is that compositor.
//
// WHY THE BANDS ARE PARALLEL AND EQUAL. Band i is everything with
// `u = x - SLANT * (y - H/2)` between two consecutive cut lines. Because the
// cuts are PARALLEL, the area between two of them is exactly their spacing
// times the height — so five equal shares is just evenly spaced cut positions,
// and no boundary needs solving for.
//
// WHY SLANT IS 0.15 AND NOT THE 0.35 THE OLD NOTE SPECIFIED. 0.35 leans a band
// 0.35 * 1374 = 481px sideways. Five bands over 1657px are 331px wide, so at
// that slant every band shears clean past its own width: the strip at the top
// of the image and the strip at the bottom no longer overlap in x at all, and
// it stops reading as a panel. 0.15 leans 206px, comfortably inside 331. The
// old figure was correct for THREE bands (552px wide, wider than the lean) and
// is wrong for five.
//
//   node tools/make-theme-strip.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { decode, encode } from "./lib/png.mjs";
import { blend, centreCrop, get, smoothstep, window } from "./lib/draw.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CAPTURES = join(ROOT, "..", "screenshots", "readme-update-assets", "themes");
const OUT = join(ROOT, "docs", "screenshots", "themes.png");

// Left to right, LIGHT AND DARK ALTERNATING rather than in capture order.
// Capture order runs dark, dark, dark, light, light, and composited that way
// three of the four seams fall between two dark themes and read as a smudge
// rather than as a boundary. The image exists to show that the plugin takes
// the palette it is given; every seam should therefore be a place where it
// visibly does.
const THEMES = [
  { file: "20260903_01h19m11s_grim.png", name: "dark, geometric ground" },
  { file: "20260903_01h21m38s_grim.png", name: "light, cool grey" },
  { file: "20260903_01h21m18s_grim.png", name: "dark, monospace" },
  { file: "20260903_01h22m07s_grim.png", name: "light, warm parchment" },
  { file: "20260903_01h20m37s_grim.png", name: "dark, crosshatch weave" },
];

// The plugin's own pane, with Obsidian's file sidebar and window chrome cut
// away. THIS IS THE DIFFERENCE BETWEEN A COMPARISON AND A COLLAGE: sliced at
// full window width, one band lands on the file tree and another on the empty
// gutter beside the task panel, so two of the five show nothing that themes.
// Cropped to the dashboard, every band carries the nav bar, calendar or task
// list, and the same furniture can be read across all five.
const CROP = { x: 345, y: 38, w: 1312, h: 1120 };

const SLANT = 0.15;
const SEAM = 11;          // total width of the bevel, in pixels
const HIGHLIGHT = [216, 216, 220];
const MIDTONE = [107, 107, 115];
const SHADOW = [23, 23, 26];

const shots = THEMES.map((t) => decode(readFileSync(join(CAPTURES, t.file))));

// The five windows drift by a pixel or three. The captures are aligned by
// window centre, so crop to the common size from the centre out — anything
// else slides one theme's layout against the others and the seams stop lining
// up with the same page furniture.
const common = shots.map((s) =>
  centreCrop(s, Math.min(...shots.map((o) => o.width)), Math.min(...shots.map((o) => o.height)))
);
const W = CROP.w;
const H = CROP.h;
const bands = common.map((s) => window(s, CROP));

const band = W / THEMES.length;
const out = { width: W, height: H, rgb: new Uint8Array(W * H * 3) };

for (let y = 0; y < H; y++) {
  const lean = SLANT * (y - H / 2);
  for (let x = 0; x < W; x++) {
    const u = x - lean;
    const index = Math.min(THEMES.length - 1, Math.max(0, Math.floor(u / band)));
    const i = (y * W + x) * 3;
    const [r, g, b] = get(bands[index], x, y);
    out.rgb[i] = r;
    out.rgb[i + 1] = g;
    out.rgb[i + 2] = b;

    // The nearest cut line, and how far this pixel sits from it.
    const cut = Math.round(u / band);
    if (cut < 1 || cut > THEMES.length - 1) continue;
    const d = u - cut * band;
    if (Math.abs(d) > SEAM / 2) continue;

    // A three-stop chamfer: lit on the left, mid, then shadowed on the right.
    // Stepped rather than a smooth gradient because at the width this image is
    // rendered in the README a gradient reads as a blur, and a blur reads as a
    // rendering fault — which is the exact thing the wide seam exists to avoid.
    const t = d / (SEAM / 2);
    const colour = t < -0.45 ? HIGHLIGHT : t > 0.45 ? SHADOW : MIDTONE;
    // Soften only the outer edges, so the seam meets the page cleanly on a
    // diagonal instead of stair-stepping.
    blend(out, x, y, colour, 1 - smoothstep(SEAM / 2, 0.6, Math.abs(d)));
  }
}

writeFileSync(OUT, encode(out));
console.log(
  `themes.png  ${W}x${H}  ${THEMES.length} bands @ ${band.toFixed(1)}px, slant ${SLANT}, ${SEAM}px seams`
);
for (const [i, t] of THEMES.entries()) console.log(`  ${i + 1}. ${t.name}`);
