// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";
import { cssRule, readCss, readSrc } from "./sources";
import { STUDY_JOURNAL } from "../src/journals/journal";
import {
  buildJournalType,
  composeTemplate,
  freshCustomJournal,
  journalTemplateFiles,
} from "../src/journals/custom-journal";
import {
  childrenBar,
  childrenParts,
  sectionContext,
} from "../src/journals/journal-sections";
import { applySections, planSections, sectionsPresent } from "../src/journals/journal-plan";
import {
  argSpansIn,
  headerLevel,
  isHeaderLine,
  readArg,
  splitDirective,
  titledHeadersIn,
} from "../src/core/directive-grammar";
import { computeFoldHidden, FoldNode } from "../src/ui/headerbar";
import { kindHeadedBy } from "../src/ui/header-title";
import { composeJournalDashboardNote } from "../src/journals/journal-dashboard-sections";
import { composeJournalsDashboardNote } from "../src/journals/journals-dashboard-sections";
import { composeDiaryDashboardNote } from "../src/diary/diary-dashboard-sections";
import { composeDiaryDashboard } from "../src/diary/diary-sections";
import { composeEntryTemplate } from "../src/diary/entry-sections";
import { composeHomeNote } from "../src/diary/home-sections";
import { composeSearchNote } from "../src/diary/search-sections";
import { studyTemplate } from "./study-template";

// ── ONE SECTION, ONE BAR (5.12) ───────────────────────────────────────────
//
// A fence carries one section. Where it carries several titled heads, the first
// names the section and the rest name repeats INSIDE it — the deepest index's
// tables, one per note kind, which until this release were three level-1 bars
// stacked in one card and indistinguishable from the sections either side of it.
//
// The rule is stated once (`headerLevel`) and read by three places: the block
// processor that draws the bar, the rename offer that asks whether a head names
// a note kind, and the sweep below that keeps the catalogues honest about it.

// A note's fences, as their bodies' lines.
function fencesOf(text: string): string[][] {
  const out: string[][] = [];
  let open: string[] | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("```")) {
      if (open) out.push(open);
      open = open ? null : [];
      continue;
    }
    if (open) open.push(line);
  }
  return out;
}

// The titled heads of one fence, each with the level it RENDERS at — the
// processor's own question, asked of a composed file.
function headsOf(fence: readonly string[]): { title: string; level: number }[] {
  const titled = fence.filter(
    (l) => isHeaderLine(l) && splitDirective(l).argument.trim() !== ""
  );
  return titled.map((l, i) => {
    const title = splitDirective(l).argument.trim();
    return { title, level: headerLevel(title, i === 0) };
  });
}

// Every titled head of every fence in a note.
function headsIn(text: string): { title: string; level: number }[] {
  return fencesOf(text).flatMap(headsOf);
}

describe("the demotion rule", () => {
  it("reads a bare head as the section where it opens the fence", () => {
    expect(headerLevel("🗂️ What's below", true)).toBe(1);
  });

  it("reads a bare head as a group where something already opened it", () => {
    // The whole of the fix, in one line: the second head in a fence is a
    // division of the first section rather than a second one touching it.
    expect(headerLevel("📖 Lessons", false)).toBe(2);
  });

  it("leaves a level the reader wrote alone, in both directions", () => {
    // `explicit` exists for exactly this: a head that named its level said
    // what it wanted, and only a level the grammar DEFAULTED may be filled in.
    expect(headerLevel("1:Deliberately a section", false)).toBe(1);
    expect(headerLevel("2:A group, opening its fence", true)).toBe(2);
  });

  it("is stated once, and the processor reads it rather than restating it", () => {
    // A rule about what the reader SEES, re-derived in a second module, is how
    // a control comes to act on a head the page is drawing as something else.
    const src = readSrc("ui/widgets/index.ts");
    expect(src).toContain("const level = headerLevel(");
    expect(src).not.toMatch(/parsed\.explicit \|\| headerIndex === 0/);
    expect(readSrc("ui/header-title.ts")).toContain("headerLevel(readArg(lines, span)");
  });
});

describe("no catalogue composes two sections in one fence", () => {
  // THE SWEEP THAT MAKES THE DEMOTION RULE SAFE. Reading a bare second head as
  // a group is only right while nothing composes two heads that both mean to be
  // sections. Nothing does — a row fence carries exactly one, worded for the
  // band by the cell that opens it, and `resources` carries one over all its
  // shelves — and this is what stops the next section being the exception.
  const everything = (): { name: string; text: string }[] => {
    const out: { name: string; text: string }[] = [];
    const types = [
      STUDY_JOURNAL,
      buildJournalType({
        ...freshCustomJournal(new Set()),
        id: "cooking",
        levels: [
          { id: "cuisine", noun: "Cuisine", fallbackEmoji: "🍳" },
          { id: "dish", noun: "Dish", fallbackEmoji: "🍲" },
        ],
        kinds: [
          { id: "recipe", emoji: "🍽️", label: "Recipe", rating: "confidence" },
          { id: "attempt", emoji: "🔥", label: "Attempt" },
        ],
      }),
      buildJournalType(freshCustomJournal(new Set())),
    ];
    for (const type of types) {
      for (const f of journalTemplateFiles(type)) {
        out.push({ name: `${type.id}/${f.name}`, text: f.content });
      }
      out.push({
        name: `${type.id}/dashboard`,
        text: composeJournalDashboardNote(type),
      });
    }
    out.push({ name: "journals dashboard", text: composeJournalsDashboardNote() });
    out.push({ name: "diary dashboard", text: composeDiaryDashboardNote() });
    out.push({ name: "home", text: composeHomeNote("Diary") });
    out.push({ name: "search", text: composeSearchNote() });
    for (const grain of ["weekly", "monthly", "quarterly", "yearly"] as const) {
      out.push({ name: `diary ${grain}`, text: composeDiaryDashboard(grain) });
    }
    for (const grain of ["daily", "weekly", "monthly", "quarterly", "yearly"] as const) {
      out.push({ name: `entry ${grain}`, text: composeEntryTemplate(grain) });
    }
    return out;
  };

  it("sweeps every composed note in the tree", () => {
    for (const { name, text } of everything()) {
      for (const fence of fencesOf(text)) {
        const sections = headsOf(fence).filter((h) => h.level === 1);
        expect(
          sections.length,
          `${name} composes two sections in one fence: ${sections
            .map((h) => h.title)
            .join(" / ")}`
        ).toBeLessThan(2);
      }
    }
  });

  it("writes out the level of every head it does not mean as a section", () => {
    // THE SWEEP THAT ACTUALLY BITES, and the reason the one above is not enough:
    // a bare second head CANNOT come out level 1 — the demotion rule sees to
    // that — so a catalogue composing two bare heads does not fail that check,
    // it silently gets one of them reinterpreted. The rule may repair a note
    // that is already on disk; it may not be how a note composed today ends up
    // tiered. So every head after the first, in every fence this tree composes,
    // says `2:` outright.
    for (const { name, text } of everything()) {
      for (const fence of fencesOf(text)) {
        const titled = fence.filter(
          (l) => isHeaderLine(l) && splitDirective(l).argument.trim() !== ""
        );
        for (const line of titled.slice(1)) {
          expect(
            splitDirective(line).argument.trim(),
            `${name} leans on the demotion rule instead of writing a level`
          ).toMatch(/^\d+:/);
        }
      }
    }
  });

  it("finds the bars it is sweeping, so the sweep cannot pass on nothing", () => {
    const heads = everything().flatMap((n) => headsIn(n.text));
    expect(heads.filter((h) => h.level === 1).length).toBeGreaterThan(20);
    expect(heads.filter((h) => h.level === 2).length).toBeGreaterThan(0);
  });
});

describe("what the deepest index composes", () => {
  const study = () => sectionContext(STUDY_JOURNAL, { depth: 1 });
  const oneKind = buildJournalType({
    ...freshCustomJournal(new Set()),
    id: "cooking",
    levels: [{ id: "cuisine", noun: "Cuisine", fallbackEmoji: "🍳" }],
    kinds: [{ id: "recipe", emoji: "🍽️", label: "Recipe" }],
  });

  it("opens with the section's own bar and nothing else", () => {
    // NO ACTIONS STRIP WHERE EVERY GROUP CARRIES ITS OWN. The bar composes a
    // title alone, so `.ca-journal-header-widgets` is empty and the frame drops
    // it — the card opens with one line instead of a title, a hairline and a
    // full-width row holding one button whose rows are six lines below it.
    expect(childrenBar(study())).toEqual(["header:🗂️ What's below"]);
  });

  it("writes every kind as a group, at level 2, spelled out", () => {
    const parts = childrenParts(study());
    expect(parts.map((p) => p.lines[0])).toEqual([
      "header:2:📖 Lessons",
      "header:2:🛠️ Practice",
    ]);
    expect(parts.map((p) => p.probe)).toEqual([
      "kind-table:lesson",
      "kind-table:practice",
    ]);
  });

  it("puts every create beside the head of the rows it adds to", () => {
    const fence = [...childrenBar(study()), ...childrenParts(study()).flatMap((p) => p.lines)];
    // Once each — never the doubling the first draft of this section risked.
    expect(fence.filter((l) => l === "button:study:new-lesson").length).toBe(1);
    expect(fence.filter((l) => l === "button:study:new-practice").length).toBe(1);
    // And each one directly under its own head, which is what puts it inline in
    // that head's bar rather than in a strip of the section's.
    expect(fence).toEqual([
      "header:🗂️ What's below",
      "header:2:📖 Lessons",
      "button:study:new-lesson",
      "kind-table:lesson",
      "header:2:🛠️ Practice",
      "button:study:new-practice",
      "kind-table:practice",
    ]);
    // The FIRST kind is not special. It was, for one build: its button sat on
    // the section bar and its head showed none, which read as the one group
    // nobody could add to.
    expect(childrenParts(study())[0].lines).toContain("button:study:new-lesson");
  });

  it("gives a one-kind type its kind's name and no group at all", () => {
    // R5: one group is no grouping. The section and the group are the same
    // object, so it takes the name the reader gave the kind rather than a word
    // that would fit any of them.
    const ctx = sectionContext(oneKind, { depth: 0 });
    expect(childrenBar(ctx)).toEqual([
      "header:🍽️ Recipes",
      "button:cooking:new-recipe",
    ]);
    expect(childrenParts(ctx).flatMap((p) => p.lines)).toEqual([
      "kind-table:recipe",
    ]);
  });

  it("leaves a one-kind journal's fence exactly as 5.11 composed it", () => {
    // Nothing to migrate where there was never a stack of bars to unstack.
    const text = composeTemplate(sectionContext(oneKind, { depth: 0 }));
    expect(text).toContain(
      ["```chronoanvil", "header:🍽️ Recipes", "button:cooking:new-recipe", "kind-table:recipe", "```"].join("\n")
    );
  });

  it("keeps the shipped Topic index to one bar over two groups", () => {
    const heads = headsIn(studyTemplate("topic-index.md")).filter(
      (h) => h.title.includes("What's below") || h.title.includes("Lessons") || h.title.includes("Practice")
    );
    expect(heads).toEqual([
      { title: "🗂️ What's below", level: 1 },
      { title: "2:📖 Lessons", level: 2 },
      { title: "2:🛠️ Practice", level: 2 },
    ]);
  });
});

describe("the fold the tiering buys", () => {
  const bar = (level: number, collapsed = false): FoldNode => ({
    level,
    collapsed,
    heading: false,
  });
  const body = (): FoldNode => ({ level: 0, collapsed: false, heading: false });

  it("folds every group with the section", () => {
    // The card closes to one line, which is what a section's chevron has always
    // promised and what three level-1 bars could not deliver.
    expect(
      computeFoldHidden([bar(1, true), bar(2), body(), bar(2), body()])
    ).toEqual([false, true, true, true, true]);
  });

  it("folds one group without touching the next", () => {
    expect(
      computeFoldHidden([bar(1), bar(2, true), body(), bar(2), body()])
    ).toEqual([false, false, true, false, false]);
  });
});

describe("the group head is a division, not a bar", () => {
  it("is marked by the processor and by nothing else", () => {
    // The class is the seam between the fold scope (level 2, which three other
    // widgets also use, each inside its own DOM) and the look (a head inside a
    // card, which only this one is).
    const src = readSrc("ui/widgets/index.ts");
    expect(src).toContain('if (title && level === 2) frame.root.addClass("ca-journal-sec-group");');
    const others = ["ui/section-frame.ts", "ui/headerbar.ts", "ui/tables.ts", "journals/journals-section.ts"];
    for (const f of others) {
      expect(readSrc(f), `${f} builds a group head of its own`).not.toContain(
        "ca-journal-sec-group"
      );
    }
  });

  it("draws its rule above and none below", () => {
    // A hairline UNDER a title says "this names what follows, as a section
    // does"; over it, "a new part of the thing you are already in".
    const css = readCss();
    const block = css.slice(css.indexOf(".ca-journal-sec.ca-journal-sec-group"));
    expect(block.slice(0, 300)).toContain("border-bottom: 0");
    expect(block.slice(0, 300)).toContain("border-top: var(--ca-rule-hair)");
    expect(css).toContain(".ca-journal-sec-l1 + .ca-journal-sec-group");
  });

  it("takes no bracket from the level-2 nesting rule", () => {
    // WHAT THE SCREENSHOT SHOWED. `50-entry-header.css` indents level 2 and
    // draws a 2px rule down its left edge, for a journal type nested among the
    // blocks under "📚 Journals". A group head is level 2 for the FOLD SCOPE
    // and for nothing else, so it took the bracket too: the head sat inset from
    // the rows it names, its glyph fell out of line with the section title
    // above it, and the card gained the second vertical line this treatment
    // exists to not draw. The exclusion is on the rule; this is the sweep that
    // keeps a fourth left-edge declaration from arriving without one.
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, "");
    const offenders: string[] = [];
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const [, selector, body] = m;
      if (!/(?:border|margin|padding)-left\s*:/.test(body)) continue;
      for (const one of selector.split(",")) {
        // The LAST compound is the element the rule paints. `.ca-journal-sec-l2
        // > .ca-journal-header-toggle` resets a margin on a child and is not
        // this question; a rule ending in `.ca-journal-sec-l2` is the bar.
        const last = one.trim().split(/[\s>+~]+/).pop() ?? "";
        if (!last.includes(".ca-journal-sec-l2")) continue;
        if (!last.includes(":not(.ca-journal-sec-group)")) offenders.push(one.trim());
      }
    }
    expect(offenders).toEqual([]);
    // And the other half: the rule still exists and still brackets the nesting
    // it was written for. `cssRule` throws rather than passing vacuously.
    expect(
      cssRule(".ca-journal-sec-l2.ca-journal-header-bar:not(.ca-journal-sec-group)")
    ).toContain("border-left: 2px solid");
  });

  it("collapses to its own constant height", () => {
    // BOTH HALVES, because a token nothing reads and a read of a token nothing
    // defines are the two ways this goes quiet — the pair `tokens.test.ts`
    // sweeps for, asserted here for the one it was added for.
    const css = readCss();
    expect(css).toContain("min-height: var(--ca-grp-head-h)");
    expect(css).toContain("--ca-grp-head-h:");
  });

  it("leaves a group's create button its fill", () => {
    // The de-tint that shipped for one build had a premise — the section bar
    // carries the primary create, so the groups' must rank under it — and the
    // premise went away when every create moved beside its own rows. With no
    // button on the bar, these are the only actions in the card; the tier is
    // said by the strip's scale instead, which does not cost the affordance.
    expect(readCss()).not.toContain(".ca-journal-sec-group .ca-journal-header-widgets");
    // And the sizing that DOES say subordinate is still there for level 2.
    expect(readCss()).toContain(".ca-journal-sec-l2 .ca-journal-header-widgets .ca-journal-btn");
  });
});

describe("a Topic index written before 5.12", () => {
  // Exactly what the catalogue composed through 5.11: one bare head per kind,
  // its button and its table, and no bar naming the section they sit in.
  const legacy = [
    "```chronoanvil",
    "header:📖 Lessons",
    "button:study:new-lesson",
    "kind-table:lesson",
    "header:🛠️ Practice",
    "button:study:new-practice",
    "kind-table:practice",
    "```",
  ].join("\n");
  const ctx = () => sectionContext(STUDY_JOURNAL, { depth: 1 });
  const want = () => sectionsPresent(legacy, ctx());

  it("is reported as short of its title, in the words 5.10 wrote", () => {
    const op = planSections(legacy, ctx(), want()).find(
      (o) => o.sectionId === "children"
    );
    expect(op?.kind).toBe("extend");
    expect(op?.detail).toContain("no title over it");
  });

  it("gains exactly one line, at the top of the fence", () => {
    const out = applySections(legacy, ctx(), want())!;
    const before = legacy.split("\n");
    const after = out.split("\n");
    expect(after.length).toBe(before.length + 1);
    expect(after[1]).toBe("header:🗂️ What's below");
    // NOTHING IS REWRITTEN IN PLACE. The bare heads stay bare — the renderer
    // reads them as groups by position, and a repair that also retyped them
    // would be editing lines the reader may have renamed.
    expect(after.filter((l) => l.startsWith("header:2:"))).toEqual([]);
    expect(out).toContain("header:📖 Lessons");
  });

  it("is a no-op the second time", () => {
    const once = applySections(legacy, ctx(), want())!;
    expect(applySections(once, ctx(), sectionsPresent(once, ctx()))).toBeNull();
  });

  it("renders as one section over two groups once repaired", () => {
    const once = applySections(legacy, ctx(), want())!;
    expect(headsIn(once)).toEqual([
      { title: "🗂️ What's below", level: 1 },
      { title: "📖 Lessons", level: 2 },
      { title: "🛠️ Practice", level: 2 },
    ]);
  });

  it("leaves a bar the reader renamed alone", () => {
    // COUNTED, NOT MATCHED. Comparing the file's first head against the bar the
    // catalogue would compose reports a missing bar on every note whose reader
    // renamed it — the one thing this must never do.
    const renamed = applySections(legacy, ctx(), want())!.replace(
      "header:🗂️ What's below",
      "header:📚 Everything here"
    );
    expect(applySections(renamed, ctx(), sectionsPresent(renamed, ctx()))).toBeNull();
  });

  it("declines a fence that is short a head, rather than guessing", () => {
    // A reader deleted one group's head and kept its table. Two tables, one
    // head: the count says nothing certain, so nothing is written.
    const odd = legacy.split("\n").filter((l) => l !== "header:🛠️ Practice").join("\n");
    const out = applySections(odd, ctx(), sectionsPresent(odd, ctx()));
    expect(out === null || !out.includes("What's below")).toBe(true);
  });

  it("still reports a missing table as a missing table", () => {
    // The two doors do not fight: a note short of a KIND is an extend about
    // that kind, whether or not it is also short of its bar.
    const short = legacy
      .split("\n")
      .filter((l) => !l.includes("practice") && l !== "header:🛠️ Practice")
      .join("\n");
    const op = planSections(short, ctx(), sectionsPresent(short, ctx())).find(
      (o) => o.sectionId === "children"
    );
    expect(op?.kind).toBe("extend");
    expect(op?.detail).toContain("Practice");
  });
});

describe("which head names a note kind", () => {
  const lines = () => studyTemplate("topic-index.md").split("\n");
  const kindOf = (title: string): string | undefined => {
    const src = lines();
    const span = argSpansIn(src, "header").find(
      (s) => readArg(src, s) === title
    )!;
    return kindHeadedBy(src, span, STUDY_JOURNAL)?.id;
  };

  it("names the kind under each group head", () => {
    expect(kindOf("2:📖 Lessons")).toBe("lesson");
    expect(kindOf("2:🛠️ Practice")).toBe("practice");
  });

  it("names none under the section's own bar", () => {
    // The rename offer acts on a note type; the bar names the section, and
    // "What's below" is not a kind however many kinds sit under it.
    expect(kindOf("🗂️ What's below")).toBeUndefined();
  });

  it("names the kind on a one-head fence, where the two are one line", () => {
    const src = [
      "```chronoanvil",
      "header:📖 Lessons",
      "button:study:new-lesson",
      "kind-table:lesson",
      "```",
    ];
    const span = argSpansIn(src, "header")[0];
    expect(kindHeadedBy(src, span, STUDY_JOURNAL)?.id).toBe("lesson");
  });
});

describe("titledHeadersIn", () => {
  it("counts the heads that name something", () => {
    expect(
      titledHeadersIn(["```chronoanvil", "header:A", "header:2:B", "header:", "x", "```"])
    ).toEqual(["header:A", "header:2:B"]);
  });
});
