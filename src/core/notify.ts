// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Telling the reader what just happened.
//
// WHY THIS FILE EXISTS
//
// ChronoAnvil shows 112 notices. Thirty-seven of them carry a ✅ or ❌ marker and
// seventy-five do not, and among the marked ones thirty put it at the front and
// seven at the end. Nobody decided that; each notice was written where it was
// needed, and the marker went wherever it felt right that afternoon.
//
// The cost is not ugliness. It is that "should a notice be marked, and where"
// became a question with no answer and no single place to answer it — so the
// decision was re-made 37 times and came out three ways.
//
// WHAT THIS DECIDES, ONCE
//
// The marker LEADS, because it is scanned rather than read: a notice is a thing
// glimpsed while looking somewhere else, and a symbol at the end arrives after
// the sentence it was meant to frame. Thirty of the thirty-seven already agreed.
//
// And it is chosen by INTENT rather than passed in, so a caller says what kind
// of thing happened and not which glyph to draw. Which means the answer to
// "should we have these at all" is one line here rather than a sweep.
//
// WHAT IT DOES NOT DO
//
// It does not mark everything. The seventy-five unmarked notices stay unmarked
// through `notify.info` — that is the current majority behaviour, and promoting
// them all to ✅ would be a copy decision dressed as a refactor. A marker means
// "an action you asked for finished, or failed"; most notices are neither, and a
// screen where everything is flagged flags nothing.

import { Notice } from "obsidian";

const OK = "\u2705";
const FAIL = "\u274c";

// Default in Obsidian is 5s; the long form is for anything a reader may want to
// copy or read twice, which in practice is every multi-line report.
const LONG = 15000;

function show(prefix: string, text: string, ms?: number): Notice {
  const body = text.startsWith(prefix) ? text : `${prefix}${prefix ? " " : ""}${text}`;
  return new Notice(body, ms);
}

export const notify = {
  // An action the reader asked for finished.
  ok: (text: string, ms?: number): Notice => show(OK, text, ms),
  // An action the reader asked for could not be done. Not for programmer error
  // — that belongs in the console, where it can be read at leisure.
  fail: (text: string, ms?: number): Notice => show(FAIL, text, ms),
  // A statement about the world rather than an outcome: "nothing to change",
  // "this note isn't one a journal recognises". Unmarked, deliberately.
  info: (text: string, ms?: number): Notice => new Notice(text, ms),
  // A multi-line report, unmarked and given time to be read.
  report: (text: string): Notice => new Notice(text, LONG),
};
