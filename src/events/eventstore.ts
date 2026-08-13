// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Vault-facing read/write for the events list. The model and every date
// calculation live in events.ts and stay pure; this is the thin layer that
// knows about App, files and frontmatter.
//
// Reads are synchronous by design. `frontmatterOf` goes to Obsidian's metadata
// cache, which is already parsed and in memory, so the calendar can ask for the
// events of a month in the middle of building its grid without turning the
// whole paint async. Writes go through `fileManager.processFrontMatter`, the
// atomic read-modify-write that diary.ts already uses for period properties —
// it re-reads, applies the mutation and serialises, so two edits in quick
// succession can't clobber each other.

import { App, Notice, TFile } from "obsidian";
import type AlmanacPlugin from "../main";
import { EVENTS_PROPERTY } from "../core/constants";
import {
  EventDef,
  parseEvents,
  serializeEvents,
  slugifyEventId,
} from "./events";
import { createFileEnsuringFolders, frontmatterOf, getFile } from "../core/util";

// The events note's initial content. It carries the `events` widget in its own
// body, so the note isn't just a data file — it's the page where you manage
// events, which is why the list lives in a note the user can actually open.
//
// EXPORTED SO A REPAIR CAN SURVEY IT WITHOUT CREATING IT. `ensureEventsNote`
// reads the vault and writes in one call, which is right for every caller that
// wants the note to exist; the repair window has to say what it would create
// before it creates anything, and that needs the content on its own.
export function eventsNoteTemplate(): string {
  return [
    "---",
    `${EVENTS_PROPERTY}: []`,
    "---",
    "`almanac:spacer`",
    "```almanac",
    "header:🗓️ Special events",
    "```",
    "",
    "Recurring events (birthdays, holidays) fall on the same date every year.",
    "Single events (trips, sick days, milestones) can span a range of days.",
    "Both decorate the diary calendars — neither creates a diary entry.",
    "",
    "```almanac",
    "events",
    "```",
    "",
  ].join("\n");
}

export function eventsNotePath(plugin: AlmanacPlugin): string {
  return plugin.settings.paths.events;
}

export function getEventsFile(app: App, plugin: AlmanacPlugin): TFile | null {
  return getFile(app, eventsNotePath(plugin));
}

// Every event defined in the vault. A missing note, a missing property or a
// malformed list all yield an empty array rather than an error: the calendar
// asks for this on every render, and a vault that has never created an events
// note is the normal state, not a fault worth reporting.
//
// Deliberately *not* gated on settings.eventsEnabled. That toggle governs
// whether events are drawn, not whether they exist — gating here would empty
// the settings list and the manager widget the moment you turned drawing off,
// so the only way to edit an event would be to re-enable the feature first.
// The gate belongs at each drawing surface; see calendar.ts::gridEvents.
export function readEvents(app: App, plugin: AlmanacPlugin): EventDef[] {
  const file = getEventsFile(app, plugin);
  if (!file) return [];
  return parseEvents(frontmatterOf(app, file)[EVENTS_PROPERTY]);
}

// Create the events note if it's absent, and return it. Called before any
// write, so adding an event from the calendar's right-click menu works in a
// vault that predates this feature without a trip through "Set up / repair".
export async function ensureEventsNote(
  app: App,
  plugin: AlmanacPlugin
): Promise<TFile | null> {
  const existing = getEventsFile(app, plugin);
  if (existing) return existing;
  try {
    return await createFileEnsuringFolders(
      app,
      eventsNotePath(plugin),
      eventsNoteTemplate()
    );
  } catch (e) {
    console.error("[Almanac] could not create the events note", e);
    new Notice("Almanac: could not create the events note — check the console.");
    return null;
  }
}

// Replace the whole list. Callers hand over the full array rather than a delta
// because the list is small, the write is atomic either way, and a whole-list
// write can't leave the file in a half-updated state.
export async function writeEvents(
  app: App,
  plugin: AlmanacPlugin,
  defs: EventDef[]
): Promise<boolean> {
  const file = await ensureEventsNote(app, plugin);
  if (!file) return false;
  await app.fileManager.processFrontMatter(file, (fm) => {
    fm[EVENTS_PROPERTY] = serializeEvents(defs);
  });
  return true;
}

// Insert a new event or replace an existing one by id. A new event gets its
// slug id here, derived from the title and uniquified against the ids already
// in the list — the one place ids are minted, so they can't collide.
export async function saveEvent(
  app: App,
  plugin: AlmanacPlugin,
  def: EventDef
): Promise<boolean> {
  const list = readEvents(app, plugin);
  const idx = list.findIndex((e) => e.id === def.id);
  if (idx === -1) {
    const withId: EventDef = {
      ...def,
      id: def.id || slugifyEventId(def.title, list.map((e) => e.id)),
    };
    // An id minted earlier in the same session could still collide if the list
    // changed underneath; re-check against what's actually on disk now.
    if (list.some((e) => e.id === withId.id)) {
      withId.id = slugifyEventId(def.title, list.map((e) => e.id));
    }
    list.push(withId);
  } else {
    // The id is never rewritten on edit, even if the title changes: entries
    // already carry it in their frontmatter, and a renamed event should stay
    // the same event.
    list[idx] = { ...def, id: list[idx].id };
  }
  return writeEvents(app, plugin, list);
}

export async function deleteEvent(
  app: App,
  plugin: AlmanacPlugin,
  id: string
): Promise<boolean> {
  const list = readEvents(app, plugin);
  const next = list.filter((e) => e.id !== id);
  if (next.length === list.length) return false;
  return writeEvents(app, plugin, next);
}
