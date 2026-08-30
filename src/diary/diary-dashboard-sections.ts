// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// What is on the diary dashboard, as data. 4.1 §2.1.
//
// WHY THIS NOTE EXISTS. `02 - Diary/` is a folder a reader spends their whole
// time inside and it had no note at its root. The four period dashboards are
// nested under it, so clicking the folder itself landed nowhere — and the
// homepage's `diary:3` card was doing duty for the diary as a whole while also
// being one of five sections on a page about everything.
//
// A FOLDER NOTE rather than a `Diary Dashboard.md` beside the folder, because
// clicking the folder is the gesture readers already have and
// `folderNotePath(folder)` is how this plugin has said "the page about this
// folder" since 2.57. A second convention for one idea is what the vocabulary
// registry exists to prevent, one layer down.
//
// A THIRD FLAT CATALOGUE, not a parameter on the homepage's. The homepage and
// this page are two pages, not one page at two zooms — `note-sections.ts` opens
// by refusing exactly that collapse, and the reason holds here: the homepage is
// where you land, this is the page about the diary, and they disagree about
// `on-this-day` in the same way the homepage and Search already do.
//
// ── TWO PLACES THIS DEPARTS FROM §2.1's TABLE, AND WHY ────────────────────
//
// BARE DIRECTIVES WHERE THE ROADMAP WROTE PATHS. §2.1 proposed
// `tasks-table:<diaryRoot>` and `tag-index:<diaryRoot>`, with the configured
// root resolved at compose time the way `homeSections` resolves it. That is
// right for the homepage and wrong here, and the difference is that THIS NOTE
// IS THE FOLDER'S OWN NOTE. Both directives already default to the host note's
// own folder — `tasks-table` through `journalFolderScope`, `tag-index` since
// 3.11 §6 — and this note's own folder IS the diary root. So the bare form
// composes to exactly the scope §2.1 asked for.
//
// It is also strictly better, by the cost `homeSections` states against itself:
// "a path written into a directive is a path that does not follow a later
// rename the way a settings read would." A bare directive on a folder note has
// no path to go stale. Rename `02 - Diary` and this page follows its folder,
// with nothing to remap — which is the same argument §2.5 uses for deriving the
// dashboard's own path instead of adding a settings key, applied one level in.
//
// The homepage keeps its explicit `tag-index:<diaryRoot>`, and must: it sits at
// the vault root, where "the host's own folder" means the whole vault.
//
// `on-this-day:always`, NOT BARE. §2.1's table says `on-this-day`; its argument
// says the section belongs here because this is where it "stops being a
// surprise". Those disagree, and the argument wins. Bare, the widget renders
// NOTHING until the reader has a year of entries — which is precisely the
// "invisible in year one, then appears unannounced" failure 3.13 §11 took it
// off the homepage FOR. `:always` holds the space, and on a page you navigated
// to deliberately an empty band is an ANSWER: you have written nothing on this
// date before. That is `search-sections.ts`'s reasoning verbatim, and this is
// the same kind of page.
//
// ── HOW EACH SECTION IS TITLED, AND WHY IT IS NOT ALL ONE WAY ────────────
//
// List and table widgets take a `header:` bar. Card-drawing widgets take
// `frame: section`. Both produce the same titled, collapsible strip; what
// differs is who owns the fold, and the difference is forced rather than
// chosen.
//
// A `header:` and a composite widget in ONE fence give that fence's container
// both a header bar and a card modifier class — `ui/widgets/index.ts` sets
// `isOverviewCard` off `OVERVIEW_KINDS` and applies the class to the very
// container the bar was drawn into — so the block renders a bordered card
// nested inside a bordered section surface. That is 4.1 §3.1's "two borders,
// two paddings and two backgrounds arguing", and it is why §3.3 refuses a fence
// carrying both `header:` and `frame: section` in the grammar rather than
// picking a winner.
//
// THIS PAGE SHIPPED WITHOUT THE MODIFIER FIRST, and the first look at it in a
// real vault is what built the modifier. Composing the cards bare avoided the
// doubling and produced the other half of §3.1's argument instead: withholding
// the card leaves `.ca-journal-widget-block` and nothing else, so `Today` and
// `This month` were loose content in the note's flow — no title, no fold, and
// visibly not the same kind of thing as the three sections under them. §3.1
// predicted exactly that ("in a markdown note nothing replaces it"), which is
// the whole reason the modifier takes three values rather than two.

import { HEADER_PREFIX, TRENDS_HEADING } from "../core/constants";
import {
  composeFlatNote,
  flatNoteModel,
  bannerSection,
  PAGE_TITLE_IDS,
  graphLinksSection,
} from "../core/note-sections";
import type { FlatSection, FlatNoteSpec } from "../core/note-sections";
import type { VaultLists } from "../core/widget-registry";
import { WIDGET_FORM, formQuestion } from "../core/section-model";
import type { SectionModel } from "../core/section-model";
import { FRAME_KEYWORD, HEADER_KEYWORD } from "../core/directive-grammar";

const probe = (text: string, re: RegExp): number => text.search(re);

// How many charts the reader has configured here. The same count
// `home-sections.ts` and `diary-sections.ts` make, and deliberately the same
// rule rather than a third opinion about what a configured chart looks like.
const chartLinesIn = (text: string): number =>
  text.split("\n").filter((l) => /^\s*chart:/.test(l)).length;

// How many upcoming events the diary card folds in below its grid.
//
// THE SAME THREE THE HOMEPAGE USES, and that is the decision rather than an
// oversight. §2.1: a dashboard about the diary "should not simply be that
// widget again at a larger size" — what makes this page different is the five
// sections around the card, not a longer agenda inside it.
//
// §2.3 asks whether the two pages opening with the same widget means one of
// them is wrong. That question is answered by looking at both pages in a vault,
// which is work this release has not done; the honest state is that the card is
// kept, the differentiation is the page, and the question is still open.
const DASHBOARD_AGENDA = 3;

// ── THE TWO ROWS THIS PAGE COMPOSES, 4.70 ────────────────────────────────
//
// The page shipped as SEVEN stacked blocks, which is the complaint this release
// is about: a note you scroll for a minute to see what is on it. Two rows take
// it to five without hiding anything, and the pairs are not arbitrary.
//
// THE TWO CARDS ARE NOT IN EITHER ROW, and that is the first decision. `diary`
// and `month-summary` are composite cards — a greeting, a stat strip, a month
// grid and an agenda; an overview card and a date navigator — and both carry
// `frame: section`, which is a modifier on the FENCE. A card in a cell would
// either lose its frame or wrap the whole row in one, and neither is the thing
// the modifier was built to say. They keep their width, their frame and their
// bytes.
//
// SO THE ROWS ARE THE FOUR SMALL SECTIONS, PAIRED BY WHAT THEY ARE:
//
//   • `INDEXES` — what is open beside what is tagged. Both read the whole
//     diary folder, both take the same `folder` question with the same host,
//     and both are lists you scan rather than read.
//   • `LOOKING_BACK` — this date in previous years beside the sleep aggregate.
//     Both are the diary's HISTORY summarised, which is what makes this page
//     different from the homepage, and neither exists anywhere else.
//
// AND THE PAGE STOPS OPENING LIKE THE HOMEPAGE. §2.3 left open the question of
// two pages that both begin with `diary:3`; 4.70 did NOT answer it by copying
// the homepage's top row down here, which was the available and wrong move —
// two pages whose first screen is the same row are one page written twice. The
// card stays full width here and narrow there, and what follows it diverges.
//
// ── WHO OWNS A ROW'S TITLE ───────────────────────────────────────────────
//
// THE FIRST CELL COMPOSES IT, AND IT NAMES THE ROW RATHER THAN THE CELL. This
// page's own rule is that no fence is loose content — every block is titled by
// a `header:` bar or by `frame: section`, because §3.1 found that a bare widget
// in a markdown note has nothing standing in for a title. A row is one fence,
// and `row.ts` draws a `header:` in one full width ABOVE the columns, so a row
// gets exactly ONE bar however many cells it has. Two cells each composing
// their own would put two full-width bars over a two-column band, naming
// neither column.
//
// SO THE BAR IS THE BAND'S, and it is worded that way: "Across the diary" and
// "Looking back" are true of both cells under them, where "Open tasks" would be
// a title lying about half of what it sits over.
//
// THE COST, STATED: removing the first cell removes the bar with it, because a
// section's lines go when the section does. The row survives, untitled, until
// the reader ticks the bar back on whichever cell now opens it — which is the
// same trade every `header:` in this catalogue already makes, one cell wider.
const INDEXES = "indexes";
const INDEXES_BAR = "header:🗂️ Across the diary";
const LOOKING_BACK = "back";
const LOOKING_BACK_BAR = "header:🕘 Looking back";

export const DIARY_DASHBOARD_SECTIONS: FlatSection[] = [
  // THE BANNER, FIRST. 4.10 gave this page a head; 4.19 made the head a banner
  // — see `bannerSection`. This page's own name is the folder's, which is worth
  // knowing before it is read: a default vault shows "02 - Diary" here, because
  // a folder note is named for its folder.
  //
  // NO `links:` ROW, which is what this banner's spec says by leaving the field
  // out and is not an omission. The diary card below carries destination pills
  // of its own — 4.10 made the same call here and wrote it down — so a
  // navigation row in the banner would be the second answer on one page that
  // the whole release is about removing.
  bannerSection({ ids: PAGE_TITLE_IDS }),
  {
    id: "today",
    label: "Today",
    blurb: "The greeting, today's numbers, the month grid and what's coming up.",
    icon: "📆",
    // LOCKED, on `home-sections`' argument for the same widget: a page about
    // the diary with no way into the diary is worse than no page at all. It is
    // also the only section here carrying navigation — the card's destination
    // pills are this note's links row, which is why there is no `links:`
    // section beside it.
    locked: true,
    // `frame: section` — the card gives up its own frame and takes the same
    // collapsible bar every other section on this page has. See the header
    // note: standing bare, it was the one block here that could not be folded
    // and did not look like its siblings.
    render: (opts) => ({
      fence: "chronoanvil",
      lines: [
        ...(opts?.form === WIDGET_FORM ? [] : ["frame: section"]),
        `diary:${DASHBOARD_AGENDA}`,
      ],
    }),
    questions: () => [formQuestion("frame: section", FRAME_KEYWORD)],
    locate: (text) => probe(text, /^diary\b/m),
  },
  {
    id: "this-month",
    label: "This month",
    // "banner" LEFT THIS SENTENCE IN 4.19 — see `DIARY_SECTIONS`' summary for
    // the argument. This page's banner is the section at the top of it.
    blurb: "What the month holds, and its date navigator.",
    icon: "📅",
    // `frame: section`, not a `header:` bar — a period summary takes the
    // overview card, and a bar in the same fence would nest that card inside a
    // section surface. The modifier withholds the card and supplies the bar
    // instead. See the header note above.
    //
    // NO `button:new-month` BESIDE IT, unlike the monthly dashboard's masthead.
    // There the summary IS the page and creating this month's entry is the
    // page's own action; here it is one section of six, and a create button on
    // a page about the diary as a whole is a shortcut competing with the diary
    // card's own pills.
    //
    // `buildMonthSummary` reads `month-start` from the host note's frontmatter
    // and falls back to `moment()` — this note carries no such property and is
    // not meant to, so the section is always "this month", which is what the
    // label promises.
    locked: false,
    render: (opts) => ({
      fence: "chronoanvil",
      lines: [
        ...(opts?.form === WIDGET_FORM ? [] : ["frame: section"]),
        "month-summary",
      ],
    }),
    questions: () => [formQuestion("frame: section", FRAME_KEYWORD)],
    locate: (text) => probe(text, /^month-summary\b/m),
  },
  {
    id: "open-tasks",
    label: "Open tasks",
    blurb: "Still-open ChronoAnvil tasks from every entry under the diary.",
    icon: "⏳",
    // The tasks live in the entries this aggregates, not here, so removing the
    // section costs nothing but the view — `diary-sections.ts` makes the same
    // call for the same widget.
    //
    // NO `,period` FLAG. That suffix restricts a table to the host dashboard's
    // current week or month, and it is right there because a period dashboard
    // is scoped to a period. This page is scoped to a FOLDER, has no period
    // property for the flag to read, and its whole job is the diary entire.
    locked: false,
    // FIRST CELL OF THE INDEXES ROW — see the note above the catalogue.
    row: INDEXES,
    questions: (spec) => [
      {
        kind: "folder",
        key: "folder",
        label: "the folder to collect tasks from",
        directive: "tasks-table",
        hostFolder: spec.hostFolder ?? null,
      },
      formQuestion(INDEXES_BAR, HEADER_KEYWORD),
    ],
    // THE BAR IT COMPOSES IS THE ROW'S, NOT ITS OWN — "Across the diary"
    // rather than "Open tasks", because it is drawn over the tag cloud beside
    // it as well. See the note above the catalogue, which owns this argument.
    render: (options) => ({
      fence: "chronoanvil",
      lines: [
        ...(options?.form === WIDGET_FORM ? [] : [INDEXES_BAR]),
        "tasks-table",
      ],
    }),
    locate: (text) => probe(text, /^tasks-table\b/m),
  },
  {
    id: "tags",
    label: "Tags",
    blurb: "Every tag under the diary, most-used first, with the notes carrying it.",
    icon: "🏷️",
    // MOVED HERE FROM THE HOMEPAGE (§2.1), where it is one of five sections
    // today and is the one most likely to be unwanted on a page you land on.
    //
    // "Moved" is a change to what a NEW vault composes, and nothing else:
    // `home-sections.ts` marks its copy `optIn` rather than deleting it, so an
    // existing homepage keeps its Tags block AND keeps having a catalogue that
    // recognises it. That is 3.13 §11's mechanism, reused rather than
    // reinvented — see the note there.
    //
    // MOVED AGAIN IN 4.70, UP TWO PLACES, to sit beside Open tasks in the
    // indexes row. The catalogue's order is the order a NEW page is composed
    // in; an existing one is not reordered, because `reconcileLayouts` is
    // additive and touches nothing that is already there.
    locked: false,
    row: INDEXES,
    // NO FORM QUESTION, WHICH IS THE SECOND CELL'S SHAPE. The row's one bar is
    // Open tasks' to compose; a toggle here would offer the reader a second
    // full-width bar over the same band, which is the doubling the whole rule
    // exists to prevent.
    questions: (spec) => [
      {
        kind: "folder",
        key: "folder",
        label: "the folder to read tags from",
        directive: "tag-index",
        hostFolder: spec.hostFolder ?? null,
      },
    ],
    render: () => ({ fence: "chronoanvil", lines: ["tag-index"] }),
    // MATCHES THE KEYWORD, NOT THE ARGUMENT, so a reader who repoints the cloud
    // at their own folder still has a section the editor can find.
    locate: (text) => probe(text, /^tag-index\b/m),
  },
  {
    id: "on-this-day",
    label: "On this day",
    blurb: "This date in previous years, holding its space even when empty.",
    icon: "🕘",
    // SHIPPED HERE, WHERE THE HOMEPAGE ONLY OFFERS IT. 3.13 §11 took it off the
    // homepage because "the homepage is the only note in the vault that is
    // about NOW" — and that reasoning survives this release intact. It is also
    // exactly what makes this page the right home for it: a page about the
    // diary is allowed to be about the past.
    //
    // Not `optIn`, therefore. On the homepage the flag records "offered, not
    // shipped"; here the section is the point.
    //
    // AND AS OF 4.70 IT IS THE HOMEPAGE'S ONLY COPY NO LONGER OFFERED IN A ROW
    // THERE EITHER — `upcoming` took the cell it used to be offered into. The
    // widget is not retired and every existing homepage keeps its block; what
    // changed is which page COMPOSES it, and that page is this one.
    locked: false,
    row: LOOKING_BACK,
    render: (options) => ({
      fence: "chronoanvil",
      lines: [
        ...(options?.form === WIDGET_FORM ? [] : [LOOKING_BACK_BAR]),
        "on-this-day:always",
      ],
    }),
    questions: () => [formQuestion(LOOKING_BACK_BAR, HEADER_KEYWORD)],
    locate: (text) => probe(text, /^on-this-day\b/m),
  },
  {
    id: "sleep",
    label: "Sleep",
    blurb: "Nights logged, average sleep, and the typical bedtime and wake-up.",
    icon: "😴",
    // ── COMPOSED SOMEWHERE, AT LAST (4.70) ───────────────────────────────
    //
    // `sleep-summary` shipped in 3.2, survived 3.11's retirement review by name
    // — that roadmap declines to retire it twice, at §153 and §419 — and until
    // this release appeared on NO page a repaired vault composes. A widget that
    // is only reachable by typing its keyword is a widget nobody has.
    //
    // NOT THE HOMEPAGE, AND ITS REFUSAL THERE STILL STANDS. `home-sections.ts`
    // declines this section because "sleep is a chart, and Trends and
    // Statistics is where a chart goes" — an argument about a page that is
    // about NOW, where an aggregate over every night ever logged is the wrong
    // tense. This page is about the diary ENTIRE, which is the tense the widget
    // is written in: `sleep-summary` scopes to the daily folder wholesale, so
    // there is exactly one page in the vault whose scope is its scope, and this
    // is it.
    //
    // AND IT IS NOT WHAT A CHART SAYS. Typical bedtime is derived — the typical
    // wake minus the average sleep, wrapped across midnight, because a naive
    // mean of bedtimes is wrong — and "shortest night" is an extreme rather
    // than a trend. Neither is a line a chart draws.
    //
    // NOT `tracker-stat:Sleep`, WHICH 4.70 ALSO ADDED. That widget says the
    // four things true of ANY tracker; this one reads two coupled properties
    // and derives a third. The registry states the same distinction from the
    // other end, and it is why both exist.
    locked: false,
    row: LOOKING_BACK,
    // SECOND CELL, SO NO BAR AND NO TOGGLE FOR ONE — On this day composes the
    // row's, and it says "Looking back" because it is drawn over this too.
    render: () => ({ fence: "chronoanvil", lines: ["sleep-summary"] }),
    locate: (text) => probe(text, /^sleep-summary\b/m),
  },
  {
    id: "charts",
    label: "Trends and statistics",
    blurb: "The charts manager for the diary.",
    icon: "📊",
    // NOT LOCKED, AND NOT FREELY REMOVABLE EITHER — the one section here where
    // those are different answers, exactly as on the homepage and on the four
    // period dashboards. A reader who wants no charts should be able to say so;
    // a reader with nine configured must not lose them to an untick.
    locked: false,
    holds: (text) => chartLinesIn(text),
    render: () => ({
      fence: "chronoanvil-charts",
      lines: [`${HEADER_PREFIX}${TRENDS_HEADING.replace(/^#+\s*/, "")}`],
    }),
    locate: (text) => probe(text, /^```chronoanvil-charts/m),
  },
];

const specFor = (hostFolder: string | null = null): FlatNoteSpec => ({
  sections: DIARY_DASHBOARD_SECTIONS,
  hostFolder,
  noun: "the diary dashboard",
  heldUnit: "chart",
});

// The diary dashboard's whole markdown.
export function composeDiaryDashboardNote(): string {
  return (
    composeFlatNote(DIARY_DASHBOARD_SECTIONS).trimEnd() +
    graphLinksSection(["Homepage"])
  );
}

// The diary dashboard, as the editor sees it.
//
// `hostFolder` is what an empty folder answer resolves to, and on a folder note
// that is the folder itself — the diary root. Defaulting to null keeps the
// composer and the scaffolder writing exactly what they wrote before.
export function diaryDashboardSectionModel(
  hostFolder: string | null = null,
  // What this vault can answer a widget's argument with (4.15 §4). See
  // `FlatNoteSpec.vault` — supplied by the caller that holds the plugin.
  vault?: VaultLists
): SectionModel {
  return flatNoteModel({ ...specFor(hostFolder), vault });
}
