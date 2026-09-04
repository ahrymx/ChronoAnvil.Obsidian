// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";
import { studyFile, studyTemplate } from "./study-template";
import {
  STUDY_CONFIG,
  STUDY_JOURNAL,
  JournalType,
  registeredJournalTypes,
} from "../src/journals/journal";
import {
  JOURNAL_SECTIONS,
  defaultSectionIds,
  detectSections,
  findSection,
  renderSection,
  sectionApplies,
  sectionContext,
  sectionRemovable,
  sectionsFor,
  typeRating,
} from "../src/journals/journal-sections";
import type {
  JournalSection,
  SectionContext,
} from "../src/journals/journal-sections";
import {
  JournalConfig,
  buildJournalType,
  composeTemplate,
  freshCustomJournal,
  journalNotesBase,
  journalTemplateFiles,
} from "../src/journals/custom-journal";
import { templateTargets } from "../src/journals/journal-sections";
import { kindTableProperties } from "../src/ui/tables";
import { studyConfigFor } from "./study-template";

const asset = studyFile;

const indexCtx = (type: JournalType, depth: number) =>
  sectionContext(type, { depth });
const kindCtx = (type: JournalType, id: string) =>
  sectionContext(type, { kind: type.kinds.find((k) => k.id === id)! });
const pageCtx = (type: JournalType, ownerId: string) =>
  sectionContext(type, { page: type.kinds.find((k) => k.id === ownerId)! });

describe("the section catalogue", () => {
  describe("the block model", () => {
    // Three shapes rather than one: Study (two levels, two rated kinds, pages),
    // a two-level custom type, and the bare default. The invariants are about
    // every section on every surface, so the fixtures have to cover the
    // surfaces that exist.
    const cooking = buildJournalType({
      ...freshCustomJournal(new Set()),
      id: "cooking",
      levels: [
        { id: "cuisine", noun: "Cuisine", fallbackEmoji: "🍳" },
        { id: "dish", noun: "Dish", fallbackEmoji: "🍲" },
      ],
      kinds: [
        {
          id: "recipe",
          emoji: "🍽️",
          label: "Recipe",
          rating: "confidence",
          pages: true,
        },
        { id: "attempt", emoji: "🔥", label: "Attempt" },
      ],
    });
    const plain = buildJournalType(freshCustomJournal(new Set()));

    // Every surface a section can be asked to render on, so the invariants are
    // measured against the whole matrix rather than one convenient template.
    const surfaces = (type: JournalType) => [
      ...type.levels.map((_l, i) => indexCtx(type, i)),
      ...type.kinds.map((k) => kindCtx(type, k.id)),
      ...type.kinds.filter((k) => k.pages).map((k) => pageCtx(type, k.id)),
    ];

    const everyRender = (fn: (s: JournalSection, ctx: SectionContext) => void) => {
      for (const type of [STUDY_JOURNAL, cooking, plain]) {
        for (const ctx of surfaces(type)) {
          for (const s of sectionsFor(ctx)) fn(s, ctx);
        }
      }
    };

    it("gives every section at most one fence", () => {
      // THE rule of the block model. A section's fence is its handle in a
      // file: one fence means "find this section" is an exact match rather
      // than a guess about which of several blocks were the plugin's, which
      // is the difference between removing a section being a splice and being
      // a gamble with somebody's note.
      //
      // Reachable only because 2.54 made the note tables native — a ```base
      // block cannot live inside a ```chronoanvil one, so while `children`
      // emitted Bases tables this was impossible rather than merely unmet.
      everyRender((s, ctx) => {
        const fences = s.render(ctx).filter((b) => b.kind === "fence");
        expect(fences.length, `${s.id} on ${ctx.typeValue}`).toBeLessThanOrEqual(
          1
        );
      });
    });

    it("emits no block kind outside the four the model declares", () => {
      // Exhaustiveness the type system can't check at runtime. In particular
      // there is no `base` variant any more, and a section quietly growing one
      // back would be the first block that could not fold into its own fence.
      //
      // `bracketed` IS THE FOURTH, AS OF 5.6, and the list grew rather than
      // `markdown` widening — which is the whole of why the prose skeleton
      // became removable without `sectionRemovable` being told about it.
      everyRender((s, ctx) => {
        for (const b of s.render(ctx)) {
          expect(
            ["fence", "region", "markdown", "bracketed"],
            s.id
          ).toContain(b.kind);
        }
      });
    });

    it("brackets the only prose it writes, and leaves the spacer bare", () => {
      // The two markdown-ish block kinds, told apart by whether the plugin can
      // prove it wrote them. Exactly one section emits each, and a third
      // emitting either would be a section quietly deciding its own
      // removability.
      const bracketed = new Set<string>();
      const bare = new Set<string>();
      everyRender((s, ctx) => {
        for (const b of s.render(ctx)) {
          if (b.kind === "bracketed") bracketed.add(s.id);
          if (b.kind === "markdown") bare.add(s.id);
        }
      });
      expect([...bracketed]).toEqual(["headings"]);
      expect([...bare]).toEqual(["banner"]);
    });

    it("derives removability from the blocks rather than a flag", () => {
      // A section is removable exactly when everything it wrote can be found
      // again. One is not, for its own stated reason.
      const ctx = indexCtx(STUDY_JOURNAL, 1);
      const leaf = kindCtx(STUDY_JOURNAL, "lesson");

      // Required, and its spacer is loose markdown besides.
      expect(sectionRemovable(findSection("banner")!, ctx)).toBe(false);
      // THE PROSE SKELETON IS THE ONE THAT CHANGED SIDES (5.6), and it changed
      // sides without this function being touched: its headings are the same
      // `## ` markdown they always were, and they now sit between two markers,
      // so "everything it wrote can be found again" is true of it. The claim
      // this file makes is about the derivation, so the case that proves the
      // derivation is honest is one that MOVED under it.
      expect(sectionRemovable(findSection("headings")!, leaf)).toBe(true);

      // Everything else is fences and regions, both provable.
      expect(sectionRemovable(findSection("review")!, ctx)).toBe(true);
      expect(sectionRemovable(findSection("path")!, ctx)).toBe(true);
      expect(sectionRemovable(findSection("recall")!, leaf)).toBe(true);
    });

    it("makes a section unremovable if and only if it emits markdown", () => {
      // The derivation itself, not the two cases above: a flag on the
      // catalogue would let a section claim to be removable and then emit
      // prose, and this is what stops that being expressible.
      everyRender((s, ctx) => {
        const emitsProse = s.render(ctx).some((b) => b.kind === "markdown");
        const expected = !s.required && !emitsProse;
        expect(sectionRemovable(s, ctx), `${s.id} on ${ctx.typeValue}`).toBe(
          expected
        );
      });
    });

    it("puts a region immediately after the fence that writes to it", () => {
      // Contiguity is what makes a section one run: cut-and-paste moves the
      // whole thing, and a splice is well-defined. A region separated from its
      // fence by another section's block would be neither.
      everyRender((s, ctx) => {
        const parts = s.render(ctx);
        parts.forEach((b, i) => {
          if (b.kind !== "region") return;
          const before = parts[i - 1];
          expect(
            before && (before.kind === "fence" || before.kind === "region"),
            `${s.id}: region ${b.key} is not adjacent to its fence`
          ).toBe(true);
        });
      });
    });

    it("round-trips a section through renderSection and back to locate", () => {
      // The blocks are the source of truth and the markdown is derived, so a
      // section must be able to find what renderSection wrote for it.
      everyRender((s, ctx) => {
        expect(
          s.locate(renderSection(s, ctx), ctx),
          `${s.id} on ${ctx.typeValue}`
        ).toBeGreaterThanOrEqual(0);
      });
    });

    it("keeps the banner's spacer tight against its fence", () => {
      // The one tight join in the catalogue, and the reason it exists: the
      // spacer is documented as sitting on line 0 of the body so a click at
      // the top of a note lands on it rather than inside the banner fence. A
      // blank line between them would not break that, but composeTemplate's
      // frontmatter handling is written around the pairing, so the adjacency
      // is asserted rather than assumed.
      const out = renderSection(findSection("banner")!, indexCtx(cooking, 0));
      expect(out.startsWith("`chronoanvil:spacer`\n```chronoanvil")).toBe(true);
    });
  });

  describe("shape", () => {
    it("has a unique id per section", () => {
      const ids = JOURNAL_SECTIONS.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it("gives every section a label and a one-line blurb", () => {
      // Both are read by the wizard's checklist and its schematic. A section
      // with no blurb renders as a bare id in the only surface where a reader
      // finds out what it is.
      for (const s of JOURNAL_SECTIONS) {
        expect(s.label.length, s.id).toBeGreaterThan(0);
        expect(s.blurb.length, s.id).toBeGreaterThan(0);
        expect(s.blurb, s.id).not.toContain("\n");
      }
    });

    it("claims at least one directive per widget section", () => {
      // `claims` is what the coverage assertion below measures Study against.
      // A section claiming nothing is invisible to it.
      //
      // `headings` is the one exemption, and it is exempt because it emits no
      // directive at all — it is markdown, which is the whole point of it (see
      // the section). Coverage is unaffected: a template gains no directive
      // from it for the assertion to miss.
      for (const s of JOURNAL_SECTIONS) {
        if (s.id === "headings") {
          expect(s.claims, s.id).toEqual([]);
          continue;
        }
        expect(s.claims.length, s.id).toBeGreaterThan(0);
      }
    });

    it("makes only the banner required", () => {
      // A journal note with no `journal-header` has no title, no crumbs and
      // nowhere to render a tracker — the exact state 2.28 shipped to end, and
      // the one thing the wizard must not let you re-create. Everything else
      // is taste, and a catalogue that called more than one section mandatory
      // would be deciding layout rather than offering it.
      expect(JOURNAL_SECTIONS.filter((s) => s.required).map((s) => s.id)).toEqual(
        ["banner"]
      );
    });

    it("finds a section it renders by id", () => {
      for (const s of JOURNAL_SECTIONS) {
        expect(findSection(s.id)).toBe(s);
      }
      expect(findSection("nope")).toBeUndefined();
    });
  });

  describe("surface", () => {
    // The point of the field: "which widgets belong on an index note versus a
    // leaf note" was knowledge that existed only in the shape of four shipped
    // markdown files. These assertions are that knowledge, written down.
    const subject = indexCtx(STUDY_JOURNAL, 0);
    const lesson = kindCtx(STUDY_JOURNAL, "lesson");

    it("keeps index-only sections off a leaf note", () => {
      for (const id of ["children", "find", "review", "progress", "tasks"]) {
        expect(sectionApplies(findSection(id)!, lesson), id).toBe(false);
        expect(sectionApplies(findSection(id)!, subject), id).toBe(true);
      }
    });

    it("keeps leaf-only sections off an index note", () => {
      for (const id of ["recall", "checklist"]) {
        expect(sectionApplies(findSection(id)!, subject), id).toBe(false);
      }
    });

    it("offers a both-surface section on either", () => {
      for (const id of ["banner", "nav", "prose", "resources"]) {
        expect(sectionApplies(findSection(id)!, subject), id).toBe(true);
        expect(sectionApplies(findSection(id)!, lesson), id).toBe(true);
      }
    });

    it("does not offer pages to a kind that cannot hold them", () => {
      // `applies` rather than `default`: a Practice note has no pages, so the
      // section is absent from the picker rather than sitting in it unticked
      // offering something that would render an empty table forever.
      expect(sectionApplies(findSection("pages")!, lesson)).toBe(true);
      expect(
        sectionApplies(findSection("pages")!, kindCtx(STUDY_JOURNAL, "practice"))
      ).toBe(false);
    });

    it("always includes the required section in what it offers", () => {
      for (const ctx of [subject, lesson, indexCtx(STUDY_JOURNAL, 1)]) {
        expect(defaultSectionIds(ctx)).toContain("banner");
      }
    });
  });

  describe("defaults follow structure, not the type's name", () => {
    // The `default` predicate reads `hasSubContainers` and `hasPages` —
    // structural facts every journal type can answer — rather than checking
    // which type it is on. These assertions are what stops that slipping.
    const cooking = buildJournalType({
      ...freshCustomJournal(new Set()),
      levels: [
        { noun: "Cuisine", fallbackEmoji: "🍳" },
        { noun: "Dish", fallbackEmoji: "🍲" },
      ],
      kinds: [{ id: "recipe", emoji: "🍽️", label: "Recipe", rating: "difficulty" }],
    });

    it("gives a two-level custom journal the same index sets Study gets", () => {
      expect(defaultSectionIds(indexCtx(cooking, 0))).toEqual(
        defaultSectionIds(indexCtx(STUDY_JOURNAL, 0))
      );
      expect(defaultSectionIds(indexCtx(cooking, 1))).toEqual(
        defaultSectionIds(indexCtx(STUDY_JOURNAL, 1))
      );
    });

    // ── STRUCTURE NOW DECIDES WHAT IS *OFFERED*, NOT WHAT IS ON (5.20) ──
    //
    // These two tests used to read `defaultSectionIds` and assert that `find`,
    // `progress` and `tasks` were pre-ticked on a top index and off on the
    // deepest, and that `path` was the other way round. Both claims are gone
    // with the per-section judgements that produced them: an index of any depth
    // now composes banner, trackers and its children, and every one of those
    // four is a box a reader ticks.
    //
    // THE STRUCTURAL QUESTION IS STILL ASKED, one call to the left. `applies`
    // is what a surface offers and `default` is what it starts with, and the
    // pair were only ever conflated because `default` happened to answer both.
    // A section that is off everywhere but offered nowhere is unreachable, so
    // the offer set is the thing worth pinning now.
    it("offers the aggregates on every index, whatever its depth", () => {
      for (const depth of [0, 1]) {
        const offered = sectionsFor(indexCtx(cooking, depth)).map((s) => s.id);
        for (const id of ["find", "progress", "tasks", "path"]) {
          expect(offered, `${id} @ ${depth}`).toContain(id);
        }
      }
    });

    it("starts every index with the same three, whatever its depth", () => {
      for (const depth of [0, 1]) {
        expect(defaultSectionIds(indexCtx(cooking, depth)), `${depth}`).toEqual([
          "banner",
          "trackers",
          "children",
        ]);
      }
    });

    it("gives a flat journal's only index the deepest-level arrangement", () => {
      // One level means its children are notes, so it is a deepest index even
      // though it is also the top one.
      const flat = buildJournalType(freshCustomJournal(new Set()));
      expect(defaultSectionIds(indexCtx(flat, 0))).toEqual(
        defaultSectionIds(indexCtx(cooking, 1))
      );
    });

    it("leaves prose and nav unticked everywhere", () => {
      // Both are offered, neither is assumed: no shipped template carries a
      // `links:` row (the banner already has crumbs) and the shipped prose is
      // ordinary markdown headings that outlive the plugin.
      for (const ctx of [
        indexCtx(cooking, 0),
        indexCtx(cooking, 1),
        kindCtx(cooking, "recipe"),
      ]) {
        expect(defaultSectionIds(ctx)).not.toContain("prose");
        expect(defaultSectionIds(ctx)).not.toContain("nav");
      }
    });
  });

  describe("rendering asks nothing about which type it is on", () => {
    const cooking = buildJournalType({
      ...freshCustomJournal(new Set()),
      id: "cooking",
      levels: [
        { noun: "Cuisine", fallbackEmoji: "🍳" },
        { noun: "Dish", fallbackEmoji: "🍲" },
      ],
      kinds: [{ id: "recipe", emoji: "🍽️", label: "Recipe", rating: "difficulty" }],
    });

    it("names the container from the type's own noun", () => {
      const top = composeTemplate(indexCtx(cooking, 0));
      expect(top).toContain("header:🗂️ Dishes");
      expect(top).not.toContain("Topic");
    });

    it("names the notes table from the type's own kind", () => {
      const deepest = composeTemplate(indexCtx(cooking, 1));
      expect(deepest).toContain("header:🍽️ Recipes");
      expect(deepest).toContain("kind-table:recipe");
      expect(deepest).toContain("button:cooking:new-recipe");
    });

    it("writes the whole notes section as one fence", () => {
      // The three lines per kind — header, create button, table — go in ONE
      // ```chronoanvil fence, and every kind shares it. Obsidian renders each
      // markdown block as its own sibling element, so a header in one fence
      // and its table in the next are two boxes with a gap no styling can
      // close; welding them is the same fix 2.13.9 made to the Journals card.
      //
      // This is also what `kind-table` exists for: a ```base block cannot live
      // inside a chronoanvil fence, so while the tables were Bases tables the
      // rule was unreachable and a two-kind index shipped four separate blocks.
      const twoKind = buildJournalType({
        ...freshCustomJournal(new Set()),
        id: "cooking",
        levels: [{ noun: "Cuisine", fallbackEmoji: "🍳" }],
        kinds: [
          { id: "recipe", emoji: "🍽️", label: "Recipe", rating: "difficulty" },
          { id: "attempt", emoji: "🔥", label: "Attempt" },
        ],
      });
      const section = findSection("children")!;
      const rendered = renderSection(section, indexCtx(twoKind, 0));
      expect(rendered.match(/```chronoanvil/g)?.length).toBe(1);
      expect(rendered).not.toContain("```base");
      // ONE BAR, THEN A GROUP PER KIND (5.12). The fence opens with the
      // section's own name — and only that. Each kind is a level-2 head with
      // its own create button inline in it and its own table under it, so the
      // section bar has no actions strip at all: an action belongs beside the
      // rows it adds to, and every row here is inside a group.
      expect(rendered.split("\n").filter((l) => l.trim())).toEqual([
        "```chronoanvil",
        "header:🗂️ What's below",
        "header:2:🍽️ Recipes",
        "button:cooking:new-recipe",
        "kind-table:recipe",
        "header:2:🔥 Attempts",
        "button:cooking:new-attempt",
        "kind-table:attempt",
        "```",
      ]);
    });

    it("welds the container table into its header too", () => {
      // The other branch of the same section. Left as two blocks it would
      // render as one card at one depth and two at another, which is worse
      // than either.
      const section = findSection("children")!;
      const rendered = renderSection(section, indexCtx(cooking, 0));
      expect(rendered.match(/```chronoanvil/g)?.length).toBe(1);
      // `level-index` SINCE 4.16 §1, and the word is the only thing that
      // changed here: the catalogue writes the widget that asks what is below
      // rather than the one that assumed folders.
      expect(rendered).toContain("level-index");
    });

    it("still finds the section in a note written before the rename", () => {
      // THE COMPATIBILITY THAT MATTERS MORE THAN THE RENAME. Every Subject index
      // note in every vault carries a bare `topics-table`; a locator that knew
      // only the new word would report this section absent on all of them and
      // offer to add a second copy of what is already there.
      const section = findSection("children")!;
      const ctx = indexCtx(cooking, 0);
      const old = "```chronoanvil\nheader:🗂️ Dishes\nbutton:cooking:new-container\ntopics-table\n```\n";
      expect(section.locate(old, ctx)).toBeGreaterThanOrEqual(0);
      expect(section.locate(renderSection(section, ctx), ctx)).toBeGreaterThanOrEqual(0);
    });

    it("charts the rating the type declares, not confidence", () => {
      expect(typeRating(cooking)).toBe("difficulty");
      // COMPOSED WITH `charts` NAMED, because it is no longer on by default
      // (5.20) and this test is about what the section RENDERS rather than
      // about whether a fresh index carries it.
      const top = composeTemplate(indexCtx(cooking, 0), ["banner", "charts"]);
      expect(top).toContain("jchart:j1:trend:difficulty");
      expect(top).toContain("jchart:j2:breakdown:difficulty");
      expect(top).not.toContain("confidence");
    });

    it("still writes a usable charts region for a type that rates nothing", () => {
      // The region is what "Add chart" writes into, so it is worth having even
      // empty. Seeding a chart of a property no note carries is not.
      const unrated = buildJournalType({
        ...freshCustomJournal(new Set()),
        kinds: [{ id: "entry", emoji: "📝", label: "Entry" }],
      });
      const top = composeTemplate(indexCtx(unrated, 0), ["banner", "charts"]);
      expect(top).toContain("```chronoanvil-journal-charts");
      expect(top).toContain("header:📊 Charts");
      expect(top).not.toContain("jchart:");
    });

    it("omits a rating column from a table whose kind has no rating", () => {
      // The columns moved out of the template and into the widget when the
      // tables went native, so the derivation is asserted where it now lives.
      // A kind that is rated on nothing gets a date and a status and no third
      // column — a table cannot offer one for a property its notes never
      // carry, which is per-kind rating scoping as it reaches this surface.
      const unrated = buildJournalType({
        ...freshCustomJournal(new Set()),
        kinds: [{ id: "entry", emoji: "📝", label: "Entry" }],
      });
      expect(kindTableProperties(unrated.kinds[0])).toEqual([
        "date",
        "status",
      ]);
      const deepest = composeTemplate(indexCtx(unrated, 0));
      expect(deepest).toContain("kind-table:entry");
      expect(deepest).not.toContain("confidence");
    });

    it("gives a rated kind its own rating column, and only its own", () => {
      // Two kinds of one type rated on different things is the case per-kind
      // scoping exists for: a combined table would need a column for every
      // rating in the type and leave most of it blank, which is why the
      // section writes one table per kind.
      expect(kindTableProperties(cooking.kinds[0])).toEqual([
        "date",
        "difficulty",
        "status",
      ]);
    });

    it("reads the status property it is given rather than the literal", () => {
      // `status` is a registry built-in, so a vault that re-keyed it must not
      // leave the table reading a dead property — the same rule
      // reviewProperties follows.
      expect(kindTableProperties(cooking.kinds[0], "state")).toEqual([
        "date",
        "difficulty",
        "state",
      ]);
    });

    it("gives every content field the body region it writes into", () => {
      // `note:`, `tasks:`, `attach:`, `path:` and `recall:` all persist into
      // `<!--chronoanvil:key-->`. A section that emits the directive without the
      // region leaves the field nowhere to save.
      for (const s of JOURNAL_SECTIONS) {
        for (const ctx of [
          indexCtx(STUDY_JOURNAL, 1),
          kindCtx(STUDY_JOURNAL, "lesson"),
        ]) {
          if (!sectionApplies(s, ctx)) continue;
          const out = renderSection(s, ctx);
          const keys = [...out.matchAll(/^(?:note|list|tasks|attach|path|recall):([\w-]+)/gm)];
          for (const [, key] of keys) {
            expect(out, `${s.id}/${key}`).toContain(`<!--chronoanvil:${key}`);
          }
        }
      }
    });
  });

  describe("pages", () => {
    const paged = buildJournalType({
      ...freshCustomJournal(new Set()),
      id: "field",
      kinds: [
        { id: "report", emoji: "📓", label: "Report", rating: "confidence", pages: true },
        { id: "note", emoji: "📝", label: "Note" },
      ],
    });

    it("gives a paged kind a page template, and an unpaged type none", () => {
      const files = templateTargets(paged).map((t) => t.file);
      expect(files).toContain("page.md");
      const plain = buildJournalType(freshCustomJournal(new Set()));
      expect(templateTargets(plain).map((t) => t.file)).not.toContain("page.md");
    });

    it("writes one page template for the type, not one per paged kind", () => {
      const two = buildJournalType({
        ...freshCustomJournal(new Set()),
        kinds: [
          { id: "a", emoji: "📓", label: "A", pages: true },
          { id: "b", emoji: "📓", label: "B", pages: true },
        ],
      });
      expect(templateTargets(two).filter((t) => t.file === "page.md")).toHaveLength(1);
    });

    it("offers a page the sections a document gets, not a note's", () => {
      const page = sectionContext(paged, { page: paged.kinds[0] });
      // TWO, NOT THREE (5.20). `recall` was the third, and a page of a document
      // is exactly the surface the argument for it was made about — which is
      // why the section is still OFFERED here and is now off until asked for.
      expect(defaultSectionIds(page)).toEqual(["banner", "headings"]);
      expect(sectionsFor(page).map((s) => s.id)).toContain("recall");
      // Its own pages table would list its siblings, and its own checklist
      // would be counted separately from the note it is part of — and those two
      // are absent from the OFFER, not merely unticked.
      expect(sectionApplies(findSection("pages")!, page)).toBe(false);
      expect(defaultSectionIds(page)).not.toContain("checklist");
    });

    it("leaves a page out of the tracker grid entirely", () => {
      // A per-page rating would mean the parent note's average counted its own
      // parts as peers.
      const out = composeTemplate(sectionContext(paged, { page: paged.kinds[0] }));
      expect(out).toContain("journal-header");
      expect(out).not.toContain("chronoanvil:trackers:start");
      expect(out).not.toContain("tracker:");
    });

    it("names the parent and the order rather than a date", () => {
      const out = composeTemplate(sectionContext(paged, { page: paged.kinds[0] }));
      expect(out).toMatch(/^type: \{\{type\}\}$/m);
      expect(out).toMatch(/^parent: \{\{parent\}\}$/m);
      expect(out).toMatch(/^order: \{\{order\}\}$/m);
      expect(out).not.toMatch(/^date:/m);
      expect(out).not.toMatch(/^status:/m);
    });

    it("gives an unpaged kind of a paged type an ordinary leaf template", () => {
      const note = sectionContext(paged, { kind: paged.kinds[1] });
      expect(defaultSectionIds(note)).toEqual(["banner", "trackers", "headings"]);
      // `pages` is not offered — the kind has none. `checklist` is offered and
      // off, which is the 5.20 distinction this pair now draws.
      const offered = sectionsFor(note).map((s) => s.id);
      expect(offered).not.toContain("pages");
      expect(offered).toContain("checklist");
    });
  });

  describe("layout: per-template order and overrides", () => {
    const cooking = buildJournalType({
      ...freshCustomJournal(new Set()),
      id: "cooking",
      levels: [
        { noun: "Cuisine", fallbackEmoji: "🍳" },
        { noun: "Dish", fallbackEmoji: "🍲" },
      ],
      kinds: [{ id: "recipe", emoji: "🍽️", label: "Recipe" }],
    });
    const deepest = () => sectionContext(cooking, { depth: 1 });

    it("reorders only what the layout names", () => {
      // THE FIXTURE IS THE OFFER SET, NOT THE DEFAULTS (5.20). This read
      // `defaultSectionIds`, which on any index is now three ids — too few to
      // tell "reordered" from "reversed", and none of them the `review`/`path`
      // pair the old assertion named. `sectionsFor` is where ordering actually
      // happens, and it is asked over everything the surface offers.
      const plain = sectionsFor(deepest()).map((s) => s.id);
      const moved = sectionsFor(deepest(), {
        order: ["banner", "review", "path", "children"],
      }).map((s) => s.id);
      expect(moved.slice(0, 4)).toEqual([
        "banner",
        "review",
        "path",
        "children",
      ]);
      // Unnamed sections keep catalogue order behind the named ones rather
      // than being reshuffled by an unstable sort.
      expect([...moved].sort()).toEqual([...plain].sort());
      const rest = moved.slice(4);
      expect(rest).toEqual(plain.filter((id) => rest.includes(id)));
    });

    it("naming a section in `order` does not turn it on", () => {
      // The other half of the same precedence, and the half 5.20 made load-
      // bearing: with almost every section defaulting off, `order` is now
      // routinely handed ids that are not composed. It must move them if they
      // are there and add nothing if they are not — `sections` is the only
      // field that turns a section on.
      expect(
        defaultSectionIds(deepest(), {
          order: ["banner", "review", "path", "children"],
        })
      ).toEqual(["banner", "children", "trackers"]);
      expect(
        defaultSectionIds(deepest(), {
          sections: ["banner", "review", "children"],
        })
      ).toEqual(["banner", "children", "trackers"]);
    });

    it("leaves the catalogue's order alone when no layout is given", () => {
      expect(defaultSectionIds(deepest(), {})).toEqual(
        defaultSectionIds(deepest())
      );
    });

    it("overrides a content field's label but not its region key", () => {
      // `key` was an override until 2.41 — set by Study alone, so its composed
      // template kept emitting the `learning-path` region existing Topic notes
      // stored their text in. Compatibility, not expressiveness. The label
      // stays overridable; the key is now one value for every type.
      const out = composeTemplate(deepest(), ["banner", "path"], {
        options: { path: { label: "🧭 Learning Path" } },
      });
      expect(out).toContain("header:🧭 Learning Path");
      expect(out).toContain("path:path");
      expect(out).toContain("<!--chronoanvil:path");
    });

    it("emits one attach field and one region per declared resource shelf", () => {
      const out = composeTemplate(deepest(), ["banner", "resources"], {
        options: {
          resources: {
            fields: [
              { key: "res-docs", label: "Docs" },
              { key: "res-practice", label: "Practice" },
            ],
          },
        },
      });
      expect(out).toContain("attach:res-docs|Docs");
      expect(out).toContain("attach:res-practice|Practice");
      expect(out).toContain("<!--chronoanvil:res-docs");
      expect(out).toContain("<!--chronoanvil:res-practice");
      expect(out).not.toContain("attach:resources");
    });

    it("uses a kind's declared plural over the crude rule", () => {
      const uncountable = buildJournalType({
        ...freshCustomJournal(new Set()),
        kinds: [
          { id: "practice", emoji: "🛠️", label: "Practice", plural: "Practice" },
        ],
      });
      const out = composeTemplate(sectionContext(uncountable, { depth: 0 }));
      expect(out).toContain("header:🛠️ Practice");
      expect(out).not.toContain("Practices");
    });
  });

  describe("Study's declared layout", () => {
    it("emits a region for the path and each declared resource shelf", () => {
      // `fields` is a real arrangement difference — a Topic index carries three
      // shelves where the catalogue's default carries one — so the keys it
      // names survive. The path's key does not: it is the catalogue's.
      // THE IDS ARE NAMED NOW (5.20): Study's `index:1` key no longer lists
      // sections, it only carries the overrides, so this test asks for the two
      // sections whose overrides it is about. That is precisely the situation
      // the overrides were kept for — a reader ticks Learning path and
      // Resources on a Topic index, and gets Study's three shelves.
      const topic = composeTemplate(
        indexCtx(STUDY_JOURNAL, 1),
        ["banner", "path", "resources"],
        STUDY_JOURNAL.layout?.["index:1"]
      );
      for (const key of ["path", "res-docs", "res-tutorials", "res-practice"]) {
        expect(topic, key).toContain(`<!--chronoanvil:${key}`);
      }
      expect(topic).not.toContain("learning-path");
    });

    it("declares no arrangement at all — only overrides", () => {
      // ── WHAT THIS TEST USED TO SAY ───────────────────────────────────
      //
      // Twice over: 2.40 pinned "a Topic index puts its note tables BELOW the
      // learning path", 5.18 reversed it to "what is below comes first, on both
      // indexes", and each time the claim was a `sections`/`order` list in
      // STUDY_CONFIG. 5.20 deletes the lists. Study arranges nothing, which
      // means there is no Study-shaped arrangement left to assert and the
      // honest test is that the keys are empty of one.
      //
      // `index:0` IS GONE ENTIRELY, because with its order removed it overrode
      // nothing and an empty object is a pin that says nothing.
      expect(STUDY_JOURNAL.layout?.["index:0"]).toBeUndefined();
      const topic = STUDY_JOURNAL.layout?.["index:1"];
      expect(topic?.sections).toBeUndefined();
      expect(topic?.order).toBeUndefined();
      expect(Object.keys(topic?.options ?? {}).sort()).toEqual([
        "path",
        "resources",
      ]);

      // So both of Study's indexes compose the catalogue's four-minus-one —
      // there is nothing below a leaf, so an index gets three — in catalogue
      // order, exactly like a journal a reader made this morning.
      for (const depth of [0, 1]) {
        const ctx = indexCtx(STUDY_JOURNAL, depth);
        expect(
          defaultSectionIds(ctx, STUDY_JOURNAL.layout?.[`index:${depth}`]),
          `index:${depth}`
        ).toEqual(["banner", "trackers", "children"]);
      }
    });
  });

  // ── the housekeeping item: catalogue vs shipped assets ──────────────────
  //
  // "The catalogue makes the Study templates and the generator two expressions
  // of one arrangement. Add the equivalence test when the catalogue lands, not
  // later." This is that test, and the drift it exists to catch is the drift
  // that actually happened: `journal-search`, `review-queue`, the charts
  // region, `activity-chart` and `tasks-table` were all added to Study's
  // templates between 2.28 and 2.35 and none of them ever reached the
  // generator. Nothing failed. Nobody noticed for eight releases.
  describe("stays in step with the shipped Study templates", () => {
    const STUDY_ASSETS: { file: string; ctx: () => ReturnType<typeof indexCtx> }[] = [
      { file: "template-lesson.md", ctx: () => kindCtx(STUDY_JOURNAL, "lesson") },
      { file: "template-practice.md", ctx: () => kindCtx(STUDY_JOURNAL, "practice") },
      { file: "template-page.md", ctx: () => pageCtx(STUDY_JOURNAL, "lesson") },
    ];

    // Directives a shipped Study template carries that the catalogue
    // deliberately does not offer.
    //
    // EMPTY AS OF 2.39, and getting it there was the point. It held
    // `topic-stats` and `related-lessons`, both excluded because they rendered
    // "lessons" and "practice" as literal labels — Study-only by accident
    // rather than by decision. Both now read their nouns off the host note's
    // journal type, so both are ordinary catalogue sections (`stats`,
    // `related`) and neither needs an exemption.
    //
    // Kept as a mechanism rather than deleted, because the next widget added
    // to a Study template will need somewhere to be argued about, and an empty
    // list that a test insists is empty makes re-adding one a visible decision
    // rather than a quiet one.
    const STUDY_ONLY = new Set<string>([]);
    const CHROME = new Set(["spacer", "header", "button"]);

    const directivesIn = (text: string): string[] => {
      const out: string[] = [];
      const fences = [...text.matchAll(/^```chronoanvil[\w-]*\n([\s\S]*?)^```/gm)];
      for (const [, body] of fences) {
        for (const line of body.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          out.push(trimmed.split(/[:|]/)[0]);
        }
      }
      return out;
    };

    it("claims every directive the shipped templates use", () => {
      // The direct guard against the rot. A widget added to a Study template
      // that no catalogue section claims fails here, and the fix is either to
      // add it to the catalogue or to argue it onto the Study-only list.
      const claimed = new Set(JOURNAL_SECTIONS.flatMap((s) => s.claims));
      const unclaimed = new Set<string>();
      for (const { file } of STUDY_ASSETS) {
        for (const d of directivesIn(asset(file))) {
          if (claimed.has(d) || STUDY_ONLY.has(d) || CHROME.has(d)) continue;
          unclaimed.add(`${file}: ${d}`);
        }
      }
      expect([...unclaimed]).toEqual([]);
    });

    it("keeps the Study-only list empty", () => {
      // Every widget in a shipped template is now type-agnostic and claimed by
      // a catalogue section. Adding an exemption back should require changing
      // this assertion, which is the point of asserting it.
      expect([...STUDY_ONLY]).toEqual([]);
    });

    for (const { file, ctx } of STUDY_ASSETS) {
      it(`composes the same sections ${file} carries`, () => {
        // Set equality, section for section. Not byte equality: Study's assets
        // are hand-written, they carry prose the catalogue does not generate,
        // and two of them use widgets the catalogue deliberately refuses to
        // offer. What must not drift is *which sections a note of this shape
        // gets*, and that is what this compares.
        const c = ctx();
        const shipped = detectSections(asset(file), c);
        const composed = defaultSectionIds(c);
        expect([...composed].sort()).toEqual([...shipped].sort());
      });
    }

    it("composes the top-level index in the order Study writes it", () => {
      // ── THE ROADMAP'S LIST, AND WHAT IS LEFT OF IT (5.20) ────────────
      //
      // This asserted the eight sections the 2.28 roadmap named — "a custom
      // journal arrives with topics-table, search, review, charts, activity and
      // tasks" — reordered twice since (4.70 welded review beside tasks, 5.18
      // moved the children table to the top). All eight are still catalogue
      // sections, still offered on this surface, and none of them is composed
      // into a fresh Subject index any more.
      //
      // THE TEST IS KEPT, POINTED AT THE THREE. What it guards has not changed:
      // the file Study writes and the catalogue's answer for this surface are
      // one arrangement, and the equality below is what fails if they come
      // apart. The list being short is the change under test.
      const c = indexCtx(STUDY_JOURNAL, 0);
      // AND THE LAYOUT LOOKUP IS KEPT TOO, though `index:0` is now undefined —
      // this is the call the generator makes, and passing what it passes is how
      // the two stay the same question.
      const layout = STUDY_JOURNAL.layout?.["index:0"];
      expect(defaultSectionIds(c, layout)).toEqual(
        detectSections(studyTemplate("Subject Index.md"), c)
      );
      expect(defaultSectionIds(c, layout)).toEqual([
        "banner",
        // 4.20: the ratings left the banner's fence to become a section.
        "trackers",
        // What the page exists to link into. 5.18 put this above `trackers`;
        // 5.20 put it back below, because an index no longer opens with a block
        // of numbers to look past — it opens with one tracker card.
        "children",
      ]);
      // The five that left, all still offered here and all one tick away.
      const offered = sectionsFor(c, layout).map((s) => s.id);
      for (const id of ["review", "tasks", "progress", "find", "charts"]) {
        expect(offered, id).toContain(id);
        expect(defaultSectionIds(c, layout), id).not.toContain(id);
      }
    });

    it("reproduces the tracker grid of each shipped leaf template", () => {
      // The 2.36 declarations drive both, so a kind's banner cannot offer a
      // rating it is not graded on. This is the item-0 leak, asserted against
      // the templates it was read off.
      const lesson = composeTemplate(kindCtx(STUDY_JOURNAL, "lesson"));
      expect(lesson).toContain("tracker:confidence");
      expect(lesson).not.toContain("tracker:accuracy");
      const practice = composeTemplate(kindCtx(STUDY_JOURNAL, "practice"));
      expect(practice).toContain("tracker:accuracy");
      expect(practice).not.toContain("tracker:confidence");
    });

    it("writes the level properties the shipped templates carry", () => {
      const topic = composeTemplate(indexCtx(STUDY_JOURNAL, 1));
      expect(topic).toMatch(/^type: topic$/m);
      expect(topic).toMatch(/^subject: \{\{subject\}\}$/m);
      const subject = composeTemplate(indexCtx(STUDY_JOURNAL, 0));
      expect(subject).toMatch(/^type: subject$/m);
      expect(subject).not.toMatch(/^subject:/m);
      const lesson = composeTemplate(kindCtx(STUDY_JOURNAL, "lesson"));
      expect(lesson).toMatch(/^subject: \{\{subject\}\}$/m);
      expect(lesson).toMatch(/^topic: \{\{topic\}\}$/m);
    });

    it("names each generated file after the template the type asks for", () => {
      // The type's `indexTemplate` / kind template names are what journal.ts
      // reads when creating a note. A generator that wrote a different file
      // name would leave every create action reporting a missing template.
      // Slugs of the level/kind ID, not of its display name (2.43). A
      // filename derived from a label came apart from the id the moment
      // anyone relabelled, leaving the kind pointing at a file that was never
      // written — see journal.ts::buildJournalType.
      expect(journalTemplateFiles(STUDY_JOURNAL).map((f) => f.name)).toEqual([
        "subject-index.md",
        "topic-index.md",
        "lesson.md",
        "practice.md",
        // One page template for the type, not one per paged kind: every paged
        // kind shares it, so a second would differ only in its name.
        "page.md",
      ]);
    });
  });

  describe("detection", () => {
    const lesson = kindCtx(STUDY_JOURNAL, "lesson");

    it("tells a tasks field from a tasks table", () => {
      // `tasks:` and `tasks-table` share a prefix and are different sections.
      // A naive indexOf would have found the rollup in every leaf note.
      const subject = indexCtx(STUDY_JOURNAL, 0);
      expect(detectSections("```chronoanvil\ntasks-table\n```", subject)).toContain(
        "tasks"
      );
      expect(
        detectSections("```chronoanvil\ntasks:todo|Tasks\n```", lesson)
      ).toEqual(["checklist"]);
    });

    it("reports sections in the order they appear in the file", () => {
      const text = composeTemplate(lesson);
      // FOUR, AND THE PROSE LAST (5.20). `recall` and `checklist` followed the
      // headings here until 5.20 turned them off, which is also what made the
      // skeleton's position worth pinning: it is the bottom of the note now, so
      // nothing composed can sit under the reader's own writing.
      expect(detectSections(text, lesson)).toEqual([
        "banner",
        "trackers",
        "pages",
        "headings",
      ]);
    });

    it("finds nothing in a note with no directives", () => {
      expect(detectSections("# Just a note\n\nSome prose.", lesson)).toEqual([]);
    });

    it("only reports sections that could belong on the surface asked about", () => {
      // A leaf note holding a hand-written `review-queue` is legal — nothing
      // refuses it — but the picker offering to append a second one is not the
      // question this function answers.
      const text = "```chronoanvil\nreview-queue\n```";
      expect(detectSections(text, lesson)).toEqual([]);
      expect(detectSections(text, indexCtx(STUDY_JOURNAL, 0))).toEqual([
        "review",
      ]);
    });

    it("round-trips every default section it renders", () => {
      // The property that makes item 4's "already there?" check trustworthy:
      // anything the catalogue writes, the catalogue can find again.
      for (const ctx of [
        indexCtx(STUDY_JOURNAL, 0),
        indexCtx(STUDY_JOURNAL, 1),
        kindCtx(STUDY_JOURNAL, "lesson"),
        kindCtx(STUDY_JOURNAL, "practice"),
      ]) {
        for (const s of sectionsFor(ctx)) {
          expect(
            s.locate(renderSection(s, ctx), ctx),
            s.id
          ).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });
});

// ── The all-notes .base, generated per type ──────────────────────────────
//
// Was a Study-only asset hardcoding `03 - Journals`, the columns
// `subject`/`topic` and one view per Study kind, so the vault-wide "every
// journal note" table existed for Study and for nothing else.

describe("journalNotesBase", () => {
  const cooking = buildJournalType({
    ...freshCustomJournal(new Set()),
    id: "cooking",
    name: "Cook Book",
    levels: [
      { noun: "Cuisine", fallbackEmoji: "🍳" },
      { noun: "Dish", fallbackEmoji: "🍲" },
    ],
    kinds: [
      { id: "recipe", emoji: "🍽️", label: "Recipe", rating: "difficulty" },
      { id: "attempt", emoji: "🥣", label: "Attempt" },
    ],
  });

  it("filters on the type's own root", () => {
    expect(journalNotesBase(cooking, "03 - Journals/Cook Book")).toContain(
      'file.inFolder("03 - Journals/Cook Book")'
    );
  });

  it("names the container columns after the type's levels", () => {
    const out = journalNotesBase(cooking, "R");
    expect(out).toContain("  cuisine:\n    displayName: Cuisine");
    expect(out).toContain("  dish:\n    displayName: Dish");
    expect(out).not.toContain("subject:");
    expect(out).not.toContain("topic:");
  });

  it("gives each kind a view, plus an all-notes view", () => {
    const out = journalNotesBase(cooking, "R");
    expect(out).toContain("    name: Recipes\n    filters: type == \"recipe\"");
    expect(out).toContain("    name: Attempts\n    filters: type == \"attempt\"");
    expect(out).toContain("    name: All Cook Book Notes");
  });

  it("gives a rating column only to the kinds that have one", () => {
    const out = journalNotesBase(cooking, "R");
    const recipe = out.slice(out.indexOf("name: Recipes"), out.indexOf("name: Attempts"));
    expect(recipe).toContain("- difficulty");
    const attempt = out.slice(out.indexOf("name: Attempts"));
    expect(attempt).not.toContain("- difficulty");
  });

  it("declares each distinct rating once", () => {
    // Two kinds rated on the same tracker share one column.
    const shared = buildJournalType({
      ...freshCustomJournal(new Set()),
      kinds: [
        { id: "a", emoji: "📝", label: "A", rating: "confidence" },
        { id: "b", emoji: "📝", label: "B", rating: "confidence" },
      ],
    });
    const out = journalNotesBase(shared, "R");
    expect(out.split("  confidence:\n").length - 1).toBe(1);
  });

  it("reproduces Study's own columns and views", () => {
    const out = journalNotesBase(STUDY_JOURNAL, "03 - Journals");
    expect(out).toContain("  subject:\n    displayName: Subject");
    expect(out).toContain("  topic:\n    displayName: Topic");
    expect(out).toContain("    name: Lessons");
    // The declared plural, not "Practices".
    expect(out).toContain("    name: Practice\n");
    expect(out).toContain("    name: All Study Notes");
  });

  it("works on a flat journal, which has one container column", () => {
    const flat = buildJournalType(freshCustomJournal(new Set()));
    const out = journalNotesBase(flat, "R");
    expect(out).toContain("  section:\n    displayName: Section");
    expect(out).toContain("      - section");
  });
});

// ── the single constructor (2.42) ─────────────────────────────────────────
//
// Study was a hand-written JournalType carrying closures until 2.42, while
// every other type was rebuilt from a config. That asymmetry is what the
// equivalence suite above existed to police: a preset able to express things no
// user's journal could would drift from the catalogue and nothing would say so.
//
// These pin the property that replaces that policing. They are cheap to keep
// and they fail loudly the moment Study grows a field again.
describe("one constructor for every journal type", () => {
  it("builds Study from a config, like any other type", () => {
    // Not "Study resembles a config" — Study IS one, run through the same
    // function. There is no second construction path to drift.
    //
    // WEAKER THAN IT LOOKS, AND DELIBERATELY LEFT (3.20). `STUDY_JOURNAL` is
    // DEFINED as `buildJournalType(STUDY_CONFIG)`, so this is now a tautology
    // and would stay green if the constructor lost its mind. It is kept because
    // it fails loudly the day someone reintroduces a second construction path
    // for Study — which is exactly what it was written to catch. The claim that
    // does real work moved to `test/journal-presets.test.ts`: what a reader
    // INSTALLS composes the template files Study has always shipped.
    const rebuilt = buildJournalType(STUDY_CONFIG);
    expect(rebuilt).toEqual(STUDY_JOURNAL);
  });

  it("gives a JournalType no functions to carry", () => {
    // The concrete reason the two shapes could not be one: `root`,
    // `templatesFolder` and each level's emoji were closures over the plugin,
    // and a closure cannot be stored in data.json or compared in a test.
    const walk = (v: unknown, path: string): void => {
      expect(typeof v, path).not.toBe("function");
      if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
      }
    };
    walk(STUDY_JOURNAL, "STUDY_JOURNAL");
  });

  it("lets a custom journal express everything Study expresses", () => {
    // The guarantee in one assertion: every key Study's config uses is a key
    // the config type offers, so a user's journal can carry it too.
    const custom: JournalConfig = {
      ...STUDY_CONFIG,
      id: "cooking",
      name: "Cooking",
      emoji: "🍳",
      root: "J/Cooking",
      templatesFolder: "T/Cooking",
    };
    const built = buildJournalType(custom);
    expect(built.layout).toEqual(STUDY_JOURNAL.layout);
    expect(built.kinds.map((k) => k.id)).toEqual(
      STUDY_JOURNAL.kinds.map((k) => k.id)
    );
    expect(built.kinds[0].pages).toEqual(STUDY_JOURNAL.kinds[0].pages);
    expect(built.root).toBe("J/Cooking");
  });

  it("resolves Study's folders from its own config once installed", () => {
    // Was "from settings when one is registered": Study read `paths.studyRoot`
    // at point of use because it had no config of its own to hold a root. As an
    // ordinary stored journal (3.20) the root is its config's, put there by the
    // migration from exactly those settings — so the same answer, arrived at
    // the way every other journal arrives at it.
    const plugin = {
      settings: {
        customJournals: [
          studyConfigFor({ root: "Notes/Study", templatesFolder: "T/S" }),
        ],
        paths: {
          journalsRoot: "Notes",
          studyRoot: "Notes/Study",
          templatesStudies: "T/S",
        },
      },
    } as unknown as Parameters<typeof registeredJournalTypes>[0];
    const [study] = registeredJournalTypes(plugin);
    expect(study.root).toBe("Notes/Study");
    expect(study.templatesFolder).toBe("T/S");
    // …and the shipped constant keeps the defaults, for the callers that only
    // want its levels and kinds.
    expect(STUDY_JOURNAL.root).toBe("03 - Journals/Study");
  });
});

describe("the Tags section (3.11 §6)", () => {
  const find = (id: string) =>
    JOURNAL_SECTIONS.find((s) => s.id === id) as (typeof JOURNAL_SECTIONS)[number];

  it("is an index section, off by default", () => {
    const tags = find("tags");
    expect(tags.surface).toBe("index");
    // Off for taste, not for capability: a cloud works on any index from the
    // first tagged note. No shipped Study template carries one.
    expect(tags.default(indexCtx(STUDY_JOURNAL, 0))).toBe(false);
    expect(tags.default(indexCtx(STUDY_JOURNAL, 1))).toBe(false);
  });

  it("emits a bare tag-index, which now means the host's own folder", () => {
    const blocks = find("tags").render(indexCtx(STUDY_JOURNAL, 1));
    const lines = blocks.flatMap((b) => (b.kind === "fence" ? b.lines : []));
    expect(lines).toContain("tag-index");
    // Not a folder argument: SectionContext has no folder in it, because a
    // journal template is composed once and used in every folder of its level.
    expect(lines.some((l) => l.startsWith("tag-index:"))).toBe(false);
  });

  it("claims what it emits", () => {
    expect(find("tags").claims).toContain("tag-index");
  });

  it("is not offered on a leaf", () => {
    // A leaf's tags are its own frontmatter; a cloud of them is a list of four
    // pills restating the properties panel.
    expect(
      sectionsFor(kindCtx(STUDY_JOURNAL, "lesson")).map((s) => s.id)
    ).not.toContain("tags");
  });
});
