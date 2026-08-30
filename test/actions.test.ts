// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  GROUP_ID_PREFIX,
  menuTitle,
  type ActionGroup,
} from "../src/core/actions";
import { readSrc } from "./sources";
import { journalActions } from "../src/core/journal-actions";
import { pluginWith } from "./journal-action-stub";

// ── the naming scheme (3.13 §10) ──────────────────────────────────────────
//
// WHAT THIS FILE IS ACTUALLY FOR, and it is not catching a typo.
//
// §10.3 spent the one free rename this project will ever get: no released
// vault, so no hotkey binding and no `obsidian://` URI names an old id, and
// after this release that stops being true. A scheme applied once and then
// left to taste is a scheme that lasts until the twenty-eighth command. So the
// deliverable of that patch is not the twenty-seven new ids — it is the rule
// that makes the twenty-eighth a matter of applying something rather than
// choosing something.
//
// Everything below is that rule, split into the parts that can be stated
// separately.


const byId = (id: string) => ACTIONS.find((a) => a.id === id);
const groupOf = (g: ActionGroup) => ACTIONS.filter((a) => a.group === g);

describe("every id names its group", () => {
  it("prefixes every id with its group's token", () => {
    // The load-bearing one. `id.split("-")[0]` is the group, via the map — not
    // via the group NAME, because three of four match and `journals` carries
    // `study` for the reason GROUP_ID_PREFIX gives.
    for (const a of ACTIONS) {
      expect(a.id.split("-")[0], a.id).toBe(GROUP_ID_PREFIX[a.group]);
    }
  });

  it("gives every group a token, and no two groups the same one", () => {
    // A map with a gap would make the rule above vacuous for that group —
    // `undefined` compared against a string fails loudly, which is the point,
    // but a DUPLICATE would pass while making the token meaningless.
    const tokens = Object.values(GROUP_ID_PREFIX);
    expect(new Set(tokens).size).toBe(tokens.length);
    for (const a of ACTIONS) {
      expect(GROUP_ID_PREFIX[a.group], a.group).toBeTypeOf("string");
    }
  });

  it("has no two actions sharing an id", () => {
    // Obsidian would keep the last registration and drop the first silently.
    const ids = ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("carries none of the four stale ids the rename was for", () => {
    // `refresh-study-home` said Study about something that rebuilds every
    // journal's section; two said "review" of a thing `vocabulary.ts` retired
    // the word for; `preview-repair` named a command §9.3 deleted.
    //
    // NOT ALIASED, either: an alias for a hotkey nobody holds is a second row
    // in the palette forever.
    for (const gone of [
      "refresh-study-home",
      "new-monthly-review",
      "open-this-month-review",
      "preview-repair",
      // And the ids the merges retired, re-asserted here so this file is the
      // whole of the id story.
      "add-section-to-note",
      "add-tracker-to-entry",
      "remove-tracker-from-entry",
      "preview-journal-templates",
    ]) {
      expect(byId(gone), gone).toBeUndefined();
    }
  });
});

describe("every name names its owner", () => {
  it("prefixes every name with an owner and a colon", () => {
    // The palette is a SEARCH BOX, not a menu: there are no headings, so the
    // group has to be in the string or filtering on `chronoanvil diary` cannot
    // work. Rendered, that is `ChronoAnvil: Diary: open today` — the two colons
    // §14 accepted.
    for (const a of ACTIONS) {
      expect(a.name, a.id).toMatch(/^[A-Z][A-Za-z ]*: \S/);
    }
  });

  it("lower-cases the first word after the prefix", () => {
    // So the prefix reads as a prefix rather than as two sentences. Custom
    // journal types have done this since they existed —
    // `${type.name}: new ${kind.label.toLowerCase()}` — and the built-ins were
    // the ones out of step.
    for (const a of ACTIONS) {
      const rest = a.name.slice(a.name.indexOf(": ") + 2);
      expect(rest[0], a.id).toBe(rest[0].toLowerCase());
    }
  });

  it("names a journal's actions for the journal, not for the group", () => {
    // A LABEL NAMES A GROUP AND A PREFIX NAMES AN OWNER (§10.2). These sit
    // under the ribbon's **Journals** heading and belong to one journal each,
    // so the heading says Journals and the name says which journal.
    //
    // GENERATED SINCE 3.21, so the rule is now applied rather than followed —
    // Study's four were the last written by hand, and they were the four that
    // had drifted from what every other journal got.
    const derived = journalActions(pluginWith(["study", "cooking"]));
    expect(derived.length).toBeGreaterThan(0);
    for (const a of derived) {
      expect(a.group, a.id).toBe("journals");
      expect(a.name, a.id).toMatch(/^(Study|Cooking): /);
    }
  });

  it("gives every journal's actions the group's id token", () => {
    // `journals` carried the token `study` until 3.21 — accurate while the only
    // actions in the group were Study's, and a fossil the moment it was not.
    // Generating ids from it is what forced the correction: a reader's own
    // journal would otherwise be issued commands prefixed with the name of
    // somebody else's.
    expect(GROUP_ID_PREFIX.journals).toBe("journals");
    for (const a of journalActions(pluginWith(["cooking"]))) {
      expect(a.id.split("-")[0], a.id).toBe("journals");
    }
  });

  it("keeps a parenthetical that asks, drops one that explains", () => {
    // `(pick a date)` says what you are about to be asked. `(template + Diary.base)`,
    // `(asks first)` and `(it can then hold pages)` describe mechanism.
    // In 4.23, `(overwrites)` was retired from entry templates as it gained diff-preview
    // parity with journal templates.
    expect(byId("diary-new-entry")?.name).toContain("(pick a date)");
    expect(byId("diary-new-month-entry")?.name).toContain("(pick a month)");

    expect(byId("maint-sync-trackers")?.name).not.toContain("Diary.base");
    expect(byId("maint-refresh-entry-templates")?.name).not.toContain("overwrites");
    expect(byId("maint-refresh-journal-templates")?.name).not.toContain("asks");
    expect(byId("note-convert-to-dashboard")?.name).not.toContain("pages");
  });
});

describe("the group appears once per surface, never twice", () => {
  it("strips the owner for the ribbon, which has a heading instead", () => {
    expect(menuTitle("Diary: open today")).toBe("Open today");
    expect(menuTitle("Maintenance: set up / repair vault")).toBe(
      "Set up / repair vault"
    );
    expect(menuTitle("Study: new journal (subject)")).toBe(
      "New journal (subject)"
    );
  });

  it("returns an unprefixed name unchanged rather than eating a letter", () => {
    // The transform is total over the table today (asserted above), and this
    // is what it does if it ever stops being: nothing. A name arriving at the
    // menu with its first character removed is the failure worth ruling out,
    // because it would look like a typo rather than like a rule.
    expect(menuTitle("Open today")).toBe("Open today");
  });

  it("leaves a colon inside the name alone", () => {
    // Only the FIRST `: ` is the prefix boundary. A name is free to contain
    // another — this is the same shape as `SECTION_KEY_SEP`'s split, which
    // §6 fixed by taking the first occurrence for exactly this reason.
    expect(menuTitle("Diary: open today: really")).toBe("Open today: really");
  });

  it("draws the ribbon's titles through it", () => {
    const t = readSrc("main");
    expect(t).toContain("menuTitle(action.name)");
  });
});

describe("what the rename deliberately did not touch", () => {
  it("still derives a journal's ids from the id the reader chose", () => {
    // §10.3 left these alone on the grounds that a scheme imposed on them would
    // have to be imposed by the wizard too. 3.21 imposed one — but from the
    // group token, which is not a new choice, and applied by the generator, so
    // there is nothing for the wizard to know or to drift from. The reader's
    // own id is still what makes the command stable.
    const t = readSrc("journal-actions");
    expect(t).toContain("`${GROUP_ID_PREFIX.journals}-new-${type.id}-${leaf}`");
    // That no journal is singled out is asserted as an emptiness below, over
    // the table rather than over this file's prose.
  });

  it("leaves the button action vocabulary alone", () => {
    // `button:study:new-lesson` is written into NOTES. It shares words with
    // the old command ids — `new-topic`, `new-lesson`, `refresh` — and has
    // never shared a namespace with them; renaming it would be a migration
    // rather than a patch.
    const t = readSrc("button-widgets");
    expect(t).toContain('"new-lesson"');
    expect(t).toContain('"new-topic"');
  });
});

describe("the destructive item is declared, not detected", () => {
  it("marks exactly one action as a warning", () => {
    const warned = ACTIONS.filter((a) => a.warning).map((a) => a.id);
    expect(warned).toEqual(["maint-setup-vault"]);
  });

  it("reads the flag rather than the id", () => {
    // The old condition was `action.id === "setup-vault"`, and the rename in
    // this same patch is precisely the event that would have turned it off
    // without failing anything.
    const t = readSrc("main");
    expect(t).toContain("if (action.warning) i.setWarning(true);");
    expect(t).not.toContain('action.id === "setup-vault"');
  });
});

describe("the table holds what cannot be derived", () => {
  it("counts what is left after the journals moved out", () => {
    // 27 until 3.21, then Study's four left for `journal-actions.ts`. The
    // remaining ones are those true of the PLUGIN rather than of a journal,
    // which is now the whole membership rule for this table.
    //
    // 23 until 4.30, which added `note-copy-plain-markdown` — a command about
    // any note the plugin recognises — and 24 until 4.31's
    // `maint-export-plain-markdown`, which is about the vault. Both belong here
    // by that same rule.
    //
    // 25 until 4.34's two page commands. They are the first entries here that
    // exist to be BOUND rather than to be found — a group's pages are switched
    // by a key, and the palette is where a reader discovers that they can be.
    // 28 in 4.67 with `maint-generate-vault-canvas`, 29 in 4.81 with `maint-setup-graph-groups`.
    expect(ACTIONS).toHaveLength(29);
  });

  it("splits them 13 / 0 / 7 / 9", () => {
    // `maint-find-journals` is the one that moved groups: it was with the
    // journals because of its subject, and everything else there MAKES a
    // journal note where this one reconciles the vault. It stays in the table
    // for the same reason — it belongs to no journal in particular.
    expect(groupOf("diary")).toHaveLength(13);
    // 4 until 4.30's `note-copy-plain-markdown`, which is note-scoped in the
    // strictest sense: it reads the note in front of the reader and writes
    // nothing anywhere. 5 until 4.34's two, which are note-scoped in that same
    // sense and narrower still: they act on one block of the note in front of
    // the reader and touch no file at all.
    expect(groupOf("notes")).toHaveLength(7);
    // 6 until 4.31's export, 7 until 4.34, 8 in 4.67 with `maint-generate-vault-canvas`, 9 with `maint-setup-graph-groups`.
    expect(groupOf("maintenance")).toHaveLength(9);
  });

  it("holds no journal-specific action at all", () => {
    // The membership rule, stated as an emptiness. A new journal must never
    // need an entry here, which is what makes adding one a matter of adding a
    // journal rather than of editing this file.
    expect(groupOf("journals")).toEqual([]);
    // No action names a PARTICULAR journal. `maint-refresh-journal-templates`
    // survives and should: it refreshes every journal's templates in one pass,
    // which belongs to the vault rather than to any one of them — the same
    // reason `maint-find-journals` sits in maintenance.
    expect(ACTIONS.filter((a) => /\bstudy\b/.test(a.id)).map((a) => a.id))
      .toEqual([]);
  });
});
