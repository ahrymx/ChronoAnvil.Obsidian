// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Adding a note kind from the card that lists them. 1.1.
//
// The control is one row at the end of *What's below*, and almost none of this
// file is about the row. What it is about is the path behind it: a kind added
// from a note has to arrive in the vault exactly as a kind added from Settings
// does, because the two are the same change to the same stored journal and
// every surface downstream — the create commands, the templates, the `type:`
// value on every note of that kind — reads one answer.
//
// So the assertions are mostly "it called the thing the editor calls". That is
// the point rather than a shortcut: the failure this suite is guarding against
// is a second implementation drifting from the first, which is exactly the fault
// `journal-actions.ts` spends thirty lines describing.

import { describe, expect, it, beforeEach } from "vitest";
import { addKindToJournal } from "../src/journals/kind-create";
import type { JournalConfig } from "../src/journals/custom-journal";
import type ChronoAnvilPlugin from "../src/main";
import { fnBody, readCode, readSrc } from "./sources";

const PROJECTS: JournalConfig = {
  id: "projects",
  name: "Projects",
  emoji: "🚀",
  root: "03 - Journals/Projects",
  templatesFolder: "00 - Infrastructure/Templates/Projects",
  levels: [{ id: "area", noun: "Area", fallbackEmoji: "📁" }],
  kinds: [
    // RELABELLED, AND THAT IS THE WHOLE OF THE FIXTURE. "Update" was renamed to
    // "Progress note" at some point and kept its id, because `preserveIds` is
    // what stops a rename declassifying every note carrying `type: update`. A
    // kind whose label still slugifies back to its own id cannot tell the two
    // settings of that flag apart — which is exactly what the first version of
    // the test below failed to notice: flipping `preserveIds` to false changed
    // nothing and the suite stayed green.
    { id: "update", emoji: "📋", label: "Progress note", rating: "status" },
    { id: "decision", emoji: "⚖️", label: "Decision" },
  ],
};

interface Harness {
  plugin: ChronoAnvilPlugin;
  cfg: () => JournalConfig;
  calls: string[];
  templates: string[];
}

// Enough plugin for the write path, and no more.
//
// `templates` is what `ensureJournalTemplates` claims to have written, so a test
// can assert the notice is driven by the answer rather than by the call. The
// vault is EMPTY of index surfaces on purpose: `offerDashboardCatchup` finds
// nothing to offer and returns before it would open a window, which is what
// keeps this runnable without a DOM. That the offer is made at all is asserted
// on the source below, and its own behaviour is `dashboard-catchup.test.ts`'.
function harness(journals: JournalConfig[] = [PROJECTS]): Harness {
  const calls: string[] = [];
  const templates: string[] = [];
  const stored = journals.map((j) => ({ ...j, kinds: j.kinds.map((k) => ({ ...k })) }));
  const plugin = {
    settings: { customJournals: stored },
    app: {
      vault: {
        getAbstractFileByPath: () => null,
        getMarkdownFiles: () => [],
      },
      workspace: { getLeavesOfType: () => [] },
    },
    saveSettings: async () => {
      calls.push("save");
    },
    journalImport: {
      writeManifest: async () => {
        calls.push("manifest");
      },
    },
    scaffold: {
      ensureJournalTemplates: async () => {
        calls.push("templates");
        return templates;
      },
    },
    journals: {
      rebuildJournalHome: async () => {
        calls.push("rebuild");
      },
    },
    notifyJournalTypesChanged: () => {
      calls.push("notify");
    },
  } as unknown as ChronoAnvilPlugin;

  return {
    plugin,
    cfg: () => stored[0],
    calls,
    templates,
  };
}

describe("adding a kind from the card", () => {
  let h: Harness;
  beforeEach(() => {
    h = harness();
  });

  it("derives the id the notes will carry from the name", async () => {
    const added = await addKindToJournal(h.plugin, PROJECTS, "Field Note");
    expect(added?.id).toBe("field-note");
    expect(added?.label).toBe("Field Note");
    expect(h.cfg().kinds.map((k) => k.id)).toEqual([
      "update",
      "decision",
      "field-note",
    ]);
  });

  it("leaves every id already on disk alone", async () => {
    // `preserveIds`. A kind's id is the `type:` value on every note of that
    // kind, so re-deriving the existing ones while adding a new one would
    // declassify notes nobody asked to touch — the bug `normaliseKinds` grew
    // the flag for, arriving by a new door.
    await addKindToJournal(h.plugin, PROJECTS, "Risk");
    expect(h.cfg().kinds.map((k) => k.id)).toEqual([
      "update",
      "decision",
      "risk",
    ]);
    expect(h.cfg().kinds[0].rating).toBe("status");
  });

  it("opens the new kind on the same default the Structure step gives one", async () => {
    // 📝, because this row asks for a name and nothing else. It is the editor's
    // own default rather than a second one chosen here, so a kind added from a
    // note and a kind added from Settings start identical.
    const added = await addKindToJournal(h.plugin, PROJECTS, "Risk");
    expect(added?.emoji).toBe("📝");
    expect(readSrc("settings-editors")).toContain('{ id: "", emoji: "📝", label: "" }');
  });

  it("refuses a name the journal already has, and changes nothing", async () => {
    // `normaliseKinds` would file a second "Decision" as `decision-2`, which is
    // the right ID rule and the wrong answer here: the card would draw two
    // groups under one name with two identical create buttons.
    const added = await addKindToJournal(h.plugin, PROJECTS, "decision");
    expect(added).toBeNull();
    expect(h.cfg().kinds).toHaveLength(2);
    expect(h.calls).toEqual([]);
  });

  it("does nothing for a journal the settings do not have", async () => {
    const gone = { ...PROJECTS, id: "deleted" };
    expect(await addKindToJournal(h.plugin, gone, "Risk")).toBeNull();
    expect(h.calls).toEqual([]);
  });

  it("saves, records itself in the manifest, then writes what is missing", async () => {
    // THE ORDER IS THE CLAIM. `ensureJournalTemplates` reads the journal as
    // stored, so a template written before the save would be written for the
    // kinds the journal had a moment ago; and the manifest is what a folder
    // copied into another vault is restored from, so it learns about the kind at
    // the same moment settings does rather than at the next repair.
    await addKindToJournal(h.plugin, PROJECTS, "Risk");
    expect(h.calls.slice(0, 3)).toEqual(["save", "manifest", "templates"]);
  });

  it("repaints the note the row was pressed from", async () => {
    // Adding a kind rewrites settings, not the note, and a reader who declines
    // the dashboard offer has changed no file at all — so nothing a note
    // listens to fires and the new group would not appear until the note was
    // reopened.
    await addKindToJournal(h.plugin, PROJECTS, "Risk");
    expect(h.calls).toContain("rebuild");
    expect(h.calls).toContain("notify");
    expect(fnBody("addKindToJournal", "journals/kind-create")).toContain(
      "repaintOpenNotes(app)"
    );
  });

  it("lists the type on the card it was pressed from, and nowhere else", async () => {
    // ── THE READER'S ASK (1.0.33) ────────────────────────────────────────
    //
    // *"adding a new note-type to a table should not add this type to all index
    // pages. The only place the defaults should be configured like this is from
    // chronanvil's journal settings."*
    //
    // It used to finish by opening the vault-wide offer — *"List the new note
    // type on 7 dashboards?"* — so a group wanted on one Topic arrived on every
    // Topic in the subject, from a list of paths a reader accepts in one press.
    const src = fnBody("addKindToJournal", "journals/kind-create");
    expect(src).toContain("await catchUpIndexNote(app, type, host, listing);");
    // AND THE PAGE SAYS SO BEFORE THE PLANNER IS ASKED (1.0.33). The kind is
    // `local`, so `childrenParts` composes its group only where `notetypes`
    // names it — reconcile first and the planner is asked about a kind this
    // page has not claimed, composes nothing, and the button does nothing.
    expect(src).toContain(
      "const listing = await plugin.journals.listKindOnPage(host, added.id);"
    );
    expect(src.indexOf("listKindOnPage")).toBeLessThan(
      src.indexOf("catchUpIndexNote")
    );
    // AND THE WIDE DOOR IS STILL THERE, because the Settings editor means every
    // dashboard: a kinds change made in the journal's own settings IS a change
    // to the journal's defaults. One call site, two scopes, chosen by the caller.
    expect(src).toContain("else await offerDashboardCatchup(app, type);");
    expect(readSrc("settings-editors")).toContain(
      "offerDashboardCatchup(this.app, buildJournalType(this.draft))"
    );
  });

  it("is handed the note the window was opened from, resolved at the write", async () => {
    // THE HOST IS AN ARGUMENT, NEVER A LOOKUP INSIDE. `addKindToJournal` writes
    // one card — the page has to say so with `listKindOnPage` before the
    // planner is asked — and the only thing that knows which card is the
    // surface the door was pressed on.
    //
    // RE-RESOLVED AT SAVE AS OF 1.0.69, which the dashed row it replaces did not
    // have to do: a row was pressed and acted at once, and a window can sit open
    // while the note under it is renamed or moved. So the path is what the window
    // holds and the `TFile` is fetched in `commit`.
    const win = readSrc("ui/note-types-window");
    const body = win.slice(win.indexOf("protected async commit()"));
    expect(body).toContain("const file = getFile(this.app, this.path);");
    expect(body).toContain("await addKindToJournal(this.plugin, cfg, label, file);");
    expect(body.indexOf("getFile(this.app, this.path)")).toBeLessThan(
      body.indexOf("addKindToJournal(")
    );
    // And the old call site is gone rather than left beside it.
    expect(readCode("tables")).not.toContain("promptAddKind");
  });

  it("asks nothing before writing that one note, and says why", async () => {
    // The window exists because the wide path writes files the reader is not
    // looking at. This writes the card under their hand — which is what the
    // prompt they just answered said it would do.
    const src = readSrc("dashboard-catchup");
    expect(src).toContain("export async function catchUpIndexNote(");
    // The BODY, because `offerDashboardCatchup` sits below it in the same file
    // and is the function that is supposed to ask.
    expect(fnBody("catchUpIndexNote", "journals/dashboard-catchup")).not.toContain(
      "confirmPlan("
    );
    // Through `indexSurfaces`, so the write plans against the same context the
    // offer would have — a second derivation is how the two come to disagree.
    expect(src).toContain("indexSurfaces(app, type).find((s) => s.file.path === file.path)");
  });

  it("does not open the kind-change confirmation", async () => {
    // DELIBERATE, AND WRITTEN DOWN. That window exists because a SAVE bundles
    // changes a reader may not have meant together, a removal among them. This
    // door adds one kind whose name the reader typed to get here, so a window
    // saying "adding: the thing you just named, nothing you have written
    // changes" is how readers learn to dismiss confirmations unread.
    const src = readSrc("journals/kind-create");
    expect(src).not.toContain("confirmKindChange(");
    expect(src).toContain("WHAT IT DOES NOT CALL is `confirmKindChange`");
  });
});

// ── WHERE THE ADD CONTROL WENT (1.0.69) ──────────────────────────────────
//
// A `describe("where the row is drawn")` of seven tests stood here, pinning a
// dashed `+ Add note type` row that `buildAddKindRow` appended under the last
// group of a *What's below* card: the gate it rode, the reveal claim that keeps
// it under the banner's chevron, its `.ca-jld-add` vocabulary, its gap, and the
// fold it had to not fire.
//
// The row is a text field in the Note types window now, behind a cog on the
// card's own title bar — the reader's call, and the reason for it: *"the add
// note type and edit buttons would better fit the sections header … but the
// cleanest and cohesive solution would be just a cog wheel."* Its claims are in
// `test/note-types-window.test.ts`, which is also where the door's gate and the
// fold it must not fire now live. The foot's own reveal claim stayed with the
// foot, in `test/below-edit.test.ts`.

describe("where the control that reaches it is drawn", () => {
  const widgets = () => readSrc("widgets");

  it("is drawn by the renderer, so no note needs migrating to gain it", () => {
    // The counter-design is a directive the catalogue composes, which would
    // reach exactly the notes written after it. Every deepest index already in a
    // vault has this at the next repaint instead.
    const catalogue = readSrc("journals/journal-sections");
    expect(catalogue).not.toContain("kind-add");
    expect(readSrc("journals/journal-plan")).not.toContain("kind-add");
    // AND THE SAME IS TRUE OF THE COG (1.0.69): it is appended to the frame the
    // `header:` line drew, not composed by a new keyword, so no fence changes
    // and no goldens move.
    expect(catalogue).not.toContain("note-types");
    expect(readSrc("journals/journal-plan")).not.toContain("note-types");
  });

  it("goes on the head of the card that lists a journal's kinds, and no other", () => {
    // `headerOwning` answers which `header:` line a keyword sits under, and the
    // cog is drawn on THAT head rather than on every head in the fence. A
    // dashboard carrying a `kind-table:` under its third heading would otherwise
    // wear a cog on the first.
    const src = widgets();
    expect(src).toContain('const belowHeader = headerOwning("kind-table");');
    expect(src).toContain(
      "if (title && belowType && belowHeader === headerIndex - 1) {"
    );
    expect(src).toContain("headTools(frame.root).appendChild(");
    expect(src).toContain("buildNoteTypesCog(");
    expect(src).toContain("() => belowFoot");
  });

  it("declines where the path resolves to no journal", () => {
    // An index TEMPLATE carries `kind-table:` lines and lives outside the
    // journals root, where "add a kind to whatever journal this belongs to" is
    // not a question the surface can answer.
    //
    // ONE QUESTION, ASKED ONCE (1.0.69). `buildAddKindRow` asked `hostType` and
    // the foot asked `journalTypeAtPath`, which is two answers to one question;
    // the dispatcher now resolves it once and both the cog and the foot refuse
    // on that same answer.
    const src = widgets();
    expect(src).toContain(
      "const belowType = journalTypeAtPath(this.plugin, ctx.sourcePath);"
    );
    expect(fnBody("buildBelowFoot", "ui/widgets/below-edit")).toContain(
      "if (!type) return null;"
    );
  });
});
