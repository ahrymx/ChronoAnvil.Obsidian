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
import { readCode, readSrc, srcFiles } from "./sources";

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
    expect(text).toContain("permanently removed");
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

// ── AND THE FOURTH SURFACE TO REACH IT (1.0.43) ──────────────────────────
//
// *"Add 'Delete Note' to right click context menu on diary-calendar day cells"*,
// then *"rename it to Remove Note"*.
//
// A diary entry is the one kind of note this plugin creates on a single click,
// and until now there was no gesture anywhere on that card for removing one — a
// day opened by accident had to be undone in the file explorer. The row is on the
// cell because the cell is the only place in the plugin that names a day.
//
// WHAT IS WORTH ASSERTING IS THE SENTENCE, not the menu. A new caller of
// `trashItem` that forgets `trashClause` is the 4.50 report happening again: a
// reader whose *Deleted files* setting is **Permanently delete** presses a button
// and loses a note nothing warned them about. That is the sweep below.

describe("the day cell's Remove note", () => {
  const menu = (): string => readCode("events/event-ui.ts");

  it("is offered only where there is a note to remove", () => {
    // `locateEntry` probes the period tree AND the grain's old flat folder, so a
    // vault that has never been repaired is answered about the note it actually
    // has. A row that says "Remove note…" over a day with no note is a control
    // that can only fail; one that misses an un-migrated entry is worse, because
    // it claims the day is empty.
    const src = menu();
    expect(src).toContain(
      'const entry = locateEntry(app, plugin.settings.paths, "daily", iso);'
    );
    const at = src.indexOf("const entry = locateEntry(");
    const guarded = src.slice(at, src.indexOf("menu.showAtMouseEvent", at));
    expect(guarded).toContain("if (entry) {");
    expect(guarded).toContain('.setTitle("Remove note…")');
    // Last, after a separator. Obsidian's `Menu` has no danger styling to lean
    // on, so position and distance are all that says this row is different.
    expect(guarded).toContain("menu.addSeparator();");
  });

  it("says where the note is going before it asks", () => {
    const src = menu();
    const at = src.indexOf("async function removeDayEntry(");
    expect(at).toBeGreaterThan(0);
    const body = src.slice(at, src.indexOf("\n}", at));
    expect(body).toContain("trashClause(trashDestination(app))");
    // The path is the evidence and the DATE is the title: a reader right-clicked
    // a cell in a month grid, and `Day-2026-09-27.md` answers a question they did
    // not ask.
    expect(body).toContain("Remove the entry for ${day}?");
    expect(body).toContain("${entry.path} ");
    // And the one real loss, in the house's own wording.
    expect(body).toContain("will break");
    // Destructive, and the confirm's own label repeats the verb rather than
    // saying "Confirm" — a reader who reads only the button should still know.
    expect(body).toContain('"Remove note",\n    true');
  });

  it("reports a deletion that did not happen", () => {
    // `trashItem` returns rather than throws, so a caller that ignores the answer
    // prints a success over a note still sitting there.
    const body = menu();
    expect(body).toContain("if (!(await trashItem(app, entry)))");
    expect(body).toContain("notify.fail(");
    expect(body).toContain("notify.ok(");
  });

  it("no longer claims to be about events alone", () => {
    // The menu's own comment used to say a right-click *"is for the events layer,
    // and the two stay separate"*. That rule was about CREATING — two gestures
    // making the same entry is one too many — and nothing here creates. A function
    // still called `openDayEventMenu` is how the next person adding a row gets
    // that argument wrong.
    expect(menu()).toContain("export function openDayCellMenu(");
    expect(menu()).not.toContain("openDayEventMenu");
    expect(readCode("ui/widgets/directive-regions.ts")).toContain(
      "openDayCellMenu(plugin.app, plugin, iso, evt, () => live.refresh())"
    );
  });
});

describe("every surface that deletes names the destination", () => {
  // THE INVARIANT THAT STOPS THE 4.50 REPORT HAPPENING A SECOND TIME, and it is a
  // sweep rather than four assertions because the failure arrives with a NEW
  // caller: whoever adds the fifth delete is the person this is written for.
  const OWNERS = [
    "ui/widgets/below-edit.ts",
    "ui/widgets/attachment-widgets.ts",
    "ui/widgets/kind-row-menu.ts",
    "events/event-ui.ts",
  ];

  it("prints the clause wherever it calls the delete", () => {
    for (const file of OWNERS) {
      const src = readCode(file);
      expect(src, file).toMatch(/trash(Item|Several)\(/);
      expect(src, file).toContain("trashClause(trashDestination(");
    }
  });

  it("allows exactly one module to delete without asking", () => {
    // `core/journal-removal.ts` deletes and prints no clause, and that is right:
    // it is the ACT, not the surface. Its caller — the settings tab's *Remove
    // journal* — writes the question, clause and all. A module that both asks and
    // acts would be two confirms for one deletion the day a second surface calls
    // it.
    const act = readCode("core/journal-removal.ts");
    expect(act).toContain("trashItem(");
    expect(act).not.toContain("trashClause");
    expect(readCode("core/settings.ts")).toContain(
      "trashClause(trashDestination(this.app))"
    );
  });
});

// ── ONE VERB (1.0.43) ────────────────────────────────────────────────────
//
// *"Use remove globally instead of delete."*
//
// The rename came from a row this release added: a day cell's *Remove note…*
// sat one menu away from a title row's *Delete note…*, same act, same confirm,
// same `trashItem`. Two words for one act make the reader ask what the second
// one does differently, and the answer was nothing.
//
// WHY A SWEEP AND NOT A LIST OF LABELS. Sixty-odd strings changed across
// nineteen files, and nothing about them is structural — the next *Delete* is
// one `setTitle` away, written by somebody typing the word that comes naturally.
// A sweep is the only shape of this check that catches a label nobody thought to
// add an assertion for.
//
// THE TWO EXCEPTIONS ARE BOTH SOMEBODY ELSE'S WORD, and that is the whole rule:
//
//  - `"delete"` as an ENTIRE literal is a name, not prose — `vault.on("delete")`,
//    `isUserEvent("delete")`, a `LayoutOpKind`, an `OrphanResolution`. Renaming
//    those renames nothing a reader sees and breaks the ones Obsidian owns.
//  - `Deleted files` is Obsidian's own setting, and `trashClause` prints the
//    path to it so a reader can go and change it. A sentence that renamed the
//    setting it is pointing at would be worse than the inconsistency.
//
// The documentation is deliberately NOT swept: its select-all passage describes
// Obsidian's editor destroying text with a keystroke, which is a delete in
// anybody's words and is not this plugin taking a note away.

describe("one verb for taking something away", () => {
  // WORDS, NOT STRING LITERALS. A first pass matched quoted literals and tripped
  // over a template literal holding a `${…}`, which is exactly the fault a sweep
  // must not have: it reported files nobody had written a label in. A WORD is
  // what the rename was about, and `\b[Dd]elet[a-z]*\b` has one useful property
  // for free — it never matches inside a camelCase identifier, so `onDelete`,
  // `deleteEvent` and `addDeleteRows` need no allowance. They are names, and a
  // name is not something a reader reads.
  const WORD = /\b[Dd]elet[a-z]*\b/g;

  // Comments carry the history — the bin, the 4.50 report, *Permanently delete* —
  // and rewriting the record of why a word changed is how the reason gets lost.
  // Only what ships is swept.
  const shippedLines = (code: string): string[] =>
    code.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));

  const allowed = (line: string, at: number, word: string): boolean => {
    // 1. `"delete"` / `'delete'` as a WHOLE literal is a name Obsidian or this
    //    plugin's own op vocabulary owns: `vault.on("delete")`,
    //    `isUserEvent("delete")`, a `LayoutOpKind`, an `OrphanResolution`.
    const quoted = /^["']$/.test(line[at - 1] ?? "") &&
      line[at - 1] === line[at + word.length] &&
      word === "delete";
    // 2. The JavaScript operator, and a `Map`/`Set` method. Both are code, and
    //    the operator is told from the English word by its OPERAND: it takes a
    //    property, so what follows is always `x.y` or `x[y]`. Without that, *"or
    //    delete it by hand"* reads as an operator and the sweep lets prose
    //    through — which it did, on the first draft of this line.
    const operator =
      word === "delete" &&
      (line[at - 1] === "." ||
        /^\s+[A-Za-z_$][\w$]*(\.|\[)/.test(line.slice(at + 6)));
    // 3. Obsidian's own setting, which `trashClause` prints the path to so the
    //    reader can go and change it. Renaming the thing we point at would be
    //    worse than the inconsistency.
    const setting = line.startsWith("Deleted files", at);
    return quoted || operator || setting;
  };

  const offenders = (): string[] => {
    const out: string[] = [];
    for (const { path, code } of srcFiles()) {
      for (const line of shippedLines(code)) {
        for (const m of line.matchAll(WORD)) {
          if (!allowed(line, m.index ?? 0, m[0])) out.push(`${path}: ${line.trim()}`);
        }
      }
    }
    return out;
  };

  it("says remove everywhere it says anything", () => {
    expect(offenders()).toEqual([]);
  });

  it("bites, which is the half a vacuous sweep gets wrong", () => {
    // The sweep above passes on an empty tree as happily as on a clean one, so
    // the grammar is proved against the lines it has to catch and the four it has
    // to let through.
    const caught = (line: string): boolean => {
      for (const m of line.matchAll(WORD)) {
        if (!allowed(line, m.index ?? 0, m[0])) return true;
      }
      return false;
    };
    expect(caught('.setTitle("Delete note…")')).toBe(true);
    expect(caught("notify.ok(`Deleted ${item.name}`);")).toBe(true);
    expect(caught('new Notice("could not delete it");')).toBe(true);
    expect(caught('vault.on("delete", (f) => onPath(f.path))')).toBe(false);
    expect(caught('ops.push({ kind: "delete", keyword });')).toBe(false);
    expect(caught("if (v === \"auto\") delete this.draft.size;")).toBe(false);
    expect(caught("      if (complete) this.pendingSectionAnswers.delete(key);")).toBe(false);
    // The operand is what tells the operator from the verb.
    expect(caught('  return "or delete it by hand";')).toBe(true);
    expect(caught("Deleted files setting is set to permanent")).toBe(false);
    // And a camelCase name is not a word, which is why none of them is listed.
    expect(caught("del.addEventListener(\"click\", () => cb.onDelete());")).toBe(false);
  });

  it("names the one destination sentence that keeps the word", () => {
    // Both clauses point at the setting by name, and a reader who has chosen
    // *Permanently delete* only finds it if we spell it their way.
    expect(trashClause("none")).toContain("Deleted files");
    expect(trashClause(null)).toContain("Deleted files");
    expect(trashClause("none")).toContain("permanently removed");
    expect(trashClause(null)).toContain("will be removed");
  });

  it("keeps the pair of attachment rows distinguishable", () => {
    // The one place the rename could not be a word swap: *Remove* took the link
    // out of the note and *Remove and delete file…* took the file as well, so one
    // verb would have made both rows say the same thing. THE DISTINCTION IS IN THE
    // OBJECT NOW — out of the note, or out of the vault — and the settings toggle
    // that explains the pair quotes both rows exactly.
    const src = readCode("ui/widgets/attachment-widgets.ts");
    expect(src).toContain('.setTitle("Remove from note")');
    expect(src).toContain('.setTitle("Remove file from vault…")');
    const desc = readCode("core/settings.ts");
    expect(desc).toContain("'Remove from note' only ever removes the link");
    expect(desc).toContain("'Remove file from vault'");
  });

  it("gives the count the report prints the same name", () => {
    // `trashSeveral` returned `{ deleted, failed }`, and both callers interpolated
    // that identifier straight into a sentence reading "removed" — the one shape
    // where a name IS prose. Renamed rather than allowed.
    expect(readCode("core/trash.ts")).toContain("{ removed: number; failed: string[] }");
    for (const f of ["ui/widgets/below-edit.ts", "ui/widgets/kind-row-menu.ts"]) {
      expect(readCode(f), f).toContain("const { removed, failed } = await trashSeveral(");
    }
  });
});
