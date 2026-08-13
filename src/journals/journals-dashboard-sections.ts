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
// NO PER-JOURNAL SUB-DASHBOARDS (§2.2, and §11 refuses them). A vault with six
// journals may well want six pages, and each journal's root already has the
// same folder-note gap this release closes two levels up. The answer is to ship
// the one page and see whether the `journals` card is actually too crowded,
// because a per-journal dashboard that duplicates that journal's own top-level
// index is exactly the duplication being argued against.
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

import { HEADER_PREFIX, TRENDS_HEADING } from "../core/constants";
import { SCOPE_ALL } from "../core/directive-grammar";
import { composeFlatNote, flatNoteModel, PAGE_TITLE_SECTION } from "../core/note-sections";
import type { FlatSection, FlatNoteSpec } from "../core/note-sections";
import type { VaultLists } from "../core/widget-registry";
import type { SectionModel } from "../core/section-model";

const probe = (text: string, re: RegExp): number => text.search(re);

// The same count `home-sections.ts`, `diary-sections.ts` and the diary
// dashboard make. One rule about what a configured chart looks like.
const chartLinesIn = (text: string): number =>
  text.split("\n").filter((l) => /^\s*chart:/.test(l)).length;

export const JOURNALS_DASHBOARD_SECTIONS: FlatSection[] = [
  // THE HEAD, FIRST. 4.10 — see `PAGE_TITLE_SECTION`. It is also the only
  // navigation this page has ever had: unlike the diary folder note, whose
  // diary card carries destination pills of its own, this one composed no
  // `links:` row and nothing else here goes anywhere.
  PAGE_TITLE_SECTION,
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
    locate: (text) => probe(text, /^journals\s*$/m),
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
    label: "Open Tasks",
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
      lines: ["header:⏳ Open Tasks", "tasks-table"],
    }),
    locate: (text) => probe(text, /^tasks-table\b/m),
  },
  {
    id: "charts",
    label: "Trends and Statistics",
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
