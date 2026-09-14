// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// A stack of tables where an index note has one. The reversal of 1.0.16.
//
// *"I think the implementation got things backwards. the index pages above the
// deepest depth should gain a "Notes" column for the count, and the type field
// can be removed entirely and reverted to the collapsible sections"*
//
// 1.0.16 consolidated the deepest index's *What's below* into a single table
// with a Type column and shipped `children-consolidate.ts` to make that change
// to the notes already on disk. Rendered, the Type column said "Lesson" twice
// down a two-row table and the second kind's rating column was empty on both
// rows — `perKindTables` in `tables.ts` records what was on the screen. The
// consolidation belonged one level up, where a column per note kind was empty
// on four rows of four; `folderRollup` draws one count column now, and the
// deepest index draws the per-kind groups again.
//
// This is the other half of that reversal: the notes the merge already reached,
// put back. `journal-sections.ts` composes the per-kind stack from today; this
// is the same shape written into a note that exists.
//
// ── WHY THERE IS A MIGRATION AT ALL FOR A RELEASE NOBODY HAD ────────────
//
// 1.0.16 was built, packaged and installed in the development vaults, and never
// tagged, released or published — so the only notes in the consolidated shape
// are on this machine. CLAUDE.md states what happens next: ChronoForge's
// read-compatibility *"for vaults no reader could have"* was deleted once the
// development vaults were migrated, and the same rule applies here. This file,
// the bare `kind-table` branch in `buildKindTable`, the bare `new` button and
// `JournalManager.newNoteAsking` are one set, and they go together the release
// after the vaults are put right. Nothing about the 1.0.16 shape survives into
// a vault anyone else can have.
//
// ── AND WHY IT IS A MIGRATION AND NOT A REPAIR ──────────────────────────
//
// It MOVES and DELETES lines: one bar's create button becomes a head, a button
// and a table per kind, and the reader may have edited any of it. That is the
// property `regroupShippedPages` names as the reason its own rewrite is a tick
// rather than a default — *"the only thing in this release that MOVES a
// reader's blocks relative to each other, which is exactly why it is a tick and
// not a default"*. It is offered with a diff, in the group whose whole subject
// is notes an older release wrote, and nothing runs unasked.
//
// ── ONE DOOR, WHERE THE MERGE HAD TWO ───────────────────────────────────
//
// `consolidateChildren` was also wired into `offerDashboardCatchup`, because a
// consolidated card has no per-kind part to be short of and `extend` therefore
// had nothing to say when a reader added a note type — which would have broken
// `kind-change.ts`'s unhedged promise that *"Dashboards will offer to list the
// new type"*. With the parts back, `extend` keeps that promise by itself again,
// so this has the repair window and nothing else.
//
// ── WHAT IT REFUSES ─────────────────────────────────────────────────────
//
// A fence with no bare `kind-table` in it: there is nothing to split. A
// `kind-table:lesson` is already the shape this writes, and a `kind-table` in
// another journal's fence is not this type's business.
//
// A type with fewer than two kinds: a one-kind fence is what it has always been
// — bar, button, table — byte-identical across 1.0.16 in both directions.
//
// EVERYTHING ELSE IN THE FENCE STAYS WHERE IT IS, verbatim: the bar, the stack
// dividers, the banner and the tracker grid it may be welded to, a widget the
// reader added, a `frame:` or a `height:` they set. The rewrite is local to the
// two lines 1.0.16 composed.
//
// AND THE BAR IS NOT TOUCHED. `🗂️ What's below` is what a multi-kind card is
// called under both shapes — `childrenBar` composes it either way — so there is
// no renaming to undo. The merge had to retitle a bar named after the one kind
// a type used to have; going back, that bar is already the generic word and the
// groups beneath it take the kinds' own names.

import { segment } from "../core/layout";
import { splitDirective } from "../core/directive-grammar";
import { kindPlural } from "./journal-sections";
import type { JournalType } from "./journal";

// Which lines of one fence body 1.0.16 composed, and what replaces them.
//
// PURE, AND GIVEN A BODY RATHER THAN A FILE, so the walk below can hand it one
// fence at a time and the tests can hand it two lines.
//
// THE PER-KIND STACK IS SPELLED HERE AND NOT IMPORTED FROM `childrenParts`,
// which is the one place this departs from "one derivation, two readers".
// `childrenParts` takes a `SectionContext` — a type, a depth, a level, the
// reader's own field overrides — and this has a type and a fence. Building a
// context to reach three lines would mean guessing the depth of a note this
// function never reads, and guessing wrong on a journal whose levels the
// reader has since changed. The lines are asserted against `childrenParts`'
// real output in `children-split.test.ts`, which is the check that keeps them
// honest for the one release this file exists.
function rewriteBody(body: string[], type: JournalType): string[] | null {
  const bareTable = (line: string): boolean => {
    const { keyword, argument } = splitDirective(line.trim());
    return keyword === "kind-table" && argument.trim() === "";
  };
  const at = body.findIndex(bareTable);
  if (at === -1) return null;

  // The create button 1.0.16 put on the bar, which the per-kind buttons
  // replace. MATCHED ON THE TYPE, so a `button:other:new` a reader hand-wrote
  // as a cross-link to another journal is left alone; and only where it is
  // ABOVE the table, which is where the composer wrote it — a bare `new` below
  // the table is not a line this release ever composed and is therefore the
  // reader's.
  const composedButton = `button:${type.id}:new`;
  const dropped = new Set<number>([at]);
  for (let i = at - 1; i >= 0; i--) {
    const line = body[i].trim();
    if (line === "") continue;
    if (line === composedButton) dropped.add(i);
    break;
  }

  const stack = type.kinds.flatMap((kind) => [
    // LEVEL 2, WRITTEN OUT, which is what `childrenParts` composes and the
    // reason it does: the renderer reads a bare second head as a group anyway,
    // but a note written today should say what it draws.
    `header:2:${kind.emoji} ${kindPlural(kind)}`,
    `button:${type.id}:new-${kind.id}`,
    `kind-table:${kind.id}`,
  ]);

  const out: string[] = [];
  for (let i = 0; i < body.length; i++) {
    // AT THE POSITION OF THE TABLE, so the card stays where the reader has it.
    // The button above it was 1.0.16's and goes; the first group's own button
    // lands here instead.
    if (i === at) {
      out.push(...stack);
      continue;
    }
    if (dropped.has(i)) continue;
    out.push(body[i]);
  }
  return out;
}

// One note or template, with its consolidated table split back into the
// per-kind stack. `null` when there is nothing to do, which is what every
// caller tests — the same text-in/text-or-null-out shape every other migration
// in the tree has, so the dry run is the migration with the write taken off.
export function splitChildren(
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
// NAMES THE COUNT, because "split the table" on a journal with two note types
// is a different change from the same words on one with four, and the reader is
// deciding about a diff they can see beside it.
export function splitDetail(type: JournalType): string {
  return `draw a table for each of the ${type.kinds.length} note types instead of one over all of them`;
}
