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

import { setIcon } from "obsidian";
import { emptyLine } from "../ui/empty";
import type AlmanacPlugin from "../main";
import {
  EventDef,
  describeEventDate,
  describeEventWhen,
  describeLength,
  describeRelative,
  eventColor,
  eventIcon,
  matchesEventFilter,
  partitionEvents,
  upcomingEvents,
} from "./events";
import { deleteEvent, readEvents, saveEvent } from "./eventstore";
import { draftEvent, openEventEditor } from "./event-ui";
import { confirmAction } from "../ui/modals";
import { today } from "../core/util";

const DEFAULT_UPCOMING = 5;

// A coloured icon chip — the same visual token the calendar stamps into a day
// cell, at list size, so an event is recognisable in both places.
function eventChip(parent: HTMLElement, def: EventDef): HTMLElement {
  const chip = parent.createSpan({
    cls: `am-ev-chip am-ev-chip-${eventColor(def)}`,
  });
  setIcon(chip, eventIcon(def));
  return chip;
}

// Keeps the `am-ev-empty` class its own stylesheet targets; the shape and the
// rule for what to say now come from empty.ts.
function emptyState(parent: HTMLElement, text: string): void {
  emptyLine(parent, text, "am-ev-empty");
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
//   opening an editor on the thing first. They are on the row now; the editor
//   is still the only place a FIELD is edited, which is the line this keeps.
//
// THE LIST REDRAWS ITSELF AFTER A ROW ACTION rather than waiting for the note
// to re-render, because a widget on some other page has no reason to be
// re-rendered by a write to the events note and a toggle that appears to do
// nothing is worse than no toggle.
const FILTER_FROM = 8;

export function buildEventsList(plugin: AlmanacPlugin): HTMLElement {
  const root = createDiv({ cls: "am-ev-manager" });
  let query = "";
  // Kept across a redraw so deleting the third of four matches does not empty
  // the box the reader is still typing in.
  const body = createDiv({ cls: "am-ev-body" });

  const redraw = (): void => {
    body.empty();
    drawList(plugin, body, query, redraw);
  };

  const defs = readEvents(plugin.app, plugin);
  const toolbar = root.createDiv({ cls: "am-ev-toolbar" });
  const addBtn = toolbar.createEl("button", {
    cls: "am-ev-add mod-cta",
    text: "Add event",
  });
  addBtn.addEventListener("click", () =>
    openEventEditor(plugin.app, plugin, draftEvent(), redraw)
  );
  toolbar.createSpan({
    cls: "am-ev-count",
    text: defs.length === 1 ? "1 event" : `${defs.length} events`,
  });

  // A FILTER ONLY ONCE THERE IS SOMETHING TO FILTER. A box over six rows is a
  // control that cannot do its job — the rule the capture box's destination
  // picker follows, applied to the number at which scanning stops working.
  if (defs.length >= FILTER_FROM) {
    const search = toolbar.createEl("input", {
      cls: "am-ev-filter",
      attr: { type: "search", placeholder: "Filter events…", "aria-label": "Filter events" },
    });
    search.addEventListener("input", () => {
      query = search.value;
      redraw();
    });
  }

  if (!plugin.settings.eventsEnabled) {
    emptyState(
      root,
      "Special events are turned off in Settings → Events. The list below is still stored, just not drawn on the calendars."
    );
  }

  root.appendChild(body);
  redraw();
  return root;
}

function drawList(
  plugin: AlmanacPlugin,
  root: HTMLElement,
  query: string,
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

  const defs = all.filter((d) => matchesEventFilter(d, query));
  if (!defs.length) {
    emptyState(
      root,
      `No event matches “${query.trim()}”. Clear the box to see all ${all.length} again.`
    );
    return;
  }

  const { recurring, coming, earlier } = partitionEvents(defs, today());

  const section = (
    title: string,
    list: EventDef[],
    opts: { folded?: boolean } = {}
  ): void => {
    if (!list.length) return;
    // EARLIER IS FOLDED AND SAYS HOW MANY. It is a list you open to look
    // something up, not one you read — and a count in the heading is what makes
    // the fold honest about what it is hiding.
    if (opts.folded) {
      const details = root.createEl("details", { cls: "am-ev-past" });
      details.createEl("summary", {
        cls: "am-ev-section",
        text: `${title} · ${list.length}`,
      });
      rows(plugin, details.createDiv({ cls: "am-ev-list" }), list, redraw);
      return;
    }
    root.createEl("h4", { cls: "am-ev-section", text: title });
    rows(plugin, root.createDiv({ cls: "am-ev-list" }), list, redraw);
  };

  section("Recurring", recurring);
  section("Coming up", coming);
  section("Earlier", earlier, { folded: true });
}

// One row per event, with the three actions that do not need a form.
function rows(
  plugin: AlmanacPlugin,
  ul: HTMLElement,
  list: EventDef[],
  redraw: () => void
): void {
  for (const def of list) {
    const row = ul.createDiv({ cls: "am-ev-row" });
    if (def.enabled === false) row.addClass("is-disabled");
    eventChip(row, def);
    const text = row.createDiv({ cls: "am-ev-text" });
    text.createDiv({ cls: "am-ev-title", text: def.title });
    // THE HOUR AND THE LENGTH WHERE THERE ARE ANY, and the note last, because
    // the note is the part that runs long.
    text.createDiv({
      cls: "am-ev-meta",
      text: [describeEventWhen(def), describeLength(def.duration), def.note]
        .filter((part) => !!part)
        .join(" · "),
    });

    const act = row.createDiv({ cls: "am-ev-actions" });

    const on = def.enabled !== false;
    action(act, on ? "eye" : "eye-off", on ? "Turn off" : "Turn on", async () => {
      // ABSENT COUNTS AS ENABLED, so turning one on removes the field rather
      // than writing `true` — `normalizeEvent`'s own reading of it, and it
      // keeps a note that has never been switched off free of the property.
      const next: EventDef = { ...def };
      if (on) next.enabled = false;
      else delete next.enabled;
      await saveEvent(plugin.app, plugin, next);
      redraw();
    });

    action(act, "copy", "Duplicate", () => {
      // THE COMMONEST EDIT ON THIS PAGE IS "THE SAME THING AGAIN, LATER" — a
      // standing meeting the annual recurrence cannot say, a second trip. The
      // copy opens in the editor rather than landing in the list, because a
      // duplicate nobody has re-dated is two identical rows.
      const copy: EventDef = { ...def, id: "", title: `${def.title} (copy)` };
      openEventEditor(plugin.app, plugin, copy, redraw);
    });

    action(act, "pencil", "Edit", () => {
      openEventEditor(plugin.app, plugin, def, redraw);
    });

    action(act, "trash-2", "Delete", async () => {
      const ok = await confirmAction(
        plugin.app,
        "Delete event",
        `Delete “${def.title}”? Diary entries that already reference it keep their property; the reference is simply ignored.`,
        "Delete",
        true
      );
      if (!ok) return;
      await deleteEvent(plugin.app, plugin, def.id);
      redraw();
    });
  }
}

// One icon button on a row. The label is both the tooltip and the accessible
// name, so a row's controls are reachable by a reader who cannot see the icon.
function action(
  parent: HTMLElement,
  icon: string,
  label: string,
  run: () => void | Promise<void>
): void {
  const btn = parent.createEl("button", {
    cls: "am-ev-edit",
    attr: { "aria-label": label, title: label, type: "button" },
  });
  setIcon(btn, icon);
  btn.addEventListener("click", () => void run());
}

// ── events:upcoming[:N] ───────────────────────────────────────────────
// The next few events, for a dashboard. An in-progress span sorts to the top
// and says which day of it you're on, which is the one thing this list can tell
// you that the calendar can't.
export function buildUpcomingEvents(
  plugin: AlmanacPlugin,
  count: number
): HTMLElement {
  const root = createDiv({ cls: "am-ev-upcoming" });
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
    const row = root.createDiv({ cls: "am-ev-row am-ev-upcoming-row" });
    if (item.ongoing) row.addClass("is-ongoing");
    eventChip(row, item.def);
    const text = row.createDiv({ cls: "am-ev-text" });
    text.createDiv({ cls: "am-ev-title", text: item.def.title });
    text.createDiv({ cls: "am-ev-meta", text: describeEventDate(item.def) });
    row.createSpan({ cls: "am-ev-when", text: describeRelative(item) });
  }
  return root;
}

export { DEFAULT_UPCOMING };
