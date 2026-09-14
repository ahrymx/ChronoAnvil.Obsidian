// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// What is on the Events note, as data.
//
// ── THE LAST SHIPPED PAGE THAT WAS NOT A SURFACE (1.0.21) ────────────────
//
// `eventsNoteTemplate` was a string literal in `eventstore.ts`, and it had been
// one since events existed: two separate fences with three lines of prose loose
// between them, no `title` line, therefore no banner, no cog and no `⋯`. It was
// absent from `shippedNotes`, so `reconcileLayouts` never visited it — the
// template's own header stated that as policy, *"written at creation, not
// repaired in"* — and absent from `surfaceOfNote`, so `canEditSections`
// answered no and the section editor could not open on the one page in the
// vault whose whole job is managing a list.
//
// This file is that page as a catalogue, in the shape `search-sections.ts`
// established: a `FlatSection[]`, a `FlatNoteSpec`, a composer and a model.
//
// ── THE ONE THING THIS PAGE HAS THAT NO OTHER FLAT NOTE DOES ─────────────
//
// FRONTMATTER THE CATALOGUE OWNS. `composeFlatNote`'s header defines a flat
// note as "one band, one fence per section, no frontmatter the catalogue owns,
// and no context", and the homepage DROPPED its four lines of `cssclasses` in
// 4.11 to satisfy the third clause. This page cannot: `chronoanvil-events` is
// where the events are stored, and `tools/seed-vault.mjs` additionally requires
// it to open at byte 0.
//
// It does not have to. The machinery already reads past a head: `frontmatterEnd`
// finds the boundary, `replaceBody` keeps everything above it byte for byte on
// every rewrite, and `parseFlatSections` segments the YAML as a raw run — the
// same run a reader's own prose lands in. So the clause was about what the
// homepage had no reason to keep, not about what the engine can carry.
//
// ── AND NO PROSE, WHICH IS A LOSS TAKEN DELIBERATELY ─────────────────────
//
// The old template's three explanatory sentences have no home here. A flat note
// composes `soleFence(section.render())` — one fence per section, and a block
// that is not a fence is dropped on the floor. The `bracketed` prose span that
// makes the journal skeleton removable is a journal-side block kind; wiring it
// through the flat engine for three sentences would be a change to four
// planners for a paragraph that `assets/documentation.md` already carries.
//
// A reader who WROTE prose on their own Events note keeps it: reconciliation is
// additive and reorders nothing, and loose markdown is a raw run nothing here
// claims.

import {
  bannerSection,
  composeFlatNote,
  flatNoteModel,
  graphLinksSection,
} from "../core/note-sections";
import type { FlatSection, FlatNoteSpec } from "../core/note-sections";
import { sectionOf } from "../core/sections";
import { EVENTS_PROPERTY, HEADER_PREFIX } from "../core/constants";
import { basename } from "../core/util";
import { WIDGETS } from "../core/widget-registry";
import type { VaultLists } from "../core/widget-registry";
import { type SectionModel } from "../core/section-model";

// The id of the one row group on this page. Not shown to anybody — it exists so
// the composer can tell that these two sections are one block.
const EVENTS_WEEK = "week";

export const EVENTS_SECTIONS: FlatSection[] = [
  // THE BANNER, FIRST, as on every other flat page — and on this one it is the
  // whole of what makes the page editable at all. Until it existed there was no
  // `title` line here, so `page-title.ts` drew no cog and the only route to the
  // sections of the note that manages the events was a command that refused.
  //
  // NO `links:` AND NO `actions`, for the reasons `BannerSpec` gives about the
  // other singletons: this page's navigation is the diary it hangs off, and
  // neither shipped action means anything on a page that is not about a subject
  // or a day.
  bannerSection(),
  sectionOf({
    id: "manager",
    label: WIDGETS.events.label,
    blurb: WIDGETS.events.blurb,
    icon: WIDGETS.events.glyph,
    category: WIDGETS.events.category,
    // LOCKED, on `search`'s argument exactly: the note is named Events, it is
    // where the list is stored, and an Events note with no manager on it is a
    // broken link rather than a customisation. Every other section here is the
    // reader's to remove.
    locked: true,
    title: "header:🗓️ Special events",
    // THE LINE RATHER THAN `widget: "events"`, because the registry entry takes
    // no argument — there is nothing for it to compose that this does not say,
    // and nothing for it to ask.
    lines: ["events"],
    // ANCHORED TO THE WHOLE LINE, NOT THE WORD. `events:upcoming` is a
    // different widget that starts with the same six characters, and `\b`
    // matches at a colon — so a word probe here would claim the countdown's
    // fence and report the manager present on a page that has only the
    // countdown. The homepage's `/^diary(?::.*)?$/m` is the same trap, found
    // the same way.
    anchor: /^events\s*$/m,
  }),
  // ── THE ROW: WHAT IS COMING, BESIDE WHEN IT LANDS ───────────────────────
  //
  // The manager is full width above this because it is the page's subject and
  // its deck wants the room. What goes under it is the other question a reader
  // opens this page with — not "what have I got", which the manager answers,
  // but "what does that mean for this week".
  //
  // ONE BAR ABOVE BOTH COLUMNS, composed by the row's opening cell. That is the
  // layout constraint 4.70 settled and it is why `upcoming` carries a title
  // naming the ROW rather than itself: "The week ahead" is true of a countdown
  // and of a grid of the week's events, and "Coming up" over both would name
  // half the block.
  sectionOf({
    id: "upcoming",
    label: WIDGETS.upcoming.label,
    blurb: WIDGETS.upcoming.blurb,
    icon: WIDGETS.upcoming.glyph,
    category: WIDGETS.upcoming.category,
    locked: false,
    row: EVENTS_WEEK,
    title: "header:📅 The week ahead",
    // NO `form: "widget"`. The homepage's copy of this section carries one,
    // because there it is a standalone block whose bar is its own; here it is
    // the OPENER of a row and the bar it composes belongs to both columns. A
    // `widget` default would ship the row barless and hand the reader a toggle
    // that puts a title back on a block already carrying two widgets.
    // THE REGISTRY'S LINE AND ITS QUESTIONS. "How many to show" is an answer
    // only the reader can give — five is a guess about how full their list is —
    // so it is asked, unlike the grid's argument below.
    widget: "upcoming",
    anchor: /^upcoming\b/m,
  }),
  sectionOf({
    id: "week-grid",
    label: "The week's events",
    blurb: "The seven days by the hour, with only the events on them.",
    icon: WIDGETS["time-grid"].glyph,
    category: "diary",
    locked: false,
    // The second cell of the row, so it composes no bar of its own — see the
    // paragraph above, and `soloBar` for what it would take back if the
    // countdown ever left.
    row: EVENTS_WEEK,
    // ── AND `bar` IS WHAT IT WOULD TAKE BACK, WITH THE TOGGLE THAT DECLINES IT
    //
    // The sentence above named `soloBar` and left the field empty, which made
    // this the one cell on the page with nothing to say about itself: untick
    // Coming up and the grid inherits *📅 The week ahead*, a title about the
    // list that just left. The registry's own heading is the honest one.
    //
    // `asks: true` BECAUSE A CELL HAS AN ANSWER TO GIVE (5.14). In the row the
    // editor draws this box ticked and disabled — cells after the first are
    // always widgets, because the group's title is the first cell's — and the
    // question it is really holding is the one about this cell standing alone.
    bar: `${HEADER_PREFIX}${WIDGETS["time-grid"].bar}`,
    asks: true,
    // `time-grid:events` AS A LINE, NOT AS AN ASKED ARGUMENT, and this is
    // `on-this-day:always` on the Search note verbatim: the argument is the
    // PAGE'S opinion rather than a question the reader has been left holding. A
    // grid on the events page that also drew tasks, captures and every logbook
    // item would be a week with the events in it somewhere, which is what the
    // homepage's grid is already for.
    //
    // THE ANCHOR MATCHES THE KEYWORD, NOT THE ARGUMENT, so a reader who widens
    // it by hand still has a section the editor can find rather than a second
    // one it offers to add.
    lines: ["time-grid:events"],
    anchor: /^time-grid\b/m,
  }),
];

const SPEC: FlatNoteSpec = {
  sections: EVENTS_SECTIONS,
  noun: "the Events note",
  // THE ONE FLAT PAGE WHERE THIS IS NOT A PLACEHOLDER. Search's spec says
  // "block" and explains that nothing on it holds anything of the reader's;
  // this page's manager is a view too — the events live in the frontmatter, not
  // in the fence — but the unit a reader would be told about is the thing they
  // would lose sight of, and that is an event.
  heldUnit: "event",
};

// The Events note's whole markdown, frontmatter included.
//
// THE FRONTMATTER IS COMPOSED HERE AND NOWHERE ELSE. `composeFlatNote` emits a
// body; every other shipped page's composer returns exactly that. This one
// prepends the empty events list, because the note is both the page and the
// store and a fresh one with no `chronoanvil-events` key is a store the seeder
// cannot patch and `readEvents` reads as empty by accident rather than by
// design.
export function composeEventsNote(diaryRoot: string): string {
  const head = ["---", `${EVENTS_PROPERTY}: []`, "---"].join("\n");
  const body = composeFlatNote(EVENTS_SECTIONS).trimEnd();
  // THE HIDDEN PARENT LINK, UNCHANGED FROM THE TEMPLATE THIS REPLACES (4.81).
  // The events note sits beside the entries it decorates and belongs to the
  // diary in the graph as well as in the folder tree; the name is the root's
  // own basename rather than the literal `02 - Diary`, because a reader who
  // renames the folder renames the note the link has to resolve to.
  return `${head}\n${body}${graphLinksSection([basename(diaryRoot)])}`;
}

// The Events note, as the editor sees it.
export function eventsSectionModel(vault?: VaultLists): SectionModel {
  return flatNoteModel({ ...SPEC, vault });
}
