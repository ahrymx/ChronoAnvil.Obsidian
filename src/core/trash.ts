// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Deleting something, the way the reader's vault says deletions happen. 1.0.13.
//
// ── THIS REVERSES 4.50.1, AND THE REVERSAL IS THE READER'S ───────────────
//
// 4.50 gave a title's row a *Move to bin* that called `fileManager.trashFile`,
// and a vault reported it inside the day: *"vault's trash doesn't seem to
// exist."* 4.50.1 read that as a design fault — Obsidian's *Deleted files*
// setting can be **Permanently delete**, or a `.trash/` folder the file explorer
// does not show — and answered it by building ChronoAnvil its own bin under
// `00 - Infrastructure/Bin/`, with an invariant written above the code:
//
//   *A MOVE, NEVER A DELETE. ChronoAnvil has never removed a reader's note and
//   this is not where that starts.*
//
// That was the right call from what was known then, and it is not the call the
// reader wants now. Shown the setting, they said: *"I did not know obsidian had
// these options. This should be the default way for all chronoanvil's deletion
// processes; so remove the bin folder from 00 - infrastructure."*
//
// So the diagnosis survives and the treatment changes. The fault in 4.50 was
// never that Obsidian's trash is the wrong destination — `attachment-widgets.ts`
// had already argued it is the right one for a file the reader added, because
// *"the vault's Deleted files setting is the answer they already gave for files
// like it"*. The fault was that NOTHING SAID WHERE THE FILE WAS GOING. A reader
// whose setting is *Permanently delete* pressed a button labelled "bin" and lost
// a note. The bin was one way to make the destination knowable; saying it out
// loud is the other, and it is the one that does not add a folder to the vault.
//
// Hence this module's two halves: the call, and the sentence about the call.
// Neither is optional and neither is a caller's to re-derive.
//
// ── A MODULE OF ITS OWN, NOT `util.ts` ───────────────────────────────────
//
// 4.50 lifted the trash probe into `util.ts` for a second caller, and 4.50.1 put
// it back because the second caller should never have existed. There genuinely
// are two now — a note, and an attachment — but `util.ts` is imported by almost
// everything here, and the one call in this plugin that can lose a reader's
// writing should not sit in the module nothing can avoid importing. A named
// module is the honest home: `import { trashItem } from "../core/trash"` says at
// the import line what the file is about to do.
//
// ── AND THE PROBE IS GONE ────────────────────────────────────────────────
//
// `fileManager.trashFile` was probed with `typeof fm.trashFile === "function"`
// and backed by `vault.trash(file, true)` because it was not on the public types
// when 4.50 was written. It is now — `@since 1.6.6`, and `manifest.json` asks
// for **1.7.0** — so every vault that can install this plugin has it. The probe
// was guarding against a version Obsidian will not let us run on.
//
// Dropping it is not only tidiness. `vault.trash(file, true)` FORCES the system
// trash and asks the setting nothing, so the fallback silently disagreed with
// the sentence this module now prints. A branch that can only be reached by
// lying to the reader is a branch to delete rather than to fix.

import { App, TAbstractFile } from "obsidian";

// What the vault does with a deleted file: the three values Obsidian's *Deleted
// files* setting can hold, plus `null` for "we could not find out".
export type TrashDestination = "system" | "local" | "none";

// Read the vault's *Deleted files* setting.
//
// `vault.getConfig` IS NOT ON THE PUBLIC TYPES, which is why this is a guarded
// cast rather than a call — the same shape as `configureGraphGroups` reading
// `vault.configDir` (`graph-groups.ts`) and `main.ts` probing for a view API.
// An unrecognised value is `null` rather than a guess, because the whole purpose
// of reading this is to tell the reader the truth about it.
//
// SEPARATE FROM `trashItem` ON PURPOSE. The destination is needed BEFORE the
// deletion, to write the question; the deletion needs none of it. Folding them
// together would mean a caller could only learn where a file went after sending
// it there.
export function trashDestination(app: App): TrashDestination | null {
  try {
    const vault = app.vault as unknown as {
      getConfig?: (key: string) => unknown;
    };
    if (typeof vault.getConfig !== "function") return null;
    const raw = vault.getConfig("trashOption");
    if (raw === "system" || raw === "local" || raw === "none") return raw;
    return null;
  } catch {
    return null;
  }
}

// The clause that completes "<what> …", naming where it is about to go.
//
// PURE, TAKING THE DESTINATION RATHER THAN AN APP, so the wording is testable
// without a vault — `binPathFor`'s rule in the module this replaces, and for the
// same reason: this is the part that has to be right, and it is the part a vault
// makes hard to look at.
//
// READS AS A PREDICATE, so it composes with a singular or a plural subject
// without a second table: *"Update-2026-09-13 will be moved to your system
// trash"*, *"4 notes will be moved to your system trash"*.
//
// THE `none` CASE NAMES THE SETTING. A reader who has chosen *Permanently
// delete* has chosen it for every file in their vault and may well have
// forgotten; the one thing that makes this destination safe to offer is that the
// sentence in front of the button says so, in the words Obsidian's own settings
// use. This sentence is 4.50.1's bin, discharged as prose.
export function trashClause(where: TrashDestination | null): string {
  switch (where) {
    case "system":
      return "will be moved to your system trash, where you can put it back";
    case "local":
      return "will be moved to the vault's .trash folder, where you can put it back";
    case "none":
      return "will be permanently deleted — your Deleted files setting is set to permanent, so this cannot be undone";
    default:
      // The setting could not be read. Say that, and point at it: a vague
      // sentence the reader can resolve themselves beats a confident one that
      // might be wrong about where their note went.
      return "will be deleted, according to Settings → Files and links → Deleted files";
  }
}

// Delete one thing. `true` if it went.
//
// `TAbstractFile`, NOT `TFile`, so a promoted note goes as its folder in ONE
// call — `Quadratics/Quadratics.md` and its pages leave together by construction
// rather than by a list that could be wrong. That is the rule `binAway` kept and
// there is no reason for it to change with the destination.
//
// RETURNS RATHER THAN THROWS, because every caller deletes several things and
// the report a reader needs is *what went*, not *what was asked for* — a
// read-only path or a file a sync is holding open fails on its own and must not
// take the other nine with it. The console gets the error; the caller gets a
// count.
export async function trashItem(app: App, item: TAbstractFile): Promise<boolean> {
  try {
    await app.fileManager.trashFile(item);
    return true;
  } catch (e) {
    console.error("[ChronoAnvil] could not delete", item.path, e);
    return false;
  }
}

// Delete several things. Reports what went and what did not.
//
// TWO SURFACES GENUINELY DO THIS, which is the bar `recordList`'s 4.13.3 round
// trip set for sharing a helper at all: a title's pages, deleted from the row
// menu, and a selection of notes from *What's below*. Both delete a list and both
// have to report honestly about a partial result, and that reporting rule is the
// part worth having in one place.
//
// IT RETURNS THE FAILED PATHS, NOT A COUNT OF THEM. A reader whose delete left
// three notes behind needs to know WHICH three, because the next thing they do is
// look at them; "3 could not be deleted" sends them to hunt.
//
// NO EARLY RETURN. One failure must not take the rest of the list with it — a
// read-only path or a file a sync is holding open is that one file's problem.
export async function trashSeveral(
  app: App,
  items: readonly TAbstractFile[]
): Promise<{ deleted: number; failed: string[] }> {
  let deleted = 0;
  const failed: string[] = [];
  for (const item of items) {
    if (await trashItem(app, item)) deleted += 1;
    else failed.push(item.path);
  }
  return { deleted, failed };
}
