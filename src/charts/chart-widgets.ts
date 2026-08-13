// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The DOM shell around a chart: the tile, its head, and the range control.
//
// WHY THESE LIVE IN charts/ AND NOT IN ui/widgets/
//
// They were methods on the Widgets class, and they looked like widget code
// because of where they sat. They are not. Neither of them reads a single
// property off the plugin or the app — they resolve a tracker definition, draw
// a heading and a button, and hand the real work to renderTrackerChart in
// ./chart-render.ts. They are adapters onto this folder, so they belong beside
// what they adapt.
//
// The direction of the dependency is the argument. A chart is DEFINED by which
// tracker it plots: buildChartCell calls getTracker() and passes the resulting
// TrackerDef into the renderer. Trackers know nothing about charts and never
// need to. Keeping charts/ importing trackers/ — and never the reverse — is
// what stops the two from fusing into one module that neither can be read
// without the other.
//
// NO CONTEXT OBJECT
//
// These take `plugin`, not `{ app, plugin }`. AlmanacPlugin extends Obsidian's
// Plugin, so `plugin.app` is already there; the pair was redundant every time
// it was written, and chart-render.ts alone declares it four times over.
// Passing one argument that carries the other is not a shortcut — it removes a
// second parameter that could disagree with the first.

import { MarkdownPostProcessorContext, TFile } from "obsidian";
import {
  frontmatterOf,
  isoDate,
  moment,
} from "../core/util";
import type { MomentLike } from "../core/util";
import type AlmanacPlugin from "../main";
import { getTracker } from "../trackers/trackers";
import { renderTrackerChart } from "./chart-render";
import type { ChartTeardown } from "./chart-render";
import { RANGE_LABELS, RANGE_SHORT_LABELS } from "./chart-ui";
import {
  ChartSpec,
  periodBoundsFor,
  periodPropertyFor,
  periodUnitOf,
  PeriodBounds,
  isChartable,
  nextChartRange,
  rangesAvailable,
  spanOf,
} from "./charts";

export function buildRangeCycle(
  plugin: AlmanacPlugin,
  head: HTMLElement,
  spec: ChartSpec,
  period: PeriodBounds | null,
  ctx: MarkdownPostProcessorContext
): void {
  // "Follows the page" is withheld on a note with no period property: there
  // is nothing there for it to follow, and resolveChartWindow would quietly
  // draw a trailing 30 days under a label claiming otherwise.
  const available = rangesAvailable(spec.scope ?? "daily", period != null);
  const next = nextChartRange(spec.range, available);
  const btn = head.createEl("button", { cls: "journal-chart-range" });
  btn.createSpan({
    cls: "journal-chart-range-text",
    text: RANGE_SHORT_LABELS[spec.range] ?? spec.range,
  });
  // Nowhere to cycle to — one available range, and the chart is already on
  // it. The control stays as a *label* rather than disappearing: the range
  // is worth showing whether or not it can be changed, and a button that
  // vanishes on some tiles and not others is harder to read than a quiet one.
  if (next === spec.range) {
    btn.addClass("is-static");
    btn.disabled = true;
    btn.setAttr("title", `${RANGE_LABELS[spec.range]} — the only range available here`);
    return;
  }
  const hint = `${RANGE_LABELS[spec.range]} — click for ${RANGE_LABELS[next].toLowerCase()}`;
  btn.setAttr("aria-label", hint);
  btn.setAttr("title", hint);
  btn.addEventListener("click", (evt) => {
    evt.preventDefault();
    evt.stopPropagation();
    // Optimistic, like every other write in this file: the note change will
    // re-render the block, but the button should read as pressed now rather
    // than after a disk round trip.
    spec.range = next;
    void plugin.charts.setRange(ctx.sourcePath, spec.key, next);
  });
}


export function buildChartCell(
  plugin: AlmanacPlugin,
  grid: HTMLElement,
  spec: ChartSpec,
  period: PeriodBounds | null,
  ctx: MarkdownPostProcessorContext
): ChartTeardown {
  const cell = grid.createDiv({ cls: "journal-chart-cell" });
  const span = spanOf(spec, period?.unit ?? null);
  if (span !== "small") cell.addClass(`is-${span}`);
  const def = getTracker(plugin, spec.tracker);

  if (!isChartable(def)) {
    cell.addClass("journal-chart-missing");
    cell.createDiv({ cls: "journal-chart-label", text: `⚠️ ${spec.tracker}` });
    cell.createDiv({
      cls: "journal-chart-body",
      text: "This chart's tracker no longer exists, or isn't something that can be charted. Open Edit… above to remove it.",
    });
    return null;
  }

  // A scatter names a second tracker; resolve it so the eyebrow can read
  // "X vs Y" and the renderer gets both axes. A missing/unchartable partner
  // isn't fatal here — renderTrackerChart shows an in-tile notice — but the
  // label should still make sense.
  const def2 = spec.tracker2 ? getTracker(plugin, spec.tracker2) : undefined;
  const eyebrow =
    spec.type === "scatter" && def2 ? `${def.label} vs ${def2.label}` : def.label;
  const head = cell.createDiv({ cls: "journal-chart-head" });
  head.createDiv({ cls: "journal-chart-label", text: eyebrow });
  buildRangeCycle(plugin, head, spec, period, ctx);
  const body = cell.createDiv({ cls: "journal-chart-body" });

  // Almanac draws the chart itself from its own daily-note frontmatter — no
  // ```tracker block, no Tracker plugin. The returned teardown is owned by the
  // grid's LiveWidget, which calls it before each rebuild and on unload.
  return renderTrackerChart({
    app: plugin.app,
    plugin: plugin,
    def,
    type: spec.type,
    range: spec.range,
    scope: spec.scope,
    period: spec.range === "period" ? period : null,
    body,
    avg: spec.avg,
    def2,
  });
}

// The note's own period, and the anchor date it hangs off.
//
// A dashboard note declares which period it is by carrying a `week-start`,
// `month`, `quarter` or `year` property. Resolving that is a chart concern
// because it is what a period-ranged chart plots against, and it lives beside
// the chart adapters rather than in the widget layer for the same reason they
// do: nothing here touches the DOM or the widget host.

// Deliberately NOT core/util's getFile(), which normalises the path first.
// This mirrors the Widgets.fileOf() it was extracted from exactly, so that the
// move stays a move — ctx.sourcePath arrives from Obsidian already normalised,
// and quietly adding a normalise step would be a behaviour change hiding in a
// refactor.
function fileOfCtx(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext
): TFile | null {
  const f = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
  return f instanceof TFile ? f : null;
}

export function periodAnchor(raw: unknown): MomentLike {
  const iso = isoDate(raw);
  const m = iso ? moment(iso) : moment();
  return m.isValid() ? m : moment();
}


export function resolvePeriodBounds(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext
): PeriodBounds | null {
  const file = fileOfCtx(plugin, ctx);
  if (!file) return null;
  const fm = frontmatterOf(plugin.app, file);

  // `prop in fm` (not a truthy value test) is what makes a blank property
  // count as "this note is that kind of dashboard". Without it, a dashboard
  // that declares `week-start:` but hasn't navigated yet read "this week" in
  // its summary while every period-ranged chart on it silently fell back to a
  // 30-day window.
  const unit = periodUnitOf((prop) => prop in fm);
  if (unit == null) return null;

  // The arithmetic moved to charts.ts::periodBoundsFor in 2.57 so that a
  // bridge anchored to this note's period resolves it through the same code
  // rather than a second copy. What stays here is the vault half: which file,
  // which frontmatter, which property is declared.
  return periodBoundsFor(unit, periodAnchor(fm[periodPropertyFor(unit)]));
}

