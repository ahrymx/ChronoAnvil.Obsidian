// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// A stack of tables where an index note has one. The reversal of 1.0.16.
//
// *"I think the implementation got things backwards. the index pages above the
// deepest depth should gain a "Notes" column for the count, and the type field
// can be removed entirely and reverted to the collapsible sections"*
//
// THE READER'S OWN CARD IS THE ARGUMENT, TWICE. 1.0.16 consolidated the deepest
// index on the strength of a Projects project index drawing three heads, three
// create buttons, three chevrons and three empty states over one note. Rendered
// on their Study Topic index the consolidated card drew `Name | Type | Date |
// Confidence | Accuracy | Status` over two Lessons — "Lesson" twice down the
// Type column, Accuracy empty on both rows. The cost it was aimed at is real;
// it is real ONE LEVEL UP, where a column per note kind is paid for by every
// row, and that is where the consolidation went (`folderRollup`).
//
// ── WHAT IS IN THIS FILE AND WHAT IS NEXT DOOR ──────────────────────────
//
// `splitChildren` puts the merged notes back, and it is the only piece of this
// release that MOVES and DELETES lines a reader may have edited. So it is a
// migration with a diff beside it rather than a repair, and most of this file
// is about what it refuses to touch.
//
// IT IS ALSO DATED. 1.0.16 never shipped, so the only notes in the merged shape
// are in the development vaults; this file, the bare `kind-table` branch, the
// bare `new` button and `newNoteAsking` go together the release after those
// vaults are migrated — CLAUDE.md's rule for read-compatibility no reader can
// need. See `children-split.ts`.
//
// The composition itself is in `journal-sections.test.ts` and
// `journal-groups.test.ts`; the one door that offers this is in
// `repair-plan.test.ts`.

import { describe, expect, it } from "vitest";
import { splitChildren, splitDetail } from "../src/journals/children-split";
import { STUDY_JOURNAL } from "../src/journals/journal";
import {
  buildJournalType,
  composeTemplate,
  freshCustomJournal,
} from "../src/journals/custom-journal";
import {
  childrenParts,
  sectionContext,
} from "../src/journals/journal-sections";
import { journalSubActionSpec } from "../src/ui/widgets/button-widgets";
import { readCode, readSrc } from "./sources";
import { studyTemplate } from "./study-template";

const cooking = buildJournalType({
  ...freshCustomJournal(new Set()),
  id: "cooking",
  name: "Cooking",
  levels: [{ id: "cuisine", noun: "Cuisine", fallbackEmoji: "🍳" }],
  kinds: [
    { id: "recipe", emoji: "🍽️", label: "Recipe" },
    { id: "attempt", emoji: "🔥", label: "Attempt" },
  ],
});
const oneKind = buildJournalType({
  ...freshCustomJournal(new Set()),
  id: "solo",
  name: "Solo",
  levels: [{ id: "cuisine", noun: "Cuisine", fallbackEmoji: "🍳" }],
  kinds: [{ id: "recipe", emoji: "🍽️", label: "Recipe" }],
});

// The per-kind stack, derived the way the catalogue derives it — so a fixture
// cannot claim a spelling the plugin never wrote.
const stack = (type: typeof cooking, depth = 0): string[] =>
  childrenParts(sectionContext(type, { depth })).flatMap((p) => p.lines);

// A composed note put BACK into 1.0.16's merged shape, which is the direction
// this file needs its fixtures to run.
//
// A REPLACEMENT RATHER THAN A SECOND COMPOSER, so the note around it is exactly
// what this release writes — the frontmatter, the weld, the stack dividers, the
// sections either side — and the only thing that differs is the two lines
// 1.0.16 composed where this release composes six.
const asOneTable = (
  text: string,
  type: typeof cooking,
  depth = 0
): string => {
  const from = stack(type, depth).join("\n");
  if (!text.includes(from)) {
    throw new Error(`no per-kind stack in this note to merge: ${from}`);
  }
  return text.replace(from, `button:${type.id}:new\nkind-table`);
};

// A fence body wrapped as a note, for the cases that are about three lines
// rather than about a whole template.
const fence = (...lines: string[]): string =>
  ["```chronoanvil", ...lines, "```", ""].join("\n");

describe("what it rewrites", () => {
  it("returns the note the composer would have written, to the byte", () => {
    // THE ROUND TRIP IS THE ASSERTION, and it is made on a composed note aged
    // forwards rather than on a fixture typed here: anything else lets the
    // migration and the composer drift together without a test noticing. It is
    // also the check that keeps `rewriteBody`'s hand-spelled stack honest —
    // `children-split.ts` says why those three lines are not imported from
    // `childrenParts`, and this is what stops them being wrong.
    const fresh = composeTemplate(sectionContext(cooking, { depth: 0 }));
    const merged = asOneTable(fresh, cooking);
    expect(splitChildren(merged, cooking)).toBe(fresh);
  });

  it("puts the stack where the one table was", () => {
    // The card stays where the reader has it rather than moving to the top of
    // the fence — which matters on a note whose reader has dragged the section
    // below their own writing.
    const before = fence(
      "journal-header",
      "header:🗂️ What's below",
      "button:cooking:new",
      "kind-table",
      "header:📈 Progress",
      "activity-chart"
    );
    expect(splitChildren(before, cooking)).toBe(
      fence(
        "journal-header",
        "header:🗂️ What's below",
        ...stack(cooking),
        "header:📈 Progress",
        "activity-chart"
      )
    );
  });

  it("is a no-op the second time, and on a note composed today", () => {
    const fresh = composeTemplate(sectionContext(cooking, { depth: 0 }));
    expect(splitChildren(fresh, cooking)).toBeNull();
    const once = splitChildren(asOneTable(fresh, cooking), cooking)!;
    expect(splitChildren(once, cooking)).toBeNull();
  });

  it("names the count in the sentence the offer shows", () => {
    // "split the table" on a journal with two note types is a different change
    // from the same words on one with four, and the reader is deciding about a
    // diff they can see beside it.
    expect(splitDetail(cooking)).toContain("2 note types");
    expect(splitDetail(STUDY_JOURNAL)).toContain("2 note types");
  });

  it("leaves the bar exactly as it is, in every spelling", () => {
    // NOTHING TO RENAME, GOING BACK. `🗂️ What's below` is what `childrenBar`
    // composes over a multi-kind card under both shapes, so the generic word is
    // already the right one and the groups beneath it take the kinds' names.
    // The merge had to retitle a bar named after the one kind a type used to
    // have; this direction has no such case, and a bar the reader retitled is
    // their sentence about their own card either way.
    for (const bar of [
      "header:🗂️ What's below",
      "header:📚 Everything in here",
      "header:🍽️ Recipes",
    ]) {
      const out = splitChildren(
        fence(bar, "button:cooking:new", "kind-table"),
        cooking
      )!;
      expect(out).toContain(bar);
      expect(out.split("header:").length - 1).toBe(1 + cooking.kinds.length);
    }
  });
});

describe("what it refuses", () => {
  it("refuses a type with one kind", () => {
    // Its fence is what it has always been — bar, button, table — and 1.0.16
    // left it byte-identical in both directions, so there is nothing here that
    // was ever merged.
    const fresh = composeTemplate(sectionContext(oneKind, { depth: 0 }));
    expect(splitChildren(fresh, oneKind)).toBeNull();
    expect(fresh).toContain("kind-table:recipe");
  });

  it("refuses a fence that already carries the per-kind stack", () => {
    expect(
      splitChildren(fence("header:🗂️ What's below", ...stack(cooking)), cooking)
    ).toBeNull();
    // And a `kind-table:something-else` — another journal's, or a kind that was
    // deleted — is not this function's business either way.
    expect(
      splitChildren(fence("header:🗂️ What's below", "kind-table:gone"), cooking)
    ).toBeNull();
    expect(splitChildren(fence("journal-header", "tasks-table"), cooking)).toBeNull();
  });

  it("refuses a note with no chronoanvil fence at all", () => {
    expect(splitChildren("# Notes\n\nSome writing.\n", cooking)).toBeNull();
    expect(splitChildren("```base\nfilters:\n  and:\n```\n", cooking)).toBeNull();
  });

  it("leaves an unterminated fence alone rather than eating a line", () => {
    // `segment` carries an unclosed fence to the end of the file, so splicing
    // its "last line" would delete the reader's text. A half-typed fence is a
    // thing a reader is in the middle of, not a thing to repair.
    const open = [
      "```chronoanvil",
      "button:cooking:new",
      "kind-table",
      "Still typing",
    ].join("\n");
    expect(splitChildren(open, cooking)).toBeNull();
  });

  it("leaves another journal's create button where it is", () => {
    // A hand-written cross-link. The button is matched on the TYPE, so only
    // this section's own create is the one replaced.
    const out = splitChildren(
      fence(
        "header:🗂️ What's below",
        "button:study:new-lesson",
        "button:cooking:new",
        "kind-table"
      ),
      cooking
    )!;
    expect(out).toContain("button:study:new-lesson");
    expect(out.split("\n")).not.toContain("button:cooking:new");
  });

  it("keeps a bare create the reader put BELOW the table", () => {
    // Only the line ABOVE the table is 1.0.16's, because that is where the
    // composer wrote it. A `button:cooking:new` under the table is not a line
    // this plugin ever composed and is therefore the reader's.
    const out = splitChildren(
      fence("header:🗂️ What's below", "kind-table", "button:cooking:new"),
      cooking
    )!;
    // COUNTED AS LINES, not as substrings: `button:cooking:new-recipe` holds
    // the bare spelling inside it, which is the near-miss `startsWith("new-")`
    // exists to avoid in the dispatcher too.
    const lines = out.split("\n");
    expect(lines.filter((l) => l === "button:cooking:new")).toHaveLength(1);
    expect(lines.at(-3)).toBe("button:cooking:new");
  });
});

describe("everything else in the note stays where it is", () => {
  it("keeps the weld, the dividers and the grid it is welded to", () => {
    // The Study Topic index is the shape this actually meets: the card is
    // composed INSIDE the banner's fence (5.28), under the tracker region and
    // two stack dividers. All of that is above the lines being replaced and
    // none of it is this migration's business.
    const merged = asOneTable(
      studyTemplate("topic-index.md"),
      STUDY_JOURNAL,
      1
    );
    const out = splitChildren(merged, STUDY_JOURNAL)!;
    for (const line of [
      "stack",
      "journal-header",
      "actions",
      "# chronoanvil:trackers:start",
      "tracker:status",
      "# chronoanvil:trackers:end",
    ]) {
      expect(out).toContain(line);
    }
    expect(out.split("```chronoanvil").length).toBe(
      merged.split("```chronoanvil").length
    );
  });

  it("keeps a widget, a frame and a height the reader set", () => {
    const before = fence(
      "frame:none",
      "header:🗂️ What's below",
      "button:cooking:new",
      "kind-table",
      "height:400",
      "open-tasks"
    );
    const out = splitChildren(before, cooking)!;
    for (const line of ["frame:none", "height:400", "open-tasks"]) {
      expect(out).toContain(line);
    }
  });

  it("touches nothing outside the fence", () => {
    const before = [
      "---",
      "type: cuisine",
      "---",
      "Some writing above.",
      fence("header:🗂️ What's below", "button:cooking:new", "kind-table"),
      "Some writing below.",
      "",
    ].join("\n");
    const out = splitChildren(before, cooking)!;
    expect(out).toContain("Some writing above.");
    expect(out).toContain("Some writing below.");
    expect(out.startsWith("---\ntype: cuisine\n---\n")).toBe(true);
  });
});

// ── the 1.0.16 grammar, alive only until the vaults are migrated ──────────

describe("the merged shape still renders while it is on disk", () => {
  it("draws the per-kind stack for a bare kind-table, not a second table", () => {
    // An unmigrated index note has to draw something between installing this
    // build and pressing the repair window's tick, and what it draws is the
    // shape it is about to become — through the SAME function the composed
    // fence's own renderer calls, so there is one derivation and not two
    // tables to keep in step.
    const src = readCode("tables.ts");
    expect(src).toContain("export function perKindTables(");
    expect(src).toContain("perKindTables(root, plugin, ctx, type, file.parent.path)");
    // And `kindTable` itself knows one shape again: a named kind, or the
    // unknown-type error it has always drawn.
    expect(src).toContain("const kind = type.kinds.find((k) => k.id === kindId);");
    expect(src).toContain("if (!kind) {");
    expect(src).not.toContain("kindTablePropertiesFor");
  });

  it("composes neither the bare table nor the bare create", () => {
    // THE POINT OF THE REVERSAL. Nothing in the catalogue writes 1.0.16's two
    // lines, so the only notes that carry them are the ones it already wrote.
    for (const type of [cooking, STUDY_JOURNAL]) {
      const fresh = composeTemplate(
        sectionContext(type, { depth: type.levels.length - 1 })
      );
      expect(fresh).not.toContain(`button:${type.id}:new\n`);
      expect(fresh.split("\n")).not.toContain("kind-table");
      for (const kind of type.kinds) {
        expect(fresh).toContain(`kind-table:${kind.id}`);
        expect(fresh).toContain(`button:${type.id}:new-${kind.id}`);
      }
    }
    const catalogue = readCode("journal-sections");
    expect(catalogue).not.toContain("supersededChildren");
    expect(catalogue).not.toContain("childrenBody");
  });

  it("keeps the bare create button answerable, and says for how long", () => {
    // The button is on those notes and has to work when pressed. "New", with
    // nothing after it, and a Lucide icon rather than a kind's emoji — no one
    // kind's glyph is true of a button that makes any of them.
    const spec = journalSubActionSpec(cooking, "new");
    expect(spec.label).toBe("New");
    expect(spec.icon).toBe("file-plus");
    expect(spec.emoji).toBeUndefined();
    // The per-kind form is what the catalogue composes, and it is untouched.
    expect(journalSubActionSpec(cooking, "new-recipe").label).toBe("New Recipe");
    // BARE, RATHER THAN `new-note`, AND THE COLLISION IS WHY. A kind labelled
    // "Note" slugs to `note`, so `new-note` is already that kind's create
    // action in any vault that has one; `new-<id>` needs a non-empty id by
    // construction, so nothing can ever spell this second.
    const withNote = buildJournalType({
      ...freshCustomJournal(new Set()),
      id: "jrnl",
      levels: [{ id: "area", noun: "Area", fallbackEmoji: "📁" }],
      kinds: [
        { id: "note", emoji: "📝", label: "Note" },
        { id: "sketch", emoji: "✏️", label: "Sketch" },
      ],
    });
    expect(journalSubActionSpec(withNote, "new-note").label).toBe("New Note");
    expect(journalSubActionSpec(withNote, "new").label).toBe("New");
    // And all three — this file, that button and the bare table — name each
    // other as one set with one expiry, so removing them is one search.
    for (const file of ["button-widgets", "tables", "journal"]) {
      expect(readSrc(file)).toContain("children-split");
    }
  });

  it("asks which type before it writes, and not when there is nothing to ask", () => {
    const src = readSrc("journal");
    // `promptChoice` AND NOT `promptDetailedSuggester`: one run of rows with
    // nothing to group and no consequence to spell out — the consequence of
    // picking *Attempt* is an attempt.
    expect(src).toContain('"Which note type?"');
    // `only()` SHORT-CIRCUITS, which is the incidental case: with one kind the
    // reader pressing the card's create button has already said which.
    expect(src).toContain("only(type.kinds) ??");
    // A half-configured journal reports that there is nothing to create rather
    // than opening a modal with no rows in it.
    expect(src).toContain("has no note types configured");
    // The kind is chosen before anything is written, which is the whole of why
    // this is one call rather than a note created and then retyped.
    const at = src.indexOf("async newNoteAsking");
    const body = src.slice(at, src.indexOf("async newNote(", at));
    expect(body.indexOf("promptChoice")).toBeLessThan(body.indexOf("this.newNote("));
  });
});
