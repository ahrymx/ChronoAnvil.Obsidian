// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// What is on ONE JOURNAL'S dashboard, as data. 4.36 §1.
//
// ── WHICH FILE IS WHICH ──────────────────────────────────────────────────
//
// This module and `journals-dashboard-sections.ts` differ by one letter and
// describe two adjacent pages, so they are worth telling apart before either is
// read:
//
//   journals-dashboard-sections.ts   `03 - Journals/03 - Journals.md`
//                                    ONE page, about every journal at once.
//   journal-dashboard-sections.ts    `03 - Journals/Study/Study.md` and one per
//                                    registered journal. N pages, each about
//                                    the journal it sits in.
//
// ── WHY THIS EXISTS, AGAINST A REFUSAL THAT NAMED ITS OWN CONDITION ──────
//
// 4.1 §2.2 refused per-journal dashboards, and wrote down what would change its
// mind: *"ship the one page and see whether the `journals` card is actually too
// crowded, because a per-journal dashboard that duplicates that journal's own
// top-level index is exactly the duplication being argued against."* Three
// things answered it.
//
// THE CARD IS CROWDED, AND 4.13 SPENT FOUR PATCHES COMPRESSING IT. 4.13.2 took
// the counts off both bars, 4.13.3 turned a subject into a card and gave up its
// fold to do it, and 4.13.4 capped a card at four rows with a scroll because
// *"a thirty-topic card is a column of one card beside a column of air"*. Every
// one of those is a compression, and what is being compressed is several
// journals' worth of containers on one page.
//
// 4.35 SHIPPED THREE MORE PRESETS, so the vault the one page was sized for —
// Study, alone — is not the vault this plugin now proposes.
//
// AND THE DUPLICATION IS NOT WHAT THIS IS. A journal's own top-level index is
// `index:0`: the page about ONE Subject. There has never been a page about the
// JOURNAL. 4.1's own sentence says so — *"each journal's root already has the
// same folder-note gap this release closes two levels up"* — and this closes it
// one level in.
//
// ── THE DESTINATION THAT HAD NEVER EXISTED ───────────────────────────────
//
// 4.2 built a card per journal whose title link, overflow item and action
// button all call `openIndex`, which opens `folderNotePath(type.root)`. Nothing
// in this plugin has ever WRITTEN that file — `createJournalType` writes
// folders, templates and a manifest, `newTopLevel` writes the folder note of a
// CONTAINER, and `shippedNotes` was a fixed list that knew nothing about
// journals. So all three controls did nothing, silently, because the guard is
// `if (file)`; and `bannerOf` always returned null, so the banner convention 4.2
// chose *because every Obsidian banner plugin already reads it* has never had a
// note to read it from.
//
// That is not a second reason to build this page. It is the same reason, from
// the other end: 4.2 designed a card whose destination is this page.
//
// ── A FUNCTION OF THE TYPE, AND WHY THAT IS NOT A CONTEXT ────────────────
//
// `note-sections.ts` opens by forbidding a flat model to carry which note it is
// on: *"Nothing here can answer 'which note am I on', because nothing here is
// ever told. `flatNoteModel` is handed a list and a noun and has no other
// input."*
//
// This module honours that rather than bending it. There is no context
// parameter on `FlatSection.render` and none is wanted: the catalogue is BUILT
// per journal, out here, and what the model receives is still a plain list and a
// noun. Three sections vary with the type — the activity band and the contents
// grid name it in their directives, and the noun names it in the window — and
// every other section is byte-identical across journals, which is what "similar
// to one another by default" means and what makes one catalogue right.
//
// ── FOUR SHIPPED, FIVE OFFERED ───────────────────────────────────────────
//
// The diary dashboard has six sections and the journals dashboard four, and the
// difference between them is the argument this page inherits: *"a journals
// dashboard that re-listed what the card already lists would be the fourth page
// this release exists to avoid creating."*
//
// So four compose — the page's name, what has been happening, what is in the
// journal, and what is still open — and five are `optIn`: offered in *Edit this
// note's sections…*, absent from a fresh page.
//
// THE STATS BAND AND TALLY ARE `optIn`, AND AS OF 4.46 FOR TWO DIFFERENT
// REASONS. Tally keeps 4.35's: the catalogue holds a `JournalType` and no
// plugin, so it cannot see whether this vault has a vocabulary worth counting.
// 4.35 spelled that `default: never` in the journal catalogue; a flat catalogue
// spells it `optIn`, and it means the same thing.
//
// THE BAND'S REASON EXPIRED AND IT STAYED OFF ANYWAY. It was `totals`, and it
// was offered because the catalogue cannot know whether a journal sums anything
// — Projects ships no trackers at all. The merged band's `activity` preset needs
// no registry and would draw honestly on every journal. What keeps it off is the
// paragraph below rather than that one.
//
// AND `optIn` MATTERS MORE HERE THAN IT DOES ON A TEMPLATE, because this page is
// RECONCILED. `reconcileLayouts` converges every shipped note on the
// composition this release ships, so a section that composes is a section repair
// writes into every journal in every vault at the next release. A template is
// written once and is then the reader's; this page is not, and the two `never`s
// are not the same silence.
//
// REVIEW, CHARTS AND TAGS ARE `optIn` FOR THREE DIFFERENT REASONS. Recall is a
// study habit rather than a journal one and a queue over a journal nobody grades
// is an empty band; the charts region is the one section here whose value is
// entirely what the reader puts in it; and the journals dashboard already
// carries a `tag-index` over the whole journals root, so a per-journal one is a
// refinement rather than something a reader is missing.
//
// ── WHY EVERY ARGUMENT BUT TWO IS BARE ───────────────────────────────────
//
// `diary-dashboard-sections.ts` makes this argument at length and it transfers
// one level in with no word changed: `tasks-table`, `review-queue`, `tag-index`,
// `stats-band` and `journal-tally` all default to THE HOST NOTE'S OWN
// FOLDER, and this note's own folder is the journal root. Bare composes to
// exactly the scope this page wants, and a bare directive has no path in it to
// go stale when the folder is renamed.
//
// THE TWO THAT NAME THE JOURNAL name it BY ID, not by path. `journals-header`
// unions every registered journal unless told otherwise, and the contents grid
// is a widget a reader may put on any page — neither resolves a scope from where
// it sits. An id is not a path: it survives a folder rename untouched, which is
// the property the bare directives are chosen for, reached a different way.
//
// ── NO FRONTMATTER, AND ONE PROPERTY A READER MAY ADD ────────────────────
//
// `composeFlatNote` writes none, and this page must stay that way. A `type:`
// value naming a level id would make `resolveSectionHost` classify this page as
// an `index:0` note, and *Edit this note's sections…* would offer it the journal
// note catalogue instead of this one — a page describing itself as the thing it
// is a page about.
//
// The property a reader MAY add by hand is `banner:`, which `journals-cards.ts`
// has read since 4.2 and which now has a file to be written in.

import { HEADER_PREFIX, TRENDS_HEADING } from "../core/constants";
import { JOURNAL_CHARTS_FENCE } from "../charts/journal-charts";
import {
  composeFlatNote,
  flatNoteModel,
  bannerSection,
  PAGE_TITLE_IDS,
} from "../core/note-sections";
import type { FlatSection, FlatNoteSpec } from "../core/note-sections";
import type { VaultLists } from "../core/widget-registry";
import { FRAME_KEYWORD, HEADER_KEYWORD } from "../core/directive-grammar";
import { WIDGET_FORM, formQuestion, type SectionModel } from "../core/section-model";
import { DEFAULT_TALLY_TRACKER } from "./journal-sections";
import { statsBandProbe } from "./stats-band";
import { plural } from "../core/util";
import type { JournalType } from "./journal";

const probe = (text: string, re: RegExp): number => text.search(re);

// The same count `home-sections.ts`, both dashboard catalogues and
// `diary-sections.ts` make. One rule about what a configured chart looks like —
// and here it counts `jchart:` rather than `chart:`, because this page carries
// the JOURNAL charts fence. See the `charts` section for why those are two
// stores rather than one.
const journalChartLinesIn = (text: string): number =>
  text.split("\n").filter((l) => /^\s*jchart:/.test(l)).length;

// ── THE ONE ROW ON THIS PAGE, AND WHY ITS BAR READS AS IT DOES ───────────
//
// A `header:` line in a ROW fence is drawn ONCE, full width, above the columns
// — `row.ts` says so at its head, and it is right to: a bar is a section's title
// strip and a row is one section. So a row gets exactly one bar however many
// cells it holds, the OPENING cell is the only one that composes it, and the
// wording has to be true of the whole band rather than of the column that
// happens to write it.
//
// "Lately" is that wording here. Under it sit the notes written most recently
// and the tasks still open — two answers to "where is this journal right now",
// which is the question this page had no block for at all before 4.70.
const LATELY_ROW = "lately";
const LATELY_BAR = `${HEADER_KEYWORD}:🕒 Lately`;

// The whole catalogue for one journal, shipped and offered together.
//
// ORDER IS COMPOSITION ORDER FOR THE SIX THAT COMPOSE, and insertion rank for
// the four that do not: `planFlatSections` puts an added section at its
// catalogue position, so where an `optIn` row sits here is where it lands in the
// note when a reader ticks it. Tally therefore sits directly under the stats
// band — a second band of numbers about the journal belongs beside the first
// rather than under the task list — even though it is not composed.
//
// 4.70 MOVED TWO OF THE FOUR ACROSS THAT LINE. The stats band composes now (see
// its entry for the argument it had been holding since 4.46), and Recent notes
// is new and composes, which took the page from three blocks under the banner —
// the thinnest in the vault — to four, one of them a row.
export function journalDashboardSections(type: JournalType): FlatSection[] {
  const topLevel = type.levels[0];

  return [
    // THE BANNER, FIRST AND PINNED. Composed exactly as the other three
    // dashboards' are (4.19), including its three launcher ids.
    //
    // THE PAGE'S NAME IS THE FOLDER'S, which on this note is the journal's own
    // name — "Study", "Media" — because a folder note is named for its folder.
    // That is the right name and there is nothing to configure to get it.
    //
    // NO `links:` ROW, matching the journals dashboard. The contents grid below
    // is entirely destinations and the crumb trail on every note in this journal
    // now ends here, so a navigation row would be the second answer on one page.
    bannerSection({ ids: PAGE_TITLE_IDS }),

    {
      id: "activity",
      label: "Activity",
      blurb: `What has been happening in ${type.name}, over the last twelve months.`,
      icon: "🔥",
      // NAMED, BECAUSE THE BAND UNIONS EVERY JOURNAL WHEN IT IS NOT. That is
      // `journals-header`'s documented scope — "every registered journal's root
      // folder, unioned" — and on a page about ONE journal every number in it
      // would be a plausible figure about something else, which is the worst
      // shape a statistic can have. 4.36 §3 gives the keyword its argument; this
      // is the caller that needed it.
      //
      // `frame: section` RATHER THAN A `header:` BAR, on the rule both other
      // dashboards state: a card-drawing widget takes the modifier, because a
      // `header:` in the same fence would give the container both a bar and a
      // card. The band is not an overview card, but it is a band with its own
      // ground, and `SECTION_TITLES` has named it "🔥 Activity" since 4.15 §1.
      locked: false,
      render: (opts) => ({
        fence: "almanac",
        lines: [
          ...(opts?.form === WIDGET_FORM ? [] : ["frame: section"]),
          `journals-header:${type.id}`,
        ],
      }),
      questions: () => [formQuestion("frame: section", FRAME_KEYWORD)],
      locate: (text) => probe(text, /^journals-header\b/m),
    },

    {
      id: "contents",
      label: "Contents",
      blurb: `Every ${topLevel.noun.toLowerCase()} in ${type.name}, and what is inside it.`,
      icon: "🗂️",
      // LOCKED, on the argument the journals dashboard makes for its own main
      // section: a page about a journal with no way into the journal is worse
      // than no page at all. Here the section IS the page.
      locked: true,
      render: (opts) => ({
        fence: "almanac",
        lines: [
          ...(opts?.form === WIDGET_FORM ? [] : ["frame: section"]),
          `level-cards:${type.id}`,
        ],
      }),
      questions: () => [formQuestion("frame: section", FRAME_KEYWORD)],
      // EITHER SPELLING, AND THE SECOND ONE IS NOT SPECULATIVE (4.16 §1's rule,
      // reused). 4.36.0 composed `level-index` here — the table — and 4.36.1
      // composes `level-cards`, which is the same question in a card
      // arrangement. A locator that knew only one word would report this section
      // ABSENT on every page composed by the other, offer to add a second copy
      // of what is already there, and mark a LOCKED section missing on a page
      // that has it.
      //
      // THE READER KEEPS WHICHEVER THEY HAVE, and that is the decision rather
      // than the fallout. `repairNote` is additive by construction, so a page
      // composed by 4.36.0 is never rewritten to cards — which is right, because
      // a table is a coherent thing to prefer on a journal with forty subjects
      // and this section is the one place a reader cannot untick. Swapping is a
      // one-word edit they can make and undo.
      locate: (text) => probe(text, /^level-(?:index|cards)\b/m),
    },

    {
      id: "stats",
      label: "Stats band",
      blurb: `A row of numbers about ${type.name} — you pick each one.`,
      icon: "🔢",
      locked: false,
      // ── IT WAS `totals`, AND IT IS THE SAME SECTION (4.46) ────────────
      //
      // The id changed with the widget under it: `journal-totals` and
      // `topic-stats` merged into `stats-band`, because they were one idea drawn
      // twice — see `stats-band.ts`. What this page offers is the band, and
      // Totals is one of the four presets it can be set to.
      //
      // RENAMING AN ID IS A REAL COST AND IT IS PAID DELIBERATELY. A reader's
      // saved layout naming `totals` no longer resolves, so this page falls back
      // to the composed set for them — which is the same four sections it has
      // always composed, because `totals` was never one of them. Nothing is lost
      // that was on the page.
      //
      // OFFERED, NOT COMPOSED, AND FOR A DIFFERENT REASON THAN BEFORE. The old
      // entry was optIn because the catalogue cannot see the registry and so
      // cannot know whether this journal sums anything — Projects ships no
      // trackers at all. The band's `activity` preset needs no registry and
      // would draw honestly on every journal, so that reason has expired. It
      // stays optIn on the OTHER one this file's header states: this page is
      // RECONCILED, so a section that composes is a section repair writes into
      // every journal in every vault at the next release. Making that move is a
      // decision worth its own release rather than a side effect of a merge.
      //
      // ── AND 4.70 IS THAT RELEASE ────────────────────────────────────
      //
      // The paragraph above names its own expiry: the surviving reason was
      // never that composing this would be WRONG, it was that composing it is a
      // decision that should be made on purpose rather than fall out of a merge
      // (4.46). This release is about what a repaired vault's default pages
      // hold, so it is the one that gets to make it.
      //
      // WHAT THE PAGE WAS WITHOUT IT: a journals-header card, a level-cards
      // card and a task table — two chrome-heavy composites and a list, with no
      // number on the page that a reader could choose. `stats-band` is the one
      // widget here whose cells are the reader's own picks, and it drew on no
      // journal dashboard in any vault.
      //
      // BARE IS WHAT MAKES IT SAFE TO COMPOSE. `resolveStatPreset` gives a bare
      // band the scope's default — `activity` on a journal folder note — which
      // counts notes and dates and needs no tracker at all. So the journal with
      // no trackers registered gets a band that says something true rather than
      // an empty strip, which is the objection the 4.46 entry raised first and
      // answered in the same paragraph.
      // NO QUESTIONS HERE EITHER, AS OF 4.48. The four boxes moved onto the
      // cells — one `⋯` per cell, revealed on hover — for the reason
      // `journal-sections.ts` gives at its own copy of this section: a row of
      // controls modelling a row of cells, drawn beside it. The scope this page
      // is (`journal`, because the note is a journal's own folder note) is
      // derived by the band at render time, as it always was, so nothing was
      // lost by the catalogue no longer naming it.

      // BARE, LIKE EVERY OTHER SCOPED DIRECTIVE ON THIS PAGE. `resolveStatPreset`
      // gives a bare band the scope's default — `activity` here — which is the
      // preset a page about a whole journal wants, and an argument the plugin
      // would have supplied anyway is one more thing to go stale.
      // FRAMED, NOW THAT IT COMPOSES, AND FRAMED RATHER THAN BARRED. Every
      // composed block on a dashboard is titled — see
      // `test/dashboard-sections.test.ts` — and a bare band was untitled the
      // moment it stopped being optIn. `frame: section` is the answer the two
      // blocks directly above it already give, and it needs no new string: a
      // framed fence titles itself from `SECTION_TITLES`, which has named this
      // keyword "🔢 Stats" since the 4.46 merge. A `header:` bar would be a
      // second name for the same widget, kept in a second place.
      render: (opts) => ({
        fence: "almanac",
        lines: [
          ...(opts?.form === WIDGET_FORM ? [] : ["frame: section"]),
          "stats-band",
        ],
      }),
      questions: () => [formQuestion("frame: section", FRAME_KEYWORD)],
      // ALL THREE SPELLINGS. A page composed before 4.46 that a reader had ticked
      // Totals onto carries `journal-totals`, and a locator that knew only the
      // new word would call the section missing and offer to add a second band.
      locate: (text) => probe(text, statsBandProbe()),
    },

    {
      id: "tally",
      label: "Tally",
      blurb: `How many ${plural(topLevel.noun).toLowerCase()} sit at each value of a tracker.`,
      icon: "🔢",
      locked: false,
      optIn: true,
      // `status` FOR 4.35'S REASON, WHICH IS THE ONLY ONE AVAILABLE: it is the
      // single id every journal is guaranteed to define, unified across every
      // journal and every note type in `constants.ts`, and the only select this
      // catalogue can name without reading a registry it cannot see.
      render: () => ({
        fence: "almanac",
        lines: [`journal-tally:${DEFAULT_TALLY_TRACKER}`],
      }),
      locate: (text) => probe(text, /^journal-tally:/m),
    },

    {
      id: "recent",
      label: "Recent notes",
      blurb: `The notes you wrote most recently in ${type.name}, newest first.`,
      icon: "🕒",
      // ── THE THING A JOURNAL DASHBOARD COULD NOT SAY ─────────────────
      //
      // This page counted (`journals-header`), grouped (`level-cards`) and
      // listed what was undone (`tasks-table`), and had no answer at all to
      // "what have I been writing". The diary's own dashboard has `timeline`
      // for that question; a journal had nothing, on any page, at any scope.
      //
      // BARE, WHICH IS THE JOURNAL ROOT. This note is the journal's folder
      // note, so `journalFolderScope` resolves an empty argument to exactly the
      // subtree the page is about — and a path written into the directive would
      // be one more thing to go stale when the folder is renamed. Every other
      // scoped directive on this page makes the same call and states it.
      //
      // NO `all` KEYWORD OFFERED, unlike the journals dashboard's copy: this
      // page is about one journal, and a control offering "every journal" would
      // silently widen a page whose every other section is scoped to it. That
      // is `review`'s sentence below, and it is the same rule.
      locked: false,
      row: LATELY_ROW,
      questions: (spec) => [
        formQuestion(LATELY_BAR, HEADER_KEYWORD),
        {
          kind: "folder",
          key: "folder",
          label: "the folder to list",
          directive: "journal-recent",
          hostFolder: spec.hostFolder ?? null,
        },
      ],
      render: (opts) => ({
        fence: "almanac",
        lines: [
          ...(opts?.form === WIDGET_FORM ? [] : [LATELY_BAR]),
          "journal-recent",
        ],
      }),
      locate: (text) => probe(text, /^journal-recent\b/m),
    },

    {
      id: "open-tasks",
      label: "Open tasks",
      blurb: `Still-open Almanac tasks from every note in ${type.name}.`,
      icon: "⏳",
      // The tasks live in the notes this aggregates, not here, so removing the
      // section costs nothing but the view — every other catalogue makes the
      // same call for this widget.
      //
      // BARE, AND NO `all` KEYWORD. `buildTasksTableRegion` takes `folders[0]`,
      // so a keyword naming several roots resolves to the first rather than to
      // all of them; the journals dashboard's own catalogue states this at
      // length and the registry entry repeats it. Bare is the journal root,
      // which is the whole of what this page wants.
      locked: false,
      questions: (spec) => [
        {
          kind: "folder",
          key: "folder",
          label: "the folder to collect tasks from",
          directive: "tasks-table",
          hostFolder: spec.hostFolder ?? null,
        },
      ],
      // SECOND CELL OF THE LATELY ROW (4.70), SO NO BAR AND NO TOGGLE FOR ONE.
      // Recent notes opens the row and composes the single title this fence
      // gets — see `LATELY_BAR` above the catalogue for why it is worded for
      // the band rather than for either column.
      row: LATELY_ROW,
      render: () => ({ fence: "almanac", lines: ["tasks-table"] }),
      locate: (text) => probe(text, /^tasks-table\b/m),
    },

    {
      id: "review",
      label: "Review",
      blurb: `What is due for recall across ${type.name}, soonest first.`,
      icon: "🔁",
      locked: false,
      optIn: true,
      // OFFERED RATHER THAN COMPOSED, and the reason is not the one Totals has.
      // The widget works on any journal; what varies is whether the reader keeps
      // recall cards at all. Study does and the other three presets do not, so a
      // composed queue would be an empty band on three journals out of four —
      // and unlike a template, this page is reconciled, so composing it would
      // put that band on every journal in every vault at the next repair.
      //
      // NO `all` KEYWORD OFFERED, unlike the journals dashboard's copy: this
      // page is about one journal, and a control offering "every journal" here
      // would silently widen a page whose every other section is scoped to it.
      questions: (spec) => [
        formQuestion("header:🔁 Review"),
        {
          kind: "folder",
          key: "folder",
          label: "the folder to review",
          directive: "review-queue",
          hostFolder: spec.hostFolder ?? null,
        },
      ],
      render: (opts) => ({
        fence: "almanac",
        lines: [
          ...(opts?.form === WIDGET_FORM ? [] : ["header:🔁 Review"]),
          "review-queue",
        ],
      }),
      locate: (text) => probe(text, /^review-queue\b/m),
    },

    {
      id: "tags",
      label: "Tags",
      blurb: `Every tag on the notes in ${type.name}, most-used first.`,
      icon: "🏷️",
      locked: false,
      // OFFERED, because the journals dashboard already carries a `tag-index`
      // over the whole journals root. A per-journal cloud is a refinement of
      // something a reader already has rather than a thing they are missing.
      optIn: true,
      questions: (spec) => [
        {
          kind: "folder",
          key: "folder",
          label: "the folder to read tags from",
          directive: "tag-index",
          hostFolder: spec.hostFolder ?? null,
        },
      ],
      render: () => ({
        fence: "almanac",
        lines: ["header:🏷️ Tags", "tag-index"],
      }),
      // MATCHES THE KEYWORD, NOT THE ARGUMENT, so a reader who repoints the
      // cloud at their own folder still has a section the editor can find.
      locate: (text) => probe(text, /^tag-index\b/m),
    },

    {
      id: "charts",
      label: "Trends and statistics",
      blurb: `Tracker charts over the whole of ${type.name}.`,
      icon: "📊",
      locked: false,
      // OFFERED RATHER THAN COMPOSED, unlike every other dashboard in the
      // plugin, and the difference is which fence this is. The four diary pages
      // and the two folder notes compose `almanac-charts` SEEDED WITH NOTHING —
      // an empty managed region with an Add button, which is a working
      // affordance. This region is the same shape, and would be the same
      // affordance; what makes it `optIn` is that it is the fourth chart surface
      // a journal note can carry and the first that reconciliation would push
      // onto every journal in every vault.
      //
      // NOT LOCKED AND NOT FREELY REMOVABLE ONCE ADDED, which is the distinction
      // every catalogue draws for this section: a reader who wants no charts
      // should be able to say so, and a reader with nine configured must not
      // lose them to an untick. `holds` is what says so.
      optIn: true,
      holds: (text) => journalChartLinesIn(text),
      // THE JOURNAL FENCE, NOT THE DIARY'S — and 4.1 drew this line in advance.
      // `journals-dashboard-sections.ts` takes `almanac-charts` on the stated
      // grounds that *"`almanac-journal-charts` belongs to a journal's own index
      // notes and reads a different store. This page sits above every journal
      // rather than inside one, so it takes the former."* This page sits inside
      // one.
      //
      // AND THE SCOPE IS NEW CAPABILITY OUT OF AN EXISTING WIDGET. A journal
      // chart's scope is the host note's own folder, so until this page existed
      // the widest one a reader could draw covered a single top-level container.
      // Here it covers the journal.
      // `TRENDS_HEADING`'s words, not a second spelling of them. That constant
      // is what `retitleTrends` converges every other page's bar on, and a
      // fourth wording living here is the drift `RETIRED_WORDS` exists to catch
      // one layer up. The `## ` comes off because a `header:` argument is a
      // title, not a markdown heading — the same `replace` every other
      // catalogue's chart section makes.
      render: () => ({
        fence: JOURNAL_CHARTS_FENCE.slice(3),
        lines: [`${HEADER_PREFIX}${TRENDS_HEADING.replace(/^#+\s*/, "")}`],
      }),
      locate: (text) => text.indexOf(JOURNAL_CHARTS_FENCE),
    },
  ];
}

const specFor = (
  type: JournalType,
  hostFolder: string | null = null
): FlatNoteSpec => ({
  sections: journalDashboardSections(type),
  hostFolder,
  // NAMED FOR THE JOURNAL, which is what every message the model writes is
  // built from: *"The Contents section can't be removed from the Study
  // dashboard"* rather than from "this note". A vault has one diary and N of
  // these, so a generic noun here would be the one surface whose refusal cannot
  // tell a reader which page it is about.
  //
  // WITH THE ARTICLE, as both sibling catalogues spell it — the model composes
  // it into the middle of a sentence. `modelForSurface` supplies its own,
  // article-less noun for the picker's heading, which is the same split those
  // two already make.
  noun: `the ${type.name} dashboard`,
  heldUnit: "chart",
});

// One journal dashboard's whole markdown.
// Journal notes start from the journal's named dashboard (e.g. `Study.md`),
// detached from the general journal dashboard `03 - Journals.md`.
export function composeJournalDashboardNote(type: JournalType): string {
  return composeFlatNote(journalDashboardSections(type));
}

// One journal dashboard, as the editor sees it.
//
// `hostFolder` is what an empty folder answer resolves to, and on a folder note
// that is the folder itself — this journal's root. Defaulting to null keeps the
// composer and the scaffolder writing exactly what they wrote before.
export function journalDashboardSectionModel(
  type: JournalType,
  hostFolder: string | null = null,
  // What this vault can answer a widget's argument with (4.15 §4). See
  // `FlatNoteSpec.vault` — supplied by the caller that holds the plugin.
  vault?: VaultLists
): SectionModel {
  return flatNoteModel({ ...specFor(type, hostFolder), vault });
}
