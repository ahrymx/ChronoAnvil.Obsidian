// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Study stops being built in. 3.20 — §3 of the 3.18 follow-ups.
//
// THE RISK IS DECLASSIFICATION AND NOTHING ELSE COMES CLOSE. A vault's Study
// notes are matched through the journal that declares `lesson`, `practice`,
// `subject` and `topic`, and through a `root` the reader may have moved years
// ago. A migration that rebuilt either from the shipped literal would leave
// every one of those notes belonging to no journal — no tables, no banner, no
// review queue — and would do it silently, on load, to a vault that was working
// a minute earlier. Most of this file is about that one sentence.
//
// The rest is the claim that made it worth doing: a preset is an ORDINARY
// journal. Not "resembles one" — the same object, through the same constructor,
// carrying no field a reader's own journal could not carry.

import { describe, expect, it } from "vitest";
import {
  presetAsNewJournal,
  presetConfig,
} from "../src/journals/custom-journal";
import type { JournalConfig } from "../src/journals/custom-journal";
import {
  JOURNAL_PRESETS,
  STUDY_CONFIG,
  STUDY_PRESET,
  buildJournalType,
  registeredJournalTypes,
} from "../src/journals/journal";
import { journalTemplateFiles } from "../src/journals/custom-journal";
import { readCode } from "./sources";
import { studyTemplate } from "./study-template";

describe("a preset is an ordinary journal", () => {
  it("composes the templates the built-in composed", () => {
    // THE EQUIVALENCE CLAIM, REPOINTED. It used to assert that
    // `buildJournalType(STUDY_CONFIG)` equalled `STUDY_JOURNAL` — trivially
    // true, because the second was defined as the first. As a preset it becomes
    // a claim about two different objects: what a reader installs composes the
    // template files Study has always shipped, byte for byte.
    const installed = buildJournalType(
      presetConfig(STUDY_PRESET, {
        root: STUDY_CONFIG.root,
        templatesFolder: STUDY_CONFIG.templatesFolder,
      })
    );
    const from = journalTemplateFiles(installed);
    for (const name of ["topic-index.md", "subject-index.md", "lesson.md"]) {
      const composed = from.find((f) => f.name === name);
      expect(composed, name).toBeTruthy();
      expect(composed!.content, name).toBe(studyTemplate(name));
    }
  });

  it("carries no field a reader's own journal could not", () => {
    // The property the old equivalence suite policed, and it still holds: a
    // preset is a `JournalConfig`, so anything it expresses is expressible.
    for (const preset of JOURNAL_PRESETS) {
      const mine: JournalConfig = {
        ...preset.config,
        id: "mine",
        name: "Mine",
        root: "J/Mine",
        templatesFolder: "T/Mine",
      };
      const built = buildJournalType(mine);
      expect(built.kinds.map((k) => k.id)).toEqual(
        buildJournalType(preset.config).kinds.map((k) => k.id)
      );
    }
  });

  it("is registered like one, with no branch of its own", () => {
    const plugin = {
      settings: {
        customJournals: [presetConfig(STUDY_PRESET, { root: "N/S" })],
      },
    } as unknown as Parameters<typeof registeredJournalTypes>[0];
    const [study] = registeredJournalTypes(plugin);
    expect(study.id).toBe("study");
    expect(study.root).toBe("N/S");
  });

  it("leaves a vault with no journals when none are installed", () => {
    const plugin = {
      settings: { customJournals: [] },
    } as unknown as Parameters<typeof registeredJournalTypes>[0];
    expect(registeredJournalTypes(plugin)).toEqual([]);
  });
});

describe("the special cases that are gone", () => {
  it("registration has no toggle branch", () => {
    expect(readCode("journal")).not.toMatch(
      /studyEnabled\s*\n?\s*\?\s*\[studyType/
    );
  });

  it("the settings list has no hardcoded Study row", () => {
    // It ended in a switch where every other row ends in a delete, which is
    // what "just another journal" had been claiming not to be since 2.39.
    expect(readCode("settings")).not.toContain("renderStudyRow");
  });

  it("the journal editor's root check has one list to consult", () => {
    // Study's root needed its own clause because it was invisible to the loop
    // over `customJournals`. One list, one check.
    expect(readCode("settings-editors")).not.toContain(
      "norm(this.plugin.settings.paths.studyRoot) === want"
    );
  });

  it("scaffold writes Study's templates through the generic loop", () => {
    expect(readCode("scaffold")).not.toContain("if (studyOn)");
  });

  it("commands ask whether the journal exists, not whether it is enabled", () => {
    // Generated since 3.21, so the question is asked once for every journal
    // rather than written out for Study — see `journal-actions.ts` and
    // `test/actions.test.ts`. The table holds no journal action at all now.
    expect(readCode("journal-actions")).toContain(
      "(p.settings.customJournals ?? []).some((j) => j.id === typeId)"
    );
    expect(readCode("actions")).not.toContain("studyOn");
  });

});

describe("the presets door", () => {
  const settings = (): string => readCode("settings");

  it("offers each preset that is not already installed", () => {
    // A preset's id is the handle its notes are classified through, so a
    // second copy would be either a rename or a collision.
    expect(settings()).toContain(
      "JOURNAL_PRESETS.filter((p) => !taken().has(p.id))"
    );
  });

  it("opens the editor rather than installing silently", () => {
    // The whole claim of turning Study into a preset is that it is editable
    // before it exists. Installing outright would hand back the un-editable
    // built-in under a new name.
    expect(settings()).toContain("presetAsNewJournal(preset, this.plugin.settings.paths)");
  });

  it("is its own button, not an entry in `Add journal`", () => {
    // "Add journal" starts from what this vault already has; "Presets" starts
    // from what the plugin ships. One menu made the reader's list and the
    // shipped list read as one list, which they are not.
    const src = settings();
    expect(src).toContain('label: "Presets"');
    expect(src).toContain('label: "Add journal"');
    expect(src).not.toMatch(/setTitle\(`Start from \$\{preset\.name\}`\)/);
  });

  it("says so when there is nothing left to offer", () => {
    // Rather than opening an empty menu, or silently doing nothing.
    expect(settings()).toContain("Every preset is already in this vault");
  });
});

describe("starting a journal from an existing one", () => {
  const settings = (): string => readCode("settings");

  it("offers every journal in the vault", () => {
    // GENERALISED FROM "Start from Study" (3.20.1). Study was only ever the
    // first example of a journal whose shape somebody would want again.
    expect(settings()).toContain("setTitle(`Start from ${src.name}`)");
    expect(settings()).toContain("for (const src of journals)");
  });

  it("takes the arrangement and not the identity", () => {
    // The levels and kinds are the part that took work. The id, name and
    // folders are what make it THAT journal rather than this one.
    const src = settings();
    expect(src).toContain("structuredClone(src)");
    expect(src).toMatch(/deriveJournalFolders\(name, this\.plugin\.settings\.paths\)/);
  });

  it("cannot collide with an id already taken", () => {
    expect(settings()).toContain("while (ids.has(id))");
  });

  it("skips the choice when there is nothing to copy", () => {
    expect(settings()).toContain("if (!journals.length) {");
  });
});

describe("a preset's folders follow its name", () => {
  it("derives them rather than taking the shipped literal", () => {
    // The literal carries `Templates/Studies`, a plural predating derived
    // folders — so installing produced a journal called "Study" whose templates
    // lived under "Studies", and the mismatch only resolved if the reader
    // happened to edit the name.
    const cfg = presetAsNewJournal(STUDY_PRESET, {
      journalsRoot: "03 - Journals",
      templates: "00 - Templates",
    });
    expect(cfg.templatesFolder).toBe("00 - Templates/Study");
    expect(cfg.root).toBe("03 - Journals/Study");
    expect(cfg.templatesFolder).not.toContain("Studies");
  });

  it("takes folders it is given, for a caller that has some", () => {
    // `presetConfig` passes them through rather than deriving under them. The
    // Study migration was the caller that needed this — a root already
    // classifying notes must survive verbatim — and while it has gone, the two
    // functions stay distinct because that is the distinction, not the caller.
    const held = presetConfig(STUDY_PRESET, {
      root: "Notes/Learning",
      templatesFolder: "T/Studies",
    });
    expect(held.root).toBe("Notes/Learning");
    expect(held.templatesFolder).toBe("T/Studies");
  });
});
