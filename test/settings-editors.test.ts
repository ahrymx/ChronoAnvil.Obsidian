// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import {
  JournalEditModal, normaliseKinds, parseEmojiMap, stringifyEmojiMap,
} from "../src/core/settings-editors";
import {
  deriveJournalFolders, freshCustomJournal, journalFolderName,
} from "../src/journals/custom-journal";
import type { JournalConfig, JournalKindConfig } from "../src/journals/custom-journal";
import type ChronoAnvilPlugin from "../src/main";

const row = (
  label: string, extra: Partial<JournalKindConfig> = {}
): JournalKindConfig => ({ id: "", emoji: "📝", label, ...extra });

describe("normaliseKinds", () => {
  it("dedupes kinds that slugify identically", () => {
    const out = normaliseKinds(
      [row("Entry"), row("entry"), row("ENTRY")],
      { preserveIds: false }
    );
    expect(out.map((k) => k.id)).toEqual(["entry", "entry-2", "entry-3"]);
  });

  it("defaults the emoji when a row has none", () => {
    expect(
      normaliseKinds([{ id: "", emoji: "  ", label: "Entry" }], {
        preserveIds: false,
      })
    ).toEqual([{ id: "entry", emoji: "📝", label: "Entry" }]);
  });

  it("keeps multi-word labels intact", () => {
    expect(
      normaliseKinds([row("Meeting Notes", { emoji: "📓" })], {
        preserveIds: false,
      })[0]
    ).toEqual({ id: "meeting-notes", emoji: "📓", label: "Meeting Notes" });
  });

  it("drops a row nobody has named yet", () => {
    // The "Add kind" button appends a blank row, so an unfilled one must not
    // become a kind with no label and a create button that says "New ".
    expect(
      normaliseKinds([row("Recipe"), row("  ")], { preserveIds: false })
    ).toHaveLength(1);
  });

  it("never emits an empty id", () => {
    expect(
      normaliseKinds([row("!!!")], { preserveIds: false })[0].id
    ).toBe("note");
  });

  it("trims a label without losing it", () => {
    expect(
      normaliseKinds([row("  Recipe  ")], { preserveIds: false })[0].label
    ).toBe("Recipe");
  });
});

describe("journal folders are derived from the name", () => {
  const paths = { journalsRoot: "03 - Journals", templates: "05 - Templates" };

  it("puts a journal under both roots, named after itself", () => {
    expect(deriveJournalFolders("Cook Book", paths)).toEqual({
      root: "03 - Journals/Cook Book",
      templatesFolder: "05 - Templates/Cook Book",
    });
  });

  it("starts a fresh journal with folders that match its name", () => {
    // The bug this replaced: the default named the folder after the
    // placeholder, so a journal renamed in the field above kept a folder
    // called "Custom Journal" unless you noticed and fixed it by hand.
    const cfg = freshCustomJournal(new Set(), paths);
    expect(cfg.root).toBe(`03 - Journals/${cfg.name}`);
    expect(cfg.templatesFolder).toBe(`05 - Templates/${cfg.name}`);
  });

  it("follows the vault's own roots rather than the defaults", () => {
    const moved = deriveJournalFolders("Recipes", {
      journalsRoot: "Notes/Journals",
      templates: "Notes/_templates",
    });
    expect(moved.root).toBe("Notes/Journals/Recipes");
    expect(moved.templatesFolder).toBe("Notes/_templates/Recipes");
  });
});

describe("journalFolderName", () => {
  it("leaves an ordinary name alone", () => {
    expect(journalFolderName("Cook Book")).toBe("Cook Book");
  });

  it("keeps a path separator from nesting the folder", () => {
    // Typed freely and used as a folder name, so this is the only thing
    // between "Cook Book: Vol/2" and a root two folders deep.
    expect(journalFolderName("Cook Book: Vol/2")).toBe("Cook Book Vol 2");
  });

  it("replaces rather than strips, so words don't run together", () => {
    expect(journalFolderName("Recipes/Bakes")).toBe("Recipes Bakes");
  });

  it("drops the characters Obsidian reserves for links", () => {
    expect(journalFolderName("Notes #1 [draft]")).toBe("Notes 1 draft");
  });

  it("refuses to make a hidden or malformed folder", () => {
    expect(journalFolderName(".hidden")).toBe("hidden");
    expect(journalFolderName("trailing.")).toBe("trailing");
  });

  it("collapses whitespace and trims", () => {
    expect(journalFolderName("  Cook   Book  ")).toBe("Cook Book");
  });

  it("returns nothing for a name with nothing usable in it", () => {
    // Validation reads this: a name of pure punctuation has no folder, and
    // the wizard says so rather than deriving a root ending in a slash.
    expect(journalFolderName("///")).toBe("");
    expect(journalFolderName("   ")).toBe("");
  });
});

describe("emoji map round trips", () => {
  it("survives stringify -> parse", () => {
    const map = { Mathematics: "🔢", Physics: "⚛️" };
    expect(parseEmojiMap(stringifyEmojiMap(map))).toEqual(map);
  });

  it("handles names containing a colon", () => {
    expect(parseEmojiMap("Physics: Waves: ⚛️")).toEqual({
      Physics: "Waves: ⚛️",
    });
  });

  it("skips malformed emoji lines", () => {
    expect(parseEmojiMap("no colon here\nMaths: 🔢")).toEqual({ Maths: "🔢" });
  });
});

// ── The journal editor's head strings ────────────────────────────────────
//
// Regression cover for the blank Edit dialog. `stepList()` built the edit
// form's single step by calling `subtitleText()`, and `subtitleText()` called
// `stepList()` to find the current step — so asking an edit-mode modal for
// either head string recursed until the stack gave out. The RangeError landed
// inside EditorModal.onOpen → renderHead → headingText, before the heading,
// the body or the footer had been created, so the window opened empty with
// nothing logged anywhere the user would look.
//
// Constructing a modal touches no DOM (onOpen does), so the whole failure is
// reachable without a DOM harness: build one and ask it for its head.
describe("journal editor head strings", () => {
  const cfg = (): JournalConfig => ({
    id: "cooking",
    name: "Cooking",
    emoji: "🍳",
    root: "03 - Journals/Cooking",
    templatesFolder: "00 - Infrastructure/Templates/Cooking",
    levels: [{ id: "cuisine", noun: "Cuisine", fallbackEmoji: "📚" }],
    kinds: [{ id: "recipe", emoji: "📝", label: "Recipe" }],
  });

  // Only the fields the head path reads. A wider fake would suggest the head
  // path depends on more of the plugin than it does.
  const plugin = {
    settings: {
      customJournals: [],
      studyEnabled: true,
      paths: { journalsRoot: "03 - Journals", templates: "00 - Infrastructure/Templates" },
    },
  } as unknown as ChronoAnvilPlugin;

  // protected members are in scope for a subclass, so no visibility change is
  // needed to read what renderHead() would read.
  class Probe extends JournalEditModal {
    head(): string {
      return this.headingText();
    }
    sub(): string {
      return this.subtitleText();
    }
    steps(): number {
      return this.stepList().length;
    }
    cfgNow(): JournalConfig {
      return this["draft"];
    }
    at(i: number): void {
      this.step = i;
    }
    rename(v: string): { id: string; root: string; templates: string } {
      this.applyNameChange(v);
      const d = this.cfgNow();
      return { id: d.id, root: d.root, templates: d.templatesFolder };
    }
  }

  const probe = (mode: "create" | "edit" | "import"): Probe =>
    new Probe({} as never, plugin, cfg(), mode, 0, async () => {});

  it("does not recurse when editing an existing type", () => {
    // The bug, stated as the user met it: opening Edit threw before drawing.
    expect(() => probe("edit").head()).not.toThrow();
    expect(() => probe("edit").sub()).not.toThrow();
  });

  it("shows the stored heading and subtitle when editing", () => {
    const p = probe("edit");
    expect(p.head()).toBe("Edit journal");
    // The edit-mode subtitle is the one the constructor was given, which is
    // the variant that mentions running setup afterwards.
    expect(p.sub()).toContain("Set up / repair vault");
  });

  it("shows the first step's heading and subtitle when creating", () => {
    const p = probe("create");
    expect(p.head()).toBe("Identity");
    expect(p.sub()).toContain("Its folders follow the name");
  });

  // ── the second edit step (2.54.5) ──────────────────────────────────────
  //
  // Editing gained a Sections step, which meant the chrome stopped being "is
  // this a new journal" and became "is there more than one page". Those were
  // one question until they weren't, and getting the split wrong reaches the
  // same failure the tests above exist for — so the new step gets the same
  // treatment: build the modal, advance, ask what it would draw.

  it("gives an existing type two steps, not one", () => {
    expect(probe("edit").steps()).toBe(2);
    expect(probe("import").steps()).toBe(2);
  });

  it("still gives a new type three", () => {
    expect(probe("create").steps()).toBe(3);
  });

  it("does not recurse on the second edit step either", () => {
    const p = probe("edit");
    p.at(1);
    expect(() => p.head()).not.toThrow();
    expect(() => p.sub()).not.toThrow();
  });

  // ── the Name field (2.54.6) ────────────────────────────────────────────
  //
  // Regression cover for a guard that was the exact inverse of the comment
  // above it, and wrong in both directions at once. Reachable only because the
  // decision was pulled out of the onChange closure it was hiding in.

  it("makes a new journal's folders follow its name", () => {
    // The bug as reported: the Identity step showed Name "CookBook" and
    // FOLDERS "03 - Journals/Custom Journal". Naming a journal is the only way
    // to name its folders, so a name that does not reach them leaves no way at
    // all — the fields are read-only by design.
    const out = probe("create").rename("CookBook");
    expect(out.root).toBe("03 - Journals/CookBook");
    expect(out.templates).toBe("00 - Infrastructure/Templates/CookBook");
  });

  it("derives a new journal's id from its name", () => {
    expect(probe("create").rename("Cook Book").id).toBe("cook-book");
  });

  it("leaves an established journal's id and folders alone", () => {
    // The other direction, and the more expensive one. The id is what a
    // per-type tracker's surface names, and the root is a folder full of
    // notes — re-deriving either on a rename orphans them. Renaming is a
    // relabel, not a migration.
    const p = probe("edit");
    const before = p.rename("Cooking");
    const after = p.rename("Something Else Entirely");
    expect(after.id).toBe(before.id);
    expect(after.root).toBe(before.root);
    expect(after.templates).toBe(before.templates);
  });

  it("still records the new name on an established journal", () => {
    // Bailing out early must not take the rename with it: the label is the one
    // thing a rename IS allowed to change.
    const p = probe("edit");
    p.rename("Catch-ups");
    expect(p.cfgNow().name).toBe("Catch-ups");
  });

  it("titles the second edit step Sections", () => {
    const p = probe("edit");
    p.at(1);
    expect(p.head()).toBe("Sections");
    // The step launches the file editor rather than queueing ticks, and the
    // subtitle has to say so — a reader who thinks Save will apply their
    // section changes would press Cancel and lose nothing they had, which is
    // the confusing kind of harmless.
    expect(p.sub()).toContain("before anything is written");
  });
});
