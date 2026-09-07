// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Context notes for scale readings — stored as tagged captures.
//
// A scale tracker (Mood, Energy, Focus, or a custom one) lets you attach a
// short line of context to the value you logged — "rough afternoon, better
// after a walk" next to a Mood of 4. Pressing the pencil opens the same overlay
// Quick Capture uses, and the note lands in the entry's **Captured** log,
// timestamped like any other capture, with a machine-readable tag naming the
// reading it's about:
//
//   09:14 — [scale:Mood=4] rough afternoon, better after a walk
//
// This replaces the earlier standalone `<!--chronoanvil:scale-notes-->` region.
// Folding annotations into the capture log means they read chronologically
// alongside the day's other fragments (a mood note *is* a captured thought),
// they're searchable for free (captures already are), and there's one prose
// store for "things I jotted today" instead of two. What's kept is the tag:
// `[scale:<id>=<value>]` still names the tracker and the value, so a chart
// tooltip, a search filter, or an export can pair a note back to its reading.
//
// This module is that tag contract — pure string transforms, no vault — so the
// format has one definition and a test suite, and the widget, the capture
// formatter, and any future reader share the same parser.

// One parsed annotation: which tracker, the value it was logged against, and
// the prose. `value` is kept numeric so pairing to a frontmatter reading is an
// exact compare.
export interface ScaleNote {
  trackerId: string;
  value: number;
  text: string;
}

// The tag grammar, matched *anywhere* in a line (a capture line leads with a
// timestamp, so the tag is not at the start). The id runs to the last `=`
// before the closing `]` and may contain `=` (`a=b`) but not `]`; the tag
// closes at the first `]`, so a user typing `[scale:x=1]` as prose later in the
// same note doesn't read as a second tag. Captured: 1 = id, 2 = value,
// 3 = trailing text after the tag on that line.
const TAG = /\[scale:([^\]]+)=(-?\d+(?:\.\d+)?)\]\s?(.*)$/;

// Ids may not contain `]` (it would end the tag) or a newline. canAnnotate is
// the write-time guard: a value that can't round-trip is refused before it's
// written, rather than trusted from the caller.
export function canAnnotate(trackerId: string): boolean {
  return trackerId.length > 0 && !/[\]\n\r]/.test(trackerId);
}

// A note's text is trimmed and flattened to one line — newlines would break the
// one-capture-per-line grammar. Empty after trimming means "no note".
export function normalizeNoteText(text: string): string {
  return text.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

// Build the tagged fragment `[scale:<id>=<value>] <text>` that the capture
// formatter prepends a timestamp to. Returns null when the id can't be safely
// tagged, so a caller never writes a fragment it couldn't read back. This is
// the *content* of a capture, not a whole capture line — the timestamp is added
// by the capture layer, keeping one place responsible for capture formatting.
export function formatScaleNoteTag(note: ScaleNote): string | null {
  if (!canAnnotate(note.trackerId)) return null;
  const text = normalizeNoteText(note.text);
  return `[scale:${note.trackerId}=${note.value}]${text ? ` ${text}` : ""}`;
}

// Parse the scale tag out of one line, or null if the line carries none. Works
// on a full capture line (timestamp + tag) or a bare tagged fragment, since the
// tag is matched wherever it sits. A non-finite value is rejected rather than
// yielding a NaN annotation nothing could match.
export function parseScaleNoteLine(line: string): ScaleNote | null {
  const m = line.match(TAG);
  if (!m) return null;
  const value = Number(m[2]);
  if (!Number.isFinite(value)) return null;
  return { trackerId: m[1], value, text: normalizeNoteText(m[3]) };
}

// Every scale annotation in a block of capture text, in document order. Skips
// lines without a tag (ordinary captures, blank lines, continuation lines).
// Tolerant by design: the capture region is hand-editable and one odd line
// shouldn't drop the rest.
export function parseScaleNotes(captureText: string): ScaleNote[] {
  const out: ScaleNote[] = [];
  for (const line of captureText.split("\n")) {
    const note = parseScaleNoteLine(line);
    if (note) out.push(note);
  }
  return out;
}

// Whether a block of capture text already holds a note for this tracker at this
// value — what the pencil uses to show its "has a note" fill. Matched on
// tracker + value together: a note is about a *reading*, so once you move Mood
// from 4 to 5, the 4's note no longer describes the current value and the
// pencil is empty again (the old note stays in the log as the record it is).
export function hasScaleNoteFor(
  captureText: string,
  trackerId: string,
  value: number
): boolean {
  return parseScaleNotes(captureText).some(
    (n) => n.trackerId === trackerId && n.value === value
  );
}
