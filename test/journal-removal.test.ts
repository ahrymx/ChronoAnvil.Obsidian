// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import { readCode, readSrc, srcFiles } from "./sources";

// ── the bin is gone, and the reader retired it (1.0.13) ───────────────────
//
// THIS BLOCK USED TO BE TWENTY-ONE ASSERTIONS ABOUT A PATH. `BIN_FOLDER` sat
// under `00 - Infrastructure`, `binPathFor` named `<journal>-<date>` with a
// collision suffix that counted from 2 and put itself before the extension, and
// `binAway` / `binTogether` moved single items and sets through it. All of it was
// 4.17 §3 and 4.50.1, and all of it went in 1.0.13 because the reader asked for
// it to: *"I did not know obsidian had these options. This should be the default
// way for all chronoanvil's deletion processes; so remove the bin folder from
// 00 - infrastructure."*
//
// THE TESTS THAT GO WITH A FUNCTION ARE GONE; THE TESTS THAT WERE ABOUT A RULE
// ARE NOT. Three rules outlived the bin and are asserted below in their new
// form, because a rule dropped alongside the code it happened to be written
// about is a rule nobody will notice re-breaking:
//
//   * A FOLDER GOES WHOLE, IN ONE CALL. It was `renameFile` on the folder; it is
//     `trashItem` on the folder. The reason is unchanged — the notes inside come
//     with it by construction rather than by a list this code would have to
//     build and could get wrong.
//   * BOTH OF A JOURNAL'S FOLDERS, or the next journal of the same name collides
//     with the templates folder nothing references. That is the bug 4.17 came
//     from, one folder over, and it has nothing to do with destinations.
//   * WHAT ACTUALLY WENT, NOT WHAT WAS ASKED FOR, because the operation can fail
//     per folder.
//
// AND `vault.rename` IS STILL WRONG EVERYWHERE. This module no longer moves
// anything, so its own negative assertion had nowhere to live; `renameFile` vs
// `vault.rename` is a rule about links, not about bins, and it is pinned across
// the whole tree below rather than dropped with the function that used to keep it.

describe("deleting a journal's folders", () => {
  it("sends each folder whole, through the one deletion", () => {
    // A `TAbstractFile`, so the notes inside come along by construction. A loop
    // over the files would be a list to get wrong, and it is the model 4.50 built
    // the bin on before 4.50.1 threw it out.
    const src = readCode("journal-removal");
    expect(src).toContain("if (await trashItem(app, folder)) gone.push(clean);");
    expect(readCode("trash.ts")).toContain(
      "export async function trashItem(app: App, item: TAbstractFile)"
    );
  });

  it("deletes both of a journal's folders, not just its notes", () => {
    // Leaving the templates behind would leave a folder nothing references —
    // and one the NEXT journal of the same name collides with, which is the bug
    // one folder over from the one 4.17 came from. Unchanged by the destination.
    expect(readCode("journal-removal")).toContain(
      "for (const path of [cfg.root, cfg.templatesFolder])"
    );
  });

  it("returns what went rather than a boolean", () => {
    // A delete can fail on one folder and succeed on the other — a sync holding
    // a note open, a read-only path — and the caller's notice has to be able to
    // say which. A flat "deleted" over a journal half of which is still on disk
    // is the kind of report that costs an hour.
    const src = readCode("journal-removal");
    expect(src).toContain("Promise<string[]>");
    expect(src).toContain("return gone;");
  });

  it("takes no date, because there is no folder to name", () => {
    // The date existed to name `<journal>-<date>` inside the bin. A deletion has
    // nowhere to write one, and a parameter kept for symmetry is a parameter the
    // next caller will try to mean something by.
    const src = readCode("journal-removal");
    expect(src).toContain(
      "export async function trashJournalFolders(\n  app: App,\n  cfg: JournalConfig\n)"
    );
    expect(src).not.toContain("today()");
  });

  it("keeps no bin of its own", () => {
    // Not merely unused — ABSENT. A constant still naming
    // `00 - Infrastructure/Bin` would be read by the next reader as the
    // destination, and a `binPathFor` still exported would be called.
    const src = readCode("journal-removal");
    for (const gone of ["BIN_FOLDER", "binPathFor", "binAway", "binTogether"]) {
      expect(src, gone).not.toContain(gone);
    }
  });

  it("supersedes the invariant rather than deleting it", () => {
    // *A MOVE, NEVER A DELETE. ChronoAnvil has never removed a reader's note and
    // this is not where that starts.* That paragraph was the whole design, and a
    // reader who finds it simply gone will re-derive the bin from first
    // principles — it is a good idea, and it was ours twice. So the module has to
    // carry why it existed, who retired it, and what the reversal costs.
    // `readSrc`, NOT `readCode` — the latter strips comment lines, and the
    // superseded argument IS a comment. This is the one assertion in this file
    // whose subject is the prose rather than the code.
    const src = readSrc("journal-removal");
    expect(src).toContain("A MOVE, NEVER A DELETE");
    expect(src).toContain("remove the bin folder from 00 - infrastructure");
    // THE COST, NAMED. `binAway` used `fileManager.renameFile`, so links followed
    // a binned note. A delete cannot, and that is the one genuine loss in the
    // reversal rather than a wording change.
    expect(src).toContain("says the links will break");
    // AND THE SURFACE THAT SAYS IT ACTUALLY SAYS IT. A header promising a
    // sentence nothing prints is the shape this whole patch is about.
    expect(readCode("kind-row-menu.ts")).toContain(
      "Links from your other notes to ${them} will break."
    );
  });
});

describe("a move is always the mover that fixes links", () => {
  it("is never vault.rename, anywhere in the tree", () => {
    // `fileManager.renameFile` updates every link that pointed at what moved;
    // `vault.rename` does not. That is the difference between a moved note that
    // still resolves from the rest of the vault and a page of broken links, and
    // `journal.ts` and `header-title.ts` both argue it at length.
    //
    // IT LIVED HERE BECAUSE THIS MODULE USED TO MOVE THINGS. It no longer does,
    // and a rule dropped with the function it was written about is a rule nobody
    // notices re-breaking — so it is swept over the whole of `src/` instead,
    // which is where it was always true.
    const offenders = srcFiles()
      .filter((f) => f.code.includes("vault.rename("))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("and this module deletes rather than moving at all now", () => {
    const src = readCode("journal-removal");
    expect(src).not.toContain("renameFile(");
    expect(src).toContain("trashItem(");
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
    const moved = src.indexOf("gone = await trashJournalFolders(");
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
