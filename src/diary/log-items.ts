// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// A stamped item, and the region it is written into.
//
// WHY THIS FILE EXISTS
//
// The `capture` region has always HAD items — each one stamped, each separated
// by a blank line — and it was RENDERED as one textarea, which is a lossy view
// of a structured thing. You could not cross one off, delete one, or edit one
// without editing all of them as text. This module is the parse and the
// serialise that were implied by the format from the start;
// `capture-log-widget.ts` and `logbook-widget.ts` are the two views.
//
// ── ONE GRAMMAR, TWO STAMP PRECISIONS (4.52) ────────────────────────
//
// Until 4.52 this was `capture-log.ts` and every stamp was `HH:mm`, which is
// exactly right for a capture: it lives in a note that already knows which day
// it is. A LOGBOOK item does not — a work log spans months — so it stamps the
// date as well:
//
//   14:32 — rewrote the pathwatch remap                    a capture
//   2026-08-21 14:32 — rewrote the pathwatch remap         a logbook item
//
// The date is OPTIONAL rather than a second format, and that is the whole
// design: one parser, one serialiser, one export path, and every capture region
// already on disk reads unchanged. Two parsers would be two answers to "what is
// an item", and the two views would drift the first time either moved.
//
// The module is named for the grammar rather than for its first caller, which
// is why it stopped being `capture-log.ts` when the second caller arrived.
//
// ── THE ITEM SEPARATOR IS NOT A BLANK LINE ──────────────────────────
//
// It looks like one, and splitting on `\n\n` is the obvious parse. It is wrong,
// and wrong in a way that eats content. `formatLogItem` keeps a blank
// continuation line blank — a three-line thought with a gap in it is one
// item — so
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
// region whose lines parsed as tasks would:
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

import { joinRegionBlocks } from "../core/notestore";
// ONE DEFINITION OF WHAT A DURATION IS, and it lives in `events.ts` because
// that module imports nothing and therefore can hold it; this one imports the
// note store, so the reverse was not available. See the note on `readMinutes`.
import { readMinutes } from "../events/events";

// One item: when it was written, what it says, and whether it has been crossed
// off.
export interface LogItem {
  // The day, `YYYY-MM-DD`, or null where the region's own note supplies it —
  // which is every capture, since a capture lives in a dated entry.
  date: string | null;
  // `null` for text sitting in the region above the first stamp — hand-written,
  // or the remains of an edit. Kept rather than dropped; see `parseLogItems`.
  time: string | null;
  // May be multi-line. The continuation indent `formatLogItem` adds is the
  // format's, not the reader's, so it is stripped here and re-added on write.
  text: string;
  // The date it was crossed off, or null. A date rather than a boolean because
  // the marker has to hold something and "when" is the only fact worth having —
  // and a crossed-off item from three weeks ago reads differently from one
  // crossed off this morning.
  done: string | null;
  // How long it took, in MINUTES, or null for a moment. 4.55.
  //
  // MINUTES RATHER THAN AN END TIME, and the grammar above is the whole reason.
  // A stamp holds one clock field; a second `HH:mm` on the stamp line would
  // read as a range and would have to be told apart from `STAMP_RE`'s own bare
  // -time alternative, which is the ambiguity that opens the moment somebody
  // hand-writes `9:05 14:20 — ...`. A bracketed field cannot be mistaken for a
  // stamp, and this file already has one.
  //
  // NULL IS A MOMENT AND NOT A ZERO. "I thought of this at 14:32" and "I spent
  // no time on this" are different claims; the time grid draws them
  // differently, and a `0` that meant "unknown" would put every unmeasured item
  // on the grid as a thing that took no time.
  mins: number | null;
}

// A stamp line: `14:32 — text`, or `2026-08-21 14:32 — text`, or the date on
// its own. The hour is `\d{1,2}` rather than `\d{2}` because `formatLogItem`
// writes `HH:mm` but a reader hand-adding a line will write `9:05`, and
// refusing theirs would make the region ours rather than theirs.
//
// A DATE ALONE IS A STAMP, and nothing writes one. It is here because a reader
// typing into a work log by hand will write the day and not the minute, and an
// item that parsed as untimed prose would lose its place in the list.
const STAMP_RE =
  /^(?:(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?|(\d{1,2}:\d{2}))\s+—\s?(.*)$/;

// A trailing `[key:: value]` on a stamp line. Two are recognised — `done` and
// `mins` — and they may appear in either order, which is why this is a loop in
// `readFields` rather than one anchored regex per field.
//
// AN UNRECOGNISED FIELD STOPS THE SCAN AND STAYS IN THE TEXT, which is exactly
// what the single anchored `DONE_RE` this replaces did: it could not match
// `[done:: x] [foo:: y]` either, and the pair survived into the item's prose. A
// loop that skipped over `foo` to reach `done` behind it would be a NEW
// behaviour — it would silently eat a bracket somebody typed — so the scan
// stops at the first word it does not know.
const FIELD_RE = /\s*\[([a-z]+)::\s*([^\]]*)\]\s*$/;

// The recognised trailing fields, peeled off the end of a stamp line.
function readFields(head: string): {
  text: string;
  done: string | null;
  mins: number | null;
} {
  let text = head;
  let done: string | null = null;
  let mins: number | null = null;
  for (;;) {
    const m = FIELD_RE.exec(text);
    if (!m) break;
    const [, key, value] = m;
    if (key === "done") {
      done = value.trim();
    } else if (key === "mins") {
      mins = readMinutes(value);
    } else {
      break;
    }
    text = text.slice(0, m.index);
  }
  return { text, done, mins };
}

// The indent `formatLogItem` puts on a continuation line.
const INDENT = "  ";

// One item, formatted for the region: a single stamp heading the block, with
// any further lines carried underneath it.
//
// One stamp per *item*, not per line. A three-line thought is one moment;
// stamping each line would make it read as three separate ones. The
// continuation lines are indented so the block stays visually attached to its
// stamp without needing markup that would fight the region's plain-text
// contract.
export function formatLogItem(
  text: string,
  time: string,
  date?: string | null
): string {
  const lines = text.replace(/\s+$/, "").split("\n");
  // Drop leading blank lines so a stray newline before the text doesn't
  // produce a stamp with nothing next to it.
  while (lines.length > 0 && lines[0].trim() === "") lines.shift();
  if (lines.length === 0) return "";
  const [first, ...rest] = lines;
  const stamp = [date, time].filter((part) => !!part).join(" ");
  const head = `${stamp} — ${first.trim()}`;
  if (rest.length === 0) return head;
  // Blank continuation lines stay blank rather than becoming stray indents.
  // A line's own leading whitespace is kept on top of the block indent: if
  // someone indented a sub-point, they meant it, and flattening would lose the
  // structure they typed.
  const tail = rest.map((l) => (l.trim() === "" ? "" : `  ${l.trimEnd()}`));
  return [head, ...tail].join("\n");
}

export function parseLogItems(region: string): LogItem[] {
  const out: LogItem[] = [];
  let current: {
    date: string | null;
    time: string | null;
    done: string | null;
    mins: number | null;
    lines: string[];
  } | null = null;
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
    if (current.time != null || current.date != null || text.trim() !== "") {
      out.push({
        date: current.date,
        time: current.time,
        text,
        done: current.done,
        mins: current.mins,
      });
    }
    current = null;
  };

  for (const raw of region.split("\n")) {
    const stamp = STAMP_RE.exec(raw);
    if (stamp) {
      flush();
      const fields = readFields(stamp[4]);
      current = {
        date: stamp[1] ?? null,
        time: stamp[2] ?? stamp[3] ?? null,
        done: fields.done,
        mins: fields.mins,
        lines: [fields.text],
      };
      continue;
    }
    // Anything before the first stamp is an item of its own with no stamp, so a
    // region someone typed into by hand survives a round trip instead of being
    // silently swallowed by the first stamped item below it.
    if (!current) {
      current = { date: null, time: null, done: null, mins: null, lines: [] };
    }
    current.lines.push(raw.startsWith(INDENT) ? raw.slice(INDENT.length) : raw);
  }
  flush();
  return out;
}

// One item, back in the region's format.
//
// GOES THROUGH `formatLogItem`, which is the one place the stamp and the
// continuation indent are decided — a second spelling here is how the widget
// and the quick-capture box would come to disagree about what an item looks
// like. The marker is spliced onto the end of the first line afterwards,
// because that is the only line it may sit on: `parseLogItems` reads it off the
// stamp, and a `[done:: …]` on a continuation line is part of the text.
export function serializeLogItem(item: LogItem): string {
  // `done` STAYS LAST, which is why the two are not simply appended in field
  // order. Every stamp line already on disk that carries a marker carries that
  // one at the end, and this file's own grammar note calls it "only ever at the
  // end of a stamp line" — writing `mins` after it would rewrite the tail of
  // every crossed-off item in the vault on the next save, for nothing.
  const mark =
    (item.mins ? ` [mins:: ${item.mins}]` : "") +
    (item.done ? ` [done:: ${item.done}]` : "");
  const stamp = [item.date, item.time].filter((part) => !!part).join(" ");
  if (!stamp) return item.text.replace(/\s+$/, "") + mark;
  const block = formatLogItem(item.text, item.time ?? "", item.date);
  // `formatLogItem` returns "" for text that is entirely whitespace, which
  // would lose the stamp — so an emptied item keeps its moment and says
  // nothing, rather than vanishing on the next save.
  if (!block) return `${stamp} —${mark}`;
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
export function serializeLogItems(items: LogItem[]): string {
  return items.reduce(
    (acc, item) => joinRegionBlocks(acc, serializeLogItem(item)),
    ""
  );
}
