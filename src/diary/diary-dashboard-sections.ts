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
// the card leaves `.journal-widget-block` and nothing else, so `Today` and
// `This month` were loose content in the note's flow — no title, no fold, and
// visibly not the same kind of thing as the three sections under them. §3.1
// predicted exactly that ("in a markdown note nothing replaces it"), which is
// the whole reason the modifier takes three values rather than two.

import { HEADER_PREFIX, TRENDS_HEADING } from "../core/constants";
import { composeFlatNote, flatNoteModel, PAGE_TITLE_SECTION } from "../core/note-sections";
import type { FlatSection, FlatNoteSpec } from "../core/note-sections";
import type { VaultLists } from "../core/widget-registry";
import type { SectionModel } from "../core/section-model";

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

export const DIARY_DASHBOARD_SECTIONS: FlatSection[] = [
  // THE HEAD, FIRST. 4.10 — see `PAGE_TITLE_SECTION`. This page's own name is
  // the folder's, which is worth knowing before it is read: a default vault
  // shows "02 - Diary" here, because a folder note is named for its folder.
  PAGE_TITLE_SECTION,
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
    render: () => ({
      fence: "almanac",
      lines: ["frame: section", `diary:${DASHBOARD_AGENDA}`],
    }),
    locate: (text) => probe(text, /^diary\b/m),
  },
  {
    id: "this-month",
    label: "This month",
    blurb: "The month's banner: what it holds, and its date navigator.",
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
    render: () => ({
      fence: "almanac",
      lines: ["frame: section", "month-summary"],
    }),
    locate: (text) => probe(text, /^month-summary\b/m),
  },
  {
    id: "open-tasks",
    label: "Open Tasks",
    blurb: "Still-open Almanac tasks from every entry under the diary.",
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
    questions: (spec) => [
      {
        kind: "folder",
        key: "folder",
        label: "the folder to collect tasks from",
        directive: "tasks-table",
        hostFolder: spec.hostFolder ?? null,
      },
    ],
    render: () => ({
      fence: "almanac",
      lines: ["header:⏳ Open Tasks", "tasks-table"],
    }),
    locate: (text) => probe(text, /^tasks-table\b/m),
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
    locked: false,
    render: () => ({
      fence: "almanac",
      lines: ["header:🕘 On This Day", "on-this-day:always"],
    }),
    locate: (text) => probe(text, /^on-this-day\b/m),
  },
  {
    id: "charts",
    label: "Trends and Statistics",
    blurb: "The charts manager for the diary.",
    icon: "📊",
    // NOT LOCKED, AND NOT FREELY REMOVABLE EITHER — the one section here where
    // those are different answers, exactly as on the homepage and on the four
    // period dashboards. A reader who wants no charts should be able to say so;
    // a reader with nine configured must not lose them to an untick.
    locked: false,
    holds: (text) => chartLinesIn(text),
    render: () => ({
      fence: "almanac-charts",
      lines: [`${HEADER_PREFIX}${TRENDS_HEADING.replace(/^#+\s*/, "")}`],
    }),
    locate: (text) => probe(text, /^```almanac-charts/m),
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
    locked: false,
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
    // MATCHES THE KEYWORD, NOT THE ARGUMENT, so a reader who repoints the cloud
    // at their own folder still has a section the editor can find.
    locate: (text) => probe(text, /^tag-index\b/m),
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
  return composeFlatNote(DIARY_DASHBOARD_SECTIONS);
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
