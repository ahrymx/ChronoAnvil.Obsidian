// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// 1.0.13 — the sentence that replaced a folder.
//
// THE BIN WAS A DESIGN, AND THIS SENTENCE IS WHAT IS LEFT OF IT. 4.50 sent a
// note to Obsidian's trash and was reported from a vault within the day —
// *"vault's trash doesn't seem to exist"* — because the vault's *Deleted files*
// setting can be **Permanently delete**, or a `.trash` folder the file explorer
// hides, and nothing on screen said which. 4.50.1 answered by making the
// destination a folder the reader could open: `00 - Infrastructure/Bin/`.
//
// The reader retired that, knowing what the setting is: *"I did not know obsidian
// had these options. This should be the default way for all chronoanvil's
// deletion processes; so remove the bin folder from 00 - infrastructure."*
//
// So the bin's whole job falls to `trashClause`, which is why it is pure and why
// it is tested here at all. A destination that is only knowable by opening a
// folder is knowable; a destination nobody states is the 4.50 report. These
// assertions are the ones that stop the report happening twice.

import { describe, expect, it } from "vitest";
import { trashClause, trashDestination } from "../src/core/trash";
import type { App } from "obsidian";
import { readCode, readSrc } from "./sources";

// Enough vault for the one untyped read. `getConfig` is not on Obsidian's public
// types, so the probe is a cast — and a fake that filled in the rest of `App`
// would be asserting that today's shape is today's shape.
const appWith = (config: unknown, throws = false): App =>
  ({
    vault: {
      getConfig: throws
        ? () => {
            throw new Error("no");
          }
        : () => config,
    },
  }) as unknown as App;

describe("the sentence that names where a deleted note goes", () => {
  it("names the system trash, and says it can be undone", () => {
    const text = trashClause("system");
    expect(text).toContain("system trash");
    expect(text).toContain("put it back");
  });

  it("names the vault's own .trash folder", () => {
    // A `.trash` inside the vault is the destination the 4.50 report was
    // actually looking at — the reader went hunting for it in the file explorer,
    // which hides dotfolders. Naming it is what turns "doesn't seem to exist"
    // into "look here".
    const text = trashClause("local");
    expect(text).toContain(".trash");
    expect(text).toContain("put it back");
  });

  it("says PERMANENTLY, and says the setting is why", () => {
    // THE ASSERTION THIS FILE EXISTS FOR. A reader who chose *Permanently
    // delete* chose it for every file in their vault and may well have
    // forgotten; the one thing that makes this destination safe to offer is the
    // sentence in front of the button. It must say the word, name the setting so
    // the reader can go and change it, and not promise an undo.
    const text = trashClause("none");
    expect(text).toContain("permanently deleted");
    expect(text).toContain("Deleted files");
    expect(text).toContain("cannot be undone");
    expect(text).not.toContain("put it back");
  });

  it("points at the setting when it cannot read it", () => {
    // A VAGUE SENTENCE THE READER CAN RESOLVE BEATS A CONFIDENT WRONG ONE.
    // `getConfig` is untyped and may be gone tomorrow; guessing "system trash"
    // and being wrong is how a note is lost by a plugin that sounded sure.
    const text = trashClause(null);
    expect(text).toContain("Settings → Files and links");
    expect(text).toContain("Deleted files");
    expect(text).not.toContain("put it back");
  });

  it("reads as a predicate, so one table serves both numbers", () => {
    // "Update will be moved…", "4 notes will be moved…". A clause rather than a
    // sentence is what keeps the caller from needing a second table for the
    // plural — every branch therefore starts the same way.
    for (const where of ["system", "local", "none", null] as const) {
      expect(trashClause(where), String(where)).toMatch(/^will be /);
      // AND NO FULL STOP AT THE END. The caller owns where the sentence stops,
      // because the caller is what knows whether anything follows — the row menu
      // adds "Links from your other notes to it will break." (`.trash` has a dot
      // in the middle of it, which is why this asks about the last character
      // rather than about the string.)
      expect(trashClause(where).endsWith("."), String(where)).toBe(false);
    }
  });
});

describe("reading the vault's Deleted files setting", () => {
  it("returns the three values Obsidian can hold", () => {
    expect(trashDestination(appWith("system"))).toBe("system");
    expect(trashDestination(appWith("local"))).toBe("local");
    expect(trashDestination(appWith("none"))).toBe("none");
  });

  it("is null for anything it does not recognise", () => {
    // Not a guess and not a default. The whole purpose of reading this is to
    // tell the reader the truth about it, so an unrecognised value has to fall
    // through to the sentence that names the setting instead of describing one.
    expect(trashDestination(appWith("bin"))).toBeNull();
    expect(trashDestination(appWith(undefined))).toBeNull();
    expect(trashDestination(appWith(null))).toBeNull();
  });

  it("is null when the read is not there at all", () => {
    // `vault.getConfig` is not on the public types. A version that drops it must
    // leave the plugin drawing a sentence rather than throwing inside a confirm.
    expect(trashDestination({ vault: {} } as unknown as App)).toBeNull();
  });

  it("is null when the read throws", () => {
    expect(trashDestination(appWith(null, true))).toBeNull();
  });
});

describe("the one deletion", () => {
  it("takes a TAbstractFile, so a folder goes whole", () => {
    // A promoted note is `Quadratics/Quadratics.md` with its pages beside it, so
    // deleting it is ONE call on the folder — the pages come along by
    // construction rather than by a list that could be wrong. That was `binAway`'s
    // rule and there is no reason for it to change with the destination.
    expect(readCode("trash.ts")).toContain(
      "export async function trashItem(app: App, item: TAbstractFile)"
    );
  });

  it("returns rather than throws, so one failure keeps the rest", () => {
    // Every caller deletes several things. A read-only path, or a file a sync is
    // holding open, is that one file's problem and must not take the other nine
    // with it.
    const text = readCode("trash.ts");
    expect(text).toContain("return false;");
    expect(text).toContain("console.error(");
  });

  it("names the paths it could not delete, not just how many", () => {
    // The next thing a reader does with a note that would not delete is go and
    // look at it, and "3 could not be deleted" sends them hunting.
    const text = readCode("trash.ts");
    expect(text).toContain("failed: string[]");
    expect(text).toContain("else failed.push(item.path);");
  });

  it("records the reversal it is, and quotes the reader", () => {
    // A module that silently un-decides 4.50.1 reads as a regression to the next
    // reader, who has `journal-removal.ts`' old invariant in front of them —
    // *ChronoAnvil has never removed a reader's note.* The reversal is the
    // reader's, it is dated, and the argument for why the DIAGNOSIS survived is
    // the part that stops the bin being rebuilt a third time.
    const text = readSrc("trash.ts");
    expect(text).toContain("remove the bin folder from 00 - infrastructure");
    expect(text).toContain("4.50.1");
  });
});
