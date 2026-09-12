// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// ── THE MARKERS THIS PLUGIN WROTE ARE NOT THE READER'S TEXT (5.31) ───────
//
// *"two new screenshots which shows that the fences still appear in edit mode"*
//
// The report's "fences" are the plugin's MARKERS — a region comment, the prose
// skeleton's bracket, the graph block, the spacer — and the rule is one
// sentence: edit mode shows what reading mode shows. So most of what is
// asserted here is `seen()`: the note as the editor paints it, with the hidden
// ranges cut out. A rule about what a reader looks at is best read as the thing
// they are left looking at.
//
// The offsets get their own group, because a range that is off by one takes a
// blank line with it or leaves one behind, and neither is visible in a
// line-by-line comparison of the words.

import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { editorLivePreviewField } from "obsidian";

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { fenceCursorGuard, fenceLinesIn } from "../src/ui/fence-cursor";
import { hiddenMarkers, markerLinesIn } from "../src/ui/marker-lines";
import { redirectTyping } from "../src/ui/protected-lines";
import { ROOT, readSrc } from "./sources";

interface Span {
  from: number;
  to: number;
}

function stateFor(doc: string, live: boolean): EditorState {
  return EditorState.create({
    doc,
    extensions: [editorLivePreviewField.init(() => live), hiddenMarkers()],
  });
}

function rangesOf(set: { iter(): { value: unknown; from: number; to: number; next(): void } }): Span[] {
  const out: Span[] = [];
  const iter = set.iter();
  for (; iter.value; iter.next()) out.push({ from: iter.from, to: iter.to });
  return out;
}

/** The ranges the editor is told to paint as nothing. */
function hidden(doc: string, live = true): Span[] {
  const out: Span[] = [];
  for (const provider of stateFor(doc, live).facet(EditorView.decorations)) {
    // A FUNCTION HERE IS THE BUG THIS ASSERTION EXISTS FOR. CodeMirror calls a
    // function-valued provider dynamic and throws `Decorations that replace
    // line breaks may not be specified via plugins` for anything it produces —
    // which is every range this file is about. The state field's `provide` is
    // what keeps the value static, and a refactor to a view plugin would fail
    // here rather than in a vault.
    expect(typeof provider).not.toBe("function");
    out.push(...rangesOf(provider as never));
  }
  return out;
}

/** The same ranges, as the cursor rule reads them. */
function atomic(doc: string, live = true): Span[] {
  const state = stateFor(doc, live);
  return state
    .facet(EditorView.atomicRanges)
    .flatMap((f) => rangesOf(f({ state } as unknown as EditorView) as never));
}

/** The note as the editor paints it — every hidden range cut out. */
function seen(doc: string, live = true): string {
  const spans = [...hidden(doc, live)].sort((a, b) => a.from - b.from);
  let out = "";
  let at = 0;
  for (const span of spans) {
    out += doc.slice(at, span.from);
    at = span.to;
  }
  return out + doc.slice(at);
}

const ENTRY = [
  "`chronoanvil:spacer`",
  "",
  "```chronoanvil",
  "entry-header",
  "```",
  "",
  "<!--chronoanvil:focus",
  "Finish the grid arithmetic.",
  "-->",
  "",
  "<!--chronoanvil-skeleton-->",
  "",
  "## What happened",
  "",
  "<!--/chronoanvil-skeleton-->",
  "",
  "%% chronoanvil-graph %%",
  "%% [[Weekly|​]] %%",
].join("\n");

describe("what an entry looks like once its markers are gone", () => {
  it("leaves the note and none of the markup", () => {
    // THE WHOLE FEATURE, IN ONE COMPARISON. The fence stays — Live Preview
    // renders it as the card, and `fence-cursor.ts` is what keeps the cursor
    // out of it — and everything else that renders as nothing in reading view
    // now renders as nothing here.
    //
    // AND THE BLANK SEPARATORS BETWEEN MARKERS GO WITH THEM. The region, the
    // skeleton's opener, its closer and the graph block were four runs a blank
    // line apart, and each left that blank behind as a painted row. What is left
    // above and below the reader's heading is the one separator its own section
    // is entitled to.
    expect(seen(ENTRY)).toBe(
      [
        "",
        "",
        "```chronoanvil",
        "entry-header",
        "```",
        "",
        "",
        "## What happened",
        "",
      ].join("\n")
    );
  });

  it("shows every character of it in source mode", () => {
    // The escape hatch, and the permission the feature was granted on.
    expect(seen(ENTRY, false)).toBe(ENTRY);
    expect(hidden(ENTRY, false)).toEqual([]);
  });

  it("tells the cursor about exactly what it hid", () => {
    // A hidden range the cursor can still enter is a range the reader types
    // into blind — their words land inside a comment they cannot see.
    expect(atomic(ENTRY)).toEqual(hidden(ENTRY));
  });
});

describe("which lines are this plugin's", () => {
  it("takes a region whole, contents and all", () => {
    // A region's contents are a widget's VALUE, parked in a comment so a vault
    // without the plugin still carries the words. Reading mode drops the whole
    // comment and the widget is where the words are edited, so this takes the
    // same extent.
    const note = ["before", "<!--chronoanvil:focus", "typed", "-->", "after"];
    expect(markerLinesIn(note)).toEqual([{ from: 1, to: 3, keepLine: false }]);
  });

  it("takes a bracket's two edges and keeps what is between them", () => {
    // 5.6's whole argument for making the skeleton a bracket: what is inside is
    // the reader's own document. The `-` after the name is what tells this from
    // a region, in this file as in `stripPluginMarkup`.
    const note = ["<!--chronoanvil-skeleton-->", "## Heading", "<!--/chronoanvil-skeleton-->"];
    expect(markerLinesIn(note)).toEqual([
      { from: 0, to: 0, keepLine: false },
      { from: 2, to: 2, keepLine: false },
    ]);
  });

  it("takes the graph block's links line with its head", () => {
    const note = ["prose", "%% chronoanvil-graph %%", "%% [[Weekly|​]] %%"];
    expect(markerLinesIn(note)).toEqual([{ from: 1, to: 2, keepLine: false }]);
  });

  it("leaves the spacer its line, because the line is the point", () => {
    // `widgets/index.ts`: the spacer is *"where the cursor lands on open, so the
    // first real ```chronoanvil block below it isn't rendered raw"*. Take the
    // row away and the cursor goes back into the fence — the exact failure the
    // spacer was written to prevent.
    expect(markerLinesIn(["`chronoanvil:spacer`", "", "prose"])).toEqual([
      { from: 0, to: 0, keepLine: true },
    ]);
    const doc = "`chronoanvil:spacer`\n\nprose";
    expect(seen(doc)).toBe("\n\nprose");
  });

  it("reads the pre-rename spellings, which an unmigrated vault still has", () => {
    // The widgets read `<!--almanac:` regions and the graph block still says
    // `almanac-graph` until `tools/migrate-vault.mjs` runs. A marker that is
    // still live is a marker still worth hiding.
    //
    // THE TWO ARE HELD APART BY A LINE OF PROSE rather than by a blank one,
    // because a blank between two runs now joins them and this test is about the
    // spellings rather than about the join.
    const note = ["<!--almanac:focus", "typed", "-->", "prose", "%% almanac-graph %%", "%% %%"];
    expect(markerLinesIn(note)).toEqual([
      { from: 0, to: 2, keepLine: false },
      { from: 4, to: 5, keepLine: false },
    ]);
  });
});

describe("what it must not touch", () => {
  it("leaves a reader's own comment alone", () => {
    // EVERY PATTERN IS ANCHORED TO A NAMESPACED OPENER for this reason. "An
    // HTML comment" is not the rule — "a comment this plugin wrote" is.
    const note = "<!-- note to self -->\n<!--focus\nnot ours\n-->";
    expect(markerLinesIn(note.split("\n"))).toEqual([]);
    expect(seen(note)).toBe(note);
  });

  it("leaves markup inside a code block literal", () => {
    // `assets/documentation.md` PRINTS this plugin's markup, and a four-backtick
    // fence is how it prints a three-backtick one. 4.68.1 is the record of what
    // reading that page as live markup cost; hiding the example would be the
    // same mistake with the reader's own notes about their own vault.
    const note = [
      "````",
      "```chronoanvil",
      "note: Focus",
      "```",
      "<!--chronoanvil:focus",
      "-->",
      "````",
    ];
    expect(markerLinesIn(note)).toEqual([]);
  });

  it("leaves an unclosed region visible", () => {
    // The conservative half of `bracketSpanIn`'s rule. A reader who deleted the
    // `-->` needs to SEE the opener to put it back; hiding it would hide the
    // one line that explains why the rest of the note is inside a comment.
    expect(markerLinesIn(["<!--chronoanvil:focus", "typed"])).toEqual([]);
  });

  it("leaves the fences to the cursor guard", () => {
    // The two extensions are separate on purpose: a fence RENDERS in Live
    // Preview and must keep rendering, so nothing here may hide one.
    const note = ["```chronoanvil", "entry-header", "```"];
    expect(markerLinesIn(note)).toEqual([]);
  });
});

describe("where a hidden line's break goes", () => {
  it("takes the break before it, so no blank line is left behind", () => {
    // Replacing only the line's text would leave an empty row per marker, and a
    // note with seven regions would gain seven blank lines it did not have.
    expect(seen("a\n<!--chronoanvil-skeleton-->\nb")).toBe("a\nb");
  });

  it("takes the break after it when it starts the note", () => {
    // There is no break before line 0 to take.
    expect(seen("<!--chronoanvil-skeleton-->\nb")).toBe("b");
  });

  it("joins touching runs rather than claiming one break twice", () => {
    // A run at line 0 eats the break AFTER it and any other run eats the break
    // BEFORE it, so two adjacent runs would overlap — and two overlapping
    // replace decorations are a rendering CodeMirror is entitled to refuse.
    const note = ["<!--chronoanvil-skeleton-->", "<!--/chronoanvil-skeleton-->", "b"];
    expect(markerLinesIn(note)).toEqual([{ from: 0, to: 1, keepLine: false }]);
    expect(hidden(note.join("\n"))).toHaveLength(1);
    expect(seen(note.join("\n"))).toBe("b");
  });

  it("empties a note that is nothing but markers", () => {
    expect(seen("%% chronoanvil-graph %%\n%% %%")).toBe("");
  });

  it("follows the text when the note is edited", () => {
    const state = stateFor("a\n<!--chronoanvil-skeleton-->\nb", true);
    const next = state.update({ changes: { from: 0, insert: "new first line\n" } }).state;
    const set = next.facet(EditorView.decorations)[0] as never;
    const [span] = rangesOf(set);
    expect(next.doc.sliceString(span.from, span.to)).toBe("\n<!--chronoanvil-skeleton-->");
  });
});

describe("the empty rows at the bottom of a note", () => {
  // ── THE REPORT THIS GROUP IS ── *"the user can accidentally put the cursor
  // into these hidden blocks and start typing their prose there unknowingly."*
  //
  // A run swallows the break BEFORE itself, so the blank separator above it is
  // left painted. A diary entry ends in seven empty regions one blank apart, so
  // it ended in eight empty rows that look exactly like the rows a reader
  // writes on. The stack is built here rather than read out of `test/golden/`
  // so the shape is legible in the assertion; `composed-notes.test.ts` is what
  // holds it to the real one.
  const STACK = ["```chronoanvil", "entry-header", "```", ""].concat(
    ...["focus", "highlights", "challenges", "log"].map((k) => [
      `<!--chronoanvil:${k}`,
      "-->",
      "",
    ])
  );

  it("joins the whole stack into one run", () => {
    expect(markerLinesIn(STACK)).toEqual([{ from: 4, to: 14, keepLine: false }]);
  });

  it("leaves one separator where it left one per region", () => {
    // The separator the last card is entitled to, and the note's final row.
    expect(seen(STACK.join("\n"))).toBe("```chronoanvil\nentry-header\n```\n\n");
  });

  it("stops joining the moment a reader has written on a separator", () => {
    // THE WHOLE SAFETY ARGUMENT, and the reason this cannot swallow anything.
    // The join is keyed on the line being blank, so a line with a word on it
    // holds the two runs apart and is painted like any other prose.
    const typed = [...STACK];
    typed[6] = "a stray thought";
    expect(markerLinesIn(typed)).toEqual([
      { from: 4, to: 5, keepLine: false },
      { from: 7, to: 14, keepLine: false },
    ]);
    expect(seen(typed.join("\n"))).toContain("a stray thought");
  });

  it("never joins across the reader's own headings", () => {
    // The skeleton's opener joins the region above it and its closer joins the
    // graph block below, and what is between the two brackets is untouched —
    // because those lines are not blank.
    const note = [
      "<!--chronoanvil:focus",
      "-->",
      "",
      "<!--chronoanvil-skeleton-->",
      "",
      "## What happened",
      "",
      "<!--/chronoanvil-skeleton-->",
      "",
      "%% chronoanvil-graph %%",
      "%% [[Weekly|\u200b]] %%",
    ];
    expect(markerLinesIn(note)).toEqual([
      { from: 0, to: 3, keepLine: false },
      { from: 7, to: 10, keepLine: false },
    ]);
    expect(seen(note.join("\n"))).toContain("## What happened");
  });

  it("never joins the spacer to anything, in either direction", () => {
    // `keepLine` is excluded from the join for the same reason it exists: the
    // spacer's row is the landing strip, and a join would take it away and hand
    // the cursor straight back to the fence below.
    expect(
      markerLinesIn(["`chronoanvil:spacer`", "", "<!--chronoanvil-skeleton-->"])
    ).toEqual([
      { from: 0, to: 0, keepLine: true },
      { from: 2, to: 2, keepLine: false },
    ]);
  });

  it("leaves what survives a select-all exactly where it was", () => {
    // `protectedRanges` was already joining these — a run's `last.to + 1` lands
    // on the next run's leading break when the line between is empty, and its
    // own join clause absorbed that. So the reader gets back the same page they
    // got back before, and this is the assertion that says so out loud.
    const after = afterEdit(STACK.join("\n"), { from: 0, to: STACK.join("\n").length }, "delete.selection");
    expect(after).toBe(
      [
        "",
        "<!--chronoanvil:focus",
        "-->",
        "",
        "<!--chronoanvil:highlights",
        "-->",
        "",
        "<!--chronoanvil:challenges",
        "-->",
        "",
        "<!--chronoanvil:log",
        "-->",
        "",
      ].join("\n")
    );
  });
});

describe("where a cursor is allowed to come to rest", () => {
  // `atomicRanges` steps motion over a hidden run whole, and the position it
  // steps TO is one of the run's own endpoints. For three of the four shapes one
  // of those endpoints is inside a line the reader cannot see, so the reader
  // arrives somewhere invisible and the next keystroke goes there.

  it("sends a run below line 0 back to the end of the visible line", () => {
    // THE ONE THAT MATTERS IN A REAL NOTE. Both endpoints paint at the same
    // point — the end of "a" — so the reader sees nothing move, and the far one,
    // which sits just after the `-->`, stops existing as a place to type.
    const doc = "a\n<!--chronoanvil-skeleton-->\nb";
    const r = ends(doc);
    expect(restsAt(doc, r.to)).toBe(r.from);
    expect(restsAt(doc, r.from)).toBe(r.from);
  });

  it("sends a run that starts the note forward, past it", () => {
    // There is no visible line above to go back to, so the resting point is the
    // start of the first one below.
    const doc = "<!--chronoanvil-skeleton-->\nb";
    const r = ends(doc);
    expect(restsAt(doc, r.from)).toBe(r.to);
  });

  it("holds the spacer's cursor at the start of its row", () => {
    // Every character of that line is ours, so neither end is outside the
    // markup. It names its start and `redirectTyping` takes it from there.
    const doc = "`chronoanvil:spacer`\n\nprose";
    const r = ends(doc);
    expect(restsAt(doc, r.to)).toBe(r.from);
  });

  it("holds a note that is nothing but markers at its start", () => {
    const doc = "%% chronoanvil-graph %%\n%% %%";
    const r = ends(doc);
    expect(restsAt(doc, r.to)).toBe(r.from);
  });

  it("leaves a cursor in the reader's own text where they put it", () => {
    const doc = "a\n<!--chronoanvil-skeleton-->\nbcd";
    expect(restsAt(doc, doc.length - 1)).toBe(doc.length - 1);
  });

  it("does none of it in source mode", () => {
    // The escape hatch is the same one: nothing is hidden there, so nothing is
    // out of reach.
    const doc = "a\n<!--chronoanvil-skeleton-->\nb";
    expect(restsAt(doc, 5, false)).toBe(5);
  });

  it("leaves a drag selection the length the reader gave it", () => {
    // Cursors only. Shrinking a selection that spans a hidden run would take
    // back what the reader had highlighted; that case is the change filter's.
    //
    // THE ANCHOR IS THE RUN'S FAR END, deliberately: a drag that starts nowhere
    // near a hidden range cannot tell the rule from its absence, which is what
    // the first version of this test failed to notice.
    const doc = "a\n<!--chronoanvil-skeleton-->\nb";
    //
    // THE HEAD IS THE RUN'S FAR END, deliberately, and the anchor is elsewhere.
    // The head is the end the rule reads, so a drag that ends anywhere else
    // cannot tell the rule from its absence — which is what the first two
    // versions of this test failed to notice.
    const r = ends(doc);
    const sel = stateFor(doc, true)
      .update({ selection: { anchor: doc.length, head: r.to }, userEvent: "select.pointer" })
      .state.selection.main;
    expect([sel.from, sel.to]).toEqual([r.to, doc.length]);
  });
});

describe("a keystroke aimed at the spacer", () => {
  const SPACER = "`chronoanvil:spacer`\n\n```chronoanvil\nentry-header\n```";

  it("lands on a line below it, with the spacer left standing", () => {
    // The row exists so the cursor spawns there rather than in the fence below,
    // so a reader typing on it is doing the thing the row invites. The old
    // answer was to rewrite the spacer line until the markup showed.
    expect(afterEdit(SPACER, { from: 0, insert: "Hello" }, "input.type")).toBe(
      "`chronoanvil:spacer`\nHello\n\n```chronoanvil\nentry-header\n```"
    );
  });

  it("puts the cursor after what was typed", () => {
    const next = stateFor(SPACER, true).update({
      changes: { from: 0, insert: "Hello" },
      userEvent: "input.type",
    }).state;
    expect(next.doc.sliceString(0, next.selection.main.head)).toBe(
      "`chronoanvil:spacer`\nHello"
    );
  });

  it("is not how a deletion is answered", () => {
    // A refused deletion stays refused. Moving one would delete something the
    // reader did not aim at — this file's own failure, by its own new door.
    const doc = "`chronoanvil:spacer`\n\nprose";
    expect(afterEdit(doc, { from: 0, to: 20 }, "delete.selection")).toBe(doc);
  });

  it("leaves a selection typed over to the change filter", () => {
    // A replacement is a removal wearing an input event, and it has no single
    // place to be moved to. Here the change filter has already refused it, which
    // is why the group below reaches the branch a different way.
    const doc = "`chronoanvil:spacer`\n\nprose";
    expect(afterEdit(doc, { from: 0, to: 20, insert: "X" }, "input.type")).toBe(doc);
  });

  it("leaves typing anywhere else exactly where it was typed", () => {
    expect(afterEdit(SPACER, { from: 22, insert: "X" }, "input.type")).toBe(
      "`chronoanvil:spacer`\n\nX```chronoanvil\nentry-header\n```"
    );
  });

  it("lets a programmatic write through untouched", () => {
    // The rule that carries the risk, unchanged: Obsidian syncing a file into
    // an open editor must never be second-guessed.
    expect(afterEdit(SPACER, { from: 0, insert: "Hello" }, "set")).toBe(
      `Hello${SPACER}`
    );
  });

  it("does nothing in source mode", () => {
    expect(afterEdit(SPACER, { from: 0, insert: "Hello" }, "input.type", false)).toBe(
      `Hello${SPACER}`
    );
  });
});

describe("what the redirect refuses to move", () => {
  // WITHOUT `protectLines` BESIDE IT, which is the only way to see these two
  // branches at all. Paired as `hiddenMarkers` pairs them, a replacement that
  // touches a protected line is already gone before the redirect runs, so a test
  // written against the pair proves nothing about either — which is exactly what
  // the first version of this suite did, and what mutating the guards caught.
  const only = (doc: string): EditorState =>
    EditorState.create({
      doc,
      extensions: [redirectTyping(() => [{ from: 0, to: 0 }])],
    });

  const typed = (doc: string, changes: unknown): string =>
    only(doc).update({ changes, userEvent: "input.type" } as never).state.doc.toString();

  it("moves a plain insertion on the line, which is the case it exists for", () => {
    expect(typed("marker\nprose", { from: 0, insert: "Hi" })).toBe("marker\nHi\nprose");
  });

  it("leaves a replacement where the reader aimed it", () => {
    expect(typed("marker\nprose", { from: 0, to: 6, insert: "Hi" })).toBe("Hi\nprose");
  });

  it("leaves a multi-cursor edit alone, having nowhere single to put it", () => {
    // BOTH CURSORS ON THE LINE, because a second cursor somewhere else is
    // answered by the line test further down and proves nothing about this one.
    expect(
      typed("marker\nprose", [
        { from: 0, insert: "Hi" },
        { from: 6, insert: "Ho" },
      ])
    ).toBe("HimarkerHo\nprose");
  });
});

/** Where a cursor asking for `pos` actually comes to rest. */
function restsAt(doc: string, pos: number, live = true): number {
  return stateFor(doc, live)
    .update({ selection: { anchor: pos }, userEvent: "select.pointer" })
    .state.selection.main.head;
}

/** A hidden run's two endpoints, in the order the reader meets them. */
function ends(doc: string): Span {
  const [r] = hidden(doc);
  expect(r).toBeDefined();
  return r;
}

/** The note after one of the reader's own keystrokes. */
function afterEdit(
  doc: string,
  change: { from: number; to?: number; insert?: string },
  userEvent: string,
  live = true
): string {
  return stateFor(doc, live).update({ changes: change, userEvent }).state.doc.toString();
}

describe("what a select-all cannot take with it (5.31.1)", () => {
  it("takes the prose and leaves the markers, one blank line apart", () => {
    // SHARPER HERE THAN ON A FENCE. A fence is recomposed by *Set up / repair
    // vault* and the graph block is rewritten on the next render, but a region
    // holds the reader's own words and nothing puts those back — and since 5.31
    // they are invisible, so a select-all deletes text nobody can see.
    //
    // The fence goes because only `hiddenMarkers()` is installed here;
    // `fenceCursorGuard()` is what keeps that, and it is asserted in its own
    // file. What is worth reading in this expectation is the SHAPE: every run
    // on its own lines with a blank line between, which is what the composer
    // writes. That is the trailing break and the leading break both doing their
    // job — without either, the survivors weld into one line.
    expect(afterEdit(ENTRY, { from: 0, to: ENTRY.length }, "delete.selection")).toBe(
      [
        "`chronoanvil:spacer`",
        "",
        "<!--chronoanvil:focus",
        "Finish the grid arithmetic.",
        "-->",
        "",
        "<!--chronoanvil-skeleton-->",
        "",
        "<!--/chronoanvil-skeleton-->",
        "",
        "%% chronoanvil-graph %%",
        "%% [[Weekly|\u200B]] %%",
      ].join("\n")
    );
  });

  it("composes with the fence guard, which is how the plugin registers them", () => {
    // TWO `changeFilter` ENTRIES, AND THEIR RANGES TOUCH — a marker line
    // immediately after a fence's closer gives one range starting one character
    // before the other ends. CodeMirror's `joinRanges` merges them; this is the
    // assertion that it does, on the pair of extensions `main.ts` actually
    // installs rather than on either alone.
    const state = EditorState.create({
      doc: ENTRY,
      extensions: [
        editorLivePreviewField.init(() => true),
        fenceCursorGuard(),
        hiddenMarkers(),
      ],
    });
    const after = state
      .update({ changes: { from: 0, to: ENTRY.length }, userEvent: "delete.selection" })
      .state.doc.toString();
    expect(after).toBe(
      [
        "`chronoanvil:spacer`",
        "",
        "```chronoanvil",
        "entry-header",
        "```",
        "",
        "<!--chronoanvil:focus",
        "Finish the grid arithmetic.",
        "-->",
        "",
        "<!--chronoanvil-skeleton-->",
        "",
        "<!--/chronoanvil-skeleton-->",
        "",
        "%% chronoanvil-graph %%",
        "%% [[Weekly|\u200B]] %%",
      ].join("\n")
    );
  });

  it("leaves an ordinary keystroke alone", () => {
    const note = "prose\n<!--chronoanvil-skeleton-->\n## H\n<!--/chronoanvil-skeleton-->";
    expect(afterEdit(note, { from: 5, insert: "!" }, "input.type")).toBe(
      note.replace("prose", "prose!")
    );
  });

  it("lets a programmatic change through, because the file sync is one", () => {
    // Obsidian syncs a changed file into an editor that has it open. Suppress
    // half of that and the editor and the file disagree, with the editor
    // winning at the next save — a data-loss path, not an inconvenience.
    expect(stateFor(ENTRY, true).update({ changes: { from: 0, to: ENTRY.length } }).state.doc
      .toString()).toBe("");
  });

  it("lets undo through", () => {
    expect(afterEdit(ENTRY, { from: 0, to: ENTRY.length }, "undo")).toBe("");
  });

  it("filters nothing in source mode", () => {
    expect(afterEdit(ENTRY, { from: 0, to: ENTRY.length }, "delete.selection", false)).toBe("");
  });
});

describe("nothing this plugin composes is left showing", () => {
  // THE COVERAGE QUESTION, ASKED OF THE WHOLE TREE RATHER THAN OF A FIXTURE.
  // Four marker shapes are hidden and one fence parser is guarded, and every
  // one of those was written from a list somebody assembled by reading the
  // source. This sweep asks the opposite question: take every note the plugin
  // composes and every markdown file it ships, and find a line that LOOKS like
  // this plugin's markup and is covered by neither rule. It is the check that
  // fails when a sixth marker shape is added and only its writer is taught
  // about it.
  const MARKUP = /^(<!--|%%|`|#\s*(chronoanvil|almanac):|```)/;

  function uncovered(text: string): string[] {
    const lines = text.split("\n");
    const covered = new Set<number>();
    for (const s of fenceLinesIn(lines)) for (let i = s.from; i <= s.to; i++) covered.add(i);
    for (const s of markerLinesIn(lines)) for (let i = s.from; i <= s.to; i++) covered.add(i);
    // FRONTMATTER IS OBSIDIAN'S SURFACE, NOT OURS. The tracker region's
    // `# chronoanvil:trackers:start` markers sit in the property block as YAML
    // comments and in a ```chronoanvil fence, and the fence half is covered
    // above. Hiding a line inside the property block would be this plugin
    // painting over the properties editor.
    let from = 0;
    if (lines[0]?.trim() === "---") {
      const shut = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
      if (shut !== -1) from = shut + 1;
    }
    const out: string[] = [];
    for (let i = from; i < lines.length; i++) {
      const t = lines[i].trim();
      if (covered.has(i) || !MARKUP.test(t)) continue;
      if (/chronoanvil|almanac/i.test(t)) out.push(t);
    }
    return out;
  }

  const golden = join(ROOT, "test", "golden");
  const names = readdirSync(golden).filter((f) => f.endsWith(".md"));

  it("covers every composed note", () => {
    // A floor, so a golden directory that stopped being written would not turn
    // this into a loop over nothing.
    expect(names.length).toBeGreaterThanOrEqual(30);
    for (const name of names) {
      expect({ name, left: uncovered(readFileSync(join(golden, name), "utf8")) }).toEqual({
        name,
        left: [],
      });
    }
  });

  it("covers the shipped notes too", () => {
    // `documentation.md` is the one exclusion and it is the same one 4.68.1
    // bought: that page's SUBJECT is this plugin's markup, so it prints a
    // ```chronoanvil block inside a longer fence and opens paragraphs with an
    // inline `<!--chronoanvil:<key>-->`. Every line of it is prose about markup
    // rather than markup, and hiding any of it would be the 4.68.1 mistake
    // again — reading the documentation as the thing it documents.
    const assets = join(ROOT, "assets");
    const shipped = readdirSync(assets).filter((f) => f.endsWith(".md") && f !== "documentation.md");
    expect(shipped).toContain("staging.md");
    for (const name of shipped) {
      expect({ name, left: uncovered(readFileSync(join(assets, name), "utf8")) }).toEqual({
        name,
        left: [],
      });
    }
  });
});

describe("how it is wired", () => {
  it("is registered as an editor extension of its own", () => {
    expect(readSrc("main")).toContain("this.registerEditorExtension(hiddenMarkers())");
  });

  it("hides with a decoration and guards with the same ranges", () => {
    const src = readSrc("marker-lines").replace(/^\s*\/\/.*$/gm, "");
    expect(src).toContain("Decoration.replace({})");
    expect(src).toContain("EditorView.atomicRanges");
    // Gated on the mode INSIDE the field, which is what makes the decoration
    // set a value rather than a function of the view.
    expect(src).toContain("editorLivePreviewField");
    expect(src).toContain("EditorView.decorations.from");
    // And a user edit cannot take a hidden line with it — 5.31.1.
    expect(src).toContain("protectLines(");
    // And the cursor cannot come to rest on the wrong side of a hidden run,
    // which `atomicRanges` alone never covered: it is consulted by the VIEW and
    // its whole answer is which endpoint to step to.
    expect(src).toContain("EditorState.transactionFilter");
    // Only the `keepLine` runs are handed to the redirect, because they are the
    // only ones whose resting point is inside marker text.
    expect(src).toContain("spans.filter((s) => s.keepLine)");
  });

  it("keeps the change filter that 5.31.1 chose over a bouncing one", () => {
    // THE REDIRECT IS NOT THAT REVERSAL. What was rejected was a filter that
    // BOUNCES a transaction; this one moves the insertion and the reader sees
    // their character appear. So the change filter keeps both its user events
    // and its full extent, and the two run on disjoint halves of the problem.
    const src = readSrc("protected-lines").replace(/^\s*\/\/.*$/gm, "");
    expect(src).toContain('if (!tr.isUserEvent("input") && !tr.isUserEvent("delete")) return true;');
    expect(src).toContain('if (!tr.docChanged || !tr.isUserEvent("input")) return tr;');
  });

  it("no longer lets notestore claim Live Preview does this itself", () => {
    // The claim stood for six releases — *"Obsidian never renders it in either
    // Reading mode or Live Preview"* — and was the reason nobody looked.
    const store = readSrc("notestore");
    expect(store).not.toContain("Reading mode or Live Preview");
    expect(store).toContain("ui/marker-lines.ts");
  });
});
