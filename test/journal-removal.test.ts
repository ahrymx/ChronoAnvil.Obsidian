// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import { BIN_FOLDER, binPathFor } from "../src/core/journal-removal";
import { ROOT_INFRASTRUCTURE } from "../src/core/constants";
import { readCode } from "./sources";

// ── the bin (4.17 §3) ─────────────────────────────────────────────────────
//
// Deleting a journal used to leave its folders exactly where they were and say
// so, which is the whole reason this release exists: a reader who wanted them
// gone did it by hand in the file explorer, and doing THAT before deleting the
// journal is what leaves a registration whose folder is missing.

describe("where a binned journal's folders go", () => {
  it("puts the bin under the infrastructure root", () => {
    // NOT AT THE VAULT ROOT, which would add a top-level folder to every vault
    // that ever deletes a journal, and NOT under the journals root, which would
    // leave a folder that journal-typing has to be taught to ignore.
    // `ROOT_INFRASTRUCTURE` already means "the machinery" as against the
    // reader's own writing, and a bin is machinery.
    expect(BIN_FOLDER).toBe(`${ROOT_INFRASTRUCTURE}/Bin`);
  });

  it("names the folder after the journal and the day", () => {
    expect(binPathFor("Cooking", "2026-08-10", () => false)).toBe(
      `${BIN_FOLDER}/Cooking-2026-08-10`
    );
  });

  it("suffixes rather than merging when the day is already taken", () => {
    // THE DATE IS NOT UNIQUE, and this is the case that proves the suffix is
    // load-bearing rather than decoration: two journals binned on one day would
    // otherwise land in one folder, interleaving two journals' subjects with
    // nothing to say which came from which.
    const taken = new Set([`${BIN_FOLDER}/Cooking-2026-08-10`]);
    expect(binPathFor("Cooking", "2026-08-10", (p) => taken.has(p))).toBe(
      `${BIN_FOLDER}/Cooking-2026-08-10-2`
    );
  });

  it("counts from 2, because the unsuffixed path is the first one", () => {
    // The off-by-one this function exists to get right. Starting at 1 would
    // name the SECOND binning "-1" while the first had no number at all.
    const taken = new Set([
      `${BIN_FOLDER}/Cooking-2026-08-10`,
      `${BIN_FOLDER}/Cooking-2026-08-10-2`,
      `${BIN_FOLDER}/Cooking-2026-08-10-3`,
    ]);
    expect(binPathFor("Cooking", "2026-08-10", (p) => taken.has(p))).toBe(
      `${BIN_FOLDER}/Cooking-2026-08-10-4`
    );
  });

  it("moves rather than deletes, through the mover that fixes links", () => {
    // `fileManager.renameFile`, NOT `vault.rename` — the former updates every
    // link that pointed into the folder, which is the difference between a
    // binned journal whose notes still resolve and a vault full of dead links.
    // A source assertion because the move needs a vault, which this suite has
    // no stub for; what it pins is the choice, which is the part that has been
    // got wrong elsewhere before.
    const src = readCode("journal-removal");
    expect(src).toContain("app.fileManager.renameFile(folder, target)");
    expect(src).not.toContain("vault.rename(");
    // AND NOTHING DELETES. Almanac has never removed a reader's note and the
    // bin is not where that starts — if either of these ever appears in this
    // module, a "bin" has become a shredder.
    expect(src).not.toContain("vault.delete(");
    expect(src).not.toContain("vault.trash(");
  });

  it("bins both of a journal's folders, not just its notes", () => {
    // Leaving the templates behind would leave a folder nothing references —
    // and one the NEXT journal of the same name collides with, which is the bug
    // one folder over from the one this release came from.
    expect(readCode("journal-removal")).toContain(
      "for (const path of [cfg.root, cfg.templatesFolder])"
    );
  });
});

describe("taking a journal out of settings", () => {
  it("resolves its trackers in the same step that removes it", () => {
    // A journal removed without its trackers resolved leaves them in the
    // registry, offerable nowhere, described by a raw id. Two callers reach
    // this now — the settings row and the wizard's refusal — and a resolution
    // that lives in one of them is the `journal-actions.ts` drift again: two
    // code paths for one idea, differing in ways nobody sees until they own a
    // journal that is not the one that was tested.
    const src = readCode("journal-removal");
    expect(src).toContain("customJournals.splice(index, 1)");
    expect(src).toContain("resolveOrphanedTrackers(");
    expect(src).toContain("await plugin.saveSettings()");
  });

  it("asks nothing itself, so each caller can ask what its case needs", () => {
    // The row has folders on disk and trackers to resolve; the refusal has
    // neither, which is exactly why it is allowed to offer a one-press delete.
    // A dialogue in here would be the wrong question in one of the two places.
    const src = readCode("journal-removal");
    expect(src).not.toContain("confirmAction(");
    expect(src).not.toContain("promptSuggester(");
  });

  it("is what the settings row deletes through", () => {
    // The extraction is only worth anything if the original caller uses it.
    const src = readCode("settings");
    expect(src).toContain("await removeJournal(this.plugin, index, how)");
    // AND THE OLD INLINE DELETION IS GONE rather than left beside it.
    expect(src).not.toContain("journals.splice(index, 1)");
  });

  it("moves the files before it drops the registration", () => {
    // ORDER IS THE ASSERTION. If the move fails, the journal is still
    // registered and still describes the folders it has — a state the reader
    // can act on. The other order leaves an unregistered journal whose folders
    // sit exactly where they were, which is the stale shape this whole release
    // is about.
    const src = readCode("settings");
    const moved = src.indexOf("moved = await binJournalFolders(");
    const removed = src.indexOf("await removeJournal(this.plugin, index, how)");
    expect(moved).toBeGreaterThan(0);
    expect(removed).toBeGreaterThan(0);
    expect(moved).toBeLessThan(removed);
  });

  it("does not ask where the folders go when there are none", () => {
    // The reported case: a reader who already deleted the folders by hand. A
    // picker offering to move two folders that do not exist is a question with
    // no true answer.
    expect(readCode("settings")).toContain("if (onDisk.length > 0) {");
  });
});
