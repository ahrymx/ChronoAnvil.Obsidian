// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Reaching the rest of the page mid-drag. 4.57.
//
// TWO THINGS ARE WORTH ASSERTING HERE AND THEY ARE DIFFERENT IN KIND.
//
// THE ARITHMETIC, because every way this can be wrong is a number: a band that
// swallows a short pane, a ramp that runs away from a reader aiming at a
// landing place, a dead strip inside the band where nothing happens, a wheel
// notch read without its unit. None of that needs a DOM and all of it is
// exactly the shape `cell-move.ts` and `time-grid.ts` are tested in.
//
// AND THE RULE THAT EVERY DRAG GETS IT, which is a fact about six call sites
// rather than about a function. The plugin drags in six places and they were
// written across nine releases; the seventh will be written by somebody who has
// not read this file. A test that counts `dragstart` listeners and demands each
// one pan is the only version of that rule that survives the next drag.

import { describe, expect, it } from "vitest";
import {
  panBand,
  panVelocity,
  wheelPixels,
} from "../src/ui/drag-scroll";
import { allSrcNames, readSrc } from "./sources";

describe("the band, which is where the pane starts moving", () => {
  it("is a fraction of the pane, so it is proportionate on any of them", () => {
    // 12% of an 800px reading pane is about a centimetre — big enough to fall
    // into on the way to the edge, small enough that the middle of the pane is
    // still still.
    expect(panBand(800)).toBe(96);
    expect(panBand(1000)).toBe(120);
  });

  it("has a floor, so a short pane still has something to aim at", () => {
    // 12% of a 240px sidebar is 29px, which is a target rather than a band.
    expect(panBand(240)).toBe(44);
    expect(panBand(100)).toBe(44);
  });

  it("has a ceiling, so a tall monitor is not half band", () => {
    expect(panBand(2000)).toBe(140);
    expect(panBand(4000)).toBe(140);
  });

  it("is nothing for a pane with no height", () => {
    expect(panBand(0)).toBe(0);
    expect(panBand(-10)).toBe(0);
    expect(panBand(Number.NaN)).toBe(0);
  });
});

describe("how fast the pane moves, and which way", () => {
  const TOP = 100;
  const BOTTOM = 900;
  const BAND = panBand(BOTTOM - TOP);
  const v = (y: number): number => panVelocity(y, TOP, BOTTOM, BAND);

  it("does nothing in the middle, which is most of the pane", () => {
    expect(v(500)).toBe(0);
    expect(v(TOP + BAND + 1)).toBe(0);
    expect(v(BOTTOM - BAND - 1)).toBe(0);
  });

  it("goes up near the top and down near the bottom", () => {
    expect(v(TOP + 10)).toBeLessThan(0);
    expect(v(BOTTOM - 10)).toBeGreaterThan(0);
  });

  it("moves at all everywhere inside the band", () => {
    // THE DEAD STRIP THIS RULES OUT. A squared ramp at the lip of the band
    // rounds to zero, so a reader would be inside the region that is supposed
    // to scroll with nothing happening — which reads as the feature not working
    // rather than as a slow start.
    for (let y = TOP; y < TOP + BAND; y++) expect(v(y), `y=${y}`).toBeLessThan(0);
    for (let y = BOTTOM - BAND + 1; y <= BOTTOM; y++) {
      expect(v(y), `y=${y}`).toBeGreaterThan(0);
    }
  });

  it("speeds up towards the edge, and keeps the first half slow", () => {
    // THE RAMP IS SQUARED, AND THIS IS WHY. Halfway into the band is where a
    // reader is most likely to be merely passing through on the way to a
    // landing place near the edge, so a linear ramp — half speed there — runs
    // the page away from them while they aim.
    const half = Math.abs(v(TOP + BAND / 2));
    const edge = Math.abs(v(TOP));
    expect(half).toBeLessThan(edge / 3);
    expect(Math.abs(v(TOP + 10))).toBeGreaterThan(Math.abs(v(TOP + BAND - 10)));
  });

  it("is at full speed past the edge, not faster", () => {
    // A pointer dragged off the top of the pane is as far in as it can be.
    expect(v(TOP)).toBe(v(TOP - 200));
    expect(v(BOTTOM)).toBe(v(BOTTOM + 200));
  });

  it("never asks a short pane to scroll both ways at once", () => {
    // The two bands would overlap on anything shorter than twice the band, and
    // a point inside both would be decided by whichever test ran first — a coin
    // toss dressed as a rule. Halved instead, so the two always meet at the
    // middle and never cross it.
    const short = 60;
    const band = panBand(short);
    expect(band * 2).toBeGreaterThan(short);
    const up = panVelocity(10, 0, short, band);
    const down = panVelocity(short - 10, 0, short, band);
    expect(up).toBeLessThan(0);
    expect(down).toBeGreaterThan(0);
    // The exact middle belongs to neither.
    expect(panVelocity(short / 2, 0, short, band)).toBe(0);
  });

  it("is nothing for a pane that is not one", () => {
    expect(panVelocity(50, 100, 100, 40)).toBe(0);
    expect(panVelocity(50, 900, 100, 40)).toBe(0);
    expect(panVelocity(50, 0, 800, 0)).toBe(0);
  });
});

describe("a wheel notch, in pixels", () => {
  it("takes pixels as they come", () => {
    expect(wheelPixels(120, 0, 800)).toBe(120);
    expect(wheelPixels(-120, 0, 800)).toBe(-120);
  });

  it("reads lines as lines and pages as pages", () => {
    // `deltaMode` IS NOT DECORATION. Read without it, a Firefox notch of three
    // LINES scrolls three pixels and the wheel looks broken rather than slow.
    expect(wheelPixels(3, 1, 800)).toBe(48);
    expect(wheelPixels(1, 2, 800)).toBe(800);
  });

  it("is nothing for a delta that is not a number", () => {
    expect(wheelPixels(Number.NaN, 0, 800)).toBe(0);
    expect(wheelPixels(0, 0, 800)).toBe(0);
  });
});

describe("every drag in the plugin pans", () => {
  // Which modules start a native drag, found rather than listed — a list would
  // be a seventh place to remember.
  const draggers = allSrcNames().filter((f) =>
    readSrc(f).includes('addEventListener("dragstart"')
  );

  it("is more than one place, or this rule is not a rule", () => {
    expect(draggers.length).toBeGreaterThan(3);
  });

  it("starts the pan wherever a drag starts", () => {
    // THE FAILURE THIS CATCHES is the next drag, written by somebody who has
    // not read `drag-scroll.ts`: a gesture that works on a short page and locks
    // a long one, which is precisely the report 4.57 answers.
    for (const f of draggers) {
      expect(readSrc(f), f).toContain("panDuringDrag(");
    }
  });

  it("stops it wherever that drag ends", () => {
    // A LOOP THAT OUTLIVES ITS GESTURE PANS THE NEXT ONE. `dragend` fires on the
    // element the drag started from, whatever happened to it — a drop, an
    // Escape, a release over nothing — so it is the one place this can be
    // certain of.
    for (const f of draggers) {
      const t = readSrc(f);
      expect(t, f).toContain('addEventListener("dragend"');
      expect(t, f).toContain("stopPan?.()");
    }
  });

  it("keeps the arithmetic out of the call sites", () => {
    // The six sites ask for a pan; not one of them knows how deep a band is or
    // how fast a pane moves. `time-grid.ts`' split, applied to a gesture.
    //
    // ASKED ABOUT THE TWO FUNCTIONS AND NOT ABOUT `requestAnimationFrame`.
    // `readSrc("widgets")` is the whole widgets/ directory concatenated, and
    // `row.ts` schedules a frame for its own reasons — a sweep that forbade the
    // word would be asserting something about a module it is not looking at.
    for (const f of draggers) {
      const t = readSrc(f);
      expect(t, f).not.toContain("panVelocity");
      expect(t, f).not.toContain("panBand");
    }
  });
});
