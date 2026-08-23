// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// `logbook:<id>` — the diary's undated layer, drawn. 4.52.
//
// A LOGBOOK IS A NOTE, AND THIS IS A VIEW OF IT. `02 - Diary/Logbooks/Work
// log.md` holds the items; this widget draws them, and draws them the same
// wherever it is placed — on the logbook's own note, on the homepage, in a
// journal dashboard. That is the difference between this and every other
// region-backed widget in the plugin, all of which read the note they sit on,
// and it is why `writeRegionOf` exists one file over.
//
// THE ONLY SURFACE THE READER ASKED FOR, which decides how much this does. There
// is no bar tile, no capture destination and no dashboard section for logbooks:
// this widget shows the items, takes a new one, crosses one off, edits and
// deletes. A widget that could only display would leave the feature with no way
// in.
//
// ── TWO SOURCES, AND THE SECOND IS NOT A REGION ─────────────────────
//
// `source: "events"` is the Meetings logbook, and it reads the events note
// rather than a body region. A meeting is a dated fact with an hour on it, and
// `EventDef` has modelled dated facts — on the calendar, in the agenda, in the
// entry's own `events:` property — since 2.20. Giving meetings their own store
// would have put a second set of dated things in the vault that the calendar
// knew nothing about, which is the one outcome worth designing against.
//
// So a meeting is an event with a `time`, that sentence is the definition
// rather than a filter over one, and `Add a meeting` opens the ordinary event
// editor. What it creates lands here, on the month grid and in "coming up",
// because it is an event.

import { MarkdownPostProcessorContext, Notice, TFile, setIcon } from "obsidian";
import type AlmanacPlugin from "../../main";
import type { PluginNoteRegionHost } from "./note-regions";
import { LOGBOOK_NOTE_KEY, type LogbookDef } from "../../core/constants";
import { findLogbook } from "../../diary/logbooks";
import { composeLogbookNote } from "../../diary/logbook-sections";
import { buildLogList, LogListWatcher, type LogTypeOption } from "./log-list";
import { moment, today } from "../../core/util";
import { readEvents } from "../../events/eventstore";
import {
  describeEventWhen,
  describeRelative,
  upcomingEvents,
} from "../../events/events";
import { draftEvent, openEventEditor } from "../../events/event-ui";
import { emptyLine } from "../empty";
import { readNoteRegion } from "../../core/notestore";
import { parseLogItems, serializeLogItems, type LogItem } from "../../diary/log-items";

// How many meetings a bare `logbook:` on an events-backed book lists. Enough to
// cover the fortnight a reader is actually planning; the events note is where
// the whole list lives.
const AGENDA_COUNT = 8;

export function buildLogbook(
  host: PluginNoteRegionHost,
  rest: string,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const plugin = host.plugin;
  const id = rest.split(":")[0].trim();
  if (!id || id.toLowerCase() === "all" || id.toLowerCase() === "logbooks") {
    return buildAllLogbooks(host, ctx);
  }
  const def = findLogbook(plugin.settings.logbooks, id);
  if (!def) return refusal(plugin, id);

  return def.source === "events"
    ? buildAgenda(plugin, def)
    : buildRegionLogbook(host, def, ctx);
}

// All logbooks in one unified view with multi-type filter pills.
export function buildAllLogbooks(
  host: PluginNoteRegionHost,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const plugin = host.plugin;
  const app = host.app;
  const logbooks = plugin.settings.logbooks;

  const types: LogTypeOption[] = logbooks.map((b) => ({
    id: b.id,
    label: b.name,
    icon: b.icon,
    color: b.color,
  }));

  const itemLogbookMap = new WeakMap<LogItem, LogbookDef>();

  const loadAllItems = async (): Promise<LogItem[]> => {
    const all: LogItem[] = [];
    for (const book of logbooks) {
      if (book.source === "events") {
        const events = upcomingEvents(readEvents(app, plugin), today(), 64).filter((e) => !!e.def.time);
        for (const ev of events) {
          const item: LogItem = {
            date: ev.iso,
            time: ev.def.time ?? null,
            text: ev.def.title + (ev.def.note ? "\n" + ev.def.note : ""),
            done: null,
            mins: ev.def.duration ?? null,
          };
          itemLogbookMap.set(item, book);
          all.push(item);
        }
      } else {
        const file = app.vault.getAbstractFileByPath(book.path);
        if (file instanceof TFile) {
          try {
            const text = await app.vault.read(file);
            const region = readNoteRegion(text, LOGBOOK_NOTE_KEY);
            const parsed = parseLogItems(region);
            for (const item of parsed) {
              itemLogbookMap.set(item, book);
              all.push(item);
            }
          } catch {
            // Ignore unreadable
          }
        }
      }
    }
    return all;
  };

  const wrap = buildLogList(host, {
    key: LOGBOOK_NOTE_KEY,
    file: null,
    modifier: "journal-note--logbook-all",
    label: null,
    collapsible: false,
    startCollapsed: () => false,
    onFold: () => {},
    emptyText: "No items across any logbook yet.",
    add: {
      placeholder: "Add an entry to logbook…",
      stamp: () => ({ date: today(), time: moment().format("HH:mm"), mins: null }),
    },
    dated: true,
    createNote: null,
    addChild: (child) => ctx.addChild(child),
    types,
    getItemType: (item) => itemLogbookMap.get(item)?.id,
    getItemTypeTag: (item) => {
      const b = itemLogbookMap.get(item);
      if (!b) return undefined;
      return { label: b.name, icon: b.icon, color: b.color };
    },
    onAddMulti: async (typeId, item) => {
      const targetBook = findLogbook(logbooks, typeId);
      if (!targetBook) return;
      if (targetBook.source === "events") {
        openEventEditor(app, plugin, {
          ...draftEvent(item.date ?? today()),
          title: item.text,
          time: item.time ?? "09:00",
          duration: item.mins ?? undefined,
        });
        return;
      }
      let targetFile = app.vault.getAbstractFileByPath(targetBook.path);
      if (!(targetFile instanceof TFile)) {
        targetFile = await createLogbookNote(host, targetBook);
      }
      if (targetFile instanceof TFile) {
        const text = await app.vault.read(targetFile);
        const baseline = readNoteRegion(text, LOGBOOK_NOTE_KEY);
        const existing = parseLogItems(baseline);
        existing.push(item);
        const next = serializeLogItems(existing);
        await host.writeRegionOf(targetFile, LOGBOOK_NOTE_KEY, next, baseline);
      }
    },
    onItemUpdate: async (item, prevItem) => {
      const book = itemLogbookMap.get(item) ?? itemLogbookMap.get(prevItem);
      if (!book || book.source === "events") return;
      const file = app.vault.getAbstractFileByPath(book.path);
      if (file instanceof TFile) {
        const text = await app.vault.read(file);
        const baseline = readNoteRegion(text, LOGBOOK_NOTE_KEY);
        const parsed = parseLogItems(baseline);
        const idx = parsed.findIndex(
          (p) =>
            p.text === prevItem.text &&
            p.date === prevItem.date &&
            p.time === prevItem.time
        );
        if (idx !== -1) {
          parsed[idx] = { ...item };
          const next = serializeLogItems(parsed);
          await host.writeRegionOf(file, LOGBOOK_NOTE_KEY, next, baseline);
        }
      }
    },
    onItemDelete: async (item) => {
      const book = itemLogbookMap.get(item);
      if (!book || book.source === "events") return;
      const file = app.vault.getAbstractFileByPath(book.path);
      if (file instanceof TFile) {
        const text = await app.vault.read(file);
        const baseline = readNoteRegion(text, LOGBOOK_NOTE_KEY);
        const parsed = parseLogItems(baseline);
        const idx = parsed.findIndex(
          (p) =>
            p.text === item.text &&
            p.date === item.date &&
            p.time === item.time
        );
        if (idx !== -1) {
          parsed.splice(idx, 1);
          const next = serializeLogItems(parsed);
          await host.writeRegionOf(file, LOGBOOK_NOTE_KEY, next, baseline);
        }
      }
    },
    itemsProvider: loadAllItems,
  });

  ctx.addChild(
    new LogListWatcher(
      app,
      wrap,
      logbooks.map((b) => b.path),
      () => {
        void loadAllItems().then(() => {});
      }
    )
  );

  return wrap;
}

// An id this vault does not have.
//
// NAMES THE ONES IT DOES, which is what `journal-card` and `journals-header`
// already do for a mistyped journal: the reader has either renamed something or
// mistyped it, and in both cases the list they need is the short one this vault
// actually holds.
function refusal(plugin: AlmanacPlugin, id: string): HTMLElement {
  const wrap = createDiv({ cls: "journal-logbook journal-note" });
  const known = plugin.settings.logbooks;
  wrap.createDiv({
    cls: "journal-widget-error",
    text: known.length
      ? `No logbook called "${id}". This vault has: ${known
          .map((book) => book.id)
          .join(", ")}.`
      : `No logbook called "${id}", and none is registered — add one in Settings → Almanac → Logbooks.`,
  });
  return wrap;
}

// The ordinary kind: items in the logbook's own note.
function buildRegionLogbook(
  host: PluginNoteRegionHost,
  def: LogbookDef,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const app = host.app;
  const existing = app.vault.getAbstractFileByPath(def.path);
  return buildLogList(host, {
    key: LOGBOOK_NOTE_KEY,
    file: existing instanceof TFile ? existing : null,
    modifier: "journal-note--logbook",
    // NO FOLD BAR OF ITS OWN. A logbook is composed under a `header:` bar on
    // its own note and dropped under one anywhere else, and that bar already
    // folds — a second label inside it would be the name twice.
    label: null,
    collapsible: false,
    startCollapsed: () => false,
    onFold: () => {},
    emptyText: def.blurb
      ? `${def.blurb} Nothing here yet.`
      : "Nothing here yet.",
    add: {
      placeholder: `Add to ${def.name}…`,
      // THE DAY AND THE MINUTE, where a capture stamps only the minute. A
      // logbook spans months, so an item that said `14:32` and nothing else
      // would be a moment with no place. Asked at the moment of the add, not at
      // render: a page left open past midnight would otherwise file tomorrow's
      // item under today.
      // NO DURATION BY DEFAULT (4.55). An item added as it happens has not
      // finished happening, so a length invented here would be a measurement
      // nobody took. The *when* control beside the box is where one is given,
      // and the stamp on a card is where one is added afterwards.
      stamp: () => ({ date: today(), time: moment().format("HH:mm"), mins: null }),
    },
    dated: true,
    createNote: () => createLogbookNote(host, def),
    addChild: (child) => ctx.addChild(child),
    getItemTypeTag: () => ({ label: def.name, icon: def.icon, color: def.color }),
  });
}

// The logbook's note, made by its first item.
//
// COMPOSED FROM THE CATALOGUE, not written as a bare file with a region in it,
// so a note created this way is the same note `Set up / repair vault` writes —
// same banner, same bar, same directive. Two spellings of "a logbook's note"
// is how the two would come to differ.
async function createLogbookNote(
  host: PluginNoteRegionHost,
  def: LogbookDef
): Promise<TFile | null> {
  const app = host.app;
  const existing = app.vault.getAbstractFileByPath(def.path);
  if (existing instanceof TFile) return existing;
  try {
    const folder = def.path.slice(0, def.path.lastIndexOf("/"));
    if (folder && !app.vault.getAbstractFileByPath(folder)) {
      await app.vault.createFolder(folder);
    }
    return await app.vault.create(def.path, composeLogbookNote(def));
  } catch {
    // A create that fails is a path the vault refused — an illegal filename, a
    // folder that is really a file. Said once, where the reader is looking,
    // rather than swallowed into a list that silently never fills.
    new Notice(`Almanac: could not create ${def.path}`);
    return null;
  }
}

// The Meetings kind: everything scheduled ahead, from the events note.
function buildAgenda(plugin: AlmanacPlugin, def: LogbookDef): HTMLElement {
  const wrap = createDiv({ cls: "journal-logbook journal-logbook--agenda" });

  const bar = wrap.createDiv({ cls: "journal-logbook-actions" });
  const add = bar.createEl("button", {
    cls: "journal-btn mod-cta",
    text: "Add a meeting",
    attr: { type: "button" },
  });
  setIcon(add.createSpan({ cls: "journal-btn-icon" }), "calendar-plus");
  add.addEventListener("click", () => {
    // TODAY'S DATE AND AN HOUR, so the editor opens on a meeting rather than on
    // a blank event the reader has to make into one. `draftEvent` seeds the
    // date; the time is what makes it an appointment.
    openEventEditor(plugin.app, plugin, { ...draftEvent(today()), time: "09:00" });
  });

  // TIMED EVENTS, WHICH IS WHAT A MEETING IS. Not a filter standing in for a
  // kind: an event with an hour is an appointment, an event without one is a
  // fact about the whole day, and the day's facts belong on the calendar rather
  // than in a list of what you have to attend.
  const items = upcomingEvents(
    readEvents(plugin.app, plugin),
    today(),
    AGENDA_COUNT * 4
  ).filter((item) => !!item.def.time);

  if (!items.length) {
    emptyLine(
      wrap,
      def.blurb
        ? `${def.blurb} Nothing scheduled — an event with a time on it is a meeting, and shows here.`
        : "Nothing scheduled — an event with a time on it is a meeting, and shows here.",
      "am-ev-empty"
    );
    return wrap;
  }

  const list = wrap.createDiv({ cls: "am-ev-list" });
  for (const item of items.slice(0, AGENDA_COUNT)) {
    const row = list.createDiv({ cls: "am-ev-row am-ev-upcoming-row" });
    const text = row.createDiv({ cls: "am-ev-text" });
    text.createDiv({ cls: "am-ev-title", text: item.def.title });
    text.createDiv({ cls: "am-ev-meta", text: describeEventWhen(item.def) });
    row.createSpan({ cls: "am-ev-when", text: describeRelative(item) });
    row.addEventListener("click", () =>
      openEventEditor(plugin.app, plugin, item.def)
    );
  }
  return wrap;
}
