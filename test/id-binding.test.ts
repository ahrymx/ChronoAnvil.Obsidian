// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// ── 2.43: id is identity, label is decoration ─────────────────────────────
//
// Every assertion here is a defect that shipped in 2.42 and was found by
// reading rather than by a failing test — which is the argument for the file.
// Each one is silent in production: a relabel that orphans a template reports
// a missing file, and a relabel that declassifies a note reports nothing at
// all.
//
// IMPORT ORDER IS PART OF THE TEST. custom-journal.ts comes first deliberately;
// see "the module graph" below.
import { describe, expect, it } from "vitest";
import {
  buildJournalType,
  customTemplateFiles,
  freshCustomJournal,
  normaliseLevels,
  normalizeJournalConfigs,
} from "../src/journals/custom-journal";
import type { JournalConfig } from "../src/journals/custom-journal";
import {
  STUDY_CONFIG,
  STUDY_JOURNAL,
  deriveLevelId,
  journalAncestors,
  recognisedTypeValues,
  typeRecognised,
} from "../src/journals/journal";
import { normaliseTypeValue, plural } from "../src/core/util";
import {
  findSection,
  renderSection,
  sectionContext,
  sectionOverrides,
  sectionsFor,
  templateKeyFor,
  templateTargets,
} from "../src/journals/journal-sections";
import { normaliseKinds } from "../src/core/settings-editors";
import {
  parseJournalChartDirectives,
  spliceJournalChartRegion,
} from "../src/charts/journal-charts";
import { resolveSectionHost } from "../src/ui/section-insert";
import type { JournalHostRef } from "../src/ui/section-insert";

const cfg = (over: Partial<JournalConfig> = {}): JournalConfig => ({
  ...freshCustomJournal(new Set()),
  id: "cook",
  name: "Cooking",
  root: "03 - Journals/Cooking",
  templatesFolder: "05 - Templates/Cooking",
  ...over,
});

// ── the module graph ──────────────────────────────────────────────────────

describe("the module graph", () => {
  // journal.ts builds STUDY_JOURNAL at module scope. While that call reached
  // across to custom-journal.ts, whether it found a function depended on which
  // module the loader entered first — importing custom-journal.ts first threw
  // `TypeError: buildJournalType is not a function`. esbuild happened to order
  // the real bundle acceptably from main.ts, so nothing caught it.
  //
  // This file's imports are in the order that used to fail. Reaching this
  // assertion at all is the test; the assertion itself is a formality.
  it("builds Study whichever module is imported first", () => {
    expect(typeof buildJournalType).toBe("function");
    expect(STUDY_JOURNAL.kinds.map((k) => k.id)).toEqual(["lesson", "practice"]);
  });
});

// ── generated filenames ───────────────────────────────────────────────────

describe("what a generated template is named after", () => {
  it("names a kind's template after its id, not its label", () => {
    const type = buildJournalType(
      cfg({ kinds: [{ id: "recipe", emoji: "🍽️", label: "Main Course" }] })
    );
    expect(type.kinds[0].templates[0].template).toBe("recipe.md");
  });

  it("names a level's index template after its id, not its noun", () => {
    const type = buildJournalType(
      cfg({ levels: [{ id: "cuisine", noun: "Regional Cuisine", fallbackEmoji: "🍳" }] })
    );
    expect(type.levels[0].indexTemplate).toBe("cuisine-index.md");
  });

  // The defect this replaced: `${k.label}.md` on a label containing a path
  // separator filed the template into a subfolder nobody asked for.
  it("cannot put a template in a subfolder, whatever the label says", () => {
    const kinds = normaliseKinds(
      [{ id: "", emoji: "📝", label: "Field/Notes" }],
      { preserveIds: false }
    );
    const files = templateTargets(buildJournalType(cfg({ kinds })));
    for (const f of files) expect(f.file).not.toContain("/");
  });

  // Two rail rows writing one file: the second write wins and the first
  // template is silently lost.
  it("gives every template of a type a distinct filename", () => {
    const kinds = normaliseKinds(
      [
        { id: "", emoji: "📝", label: "Lesson" },
        { id: "", emoji: "📝", label: "lesson" },
        // Collides with the level's own index template under the old naming.
        { id: "", emoji: "📝", label: "Section Index" },
      ],
      { preserveIds: false }
    );
    const files = templateTargets(buildJournalType(cfg({ kinds }))).map(
      (t) => t.file
    );
    expect(new Set(files).size).toBe(files.length);
  });

  it("gives Study's templates id-derived names", () => {
    expect(customTemplateFiles(STUDY_CONFIG).map((f) => f.name)).toEqual([
      "subject-index.md",
      "topic-index.md",
      "lesson.md",
      "practice.md",
      "page.md",
    ]);
  });
});

// ── relabelling ───────────────────────────────────────────────────────────

describe("relabelling something that already has notes", () => {
  // The 2.42 defect: the id was preserved (correctly) while the template name
  // was re-derived from the new label, so the kind pointed at a file that was
  // never written. newNote then reported it missing, and "Set up / repair
  // vault" wrote a fresh catalogue template under the new name — leaving the
  // file the reader had actually edited on disk and unreachable.
  it("leaves a kind's template where it was written", () => {
    const before = cfg({
      kinds: [{ id: "entry", emoji: "📝", label: "Entry" }],
    });
    const written = customTemplateFiles(before).map((f) => f.name);

    const after = {
      ...before,
      kinds: normaliseKinds(
        [{ id: "entry", emoji: "📝", label: "Journal Entry" }],
        { preserveIds: true }
      ),
    };
    const points = buildJournalType(after).kinds[0].templates[0].template;
    expect(written).toContain(points);
  });

  // Worse than the kind case, because nothing reports it: renaming a level's
  // noun used to change `levelTypeValue`, so every index note already on disk
  // carried a `type:` the journal no longer recognised. The banner fell back
  // to Study's property names, the tracker surface went unclassified, and
  // "Add a section" refused outright.
  it("keeps recognising index notes written before the noun changed", () => {
    const before = cfg({
      levels: [{ id: "section", noun: "Section", fallbackEmoji: "📂" }],
    });
    const after = {
      ...before,
      levels: normaliseLevels(
        [{ id: "section", noun: "Chapter", fallbackEmoji: "📂" }],
        { preserveIds: true }
      ),
    };
    const type = buildJournalType(after);
    expect(recognisedTypeValues(type).has("section")).toBe(true);
    expect(type.levels[0].noun).toBe("Chapter");
  });

  it("still resolves such a note's surface for 'add a section'", () => {
    const type = buildJournalType(
      cfg({ levels: [{ id: "section", noun: "Chapter", fallbackEmoji: "📂" }] })
    );
    const refs: JournalHostRef[] = [
      { type, root: type.root, templatesFolder: type.templatesFolder },
    ];
    const ctx = resolveSectionHost(
      refs,
      "03 - Journals/Cooking/Bakes/Bakes.md",
      "section"
    );
    expect(ctx?.noteKind).toBe("index");
    expect(ctx?.ownNoun).toBe("Chapter");
  });

  it("derives an id from the noun only when there isn't one", () => {
    expect(deriveLevelId("Project Area", 0)).toBe("project-area");
    expect(deriveLevelId("", 2)).toBe("level-2");
    const fresh = normaliseLevels(
      [{ noun: "Project Area", fallbackEmoji: "📂" }],
      { preserveIds: false }
    );
    expect(fresh[0].id).toBe("project-area");
  });

  it("keeps two levels of one journal apart when their nouns match", () => {
    const levels = normaliseLevels(
      [
        { noun: "Section", fallbackEmoji: "📂" },
        { noun: "Section", fallbackEmoji: "📂" },
      ],
      { preserveIds: false }
    );
    expect(levels.map((l) => l.id)).toEqual(["section", "section-2"]);
  });

  it("fills in ids for a config saved before they existed", () => {
    const legacy = {
      ...cfg(),
      levels: [{ noun: "Cuisine", fallbackEmoji: "🍳" }],
    } as JournalConfig;
    expect(normalizeJournalConfigs([legacy])[0].levels[0].id).toBe("cuisine");
  });
});

// ── the charts region ─────────────────────────────────────────────────────

describe("the journal charts region", () => {
  // The parser's contract says the fence "stays a place the reader may keep
  // things"; the writer kept only `header:` lines, so Add chart silently ate a
  // comment somebody had put there.
  it("keeps everything in the fence that isn't a chart spec", () => {
    const lines = [
      "# Note",
      "```almanac-journal-charts",
      "header:📊 My Charts",
      "<!-- ranked first on purpose -->",
      "jchart:j1:trend:confidence",
      "```",
    ];
    const out = spliceJournalChartRegion(lines, [
      { key: "j1", shape: "breakdown", tracker: "confidence" },
    ]);
    expect(out).toContain("header:📊 My Charts");
    expect(out).toContain("<!-- ranked first on purpose -->");
    expect(out).toContain("jchart:j1:breakdown:confidence");
  });

  // A `jchart:` line is documented as hand-writable, and the obvious way to
  // get a second chart is to copy the first — which copies its key. Two specs
  // sharing one made Edit… resolve to the first and Remove… delete both.
  it("makes a hand-copied key unique so every chart stays addressable", () => {
    const specs = parseJournalChartDirectives([
      "jchart:j1:trend:confidence",
      "jchart:j1:breakdown:confidence",
    ]);
    expect(specs).toHaveLength(2);
    expect(new Set(specs.map((s) => s.key)).size).toBe(2);
    expect(specs[0].shape).toBe("trend");
    expect(specs[1].shape).toBe("breakdown");
  });
});

// ── surfaces ──────────────────────────────────────────────────────────────

describe("what surface a page presents", () => {
  const refs: JournalHostRef[] = [
    {
      type: STUDY_JOURNAL,
      root: "03 - Journals",
      templatesFolder: "00 - Infrastructure/Templates/Studies",
    },
  ];
  const pageCtx = (): ReturnType<typeof resolveSectionHost> =>
    resolveSectionHost(
      refs,
      "03 - Journals/Maths/Algebra/Quadratics/Part 1.md",
      "page"
    );

  // Built with `{ kind: owner }` until 2.43, which said a page *was* its
  // parent: `hasPages: true` offered the Pages section on a page — a second
  // pages-table and a New page button spliced into a note that is itself a
  // page — and `isPage: false` would have seeded it a rating grid, against the
  // rule that a page's ratings belong to the note it is a page of.
  it("is a page, not the note it is a page of", () => {
    // As of 2.59.0 this is ONE field with three values rather than an
    // enum plus a flag. The old pair could say `{ surface: "index",
    // isPage: true }`, which is a page that is also an index — the shape of
    // the bug described above, where the two halves of the answer disagreed.
    const ctx = pageCtx();
    expect(ctx?.noteKind).toBe("page");
    expect(ctx?.hasPages).toBe(false);
    expect(ctx?.ownNoun).toBe("Page");
  });

  it("is never offered a page index of its own", () => {
    const ctx = pageCtx();
    expect(ctx).toBeTruthy();
    // `applies` is what withholds it; addableSections filters on top of that.
    const offered = sectionsFor(ctx!).map((s) => s.id);
    expect(offered).not.toContain("pages");
  });
});

// ── ancestors ─────────────────────────────────────────────────────────────

describe("crumbs for a note outside the type's root", () => {
  // A blind slice() of the root's length invented a trail: "99 - Elsewhere/…"
  // against Study's 13-character root produced crumbs named "e" and "Random",
  // pointing at folders that don't exist.
  it("returns nothing rather than inventing a trail", () => {
    expect(journalAncestors(STUDY_JOURNAL, "99 - Elsewhere/Random/Note.md")).toEqual([]);
  });

  it("still reads a note that is under the root", () => {
    expect(
      journalAncestors(STUDY_JOURNAL, "03 - Journals/Study/Maths/Algebra/Quadratics.md").map(
        (a) => a.name
      )
    ).toEqual(["Maths", "Algebra"]);
  });
});

// ── 2.44: display strings that were still doing work ──────────────────────

describe("pluralising a noun the reader chose", () => {
  // countLabel in journals-section.ts appended a bare "s". Both of the
  // wizard's own worked examples broke under it — "Dish" is its suggested
  // sub-level noun and "Entry" is the default kind on every new journal.
  it("handles the endings a folder-level noun actually has", () => {
    expect(plural("Topic")).toBe("Topics");
    expect(plural("Dish")).toBe("Dishes");
    expect(plural("Entry")).toBe("Entries");
    expect(plural("Batch")).toBe("Batches");
    expect(plural("Category")).toBe("Categories");
  });

  it("leaves a noun ending in a vowel + y alone", () => {
    expect(plural("Day")).toBe("Days");
  });

  it("knows the few the rules get wrong (4.39.1)", () => {
    // "Mediums appear here automatically" on the Media preset's empty state —
    // "Medium" matches no ending rule and the `+ "s"` fallback is not crude, it is
    // wrong. Crude was always the deal; wrong was not.
    //
    // A SHORT LIST AND NOT A DICTIONARY, which is `singularGuess`' own defence
    // fifteen lines below `plural` and is made for exactly this: those words are
    // listed because the rules mangle them outright, these because the rules
    // produce a word that is not English.
    expect(plural("Medium")).toBe("Media");
    expect(plural("Index")).toBe("Indices");
    expect(plural("Appendix")).toBe("Appendices");
    expect(plural("Criterion")).toBe("Criteria");
  });

  it("carries the caller's case rather than a stored capital", () => {
    // Level nouns are title case and the callers lowercase for prose, so a stored
    // "Media" would come out wrong in half the call sites — `${plural(noun)
    // .toLowerCase()} appear here` is the shape the empty states use.
    expect(plural("medium")).toBe("media");
    expect(plural("Medium")).toBe("Media");
    expect(plural("Medium").toLowerCase()).toBe("media");
  });

  it("does not swallow a word the rules already handle", () => {
    // The list is consulted FIRST, so an entry added carelessly would silently
    // override a working rule. These are the wizard's own worked examples and the
    // ending rules must still own them.
    expect(plural("Dish")).toBe("Dishes");
    expect(plural("Entry")).toBe("Entries");
    // AND THE ENTRY CONDITION HOLDS: a word earns a line only when it is a noun
    // someone would name a folder LEVEL after. Not every English irregular.
    expect(plural("Child")).toBe("Childs");
    expect(plural("Person")).toBe("Persons");
  });
});

describe("what a note says it is", () => {
  // Three readers, three spellings, until 2.44: typeRecognised and
  // classifyNote normalised, noteKindOf did not. So `type: Lesson` resolved
  // the journal type but not the kind, and the per-kind picker filter fell
  // through to its permissive branch without saying so.
  it("normalises the same way wherever it is read", () => {
    expect(normaliseTypeValue("Lesson")).toBe("lesson");
    expect(normaliseTypeValue("  practice  ")).toBe("practice");
    expect(normaliseTypeValue("")).toBeNull();
    expect(normaliseTypeValue("   ")).toBeNull();
    expect(normaliseTypeValue(undefined)).toBeNull();
    expect(normaliseTypeValue(42)).toBeNull();
  });

  it("recognises a kind whatever case the frontmatter used", () => {
    expect(typeRecognised(STUDY_JOURNAL, "Lesson")).toBe(true);
    expect(typeRecognised(STUDY_JOURNAL, " SUBJECT ")).toBe(true);
    expect(typeRecognised(STUDY_JOURNAL, "recipe")).toBe(false);
  });
});

// ── 2.44: the section a type actually declares ────────────────────────────

describe("adding a section to an existing note", () => {
  // section.render(ctx) was called with no overrides, so "add a section"
  // produced the catalogue's generic arrangement even where the host type
  // declares its own. Study's Topic index carries three resource shelves;
  // adding Resources to one gave a single "Files".
  it("renders with the host type's layout, not the catalogue's default", () => {
    const topic = sectionContext(STUDY_JOURNAL, { depth: 1 });
    expect(templateKeyFor(topic)).toBe("index:1");

    const resources = findSection("resources")!;
    const withLayout = renderSection(
      resources,
      topic,
      sectionOverrides(topic, "resources")
    );

    expect(withLayout).toContain("attach:res-docs|Docs");
    expect(withLayout).toContain("attach:res-tutorials|Tutorials");
    expect(withLayout).toContain("attach:res-practice|Practice");
    expect(withLayout).not.toContain("attach:resources|Files");
  });

  it("derives the same key templateTargets uses", () => {
    for (const t of templateTargets(STUDY_JOURNAL)) {
      expect(templateKeyFor(t.ctx)).toBe(t.key);
    }
  });

  it("falls back to the catalogue where a type declares nothing", () => {
    const flat = buildJournalType(cfg());
    const ctx = sectionContext(flat, { depth: 0 });
    expect(sectionOverrides(ctx, "resources")).toBeUndefined();
  });
});
