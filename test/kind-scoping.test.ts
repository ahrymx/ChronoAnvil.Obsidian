// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import { studyFile, studyTemplate } from "./study-template";

import {
  STUDY_JOURNAL,
  declaredTrackerIds,
  kindAllowsTracker,
  kindsCarrying,
  ratingTrackerFor,
} from "../src/journals/journal";
import type { JournalType } from "../src/journals/journal";
import { STUDY_JOURNAL, folderEmoji } from "../src/journals/journal";
import { buildJournalType } from "../src/journals/custom-journal";
import type { JournalKindConfig } from "../src/journals/custom-journal";
import { normaliseKinds } from "../src/core/settings-editors";
import { trackerOptions } from "../src/trackers/entry-trackers";
import { journalSurface, TrackerDef, normalizeTrackers } from "../src/trackers/trackers";
import { DEFAULT_TRACKERS } from "../src/core/constants";
import { kindTableProperties } from "../src/ui/tables";

import { readSrc } from "./sources";
const asset = studyFile;

// ── The declaration lives on the kind ────────────────────────────────────
//
// Per-kind scoping was deferred through four roadmap revisions on the grounds
// that a kind list on a *tracker* is undecidable: a `typeId: null` singleton
// like Confidence naming a kind cannot say whose kind it means. Declaring on
// the kind dissolves that — a kind belongs to exactly one type — which is what
// these first tests pin.

describe("where the declaration lives", () => {
  it("is on the kind, not the tracker", () => {
    // If this ever moves onto TrackerDef the ambiguity comes back with it.
    const trackers = readSrc("trackers");
    const def = trackers.slice(
      trackers.indexOf("export interface TrackerDef {"),
      trackers.indexOf("// The chart kinds.")
    );
    expect(def).not.toContain("kinds?:");
    expect(def).not.toContain("kindId");
  });

  it("is unambiguous even for a global singleton", () => {
    // `confidence` is `typeId: null`, so it exists on every journal type. Two
    // journals both naming it from their own kinds is two statements about two
    // different kinds, not a collision.
    const cooking = buildJournalType({
      id: "cooking",
      name: "Cooking",
      emoji: "🍳",
      root: "03 - Journals/Cooking",
      templatesFolder: "T/Cooking",
      levels: [{ noun: "Section", fallbackEmoji: "📂" }],
      // NAMED THROUGH `rating` SINCE 3.18 (§7). The claim this test makes is
      // unchanged — a `typeId: null` singleton named by two journals' kinds is
      // unambiguous, because a kind belongs to exactly one type. What changed
      // is how a kind names a tracker: it used to enumerate `trackers`, and
      // now it designates the one it is graded on. Every assertion below is
      // the same value it was.
      kinds: [
        { id: "recipe", emoji: "🍲", label: "Recipe", rating: "confidence" },
        { id: "attempt", emoji: "🥣", label: "Attempt", rating: "accuracy" },
      ],
    });
    expect(kindAllowsTracker(cooking, "recipe", "confidence")).toBe(true);
    expect(kindAllowsTracker(cooking, "attempt", "confidence")).toBe(false);
    // …and Study's own answer is untouched by Cooking having one.
    expect(kindAllowsTracker(STUDY_JOURNAL, "lesson", "confidence")).toBe(true);
  });
});

describe("unmentioned is universal", () => {
  const type = STUDY_JOURNAL;

  it("collects what any kind names", () => {
    // THE RATINGS, AND ONLY THE RATINGS (3.18 §7.2). Study's kinds used to
    // enumerate `["confidence", "status", "reviewed"]` and `["accuracy",
    // "status", "reviewed"]`, so this set had four entries. The two that have
    // gone were declared by BOTH kinds — and a tracker every kind names is
    // indistinguishable from one no kind names, because `kindAllowsTracker`
    // returns true either way. They were inert, which is why removing them
    // changes no answer in this file.
    expect([...declaredTrackerIds(type)].sort()).toEqual(
      ["accuracy", "confidence"].sort()
    );
  });

  it("offers a tracker no kind names on every kind", () => {
    // The rule that makes the field safe to add to an existing preset:
    // declaring confidence on lesson must not also withdraw a custom tracker
    // the reader added and never listed. Restriction is opt-in per *tracker*.
    for (const kind of type.kinds) {
      expect(kindAllowsTracker(type, kind.id, "difficulty")).toBe(true);
    }
  });

  it("restricts only the trackers that are named", () => {
    expect(kindAllowsTracker(type, "lesson", "confidence")).toBe(true);
    expect(kindAllowsTracker(type, "practice", "confidence")).toBe(false);
    expect(kindAllowsTracker(type, "practice", "accuracy")).toBe(true);
    expect(kindAllowsTracker(type, "lesson", "accuracy")).toBe(false);
    // Declared by both, so both keep it.
    for (const kind of type.kinds) {
      expect(kindAllowsTracker(type, kind.id, "status")).toBe(true);
    }
  });

  it("is permissive for a kind that declares nothing", () => {
    const flat = buildJournalType({
      id: "recipes",
      name: "Recipes",
      emoji: "🍳",
      root: "R",
      templatesFolder: "T",
      levels: [{ noun: "Section", fallbackEmoji: "📂" }],
      kinds: [{ id: "recipe", emoji: "🍲", label: "Recipe" }],
    });
    expect(kindAllowsTracker(flat, "recipe", "confidence")).toBe(true);
    expect(kindAllowsTracker(flat, "recipe", "anything")).toBe(true);
  });

  it("is permissive for an index note or a page, which are not kinds", () => {
    // An index legitimately holds a current value of anything, and a page is
    // deliberately not a kind at all.
    for (const notAKind of ["subject", "topic", "page", null]) {
      expect(kindAllowsTracker(STUDY_JOURNAL, notAKind, "confidence")).toBe(true);
    }
  });
});

// ── The read side ────────────────────────────────────────────────────────

describe("which kinds an average counts", () => {
  it("counts only the kinds that carry the tracker", () => {
    // The live bug this fixes: until 2.36 `confidenceKinds` returned every
    // kind, so topics-table's column, confidence-summary and journal-breakdown
    // averaged "did I remember this" together with "did I get these right".
    expect(kindsCarrying(STUDY_JOURNAL, "confidence")).toEqual(["lesson"]);
    expect(kindsCarrying(STUDY_JOURNAL, "accuracy")).toEqual(["practice"]);
  });

  it("counts every kind for something no kind names", () => {
    expect(kindsCarrying(STUDY_JOURNAL, "difficulty")).toEqual([
      "lesson",
      "practice",
    ]);
  });

  it("keeps status on both, since both declare it", () => {
    expect(kindsCarrying(STUDY_JOURNAL, "status")).toEqual(["lesson", "practice"]);
  });
});

// ── The write side ───────────────────────────────────────────────────────

describe("what a recall sitting grades into", () => {
  it("splits the two questions", () => {
    expect(ratingTrackerFor(STUDY_JOURNAL, "lesson")).toBe("confidence");
    expect(ratingTrackerFor(STUDY_JOURNAL, "practice")).toBe("accuracy");
  });

  it("falls back for a kind that designates nothing", () => {
    // Null means "use the confidence built-in", which is what every note
    // written before the declaration existed already does — so an undeclared
    // journal grades exactly as it did.
    const flat = buildJournalType({
      id: "recipes",
      name: "Recipes",
      emoji: "🍳",
      root: "R",
      templatesFolder: "T",
      levels: [{ noun: "Section", fallbackEmoji: "📂" }],
      kinds: [{ id: "recipe", emoji: "🍲", label: "Recipe" }],
    });
    expect(ratingTrackerFor(flat, "recipe")).toBeNull();
    expect(ratingTrackerFor(STUDY_JOURNAL, "page")).toBeNull();
    expect(ratingTrackerFor(undefined, "lesson")).toBeNull();
  });

  it("designates one tracker, and carrying is not the same as being graded", () => {
    // The claim that outlived the list (3.18 §7). A kind holds plenty of
    // trackers it is not graded on — a Lesson carries Status and Reviewed —
    // and `rating` names the one a grade MEANS. It was its own field rather
    // than "the first of `trackers` that happens to be numeric"; it is now the
    // only field, and the distinction it draws is the same one.
    const lesson = STUDY_JOURNAL.kinds.find((k) => k.id === "lesson")!;
    expect(lesson.rating).toBe("confidence");
    // Carried, ungraded, and therefore still offered — the permissive rule,
    // which is what stops the removal of the list narrowing anything.
    expect(kindAllowsTracker(STUDY_JOURNAL, "lesson", "status")).toBe(true);
    expect(kindAllowsTracker(STUDY_JOURNAL, "lesson", "reviewed")).toBe(true);
  });
});

// ── The picker filters; nothing refuses ──────────────────────────────────

describe("the picker narrows, and only the picker", () => {
  const trackers: TrackerDef[] = [
    { id: "confidence", label: "🎯 Confidence", type: "number", surface: journalSurface(null), showInTemplate: false, showInBase: false },
    { id: "accuracy", label: "✔️ Accuracy", type: "number", surface: journalSurface(null), showInTemplate: false, showInBase: false },
    { id: "difficulty", label: "Difficulty", type: "number", surface: journalSurface("study"), showInTemplate: false, showInBase: false },
  ];
  const surface = journalSurface("study");
  const ids = (kindId: string | null): string[] =>
    trackerOptions(trackers, false, [], surface, [], {
      type: STUDY_JOURNAL,
      kindId,
    }).map((o) => o.directive);

  it("offers a lesson its own rating and not the other", () => {
    expect(ids("lesson").join(" ")).toContain("confidence");
    expect(ids("lesson").join(" ")).not.toContain("accuracy");
  });

  it("offers a practice note the reverse", () => {
    expect(ids("practice").join(" ")).toContain("accuracy");
    expect(ids("practice").join(" ")).not.toContain("confidence");
  });

  it("keeps an undeclared custom tracker on both", () => {
    for (const kind of ["lesson", "practice"]) {
      expect(ids(kind).join(" ")).toContain("difficulty");
    }
  });

  it("is unchanged when no kind is supplied", () => {
    // Every diary caller, and the pure tests, pass nothing — and get the
    // pre-2.36 answer.
    const all = trackerOptions(trackers, false, [], surface).map((o) => o.directive);
    expect(all.join(" ")).toContain("confidence");
    expect(all.join(" ")).toContain("accuracy");
  });

  it("never becomes a refusal", () => {
    // The asymmetry that keeps this safe: a refusal asserts a value is
    // illegitimate, and the plugin cannot know that. 2.34 shipped to delete
    // two wrong refusals; this must not manufacture a third.
    const src = readSrc("entry-trackers");
    const fn = src.slice(
      src.indexOf("export function directiveAllowedOn"),
      src.indexOf("export function describeSurfaceMismatch")
    );
    expect(fn).toContain("surfaceAdmits");
    expect(fn).not.toContain("kindAllowsTracker");
  });
});

// ── The new built-in ─────────────────────────────────────────────────────

describe("the accuracy built-in", () => {
  it("is a journal singleton like its sibling", () => {
    const acc = DEFAULT_TRACKERS.find((t) => t.builtin === "accuracy")!;
    const conf = DEFAULT_TRACKERS.find((t) => t.builtin === "confidence")!;
    expect(acc.surface).toEqual({ kind: "journal", typeId: null });
    // Same scale and same shape, so the grade arithmetic is shared unchanged.
    expect([acc.type, acc.min, acc.max]).toEqual([conf.type, conf.min, conf.max]);
  });

  it("is seeded into an existing config without being asked", () => {
    const out = normalizeTrackers([], false).map((t) => t.builtin);
    expect(out).toContain("accuracy");
  });

  it("has a distinct label from Confidence", () => {
    const acc = DEFAULT_TRACKERS.find((t) => t.builtin === "accuracy")!;
    const conf = DEFAULT_TRACKERS.find((t) => t.builtin === "confidence")!;
    expect(acc.label).not.toBe(conf.label);
    expect(acc.label[0]).not.toBe(conf.label[0]);
  });
});

// ── Declaring a custom journal's kinds ───────────────────────────────────
//
// Kinds are edited as rows now rather than as lines of `📖 Lesson:
// confidence*, status`, so what is left to test is the part that was ever
// load-bearing: turning a row into a storable config with a stable id.

describe("declaring a custom journal's kinds", () => {
  const row = (
    label: string,
    extra: Partial<JournalKindConfig> = {}
  ): JournalKindConfig => ({ id: "", emoji: "📝", label, ...extra });

  it("derives an id from the label", () => {
    expect(normaliseKinds([row("Entry")], { preserveIds: false })).toEqual([
      { id: "entry", emoji: "📝", label: "Entry" },
    ]);
  });

  it("keeps a declared rating", () => {
    expect(
      normaliseKinds(
        [row("Lesson", { emoji: "📖", rating: "confidence" })],
        { preserveIds: false }
      )
    ).toEqual([
      {
        id: "lesson",
        emoji: "📖",
        label: "Lesson",
        rating: "confidence",
      },
    ]);
  });

  it("leaves an ungraded kind's rating absent, not empty", () => {
    // Absent means "unmentioned, therefore universal". An empty string would
    // be a rating id nothing matches, which is a different and useless claim.
    expect(
      normaliseKinds([row("Entry")], { preserveIds: false })[0].rating
    ).toBeUndefined();
  });

  it("drops a stored trackers list rather than migrating it", () => {
    // 3.18 §7.3. The field had one writer, that writer is gone, and a value
    // read by nothing but `kindsCarrying` would be exactly the invisible state
    // journal-plan.ts rules against. An existing vault's config loses it on the
    // first save, and the rating it kept in step with is what survives.
    const [k] = normaliseKinds(
      [row("Lesson", { trackers: ["status"], rating: "confidence" } as never)],
      { preserveIds: false }
    );
    expect(k.rating).toBe("confidence");
    expect((k as Record<string, unknown>).trackers).toBeUndefined();
  });

  it("preserves an existing kind's id when its label is renamed", () => {
    // A relabel is not a migration. Re-deriving would change every future
    // note's `type` from `lesson` to `class` while leaving the existing ones
    // on `lesson` — and a note whose `type` its journal doesn't recognise
    // stops being classified as that journal's note at all.
    const existing: JournalKindConfig = {
      id: "lesson",
      emoji: "📖",
      label: "Class",
    };
    expect(normaliseKinds([existing], { preserveIds: true })[0].id).toBe(
      "lesson"
    );
    expect(normaliseKinds([existing], { preserveIds: false })[0].id).toBe(
      "class"
    );
  });

  it("reaches JournalType through buildJournalType", () => {
    const type: JournalType = buildJournalType({
      id: "cooking",
      name: "Cooking",
      emoji: "🍳",
      root: "R",
      templatesFolder: "T",
      levels: [{ noun: "Section", fallbackEmoji: "📂" }],
      kinds: normaliseKinds(
        [
          row("Recipe", { emoji: "🍲", rating: "difficulty" }),
          row("Attempt", { emoji: "🥣" }),
        ],
        { preserveIds: false }
      ),
    });
    expect(ratingTrackerFor(type, "recipe")).toBe("difficulty");
    // The undeclared kind stays permissive: it is graded on nothing, and being
    // graded on nothing withdraws nothing.
    expect(type.kinds.find((k) => k.id === "attempt")?.rating).toBeUndefined();
    expect(kindAllowsTracker(type, "attempt", "difficulty")).toBe(false);
    expect(kindAllowsTracker(type, "attempt", "anything-else")).toBe(true);
  });
});

// ── What the shipped assets show ─────────────────────────────────────────

describe("the shipped templates show the split", () => {
  it("puts Accuracy on the Practice note", () => {
    expect(asset("template-practice.md")).toContain("tracker:accuracy");
    expect(asset("template-practice.md")).not.toContain("tracker:confidence");
  });

  it("leaves the Lesson note on Confidence", () => {
    expect(asset("template-lesson.md")).not.toContain("tracker:accuracy");
  });

  it("gives each kind's table the rating that kind is scored on", () => {
    // The end of the split's journey: a Lesson's table shows Confidence, a
    // Practice's shows Accuracy, and neither shows the other's. This was
    // asserted against the ```base views the Topic template carried until
    // 2.54; the tables are native now, so the columns are derived in
    // tables.ts and the claim is made there instead.
    const byId = (id: string) =>
      kindTableProperties(STUDY_JOURNAL.kinds.find((k) => k.id === id)!);

    expect(byId("lesson")).toEqual(["date", "confidence", "status"]);
    expect(byId("practice")).toEqual(["date", "accuracy", "status"]);
  });

  it("writes one table per kind on the Topic index", () => {
    // One table each rather than one combined table, which is what makes the
    // per-kind column above possible at all — a single table would need a
    // column for every rating in the type and leave most of it blank.
    const topic = studyTemplate("Topic Index.md");
    expect(topic).toContain("kind-table:lesson");
    expect(topic).toContain("kind-table:practice");
  });
});

// ── Every reader narrows, or none of them do ─────────────────────────────

describe("no reader is left on the old semantics", () => {
  const src = (f: string): string =>
    readSrc(f);

  it("makes every-kind impossible to reach by omission", () => {
    // This was an optional parameter for about an hour, and that was long
    // enough to ship two call sites that forgot it: the trend kept averaging
    // Practice notes into a Confidence series while its sibling the breakdown
    // did not. An optional parameter defaulting to the *old* behaviour is a
    // migration that never finishes.
    const tables = src("tables.ts");
    const fn = tables.slice(
      tables.indexOf("export function confidenceKinds"),
      tables.indexOf("export function confidenceStats")
    );
    expect(fn).not.toContain("trackerId?");
    expect(fn).toContain("typeof EVERY_KIND");
  });

  it("passes a tracker at every call site", () => {
    for (const f of ["tables.ts", "widgets.ts"]) {
      for (const call of src(f).match(/confidenceKinds\([^)]*\)/g) ?? []) {
        // Two arguments means the tracker was forgotten.
        expect(call.split(",").length).toBeGreaterThan(2);
      }
    }
  });

  it("keeps the trend and the breakdown agreeing", () => {
    // The two are siblings over the same numbers; one narrowing and the other
    // not is the exact inconsistency this release existed to remove.
    const widgets = src("widgets.ts");
    expect(widgets).toMatch(/confidenceKinds\((?:this\.)?plugin, ctx\.sourcePath, def\.id\)/);
  });
});

// ── One folder-emoji pool for the whole vault ────────────────────────────
//
// Subject and Topic had shared a map since 1.8.0, on the grounds that a folder
// name only needs one emoji regardless of which level it sits at — an argument
// that never had anything to do with Study. As of 2.39 there is one pool for
// every journal type and every level, and what stays per-level is the fallback
// for a name the pool has never heard of.

describe("folder emoji", () => {
  const plugin = (map: Record<string, string>) =>
    ({ settings: { folderEmojis: map } }) as unknown as Parameters<
      typeof folderEmoji
    >[0];

  it("matches a name case-insensitively", () => {
    const p = plugin({ Chemistry: "⚗️" });
    expect(folderEmoji(p, "Chemistry", "📚")).toBe("⚗️");
    expect(folderEmoji(p, "chemistry", "📚")).toBe("⚗️");
    expect(folderEmoji(p, "CHEMISTRY", "📚")).toBe("⚗️");
  });

  it("falls back to whatever the caller's level supplies", () => {
    const p = plugin({});
    expect(folderEmoji(p, "Unlisted", "📚")).toBe("📚");
    expect(folderEmoji(p, "Unlisted", "🍲")).toBe("🍲");
  });

  it("gives the same glyph to a name whatever journal it is in", () => {
    // The point of the merge: one pool, so Chemistry is ⚗️ as a Study subject
    // and as a Cooking cuisine without being listed twice.
    //
    // A level carried its own `(plugin, name) => string` resolver until 2.42;
    // it is a bare fallback glyph now, and the pool lookup happens in the one
    // place that does it. Same answer, one implementation.
    const p = plugin({ Chemistry: "⚗️" });
    const cooking = buildJournalType({
      id: "cooking", name: "Cooking", emoji: "🍳", root: "R", templatesFolder: "T",
      levels: [{ noun: "Cuisine", fallbackEmoji: "🍲" }],
      kinds: [{ id: "recipe", emoji: "🍽️", label: "Recipe" }],
    });
    for (const level of [STUDY_JOURNAL.levels[0], cooking.levels[0]]) {
      expect(folderEmoji(p, "Chemistry", level.fallbackEmoji)).toBe("⚗️");
    }
  });

  it("keeps each level's own fallback", () => {
    const p = plugin({});
    expect(folderEmoji(p, "Nope", STUDY_JOURNAL.levels[0].fallbackEmoji)).toBe("📚");
    expect(folderEmoji(p, "Nope", STUDY_JOURNAL.levels[1].fallbackEmoji)).toBe("📂");
  });
});
