// Pixel operations on the flat RGB arrays tools/lib/png.mjs hands back.
//
// Kept apart from png.mjs so that file stays a codec and nothing else. Nothing
// here knows what it is drawing: the two callers — make-theme-strip.mjs and
// annotate-shot.mjs — hold the geometry.

/** Cut an image down to w*h around its own centre. */
export function centreCrop(img, w, h) {
  const x0 = Math.floor((img.width - w) / 2);
  const y0 = Math.floor((img.height - h) / 2);
  if (x0 < 0 || y0 < 0) throw new Error(`cannot crop ${img.width}x${img.height} up to ${w}x${h}`);
  const rgb = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const from = ((y + y0) * img.width + x0) * 3;
    rgb.set(img.rgb.subarray(from, from + w * 3), y * w * 3);
  }
  return { width: w, height: h, rgb };
}

export function blank(width, height, [r, g, b] = [0, 0, 0]) {
  const rgb = new Uint8Array(width * height * 3);
  for (let i = 0; i < rgb.length; i += 3) { rgb[i] = r; rgb[i + 1] = g; rgb[i + 2] = b; }
  return { width, height, rgb };
}

/** Read a pixel, clamping to the edge rather than wrapping or throwing. */
export function get(img, x, y) {
  const cx = Math.min(img.width - 1, Math.max(0, x | 0));
  const cy = Math.min(img.height - 1, Math.max(0, y | 0));
  const i = (cy * img.width + cx) * 3;
  return [img.rgb[i], img.rgb[i + 1], img.rgb[i + 2]];
}

/** Paint one pixel at coverage `a` (0..1). Off-image writes are dropped. */
export function blend(img, x, y, [r, g, b], a = 1) {
  if (a <= 0) return;
  const px = x | 0;
  const py = y | 0;
  if (px < 0 || py < 0 || px >= img.width || py >= img.height) return;
  const i = (py * img.width + px) * 3;
  const k = Math.min(1, a);
  img.rgb[i] += (r - img.rgb[i]) * k;
  img.rgb[i + 1] += (g - img.rgb[i + 1]) * k;
  img.rgb[i + 2] += (b - img.rgb[i + 2]) * k;
}

/** 0 below `edge - soft`, 1 above `edge + soft`, smooth between. */
export function smoothstep(edge, soft, v) {
  const t = Math.min(1, Math.max(0, (v - (edge - soft)) / (2 * soft)));
  return t * t * (3 - 2 * t);
}

export function fillRect(img, x, y, w, h, colour, a = 1) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) blend(img, i, j, colour, a);
}

/** Filled circle with a one-pixel soft edge. */
export function disc(img, cx, cy, r, colour, a = 1) {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      blend(img, x, y, colour, a * (1 - smoothstep(r, 0.5, d)));
    }
  }
}

/** Circle outline of the given thickness, soft on both edges. */
export function ring(img, cx, cy, r, thickness, colour, a = 1) {
  const half = thickness / 2;
  for (let y = Math.floor(cy - r - half - 1); y <= Math.ceil(cy + r + half + 1); y++) {
    for (let x = Math.floor(cx - r - half - 1); x <= Math.ceil(cx + r + half + 1); x++) {
      const d = Math.abs(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r);
      blend(img, x, y, colour, a * (1 - smoothstep(half, 0.5, d)));
    }
  }
}

/** Rounded-end line from (x0,y0) to (x1,y1), by distance to the segment. */
export function line(img, x0, y0, x1, y1, thickness, colour, a = 1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy || 1;
  const half = thickness / 2;
  const lo = (v, w) => Math.floor(Math.min(v, w) - half - 1);
  const hi = (v, w) => Math.ceil(Math.max(v, w) + half + 1);
  for (let y = lo(y0, y1); y <= hi(y0, y1); y++) {
    for (let x = lo(x0, x1); x <= hi(x0, x1); x++) {
      const t = Math.min(1, Math.max(0, ((x + 0.5 - x0) * dx + (y + 0.5 - y0) * dy) / len2));
      const d = Math.hypot(x + 0.5 - (x0 + t * dx), y + 0.5 - (y0 + t * dy));
      blend(img, x, y, colour, a * (1 - smoothstep(half, 0.5, d)));
    }
  }
}

/** Rounded rectangle outline — used for the box that marks a target block. */
export function roundRect(img, x, y, w, h, radius, thickness, colour, a = 1) {
  const half = thickness / 2;
  const x1 = x + w;
  const y1 = y + h;
  for (let py = Math.floor(y - half - 1); py <= Math.ceil(y1 + half + 1); py++) {
    for (let px = Math.floor(x - half - 1); px <= Math.ceil(x1 + half + 1); px++) {
      const cx = px + 0.5;
      const cy = py + 0.5;
      // Distance to the rounded rectangle's outline.
      const qx = Math.max(x + radius - cx, 0, cx - (x1 - radius));
      const qy = Math.max(y + radius - cy, 0, cy - (y1 - radius));
      const d = Math.abs(Math.hypot(qx, qy) - radius);
      blend(img, px, py, colour, a * (1 - smoothstep(half, 0.5, d)));
    }
  }
}

// ── digits ────────────────────────────────────────────────────────────────
//
// A 5x7 bitmap for 1-3. THREE GLYPHS IS THE WHOLE FONT because the annotated
// time grid carries three badges; a fourth control means adding a fourth row
// here, which is cheaper than the alternative of rasterising a real typeface
// with no font library in the tree.
const DIGITS = {
  "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
  "2": [".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"],
  "3": [".###.", "#...#", "....#", "..##.", "....#", "#...#", ".###."],
};

/** Draw a digit, `scale` pixels per cell, centred on (cx, cy). */
export function digit(img, ch, cx, cy, scale, colour, a = 1) {
  const rows = DIGITS[ch];
  if (!rows) throw new Error(`no glyph for "${ch}" — see DIGITS in tools/lib/draw.mjs`);
  const x0 = cx - (5 * scale) / 2;
  const y0 = cy - (7 * scale) / 2;
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 5; c++) {
      if (rows[r][c] !== "#") continue;
      fillRect(img, Math.round(x0 + c * scale), Math.round(y0 + r * scale), scale, scale, colour, a);
    }
  }
}

/** Cut an arbitrary rectangle out of an image. */
export function window(img, { x, y, w, h }) {
  const rgb = new Uint8Array(w * h * 3);
  for (let j = 0; j < h; j++) {
    const from = ((j + y) * img.width + x) * 3;
    rgb.set(img.rgb.subarray(from, from + w * 3), j * w * 3);
  }
  return { width: w, height: h, rgb };
}
