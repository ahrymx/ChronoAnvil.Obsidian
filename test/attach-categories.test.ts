// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Categories window, 1.0.49.
//
// *"Attachments section should lose the 'x' button and have it replaced with a
// categories settings window where its categories can be changed/removed."*
//
// The ✕ removed an empty category from the shelf's own head, once per shelf. It
// is gone; the section's title bar now opens a window holding the whole list,
// where the three edits a list needs — add, rename, remove — are three controls
// in one place and nothing is written until Save.
//
// WHAT THESE TESTS ARE ABOUT. The window is DOM and this suite has none, so it
// is pinned by its source shape. What is worth testing is underneath it: the
// draft the window hands back is turned into one file edit by two pure
// functions, and every guarantee the ✕ carried has to still hold through them —
// an empty-only removal checked against the FILE rather than against the
// window, never the last category, and a note left exactly as it was found
// after an add and a remove cancel out.
//
// `test/ui-fixes-3-19-2.test.ts` holds the other half: that the ✕ and its four
// stylesheet rules are actually gone, which is what makes this a replacement
// rather than an addition.

import { describe, expect, it } from "vitest";
import { cssRule, readCode, readSrc } from "./sources";
import { isValidNoteKey } from "../src/core/notestore";
import {
  ATTACH_FORMATS,
  applyAttachCategories,
  attachFormatOf,
  categoryItemCount,
  categoryNonImageCount,
  nextAttachFormat,
  offeredFormats,
  withAttachFormat,
  newCategoryKey,
  normaliseCategoryLabel,
  planAttachCategories,
  readAttachCategories,
  type AttachCategoryRow,
} from "../src/ui/attach-categories";

// A Resources section as the composer writes one: a header bar with one
// `attach:` line per category, and a region per category below the fence.
// The third element of a tuple is anything the head carries after the key,
// written exactly as the line has it — `"#gallery"`, `"#widget#gallery"`, a
// `":tail"` (1.0.49 §6). Absent is the plain line every other case uses.
const note = (
  cats: [string, string, string?][],
  bodies: Record<string, string[]> = {}
): string =>
  [
    "```chronoanvil",
    "header:📎 Attachments",
    ...cats.map(([key, label, head]) => `attach:${key}${head ?? ""}|${label}`),
    "```",
    "",
    "Some prose the reader wrote.",
    ...cats.flatMap(([key]) => [
      "",
      `<!--chronoanvil:${key}`,
      ...(bodies[key] ?? []),
      "-->",
    ]),
  ].join("\n");

// A category as this file's notes compose one: no flags on the line and no
// argument tail, which is every line `note()` writes. Stated once so the pins
// below read as "these two categories, in this order" rather than as four
// fields of nothing — and so a round that puts something else on these lines
// has one place to say so (1.0.49 §6).
const cat = (
  key: string,
  label: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> => ({ key, label, tokens: [], tail: "", ...extra });

const shown = (text: string): AttachCategoryRow[] =>
  readAttachCategories(text).map((c) => ({
    key: c.key,
    label: c.label,
    format: attachFormatOf(c.tokens),
  }));

const save = (text: string, rows: AttachCategoryRow[]): string => {
  const plan = planAttachCategories(text, rows);
  expect(plan).not.toBeNull();
  return applyAttachCategories(text, plan!);
};

describe("reading the list a window has to show", () => {
  it("takes the key and the label off each directive", () => {
    expect(readAttachCategories(note([["books", "Books"], ["films", "Films"]])))
      .toEqual([cat("books", "Books"), cat("films", "Films")]);
  });

  it("falls back to the key when a directive carries no label", () => {
    // `attach:resources` with no `|Label` is legal and the oldest shape of the
    // directive. A row with a blank name would be a row a reader cannot aim at.
    expect(readAttachCategories("```\nattach:resources\n```")).toEqual([
      cat("resources", "resources"),
    ]);
  });

  it("ignores a directive with no key at all", () => {
    expect(readAttachCategories("```\nattach:\nattach: |Nothing\n```")).toEqual([]);
  });
});

describe("a name the directive line can hold", () => {
  it("drops the separator rather than escaping it", () => {
    // `attach:<key>|<label>` has no escape. "Books|Films" would read back as
    // "Books" on the next render, losing the rest without a message.
    expect(normaliseCategoryLabel("Books|Films")).toBe("Books Films");
    expect(normaliseCategoryLabel("Code `samples`")).toBe("Code samples");
  });

  it("collapses the whitespace that came with it", () => {
    expect(normaliseCategoryLabel("  Long   reads  ")).toBe("Long reads");
  });

  it("refuses a name with nothing to make a key out of", () => {
    // A category's key is where what gets dropped on it is stored, so a name
    // that slugifies to nothing is a shelf with nowhere to put anything.
    expect(normaliseCategoryLabel("")).toBeNull();
    expect(normaliseCategoryLabel("   ")).toBeNull();
    expect(normaliseCategoryLabel("—")).toBeNull();
    expect(normaliseCategoryLabel("|||")).toBeNull();
  });
});

describe("the key a new category gets", () => {
  it("is the slug of its name", () => {
    expect(newCategoryKey("Long reads", new Set())).toBe("long-reads");
  });

  it("suffixes rather than refusing a collision", () => {
    // Two categories named "Books" is two categories — a reader who does that
    // wants two, not an error.
    const taken = new Set(["books"]);
    expect(newCategoryKey("Books", taken)).toBe("books-2");
    taken.add("books-2");
    expect(newCategoryKey("Books", taken)).toBe("books-3");
  });

  it("is always a valid region key, which is why nothing validates it", () => {
    // THE CHECK THAT CAN ACTUALLY BITE. `newCategoryKey` returns a string with
    // no validity gate, because `slugify`'s alphabet and `isValidNoteKey`'s
    // grammar are the same alphabet — a gate there could reject nothing. What
    // can break is the two drifting apart, and that is this.
    for (const label of [
      "Books",
      "Long reads 2026",
      "Émigré films",
      "C++ / Rust",
      "...",
      "日本語",
      "a".repeat(80),
      "Books|Films",
    ]) {
      const clean = normaliseCategoryLabel(label);
      if (clean == null) continue;
      expect(isValidNoteKey(newCategoryKey(clean, new Set())), label).toBe(true);
    }
    // And the fallback for a name that is all punctuation, which `normalise`
    // refuses but the key function must still answer for.
    expect(newCategoryKey("...", new Set())).toBe("resources");
  });
});

describe("there has to be a section to edit", () => {
  it("plans nothing for a note with no attach: line", () => {
    expect(planAttachCategories("# Just a note\n", [])).toBeNull();
  });

  it("plans nothing for a fence that is never closed", () => {
    // The anchor for a new category is the fence close after the last
    // directive. Without one there is nowhere to write the region's partner.
    expect(
      planAttachCategories("```chronoanvil\nattach:books|Books\n", [])
    ).toBeNull();
  });
});

describe("renaming", () => {
  it("changes the label and keeps the key", () => {
    // THE WHOLE REASON A RENAME IS SAFE. The key binds the directive to the
    // region holding the reader's files; renaming it would mean moving every
    // attachment in it.
    const text = note([["videos", "Videos"]], { videos: ["- ![[clip.mp4]]"] });
    const out = save(text, [{ key: "videos", label: "Films" }]);
    expect(out).toContain("attach:videos|Films");
    expect(out).toContain("<!--chronoanvil:videos");
    expect(out).toContain("- ![[clip.mp4]]");
  });

  it("is not a rename when the label has not changed", () => {
    // ASSERTED ON THE PLAN, not only on the text, and that is the difference
    // between a test and a tautology here: a rename that rewrites a line to
    // what it already said leaves the file byte-identical, so the text alone
    // cannot tell a no-op apart from a redundant write. The plan can.
    const text = note([["books", "Books"]]);
    expect(planAttachCategories(text, shown(text))?.renames).toEqual([]);
    expect(save(text, shown(text))).toBe(text);
  });

  it("keeps the old name when the new one is unusable", () => {
    // The tags window's rule: silently losing a name the reader meant to keep
    // is the failure worth avoiding.
    const text = note([["books", "Books"]]);
    expect(planAttachCategories(text, [{ key: "books", label: "   " }])?.renames)
      .toEqual([]);
    expect(save(text, [{ key: "books", label: "   " }])).toBe(text);
  });

  it("cleans the name on the way into the file", () => {
    const text = note([["books", "Books"]]);
    expect(save(text, [{ key: "books", label: "Books | Films" }])).toContain(
      "attach:books|Books Films"
    );
  });

  it("ignores a row naming a category the file no longer has", () => {
    // The window can sit open while the note changes under it. The file is the
    // authority on what exists, so a stale row is dropped rather than re-added
    // — which would resurrect a directive with no region behind it.
    const text = note([["books", "Books"]]);
    const plan = planAttachCategories(text, [
      ...shown(text),
      { key: "gone", label: "Gone" },
    ]);
    // Dropped where it is visible — a rename of a key that is not there would
    // otherwise sit in the plan, land nothing, and make every "did this save do
    // anything" question answer wrongly.
    expect(plan?.renames).toEqual([]);
    expect(plan?.adds).toEqual([]);
    const out = applyAttachCategories(text, plan!);
    expect(out).toBe(text);
    expect(readAttachCategories(out).map((c) => c.key)).toEqual(["books"]);
  });
});

describe("adding", () => {
  it("writes the directive inside the fence and the region below it", () => {
    const text = note([["books", "Books"]]);
    const out = save(text, [...shown(text), { key: null, label: "Long reads" }]);
    const lines = out.split("\n");
    expect(lines[3]).toBe("attach:long-reads|Long reads");
    expect(lines[4]).toBe("```");
    expect(out).toContain("<!--chronoanvil:long-reads");
    // The region goes straight after the fence, ahead of what follows it, so
    // the shelves and their regions stay in the same order.
    expect(out.indexOf("<!--chronoanvil:long-reads")).toBeLessThan(
      out.indexOf("<!--chronoanvil:books")
    );
  });

  it("gives two new categories in one save two keys", () => {
    const text = note([["books", "Books"]]);
    const out = save(text, [
      ...shown(text),
      { key: null, label: "Books" },
      { key: null, label: "Books" },
    ]);
    expect(readAttachCategories(out).map((c) => c.key)).toEqual([
      "books",
      "books-2",
      "books-3",
    ]);
  });

  it("skips a row the reader typed nothing usable into", () => {
    const text = note([["books", "Books"]]);
    expect(save(text, [...shown(text), { key: null, label: "   " }])).toBe(text);
  });
});

describe("removing", () => {
  it("takes the directive, the region and the blank line with it", () => {
    const text = note([["books", "Books"], ["films", "Films"]]);
    const out = save(text, [{ key: "films", label: "Films" }]);
    expect(out).not.toContain("attach:books");
    expect(out).not.toContain("<!--chronoanvil:books");
    // THE BLANK LINE IS PART OF THE REGION'S FOOTPRINT. Adding writes one;
    // removing has to take it, or a note gains a line per add/remove cycle.
    expect(out).toBe(note([["films", "Films"]]));
  });

  it("refuses a category with anything in it, and says how much", () => {
    const text = note([["books", "Books"]], {
      books: ["- [[Dune]]", "- [Review](https://x.test)"],
    });
    const plan = planAttachCategories(text, []);
    expect(plan?.removes).toEqual([]);
    expect(plan?.kept).toEqual([cat("books", "Books", { items: 2 })]);
    expect(applyAttachCategories(text, plan!)).toBe(text);
  });

  it("counts what the shelf itself shows", () => {
    // THROUGH `parseAttachments`, which is the widget's own count — so the
    // number in the window's row and the number of chips on the shelf are one
    // answer rather than two that agree most of the time. Free text counts: a
    // region carrying prose from the days when `attachments` was a plain
    // `note:` textarea holds that many chips, and they are the reader's.
    const text = note([["books", "Books"]], {
      books: ["- [[Dune]]", "", "a note to self"],
    });
    expect(categoryItemCount(text, "books")).toBe(2);
    // The blank line every region ships with between its markers is not an
    // item, which is the whole difference from counting lines — and is why a
    // category nobody has touched reads as empty.
    expect(categoryItemCount(note([["films", "Films"]], { films: [""] }), "films")).toBe(0);
    expect(categoryItemCount(text, "films")).toBe(0);
  });

  it("refuses the last one, and abandons every removal rather than picking one", () => {
    // Which category a reader would have wanted left behind is not a question
    // this can answer, and keeping the first would leave them looking at a list
    // they did not ask for.
    const text = note([["books", "Books"], ["films", "Films"]]);
    const plan = planAttachCategories(text, []);
    expect(plan?.floor).toBe(true);
    expect(plan?.removes).toEqual([]);
    expect(applyAttachCategories(text, plan!)).toBe(text);
  });

  it("counts what is being ADDED towards the floor", () => {
    // The rule is about what is left, not about what goes. A reader replacing
    // their only category has not emptied the section.
    const text = note([["books", "Books"]]);
    const plan = planAttachCategories(text, [{ key: null, label: "Films" }]);
    expect(plan?.floor).toBe(false);
    expect(readAttachCategories(save(text, [{ key: null, label: "Films" }])))
      .toEqual([cat("films", "Films")]);
  });

  it("does not count a REFUSED removal towards the floor", () => {
    // One category, with files in it, and the reader asks for it to go. The
    // emptiness guard keeps it, so there is no floor to hit — and two refusals
    // reported for one row would be a window saying the same no twice.
    const text = note([["books", "Books"]], { books: ["- [[Dune]]"] });
    const plan = planAttachCategories(text, []);
    expect(plan?.kept.map((c) => c.key)).toEqual(["books"]);
    expect(plan?.floor).toBe(false);
  });

  it("finds a region written under the old spelling", () => {
    // THE BUG THIS ROUND FIXED ON THE WAY PAST. `removeAttachCategory` matched
    // `<!--chronoanvil:${key}` itself, so on a vault written before the rename
    // the emptiness guard (which reads both prefixes) passed while the line
    // search found nothing — and the directive was removed while the reader's
    // files stayed behind in a comment nothing renders. `regionLineSpan` reads
    // both prefixes, in one place.
    const text = [
      "```chronoanvil",
      "header:📎 Attachments",
      "attach:books|Books",
      "attach:films|Films",
      "```",
      "",
      "<!--almanac:books",
      "-->",
      "",
      "<!--chronoanvil:films",
      "-->",
    ].join("\n");
    const out = save(text, [{ key: "films", label: "Films" }]);
    expect(out).not.toContain("almanac:books");
    expect(out).not.toContain("attach:books");
  });
});

describe("one save, however many edits are in it", () => {
  it("renames, removes and adds in one pass", () => {
    const text = note([
      ["books", "Books"],
      ["films", "Films"],
      ["papers", "Papers"],
    ]);
    const out = save(text, [
      { key: "books", label: "Long reads" },
      { key: "papers", label: "Papers" },
      { key: null, label: "Audio" },
    ]);
    expect(readAttachCategories(out)).toEqual([
      cat("books", "Long reads"),
      cat("papers", "Papers"),
      cat("audio", "Audio"),
    ]);
    // Every region accounted for: the removed one gone, the others untouched,
    // the new one written.
    expect(out).not.toContain("<!--chronoanvil:films");
    expect(out).toContain("<!--chronoanvil:books");
    expect(out).toContain("<!--chronoanvil:papers");
    expect(out).toContain("<!--chronoanvil:audio");
    // And the reader's prose between the fence and the regions is still there.
    expect(out).toContain("Some prose the reader wrote.");
  });

  it("survives removing the category whose directive anchors the new one", () => {
    // THE SPLICE ORDER, AS AN EDGE RATHER THAN AS A CLAIM. A new category is
    // written after the LAST `attach:` line and its region after the fence
    // close — both measured on the file as it arrived. Removing that same last
    // directive in the same save is the case where an insertion and a deletion
    // land on adjacent lines, and the bottom-up order is what keeps them from
    // being measured against each other.
    const text = note([["books", "Books"], ["films", "Films"]]);
    const out = save(text, [
      { key: "books", label: "Books" },
      { key: null, label: "Audio" },
    ]);
    expect(readAttachCategories(out)).toEqual([
      cat("books", "Books"),
      cat("audio", "Audio"),
    ]);
    expect(out).not.toContain("<!--chronoanvil:films");
    expect(out).toContain("<!--chronoanvil:audio");
  });

  it("writes the new region where the first one was just removed", () => {
    // THE ONE PAIR OF SPLICES THAT CAN LAND ON THE SAME LINE. A new category's
    // region goes at `close + 1`; the first existing region's footprint starts
    // at the blank line after the fence — the same line — whenever nothing sits
    // between the fence and the regions. The deletion has to go first: the
    // other order deletes the three lines the insertion had just written, which
    // loses the new category and keeps the one that was being removed.
    const text = [
      "```chronoanvil",
      "header:📎 Attachments",
      "attach:books|Books",
      "attach:films|Films",
      "```",
      "",
      "<!--chronoanvil:books",
      "-->",
      "",
      "<!--chronoanvil:films",
      "-->",
    ].join("\n");
    const out = save(text, [
      { key: "films", label: "Films" },
      { key: null, label: "Audio" },
    ]);
    expect(readAttachCategories(out)).toEqual([
      cat("films", "Films"),
      cat("audio", "Audio"),
    ]);
    expect(out).toContain("<!--chronoanvil:audio");
    expect(out).not.toContain("<!--chronoanvil:books");
    expect(out).toContain("<!--chronoanvil:films");
  });

  it("anchors on the fence the categories are in, not the first one in the note", () => {
    // A note can carry an ordinary code block above its Resources section. The
    // fence close is searched for FROM the last `attach:` line, so an earlier
    // one cannot claim the new region — which would write it into the reader's
    // code block.
    const text = [
      "```",
      "some code",
      "```",
      "",
      "```chronoanvil",
      "header:📎 Attachments",
      "attach:books|Books",
      "```",
      "",
      "<!--chronoanvil:books",
      "-->",
    ].join("\n");
    const out = save(text, [
      { key: "books", label: "Books" },
      { key: null, label: "Audio" },
    ]).split("\n");
    expect(out.slice(0, 3)).toEqual(["```", "some code", "```"]);
    expect(out[6]).toBe("attach:books|Books");
    expect(out[7]).toBe("attach:audio|Audio");
    expect(out[8]).toBe("```");
    expect(out[10]).toBe("<!--chronoanvil:audio");
  });

  it("gives a cancelling pair a key of its own", () => {
    // Remove `books` and add "Books" in one save. The new key is `books-2`,
    // not `books`: the key being freed is still taken as far as this save is
    // concerned, because the removal can be REFUSED (a drop landing while the
    // window sat open) and two categories sharing one region is the one
    // outcome with no way back.
    const text = note([["books", "Books"]]);
    const out = save(text, [{ key: null, label: "Books" }]);
    expect(readAttachCategories(out)).toEqual([cat("books-2", "Books")]);
  });

  it("writes nothing at all when the list came back unchanged", () => {
    // So a reader who opens the window, reads it and presses Save does not get
    // a modified note in their sync history.
    const text = note([["books", "Books"], ["films", "Films"]]);
    expect(save(text, shown(text))).toBe(text);
  });
});

// ── ORDER IS THE READER'S (1.0.49) ──────────────────────────────────────
//
// *"It would be good to be able to reorder categories in the editor too."* The
// directive order IS the render order — a Resources section draws its shelves
// down the page in the order its fence lists them — so a category's position
// was unreachable without removing everything after it, which the emptiness
// guard makes impossible for anything with files in it.
//
// WHAT CHANGED UNDERNEATH. A rename, an add and a removal can each be said as
// an edit to one line. A move cannot: moving one category moves every category
// it passes. So the plan stopped describing three kinds of edit to the
// directive run and started describing the RUN — `plan.order`, final labels and
// final sequence — and the other three fell out of it.
describe("the order the reader put them in", () => {
  const keys = (text: string): string[] =>
    readAttachCategories(text).map((c) => c.key);

  it("swaps two categories without touching their regions", () => {
    const text = note(
      [["books", "Books"], ["films", "Films"]],
      { books: ["- [[A Book]]"], films: ["- [[A Film]]"] }
    );
    const out = save(text, [
      { key: "films", label: "Films" },
      { key: "books", label: "Books" },
    ]);
    expect(keys(out)).toEqual(["films", "books"]);
    // THE REGIONS DO NOT MOVE. They are looked up by key and the renderer reads
    // the directives for order, so rewriting the run is the whole of a move —
    // and shuffling blocks of a reader's file for no visible gain is exactly
    // the sort of diff a sync history should not carry.
    expect(out).toContain("- [[A Book]]");
    expect(out).toContain("- [[A Film]]");
    expect(out.indexOf("<!--chronoanvil:books")).toBeLessThan(
      out.indexOf("<!--chronoanvil:films")
    );
  });

  it("says a move happened, and says one did not", () => {
    const text = note([["books", "Books"], ["films", "Films"]]);
    const rows = shown(text);
    expect(planAttachCategories(text, [rows[1], rows[0]])!.moved).toBe(true);
    expect(planAttachCategories(text, rows)!.moved).toBe(false);
    // A RENAME IS NOT A MOVE, and the two have to be separable: `moved` is what
    // tells the write there is something to do when nothing else changed.
    expect(
      planAttachCategories(text, [
        { key: "books", label: "Reading" },
        { key: "films", label: "Films" },
      ])!.moved
    ).toBe(false);
  });

  it("writes nothing when the list comes back in the order it went out", () => {
    const text = note([["books", "Books"], ["films", "Films"]]);
    expect(save(text, shown(text))).toBe(text);
  });

  it("moves and renames in the same save", () => {
    const text = note([["books", "Books"], ["films", "Films"]]);
    const out = save(text, [
      { key: "films", label: "Cinema" },
      { key: "books", label: "Books" },
    ]);
    expect(out.split("\n").filter((l) => l.startsWith("attach:"))).toEqual([
      "attach:films|Cinema",
      "attach:books|Books",
    ]);
  });

  it("puts a new category where the window has it, not on the end", () => {
    // The window pushes a new row at the bottom, so this is reachable only by
    // adding and then moving it up — which is the point: one save, both.
    const text = note([["books", "Books"]]);
    const out = save(text, [
      { key: null, label: "Papers" },
      { key: "books", label: "Books" },
    ]);
    expect(keys(out)).toEqual(["papers", "books"]);
    // Its region still goes after the fence, where regions live.
    expect(out).toContain("<!--chronoanvil:papers");
  });

  it("leaves every other line in the fence exactly where it was", () => {
    // THE RUN IS A LIST OF POSITIONS, NOT A SPAN — which is what a diary
    // entry's band forces: its `attach:` line sits between `note:` and
    // `tasks:`, and a move must not reach either of them.
    const text = [
      "```chronoanvil",
      "note:log|Notes",
      "attach:attachments|Attachments",
      "tasks:todo|Tasks",
      "attach:test|test",
      "```",
      "",
      "<!--chronoanvil:attachments",
      "-->",
      "",
      "<!--chronoanvil:test",
      "-->",
    ].join("\n");
    const out = save(text, [
      { key: "test", label: "test" },
      { key: "attachments", label: "Attachments" },
    ]).split("\n");
    expect(out.slice(0, 6)).toEqual([
      "```chronoanvil",
      "note:log|Notes",
      "attach:test|test",
      "tasks:todo|Tasks",
      "attach:attachments|Attachments",
      "```",
    ]);
  });

  it("keeps the indent the slot had", () => {
    // A fence inside a list item carries one, and a rewritten line that loses
    // it leaves the fence. (A blockquote's `> ` is not indentation and no part
    // of this module has ever read one — `^\s*attach:` does not match it.)
    const text = [
      "- A list item",
      "  ```chronoanvil",
      "  attach:books|Books",
      "  attach:films|Films",
      "  ```",
      "",
      "<!--chronoanvil:books",
      "-->",
      "",
      "<!--chronoanvil:films",
      "-->",
    ].join("\n");
    const out = save(text, [
      { key: "films", label: "Films" },
      { key: "books", label: "Books" },
    ]).split("\n");
    expect(out[2]).toBe("  attach:films|Films");
    expect(out[3]).toBe("  attach:books|Books");
  });

  it("gives a refused removal its old place back, not the bottom", () => {
    // Both refusals land here. A reader told "that one isn't empty any more"
    // should find it where they have been reading it — a category that jumped
    // to the end of the list as a side effect of a removal that did not happen
    // is a second surprise on top of the first.
    const text = note(
      [["books", "Books"], ["films", "Films"], ["papers", "Papers"]],
      { films: ["- [[A Film]]"] }
    );
    const out = save(text, [
      { key: "books", label: "Books" },
      { key: "papers", label: "Papers" },
    ]);
    expect(keys(out)).toEqual(["books", "films", "papers"]);
  });

  it("closes the gap when two of three go", () => {
    // Three slots, one category: the leftovers are deleted rather than left
    // holding the names they used to.
    const text = note([
      ["books", "Books"],
      ["films", "Films"],
      ["papers", "Papers"],
    ]);
    const out = save(text, [{ key: "papers", label: "Papers" }]);
    expect(out.split("\n").filter((l) => l.startsWith("attach:"))).toEqual([
      "attach:papers|Papers",
    ]);
    expect(out).not.toContain("<!--chronoanvil:books");
    expect(out).not.toContain("<!--chronoanvil:films");
  });

  it("is arrows in the window, and the rows are the answer", () => {
    const src = readCode("attach-categories-editor");
    expect(src).toContain('move(-1, "chevron-up", "up")');
    expect(src).toContain('move(1, "chevron-down", "down")');
    // DISABLED AT THE ENDS rather than absent — a control that vanishes on
    // some rows and not others is harder to read than a quiet one, which is
    // the rule the ✕ beside it already follows.
    expect(src).toContain("const can = to >= 0 && to < this.rows.length;");
    expect(src).toContain("btn.disabled = !can;");
    // A MOVE IS A LIST REORDER AND NOTHING ELSE. `commit` already sends the
    // rows in the order they are showing, so there is no move to record.
    expect(src).toContain("next.splice(to, 0, ...next.splice(at, 1));");
    expect(src).not.toContain("vault.modify");
  });
});


// ── THE SHAPE A CATEGORY RENDERS IN (1.0.49 §6) ────────────────────────────
//
// *"now implement format options into the category editor for different ways to
// render the documents/links/images."* The answer is a `#token` on the
// category's own line, which makes it the model's problem twice over: the read
// has to see a flag for what it is, and the run rewrite has to put back every
// flag it did not come to change.
describe("the shape a category renders in", () => {
  it("reads a format off a category line, and default off one without", () => {
    const cats = readAttachCategories(
      note([
        ["docs", "Docs"],
        ["shots", "Shots", "#gallery"],
        ["links", "Links", "#list"],
      ])
    );
    expect(cats.map((c) => attachFormatOf(c.tokens))).toEqual([
      "default",
      "gallery",
      "list",
    ]);
    // And the key is the key: the flag is not part of it, which is the whole
    // of the defect this round fixed.
    expect(cats.map((c) => c.key)).toEqual(["docs", "shots", "links"]);
  });

  it("writes a format onto the line, and takes it off again", () => {
    const text = note([["docs", "Docs"], ["shots", "Shots"]]);
    const rows = shown(text);
    rows[1].format = "gallery";
    const out = save(text, rows);
    expect(out.split("\n").filter((l) => l.startsWith("attach:"))).toEqual([
      "attach:docs|Docs",
      "attach:shots#gallery|Shots",
    ]);
    // Nothing else moved: both regions still there, the reader's prose still
    // between them and the fence.
    expect(out).toContain("<!--chronoanvil:docs");
    expect(out).toContain("<!--chronoanvil:shots");
    expect(out).toContain("Some prose the reader wrote.");

    // And back. `default` is written by DELETING the token, which is what
    // keeps a note nobody has asked about byte-identical.
    const back = shown(out);
    back[1].format = "default";
    expect(save(out, back)).toBe(text);
  });

  it("leaves every other flag on the line where it was", () => {
    // `#widget` IS THE FORM ANSWER THE SECTION EDITOR WROTE. A save in this
    // window must not be the thing that erases it — and `#thing` stands for
    // the flag a later release adds, which the grammar promises to carry.
    const text = note([["docs", "Docs", "#widget#thing"]]);
    const rows = shown(text);
    rows[0].format = "list";
    expect(
      save(text, rows)
        .split("\n")
        .find((l) => l.startsWith("attach:"))
    ).toBe("attach:docs#widget#thing#list|Docs");

    // Including through a rename and a move in the same save.
    const two = note([["docs", "Docs", "#widget"], ["shots", "Shots"]]);
    const swapped = shown(two).reverse();
    swapped[1].label = "Documents";
    swapped[1].format = "gallery";
    expect(
      save(two, swapped).split("\n").filter((l) => l.startsWith("attach:"))
    ).toEqual(["attach:shots|Shots", "attach:docs#widget#gallery|Documents"]);
  });

  it("writes nothing when the format came back the way it went out", () => {
    // `renames`' rule, for the reason `renames` has it: a reader who opens the
    // window, reads it and presses Save must not get a modified note in their
    // sync history. Both directions — a line with a token and a line without.
    const text = note([["docs", "Docs"], ["shots", "Shots", "#gallery"]]);
    expect(save(text, shown(text))).toBe(text);
  });

  it("is not a rename, a removal, an add or a move", () => {
    const text = note([["docs", "Docs"], ["shots", "Shots"]]);
    const rows = shown(text);
    rows[0].format = "list";
    const plan = planAttachCategories(text, rows);
    expect(plan?.formats.map((c) => [c.key, c.tokens])).toEqual([
      ["docs", ["list"]],
    ]);
    expect(plan?.renames).toEqual([]);
    expect(plan?.removes).toEqual([]);
    expect(plan?.adds).toEqual([]);
    expect(plan?.moved).toBe(false);
    // And it is enough on its own to make the write happen, which is the
    // early-out this list was added to.
    expect(applyAttachCategories(text, plan!)).not.toBe(text);
  });

  it("gives a new category the format its row was showing", () => {
    const text = note([["docs", "Docs"]]);
    const out = save(text, [
      ...shown(text),
      { key: null, label: "Shots", format: "gallery" },
    ]);
    expect(out.split("\n").filter((l) => l.startsWith("attach:"))).toEqual([
      "attach:docs|Docs",
      "attach:shots#gallery|Shots",
    ]);
  });

  it("knows what a category holds when its line carries a flag", () => {
    // ── THE DEFECT, MEASURED BEFORE IT WAS FIXED (1.0.49 §6) ───────────
    //
    // A diary entry whose Attachments is drawn as a widget has
    // `attach:attachments#widget|Files & Links`. The old read answered
    // `attachments#widget` for that key, so every question asked about it was
    // asked about a region nothing writes: the row reported `empty` with an
    // invoice in it, the ✕ beside it went live, and the save deleted the
    // directive line and left the region orphaned below the fence.
    const text = note([["attachments", "Files & Links", "#widget"]], {
      attachments: ["- [[Invoice.pdf]]"],
    });
    expect(categoryItemCount(text, "attachments")).toBe(1);

    // So the removal is refused, and the line keeps its flag.
    const plan = planAttachCategories(text, []);
    expect(plan?.removes).toEqual([]);
    expect(plan?.kept.map((c) => [c.key, c.items])).toEqual([
      ["attachments", 1],
    ]);
    expect(applyAttachCategories(text, plan!)).toBe(text);
  });

  it("keeps an argument tail nothing reads", () => {
    // `splitArgHead`'s third part: everything from the argument's first `:`.
    // No `attach:` line this plugin composes has one, and a hand-written line
    // may — so it is carried rather than dropped, for the reason a flag is.
    const text = note([["docs", "Docs", ":some hint"]]);
    const rows = shown(text);
    rows[0].label = "Documents";
    expect(
      save(text, rows)
        .split("\n")
        .find((l) => l.startsWith("attach:"))
    ).toBe("attach:docs:some hint|Documents");
  });

  it("offers the gallery only to a category of images", () => {
    // THE READER'S GATE: *"check if any files/links other than images are in
    // the category before gallery view can be enabled."*
    expect(offeredFormats("default", 0)).toEqual(["default", "gallery", "list"]);
    expect(offeredFormats("default", 1)).toEqual(["default", "list"]);
    // EXCEPT THE ONE IT IS ALREADY IN. A reader sets a shelf to gallery and
    // then drops a PDF on it; the shelf draws that PDF as a chip under the
    // grid, and the cycle must still be able to rest where they left it.
    expect(offeredFormats("gallery", 1)).toEqual(["default", "gallery", "list"]);
  });

  it("cycles through the formats on offer and no others", () => {
    expect(nextAttachFormat("default", 0)).toBe("gallery");
    expect(nextAttachFormat("gallery", 0)).toBe("list");
    expect(nextAttachFormat("list", 0)).toBe("default");
    // With a PDF in it the gallery is skipped, and the cycle still closes.
    expect(nextAttachFormat("default", 2)).toBe("list");
    expect(nextAttachFormat("list", 2)).toBe("default");
    // And a reader sitting on gallery with a PDF in the shelf can leave and
    // come back, which is the pair that would otherwise strand them.
    expect(nextAttachFormat("gallery", 2)).toBe("list");
    expect(offeredFormats("gallery", 2)).toContain("gallery");
  });

  it("counts what is not an image, through the same parse as the count", () => {
    const text = note([["mixed", "Mixed"]], {
      mixed: [
        "- ![[shot.png]]",
        "- [[Invoice.pdf]]",
        "- [Obsidian](https://obsidian.md)",
      ],
    });
    expect(categoryItemCount(text, "mixed")).toBe(3);
    expect(categoryNonImageCount(text, "mixed")).toBe(2);
    // An empty category has nothing that is not an image, which is what puts
    // every format on offer the moment one is typed.
    expect(categoryNonImageCount(note([["new", "New"]]), "new")).toBe(0);
  });

  it("leaves the flags alone for a format it does not know", () => {
    // The carry-through rule pointed the other way: a caller with no opinion
    // must not be the thing that erases the answer in the note.
    expect(withAttachFormat(["widget", "gallery"], "list")).toEqual([
      "widget",
      "list",
    ]);
    expect(
      withAttachFormat(["widget", "gallery"], "bogus" as never)
    ).toEqual(["widget", "gallery"]);
  });

  it("answers off one declaration, not a switch per surface", () => {
    // Five things are derived from `ATTACH_FORMATS` — the token written, the
    // token read, the zone's class, the button's icon and its two sentences —
    // and the one that would be silently wrong is a format with no way to say
    // itself. `default` is the exception on purpose: it writes nothing and
    // wears nothing.
    expect(ATTACH_FORMATS[0].value).toBe("default");
    expect(ATTACH_FORMATS[0].token).toBeNull();
    expect(ATTACH_FORMATS[0].cls).toBeNull();
    for (const f of ATTACH_FORMATS.slice(1)) {
      expect(f.token).toBeTruthy();
      expect(f.cls).toMatch(/^is-/);
      expect(attachFormatOf([f.token as string])).toBe(f.value);
    }
    for (const f of ATTACH_FORMATS) {
      expect(f.label).toBeTruthy();
      expect(f.hint).toBeTruthy();
      expect(f.icon).toBeTruthy();
    }
  });
});

describe("the window itself", () => {
  const editor = (): string => readCode("attach-categories-editor");

  it("is the shared editor frame, with the tags window's classes", () => {
    // Three windows now wear them: a list of named things in one note, where
    // adding, renaming and removing are three separate edits.
    const src = editor();
    expect(src).toContain("export class AttachCategoriesEditor extends EditorModal");
    expect(src).toContain('this.body.addClass("ca-tags-editor")');
    expect(src).toContain('this.body.addClass("ca-attach-cats-editor")');
    expect(cssRule(".ca-attach-cats-editor .ca-tags-count")).toContain("flex: 0 0 auto");
  });

  it("writes nothing until Save", () => {
    // The promise the ✕ could not make: a removal takes a region out of the
    // note, and this one happens once, from `commit`.
    const src = editor();
    expect(src).toContain("protected async commit()");
    expect(src).toMatch(/commit\(\)[\s\S]{0,200}this\.onSave\(/);
    // No vault anywhere in the window — the write is the caller's.
    expect(src).not.toContain("vault.modify");
    expect(src).not.toContain("vault.read");
  });

  it("hands back the list it is showing, not a set of edits", () => {
    // Which is what lets the plan be computed against the file at the moment of
    // the write rather than against the file as it was when the window opened.
    // EVERY FIELD OF EVERY ROW, which is what "the list it is showing" means:
    // a `commit` that rebuilt one of them from somewhere else would be handing
    // back a list the reader was not looking at. Measured — a mutant that
    // handed back `format: "default"` for every row survived until this named
    // the field (1.0.49 §6).
    expect(editor()).toMatch(
      /onSave\([\s\S]{0,200}rows\.map\(\(r\) => \(\{ key: r\.key, label: r\.label, format: r\.format \}\)\)/
    );
  });

  it("renames one row at a time, and survives closing mid-rename", () => {
    const src = editor();
    expect(src).toContain("private editing: string | null = null;");
    expect(src).toContain("private open_ = true;");
    // The rename field commits on blur and closing blurs it, so `finish` would
    // repaint a detached body on the way out.
    expect(src).toMatch(/const finish = \(\): void => \{\s*if \(!this\.open_\) return;/);
  });

  it("offers remove only on an empty category, with the reason in the row", () => {
    const src = editor();
    expect(src).toContain("const canGo = row.key == null || row.items === 0;");
    expect(src).toContain("drop.disabled = !canGo;");
    // The count is in the row rather than only in the tooltip — a disabled
    // control whose reason you have to hover for is the shape this replaces.
    expect(src).toMatch(/cls: "ca-tags-count"[\s\S]{0,200}"empty"/);
    expect(src).toMatch(/cls: "ca-tags-count"[\s\S]{0,200}"new"/);
  });

  it("refuses an emptied list where the reader can still act on it", () => {
    // The write refuses the last removal too, but by then the window has closed
    // and a Notice is all there is. `validate` keeps the list on screen and
    // names both ways out of it.
    const src = editor();
    expect(src).toMatch(/validate\(\)[\s\S]{0,400}this\.rows\.length === 0/);
    expect(src).toContain("Edit sections…");
  });

  it("says a rename moves nothing, where the reader is about to rename", () => {
    // "Does this move my files" is the question a reader is entitled to have
    // answered before they type, not afterwards.
    expect(editor()).toContain("Nothing in it moves.");
  });

  it("is opened by the section's own head and nothing else", () => {
    // One door. The widget builds no categories control of its own any more —
    // `test/ui-fixes-3-19-2.test.ts` holds the other half of that.
    expect(readSrc("attachment-widgets")).toContain("new AttachCategoriesEditor(");
    // ON THE BAR'S TITLE ROW AS OF 1.0.49 §3, through the slot a field head
    // uses too — it was a labelled pill in `frame.actions`, which at level 1 is
    // a full-width second row for one control.
    const src = readCode("widgets");
    expect(src).toContain("buildCategoriesGlyph(this, ctx, title)");
    expect(src).toContain("headTools(frame.root).appendChild(");
  });
});
