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

import { App, normalizePath, TAbstractFile, TFile, TFolder } from "obsidian";
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
//
// `ext` IS FOR BINNING A FILE (4.50.1). A journal is folders and needed none;
// a title that was never promoted is a single `.md`, and a binned note that has
// lost its extension is a note Obsidian will not open. **The suffix goes before
// the extension**, or the collision rule produces `Quadratics-2026-08-20.md-2`.
export function binPathFor(
  folderName: string,
  date: string,
  taken: (path: string) => boolean,
  ext = ""
): string {
  const stem = `${BIN_FOLDER}/${folderName}-${date}`;
  if (!taken(`${stem}${ext}`)) return `${stem}${ext}`;
  // From 2, because the unsuffixed path IS the first one.
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}${ext}`;
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

// Bin one thing the reader is finished with: a note, or a folder note and
// everything in it. 4.50.1.
//
// ── WHY THIS EXISTS, AND WHAT IT REPLACES ────────────────────────────────
//
// 4.50 gave a title's row a *Move to bin*, and it went to OBSIDIAN's trash
// through `fileManager.trashFile`. That is a second bin behind the same word,
// and the module it should have read is this one — which had already decided
// where a bin goes, why it goes there, and that **a move is not a delete**:
//
//   *A MOVE, NEVER A DELETE, and the wording everywhere this surfaces says so.
//   Almanac has never removed a reader's note and this is not where that
//   starts.*
//
// A `trashFile` on a reader's journal note is exactly where that starts. It was
// reported from a vault as *"vault's trash doesn't seem to exist"*, which is the
// symptom; the fault is that the plugin had an answer and the new surface did
// not use it.
//
// ── A FOLDER NOTE BINS AS ITS FOLDER ─────────────────────────────────────
//
// A promoted title is `Quadratics/Quadratics.md` with its pages beside it, so
// binning it is ONE rename of the folder — the pages come with it by
// construction rather than by a list that could be wrong. That is also what
// makes the bin honest: what comes back out is the note and its pages arranged
// the way they were.
//
// `fileManager.renameFile`, NEVER `vault.rename`, for `binJournalFolders`'
// reason one screen up: the former updates every link that pointed at what
// moved, which is the difference between a binned note that still resolves from
// the rest of the vault and a page of broken links.
export async function binAway(
  app: App,
  item: TAbstractFile,
  date: string
): Promise<string | null> {
  const isFile = item instanceof TFile;
  const name = isFile ? item.basename : item.name;
  const ext = isFile ? `.${item.extension}` : "";
  const target = binPathFor(
    name,
    date,
    (p) => app.vault.getAbstractFileByPath(p) !== null,
    ext
  );
  try {
    await ensureFolder(app, BIN_FOLDER);
    await app.fileManager.renameFile(item, target);
    return target;
  } catch (e) {
    console.error("[Almanac] could not bin", item.path, e);
    return null;
  }
}

// Bin several files together, into one folder of their own.
//
// ONE FOLDER RATHER THAN N LOOSE FILES, and this is the whole reason it is not
// `binAway` in a loop. A note's pages are *Roots*, *Graphs*, *Examples* — names
// that mean something under their parent and nothing at the top of a bin, where
// next week they sit beside another note's *Examples*. The folder is what says
// which note they came out of.
//
// RETURNS THE FOLDER AND HOW MANY LANDED IN IT, because `renameFile` can fail
// per file and a report of what was ASKED FOR is the kind that costs an hour.
export async function binTogether(
  app: App,
  items: readonly TAbstractFile[],
  folderName: string,
  date: string
): Promise<{ target: string; moved: number }> {
  const target = binPathFor(
    folderName,
    date,
    (p) => app.vault.getAbstractFileByPath(p) !== null
  );
  let moved = 0;
  await ensureFolder(app, target);
  for (const item of items) {
    try {
      await app.fileManager.renameFile(item, `${target}/${item.name}`);
      moved += 1;
    } catch (e) {
      console.error("[Almanac] could not bin", item.path, e);
    }
  }
  return { target, moved };
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
