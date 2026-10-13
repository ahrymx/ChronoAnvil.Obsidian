// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// One index note's own answers about its note types' tables — 1.0.33.
//
// The reader's ask: *"that works for defaults, but there's no over-ride per
// index note-kind. A user might have added new note types into a topic, or maybe
// even, changed their mind for what they want 'Lessons' to be rated on for that
// particular index page. I think there should be note-kind options settings in
// the edit-mode of what's below, maybe as a hamburger menu beside the New note
// button and collapse chevron."*
//
// 1.0.32 answered the first half — a kind may name its own columns — and that
// answer is a fact about the JOURNAL. This is the same question one scope in.
//
// THE STORAGE IS THE CLAIM WORTH TESTING TWICE. It is the note's frontmatter and
// NOT the `kind-table:` line, because four comparisons in `journal-plan.ts` decide
// whether a part is present by matching that line literally — so a table line
// carrying an argument would read as missing to `missingParts` and as a stray to
// `strayParts`, and the group would be duplicated and then deleted. The sweep at
// the bottom is what keeps that reasoning from quietly expiring.

import { describe, expect, it } from "vitest";

import {
  KIND_TABLES_KEY,
  RATED_NONE,
  cleanOverride,
  isBlankOverride,
  kindTableOverride,
  kindTablesIn,
  pageKind,
  storedKindTables,
  withHeading,
  withKindTable,
  withRated,
} from "../src/journals/kind-tables";
import type { KindTableOverride } from "../src/journals/kind-tables";
import { KIND_DATE_KEYS, kindColumns } from "../src/journals/kind-columns";
import { slugify } from "../src/core/util";
import type ChronoAnvilPlugin from "../src/main";
import { readSrc } from "./sources";

const TRACKERS = [
  { id: "confidence", label: "🎯 Confidence", builtin: "confidence" },
  { id: "accuracy", label: "🎯 Accuracy" },
  { id: "state", label: "📌 Status", builtin: "status" },
];

const plugin = (): ChronoAnvilPlugin =>
  ({ settings: { trackers: TRACKERS } }) as unknown as ChronoAnvilPlugin;

const LESSON = { label: "Lesson", rating: "confidence" };

// THE `what` COLUMNS ONLY. 1.0.67 put a Modified column on every table, and
// this file's subject is a page overruling the four columns that are about the
// note's own facts — spelling the date default into eleven assertions would have
// pinned it here as well as in `kind-columns.test.ts`, where it belongs.
const words = (over: KindTableOverride): string[] => said(columns(over));

const columns = (over: KindTableOverride) =>
  kindColumns(plugin(), pageKind(LESSON, over));

const said = (cols: { key: string; heading: string }[]): string[] =>
  cols
    .filter((c) => !(KIND_DATE_KEYS as readonly string[]).includes(c.key))
    .map((c) => c.heading);

// What one note's frontmatter looks like once the writer has been through it.
const fmWith = (all: Record<string, KindTableOverride>) => ({
  [KIND_TABLES_KEY]: storedKindTables(all),
});

describe("reading what a note says", () => {
  it("says nothing for a note that carries no property", () => {
    expect(kindTablesIn({})).toEqual({});
    expect(kindTableOverride({}, "lesson")).toEqual({});
  });

  it("reads the rating and the headings off one flat entry", () => {
    const fm = { [KIND_TABLES_KEY]: { lesson: { rated: "accuracy", name: "Exercise" } } };
    expect(kindTableOverride(fm, "lesson")).toEqual({
      rated: "accuracy",
      headings: { name: "Exercise" },
    });
  });

  it("keeps the two apart, because `rated` is not a column role", () => {
    // The whole reason the stored shape is two levels rather than three: the
    // heading keys are `KIND_COLUMN_KEYS` and `rated` is none of them, so they
    // can share an entry without a nested map between them.
    const fm = { [KIND_TABLES_KEY]: { lesson: { rated: "accuracy", rating: "Score" } } };
    expect(kindTableOverride(fm, "lesson")).toEqual({
      rated: "accuracy",
      headings: { rating: "Score" },
    });
  });

  it("ignores keys this build does not understand", () => {
    const fm = { [KIND_TABLES_KEY]: { lesson: { colour: "red", name: "Exercise" } } };
    expect(kindTableOverride(fm, "lesson")).toEqual({ headings: { name: "Exercise" } });
  });

  it("reads nothing out of a shape a reader's property editor could leave", () => {
    // A map turned into a list, a scalar, a number where a word was — every one
    // of these is a state Obsidian's own property UI can put the note in, and
    // the answer to all of them is the state every vault is in today.
    expect(kindTablesIn({ [KIND_TABLES_KEY]: ["lesson"] })).toEqual({});
    expect(kindTablesIn({ [KIND_TABLES_KEY]: "lesson" })).toEqual({});
    expect(kindTablesIn({ [KIND_TABLES_KEY]: { lesson: "accuracy" } })).toEqual({});
    expect(kindTablesIn({ [KIND_TABLES_KEY]: { lesson: { rated: 3 } } })).toEqual({});
  });

  it("treats a blank heading as no answer at all", () => {
    // `headingOf`'s rule at the READ as well as at the write: a reader who
    // empties the box in Obsidian's property editor is asking for the word back,
    // not for a column with nothing over it.
    expect(cleanOverride({ name: "   " })).toBeNull();
    expect(cleanOverride({ rated: " accuracy " })).toEqual({ rated: "accuracy" });
  });

  it("trims the kind id, because a reader types that key by hand", () => {
    const fm = { [KIND_TABLES_KEY]: { " lesson ": { name: "Exercise" } } };
    expect(kindTableOverride(fm, "lesson")).toEqual({ headings: { name: "Exercise" } });
  });
});

describe("a date column on one page", () => {
  it("takes a heading override like any other role (1.0.67)", () => {
    // FOR FREE, AND THAT IS THE POINT. `cleanOverride` filters on
    // `KIND_COLUMN_KEYS`, so widening that const gave every date column a
    // per-index heading without a line of new code — a role is a role.
    const col = columns({ headings: { modified: "Touched" } }).find(
      (c) => c.key === "modified"
    );
    expect(col?.heading).toBe("Touched");
    expect(cleanOverride({ modified: "Touched" })).toEqual({
      headings: { modified: "Touched" },
    });
    expect(cleanOverride({ statusdate: "Moved" })).toEqual({
      headings: { statusdate: "Moved" },
    });
  });

  it("round trips a date heading through the stored property", () => {
    const stored = storedKindTables({ lesson: { headings: { created: "Written" } } });
    expect(stored).toEqual({ lesson: { created: "Written" } });
    expect(kindTableOverride({ [KIND_TABLES_KEY]: stored }, "lesson")).toEqual({
      headings: { created: "Written" },
    });
  });

  it("cannot say WHICH date columns one page draws, on purpose (1.0.67)", () => {
    // HEADINGS YES, PRESENCE NO, and the reason is storage rather than scope.
    // The stored entry is flat and two levels deep on purpose — *"A third level
    // of YAML buys nothing"* — and a presence answer there would have to be a
    // list whose EMPTY value means "none on this page" while its ABSENCE means
    // "inherit the journal". Those two are the same value through a property
    // editor, which is `entry-widget-toggle-1-0-42`'s lesson about storing an
    // answer as an absence. The ticks are a fact about the KIND, which is what
    // the reader asked for.
    //
    // So a `dates` key on a page's entry is not an answer, and is dropped like
    // any other word that is not a role.
    expect(cleanOverride({ dates: "created" } as never)).toBeNull();
    const over = cleanOverride({ rated: "accuracy", dates: "created" } as never);
    expect(over).toEqual({ rated: "accuracy" });
    // And the merge does not carry one either: a page cannot re-tick a column.
    expect(pageKind(LESSON, { headings: { modified: "Touched" } }).dates).toBeUndefined();
  });

  it("stops understanding a stored heading for the retired date column (1.0.68)", () => {
    // THE ONE COST OF REMOVING THE COLUMN, PINNED RATHER THAN DISCOVERED.
    // `HEADING_KEYS` is `new Set(KIND_COLUMN_KEYS)`, so a page that had renamed
    // its Date column is now holding a word for a column that no longer draws,
    // and the next write of that page's frontmatter drops it. That is what this
    // function does with everything a build does not understand — the point of
    // asserting it is that the loss is SILENT, so it belongs somewhere a reader
    // of this file can find it rather than in a vault.
    expect(cleanOverride({ date: "When" })).toBeNull();
    expect(cleanOverride({ date: "When", rating: "Score" })).toEqual({
      headings: { rating: "Score" },
    });
  });
});

describe("what the page draws", () => {
  it("draws the journal's own answer where the note says nothing", () => {
    expect(words({})).toEqual(["Lesson", "Confidence", "Status"]);
  });

  it("re-rates the table for this page only", () => {
    expect(words({ rated: "accuracy" })).toEqual(["Lesson", "Accuracy", "Status"]);
  });

  it("takes the rating column away where the page says nothing scores them", () => {
    expect(words({ rated: RATED_NONE })).toEqual(["Lesson", "Status"]);
  });

  it("gives a rating column to a kind the journal does not rate", () => {
    expect(
      said(kindColumns(plugin(), pageKind({ label: "Cheatsheet" }, { rated: "accuracy" })))
    ).toEqual(["Cheatsheet", "Accuracy", "Status"]);
  });

  it("puts the page's words over the journal's", () => {
    expect(words({ headings: { name: "Exercise", rating: "Score" } })).toEqual([
      "Exercise",
      "Score",
      "Status",
    ]);
  });

  it("keeps the journal's word for a column the page does not name", () => {
    // The merge is per ROLE, not all-or-nothing — a page that renames one column
    // must not silently drop the other three back to their derivations.
    const kind = { label: "Lesson", rating: "confidence", headings: { status: "State" } };
    expect(
      said(kindColumns(plugin(), pageKind(kind, { headings: { name: "Exercise" } })))
    ).toEqual(["Exercise", "Confidence", "State"]);
  });

  it("keeps the page's rating word when the page re-rates the kind", () => {
    // 1.0.32's rule, inherited whole: the override is keyed by what the column
    // IS, so re-rating does not strand the word under an old tracker id.
    expect(words({ rated: "accuracy", headings: { rating: "Score" } })).toEqual([
      "Lesson",
      "Score",
      "Status",
    ]);
  });
});

describe("the sentinel for `nothing`", () => {
  it("cannot be a tracker id, and `slugify` is the proof", () => {
    // Not a convention to remember — `slugify` strips leading and trailing
    // dashes, so a lone `-` slugifies to the empty string and no id can be it.
    expect(slugify(RATED_NONE)).toBe("");
  });

  it("is not the same answer as saying nothing", () => {
    expect(words({})).toContain("Confidence");
    expect(words({ rated: RATED_NONE })).not.toContain("Confidence");
  });
});

describe("writing one answer at a time", () => {
  it("stores a heading that departs from what the page would say", () => {
    expect(withHeading({}, "rating", "Score", "Confidence")).toEqual({
      headings: { rating: "Score" },
    });
  });

  it("stores nothing for a heading that agrees with the inherited word", () => {
    // `packHeadings`' rule one scope down: storing the word as it stands today
    // would pin it, so renaming the note type later would move it everywhere
    // EXCEPT the page the reader had visited.
    expect(withHeading({}, "rating", "Confidence", "Confidence")).toEqual({});
    expect(withHeading({}, "rating", "  Confidence  ", "Confidence")).toEqual({});
  });

  it("takes a heading back out when the box is emptied", () => {
    const over = { headings: { rating: "Score", name: "Exercise" } };
    expect(withHeading(over, "rating", "", "Confidence")).toEqual({
      headings: { name: "Exercise" },
    });
  });

  it("keeps the rating while a heading changes, and the headings while it does", () => {
    const over = { rated: "accuracy", headings: { name: "Exercise" } };
    expect(withHeading(over, "status", "State", "Status").rated).toBe("accuracy");
    expect(withRated(over, RATED_NONE).headings).toEqual({ name: "Exercise" });
  });

  it("drops the rating entirely when the note type's own is chosen", () => {
    // `null` is *stop saying anything*, which is a different answer from `-`.
    expect(withRated({ rated: "accuracy" }, null)).toEqual({});
    expect(withRated({ rated: "accuracy" }, RATED_NONE)).toEqual({ rated: RATED_NONE });
  });

  it("knows when a group has nothing left to say", () => {
    expect(isBlankOverride({})).toBe(true);
    expect(isBlankOverride({ rated: RATED_NONE })).toBe(false);
    expect(isBlankOverride({ headings: { name: "Exercise" } })).toBe(false);
  });
});

describe("writing it back into the note", () => {
  it("keeps the other note types' answers", () => {
    const fm = fmWith({ lesson: { rated: "accuracy" }, cheatsheet: { headings: { name: "Sheet" } } });
    expect(withKindTable(fm, "lesson", { rated: RATED_NONE })).toEqual({
      lesson: { rated: RATED_NONE },
      cheatsheet: { headings: { name: "Sheet" } },
    });
  });

  it("takes an emptied entry out rather than storing an empty one", () => {
    const fm = fmWith({ lesson: { rated: "accuracy" }, cheatsheet: { rated: "accuracy" } });
    expect(withKindTable(fm, "lesson", {})).toEqual({ cheatsheet: { rated: "accuracy" } });
  });

  it("asks for the whole property to go when the last entry does", () => {
    // `undefined` is the delete, which is `setPageTemplate`'s contract: absent is
    // already what "the journal's own answer" spells, and an empty map left
    // behind would be a second spelling of it sitting in the reader's note.
    const fm = fmWith({ lesson: { rated: "accuracy" } });
    expect(withKindTable(fm, "lesson", {})).toBeUndefined();
  });

  it("flattens the headings onto the entry it stores", () => {
    expect(
      storedKindTables({ lesson: { rated: "accuracy", headings: { name: "Exercise" } } })
    ).toEqual({ lesson: { rated: "accuracy", name: "Exercise" } });
  });

  it("round-trips through the shape on disk", () => {
    const over = { rated: "accuracy", headings: { name: "Exercise", rating: "Score" } };
    expect(kindTableOverride(fmWith({ lesson: over }), "lesson")).toEqual(over);
  });
});

describe("where it is read and written", () => {
  it("is the frontmatter, written the way the other per-note override is", () => {
    const j = readSrc("journal");
    expect(j).toContain("async setKindTable(");
    // `setPageTemplate`'s two halves: the delete, and the refusal to write when
    // there is nothing to write and nothing to take away.
    expect(j).toContain("delete front[KIND_TABLES_KEY]");
    expect(j).toContain("if (!next && !(KIND_TABLES_KEY in fm)) return;");
    expect(KIND_TABLES_KEY).toBe("kindtables");
    // `PAGE_TEMPLATE_KEY`'s shape, which is the precedent this follows.
    expect(KIND_TABLES_KEY).toMatch(/^[a-z]+$/);
  });

  it("is what the table merges over the journal's answer", () => {
    const t = readSrc("tables");
    expect(t).toContain("const page = pageKind(");
    expect(t).toContain("kindTableOverrideOf(app, getFile(app, ctx.sourcePath), kind.id)");
    // The rating the table reads is the merged one, or a page that re-rated its
    // lessons would draw a column headed Accuracy holding confidence numbers.
    expect(t).toContain("const ratingId = page.rating ?? null;");
  });

  it("is NOT on the `kind-table:` line, and the reconciler is why", () => {
    // Four comparisons decide a part is present by matching its probe LITERALLY.
    // A table line that grew an argument would read as missing to one and as a
    // stray id to the other — the group composed twice and then deleted.
    const plan = readSrc("journal-plan");
    expect(plan).toContain("present.has(p.probe.trim())");
    expect(plan).toContain("out.findIndex((l) => l.trim() === probe.trim())");
    // And the composer still emits the bare line, so nothing has to migrate.
    expect(readSrc("journal-sections")).toContain("${CHILDREN_TABLE}:${kind.id}");
  });
});

// ── THE CONTROL THAT WRITES IT (MOVED, 1.0.69) ───────────────────────────
//
// A `describe("the control that writes it")` of five tests stood here, pinning
// the `⋯` that `below-edit.ts` synced onto each group's head inside the picking
// mode and the flat menu `kind-options-menu.ts` opened from it: the sync, the
// *The note type's own (…)* row, the re-read at the click, the no-submenu rule
// and the per-group title.
//
// `src/ui/widgets/kind-options-menu.ts` is deleted. The reader's second call was
// *remove it regardless* — everything type-level is behind one cog now — and
// every one of those claims is asserted against the Note types window in
// `test/note-types-window.test.ts`, which is the door that writes this record.
//
// WHAT STAYED IN THIS FILE is the record itself: `kindTableOverrideOf`,
// `pageKind`, `withHeading`, `withRated`, `cleanOverride` and the two-levels-deep
// storage shape. The writer moved; what it writes did not.

