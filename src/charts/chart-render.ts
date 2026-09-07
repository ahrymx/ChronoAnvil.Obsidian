// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { App, setIcon, TFile } from "obsidian";
import {
  Chart,
  LineController,
  BarController,
  ScatterController,
  LineElement,
  PointElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import type { ChartConfiguration } from "chart.js";
import type ChronoAnvilPlugin from "../main";
import type { ChartRange, ChartScope, ChartType, TrackerDef } from "../trackers/trackers";
import { CLASS_DEFS, diaryClassOf } from "../trackers/trackers";
import type { TrackerClass } from "../trackers/trackers";
import {
  ChartPoint,
  ChartWindow,
  PeriodBounds,
  ScatterPoint,
  isChartable,
  alignSeries,
  hourAxisBounds,
  journalTrendShowsAverage,
  clusterPairs,
  pairPoints,
  scatterRadius,
  pointsInWindow,
  resolveChartWindow,
  rollingMean,
  rollingWindowFor,
  bucketByMonth,
  HEAT_TRANSPOSE_DAYS,
  scopesFor,
  streakStats,
  summarize,
} from "./charts";
import {
  activityBucket,
  activityWeight,
  activityQuarterBounds,
  aggregateActivity,
  daysSinceWeekStart,
  filesUnder,
  formatClock,
  frontmatterOf,
  getFile,
  isoDate,
  moment,
  moodBucket,
  openFile,
  parseClock,
  quarterActivityStats,
  quarterMonths,
  quarterOfMonth,
  shiftQuarter,
  weekStartDay,
} from "../core/util";
import type { ActivityCount } from "../core/util";
import { entriesOfGrain } from "../diary/lineage";
import { countBodyTasks } from "../ui/tables";
import { pagesUnder } from "../core/query";

// ── Self-contained chart rendering ───────────────────────────────────────
// ChronoAnvil reads its own daily-note frontmatter and draws the chart itself,
// rather than emitting a ```tracker block for the Tracker plugin to render.
// The old delegation is why bounded ranges (30/90/365/period) showed nothing:
// Tracker re-parsed the window date itself and, per timezone/locale, dropped
// the newest day or every edge-clustered point — only unbounded "all time"
// survived. Here the window is a pair of "YYYY-MM-DD" strings and filtering is
// a plain string compare (see pointsInWindow), so every range is equally
// reliable. line/bar go through Chart.js; summary + calendar heatmap are plain
// DOM so they need no charting library at all.

// The chart types Chart.js draws. The rest of ChartType — summary, month,
// streak — is plain DOM and needs no library at all, which is why this list is
// shorter than the type union and has to be stated rather than inferred.
//
// Exported so the registration below can be checked against it. Chart.js v4 is
// tree-shaken and a controller that was never registered throws *at draw time*
// — after the note has rendered, in a resize callback, and only for whoever
// happened to create a chart of that type. `scatter` shipped unregistered from
// 2.20 (when the type was added) until 2.45.1, because nothing in the suite
// draws a chart and no dev vault had one on a page. A pure test over the
// registry is the cheapest thing that could have caught it.
export const CHARTJS_CHART_TYPES = ["line", "bar", "scatter"] as const;

// Register the exact Chart.js pieces used, once. Nothing renders unless its
// controller/element/scale is registered.
let chartJsReady = false;
export function ensureChartJs(): void {
  if (chartJsReady) return;
  Chart.register(
    LineController,
    BarController,
    // Its own controller, not a mode of the line one: `type: "scatter"` is what
    // renderScatter asks for and the registry resolves that name literally.
    ScatterController,
    LineElement,
    PointElement,
    BarElement,
    CategoryScale,
    LinearScale,
    Tooltip,
    Legend,
    Filler
  );
  chartJsReady = true;
}

// Which files in a grain's folder are its entries, and what date each one is.
//
// Built from the class table's `filePrefix` rather than hardcoded, which is
// what lets one walk serve five grains — this was `DAY_FILE` and `MONTH_FILE`,
// two literals and a boolean, and every grain added in 2.57.12 had nowhere to
// be read from because of it.
//
// The prefix is also the entry-vs-dashboard filter: a folder note is
// `Weekly.md`, which no prefix matches, so it drops out without a second test.
function entryPattern(grain: TrackerClass): RegExp {
  return new RegExp(`^${CLASS_DEFS[grain].filePrefix}(.+)$`);
}

// The ISO date a chart plots this entry at.
//
// A grain coarser than a day is plotted at its FIRST day — a month at the 1st,
// a quarter at its first month's 1st — because a chart's x-axis is a timeline
// and a period has to sit somewhere on it. Its own start is the only choice
// that keeps the series monotonic and matches where the period actually begins;
// plotting at the midpoint would put a value in the middle of days it did not
// measure.
function pointDate(grain: TrackerClass, captured: string): string | null {
  // Parsed by shape rather than by handing moment a format string: the wrapper
  // in core/util takes an input and nothing else, and widening it to accept a
  // format and a strictness flag would change a signature every caller shares
  // for the benefit of one.
  //
  // Each branch ends in a plain ISO date, so moment is only ever given
  // something it parses the same way everywhere.
  if (grain === "daily") {
    return /^\d{4}-\d{2}-\d{2}$/.test(captured) ? captured : null;
  }
  if (grain === "monthly") {
    return /^\d{4}-\d{2}$/.test(captured) ? `${captured}-01` : null;
  }
  if (grain === "yearly") {
    return /^\d{4}$/.test(captured) ? `${captured}-01-01` : null;
  }
  if (grain === "quarterly") {
    const m = /^(\d{4})-Q([1-4])$/.exec(captured);
    if (!m) return null;
    const month = String((Number(m[2]) - 1) * 3 + 1).padStart(2, "0");
    return `${m[1]}-${month}-01`;
  }
  // ISO weeks, by their own rule: 4 January is always in week 1, so the Monday
  // of that week is week 1's start and week N begins 7(N-1) days later. Done
  // with moment's `startOf("isoWeek")` rather than a hand-rolled weekday
  // calculation, so this agrees with `periodBoundsFor` — which is what a
  // weekly dashboard resolves through — instead of being a second answer to
  // "which day does this week start on".
  const m = /^(\d{4})-W(\d{2})$/.exec(captured);
  if (!m) return null;
  const week = Number(m[2]);
  if (week < 1 || week > 53) return null;
  return moment(`${m[1]}-01-04`)
    .startOf("isoWeek")
    .add((week - 1) * 7, "days")
    .format("YYYY-MM-DD");
}

interface RenderArgs {
  app: App;
  plugin: ChronoAnvilPlugin;
  def: TrackerDef;
  type: Exclude<ChartType, "none">;
  scope: ChartScope;
  body: HTMLElement;
  // line-only: draw the rolling-average overlay.
  avg?: boolean;
  // scatter-only: the Y-axis tracker (def is X).
  def2?: TrackerDef;
}

// Teardown for a rendered chart: a function that releases anything outliving
// the DOM (a Chart.js instance), or null when there's nothing to release (the
// summary + heatmap are plain DOM). The caller owns when to call it.
export type ChartTeardown = (() => void) | null;

// Coerce a frontmatter value to a plotting magnitude: a real number (or numeric
// string) for `number` trackers, minutes-since-midnight for `time` trackers,
// 1/0 for a habit ticked either as a number or as a YAML boolean.
// Null for anything unparseable, so a blank/garbage entry is simply absent.
//
// ── why the boolean branch exists ─────────────────────────────────────────
// ChronoAnvil's own habit checkbox writes 1 and 0, never true/false, and does so
// deliberately (see widgets.ts::buildCheckbox: a number averages to a
// completion rate and shows as a tidy column in Diary.base). So on the write
// path a habit is always a number and this branch is dead.
//
// It is not the only write path. The property is ordinary frontmatter on an
// ordinary note, and Obsidian's own Properties panel will happily render it as
// a checkbox and store a real `true` — as will a hand-edit, a template from
// another vault, or any other plugin touching the same key. Every one of those
// arrived here as a boolean, missed all three branches, and returned null, so
// the point was silently dropped. A habit logged that way charted as though it
// had never been logged at all: the streak tile read "No entries logged for
// this habit in this range yet." on a tracker with months of history behind it,
// which is indistinguishable from the tracker being broken.
//
// Reading `true` as 1 costs nothing and closes the gap for good. The check is
// unconditional on tracker type rather than gated on `boolean`, because a
// tracker retyped from boolean to number leaves the old true/false values on
// disk and they should keep charting.
export function toValue(def: TrackerDef, raw: unknown): number | null {
  if (def.type === "time") return parseClock(raw);
  if (typeof raw === "boolean") return raw ? 1 : 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string" && raw.trim() !== "") {
    // The same spellings as strings, which is what a *quoted* `"true"` arrives
    // as. Gated on the tracker being a habit, unlike the branch above: a real
    // boolean is unambiguous whatever the tracker type, but the string "no" in
    // a `number` tracker is garbage rather than zero, and reading it as 0 would
    // invent a data point where dropping it is the honest answer.
    if (def.type === "boolean") {
      const s = raw.trim().toLowerCase();
      if (s === "true" || s === "yes") return 1;
      if (s === "false" || s === "no") return 0;
    }
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// Every dated value for one tracker in one scope, unsorted. Reads the value
// straight from Obsidian's metadata cache — no Dataview, no Tracker.
//
// The scope is a parameter rather than something worked out from the tracker,
// and that is the whole point of it. A tracker can be on both templates writing
// the same frontmatter key from each, so a version of this that read both
// folders would return thirty daily readings and one monthly reading for the
// same month in one array — a series that looks fine on a line and means
// nothing. Naming the source per chart keeps the two apart.
//
// Monthly values carry month precision and are dated to the 1st. That is a
// fiction about the day, but a contained one: it never reaches the reader,
// because a monthly chart labels its axis by month (see dateLabel), and it buys
// the entire window layer unchanged — pointInWindow is a string compare, so a
// point at "2026-07-01" filters correctly against bounds computed in days.
//
// The third scope landed in 2.52. `daily-by-month` reads the *daily* notes —
// same folder, same pattern, same values as "daily" — and collapses them into
// one point per month on the way out, so it is a post-processing step rather
// than a third read path. Which is the point: a tracker logged daily can be
// charted at month resolution out of history that already exists, instead of
// the user starting a second monthly tracker to get the same twelve points.
// Exported since 2.57.0 so `bridge-readings:` reads the tracker series through
// this function rather than walking the diary folders itself. A second reader
// would be the `taskCounts`/`countChronoAnvilTasks` split again: two answers to
// "what did this tracker read that day", agreeing until one of them learns
// about `daily-by-month` or a value coercion and the other does not.
export function collectPoints(
  app: App,
  plugin: ChronoAnvilPlugin,
  def: TrackerDef,
  scope: ChartScope = "daily"
): ChartPoint[] {
  // `daily-by-month` READS DAILY and buckets on the way out — the compound is
  // an output granularity, not a folder — so it resolves to the daily grain
  // here and is re-examined at the return.
  const grain: TrackerClass = scope === "daily-by-month" ? "daily" : scope;
  const pattern = entryPattern(grain);

  // THE GRAIN'S ENTRIES, NOT ITS FOLDER (4.81). A series read the grain folder,
  // which under the period tree holds only what was written before 4.81 — so
  // every chart would have stopped at the release and drawn a flat line after
  // it. `entryPattern` still has to match: the legacy pass returns whatever is
  // in the folder, including a note a reader renamed by hand, and a name this
  // cannot date is a point with no x.
  const out: ChartPoint[] = [];
  for (const f of entriesOfGrain(app, plugin.settings.paths, grain)) {
    const m = f.basename.match(pattern);
    if (!m) continue;
    const value = toValue(def, frontmatterOf(app, f)[def.id]);
    if (value == null) continue;
    const date = pointDate(grain, m[1]);
    // An unparseable name is skipped rather than plotted at the epoch. A
    // hand-renamed `Week-whenever.md` would otherwise anchor the axis in 1970
    // and squash the real series into a pixel.
    if (date == null) continue;
    out.push({ date, value });
  }
  return scope === "daily-by-month" ? bucketByMonth(out, def.reduce) : out;
}

// Read a CSS custom property off an element's computed style, with a fallback so
// a chart still themes sensibly if a variable is missing.
function cssVar(el: HTMLElement, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

// Add an alpha channel to a #rgb / #rrggbb / rgb() / rgba() colour string. Used
// for the translucent area fill under a line. Falls back to a neutral accent.
function withAlpha(color: string, a: number): string {
  const c = color.trim();
  let m = c.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    const [r, g, b] = m[1].split("").map((h) => parseInt(h + h, 16));
    return `rgba(${r},${g},${b},${a})`;
  }
  m = c.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    const n = parseInt(m[1], 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  m = c.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const [r, g, b] = m[1].split(",").map((s) => s.trim());
    return `rgba(${r},${g},${b},${a})`;
  }
  return `rgba(120,140,255,${a})`;
}

// A short axis label for a date. Day precision (readable for the usual 30–90 day
// trends); Chart.js autoskips ticks when a long window packs too many together.
// Monthly points are all dated to the 1st, so a day label would repeat "1 Jul,
// 1 Aug" and imply a precision the value doesn't have — they get month and year.
function monthLabel(date: string): string {
  return window.moment(date, "YYYY-MM-DD").format("MMM YYYY");
}

// Whether this scope's points carry month precision. Both `monthly` and
// `daily-by-month` date every point to the 1st, so a day label would read
// "1 Jul, 1 Aug" and imply a precision the value doesn't have — the argument
// monthLabel above was written for, which now has two callers instead of one.
function isMonthResolution(scope: ChartScope): boolean {
  return scope === "monthly" || scope === "daily-by-month";
}

function dateLabel(date: string): string {
  return moment(date).format("MMM D");
}

// ── line / bar (Chart.js) ────────────────────────────────────────────────
//
// ONE SERIES, OR TWO SINCE 4.45. The second is optional and absent for every
// caller that had one before — `renderJournalTrend` and the bridge trend both
// pass one series and get, line for line, the configuration they got in 4.44:
// the labels come from their own points, there is one `y`, no `spanGaps` key is
// written, and the legend stays off unless the rolling average turned it on.
// That is deliberate and is the reason the second series is a parameter rather
// than a field on `RenderArgs`: a widget that is not about two trackers should
// not have to say so.
function renderLineOrBar(
  args: RenderArgs,
  points: ChartPoint[],
  second?: { def: TrackerDef; points: ChartPoint[] }
): ChartTeardown {
  const { body, def } = args;
  // A SECOND TRACKER WITH NOTHING IN THE WINDOW IS NOT A SECOND SERIES. Drawing
  // it would put an empty right-hand axis on the tile, scaled to nothing, next
  // to a legend entry for a line that is not there. What there is, is drawn.
  const other = second && second.points.length > 0 ? second : undefined;
  if (points.length === 0 && !other) {
    body.setText("No data in this range yet.");
    return null;
  }
  ensureChartJs();

  body.addClass("ca-chart-canvas");
  const wrap = body.createDiv({ cls: "ca-journal-chart-canvas-wrap" });
  const canvas = wrap.createEl("canvas");

  const accent = cssVar(body, "--interactive-accent", "#6c8cff");
  // The second series' colour. A token rather than a hard-coded hue, defined in
  // 00-tokens.css beside the mood and activity palettes, so a theme can move it
  // and so the guard in test/tokens.test.ts can see it is defined at all.
  const accent2 = cssVar(body, "--ca-chart-series-2", "#d99b3f");
  const gridColor = cssVar(body, "--background-modifier-border", "rgba(140,140,160,0.25)");
  const textColor = cssVar(body, "--text-muted", "#9aa0aa");
  const isBar = args.type === "bar";

  // ONE AXIS BUILDER, TWO AXES. The clock ticks, the true-zero baseline and the
  // declared maximum are properties of the TRACKER, so asking them twice of one
  // function is what stops the right-hand axis from slowly acquiring different
  // rules to the left-hand one. It was inline for a single `y` until 4.45.
  const valueAxis = (
    d: TrackerDef,
    values: number[],
    opts: { right?: boolean; tint?: string } = {}
  ): Record<string, unknown> => {
    const clock = d.type === "time";
    const axis: Record<string, unknown> = {
      ticks: {
        color: opts.tint ?? textColor,
        // A clock axis can top out at exactly 1440 (a span covering the whole
        // day); formatClock wraps that to "00:00", which would label both ends
        // of the axis identically. Show the end of the day as 24:00 instead.
        callback: clock
          ? (v: unknown) => {
              const n = typeof v === "number" ? v : Number(v);
              return n === 1440 ? "24:00" : formatClock(n);
            }
          : undefined,
      },
      // THE RIGHT-HAND AXIS DRAWS NO GRID. Two grids at two scales cross each
      // other at nothing in particular, and the result reads as graph paper
      // rather than as two readings. The left one keeps its lines.
      grid: opts.right ? { drawOnChartArea: false } : { color: gridColor },
      ...(opts.right ? { position: "right" } : {}),
    };
    // Number charts start at 0 so bar lengths and line heights read against a
    // true zero baseline — pinning to a tracker's declared min (e.g. Mood's 1)
    // both hides a minimum-valued bar and exaggerates a line's swings. def.max
    // still caps the top (Mood stays 0–5).
    if (d.type === "number") {
      axis.beginAtZero = true;
      if (d.max != null) axis.max = d.max;
    } else if (clock) {
      // Clock axis: snap to whole hours so ticks read 07:00, 08:00, 09:00
      // rather than Chart.js's automatic 40-minute spacing. The range still
      // hugs the data (a wake-time band reads better than a forced 00:00–24:00
      // axis) — it's just widened to the enclosing hours.
      const bounds = hourAxisBounds(values);
      if (bounds) {
        axis.min = bounds.min;
        axis.max = bounds.max;
        axis.ticks = {
          ...(axis.ticks as Record<string, unknown>),
          stepSize: bounds.stepSize,
        };
      }
    }
    return axis;
  };

  // THE DATE AXIS IS THE UNION OF BOTH SERIES, and for one series that union is
  // its own dates — so this one expression is both the old behaviour and the
  // new one. `alignSeries` is the OUTER join and `pairPoints` is the inner one;
  // reusing the scatter's pairing here would have silently plotted only the
  // days on which both trackers were logged.
  const aligned = other ? alignSeries(points, other.points) : null;
  const dates = aligned ? aligned.dates : points.map((p) => p.date);
  const values = aligned ? aligned.a : points.map((p) => p.value);

  const yScale: NonNullable<ChartConfiguration["options"]>["scales"] = {
    y: valueAxis(def, points.map((p) => p.value), other ? { tint: accent } : {}),
    x: {
      ticks: { color: textColor, maxRotation: 0, autoSkipPadding: 16 },
      grid: { display: false },
    },
    ...(other
      ? {
          y1: valueAxis(
            other.def,
            other.points.map((p) => p.value),
            { right: true, tint: accent2 }
          ),
        }
      : {}),
  };

  // Rolling-average overlay: a second, smoother line through the same points.
  // Line charts only (a bar's per-day totals aren't a series you smooth), and
  // only when asked. Muted colour and no points so it reads as a guide behind
  // the raw data rather than a competing series.
  //
  // AND ONE SERIES ONLY (4.45). A mean drawn through a chart that already has
  // two lines and two axes is a third dashed line belonging visibly to neither.
  // The editor withholds the toggle when a second tracker is set; this ignores
  // the flag as well, so a hand-written directive carrying both gets the same
  // chart the editor would have produced.
  const overlay =
    !isBar && args.avg && !other && points.length >= 2
      ? [
          {
            label: "Rolling avg",
            data: rollingMean(
              points.map((p) => p.value),
              rollingWindowFor(points.length)
            ),
            borderColor: withAlpha(textColor, 0.9),
            backgroundColor: "transparent",
            borderWidth: 2,
            borderDash: [5, 4],
            fill: false,
            tension: 0.35,
            pointRadius: 0,
            pointHoverRadius: 0,
          },
        ]
      : [];

  // Which tracker each dataset reads, index-aligned with `datasets` below, so
  // the tooltip can format a value in ITS OWN units rather than in the first
  // series'. `null` is the rolling average, which is a mean of the first
  // series and takes its units.
  const seriesDefs: (TrackerDef | null)[] = [def, ...(other ? [other.def] : []), ...overlay.map(() => null)];

  const config: ChartConfiguration = {
    type: isBar ? "bar" : "line",
    data: {
      labels: dates.map((d) =>
        isMonthResolution(args.scope) ? monthLabel(d) : dateLabel(d)
      ),
      datasets: [
        {
          label: def.label,
          data: values,
          borderColor: accent,
          backgroundColor: isBar ? withAlpha(accent, 0.65) : withAlpha(accent, 0.12),
          borderWidth: 2,
          fill: !isBar,
          tension: 0.25,
          pointRadius: isBar ? 0 : 3,
          pointHoverRadius: isBar ? 0 : 5,
          pointBackgroundColor: accent,
          // A HOLE IN THE UNION IS NOT A HOLE IN THE DATA. Two trackers logged
          // on different days produce gaps in each series that neither had on
          // its own — a weekly weight beside a daily mood would draw as
          // unconnected dots. Bridged only where the union created the gap;
          // a single series has none by construction and says nothing here, so
          // its configuration is unchanged.
          ...(other ? { spanGaps: true } : {}),
        },
        ...(other
          ? [
              {
                label: other.def.label,
                data: aligned!.b,
                yAxisID: "y1",
                borderColor: accent2,
                // NO AREA FILL ON THE SECOND LINE. Two translucent fills at two
                // scales overprint into a third colour that means nothing, and
                // the lower series would be washed out by whichever was drawn
                // last. The first keeps its fill; the second is a line.
                backgroundColor: "transparent",
                borderWidth: 2,
                fill: false,
                tension: 0.25,
                pointRadius: 3,
                pointHoverRadius: 5,
                pointBackgroundColor: accent2,
                spanGaps: true,
              },
            ]
          : []),
        ...overlay,
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      color: textColor,
      scales: yScale,
      plugins: {
        legend: {
          // Off for a single series (the tile's caption already names it), on
          // as soon as there is anything to tell apart — the rolling average,
          // or a second tracker.
          display: overlay.length > 0 || other != null,
          labels: { color: textColor, boxWidth: 12, boxHeight: 2 },
        },
        tooltip: {
          callbacks: {
            title: (items) => (items.length ? dates[items[0].dataIndex] ?? "" : ""),
            label: (item) => {
              const y = item.parsed.y as number;
              // ITS OWN UNITS, NOT THE FIRST SERIES'. A weight in kg beside a
              // mood out of 5 formatted with one unit is a tooltip that is
              // wrong half the time.
              const d: TrackerDef = seriesDefs[item.datasetIndex] ?? def;
              const u = d.unit ? ` ${d.unit}` : "";
              return d.type === "time" ? formatClock(y) : `${round(y)}${u}`;
            },
          },
        },
      },
    },
  };

  const chart = new Chart(canvas, config);
  // Hand the teardown back to the caller, which owns when this tile is
  // discarded (a live re-render, or the note closing) — no orphaned canvases.
  return () => chart.destroy();
}

// ── summary (DOM) ─────────────────────────────────────────────────────────
function round(v: number): number {
  return Math.round(v * 100) / 100;
}

function renderSummary(args: RenderArgs, points: ChartPoint[]): ChartTeardown {
  const { body, def } = args;
  const stats = summarize(points.map((p) => p.value));
  if (!stats) {
    body.setText("No data in this range yet.");
    return null;
  }
  const isTime = def.type === "time";
  const unit = def.unit ? ` ${def.unit}` : "";
  const fmt = (v: number): string => (isTime ? formatClock(v) : `${round(v)}${unit}`);

  const grid = body.createDiv({ cls: "ca-journal-chart-summary" });
  const stat = (label: string, value: string): void => {
    const cell = grid.createDiv({ cls: "ca-journal-chart-stat" });
    cell.createDiv({ cls: "ca-journal-chart-stat-value", text: value });
    cell.createDiv({ cls: "ca-journal-chart-stat-label", text: label });
  };
  stat("Average", fmt(stats.avg));
  stat("Min", fmt(stats.min));
  stat("Max", fmt(stats.max));
  // A summed clock time is meaningless, so time trackers show the entry count
  // where a number tracker shows its total.
  if (isTime) stat("Entries", String(stats.count));
  else stat("Total", fmt(stats.total));
  return null;
}

// ── scatter (Chart.js) ────────────────────────────────────────────────────
// Two trackers plotted against each other, one point per date that logged
// both. The question it answers — "does more sleep track with better mood?" —
// is the only one a per-tracker time series can't, which is why it's worth a
// chart type of its own.
//
// Deliberately restrained: it draws the cloud and nothing else. No fitted trend
// line, no r-value, no "strong correlation" caption. A scatter over a few weeks
// of self-reported daily numbers invites causal over-reading, and a
// confident-looking regression line through it would lend arithmetic authority
// to what is usually noise plus a confound (you sleep better *because* the day
// went well, not the other way round). Showing the points and letting the
// reader see the shape is the honest amount of help. The axis labels formthat
// each tracker's own values (clock for a time tracker), so the units are legible
// without asserting a relationship between them.
function axisFmt(def: TrackerDef): (v: number) => string {
  const unit = def.unit ? ` ${def.unit}` : "";
  return def.type === "time"
    ? (v) => formatClock(v)
    : (v) => `${round(v)}${unit}`;
}

function renderScatter(args: RenderArgs, pairs: ScatterPoint[]): ChartTeardown {
  const { body, def, def2 } = args;
  if (!def2) {
    body.setText("This scatter has no second tracker — edit it to pick one.");
    return null;
  }
  if (pairs.length === 0) {
    body.setText(`No entries logged both ${def.label} and ${def2.label} in this range yet.`);
    return null;
  }
  ensureChartJs();

  body.addClass("ca-chart-canvas");
  const wrap = body.createDiv({ cls: "ca-journal-chart-canvas-wrap" });
  const canvas = wrap.createEl("canvas");

  const accent = cssVar(body, "--interactive-accent", "#6c8cff");
  const gridColor = cssVar(body, "--background-modifier-border", "rgba(140,140,160,0.25)");
  const textColor = cssVar(body, "--text-muted", "#9aa0aa");
  const fmtX = axisFmt(def);
  const fmtY = axisFmt(def2);

  // Coincident readings become one mark sized by how many landed there. See
  // charts.ts::clusterPairs — a scatter of two daily self-reports is mostly
  // repeats, and drawing them stacked made one reading and twenty look alike.
  const clusters = clusterPairs(pairs);
  const stacked = clusters.some((c) => c.count > 1);

  const axis = (
    d: TrackerDef,
    fmt: (v: number) => string
  ): Record<string, unknown> => {
    const a: Record<string, unknown> = {
      title: { display: true, text: d.label, color: textColor },
      ticks: {
        color: textColor,
        callback: (v: unknown) => fmt(typeof v === "number" ? v : Number(v)),
      },
      grid: { color: gridColor },
    };
    // A scale/number axis reads best from a true zero up to its declared max;
    // a time axis hugs its data (a forced 00:00–24:00 wastes the panel).
    if (d.type !== "time") {
      a.beginAtZero = true;
      // suggestedMax, not max. A hard max pins the axis to the declared
      // ceiling, which puts every reading *at* that ceiling exactly on the
      // frame — a Mood of 5 drew as a half-disc clipped by the top edge, and
      // the largest clusters are the ones most likely to sit there. Suggested
      // lets Chart.js round outward when it needs the room and still shows the
      // full declared range when it doesn't.
      if (d.max != null) a.suggestedMax = d.max;
    }
    return a;
  };

  const config: ChartConfiguration = {
    type: "scatter",
    data: {
      datasets: [
        {
          label: `${def.label} vs ${def2.label}`,
          data: clusters.map((c) => ({ x: c.x, y: c.y })),
          borderColor: accent,
          // Translucent fill with a solid rim: overlapping discs stay
          // countable, and a small cluster sitting inside a large one is still
          // readable at its edge.
          backgroundColor: withAlpha(accent, 0.4),
          borderWidth: 1,
          pointRadius: clusters.map((c) => scatterRadius(c.count)),
          pointHoverRadius: clusters.map((c) => scatterRadius(c.count) + 2),
          // The other half of the clipping fix. Even with a padded axis, a mark
          // is centred on its value and drawn outward, so a disc on the frame
          // is half outside the chart area — and Chart.js clips to that area by
          // default. `clip: false` lets it spill into the layout padding below
          // rather than being sliced.
          clip: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      color: textColor,
      // Room for the spill. Sized to the radius cap so even the heaviest
      // cluster clears the frame.
      layout: { padding: { top: 14, right: 14, bottom: 4, left: 4 } },
      scales: { x: axis(def, fmtX), y: axis(def2, fmtY) },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            // The title carries the weight, because that is the thing the mark
            // itself can only approximate. A single reading still names its
            // date, which is what it always did.
            title: (items) => {
              const c = clusters[items[0]?.dataIndex ?? 0];
              if (!c) return "";
              return c.count === 1 ? c.dates[0] : `${c.count} entries`;
            },
            label: (item) => {
              const c = clusters[item.dataIndex];
              return `${def.label}: ${fmtX(c.x)} · ${def2.label}: ${fmtY(c.y)}`;
            },
            // The dates behind a heavy mark, capped: the count answers "how
            // many", and the first few dates start answering "which" without
            // turning a tooltip into a list of ninety.
            afterLabel: (item) => {
              const c = clusters[item.dataIndex];
              if (c.count === 1) return "";
              const shown = c.dates.slice(0, 4).join(", ");
              return c.count > 4 ? `${shown} +${c.count - 4} more` : shown;
            },
          },
        },
      },
    },
  };

  const chart = new Chart(canvas, config);
  // Said once, under the plot, only when it applies. Without it a reader has
  // no way to know the marks are sized at all — they'd read the big ones as an
  // unexplained emphasis rather than as a count.
  // Appended to the CELL, not the body: the body is a centring flex box sized
  // to hold the canvas, and a second child in it would sit beside the plot
  // rather than under it.
  if (stacked) {
    (body.parentElement ?? body).createDiv({
      cls: "ca-journal-chart-note",
      text: "Repeated readings merge into one dot — bigger means more entries.",
    });
  }
  return () => chart.destroy();
}

// ── streak (DOM) ──────────────────────────────────────────────────────────
// For a boolean/habit tracker: the current run of consecutive logged-true days,
// the longest run in range, and the completion rate. Plain DOM like the
// summary — three numbers, not a plot — because a habit's story is its runs,
// not a square wave over time.
//
// "Current" is measured from the last logged entry, not from today (see
// streakStats): a gap is a missing log, not a recorded failure, and counting it
// as a break would punish forgetting to tick the box the same as ticking it
// "no". The label says "as of last entry" so the number isn't misread as
// "today".
function renderStreak(args: RenderArgs, points: ChartPoint[]): ChartTeardown {
  const { body } = args;
  if (points.length === 0) {
    body.setText("No entries logged for this habit in this range yet.");
    return null;
  }
  const s = streakStats(points);
  const rate = Math.round((s.total / points.length) * 100);

  const grid = body.createDiv({ cls: "ca-journal-chart-summary" });
  const stat = (label: string, value: string): void => {
    const cell = grid.createDiv({ cls: "ca-journal-chart-stat" });
    cell.createDiv({ cls: "ca-journal-chart-stat-value", text: value });
    cell.createDiv({ cls: "ca-journal-chart-stat-label", text: label });
  };
  const days = (n: number): string => `${n} day${n === 1 ? "" : "s"}`;
  stat("Current", days(s.current));
  stat("Longest", days(s.longest));
  stat("Done", `${s.total} / ${points.length}`);
  stat("Rate", `${rate}%`);
  return null;
}

// ── calendar heatmap (DOM) ────────────────────────────────────────────────
// Each day shaded by value across the tracker's range. The week starts on the
// locale's first day (shared with the diary calendar via weekStartDay). Unlike
// Tracker's single navigable month this honours the selected range directly —
// a week, 30 days, a quarter, a year, or the exact dashboard period.
//
// TWO ORIENTATIONS, AND THE PERIOD PICKS. Under a quarter the days lay out as
// a CALENDAR: seven weekday columns, one row per week, the shape a month is
// read in. From a quarter up they lay out as a STRIP, transposed so weeks run
// left to right beneath seven fixed weekday rows. HEAT_TRANSPOSE_DAYS (in
// charts.ts, so the tile-size rule reads the same number) is the crossover, and
// the argument for it is written there.
//
// WHAT THIS FUNCTION OWES THE STYLESHEET IS TWO COUNTS. The cell size is solved
// in CSS against the tile with container units (20-charts.css carries the whole
// argument), and that solution needs to know how many columns and how many rows
// it is fitting. Both are properties of the resolved window rather than of the
// design, so they are set here and nowhere else — a template reading a stale
// count draws its labels over the wrong weeks, which is exactly how the strip's
// month row came to sit a column off.
const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"]; // Sun..Sat
// The rows the strip's left rail names: Monday, Wednesday, Friday. Every other
// row, and never two rows that share an initial — which is what picking them by
// row index instead of by weekday produced on a Monday-start locale.
const STRIP_RAIL_DAYS = new Set([1, 3, 5]);

function enableHorizontalDragScroll(el: HTMLElement): () => boolean {
  let isDown = false;
  let startX = 0;
  let scrollStart = 0;
  let hasMoved = false;

  el.addClass("has-drag-scroll");

  el.addEventListener("pointerdown", (e: PointerEvent) => {
    if (e.button !== 0) return;
    isDown = true;
    hasMoved = false;
    startX = e.clientX;
    scrollStart = el.scrollLeft;
    el.setPointerCapture(e.pointerId);
  });

  el.addEventListener("pointermove", (e: PointerEvent) => {
    if (!isDown) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 3) {
      hasMoved = true;
      el.addClass("is-dragging");
    }
    el.scrollLeft = scrollStart - dx;
  });

  const endDrag = (e: PointerEvent) => {
    if (!isDown) return;
    isDown = false;
    el.removeClass("is-dragging");
    try {
      if (el.hasPointerCapture(e.pointerId)) {
        el.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Pointer capture might have already been released by browser
    }
  };

  el.addEventListener("pointerup", endDrag);
  el.addEventListener("pointercancel", endDrag);

  return () => hasMoved;
}

function renderHeatmap(
  args: RenderArgs,
  points: ChartPoint[],
  win: ChartWindow
): ChartTeardown {
  const { app, plugin, body, def } = args;
  if (points.length === 0) {
    body.setText("No data in this range yet.");
    return null;
  }

  // Resolve a concrete span. Bounded ranges use their own edges; "all time"
  // (null edges) spans the data's own first→last day.
  const start = win.start ?? points[0].date;
  const end = win.end ?? points[points.length - 1].date;

  const byDate = new Map(points.map((p) => [p.date, p.value]));
  // Bucket against the declared range when present, else the data's spread, so
  // any scale gets the full 5-shade spread.
  let lo = def.min;
  let hi = def.max;
  if (lo == null || hi == null) {
    const vals = points.map((p) => p.value);
    lo = Math.min(...vals);
    hi = Math.max(...vals);
  }
  const isTime = def.type === "time";
  const unit = def.unit ? ` ${def.unit}` : "";
  const display = (v: number): string => (isTime ? formatClock(v) : `${round(v)}${unit}`);
  const dailyDir = plugin.settings.paths.diaryDaily;

  // Weeks start on the locale's first day; the grid's first column is the most
  // recent week-start on/before `start` so weekday columns line up.
  const ws = weekStartDay();
  const startM = moment(start);
  const gridStart = startM
    .clone()
    .subtract(daysSinceWeekStart(startM.day(), ws), "days");
  const endM = moment(end);
  const totalDays = endM.diff(gridStart, "days");

  body.addClass("ca-chart-heatmap-body");
  const isStrip = totalDays >= HEAT_TRANSPOSE_DAYS;

  if (isStrip) {
    body.addClass("is-strip");
    const wasDragged = enableHorizontalDragScroll(body);
    const wrap = body.createDiv({ cls: "ca-journal-chart-heatmap-wrap is-strip" });
    const totalWeeks = Math.ceil((totalDays + 1) / 7);
    // ON THE WRAP, not on the grid. The month-label row and the day-label
    // column are the grid's SIBLINGS, so a property set on the grid is not in
    // their inheritance chain: they fell back to the token's placeholder 53 and
    // laid out 53 tracks under a 61-week year.
    wrap.style.setProperty("--ca-heat-strip-cols", String(totalWeeks));

    // Month labels, one grid column per week, across the strip's own count.
    const monthsRow = wrap.createDiv({ cls: "ca-heat-months" });
    monthsRow.createDiv({ cls: "ca-heat-month-spacer" });

    let lastMonth = -1;
    let lastMonthWeek = -10;
    for (let w = 0; w < totalWeeks; w++) {
      const d = gridStart.clone().add(w * 7, "days");
      if (d.month() !== lastMonth) {
        lastMonth = d.month();
        if (w - lastMonthWeek >= 3) {
          lastMonthWeek = w;
          const lbl = monthsRow.createDiv({ cls: "ca-heat-month", text: d.format("MMM") });
          lbl.style.gridColumn = String(w + 2);
        }
      }
    }

    // Body row: the weekday rail on the left + the transposed grid.
    //
    // EVERY OTHER ROW IS LABELLED, and WHICH rows is decided by the weekday
    // rather than by the row index. Labelling rows 1, 3 and 5 is the same thing
    // only while the week starts on Sunday: on a Monday-start locale it picks
    // Tuesday, Thursday and Saturday, and a rail reading "T / T / S" looks like
    // a bug in the initials rather than like every-other-day.
    const bodyRow = wrap.createDiv({ cls: "ca-heat-strip-row" });
    const dayLabels = bodyRow.createDiv({ cls: "ca-heat-strip-days" });
    for (let k = 0; k < 7; k++) {
      const weekday = (ws + k) % 7;
      const txt = STRIP_RAIL_DAYS.has(weekday) ? WEEKDAY_INITIALS[weekday] : "";
      dayLabels.createDiv({ cls: "ca-heat-strip-day", text: txt });
    }

    const grid = bodyRow.createDiv({ cls: "ca-journal-chart-heatmap is-strip" });

    let newest: HTMLElement | null = null;
    for (let i = 0; i <= totalDays; i++) {
      const d = gridStart.clone().add(i, "days");
      const iso = d.format("YYYY-MM-DD");
      const cell = grid.createDiv({ cls: "ca-journal-chart-heat-cell" });
      const col = Math.floor(i / 7) + 1;
      const row = daysSinceWeekStart(d.day(), ws) + 1;
      cell.style.gridColumn = String(col);
      cell.style.gridRow = String(row);

      const inRange = iso >= start && iso <= end;
      if (!inRange) {
        cell.addClass("is-out");
        continue;
      }
      const value = byDate.get(iso);
      if (value == null) cell.addClass("is-empty");
      else {
        cell.addClass(`ca-heat-${moodBucket(value, { min: lo, max: hi }) ?? 1}`);
      }

      const label = value == null ? iso : `${iso}: ${display(value)}`;
      const file = getFile(app, `${dailyDir}/Day-${iso}.md`);
      if (file) {
        cell.addClass("is-link");
        cell.setAttribute("role", "link");
        cell.addEventListener("click", () => {
          if (wasDragged()) return;
          void openFile(app, file);
        });
      }
      cell.setAttribute("aria-label", label);
      cell.setAttribute("title", label);
      if (value != null) newest = cell;
    }

    // WHERE THE STRIP OPENS. A year is wider than its tile by design, so the
    // scroll position is the first thing the reader sees and it should be the
    // part with something in it. Two things were wrong with scrolling to
    // `scrollWidth`: a window that runs to the end of the calendar year opens
    // on empty autumn cells, and the measurement itself was taken too early —
    // the cell size is solved by a container query, so at `setTimeout(0)` the
    // grid can still be at its pre-layout width and the scroll is a no-op.
    //
    // So: the last day that HAS a value, right-aligned, measured in a frame
    // that has been laid out. Two frames deep because the first is where the
    // container query resolves.
    const anchor = newest;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!body.isConnected) return;
        const right = anchor
          ? anchor.offsetLeft + anchor.offsetWidth
          : body.scrollWidth;
        body.scrollLeft = Math.max(0, right - body.clientWidth);
      })
    );
  } else {
    // Under a quarter: the seven-column calendar
    const wrap = body.createDiv({ cls: "ca-journal-chart-heatmap-wrap" });
    const totalRows = Math.ceil((totalDays + 1) / 7);
    wrap.style.setProperty("--ca-heat-rows", String(totalRows));

    // Weekday header: 7 initials (Sun..Sat or Mon..Sun based on week start)
    const head = wrap.createDiv({ cls: "ca-heat-weekdays" });
    for (let k = 0; k < 7; k++) {
      head.createDiv({ cls: "ca-heat-weekday", text: WEEKDAY_INITIALS[(ws + k) % 7] });
    }

    const grid = wrap.createDiv({ cls: "ca-journal-chart-heatmap" });

    for (let i = 0; i <= totalDays; i++) {
      const d = gridStart.clone().add(i, "days");
      const iso = d.format("YYYY-MM-DD");
      const cell = grid.createDiv({ cls: "ca-journal-chart-heat-cell" });

      const inRange = iso >= start && iso <= end;
      if (!inRange) {
        cell.addClass("is-out");
        continue;
      }
      const value = byDate.get(iso);
      if (value == null) cell.addClass("is-empty");
      else {
        cell.addClass(`ca-heat-${moodBucket(value, { min: lo, max: hi }) ?? 1}`);
      }

      const label = value == null ? iso : `${iso}: ${display(value)}`;
      const file = getFile(app, `${dailyDir}/Day-${iso}.md`);
      if (file) {
        cell.addClass("is-link");
        cell.setAttribute("role", "link");
        cell.addEventListener("click", () => void openFile(app, file));
      }
      cell.setAttribute("aria-label", label);
      cell.setAttribute("title", label);
    }

    // Complete the last week, so the grid is a rectangle and the row count
    // above is the row count drawn. SEVEN, not fourteen: the pad was written
    // for a 14-column variant that `--ca-heat-cols` never had a rule to select,
    // so it was adding a whole invisible row to half the windows it ran on.
    const remainder = (totalDays + 1) % 7;
    if (remainder !== 0) {
      for (let pad = 0; pad < 7 - remainder; pad++) {
        grid.createDiv({ cls: "ca-journal-chart-heat-cell is-out" });
      }
    }
  }
  return null;
}

// Options for renderTrackerChart — the one public entry point. `range` + the
// host note's `period` are resolved to a concrete window here; the widget
// processor (widgets.ts) supplies `body` (the tile). `today` is injectable for
// tests/determinism.
export interface RenderChartOptions {
  app: App;
  plugin: ChronoAnvilPlugin;
  def: TrackerDef;
  type: ChartType;
  range: ChartRange;
  period: PeriodBounds | null;
  // An already-resolved window, used INSTEAD of resolving one from `range` and
  // `period`.
  //
  // THE PREREQUISITE 3.8 §3.3 DID NOT KNOW IT HAD, and it is the same shape as
  // 3.6's: the plan asked the stat cards to read from `renderPeriodStats` and
  // found a function that opened a `<p>` and returned an element, so the figures
  // had to be split out before anything could read them. Here the plan asked a
  // bridge to draw its window as a trend, and this function resolves its own
  // window from a `ChartRange` — a vocabulary a bridge does not speak. A bridge
  // arrives holding a `BridgeWindow` that `core/bridge.ts` has already resolved,
  // refused on, and named; re-deriving it from a range would be a second answer
  // to a question that has one.
  //
  // A FIELD RATHER THAN A SPLIT FUNCTION, and that is the one place this
  // departs from the 3.6 precedent. `renderPeriodStats` was split because two
  // callers wanted the figures and only one wanted the paragraph. Here every
  // caller wants the chart; what differs is where the window came from. So the
  // resolver is skipped rather than extracted, and `range`/`period` stay
  // required so no existing call site changes shape.
  //
  // It also skips the short-period widening below. A bridge's window is the
  // period the reader's note declares, and widening it would draw days outside
  // the period the block's own header says it covers.
  window?: { start: string | null; end: string | null };
  body: HTMLElement;
  today?: string;
  // Absent means daily — see ChartSpec.scope.
  scope?: ChartScope;
  // line-only: overlay a rolling average.
  avg?: boolean;
  // scatter-only: the Y-axis tracker (def is X).
  def2?: TrackerDef;
}

// ── confidence-trend: a journal series, drawn without the chart system ────
//
// Charting a journal tracker through the diary's chart manager is pinned work
// (roadmap item 2). This is the narrow version: one tracker, one folder, one
// line, drawn straight through renderLineOrBar.
//
// It deliberately does NOT touch `scopesFor`, which still returns [] for a
// journal surface and still gates isChartable. That guard says "not chartable
// through the chart system" and remains true — this widget is not offered in
// the Add Chart dialog, cannot be written as a `chart:` directive, and reads
// its folder from the host note rather than from a stored spec. Loosening the
// guard to make this work would have re-opened the exact failure the guard
// exists to prevent (a journal tracker resolving to the daily folder and
// drawing a plausible empty series) in exchange for nothing this needs.
//
// Points come from dated notes under a folder — the state-vs-series rule again:
// a Subject index has a confidence cell and no `date`, so it holds a current
// value and contributes no point.
export function collectJournalPoints(
  app: App,
  folder: string,
  property: string,
  kinds: string[],
  def: TrackerDef
): ChartPoint[] {
  const counts = new Set(kinds);
  const out: ChartPoint[] = [];
  for (const p of pagesUnder(app, folder)) {
    const type = p.fm["type"];
    if (typeof type !== "string" || !counts.has(type)) continue;
    const date = isoDate(p.fm["date"]);
    if (!date) continue;
    const value = toValue(def, p.fm[property]);
    if (value == null) continue;
    out.push({ date, value });
  }
  // Several notes can share a date; the chart wants them in order and the
  // renderer does not sort.
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function renderJournalTrend(args: {
  app: App;
  plugin: ChronoAnvilPlugin;
  def: TrackerDef;
  folder: string;
  kinds: string[];
  body: HTMLElement;
}): ChartTeardown {
  const points = collectJournalPoints(
    args.app,
    args.folder,
    args.def.id,
    args.kinds,
    args.def
  );
  // One reading is a dot, not a trend, and drawing it invites reading a slope
  // into a single point. Two is the minimum that can go anywhere.
  if (points.length < 2) {
    args.body.setText(
      points.length === 0
        ? "No readings here yet."
        : "One reading so far — a trend needs a second."
    );
    return null;
  }
  return renderLineOrBar(
    {
      app: args.app,
      plugin: args.plugin,
      def: args.def,
      type: "line",
      // The scope only reaches the axis labelling, which wants day precision.
      scope: "daily",
      body: args.body,
      // Not a flag on the spec, because there is nowhere in `jchart:` to put
      // one that wouldn't also have to be spelled in `journal-chart:` — the
      // rule and its price are in journalTrendShowsAverage. Point-based, so a
      // journal's sparse and irregular readings need no adjustment: a subject
      // with twenty-odd dated notes smooths, a topic with six does not.
      avg: journalTrendShowsAverage(points.length),
    },
    points
  );
}

// Entry point: draw one tracker chart into `body`. Called by the widget
// processor (widgets.ts) for each chart tile. Pure data-shaping lives in
// charts.ts; this is the impure Obsidian + Chart.js layer.
export function renderTrackerChart(args: RenderChartOptions): ChartTeardown {
  const { app, plugin, def, type, range, period, body } = args;
  // isChartable rather than chartableType. This is reachable from a `chart:`
  // line already on disk — hand-written, pasted, or left behind when a tracker
  // moved surface — so it is a gate, not a formality, and the type test alone
  // lets a journal tracker through on the strength of being a number.
  if (type === "none" || !isChartable(def)) {
    body.setText("This chart type isn't available for this tracker.");
    return null;
  }

  // The stored scope is a claim about where the values are, and the tracker's
  // class is the fact. They can disagree: a chart written while a tracker was
  // monthly carries `scope: monthly`, and the tracker has since been made
  // daily — so the directive on disk now names a folder its tracker never
  // writes to. Reading it literally draws an empty chart that looks broken
  // rather than empty, and the note gives no hint why.
  //
  // Correcting it here rather than rewriting the directive keeps the fix where
  // it can't lose anything: charts are user-editable lines in a note, and a
  // renderer that silently rewrites the note it is rendering is a worse
  // bargain than one that reads a stale value charitably. Opening the chart's
  // editor persists the correction, because reconcile() does the same thing
  // and then saves.
  //
  // The fallback reads off the tracker's own class rather than defaulting to
  // "daily", and non-null is guaranteed by the isChartable gate above: a
  // surface with no class never reaches here. Defaulting instead would turn a
  // journal tracker into a daily chart of an empty folder, which is the exact
  // failure the gate exists to catch — reintroduced one line below it.
  const cls = diaryClassOf(def.surface) as ChartScope;
  const scope = scopesFor(def).includes(args.scope ?? "daily")
    ? args.scope ?? "daily"
    : cls;
  // Monthly points sit a month apart, so the short-period widening that keeps a
  // single week from reading as seven lonely points does nothing for them —
  // it would widen a window that already holds one value either way.
  const widenForTrend = scope === "daily" && (type === "line" || type === "bar");
  const win =
    args.window ?? resolveChartWindow(range, period, widenForTrend, args.today);
  const all = collectPoints(app, plugin, def, scope);
  const points = pointsInWindow(all, win);

  const inner: RenderArgs = {
    app,
    plugin,
    def,
    type,
    scope,
    body,
    avg: args.avg,
    def2: args.def2,
  };
  switch (type) {
    case "line": {
      // A SECOND TRACKER IF THIS CHART NAMES ONE (4.45), read exactly as the
      // scatter below reads its own: the same scope, the same window, the same
      // collector. What differs is the join — `renderLineOrBar` aligns the two
      // over the union of their dates, where a scatter pairs them and drops
      // whatever is unmatched.
      //
      // A NAMED TRACKER THAT NO LONGER EXISTS IS NOT FATAL HERE, unlike on a
      // scatter, where it is the whole Y axis. A line without its partner is
      // still the chart it was — one trend — so it draws, and the tile's own
      // caption is what says two trackers were meant.
      const partner = args.def2
        ? {
            def: args.def2,
            points: pointsInWindow(collectPoints(app, plugin, args.def2, scope), win),
          }
        : undefined;
      return renderLineOrBar(inner, points, partner);
    }
    case "bar":
      return renderLineOrBar(inner, points);
    case "summary":
      return renderSummary(inner, points);
    case "month":
      return renderHeatmap(inner, points, win);
    case "scatter": {
      // Scatter reads a second series, windowed the same way, and pairs it to
      // the first by date so the renderer just plots the (x, y) cloud.
      if (!args.def2) {
        body.setText("This scatter has no second tracker — edit it to pick one.");
        return null;
      }
      const ys = pointsInWindow(collectPoints(app, plugin, args.def2, scope), win);
      return renderScatter(inner, pairPoints(points, ys));
    }
    case "streak":
      return renderStreak(inner, points);
  }
}

// ── study Activity heatmap (month grid, task counts) ──────────────────────
// Counts open + completed tasks across the notes in a study subject's folder,
// bucketed by each note's `date`, and draws one calendar month at a time with
// prev/next navigation. Formerly a Chart.js stacked bar over the whole year:
// at year scale the bars were unreadable on a sparse subject, and a year strip
// of ~370 cells renders a single active day as what looks like a fault. A
// month grid is the honest unit for study work, fits any pane width without
// scrolling, and makes an empty month an ordinary state rather than a bug.
//
// Shade encodes *total* tasks touched that day (open + done), not completions:
// shading by completions alone would render an unfinished day identically to a
// day never touched, which is the one distinction a study log must keep. The
// open/completed split lives in the stat row and each cell's tooltip.

export interface RenderedChart {
  el: HTMLElement;
  destroy: () => void;
}

// Read each note under `scopeFolder`, pairing its `date` frontmatter with its
// open/completed task counts. Aggregation/windowing is the pure aggregateActivity.
//
// Task counts come from each note's *body* (countBodyTasks), not the metadata
// cache: a ChronoAnvil `- ( )` checkbox is invisible to the listItems cache
// wherever it sits, and a reader may write tasks in a note's prose as well as
// inside its `tasks:` region. Reading bodies is async, so this returns a
// promise and the grid builds once it resolves.
//
// Corrected in 3.12: this said the study templates "carry" those checkboxes.
// A composed lesson ships an empty `tasks:` widget and no seeded task lines,
// which is right — see journals-header.ts::collectRows.
async function collectActivityRows(
  app: App,
  scopeFolder: string
): Promise<{ rows: ActivityCount[]; fileByDate: Map<string, TFile> }> {
  const rows: ActivityCount[] = [];
  // First note seen for a date wins, so a cell opens something rather than
  // nothing when several notes under the subject share a day.
  const fileByDate = new Map<string, TFile>();
  for (const f of filesUnder(app, scopeFolder)) {
    const date = isoDate(frontmatterOf(app, f)["date"]);
    if (!date) continue;
    const { open, done } = countBodyTasks(await app.vault.cachedRead(f));
    // `notes: 1` — the subject Activity heatmap and the Journals strip share
    // aggregateActivity and the `--ca-act-*` ramp, so they have to agree that a
    // dated note is activity. One of the two counting it would mean a shade
    // meant different amounts of work in two places (3.12.1).
    rows.push({ date, open, done, notes: 1 });
    if (!fileByDate.has(date)) fileByDate.set(date, f);
  }
  return { rows, fileByDate };
}

// Human summary of one day, used for the cell tooltip / aria-label. Reads as
// "2026-07-23: 2 completed, 1 open", dropping either half when it's zero.
function dayLabel(row: ActivityCount): string {
  const parts: string[] = [];
  if (row.done > 0) parts.push(`${row.done} completed`);
  if (row.open > 0) parts.push(`${row.open} open`);
  return parts.length ? `${row.date}: ${parts.join(", ")}` : row.date;
}

// Draw one month's grid into `grid`: weekday-aligned, week-start from the
// locale, leading/trailing padding days rendered invisible so the columns line
// up. Mirrors the tracker heatmap's alignment maths (weekStartDay /
// daysSinceWeekStart) so both heatmaps agree on where a week begins.
function drawMonthGrid(
  grid: HTMLElement,
  app: App,
  month: string,
  rows: ActivityCount[],
  max: number,
  todayIso: string,
  noteFor: (iso: string) => TFile | null
): void {
  grid.empty();
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const ws = weekStartDay();
  const first = moment(`${month}-01`);
  const daysInMonth = first.daysInMonth();
  const lead = daysSinceWeekStart(first.day(), ws);

  // Leading blanks so day 1 lands in its true weekday column.
  for (let i = 0; i < lead; i++) {
    grid.createDiv({ cls: "ca-journal-act-cell is-out" });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${month}-${String(d).padStart(2, "0")}`;
    const cell = grid.createDiv({ cls: "ca-journal-act-cell", text: String(d) });
    const row = byDate.get(iso);
    const total = row ? activityWeight(row) : 0;
    const bucket = activityBucket(total, max);
    if (bucket == null) cell.addClass("is-empty");
    else cell.addClass(`ca-act-${bucket}`);

    // With three months on screen at once, "which square is now" stops being
    // obvious the way it was on a single current-month grid — the quarter you
    // are browsing may not contain today at all.
    if (iso === todayIso) cell.addClass("is-today");

    const label = row ? dayLabel(row) : `${iso}: no tasks`;
    cell.setAttribute("aria-label", label);
    cell.setAttribute("title", label);

    // Days backed by a note are openable, matching the tracker heatmap.
    const file = noteFor(iso);
    if (file) {
      cell.addClass("is-link");
      cell.setAttribute("role", "link");
      cell.addEventListener("click", () => void openFile(app, file));
    }
  }
}

// The subject Activity heatmap. Returns synchronously with a placeholder; the
// body reads resolve, then the grids paint and navigation goes live.
//
// One view is a calendar quarter — three month grids side by side under a
// shared stat rail and legend — and the chevrons step a quarter at a time.
//
// `initialQuarter` seeds which quarter is shown. The widget layer passes the
// quarter it remembered for this note, because the surrounding LiveWidget
// rebuilds on any change under the subject folder — without that, ticking a
// task would snap the view back to the current quarter mid-browse.
export function renderActivityChart(opts: {
  app: App;
  scopeFolder: string;
  today?: string;
  initialQuarter?: string;
  onQuarterChange?: (quarter: string) => void;
  // Lifetime confidence for the rail's first group. Null when no lesson is
  // rated yet — the rail then opens straight into the quarter stats.
  confidence?: { avg: string; count: number } | null;
}): RenderedChart {
  const { app, scopeFolder, onQuarterChange, confidence } = opts;
  const host = createDiv({ cls: "ca-journal-activity-heatmap" });
  const loading = host.createDiv({ cls: "ca-journal-chart-empty", text: "Loading task activity…" });

  const todayIso = opts.today ?? moment().format("YYYY-MM-DD");
  const currentMonth = todayIso.slice(0, 7);
  const currentQuarter = quarterOfMonth(currentMonth);
  let quarter = opts.initialQuarter ?? currentQuarter;

  let destroyed = false;

  void collectActivityRows(app, scopeFolder).then(({ rows: collected, fileByDate }) => {
    if (destroyed) return;
    loading.remove();

    // Keep every dated row: navigation slices per quarter client-side, so the
    // whole history is browsable off one read rather than a read per step.
    const rows = aggregateActivity(collected, null, null);
    const bounds = activityQuarterBounds(rows, currentMonth);
    // A remembered quarter from a previous session could now be out of range.
    if (quarter < bounds.first) quarter = bounds.first;
    if (quarter > bounds.last) quarter = bounds.last;

    const head = host.createDiv({ cls: "ca-journal-act-head" });
    const stats = head.createDiv({ cls: "ca-journal-act-stats" });
    const nav = head.createDiv({ cls: "ca-journal-act-nav" });
    const prev = nav.createEl("button", {
      cls: "ca-journal-act-arrow",
      attr: { "aria-label": "Previous quarter", type: "button" },
    });
    setIcon(prev, "chevron-left");
    const title = nav.createDiv({ cls: "ca-journal-act-period" });
    const next = nav.createEl("button", {
      cls: "ca-journal-act-arrow",
      attr: { "aria-label": "Next quarter", type: "button" },
    });
    setIcon(next, "chevron-right");

    // Three panels, built once and repainted in place. Each carries its own
    // month caption and weekday header: a single shared weekday row above all
    // three would only line up while every month began on the same weekday,
    // which is to say almost never.
    const ws = weekStartDay();
    const months = host.createDiv({ cls: "ca-journal-act-months" });
    const panels = [0, 1, 2].map(() => {
      const panel = months.createDiv({ cls: "ca-journal-act-panel" });
      const caption = panel.createDiv({ cls: "ca-journal-act-panel-title" });
      const weekdays = panel.createDiv({ cls: "ca-journal-act-weekdays" });
      for (let k = 0; k < 7; k++) {
        weekdays.createDiv({
          cls: "ca-journal-act-weekday",
          text: WEEKDAY_INITIALS[(ws + k) % 7],
        });
      }
      const grid = panel.createDiv({ cls: "ca-journal-act-grid" });
      return { panel, caption, grid };
    });

    const legend = host.createDiv({ cls: "ca-journal-act-legend" });
    legend.createSpan({ cls: "ca-journal-act-legend-text", text: "Less" });
    legend.createDiv({ cls: "ca-journal-act-cell is-empty" });
    for (let b = 1; b <= 4; b++) {
      legend.createDiv({ cls: `ca-journal-act-cell ca-act-${b}` });
    }
    legend.createSpan({ cls: "ca-journal-act-legend-text", text: "More" });

    const paint = (): void => {
      const s = quarterActivityStats(rows, quarter);
      title.setText(`${quarter.slice(5)} ${quarter.slice(0, 4)}`);
      stats.empty();
      const stat = (value: string, label: string): void => {
        const cell = stats.createDiv({ cls: "ca-journal-act-stat" });
        cell.createSpan({ cls: "ca-journal-act-stat-value", text: value });
        cell.createSpan({ cls: "ca-journal-act-stat-label", text: label });
      };
      // The rail carries two different scopes: confidence is a lifetime average
      // across the whole subject, while the task counts belong to the quarter on
      // screen. Rendering them at one weight in one row would quietly imply the
      // whole rail moves with the chevrons, so a divider marks where that
      // changes — the quarter label to the right names the second group.
      if (confidence) {
        stat(`${confidence.avg}/5`, "avg confidence");
        stat(String(confidence.count), confidence.count === 1 ? "lesson" : "lessons");
        stats.createDiv({ cls: "ca-journal-act-stat-sep" });
      }
      stat(String(s.activeDays), s.activeDays === 1 ? "active day" : "active days");
      stat(String(s.open), "open");
      stat(String(s.done), "completed");

      // `s.max` is the quarter's busiest day, shared by all three grids, so the
      // panels are comparable with each other rather than each self-scaled.
      quarterMonths(quarter).forEach((month, i) => {
        const p = panels[i];
        p.caption.setText(moment(`${month}-01`).format("MMMM"));
        p.panel.toggleClass("is-current", month === currentMonth);
        // Months after this one hold nothing by construction — the whole
        // quarter is drawn so its shape doesn't depend on today's date, but a
        // grid that cannot have data is dimmed rather than read as a dry spell.
        p.panel.toggleClass("is-future", month > currentMonth);
        drawMonthGrid(p.grid, app, month, rows, s.max, todayIso, (iso) =>
          fileByDate.get(iso) ?? null
        );
      });

      prev.disabled = quarter <= bounds.first;
      next.disabled = quarter >= bounds.last;
    };

    const step = (delta: number): void => {
      const target = shiftQuarter(quarter, delta);
      if (target < bounds.first || target > bounds.last) return;
      quarter = target;
      onQuarterChange?.(quarter);
      paint();
    };
    prev.addEventListener("click", () => step(-1));
    next.addEventListener("click", () => step(1));

    paint();
  });

  return {
    el: host,
    destroy: () => {
      destroyed = true;
    },
  };
}
