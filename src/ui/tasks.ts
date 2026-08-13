// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Almanac task format — a small, self-owned line format stored inside a
// note's `<!--almanac:todo-->` region (see notestore.ts). Almanac renders and
// edits these itself; it deliberately does NOT use the Tasks plugin's emoji
// syntax or Dataview, so there's no external dependency and the raw file stays
// clean and Almanac-specific.
//
// On-disk line grammar (one task per line):
//
//   - ( ) Draft the proposal [priority:: high] [due:: 2026-07-25]
//   - ( ) Water plants
//   - (x) Reply to email [priority:: low]
//
// - `- ( )` / `- (x)` is the checkbox — an Almanac-unique marker (not `- [ ]`),
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

export interface AlmanacTask {
  done: boolean;
  text: string;
  priority: TaskPriority;
  // ISO date YYYY-MM-DD, or null when unset.
  due: string | null;
  // Inline fields we don't recognize, kept as raw `[k:: v]` strings so a
  // round-trip preserves them. Empty for the common case.
  extraFields: string[];
}

const CHECKBOX_RE = /^-\s*\(\s*([xX ]?)\s*\)\s?(.*)$/;
// Matches a single `[key:: value]` inline field. Global; used to pull all out.
const FIELD_RE = /\[([a-zA-Z][\w-]*)::\s*([^\]]*)\]/g;
const DUE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidPriority(v: string): v is TaskPriority {
  return v === "high" || v === "normal" || v === "low";
}

// Parse one line into a task, or null if it isn't an Almanac task line. Blank
// lines and anything not starting with the `- ( )` marker return null so the
// caller can skip them (a region may hold stray whitespace).
export function parseTaskLine(line: string): AlmanacTask | null {
  const m = CHECKBOX_RE.exec(line.trimEnd());
  if (!m) return null;
  const done = m[1].toLowerCase() === "x";
  const rest = m[2];

  let priority: TaskPriority = "normal";
  let due: string | null = null;
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
    } else {
      // Unknown field (or malformed known field): preserve verbatim.
      extraFields.push(`[${f[1]}:: ${value}]`);
    }
  }
  const text = rest.replace(FIELD_RE, "").replace(/\s+/g, " ").trim();

  return { done, text, priority, due, extraFields };
}

// Serialize a task back to its canonical line. Priority is emitted only when
// not normal; due only when set; unknown fields appended after. Text is
// trimmed. The result re-parses to an equal task (round-trip stable).
export function serializeTaskLine(task: AlmanacTask): string {
  const box = task.done ? "(x)" : "( )";
  const parts = [`- ${box} ${task.text.trim()}`.trimEnd()];
  if (task.priority !== "normal") parts.push(`[priority:: ${task.priority}]`);
  if (task.due) parts.push(`[due:: ${task.due}]`);
  for (const raw of task.extraFields) parts.push(raw);
  return parts.join(" ");
}

// Parse a region's text block into a task list, skipping non-task lines.
export function parseTasks(regionText: string): AlmanacTask[] {
  const out: AlmanacTask[] = [];
  for (const line of regionText.split("\n")) {
    const t = parseTaskLine(line);
    if (t) out.push(t);
  }
  return out;
}

// Serialize a task list back to a region text block (newline-joined lines).
export function serializeTasks(tasks: AlmanacTask[]): string {
  return tasks.map(serializeTaskLine).join("\n");
}

// Convenience for the widget: make a fresh normal task from typed text.
export function newTask(text: string): AlmanacTask {
  return { done: false, text: text.trim(), priority: "normal", due: null, extraFields: [] };
}

// Move a task within the list, returning a new array. Out-of-range or no-op
// moves return the original array unchanged (identity preserved, so a caller
// can skip a write/repaint on a no-op — the same contract moveAttachment uses).
// Used by the Learning Path checklist's up/down reorder buttons.
export function moveTask(
  tasks: AlmanacTask[],
  from: number,
  to: number
): AlmanacTask[] {
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
