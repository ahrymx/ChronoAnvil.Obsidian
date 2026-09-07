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
// WHAT LIVE PREVIEW ALREADY DOES, so that what is added here is one thing. A
// ```chronoanvil fence renders in Live Preview exactly as it does in reading
// view — Obsidian mounts the block inside `.cm-embed-block`, which is why
// `headerbar.ts` has to exclude that container from its section walk. The raw
// directives appear for ONE reason: the selection landed inside the block, and
// Obsidian hands a block back to the editor whenever the cursor is in it. So
// "hide the fences" is not a rendering change at all. It is a cursor rule.
//
// This is the fix `chronoanvil:spacer` was a softener for: an inert line on row
// 0 whose whole job is to catch the click that would otherwise land in the
// first fence — see `widgets/index.ts` and `viewmode.ts`, which both say so.
// The case it never covered is the one that prompted this: a diary entry opens
// in reading mode (4.6), the reader presses Ctrl+E to actually write, and the
// banner is the first thing under their cursor.
//
// ── ATOMIC RANGES, NOT A REPLACEMENT DECORATION ──────────────────────────
//
// The other way to hide a range in CodeMirror is `Decoration.replace` over it,
// with a widget of our own drawn in its place. That is a SECOND rendering path
// for every block — the post-processor draws one in reading view and this would
// draw the other — and it changes the DOM that `headerbar.ts` and
// `block-drag.ts` both read: the fold walk counts `.cm-line` siblings between
// fences, and the drag is a pointer gesture against the shape Live Preview
// builds. Keeping Obsidian's own widget and moving only the cursor leaves both
// untouched, which is why nothing else in this release had to change.
//
// ── AND NOTHING ELSE: NO TRANSACTION FILTER ──────────────────────────────
//
// The first sketch of this paired `atomicRanges` with an
// `EditorState.transactionFilter` that pushed any selection landing inside a
// fence back out, on the strength of the facet's own documentation: *"This does
// not prevent direct programmatic selection updates from moving into such
// regions."* Reading what CodeMirror actually does with the facet retired the
// filter:
//
//   - A CLICK IS NOT PROGRAMMATIC. `MouseSelection.select` runs its selection
//     through `skipAtomsForSelection` before dispatching it, and the
//     selection-observer path does the same for `select.pointer`. Pointer
//     placement is covered.
//   - DELETION IS NOT EITHER. `deleteByChar` measures with `moveByChar`, and
//     `moveByChar` skips atomic ranges. See below for what that does mean.
//   - WHAT IS LEFT IS THE READER ASKING FOR THE SOURCE. A programmatic
//     selection into a fence is Obsidian's own "edit this block" pencil, or a
//     search hit, or another plugin's `setCursor`. Bouncing those would not be
//     protecting anything — it would be taking away the escape hatch this
//     feature was granted on.
//   - AND THE RESTORE CASE ELIMINATES ITSELF. The one unattended entrant is the
//     cursor Obsidian restores when a note reopens, and once a position inside
//     a fence cannot be reached, there is no such position left to save.
//
// A filter would also have fought every other plugin's cursor for the whole
// vault, on every transaction, to fix cases that do not arrive.
//
// ── WHAT THIS DOES TO DELETION, SAID PLAINLY ─────────────────────────────
//
// One Backspace at a fence's edge measures the WHOLE block, because that is
// what an atomic range means — `deleteByChar` asks `moveByChar` where the other
// side is. Through 5.31 it then took it, which was already better than the
// behaviour it replaced (one invisible character out of one directive, leaving
// a fence that still rendered and no longer said what it used to).
//
// SINCE 5.31.1 IT TAKES NOTHING, because the change filter below refuses a user
// edit that touches a fence's lines. The keystroke that measured the block now
// declines to remove it, which is the same answer Ctrl+A gets and for the same
// reason. Removing a block for real is *Edit sections…*, which writes through
// the vault, or source mode, which is unfiltered.
//
// ── LIVE PREVIEW ONLY, AND THAT IS THE WHOLE ESCAPE HATCH ────────────────
//
// `registerEditorExtension` is vault-wide and mode-blind: without the check
// below, this would make the directives unreachable in SOURCE mode too — the
// exact mode the reader named as the way in, and the one place the fences are
// text on purpose. `editorLivePreviewField` is Obsidian's own answer to which
// mode an editor is in. Absent (any editor that is not Obsidian's markdown
// one), nothing is guarded, which is the safe direction.

import { editorLivePreviewField } from "obsidian";
import {
  RangeSet,
  RangeValue,
  StateField,
  type EditorState,
  type Extension,
  type Text,
} from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { segment } from "../core/layout";
import { protectLines } from "./protected-lines";

// Where each of this plugin's fences begins and ends, as 0-based line numbers,
// both inclusive — the ``` lines included, because they are as much a part of
// the block as the directives are.
//
// `segment` IS THE PARSER, AND IT HAS TO BE. It already knows the three fence
// languages this plugin renders, and it already knows the two cases a second
// scanner would get wrong: an unterminated fence (left as prose rather than
// swallowing the rest of the file) and a fence nested inside a longer one,
// which is how `assets/documentation.md` PRINTS a ```chronoanvil block instead
// of running it. 4.68.1 is the record of what reading that documentation as a
// live block cost. A reader editing the documentation keeps their cursor.
//
// The pre-rename `almanac` spellings are not here, because `segment` does not
// know them: they still render (`registerBlock` takes both) and they still open
// under the cursor. `tools/migrate-vault.mjs` is the answer to an unmigrated
// vault, the same answer the tracker markers give.
export function fenceLinesIn(lines: readonly string[]): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let at = 0;
  for (const seg of segment([...lines])) {
    if (seg.kind === "fence") out.push({ from: at, to: at + seg.lines.length - 1 });
    at += seg.lines.length;
  }
  return out;
}

// A range with no value of its own. `atomicRanges` reads nothing but `from` and
// `to`, so a decoration here would be a decoration that decorates nothing —
// and one that could be mistaken for a live one by anybody reading this later.
class Guarded extends RangeValue {}
const GUARDED = new Guarded();

// The lines, and the same lines as character offsets.
//
// BOTH, BECAUSE TWO RULES READ THEM AT DIFFERENT GRAINS. The cursor steps over
// exactly the block (`atomicRanges`, offsets); the change filter keeps whole
// LINES with the break at each end, which is a wider span and is argued for in
// `protected-lines.ts`. Computing the parse once and answering both is what
// stops the two drifting into two ideas of where a fence is.
interface Fences {
  spans: { from: number; to: number }[];
  set: RangeSet<Guarded>;
}

function fencesIn(doc: Text): Fences {
  const spans = fenceLinesIn(doc.toString().split("\n"));
  if (!spans.length) return { spans, set: RangeSet.empty };
  return {
    spans,
    set: RangeSet.of(
      spans.map((s) => GUARDED.range(doc.line(s.from + 1).from, doc.line(s.to + 1).to))
    ),
  };
}

// Recomputed only when the document changes — not when the selection moves,
// which is when the facet below is read, and not when the mode changes, which
// is asked at read time so this stays a pure function of the text.
const fences = StateField.define<Fences>({
  create: (state) => fencesIn(state.doc),
  update: (value, tr) => (tr.docChanged ? fencesIn(tr.newDoc) : value),
});

function liveIn(state: EditorState): boolean {
  return state.field(editorLivePreviewField, false) === true;
}

export function fenceCursorGuard(): Extension {
  return [
    fences,
    EditorView.atomicRanges.of((view) =>
      liveIn(view.state) ? view.state.field(fences, false)?.set ?? RangeSet.empty : RangeSet.empty
    ),
    // AND THE BLOCK DOES NOT GO WITH A SELECT-ALL. 5.31.1. The cursor rule above
    // says where a cursor may travel and nothing about a selection that already
    // spans a fence, which is what Ctrl+A and a drag both hand it.
    protectLines((state) => (liveIn(state) ? state.field(fences, false)?.spans ?? [] : [])),
  ];
}
