// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// What is on the journals dashboard, as data. 4.1 §2.2.
//
// WHY THIS NOTE EXISTS. `03 - Journals/` had nothing at its root at all — not
// even the four nested dashboards the diary root has. Every journal's own index
// notes sit one level below it, so the folder a reader clicks was the one place
// in the tree that answered nothing.
//
// THINNER THAN THE DIARY'S, DELIBERATELY. The `journals` widget already draws
// every journal, its containers and its counts as ONE card, and each journal's
// own index is one click below that. Four sections, where the diary dashboard
// has six, and the difference is not an omission — a journals dashboard that
// re-listed what the card already lists would be the fourth page this release
// exists to avoid creating.
//
// PER-JOURNAL SUB-DASHBOARDS WERE REFUSED HERE, AND SHIP IN 4.36. The refusal
// read: *"A vault with six journals may well want six pages, and each journal's
// root already has the same folder-note gap this release closes two levels up.
// The answer is to ship the one page and see whether the `journals` card is
// actually too crowded, because a per-journal dashboard that duplicates that
// journal's own top-level index is exactly the duplication being argued
// against."*
//
// It named its own condition and the condition was met. 4.13 spent four patches
// compressing the `journals` card — counts off both bars, the subject turned
// into a card at the cost of its fold, then a four-row cap with a scroll — and
// 4.35 shipped three more presets, so the vault this page was sized for is not
// the vault the plugin now proposes. The duplication it feared is also not what
// arrived: a journal's top-level index is the page about ONE Subject, and the
// new page is about the JOURNAL, which nothing had ever been.
//
// See `journal-dashboard-sections.ts` — one letter apart, and the whole of the
// difference is that this page is about every journal and that one is about the
// journal it sits in.
//
// THIS PAGE IS UNCHANGED BY IT. The argument below for what belongs HERE holds
// exactly as written: the `journals` card, a queue across every journal, tasks
// under the journals root and the vault-side charts manager are all facts about
// the journals as a set, and none of them is what a page about one journal
// would say.
//
// ── `review-queue:all`, NOT BARE — A DEPARTURE FROM §2.2's TABLE ─────────
//
// The table says `review-queue`; the argument beside it says "recall across
// every journal ... nowhere to see the whole vault's queue at once — and this
// is that place." Bare would not deliver that. `journalFolderScope` reads a
// bare argument as THE HOST NOTE'S OWN FOLDER, which here is the journals root
// — so it would cover every journal that happens to live beneath that folder
// and silently miss any custom journal rooted elsewhere, which is a thing
// `customJournals` explicitly permits ("a custom journal's root is a settings
// value and may still be pointed anywhere").
//
// `:all` resolves every REGISTERED journal type's root and dedupes by prefix.
// It is a keyword rather than a path, so unlike a written-out folder it cannot
// go stale on a rename — the two reasons the diary dashboard prefers bare
// directives do not apply to it.
//
// ── WHAT CARRIES A `header:` BAR AND WHAT CARRIES `frame: section` ───────
//
// The queue, the table and the charts take `header:` bars. The `journals` card
// takes `frame: section`, because a `header:` above a card-drawing widget gives
// that fence's container both a bar and a card — the doubling 4.1 §3.1
// describes and Part III's modifier exists to fix. See the longer note in
// `diary/diary-dashboard-sections.ts`.
//
// IT SHIPPED BARE IN 4.1.0 AND 4.1.1, AND THAT WAS THE SAME DEFECT THE DIARY
// PAGE WAS REPORTED FOR. Bare avoids the doubling by producing §3.1's other
// failure one sentence later: "in a markdown note nothing replaces it, and the
// widget becomes loose content in the note's flow — inconsistent with every
// section around it." It was the only block on this page with no title and no
// fold, sitting above three that had both. `frame: section` is the value that
// exists for exactly this position, and `SECTION_TITLES` has carried the
// widget's own title since the modifier was built.

import {
  HEADER_PREFIX,
  JOURNALS_DIRECTIVE_LINE,
  TRENDS_HEADING,
} from "../core/constants";
import { SCOPE_ALL } from "../core/directive-grammar";
import { composeFlatNote, flatNoteModel, bannerSection, PAGE_TITLE_IDS } from "../core/note-sections";
import type { FlatSection, FlatNoteSpec } from "../core/note-sections";
import type { VaultLists } from "../core/widget-registry";
import type { SectionModel } from "../core/section-model";

const probe = (text: string, re: RegExp): number => text.search(re);

// The same count `home-sections.ts`, `diary-sections.ts` and the diary
// dashboard make. One rule about what a configured chart looks like.
const chartLinesIn = (text: string): number =>
  text.split("\n").filter((l) => /^\s*chart:/.test(l)).length;

export const JOURNALS_DASHBOARD_SECTIONS: FlatSection[] = [
  // THE BANNER, FIRST. 4.10 gave this page a head; 4.19 made the head a banner
  // — see `bannerSection`. It is also the only navigation this page has ever
  // had: unlike the diary folder note, whose diary card carries destination
  // pills of its own, this one composed no `links:` row and nothing else here
  // goes anywhere.
  //
  // SO ITS BANNER CARRIES THE VAULT'S THREE AND NO TIME ROW, which is this
  // page's whole navigation in one block rather than in none — the state 4.19
  // was written to reach, arrived at here by the page already being close.
  bannerSection({ ids: PAGE_TITLE_IDS }),
  {
    id: "journals",
    label: "Journals",
    blurb: "Every journal, subject and topic, as one card.",
    icon: "📚",
    // LOCKED (§2.2: "a journals dashboard without it is nothing"), and note
    // that this is the one place the lock differs from the homepage's copy of
    // the same widget. There it is unlocked, because a vault can reasonably
    // have no journals at all and a homepage without the section is a coherent
    // thing to want. Here the section IS the page.
    //
    // The widget already renders nothing when no journals are enabled, so the
    // lock costs an empty vault nothing but a heading.
    locked: true,
    render: () => ({ fence: "almanac", lines: ["frame: section", "journals"] }),
    // ── THE PROBE MATCHES BOTH SPELLINGS (4.38.2) ─────────────────────────
    //
    // It was `/^journals\s*$/m`, and that strictness is what turned 4.37's
    // migration bug into a page that grew a Journals section every time repair
    // ran. The migration rewrote this page's block to `journals:cards`; this
    // probe could then no longer see it; `reconcileLayouts` correctly concluded
    // the section was missing and added a second one — which the migration
    // rewrote in turn, forever.
    //
    // The migration is fixed and no longer touches this page. This is the belt to
    // that fix's braces, and it is right on its own terms too: an ARGUMENT is an
    // arrangement of the same section, not a different one, so a probe asking
    // "is the journals section here" should say yes to either. The homepage's
    // copy has answered that way since 4.37 and is why the homepage never
    // duplicated.
    //
    // `render` STILL WRITES THE BARE FORM, which is the half that must not move
    // with it: the probe is what repair asks, and `render` is what it composes.
    // A page arriving on the wrong spelling is recognised and left alone here;
    // putting it back is `collapseJournalsBlocks`' job, once, rather than
    // reconciliation's on every run.
    locate: (text) => probe(text, JOURNALS_DIRECTIVE_LINE),
  },
  {
    id: "review",
    label: "Review",
    blurb: "What is due for recall across every journal, soonest first.",
    icon: "🔁",
    // NOT A MOVE — the homepage has never carried one (§2.2). `review-queue`
    // exists today only on a journal's own index notes, so a vault with six
    // journals has six queues and no way to see them at once. This is that
    // place, and it is the one section here that shows something genuinely
    // unavailable elsewhere.
    locked: false,
    questions: (spec) => [
      {
        kind: "folder",
        key: "folder",
        label: "the folder to review",
        directive: "review-queue",
        hostFolder: spec.hostFolder ?? null,
        // Offered by name rather than left for a reader to guess the spelling
        // of (3.15 §9.1) — and on this page it is the shipped default, so the
        // keyword and the composed line agree.
        keywords: [{ value: SCOPE_ALL, label: "Every journal" }],
      },
    ],
    render: () => ({
      fence: "almanac",
      lines: ["header:🔁 Review", `review-queue:${SCOPE_ALL}`],
    }),
    locate: (text) => probe(text, /^review-queue\b/m),
  },
  {
    id: "open-tasks",
    label: "Open tasks",
    blurb: "Still-open Almanac tasks from every note under the journals root.",
    icon: "⏳",
    // BARE, unlike the queue above it, and the two are not inconsistent.
    // `tasks-table` defaults to the host note's own folder, which on this
    // folder note is the journals root — so bare composes to the scope §2.2
    // asked for, with no path written into the note to go stale on a rename.
    //
    // It scopes to the FOLDER where the queue scopes to every registered
    // journal. That is a real difference on a vault with a journal rooted
    // outside `03 - Journals/`, and it is the right one for tasks: a task table
    // is a view of a subtree, and the scope button in its header bar is how a
    // reader points it somewhere else.
    //
    // AND NO `Every journal` KEYWORD, unlike the queue above — `journal-
    // sections.ts` offers `SCOPE_JOURNAL` here and never `SCOPE_ALL`, because
    // `buildTasksTableRegion` takes `folders[0]`: a keyword naming several
    // roots resolves to the FIRST one rather than to all of them. Offering it
    // would put a control on the page that promises a scope the widget
    // silently truncates. `SCOPE_JOURNAL` is no use here either — this note
    // sits at the journals root, outside every registered journal, where that
    // keyword resolves to nothing.
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
      lines: ["header:⏳ Open tasks", "tasks-table"],
    }),
    locate: (text) => probe(text, /^tasks-table\b/m),
  },
  {
    id: "charts",
    label: "Trends and statistics",
    blurb: "The charts manager for the journals.",
    icon: "📊",
    // NOT LOCKED, AND NOT FREELY REMOVABLE EITHER, on the argument every other
    // catalogue makes for this section: an untick must not take nine
    // configured charts with it.
    //
    // The diary's chart fence, not a journal dashboard's. `almanac-charts` is
    // the vault-side manager; `almanac-journal-charts` belongs to a journal's
    // own index notes and reads a different store. This page sits above every
    // journal rather than inside one, so it takes the former.
    locked: false,
    holds: (text) => chartLinesIn(text),
    render: () => ({
      fence: "almanac-charts",
      lines: [`${HEADER_PREFIX}${TRENDS_HEADING.replace(/^#+\s*/, "")}`],
    }),
    locate: (text) => probe(text, /^```almanac-charts/m),
  },
];

const specFor = (hostFolder: string | null = null): FlatNoteSpec => ({
  sections: JOURNALS_DASHBOARD_SECTIONS,
  hostFolder,
  noun: "the journals dashboard",
  heldUnit: "chart",
});

// The journals dashboard's whole markdown.
export function composeJournalsDashboardNote(): string {
  return composeFlatNote(JOURNALS_DASHBOARD_SECTIONS);
}

// The journals dashboard, as the editor sees it.
export function journalsDashboardSectionModel(
  hostFolder: string | null = null,
  // What this vault can answer a widget's argument with (4.15 §4). See
  // `FlatNoteSpec.vault` — supplied by the caller that holds the plugin.
  vault?: VaultLists
): SectionModel {
  return flatNoteModel({ ...specFor(hostFolder), vault });
}
