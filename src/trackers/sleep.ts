// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The `sleep-summary` widget: an at-a-glance rollup of the coupled Wake-Up +
// Bedtime built-ins across every daily entry. Reads straight from Obsidian's
// metadata cache (no Dataview), like the calendar/week/month summaries.
//
// It prefers the derived `Sleep` property already stored on each note, and
// falls back to computing hours from that note's Wake-Up + Bedtime if the
// stored value is absent — so it works even on older entries written before
// Sleep was enabled.

import type AlmanacPlugin from "../main";
import {
  filesUnder,
  frontmatterOf,
  formatDuration,
  meanClock,
  parseClock,
  sleepHours,
  weeklyOverviewPath,
} from "../core/util";
import { getBuiltinTracker } from "./trackers";

export function buildSleepSummary(plugin: AlmanacPlugin): HTMLElement {
  const app = plugin.app;
  const paths = plugin.settings.paths;
  const root = createDiv({ cls: "journal-sleep-summary" });

  const wake = getBuiltinTracker(plugin, "wake");
  const bed = getBuiltinTracker(plugin, "bed");
  const sleep = getBuiltinTracker(plugin, "sleep");

  if (!wake || !bed) {
    root.createEl("p", {
      cls: "journal-sleep-hint",
      text: "Turn on the Wake-Up and Bedtime built-ins to see a sleep summary.",
    });
    return root;
  }

  const dashboard = weeklyOverviewPath(paths);
  const sleeps: number[] = []; // hours asleep per night
  const wakeMins: number[] = []; // wake time, minutes since midnight

  for (const f of filesUnder(app, paths.diaryDaily)) {
    if (f.path === dashboard) continue;
    const fm = frontmatterOf(app, f);

    // Prefer the stored derived value; else compute from this note's own times.
    let hrs: number | null = null;
    if (sleep) {
      const raw = fm[sleep.id];
      const n = raw == null || raw === "" ? NaN : Number(raw);
      if (Number.isFinite(n)) hrs = n;
    }
    if (hrs == null) hrs = sleepHours(fm[bed.id], fm[wake.id]);
    if (hrs != null && Number.isFinite(hrs)) sleeps.push(hrs);

    const wm = parseClock(fm[wake.id]);
    if (wm != null) wakeMins.push(wm);
  }

  root.createEl("h3", { text: "😴 Sleep" });

  if (!sleeps.length && !wakeMins.length) {
    root.createEl("p", {
      cls: "journal-sleep-hint",
      text: "No sleep data logged yet.",
    });
    return root;
  }

  const avgSleep = sleeps.length
    ? sleeps.reduce((a, b) => a + b, 0) / sleeps.length
    : null;
  const typicalWake = meanClock(wakeMins);

  // Typical bedtime = typical wake − average sleep, wrapped across midnight, so
  // it's coherent with the two averages above rather than a naive (and wrong,
  // because bedtimes wrap) mean of raw bedtime clock values.
  let typicalBed: string | null = null;
  if (typicalWake && avgSleep != null) {
    const wakeMin = parseClock(typicalWake);
    if (wakeMin != null) {
      const bedMin = (((wakeMin - Math.round(avgSleep * 60)) % 1440) + 1440) % 1440;
      const h = Math.floor(bedMin / 60);
      const m = bedMin % 60;
      typicalBed = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }
  }

  const stats = root.createDiv({ cls: "journal-sleep-stats" });
  const stat = (label: string, value: string): void => {
    const cell = stats.createDiv({ cls: "journal-sleep-stat" });
    cell.createSpan({ cls: "journal-sleep-stat-value", text: value });
    cell.createSpan({ cls: "journal-sleep-stat-label", text: label });
  };

  stat("nights logged", String(sleeps.length));
  if (avgSleep != null) stat("avg sleep", formatDuration(avgSleep));
  if (typicalBed) stat("typical bedtime", typicalBed);
  if (typicalWake) stat("typical wake-up", typicalWake);

  // Best / worst night, for a bit of range context (the "range" ask).
  if (sleeps.length > 1) {
    const min = Math.min(...sleeps);
    const max = Math.max(...sleeps);
    stat("shortest", formatDuration(min));
    stat("longest", formatDuration(max));
  }

  return root;
}
