// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";
import { STUDY_JOURNAL } from "../src/journals/journal";
import {
  composeTemplate,
  journalTemplateFiles,
} from "../src/journals/custom-journal";
import {
  findSection,
  proseIdFor,
  sectionContext,
  sectionRemovable,
  sectionOverrides,
} from "../src/journals/journal-sections";
import {
  applySections,
  planSections,
  sectionsPresent,
} from "../src/journals/journal-plan";

// ── the template editor ───────────────────────────────────────────────────
//
// The modal itself is DOM and Obsidian's Modal base, which the stub does not
// render. What IS testable is every decision it makes before touching the
// screen — which rows are locked, what the footer counts, what Save writes,
// and what it refuses to write — and those are the parts that can lose
// somebody's file.
//
// Each test below corresponds to a line in the editor rather than to a
// function in it: the editor is thin over journal-plan by design, and that is
// what makes it checkable without a browser.

const ctx = sectionContext(STUDY_JOURNAL, { depth: 1 });

// ── THE FIXTURE IS COMPOSED, NOT SHIPPED (5.20) ──────────────────────────
//
// The editor's decisions are about sections that are IN a file: which rows are
// locked, what the footer counts, what Save refuses. A Topic index as the
// generator now writes it holds three, none removable-with-consequences, so
// five of these tests went vacuous or null the moment the defaults changed —
// "counts an addition and a removal" counted one, because there was no `review`
// to remove.
//
// So the fixture names its sections. Nothing the editor does asks whether a
// section was on by default; it reads a file and a tick-list, and this is a
// file a reader could produce in one visit to the editor itself.
const RICH = [
  "banner",
  "trackers",
  "children",
  "stats",
  "path",
  "review",
  "resources",
  "charts",
];
const topic = () =>
  composeTemplate(ctx, RICH, STUDY_JOURNAL.layout?.["index:1"]);
const lessonCtx = sectionContext(STUDY_JOURNAL, {
  kind: STUDY_JOURNAL.kinds.find((k) => k.id === "lesson")!,
});
const lesson = () =>
  journalTemplateFiles(STUDY_JOURNAL).find((f) => f.name === "lesson.md")!
    .content;

// ── A LESSON WITH TWO PROSE BLOCKS (1.0.36) ──────────────────────────────
//
// Prose is `locked` now, so the block these tests remove is one a reader
// ADDED, and this is how they add it: tick a second Prose row and save. The
// second block composes exactly what the first did, which is why the
// assertions below count headings rather than search for them.
const twoBlocks = (): string =>
  applySections(lesson(), lessonCtx, [
    ...sectionsPresent(lesson(), lessonCtx),
    proseIdFor(2),
  ])!;

// An edit to the LAST block — the one being removed — where the same words
// appear in both.
const inSecond = (text: string, find: string, put: string): string => {
  const at = text.lastIndexOf(find);
  return `${text.slice(0, at)}${put}${text.slice(at + find.length)}`;
};

const count = (hay: string, needle: string): number =>
  hay.split(needle).length - 1;

// What the footer shows: adds and removes, never keeps.
const changeCount = (text: string, c = ctx, want?: string[]): number =>
  planSections(text, c, want ?? sectionsPresent(text, c)).filter(
    (o) => o.kind === "add" || o.kind === "remove"
  ).length;

describe("what the footer counts", () => {
  it("is zero on a file nobody has touched", () => {
    // Save is disabled at zero. An editor whose CTA is live before anything
    // has been asked for invites the one click that has no reason to happen.
    expect(changeCount(topic())).toBe(0);
  });

  it("counts an addition and a removal, not the sections left alone", () => {
    const present = sectionsPresent(topic(), ctx);
    const want = [...present.filter((id) => id !== "review"), "find"];
    expect(changeCount(topic(), ctx, want)).toBe(2);
  });

  it("does not count a section the plan refuses to remove", () => {
    // Unticking `banner` produces a `keep` with a reason, not a `remove`. A
    // footer that counted it would promise a change that Save could not make.
    const want = sectionsPresent(topic(), ctx).filter((id) => id !== "banner");
    expect(changeCount(topic(), ctx, want)).toBe(0);
  });
});

describe("which rows are locked", () => {
  it("locks the banner, and says it is required", () => {
    const banner = findSection("banner")!;
    expect(sectionRemovable(banner, ctx, sectionOverrides(ctx, "banner"))).toBe(
      false
    );
    expect(banner.locked).toBe(true);
  });

  it("locks prose by the flag, and not by breaking the derivation", () => {
    // THIS ROW HAS CHANGED SIDES TWICE AND BOTH REVERSALS ARE THE ASSERTION.
    // It first read `.toBe(false)` on the argument that "`headings` is
    // unremovable for a different reason from `banner`: it is ordinary
    // markdown". 5.6 bracketed the headings in two HTML comments, so the
    // plugin could say where they start and stop and the same derivation that
    // refused them started allowing them, untouched.
    //
    // 1.0.36 made the section MANDATORY — *"Prose, a mandatory section (cant be
    // removed) which encompasses the plain markdown block a user writes"* — so
    // the FLAG refuses it now. The derivation underneath still says yes, and
    // that is what is worth asserting: nothing was switched off to get here,
    // which is why the row can still scope the answer by ordinal and let a
    // block the reader ADDED go.
    const prose = findSection("headings")!;
    expect(prose.locked).toBe(true);
    const overrides = sectionOverrides(lessonCtx, "headings");
    expect(sectionRemovable(prose, lessonCtx, overrides)).toBe(false);
    expect(sectionRemovable({ ...prose, locked: false }, lessonCtx, overrides)).toBe(
      true
    );
    const banner = findSection("banner")!;
    expect(
      sectionRemovable(banner, lessonCtx, sectionOverrides(lessonCtx, "banner"))
    ).toBe(false);
  });

  it("leaves every fenced section unlocked", () => {
    for (const id of ["review", "path", "resources", "children", "stats"]) {
      const s = findSection(id)!;
      expect(sectionRemovable(s, ctx, sectionOverrides(ctx, id)), id).toBe(true);
    }
  });
});

describe("what Save writes", () => {
  it("writes nothing when the plan is empty", () => {
    // The editor treats null as "nothing to change" and shows a Notice rather
    // than calling modify with identical bytes — a no-op write still stamps
    // mtime, which is enough to make a sync client think something happened.
    expect(applySections(topic(), ctx, sectionsPresent(topic(), ctx))).toBeNull();
  });

  it("writes only what the plan named", () => {
    const present = sectionsPresent(topic(), ctx);
    const want = present.filter((id) => id !== "review");
    const after = applySections(topic(), ctx, want)!;
    const now = sectionsPresent(after, ctx);
    expect(present.filter((id) => !now.includes(id))).toEqual(["review"]);
    expect(now.filter((id) => !present.includes(id))).toEqual([]);
  });

  it("reports the lines standing in the way of a removal", () => {
    // The editor used to read "kept N lines of your text" off keepsContent
    // after removing the fence. Since 2.59.7 the removal is REFUSED instead, so
    // the same field now says what the reader has to clear before the section
    // can go — the count is still load-bearing, for a different sentence.
    const written = topic().replace(
      "<!--chronoanvil:path\n-->",
      "<!--chronoanvil:path\nFirst quadratics.\nThen factorising.\n-->"
    );
    const want = sectionsPresent(written, ctx).filter((id) => id !== "path");
    const path = planSections(written, ctx, want).find(
      (o) => o.sectionId === "path"
    );
    expect(path?.kind).toBe("keep");
    expect(path?.detail).toContain("2 lines");
    // And nothing is written: the refusal is the only requested change, so
    // applySections returns its "no change" null rather than rewriting the file
    // identically. The reader's two lines are still exactly where they were.
    expect(applySections(written, ctx, want)).toBeNull();
  });
});

describe("what Save refuses", () => {
  it("abandons the write if the file changed while the window was open", () => {
    // Not testable through the modal without a vault, but the condition is:
    // the editor compares the text it read on open against the file now, and
    // writes nothing if they differ. section-insert.ts learned this for a
    // suggester — "modal but not instantaneous" — and a window a reader can
    // leave open all afternoon is a far longer gap.
    //
    // What this asserts is the property that makes the check meaningful: the
    // plan is computed from the text it was given, so a stale text yields a
    // stale plan rather than an obviously wrong one.
    const stale = topic();
    // THE REMOVAL IS THE PLUGIN'S OWN AS OF 5.18, because the band is no longer
    // a fence of its own to cut with a pattern: it is the second page of the
    // group the tracker grid opens. Asking `applySections` for the page without
    // it is the same edit a reader makes, and it cannot fall out of step with
    // how the section is composed.
    const moved = applySections(
      stale,
      ctx,
      sectionsPresent(stale, ctx).filter((id) => id !== "stats")
    )!;
    expect(sectionsPresent(stale, ctx)).toContain("stats");
    expect(sectionsPresent(moved, ctx)).not.toContain("stats");
    expect(planSections(stale, ctx, sectionsPresent(moved, ctx))).not.toEqual(
      planSections(moved, ctx, sectionsPresent(moved, ctx))
    );
  });

  it("removes a bracketed prose block and keeps every heading written under", () => {
    // ON THE SECOND BLOCK, BECAUSE THE FIRST CANNOT GO (1.0.36). The rule is
    // unchanged and is the same code; what changed is which block a reader may
    // point it at. `twoBlocks` is the note a reader gets by ticking a second
    // Prose row on, and the second block composes exactly what the first did.
    const two = twoBlocks();
    const present = sectionsPresent(two, lessonCtx);
    expect(present).toContain("headings#2");
    const want = present.filter((id) => id !== "headings#2");

    // The composed Lesson ships PROMPT TEXT under four of its five headings —
    // "What is this lesson about", the `- **Definition:**` bullets — and none
    // of it is the reader's. A blank-line test would have called all four
    // written and handed back the whole block to somebody who asked for it
    // to go; the rule is instead whether the words differ from the ones the
    // catalogue put there, so an untouched note loses the lot.
    const op = planSections(two, lessonCtx, want).find(
      (o) => o.sectionId === "headings#2"
    )!;
    expect(op.kind).toBe("remove");
    expect(op.keepsContent).toBeUndefined();

    const after = applySections(two, lessonCtx, want)!;
    expect(after).not.toBeNull();
    // COUNTED RATHER THAN SEARCHED FOR, because the block that stays carries a
    // copy of every heading the block that goes did. One of each means the
    // second block left nothing at all behind.
    expect(count(after, "## Overview")).toBe(1);
    expect(count(after, "## Key Concepts")).toBe(1);

    // One line typed under one heading, and that heading alone survives with
    // everything under it.
    const used = inSecond(
      two,
      "What is this lesson about, and why does it matter?",
      "Ohm's law, and why I keep forgetting it"
    );
    const op2 = planSections(used, lessonCtx, want).find(
      (o) => o.sectionId === "headings#2"
    )!;
    expect(op2.keepsContent?.map((k) => k.key)).toEqual(["Overview"]);
    const after2 = applySections(used, lessonCtx, want)!;
    expect(after2).toContain("why I keep forgetting it");
    expect(count(after2, "## Overview")).toBe(2);
    expect(count(after2, "## Key Concepts")).toBe(1);

    // The markers go, always — a bracket with nothing in it would be a note
    // carrying an invisible claim about a section it no longer has. One pair
    // is left standing, and it is the first block's.
    for (const text of [after, after2]) {
      expect(text).not.toContain("chronoanvil-skeleton");
      expect(count(text, "<!--chronoanvil-prose-->")).toBe(1);
    }
  });

  it("still refuses a skeleton that was written before the markers existed", () => {
    // EVERY NOTE IN EVERY VAULT ON THE DAY 5.6 SHIPS. `sectionRemovable` says
    // the section may go, and it is right about the catalogue; this file cannot
    // tell its `## Overview` from one the reader typed, so the plan keeps it and
    // says why. That split is `SectionView.removable` versus `refusal`, and it
    // is the reason those are two fields.
    // THE MARKER THE TEMPLATE WRITES TODAY, which is `chronoanvil-prose` since
    // 1.0.36 — `chronoanvil-skeleton` is read and never written, so filtering
    // for it would leave this note fully marked and test nothing.
    const bare = lesson()
      .split("\n")
      .filter((l) => !l.trim().startsWith("<!--/chronoanvil-prose"))
      .filter((l) => !l.trim().startsWith("<!--chronoanvil-prose"))
      .join("\n");
    expect(sectionsPresent(bare, lessonCtx)).toContain("headings");

    const op = planSections(bare, lessonCtx, []).find(
      (o) => o.sectionId === "headings"
    )!;
    expect(op.kind).toBe("keep");
    expect(op.detail).toContain("Reload this note");

    const after = applySections(bare, lessonCtx, []);
    if (after !== null) {
      expect(sectionsPresent(after, lessonCtx)).toContain("headings");
    }
  });
});

describe("the Markdown tab", () => {
  it("shows the file unchanged when nothing is asked for", () => {
    const present = sectionsPresent(topic(), ctx);
    const shown = applySections(topic(), ctx, present) ?? topic();
    expect(shown).toBe(topic());
  });

  it("shows the bytes a save would write, not a rendering of them", () => {
    // A rendered preview would need every widget's action stubbed — a second
    // render path through widgets.ts, which is a parallel implementation of
    // the thing being previewed. A <pre> of the source cannot fire a button.
    const want = sectionsPresent(topic(), ctx).filter((id) => id !== "review");
    const shown = applySections(topic(), ctx, want)!;
    expect(shown).toContain("```chronoanvil");
    expect(shown).not.toContain("review-queue");
  });
});
