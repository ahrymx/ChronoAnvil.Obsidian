// A PNG reader and writer, in the standard library.
//
// WHY THIS EXISTS RATHER THAN A DEPENDENCY. Two images in docs/screenshots/ are
// built rather than captured — the five-theme strip and the annotated time
// grid — and both need pixels. Adding sharp or jimp to build them would put a
// package in package.json, and every dependency here is one the NOTICE and the
// esbuild banner have to agree about (see CLAUDE.md). zlib is built in, the
// captures are all one format, and the whole job is two functions.
//
// THE FORMAT IS NARROWED ON PURPOSE. Every capture in screenshots/ is 8-bit
// RGB, non-interlaced, no palette — checked before this file was written. So
// decode() REFUSES anything else rather than growing a general PNG reader that
// is mostly untested branches. A capture tool that starts writing RGBA will
// fail loudly here, which is the outcome to want: the alternative is a silent
// channel-shift across a composite nobody looks at closely.

import { deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// ── CRC32, the flavour PNG chunks carry ───────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── decode ────────────────────────────────────────────────────────────────

/**
 * Read an 8-bit RGB PNG into a flat pixel array.
 * @returns {{width:number,height:number,rgb:Uint8Array}} rgb is width*height*3.
 */
export function decode(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");

  let width = 0;
  let height = 0;
  const idat = [];

  // Walk the chunks. Anything ancillary (pHYs, and time-grid.png has one) is
  // skipped rather than carried: the output is a new image, not an edit of the
  // old one, so its metadata is not ours to keep.
  for (let i = 8; i < buf.length; ) {
    const length = buf.readUInt32BE(i);
    const type = buf.toString("latin1", i + 4, i + 8);
    const body = buf.subarray(i + 8, i + 8 + length);

    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      const [depth, colour, , , interlace] = [body[8], body[9], body[10], body[11], body[12]];
      if (depth !== 8 || colour !== 2 || interlace !== 0) {
        throw new Error(
          `only 8-bit non-interlaced RGB is supported (got depth ${depth}, colour type ${colour}, interlace ${interlace})`
        );
      }
    } else if (type === "IDAT") {
      idat.push(body);
    } else if (type === "IEND") {
      break;
    }
    i += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 3;
  const rgb = new Uint8Array(width * height * 3);

  // Undo the per-scanline filter. `a` is the pixel to the left, `b` the one
  // above, `c` the one above-left — all zero off the edges of the image.
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = y * (stride + 1) + 1;
    const out = y * stride;
    for (let x = 0; x < stride; x++) {
      const value = raw[line + x];
      const a = x >= 3 ? rgb[out + x - 3] : 0;
      const b = y > 0 ? rgb[out - stride + x] : 0;
      const c = x >= 3 && y > 0 ? rgb[out - stride + x - 3] : 0;
      let recon;
      switch (filter) {
        case 0: recon = value; break;
        case 1: recon = value + a; break;
        case 2: recon = value + b; break;
        case 3: recon = value + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          recon = value + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`unknown scanline filter ${filter} on row ${y}`);
      }
      rgb[out + x] = recon & 0xff;
    }
  }

  return { width, height, rgb };
}

// ── encode ────────────────────────────────────────────────────────────────

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

/**
 * Write a flat RGB array back out as a PNG.
 *
 * FILTER 1 (Sub) ON EVERY ROW, not the adaptive heuristic. These are UI
 * screenshots: long horizontal runs of one flat colour, which Sub turns into
 * long runs of zero and deflate then eats. Picking per row would cost a pass
 * over five 1657x1374 images to save a few percent nobody is measuring.
 */
export function encode({ width, height, rgb }) {
  const stride = width * 3;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const out = y * (stride + 1);
    raw[out] = 1;
    const line = y * stride;
    for (let x = 0; x < stride; x++) {
      raw[out + 1 + x] = (rgb[line + x] - (x >= 3 ? rgb[line + x - 3] : 0)) & 0xff;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 2;   // colour type: truecolour
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter method
  ihdr[12] = 0;  // interlace

  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
