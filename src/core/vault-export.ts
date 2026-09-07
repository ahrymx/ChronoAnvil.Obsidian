// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Planning a whole-vault export: where each note's copy goes, and what the
// reader is shown before a single file is written.
//
// WHY THIS FILE EXISTS (4.31)
//
// 4.30 built `toPlainMarkdown` and one command that fills the clipboard. It
// wrote nothing, and that was the whole of its safety argument. This release
// writes hundreds of files in one press, so every question that release got to
// skip has to be answered here — where they go, what a second run does, and
// what a reader sees first.
//
// ── THE FINDING THE WHOLE DESIGN TURNS ON ──────────────────────────────
//
// AN EXPORTED COPY INSIDE THE VAULT IS A REAL ENTRY, AND NO FOLDER CAN STOP IT.
//
// `noteKindOf` classifies a note by its frontmatter BEFORE it looks at any
// path, and says so itself: "Declared kind first, then folder, then template
// path. A note that SAYS what it is outranks where it sits, so a daily entry
// filed somewhere odd is still a daily entry."
//
// 4.30 copies frontmatter verbatim — right for the clipboard, and correct data
// besides. So a copy of Tuesday carrying `journal: Daily Notes` is Tuesday
// WHEREVER it is put: two entries for one date in every calendar, rollup, chart
// series and period-filtered table. `resolveSectionHost` reads `type:` the same
// way for journal notes.
//
// A path-based exclusion cannot fix this, because the classifier never gets as
// far as the path. So the export DEMOTES the properties into the body
// (`plain-markdown.ts::PropertiesMode`), and the exported file has no
// frontmatter at all — nothing for any classifier to read. The collision is not
// mitigated; it is made unrepresentable.
//
// It also makes the export self-excluding, which is worth having and is not
// worth RELYING on: a second run finds files with no `journal:` and no `type:`
// and classifies none of them. `isUnderExportRoot` is checked anyway, because a
// loop that terminates only because of a derived property is a loop that stops
// terminating the day the property changes.

import { diffText } from "./line-diff";
import type { RepairFileChange, RepairSurvey } from "./repair-plan";

// One note's copy, as the planner sees it.
export interface ExportPlanItem {
  // The note's own vault path — the identity, and what the window names.
  source: string;
  // Where the copy goes.
  path: string;
  // The portable markdown, properties already demoted.
  content: string;
  // What is at `path` today; null when nothing is. The two together are what
  // decide whether this item is work at all.
  before: string | null;
}

// A trailing slash is what makes this a FOLDER test rather than a prefix test.
//
// Without it, an export root of `ChronoAnvil Export` would also claim
// `ChronoAnvil Exports Old/…` and every note whose path merely begins with those
// letters — which is the whole family of bugs a bare `startsWith` produces.
export function isUnderExportRoot(root: string, path: string): boolean {
  const clean = root.replace(/\/+$/, "");
  return clean !== "" && (path === clean || path.startsWith(`${clean}/`));
}

// Where a note's copy goes: its own vault path, under the root.
//
// MIRRORED RATHER THAN NAMED. Vault paths are unique, so mirroring makes a
// collision impossible by construction and needs no scheme of its own — no
// date in the filename, no counter, nothing that two notes could agree on by
// accident. It also means a reader can find the copy of a note they are
// looking at without being told the rule.
export function exportPathFor(root: string, sourcePath: string): string {
  return `${root.replace(/\/+$/, "")}/${sourcePath}`;
}

// What the window shows, and nothing that is not work.
//
// AN ITEM WHOSE CONTENT ALREADY MATCHES IS NOT LISTED. `pendingGroups` already
// means "has anything to do", and an export that lists a thousand unchanged
// files is a preview nobody reads — which makes the confirmation a formality,
// which is the one thing a confirmation must never become.
export function exportSurvey(items: readonly ExportPlanItem[]): RepairSurvey {
  const changed: RepairFileChange[] = [];
  for (const item of items) {
    if (item.before === item.content) continue;
    changed.push({
      path: item.path,
      label: item.source,
      ops: [
        item.before === null
          ? { kind: "create", detail: `a copy of ${item.source}` }
          : { kind: "rewrite", detail: `refreshed from ${item.source}` },
      ],
      // Absent for a creation, which is `RepairFileChange`'s own rule: there is
      // nothing to compare against and "every line is an addition" is not a
      // differential.
      ...(item.before === null ? {} : { diff: diffText(item.before, item.content) }),
    });
  }
  return {
    groups: [
      {
        id: "export",
        title: "Export as plain markdown",
        blurb:
          "One file per diary entry and journal note, with its properties written into the page and every widget left out. Nothing outside the export folder is touched.",
        glyph: "📤",
        noun: "file",
        items: changed,
      },
    ],
  };
}

// How the run reports itself afterwards.
export interface ExportTally {
  created: number;
  rewritten: number;
  unchanged: number;
}

export function tally(items: readonly ExportPlanItem[]): ExportTally {
  let created = 0;
  let rewritten = 0;
  let unchanged = 0;
  for (const item of items) {
    if (item.before === item.content) unchanged++;
    else if (item.before === null) created++;
    else rewritten++;
  }
  return { created, rewritten, unchanged };
}
