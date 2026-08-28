// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>

import { describe, expect, it } from "vitest";
import { readCss, readSrc } from "./sources";

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
});
