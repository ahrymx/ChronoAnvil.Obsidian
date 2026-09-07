// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Every note this plugin composes, and the model that edits it.
//
// WHY THIS EXISTS
//
// The section machinery is four catalogue types and four parse/plan/apply
// implementations describing one object, and it is being converged onto one of
// each. That convergence has exactly one invariant worth the name:
//
//   EVERY COMPOSED NOTE STAYS BYTE-IDENTICAL.
//
// It is not tidiness. `isHandEdited` (journal-plan.ts) decides whether a
// reader has edited their note by composing a fresh one and comparing, so a
// single line moved in a single composer reports every untouched note in every
// vault as hand-edited — and the settings rail then offers to overwrite them.
// The changelog has promised "nothing in a vault is rewritten by this release"
// on every release since 5.0, and this file is what makes that checkable
// rather than claimed.
//
// WHY IT IS A FIXTURE FILE AND NOT `toMatchSnapshot`
//
// A committed file is one a diff can be read from, and reading the diff is the
// whole point: a refactor that changes a composed note is either a bug or a
// decision, and the reviewer has to be able to tell which. Vitest snapshots are
// updated by a flag people reach for without looking. The idiom is
// `test/study-template.ts` and `test/layout-transfer-fixture.ts`, which are
// fixtures the suite compares against rather than records it writes.
//
// WHAT IS ENUMERATED, AND WHY IT IS EVERY COMPOSER
//
// Nine functions in the tree compose a whole note. All nine are here, over
// every input that produces a different file: four preset journals × every
// template target, four dashboard grains, five entry grains, four logbooks.
// A composer left out is a surface a refactor may quietly change.
//
// THE MODEL BESIDE THE TEXT IS THE SECOND HALF (see composed-notes.test.ts).
// Composition pins the WRITE path. A parser regression does not change what is
// written — it changes what is read back, which is invisible until a reader
// opens the editor and Saves. So each entry carries the model that edits its
// note, and the test asks that model to plan no change over the text its own
// catalogue just composed.

import { composeTemplate } from "../src/journals/custom-journal";
import { templateTargets } from "../src/journals/journal-sections";
import { journalSectionModel } from "../src/journals/journal-plan";
import { JOURNAL_PRESETS, buildJournalType } from "../src/journals/journal";
import type { JournalType } from "../src/journals/journal";
import {
  composeJournalDashboardNote,
  journalDashboardSectionModel,
} from "../src/journals/journal-dashboard-sections";
import {
  composeDiaryDashboard,
  diarySectionModel,
} from "../src/diary/diary-sections";
import type { DashboardGrain } from "../src/diary/diary-sections";
import {
  composeDiaryDashboardNote,
  diaryDashboardSectionModel,
} from "../src/diary/diary-dashboard-sections";
import {
  composeEntryTemplate,
  entrySectionModel,
} from "../src/diary/entry-sections";
import { composeHomeNote, homeSectionModel } from "../src/diary/home-sections";
import { composeSearchNote, searchSectionModel } from "../src/diary/search-sections";
import {
  composeLogbookNote,
  logbookSectionModel,
  composeLogbooksFolderNote,
  logbooksFolderSectionModel,
} from "../src/diary/logbook-sections";
import { DEFAULT_LOGBOOKS, DEFAULT_PATHS } from "../src/core/constants";
import type { SectionModel } from "../src/core/section-model";
import type { TrackerClass } from "../src/trackers/trackers";

export interface GoldenNote {
  // The fixture's filename under `test/golden/`, without its extension. A slug,
  // because it is a path — and stable, because a renamed one is a fixture that
  // silently stops being compared and a new one that silently passes.
  name: string;
  // What the composer wrote.
  text: string;
  // The model that edits this note. Asked, in the test, to find no change in
  // the text its own catalogue composed.
  model: () => SectionModel;
}

// The four dashboard grains, and the five an entry can be.
//
// DERIVED FROM THE TYPES rather than typed out, so a fifth grain fails to
// compile here instead of quietly composing nothing.
const DASHBOARD_GRAINS: DashboardGrain[] = [
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
];
const ENTRY_GRAINS: TrackerClass[] = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
];

const presetTypes = (): JournalType[] =>
  JOURNAL_PRESETS.map((p) => buildJournalType(p.config));

// A journal template per target, per preset.
//
// THROUGH `templateTargets` rather than a list of files, because that function
// is what decides which templates a journal HAS — index per level, one per kind
// per variant, and the shared page template where any kind is paged. A fixture
// list would be a second answer to that question, kept in step by hand.
//
// AND THROUGH THE TYPE'S OWN LAYOUT, which is not a detail. `journalTemplateFiles`
// — the one caller that writes these files into a vault — composes
// `composeTemplate(t.ctx, chosen, type.layout?.[t.key])`, and the layout's
// `options` are what a kind's extra trackers arrive in. Composing without it
// writes a two-row grid where the catalogue's own `render` declares four, and
// `signaturesFor` then matches neither: the fence is reported foreign in a file
// the plugin composed itself. The harness composes the way production composes,
// which is the only version of the note worth pinning.
const journalTemplates = (): GoldenNote[] =>
  presetTypes().flatMap((type) =>
    templateTargets(type).map((target) => ({
      name: `journal-${type.id}-${target.key.replace(/[^a-z0-9]+/gi, "-")}`,
      text: composeTemplate(target.ctx, undefined, type.layout?.[target.key]),
      model: () => journalSectionModel(target.ctx),
    }))
  );

const journalDashboards = (): GoldenNote[] =>
  presetTypes().map((type) => ({
    name: `journal-dashboard-${type.id}`,
    text: composeJournalDashboardNote(type),
    model: () => journalDashboardSectionModel(type),
  }));

const periodDashboards = (): GoldenNote[] =>
  DASHBOARD_GRAINS.map((grain) => ({
    name: `period-${grain}`,
    text: composeDiaryDashboard(grain),
    model: () => diarySectionModel({ grain }),
  }));

const entries = (): GoldenNote[] =>
  ENTRY_GRAINS.map((grain) => ({
    name: `entry-${grain}`,
    text: composeEntryTemplate(grain),
    model: () => entrySectionModel({ grain }),
  }));

const logbooks = (): GoldenNote[] =>
  DEFAULT_LOGBOOKS.map((def) => ({
    name: `logbook-${def.id}`,
    text: composeLogbookNote(def),
    model: () => logbookSectionModel(def),
  }));

// Every composed note in the plugin, in a stable order.
export function goldenNotes(): GoldenNote[] {
  return [
    {
      name: "home",
      text: composeHomeNote(DEFAULT_PATHS.diaryRoot),
      model: () => homeSectionModel(DEFAULT_PATHS.diaryRoot),
    },
    {
      name: "search",
      text: composeSearchNote(),
      model: () => searchSectionModel(),
    },
    {
      name: "diary-folder",
      text: composeDiaryDashboardNote(),
      model: () => diaryDashboardSectionModel(),
    },
    {
      name: "logbooks-folder",
      text: composeLogbooksFolderNote(DEFAULT_LOGBOOKS),
      model: () => logbooksFolderSectionModel(DEFAULT_LOGBOOKS),
    },
    ...logbooks(),
    ...periodDashboards(),
    ...entries(),
    ...journalDashboards(),
    ...journalTemplates(),
  ];
}
