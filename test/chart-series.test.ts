// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Two series, an order, and a name — 4.45.
//
// WHAT IS ASSERTED WHERE. The arithmetic — the outer join, the reorder, the
// grammar — is pure and is run here. The drawing is not: there is no DOM in
// this suite, so a chart cannot be rendered and the parts of this release that
// build one are asserted as source text, which is what every chart test in this
// project already does (see test/chart-controls.test.ts and the wiring blocks in
// test/journal-chart.test.ts).
//
// THE ONE TEST THIS FILE EXISTS FOR, though, is none of those. `chart-ui.ts`
// copies a spec into its draft field by field and its comment said, for three
// releases: *"There is no test that can catch this shape of omission, so it is
// called out rather than trusted to review."* That is true of a test that runs
// the modal and false of one that reads the source — so the field list is taken
// out of `ChartSpec` and checked against the copy. `title` is the field that
// was added the day it was written.

import { describe, expect, it } from "vitest";

import {
  alignSeries,
  chartTitle,
  decodeChartDrag,
  encodeChartDrag,
  pairPoints,
  parseChartDirectives,
  reorderCharts,
  serializeChartSpec,
} from "../src/charts/charts";
import type { ChartPoint, ChartSpec } from "../src/charts/charts";
import { readCode, readCss, readSrc, cssRule } from "./sources";

const pt = (date: string, value: number): ChartPoint => ({ date, value });

describe("two series over one date axis", () => {
  const mood = [pt("2026-08-01", 3), pt("2026-08-02", 4), pt("2026-08-04", 5)];
  const sleep = [pt("2026-08-02", 7), pt("2026-08-03", 6)];

  it("takes the union of both series' dates, in order", () => {
    expect(alignSeries(mood, sleep).dates).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
      "2026-08-04",
    ]);
  });

  it("writes a hole where a series has nothing, on both sides", () => {
    const out = alignSeries(mood, sleep);
    expect(out.a).toEqual([3, 4, null, 5]);
    expect(out.b).toEqual([null, 7, 6, null]);
  });

  it("is the OUTER join, which is the whole reason it is not pairPoints", () => {
    // THE BUG THIS FUNCTION EXISTS TO NOT BE. Reusing the scatter's pairing
    // would have truncated both lines to the days that logged both trackers —
    // a chart quietly plotting a subset of the data it says it plots, which
    // looks entirely plausible on screen.
    expect(pairPoints(mood, sleep).map((p) => p.date)).toEqual(["2026-08-02"]);
    expect(alignSeries(mood, sleep).dates).toHaveLength(4);
  });

  it("keeps every row the same length as the date list", () => {
    for (const [a, b] of [
      [mood, sleep],
      [mood, []],
      [[], sleep],
      [[], []],
    ] as [ChartPoint[], ChartPoint[]][]) {
      const out = alignSeries(a, b);
      expect(out.a).toHaveLength(out.dates.length);
      expect(out.b).toHaveLength(out.dates.length);
    }
  });

  it("gives one empty series a column of holes rather than dropping it", () => {
    const out = alignSeries(mood, []);
    expect(out.dates).toHaveLength(3);
    expect(out.b).toEqual([null, null, null]);
  });

  it("sorts a union that neither input's order would give", () => {
    // Each series arrives sorted; the union of two sorted lists is not.
    const out = alignSeries([pt("2026-08-03", 1)], [pt("2026-08-01", 2)]);
    expect(out.dates).toEqual(["2026-08-01", "2026-08-03"]);
    expect(out.a).toEqual([null, 1]);
  });
});

describe("what a tile calls itself", () => {
  const spec = (type: ChartSpec["type"], title?: string): Pick<ChartSpec, "type" | "title"> =>
    title === undefined ? { type } : { type, title };

  it("uses the reader's own words when there are any", () => {
    expect(chartTitle(spec("line", "How I felt"), "Mood", "Sleep")).toBe("How I felt");
  });

  it("says `vs` for a scatter and `and` for a line", () => {
    // The two charts answer different questions and the words are the only
    // place on the tile that says which — the shapes look nothing alike, but
    // the caption is what a reader scans first.
    expect(chartTitle(spec("scatter"), "Sleep", "Mood")).toBe("Sleep vs Mood");
    expect(chartTitle(spec("line"), "Sleep", "Mood")).toBe("Sleep and Mood");
  });

  it("names the one tracker when there is one", () => {
    expect(chartTitle(spec("line"), "Mood")).toBe("Mood");
    expect(chartTitle(spec("scatter"), "Mood")).toBe("Mood");
  });
});

describe("the directive carries a title", () => {
  const parse = (line: string): ChartSpec | undefined => parseChartDirectives([line])[0];

  it("round-trips through the bar", () => {
    const line = "chart:c1:Mood:line:30|How I felt";
    expect(parse(line)?.title).toBe("How I felt");
    expect(serializeChartSpec(parse(line) as ChartSpec)).toBe(line);
  });

  it("takes a title holding every character the flags could not", () => {
    // THE REASON THE DELIMITER IS A BAR AND NOT `+title=`. A flag segment runs
    // to the next `+` and may hold colons, and the tracker group is greedy with
    // backtracking — so `+title=mood:line:all` matched with tracker
    // "Mood:line:30+title=mood", type "line", range "all": every field wrong,
    // no error, a different chart drawn. A title a reader types can contain
    // exactly that; an id never could.
    const line = "chart:c1:Mood:line:30|mood:line:all + more = fine";
    const spec = parse(line);
    expect(spec?.tracker).toBe("Mood");
    expect(spec?.type).toBe("line");
    expect(spec?.range).toBe("30");
    expect(spec?.title).toBe("mood:line:all + more = fine");
  });

  it("writes no bar when there is no title, so old directives are byte-identical", () => {
    for (const line of [
      "chart:c1:Mood:line:90",
      "chart:c2:Sleep:summary:all",
      "chart:c3:Weight:scatter:all:monthly+y=Savings",
      "chart:c2:Sleep:scatter:90+y=Mood+size=large",
      "chart:c2:Weight:line:all+avg",
      "chart:c1:Odd:Name:scatter:90+y=Other:Id",
    ]) {
      expect(serializeChartSpec(parse(line) as ChartSpec), line).toBe(line);
      expect(parse(line)?.title, line).toBeUndefined();
    }
  });

  it("reads a trailing bar as no title rather than as an empty one", () => {
    // Absent and empty are different answers, and only one of them can be
    // written back byte-identically — the one without the bar.
    expect(parse("chart:c1:Mood:line:30|")?.title).toBeUndefined();
    expect(serializeChartSpec(parse("chart:c1:Mood:line:30|") as ChartSpec)).toBe(
      "chart:c1:Mood:line:30"
    );
  });

  it("strips what would end the line or the fence", () => {
    const spec = parse("chart:c1:Mood:line:30|How ```I``` felt");
    expect(spec?.title).toBe("How I felt");
  });

  it("carries a title beside every other token", () => {
    const line = "chart:c3:Sleep:line:90:monthly+y=Mood+size=large|Both";
    const spec = parse(line);
    expect(spec).toMatchObject({
      key: "c3",
      tracker: "Sleep",
      type: "line",
      range: "90",
      scope: "monthly",
      tracker2: "Mood",
      size: "large",
      title: "Both",
    });
    expect(serializeChartSpec(spec as ChartSpec)).toBe(line);
  });

  it("parses a second tracker on a line, which the grammar always allowed", () => {
    // `+y=` has parsed for every type since 2.20; only the editor and the
    // renderer said it was scatter's. So a directive somebody hand-wrote before
    // 4.45 starts drawing two lines, which is the improvement rather than a
    // break — and it is a behaviour change worth a test naming it.
    expect(parse("chart:c1:Sleep:line:90+y=Mood")?.tracker2).toBe("Mood");
  });
});

describe("the order the charts are in", () => {
  const specs: ChartSpec[] = ["c1", "c2", "c3", "c4"].map((key) => ({
    key,
    tracker: "Mood",
    type: "line",
    range: "90",
  }));
  const keys = (out: ChartSpec[] | null): string[] | null =>
    out ? out.map((s) => s.key) : null;

  it("lifts and inserts rather than swapping", () => {
    // Dragging a tile two places up moves it two places; c2 and c3 keep their
    // order rather than one of them being traded to the bottom.
    expect(keys(reorderCharts(specs, "c4", "c2"))).toEqual(["c1", "c4", "c2", "c3"]);
  });

  it("lands after the destination on a downward move, where it was let go", () => {
    // 4.45 SHIPPED THIS WRONG AND THE READER FOUND IT. It inserted before the
    // target in both directions, so a chart dropped on the one below it did not
    // move at all and one dropped two below moved one place. `dropOnto` owns
    // the direction now — the tile you dropped on moves aside towards where you
    // dragged from.
    expect(keys(reorderCharts(specs, "c1", "c3"))).toEqual(["c2", "c3", "c1", "c4"]);
  });

  it("swaps a tile with its neighbour, which is the drop that used to do nothing", () => {
    // THE EXACT GESTURE THAT WAS REPORTED. One down, then one up, and both are
    // the same rule rather than a special case for adjacency.
    expect(keys(reorderCharts(specs, "c1", "c2"))).toEqual(["c2", "c1", "c3", "c4"]);
    expect(keys(reorderCharts(specs, "c3", "c2"))).toEqual(["c1", "c3", "c2", "c4"]);
  });

  it("answers null for a move that would change nothing", () => {
    expect(reorderCharts(specs, "c2", "c2")).toBeNull();
  });

  it("answers null for a key the note does not have", () => {
    expect(reorderCharts(specs, "c9", "c2")).toBeNull();
    expect(reorderCharts(specs, "c2", "c9")).toBeNull();
  });

  it("permutes the specs rather than rebuilding them, and leaves the input alone", () => {
    const before = [...specs];
    const out = reorderCharts(specs, "c4", "c1") as ChartSpec[];
    expect(out[0]).toBe(specs[3]);
    expect(specs).toEqual(before);
  });
});

describe("the drag's payload", () => {
  it("round-trips a path and a key", () => {
    const raw = encodeChartDrag("02 - Diary/Weekly/W34.md", "c2");
    expect(decodeChartDrag(raw)).toEqual({ path: "02 - Diary/Weekly/W34.md", key: "c2" });
  });

  it("carries the note path, because a chart key is not unique in a vault", () => {
    // Every note's first chart is `c1`. Two dashboards open in a split are drop
    // targets for each other's drags, and a bare key would reorder the wrong
    // note using a key that happens to exist there too.
    expect(decodeChartDrag(encodeChartDrag("a.md", "c1"))?.path).toBe("a.md");
    expect(decodeChartDrag(encodeChartDrag("b.md", "c1"))?.path).toBe("b.md");
  });

  it("answers null for anything that is not one of ours", () => {
    for (const raw of ["", "c1", "{", "{}", '{"path":1,"key":"c1"}', '{"path":"","key":"c1"}', "null"]) {
      expect(decodeChartDrag(raw), JSON.stringify(raw)).toBeNull();
    }
  });
});

describe("every field of a spec reaches the draft", () => {
  it("names each ChartSpec field in the editor's field-by-field copy", () => {
    // `chart-ui.ts` copies field by field so the draft cannot carry `key`, and
    // its comment records the cost: a field not named there is dropped on every
    // save, with no error and no obvious cause. It also used to record that no
    // test could catch it — true of a test that runs the modal, since there is
    // no DOM here, and false of one that reads the two files.
    const model = readSrc("charts");
    const spec = /export interface ChartSpec \{([\s\S]*?)\n\}/.exec(model);
    expect(spec).not.toBeNull();
    const fields = [...(spec as RegExpExecArray)[1].matchAll(/^\s{2}(\w+)\??:/gm)]
      .map((m) => m[1])
      .filter((f) => f !== "key");
    // The list is read rather than written down, so this cannot pass by being
    // out of date.
    expect(fields).toContain("title");
    expect(fields.length).toBeGreaterThanOrEqual(7);

    const editor = readCode("chart-ui");
    const copy = editor.slice(
      editor.indexOf("this.draft = opts.spec"),
      editor.indexOf("this.reconcile();")
    );
    for (const field of fields) {
      expect(copy, field).toContain(`${field}: opts.spec.${field}`);
    }
  });
});

describe("what draws two series, and what withholds the average", () => {
  const render = readSrc("chart-render");

  it("reads the second tracker the same way the scatter does", () => {
    expect(render).toContain("renderLineOrBar(inner, points, partner)");
    expect(render).toContain("collectPoints(app, plugin, args.def2, scope)");
  });

  it("aligns the two over the union of their dates", () => {
    expect(render).toContain("alignSeries(points, other.points)");
    // And nothing indexes the first series' points for a label or a tooltip any
    // more — that was the closure that made a second series impossible.
    expect(readCode("chart-render")).not.toContain("points[items[0].dataIndex]");
  });

  it("puts the second series on its own axis, with no second grid", () => {
    expect(render).toContain('yAxisID: "y1"');
    expect(render).toContain("drawOnChartArea: false");
    expect(render).toContain('position: "right"');
  });

  it("ignores the rolling average when there is a second tracker", () => {
    // Belt to the editor's braces: a `+avg+y=` line can arrive from a note
    // somebody edited by hand, and the two must agree about what it draws.
    expect(render).toContain("args.avg && !other");
  });

  it("shows the legend as soon as there is more than one line", () => {
    expect(render).toContain("display: overlay.length > 0 || other != null");
  });

  it("formats each series in its own units", () => {
    // A weight in kg beside a mood out of 5, formatted with one unit, is a
    // tooltip that is wrong half the time.
    expect(render).toContain("seriesDefs[item.datasetIndex]");
  });

  it("bridges the holes the union created, and only those", () => {
    expect(render).toContain("...(other ? { spanGaps: true } : {})");
  });
});

describe("the tile can be dragged, and reaches one write", () => {
  const tile = readCode("chart-widgets");

  it("is a drag source and a drop target", () => {
    expect(tile).toContain("cell.draggable = true");
    expect(tile).toContain("setData(CHART_DRAG_TYPE");
    expect(tile).toContain("types.includes(CHART_DRAG_TYPE)");
  });

  it("keeps the key in the payload rather than in a variable", () => {
    // The grid is a LiveWidget and rebuilds on any change to the host note —
    // including the one this drag causes — so a module-level "currently
    // dragging" would be read by handlers belonging to tiles that no longer
    // exist.
    expect(tile).not.toMatch(/^let dragging/m);
    expect(tile).not.toMatch(/^let inFlight/m);
  });

  it("refuses a tile dragged in from another note", () => {
    expect(tile).toContain("from.path !== notePath");
  });

  it("goes through the manager, which re-reads before it writes", () => {
    expect(tile).toContain("plugin.charts.moveChart(notePath, from.key, key)");
    const manager = readCode("charts-manager");
    const fn = manager.slice(manager.indexOf("async moveChart("), manager.indexOf("async removeChart("));
    expect(fn).toContain("await this.readSpecs(notePath)");
    expect(fn).toContain("reorderCharts(specs, fromKey, beforeKey)");
    expect(fn).toContain("if (!moved) return false;");
  });

  it("adds no second way to reorder, on either surface", () => {
    // The house rule pinned by test/journal-order.test.ts: a drag and a dialog
    // on one surface is a permanent invitation to the weaker one.
    expect(readCode("chart-ui")).not.toContain("Reorder");
    expect(readCode("chart-grid")).not.toContain("Reorder");
  });
});

describe("the grid, once position means something", () => {
  it("no longer packs tiles densely", () => {
    // With `dense`, a reader could drag a tile in front of another, watch the
    // write succeed, and watch the packer pull it back — a gesture that
    // produces no visible change reads as a broken feature.
    expect(cssRule(".ca-journal-chart-grid")).toContain("grid-auto-flow: row;");
    expect(cssRule(".ca-journal-chart-grid")).not.toContain("dense");
  });

  it("draws the two drag states differently", () => {
    expect(cssRule(".ca-journal-chart-grid .ca-journal-chart-cell.is-dragging")).toContain(
      "opacity: 0.45"
    );
    const target = cssRule(".ca-journal-chart-grid .ca-journal-chart-cell.is-drop-target");
    expect(target).toContain("inset 0 0 0 2px var(--interactive-accent)");
    // A second border inside a clipping cell moves the canvas by a pixel as it
    // appears, and a canvas that resizes mid-drag is Chart.js redrawing under
    // the pointer.
    expect(target).not.toMatch(/^\s*border:/m);
  });

  it("says a tile can be picked up", () => {
    expect(cssRule('.ca-journal-chart-grid .ca-journal-chart-cell[draggable="true"]')).toContain(
      "cursor: grab"
    );
  });

  it("defines the second series' colour rather than only reading it", () => {
    expect(readCss()).toContain("--ca-chart-series-2:");
  });
});
