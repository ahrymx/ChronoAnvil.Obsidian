// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";

import {
  exportPathFor,
  exportSurvey,
  isUnderExportRoot,
  tally,
  type ExportPlanItem,
} from "../src/core/vault-export";
import { toPlainMarkdown } from "../src/core/plain-markdown";
import { composeEntryTemplate, entrySectionModel } from "../src/diary/entry-sections";
import { TRACKER_CLASSES, noteKindOf } from "../src/trackers/trackers";
import { DEFAULT_PATHS } from "../src/core/constants";
import { journalTemplateFiles } from "../src/journals/custom-journal";
import { STUDY_JOURNAL } from "../src/journals/journal";
import { sectionContext } from "../src/journals/journal-sections";
import { journalSectionModel } from "../src/journals/journal-plan";
import { readSrc } from "./sources";

const daily = entrySectionModel({ grain: "daily" });

function fill(text: string): string {
  return text.replace(
    /<!--almanac:([A-Za-z0-9_-]+)\n-->/g,
    (_m, key: string) => `<!--almanac:${key}\nwriting-in-${key}\n-->`
  );
}

// The frontmatter of a text, or "" — the thing the export must not leave behind.
function frontmatterOf(text: string): string {
  if (!text.startsWith("---\n")) return "";
  const end = text.indexOf("\n---", 4);
  return end === -1 ? "" : text.slice(4, end);
}

describe("an exported copy cannot be mistaken for the note it came from", () => {
  // THE PROPERTY THE WHOLE RELEASE TURNS ON.
  //
  // `noteKindOf` reads a note's declared kind BEFORE it looks at any path — "a
  // note that SAYS what it is outranks where it sits" — so a copy carrying
  // `journal: Daily Notes` is a daily entry wherever it is filed, and the vault
  // would hold two entries for one date in every calendar, rollup and chart.
  //
  // Asserted against the CLASSIFIER, not against a string, because the string is
  // a proxy and the classifier is the thing that would actually be fooled.
  for (const grain of TRACKER_CLASSES) {
    it(`leaves a ${grain} entry's export with nothing a classifier can read`, () => {
      const model = entrySectionModel({ grain });
      const source = fill(composeEntryTemplate(grain, []));

      // The source really is classifiable — otherwise this test proves nothing.
      const declared = /^journal:\s*(.+)$/m.exec(frontmatterOf(source))?.[1];
      expect(declared, `${grain} template declares no journal`).toBeTruthy();
      expect(
        noteKindOf(DEFAULT_PATHS, "Somewhere Odd/a note.md", declared)
      ).not.toBeNull();

      // ...and the export is not.
      const out = toPlainMarkdown(source, model, "demote");
      expect(out.startsWith("---")).toBe(false);
      expect(frontmatterOf(out)).toBe("");
      expect(
        noteKindOf(DEFAULT_PATHS, exportPathFor("Almanac Export", "x.md"), undefined)
      ).toBeNull();
    });
  }

  it("keeps every property, visibly, in the body", () => {
    const text = [
      "---",
      'journal-date: "2026-08-15"',
      "journal: Daily Notes",
      "title: The day it worked",
      "events:",
      "  - Anniversary",
      "Mood: 4",
      "---",
      "",
      "```almanac",
      "note:log|Notes",
      "```",
      "",
      "<!--almanac:log",
      "written",
      "-->",
    ].join("\n");

    const out = toPlainMarkdown(text, daily, "demote");
    // VERBATIM, QUOTES AND ALL. Stripping them would be interpreting the YAML,
    // which this transform deliberately does not do — a parser would turn a
    // value it disliked into an exception in the middle of a vault export.
    expect(out).toContain('> **journal-date:** "2026-08-15"');
    expect(out).toContain("> **journal:** Daily Notes");
    expect(out).toContain("> **title:** The day it worked");
    expect(out).toContain("> **Mood:** 4");
    // A list value stays attached to the key above it rather than becoming a
    // key of its own.
    expect(out).toContain("> **events:**");
    expect(out).toContain("Anniversary");
    // And the writing still arrives.
    expect(out).toContain("## Notes");
  });

  it("drops the tracker markers, which are the plugin's and not the reader's", () => {
    const out = toPlainMarkdown(fill(composeEntryTemplate("daily", [])), daily, "demote");
    expect(out).not.toContain("almanac:trackers:start");
    expect(out).not.toContain("almanac:trackers:end");
  });

  it("writes no block at all for a note with no properties", () => {
    const text = ["```almanac", "note:log|Notes", "```", "", "<!--almanac:log", "x", "-->"].join(
      "\n"
    );
    expect(toPlainMarkdown(text, daily, "demote").startsWith(">")).toBe(false);
  });

  it("demotes a journal note's `type:`, which is what makes it a journal note", () => {
    const lesson = journalTemplateFiles(STUDY_JOURNAL).find((f) => f.name === "lesson.md");
    expect(lesson).toBeDefined();
    const kind = STUDY_JOURNAL.kinds.find((k) => k.id === "lesson");
    const model = journalSectionModel(
      sectionContext(STUDY_JOURNAL, { kind: kind ?? STUDY_JOURNAL.kinds[0] })
    );
    const out = toPlainMarkdown(fill(lesson?.content ?? ""), model, "demote");
    expect(frontmatterOf(out)).toBe("");
    expect(out).toContain("> **type:** lesson");
  });
});

describe("`keep` is still exactly what 4.30 shipped", () => {
  // The mode is a destination, not a preference, so the old answer must not have
  // moved by a byte. Asserted rather than assumed, for every grain.
  for (const grain of TRACKER_CLASSES) {
    it(`is byte-identical on a ${grain} entry, defaulted or named`, () => {
      const model = entrySectionModel({ grain });
      const text = fill(composeEntryTemplate(grain, []));
      const defaulted = toPlainMarkdown(text, model);
      expect(toPlainMarkdown(text, model, "keep")).toBe(defaulted);
      // Frontmatter verbatim is the whole of 4.30's decision 4.
      expect(defaulted.startsWith("---\n")).toBe(true);
      expect(defaulted).not.toContain("> **journal:**");
    });
  }
});

describe("where a copy goes", () => {
  it("mirrors the source path under the root", () => {
    expect(exportPathFor("Almanac Export", "02 - Diary/Daily/2026-08-15.md")).toBe(
      "Almanac Export/02 - Diary/Daily/2026-08-15.md"
    );
    // A trailing slash on the root is a reader's typing, not a second rule.
    expect(exportPathFor("Almanac Export/", "a.md")).toBe("Almanac Export/a.md");
  });

  // THE LOOP'S TERMINATION, ASSERTED RATHER THAN REASONED ABOUT. An export whose
  // own output is not recognised as its own output exports its exports.
  it("recognises its own output as its own", () => {
    const root = "Almanac Export";
    expect(isUnderExportRoot(root, exportPathFor(root, "02 - Diary/x.md"))).toBe(true);
  });

  it("claims a folder, not a prefix", () => {
    expect(isUnderExportRoot("Almanac Export", "Almanac Export/a.md")).toBe(true);
    expect(isUnderExportRoot("Almanac Export", "Almanac Export")).toBe(true);
    // The bug a bare `startsWith` produces, and the reason for the slash.
    expect(isUnderExportRoot("Almanac Export", "Almanac Exports Old/a.md")).toBe(false);
    expect(isUnderExportRoot("Almanac Export", "02 - Diary/a.md")).toBe(false);
    // An empty root must claim nothing, or a misconfigured setting would swallow
    // the whole vault.
    expect(isUnderExportRoot("", "anything.md")).toBe(false);
  });
});

describe("what the window is shown", () => {
  const item = (over: Partial<ExportPlanItem>): ExportPlanItem => ({
    source: "02 - Diary/Daily/a.md",
    path: "Almanac Export/02 - Diary/Daily/a.md",
    content: "new",
    before: null,
    ...over,
  });

  it("says nothing about a file that already matches", () => {
    const survey = exportSurvey([item({ content: "same", before: "same" })]);
    expect(survey.groups[0].items).toEqual([]);
    // ...and the group is therefore not pending, which is what stops the window
    // opening on a re-run with nothing to do.
    expect(survey.groups[0].id).toBe("export");
  });

  it("gives a creation no diff, and a rewrite one", () => {
    const survey = exportSurvey([
      item({ source: "new.md", content: "a", before: null }),
      item({ source: "old.md", path: "Almanac Export/old.md", content: "a\nb", before: "a" }),
    ]);
    const [created, rewritten] = survey.groups[0].items;
    expect(created.diff).toBeUndefined();
    expect(created.ops[0].kind).toBe("create");
    expect(rewritten.diff).toBeDefined();
    expect(rewritten.diff?.added).toBe(1);
    expect(rewritten.ops[0].kind).toBe("rewrite");
  });

  it("names the source note, since the destination path is derived from it", () => {
    const survey = exportSurvey([item({ source: "02 - Diary/Daily/a.md" })]);
    expect(survey.groups[0].items[0].label).toBe("02 - Diary/Daily/a.md");
  });

  it("counts the three outcomes separately", () => {
    expect(
      tally([
        item({ content: "x", before: null }),
        item({ content: "x", before: "y" }),
        item({ content: "x", before: "x" }),
      ])
    ).toEqual({ created: 1, rewritten: 1, unchanged: 1 });
  });
});

describe("the writer stays inside the export folder", () => {
  // The one guard that makes a bug here recoverable, and the one assertion in
  // this file that must not be a source pin that cannot fail (4.29's outcome
  // records two of those). So: the real predicate, given a poisoned path.
  it("refuses a destination outside the root, whatever the plan said", () => {
    const root = "Almanac Export";
    for (const escape of [
      "02 - Diary/Daily/2026-08-15.md",
      "Homepage.md",
      "Almanac Exports Old/a.md",
    ]) {
      expect(isUnderExportRoot(root, escape), escape).toBe(false);
    }
  });

  it("checks that predicate at the write, not only at the plan", () => {
    const src = readSrc("vault-export-manager");
    // Scoped to the write loop rather than matched over the file: the plan calls
    // it too, and a match anywhere would pass on a version that had lost the
    // second call.
    const at = src.indexOf("async run(");
    const end = src.indexOf("\n  }", at);
    expect(src.slice(at, end)).toContain("isUnderExportRoot(this.root(), item.path)");
  });

  it("reads with cachedRead while surveying, since nothing is written yet", () => {
    const src = readSrc("vault-export-manager");
    expect(src).toContain("cachedRead");
    expect(src).toContain("mapWithLimit");
  });
});
