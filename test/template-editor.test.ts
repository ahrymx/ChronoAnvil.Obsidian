// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";
import { STUDY_JOURNAL } from "../src/journals/journal";
import { journalTemplateFiles } from "../src/journals/custom-journal";
import {
  findSection,
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
const topic = () =>
  journalTemplateFiles(STUDY_JOURNAL).find((f) => f.name === "topic-index.md")!
    .content;
const lessonCtx = sectionContext(STUDY_JOURNAL, {
  kind: STUDY_JOURNAL.kinds.find((k) => k.id === "lesson")!,
});
const lesson = () =>
  journalTemplateFiles(STUDY_JOURNAL).find((f) => f.name === "lesson.md")!
    .content;

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
    expect(banner.required).toBe(true);
  });

  it("unlocks the prose skeleton, and not by exempting it", () => {
    // 5.6 REVERSED THIS ROW, AND THE REVERSAL IS THE ASSERTION. It read
    // `.toBe(false)` on the argument that "`headings` is unremovable for a
    // different reason from `banner`: it is ordinary markdown". The headings
    // are still ordinary markdown; they are now bracketed by two HTML comments,
    // so the plugin can say where they start and stop, and the same derivation
    // that refused them now allows them.
    //
    // `banner` STAYS LOCKED, which is what shows the derivation was not simply
    // switched off: it is required, and its spacer is a bare `markdown` block
    // besides.
    const headings = findSection("headings")!;
    expect(headings.required).toBeFalsy();
    expect(
      sectionRemovable(headings, lessonCtx, sectionOverrides(lessonCtx, "headings"))
    ).toBe(true);
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

  it("removes a bracketed skeleton and keeps every heading written under", () => {
    const present = sectionsPresent(lesson(), lessonCtx);
    expect(present).toContain("headings");

    // The composed Lesson ships PROMPT TEXT under four of its five headings —
    // "What is this lesson about", the `- **Definition:**` bullets — and none
    // of it is the reader's. A blank-line test would have called all four
    // written and handed back the whole skeleton to somebody who asked for it
    // to go; the rule is instead whether the words differ from the ones the
    // catalogue put there, so an untouched note loses the lot.
    const op = planSections(lesson(), lessonCtx, []).find(
      (o) => o.sectionId === "headings"
    )!;
    expect(op.kind).toBe("remove");
    expect(op.keepsContent).toBeUndefined();

    const after = applySections(lesson(), lessonCtx, [])!;
    expect(after).not.toBeNull();
    expect(after).not.toContain("## Overview");
    // One line typed under one heading, and that heading alone survives with
    // everything under it.
    const used = lesson().replace(
      "What is this lesson about, and why does it matter?",
      "Ohm's law, and why I keep forgetting it"
    );
    const op2 = planSections(used, lessonCtx, []).find(
      (o) => o.sectionId === "headings"
    )!;
    expect(op2.keepsContent?.map((k) => k.key)).toEqual(["Overview"]);
    const after2 = applySections(used, lessonCtx, [])!;
    expect(after2).toContain("## Overview");
    expect(after2).toContain("why I keep forgetting it");
    expect(after2).not.toContain("## Key Concepts");
    // The markers go, always — a bracket with nothing in it would be a note
    // carrying an invisible claim about a section it no longer has.
    for (const text of [after, after2]) {
      expect(text).not.toContain("chronoanvil-skeleton");
    }
  });

  it("still refuses a skeleton that was written before the markers existed", () => {
    // EVERY NOTE IN EVERY VAULT ON THE DAY 5.6 SHIPS. `sectionRemovable` says
    // the section may go, and it is right about the catalogue; this file cannot
    // tell its `## Overview` from one the reader typed, so the plan keeps it and
    // says why. That split is `SectionView.removable` versus `refusal`, and it
    // is the reason those are two fields.
    const bare = lesson()
      .split("\n")
      .filter((l) => !l.trim().startsWith("<!--/chronoanvil-skeleton"))
      .filter((l) => !l.trim().startsWith("<!--chronoanvil-skeleton"))
      .join("\n");
    expect(sectionsPresent(bare, lessonCtx)).toContain("headings");

    const op = planSections(bare, lessonCtx, []).find(
      (o) => o.sectionId === "headings"
    )!;
    expect(op.kind).toBe("keep");
    expect(op.detail).toContain("Reload this page");

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
