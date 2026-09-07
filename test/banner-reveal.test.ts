// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The banner's reveals — 5.28.
//
// WHAT THIS IS ABOUT. 5.28 welded the tracker grid into the banner and shrank
// an empty index table to its head, and the vault render was still 300px of
// chrome above the first written word. The reader's answer was a control rather
// than a smaller card: *"I was thinking the banner would gain chevrons
// (down/up) to expand or collapse trackers or what's below."*
//
// Three decisions were taken before any of this was written, and the tests
// below are mostly them:
//
//   THE BANNER IS A REMOTE CONTROL, not a container. Each section keeps its own
//   card, wherever the reader put it; the chevron shows or hides the whole card.
//   Nothing about the note's composition changes, which is why `test/golden/`
//   is untouched by this release's second half.
//   CLOSED BY DEFAULT, which is the opposite of every fold in the plugin and
//   the reason the state is its own record.
//   TWO REVEALS AND NOT EVERY SECTION — the grid and the note's index — so the
//   strip stays two words wide on a busy index.
//
// THE THIRD OF THOSE IS REVERSED IN 5.30, and the reader reversed it: *"I think
// the stack could become a global thing for any page with a banner"*, answered
// with *"Yes, one chevron per welded section."* Two words could name a journal
// note's two welds and nothing on the nine dashboards, so the vocabulary comes
// off the code and onto the fence — `stackParts` says where each section
// begins, and each of them past the host is one button.
//
// The DOM half is asserted structurally: this suite runs in node, there is no
// jsdom, and the interesting half of a reveal is a rule over a list anyway.

import { describe, expect, it } from "vitest";
import {
  BELOW_KINDS,
  addRevealTarget,
  belowSpanIn,
  clearRevealRegistry,
  firstHeaderTitleIn,
  revealAnchorIn,
  revealButtons,
  revealKey,
  revealLabelFor,
  revealPartsIn,
  revealTargetsFor,
  watchRevealTargets,
} from "../src/ui/reveal";
import type { RevealTarget } from "../src/ui/reveal";
import { remapConfiguredPaths } from "../src/core/pathwatch";
import { NOT_MIRRORED } from "../src/core/registry-mirror";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import { STUDY_JOURNAL } from "../src/journals/journal";
import { JOURNAL_SECTIONS, templateTargets } from "../src/journals/journal-sections";
import { composeTemplate, journalTemplateFiles } from "../src/journals/custom-journal";
import { defaultSectionIds } from "../src/journals/journal-sections";
import { journalSectionModel } from "../src/journals/journal-plan";
import { readCode, readCss } from "./sources";

// An element double. Nothing here needs a DOM — a target is an id, a label and
// something to put a class on — so the double is the three methods the reveal
// actually calls.
class FakeEl {
  classes = new Set<string>();
  addClass(c: string): void {
    this.classes.add(c);
  }
  removeClass(c: string): void {
    this.classes.delete(c);
  }
  toggleClass(c: string, on: boolean): void {
    if (on) this.classes.add(c);
    else this.classes.delete(c);
  }
}

const target = (id: string, label: string): RevealTarget =>
  ({ id, label, el: new FakeEl() as unknown as HTMLElement });

describe("which buttons a banner draws", () => {
  it("draws one per id, in the order the fence registered them", () => {
    // FILE ORDER, WHICH IS THE READER'S (5.30). `REVEAL_IDS` imposed one — the
    // grid before the index — and an imposed order is what stops meaning
    // anything the moment the sections are an arrangement somebody made. Every
    // target comes from one pass over one fence, so registration order is the
    // order the parts are written in.
    const buttons = revealButtons([
      target("kind-table", "🗂️ What's below"),
      target("tracker", "📊 Trackers"),
    ]);
    expect(buttons.map((b) => b.id)).toEqual(["kind-table", "tracker"]);
    expect(buttons.map((b) => b.label)).toEqual([
      "🗂️ What's below",
      "📊 Trackers",
    ]);
    // And the other arrangement gives the other strip, which is the whole of
    // what "file order" buys — a fixed list would answer the same both ways.
    expect(
      revealButtons([
        target("tracker", "📊 Trackers"),
        target("kind-table", "🗂️ What's below"),
      ]).map((b) => b.id)
    ).toEqual(["tracker", "kind-table"]);
  });

  it("gives one button every card of its id", () => {
    // A reader who split the topics table and the notes table into two fences
    // has two `below` blocks. One button, both cards — two buttons saying the
    // same word and each hiding half of it is a control that lies.
    const a = target("kind-table", "🗂️ What's below");
    const b = target("kind-table", "🗂 Notes");
    const buttons = revealButtons([a, b]);
    expect(buttons).toHaveLength(1);
    expect(buttons[0].targets).toEqual([a, b]);
    // And it is named by the first, which is the one nearest the banner.
    expect(buttons[0].label).toBe("🗂️ What's below");
  });

  it("draws nothing for an id nothing registered", () => {
    expect(revealButtons([target("tracker", "📊 Trackers")]).map((b) => b.id)).toEqual([
      "tracker",
    ]);
    expect(revealButtons([])).toEqual([]);
  });
});

describe("what a reveal calls itself", () => {
  // THE HELPERS CAME BACK, ASKED OF A PART (5.30). `revealLabelFor` and
  // `firstHeaderTitleIn` were deleted in 5.29 with the branch that named a
  // "what's below" fence that was a BLOCK OF ITS OWN — a shape that is no
  // longer a reveal target at all. They are the live path again now that a
  // reveal is one PART of a divided stack, and they are asked of that part's
  // lines rather than of a whole fence: the section's own head, and the
  // dispatcher's name for the widget when the weld dropped it.
  //
  // `belowSpanIn` STAYS, and is now only the 5.28 fallback — a journal note
  // welded before the dividers existed, whose fence cannot say where its
  // sections begin. The sweep below is still asked of it because that is the
  // shape the shipped templates are read as when the reveal is undivided.
  it("names every below-section the shipped templates actually compose", () => {
    // THE SWEEP THAT TIES THE RENDERER TO THE COMPOSER, and the one that
    // found the defect this list shipped with. `BELOW_KINDS` is the renderer's
    // idea of what makes a fence the note's index; the catalogue composes those
    // fences, and nothing but this compares the two. A table renamed on one
    // side loses the note its chevron with no error anywhere.
    //
    // The oracle is the catalogue's own locator rather than a second list:
    // `children` and `pages` are asked whether they are in the composed file,
    // and every file that says yes has to produce a label.
    const below = JOURNAL_SECTIONS.filter(
      (s) => s.id === "children" || s.id === "pages"
    );
    expect(below).toHaveLength(2);

    const labelled = new Map<string, string>();
    const composed = new Map<string, string>();
    for (const target of templateTargets(STUDY_JOURNAL)) {
      const file = journalTemplateFiles(STUDY_JOURNAL).find(
        (f) => f.name === target.file
      );
      expect(file, target.file).toBeTruthy();
      composed.set(target.file, file!.content);
      for (const fence of file!.content.split("```chronoanvil\n").slice(1)) {
        const lines = fence.split("```")[0].split("\n").filter((l) => l.trim());
        const kinds = lines.map((l) => l.split("|")[0].split(":")[0].trim());
        if (!kinds.some((k) => BELOW_KINDS.has(k))) continue;
        const label = belowSpanIn(lines)?.label ?? null;
        expect(label, target.file).not.toBeNull();
        labelled.set(target.file, label!);
      }
      // `locate` is a `String.search` — -1 for absent, and truthy at that, so
      // the comparison is with 0 and not with a boolean.
      const has = below.some((s) => (s.locate?.(file!.content, target.ctx) ?? -1) >= 0);
      expect(labelled.has(target.file), `${target.file} composes a below-section`)
        .toBe(has);
    }

    // And these are the words, which are the words the section editor uses.
    // The subject index is the one that was missing: it composes `level-index`,
    // which the first draft of `BELOW_KINDS` did not name.
    expect(labelled.get("subject-index.md")).toBe("🗂️ Topics");
    expect(labelled.get("topic-index.md")).toBe("🗂️ What's below");
    expect(labelled.get("lesson.md")).toBe("📄 Pages");
    expect(labelled.has("page.md")).toBe(false);
    expect(composed.get("page.md")).not.toContain("level-index");
  });
});

describe("which lines of a welded fence the index owns", () => {
  // THE WELD MOVED THIS QUESTION (5.28). "What's below" is composed into the
  // banner's own fence now, so the thing a chevron hides is no longer a block —
  // it is a RUN OF LINES inside somebody else's block, and `belowSpanIn` is the
  // rule that says which. Hiding the fence would take the banner with it.
  const fenceOf = (file: string): string[] => {
    const content = journalTemplateFiles(STUDY_JOURNAL).find(
      (f) => f.name === file
    )!.content;
    return content
      .split("```chronoanvil\n")[1]
      .split("```")[0]
      .split("\n")
      .filter((l) => l.trim());
  };

  it("starts at the index's own bar, below the banner and the grid", () => {
    const lines = fenceOf("lesson.md");
    const span = belowSpanIn(lines)!;
    expect(span).toBeTruthy();
    expect(span.from).toBeGreaterThan(0);
    expect(lines[span.from]).toBe("header:📄 Pages");
    expect(span.label).toBe("📄 Pages");
    // The three things the span must NOT contain, named rather than counted:
    // hiding any of them is hiding the banner this chevron sits on.
    expect(lines.slice(span.from, span.to)).not.toContain("journal-header");
    expect(lines.slice(span.from, span.to)).not.toContain("tracker:status");
    expect(lines.slice(span.from, span.to)).toContain("pages-table");
    expect(span.to).toBe(lines.length);
  });

  it("keeps a section's group heads inside it and stops at the next section", () => {
    // A `header:2:` is a group INSIDE the index — its kind tables are exactly
    // what the chevron is for — while a second level-1 head is another section
    // welded after this one, and closes the span. The level is the whole
    // difference, which is why this reads it rather than counting heads.
    const lines = fenceOf("topic-index.md");
    const span = belowSpanIn(lines)!;
    expect(span.label).toBe("🗂️ What's below");
    expect(lines.slice(span.from, span.to).filter((l) => l.startsWith("header:2:")).length)
      .toBeGreaterThan(1);
    expect(span.to).toBe(lines.length);

    const andAnother = [...lines, "header:1:📚 Resources", "resource-shelf:reading"];
    const shorter = belowSpanIn(andAnother)!;
    expect(andAnother[shorter.to]).toBe("header:1:📚 Resources");
  });

  it("answers null for a fence with no index in it", () => {
    // A page's banner. Nothing to reveal, so nothing registers and the strip
    // draws one button rather than two.
    expect(belowSpanIn(fenceOf("page.md"))).toBeNull();
    expect(belowSpanIn(["journal-header", "tracker:status"])).toBeNull();
    // And an index with no head above it names nothing a button could say.
    expect(belowSpanIn(["journal-header", "pages-table"])).toBeNull();
  });

  it("spans a stand-alone index fence from its first line", () => {
    // The unwelded case is not a special case: a reader who dragged the index
    // out of the banner (or a note composed before the weld) has a fence whose
    // first line is the bar, and the span is the whole of it.
    const span = belowSpanIn(["header:🗂️ What's below", "level-index"])!;
    expect(span.from).toBe(0);
    expect(span.to).toBe(2);
    expect(span.label).toBe("🗂️ What's below");
  });
});

describe("one chevron per welded section", () => {
  // 5.30, AND IT IS THE DIVIDERS BEING SPENT. 5.29 made every `stack` line open
  // a section so a fence could say where each of its members begins; this is
  // what that was for. `stackParts` is now the whole of the reveal's reading —
  // part 0 is the host and every part after it is one button.
  //
  // The name the dispatcher hands in, stubbed. The real one is
  // `SECTION_TITLES` with the grid's card head in front of it; what matters
  // here is that the fallback is a PARAMETER, so this file spells no label the
  // renderer does not.
  const nameOf = (kind: string): string | undefined =>
    kind === "tracker" ? "📊 Trackers" : undefined;

  const bodyOf = (file: string): string[] =>
    journalTemplateFiles(STUDY_JOURNAL)
      .find((f) => f.name === file)!
      .content.split("```chronoanvil\n")[1]
      .split("```")[0]
      .split("\n")
      .slice(0, -1);

  it("gives the host no button and every section after it one", () => {
    // The topic index is the busiest of the shipped notes: banner, grid, index.
    // Three parts, two chevrons — and the banner is not one of them, because a
    // chevron that hid the strip it is drawn in is a control with no way back.
    const body = bodyOf("topic-index.md");
    expect(body.filter((l) => l.trim() === "stack")).toHaveLength(3);
    const parts = revealPartsIn(body, nameOf);
    expect(parts).toHaveLength(2);
    expect(parts.map((p) => p.id)).toEqual(["tracker", "kind-table"]);
    expect(parts.map((p) => p.label)).toEqual(["📊 Trackers", "🗂️ What's below"]);
    // The first part's lines are the banner's, and no part claims them.
    expect(body.slice(0, parts[0].from)).toContain("journal-header");
    expect(parts[0].from).toBeGreaterThan(body.indexOf("journal-header"));
    // Each part runs to the next divider, and the last to the end.
    expect(parts[0].to).toBe(parts[1].from);
    expect(parts[1].to).toBe(body.length);
  });

  it("names a section by its own head, and the grid by what the card calls it", () => {
    // TWO ANSWERS, AND THE HEAD IS THE FIRST. The index writes `header:📄
    // Pages`, which is the reader's own wording and the word the section editor
    // uses; the grid writes no head at all — the weld drops it, which is the
    // whole reason it is a band — so it falls back to the name the dispatcher
    // already gives that grid wherever else it has to name it.
    const parts = revealPartsIn(bodyOf("lesson.md"), nameOf);
    expect(parts.map((p) => p.label)).toEqual(["📊 Trackers", "📄 Pages"]);
    expect(firstHeaderTitleIn(["# a comment", "tracker:status"])).toBeNull();
    expect(firstHeaderTitleIn(["header:", "header:📄 Pages"])).toBe("📄 Pages");
    // And the last resort is the anchor itself, so a widget nothing names still
    // gets a button rather than a blank one.
    expect(revealLabelFor(["stack", "resource-shelf:reading"], () => undefined)).toBe(
      "resource-shelf"
    );
  });

  it("files the answer under what the part draws, not under where it sits", () => {
    // THE ID IS THE ANCHOR. A part's index moves the moment anything is welded
    // in above it, and the id is what the open/closed answer is filed under —
    // so an id that moved would hand a reader somebody else's answer on the
    // first rearrangement.
    const body = bodyOf("lesson.md");
    const before = revealPartsIn(body, nameOf).map((p) => p.id);
    const reordered = [
      ...body.slice(0, body.indexOf("stack", 1)),
      "stack",
      "header:📚 Reading",
      "resource-shelf:reading",
      ...body.slice(body.indexOf("stack", 1)),
    ];
    const after = revealPartsIn(reordered, nameOf);
    expect(after.map((p) => p.id)).toEqual(["resource-shelf", ...before]);
    expect(revealKey("a.md", after[1].id)).toBe(revealKey("a.md", before[0]));
  });

  it("skips the heads and the buttons and stops at the table", () => {
    // A journal index composes a head, a group head, a new-note button and then
    // the table. The button is a control INSIDE the section — a reader who does
    // not want it takes it out — so the table is what the id is.
    expect(
      revealAnchorIn([
        "stack",
        "header:🗂️ What's below",
        "header:2:📖 Lessons",
        "button:study:new-lesson",
        "kind-table:lesson",
      ])
    ).toBe("kind-table");
    // Modifiers are not directives and a comment is not a line.
    expect(revealAnchorIn(["stack", "frame: section", "# a marker", "", "pages-table"]))
      .toBe("pages-table");
    // And a divider with nothing under it is not a section, so it gets no
    // button rather than an unlabelled one.
    expect(revealAnchorIn(["stack", "", "# chronoanvil:trackers:start"])).toBeNull();
    expect(revealPartsIn(["stack", "journal-header", "stack", ""], nameOf)).toEqual([]);
  });

  it("answers nothing for a fence the dividers cannot read", () => {
    // THE 5.28 SPELLING, which is one `stack` line holding every section: where
    // they begin is not written down, so this degrades to the answer the old
    // code gave and the dispatcher falls back to its two hand-written rules.
    // `flatBlocks` makes the same degradation on the same fence.
    expect(
      revealPartsIn(["stack", "journal-header", "tracker:status", "pages-table"], nameOf)
    ).toEqual([]);
    // And a fence that is not a stack at all has no parts to begin with.
    expect(revealPartsIn(["journal-header", "pages-table"], nameOf)).toEqual([]);
  });
});

describe("the registry a banner subscribes to", () => {
  it("tells a banner about a card that rendered after it", () => {
    clearRevealRegistry();
    let told = 0;
    const stop = watchRevealTargets("Study/lesson1.md", () => told++);
    expect(revealTargetsFor("Study/lesson1.md")).toEqual([]);

    const pages = target("below", "📄 Pages");
    const drop = addRevealTarget("Study/lesson1.md", pages);
    expect(told).toBe(1);
    expect(revealTargetsFor("Study/lesson1.md")).toEqual([pages]);

    // ...and about one that left, which is what a block being torn down as it
    // scrolls out of a long note looks like from here.
    drop();
    expect(told).toBe(2);
    expect(revealTargetsFor("Study/lesson1.md")).toEqual([]);
    stop();
    clearRevealRegistry();
  });

  it("keeps one note's cards out of another's", () => {
    clearRevealRegistry();
    addRevealTarget("Study/lesson1.md", target("below", "📄 Pages"));
    addRevealTarget("Study/lesson2.md", target("trackers", "📊 Trackers"));
    expect(revealTargetsFor("Study/lesson1.md").map((t) => t.id)).toEqual(["below"]);
    expect(revealTargetsFor("Study/lesson2.md").map((t) => t.id)).toEqual(["trackers"]);
    clearRevealRegistry();
    expect(revealTargetsFor("Study/lesson1.md")).toEqual([]);
  });

  it("stops telling a banner that has gone", () => {
    clearRevealRegistry();
    let told = 0;
    watchRevealTargets("a.md", () => told++)();
    addRevealTarget("a.md", target("below", "📄 Pages"));
    expect(told).toBe(0);
    clearRevealRegistry();
  });
});

describe("where the answer is kept", () => {
  it("defaults to closed, which is the opposite of every fold", () => {
    // Asserted at the source of the store rather than through it: the whole
    // decision is the `=== true`, and the record it reads is the reason there
    // is a second record at all.
    const widgets = readCode("widgets");
    expect(widgets).toContain(
      "isOpen: (key) => this.plugin.settings.revealedNoteSections?.[key] === true"
    );
    expect(DEFAULT_SETTINGS.revealedNoteSections).toEqual({});
    // And the fold's own store is untouched by it — one record per default.
    expect(widgets).toContain(
      "isCollapsed: (key) =>\n        this.plugin.settings.collapsedNoteSections?.[key] === true"
    );
  });

  it("is keyed so a rename retargets it", () => {
    expect(revealKey("Study/Maths/lesson1.md", "trackers")).toBe(
      "Study/Maths/lesson1.md::trackers"
    );
    const settings = {
      paths: {},
      revealedNoteSections: { "Study/Maths/lesson1.md::trackers": true },
      collapsedNoteSections: { "Study/Maths/lesson1.md::📄 Pages": true },
    };
    const changed = remapConfiguredPaths(
      settings as never,
      "Study/Maths",
      "Study/Algebra",
      true
    );
    expect(changed).toContain("revealed sections");
    expect(settings.revealedNoteSections).toEqual({
      "Study/Algebra/lesson1.md::trackers": true,
    });
    // The record beside it moved too, through the same walk — which is the
    // point of there being one walk.
    expect(changed).toContain("collapsed sections");
    expect(settings.collapsedNoteSections).toEqual({
      "Study/Algebra/lesson1.md::📄 Pages": true,
    });
  });

  it("is pruned with the note and never mirrored", () => {
    // The same two chores every per-note record has. A record that only grows
    // is what the prune exists to stop, and restoring somebody's open sections
    // onto another vault is restoring their scroll position.
    expect(readCode("main")).toContain(
      "pruneCollapsedSections(reveals, live)"
    );
    expect([...NOT_MIRRORED]).toContain("revealedNoteSections");
  });
});

describe("what the dispatcher registers, and where the strip goes", () => {
  const widgets = readCode("widgets");

  it("draws the strip on the banner, and only over something it can open", () => {
    // One note, one banner, one set of controls. A second strip would be two
    // controls over one section, disagreeing the moment either is pressed.
    //
    // AND NOT AT ALL WHERE THE BANNER OPENS NOTHING (5.29). Every target a
    // strip can show is registered from the banner's own fence in the pass that
    // draws it, so no anchors means no buttons — now and for as long as the
    // block lives. The reader saw the other half of that: two chevrons over two
    // sections that had left the fence. `:empty` is still in the stylesheet and
    // is still right, but a control the note cannot use should not be in the
    // document waiting for a rule to hide it.
    expect(widgets).toContain('const strip = container.createDiv({ cls: "ca-journal-reveal-bar" });');
    const at = widgets.indexOf("ca-journal-reveal-bar");
    const guard = widgets.lastIndexOf("if (isBannerFence && revealAnchors.length) {", at);
    expect(guard).toBeGreaterThan(0);
    // Nothing between the guard and the strip can put an anchor in, so the two
    // read as one decision.
    expect(widgets.slice(guard, at)).not.toContain("revealAnchors.push");
  });

  it("registers what the banner holds, and nothing in a fence of its own", () => {
    // THE REPORT THAT SETTLED THIS (5.29): *"the trackers and whats below
    // sections seem to be stuck in the stack format, they should return to
    // being normal sections/widgets"*, after breaking a stack up. They had come
    // out of the fence and stayed under the banner's chevrons — and a reveal is
    // closed by default and draws NOTHING when it is closed, so the two cards
    // the break-up had just made were not on the page at all.
    //
    // Every registration is guarded on the banner's own fence. There is no
    // branch outside one, and that absence is the assertion: a `!isBannerFence`
    // target is the shape this bug was.
    const at = widgets.indexOf("const isBannerFence =");
    const to = widgets.indexOf("ca-journal-reveal-bar", at);
    expect(at).toBeGreaterThan(0);
    expect(to).toBeGreaterThan(at);
    const region = widgets.slice(at, to);
    expect(region).not.toContain("!isBannerFence");
    // Three registrations: the general one over a divided stack's parts, and
    // the two 5.28 fallbacks, which are reached only when there are no parts.
    expect(region.split("new RevealTargetChild(")).toHaveLength(4);
    expect(region).toContain("const undivided = isJournalBanner && parts.length === 0;");
    expect(region).toContain("if (trackerBar && undivided) {");
    expect(region).toContain("const span = undivided ? belowSpanIn(lines) : null;");
  });

  it("reaches every banner for a divided stack and only journal notes without one", () => {
    // WHY TWO FENCE TESTS (5.30). A DIVIDED stack was written by this release's
    // own gestures and says what it is, so it is honoured on every page head
    // this plugin draws. The undivided reading is 5.28 compatibility, and 5.28
    // composed stacks on journal notes and nowhere else — widening it would
    // hand a diary entry, whose trackers have sat in its banner's fence since
    // long before any of this, a chevron nobody asked for.
    const at = widgets.indexOf("const fenceKinds =");
    const region = widgets.slice(at, widgets.indexOf("ca-journal-reveal-bar", at));
    expect(region).toContain(
      "const isBannerFence = fenceKinds.some((k) => BANNER_KINDS.has(k));"
    );
    expect(region).toContain(
      "const isJournalBanner = fenceKinds.some((k) => JOURNAL_BANNER_KINDS.has(k));"
    );
    // And the strip is still withheld where nothing registered, which is what
    // makes the wider reach safe: an entry welds nothing, so it draws nothing.
    expect(region.slice(region.indexOf("const parts = isBannerFence"))).toContain(
      "isJournalBanner && parts.length === 0"
    );
  });

  it("offers nothing on a note whose stack has been broken up", () => {
    // THE REPORTED NOTE, END TO END AND WITHOUT A DOM. Breaking the stack up
    // leaves the banner alone in its fence, so the two questions the dispatcher
    // asks of that fence — does it hold the grid, does it hold the index — both
    // answer no, `revealButtons` gets an empty list and `.ca-journal-reveal-bar
    // :empty` takes the strip off the page. The sections are ordinary cards
    // again, which is what the reader asked for.
    const t = templateTargets(STUDY_JOURNAL).find(
      (x) =>
        composeTemplate(x.ctx, defaultSectionIds(x.ctx), STUDY_JOURNAL.layout?.[x.key])
          .split("\n")
          .some((l) => l.trim() === "stack")
    );
    expect(t).toBeTruthy();
    const welded = composeTemplate(
      t!.ctx,
      defaultSectionIds(t!.ctx),
      STUDY_JOURNAL.layout?.[t!.key]
    );
    const model = journalSectionModel(t!.ctx);
    const ids = model.blocks!(welded).flatMap((b) => b.ids);
    expect(ids.length).toBeGreaterThan(2);

    const fencesOf = (text: string): string[][] =>
      text
        .split("```chronoanvil\n")
        .slice(1)
        .map((f) => f.split("```")[0].split("\n").filter((l) => l.trim()));

    // Welded, the banner's fence answers yes to both.
    const before = fencesOf(welded)[0];
    expect(before.some((l) => l.startsWith("# chronoanvil:trackers:"))).toBe(true);
    expect(belowSpanIn(before)).not.toBeNull();

    const apart = model.regroup!(welded, ids.map((id) => [id]), [], [])!;
    expect(apart).toBeTruthy();
    const after = fencesOf(apart);
    expect(after).toHaveLength(ids.length);
    expect(after[0].some((l) => l.startsWith("# chronoanvil:trackers:"))).toBe(false);
    expect(belowSpanIn(after[0])).toBeNull();
    // And each section landed in a fence carrying its own head, which is the
    // control that replaces the chevron it just lost.
    expect(after[1].some((l) => l.startsWith("header:"))).toBe(true);
    expect(after[2].some((l) => l.startsWith("header:"))).toBe(true);
  });

  it("puts them under the banner, not under the reader's writing", () => {
    // THE OTHER HALF OF THE SAME REPORT, and it is arithmetic rather than
    // chrome: `moveCell` resolved "the block after the last one" to the END OF
    // THE FILE, so a note with anything below its fences — prose, the skeleton,
    // the graph trailer — had its grid and its index moved beneath all of it.
    // The round-trip fixture could not see this: it has nothing after its
    // fences, so the two indices were the same one.
    const t = templateTargets(STUDY_JOURNAL).find(
      (x) =>
        composeTemplate(x.ctx, defaultSectionIds(x.ctx), STUDY_JOURNAL.layout?.[x.key])
          .split("\n")
          .some((l) => l.trim() === "stack")
    )!;
    const welded = composeTemplate(
      t.ctx,
      defaultSectionIds(t.ctx),
      STUDY_JOURNAL.layout?.[t.key]
    ).replace("%% chronoanvil-graph %%", "## My writing\n\nProse.\n\n%% chronoanvil-graph %%");
    const model = journalSectionModel(t.ctx);
    const ids = model.blocks!(welded).flatMap((b) => b.ids);
    const apart = model.regroup!(welded, ids.map((id) => [id]), [], [])!;
    const rows = apart.split("\n");
    const writing = rows.indexOf("## My writing");
    expect(writing).toBeGreaterThan(0);
    // Every fence is above it, and none of them touches its neighbour.
    const opens = rows.flatMap((l, i) => (l.trim() === "```chronoanvil" ? [i] : []));
    expect(opens).toHaveLength(ids.length);
    expect(Math.max(...opens)).toBeLessThan(writing);
    for (const i of opens.slice(1)) expect(rows[i - 1].trim()).toBe("");
    expect(rows[writing - 1].trim()).toBe("");
  });

  it("leaves a managed template showing everything", () => {
    // A template's preview IS the arrangement, so one that opened with its
    // sections hidden would be a window showing none of what it is for. The
    // same exemption the tracker add-tile takes.
    const at = widgets.indexOf("const fenceKinds =");
    expect(at).toBeGreaterThan(0);
    const after = widgets.slice(at, widgets.indexOf("ca-journal-reveal-bar"));
    expect(after).toContain("isManagedTemplate(this.plugin, ctx.sourcePath)");
  });

  it("shows a claimed card again when the banner or the block goes", () => {
    // THE RULE THAT MAKES CLOSED-BY-DEFAULT SAFE. The hiding is the
    // controller's act, so everything that hides has a matching release: a
    // target on its own teardown, the bar on its teardown and before every
    // redraw. Without the last of those a card that unregistered while closed
    // keeps the class for as long as its block lives.
    const reveal = readCode("reveal");
    expect(reveal.split("removeClass(REVEAL_HIDDEN_CLASS)")).toHaveLength(3);
    expect(reveal).toContain("this.release();\n    this.barEl.empty();");
  });

  it("marks the section with its own class, not the fold's", () => {
    // A fold and a reveal can be closed over one block at once, and one class
    // would make either one's reopening undo the other's.
    const css = readCss();
    expect(css).toContain(".ca-journal-reveal-hidden {");
    expect(css).toContain(".ca-journal-reveal-bar:empty {");
    expect(readCode("reveal")).not.toContain("ca-journal-section-hidden");
  });
});
