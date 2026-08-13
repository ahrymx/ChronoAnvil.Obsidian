// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import {
  loggedDays,
  rollupDays,
  rollupGrainOf,
} from "../src/diary/entry-rollup";
import type { IndexedEntry } from "../src/diary/diary-index";

// A minimal IndexedEntry. Only the fields rollupDays reads are meaningful; the
// rest exist to satisfy the type, the same shape quarter-stats.test.ts uses.
function entry(
  iso: string | null,
  regions: { key: string; content: string }[],
  kind = "daily"
): IndexedEntry {
  return {
    path: `02 - Diary/Weekly/Day-${iso}.md`,
    file: null as never,
    iso,
    surface: "diary",
    kind,
    title: "",
    mood: null,
    trackers: {},
    tags: [],
    events: [],
    text: "",
    regions,
    openTasks: 0,
    doneTasks: 0,
    attachments: 0,
    typeId: null,
    crumbs: [],
  };
}

const focus = (iso: string, text: string) =>
  entry(iso, [{ key: "focus", content: text }]);

describe("rollupDays", () => {
  it("gathers the focus line of each day in the window", () => {
    const days = rollupDays(
      [focus("2026-07-02", "ship the report"), focus("2026-07-01", "plan")],
      "2026-07-01",
      "2026-07-31"
    );
    expect(days.map((d) => d.iso)).toEqual(["2026-07-01", "2026-07-02"]);
    expect(days[1].values[0].items).toEqual(["ship the report"]);
  });

  it("reads forwards, not newest-first like the timeline", () => {
    // A review is composed by reading the month in the order it happened.
    // Every retrieval surface in the plugin is newest-first; this one isn't,
    // and the difference is deliberate.
    const days = rollupDays(
      [focus("2026-07-20", "c"), focus("2026-07-05", "a"), focus("2026-07-12", "b")],
      "2026-07-01",
      "2026-07-31"
    );
    expect(days.map((d) => d.values[0].items[0])).toEqual(["a", "b", "c"]);
  });

  it("omits a logged day that wrote nothing rollupable", () => {
    // Twenty-five blank rows is a reminder that you didn't write, not
    // information — the same argument anniversaries makes for empty years.
    const days = rollupDays(
      [
        focus("2026-07-01", "plan"),
        entry("2026-07-02", [{ key: "log", content: "some prose" }]),
        entry("2026-07-03", []),
      ],
      "2026-07-01",
      "2026-07-31"
    );
    expect(days.map((d) => d.iso)).toEqual(["2026-07-01"]);
  });

  it("never gathers the log region", () => {
    const days = rollupDays(
      [
        entry("2026-07-01", [
          { key: "focus", content: "plan" },
          { key: "log", content: "three paragraphs of prose" },
          { key: "capture", content: "a stray thought" },
        ]),
      ],
      "2026-07-01",
      "2026-07-31"
    );
    const flat = JSON.stringify(days);
    expect(flat).toContain("plan");
    expect(flat).not.toContain("three paragraphs");
    expect(flat).not.toContain("stray thought");
  });

  it("excludes days outside the window at both ends", () => {
    const days = rollupDays(
      [focus("2026-06-30", "before"), focus("2026-07-15", "in"), focus("2026-08-01", "after")],
      "2026-07-01",
      "2026-07-31"
    );
    expect(days.map((d) => d.values[0].items[0])).toEqual(["in"]);
  });

  it("ignores monthly reviews", () => {
    // The month's own review is what this page is being written into; rolling
    // it up beneath itself would quote the note back at its author.
    const days = rollupDays(
      [
        entry("2026-07-01", [{ key: "focus", content: "the theme" }], "monthly"),
        focus("2026-07-02", "a day"),
      ],
      "2026-07-01",
      "2026-07-31"
    );
    expect(days.map((d) => d.values[0].items[0])).toEqual(["a day"]);
  });

  it("skips a dateless note rather than sorting it to the front", () => {
    const days = rollupDays(
      [entry(null, [{ key: "focus", content: "no date" }]), focus("2026-07-02", "dated")],
      "2026-07-01",
      "2026-07-31"
    );
    expect(days).toHaveLength(1);
  });

  it("takes only the first line of a line field", () => {
    const days = rollupDays(
      [focus("2026-07-01", "the phrase\na second line someone pasted")],
      "2026-07-01",
      "2026-07-31"
    );
    expect(days[0].values[0].items).toEqual(["the phrase"]);
  });

  it("returns nothing for an empty window", () => {
    expect(rollupDays([], "2026-07-01", "2026-07-31")).toEqual([]);
  });
});

describe("loggedDays", () => {
  it("counts every daily entry in the window, written or not", () => {
    // The denominator of "6 of 28 entries": six days said something out of
    // twenty-eight logged is a different month from six out of six.
    const entries = [
      focus("2026-07-01", "plan"),
      entry("2026-07-02", []),
      entry("2026-07-03", [{ key: "log", content: "prose" }]),
      focus("2026-08-01", "next month"),
    ];
    expect(loggedDays(entries, "2026-07-01", "2026-07-31")).toBe(3);
  });

  it("excludes monthly reviews from the count", () => {
    const entries = [
      focus("2026-07-01", "plan"),
      entry("2026-07-01", [], "monthly"),
    ];
    expect(loggedDays(entries, "2026-07-01", "2026-07-31")).toBe(1);
  });
});

// ── 3.11 §5: the widget learns which grain it gathers ─────────────────

describe("which grain a rollup gathers", () => {
  const monthly = (iso: string, text: string) =>
    entry(iso, [{ key: "focus", content: text }], "monthly");

  it("reads day from a bare directive, so every existing note is unchanged", () => {
    // The argument is additive. This is the assertion that says so.
    expect(rollupGrainOf("")).toBe("daily");
    expect(rollupGrainOf("   ")).toBe("daily");
  });

  it("reads month from the singular spelling", () => {
    // `:month`, matching `month-start` and `tasks-table:…,month` rather than
    // the index kind `monthly`. The fence language is singular throughout.
    expect(rollupGrainOf("month")).toBe("monthly");
    expect(rollupGrainOf("MONTH")).toBe("monthly");
    expect(rollupGrainOf("day")).toBe("daily");
  });

  it("falls back to day rather than refusing an unknown argument", () => {
    // A typo renders the bare behaviour rather than an error box. The section
    // catalogue writes this argument, so a wrong one can only come from a
    // reader typing it, and the widget above it already explains itself.
    expect(rollupGrainOf("weekly")).toBe("daily");
    expect(rollupGrainOf("nonsense")).toBe("daily");
  });

  it("gathers monthly entries and ignores the days beside them", () => {
    // THE HALF OF §5 THAT IS REAL CODE. `rollupDays` filtered
    // `e.kind !== "daily"` with the spelling hardcoded, so a quarter could not
    // have rolled up months even where the section allowed it.
    const entries = [
      monthly("2026-01-01", "ship the thing"),
      monthly("2026-02-01", "rest"),
      focus("2026-01-14", "a day inside the same window"),
    ];
    const got = rollupDays(entries, "2026-01-01", "2026-03-31", "monthly");
    expect(got.map((d) => d.iso)).toEqual(["2026-01-01", "2026-02-01"]);
  });

  it("still gathers days when asked for days, with months present", () => {
    const entries = [
      monthly("2026-01-01", "ship the thing"),
      focus("2026-01-14", "a day"),
    ];
    expect(rollupDays(entries, "2026-01-01", "2026-03-31").map((d) => d.iso)).toEqual([
      "2026-01-14",
    ]);
  });

  it("counts logged entries of the grain it was asked for", () => {
    // `loggedDays` feeds the "2 of 3" pill. Counting days while listing months
    // would have made the pill read 0 of 31 on a quarter.
    const entries = [
      monthly("2026-01-01", "a"),
      monthly("2026-02-01", "b"),
      focus("2026-01-14", "a day"),
    ];
    expect(loggedDays(entries, "2026-01-01", "2026-03-31", "monthly")).toBe(2);
    expect(loggedDays(entries, "2026-01-01", "2026-03-31")).toBe(1);
  });

  it("keeps a month with no rollupable content out of the list", () => {
    // Same rule as for days, and worth pinning at the new grain: a blank row
    // is a reminder that you did not write rather than information.
    const entries = [
      entry("2026-01-01", [{ key: "log", content: "prose" }], "monthly"),
      monthly("2026-02-01", "wrote something"),
    ];
    expect(
      rollupDays(entries, "2026-01-01", "2026-03-31", "monthly").map((d) => d.iso)
    ).toEqual(["2026-02-01"]);
  });
});
