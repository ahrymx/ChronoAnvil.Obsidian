// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { App, Notice, TFile } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import { promptChoice } from "../ui/modals";
import {
  ChartSpec,
  chartTitle,
  nextChartKey,
  parseChartRegion,
  periodUnitOf,
  reorderCharts,
  writeChartRegion,
} from "./charts";
import type { PeriodBounds } from "./charts";
import type { ChartRange, ChartType } from "../trackers/trackers";
import { getTracker } from "../trackers/trackers";
import {
  CHART_TYPE_LABELS,
  RANGE_LABELS,
  SPAN_LABELS,
  openChartEditor,
} from "./chart-ui";
import { frontmatterOf, getFile } from "../core/util";
import { notify } from "../core/notify";

// Manages the chart specs inside a note's chart region. Charts live in
// the note (their comment tags are the source of truth), not in Settings —
// this class just drives the add/edit/remove flows and re-splices the region.
export class Charts {
  constructor(private app: App, private plugin: ChronoAnvilPlugin) {}

  // The period the note is a dashboard for, or null if it isn't one. The editor
  // needs it to resolve the "Auto — …" size label, because the same
  // `range: period` chart draws a week on the weekly overview and a year on the
  // year dashboard, and is automatically sized differently as a result.
  //
  // Read here rather than in the editor so chart-ui keeps knowing nothing about
  // where a note lives; it is handed the answer, not the vault.
  private periodUnit(notePath: string): PeriodBounds["unit"] | null {
    const file = getFile(this.app, notePath);
    if (!(file instanceof TFile)) return null;
    const fm = frontmatterOf(this.app, file);
    return periodUnitOf((prop) => prop in fm);
  }

  private async readSpecs(notePath: string): Promise<ChartSpec[]> {
    const file = getFile(this.app, notePath);
    if (!(file instanceof TFile)) return [];
    return parseChartRegion((await this.app.vault.read(file)).split("\n"));
  }

  // The note is re-read inside each callback rather than captured when the
  // window opens. The modal stays open across "Add and start another", and a
  // specs array snapshotted at open time would be stale by the second save —
  // every chart after the first would be written over the one before it.
  async addChart(notePath: string): Promise<void> {
    openChartEditor(this.app, this.plugin, {
      periodUnit: this.periodUnit(notePath),
      onSave: async (draft) => {
        const specs = await this.readSpecs(notePath);
        specs.push({ ...draft, key: nextChartKey(specs) });
        await writeChartRegion(this.app, notePath, specs);
      },
    });
  }

  async editChart(notePath: string, key?: string): Promise<void> {
    const specs = await this.readSpecs(notePath);
    const target = key ?? (await this.pickChart(specs, "✏️ Edit which chart?"));
    if (!target) return;
    const existing = specs.find((s) => s.key === target);
    if (!existing) return;

    openChartEditor(this.app, this.plugin, {
      spec: existing,
      periodUnit: this.periodUnit(notePath),
      onSave: async (draft) => {
        const current = await this.readSpecs(notePath);
        const idx = current.findIndex((s) => s.key === target);
        if (idx === -1) return;
        current[idx] = { ...draft, key: target };
        await writeChartRegion(this.app, notePath, current);
        notify.ok("Chart updated!");
      },
      onDelete: async () => {
        const current = await this.readSpecs(notePath);
        await writeChartRegion(
          this.app,
          notePath,
          current.filter((s) => s.key !== target)
        );
        new Notice("🗑️ Chart removed.");
      },
    });
  }

  // Set one chart's range, for the tile's own cycle button.
  //
  // The note is re-read rather than trusting a spec captured at render time:
  // the tile the button sits on was drawn from the block source, and between
  // that render and the press the region may have been edited by the chart
  // editor, by another pane, or by sync. Writing back a whole specs array
  // built from stale reads is how a cycle button silently reverts an edit
  // made thirty seconds earlier.
  async setRange(
    notePath: string,
    key: string,
    range: ChartRange
  ): Promise<void> {
    const specs = await this.readSpecs(notePath);
    const idx = specs.findIndex((s) => s.key === key);
    if (idx === -1) return;
    if (specs[idx].range === range) return;
    specs[idx] = { ...specs[idx], range };
    await writeChartRegion(this.app, notePath, specs);
  }

  // Move one chart in front of another. 4.45, and the write behind the drag.
  //
  // `setRange`'s SHAPE EXACTLY, including the re-read and the reason for it: the
  // tiles were drawn from block source that may be stale by the time a gesture
  // finishes, and writing back an array built from an old read is how a drag
  // silently reverts an edit made thirty seconds earlier.
  //
  // NO NOTICE. The tiles visibly move, which is the whole feedback a direct
  // manipulation needs — a toast saying what the reader just watched happen is
  // the plugin talking over its own result. `false` is returned for a no-op so
  // the caller can tell "nothing moved" from "moved", and nothing is written.
  async moveChart(
    notePath: string,
    fromKey: string,
    beforeKey: string
  ): Promise<boolean> {
    const specs = await this.readSpecs(notePath);
    const moved = reorderCharts(specs, fromKey, beforeKey);
    if (!moved) return false;
    await writeChartRegion(this.app, notePath, moved);
    return true;
  }

  async removeChart(notePath: string, key?: string): Promise<void> {
    const all = await this.readSpecs(notePath);
    const target = key ?? (await this.pickChart(all, "🗑️ Remove which chart?"));
    if (!target) return;
    const specs = all.filter((s) => s.key !== target);
    await writeChartRegion(this.app, notePath, specs);
    new Notice("🗑️ Chart removed.");
  }

  // Prompt the user to choose one of the note's existing charts. Now that the
  // toolbar's Edit… / Remove… buttons are shared (not per-cell), they resolve
  // the target chart through this picker. Each option reads as its tracker
  // label + type + range so charts of the same tracker are distinguishable.
  private async pickChart(
    specs: ChartSpec[],
    prompt: string
  ): Promise<string | null> {
    if (specs.length === 0) {
      new Notice("No charts to choose from yet.");
      return null;
    }
    if (specs.length === 1) return specs[0].key;
    // By item, not by label — two charts sharing a tracker, type and range
    // describe identically, and resolving the description back to a spec
    // silently picked the first of them. See modals.ts::promptChoice.
    const chosen = await promptChoice(
      this.app,
      specs,
      (s) => {
        const def = getTracker(this.plugin, s.tracker);
        // THE NAME THE TILE CARRIES, so the row a reader picks reads as the
        // tile they were looking at. Through `chartTitle` for that reason: a
        // picker naming a chart by its tracker while the tile names it
        // something else is two names for one thing in one window.
        //
        // A missing tracker keeps its warning rather than borrowing the title —
        // "⚠️ mood" is what is wrong with the chart, and a reader who titled it
        // "How I felt" would otherwise be shown a row with nothing wrong in it.
        const def2 = s.tracker2 ? getTracker(this.plugin, s.tracker2) : undefined;
        const name = def
          ? chartTitle(s, def.label, def2?.label)
          : `⚠️ ${s.tracker}`;
        const from = s.scope === "monthly" ? "  ·  monthly" : "";
        // Size only when it was set explicitly. An automatically-sized chart
        // has no size of its own to name, and printing the derived one would
        // make every option longer while telling the reader nothing that
        // distinguishes it from its neighbour.
        const size = s.size ? `  ·  ${SPAN_LABELS[s.size].toLowerCase()}` : "";
        return `${name}  ·  ${CHART_TYPE_LABELS[s.type as Exclude<ChartType, "none">] ?? s.type}  ·  ${RANGE_LABELS[s.range]}${from}${size}`;
      },
      prompt
    );
    return chosen?.key ?? null;
  }
}
