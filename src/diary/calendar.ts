// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The three calendar-family widgets. All three used to be separate,
// near-identical `dataviewjs` blocks (~140 lines in home.md, ~100 in
// monthly-review.md) that duplicated the plugin's own create-or-open logic
// with hard-coded folder paths — so renaming a folder in Settings silently
// broke them. They now delegate to Diary.openOrCreateDay/openOrCreateMonth,
// so path settings and template lookups stay in one place.
//
// Call sites (inside an ```almanac block):
//   calendar        full month calendar with prev/next + jump-to-date  (homepage)
//   month-summary   stats line + day grid + year grid, all driven by
//                   `month-start`                                       (monthly review)

import { App, MarkdownPostProcessorContext, setIcon, TFile } from "obsidian";
import type AlmanacPlugin from "../main";
import { countAlmanacTasks, sumAlmanacTasks } from "../ui/tables";
import {
  describeDay,
  describeEventDate,
  describeRelative,
  eventColor,
  eventIcon,
  expandEvents,
  EventOccurrence,
  upcomingEvents,
  UpcomingEvent,
} from "../events/events";
import { getEventsFile, readEvents } from "../events/eventstore";
import { buildDiaryActions } from "./diary-header";
import { buildPeriodNav, periodSpan } from "./periodnav";
import { bannerSuppressed } from "../ui/vault-banner";
import { statStrip } from "../ui/stat-strip";
import { lineOf, readRollup } from "../trackers/fields";
import { allNoteRegions } from "../core/notestore";
import {
  daysSinceWeekStart,
  filesUnder,
  frontmatterOf,
  getFile,
  isoDate,
  moment,
  MomentLike,
  moodBucket,
  noExt,
  openFile,
  periodCoverage,
  quarterMonths,
  thisMonth,
  today,
  weekStartDay,
  folderNotePath,
  weeklyOverviewPath,
  monthlyOverviewPath,
  quarterOverviewPath,
  yearOverviewPath,
} from "../core/util";

interface DayEntry {
  iso: string;
  mood: number | null;
}

// iso date -> { mood } for every real diary entry (dashboard note excluded).
function buildDayMap(
  app: App,
  diaryDaily: string,
  moodKey: string
): Map<string, DayEntry> {
  const map = new Map<string, DayEntry>();
  const dashboard = folderNotePath(diaryDaily);
  for (const f of filesUnder(app, diaryDaily)) {
    if (f.path === dashboard) continue;
    const fm = frontmatterOf(app, f);
    const iso = isoDate(fm["journal-date"]);
    if (!iso) continue;
    // Coerce the configured heat-map tracker to a number; a non-numeric or
    // empty value (e.g. a select tracker chosen as the source, or a typo)
    // yields null rather than a NaN that would poison the monthly average.
    const raw = fm[moodKey];
    const num = raw != null && raw !== "" ? Number(raw) : NaN;
    const mood = Number.isFinite(num) ? num : null;
    map.set(iso, { iso, mood });
  }
  return map;
}

// "YYYY-MM" -> monthly review file, only for entries with a `month` property
// set (matches the original calendar's dot-indicator logic exactly).
function buildMonthMap(app: App, diaryMonthly: string): Map<string, TFile> {
  const map = new Map<string, TFile>();
  const dashboard = folderNotePath(diaryMonthly);
  for (const f of filesUnder(app, diaryMonthly)) {
    if (f.path === dashboard) continue;
    const month = frontmatterOf(app, f)["month"];
    if (!month) continue;
    map.set(String(month).slice(0, 7), f);
  }
  return map;
}

// ── "does this period have an entry?" ─────────────────────────────────
// 3.17 §2. The month rail has underlined a month with an entry since 3.9, and
// it was the only scope that said so. The other three — week, quarter, year —
// are reachable from this same card (the `Wk` gutter, the `Q` labels, the year
// title), and every one of them led somewhere without ever saying whether
// anything was there. So the mark generalises: one fact, one channel, four
// scopes.
//
// WHAT IT MARKS IS THE ENTRY, NOT THE DASHBOARD, and after §1 that is no longer
// the same thing as what the click opens. A dashboard exists whether or not you
// have written anything — it is one note that re-scopes — so "does the Weekly
// Overview exist" is a question about your vault's setup, not about your week,
// and marking it would light every week in every year identically. The entry is
// the thing that is either written or not.
//
// Keyed rather than dated. A period entry stores its own start (`week-start`,
// `quarter-start`, `year-start`), and comparing those dates directly to the
// grid's would be wrong for the week: entries snap to `isoWeek` (Monday) while
// the grid's rows begin on the LOCALE's first day, so on a Sunday-start vault
// every week would miss by one. An ISO week key is stable under both.
type PeriodKeys = Set<string>;

function buildPeriodEntryKeys(
  app: App,
  folder: string,
  prop: string,
  keyOf: (m: MomentLike) => string
): PeriodKeys {
  const keys = new Set<string>();
  // The folder note is that period's dashboard, and it carries the very same
  // property — as a CURSOR, pointing at whatever period you last looked at.
  // Counting it would mean the current week always claims an entry, and the
  // claim would move as you browsed.
  const dashboard = folderNotePath(folder);
  for (const f of filesUnder(app, folder)) {
    if (f.path === dashboard) continue;
    const iso = isoDate(frontmatterOf(app, f)[prop]);
    if (!iso) continue;
    const m = moment(iso);
    if (m.isValid()) keys.add(keyOf(m));
  }
  return keys;
}

// ISO week-year + week ("2026-W32"), so a week spanning New Year keys to one
// year rather than two. `GGGG` is the ISO week-year, not the calendar year:
// 2026-01-01 belongs to 2026-W01, but 2027-01-01 belongs to 2026-W53.
export function isoWeekKey(m: MomentLike): string {
  return m.format("GGGG-[W]WW");
}

export function quarterKeyOf(m: MomentLike): string {
  return `${m.format("YYYY")}-Q${Math.floor(m.month() / 3) + 1}`;
}

export function yearKeyOf(m: MomentLike): string {
  return m.format("YYYY");
}

// The row's ISO week, taken from its Thursday — the same derivation the week
// number printed in the gutter uses, so the mark and the number can never
// disagree about which week the row is.
function rowWeekKey(weekStart: MomentLike): string {
  return isoWeekKey(weekStart.clone().add(3, "days"));
}

// The second line of a navigator control's tooltip: the underline, in words.
// The mark is a one-pixel rule under a three-letter month, which is enough to
// notice and not enough to explain itself, and `title` is the only channel a
// keyboard or screen-reader user ever gets.
function entryTip(unit: string, has: boolean): string {
  return has ? `\nThis ${unit} has an entry.` : "";
}

type MoodRange = { min?: number; max?: number } | undefined;

// Resolve the min/max of the configured heat-map tracker, if it declares one,
// so moodBucket can normalise across the tracker's own scale.
function moodRange(plugin: AlmanacPlugin): MoodRange {
  const def = plugin.settings.trackers.find(
    (t) => t.id === plugin.settings.moodTrackerId
  );
  return def ? { min: def.min, max: def.max } : undefined;
}

function moodClass(mood: number | null, range: MoodRange): string {
  const bucket = moodBucket(mood, range);
  return bucket == null ? "" : ` cal-mood-${bucket}`;
}

// How many of a day's events get drawn before the cell gives up and defers to
// the tooltip. A calendar cell is roughly 40px square and already carries a day
// number, a mood dot and possibly a today ring; past these limits the
// decoration stops informing and starts obscuring.
const MAX_BARS = 2;
const MAX_BADGES = 1;

interface DayGridOptions {
  monthStart: MomentLike;
  dayMap: Map<string, DayEntry>;
  // iso -> occurrences, pre-expanded across the whole visible grid (including
  // the padding days from the neighbouring months).
  events: Map<string, EventOccurrence[]>;
  range: MoodRange;
  onOpen: (iso: string) => void;
  // Right-click on a day. Optional: only the full calendar offers the
  // add/edit-event menu, the embedded month grid is read-only.
  onContext?: (iso: string, evt: MouseEvent) => void;
  // Click on a week's leading gutter cell (2.21). Optional: when set, each row
  // gains a clickable week-number cell that opens that week's Weekly Overview,
  // and the grid lays out as eight columns instead of seven. The embedded
  // month-summary grid leaves it off, so its layout is unchanged.
  onOpenWeek?: (weekStartIso: string) => void;
  // ISO week keys ("2026-W32") that have a weekly entry, for the underline on
  // the gutter chip. Only meaningful alongside `onOpenWeek` — a grid with no
  // week column has nothing to mark.
  weekEntries?: PeriodKeys;
}

// Draw one day's events into an already-created cell.
//
// Two visual treatments, because the two kinds of event mean different things.
// A multi-day span (a trip, a week off sick) is a *state* the day is in, so it
// gets a tinted cell and a bar along the top edge that runs continuously into
// the neighbouring days — the shape of the thing is the point. A single-day
// event is a *marker*, so it gets its icon in the top-right corner.
//
// That corner is shared, not free. It was bottom-right until 2.51, chosen by
// elimination — day number in the centre, mood dot at bottom-centre, today ring
// around the edge, span bars along the top — which left bottom-right as the
// only real estate colliding with nothing. Bottom-right is also where a marker
// is hardest to see, so 2.51 trades the collision back: the badge moves up and
// is drawn over the bars, with a disc of page background behind it (see
// .cal-badge). Nothing about the bars changes, which is the point — the
// alternative was making their vertical position depend on whether the day
// also carried a solo event, and a trip whose bar steps down for one day in
// the middle is worse than any overlap.
function decorateCell(
  cell: HTMLElement,
  occurrences: EventOccurrence[],
  col: number
): void {
  if (occurrences.length === 0) return;

  // expandEvents sorts spans before solo events, so slicing takes the bars
  // first and the badges after, without re-filtering.
  const spans = occurrences.filter((o) => o.pos !== "solo");
  const solos = occurrences.filter((o) => o.pos === "solo");

  cell.addClass("cal-cell-has-event");

  const drawnSpans = spans.slice(0, MAX_BARS);
  if (drawnSpans.length) {
    // Tint from the first span only. Layering two translucent washes produces a
    // muddy third colour that belongs to neither event, so overlapping trips
    // are told apart by their bars, not their backgrounds.
    cell.addClass(`cal-tint-${eventColor(drawnSpans[0].def)}`);
    const bars = cell.createDiv({ cls: "cal-bars" });
    for (const occ of drawnSpans) {
      const classes = [
        "cal-bar",
        `cal-bar-${eventColor(occ.def)}`,
        `cal-bar-${occ.pos}`,
      ];
      // A bar bleeds into the grid gap to meet its neighbour, which is wrong at
      // a row boundary: Friday's bar would run off the right edge and Monday's
      // would start in mid-air. Clip at the ends of the week and cap the bar
      // there instead, so a span that crosses a weekend reads as continuing
      // rather than as broken.
      if (col === 0) classes.push("cal-bar-clip-left");
      if (col === 6) classes.push("cal-bar-clip-right");
      bars.createDiv({ cls: classes.join(" ") });
    }
  }

  for (const occ of solos.slice(0, MAX_BADGES)) {
    const badge = cell.createSpan({
      cls: `cal-badge cal-badge-${eventColor(occ.def)}`,
    });
    setIcon(badge, eventIcon(occ.def));
  }

  const hidden =
    spans.length - drawnSpans.length + Math.max(0, solos.length - MAX_BADGES);
  if (hidden > 0) {
    cell.createSpan({ cls: "cal-more", text: `+${hidden}` });
  }
}

// Build the weekday-grid cells for one month into `gridEl`. Shared by the
// full calendar and the embedded month-summary grid.
function renderDayGrid(gridEl: HTMLElement, opts: DayGridOptions): void {
  const { monthStart, dayMap, events, range, onOpen, onContext, onOpenWeek } =
    opts;
  const weekEntries = opts.weekEntries;
  gridEl.empty();
  // Eight columns (week gutter + seven days) only when weeks are navigable;
  // otherwise the embedded grids keep their seven-column layout untouched.
  gridEl.toggleClass("jc-grid-weeks", !!onOpenWeek);
  // Align the grid to the locale's week-start (shared with the chart heatmap)
  // instead of a hard-coded Monday: back up from the 1st to the week-start, and
  // extend past month-end to complete the final week.
  const ws = weekStartDay();
  const monthEnd = monthStart.clone().endOf("month");
  const gridStart = monthStart
    .clone()
    .subtract(daysSinceWeekStart(monthStart.day(), ws), "days");
  const lastWeekday = (ws + 6) % 7;
  const endPad = daysSinceWeekStart(lastWeekday, monthEnd.day());
  const gridEnd = monthEnd.clone().add(endPad, "days");
  const daysInGrid = gridEnd.diff(gridStart, "days") + 1;
  const todayIso = today();

  for (let i = 0; i < daysInGrid; i++) {
    const d = gridStart.clone().add(i, "days");
    const iso = d.format("YYYY-MM-DD");

    // Start of a week row: drop in the leading gutter cell. `d` here is a
    // week-start day (the grid begins on one and steps seven at a time), so it
    // doubles as the week's start date. The number shown is the ISO week the
    // row belongs to, derived from its Thursday so it's stable regardless of
    // which weekday the locale starts on.
    if (onOpenWeek && i % 7 === 0) {
      const weekStartIso = iso;
      const wk = d.clone().add(3, "days").isoWeek();
      // A real <button>, not a div with a listener (2.51). It is drawn as a
      // chip precisely so it reads as pressable, and something that advertises
      // itself as a control has to be reachable by the keyboard that follows
      // that advertisement.
      const hasEntry = weekEntries?.has(rowWeekKey(d)) ?? false;
      const weekCell = gridEl.createEl("button", {
        cls: "cal-week" + (hasEntry ? " has-review" : ""),
        attr: {
          type: "button",
          title: `Open week ${wk} — Weekly Overview${entryTip("week", hasEntry)}`,
          "aria-label": `Open week ${wk}`,
        },
      });
      // The week today falls in is tinted, for the reason .jc-mcell.is-now
      // exists in the rail above: once you have navigated away from the current
      // period, the way back has to stay findable. The day cell's ring answers
      // that for the day; nothing answered it for the row.
      if (todayIso >= weekStartIso && todayIso < d.clone().add(7, "days").format("YYYY-MM-DD")) {
        weekCell.addClass("is-now");
      }
      weekCell.createSpan({ cls: "cal-weeknum", text: String(wk) });
      weekCell.addEventListener("click", () => onOpenWeek(weekStartIso));
    }

    const inMonth = d.month() === monthStart.month();
    const entry = dayMap.get(iso);
    const occurrences = events.get(iso) ?? [];

    const classes = ["cal-cell"];
    if (!inMonth) classes.push("cal-cell-outside");
    if (iso === todayIso) classes.push("cal-cell-today");
    // Note what this class does *not* key off: an event never sets it. A day
    // decorated with a birthday but never written up is still a day with no
    // entry, and has to keep looking like one — otherwise the calendar starts
    // claiming you journalled on days you didn't.
    if (entry) classes.push("cal-cell-has-entry");

    // Tooltip: the click action first (it's what the cell does), then the
    // day's events underneath.
    const action = entry ? "Open entry" : "Create entry";
    const tip = occurrences.length
      ? `${action}\n\n${describeDay(occurrences)}`
      : action;

    const cell = gridEl.createDiv({
      cls: classes.join(" ") + moodClass(entry?.mood ?? null, range),
      attr: { title: tip },
    });
    decorateCell(cell, occurrences, i % 7);
    cell.createSpan({ cls: "cal-daynum", text: String(d.date()) });
    if (entry) cell.createSpan({ cls: "cal-dot" });
    cell.addEventListener("click", () => onOpen(iso));
    if (onContext) {
      cell.addEventListener("contextmenu", (evt) => {
        evt.preventDefault();
        onContext(iso, evt);
      });
    }
  }
}

// The event occurrences covering the whole grid a given month will draw —
// including the padding days from the months either side, so a trip that starts
// on the 30th of the previous month still shows its bar running in.
function gridEvents(
  plugin: AlmanacPlugin,
  monthStart: MomentLike
): Map<string, EventOccurrence[]> {
  if (!plugin.settings.eventsEnabled) return new Map();
  const from = monthStart.clone().subtract(7, "days").format("YYYY-MM-DD");
  const to = monthStart
    .clone()
    .endOf("month")
    .add(7, "days")
    .format("YYYY-MM-DD");
  return expandEvents(readEvents(plugin.app, plugin), from, to);
}

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function renderWeekdayHeader(parent: HTMLElement, weeks = false): void {
  const row = parent.createDiv({ cls: "jc-weekdays" });
  // Leading header for the week gutter, so the "Wk" label sits above the
  // week-number column and the seven weekday labels stay aligned with the day
  // cells below them.
  if (weeks) {
    row.addClass("jc-weekdays-weeks");
    row.createSpan({ cls: "jc-weeknum-head", text: "Wk" });
  }
  const ws = weekStartDay();
  for (let k = 0; k < 7; k++) {
    row.createSpan({ text: WEEKDAY_LABELS[(ws + k) % 7] });
  }
}

// ── calendar ──────────────────────────────────────────────────────────

// The month the calendar is looking at, held by the caller rather than by the
// widget. The calendar re-renders whenever the events note or a diary entry
// changes (see widgets.ts), and without somewhere outside the build to keep
// this, every one of those rebuilds would snap the view back to the current
// month — so adding an event while browsing next March would throw you home.
export interface CalendarState {
  monthKey?: string;
}

export interface CalendarOptions {
  state?: CalendarState;
  // Right-click on a day cell. Supplied by the widget layer so calendar.ts
  // doesn't need to know about modals or the events store.
  onContext?: (iso: string, evt: MouseEvent) => void;
  // Draw the upcoming-events agenda inside the calendar card. `0` (the
  // default) leaves it off, so `calendar` on its own is unchanged.
  agenda?: number;
  // Render the homepage diary header — greeting, numbers, destination
  // pills — as the top band of the card (2.13.7). Off by default, so an
  // embedded grid on a review page is unchanged.
  header?: boolean;
  // Needed only when `header` is set: the pills resolve their destinations
  // relative to the note they're rendered in.
  ctx?: MarkdownPostProcessorContext;
}

// ── agenda panel ──────────────────────────────────────────────────────
// The upcoming-events list, rendered as a recessed second zone inside the
// calendar card rather than as its own top-level section. It's the same data
// `events:upcoming` shows, but with a date gutter whose day numbers line up
// visually with the grid above it — the point of folding the two together is
// that "25" in the list and "25" in the month are obviously the same day.
//
// Kept here rather than in event-widgets.ts because it's part of the calendar's
// own layout: it shares the card's border, its refresh cycle, and its sense of
// which month you're looking at. event-widgets.ts keeps the standalone list for
// anyone who still wants `events:upcoming` on a page of its own.

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// The date an upcoming item should be filed under in the gutter. For an
// in-progress span that's *today* rather than the start date — the row reads
// "day 3 of 8", so showing the day it began would contradict the gutter.
function agendaGutterIso(item: UpcomingEvent): string {
  return item.ongoing ? today() : item.iso;
}

// "Soon" is the accent threshold: within a week, or already running. Anything
// further out stays quiet so the near thing is the one that catches the eye.
function isSoon(item: UpcomingEvent): boolean {
  return item.ongoing || item.daysAway <= 7;
}

function renderAgenda(
  parent: HTMLElement,
  plugin: AlmanacPlugin,
  count: number,
  onOpenDay: (iso: string) => void
): void {
  const panel = parent.createDiv({ cls: "jc-agenda" });

  const head = panel.createDiv({ cls: "jc-agenda-head" });
  head.createSpan({ cls: "jc-agenda-label", text: "Coming up" });
  const manage = head.createEl("a", {
    cls: "jc-agenda-manage",
    text: "Manage",
    attr: { href: "#", title: "Open the events note" },
  });
  manage.addEventListener("click", (e) => {
    e.preventDefault();
    const file = getEventsFile(plugin.app, plugin);
    if (file) void openFile(plugin.app, file);
  });

  if (!plugin.settings.eventsEnabled) {
    panel.createDiv({
      cls: "jc-agenda-empty",
      text: "Special events are turned off in Settings → Special events.",
    });
    return;
  }

  const items = upcomingEvents(readEvents(plugin.app, plugin), today(), count);
  if (!items.length) {
    panel.createDiv({
      cls: "jc-agenda-empty",
      text: "No events yet — add a birthday and it'll show on every calendar.",
    });
    return;
  }

  for (const item of items) {
    const row = panel.createDiv({ cls: "jc-agenda-row" });
    if (isSoon(item)) row.addClass("is-soon");
    if (item.ongoing) row.addClass("is-ongoing");

    // Date gutter: big day number over a month abbreviation, matching the
    // weight and tabular figures of a calendar cell.
    const iso = agendaGutterIso(item);
    const gutter = row.createDiv({ cls: "jc-agenda-date" });
    gutter.createDiv({ cls: "jc-agenda-day", text: String(Number(iso.slice(8, 10))) });
    gutter.createDiv({
      cls: "jc-agenda-month",
      text: MONTH_ABBR[Number(iso.slice(5, 7)) - 1],
    });

    const chip = row.createSpan({
      cls: `am-ev-chip am-ev-chip-${eventColor(item.def)}`,
    });
    setIcon(chip, eventIcon(item.def));

    const text = row.createDiv({ cls: "am-ev-text" });
    text.createDiv({ cls: "am-ev-title", text: item.def.title });
    const meta = describeEventDate(item.def);
    text.createDiv({
      cls: "am-ev-meta",
      text: item.def.note ? `${meta} · ${item.def.note}` : meta,
    });

    row.createSpan({ cls: "jc-agenda-when", text: describeRelative(item) });

    // The whole row opens that day's entry — the list is a way into the diary,
    // not just a readout. Editing an event is still the calendar's context
    // menu or the manager, so a stray click here never mutates anything.
    row.addEventListener("click", () => onOpenDay(iso));
  }
}

export function buildCalendar(
  plugin: AlmanacPlugin,
  opts: CalendarOptions = {}
): HTMLElement {
  const app = plugin.app;
  const paths = plugin.settings.paths;
  const dayMap = buildDayMap(app, paths.diaryDaily, plugin.settings.moodTrackerId);
  const monthMap = buildMonthMap(app, paths.diaryMonthly);
  // The other three grains' entries, for the underline (3.17 §2). Read once per
  // build rather than per render: a render is a navigation (the year stepper,
  // a month cell, Today) and the vault has not changed underneath it. The card
  // is a live widget, so an entry created elsewhere arrives with the next
  // rebuild — the same cycle `monthMap` has always been on.
  //
  // Not folded into `monthMap`: that map holds FILES because the month grid on
  // the Monthly Overview needs them, and it keys off `month`, the property a
  // monthly entry actually carries. These three key off the period-start
  // property their grain uses, and nothing needs the file.
  const weekEntries = buildPeriodEntryKeys(
    app,
    paths.diaryWeekly,
    "week-start",
    isoWeekKey
  );
  const quarterEntries = buildPeriodEntryKeys(
    app,
    paths.diaryQuarterly,
    "quarter-start",
    quarterKeyOf
  );
  const yearEntries = buildPeriodEntryKeys(
    app,
    paths.diaryYearly,
    "year-start",
    yearKeyOf
  );

  const root = createDiv({ cls: "journal-calendar jc-has-weeks" });

  // The diary actions, when this calendar is a Diary SECTION rather than a bare
  // grid: what you can do to today, on a strip above the month navigator.
  //
  // A STRIP, NOT A HERO, AS OF 4.13.1 §3. This was an accent-washed band with a
  // greeting, a status line and four numbers in it; diary-header.ts's own header
  // is the account of why it is gone. What matters here is that nothing else in
  // the branch changed: the card still opens with the thing that acts on today,
  // it is still inside the card rather than stacked above it (2.13.7's move,
  // which this keeps), and it is still gated on `opts.header`.
  //
  // AND IT IS NOT PARENTED INTO THE SECTION'S OWN ACTIONS SLOT, which is where a
  // reader of 4.11 would expect a section's controls to go. It cannot be: this
  // whole card is a LiveWidget that rebuilds its subtree whenever anything under
  // the diary folder changes, so a control built here and appended to a bar
  // OUTSIDE the widget would be orphaned by the first rebuild and duplicated by
  // the next. That is the same reason `buildScopeCycle` is drawn by the block
  // processor and not by the table it belongs to. The strip reads as the
  // section's because it takes the same four values — a hairline, 4px of air,
  // right-aligned, at the bar's scale — not because it shares its element.
  if (opts.header && opts.ctx) {
    root.addClass("jc-has-header");
    // NO AREA TITLEBAR SINCE 4.8.1. A tinted strip saying DIARY sat above this
    // band, naming the root the card covers; the block's own head now says what
    // the block is, one line further up and in the page's own voice. Two bars
    // over one card, and the upper one repeated what the lower one already
    // shows in larger type. See `buildAreaTitlebar`'s removal.
    root.appendChild(buildDiaryActions(plugin, opts.ctx));
  }

  const header = root.createDiv({ cls: "jc-header" });

  // The header is the calendar's period navigator, in two rows (2.26).
  //
  // Top: the year, as the title. It was a three-year rail (2025 | 2026 | 2027)
  // over a `‹ July ›` month stepper; both are gone. The rail spent a full row
  // on two links you rarely take, and the stepper is redundant the moment
  // every month is one tap away in the rail below. Chevrons step the year;
  // the year itself opens The Year, as the centred rail segment used to.
  //
  // Below: the quarter rail — twelve months in four bounded groups, the one
  // holding the shown month lit.
  //
  // Until 2.51 the groups were divided by a single hairline and nothing else,
  // on the 2.18.2 argument that a row of bordered objects on a void reads as
  // floating pieces. That argument was about *detached* objects; this is one
  // rail whose segments happen to be separable, with exactly one of the four
  // lit at a time — a segmented control, not four pills — and the thing the
  // hairlines could never say is which quarter you are actually in. The Q
  // label went accent for that and it wasn't enough: an eight-pixel word at
  // the left edge of a group is not how you mark a region.
  //
  // The `Q` labels are the way into the Quarterly Overview, so the navigator
  // reaches every review scope the plugin has: week from the grid's `Wk`
  // gutter, month from the selected cell, quarter from its label, year from
  // the title. Four scopes, four doors, and not one of them a new file.
  // Three columns, and the year stepper is a group of its own (2.51.1).
  //
  // The stepper used to be three loose children of a centred flex row, with
  // Today absolutely positioned against the row's right edge. That works right
  // up until the row is narrower than the four buttons want to be — then the
  // centred group and the absolute one occupy the same pixels, and Today prints
  // over the year. Absolute positioning is what let them overlap: the year knew
  // nothing about Today's width, so nothing reserved room for it.
  //
  // As a `1fr auto 1fr` grid there is no overlap available. The stepper sits in
  // the middle column and is exactly centred on the card; Today sits in the
  // third and is flush right; the first column is the empty counterweight that
  // makes the centring true rather than approximate. Nothing is positioned out
  // of flow, so the row cannot collapse onto itself at any width.
  const navHead = header.createDiv({ cls: "jc-navhead" });
  const yearNav = navHead.createDiv({ cls: "jc-yearnav" });
  const yearPrevEl = yearNav.createEl("button", {
    cls: "jc-year-step jc-year-prev",
    attr: { type: "button", "aria-label": "Previous year" },
  });
  setIcon(yearPrevEl, "chevron-left");
  const yearCurEl = yearNav.createEl("button", {
    cls: "jc-year-cur",
    attr: { type: "button", title: "Open the year overview" },
  });
  // The year is the middle segment of the stepper pill and it is also a link to
  // The Year, which are two different things for one control to be. Until now
  // the only thing saying so was the tooltip and a hover colour — you had to
  // already suspect it to find out. The arrow says it at rest.
  //
  // A label span rather than the button's own text node, because the icon is a
  // sibling and `setText` on the button would delete it every render.
  const yearCurLabel = yearCurEl.createSpan({ cls: "jc-year-cur-label" });
  setIcon(yearCurEl.createSpan({ cls: "jc-year-cur-icon" }), "arrow-up-right");
  const yearNextEl = yearNav.createEl("button", {
    cls: "jc-year-step jc-year-next",
    attr: { type: "button", "aria-label": "Next year" },
  });
  setIcon(yearNextEl, "chevron-right");
  const todayBtn = navHead.createEl("button", {
    cls: "jc-today-btn",
    text: "Today",
    attr: { type: "button" },
  });

  // Month abbreviations are read off a fixed year so they follow the locale
  // without moment's day-clamping (setting month on the 31st would skid).
  const MONTH_ABBR = Array.from({ length: 12 }, (_, i) =>
    moment(`2001-${String(i + 1).padStart(2, "0")}-01`).format("MMM")
  );

  const qrail = header.createDiv({ cls: "jc-qrail" });
  const monthCells: HTMLElement[] = [];
  const quarterLabels: HTMLElement[] = [];
  // THE GROUPS ARE NOT COLLECTED ANY MORE (4.13.1 §3b). A `quarterGroups` array
  // existed so the repaint could tint the whole selected quarter, "so the tint
  // goes on the group and only the accent text stays on the label". The tint is
  // gone with the rail's frame; the accent text is what is left, and the labels
  // are already collected.
  for (let q = 0; q < 4; q++) {
    const group = qrail.createDiv({ cls: "jc-qgroup" });
    // The `Q` is inside a span rather than being the button's own text (3.17
    // §2), for the reason .jc-mcell-label is: `text-decoration` set on a flex
    // container is not reliably inherited by its anonymous text, and the
    // underline that says "this quarter has an entry" has to land on the word.
    // Same construction on all four scopes — month label, week number, quarter
    // letter, year figure — so one rule can describe them.
    const qlabel = group.createEl("button", {
      cls: "jc-qlabel",
      attr: { type: "button" },
    });
    qlabel.createSpan({ cls: "jc-qlabel-text", text: `Q${q + 1}` });
    quarterLabels.push(qlabel);
    const months = group.createDiv({ cls: "jc-qmonths" });
    for (let i = 0; i < 3; i++) {
      const cell = months.createEl("button", {
        cls: "jc-mcell",
        attr: { type: "button" },
      });
      // THE LABEL CARRIES IT, as of 3.9 §1. There used to be a lucide
      // `notebook` beside this span, and it was one element saying two things:
      // at full opacity on the selected cell's hover it was an AFFORDANCE
      // ("click here and the entry opens"), and at 0.4 at rest it was a FACT
      // ("this month has an entry"). Those are different claims and they shared
      // a glyph, so the second was only learnable by noticing the first was
      // sometimes dimmer.
      //
      // The fact is a property of the month and the month is right there as a
      // word, so it is said on the word: `.has-review` underlines the label.
      // See 93-calendars.css for why underline rather than a dot, a tint or a
      // weight — every other channel on this cell is already spoken for.
      //
      // The affordance is now carried by `title` alone, which is what every
      // keyboard and screen-reader user already had. Removing the icon did not
      // take an affordance away from them; it took away a second one only mouse
      // users ever got.
      cell.createSpan({ cls: "jc-mcell-label", text: MONTH_ABBR[q * 3 + i] });
      monthCells.push(cell);
    }
  }

  // The navigator is a bounded band now (hairlines top and bottom, see
  // .jc-header in styles.css), so the two rows read as one deliberate control
  // strip between the stats and the grid rather than floating over the days.
  // The band's own borders replace the standalone closing rule that used to
  // sit here.

  renderWeekdayHeader(root, true);
  const gridEl = root.createDiv({ cls: "jc-grid" });

  // The footer's right half used to be an empty slot that only ever filled in
  // for the half-second a "Creating…" message was up. It now carries the
  // visible month's entry count by default and borrows the slot for status.
  const footer = root.createDiv({ cls: "jc-footer" });
  const jumpToggle = footer.createSpan({ cls: "jc-jump-toggle", text: "Jump to a date…" });
  const statusEl = footer.createSpan({ cls: "jc-status" });

  const jumpRow = root.createDiv({ cls: "jc-jump-row" });
  const jumpDay = jumpRow.createEl("input", { type: "date", cls: "jc-jump-day" });
  const jumpDayBtn = jumpRow.createEl("button", { cls: "jc-jump-day-btn", text: "Open Day" });
  const jumpMonth = jumpRow.createEl("input", { type: "month", cls: "jc-jump-month" });
  const jumpMonthBtn = jumpRow.createEl("button", { cls: "jc-jump-month-btn", text: "Open Month" });
  jumpDay.value = today();
  jumpMonth.value = thisMonth();

  const setStatus = (msg: string) => statusEl.setText(msg);

  // Restore the month the previous render was showing, if there was one.
  const state = opts.state;
  const savedMonth = state?.monthKey;
  let cursor = moment(savedMonth ? `${savedMonth}-01` : undefined);
  if (!cursor.isValid()) cursor = moment();
  cursor = cursor.startOf("month");

  const openDay = (iso: string) => {
    setStatus(dayMap.has(iso) ? "Opening…" : "Creating…");
    void plugin.diary.openOrCreateDay(iso);
  };
  // The month ENTRY — one note per month, created if absent. Reached from the
  // jump row's "Open Month" only, as of 3.17 §1; the rail no longer goes here.
  const openMonth = (mk: string) => {
    setStatus(monthMap.has(mk) ? "Opening month entry…" : "Creating month entry…");
    void plugin.diary.openOrCreateMonth(mk);
  };
  // The Monthly Overview — the dashboard, scoped to the clicked month (3.17
  // §1). The fourth of the identical constructions below it: one note, one
  // period property, set it then reveal it.
  //
  // THE RAIL'S SECOND CLICK USED TO OPEN THE ENTRY, and that was the odd one
  // out among the four scopes this card reaches. The `Wk` gutter opens the
  // Weekly Overview, a `Q` label opens the Quarterly Overview, the year opens
  // the Yearly Overview — three dashboards — and then the month, the scope in
  // the middle of them, opened a NOTE. So the rail taught a rule three times
  // and broke it once, and the break was on the control you use most.
  //
  // The distinction the four now hold is one of grain, not of scope: a DAY cell
  // opens the day's entry because a day has no dashboard — the entry is the
  // only thing there is. Every period above a day has both, and for every one
  // of them this card opens the dashboard. Creating the month's entry is still
  // one click from where you land, on the overview's own "New entry" button,
  // and still available here through the jump row.
  const openMonthOverview = (mk: string) => {
    const path = monthlyOverviewPath(paths);
    const file = getFile(app, path);
    if (!file) {
      setStatus("Monthly Overview note not found.");
      return;
    }
    setStatus("Opening month…");
    void plugin.diary
      .setPeriod(path, "month-start", "month", `${mk}-01`)
      .then(() => openFile(app, file));
  };
  // The Weekly Overview is a single dashboard note scoped by its `week-start`
  // property (the prev/this/next buttons on that page write to it). Opening a
  // week from the calendar is the same move the date-finder makes: snap that
  // property to the clicked week, then reveal the note.
  const openWeek = (weekStartIso: string) => {
    const path = weeklyOverviewPath(paths);
    const file = getFile(app, path);
    if (!file) {
      setStatus("Weekly Overview note not found.");
      return;
    }
    setStatus("Opening week…");
    void plugin.diary
      .setPeriod(path, "week-start", "isoWeek", weekStartIso)
      .then(() => openFile(app, file));
  };
  // The Quarterly Overview is the same construction again (2.26) — one note
  // scoped by `quarter-start`. Missing-note handling matters more here than
  // for the other two: Quarter.md only appears once "Set up / repair vault"
  // has run on an existing vault, so the rail's Q labels have to say so rather
  // than throw.
  const openQuarter = (quarterKey: string) => {
    const path = quarterOverviewPath(paths);
    const file = getFile(app, path);
    if (!file) {
      setStatus("Quarter note not found — run 'Set up / repair vault'.");
      return;
    }
    setStatus("Opening quarter…");
    void plugin.diary
      .setPeriod(path, "quarter-start", "quarter", `${quarterMonths(quarterKey)[0]}-01`)
      .then(() => openFile(app, file));
  };
  // The Year is likewise one dashboard note scoped by `year-start`; clicking the
  // title's year snaps it to the shown year so browsing to another year and
  // clicking it lands on that year rather than the current one.
  const openYear = (year: number) => {
    const path = yearOverviewPath(paths);
    const file = getFile(app, path);
    if (!file) {
      setStatus("Year note not found.");
      return;
    }
    setStatus("Opening year…");
    void plugin.diary
      .setPeriod(path, "year-start", "year", `${year}-01-01`)
      .then(() => openFile(app, file));
  };

  const render = () => {
    const monthKey = cursor.format("YYYY-MM");
    if (state) state.monthKey = monthKey;

    const year = cursor.year();
    const monthIndex = cursor.month();
    const nowKey = thisMonth();

    const yearHasEntry = yearEntries.has(String(year));
    yearCurLabel.setText(String(year));
    yearCurEl.toggleClass("has-review", yearHasEntry);
    yearCurEl.setAttr(
      "title",
      `Open the ${year} overview${entryTip("year", yearHasEntry)}`
    );
    yearPrevEl.setAttr("title", `Go to ${year - 1}`);
    yearNextEl.setAttr("title", `Go to ${year + 1}`);

    for (let i = 0; i < 12; i++) {
      const key = `${year}-${String(i + 1).padStart(2, "0")}`;
      const cell = monthCells[i];
      const selected = i === monthIndex;
      const name = moment(`${key}-01`).format("MMMM YYYY");
      const hasReview = monthMap.has(key);

      // The selected month is tinted rather than merely underlined: with the
      // month name gone from the header, this cell is the only thing on the
      // card stating which month the grid below belongs to, so it has to carry
      // that weight on its own.
      cell.toggleClass("is-selected", selected);
      // A month that hasn't happened recedes; today's month keeps a quiet mark
      // of its own so it stays findable once you've navigated away from it.
      cell.toggleClass("is-future", key > nowKey);
      cell.toggleClass("is-now", key === nowKey && !selected);
      cell.toggleClass("has-review", hasReview);
      // WHAT THE SECOND CLICK DOES CHANGED IN 3.17 §1, so what the tooltip
      // promises changes with it. It used to name the entry in two moods —
      // "Open the August 2026 entry" when one existed, "Start the August 2026
      // entry" when none did — which was the only place on the card where a
      // click's DESTINATION depended on whether a file was there. It doesn't
      // any more: the destination is the Monthly Overview either way, and
      // whether an entry exists is said by the underline instead, in the same
      // words the other three scopes now use.
      cell.setAttr(
        "title",
        (selected ? `Open the ${name} overview` : `Show ${name}`) +
          entryTip("month", hasReview)
      );
    }

    const curQuarter = Math.floor(monthIndex / 3);
    for (let q = 0; q < 4; q++) {
      const qHasEntry = quarterEntries.has(`${year}-Q${q + 1}`);
      // THE GROUP IS NO LONGER MARKED (4.13.1 §3b). `is-selected` lit the whole
      // quarter with an accent wash while the rail was a framed segmented
      // control; the rail is a plain grid of months now and the wash went with
      // the frame. The class is not toggled rather than toggled-and-unstyled:
      // a marker nothing reads is a rule someone will later write back.
      quarterLabels[q].toggleClass("is-current", q === curQuarter);
      quarterLabels[q].toggleClass("has-review", qHasEntry);
      quarterLabels[q].setAttr(
        "title",
        `Open the Q${q + 1} ${year} overview${entryTip("quarter", qHasEntry)}`
      );
    }

    // Today carries the "you've navigated away" cue, as it did when the month
    // caption was there to lose.
    todayBtn.toggleClass("is-browsing", monthKey !== nowKey);

    // The footer's right slot is a transient action channel (Opening… /
    // Creating… / errors). Clearing it on each render wipes a stale message
    // when the view changes.
    setStatus("");
    renderDayGrid(gridEl, {
      monthStart: cursor,
      dayMap,
      events: gridEvents(plugin, cursor),
      range: moodRange(plugin),
      onOpen: openDay,
      onContext: opts.onContext,
      onOpenWeek: openWeek,
      weekEntries,
    });
  };
  render();

  todayBtn.addEventListener("click", () => { cursor = moment().startOf("month"); render(); });
  yearCurEl.addEventListener("click", () => openYear(cursor.year()));
  yearPrevEl.addEventListener("click", () => { cursor = cursor.clone().subtract(1, "year"); render(); });
  yearNextEl.addEventListener("click", () => { cursor = cursor.clone().add(1, "year"); render(); });

  // A month cell selects on the first click and opens the Monthly Overview,
  // scoped to that month, on the second — the two gestures the old month row
  // split between its arrows and its title.
  //
  // The second click went to the month's ENTRY until 3.17 §1. See
  // `openMonthOverview` for why it doesn't: this card reaches four scopes and
  // three of them opened a dashboard, so the month was one rule taught three
  // times and broken once.
  //
  // Deliberately NOT what the Monthly Overview's year-of-entries grid does: a
  // single click there opens or creates any month's entry, and it should
  // keep doing that. The two grids look alike and behave differently because
  // they answer different questions — that grid is an entry *index*, sitting
  // on the very dashboard this rail's second click navigates TO, where opening
  // an entry is the only reason you went there; while this rail is a
  // *navigator*, where the cells drive the grid below and reaching the
  // dashboard is the secondary move. Anyone finding this later should read the
  // divergence as chosen rather than as drift — and note that after §1 the two
  // no longer compete, because they no longer have the same destination.
  monthCells.forEach((cell, i) => {
    cell.addEventListener("click", () => {
      const key = `${cursor.year()}-${String(i + 1).padStart(2, "0")}`;
      if (i === cursor.month()) {
        openMonthOverview(key);
        return;
      }
      cursor = moment(`${key}-01`);
      render();
    });
  });

  quarterLabels.forEach((label, q) => {
    label.addEventListener("click", () => openQuarter(`${cursor.year()}-Q${q + 1}`));
  });

  jumpToggle.addEventListener("click", () => jumpRow.toggleClass("open", !jumpRow.hasClass("open")));
  jumpDayBtn.addEventListener("click", () => {
    if (!jumpDay.value) { setStatus("Pick a day first."); return; }
    openDay(jumpDay.value);
  });
  jumpMonthBtn.addEventListener("click", () => {
    if (!jumpMonth.value) { setStatus("Pick a month first."); return; }
    openMonth(jumpMonth.value);
  });

  // Last, so the agenda sits below the jump row rather than between the grid
  // and its own footer.
  if (opts.agenda && opts.agenda > 0) {
    root.addClass("jc-has-agenda");
    renderAgenda(root, plugin, opts.agenda, openDay);
  }

  return root;
}

// ── year grid (Monthly Entries) ───────────────────────────────────────
// The twelve-month grid of Monthly Entry entries. No longer a standalone
// widget with its own year navigator: it's rendered as part of month-summary
// and scoped to the year of that note's `month-start`, so the whole overview
// is driven by a single property (and the single period-nav above it). The
// month matching `month-start` is highlighted, mirroring how the day grid
// highlights the selected month's days.
// `selectMonth`, when given, makes the grid a two-stage control: clicking a
// month that isn't the selected one re-scopes the page to it, and clicking the
// one already selected opens its review (2.53).
//
// The reason to stage it rather than always opening: this grid sits on a
// dashboard whose whole content is one month, so a click on August most often
// means "show me August", not "take me out of here". Opening on the first click
// made the grid a row of twelve exits from the page you were reading, and left
// re-scoping to the navigator in the banner — which is further away and less
// obviously about months. Staged, the grid is a month picker that also happens
// to be the door to the review, and the second click is the one that leaves.
//
// It matches the homepage calendar, where clicking the already-selected month
// opens that month's review and clicking another selects it. Same gesture, same
// meaning, on both surfaces.
function renderYearGrid(
  gridEl: HTMLElement,
  plugin: AlmanacPlugin,
  year: number,
  selectedMonthKey: string,
  dayMap: Map<string, DayEntry>,
  monthMap: Map<string, TFile>,
  selectMonth?: (monthKey: string) => void
): void {
  const moodByMonth = new Map<string, number[]>();
  // HOW MANY DAYS EACH MONTH HOLDS (4.14 §3). Counted off the same pass that
  // gathers the moods, and off `dayMap` rather than `monthMap`: those are two
  // different facts. `monthMap` says a Monthly Overview note exists, which is
  // what the tile's border has always drawn; this says how many days were
  // written up inside the month, which is what the year was silent about.
  //
  // A mood is optional and an entry is not, so the count cannot be taken from
  // the mood array — a year of entries with the tracker switched off would read
  // as a year of nothing.
  const daysByMonth = new Map<string, number>();
  for (const { iso, mood } of dayMap.values()) {
    const mk = iso.slice(0, 7);
    daysByMonth.set(mk, (daysByMonth.get(mk) ?? 0) + 1);
    if (mood == null) continue;
    const arr = moodByMonth.get(mk) ?? [];
    arr.push(mood);
    moodByMonth.set(mk, arr);
  }

  gridEl.empty();
  const todayMonthKey = moment().format("YYYY-MM");
  for (let i = 0; i < 12; i++) {
    const mk = `${year}-${String(i + 1).padStart(2, "0")}`;
    const has = monthMap.has(mk);
    const moods = moodByMonth.get(mk) ?? [];
    const avg = moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null;

    const classes = ["cal-cell", "cal-cell-month"];
    if (mk === selectedMonthKey) classes.push("cal-cell-selected");
    if (mk === todayMonthKey) classes.push("cal-cell-today");
    if (has) classes.push("cal-cell-has-entry");

    // The tooltip has to say which of the two things a click will do, or the
    // staging is invisible and the grid reads as inconsistent.
    const selects = selectMonth != null && mk !== selectedMonthKey;
    const logged = daysByMonth.get(mk) ?? 0;
    // The count is drawn as a bare figure in the tile's corner, which is legible
    // beside a month's name and ambiguous read aloud — "Aug 12" is a date. The
    // tooltip is where it gets its noun.
    const tally = `${logged} ${logged === 1 ? "day" : "days"} logged`;
    const cell = gridEl.createDiv({
      cls:
        classes.join(" ") +
        moodClass(avg, moodRange(plugin)) +
        (selects ? " cal-cell-selects" : ""),
      attr: {
        title:
          (selects
            ? `Show ${moment(mk + "-01").format("MMMM")}`
            : has
              ? "Open review"
              : "Create review") + ` — ${tally}`,
      },
    });
    cell.createSpan({ cls: "cal-daynum", text: moment(mk + "-01").format("MMM") });
    if (has) cell.createSpan({ cls: "cal-dot" });

    // THE TILE REPORTS (4.14 §3). Twelve tiles at 157x97px — the largest
    // objects on the month view — carried one word each, so a month with forty
    // entries and a month with none were the same picture. The count sits in
    // the corner and a bar runs the foot, and between them the year is legible
    // as a shape before any of it is read as a number.
    //
    // AN EM DASH, NOT A ZERO, for a month with nothing in it. A `0` is a
    // measurement and reads as one; twelve of them down a fresh vault's first
    // year is a scorecard nobody asked for. The dash says the slot is empty,
    // which is the same thing the bar says by not being drawn.
    cell.createSpan({
      cls: "cal-month-count",
      text: logged > 0 ? String(logged) : "—",
    });
    if (logged > 0) {
      // Against the month's own length, not against the year's best month: the
      // bar answers "how much of this month did I write up", and a scale set by
      // the fullest month would redraw all twelve every time one of them grew.
      const days = moment(mk + "-01").daysInMonth();
      const bar = cell.createSpan({ cls: "cal-month-bar" });
      bar.style.width = `${Math.round((logged / days) * 100)}%`;
    }
    cell.addEventListener("click", () => {
      if (selects) selectMonth(mk);
      else void plugin.diary.openOrCreateMonth(mk);
    });
  }
}

// ── week-summary ──────────────────────────────────────────────────────
// The seven-day "This Week" table, driven by the current note's `week-start`
// frontmatter property (which the week-prev/this/next buttons + date picker
// above it write to). Replaces the weekly review's old ```dataviewjs``` block:
// like the calendars, it reads straight from Obsidian's metadata cache, so it
// needs no Dataview plugin, honours a custom daily-notes path, and can't be
// tripped up by a stale Dataview index (which, in a copied vault, surfaced
// phantom future entries and threw ENOENT while rendering their links).
// ── overview banner (2.22) ────────────────────────────────────────────
// The top band of a period dashboard's summary card: a small-caps "WEEKLY
// OVERVIEW" / "MONTHLY OVERVIEW" eyebrow with its icon, the period name as the
// big title, the stats line beneath it, and the period navigator anchored on the
// right.
//
// IT USED TO BE ACCENT-WASHED AND IT USED TO HAVE A TWIN. 3.6 took the wash off
// (see `.journal-overview-banner`, which is the argument), and this comment went
// on describing itself as the sibling of the homepage's diary header — the band
// `.jc-diary-header` painted. That one is gone entirely as of 4.13.1 §3, and the
// direction of the resemblance has reversed with it: this banner is now the
// thing the diary card was made to look like, rather than the other way round.
//
// Before 2.22 this was a plain `header:📆 Monthly Overview` bar (a hairline-
// ruled flex row) rendered as its own ```almanac fence, separate from the
// summary's title + stats below it. Folding the navigator into the summary
// widget makes the band and the grid one card — the same construction the
// calendar card uses on the homepage, and the entry banner uses on a note.
//
// Returns the text column so the caller can render its stats line (and, for the
// month, its review-note link) into it after the title — the numbers aren't
// known until the period's files have been gathered.
// The three period dashboards this banner heads. Quarter joined in 2.26 and
// needed nothing but a label and a nav unit — the band, the stats strip and
// the card construction are all scope-agnostic already.
export type OverviewUnit = "week" | "month" | "quarter" | "year";

export const OVERVIEW_LABELS: Record<OverviewUnit, string> = {
  week: "Weekly Overview",
  month: "Monthly Overview",
  quarter: "Quarterly Overview",
  year: "Yearly Overview",
};

export function buildOverviewBanner(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  unit: OverviewUnit,
  icon: string,
  title: string
): { band: HTMLElement; textCol: HTMLElement } {
  const band = createDiv({ cls: `journal-overview-banner job-${unit}` });

  // ── THE HEADLINE IS UPSTAIRS NOW (4.51.7) ─────────────────────────────
  //
  // The band's biggest type is the navigator's own trigger — *"the period's
  // VALUE… wearing the title's size"* — and since 4.51.6 the page head above
  // prints that same value as the note's name. Two headlines on one page, one
  // of them a control.
  //
  // So where the head is drawing, the trigger goes back to being a control:
  // ONE TOKEN, `--jpn-headline`, which the label, the caret and the chevrons
  // outside the trigger all measure themselves against — see
  // `93-calendars.css`, where that token exists precisely so this size is
  // stated once.
  //
  // GATED ON THE BAR, because with it off there is no head and this trigger is
  // the only thing on the page naming the period. A demotion that ran
  // unconditionally would leave that page with no headline at all, which is the
  // failure this release keeps finding: a fact moved to a surface that is not
  // being drawn.
  const noteFile = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (noteFile instanceof TFile && bannerSuppressed(plugin, ctx.sourcePath)) {
    band.addClass("job-head-elsewhere");
  }

  const head = band.createDiv({ cls: "job-head" });

  // NO EYEBROW AND NO NAVIGATOR AS OF 3.4. Both moved out of the band, and the
  // band is what is left when they go: the period's name, as large as it can
  // reasonably be.
  //
  // The eyebrow said "YEARLY OVERVIEW" one row under a breadcrumb reading
  // "Yearly" — the same fact twice, eight pixels apart, and the breadcrumb was
  // the weaker of the two because it named the FOLDER rather than the page. So
  // the crumb now carries the label and the eyebrow is gone rather than the
  // crumb, which is the opposite of the obvious fix and the right way round:
  // one of them had to move to the top bar, and only one of them was already
  // there.
  //
  // `icon` is still taken and still unused here — the crumb draws its own, and
  // dropping the parameter would touch four call sites for nothing.
  void icon;
  const textCol = head.createDiv({ cls: "job-text" });

  // TWO LINES, ANSWERING TWO QUESTIONS. `title` is the SPAN — the stretch of
  // days this page covers — and it is printed small, above. The headline is the
  // period's VALUE ("Week 31", "Q3 2026"), and it is not printed here at all:
  // it is the navigator's own picker trigger, wearing the title's size.
  //
  // The band used to print one line trying to be both, which is why it was long
  // enough to wrap in a split pane ("Mon 27 Jul — Sun 2 Aug 2026" plus two
  // chevrons plus a pill) and why it changed shape as a period ran ("Jul – Sep
  // so far"). Splitting them fixes both: the span carries the sentence and the
  // "so far", and the headline reads the same on the first day of a period as
  // on the last.
  textCol.createDiv({ cls: "job-span", text: title });

  // THE NAVIGATOR IS IN THE BAND, and 3.4's `period-nav:` directive is
  // withdrawn. Moving it to the nav row was right about the redundancy it was
  // fixing and wrong about the destination: that row's controls are a wrapping
  // flex of pills and this is a two-part stack, so it broke the row onto its
  // own line.
  //
  // Being BUILT here rather than MOVED here is what makes it safe. 3.2 learned
  // that a control parented into a `LiveWidget`'s subtree is destroyed on the
  // next rebuild; a control the widget builds is rebuilt with it, which is the
  // same fact from the other side and the reason this was never the problem the
  // period button was.
  textCol.appendChild(buildPeriodNav(plugin, ctx, unit));

  return { band, textCol };
}

// ── shared stats strip ────────────────────────────────────────────────
// `N/M days logged · D ✓ / O ◻ tasks`, used by both period dashboards. Shared
// for the numbers, not just the styling: the week and month summaries
// previously counted tasks by different routes, and only one of them could
// actually see an Almanac `- ( )` task (see sumAlmanacTasks). One function is
// the cheapest guarantee they can't drift apart again.
//
// 2.23 dropped the "avg mood X" segment from both dashboards — per-day mood
// is still visible elsewhere (the week table's heat dot, the calendar cell
// tint); this was only the aggregate figure on the stats line.
//
// 2.52 took the denominator off the caller. It used to be a bare `totalDays`
// each dashboard supplied for itself, and the quarter supplied the whole
// quarter — so a quarter five days old read "3/92 days logged" while the year
// page, on the same data, correctly said "so far". The bounds come in instead
// and periodCoverage decides; see its comment in util.ts for why this is the
// same class of fix as extracting this function was in the first place.
//
// Returns the paragraph in case a caller wants to append to it.
// The period's FIGURES, with no opinion about how they are shown.
//
// SPLIT OUT OF `renderPeriodStats` IN 3.6, and the split is what §4.1 of the
// plan needs before stat cards can exist. The stated requirement was that the
// cards "should read from `renderPeriodStats`, not recompute beside it" —
// which they could not, because it was a renderer: it opened a `<p>`, appended
// text to it, and handed back the element. There was no way to ask it for the
// numbers, so a card strip would have called `periodCoverage` and
// `sumAlmanacTasks` again and become the second place the dashboard's figures
// are decided. That is the failure this function exists to prevent, and it is
// the reason `renderPeriodStats` was made shared in the first place.
//
// THE TASK COUNT IS A PROMISE, DELIBERATELY, and it is one promise rather than
// one per consumer. Counting Almanac tasks means reading every entry's body,
// so it cannot be synchronous — but a promise can be awaited any number of
// times, so the prose line and a card strip beside it share ONE pass over the
// files and cannot disagree about the answer. Handing back a number would have
// meant making this function async, which would have made both callers async,
// which is how a synchronous frontmatter read ends up behind a file read it
// does not need.
export interface PeriodStats {
  /** False before the period begins: there is no fraction to state yet. */
  started: boolean;
  /** Entries found in the span. */
  logged: number;
  /** Days of the span that have happened. */
  elapsed: number;
  /** Days in the whole span. */
  total: number;
  /** Whether `elapsed` is short of `total` — what "so far" reports. */
  partial: boolean;
  /** Resolved once, shared by every consumer. */
  tasks: Promise<{ open: number; done: number }>;
}

export function periodStats(
  files: TFile[],
  span: { start: string; end: string },
  app: App,
  todayIso: string = today()
): PeriodStats {
  const cov = periodCoverage(span.start, span.end, todayIso);
  return {
    started: cov.started,
    logged: files.length,
    elapsed: cov.elapsed,
    total: cov.total,
    partial: cov.partial,
    tasks: sumAlmanacTasks(app, files),
  };
}

// The band's third row: the same figures as two stat cells.
//
// WAS A PROSE LINE — `4/7 days logged  ·  12 ✓ / 3 ◻ tasks` — and §4.1 replaces
// it on all four grains with the strip the year page already had. It computes
// nothing: `periodStats` decides the numbers and this decides how they look, so
// the line and the year's cards cannot disagree about what a day logged is.
//
// TWO CARDS, NOT FOUR, AND THAT IS THE POINT OF THE VARIABLE STRIP. 3.2
// deferred this because a week cannot answer "longest streak" in any way worth
// a cell — a week's longest streak is at most seven and usually the same number
// as its entry count — and a strip padded to four with zeros is worse than no
// strip. These are the two every grain can answer, which is the list §6 asked
// for: days logged and tasks done, in the year page's own words so the same
// fact reads the same at every grain.
export function renderPeriodStats(
  parent: HTMLElement,
  files: TFile[],
  span: { start: string; end: string },
  app: App,
  todayIso: string = today()
): HTMLElement {
  const s = periodStats(files, span, app, todayIso);

  // A period that hasn't begun has no fraction to state: "0/0" is noise and
  // "0/92" invites the reader to feel behind on days that haven't happened.
  // One cell rather than two greyed-out ones — there is nothing to say about
  // tasks in a period with no days in it yet, and an empty TASKS DONE cell
  // would be a zero the reader has to decide is meaningless. The wording is
  // periodnav.ts's, verbatim: it is the sentence the span line one row up
  // prints for the same case.
  if (!s.started) {
    return statStrip(parent, [
      { label: "Days logged", value: "—", sub: "Hasn't started yet" },
    ]).grid;
  }

  const pct = s.elapsed > 0 ? Math.round((s.logged / s.elapsed) * 100) : 0;
  const { grid, cells } = statStrip(parent, [
    {
      label: "Days logged",
      value: `${s.logged}/${s.elapsed}`,
      // "so far" is what carries the moved denominator. Without it a partial
      // month reading "3/5" is indistinguishable from a five-day period.
      sub: `${pct}% of days${s.partial ? " so far" : ""}`,
    },
    // Drawn as a placeholder and filled when the read lands, the same deferred
    // pattern the week table's Tasks column uses: everything else here comes
    // from frontmatter and stays synchronous, so the strip doesn't flash in
    // wholesale. The cell's sub-line exists from the start even though it is
    // empty, so filling it cannot shift the row below.
    { label: "Tasks done", value: "…", sub: "" },
  ]);

  void s.tasks.then(({ open, done }) => {
    cells[1].value.setText(String(done));
    cells[1].sub.setText(open > 0 ? `${open} still open` : "");
  });

  return grid;
}

export function buildWeekSummary(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const app = plugin.app;
  const paths = plugin.settings.paths;
  const root = createDiv({ cls: "journal-week-summary journal-overview-summary" });

  const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(file instanceof TFile)) return root;

  const fm = frontmatterOf(app, file);
  let ws = moment(isoDate(fm["week-start"]) ?? undefined);
  if (!ws.isValid()) ws = moment();
  ws = ws.startOf("isoWeek"); // Monday
  const end = ws.clone().add(6, "days");

  // iso date -> diary entry file (dashboard note itself excluded).
  const byDate = new Map<string, TFile>();
  const dashboard = weeklyOverviewPath(paths);
  for (const f of filesUnder(app, paths.diaryDaily)) {
    if (f.path === dashboard) continue;
    const iso = isoDate(frontmatterOf(app, f)["journal-date"]);
    if (iso) byDate.set(iso, f);
  }

  // Same stats strip the month summary carries, from the same counter — the
  // two dashboards read as one family rather than two designs, and the numbers
  // are now guaranteed to agree because there is only one way to count.
  const weekFiles: TFile[] = [];
  // Per-day mood, kept so the table can draw the same heat dot the calendar
  // uses — the stats strip above no longer averages these (2.23 dropped the
  // aggregate "avg mood" figure), but each row still shows its own day's mood.
  const moodByDate = new Map<string, number>();
  for (let i = 0; i < 7; i++) {
    const iso = ws.clone().add(i, "days").format("YYYY-MM-DD");
    const f = byDate.get(iso);
    if (!f) continue;
    weekFiles.push(f);
    const raw = frontmatterOf(app, f)[plugin.settings.moodTrackerId];
    const num = raw != null && raw !== "" ? Number(raw) : NaN;
    if (Number.isFinite(num)) moodByDate.set(iso, num);
  }

  // The banner band: eyebrow + period title + stats + navigator, welded atop
  // the card. Its title carries the week's span; the stats line renders into
  // the same text column, under the title.
  const { band, textCol } = buildOverviewBanner(
    plugin,
    ctx,
    "week",
    "calendar-range",
    periodSpan("week", ws)
  );
  root.appendChild(band);
  renderPeriodStats(
    textCol,
    weekFiles,
    { start: ws.format("YYYY-MM-DD"), end: end.format("YYYY-MM-DD") },
    app
  );

  // The seven-day table lives in the card body, below the band. It reads as a
  // strip of day rows rather than a spreadsheet: each row leads with a status
  // dot (logged / empty), then the weekday split from the date, then the entry
  // and its task rollup. The old version was three plain text columns — the
  // extra structure here is what brings it up to the calendar's own weight.
  const body = root.createDiv({ cls: "journal-overview-body" });
  const table = body.createEl("table", { cls: "journal-week-table" });
  const headRow = table.createEl("thead").createEl("tr");
  for (const h of ["Day", "Entry", "Tasks"]) headRow.createEl("th", { text: h });
  const tbody = table.createEl("tbody");

  const range = moodRange(plugin);
  const todayIso = today();

  // The week's events, from the same store and through the same expandEvents
  // the calendar grid uses — so a day tinted amber here is tinted amber there.
  // A second derivation of "what is on this day" is how the two surfaces would
  // start disagreeing about the same week.
  const weekEvents = plugin.settings.eventsEnabled
    ? expandEvents(
        readEvents(app, plugin),
        ws.format("YYYY-MM-DD"),
        end.format("YYYY-MM-DD")
      )
    : new Map<string, EventOccurrence[]>();

  for (let i = 0; i < 7; i++) {
    const d = ws.clone().add(i, "days");
    const iso = d.format("YYYY-MM-DD");
    const f = byDate.get(iso);
    const dow = d.day(); // 0 = Sunday … 6 = Saturday
    const isWeekend = dow === 0 || dow === 6;
    const isFuture = iso > todayIso;

    const row = tbody.createEl("tr", { cls: "jw-row" });
    if (iso === todayIso) row.addClass("jw-today");
    if (f) row.addClass("jw-logged");
    else row.addClass("jw-empty");
    if (isWeekend) row.addClass("jw-weekend");
    if (isFuture) row.addClass("jw-future");

    // Day: the date over its weekday, so the column reads as a run of dates
    // rather than a list of labels (2.53). The number leads and the three-letter
    // weekday sits under it — which is the order a calendar states a day in, and
    // the reason this table now scans like one.
    //
    // Tinted when the day carries an event, using the calendar's own
    // `cal-tint-{color}` vocabulary rather than a second one. Tint from the
    // first occurrence only, for the reason decorateCell gives: layering two
    // translucent washes makes a muddy third colour belonging to neither event.
    //
    // The status dot went with the flip. It encoded logged / not-logged, which
    // the Entry cell beside it already says in words — "Journal entry" against
    // a muted "＋ Add entry" — so it was a second mark for a fact already on the
    // row, and it was competing with the date for the eye.
    const dayCell = row.createEl("td", { cls: "jw-day" });
    const occurrences = weekEvents.get(iso) ?? [];
    if (occurrences.length) {
      dayCell.addClass("jw-day-event");
      dayCell.addClass(`cal-tint-${eventColor(occurrences[0].def)}`);
      dayCell.setAttr(
        "title",
        occurrences.map((o) => o.def.title).join(" · ")
      );
    }
    const label = dayCell.createSpan({ cls: "jw-daylabel" });
    label.createSpan({ cls: "jw-date", text: d.format("D") });
    label.createSpan({ cls: "jw-dow", text: d.format("ddd") });

    // Entry: a titled link when the day is logged (its own title if it has one,
    // else a muted "Journal entry"), with a mood heat dot when that day carries
    // one; otherwise a quiet "＋ Add entry" that creates the note, matching the
    // calendar cells' create-on-click.
    const entryCell = row.createEl("td", { cls: "jw-entry" });
    if (f) {
      const titleRaw = frontmatterOf(app, f)["title"];
      const title = typeof titleRaw === "string" ? titleRaw.trim() : "";
      const href = noExt(f.path);
      const link = entryCell.createEl("a", {
        cls: "internal-link jw-entry-link",
        href,
        attr: { "data-href": href, title: title || f.basename },
      });
      setIcon(link.createSpan({ cls: "jw-entry-icon" }), title ? "notebook" : "calendar");
      link.createSpan({
        cls: "jw-entry-title" + (title ? "" : " jw-entry-untitled"),
        text: title || "Journal entry",
      });
      link.addEventListener("click", (evt) => {
        evt.preventDefault();
        void openFile(app, f);
      });
      const mood = moodByDate.get(iso);
      if (mood != null) {
        entryCell.createSpan({
          cls: "jw-mood" + moodClass(mood, range),
          attr: { title: `Mood ${mood}` },
        });
      }
      link.addEventListener("mouseover", (evt) => {
        app.workspace.trigger("hover-link", {
          event: evt,
          source: "almanac-week",
          hoverParent: entryCell,
          targetEl: link,
          linktext: href,
          sourcePath: ctx.sourcePath,
        });
      });
    } else {
      const create = entryCell.createEl("a", {
        cls: "jw-create",
        attr: { title: "Create entry" },
      });
      setIcon(create.createSpan({ cls: "jw-create-icon" }), "plus");
      create.createSpan({ text: "Add entry" });
      create.addEventListener("click", (evt) => {
        evt.preventDefault();
        void plugin.diary.openOrCreateDay(iso);
      });
    }

    // Tasks: a compact pill carrying the day's task count, tinted when any are
    // still open and quiet when they're all done. Empty days stay blank rather
    // than showing a zero. The count needs the note body (Almanac tasks live in
    // `<!--almanac:KEY-->` regions the metadata cache doesn't expose), so it
    // fills a beat after first paint — the same deferred read the stats strip
    // and the open-tasks table use.
    const taskCell = row.createEl("td", { cls: "jw-tasks" });
    if (f) {
      void app.vault.cachedRead(f).then((text) => {
        // Focus: the line written at the top of that day's entry. Until 2.52
        // this field reached no dashboard anywhere — authored every morning
        // since 2.6 and read by nothing but full-text search. It costs no
        // extra vault read: this body was already being pulled to count tasks.
        //
        // It sits *under the entry title*, not in a column of its own. A
        // fourth column was the first attempt and it was wrong twice over:
        // `.jw-entry` already carries `width: 100%`, so the new column could
        // only take its width by fighting it (it lost, and truncated to three
        // characters) — and a column header advertises a field that is empty
        // on every unlogged day, which on a Wednesday is most of the week. A
        // truncated "Coo…" is worse than nothing: it promises information and
        // withholds it.
        //
        // Under the title it is the construction the timeline already uses —
        // date, title, then an opening line of your own prose (`.jdr-snippet`)
        // — so this borrows a shape rather than inventing one, and a day with
        // nothing written is simply a one-line cell instead of a blank column.
        const focus = lineOf(readRollup(allNoteRegions(text), "daily"), "focus");
        if (focus) {
          entryCell.createDiv({
            cls: "jw-entry-focus",
            text: focus,
            attr: { title: focus },
          });
        }

        const { open, done } = countAlmanacTasks(text);
        const total = open + done;
        if (!total) return;
        const pill = taskCell.createSpan({
          cls: "jw-taskpill" + (open > 0 ? " has-open" : " all-done"),
          attr: {
            title: `${done} done · ${open} open`,
          },
        });
        setIcon(
          pill.createSpan({ cls: "jw-taskpill-icon" }),
          open > 0 ? "square" : "check-square"
        );
        pill.createSpan({ cls: "jw-taskpill-count", text: String(total) });
      });
    }
  }

  return root;
}

// ── month-summary ─────────────────────────────────────────────────────
// Stats line + compact grid for "This Month", driven by the current note's
// `month-start` frontmatter property (which the month-prev/this/next
// buttons above it write to).
export function buildMonthSummary(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const app = plugin.app;
  const paths = plugin.settings.paths;
  const root = createDiv({ cls: "journal-month-summary journal-overview-summary" });

  const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(file instanceof TFile)) return root;

  const fm = frontmatterOf(app, file);
  let ms = moment(isoDate(fm["month-start"]) ?? undefined);
  if (!ms.isValid()) ms = moment();
  ms = ms.startOf("month");
  const days = ms.daysInMonth();

  const dayMap = buildDayMap(app, paths.diaryDaily, plugin.settings.moodTrackerId);
  const byDate = new Map<string, { iso: string; file: TFile; mood: number | null }>();
  const dashboard = folderNotePath(paths.diaryDaily);
  for (const f of filesUnder(app, paths.diaryDaily)) {
    // Skip the Weekly Overview folder note explicitly, as buildDayMap and
    // buildWeekSummary do. It carries `week-start`, not `journal-date`, so it
    // was already filtered out incidentally — but relying on that would mean a
    // dashboard that ever gained a date silently became an "entry".
    if (f.path === dashboard) continue;
    const iso = isoDate(frontmatterOf(app, f)["journal-date"]);
    if (iso) byDate.set(iso, { iso, file: f, mood: dayMap.get(iso)?.mood ?? null });
  }

  const monthFiles: TFile[] = [];
  for (let i = 0; i < days; i++) {
    const iso = ms.clone().add(i, "days").format("YYYY-MM-DD");
    const p = byDate.get(iso);
    if (!p) continue;
    // Task counts can't be taken from the metadata cache here (util.ts::
    // taskCounts only sees Obsidian's `- [ ]`, never Almanac's `- ( )`), so
    // the files are collected and counted from their bodies below.
    monthFiles.push(p.file);
  }
  const monthKey = ms.format("YYYY-MM");

  // The banner band: eyebrow + month title + stats + navigator, welded atop
  // the card. 2.23 dropped the "Review Note" link (and its "no review note
  // yet" placeholder) that used to tack onto the end of the stats line — the
  // separate Month-YYYY-MM review note still exists and is still reachable
  // from the entry navigator / All Entries, this just removes the shortcut
  // pill from this card.
  const { band, textCol } = buildOverviewBanner(
    plugin,
    ctx,
    "month",
    "calendar-days",
    periodSpan("month", ms)
  );
  root.appendChild(band);

  renderPeriodStats(
    textCol,
    monthFiles,
    {
      start: ms.format("YYYY-MM-DD"),
      end: ms.clone().endOf("month").format("YYYY-MM-DD"),
    },
    app
  );

  // The month grid + year grid live in the card body, below the band.
  const body = root.createDiv({ cls: "journal-overview-body" });

  const gridWrap = body.createDiv({ cls: "journal-calendar jc-embedded" });
  renderWeekdayHeader(gridWrap);
  const gridEl = gridWrap.createDiv({ cls: "jc-grid" });
  renderDayGrid(gridEl, {
    monthStart: ms,
    dayMap,
    events: gridEvents(plugin, ms),
    range: moodRange(plugin),
    onOpen: (iso) => void plugin.diary.openOrCreateDay(iso),
  });

  // The year of Monthly Entries, scoped to the selected month's year and with
  // that month highlighted. Folded in here (rather than a separate widget with
  // its own year navigator) so the whole overview is driven by `month-start`.
  body.createEl("h4", { cls: "jms-year-heading", text: `${ms.format("YYYY")} entries` });
  const yearWrap = body.createDiv({ cls: "journal-calendar journal-year-calendar jc-embedded" });
  const yearGridEl = yearWrap.createDiv({ cls: "jc-year-grid" });
  const monthMap = buildMonthMap(app, paths.diaryMonthly);
  // Re-scoping writes this note's `month-start`; the widget is live over the
  // host note (liveScopedWidget's shouldRefresh includes ctx.sourcePath), so
  // the whole card — grid, banner, stats, and the entry rollup below it —
  // repaints on the new month without any of them being told.
  renderYearGrid(
    yearGridEl,
    plugin,
    ms.year(),
    monthKey,
    dayMap,
    monthMap,
    (mk) =>
      void plugin.diary.setPeriod(
        ctx.sourcePath,
        "month-start",
        "month",
        `${mk}-01`
      )
  );

  return root;
}
