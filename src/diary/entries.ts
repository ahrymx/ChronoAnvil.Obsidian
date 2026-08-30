// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The ChronoAnvil list format — one entry per line, stored in a note's
// `<!--chronoanvil:KEY-->` body region (see notestore.ts).
//
// This is the third thing that lives in those regions, alongside tasks
// (tasks.ts) and attachments (attachments.ts), and it is deliberately the
// dumbest of the three: an entry is a line of prose with no metadata, no
// marker, and no syntax of its own.
//
//   <!--chronoanvil:highlights
//   Financial adviser said my credit is healthy enough for the business loan.
//   My brother's birthday. We went out for dinner at a local restaurant.
//   -->
//
// Why plain lines rather than `- ` bullets or a `- ( )`-style marker: the
// region's content sits inside an HTML comment, so Obsidian never renders it
// and a bullet would buy nothing but noise in the raw file. And unlike a task,
// an entry has no state to carry — nothing to complete, prioritize or schedule.
// The moment an entry needs a field, it should become a task, not grow a syntax.
//
// The one real rule is that an entry cannot contain a newline, because a
// newline is what separates entries. The widget enforces that at the input;
// these functions enforce it on the way in and out so a hand-edited region
// can't produce an entry that silently splits on the next save.

// Split a region's text into entries, one per non-blank line.
//
// Blank lines are dropped rather than preserved as empty entries: the region
// is written with a trailing newline before its closing marker, and a
// hand-edited region tends to accumulate stray blank lines. Neither should
// render as an empty row.
export function parseEntries(regionText: string): string[] {
  const out: string[] = [];
  for (const line of regionText.split("\n")) {
    const trimmed = line.trim();
    if (trimmed) out.push(trimmed);
  }
  return out;
}

// Serialize entries back to region text. Any entry containing a newline is
// flattened to spaces first — a multi-line entry would re-parse as several
// entries, so silently accepting one would mean the list changed shape between
// a write and the next read.
export function serializeEntries(entries: string[]): string {
  return entries
    .map((e) => e.replace(/\s*\n\s*/g, " ").trim())
    .filter((e) => e.length > 0)
    .join("\n");
}

// Normalize one entry as typed. Collapses internal whitespace runs (including
// pasted newlines) so a paste from a wrapped source doesn't arrive as an entry
// with a line break hiding in it.
export function normalizeEntry(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// ── state transitions ─────────────────────────────────────────────────
// The list widget's three edits, as pure functions over the model.
//
// These live here rather than inside the widget because the widget's callbacks
// fire more than once per edit and cannot be stopped from doing so. Rebuilding
// the rows blurs whichever textarea is focused, and a blur handler is how a row
// commits — so pressing Enter runs the Enter commit and then, during the
// re-render it triggers, the same row's blur commit as well.
//
// The 2.12.1 widget guarded that with per-row state captured at render time
// (`index`, `isTrailing`), which is exactly what broke: after Enter appended an
// entry, the stale closure still believed row 0 was the trailing row, so the
// second commit appended a duplicate instead of overwriting. Deriving
// "trailing" from the *current* model on every call makes the second commit a
// no-op rather than a duplicate — idempotent by construction instead of by
// remembering to suppress it.
//
// `index` is a row index, not an entry index: rows are `[...entries, ""]`, so
// `index === entries.length` is the trailing "type here" row, which has no
// entry behind it yet.

export interface EntryEdit {
  entries: string[];
  // Row to focus once the caller re-renders; -1 leaves focus alone, so an edit
  // that changes nothing can't yank the caret out of another field.
  focus: number;
  // Put the caret at the end of that row rather than the start — what you want
  // when merging backwards into the previous line.
  focusAtEnd: boolean;
}

const noChange = (entries: string[]): EntryEdit => ({
  entries,
  focus: -1,
  focusAtEnd: false,
});

// Commit a row's current text: on blur, or on any other end of editing that
// isn't Enter. Focus is never moved — the user is already on their way
// somewhere else.
export function applyEntryCommit(
  entries: string[],
  index: number,
  value: string
): EntryEdit {
  const clean = normalizeEntry(value);
  const next = [...entries];

  if (index >= entries.length) {
    // Trailing row. Empty is the resting state, not an edit.
    if (!clean) return noChange(entries);
    next.push(clean);
    return { entries: next, focus: -1, focusAtEnd: false };
  }
  if (index < 0) return noChange(entries);

  // Emptying an existing row deletes it — the same gesture as clearing a line
  // in the textarea this widget replaced.
  if (!clean) next.splice(index, 1);
  else if (next[index] === clean) return noChange(entries);
  else next[index] = clean;
  return { entries: next, focus: -1, focusAtEnd: false };
}

// Enter: commit this row and open a new empty one directly below it, then land
// there. On the trailing row that means appending and stepping onto the fresh
// trailing row; in the middle it means a genuine insert, so a list can be
// filled in out of order.
export function applyEntryEnter(
  entries: string[],
  index: number,
  value: string
): EntryEdit {
  const clean = normalizeEntry(value);

  if (index >= entries.length) {
    if (!clean) return noChange(entries);
    const next = [...entries, clean];
    return { entries: next, focus: next.length, focusAtEnd: false };
  }
  if (index < 0) return noChange(entries);

  const next = [...entries];
  if (!clean) {
    // Enter on an emptied row removes it rather than leaving a blank behind.
    next.splice(index, 1);
    return { entries: next, focus: index, focusAtEnd: false };
  }
  next[index] = clean;
  // The inserted blank never reaches disk — serializeEntries drops empties —
  // so it is purely a place for the caret to be.
  next.splice(index + 1, 0, "");
  return { entries: next, focus: index + 1, focusAtEnd: false };
}

// Backspace at the start of an empty row: remove it and return to the end of
// the row above. On the trailing row there is nothing to remove, so this only
// moves the caret — pressing Backspace on the blank at the bottom should step
// back into the last entry, not delete it.
export function applyEntryBackspace(
  entries: string[],
  index: number
): EntryEdit {
  if (entries.length === 0 || index <= 0) return noChange(entries);

  if (index >= entries.length) {
    return { entries, focus: entries.length - 1, focusAtEnd: true };
  }
  const next = [...entries];
  next.splice(index, 1);
  return { entries: next, focus: index - 1, focusAtEnd: true };
}
