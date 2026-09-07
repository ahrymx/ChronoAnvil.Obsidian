// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// ── THE CURSOR DOES NOT GO INTO A FENCE (5.31) ───────────────────────────
//
// *"could chronoanvil hide its html fences in edit mode? the user can still
// switch to source mode if they need to touch them."*
//
// The guard is a cursor rule, not a rendering one — Live Preview hands a block
// back to the editor when the selection is inside it — so what is asserted here
// is the RANGES the editor is given, at the offsets CodeMirror reads them at.
// `skipAtomicRanges` moves a position only when `pos > from && pos < to`, so a
// span that is off by one at either end is a span the reader can still land in,
// and every assertion below is written against that comparison rather than
// against the declaration that produces it.

import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { editorLivePreviewField } from "obsidian";

import { fenceCursorGuard, fenceLinesIn } from "../src/ui/fence-cursor";
import { protectedRanges } from "../src/ui/protected-lines";
import { readSrc } from "./sources";

/** The ranges the editor would consult, for a document in one of the modes. */
function atomicSpans(doc: string, live = true): { from: number; to: number }[] {
  const state = EditorState.create({
    doc,
    extensions: [editorLivePreviewField.init(() => live), fenceCursorGuard()],
  });
  const out: { from: number; to: number }[] = [];
  // The facet holds functions of a view, and each one reads `view.state` and
  // nothing else — so the state IS the view for this purpose, which is what
  // lets the extension be exercised with no DOM in the room.
  for (const f of state.facet(EditorView.atomicRanges)) {
    const set = f({ state } as unknown as EditorView);
    const iter = set.iter();
    for (; iter.value; iter.next()) out.push({ from: iter.from, to: iter.to });
  }
  return out;
}

const BANNER = [
  "`chronoanvil:spacer`",
  "",
  "```chronoanvil",
  "journal-header",
  "stack",
  "tracker: Mood",
  "```",
  "",
  "Something the reader wrote.",
].join("\n");

describe("which lines a fence occupies", () => {
  it("takes the ``` lines with it, because they are the block", () => {
    // A span that stopped at the directives would leave the opener and the
    // closer reachable — two lines that are as much the block as the middle is,
    // and the two a cursor in them expands exactly the same way.
    expect(fenceLinesIn(BANNER.split("\n"))).toEqual([{ from: 2, to: 6 }]);
  });

  it("leaves somebody else's code block alone", () => {
    const note = ["```js", "const a = 1;", "```"].join("\n");
    expect(fenceLinesIn(note.split("\n"))).toEqual([]);
  });

  it("leaves the documentation's printed example alone", () => {
    // 4.68.1's case, and the reason `segment` is the parser here rather than a
    // second scanner written for this file. `assets/documentation.md` wraps a
    // ```chronoanvil block in a FOUR-backtick fence to print it as source; a
    // scanner that matched the inner opener would make the prose page's own
    // illustration unselectable in the editor.
    const note = ["````", "```chronoanvil", "journal-header", "```", "````"].join("\n");
    expect(fenceLinesIn(note.split("\n"))).toEqual([]);
  });

  it("leaves an unterminated fence alone", () => {
    // Malformed, and a guess about where it ends is a guess that could swallow
    // the rest of the note — including every line the reader still has to type.
    const note = ["```chronoanvil", "journal-header", "", "prose"].join("\n");
    expect(fenceLinesIn(note.split("\n"))).toEqual([]);
  });

  it("counts a chart fence too", () => {
    // `chronoanvil-charts` holds chart specs rather than directives, which is a
    // difference to the reconciler and none at all to the reader: it renders as
    // a widget and opens under the cursor the same way.
    const note = ["```chronoanvil-charts", "{}", "```"].join("\n");
    expect(fenceLinesIn(note.split("\n"))).toEqual([{ from: 0, to: 2 }]);
  });

  it("finds every fence on a note, not the first", () => {
    const note = [...BANNER.split("\n"), "", "```chronoanvil", "children", "```"];
    expect(fenceLinesIn(note)).toEqual([
      { from: 2, to: 6 },
      { from: 10, to: 12 },
    ]);
  });
});

describe("what the editor is told to step over", () => {
  it("covers the block from its first character to its last", () => {
    const spans = atomicSpans(BANNER);
    expect(spans).toHaveLength(1);
    const doc = BANNER.split("\n");
    const from = doc.slice(0, 2).join("\n").length + 1;
    expect(spans[0].from).toBe(from);
    expect(spans[0].to).toBe(from + doc.slice(2, 7).join("\n").length);
    expect(BANNER.slice(spans[0].from, spans[0].to)).toBe(
      ["```chronoanvil", "journal-header", "stack", "tracker: Mood", "```"].join("\n")
    );
  });

  it("keeps the lines either side of it reachable", () => {
    // The rule is `pos > from && pos < to`, so both edges are still positions a
    // reader can put a cursor on — which is what makes a fence something to
    // write above and below rather than a hole in the note.
    const [span] = atomicSpans(BANNER);
    const inside = (pos: number): boolean => pos > span.from && pos < span.to;
    expect(inside(span.from)).toBe(false);
    expect(inside(span.to)).toBe(false);
    // And the directives themselves are not.
    expect(inside(BANNER.indexOf("journal-header"))).toBe(true);
    expect(inside(BANNER.indexOf("tracker: Mood"))).toBe(true);
  });

  it("guards nothing in source mode, which is the way in", () => {
    // THE ESCAPE HATCH THE FEATURE WAS GRANTED ON. `registerEditorExtension` is
    // vault-wide and mode-blind, so without the check this reads it would make
    // the directives unreachable in the one mode they are text on purpose.
    expect(atomicSpans(BANNER, false)).toEqual([]);
  });

  it("guards nothing on a note that has no fences", () => {
    expect(atomicSpans("Just a note.\n\nWith two paragraphs.")).toEqual([]);
  });

  it("follows the text when the note is edited", () => {
    // The field recomputes on `docChanged` and on nothing else. A span left
    // where the fence used to be would guard the reader's prose and leave the
    // block open, which is both halves of the bug at once.
    const state = EditorState.create({
      doc: BANNER,
      extensions: [editorLivePreviewField.init(() => true), fenceCursorGuard()],
    });
    const next = state.update({ changes: { from: 0, insert: "A new first line\n" } }).state;
    const [span] = state.facet(EditorView.atomicRanges).flatMap((f) => {
      const out: { from: number; to: number }[] = [];
      const iter = f({ state: next } as unknown as EditorView).iter();
      for (; iter.value; iter.next()) out.push({ from: iter.from, to: iter.to });
      return out;
    });
    expect(next.doc.sliceString(span.from, span.to)).toBe(
      ["```chronoanvil", "journal-header", "stack", "tracker: Mood", "```"].join("\n")
    );
  });
});

/** The note after one of the reader's own keystrokes. */
function afterEdit(
  doc: string,
  change: { from: number; to?: number; insert?: string },
  userEvent: string,
  live = true
): string {
  const state = EditorState.create({
    doc,
    extensions: [editorLivePreviewField.init(() => live), fenceCursorGuard()],
  });
  return state.update({ changes: change, userEvent }).state.doc.toString();
}

const SELECT_ALL = (doc: string, live = true): string =>
  afterEdit(doc, { from: 0, to: doc.length }, "delete.selection", live);

describe("what a select-all cannot take with it (5.31.1)", () => {
  it("takes the prose and leaves the block standing", () => {
    // ATOMIC RANGES NEVER COVERED THIS. They govern where a cursor may travel
    // and where a pointer selection snaps; a selection that already SPANS a
    // fence is not their business, and Ctrl+A is exactly that.
    expect(SELECT_ALL(BANNER)).toBe(
      ["", "```chronoanvil", "journal-header", "stack", "tracker: Mood", "```", ""].join("\n")
    );
  });

  it("keeps the opener at the start of a line when a selection is typed over", () => {
    // THE CASE THE LEADING BREAK IS FOR, and it is not a rare shape:
    // `ChangeSet.filter` keeps an insertion with the piece of the change it
    // STARTED in, so a selection running from prose into a fence puts the typed
    // character immediately before the opener. Without the break in the
    // protected range that is "prZ```chronoanvil", which is a code span rather
    // than a block, and the card is gone anyway.
    const note = ["prose here", "```chronoanvil", "children", "```"].join("\n");
    expect(afterEdit(note, { from: 2, to: 20, insert: "Z" }, "input.type")).toBe(
      ["prZ", "```chronoanvil", "children", "```"].join("\n")
    );
  });

  it("leaves an ordinary keystroke alone", () => {
    // Only changes TOUCHING a protected range are suppressed, so typing where
    // the reader writes costs nothing.
    expect(afterEdit(BANNER, { from: BANNER.length, insert: "!" }, "input.type")).toBe(
      BANNER + "!"
    );
  });

  it("lets a programmatic change through, because the file sync is one", () => {
    // THE RULE THAT CARRIES THE WHOLE RISK. This plugin never dispatches an
    // editor transaction — every write is `vault.modify` / `vault.process` /
    // `adapter.write` — but Obsidian syncs a changed file into an editor that
    // has it open, and suppressing part of THAT leaves the editor and the file
    // disagreeing with the editor winning at the next save.
    const state = EditorState.create({
      doc: BANNER,
      extensions: [editorLivePreviewField.init(() => true), fenceCursorGuard()],
    });
    expect(state.update({ changes: { from: 0, to: BANNER.length } }).state.doc.toString()).toBe("");
  });

  it("lets undo through", () => {
    // Undo has to be able to put back a prose deletion this filter has already
    // trimmed, so it is not a `delete` event as far as this rule is concerned.
    expect(afterEdit(BANNER, { from: 0, to: BANNER.length }, "undo")).toBe("");
  });

  it("filters nothing in source mode", () => {
    expect(SELECT_ALL(BANNER, false)).toBe("");
  });

  it("hands CodeMirror one pair per stretch, not an overlapping list", () => {
    // Two fences on consecutive lines share the one break between them, so the
    // second pair would start one character before the first pair ends. Both
    // `ChangeSet.filter` and `joinRanges` absorb that shape without complaint —
    // which is exactly why it needs asserting here rather than through a
    // document: no deletion could tell the two apart, and the facet's contract
    // is a list of pairs, not a list of pairs that usually works.
    const note = ["```chronoanvil", "```", "```chronoanvil", "```", "tail"].join("\n");
    const doc = EditorState.create({ doc: note }).doc;
    const spans = fenceLinesIn(note.split("\n"));
    expect(spans).toHaveLength(2);
    const ranges = protectedRanges(doc, spans);
    expect(ranges).toEqual([0, doc.line(4).to + 1]);
    for (let i = 0; i < ranges.length; i += 2) {
      expect(ranges[i]).toBeLessThan(ranges[i + 1]);
      if (i > 0) expect(ranges[i - 1]).toBeLessThan(ranges[i]);
    }
  });
});

describe("how the guard is wired", () => {
  it("is registered as the plugin's editor extension", () => {
    const main = readSrc("main");
    expect(main).toContain("this.registerEditorExtension(fenceCursorGuard())");
  });

  it("moves the cursor and draws nothing", () => {
    // THE OTHER WAY TO HIDE A RANGE IS `Decoration.replace` WITH A WIDGET OF OUR
    // OWN, and it would be a second rendering path for every block as well as a
    // change to the DOM `headerbar.ts` walks and `block-drag.ts` drags. Keeping
    // Obsidian's widget and moving only the cursor is what left both untouched,
    // so a decoration appearing here is the design being reversed rather than
    // extended.
    // Read past the prose, which argues about `Decoration.replace` at length
    // and would otherwise answer this question with the word rather than the
    // code — the failure mode `cssRule`'s own comment catalogues.
    const src = readSrc("fence-cursor").replace(/^\s*\/\/.*$/gm, "");
    expect(src).not.toContain("Decoration");
    expect(src).toContain("EditorView.atomicRanges");
    // And it reuses the reconciler's fence parser rather than scanning for
    // backticks a second time — see the documentation case above.
    expect(src).toContain('import { segment } from "../core/layout"');
  });
});
