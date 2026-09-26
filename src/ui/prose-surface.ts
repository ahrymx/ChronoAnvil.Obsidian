// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// ── PROSE READS AS A SECTION WITHOUT BEING ONE (1.0.38) ──────────────────
//
// *"can prose sections gain a very minimal background so they fit the section
// aesthetic of chronoanvil? It is important that prose is not put into a code
// block so that standard markdown syntax still works."*
//
// The second sentence is the constraint and it is already satisfied by the
// shape prose has had since 5.6: two HTML comments around ORDINARY markdown.
// Nothing in this file writes to a note. It adds a class to rows that are
// already being drawn, so a heading is still a heading, a wikilink still
// resolves, a task still ticks, and a reader who uninstalls the plugin is left
// with exactly the text they typed.
//
// ── WHY TWO PAINTERS AND NOT ONE ─────────────────────────────────────────
//
// `headerbar.ts::markSectionBodies` paints a section's run of blocks in BOTH
// modes off one DOM walk, and the obvious move was to add prose to it. It does
// not work, and the reason is worth writing down so nobody tries again:
//
//   READING MODE renders each marker as a real block that draws nothing —
//   `rendersSomething` says so in as many words — so the two edges are findable
//   in the DOM.
//
//   LIVE PREVIEW has no such element. `marker-lines.ts` hides each marker with
//   a replace decoration that takes the line break with it, so the marker's own
//   `.cm-line` is merged into the row above and there is nothing left to find.
//
// So the DOM can answer the question in one mode and not the other, and the
// FILE can answer it in both. `proseSurfaceSpans` is that one answer, and what
// follows is two ways of putting a class where it says.
//
// ── THE SAME CLASS IN BOTH, WHICH IS NOT A COINCIDENCE ───────────────────
//
// A section's surface is painted on blocks in reading mode and on `.cm-line`s
// in Live Preview, with one class and one set of declarations — the stylesheet
// comment at `70-section-surface.css` explains why it is at block level at all.
// Prose is the same shape of problem, so it takes the same shape of answer: one
// class, the ends carrying the rounding, and the geometry declared once.
//
// ── `is-prose-first` RATHER THAN `is-first` ──────────────────────────────
//
// The section pass writes `is-first`/`is-last` on EVERY block of the note, as a
// toggle against its own answer — *"cleared every pass, not accumulated"*. A
// prose block is not a section member, so that pass would compute `false` for
// it and strip an `is-first` this file had just written, on whichever pass ran
// last. Two owners, one class, and a race nobody would ever reproduce twice.
// Distinct names make the two passes unable to touch each other's work.

import { editorLivePreviewField, type MarkdownPostProcessorContext } from "obsidian";
import {
  EditorState,
  StateField,
  type Extension,
  type Range,
  type Text,
} from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

import { proseSurfaceSpans } from "../journals/journal-sections";

/** The surface's three classes, spelled once. */
export const PROSE_BLOCK_CLASS = "ca-prose-block";
export const PROSE_FIRST_CLASS = "is-prose-first";
export const PROSE_LAST_CLASS = "is-prose-last";

/** Whether a run of lines is inside a prose block, and which ends it carries. */
export interface ProseMark {
  member: boolean;
  first: boolean;
  last: boolean;
}

const NOT_PROSE: ProseMark = { member: false, first: false, last: false };

// Where a block of `lineStart..lineEnd` stands in this note's prose.
//
// INCLUSIVE AT BOTH ENDS AND OVERLAP-BASED, because a rendered block is a RANGE
// of lines and the question is whether it is inside one — a paragraph, a list
// and a fenced code block are each one block spanning several lines, and a
// table is one block spanning as many as it has rows.
//
// `<=` / `>=` ON THE ENDS RATHER THAN `===`, for the case that actually occurs:
// the composer writes a blank line after the opener, so the first block of the
// writing starts at `span.from` exactly — but a reader who deletes that blank
// makes it start one line earlier and the block would stop carrying the
// rounding. The wider test is right for the same reason `computeSectionRuns`
// falls back to index 0: the ends belong to whatever block reaches them.
export function proseMarkFor(
  text: string,
  lineStart: number,
  lineEnd: number
): ProseMark {
  const spans = proseSurfaceSpans(text.split("\n"));
  const span = spans.find((s) => lineStart <= s.to && lineEnd >= s.from);
  if (!span) return NOT_PROSE;
  return {
    member: true,
    first: lineStart <= span.from,
    last: lineEnd >= span.to,
  };
}

// ── READING MODE ─────────────────────────────────────────────────────────

// `getSectionInfo` RETURNS NULL AND THAT IS AN ANSWER, not a failure —
// `header-title.ts` states the rule when it first used this API. An embed, an
// export, a dashboard plugin calling `MarkdownRenderer.render`: none of them is
// the note, and prose rendered there is somebody else's page. Nothing is
// painted, the words are unchanged, and the reader loses a background rather
// than gaining a stripe in the middle of a quote.
export function paintProse(
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext
): void {
  const info = ctx.getSectionInfo(el);
  if (!info) return;
  const mark = proseMarkFor(info.text, info.lineStart, info.lineEnd);
  // TOGGLES RATHER THAN ADDS, for `markSectionBodies`' reason one file over: a
  // post-processor runs again over a block Obsidian re-renders in place, and a
  // class that is only ever added is a surface that outlives the marker a
  // reader deleted.
  el.toggleClass(PROSE_BLOCK_CLASS, mark.member);
  el.toggleClass(PROSE_FIRST_CLASS, mark.first);
  el.toggleClass(PROSE_LAST_CLASS, mark.last);
}

// ── LIVE PREVIEW ─────────────────────────────────────────────────────────

// A LINE DECORATION, WHICH IS THE ONE KIND THAT CAN DO THIS. A mark decoration
// wraps the text and would paint the words rather than the row; a widget
// inserts something that is not in the file. `Decoration.line` puts a class on
// the `.cm-line` element CodeMirror already draws, which is the same element
// the section pass marks and therefore the same geometry.
//
// NO LINE BREAK IS REPLACED HERE, unlike `marker-lines.ts`, so this could have
// been a view plugin. It is a state field anyway: the two extensions answer
// from the same document at the same moment, and one of them being a frame
// behind the other is exactly the kind of flicker that gets reported as
// "sometimes the background is one line short".
// ── A TABLE AT EITHER END TAKES THE BLANK BESIDE IT (1.0.40) ────────────
//
// *"if a table is at the bottom of the prose block no surface exists until a
// new line with text is created below it."* The span stops at its last
// non-blank line, and in Live Preview that line is a table row — which
// Obsidian replaces with a widget, and a line decoration on a replaced line is
// never drawn. So the run had no last line at all: nothing carried
// `is-prose-last`, and the stylesheet's "painted prose after me" half, which
// is how a table is reached, had nothing to find either.
//
// The answer is to end the run on a row that IS drawn: the blank line between
// the table and the closer, which the composer writes and the select-all guard
// keeps. It is inside the bracket by construction — the span was trimmed to
// the last non-blank line, so the next line is either blank or the closer.
// The top is the same case upside down. Reading mode is untouched: there a
// table is a block of its own and carries the classes itself.
//
// ── AND A `$$` BLOCK IS THE SAME ROW (1.0.41) ───────────────────────────
//
// *"ChronoAnvil's Prose blocks need to support LaTeX."* Display maths is the
// second thing Live Preview mounts instead of drawing, and it arrived at this
// function as the table's bug word for word: a cheat sheet that ends on an
// equation had no last line, so nothing carried `is-prose-last` and the card
// stopped above the maths. So the rule is not "a table row" any more, it is
// A ROW LIVE PREVIEW DOES NOT DRAW — one predicate, two shapes, and the next
// one Obsidian mounts is a line in `mountedLines` rather than a third arm on
// an expression.
//
// EVERY LINE OF THE BLOCK, whether or not Obsidian replaces a one-line
// `$$ x $$` (it draws that one inside the row, and the multi-line form as a
// widget). Both answers are safe: where the row is replaced this is the fix,
// and where it is drawn the run merely ends on the blank line below it — the
// same pixel of air the table rule has already accepted since 1.0.40. Guessing
// which of the two Obsidian will do next release is what is not safe.
const TABLE_ROW = /^\s*\|/;
const MATH_EDGE = /^\s*\$\$/;
const FENCE = /^\s*(`{3,}|~{3,})/;

// Which lines of a prose block Live Preview mounts a block into rather than
// drawing as a `.cm-line`.
//
// FENCE-AWARE, for `marker-linesIn`'s reason one file over: a reader writing
// about LaTeX puts `$$` inside a ```` ``` ```` block, and a code fence's rows
// ARE drawn — they are the `HyperMD-codeblock-bg` rows the stylesheet paints.
// Counting one as mounted would step the run's end off a row that was working.
function mountedLines(lines: readonly string[]): Set<number> {
  const out = new Set<number>();
  let fence = "";
  let math = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (fence) {
      if (line.startsWith(fence)) fence = "";
      continue;
    }
    const opens = math === -1 ? line.match(FENCE) : null;
    if (opens) {
      fence = opens[1];
      continue;
    }
    if (TABLE_ROW.test(lines[i])) out.add(i);
    if (math === -1) {
      // An opener that also closes on its own row — `$$ x $$` — is one line of
      // maths and not the start of a block. `$$` alone is an opener.
      if (!MATH_EDGE.test(lines[i])) continue;
      out.add(i);
      if (!/\$\$\s*$/.test(line) || line === "$$") math = i;
      continue;
    }
    out.add(i);
    // AN UNCLOSED `$$` NEVER ENDS THE FILE'S WORTH OF LINES, which is the same
    // conservative half `proseSpansIn` states: the block is bounded by the
    // bracket the caller sliced, so a missing closer costs the run its rounding
    // and nothing else.
    if (/\$\$\s*$/.test(line)) math = -1;
  }
  return out;
}

export function livePreviewSpans(
  lines: readonly string[]
): { from: number; to: number }[] {
  const mounted = mountedLines(lines);
  return proseSurfaceSpans(lines).map(({ from, to }) => ({
    from:
      mounted.has(from) && lines[from - 1]?.trim() === "" ? from - 1 : from,
    to: mounted.has(to) && lines[to + 1]?.trim() === "" ? to + 1 : to,
  }));
}

function proseIn(doc: Text): DecorationSet {
  const out: Range<Decoration>[] = [];
  for (const span of livePreviewSpans(doc.toString().split("\n"))) {
    for (let n = span.from; n <= span.to && n < doc.lines; n++) {
      const cls = [PROSE_BLOCK_CLASS];
      if (n === span.from) cls.push(PROSE_FIRST_CLASS);
      if (n === span.to) cls.push(PROSE_LAST_CLASS);
      out.push(
        Decoration.line({ class: cls.join(" ") }).range(doc.line(n + 1).from)
      );
    }
  }
  return out.length ? Decoration.set(out) : Decoration.none;
}

interface Painted {
  live: boolean;
  deco: DecorationSet;
}

function stateOf(state: EditorState): Painted {
  // SOURCE MODE PAINTS NOTHING, which is `marker-lines.ts`' gate and the same
  // bargain: source mode is where a reader goes to see the file as it is, and a
  // surface drawn around markers that are themselves visible there would be the
  // editor disagreeing with itself about what is chrome.
  const live = state.field(editorLivePreviewField, false) === true;
  return live
    ? { live, deco: proseIn(state.doc) }
    : { live, deco: Decoration.none };
}

const prose = StateField.define<Painted>({
  create: stateOf,
  update: (value, tr) =>
    tr.docChanged ||
    (tr.state.field(editorLivePreviewField, false) === true) !== value.live
      ? stateOf(tr.state)
      : value,
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
});

export function proseSurface(): Extension {
  return prose;
}
