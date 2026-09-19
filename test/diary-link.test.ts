// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// "Link to diary" became a picker, and stopped being only days — 1.0.29.
//
// The reader's ask: *"improve the 'Link to Diary' action to a selector dropdown
// (instead of manually entering the note's name). Also allow selecting weeks,
// months, quarters, or years."*
//
// WHAT IS WORTH ASSERTING HERE. The list's ARITHMETIC, which is pure and is
// where the off-by-one lives, and the WIRING, which is what makes the arithmetic
// reach a file. The modal itself is Obsidian's `SuggestModal` and the suite has
// no DOM; what it would tell us is that `SuggestModal` works.
//
// THE TWO BUGS THIS FILE WAS WRITTEN AGAINST, both found before it shipped and
// both invisible to a reader who was not counting rows:
//
//   `subtract(n, "isoWeek")` steps by nothing — `isoWeek` is a unit `startOf`
//   takes and `subtract` does not — so every week row named this week;
//
//   stepping a month off 31 March lands on 3 March in any implementation that
//   does not clamp, so the list skipped February and named March twice.

import { describe, expect, it } from "vitest";

import { diaryTargets, targetStartIso } from "../src/diary/diary-link";
import type { DiaryTarget } from "../src/diary/diary-link";
import { currentEntryKey } from "../src/diary/nav";
import { TRACKER_CLASSES } from "../src/trackers/trackers";
import type { TrackerClass } from "../src/trackers/trackers";
import { moment } from "../src/core/util";
import { readSrc } from "./sources";

const of = (grain: TrackerClass, anchor: string): string[] =>
  diaryTargets(anchor)
    .filter((t) => t.grain === grain)
    .map((t) => t.key);

describe("what the picker offers", () => {
  it("covers all five grains, in the catalogue's order", () => {
    // THE WHOLE OF THE SECOND HALF OF THE ASK. Before this the action meant one
    // grain, because `YYYY-MM-DD` is the shape of one grain and a prompt that
    // validates it cannot express a quarter.
    const seen: TrackerClass[] = [];
    for (const t of diaryTargets("2026-09-19")) {
      if (seen[seen.length - 1] !== t.grain) seen.push(t.grain);
    }
    expect(seen).toEqual(TRACKER_CLASSES);
  });

  it("opens each group on the anchor's own period", () => {
    // What makes a one-keypress answer possible for a page that states a date:
    // the row a reader wants is the first of its group, not somewhere down a
    // list they have to read.
    for (const grain of TRACKER_CLASSES) {
      expect(of(grain, "2026-09-19")[0], grain).toBe(
        currentEntryKey(grain, moment("2026-09-19"))
      );
    }
  });

  it("steps back by one period a row, and never repeats one", () => {
    // THE `isoWeek` TRAP. `CLASS_DEFS.weekly.unit` is the unit `startOf` needs
    // to land on a Monday; `subtract` has no such unit and answers by not
    // moving. Eight identical rows is what that looked like, and it looked like
    // a list.
    for (const grain of TRACKER_CLASSES) {
      const keys = of(grain, "2026-09-19");
      expect(keys.length, grain).toBeGreaterThan(1);
      expect(new Set(keys).size, grain).toBe(keys.length);
      // Newest first, which is the order a page is usually written about.
      expect([...keys].sort().reverse(), grain).toEqual(keys);
    }
    // The week rows are seven days apart, which is the assertion the set-size
    // check above cannot make: eight distinct Mondays could still be wrong.
    const weeks = of("weekly", "2026-09-19").map((k) => moment(k).valueOf());
    for (let i = 1; i < weeks.length; i++) {
      expect(weeks[i - 1] - weeks[i]).toBe(7 * 24 * 60 * 60 * 1000);
    }
  });

  it("does not skip a month off the end of a long one", () => {
    // 31 March minus one month is 28 February, not 3 March. The anchor is
    // snapped to its period BEFORE it is stepped, so the overflow cannot arise
    // whatever the date library does with it.
    expect(of("monthly", "2026-03-31").slice(0, 4)).toEqual([
      "2026-03",
      "2026-02",
      "2026-01",
      "2025-12",
    ]);
    expect(of("quarterly", "2026-05-31").slice(0, 3)).toEqual([
      "2026-04-01",
      "2026-01-01",
      "2025-10-01",
    ]);
  });

  it("keys each grain the way its opener takes it", () => {
    // `Diary.openOrCreateEntry` routes a month to `openOrCreateMonth`, which
    // refuses anything but `YYYY-MM`, and the other four to openers that want an
    // ISO day. A key of the wrong shape is a notice reading "Use the format
    // YYYY-MM" on a button that never mentioned a format.
    for (const t of diaryTargets("2026-09-19")) {
      expect(t.key, t.grain).toMatch(
        t.grain === "monthly" ? /^\d{4}-\d{2}$/ : /^\d{4}-\d{2}-\d{2}$/
      );
      // And every one of them names a day to stamp `date:` with.
      expect(targetStartIso(t), t.key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(moment(targetStartIso(t)).isValid(), t.key).toBe(true);
    }
    expect(targetStartIso({ grain: "monthly", key: "2026-09" } as DiaryTarget)).toBe(
      "2026-09-01"
    );
  });

  it("offers nothing at all for a date it cannot read", () => {
    // The picker still opens — *Another date…* is added by the caller — so an
    // unreadable `date:` in a reader's frontmatter leaves them a way forward
    // rather than an empty modal or a thrown error.
    expect(diaryTargets("soon")).toEqual([]);
    expect(diaryTargets("")).toEqual([]);
  });
});

describe("what the action does with the answer", () => {
  const src = (): string => readSrc("diary/diary-link.ts");

  it("asks with a list rather than with a box", () => {
    // THE FIRST HALF OF THE ASK, as a property of the source: the typed prompt
    // is no longer on the path to an answer.
    expect(src()).toContain("promptDetailedSuggester");
    expect(src()).toContain("askForEntry");
  });

  it("keeps the typed date, as the thing that moves the list", () => {
    // Not a leftover. It is what makes reach unbounded in every grain — the
    // window is what is offered unasked, not what can be chosen — and what it
    // returns is an anchor, which is the one period a `YYYY-MM-DD` box can say.
    expect(src()).toContain("Move the list to which date?");
  });

  it("goes through the one door onto the diary's three openers", () => {
    // `openOrCreateDay` alone was the whole of the old behaviour. Calling it
    // here now would mean a quarter row filing the page under a day.
    expect(src()).toContain("openOrCreateEntry(target.grain, target.key");
    expect(src()).not.toContain("openOrCreateDay(");
    expect(readSrc("diary/diary.ts")).toContain("async openOrCreateEntry(");
  });

  it("leaves a date the reader wrote exactly where it was", () => {
    // 1.0.11 skipped the prompt for a dated page so that picking could not
    // silently rewrite frontmatter. The skip is gone — five grains leave nothing
    // to assume — and this is what was actually protecting the property.
    expect(src()).toContain("if (!already) {");
  });

  it("keeps one copy of the grain dispatch", () => {
    // `resolveGrainEntry` was capture's private switch over the three openers,
    // and this action is the second caller that needs all three. Two copies are
    // two answers to "what does a monthly key look like".
    expect(readSrc("diary/capture.ts")).not.toContain("resolveGrainEntry(");
    expect(readSrc("diary/capture.ts")).toContain("openOrCreateEntry(grain, key");
  });
});
