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
  JournalChartSpec,
  nextJournalChartKey,
  parseJournalChartRegion,
  writeJournalChartRegion,
} from "./journal-charts";
import { getTracker } from "../trackers/trackers";
import { describeJournalChart, openJournalChartEditor } from "./journal-chart-ui";
import { getFile } from "../core/util";
import { notify } from "../core/notify";

// Manages the journal chart specs inside a note's charts region. Charts live
// in the note (their `jchart:` lines are the source of truth), not in Settings
// — this class just drives the add/edit/remove flows and re-splices the
// region.
//
// A near-copy of charts-manager.ts, on purpose. The two regions are separate
// (see journal-charts.ts for why) but the *management* of one is not an
// interesting problem twice over, so this keeps the same shape, the same
// re-read-inside-the-callback rule and the same picker behaviour. If one of
// them learns something, the other should be able to copy it back.
export class JournalCharts {
  constructor(private app: App, private plugin: ChronoAnvilPlugin) {}

  private async readSpecs(notePath: string): Promise<JournalChartSpec[]> {
    const file = getFile(this.app, notePath);
    if (!(file instanceof TFile)) return [];
    return parseJournalChartRegion((await this.app.vault.read(file)).split("\n"));
  }

  // The note is re-read inside each callback rather than captured when the
  // window opens. The modal stays open across "Add and start another", and a
  // specs array snapshotted at open time would be stale by the second save —
  // every chart after the first would be written over the one before it.
  async addChart(notePath: string): Promise<void> {
    openJournalChartEditor(this.app, this.plugin, {
      notePath,
      onSave: async (draft) => {
        const specs = await this.readSpecs(notePath);
        specs.push({ ...draft, key: nextJournalChartKey(specs) });
        await writeJournalChartRegion(this.app, notePath, specs);
      },
    });
  }

  async editChart(notePath: string, key?: string): Promise<void> {
    const specs = await this.readSpecs(notePath);
    const target = key ?? (await this.pickChart(specs, "✏️ Edit which chart?"));
    if (!target) return;
    const existing = specs.find((s) => s.key === target);
    if (!existing) return;

    openJournalChartEditor(this.app, this.plugin, {
      notePath,
      spec: existing,
      onSave: async (draft) => {
        const current = await this.readSpecs(notePath);
        const idx = current.findIndex((s) => s.key === target);
        if (idx === -1) return;
        current[idx] = { ...draft, key: target };
        await writeJournalChartRegion(this.app, notePath, current);
        notify.ok("Chart updated!");
      },
      onDelete: async () => {
        const current = await this.readSpecs(notePath);
        await writeJournalChartRegion(
          this.app,
          notePath,
          current.filter((s) => s.key !== target)
        );
        new Notice("🗑️ Chart removed.");
      },
    });
  }

  async removeChart(notePath: string, key?: string): Promise<void> {
    const all = await this.readSpecs(notePath);
    const target = key ?? (await this.pickChart(all, "🗑️ Remove which chart?"));
    if (!target) return;
    const specs = all.filter((s) => s.key !== target);
    await writeJournalChartRegion(this.app, notePath, specs);
    new Notice("🗑️ Chart removed.");
  }

  // Prompt the user to choose one of the note's existing charts. Each option
  // reads as its tracker label + shape + title, so the trend and the ranking
  // of one tracker — the pair a subject page is expected to carry — are
  // distinguishable.
  private async pickChart(
    specs: JournalChartSpec[],
    prompt: string
  ): Promise<string | null> {
    if (specs.length === 0) {
      new Notice("No charts to choose from yet.");
      return null;
    }
    if (specs.length === 1) return specs[0].key;
    // By item, not by label: two charts of one tracker with the same shape and
    // no title describe identically, and that pair is the documented common
    // case for a subject page. Resolving the label back to a spec picked the
    // first every time, so the second could never be edited or removed.
    const chosen = await promptChoice(
      this.app,
      specs,
      (s) => describeJournalChart(s, getTracker(this.plugin, s.tracker)),
      prompt
    );
    return chosen?.key ?? null;
  }
}
