// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";
import { STUDY_JOURNAL } from "../src/journals/journal";
import { composeTemplate, journalTemplateFiles } from "../src/journals/custom-journal";
import {
  SKELETON_KEY,
  bracketClose,
  bracketOpen,
  bracketSpanIn,
  findSection,
  sectionContext,
  sectionOverrides,
  sectionRemovable,
  skeletonTitles,
} from "../src/journals/journal-sections";
import { describeAnswers } from "../src/core/section-model";
import {
  applySections,
  journalSectionModel,
  planSections,
  sectionsPresent,
} from "../src/journals/journal-plan";
import { wantFromJournalNote } from "../src/journals/journal-template";
import { toPlainMarkdown } from "../src/core/plain-markdown";
import { readNoteRegion } from "../src/core/notestore";
import { readSrc } from "./sources";

// ── THE PROSE SKELETON, AND WHY IT CAN BE TAKEN OUT AGAIN (5.6) ──────────
//
// Until this release the skeleton was the one section a reader could not
// remove, and the reason was honest: it emits `## ` markdown, and markdown the
// plugin wrote is indistinguishable from markdown the reader wrote. The
// catalogue said so at the block, `sectionRemovable` derived a refusal from it,
// the planner reported a `keep`, and the row's subtitle told the reader to go
// and delete their own headings by hand.
//
// What changed is not the rule. It is that the headings now sit between two
// HTML comments, so the sentence "the plugin cannot tell them apart" stopped
// being true — and every one of those four places started answering differently
// without being told to. That is the property this file is mostly about: the
// derivation was not amended, exempted or flagged around.
//
// The second subject here is what removal does to a reader's writing, which is
// the part that could actually cost somebody something. A region is kept
// wholesale because a region is a container; a skeleton's prose is under the
// headings rather than in anything, so the promise has to be made one heading
// at a time.

const lessonCtx = sectionContext(STUDY_JOURNAL, {
  kind: STUDY_JOURNAL.kinds.find((k) => k.id === "lesson")!,
});
const indexCtx = sectionContext(STUDY_JOURNAL, { depth: 1 });
const lesson = (): string =>
  journalTemplateFiles(STUDY_JOURNAL).find((f) => f.name === "lesson.md")!
    .content;

// The same note with its markers taken out — every Lesson in every vault on the
// day this ships.
// ── A LESSON WITH SOMETHING UNDER ITS SKELETON ──────────────────────────
//
// Every Lesson written before 5.20 is this note: the headings, and a recall
// deck beneath them. The catalogue cannot compose it any more — `headings` is
// its LAST entry, so nothing composed sits under the reader's writing — which
// is why this is built by moving the span rather than by asking for an order.
// A note on disk is not obliged to match what the composer would write today,
// and the two tests below are about exactly the notes that do not.
const MID_ORDER = ["banner", "trackers", "pages", "headings", "recall"];
const midSkeleton = (): string => {
  const text = composeTemplate(
    lessonCtx,
    MID_ORDER,
    STUDY_JOURNAL.layout?.["kind:lesson"]
  );
  const open = bracketOpen(SKELETON_KEY);
  const close = bracketClose(SKELETON_KEY);
  const a = text.indexOf(open);
  const b = text.indexOf(close) + close.length;
  const skeleton = text.slice(a, b);
  const head = text.slice(0, a);
  const tail = text.slice(b);
  // The top of the fence that holds the deck, found through its directive so
  // the fixture does not depend on the bar's wording.
  const cut = head.lastIndexOf("```chronoanvil", head.indexOf("recall:recall"));
  return `${head.slice(0, cut)}${skeleton}\n\n${head.slice(cut).trimEnd()}${tail}`;
};

// The same note with its markers taken out — every Lesson in every vault on the
// day this ships.
const unmarked = (text: string): string =>
  text
    .split("\n")
    .filter(
      (l) =>
        l.trim() !== bracketOpen(SKELETON_KEY) &&
        l.trim() !== bracketClose(SKELETON_KEY)
    )
    .join("\n");

describe("the marker is not a region, under any of the three parsers", () => {
  it("carries no colon, which is what the region grammar keys on", () => {
    // THE ONE PROPERTY THE WHOLE SPELLING EXISTS FOR. `<!--chronoanvil:key` is
    // the region form and three separate parsers key off it — notestore.ts's
    // `OPEN_PREFIX`, `regionsIn` in journal-plan.ts, `looseLines` in
    // reload-loss.ts. Each of them happens to decline the colon spelling of this
    // marker for its own incidental reason, which is three accidents to stay
    // lucky about. A hyphen is not an accident.
    expect(bracketOpen(SKELETON_KEY)).toBe("<!--chronoanvil-skeleton-->");
    expect(bracketClose(SKELETON_KEY)).toBe("<!--/chronoanvil-skeleton-->");
    for (const m of [bracketOpen(SKELETON_KEY), bracketClose(SKELETON_KEY)]) {
      expect(m).not.toContain("chronoanvil:");
    }
  });

  it("reads back as no region at all", () => {
    // Asked of the reader rather than of the regex, because the failure this
    // guards against is a widget quietly resolving its value to a heading.
    const text = lesson();
    for (const key of ["skeleton", "/chronoanvil-skeleton", "recall"]) {
      const value = readNoteRegion(text, key);
      expect(value, key).not.toContain("## Overview");
    }
  });

  it("is spelled in exactly one place", () => {
    // Three files read this marker — the catalogue writes it, the planner cuts
    // on it, the layout save scopes to it — and a marker with three spellings is
    // a marker with two bugs waiting.
    const src = readSrc("journal-sections");
    expect(src.match(/<!--\$\{/g) ?? []).toHaveLength(0);
    expect(src).toContain("`<!--chronoanvil-${key}-->`");
    expect(src).toContain("`<!--/chronoanvil-${key}-->`");
    for (const name of ["journal-plan", "journal-template"]) {
      expect(readSrc(name), name).not.toContain("<!--chronoanvil-");
    }
  });
});

describe("what a composed template carries", () => {
  it("brackets the skeleton on a leaf and writes none on an index", () => {
    const lines = lesson().split("\n");
    const span = bracketSpanIn(lines, SKELETON_KEY)!;
    expect(span).not.toBeNull();
    // Every heading the catalogue wrote is inside it, and the frontmatter and
    // the fences are outside it.
    const inner = lines.slice(span.open + 1, span.close).join("\n");
    expect(inner).toContain("## Overview");
    expect(inner).toContain("## Next");
    expect(inner).not.toContain("```");

    const topic = journalTemplateFiles(STUDY_JOURNAL).find(
      (f) => f.name === "topic-index.md"
    )!.content;
    expect(bracketSpanIn(topic.split("\n"), SKELETON_KEY)).toBeNull();
  });

  it("keeps each marker in a markdown block of its own", () => {
    // A comment on the line directly above a `## ` is one block to anything that
    // splits on blank lines, and the header-bar fold is closed by "any markdown
    // heading" measured over blocks. Abutting them would carry the Lesson's
    // `📄 Pages` fold straight past `## Overview` and into the prose. See the
    // fold-scope test in pure-logic, which counts what this costs.
    const lines = lesson().split("\n");
    const span = bracketSpanIn(lines, SKELETON_KEY)!;
    expect(lines[span.open + 1].trim()).toBe("");
    expect(lines[span.close - 1].trim()).toBe("");
  });
});

describe("removability is derived, not granted", () => {
  it("allows the skeleton without the derivation being told it exists", () => {
    const headings = findSection("headings")!;
    expect(headings.required).toBeFalsy();
    expect(
      sectionRemovable(headings, lessonCtx, sectionOverrides(lessonCtx, "headings"))
    ).toBe(true);

    // THE NEGATIVE HALF, AND IT IS THE ONE THAT MATTERS. `sectionRemovable` is
    // four lines long and names no section; a patch that reached the same
    // outcome by naming this one would be the claim-without-evidence the
    // derivation was written to make unrepresentable.
    const src = readSrc("journal-sections");
    const body = src.slice(src.indexOf("export function sectionRemovable"));
    const fn = body.slice(0, body.indexOf("\n}"));
    expect(fn).not.toContain("headings");
    expect(fn).not.toContain("bracketed");
    expect(fn).toContain('b.kind === "markdown"');
  });

  it("still refuses the banner, which really is unprovable markdown", () => {
    expect(
      sectionRemovable(findSection("banner")!, indexCtx, sectionOverrides(indexCtx, "banner"))
    ).toBe(false);
  });
});

describe("removing it keeps what was written under it", () => {
  const withWriting = (): string =>
    lesson().replace("- [[]] — ", "- [[Ohm's law]] — the one I keep forgetting");
  const want = (text: string): string[] =>
    sectionsPresent(text, lessonCtx).filter((id) => id !== "headings");

  it("drops an empty heading and keeps one with a line under it", () => {
    const note = withWriting();
    const op = planSections(note, lessonCtx, want(note)).find(
      (o) => o.sectionId === "headings"
    )!;
    expect(op.kind).toBe("remove");
    expect(op.keepsContent?.map((k) => k.key)).toContain("Connected Ideas");

    const after = applySections(note, lessonCtx, want(note))!;
    expect(after).toContain("## Connected Ideas");
    expect(after).toContain("the one I keep forgetting");
  });

  it("takes the whole skeleton when nothing has been written in it", () => {
    // The common case: untick it on a note you have not touched yet, and
    // nothing at all is left behind — no headings, no markers, no gap.
    const bare = lesson()
      .replace("What is this lesson about, and why does it matter?", "")
      .replace("- **Definition:** \n- **Example:** ", "")
      .replace("- [[]] — ", "")
      .replace(/^- \[\[\]\]$/m, "")
      .replace(/^- $/gm, "");
    const op = planSections(bare, lessonCtx, want(bare)).find(
      (o) => o.sectionId === "headings"
    )!;
    expect(op.kind).toBe("remove");
    expect(op.keepsContent).toBeUndefined();

    const after = applySections(bare, lessonCtx, want(bare))!;
    expect(after).not.toContain("## Overview");
    expect(after).not.toContain("## Key Concepts");
    expect(after).not.toContain("chronoanvil-skeleton");
    expect(after).not.toMatch(/\n\n\n/);
  });

  it("leaves one blank line where the whole span was, not none", () => {
    // THE ONE WAY THIS SECTION IS UNLIKE EVERY OTHER REMOVABLE ONE. A fence
    // section is its own segment with the blank separators as filler runs
    // beside it, so the region path drops the run and steps over the next
    // blank. A skeleton is a RAW segment, and the separators on both sides are
    // its own lines — so dropping the run wholesale would weld the block above
    // straight onto the block below.
    //
    // WHICH NEEDS A BLOCK BELOW, AND A SHIPPED LESSON NO LONGER HAS ONE (5.20).
    // The skeleton is the LAST section in the catalogue now — nothing composed
    // may sit under the reader's writing — so on a fresh note there is nothing
    // for a dropped run to weld onto and this test would have passed vacuously.
    // A reader can still put it mid-note, which is what `midSkeleton` builds and
    // what the permutation test below is about, so the case is reached the way
    // a reader reaches it.
    const bare = midSkeleton()
      .replace("What is this lesson about, and why does it matter?", "")
      .replace("- **Definition:** \n- **Example:** ", "")
      .replace("- [[]] — ", "")
      .replace(/^- \[\[\]\]$/m, "")
      .replace(/^- $/gm, "");
    const after = applySections(bare, lessonCtx, want(bare))!;
    expect(after).toContain("pages-table\n```\n\n```chronoanvil");
    expect(after).not.toContain("pages-table\n```\n```chronoanvil");
    expect(after).not.toMatch(/\n\n\n/);

    // And putting it back gives it a blank line on both sides, so removing and
    // re-adding is not a way to reformat somebody's note.
    //
    // IT COMES BACK AT THE BOTTOM, NOT WHERE IT WAS (5.20), and that is the
    // catalogue's answer rather than a loss: an arrival is ranked by
    // `sectionsFor`, `headings` is the last entry in it, and the whole reason it
    // is the last entry is that nothing composed may sit under the reader's
    // writing. A reader who had moved it up can move it up again; a reader who
    // never did gets the arrangement this release ships.
    const back = applySections(after, lessonCtx, sectionsPresent(bare, lessonCtx))!;
    expect(back).toContain("-->\n\n<!--chronoanvil-skeleton-->");
    expect(back).toContain("<!--/chronoanvil-skeleton-->\n\n%% chronoanvil-graph %%");
    expect(back).not.toMatch(/\n\n\n/);
    // Nothing composed below it, which is the property the move was made for.
    expect(back.indexOf("```chronoanvil")).toBeLessThan(
      back.indexOf("<!--chronoanvil-skeleton-->")
    );
  });

  it("never leaves a marker behind, whatever survives", () => {
    // A bracket around nothing is a note carrying an invisible claim about a
    // section it no longer has — and re-adding the skeleton later would then
    // compose a second pair inside the first.
    const note = withWriting();
    const after = applySections(note, lessonCtx, want(note))!;
    expect(after).not.toContain("chronoanvil-skeleton");
    expect(bracketSpanIn(after.split("\n"), SKELETON_KEY)).toBeNull();
  });

  it("does not judge which headings are the catalogue's", () => {
    // EMPTINESS IS A FACT ABOUT THE FILE; AUTHORSHIP IS A GUESS. A reader who
    // retitles `## Overview` to `## Why this matters` and writes under it keeps
    // both, even though no layout has ever mentioned that heading — and an
    // untouched `## Overview` goes, even though every layout does.
    const note = lesson()
      .replace("## Overview", "## Why this matters")
      .replace("## Key Concepts", "## Key Concepts")
      .replace("- **Definition:** \n- **Example:** ", "");
    const after = applySections(note, lessonCtx, want(note))!;
    expect(after).toContain("## Why this matters");
    expect(after).not.toContain("## Key Concepts");
  });
});

describe("a skeleton written before the markers existed", () => {
  it("is kept, and the plan names the door", () => {
    const bare = unmarked(lesson());
    expect(sectionsPresent(bare, lessonCtx)).toContain("headings");
    const op = planSections(
      bare,
      lessonCtx,
      sectionsPresent(bare, lessonCtx).filter((id) => id !== "headings")
    ).find((o) => o.sectionId === "headings")!;
    expect(op.kind).toBe("keep");
    expect(op.detail).toContain("Reload this page");
  });

  it("is the case that keeps `removable` and `refusal` two fields", () => {
    // `SectionView.removable` is documented as "ignoring what is written in
    // it"; `refusal` is the one that reads the page. Before this release no
    // journal section could tell them apart — every refusal was a property of
    // the catalogue. This one is a property of the file.
    const bare = unmarked(lesson());
    const model = journalSectionModel(lessonCtx);
    const row = model.sections(bare).find((s) => s.id === "headings")!;
    expect(row.removable).toBe(true);
    expect(model.refusal("headings", bare)).toContain("Reload this page");
    // And the same row over a note that has the markers is not refused at all.
    expect(model.refusal("headings", lesson())).toBeNull();
  });

  it("is left byte-identical when a removal is asked for anyway", () => {
    const bare = unmarked(lesson());
    const after = applySections(
      bare,
      lessonCtx,
      sectionsPresent(bare, lessonCtx).filter((id) => id !== "headings")
    );
    if (after !== null) expect(after).toContain("## Overview");
  });
});

describe("saving a page as a layout", () => {
  it("carries the headings inside the bracket and no others", () => {
    // THE AUTHORING HALF. Renaming a heading in the note and saving the page as
    // the layout is how a reader has made their own skeleton since 4.33 — and
    // until the bracket existed, a `## Scratch` typed at the bottom of one
    // Lesson was carried into every Lesson afterwards, because nothing on the
    // page said where the skeleton stopped.
    const note = lesson().replace("## Overview", "## Why this matters") +
      "\n\n## Scratch\n\nnotes to self\n";
    const { options } = wantFromJournalNote(note, lessonCtx);
    const titles = (options["headings"]?.headings ?? []).map((h) => h.title);
    expect(titles).toContain("Why this matters");
    expect(titles).not.toContain("Scratch");
  });

  it("still reads the whole page when there is no bracket", () => {
    const note = unmarked(lesson());
    const { options } = wantFromJournalNote(note, lessonCtx);
    const titles = (options["headings"]?.headings ?? []).map((h) => h.title);
    expect(titles).toContain("Overview");
  });
});

describe("the markers are markup, and leave with it", () => {
  it("survives an export as plain markdown with the headings intact", () => {
    // `plain-markdown.ts`'s rule is LINKS AND VALUES, NOT MARKUP. A region's
    // markers take their contents with them because the contents are a field's
    // value; a bracket's markers are around the reader's own document, so only
    // the two lines go.
    const out = toPlainMarkdown(lesson(), journalSectionModel(lessonCtx));
    expect(out).not.toContain("chronoanvil-skeleton");
    expect(out).toContain("## Overview");
  });
});

describe("the row says how to author one", () => {
  it("names the gesture that already works", () => {
    // The blurb is the row's subtitle and the add-list's description, and it is
    // the only documentation this feature has: the read-back has existed since
    // 4.33 and nothing on screen has ever mentioned it.
    const headings = findSection("headings")!;
    expect(headings.blurb).toContain("Save as layout");
  });
});

// ── STAGE 2: THE LIST ITSELF IS A CONTROL (5.6) ──────────────────────────
//
// Stage 1 made the section removable. It did not make it AUTHORABLE: the only
// way to change the headings was still to edit the note and save the page as a
// layout, which is a gesture nothing on screen had ever named. A `lines`
// question puts the list in the row.
//
// THE COST, STATED WHERE IT IS PAID. `section-model.ts` argues that a question
// names a KEYWORD rather than carrying a parser, because an inverse per
// catalogue is three parsers to keep equal to three writers. A `lines` question
// has no keyword and no directive, so its read is `skeletonTitles` and its
// write is the planner's rewrite of the span. What keeps that honest is that
// both already existed for the removal, and that the preview and the write ask
// the same function the same question.
describe("editing the list, which is what makes the skeleton the reader's", () => {
  const question = () => findSection("headings")!.questions!(lessonCtx)[0];
  const wantWith = (text: string, titles: string[]) =>
    sectionsPresent(text, lessonCtx).map((id) =>
      id === "headings"
        ? { id, options: { headings: titles.join("\n") } }
        : id
    );
  const relist = (text: string, titles: string[]): string =>
    applySections(text, lessonCtx, wantWith(text, titles))!;

  it("hands the row the headings the note already has", () => {
    // The only route by which a directive-less question is drawable at all:
    // the model supplies an answer, the editor draws a control for it, and a
    // model that supplies nothing leaves the `settled` wording in its place.
    const row = journalSectionModel(lessonCtx)
      .sections(lesson())
      .find((s) => s.id === "headings")!;
    expect(row.answered?.["headings"]).toBe(
      ["Overview", "Key Concepts", "Key Takeaways", "Connected Ideas", "Next"].join(
        "\n"
      )
    );
  });

  it("hands over nothing for a note written before the markers", () => {
    // Not a refusal the editor works out — the model is simply silent, which is
    // the same silence a `folder` question with no host folder makes. The row
    // then reads the `settled` wording, which names the door rather than the
    // wall.
    const row = journalSectionModel(lessonCtx)
      .sections(unmarked(lesson()))
      .find((s) => s.id === "headings")!;
    expect(row.answered?.["headings"]).toBeUndefined();
    expect(question().settled?.text).toContain("ordinary markdown");
    expect(question().settled?.hint).toContain("Reload this page");
  });

  it("reorders without moving a word of what is under each heading", () => {
    const out = relist(lesson(), [
      "Next",
      "Overview",
      "Key Concepts",
      "Key Takeaways",
      "Connected Ideas",
    ]);
    expect(skeletonTitles(out)).toEqual([
      "Next",
      "Overview",
      "Key Concepts",
      "Key Takeaways",
      "Connected Ideas",
    ]);
    // The prose travelled WITH its heading rather than staying where it was —
    // a rewrite that reordered the `## ` lines alone would have handed every
    // paragraph to the wrong heading, silently, and the file would still have
    // parsed.
    const at = (needle: string): number => out.indexOf(needle);
    expect(at("What is this lesson about")).toBeGreaterThan(at("## Overview"));
    expect(at("What is this lesson about")).toBeLessThan(at("## Key Concepts"));
  });

  it("gives the file back byte for byte when the list comes back", () => {
    // THE PROPERTY THE WHOLE REWRITE IS SHAPED AROUND. `emit` composes each
    // group in the shape `renderBlock` writes — heading, blank, body, and a
    // single blank line where an empty body goes — so a list that ends up where
    // it started leaves the note where it started, with no drifting blank line
    // to mark that somebody opened the box.
    //
    // A ROUND TRIP RATHER THAN A NO-OP, because a no-op never reaches the
    // rewrite: `applySections` returns null when the plan holds nothing to do,
    // which is true and tests nothing. Rotating the list and rotating it back
    // runs the composer twice over every group in the file.
    const original = skeletonTitles(lesson())!;
    const rotated = [...original.slice(1), original[0]];
    expect(relist(relist(lesson(), rotated), original)).toBe(lesson());
    // And the untouched list really is a no-op, rather than a write that
    // happens to come out the same.
    expect(
      applySections(lesson(), lessonCtx, wantWith(lesson(), original))
    ).toBeNull();
  });

  it("adds a heading empty, and drops the ones left out of the list", () => {
    const out = relist(lesson(), ["Overview", "Method", "Next"]);
    expect(skeletonTitles(out)).toEqual(["Overview", "Method", "Next"]);
    // Composed the way the catalogue would have: a blank line under the
    // heading, which is the place to write.
    expect(out).toContain("## Method\n\n\n\n## Next");
    // And the ones that went were untouched prompt text, not writing.
    expect(out).not.toContain("**Definition:**");
  });

  it("keeps a dropped heading that has writing under it, and says so first", () => {
    const used = lesson().replace(
      "- [[]] — ",
      "- [[Ohm's law]] — the one I keep forgetting"
    );
    const want = wantWith(used, ["Overview", "Next"]);
    const op = planSections(used, lessonCtx, want).find(
      (o) => o.sectionId === "headings"
    )!;
    expect(op.kind).toBe("reconfigure");
    expect(op.keepsContent?.map((k) => k.key)).toEqual(["Connected Ideas"]);
    expect(op.detail).toContain("Connected Ideas");

    // And the write agrees with the preview, which is the only reason saying it
    // first is worth anything. The survivor goes after the list rather than
    // back into it: the reader's order is the reader's, and this heading was
    // not in it.
    const out = applySections(used, lessonCtx, want)!;
    expect(skeletonTitles(out)).toEqual(["Overview", "Next", "Connected Ideas"]);
    expect(out).toContain("the one I keep forgetting");
  });

  it("composes a typed list when the section is added back", () => {
    const gone = applySections(
      lesson(),
      lessonCtx,
      sectionsPresent(lesson(), lessonCtx).filter((id) => id !== "headings")
    )!;
    expect(gone).not.toContain("chronoanvil-skeleton");
    const back = applySections(gone, lessonCtx, [
      ...sectionsPresent(gone, lessonCtx),
      { id: "headings", options: { headings: "Aim\nMethod\nResult" } },
    ])!;
    // The add path renders rather than rewrites, so the answer has to arrive as
    // the shape `render` reads — the one conversion `renderOptionsFor` exists
    // for. Without it the string lands where an array belongs and the composed
    // note carries no headings at all.
    expect(skeletonTitles(back)).toEqual(["Aim", "Method", "Result"]);
    expect(back).toContain(bracketOpen(SKELETON_KEY));
    expect(back).toContain(bracketClose(SKELETON_KEY));
  });

  it("describes the list as a list, not as the text that was typed", () => {
    // The plan's line for a reconfigure, and a newline in it would break the
    // one-line detail every other op writes.
    const detail = describeAnswers(
      findSection("headings")!.questions!(lessonCtx),
      { headings: "Aim\nMethod" },
      "Lesson"
    );
    expect(detail).toContain("Aim, Method");
    expect(detail).not.toContain("\n");
  });

  it("can be moved among other sections and is still detected when reopening", () => {
    // ON `midSkeleton` (5.20), because every id in a permutation has to be one
    // the file already holds. A shipped Lesson no longer carries a recall deck,
    // so these lists stopped being reorderings and became "remove trackers, add
    // recall, and put the rest in this order" — and an ARRIVAL lands where the
    // catalogue puts it, not where the list asks, which is correct behaviour
    // and not what this test is about.
    const text = midSkeleton();
    const permutations = [
      ["headings", "banner", "trackers", "pages", "recall"],
      ["banner", "headings", "trackers", "pages", "recall"],
      ["banner", "trackers", "pages", "recall", "headings"],
      ["banner", "recall", "headings", "trackers", "pages"],
      ["recall", "headings", "pages", "trackers", "banner"],
      ["recall", "banner", "trackers", "pages", "headings"],
    ];
    for (const reordered of permutations) {
      const applied = applySections(
        text,
        lessonCtx,
        reordered.map((id) => ({ id }))
      )!;
      const presentAfter = sectionsPresent(applied, lessonCtx);
      expect(presentAfter, `Failed for ${reordered.join(",")}`).toEqual(reordered);
    }
  });
});
