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
  frontmatterOf,
  formatDuration,
  meanClock,
  parseClock,
  sleepHours,
} from "../core/util";
import { entriesOfGrain } from "../diary/lineage";
import { getBuiltinTracker } from "./trackers";
import { emptyCallout } from "../ui/empty";

export function buildSleepSummary(plugin: AlmanacPlugin): HTMLElement {
  const app = plugin.app;
  const paths = plugin.settings.paths;
  const root = createDiv({ cls: "journal-sleep-summary" });

  const wake = getBuiltinTracker(plugin, "wake");
  const bed = getBuiltinTracker(plugin, "bed");
  const sleep = getBuiltinTracker(plugin, "sleep");

  // ── THE TWO EMPTY STATES BECAME CALLOUTS IN 4.70, AND COMPOSING THE
  //    WIDGET IS WHY ─────────────────────────────────────────────────────
  //
  // Both were a bare `<p class="journal-sleep-hint">` — a line of grey text
  // where the band should be, which is what `empty.ts` was written to replace
  // and which survived only because this widget appeared on no shipped page. A
  // reader had to type `sleep-summary` to ever see it.
  //
  // 4.70 composes it onto the diary dashboard, and that page's own rule is that
  // every block says what it shows on a vault that has nothing yet — asserted,
  // in `test/empty-states.test.ts`, against the notes rather than against a
  // list. So the sentence had to become the two `empty.ts` asks for: what is
  // missing, and what to do about it.
  if (!wake || !bed) {
    root.appendChild(
      emptyCallout(
        "moon",
        "Sleep is not being tracked.",
        "Turn on the Wake-Up and Bedtime built-ins in Settings → Almanac → Trackers."
      )
    );
    return root;
  }

  const sleeps: number[] = []; // hours asleep per night
  const wakeMins: number[] = []; // wake time, minutes since midnight

  // EVERY DAILY ENTRY, IN BOTH LAYOUTS (4.81). This walked `paths.diaryDaily`,
  // which holds nothing written after the period tree landed — so a vault that
  // had repaired would have reported a fortnight of sleep as no data at all.
  for (const f of entriesOfGrain(app, paths, "daily")) {
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
    root.appendChild(
      emptyCallout(
        "moon",
        "No nights logged yet.",
        "Fill in Wake-Up and Bedtime on a daily entry and this fills in."
      )
    );
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
