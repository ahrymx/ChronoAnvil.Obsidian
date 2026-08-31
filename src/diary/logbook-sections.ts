// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// What is on a logbook's note, and on the folder note above them. 4.52.
//
// PARAMETERISED BY THE DEF, the way `journal-dashboard-sections.ts` is
// parameterised by the journal and for the same reason: there are N of these
// notes, one per registered logbook, and the catalogue is a function of which
// one — its name titles the bar and its id is the directive's argument.
//
// TWO SECTIONS AND ONE OF THEM IS THE BANNER, which makes this the smallest
// catalogue in the plugin. That is the point: a logbook note is one widget over
// one region, and everything else a reader might want on the page — a chart, a
// tasks table, another logbook — is an ordinary Add away through the section
// editor, which this catalogue is what makes possible.

import { composeFlatNote, flatNoteModel, graphLinksSection } from "../core/note-sections";
import { bannerSection } from "../core/note-sections";
import type { FlatSection, FlatNoteSpec } from "../core/note-sections";
import type { VaultLists } from "../core/widget-registry";
import {
  WIDGET_FORM,
  formQuestion,
  type SectionModel,
} from "../core/section-model";
import { HEADER_PREFIX, LOGBOOK_KEYWORD } from "../core/constants";
import type { LogbookDef } from "../core/constants";

const probe = (text: string, re: RegExp): number => text.search(re);

// A directive matcher for one logbook.
//
// ESCAPED, because an id is a slug and relying on that is how a `logbook:c++`
// typed into a fence by hand becomes a thrown error rather than a section that
// reports absent.
//
// AND `(?![\w-])` WHERE `\b` WOULD BE THE OBVIOUS END, which is the part worth
// having a comment: a hyphen IS a word boundary, so `logbook:work\b` matches the
// line `logbook:work-notes`. Ids are slugs and one is routinely a prefix of
// another — `work` and `work-notes` are exactly the pair a reader would make —
// so the boundary has to exclude the character the slug is built from.
const directiveRe = (id: string): RegExp =>
  new RegExp(
    `^${LOGBOOK_KEYWORD}:${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`,
    "m"
  );

export function logbookSections(def: LogbookDef): FlatSection[] {
  return [
    bannerSection(),
    {
      id: LOGBOOK_KEYWORD,
      label: def.name,
      blurb:
        def.blurb ??
        "The items this logbook holds, newest last, each stamped with when it was written.",
      icon: def.icon,
      // LOCKED, on `search-sections.ts`'s argument in its own words: "without
      // it the note stops being what it is instead of losing a feature". A
      // logbook note with no logbook on it is a file with an invisible region
      // in it — the items are still on disk and nothing can see them.
      locked: true,
      render: (options?: Record<string, unknown>) => ({
        fence: "chronoanvil",
        lines: [
          ...(options?.form === WIDGET_FORM
            ? []
            : [`${HEADER_PREFIX}${def.icon} ${def.name}`]),
          `${LOGBOOK_KEYWORD}:${def.id}`,
        ],
      }),
      questions: () => [formQuestion(`${HEADER_PREFIX}${def.icon} ${def.name}`)],
      locate: (text) => probe(text, directiveRe(def.id)),
    },
  ];
}

const specFor = (def: LogbookDef): FlatNoteSpec => ({
  sections: logbookSections(def),
  noun: `the ${def.name} logbook`,
  heldUnit: "item",
});

// One logbook's whole markdown.
export function composeLogbookNote(def: LogbookDef): string {
  return (
    composeFlatNote(logbookSections(def)).trimEnd() +
    // `Logbooks`, not `06 - Logbooks`: the folder is `02 - Diary/Logbooks` and
    // its note is `Logbooks.md`. The old literal named nothing in any vault and
    // drew a phantom node in every graph — see `graphLinksSection`.
    graphLinksSection(["Logbooks"])
  );
}

// One logbook's note, as the editor sees it.
export function logbookSectionModel(
  def: LogbookDef,
  vault?: VaultLists
): SectionModel {
  return flatNoteModel({ ...specFor(def), vault });
}

// ── the folder note ───────────────────────────────────────────────────
//
// `02 - Diary/Logbooks/Logbooks.md`, one widget per registered logbook.
//
// WHY IT EXISTS AT ALL, given that each logbook already has a note: clicking the
// folder has to land somewhere. That is the gap 4.1 §2 closed at `02 - Diary/`
// and `03 - Journals/`, in the same words — "a folder a reader spends their
// whole time inside and it had no note at its root" — and it is cheap here
// because the widget it composes is the one every logbook note already carries.
//
// A SECTION PER LOGBOOK, NOT ONE SECTION LISTING THEM. Each is removable on its
// own, so a reader who keeps six logbooks and wants three of them on this page
// says so by removing three sections rather than by configuring a widget. It
// also means this page needs no new directive: it is the same `logbook:` line,
// N times.
//
// ── STACKED, NOT PAIRED, AND 4.70 IS WHERE THAT WAS DECIDED ──────────────
//
// This page is the obvious candidate in the whole vault for a two-column band:
// four blocks of the same widget, each a short list, one after another down a
// page. Pairing them would halve it. It is not done, and the reason is a
// property of the grammar rather than a preference.
//
// A `header:` IN A ROW FENCE IS DRAWN ONCE, FULL WIDTH, ABOVE THE COLUMNS —
// `row.ts` says so at its head, and it is right to: a bar is a section's title
// strip and a row is one section. So a row of two logbooks gets ONE bar between
// them.
//
// AND THE BAR IS THE ONLY THING THAT NAMES A LOGBOOK. `buildLogbook` draws the
// items and nothing else — no heading, no icon, no name — because on a
// logbook's own note the note is the name. Two logbooks side by side under one
// bar are two indistinguishable lists of text, and the bar names one of them,
// which is worse than untitled. The diary dashboard's row works precisely
// because a task table and a tag cloud cannot be mistaken for each other.
//
// SO THE FIX IS A PER-CELL TITLE, WHICH IS A GRAMMAR CHANGE AND NOT THIS
// RELEASE. Noted here rather than in a roadmap because this is the page that
// wants it, and the next reader looking for somewhere to put a row will land
// here first.
export function logbooksFolderSections(
  books: readonly LogbookDef[]
): FlatSection[] {
  return [
    bannerSection(),
    ...books.map((def) => ({
      id: `${LOGBOOK_KEYWORD}-${def.id}`,
      label: def.name,
      blurb: def.blurb ?? `The ${def.name} logbook, on the page about all of them.`,
      icon: def.icon,
      // UNLOCKED, where the same widget on the logbook's OWN note is locked.
      // Removing it there empties a note of the only thing it is for; removing
      // it here is a reader saying which logbooks they want on the index, which
      // is a customisation and not a breakage.
      locked: false,
      render: (options?: Record<string, unknown>) => ({
        fence: "chronoanvil",
        lines: [
          ...(options?.form === WIDGET_FORM
            ? []
            : [`${HEADER_PREFIX}${def.icon} ${def.name}`]),
          `${LOGBOOK_KEYWORD}:${def.id}`,
        ],
      }),
      questions: () => [formQuestion(`${HEADER_PREFIX}${def.icon} ${def.name}`)],
      locate: (text: string) => probe(text, directiveRe(def.id)),
    })),
  ];
}

export function composeLogbooksFolderNote(books: readonly LogbookDef[]): string {
  return (
    composeFlatNote(logbooksFolderSections(books)).trimEnd() +
    graphLinksSection(["02 - Diary"])
  );
}

export function logbooksFolderSectionModel(
  books: readonly LogbookDef[],
  vault?: VaultLists
): SectionModel {
  return flatNoteModel({
    sections: logbooksFolderSections(books),
    noun: "the Logbooks note",
    heldUnit: "item",
    vault,
  });
}
