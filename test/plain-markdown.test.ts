// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";

import { plainSections, toPlainMarkdown } from "../src/core/plain-markdown";
import { composeEntryTemplate, entrySectionModel } from "../src/diary/entry-sections";
import { TRACKER_CLASSES } from "../src/trackers/trackers";
import { fieldsForClass } from "../src/trackers/fields";
import { journalTemplateFiles } from "../src/journals/custom-journal";
import { STUDY_JOURNAL } from "../src/journals/journal";
import { sectionContext } from "../src/journals/journal-sections";
import { journalSectionModel } from "../src/journals/journal-plan";
import { readSrc } from "./sources";

// Put a sentinel in every region a composed template ships, so a section that
// comes back empty is a BINDING that failed rather than a page nobody wrote in.
// The sentinel names its own key, which is what lets an assertion say which
// region the text under a heading actually came from.
function fill(text: string): string {
  return text.replace(
    /<!--chronoanvil:([A-Za-z0-9_-]+)\n-->/g,
    (_m, key: string) => `<!--chronoanvil:${key}\nwriting-in-${key}\n-->`
  );
}

const daily = entrySectionModel({ grain: "daily" });

describe("every section a page can hold comes out with its name on it", () => {
  // THE COVERAGE ASSERTION, and the reason the pure function exists at all.
  //
  // A section whose export is blank is a section whose label or region binding
  // is wrong, and this is the sweep that says so across all five grains. It
  // reads what a grain SHIPS out of `fieldsForClass` rather than naming ids
  // here, so a field added to the registry in a later release is swept the day
  // it is added and nobody has to remember this file.
  for (const grain of TRACKER_CLASSES) {
    it(`exports every field a ${grain} entry ships, under its registered label`, () => {
      const model = entrySectionModel({ grain });
      const sections = plainSections(fill(composeEntryTemplate(grain, [])), model);

      const fields = fieldsForClass(grain);
      // Exhaustive and ordered: template order is load-bearing for the registry
      // (`fields.ts` says so twice) and an export that reordered a reader's
      // page would be a different document.
      expect(sections.map((s) => s.id)).toEqual(fields.map((f) => f.id));

      for (const field of fields) {
        const got = sections.find((s) => s.id === field.id);
        // Named individually so a failure says WHICH field lost its binding.
        expect(got, `${grain}/${field.id} produced no section`).toBeDefined();
        expect(got?.label, `${grain}/${field.id} label`).toBe(field.label);
        expect(got?.body, `${grain}/${field.id} body`).toContain(
          `writing-in-${field.id}`
        );
      }
    });
  }

  // The other half of the request's "all five grains and every journal kind".
  // Study is the shipped journal, and its five templates cover both surfaces,
  // a paged kind and an unpaged one.
  for (const file of journalTemplateFiles(STUDY_JOURNAL)) {
    it(`exports every region-backed section of ${file.name}`, () => {
      const kind = STUDY_JOURNAL.kinds.find((k) => file.name.includes(k.id));
      const ctx = file.name.includes("index")
        ? sectionContext(STUDY_JOURNAL, {
            depth: file.name.startsWith("subject") ? 0 : 1,
          })
        : file.name.includes("page")
          ? sectionContext(STUDY_JOURNAL, { page: kind ?? STUDY_JOURNAL.kinds[0] })
          : sectionContext(STUDY_JOURNAL, { kind: kind ?? STUDY_JOURNAL.kinds[0] });

      const sections = plainSections(fill(file.content), journalSectionModel(ctx));
      // The regions the template actually ships, read off the file rather than
      // listed here — the same reason the grain sweep reads the registry.
      const keys = [...file.content.matchAll(/<!--chronoanvil:([A-Za-z0-9_-]+)/g)].map(
        (m) => m[1]
      );
      expect(sections.map((s) => s.id)).toEqual(keys);
      for (const s of sections) {
        expect(s.body, `${file.name}/${s.id} produced nothing`).not.toBe("");
        expect(s.label, `${file.name}/${s.id} has no name`).not.toBe("");
      }
    });
  }
});

describe("what is left out", () => {
  // THE EXCLUSION HALF, and the one that matters — 4.29's roadmap survived
  // every presence test and died to a membership one. Asserted with `toEqual`
  // over the whole list: an implementation that appended a placeholder for a
  // derived widget passes any `toContain`, and a placeholder is exactly the
  // design this release rejected.
  it("gives a derived widget no section at all, however many are on the page", () => {
    const text = [
      "```chronoanvil",
      "links:home,today",
      "entry-header",
      "diary",
      "month-summary",
      "timeline",
      "on-this-day",
      "tasks-table",
      "tag-index",
      "activity-chart",
      "period-recap:month",
      "events",
      "journals",
      "bridge-notes:lesson",
      "```",
      "",
      "```chronoanvil",
      "note:focus|Today's focus",
      "```",
      "",
      "<!--chronoanvil:focus",
      "the only thing anybody wrote",
      "-->",
    ].join("\n");

    expect(plainSections(text, daily).map((s) => s.id)).toEqual(["focus"]);
    const out = toPlainMarkdown(text, daily);
    expect(out).toContain("the only thing anybody wrote");
    for (const derived of [
      "diary",
      "month-summary",
      "timeline",
      "on-this-day",
      "tasks-table",
      "tag-index",
      "activity-chart",
      "period-recap",
      "events",
      "journals",
      "bridge-notes",
      "entry-header",
      "links",
    ]) {
      expect(out, `${derived} leaked into the export`).not.toContain(derived);
    }
  });

  it("reports a section whose region is empty, and keeps it out of the markdown", () => {
    const text = [
      "```chronoanvil",
      "note:focus|Today's focus",
      "note:log|Notes",
      "```",
      "",
      "<!--chronoanvil:focus",
      "-->",
      "",
      "<!--chronoanvil:log",
      "written",
      "-->",
    ].join("\n");

    // Both are reported — that is what makes the sweep above able to tell a
    // missing binding from an unwritten page...
    expect(plainSections(text, daily).map((s) => s.id)).toEqual(["focus", "log"]);
    // ...and only the one with writing in it becomes a heading.
    expect(toPlainMarkdown(text, daily)).not.toContain("Today's focus");
    expect(toPlainMarkdown(text, daily)).toContain("## Notes");
  });

  it("drops the plugin's own spacer and band rule, and keeps a rule a reader typed", () => {
    const composed = fill(composeEntryTemplate("daily", []));
    const out = toPlainMarkdown(composed, daily);
    expect(out).not.toContain("chronoanvil:spacer");
    // The band rule sits alone in its own run and is ChronoAnvil's separator.
    //
    // ASSERTED OVER THE BODY, not the whole file: frontmatter is fenced by two
    // `---` lines of its own, so a match over the file would find those and
    // pass whatever the body did. Written the wrong way round first, and it
    // failed on the frontmatter it was never about.
    const body = out.split(/^---$/m).slice(3).join("---");
    expect(body).not.toMatch(/^---$/m);

    // A rule a reader typed is in a run with their prose, so it survives — the
    // rule is what the run CONTAINS, never where it sits.
    const own = ["before", "", "---", "", "after"].join("\n");
    expect(toPlainMarkdown(own, daily)).toContain("---");
  });
});

describe("the writers it borrows, and the one it does not", () => {
  const wrap = (directive: string, key: string, body: string): string =>
    ["```chronoanvil", directive, "```", "", `<!--chronoanvil:${key}`, body, "-->"].join("\n");

  it("turns ChronoAnvil's checkbox into GFM and keeps the inline fields", () => {
    const text = wrap(
      "tasks:todo|Tasks",
      "todo",
      ["- ( ) buy milk [due:: 2026-08-20]", "- (x) post the letter"].join("\n")
    );
    const body = plainSections(text, daily)[0].body;
    expect(body).toBe(
      ["- [ ] buy milk [due:: 2026-08-20]", "- [x] post the letter"].join("\n")
    );
  });

  // FINDING 5, and the mutation this file exists to catch. `parseTasks` drops
  // a line it does not recognise — right for a widget that cannot draw a
  // checkbox for one, wrong for an export that was asked to carry the note.
  it("keeps prose a reader typed into a task region", () => {
    const text = wrap(
      "tasks:todo|Tasks",
      "todo",
      ["Before I forget:", "", "- ( ) buy milk", "and that is the lot"].join("\n")
    );
    const body = plainSections(text, daily)[0].body;
    expect(body).toContain("Before I forget:");
    expect(body).toContain("and that is the lot");
    expect(body).toContain("- [ ] buy milk");
  });

  it("writes a list field as a markdown list", () => {
    const text = wrap("list:highlights|Highlights", "highlights", "one\ntwo");
    expect(plainSections(text, daily)[0].body).toBe("- one\n- two");
  });

  it("writes recall cards as a question and its answer", () => {
    const text = wrap(
      "recall:recall|Recall",
      "recall",
      ["what is a bridge? :: a live view of other notes", "half-written card"].join("\n")
    );
    const body = plainSections(text, daily)[0].body;
    expect(body).toContain("**what is a bridge?**");
    expect(body).toContain("a live view of other notes");
    // A card with no answer yet is still a card — `parseRecall`'s own rule.
    expect(body).toContain("**half-written card**");
  });

  it("emits an attachments region as the markdown it already is", () => {
    const region = ["- ![[shot.png|A caption]]", "- [the docs](https://example.com)"].join(
      "\n"
    );
    const text = wrap("attach:attachments|Attachments", "attachments", region);
    expect(plainSections(text, daily)[0].body).toBe(region);
  });

  it("writes the capture log as a list, crossed-off ones checked", () => {
    const text = wrap(
      "note:capture#collapse|Captured",
      "capture",
      ["09:15 — a thought [done:: 2026-08-15]", "", "14:32 — another one"].join("\n")
    );
    const body = plainSections(text, daily)[0].body;
    expect(body).toContain("- [x] 09:15 — a thought");
    expect(body).toContain("- 14:32 — another one");
  });

  it("leaves a plain note field exactly as it was written", () => {
    const text = wrap("note:log|Notes", "log", "A paragraph.\n\nAnd a second one.");
    expect(plainSections(text, daily)[0].body).toBe("A paragraph.\n\nAnd a second one.");
  });
});

describe("what the heading says", () => {
  it("takes the label a reader renamed, not the catalogue's", () => {
    const text = [
      "```chronoanvil",
      "note:focus|What I am doing today",
      "```",
      "",
      "<!--chronoanvil:focus",
      "shipping it",
      "-->",
    ].join("\n");
    expect(plainSections(text, daily)[0].label).toBe("What I am doing today");
    expect(toPlainMarkdown(text, daily)).toContain("## What I am doing today");
  });

  it("falls back to the model when a directive carries no label of its own", () => {
    const text = ["```chronoanvil", "note:log", "```", "", "<!--chronoanvil:log", "x", "-->"].join(
      "\n"
    );
    // `log` is the entry catalogue's "Notes".
    expect(plainSections(text, daily)[0].label).toBe("Notes");
  });

  it("lets a bar over one field be that field's name", () => {
    const text = [
      "```chronoanvil",
      "header:🧭 Learning Path",
      "path:path",
      "```",
      "",
      "<!--chronoanvil:path",
      "step one",
      "-->",
    ].join("\n");
    const out = toPlainMarkdown(text, daily);
    expect(out).toContain("## 🧭 Learning Path");
    // The key must not leak onto the page beneath its own bar.
    expect(out).not.toContain("### path");
  });

  it("makes a bar over several fields the name of the group", () => {
    const text = [
      "```chronoanvil",
      "header:📚 Resources",
      "attach:res-docs|Docs",
      "attach:res-tutorials|Tutorials",
      "```",
      "",
      "<!--chronoanvil:res-docs",
      "- [[a]]",
      "-->",
      "",
      "<!--chronoanvil:res-tutorials",
      "- [[b]]",
      "-->",
    ].join("\n");
    const out = toPlainMarkdown(text, daily);
    expect(out).toContain("## 📚 Resources");
    expect(out).toContain("### Docs");
    expect(out).toContain("### Tutorials");
  });
});

describe("the page's own writing, and its properties", () => {
  it("keeps frontmatter byte for byte, events and alias included", () => {
    const front = [
      "---",
      'journal-date: "2026-08-15"',
      "title: The day it worked",
      "events:",
      "  - Anniversary",
      "mood: 4",
      "---",
    ].join("\n");
    const text = [front, "", "```chronoanvil", "note:log|Notes", "```", "", "<!--chronoanvil:log", "x", "-->"].join(
      "\n"
    );
    const out = toPlainMarkdown(text, daily);
    expect(out.startsWith(`${front}\n`)).toBe(true);
    // Not re-rendered into the body: the reading is in the properties block and
    // a second copy is the failure this decision exists to avoid.
    expect(out).not.toContain("**mood:**");
  });

  it("passes a prose skeleton's headings through untouched", () => {
    const text = [
      "```chronoanvil",
      "journal-header",
      "```",
      "",
      "## Overview",
      "",
      "What is this lesson about?",
      "",
      "```chronoanvil",
      "tasks:tasks|Tasks",
      "```",
      "",
      "<!--chronoanvil:tasks",
      "- ( ) revise",
      "-->",
    ].join("\n");
    const out = toPlainMarkdown(text, daily);
    expect(out).toContain("## Overview");
    expect(out).toContain("What is this lesson about?");
    expect(out).toContain("- [ ] revise");
  });

  it("never leaves a region marker in the output", () => {
    const out = toPlainMarkdown(fill(composeEntryTemplate("daily", [])), daily);
    expect(out).not.toContain("<!--chronoanvil:");
    expect(out).not.toContain("```");
  });
});

describe("the command does not re-spell the decision", () => {
  // The 4.0.2 rule: where the suite has no DOM, scope the match to the body and
  // anchor on what the code DOES. These pin the seam rather than the wording.
  it("copies what the pure module returns, and asks the registry nothing itself", () => {
    const src = readSrc("section-insert");
    expect(src).toContain("toPlainMarkdown(");
    expect(src).toContain("navigator.clipboard.writeText");
    // The exclusion rule lives in one place; a renderer re-deciding it is how
    // the two would come to disagree about what a page contains.
    expect(src).not.toContain("NOT_PAGE_WIDGETS");
  });

  it("registers the command on the notes group, gated on there being a note", () => {
    const src = readSrc("actions");
    expect(src).toContain("note-copy-plain-markdown");
    expect(src).toContain("copyPlainMarkdownHere");
  });
});
