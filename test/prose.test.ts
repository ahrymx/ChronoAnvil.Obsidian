// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";
import { STUDY_JOURNAL } from "../src/journals/journal";
import { composeTemplate, journalTemplateFiles } from "../src/journals/custom-journal";
import {
  LEGACY_PROSE_KEY,
  PROSE_KEY,
  PROSE_SECTION_ID,
  bracketClose,
  bracketOpen,
  bracketOpenerOf,
  findSection,
  isProseId,
  normaliseProseTitle,
  proseCountIn,
  proseHeadIn,
  proseHeadLabel,
  proseIdFor,
  proseOrdinalOf,
  proseSpanIn,
  proseSpansIn,
  proseTitlesIn,
  renderSection,
  sectionContext,
  sectionOverrides,
  sectionRemovable,
} from "../src/journals/journal-sections";
import {
  FLAG_OFF,
  FLAG_ON,
  answerInText,
  describeAnswers,
} from "../src/core/section-model";
import {
  applySections,
  journalSectionModel,
  planSections,
  sectionsPresent,
} from "../src/journals/journal-plan";
import { wantFromJournalNote } from "../src/journals/journal-template";
import { toPlainMarkdown } from "../src/core/plain-markdown";
import { readNoteRegion } from "../src/core/notestore";
import { readCode, readSrc } from "./sources";

// ── PROSE, AND WHY IT IS A SECTION AT ALL (1.0.36) ───────────────────────
//
// This file was `prose-skeleton.test.ts` and was mostly about one property:
// that a bracketed run of `## ` headings could be REMOVED, derived rather than
// granted. 5.6 bought that with two HTML comments, and the argument is still
// here because it is still the argument.
//
// What changed is what the block IS. The reader looked at a Lesson and said the
// section *"should be upgraded to Prose, a mandatory section (cant be removed)
// which encompasses the plain markdown block a user writes"*, with as many
// blocks per note as they want and the headings behind a tick called **Add
// default headings**. So:
//
//   * the marker is `chronoanvil-prose`, and `chronoanvil-skeleton` is read
//     and never written — the `almanac:` situation again, and
//     `test/legacy-tokens.test.ts` is the other half of that contract;
//   * a note may hold several blocks, numbered by FILE ORDER, and the markup
//     carries no number at all, so moving or deleting one renumbers nothing;
//   * the first block is `locked` and the rest are the reader's;
//   * the headings are a derived tick, and unticking it takes out the ones
//     nobody has written under and leaves the block standing.
//
// The section's catalogue id is still `headings`. That is deliberate and is
// argued at the entry: an id is what a saved layout and a `SectionOverrides`
// key are spelled with, a label is what a reader reads, and `prose` is taken by
// the note-field section two rows up.

const lessonCtx = sectionContext(STUDY_JOURNAL, {
  kind: STUDY_JOURNAL.kinds.find((k) => k.id === "lesson")!,
});
const indexCtx = sectionContext(STUDY_JOURNAL, { depth: 1 });
const lesson = (): string =>
  journalTemplateFiles(STUDY_JOURNAL).find((f) => f.name === "lesson.md")!
    .content;

// ── A LESSON WITH SOMETHING UNDER ITS PROSE ─────────────────────────────
//
// Every Lesson written before 5.20 is this note: the block, and a recall deck
// beneath it. The catalogue cannot compose it any more — prose is its LAST
// entry, so nothing composed sits under the reader's writing — which is why
// this is built by moving the span rather than by asking for an order. A note
// on disk is not obliged to match what the composer would write today, and the
// tests below are about exactly the notes that do not.
const MID_ORDER = ["banner", "trackers", "pages", "headings", "recall"];
const midProse = (): string => {
  const text = composeTemplate(
    lessonCtx,
    MID_ORDER,
    STUDY_JOURNAL.layout?.["kind:lesson"]
  );
  const open = bracketOpen(PROSE_KEY);
  const close = bracketClose(PROSE_KEY);
  const a = text.indexOf(open);
  const b = text.indexOf(close) + close.length;
  const block = text.slice(a, b);
  const head = text.slice(0, a);
  const tail = text.slice(b);
  // The top of the fence that holds the deck, found through its directive so
  // the fixture does not depend on the bar's wording.
  const cut = head.lastIndexOf("```chronoanvil", head.indexOf("recall:recall"));
  return `${head.slice(0, cut)}${block}\n\n${head.slice(cut).trimEnd()}${tail}`;
};

// The same note with its markers taken out — every Lesson written before 5.6.
const unmarked = (text: string): string =>
  text
    .split("\n")
    .filter(
      (l) =>
        l.trim() !== bracketOpen(PROSE_KEY) &&
        l.trim() !== bracketClose(PROSE_KEY)
    )
    .join("\n");

// A line of the reader's own, under a heading of the LAST block — which is the
// one these tests may remove, the first being locked.
const writeInSecond = (text: string): string => {
  const at = text.lastIndexOf("- [[]] — ");
  return `${text.slice(0, at)}- [[Ohm's law]] — the one I keep forgetting${text.slice(
    at + "- [[]] — ".length
  )}`;
};

// A second block, written where a reader would put one: below everything the
// template composed.
const twoBlocks = (): string => {
  const text = lesson();
  const want = [...sectionsPresent(text, lessonCtx), proseIdFor(2)];
  return applySections(text, lessonCtx, want)!;
};

describe("the marker is not a region, under any of the three parsers", () => {
  it("carries no colon, which is what the region grammar keys on", () => {
    // THE ONE PROPERTY THE WHOLE SPELLING EXISTS FOR. `<!--chronoanvil:key` is
    // the region form and three separate parsers key off it — notestore.ts's
    // `OPEN_PREFIX`, `regionsIn` in journal-plan.ts, `looseLines` in
    // reload-loss.ts. Each of them happens to decline the colon spelling of this
    // marker for its own incidental reason, which is three accidents to stay
    // lucky about. A hyphen is not an accident.
    expect(bracketOpen(PROSE_KEY)).toBe("<!--chronoanvil-prose-->");
    expect(bracketClose(PROSE_KEY)).toBe("<!--/chronoanvil-prose-->");
    for (const m of [bracketOpen(PROSE_KEY), bracketClose(PROSE_KEY)]) {
      expect(m).not.toContain("chronoanvil:");
    }
    // AND THE OLD SPELLING IS STILL A MARKER, which is the whole of the
    // backwards story: it is read and never written.
    expect(bracketOpen(LEGACY_PROSE_KEY)).toBe("<!--chronoanvil-skeleton-->");
  });

  it("reads back as no region at all", () => {
    // Asked of the reader rather than of the regex, because the failure this
    // guards against is a widget quietly resolving its value to a heading.
    const text = lesson();
    for (const key of ["prose", "/chronoanvil-prose", "recall"]) {
      const value = readNoteRegion(text, key);
      expect(value, key).not.toContain("## Overview");
    }
  });

  it("is spelled in exactly one place", () => {
    // Three files read this marker — the catalogue writes it, the planner cuts
    // on it, the layout save scopes to it — and a marker with three spellings is
    // a marker with two bugs waiting.
    const src = readSrc("journal-sections");
    expect(src.match(/<!--\$\{/g) ?? []).toHaveLength(0);
    expect(src).toContain("`<!--chronoanvil-${key}-->`");
    expect(src).toContain("`<!--/chronoanvil-${key}-->`");
    for (const name of ["journal-plan", "journal-template"]) {
      expect(readSrc(name), name).not.toContain("<!--chronoanvil-");
    }
  });
});

describe("one block, or as many as the note needs", () => {
  it("numbers by file order, and the markup carries no number", () => {
    const text = twoBlocks();
    const spans = proseSpansIn(text.split("\n"));
    expect(spans).toHaveLength(2);
    expect(spans[0].open).toBeLessThan(spans[1].open);
    expect(proseCountIn(text)).toBe(2);
    // THE MARKERS ARE IDENTICAL, WHICH IS THE POINT. An id written into the
    // markup would have to be rewritten every time a block moved or one above
    // it went, and a file whose numbering disagrees with its order is a file
    // where the window edits the wrong block.
    const lines = text.split("\n");
    expect(lines[spans[0].open]).toBe(lines[spans[1].open]);
    expect(lines[spans[0].close]).toBe(lines[spans[1].close]);
    expect(text).not.toContain("chronoanvil-prose-2");
  });

  it("gives every block a row, in the order they appear", () => {
    const text = twoBlocks();
    expect(sectionsPresent(text, lessonCtx)).toEqual([
      "banner",
      "trackers",
      "pages",
      "headings",
      "headings#2",
    ]);
    const rows = journalSectionModel(lessonCtx)
      .sections(text)
      .filter((s) => isProseId(s.id));
    expect(rows.map((r) => r.id)).toEqual(["headings", "headings#2"]);
    // Told apart by their number and by nothing else — same blurb, same icon,
    // different words inside.
    expect(rows.map((r) => r.label)).toEqual(["Prose", "Prose 2"]);
  });

  it("offers one more than the note holds, and never lists the spare", () => {
    // `flatNoteModel`'s rule, for the same reason: the ids the window can OFFER
    // have to include the one it does not have yet, or *add another* has
    // nothing legal to stage — and a block nobody has written is not a row.
    const text = lesson();
    const model = journalSectionModel(lessonCtx);
    expect(model.sections(text).filter((s) => isProseId(s.id))).toHaveLength(1);
    expect(model.addable(text).map((s) => s.id)).toContain("headings#2");
    expect(model.addable(twoBlocks()).map((s) => s.id)).toContain("headings#3");
  });

  it("spells an ordinal in one place, and refuses what nobody wrote", () => {
    expect(proseIdFor(1)).toBe(PROSE_SECTION_ID);
    expect(proseIdFor(2)).toBe("headings#2");
    expect(proseOrdinalOf("headings")).toBe(1);
    expect(proseOrdinalOf("headings#3")).toBe(3);
    for (const bad of ["headings#", "headings#0", "headings#2x", "prose", "w:diary#1"]) {
      expect(proseOrdinalOf(bad), bad).toBeNull();
      expect(isProseId(bad), bad).toBe(false);
    }
  });

  it("removes the second block without renumbering the first's markup", () => {
    const text = twoBlocks();
    const want = sectionsPresent(text, lessonCtx).filter(
      (id) => id !== "headings#2"
    );
    const op = planSections(text, lessonCtx, want).find(
      (o) => o.sectionId === "headings#2"
    )!;
    expect(op.kind).toBe("remove");
    const after = applySections(text, lessonCtx, want)!;
    expect(proseCountIn(after)).toBe(1);
    // And the first block is the file it was, to the byte.
    expect(after).toBe(lesson());
  });

  it("puts it back where it came from", () => {
    // Remove-then-re-add is a round trip, which is the property `insertionPoint`
    // exists for and the one a repeating section could quietly lose: an id the
    // catalogue's order does not hold ranks above everything and lands at the
    // top of the note.
    const text = twoBlocks();
    const gone = applySections(
      text,
      lessonCtx,
      sectionsPresent(text, lessonCtx).filter((id) => id !== "headings#2")
    )!;
    const back = applySections(gone, lessonCtx, sectionsPresent(text, lessonCtx));
    expect(back ?? gone).toBe(text);
  });
});

// ── MOVING ONE BLOCK PAST ANOTHER (1.0.36) ──────────────────────────────
//
// A raw segment runs from one fence to the next, so two prose blocks with a
// blank line between them arrived at the planner as ONE segment and left as one
// run carrying two ids. Everything downstream works in chunks — a chunk is a
// run's lines — so the two could not be reordered against each other and
// nothing could be put between them, while `planSections`, which reasons about
// ids, reported the move happily. The reader pressed Save on *moves Prose 2
// above Tasks* and the modal said **nothing to change**.
//
// `splitRawSegments` now cuts at every bracket, so each block is a run and the
// blanks between them are filler — which is what a blank between two fenced
// sections has always been. These tests are the disagreement, pinned from both
// ends: the plan says a move, and the write performs one.
const tagged = (): string => {
  const two = twoBlocks();
  const prompt = "What is this lesson about, and why does it matter?";
  const first = two.indexOf(prompt);
  const last = two.lastIndexOf(prompt);
  return (
    two.slice(0, first) +
    "FIRST BLOCK" +
    two.slice(first + prompt.length, last) +
    "SECOND BLOCK" +
    two.slice(last + prompt.length)
  );
};

describe("moving one block past another", () => {
  it("swaps two prose blocks", () => {
    const note = tagged();
    expect(note.indexOf("FIRST BLOCK")).toBeLessThan(note.indexOf("SECOND BLOCK"));
    const want = ["banner", "trackers", "pages", proseIdFor(2), PROSE_SECTION_ID];

    const ops = planSections(note, lessonCtx, want);
    expect(ops.some((o) => o.kind === "move")).toBe(true);

    // THE HALF THAT WAS MISSING. A plan naming a move and a write returning
    // null is the one failure this module's header says cannot happen, and it
    // reaches the reader as a modal that refuses the thing it just offered.
    const after = applySections(note, lessonCtx, want);
    expect(after).not.toBeNull();
    expect(after!.indexOf("SECOND BLOCK")).toBeLessThan(
      after!.indexOf("FIRST BLOCK")
    );
    expect(proseCountIn(after!)).toBe(2);
    // Both brackets intact, and no gap opened or closed by the swap.
    expect(after!.match(/<!--chronoanvil-prose-->/g)).toHaveLength(2);
    expect(after!).not.toMatch(/\n\n\n/);
  });

  it("puts a section between two blocks", () => {
    // The reader's second attempt, and a different arithmetic: nothing can be
    // inserted INSIDE a chunk, so while the two blocks shared one there was no
    // position between them to name.
    //
    // ON A PAGE WITH A TASKS FENCE, which is the note this was reported on. A
    // cell of the banner's stacked fence would not have moved either — two
    // cells of ONE fence trading places has always reported a move and written
    // nothing — and that is a different defect this test must not be silently
    // standing in for.
    const base = page();
    const withTasks = applySections(base, pageCtx, [
      ...sectionsPresent(base, pageCtx),
      "checklist",
      proseIdFor(2),
    ])!;
    const spansBefore = proseSpansIn(withTasks.split("\n"));
    const tasksBefore = withTasks
      .split("\n")
      .findIndex((l) => l.trim() === "tasks:tasks");
    // The catalogue composes it ABOVE prose, which is where it starts.
    expect(tasksBefore).toBeLessThan(spansBefore[0].open);

    const want = [
      "banner",
      PROSE_SECTION_ID,
      "checklist",
      proseIdFor(2),
    ];
    const ops = planSections(withTasks, pageCtx, want);
    expect(ops.some((o) => o.kind === "move")).toBe(true);

    const after = applySections(withTasks, pageCtx, want);
    expect(after).not.toBeNull();
    const lines = after!.split("\n");
    const spans = proseSpansIn(lines);
    const tasks = lines.findIndex((l) => l.trim() === "tasks:tasks");
    expect(tasks).toBeGreaterThan(spans[0].close);
    expect(tasks).toBeLessThan(spans[1].open);
    // NO GAP CHECK HERE: a page's default heading ships with an empty body, so
    // the block it composes has carried a three-line gap since 5.6 and would
    // fail one for a reason that has nothing to do with the move. The Lesson
    // tests above are where that is asserted.
  });

  it("is a permutation and nothing else", () => {
    // Every line of the file is still there, in some order: a move that also
    // edits is a move that lost something.
    const note = tagged();
    const want = ["banner", "trackers", "pages", proseIdFor(2), PROSE_SECTION_ID];
    const after = applySections(note, lessonCtx, want)!;
    const sorted = (t: string): string[] =>
      t.split("\n").filter((l) => l.trim() !== "").sort();
    expect(sorted(after)).toEqual(sorted(note));
  });
});

// ── WHERE A NEW BLOCK LANDS (1.0.36) ────────────────────────────────────
//
// A page is the smallest note the journals compose — a banner, one prose block
// and the hidden parent link — which makes it the note where "at the end" is
// ambiguous, and the one a reader reported it wrong on.
const pageCtx = sectionContext(STUDY_JOURNAL, {
  page: STUDY_JOURNAL.kinds.find((k) => k.id === "lesson")!,
});
const page = (): string =>
  journalTemplateFiles(STUDY_JOURNAL).find((f) => f.name === "page.md")!
    .content;
const GRAPH = "%% chronoanvil-graph %%";

describe("where a new block lands", () => {
  it("goes above the hidden parent link, not below it", () => {
    // THE DEFECT, PINNED. `%% chronoanvil-graph %%` and its links line are the
    // last thing this plugin writes into a note and are not a section, so they
    // carry no id and `order` can rank nothing against them. A second prose
    // block sorts after every catalogue id — it is the only thing that ever
    // has — so it landed BELOW the link and left it stranded in the middle of
    // the file, where `setGraphLinks`' append and both surfaces' blank-run
    // normalisers no longer describe it.
    const text = page();
    const two = applySections(text, pageCtx, [
      ...sectionsPresent(text, pageCtx),
      proseIdFor(2),
    ])!;
    expect(proseCountIn(two)).toBe(2);
    const spans = proseSpansIn(two.split("\n"));
    const graph = two.split("\n").findIndex((l) => l.trim() === GRAPH);
    expect(graph).toBeGreaterThan(spans[1].close);
    // And it is still the pair it was: the marker, then the links line.
    expect(two.trimEnd().endsWith("%%")).toBe(true);
    expect(two.match(/%% chronoanvil-graph %%/g)).toHaveLength(1);
  });

  it("changes nothing on a note that asked for nothing", () => {
    // The detach and the restore have to be exactly inverse, or every note in
    // the vault would come back rewritten the first time the editor opened it.
    const text = page();
    expect(applySections(text, pageCtx, sectionsPresent(text, pageCtx))).toBeNull();
  });

  it("declines on a note the reader has written below the link", () => {
    // The block is a tail or it is nothing. Text after it is the reader's, and
    // lifting the link over it would move their words relative to a comment
    // they cannot see.
    const text = `${page().trimEnd()}\n\nSomething I typed down here.\n`;
    const two = applySections(text, pageCtx, [
      ...sectionsPresent(text, pageCtx),
      proseIdFor(2),
    ])!;
    expect(two).toContain("Something I typed down here.");
    const lines = two.split("\n");
    const graph = lines.findIndex((l) => l.trim() === GRAPH);
    const mine = lines.findIndex((l) => l.startsWith("Something I typed"));
    expect(graph).toBeLessThan(mine);
  });
});

describe("the first block is the one the note cannot be without", () => {
  it("is locked, and the second is not", () => {
    const prose = findSection(PROSE_SECTION_ID)!;
    expect(prose.locked).toBe(true);
    const model = journalSectionModel(lessonCtx);
    const rows = model.sections(twoBlocks());
    expect(rows.find((s) => s.id === "headings")!.removable).toBe(false);
    expect(rows.find((s) => s.id === "headings#2")!.removable).toBe(true);
  });

  it("says so on the row and in the plan, in the same breath", () => {
    // 4.21's rule: the row reads one and the change list prints the other, so a
    // second derivation of "may this go" is how they come to disagree.
    const text = twoBlocks();
    const model = journalSectionModel(lessonCtx);
    expect(model.refusal("headings", text)).toContain("can't be removed");
    expect(model.refusal("headings#2", text)).toBeNull();
    const op = planSections(
      text,
      lessonCtx,
      sectionsPresent(text, lessonCtx).filter((id) => id !== "headings")
    ).find((o) => o.sectionId === "headings")!;
    expect(op.kind).toBe("keep");
    expect(op.detail).toContain("cannot be removed");
  });

  it("locks the block without locking the ARRANGEMENT", () => {
    // `locked` is "cannot be removed" and `pinned` is "cannot be moved", and
    // conflating them is what a required section's row usually loses. Prose
    // moves like anything else — which is what "move prose block #" is.
    const row = journalSectionModel(lessonCtx)
      .sections(lesson())
      .find((s) => s.id === "headings")!;
    expect(row.movable).toBe(true);
    expect(findSection(PROSE_SECTION_ID)!.pinned).toBeFalsy();
  });

  it("does not make the banner's rule its own", () => {
    // A REQUIRED SECTION LEADS was the banner's rule and read `s.locked`, which
    // was the same set for as long as the banner was the only locked section
    // here. It is not any more, and a prose block hoisted to line 0 would put
    // the reader's writing above the note's own head — and unweld the grid and
    // the page index from the banner on the way past.
    const src = readSrc("journal-sections");
    const at = src.indexOf("export function sectionsFor");
    const body = src.slice(at, src.indexOf("\n}", at));
    expect(body).toContain("a.s.id === BANNER_ID");
    expect(body).not.toContain("a.s.locked");
  });
});

describe("removability is still derived, not granted", () => {
  it("allows a block past the first without the derivation being told it exists", () => {
    const prose = findSection(PROSE_SECTION_ID)!;
    // `sectionRemovable` answers false here now, and it is the `locked` flag
    // doing it rather than the derivation: the block is BRACKETED, which is
    // exactly the proof 5.6 bought, and the catalogue is the thing saying a
    // leaf note must keep one. Strip the flag and the derivation still says
    // yes, which is what lets `rowFor` scope the answer by ordinal instead of
    // by a second catalogue entry.
    expect(
      sectionRemovable(prose, lessonCtx, sectionOverrides(lessonCtx, "headings"))
    ).toBe(false);
    expect(
      sectionRemovable(
        { ...prose, locked: false },
        lessonCtx,
        sectionOverrides(lessonCtx, "headings")
      )
    ).toBe(true);
    // And the row the window draws for the second block says so.
    expect(
      journalSectionModel(lessonCtx)
        .sections(twoBlocks())
        .find((s) => s.id === "headings#2")!.removable
    ).toBe(true);

    // THE NEGATIVE HALF, AND IT IS THE ONE THAT MATTERS. `sectionRemovable` is
    // four lines long and names no section; a patch that reached the same
    // outcome by naming this one would be the claim-without-evidence the
    // derivation was written to make unrepresentable.
    const src = readSrc("journal-sections");
    const body = src.slice(src.indexOf("export function sectionRemovable"));
    const fn = body.slice(0, body.indexOf("\n}"));
    expect(fn).not.toContain("headings");
    expect(fn).not.toContain("bracketed");
    expect(fn).toContain('b.kind === "markdown"');
  });

  it("still refuses the banner, which really is unprovable markdown", () => {
    expect(
      sectionRemovable(findSection("banner")!, indexCtx, sectionOverrides(indexCtx, "banner"))
    ).toBe(false);
  });
});

describe("what a composed template carries", () => {
  it("brackets the prose on a leaf and writes none on an index", () => {
    const lines = lesson().split("\n");
    const span = proseSpanIn(lines, 1)!;
    expect(span).not.toBeNull();
    // Every heading the catalogue wrote is inside it, and the frontmatter and
    // the fences are outside it.
    const inner = lines.slice(span.open + 1, span.close).join("\n");
    expect(inner).toContain("## Overview");
    expect(inner).toContain("## Next");
    expect(inner).not.toContain("```");

    const topic = journalTemplateFiles(STUDY_JOURNAL).find(
      (f) => f.name === "topic-index.md"
    )!.content;
    expect(proseSpanIn(topic.split("\n"), 1)).toBeNull();
  });

  it("keeps each marker in a markdown block of its own", () => {
    // A comment on the line directly above a `## ` is one block to anything that
    // splits on blank lines, and the header-bar fold is closed by "any markdown
    // heading" measured over blocks. Abutting them would carry the Lesson's
    // `📄 Pages` fold straight past `## Overview` and into the prose. See the
    // fold-scope test in pure-logic, which counts what this costs.
    const lines = lesson().split("\n");
    const span = proseSpanIn(lines, 1)!;
    expect(lines[span.open + 1].trim()).toBe("");
    expect(lines[span.close - 1].trim()).toBe("");
  });
});

describe("removing a block keeps what was written in it", () => {
  // ON THE SECOND BLOCK, BECAUSE THE FIRST CANNOT GO. The rule these tests are
  // about — a removal never deletes the reader's writing — is unchanged and is
  // the same code; what changed is which block a reader is allowed to point it
  // at.
  const withWriting = (): string => writeInSecond(twoBlocks());
  const want = (text: string): string[] =>
    sectionsPresent(text, lessonCtx).filter((id) => id !== "headings#2");

  it("drops an empty heading and keeps one with a line under it", () => {
    const note = withWriting();
    // The write landed in the SECOND block, which is the one being removed.
    expect(proseTitlesIn(note, 2)).toContain("Connected Ideas");
    const op = planSections(note, lessonCtx, want(note)).find(
      (o) => o.sectionId === "headings#2"
    )!;
    expect(op.kind).toBe("remove");
    expect(op.keepsContent?.map((k) => k.key)).toContain("Connected Ideas");

    const after = applySections(note, lessonCtx, want(note))!;
    expect(after).toContain("the one I keep forgetting");
  });

  it("takes the whole block when nothing has been written in it", () => {
    // The common case: untick a block you have not touched yet, and nothing at
    // all is left behind — no headings, no markers, no gap.
    const text = twoBlocks();
    const op = planSections(text, lessonCtx, want(text)).find(
      (o) => o.sectionId === "headings#2"
    )!;
    expect(op.kind).toBe("remove");
    expect(op.keepsContent).toBeUndefined();
    const after = applySections(text, lessonCtx, want(text))!;
    expect(proseCountIn(after)).toBe(1);
    expect(after).not.toMatch(/\n\n\n/);
  });

  it("never leaves a marker behind, whatever survives", () => {
    // A bracket around nothing is a note carrying an invisible claim about a
    // section it no longer has — and re-adding the block later would then
    // compose a second pair inside the first.
    const note = withWriting();
    const after = applySections(note, lessonCtx, want(note))!;
    expect(proseCountIn(after)).toBe(1);
    expect(after.match(/<!--chronoanvil-prose-->/g)).toHaveLength(1);
  });

  it("leaves one blank line where the whole span was, not none", () => {
    // THE ONE WAY THIS SECTION IS UNLIKE EVERY OTHER REMOVABLE ONE. A fence
    // section is its own segment with the blank separators as filler runs
    // beside it, so the region path drops the run and steps over the next
    // blank. A prose block is a RAW segment, and the separators on both sides
    // are its own lines — so dropping the run wholesale would weld the block
    // above straight onto the block below.
    //
    // ON `midProse`, WHICH IS THE ONLY WAY TO GET A BLOCK BELOW ONE (5.20).
    // Prose is the LAST section in the catalogue, so on a fresh note there is
    // nothing for a dropped run to weld onto and this would pass vacuously.
    const bare = midProse();
    const gone = applySections(
      bare,
      lessonCtx,
      sectionsPresent(bare, lessonCtx).filter((id) => id !== "headings")
    );
    // The first block is locked, so the removal is refused and the file is the
    // file — which is itself the check that a refusal writes nothing.
    expect(gone).toBeNull();

    // The second block is the one a reader can take out, and taking it out of
    // the middle of a note leaves the two fences either side one blank apart.
    const two = applySections(bare, lessonCtx, [
      ...sectionsPresent(bare, lessonCtx),
      proseIdFor(2),
    ])!;
    const after = applySections(
      two,
      lessonCtx,
      sectionsPresent(two, lessonCtx).filter((id) => id !== "headings#2")
    )!;
    expect(after).toBe(bare);
    expect(after).not.toMatch(/\n\n\n/);
  });
});

describe("a block written before the markers existed", () => {
  it("is kept, and the plan names the door", () => {
    const bare = unmarked(lesson());
    expect(sectionsPresent(bare, lessonCtx)).toContain("headings");
    const op = planSections(
      bare,
      lessonCtx,
      sectionsPresent(bare, lessonCtx).filter((id) => id !== "headings")
    ).find((o) => o.sectionId === "headings")!;
    expect(op.kind).toBe("keep");
    expect(op.detail).toContain("Reload this note");
  });

  it("names the door rather than the lock, which is the useful sentence", () => {
    // The first block is locked, so "required — cannot be removed" would be
    // TRUE here and would tell the reader nothing they can act on. An unmarked
    // block refuses the headings tick as well as the removal, and **Reload this
    // page** is the one gesture that fixes both — so the door outranks the lock
    // in the plan and on the row, and these two must agree.
    const bare = unmarked(lesson());
    const model = journalSectionModel(lessonCtx);
    expect(model.refusal("headings", bare)).toContain("Reload this note");
    expect(model.refusal("headings", bare)).not.toContain("Part of every");
    // And the same row over a note that HAS the markers is refused for the
    // ordinary reason instead.
    expect(model.refusal("headings", lesson())).toContain("can't be removed");
  });

  it("is the case that keeps `removable` and `refusal` two fields", () => {
    // `SectionView.removable` is documented as "ignoring what is written in
    // it"; `refusal` is the one that reads the page. The locked first block
    // answers false to both, so the pair is asked of the SECOND — removable in
    // principle, refused by this file.
    const bare = unmarked(twoBlocks());
    const model = journalSectionModel(lessonCtx);
    const row = model.sections(bare).find((s) => s.id === "headings#2");
    // With no markers anywhere the note holds one undelimited run of headings,
    // so there is no second block to have a row at all — which is the same
    // answer said a shorter way.
    expect(row).toBeUndefined();
    expect(model.refusal("headings#2", bare)).toContain("Reload this note");
  });

  it("is left byte-identical when a removal is asked for anyway", () => {
    const bare = unmarked(lesson());
    const after = applySections(
      bare,
      lessonCtx,
      sectionsPresent(bare, lessonCtx).filter((id) => id !== "headings")
    );
    if (after !== null) expect(after).toContain("## Overview");
  });
});

describe("saving a page as a layout", () => {
  it("carries the headings inside the bracket and no others", () => {
    // THE AUTHORING HALF. Renaming a heading in the note and saving the page as
    // the layout is how a reader has made their own skeleton since 4.33 — and
    // until the bracket existed, a `## Scratch` typed at the bottom of one
    // Lesson was carried into every Lesson afterwards, because nothing on the
    // page said where the block stopped.
    const note = lesson().replace("## Overview", "## Why this matters") +
      "\n\n## Scratch\n\nnotes to self\n";
    const { options } = wantFromJournalNote(note, lessonCtx);
    const titles = (options["headings"]?.headings ?? []).map((h) => h.title);
    expect(titles).toContain("Why this matters");
    expect(titles).not.toContain("Scratch");
  });

  it("reads each block's own headings, not the first block's for all of them", () => {
    const text = twoBlocks().replace("## Overview", "## Why this matters");
    const { options } = wantFromJournalNote(text, lessonCtx);
    const first = (options["headings"]?.headings ?? []).map((h) => h.title);
    const second = (options["headings#2"]?.headings ?? []).map((h) => h.title);
    expect(first).toContain("Why this matters");
    expect(second).not.toContain("Why this matters");
    expect(second).toContain("Overview");
  });

  it("still reads the whole page when there is no bracket", () => {
    const note = unmarked(lesson());
    const { options } = wantFromJournalNote(note, lessonCtx);
    const titles = (options["headings"]?.headings ?? []).map((h) => h.title);
    expect(titles).toContain("Overview");
  });
});

describe("the markers are markup, and leave with it", () => {
  it("survives an export as plain markdown with the headings intact", () => {
    // `plain-markdown.ts`'s rule is LINKS AND VALUES, NOT MARKUP. A region's
    // markers take their contents with them because the contents are a field's
    // value; a bracket's markers are around the reader's own document, so only
    // the two lines go.
    const out = toPlainMarkdown(lesson(), journalSectionModel(lessonCtx));
    expect(out).not.toContain("chronoanvil-prose");
    expect(out).toContain("## Overview");
  });
});

describe("copying a block", () => {
  it("hands back its markdown with the markers off", () => {
    // The reader asked for *"special actions for each prose block (copy prose
    // block #, move prose block #)"*. Move was already free — every row carries
    // the arrows — so Copy is the half that needed a control, and it is asked
    // of the MODEL so the window keeps knowing nothing about what a prose block
    // is.
    const model = journalSectionModel(lessonCtx);
    const out = model.excerpt!("headings", lesson())!;
    expect(out).toContain("## Overview");
    expect(out).not.toContain("chronoanvil-prose");
    expect(out).not.toContain("```");
  });

  it("answers per block, and for nothing else", () => {
    const model = journalSectionModel(lessonCtx);
    const text = writeInSecond(twoBlocks());
    expect(model.excerpt!("headings", text)).not.toContain("Ohm's law");
    expect(model.excerpt!("headings#2", text)).toContain("Ohm's law");
    // NULL IS A CONTROL THAT IS NEVER DRAWN, which is better than one that
    // appears to do nothing.
    expect(model.excerpt!("banner", text)).toBeNull();
    expect(model.excerpt!("headings#9", text)).toBeNull();
  });
});

describe("the row says what the block is", () => {
  it("names the one thing nothing else on screen can", () => {
    // The blurb named "Save as layout…" until 1.0.36, because the read-back had
    // existed unannounced since 4.33 and the row was its only documentation.
    // 5.6 put the list in a box on this very row and this release put a tick
    // above it, so what the blurb has left to say is that there may be more
    // than one of these.
    const prose = findSection(PROSE_SECTION_ID)!;
    expect(prose.label).toBe("Prose");
    expect(prose.blurb).toContain("Where you write");
    expect(prose.blurb).toContain("as many prose blocks");
  });
});

// ── THE HEADINGS ARE A TICK AND A LIST (1.0.36) ──────────────────────────
//
// 5.6 made the list a control. This release puts a tick above it, on the
// reader's call — *"The skeleton part should remain as a toggle 'Add Default
// Headings'."* — because the two are two decisions and a reader makes the
// first far more often.
//
// BOTH ANSWERS ARE DERIVED FROM THE FILE, which is what makes them unlike every
// other question in every catalogue: a `FlagQuestion`'s answer is normally a
// modifier LINE in a fence, and prose has no fence. So the tick is read off the
// block — does it hold every heading this type composes — and written by
// composing them in or cutting the untouched ones out.
describe("the tick and the list", () => {
  const question = (kind: string) =>
    findSection(PROSE_SECTION_ID)!.questions!(lessonCtx).find(
      (q) => q.kind === kind
    )!;
  const wantWith = (
    text: string,
    options: Record<string, string>,
    id = "headings"
  ) =>
    sectionsPresent(text, lessonCtx).map((x) =>
      x === id ? { id: x, options } : x
    );
  const relist = (text: string, titles: string[]): string =>
    applySections(text, lessonCtx, wantWith(text, { headings: titles.join("\n") }))!;

  it("asks the head first, then the tick, then the list", () => {
    // THE ORDER IS THE SIZE OF THE DECISION (1.0.75). The head names the whole
    // block, the tick says whether it opens with prompts, the box says which —
    // so the row reads from the block down into it. The head went on top rather
    // than under the two because every other section's title question is the
    // first row of its card, and a reader who has learned where a title lives
    // should not have to look for this one.
    const qs = findSection(PROSE_SECTION_ID)!.questions!(lessonCtx);
    expect(qs.map((q) => q.kind)).toEqual(["title", "flag", "lines"]);
    expect(question("title").key).toBe("label");
    expect(question("flag").key).toBe("defaults");
    expect(question("lines").key).toBe("headings");
  });

  it("draws the list only while the tick is on (1.0.39)", () => {
    // Unticked, there are no default headings for the box to name, and a box
    // left on screen read as a second way to add them.
    expect(question("lines").shownWhen).toEqual({
      key: question("flag").key,
      is: FLAG_ON,
    });
  });

  it("hands the row the headings the note already has, and the tick on", () => {
    const row = journalSectionModel(lessonCtx)
      .sections(lesson())
      .find((s) => s.id === "headings")!;
    expect(row.answered?.["headings"]).toBe(
      ["Overview", "Key Concepts", "Key Takeaways", "Connected Ideas", "Next"].join(
        "\n"
      )
    );
    expect(row.answered?.["defaults"]).toBe(FLAG_ON);
  });

  it("hands over nothing for a note written before the markers", () => {
    // Not a refusal the editor works out — the model is simply silent, which is
    // the same silence a `folder` question with no host folder makes. The row
    // then reads the `settled` wording, which names the door rather than the
    // wall.
    const row = journalSectionModel(lessonCtx)
      .sections(unmarked(lesson()))
      .find((s) => s.id === "headings")!;
    expect(row.answered?.["headings"]).toBeUndefined();
    expect(question("lines").settled?.text).toContain("ordinary markdown");
    expect(question("lines").settled?.hint).toContain("Reload this note");
  });

  it("writes no modifier line, because there is no fence to write one in", () => {
    // `FlagQuestion.derived` is what stops `withAnswers` reaching for
    // `withFlagLine` — which reads the KEYWORD off the line it is given, and
    // this question's line is empty. Without the flag it would have filtered
    // every blank line in the block.
    const flag = question("flag") as { derived?: true; line: string };
    expect(flag.derived).toBe(true);
    expect(flag.line).toBe("");
    const off = applySections(
      lesson(),
      lessonCtx,
      wantWith(lesson(), { defaults: FLAG_OFF })
    )!;
    expect(off).not.toContain("defaults");
  });

  it("unticked, cuts the prompts nobody has written under and keeps the block", () => {
    const used = lesson().replace(
      "- [[]] — ",
      "- [[Ohm's law]] — the one I keep forgetting"
    );
    const want = wantWith(used, { defaults: FLAG_OFF });
    const op = planSections(used, lessonCtx, want).find(
      (o) => o.sectionId === "headings"
    )!;
    expect(op.kind).toBe("reconfigure");
    expect(op.detail).toContain("No default headings");

    const out = applySections(used, lessonCtx, want)!;
    expect(proseTitlesIn(out)).toEqual(["Connected Ideas"]);
    expect(out).toContain("the one I keep forgetting");
    // THE BLOCK STAYS. Cutting the markers would turn it into unmarked prose:
    // the row would fall off the window and the tick could never be put back.
    expect(proseCountIn(out)).toBe(1);
  });

  it("reads back unticked afterwards, which is what makes it a toggle", () => {
    // This derivation read "any of the defaults" for one turn, and a survivor
    // IS a default — so the box came back ticked over a block whose prompts had
    // just been taken out, and the reader had no way to say what they had just
    // said.
    const used = lesson().replace(
      "- [[]] — ",
      "- [[Ohm's law]] — the one I keep forgetting"
    );
    const out = applySections(used, lessonCtx, wantWith(used, { defaults: FLAG_OFF }))!;
    const row = journalSectionModel(lessonCtx)
      .sections(out)
      .find((s) => s.id === "headings")!;
    expect(row.answered?.["defaults"]).toBe(FLAG_OFF);
  });

  it("re-ticked, puts back exactly what unticking took out", () => {
    const used = lesson().replace(
      "- [[]] — ",
      "- [[Ohm's law]] — the one I keep forgetting"
    );
    const off = applySections(used, lessonCtx, wantWith(used, { defaults: FLAG_OFF }))!;
    const on = applySections(off, lessonCtx, wantWith(off, { defaults: FLAG_ON }))!;
    // Byte for byte, prompt text included — the type's own words are not
    // something a reader loses by changing their mind.
    expect(on).toBe(used);
  });

  it("acts on a CHANGE of the tick and not on its value", () => {
    // The tick is derived, so the editor sends its current value back on every
    // save whether or not the reader touched it. A bare `=== FLAG_OFF` would
    // therefore have pruned on every save of a block that is missing one
    // default — including one holding a list the reader typed themselves.
    const custom = relist(lesson(), ["Aim", "Method", "Result"]);
    expect(proseTitlesIn(custom)).toEqual(["Aim", "Method", "Result"]);
    const row = journalSectionModel(lessonCtx)
      .sections(custom)
      .find((s) => s.id === "headings")!;
    expect(row.answered?.["defaults"]).toBe(FLAG_OFF);
    // Saving the row exactly as the window found it changes nothing.
    expect(
      applySections(custom, lessonCtx, wantWith(custom, row.answered!))
    ).toBeNull();
  });

  it("reorders without moving a word of what is under each heading", () => {
    const out = relist(lesson(), [
      "Next",
      "Overview",
      "Key Concepts",
      "Key Takeaways",
      "Connected Ideas",
    ]);
    expect(proseTitlesIn(out)).toEqual([
      "Next",
      "Overview",
      "Key Concepts",
      "Key Takeaways",
      "Connected Ideas",
    ]);
    // The prose travelled WITH its heading rather than staying where it was —
    // a rewrite that reordered the `## ` lines alone would have handed every
    // paragraph to the wrong heading, silently, and the file would still have
    // parsed.
    const at = (needle: string): number => out.indexOf(needle);
    expect(at("What is this lesson about")).toBeGreaterThan(at("## Overview"));
    expect(at("What is this lesson about")).toBeLessThan(at("## Key Concepts"));
  });

  it("gives the file back byte for byte when the list comes back", () => {
    // THE PROPERTY THE WHOLE REWRITE IS SHAPED AROUND. `emit` composes each
    // group in the shape `renderBlock` writes — heading, blank, body, and a
    // single blank line where an empty body goes — so a list that ends up where
    // it started leaves the note where it started, with no drifting blank line
    // to mark that somebody opened the box.
    //
    // A ROUND TRIP RATHER THAN A NO-OP, because a no-op never reaches the
    // rewrite: `applySections` returns null when the plan holds nothing to do,
    // which is true and tests nothing. Rotating the list and rotating it back
    // runs the composer twice over every group in the file.
    const original = proseTitlesIn(lesson())!;
    const rotated = [...original.slice(1), original[0]];
    expect(relist(relist(lesson(), rotated), original)).toBe(lesson());
    // And the untouched list really is a no-op, rather than a write that
    // happens to come out the same.
    expect(
      applySections(
        lesson(),
        lessonCtx,
        wantWith(lesson(), { headings: original.join("\n") })
      )
    ).toBeNull();
  });

  it("adds a heading empty, and drops the ones left out of the list", () => {
    const out = relist(lesson(), ["Overview", "Method", "Next"]);
    expect(proseTitlesIn(out)).toEqual(["Overview", "Method", "Next"]);
    // Composed the way the catalogue would have: a blank line under the
    // heading, which is the place to write. EMPTY rather than seeded, because a
    // title typed into that box is the reader's own and the plugin has no
    // prompt text for it — the tick is the caller that wants the opposite.
    expect(out).toContain("## Method\n\n\n\n## Next");
    // And the ones that went were untouched prompt text, not writing.
    expect(out).not.toContain("**Definition:**");
  });

  it("keeps a dropped heading that has writing under it, and says so first", () => {
    const used = lesson().replace(
      "- [[]] — ",
      "- [[Ohm's law]] — the one I keep forgetting"
    );
    const want = wantWith(used, { headings: ["Overview", "Next"].join("\n") });
    const op = planSections(used, lessonCtx, want).find(
      (o) => o.sectionId === "headings"
    )!;
    expect(op.kind).toBe("reconfigure");
    expect(op.keepsContent?.map((k) => k.key)).toEqual(["Connected Ideas"]);
    expect(op.detail).toContain("Connected Ideas");

    // And the write agrees with the preview, which is the only reason saying it
    // first is worth anything. The survivor goes after the list rather than
    // back into it: the reader's order is the reader's, and this heading was
    // not in it.
    const out = applySections(used, lessonCtx, want)!;
    expect(proseTitlesIn(out)).toEqual(["Overview", "Next", "Connected Ideas"]);
    expect(out).toContain("the one I keep forgetting");
  });

  it("edits the second block's list without touching the first's", () => {
    const text = twoBlocks();
    const want = wantWith(
      text,
      { headings: ["Aim", "Method"].join("\n") },
      "headings#2"
    );
    const out = applySections(text, lessonCtx, want)!;
    expect(proseTitlesIn(out, 1)).toEqual([
      "Overview",
      "Key Concepts",
      "Key Takeaways",
      "Connected Ideas",
      "Next",
    ]);
    expect(proseTitlesIn(out, 2)).toEqual(["Aim", "Method"]);
  });

  it("composes a typed list when a block is added", () => {
    const text = lesson();
    const back = applySections(text, lessonCtx, [
      ...sectionsPresent(text, lessonCtx),
      { id: proseIdFor(2), options: { headings: "Aim\nMethod\nResult" } },
    ])!;
    // The add path renders rather than rewrites, so the answer has to arrive as
    // the shape `render` reads — the one conversion `renderOptionsFor` exists
    // for. Without it the string lands where an array belongs and the composed
    // block carries no headings at all.
    expect(proseTitlesIn(back, 2)).toEqual(["Aim", "Method", "Result"]);
    expect(back).toContain(bracketOpen(PROSE_KEY));
    expect(back).toContain(bracketClose(PROSE_KEY));
  });

  it("describes the list as a list, not as the text that was typed", () => {
    // The plan's line for a reconfigure, and a newline in it would break the
    // one-line detail every other op writes.
    const detail = describeAnswers(
      findSection(PROSE_SECTION_ID)!.questions!(lessonCtx),
      { headings: "Aim\nMethod" },
      "Lesson"
    );
    expect(detail).toContain("Aim, Method");
    expect(detail).not.toContain("\n");
  });

  it("can be moved among other sections and is still detected when reopening", () => {
    // ON `midProse` (5.20), because every id in a permutation has to be one the
    // file already holds. A shipped Lesson no longer carries a recall deck, so
    // these lists stopped being reorderings and became "remove trackers, add
    // recall, and put the rest in this order" — and an ARRIVAL lands where the
    // catalogue puts it, not where the list asks, which is correct behaviour
    // and not what this test is about.
    const text = midProse();
    const permutations = [
      ["headings", "banner", "trackers", "pages", "recall"],
      ["banner", "headings", "trackers", "pages", "recall"],
      ["banner", "trackers", "pages", "recall", "headings"],
      ["banner", "recall", "headings", "trackers", "pages"],
      ["recall", "headings", "pages", "trackers", "banner"],
      ["recall", "banner", "trackers", "pages", "headings"],
    ];
    // AND THE GRID AND THE PAGES INDEX TRAVEL WITH THE BANNER (5.28). The three
    // share one fence now, so a list that asks for them apart gets the banner
    // where it asked for it and the other two immediately after, in the order
    // the fence holds them — one block cannot be in three places. That is the
    // rule rather than a rounding error, so it is written out here and applied
    // to the expectation instead of the permutations being quietly chosen to
    // avoid it: three of the six below separate the group.
    const WELDED = ["trackers", "pages"];
    const welded = (order: string[]) => {
      const rest = order.filter((id) => !WELDED.includes(id));
      const at = rest.indexOf("banner");
      return [...rest.slice(0, at + 1), ...WELDED, ...rest.slice(at + 1)];
    };
    for (const reordered of permutations) {
      // A permutation the file already is rewrites nothing, and `applySections`
      // says so with a null rather than by handing back the same string.
      const applied =
        applySections(text, lessonCtx, reordered.map((id) => ({ id }))) ?? text;
      const presentAfter = sectionsPresent(applied, lessonCtx);
      expect(presentAfter, `Failed for ${reordered.join(",")}`).toEqual(
        welded(reordered)
      );
    }
    // The helper is only interesting if it is doing something: it must move the
    // grid on at least half of these, or the paragraph above is describing a
    // rule nothing here exercises.
    expect(
      permutations.filter((p) => welded(p).join() !== p.join()).length
    ).toBe(3);
  });
});

// ── THE HEAD A PROSE BLOCK WEARS (1.0.75) ───────────────────────────────
//
// *"can we give the prose blocks a header like other sections?"* — and the
// reader's own reason the head cannot be composed the way every other section's
// is: *"I think this is the only viable choice due to directive blocks breaking
// markdown syntax"*, which is 5.6's argument for the bracket said back by the
// person it was built for. A `header:` line over a prose block would put a fence
// in the middle of the reader's markdown.
//
// SO THE NAME LIVES ON THE OPENING MARKER, which is the only edge this section
// has, and the default is the catalogue's own word: *"Prose and if numbered,
// append the number. Allow editing like some sections already provide."*
describe("the head a prose block wears (1.0.75)", () => {
  const named = (title: string): string =>
    applySections(lesson(), lessonCtx, wantNamed(lesson(), title))!;
  const wantNamed = (text: string, title: string, id = "headings") =>
    sectionsPresent(text, lessonCtx).map((x) =>
      x === id ? { id: x, options: { label: title } } : x
    );

  describe("the grammar on the marker", () => {
    it("writes the name after the key and never on the closer", () => {
      // ONE MARKER CARRIES IT, because the pair is read as a pair: the closer is
      // found by key, and a title on it would be a second string to keep equal
      // to the first for no reader-visible gain.
      expect(bracketOpen(PROSE_KEY, "Chapter one")).toBe(
        "<!--chronoanvil-prose:Chapter one-->"
      );
      expect(bracketClose(PROSE_KEY)).toBe("<!--/chronoanvil-prose-->");
    });

    it("writes the bare marker for no name, which is what every note has", () => {
      // The ordinary case, and the one the whole suite above was written over.
      expect(bracketOpen(PROSE_KEY)).toBe("<!--chronoanvil-prose-->");
      expect(bracketOpen(PROSE_KEY, null)).toBe("<!--chronoanvil-prose-->");
      expect(bracketOpen(PROSE_KEY, "   ")).toBe("<!--chronoanvil-prose-->");
    });

    it("cannot be made to end the comment early", () => {
      // THE ONE THING A NAME IN AN HTML COMMENT MUST NOT DO. A reader who types
      // `-->` into the box would otherwise close the marker mid-name, and
      // everything after it would become visible markdown with no opener — the
      // section falls off the window and the reader is told to reload a note
      // nothing is wrong with.
      expect(normaliseProseTitle("a --> b")).toBe("a b");
      expect(bracketOpen(PROSE_KEY, "a --> b")).toBe(
        "<!--chronoanvil-prose:a b-->"
      );
      expect(bracketOpen(PROSE_KEY, "a --> b")).not.toContain("--> b");
    });

    it("keeps a name to one line, and folds the space out of it", () => {
      // A newline would end the marker's own line and split the comment across
      // two blocks; `<` and `>` are the other two characters a comment's
      // grammar reads.
      expect(normaliseProseTitle("Two  words")).toBe("Two words");
      expect(normaliseProseTitle("Aim\nMethod")).toBe("Aim Method");
      expect(normaliseProseTitle("<b>Aim</b>")).toBe("b Aim /b");
      expect(normaliseProseTitle("  ")).toBeNull();
      expect(normaliseProseTitle("")).toBeNull();
    });

    it("reads a name back off either spelling of the marker", () => {
      const keys = [PROSE_KEY, LEGACY_PROSE_KEY];
      expect(bracketOpenerOf("<!--chronoanvil-prose-->", keys)).toEqual({
        key: PROSE_KEY,
        title: null,
      });
      expect(
        bracketOpenerOf("<!--chronoanvil-prose:Chapter one-->", keys)
      ).toEqual({ key: PROSE_KEY, title: "Chapter one" });
      // A NOTE WRITTEN BEFORE THE RENAME CAN BE NAMED TOO, which falls out of
      // the keys being a list rather than being arranged for.
      expect(
        bracketOpenerOf("<!--chronoanvil-skeleton:Old notes-->", keys)
      ).toEqual({ key: LEGACY_PROSE_KEY, title: "Old notes" });
    });

    it("declines a closer, another key, and a key this is only a prefix of", () => {
      // THE PREFIX TRAP, WHICH THIS CODEBASE KEEPS MEETING. `prose` is a prefix
      // of nothing in the catalogue today and `headings` is, so the separator is
      // part of the test rather than `startsWith` on its own: a key that merely
      // begins with another's letters must not be read as that one with a name.
      const keys = [PROSE_KEY, LEGACY_PROSE_KEY];
      expect(bracketOpenerOf("<!--/chronoanvil-prose-->", keys)).toBeNull();
      expect(bracketOpenerOf("<!--chronoanvil-recall-->", keys)).toBeNull();
      expect(bracketOpenerOf("<!--chronoanvil-prosey-->", keys)).toBeNull();
      expect(bracketOpenerOf("## Overview", keys)).toBeNull();
    });
  });

  describe("what the file says, and what the window shows", () => {
    const row = (text: string, id = "headings") =>
      journalSectionModel(lessonCtx)
        .sections(text)
        .find((s) => s.id === id)!;

    it("answers the empty string for a block nobody has named", () => {
      // AND NOT NOTHING, which is the whole control: `readable()` draws the box
      // exactly where the model supplied a key, so an unset answer would hide
      // the box on every block in every vault — all of them are unnamed — and
      // print the refusal over a marker that is right there to write to.
      expect(row(lesson()).answered?.["label"]).toBe("");
      expect(proseHeadIn(lesson())).toBe("");
    });

    it("answers the reader's own word once they have given one", () => {
      const text = named("Chapter one");
      expect(proseHeadIn(text)).toBe("Chapter one");
      expect(row(text).answered?.["label"]).toBe("Chapter one");
    });

    it("answers nothing at all for a note with no markers", () => {
      // The pre-5.6 note. There is no edge to keep a name on, so the model
      // supplies no answer and the question's `settled` wording stands in for
      // the box — the same refusal the headings list already wears, and for the
      // same reason.
      const text = unmarked(lesson());
      expect(proseHeadIn(text)).toBeNull();
      expect(row(text).answered?.["label"]).toBeUndefined();
      const q = findSection(PROSE_SECTION_ID)!
        .questions!(lessonCtx)
        .find((x) => x.kind === "title")!;
      expect(q.settled?.text).toBeTruthy();
      expect(q.settled?.hint).toContain("Reload this note");
    });

    it("names no keyword, which is what puts the answer on the bracket", () => {
      // Every other `title` question in every catalogue names `header` — the
      // directive its answer is spliced into. This one names none, and that is
      // the single field `readable()` and `answerInText` both branch on.
      const q = findSection(PROSE_SECTION_ID)!
        .questions!(lessonCtx)
        .find((x) => x.kind === "title")!;
      expect(q.directive).toBeUndefined();
      expect(answerInText(named("Chapter one"), q)).toBeNull();
    });

    it("offers the second block's own default as its placeholder", () => {
      // A PLACEHOLDER STATES THE DEFAULT, so it has to be the default of THIS
      // block: the second block's head reads *Prose 2* and a box promising
      // *Prose* under it would be the control describing another block.
      const text = twoBlocks();
      const headOf = (id: string) =>
        row(text, id).questions.find((q) => q.kind === "title")!;
      expect(headOf("headings").placeholder).toBe("Prose");
      expect(headOf(proseIdFor(2)).placeholder).toBe("Prose 2");
    });

    it("derives that word where the painter derives it", () => {
      // ONE DERIVATION, TWO READERS — the attribute the stylesheet draws and the
      // placeholder the box shows. A second spelling of "Prose" is how the
      // head over a block and the box under it come to promise different words.
      expect(proseHeadLabel(null, 1)).toBe("Prose");
      expect(proseHeadLabel(null, 3)).toBe("Prose 3");
      expect(proseHeadLabel("Chapter one", 2)).toBe("Chapter one");
    });
  });

  describe("the write, and everything it does not touch", () => {
    it("names the block by rewriting one line", () => {
      const before = lesson();
      const after = named("Chapter one");
      const a = before.split("\n");
      const b = after.split("\n");
      expect(b).toHaveLength(a.length);
      const moved = a.flatMap((l, i) => (l === b[i] ? [] : [i]));
      expect(moved).toHaveLength(1);
      expect(b[moved[0]]).toBe("<!--chronoanvil-prose:Chapter one-->");
    });

    it("writes nothing when the answer is the name already there", () => {
      // The editor sends every answer back on every Save, so a bare write would
      // rewrite the opener of a block the reader only looked at — and
      // `applySections` answers null for a file it would not change.
      const text = named("Chapter one");
      expect(
        applySections(text, lessonCtx, wantNamed(text, "Chapter one"))
      ).toBeNull();
      expect(applySections(lesson(), lessonCtx, wantNamed(lesson(), ""))).toBeNull();
    });

    it("leaves the reader's own marker line alone, down to its spacing", () => {
      // WHAT "WRITES NOTHING" HAS TO MEAN, and the measurement that found it:
      // with the guard removed the two assertions above still passed, because
      // rewriting a marker to the same name produces the same bytes. The
      // difference the guard actually makes is on a line the reader has touched
      // — trailing spaces after the marker, which `proseSpansIn` trims to match
      // and this would silently tidy away. `applySections`' promise is that a
      // section it was not asked about comes out byte for byte, and a line it
      // WAS asked about and told to leave as it is counts as one.
      const spaced = lesson().replace(
        "<!--chronoanvil-prose-->\n",
        "<!--chronoanvil-prose-->   \n"
      );
      expect(spaced).toContain("<!--chronoanvil-prose-->   ");
      expect(proseHeadIn(spaced)).toBe("");
      expect(applySections(spaced, lessonCtx, wantNamed(spaced, ""))).toBeNull();
    });

    it("gives the block its default head back when the box is emptied", () => {
      // `TitleQuestion`'s own rule: empty means the catalogue's own heading.
      const text = named("Chapter one");
      const cleared = applySections(text, lessonCtx, wantNamed(text, "  "))!;
      expect(cleared).toContain("<!--chronoanvil-prose-->");
      expect(cleared).not.toContain("Chapter one");
      expect(proseHeadIn(cleared)).toBe("");
    });

    it("names the block the reader is on and not the one above it", () => {
      const text = twoBlocks();
      const want = sectionsPresent(text, lessonCtx).map((x) =>
        x === proseIdFor(2) ? { id: x, options: { label: "Scratch" } } : x
      );
      const after = applySections(text, lessonCtx, want)!;
      expect(proseHeadIn(after, 1)).toBe("");
      expect(proseHeadIn(after, 2)).toBe("Scratch");
    });

    it("keeps the name through an untick of the default headings", () => {
      // `pruneBracketedSpan` REWRITES THE OPENER, because the shape has to be
      // `renderBlock`'s to the blank line — so the title has to be carried
      // across explicitly. Without that, *Add default headings* would be a
      // checkbox that also renames the section.
      // AND THE TICK IS THE ONLY ANSWER SENT, which is what makes this the
      // prune's own job rather than the head write's. The editor sends back the
      // keys the reader TOUCHED — see `shownAnswer`, which seeds a control
      // without dirtying it — so a reader who only clears this checkbox sends
      // no name at all, and `withProseTitle` has nothing to put back.
      const text = named("Chapter one");
      const want = sectionsPresent(text, lessonCtx).map((x) =>
        x === "headings" ? { id: x, options: { defaults: FLAG_OFF } } : x
      );
      const after = applySections(text, lessonCtx, want)!;
      expect(proseTitlesIn(after)).toEqual([]);
      expect(proseHeadIn(after)).toBe("Chapter one");
    });

    it("hands both writes the same block, which is the run's own ordinal", () => {
      // TWO WRITES LAND ON ONE BLOCK and both are handed the run's lines rather
      // than the file's — so the number saying WHICH block inside that run has
      // to be the same number, read once. Each prose block is its own run
      // today, which makes the two disagreeing invisible until the day one run
      // holds two blocks; a shape assertion is what can see it now.
      const src = readCode("journal-plan");
      const at = src.indexOf("const nth = proseSpanOfRun(run.sectionIds, id);");
      expect(at).toBeGreaterThan(-1);
      const site = src.slice(at, src.indexOf("}", src.indexOf("withProseTitle(", at)));
      expect(site.match(/\n\s+nth,?\n/g) ?? []).toHaveLength(2);
      expect(site).not.toContain("1\n");
    });

    it("does not migrate the old spelling as a side effect of a rename", () => {
      // A rename is a rename. The `skeleton` marker is read and never written
      // (`test/legacy-tokens.test.ts` is the other half of that contract), and
      // naming a block is not the release that changes which spelling a note
      // carries.
      const old = lesson()
        .split(bracketOpen(PROSE_KEY))
        .join(bracketOpen(LEGACY_PROSE_KEY))
        .split(bracketClose(PROSE_KEY))
        .join(bracketClose(LEGACY_PROSE_KEY));
      const after = applySections(old, lessonCtx, wantNamed(old, "Chapter one"))!;
      expect(after).toContain("<!--chronoanvil-skeleton:Chapter one-->");
      expect(after).toContain("<!--/chronoanvil-skeleton-->");
      expect(after).not.toContain("chronoanvil-prose");
    });
  });

  describe("a block composed with a name", () => {
    const prose = findSection(PROSE_SECTION_ID)!;

    it("composes the name a layout declared", () => {
      // `label` IS THE OVERRIDE'S FIELD NAME AND THE QUESTION'S KEY, which is
      // the contract `renderOptionsFor` runs on — so a preset that names a
      // prose block has to COMPOSE that name rather than store an answer
      // nothing draws. The alternative was a key nothing reads, which is a
      // control that works and an override that silently does not.
      const text = renderSection(prose, lessonCtx, { label: "Chapter one" });
      expect(text.split("\n")[0]).toBe("<!--chronoanvil-prose:Chapter one-->");
      expect(proseHeadIn(text)).toBe("Chapter one");
    });

    it("composes the bare marker where no layout named it", () => {
      // Every template this plugin ships, and the reason the goldens did not
      // move this release.
      expect(renderSection(prose, lessonCtx).split("\n")[0]).toBe(
        "<!--chronoanvil-prose-->"
      );
      expect(lesson()).toContain("<!--chronoanvil-prose-->");
      expect(lesson()).not.toContain("<!--chronoanvil-prose:");
    });

    it("normalises a layout's name the way the box's is normalised", () => {
      // ONE NORMALISER, BOTH WRITERS. A preset is written in code and a `-->`
      // in one would break the marker exactly as a typed one would — and the
      // code path is the one nobody is watching when it happens.
      const text = renderSection(prose, lessonCtx, { label: "Aim --> Method" });
      expect(text.split("\n")[0]).toBe("<!--chronoanvil-prose:Aim Method-->");
    });
  });

  describe("a named marker is still a marker", () => {
    it("is still where the section starts", () => {
      // `locate` FALLS BACK TO A `##` PROBE, so a regex that missed a titled
      // opener would not fail loudly — it would report the reader's own first
      // heading as where the section begins, and the attribution would claim
      // their prose.
      const text = named("Chapter one");
      const at = findSection(PROSE_SECTION_ID)!.locate(text, lessonCtx);
      expect(text.slice(at)).toMatch(/^<!--chronoanvil-prose:Chapter one-->/);
      expect(sectionsPresent(text, lessonCtx)).toContain("headings");
      expect(proseCountIn(text)).toBe(1);
    });

    it("is still invisible to a reader who copies the note out", () => {
      // `toPlainMarkdown` is what a note looks like with the plugin gone, and a
      // marker carrying a name is still a marker.
      const plain = toPlainMarkdown(
        named("Chapter one"),
        journalSectionModel(lessonCtx)
      );
      expect(plain).not.toContain("chronoanvil-prose");
      expect(plain).not.toContain("Chapter one");
      expect(plain).toContain("## Overview");
    });

    it("is still a row the editor hides", () => {
      // `marker-lines.ts` reads the bracket with the same function the spans do,
      // so a titled opener is hidden in Live Preview exactly as a bare one is.
      // A regex of its own here is how the two would stop agreeing.
      expect(readCode("marker-lines")).toContain("bracketOpenerOf(line, [");
      expect(readCode("marker-lines")).not.toContain("PROSE_OPENERS");
    });
  });
});
