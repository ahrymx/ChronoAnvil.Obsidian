// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";

import { studyFile } from "./study-template";
import {
  RecallPair,
  confidenceFor,
  describeSession,
  newPair,
  normalizeRecallText,
  owningNotePath,
  parseRecall,
  parseRecallLine,
  serializeRecall,
  serializeRecallLine,
  tally,
} from "../src/review/recall";
import { parseTasks } from "../src/ui/tasks";
import { allNoteRegions, writeNoteRegion } from "../src/core/notestore";
import { reviewIntervalDays } from "../src/review/review";

import { readSrc } from "./sources";
const asset = studyFile;

describe("the recall line format", () => {
  it("splits a pair on the spaced separator", () => {
    expect(parseRecallLine("What is a closure? :: A function plus its scope"))
      .toEqual({
        question: "What is a closure?",
        answer: "A function plus its scope",
      });
  });

  it("leaves an unspaced :: alone", () => {
    // The whole reason the separator is spaced. `std::vector` and `Array::map`
    // are ordinary things to be quizzed on, and splitting them mid-token would
    // make the format unusable for exactly the subjects most likely to use it.
    expect(parseRecallLine("What does std::vector own? :: Its elements"))
      .toEqual({
        question: "What does std::vector own?",
        answer: "Its elements",
      });
  });

  it("treats a line with no separator as a question awaiting an answer", () => {
    // Hand-editability: writing the questions first and filling answers in
    // later is a normal way to build a deck, and a stricter parse would
    // silently drop every half-written line.
    expect(parseRecallLine("Why is the sky blue?")).toEqual({
      question: "Why is the sky blue?",
      answer: "",
    });
  });

  it("skips blank lines", () => {
    expect(parseRecallLine("   ")).toBeNull();
    expect(parseRecall("a :: b\n\n   \nc :: d")).toHaveLength(2);
  });

  it("omits the separator when there is no answer yet", () => {
    expect(serializeRecallLine({ question: "Q", answer: "" })).toBe("Q");
  });

  it("round-trips a pair whose question contains the separator", () => {
    const pair: RecallPair = {
      question: "What does a :: b mean in Haskell?",
      answer: "A type annotation",
    };
    const round = parseRecallLine(serializeRecallLine(pair));
    expect(round).toEqual(pair);
  });

  it("keeps the escape invisible to the split", () => {
    // The escaped form must not itself contain the separator, or the plain
    // indexOf in the parser would find it and split in the wrong place.
    const line = serializeRecallLine({ question: "a :: b", answer: "c" });
    expect(line.indexOf(" :: ")).toBe(line.lastIndexOf(" :: "));
  });

  it("flattens a pasted newline rather than splitting the pair", () => {
    const pair = newPair("Line one\nline two", "an\nanswer");
    expect(pair.question).toBe("Line one line two");
    expect(serializeRecall([pair]).split("\n")).toHaveLength(1);
  });

  it("round-trips a whole region", () => {
    const pairs = [newPair("Q1", "A1"), newPair("Q2", "A2"), newPair("Q3", "")];
    expect(parseRecall(serializeRecall(pairs))).toEqual(pairs);
  });

  it("drops a pair with no question", () => {
    // An answer with nothing to answer is not a card; keeping it would render
    // as a blank prompt with a reveal button under it.
    expect(serializeRecall([{ question: "", answer: "orphan" }])).toBe("");
  });

  it("normalizes whitespace runs", () => {
    expect(normalizeRecallText("  a \t b \n c  ")).toBe("a b c");
    expect(normalizeRecallText("   ")).toBe("");
  });
});

describe("recall regions are inert to the task machinery", () => {
  // notestore.ts::allNoteRegions is directive-agnostic — it yields every
  // `<!--chronoanvil:KEY-->` region whichever widget wrote it, and both
  // countChronoAnvilTasks and the tasks-table's row parser run parseTasks over all
  // of them. A new region type that happened to look task-shaped would quietly
  // inflate every task count in the vault.
  it("does not count cards as tasks", () => {
    const text = writeNoteRegion(
      "# Lesson\n",
      "recall",
      serializeRecall([newPair("Is this a task?", "No")])
    );
    const regions = allNoteRegions(text);
    expect(regions).toHaveLength(1);
    expect(parseTasks(regions[0].content)).toEqual([]);
  });
});

describe("what a sitting earns", () => {
  it("counts only the cards that were graded", () => {
    expect(tally(["got", null, "missed", null], 4)).toEqual({
      got: 1,
      graded: 2,
      total: 4,
    });
  });

  it("maps a clean sweep to the longest interval", () => {
    expect(confidenceFor(tally(["got", "got", "got", "got"]))).toBe(5);
  });

  it("maps a total blank to the shortest", () => {
    expect(confidenceFor(tally(["missed", "missed"]))).toBe(1);
  });

  it("puts half right in the middle", () => {
    expect(confidenceFor(tally(["got", "missed"]))).toBe(3);
  });

  it("stays inside the 1–5 scale the built-in uses", () => {
    for (let total = 1; total <= 12; total++) {
      for (let got = 0; got <= total; got++) {
        const c = confidenceFor({ got, graded: total, total })!;
        expect(c).toBeGreaterThanOrEqual(1);
        expect(c).toBeLessThanOrEqual(5);
        expect(Number.isInteger(c)).toBe(true);
      }
    }
  });

  it("writes nothing when nothing was graded", () => {
    // No evidence is not evidence of nothing — and review.ts already falls to
    // the shortest interval for an absent rating, so the schedule is right
    // either way without a value being invented here.
    expect(confidenceFor(tally([null, null], 2))).toBeNull();
  });

  it("produces a rating every interval in review.ts recognises", () => {
    // The two tables have to agree: a confidence this can produce but
    // reviewIntervalDays doesn't know would silently schedule for tomorrow.
    const produced = new Set<number>();
    for (let got = 0; got <= 4; got++) {
      produced.add(confidenceFor({ got, graded: 4, total: 4 })!);
    }
    expect([...produced].sort()).toEqual([1, 2, 3, 4, 5]);
    const days = [...produced].map((c) => reviewIntervalDays(c));
    expect(days).toEqual([1, 3, 7, 14, 30]);
  });

  it("does not ratchet — a bad sitting can lower the rating", () => {
    // Confidence is a reading of how well it stuck *this time*. A rating that
    // only ever rose would make the trend a picture of how long you have owned
    // the note.
    expect(confidenceFor(tally(["got"]))).toBe(5);
    expect(confidenceFor(tally(["got", "missed", "missed", "missed"]))).toBe(2);
  });

  it("says how many are left mid-sitting", () => {
    expect(describeSession(tally(["got", null, null], 3))).toContain("2 to go");
    expect(describeSession(tally(["got", "got"], 2))).not.toContain("to go");
  });

  it("states the card count before anything is graded", () => {
    expect(describeSession(tally([null], 1))).toBe("1 card");
    expect(describeSession(tally([null, null], 2))).toBe("2 cards");
  });
});

describe("where a grade is written", () => {
  it("writes to the note itself when the host is not a page", () => {
    // An unpromoted lesson. This is the case the folder-note test alone gets
    // wrong: it is not a folder note either, so "go up to the folder note"
    // would send its grades to the Topic index.
    expect(
      owningNotePath("03 - Journals/Maths/Algebra/Quadratics.md", false)
    ).toBe("03 - Journals/Maths/Algebra/Quadratics.md");
  });

  it("writes to the promoted lesson when the host is a page", () => {
    expect(
      owningNotePath(
        "03 - Journals/Maths/Algebra/Quadratics/Worked examples.md",
        true
      )
    ).toBe("03 - Journals/Maths/Algebra/Quadratics/Quadratics.md");
  });

  it("leaves a promoted lesson's own block pointing at itself", () => {
    // The folder note is not a page, so it never resolves upward — otherwise
    // its grades would climb to the Topic index.
    expect(
      owningNotePath(
        "03 - Journals/Maths/Algebra/Quadratics/Quadratics.md",
        false
      )
    ).toBe("03 - Journals/Maths/Algebra/Quadratics/Quadratics.md");
  });

  it("copes with a note at the vault root", () => {
    expect(owningNotePath("Loose.md", true)).toBe("Loose.md");
  });
});

describe("recall widget registration", () => {
  const widgets = readSrc("widgets");

  it("is registered as a composite kind", () => {
    // A non-composite widget is appended into a `.ca-journal-widget-bar`, which is
    // a wrap-flex row meant for buttons and pickers. A full-width card stack
    // dropped in there lays out as an inline pill.
    const block = widgets.slice(
      widgets.indexOf("const INLINE_KINDS"),
      widgets.indexOf("]", widgets.indexOf("const INLINE_KINDS"))
    );
    // Inverted in 2.56.25 — absence from INLINE_KINDS is what makes a kind
    // full-width. See the comment on that set for why the exception list is
    // the safer thing to maintain.
    expect(block).not.toContain('"recall"');
  });

  it("is dispatched from the directive switch", () => {
    expect(widgets).toContain('case "recall":');
    // Either call form: `this.buildRecall(...)` while it sat on the class, or
    // `buildRecall(this, ...)` now that it lives in ./recall-widgets.ts.
    expect(widgets).toMatch(/buildRecall\((?:this, )?rest, ctx, label\)/);
  });

  it("builds a surface card with a collapsible header bar", () => {
    const recallSrc = readSrc("recall-widgets");
    expect(recallSrc).toContain("ca-journal-recall ca-journal-note--collapsible");
    expect(recallSrc).toContain("ca-journal-recall-head ca-journal-note-collapse-bar");
    expect(recallSrc).toContain("ca-journal-recall-title-left");
    expect(recallSrc).toContain("ca-journal-note-chevron ca-journal-recall-chevron");
    expect(recallSrc).toContain("ca-journal-note-label ca-journal-recall-label");
    expect(recallSrc).toContain("noteFoldState");
    expect(recallSrc).toContain("setNoteFold");
  });

  it("resolves both properties through the registry", () => {
    // Not spelled into a fifth place: `confidenceProperty` and
    // `reviewProperties` already resolve these from the tracker registry, so a
    // relabelled built-in must not leave this writing a dead key.
    // writeRecallGrade moved out of the class in 2.56.25, so it is an exported
    // function taking the host rather than a private method reading `this`.
    // Sliced by name so the bound survives the next move too.
    const fn = widgets.slice(
      widgets.indexOf("function writeRecallGrade"),
      widgets.indexOf("function recallTarget")
    );
    expect(fn).toContain("reviewProperties(deps.plugin)");
    expect(fn).not.toMatch(/fm\["confidence"\]/);
    expect(fn).not.toMatch(/fm\["reviewed"\]/);
  });

  it("stamps the review date in the same transaction as the rating", () => {
    // A note stamped reviewed without its new rating would be rescheduled off
    // the old one.
    // writeRecallGrade moved out of the class in 2.56.25, so it is an exported
    // function taking the host rather than a private method reading `this`.
    // Sliced by name so the bound survives the next move too.
    const fn = widgets.slice(
      widgets.indexOf("function writeRecallGrade"),
      widgets.indexOf("function recallTarget")
    );
    expect(fn.match(/processFrontMatter/g)).toHaveLength(1);
    expect(fn).toContain("props.confidence");
    expect(fn).toContain("props.reviewed");
  });
});

describe("the shipped templates", () => {
  it("gives the Lesson template a Recall section", () => {
    const t = asset("template-lesson.md");
    expect(t).toContain("recall:recall");
    expect(t).toContain("<!--chronoanvil:recall");
  });

  it("gives the Page template one too", () => {
    // The branch that only exists because pages exist: a page carries no
    // Confidence, so its cards grade the lesson it belongs to.
    const t = asset("template-page.md");
    expect(t).toContain("recall:recall");
    expect(t).toContain("<!--chronoanvil:recall");
  });

  it("still gives a page no rating of its own", () => {
    // Carrying a recall block must not have quietly turned a page into a unit
    // of review — that would put it back in the queue and the average.
    const t = asset("template-page.md");
    expect(t).not.toMatch(/^confidence:/m);
    expect(t).not.toMatch(/^status:/m);
    expect(t).not.toContain("tracker:confidence");
  });

  it("keeps Recall off the Practice template", () => {
    // Practice notes carry no Confidence — they are exercises, not material to
    // be tested on — so a grading widget there would have nowhere to write.
    expect(asset("template-practice.md")).not.toContain("recall:");
  });
});
