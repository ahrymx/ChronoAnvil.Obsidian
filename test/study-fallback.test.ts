// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// `?? STUDY_JOURNAL` — the fallback, and its removal. 3.19.1.
//
// WHY THIS IS ITS OWN CHANGE, ahead of retiring Study as a built-in (§3 of the
// 3.18 follow-ups). The follow-up lists this first among that item's risks:
// "STUDY_JOURNAL is used as a fallback, not just as a journal … Delete the
// constant and every one of those needs a real answer — probably 'draw
// nothing', which is more correct and is a behaviour change on notes outside
// every root."
//
// It is a behaviour change, and it is one that can be made and judged on its own
// merits without a migration attached. Bundling it into §3 would put a visible
// change to what unclassified notes render inside the same commit as a
// settings migration, on the population of notes least likely to be backed by
// anything — which is exactly the pairing a bisect cannot separate.
//
// WHAT WAS WRONG WITH IT. The fallback read "this note is in no registered
// journal, assume the plausible shape". Study was the only journal when these
// widgets were written, so the assumption was historical rather than plausible,
// and it survived into a plugin where Study can be TURNED OFF ENTIRELY. A stray
// note then got its nouns, its kinds and its rating property from a journal the
// reader may have disabled.
//
// THE SUITE WAS SILENT ON ALL OF IT. Removing every one of the five call sites
// broke no existing test, which is the honest reason this file exists: the
// fallback was load-bearing for nothing that was ever asserted.

import { describe, expect, it } from "vitest";
import { readCode } from "./sources";

const tables = (): string => readCode("tables");
const header = (): string => readCode("study-header");
const journal = (): string => readCode("journal");

describe("no widget borrows Study's identity any more", () => {
  it("has no `?? STUDY_JOURNAL` left in the widget layer", () => {
    // The whole of the change, stated once. Comments may still describe the old
    // behaviour; code may not perform it.
    const code = [tables(), header()].join("\n");
    expect(code).not.toMatch(/\?\?\s*STUDY_JOURNAL[^`]/);
  });

  it("resolves a host note's type without a default", () => {
    expect(tables()).toContain("): JournalType | null {");
    expect(tables()).toContain(
      "return journalTypeAtPath(plugin, notePath) ?? null;"
    );
  });

  it("draws nothing rather than something borrowed", () => {
    // The widgets that read `hostType` all build into a `root` they return, and
    // all of them already return it empty when the note has no parent — so
    // "nothing" was an answer they already knew how to give.
    //
    // COUNTED SITES BECAME A CHECKED PROPERTY IN 4.16. This asserted that the
    // string `if (!type) return root;` appeared exactly four times, which was
    // true and was pinning the arrangement rather than the rule: 4.16 §1 moved
    // two of those four to resolve their type in a caller and hand it in, and a
    // count cannot tell that apart from a guard being deleted. What has to hold
    // is that no reader of `hostType` uses its answer without checking it —
    // which is the sentence above, and is what is checked now.
    const src = tables();
    const sites = [...src.matchAll(/const type = hostType\([^)]*\);/g)];
    expect(sites.length, "readers of hostType").toBeGreaterThanOrEqual(4);
    for (const site of sites) {
      const after = src.slice((site.index ?? 0) + site[0].length);
      // The guard is the next STATEMENT, allowing for the comment paragraphs
      // this file writes between them.
      const next = after
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("//"))[0];
      // TWO SHAPES OF THE ONE RULE AS OF 4.46, AND THE RULE IS UNCHANGED: no
      // reader of `hostType` uses its answer without checking it.
      //
      // The first shape returns: a widget that can only describe a journal draws
      // nothing on a note in none. The second CARRIES the null — `stats-band`
      // renders at three scopes and "no journal here" is one of them, so it hands
      // the nullable straight to `statScopeOf` and every later read is guarded
      // individually. That second shape is checked by the test below, which is
      // stronger than this one: it asserts the band never dereferences `type` at
      // all.
      expect(next, `unguarded hostType at ${site.index}`).toMatch(
        /^if \(!type\)|^const scope = statScopeOf\(/
      );
    }
  });

  it("lets the band carry a null type rather than dereference it", () => {
    // THE HALF THE GUARD TEST ABOVE CANNOT SEE. `buildStatsBand` is the one
    // reader of `hostType` that does not return early, because a note in no
    // journal is a scope it draws — the vault, every registered journal's root
    // unioned. So what has to hold there is not "it returned" but "it never
    // reads a member off the thing that may be null".
    //
    // ASSERTED OVER THE FUNCTION BODY, not the file: `belowOf` and `totalCells`
    // beside it take a `JournalType` that has already been checked and read its
    // members freely, which is correct and would fail a file-wide match.
    const src = tables();
    const start = src.indexOf("export function buildStatsBand(");
    expect(start, "buildStatsBand").toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf("\n}\n", start));
    // Comments in this project describe old code, so they are stripped before a
    // negative match — the house rule from RESUME §6.
    const code = body
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    expect(code).not.toMatch(/\btype\.[a-zA-Z]/);
    // And it does reach the type's contents, through the optional chain and
    // through helpers that take it — so the assertion above is not passing
    // because nothing uses it.
    expect(code).toContain("type?.kinds");
    expect(code).toContain("soleKindOf(type)");
  });

  it("stops counting Study-shaped notes on a note in no journal", () => {
    // `confidenceKinds` returns the `type:` values that count as rated notes.
    // For a note outside every root the honest answer is none — it used to be
    // Study's kinds, so an average counted whatever Study-shaped notes were
    // lying around nearby.
    expect(tables()).toMatch(/const type = journalTypeAtPath\(plugin, notePath\);\s*\n\s*if \(!type\) return \[\];/);
  });

  it("shows no activity date rather than a foreign one", () => {
    // `metaFor` reads this list as "which `type:` values count as activity".
    expect(header()).toContain("(type?.kinds ?? []).map((k) => k.id)");
  });

  it("keeps the permissive default where it was already the documented one", () => {
    // `isContainerFolder` already answered "still a container" for a folder
    // with no folder note. A folder note whose type names nothing we recognise
    // is the same case — and reading Study's kinds there made a stray note
    // saying `type: lesson` a LEAF in a vault that may not have Study on.
    expect(tables()).toMatch(/if \(!type\) return true;/);
  });
});

describe("what null means where it is now accepted", () => {
  it("journalChildFolders takes a null type", () => {
    expect(journal()).toContain("type: JournalType | null,");
  });

  it("and reads it as `every registered root is foreign`", () => {
    // Which is what an unclassified host actually means. Study-as-stand-in only
    // approximated it, and got it wrong in the two cases that matter: a vault
    // where Study is off, and one where its root has been moved.
    expect(journal()).toContain("t.id !== type?.id");
  });
});

describe("a Study journal is created where the reader put Study", () => {
  it("reads the registered journal rather than the shipped constant", () => {
    // `STUDY_JOURNAL` is Study built from the SHIPPED defaults, so a call site
    // holding it created notes under the default folder however the reader had
    // configured theirs. 3.19.1 fixed one of the three entry points; 3.20 fixed
    // the rest, and reads them from the store, which is where a reader's root
    // AND their renames now both live.
    const src = journal();
    expect(src).toContain("this.newTopLevel(this.studyJournal()!)");
    expect(src).toContain("this.newContainer(this.studyJournal()!, 1, subjectArg)");
    expect(src).toContain("this.newNote(this.studyJournal()!, type, folderArg)");
    expect(src).not.toMatch(/new(TopLevel|Container|Note)\(STUDY_JOURNAL/);
  });

  it("says it is missing rather than disabled", () => {
    // "Turned off" was a state only Study could be in. It is an ordinary
    // journal now, so the only state left is absent — and the notice says how
    // to get one back rather than which toggle to flip.
    const src = journal();
    expect(src).toContain("studyMissingNotice");
    expect(src).not.toContain("studyDisabledNotice");
    expect(src).toContain("Start from Study");
  });
});

describe("what is left for §3", () => {
  it("STUDY_JOURNAL is still a journal, just no longer a default", () => {
    // The constant stays: it is Study-with-shipped-defaults, which every test
    // and several callers legitimately want. What has gone is its second job —
    // standing in for journals it is not.
    expect(journal()).toContain("export const STUDY_JOURNAL");
  });
});
