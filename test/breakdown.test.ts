// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import { studyTemplate } from "./study-template";
import {
  STUDY_JOURNAL,
  deriveLevelId,
  recognisedTypeValues,
  typeRecognised,
} from "../src/journals/journal";
import { buildJournalType } from "../src/journals/custom-journal";
import { classifyNote, journalRootFor } from "../src/trackers/trackers";
import { sortBreakdown, BreakdownBar } from "../src/ui/tables";
import { parseJournalChartRegion } from "../src/charts/journal-charts";

import { readSrc } from "./sources";
const COOKING = buildJournalType({
  id: "cooking",
  name: "Cooking",
  emoji: "🍳",
  root: "03 - Journals/Cooking",
  templatesFolder: "T/Cooking",
  levels: [{ noun: "Section", fallbackEmoji: "📂" }],
  kinds: [{ id: "recipe", emoji: "🍲", label: "Recipe" }],
});

describe("what a journal recognises as its own", () => {
  it("names its kinds, its pages and its levels", () => {
    const v = recognisedTypeValues(STUDY_JOURNAL);
    expect([...v].sort()).toEqual(
      ["lesson", "page", "practice", "subject", "topic"].sort()
    );
  });

  it("derives a level's value with the rule that generates it", () => {
    // custom-journal.ts writes `type: ${deriveLevelId(noun, depth)}` into the
    // level index template. A second spelling here would mean generating notes
    // the journal then refuses to recognise.
    expect(deriveLevelId("Section", 0)).toBe("section");
    expect(deriveLevelId("Sub Project", 1)).toBe("sub-project");
    expect(deriveLevelId("", 2)).toBe("level-2");
    expect(recognisedTypeValues(COOKING).has("section")).toBe(true);
  });

  it("matches case-insensitively and rejects blanks", () => {
    expect(typeRecognised(STUDY_JOURNAL, "Lesson")).toBe(true);
    expect(typeRecognised(STUDY_JOURNAL, " topic ")).toBe(true);
    expect(typeRecognised(STUDY_JOURNAL, "")).toBe(false);
    expect(typeRecognised(STUDY_JOURNAL, undefined)).toBe(false);
    expect(typeRecognised(STUDY_JOURNAL, "recipe")).toBe(false);
  });
});

describe("Study's greedy root", () => {
  const paths = {
    diaryDaily: "02 - Diary/Daily",
    diaryMonthly: "02 - Diary/Monthly",
    templatesDiary: "T/Diary",
    journalRoots: [
      {
        typeId: "study",
        root: "03 - Journals",
        types: [...recognisedTypeValues(STUDY_JOURNAL)],
      },
      {
        typeId: "cooking",
        root: "03 - Journals/Cooking",
        types: [...recognisedTypeValues(COOKING)],
      },
    ],
  };

  it("still classifies a real Study note", () => {
    expect(
      classifyNote(paths, "03 - Journals/Maths/Algebra/Quadratics.md", undefined, "lesson")
    ).toEqual({ kind: "journal", typeId: "study" });
  });

  it("classifies an index note by its level value", () => {
    expect(
      classifyNote(paths, "03 - Journals/Maths/Maths.md", undefined, "subject")
    ).toEqual({ kind: "journal", typeId: "study" });
  });

  it("classifies a page, which is not a kind", () => {
    // Pages are excluded from `kinds` by design, so recognition has to name
    // them separately or a page would stop being a Study note.
    expect(
      classifyNote(
        paths,
        "03 - Journals/Maths/Algebra/Quadratics/Worked examples.md",
        undefined,
        "page"
      )
    ).toEqual({ kind: "journal", typeId: "study" });
  });

  it("leaves a stray note under the journals root unclassified", () => {
    // THE fix. Study's root is the whole tree, so the path test alone made
    // this a Study note — and two separate refusals then told it so.
    expect(classifyNote(paths, "03 - Journals/Scratch.md", undefined, undefined)).toBeNull();
    expect(
      classifyNote(paths, "03 - Journals/Reading list.md", undefined, "note")
    ).toBeNull();
  });

  it("does not let one journal's type value classify into another", () => {
    // A Cooking recipe sitting (wrongly) outside the Cooking root is not
    // thereby a Study note.
    expect(
      classifyNote(paths, "03 - Journals/Maths/Hollandaise.md", undefined, "recipe")
    ).toBeNull();
  });

  it("keeps longest-root-wins for a note that is recognised by both", () => {
    expect(
      journalRootFor(paths.journalRoots, "03 - Journals/Cooking/Sauces/Hollandaise.md")?.typeId
    ).toBe("cooking");
  });

  it("falls back to the path test when no types are supplied", () => {
    // Optional field: a caller passing a bare {typeId, root} gets pre-2.34
    // behaviour rather than nothing at all.
    const bare = { ...paths, journalRoots: [{ typeId: "study", root: "03 - Journals" }] };
    expect(classifyNote(bare, "03 - Journals/Scratch.md", undefined, undefined)).toEqual({
      kind: "journal",
      typeId: "study",
    });
  });

  it("does not disturb the diary passes", () => {
    expect(classifyNote(paths, "02 - Diary/Daily/Day-2026-03-04.md")).toEqual({
      kind: "diary",
      classes: ["daily"],
    });
  });

  it("is the guard both refusals now read", () => {
    const src = (n: string): string =>
      readSrc(n);
    // describeSurfaceMismatch reads classifyNote via noteSurfaceOf;
    // journalChartRefusal reads journalTypeOfNote. Both had to be guarded, or
    // fixing one would have left the other wrong.
    expect(src("entry-trackers.ts")).toContain('fm["type"]');
    expect(src("journal.ts")).toContain("typeRecognised(type, raw)");
  });
});

describe("journal-breakdown ordering", () => {
  const bar = (label: string, value: number): BreakdownBar => ({
    label,
    file: null,
    value,
    count: 1,
  });

  it("ranks weakest first", () => {
    // The whole point: a list you read top-down should start where the work is.
    const out = sortBreakdown([bar("Algebra", 4), bar("Trig", 2), bar("Sets", 5)]);
    expect(out.map((b) => b.label)).toEqual(["Trig", "Algebra", "Sets"]);
  });

  it("breaks ties by name rather than by filesystem order", () => {
    const out = sortBreakdown([bar("Zeta", 3), bar("Alpha", 3)]);
    expect(out.map((b) => b.label)).toEqual(["Alpha", "Zeta"]);
  });

  it("does not mutate its input", () => {
    const input = [bar("B", 5), bar("A", 1)];
    sortBreakdown(input);
    expect(input.map((b) => b.label)).toEqual(["B", "A"]);
  });
});

describe("journal-breakdown wiring", () => {
  const src = (n: string): string =>
    readSrc(n);

  it("takes a tracker id from the start, with no narrow preset", () => {
    // confidence-trend shipped hardcoded in 2.29 and had to be generalised in
    // 2.32. Nothing on disk names a narrow spelling of this one, so there is
    // nothing to keep working and no excuse to ship one.
    const w = src("widgets.ts");
    expect(w).toContain('case "journal-breakdown":');
    expect(w).not.toContain('"confidence-by-topic"');
    expect(w).toMatch(/buildJournalBreakdown\((?:this\.)?plugin, ctx, rest\.trim\(\), label\)/);
  });

  it("shares the refusal path with journal-chart", () => {
    expect(src("tables.ts")).toContain("journalChartRefusal(");
  });

  it("averages through confidenceStats so bar and column agree", () => {
    // topics-table already prints an average confidence per topic. Two
    // averages of the same thing is how they end up disagreeing.
    const t = src("tables.ts");
    const fn = t.slice(
      t.indexOf("export function buildJournalBreakdown"),
      t.indexOf("// ── confidence-summary")
    );
    expect(fn).toContain("confidenceStats(");
  });

  it("scales to the tracker's own range, not to the best bar", () => {
    // Normalising to the largest value present makes the best item full-width
    // whatever it scored — the opposite of what a weakest-first ranking is for.
    const t = src("tables.ts");
    expect(t).toContain("def.max ?? 0");
  });

  it("is registered as a composite kind", () => {
    const w = src("widgets.ts");
    const inlines = w.slice(
      w.indexOf("const INLINE_KINDS"),
      w.indexOf("]", w.indexOf("const INLINE_KINDS"))
    );
    // The set inverted in 2.56.25: it now lists the seven INLINE kinds, and
    // full-width is what everything else gets. So "renders as its own block"
    // is asserted by absence rather than presence.
    expect(inlines).not.toContain('"journal-breakdown"');
  });

  it("is on the Subject template beside the trend", () => {
    // Both readings, trend first — unchanged as intent. Only the spelling
    // moved: since 2.35 the two are `jchart:` lines in the note's managed
    // charts region rather than a pair of hand-written directives, so this
    // asserts what the template gives you rather than how it says it.
    const t = studyTemplate("Subject Index.md");
    const shapes = parseJournalChartRegion(t.split("\n")).map((s) => s.shape);
    expect(shapes).toEqual(["trend", "breakdown"]);
  });
});
