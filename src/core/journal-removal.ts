// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Taking a journal out of Almanac, and deciding what happens to its folders.
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
import type AlmanacPlugin from "../main";
import type { JournalConfig } from "../journals/custom-journal";
import { ROOT_INFRASTRUCTURE } from "./constants";
import { ensureFolder } from "./util";
import {
  OrphanResolution,
  resolveOrphanedTrackers,
  trackersScopedToType,
} from "../trackers/trackers";

// Where a binned journal's folders go.
//
// UNDER `00 - Infrastructure` BECAUSE THAT CONSTANT ALREADY MEANS "the
// machinery" — the templates, the documentation, the `.base` files — as opposed
// to the reader's own writing. A bin is machinery. Putting it at the vault root
// would add a top-level folder to every vault that ever deletes a journal, and
// putting it under the journals root would leave a folder that journal-typing
// has to be taught to ignore.
export const BIN_FOLDER = `${ROOT_INFRASTRUCTURE}/Bin`;

// `<bin>/<name>-<date>`, with a suffix when that is taken.
//
// THE DATE IS NOT UNIQUE AND THE SUFFIX IS NOT DECORATION. Deleting two
// journals called Cooking on one day — or the same one twice, after re-adopting
// it — would otherwise put both into one folder, interleaving two journals'
// subjects with no way to tell which came from which. The suffix is what makes
// each binning its own object.
//
// PURE, TAKING `taken` RATHER THAN AN APP, so the numbering rule is testable
// without a vault. Everything else in this module needs one; this does not, and
// it is the part with an off-by-one in it.
export function binPathFor(
  folderName: string,
  date: string,
  taken: (path: string) => boolean
): string {
  const base = `${BIN_FOLDER}/${folderName}-${date}`;
  if (!taken(base)) return base;
  // From 2, because the unsuffixed path IS the first one.
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken(candidate)) return candidate;
  }
}

// Move a journal's folders into the bin. Returns what actually moved.
//
// A MOVE, NEVER A DELETE, and the wording everywhere this surfaces says so.
// Almanac has never removed a reader's note and this is not where that starts:
// the bin is an ordinary folder in the vault, the reader empties it themselves,
// and until they do the notes are all still there.
//
// `fileManager.renameFile`, NOT `vault.rename` — the former updates every link
// that pointed into the folder, which is the difference between a binned journal
// whose notes still resolve and a vault full of broken links. `journal.ts` and
// `header-title.ts` both argue this at length for the rename case; a move is the
// same operation with a different destination.
//
// BOTH FOLDERS, because both are the journal's own and are derived from its
// name. Leaving the templates behind would leave a folder that nothing
// references and that the next journal of the same name would collide with —
// which is the bug this release came from, one folder over.
export async function binJournalFolders(
  app: App,
  cfg: JournalConfig,
  date: string
): Promise<string[]> {
  const moved: string[] = [];
  for (const path of [cfg.root, cfg.templatesFolder]) {
    const clean = normalizePath((path ?? "").trim().replace(/\/+$/, ""));
    if (!clean) continue;
    const folder = app.vault.getAbstractFileByPath(clean);
    if (!(folder instanceof TFolder)) continue;
    const name = clean.split("/").pop() ?? clean;
    const target = binPathFor(
      name,
      date,
      (p) => app.vault.getAbstractFileByPath(p) !== null
    );
    await ensureFolder(app, BIN_FOLDER);
    await app.fileManager.renameFile(folder, target);
    moved.push(target);
  }
  return moved;
}

// Which of a journal's folders are actually on disk.
//
// The question the row has to ask BEFORE offering the bin, and the question the
// wizard's refusal asks to decide whether it may offer a delete at all. Both
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
  plugin: AlmanacPlugin,
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
