// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";

import {
  DIARY_SPEC,
  IndexSpec,
  IndexedEntry,
  buildEntry,
  buildIndexed,
  byDateDesc,
  groupByMonth,
  anniversaries,
  parseQuery,
  passesFilters,
  searchEntries,
} from "../src/diary/diary-index";
import { TFile } from "./obsidian-stub";

import { allSrcNames, readSrc } from "./sources";
const file = (path: string): IndexedEntry["file"] =>
  new TFile(path) as unknown as IndexedEntry["file"];

const JOURNAL: IndexSpec = {
  surface: "journal",
  dateKey: "date",
  requireDate: false,
  moodKey: "",
  typeId: "study",
  crumbs: ["Maths", "Algebra"],
};

function note(over: Partial<IndexedEntry> = {}): IndexedEntry {
  return {
    path: "03 - Journals/Maths/Algebra/Quadratics.md",
    file: file("03 - Journals/Maths/Algebra/Quadratics.md"),
    iso: "2026-03-04",
    surface: "journal",
    kind: "lesson",
    title: "Quadratics",
    mood: null,
    trackers: {},
    tags: [],
    events: [],
    text: "",
    regions: [],
    openTasks: 0,
    doneTasks: 0,
    attachments: 0,
    typeId: "study",
    crumbs: ["Maths", "Algebra"],
    ...over,
  };
}

describe("one index, two surfaces", () => {
  it("indexes a dated lesson off its own date property", () => {
    // The diary writes `journal-date`; a journal note writes `date`. Naming
    // the key in the spec is what lets one builder serve both.
    const e = buildIndexed(
      file("03 - Journals/Maths/Algebra/Quadratics.md"),
      { type: "lesson", date: "2026-03-04", confidence: 4 },
      "",
      [],
      JOURNAL
    );
    expect(e?.iso).toBe("2026-03-04");
    expect(e?.kind).toBe("lesson");
    expect(e?.surface).toBe("journal");
  });

  it("keeps an undated page rather than skipping it", () => {
    // THE change item 4 turns on. A page carries no date — and a page is
    // exactly the note this feature exists to make findable, because splitting
    // a lesson across five of them is what made the lesson hard to find.
    const e = buildIndexed(
      file("03 - Journals/Maths/Algebra/Quadratics/Worked examples.md"),
      { type: "page", parent: "Quadratics" },
      "<!--almanac:notes\nCompleting the square\n-->",
      [],
      { ...JOURNAL, crumbs: ["Maths", "Algebra", "Quadratics"] }
    );
    expect(e).not.toBeNull();
    expect(e?.iso).toBeNull();
    expect(e?.kind).toBe("page");
    expect(e?.text).toContain("Completing the square");
  });

  it("still skips an undated diary entry", () => {
    // The diary's rule is unchanged: an undated file in the entry folders is a
    // folder note or a dashboard, not an entry.
    expect(DIARY_SPEC.requireDate).toBe(true);
    expect(buildEntry(file("02 - Diary/Daily/x.md"), {}, "", [], "Mood")).toBeNull();
  });

  it("reads a note's body regions whichever surface it is on", () => {
    const e = buildIndexed(
      file("03 - Journals/Maths/Algebra/Quadratics.md"),
      { type: "lesson", date: "2026-03-04" },
      "<!--almanac:recall\nWhat is a closure? :: A function plus its scope\n-->",
      [],
      JOURNAL
    );
    // The recall cards from item 2 are body-region content, so they are
    // searchable for free — which is most of the point of indexing bodies.
    expect(e?.text).toContain("closure");
    expect(e?.regions.map((r) => r.key)).toEqual(["recall"]);
  });

  it("carries the crumbs a result row needs", () => {
    const e = buildIndexed(
      file("03 - Journals/Maths/Algebra/Quadratics.md"),
      { type: "lesson", date: "2026-03-04" },
      "",
      [],
      JOURNAL
    );
    expect(e?.crumbs).toEqual(["Maths", "Algebra"]);
    expect(e?.typeId).toBe("study");
  });

  it("leaves a diary entry with no journal context", () => {
    const e = buildEntry(
      file("02 - Diary/Daily/Day-2026-03-04.md"),
      { "journal-date": "2026-03-04" },
      "",
      [],
      "Mood"
    );
    expect(e?.surface).toBe("diary");
    expect(e?.typeId).toBeNull();
    expect(e?.crumbs).toEqual([]);
  });
});

describe("dateless notes in a dated world", () => {
  it("sorts them last rather than first", () => {
    // An empty-string date would sort a Topic index above every lesson. A
    // dateless note has no position on the axis at all.
    const dates = ["2026-01-01", null, "2026-05-05"];
    expect([...dates].sort(byDateDesc)).toEqual(["2026-05-05", "2026-01-01", null]);
  });

  it("fails a date filter instead of passing it", () => {
    const undated = note({ iso: null });
    expect(passesFilters(undated, parseQuery("from:2026-01-01"))).toBe(false);
    expect(passesFilters(undated, parseQuery("to:2026-12-31"))).toBe(false);
  });

  it("is still findable by text", () => {
    // Only the *date* filter excludes it. A page you wrote about closures is
    // the thing you are searching for.
    const undated = note({ iso: null, text: "closures capture scope" });
    const hits = searchEntries([undated], parseQuery("closures"));
    expect(hits).toHaveLength(1);
  });

  it("is skipped by the diary's dated groupings", () => {
    const undated = note({ iso: null, kind: "daily" });
    expect(groupByMonth([undated])).toEqual([]);
    expect(anniversaries([undated], "2026-03-04")).toEqual([]);
  });
});

describe("`is:` is surface-dependent", () => {
  it("accepts the diary's kinds by default", () => {
    expect(parseQuery("is:daily").kind).toBe("daily");
    expect(parseQuery("is:monthly").kind).toBe("monthly");
  });

  it("accepts a journal's kinds when told them", () => {
    // Hardcoding daily/monthly would have made `is:lesson` a literal string
    // search on a journal.
    const q = parseQuery("is:lesson", ["lesson", "practice", "page"]);
    expect(q.kind).toBe("lesson");
    expect(q.terms).toEqual([]);
  });

  it("keeps the unrecognised-filter rule on both surfaces", () => {
    // The actual principle was never "the valid kinds are daily and monthly",
    // it was "an unrecognised filter stays a search term".
    expect(parseQuery("is:banana").terms).toEqual(["is:banana"]);
    expect(parseQuery("is:banana", ["lesson"]).terms).toEqual(["is:banana"]);
    expect(parseQuery("is:lesson").terms).toEqual(["is:lesson"]);
  });

  it("filters on the kind it parsed", () => {
    const lesson = note({ kind: "lesson" });
    const page = note({ kind: "page" });
    const q = parseQuery("is:page", ["lesson", "page"]);
    expect(passesFilters(lesson, q)).toBe(false);
    expect(passesFilters(page, q)).toBe(true);
  });
});

describe("the filters that come free", () => {
  it("compares a journal tracker", () => {
    // The compare filter reads entry.trackers, which is the whole frontmatter,
    // so `confidence<=2` works on the journal surface with no new code.
    const shaky = note({ trackers: { confidence: 2 } });
    const solid = note({ trackers: { confidence: 5 } });
    const q = parseQuery("confidence<=2");
    expect(passesFilters(shaky, q)).toBe(true);
    expect(passesFilters(solid, q)).toBe(false);
  });

  it("counts open tasks on a lesson for has:task", () => {
    const e = buildIndexed(
      file("03 - Journals/Maths/Algebra/Quadratics.md"),
      { type: "lesson", date: "2026-03-04" },
      "<!--almanac:review\n- ( ) redo exercise 4\n- (x) reread notes\n-->",
      [],
      JOURNAL
    );
    expect(e?.openTasks).toBe(1);
    expect(e?.doneTasks).toBe(1);
    expect(passesFilters(e!, parseQuery("has:task"))).toBe(true);
  });
});

describe("journal-search wiring", () => {
  const src = (name: string): string =>
    readSrc(name);

  it("shares the scope rule with the review queue", () => {
    // A queue and a search over "the same" subject that disagreed about what
    // that meant would be a genuinely confusing pair.
    expect(src("journal.ts")).toContain("export function journalFolderScope");
    expect(src("review-queue.ts")).toContain("journalFolderScope(plugin, arg, hostFolder)");
    expect(src("journal-search.ts")).toContain("journalFolderScope");
  });

  it("uses the shared index rather than a second scanner", () => {
    const s = src("journal-search.ts");
    // Asserted on the module NAME, not the specifier. What matters is that
    // journal-search imports the shared index at all; whether that reads
    // "./diary-index" or "../diary/diary-index" is a fact about which folder
    // each currently sits in, and pinning it here would mean regrouping src/
    // could not happen without a search-and-replace through the assertions.
    expect(s).toMatch(/from "[^"]*\/diary-index"/);
    expect(s).toContain("readJournalIndex");
    expect(s).not.toContain("cachedRead");
    expect(s).not.toContain("filesUnder");
  });

  it("is registered as a composite kind and dispatched", () => {
    const w = src("widgets.ts");
    const composites = w.slice(
      w.indexOf("const INLINE_KINDS"),
      w.indexOf("]", w.indexOf("const INLINE_KINDS"))
    );
    expect(composites).not.toContain('"journal-search"');
    expect(w).toContain('case "journal-search":');
    expect(w).toMatch(/buildJournalSearch\((?:this\.)?plugin, ctx, rest, hostFolder\)/);
  });

  it("is not live-wrapped", () => {
    // A LiveWidget rebuild would tear out the input mid-keystroke. diary-search
    // is unwrapped for the same reason.
    const w = src("widgets.ts");
    const block = w.slice(
      w.indexOf('case "journal-search":'),
      w.indexOf('case "tag-index":')
    );
    expect(block).not.toContain("liveScopedWidget");
  });

  it("keys the cache by surface, not by path alone", () => {
    // One file can in principle be read by both indexers — the paths are
    // user-configurable — and the two produce different records for it.
    const d = src("diary-index.ts");
    expect(d).toContain("function cacheKey(surface: IndexSurface, path: string)");
    expect(d).toContain("cacheKey(spec.surface, file.path)");
  });

  it("keeps exactly one emptyCallout in the codebase", () => {
    // Two byte-identical private copies existed until journal-search wanted a
    // third.
    //
    // SCANS EVERY FILE since 2.55.3, rather than the three that happened to have
    // one when this was written. The definition moved to empty.ts that release
    // and this test went green while counting zero — it was watching the right
    // thing through a hardcoded list, which is the failure mode of a test that
    // names its inputs instead of deriving them.
    const defs = allSrcNames().filter((f) =>
      readSrc(f).includes("function emptyCallout(")
    );
    expect(defs).toEqual(["empty"]);
  });
});
