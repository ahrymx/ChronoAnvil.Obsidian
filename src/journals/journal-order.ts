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
// `applyJournalOrder` IS THE PRIMITIVE AND `moveJournalBefore` IS SUGAR, rather
// than the other way round, because the window works on a whole list — a reader
// nudges four rows and presses Save once — and a drag works on a pair. A whole
// list expressed as a sequence of pairwise moves would write four times and fire
// four repaints; a pair expressed as a whole list costs one array copy.

import type AlmanacPlugin from "../main";

// The journal ids, in the order every surface draws them.
export function journalOrder(plugin: AlmanacPlugin): string[] {
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
  plugin: AlmanacPlugin,
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

// Lift `fromId` out and drop it in `beforeId`'s slot. The drag's semantics.
//
// LIFT-AND-INSERT, NOT SWAP, which is `SectionEditor.attachDrag`'s rule said
// again for the same reason: dragging a card three places up should move it
// three places, not trade it with whatever happened to be there. Both indices
// are read AFTER the removal, from the same list, so the arithmetic cannot be
// off by one at the ends.
//
// Dropping a journal on itself, or naming one that is not there, is a no-op
// rather than an error: a drag that ends where it started is a reader changing
// their mind, and that is not a failure to report.
export async function moveJournalBefore(
  plugin: AlmanacPlugin,
  fromId: string,
  beforeId: string
): Promise<boolean> {
  if (fromId === beforeId) return false;
  const ids = journalOrder(plugin);
  if (!ids.includes(fromId) || !ids.includes(beforeId)) return false;
  const rest = ids.filter((id) => id !== fromId);
  rest.splice(rest.indexOf(beforeId), 0, fromId);
  return applyJournalOrder(plugin, rest);
}
