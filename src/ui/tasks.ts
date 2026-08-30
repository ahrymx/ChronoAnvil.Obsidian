// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The ChronoAnvil task format — a small, self-owned line format stored inside a
// note's `<!--chronoanvil:todo-->` region (see notestore.ts). ChronoAnvil renders and
// edits these itself; it deliberately does NOT use the Tasks plugin's emoji
// syntax or Dataview, so there's no external dependency and the raw file stays
// clean and ChronoAnvil-specific.
//
// On-disk line grammar (one task per line):
//
//   - ( ) Draft the proposal [priority:: high] [due:: 2026-07-25]
//   - ( ) Water plants
//   - (x) Reply to email [priority:: low]
//
// - `- ( )` / `- (x)` is the checkbox — a ChronoAnvil-unique marker (not `- [ ]`),
//   so Obsidian's native task handling never touches these. `(x)` (any case) is
//   done; `( )` (or empty) is open.
// - Trailing `[field:: value]` inline fields carry optional metadata. Supported
//   fields: `priority` (high|normal|low) and `due` (YYYY-MM-DD). Order-
//   independent; unknown fields are preserved verbatim on the line so a
//   hand-added field isn't destroyed by a round-trip.
// - Priority defaults to `normal` and is omitted from the line when normal, so
//   a plain `- ( ) text` is a normal, no-due task — the minimal clean form.
//
// These functions are pure string<->model transforms so they unit-test without
// a vault. The App-facing read/write wrappers live in the widget layer.

export type TaskPriority = "high" | "normal" | "low";

export interface ChronoAnvilTask {
  done: boolean;
  text: string;
  priority: TaskPriority;
  // ISO date YYYY-MM-DD, or null when unset.
  due: string | null;
  // `HH:mm` on the due DATE, or null for a task that is a fact about the whole
  // day. 4.55.
  //
  // WHAT IT DECIDES. The time grid draws a task with an hour as a block and a
  // task without one in the all-day lane, which is 4.52's distinction between a
  // birthday and a meeting applied to the one store that had a date and never a
  // time.
  //
  // MEANINGLESS WITHOUT `due`, and dropped on read when there is none — an hour
  // on no day is not a time, and keeping it would let a task carry a stamp that
  // nothing could ever place.
  at: string | null;
  // Inline fields we don't recognize, kept as raw `[k:: v]` strings so a
  // round-trip preserves them. Empty for the common case.
  extraFields: string[];
}

const CHECKBOX_RE = /^-\s*\(\s*([xX ]?)\s*\)\s?(.*)$/;
// Matches a single `[key:: value]` inline field. Global; used to pull all out.
const FIELD_RE = /\[([a-zA-Z][\w-]*)::\s*([^\]]*)\]/g;
const DUE_RE = /^\d{4}-\d{2}-\d{2}$/;
// `9:05` as readily as `09:05`: the pickers write a padded hour, a reader
// editing the raw line will not, and refusing theirs would make the line ours
// rather than theirs — `STAMP_RE`'s own allowance, in the other grammar.
const AT_RE = /^\d{1,2}:\d{2}$/;

export function isValidPriority(v: string): v is TaskPriority {
  return v === "high" || v === "normal" || v === "low";
}

// Parse one line into a task, or null if it isn't a ChronoAnvil task line. Blank
// lines and anything not starting with the `- ( )` marker return null so the
// caller can skip them (a region may hold stray whitespace).
export function parseTaskLine(line: string): ChronoAnvilTask | null {
  const m = CHECKBOX_RE.exec(line.trimEnd());
  if (!m) return null;
  const done = m[1].toLowerCase() === "x";
  const rest = m[2];

  let priority: TaskPriority = "normal";
  let due: string | null = null;
  let at: string | null = null;
  const extraFields: string[] = [];

  // Pull every inline field out of `rest`, then strip them from the text.
  FIELD_RE.lastIndex = 0;
  let f: RegExpExecArray | null;
  while ((f = FIELD_RE.exec(rest)) !== null) {
    const key = f[1].toLowerCase();
    const value = f[2].trim();
    if (key === "priority" && isValidPriority(value)) {
      priority = value;
    } else if (key === "due" && DUE_RE.test(value)) {
      due = value;
    } else if (key === "at" && AT_RE.test(value)) {
      at = padHour(value);
    } else {
      // Unknown field (or malformed known field): preserve verbatim.
      extraFields.push(`[${f[1]}:: ${value}]`);
    }
  }
  const text = rest.replace(FIELD_RE, "").replace(/\s+/g, " ").trim();

  // An hour with no day is not a time. Dropped rather than preserved, and
  // deliberately not pushed onto `extraFields`: round-tripping it would write
  // back a field this parser has just decided means nothing.
  return { done, text, priority, due, at: due ? at : null, extraFields };
}

// `9:05` from a hand-edited line becomes `09:05`, so one task cannot sort or
// compare differently from another that means the same minute.
function padHour(value: string): string {
  const [h, m] = value.split(":");
  return `${h.padStart(2, "0")}:${m}`;
}

// Serialize a task back to its canonical line. Priority is emitted only when
// not normal; due only when set; unknown fields appended after. Text is
// trimmed. The result re-parses to an equal task (round-trip stable).
export function serializeTaskLine(task: ChronoAnvilTask): string {
  const box = task.done ? "(x)" : "( )";
  const parts = [`- ${box} ${task.text.trim()}`.trimEnd()];
  if (task.priority !== "normal") parts.push(`[priority:: ${task.priority}]`);
  if (task.due) parts.push(`[due:: ${task.due}]`);
  if (task.due && task.at) parts.push(`[at:: ${task.at}]`);
  for (const raw of task.extraFields) parts.push(raw);
  return parts.join(" ");
}

// Parse a region's text block into a task list, skipping non-task lines.
export function parseTasks(regionText: string): ChronoAnvilTask[] {
  const out: ChronoAnvilTask[] = [];
  for (const line of regionText.split("\n")) {
    const t = parseTaskLine(line);
    if (t) out.push(t);
  }
  return out;
}

// Serialize a task list back to a region text block (newline-joined lines).
export function serializeTasks(tasks: ChronoAnvilTask[]): string {
  return tasks.map(serializeTaskLine).join("\n");
}

// Convenience for the widget: make a fresh normal task from typed text.
export function newTask(text: string): ChronoAnvilTask {
  return {
    done: false,
    text: text.trim(),
    priority: "normal",
    due: null,
    at: null,
    extraFields: [],
  };
}

// Move a task within the list, returning a new array. Out-of-range or no-op
// moves return the original array unchanged (identity preserved, so a caller
// can skip a write/repaint on a no-op — the same contract moveAttachment uses).
// Used by the Learning Path checklist's up/down reorder buttons.
export function moveTask(
  tasks: ChronoAnvilTask[],
  from: number,
  to: number
): ChronoAnvilTask[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= tasks.length ||
    to >= tasks.length
  ) {
    return tasks;
  }
  const next = tasks.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
