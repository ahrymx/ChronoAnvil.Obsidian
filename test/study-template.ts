// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { STUDY_JOURNAL } from "../src/journals/journal";
import { journalTemplateFiles } from "../src/journals/custom-journal";

import { readAsset } from "./sources";
import { STUDY_PRESET } from "../src/journals/journal";
import { presetConfig } from "../src/journals/custom-journal";
import type { JournalConfig } from "../src/journals/custom-journal";
// One reader for Study's five templates, all of which are now composed.
//
// The two dashboards stopped being assets in 2.40; the three content templates
// followed in 2.42, once the catalogue could express a markdown heading. The
// tests that assert what a Study template contains did not change their claims
// when either happened, only where they read from — so they go through here
// rather than through readFileSync.
//
// Worth keeping the indirection even though it is now thin: these tests are the
// ones that would notice the catalogue producing something a Study template
// should not, and pointing them at the generated output is what makes them keep
// doing that job. An assertion about a file that is no longer written is an
// assertion about nothing.
export function studyTemplate(name: string): string {
  const files = journalTemplateFiles(STUDY_JOURNAL);
  const composed = files.find((f) => f.name === (ASSET_NAMES[name] ?? name));
  if (composed) return composed.content;
  throw new Error(
    `No Study template named ${name} (have: ${files.map((f) => f.name).join(", ")})`
  );
}

// The asset filenames the three content templates used to ship under, mapped to
// the vault filenames they compose to. Kept so a test may still ask for
// "template-lesson.md" — the name is how those tests refer to the thing, and
// renaming forty assertions would obscure what actually changed.
// The 2.43 filenames are slugs of the level/kind id rather than of a display
// string (see journal.ts::buildJournalType), so the vault names moved too —
// "Subject Index.md" became "subject-index.md". Mapped here for the same
// reason the asset names are: these tests assert what a template *contains*,
// and rewriting forty call sites would bury that behind a rename.
const ASSET_NAMES: Record<string, string> = {
  "template-lesson.md": "lesson.md",
  "template-practice.md": "practice.md",
  "template-page.md": "page.md",
  "Subject Index.md": "subject-index.md",
  "Topic Index.md": "topic-index.md",
  "Lesson.md": "lesson.md",
  "Practice.md": "practice.md",
  "Page.md": "page.md",
};

// One reader for a template by whichever name a test knows it under.
//
// Study's five are composed — the dashboards by their vault filename ("Subject
// Index.md"), the content templates by either their vault name or the asset
// name they used to ship under. Everything else is still a real asset and
// always will be: the diary's daily/monthly templates and the weekly/monthly
// overviews belong to the *diary*, whose templates are the plugin's to rewrite
// (see the ownership note in journal.ts), so they stay files on disk.
export function studyFile(name: string): string {
  const composed = ASSET_NAMES[name] ?? name;
  const hit = journalTemplateFiles(STUDY_JOURNAL).find(
    (f) => f.name === composed
  );
  if (hit) return hit.content;
  return readAsset(name);
}

// The Study journal as a STORED config, for a fixture that needs it registered.
//
// Study stopped being registered by a settings toggle in 3.20 and became an
// ordinary `customJournals` entry installed from a preset. Fixtures that used
// to write `studyEnabled: true` and expect a Study journal to exist now have to
// put one in the store, which is what a real vault's migration does on load.
//
// Through `presetConfig` rather than a literal copy, so a fixture cannot drift
// from what the preset actually installs.
export function studyConfigFor(paths?: {
  root?: string;
  templatesFolder?: string;
}): JournalConfig {
  return presetConfig(STUDY_PRESET, paths);
}
