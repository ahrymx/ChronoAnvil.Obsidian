// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The `tracker-stat:<tracker>` widget: one registered tracker's numbers, as a
// stat band over a density strip. 4.70.
//
// ── WHAT WAS MISSING, AND WHY IT LOOKED LIKE NOTHING WAS ─────────────────
//
// A vault can log a dozen trackers and the only page widget that says anything
// about ONE of them is `sleep-summary`, which is not general: it is the coupled
// Wake-Up + Bedtime pair, hardcoded, with its own arithmetic and its own empty
// state. Everything else a tracker can say has to be said by a CHART — and a
// chart answers "how has this moved", which is a different question from "how
// am I doing", takes a fence of its own, and cannot sit in a stat row.
//
// So a reader who tracks Mood every day had no way to put *today's mood, the
// month's average and the current streak* on a dashboard. That is this widget.
//
// ── IT IS `sleep-summary` GENERALISED, AND THAT IS DELIBERATE ────────────
//
// Same shape — a heading, a `statStrip`, an empty state that names what to do —
// because the two are the same kind of thing and a reader meeting the second
// should recognise the first. What differs is that the tracker is named in the
// directive rather than compiled in, so there is one implementation instead of
// one per tracker somebody wants a band for.
//
// `sleep-summary` IS NOT REPLACED BY IT and is not retired. It reads two
// coupled properties and derives a third — typical bedtime is the typical wake
// minus the average sleep, wrapped across midnight, because a naive mean of
// bedtimes is wrong — and none of that is expressible as "one tracker's
// numbers". Two widgets, two questions.

import type ChronoAnvilPlugin from "../main";
import { statStrip } from "../ui/stat-strip";
import type { StatCard } from "../ui/stat-strip";
import { collectPoints } from "../charts/chart-render";
import {
  isChartable,
  scopesFor,
  streakStats,
  summarize,
  streakableType,
} from "../charts/charts";
import type { ChartPoint } from "../charts/charts";
import { getTracker } from "./trackers";
import type { TrackerDef } from "./trackers";
import { emptyCallout } from "../ui/empty";

// How many of the most recent readings the strip draws.
//
// A MONTH, BECAUSE THE STRIP IS A GLANCE AND NOT A CHART. `journals-header`
// draws 53 weeks because it answers "have I kept this up?" over a year;
// this sits in a stat band beside three numbers and has a row's height to do
// it in. Thirty cells read as a month at any width a cell can be drawn at.
const STRIP_DAYS = 30;

// The value as the reader wrote it, in the tracker's own units.
//
// A `time` TRACKER IS MINUTES SINCE MIDNIGHT and must never be printed as a
// number: `collectPoints` converts a clock to minutes so it can be plotted, and
// 447 is not a bedtime. Every other type is the number itself, with the unit the
// tracker declares appended where it has one.
function show(def: TrackerDef, value: number, unit = true): string {
  if (def.type === "time") {
    const mins = ((Math.round(value) % 1440) + 1440) % 1440;
    const hh = String(Math.floor(mins / 60)).padStart(2, "0");
    const mm = String(mins % 60).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  // ONE DECIMAL AT MOST, AND NONE WHERE IT IS WHOLE. A mood of 4 is a mood of
  // 4; an average of 3.7142857 is noise past the first place, and a band whose
  // cells are different widths on different days reads as unstable.
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return unit && def.unit ? `${text} ${def.unit}` : text;
}

// The cells this tracker can honestly fill.
//
// A MEASURE THE TRACKER CANNOT ANSWER DRAWS NO CELL, which is `stats-band`'s
// rule (`bandMeasures`) and is applied here for its reason: a streak over a
// `number` tracker is a count of days the number was at least 0.5, which is a
// true statement about nothing anybody wanted. `streakableType` is the existing
// predicate for that question and this asks it rather than inventing a second.
export function trackerCards(
  def: TrackerDef,
  points: readonly ChartPoint[]
): StatCard[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const stats = summarize(sorted.map((p) => p.value));
  if (!stats) return [];
  const latest = sorted[sorted.length - 1];

  const cards: StatCard[] = [
    {
      label: "Latest",
      value: show(def, latest.value),
      // THE DAY IT WAS LOGGED, because "latest" over a tracker with a gap in it
      // is a value from a date the reader may not expect — and a number with no
      // date on it invites them to read it as today's.
      sub: window.moment(latest.date, "YYYY-MM-DD").format("D MMM"),
    },
    {
      label: "Average",
      value: show(def, stats.avg),
      sub: `over ${stats.count} ${stats.count === 1 ? "entry" : "entries"}`,
    },
  ];

  if (streakableType(def)) {
    const streak = streakStats(sorted);
    cards.push({
      label: "Streak",
      value: String(streak.current),
      // LONGEST BESIDE CURRENT, because a current streak alone cannot be read:
      // three is excellent against a best of four and a slump against a best of
      // forty.
      sub: `best ${streak.longest}`,
    });
  } else {
    // THE RANGE, WHERE A STREAK MEANS NOTHING. A scale or a quantity has a
    // spread and that is the fourth honest thing to say about it.
    cards.push({
      label: "Range",
      // THE UNIT ONCE, ON THE HIGH END. `1 L–2 L` says litres twice about one
      // range, which is how nobody writes a range; a `time` tracker has no
      // unit and so is unaffected either way.
      value: `${show(def, stats.min, false)}–${show(def, stats.max)}`,
      sub: "low to high",
    });
  }
  return cards;
}

export function buildTrackerStat(
  plugin: ChronoAnvilPlugin,
  rest: string
): HTMLElement {
  // `ca-tstat-` FOR THE PARTS, NOT `journal-tracker-`. `.ca-journal-tracker-cell` is
  // already taken, by the daily bar's logging modules in
  // `10-tracker-modules.css`, and it means a bordered control you type into.
  // Every rule there is scoped under `.ca-journal-tracker-bar`, so a second
  // meaning would not collide TODAY — it would collide the first time somebody
  // writes the bare selector, and the two things look nothing alike. The root
  // keeps the readable name because a root is what a reader inspects.
  const root = createDiv({ cls: "ca-journal-tracker-stat" });
  const id = rest.split(":")[0].split("|")[0].trim();

  // ── WHAT THIS VAULT HAS, WHERE THE ANSWER IS "NOT THAT" ──────────────
  //
  // The behaviour `journal-card` established and every pointable widget has
  // followed since: an id this vault does not have draws the LIST of the ones
  // it does, rather than a blank card or a syntax reminder. A tracker can be
  // renamed out from under a directive — `TrackerDef.id` is the frontmatter
  // property, so changing it makes a new tracker — and this is the reader
  // finding that out in the note rather than by seeing nothing.
  const chartable = plugin.settings.trackers.filter(isChartable);
  const def = getTracker(plugin, id);
  if (!id || !def || !isChartable(def)) {
    root.appendChild(
      emptyCallout(
        "activity",
        id ? `No tracker called “${id}”.` : "Name a tracker to show.",
        chartable.length
          ? `This vault tracks: ${chartable.map((t) => t.id).join(", ")}.`
          : "Add one in Settings → ChronoAnvil → Trackers, and it can be shown here."
      )
    );
    return root;
  }

  // THE TRACKER'S OWN GRAIN, NOT AN ASSUMED ONE. `scopesFor` is what decides
  // which folder a tracker's readings live in, and `isChartable` above has
  // already guaranteed it returns at least one — so the first is the grain this
  // tracker is written at rather than a guess that would read the daily folder
  // for a monthly tracker and draw an empty band from it.
  const points = collectPoints(plugin.app, plugin, def, scopesFor(def)[0]);

  root.createEl("h3", { text: def.label });

  if (!points.length) {
    root.appendChild(
      emptyCallout(
        "activity",
        `Nothing logged for ${def.label} yet.`,
        "Log it on an entry and this fills in."
      )
    );
    return root;
  }

  statStrip(root, trackerCards(def, points));
  drawStrip(root, def, points);
  return root;
}

// The last thirty readings as a density strip.
//
// FOUR SHADES, THE SAME FOUR `journals-header` USES, so a colour means the same
// amount in both places — that band's own note makes this promise about the
// activity strip and it is worth keeping across widgets rather than within one.
// A day with no reading is drawn as an empty cell rather than skipped, because
// the gaps are the information: a strip that closed up its holes would show a
// perfect month to somebody who logged four days.
function drawStrip(
  parent: HTMLElement,
  def: TrackerDef,
  points: readonly ChartPoint[]
): void {
  const byDate = new Map(points.map((p) => [p.date, p.value]));
  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const strip = parent.createDiv({ cls: "ca-tstat-strip" });

  const last = [...points].sort((a, b) => a.date.localeCompare(b.date)).pop();
  if (!last) return;
  const end = window.moment(last.date, "YYYY-MM-DD");

  for (let back = STRIP_DAYS - 1; back >= 0; back--) {
    const day = end.clone().subtract(back, "days");
    const iso = day.format("YYYY-MM-DD");
    const value = byDate.get(iso);
    const cell = strip.createDiv({ cls: "ca-tstat-cell" });
    if (value === undefined) {
      // NO RAMP CLASS AT ALL, rather than a fifth stop named "none". The base
      // rule's `--background-modifier-border` is what an unlogged day looks
      // like on both of the other two strips, and a `ca-act-0` would be a
      // shade in the ramp that means "outside the ramp".
      cell.setAttr("aria-label", `${day.format("D MMM")} — nothing logged`);
      continue;
    }
    // FOUR LEVELS OVER THE SERIES' OWN RANGE, not over the tracker's declared
    // min/max: a mood tracker scaled 1–5 whose readings all sit between 3 and 4
    // would otherwise draw thirty cells of one shade, which is a strip that has
    // stopped saying anything. A flat series is drawn at the top level, because
    // "every day the same" is not "every day the least".
    const span = hi - lo;
    const level = span === 0 ? 4 : 1 + Math.floor(((value - lo) / span) * 3.999);
    cell.addClass(`ca-act-${level}`);
    cell.setAttr(
      "aria-label",
      `${day.format("D MMM")} — ${show(def, value)}`
    );
  }
}
