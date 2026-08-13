// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Patch 2 of the 3.0 plan: one interface, three implementations.
//
// The patch changes no behaviour, so the evidence for it is that the whole
// suite stays green — the same shape as 2.59.1's adapter. What THIS file adds
// is the part a green suite cannot show: that the three implementations
// actually answer the same questions the same way, and that nothing in the
// interface leaks which catalogue is behind it.
//
// Every test below runs over all three models from one list. A test that had to
// special-case one of them would be the signal §9 names — that the catalogues
// are less alike than 2.59 and 2.60 concluded — and it would belong in the
// divergence record rather than being papered over with a conditional.

import { describe, expect, it } from "vitest";
import { readCode, readSrc } from "./sources";
import { STUDY_JOURNAL } from "../src/journals/journal";
import { journalTemplateFiles } from "../src/journals/custom-journal";
import { sectionContext } from "../src/journals/journal-sections";
import { journalSectionModel } from "../src/journals/journal-plan";
import {
  composeDiaryDashboard,
  diarySectionModel,
} from "../src/diary/diary-sections";
import {
  composeEntryTemplate,
  entrySectionModel,
} from "../src/diary/entry-sections";
import {
  holdPinned,
  joinParts,
  partsOf,
  questionIsRequired,
} from "../src/core/section-model";
import type { SectionModel } from "../src/core/section-model";

interface Surface {
  name: string;
  model: SectionModel;
  text: string;
}

const topicText = (): string =>
  journalTemplateFiles(STUDY_JOURNAL).find((f) => f.name === "topic-index.md")!
    .content;
const lessonText = (): string =>
  journalTemplateFiles(STUDY_JOURNAL).find((f) => f.name === "lesson.md")!
    .content;

const surfaces = (): Surface[] => [
  {
    name: "journal index",
    model: journalSectionModel(sectionContext(STUDY_JOURNAL, { depth: 1 })),
    text: topicText(),
  },
  {
    name: "journal leaf",
    model: journalSectionModel(
      sectionContext(STUDY_JOURNAL, {
        kind: STUDY_JOURNAL.kinds.find((k) => k.id === "lesson")!,
      })
    ),
    text: lessonText(),
  },
  {
    name: "diary dashboard",
    model: diarySectionModel({ grain: "monthly" }),
    text: composeDiaryDashboard("monthly"),
  },
  {
    name: "diary entry",
    model: entrySectionModel({ grain: "daily" }),
    text: composeEntryTemplate("daily"),
  },
];

// ── the contract ──────────────────────────────────────────────────────

describe("every model answers the same six questions", () => {
  it("lists what it offers, with a label, a blurb and a token", () => {
    for (const { name, model } of surfaces()) {
      const all = model.sections();
      expect(all.length, name).toBeGreaterThan(0);
      for (const s of all) {
        expect(s.id, name).toBeTruthy();
        expect(s.label, name).toBeTruthy();
        expect(s.blurb, name).toBeTruthy();
        expect(s.icon, `${name}/${s.id}`).toBeTruthy();
      }
      // Ids are unique, which is what lets the editor key rows by them.
      expect(new Set(all.map((s) => s.id)).size, name).toBe(all.length);
    }
  });

  it("finds what a file it composed already contains", () => {
    for (const { name, model, text } of surfaces()) {
      const present = model.present(text);
      expect(present.length, name).toBeGreaterThan(0);
      const offered = new Set(model.sections().map((s) => s.id));
      for (const id of present) expect(offered.has(id), `${name}/${id}`).toBe(true);
    }
  });

  it("offers as addable exactly what it offers and does not have", () => {
    for (const { name, model, text } of surfaces()) {
      const present = new Set(model.present(text));
      const addable = model.addable(text).map((s) => s.id);
      for (const id of addable) expect(present.has(id), `${name}/${id}`).toBe(false);
      // No duplicates, and nothing offered twice under two names.
      expect(new Set(addable).size, name).toBe(addable.length);
    }
  });

  it("plans no change when asked for the arrangement it has", () => {
    for (const { name, model, text } of surfaces()) {
      const present = model.present(text);
      const ops = model.plan(text, present);
      expect(
        ops.filter((o) => o.kind === "add" || o.kind === "remove" || o.kind === "move"),
        name
      ).toEqual([]);
    }
  });

  it("returns null from apply when nothing would change", () => {
    // The convention shared with applyLayout and applySections, and what makes
    // idempotence structural rather than claimed: a second call has nothing
    // left to return.
    for (const { name, model, text } of surfaces()) {
      expect(model.apply(text, model.present(text)), name).toBeNull();
    }
  });

  it("applies only what the plan named", () => {
    // The property the whole preview rests on. Asserted, not assumed: whatever
    // the plan did not call an add, a remove or a move must not appear in the
    // difference between the two texts.
    for (const { name, model, text } of surfaces()) {
      const present = model.present(text);
      const want = present.filter((_, i) => i !== present.length - 1);
      const ops = model.plan(text, want);
      const next = model.apply(text, want);
      const changed = ops.some(
        (o) => o.kind === "add" || o.kind === "remove" || o.kind === "move"
      );
      if (!changed) expect(next, name).toBeNull();
      else expect(next, name).not.toBeNull();
    }
  });

  it("refuses a removal with a reason, or allows it with none", () => {
    for (const { name, model, text } of surfaces()) {
      for (const s of model.sections()) {
        const why = model.refusal(s.id, text);
        if (why !== null) {
          expect(typeof why, `${name}/${s.id}`).toBe("string");
          expect(why.length, `${name}/${s.id}`).toBeGreaterThan(0);
          // A refusal that only says no sends someone looking for a setting
          // that does not exist. Every one of them names the section.
          expect(why, `${name}/${s.id}`).toContain(s.label);
        }
      }
    }
  });

  it("never refuses a removal it also calls removable, or the reverse", () => {
    // `removable` is a property of the SECTION; `refusal` is a question about
    // THIS text. They may disagree in one direction only: a removable section
    // can still be refused here because it is holding the reader's writing. An
    // unremovable one must always be refused, or the row would offer a control
    // the plan will decline.
    for (const { name, model, text } of surfaces()) {
      for (const s of model.sections()) {
        if (!s.removable) {
          expect(model.refusal(s.id, text), `${name}/${s.id}`).not.toBeNull();
        }
      }
    }
  });

  it("keeps a refused section rather than silently dropping it", () => {
    // Silently keeping a section the reader unticked would be the editor
    // lying; reporting it as a `keep` carrying the reason is what makes the
    // refusal visible before Save rather than after.
    for (const { name, model, text } of surfaces()) {
      const present = model.present(text);
      for (const id of present) {
        if (model.refusal(id, text) === null) continue;
        const ops = model.plan(text, present.filter((x) => x !== id));
        const op = ops.find((o) => o.sectionId === id);
        expect(op?.kind, `${name}/${id}`).toBe("keep");
      }
    }
  });
});

// ── what the interface must not leak ──────────────────────────────────

describe("the editor cannot learn which surface it is on", () => {
  it("because a SectionView carries no surface, grain or type", () => {
    // §2's rule: "What must not happen: the editor learning which surface it
    // is on. If it asks, the interface is wrong."
    for (const { name, model } of surfaces()) {
      for (const s of model.sections()) {
        expect(Object.keys(s).sort(), `${name}/${s.id}`).toEqual([
          "blurb",
          "group",
          "icon",
          "id",
          "label",
          // 3.2 §4. `movable` is the second flag rather than a second meaning
          // for `removable`, and it is listed here for the same reason the
          // rest are: the assertion is that this is the WHOLE of what crosses
          // the seam, so a field added without an argument fails a test.
          "movable",
          // 3.8 patch 7, and it is the field this assertion was written to
          // make somebody argue for. It is here because the alternative was
          // worse in the specific way §2 forbids: the editor needed to draw a
          // control for a section whose target only the reader can choose, and
          // every other way of learning that a section HAS a choice — asking
          // the catalogue, testing the id, branching on the surface — is the
          // editor learning what it is looking at.
          //
          // WHAT KEEPS IT HONEST is that nothing in it means anything here. A
          // `SectionQuestion` is a key, a phrase and a list of pairs; the
          // editor puts the answer under the key and hands it back. That is
          // the same contract `SectionChoice.options` has one layer down, and
          // the test below it is the one that enforces it.
          //
          // ONLY ON A SECTION THAT ASKS SOMETHING. Present-and-undefined on
          // every row would defeat this assertion by making the new key
          // universal, so `viewOf` omits it — which is why the expected set is
          // built rather than written out.
          ...(s.questions ? ["questions"] : []),
          "removable",
        ].sort());
      }
    }
  });

  it("and every section that asks is one somebody decided should", () => {
    // THE `ownsRegion` RULE, APPLIED TO THE OTHER FIELD 3.8 ADDED. That one is
    // pinned to an exempt list of exactly ["bridge"] on the argument that a
    // second section answering false is a decision to make out loud rather
    // than discover. A question is the same shape of exception and deserves
    // the same treatment: almost every section's directive can be written
    // without asking anybody anything, and that is the healthy state.
    //
    // A second one is not forbidden — it is required to be deliberate, and
    // 3.15 is where six more were decided on. The list is written out rather
    // than counted for the reason it always was: a row that starts asking
    // something nobody intended is a row that can stop being addable, and this
    // is where that shows up.
    //
    // THE SIX ARE THE FOLDER-SCOPED DIRECTIVES, which is the whole of the
    // release: `tag-index`, `tasks-table`, `journal-search` and `review-queue`,
    // across the surfaces that carry them. The homepage's Tags is a seventh and
    // is not here because `surfaces()` covers the three catalogue types this
    // interface was extracted for.
    //
    // AND THE DIFFERENCE BETWEEN THE TWO KINDS IS WHY THE LIST GREW SAFELY. The
    // bridge's question is a `choice` and is REQUIRED — no answer, no section.
    // The six are `folder` questions, whose empty state is a working directive,
    // so none of them can make a row unaddable. `questionIsRequired` is where
    // that is stated.
    const asking = surfaces().flatMap(({ name, model }) =>
      model
        .sections()
        .filter((s) => s.questions?.length)
        .map((s) => `${name}/${s.id}`)
    );
    // THREE MORE IN 3.18 (§3), AND THEY ARE A THIRD KIND. `path` and
    // `resources` have honoured a `label` override since the override existed
    // and nothing ever drew a control for one, so the answer could only come
    // from a preset written in code. These are `title` questions: free text,
    // never required, empty meaning the catalogue's own heading — so like the
    // six folder questions and unlike the bridge's choice, none of them can
    // make a row unaddable.
    //
    // `children` DECLARES ONE AND IS NOT LISTED, which is the interesting case
    // rather than an omission. It asks for a title only where it HAS one — above
    // the deepest level, where it is a single folder rollup. The journal index
    // this test builds is the deepest one, where the section emits a header per
    // note kind and "the title" is not a thing it has; those are named per kind
    // through `fields` instead (§3.2).
    expect(asking).toEqual([
      "journal index/find",
      "journal index/review",
      "journal index/tasks",
      "journal index/tags",
      "journal index/path",
      "journal index/resources",
      "journal leaf/resources",
      "diary dashboard/open-tasks",
      "diary dashboard/tags",
      "diary entry/bridge",
    ]);

    const required = surfaces().flatMap(({ name, model }) =>
      model
        .sections()
        .filter((s) => (s.questions ?? []).some(questionIsRequired))
        .map((s) => `${name}/${s.id}`)
    );
    expect(required).toEqual(["diary entry/bridge"]);
  });

  it("and the interface exposes no method that would answer it", () => {
    for (const { name, model } of surfaces()) {
      expect(Object.keys(model).sort(), name).toEqual([
        "addable",
        "apply",
        "plan",
        "present",
        "refusal",
        "sections",
      ]);
    }
  });

  it("and the modal never names a catalogue or a grain", () => {
    // The check that would catch the branch coming back. The editor may import
    // the interface; it may not import a catalogue, and it may not test for a
    // surface it is supposedly agnostic about.
    const editor = readCode("section-editor");
    for (const banned of [
      "journal-sections",
      "diary-sections",
      "entry-sections",
      "journal-plan",
      "TrackerClass",
      "SectionContext",
      "grain",
    ]) {
      expect(editor, banned).not.toContain(banned);
    }
  });
});

// ── the one thing the surfaces genuinely differ about ─────────────────

describe("bands are data, not a branch", () => {
  it("is one band on a journal note, which has no structural half", () => {
    for (const { name, model } of surfaces().filter((s) =>
      s.name.startsWith("journal")
    )) {
      for (const s of model.sections()) expect(s.group, `${name}/${s.id}`).toBeNull();
    }
  });

  it("is two on a diary entry, because a section may not cross the rule", () => {
    const model = entrySectionModel({ grain: "daily" });
    const groups = new Set(model.sections().map((s) => s.group));
    // STILL TWO AFTER 4.10, which is the scope boundary asserted from the model
    // rather than from the markdown: an entry gained no page head, so it gained
    // no band. See masthead.test.ts for the same boundary in the composed note.
    expect(groups.size).toBe(2);
    expect([...groups].every((g) => typeof g === "string")).toBe(true);
  });

  it("and three on a dashboard now that it has a head and a masthead", () => {
    // 3.2 patch 3, then 4.10. The interface did not change to accommodate
    // either — `group` has carried the answer since 3.0 and a dashboard simply
    // used to answer null. That is the point of expressing the rule as data the
    // model supplies rather than as a check the editor performs: a surface can
    // grow a band without the editor learning it exists, and has now done so
    // twice.
    const model = diarySectionModel({ grain: "monthly" });
    const groups = new Set(model.sections().map((s) => s.group));
    expect(groups.size).toBe(3);
    expect([...groups].every((g) => typeof g === "string")).toBe(true);
  });

  it("so the editor's reordering rule is one sentence about groups", () => {
    // Not "if this is an entry, then". The rule the editor implements is that
    // two rows may swap when their groups match, which is a no-op on the two
    // surfaces with a single band and the whole of the constraint on the one
    // with two.
    const editor = readSrc("section-editor");
    expect(editor).toContain("group");
  });
});

// ── 3.2 §4: holdPinned ────────────────────────────────────────────────
//
// The whole of the pin's file-side behaviour is this function, and it is worth
// testing directly rather than only through the two catalogues: the catalogues
// each have exactly one pinned section sitting at index 0, which is the case
// where nearly any implementation looks right.

describe("holdPinned keeps a fixed section where the file has it", () => {
  const fixed = (id: string): boolean => id === "nav";

  it("is the identity when nothing is fixed", () => {
    const want = ["c", "a", "b"];
    expect(holdPinned(["a", "b", "c"], want, () => false)).toBe(want);
  });

  it("holds index 0 against a full reversal", () => {
    expect(
      holdPinned(["nav", "a", "b"], ["b", "a", "nav"], fixed)
    ).toEqual(["nav", "b", "a"]);
  });

  it("holds a middle index, rather than pulling it to the front", () => {
    // THE CASE THE CATALOGUES CANNOT EXERCISE. Both pin a section that already
    // sits first, so an implementation that forced index 0 would pass every
    // test above this one and quietly rearrange the first reader who had moved
    // their navigation.
    expect(
      holdPinned(["a", "nav", "b"], ["b", "a", "nav"], fixed)
    ).toEqual(["b", "nav", "a"]);
  });

  it("ignores a fixed section the reader asked to remove", () => {
    // Absent from `want` is a removal request, which belongs to the refusal.
    // Re-inserting it here would turn a refused removal into a move to
    // wherever it landed — an op on the one section not allowed to have any.
    expect(holdPinned(["nav", "a", "b"], ["b", "a"], fixed)).toEqual(["b", "a"]);
  });

  it("ignores a fixed section that is being added", () => {
    // Nothing to hold: a section not in the file has no index to keep, so it
    // takes the one `want` gives it.
    expect(holdPinned(["a", "b"], ["a", "nav", "b"], fixed)).toEqual([
      "a",
      "nav",
      "b",
    ]);
  });

  it("does not let two fixed sections cross each other", () => {
    const two = (id: string): boolean => id === "nav" || id === "foot";
    expect(
      holdPinned(["nav", "a", "foot"], ["foot", "a", "nav"], two)
    ).toEqual(["nav", "a", "foot"]);
  });
});

// ── one argument, two answers (4.16 §2) ───────────────────────────────

describe("a compound argument, split and joined", () => {
  it("splits head from tail, and the tail keeps its separators", () => {
    // THE LAST PIECE TAKES THE REMAINDER, which is the whole reason this is not
    // `String.split`: `study/Maths/Algebra` is a journal and a nested folder, not
    // three pieces two of which nobody asked for.
    expect(partsOf("study/Maths/Algebra", 2, "/")).toEqual([
      "study",
      "Maths/Algebra",
    ]);
    expect(partsOf("study", 2, "/")).toEqual(["study", ""]);
    expect(partsOf("", 2, "/")).toEqual(["", ""]);
    // One piece is the whole argument, which is every other question there is.
    expect(partsOf("study/Maths", 1, "/")).toEqual(["study/Maths"]);
  });

  it("joins without a trailing separator, because that reads as a lost answer", () => {
    // `level-index:study/` says a folder was named and went missing. `study` is
    // what "this journal, no folder" spells and what a reader would type.
    expect(joinParts(["study", ""], "/")).toBe("study");
    expect(joinParts(["study", "   "], "/")).toBe("study");
    expect(joinParts(["study", "Maths"], "/")).toBe("study/Maths");
    expect(joinParts(["", ""], "/")).toBe("");
    // An empty HEAD is kept, because it is a position rather than an absence —
    // dropping it would silently promote the folder into the journal's slot.
    expect(joinParts(["", "Maths"], "/")).toBe("/Maths");
  });

  it("round-trips whatever it wrote", () => {
    for (const pair of [
      ["study", "Maths"],
      ["study", "Maths/Algebra"],
      ["study", ""],
    ]) {
      expect(partsOf(joinParts(pair, "/"), 2, "/")).toEqual(
        pair[1] ? pair : [pair[0], ""]
      );
    }
  });
});
