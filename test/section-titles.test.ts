// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// One name per idea, applied to the names of sections. 4.25 §1.
//
// WHY THIS FILE EXISTS
//
// `core/vocabulary.ts` holds the NOUNS a reader must see spelled one way, and
// says in its own header that it is deliberately not a place to put strings.
// Section titles fell straight through that gap: they are not nouns of the
// domain, so nothing policed them, and one section came to carry up to four
// independent display strings —
//
//   `SECTION_TITLES` (ui/widgets/index.ts)  the bar over the block
//   a catalogue's `header:` line             the heading written into the note
//   a catalogue's `label:`                   the row in the section editor
//   `widget-registry.ts`'s `label`           the row in the add-widget picker
//
// — with nothing comparing them. By 4.24 they disagreed. "Open Tasks" and
// "Open tasks" were both on screen, on adjacent pages, in one session; the
// journals catalogue tokened its open-tasks section with the CHARTS glyph and
// wrote that glyph into the note; and the search page shipped three Title Case
// headings over three sentence-case labels for the same three sections.
//
// WHAT IS ASSERTED, AND WHAT IS DELIBERATELY NOT
//
// Casing is asserted because the majority of both populations already agreed
// and the minority was drift, not a decision. What is NOT asserted is that the
// four tables hold equal strings: `widget-registry.ts:112` argues at length
// that its labels answer a different question from `SECTION_TITLES` ("⏳ Open
// tasks" is a heading, "Open tasks" is an item in a list of things you could
// add), and `test/widget-registry.test.ts` already fixes how far they may
// agree. Merging them here would undo that on the way past.

import { describe, expect, it } from "vitest";
import { readSrc } from "./sources";

// Every catalogue that writes a `header:` line into a note, plus the two that
// only carry labels. Named rather than globbed: a new catalogue should have to
// be added here, which is the moment to notice it is writing titles at all.
const CATALOGUES = [
  "diary-sections",
  "diary-dashboard-sections",
  "search-sections",
  "home-sections",
  "journal-sections",
  "journals-dashboard-sections",
];

// Strip a leading emoji/glyph and any whitespace after it.
const words = (title: string): string =>
  title.replace(/^[^\p{L}\p{N}]+/u, "").trim();

// Sentence case, for a title of more than one word: no word after the first
// starts with a capital unless it is one a reader would capitalise anywhere
// (a proper noun, or an acronym). None of the shipped titles has one, so the
// allowance is empty and stated rather than assumed.
const PROPER: readonly string[] = [];
const isSentenceCase = (title: string): boolean => {
  const parts = words(title).split(/\s+/).filter(Boolean);
  return parts
    .slice(1)
    .every((w) => PROPER.includes(w) || !/^[A-Z][a-z]/.test(w));
};

describe("sentence case is the one casing", () => {
  it("recognises the drift it was written for", () => {
    // THE HELPER IS TESTED BEFORE IT IS TRUSTED. A predicate that returned
    // `true` for everything would make every assertion below pass silently,
    // which is the failure mode RESUME §6 describes as a test that has never
    // failed. These are the exact strings 4.25 replaced.
    expect(isSentenceCase("⏳ Open Tasks")).toBe(false);
    expect(isSentenceCase("🕘 On This Day")).toBe(false);
    expect(isSentenceCase("📜 All Entries")).toBe(false);
    expect(isSentenceCase("🔎 Search the Diary")).toBe(false);
    expect(isSentenceCase("⏳ Open tasks")).toBe(true);
    expect(isSentenceCase("🕘 On this day")).toBe(true);
    // A single word is trivially in sentence case either way.
    expect(isSentenceCase("📚 Journals")).toBe(true);
  });

  it("holds for every `header:` line a catalogue writes into a note", () => {
    const bad: string[] = [];
    for (const name of CATALOGUES) {
      for (const m of readSrc(name).matchAll(/"header:([^"$]+)"/g)) {
        if (!isSentenceCase(m[1])) bad.push(`${name}: ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("holds for every section-editor label a catalogue offers", () => {
    // Scoped to `label:` on a catalogue entry. The question labels inside
    // `questions:` are noun phrases written to sit inside a sentence — "a
    // journal to pull from" — and section-editor.ts:822 takes its field name
    // off them deliberately, so they are lowercase by design and would fail a
    // rule meant for titles.
    const bad: string[] = [];
    for (const name of CATALOGUES) {
      for (const m of readSrc(name).matchAll(/^ {4}label: "([^"]+)"/gm)) {
        if (!isSentenceCase(m[1])) bad.push(`${name}: ${m[1]}`);
      }
    }
    // NO EXEMPTIONS, AS OF 4.26. 4.25 exempted the four labels naming the
    // Trends section, because its heading is the anchor `locateSection` matched
    // exactly and could not be renamed — and a label disagreeing with the
    // heading above it would have been worse than the casing. 4.26 taught the
    // locator a list of historical spellings, so the heading moved and the
    // labels moved with it. The filter that carved out the exception is gone
    // rather than left passing over nothing: an exemption nothing uses reads to
    // the next person as a rule with a hole in it.
    expect(bad).toEqual([]);
  });

  it("holds for the bar `frame: section` draws over a block", () => {
    const widgets = readSrc("widgets");
    const table =
      /const SECTION_TITLES: Record<string, string> = \{([\s\S]*?)\n\};/.exec(
        widgets
      )?.[1] ?? "";
    expect(table.length).toBeGreaterThan(0);
    const bad: string[] = [];
    for (const m of table.matchAll(/:\s*"([^"]+)",/g)) {
      if (!isSentenceCase(m[1])) bad.push(m[1]);
    }
    expect(bad).toEqual([]);
  });
});

describe("one section, one glyph", () => {
  it("tokens open tasks with the hourglass everywhere it is named", () => {
    // 4.25 §1: `journal-sections.ts` used 📊 — the CHARTS glyph — for both the
    // section-editor icon and the `header:` line it wrote into the note, so a
    // Subject Index shipped a heading no other page's open-tasks section wore.
    // Asserted across every file that names the section rather than at the one
    // that was wrong, because the next such slip will be somewhere else.
    const seen = new Set<string>();
    for (const name of [...CATALOGUES, "widget-registry"]) {
      const t = readSrc(name);
      for (const m of t.matchAll(/"header:(\S+) Open tasks"/g)) seen.add(m[1]);
      // The catalogue row's own token, read off the entry that labels it.
      for (const m of t.matchAll(
        /(?:icon|glyph): "([^"]+)",\n(?:\s*\/\/[^\n]*\n)*\s*label: "Open tasks"/g
      ))
        seen.add(m[1]);
    }
    expect(seen.size, `glyphs in use: ${[...seen].join(" ")}`).toBe(1);
    expect([...seen][0]).toBe("⏳");
  });
});
