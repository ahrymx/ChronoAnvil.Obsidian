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
import {
  nextPageOrder,
  pageOrderOf,
  reorderedPages,
} from "../src/journals/page-default";
import { readCode, readSrc, srcFiles } from "./sources";

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
    // AND `practice` ANSWERS `page` TOO. Its pages carry the same `type:` as a
    // Lesson's, because the page kind is one record shared by every kind of the
    // journal — see `buildJournalType`, which builds one page record and gives
    // every kind a copy of it.
    expect(practice.pages.id).toBe("page");
    expect(practice.pages).toEqual(lesson.pages);
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

// ── ONE DOOR ONTO PROMOTION, AND PAGES DO NOT NEST (1.0.23) ──────────────

describe("what can be turned into a dashboard, and by what", () => {
  // THE READER'S INSTRUCTION, IN THEIR WORDS: take it out completely, *"even
  // for nested pages (pages below kind dashboard)"*. So this is two claims —
  // there is one caller of `promoteToDashboard`, and a page is not something it
  // can be asked about.

  it("has exactly one caller, which is `newPage`", () => {
    // `convertToDashboard` was the second, and a second door onto an operation
    // with no inverse is what 1.0.23 closed. Counted rather than named, because
    // a third would arrive by being written, not by being renamed.
    const calls = srcFiles().flatMap(({ path, code }) =>
      code
        .split("\n")
        .filter((l) => !l.trim().startsWith("//"))
        .filter((l) => /\bpromoteToDashboard\(/.test(l))
        .map((l) => `${path}: ${l.trim()}`)
    );
    expect(calls).toHaveLength(2);
    // Its declaration, and the one call — both in journal.ts, and the call is
    // inside `newPage`.
    expect(calls.every((c) => c.startsWith("src/journals/journal.ts"))).toBe(
      true
    );
    expect(calls.filter((c) => c.includes("await this.promoteToDashboard("))).toHaveLength(1);
  });

  it("offers no command and no menu row of its own", () => {
    const everywhere = srcFiles()
      .map(({ code }) =>
        code
          .split("\n")
          .filter((l) => !l.trim().startsWith("//"))
          .join("\n")
      )
      .join("\n");
    expect(everywhere).not.toContain("convertToDashboard(");
    expect(everywhere).not.toContain("convertHere(");
    expect(everywhere).not.toContain("note-convert-to-dashboard");
  });

  it("accepts a page, which is what lets pages nest", () => {
    // WAS "refuses a page, which is what keeps pages from nesting" (1.0.38).
    // `pageKindOf` resolves a KIND from `type:`, a page's `type:` is
    // deliberately not a kind id, and `newPage` read that null as "this note
    // holds no pages" — so the refusal a reader met was a fact about a lookup
    // rather than about the note in front of them.
    //
    // `pagesHostOf` asks the question the callers actually have: what are this
    // note's pages built from. A leaf answers with its own kind; a page answers
    // with the journal's shared page config and the leaf it ultimately belongs
    // to, found by walking the folders up.
    const t = readCode("journal.ts");
    expect(t).toContain("private pagesHostOf(");
    expect(t).toContain("type.kinds.some((k) => k.pages.id === value)");
    // The sentence the reader used to get, gone with the rule that produced it.
    expect(t).not.toContain("A page holds no pages of its own.");
    expect(t).not.toContain("open \"${owner}\" to add another.");
    // What is left refuses a note this journal does not own, which is the only
    // thing this block was ever right about.
    expect(t).toContain("This isn't one of ${type.name}'s notes.");
  });
});

describe("creating a page asks before it moves anything", () => {
  const src = () => readCode("journal.ts");
  const body = (): string => {
    const at = src().indexOf("async newPage(");
    expect(at).toBeGreaterThan(0);
    // TO THE NEXT DECLARATION, which was `async convertToDashboard(` until
    // 1.0.23 deleted it. A boundary that no longer matches returns -1 and slices
    // the whole rest of the file, which is a test that stops testing an ordering.
    const end = src().indexOf("private async pickContainerFolder(");
    expect(end).toBeGreaterThan(at);
    return src().slice(at, end);
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
    expect(
      t.indexOf("`${folderNote.parent.path}/${safeTitle}.md`")
    ).toBeGreaterThan(move);
    expect(t.indexOf("nextPageOrder(")).toBeGreaterThan(move);
  });
});

describe("a note's type is read, never compared raw", () => {
  it("resolves the kind that can hold pages through the normaliser", () => {
    // `type: Lesson` matched no kind, so both callers fell through to their
    // text-reading fallback — which lowercases, and so quietly did this
    // function's job as well as its own, at the cost of a file read.
    const t = readCode("journal.ts");
    // A FREE FUNCTION SINCE 1.0.38, not a private method: `buildPagesTable` came
    // to need the same answer and has no manager to ask it on.
    const at = t.indexOf("export function pageKindOf(");
    expect(at).toBeGreaterThan(0);
    const fn = t.slice(at, at + 400);
    expect(fn).toContain('normaliseTypeValue(fm["type"])');
    expect(fn).not.toContain('fm["type"] === "string" ? fm["type"] : ""');
  });

  it("resolves the pages of a note the same way in the pages table", () => {
    // 5.2 made this exact repair in `isContainerFolder` and named the reason:
    // a raw property compared against a lowercase id misses every match.
    //
    // THE HOST'S HALF MOVED TO `pagesHostOf` IN 1.0.38, which normalises through
    // the same reader one call deeper — and had to, because the host may now be
    // a page, whose `type:` is not a kind at all. Each candidate page's half is
    // where it was, in the walk that lists them.
    const t = readCode("tables");
    const at = t.indexOf("export function buildPagesTable(");
    expect(at).toBeGreaterThan(0);
    const fn = t.slice(at, at + 1600);
    expect(fn).toContain("pagesHostOf(app, type, file, frontmatterOf(app, file))");
    expect(fn).not.toContain('fm["type"]');
    const walk = t.indexOf("function pagesBeside(");
    expect(walk).toBeGreaterThan(0);
    expect(t.slice(walk, walk + 900)).toContain("noteTypeOf(app, f)");
    expect(readCode("journal.ts")).toContain(
      'const t = normaliseTypeValue(fm["type"]);'
    );
  });
});

describe("the leaf keeps the surfaces this pass did not touch", () => {
  it("still offers Pages on a leaf, which is now every kind", () => {
    const src = readSrc("journal-sections");
    expect(src).toContain('id: "pages"');
    // THE GATE IS UNCHANGED AND ITS ANSWER IS NOT. `ctx.hasPages` used to read
    // the kind's config; it reads the SURFACE now — a leaf, not an index and
    // not a page — so Practice answers yes where it used to answer no, and the
    // *"only a Lesson can hold pages"* refusal has nothing left to say.
    expect(src).toContain("applies: (ctx) => ctx.hasPages");
    expect(sectionContext(STUDY_JOURNAL, { kind: lesson }).hasPages).toBe(true);
    expect(sectionContext(STUDY_JOURNAL, { kind: practice }).hasPages).toBe(true);
    // AND A PAGE ANSWERS YES TOO, AS OF 1.0.38. It read false, and that is what
    // made "pages do not nest" a fact about the catalogue as well as about
    // `newPage`. An INDEX is the surface that answers no now, and its reason is
    // the structural one this field has always been about: an index holds notes.
    expect(sectionContext(STUDY_JOURNAL, { page: lesson }).hasPages).toBe(true);
    expect(sectionContext(STUDY_JOURNAL, { depth: 0 }).hasPages).toBe(false);
  });
});

describe("moving a page up or down its note (1.0.38)", () => {
  // The list was read-only for four releases: `order` was stamped once at
  // creation and never written again, so a reader who wrote their pages out of
  // sequence reordered them by renaming files until the basename tie-break put
  // them right.

  const run = (...orders: (number | null)[]) =>
    orders.map((order, i) => ({ path: `N/p${i + 1}.md`, order }));
  const at = (moved: { path: string; order: number }[]) =>
    moved.sort((a, b) => a.order - b.order).map((m) => m.path);

  it("renumbers the whole run rather than swapping two ordinals", () => {
    // THE CHEAP MOVE IS A SWAP, AND IT WORKS ONLY ON A RUN THAT IS ALREADY 1..n.
    // `nextPageOrder` is max+1, so 1,3,4 is as ordinary as 1,2,3 — and the
    // swap's result there would be an order nobody can predict from the screen.
    const out = reorderedPages(run(1, 3, 4), "N/p3.md", -1);
    expect(out).toEqual([
      { path: "N/p1.md", order: 1 },
      { path: "N/p3.md", order: 2 },
      { path: "N/p2.md", order: 3 },
    ]);
  });

  it("moves a page down, and leaves max equal to the length", () => {
    // Which is what keeps `nextPageOrder` working: max+1 after a reorder is
    // n+1, so the next page made lands after every page there is.
    const out = reorderedPages(run(1, 2, 3), "N/p1.md", 1);
    expect(at(out)).toEqual(["N/p2.md", "N/p1.md", "N/p3.md"]);
    expect(nextPageOrder(out.map((o) => o.order))).toBe(4);
  });

  it("says nothing to do at either end, and for a path that is not here", () => {
    // AN EMPTY LIST IS A NO-OP, not a failure: the caller writes nothing and
    // says nothing, which is what a disabled arrow pressed anyway should do.
    expect(reorderedPages(run(1, 2, 3), "N/p1.md", -1)).toEqual([]);
    expect(reorderedPages(run(1, 2, 3), "N/p3.md", 1)).toEqual([]);
    expect(reorderedPages(run(1, 2, 3), "N/elsewhere.md", 1)).toEqual([]);
    expect(reorderedPages([], "N/p1.md", 1)).toEqual([]);
  });

  it("resolves a missing ordinal on the way past, rather than carrying it", () => {
    // A page written by hand has no `order` at all and sorts LAST, which is the
    // table's rule and `pageOrderOf`'s. There is nothing to swap it WITH, and
    // swapping a number with a null either loses a position or invents one —
    // renumbering answers it instead, and the reader's next press behaves.
    const out = reorderedPages(run(1, null, 2), "N/p2.md", -1);
    expect(at(out)).toEqual(["N/p1.md", "N/p2.md", "N/p3.md"]);
    expect(out.every((o) => Number.isFinite(o.order))).toBe(true);
  });

  it("sorts the run exactly as the table drew it", () => {
    // LOAD-BEARING. A reader pressing ↑ moves the row ABOVE the one they can
    // see; an order this disagreed with would move a page past a neighbour it
    // had never been drawn beside. Two unnumbered pages tie on ordinal and break
    // on basename, in both places.
    const pages = [
      { path: "N/Beta.md", order: null },
      { path: "N/Alpha.md", order: null },
      { path: "N/First.md", order: 1 },
    ];
    expect(at(reorderedPages(pages, "N/Alpha.md", 1))).toEqual([
      "N/First.md",
      "N/Beta.md",
      "N/Alpha.md",
    ]);
  });

  it("is pure, so the rule is checkable without a vault", () => {
    // `page-default.ts`'s header is the standing rule — *no `App`, no plugin, no
    // DOM* — and it is why the arithmetic is not in the widget that writes it.
    const fn = readCode("page-default");
    const at2 = fn.indexOf("export function reorderedPages(");
    expect(at2).toBeGreaterThan(0);
    const body = fn.slice(at2, fn.indexOf("\n}", at2));
    expect(body).not.toContain("app.");
    expect(body).not.toContain("processFrontMatter");
  });
});

describe("what a page's row in the list can do (1.0.38)", () => {
  const rows = () => readCode("tables");

  it("writes the run the pure helper hands back, and nothing else", () => {
    const src = rows();
    expect(src).toContain("const moves = reorderedPages(");
    expect(src).toContain('front["order"] = m.order;');
    // RESOLVED AT THE WRITE, NEVER CAPTURED AT THE RENDER — `kind-row-menu.ts`'s
    // rule, because a row drawn before somebody moved the file holds a path that
    // is no longer anybody's.
    expect(src).toContain("const file = getFile(plugin.app, m.path);");
  });

  it("lists a promoted page's own pages under it", () => {
    // The sentence that stood at the top of this widget — *"not recursively,
    // because a sub-folder under a lesson belongs to a different note"* — was
    // the flat model's justification and is false as of 1.0.38.
    const src = rows();
    expect(src).toContain("if (isPromotedPath(page.file.path)) {");
    expect(src).toContain("drawPageRows(table, pagesBeside(app, page.file, pageId), number, depth + 1);");
    expect(src).not.toContain("belongs to a different note.");
  });

  it("numbers by position rather than by ordinal", () => {
    // `1`, `1.1`, `1.2`, `2`. Two pages both numbered `1` at two indents is the
    // ambiguity the indent alone leaves.
    expect(rows()).toContain("const number = prefix ? `${prefix}.${i + 1}` : String(i + 1);");
  });

  it("draws the controls only where there is something to write with", () => {
    // A journal or an owning kind that cannot be resolved still LISTS — a reader
    // can read their pages on a damaged vault — and it is the controls that go
    // quiet, because every one of them writes.
    expect(rows()).toContain("if (table.type && table.host) {");
  });
});

describe("the ⋯ on a page's row (1.0.38)", () => {
  const menu = () => readCode("kind-row-menu");

  it("renames through the one rename, which knows about folder notes", () => {
    // A PROMOTED PAGE IS A FOLDER NOTE, so its folder moves first and the note
    // follows it — or the folder is left with no note of its own inside and
    // every link derived from the folder path breaks. Writing that here would
    // have been writing it a second time.
    expect(menu()).toContain("const failed = await renameNote(plugin.app, file, title);");
    expect(readSrc("header-title")).toContain("export async function renameNote(");
  });

  it("offers a new page inside, which only Phase 2 made possible", () => {
    expect(menu()).toContain("table.plugin.journals.newPage(table.type, path)");
  });

  it("shares the bin rows rather than spelling a second deletion", () => {
    const src = menu();
    const at = src.indexOf("export function attachPageRowMenu(");
    expect(at).toBeGreaterThan(0);
    expect(src.slice(at, at + 2000)).toContain("addDeleteRows(menu, table, path);");
  });

  it("identifies the row by path, never by the TFile", () => {
    // 4.50.2's rule, and it matters more here than on a kind's row: Rename is
    // the one item in this file that MOVES the note it acts on.
    const src = menu();
    const at = src.indexOf("export function attachPageRowMenu(");
    const fn = src.slice(at, at + 2000);
    expect(fn).toContain("const path = file.path;");
    expect(fn).toContain("const live = getFile(table.plugin.app, path);");
  });
});
