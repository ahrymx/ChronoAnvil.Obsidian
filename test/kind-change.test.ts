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
  kindChangeIsDestructive,
  kindChangeNeedsConfirming,
} from "../src/journals/journal-plan";

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

  it("uses the singular for one note", () => {
    expect(declassificationCost("Cook Book", 1)[0]).toContain("That note");
  });
});

describe("vocabulary", () => {
  it("never calls a note a page", () => {
    // In Almanac a *page* is a specific thing — the sub-notes a long note is
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
