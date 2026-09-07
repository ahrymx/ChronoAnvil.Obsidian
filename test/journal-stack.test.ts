// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The stack — 5.28.
//
// WHAT A STACK IS. `row` is cells beside each other; `stack` is sections under
// each other, sharing one fence and therefore one card. A journal note's
// banner, its logging grid and its index are one stack since the reader looked
// at the welded render and said *"they are both now welded and it feels nice to
// use … perhaps a new name for what this type of group is called"*.
//
// WHY THE DIRECTIVE EXISTS AT ALL, given the weld shipped without it. A fence
// that carries a banner, a grid and a table and says nothing about itself is a
// fence whose arrangement lives only in the catalogue that wrote it: the reader
// opening the note cannot see what makes those three one card, and neither can
// anything reading the file back. `row` has said so since 4.2 for exactly this
// reason, and the two are one idea with two directions.
//
// WHAT IS ASSERTED HERE. The grammar, the composer writing the line once, and
// the REPAIR — a note composed in the window between the weld and the keyword
// is reported and rewritten rather than left as the one shape the plugin
// composed and cannot name. The renderer's half is `chromeClasses`, which is
// pure, plus the stylesheet rules that cannot be seen without a vault.

import { describe, expect, it } from "vitest";
import {
  isPageHeadLine,
  isRowLine,
  isStackLine,
  MODIFIER_KEYWORDS,
  isTitleLine,
  parseStack,
  ROW_KEYWORD,
  STACK_KEYWORD,
} from "../src/core/directive-grammar";
import { STUDY_JOURNAL } from "../src/journals/journal";
import {
  composeTemplate,
  journalTemplateFiles,
} from "../src/journals/custom-journal";
import {
  defaultSectionIds,
  templateTargets,
} from "../src/journals/journal-sections";
import type { SectionContext } from "../src/journals/journal-sections";
import {
  applySections,
  insertStackLine,
  journalSectionModel,
  missingStackLine,
  parseSections,
  planSections,
  sectionsPresent,
  splitRawSegments,
} from "../src/journals/journal-plan";
import { parseFrame, stackParts } from "../src/core/directive-grammar";
import { WELDS_INTO_BANNER } from "../src/core/sections";
import { breakUp, weldInto } from "../src/core/row-order";
import { revealPartsIn } from "../src/ui/reveal";
import { goldenNotes } from "./golden-notes";
import type { SectionModel } from "../src/core/section-model";
import { segment } from "../src/core/layout";
import { chromeClasses } from "../src/ui/widgets/index";
import { readCss, readSrc, styleSheets } from "./sources";

describe("what a fence can say about being a stack", () => {
  it("reads the bare line", () => {
    expect(parseStack([STACK_KEYWORD, "journal-header", "pages-table"])).toEqual({
      stack: true,
      error: null,
    });
  });

  it("says nothing about a fence that does not carry it", () => {
    expect(parseStack(["journal-header", "pages-table"])).toEqual({
      stack: false,
      error: null,
    });
  });

  // ── AND 5.29 REVERSED THAT, WHICH IS THIS TEST'S WHOLE STORY ───────
  //
  // The second line was refused because it "describes nothing". It describes
  // where the second section starts, which is the one thing a stack could not
  // say about itself — and not saying it cost the reader **Break up the
  // stack**, disabled over an arrangement they had just made, because
  // `hasKnownExtent` is false for every member worth welding. Each line opens
  // a section now, exactly as `cell` opens a column.
  it("reads one line per section", () => {
    const spec = parseStack([STACK_KEYWORD, "diary", STACK_KEYWORD, "tasks-table"]);
    expect(spec).toEqual({ stack: true, error: null });
  });

  it("divides the body at each of them", () => {
    // The divider travels with the section it opens, which is what lets a part
    // be lifted out whole and leave nothing of itself behind.
    expect(
      stackParts([STACK_KEYWORD, "journal-header", STACK_KEYWORD, "a", "b"])
    ).toEqual([
      { from: 0, to: 2 },
      { from: 2, to: 5 },
    ]);
  });

  it("makes one part of an undivided stack, which is the old spelling", () => {
    // A fence composed before 5.29, or a word somebody typed at the top of
    // their own. Nothing renders differently and the sections in it simply
    // cannot be told apart — `flatBlocks` reads exactly this and calls them not
    // loose, which is the answer they got before any of this existed.
    expect(stackParts([STACK_KEYWORD, "journal-header", "a", "b"])).toEqual([
      { from: 0, to: 4 },
    ]);
  });

  it("finds no parts in a fence that is not a stack", () => {
    expect(stackParts(["journal-header", "pages-table"])).toEqual([]);
  });

  it("refuses an argument on any of them, not just the first", () => {
    // Reading `stackLines[0]` alone would honour a fence carrying a value
    // nobody could see, now that there is more than one line to carry it.
    const spec = parseStack([STACK_KEYWORD, "diary", "stack: 2", "tasks-table"]);
    expect(spec.stack).toBe(false);
    expect(spec.error).toContain("takes no value");
  });

  it("refuses an argument", () => {
    const spec = parseStack(["stack: banner", "diary"]);
    expect(spec.stack).toBe(false);
    expect(spec.error).toContain("takes no value");
  });

  // Two arrangements, one block, and the renderer would have to pick one in
  // silence. The reader is told instead, and keeps their content either way.
  it("refuses a fence that is also a row", () => {
    const spec = parseStack([STACK_KEYWORD, ROW_KEYWORD, "diary", "tasks-table"]);
    expect(spec.stack).toBe(false);
    expect(spec.error).toContain("both a row and a stack");
    // Named in the sentence rather than left to the reader to work out, and it
    // names the fix: put the other arrangement in its own block.
    expect(spec.error).toContain("```chronoanvil");
  });

  // EXACT, for `isRowLine`'s reason: a future `stack-something` directive must
  // not be swallowed by a prefix test.
  it("matches the keyword and nothing beginning with it", () => {
    expect(isStackLine(STACK_KEYWORD)).toBe(true);
    expect(isStackLine("  stack  ")).toBe(true);
    expect(isStackLine("stacks")).toBe(false);
    expect(isStackLine("stack-cards")).toBe(false);
    expect(isRowLine(STACK_KEYWORD)).toBe(false);
  });

  // A MODIFIER, NOT A DIRECTIVE. It is dropped from the dispatch loop and read
  // as a flag, which is what keeps the unclaimed-directive sweeps from
  // reporting it as a widget nothing draws.
  it("is a modifier keyword", () => {
    expect(MODIFIER_KEYWORDS.has(STACK_KEYWORD)).toBe(true);
  });
});

// Every journal template, with the surface it was composed for.
const templates = (): { ctx: SectionContext; text: string }[] =>
  templateTargets(STUDY_JOURNAL).map((t) => ({
    ctx: t.ctx,
    text: composeTemplate(t.ctx, defaultSectionIds(t.ctx), STUDY_JOURNAL.layout?.[t.key]),
  }));

// The fences of a composed note, as arrays of their body lines.
const fences = (text: string): string[][] => {
  const out: string[][] = [];
  let open: string[] | null = null;
  for (const line of text.split("\n")) {
    if (line.trim().startsWith("```chronoanvil")) {
      open = [];
      continue;
    }
    if (open && line.trim() === "```") {
      out.push(open);
      open = null;
      continue;
    }
    open?.push(line);
  }
  return out;
};

describe("the composer writes the line", () => {
  // ── ONCE PER SECTION AS OF 5.29, WHICH WAS ONCE PER FENCE ────────────
  //
  // The count changed for one reason: the word divides as well as declares. A
  // fence that said it was a stack and nothing about where its members began
  // could not be taken apart — `hasKnownExtent` is false for a region and for a
  // head-and-table, so **Break up the stack** was refused over the arrangement
  // 5.29's own weld button had just made. One line per member is what a row has
  // in `cell` and what makes the two operations inverses.
  it("opens each section in a shared fence with it", () => {
    for (const { ctx, text } of templates()) {
      const model = journalSectionModel(ctx);
      const blocks = model.blocks!(text);
      const bodies = fences(text);
      expect(blocks.length).toBe(bodies.length);
      blocks.forEach((block, at) => {
        const said = bodies[at].filter((l) => isStackLine(l.trim()));
        // A block nobody welded into carries no line at all, which is what
        // keeps a page's lone banner exactly as it was.
        expect(said.length, block.ids.join("+")).toBe(
          block.stack ? block.ids.length : 0
        );
        // FIRST, where `rowRuns` writes `row` and where a reader looking for
        // what a block is looks first. The top line is the host's opener as
        // well as the fence's declaration — the two readings write one file.
        if (said.length) expect(bodies[at][0].trim()).toBe(STACK_KEYWORD);
      });
    }
  });

  it("divides them where the sections actually are", () => {
    // THE PROPERTY THE WHOLE CHANGE IS FOR, asserted against the parser rather
    // than against the composer's own arithmetic: every section in a composed
    // stack sits in a part of its own, which is what `flatBlocks` checks before
    // it calls one loose. A composer that wrote the right NUMBER of lines in
    // the wrong PLACES would pass the test above and fail this one.
    for (const { ctx, text } of templates()) {
      const model = journalSectionModel(ctx);
      for (const block of model.blocks!(text)) {
        if (!block.stack) continue;
        expect(block.loose).toEqual(block.ids);
      }
    }
  });

  // The line describes a shared fence, so a fence holding one section must not
  // carry it — otherwise every block on every note would say "stack" and the
  // word would stop meaning anything.
  it("writes it only where sections actually share a fence", () => {
    for (const { text } of templates()) {
      for (const body of fences(text)) {
        if (!body.some((l) => isStackLine(l.trim()))) continue;
        // A banner plus at least one more section: more than one head-bearing
        // or region-bearing line under the modifier.
        const content = body.filter(
          (l) => l.trim() && !isStackLine(l.trim())
        );
        expect(content.length).toBeGreaterThan(1);
      }
    }
  });

  it("puts the study lesson's banner, grid and index in one stack", () => {
    const files = journalTemplateFiles(STUDY_JOURNAL);
    const lesson = files.find((f) => f.name.includes("lesson"));
    expect(lesson).toBeDefined();
    const body = fences(lesson!.content).find((b) =>
      b.some((l) => isStackLine(l.trim()))
    );
    expect(body?.[0].trim()).toBe(STACK_KEYWORD);
    expect(body).toContain("journal-header");
    expect(body).toContain("pages-table");
  });
});

// The note the repair exists for: composed by the weld, before the keyword.
const unsaid = (text: string): string =>
  text
    .split("\n")
    .filter((l) => l.trim() !== STACK_KEYWORD)
    .join("\n");

const runsOf = (text: string, ctx: SectionContext) => {
  const segs = splitRawSegments(segment(text.split("\n")));
  return parseSections(text, ctx).map((run) => ({
    run,
    lines: segs.slice(run.from, run.to + 1).flatMap((s) => s.lines),
  }));
};

describe("a stack that does not say it is one is repaired", () => {
  const stacked = () => {
    const found = templates().find(({ text }) =>
      text.split("\n").some((l) => l.trim() === STACK_KEYWORD)
    );
    if (!found) throw new Error("no template composes a stack");
    return found;
  };

  // THE GUARD BITES, which is this suite's standing rule for a new one: the
  // same run answers false with the line and true without it.
  it("reports the missing line, and nothing else", () => {
    const { text, ctx } = stacked();
    let sawStack = false;
    for (const { run, lines } of runsOf(text, ctx)) {
      expect(missingStackLine(lines, run, ctx)).toBe(false);
      if (lines.some((l) => isStackLine(l.trim()))) sawStack = true;
    }
    expect(sawStack).toBe(true);

    const before = unsaid(text);
    const short = runsOf(before, ctx).filter(({ run, lines }) =>
      missingStackLine(lines, run, ctx)
    );
    expect(short.length).toBe(1);
    // A run of one section is not a stack however it is written.
    expect(short[0].run.sectionIds.length).toBeGreaterThan(1);
  });

  it("says so in the plan", () => {
    const { text, ctx } = stacked();
    const before = unsaid(text);
    const present = sectionsPresent(before, ctx);
    const ops = planSections(before, ctx, present);
    const said = ops.filter((op) => op.detail?.includes("`stack` line"));
    expect(said.length).toBeGreaterThan(0);
    for (const op of said) expect(op.kind).toBe("extend");
    // And a plan over the note as composed promises nothing of the sort.
    expect(
      planSections(text, ctx, sectionsPresent(text, ctx)).some((op) =>
        op.detail?.includes("`stack` line")
      )
    ).toBe(false);
  });

  // ── AND THE DIVISIONS WITH IT, AS OF 5.29 ──────────────────────────
  //
  // The repair used to write one line: the word saying the fence is a stack.
  // That is no longer the whole of what a stack's fence says — each section in
  // it is opened by a line of its own — and a note carrying the declaration
  // without the divisions is exactly the note whose **Break up the stack** is
  // refused, which is the report this release is answering. Every note composed
  // by 5.28 is in that state, so the repair has to reach them or the fix
  // arrives only for notes nobody has yet.
  //
  // THE ASSERTION IS UNCHANGED AND IT IS THE STRONGEST ONE: strip every `stack`
  // line out of a composed note, repair it, and get the composed note back.
  it("writes the line back, and only the line", () => {
    const { text, ctx } = stacked();
    const before = unsaid(text);
    const after = applySections(before, ctx, sectionsPresent(before, ctx));
    expect(after).toBe(text);
    // AND IT SETTLES. A repair that reported itself again on the note it had
    // just written would extend a file on every Save for ever.
    expect(applySections(text, ctx, sectionsPresent(text, ctx))).toBeNull();
  });

  it("puts one line above each section, not one per section per pass", () => {
    // THE WRITE RUNS ONCE PER EXTENDING SECTION OF THE RUN, and a stack has
    // several — so the second member's pass re-inserted the first member's
    // divider until `stackDividers` learned to skip a boundary that already has
    // one. A fence of three sections came out with four lines.
    const { text, ctx } = stacked();
    const before = unsaid(text);
    const after = applySections(before, ctx, sectionsPresent(before, ctx))!;
    const body = fences(after).find((b) => b.some((l) => isStackLine(l.trim())))!;
    const block = journalSectionModel(ctx).blocks!(after).find((b) => b.stack)!;
    expect(body.filter((l) => isStackLine(l.trim())).length).toBe(block.ids.length);
    // And what the whole exercise is for: the members can be told apart, so the
    // window can offer to take them out again.
    expect(block.loose).toEqual(block.ids);
  });

  it("declines the divisions it cannot place, and still writes the claim", () => {
    // THE DECLINE BITES, which is the standing rule for a new guard here. The
    // boundary is found by matching the FIRST LINE THE CATALOGUE COMPOSES for a
    // member, so a reader who has retitled their own index has a fence this
    // cannot divide — and the honest answer is the one every stack got before
    // 5.29: the word goes in, the sections stay together, and nothing guesses
    // where one of them ends.
    const { text, ctx } = stacked();
    const before = unsaid(text).replace("header:🗂️ Topics", "header:🗂️ My topics");
    expect(before).toContain("header:🗂️ My topics");
    const after = applySections(before, ctx, sectionsPresent(before, ctx))!;
    const body = fences(after).find((b) => b.some((l) => isStackLine(l.trim())))!;
    expect(body.filter((l) => isStackLine(l.trim())).length).toBe(1);
    expect(body[0].trim()).toBe(STACK_KEYWORD);
    // The reader's own line is untouched, and their stack is still one card.
    expect(after).toContain("header:🗂️ My topics");
    const block = journalSectionModel(ctx).blocks!(after).find((b) => b.stack)!;
    expect(block.ids.length).toBeGreaterThan(1);
    expect(block.loose).toEqual([block.ids[0]]);
  });

  it("puts it inside the fence it describes", () => {
    const lines = insertStackLine([
      "```chronoanvil",
      "journal-header",
      "pages-table",
      "```",
    ]);
    expect(lines[1]).toBe(STACK_KEYWORD);
    // A run with no fence opener is left exactly as it is — a writer that must
    // never touch what it did not compose has no safe guess here.
    expect(insertStackLine(["some prose"])).toEqual(["some prose"]);
  });
});

describe("what the editor calls it", () => {
  // The window draws one card for every shared block and named all of them
  // "Group" — the vocabulary of the arrangement a stack is not. This is the
  // reader's *"perhaps a new name for what this type of group is called"*
  // arriving in the one place they would go to rearrange it.
  it("reports the stack as a stack and a lone section as neither", () => {
    const { text, ctx } = (() => {
      const found = templates().find(({ text }) =>
        text.split("\n").some((l) => l.trim() === STACK_KEYWORD)
      );
      if (!found) throw new Error("no template composes a stack");
      return found;
    })();
    const blocks = journalSectionModel(ctx).blocks!(text);
    const shared = blocks.filter((b) => b.ids.length > 1);
    expect(shared.length).toBeGreaterThan(0);
    expect(shared.every((b) => b.stack)).toBe(true);
    // AND IT BITES, WHICH IS ALSO WHAT PINS WHERE THE ANSWER COMES FROM. The
    // same three sections in the same one fence report `stack: false` with the
    // line taken out: this is read off the FENCE, not inferred from a block
    // having more than one member — which is exactly what a row is too.
    const said = journalSectionModel(ctx).blocks!(unsaid(text));
    expect(said.map((b) => b.ids)).toEqual(blocks.map((b) => b.ids));
    expect(said.some((b) => b.stack)).toBe(false);
  });

  it("says the word on the card and on its button", () => {
    const src = readSrc("section-editor");
    // RE-KEYED IN 5.29, when the bit stopped being the window's own note about
    // the file and became one of the arrangement's three. `isStack` asks the
    // block's SECOND member, which is where `normalise` writes the answer — a
    // set keyed by the opener goes stale the moment a block's first row changes.
    expect(src).toContain('const noun = this.isStack(group) ? "stack" : "group"');
    expect(src).toContain("private isStack(group: readonly string[]): boolean");
    expect(src).toContain('"Stack"');
    expect(src).toContain("`Break up the ${noun}`");
  });
});

describe("what the block wears", () => {
  const drew = (over: Record<string, boolean>) => ({
    entryBanner: false,
    overviewCard: false,
    studyBanner: false,
    trackerSection: false,
    stack: false,
    pageBanner: false,
    ...over,
  });

  it("takes the stack's card and not the tracker section's", () => {
    // A CARD INSIDE A CARD IS WHAT THIS PREVENTS, and it is what the first cut
    // rendered: the tracker frame around a page head that paints its own spine.
    const out = chromeClasses("card", drew({ trackerSection: true, stack: true }));
    expect(out).toContain("ca-journal-stack");
    expect(out).not.toContain("ca-journal-tracker-section");
  });

  it("leaves a grid in a fence of its own alone", () => {
    const out = chromeClasses("card", drew({ trackerSection: true }));
    expect(out).toContain("ca-journal-tracker-section");
    expect(out).not.toContain("ca-journal-stack");
  });

  it("draws no card at all when the fence gave up its frame", () => {
    expect(chromeClasses("none", drew({ stack: true }))).toEqual(["is-unframed"]);
  });
});

describe("every section the list says may weld, actually can", () => {
  // THE SWEEP THAT FOUND THE ONE THAT COULD NOT (5.30). `WELDS_INTO_BANNER` is
  // one list answering for ten catalogues, and the whole argument for a list
  // over ten declarations is that something can check it against all ten. This
  // is that check, and it is not a shape test: it performs the weld on the
  // composed note, reads the fence back, and takes it apart again.
  //
  // WHAT IT CAUGHT. `contents` — a journal dashboard's "what's below" — was in
  // the list and welded cleanly as far as the arrangement was concerned, and
  // the note it produced rendered with NO CARD: the section titles itself with
  // `frame: section`, that line landed in the banner's fence, and a `frame:`
  // line is a statement about the whole block. `chromeClasses` answered
  // `is-unframed` and the page lost its box. Nothing in the arrangement layer
  // could see it, because nothing there reads the fence back.
  //
  // THREE THINGS ARE ASSERTED OF EVERY WELD: the banner's fence still renders
  // as a card, the fence divides into one part per section so the reveal can
  // read it, and breaking it up again gives back the note byte for byte.
  const arrangementOf = (model: SectionModel, text: string) => {
    const blocks = model.blocks!(text);
    const rows = blocks.flatMap((b) => b.ids);
    const joined = new Set<string>();
    const stacked = new Set<string>();
    for (const b of blocks)
      for (const [i, id] of b.ids.entries()) {
        if (i > 0) joined.add(id);
        if (i > 0 && b.stack) stacked.add(id);
      }
    return { rows, joined, paged: new Set<string>(), stacked };
  };

  const groupsOf = (next: { rows: readonly string[]; joined: ReadonlySet<string> }) => {
    const out: string[][] = [];
    for (const id of next.rows) {
      if (out.length && next.joined.has(id)) out[out.length - 1].push(id);
      else out.push([id]);
    }
    return out;
  };

  const firstFence = (text: string): string[] =>
    text.split("```chronoanvil\n")[1].split("```")[0].split("\n").slice(0, -1);

  it("welds, renders as a card, divides, and comes back", () => {
    // Three tallies, because a sweep that counted only successes would pass on
    // a release where every weld had quietly become a refusal.
    let welded = 0;
    let already = 0;
    const refused: string[] = [];

    for (const note of goldenNotes()) {
      const model = note.model();
      if (!model.blocks || !model.regroup) continue;
      const arr = arrangementOf(model, note.text);
      const guests = model
        .sections(note.text)
        .filter((v) => v.stacks !== undefined && arr.rows.includes(v.id))
        .map((v) => v.id);
      for (const id of guests) {
        expect([...WELDS_INTO_BANNER], `${note.name}/${id}`).toContain(id);
        const host = model.blocks(note.text).find((b) => b.ids.includes("banner"));

        // ALREADY WELDED IS THE JOURNAL NOTE'S CASE: the composer writes the
        // stack, so there is nothing to press and the fence is what has to be
        // read back. It is checked on the same three terms as a fresh weld.
        if (host?.ids.includes(id)) {
          already++;
          const body = firstFence(note.text);
          expect(
            parseFrame(body.filter((l) => l.length && !l.startsWith("#"))).frame,
            `${note.name}/${id} frame`
          ).toBe("card");
          expect(stackParts(body).length, `${note.name}/${id} parts`).toBe(
            host.ids.length
          );
          expect(
            revealPartsIn(body, () => undefined).length,
            `${note.name}/${id} reveals`
          ).toBe(host.ids.length - 1);
          continue;
        }

        const next = weldInto(arr as never, arr.rows, id, "banner");
        if (!next) {
          // A REFUSAL IS AN ANSWER, and the one that happens is documented:
          // `launcher` ships inside the homepage's top row, and a section
          // already sharing a block is offered no weld until it leaves it.
          refused.push(`${note.name}/${id}`);
          continue;
        }
        const text = model.regroup(note.text, groupsOf(next), [...next.paged], [
          ...next.stacked,
        ]);
        expect(text, `${note.name}/${id} writes`).toBeTruthy();
        const body = firstFence(text!);

        // ONE: THE CARD IS STILL DRAWN. This is what `contents` failed, and it
        // fails silently — the arrangement is correct and the page has no box.
        expect(
          parseFrame(body.filter((l) => l.length && !l.startsWith("#"))).frame,
          `${note.name}/${id} frame`
        ).toBe("card");

        // TWO: THE FENCE SAYS WHERE EACH SECTION BEGINS, so the banner draws
        // one chevron per welded section rather than falling back to the two
        // words 5.30 took out.
        expect(stackParts(body), `${note.name}/${id} parts`).toHaveLength(2);
        expect(
          revealPartsIn(body, () => undefined).length,
          `${note.name}/${id} reveals`
        ).toBe(1);

        // THREE: AND IT COMES BACK. The round trip is the assertion that a weld
        // is a door rather than a one-way write.
        //
        // BYTE-FOR-BYTE ONLY WHERE THE SECTION ALREADY SAT UNDER THE BANNER,
        // which is what every entry in the list does today. Breaking a stack up
        // puts its sections DIRECTLY under the banner by design (5.29), so a
        // section welded from further down the page comes back one block
        // earlier than it left — the arrangement is right and the bytes differ.
        // A failure here on a new entry means that, not a broken door.
        const arr2 = arrangementOf(model, text!);
        const apart = breakUp(arr2 as never, arr2.rows, "banner");
        expect(apart, `${note.name}/${id} breaks up`).toBeTruthy();
        const back = model.regroup(text!, groupsOf(apart!), [...apart!.paged], [
          ...apart!.stacked,
        ]);
        expect(back ?? text, `${note.name}/${id} round trip`).toBe(note.text);
        welded++;
      }
    }

    // NOT VACUOUS IN ANY OF THE THREE DIRECTIONS. A weld was performed on a
    // surface that had none; the shipped stacks were read back; and the one
    // refusal is the one that is written down rather than a new one.
    expect(welded).toBeGreaterThan(0);
    expect(already).toBeGreaterThan(10);
    expect(refused).toEqual(["home/launcher"]);
  });
});

describe("the stack's card", () => {
  const css = () => readCss();

  it("paints the box the tracker section stopped painting", () => {
    const at = css().indexOf(".ca-journal-widget-block.ca-journal-stack {");
    expect(at).toBeGreaterThan(0);
    const rule = css().slice(at, css().indexOf("}", at));
    expect(rule).toContain("background:");
    expect(rule).toContain("border-radius:");
    // ZERO, BECAUSE THE BANDS CARRY IT. A stack does not know what its bands
    // are, so none of them may be measured against a card padding they would
    // each have to cancel.
    expect(rule).toContain("padding: 0");
  });

  it("stands the section surface down around it", () => {
    // `claimOwnBlock` marks any block holding a titled level-1 bar as a section
    // surface, and a stack's fence carries one — so without this the stack's
    // card is inset inside a second card. 70-section-surface.css's rule.
    expect(css()).toContain(":has(.ca-journal-stack)");
  });

  it("insets the name band whether or not the page head has a spine", () => {
    // 5.30. 5.28 read the head's left gutter off 99-aesthetic-presets.css,
    // which is true of a grain and of a journal and of nothing else — and Home
    // and Search are the two surfaces `page-head.ts` marks as neither. Their
    // name sat flush against the card's edge over bands inset 14px.
    const at = css().indexOf(".ca-journal-stack .ca-journal-page-head {");
    expect(at).toBeGreaterThan(0);
    const rule = css().slice(at, css().indexOf("}", at));
    expect(rule).toContain("padding-left: 14px");
    // ── AND THERE IS NO LONGER A SPINE TO BE WITHOUT (5.31.2) ─────────
    //
    // This asserted that the gated preset rule sat LATER in the sheet than the
    // card's own declaration, so the two stated one number rather than fighting
    // over it. The gate is gone: `98-page-head.css` gives every head the same
    // gutter with no attribute in the selector, so the case this rule was
    // written for cannot recur. The declaration stays for the reason it was
    // written — a band that reads its inset out of another file moves when that
    // file is edited for a reason of its own — so what is checked now is that
    // the two files still agree on the number.
    const head = styleSheets().find((f) => f.name === "98-page-head.css");
    expect(head?.css).toContain("padding-left: 14px");
    expect(css()).not.toContain(".ca-journal-page-head[data-ca-grain],");
  });

  it("keeps the head's bottom rule out of the card, now that a pseudo draws it", () => {
    // 5.28's argument, and it is unchanged: the chevron strip under the name
    // belongs to the NAME, not to what the chevrons open, so a rule between the
    // two would band the card in the wrong place.
    //
    // WHAT CHANGED IS WHERE THE LINE COMES FROM (5.31.2). It was `border-bottom`,
    // and this rule cancelled it. The graded rule is a pseudo-element now, so
    // cancelling the border cancels only the box's last pixel — the line itself
    // survives unless the pseudo is refused as well.
    const at = css().indexOf(".ca-journal-stack .ca-journal-page-head::after {");
    expect(at).toBeGreaterThan(0);
    expect(css().slice(at, css().indexOf("}", at))).toContain("content: none");
  });

  it("runs the spine down the card rather than doubling its left edge", () => {
    // REPORTED FROM THE VAULT (5.31.2). Decoding the render, left to right from
    // the card's outer edge: 2px of `--background-modifier-border`, 2px of the
    // journal's magenta, then the gutter — a double edge, a spine that stopped
    // 40px above the card's floor, and a name inset one border further than the
    // chevron strip under it. The card gives up its left border and the head
    // paints it, full height, in the grain's colour.
    const band = css().indexOf(".ca-journal-stack .ca-journal-page-head {");
    expect(band).toBeGreaterThan(0);
    const bandRule = css().slice(band, css().indexOf("}", band));
    expect(bandRule).toContain("border-left-width: 0");
    // The pseudo has to be the head's to read the colour and the CARD's to be
    // as tall as the card. An absolutely positioned box resolves against the
    // nearest POSITIONED ancestor, and `98-page-head.css` makes every head one.
    expect(bandRule).toContain("position: static");

    const gone = css().indexOf(
      ".ca-journal-widget-block.ca-journal-stack:has(.ca-journal-page-head) {"
    );
    expect(gone).toBeGreaterThan(0);
    expect(css().slice(gone, css().indexOf("}", gone))).toContain("border-left: none");

    const spine = css().indexOf(".ca-journal-stack .ca-journal-page-head::before {");
    expect(spine).toBeGreaterThan(0);
    const rule = css().slice(spine, css().indexOf("}", spine));
    expect(rule).toContain("position: absolute");
    // Top to bottom of the card, which is the whole of the fix: a spine that
    // ends where the head's box ends ends at a line where nothing else changes,
    // because the chevron strip below it deliberately takes no rule.
    expect(rule).toContain("top: 0");
    expect(rule).toContain("bottom: 0");
    expect(rule).toContain("left: 0");
    expect(rule).toContain("width: var(--ca-head-spine)");
    expect(rule).toContain("background: var(--ca-grain-spine)");
  });

  it("leaves the host between the head and the card unpositioned", () => {
    // THE SPINE'S CONTAINING BLOCK, AND NOTHING ELSE STATES IT. The pseudo above
    // is as tall as the nearest positioned ancestor; the stack's card is
    // `position: relative` and `.ca-journal-live-widget` — the bare host the
    // head is built inside — is the only thing between them. A `position` added
    // to that wrapper for a reason of its own would silently shorten this spine
    // back to the head, which is the bug it was written to fix, so the absence
    // is checked rather than described.
    for (const { name, css: text } of styleSheets()) {
      const bare = text.replace(/\/\*[\s\S]*?\*\//g, "");
      const re = /\.ca-journal-live-widget[^{}]*\{([^}]*)\}/g;
      for (let m = re.exec(bare); m; m = re.exec(bare)) {
        expect(m[1], `${name} positions .ca-journal-live-widget`).not.toMatch(
          /(^|[\s;])position\s*:/
        );
      }
    }
  });

  it("gives a dashboard's banner the stack's box and its own links band", () => {
    // A PAGE BANNER THAT IS ALSO A STACK (5.30) — the one combined case, and it
    // is one rule because the rest already agrees: every box property
    // `.ca-journal-page-banner` sets, the stack's card sets from a heavier
    // selector at the value a stack wants. What did not agree is the links
    // row's gutter, which is a small card's 8px against every other band's 14.
    const at = css().indexOf(
      ".ca-journal-page-banner.ca-journal-stack > .ca-journal-links-card > .ca-journal-links-bar {"
    );
    expect(at).toBeGreaterThan(0);
    expect(css().slice(at, css().indexOf("}", at))).toContain("padding: 7px 14px");
    // The plain page banner keeps its own, which is what makes the rule above
    // a combined case rather than a change to either class.
    const alone = css().indexOf(
      ".ca-journal-page-banner > .ca-journal-links-card > .ca-journal-links-bar {"
    );
    expect(alone).toBeGreaterThan(0);
    expect(css().slice(alone, css().indexOf("}", alone))).toContain("padding: 7px 8px");
  });

  it("puts a welded section's buttons back on its title row", () => {
    // `flex: 1 0 100%` gives a level-1 section's controls a row of their own,
    // which inside a stack is a third row in a card whose purpose is to spend
    // less of the page. The reader asked for "a more fitting space".
    const at = css().search(
      /\.ca-journal-stack\s+\.ca-journal-sec-l1:not\(/
    );
    expect(at).toBeGreaterThan(0);
    expect(css().slice(at, css().indexOf("}", at))).toContain("flex: 0 1 auto");
  });
});

describe("what a stack may not do", () => {
  // *"drag icon should never appear on a banner stack."* The grip goes on the
  // block's first `header:` bar, or on the block itself where there is none —
  // so before the stack it sat on the banner's own top edge, and after it, on
  // "🗂️ Topics": a handle on one section offering to drag the note's head.
  //
  // THE FIX IS THE PREDICATE, NOT A CASE FOR STACKS. `fixed` asked
  // `isTitleLine`, which is the dashboard head only; 5.11 named all three
  // keywords a page carries its own name under and fixed the three other
  // callers. A stack's fence opens with `journal-header`, so the widened
  // question pins it — and `attachBlockHead` returns before every gesture on
  // one return, which is 4.11's design.
  it("pins every fence that holds the page's own name", () => {
    for (const { text } of templates()) {
      for (const body of fences(text)) {
        if (!body.some((l) => isStackLine(l.trim()))) continue;
        expect(body.some((l) => isPageHeadLine(l.trim()))).toBe(true);
        // AND IT BITES: the question this used to ask answers false about every
        // one of them, which is why the grip was drawn.
        expect(body.some((l) => isTitleLine(l.trim()))).toBe(false);
      }
    }
  });

  it("computes the pin from the drawn lines, with the wider question", () => {
    expect(readSrc("widgets")).toContain(
      "drawable.filter(({ l }) => isPageHeadLine(l)).map(({ at }) => at)"
    );
  });
});

describe("telling a stack from a group at a glance", () => {
  // Two kinds of block hold more than one section and the card drew both the
  // same. The reader asked for the difference to be visible: *"give groups and
  // stacks different colour gradiants in the section editor to help orientate
  // users visually (accessability and nice to have)"*.
  it("marks the card from the same answer the wording comes from", () => {
    const src = readSrc("section-editor");
    // ONE ANSWER, TWO USES. A second test for "which kind is this" is a second
    // place for the card and its buttons to disagree about what they are on.
    expect(src).toContain('const noun = this.isStack(group) ? "stack" : "group"');
    expect(src).toContain('card.addClass(noun === "stack" ? "is-stack" : "is-group")');
  });

  it("runs each wash along the axis its members are arranged on", () => {
    const css = readCss();
    const rule = (sel: string): string => {
      const at = css.indexOf(sel);
      expect(at).toBeGreaterThan(0);
      return css.slice(at, css.indexOf("}", at));
    };
    // THE DIRECTION IS THE INFORMATION. A group's members are beside each
    // other, so its wash runs across; a stack's are under each other, so its
    // wash runs down. Swapping these would leave two pretty cards saying the
    // wrong thing, which no contrast check would catch.
    expect(rule(".ca-tpl-block.is-group {")).toContain("90deg");
    expect(rule(".ca-tpl-block.is-stack {")).toContain("180deg");
    expect(rule(".ca-tpl-block.is-group {")).toContain("--ca-tpl-group-wash");
    expect(rule(".ca-tpl-block.is-stack {")).toContain("--ca-tpl-stack-wash");
  });

  it("keeps both washes theme-aware and never colour-only", () => {
    const tokens = readCss();
    // Mixed into the card's own ground, so both ends of the gradient are a real
    // surface and the light theme gets its own weaker pair. `tokens.test.ts`
    // is what pins that a `--ca-*` read is defined at all.
    expect(tokens).toContain("--ca-tpl-group-wash: color-mix(");
    expect(tokens).toContain("--ca-tpl-stack-wash: color-mix(");
    expect(tokens.split("--ca-tpl-stack-wash").length - 1).toBeGreaterThan(2);
    // AND THE WORD IS STILL ON THE CARD, which is what makes the colour a
    // convenience rather than the only way to tell the two apart.
    const src = readSrc("section-editor");
    expect(src).toContain('"Stack"');
    expect(src).toContain("`Break up the ${noun}`");
  });
});

describe("the chevron at the end of a welded title row", () => {
  // TWO `margin-left: auto` IN ONE ROW SPLIT THE FREE SPACE BETWEEN THEM: the
  // toggle takes one to reach the right-hand edge and the actions strip now
  // takes one to sit beside the title, so the chevron landed in the MIDDLE with
  // `+ Topic` at the end — and jumped back to the edge when the section closed,
  // because a collapsed bar hides the strip. Reported from the vault as the
  // chevron shifting as the section opens.
  it("gives up its auto margin and orders past the buttons", () => {
    const css = readCss();
    const at = css.search(
      /\.ca-journal-stack\s+\.ca-journal-sec-l1:not\([^{]*\.ca-journal-header-toggle\s*\{/
    );
    expect(at).toBeGreaterThan(0);
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toContain("margin-left: 0");
    expect(rule).toContain("order: 1");
    // THE BITE IS THE RULE IT IS FIGHTING: without the two lines above, the
    // toggle's own `margin-left: auto` is still in the bundle and still applies.
    expect(css).toMatch(
      /\.ca-journal-header-toggle\s*\{[^}]*margin-left:\s*auto/
    );
  });
});

describe("the chevron strip's place in the card", () => {
  // NO DOM IN THIS SUITE, so the property is pinned where it is decided. The
  // first cut anchored the strip to `trackerBar` alone, so a note whose banner
  // reveals only "what's below" — a subject index with no logging grid — drew
  // its chevrons UNDERNEATH the section they open.
  it("is placed above the first thing it hides, not above the grid", () => {
    const src = readSrc("widgets");
    expect(src).toContain("revealAnchors");
    const at = src.indexOf('createDiv({ cls: "ca-journal-reveal-bar" })');
    expect(at).toBeGreaterThan(0);
    const after = src.slice(at, at + 900);
    expect(after).toContain("container.insertBefore(strip");
    expect(after).not.toContain("trackerBar?.parentElement === container");
  });

  // ── WHAT THE PILLS ARE MADE OF (5.31.2) ──────────────────────────────

  it("names the element as well as the class, so a bare button keeps nothing", () => {
    // THE STRIP NEVER RENDERED THE WAY ITS FILE DESCRIBED IT. The reported vault
    // render put every pill on a flat `#333333` ground with a `#454545` top edge
    // — a fill and an inset highlight on a control whose rule said
    // `background: transparent` and `box-shadow: none`. `.ca-journal-reveal-
    // toggle` is one class, and an app or theme rule naming the element beside a
    // class outranks it; nothing else in this plugin draws a bare `<button>` on
    // a card, which is why the strip is the one place it showed.
    const css = readCss();
    for (const state of ["", ":hover", ".is-open"]) {
      const sel = `.ca-journal-reveal-bar > button.ca-journal-reveal-toggle${state} {`;
      const at = css.indexOf(sel);
      expect(at, `no rule for ${sel}`).toBeGreaterThan(0);
    }
    // AND EACH STATES ITS GROUND, ITS EDGE AND ITS SHADOW rather than trusting
    // any of the three to be nothing, which is the half of the fix specificity
    // alone does not do.
    const base = css.indexOf(".ca-journal-reveal-bar > button.ca-journal-reveal-toggle {");
    const rule = css.slice(base, css.indexOf("}", base));
    expect(rule).toContain("background: transparent");
    expect(rule).toContain("box-shadow: none");
    expect(rule).toContain("border: var(--ca-rule-hair) solid");
    expect(rule).toContain("border-radius: 999px");
    // The old one-class rules are gone rather than left underneath as a second
    // answer to the same question. Anchored at a line start: the winning rule
    // ENDS in that same text, so a bare `toContain` can never see the
    // difference between the two.
    expect(css).not.toMatch(/\n\.ca-journal-reveal-toggle \{/);
    expect(css).not.toMatch(/\n\.ca-journal-reveal-toggle:hover \{/);
    expect(css).not.toMatch(/\n\.ca-journal-reveal-toggle\.is-open \{/);
  });

  it("draws the chevron at a size the row can see, and nudges it", () => {
    // At `1em` of `--ca-text-2xs` the glyph's visible stroke measured four
    // pixels in a thirty-pixel pill, against a label ink of eight and an emoji
    // of thirteen — so the eye compared it to its neighbours on the row rather
    // than to the box it was centred in, and read the difference as high.
    const css = readCss();
    const at = css.indexOf(".ca-journal-reveal-chevron {");
    expect(at).toBeGreaterThan(0);
    const rule = css.slice(at, css.indexOf("}", at));
    expect(rule).toContain("width: 14px");
    expect(rule).not.toContain("1.2em");
    const icon = css.indexOf(".ca-journal-reveal-chevron .svg-icon {");
    expect(css.slice(icon, css.indexOf("}", icon))).toContain("stroke-width:");
    // OPTICAL, AND REVERSED WITH THE GLYPH. A `⌄` carries its mass in the arms
    // at the top and reads high when its box is centred; rotated, it is the
    // other shape and reads low, so the nudge cannot be one-way.
    expect(rule).toContain("margin-top: 1px");
    // Anchored at a line start, because the same selector is the SECOND half of
    // the grouped hover rule above it and `indexOf` finds that one first.
    const open = css.search(/\n\.ca-journal-reveal-toggle\.is-open \.ca-journal-reveal-chevron \{/);
    expect(open).toBeGreaterThan(0);
    const openRule = css.slice(open, css.indexOf("}", open));
    expect(openRule).toContain("margin-top: -1px");
    expect(openRule).toContain("rotate(180deg)");
  });

  it("gives the strip room under the name now that its pills have edges", () => {
    const css = readCss();
    const at = css.indexOf(".ca-journal-stack > .ca-journal-reveal-bar {");
    expect(at).toBeGreaterThan(0);
    const rule = css.slice(at, css.indexOf("}", at));
    // 6 over 10: the floor is the head's own top inset at the other end of the
    // card, and a row of bordered objects cannot sit as tight under the name as
    // a row of bare words could.
    expect(rule).toContain("padding: 6px 14px 10px");
  });
});

// ── unticking one section of a stack (5.29) ───────────────────────────

describe("a section leaving a stack by being unticked", () => {
  const stackedNote = () => {
    const found = templateTargets(STUDY_JOURNAL)
      .map((t) => ({
        ctx: t.ctx,
        text: composeTemplate(
          t.ctx,
          defaultSectionIds(t.ctx),
          STUDY_JOURNAL.layout?.[t.key]
        ),
      }))
      .find(({ text }) => text.split("\n").some((l) => l.trim() === STACK_KEYWORD));
    if (!found) throw new Error("no template composes a stack");
    return found;
  };

  const without = (id: string) => {
    const { text, ctx } = stackedNote();
    const present = sectionsPresent(text, ctx);
    expect(present).toContain(id);
    return {
      ctx,
      text,
      out: applySections(text, ctx, present.filter((x) => x !== id))!,
    };
  };

  // ── THE GUESS THIS REPLACES, AND WHAT IT COST ──────────────────────
  //
  // THE GUARD BITES: with `stackSpans` forced to null — the answer it gives on
  // an undivided fence, and gave on every fence before 5.29 — the first three
  // of these fail and the keyword cut takes over. The fourth passes either
  // way; it is here to say the way back is unchanged, not to guard the cut.
  //
  // The removal takes the lines whose KEYWORD the doomed section renders and
  // spares any keyword a survivor renders too. On a stack both halves misfire:
  // the grid renders a `header:` of its own — the one the weld drops — so
  // "header" is spared, and the INDEX's head was left sitting in the banner's
  // card under a table that had gone. The parts are not a guess, so they take
  // exactly the lines the fence says are the section's.
  it("takes the section's head with it, which the keyword cut spared", () => {
    const { text, out } = without("children");
    expect(text).toContain("header:🗂️ Topics");
    expect(out).not.toContain("header:🗂️ Topics");
    expect(out).not.toContain("level-index");
    // And the survivors are untouched, region and all.
    expect(out).toContain("# chronoanvil:trackers:start");
    expect(out).toContain("journal-header");
  });

  it("takes the line that opened it too, so nothing opens nothing", () => {
    const { ctx, out } = without("trackers");
    expect(out).not.toContain("# chronoanvil:trackers:start");
    // One line per section, still — two sections, two lines. A divider left
    // behind would open a part with nothing in it and push the next section's
    // lines into it.
    const block = journalSectionModel(ctx).blocks!(out).find((b) => b.stack)!;
    expect(block.ids).toEqual(["banner", "children"]);
    const body = fences(out).find((b) => b.some((l) => isStackLine(l.trim())))!;
    expect(body.filter((l) => isStackLine(l.trim())).length).toBe(2);
    // And what it is all for: the one that is left can still be taken out.
    expect(block.loose).toEqual(block.ids);
  });

  it("leaves no arrangement behind when the last member goes", () => {
    const { text, ctx } = stackedNote();
    const present = sectionsPresent(text, ctx);
    const out = applySections(
      text,
      ctx,
      present.filter((id) => id !== "trackers" && id !== "children")
    )!;
    expect(out).not.toContain("\nstack\n");
    expect(out).toContain("journal-header");
    const blocks = journalSectionModel(ctx).blocks!(out);
    expect(blocks.find((b) => b.stack)).toBeUndefined();
  });

  it("gives it a card of its own when it is ticked back", () => {
    // The documented way back to the old arrangement, and it is unchanged: the
    // section composes a fresh fence, below the banner's whole card, wearing
    // the title it wears alone. The layers button is how it goes back in.
    const { ctx, out } = without("children");
    const back = applySections(out, ctx, [...sectionsPresent(out, ctx), "children"])!;
    expect(back).toContain("header:🗂️ Topics");
    const blocks = journalSectionModel(ctx).blocks!(back);
    expect(blocks.map((b) => b.ids)).toContainEqual(["children"]);
  });
});

// ── THE WELDED LOGGING GRID, COUNTED IN COLUMNS (5.30) ──────────────
//
// Reported from the vault with two renders of one Study subject, welded and
// broken up: *"the third tracker add tile is not going into the correct
// slot."* Three trackers and an add tile in a grid three across, and the tile
// took a third of the second row with the other two thirds left blank.
//
// THE PANEL'S ARITHMETIC WAS WRITTEN FOR A GRID TWO CELLS WIDE. `nth-child(odd)`
// for "column 1" and `nth-child(-n + 2)` for "row 1" say two; the grid says
// `repeat(3, 1fr)`. Reading the pixels of the reported render back confirmed
// all three consequences at once: no rule between cell 2 and cell 3, a second
// hairline over cell 3 alone, and a stray rule down the card's inner left edge
// under the tile.
//
// So these assert the arithmetic AGAINST THE GRID RULE ITSELF rather than
// against the number 3 — the count is read out of `10-tracker-modules.css` and
// the selectors are built from it, so moving the grid to four across fails
// here instead of shipping a fourth wrong layout.

/** Every rule of one stylesheet, with the at-rule conditions it sits under. */
function rulesOf(css: string): { at: string[]; selector: string; body: string }[] {
  const out: { at: string[]; selector: string; body: string }[] = [];
  const walk = (text: string, at: string[]): void => {
    let depth = 0;
    let start = 0;
    let head = "";
    let open = 0;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "{") {
        if (depth === 0) {
          head = text.slice(start, i).trim().replace(/\s+/g, " ");
          open = i;
        }
        depth++;
      } else if (text[i] === "}") {
        depth--;
        if (depth === 0) {
          const body = text.slice(open + 1, i);
          if (head.startsWith("@")) walk(body, [...at, head]);
          else out.push({ at, selector: head, body: body.replace(/\s+/g, " ").trim() });
          start = i + 1;
        }
      }
    }
  };
  walk(css.replace(/\/\*[\s\S]*?\*\//g, ""), []);
  return out;
}

describe("the welded logging grid counts the columns the grid has", () => {
  const sheet = (name: string): string => {
    const found = styleSheets().find((s) => s.name === name);
    expect(found, `no stylesheet ${name}`).toBeTruthy();
    return found!.css;
  };
  /** The panel's rules: the ones this file draws for a banner or a stack. */
  const panel = (): ReturnType<typeof rulesOf> =>
    rulesOf(sheet("30-header-bars.css")).filter((r) =>
      r.selector.includes(".ca-journal-tracker-cell")
    );
  const grid = (): ReturnType<typeof rulesOf> =>
    rulesOf(sheet("10-tracker-modules.css")).filter((r) =>
      r.selector.includes(".ca-journal-tracker-bar")
    );
  /** What a rule answers to: its queries, plus the mobile class if it names it. */
  const fold = (r: { at: string[]; selector: string }): string =>
    [...r.at, ...(r.selector.startsWith("body.is-mobile") ? ["body.is-mobile"] : [])]
      .join(" ")
      .trim();
  /** The declared column count, read off the grid rather than written here. */
  const columns = (): string => {
    const wide = grid().find((r) => fold(r) === "" && r.body.includes("grid-template-columns"));
    expect(wide, "no unqueried grid-template-columns").toBeTruthy();
    const n = /repeat\((\d+), 1fr\)/.exec(wide!.body);
    expect(n, `unreadable column count in "${wide!.body}"`).toBeTruthy();
    return n![1];
  };

  it("puts the left rule where column one actually is", () => {
    const n = columns();
    const left = panel().filter((r) => fold(r) === "" && r.body.includes("border-left-width: 0"));
    expect(left).toHaveLength(1);
    expect(left[0].selector).toContain(`:nth-child(${n}n + 1)`);
    // AND THE OLD ONE IS GONE FROM THE WIDE CASE. `odd` is right for two
    // columns and is restated below under the queries that fold to two; left
    // here it took cell 3's divider away and gave cell 4 one the card already
    // draws.
    expect(left[0].selector).not.toContain(":nth-child(odd)");
  });

  it("puts the top rule where row one actually ends", () => {
    const n = columns();
    const top = panel().filter((r) => fold(r) === "" && r.body.includes("border-top-width: 0"));
    expect(top).toHaveLength(1);
    expect(top[0].selector).toContain(`:nth-child(-n + ${n})`);
  });

  it("spans the add tile over what is left of its row, however much that is", () => {
    const n = Number(columns());
    const spans = panel().filter((r) => fold(r) === "" && r.body.includes("grid-column"));
    // One rule per position that leaves a hole: opening a row alone, then each
    // position after it up to the last, which needs none.
    expect(spans).toHaveLength(n - 1);
    for (let i = 1; i < n; i++) {
      const rule = spans.find((r) => r.selector.includes(`:nth-child(${n}n + ${i}):last-child`));
      expect(rule, `no rule for an add tile in column ${i} of ${n}`).toBeTruthy();
      expect(rule!.selector).toContain(".ca-journal-tracker-add");
      expect(rule!.body).toContain(`grid-column: ${i} / -1;`);
    }
    // THE REPORTED RENDER IS THE THIRD POSITION'S ABSENCE READ FORWARD: with
    // three trackers the tile is cell 4, which `odd` did not match, so it took
    // one track of an empty row. Cell 4 is `3n + 1` — the first case above.
    expect(spans.some((r) => r.selector.includes(`:nth-child(${n}n):last-child`))).toBe(false);
  });

  it("folds the arithmetic exactly where the grid folds, and nowhere else", () => {
    // The grid states its fold three times — a container query, a media query
    // and `body.is-mobile` — because a pane can be narrow in a wide window and
    // a phone can be neither. Arithmetic that answers one of the three is
    // wrong under the other two, which is what a `520px` block did here: it
    // described ONE column, and this grid has never had one.
    const folds = new Set(
      grid()
        .filter((r) => r.body.includes("grid-template-columns") && fold(r) !== "")
        .map(fold)
    );
    expect(folds.size).toBeGreaterThan(1);
    const arithmetic = new Set(
      panel()
        .filter((r) => fold(r) !== "")
        .map(fold)
    );
    expect([...arithmetic].sort()).toEqual([...folds].sort());
  });

  it("restates the whole two-column case in each fold, rather than patching one", () => {
    // `nth-child(3n + 1)` and `nth-child(odd)` disagree about every third cell,
    // so a folded cell has to be told what it now is AND what it no longer is —
    // and the tile's span has to be given back before it is re-taken.
    const folded = panel().filter((r) => fold(r) !== "");
    const byFold = new Map<string, string[]>();
    for (const r of folded) byFold.set(fold(r), [...(byFold.get(fold(r)) ?? []), r.selector + " { " + r.body + " }"]);
    for (const [where, rules] of byFold) {
      const all = rules.join("\n");
      expect(all, `${where} never restates the rules it undoes`).toContain(
        "border-left-width: var(--ca-rule)"
      );
      expect(all, `${where} never restates the rules it undoes`).toContain(
        "border-top-width: var(--ca-rule)"
      );
      expect(all, `${where} keeps a two-column column-1`).toContain(":nth-child(odd)");
      expect(all, `${where} keeps a two-column row-1`).toContain(":nth-child(-n + 2)");
      expect(all, `${where} never gives the tile its track back`).toContain(
        "grid-column: auto"
      );
    }
  });

  it("scopes no cell of this grid to a width the grid does not fold at", () => {
    // The deleted block. Between 520px and the grid's own 640px it said one
    // column while the grid drew two: no divider between them, and a rule
    // across the middle of every row.
    const widths = new Set(
      grid()
        .concat(panel())
        .flatMap((r) => r.at)
        .flatMap((q) => [...q.matchAll(/max-width: (\d+)px/g)].map((m) => m[1]))
    );
    expect([...widths]).toEqual(["640"]);
  });
});
