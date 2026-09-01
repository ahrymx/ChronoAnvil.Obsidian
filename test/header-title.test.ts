// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// 3.18 follow-ups §2: a title control that showed another section's title.
//
// THE DEFECT IS THE FIRST TEST IN THIS FILE and it is written as an assertion
// about Study's own Topic index rather than about a fixture, because a fixture
// could stop resembling the thing that broke. Six headers in one file is not a
// pathological case somebody constructed — it is what the plugin composes for
// the note the feature was demonstrated on.
//
// The rest divides in two, and the split is the point:
//
//   the SEAM must stop claiming an answer it cannot tell apart (`soleArgSpanIn`)
//   the BAR must be able to find its own line back (`headerTitleSpan`)
//
// The first is what makes the shipped control honest; the second is what makes
// the honest control unnecessary, because the rename moved to where the reader
// was already looking for it.

import { describe, expect, it } from "vitest";
import { studyTemplate } from "./study-template";
import { readCode, readCss, readSrc } from "./sources";
import {
  MODIFIER_KEYWORDS,
  argSpanIn,
  argSpansIn,
  readArg,
  soleArgSpanIn,
  spliceArg,
} from "../src/core/directive-grammar";
import {
  headerTitleRefusal,
  headerTitleSpan,
  retitledArgument,
} from "../src/ui/header-title";
import { sectionContext, sectionsFor } from "../src/journals/journal-sections";
import { STUDY_JOURNAL } from "../src/journals/journal";

const topicIndex = (): string[] => studyTemplate("topic-index.md").split("\n");

// The deepest Study index: the surface all three title questions land on.
const topicCtx = (): ReturnType<typeof sectionContext> =>
  sectionContext(STUDY_JOURNAL, { depth: 1 });

describe("the defect that shipped", () => {
  it("Study's Topic index carries more than one header", () => {
    // The premise. If this ever became 1 the rest of the file would still pass
    // while testing nothing, so it is asserted rather than assumed.
    const lines = topicIndex();
    const headers = argSpansIn(lines, "header");
    expect(headers.length).toBeGreaterThan(1);
  });

  it("argSpanIn reads the FIRST header, whichever section asked", () => {
    // Unchanged behaviour, pinned deliberately: `argSpanIn` is still first-match
    // and four other questions depend on that. The bug was never in this
    // function — it was in asking it a question it does not answer.
    const lines = topicIndex();
    const span = argSpanIn(lines, "header");
    expect(span).not.toBeNull();
    expect(readArg(lines, span!)).toBe("📊 Trackers");
  });

  it("soleArgSpanIn refuses rather than picking one of six", () => {
    expect(soleArgSpanIn(topicIndex(), "header")).toBeNull();
  });

  it("the section editor reads answers through the refusing one", () => {
    // The one-line fix, asserted where it lives. `argSpanIn` over the whole file
    // is precisely what produced a Task Manager box reading "🔁 Review".
    //
    // RE-ANCHORED IN 4.29, because the read moved. It was a private method on
    // the window; saving a page as a grain's default needs the same read, and
    // two spellings of "what does this file already say" would be two chances
    // to get this rule wrong. So the editor is now the caller and
    // `section-model.ts` holds the rule — and the claim is unchanged: the
    // editor must not reach past it to the ambiguous read, and the shared
    // function must be the refusing one.
    const editor = readCode("section-editor");
    expect(editor).toContain("answerInText(this.spec.text, q)");
    expect(editor).not.toMatch(/argSpanIn\(lines, q\.directive\)/);

    const model = readCode("section-model");
    // A THIRD ARGUMENT SINCE 4.70 and it is not a widening. `argSpansIn` cuts an
    // argument at a label bar, and a compound joined on `|` — `time-grid:|3` —
    // has no label to cut at; the join travels from the question that declares
    // it. The claim this case makes is about WHICH span function the shared read
    // uses, not about its arity, so the pattern allows the join and nothing
    // else.
    expect(model).toMatch(/soleArgSpanIn\(lines, q\.directive(, q\.part\?\.join)?\)/);
    // Lowercase `a` — `soleArgSpanIn` carries a capital, so this catches a
    // widening back to the whole-file read and nothing else.
    expect(model).not.toMatch(/[^A-Za-z]argSpanIn\(lines, q\.directive/);
  });
});

describe("the rule stated generally, not as a special case for titles", () => {
  it("still reads an answer when the note carries exactly one", () => {
    // THE HALF A BLANKET REFUSAL WOULD HAVE LOST. "Title questions are
    // unreadable" would also have been green against the test above, and would
    // have given up on every note where the answer is perfectly unambiguous.
    const lines = ["```chronoanvil", "header:📚 Resources", "attach:res|Docs", "```"];
    const span = soleArgSpanIn(lines, "header");
    expect(span).not.toBeNull();
    expect(readArg(lines, span!)).toBe("📚 Resources");
  });

  it("leaves every content directive exactly as it was", () => {
    // The four directives the mechanism was built for are unique per note, so
    // the narrowing is a no-op on all of them — which is what makes it safe to
    // apply at the seam rather than per question.
    for (const kw of ["tasks-table", "journal-search", "review-queue", "tag-index"]) {
      const lines = [`${kw}:03 - Journals`];
      expect(soleArgSpanIn(lines, kw)).toEqual(argSpanIn(lines, kw));
    }
  });

  it("argSpansIn and argSpanIn cannot disagree about the first span", () => {
    // They share a body rather than agreeing by inspection — the mistake
    // directive-grammar.ts exists to have stopped making.
    const lines = topicIndex();
    expect(argSpansIn(lines, "header")[0]).toEqual(argSpanIn(lines, "header"));
  });
});

describe("the editor now points at a control that exists", () => {
  it("every title question carries its own settled wording", () => {
    const ctx = topicCtx();
    const titles = sectionsFor(ctx)
      .flatMap((s) => s.questions?.(ctx) ?? [])
      .filter((q) => q.kind === "title");
    expect(titles.length).toBeGreaterThan(0);
    for (const q of titles) {
      expect(q.settled?.text).toBe("rename it on the note");
      expect(q.settled?.hint).toContain("header bar");
    }
  });

  it("does not send the reader off to delete the section instead", () => {
    // The standing fallback tells a reader to remove the section and add it
    // again. For Resources that is advice to destroy a region full of their
    // attachments in order to change one word.
    const ctx = topicCtx();
    const titles = sectionsFor(ctx)
      .flatMap((s) => s.questions?.(ctx) ?? [])
      .filter((q) => q.kind === "title");
    for (const q of titles) {
      expect(q.settled?.hint).not.toMatch(/add it again|Remove it/);
    }
  });

  it("keeps the old wording for every question that did not ask", () => {
    const src = readSrc("section-editor");
    expect(src).toContain('q.settled?.text ?? "set when added"');
  });
});

describe("a bar finding its own line back", () => {
  const lines = topicIndex();

  it("locates each header by position within its fence", () => {
    // Every titled header in the file, addressed by the fence it is in and its
    // index within that fence — the two facts the renderer has at draw time.
    const spans = argSpansIn(lines, "header");
    for (const span of spans) {
      const title = readArg(lines, span);
      const found = headerTitleSpan(lines, {
        bounds: { from: span.line, to: span.line },
        index: 0,
        title,
      });
      expect(found).toEqual(span);
    }
  });

  it("separates the two headers sharing one fence", () => {
    // The deepest index emits one header per note kind into a SINGLE fence, so
    // these two are the case that no whole-file rule can tell apart — and the
    // case §3.2 of the roadmap gave up on for exactly that reason.
    const lessons = lines.findIndex((l) => l.trim() === "header:📖 Lessons");
    const practice = lines.findIndex((l) => l.trim() === "header:🛠️ Practice");
    expect(lessons).toBeGreaterThan(-1);
    expect(practice).toBeGreaterThan(lessons);
    const bounds = { from: lessons, to: practice };

    expect(
      headerTitleSpan(lines, { bounds, index: 0, title: "📖 Lessons" })?.line
    ).toBe(lessons);
    expect(
      headerTitleSpan(lines, { bounds, index: 1, title: "🛠️ Practice" })?.line
    ).toBe(practice);
  });

  it("falls back to a unique title when the block cannot be located", () => {
    // An embed or an export: `getSectionInfo` returns null and position means
    // nothing, but a title appearing once still names one line.
    const span = headerTitleSpan(lines, {
      bounds: null,
      index: 0,
      title: "📚 Resources",
    });
    expect(span).not.toBeNull();
    expect(readArg(lines, span!)).toBe("📚 Resources");
  });

  it("refuses rather than renaming the wrong section", () => {
    // THE ONE OUTCOME THIS ITEM EXISTS TO PREVENT. Two sections sharing a name
    // and no bounds to tell them apart is exactly the ambiguity that produced
    // the shipped defect; the answer is null, not the first one.
    const twin = ["header:📚 Notes", "attach:a|A", "header:📚 Notes", "attach:b|B"];
    expect(
      headerTitleSpan(twin, { bounds: null, index: 0, title: "📚 Notes" })
    ).toBeNull();
    // With bounds it is answerable again, because position is back.
    expect(
      headerTitleSpan(twin, { bounds: { from: 2, to: 3 }, index: 0, title: "📚 Notes" })
        ?.line
    ).toBe(2);
  });

  it("refuses when the file no longer says what the bar is showing", () => {
    // The note was edited between render and click. Position alone would have
    // renamed whatever now sits at that index.
    expect(
      headerTitleSpan(lines, {
        bounds: { from: 0, to: lines.length - 1 },
        index: 0,
        title: "📚 Something Else",
      })
    ).toBeNull();
  });

  it("does not count untitled bars, which render no title", () => {
    // A bare `header:` anchors widgets under a real markdown heading. It draws
    // no title and is not renameable, so the renderer does not count it — and
    // neither does the locator, or the two would disagree about "the nth".
    const mixed = ["header:", "button:study:new-lesson", "header:📖 Lessons", "kind-table:lesson"];
    const span = headerTitleSpan(mixed, {
      bounds: { from: 0, to: 3 },
      index: 0,
      title: "📖 Lessons",
    });
    expect(span?.line).toBe(2);
  });
});

describe("what a rename must not disturb", () => {
  it("keeps a level prefix, which is not part of the title", () => {
    // `header:2:📚 Resources` — a naive splice of the typed text would move the
    // bar to level 1 and change what it folds.
    expect(retitledArgument("2:📚 Resources", "📚 Files")).toBe("2:📚 Files");
    expect(retitledArgument("📚 Resources", "📚 Files")).toBe("📚 Files");
  });

  it("leaves a trailing label alone", () => {
    // `|label` is outside the argument span already; this asserts the splice
    // actually behaves that way rather than that it ought to.
    const src = ["header:📚 Resources|Shown"];
    const span = argSpanIn(src, "header")!;
    expect(spliceArg(src, span, "📚 Files")[0]).toBe("header:📚 Files|Shown");
  });

  it("rewrites one line and nothing else in the file", () => {
    const before = topicIndex();
    const span = headerTitleSpan(before, {
      bounds: null,
      index: 0,
      title: "📚 Resources",
    })!;
    const after = spliceArg(before, span, "📚 Reading");
    expect(after.length).toBe(before.length);
    const differing = after
      .map((l, i) => (l === before[i] ? -1 : i))
      .filter((i) => i !== -1);
    expect(differing).toEqual([span.line]);
  });

  it("refuses a title the grammar would misread", () => {
    // A `|` is split off as a display label before any directive sees the
    // argument, so the reader would get a shorter title and a label they never
    // asked for. Refused with a reason rather than silently stripped.
    expect(headerTitleRefusal("📚 A|B")).toContain("|");
    expect(headerTitleRefusal("  ")).toContain("empty");
    expect(headerTitleRefusal("📚 Reading")).toBeNull();
  });

  it("carries the reader's fold across the rename", () => {
    // The fold key is `<notePath>::<title>`, so a rename that ignored it would
    // unfold a collapsed section and strand an entry in settings forever.
    const src = readSrc("header-title");
    expect(src).toContain("collapsedNoteSections");
    expect(src).toContain(`\${notePath}::\${next}`);
  });

  it("does not touch section identity, because headers never carried it", () => {
    // `fenceKeywords` already excludes `header:` from what identifies a fence,
    // and says why. That is the property making a rename safe: no `locate`, no
    // probe and no plan reads a header's text.
    //
    // ASSERTED THROUGH THE SET AS OF 4.70. The exclusion was written as
    // `k !== "header"` and is now `!MODIFIER_KEYWORDS.has(k)` — a superset, so
    // the property this test is about is strictly stronger than it was, and
    // pinning the old literal would have failed on a change that improved it.
    expect(readCode("journal-plan")).toContain("MODIFIER_KEYWORDS.has(k)");
    expect(MODIFIER_KEYWORDS.has("header")).toBe(true);
  });
});

describe("the two gestures on one bar", () => {
  it("renaming stops the click that would fold", () => {
    const src = readSrc("header-title");
    expect(src).toContain("stopPropagation");
  });

  it("commits once per edit", () => {
    // Enter commits, the write repaints, the repaint blurs a detached input,
    // and blur commits again — the reentry study-header.ts needed a flag for.
    const src = readSrc("header-title");
    expect(src).toContain("let settled = false");
    expect(src).toMatch(/if \(settled\) return;/);
  });

  it("shows the title as editable on hover", () => {
    // The original report was "hover does not show the field as editable".
    const css = readCss();
    expect(css).toContain(".ca-journal-header-title-editable:hover");
  });
});
