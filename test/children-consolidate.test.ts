// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// One table where an index note has a stack of them. 1.0.16.
//
// *"I think page types can be consolidated on journal index pages, [Updates
// Decisions scratchpads] can become one."*
//
// THE READER'S OWN CARD IS THE ARGUMENT. A Projects project index drew three
// heads, three create buttons, three chevrons and three empty states over a
// folder holding one note — one group per note type, which is what every
// release from 5.12 to 1.0.15 composed. The section draws one table with a Type
// column now, under one bar with one create that asks which type.
//
// ── WHAT IS IN THIS FILE AND WHAT IS NEXT DOOR ──────────────────────────
//
// `consolidateChildren` is the same change made to a note that already exists,
// and it is the only piece of this release that MOVES and DELETES lines a
// reader may have edited — a group head they renamed, a create button they left
// out. So it is a migration with a diff beside it rather than a repair, and
// most of this file is about what it refuses to touch.
//
// The composition itself is in `journal-sections.test.ts` and
// `journal-groups.test.ts`; that the old shape is still ATTRIBUTED, so no Save
// appends a second card beside it, is in `journal-groups.test.ts`; the two doors
// that offer this are in `dashboard-catchup.test.ts` and `repair-window.test.ts`.

import { describe, expect, it } from "vitest";
import {
  consolidateChildren,
  consolidateDetail,
} from "../src/journals/children-consolidate";
import { STUDY_JOURNAL } from "../src/journals/journal";
import {
  buildJournalType,
  composeTemplate,
  freshCustomJournal,
} from "../src/journals/custom-journal";
import { sectionContext } from "../src/journals/journal-sections";
import { journalSubActionSpec } from "../src/ui/widgets/button-widgets";
import { readCode, readSrc } from "./sources";
import { studyTemplate } from "./study-template";
import { asPerKindTables, bareHeadStack, perKindStack } from "./legacy-children";

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

// A fence body wrapped as a note, for the cases that are about three lines
// rather than about a whole template.
const fence = (...lines: string[]): string =>
  ["```chronoanvil", ...lines, "```", ""].join("\n");

describe("what it rewrites", () => {
  it("returns the note the composer would have written, to the byte", () => {
    // THE ROUND TRIP IS THE ASSERTION, and it is made on a composed note aged
    // backwards rather than on a fixture typed here: anything else lets the
    // migration and the composer drift together without a test noticing.
    const fresh = composeTemplate(sectionContext(cooking, { depth: 0 }));
    const aged = asPerKindTables(fresh, cooking);
    expect(consolidateChildren(aged, cooking)).toBe(fresh);
  });

  it("puts the one table where the FIRST of them was", () => {
    // The card stays where the reader has it rather than moving to the top of
    // the fence — which matters on a note whose reader has dragged the section
    // below their own writing.
    const before = fence(
      "journal-header",
      "header:🗂️ What's below",
      ...perKindStack(cooking),
      "header:📈 Progress",
      "activity-chart"
    );
    expect(consolidateChildren(before, cooking)).toBe(
      fence(
        "journal-header",
        "header:🗂️ What's below",
        "button:cooking:new",
        "kind-table",
        "header:📈 Progress",
        "activity-chart"
      )
    );
  });

  it("reads 5.11's bare heads as well as 5.12's numbered ones", () => {
    // Two releases wrote this card and both are on disk. The demotion rule is
    // what makes the bare shape legible — a fence's first titled head is the
    // section's bar and the rest are groups inside it — so the first of these
    // is retitled and the second is dropped.
    const before = fence(...bareHeadStack(cooking));
    expect(consolidateChildren(before, cooking)).toBe(
      fence("header:🗂️ What's below", "button:cooking:new", "kind-table")
    );
  });

  it("is a no-op the second time, and on a note composed today", () => {
    const fresh = composeTemplate(sectionContext(cooking, { depth: 0 }));
    expect(consolidateChildren(fresh, cooking)).toBeNull();
    const once = consolidateChildren(asPerKindTables(fresh, cooking), cooking)!;
    expect(consolidateChildren(once, cooking)).toBeNull();
  });

  it("names the count in the sentence the offer shows", () => {
    // "consolidate the tables" on a note with two is a different change from
    // the same words on a note with four, and the reader is deciding about a
    // diff they can see beside it.
    expect(consolidateDetail(cooking)).toContain("2 note types");
    expect(consolidateDetail(STUDY_JOURNAL)).toContain("2 note types");
  });
});

describe("the bar, where the card was named after one kind", () => {
  it("takes the section's own word when the name was a kind's", () => {
    // A type that HAD one kind composed its bar from that kind — "🍽️ Recipes"
    // over a table of recipes, which is right while there is nothing else in
    // it. One table over two kinds called "Recipes" would be a card naming half
    // of itself.
    const before = fence(
      "header:🍽️ Recipes",
      "button:cooking:new-recipe",
      "kind-table:recipe"
    );
    expect(consolidateChildren(before, cooking)).toBe(
      fence("header:🗂️ What's below", "button:cooking:new", "kind-table")
    );
  });

  it("leaves a bar the reader retitled exactly as they wrote it", () => {
    // ONLY WHERE IT IS STILL THE COMPOSED SPELLING, EXACTLY. A bar the reader
    // retitled is their sentence about their own card, and there is no reading
    // of this migration under which it gets to overwrite that — the table
    // beneath it widens either way.
    const out = consolidateChildren(
      fence(
        "header:📚 Everything in here",
        ...perKindStack(cooking)
      ),
      cooking
    )!;
    expect(out).toContain("header:📚 Everything in here");
    expect(out).not.toContain("What's below");
  });

  it("leaves the section's own bar alone where it already says so", () => {
    const out = consolidateChildren(
      fence(`header:🗂️ What's below`, ...perKindStack(cooking)),
      cooking
    )!;
    expect(out.split("header:").length - 1).toBe(1);
    expect(out).toContain("header:🗂️ What's below");
  });

  it("never retitles a head that belongs to something else", () => {
    // An explicit `header:2:` still standing once the group heads are out
    // belongs to a band the reader grouped under a head of its own, and the
    // thing it titles is not this card.
    const before = fence(
      "header:2:📋 My own section",
      "open-tasks",
      ...perKindStack(cooking)
    );
    const out = consolidateChildren(before, cooking)!;
    expect(out).toContain("header:2:📋 My own section");
    expect(out).not.toContain("What's below");
    expect(out).toContain("open-tasks");
  });
});

describe("what it refuses", () => {
  it("refuses a type with one kind", () => {
    // Its fence is what it has always been — bar, button, table — and is
    // byte-identical to what the catalogue composes today. Nothing to merge, and
    // the bar is correctly named after the only thing in the card.
    const fresh = composeTemplate(sectionContext(oneKind, { depth: 0 }));
    expect(consolidateChildren(fresh, oneKind)).toBeNull();
    expect(fresh).toContain("kind-table:recipe");
  });

  it("refuses a fence holding no table of this type's kinds", () => {
    // A `kind-table:something-else` is either another journal's or a kind that
    // was deleted, and neither is this function's business.
    expect(
      consolidateChildren(
        fence("header:🗂️ What's below", "kind-table:gone"),
        cooking
      )
    ).toBeNull();
    expect(consolidateChildren(fence("journal-header", "tasks-table"), cooking)).toBeNull();
  });

  it("refuses a note with no chronoanvil fence at all", () => {
    expect(consolidateChildren("# Notes\n\nSome writing.\n", cooking)).toBeNull();
    expect(
      consolidateChildren("```base\nfilters:\n  and:\n```\n", cooking)
    ).toBeNull();
  });

  it("leaves an unterminated fence alone rather than eating a line", () => {
    // `segment` carries an unclosed fence to the end of the file, so splicing
    // its "last line" would delete the reader's text. A half-typed fence is a
    // thing a reader is in the middle of, not a thing to repair.
    const open = ["```chronoanvil", ...perKindStack(cooking), "Still typing"].join("\n");
    expect(consolidateChildren(open, cooking)).toBeNull();
  });

  it("leaves another journal's create button where it is", () => {
    // A hand-written cross-link. The button is matched on the TYPE and the
    // kind, so only this section's own creates are the ones replaced.
    const out = consolidateChildren(
      fence(
        "header:🗂️ What's below",
        ...perKindStack(cooking),
        "button:study:new-lesson"
      ),
      cooking
    )!;
    expect(out).toContain("button:study:new-lesson");
    expect(out).not.toContain("button:cooking:new-recipe");
  });
});

describe("everything else in the note stays where it is", () => {
  it("keeps the weld, the dividers and the grid it is welded to", () => {
    // The Study Topic index is the shape this actually meets: the card is
    // composed INSIDE the banner's fence (5.28), under the tracker region and
    // two stack dividers. All of that is above the lines being replaced and
    // none of it is this migration's business.
    const aged = asPerKindTables(studyTemplate("topic-index.md"), STUDY_JOURNAL);
    const out = consolidateChildren(aged, STUDY_JOURNAL)!;
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
    expect(out.split("```chronoanvil").length).toBe(aged.split("```chronoanvil").length);
  });

  it("keeps a widget, a frame and a height the reader set", () => {
    const before = fence(
      "frame:none",
      "header:🗂️ What's below",
      ...perKindStack(cooking),
      "height:400",
      "open-tasks"
    );
    const out = consolidateChildren(before, cooking)!;
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
      fence("header:🗂️ What's below", ...perKindStack(cooking)),
      "Some writing below.",
      "",
    ].join("\n");
    const out = consolidateChildren(before, cooking)!;
    expect(out).toContain("Some writing above.");
    expect(out).toContain("Some writing below.");
    expect(out.startsWith("---\ntype: cuisine\n---\n")).toBe(true);
  });
});

// ── the three lines the card composes now ────────────────────────────────

describe("one table, one create, one question", () => {
  it("reads a bare kind-table as every kind of the host's journal", () => {
    // THE BARE DIRECTIVE, NOT A NEW WORD. `kind-table:update` is one kind's
    // notes and `kind-table` is all of them — the grammar this plugin already
    // uses for exactly this distinction (`level-index` bare, `launcher` bare).
    // A second keyword would be a second thing to name, register, document and
    // render forever, for a question the existing word already asks.
    const src = readCode("tables.ts");
    expect(src).toContain(
      "const kind = kindId ? type.kinds.find((k) => k.id === kindId) : null;"
    );
    expect(src).toContain("const shown = kind ? [kind] : type.kinds;");
    // BOTH SHAPES RENDER, PERMANENTLY (4.16 §3): the per-kind spelling is in
    // every vault and goes on drawing exactly what it drew. What changed is
    // what the catalogue composes — so the unknown-type error is reported for a
    // NAMED id only, and the bare word is never "unknown".
    expect(src).toContain("if (kindId && !kind) {");
  });

  it("keeps the bare form out of the section window, and says why", () => {
    // It is answered by the HOST NOTE rather than by the reader, and only on an
    // index note of a journal — so offered as a widget it would be a row a
    // reader could add to a diary page and get an empty card. What reaches those
    // surfaces is the section, which knows which depth it belongs on.
    const src = readCode("widget-registry");
    expect(src).toContain('"kind-table": {');
    expect(src).toContain("needs-vault-answer");
  });

  it("labels the create button with no kind in it", () => {
    // "New", with nothing after it: the noun is what the dialogue asks for, and
    // "New note" would name a kind ("Note") in half the journals that exist.
    const spec = journalSubActionSpec(cooking, "new");
    expect(spec.label).toBe("New");
    expect(spec.primary).toBe(true);
    // A LUCIDE ICON, WHERE EVERY `new-<kind>` BUTTON CARRIES THE KIND'S EMOJI.
    // The kinds' glyphs are the reader's identity marks for the things below,
    // and no single one of them is true of a button that makes any of them.
    expect(spec.icon).toBe("file-plus");
    expect(spec.emoji).toBeUndefined();
    // And the per-kind form is untouched, because a one-kind journal still
    // composes it.
    expect(journalSubActionSpec(cooking, "new-recipe").label).toBe("New Recipe");
  });

  it("cannot be spelled by a kind called Note", () => {
    // BARE, RATHER THAN `new-note`, AND THE COLLISION IS THE WHOLE REASON. A
    // kind labelled "Note" slugs to `note`, so `new-note` is already that
    // kind's create action in any vault that has one. `new-<id>` needs a
    // non-empty id by construction, so nothing can ever spell this second.
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
    // The dispatcher tells them apart the same way: `startsWith("new-")` can
    // never claim a hyphen-less word.
    const run = readSrc("button-widgets");
    expect(run.indexOf('if (sub === "new") {\n    return void journals.newNoteAsking')).
      toBeGreaterThan(-1);
  });

  it("asks which type before it writes, and not when there is nothing to ask", () => {
    const src = readSrc("journal");
    // `promptChoice` AND NOT `promptDetailedSuggester`: one run of rows with
    // nothing to group and no consequence to spell out — the consequence of
    // picking *Decision* is a decision.
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
