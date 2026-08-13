// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import {
  clusterPairs,
  nextChartRange,
  pairPoints,
  rangesAvailable,
  scatterRadius,
} from "../src/charts/charts";
import type { ScatterPoint } from "../src/charts/charts";
import { RANGE_LABELS, RANGE_SHORT_LABELS } from "../src/charts/chart-ui";
import type { ChartRange } from "../src/trackers/trackers";

import { readCss } from "./sources";
// ── The range a tile cycles through ───────────────────────────────────────

describe("rangesAvailable", () => {
  it("offers every range on a dashboard note", () => {
    expect(rangesAvailable("daily", true)).toEqual([
      "period",
      "30",
      "90",
      "365",
      "all",
    ]);
  });

  it("withholds “follows the page” from a note with no period property", () => {
    // resolveChartWindow silently falls back to a trailing 30 days there, so
    // the option is a label that lies — and in a *cycle* it would land the
    // reader on a state indistinguishable from "30 days" with no way to tell
    // why.
    expect(rangesAvailable("daily", false)).not.toContain("period");
    expect(rangesAvailable("daily", false)).toEqual(["30", "90", "365", "all"]);
  });

  it("withholds the short windows from monthly values", () => {
    // One point and three, respectively.
    const monthly = rangesAvailable("monthly", true);
    expect(monthly).not.toContain("30");
    expect(monthly).not.toContain("90");
    expect(monthly).toEqual(["period", "365", "all"]);
  });

  it("can be left with a single range, which the button then can't cycle", () => {
    expect(rangesAvailable("monthly", false)).toEqual(["365", "all"]);
  });
});

describe("nextChartRange", () => {
  const all = rangesAvailable("daily", true);

  it("advances through the list", () => {
    expect(nextChartRange("period", all)).toBe("30");
    expect(nextChartRange("30", all)).toBe("90");
    expect(nextChartRange("365", all)).toBe("all");
  });

  it("wraps around", () => {
    expect(nextChartRange("all", all)).toBe("period");
  });

  it("lands on the first available range from one that isn't offered", () => {
    // Reachable, not defensive: a chart set to `period` on a dashboard and
    // then moved to a plain note is exactly this. Cycling moves it off the
    // unavailable range and never back.
    const noPeriod = rangesAvailable("daily", false);
    expect(nextChartRange("period", noPeriod)).toBe("30");
  });

  it("returns the current range when there is nowhere to go", () => {
    // Lets the caller compare and skip a pointless write to the note.
    expect(nextChartRange("all", ["all"])).toBe("all");
    expect(nextChartRange("all", [])).toBe("all");
  });
});

describe("range labels", () => {
  it("has a short form for every range the cycle can show", () => {
    // The button renders RANGE_SHORT_LABELS and tooltips RANGE_LABELS; a range
    // present in one and missing from the other is a button reading
    // "undefined".
    for (const r of Object.keys(RANGE_LABELS) as ChartRange[]) {
      expect(RANGE_SHORT_LABELS[r]).toBeTruthy();
    }
    expect(Object.keys(RANGE_SHORT_LABELS).sort()).toEqual(
      Object.keys(RANGE_LABELS).sort()
    );
  });

  it("keeps the short forms short enough for a tile's title bar", () => {
    for (const label of Object.values(RANGE_SHORT_LABELS)) {
      expect(label.length).toBeLessThanOrEqual(5);
    }
  });
});

// ── Scatter clustering ────────────────────────────────────────────────────

const pair = (date: string, x: number, y: number): ScatterPoint => ({
  date,
  x,
  y,
});

describe("clusterPairs", () => {
  it("merges readings that landed on the same coordinate", () => {
    // The whole point: two self-reported daily trackers repeat constantly, and
    // stacked dots made one reading and twenty look identical.
    const out = clusterPairs([
      pair("2026-01-01", 8, 4),
      pair("2026-01-02", 8, 4),
      pair("2026-01-03", 7, 3),
    ]);
    expect(out).toHaveLength(2);
    expect(out.find((c) => c.x === 8 && c.y === 4)?.count).toBe(2);
    expect(out.find((c) => c.x === 7 && c.y === 3)?.count).toBe(1);
  });

  it("keeps the dates behind each cluster", () => {
    const out = clusterPairs([
      pair("2026-01-01", 8, 4),
      pair("2026-01-02", 8, 4),
    ]);
    expect(out[0].dates).toEqual(["2026-01-01", "2026-01-02"]);
  });

  it("only merges exact matches, never near ones", () => {
    // A distance-based cluster would merge 4 with 5 at some tile sizes and not
    // others — a chart whose meaning depends on its width.
    const out = clusterPairs([pair("a", 8, 4), pair("b", 8, 5)]);
    expect(out).toHaveLength(2);
  });

  it("does not confuse coordinates that share a digit string", () => {
    // The NUL join matters: a naive `${x},${y}` makes (1, -2) and (1, -2)
    // fine but invites collisions the moment a separator can occur in a value.
    const out = clusterPairs([pair("a", 1, -2), pair("b", -1, 2)]);
    expect(out).toHaveLength(2);
  });

  it("orders lightest first so heavy marks paint over light ones", () => {
    // Z-order is the only thing that keeps a 1-reading dot visible at the edge
    // of a 20-reading disc.
    const out = clusterPairs([
      pair("a", 1, 1),
      pair("b", 2, 2),
      pair("c", 2, 2),
      pair("d", 2, 2),
    ]);
    expect(out.map((c) => c.count)).toEqual([1, 3]);
  });

  it("preserves the total reading count across the clusters", () => {
    const pairs = [
      pair("a", 1, 1),
      pair("b", 1, 1),
      pair("c", 2, 2),
      pair("d", 3, 3),
    ];
    const total = clusterPairs(pairs).reduce((n, c) => n + c.count, 0);
    expect(total).toBe(pairs.length);
  });

  it("returns nothing for no pairs", () => {
    expect(clusterPairs([])).toEqual([]);
  });

  it("composes with pairPoints, which is what the renderer does", () => {
    const xs = [
      { date: "2026-01-01", value: 8 },
      { date: "2026-01-02", value: 8 },
      { date: "2026-01-03", value: 6 },
    ];
    const ys = [
      { date: "2026-01-01", value: 4 },
      { date: "2026-01-02", value: 4 },
      // No y on the 3rd — an inner join, so that day contributes nothing.
    ];
    const out = clusterPairs(pairPoints(xs, ys));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ x: 8, y: 4, count: 2 });
  });
});

describe("scatterRadius", () => {
  it("scales by area, so weight reads as weight", () => {
    // r ∝ √count is the encoding; if this drifts, the chart is quietly lying
    // about how many readings a mark stands for.
    const one = scatterRadius(1, 3, 100);
    expect(scatterRadius(4, 3, 100)).toBeCloseTo(one * 2, 6);
    expect(scatterRadius(9, 3, 100)).toBeCloseTo(one * 3, 6);
  });

  it("caps, so one heavy coordinate can't swallow the plot", () => {
    expect(scatterRadius(10000)).toBe(12);
  });

  it("never returns less than the single-reading radius", () => {
    expect(scatterRadius(0)).toBe(scatterRadius(1));
  });
});

// ── The chart tile's chrome ───────────────────────────────────────────────

describe("chart tile styling", () => {
  const css = readCss();

  it("styles the tile title bar and its range cycle", () => {
    // Both are built by the code-block processor, so the stylesheet is the
    // only thing that puts the button beside the eyebrow instead of under it.
    for (const cls of [
      ".journal-chart-head",
      ".journal-chart-range",
      ".journal-chart-range.is-static",
    ]) {
      expect(css).toContain(cls);
    }
  });

  it("styles the scatter's clustering caption", () => {
    expect(css).toContain(".journal-chart-note");
  });
});
