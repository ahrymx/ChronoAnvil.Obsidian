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
    expect(seen(ENTRY)).toBe(
      [
        "",
        "",
        "```chronoanvil",
        "entry-header",
        "```",
        "",
        "",
        "",
        "## What happened",
        "",
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
    const note = ["<!--almanac:focus", "typed", "-->", "", "%% almanac-graph %%", "%% %%"];
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
  });

  it("no longer lets notestore claim Live Preview does this itself", () => {
    // The claim stood for six releases — *"Obsidian never renders it in either
    // Reading mode or Live Preview"* — and was the reason nobody looked.
    const store = readSrc("notestore");
    expect(store).not.toContain("Reading mode or Live Preview");
    expect(store).toContain("ui/marker-lines.ts");
  });
});
