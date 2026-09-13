// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Taking a journal out of ChronoAnvil, and deciding what happens to its folders.
// 4.17 §2 and §3.
//
// WHY THIS LEFT `settings.ts`
//
// The deletion lived inside `renderJournalRow`, in the row's own click handler,
// and that was fine while the row was the only door onto it. 4.17 adds a second:
// the journal wizard's root-collision refusal can now offer to delete the
// registration that is blocking it, because the reader's folders are gone and
// the registration is the only thing left in the way.
//
// TWO DELETIONS THAT RESOLVE TRACKERS DIFFERENTLY IS THE FAULT THIS AVOIDS, and
// it is not hypothetical — `journal-actions.ts`' header is thirty lines about
// exactly that shape, where Study's four commands and every other journal's four
// commands drifted in three separate ways because they were two code paths for
// one idea. A journal has trackers scoped to it; removing the journal has to
// answer for them, and an answer that exists in one caller and not the other is
// a stranded tracker described by a raw id.
//
// So: one function that removes a journal, and the callers decide only how to
// ASK. The row asks with a confirm and two pickers; the refusal asks with a
// button, because in its case there is nothing on disk to ask about.

import { App, normalizePath, TFolder } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import type { JournalConfig } from "../journals/custom-journal";
import { trashItem } from "./trash";
import {
  OrphanResolution,
  resolveOrphanedTrackers,
  trackersScopedToType,
} from "../trackers/trackers";

// ── WHAT USED TO BE HERE, AND WHY IT IS NOT (1.0.13) ─────────────────────
//
// This module owned ChronoAnvil's bin: `BIN_FOLDER` at `00 - Infrastructure/Bin`,
// a `binPathFor` that named `<journal>-<date>` with a collision suffix, and a
// `binAway` / `binTogether` pair that every deletion in the plugin went through.
// Above them stood the invariant the whole design served:
//
//   *A MOVE, NEVER A DELETE, and the wording everywhere this surfaces says so.
//   ChronoAnvil has never removed a reader's note and this is not where that
//   starts.*
//
// That paragraph is superseded rather than deleted, because the next reader will
// otherwise re-derive the bin from first principles — it is a good idea, and it
// was ours twice.
//
// ITS PREMISE WAS THAT THE READER HAD NOT BEEN ASKED. 4.50 sent a note to
// Obsidian's trash, a vault reported *"vault's trash doesn't seem to exist"*
// within the day, and 4.50.1 concluded that a plugin must not pick a destination
// the reader never chose. The bin was how it avoided picking one.
//
// The reader has now picked one: *"I did not know obsidian had these options.
// This should be the default way for all chronoanvil's deletion processes; so
// remove the bin folder from 00 - infrastructure."*
//
// So the premise was half right. A plugin must not choose — and **Obsidian
// already asks this question once**, in Settings → Files and links → *Deleted
// files*, for every file in the vault. A bin of our own was a second answer to a
// question the reader had already answered somewhere else, and the thing 4.50
// actually got wrong was never the destination: it was that nothing on screen
// said what the destination WAS. `trash.ts` carries that sentence now, and
// carrying it is the whole of what the bin was for.
//
// WHAT IS GENUINELY LOST, AND IT IS NOT NOTHING. `binAway` moved through
// `fileManager.renameFile`, so every link that pointed at a binned note followed
// it and still resolved. A deletion cannot do that, and no wording makes it
// untrue. Every confirm that reaches this behaviour says the links will break,
// in `attachment-widgets.ts`' own words, because that is the cost the reader is
// agreeing to and it is theirs to weigh.

// Delete a journal's folders. Returns what actually went.
//
// BOTH FOLDERS, because both are the journal's own and are derived from its
// name. Leaving the templates behind would leave a folder that nothing
// references and that the next journal of the same name would collide with —
// which is the bug 4.17 came from, one folder over.
//
// PER-FOLDER, THROUGH THE ONE HELPER, and it returns the paths rather than a
// boolean: `trashItem` can fail on one folder and succeed on the other — a sync
// holding a note open, a read-only path — and the caller's notice has to be able
// to say which. A flat "deleted" over a journal half of which is still on disk is
// the kind of report that costs an hour.
//
// IT NO LONGER TAKES A DATE. The date existed to name a bin folder; a deletion
// has nowhere to write one.
export async function trashJournalFolders(
  app: App,
  cfg: JournalConfig
): Promise<string[]> {
  const gone: string[] = [];
  for (const path of [cfg.root, cfg.templatesFolder]) {
    const clean = normalizePath((path ?? "").trim().replace(/\/+$/, ""));
    if (!clean) continue;
    const folder = app.vault.getAbstractFileByPath(clean);
    if (!(folder instanceof TFolder)) continue;
    // A FOLDER GOES WHOLE, IN ONE CALL. `trashItem` takes a `TAbstractFile` for
    // exactly this: the notes inside come with it by construction rather than by
    // a list this function would have to build and could get wrong.
    if (await trashItem(app, folder)) gone.push(clean);
  }
  return gone;
}

// Which of a journal's folders are actually on disk.
//
// The question the row has to ask before offering to delete them, and the
// question the wizard's refusal asks to decide whether it may offer a delete at
// all. Both
// want the same answer and neither should be re-deriving "does this exist" from
// its own idea of the paths.
export function journalFoldersOnDisk(app: App, cfg: JournalConfig): string[] {
  return [cfg.root, cfg.templatesFolder]
    .map((p) => normalizePath((p ?? "").trim().replace(/\/+$/, "")))
    .filter((p) => p !== "")
    .filter((p) => app.vault.getAbstractFileByPath(p) instanceof TFolder);
}

// Take the journal out of settings, and answer for its trackers.
//
// THE SETTINGS WRITE AND THE TRACKER RESOLUTION ARE ONE STEP because a journal
// removed without its trackers resolved leaves them in the registry, offerable
// nowhere, described by a raw id — the state the row's own comment calls
// "stranded" and refuses to reach silently. Making that two calls would let a
// caller make exactly half of this change.
//
// IT DOES NOT ASK ANYTHING. Every dialogue is the caller's, because the two
// callers have genuinely different questions to put: the row has folders on disk
// and trackers to resolve, and the refusal has neither — its journal's folders
// are gone, which is why it is allowed to offer the button in the first place.
export async function removeJournal(
  plugin: ChronoAnvilPlugin,
  index: number,
  how: OrphanResolution
): Promise<void> {
  const cfg = plugin.settings.customJournals[index];
  if (!cfg) return;
  const orphaned = trackersScopedToType(plugin.settings.trackers, cfg.id);
  plugin.settings.customJournals.splice(index, 1);
  if (orphaned.length > 0) {
    plugin.settings.trackers = resolveOrphanedTrackers(
      plugin.settings.trackers,
      cfg.id,
      how
    );
  }
  await plugin.saveSettings();
  await plugin.journals.rebuildJournalHome();
}
