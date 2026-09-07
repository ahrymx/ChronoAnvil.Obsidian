// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Reaching the rest of the page while something is in your hand. 4.57.
//
// ── WHAT WAS WRONG, IN THE READER'S WORDS ────────────────────────────
//
// *"The page depth is locked when the drag handles are actively held."* Pick a
// widget up on a long homepage and the page stops moving: the only landing
// places are the ones that were already on screen when you started. A note
// taller than its pane cannot be rearranged past the fold at all, which turns a
// direct gesture into one that only works on short pages.
//
// ── WHY IT IS LOCKED, AND WHY THIS IS THE FIX RATHER THAN A SETTING ──
//
// ChronoAnvil drags with the HTML5 drag-and-drop API — `draggable`, `dragstart`,
// `dataTransfer` — in all three places it drags at all: a widget on the page
// (`block-drag.ts`), a row in the section editor, and a journal card. That
// choice is load-bearing and is argued at each site: `dataTransfer.types` is
// what lets a landing place accept or decline a drag BEFORE the reader commits,
// which is the whole of "no slot lights up for a drop it would refuse".
//
// The price is the input stream. While a native drag is in flight the browser
// runs its own loop: the page is sent drag events and nothing else. No
// `pointermove`, no `mousemove` — `block-drag.ts` already relies on that fact
// in the other direction, using the first `mouseover` afterwards as its "the
// drag is over" signal.
//
// So the page cannot scroll because nothing is telling it to. What the drag
// loop DOES deliver is `dragover`, with coordinates, several times a second —
// and that is enough to say where the pointer is. This module turns that into
// the two things a reader expects of a long page mid-drag:
//
//   AN EDGE BAND. Near the top or the bottom of the scrolling pane, the pane
//   moves — faster the closer to the edge, so a reader controls the speed by
//   the same movement they are already making. This is the mechanism, and it
//   works everywhere.
//
//   AND THE WHEEL, WHERE THE PLATFORM SENDS IT. Chromium's drag loop does not
//   deliver `wheel` to the page today; other engines do, and Obsidian is not
//   the only place this code will ever run. The listener is one registration
//   for the length of one gesture and it feeds the same scroller the edge band
//   does — so where the wheel arrives it works, and where it does not the edge
//   band is the whole answer. It is written this way round deliberately: an
//   edge band that only existed as a fallback for the wheel would be the
//   feature nobody tested.
//
// ── PURE ARITHMETIC FIRST, THEN THIRTY LINES OF WIRING ───────────────
//
// Everything that can be wrong by a number — how deep the band reaches, how
// fast the pane moves at a given depth, what a wheel notch is worth in pixels —
// is a function of its arguments and nothing else, on `cell-move.ts`' and
// `time-grid.ts`' precedent. The DOM half below has no arithmetic in it.

// How deep the band reaches in from each edge, as a fraction of the pane.
//
// A FRACTION WITH BOTH ENDS PINNED. A fixed number of pixels is wrong at both
// extremes: 60px of a 300px sidebar is two bands covering half the pane, and
// 60px of a 1400px monitor is a target a reader has to aim at. The fraction
// keeps it proportionate and the two clamps keep it usable — never so shallow
// that it is hard to hit, never so deep that the middle of a short pane is all
// band.
const EDGE_FRACTION = 0.12;
const EDGE_MIN = 44;
const EDGE_MAX = 140;

// Pixels per frame at the very edge — about 1,100/second at 60fps, which
// crosses a long homepage in a couple of seconds without overshooting the
// block a reader is aiming at.
const MAX_SPEED = 18;

// What one wheel notch is worth when the platform reports lines rather than
// pixels. Firefox does; it is roughly one line of body text.
const WHEEL_LINE_PX = 16;

// The band for a pane of this height.
export function panBand(height: number): number {
  if (!Number.isFinite(height) || height <= 0) return 0;
  return Math.min(EDGE_MAX, Math.max(EDGE_MIN, Math.round(height * EDGE_FRACTION)));
}

// How far the pane should move this frame, in pixels: negative up, positive
// down, zero for a pointer in the middle.
//
// THE TWO BANDS MAY NOT OVERLAP. On a pane shorter than two bands each one is
// halved instead, because a pointer inside both would otherwise be asked to
// scroll up and down at once — and whichever test ran first would win, which is
// a coin toss dressed as a rule.
//
// THE RAMP IS SQUARED, NOT LINEAR. A linear ramp reaches half speed halfway
// into the band, which is where a reader is most likely to be merely PASSING
// through on the way to a landing place near the edge — so the page runs away
// from them while they aim. Squared keeps the first half of the band slow
// enough to aim in and puts the speed where the intent is unambiguous.
//
// AND THE FLOOR IS ONE PIXEL. `t * t` at the lip of the band rounds to zero,
// which would be a band with a dead strip inside it — the reader is inside the
// region that is supposed to scroll and nothing happens. A pixel a frame is a
// crawl, and a crawl is the honest reading of "barely inside".
export function panVelocity(
  y: number,
  top: number,
  bottom: number,
  band: number,
  max: number = MAX_SPEED
): number {
  const height = bottom - top;
  if (!(height > 0) || !(band > 0)) return 0;
  const reach = Math.min(band, height / 2);

  const intoTop = top + reach - y;
  if (intoTop > 0) return -ramp(intoTop, reach, max);

  const intoBottom = y - (bottom - reach);
  if (intoBottom > 0) return ramp(intoBottom, reach, max);

  return 0;
}

function ramp(into: number, reach: number, max: number): number {
  const t = Math.min(1, into / reach);
  return Math.max(1, Math.round(max * t * t));
}

// A wheel event's vertical intent, in pixels.
//
// THREE UNITS, AND THE PLATFORM PICKS. `deltaMode` is pixels, lines or pages,
// and reading `deltaY` without it makes a Firefox notch worth three pixels.
export function wheelPixels(
  deltaY: number,
  deltaMode: number,
  pageHeight: number
): number {
  if (!Number.isFinite(deltaY)) return 0;
  if (deltaMode === 1) return deltaY * WHEEL_LINE_PX;
  if (deltaMode === 2) return deltaY * (pageHeight > 0 ? pageHeight : 0);
  return deltaY;
}

// ── the DOM half ──────────────────────────────────────────────────────

// The nearest ancestor that actually scrolls, or null.
//
// NEAREST, NOT OUTERMOST, because a modal's list sits inside a page that also
// scrolls and the reader means the one they are dragging in. `scrollHeight >
// clientHeight` is asked as well as the overflow style: every pane in Obsidian
// is `overflow-y: auto`, and one whose content fits is not a scroller, it is a
// box the pan would spin against.
export function scrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  const view = el?.ownerDocument?.defaultView;
  if (!view) return null;
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const overflow = view.getComputedStyle(node).overflowY;
    if (
      (overflow === "auto" || overflow === "scroll" || overflow === "overlay") &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
  }
  return null;
}

// Start panning for one drag, and hand back the way to stop.
//
// CALLED AT `dragstart` AND STOPPED AT `dragend`, which is the lifetime of the
// gesture and is why nothing here is registered on the plugin: a listener that
// outlives the drag it was added for is a listener on every drag afterwards.
// The returned function is idempotent, because two things call it — the source's
// own `dragend`, and a `drop` anywhere in the document, which is the case where
// the gesture ends somewhere this element never hears about.
export function panDuringDrag(from: HTMLElement): () => void {
  const scroller = scrollableAncestor(from);
  const doc = from.ownerDocument;
  const view = doc?.defaultView;
  if (!scroller || !view) return () => {};

  // WHERE THE POINTER WAS LAST SEEN. Null until the first `dragover`, so a drag
  // that starts and never moves scrolls nothing.
  let at: number | null = null;
  let frame = 0;
  let live = true;

  const onOver = (evt: DragEvent): void => {
    at = evt.clientY;
  };

  const onWheel = (evt: WheelEvent): void => {
    const px = wheelPixels(evt.deltaY, evt.deltaMode, scroller.clientHeight);
    if (!px) return;
    scroller.scrollTop += px;
    // THE PAGE UNDER THE DRAG MUST NOT ALSO SCROLL. Where the wheel does arrive
    // mid-drag the browser has already decided not to act on it; saying so
    // costs nothing and keeps this the only thing moving the pane.
    evt.preventDefault();
  };

  const step = (): void => {
    if (!live) return;
    frame = view.requestAnimationFrame(step);
    if (at === null) return;
    // MEASURED EVERY FRAME. A pane can be resized under a drag — the sidebar
    // opening, the window changing — and the band is a fraction of a height
    // that is only true now.
    const box = scroller.getBoundingClientRect();
    const by = panVelocity(at, box.top, box.bottom, panBand(box.height));
    if (by) scroller.scrollTop += by;
  };

  const stop = (): void => {
    if (!live) return;
    live = false;
    view.cancelAnimationFrame(frame);
    doc.removeEventListener("dragover", onOver, true);
    doc.removeEventListener("wheel", onWheel, true);
    doc.removeEventListener("drop", stop, true);
  };

  // CAPTURING, ALL THREE. A drop handler that calls `stopPropagation` — which
  // `block-drag.ts`'s slots do, so a block does not hear its own child's drop
  // twice — would otherwise leave the loop running after the gesture that
  // started it has finished.
  doc.addEventListener("dragover", onOver, true);
  doc.addEventListener("wheel", onWheel, { capture: true, passive: false });
  doc.addEventListener("drop", stop, true);
  frame = view.requestAnimationFrame(step);

  return stop;
}
