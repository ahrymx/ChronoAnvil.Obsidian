// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Template safety, refresh parity and the upgrade bridge (4.23).

import { describe, expect, it } from "vitest";
import {
  pendingGroups,
  writesIntoExisting,
  type RepairSurvey,
} from "../src/core/repair-plan";
import { diffText } from "../src/core/line-diff";
import {
  composeEntryTemplate,
  detectEntrySections,
} from "../src/diary/entry-sections";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import { STUDY_JOURNAL } from "../src/journals/journal";
import { customTemplateFiles } from "../src/journals/custom-journal";
import { sectionContext } from "../src/journals/journal-sections";
import { sectionsPresent } from "../src/journals/journal-plan";

describe("RepairSurvey — the templates group (4.23 §2)", () => {
  it("treats templates as writing into existing notes", () => {
    const createOnly: RepairSurvey = {
      groups: [
        {
          id: "create",
          title: "Create what's missing",
          blurb: "Folders and files",
          glyph: "📁",
          noun: "item",
          items: [{ path: "test.md", label: "test.md", ops: [{ kind: "create", detail: "create" }] }],
        },
        {
          id: "templates",
          title: "Update templates to this release",
          blurb: "Templates",
          glyph: "📋",
          noun: "template",
          items: [],
        },
      ],
    };
    expect(writesIntoExisting(createOnly)).toBe(false);

    const withTemplates: RepairSurvey = {
      groups: [
        {
          id: "create",
          title: "Create what's missing",
          blurb: "Folders and files",
          glyph: "📁",
          noun: "item",
          items: [],
        },
        {
          id: "templates",
          title: "Update templates to this release",
          blurb: "Templates",
          glyph: "📋",
          noun: "template",
          items: [
            {
              path: "Templates/Daily Entry.md",
              label: "Daily Entry.md",
              ops: [{ kind: "template", detail: "same sections, edited in place" }],
            },
          ],
        },
      ],
    };
    expect(writesIntoExisting(withTemplates)).toBe(true);
  });

  it("filters out empty template groups with pendingGroups", () => {
    const survey: RepairSurvey = {
      groups: [
        {
          id: "create",
          title: "Create",
          blurb: "",
          glyph: "📁",
          noun: "item",
          items: [],
        },
        {
          id: "templates",
          title: "Templates",
          blurb: "",
          glyph: "📋",
          noun: "template",
          items: [
            {
              path: "Templates/Monthly Entry.md",
              label: "Monthly Entry.md",
              ops: [{ kind: "template", detail: "adds notes" }],
            },
          ],
        },
      ],
    };
    const pending = pendingGroups(survey);
    expect(pending.length).toBe(1);
    expect(pending[0].id).toBe("templates");
  });
});

describe("template drift computation — diary templates", () => {
  const daily = composeEntryTemplate("daily", []);

  it("reproduces identical text with zero diff", () => {
    const diff = diffText(daily, daily);
    const changed = diff.lines.filter((l) => l.kind !== "same");
    expect(changed.length).toBe(0);
  });

  it("calculates accurate line additions and deletions when modified", () => {
    const modified = daily + "\n## My Custom Notes\nSome hand-written notes.\n";
    const diff = diffText(modified, daily);
    const removed = diff.lines.filter((l) => l.kind === "remove");
    expect(removed.map((l) => l.text)).toContain("## My Custom Notes");
    expect(removed.map((l) => l.text)).toContain("Some hand-written notes.");
  });

  it("detects entry sections across modifications", () => {
    const sections = detectEntrySections(daily, { cls: "daily" });
    expect(sections).toContain("banner");
    expect(sections).toContain("trackers");
  });
});

describe("template drift computation — journal templates", () => {
  const tpls = customTemplateFiles(STUDY_JOURNAL);
  const lesson = tpls.find((t) => t.name === "lesson.md")!.content;
  const ctx = sectionContext(STUDY_JOURNAL, {
    kind: STUDY_JOURNAL.kinds.find((k) => k.id === "lesson")!,
  });

  it("detects sections on unmodified journal templates", () => {
    const present = sectionsPresent(lesson, ctx);
    expect(present).toContain("banner");
    expect(present).toContain("trackers");
  });

  it("detects diff against modified journal templates", () => {
    const modified = lesson + "\n## Additional Study Material\nCustom summary.\n";
    const diff = diffText(modified, lesson);
    const removed = diff.lines.filter((l) => l.kind === "remove");
    expect(removed.map((l) => l.text)).toContain("## Additional Study Material");
    expect(removed.map((l) => l.text)).toContain("Custom summary.");
  });
});

describe("the upgrade bridge schema (4.23 §4)", () => {
  it("defaults installedVersion to undefined on clean config", () => {
    expect(DEFAULT_SETTINGS.installedVersion).toBeUndefined();
  });
});
