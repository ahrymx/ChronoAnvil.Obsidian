// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { App, Notice, TFile } from "obsidian";
import type AlmanacPlugin from "../main";
import {
  HEADER_PREFIX,
  TRENDS_HEADING,
  TRENDS_HEADINGS_PAST,
} from "../core/constants";
import type {
  ChartRange,
  ChartScope,
  ChartSpan,
  ChartType,
  TrackerDef,
  TrackerSurface,
} from "../trackers/trackers";
import { diaryClassOf, isJournalSurface, surfaceAcceptsType } from "../trackers/trackers";
import { syncTrackersIntoVault } from "../trackers/trackers";
import {
  getFile,
  locateSection,
  parseHeaderDirective,
  moment,
  quarterMonths,
  quarterOfMonth,
  today as todayIso,
} from "../core/util";
import type { ChartReduce } from "../trackers/trackers";
import type { MomentLike } from "../core/util";

// Chart types are only offered for trackers whose values are numeric under the
// hood — a select's arbitrary strings or a bare date aren't a magnitude you can
// average or plot on an axis. number/time were the original two; scale (a small
// ordinal) and boolean (0/1) join them, since both store numbers and both are
// worth trending — a scale is the whole point of charting mood, and a boolean
// averages to a completion rate.
export function chartableType(t: TrackerDef): boolean {
  return (
    t.type === "number" ||
    t.type === "time" ||
    t.type === "scale" ||
    t.type === "boolean"
  );
}

// Why a `journal-chart:<id>` can't be drawn on this note, or null if it can.
//
// The counterpart of isChartable, and deliberately not a call to it. isChartable
// is `chartableType && scopesFor(def).length > 0`, and the second half is the
// chart *system's* question — which of the diary's daily/monthly folders holds
// this tracker's values. A journal tracker has no answer to that, which is why
// scopesFor returns nothing for one and why isChartable refuses it. That refusal
// stays correct and stays untouched.
//
// This widget asks a different question, and it can only ask it because it has
// something chart-ui never does: the host note. Scope for a journal tracker
// comes from where the directive was written, not from the tracker, so
// "chartable" here means the value-type half of isChartable plus "does this
// tracker belong on the notes in this folder" — and the second half is answered
// against the note, not against the registry.
//
// Pure: `surfaceName` renders a surface into a noun, and `hostTypeName` names
// the journal the host note is in. Both are supplied by the caller so this
// module stays free of the plugin.
//
// A null `hostTypeId` is unclassified and passes, the same permissiveness
// directiveAllowedOn applies for the same reason: a dashboard outside every
// journal root is a place we don't know enough about to refuse.
export function journalChartRefusal(
  def: TrackerDef | undefined,
  id: string,
  hostTypeId: string | null,
  surfaceName: (s: TrackerSurface) => string,
  hostTypeName?: string
): string | null {
  if (!id) {
    return "journal-chart needs a tracker id — e.g. `journal-chart:confidence`.";
  }
  if (!def) return `No tracker called "${id}" is defined.`;
  const name = def.label || def.id;
  if (!chartableType(def)) {
    // A select's arbitrary strings and a bare date aren't a magnitude, so
    // there is no axis to put them on. Same rule the chart system applies;
    // only the scope half differs.
    return `${name} isn't a numeric tracker, so there's nothing to plot.`;
  }
  if (!isJournalSurface(def.surface)) {
    // A diary tracker's readings are in the diary folders. Folder-scoping one
    // to a journal note would draw an empty chart that looks broken rather
    // than wrong.
    return `${name} is a ${surfaceName(def.surface)} tracker — its readings live in the diary, not under this folder.`;
  }
  if (hostTypeId != null && !surfaceAcceptsType(def.surface, hostTypeId)) {
    return `${name} is a ${surfaceName(def.surface)} tracker; this note is in ${hostTypeName ?? hostTypeId}.`;
  }
  return null;
}

// A tracker whose value axis can pair with another's on a scatter plot. Same
// set as chartableType today, but named separately because the question is
// genuinely different ("can this be one axis of a correlation?") and a future
// non-scatterable-but-chartable type shouldn't silently become a scatter axis.
export function scatterableType(t: TrackerDef): boolean {
  return chartableType(t);
}

// Only a boolean/habit tracker has a streak — a run of consecutive true days.
// A number has no notion of "the same again", so the streak chart is offered
// for booleans alone.
export function streakableType(t: TrackerDef): boolean {
  return t.type === "boolean";
}

// Which scopes this tracker can actually be read from — for a diary tracker,
// exactly one: its class. A tracker's readings live in the entries of its own
// class and nowhere else, so the folder a chart reads follows from the tracker
// rather than being a second question the user has to answer consistently with
// the first.
//
// This is the quiet win of the class system. The scope selector used to be a
// real choice with a wrong answer available: pick "Monthly reviews" for a
// daily tracker and you got an empty chart, correctly built from a folder that
// never held those values. Now the wrong answer isn't in the list.
//
// A tracker seeded onto no template at all still resolves to its class — "+
// Add tracker" writes it into entries of that class, so the values are there
// even though no template put them there.
//
// EMPTY for a journal surface, and that is the whole point of the array rather
// than a bare value. Charting a journal tracker is pinned work: with type-only
// scoping the registry cannot know whether a tracker will land on dated notes
// (a lesson has a `date`, a subject index deliberately doesn't), so "not
// chartable yet" has to be *representable*. Returning a diary class here
// instead — the obvious ?? "daily" — would silently point every journal
// tracker at the daily folder and draw an empty series from it, which is the
// failure mode this function exists to prevent, wearing a plausible face.
//
// Callers must therefore handle the empty list rather than indexing [0]; see
// isChartable below, which is the gate they should actually use.
export function scopesFor(def: TrackerDef | undefined): ChartScope[] {
  if (def == null) return ["daily"];
  const cls = diaryClassOf(def.surface);
  if (cls == null) return [];
  // A daily tracker can also be read bucketed by month (2.52). A monthly one
  // cannot be read the other way — there is no finer data to unbucket — so
  // the extra option is offered in one direction only.
  // EVERY GRAIN IS CHARTABLE AS OF 2.58.5. The collector reads its folder and
  // its filename pattern off the class table, so a grain that exists can be
  // charted — which is why this stopped returning an empty list for the three
  // added in 2.57.12.
  //
  // `daily-by-month` is offered only for daily, and the asymmetry is the
  // original one: a daily series can be bucketed up, and a coarser one cannot
  // be unbucketed because there is no finer data to unbucket.
  return cls === "daily" ? ["daily", "daily-by-month"] : [cls];
}

// Whether a chart can be drawn for this tracker at all: the right *type* of
// value, and somewhere to read it from.
//
// Two independent reasons a tracker isn't chartable, and both have to be
// checked at every entry point. chartableType alone passes a journal
// `confidence` — it's a number — and the scope resolution downstream would
// then fall through to the daily folder. This is the gate; chartableType is
// only half of it.
// Narrows, so a caller that has already asked doesn't then have to prove the
// tracker exists a second time.
export function isChartable(def: TrackerDef | undefined): def is TrackerDef {
  return def != null && chartableType(def) && scopesFor(def).length > 0;
}

// The period a "period"-ranged chart is scoped to, resolved from the note's
// week-start / month-start property by the caller (charts.ts is pure — it
// never touches Obsidian). `start`/`end` are ISO "YYYY-MM-DD" bounds of the
// period itself (the week's Mon–Sun, or the month's 1st–last). `unit` lets the
// trend charts widen a short period into a readable window (see below).
// ── the review-scope axis ─────────────────────────────────────────────
// `unit` is the set of periods a dashboard can be *scoped to* — the periods
// you read over. It is deliberately NOT the same set as TrackerClass in
// trackers.ts, which is the periods you write *in*. Both are named after
// periods, which is the only reason they look like one list with gaps in it:
//
//   period    written in (TrackerClass)   read over (this union)
//   day       yes                         no
//   week      no                          yes
//   month     yes                         yes
//   quarter   no                          yes
//   year      no                          yes
//
// Month sits on both axes, and `Month-2026-07.md` (a note you write) and
// `Monthly.md` at `month-start: 2026-07-01` (a window you read) are two
// different objects that happen to share a name. A review scope needs no
// entry class, no template and no folder — it is a property on one dashboard
// note — which is why adding `quarter` here in 2.26 cost CLASS_DEFS nothing.
export interface PeriodBounds {
  start: string;
  end: string;
  unit: "week" | "month" | "quarter" | "year";
}

// A dashboard period, in words — "July 2026", "Q3 2026", "week of 20 Jul 2026".
//
// Extracted in 2.52 because two widgets now need it and the one that had it
// was wrong for half the units. tables.ts formatted its own inline:
//
//   moment(period.start).format(period.unit === "month" ? "MMMM YYYY" : "[week of] D MMM YYYY")
//
// — a two-branch conditional over a four-value union, so a quarter-scoped table
// labelled itself "week of 1 Jul 2026" and a year-scoped one "week of 1 Jan
// 2026". Nobody had seen it because neither dashboard shipped a `tasks-table`
// yet, which makes it a trap laid for the release that adds one rather than a
// bug anyone reported.
//
// Naming the period is load-bearing, not decorative: it is what stops a scoped
// widget from reading as a broken unscoped one. "18 of 25 entries" on a page
// showing March is indistinguishable from a widget that has quietly lost most
// of its rows, unless it says which period it counted.
//
// Total over the union by construction — a fifth unit would fail to compile
// here rather than silently formatting as a week.
export function formatPeriodLabel(
  unit: PeriodBounds["unit"],
  startIso: string
): string {
  const m = moment(startIso);
  switch (unit) {
    case "week":
      return `week of ${m.format("D MMM YYYY")}`;
    case "month":
      return m.format("MMMM YYYY");
    case "quarter": {
      // Through util's own key space rather than arithmetic here, for the
      // reason resolvePeriodBounds routes the same way: `quarterOfMonth` is
      // already unit-tested, so there is one derivation instead of two that
      // have to agree.
      const key = quarterOfMonth(startIso.slice(0, 7)); // "2026-Q3"
      return `Q${key.slice(6)} ${key.slice(0, 4)}`;
    }
    case "year":
      return startIso.slice(0, 4);
  }
}

// The frontmatter property that makes a note a dashboard for each period, in
// resolution order.
//
// FIRST MATCH WINS, and that is only correct because a note carries at most one
// of these. A note holding two would resolve to whichever is listed first here
// and draw a plausible, wrong window — so the invariant is enforced by a guard
// test (scope-properties.test.ts) that reads every shipped asset and asserts it
// declares no more than one. Nothing else can check it.
//
// The order lives here once rather than as a chain of `if` branches at each
// site that asks. It used to be a chain in widgets.ts, which was fine while
// there was one caller; the chart editor is now a second, and two ordered lists
// that have to agree is exactly how the third caller gets it wrong.
export const PERIOD_PROPERTIES: {
  prop: string;
  unit: PeriodBounds["unit"];
}[] = [
  { prop: "week-start", unit: "week" },
  { prop: "quarter-start", unit: "quarter" },
  { prop: "year-start", unit: "year" },
  { prop: "month-start", unit: "month" },
];

// Which period a note is a dashboard for, from the properties it declares, or
// null when it declares none (a chart dropped on a plain note).
//
// Takes a membership predicate rather than the frontmatter object because the
// test has to be "is the key present", not "does it have a value":
// declared-but-blank counts. The shipped templates ship `week-start:` empty
// until you navigate, and a note that says it is a weekly dashboard is one
// whether or not it has chosen its week yet — the same tolerance
// buildWeekSummary already applies to the same blank value.
export function periodUnitOf(
  declares: (prop: string) => boolean
): PeriodBounds["unit"] | null {
  return PERIOD_PROPERTIES.find((p) => declares(p.prop))?.unit ?? null;
}

// The property a unit is declared by — the inverse of periodUnitOf, so a caller
// that has resolved the unit can read the value back without a second lookup
// table. Total over the union by construction.
export function periodPropertyFor(unit: PeriodBounds["unit"]): string {
  return PERIOD_PROPERTIES.find((p) => p.unit === unit)!.prop;
}

// The inclusive bounds of one period, from its unit and its anchor date.
//
// Extracted from chart-widgets.ts::resolvePeriodBounds in 2.57 and left as the
// only derivation of these four shapes. resolvePeriodBounds still owns reading
// the note — which file, which frontmatter, which property is declared — and
// now calls this for the arithmetic; `core/bridge.ts` calls it too, because a
// bridge anchored to a note's period has to agree with the charts on that note
// about what that period *is*.
//
// A second copy would drift exactly the way `util.ts::taskCounts` and
// `countAlmanacTasks` did: two answers to "which days are in this week", one of
// them quietly off by a day at the year boundary, and nothing to catch it
// because each looks right in isolation. Pure and total over the union, so a
// fifth unit fails to compile here rather than resolving to a plausible wrong
// window somewhere downstream.
export function periodBoundsFor(
  unit: PeriodBounds["unit"],
  anchor: MomentLike
): PeriodBounds {
  switch (unit) {
    case "week": {
      const start = anchor.startOf("isoWeek");
      return {
        start: start.format("YYYY-MM-DD"),
        end: start.clone().add(6, "days").format("YYYY-MM-DD"),
        unit,
      };
    }
    case "quarter": {
      // Bounds come from the pure quarter helpers in util.ts rather than
      // moment's own quarter unit — `quarterOfMonth` and `quarterMonths` are
      // already unit-tested (they were written for the study activity chart)
      // and work in the same "YYYY-Qn" key space the quarter view labels
      // with, so there is one derivation rather than two that have to agree.
      const months = quarterMonths(quarterOfMonth(anchor.format("YYYY-MM")));
      return {
        start: `${months[0]}-01`,
        end: moment(`${months[2]}-01`).endOf("month").format("YYYY-MM-DD"),
        unit,
      };
    }
    case "year": {
      // The year view rewrites this property when you pick a different year,
      // so every `range:period` chart on the page follows the selection
      // without needing to know the year view exists.
      const start = anchor.startOf("year");
      return {
        start: start.format("YYYY-MM-DD"),
        end: start.clone().endOf("year").format("YYYY-MM-DD"),
        unit,
      };
    }
    case "month": {
      const start = anchor.startOf("month");
      return {
        start: start.format("YYYY-MM-DD"),
        end: start.clone().endOf("month").format("YYYY-MM-DD"),
        unit,
      };
    }
  }
}

// How far back a line/bar trend reaches when scoped to a period. A single
// week (7 points) reads poorly as a trend and defeats the purpose of a trend
// chart, so we anchor the window's *end* to the period and extend the *start*
// back over a trailing span — the period still sits at the right edge, but
// there's enough history beside it to see a trend. The heatmap/summary don't
// use this (they show the period exactly). Chosen so a weekly dashboard shows
// ~a month and a monthly one shows ~a quarter.
const PERIOD_TREND_TRAILING_DAYS: Record<PeriodBounds["unit"], number> = {
  week: 30,
  month: 90,
  // Zero for the same reason the year is zero, one scale down: ~90 days is
  // already long enough to read as a trend, and the quarter view exists to
  // show *that quarter*. Widening would bleed the previous quarter into a
  // page whose whole purpose is to bound one — and a chart quietly showing
  // six months where it says three is close to invisible, which is why the
  // value is pinned by a test rather than left to read correctly.
  quarter: 0,
  // A year is already long enough to read as a trend, so it isn't widened —
  // and widening would be actively wrong here: the whole point of the year
  // view is that a chart shows *that year*, not that year plus a trailing tail
  // bleeding in from the one before.
  year: 0,
};

// The inclusive "YYYY-MM-DD" bounds a chart draws over. `start`/`end` null means
// unbounded that direction ("all time" has both null). Almanac reads the daily
// notes itself and filters points against these bounds with a plain string
// compare (see pointInWindow) — there is no external date parser in the loop, so
// there's no timezone/locale-dependent way for a bounded range to silently drop
// the newest day or an edge-clustered point. That was the entire "ranges show no
// data, only all-time works" bug: it lived in the Tracker plugin's own filename
// date parsing, which Almanac no longer depends on for charts.
export interface ChartWindow {
  start: string | null;
  end: string | null;
}

// Resolve a chart's range selection into inclusive [start, end] date bounds.
//
// For "period": the calendar heatmap / summary use the period's exact bounds;
// the trends (line/bar) widen a short period into a readable trailing window
// (see PeriodBounds / PERIOD_TREND_TRAILING_DAYS) so a single week doesn't read
// as 7 lonely points. For the fixed windows the span ends *today* (inclusive)
// and reaches back the selected number of days. "all" is unbounded both ways.
export function resolveChartWindow(
  range: ChartRange,
  period: PeriodBounds | null,
  widenForTrend: boolean,
  today: string = todayIso()
): ChartWindow {
  const iso = (m: MomentLike): string => m.format("YYYY-MM-DD");
  const daysBefore = (anchor: string, n: number): string =>
    iso(moment(anchor).subtract(n, "days"));

  if (range === "period") {
    if (!period) {
      // No resolvable period (chart on a non-dashboard note): last 30 days.
      return { start: daysBefore(today, 29), end: today };
    }
    if (!widenForTrend) return { start: period.start, end: period.end };
    const trailing = PERIOD_TREND_TRAILING_DAYS[period.unit];
    // A zero trailing span means "show the period exactly" (year).
    if (trailing <= 0) return { start: period.start, end: period.end };
    return { start: daysBefore(period.end, trailing - 1), end: period.end };
  }
  if (range === "all") return { start: null, end: null };
  const days = { "30": 30, "90": 90, "365": 365 }[range];
  return { start: daysBefore(today, days - 1), end: today };
}

// One logged value on one day. `date` is the "YYYY-MM-DD" parsed from the daily
// note's filename; `value` is the numeric magnitude charted — a plain number for
// a `number` tracker, or minutes-since-midnight for a `time` tracker (formatted
// back to a clock on the axis). Impure collection lives in chart-render.ts; this
// shape and the helpers below are pure so the windowing/stats are unit-testable.
export interface ChartPoint {
  date: string;
  value: number;
}

// Collapse daily points into one point per month.
//
// Dated to the 1st, matching the fiction monthly points already tell: it never
// reaches the reader, because a chart drawn at month resolution labels its axis
// by month (chart-render.ts::monthLabel), and it buys the whole window layer
// unchanged — pointInWindow is a string compare, so a point at "2026-07-01"
// filters correctly against bounds computed in days.
//
// Sorted on the way out. collectPoints walks the vault's file list, which is
// not date-ordered, and a line chart joins points in array order — the daily
// path gets away with it because pointsInWindow preserves the caller's order
// and the callers happen to sort downstream, but a bucketed series has to be
// right at the source or the line zig-zags through the year.
export function bucketByMonth(
  points: ChartPoint[],
  reduce: ChartReduce = "mean"
): ChartPoint[] {
  const buckets = new Map<string, number[]>();
  for (const p of points) {
    const key = p.date.slice(0, 7);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(p.value);
    else buckets.set(key, [p.value]);
  }

  const out: ChartPoint[] = [];
  for (const [key, values] of buckets) {
    const total = values.reduce((n, v) => n + v, 0);
    out.push({
      date: `${key}-01`,
      // Rounded to 2dp for the mean only. A sum of exact values is exact and
      // rounding it would be a lie; a mean is already an approximation and
      // 7.333333333333333 hours of sleep is noise in a tooltip.
      value: reduce === "sum" ? total : Math.round((total / values.length) * 100) / 100,
    });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

// Whether a point's date falls inside an inclusive window. Pure string compare
// on the ISO date — no Date/moment parsing, so the newest day can never be
// dropped by a timezone boundary.
export function pointInWindow(date: string, w: ChartWindow): boolean {
  if (w.start && date < w.start) return false;
  if (w.end && date > w.end) return false;
  return true;
}

// Points falling inside the window, in date order. Input needn't be sorted.
export function pointsInWindow(points: ChartPoint[], w: ChartWindow): ChartPoint[] {
  return points
    .filter((p) => pointInWindow(p.date, w))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── Rolling average (line overlay) ────────────────────────────────────────
//
// A trailing mean over the last `window` points, aligned to the input so the
// result plots directly against it. Weight and mood are a trend under noise;
// this is the standard way to see the trend through the jitter.
//
// Trailing, not centred: a centred average would need points from *after* each
// day, which reads the future — fine for a static export, wrong for a journal
// whose latest point is today and whose smoothed value must be defined there.
// The first points, before a full window exists, average what there is so far
// (a partial window) rather than being blank, so the overlay starts where the
// data does. `null` only for an empty input position, so the arrays stay
// index-aligned for Chart.js.
//
// Pure and separate from any canvas so the arithmetic is unit-tested.
export function rollingMean(values: number[], window: number): number[] {
  if (window < 1) return values.slice();
  const out: number[] = [];
  let sum = 0;
  const q: number[] = [];
  for (const v of values) {
    q.push(v);
    sum += v;
    if (q.length > window) sum -= q.shift()!;
    out.push(sum / q.length);
  }
  return out;
}

// The narrowest window `rollingWindowFor` will return. Named rather than
// inlined because the threshold below is defined against it: a window that is
// this floor is a window the data didn't choose.
export const ROLLING_WINDOW_MIN = 2;

// A sensible smoothing window for a given number of points: about a seventh of
// the series (a week, for daily data), clamped so a tiny series still smooths
// and a huge one doesn't over-flatten. Kept here, pure, so the default is one
// definition rather than a magic number at the call site.
export function rollingWindowFor(count: number): number {
  return Math.max(ROLLING_WINDOW_MIN, Math.min(30, Math.round(count / 7) || 2));
}

// Does a journal trend of this many points draw the rolling-average overlay?
//
// A diary chart carries the overlay as an explicit `+avg` flag, set in the
// chart editor and stored in the directive. A journal chart has nowhere to put
// one: `jchart:<key>:<shape>:<tracker>[|Label]` has no room, and the region's
// standing rule is that a spec is turned back into the ordinary directive it
// names — so any flag would have to be spelled twice, once in the spec and
// once in `journal-chart:`, and kept in step forever. The overlay is a display
// option on the same points, not a different reading of them, which is not
// worth a grammar change on both sides. So the rule is arithmetic instead, and
// this is it.
//
// The threshold is not a taste call: it is the count at which smoothing starts
// doing something. `rollingWindowFor` clamps up to ROLLING_WINDOW_MIN, and
// below ~18 points that clamp *is* the answer — a trailing mean of two is the
// raw line drawn again half a step late, a second series that says nothing the
// first didn't. Above it the window is derived from the series, so the overlay
// is a genuinely smoother line and the jitter it sees through is real. Deriving
// the threshold from the floor rather than writing `>= 18` keeps the two in
// step: change the window curve and the point where it earns its overlay moves
// with it.
//
// The cost of an automatic rule is that the reader can't overrule it, which is
// affordable only because it can't fire where it would be unwelcome — and it
// isn't silent: the overlay brings the legend with it (`renderLineOrBar` shows
// one exactly when there are two series), so the dashed line arrives named
// rather than as an unexplained second line.
export function journalTrendShowsAverage(count: number): boolean {
  return rollingWindowFor(count) > ROLLING_WINDOW_MIN;
}

// ── Scatter (two trackers paired by date) ─────────────────────────────────
//
// One (x, y) point per date that has *both* values. An inner join on date: a
// day where only one of the two was logged contributes nothing, because a
// scatter point needs both coordinates and there is no honest value to invent
// for the missing one. Sorted by date only for determinism (the plot itself is
// orderless).
export interface ScatterPoint {
  date: string;
  x: number;
  y: number;
}

export function pairPoints(
  xs: ChartPoint[],
  ys: ChartPoint[]
): ScatterPoint[] {
  const yByDate = new Map(ys.map((p) => [p.date, p.value]));
  const out: ScatterPoint[] = [];
  for (const p of xs) {
    const y = yByDate.get(p.date);
    if (y != null) out.push({ date: p.date, x: p.value, y });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ── Scatter clustering ────────────────────────────────────────────────────
//
// A scatter of two self-reported daily trackers is mostly COINCIDENT POINTS,
// and until now it drew them one on top of another. Mood is an integer 1–5 and
// sleep rounds to the half hour, so ninety days of data lands on maybe fifteen
// distinct coordinates — and the plot showed fifteen identical dots. A
// coordinate with one reading behind it and a coordinate with twenty looked
// exactly the same, which is not a cramped chart but a misleading one: the eye
// reads a scatter's density as weight, and every weight had been flattened to
// one.
//
// So identical pairs collapse into one mark, and the mark carries the count.
// The renderer sizes each by AREA (radius ∝ √count), which is the encoding
// that makes twenty readings look twenty times as heavy rather than twenty
// times as wide — the same reason a bubble chart scales by area.
//
// Exact-match grouping, deliberately, rather than a distance-based clustering:
// the values being grouped are the ones the reader actually logged, so two
// points merge only when they *are* the same reading twice. A radius-based
// cluster would merge 4 with 5 at some zoom levels and not others, which is a
// chart whose meaning depends on its size.
//
// `dates` is kept, capped by the caller when it renders a tooltip: knowing a
// heavy dot is twenty readings is the point, and knowing *which* twenty is the
// follow-up question a tooltip should be able to start answering.
export interface ScatterCluster {
  x: number;
  y: number;
  count: number;
  dates: string[];
}

export function clusterPairs(pairs: ScatterPoint[]): ScatterCluster[] {
  const by = new Map<string, ScatterCluster>();
  for (const p of pairs) {
    // NUL-joined rather than interpolated with a separator that could occur in
    // a number's own text: "1,-2" and "1,-2" are fine, but a locale-formatted
    // value or a negative sign make a "-" or "," separator ambiguous.
    const key = `${p.x}\u0000${p.y}`;
    const hit = by.get(key);
    if (hit) {
      hit.count += 1;
      hit.dates.push(p.date);
    } else {
      by.set(key, { x: p.x, y: p.y, count: 1, dates: [p.date] });
    }
  }
  // Heaviest last so the big marks paint over the small ones rather than
  // hiding them: a 1-reading dot inside a 20-reading disc should still be
  // visible at its edge, and z-order is the only thing that decides which.
  return [...by.values()].sort((a, b) => a.count - b.count);
}

// The radius a cluster of `count` readings draws at.
//
// Area ∝ count, so `r = base * √count`, capped — past a dozen or so coincident
// readings the exact number stops being legible from the mark anyway and the
// disc starts swallowing its neighbours, which costs more than the extra
// precision buys. The tooltip carries the true count regardless.
//
// Pure and pinned by a test because it is the whole of the encoding: if this
// drifts from √, the chart is quietly lying about weight again.
export function scatterRadius(count: number, base = 3.2, cap = 12): number {
  return Math.min(cap, base * Math.sqrt(Math.max(1, count)));
}

// ── Which ranges a chart may be set to ────────────────────────────────────
//
// One list, consulted by both the editor's dropdown and the tile's cycle
// button. They were about to be two: the button needs "which range comes
// next", the dropdown needs "which ranges exist", and those are the same
// question asked twice — the failure mode being a button that cycles onto a
// range the editor refuses to show, or vice versa.
//
// `hasPeriod` withholds "This period (follows the page)" from a note that
// declares no period property. On such a note resolveChartWindow silently
// falls back to a trailing 30 days, so the option is a label that lies: it
// says the chart follows the page, and there is nothing on the page to follow.
// Offering it in a *cycle* would be worse than in a dropdown — a reader
// pressing through the ranges would hit a state indistinguishable from "30
// days" and have no way to tell why.
export const CHART_RANGES: ChartRange[] = ["period", "30", "90", "365", "all"];

export function rangesAvailable(
  scope: ChartScope,
  hasPeriod: boolean
): ChartRange[] {
  return CHART_RANGES.filter((r) => {
    if (r === "period") return hasPeriod;
    // Monthly values land one per month, so a 30-day window holds one point
    // and a 90-day one holds three.
    if (scope === "monthly" && (r === "30" || r === "90")) return false;
    return true;
  });
}

// The next range in the cycle, given what this chart may be set to.
//
// A `current` that isn't in the list is answered with the list's first entry
// rather than being rejected, and that case is reachable rather than defensive:
// a chart set to `period` on a dashboard, then moved to a plain note, is
// exactly it. Cycling moves it off the unavailable range and never back, which
// is the honest resolution — the chart keeps drawing whatever it drew until
// someone presses the button, and pressing it lands somewhere real.
//
// Returns `current` unchanged when there is nowhere else to go, so a caller can
// compare and skip a pointless write.
export function nextChartRange(
  current: ChartRange,
  available: ChartRange[]
): ChartRange {
  if (available.length === 0) return current;
  const at = available.indexOf(current);
  if (at === -1) return available[0];
  return available[(at + 1) % available.length];
}

// ── Streak (boolean/habit runs) ───────────────────────────────────────────
//
// Over a date-sorted series of 0/1 values, the current run of consecutive
// trues ending at the last point, and the longest run anywhere. "Current" is
// measured from the end of the *data*, not from today: a habit not logged for
// three days has no entry to break the streak, and inventing false days for the
// gap would punish a missing log as if it were a logged failure — a different
// thing the tracker didn't record. Callers that want "broken if not done
// today" can compare the last date to today themselves.
//
// A value is "true" when it's ≥ 0.5, so a boolean stored as 0/1 works and a
// stray 0.7 rounds sensibly; anything absent was already filtered upstream.
export interface StreakStats {
  current: number;
  longest: number;
  total: number; // count of true entries in range
}

export function streakStats(points: ChartPoint[]): StreakStats {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  let longest = 0;
  let run = 0;
  let total = 0;
  for (const p of sorted) {
    if (p.value >= 0.5) {
      run += 1;
      total += 1;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  // `run` now holds the length of the final run, which is the current streak
  // (0 if the last logged value was false).
  return { current: run, longest, total };
}

export interface ChartSummary {
  count: number;
  avg: number;
  min: number;
  max: number;
  total: number;
}

// ── Clock (time-tracker) y-axis ──────────────────────────────────────────
// Values for a `time` tracker are plotted as minutes since midnight, so
// Chart.js's automatic tick spacing lands wherever it likes — 07:40, 08:20,
// 09:00. A clock axis should tick on the hour instead. This snaps the range
// outward to whole hours and picks a whole-hour step, so every tick formats as
// HH:00. Pure, so the arithmetic is unit-tested without a canvas.
const MINUTES_PER_HOUR = 60;
// Whole-hour steps to choose from, smallest first — all divide a day evenly, so
// a long span (e.g. bedtimes spanning most of the clock) still reads cleanly.
const HOUR_STEPS = [1, 2, 3, 4, 6, 8, 12, 24];
// Upper bound on gridlines before stepping up to a coarser interval; keeps a
// short chart tile from stacking a dozen labels.
const MAX_HOUR_TICKS = 8;

export function hourAxisBounds(
  values: number[]
): { min: number; max: number; stepSize: number } | null {
  if (values.length === 0) return null;
  const lo = Math.floor(Math.min(...values) / MINUTES_PER_HOUR) * MINUTES_PER_HOUR;
  let hi = Math.ceil(Math.max(...values) / MINUTES_PER_HOUR) * MINUTES_PER_HOUR;
  // Every value sat exactly on one hour boundary — give the axis a 1h span so
  // it isn't zero-height.
  if (hi <= lo) hi = lo + MINUTES_PER_HOUR;

  const spanHours = (hi - lo) / MINUTES_PER_HOUR;
  const stepHours =
    HOUR_STEPS.find((s) => spanHours / s <= MAX_HOUR_TICKS) ?? 24;
  // Extend the top to a whole number of steps so the final gridline is the
  // axis max (otherwise Chart.js would clip the last interval mid-step).
  const remainder = spanHours % stepHours;
  if (remainder !== 0) hi += (stepHours - remainder) * MINUTES_PER_HOUR;

  return { min: lo, max: hi, stepSize: stepHours * MINUTES_PER_HOUR };
}

// Avg / min / max / total over a set of values. Null when empty (the summary
// tile then shows a "no data in range" note instead of NaNs).
export function summarize(values: number[]): ChartSummary | null {
  if (values.length === 0) return null;
  let min = values[0];
  let max = values[0];
  let total = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    total += v;
  }
  return { count: values.length, avg: total / values.length, min, max, total };
}

// ── Per-note chart region ───────────────────────────────────────────────
// Charts are no longer synced from Settings onto a Stats page. Each dashboard
// owns its own charts inside a single ```almanac-charts fence, managed live by
// the "➕ Add chart" / edit / remove buttons. The `chart:` directive lines in
// that fence are the source of truth — chart-render.ts reads the daily-note
// frontmatter and draws each chart directly from these specs, so nothing here
// ever emits or parses Tracker YAML.

export interface ChartSpec {
  key: string;     // opaque, unique within the note; used as the button arg
  tracker: string; // TrackerDef.id
  type: ChartType;
  range: ChartRange;
  // Which notes the values come from. Optional, and absent means "daily" —
  // that is what keeps every chart written before 2.18.6 parsing unchanged.
  scope?: ChartScope;
  // scatter-only: the id of the tracker on the other axis. `tracker` is X,
  // `tracker2` is Y. Absent on every non-scatter chart, so its token only
  // appears where it means something.
  tracker2?: string;
  // line-only: overlay a rolling mean on the raw series. A display option, not
  // a different dataset — the same points, plus a smoothed line through them —
  // so it rides on the spec rather than being its own chart type.
  avg?: boolean;
  // How many grid cells this chart occupies. Absent means "derive it from the
  // chart type and the length of the window it draws" (see defaultSpan) — the
  // same absence-is-a-derivation rule `scope` follows, and the reason adding
  // this field rewrites no directive that is already on disk.
  size?: ChartSpan;
}

// ── Chart tile spans ──────────────────────────────────────────────────────
//
// A chart used to be exactly one cell of a two-column grid, and the grid had no
// row track — so each row took its own natural height, bounded by a
// min-height/max-height pair on the cell. That produced a *kind* of automatic
// sizing, and it is worth being precise about what kind, because it looks like
// a feature and is really a side effect: a row was as tall as the taller of the
// two charts in it, so a calendar heatmap with a year of week rows stretched
// its row to the cap and the unrelated chart beside it was stretched to match.
// The heatmap got the height it needed. The chart next to it got the height the
// heatmap needed. Neither was addressed, and moving a chart to a different row
// silently resized it.
//
// This section replaces that with the same outcome reached deliberately: a
// chart declares how many cells it wants, and the grid gives it exactly those.
// A tall chart is tall because it asked, not because of its neighbour.
//
// The vocabulary is in trackers.ts (ChartSpan); the geometry is here.

export const SPAN_CELLS: Record<ChartSpan, { cols: number; rows: number }> = {
  small: { cols: 1, rows: 1 },
  wide: { cols: 2, rows: 1 },
  tall: { cols: 1, rows: 2 },
  large: { cols: 2, rows: 2 },
};

// Membership test for a span name off the wire. A `+size=` token that isn't one
// of the four is dropped rather than fatal — see parseChartFlags.
export function isChartSpan(v: string): v is ChartSpan {
  return Object.prototype.hasOwnProperty.call(SPAN_CELLS, v);
}

// Roughly how many days a chart's window covers, which is the input the
// automatic size actually cares about.
//
// Keyed on the *resolved* length rather than the raw range token because the
// two come apart exactly where it matters most. `range: "period"` is one week
// on the weekly overview and a full calendar year on the year dashboard — the
// same token, two windows two orders of magnitude apart, and a rule that read
// the token would size the year dashboard's heatmap as though it held seven
// days. That is the case that motivated this feature, so the rule has to be
// able to see it.
//
// Approximate by construction, and that is fine: the thresholds below are
// coarse (a month, a quarter), so a month counted as 30 days rather than 31
// cannot change an answer. "all" is unbounded and reported as the longest
// bucket — a chart over all history is the one most in need of room, and
// treating an unknown span as short is the failure that reads as a bug.
export const ALL_TIME_DAYS = 100000;

export function rangeDays(
  range: ChartRange,
  periodUnit: PeriodBounds["unit"] | null
): number {
  if (range === "all") return ALL_TIME_DAYS;
  if (range !== "period") return { "30": 30, "90": 90, "365": 365 }[range];
  // No resolvable period means resolveChartWindow falls back to 30 days, so the
  // size rule has to make the same assumption or a chart on a plain note is
  // sized for a window it isn't drawing.
  if (periodUnit == null) return 30;
  return { week: 7, month: 30, quarter: 90, year: 365 }[periodUnit];
}

// Day counts at which a chart earns more room. Named because they are a taste
// call made once and pinned by a test, and because the two thresholds are
// answering different questions on different axes (see defaultSpan).
const WIDE_AFTER_DAYS = 90; // a trend past a quarter needs x-axis room
const TALL_AFTER_DAYS = 60; // a heatmap past ~8 week rows needs height

// The size a chart gets when it hasn't been given one.
//
// The rule rests on one observation, and it is the whole justification for
// having a span vocabulary rather than simply making every tile bigger: **a
// trend's readability is width and a calendar heatmap's is height.** Those are
// different axes. A year-long line chart squeezed into half a row is a smear
// because its points are too close together horizontally; a year-long heatmap
// is unreadable because 52 week rows don't fit vertically. One "bigger" cannot
// fix both, and each fix is wasted on the other.
//
// Everything that reduces to a handful of numbers — summary, streak — stays
// small at every length, because four numbers spread across a full row are four
// numbers further apart, not four numbers better understood. Scatter stays
// small because a point cloud reads square: widening it stretches the cloud and
// makes a correlation look stronger along the x-axis than it is, which is a
// chart that lies rather than a chart that is cramped.
//
// Pure, and separate from the spec, so the rule is one definition rather than a
// branch at each render site.
export function defaultSpan(type: ChartType, days: number): ChartSpan {
  switch (type) {
    case "month":
      // Height only, and never width — `large` is deliberately unreachable here.
      //
      // The intuition says a year-long heatmap wants the biggest tile going,
      // and that is wrong in a way only measurement catches. The cells are
      // squares sized by the column they sit in, so a wider tile makes every
      // cell bigger and therefore fits *fewer* week rows into the same height.
      // Rendered against a full year, a 2×2 tile showed about five week rows
      // where a 1×2 tile showed eleven. Width actively costs a heatmap the
      // thing it is short of.
      //
      // So the ceiling is `tall`. Past roughly a quarter the calendar scrolls
      // inside its tile, which is the honest degraded state (the body already
      // has overflow: auto) rather than a bigger box that shows less. Making a
      // year genuinely fit needs the grid transposed — weeks as columns —
      // which is a renderer change, not a layout one.
      return days >= TALL_AFTER_DAYS ? "tall" : "small";
    case "line":
    case "bar":
      return days >= WIDE_AFTER_DAYS ? "wide" : "small";
    // summary, streak, scatter, none.
    default:
      return "small";
  }
}

// The size a spec actually draws at: the one it was given, or the derived one.
export function spanOf(
  spec: ChartSpec,
  periodUnit: PeriodBounds["unit"] | null
): ChartSpan {
  return spec.size ?? defaultSpan(spec.type, rangeDays(spec.range, periodUnit));
}

// A chart's metadata + controls live in a fenced ```almanac block as a single
// directive: `chart:<key>:<tracker>:<type>:<range>`. That renders the Edit /
// Remove buttons (in Live Preview *and* Reading mode, unlike inline code) and
// doubles as the machine-readable record — so there's no separate HTML comment
// cluttering the note. type/range are anchored to their known sets, so a
// tracker id containing a colon still parses.
// The optional trailing `:<scope>` is anchored to its own known set, like
// type and range before it, so the greedy tracker-id group is still bounded on
// the right and an id containing colons keeps parsing. Omitted on daily charts
// so the directive a vault already has on disk is byte-identical.
//
// Two more optional tokens follow scope, added in 2.20, and both are prefixed
// so they can't be confused with a scope or with each other and so an id
// containing a colon still can't collide with them:
//   `+y=<id>`  the scatter Y-axis tracker (`tracker` is X). `=`-delimited
//              rather than positional so a second arbitrary id doesn't reopen
//              the greedy-group problem the anchoring solves.
//   `+avg`     the rolling-average overlay flag.
// And one more in 2.46:
//   `+size=<span>`  how many grid cells the chart occupies (small/wide/tall/
//              large). Omitted when the chart is automatically sized, which is
//              the usual case — see defaultSpan. The suffix group already
//              matched this shape, so the master regex is unchanged.
// The scatter token allows a colon-containing id after `+y=` because it runs to
// the next `+` or end; ids with a literal `+` in them aren't supported here,
// which is consistent with the flag grammar and vanishingly rare.
const CHART_TAG =
  /^chart:([^:]+):(.+):(line|bar|summary|month|scatter|streak):(period|30|90|365|all)(?::(daily|monthly))?((?:\+[^+]+)*)$/;

// The suffix group (m[6]) holds zero or more `+token` segments in any order.
// Parsed here rather than in the master regex so their order doesn't matter and
// adding another later is a line here, not another optional group fighting the
// greedy tracker id.
function parseChartFlags(suffix: string): {
  tracker2?: string;
  avg?: boolean;
  size?: ChartSpan;
} {
  const out: { tracker2?: string; avg?: boolean; size?: ChartSpan } = {};
  for (const seg of suffix.split("+")) {
    if (seg === "") continue;
    if (seg === "avg") out.avg = true;
    else if (seg.startsWith("y=")) out.tracker2 = seg.slice(2);
    // A typo'd `+size=huge` is dropped and the chart falls back to its
    // automatic size, rather than failing the line match and losing the chart
    // entirely (which is what an unrecognised *scope* token does). The two are
    // treated differently on purpose: a scope names where the data comes from,
    // so getting it wrong draws the wrong chart, while a size is cosmetic and
    // discarding a whole chart over one would be the worse trade.
    else if (seg.startsWith("size=")) {
      const v = seg.slice(5);
      if (isChartSpan(v)) out.size = v;
    }
  }
  return out;
}

// The Trends & Statistics section is bounded at its start by either the
// classic `## 📊 Trends and Statistics` markdown heading (vaults scaffolded
// before 1.6.x) or, since 1.6.2, an ```almanac fence whose first directive is
// `header:📊 Trends and Statistics` (the header-bar layout — there is no
// markdown heading in that case). `anchorEnd` is the index of the last line
// that belongs to the *anchor itself* (the heading line, or the closing ``` of
// the header fence): the managed chart body is rewritten from anchorEnd+1
// onward. The section ends at the next markdown heading of level 1–2, or the
// next `header:` fence that opens a different section — so a header-bar
// Tags/other section after Trends is a clean boundary, and the `### Label`
// sub-headings each chart emits (deeper than level 2) are never mistaken for
// the end. Section location (both the header-bar and legacy heading forms) is
// shared with the Journals rebuild via util.ts::locateSection.
const stripHash = (h: string): string => h.replace(/^#+\s*/, "");

// WHAT WE WRITE (canonical) versus WHAT WE ACCEPT (canonical + history). The
// two were one string until 4.26, which is what made the heading unrenameable:
// every read and every write anchored on the same literal, so changing it moved
// both at once and left old notes behind. Splitting them is the whole fix —
// `TRENDS_HEADER_TITLE` is the only one a write may use.
const TRENDS_HEADINGS = [TRENDS_HEADING, ...TRENDS_HEADINGS_PAST];
const TRENDS_HEADER_TITLES = TRENDS_HEADINGS.map(stripHash);
const TRENDS_HEADER_TITLE = TRENDS_HEADER_TITLES[0];

function sectionBounds(
  lines: string[]
): { start: number; anchorEnd: number; end: number } | null {
  const loc = locateSection(lines, TRENDS_HEADER_TITLES, TRENDS_HEADINGS);
  if (!loc) return null;
  // Charts keep the historical field names: `start` is the title's first line,
  // `anchorEnd` its last (the closing fence, or the heading line itself).
  return { start: loc.titleStart, anchorEnd: loc.titleEnd, end: loc.end };
}

// Locate the single ```almanac-charts fence in a note (open/close line indices).
// In the merged layout this fence is the whole Trends section — it carries both
// the section's `header:` title line and its `chart:` directives — so there's no
// separate heading/header block for locateSection to anchor on.
function findChartsFence(
  lines: string[]
): { open: number; close: number } | null {
  const open = lines.findIndex((l) => l.trim() === "```almanac-charts");
  if (open === -1) return null;
  for (let i = open + 1; i < lines.length; i++) {
    if (lines[i].trim() === "```") return { open, close: i };
  }
  return null;
}

// Read the section's `chart:` directives back into specs.
//
// Two layouts are supported. In the legacy/2.0 layout the Trends title is its
// own `## …` heading or ```almanac header block, and the charts live in a
// separate ```almanac-charts fence below it — so we read the section body after
// that anchor. In the merged layout there's no separate anchor: one self-titled
// ```almanac-charts fence owns the whole section, so we read the fence's own
// body (its `header:` line is ignored by parseChartDirectives). Scanning for the
// tag rather than requiring exact positions keeps both tolerant of blank lines.
export function parseChartRegion(lines: string[]): ChartSpec[] {
  const bounds = sectionBounds(lines);
  if (bounds) {
    return parseChartDirectives(lines.slice(bounds.anchorEnd + 1, bounds.end));
  }
  const fence = findChartsFence(lines);
  if (fence) return parseChartDirectives(lines.slice(fence.open + 1, fence.close));
  return [];
}

// Parse `chart:` directive lines (the body of an ```almanac-charts block) into
// specs. Shared with the widget processor, which hands it the raw fence source.
export function parseChartDirectives(lines: string[]): ChartSpec[] {
  const specs: ChartSpec[] = [];
  for (const line of lines) {
    const m = line.trim().match(CHART_TAG);
    if (!m) continue;
    const flags = parseChartFlags(m[6] ?? "");
    specs.push({
      key: m[1],
      tracker: m[2],
      type: m[3] as ChartType,
      range: m[4] as ChartRange,
      ...(m[5] ? { scope: m[5] as ChartScope } : {}),
      ...(flags.tracker2 ? { tracker2: flags.tracker2 } : {}),
      ...(flags.avg ? { avg: true } : {}),
      ...(flags.size ? { size: flags.size } : {}),
    });
  }
  return specs;
}

// Smallest unused `c<N>` key.
export function nextChartKey(existing: ChartSpec[]): string {
  const used = new Set(existing.map((s) => s.key));
  let n = 1;
  while (used.has(`c${n}`)) n++;
  return `c${n}`;
}

// The whole Trends & Statistics body is a single ```almanac-charts fence. Its
// lines are the chart directives (the source of truth) — one per chart — which
// the widget processor turns into a shared toolbar (Add / Edit… / Remove…) over
// a 2-per-row grid of equal chart cells. Keeping every chart in one fence is
// what gives them a common grid parent (Obsidian renders each fence as its own
// block, so the old fence-per-chart layout could never share a grid). An empty
// fence renders the placeholder toolbar + "no charts yet" state.
// A daily chart writes no scope token at all, so upgrading a vault never
// rewrites a directive that already says what it means.
export function serializeChartSpec(s: ChartSpec): string {
  const scope = s.scope && s.scope !== "daily" ? `:${s.scope}` : "";
  // Suffix flags follow scope, each `+`-prefixed. Order is fixed here (y before
  // avg) for a stable byte output, though the parser accepts either order.
  const y = s.tracker2 ? `+y=${s.tracker2}` : "";
  const avg = s.avg ? "+avg" : "";
  // Absent when the chart is auto-sized, so a directive written before 2.46
  // still serialises byte-identically — the same discipline the omitted `daily`
  // scope token follows, and pinned by a test for the same reason.
  const size = s.size ? `+size=${s.size}` : "";
  return `chart:${s.key}:${s.tracker}:${s.type}:${s.range}${scope}${y}${avg}${size}`;
}

function buildChartRegionBody(specs: ChartSpec[]): string[] {
  const out = ["```almanac-charts"];
  for (const s of specs) {
    out.push(serializeChartSpec(s));
  }
  out.push("```");
  return out;
}

// Rewrite the Trends & Statistics section body for one note from the given
// specs. Heading-bounded (no marker text), so anything you write below the next
// heading is untouched — but the section's own body is plugin-owned.
export async function writeChartRegion(
  app: App,
  notePath: string,
  specs: ChartSpec[]
): Promise<void> {
  const file = getFile(app, notePath);
  if (!file) return;
  const original = await app.vault.read(file);
  const lines = original.split("\n");

  // Legacy/2.0 layout: a separate title (```almanac header block or `## …`
  // heading) with the ```almanac-charts fence as the section body below it.
  // Rewrite that body as a fresh fence.
  const bounds = sectionBounds(lines);
  if (bounds) {
    const body = buildChartRegionBody(specs);
    const before = lines.slice(0, bounds.anchorEnd + 1);
    const after = lines.slice(bounds.end);
    const updated = [...before, "", ...body, "", ...after].join("\n");
    if (updated !== original) await app.vault.modify(file, updated);
    return;
  }

  // Merged layout: one self-titled ```almanac-charts fence owns the whole
  // section. Rewrite just its `chart:` lines, preserving its `header:` title
  // line (and anything else the user keeps) so the section stays self-titled.
  const fence = findChartsFence(lines);
  if (!fence) {
    new Notice("No Trends & Statistics section on this note.");
    return;
  }
  const preserved = lines
    .slice(fence.open + 1, fence.close)
    .filter((l) => l.trim().startsWith(HEADER_PREFIX));
  const body = [
    "```almanac-charts",
    ...preserved,
    ...specs.map(serializeChartSpec),
    "```",
  ];
  const updated = [
    ...lines.slice(0, fence.open),
    ...body,
    ...lines.slice(fence.close + 1),
  ].join("\n");
  if (updated !== original) await app.vault.modify(file, updated);
}

// ── Trends layout migration (2.0 → 2.1) ─────────────────────────────────────
// Fold the old two-block Trends section (a standalone `## …` heading or
// ```almanac header block, followed by a separate ```almanac-charts fence) into
// one self-titled ```almanac-charts fence, so the chart toolbar renders inside
// the section header. Idempotent: returns the input unchanged (null) once a note
// is already merged or has no legacy Trends anchor. Pure — see migrateTrends.
export function mergeTrendsSection(lines: string[]): string[] | null {
  const bounds = sectionBounds(lines);
  if (!bounds) return null; // already merged, or no legacy Trends anchor
  const specs = parseChartDirectives(lines.slice(bounds.anchorEnd + 1, bounds.end));
  const merged = [
    "```almanac-charts",
    `${HEADER_PREFIX}${TRENDS_HEADER_TITLE}`,
    ...specs.map(serializeChartSpec),
    "```",
  ];
  const before = lines.slice(0, bounds.start);
  const after = lines.slice(bounds.end);
  while (before.length && before[before.length - 1].trim() === "") before.pop();
  while (after.length && after[0].trim() === "") after.shift();
  const head = before.length ? [...before, ""] : [];
  const tail = after.length ? ["", ...after] : [];
  return [...head, ...merged, ...tail];
}

// Apply mergeTrendsSection to one note in place. No-op (returns false) when the
// note is missing, has no legacy Trends section, or is already merged.
export async function migrateTrends(
  app: App,
  notePath: string
): Promise<boolean> {
  const file = getFile(app, notePath);
  if (!(file instanceof TFile)) return false;
  const original = await app.vault.read(file);
  const merged = mergeTrendsSection(original.split("\n"));
  if (!merged) return false;
  const updated = merged.join("\n");
  if (updated === original) return false;
  await app.vault.modify(file, updated);
  return true;
}

// ── the untitled Trends section (3.9) ───────────────────────────────────────

// Give a self-titled charts fence its title, when it has none and never had.
//
// A SECOND MIGRATION RATHER THAN A CHANGE TO THE FIRST. `mergeTrendsSection`
// folds a legacy TWO-BLOCK section into one — a separate heading or `almanac`
// header block, plus a fence below it — and it is anchored on finding that
// block. The Year dashboard has no such block and never had one: its asset
// shipped a bare ```almanac-charts fence with nothing inside, so there is
// nothing for the merge to anchor on and it correctly returns null.
//
// So the two are different states with different repairs, and the untitled one
// had no repair at all. The consequence was a Trends section with no title, no
// fold arrow and no count on the year page — the toolbar rendering on its own
// through a fallback that exists for notes which have their title ELSEWHERE.
//
// WHY A MIGRATION AND NOT `reconcileLayouts`. Chart fences are opaque to
// layout.ts by design — `OPAQUE_FENCES` gives them no keywords, because their
// bodies are the reader's chart specs rather than directives — so a charts
// fence is never a unit, is never inserted, and is never rewritten. The
// reconciler therefore cannot see that a fence is missing a line inside it, and
// teaching it to would be the fourth verb layout.ts explicitly declines to
// learn. Its own instruction for this case is to ship a one-off migration next
// to migrateTrends, which is what this is.
//
// IDEMPOTENT AND CONSERVATIVE. Returns null — meaning "nothing to do" — unless
// all three hold:
//
//   - there is an ```almanac-charts fence,
//   - it has no `header:` line of its own, and
//   - there is no legacy Trends anchor above it.
//
// The third is what keeps this from fighting `mergeTrendsSection`: a note in
// the two-block state is that function's to fix, and titling its fence here
// would leave the note with the title twice. Run the merge first and this sees
// nothing left to do.
export function ensureTrendsHeader(lines: string[]): string[] | null {
  const fence = findChartsFence(lines);
  if (!fence) return null;

  const body = lines.slice(fence.open + 1, fence.close);
  if (body.some((l) => l.trim().startsWith(HEADER_PREFIX))) return null;

  // A legacy two-block section: mergeTrendsSection's, not this one's.
  if (sectionBounds(lines)) return null;

  const out = [...lines];
  out.splice(fence.open + 1, 0, `${HEADER_PREFIX}${TRENDS_HEADER_TITLE}`);
  return out;
}

// ── the Trends title's old spelling (4.26) ──────────────────────────────────

// Put a merged charts fence's title into the spelling this release writes.
//
// A THIRD MIGRATION, FOR THE SAME REASON THERE WAS A SECOND. `mergeTrendsSection`
// folds a two-block section into one and `ensureTrendsHeader` titles a fence
// that never had a title; neither can help a fence that HAS a title which is
// simply the old words. That is every dashboard scaffolded between 2.1 and
// 4.25 — the overwhelming majority of notes in the wild — and without this they
// would read "Trends and Statistics" beside newly-created pages reading
// "Trends and statistics", forever, since `reconcileLayouts` cannot see inside
// an opaque charts fence (see `ensureTrendsHeader`'s note on why).
//
// NOTHING BREAKS IF IT IS NEVER RUN, and that is deliberate. `sectionBounds`
// accepts every historical spelling, so an unmigrated note keeps working —
// its charts draw, its region rewrites, its toolbar appears. This migration is
// cosmetic, which is exactly why it must be offered rather than forced: it is
// opt-in in the repair window like the other two, and a reader who never ticks
// it loses nothing but the new capital letter.
//
// ONLY OUR OWN OLD WORDS. The rewrite fires when the title is one of
// `TRENDS_HEADINGS_PAST` and never otherwise. A reader who retitled their own
// Trends bar — which `header:` exists to let them do — has a title Almanac has
// never written, so it is not on the list, so it is left exactly alone. This is
// the reason the history is a list of exact strings rather than a
// case-insensitive compare, which would have "corrected" a reader's
// "Trends and STATISTICS" into ours.
export function retitleTrends(lines: string[]): string[] | null {
  const fence = findChartsFence(lines);
  if (!fence) return null;
  // A two-block note is `mergeTrendsSection`'s, and that function already
  // writes the canonical title when it folds. Titling here as well would race
  // it for the same line.
  if (sectionBounds(lines)) return null;

  const out = [...lines];
  let changed = false;
  for (let i = fence.open + 1; i < fence.close; i++) {
    const raw = out[i].trim();
    if (!raw.startsWith(HEADER_PREFIX)) continue;
    // Through `parseHeaderDirective`, so a `header:2:…` keeps its level rather
    // than having the digits swallowed into a new title.
    const { level, title } = parseHeaderDirective(raw.slice(HEADER_PREFIX.length));
    if (!TRENDS_HEADINGS_PAST.map(stripHash).includes(title)) continue;
    const prefix = raw.slice(HEADER_PREFIX.length).match(/^\d+:/) ? `${level}:` : "";
    out[i] = `${HEADER_PREFIX}${prefix}${TRENDS_HEADER_TITLE}`;
    changed = true;
  }
  return changed ? out : null;
}

// Apply retitleTrends to one note in place. No-op (returns false) when the note
// is missing, has no charts fence, or its title is already the current one.
export async function migrateTrendsTitle(
  app: App,
  notePath: string
): Promise<boolean> {
  const file = getFile(app, notePath);
  if (!(file instanceof TFile)) return false;
  const original = await app.vault.read(file);
  const retitled = retitleTrends(original.split("\n"));
  if (!retitled) return false;
  const updated = retitled.join("\n");
  if (updated === original) return false;
  await app.vault.modify(file, updated);
  return true;
}

// Apply ensureTrendsHeader to one note in place. No-op (returns false) when the
// note is missing, has no charts fence, or already has a title.
export async function migrateTrendsHeader(
  app: App,
  notePath: string
): Promise<boolean> {
  const file = getFile(app, notePath);
  if (!(file instanceof TFile)) return false;
  const original = await app.vault.read(file);
  const titled = ensureTrendsHeader(original.split("\n"));
  if (!titled) return false;
  const updated = titled.join("\n");
  if (updated === original) return false;
  await app.vault.modify(file, updated);
  return true;
}

// Runs the vault-sync steps used everywhere a tracker's *definition* changes,
// so the daily template and Diary.base never drift. Charts are no longer part
// of this — they're mutated per-note through the chart manager.
export async function syncTrackerConfig(
  app: App,
  plugin: AlmanacPlugin
): Promise<void> {
  await syncTrackersIntoVault(app, plugin);
}
