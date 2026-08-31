// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The calendar heatmap fills the tile it was given.
//
// WHY THIS FILE EXISTS. 5.5 transposed the year-long heatmap into a
// contribution strip and left everything about SIZE alone: both layouts kept
// sizing their cells from one flat token — 13px for the strip, 26px for the
// short grid — so the graph's surface and the tile's had nothing to do with
// each other. Measured on a 1050x450 tile, a 30-day window drew a 182x156
// block of squares in the middle of it and a year strip drew 109px of cells in
// the same box. Nothing failed; it just looked like a rendering fault, which
// is the class of bug a screenshot catches and a suite does not.
//
// The fix is a `clamp()` over container units, and it has three moving parts
// that can each be broken silently: the container the units resolve against,
// the two counts the renderer feeds the templates, and the floor that turns
// "too small" into a scrollbar instead of a grid of specks. Each gets an
// assertion here, because each failure mode renders rather than throwing.

import { describe, expect, it } from "vitest";
import { readCss, readSrc, repoFile } from "./sources";
import { HEAT_TRANSPOSE_DAYS } from "../src/charts/charts";

const css = () => readCss();

function rule(selector: string): string {
  const at = css().indexOf(`\n${selector} {`);
  expect(at, `no rule for ${selector}`).toBeGreaterThan(0);
  return css().slice(at, css().indexOf("\n}", at));
}

describe("the heatmap is measured against its tile", () => {
  it("makes the tile body a size container, not just an inline one", () => {
    // `container-type: inline-size` is what the rest of this sheet uses, and it
    // is exactly the half that does not work here: it exposes `cqw` and NOT
    // `cqh`, and the whole reason the old layout could not fit was that the
    // free height was unknowable from inside the grid. A percentage there
    // resolves against the wrap, and the wrap is auto-sized by the very cells
    // being measured.
    const body = rule(
      ".ca-journal-chart-grid .ca-journal-chart-cell > .ca-journal-chart-body.ca-chart-heatmap-body"
    );
    expect(body).toContain("container-type: size");
    expect(body).not.toContain("container-type: inline-size");
  });

  it("sizes the calendar from both axes and the strip from height alone", () => {
    // THE ASYMMETRY IS THE POINT, and the first pass got it wrong by making
    // both layouts `min(width, height)`. Symmetric looks right and is not: the
    // strip's rows are a constant seven, so a width term pins the cell to
    // whatever makes the whole window fit sideways — 13px for a year — and
    // seven 13px rows is 109px of graph in a 411px tile. Fitting on the axis
    // the shape cannot grow along is how a chart ends up looking zoomed out
    // from its own tile.
    const calendar = rule(".ca-journal-chart-heatmap-wrap:not(.is-strip)");
    expect(calendar).toContain("--ca-heat-cell: clamp(");
    expect(calendar).toContain("100cqw");
    expect(calendar).toContain("100cqh");

    const strip = rule(".ca-journal-chart-heatmap-wrap.is-strip");
    expect(strip).toContain("--ca-heat-cell: clamp(");
    expect(strip).toContain("100cqh");
    expect(strip, "the strip must not fit itself to the width").not.toContain(
      "100cqw"
    );
  });

  it("keeps the strip's gap divisor in step with its gap fraction", () => {
    // The strip's gap is a fraction of its own cell, so that a gutter reading
    // as a mosaic between 13px cells does not read as a hairline between 50px
    // ones. Seven rows plus seven of those gaps — six between the rows, one
    // between the month labels and the grid — is `cell * (7 + 7k)`, and the fit
    // divides by that number rather than iterating, which is the only reason a
    // proportional gap does not chase its own tail. Two files hold one
    // constant, so they are checked against each other rather than separately.
    const k = Number(
      /--ca-heat-strip-gap-k:\s*([\d.]+);/.exec(repoFile("styles/00-tokens.css"))?.[1]
    );
    expect(k).toBeGreaterThan(0);
    const divisor = Number(
      /100cqh[^)]*\)[^)]*\)\) \/ ([\d.]+)\)/.exec(
        rule(".ca-journal-chart-heatmap-wrap.is-strip")
      )?.[1]
    );
    expect(divisor).toBeCloseTo(7 + 7 * k, 5);
  });

  it("lets the body scroll on whichever axis ran out", () => {
    // The honest degraded state, and the one the old sheet only had half of:
    // it set `overflow-y: hidden`, so a quarter's worth of week rows taller
    // than the tile were CLIPPED rather than reachable.
    const body = rule(
      ".ca-journal-chart-grid .ca-journal-chart-cell > .ca-journal-chart-body.ca-chart-heatmap-body"
    );
    expect(body).toContain("overflow: auto");
    expect(body).not.toContain("overflow-y: hidden");
    // `safe` centring, or the overflowing START edge is pinned out of reach and
    // a year too wide for its tile can be scrolled right but never back to
    // January.
    expect(body).toContain("justify-content: safe center");
    expect(body).toContain("align-items: safe center");
  });

  it("keeps a floor under the cell, which is also what makes the fit stable", () => {
    // Two jobs in one number. A legible floor is why the failure is a
    // scrollbar rather than a grid of 3px specks — and it is ALSO what stops
    // the fit oscillating, because a scrollbar steals from `cqw`/`cqh`: bar
    // appears, cells shrink, content fits, bar goes, repeat. It cannot happen,
    // since an axis only overflows once its cell is already pinned at the
    // floor and a pinned cell does not move when the container does.
    const tokens = repoFile("styles/00-tokens.css");
    for (const t of [
      "--ca-heat-cell-min",
      "--ca-heat-cell-max",
      "--ca-heat-strip-cell-min",
      "--ca-heat-strip-cell-max",
    ]) {
      expect(tokens, t).toMatch(new RegExp(`${t}:\\s*\\d+px;`));
    }
    // And the flat sizes the fit replaced are gone rather than shadowed — a
    // leftover `--ca-heat-strip-cell-size` read by one rule is how half the
    // grid would go on ignoring the tile.
    expect(css()).not.toContain("--ca-heat-strip-cell-size");
    expect(css()).not.toContain("--ca-heat-short-cell-size");
  });
});

describe("the renderer feeds the templates their two counts", () => {
  const src = () => readSrc("chart-render");

  it("sets the week count on the wrap, not on the grid", () => {
    // THE ONE THAT WAS ACTUALLY WRONG ON SCREEN. The month-label row and the
    // weekday-label column are the grid's SIBLINGS, so a custom property set
    // on the grid is not in their inheritance chain: they fell back to the
    // token's placeholder 53 and laid out 53 tracks under a 61-week year, which
    // put every month label a little further left of the weeks it names.
    expect(src()).toContain(
      'wrap.style.setProperty("--ca-heat-strip-cols", String(totalWeeks))'
    );
    expect(src()).not.toContain(
      'grid.style.setProperty("--ca-heat-strip-cols"'
    );
  });

  it("sets the row count for the short grid", () => {
    // The height half of the fit is `(free height - header) / rows`, so without
    // this the calendar solves against the token's placeholder and a quarter
    // sizes itself as though it held five weeks.
    expect(src()).toContain(
      'wrap.style.setProperty("--ca-heat-rows", String(totalRows))'
    );
  });

  it("completes the last week to seven, not to fourteen", () => {
    // The pad was written for a 14-column variant that no rule ever selected —
    // `--ca-heat-cols` is 7 everywhere — so on half of all windows it added a
    // whole invisible row that the row count above would then have to fit.
    expect(src()).toContain("(totalDays + 1) % 7");
    expect(src()).not.toContain("(totalDays + 1) % 14");
  });

  it("reserves the horizontal scrollbar's height rather than reacting to it", () => {
    // The strip overflows sideways BY DESIGN, so its horizontal scrollbar is
    // not an edge case — on any window worth scrolling it is always there,
    // taking its height out of `cqh`. The fit that ignored it sized seven rows
    // for a box that then held eight rows' worth, and Saturday was clipped off
    // the bottom of every year.
    //
    // RESERVED, NOT MEASURED. A term that appears only when the bar does is
    // exactly the oscillation the floor was chosen to avoid.
    expect(repoFile("styles/00-tokens.css")).toMatch(
      /--ca-heat-strip-bar:\s*\d+px;/
    );
    expect(rule(".ca-journal-chart-heatmap-wrap.is-strip")).toContain(
      "var(--ca-heat-strip-bar)"
    );
  });

  it("names the strip's rail rows by weekday, not by row index", () => {
    // Rows 1, 3 and 5 are Monday, Wednesday and Friday only while the week
    // starts on Sunday. On a Monday-start locale the same indices pick Tuesday,
    // Thursday and Saturday, and the rail reads "T / T / S" — which looks like
    // the initials are wrong rather than like every other row is labelled.
    const src = readSrc("chart-render");
    expect(src).toContain("const STRIP_RAIL_DAYS = new Set([1, 3, 5])");
    expect(src).toContain("STRIP_RAIL_DAYS.has(weekday)");
    expect(src).not.toContain("k === 1 || k === 3 || k === 5");
  });

  it("opens the strip on the newest day that has a value", () => {
    // Two bugs in one line. `scrollLeft = scrollWidth` opens a calendar-year
    // window on empty autumn cells rather than on the data — and it was
    // measured in a `setTimeout(0)`, before the container query had resolved
    // the cell size, so the grid was often still at its pre-layout width and
    // the assignment did nothing at all. Hence a laid-out frame, and an anchor
    // rather than the end.
    const src = readSrc("chart-render");
    expect(src).toContain("if (value != null) newest = cell;");
    expect(src).toContain("anchor.offsetLeft + anchor.offsetWidth");
    expect(src).not.toContain("body.scrollLeft = body.scrollWidth");
    // Two frames deep: the first is where the container query resolves.
    expect(src).toMatch(
      /requestAnimationFrame\(\(\) =>\s*requestAnimationFrame\(/
    );
  });

  it("reads the transpose threshold from charts.ts rather than a literal", () => {
    // The number decides two things in two files: which layout renders, and
    // which axis `defaultSpan` spends on it. A literal 300 here is how those
    // came apart in 5.5 — the grid transposed at a year while the tile went on
    // being sized `tall`, giving a seven-row shape the one axis it cannot use.
    expect(src()).toContain("totalDays >= HEAT_TRANSPOSE_DAYS");
    // A quarter. Ninety days as a calendar is thirteen rows of seven squares —
    // a 210px column of cells with 800px of empty tile beside it on a 1050x411
    // dashboard — and as a strip it is fourteen columns of seven, filling the
    // same tile at twice the cell size.
    expect(HEAT_TRANSPOSE_DAYS).toBe(90);
  });
});
