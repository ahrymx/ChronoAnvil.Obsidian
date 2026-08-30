// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import { studyFile } from "./study-template";
import {
  STUDY_JOURNAL,
  journalAncestors,
  pagesSectionBlock,
} from "../src/journals/journal";
import { insertBelowBanner } from "../src/trackers/entry-trackers";
import { buildJournalType } from "../src/journals/custom-journal";

const asset = studyFile;

describe("the pages model", () => {
  it("puts pages on the lesson kind and not on practice", () => {
    // Per kind, not per type: levels are fixed for a whole type, so making
    // this a level would force every lesson to be a folder.
    const lesson = STUDY_JOURNAL.kinds.find((k) => k.id === "lesson")!;
    const practice = STUDY_JOURNAL.kinds.find((k) => k.id === "practice")!;
    expect(lesson.pages).toBeDefined();
    expect(practice.pages).toBeUndefined();
  });

  it("keeps the page type out of the journal's kinds", () => {
    // THE load-bearing decision. Everything that asks "is this one of this
    // journal's notes?" filters by kinds — the review queue's leafNotes,
    // confidenceKinds, metaFor, the topic template's base blocks. Leaving
    // `page` out excludes it from all of them by construction rather than by
    // four separate rules.
    const lesson = STUDY_JOURNAL.kinds.find((k) => k.id === "lesson")!;
    expect(lesson.pages!.id).toBe("page");
    expect(STUDY_JOURNAL.kinds.map((k) => k.id)).not.toContain("page");
  });

  it("gives a custom type no pages unless it asks for them", () => {
    const cooking = buildJournalType({
      id: "cooking",
      name: "Cooking",
      emoji: "🍳",
      root: "03 - Journals/Cooking",
      templatesFolder: "T/Cooking",
      levels: [{ noun: "Section", fallbackEmoji: "📂" }],
      kinds: [{ id: "recipe", emoji: "🍲", label: "Recipe" }],
    });
    expect(cooking.kinds.every((k) => !k.pages)).toBe(true);
  });
});

describe("crumbs through a promoted note", () => {
  it("names the lesson a page belongs to", () => {
    // The repair: journalAncestors used to cap at type.levels.length, and
    // Study has two levels while a page sits three folders deep — so the
    // lesson dropped out of its own page's trail.
    const out = journalAncestors(STUDY_JOURNAL,
      "03 - Journals/Study/Maths/Algebra/Quadratics/Worked examples.md"
    );
    expect(out.map((a) => a.name)).toEqual(["Maths", "Algebra", "Quadratics"]);
  });

  it("still names the promoted lesson's own ancestors", () => {
    // The folder note itself: same list, and the banner drops the last crumb
    // as being the note you are on.
    expect(
      journalAncestors(STUDY_JOURNAL,
        "03 - Journals/Study/Maths/Algebra/Quadratics/Quadratics.md"
      ).map((a) => a.name)
    ).toEqual(["Maths", "Algebra", "Quadratics"]);
  });

  it("does not extend the cap for a type with no pages", () => {
    // A stray note filed too deep in a type that can't hold pages still
    // shouldn't invent crumbs for folders the type has no noun for.
    const cooking = buildJournalType({
      id: "cooking",
      name: "Cooking",
      emoji: "🍳",
      root: "03 - Journals/Cooking",
      templatesFolder: "T/Cooking",
      levels: [{ noun: "Section", fallbackEmoji: "📂" }],
      kinds: [{ id: "recipe", emoji: "🍲", label: "Recipe" }],
    });
    expect(
      journalAncestors(cooking,
        "03 - Journals/Cooking/Sauces/Warm/Hollandaise.md"
      ).map((a) => a.name)
    ).toEqual(["Sauces"]);
  });
});

describe("insertBelowBanner", () => {
  const banner = ["---", "type: lesson", "---", "```chronoanvil", "journal-header", "```"];

  it("puts the block under the banner, not at the end", () => {
    const out = insertBelowBanner([...banner, "", "## Overview", "prose"], ["NEW"]);
    expect(out.indexOf("NEW")).toBeGreaterThan(out.indexOf("journal-header"));
    expect(out.indexOf("NEW")).toBeLessThan(out.indexOf("## Overview"));
  });

  it("adds only — every original line survives", () => {
    // Promotion must never rewrite: a long lesson is precisely the one worth
    // splitting, and replacing it with a dashboard template would lose it.
    const original = [...banner, "", "## Overview", "prose", "more prose"];
    const out = insertBelowBanner(original, ["NEW"]);
    for (const line of original) expect(out).toContain(line);
    expect(out.length).toBe(original.length + 2); // the block plus its blank
  });

  it("falls back to just after the frontmatter with no banner", () => {
    const out = insertBelowBanner(
      ["---", "type: lesson", "---", "## Overview"],
      ["NEW"]
    );
    expect(out.indexOf("NEW")).toBeGreaterThan(out.lastIndexOf("---"));
    expect(out.indexOf("NEW")).toBeLessThan(out.indexOf("## Overview"));
  });

  it("copes with a note that has no frontmatter at all", () => {
    const out = insertBelowBanner(["## Overview"], ["NEW"]);
    expect(out).toContain("NEW");
    expect(out).toContain("## Overview");
  });
});

describe("the shipped templates", () => {
  it("ships a page template with the page type token", () => {
    const t = asset("template-page.md");
    expect(t).toMatch(/^type: \{\{type\}\}$/m);
    expect(t).toMatch(/^order: \{\{order\}\}$/m);
    expect(t).toContain("journal-header");
  });

  it("gives a page no confidence or status of its own", () => {
    // A page is not a unit of review. Both properties belong to the lesson,
    // which is what the queue schedules and the trend plots.
    const t = asset("template-page.md");
    expect(t).not.toMatch(/^confidence:/m);
    expect(t).not.toMatch(/^status:/m);
    expect(t).not.toContain("tracker:confidence");
  });

  it("gives the Lesson template a Pages section", () => {
    const t = asset("template-lesson.md");
    expect(t).toContain("pages-table");
    expect(t).toContain("button:study:new-page");
  });

  it("keeps the Pages section off Practice", () => {
    expect(asset("template-practice.md")).not.toContain("pages-table");
  });
});

describe("promoting a note that already has a page index", () => {
  // The bug: promotion spliced the Pages section in unconditionally, and the
  // shipped Lesson template already carries one. The first `New page` on a
  // lesson therefore left it with two `📄 Pages` bars, two New page buttons
  // and two identical tables.
  const promote = (text: string, label = "Page"): string =>
    insertBelowBanner(
      text.split("\n"),
      pagesSectionBlock(text.split("\n"), "study", label)
    ).join("\n");

  const count = (text: string, needle: string): number =>
    text.split(needle).length - 1;

  it("adds nothing to a note that has the whole section", () => {
    const t = asset("template-lesson.md");
    expect(pagesSectionBlock(t.split("\n"), "study", "Page")).toEqual([]);
  });

  it("leaves the shipped Lesson template byte-for-byte alone", () => {
    // Promotion still moves the note into its own folder; that is the part it
    // exists to do. The markdown is untouched.
    const t = asset("template-lesson.md");
    expect(promote(t)).toBe(t);
  });

  it("gives a note without one both halves", () => {
    const bare = ["```chronoanvil", "journal-header", "```", "", "## Overview"].join(
      "\n"
    );
    const out = promote(bare);
    expect(count(out, "pages-table")).toBe(1);
    expect(count(out, "button:study:new-page")).toBe(1);
    expect(out).toContain("header:📄 Pages");
  });

  it("uses the kind's own page noun in the bar it writes", () => {
    const bare = ["```chronoanvil", "journal-header", "```"].join("\n");
    expect(promote(bare, "Chapter")).toContain("header:📄 Chapters");
  });

  it("supplies only the half that is missing", () => {
    // Separately losable, so asked about separately: a note hand-edited down
    // to the table alone should get a bar, not a second table.
    const tableOnly = [
      "```chronoanvil",
      "journal-header",
      "```",
      "",
      "```chronoanvil",
      "pages-table",
      "```",
    ].join("\n");
    const out = promote(tableOnly);
    expect(count(out, "pages-table")).toBe(1);
    expect(count(out, "button:study:new-page")).toBe(1);

    const barOnly = [
      "```chronoanvil",
      "journal-header",
      "```",
      "",
      "```chronoanvil",
      "header:📄 Pages",
      "button:study:new-page",
      "```",
    ].join("\n");
    const out2 = promote(barOnly);
    expect(count(out2, "pages-table")).toBe(1);
    expect(count(out2, "button:study:new-page")).toBe(1);
  });

  it("recognises a retitled Pages bar", () => {
    // The reader may rename the section — journal-charts.ts preserves a
    // retitled header for the same reason. The directive is what the widget
    // keys off, so the directive is what "already has one" means.
    const renamed = asset("template-lesson.md").replace(
      "header:📄 Pages",
      "header:📖 Chapters"
    );
    expect(pagesSectionBlock(renamed.split("\n"), "study", "Page")).toEqual([]);
  });

  it("recognises a page index belonging to another journal type", () => {
    const custom = [
      "```chronoanvil",
      "journal-header",
      "```",
      "",
      "```chronoanvil",
      "header:📄 Pages",
      "button:cooking:new-page",
      "```",
      "",
      "```chronoanvil",
      "pages-table",
      "```",
    ].join("\n");
    expect(pagesSectionBlock(custom.split("\n"), "cooking", "Page")).toEqual([]);
  });

  it("does not count a directive quoted in prose", () => {
    // The documentation note names half the catalogue in running text. A
    // mention is not a widget, so the probe stays inside chronoanvil fences.
    const prose = [
      "```chronoanvil",
      "journal-header",
      "```",
      "",
      "Write `pages-table` in a fence to list this note's pages.",
    ].join("\n");
    expect(pagesSectionBlock(prose.split("\n"), "study", "Page").length)
      .toBeGreaterThan(0);
  });

  it("writes the section below the banner, not on the end", () => {
    const t = asset("template-lesson.md").replace(
      /```chronoanvil\nheader:📄 Pages\nbutton:study:new-page\n```\n\n```chronoanvil\npages-table\n```\n\n/,
      ""
    );
    const out = promote(t);
    expect(out.indexOf("pages-table")).toBeLessThan(out.indexOf("## Overview"));
  });
});
