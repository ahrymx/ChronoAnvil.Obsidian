// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// What one write would change, line by line.
//
// WHY A DIFF AND NOT A BETTER SENTENCE
//
// The repair window has always described its work in the reader's words — "adds
// open tasks", "remove year-nav (moved into the Yearly Overview banner)". Those
// are good sentences and they are not the same thing as knowing what will be in
// the file. A reader deciding whether to let a command rewrite a note they have
// edited is asking a question about LINES, and every answer short of the lines
// is a summary they have to trust.
//
// So this is the smallest thing that answers it: the literal added and removed
// lines, computed from the two texts the write already has in hand. The window
// shows what the write will do because it is shown the write's own output, not a
// reconstruction from the plan.
//
// BUILT ON `longestCommonSubsequence` (`section-model.ts`), which is already the
// project's answer to "what is the minimal set of changes between two ordered
// lists" — `moveOps` uses it to avoid reporting that every section moved when one
// did. A second implementation of the same idea, ten lines apart in the same
// codebase, is what this project spends releases removing.
//
// WHAT IT IS NOT. Not a hunk-based diff with context, not a word diff, not a
// patch format. Repair's writes are small and scattered — a fence inserted here,
// a directive removed there — so context lines would be most of the output and
// none of the information. The window renders the changed lines and nothing
// else, which is what the shape of these writes makes readable.

import { longestCommonSubsequence } from "./section-model";

export interface DiffLine {
  kind: "add" | "remove" | "same";
  text: string;
}

export interface LineDiff {
  added: number;
  removed: number;
  // Every line, attributed, in the order they appear in the result. `same`
  // lines are carried so a caller MAY show context; the repair window filters
  // them out, and that is the caller's choice rather than this module's.
  lines: DiffLine[];
  // True when the texts are too big to diff and the counts are an estimate.
  // See `MAX_LINES` — an honest flag rather than a silent fallback.
  truncated?: true;
}

// Above this, the O(n·m) grid stops being free and the answer stops being worth
// it. No note this plugin composes comes close; a reader's own dashboard with a
// decade of prose in it might, and it should degrade rather than freeze.
const MAX_LINES = 3000;

export function diffLines(before: string[], after: string[]): LineDiff {
  if (before.length > MAX_LINES || after.length > MAX_LINES) {
    // The honest degradation: say how much longer or shorter the file gets and
    // admit that is all this knows.
    const delta = after.length - before.length;
    return {
      added: delta > 0 ? delta : 0,
      removed: delta < 0 ? -delta : 0,
      lines: [],
      truncated: true,
    };
  }

  const keep = longestCommonSubsequence(before, after);
  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let k = 0;

  while (i < before.length || j < after.length) {
    const anchored =
      k < keep.length &&
      i < before.length &&
      j < after.length &&
      before[i] === keep[k] &&
      after[j] === keep[k];
    if (anchored) {
      lines.push({ kind: "same", text: before[i] });
      i++;
      j++;
      k++;
      continue;
    }
    // REMOVALS BEFORE ADDITIONS at a divergence, which is the convention every
    // diff a reader has seen uses: the old line, then what replaced it.
    if (i < before.length && (k >= keep.length || before[i] !== keep[k])) {
      lines.push({ kind: "remove", text: before[i] });
      i++;
      continue;
    }
    if (j < after.length && (k >= keep.length || after[j] !== keep[k])) {
      lines.push({ kind: "add", text: after[j] });
      j++;
      continue;
    }
    // Unreachable while `keep` really is a subsequence of both. Breaking rather
    // than looping is the safe read of "it is not", and the counts below still
    // describe what was walked.
    break;
  }

  return {
    added: lines.filter((l) => l.kind === "add").length,
    removed: lines.filter((l) => l.kind === "remove").length,
    lines,
  };
}

// The diff between two whole texts, which is what every caller actually holds.
export function diffText(before: string, after: string): LineDiff {
  return diffLines(before.split("\n"), after.split("\n"));
}

// "+4 −1", or null when nothing changed. The window's summary line, written
// once so the four places that show a count cannot spell it differently.
export function diffSummary(diff: LineDiff): string | null {
  const parts: string[] = [];
  if (diff.added) parts.push(`+${diff.added}`);
  if (diff.removed) parts.push(`−${diff.removed}`);
  if (!parts.length) return null;
  return parts.join(" ") + (diff.truncated ? " (estimated)" : "");
}
