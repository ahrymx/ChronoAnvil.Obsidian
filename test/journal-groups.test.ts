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
  CHILDREN_BAR,
  childrenBar,
  childrenBody,
  childrenParts,
  sectionContext,
} from "../src/journals/journal-sections";
import { consolidateChildren } from "../src/journals/children-consolidate";
import { asPerKindTables, bareHeadStack, perKindStack } from "./legacy-children";
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
    // ── AND NO GROUP HEAD ANYWHERE, AS OF 1.0.16 ──────────────────────
    //
    // This line read `toBeGreaterThan(0)`. The deepest index was the only
    // section in any catalogue that composed a level-2 head — one per note kind
    // — and it composes one table over every kind now, so the count is zero by
    // construction rather than by omission. Asserted as zero instead of deleted,
    // because the sweep above is what keeps the `2:` rule honest and a reader
    // who brings a group head back needs to be told, here, that it is the first
    // one in the tree.
    expect(heads.filter((h) => h.level === 2)).toEqual([]);
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

  // ── ONE TABLE OVER EVERY KIND (1.0.16) ──────────────────────────────
  //
  // *"I think page types can be consolidated on journal index pages, [Updates
  // Decisions scratchpads] can become one."*
  //
  // WHAT THESE ASSERTIONS SAID A RELEASE AGO, because the change is the whole
  // subject of the file they are in. 5.12 put one bar over a group per note
  // kind: a head, a create button and a table each, level 2 spelled out, with
  // the section's own bar carrying a title and nothing else. The reader's
  // project index drew that as three heads, three buttons, three chevrons and
  // three empty states over a folder holding one note.
  //
  // So the groups are gone and what is left is the shape the bar was always
  // heading towards: a title, one create that asks which type, one table with a
  // Type column. The 5.12 argument that a create button belongs beside the rows
  // it adds to is not reversed — there is one set of rows now, and the bar is
  // beside them.
  it("opens with its bar and the create that asks which type", () => {
    expect(childrenBar(study())).toEqual([
      "header:🗂️ What's below",
      "button:study:new",
    ]);
  });

  it("composes no group, because one table is not a list of tables", () => {
    // `parts` IS THE LOAD-BEARING ONE. It is what `missingParts` compares a
    // fence against, so a parts list left as it was would have the repair window
    // offer to put the per-kind groups back on every note composed today — the
    // consolidation undone by the machinery meant to be catching notes up.
    expect(childrenParts(study())).toEqual([]);
    const fence = [
      ...childrenBar(study()),
      ...childrenBody(study()),
    ];
    expect(fence).toEqual([
      "header:🗂️ What's below",
      "button:study:new",
      "kind-table",
    ]);
  });

  it("names no kind in the fence it writes", () => {
    // THE POINT OF THE BARE DIRECTIVE. Every line of this card used to carry a
    // kind id, in triplicate, which is why adding a note type needed a
    // migration to reach a note at all. One table over the host's own journal
    // has nothing per-kind in it to go out of date.
    const fence = [...childrenBar(study()), ...childrenBody(study())];
    for (const kind of STUDY_JOURNAL.kinds) {
      expect(fence.join("\n")).not.toContain(kind.id);
    }
  });

  it("gives a one-kind type its kind's name and no group at all", () => {
    // R5: one group is no grouping. The section and the group are the same
    // object, so it takes the name the reader gave the kind rather than a word
    // that would fit any of them.
    //
    // AND ITS LINES ARE UNTOUCHED BY 1.0.16, which is the second half of the
    // same rule: with one kind there is nothing to consolidate, so the bar still
    // names the kind, the button still names the kind, and the table still names
    // the kind. `consolidateChildren` refuses this type outright.
    const ctx = sectionContext(oneKind, { depth: 0 });
    expect(childrenBar(ctx)).toEqual([
      "header:🍽️ Recipes",
      "button:cooking:new-recipe",
    ]);
    expect(childrenParts(ctx).flatMap((p) => p.lines)).toEqual([
      "kind-table:recipe",
    ]);
    expect(childrenBody(ctx)).toEqual(["kind-table:recipe"]);
  });

  it("leaves a one-kind journal's lines exactly as 5.11 composed them", () => {
    // Nothing to migrate where there was never a stack of bars to unstack.
    //
    // THE THREE LINES ARE UNCHANGED AND THE FENCE AROUND THEM IS NOT (5.28).
    // The section is welded into the banner's, so what used to open with
    // ```chronoanvil now follows the tracker region inside it — which is the
    // whole of what the weld does and the reason this assertion is on the lines
    // rather than on the block.
    const text = composeTemplate(sectionContext(oneKind, { depth: 0 }));
    expect(text).toContain(
      ["header:🍽️ Recipes", "button:cooking:new-recipe", "kind-table:recipe", "```"].join("\n")
    );
    expect(text).not.toContain("```chronoanvil\nheader:🍽️ Recipes");
  });

  it("keeps the shipped Topic index to one bar and one table", () => {
    const text = studyTemplate("topic-index.md");
    const heads = headsIn(text).filter(
      (h) => h.title.includes("What's below") || h.title.includes("Lessons") || h.title.includes("Practice")
    );
    expect(heads).toEqual([{ title: "🗂️ What's below", level: 1 }]);
    expect(text).toContain("button:study:new\nkind-table\n");
    expect(text).not.toContain("kind-table:lesson");
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

describe("a Topic index written before 1.0.16", () => {
  // ── WHAT THIS DESCRIBE USED TO BE, AND WHY IT IS NOT THAT ─────────────
  //
  // "a Topic index written before 5.12": a fence of bare per-kind heads with no
  // bar over them, and the repair that put the bar back. The repair is gone with
  // the shape it was repairing — the section composes one table over every kind
  // now, so there are no groups for a bar to be missing from, and
  // `missingGroupBar` was deleted rather than left as a door that can only
  // return null.
  //
  // WHAT REPLACES IT IS THE HAZARD THE CHANGE CREATED. Both old shapes are
  // still on disk, in every vault, on every deepest index note — and a section
  // whose composition got SHORTER is the one direction attribution does not
  // forgive by itself. An unrecognised fence is nobody's, a section nobody owns
  // reads as ABSENT, and the next Save appends a SECOND *What's below* under the
  // first: 3.18 §1's shape, and 5.28's. So `superseded` declares the old
  // keyword lists alongside the composed one, and these are the assertions that
  // it does.
  const ctx = () => sectionContext(STUDY_JOURNAL, { depth: 1 });
  const tiered = () => ["```chronoanvil", `header:${CHILDREN_BAR}`, ...perKindStack(STUDY_JOURNAL), "```"].join("\n");
  const bare = () => ["```chronoanvil", ...bareHeadStack(STUDY_JOURNAL), "```"].join("\n");

  for (const [era, note] of [
    ["5.12, a bar over one group per kind", tiered],
    ["5.11, bare heads and no bar at all", bare],
  ] as const) {
    describe(era, () => {
      it("is still read as this section, so Save appends no second card", () => {
        expect(sectionsPresent(note(), ctx())).toContain("children");
      });

      it("is kept, not extended and not re-added", () => {
        const op = planSections(note(), ctx(), sectionsPresent(note(), ctx())).find(
          (o) => o.sectionId === "children"
        );
        expect(op?.kind).toBe("keep");
        expect(applySections(note(), ctx(), sectionsPresent(note(), ctx()))).toBeNull();
      });
    });
  }

  it("is consolidated by the migration, to the byte the composer writes", () => {
    // THE ROUND TRIP IS THE ASSERTION. `asPerKindTables` ages a note this
    // release composed by putting 5.12's six lines back where its two are, and
    // the migration has to return the note it started from — not something
    // equivalent, the same text. Anything else is a rewrite drifting from the
    // composer, which is the failure no golden can catch because the golden and
    // the migration would drift together.
    const fresh = studyTemplate("topic-index.md");
    const aged = asPerKindTables(fresh, STUDY_JOURNAL);
    expect(aged).not.toBe(fresh);
    expect(consolidateChildren(aged, STUDY_JOURNAL)).toBe(fresh);
  });

  it("reports no missing kind, which is why the merge is the offer", () => {
    // 5.12's answer to a kind added to the journal was `extend`: a new kind was
    // a new part, and a note short of a part was offered the three lines. One
    // table lists a kind added five minutes ago without being touched, so there
    // is nothing left for `extend` to say — and `kind-change.ts`'s unhedged
    // promise that *"Dashboards will offer to list the new type"* is kept at
    // that door by `consolidateChildren` instead, which is why the pure
    // function has two callers.
    const short = tiered()
      .split("\n")
      .filter((l) => !l.includes("practice") && !l.includes("Practice"))
      .join("\n");
    const op = planSections(short, ctx(), sectionsPresent(short, ctx())).find(
      (o) => o.sectionId === "children"
    );
    expect(op?.kind).toBe("keep");
  });

  it("offers no group back to a note composed today", () => {
    // `missingParts` only ever ADDS, and it compares a fence against `parts`.
    // A parts list left as it was would have the repair window offer to put the
    // per-kind groups back onto every note this release writes — the
    // consolidation undone by the machinery meant to be catching notes up.
    const fresh = studyTemplate("topic-index.md");
    expect(planSections(fresh, ctx(), sectionsPresent(fresh, ctx())).find(
      (o) => o.sectionId === "children"
    )?.kind).toBe("keep");
  });
});

describe("which head names a note kind", () => {
  // ON A NOTE IN THE OLD SHAPE, which is the only shape that has a head per
  // kind to ask about. The rename offer reads a file, not a catalogue, and the
  // files carrying group heads are the ones every vault already has — so the
  // fixture is 1.0.15's composition (`test/legacy-children.ts`) rather than the
  // template this release ships.
  const lines = () =>
    asPerKindTables(studyTemplate("topic-index.md"), STUDY_JOURNAL).split("\n");
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
    expect(kindOf(CHILDREN_BAR)).toBeUndefined();
  });

  it("names none on a consolidated card, where no head names a kind", () => {
    // 1.0.16, and it falls out of the walk rather than needing a rule: the bar
    // is the fence's only head, so the level test passes it through, and the
    // line it then looks for is `kind-table:<id>`. A bare `kind-table` names no
    // kind, so there is no kind to offer a rename for — which is the truth about
    // a card listing all of them.
    const src = studyTemplate("topic-index.md").split("\n");
    const span = argSpansIn(src, "header").find(
      (s) => readArg(src, s) === CHILDREN_BAR
    )!;
    expect(kindHeadedBy(src, span, STUDY_JOURNAL)).toBeNull();
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
