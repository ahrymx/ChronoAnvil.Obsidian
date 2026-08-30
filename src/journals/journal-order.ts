// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// What order the journals are in, and the one write that changes it. 4.40.
//
// ── THERE IS NO ORDER FIELD, AND THAT IS THE GOOD NEWS ───────────────────
//
// `registeredJournalTypes` is `settings.customJournals.map(buildJournalType)`,
// so the ARRAY is the order and always has been — every surface that lists
// journals already draws them in it. Reordering is therefore a permutation of a
// list the plugin already owns: no new field, no migration, nothing to keep in
// step with a folder that a reader might rename behind us.
//
// Study included. It is not a special case in that array — it is the first entry
// of it — which is why this file never mentions it.
//
// ── ONE MOVE, TWO SURFACES ───────────────────────────────────────────────
//
// The homepage draws journals as cards and the Journals page draws them as
// sections, and 4.40 gives each the affordance that suits its shape: the cards
// are dragged, and the sections are reordered from a window behind a button on
// the header bar. Those are two gestures and they must not be two rules. Both
// end here.
//
// `applyJournalOrder` IS THE PRIMITIVE AND `moveJournalOnto` IS SUGAR, rather
// than the other way round, because the window works on a whole list — a reader
// nudges four rows and presses Save once — and a drag works on a pair. A whole
// list expressed as a sequence of pairwise moves would write four times and fire
// four repaints; a pair expressed as a whole list costs one array copy.

import type ChronoAnvilPlugin from "../main";
import { dropOnto } from "../core/drop-onto";

// The journal ids, in the order every surface draws them.
export function journalOrder(plugin: ChronoAnvilPlugin): string[] {
  return (plugin.settings.customJournals ?? []).map((j) => j.id);
}

// Reorder `customJournals` to match `ids`, then save and repaint.
//
// TOLERANT OF A LIST THAT IS NOT A PERMUTATION, and deliberately: the window
// that calls this has been open while the settings tab could have added or
// removed a journal, so `ids` is a WISH about order and not a claim about
// membership. An id that no longer exists is dropped; a journal the list never
// mentions keeps its place relative to the others at the end. The alternative —
// refusing the whole write because one id went stale — would lose four
// deliberate moves to one unrelated change.
//
// Returns whether anything actually moved, so a caller can stay quiet about a
// save that changed nothing. `saveSettings` is debounced and content-compared
// downstream, but the REPAINT is not: notifying on a no-op would rebuild every
// journals widget on every open note to draw the same thing.
export async function applyJournalOrder(
  plugin: ChronoAnvilPlugin,
  ids: readonly string[]
): Promise<boolean> {
  const current = plugin.settings.customJournals ?? [];
  const seen = new Set<string>();
  const wanted: typeof current = [];
  for (const id of ids) {
    // `find` rather than a map, because a list that names the same journal twice
    // is malformed input and must not produce it twice in the settings.
    if (seen.has(id)) continue;
    const cfg = current.find((j) => j.id === id);
    if (!cfg) continue;
    seen.add(id);
    wanted.push(cfg);
  }
  for (const cfg of current) if (!seen.has(cfg.id)) wanted.push(cfg);

  if (wanted.every((cfg, i) => cfg === current[i])) return false;

  plugin.settings.customJournals = wanted;
  await plugin.saveSettings();
  // THE SIGNAL THE WIDGETS ALREADY LISTEN TO. `buildJournalCardsRegion` and
  // `buildJournalsRegion` both register on it, for the reason stated there:
  // adding or removing a journal changes what they contain without touching a
  // file they watch. Reordering is that case exactly — no file changes at all.
  plugin.notifyJournalTypesChanged();
  return true;
}

// Lift `fromId` out and drop it in `ontoId`'s slot. The drag's semantics.
//
// RENAMED FROM `moveJournalBefore` IN 4.45.1, AND THE OLD NAME WAS THE BUG
// SAID OUT LOUD. It inserted before the target in both directions, so dragging
// a card onto the one directly below it did nothing whatever — lift it out,
// put it back before the card that has just moved up into its place, and the
// list is unchanged. Every downward drop landed one place short.
//
// This function's own test described the right rule — *"dropping Study onto
// Media means Study goes where Media is"* — and then asserted the wrong
// arrangement underneath it. A comment is not a test.
//
// The rule, the direction and the no-op contract are all `dropOnto`'s now; see
// `core/drop-onto.ts`, which the chart grid and the section editor call too.
// What is left here is the settings read and write around it.
export async function moveJournalOnto(
  plugin: ChronoAnvilPlugin,
  fromId: string,
  ontoId: string
): Promise<boolean> {
  const next = dropOnto(journalOrder(plugin), fromId, ontoId);
  if (!next) return false;
  return applyJournalOrder(plugin, next);
}
