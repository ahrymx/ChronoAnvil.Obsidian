// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { App, Notice, normalizePath, TFile, TFolder, moment as _moment } from "obsidian";
import { FENCE_OPEN, FENCE_CLOSE, HEADER_PREFIX } from "./constants";

// The `moment` export is typed as a namespace; cast to its callable form.
// Shared across every module that needs date math (diary.ts, calendar.ts,
// nav.ts) so there's one definition of "what moment can do" instead of each
// file re-declaring its own subset.
export interface MomentLike {
  isValid(): boolean;
  startOf(unit: string): MomentLike;
  endOf(unit: string): MomentLike;
  add(n: number, unit: string): MomentLike;
  subtract(n: number, unit: string): MomentLike;
  clone(): MomentLike;
  diff(other: MomentLike, unit: string): number;
  format(fmt: string): string;
  year(): number;
  month(): number;
  date(): number;
  day(): number;
  daysInMonth(): number;
  isoWeek(): number;
}
export const moment = _moment as unknown as (input?: unknown) => MomentLike;

// The locale's first day of the week as a 0..6 index (0=Sun … 6=Sat), read from
// the active moment locale — which Obsidian sets from the app language, so this
// follows the user's locale rather than a hard-coded choice. Shared by the diary
// calendar and the chart calendar-heatmap so both start weeks on the same day.
// Falls back to Monday (1), Almanac's historical default, if locale data is
// somehow unavailable.
export function weekStartDay(): number {
  const md = (
    _moment as unknown as {
      localeData?: () => { firstDayOfWeek?: () => number };
    }
  ).localeData?.();
  const dow = md?.firstDayOfWeek?.();
  return typeof dow === "number" && dow >= 0 && dow <= 6 ? dow : 1;
}

// How many days to step back from a given weekday to reach the most recent
// week-start — i.e. the day's column offset within a week that begins on
// `weekStart`. Pure so it's unit-testable and shared by both week grids.
export function daysSinceWeekStart(dayOfWeek: number, weekStart: number): number {
  return ((dayOfWeek - weekStart) % 7 + 7) % 7;
}

// Ensure a folder (and all parents) exists. No-op if already present.
export async function ensureFolder(app: App, path: string): Promise<void> {
  const clean = normalizePath(path);
  if (!clean || clean === "/" || clean === ".") return;
  const existing = app.vault.getAbstractFileByPath(clean);
  if (existing instanceof TFolder) return;
  try {
    await app.vault.createFolder(clean);
  } catch (e) {
    // Race or already-exists — verify and swallow.
    if (!(app.vault.getAbstractFileByPath(clean) instanceof TFolder)) throw e;
  }
}

// Create a file, making parent folders first. Returns the existing file if
// one is already at that path (never overwrites).
export async function createFileEnsuringFolders(
  app: App,
  path: string,
  content: string
): Promise<TFile> {
  const clean = normalizePath(path);
  const existing = app.vault.getAbstractFileByPath(clean);
  if (existing instanceof TFile) return existing;
  const parent = clean.split("/").slice(0, -1).join("/");
  if (parent) await ensureFolder(app, parent);
  return app.vault.create(clean, content);
}

export function getFile(app: App, path: string): TFile | null {
  const f = app.vault.getAbstractFileByPath(normalizePath(path));
  return f instanceof TFile ? f : null;
}

export function getFolder(app: App, path: string): TFolder | null {
  const f = app.vault.getAbstractFileByPath(normalizePath(path));
  return f instanceof TFolder ? f : null;
}

// Read a template note from the vault. Returns null if it isn't there.
export async function readTemplate(
  app: App,
  path: string
): Promise<string | null> {
  const file = getFile(app, path);
  if (!file) return null;
  return app.vault.read(file);
}

export async function openFile(app: App, file: TFile): Promise<void> {
  await app.workspace.getLeaf(false).openFile(file);
}

// Open Obsidian's own core Search pane pre-filled with `query` (e.g.
// `tag:#foo`) — used by the tag-cloud widget so clicking a tag searches the
// *whole* vault, not just the folder the widget counts within. Reaches into
// the core "global-search" plugin the same way several community plugins do;
// there's no public API for this. Falls back to a Notice if the core Search
// plugin is disabled (rare, but a broken click is worse than a clear reason).
export function openGlobalSearch(app: App, query: string): void {
  const internalPlugins = (
    app as unknown as {
      internalPlugins: {
        getPluginById(id: string):
          | { instance?: { openGlobalSearch?: (q: string) => void } }
          | undefined;
      };
    }
  ).internalPlugins;
  const instance = internalPlugins?.getPluginById?.("global-search")?.instance;
  if (instance?.openGlobalSearch) {
    instance.openGlobalSearch(query);
    return;
  }
  new Notice("Enable the core Search plugin to search from here.");
}

export function today(): string {
  return moment().format("YYYY-MM-DD");
}

export function thisMonth(): string {
  return moment().format("YYYY-MM");
}

export function nowTimestamp(): string {
  return moment().format("YYYY-MM-DDTHH:mm:ss");
}

// ── THE HOME-HERO HELPERS ARE DELETED (4.13.1 §3) ──────────────────────
// `greetingForHour`, `countInMonth` and `entryStreak` were the pure half of the
// diary hero: the greeting, "entries this month" and the streak. The hero is
// gone — `src/diary/diary-header.ts` is the account — and these had exactly one
// caller each, which was it.
//
// DELETED RATHER THAN LEFT AS PURE FUNCTIONS THAT STILL PASS THEIR TESTS,
// because that is the shape this project keeps finding rotted: a tested export
// nothing calls looks like a utility the next feature should reach for, and
// three of them describing a widget that no longer exists is a false trail with
// a green suite behind it. `test/pure-logic.test.ts`'s three "home-hero"
// describes went with them.
//
// `entryStreak`'s FORGIVENESS RULE SURVIVES, in `yearStripStats` below, which
// cites it: a day with no entry today does not break a streak until tomorrow.
// That is the one idea here worth more than its function.

// How much of a period has actually happened.
//
// The one number a review dashboard gets wrong, and it got it wrong for six
// releases: renderPeriodStats took its denominator from whichever caller
// invoked it, and the quarter handed over `daysInQuarter(quarter)` — the whole
// ninety-odd days — so on 5 July a quarter with three entries read
// "3/92 days logged". The year view, given identical data, has always said "so
// far" and rated against elapsed days, because year-stats.ts argues at length
// that a partial period silently compared against a whole one is the most
// obvious way for a stats page to mislead. It is the same argument at every
// scale; only the year acted on it.
//
// Deciding it here rather than at three call sites is the same move
// renderPeriodStats itself was in 2.10: the week, month and quarter cannot
// drift apart on what "logged" is measured against, because there is one
// answer. Note this bites on the week too, not only the quarter — on a Monday
// the current week already reads 1/7 when it should read 1/1.
//
// Pure, and inclusive at both ends, matching every other date span in the
// plugin (bounds are compared as ISO strings elsewhere, so a half-open range
// here would be the odd one out).
export interface PeriodCoverage {
  // Days of the period that have happened, inclusive of today. 0 before it
  // begins.
  elapsed: number;
  // Days in the whole period, regardless of today.
  total: number;
  // The period is not finished — either still running or not yet begun.
  partial: boolean;
  // Today is on or after the period's first day.
  started: boolean;
}

export function periodCoverage(
  startIso: string,
  endIso: string,
  todayIso: string
): PeriodCoverage {
  const total = Math.max(0, moment(endIso).diff(moment(startIso), "days") + 1);
  if (todayIso < startIso) {
    // Ahead of today entirely: zero elapsed rather than a full period of
    // nothing, so a caller doesn't render "0/92" for a quarter that hasn't
    // begun. Same shape yearWindow and quarterWindow already return.
    return { elapsed: 0, total, partial: true, started: false };
  }
  if (todayIso >= endIso) {
    return { elapsed: total, total, partial: false, started: true };
  }
  const elapsed = Math.max(
    0,
    moment(todayIso).diff(moment(startIso), "days") + 1
  );
  return { elapsed, total, partial: true, started: true };
}

// Substitute {{token}} placeholders. Unknown tokens are left in place so a
// missing value is visible rather than silently blank.
export function fillTemplate(
  body: string,
  tokens: Record<string, string>
): string {
  return body.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key] : match
  );
}

// ── template fills ────────────────────────────────────────────────────
// Pure string transforms, extracted from openOrCreateDay/openOrCreateMonth so
// the shipped assets can be tested against them without a vault. That matters
// more than it looks: these are line-anchored regexes run over a template body,
// so editing a template's frontmatter can silently stop them matching, and the
// only symptom is a new note with a blank date — no error, no warning. The
// asset tests in test/pure-logic.test.ts assert the real templates still fill.

// Quote the date so YAML keeps it a string. Obsidian parses an unquoted
// YYYY-MM-DD as a Date object, and Tracker's frontmatter xDataset only reads
// string dates — an unquoted value silently yields no x-axis dates, which
// breaks every bounded chart range (30/90/365-day).
export function fillDailyTemplate(tpl: string, dateStr: string): string {
  return tpl.replace(/^journal-date:.*$/m, `journal-date: "${dateStr}"`);
}

// `journal-date` is set to the month's first day so a monthly note sorts and
// filters alongside the dailies (the period-scoped tasks-table reads exactly
// this property to decide which month a note belongs to).
export function fillMonthlyTemplate(tpl: string, monthStr: string): string {
  return tpl
    .replace(/^month:.*$/m, `month: ${monthStr}`)
    .replace(/^journal-date:.*$/m, `journal-date: "${monthStr}-01"`);
}

// Sort child folders of a folder alphabetically (locale-aware).
export function childFolders(folder: TFolder | null): TFolder[] {
  if (!folder) return [];
  return folder.children
    .filter((c): c is TFolder => c instanceof TFolder)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The markdown files directly inside a folder — not recursive, unlike
// filesUnder. What a folder note's own page list wants: pages sit beside their
// dashboard, and a sub-folder below it is a different note's business.
export function childFiles(folder: TFolder | null): TFile[] {
  if (!folder) return [];
  return folder.children
    .filter((c): c is TFile => c instanceof TFile && c.extension === "md")
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── Shared by nav.ts / calendar.ts ─────────────────────────────────────
// These read note metadata directly from Obsidian's own vault + cache APIs
// rather than going through Dataview, so the built-in navigator/calendar
// widgets have no dependency on the Dataview plugin.

// All markdown files whose path sits under `folderPath` (recursive, like
// Dataview's `dv.pages('"folder"')`).
export function filesUnder(app: App, folderPath: string): TFile[] {
  const prefix = normalizePath(folderPath) + "/";
  return app.vault.getMarkdownFiles().filter((f) => f.path.startsWith(prefix));
}

export function frontmatterOf(
  app: App,
  file: TFile
): Record<string, unknown> {
  return app.metadataCache.getFileCache(file)?.frontmatter ?? {};
}

// Normalize a frontmatter date-ish value to "YYYY-MM-DD". Handles plain
// strings (the normal case for Obsidian-authored frontmatter), and falls
// back gracefully for a stray Date/Luxon/moment value rather than trusting
// a plain String() conversion, which would mangle a real Date object.
export function isoDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "string") return v.slice(0, 10);
  if (v instanceof Date) return moment(v).format("YYYY-MM-DD");
  if (typeof v === "object") {
    const anyV = v as { toISODate?: () => string; format?: (f: string) => string };
    if (typeof anyV.toISODate === "function") return anyV.toISODate();
    if (typeof anyV.format === "function") return anyV.format("YYYY-MM-DD");
  }
  return String(v).slice(0, 10);
}

// Open/completed task counts for a single date. The study Activity chart sums
// these per day across every note in a subject folder.
export interface ActivityCount {
  date: string;
  open: number;
  done: number;
  // Dated notes written on this day. NEW IN 3.12.1, and the reason is that
  // "activity" had meant "tasks" everywhere in this file while every surface
  // reading it is titled as though it means "work done".
  //
  // A Study root of twenty-four dated lessons reported ACTIVE DAYS 0, DAYS
  // STREAK 0 and an entirely blank twelve-month strip, because not one of those
  // lessons happened to carry a `- ( )` line. The arithmetic was right and the
  // question it answered was not the one the page asks.
  //
  // Optional so every existing construction site stays valid and reads as 0 —
  // which is the old behaviour exactly, for a caller that has not been taught
  // to count notes yet.
  notes?: number;
}

// Sum note and task counts per date across a set of per-note rows, keeping only
// dates inside the inclusive [start, end] window (null = unbounded that way)
// and only dates that carry SOMETHING — a note or a task.
//
// The "or a note" is 3.12.1. This used to drop any date with no tasks, which
// is what made a year of dated notes render as an empty strip. Pure — the
// impure file walk
// lives in chart-render.ts — so the bucketing is unit-testable without a vault.
export function aggregateActivity(
  rows: ActivityCount[],
  start: string | null,
  end: string | null
): ActivityCount[] {
  const byDate = new Map<string, { open: number; done: number; notes: number }>();
  for (const r of rows) {
    if (start && r.date < start) continue;
    if (end && r.date > end) continue;
    const notes = r.notes ?? 0;
    if (r.open === 0 && r.done === 0 && notes === 0) continue;
    const cur = byDate.get(r.date) ?? { open: 0, done: 0, notes: 0 };
    cur.open += r.open;
    cur.done += r.done;
    cur.notes += notes;
    byDate.set(r.date, cur);
  }
  return [...byDate.entries()]
    .map(([date, v]) => ({ date, open: v.open, done: v.done, notes: v.notes }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Which of the 4 heatmap shades a day's total task count earns, bucketed
// against the busiest day in the same view. Quartiles of the month's own max
// rather than fixed thresholds, so a quiet month still shows contrast instead
// of rendering as one flat shade.
//
// `total` of 0 (or a max of 0, i.e. nothing logged at all) returns null — the
// caller renders those as the empty cell, which is a different thing from "the
// lightest shade": a day with no work is not a faint amount of work.
// What one day weighs, for shading and for the busiest-day scale.
//
// A DATED NOTE IS ACTIVITY AND TASKS DEEPEN IT (3.12.1). Writing something is
// the act these pages exist to record; ticking things off inside it is more of
// the same day's work, not a different kind. So a note is worth 1 and each task
// adds 1 — a day with one untasked lesson shades, and a day with a lesson and
// three tasks shades harder.
//
// One function, so the strip, the month grid and the streak maths cannot come
// to different views of what a busy day is.
export function activityWeight(c: {
  open: number;
  done: number;
  notes?: number;
}): number {
  return (c.notes ?? 0) + c.open + c.done;
}

export function activityBucket(total: number, max: number): number | null {
  if (total <= 0 || max <= 0) return null;
  const bucket = Math.ceil((total / max) * 4);
  return Math.min(4, Math.max(1, bucket));
}

// Per-month summary for the stat row above the heatmap: how many days carried
// any work, the open/completed split across them, and the busiest day's total
// (which activityBucket needs to scale the shades). `month` is "YYYY-MM";
// rows outside it are ignored, so the caller can pass a whole year's rows and
// slice client-side without re-reading the vault on every navigation.
export interface MonthActivityStats {
  activeDays: number;
  open: number;
  done: number;
  max: number;
}
export function monthActivityStats(
  rows: ActivityCount[],
  month: string
): MonthActivityStats {
  let activeDays = 0;
  let open = 0;
  let done = 0;
  let max = 0;
  for (const r of rows) {
    if (r.date.slice(0, 7) !== month) continue;
    // Same weight the strip uses (3.12.1) — a month grid that called a day
    // empty while the year strip shaded it would be two answers to one
    // question, on two views of the same vault.
    const total = activityWeight(r);
    if (total <= 0) continue;
    activeDays++;
    open += r.open;
    done += r.done;
    if (total > max) max = total;
  }
  return { activeDays, open, done, max };
}

// The inclusive range of months the heatmap may navigate: from the month of the
// earliest dated row to `currentMonth`. Bounding both ends is what stops the
// chevrons walking forever into empty grids — forward past today tells you
// nothing, and back past the first note is all-empty by construction.
//
// With no rows at all, both ends collapse to `currentMonth`: a brand-new
// subject shows this month and neither chevron is live.
export function activityMonthBounds(
  rows: ActivityCount[],
  currentMonth: string
): { first: string; last: string } {
  let first = currentMonth;
  for (const r of rows) {
    const m = r.date.slice(0, 7);
    if (m && m < first) first = m;
  }
  return { first, last: currentMonth };
}

// ── quarters ──────────────────────────────────────────────────────────────
// The Activity heatmap navigates a quarter at a time and draws that quarter's
// three months side by side. One month per step was too tight a window to read
// a study habit from: a subject touched twice a week looks identical in every
// month, and judging whether the pace changed meant clicking back and forth
// holding two grids in your head. Three at once makes the comparison spatial.
//
// A quarter is written "YYYY-Qn" so that, like the "YYYY-MM" month keys, plain
// string compare is chronological order — the bounds checks below and in
// chart-render.ts are all `<` / `>` on these, never date maths.

// "2026-07" → "2026-Q3".
export function quarterOfMonth(month: string): string {
  const year = month.slice(0, 4);
  const m = Number(month.slice(5, 7));
  return `${year}-Q${Math.floor((m - 1) / 3) + 1}`;
}

// "2026-Q3" → ["2026-07", "2026-08", "2026-09"], always three, always in
// calendar order — the render walks this to lay the panels out left to right.
export function quarterMonths(quarter: string): string[] {
  const year = quarter.slice(0, 4);
  const q = Number(quarter.slice(6));
  const start = (q - 1) * 3 + 1;
  return [0, 1, 2].map((i) => `${year}-${String(start + i).padStart(2, "0")}`);
}

// Step `delta` quarters from `quarter`, rolling the year over. Kept here rather
// than done with moment in the renderer so the wrap-around (Q4 → next Q1) is
// covered by the pure tests.
export function shiftQuarter(quarter: string, delta: number): string {
  const year = Number(quarter.slice(0, 4));
  const q = Number(quarter.slice(6));
  const zero = year * 4 + (q - 1) + delta;
  return `${Math.floor(zero / 4)}-Q${(((zero % 4) + 4) % 4) + 1}`;
}

// The inclusive range of quarters the heatmap may navigate, the quarter-scale
// analogue of activityMonthBounds: from the quarter holding the earliest dated
// row to the quarter holding today. Note the first quarter is *whole* — landing
// on a subject whose first note is in March opens all of Q1, with January and
// February drawn as empty grids. That's deliberate: a partial first panel would
// make the quarter's shape depend on when you happened to start.
export function activityQuarterBounds(
  rows: ActivityCount[],
  currentMonth: string
): { first: string; last: string } {
  const months = activityMonthBounds(rows, currentMonth);
  return {
    first: quarterOfMonth(months.first),
    last: quarterOfMonth(months.last),
  };
}

// Quarter-scoped totals for the stat rail, and the busiest single day across
// all three months.
//
// That `max` is shared by the three grids on purpose: bucketing each month
// against its own max would rescale every panel independently, so a month with
// one task and a month with forty would both paint a full-strength square and
// the side-by-side comparison the layout exists for would be a lie. One scale
// per view means a quiet month reads as quiet.
export function quarterActivityStats(
  rows: ActivityCount[],
  quarter: string
): MonthActivityStats {
  const out: MonthActivityStats = { activeDays: 0, open: 0, done: 0, max: 0 };
  for (const month of quarterMonths(quarter)) {
    const s = monthActivityStats(rows, month);
    out.activeDays += s.activeDays;
    out.open += s.open;
    out.done += s.done;
    if (s.max > out.max) out.max = s.max;
  }
  return out;
}

// ── Year strip (Journals hero heatmap, 2.13.8) ────────────────────────────
//
// The subject-level Activity chart is a browsable quarter: three month grids
// with numbered days, because on one subject you want to read individual days
// and step back through them. The Journals hero answers a different question —
// "have I kept this up?" across every journal type at once — and it has to do
// it in the top band of a section without pushing the actual journal list below
// the fold. So it's a fixed, non-navigable window of the last 53 weeks at ~10px
// a cell: no day numbers, no chevrons, one glance.
//
// The window ends on the *end of the week containing today* rather than on
// today, so the final column is a whole week and the grid's right edge stays
// straight. Days after today inside that last column are still emitted (as
// `is-future`) to hold the shape, rather than left as ragged holes.

// One cell of the year strip. `iso` is null for a padding day.
export interface YearCell {
  iso: string;
  open: number;
  done: number;
  notes: number;
  // Column-major index within the strip; the caller turns this into a grid
  // position. Kept here so the DOM builder stays a dumb loop.
  week: number;
  weekday: number;
  future: boolean;
}

// The inclusive [start, end] ISO bounds of the 53-week window ending in the
// week that contains `todayIso`. Start is always a week-start day, end always
// the day before the next week-start, so the strip is exactly 53*7 cells.
export function yearStripBounds(
  todayIso: string,
  weeks = 53
): { start: string; end: string } {
  const ws = weekStartDay();
  const t = moment(todayIso);
  const lead = daysSinceWeekStart(t.day(), ws);
  // Start of the week containing today, then back (weeks-1) whole weeks.
  const start = t.clone().subtract(lead, "days").subtract(weeks - 1, "weeks");
  const end = start.clone().add(weeks * 7 - 1, "days");
  return {
    start: start.format("YYYY-MM-DD"),
    end: end.format("YYYY-MM-DD"),
  };
}

// Expand the window into cells, joined against the aggregated activity rows.
// Pure: the vault walk happens in the caller, so the layout maths is testable.
export function yearStripCells(
  rows: ActivityCount[],
  todayIso: string,
  weeks = 53
): YearCell[] {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  const { start } = yearStripBounds(todayIso, weeks);
  const from = moment(start);
  const out: YearCell[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    // Offset from the window start each time rather than stepping a shared
    // cursor: moment's `add` mutates in place and returns itself, so a cursor
    // is only correct if the return value is discarded — and wrong the moment
    // anything hands back a fresh instance instead. Deriving from a fixed
    // origin has no such dependency, and costs nothing at 371 iterations.
    const iso = from.clone().add(i, "days").format("YYYY-MM-DD");
    const row = byDate.get(iso);
    out.push({
      iso,
      open: row?.open ?? 0,
      done: row?.done ?? 0,
      notes: row?.notes ?? 0,
      week: Math.floor(i / 7),
      weekday: i % 7,
      future: iso > todayIso,
    });
  }
  return out;
}

// Month labels for the strip's caption row: the short month name and the
// column it starts in. A month gets a label only when its first day falls in
// the window and it has at least `minWeeks` columns of room before the next
// one, so a month clipped to two columns at the left edge doesn't collide with
// its neighbour's caption.
export function yearStripMonthLabels(
  cells: YearCell[],
  minWeeks = 3
): { label: string; week: number }[] {
  const out: { label: string; week: number }[] = [];
  let lastMonth = "";
  for (const c of cells) {
    const month = c.iso.slice(0, 7);
    if (month === lastMonth) continue;
    lastMonth = month;
    const week = c.week;
    // Drop a label that would sit on top of the previous one.
    if (out.length && week - out[out.length - 1].week < minWeeks) continue;
    out.push({ label: moment(c.iso).format("MMM"), week });
  }
  return out;
}

// Totals over the whole strip window, plus the busiest day (which
// activityBucket needs to scale the shades) and the streak figures the hero
// reports beside the grid.
export interface YearStripStats {
  activeDays: number;
  open: number;
  done: number;
  max: number;
  streak: number;
  longest: number;
}

// `streak` counts back from today (a day with no work today doesn't break a
// streak until tomorrow — the forgiveness the deleted `entryStreak` gave the
// diary, and the reason that rule outlived its function, so opening the home at
// 9am doesn't show a zero you earned by not having worked yet). `longest` is the
// longest run anywhere in the window.
export function yearStripStats(
  cells: YearCell[],
  todayIso: string
): YearStripStats {
  const out: YearStripStats = {
    activeDays: 0,
    open: 0,
    done: 0,
    max: 0,
    streak: 0,
    longest: 0,
  };
  let run = 0;
  for (const c of cells) {
    if (c.future) continue;
    const total = activityWeight(c);
    if (total > 0) {
      out.activeDays++;
      out.open += c.open;
      out.done += c.done;
      if (total > out.max) out.max = total;
      run++;
      if (run > out.longest) out.longest = run;
    } else {
      run = 0;
    }
  }
  // Current streak: walk back from today over the non-future cells.
  const past = cells.filter((c) => !c.future);
  for (let i = past.length - 1; i >= 0; i--) {
    const total = activityWeight(past[i]);
    if (total > 0) out.streak++;
    else if (past[i].iso === todayIso) continue; // today may not have started
    else break;
  }
  return out;
}

// Strip a trailing ".md" for use as internal-link href/data-href.
export function noExt(path: string): string {
  return path.replace(/\.md$/, "");
}

// The final path segment (like POSIX basename). A path with no "/" is
// returned unchanged. Shared by calendar.ts / links.ts / nav.ts, which each
// used to keep a private identical copy.
export function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

// A folder note's path: `<folder>/<folder name>.md`. One rule for the whole
// vault: what a subject or topic index note is, and what the two period
// dashboards are — each is the folder note of the folder its entries live in.
//
// Derived rather than stored. The two dashboards used to be fixed constants
// (`WEEKLY_REVIEW` / `MONTHLY_REVIEW`) that every caller then took `basename()`
// of and re-joined onto the configured folder — so the constant contributed a
// filename and nothing else, and that filename stayed frozen at "Daily.md" even
// after the folder it lives in was renamed. Deriving it means a renamed diary
// folder brings its dashboard along — which is also what makes renaming a
// subject or a topic from its banner work: see `isFolderNote` below.
export function folderNotePath(folderPath: string): string {
  const clean = folderPath.replace(/\/+$/, "");
  return `${clean}/${basename(clean)}.md`;
}

// Is this note the folder note of the folder it sits in?
//
// The inverse of `folderNotePath`, and it exists because renaming one is not
// renaming a file. A subject's note is `Subjects/Algebra/Algebra.md`, and every
// link to that subject is derived from the FOLDER name — the Journals card, the
// breadcrumbs, the topic tables. Renaming the note alone leaves the folder
// called Algebra with no note of its own inside it, so `folderNotePath` starts
// pointing at a file that does not exist and every one of those links breaks at
// once. The name is the folder's; the note only carries a copy.
//
// The vault root is excluded: a note called `MyVault.md` at the top level is
// not the root's folder note in any sense that would make renaming it rename
// the vault.
export function isFolderNote(file: {
  basename: string;
  parent: { name: string; path: string } | null;
}): boolean {
  const parent = file.parent;
  if (!parent) return false;
  if (parent.path === "" || parent.path === "/") return false;
  return parent.name === file.basename;
}

// The weekly overview: the folder note of the folder holding daily entries.
// `Weekly/Weekly.md` — the folder already says "the week", so a separate
// "Overview" in the filename would only restate its container.
// The four dashboards, each the folder note of the folder holding that period's
// entries. Derived rather than stored: a dashboard is not an independent
// location, it is a fact about its folder, and a second setting pointing at the
// same place is a second thing that can disagree.
//
// There is no dailyOverviewPath. A daily entry is the note — see the diary
// block in constants.ts.
export function weeklyOverviewPath(paths: { diaryWeekly: string }): string {
  return folderNotePath(paths.diaryWeekly);
}

export function monthlyOverviewPath(paths: { diaryMonthly: string }): string {
  return folderNotePath(paths.diaryMonthly);
}

export function quarterOverviewPath(paths: { diaryQuarterly: string }): string {
  return folderNotePath(paths.diaryQuarterly);
}

export function yearOverviewPath(paths: { diaryYearly: string }): string {
  return folderNotePath(paths.diaryYearly);
}

// Map a heat-map tracker value to one of the 1..5 shade buckets styles.css
// defines. Returns null for a non-value (null/NaN) so the caller can emit no
// class.
//
// When the tracker declares a bounded range (both min and max, min < max),
// the value is linearly normalised across that range onto the 5 buckets — so
// a 0..10 tracker shades correctly instead of saturating at 5, and any scale
// gets the full colour spread. Without a usable range (the default Mood
// tracker declares none), it falls back to rounding the raw value and
// clamping into [1,5], which is correct for a native 1..5 scale and degrades
// an out-of-scale value to the nearest defined shade.
export function moodBucket(
  mood: number | null,
  range?: { min?: number; max?: number }
): number | null {
  if (mood == null || !Number.isFinite(mood)) return null;
  const min = range?.min;
  const max = range?.max;
  if (min != null && max != null && max > min) {
    const frac = (mood - min) / (max - min); // 0..1 across the declared range
    const bucket = Math.round(frac * 4) + 1; // → 1..5
    return Math.min(5, Math.max(1, bucket));
  }
  return Math.min(5, Math.max(1, Math.round(mood)));
}

// ── Sleep coupling (Wake-Up + Bedtime built-ins) ─────────────────────────
// All pure so they can be unit-tested without Obsidian. The daily widget and
// the derived-value writer both go through these, so "how sleep is computed"
// lives in exactly one place.

// Parse a "HH:mm" (or "HH:mm:ss") clock string to minutes since midnight
// (0..1439). Returns null for anything that isn't a real time-of-day, so a
// blank/garbage frontmatter value degrades to "no data" rather than NaN.
export function parseClock(v: unknown): number | null {
  if (v == null) return null;
  const m = String(v).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59)
    return null;
  return h * 60 + min;
}

// Render minutes-since-midnight (0..1439, but tolerant of any integer) back to
// a "HH:mm" clock string — the inverse of parseClock. Used by the chart y-axis
// tick + tooltip formatters for `time` trackers, so a wake/bed value plotted as
// a magnitude still reads as a clock. Wraps into a single day so a stray
// out-of-range minute still formats sanely.
export function formatClock(minutes: number | null): string {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Minutes asleep from a bedtime (the evening before) to a wake time (the next
// morning), wrapping across midnight — so bed 23:00 → wake 07:00 is 480, not a
// negative span. Null unless both times parse.
export function sleepMinutes(bedtime: unknown, wakeup: unknown): number | null {
  const bed = parseClock(bedtime);
  const wake = parseClock(wakeup);
  if (bed == null || wake == null) return null;
  return (((wake - bed) % 1440) + 1440) % 1440;
}

// Hours asleep, rounded to 2 dp — the value written to the derived `Sleep`
// frontmatter property so it can be charted like any other number tracker.
export function sleepHours(bedtime: unknown, wakeup: unknown): number | null {
  const m = sleepMinutes(bedtime, wakeup);
  return m == null ? null : Math.round((m / 60) * 100) / 100;
}

// Hours awake — the complement of the asleep window across a 24h day.
export function awakeHours(bedtime: unknown, wakeup: unknown): number | null {
  const m = sleepMinutes(bedtime, wakeup);
  return m == null ? null : Math.round(((1440 - m) / 60) * 100) / 100;
}

// "7h 30m" / "8h" from a decimal-hours value. Em dash for a non-value, so a
// widget readout reads cleanly before both times are filled in.
export function formatDuration(hours: number | null): string {
  if (hours == null || !Number.isFinite(hours)) return "—";
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Mean of a list of clock-minute values, rendered back as "HH:mm" — used by the
// sleep summary for a "typical wake time". Simple linear mean is fine for
// morning wake times (they cluster and don't wrap midnight); bedtimes, which
// can wrap, are derived from wake − sleep instead of averaged directly.
export function meanClock(minutes: number[]): string | null {
  if (!minutes.length) return null;
  const avg = Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length);
  const wrapped = ((avg % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// MOVED TO `directive-grammar.ts` IN 4.30, unchanged, and re-exported here so
// every existing caller is untouched — the shape `section-model.ts` used when
// it took the section ops out of `journal-plan.ts`.
//
// It was always directive grammar; it lived here for the accident of having
// been needed by a caller that already imported this file. The move is what
// lets `plain-markdown.ts` read a `header:` title without importing a module
// that imports Obsidian, and there is exactly one spelling of the grammar
// either way.
import { parseHeaderDirective } from "./directive-grammar";
export { parseHeaderDirective };

// If `lines[i]` opens an ```almanac fence whose first directive is a `header:`,
// return that header's parsed {level, title}; otherwise null. Used to recognise
// the header-bar form of a section title on the dashboards.
//
// Deliberately narrow: only the plain ```almanac fence counts. The Trends
// section's ```almanac-charts fence also carries a `header:` title, but in the
// merged layout that one fence *is* the whole section, and charts.ts relies on
// locateSection NOT anchoring on it so parseChartRegion falls through to
// findChartsFence and reads the fence's own body. Recognising section *titles*
// and recognising section *boundaries* are different questions; the boundary
// scan handles the wider set itself (see sectionBoundaryAt).
export function headerAtFence(
  lines: string[],
  i: number
): { level: number; title: string } | null {
  if (lines[i]?.trim() !== FENCE_OPEN) return null;
  const next = (lines[i + 1] ?? "").trim();
  if (!next.startsWith(HEADER_PREFIX)) return null;
  return parseHeaderDirective(next.slice(HEADER_PREFIX.length));
}

// Every fence info-string that can open a titled dashboard section: the general
// widget block, plus the Trends section's own chart processor.
const SECTION_FENCES = [FENCE_OPEN, "```almanac-charts"];

// The title of a section *starting* at `lines[i]`, for boundary detection —
// the same parse as headerAtFence but across every section fence, not just
// ```almanac.
//
// This exists because the two questions genuinely differ. headerAtFence asks
// "is this the anchor of the section I'm looking for?", and must not match the
// merged Trends fence. A boundary scan asks "does a *different* section start
// here?", and must match it — otherwise a scan running down from the Journals
// title sails straight past Trends and swallows it, which is exactly what
// happened: on the shipped homepage Journals is immediately followed by
// Trends, so rebuilding Journals deleted the user's entire chart section. It
// stayed hidden while the Journals title block was preserved verbatim and its
// body usually regenerated to the same text; 2.13.8 rewrites that block, so
// the rebuild now actually runs.
function sectionBoundaryAt(
  lines: string[],
  i: number
): { level: number; title: string } | null {
  if (!SECTION_FENCES.includes(lines[i]?.trim())) return null;
  const next = (lines[i + 1] ?? "").trim();
  if (!next.startsWith(HEADER_PREFIX)) return null;
  return parseHeaderDirective(next.slice(HEADER_PREFIX.length));
}

// A located dashboard section.
//   titleStart / titleEnd — the line span of the section's title. For a
//     header-bar title that's the ```almanac fence (open..close); for a legacy
//     markdown heading both point at the single heading line.
//   end — the first line NOT in the section (its body is titleEnd+1 .. end-1).
//   viaHeaderBar — true if found via the header-bar fence, false if via the
//     legacy markdown heading. Lets callers upgrade an old heading in place.
export interface LocatedSection {
  titleStart: number;
  titleEnd: number;
  end: number;
  viaHeaderBar: boolean;
}

// Locate a titled dashboard section (e.g. "📚 Journals", "📊 Trends and
// statistics") in a note's lines, tolerating both the header-bar form
// (```almanac / header:[level:]<title> / ```) and the legacy `<heading>`
// markdown form. This is the single shared implementation behind the Journals
// rebuild (journal.ts) and the chart region rewrite (charts.ts) — before it,
// each had its own near-identical copy that could (and did) drift out of sync
// when the header syntax changed.
//
// The section ends at the next markdown heading of level 1–2, or the next
// header-bar fence that `isBoundaryTitle` accepts as a sibling boundary. By
// default any other header bar ends the section; the Journals container passes
// a predicate that treats its own per-type bars (Study, custom types) as
// *inside* the section rather than boundaries.
//
// ── A TITLE MAY BE SPELLED MORE THAN ONE WAY, AS OF 4.26 ──────────────
//
// `title` and `heading` each take a LIST as well as a string, and the list is
// "every spelling this section has ever shipped under, canonical first".
//
// This function is the only reason a display string could not be renamed. The
// match was `hdr.title !== title` — exact — so a section whose name changed
// stopped being findable in every note written before the change, and the
// caller could not tell that from "the section is not there": both are null.
// 4.25 tried to put `TRENDS_HEADING` into sentence case with the rest of the
// plugin's titles, found this, and reverted rather than ship a rename that
// silently unhooked the pre-2.1 Trends migrations from the notes that still
// need them.
//
// A LIST RATHER THAN A NORMALISER. Case-insensitive comparison would have been
// fewer lines and would quietly accept spellings this project never shipped —
// including a reader's own retitling, which is theirs to keep and must not be
// treated as a version of ours to rewrite. An explicit history says exactly
// which strings are Almanac's old words, so a migration can rewrite those and
// nothing else.
export function locateSection(
  lines: string[],
  title: string | readonly string[],
  heading: string | readonly string[],
  isBoundaryTitle: (t: string) => boolean = () => true
): LocatedSection | null {
  const titles = typeof title === "string" ? [title] : title;
  const headings = typeof heading === "string" ? [heading] : heading;
  let titleStart = -1;
  let titleEnd = -1;
  let viaHeaderBar = false;

  // Prefer the header-bar fence form.
  for (let i = 0; i < lines.length; i++) {
    const hdr = headerAtFence(lines, i);
    if (!hdr || !titles.includes(hdr.title)) continue;
    for (let j = i + 2; j < lines.length; j++) {
      if (lines[j].trim() === FENCE_CLOSE) {
        titleStart = i;
        titleEnd = j;
        viaHeaderBar = true;
        break;
      }
    }
    if (titleStart !== -1) break;
  }

  // Fall back to the legacy markdown heading.
  if (titleStart === -1) {
    const h = lines.findIndex((l) => headings.includes(l.trim()));
    if (h === -1) return null;
    titleStart = h;
    titleEnd = h;
  }

  // Walk to the section boundary.
  let end = lines.length;
  for (let i = titleEnd + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^#{1,2}\s/.test(t)) {
      end = i;
      break;
    }
    // sectionBoundaryAt, not headerAtFence: a *different* section starting here
    // ends this one whichever fence it uses, including the Trends section's
    // ```almanac-charts.
    const hdr = sectionBoundaryAt(lines, i);
    if (hdr && hdr.title && isBoundaryTitle(hdr.title)) {
      end = i;
      break;
    }
  }
  return { titleStart, titleEnd, end, viaHeaderBar };
}

// ── slugify ───────────────────────────────────────────────────────────────
//
// "Meeting Notes" → "meeting-notes". The one derivation from a display string
// to a stable id, and it lives here rather than in custom-journal.ts because
// journal.ts needs it too — and journal.ts importing a *value* from
// custom-journal.ts is the edge that made STUDY_JOURNAL's initialiser depend
// on module evaluation order (see journal.ts::buildJournalType).
//
// The result is safe as a filename, a frontmatter key and a path segment,
// which is what 2.43 relies on: an id is derived from a label exactly once,
// when the thing is created, and everything generated afterwards binds to the
// id rather than re-deriving from a label that may since have changed.
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Display-string helpers ────────────────────────────────────────────────

// A crude plural for a header bar, a count label or a column heading.
//
// Deliberately crude: a real pluraliser is a dependency taken on to get
// "Practice" wrong in a new way, and every place this is used is a label the
// reader can overrule. Crude is not the same as wrong, though — it handles the
// endings that actually occur in a noun someone would name a folder level
// after, which a bare `+ "s"` does not: "Dish" and "Entry" are the wizard's
// own worked examples and both break under one.
//
// Here rather than in journal-sections.ts, where it lived until 2.44, for the
// reason slugify moved in 2.43: it knows nothing about the catalogue, and a UI
// module reaching into the catalogue to pluralise a word is how a second copy
// of this gets written instead.
//
// ── AND A SHORT IRREGULAR LIST (4.39.1) ──────────────────────────────────
//
// "Mediums appear here automatically" — the Media preset's level noun is
// "Medium", no ending rule matches it, and the fallback `+ "s"` is not crude, it
// is wrong. Crude was always the deal; wrong was not.
//
// A SHORT LIST AND NOT A DICTIONARY, which is `singularGuess`' own defence
// fifteen lines below, made for exactly this shape of problem: those words are
// there because the rules "mangle them outright", and these are here because the
// rules produce a word that is not English. Everything not on either list still
// degrades to a plausible wrong answer a reader can overrule, which is the
// accepted cost this function was written around.
//
// THE ENTRY CONDITION, so the list does not grow into the dependency the comment
// above refuses: a word earns a line here when it is a NOUN SOMEONE WOULD NAME A
// FOLDER LEVEL AFTER and the rules get it wrong. Not every English irregular —
// "Child" and "Person" are not level nouns and are deliberately absent.
//
// CASE IS THE CALLER'S. Level nouns are title-case ("Medium") and the callers
// lowercase for prose, so the replacement carries the input's leading case rather
// than a stored capital that would come out wrong in half the call sites.
const IRREGULAR_PLURALS: Record<string, string> = {
  medium: "media",
  index: "indices",
  appendix: "appendices",
  criterion: "criteria",
};

export function plural(noun: string): string {
  const irregular = IRREGULAR_PLURALS[noun.trim().toLowerCase()];
  if (irregular) {
    // "Medium" → "Media", "medium" → "media". Only the first letter, because a
    // level noun is one word and title case is the only case that varies.
    return /^[A-Z]/.test(noun.trim())
      ? irregular.charAt(0).toUpperCase() + irregular.slice(1)
      : irregular;
  }
  if (/(s|x|z|ch|sh)$/i.test(noun)) return `${noun}es`;
  if (/[^aeiou]y$/i.test(noun)) return `${noun.slice(0, -1)}ies`;
  return `${noun}s`;
}

// A GUESS at the singular, for pre-filling a field a reader will confirm.
//
// NOT THE INVERSE OF `plural`, AND IT CANNOT BE. The pluraliser is already
// approximate enough that `JournalKindConfig` carries a `plural` override for
// the words it gets wrong — "Practice" pluralises to "Practices" when it should
// stay "Practice". Running it backwards is strictly harder: "Practices" could
// come from "Practice" or "Practic", "Series" is its own plural, and no rule
// short of a dictionary separates them.
//
// So this is only ever used to PRE-FILL AN EDITABLE FIELD. Nothing derives a
// stored value from it, nothing writes it without a reader having looked at it,
// and the one caller — the note-type rename offer — puts it in a text box next
// to the word it was guessed from. A wrong guess costs one correction; a wrong
// silent derivation would cost a journal-wide rename to something nobody typed.
export function singularGuess(word: string): string {
  const w = word.trim();
  // Words that are their own plural. A SHORT LIST AND NOT A DICTIONARY: these
  // are here because the `ies` rule below mangles them outright — "Series"
  // would come back "Sery", which is not a wrong guess so much as a nonsense
  // one, and a nonsense word in a text box reads as a bug rather than a
  // suggestion. Anything not on it degrades to a plausible wrong answer the
  // reader can correct, which is the accepted cost.
  if (/^(series|species|means|news)$/i.test(w)) return w;
  if (/[^aeiou]ies$/i.test(w)) return `${w.slice(0, -3)}y`;
  if (/(ss|us|is)$/i.test(w)) return w;
  if (/(ches|shes|xes|zes)$/i.test(w)) return w.slice(0, -2);
  if (/[^s]s$/i.test(w)) return w.slice(0, -1);
  return w;
}

// The `type` frontmatter value of a note, normalised for comparison, or null.
//
// One spelling of "what does this note say it is", because there were three:
// journal.ts::typeRecognised and trackers.ts::classifyNote both trimmed and
// lowercased, and entry-trackers.ts::noteKindOf passed the raw string through.
// So on a note reading `type: Lesson` the journal type resolved while the kind
// did not — kindAllowsTracker found no matching kind, fell through to its
// permissive branch, and the per-kind filter on "+ Add tracker" silently
// switched off. Failing open is the right direction for that gate and the
// wrong reason to be doing it.
export function normaliseTypeValue(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  return value === "" ? null : value;
}
