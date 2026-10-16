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

import {
  editorInfoField,
  editorLivePreviewField,
  type MarkdownPostProcessorContext,
} from "obsidian";
import {
  EditorState,
  StateEffect,
  StateField,
  type Extension,
  type Range,
  type Text,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";

import type ChronoAnvilPlugin from "../main";
import { proseSurfaceSpans, type ProseSurface } from "../journals/journal-sections";
import {
  buildProseBar,
  clearProseBar,
  FOLD_HIDDEN_CLASS,
  proseFolded,
  PROSE_BAR_HOST_CLASS,
  PROSE_SHUT_CLASS,
} from "./prose-bar";
import { protectLines, type LineSpan } from "./protected-lines";

/** The surface's three classes, spelled once. */
export const PROSE_BLOCK_CLASS = "ca-prose-block";
export const PROSE_FIRST_CLASS = "is-prose-first";
export const PROSE_LAST_CLASS = "is-prose-last";

// ── THE HEAD IS AN ATTRIBUTE AND THE STYLESHEET DRAWS IT (1.0.75) ────────
//
// *"can we give the prose blocks a header like other sections?"*
//
// A section's head is an ELEMENT, built by a renderer into a fence's widget.
// Prose has no widget to build into: in reading mode it is the note's own
// blocks, and in Live Preview it is `.cm-line`s CodeMirror owns and measures.
// The two ways to put an element there are both worse than they look — a block
// widget in the editor is a new atomic range for the cursor to meet at the top
// of the reader's writing, and a `::before` is neither.
//
// SO THE NAME TRAVELS AS DATA AND THE RULE DRAWS IT. One attribute on the row
// that already carries `is-prose-first`, `content: attr(…)` in the stylesheet,
// and the head is identical in both modes because it is the same declaration
// over the same class — which is the whole architecture of this file applied
// once more rather than a new one.
//
// WHAT IT COSTS, SAID PLAINLY: a head drawn this way holds text and nothing
// else. No chevron, no tools. A fold would have to hide the reader's own lines,
// and `headerbar.ts` already refuses to do that in Live Preview — *"A SOURCE
// LINE IS NEVER HIDDEN, only painted"* — so a chevron here would act in reading
// mode and sit dead in the editor, which is the control 1.0.73 was about.
// Renaming is in *Edit sections…*, where every other section's title is.
//
// ── AND THAT COST CAME DUE: THE HEAD IS AN ELEMENT NOW (1.0.78) ──────────
//
// *"can a collapse chevron and gear cog (for prose section editor/commands
// window) be added to the new title row on the prose blocks?"* — *"I think
// prose blocks could definetely benefit from the cog."*
//
// A COG IS A BUTTON AND A BUTTON NEEDS A NODE, so the attribute is gone and
// `ui/prose-bar.ts` builds the row. The chevron stays refused, on the argument
// above — which is the paragraph this one amends rather than deletes: the
// prediction was right about what a pseudo-element can hold, and the answer was
// to stop using one, not to go without the control.
//
// THE TWO MODES HOST IT DIFFERENTLY, AND THAT IS THIS FILE'S OWN SHAPE. The
// painters already put one class on two different kinds of element, for the
// reason at the top of this file:
//
//   READING MODE prepends the bar into the block that carries
//   `is-prose-first` — the very row the pseudo-element was drawn on, so the
//   geometry a reader sees is unchanged and the card's top edge is still the
//   first thing in it.
//
//   LIVE PREVIEW cannot: that row is a `.cm-line` whose content CodeMirror
//   owns, and anything prepended into one is gone on the next keystroke. So
//   the bar is a BLOCK WIDGET above it, and the widget takes the card's top
//   edge — `is-prose-first` moves onto the widget and off the line.
//
// A BLOCK WIDGET IS NOT A NEW ATOMIC RANGE, which is the one claim above that
// was simply wrong. `Decoration.widget({ block: true })` is a point: it has no
// length, adds no document position, and CodeMirror already keeps a cursor out
// of one ("if a position is in/near a block widget, move it to a nearby text
// line"). What it is instead is a row of chrome with no line under it, which is
// what a title row is.
//
// AND THE MARKER'S OWN LINE IS STILL NOT THE HOST, which was the other candidate
// and reads better than it works. In reading mode the opener renders as a block
// that draws nothing and could hold the bar; in Live Preview `marker-lines.ts`
// replaces that line AND the break before it, so there is no row there at all.
// Hosting on it would mean one owner in one mode and a second mechanism in the
// other — against a pseudo-element's single declaration, which the reader has
// been looking at since 1.0.75 and which this keeps.

/** Whether a run of lines is inside a prose block, and which ends it carries. */
export interface ProseMark {
  member: boolean;
  first: boolean;
  last: boolean;
  /** The head this block wears, on the first row of it only. */
  head: string | null;
  /** Which prose block of the note it is, or 0 for a run that is in none. */
  nth: number;
  // THE NAME ON THE MARKER, which is half the fold's key and is NOT `head` —
  // see `ProseSurface.title`, whose word this is deliberately: the two shapes
  // are handed to the same `proseFoldKey` and a second spelling of one field
  // would be a cast at the place they meet. On every row of the block rather than the first
  // one only, because a fold is a property of the BLOCK: the sibling walk that
  // hides the rest of the run reads the class and the record, and a member row
  // that could not say which block it is in would have to ask the file again.
  /** The title on the marker, or null where the reader has not named the block. */
  title: string | null;
}

const NOT_PROSE: ProseMark = {
  member: false,
  first: false,
  last: false,
  head: null,
  nth: 0,
  title: null,
};

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
  const first = lineStart <= span.from;
  return {
    member: true,
    first,
    last: lineEnd >= span.to,
    // ONLY THE FIRST ROW CARRIES IT, which is what makes the head one head: the
    // bar is prepended into the block that draws the card's top edge, and a
    // head on every row would be one bar per paragraph.
    head: first ? span.head : null,
    nth: span.nth,
    title: span.title,
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
  ctx: MarkdownPostProcessorContext,
  plugin: ChronoAnvilPlugin
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
  // AND THE FOLD IS READ FROM THE RECORD ON EVERY PAINT (1.0.79), which is what
  // makes a folded block still folded after a re-render, a reopen or a restart
  // — the chevron's own sibling walk is the same answer arriving sooner. A row
  // in no block is never folded: `member` is false and the key would be the
  // ordinal 0's.
  const shut = mark.member && proseFolded(plugin, ctx.sourcePath, mark);
  // THE FIRST BLOCK CANNOT SIMPLY BE HIDDEN — it is holding the bar. So it hides
  // its own children and keeps the bar (`is-prose-shut`, one stylesheet rule),
  // and every block after it in the run goes whole.
  el.toggleClass(PROSE_SHUT_CLASS, shut && mark.first);
  el.toggleClass(FOLD_HIDDEN_CLASS, shut && !mark.first);
  // AND THE BAR IS TAKEN OFF A ROW THAT HAS STOPPED BEING THE TOP OF THE BLOCK,
  // for the toggles' reason exactly: a re-render in place that only ever BUILT
  // one would leave a title row stranded in the middle of the writing. Built
  // where there is a head and cleared where there is not — the two halves of
  // one answer, and `#bare` is the answer that is always the second half.
  if (mark.head === null) {
    clearProseBar(el);
    return;
  }
  buildProseBar(
    el,
    {
      title: mark.head,
      nth: mark.nth,
      name: mark.title,
      shut,
      path: () => ctx.sourcePath,
      redraw: (next) => applyProseFold(el, next),
    },
    plugin
  );
}

// Reading mode's redraw, which is a sibling walk and not a second paint.
//
// OBSIDIAN GIVES A POST-PROCESSOR NO SECOND PASS for something that changed no
// markdown, so pressing the chevron has to do the work the next render would.
// It is the same work: the host hides its own children and keeps the bar, and
// every block after it that is still a member of the run goes. `paintProse`
// re-asserts all of it from the record on the next real render, which is what
// makes this safe to do locally rather than holistically — the two cannot
// disagree about the ANSWER, only about when they arrive at it.
//
// THE RUN ENDS WHERE THE CLASS DOES, which is the one thing a sibling walk has
// to get right: a prose block's members are consecutive siblings carrying
// `PROSE_BLOCK_CLASS`, and the first sibling that does not carry it is the next
// section — or the second prose block, which has a bar of its own and a fold of
// its own and must not be taken by this one. `is-prose-first` is what says so.
export function applyProseFold(host: HTMLElement, shut: boolean): void {
  host.toggleClass(PROSE_SHUT_CLASS, shut);
  let next = host.nextElementSibling;
  while (
    next instanceof HTMLElement &&
    next.hasClass(PROSE_BLOCK_CLASS) &&
    !next.hasClass(PROSE_FIRST_CLASS)
  ) {
    next.toggleClass(FOLD_HIDDEN_CLASS, shut);
    next = next.nextElementSibling;
  }
}

// ── LIVE PREVIEW ─────────────────────────────────────────────────────────

// A FOLD CHANGES NO DOCUMENT, so nothing would ask the field anything (1.0.79).
//
// The field below recomputes on a document change and on the mode flipping, and
// a chevron press is neither: the record moved and the text did not. So the
// press dispatches this, the field's `update` watches for it, and the whole
// paint is derived from the record exactly as it is on a reopen. The effect
// carries no payload — it is "ask again", not "the answer is X", which is what
// keeps one reader of the record rather than two.
export const proseFoldEffect = StateEffect.define<null>();

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

export function livePreviewSpans(lines: readonly string[]): ProseSurface[] {
  const mounted = mountedLines(lines);
  return proseSurfaceSpans(lines).map((span) => ({
    ...span,
    from:
      mounted.has(span.from) && lines[span.from - 1]?.trim() === ""
        ? span.from - 1
        : span.from,
    to:
      mounted.has(span.to) && lines[span.to + 1]?.trim() === ""
        ? span.to + 1
        : span.to,
    // THE HEAD AND THE ORDINAL RIDE THROUGH UNCHANGED, which is what `...span`
    // says: this function moves the ENDS of a run and nothing else. The bar
    // goes above whichever row the run now starts on — a block opening on a
    // table or a `$$` has already stepped its start up onto the blank line
    // above it, because a replaced row draws no line decoration, and a bar
    // anchored to a row that is never drawn is a bar nobody sees.
  }));
}

// The bar, as a row of the editor that is not a row of the file.
//
// `eq` COMPARES WHAT IS DRAWN, which is the whole of why this is cheap: the
// field recomputes on every document change, and a widget that claimed to be
// different every time would rebuild the DOM — and drop the focus ring off a
// cog mid-keystroke — on each one. Title and ordinal are everything the bar
// shows, and the FILE is deliberately not among them: it is read at the press.
//
// `ignoreEvent` RETURNS TRUE, which is what makes the cog pressable. Without
// it CodeMirror treats a click inside the widget as a click on the position the
// widget sits at, so the button would open the window AND put the cursor on the
// first row of the writing — the same one-gesture-one-meaning rule the cog's
// own `stopPropagation` states from the other side.
class ProseBarWidget extends WidgetType {
  constructor(
    private readonly title: string,
    private readonly nth: number,
    private readonly name: string | null,
    private readonly shut: boolean,
    private readonly plugin: ChronoAnvilPlugin
  ) {
    super();
  }

  eq(other: ProseBarWidget): boolean {
    return (
      other.title === this.title &&
      other.nth === this.nth &&
      // AND WHETHER IT IS FOLDED (1.0.79), because that is drawn: the chevron
      // turns over and the bar loses the hairline under it. Left out, the
      // widget would claim to be the same bar and CodeMirror would keep the
      // old DOM while the lines under it vanished.
      other.shut === this.shut
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const host = createDiv({
      cls: [PROSE_BLOCK_CLASS, PROSE_FIRST_CLASS, PROSE_BAR_HOST_CLASS].join(" "),
    });
    // A FOLDED RUN HAS NO ROWS LEFT, so the widget is the whole card and takes
    // the bottom edge as well as the top. `is-prose-last` is not set on the
    // lines in that case — there are none drawn.
    host.toggleClass(PROSE_LAST_CLASS, this.shut);
    buildProseBar(
      host,
      {
        title: this.title,
        nth: this.nth,
        name: this.name,
        shut: this.shut,
        // THE EFFECT AND NOT A DOM WALK, which is reading mode's answer and
        // cannot be this one: the rows are CodeMirror's and the replace range
        // that hides them is the field's. Dispatching makes the field read the
        // record again and rebuild from it.
        redraw: () => view.dispatch({ effects: proseFoldEffect.of(null) }),
        // THE FILE THE EDITOR IS SHOWING, ASKED WHEN THE COG IS PRESSED.
        // `editorInfoField` is how a CM6 extension learns its note — the view
        // is the only thing that knows, a widget outlives the state it was
        // built from, and an embed or a hover preview has no file at all, which
        // is the null the cog declines on.
        path: () => view.state.field(editorInfoField, false)?.file?.path ?? null,
      },
      this.plugin
    );
    return host;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

// What a folded block hides, as one range, and why that range starts where it
// does.
//
// IT TAKES THE BREAK BEFORE THE RUN, NOT THE BREAK AFTER IT, and that is
// `marker-lines.ts::hiddenRanges`' own asymmetry rather than a taste. A range
// over `[firstLine.from, lastLine.to]` leaves both breaks standing, so the fold
// would collapse the writing and leave one empty row where it was. Taking the
// leading break instead merges the whole run upward into the opener's row —
// which is itself already merged into the line above it, because the markers'
// own range took ITS leading break for the same reason.
//
// AND THE TWO RANGES TOUCH RATHER THAN OVERLAP. The markers' range ends at the
// opener line's `.to`; this one begins there. Two replace ranges from two state
// fields sharing one endpoint is composition, which CodeMirror does; two that
// overlapped would be a conflict neither field could see.
//
// `span.from > 0` IS ALWAYS TRUE and is asserted anyway: a prose surface is the
// writing INSIDE two markers, so there is always an opener above it. A run that
// started the document would have no leading break to take and would need the
// trailing one, which is the shape `hiddenRanges` keeps a branch for.
//
// AND IT TAKES A `{ from, to }` RATHER THAN A `ProseSurface`, which is the only
// reason `foldedSet` can call it. The decoration that HIDES a run and the atomic
// range that stops a cursor reaching into it have to be the same two offsets, and
// a second copy of this expression is how they would come apart — a narrower
// atomic range leaves a position inside hidden text that an arrow key still
// reaches, which is invisible until a reader types there.
function foldedRange(
  doc: Text,
  span: { from: number; to: number }
): { from: number; to: number } | null {
  if (span.from <= 0 || span.from > span.to || span.to + 1 > doc.lines) return null;
  return { from: doc.line(span.from).to, to: doc.line(span.to + 1).to };
}

interface ProsePaint {
  deco: DecorationSet;
  // The folded runs as whole LINES, which is what both guards are given. Line
  // numbers rather than offsets because `protectLines` takes a `LineSpan` and
  // `atomicRanges` is built from the same two lines one call later — one list,
  // read twice, so the thing the cursor steps over and the thing a keystroke is
  // refused on cannot come apart.
  shut: LineSpan[];
}

function proseIn(doc: Text, plugin: ChronoAnvilPlugin, path: string | null): ProsePaint {
  const out: Range<Decoration>[] = [];
  const shut: LineSpan[] = [];
  for (const span of livePreviewSpans(doc.toString().split("\n"))) {
    // A BLOCK WITH NO HEAD HAS NO CHEVRON AND THEREFORE NO FOLD (1.0.79). The
    // control lives on the title row, so a `#bare` block cannot be folded and
    // a note written before the markers existed has no block to fold at all.
    // Reaching the record anyway would let a fold survive the head being
    // turned off, with nothing on screen to turn it back.
    const folded =
      span.head !== null && proseFolded(plugin, path, span) && foldedRange(doc, span) !== null;
    if (folded) {
      const range = foldedRange(doc, span);
      if (range) {
        shut.push({ from: span.from, to: span.to });
        out.push(HIDE_RUN.range(range.from, range.to));
      }
    } else {
      for (let n = span.from; n <= span.to && n < doc.lines; n++) {
        const cls = [PROSE_BLOCK_CLASS];
        // THE TOP EDGE IS THE BAR'S WHERE THERE IS A BAR (1.0.78). Two elements
        // carrying `is-prose-first` would be two rounded tops and two paddings,
        // one of them in the middle of the card — so the line gets it only on a
        // block that draws no head, which is `#bare` and every block written
        // before 1.0.75.
        if (n === span.from && span.head === null) cls.push(PROSE_FIRST_CLASS);
        if (n === span.to) cls.push(PROSE_LAST_CLASS);
        out.push(Decoration.line({ class: cls.join(" ") }).range(doc.line(n + 1).from));
      }
    }
    if (span.head === null || span.from >= doc.lines) continue;
    out.push(
      Decoration.widget({
        widget: new ProseBarWidget(span.head, span.nth, span.title, folded, plugin),
        // ABOVE THE ROW, NOT BESIDE IT. `block` makes the widget a row of its
        // own between two lines, and a negative `side` puts it before the line
        // it is anchored to — the two halves of "draw this above the writing".
        block: true,
        side: -1,
      }).range(doc.line(span.from + 1).from)
    );
  }
  // SORTED, because a widget and the line decoration beside it are pushed in
  // the order the loop meets them and `Decoration.set` is handed both.
  return { deco: out.length ? Decoration.set(out, true) : Decoration.none, shut };
}

// The folded writing renders as nothing at all, the way reading mode renders a
// hidden block — no widget, no class, and `marker-lines.ts`' own `HIDE` one
// file over is the same decoration for the same reason.
//
// NOT `block: true`. A block replace would take the rows out of the layout as a
// unit and is the obvious reading of "fold these lines"; the inline form is the
// one this plugin has shipped since 5.31 and the one the markers are drawn with,
// and it composes with them at the shared endpoint. The proven shape wins over
// the tidy one on a range that is hiding the reader's own writing.
const HIDE_RUN = Decoration.replace({});

interface Painted {
  live: boolean;
  deco: DecorationSet;
  /** The folded runs, as whole lines. Empty in source mode, where nothing folds. */
  shut: readonly LineSpan[];
}

const NOTHING_PAINTED: Painted = { live: false, deco: Decoration.none, shut: [] };

function stateOf(state: EditorState, plugin: ChronoAnvilPlugin): Painted {
  // SOURCE MODE PAINTS NOTHING, which is `marker-lines.ts`' gate and the same
  // bargain: source mode is where a reader goes to see the file as it is, and a
  // surface drawn around markers that are themselves visible there would be the
  // editor disagreeing with itself about what is chrome.
  //
  // AND A FOLD IS PART OF THAT BARGAIN AS OF 1.0.79. Source mode shows the file,
  // so it shows the writing — a fold there would be the one place in the plugin
  // where "see the file as it is" hid some of it. The record is untouched, so
  // flipping back to Live Preview restores every fold the reader had.
  const live = state.field(editorLivePreviewField, false) === true;
  if (!live) return NOTHING_PAINTED;
  const path = state.field(editorInfoField, false)?.file?.path ?? null;
  const { deco, shut } = proseIn(state.doc, plugin, path);
  return { live, deco, shut };
}

// A FIELD BUILT PER PLUGIN INSTANCE RATHER THAN A MODULE CONSTANT, which is the
// one thing the bar changed here. The decorations now carry a widget that has
// to be able to open a window, and a `StateField` defined at module load has
// nothing to close over. `registerEditorExtension` is called once, from
// `main.ts`, so there is exactly one of these.
//
// AND IT IS STILL A STATE FIELD RATHER THAN A VIEW PLUGIN, for the reason the
// original comment gives AND for two more now: CodeMirror refuses a block
// decoration from a plugin-provided facet — *"Block decorations may not be
// specified via plugins"* — and it refuses a replace decoration that spans a
// line break from one too, which is the fold. Both are the same gate
// (`disallowBlockEffectsFor`) and a state field is on the right side of it.
//
// ── AND IT IS THREE EXTENSIONS AS OF 1.0.79, NOT ONE ──────────────────────
//
// A folded block hides the reader's own writing, which no hidden range in this
// plugin has done before — every other one is markup the plugin wrote. So the
// field comes with the two guards `marker-lines.ts` wears for its own ranges,
// pointed at this one's:
//
//   `atomicRanges` makes an arrow key, a click or a restored cursor step OVER a
//   folded run rather than into it. Without it a cursor rests on a row that is
//   drawn nowhere and the reader is typing blind.
//
//   `protectLines` refuses an input or a delete that reaches into one. This is
//   the half that matters: `atomicRanges` moves a cursor and does not stop a
//   SELECTION, so Ctrl+A and a keystroke — 5.31.1's own case — would otherwise
//   replace the writing the reader folded away. It is a change filter over
//   caller-supplied spans and this is the second caller.
//
// WHAT IT DELIBERATELY DOES NOT HAVE is `cursorRest`'s redirect. The markers
// need one because every character of a marker line is the plugin's, so there
// is no position on it a cursor may legally rest at; a folded run's two ends are
// the reader's own rows, both still in the document, and `atomicRanges` leaves
// exactly those two endpoints legal. A cursor pushed out of a folded block
// lands on the writing at its edge, which is where it was going.
export function proseSurface(plugin: ChronoAnvilPlugin): Extension {
  const field = StateField.define<Painted>({
    create: (state) => stateOf(state, plugin),
    update: (value, tr) =>
      tr.docChanged ||
      // A FOLD MOVED AND THE DOCUMENT DID NOT (1.0.79) — see `proseFoldEffect`.
      tr.effects.some((e) => e.is(proseFoldEffect)) ||
      (tr.state.field(editorLivePreviewField, false) === true) !== value.live
        ? stateOf(tr.state, plugin)
        : value,
    provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
  });
  return [
    field,
    EditorView.atomicRanges.of((view) => foldedSet(view.state, field)),
    protectLines((state) => state.field(field, false)?.shut ?? []),
  ];
}

// The folded runs as the range set `atomicRanges` takes.
//
// BUILT FROM THE SAME LIST THE CHANGE FILTER READS AND THROUGH THE SAME
// ARITHMETIC THE DECORATION USES. Three things have to agree about a folded run
// — what is hidden, what a cursor steps over, and what a keystroke is refused on
// — and they agree by construction: one list (`Painted.shut`) through one
// function (`foldedRange`). A measured mutant narrowed a second copy of that
// expression and nothing noticed, which is why there is no longer a second copy.
function foldedSet(
  state: EditorState,
  field: StateField<Painted>
): DecorationSet {
  const shut = state.field(field, false)?.shut ?? [];
  if (!shut.length) return Decoration.none;
  const out: Range<Decoration>[] = [];
  for (const span of shut) {
    const range = foldedRange(state.doc, span);
    if (range) out.push(HIDE_RUN.range(range.from, range.to));
  }
  return out.length ? Decoration.set(out, true) : Decoration.none;
}
