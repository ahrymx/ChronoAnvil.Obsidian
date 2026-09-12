// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";
import {
  declassificationCost,
  diffKinds,
  diffLevels,
  kindChangeIsDestructive,
  kindChangeNeedsConfirming,
  levelAdditionCost,
  levelRemovalCost,
} from "../src/journals/journal-plan";
import { fnBody, readCode, readSrc } from "./sources";

// ── changing a journal type's note kinds ──────────────────────────────────
//
// The confirmation is DOM; the decisions behind it are not. What matters is
// that a rename is not read as a delete-and-add, that a removal is the only
// thing that makes the window destructive, and that the guarantee the window
// prints is one the code can actually keep.

const k = (id: string, label: string, extra: object = {}) => ({
  id,
  label,
  ...extra,
});

describe("what counts as a change", () => {
  it("sees nothing when nothing moved", () => {
    const before = [k("recipe", "Recipe"), k("attempt", "Attempt")];
    expect(diffKinds(before, [...before])).toEqual([]);
  });

  it("reads a rename as a rename, not a delete and an add", () => {
    // The whole reason normaliseKinds preserves ids on an established type:
    // notes on disk carry the id, so re-deriving it from a new label would
    // declassify every one of them. A diff that read this as remove+add would
    // offer to destroy something a rename did not touch.
    const before = [k("meeting", "Meeting")];
    const after = [k("meeting", "Catch-up")];
    const out = diffKinds(before, after);
    expect(out.map((c) => c.kind)).toEqual(["relabelled"]);
    expect(out[0].detail).toContain("nothing is rewritten");
  });

  it("sees an addition", () => {
    const out = diffKinds([], [k("note", "Field Note")]);
    expect(out[0].kind).toBe("added");
    expect(out[0].detail).toContain("note.md");
  });

  it("sees a removal, and says the template stays", () => {
    // Never deletes a file the reader might want. Naming it is the whole of
    // the help that can be given.
    const out = diffKinds([k("meeting", "Meeting")], []);
    expect(out[0].kind).toBe("removed");
    expect(out[0].detail).toContain("stays on disk");
  });

  it("sees a rating change as non-retroactive", () => {
    const out = diffKinds(
      [k("recipe", "Recipe")],
      [k("recipe", "Recipe", { rating: "difficulty" })]
    );
    expect(out[0].kind).toBe("rated");
    expect(out[0].detail).toContain("already written keep");
  });

  it("says a kind that loses pages keeps the notes already split", () => {
    // Those notes are folder notes with a pages-table in them; the widget does
    // not consult the config, so they go on working. Saying so matters more
    // than it sounds — the alternative reading is that they break.
    const out = diffKinds(
      [k("lesson", "Lesson", { pages: true })],
      [k("lesson", "Lesson")]
    );
    expect(out[0].kind).toBe("paged");
    expect(out[0].detail).toContain("go on working");
  });
});

describe("when the window opens and how hard it asks", () => {
  it("does not open for a rename alone", () => {
    const out = diffKinds([k("m", "Meeting")], [k("m", "Catch-up")]);
    expect(kindChangeNeedsConfirming(out)).toBe(false);
  });

  it("opens for an addition, without the destructive button", () => {
    const out = diffKinds([], [k("n", "Note")]);
    expect(kindChangeNeedsConfirming(out)).toBe(true);
    expect(kindChangeIsDestructive(out)).toBe(false);
  });

  it("opens destructive for a removal", () => {
    const out = diffKinds([k("m", "Meeting")], []);
    expect(kindChangeIsDestructive(out)).toBe(true);
  });

  it("stays destructive when a removal is mixed with an addition", () => {
    const out = diffKinds([k("m", "Meeting")], [k("n", "Note")]);
    expect(kindChangeIsDestructive(out)).toBe(true);
  });
});

describe("what a removal costs", () => {
  it("says nothing at all when no notes use the kind", () => {
    // A wall of consequences that all begin "those 0 notes" is worse than no
    // wall. At zero the window should get quieter, and it does.
    expect(declassificationCost("Cook Book", 0)).toEqual([]);
  });

  it("names the six things that stop working, not just that they do", () => {
    const lines = declassificationCost("Cook Book", 14);
    expect(lines[0]).toContain("14 notes");
    expect(lines.join("\n")).toContain("review queue");
    expect(lines.join("\n")).toContain("breadcrumbs");
    expect(lines.join("\n")).toContain("tracker picker");
  });

  it("says the one a reader notices first in their own words", () => {
    // Notes vanishing from their parent's table while still sitting in the
    // folder is the consequence that gets reported as a bug. It is described
    // as what it looks like, not as what causes it.
    expect(declassificationCost("Cook Book", 3).join("\n")).toContain(
      "still in the folder, gone from the index"
    );
  });

  it("says the change is reversible, because it is", () => {
    expect(declassificationCost("Cook Book", 3).join("\n")).toContain(
      "restores all of it"
    );
  });

  it("uses the singular for one note, verbs included", () => {
    // It said "That note stop being recognised" until 1.0.4: the subject was
    // given a singular and the five verbs after it were left plural. The
    // bullets take "each" rather than a second set of strings, which is true at
    // any count.
    const lines = declassificationCost("Cook Book", 1);
    expect(lines[0]).toContain("That note stops being recognised");
    expect(lines[0]).toContain("It keeps its text and stays where it is");
    expect(lines.join("\n")).not.toContain("they");
    expect(lines.join("\n")).not.toContain("their");
  });

  it("uses the plural for several, verbs included", () => {
    const lines = declassificationCost("Cook Book", 14);
    expect(lines[0]).toContain("Those 14 notes stop being recognised");
    expect(lines[0]).toContain("They keep their text and stay where they are");
  });
});

describe("vocabulary", () => {
  it("never calls a note a page", () => {
    // In ChronoAnvil a *page* is a specific thing — the sub-notes a long note is
    // split across, deliberately excluded from `kinds`. Using it here for "a
    // note that gets created" would collide with the narrower meaning the
    // reader has been taught everywhere else.
    const text = [
      ...declassificationCost("Cook Book", 4),
      ...diffKinds([k("m", "Meeting")], [k("n", "Note")]).map((c) => c.detail),
    ].join("\n");
    expect(text).not.toMatch(/\bpages?\b/);
  });
});

// ── changing a journal's folder depth ─────────────────────────────────────
//
// The same window, because it is the same fact. A level derives an id from a
// noun, writes it as the `type:` value of every index note it produces, keeps
// it across a rename, and takes every one of those notes' classification with
// it when it goes. That last sentence was true before this and there was no
// window at all — the dropdown moved from "Two levels" to "Flat" and the save
// went through in silence.

const lv = (id: string, noun: string) => ({ id, noun });

describe("what counts as a depth change", () => {
  it("sees nothing when nothing moved", () => {
    const before = [lv("subject", "Subject"), lv("topic", "Topic")];
    expect(diffLevels(before, [...before])).toEqual([]);
  });

  it("reads a renamed noun as a rename, not a delete and an add", () => {
    // `normaliseLevels(…, { preserveIds: true })` is why: the id is on every
    // index note and is the frontmatter key every leaf note names its folder
    // with. A diff reading this as remove-and-add would offer to declassify a
    // journal because the reader preferred the word "Module".
    const out = diffLevels([lv("topic", "Topic")], [lv("topic", "Module")]);
    expect(out.map((c) => c.kind)).toEqual(["relabelled"]);
    expect(out[0].subject).toBe("level");
    expect(out[0].detail).toContain("nothing is rewritten");
  });

  it("sees the second level arriving, and names the folder it goes inside", () => {
    const out = diffLevels([lv("subject", "Subject")], [
      lv("subject", "Subject"),
      lv("topic", "Topic"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("added");
    expect(out[0].subject).toBe("level");
    // The level ABOVE is what changes meaning: its folders stop holding notes.
    expect(out[0].detail).toContain("Subject");
    expect(out[0].detail).toContain("type: topic");
  });

  it("sees the second level going, and promises nothing is moved", () => {
    // The refusal that matters. Nothing on disk is touched by a depth change —
    // the folders and the notes stay exactly where they are — and the whole
    // cost is that the plugin stops recognising them.
    const out = diffLevels(
      [lv("subject", "Subject"), lv("topic", "Topic")],
      [lv("subject", "Subject")]
    );
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("removed");
    expect(out[0].subject).toBe("level");
    expect(out[0].detail).toContain("Nothing is moved or deleted");
  });

  it("ignores a row that has no id, rather than deriving one", () => {
    // A level gained an id in 2.43 and `normalizeJournalConfigs` backfills it
    // on load, so a row without one has never been written to disk under any
    // id. Deriving one here would be the second id rule this file exists to
    // avoid, and the sentence built from it would name a `type:` value nothing
    // is going to write.
    //
    // THE ROW HAS TO BE ON ONE SIDE ONLY for this to prove anything. The first
    // version of this test put the same idless row on both sides, where a
    // derived id cancels out and the diff is empty either way — green, and
    // saying nothing.
    expect(
      diffLevels([lv("subject", "Subject")], [
        lv("subject", "Subject"),
        { noun: "Topic" },
      ])
    ).toEqual([]);
  });

  it("tags every kind change as a kind, so the window can tell them apart", () => {
    const out = diffKinds([k("m", "Meeting")], [k("n", "Note")]);
    expect(out.every((c) => c.subject === "kind")).toBe(true);
  });
});

describe("how hard a depth change asks", () => {
  const flat = [lv("subject", "Subject")];
  const deep = [lv("subject", "Subject"), lv("topic", "Topic")];

  it("does not open for a renamed noun alone", () => {
    const out = diffLevels([lv("topic", "Topic")], [lv("topic", "Module")]);
    expect(kindChangeNeedsConfirming(out)).toBe(false);
  });

  it("opens destructive when a level goes", () => {
    const out = diffLevels(deep, flat);
    expect(kindChangeNeedsConfirming(out)).toBe(true);
    expect(kindChangeIsDestructive(out)).toBe(true);
  });

  it("opens destructive when a level ARRIVES, unlike an added kind", () => {
    // THE ASYMMETRY IS THE POINT. An added kind costs nothing: it is a new
    // group in an empty space. An added level is declared over notes that are
    // already there — every note a flat journal holds sits directly in a
    // top-level folder, and `hasLevelBelow` answers from the structure rather
    // than from what is on disk, so all of them drop out of the index at once.
    const out = diffLevels(flat, deep);
    expect(kindChangeIsDestructive(out)).toBe(true);
    expect(kindChangeIsDestructive(diffKinds([], [k("n", "Note")]))).toBe(false);
  });
});

describe("what a depth change costs", () => {
  it("says nothing at all when no notes are affected", () => {
    expect(levelRemovalCost("Study", "Topic", 0)).toEqual([]);
    expect(levelAdditionCost("Topic", 0)).toEqual([]);
  });

  it("does not reuse the kind wording, because most of it would be false", () => {
    // An index note was never in the review queue and never had a tracker
    // picker. Four of `declassificationCost`'s six lines are untrue of one, and
    // a guarantee window that says one untrue thing is read as a guarantee.
    const lines = levelRemovalCost("Study", "Topic", 4).join("\n");
    expect(lines).not.toContain("review queue");
    expect(lines).not.toContain("tracker picker");
  });

  it("names the thing an unrecognised index note actually loses", () => {
    const lines = levelRemovalCost("Study", "Topic", 4).join("\n");
    expect(lines).toContain("4 Topic index notes");
    expect(lines).toContain("stops drawing its tables");
    expect(lines).toContain("one folder deeper");
  });

  it("says a depth change is reversible, because it is", () => {
    expect(levelRemovalCost("Study", "Topic", 2).join("\n")).toContain(
      "restores all of it"
    );
  });

  it("tells a reader whose notes a new level strands how to get them back", () => {
    // The one cost in this file the reader undoes by hand rather than by
    // putting the setting back, so the last line says how.
    const lines = levelAdditionCost("Topic", 9).join("\n");
    expect(lines).toContain("9 notes sit directly in folders");
    expect(lines).toContain("gone from the index");
    expect(lines).toContain("moving each into a Topic folder puts it back");
  });

  it("uses the singular for one note, on both sides", () => {
    expect(levelRemovalCost("Study", "Topic", 1)[0]).toContain(
      "one Topic index note"
    );
    expect(levelAdditionCost("Topic", 1)[0]).toContain("One note sits");
  });
});

describe("where the depth change is asked about", () => {
  const settings = () => readCode("settings-editors");
  const window = () => readSrc("journals/kind-change");

  it("goes through the kind window rather than a second one", () => {
    expect(settings()).toContain("...diffLevels(levelsBefore, this.draft.levels)");
    expect(settings()).toContain("confirmKindChange(");
    // One window, not two: nothing in the tree builds a second confirmation.
    expect(window()).not.toContain("class LevelChangeModal");
  });

  it("diffs against the levels the window opened with, not the live draft", () => {
    // `this.draft.levels` is the array the form mutates in place, so a diff
    // against it would always be empty — the same trap `kindsOnOpen` was
    // introduced for.
    expect(settings()).toContain("this.levelsOnOpen = cfg.levels.map");
  });

  it("counts the notes a new level strands by type, not by path alone", () => {
    // A folder's own index note sits at the same depth as the notes beside it
    // and is not a casualty — it stays where it is and goes on being the index.
    const body = fnBody("notesStrandedByLevel", "core/settings-editors");
    expect(body).toContain("kindIds.has(noteTypeOf(this.app, file)");
    expect(body).toContain("parts.length !== depth + 1");
  });

  it("asks about depth in the reader's words, not about note types", () => {
    // A reader who changed the depth and nothing else would otherwise be shown
    // a window headed "Change the note types", and would reasonably answer a
    // question they were not being asked.
    const src = window();
    expect(src).toContain('{ noun: "folder depth", cta: "Change the depth" }');
    expect(src).toContain('{ noun: "structure", cta: "Change the structure" }');
  });

  it("only promises the dashboard offer when there is one to make", () => {
    // `findDashboardCatchups` has nothing to offer for a depth change, so the
    // second half of the guarantee is printed only when a kind was added.
    expect(window()).toContain('added.some((c) => c.subject === "kind")');
  });
});
