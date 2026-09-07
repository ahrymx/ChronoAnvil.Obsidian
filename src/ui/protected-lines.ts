// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// ── A LINE THIS PLUGIN WROTE SURVIVES A SELECT-ALL (5.31.1) ──────────────
//
// *"could the hidden html fences also become non-interactable so that ctrl-a or
// drag highlight accidental deletion is no longer a problem in edit mode?"*
//
// ATOMIC RANGES NEVER COVERED THIS, and it is worth being exact about why.
// `EditorView.atomicRanges` is consulted by `moveByChar`, `moveVertically` and
// `skipAtomsForSelection` — it governs where a cursor may GO and where a
// pointer selection SNAPS to. A selection that already spans a range is not its
// business, and Ctrl+A is precisely that. So every fence and every marker was
// one keystroke from gone, before 5.31 and after it.
//
// AND 5.31 MADE IT WORSE RATHER THAN BETTER. Hiding the markers means a
// select-all or a drag now deletes text the reader cannot see. Most of it comes
// back — a fence is recomposed by *Set up / repair vault*, the graph block is
// rewritten on the next render — but a `<!--chronoanvil:key -->` region holds
// the reader's OWN words, and nothing recomposes those.
//
// ── `changeFilter`, AND NOT THE TRANSACTION FILTER 5.31 REJECTED ─────────
//
// `EditorState.changeFilter` returns the ranges in which changes are
// SUPPRESSED. CodeMirror then rebuilds the transaction with
// `tr.changes.filter(...)` and maps the selection through the difference, so a
// Ctrl+A deletion still takes the prose — it simply leaves the plugin's own
// lines standing. That is the whole reason this is not the `transactionFilter`
// 5.31 sketched and threw away: a filter that BOUNCES a transaction turns one
// protected character into a keystroke that appears to do nothing at all.
//
// ── THE ONE RULE THAT CARRIES THE RISK: USER EDITS ONLY ──────────────────
//
// This plugin never dispatches an editor transaction — every write it makes is
// `vault.modify`, `vault.process` or `adapter.write`, and there is not one
// `dispatch` in `src/` — so its own writes cannot be blocked head on. What CAN
// be blocked is Obsidian syncing a changed file into an editor that has it
// open, and suppressing part of THAT would leave the editor and the file
// disagreeing with the editor winning at the next save. That is a data-loss
// path, not an inconvenience.
//
// So the filter fires on `input` and `delete` and on nothing else. Everything
// programmatic passes untouched, and so do undo and redo — which matters, since
// undo has to be able to put back a prose deletion this filter has already
// trimmed.
//
// ── WHOLE LINES, WITH THE BREAK AT EACH END ──────────────────────────────
//
// The protected unit is a LINE, not the decoration's own range, and it takes
// the break on both sides with it. Both halves of that were found by working
// the arithmetic rather than by taste:
//
//   - WITHOUT THE TRAILING BREAK, a filtered select-all leaves every surviving
//     range concatenated with no separator — the spacer's text welded to the
//     next fence's opener, which is no longer an opener.
//   - WITHOUT THE LEADING BREAK, a selection that runs from prose INTO a fence
//     and is typed over puts the inserted character immediately before the
//     opener, with the same result. `ChangeSet.filter` keeps an insertion with
//     the piece of the change it started in, so this is not a rare shape.
//
// With both, what survives a select-all is the composed shape itself: every
// protected run on its own lines, one blank line between them. The reader gets
// their note emptied and their page back.
//
// ── AND THE ESCAPE HATCH IS THE SAME ONE ─────────────────────────────────
//
// Source mode is unfiltered, because the accessor passed in here answers with
// nothing there. Removing a section for real has a first-class gesture already
// — *Edit sections…*, which writes through the vault and never touches an
// editor transaction — so nothing this refuses was a capability.

import { EditorState, type Extension, type Text } from "@codemirror/state";

// A run of lines, 0-based and inclusive on both ends: what `fenceLinesIn` and
// `markerLinesIn` both already answer with.
export interface LineSpan {
  from: number;
  to: number;
}

// The spans as the flat start/end pairs `changeFilter` is specified to take.
//
// EXPORTED FOR THE TESTS, and for one reason worth naming: the join below is
// the only part of this file whose absence CodeMirror TOLERATES. Two fences on
// consecutive lines produce a pair that overlaps its predecessor by the one
// break they share, and both `ChangeSet.filter` and `joinRanges` happen to
// absorb that without complaint — so no assertion about a document could tell
// the two apart. The facet's contract is a list of pairs, not a list of pairs
// that usually works, so the join stays and is asserted here instead.
export function protectedRanges(doc: Text, spans: readonly LineSpan[]): number[] {
  const out: number[] = [];
  for (const span of spans) {
    const first = doc.line(span.from + 1);
    const last = doc.line(span.to + 1);
    const from = span.from > 0 ? doc.line(span.from).to : first.from;
    const to = Math.min(last.to + 1, doc.length);
    if (out.length && out[out.length - 1] >= from) {
      if (out[out.length - 1] < to) out[out.length - 1] = to;
    } else {
      out.push(from, to);
    }
  }
  return out;
}

export function protectLines(
  spansFor: (state: EditorState) => readonly LineSpan[]
): Extension {
  return EditorState.changeFilter.of((tr) => {
    if (!tr.isUserEvent("input") && !tr.isUserEvent("delete")) return true;
    const out = protectedRanges(tr.startState.doc, spansFor(tr.startState));
    return out.length ? out : true;
  });
}
