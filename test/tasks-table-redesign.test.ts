// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>

import { describe, expect, it } from "vitest";
import { readCss, readSrc } from "./sources";
import { DEFAULT_PATHS } from "../src/core/constants";
import { hostIsDiary } from "../src/ui/widgets/directive-regions";

describe("open tasks table redesign", () => {
  const src = readSrc("tables");
  const css = readCss("94-native-tables");

  it("congregates daily tasks into week buckets", () => {
    expect(src).toContain("weekBuckets");
    expect(src).toContain("isoWeek");
    expect(src).toContain("jtt-bucket");
  });

  it("congregates journal tasks into journal buckets with journal glyph & name", () => {
    expect(src).toContain("journalBuckets");
    expect(src).toContain("registeredJournalTypes(plugin)");
    expect(src).toContain("${jType.emoji} ${jType.name} Journal");
  });

  it("extracts inline tags and renders them on the right-hand meta cluster", () => {
    expect(src).toContain("journal-task-tag");
    expect(src).toContain("#[a-zA-Z0-9_\\-/]+");
    expect(css).toContain(".journal-tasks-table .journal-task-tag");
  });

  it("provides collapsible bucket containers with toggleable chevrons", () => {
    expect(src).toContain("jtt-group-chevron");
    expect(src).toContain("is-collapsed");
    expect(css).toContain(".journal-tasks-table .jtt-bucket.is-collapsed");
  });

  it("scopes bare tasks-table on diary overview notes to the diary root", () => {
    const dirSrc = readSrc("directive-regions");
    expect(dirSrc).toContain("paths.diaryRoot");
    expect(dirSrc).toContain("defaultFolder = paths.diaryRoot");
  });

  // ── AND STILL DOES FROM `Dashboards/` (4.81) ─────────────────────────
  //
  // The four dashboards compose `tasks-table:,period` with an EMPTY folder,
  // which means "the host's own folder" for every other note in the vault. They
  // survived being moved out of their grain folders because the diary test is a
  // prefix on the root, not a list of the five — so the weekly dashboard still
  // gathers the tasks written in the week's entries rather than the nothing
  // that is in `Dashboards/`.
  it("keeps a moved dashboard inside the diary", () => {
    const paths = DEFAULT_PATHS;
    expect(hostIsDiary(paths, paths.diaryDashboards)).toBe(true);
    expect(hostIsDiary(paths, paths.diaryRoot)).toBe(true);
    // A period folder in the tree, and a legacy grain folder.
    expect(
      hostIsDiary(paths, `${paths.diaryRoot}/Entries/Year-2026/Quarter-2026-Q3`)
    ).toBe(true);
    expect(hostIsDiary(paths, paths.diaryWeekly)).toBe(true);
  });

  it("does not claim a folder that merely starts like the diary", () => {
    const paths = DEFAULT_PATHS;
    expect(hostIsDiary(paths, "02 - Diary Archive")).toBe(false);
    expect(hostIsDiary(paths, "03 - Journals/Study")).toBe(false);
    expect(hostIsDiary(paths, null)).toBe(false);
  });

  it("still knows a grain a reader points outside the diary", () => {
    const moved = { ...DEFAULT_PATHS, diaryWeekly: "Elsewhere/Weeks" };
    expect(hostIsDiary(moved, "Elsewhere/Weeks")).toBe(true);
    expect(hostIsDiary(moved, "Elsewhere")).toBe(false);
  });
});
