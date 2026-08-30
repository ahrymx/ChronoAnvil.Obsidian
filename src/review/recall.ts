// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The ChronoAnvil recall format — question/answer pairs stored in a note's
// `<!--chronoanvil:KEY-->` body region (see notestore.ts), and the arithmetic that
// turns a session of grades into a confidence rating.
//
// This is the fourth thing that lives in those regions, alongside tasks
// (tasks.ts), attachments (attachments.ts) and list entries (entries.ts). Like
// entries, a pair is one line; unlike a task, it carries no state of its own:
//
//   <!--chronoanvil:recall
//   What is a closure? :: A function together with the scope it was defined in.
//   What does std::vector own? :: Its elements, contiguously, on the heap.
//   -->
//
// ── Why a pair carries no state ──────────────────────────────────────────
//
// The obvious thing to add is a per-card grade, or a per-card due date, and
// both are wrong here for the reason review.ts already gives: the unit of
// review is the *note*. `confidence` and `reviewed` live on the lesson, the
// queue schedules the lesson, and the trend plots the lesson. A second,
// finer-grained schedule hidden inside a body region would be a whole second
// SRS with its own parameters — exactly the tinkering review.ts declines — and
// the two would disagree about what to study the first time they were both
// consulted. A grade here is a fact about *this sitting*, so it lives in the
// widget's memory, is spent immediately on the note's confidence, and is gone.
//
// ── The separator ────────────────────────────────────────────────────────
//
// A pair splits on the first ` :: ` — spaced, deliberately. `std::vector` and
// `Array::map` are ordinary things to be quizzed on, and an unspaced `::`
// splitting them mid-token would make the format unusable for exactly the
// subjects most likely to use it. A literal spaced ` :: ` inside a question is
// escaped on write and decoded on read, the same trick notestore.ts uses to
// stop user content from closing an HTML comment early.
//
// These functions are pure string<->model transforms, so they unit-test
// without a vault. The App-facing render and the frontmatter write live in
// widgets.ts.

export interface RecallPair {
  question: string;
  answer: string;
}

const SEP = " :: ";
// Note that SEP is *not* a substring of ESCAPED_SEP (the backslash sits where
// the separator's leading space would have to be), so a plain indexOf for SEP
// steps over escaped occurrences without any lookbehind.
const ESCAPED_SEP = " \\:: ";

function escapeField(value: string): string {
  return value.split(SEP).join(ESCAPED_SEP);
}
function unescapeField(value: string): string {
  return value.split(ESCAPED_SEP).join(SEP);
}

// Collapse whitespace runs (including pasted newlines) to single spaces. A
// newline is what separates pairs, so one hiding inside a question would split
// it into two on the next read — the same rule entries.ts enforces, and for the
// same reason.
export function normalizeRecallText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function newPair(question: string, answer: string): RecallPair {
  return {
    question: normalizeRecallText(question),
    answer: normalizeRecallText(answer),
  };
}

// Parse one line into a pair, or null if the line holds nothing.
//
// A line with no separator is a question with no answer yet, rather than a
// parse failure. That is what makes the region hand-editable: typing a list of
// questions and filling the answers in later is a normal way to build a deck,
// and a stricter parse would silently drop every half-written line.
export function parseRecallLine(line: string): RecallPair | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const i = trimmed.indexOf(SEP);
  if (i === -1) return { question: unescapeField(trimmed), answer: "" };
  return {
    question: unescapeField(trimmed.slice(0, i)).trim(),
    answer: unescapeField(trimmed.slice(i + SEP.length)).trim(),
  };
}

// A pair with no question serializes to nothing at all, and the empty line is
// then dropped by serializeRecall. Not a filter on the finished line: `"" :: an
// answer` is a non-empty line, so filtering afterwards would keep it and it
// would re-parse into the same questionless pair — a blank prompt with a reveal
// button under it.
export function serializeRecallLine(pair: RecallPair): string {
  const q = escapeField(normalizeRecallText(pair.question));
  if (!q) return "";
  const a = escapeField(normalizeRecallText(pair.answer));
  return a ? `${q}${SEP}${a}` : q;
}

export function parseRecall(regionText: string): RecallPair[] {
  const out: RecallPair[] = [];
  for (const line of regionText.split("\n")) {
    const pair = parseRecallLine(line);
    if (pair) out.push(pair);
  }
  return out;
}

// Serialize pairs back to region text. A pair with no question at all is
// dropped: an answer with nothing to answer is not a card, and keeping it would
// render as a blank prompt with a reveal button.
export function serializeRecall(pairs: RecallPair[]): string {
  return pairs
    .map(serializeRecallLine)
    .filter((line) => line.length > 0)
    .join("\n");
}

// ── Grading ───────────────────────────────────────────────────────────────

// One card's verdict in this sitting. Two options, not five: a self-graded
// scale is a scale you calibrate differently on a good day, and the schedule it
// feeds (review.ts's five-step table) is already coarse enough that a third
// option would not move a due date most of the time.
export type RecallGrade = "got" | "missed";

export interface RecallTally {
  got: number;
  graded: number;
  total: number;
}

export function tally(
  grades: (RecallGrade | null)[],
  total = grades.length
): RecallTally {
  let got = 0;
  let graded = 0;
  for (const g of grades) {
    if (g == null) continue;
    graded++;
    if (g === "got") got++;
  }
  return { got, graded, total };
}

// The confidence a sitting earns, on the 1–5 scale the Confidence built-in
// already uses and review.ts already reads.
//
//   0/4 → 1     1/4 → 2     2/4 → 3     3/4 → 4     4/4 → 5
//
// A straight linear map of the proportion answered, with no ease factor, no
// carry-over from the previous rating and no floor on how far one bad sitting
// can drop you. That last is the point: confidence is meant to be a reading of
// how well it stuck *this time*, and a rating that only ratchets upward would
// make the trend a picture of how long you have owned the note.
//
// Returns null when nothing has been graded — there is no evidence to write,
// which is different from evidence of nothing.
export function confidenceFor(t: RecallTally): number | null {
  if (t.graded <= 0) return null;
  const score = t.got / t.graded;
  return Math.min(5, Math.max(1, 1 + Math.round(4 * score)));
}

// The running line under the cards. States the tally and what it currently
// earns, so the number that lands in frontmatter is never a surprise.
export function describeSession(t: RecallTally): string {
  if (t.graded === 0) {
    return t.total === 1 ? "1 card" : `${t.total} cards`;
  }
  const conf = confidenceFor(t);
  const scored = `${t.got} of ${t.graded}`;
  const left = t.total - t.graded;
  const tail = left > 0 ? ` · ${left} to go` : "";
  return `${scored} · confidence ${conf}/5${tail}`;
}

// ── Where a grade is written ──────────────────────────────────────────────

// The note a recall widget's grades belong to.
//
// A page is not a unit of review — it carries no confidence and never enters
// the queue, by the deliberate decision that a page's `type` is not one of its
// journal's kinds. So a recall block on a page grades the note the page belongs
// to: the folder note beside it, which is the promoted lesson.
//
// Path-derived, and only ever consulted when the caller has already decided the
// host *is* a page. The test cannot be "am I a folder note?" on its own: an
// unpromoted lesson sits in its topic's folder and is not a folder note either,
// so that rule would send its grades to the Topic index.
export function owningNotePath(hostPath: string, hostIsPage: boolean): string {
  if (!hostIsPage) return hostPath;
  const slash = hostPath.lastIndexOf("/");
  if (slash === -1) return hostPath;
  const dir = hostPath.slice(0, slash);
  const name = dir.slice(dir.lastIndexOf("/") + 1);
  if (!name) return hostPath;
  return `${dir}/${name}.md`;
}
