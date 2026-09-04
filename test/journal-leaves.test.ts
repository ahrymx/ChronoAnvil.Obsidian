// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// ── the leaf and the pages under it (5.20) ────────────────────────────────
//
// The last surface of the journals subsystem to be read on a real vault, and
// the five defects below were all found in one render of one lesson. What they
// have in common is worth naming, because it is what the suite could not see:
// EVERY ONE OF THEM PRODUCED A LEGAL-LOOKING RESULT. A shorter eyebrow, a level
// noun that is a real level, an ordinal that is a real number, a promotion that
// the reader who pressed OK wanted anyway. Nothing threw, nothing rendered
// empty, and no assertion in 5,300 had a reason to look.
//
// So the tests here are written against the FACT rather than against the shape
// that carried it: what the strip may say, what the eyebrow must cover, what an
// ordinal must not collide with, and what order two irreversible steps happen
// in.

import { describe, expect, it } from "vitest";

import { STUDY_JOURNAL, journalNounOf } from "../src/journals/journal";
import { sectionContext } from "../src/journals/journal-sections";
import { nextPageOrder, pageOrderOf } from "../src/journals/page-default";
import { readCode, readSrc } from "./sources";

const lesson = STUDY_JOURNAL.kinds.find((k) => k.id === "lesson")!;
const practice = STUDY_JOURNAL.kinds.find((k) => k.id === "practice")!;

describe("what a note's context says about its level", () => {
  // The field's own comment: "Container depth for an index note; null on a
  // leaf." Pinned here because `buildJournalContext` read it as a number.
  it("gives an index a depth and a level", () => {
    const ctx = sectionContext(STUDY_JOURNAL, { depth: 0 });
    expect(ctx.depth).toBe(0);
    expect(ctx.level?.noun).toBe("Subject");
  });

  it("gives a leaf neither, because a leaf is not at a level", () => {
    const ctx = sectionContext(STUDY_JOURNAL, { kind: lesson });
    expect(ctx.depth).toBeNull();
    expect(ctx.level).toBeNull();
    expect(ctx.kind?.label).toBe("Lesson");
  });

  it("gives a page neither either, and names the note it is part of", () => {
    const ctx = sectionContext(STUDY_JOURNAL, { page: lesson });
    expect(ctx.depth).toBeNull();
    expect(ctx.level).toBeNull();
    expect(ctx.noteKind).toBe("page");
  });
});

describe("the context strip under a leaf's tracker card", () => {
  const strip = () => readCode("study-header");

  it("reads the level that was resolved rather than indexing by depth", () => {
    // THE DEFECT, EXACTLY. `sctx.type.levels[sctx.depth ?? 0]` on a leaf is
    // `levels[0]`, so the strip under every Lesson in the vault read SUBJECT —
    // the name of a different note four folders up, printed as a fact about
    // this one.
    expect(strip()).toContain("sctx.level?.noun ?? null");
    expect(strip()).not.toContain("sctx.type.levels[sctx.depth");
  });

  it("no longer needs a branch for pages, because the null covers all three", () => {
    // `sctx.noteKind === "page" ? null : …` was true and covered one of the two
    // cases that have no level. Reading `level` covers both by construction,
    // and a branch that restates half of a value's own contract is where the
    // other half goes missing.
    expect(strip()).not.toContain('sctx.noteKind === "page" ? null');
  });

  it("still withholds whatever the head above it already says", () => {
    // Unchanged, and the reason the defect hid: the head reads STUDY · LESSON,
    // so `pageHeadSays` suppressed the KIND — the one fact that was right — and
    // printed the fabricated level on its own.
    const t = strip();
    expect(t).toContain("pageHeadSays(plugin, file, levelNoun)");
    expect(t).toContain("pageHeadSays(plugin, file, kindLabel)");
    expect(t).toContain("if (!levelNoun && !kindLabel) return null;");
  });
});

describe("what a journal calls a note carrying a given type", () => {
  it("names a kind, a level and a page", () => {
    expect(journalNounOf(STUDY_JOURNAL, "lesson")).toBe("Lesson");
    expect(journalNounOf(STUDY_JOURNAL, "practice")).toBe("Practice");
    expect(journalNounOf(STUDY_JOURNAL, "subject")).toBe("Subject");
    expect(journalNounOf(STUDY_JOURNAL, "topic")).toBe("Topic");
    // THE ONE THAT WAS MISSING. A page's `type:` is `kind.pages.id`, which is
    // neither a kind id nor a level id — so the head that looked at only those
    // two named the journal alone on every page in the vault.
    expect(journalNounOf(STUDY_JOURNAL, "page")).toBe("Page");
  });

  it("answers for every value the journal recognises, with nothing left over", () => {
    // The bijection that makes the previous test more than five examples: if a
    // journal grows a fourth list of `type:` values, this fails rather than the
    // eyebrow going quiet on it.
    for (const value of ["lesson", "practice", "subject", "topic", "page"]) {
      expect(journalNounOf(STUDY_JOURNAL, value), value).not.toBeNull();
    }
    expect(practice.pages).toBeUndefined();
  });

  it("normalises the property the way every other reader does", () => {
    expect(journalNounOf(STUDY_JOURNAL, " Lesson ")).toBe("Lesson");
    expect(journalNounOf(STUDY_JOURNAL, "PAGE")).toBe("Page");
  });

  it("returns null rather than a guess for a value it does not know", () => {
    // The caller's fallback is "name the journal", which is a real answer for a
    // note with no `type:` at all. It must not be reached by a wrong match.
    expect(journalNounOf(STUDY_JOURNAL, "")).toBeNull();
    expect(journalNounOf(STUDY_JOURNAL, "chapter")).toBeNull();
  });
});

describe("where a new page sits in its note", () => {
  it("reads an ordinal, and calls a missing one missing", () => {
    expect(pageOrderOf({ order: 3 })).toBe(3);
    expect(pageOrderOf({ order: "3" })).toBe(3);
    expect(pageOrderOf({})).toBeNull();
    expect(pageOrderOf({ order: "later" })).toBeNull();
  });

  it("starts at one, so the first page agrees with the 1 beside it", () => {
    expect(nextPageOrder([])).toBe(1);
  });

  it("takes the next ordinal after the highest, not the count plus one", () => {
    // THE DEFECT. `newPage` counted the files beside the note: pages 1, 2, 3,
    // delete the second, two files remain, and the next page was made `3` — the
    // ordinal page three already had. The table then broke the tie on basename,
    // so two pages swapped places by name and every page made afterwards
    // inherited the collision.
    expect(nextPageOrder([1, 3])).toBe(4);
    expect(nextPageOrder([1, 2, 3])).toBe(4);
  });

  it("counts an unnumbered page as no opinion rather than as a zero", () => {
    // A page written by hand with no `order` sorts last in the table; it must
    // not also drag the next ordinal down on top of an existing one.
    expect(nextPageOrder([null, null])).toBe(1);
    expect(nextPageOrder([1, null, 5])).toBe(6);
  });

  it("is the same reader the pages table sorts on", () => {
    // Two opinions about what a missing ordinal means is how the index and the
    // allocator come to disagree about the order they are both describing.
    expect(readCode("tables")).toContain("pageOrderOf(frontmatterOf(app, f))");
    expect(readCode("journal.ts")).toContain("nextPageOrder(");
  });
});

describe("creating a page asks before it moves anything", () => {
  const src = () => readCode("journal.ts");
  const body = (): string => {
    const at = src().indexOf("async newPage(");
    expect(at).toBeGreaterThan(0);
    return src().slice(at, src().indexOf("async convertToDashboard("));
  };

  it("opens the dialogue before promoting the note", () => {
    // THE DEFECT, AND IT IS THE EXPENSIVE ONE. `promoteToDashboard` creates a
    // folder, renames the note into it through `fileManager` — rewriting every
    // wikilink in the vault that pointed at it — and splices a Pages section
    // into the body. It ran BEFORE the window opened, so Cancel returned having
    // done all three, with nothing said and nothing the plugin could undo.
    const t = body();
    const ask = t.indexOf("promptNewNote(");
    const move = t.indexOf("promoteToDashboard(");
    expect(ask).toBeGreaterThan(-1);
    expect(move).toBeGreaterThan(-1);
    expect(ask).toBeLessThan(move);
  });

  it("returns on a cancelled or empty title before that point", () => {
    const t = body();
    expect(t.indexOf("if (!details?.title.trim()) return;")).toBeLessThan(
      t.indexOf("promoteToDashboard(")
    );
  });

  it("names the window after the file, since promotion never changes a basename", () => {
    // The whole of what the dialogue used the promoted note for. Stated so that
    // nobody restores the old order to "have the host handy".
    expect(body()).toContain("heading: `${pages.label} in ${file.basename}`");
  });

  it("still promotes before it works out where the page goes", () => {
    // The other half: the new note's folder IS the promotion's result, so the
    // path, the duplicate check and the ordinal all have to come after it.
    const t = body();
    const move = t.indexOf("promoteToDashboard(");
    expect(t.indexOf("`${host.parent.path}/${safeTitle}.md`")).toBeGreaterThan(move);
    expect(t.indexOf("nextPageOrder(")).toBeGreaterThan(move);
  });
});

describe("a note's type is read, never compared raw", () => {
  it("resolves the kind that can hold pages through the normaliser", () => {
    // `type: Lesson` matched no kind, so both callers fell through to their
    // text-reading fallback — which lowercases, and so quietly did this
    // function's job as well as its own, at the cost of a file read.
    const t = readCode("journal.ts");
    const at = t.indexOf("private pageKindOf(");
    expect(at).toBeGreaterThan(0);
    const fn = t.slice(at, at + 400);
    expect(fn).toContain('normaliseTypeValue(fm["type"])');
    expect(fn).not.toContain('fm["type"] === "string" ? fm["type"] : ""');
  });

  it("resolves the pages of a note the same way in the pages table", () => {
    // 5.2 made this exact repair in `isContainerFolder` and named the reason:
    // a raw property compared against a lowercase id misses every match.
    const t = readCode("tables");
    const at = t.indexOf("export function buildPagesTable(");
    expect(at).toBeGreaterThan(0);
    const fn = t.slice(at, at + 1600);
    expect(fn).toContain("noteTypeOf(app, file)");
    expect(fn).toContain("noteTypeOf(app, f)");
    expect(fn).not.toContain('fm["type"]');
  });
});

describe("the leaf keeps the surfaces this pass did not touch", () => {
  it("still offers Pages on a kind that can hold them, and only there", () => {
    const src = readSrc("journal-sections");
    expect(src).toContain('id: "pages"');
    expect(src).toContain("applies: (ctx) => ctx.hasPages");
    expect(sectionContext(STUDY_JOURNAL, { kind: lesson }).hasPages).toBe(true);
    expect(sectionContext(STUDY_JOURNAL, { kind: practice }).hasPages).toBe(false);
    // A page holds no pages, which is what stops a page offering to contain
    // itself — see `surfaceOf`'s `{ page }` branch.
    expect(sectionContext(STUDY_JOURNAL, { page: lesson }).hasPages).toBe(false);
  });
});
