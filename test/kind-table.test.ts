// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import {
  COMPLETED_STATUS,
  containerDepth,
  hasLevelBelow,
  isCompletedStatus,
  kindTableProperties,
  sortKindRows,
  KindRow,
} from "../src/ui/tables";
import { STUDY_JOURNAL } from "../src/journals/journal";
import { buildJournalType, freshCustomJournal } from "../src/journals/custom-journal";
import {
  detectSections,
  findSection,
  renderSection,
  sectionContext,
  templateTargets,
} from "../src/journals/journal-sections";
import { composeTemplate } from "../src/journals/custom-journal";
import { studyTemplate } from "./study-template";
import { readCode, readSrc, cssRule, fnBody } from "./sources";
import { nowTimestamp, stampLabel } from "../src/core/util";

// ── kind-table ────────────────────────────────────────────────────────────
//
// The widget that replaced the ```base tables the `children` section used to
// emit at the deepest index. Its DOM needs a vault; its three decisions don't,
// and they are the ones worth pinning:
//
//   • which columns a kind's table carries (per-kind rating scoping, as it
//     reaches this surface);
//   • what counts as done (the status vocabulary's load-bearing consumer);
//   • what order rows come in.
//
// Each of those was assertable by reading a composed template until the tables
// went native. Moving them into code moved the claims with them, which is why
// all three are exported and pure — the same reason sortBreakdown is.

const COOKING = buildJournalType({
  ...freshCustomJournal(new Set()),
  id: "cooking",
  name: "Cooking",
  emoji: "🍳",
  root: "03 - Journals/Cooking",
  templatesFolder: "05 - Templates/Cooking",
  levels: [
    { id: "cuisine", noun: "Cuisine", fallbackEmoji: "🍳" },
    { id: "dish", noun: "Dish", fallbackEmoji: "🍲" },
  ],
  kinds: [
    { id: "recipe", emoji: "🍽️", label: "Recipe", rating: "difficulty" },
    { id: "attempt", emoji: "🔥", label: "Attempt" },
  ],
});

const kindOf = (id: string) => COOKING.kinds.find((k) => k.id === id)!;

describe("which columns a kind's table carries", () => {
  it("gives a rated kind its rating and nothing else's", () => {
    expect(kindTableProperties(kindOf("recipe"))).toEqual([
      "date",
      "difficulty",
      "status",
    ]);
  });

  it("gives an unrated kind no rating column at all", () => {
    // Absent rather than blank. A column for a property the notes never carry
    // is a column of em dashes claiming something is missing.
    expect(kindTableProperties(kindOf("attempt"))).toEqual(["date", "status"]);
  });

  it("keeps the two kinds of one type apart", () => {
    // The case per-kind scoping exists for, and the reason the section writes
    // one table per kind rather than one combined table: a single table would
    // need a column for every rating in the type and leave most of it blank.
    const recipe = kindTableProperties(kindOf("recipe"));
    const attempt = kindTableProperties(kindOf("attempt"));
    expect(recipe).toContain("difficulty");
    expect(attempt).not.toContain("difficulty");
  });

  it("reads the status property it is handed, not the literal", () => {
    // `status` is a registry built-in, so a vault that re-keyed it must not
    // leave this reading a dead property — the rule reviewProperties follows.
    expect(kindTableProperties(kindOf("recipe"), "state")).toEqual([
      "date",
      "difficulty",
      "state",
    ]);
  });

  it("puts the title column outside the property list", () => {
    // The first column links a note; it reads no frontmatter, and its heading
    // is the kind's own label ("Recipe", not "Title") — matching the
    // displayName the base table set. Nothing in this list should name it.
    expect(kindTableProperties(kindOf("recipe"))).not.toContain("file.name");
    expect(kindTableProperties(kindOf("recipe"))).not.toContain("title");
  });

  it("does NOT grow with the date columns (1.0.67)", () => {
    // THIS LIST IS WHAT A KIND'S NOTES CARRY, and two of the three date columns
    // are not properties: `modified` is the file's own mtime, and `statusdate`
    // is absent until a status changes. Growing this would promise the template
    // writes keys it does not — and the column that IS a property, `created`,
    // is already written by the template and still not in here, because this
    // list is the table's RATED/DATED/STATUS triple and nothing else.
    const all = kindTableProperties(kindOf("recipe"));
    expect(all).toEqual(["date", "difficulty", "status"]);
    for (const key of ["created", "modified", "statusdate"]) {
      expect(all).not.toContain(key);
    }
  });
});

// ── THE DATE CELLS (1.0.67) ─────────────────────────────────────────────
//
// The one loop that turns a column role into a cell. Bounded on `statusMs`,
// which is defined immediately after `kindTable` returns — an anchor inside the
// function would have been `return root;`, and that string appears five times in
// this file. A slice that silently comes back empty is a sweep that passes for
// `vacuous-sweep-rule`'s second reason, so the helper refuses one.
const cellLoop = (t: string): string => {
  const from = t.indexOf("for (const col of cols.slice(1)) {");
  const to = t.indexOf("function statusMs(");
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  return t.slice(from, to);
};

describe("how a date column resolves its cell", () => {
  it("reads each of the three off its own source", () => {
    const t = readSrc("tables");
    const loop = cellLoop(t);
    // `created` THROUGH `recencyMs`, which is the key-then-ctime ladder
    // `journal-recent` already ranks on — so a note made before the plugin
    // wrote a `created:` still reads.
    expect(loop).toContain(
      'stampLabel(recencyMs(note.fm, note.file)) ?? EMPTY_CELL, "is-stamp"'
    );
    // `modified` OFF THE FILE. There is no `modified:` key in any vault.
    expect(loop).toContain(
      'stampLabel(note.file.stat.mtime) ?? EMPTY_CELL, "is-stamp"'
    );
    expect(loop).toContain('stampLabel(statusMs(note)) ?? EMPTY_CELL, "is-stamp"');
    // AND MTIME IS NOT CTIME. The two are one character apart and name opposite
    // ends of a note's life.
    expect(loop).not.toContain("note.file.stat.ctime");
  });

  it("names every role, so a date column cannot draw a rating gauge", () => {
    // THE TRAP THIS ROUND WALKED INTO. The loop used to end in an `else` that
    // meant "the rating", which was true while the rating was the only column
    // left. Three date roles would each have fallen into it and drawn a
    // segmented gauge out of `Number(undefined)`.
    //
    // A role nobody has written a branch for now draws NOTHING, which is the
    // failure the next column added here should get: an empty cell is a missing
    // branch, a gauge is a wrong answer.
    const t = readSrc("tables");
    const loop = cellLoop(t);
    expect(loop).toContain('} else if (col.key === "rating") {');
    // The bare fallthrough is gone. Anchored on the brace, because `} else {`
    // appears in half the file.
    expect(loop).not.toMatch(/\}\s*else\s*\{/);
    for (const key of ["date", "status", "created", "modified", "statusdate", "rating"]) {
      expect(loop).toContain(`col.key === "${key}"`);
    }
  });

  it("falls back to the creation time for a status that never moved", () => {
    // NOT `—`. `templateFrontmatter` writes `status: in-progress` at creation,
    // so the instant the status was set IS the instant the note was made. An em
    // dash would say "unknown" about the one case where the answer is certain —
    // and it would be the answer for every note in a vault upgrading to this
    // release, which would make the column look broken rather than new.
    const body = fnBody("statusMs", "tables");
    expect(body).toContain("fm[STATUS_DATE_KEY]");
    // `recencyMs` BENEATH, NOT `created` DIRECTLY, so this ladder is three deep
    // and matches the Created column's exactly — two cells reading one note
    // cannot disagree about when it was made.
    expect(body).toContain("return recencyMs(note.fm, note.file);");
    expect(body).not.toContain("EMPTY_CELL");
  });

  it("writes a stamp to the minute, with no T and no seconds", () => {
    // `nowTimestamp` writes `2026-10-13T00:42:11` because that is a sortable
    // machine value and `created` has been that shape since the plugin had one.
    // It is not a cell: nineteen characters of which the last three are noise,
    // in a column sized to its own content, beside a `date` cell that is ten.
    // The STORED format does not move — nothing is migrated.
    // `Date.UTC` RATHER THAN `Date.parse`, because the stub's moment formats in
    // UTC throughout — see its header. The real one formats local, which is the
    // right answer for a reader and the wrong one to assert against here.
    expect(stampLabel(Date.UTC(2026, 9, 13, 0, 42, 11))).toBe("2026-10-13 00:42");
    expect(nowTimestamp()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    // NULL RATHER THAN THE EM DASH: the dash is a table's answer and this is a
    // date formatter. The caller applies `EMPTY_CELL`, which is the shape the
    // `date` cell beside these three already has.
    expect(stampLabel(null)).toBeNull();
    expect(stampLabel(Number.NaN)).toBeNull();
  });

  it("gives a stamp cell its own class, quieter than a status (1.0.67)", () => {
    // Sixteen characters, and a table may now carry three of them — more ink
    // than the title they sit beside. The `tabular-nums` and the `nowrap` come
    // off `.ca-list-cell`; the second matters more than it did, because `auto`
    // tracks sized to a wrapped date would move the column width per row.
    const rule = cssRule(".ca-list-cell.is-stamp");
    expect(rule).toContain("var(--text-muted)");
    expect(rule).toContain("var(--ca-text-xs)");
    expect(cssRule(".ca-list-cell")).toContain("white-space: nowrap");
  });
});

describe("what counts as done", () => {
  it("is the value the templates seed against", () => {
    expect(COMPLETED_STATUS).toBe("completed");
    expect(isCompletedStatus("completed")).toBe(true);
    expect(isCompletedStatus("in-progress")).toBe(false);
  });

  it("tolerates a status typed by hand", () => {
    // The dropdown writes the slug; a reader editing frontmatter directly
    // writes whatever they write, and a table that silently disagreed about
    // whether a note was finished would be worse than one that never sorted.
    expect(isCompletedStatus(" Completed ")).toBe(true);
    expect(isCompletedStatus("COMPLETED")).toBe(true);
  });

  it("treats an absent or empty status as not done", () => {
    // A note with no status is in progress by omission, which is what the
    // templates mean by seeding `in-progress` rather than requiring it.
    expect(isCompletedStatus(undefined)).toBe(false);
    expect(isCompletedStatus(null)).toBe(false);
    expect(isCompletedStatus("")).toBe(false);
  });

  it("does not match a status that merely contains the word", () => {
    expect(isCompletedStatus("not-completed")).toBe(false);
    expect(isCompletedStatus("completed-ish")).toBe(false);
  });
});

describe("what order rows come in", () => {
  const row = (basename: string, date: string | null, done = false): KindRow =>
    ({ basename, date, done });

  it("puts open work above finished work", () => {
    const out = sortKindRows([
      row("Done", "2026-05-01", true),
      row("Open", "2026-01-01"),
    ]);
    expect(out.map((r) => r.basename)).toEqual(["Open", "Done"]);
  });

  it("sorts newest first within each half", () => {
    const out = sortKindRows([
      row("Older", "2026-01-01"),
      row("Newer", "2026-05-01"),
    ]);
    expect(out.map((r) => r.basename)).toEqual(["Newer", "Older"]);
  });

  it("sorts a dateless note last rather than first", () => {
    // A note with no date has no position in the sequence, which is not the
    // same as being the oldest — the reading journal-search already settled
    // on for a dateless page.
    const out = sortKindRows([
      row("Undated", null),
      row("Old", "2020-01-01"),
      row("New", "2026-05-01"),
    ]);
    expect(out.map((r) => r.basename)).toEqual(["New", "Old", "Undated"]);
  });

  it("keeps done-ness ahead of date", () => {
    // A finished note from today still sits below an open one from years ago:
    // the table is about what is left to do, not about what happened last.
    const out = sortKindRows([
      row("FinishedToday", "2026-07-29", true),
      row("OpenAgesAgo", "2020-01-01"),
    ]);
    expect(out.map((r) => r.basename)).toEqual([
      "OpenAgesAgo",
      "FinishedToday",
    ]);
  });

  it("breaks a tie by name so equal rows have a stable order", () => {
    // Same reason sortBreakdown does: whatever the filesystem returned is not
    // an order, and a list that reshuffles between repaints is unreadable.
    const out = sortKindRows([
      row("Beta", "2026-05-01"),
      row("Alpha", "2026-05-01"),
    ]);
    expect(out.map((r) => r.basename)).toEqual(["Alpha", "Beta"]);
  });

  it("does not mutate its input", () => {
    const rows = [row("B", "2026-01-01"), row("A", "2026-05-01")];
    const before = rows.map((r) => r.basename);
    sortKindRows(rows);
    expect(rows.map((r) => r.basename)).toEqual(before);
  });
});

// ── the seam with the catalogue ───────────────────────────────────────────

describe("the section that writes it", () => {
  const deepest = sectionContext(COOKING, { depth: 1 });

  it("emits one kind-table per kind and no base block", () => {
    const rendered = renderSection(findSection("children")!, deepest);
    expect(rendered).toContain("kind-table:recipe");
    expect(rendered).toContain("kind-table:attempt");
    expect(rendered).not.toContain("```base");
  });

  it("keeps the whole section in a single fence", () => {
    // What kind-table exists for. A ```base block cannot live inside an
    // chronoanvil fence, so while the tables were Bases tables a two-kind index
    // shipped four sibling blocks with gaps no styling could close.
    const rendered = renderSection(findSection("children")!, deepest);
    expect(rendered.match(/```chronoanvil/g)?.length).toBe(1);
  });

  it("claims the directive it emits", () => {
    // The coverage guard in journal-sections.test.ts measures Study's
    // templates against `claims`. A directive a section emits but does not
    // claim is exactly the drift the catalogue exists to prevent.
    expect(findSection("children")!.claims).toContain("kind-table");
  });

  it("finds the section it wrote", () => {
    // locate() is what stops "add a section" appending a second copy. It
    // probed the base block's `type == "recipe"` filter line until 2.54 and
    // probes the directive now; a section the catalogue can write but not
    // find would be offered again on every note that already has it.
    const composed = composeTemplate(deepest);
    expect(detectSections(composed, deepest)).toContain("children");
  });

  it("still finds the section when a kind's table has been deleted by hand", () => {
    // One block, several kinds: a reader who removed one table still has the
    // section, and offering to append a second copy of the whole thing would
    // be worse than leaving it alone.
    const composed = composeTemplate(deepest).replace(
      "kind-table:recipe\n",
      ""
    );
    expect(detectSections(composed, deepest)).toContain("children");
  });

  it("does not find it in a template that has no note tables", () => {
    // The top level of a two-level type lists folders, not notes, so its
    // children section is a topics-table — the probe must not match on it by
    // way of the type's kind ids appearing elsewhere in the file.
    const top = sectionContext(COOKING, { depth: 0 });
    const composed = composeTemplate(top);
    expect(composed).not.toContain("kind-table:");
  });
});

describe("Study composes the same way", () => {
  it("writes both its kinds' tables into the Topic index", () => {
    const topic = studyTemplate("Topic Index.md");
    expect(topic).toContain("kind-table:lesson");
    expect(topic).toContain("kind-table:practice");
    expect(topic).not.toContain("```base");
  });

  it("gives each of them the rating that kind is scored on", () => {
    const byId = (id: string) =>
      kindTableProperties(STUDY_JOURNAL.kinds.find((k) => k.id === id)!);
    expect(byId("lesson")).toEqual(["date", "confidence", "status"]);
    expect(byId("practice")).toEqual(["date", "accuracy", "status"]);
  });
});

describe("no generated note carries a base block", () => {
  // A documented guarantee as of 2.54 — see the README's "What it still
  // needs", which now says Bases is required for the standalone `.base` files
  // and for nothing on a journal page.
  //
  // Asserted rather than trusted, on the same reasoning as the empty
  // STUDY_ONLY list in journal-sections.test.ts: a claim nothing checks is a
  // claim that quietly stops being true. Re-introducing one should have to
  // change this test, which makes it a decision instead of an accident.
  //
  // The `.base` FILES are untouched and out of scope here — `Diary.base` and
  // the per-type `<Type> Notes.base` are whole-vault dashboards, they are
  // YAML rather than markdown, and nothing about them was ever a fence.
  const types = [
    STUDY_JOURNAL,
    COOKING,
    buildJournalType(freshCustomJournal(new Set())),
  ];

  for (const type of types) {
    it(`composes every ${type.name} template without one`, () => {
      for (const target of templateTargets(type)) {
        expect(composeTemplate(target.ctx), target.file).not.toContain(
          "```base"
        );
      }
    });
  }
});

// ── level-index: which branch, and the scope it reads (4.16 §1) ───────

describe("what is below this note decides which table to draw", () => {
  const tables = (): string => readCode("tables");

  // One top-level function's text, from its signature to the `}` in column 0
  // that closes it.
  //
  // IT ASSERTS IT FOUND AN END, and that is the part worth copying. The read
  // this replaces sliced to `src.indexOf("\nfunction levelScope(")` — and when
  // 4.16.1 exported that function, the search returned -1, `slice(at, -1)`
  // quietly handed back the rest of the file, and every `toContain` in the test
  // went on passing against a body four times too big. A missing anchor has to
  // FAIL, not widen: that is the same lesson as the `slice(-1)` empty string in
  // the house rules, arriving from the other direction.
  const fnBody = (src: string, signature: string): string => {
    const at = src.indexOf(signature);
    expect(at, `${signature} is in the file`).toBeGreaterThan(0);
    const end = src.indexOf("\n}\n", at);
    expect(end, `${signature} has a closing brace`).toBeGreaterThan(at);
    return src.slice(at, end);
  };

  it("branches on the level, at render time — not on today's contents", () => {
    // THE WHOLE POINT OF THE WIDGET. The journal catalogue used to choose
    // between a folder rollup and per-kind note tables when the note was
    // WRITTEN, by reading `hasSubContainers` at compose time — so a note that
    // later grew its first sub-folder went on listing its own notes, and the
    // answer to "what is below this" was frozen into the file.
    //
    // A SOURCE ASSERTION, and it says so: the branch reads a vault, which this
    // suite has no stub for — the same limit `kind-table`'s own header states
    // about its DOM. What can be pinned is WHICH QUESTION it asks, and that it
    // is asked HERE. The question itself is pure and is pinned below.
    const body = fnBody(tables(), "export function buildLevelIndex(");
    expect(body).toContain("hasLevelBelow(type, folder.path)");
    // AND NOT FROM THE FOLDER LISTING. Counting sub-folders is the bug: it read
    // "no topics yet" as "this is the deepest level" and gave a fresh Subject
    // the Lesson/Practice tables belonging to a level it does not have.
    expect(body).not.toContain("journalChildFolders");
    // Both branches, and the folder one first.
    expect(body).toContain("folderRollup(plugin, ctx, type, folder)");
    expect(body).toContain("kindTable(plugin, ctx, type, folder.path, kind.id)");
  });

  // ── the question the branch asks ────────────────────────────────────
  //
  // Pure, exported, and tested for its answers rather than its text — which is
  // the whole reason it was worth extracting from the `if`.
  describe("what is below a folder is a fact about its level", () => {
    const STUDY_ROOT = STUDY_JOURNAL.root;

    it("counts the root as one above the first level", () => {
      // The root HOLDS Subjects, so its depth is the one whose children are
      // `levels[0]`. It used to answer 0 — the same as a Subject — which named
      // the root's own children "Topic".
      expect(containerDepth(STUDY_JOURNAL, STUDY_ROOT)).toBe(-1);
      expect(containerDepth(STUDY_JOURNAL, `${STUDY_ROOT}/Mathematics`)).toBe(0);
      expect(
        containerDepth(STUDY_JOURNAL, `${STUDY_ROOT}/Mathematics/Trigonometry`)
      ).toBe(1);
    });

    it("says a subject has topics below it even when it has none yet", () => {
      // THE REPORTED BUG. Mathematics on the day it is made: no Topic folders,
      // and every other surface still calls what goes in it a Topic.
      expect(hasLevelBelow(STUDY_JOURNAL, `${STUDY_ROOT}/Mathematics`)).toBe(
        true
      );
      expect(hasLevelBelow(STUDY_JOURNAL, STUDY_ROOT)).toBe(true);
    });

    it("says a topic does not, however many folders are sitting in it", () => {
      // A paged Lesson is a folder in a Topic and is not a container, so the
      // old reading flipped a Topic to a rollup the first time a lesson was
      // split. Depth cannot be talked into it.
      expect(
        hasLevelBelow(STUDY_JOURNAL, `${STUDY_ROOT}/Mathematics/Trigonometry`)
      ).toBe(false);
    });

    it("agrees with the context that composed the note", () => {
      // ONE RULE, TWO READERS. `sectionContext` decides from `depth` which
      // shape the section is WRITTEN as; this decides which shape it RENDERS
      // as. They disagreed, and the page is where that showed.
      const path = (depth: number): string =>
        [STUDY_ROOT, ...Array.from({ length: depth + 1 }, (_, i) => `L${i}`)]
          .join("/");
      for (const type of [STUDY_JOURNAL, COOKING]) {
        for (let depth = 0; depth < type.levels.length; depth++) {
          expect(
            hasLevelBelow(type, path(depth).replace(STUDY_ROOT, type.root)),
            `${type.name} depth ${depth}`
          ).toBe(sectionContext(type, { depth }).hasSubContainers);
        }
      }
    });
  });

  it("subscribes to the folder it reads, through the one resolver", () => {
    // ONE RESOLVER, NOT TWO THAT AGREE. This assertion used to require that the
    // widget's resolver and the region's narrower copy SPELLED the resolution
    // identically — `partsOf(...)` and the same join, on both sides. That is a
    // weaker claim than it looks, and 4.16.1 is what it cost: the moment the
    // rule grew a second accepted spelling for the folder, the copy stopped
    // matching, and what had been keeping it correct was a string comparison
    // rather than a shared call. A live widget subscribed to a different tree
    // than it reads is stale in the way that matters while still looking
    // subscribed.
    //
    // So what is pinned now is that there is nothing to keep in step: the
    // region takes the folder off `levelScope` and computes no path of its own.
    const region = fnBody(readCode("directive-regions"), "function levelIndexScope(");
    expect(region).toContain("levelScope(plugin, ctx, argument)");
    expect(region).toContain("scope.folder.path");
    // AND IT DOES NOT REBUILD THE PATH. Any of these reappearing here means a
    // second resolver has grown back.
    expect(region).not.toContain("partsOf(");
    expect(region).not.toContain("type.root");

    // A REFUSAL IS NOTHING TO SUBSCRIBE TO, which is what null already meant.
    expect(region).toMatch(/typeof scope === "string"\s*\?\s*null/);
  });

  it("resolves a folder given either as journal-relative or as a vault path", () => {
    // THE 4.16.1 BUG, AS A TEST. `kind: "folder"` means a path from the vault
    // root everywhere else in the registry — it is what `ArgSuggest` offers and
    // therefore what the editor writes the moment a reader picks from the
    // dropdown — while this resolver was written for the journal-relative
    // spelling the docs show. Picking `03 - Journals/Cooking/italian` out of the
    // dropdown got the journal's root prepended to a path that already had one:
    //
    //   No folder "03 - Journals/Cooking/03 - Journals/Cooking/italian" in Cooking.
    const src = fnBody(tables(), "export function levelScope(");
    // RELATIVE FIRST, AND THE ORDER IS HALF THE ASSERTION: it is the documented
    // spelling and the only one that can be ambiguous, so it wins its own
    // ambiguity rather than losing it to a folder that happens to share the
    // vault's shape. Pinned by matching the whole literal rather than by
    // comparing two indexOf calls — the first draft did that, and `, relative]`
    // matched the DESTRUCTURING on the function's first line, so it compared
    // the wrong pair of positions and failed for the wrong reason.
    expect(src).toContain("const tries = [`${root}/${relative}`, relative];");
    // AND EITHER SPELLING MUST LAND INSIDE THE JOURNAL. Every heading, kind and
    // rating below comes from `type`, so a path that leaves the journal would
    // draw one journal's nouns over another's folders.
    expect(src).toContain('!at.path.startsWith(`${root}/`)');
    expect(src).toMatch(/is not inside \$\{type\.name\}/);
  });
});
