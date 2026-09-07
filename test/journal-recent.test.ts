// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// `journal-recent[:<scope>[|N]]` (4.70): the ordering and the count.
//
// The two halves worth pinning are the two that are silently wrong rather than
// visibly broken. A list sorted by the DISPLAYED date rather than by `created`
// still renders — it just answers a different question from the one the widget
// claims to — and a count read off the wrong side of the separator draws eight
// rows on a directive that asked for four.

import { describe, it, expect } from "vitest";
import { readSrc } from "./sources";
import {
  DEFAULT_RECENT,
  rankRecent,
  recentLimit,
} from "../src/journals/journal-recent";
import type { RecentRow } from "../src/journals/journal-recent";

const row = (path: string, ms: number, iso: string | null = null): RecentRow => ({
  path,
  title: path.split("/").pop() ?? path,
  where: [],
  iso,
  rating: null,
  ms,
});

describe("the order is what was written last", () => {
  it("puts the most recently created first", () => {
    const out = rankRecent(
      [row("a.md", 100), row("b.md", 300), row("c.md", 200)],
      10
    );
    expect(out.map((r) => r.path)).toEqual(["b.md", "c.md", "a.md"]);
  });

  it("ranks by created even where the note's own date disagrees", () => {
    // THE CASE THE WIDGET EXISTS FOR. A lesson dated last Tuesday and written
    // up on Friday is more recent WORK than one dated and written yesterday,
    // and "what did I write lately" is a question about the writing. The row
    // still shows the note's own date — that is the fact the note asserts —
    // which is why the two fields are separate rather than one.
    const out = rankRecent(
      [
        row("friday-writeup.md", 300, "2026-08-18"),
        row("dated-yesterday.md", 200, "2026-08-23"),
      ],
      10
    );
    expect(out.map((r) => r.path)).toEqual([
      "friday-writeup.md",
      "dated-yesterday.md",
    ]);
  });

  it("breaks a tie by path rather than by whatever the walk found first", () => {
    // `pagesUnder` walks the vault, and a vault's order is not a promise. Two
    // notes created in the same millisecond — a scripted import, a restored
    // backup — would otherwise swap places between repaints.
    const forward = rankRecent([row("a.md", 5), row("b.md", 5)], 10);
    const backward = rankRecent([row("b.md", 5), row("a.md", 5)], 10);
    expect(forward.map((r) => r.path)).toEqual(["a.md", "b.md"]);
    expect(backward.map((r) => r.path)).toEqual(["a.md", "b.md"]);
  });

  it("caps at the limit and never at nothing", () => {
    const rows = [row("a.md", 1), row("b.md", 2), row("c.md", 3)];
    expect(rankRecent(rows, 2)).toHaveLength(2);
    // A zero or a negative reaching this from a hand-typed `|0` draws one row
    // rather than an empty widget: an empty list is the state that means
    // "nothing written here yet", and a count must not be able to fake it.
    expect(rankRecent(rows, 0)).toHaveLength(1);
    expect(rankRecent(rows, -4)).toHaveLength(1);
  });

  it("does not reorder the caller's array", () => {
    const rows = [row("a.md", 1), row("b.md", 2)];
    rankRecent(rows, 10);
    expect(rows.map((r) => r.path)).toEqual(["a.md", "b.md"]);
  });
});

describe("the count after the separator", () => {
  it("defaults where there is no second piece", () => {
    expect(recentLimit("")).toBe(DEFAULT_RECENT);
    expect(recentLimit("all")).toBe(DEFAULT_RECENT);
    expect(recentLimit("Study/Maths")).toBe(DEFAULT_RECENT);
  });

  it("reads the piece after the pipe", () => {
    expect(recentLimit("all|4")).toBe(4);
    expect(recentLimit("|15")).toBe(15);
    expect(recentLimit("Study/Maths | 4 ")).toBe(4);
  });

  it("falls back rather than refusing a directive whose scope is fine", () => {
    // `time-grid`'s permissiveness, for its reason: the first piece is the one
    // that decides WHAT is drawn, and a junk second piece should not blank a
    // widget whose scope resolves.
    expect(recentLimit("all|many")).toBe(DEFAULT_RECENT);
    expect(recentLimit("all|")).toBe(DEFAULT_RECENT);
    expect(recentLimit("all|-3")).toBe(DEFAULT_RECENT);
    expect(recentLimit("all|2.7")).toBe(2);
  });

  it("splits on the FIRST pipe, so a folder keeps its slashes", () => {
    // The separator is `|` and not the table's default `/` for exactly this:
    // `journal-recent:Study/Maths/Algebra|4` has three slashes in its first
    // piece and the folder must survive all of them.
    expect(recentLimit("Study/Maths/Algebra|4")).toBe(4);
  });
});

describe("what counts as a note you wrote", () => {
  // SOURCE-READ, because the alternative is a whole vault fixture for a rule
  // that is three lines long. What is guarded is that the filter asks about
  // BOTH lists — a kind and a page — since dropping the second is the failure
  // that looks like nothing: pages simply stop appearing, and only a reader who
  // knows they wrote one would notice.
  const src = readSrc("journal-recent");

  it("admits pages as well as kinds", () => {
    expect(src).toContain("kinds.has(kindId) || pages.has(kindId)");
    expect(src).toContain("pageTypeIds");
  });

  it("excludes anything with no type at all, which is every container", () => {
    expect(src).toContain("if (!kindId ||");
  });

  it("ranks on recencyMs rather than on the row's own iso", () => {
    expect(src).toContain("ms: recencyMs(p.fm, p.file)");
  });
});
