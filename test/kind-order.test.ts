// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Which order one note lists its note types in — 1.0.72.
//
// *"implement up/down buttons to re-order note types within the edit window"*.
//
// THE DIRECTIVE ORDER IS THE RENDER ORDER, so the answer is a write to the
// note's own fence. Every assertion below therefore composes a REAL index note
// from a real journal, permutes it, and reads the `kind-table:` lines back out
// of the text — not out of the module that wrote them. A planner asked what it
// just wrote cannot tell a correct permutation from a consistent mistake, which
// is `vacuous-sweep-rule`'s second shape.

import { describe, expect, it } from "vitest";

import { buildJournalType } from "../src/journals/journal";
import {
  composeTemplate,
  freshCustomJournal,
} from "../src/journals/custom-journal";
import {
  sectionContext,
  type SectionContext,
} from "../src/journals/journal-sections";
import { planKindOrder } from "../src/journals/kind-order";
import { readCode, readSrc } from "./sources";

const JOURNAL = buildJournalType({
  ...freshCustomJournal(new Set()),
  id: "study",
  name: "Study",
  root: "Study",
  levels: [{ id: "topic", noun: "Topic", fallbackEmoji: "📁" }],
  kinds: [
    { id: "lesson", emoji: "📖", label: "Lesson" },
    { id: "practice", emoji: "✍️", label: "Practice" },
    { id: "cheatsheet", emoji: "📋", label: "Cheatsheet" },
  ],
});

const SOLO = buildJournalType({
  ...freshCustomJournal(new Set()),
  id: "media",
  name: "Media",
  root: "Media",
  levels: [{ id: "shelf", noun: "Shelf", fallbackEmoji: "📁" }],
  kinds: [{ id: "film", emoji: "🎬", label: "Film" }],
});

const ctxOf = (type: typeof JOURNAL): SectionContext => ({
  ...sectionContext(type, { depth: 0 }),
  hostFolder: `${type.root}/Something`,
});

const CTX = ctxOf(JOURNAL);

// A composed index note of that journal — the real thing, fence and all.
const noteOf = (type: typeof JOURNAL): string =>
  composeTemplate(ctxOf(type), ["banner", "children"], undefined);

// THE ORACLE, AND IT IS A REGEX OVER THE TEXT. What a reader sees is the order
// the directives are met in, so that is what is read back.
const drawn = (text: string): string[] =>
  text
    .split("\n")
    .flatMap((l) => {
      const m = l.trim().match(/^kind-table:(\S+)$/);
      return m ? [m[1]] : [];
    });

describe("what a composed index note lists", () => {
  it("is every note type of its journal, in the journal's order", () => {
    // The premise every assertion below rests on. Asserted rather than assumed:
    // if the composer ever stopped listing them, a reorder test would pass over
    // an empty fence for the rest of time.
    expect(drawn(noteOf(JOURNAL))).toEqual(["lesson", "practice", "cheatsheet"]);
  });

  it("gives each one a head and a create button of its own", () => {
    // WHICH IS WHAT MAKES A GROUP THREE LINES RATHER THAN ONE, and therefore
    // what the permutation has to carry. A reorder that moved the `kind-table:`
    // line alone would leave 📖 Lessons titling Practice's table.
    const text = noteOf(JOURNAL);
    expect(text).toContain("header:2:📖 Lessons");
    expect(text).toContain("button:study:new-lesson");
  });
});

describe("re-ordering them", () => {
  it("puts the groups in the order the list asks for", () => {
    const text = noteOf(JOURNAL);
    const next = planKindOrder(text, CTX, [
      "cheatsheet",
      "lesson",
      "practice",
    ]);
    expect(next).not.toBeNull();
    expect(drawn(next as string)).toEqual(["cheatsheet", "lesson", "practice"]);
  });

  it("carries each group's head and button with it", () => {
    // The whole reason the span is walked rather than the probe moved. A head
    // left behind is a table drawn under another type's name — wrong in a way a
    // reader reads as a plugin bug rather than as their own move.
    const next = planKindOrder(noteOf(JOURNAL), CTX, [
      "practice",
      "lesson",
      "cheatsheet",
    ]) as string;
    const lines = next.split("\n").map((l) => l.trim());
    const at = (needle: string): number => lines.indexOf(needle);
    expect(at("header:2:✍️ Practices")).toBeLessThan(at("kind-table:practice"));
    expect(at("button:study:new-practice")).toBeLessThan(at("kind-table:practice"));
    expect(at("kind-table:practice")).toBeLessThan(at("header:2:📖 Lessons"));
  });

  it("moves nothing else in the note", () => {
    // Line count and line multiset both: the write is a permutation of the
    // groups' own lines, so every other line is where it was. Recomposing the
    // fence would be simpler code and would discard whatever the reader had
    // written inside it.
    const text = noteOf(JOURNAL);
    const next = planKindOrder(text, CTX, [
      "cheatsheet",
      "practice",
      "lesson",
    ]) as string;
    expect(next.split("\n")).toHaveLength(text.split("\n").length);
    expect(next.split("\n").sort()).toEqual(text.split("\n").sort());
    // And the bar over the groups is still the first line of the fence.
    const barWas = text.split("\n").findIndex((l) => l.includes("header:🗂️"));
    expect(next.split("\n")[barWas]).toBe(text.split("\n")[barWas]);
  });

  it("is undone by asking for the order it started in", () => {
    const text = noteOf(JOURNAL);
    const moved = planKindOrder(text, CTX, [
      "practice",
      "cheatsheet",
      "lesson",
    ]) as string;
    expect(planKindOrder(moved, CTX, ["lesson", "practice", "cheatsheet"])).toBe(
      text
    );
  });

  it("keeps a reader's own lines between two groups where they were", () => {
    // A fence a reader has edited. The groups move around what they wrote; it
    // does not travel with the group above it, because it was never part of one.
    const text = noteOf(JOURNAL).replace(
      "kind-table:practice",
      "kind-table:practice\nprose"
    );
    const lines = text.split("\n").map((l) => l.trim());
    const was = lines.indexOf("prose");
    const next = planKindOrder(text, CTX, [
      "cheatsheet",
      "practice",
      "lesson",
    ]) as string;
    expect(next.split("\n").map((l) => l.trim())[was]).toBe("prose");
  });
});

describe("what it refuses, and silence is the refusal", () => {
  // NULL MEANS DO NOT WRITE, and `writeOrder` has no second guard: every
  // refusal has to come back as null rather than as a text that happens to be
  // identical, because the caller hands the result straight to `vault.process`.
  it("declines an order the note already has", () => {
    expect(
      planKindOrder(noteOf(JOURNAL), CTX, ["lesson", "practice", "cheatsheet"])
    ).toBeNull();
  });

  it("declines a note with no groups in it at all", () => {
    expect(planKindOrder("# Just a note\n", CTX, ["lesson"])).toBeNull();
  });

  it("declines a list that names none of them", () => {
    expect(planKindOrder(noteOf(JOURNAL), CTX, ["nothing", "here"])).toBeNull();
  });

  it("still re-orders the rest when the list names one the note has lost", () => {
    // THE WINDOW CAN SIT OPEN WHILE THE NOTE CHANGES UNDER IT — the `⋯`'s own
    // rule, which is why the file is resolved at the write. A reader who
    // removed a group in another pane should still get the move they asked for
    // on the groups that are left, rather than a Save that silently does
    // nothing because one name in the list no longer matches anything.
    const text = noteOf(JOURNAL);
    const next = planKindOrder(text, CTX, [
      "cheatsheet",
      "gone",
      "lesson",
      "practice",
    ]) as string;
    expect(next).not.toBeNull();
    expect(drawn(next)).toEqual(["cheatsheet", "lesson", "practice"]);
  });

  it("declines a card that lists one type, where there is no order", () => {
    const solo = ctxOf(SOLO);
    expect(drawn(noteOf(SOLO))).toEqual(["film"]);
    expect(planKindOrder(noteOf(SOLO), solo, ["film"])).toBeNull();
  });

  it("declines when the groups are spread over two fences", () => {
    // THE ONE FAILURE THE OTHER ARROW CANNOT UNDO. A note carrying a second
    // *What's below* block — a reader's own, or a half-reconciled template —
    // would otherwise have a table moved out of the card it was in.
    //
    // THE IDS ARE DISTINCT ON PURPOSE. Splitting the fence so that both halves
    // name `lesson` would be refused by the slot arithmetic instead, and this
    // assertion would pass without the fence check ever running — the shape
    // `vacuous-sweep-rule` calls a test that passes for the wrong reason, and
    // this one did until a mutant said so.
    const text = noteOf(JOURNAL).replace(
      "header:2:📋 Cheatsheets",
      "```\n\n```chronoanvil\nheader:2:📋 Cheatsheets"
    );
    expect(drawn(text)).toEqual(["lesson", "practice", "cheatsheet"]);
    expect(planKindOrder(text, CTX, ["practice", "lesson", "cheatsheet"])).toBeNull();
    // And the same three in one fence are re-ordered, so it is the SPLIT that
    // was refused and not the list.
    expect(
      planKindOrder(noteOf(JOURNAL), CTX, ["practice", "lesson", "cheatsheet"])
    ).not.toBeNull();
  });

  it("declines a fence whose groups are not inside one", () => {
    // Bare directives outside a fence are not a card, so there is nothing to
    // re-order — and a permutation there would be editing prose.
    const text = "header:🗂️ What's below\nkind-table:lesson\nkind-table:practice\n";
    expect(planKindOrder(text, CTX, ["practice", "lesson"])).toBeNull();
  });
});

describe("a group the window does not list", () => {
  it("stays exactly where it is", () => {
    // `strayParts`' subject: a kind the journal has lost still has its group on
    // every index note written while it existed, and the window draws no row
    // for it because there is no type left to carry the answers. Its slot is
    // skipped rather than filled, so 1.0.23's `prune` still finds it there.
    const text = noteOf(JOURNAL).replace(
      "kind-table:practice",
      "kind-table:practice\nheader:2:📝 Cheats\nbutton:study:new-cheats\nkind-table:cheats"
    );
    expect(drawn(text)).toEqual([
      "lesson",
      "practice",
      "cheats",
      "cheatsheet",
    ]);
    const next = planKindOrder(text, CTX, [
      "cheatsheet",
      "lesson",
      "practice",
    ]) as string;
    expect(next).not.toBeNull();
    // The three the window listed filled the three slots it was allowed to;
    // the stray kept the slot it was in.
    expect(drawn(next)).toEqual([
      "cheatsheet",
      "lesson",
      "cheats",
      "practice",
    ]);
  });
});

describe("one walk over what a group is", () => {
  it("is `strayParts`' walk, filtered, rather than a second one", () => {
    // `regionSpans`' lesson, written down one surface over: two walks over one
    // marker are two ideas of what the marker delimits, and they agree until
    // somebody changes the shape of a part.
    const code = readCode("journals/journal-plan");
    expect(code).toContain("export function partGroups(");
    expect(code).toContain("return partGroups(lines, section, ctx)");
    expect(code).toContain("filter((g) => !known.has(g.probe))");
  });

  it("derives the shape from the catalogue, not from a literal here", () => {
    // So a composer that stops writing a create button per group — or starts
    // writing a fourth line — is followed rather than silently half-handled.
    expect(readSrc("journals/kind-order")).not.toContain('"header:2:');
    expect(readSrc("journals/kind-order")).not.toContain('"kind-table');
    expect(readCode("journals/kind-order")).toContain(
      "partGroups(text.split"
    );
  });
});
