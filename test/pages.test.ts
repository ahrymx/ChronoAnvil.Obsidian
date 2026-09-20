// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import { TFile, TFolder } from "obsidian";
import { studyFile } from "./study-template";
import { readCode } from "./sources";
import { childNotes } from "../src/core/util";
import {
  STUDY_JOURNAL,
  journalAncestors,
  kindsCarrying,
  pagesSectionBlock,
} from "../src/journals/journal";
import { insertBelowBanner } from "../src/trackers/entry-trackers";
import { buildJournalType } from "../src/journals/custom-journal";

const asset = studyFile;

describe("the pages model", () => {
  it("puts pages on every kind, and Practice is the one that proves it", () => {
    // PER NOTE, NOT PER KIND AND NOT PER TYPE (1.0.23). It was per kind — Lesson
    // had pages and Practice did not — and the tick that said so is gone: a
    // Practice note that grows too long to read is the same note a Lesson
    // becomes. Levels are still fixed for a whole type, which is why promotion
    // is not a third level; that half of the old argument is untouched.
    const lesson = STUDY_JOURNAL.kinds.find((k) => k.id === "lesson")!;
    const practice = STUDY_JOURNAL.kinds.find((k) => k.id === "practice")!;
    expect(lesson.pages).toBeDefined();
    expect(practice.pages).toBeDefined();
    // ONE TEMPLATE FILE FOR THE JOURNAL, named by both. Two `page.md`s would be
    // the allocator's collision repair firing on a file nothing asked to be
    // distinct.
    expect(practice.pages.template).toBe(lesson.pages.template);
    expect(practice.pages.id).toBe(lesson.pages.id);
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

  it("gives a custom type pages without being asked", () => {
    // WAS "no pages unless it asks for them", and the asking is what 1.0.23
    // removed: a journal a reader makes in the wizard can split any of its notes
    // the day it exists, without finding a tick in Settings first.
    const cooking = buildJournalType({
      id: "cooking",
      name: "Cooking",
      emoji: "🍳",
      root: "03 - Journals/Cooking",
      templatesFolder: "T/Cooking",
      levels: [{ noun: "Section", fallbackEmoji: "📂" }],
      kinds: [{ id: "recipe", emoji: "🍲", label: "Recipe" }],
    });
    expect(cooking.kinds.every((k) => k.pages.id === "page")).toBe(true);
    expect(cooking.kinds[0].pages.template).toBe("page.md");
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

  it("has no cap at all any more, in any journal", () => {
    // WAS "extends the cap by exactly one" (1.0.23), and before that "does not
    // extend the cap for a type with no pages". Both were arguing about where
    // the trail should stop, and the answer 1.0.38 gives is that it stops where
    // the folders do. A page holds pages, so every folder between the root and
    // the note is a note that holds the one below it — there is no depth left
    // at which a folder is not describable.
    //
    // THE ROOT GUARD IS THE ONE THAT STAYED, and it is the one that was ever
    // doing the work: a note outside the type's root still invents nothing.
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
        "03 - Journals/Cooking/Sauces/Hollandaise/Step one.md"
      ).map((a) => a.name)
    ).toEqual(["Sauces", "Hollandaise"]);
    expect(
      journalAncestors(cooking,
        "03 - Journals/Cooking/Sauces/Warm/Hollandaise/Step one.md"
      ).map((a) => a.name)
    ).toEqual(["Sauces", "Warm", "Hollandaise"]);
    // And a page of a page of a page, which is the shape this release added.
    expect(
      journalAncestors(cooking,
        "03 - Journals/Cooking/Sauces/Warm/Hollandaise/Step one/Whisking.md"
      ).map((a) => a.name)
    ).toEqual(["Sauces", "Warm", "Hollandaise", "Step one"]);
    // Outside the root: still nothing, at any depth.
    expect(
      journalAncestors(cooking, "03 - Journals/Study/A/B/C/D.md")
    ).toEqual([]);
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

  it("grades a page, and keeps it out of the queue by its type", () => {
    // WAS "gives a page no confidence or status of its own", on the reason that
    // *"a page is not a unit of review"*. The conclusion is still true and the
    // MECHANISM was never the missing property: `confidenceKinds` narrowed an
    // average to the kinds that carry the tracker in 2.36 and builds the list
    // from `type.kinds`, so a page's `type:` — `kind.pages.id`, deliberately not
    // a kind — has been outside every average and every queue ever since,
    // whatever it holds. The 1.0.38 template grades the page for the reader's
    // own sake; nothing aggregates it.
    const t = asset("template-page.md");
    expect(t).toMatch(/^confidence: 1$/m);
    expect(t).toMatch(/^status: in-progress$/m);
    expect(t).toContain("tracker:confidence");
    // THE GUARANTEE, ASSERTED WHERE IT ACTUALLY LIVES. If a page's type ever
    // became a kind, this fails — which is the only way the paragraph above
    // could stop being true.
    expect(STUDY_JOURNAL.kinds.some((k) => k.id === "page")).toBe(false);
    expect(kindsCarrying(STUDY_JOURNAL, "confidence")).not.toContain("page");
  });

  it("gives the Lesson template a Pages section", () => {
    const t = asset("template-lesson.md");
    expect(t).toContain("pages-table");
    expect(t).toContain("button:study:new-page");
  });

  it("gives Practice one too, which is 1.0.23 on a shipped file", () => {
    // THE ONE TEMPLATE THIS RELEASE CHANGES, and it is the change: Practice was
    // the kind whose config said it could not hold pages, so it had no index and
    // no New page button. `test/golden/journal-study-kind-practice.md` is the
    // byte-for-byte version of this claim.
    const t = asset("template-practice.md");
    expect(t).toContain("pages-table");
    expect(t).toContain("button:study:new-page");
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

// ── THE PAGE THAT VANISHED WHEN IT WAS PROMOTED (1.0.38) ──────────────
//
// A bug report from the vault, one release into nesting: `HTML Divisions` was
// listed under its cheat sheet, the reader pressed New page on it, and it
// disappeared from the list it had been sitting in. Promotion moves
// `HTML Divisions.md` into `HTML Divisions/HTML Divisions.md`, and every caller
// asking for "the pages of this note" was asking `childFiles` for the markdown
// files BESIDE it — which the promoted page had just stopped being one of.
//
// The recursion that would have listed its own pages underneath it was already
// written and already correct. It was never reached: the row that carries it
// was gone.
describe("the notes at one level, promoted or not", () => {
  // A folder tree from paths, the shape `getAbstractFileByPath` returns.
  const tree = (root: string, paths: readonly string[]): TFolder => {
    const folder = new TFolder(root);
    const subs = new Map<string, string[]>();
    for (const rel of paths) {
      const cut = rel.indexOf("/");
      if (cut === -1) {
        folder.children.push(new TFile(`${root}/${rel}`));
        continue;
      }
      const name = rel.slice(0, cut);
      subs.set(name, [...(subs.get(name) ?? []), rel.slice(cut + 1)]);
    }
    for (const [name, rest] of subs) {
      folder.children.push(tree(`${root}/${name}`, rest));
    }
    return folder;
  };

  const names = (folder: TFolder): string[] =>
    childNotes(folder).map((f) => f.path);

  it("counts a promoted page, which sits one folder down", () => {
    const folder = tree("Web Design/Cheat Sheet", [
      "Cheat Sheet.md",
      "test1.md",
      "HTML Divisions/HTML Divisions.md",
    ]);
    expect(names(folder)).toContain(
      "Web Design/Cheat Sheet/HTML Divisions/HTML Divisions.md"
    );
    // AND THE NOTE ITSELF IS STILL IN THE LIST. `pagesBeside` drops the host by
    // path; that is not this function's job and never was.
    expect(names(folder)).toContain("Web Design/Cheat Sheet/Cheat Sheet.md");
  });

  it("stops at one level, which is the whole of the promise", () => {
    // The promoted page's OWN pages belong to it, and listing them here would
    // flatten the tree this release exists to build. `drawPageRows` asks again
    // with the promoted page as the note, and gets them there.
    const folder = tree("Web Design/Cheat Sheet", [
      "Cheat Sheet.md",
      "HTML Divisions/HTML Divisions.md",
      "HTML Divisions/test.md",
      "HTML Divisions/Deeper/Deeper.md",
    ]);
    expect(names(folder)).not.toContain(
      "Web Design/Cheat Sheet/HTML Divisions/test.md"
    );
    expect(names(folder)).not.toContain(
      "Web Design/Cheat Sheet/HTML Divisions/Deeper/Deeper.md"
    );
  });

  it("takes nothing from a folder that holds no note of its own", () => {
    // An attachments folder, a folder a reader made by hand and has not filled.
    // `isPromotedPath`'s rule over a TFolder: the note whose basename is its
    // folder's, and no other file in there is anybody's business here.
    const folder = tree("Web Design/Cheat Sheet", [
      "Cheat Sheet.md",
      "attachments/diagram.md",
      "Sketches/notes.md",
    ]);
    expect(names(folder)).toEqual(["Web Design/Cheat Sheet/Cheat Sheet.md"]);
  });

  it("sorts one run, not the loose files and then the promoted ones", () => {
    // Both halves land in the same `localeCompare` as `childFiles` alone used
    // to be, so the basename tie-break `pagesBeside` falls back on when nobody
    // numbered a page still means what it says.
    const folder = tree("Topic/Lesson", [
      "Charlie.md",
      "Alpha/Alpha.md",
      "Delta.md",
      "Bravo/Bravo.md",
    ]);
    expect(names(folder).map((p) => p.split("/").pop())).toEqual([
      "Alpha.md",
      "Bravo.md",
      "Charlie.md",
      "Delta.md",
    ]);
  });

  it("is what the three callers that meant it now ask", () => {
    // All three spelled "the pages of this note" as "the files beside it", and
    // all three were wrong in the same way the moment a page could be promoted:
    // the list, the ordinal allocator, and the bin's confirmation.
    expect(readCode("tables")).toContain("return childNotes(note.parent)");
    expect(readCode("journal.ts")).toContain("childNotes(folderNote.parent)");
    // The bin goes further, because the bin takes the FOLDER: every note under
    // it, not the row at the top of it.
    expect(readCode("kind-row-menu")).toContain(
      "filesUnder(plugin.app, file.parent.path).map((f) => f.path)"
    );
    expect(readCode("kind-row-menu")).not.toContain("childFiles(file.parent)");
  });
});
