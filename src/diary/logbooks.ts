// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The logbook registry's own questions. 4.52.
//
// A LOGBOOK is a standing note holding what belongs to the diary and to no
// single day — a work log, what you are focused on now, links to come back to,
// the meetings ahead. `constants.ts` holds the shape and the four that ship;
// this holds the handful of answers everything else needs about them.
//
// PURE, AND THAT IS WHY IT IS HERE RATHER THAN IN THE WIDGET. No `App`, no
// plugin, no DOM: a def is data, and every question below is a function over a
// list of them. `banner-scope.ts` makes the same split for the same reason, and
// it is what lets the settings tab, the scaffold, the section editor and the
// widget all ask one implementation instead of four.

import { LogbookDef, DEFAULT_LOGBOOKS } from "../core/constants";
import { slugify } from "../core/util";
import {
  DEFAULT_EVENT_COLOR,
  EVENT_COLORS,
  type EventColor,
} from "../events/events";

// The two sources a logbook can draw from, as a set the reader of a hand-edited
// data.json is checked against.
const SOURCES = new Set<LogbookDef["source"]>(["region", "events"]);

// The note a logbook of this name would live in.
//
// DERIVED ONCE, AT CREATION, AND NEVER AGAIN — which is the whole reason
// `LogbookDef.path` is a stored field. Retitling "Work log" to "Work" must not
// orphan a note full of items, so this is what fills the field when the logbook
// is made and nothing re-derives it afterwards. The same contract `slugify`'s
// own comment describes for ids: derive from a label exactly once.
export function logbookNotePath(folder: string, name: string): string {
  // A name is a filename here, so the characters a path cannot hold are the
  // ones to lose — not the spaces and capitals, which are what make
  // `Work log.md` readable in the file explorer.
  const safe = name.replace(/[\\/:*?"<>|]/g, "").trim() || "Logbook";
  return `${folder}/${safe}.md`;
}

// A saved list, in the shape the rest of the plugin may assume.
//
// ONE PASS ON LOAD, not a fallback at each read — `normalizeJournalConfigs`'
// argument, and it holds here for the same reason: a fallback evaluated on
// every read is a second definition of what a logbook is, in the place least
// likely to be found when the two disagree.
//
// TOLERANT OF A HAND-EDITED `data.json` AND OF NOTHING ELSE. A row with no
// usable name is dropped (there is nothing to call the note, and a logbook with
// no name cannot be picked in a list); everything else is repaired in place,
// because a reader who typed `source: meetings` meant something and losing
// their whole logbook over it would be the worse answer.
export function normalizeLogbooks(
  raw: unknown,
  folder: string
): LogbookDef[] {
  if (!Array.isArray(raw)) return DEFAULT_LOGBOOKS.map((d) => ({ ...d }));
  const out: LogbookDef[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (item == null || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!name) continue;
    // An id is assigned once and never rewritten, so a saved one is kept even
    // when it no longer resembles the name — that is the point of an id. Only
    // a missing or colliding one is derived, and a collision is re-slugged
    // rather than dropped, which is `parseEvents`' rule in its own words: "no
    // event silently disappears".
    let id = typeof r.id === "string" ? slugify(r.id) : "";
    if (!id) id = slugify(name) || "logbook";
    if (seen.has(id)) {
      let n = 2;
      while (seen.has(`${id}-${n}`)) n++;
      id = `${id}-${n}`;
    }
    seen.add(id);
    const source = SOURCES.has(r.source as LogbookDef["source"])
      ? (r.source as LogbookDef["source"])
      : "region";
    const path =
      typeof r.path === "string" && r.path.trim()
        ? r.path.trim()
        : logbookNotePath(folder, name);
    const icon = typeof r.icon === "string" && r.icon.trim() ? r.icon.trim() : "🗒️";
    const blurb = typeof r.blurb === "string" && r.blurb.trim() ? r.blurb.trim() : undefined;
    // A colour the palette does not hold falls back rather than dropping the
    // book, on this function's own rule two paragraphs up: everything but a
    // missing name is repaired in place. `eventColor` makes the same repair for
    // an event whose colour was hand-edited to something unreadable.
    const color = EVENT_COLORS.includes(r.color as EventColor)
      ? (r.color as string)
      : DEFAULT_EVENT_COLOR;
    out.push({ id, name, icon, source, path, color, ...(blurb ? { blurb } : {}) });
  }
  return out;
}

// The one a directive names, or undefined.
//
// BY ID AND ONLY BY ID. A logbook's name is a label the reader retypes; the id
// is what `logbook:work` was written against, and falling back to a name match
// would make a rename silently re-point every widget in the vault at whatever
// happened to be called that afterwards.
export function findLogbook(
  list: readonly LogbookDef[],
  id: string
): LogbookDef | undefined {
  const want = id.trim().toLowerCase();
  return list.find((book) => book.id.toLowerCase() === want);
}

// The registered logbooks as the section editor offers them — `WidgetChoice`'s
// shape, which is what `VaultLists` carries.
export function logbookChoices(
  list: readonly LogbookDef[]
): { value: string; label: string }[] {
  return list.map((book) => ({
    value: book.id,
    label: `${book.icon} ${book.name}`,
  }));
}
