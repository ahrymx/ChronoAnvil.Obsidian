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
  SECTION_FORM,
  WIDGET_FORM,
  answerInText,
  formAt,
  formOf,
  formQuestion,
  withAnswers,
} from "../src/core/section-model";
import { SECTION_CATEGORIES, categoryRank } from "../src/core/sections";
import { isPageWidgetId } from "../src/core/widget-sections";
import type { FormQuestion, SectionModel } from "../src/core/section-model";

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

  // ── EVERY ROW HAS A SUBJECT, INCLUDING THE WIDGET TAIL (5.27) ──────────
  //
  // THE TEXT IS PASSED HERE AND NOT ABOVE, deliberately. `sections()` with no
  // text lists no widgets — the rule 5.26 spread to all four surfaces — so the
  // catalogue-only list is the case above and this is the list a reader
  // actually opens the add prompt onto, tail included. A widget arrives through
  // `widgetSection`/`asDiary`/`asJournal`/`entryWidgetSection`, four builders
  // that each forward the registry's answer, and this is what says all four do.
  it("gives every row on every surface one of the seven subjects", () => {
    const known = new Set(SECTION_CATEGORIES.map((c) => c.id));
    for (const { name, model, text } of surfaces()) {
      const all = model.sections(text);
      expect(all.some((s) => isPageWidgetId(s.id)), name).toBe(true);
      for (const s of all) {
        expect(known.has(s.category), `${name}/${s.id}`).toBe(true);
      }
    }
  });

  // THE HEADINGS THE ADD PROMPT WOULD DRAW, on the real surfaces.
  //
  // `DetailedChoice.group` draws a heading where the value CHANGES and never
  // sorts, so "grouped correctly" means "the sorted list has each subject in
  // exactly one run". Asserted here rather than only in the editor's own file
  // because the property belongs to the DATA — a surface whose catalogue and
  // whose widget tail disagreed about a subject would break it, and neither
  // half is the window's.
  it("sorts into one run per subject, in the table's order", () => {
    for (const { name, model, text } of surfaces()) {
      const ranked = [...model.sections(text)]
        .sort((a, b) => categoryRank(a.category) - categoryRank(b.category))
        .map((s) => s.category);
      const runs = ranked.filter((c, i) => i === 0 || ranked[i - 1] !== c);
      expect(new Set(runs).size, name).toBe(runs.length);
      expect(runs, name).toEqual(
        SECTION_CATEGORIES.map((c) => c.id).filter((id) => runs.includes(id))
      );
      // A surface with one subject would make the assertion above vacuous.
      expect(runs.length, name).toBeGreaterThan(1);
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
          // ── WHAT A REFUSAL OWES, RESTATED (4.21) ──────────────────
          //
          // This asserted that every refusal NAMES THE SECTION, on the rule
          // that "a refusal which only says no sends someone looking for a
          // setting that does not exist". The rule is right and naming the
          // section was the wrong way to satisfy it — the refusal is drawn as
          // the row's subtitle, directly under the row's own title, so it
          // repeated the word immediately above it. And it opened the sentence
          // with a label of unknown number, which is how the tracker section
          // came to say *"Trackers is part of every entry"*.
          //
          // WHAT IS ASSERTED INSTEAD is the property that rule was for: a
          // refusal says what the section is part of, and says what cannot be
          // done — so it is a reason rather than a no.
          // WHAT IT IS, then what that costs, then — where there is one — the
          // thing the reader can still do. The third shape is the journal
          // catalogue's "Written as ordinary markdown", which names the fix
          // instead of an alternative because there is no control that can do
          // it: that is still a reason rather than a no.
          expect(why, `${name}/${s.id}`).toMatch(/^(Part of|Holds|Written as)/);
          expect(why, `${name}/${s.id}`).toMatch(
            /can't be removed|Remove .* first|delete it by hand/
          );
          // And it does not open by repeating the row's own title.
          expect(why.startsWith(s.label), `${name}/${s.id}`).toBe(false);
        }
      }
    }
  });

  it("reads as a sentence whatever the section is called (4.21)", () => {
    // ── THE DEFECT, NAMED ─────────────────────────────────────────────
    //
    // 4.20 added a section labelled "Trackers", and the window rendered
    // *"Trackers is part of every entry and cannot be removed."* Every refusal
    // opened with `${section.label}` followed by a singular verb, so the first
    // plural label to arrive broke the sentence. Nothing caught it because the
    // suite asserted the label was PRESENT — which it was.
    //
    // ASSERTED AGAINST A HOSTILE LABEL rather than against today's catalogue,
    // because the catalogue is what changes. A refusal that cannot be broken by
    // renaming a section is a refusal that does not depend on the name.
    for (const { name, model, text } of surfaces()) {
      for (const s of model.sections()) {
        const why = model.refusal(s.id, text);
        if (why === null) continue;
        // No copy of the label anywhere in it, so no verb can disagree with it.
        expect(why.includes(s.label), `${name}/${s.id}`).toBe(false);
        // And it is a sentence: opens capitalised, ends stopped.
        expect(why[0], `${name}/${s.id}`).toBe(why[0].toUpperCase());
        expect(why.trim().endsWith("."), `${name}/${s.id}`).toBe(true);
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
          // 5.27, and the second field this assertion made somebody argue for.
          //
          // 4.12 §C REFUSED IT, twice in writing: *"The alternative was a
          // `family` field on `SectionView` that three of the four models would
          // never set, existing so that one `<select>` could group its
          // options."* Both halves stopped being true in 5.26 — all four models
          // offer page widgets now, and the control is a suggester over thirty
          // rows rather than a picker over three.
          //
          // AND IT IS THE ONE ADDITION HERE THAT TAKES SOMETHING AWAY. The
          // editor used to import `isPageWidgetId` and test ids to cut its add
          // list in two, which is §2's forbidden move — the window asking what
          // it is looking at — conceded as such in a comment and kept only
          // because nothing else was available. This field is the something
          // else: the catalogue SAYS the subject, and `section-editor.ts` now
          // imports nothing from `widget-sections.ts` at all. A field that
          // deletes a departure is not a new one.
          "category",
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
    // A FOURTH KIND ARRIVED IN 4.46 AND LEFT AGAIN IN 4.48, and the round trip
    // is worth the four lines. `stats` asked which numbers to band — the first
    // optional `choice` in the plugin, four of them by 4.47 — and the row drew
    // four `<select>` boxes over a section whose body is a row of four cells.
    // **The control is on the cell now**, so this list is one shorter than it
    // was and the questions live in `stats-band.ts` for the band's own menu to
    // write through. `emptyLabel` and the corrected `questionIsRequired` stay:
    // they are the shared model's, and `folder` and `title` questions use them.
    // AND FIVE MORE ROWS ON THE JOURNAL SURFACES IN 5.11, WHICH ARE DERIVED
    // RATHER THAN DECLARED. `questionsOf` asks each journal section what it
    // renders and adds the `form` toggle to every one that is a single fence
    // titled by its own bar with nothing anchored INTO that bar. Eight sections
    // qualify — `trackers`, `stats`, `find`, `review`, `tasks`, `progress`,
    // `tally` and `tags` — so those can be drawn as widgets; `children`, `pages`
    // and `charts` cannot, because each hosts its Add control IN the bar and
    // that control has nowhere to go once the bar does, and `banner` composes
    // no bar at all.
    //
    // `trackers` IS THE ONE THE RULE WAS RESTATED FOR. It was out while the
    // rule also refused a fence owning a managed region; the reader's rule is
    // the action row and nothing else, and the grid's "+ Add tracker" is a TILE
    // IN THE GRID rather than a button in the bar, so it travels with the
    // widget wherever the widget goes.
    //
    // ONLY FIVE OF THE EIGHT ARE NEW ROWS HERE. `find`, `review`, `tasks` and
    // `tags` already asked a `folder` question, so they were on this list
    // before the toggle existed and gained a second question rather than a
    // first.
    //
    // THE LIST IS STILL EXACT, and it is the reason this test earns its keep
    // twice over now: a derivation that quietly widened would show up here as a
    // section that started asking, and one that quietly narrowed as a section
    // that stopped.
    //
    // TWO ROWS LEFT IT IN 5.18 AND CAME BACK IN 5.21, AND THE ROUND TRIP IS
    // THE ARGUMENT. The journal index this test builds is the DEEPEST one,
    // where the tracker grid and the stats band are the two pages of one group,
    // so neither composes a bar. 5.18 read that as "no bar to report, no toggle
    // to offer", and wrote the rule out: *a cell of a row is already a widget,
    // and the control for it is the group card's Ungroup rather than a form
    // toggle on a section that is not one.*
    //
    // THAT IS TRUE WHILE THE SECTION IS A CELL AND FALSE ONE GESTURE LATER.
    // Ungroup hands the cell its solo title — `undoRowOfOne` and the cut path
    // both do — and `widgetFormBar` was asking what the section RENDERS on this
    // surface, which is still barless. So the reader ended with a titled
    // section and no control anywhere to take the title off: the bar arrived by
    // a gesture and could not leave by one. 5.21 reports `soloBarOf` where the
    // render composes nothing, which is the same line by the same name, and the
    // three rows that were cells — these two and `journal index/tasks`, which
    // was reported by its `folder` question all along — can now answer for it.
    //
    // AND THE EDITOR SAYS IT OF THE CELLS THAT FOLLOW THE OPENER (5.21).
    // `renderFormQuestion` draws the box checked and disabled for those, so the
    // toggle describes the state rather than offering to change it, and Ungroup
    // is still the control that does. The OPENER's box is a different question
    // wearing the same field — its bar is the group's own title — so it is not
    // drawn on the row at all and appears on the card as **Title header**.
    expect(asking).toEqual([
      "journal index/trackers",
      "journal index/stats",
      "journal index/find",
      "journal index/review",
      "journal index/tasks",
      "journal index/progress",
      "journal index/tally",
      "journal index/tags",
      "journal index/path",
      "journal index/resources",
      "journal leaf/trackers",
      "journal leaf/resources",
      // A SIXTH KIND IN 5.6, AND THE FIRST WHOSE ANSWER IS NOT A DIRECTIVE'S
      // ARGUMENT AT ALL. `lines` asks for the note's opening headings, which
      // are plain `## ` markdown between two invisible markers, so the read is
      // `skeletonTitles` and the write is the journal planner's rewrite of that
      // span. It is on this list because the model hands the answer over —
      // `SectionView.answered` — and off the `answerInText` path because there
      // is no directive to put it in. A note written before 5.6 has no markers,
      // supplies no answer, and draws no box.
      "journal leaf/headings",
      // A FIFTH KIND IN 4.59.0, AND IT IS THE FIRST THAT IS NOT ABOUT A
      // DIRECTIVE'S ARGUMENT. `form` asks how the section is DRAWN — with its
      // own foldable bar, or bare so it can be a column of a row group, which
      // `isSectionFence` refuses a self-titling fence for. Like `folder` and
      // `title` and unlike the bridge's `choice` it is never required: unanswered
      // is the bar, which is what every dashboard already holds.
      "diary dashboard/summary",
      // 4.70: the rollup opens the body row and so owns the one `header:` that
      // row gets, which is a `FormQuestion` — the same bar toggle `summary` has
      // carried since 4.59.
      "diary dashboard/entry-rollup",
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
    // THE SIX ARE REQUIRED; THE REST OF THE INTERFACE IS OPTIONAL AND DECLARED.
    // This asserted the six EXACTLY until 4.58.0, which is the release that gave
    // a dashboard repeating widgets and therefore `instanceOf`. An exact list was
    // the right shape while every model here implemented only the required half
    // and would have been the wrong shape the day one of them grew a `blocks`.
    //
    // WHAT IS STILL PINNED IS THE WHOLE OF THE POINT: every model answers the six,
    // and nothing any model exposes is outside the interface. A method that says
    // which surface this is would fail the second assertion, which is what this
    // test was written to catch.
    const required = [
      "addable",
      "apply",
      "plan",
      "present",
      "refusal",
      "sections",
    ];
    const optional = ["blocks", "instanceOf", "regroup"];
    for (const { name, model } of surfaces()) {
      const keys = Object.keys(model).sort();
      // Every one of the six, on every surface.
      expect(keys.filter((k) => required.includes(k)), name).toEqual(required);
      // And nothing outside the interface. This is the half that would catch a
      // model growing a method the editor could ask "which surface is this".
      expect(
        keys.filter((k) => !required.includes(k) && !optional.includes(k)),
        name
      ).toEqual([]);
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

  it("is three on a diary entry, because a section may not cross the rule", () => {
    const model = entrySectionModel({ grain: "daily" });
    const groups = new Set(model.sections().map((s) => s.group));
    // TWO UNTIL 4.20, WHEN THE GRID GOT A BAND OF ITS OWN. The rule is unchanged
    // — a section may not cross the rule — and there is now a third band ABOVE
    // it, because the trackers left the banner and a band is what the editor
    // lets a row move within. One band for the two would let the grid be dragged
    // back into the card it was just taken out of.
    expect(groups.size).toBe(3);
    expect([...groups].every((g) => typeof g === "string")).toBe(true);
  });

  it("and two on a dashboard, which has a banner nothing may climb above", () => {
    // 3.2 patch 3, then 4.10, then 4.58.0 taking one back. The interface did not
    // change to accommodate any of the three — `group` has carried the answer
    // since 3.0 and a dashboard simply used to answer null. That is the point of
    // expressing the rule as data the model supplies rather than as a check the
    // editor performs: a surface can grow a band, and LOSE one, without the
    // editor learning either happened.
    const model = diarySectionModel({ grain: "monthly" });
    const groups = new Set(model.sections().map((s) => s.group));
    expect(groups.size).toBe(2);
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

describe("a section that can also be drawn as a widget", () => {
  // 4.59.0's `form` question, tested at the level it lives: the shared model.
  // The period summary is the first section to declare one and
  // `diary-sections.test.ts` covers it end to end; these are the rules any
  // catalogue that declares one gets.

  const q: FormQuestion = {
    kind: "form",
    key: "form",
    label: "how this is drawn",
    directive: "header",
    bar: "header:📅 This week",
    section: "A section of its own",
    widget: "As a widget",
  };
  const fence = (...body: string[]): string[] => ["```chronoanvil", ...body, "```"];

  it("is a section when it titles itself and a widget when it does not", () => {
    // ASKED OF THE FENCE, NOT OF THE ANSWER, which is what makes the read
    // survive a rename: a bar whose title the reader changed is still a bar.
    expect(formOf(["header:📅 This week", "week-summary"])).toBe(SECTION_FORM);
    expect(formOf(["header:🗓 Whatever they like", "week-summary"])).toBe(SECTION_FORM);
    expect(formOf(["week-summary", "button:new-week"])).toBe(WIDGET_FORM);
  });

  it("writes the bar in under the fence and takes it out again", () => {
    // UNDER THE FENCE, because a bar anchors the widgets that FOLLOW it — one
    // written lower would title nothing and pull the next line into its strip.
    const bare = fence("week-summary", "button:new-week");
    const titled = withAnswers(bare, [q], { form: SECTION_FORM });
    expect(titled).toEqual(fence("header:📅 This week", "week-summary", "button:new-week"));
    expect(withAnswers(titled, [q], { form: WIDGET_FORM })).toEqual(bare);
  });

  it("writes nothing when the fence is already in that form", () => {
    // The property the rename case depends on: re-answering "a section" on a
    // fence that already is one must not replace the reader's title with the
    // catalogue's.
    const theirs = fence("header:🗓 My own week", "week-summary");
    expect(withAnswers(theirs, [q], { form: SECTION_FORM })).toEqual(theirs);
  });

  it("is never required, because unanswered is the bar", () => {
    // `folder` and `title`'s posture, not the bridge's `choice`. Every note
    // written before this release holds the section form, so a row that withheld
    // itself until the reader answered would be asking about the status quo.
    expect(questionIsRequired(q)).toBe(false);
  });

  it("is not an argument of the directive it names", () => {
    // `header` is there so the editor knows the answer is WRITABLE. Reading it
    // as an argument is what put the token "section" into a bar's title in the
    // first cut of this release.
    expect(answerInText("```chronoanvil\nheader:📅 This week\nweek-summary\n```", q)).toBeNull();
  });

  it("reads back off whichever fence the directive is in", () => {
    // Two blocks, one titled and one not, so a walk that found the first bar in
    // the file rather than this fence's would answer for the wrong section.
    const text = [
      "```chronoanvil",
      "header:🏷️ Tags",
      "tag-index",
      "```",
      "",
      "```chronoanvil",
      "week-summary",
      "```",
    ].join("\n");
    const lines = text.split("\n");
    expect(formAt(lines, lines.indexOf("tag-index"))).toBe(SECTION_FORM);
    expect(formAt(lines, lines.indexOf("week-summary"))).toBe(WIDGET_FORM);
  });

  it("constructs a standard form question for headers and frames", () => {
    const headerQ = formQuestion("header:📝 Recap");
    expect(headerQ.kind).toBe("form");
    expect(headerQ.directive).toBe("header");
    expect(headerQ.bar).toBe("header:📝 Recap");

    const frameQ = formQuestion("frame: section");
    expect(frameQ.kind).toBe("form");
    expect(frameQ.directive).toBe("frame");
    expect(frameQ.bar).toBe("frame: section");
  });
});
