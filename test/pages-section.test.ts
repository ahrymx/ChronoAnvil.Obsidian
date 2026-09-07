// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The `pages` tick, after it stopped being a Structure checkbox. 5.20.
//
// ── WHAT MOVED, AND WHAT MUST NOT ────────────────────────────────────────
//
// `kind.pages` used to have a checkbox of its own on the journal wizard's
// Structure step, beside the kind's emoji, name and rating. Every other field
// on that row is IDENTITY; this one is a decision about what the kind's
// template CONTAINS — so it was asked one step before the step that asks
// exactly that, in a different vocabulary, with nothing on screen connecting
// the two. The documentation had to explain the coupling backwards.
//
// The `pages` SECTION is the control now. What that could not be allowed to
// cost is the gate: `applies: (ctx) => ctx.hasPages` is what stops a layout
// copied out of a paged journal from composing a pages table over a kind that
// has none — `layout-transfer.ts` names this section as its example — and
// composition reads the same predicate. So the gate is untouched, and the row
// is offered BY THE SURFACE while the config still says no.
//
// These are the two halves of that: the gate still bites, and the ctx the
// editor asks about a tick with is the one `sectionContext` would have built.

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
import type { JournalKindConfig } from "../src/journals/custom-journal";
import type ChronoAnvilPlugin from "../src/main";

const CONFIG = (paged: boolean): JournalConfig => ({
  id: "notes",
  name: "Notes",
  emoji: "📓",
  root: "03 - Journals/Notes",
  templatesFolder: "03 - Journals/Notes/Templates",
  levels: [{ id: "area", noun: "Area", emoji: "📁" }],
  kinds: [
    {
      id: "lesson",
      emoji: "📘",
      label: "Lesson",
      ...(paged ? { pages: true as const } : {}),
    },
  ],
});

const leafCtx = (paged: boolean): SectionContext => {
  const type = buildJournalType(CONFIG(paged));
  const ctx = templateTargets(type).find(
    (t) => t.ctx.noteKind === "leaf"
  )?.ctx;
  if (!ctx) throw new Error("no leaf target");
  return ctx;
};

describe("the `pages` gate, which the 5.20 move had to leave alone", () => {
  it("refuses the section on a kind whose config says it has no pages", () => {
    const ids = sectionsFor(leafCtx(false)).map((s) => s.id);
    expect(ids).not.toContain("pages");
  });

  it("offers it, and defaults it on, the moment the config says otherwise", () => {
    const ctx = leafCtx(true);
    expect(sectionsFor(ctx).map((s) => s.id)).toContain("pages");
    // ONE OF THE FOUR a page starts with, where the kind has pages at all —
    // it is the "what is below" of a long note. See the catalogue's doctrine
    // comment.
    expect(defaultSectionIds(ctx)).toContain("pages");
  });

  it("never offers it on a page, which is what a page is a page OF", () => {
    const type = buildJournalType(CONFIG(true));
    const page = templateTargets(type).find((t) => t.ctx.noteKind === "page");
    expect(page).toBeDefined();
    expect(sectionsFor(page!.ctx).map((s) => s.id)).not.toContain("pages");
  });
});

describe("the context the editor asks a tick about", () => {
  // `openTemplateEditor`'s `modelWith`, spelled here so the claim is about
  // behaviour rather than about the source line. A model built for a list
  // holding `pages` must be indistinguishable from one built for a kind whose
  // config already said so — otherwise the preview shows one thing and Save
  // writes another.
  const modelWith = (ctx: SectionContext, ids: string[]) => {
    const paged = ids.includes("pages") || ctx.hasPages;
    return journalSectionModel({
      ...ctx,
      hasPages: paged,
      documentLike: paged || ctx.noteKind === "page",
    });
  };

  it("composes the same template a stored `pages: true` would", () => {
    const unpaged = leafCtx(false);
    const paged = leafCtx(true);
    const want = defaultSectionIds(paged);

    const fromTick = modelWith(unpaged, [...want]).apply("", want);
    const fromConfig = journalSectionModel(paged).apply("", want);

    expect(fromTick).toBe(fromConfig);
    expect(fromTick).toContain("pages-table");
  });

  it("takes the table back out when the row is unticked", () => {
    // THE HALF THAT FORCED THE UNION. `applySections` removes a section by
    // knowing it exists and finding it absent from `want` — so a model narrowed
    // to the tick list has no `pages` in its catalogue, walks past the table and
    // reports nothing to change. The untick would then clear `kind.pages` and
    // leave the table in the file, which is the one state this whole seam is
    // supposed to make unreachable.
    const paged = leafCtx(true);
    const withTable = journalSectionModel(paged).apply(
      "",
      defaultSectionIds(paged)
    )!;
    expect(withTable).toContain("pages-table");

    const without = defaultSectionIds(paged).filter((id) => id !== "pages");
    const next = modelWith(paged, without).apply(withTable, without);
    expect(next).not.toBeNull();
    expect(next).not.toContain("pages-table");
  });

  it("leaves a ctx that never had the question alone", () => {
    // An index has no `hasPages` to turn on and no kind to write it to. The
    // editor is not given the sink there at all — see `structuralHere` — and
    // the derivation would be a no-op if it were.
    const type = buildJournalType(CONFIG(true));
    const index = templateTargets(type).find(
      (t) => t.ctx.noteKind === "index"
    )!;
    expect(index.ctx.hasPages).toBe(false);
    expect(sectionsFor(index.ctx).map((s) => s.id)).not.toContain("pages");
  });

  it("derives `documentLike` exactly as sectionContext does", () => {
    // Two spellings of one rule is how they come to disagree. This asserts the
    // derivation rather than trusting that the copy in template-editor.ts is
    // still the same shape as the original.
    const type = buildJournalType(CONFIG(true));
    const ctx = sectionContext(type, { kind: type.kinds[0] });
    expect(ctx.documentLike).toBe(ctx.hasPages || ctx.noteKind === "page");
  });
});

describe("the wizard's Sections checklist, which took the question over", () => {
  // The two private members the claim is about: the row list a target draws,
  // and the draft row a tick on it writes to.
  class Probe extends JournalEditModal {
    rows(target: TemplateTarget): string[] {
      return (
        this["displayOrder"](target) as { id: string }[]
      ).map((s) => s.id);
    }
    kindOf(target: TemplateTarget): JournalKindConfig | null {
      return this["draftKindOf"](target) as JournalKindConfig | null;
    }
    offersHere(target: TemplateTarget): boolean {
      return this["pagesRowOn"](target) as boolean;
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
  // must name the files that will actually be written, and `draftKindOf` pairs
  // against the same normalisation.
  const targetsOf = (draft: JournalConfig): TemplateTarget[] =>
    templateTargets(
      buildJournalType({
        ...draft,
        kinds: normaliseKinds(draft.kinds, { preserveIds: false }),
      })
    );

  it("offers the row on an unpaged kind, at its catalogue rank", () => {
    const draft = CONFIG(false);
    const leaf = targetsOf(draft).find((t) => t.ctx.noteKind === "leaf")!;
    const rows = wizard(draft).rows(leaf);

    // Offered, even though `sectionsFor` refuses it — that is the whole seam.
    expect(rows).toContain("pages");
    expect(sectionsFor(leaf.ctx).map((s) => s.id)).not.toContain("pages");
    // And placed where it would go if ticked, which is what `displayOrder`
    // promises every unticked row: after the tracker card, before the writing.
    expect(rows.indexOf("pages")).toBeGreaterThan(rows.indexOf("trackers"));
    expect(rows.indexOf("pages")).toBeLessThan(rows.indexOf("headings"));
  });

  it("draws it once, not twice, once the kind is paged", () => {
    const draft = CONFIG(true);
    const leaf = targetsOf(draft).find((t) => t.ctx.noteKind === "leaf")!;
    const rows = wizard(draft).rows(leaf);
    expect(rows.filter((id) => id === "pages")).toHaveLength(1);
  });

  it("keeps it off every target that is not a kind's own default", () => {
    const draft = CONFIG(true);
    const p = wizard(draft);
    for (const t of targetsOf(draft)) {
      const own = t.ctx.noteKind === "leaf";
      expect(p.offersHere(t)).toBe(own);
      if (!own) expect(p.rows(t)).not.toContain("pages");
    }
  });

  it("finds the draft row even while another kind's label is still blank", () => {
    // `normaliseKinds` DROPS an unlabelled row, so the built type's kinds and
    // `draft.kinds` are the same length only while the form is complete — and
    // this is read from a checkbox handler, which is exactly when it might not
    // be. Indexing straight into `draft.kinds` writes `pages` onto the wrong
    // kind here.
    const draft = CONFIG(false);
    draft.kinds = [
      { id: "", emoji: "📝", label: "" },
      ...draft.kinds,
      { id: "practice", emoji: "✏️", label: "Practice" },
    ];
    const p = wizard(draft);
    for (const t of targetsOf(draft).filter((x) => x.ctx.noteKind === "leaf")) {
      expect(p.kindOf(t)?.id).toBe(t.ctx.kind?.id);
    }
  });
});

describe("the Structure checkbox, which is gone", () => {
  const editors = readSrc("settings-editors");

  it("no longer draws a Pages field on a kind row", () => {
    expect(editors).not.toContain("pagesBox");
    expect(editors).not.toContain('cls: "ca-kind-field-label", text: "Pages"');
    // And says where it went, so the next reader looking for it finds the
    // answer rather than the hole.
    expect(editors).toContain("A `Pages` CHECKBOX SAT HERE AND IS GONE (5.20)");
  });

  it("writes the tick back from the section list instead", () => {
    expect(editors).toContain("draftKind.pages = box.checked || undefined");
    expect(editors).toContain("private async setKindPaged(");
    // Through the same confirmation every other kind change goes through —
    // unsetting it is a change `diffKinds` already has the sentence for.
    expect(editors).toContain("kindChangeNeedsConfirming(changes)");
  });

  it("offers the row on a kind's default template only", () => {
    // A saved layout is one arrangement of a kind among several; a per-variant
    // control over a per-kind fact would change every other layout of that kind
    // from a window nobody had the others open in.
    expect(editors).toContain(
      '(target.ctx.variantId ?? "default") === "default"'
    );
    expect(readSrc("template-editor")).toContain(
      '(ctx.variantId ?? "default") === "default"'
    );
  });
});
