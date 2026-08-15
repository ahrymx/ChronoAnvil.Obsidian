// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The capture region, read as a list of items rather than as prose.
//
// WHY THIS FILE EXISTS
//
// The `capture` region has always HAD items — `formatCapture` stamps each one
// and `appendToNoteRegion` separates them with a blank line — and it has always
// been RENDERED as one textarea, which is a lossy view of a structured thing.
// You could not cross one off, delete one, or edit one without editing all of
// them as text. This module is the parse and the serialise that were implied by
// the format from the start; `capture-log-widget.ts` is the view.
//
// ── THE ITEM SEPARATOR IS NOT A BLANK LINE ──────────────────────────
//
// It looks like one, and splitting on `\n\n` is the obvious parse. It is wrong,
// and wrong in a way that eats content. `formatCapture` keeps a blank
// continuation line blank — a three-line thought with a gap in it is one
// capture — so
//
//   10:00 — one
//   ⟨blank⟩
//     two
//
// is ONE item whose text is "one\n\ntwo", and a `\n\n` split turns it into two,
// the second with no timestamp. So an item starts where a STAMP starts, and
// every line after it belongs to it. That also makes the parse tolerant of a
// hand-edited region, which the recall deck's own parser argues for at length
// and for the same reason: this text is a reader's to type into.
//
// ── WHY NOT THE TASK LINE FORMAT ────────────────────────────────────
//
// `- ( )` / `- (x)` was the obvious way to spell "crossed out" and would have
// been a quiet disaster. `parseTasks` is run KEY-BLIND over every region by
// `diary-index.ts::parseEntryText` and by four sites in `tables.ts`, so a
// capture region whose lines parsed as tasks would:
//
//   • be counted in every open/done task total in the vault,
//   • lose its timestamps from the search index (the task branch pushes
//     `t.text`, not the region, and `continue`s), and
//   • be REWRITTEN in the task format by `openTasksInFile` the first time
//     anyone ticked a checkbox in the tasks table.
//
// `[done:: <date>]` is the same codebase's own extensible metadata slot — the
// task grammar preserves unknown `[k:: v]` fields verbatim precisely so one can
// be added — and it cannot trip `CHECKBOX_RE`, which is anchored at `^-`.

import { formatCapture } from "./capture";
import { joinRegionBlocks } from "../core/notestore";

// One capture: when it was taken, what it says, and whether it has been
// crossed off.
export interface CaptureNote {
  // `null` for text sitting in the region above the first stamp — hand-written,
  // or the remains of an edit. Kept rather than dropped; see `parseCaptures`.
  time: string | null;
  // May be multi-line. The continuation indent `formatCapture` adds is the
  // format's, not the reader's, so it is stripped here and re-added on write.
  text: string;
  // The date it was crossed off, or null. A date rather than a boolean because
  // the marker has to hold something and "when" is the only fact worth having —
  // and a crossed-off capture from three weeks ago reads differently from one
  // crossed off this morning.
  done: string | null;
}

// A stamp line: `14:32 — text`. The hour is `\d{1,2}` rather than `\d{2}`
// because `formatCapture` writes `HH:mm` but a reader hand-adding a line will
// write `9:05`, and refusing theirs would make the region ours rather than
// theirs.
const STAMP_RE = /^(\d{1,2}:\d{2})\s+—\s?(.*)$/;

// The crossed-off marker, only ever at the end of a stamp line.
const DONE_RE = /\s*\[done::\s*([^\]]*)\]\s*$/;

// The indent `formatCapture` puts on a continuation line.
const INDENT = "  ";

export function parseCaptures(region: string): CaptureNote[] {
  const out: CaptureNote[] = [];
  let current: { time: string | null; done: string | null; lines: string[] } | null =
    null;
  const flush = (): void => {
    if (!current) return;
    // Trailing blank lines belong to the separator, not to the item.
    while (current.lines.length && current.lines[current.lines.length - 1] === "") {
      current.lines.pop();
    }
    const text = current.lines.join("\n");
    // A stamp with nothing after it is still an item — it records that the
    // moment happened, which is the same argument `captureScaleNote` makes for
    // writing a bare tag with no prose.
    if (current.time != null || text.trim() !== "") {
      out.push({ time: current.time, text, done: current.done });
    }
    current = null;
  };

  for (const raw of region.split("\n")) {
    const stamp = STAMP_RE.exec(raw);
    if (stamp) {
      flush();
      const head = stamp[2];
      const marker = DONE_RE.exec(head);
      current = {
        time: stamp[1],
        done: marker ? marker[1].trim() : null,
        lines: [marker ? head.slice(0, marker.index) : head],
      };
      continue;
    }
    // Anything before the first stamp is an item of its own with no time, so a
    // region someone typed into by hand survives a round trip instead of being
    // silently swallowed by the first stamped item below it.
    if (!current) current = { time: null, done: null, lines: [] };
    current.lines.push(raw.startsWith(INDENT) ? raw.slice(INDENT.length) : raw);
  }
  flush();
  return out;
}

// One capture, back in the region's format.
//
// GOES THROUGH `formatCapture`, which is the one place the stamp and the
// continuation indent are decided — a second spelling here is how the widget
// and the quick-capture box would come to disagree about what a capture looks
// like. The marker is spliced onto the end of the first line afterwards,
// because that is the only line it may sit on: `parseCaptures` reads it off the
// stamp, and a `[done:: …]` on a continuation line is part of the text.
export function serializeCaptureNote(note: CaptureNote): string {
  const mark = note.done ? ` [done:: ${note.done}]` : "";
  if (note.time == null) return note.text.replace(/\s+$/, "") + mark;
  const block = formatCapture(note.text, note.time);
  // `formatCapture` returns "" for text that is entirely whitespace, which
  // would lose the stamp — so an emptied capture keeps its time and says
  // nothing, rather than vanishing on the next save.
  if (!block) return `${note.time} —${mark}`;
  const nl = block.indexOf("\n");
  return nl === -1
    ? block + mark
    : block.slice(0, nl) + mark + block.slice(nl);
}

// The whole region.
//
// JOINED BY `joinRegionBlocks`, NOT BY `\n\n` WRITTEN OUT HERE. The one blank
// line between items is load-bearing beyond how it looks: `appendedSince` only
// recognises a second writer's append when the divergence starts with `\n\n`,
// so a widget that serialised its list any other way would re-open the clobber
// 4.27 closed — a capture arriving while the list is on screen would be
// overwritten by the next edit to it.
export function serializeCaptures(notes: CaptureNote[]): string {
  return notes.reduce(
    (acc, note) => joinRegionBlocks(acc, serializeCaptureNote(note)),
    ""
  );
}
