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
  describeRelative,
  eventColor,
  eventIcon,
  upcomingEvents,
} from "./events";
import { readEvents } from "./eventstore";
import { draftEvent, openEventEditor } from "./event-ui";
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
export function buildEventsList(plugin: AlmanacPlugin): HTMLElement {
  const root = createDiv({ cls: "am-ev-manager" });
  const defs = readEvents(plugin.app, plugin);

  const toolbar = root.createDiv({ cls: "am-ev-toolbar" });
  const addBtn = toolbar.createEl("button", {
    cls: "am-ev-add mod-cta",
    text: "Add event",
  });
  addBtn.addEventListener("click", () =>
    openEventEditor(plugin.app, plugin, draftEvent())
  );
  toolbar.createSpan({
    cls: "am-ev-count",
    text: defs.length === 1 ? "1 event" : `${defs.length} events`,
  });

  if (!plugin.settings.eventsEnabled) {
    emptyState(
      root,
      "Special events are turned off in Settings → Events. The list below is still stored, just not drawn on the calendars."
    );
  }

  // Recurring first, by date within the year — that's the shape of the list you
  // scan when you're checking whether you've entered every birthday. Single
  // events follow, newest first, because the ones you're likely to want to fix
  // are the ones you just added.
  const recurring = defs
    .filter((d) => d.kind === "recurring")
    .sort((a, b) => (a.month ?? 0) - (b.month ?? 0) || (a.day ?? 0) - (b.day ?? 0));
  const single = defs
    .filter((d) => d.kind === "single")
    .sort((a, b) => (b.start ?? "").localeCompare(a.start ?? ""));

  if (!defs.length) {
    emptyState(
      root,
      "No events yet. Add a birthday or a trip and it'll show on every diary calendar."
    );
    return root;
  }

  const section = (title: string, list: EventDef[]) => {
    if (!list.length) return;
    root.createEl("h4", { cls: "am-ev-section", text: title });
    const ul = root.createDiv({ cls: "am-ev-list" });
    for (const def of list) {
      const row = ul.createDiv({ cls: "am-ev-row" });
      if (def.enabled === false) row.addClass("is-disabled");
      eventChip(row, def);
      const text = row.createDiv({ cls: "am-ev-text" });
      text.createDiv({ cls: "am-ev-title", text: def.title });
      const meta = describeEventDate(def);
      text.createDiv({
        cls: "am-ev-meta",
        text: def.note ? `${meta} · ${def.note}` : meta,
      });
      const edit = row.createEl("button", {
        cls: "am-ev-edit",
        attr: { "aria-label": `Edit ${def.title}`, title: "Edit" },
      });
      setIcon(edit, "pencil");
      edit.addEventListener("click", () =>
        openEventEditor(plugin.app, plugin, def)
      );
    }
  };

  section("Recurring", recurring);
  section("One-off", single);
  return root;
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
