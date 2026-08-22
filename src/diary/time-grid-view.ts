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

import { MarkdownPostProcessorContext, TFile, setIcon } from "obsidian";
import type AlmanacPlugin from "../main";
import { LOGBOOK_NOTE_KEY, type LogbookDef } from "../core/constants";
import { readNoteRegion } from "../core/notestore";
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
import { eventColor, eventsOnDay, type EventDef } from "../events/events";
import { readEvents } from "../events/eventstore";
import { openEventEditor } from "../events/event-ui";
import { parseLogItems } from "./log-items";
import {
  GRID_SOURCES,
  describeWhen,
  dayIndex,
  gridWindow,
  packDay,
  parseClock,
  parseSources,
  placeInWindow,
  weekDates,
  type AllDayItem,
  type GridItem,
  type GridSource,
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

// Which day the week opens on, and where the week comes from.
//
// THE HOST NOTE'S `week-start`, exactly as `buildWeekSummary` reads it — so
// `period-nav:week` re-scopes this grid with no navigation of its own — snapped
// back to the reader's own first day of the week.
//
// SNAPPED, NOT TRUSTED. `week-start` is written by the navigator and by hand,
// and a hand-written Wednesday would draw a Wednesday-to-Tuesday week whose
// column heads disagreed with every other calendar in the plugin.
function weekStartOf(plugin: AlmanacPlugin, ctx: MarkdownPostProcessorContext): string {
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
  plugin: AlmanacPlugin,
  rest: string,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const root = createDiv({ cls: "am-tg" });
  const { sources, unknown } = parseSources(rest.split("|")[0] ?? "");

  if (unknown.length) {
    root.createDiv({
      cls: "journal-widget-error",
      text: `time-grid: no source called ${unknown
        .map((w) => `"${w}"`)
        .join(", ")}. Name any of: ${GRID_SOURCES.join(", ")}.`,
    });
    return root;
  }

  const start = weekStartOf(plugin, ctx);
  const dates = weekDates(start);

  const bar = root.createDiv({ cls: "am-tg-bar" });
  bar.createSpan({
    cls: "am-tg-span",
    text: `${moment(dates[0]).format("D MMM")} – ${moment(dates[6]).format(
      "D MMM YYYY"
    )}`,
  });
  bar.createSpan({
    cls: "am-tg-sources",
    text: sources.join(" · "),
  });

  const scroll = root.createDiv({ cls: "am-tg-scroll" });
  const grid = scroll.createDiv({ cls: "am-tg-grid" });
  const status = root.createDiv({ cls: "am-tg-status", text: "Reading the week…" });

  void collect(plugin, sources, start, dates).then(({ items, allDay }) => {
    status.remove();
    paint(plugin, grid, dates, items, allDay);
  });

  return root;
}

// ── collecting ────────────────────────────────────────────────────────

interface Collected {
  items: GridItem[];
  allDay: AllDayItem[];
}

async function collect(
  plugin: AlmanacPlugin,
  sources: GridSource[],
  start: string,
  dates: string[]
): Promise<Collected> {
  const items: GridItem[] = [];
  const allDay: AllDayItem[] = [];

  if (sources.includes("events")) fromEvents(plugin, dates, items);
  if (sources.includes("logbooks")) await fromLogbooks(plugin, start, items);
  if (sources.includes("tasks")) await fromTasks(plugin, dates, items, allDay);

  return { items, allDay };
}

// TIMED EVENTS ONLY, which is 4.52's own distinction and not a filter standing
// in for one: an event with an hour is an appointment and belongs on a clock; an
// event without one is a fact about the whole day, and the day's facts are what
// the month calendar already draws.
function fromEvents(
  plugin: AlmanacPlugin,
  dates: string[],
  out: GridItem[]
): void {
  const defs = readEvents(plugin.app, plugin);
  dates.forEach((iso, day) => {
    for (const def of eventsOnDay(defs, iso)) {
      const start = parseClock(def.time ?? null);
      if (start == null) continue;
      out.push({
        source: "events",
        color: eventColor(def),
        title: def.title,
        day,
        start,
        mins: def.duration ?? null,
        key: `event:${def.id}:${iso}`,
      });
    }
  });
}

// Items from every region-backed logbook. The Meetings book is skipped, and
// skipping it is the point: `source: "events"` means its items ARE events, and
// they are already on the grid from `fromEvents`. Drawing it would put every
// meeting on the week twice.
async function fromLogbooks(
  plugin: AlmanacPlugin,
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
  plugin: AlmanacPlugin,
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

function firstLine(text: string): string {
  const line = text.split("\n").find((l) => l.trim() !== "");
  return line ? line.trim() : "";
}

// ── painting ──────────────────────────────────────────────────────────

function paint(
  plugin: AlmanacPlugin,
  grid: HTMLElement,
  dates: string[],
  items: GridItem[],
  allDay: AllDayItem[]
): void {
  grid.empty();
  const win = gridWindow(items);
  const todayIso = moment().format("YYYY-MM-DD");

  // The heads.
  const head = grid.createDiv({ cls: "am-tg-head" });
  // NOT A TIMEZONE, WHICH IS WHAT SITS HERE ON EVERY OTHER WEEK GRID. Almanac
  // stores wall-clock strings — `EventDef.time` is `"14:00"`, not an instant —
  // so there is no zone to name and printing one would be drawing a feature the
  // plugin does not have. The week number is a fact it already computes.
  head.createDiv({ cls: "am-tg-corner", text: `W${moment(dates[0]).isoWeek()}` });
  dates.forEach((iso) => {
    const cell = head.createDiv({
      cls: `am-tg-day${iso === todayIso ? " is-today" : ""}`,
    });
    cell.createDiv({ cls: "am-tg-dow", text: moment(iso).format("ddd") });
    cell.createDiv({ cls: "am-tg-dnum", text: moment(iso).format("D") });
  });

  // The all-day lane. DRAWN EVEN WHEN EMPTY, so a task acquiring a due date
  // does not shift the whole grid down by a row the moment it arrives.
  const lane = grid.createDiv({ cls: "am-tg-lane" });
  lane.createDiv({ cls: "am-tg-lane-label", text: "all day" });
  dates.forEach((_iso, day) => {
    const cell = lane.createDiv({ cls: "am-tg-lane-cell" });
    for (const item of allDay.filter((a) => a.day === day)) {
      const chip = cell.createDiv({
        cls: `am-tg-chip am-tg-fill-${item.color}`,
        text: item.title,
      });
      chip.setAttribute("title", `${item.title} — due, no time`);
      wire(plugin, chip, item.key);
    }
  });

  // The rail and the columns.
  const body = grid.createDiv({ cls: "am-tg-body" });
  const rail = body.createDiv({ cls: "am-tg-rail" });
  const hours = win.endHour - win.startHour;
  for (let h = win.startHour; h <= win.endHour; h++) {
    const mark = rail.createDiv({
      cls: "am-tg-hour",
      text: moment().startOf("day").add(h, "hours").format("h A"),
    });
    mark.style.top = `${((h - win.startHour) / hours) * 100}%`;
  }

  dates.forEach((iso, day) => {
    const col = body.createDiv({
      cls: `am-tg-col${iso === todayIso ? " is-today" : ""}`,
    });
    // The hour lines, as a repeating gradient sized from the row count, so the
    // stylesheet holds no number that has to agree with this one.
    col.style.setProperty("--am-tg-hours", String(hours));

    for (const placed of packDay(items.filter((i) => i.day === day))) {
      const { top, height } = placeInWindow(placed, win);
      const moment_ = placed.mins == null;
      const block = col.createDiv({
        cls:
          `am-tg-blk am-tg-fill-${placed.color}` +
          (moment_ ? " is-moment" : ""),
      });
      block.style.top = `${top * 100}%`;
      block.style.height = `${height * 100}%`;
      const width = 100 / placed.cols;
      block.style.left = `calc(${placed.col * width}% + 2px)`;
      block.style.width = `calc(${width}% - 4px)`;
      block.createSpan({ cls: "am-tg-blk-title", text: placed.title });
      if (!moment_) {
        block.createSpan({ cls: "am-tg-blk-when", text: describeWhen(placed) });
      }
      block.setAttribute("title", `${placed.title} — ${describeWhen(placed)}`);
      wire(plugin, block, placed.key);
    }
  });

  if (!items.length && !allDay.length) {
    grid.parentElement?.parentElement?.createDiv({
      cls: "am-tg-empty",
      text: "Nothing scheduled this week. An event with a time, a logbook item, or a task with a due date shows here.",
    });
  }
}

// Clicking a block opens what it came from.
//
// CLICK ONLY. Dragging a block would have to REWRITE A STAMP in someone's
// markdown — moving a work-log item to Tuesday means editing the line that says
// when it happened — and that is a different class of gesture from anything
// this plugin does today. It is worth its own release rather than a rider on
// this one.
function wire(plugin: AlmanacPlugin, el: HTMLElement, key: string): void {
  el.addClass("is-clickable");
  el.addEventListener("click", () => {
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
    if (kind === "task") {
      // The path is everything up to the last colon-separated piece, because a
      // task's own text may contain a colon and the path may not contain the
      // separator this key was built with in any other position.
      const note = getFile(plugin.app, rest.slice(0, -1).join(":"));
      if (note) void openFile(plugin.app, note);
    }
  });
  setIcon(el.createSpan({ cls: "am-tg-blk-open" }), "arrow-up-right");
}
