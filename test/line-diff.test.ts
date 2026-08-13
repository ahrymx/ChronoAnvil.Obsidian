// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The differential the repair window shows.
//
// WHAT THESE PIN. The window's claim is that what it shows IS what the write
// does, so the properties that matter are round-tripping (applying the adds and
// removes reproduces the target) and minimality (an unchanged line is never
// reported as changed). Everything else is presentation.

import { describe, expect, it } from "vitest";
import { diffLines, diffSummary, diffText } from "../src/core/line-diff";
import { repairNote } from "../src/core/repair-plan";
import { composeHomeNote, homeSectionModel } from "../src/diary/home-sections";
import { DEFAULT_PATHS } from "../src/core/constants";

const L = (s: string): string[] => s.split("\n");

// The added and removed lines, which is all the window renders.
const changed = (a: string[], b: string[]): string[] =>
  diffLines(a, b)
    .lines.filter((l) => l.kind !== "same")
    .map((l) => `${l.kind === "add" ? "+" : "−"}${l.text}`);

describe("diffLines", () => {
  it("reports nothing for identical text", () => {
    const d = diffLines(["a", "b", "c"], ["a", "b", "c"]);
    expect(d.added).toBe(0);
    expect(d.removed).toBe(0);
    expect(d.lines.every((l) => l.kind === "same")).toBe(true);
    expect(diffSummary(d)).toBeNull();
  });

  it("names an inserted line and nothing around it", () => {
    expect(changed(["a", "c"], ["a", "b", "c"])).toEqual(["+b"]);
  });

  it("names a removed line and nothing around it", () => {
    expect(changed(["a", "b", "c"], ["a", "c"])).toEqual(["−b"]);
  });

  it("puts the removal before the addition at a replacement", () => {
    // The convention every diff a reader has seen uses: the old line, then what
    // replaced it.
    expect(changed(["a", "b", "c"], ["a", "B", "c"])).toEqual(["−b", "+B"]);
  });

  it("does not report a line that only moved as changed twice over", () => {
    // The minimality property `longestCommonSubsequence` buys. A naive
    // line-by-line compare calls all three of these changed.
    expect(changed(["a", "b", "c"], ["b", "c", "a"])).toEqual(["−a", "+a"]);
  });

  it("round-trips: applying what it reports reproduces the target", () => {
    // The property the window's honesty rests on. If this holds, what a reader
    // is shown accounts for the whole of the difference.
    const cases: [string[], string[]][] = [
      [["a", "b", "c"], ["a", "x", "c"]],
      [[], ["a", "b"]],
      [["a", "b"], []],
      [["```almanac", "diary:3", "```"], ["```almanac", "row", "diary:3", "cell", "```"]],
      [["a", "a", "a"], ["a", "a"]],
    ];
    for (const [before, after] of cases) {
      const d = diffLines(before, after);
      const rebuilt = d.lines
        .filter((l) => l.kind !== "remove")
        .map((l) => l.text);
      expect(rebuilt, `${before} -> ${after}`).toEqual(after);
      const original = d.lines
        .filter((l) => l.kind !== "add")
        .map((l) => l.text);
      expect(original, `${before} -> ${after}`).toEqual(before);
    }
  });

  it("counts what it reports", () => {
    const d = diffLines(["a", "b"], ["a", "x", "y"]);
    expect(d.added).toBe(d.lines.filter((l) => l.kind === "add").length);
    expect(d.removed).toBe(d.lines.filter((l) => l.kind === "remove").length);
    expect(diffSummary(d)).toBe("+2 −1");
  });

  it("degrades honestly on a file too long to diff", () => {
    const big = Array.from({ length: 3100 }, (_, i) => `line ${i}`);
    const d = diffLines(big, [...big, "one more"]);
    expect(d.truncated).toBe(true);
    expect(d.lines).toEqual([]);
    expect(diffSummary(d)).toContain("estimated");
  });
});

describe("the window's diff is the write's own output", () => {
  it("accounts for exactly what repairNote would write", () => {
    // The claim the whole window rests on, asserted end to end rather than in
    // prose: diff the text repair produces against what is on disk, and the
    // reported lines rebuild that text exactly.
    const ROOT = DEFAULT_PATHS.diaryRoot;
    const shipped = composeHomeNote(ROOT);
    const text = L(shipped)
      .filter((l) => l.trim() !== "tasks-table")
      .join("\n");

    const { next } = repairNote(homeSectionModel(ROOT, ""), text, shipped);
    expect(next).not.toBeNull();

    const d = diffText(text, next ?? "");
    expect(d.added).toBeGreaterThan(0);
    const rebuilt = d.lines
      .filter((l) => l.kind !== "remove")
      .map((l) => l.text)
      .join("\n");
    expect(rebuilt).toBe(next);
  });
});
