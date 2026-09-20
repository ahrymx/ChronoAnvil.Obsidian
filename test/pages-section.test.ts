// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The `pages` tick, after it stopped being a tick at all. 5.20 → 1.0.23.
//
// ── WHAT THIS FILE USED TO ASSERT ────────────────────────────────────────
//
// `kind.pages` had a checkbox of its own on the journal wizard's Structure
// step, beside the kind's emoji, name and rating. 5.20 moved the question onto
// the Sections checklist — the 📄 Pages row — and the move had to carry a seam
// with it, because the section's own gate (`applies: (ctx) => ctx.hasPages`)
// read the config the tick was writing: the row could not come from
// `sectionsFor` while the config still said no, so the SURFACE offered it, a
// second model composed the preview, and `StructuralSink` persisted the config
// before the file was written.
//
// ── AND WHY NONE OF THAT IS LEFT ─────────────────────────────────────────
//
// The reader's account of the bug that ended it: *"only lessons can hold
// pages"*, on a note that was not a Lesson, with the 📄 Pages section missing
// from the catalogue and a pages table already sitting in the note. Every one
// of those is the capability gate talking. A Practice note that grows too long
// to read is the same note a Lesson becomes, and the fact that one kind had
// been ticked in Settings and the other had not is not a fact about either.
//
// So the capability is universal, the gate became a question about the SURFACE
// — a leaf, not an index and not a page — and the row is an ordinary row on an
// ordinary checklist. What this file asserts now is that one fact and the
// absence of the seam: a deleted mechanism that half-survives is worse than
// either state, because the half that remains is the half nothing tests.

import { describe, expect, it } from "vitest";
import {
  defaultSectionIds,
  sectionContext,
  sectionsFor,
  templateTargets,
} from "../src/journals/journal-sections";
import type { SectionContext } from "../src/journals/journal-sections";
import { buildJournalType } from "../src/journals/journal";
import { journalSectionModel } from "../src/journals/journal-plan";
import type { JournalConfig } from "../src/journals/custom-journal";
import { readSrc } from "./sources";
import {
  JournalEditModal,
  normaliseKinds,
} from "../src/core/settings-editors";
import type { TemplateTarget } from "../src/journals/journal-sections";
import type ChronoAnvilPlugin from "../src/main";

const CONFIG = (): JournalConfig => ({
  id: "notes",
  name: "Notes",
  emoji: "📓",
  root: "03 - Journals/Notes",
  templatesFolder: "03 - Journals/Notes/Templates",
  levels: [{ id: "area", noun: "Area", emoji: "📁" }],
  kinds: [{ id: "lesson", emoji: "📘", label: "Lesson" }],
});

const leafCtx = (): SectionContext => {
  const type = buildJournalType(CONFIG());
  const ctx = templateTargets(type).find(
    (t) => t.ctx.noteKind === "leaf"
  )?.ctx;
  if (!ctx) throw new Error("no leaf target");
  return ctx;
};

describe("the `pages` gate, which is a fact about the surface now", () => {
  it("offers it, and defaults it on, for a kind that declares nothing", () => {
    // THE CONFIG ABOVE SAYS NOTHING ABOUT PAGES — there is no field left to say
    // it with. A journal a reader makes in the wizard can split any of its notes
    // the day it exists.
    const ctx = leafCtx();
    expect(sectionsFor(ctx).map((s) => s.id)).toContain("pages");
    // ONE OF THE SECTIONS A LEAF STARTS WITH — it is the "what is below" of a
    // long note. See the catalogue's doctrine comment.
    expect(defaultSectionIds(ctx)).toContain("pages");
  });

  it("offers it on a page too, and ships it on one", () => {
    // WAS "never offers it on a page, which is what a page is a page OF", and
    // that sentence was the whole of 1.0.23's flat model. A page that grows too
    // long to read is the same note a lesson was when it grew too long, so as
    // of 1.0.38 the surface answers yes and a page holds pages at any depth.
    //
    // AND THE DEFAULT WENT WITH IT, ON A SECOND PASS. The first draft shipped
    // `false` here, arguing that an empty *"No pages yet"* card on every page in
    // the vault would be the 1.0.23 tick's mistake with the sign flipped. The
    // reader looked at a composed page and asked for the stacked card a lesson
    // gets — banner, trackers, pages — and the analogy does not hold: in 1.0.23
    // an empty card meant "this KIND can be split" on a kind nobody would split,
    // where here it means "this page can be split", which is the thing this
    // release exists to say and is true of every page there is.
    const type = buildJournalType(CONFIG());
    const page = templateTargets(type).find((t) => t.ctx.noteKind === "page");
    expect(page).toBeDefined();
    expect(page!.ctx.hasPages).toBe(true);
    expect(sectionsFor(page!.ctx).map((s) => s.id)).toContain("pages");
    expect(defaultSectionIds(page!.ctx)).toContain("pages");
  });

  it("never offers it on an index, which holds notes rather than pages", () => {
    const type = buildJournalType(CONFIG());
    const index = templateTargets(type).find(
      (t) => t.ctx.noteKind === "index"
    )!;
    expect(index.ctx.hasPages).toBe(false);
    expect(sectionsFor(index.ctx).map((s) => s.id)).not.toContain("pages");
  });

  it("derives `documentLike` exactly as sectionContext does", () => {
    // Two spellings of one rule is how they come to disagree. The second
    // spelling lived in template-editor.ts and is gone with the seam; this
    // asserts the derivation the one remaining copy makes.
    const type = buildJournalType(CONFIG());
    const ctx = sectionContext(type, { kind: type.kinds[0] });
    expect(ctx.documentLike).toBe(ctx.hasPages || ctx.noteKind === "page");
    const page = sectionContext(type, { page: type.kinds[0] });
    expect(page.documentLike).toBe(true);
  });
});

describe("the table it composes, and takes back out", () => {
  it("writes the index, the button and the bar as one section", () => {
    const ctx = leafCtx();
    const want = defaultSectionIds(ctx);
    const text = journalSectionModel(ctx).apply("", want)!;
    expect(text).toContain("pages-table");
    expect(text).toContain("button:notes:new-page");
  });

  it("takes the table back out when the row is unticked", () => {
    // `applySections` removes a section by knowing it exists and finding it
    // absent from `want`. This was the half that forced 5.20's union model —
    // a catalogue narrowed to the tick list walked past the table and reported
    // nothing to change. One catalogue now, and the removal is expressible in
    // it because `pages` is in it either way.
    const ctx = leafCtx();
    const withTable = journalSectionModel(ctx).apply("", defaultSectionIds(ctx))!;
    expect(withTable).toContain("pages-table");

    const without = defaultSectionIds(ctx).filter((id) => id !== "pages");
    const next = journalSectionModel(ctx).apply(withTable, without);
    expect(next).not.toBeNull();
    expect(next).not.toContain("pages-table");
  });
});

describe("the wizard's Sections checklist, which draws an ordinary row", () => {
  // The private member the claim is about: the row list a target draws.
  class Probe extends JournalEditModal {
    rows(target: TemplateTarget): string[] {
      return (
        this["displayOrder"](target) as { id: string }[]
      ).map((s) => s.id);
    }
  }

  const wizard = (draft: JournalConfig): Probe => {
    const plugin = {
      settings: { customJournals: [], paths: {}, trackers: [] },
      app: { vault: { getAbstractFileByPath: () => null } },
    } as unknown as ChronoAnvilPlugin;
    return new Probe(
      (plugin as unknown as { app: never }).app,
      plugin,
      draft,
      "create",
      -1,
      async () => {}
    );
  };

  // BOTH LISTS NORMALISED, exactly as `renderSections` builds them — the rail
  // must name the files that will actually be written.
  const targetsOf = (draft: JournalConfig): TemplateTarget[] =>
    templateTargets(
      buildJournalType({
        ...draft,
        kinds: normaliseKinds(draft.kinds, { preserveIds: false }),
      })
    );

  it("draws it once, from the catalogue, at its catalogue rank", () => {
    const draft = CONFIG();
    const leaf = targetsOf(draft).find((t) => t.ctx.noteKind === "leaf")!;
    const rows = wizard(draft).rows(leaf);

    // ONCE. It was drawn by `withPagesRow` while the catalogue refused it and by
    // `sectionsFor` once the config agreed, and the two had to be kept from
    // overlapping; there is one producer now, so there is nothing to overlap.
    expect(rows.filter((id) => id === "pages")).toHaveLength(1);
    expect(sectionsFor(leaf.ctx).map((s) => s.id)).toContain("pages");
    // After the tracker card, before the writing — where `displayOrder` promises
    // every row will be.
    expect(rows.indexOf("pages")).toBeGreaterThan(rows.indexOf("trackers"));
    expect(rows.indexOf("pages")).toBeLessThan(rows.indexOf("headings"));
  });

  it("draws it on every target that holds notes below it, and no index", () => {
    // WAS "on the leaf targets and nowhere else". A page target joins them in
    // 1.0.38; an index still does not, because an index holds NOTES and the
    // notes it holds are named by the kind tables above, not by a pages list.
    const draft = CONFIG();
    const p = wizard(draft);
    for (const t of targetsOf(draft)) {
      const holds = t.ctx.noteKind !== "index";
      expect(p.rows(t).includes("pages"), t.key).toBe(holds);
    }
  });

  it("draws it on a kind's saved layout too, where 5.20 could not", () => {
    // A LAYOUT IS A TEMPLATE OF THE SAME KIND, and the tick on it used to be
    // refused for a real reason: *"a per-variant control over a per-kind fact —
    // ticking it on one layout would silently change every other, including the
    // default nobody was looking at."* The tick changes nothing but the file it
    // is on now, so a reader may keep the Pages index on their plain Lesson and
    // leave it off the compact one.
    const draft: JournalConfig = {
      ...CONFIG(),
      variants: [{ id: "compact", label: "Compact", kinds: ["lesson"] }],
    };
    const variant = targetsOf(draft).find(
      (t) => t.ctx.variantId === "compact"
    )!;
    expect(wizard(draft).rows(variant)).toContain("pages");
  });
});

describe("the seam that is gone, and stays gone", () => {
  const editors = readSrc("settings-editors");

  it("no longer draws a Pages field on a kind row", () => {
    expect(editors).not.toContain("pagesBox");
    expect(editors).not.toContain('cls: "ca-kind-field-label", text: "Pages"');
    // And says where it went, so the next reader looking for it finds the
    // answer rather than the hole.
    expect(editors).toContain("A `Pages` CHECKBOX SAT HERE AND IS GONE (5.20)");
  });

  it("writes no config from a section tick", () => {
    // The members that made a checkbox a settings change, BY CALL SITE rather
    // than by name — each of them is named in an obituary three lines from
    // where it used to run, and a sweep for the bare word would be reading the
    // gravestone.
    expect(editors).not.toContain("setKindPaged");
    expect(editors).not.toContain("this.draftKindOf(");
    expect(editors).not.toContain("this.pagesRowOn(");
    expect(editors).not.toContain("withPagesRow(");
    expect(editors).not.toContain("draftKind.pages");
    // And the obituary itself, which is the half a grep for the name finds.
    expect(editors).toContain("A `withPagesRow` STOOD HERE UNTIL 1.0.23");
  });

  it("leaves the section editor with one model and one save", () => {
    const editor = readSrc("section-editor");
    expect(editor).not.toContain("structural?:");
    expect(editor).not.toContain("this.spec.structural");
    expect(editor).not.toContain("private structuralModel");
    expect(editor).toContain("A `StructuralSink` stood here");
    // The window writes the file and nothing else.
    expect(editor).toContain("Nothing writes config from this window");
    // And the template editor asks for neither.
    const template = readSrc("template-editor");
    expect(template).not.toContain("onSetPaged");
    expect(template).not.toContain("modelWith(");
    expect(template).toContain(
      "A `modelWith` AND A `structuralHere` STOOD HERE UNTIL 1.0.23"
    );
  });

  it("keeps no `pages` field on a stored kind", () => {
    // `normaliseKinds` rebuilds every row from the fields the editor knows
    // about, so a stored `pages: true` is dropped on the next save rather than
    // migrated — the treatment `trackers` got in 3.18 §7, for the same reason:
    // nothing reads it.
    const row = normaliseKinds(
      [{ id: "lesson", emoji: "📘", label: "Lesson", pages: true } as never],
      { preserveIds: true }
    )[0];
    expect(row).not.toHaveProperty("pages");
  });
});
