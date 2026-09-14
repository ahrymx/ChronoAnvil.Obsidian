// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// One table where an index note has a stack of them. 1.0.16.
//
// *"I think page types can be consolidated on journal index pages, [Updates
// Decisions scratchpads] can become one."*
//
// `journal-sections.ts` composes the consolidated card from today; this is the
// same change made to a note that already exists. Every deepest index note and
// index template in every vault carries the per-kind stack — a group head, a
// create button and a table for each kind — and 4.16 §3's rule is that what is
// already on disk goes on rendering forever: `kind-table:lesson` draws exactly
// what it always drew, so nothing here is required for a vault to keep working.
// What it is required for is the reader getting the change they asked for on the
// notes they already have, which no recomposition reaches — `extend` only ever
// ADDS, and the section editor's Save composes nothing for a section it can see.
//
// ── WHY IT IS A MIGRATION AND NOT A REPAIR ──────────────────────────────
//
// It MOVES and DELETES lines the reader may have edited: a group head they
// renamed, a create button they left out. That is the property `regroupShippedPages`
// names as the reason its own rewrite is a tick rather than a default — *"the
// only thing in this release that MOVES a reader's blocks relative to each
// other, which is exactly why it is a tick and not a default"* — and this is the
// second such rewrite. It is offered with a diff, in the group whose whole
// subject is notes an older release wrote, and nothing runs unasked.
//
// ── AND WHY IT IS ALSO OFFERED THE MOMENT A KIND IS ADDED ───────────────
//
// `dashboard-catchup.ts` exists because `kind-change.ts` promises, unhedged,
// that *"Dashboards will offer to list the new type"*. Until this release that
// promise was kept by `extend`: a new kind meant a new part, and a note short of
// a part was offered the missing three lines. A consolidated card has no per-kind
// parts to be short of — one table lists every kind, including one added five
// minutes ago — so `extend` has nothing to say, and a reader adding a second kind
// to a journal whose notes carry the solo shape would be told nothing at all.
// This is what the offer becomes for them, which is why the pure function has two
// callers and one derivation.
//
// ── WHAT IT REFUSES ─────────────────────────────────────────────────────
//
// A fence holding no table of this type's kinds: there is nothing to consolidate
// and a `kind-table:something-else` is either another journal's or a kind that
// was deleted, and neither is this function's business.
//
// A type with one kind: its fence is what it has always been — bar, button,
// table — and is byte-identical to what the catalogue composes today.
//
// EVERYTHING ELSE IN THE FENCE STAYS WHERE IT IS, verbatim: the stack dividers,
// the banner and the tracker grid it may be welded to, a widget the reader added,
// a `frame:` or a `height:` they set. The rewrite is local to the lines the
// section itself composed.

import { segment } from "../core/layout";
import {
  headerLevel,
  parseHeaderDirective,
  splitDirective,
} from "../core/directive-grammar";
import { CHILDREN_BAR, kindPlural } from "./journal-sections";
import type { JournalType } from "./journal";

// Which lines of one fence body the per-kind stack occupies, and what replaces
// them.
//
// PURE, AND GIVEN A BODY RATHER THAN A FILE, so the walk below can hand it one
// fence at a time and the tests can hand it three lines.
function rewriteBody(body: string[], type: JournalType): string[] | null {
  const ids = new Set(type.kinds.map((k) => k.id));
  const tableOf = (line: string): string | null => {
    const { keyword, argument } = splitDirective(line.trim());
    if (keyword !== "kind-table") return null;
    const id = argument.trim();
    return id && ids.has(id) ? id : null;
  };

  // The tables this section owns, and the first of them — where the one table
  // that replaces them goes. Composed at the position of the FIRST, so the card
  // stays where the reader has it rather than moving to the top of the fence.
  const tables = body.map(tableOf);
  const first = tables.findIndex((id) => id !== null);
  if (first === -1) return null;

  // A group head is dropped only when the group it opens holds one of those
  // tables. A `header:2:` over something else is the reader's and stays.
  const dropped = new Set<number>();
  let head = -1;
  let headHolds = false;
  const closeGroup = (): void => {
    if (head >= 0 && headHolds) dropped.add(head);
    head = -1;
    headHolds = false;
  };
  let firstHead = true;
  for (let i = 0; i < body.length; i++) {
    const line = body[i].trim();
    const { keyword, argument } = splitDirective(line);
    if (keyword === "header") {
      const level = headerLevel(argument, firstHead);
      if (argument.trim() !== "") firstHead = false;
      closeGroup();
      // Level 2 is a group inside the section (5.12); the section's own bar is
      // level 1 and is never dropped — it is the card's name.
      if (level === 2) head = i;
      continue;
    }
    const table = tableOf(body[i]);
    if (table) {
      dropped.add(i);
      headHolds = true;
      continue;
    }
    // A per-kind create button, which the consolidated bar's own button
    // replaces. Matched on the type AND the kind, so a button for another
    // journal — a hand-written cross-link — is left alone.
    if (keyword === "button") {
      const [typeId, sub] = argument.split(":");
      if (typeId === type.id && sub?.startsWith("new-")) {
        const kindId = sub.slice("new-".length);
        if (ids.has(kindId)) {
          dropped.add(i);
          continue;
        }
      }
    }
  }
  closeGroup();
  if (!dropped.size) return null;

  const out: string[] = [];
  for (let i = 0; i < body.length; i++) {
    if (i === first) {
      out.push(`button:${type.id}:new`, "kind-table");
      continue;
    }
    if (dropped.has(i)) continue;
    out.push(body[i]);
  }
  // ── AND THE BAR, WHERE IT WAS NAMED AFTER THE ONE KIND ───────────────
  //
  // A type that HAD one kind composed its bar from that kind — "📖 Lessons"
  // over a table of lessons, which is right while there is nothing else in it
  // (`childrenBar`: *"a type with one kind is named by that kind"*). One table
  // over three kinds called "Lessons" would be a card naming a third of itself,
  // so the bar takes the section's own word.
  //
  // ONLY WHERE IT IS STILL THE COMPOSED SPELLING, exactly. A bar the reader
  // retitled is their sentence about their own card, and there is no reading of
  // this migration under which it gets to overwrite that — the table beneath it
  // widens either way.
  const composed = new Set(
    type.kinds.map((k) => `header:${k.emoji} ${kindPlural(k)}`)
  );
  const barAt = lastBarBefore(out, out.indexOf("kind-table"));
  if (barAt >= 0 && composed.has(out[barAt].trim())) {
    out[barAt] = `header:${CHILDREN_BAR}`;
  }
  return out;
}

// The section's own bar: the nearest titled `header:` above its table, once the
// group heads have been taken out.
//
// NEAREST RATHER THAN THE FENCE'S FIRST, because a welded index sits inside the
// banner's own fence (5.28) and a reader's stack can put anything above it.
//
// AN EXPLICIT `header:2:` IS NOT IT, and that is the whole of the test. Every
// group head holding one of this section's tables has already been dropped by
// the time this runs, so a `header:2:` still standing here belongs to something
// else — a band the reader grouped under a head of its own — and the thing it
// titles is not this card. A BARE head is read as the card's: the demotion rule
// makes it render as a group (`headerLevel`), but a note whose section bar was
// written before 5.12 spelled out the level is exactly the note this migration
// is for, and that bar is what the reader sees over the table.
function lastBarBefore(body: readonly string[], at: number): number {
  for (let i = at - 1; i >= 0; i--) {
    const { keyword, argument } = splitDirective(body[i].trim());
    if (keyword !== "header" || argument.trim() === "") continue;
    const head = parseHeaderDirective(argument);
    return head.explicit && head.level === 2 ? -1 : i;
  }
  return -1;
}

// One note or template, with its per-kind tables consolidated. `null` when
// there is nothing to do, which is what every caller tests — the same
// text-in/text-or-null-out shape every other migration in the tree has, so the
// dry run is the migration with the write taken off.
export function consolidateChildren(
  text: string,
  type: JournalType
): string | null {
  if (type.kinds.length < 2) return null;
  let changed = false;
  const out = segment(text.split("\n")).flatMap((seg) => {
    if (seg.kind !== "fence" || seg.fenceKind !== "chronoanvil") return seg.lines;
    const open = seg.lines[0];
    const close = seg.lines[seg.lines.length - 1];
    const body = seg.lines.slice(1, -1);
    // A fence with no closing line is not a fence this rewrites: `segment`
    // carries an unterminated one to the end of the file, and splicing its
    // "last line" would eat the reader's text.
    if (!close.trim().startsWith("```")) return seg.lines;
    const next = rewriteBody(body, type);
    if (!next) return seg.lines;
    changed = true;
    return [open, ...next, close];
  });
  return changed ? out.join("\n") : null;
}

// What the offer says it will do. One sentence, two windows.
//
// NAMES THE COUNT, because "consolidate the tables" on a note with one table
// and a head is a different change from the same words on a note with four, and
// the reader is deciding about a diff they can see beside it.
export function consolidateDetail(type: JournalType): string {
  return `draw one table over all ${type.kinds.length} note types instead of one each`;
}
