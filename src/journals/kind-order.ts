// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Which order one note lists its note types in. 1.0.72.
//
// ── THE ASK, AND WHY IT IS A WRITE TO THE NOTE ───────────────────────────
//
// *"implement up/down buttons to re-order note types within the edit window"*.
//
// THE DIRECTIVE ORDER IS THE RENDER ORDER. A *What's below* card draws its
// groups down the page in the order its fence lists them — `childrenParts`
// composes a `header:2:`, a create button and a `kind-table:<id>` per type, and
// the dispatcher renders them in the order it meets them. So this answer lives
// in the note's own fence and nowhere else, which is the same place the
// Attachments window's category order lives and for the same reason.
//
// THE JOURNAL'S OWN `kinds` ORDER IS A DIFFERENT QUESTION and is deliberately
// untouched: it decides which type is PRIMARY (`typeRating`, the `primary`
// create button) and what order a freshly composed index lists them in. Moving
// a type there would change every note of that journal and change nothing on
// the note the window is named after.
//
// ── THE LIST IS THE ANSWER, NOT A SEQUENCE OF MOVES ──────────────────────
//
// 1.0.49's rule for the same control one window over. The editor hands back the
// ids in the order its rows are showing and this works out what that means for
// the file, so a move costs what a rename costs and a move that is undone
// before Save costs nothing at all.
//
// ── WHAT IS PERMUTED, AND WHAT IS NEVER TOUCHED ──────────────────────────
//
// ONLY THE GROUPS' OWN LINES CHANGE PLACES. The section's bar, the fence
// delimiters, a stack's other sections, anything a reader has written between
// two groups — all of it stays on the line it was on, because the write puts
// the n-th asked group's lines into the n-th group SLOT rather than rebuilding
// the fence. Recomposing it would be the simpler code and would silently
// discard every edit the reader had made inside it.
//
// A GROUP THE WINDOW DOES NOT LIST STAYS WHERE IT IS. That is a kind the
// journal has lost (`strayParts`' subject — the window draws no row for it,
// because there is no type left to carry the answers) and its slot is skipped
// rather than filled, so 1.0.23's `prune` still finds it exactly where it was.

import { partGroups, sectionOfId } from "./journal-plan";
import {
  CHILDREN_SECTION_ID,
  sectionsFor,
  type SectionContext,
} from "./journal-sections";

// ── AND NO `kindOrderIn` BESIDE IT, ON PURPOSE ───────────────────────────
//
// A helper reading the ids back out was written here first, for the tests to
// check the write with. It is gone: a test that asks this module what this
// module wrote cannot tell a correct permutation from a consistent mistake, so
// the suite reads the `kind-table:` lines out of the text itself. Nothing in
// the plugin needs it either — the window's rows come from the CARD, which is
// the same order already rendered.
function groupsIn(
  text: string,
  ctx: SectionContext
): { id: string; from: number; to: number }[] | null {
  const section = sectionOfId(sectionsFor(ctx), CHILDREN_SECTION_ID);
  if (!section) return null;
  const groups = partGroups(text.split("\n"), section, ctx);
  return groups.length ? groups : null;
}

// ── ONE FENCE, CHECKED RATHER THAN ASSUMED ───────────────────────────────
//
// `partGroups` walks the whole file, and a note CAN hold two fences that each
// carry `kind-table:` lines — a reader who added a second *What's below* block,
// or a template half-reconciled against a journal that gained a type. Swapping
// a group across that boundary would move a table out of the card it was in,
// which is a structural change nobody asked for and the one failure here that
// cannot be undone by pressing the other arrow.
//
// COUNTED, NOT PARSED. The depth is how many fence delimiters stand above the
// line; every group must share it, and it must be odd, which is what "inside a
// fence" means when the file is read as a list of lines.
function fenceDepth(lines: readonly string[], at: number): number {
  let n = 0;
  for (let i = 0; i < at; i++) if (/^\s*```/.test(lines[i])) n++;
  return n;
}

// The note's text with its groups re-ordered, or null where nothing would
// change.
//
// NULL IS "DO NOT WRITE", and every refusal returns it: no groups, a list that
// names none of them, an order the file already has, or groups spread over more
// than one fence. The no-op-write rule — *a `process` that leaves a file
// identical still moves its modified time, which is a lie about the reader's
// vault that sync then propagates.*
export function planKindOrder(
  text: string,
  ctx: SectionContext,
  ids: readonly string[]
): string | null {
  const groups = groupsIn(text, ctx);
  if (!groups) return null;

  const lines = text.split("\n");
  const depth = fenceDepth(lines, groups[0].from);
  if (depth % 2 === 0) return null;
  if (groups.some((g) => fenceDepth(lines, g.from) !== depth)) return null;

  // The slots this list is allowed to fill, and the ids that fill them. Both
  // are filtered the same way — by the other list — so a window naming a type
  // the fence has lost and a fence holding one the window has lost both narrow
  // to the same set rather than to two sets that disagree about its size.
  const here = new Set(groups.map((g) => g.id));
  const asked = ids.filter((id) => here.has(id));
  const slots = groups.filter((g) => asked.includes(g.id));
  if (slots.length !== asked.length) return null;

  const chunk = new Map(
    groups.map((g) => [g.id, lines.slice(g.from, g.to + 1)] as const)
  );
  const moved = new Map(slots.map((g, i) => [g.from, asked[i]] as const));

  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const g = groups.find((x) => x.from === i);
    if (!g) {
      out.push(lines[i]);
      continue;
    }
    // A slot nobody asked about keeps its own lines; one that was asked takes
    // the lines of whichever group the reader put there.
    out.push(...(chunk.get(moved.get(i) ?? g.id) as string[]));
    i = g.to;
  }

  const next = out.join("\n");
  return next === text ? null : next;
}
