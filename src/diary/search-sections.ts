// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// What is on the Search note, as data.
//
// THE SECOND OF THE TWO NOTES 3.11 §1 CATALOGUES, and it is cheap because §1
// built the engine: `core/note-sections.ts` already plans, splices and reorders
// a flat stack of fences, so this file is a list and a noun.
//
// A SEPARATE CATALOGUE FROM THE HOMEPAGE'S, which is the decision §1.2 records
// and the reason it is worth restating here rather than only there: these two
// notes are not one page at two zooms. The homepage is where you land; Search
// is where you go on purpose. They share one directive between them and it is
// spelled differently in each — see `on-this-day` below, which is the whole
// argument in one section.
//
// WHY THE `links:` ROW IS NOT ITS OWN SECTION. The shipped note carries
// `links:home,today,scopes#diary` inside the search fence, above
// `diary-search`. On the diary surfaces navigation is its own section in a
// masthead band; here it stays where the asset has it. Promoting it would mean
// inventing a band for a single row on a note with no masthead — and
// `layout.ts` rewrites `links:` wherever it finds one, so the row is already
// maintained without a catalogue entry to hold it.

import { composeFlatNote, flatNoteModel, graphLinksSection } from "../core/note-sections";
import { bannerSection, PAGE_TITLE_IDS } from "../core/note-sections";
import type { FlatSection, FlatNoteSpec } from "../core/note-sections";
import type { VaultLists } from "../core/widget-registry";
import { WIDGET_FORM, formQuestion, type SectionModel } from "../core/section-model";

const probe = (text: string, re: RegExp): number => text.search(re);

// ── 4.70 LOOKED AT THIS PAGE FOR A ROW AND DID NOT FIND ONE ──────────────
//
// The release is about default layouts, and every other flat note in the vault
// gained a two-column band. This one did not, which is a decision and is worth
// the paragraph so the next reader does not read it as the page having been
// missed.
//
// THREE SECTIONS, EACH FULL WIDTH FOR ITS OWN REASON. `diary-search` is a
// search box with a filter row — half a page of it is a text field you cannot
// read your own query in. `timeline` is every entry ever written, grouped by
// month, and a column halves how much of it is on screen. That leaves
// `on-this-day` as the only candidate, and a cell needs two.
//
// THE PLAN'S SUGGESTION WAS `upcoming` BESIDE IT, AND IT IS WRONG HERE. Search
// is the page you go to on purpose to find something you already wrote; the
// next five events are neither written nor found. That widget's home is the
// homepage, where the page's tense is now.
//
// A PAGE THAT IS ALREADY SHORT DOES NOT NEED SHORTENING, which is the measure
// the rest of this release used: the diary dashboard went from seven blocks to
// five because seven was a scroll. Four is not.
export const SEARCH_SECTIONS: FlatSection[] = [
  // THE BANNER, FIRST. 4.10 — the head; 4.19 — the banner. Until 4.10 the only
  // route to the section editor on this note was the command palette:
  // `canEditSections` has answered yes for Search since 3.11, and nothing on
  // the page said so.
  //
  // AND IT CARRIES THE NAVIGATION ROW THAT USED TO BE A LINE INSIDE THE SEARCH
  // BLOCK. That is the whole of 4.19's change to this page, and it is the
  // clearest case the release has: `links:today,scopes#diary` was composed
  // between `header:` and `diary-search`, so it belonged to the `search`
  // section — a section a reader may remove, whose blurb says nothing about
  // navigation, and which the editor could not show as a nav row because it was
  // not one. The page rendered two strips and reported one section.
  bannerSection({ ids: PAGE_TITLE_IDS }),
  {
    id: "search",
    label: "Search the diary",
    blurb: "Full-text search over everything you have written, with filters.",
    icon: "🔎",
    // LOCKED. The note is named Search, it is the target of the ribbon entry
    // and of the "Search the diary" command, and a Search note with no search
    // box is a broken link rather than a customisation. `entry-header`'s
    // argument exactly: without it the note stops being what it is instead of
    // losing a feature.
    locked: true,
    render: () => ({
      fence: "chronoanvil",
      // THE NAVIGATION ROW LEFT THIS FENCE IN 4.19 and is the banner's now. What
      // stays is what this section is actually about: a titled bar and the
      // search box under it.
      lines: ["header:🔎 Search the diary", "diary-search"],
    }),
    locate: (text) => probe(text, /^diary-search\b/m),
  },
  {
    id: "on-this-day",
    label: "On this day",
    blurb: "This date in previous years, holding its space even when empty.",
    icon: "🕘",
    locked: false,
    // `:always`, WHERE THE HOMEPAGE'S COPY IS BARE, and the difference is the
    // reason these are two catalogue entries rather than one section carrying
    // an option.
    //
    // Bare, the widget renders nothing when it has nothing — which is right on
    // a page you land on, where an empty band is clutter. `:always` holds the
    // space — which is right on a page you navigated to deliberately, where an
    // empty band is an ANSWER: you have written nothing on this date before.
    //
    // The `SectionChoice.options` channel exists for answers only the reader
    // can give — which journal kind a bridge pulls — and this is not one of
    // those. It is two notes each having an opinion, and a catalogue is where
    // a note's opinions go.
    render: (opts) => ({
      fence: "chronoanvil",
      lines: [
        ...(opts?.form === WIDGET_FORM ? [] : ["header:🕘 On this day"]),
        "on-this-day:always",
      ],
    }),
    questions: () => [formQuestion("header:🕘 On this day")],
    locate: (text) => probe(text, /^on-this-day\b/m),
  },
  {
    id: "timeline",
    label: "All entries",
    blurb: "Every entry, newest first, grouped by month.",
    icon: "📜",
    // Freely removable. It is what the "All Entries" link opens, so removing
    // it leaves that link pointing at a note without the thing it names — but
    // that is a consequence a reader can see and undo, not a broken vault, and
    // the same is true of every unlocked section in every catalogue.
    locked: false,
    render: () => ({
      fence: "chronoanvil",
      lines: ["header:📜 All entries", "timeline"],
    }),
    locate: (text) => probe(text, /^timeline\b/m),
  },
];

const SPEC: FlatNoteSpec = {
  sections: SEARCH_SECTIONS,
  noun: "the Search note",
  // Nothing on this note holds anything of the reader's — every section is a
  // view over entries stored elsewhere — so no section declares `holds` and
  // this is never read. Named honestly rather than left blank: a unit that
  // said "thing" would be a placeholder waiting to be shipped in a message.
  heldUnit: "block",
};

// The Search note's whole markdown.
//
// REPRODUCES `assets/search.md`, which is deleted in the same patch.
export function composeSearchNote(): string {
  return composeFlatNote(SEARCH_SECTIONS).trimEnd() + graphLinksSection(["Homepage"]);
}

// The Search note, as the editor sees it.
export function searchSectionModel(vault?: VaultLists): SectionModel {
  return flatNoteModel({ ...SPEC, vault });
}
