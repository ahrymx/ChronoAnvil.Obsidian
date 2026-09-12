// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// ── THE MARKERS THIS PLUGIN WROTE ARE NOT THE READER'S TEXT (5.31) ───────
//
// *"could chronoanvil hide its html fences in edit mode? the user can still
// switch to source mode if they need to touch them."*
//
// `fence-cursor.ts` answered the ```chronoanvil half of that: a fence already
// RENDERS in Live Preview, and it only fell back to source when the cursor
// landed in it. This file answers the other half, which is the one the report
// was actually about — the plugin's own markers, which Live Preview shows as
// literal text on every note that has any:
//
//   <!--chronoanvil:focus            a region: the widget's content, in a comment
//   …                                (`notestore.ts`)
//   -->
//   <!--chronoanvil-skeleton-->      a bracket: the prose skeleton's two edges
//   <!--/chronoanvil-skeleton-->     (`journal-sections.ts`, 5.6)
//   %% chronoanvil-graph %%          the hidden parent link
//   %% [[Weekly|…]] %%             the links (`note-sections.ts`, 4.68/4.81)
//   `chronoanvil:spacer`             the inert line-0 landing strip
//
// ── THE RULE, STATED ONCE ────────────────────────────────────────────────
//
// EDIT MODE SHOWS WHAT READING MODE SHOWS. Every marker above renders as
// nothing in reading view — an HTML comment and a `%%` comment are both dropped
// before the reader sees them, and the spacer's code span is swapped for a
// hairline by the inline post-processor. Live Preview is the same view of the
// same note, and it drew them because Obsidian runs no post-processor over
// inline code there and does not drop a comment it did not write. Nothing here
// changes what the FILE says; it changes only which of it the editor paints.
//
// AND ONLY WHAT THIS PLUGIN WROTE. A reader's own `<!-- note to self -->` is
// their text and stays visible, which is why every pattern below is anchored to
// a namespaced opener on a line of its own rather than to "an HTML comment".
// The one that is not a whole line — the region — takes the whole comment,
// which is exactly the extent reading mode takes.
//
// ── A REGION GOES WHOLE, MARKERS AND CONTENTS ────────────────────────────
//
// The other three shapes give up their MARKERS and keep what is between them:
// the skeleton's bracket is around the reader's own headings (5.6's whole
// argument for making it a bracket), and the graph block's second line is the
// links, which are the block. A region is the opposite — its contents are one
// widget's value, the widget is where they are edited, and a comment is where
// they were parked so a vault without the plugin still carries the words. So
// the region goes whole, and `notestore.ts`'s header comment, which claimed
// Live Preview already did this, is now true.
//
// ── WHY THE SPACER KEEPS ITS LINE ────────────────────────────────────────
//
// Every other span takes its line break with it and the line is gone. The
// spacer's is left behind empty, because an inert row for the cursor to land on
// is the spacer's ENTIRE job (`widgets/index.ts`: *"so that when a note opens
// the cursor spawns here rather than inside the first ```chronoanvil fence"*).
// Removing the line would delete the landing strip and hand the cursor straight
// back to the fence below — the exact failure the spacer exists to prevent, and
// the one `fence-cursor.ts` guards from the other side.
//
// ── HIDDEN MEANS UNREACHABLE, WHICH IS WHY THE RANGES ARE ATOMIC ─────────
//
// A replace decoration hides text; it does not stop a cursor sitting inside the
// hidden range, and typing there would put the reader's words inside a comment
// they cannot see. The same ranges therefore go into `EditorView.atomicRanges`,
// exactly as the fences do, so motion and deletion step over them whole.
//
// ── STATE FIELD, NOT A VIEW PLUGIN, AND THAT IS NOT A PREFERENCE ─────────
//
// These decorations replace line breaks, and CodeMirror throws
// `RangeError: Decorations that replace line breaks may not be specified via
// plugins` for any set it considers dynamic — which, in `EditorView.decorations`,
// means any provider that is a FUNCTION (`typeof d == "function"`, in its
// `DocView`). `StateField.define({ provide })` hands the facet a value, so the
// set is static and the throw does not apply. That is also why the Live Preview
// check lives INSIDE the field here while `fence-cursor.ts` can make it at read
// time: the field must already hold the right answer, so it recomputes when the
// document changes or when the mode does.

import { editorLivePreviewField } from "obsidian";
import {
  EditorSelection,
  EditorState,
  StateField,
  Transaction,
  type Extension,
  type Text,
  type TransactionSpec,
} from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

import { protectLines, redirectTyping } from "./protected-lines";

// One run of lines this plugin wrote, 0-based and inclusive.
//
// `keepLine` is the spacer's flag: hide the text, leave the row. Everything
// else takes its own line break out with it.
export interface MarkerSpan {
  from: number;
  to: number;
  keepLine: boolean;
}

// A region opener, on a line of its own — `notestore.ts`'s two prefixes, and
// the same shape `reload-loss.ts` walks with. The pre-rename spelling is here
// because the READER of a region takes both: an unmigrated vault still has its
// widgets working off `<!--almanac:`, so it still has the markers to hide.
const REGION_OPEN = /^<!--(?:chronoanvil|almanac):[A-Za-z0-9_-]+(?:\s*-->)?$/;

// A bracket edge — `bracketOpen`/`bracketClose` in `journal-sections.ts`. The
// `-` after the name is what tells a bracket from a region, and it is load
// bearing: `stripPluginMarkup` tells them apart the same way, and for the same
// reason (one keeps its contents, the other does not).
//
// NO `almanac-` HERE, unlike the region above, because there is no such marker
// to hide: brackets arrived in 5.6, five releases after the rename.
const BRACKET = /^<!--\/?chronoanvil-[A-Za-z0-9_-]+-->$/;

// The graph block's first line. Its second is the links, matched loosely
// (`%% … %%`) because what is between them is a wikilink list this file has no
// business parsing — `note-sections.ts` owns that.
const GRAPH_HEAD = /^%%\s*(?:chronoanvil|almanac)-graph\s*%%$/;
const GRAPH_LINKS = /^%%.*%%$/;

const SPACERS = ["`chronoanvil:spacer`", "`almanac:spacer`"];

const FENCE_OPEN = /^(`{3,})/;
const FENCE_SHUT = /^(`{3,})\s*$/;

// Which lines of this note are markers.
//
// FENCE-AWARE, AND FOR ONE CONCRETE REASON. `assets/documentation.md` prints
// this plugin's own markup as examples, and a four-backtick fence is how it
// prints a three-backtick one — 4.68.1 is the record of what reading that
// documentation as live markup cost. A code block's contents are literal here
// too: a reader documenting their own vault keeps every character of it.
export function markerLinesIn(lines: readonly string[]): MarkerSpan[] {
  const out: MarkerSpan[] = [];
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();

    const run = t.match(FENCE_OPEN);
    if (run) {
      const ticks = run[1].length;
      let close = -1;
      for (let j = i + 1; j < lines.length; j++) {
        const shut = lines[j].trim().match(FENCE_SHUT);
        if (shut && shut[1].length >= ticks) {
          close = j;
          break;
        }
      }
      // An unterminated fence is not a fence, the same call `segment` makes:
      // the note is malformed and guessing where it ends is how a walk eats the
      // rest of the file. The ``` line is prose, and prose is never a marker.
      i = close === -1 ? i + 1 : close + 1;
      continue;
    }

    if (REGION_OPEN.test(t)) {
      if (t.endsWith("-->")) {
        out.push({ from: i, to: i, keepLine: false });
        i++;
        continue;
      }
      let close = -1;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].includes("-->")) {
          close = j;
          break;
        }
      }
      // AN UNCLOSED REGION STAYS VISIBLE, which is the conservative half of the
      // same rule `bracketSpanIn` states: a span that stops early leaves text
      // alone and a span that runs long swallows it. A reader looking at a
      // region whose `-->` they deleted needs to SEE it to put it back.
      if (close === -1) {
        i++;
        continue;
      }
      out.push({ from: i, to: close, keepLine: false });
      i = close + 1;
      continue;
    }

    if (BRACKET.test(t)) {
      out.push({ from: i, to: i, keepLine: false });
      i++;
      continue;
    }

    if (GRAPH_HEAD.test(t)) {
      const linked = i + 1 < lines.length && GRAPH_LINKS.test(lines[i + 1].trim());
      const to = linked ? i + 1 : i;
      out.push({ from: i, to, keepLine: false });
      i = to + 1;
      continue;
    }

    if (SPACERS.includes(t)) {
      out.push({ from: i, to: i, keepLine: true });
      i++;
      continue;
    }

    i++;
  }
  return merged(out, lines);
}

// Adjacent, or with one blank line between them.
function joins(last: MarkerSpan, span: MarkerSpan, lines: readonly string[]): boolean {
  if (last.to + 1 === span.from) return true;
  return last.to + 2 === span.from && lines[last.to + 1].trim() === "";
}

// Touching runs joined into one.
//
// TWO REPLACE DECORATIONS MUST NOT OVERLAP, and two adjacent runs would: the
// span for a run that starts at line 0 has to eat the break AFTER it (there is
// none before), and the span for any other run eats the break BEFORE it, so a
// run at line 0 followed by a run at line 1 would claim the same break twice.
// Joining first is one rule instead of a case analysis at the offsets.
//
// A SINGLE BLANK LINE BETWEEN TWO RUNS JOINS THEM TOO, and that is not the same
// rule wearing a wider hat — it is the fix for what the bottom of a note looked
// like. A run swallows the break BEFORE itself, so the blank separator above it
// survives as a painted row, and a diary entry ends in seven empty regions one
// blank apart (`entry-sections.ts`) and therefore ended in eight identical empty
// rows. A reader cannot tell which of those are their note and which are ours,
// which is the whole of the report this answers: *"the user can accidentally put
// the cursor into these hidden blocks and start typing their prose there
// unknowingly."* Joined, the stack paints as the one separator that follows the
// last card.
//
// THE BLANK HAS TO BE BLANK, AND THAT IS THE SAFETY ARGUMENT. The moment a
// reader types on one of those separators the line stops matching and the two
// runs stay apart, so their words are painted like any other prose. This can
// never swallow something that was written. It is also why the skeleton's
// headings are safe on both sides: the bracket's opener joins the regions above
// it and its closer joins the graph block below, and the lines between the two
// brackets are not blank.
//
// NOTHING DOWNSTREAM HAD TO MOVE. A joined span is still one run, so
// `hiddenRanges` takes it through the same case B it took each half through, and
// the result is one strictly larger range where there were two — which cannot
// overlap anything. `protectedRanges` was already joining these: a run's
// `last.to + 1` lands exactly on the next run's `doc.line(span.from).to` when
// the line between is empty, and its own join clause absorbed that. What
// survives a select-all is therefore the same text before and after.
function merged(spans: MarkerSpan[], lines: readonly string[]): MarkerSpan[] {
  const out: MarkerSpan[] = [];
  for (const span of spans) {
    const last = out[out.length - 1];
    if (last && !last.keepLine && !span.keepLine && joins(last, span, lines)) {
      last.to = span.to;
      continue;
    }
    out.push({ ...span });
  }
  return out;
}

// The spans as character ranges.
//
// A LINE IS ONLY GONE IF ITS BREAK GOES WITH IT. Replacing just the line's text
// leaves an empty row where the marker was, which is right for the spacer and
// wrong for everything else — a note would gain a blank line per marker. So a
// removed run takes the break BEFORE it (joining it onto the line above), or,
// when it starts the document and something follows, the break AFTER it.
//
// AND EACH RANGE NAMES THE END A CURSOR MAY REST AT. `atomicRanges` steps motion
// over a range whole, but it leaves the range's own two endpoints legal — that
// is where the step lands — and for a run below line 0 the far endpoint sits
// immediately after the `-->`, on a line the reader cannot see. Both endpoints
// paint at the SAME screen point there, the end of the visible line above, so
// naming one of them and mapping the other onto it is invisible to the reader
// and closes the position they were typing into blind.
//
// It is the range's `from` for three of the four shapes and its `to` for the
// one that starts the document, which is the same asymmetry the ranges
// themselves have: whichever end is outside the marker text is the one to rest
// at. The spacer and an all-markers note have no end that is outside — every
// character of the line is ours — so they name their start and `redirectTyping`
// takes it from there.
interface HiddenRange {
  from: number;
  to: number;
  safe: number;
}

function hiddenRanges(doc: Text, spans: readonly MarkerSpan[]): HiddenRange[] {
  return spans.map((span) => {
    const first = doc.line(span.from + 1);
    const last = doc.line(span.to + 1);
    if (span.keepLine) return { from: first.from, to: last.to, safe: first.from };
    if (span.from > 0) {
      const from = doc.line(span.from).to;
      return { from, to: last.to, safe: from };
    }
    if (span.to + 1 < doc.lines) {
      const to = doc.line(span.to + 2).from;
      return { from: first.from, to, safe: to };
    }
    return { from: first.from, to: last.to, safe: first.from };
  });
}

// Where a cursor asking for `pos` actually belongs.
function restingAt(pos: number, ranges: readonly HiddenRange[]): number {
  for (const r of ranges) if (pos >= r.from && pos <= r.to) return r.safe;
  return pos;
}

function hiddenIn(doc: Text, spans: readonly MarkerSpan[]): DecorationSet {
  const ranges = hiddenRanges(doc, spans);
  if (!ranges.length) return Decoration.none;
  return Decoration.set(ranges.map((r) => HIDE.range(r.from, r.to)));
}

// No widget, no class: the range renders as nothing at all, the way reading
// mode renders it.
const HIDE = Decoration.replace({});

interface Hidden {
  live: boolean;
  // The marker lines, kept beside the ranges drawn from them. The change filter
  // protects whole LINES with the break at each end, which is wider than what
  // is hidden — `protected-lines.ts` argues why — and parsing once is what
  // stops the two answers drifting apart.
  spans: MarkerSpan[];
  deco: DecorationSet;
}

function stateOf(state: EditorState): Hidden {
  const live = state.field(editorLivePreviewField, false) === true;
  if (!live) return { live, spans: [], deco: Decoration.none };
  const spans = markerLinesIn(state.doc.toString().split("\n"));
  return { live, spans, deco: hiddenIn(state.doc, spans) };
}

// SOURCE MODE IS THE ESCAPE HATCH, and it is the whole permission this feature
// was granted on. `registerEditorExtension` is vault-wide and mode-blind, so
// without this check the markers would be unreachable in the one mode the
// reader named as the way to reach them. Absent (an editor that is not
// Obsidian's markdown one), nothing is hidden, which is the safe direction.
const markers = StateField.define<Hidden>({
  create: stateOf,
  update: (value, tr) =>
    tr.docChanged || (tr.state.field(editorLivePreviewField, false) === true) !== value.live
      ? stateOf(tr.state)
      : value,
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
});

// WHERE THE CURSOR COMES TO REST, which is a selection-only transaction — a
// click, an arrow, a search hit, a restored cursor. `atomicRanges` is consulted
// by the VIEW (`moveByChar`, `skipAtomsForSelection`) and its whole answer is
// "step over this range", so the position it steps to is one of the range's own
// endpoints and one of those is inside a line the reader cannot see. A reader
// who clicks the end of a visible line and presses the right arrow once used to
// land there, and the keystroke that followed went into a comment.
//
// A DOC-CHANGING TRANSACTION IS SOMEBODY ELSE'S. Its selection comes from the
// change, which `protectLines` has already refused or `redirectTyping` has
// already moved, and re-parsing the note on every keystroke to second-guess
// that would cost more than it buys.
//
// CURSORS ONLY, NOT SELECTIONS. A drag that spans a hidden run is the select-all
// shape, and forcing its ends onto a resting point would silently shrink what
// the reader had selected. That case is `protected-lines.ts`'.
function cursorRest(): Extension {
  return EditorState.transactionFilter.of((tr) => {
    const sel = tr.selection;
    if (tr.docChanged || !sel) return tr;
    const hidden = tr.startState.field(markers, false);
    if (!hidden?.live || !hidden.spans.length) return tr;

    const ranges = hiddenRanges(tr.startState.doc, hidden.spans);
    let moved = false;
    const next = sel.ranges.map((r) => {
      if (!r.empty) return r;
      const at = restingAt(r.head, ranges);
      if (at === r.head) return r;
      moved = true;
      return EditorSelection.cursor(at);
    });
    if (!moved) return tr;

    const spec: TransactionSpec = {
      selection: EditorSelection.create(next, sel.mainIndex),
      effects: tr.effects,
      scrollIntoView: tr.scrollIntoView,
    };
    const event = tr.annotation(Transaction.userEvent);
    if (event) spec.userEvent = event;
    return spec;
  });
}

export function hiddenMarkers(): Extension {
  return [
    markers,
    EditorView.atomicRanges.of(
      (view) => view.state.field(markers, false)?.deco ?? Decoration.none
    ),
    cursorRest(),
    // AND A KEYSTROKE AIMED AT THE SPACER LANDS BELOW IT. Only the `keepLine`
    // runs are handed over, because they are the only ones whose resting point
    // is itself inside marker text — the spacer's row is the landing strip, so
    // the cursor is MEANT to be there and the words have to go somewhere.
    redirectTyping(
      (state) => state.field(markers, false)?.spans.filter((s) => s.keepLine) ?? []
    ),
    // AND WHAT IS HIDDEN DOES NOT GO WITH A SELECT-ALL. 5.31.1, and the sharper
    // half of that rule here than on a fence: a fence is recomposed by *Set up
    // / repair vault* and the graph block is rewritten on the next render, but
    // a region holds the reader's own words and nothing puts those back.
    protectLines((state) => state.field(markers, false)?.spans ?? []),
  ];
}
