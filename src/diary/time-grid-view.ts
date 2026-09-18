// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// `time-grid` — the week, drawn. 4.55.
//
// THE HALF THAT KNOWS ABOUT THE VAULT. `time-grid.ts` holds the arithmetic and
// imports nothing but `events.ts`; this asks the three stores what they have,
// turns each answer into a `GridItem`, and paints. The split is `cell-move.ts`'
// and `layout.ts`', and it is what lets the packing be tested without a vault.
//
// ── THE PAINT IS TWO PASSES, AND IT HAS TO BE ───────────────────────
//
// Events live in frontmatter, which Obsidian's metadata cache hands back
// synchronously. Logbook items and tasks live in note BODIES, which do not.
// So the scaffold — heads, rail, columns — is drawn at once and the blocks
// arrive when the reads resolve.
//
// AND THE BLOCKS ARRIVE ALL AT ONCE, events included, rather than events being
// painted early because they could be. The window is derived from what the week
// holds and the packing is over everything in a column, so a first pass with
// only events would draw a grid at the wrong scale and then move every block in
// it. One flicker of "loading" is better than a grid that rearranges itself.
//
// ── WHY THE WHOLE VAULT IS IN SCOPE FOR TASKS ───────────────────────
//
// `tasks-table` takes a folder because it is a list of what is open under a
// place. A grid is a week, and a task due on Wednesday is due on Wednesday
// wherever its note happens to live — scoping it to a folder would silently
// drop most of them. The reads are cached by mtime and size (`openTasksInFile`)
// and the vault-root task table already pays exactly this cost.

import {
  MarkdownPostProcessorContext,
  MarkdownRenderChild,
  Menu,
  Notice,
  TFile,
  setIcon,
} from "obsidian";
import type ChronoAnvilPlugin from "../main";
import {
  CAPTURE_NOTE_KEY,
  LOGBOOK_NOTE_KEY,
  type LogbookDef,
} from "../core/constants";
import { readNoteRegion, writeNoteRegion } from "../core/notestore";
import {
  daysSinceWeekStart,
  filesUnder,
  frontmatterOf,
  getFile,
  isoDate,
  moment,
  openFile,
  weekStartDay,
} from "../core/util";
import { readDueTasks } from "../ui/tables";
import { locateEntry } from "./lineage";
import { eventColor, eventsOnDay, type EventDef } from "../events/events";
import { readEvents, saveEvent } from "../events/eventstore";
import { draftEvent, openEventEditor } from "../events/event-ui";
import { parseLogItems, serializeLogItems, type LogItem } from "./log-items";
import { partsOf } from "../core/section-model";
import {
  COMPACT_MIN_MINUTES,
  COMPACT_RAIL_STEP,
  DAY_COUNTS,
  DEFAULT_OPEN_HOUR,
  FULL_DAY_WINDOW,
  GRID_SOURCES,
  SNAP_MINUTES,
  boxDay,
  describeWhen,
  dayIndex,
  formatClock,
  minuteAt,
  movedTo,
  nowOffset,
  packBoxes,
  packDay,
  parseClock,
  parseDays,
  parseSources,
  placeInWindow,
  placeSpan,
  railHours,
  resizedTo,
  resolveOffSources,
  shortHourLabel,
  spanFromDrag,
  tallyAllDay,
  timeGridFilterKey,
  visibleDays,
  weekDates,
  type AllDayItem,
  type DayCount,
  type GridItem,
  type GridSource,
  type GridWindow,
  type PlacedBox,
} from "./time-grid";

// The one swatch every task wears.
//
// ONE COLOUR FOR THE WHOLE SOURCE, where an event carries its own and a logbook
// carries its book's. A task has no such owner — `tasks:` regions are scattered
// across the vault and belong to their notes, not to a registry with a settings
// row — so a per-task colour would be a field nobody could set.
//
// RED BECAUSE A TASK IS THE ONE THING ON THIS GRID THAT CAN BE LATE. An event
// at 14:00 simply happens; a log item has already happened; a task due at 14:00
// is a claim on the reader. Nothing else here needs to be noticed.
const TASK_COLOR = "red";

// And the one every capture wears.
//
// GREY, WHICH IS THE ONE SWATCH THAT SAYS "NOT SCHEDULED". Everything else on
// this grid was planned by somebody: an event was entered, a logbook item
// belongs to a book, a task was given a due date. A capture is a thought that
// arrived. Drawing it in a colour would put it in the same class as the things
// it landed between.
const CAPTURE_COLOR = "grey";

// Where a day's entry lives, without creating it.
//
// FROM THE CLASS TABLE, not from a second copy of `Day-`. `openOrCreateDay`
// builds the same path from the same two fields and would make the note — which
// is exactly wrong here: a grid is a view, and reading a week must not leave
// seven entries behind in a vault that had none.
function dayNoteOf(plugin: ChronoAnvilPlugin, iso: string): TFile | null {
  return locateEntry(plugin.app, plugin.settings.paths, "daily", iso);
}

// Which day the week opens on, and where the week comes from.
//
// THE HOST NOTE'S `week-start`, exactly as `buildWeekSummary` reads it — so
// `period-nav:week` re-scopes this grid with no navigation of its own — snapped
// back to the reader's own first day of the week.
//
// SNAPPED, NOT TRUSTED. `week-start` is written by the navigator and by hand,
// and a hand-written Wednesday would draw a Wednesday-to-Tuesday week whose
// column heads disagreed with every other calendar in the plugin.
function weekStartOf(plugin: ChronoAnvilPlugin, ctx: MarkdownPostProcessorContext): string {
  const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
  const declared =
    file instanceof TFile
      ? isoDate(frontmatterOf(plugin.app, file)["week-start"])
      : null;
  let m = moment(declared ?? undefined);
  if (!m.isValid()) m = moment();
  return m
    .clone()
    .subtract(daysSinceWeekStart(m.day(), weekStartDay()), "days")
    .format("YYYY-MM-DD");
}

export function buildTimeGrid(
  plugin: ChronoAnvilPlugin,
  rest: string,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const root = createDiv({ cls: "ca-tg" });
  // ONE ARGUMENT IN TWO PIECES, read with the registry's own splitter — the
  // sources and then how many days of the week to show.
  const [sourceArg, dayArg] = partsOf(rest, 2, "|");
  const { sources, unknown } = parseSources(sourceArg ?? "");
  const { days: asked, unknown: badDays } = parseDays(dayArg ?? "");

  if (unknown.length) {
    root.createDiv({
      cls: "ca-journal-widget-error",
      text: `time-grid: no source called ${unknown
        .map((w) => `"${w}"`)
        .join(", ")}. Name any of: ${GRID_SOURCES.join(", ")}.`,
    });
    return root;
  }

  if (badDays) {
    root.createDiv({
      cls: "ca-journal-widget-error",
      text: `time-grid: cannot draw "${badDays}" days. Name any of: ${DAY_COUNTS.join(
        ", "
      )}.`,
    });
    return root;
  }

  const start = weekStartOf(plugin, ctx);
  const dates = weekDates(start);

  const bar = root.createDiv({ cls: "ca-tg-bar" });
  const span = bar.createSpan({ cls: "ca-tg-span" });

  const scroll = root.createDiv({ cls: "ca-tg-scroll" });
  const grid = scroll.createDiv({ cls: "ca-tg-grid" });
  const status = root.createDiv({ cls: "ca-tg-status", text: "Reading the week…" });

  // Load remembered filter toggle state for this note's grid
  const filterKey = ctx.sourcePath
    ? timeGridFilterKey(ctx.sourcePath, rest)
    : null;
  const off = filterKey
    ? loadTimeGridFilters(plugin, filterKey, sources)
    : new Set<GridSource>();

  // ── WHETHER THIS GRID IS BEING READ OR BEING WRITTEN ON (1.0.26) ──────
  //
  // `readCompact` STOOD HERE and asked the stylesheet — named without its
  // parentheses, as every obituary in this tree is, so that a sweep for the CALL
  // form still reports a live one: `99-time-grid.css`
  // held the breakpoint as a `@container` query over this element and raised
  // `--ca-tg-compact` to 1 inside it, and a `ResizeObserver` — `CompactWatcher`,
  // retired with it — re-read the property whenever the box changed. Nothing
  // here knew the number, deliberately: a width measured in TypeScript and a
  // width written in CSS is two files holding one breakpoint, which is how a
  // grid comes to be drawn at fifteen pixels an hour and wired for dragging at
  // the same time.
  //
  // THE READER TOOK THE BREAKPOINT OUT OF THE QUESTION: *"Time-grid should have
  // a smaller mode on big displays just the same as on mobile, with a toggle to
  // go in and make edits and create events."* A grid is compact unless the
  // reader has opened it for editing — at 360px and at 1600px alike — so the
  // answer is the stored flag and nothing else, the stylesheet keys off
  // `.is-expanded` rather than a width, and the two files cannot disagree
  // because there is only one of them holding an opinion.
  //
  // THE HAZARD THE OLD ARRANGEMENT GUARDED IS UNCHANGED AND STILL GUARDED. A
  // quarter-hour block is five pixels tall at the compact row height and
  // `.ca-tg-grip` is a twelve-pixel handle; `compact` is what stops that handle
  // being wired, and it is now the same flag that sets the row height, one step
  // earlier in the same decision.

  let drawn: Collected = { items: [], allDay: [] };
  let ready = false;
  let showing: DayCount = asked;
  let opened = false;
  const ticker: TickerSlot = { current: null };
  let expanded = filterKey ? loadTimeGridExpanded(plugin, filterKey) : false;
  let compact = !expanded;
  root.toggleClass("is-expanded", expanded);

  const render = (): void => {
    if (!ready) return;
    showing = asked;
    compact = !expanded;
    const cols = visibleDays(dates, showing, moment().format("YYYY-MM-DD"));
    span.setText(
      cols.length === 1
        ? moment(dates[cols[0]]).format("dddd D MMMM YYYY")
        : `${moment(dates[cols[0]]).format("D MMM")} – ${moment(
            dates[cols[cols.length - 1]]
          ).format("D MMM YYYY")}`
    );
    paint(plugin, grid, dates, cols, {
      items: drawn.items.filter((i) => !off.has(i.source)),
      allDay: drawn.allDay.filter((a) => !off.has(a.source)),
    }, {
      ctx,
      scroll,
      reload,
      // A NEW BLOCK HAS TO BE VISIBLE ONCE IT IS MADE. On a grid drawing only
      // logbooks — or one whose events chip the reader has just turned off —
      // drawing a meeting would save it into a week that then does not show it.
      canDraw: sources.includes("events") && !off.has("events") && !compact,
      filtered: off.size > 0,
      // THE GRID OPENS ON NOW ONCE, not on every repaint. A reader who turned
      // a source off has not asked to be scrolled back to this hour, and a
      // pane being resized has certainly not.
      //
      // AND NEVER WHEN COMPACT, because nothing scrolls: the whole day is on
      // screen. The flag is spent on the first paint that HAS a scroller, so a
      // reader who presses expand on a phone still arrives at this hour.
      scrollToNow: !opened && !compact,
      compact,
      ticker,
    });
    if (!compact) opened = true;
  };

  // WHAT AN EDIT DOES AFTERWARDS. A grid that wrote a file and then sat there
  // showing the old minute would be worse than one that could not write at all
  // — the reader would drag the block back. Nothing here listens to the vault:
  // the write happens in this pane and the re-read is asked for by the code
  // that did it, which is also what keeps a grid on a page nobody is looking at
  // from re-reading the whole week every time an unrelated note is saved.
  function reload(): void {
    void collect(plugin, sources, start, dates).then((got) => {
      status.remove();
      drawn = got;
      ready = true;
      render();
    });
  }

  sourceChips(bar, sources, off, () => {
    if (filterKey) {
      saveTimeGridFilters(plugin, filterKey, off);
    }
    render();
  });

  editControl(bar, expanded, (want) => {
    expanded = want;
    root.toggleClass("is-expanded", expanded);
    if (filterKey) saveTimeGridExpanded(plugin, filterKey, expanded);
    render();
  });

  // `CompactWatcher` STOOD HERE (1.0.18–1.0.25), a `ResizeObserver` on the root
  // that re-asked the stylesheet for `--ca-tg-compact` on every box change and
  // repainted when the answer had crossed the breakpoint. Nothing measures this
  // widget any more — see the block above `drawn` — so a resize changes what the
  // grid LOOKS like and never what it is, which is CSS's own job and needs no
  // observer at all.

  reload();

  return root;
}

// `CompactWatcher` STOOD HERE AND IS RETIRED (1.0.26).
//
// It was a `MarkdownRenderChild` holding a `ResizeObserver` over the grid's
// root, so that a pane dragged past 400px re-read `--ca-tg-compact` and
// repainted. Both halves of its reason for existing are gone: the stylesheet no
// longer decides whether the grid is compact — the reader does, at every width
// — and with no measurement there is nothing to observe. A resize now changes
// how the columns divide the width and nothing else, which is a question CSS
// answers on its own.
//
// The render-child shape it argued for is still right and still in use one class
// up: `NowTicker` owns a timer for the same reason this owned an observer — a
// homepage is opened and closed all day, and anything registered on the plugin
// goes on running against a node that has left the document.

export function loadTimeGridFilters(
  plugin: ChronoAnvilPlugin,
  key: string,
  sources: GridSource[]
): Set<GridSource> {
  const saved = plugin.settings.timeGridFilters?.[key];
  return resolveOffSources(saved, sources);
}

export function saveTimeGridFilters(
  plugin: ChronoAnvilPlugin,
  key: string,
  off: Set<GridSource>
): void {
  if (!plugin.settings.timeGridFilters) {
    plugin.settings.timeGridFilters = {};
  }
  const at = plugin.settings.timeGridFilters;
  if (off.size === 0) {
    if (!(key in at)) return;
    delete at[key];
  } else {
    at[key] = Array.from(off);
  }
  void plugin.saveSettings();
}

// Whether this grid was expanded out of its compact form, and where that is
// remembered.
//
// THE SAME KEY THE FILTER CHIPS USE, so one grid on one note has one identity
// in settings. Both are view state about the same block: what it draws, and how
// big. Two key shapes for one widget would be two things to migrate the day a
// note is renamed.
//
// A RECORD THAT ONLY EVER HOLDS `true`. The default is compact — at every
// width, as of 1.0.26 — so "not expanded" is the absence of a row rather than a
// stored `false`: the shape `saveTimeGridFilters` already uses for "nothing is
// turned off", and it keeps a vault that has never pressed the control out of
// the settings file.
//
// AND THE DEFAULT GOT WIDER WITHOUT THE RECORD CHANGING SHAPE, which is why
// there is no migration here. It used to mean "expanded out of the phone's
// compact form"; it means "opened for editing" now, and a reader who had pressed
// the control on a phone had asked for exactly that.
export function loadTimeGridExpanded(
  plugin: ChronoAnvilPlugin,
  key: string
): boolean {
  return plugin.settings.timeGridExpanded?.[key] === true;
}

export function saveTimeGridExpanded(
  plugin: ChronoAnvilPlugin,
  key: string,
  expanded: boolean
): void {
  if (!plugin.settings.timeGridExpanded) {
    plugin.settings.timeGridExpanded = {};
  }
  const at = plugin.settings.timeGridExpanded;
  if (expanded) {
    at[key] = true;
  } else {
    if (!(key in at)) return;
    delete at[key];
  }
  void plugin.saveSettings();
}

// The door into the week, and back out of it.
//
// ── IT WAS `expandControl`, AND THE RENAME IS THE ASK (1.0.26) ───────────
//
// It was drawn always and shown by CSS — `display: none` until the container
// query said otherwise — because a pane wide enough to draw the full grid had
// nothing to expand TO, and the bar is built before anything has been laid out
// so nothing here could know the width. The resting shape changed, not the
// order: a grid is compact at every width now, so the control exists at every
// width and CSS decides nothing about it.
//
// WHAT IT SAYS IS THE PART THAT HAD TO CHANGE. *"A toggle to go in and make
// edits and create events"* is what the reader calls this, and `Show the full
// grid` described the half of it a reader can see rather than the half they
// came for. The pixels and the gestures are one switch — a drag handle on a
// five-pixel block is a handle that moves the wrong meeting — so the label says
// the consequence and the icon is a pencil.
//
// AN ICON AND NOT A WORD, unchanged. Three source names are already in this
// corner and a fourth word would read as a fourth source.
const EDIT_ON = "Done — back to the compact week";
const EDIT_OFF = "Edit the week — full rows, drag to move, drag a column for a new event";

function editControl(
  bar: HTMLElement,
  expanded: boolean,
  onChange: (want: boolean) => void
): void {
  const btn = bar.createEl("button", {
    cls: `ca-tg-expand${expanded ? " is-on" : ""}`,
    attr: {
      type: "button",
      "aria-pressed": expanded ? "true" : "false",
      "aria-label": expanded ? EDIT_ON : EDIT_OFF,
      title: expanded ? EDIT_ON : EDIT_OFF,
    },
  });
  setIcon(btn, expanded ? "minimize-2" : "pencil");
  btn.addEventListener("click", () => {
    const want = !btn.hasClass("is-on");
    btn.toggleClass("is-on", want);
    btn.setAttribute("aria-pressed", want ? "true" : "false");
    const label = want ? EDIT_ON : EDIT_OFF;
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
    btn.empty();
    setIcon(btn, want ? "minimize-2" : "pencil");
    onChange(want);
  });
}

// The source list in the bar, as controls.
//
// DRAWN AS TOGGLES ONLY WHEN THERE IS SOMETHING TO CHOOSE. One source is not a
// choice, and a chip that empties the grid it is drawn on is a control that
// cannot do its job — the rule the capture box's destination picker follows.
// For the same reason the last one still on cannot be turned off.
function sourceChips(
  bar: HTMLElement,
  sources: GridSource[],
  off: Set<GridSource>,
  onChange: () => void
): void {
  if (sources.length < 2) {
    bar.createSpan({ cls: "ca-tg-sources", text: sources.join(" · ") });
    return;
  }
  const row = bar.createDiv({ cls: "ca-tg-sources" });
  for (const source of sources) {
    const isOff = off.has(source);
    const chip = row.createEl("button", {
      cls: `ca-tg-src ca-tg-src-${source}${isOff ? "" : " is-on"}`,
      text: source,
      attr: { type: "button", "aria-pressed": isOff ? "false" : "true" },
    });
    chip.addEventListener("click", () => {
      const on = !off.has(source);
      // The last one on stays on: turning it off would draw an empty grid and
      // say nothing was scheduled, which would not be true.
      if (on && off.size === sources.length - 1) return;
      if (on) off.add(source);
      else off.delete(source);
      chip.toggleClass("is-on", !off.has(source));
      chip.setAttribute("aria-pressed", off.has(source) ? "false" : "true");
      onChange();
    });
  }
}

// ── the now line ──────────────────────────────────────────────────────

// Minutes past midnight, right now.
//
// THROUGH `parseClock` RATHER THAN OFF THE MOMENT'S FIELDS, because `HH:mm` is
// the form every time in this plugin is stored and compared in — so the line
// and a 14:00 event are placed by one reading of what a time is.
function nowMinutes(): number {
  return parseClock(moment().format("HH:mm")) ?? 0;
}

// Keeps the line where the clock says, and takes it off the grid when the
// clock leaves the window.
//
// A RENDER CHILD RATHER THAN `plugin.registerInterval`, and that is the whole
// reason this is a class. A homepage is opened and closed all day; an interval
// registered on the plugin would outlive every one of those closes and go on
// moving an element that is no longer in a document. `ctx.addChild` ties the
// timer to the block, which is the lifetime it actually belongs to.
//
// ONE MINUTE, AND IT MOVES A CUSTOM PROPERTY. Nothing is re-read and nothing is
// repainted: the tick sets one number on the body and the stylesheet does the
// rest. The window itself is not recomputed, so a grid left open until the hour
// passes the foot of its window loses its line rather than growing — which is
// the same "nothing honest to draw" that `nowOffset` returns null for.
class NowTicker extends MarkdownRenderChild {
  constructor(
    private readonly body: HTMLElement,
    private readonly col: HTMLElement | null,
    private readonly win: GridWindow
  ) {
    super(body);
  }

  onload(): void {
    this.move();
    this.registerInterval(window.setInterval(() => this.move(), 60_000));
  }

  private move(): void {
    const at = nowOffset(this.win, nowMinutes());
    const line = this.body.querySelector(".ca-tg-now");
    const dot = this.col?.querySelector(".ca-tg-now-dot") ?? null;
    if (at == null) {
      line?.remove();
      dot?.remove();
      return;
    }
    this.body.style.setProperty("--ca-tg-at", String(at));
    if (!line) this.body.createDiv({ cls: "ca-tg-now" });
    if (!dot && this.col) this.col.createDiv({ cls: "ca-tg-now-dot" });
  }
}

// ── collecting ────────────────────────────────────────────────────────

interface Collected {
  items: GridItem[];
  allDay: AllDayItem[];
}

async function collect(
  plugin: ChronoAnvilPlugin,
  sources: GridSource[],
  start: string,
  dates: string[]
): Promise<Collected> {
  const items: GridItem[] = [];
  const allDay: AllDayItem[] = [];

  if (sources.includes("events")) fromEvents(plugin, dates, items, allDay);
  if (sources.includes("logbooks")) await fromLogbooks(plugin, start, items);
  if (sources.includes("tasks")) await fromTasks(plugin, dates, items, allDay);
  if (sources.includes("captures")) await fromCaptures(plugin, dates, items);

  return { items, allDay };
}

// Events falling within the week. Timed events go into the hourly grid;
// events without a specific time (all-day / one-off events) go into the all-day lane.
function fromEvents(
  plugin: ChronoAnvilPlugin,
  dates: string[],
  out: GridItem[],
  lane: AllDayItem[]
): void {
  const defs = readEvents(plugin.app, plugin);
  dates.forEach((iso, day) => {
    for (const def of eventsOnDay(defs, iso)) {
      const start = parseClock(def.time ?? null);
      const color = eventColor(def);
      const key = `event:${def.id}:${iso}`;
      if (start == null) {
        lane.push({
          source: "events",
          color,
          title: def.title,
          day,
          key,
        });
        continue;
      }
      out.push({
        source: "events",
        color,
        title: def.title,
        day,
        start,
        mins: def.duration ?? null,
        key,
      });
    }
  });
}

// Items from every region-backed logbook. The Meetings book is skipped, and
// skipping it is the point: `source: "events"` means its items ARE events, and
// they are already on the grid from `fromEvents`. Drawing it would put every
// meeting on the week twice.
async function fromLogbooks(
  plugin: ChronoAnvilPlugin,
  start: string,
  out: GridItem[]
): Promise<void> {
  const books = plugin.settings.logbooks.filter((b) => b.source === "region");
  for (const book of books) {
    const file = plugin.app.vault.getAbstractFileByPath(book.path);
    if (!(file instanceof TFile)) continue;
    const text = await plugin.app.vault.cachedRead(file);
    const region = readNoteRegion(text, LOGBOOK_NOTE_KEY);
    parseLogItems(region).forEach((item, index) => {
      // A LOGBOOK ITEM CARRIES ITS OWN DATE, which is the whole reason the log
      // grammar has one — a work log spans months. An item with no date is one
      // somebody typed by hand; it has no day and therefore no column.
      if (!item.date || !item.time) return;
      const day = dayIndex(start, item.date);
      if (day == null) return;
      const minutes = parseClock(item.time);
      if (minutes == null) return;
      out.push({
        source: "logbooks",
        color: book.color,
        // The first line, because a log item may be a paragraph and a block is
        // one line tall. The whole of it is in the block's tooltip.
        title: firstLine(item.text) || book.name,
        day,
        start: minutes,
        mins: item.mins,
        key: `logbook:${book.id}:${index}`,
      });
    });
  }
}

// Open tasks due inside the week. With an hour they are blocks; without one
// they are facts about a day and go in the lane.
async function fromTasks(
  plugin: ChronoAnvilPlugin,
  dates: string[],
  out: GridItem[],
  lane: AllDayItem[]
): Promise<void> {
  const files = filesUnder(plugin.app, "");
  const due = await readDueTasks(plugin.app, files, dates[0], dates[6]);
  for (const { file, task } of due) {
    const day = dates.indexOf(task.due ?? "");
    if (day < 0) continue;
    const key = `task:${file.path}:${task.text}`;
    const minutes = parseClock(task.at);
    if (minutes == null) {
      lane.push({
        source: "tasks",
        color: TASK_COLOR,
        title: task.text,
        day,
        key,
      });
      continue;
    }
    out.push({
      source: "tasks",
      color: TASK_COLOR,
      title: task.text,
      day,
      start: minutes,
      mins: null,
      key,
    });
  }
}

// Captures out of the week's daily entries. 4.62.
//
// THE DAY IS THE NOTE'S, WHICH IS WHY THIS READS SEVEN FILES RATHER THAN ONE
// REGION. A capture's stamp carries no date — `captureTo` says why — so the
// only thing that knows which day a capture belongs to is the entry it is in.
//
// AN ENTRY THAT DOES NOT EXIST IS A DAY WITH NO CAPTURES, and it stays that
// way: nothing here creates a note. A week viewed is a week read.
async function fromCaptures(
  plugin: ChronoAnvilPlugin,
  dates: string[],
  out: GridItem[]
): Promise<void> {
  for (const [day, iso] of dates.entries()) {
    const file = dayNoteOf(plugin, iso);
    if (!file) continue;
    const text = await plugin.app.vault.cachedRead(file);
    const region = readNoteRegion(text, CAPTURE_NOTE_KEY);
    parseLogItems(region).forEach((item, index) => {
      // A capture with no time is prose somebody typed into the region by hand.
      // It has no minute, so it has nowhere to sit on a clock.
      const minutes = parseClock(item.time);
      if (minutes == null) return;
      out.push({
        source: "captures",
        color: CAPTURE_COLOR,
        title: firstLine(item.text) || "capture",
        day,
        start: minutes,
        mins: item.mins,
        key: `capture:${iso}:${index}`,
      });
    });
  }
}

function firstLine(text: string): string {
  const line = text.split("\n").find((l) => l.trim() !== "");
  return line ? line.trim() : "";
}

// ── painting ──────────────────────────────────────────────────────────

// One repaint's worth of timer, handed back to the next.
interface TickerSlot {
  current: MarkdownRenderChild | null;
}

interface PaintOpts {
  ctx: MarkdownPostProcessorContext;
  scroll: HTMLElement;
  // Re-reads the week and repaints, after this pane has written to it.
  reload: () => void;
  // Whether a drag on empty space may draw a new event.
  canDraw: boolean;
  // Whether the reader has folded a source away, which changes what an empty
  // grid is allowed to say.
  filtered: boolean;
  scrollToNow: boolean;
  // Too narrow to be written on. The stylesheet decides; see `readCompact`.
  compact: boolean;
  // The one-minute timer, held across repaints so there is only ever one.
  ticker: TickerSlot;
}

function paint(
  plugin: ChronoAnvilPlugin,
  grid: HTMLElement,
  weekDatesAll: string[],
  cols: number[],
  drawn: Collected,
  opts: PaintOpts
): void {
  grid.empty();
  const { items, allDay } = drawn;
  // ONLY THE COLUMNS ON SCREEN. The week that was READ is still the whole week
  // — narrowing is a view, not a scope — so everything outside these columns is
  // dropped here rather than never collected.
  const dates = cols.map((i) => weekDatesAll[i]);
  const shown = items.filter((i) => cols.includes(i.day));
  const shownAllDay = allDay.filter((a) => cols.includes(a.day));
  const todayIso = moment().format("YYYY-MM-DD");
  // THE WINDOW HAS TO HOLD NOW, BUT ONLY WHEN NOW IS ON SCREEN. A March page
  // draws March's week and the current minute is not a fact about it; widening
  // that grid to reach today's hour would be padding a week with an hour from
  // another one.
  const showsToday = dates.includes(todayIso);
  const win = FULL_DAY_WINDOW;
  // How many day columns the three grid rows have. One number, set once, so the
  // heads, the lane and the body cannot disagree about how wide the grid is.
  grid.style.setProperty("--ca-tg-cols", String(cols.length));

  // The heads.
  const head = grid.createDiv({ cls: "ca-tg-head" });
  // NOT A TIMEZONE, WHICH IS WHAT SITS HERE ON EVERY OTHER WEEK GRID. ChronoAnvil
  // stores wall-clock strings — `EventDef.time` is `"14:00"`, not an instant —
  // so there is no zone to name and printing one would be drawing a feature the
  // plugin does not have. The week number is a fact it already computes.
  head.createDiv({ cls: "ca-tg-corner", text: `W${moment(dates[0]).isoWeek()}` });
  dates.forEach((iso) => {
    const cell = head.createDiv({
      cls: `ca-tg-day${iso === todayIso ? " is-today" : ""}`,
    });
    // A ONE-DAY GRID HAS ROOM TO SAY WEDNESDAY, a seven-day one says WED, and a
    // compact one says We. NOT ONE LETTER: `M T W T F S S` has two pairs in it
    // and asks the reader to count from Monday instead of reading. The date
    // number never abbreviates at any width — it is the part being pointed at.
    cell.createDiv({
      cls: "ca-tg-dow",
      text: moment(iso).format(
        cols.length === 1 ? "dddd" : opts.compact ? "dd" : "ddd"
      ),
    });
    cell.createDiv({ cls: "ca-tg-dnum", text: moment(iso).format("D") });
  });

  // The all-day lane. DRAWN EVEN WHEN EMPTY, so a task acquiring a due date
  // does not shift the whole grid down by a row the moment it arrives.
  const lane = grid.createDiv({ cls: "ca-tg-lane" });
  // ── THE GUTTER CELL IS A SPACER NOW, NOT A LABEL (1.0.27) ───────────
  //
  // It read "all day". The reader took the words off it — *"'all day' text can
  // be removed, as the row's colour is enough context for what it is."* — and
  // the two words had been losing to the gutter since they were written: they
  // wrapped at 24px, were given a second line for it in 1.0.19, and at 30px
  // still put `day` against the `12a` mark.
  //
  // THE ELEMENT STAYS BECAUSE IT IS THE LANE'S FIRST COLUMN. `grid-template-
  // columns` starts with the gutter, and a lane missing that cell slides every
  // day one column left.
  //
  // AND THE WORDS GO WHERE THEY COST NOTHING. A tint is enough context for a
  // reader looking at it and is no context at all for a reader who cannot see
  // it, so the row keeps its name in the two places that are free: a tooltip
  // for a pointer, and `aria-label` for anything reading the tree.
  lane.createDiv({
    cls: "ca-tg-lane-label",
    attr: { title: "All day", "aria-label": "All day" },
  });
  cols.forEach((day) => {
    const cell = lane.createDiv({ cls: "ca-tg-lane-cell" });
    const mine = shownAllDay.filter((a) => a.day === day);

    // THE LANE COUNTS TOO, AND FOR A HARDER REASON THAN THE BODY'S: a block
    // that is too short can be grown downward and a chip cannot. Four tasks due
    // on a Thursday share one 45px cell however tall the grid is, so they share
    // one chip instead, and it says `4`. `tallyAllDay` has the rest of it.
    if (opts.compact) {
      for (const tally of tallyAllDay(mine)) {
        const chip = cell.createDiv({
          cls: `ca-tg-chip ca-tg-fill-${tally.color}`,
        });
        if (tally.items.length === 1) {
          const only = tally.items[0];
          // ITS OWN SPAN FOR `drawBox`'s REASON ONE SCREEN DOWN: the name is
          // drawn and the stylesheet decides whether the column is wide enough
          // to hold it. A chip is the same 45px on a phone as a block is.
          chip.createSpan({ cls: "ca-tg-chip-title", text: only.title });
          chip.setAttribute("title", laneTitle(only));
          wire(plugin, chip, only.key);
          continue;
        }
        const entries = tally.items.map((item) => ({
          key: item.key,
          label: laneTitle(item),
        }));
        chip.createSpan({
          cls: "ca-tg-count",
          text: String(entries.length),
        });
        chip.setAttribute("title", stackTitle(entries));
        wireStack(plugin, chip, entries);
      }
      return;
    }

    for (const item of mine) {
      const chip = cell.createDiv({
        cls: `ca-tg-chip ca-tg-fill-${item.color}`,
        text: item.title,
      });
      chip.setAttribute("title", laneTitle(item));
      wire(plugin, chip, item.key);
    }
  });

  // The rail and the columns.
  const body = grid.createDiv({ cls: "ca-tg-body" });
  const rail = body.createDiv({ cls: "ca-tg-rail" });
  const hours = win.endHour - win.startHour;
  // SET ONCE, ON THE BODY, AND INHERITED BY THE COLUMNS. The body's height is
  // `--ca-tg-row * --ca-tg-hours` and each column's hour lines are
  // `100% / --ca-tg-hours`, so the two now read one number rather than two
  // copies of it — which is the failure the stylesheet's own header warns
  // about ("a grid comes to draw its lines an hour out from its blocks").
  body.style.setProperty("--ca-tg-hours", String(hours));
  // EVERY THIRD HOUR IN A 24px GUTTER, AND THE WORD SHRINKS WITH IT. Twenty-five
  // marks down 360px is one every fifteen pixels; they would overlap before the
  // first was read. Which marks and what they say are both in `time-grid.ts`,
  // because both are arithmetic about a window and neither needs a vault.
  for (const h of railHours(win, opts.compact ? COMPACT_RAIL_STEP : 1)) {
    const mark = rail.createDiv({
      cls: "ca-tg-hour",
      text: opts.compact
        ? shortHourLabel(h)
        : moment().startOf("day").add(h, "hours").format("h A"),
    });
    mark.style.top = `${((h - win.startHour) / hours) * 100}%`;
  }

  let todayCol: HTMLElement | null = null;
  // What the gesture layer needs to turn a pointer back into a day and a
  // block back into the thing it was drawn from. Built here rather than looked
  // up later because this loop is the only place that knows both.
  const columns: GridColumn[] = [];
  const blocks = new Map<HTMLElement, GridItem>();
  cols.forEach((day) => {
    const iso = weekDatesAll[day];
    const col = body.createDiv({
      cls: `ca-tg-col${iso === todayIso ? " is-today" : ""}`,
    });
    columns.push({ el: col, day, iso });
    if (iso === todayIso) todayCol = col;

    const mine = shown.filter((i) => i.day === day);

    // A COMPACT COLUMN IS DRAWN IN BOXES, NOT IN BARS — `boxDay` says why. What
    // the view adds is that everything in the loop below belongs to a block big
    // enough to hold it: a title, a span, a resize handle, and an entry in the
    // map the gesture layer reads. A box is none of those things. It is a
    // colour, a number and a press.
    if (opts.compact) {
      for (const box of packBoxes(boxDay(mine, COMPACT_MIN_MINUTES))) {
        drawBox(plugin, col, box, win);
      }
      return;
    }

    for (const placed of packDay(mine)) {
      const { top, height } = placeInWindow(placed, win);
      const moment_ = placed.mins == null;
      const block = col.createDiv({
        cls:
          `ca-tg-blk ca-tg-fill-${placed.color}` +
          (moment_ ? " is-moment" : ""),
      });
      block.style.top = `${top * 100}%`;
      block.style.height = `${height * 100}%`;
      const width = 100 / placed.cols;
      block.style.left = `calc(${placed.col * width}% + 2px)`;
      block.style.width = `calc(${width}% - 4px)`;
      block.createSpan({ cls: "ca-tg-blk-title", text: placed.title });
      if (!moment_) {
        block.createSpan({ cls: "ca-tg-blk-when", text: describeWhen(placed) });
      }
      // A TASK IS DRAWN AND NOT DRAGGED, and the tooltip says why on the spot.
      // Its hour lives on a checkbox line in whatever note it belongs to, and a
      // grid that rewrote task lines in notes it has never opened is a much
      // larger claim than one that rewrites the two stores it was built on.
      const fixed = placed.source === "tasks";
      if (fixed) block.addClass("is-fixed");
      block.setAttribute(
        "title",
        `${placed.title} — ${describeWhen(placed)}${
          fixed ? " · due in its own note" : ""
        }`
      );
      if (!fixed) {
        blocks.set(block, placed);
        // The handle is the bottom edge, and only a span has one: a moment has
        // no length to pull on. Drawn as an element rather than as a hit zone
        // on the block so `closest` can tell the two gestures apart without
        // measuring anything.
        //
        if (!moment_) block.createDiv({ cls: "ca-tg-grip" });
      }
      wire(plugin, block, placed.key);
    }
  });

  if (!shown.length && !shownAllDay.length) {
    // WHAT AN EMPTY GRID IS ALLOWED TO SAY DEPENDS ON WHY IT IS EMPTY. With a
    // source folded away, "nothing scheduled" would be a claim about the week
    // that the reader's own chip has made untrue.
    // INSIDE THE ELEMENT `paint` EMPTIES. It used to be appended two levels up,
    // on the root — which `paint` does not clear — so an empty week grew one
    // more of these every time a source chip was pressed.
    grid.createDiv({
      cls: "ca-tg-empty",
      text: opts.filtered
        ? "Nothing here from the sources you have switched on."
        : "Nothing scheduled this week. An event with a time, a logbook item, or a task with a due date shows here.",
    });
  }

  // The week, made writable — ON A GRID WITH ROOM FOR THE GESTURES.
  //
  // A quarter-hour is five pixels tall at the compact row height, and the boxes
  // drawn over it are floored to forty-five minutes whatever they hold. Every
  // one of the three gestures is a claim about a minute the reader pointed at,
  // and neither number lets a finger point at one: a drag meant to move Tuesday
  // 09:30 would as easily move the thing above it, and a resize would pull the
  // foot of a box that is showing a floor rather than an end. So the grid below the
  // breakpoint takes no gesture at all except the press that opens, which is
  // `wire()` and needs no accuracy in time.
  //
  // CSS SAYS THE SAME THING IN CURSORS, one file over, and it has to — an
  // affordance drawn for a gesture that is not wired is a promise the grid
  // cannot keep.
  if (!opts.compact) {
    wireGestures({
      plugin,
      win,
      body,
      columns,
      blocks,
      datesAll: weekDatesAll,
      canDraw: opts.canDraw,
      reload: opts.reload,
    });
  }

  // The block the keyboard was on, back under the focus ring after the repaint
  // its own edit caused.
  if (pendingFocus) {
    const back = grid.querySelector(
      `.ca-tg-blk[data-focus="${CSS.escape(pendingFocus)}"]`
    );
    pendingFocus = null;
    if (back instanceof HTMLElement) back.focus();
  }

  // The line, and the timer that keeps it honest. Only on the week that holds
  // today: on any other week there is no minute of it to draw.
  //
  // THE PREVIOUS ONE IS PUT DOWN FIRST. `paint` rebuilds the body on every
  // repaint and this used to register a ticker each time, so four presses of a
  // source chip left four one-minute timers running — three of them moving a
  // line on a body that had been thrown away.
  opts.ticker.current?.unload();
  opts.ticker.current = null;
  if (showsToday) {
    const ticker = new NowTicker(body, todayCol, win);
    opts.ticker.current = ticker;
    opts.ctx.addChild(ticker);
  }

  if (opts.scrollToNow) {
    openOn(
      opts.scroll,
      body,
      showsToday ? nowOffset(win, nowMinutes()) : null,
      win,
      todayCol
    );
  }
}

// Where the grid opens.
//
// ON THE LINE WHEN THERE IS ONE, a third of the way down rather than at the
// top, so the next hour is on screen with the last one still visible. On any
// other week, on the earliest thing that week holds — a March page scrolled to
// 8 AM when its only meeting is at four in the afternoon is a grid a reader has
// to search. With neither, at the top, which is where it already was.
//
// ONCE, AT FIRST PAINT, AND NEVER AGAIN. A grid that pulled itself back to now
// every minute would fight a reader reading their own morning.
function openOn(
  scroll: HTMLElement,
  body: HTMLElement,
  at: number | null,
  win: GridWindow,
  todayCol?: HTMLElement | null
): void {
  const defaultFrac = (DEFAULT_OPEN_HOUR - win.startHour) / (win.endHour - win.startHour);
  const target = at ?? defaultFrac;
  if (target == null) return;
  // After layout, because none of these boxes has a height until the browser
  // has been round once.
  window.requestAnimationFrame(() => {
    const span = body.offsetHeight;
    if (span && scroll.scrollHeight > scroll.clientHeight) {
      const offset =
        at != null
          ? target * span - scroll.clientHeight / 3
          : target * span;
      scroll.scrollTop = Math.max(0, body.offsetTop + offset);
    }
    if (todayCol && scroll.scrollWidth > scroll.clientWidth) {
      const left = todayCol.offsetLeft - 60;
      scroll.scrollLeft = Math.max(0, left);
    }
  });
}

// ── the grid as somewhere to write (4.62) ────────────────────────────
//
// WHY THIS IS A GRID AND NOT A PICTURE OF ONE. Every other calendar in ChronoAnvil
// is a report: the month grid draws what the notes say and sends you to a note
// to change it. That is the right shape for a month, where the unit is a day
// and the day already has a page. It is the wrong shape for an hour. Moving a
// meeting half an hour later meant opening an editor, finding the time field,
// typing four characters and closing it — for a fact the reader could point at.
//
// WHAT MAY BE DRAGGED, AND WHY THE LIST IS SHORT. Events and logbook items are
// stores this plugin owns end to end: an event is a frontmatter record in the
// events note, a logbook item is a stamp line in a region this file's own
// parser wrote. A task is a checkbox on a line in somebody's note, put there by
// them or by another plugin, and a grid that rewrote those would be editing
// files it has never been given. So tasks draw and do not move.
//
// WHAT A GESTURE COMMITS. A move and a resize write immediately, because the
// gesture IS the decision and a dialog after it would ask the reader to confirm
// what they just did. Drawing a new block opens the editor instead: a block on
// an empty Thursday has no title, and an event called "Untitled" saved to a
// file is worse than a form.
//
// STALE INDEXES ARE CHECKED AT THE MOMENT OF WRITING, not trusted from paint.
// The grid may have been drawn a minute ago and the note edited since, and a
// logbook item's identity here is its POSITION in the region — see `applyLog`.

interface GridColumn {
  el: HTMLElement;
  // Index into the week's seven dates, not into the columns on screen.
  day: number;
  iso: string;
}

interface EditCtx {
  plugin: ChronoAnvilPlugin;
  win: GridWindow;
  body: HTMLElement;
  columns: GridColumn[];
  // Only the blocks that may be dragged; a task is drawn and left out.
  blocks: Map<HTMLElement, GridItem>;
  datesAll: string[];
  // Whether a drag on empty space may make an event — false when the grid is
  // not drawing events at all, since the new block would be invisible.
  canDraw: boolean;
  reload: () => void;
}

type DragMode = "draw" | "move" | "resize";

// How far the pointer has to travel before this is a drag and not a click. Four
// pixels is about two minutes on the rail — below the snap, so nothing that
// counts as a drag can fail to change anything.
const DRAG_SLOP_PX = 4;
const TOUCH_LONG_PRESS_MS = 350;
const TOUCH_SLOP_PX = 10;

// Which block to put the focus back on after a repaint, when the edit came from
// the keyboard. A repaint rebuilds every element, so the focused block is gone
// by the time the write lands; without this, arrowing a meeting down an hour
// would mean four presses and three trips back to it with Tab.
//
// KEYED ON THE THING, NOT THE OCCURRENCE — an event's key carries the date it
// was drawn on and the date is what the move changed.
let pendingFocus: string | null = null;

function focusKeyOf(key: string): string {
  const parts = key.split(":");
  return parts[0] === "event" ? parts.slice(0, 2).join(":") : key;
}

// Where the pointer is, down the window, as the fraction `minuteAt` reads.
function fractionAt(edit: EditCtx, clientY: number): number {
  const box = edit.body.getBoundingClientRect();
  return box.height ? (clientY - box.top) / box.height : 0;
}

// Which column the pointer is over. Past either end it is the end column: a
// drag that leaves the grid sideways has not asked for a day off screen.
function columnAt(edit: EditCtx, clientX: number): GridColumn | null {
  if (!edit.columns.length) return null;
  for (const col of edit.columns) {
    if (clientX < col.el.getBoundingClientRect().right) return col;
  }
  return edit.columns[edit.columns.length - 1];
}

interface Preview {
  day: number;
  start: number;
  mins: number | null;
}

// The block as it will be, drawn under the pointer while the drag is live.
//
// A SEPARATE ELEMENT RATHER THAN THE BLOCK ITSELF MOVING. The block stays where
// the file says it is until the file says something else, so a drag abandoned
// mid-gesture leaves a grid that still agrees with the note — and the two being
// on screen together is what tells the reader how far they have moved it.
function drawGhost(edit: EditCtx, ghost: HTMLElement, at: Preview): void {
  const col = edit.columns.find((c) => c.day === at.day);
  if (!col) return;
  if (ghost.parentElement !== col.el) col.el.appendChild(ghost);
  const winStart = edit.win.startHour * 60;
  const span = (edit.win.endHour - edit.win.startHour) * 60;
  const top = Math.max(0, Math.min(1, (at.start - winStart) / span));
  const end = Math.max(0, Math.min(1, (at.start + (at.mins ?? 0) - winStart) / span));
  ghost.style.top = `${top * 100}%`;
  ghost.style.height = `${Math.max(0, end - top) * 100}%`;
  ghost.setText(
    at.mins == null
      ? formatClock(at.start)
      : `${formatClock(at.start)}–${formatClock(at.start + at.mins)}`
  );
}

function wireGestures(edit: EditCtx): void {
  const { body } = edit;
  // Set by a real drag and read by the click that follows it, so letting go of
  // a block you have just moved does not also open its editor.
  let dragged = false;

  body.addEventListener("pointerdown", (evt: PointerEvent) => {
    if (evt.button !== 0) return;
    const isTouch = evt.pointerType === "touch";
    dragged = false;
    const target = evt.target as HTMLElement | null;
    if (!target) return;

    const blockEl = target.closest(".ca-tg-blk") as HTMLElement | null;
    const item = blockEl ? edit.blocks.get(blockEl) ?? null : null;
    // A block this pane will not move — a task. Its click still opens the note.
    if (blockEl && !item) return;
    const mode: DragMode = !item
      ? "draw"
      : target.closest(".ca-tg-grip")
        ? "resize"
        : "move";
    // A DRAW STARTS IN A COLUMN. The hour rail is inside the body and is not a
    // day; a press on "2 PM" is a reader reading the rail, not booking it.
    if (mode === "draw" && (!edit.canDraw || !target.closest(".ca-tg-col"))) return;

    const startCol = columnAt(edit, evt.clientX);
    if (!startCol) return;
    const from = minuteAt(edit.win, fractionAt(edit, evt.clientY));
    const downX = evt.clientX;
    const downY = evt.clientY;
    const scrollEl = body.closest(".ca-tg-scroll") as HTMLElement | null;

    let ghost: HTMLElement | null = null;
    let started = false;
    let preview: Preview | null = null;
    let longPressTimer: number | null = null;
    let isPointerCaptured = false;
    let lastClientY = downY;

    const startDrag = (initialClientY: number): void => {
      started = true;
      dragged = true;
      if (scrollEl) {
        scrollEl.addClass("is-locked");
        scrollEl.style.overflow = "hidden";
      }
      if (!isTouch) {
        try {
          body.setPointerCapture(evt.pointerId);
          isPointerCaptured = true;
        } catch {
          // ignore pointer capture error
        }
      }
      body.addClass("is-dragging");
      blockEl?.addClass("is-moving");
      ghost = createDiv({ cls: `ca-tg-ghost is-${mode}` });
      const initialTo = minuteAt(edit.win, fractionAt(edit, initialClientY));
      if (mode === "draw") {
        const span = spanFromDrag(from, initialTo);
        preview = { day: startCol.day, start: span.start, mins: span.mins };
      } else if (mode === "resize" && item) {
        preview = {
          day: item.day,
          start: item.start,
          mins: Math.max(SNAP_MINUTES, initialTo - item.start),
        };
      } else if (item) {
        preview = { day: startCol.day, start: item.start, mins: item.mins };
      }
      if (preview && ghost) drawGhost(edit, ghost, preview);
    };

    const advanceAt = (clientX: number, clientY: number): void => {
      lastClientY = clientY;
      const to = minuteAt(edit.win, fractionAt(edit, clientY));
      if (mode === "draw") {
        const span = spanFromDrag(from, to);
        preview = { day: startCol.day, start: span.start, mins: span.mins };
      } else if (mode === "resize" && item) {
        preview = {
          day: item.day,
          start: item.start,
          mins: Math.max(SNAP_MINUTES, to - item.start),
        };
      } else if (item) {
        const col = columnAt(edit, clientX) ?? startCol;
        // SNAPPED AFTER THE OFFSET IS APPLIED, so a block that was hand-written
        // at 09:07 lands on the quarter hour rather than carrying its seven
        // minutes around the week for ever.
        const raw = item.start + (to - from);
        const start = Math.max(
          0,
          Math.min(
            1440 - (item.mins ?? 0),
            Math.round(raw / SNAP_MINUTES) * SNAP_MINUTES
          )
        );
        preview = { day: col.day, start, mins: item.mins };
      }
      if (preview && ghost) drawGhost(edit, ghost, preview);
    };

    const onMove = (e: PointerEvent): void => {
      const dx = Math.abs(e.clientX - downX);
      const dy = Math.abs(e.clientY - downY);

      if (isTouch && !started) {
        // If the finger moves beyond slop before long-press fires, cancel timer -> normal scroll
        if (dx > TOUCH_SLOP_PX || dy > TOUCH_SLOP_PX) {
          if (longPressTimer !== null) {
            window.clearTimeout(longPressTimer);
            longPressTimer = null;
          }
        }
        return;
      }

      if (!isTouch && !started) {
        if (dx < DRAG_SLOP_PX && dy < DRAG_SLOP_PX) return;
        startDrag(e.clientY);
      }

      if (started) {
        advanceAt(e.clientX, e.clientY);
      }
    };

    const onTouchMove = (e: TouchEvent): void => {
      if (!isTouch) return;
      if (started) {
        if (e.cancelable) e.preventDefault();
        if (e.touches.length > 0) {
          advanceAt(e.touches[0].clientX, e.touches[0].clientY);
        }
      } else if (e.touches.length > 0) {
        const dx = Math.abs(e.touches[0].clientX - downX);
        const dy = Math.abs(e.touches[0].clientY - downY);
        if (dx > TOUCH_SLOP_PX || dy > TOUCH_SLOP_PX) {
          if (longPressTimer !== null) {
            window.clearTimeout(longPressTimer);
            longPressTimer = null;
          }
        }
      }
    };

    const finish = (): void => {
      if (longPressTimer !== null) {
        window.clearTimeout(longPressTimer);
        longPressTimer = null;
      }
      if (scrollEl) {
        scrollEl.removeClass("is-locked");
        scrollEl.style.overflow = "";
      }
      body.removeEventListener("pointermove", onMove);
      body.removeEventListener("pointerup", onUp);
      body.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onCancel);
      if (isPointerCaptured) {
        try {
          body.releasePointerCapture(evt.pointerId);
        } catch {
          // ignore pointer release error
        }
        isPointerCaptured = false;
      }
      body.removeClass("is-dragging");
      blockEl?.removeClass("is-moving");
      ghost?.remove();
      ghost = null;
      started = false;
    };

    const onCancel = (): void => finish();

    const commitGesture = (finalClientY: number, wasStarted: boolean, currentPreview: Preview | null): void => {
      finish();

      if (mode === "draw") {
        if (isTouch) {
          // On mobile touch: an event is created only if long-tap triggered drag-mode
          if (wasStarted) {
            const to = minuteAt(edit.win, fractionAt(edit, finalClientY));
            openDraft(edit, startCol, spanFromDrag(from, to));
          }
          return;
        }
        // On desktop mouse:
        const to = wasStarted ? minuteAt(edit.win, fractionAt(edit, finalClientY)) : from;
        openDraft(edit, startCol, spanFromDrag(from, to));
        return;
      }

      if (!wasStarted || !item || !currentPreview) return;
      const next =
        mode === "resize"
          ? resizedTo(item, currentPreview.start + (currentPreview.mins ?? 0))
          : movedTo(item, { day: currentPreview.day, start: currentPreview.start });
      if (!next) return;
      void applyEdit(edit, item, next);
    };

    const onUp = (e: PointerEvent): void => {
      if (isTouch && started) return; // handled via touchend
      commitGesture(e.clientY, started, preview);
    };

    const onTouchEnd = (e: TouchEvent): void => {
      const finalY = e.changedTouches.length > 0 ? e.changedTouches[0].clientY : lastClientY;
      commitGesture(finalY, started, preview);
    };

    if (isTouch) {
      longPressTimer = window.setTimeout(() => {
        longPressTimer = null;
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try {
            navigator.vibrate(25);
          } catch {
            // ignore vibration error
          }
        }
        startDrag(downY);
      }, TOUCH_LONG_PRESS_MS);
      window.addEventListener("touchmove", onTouchMove, { passive: false });
      window.addEventListener("touchend", onTouchEnd);
      window.addEventListener("touchcancel", onCancel);
    } else {
      try {
        body.setPointerCapture(evt.pointerId);
        isPointerCaptured = true;
      } catch {
        // ignore pointer capture error
      }
    }

    body.addEventListener("pointermove", onMove);
    body.addEventListener("pointerup", onUp);
    body.addEventListener("pointercancel", onCancel);
  });

  body.addEventListener(
    "click",
    (evt) => {
      if (!dragged) return;
      evt.preventDefault();
      evt.stopPropagation();
      dragged = false;
    },
    true
  );

  for (const [el, item] of edit.blocks) wireKeys(edit, el, item);
}

// The same three edits without a pointer.
//
// NOT AN ACCESSIBILITY FOOTNOTE — the arrows are the accurate way to do this.
// A drag lands on the quarter hour a pointer happened to be over; four presses
// of Down move a meeting exactly an hour, and a reader who knows the block is
// half an hour late does not want to aim at anything.
// The ARROWS only. Enter and Space moved to `wire`, which is the half of this
// that is still there when the grid is compact: a bar that can be clicked open
// and not opened from the keyboard is a bar half the readers cannot reach, and
// `wireKeys` is not called below the breakpoint because its arrows all edit.
function wireKeys(edit: EditCtx, el: HTMLElement, item: GridItem): void {
  el.setAttribute("data-focus", focusKeyOf(item.key));
  el.addEventListener("keydown", (evt: KeyboardEvent) => {
    if (evt.altKey || evt.ctrlKey || evt.metaKey) return;
    let next: GridItem | null = null;

    if (evt.key === "ArrowUp" || evt.key === "ArrowDown") {
      const dir = evt.key === "ArrowUp" ? -1 : 1;
      // SHIFT RESIZES, which is the pairing every timeline editor uses and the
      // one a reader will try first.
      next = evt.shiftKey
        ? resizedTo(item, item.start + (item.mins ?? 0) + dir * SNAP_MINUTES)
        : movedTo(item, { day: item.day, start: item.start + dir * SNAP_MINUTES });
    } else if (evt.key === "ArrowLeft" || evt.key === "ArrowRight") {
      const day = item.day + (evt.key === "ArrowLeft" ? -1 : 1);
      // Only onto a day that is on screen: a one-day grid has nowhere to move
      // sideways to, and the week's edges are the week's edges.
      if (!edit.columns.some((c) => c.day === day)) return;
      next = movedTo(item, { day, start: item.start });
    } else {
      return;
    }

    evt.preventDefault();
    if (!next) return;
    pendingFocus = focusKeyOf(item.key);
    void applyEdit(edit, item, next);
  });
}

// A drag on empty space, as a new event.
//
// THE EDITOR OPENS SEEDED AND NOTHING IS WRITTEN UNTIL IT IS SAVED. The day,
// the hour and the length are the three fields the gesture actually said; the
// title is the one it could not, and it is the field the form opens on.
function openDraft(
  edit: EditCtx,
  col: GridColumn,
  span: { start: number; mins: number }
): void {
  const def = draftEvent(col.iso);
  def.time = formatClock(span.start);
  def.duration = span.mins;
  openEventEditor(edit.plugin.app, edit.plugin, def, (changed) => {
    if (changed) edit.reload();
  });
}

// A moved or resized block, written back to whatever it came from.
async function applyEdit(
  edit: EditCtx,
  item: GridItem,
  next: GridItem
): Promise<void> {
  const kind = item.key.split(":")[0];
  if (kind === "event") await applyEvent(edit, item, next);
  else if (kind === "logbook") await applyLog(edit, item, next);
  else if (kind === "capture") await applyCapture(edit, item, next);
}

async function applyEvent(
  edit: EditCtx,
  item: GridItem,
  next: GridItem
): Promise<void> {
  const { plugin } = edit;
  const id = item.key.split(":")[1];
  const def = readEvents(plugin.app, plugin).find((d: EventDef) => d.id === id);
  if (!def) {
    new Notice("That event is no longer in the events note.");
    edit.reload();
    return;
  }

  const updated: EventDef = { ...def, time: formatClock(next.start) };
  if (next.mins != null) updated.duration = next.mins;

  if (next.day !== item.day) {
    const iso = edit.datesAll[next.day];
    // WHICH EVENTS MAY NOT CHANGE DAY, and both refusals are about what the
    // dragged block actually IS. A recurring event's block is one occurrence of
    // a rule, and dropping it on Thursday would silently move every year of it;
    // a multi-day event draws a block on each of its days, and there is no way
    // to tell which end of the span the reader meant to take with them.
    if (def.kind === "recurring") {
      new Notice("A recurring event keeps its date. Edit it to move the whole series.");
    } else if (def.end && def.end !== def.start) {
      new Notice("This event runs over several days. Open it to change its dates.");
    } else if (iso) {
      updated.start = iso;
    }
  }

  await saveEvent(plugin.app, plugin, updated);
  edit.reload();
}

async function applyLog(
  edit: EditCtx,
  item: GridItem,
  next: GridItem
): Promise<void> {
  const { plugin } = edit;
  const [, bookId, indexRaw] = item.key.split(":");
  const book = plugin.settings.logbooks.find((b: LogbookDef) => b.id === bookId);
  const file = book ? getFile(plugin.app, book.path) : null;
  if (!file) {
    new Notice("That logbook's note has moved.");
    edit.reload();
    return;
  }

  await rewriteStamp(edit, {
    file,
    regionKey: LOGBOOK_NOTE_KEY,
    index: Number(indexRaw),
    // A LOGBOOK ITEM MAY CHANGE DAY, because the day is a field on the line and
    // the note it lives in spans months either way.
    wasDate: edit.datesAll[item.day] ?? null,
    toDate: edit.datesAll[next.day] ?? null,
    item,
    next,
  });
}

async function applyCapture(
  edit: EditCtx,
  item: GridItem,
  next: GridItem
): Promise<void> {
  const [, iso, indexRaw] = item.key.split(":");
  const file = dayNoteOf(edit.plugin, iso);
  if (!file) {
    new Notice("That entry is no longer there.");
    edit.reload();
    return;
  }

  // A CAPTURE'S DAY IS ITS NOTE, so dragging one sideways would mean cutting a
  // line out of Tuesday's entry and appending it to Thursday's — two writes to
  // two files, and the record of when the thought actually arrived rewritten on
  // the way. The hour is the capture's own field and moves freely; the day is
  // the entry's, and it is the entry that says so.
  if (next.day !== item.day) {
    new Notice("A capture belongs to its entry. Move the text to change its day.");
    edit.reload();
    return;
  }

  await rewriteStamp(edit, {
    file,
    regionKey: CAPTURE_NOTE_KEY,
    index: Number(indexRaw),
    // Null at both ends: a capture's stamp carries no date, and writing one
    // would say the entry's own name back to it on every line.
    wasDate: null,
    toDate: null,
    item,
    next,
  });
}

// One stamped line in one region, rewritten in place.
//
// THE GUARD, AND WHY IT IS COMPARED RATHER THAN ASSUMED. Neither a logbook item
// nor a capture has an id: its identity on this grid is its POSITION in the
// region, and a capture arriving or an item deleted while the grid sat open
// shifts every position after it. So the item still at that index has to be the
// one that was drawn — same day, same minute, same length — or nothing is
// written and the reader is told. Comparing the PARSED minute rather than the
// string keeps a hand-written `9:05` from reading as a different item than the
// `09:05` that was drawn.
async function rewriteStamp(
  edit: EditCtx,
  opts: {
    file: TFile;
    regionKey: string;
    index: number;
    wasDate: string | null;
    toDate: string | null;
    item: GridItem;
    next: GridItem;
  }
): Promise<void> {
  const { item, next } = opts;
  let stale = false;

  await edit.plugin.app.vault.process(opts.file, (text) => {
    const region = readNoteRegion(text, opts.regionKey);
    const items = parseLogItems(region);
    const found: LogItem | undefined = items[opts.index];
    if (
      !found ||
      (found.date ?? null) !== opts.wasDate ||
      parseClock(found.time) !== item.start ||
      (found.mins ?? null) !== item.mins
    ) {
      stale = true;
      return text;
    }
    items[opts.index] = {
      ...found,
      date: opts.toDate,
      time: formatClock(next.start),
      mins: next.mins,
    };
    return writeNoteRegion(text, opts.regionKey, serializeLogItems(items));
  });

  if (stale) {
    new Notice("That line has changed since the grid was drawn. Nothing was written.");
  }
  edit.reload();
}

// Opening a block or chip opens what it came from (event editor or source note).
//
// CLICK / RIGHT-CLICK / LONG-TAP OPENS, DRAG EDITS. Right-click or long-tap
// provides a dedicated, reliable gesture to edit or inspect an item without
// conflicting with drag-to-move or drag-to-resize.
function openTimeGridItem(plugin: ChronoAnvilPlugin, key: string): void {
  const [kind, ...rest] = key.split(":");
  if (kind === "event") {
    const def = readEvents(plugin.app, plugin).find(
      (d: EventDef) => d.id === rest[0]
    );
    if (def) openEventEditor(plugin.app, plugin, def);
    return;
  }
  if (kind === "logbook") {
    const book = plugin.settings.logbooks.find(
      (b: LogbookDef) => b.id === rest[0]
    );
    const note = book ? getFile(plugin.app, book.path) : null;
    if (note) void openFile(plugin.app, note);
    return;
  }
  if (kind === "capture") {
    const note = dayNoteOf(plugin, rest[0]);
    if (note) void openFile(plugin.app, note);
    return;
  }
  if (kind === "task") {
    // The path is everything up to the last colon-separated piece, because a
    // task's own text may contain a colon and the path may not contain the
    // separator this key was built with in any other position.
    const note = getFile(plugin.app, rest.slice(0, -1).join(":"));
    if (note) void openFile(plugin.app, note);
  }
}

// ── the compact grid's boxes (1.0.18) ────────────────────────────────

// What a lane chip says about itself, at either width. A task with no hour is
// a different fact from an event with no hour, and the tooltip is the only
// place a compact lane can say which.
function laneTitle(item: AllDayItem): string {
  return item.source === "tasks"
    ? `${item.title} — due, no time`
    : `${item.title} — all day`;
}

// One thing inside a box, reduced to what a menu row and a tooltip line need.
interface StackEntry {
  key: string;
  label: string;
}

function stackTitle(entries: StackEntry[]): string {
  return [
    `${entries.length} here — press to choose`,
    ...entries.map((entry) => entry.label),
  ].join("\n");
}

// One box on a compact grid: a fill, a number when it stands for more than one
// thing, and a press that opens what is inside it.
function drawBox(
  plugin: ChronoAnvilPlugin,
  col: HTMLElement,
  box: PlacedBox,
  win: GridWindow
): void {
  const lead = box.items[0];
  const alone = box.items.length === 1;
  // A MOMENT KEEPS ITS FLAT FOOT, BUT ONLY WHILE THE BOX IS ONE MOMENT. Two
  // things in a box have minutes between them, and a rule under it reading
  // "this took no time" would be a claim about a box that is mostly somebody
  // else's afternoon.
  const el = col.createDiv({
    cls:
      `ca-tg-blk ca-tg-fill-${box.color}` +
      (alone && lead.mins == null ? " is-moment" : ""),
  });
  const { top, height } = placeSpan(box.start, box.end, win);
  el.style.top = `${top * 100}%`;
  el.style.height = `${height * 100}%`;
  const width = 100 / box.cols;
  el.style.left = `calc(${box.col * width}% + 2px)`;
  el.style.width = `calc(${width}% - 4px)`;

  // THE COUNT IS THE ONLY NUMBER A COMPACT GRID CARRIES, and a box holding one
  // thing carries none: `1` on every bar on the week is noise a reader has to
  // look past, and a box that stands for one thing already says so by being
  // one.
  //
  // ── AND A BOX OF ONE SAYS WHAT IT IS (1.0.27) ─────────────────────
  //
  // THE REPORT: *"The cards are missing text in read mode."* It carried none at
  // all — the name was on the element as a `title` and one press away in the
  // note it came from, which is what a 45px phone column has always had to do,
  // and which 1.0.19 chose deliberately after the opposite report (*"entries
  // are too small"*) from that width.
  //
  // WHICH IS WHY THE SPAN IS DRAWN AND THE STYLESHEET DECIDES. Seven columns
  // divide 360px into 45 each and a name in 45px is three letters and an
  // ellipsis; at 560px and up a column is 75px and a name is a name. That is a
  // question about how wide this widget ended up, so it is answered where the
  // width is known — `@container (min-width: 560px)` in `99-time-grid.css` —
  // rather than by a second measurement here. The `title` stays either way.
  //
  // A BOX OF SEVERAL STILL SAYS ONLY ITS COUNT. They are grouped by colour, so
  // naming one after the earliest of four names it after the wrong thing three
  // times in four — the same argument `wireStack` makes about which note a
  // press should open.
  if (alone) {
    el.createSpan({ cls: "ca-tg-blk-title", text: lead.title });
    el.setAttribute("title", `${lead.title} — ${describeWhen(lead)}`);
    wire(plugin, el, lead.key);
    return;
  }
  el.createSpan({ cls: "ca-tg-count", text: String(box.items.length) });
  const entries = box.items.map((item) => ({
    key: item.key,
    label: `${formatClock(item.start)} · ${item.title}`,
  }));
  el.setAttribute("title", stackTitle(entries));
  wireStack(plugin, el, entries);
}

// A box that stands for several things opens the list of them.
//
// NOT THE FIRST OF THEM. Opening one of four because it happens to start
// earliest is opening the wrong note three times out of four, and a press that
// does that is worse than a press that does nothing. The menu is Obsidian's
// own, which is the one thing on a phone that is already the right size.
function wireStack(
  plugin: ChronoAnvilPlugin,
  el: HTMLElement,
  entries: StackEntry[]
): void {
  el.addClass("is-clickable");
  el.setAttribute("tabindex", "0");

  const show = (evt: MouseEvent | null): void => {
    const menu = new Menu();
    for (const entry of entries) {
      menu.addItem((item) =>
        item.setTitle(entry.label).onClick(() => {
          openTimeGridItem(plugin, entry.key);
        })
      );
    }
    if (evt) {
      menu.showAtMouseEvent(evt);
      return;
    }
    // FROM THE KEYBOARD THERE IS NO POINTER TO HANG IT ON, so it opens under
    // the box the focus ring is on.
    const rect = el.getBoundingClientRect();
    menu.showAtPosition({ x: rect.left, y: rect.bottom });
  };

  el.addEventListener("click", (evt: MouseEvent) => {
    evt.preventDefault();
    show(evt);
  });
  el.addEventListener("contextmenu", (evt: MouseEvent) => {
    evt.preventDefault();
    evt.stopPropagation();
    show(evt);
  });
  el.addEventListener("keydown", (evt: KeyboardEvent) => {
    if (evt.key !== "Enter" && evt.key !== " ") return;
    if (evt.altKey || evt.ctrlKey || evt.metaKey) return;
    evt.preventDefault();
    show(null);
  });
}

function wire(plugin: ChronoAnvilPlugin, el: HTMLElement, key: string): void {
  el.addClass("is-clickable");

  // A TAB STOP, BECAUSE THIS IS THE THING THAT OPENS. It was `wireKeys`' job
  // and `wireKeys` is about the arrows, which edit — so it is not wired on a
  // compact grid, and it was never wired on an all-day chip at any width.
  el.setAttribute("tabindex", "0");

  // Left click opens the item
  el.addEventListener("click", () => {
    openTimeGridItem(plugin, key);
  });

  el.addEventListener("keydown", (evt: KeyboardEvent) => {
    if (evt.key !== "Enter" && evt.key !== " ") return;
    if (evt.altKey || evt.ctrlKey || evt.metaKey) return;
    evt.preventDefault();
    openTimeGridItem(plugin, key);
  });

  // Right-click (contextmenu / secondary click) opens the editor / note immediately
  el.addEventListener("contextmenu", (evt: MouseEvent) => {
    evt.preventDefault();
    evt.stopPropagation();
    openTimeGridItem(plugin, key);
  });

  // Long-tap on touch screens opens the item
  let touchTimer: number | null = null;
  let startX = 0;
  let startY = 0;

  el.addEventListener(
    "touchstart",
    (evt: TouchEvent) => {
      if (evt.touches.length !== 1) return;
      startX = evt.touches[0].clientX;
      startY = evt.touches[0].clientY;

      if (touchTimer !== null) window.clearTimeout(touchTimer);
      touchTimer = window.setTimeout(() => {
        touchTimer = null;
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          try {
            navigator.vibrate(30);
          } catch {
            // ignore vibration error
          }
        }
        openTimeGridItem(plugin, key);
      }, TOUCH_LONG_PRESS_MS);
    },
    { passive: true }
  );

  el.addEventListener(
    "touchmove",
    (evt: TouchEvent) => {
      if (touchTimer === null) return;
      if (evt.touches.length > 0) {
        const dx = Math.abs(evt.touches[0].clientX - startX);
        const dy = Math.abs(evt.touches[0].clientY - startY);
        if (dx > TOUCH_SLOP_PX || dy > TOUCH_SLOP_PX) {
          window.clearTimeout(touchTimer);
          touchTimer = null;
        }
      }
    },
    { passive: true }
  );

  const cancelTouchTimer = (): void => {
    if (touchTimer !== null) {
      window.clearTimeout(touchTimer);
      touchTimer = null;
    }
  };

  el.addEventListener("touchend", cancelTouchTimer, { passive: true });
  el.addEventListener("touchcancel", cancelTouchTimer, { passive: true });

  setIcon(el.createSpan({ cls: "ca-tg-blk-open" }), "arrow-up-right");
}
