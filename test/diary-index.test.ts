// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import { TFile } from "./obsidian-stub";
import {
  parseQuery,
  tokenize,
  relativeOrIso,
  passesFilters,
  scoreEntry,
  buildSnippet,
  searchEntries,
  isEmptyQuery,
  anniversaries,
  groupByMonth,
  buildEntry,
  IndexedEntry,
  searchHintLine,
  HAS_VALUES,
} from "../src/diary/diary-index";

// A minimal indexed entry, overridable per case.
function entry(over: Partial<IndexedEntry> = {}): IndexedEntry {
  const iso = over.iso ?? "2026-03-04";
  const file = new TFile(`02 - Diary/Weekly/Day-${iso}.md`);
  return {
    path: file.path,
    file: file as unknown as IndexedEntry["file"],
    iso,
    kind: "daily",
    title: `Day-${iso}`,
    mood: null,
    trackers: {},
    tags: [],
    events: [],
    text: "",
    regions: [],
    openTasks: 0,
    doneTasks: 0,
    attachments: 0,
    ...over,
  };
}

describe("tokenize", () => {
  it("splits on whitespace", () => {
    expect(tokenize("one two  three")).toEqual(["one", "two", "three"]);
  });

  it("keeps quoted phrases together", () => {
    expect(tokenize('dentist "root canal" pain')).toEqual([
      "dentist",
      "root canal",
      "pain",
    ]);
  });

  it("ignores empty input", () => {
    expect(tokenize("   ")).toEqual([]);
  });
});

describe("relativeOrIso", () => {
  it("accepts a full ISO date", () => {
    expect(relativeOrIso("2026-03-04")).toBe("2026-03-04");
  });

  it("widens a month or year to its first day", () => {
    expect(relativeOrIso("2026-03")).toBe("2026-03-01");
    expect(relativeOrIso("2026")).toBe("2026-01-01");
  });

  it("counts relative windows back from the given today", () => {
    expect(relativeOrIso("30d", "2026-03-31")).toBe("2026-03-01");
    expect(relativeOrIso("1y", "2026-03-31")).toBe("2025-03-31");
  });

  it("rejects nonsense so it can fall through to a search term", () => {
    expect(relativeOrIso("soonish")).toBeNull();
  });
});

describe("parseQuery", () => {
  it("keeps bare words as terms, lowercased", () => {
    expect(parseQuery("Dentist Pain").terms).toEqual(["dentist", "pain"]);
  });

  it("pulls out date, tag, kind and has filters", () => {
    const q = parseQuery("from:2026-01-01 to:2026-02-01 tag:health is:daily has:attachment");
    expect(q.from).toBe("2026-01-01");
    expect(q.to).toBe("2026-02-01");
    expect(q.tag).toBe("#health");
    expect(q.kind).toBe("daily");
    expect(q.has).toEqual(["attachment"]);
    expect(q.terms).toEqual([]);
  });

  it("accepts a tag written with or without the hash", () => {
    expect(parseQuery("tag:#health").tag).toBe("#health");
  });

  it("parses a numeric tracker comparison", () => {
    expect(parseQuery("Mood<=2").compare).toEqual({
      key: "Mood",
      op: "<=",
      value: 2,
    });
  });

  // A search box that errors on a stray colon is worse than one that searches
  // for it, so unrecognised filter-shaped tokens stay terms.
  it("keeps an unrecognised filter as a search term", () => {
    const q = parseQuery("is:banana");
    expect(q.kind).toBeNull();
    expect(q.terms).toEqual(["is:banana"]);
  });

  it("keeps an unparseable date filter as a search term", () => {
    const q = parseQuery("from:soonish");
    expect(q.from).toBeNull();
    expect(q.terms).toEqual(["from:soonish"]);
  });
});

describe("isEmptyQuery", () => {
  it("is true for nothing at all", () => {
    expect(isEmptyQuery(parseQuery("   "))).toBe(true);
  });

  it("is false when only a filter is given", () => {
    expect(isEmptyQuery(parseQuery("tag:health"))).toBe(false);
  });
});

describe("passesFilters", () => {
  it("bounds by date inclusively", () => {
    const q = parseQuery("from:2026-03-01 to:2026-03-31");
    expect(passesFilters(entry({ iso: "2026-03-01" }), q)).toBe(true);
    expect(passesFilters(entry({ iso: "2026-03-31" }), q)).toBe(true);
    expect(passesFilters(entry({ iso: "2026-02-28" }), q)).toBe(false);
    expect(passesFilters(entry({ iso: "2026-04-01" }), q)).toBe(false);
  });

  it("matches tags case-insensitively", () => {
    const q = parseQuery("tag:Health");
    expect(passesFilters(entry({ tags: ["#health"] }), q)).toBe(true);
    expect(passesFilters(entry({ tags: ["#travel"] }), q)).toBe(false);
  });

  it("filters by entry kind", () => {
    const q = parseQuery("is:monthly");
    expect(passesFilters(entry({ kind: "monthly" }), q)).toBe(true);
    expect(passesFilters(entry({ kind: "daily" }), q)).toBe(false);
  });

  it("filters on presence of attachments, tasks and events", () => {
    expect(passesFilters(entry({ attachments: 1 }), parseQuery("has:attachment"))).toBe(true);
    expect(passesFilters(entry(), parseQuery("has:attachment"))).toBe(false);
    expect(passesFilters(entry({ doneTasks: 1 }), parseQuery("has:task"))).toBe(true);
    expect(passesFilters(entry({ events: ["annas-birthday"] }), parseQuery("has:event"))).toBe(true);
  });

  it("compares a numeric tracker", () => {
    const low = entry({ trackers: { Mood: 2 } });
    const high = entry({ trackers: { Mood: 5 } });
    expect(passesFilters(low, parseQuery("Mood<=2"))).toBe(true);
    expect(passesFilters(high, parseQuery("Mood<=2"))).toBe(false);
    expect(passesFilters(high, parseQuery("Mood>4"))).toBe(true);
  });

  // A blank tracker must not read as 0 and satisfy `Mood<=2` — that would fill
  // a "worst days" search with days that simply weren't logged.
  it("excludes an entry whose compared tracker is unset or blank", () => {
    expect(passesFilters(entry({ trackers: {} }), parseQuery("Mood<=2"))).toBe(false);
    expect(passesFilters(entry({ trackers: { Mood: "" } }), parseQuery("Mood<=2"))).toBe(false);
  });
});

describe("scoreEntry", () => {
  it("scores zero for no terms (filters alone still match)", () => {
    expect(scoreEntry(entry(), [])).toBe(0);
  });

  it("requires every term to appear (AND, not OR)", () => {
    const e = entry({ text: "went to the dentist" });
    expect(scoreEntry(e, ["dentist"])).toBeGreaterThan(0);
    expect(scoreEntry(e, ["dentist", "beach"])).toBe(-1);
  });

  it("ranks a title match above a body-only match", () => {
    const inTitle = entry({ title: "Dentist", text: "" });
    const inBody = entry({ title: "Day-2026-03-04", text: "dentist" });
    expect(scoreEntry(inTitle, ["dentist"])).toBeGreaterThan(
      scoreEntry(inBody, ["dentist"])
    );
  });

  it("ranks a whole-word match above a substring match", () => {
    const whole = entry({ text: "went for a run" });
    const partial = entry({ text: "running late again" });
    expect(scoreEntry(whole, ["run"])).toBeGreaterThan(scoreEntry(partial, ["run"]));
    // but the substring still matches — it isn't excluded
    expect(scoreEntry(partial, ["run"])).toBeGreaterThan(0);
  });

  it("is case-insensitive", () => {
    expect(scoreEntry(entry({ text: "Dentist" }), ["dentist"])).toBeGreaterThan(0);
  });
});

describe("buildSnippet", () => {
  it("returns the region containing the match, and names it", () => {
    const e = entry({
      regions: [
        { key: "focus", content: "ship the release" },
        { key: "log", content: "long day at the dentist, all fine" },
      ],
    });
    const { snippet, key } = buildSnippet(e, ["dentist"]);
    expect(key).toBe("log");
    expect(snippet).toContain("dentist");
  });

  it("falls back to the first non-empty region when there are no terms", () => {
    const e = entry({
      regions: [
        { key: "focus", content: "" },
        { key: "log", content: "quiet day" },
      ],
    });
    expect(buildSnippet(e, []).key).toBe("log");
  });

  it("collapses whitespace and clips long content", () => {
    const e = entry({ regions: [{ key: "log", content: "a\n\n   b" }] });
    expect(buildSnippet(e, []).snippet).toBe("a b");
    const long = entry({ regions: [{ key: "log", content: "x".repeat(400) }] });
    expect(buildSnippet(long, [], 50).snippet.length).toBeLessThanOrEqual(51);
  });

  it("returns empty for an entry with nothing written in it", () => {
    expect(buildSnippet(entry(), []).snippet).toBe("");
  });
});

describe("searchEntries", () => {
  const corpus = [
    entry({ iso: "2026-03-01", text: "dentist appointment", regions: [{ key: "log", content: "dentist appointment" }] }),
    entry({ iso: "2026-03-05", text: "beach day", regions: [{ key: "log", content: "beach day" }] }),
    entry({ iso: "2026-03-09", title: "Dentist", text: "follow up", regions: [{ key: "log", content: "follow up" }] }),
  ];

  it("returns only matching entries", () => {
    const hits = searchEntries(corpus, parseQuery("dentist"));
    expect(hits.map((h) => h.entry.iso).sort()).toEqual(["2026-03-01", "2026-03-09"]);
  });

  it("sorts by score, then newest first", () => {
    const hits = searchEntries(corpus, parseQuery("dentist"));
    // The title match outranks the body match regardless of date order.
    expect(hits[0].entry.iso).toBe("2026-03-09");
  });

  it("breaks equal scores by recency", () => {
    const hits = searchEntries(corpus, parseQuery("from:2026-03-01"));
    expect(hits.map((h) => h.entry.iso)).toEqual([
      "2026-03-09",
      "2026-03-05",
      "2026-03-01",
    ]);
  });

  it("honours the limit", () => {
    expect(searchEntries(corpus, parseQuery("from:2026-01-01"), 2)).toHaveLength(2);
  });

  it("combines a filter with a term", () => {
    const hits = searchEntries(corpus, parseQuery("dentist to:2026-03-05"));
    expect(hits.map((h) => h.entry.iso)).toEqual(["2026-03-01"]);
  });
});

describe("anniversaries", () => {
  const corpus = [
    entry({ iso: "2025-03-04" }),
    entry({ iso: "2024-03-04" }),
    entry({ iso: "2024-03-05" }),
    entry({ iso: "2026-03-04" }), // today itself
  ];

  it("groups earlier years sharing the month and day", () => {
    const groups = anniversaries(corpus, "2026-03-04");
    expect(groups.map((g) => g.yearsAgo)).toEqual([1, 2]);
    expect(groups[0].entries[0].iso).toBe("2025-03-04");
  });

  it("excludes today and any future entry", () => {
    const isos = anniversaries(corpus, "2026-03-04").flatMap((g) =>
      g.entries.map((e) => e.iso)
    );
    expect(isos).not.toContain("2026-03-04");
  });

  // An empty year is a reminder you weren't journalling, which nobody opened
  // the diary to receive.
  it("omits years with no entry rather than showing them blank", () => {
    const groups = anniversaries([entry({ iso: "2020-03-04" })], "2026-03-04");
    expect(groups).toHaveLength(1);
    expect(groups[0].yearsAgo).toBe(6);
  });

  it("ignores monthly reviews", () => {
    const groups = anniversaries(
      [entry({ iso: "2025-03-04", kind: "monthly" })],
      "2026-03-04"
    );
    expect(groups).toHaveLength(0);
  });

  it("respects the maxYears bound", () => {
    expect(anniversaries([entry({ iso: "1990-03-04" })], "2026-03-04", 25)).toHaveLength(0);
  });

  // Feb 29 is matched literally: a wrong anniversary is worse than none.
  it("shows nothing on a non-leap year for a Feb 29 entry", () => {
    const leap = [entry({ iso: "2024-02-29" })];
    expect(anniversaries(leap, "2026-02-28")).toHaveLength(0);
    expect(anniversaries(leap, "2028-02-29")).toHaveLength(1);
  });
});

describe("groupByMonth", () => {
  it("groups newest month first, newest entry first within it", () => {
    const groups = groupByMonth([
      entry({ iso: "2026-02-10" }),
      entry({ iso: "2026-03-01" }),
      entry({ iso: "2026-03-09" }),
    ]);
    expect(groups.map((g) => g.month)).toEqual(["2026-03", "2026-02"]);
    expect(groups[0].entries.map((e) => e.iso)).toEqual(["2026-03-09", "2026-03-01"]);
  });

  it("returns nothing for no entries", () => {
    expect(groupByMonth([])).toEqual([]);
  });
});

describe("buildEntry", () => {
  const file = new TFile("02 - Diary/Weekly/Day-2026-03-04.md") as unknown as IndexedEntry["file"];

  it("skips a note with no journal-date (folder notes, dashboards)", () => {
    expect(buildEntry(file, {}, "", [], "Mood")).toBeNull();
  });

  it("reads date, mood, title and tags off the frontmatter", () => {
    const e = buildEntry(
      file,
      { "journal-date": "2026-03-04", Mood: 4, title: "A good day" },
      "",
      ["#health"],
      "Mood"
    );
    expect(e?.iso).toBe("2026-03-04");
    expect(e?.mood).toBe(4);
    expect(e?.title).toBe("A good day");
    expect(e?.tags).toEqual(["#health"]);
    expect(e?.kind).toBe("daily");
  });

  it("falls back to the filename when no title is set", () => {
    const e = buildEntry(file, { "journal-date": "2026-03-04" }, "", [], "Mood");
    expect(e?.title).toBe("Day-2026-03-04");
  });

  it("treats a blank or non-numeric mood as absent, not zero", () => {
    const blank = buildEntry(file, { "journal-date": "2026-03-04", Mood: "" }, "", [], "Mood");
    expect(blank?.mood).toBeNull();
  });

  it("classifies a monthly review by its journal property", () => {
    const e = buildEntry(
      file,
      { "journal-date": "2026-03-01", journal: "Monthly Entry" },
      "",
      [],
      "Mood"
    );
    expect(e?.kind).toBe("monthly");
  });

  it("counts open and completed tasks from body regions", () => {
    const body = [
      "<!--almanac:todo",
      "- ( ) water plants",
      "- (x) reply to email",
      "-->",
    ].join("\n");
    const e = buildEntry(file, { "journal-date": "2026-03-04" }, body, [], "Mood");
    expect(e?.openTasks).toBe(1);
    expect(e?.doneTasks).toBe(1);
  });

  it("makes task text searchable", () => {
    const body = "<!--almanac:todo\n- ( ) call the dentist\n-->";
    const e = buildEntry(file, { "journal-date": "2026-03-04" }, body, [], "Mood");
    expect(e?.text).toContain("call the dentist");
  });

  it("counts attachments in their markdown forms", () => {
    const body = [
      "<!--almanac:attachments",
      "![[photo.png]]",
      "[[Some note]]",
      "[a link](https://example.com)",
      "-->",
    ].join("\n");
    const e = buildEntry(file, { "journal-date": "2026-03-04" }, body, [], "Mood");
    expect(e?.attachments).toBe(3);
  });

  it("indexes prose regions as searchable text", () => {
    const body = "<!--almanac:log\nlong day at the dentist\n-->";
    const e = buildEntry(file, { "journal-date": "2026-03-04" }, body, [], "Mood");
    expect(e?.text).toContain("dentist");
    expect(e?.regions.map((r) => r.key)).toEqual(["log"]);
  });

  it("normalises a single event id to a list", () => {
    const e = buildEntry(
      file,
      { "journal-date": "2026-03-04", events: "annas-birthday" },
      "",
      [],
      "Mood"
    );
    expect(e?.events).toEqual(["annas-birthday"]);
  });
});

// The home-layout guard lives in scaffold.ts but is pure, and it is exactly the
// kind of check that rots silently: it decides whether an existing vault ever
// sees a newly-shipped block, and getting it wrong fails by doing nothing.
// The homeNeedsUpgrade tests lived here and went with the function in 2.53.
// They pinned two hand-written regexes standing in for "everything the current
// homepage should contain" — a second source of truth for what the shipped
// asset already knows, with a comment instructing the next developer to keep
// them in sync and a second comment recording that the discipline had already
// failed once. layout.ts diffs the note against the asset instead, so there is
// nothing to keep in sync and nothing to test here; see test/layout.test.ts.


// ── the hint line under the search box, 4.25 §4 ───────────────────────
//
// Both hints were literals before this, and both had gone wrong in the way a
// literal does: the diary's froze `to:2026-03`, and the journal's dropped `to:`
// altogether. These assert the two PROPERTIES that failure had — an example
// that ages, and two surfaces disagreeing — rather than the text of the line,
// which is free to change.
describe("searchHintLine", () => {
  it("dates its `to:` example from the clock, not from a literal", () => {
    const then = searchHintLine({
      kind: "monthly",
      tag: "health",
      tracker: "Mood",
      now: "2026-03",
    });
    const later = searchHintLine({
      kind: "monthly",
      tag: "health",
      tracker: "Mood",
      now: "2031-11",
    });
    expect(then).toContain("to:2026-03");
    expect(later).toContain("to:2031-11");
    // The frozen month must not survive anywhere as a default.
    expect(
      searchHintLine({ kind: "monthly", tag: "health", tracker: "Mood" })
    ).not.toContain("to:2026-03");
  });

  it("offers every filter key the parser accepts, on both surfaces", () => {
    const diary = searchHintLine({
      kind: "monthly",
      tag: "health",
      tracker: "Mood",
      now: "2026-08",
    });
    const journal = searchHintLine({
      kind: "lesson",
      tag: "algebra",
      tracker: "confidence",
      now: "2026-08",
    });
    for (const key of ["from:", "to:", "tag:", "is:", "has:"]) {
      expect(diary).toContain(key);
      expect(journal).toContain(key);
    }
    // ...and the compare clause, which has no `key:` shape.
    expect(diary).toContain("Mood<=2");
    expect(journal).toContain("confidence<=2");
  });

  it("only shows a `has:` value the parser will actually take", () => {
    const hint = searchHintLine({
      kind: "monthly",
      tag: "health",
      tracker: "Mood",
      now: "2026-08",
    });
    const shown = /has:(\w+)/.exec(hint)?.[1] ?? "";
    expect(HAS_VALUES).toContain(shown);
    // The parser keeps it as a filter rather than demoting it to a search term.
    expect(parseQuery(`has:${shown}`).has).toEqual([shown]);
    expect(parseQuery(`has:${shown}`).terms).toEqual([]);
  });

  it("teaches an `is:` value the surface it is drawn on will accept", () => {
    // The diary's hint says `is:monthly`; the diary's parser knows daily and
    // monthly. A hint promising a filter the page rejects is worse than none.
    expect(parseQuery("is:monthly").kind).toBe("monthly");
    expect(parseQuery("is:lesson", ["lesson", "practice"]).kind).toBe("lesson");
  });
});
