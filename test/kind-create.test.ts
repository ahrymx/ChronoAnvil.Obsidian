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
import { cssRule, fnBody, readSrc } from "./sources";

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

  it("offers the dashboards their new table, through the shared window", async () => {
    // The one consent in the flow, and it is the editor's own. Not re-stated
    // here: `dashboard-catchup.ts` owns the plan, the sentence and the notice,
    // so both doors show the same thing.
    const src = fnBody("addKindToJournal", "journals/kind-create");
    expect(src).toContain("offerDashboardCatchup(app, buildJournalType(next))");
    expect(readSrc("settings-editors")).toContain(
      "offerDashboardCatchup(this.app, buildJournalType(this.draft))"
    );
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

describe("where the row is drawn", () => {
  const widgets = () => readSrc("widgets");

  it("goes on any card that lists a journal's kinds", () => {
    // `kind-table:<id>` IS the What's below card, whether it holds one group or
    // four — a one-kind journal composes the same line under its own name.
    expect(widgets()).toContain(
      'const hasKindTable = lines.some((l) => keywordOf(l) === "kind-table");'
    );
    expect(widgets()).toMatch(
      /if \(hasKindTable\) \{[\s\S]{0,200}container\.appendChild\(belowFoot\)/
    );
  });

  it("goes away with the section, under the banner's chevron (1.0.12)", () => {
    // *"the add note type should only appear when 'whats under this note' is
    // expanded."*
    //
    // WHY IT DID NOT. A reveal hides the children a part's lines DREW, found by
    // the stamp each one carries; this row is drawn by the renderer after the
    // loop and carries none, which is the same fact the test above it asserts
    // from the other side. So the chevron closed the card down to its last row
    // and left the dashed slot behind, under a head that had gone.
    //
    // BY THE LINE IT WAS BUILT FOR, not by position. The row is appended last
    // in the block, so a section that happens to be the fence's last part would
    // have been fixed by a range that reached the end and every other one would
    // not — and a banner welding the index above the grid is a fence the reader
    // can arrange today.
    const src = widgets();
    expect(src).toContain("const kindTableAt = rawLines.findIndex(");
    // `rawLines`, WHICH IS THE NUMBERING A PART SPEAKS. `lines` has had the
    // modifiers filtered out of it, so a range read in the wrong one lands a
    // line or two early on any fence carrying a `stack` or a `frame:`.
    expect(src).not.toContain("const kindTableAt = lines.findIndex(");
    // AND IT CLAIMS THE FOOT, WHICH IS WHAT THE ROW IS INSIDE NOW (1.0.13).
    // 1.0.13 wrapped this row and an **Edit** toggle in one
    // `div.ca-journal-below-foot`, for exactly this reason: two loose children
    // would mean naming two nodes in both of the two places one is named here,
    // and a third of each the next time the foot grows a control — which is this
    // defect re-armed structurally. One wrapper keeps both claims at one name.
    expect(src).toContain(
      "belowFoot && kindTableAt >= part.from && kindTableAt < part.to"
    );
    // And the 5.28 spelling, where the whole fence is one part and the span is
    // a range of children rather than of lines.
    expect(src).toContain(
      "if (belowFoot && !within.includes(belowFoot)) within.push(belowFoot);"
    );
  });

  it("is drawn by the renderer, so no note needs migrating to gain it", () => {
    // The counter-design is a directive the catalogue composes, which would
    // reach exactly the notes written after it. Every deepest index already in a
    // vault has this at the next repaint instead.
    const catalogue = readSrc("journals/journal-sections");
    expect(catalogue).not.toContain("kind-add");
    expect(readSrc("journals/journal-plan")).not.toContain("kind-add");
  });

  it("declines where the path resolves to no journal", () => {
    // An index TEMPLATE carries `kind-table:` lines and lives outside the
    // journals root, where "add a kind to whatever journal this belongs to" is
    // not a question the surface can answer.
    const body = fnBody("buildAddKindRow", "tables");
    expect(body).toContain("if (!type) return null;");
    expect(body).toContain("hostType(plugin, file.path)");
  });

  it("wears the vocabulary the vault already uses for an empty slot", () => {
    // `.ca-jld-add` is how a tracker is added to an entry and how a journal is
    // added to the Journals section: dashed edge, no ground, muted ink.
    const body = fnBody("buildAddKindRow", "tables");
    expect(body).toContain('cls: "ca-jld-add ca-journal-kind-add"');
    expect(body).toContain('setIcon(btn.createSpan({ cls: "ca-jld-add-icon" }), "plus")');
  });

  it("takes its gap from the groups, and its edge from the vocabulary", () => {
    // The slot sits where the next group head would, so the spacing is the
    // groups' own token rather than a number picked for this row.
    //
    // THE STRIP PAYS THE GAP AS OF 1.0.13, because the strip is what has a top
    // edge — the row is inside it now and a second `margin-top` in there would
    // be the gap charged twice. The decision did not change; the element that
    // carries it did.
    const strip = cssRule(".ca-journal-widget-block > .ca-journal-below-foot");
    expect(strip).toContain("margin-top: var(--ca-sec-gap)");
    // AND `width: 100%` BECAME `flex`, for the same reason: the row was the
    // block's only child and took the whole of it; it is now the wide half of a
    // two-control strip, so it grows into whatever the toggle leaves rather than
    // insisting on a width that would push the toggle off the end.
    const rule = cssRule(".ca-journal-below-foot > .ca-journal-kind-add");
    expect(rule).toContain("flex: 1 1 auto");
    expect(rule).not.toContain("width: 100%");
    expect(rule).not.toContain("margin-top");
    // AND IT DOES NOT RESTATE THE DASH. `.ca-jld-add` owns the dashed edge, the
    // absent ground and the hover — three `!important` declarations that exist
    // because a theme's `button` rule outranks a single class. A copy here would
    // be a second place to tune one look, and the reason that matters is on
    // record: the vocabulary silently did not draw at all for a release.
    expect(rule).not.toContain("border-style");
    expect(rule).not.toContain("background");
  });

  it("does not fire the fold it sits inside", () => {
    // The card's head folds on click and its rows open notes. Every other
    // control inside a section makes the same separation.
    expect(fnBody("buildAddKindRow", "tables")).toContain("evt.stopPropagation()");
  });
});
