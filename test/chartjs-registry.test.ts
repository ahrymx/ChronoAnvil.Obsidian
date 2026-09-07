// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// ── Chart.js registration ────────────────────────────────────────────────
//
// Chart.js v4 is tree-shaken: a chart whose controller was never registered
// throws "<type> is not a registered controller" when it draws — which is
// after the note has rendered, inside a resize callback, and only for a user
// who happened to create a chart of that type. Nothing else in this suite
// draws a chart, so this is the one place that can see the gap.
//
// `scatter` was offered by the chart editor from 2.20 and never registered
// until 2.45.1. The test is the registry lookup itself rather than a copy of
// the register() call, so adding a chart type and forgetting to register it
// fails here instead of in someone's vault.
import { describe, it, expect } from "vitest";
import { Chart } from "chart.js";
import { CHARTJS_CHART_TYPES, ensureChartJs } from "../src/charts/chart-render";

describe("Chart.js controllers", () => {
  it("registers one for every chart type it draws", () => {
    ensureChartJs();
    for (const type of CHARTJS_CHART_TYPES) {
      expect(() => Chart.registry.getController(type)).not.toThrow();
    }
  });

  it("registers the scales and elements those controllers need", () => {
    ensureChartJs();
    for (const scale of ["category", "linear"]) {
      expect(() => Chart.registry.getScale(scale)).not.toThrow();
    }
    for (const el of ["line", "bar", "point"]) {
      expect(() => Chart.registry.getElement(el)).not.toThrow();
    }
  });

  it("is idempotent — the widget layer calls it per chart", () => {
    ensureChartJs();
    expect(() => ensureChartJs()).not.toThrow();
    expect(() => Chart.registry.getController("scatter")).not.toThrow();
  });

  it("names only types that are actually drawn by Chart.js", () => {
    // summary, month and streak are plain DOM — listing one here would ask for
    // a controller that legitimately doesn't exist.
    expect([...CHARTJS_CHART_TYPES].sort()).toEqual(["bar", "line", "scatter"]);
  });
});
