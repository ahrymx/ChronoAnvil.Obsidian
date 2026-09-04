// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";
import { readCode, readSrc } from "./sources";
import { STUDY_JOURNAL } from "../src/journals/journal";
import {
  JOURNAL_SECTIONS,
  findSection,
  renderSection,
  sectionContext,
  sectionsFor,
} from "../src/journals/journal-sections";
import { composeTemplate, buildJournalType, freshCustomJournal } from "../src/journals/custom-journal";
import {
  JournalHostRef,
  addableSections,
  appendSectionMarkdown,
  modelForSurface,
  resolveSectionHost,
} from "../src/ui/section-insert";
import { homeSections, composeHomeNote } from "../src/diary/home-sections";
import { DEFAULT_PATHS } from "../src/core/constants";
import { SEARCH_SECTIONS, composeSearchNote } from "../src/diary/search-sections";

const cooking = buildJournalType({
  ...freshCustomJournal(new Set()),
  id: "cooking",
  root: "03 - Journals/Cooking",
  templatesFolder: "05 - Templates/Cooking",
  levels: [
    { noun: "Cuisine", fallbackEmoji: "🍳" },
    { noun: "Dish", fallbackEmoji: "🍲" },
  ],
  kinds: [{ id: "recipe", emoji: "🍽️", label: "Recipe", rating: "difficulty" }],
});

// Study's root is the journals tree itself and Cooking's sits inside it —
// the arrangement that makes longest-root-wins load-bearing rather than tidy.
const REFS: JournalHostRef[] = [
  {
    type: STUDY_JOURNAL,
    root: "03 - Journals",
    templatesFolder: "05 - Templates/Study",
  },
  {
    type: cooking,
    root: "03 - Journals/Cooking",
    templatesFolder: "05 - Templates/Cooking",
  },
];

describe("adding a section to an existing note", () => {
  describe("resolving which surface the host note is", () => {
    it("reads a real note's surface from its path and its type", () => {
      const ctx = resolveSectionHost(
        REFS,
        "03 - Journals/Maths/Algebra/Quadratics.md",
        "lesson"
      );
      expect(ctx?.noteKind).toBe("leaf");
      expect(ctx?.kind?.id).toBe("lesson");
      expect(ctx?.type.id).toBe("study");
    });

    it("reads an index note's depth from its level noun", () => {
      const top = resolveSectionHost(REFS, "03 - Journals/Maths/Maths.md", "subject");
      expect(top?.noteKind).toBe("index");
      expect(top?.depth).toBe(0);
      expect(top?.hasSubContainers).toBe(true);

      const deep = resolveSectionHost(
        REFS,
        "03 - Journals/Maths/Algebra/Algebra.md",
        "topic"
      );
      expect(deep?.depth).toBe(1);
      expect(deep?.hasSubContainers).toBe(false);
    });

    it("resolves a template as readily as a note", () => {
      // The whole point of the second folder pass: a type's templates folder
      // sits outside its root, so matching on the root alone would decline on
      // exactly the files this command is most useful on.
      const ctx = resolveSectionHost(
        REFS,
        "05 - Templates/Study/Topic Index.md",
        "topic"
      );
      expect(ctx?.noteKind).toBe("index");
      expect(ctx?.depth).toBe(1);
    });

    it("gives a nested journal's note its own type, not the one above it", () => {
      // Longest folder wins. Registration order would resolve every Cooking
      // note to Study, and the sections offered would name Study's nouns.
      const ctx = resolveSectionHost(
        REFS,
        "03 - Journals/Cooking/Italian/Pasta/Carbonara.md",
        "recipe"
      );
      expect(ctx?.type.id).toBe("cooking");
      expect(ctx?.kind?.id).toBe("recipe");
      expect(ctx?.rating).toBe("difficulty");
    });

    it("resolves a page AS a page, carrying the kind that owns it", () => {
      // WAS "treats a page as a leaf note of the kind that owns it", and that
      // was the conflation 2.59.0 removes. A page is not a leaf: it has no
      // tracker grid of its own and its frontmatter names its parent instead of
      // a date. What was true in the old wording is that the SECTIONS suiting
      // its parent mostly suit it — and that survives, because a section still
      // declares `index | leaf | both` and a page is accepted as a leaf there.
      //
      // The distinction now has somewhere to live: `noteKind` says what the
      // note is, `section.surface` says what a section accepts, and the two are
      // no longer the same field doing both jobs badly.
      const ctx = resolveSectionHost(
        REFS,
        "03 - Journals/Maths/Algebra/Quadratics/Roots.md",
        "page"
      );
      expect(ctx?.noteKind).toBe("page");
      expect(ctx?.kind?.id).toBe("lesson");
    });

    it("declines rather than guessing", () => {
      // Unclassified is permissive everywhere else in the plugin. Here it
      // cannot be: the answer decides what gets written into someone's note.
      expect(resolveSectionHost(REFS, "03 - Journals/Scratch.md", "")).toBeNull();
      expect(
        resolveSectionHost(REFS, "03 - Journals/Scratch.md", "whatever")
      ).toBeNull();
      expect(resolveSectionHost(REFS, "Inbox/Idea.md", "lesson")).toBeNull();
      // A page template's `type` is a token, not a value.
      expect(
        resolveSectionHost(REFS, "05 - Templates/Study/Page.md", "{{type}}")
      ).toBeNull();
    });

    it("matches the type value case-insensitively", () => {
      expect(
        resolveSectionHost(REFS, "03 - Journals/Maths/Algebra/Q.md", "Lesson")
          ?.kind?.id
      ).toBe("lesson");
    });
  });

  describe("what the picker offers", () => {
    const topicCtx = sectionContext(STUDY_JOURNAL, { depth: 1 });

    it("offers only what belongs on the host's surface", () => {
      const ids = addableSections(topicCtx, "").map((s) => s.id);
      expect(ids).not.toContain("recall");
      expect(ids).not.toContain("checklist");
      expect(ids).toContain("find");
    });

    it("withholds a section the note already has", () => {
      // Not offered-and-refused: every content field persists into a
      // `<!--chronoanvil:key-->` region keyed by name, so a second copy of one
      // would give two widgets one region to fight over.
      // COMPOSED WITH THE IDS NAMED (5.20). A Topic index composes three
      // sections now, and a test that withheld three would still pass while
      // barely asking the question. What is under test is that a section IN the
      // file is not offered again, so the file is given some.
      const carries = ["banner", "children", "review", "charts", "path"];
      const text = composeTemplate(topicCtx, carries);
      const ids = addableSections(topicCtx, text).map((s) => s.id);
      for (const present of carries) {
        expect(ids, present).not.toContain(present);
      }
      // And what the page does not carry is still on offer.
      expect(ids).toContain("find");
      expect(ids).toContain("progress");
      expect(ids).toContain("tasks");
      expect(ids).toContain("nav");
    });

    it("offers nothing once every applicable section is present", () => {
      const all = sectionsFor(topicCtx)
        .map((s) => renderSection(s, topicCtx))
        .join("\n\n");
      expect(addableSections(topicCtx, all)).toEqual([]);
    });

    it("offers a fresh note the whole applicable catalogue", () => {
      expect(addableSections(topicCtx, "# Notes\n\nnothing here").length).toBe(
        sectionsFor(topicCtx).length
      );
    });
  });

  describe("appending", () => {
    it("adds the block on the end with one blank line before it", () => {
      expect(appendSectionMarkdown("# Title\n\nSome prose.", "BLOCK")).toBe(
        "# Title\n\nSome prose.\n\nBLOCK\n"
      );
    });

    it("does not open with blank lines on an empty note", () => {
      expect(appendSectionMarkdown("", "BLOCK")).toBe("BLOCK\n");
      expect(appendSectionMarkdown("\n\n  \n", "BLOCK")).toBe("BLOCK\n");
    });

    it("leaves everything already in the file exactly as it was", () => {
      // Append-only is the guarantee that lets this coexist with "nothing
      // regenerates them". No reflow, no reordering, no tidying of a
      // hand-indented fence — the previous content is a prefix of the result.
      const messy =
        "---\ntype: topic\n---\n```chronoanvil\n  journal-header\n```\n\n\n\nOdd   spacing kept.";
      const out = appendSectionMarkdown(messy, "BLOCK");
      expect(out.startsWith(messy.replace(/\s+$/, ""))).toBe(true);
      expect(out).toContain("  journal-header");
      expect(out).toContain("Odd   spacing kept.");
    });

    it("ends the file with exactly one newline", () => {
      for (const before of ["a", "a\n", "a\n\n\n", ""]) {
        expect(appendSectionMarkdown(before, "BLOCK")).toMatch(/[^\n]\n$/);
      }
    });

    it("round-trips: an appended section is found by the picker afterwards", () => {
      // What stops a second invocation offering the same section again.
      const ctx = sectionContext(STUDY_JOURNAL, { depth: 1 });
      let text = composeTemplate(ctx);
      for (const id of ["find", "progress", "tasks", "nav"]) {
        const section = findSection(id)!;
        text = appendSectionMarkdown(text, renderSection(section, ctx));
        expect(addableSections(ctx, text).map((s) => s.id)).not.toContain(id);
      }
    });
  });

  describe("a section is safe to append to a live note", () => {
    it("renders no template tokens in any section, on any surface", () => {
      // Templates are filled through fillTemplate on creation; a note is not.
      // A section that emitted `{{subject}}` would be fine in a template and
      // would leave literal braces in a note — and this command deliberately
      // works on both. Frontmatter is the only thing that carries tokens, and
      // frontmatter is not a section.
      const contexts = [
        sectionContext(STUDY_JOURNAL, { depth: 0 }),
        sectionContext(STUDY_JOURNAL, { depth: 1 }),
        sectionContext(STUDY_JOURNAL, { kind: STUDY_JOURNAL.kinds[0] }),
        sectionContext(STUDY_JOURNAL, { kind: STUDY_JOURNAL.kinds[1] }),
        sectionContext(cooking, { depth: 0 }),
        sectionContext(cooking, { depth: 1 }),
        sectionContext(cooking, { kind: cooking.kinds[0] }),
      ];
      for (const ctx of contexts) {
        for (const s of JOURNAL_SECTIONS) {
          if (!sectionsFor(ctx).includes(s)) continue;
          expect(renderSection(s, ctx), `${s.id}/${ctx.typeValue}`).not.toContain(
            "{{"
          );
        }
      }
    });

    it("never appends a second frontmatter block", () => {
      const ctx = sectionContext(STUDY_JOURNAL, { depth: 0 });
      for (const s of sectionsFor(ctx)) {
        expect(
            renderSection(s, ctx).trimStart().startsWith("---"),
            s.id
          ).toBe(false);
      }
    });
  });
});

// ── 2.59.0: a page is not a leaf with a flag set ──────────────────────

describe("the homepage is a surface, as of 3.11", () => {
  it("hands the editor the home model and a noun for it", () => {
    // ONE EDITOR, FOUR MODELS. Nothing in the editor picks a window; this
    // picks which model the window is handed, which is §2 of the 3.0 plan made
    // operational one surface further.
    const ROOT = DEFAULT_PATHS.diaryRoot;
    const { model, noun } = modelForSurface({ kind: "home", diaryRoot: ROOT });
    expect(noun).toBe("homepage");
    // Composed sections, not catalogued ones: since 3.13 §11 the homepage
    // offers one section it does not write, and `present` answers about the
    // note rather than about the catalogue.
    expect(model.present(composeHomeNote(ROOT))).toEqual(
      homeSections(ROOT).filter((s) => !s.optIn).map((s) => s.id)
    );
  });

  it("carries no context, because nothing about the homepage varies", () => {
    // The variant has no `ctx` where the other three do. There is one
    // homepage; it does not come in five grains or three note kinds.
    const src = readSrc("ui/section-insert");
    expect(src).toContain('kind: "home"');
  });

  it("resolves the Search note the same way", () => {
    const { model, noun } = modelForSurface({ kind: "search" });
    expect(noun).toBe("Search note");
    expect(model.present(composeSearchNote())).toEqual(
      SEARCH_SECTIONS.map((s) => s.id)
    );
  });

  it("resolves by configured path, before the diary resolvers", () => {
    // The homepage sits outside every diary folder, so `noteKindOf` has
    // nothing to classify and it fell through all three existing questions —
    // which is exactly how it came to be unrecognised by both commands.
    //
    // Read from settings rather than DEFAULT_PATHS, because Settings → Paths
    // lets a reader move it and every other resolver here follows the
    // configured value.
    const src = readSrc("ui/section-insert");
    expect(src).toContain("this.plugin.settings.paths.home");
    expect(src).toContain("this.plugin.settings.paths.search");
    const homeAt = src.indexOf("settings.paths.home");
    const dashAt = src.indexOf("const dash = this.diaryContextFor");
    expect(homeAt).toBeGreaterThan(0);
    expect(homeAt).toBeLessThan(dashAt);
  });
});

describe("what a note is, in one field", () => {
  it("cannot describe a note as two kinds at once", () => {
    // The point of the change. `{ surface: "index", isPage: true }` was
    // representable and meaningless — an index that is also a page — and the
    // two halves of the answer could disagree. A union of three cannot.
    const src = readCode("journal-sections");
    expect(src).not.toContain("isPage: boolean");
    expect(src).toContain('export type JournalNoteKind = "index" | "leaf" | "page"');
  });

  it("keeps a section's own surface two-valued", () => {
    // Deliberately NOT collapsed into the same type. `noteKind` says what the
    // note is; `section.surface` says what a section accepts, and a page is
    // accepted wherever a leaf is. Merging them would make every section state
    // an opinion about pages when almost none has one.
    const src = readSrc("journal-sections");
    expect(src).toContain('surface: SectionSurface');
    expect(src).toContain('const accepts = ctx.noteKind === "index" ? "index" : "leaf";');
  });

  it("accepts a leaf-surface section on a page", () => {
    // The behaviour the old wording was protecting: sections that suit a page's
    // parent mostly suit the page. That survives the split — it just lives in
    // the acceptance test now rather than in a lie about what the note is.
    const page = resolveSectionHost(
      REFS,
      "03 - Journals/Maths/Algebra/Quadratics/Roots.md",
      "page"
    );
    expect(page?.noteKind).toBe("page");
    expect(
      addableSections(page as NonNullable<typeof page>, "").some(
        (s) => s.id === "recall"
      )
    ).toBe(true);
  });

  it("still keeps the Pages section off a page", () => {
    // The bug this shape caused, pinned: a page was built with `isPage: false`,
    // so the command offered it a pages-table and a New page button — a page
    // offering to contain pages.
    const page = resolveSectionHost(
      REFS,
      "03 - Journals/Maths/Algebra/Quadratics/Roots.md",
      "page"
    );
    expect(
      addableSections(page as NonNullable<typeof page>, "").some(
        (s) => s.id === "pages"
      )
    ).toBe(false);
  });
});
