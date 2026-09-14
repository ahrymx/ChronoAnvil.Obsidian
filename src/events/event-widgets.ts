// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The two event widgets: the full manager (`events`) and the upcoming list
// (`events:upcoming[:N]`).
//
// Both are read-only views over the same list in the events note; every edit
// path goes through the shared modal in event-ui.ts. They're separate widgets
// rather than one with a mode flag because they answer different questions —
// "what have I got?" versus "what's coming?" — and want opposite orderings.
//
// ── 1.0.21: THE MANAGER STOPPED LOOKING LIKE THE COUNTDOWN ───────────────
//
// A reader's phone screenshot had the two stacked, drawing the same three rows
// with the same chips in the same order, and asked for the first one to "become
// more of a manager". The list was already a manager — three partitioned
// groups, a filter box and four row actions — and three things hid all of it:
//
//   THE FOUR ACTIONS WERE `opacity: 0` UNTIL `:hover`, with one `@media
//   (hover: none)` arm dropping them to 0.45 on touch. That arm is why they
//   were not literally invisible on a phone and it is not an affordance: four
//   24px targets at not-quite-half opacity, on a row that was not itself
//   pressable, beside a countdown widget drawing the same rows with nothing on
//   them at all. Whatever the CSS said, what a reader saw was two identical
//   lists. That is the defect; the rest of this is the answer to "and what
//   should it be instead".
//
//   THE FILTER BOX APPEARED AT EIGHT EVENTS. Under that the toolbar was a
//   button and a count.
//
//   THREE FUTURE SINGLE EVENTS COLLAPSE THE THREE GROUPS TO ONE, headed
//   COMING UP — which is literally the other widget's name.
//
// So: a deck that is always there and says what the list is made of, groups
// that count and fold, a row that opens when pressed, and ONE `⋯` holding the
// three actions that are not "edit". The countdown is untouched.

import { Menu, setIcon } from "obsidian";
import { emptyLine } from "../ui/empty";
import type ChronoAnvilPlugin from "../main";
import {
  EventDef,
  EventKindFilter,
  EventSort,
  describeEventDate,
  describeEventWhen,
  describeLength,
  describeRelative,
  eventColor,
  eventIcon,
  eventRelative,
  matchesEventFilter,
  matchesEventKind,
  partitionEvents,
  sortEvents,
  tallyEventKinds,
  upcomingEvents,
} from "./events";
import { deleteEvent, readEvents, saveEvent } from "./eventstore";
import { draftEvent, openEventEditor } from "./event-ui";
import { overflowButton } from "../ui/section-frame";
import { confirmAction } from "../ui/modals";
import { today } from "../core/util";

const DEFAULT_UPCOMING = 5;

// A coloured icon chip — the same visual token the calendar stamps into a day
// cell, at list size, so an event is recognisable in both places.
function eventChip(parent: HTMLElement, def: EventDef): HTMLElement {
  const chip = parent.createSpan({
    cls: `ca-ev-chip ca-ev-chip-${eventColor(def)}`,
  });
  setIcon(chip, eventIcon(def));
  return chip;
}

// Keeps the `ca-ev-empty` class its own stylesheet targets; the shape and the
// rule for what to say now come from empty.ts.
function emptyState(parent: HTMLElement, text: string): void {
  emptyLine(parent, text, "ca-ev-empty");
}

// ── events ────────────────────────────────────────────────────────────
// The manager. Lives in the body of the events note by default, so the file
// that stores the list is also the page where you edit it.
//
// ── WHAT 4.62 CHANGED, AND WHY IT IS THE SAME LIST ──────────────────
//
// Three things a reader met on this page and could not do anything about:
//
//   THE HOUR WAS MISSING. Rows printed `describeEventDate`, which describes a
//   DAY on purpose — so a 14:00 sales call and an all-day trip read identically
//   in the one list you manage meetings from. The Meetings logbook has printed
//   `describeEventWhen` since 4.52; this now does too.
//
//   PAST AND FUTURE WERE ONE LIST. See `partitionEvents` for the argument.
//
//   EVERY ACTION WAS BEHIND THE PENCIL. Turning an event off, copying it for
//   next year and deleting it are one-click intentions, and each of them meant
//   opening an editor on the thing first. They are on the row now — in the
//   row's own `⋯` as of 1.0.21 rather than as four hover-revealed buttons; the
//   editor is still the only place a FIELD is edited, which is the line this
//   keeps.
//
// THE LIST REDRAWS ITSELF AFTER A ROW ACTION rather than waiting for the note
// to re-render, because a widget on some other page has no reason to be
// re-rendered by a write to the events note and a toggle that appears to do
// nothing is worse than no toggle.

// ── THE VIEW STATE, AND WHERE IT LIVES ───────────────────────────────────
//
// `settings.eventsView` and not a note key — the argument is in settings.ts
// beside the field. What matters here is that all three reads go through one
// pair of functions, so a widget drawn twice on one page agrees with itself.
interface EventsView {
  kind: EventKindFilter;
  sort: EventSort;
  folded: Set<string>;
}

function readView(plugin: ChronoAnvilPlugin): EventsView {
  const saved = plugin.settings.eventsView ?? {};
  return {
    kind: saved.kind ?? "all",
    sort: saved.sort ?? "date",
    folded: new Set(saved.folded ?? []),
  };
}

// THE RESTING STATE WRITES NOTHING. Every event, by date, nothing folded, is
// the absence of a key rather than three stored defaults — the same posture
// `timeGridExpanded` takes, and what keeps a vault that never touched the deck
// free of the setting.
function saveView(plugin: ChronoAnvilPlugin, view: EventsView): void {
  const next: NonNullable<ChronoAnvilPlugin["settings"]["eventsView"]> = {};
  if (view.kind !== "all") next.kind = view.kind;
  if (view.sort !== "date") next.sort = view.sort;
  if (view.folded.size) next.folded = Array.from(view.folded).sort();
  if (Object.keys(next).length === 0) delete plugin.settings.eventsView;
  else plugin.settings.eventsView = next;
  void plugin.saveSettings();
}

// The chips, left to right. `all` first because it is where the strip rests.
const KIND_CHIPS: { id: EventKindFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "repeating", label: "Repeating" },
  { id: "single", label: "One-off" },
  { id: "off", label: "Off" },
];

// THE ADD BUTTON ASKS THE RHYTHM BEFORE THE FORM. The editor's own segmented
// Single / Yearly / Weekly bar still switches it afterwards; this is the same
// question put where a reader is already deciding what they are adding, which
// is what turns one button into the three intentions behind it.
function addMenu(plugin: ChronoAnvilPlugin, redraw: () => void): Menu {
  const menu = new Menu();
  const start = (kind: "single" | "yearly" | "weekly"): void => {
    const draft = draftEvent();
    if (kind === "single") {
      openEventEditor(plugin.app, plugin, draft, redraw);
      return;
    }
    const next: EventDef = { ...draft, kind: "recurring" };
    delete next.start;
    delete next.end;
    if (kind === "weekly") {
      // A weekly event is `every: "week"` plus a weekday and a REQUIRED time —
      // see `isWeeklyEvent`. The editor validates the time; the weekday is
      // seeded with today's so the form opens on a legal draft rather than on
      // an error.
      next.every = "week";
      next.weekday = new Date().getUTCDay();
    } else {
      const now = new Date();
      next.month = now.getUTCMonth() + 1;
      next.day = now.getUTCDate();
    }
    openEventEditor(plugin.app, plugin, next, redraw);
  };
  menu.addItem((i) =>
    i.setTitle("One-off event").setIcon("calendar").onClick(() => start("single"))
  );
  menu.addItem((i) =>
    i
      .setTitle("Repeats every year")
      .setIcon("cake")
      .onClick(() => start("yearly"))
  );
  menu.addItem((i) =>
    i
      .setTitle("Repeats every week")
      .setIcon("repeat")
      .onClick(() => start("weekly"))
  );
  return menu;
}

export function buildEventsList(plugin: ChronoAnvilPlugin): HTMLElement {
  const root = createDiv({ cls: "ca-ev-manager" });
  let query = "";
  const view = readView(plugin);
  // Kept across a redraw so deleting the third of four matches does not empty
  // the box the reader is still typing in.
  const body = createDiv({ cls: "ca-ev-body" });
  const deck = root.createDiv({ cls: "ca-ev-deck" });

  const redraw = (): void => {
    body.empty();
    drawList(plugin, body, query, view, redraw);
    drawCounts();
  };

  const toolbar = deck.createDiv({ cls: "ca-ev-toolbar" });
  const addBtn = toolbar.createEl("button", {
    cls: "ca-ev-add mod-cta",
    text: "Add event",
    attr: { type: "button", "aria-haspopup": "menu" },
  });
  setIcon(addBtn.createSpan({ cls: "ca-ev-add-caret" }), "chevron-down");
  addBtn.addEventListener("click", (evt) =>
    addMenu(plugin, redraw).showAtMouseEvent(evt)
  );

  // THE BOX IS ALWAYS DRAWN, as of 1.0.21. `FILTER_FROM = 8` argued that a box
  // over six rows is a control that cannot do its job, which was true of a box
  // ALONE — it is false of a deck. The strip now carries the counts and the
  // sort whatever the list holds, and a toolbar that changes shape at the
  // eighth event is a toolbar a reader has to re-learn.
  const search = toolbar.createEl("input", {
    cls: "ca-ev-filter",
    attr: {
      type: "search",
      placeholder: "Filter events\u2026",
      "aria-label": "Filter events",
    },
  });
  search.addEventListener("input", () => {
    query = search.value;
    redraw();
  });

  const strip = deck.createDiv({ cls: "ca-ev-kinds" });
  const chips = new Map<EventKindFilter, HTMLElement>();
  for (const chip of KIND_CHIPS) {
    const el = strip.createEl("button", {
      cls: "ca-ev-kind",
      attr: { type: "button", "aria-pressed": String(view.kind === chip.id) },
    });
    el.createSpan({ cls: "ca-ev-kind-label", text: chip.label });
    el.createSpan({ cls: "ca-ev-kind-count" });
    el.addEventListener("click", () => {
      view.kind = chip.id;
      saveView(plugin, view);
      for (const [id, other] of chips) {
        other.setAttr("aria-pressed", String(id === chip.id));
        other.toggleClass("is-on", id === chip.id);
      }
      redraw();
    });
    el.toggleClass("is-on", view.kind === chip.id);
    chips.set(chip.id, el);
  }

  const sortBtn = strip.createEl("button", {
    cls: "ca-ev-sort",
    attr: { type: "button" },
  });
  const drawSort = (): void => {
    sortBtn.empty();
    setIcon(sortBtn.createSpan({ cls: "ca-ev-sort-icon" }), "arrow-up-down");
    sortBtn.createSpan({
      text: view.sort === "name" ? "by name" : "by date",
    });
    sortBtn.setAttr(
      "aria-label",
      view.sort === "name" ? "Sorted by name — sort by date" : "Sorted by date — sort by name"
    );
  };
  drawSort();
  sortBtn.addEventListener("click", () => {
    view.sort = view.sort === "name" ? "date" : "name";
    saveView(plugin, view);
    drawSort();
    redraw();
  });

  // The counts are a fact about the WHOLE list, not about what the box has
  // filtered it down to — a chip reading "Repeating 0" because the reader typed
  // a word would be a count that answered a different question from the one the
  // chip asks.
  const drawCounts = (): void => {
    const tally = tallyEventKinds(readEvents(plugin.app, plugin));
    for (const [id, el] of chips) {
      const count = el.querySelector(".ca-ev-kind-count");
      if (count instanceof HTMLElement) count.setText(String(tally[id]));
    }
  };

  if (!plugin.settings.eventsEnabled) {
    emptyState(
      root,
      "Special events are turned off in Settings \u2192 Events. The list below is still stored, just not drawn on the calendars."
    );
  }

  root.appendChild(body);
  redraw();
  return root;
}

// One group of the three, with its count and its fold.
//
// EVERY GROUP FOLDS NOW, not only "Earlier". A `<details>` per group is one
// element rather than a heading plus a hand-rolled chevron and a hidden list,
// and the browser already owns the keyboard and the arrow. What "Earlier"
// keeps that the other two do not is being folded to start with: it is a list
// you open to look something up, not one you read.
function group(
  plugin: ChronoAnvilPlugin,
  root: HTMLElement,
  id: string,
  title: string,
  list: EventDef[],
  view: EventsView,
  redraw: () => void,
  closedByDefault: boolean
): void {
  if (!list.length) return;
  const folded = view.folded.has(id);
  const details = root.createEl("details", { cls: "ca-ev-group" });
  details.toggleAttribute("open", folded ? false : !closedByDefault);
  const summary = details.createEl("summary", { cls: "ca-ev-section" });
  summary.createSpan({ cls: "ca-ev-section-name", text: title });
  summary.createSpan({ cls: "ca-ev-section-count", text: String(list.length) });
  details.addEventListener("toggle", () => {
    if (details.open) view.folded.delete(id);
    else view.folded.add(id);
    saveView(plugin, view);
  });
  rows(plugin, details.createDiv({ cls: "ca-ev-list" }), sortEvents(list, view.sort), redraw);
}

function drawList(
  plugin: ChronoAnvilPlugin,
  root: HTMLElement,
  query: string,
  view: EventsView,
  redraw: () => void
): void {
  const all = readEvents(plugin.app, plugin);

  if (!all.length) {
    emptyState(
      root,
      "No events yet. Add a birthday or a trip and it'll show on every diary calendar."
    );
    return;
  }

  const defs = all.filter(
    (d) => matchesEventFilter(d, query) && matchesEventKind(d, view.kind)
  );
  if (!defs.length) {
    const said = query.trim()
      ? `No event matches \u201c${query.trim()}\u201d`
      : "Nothing here";
    emptyState(root, `${said}. Press All to see all ${all.length} again.`);
    return;
  }

  const { recurring, coming, earlier } = partitionEvents(defs, today());
  group(plugin, root, "recurring", "Repeating", recurring, view, redraw, false);
  group(plugin, root, "coming", "Coming up", coming, view, redraw, false);
  group(plugin, root, "earlier", "Earlier", earlier, view, redraw, true);
}

// One row per event: a press opens it, and a `⋯` holds everything else.
function rows(
  plugin: ChronoAnvilPlugin,
  ul: HTMLElement,
  list: EventDef[],
  redraw: () => void
): void {
  const now = today();
  for (const def of list) {
    const row = ul.createDiv({
      cls: "ca-ev-row",
      attr: { tabindex: "0", role: "button" },
    });
    if (def.enabled === false) row.addClass("is-disabled");
    eventChip(row, def);
    const text = row.createDiv({ cls: "ca-ev-text" });
    const title = text.createDiv({ cls: "ca-ev-title" });
    title.createSpan({ text: def.title });
    // AN "OFF" PILL, BECAUSE HALF OPACITY IS NOT A LABEL. A dimmed row says
    // something is different about it and does not say what, and the difference
    // here is the one thing a reader came to this list to change.
    if (def.enabled === false) {
      title.createSpan({ cls: "ca-ev-pill", text: "Off" });
    }
    // THE HOUR AND THE LENGTH WHERE THERE ARE ANY, and the note last, because
    // the note is the part that runs long.
    text.createDiv({
      cls: "ca-ev-meta",
      text: [describeEventWhen(def), describeLength(def.duration), def.note]
        .filter((part) => !!part)
        .join(" \u00b7 "),
    });

    // THE COLUMN THE COUNTDOWN USED TO HAVE TO ITSELF, and it is the manager's
    // too now: a birthday five months out and a trip that started yesterday are
    // both facts you want on the row you are about to edit. `eventRelative`
    // answers for a recurring definition, which `describeRelative` could not —
    // it took an `UpcomingEvent`, and only the countdown built one.
    const when = eventRelative(def, now);
    if (when) row.createSpan({ cls: "ca-ev-when", text: when });

    const open = (): void => openEventEditor(plugin.app, plugin, def, redraw);
    row.addEventListener("click", open);
    row.addEventListener("keydown", (evt) => {
      if (evt.key !== "Enter" && evt.key !== " ") return;
      evt.preventDefault();
      open();
    });

    overflowButton(row, "ca-ev-more", (menu) => {
      const on = def.enabled !== false;
      menu.addItem((i) =>
        i
          .setTitle(on ? "Turn off" : "Turn on")
          .setIcon(on ? "eye-off" : "eye")
          .onClick(() => {
            // ABSENT COUNTS AS ENABLED, so turning one on removes the field
            // rather than writing `true` — `normalizeEvent`'s own reading of
            // it, and it keeps a note that has never been switched off free of
            // the property.
            const next: EventDef = { ...def };
            if (on) next.enabled = false;
            else delete next.enabled;
            void saveEvent(plugin.app, plugin, next).then(redraw);
          })
      );
      menu.addItem((i) =>
        i
          .setTitle("Duplicate")
          .setIcon("copy")
          .onClick(() => {
            // THE COMMONEST EDIT ON THIS PAGE IS "THE SAME THING AGAIN, LATER"
            // — a standing meeting the annual recurrence cannot say, a second
            // trip. The copy opens in the editor rather than landing in the
            // list, because a duplicate nobody has re-dated is two identical
            // rows.
            const copy: EventDef = { ...def, id: "", title: `${def.title} (copy)` };
            openEventEditor(plugin.app, plugin, copy, redraw);
          })
      );
      menu.addItem((i) =>
        i
          .setTitle("Delete")
          .setIcon("trash-2")
          .onClick(() => {
            void (async () => {
              const ok = await confirmAction(
                plugin.app,
                "Delete event",
                `Delete \u201c${def.title}\u201d? Diary entries that already reference it keep their property; the reference is simply ignored.`,
                "Delete",
                true
              );
              if (!ok) return;
              await deleteEvent(plugin.app, plugin, def.id);
              redraw();
            })();
          })
      );
    });
  }
}

// ── events:upcoming[:N] ───────────────────────────────────────────────
// The next few events, for a dashboard. An in-progress span sorts to the top
// and says which day of it you're on, which is the one thing this list can tell
// you that the calendar can't.
export function buildUpcomingEvents(
  plugin: ChronoAnvilPlugin,
  count: number
): HTMLElement {
  const root = createDiv({ cls: "ca-ev-upcoming" });
  if (!plugin.settings.eventsEnabled) {
    emptyState(
      root,
      "Special events are turned off. Turn them on in Settings \u2192 Special events to see birthdays, trips and anniversaries here and on every diary calendar."
    );
    return root;
  }
  const defs = readEvents(plugin.app, plugin);
  const items = upcomingEvents(defs, today(), count);

  if (!items.length) {
    emptyState(
      root,
      `Nothing in the next ${count} day${count === 1 ? "" : "s"}. Birthdays, trips and anniversaries added in Settings \u2192 Special events appear here as they approach \u2014 and on every diary calendar.`
    );
    return root;
  }

  for (const item of items) {
    const row = root.createDiv({ cls: "ca-ev-row ca-ev-upcoming-row" });
    if (item.ongoing) row.addClass("is-ongoing");
    eventChip(row, item.def);
    const text = row.createDiv({ cls: "ca-ev-text" });
    text.createDiv({ cls: "ca-ev-title", text: item.def.title });
    text.createDiv({ cls: "ca-ev-meta", text: describeEventDate(item.def) });
    row.createSpan({ cls: "ca-ev-when", text: describeRelative(item) });
  }
  return root;
}

export { DEFAULT_UPCOMING };
