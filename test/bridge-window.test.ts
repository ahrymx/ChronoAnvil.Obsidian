// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The bridge's doors (1.0.89).
//
// The engine has been complete and argued since 2.57; what a reader could
// reach of it was the tracker the catalogue hard-coded. These are the cog, the
// window behind it, the directive grammar both ends share, and the five defects
// the doors exposed.
//
// NO DOM IN THIS SUITE, so the drawn shapes are pinned through `test/sources.ts`
// exactly as every other render path in this tree is — `readCode` for a file
// with its comments stripped, `fnBody` for one function's body.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, fnBody, readCode, readSrc } from "./sources";
import {
  BRIDGE_SELECTORS,
  bridgeRefusal,
  readBridgeArg,
  readBridgeDirective,
  writeBridgeArg,
  writeBridgeDirective,
} from "../src/core/bridge";
import {
  BRIDGE_NAV_GRAIN,
  BRIDGE_SECTION_ID,
  BRIDGE_SECTION_TITLE,
  DEFAULT_BRIDGE_TRACKER,
  JOURNAL_SECTIONS,
} from "../src/journals/journal-sections";
import type { SectionContext } from "../src/journals/journal-sections";
import { ENTRY_SECTIONS } from "../src/diary/entry-sections";
import { defaultSectionIds, templateTargets } from "../src/journals/journal-sections";
import { composeTemplate } from "../src/journals/custom-journal";
import { journalSectionModel } from "../src/journals/journal-plan";
import { STUDY_JOURNAL } from "../src/journals/journal";
import { describeAnswers, questionIsRequired } from "../src/core/section-model";

// ── the grammar, read and written by one pair ─────────────────────────

describe("one directive grammar, with a reader and a writer", () => {
  it("round-trips every shape a bridge line comes in", () => {
    // THE SHAPES ARE THE FEATURE'S WHOLE SURFACE: a bare target, a target with
    // filters, the trend flag, a label, and one line carrying all of it. A
    // writer tested apart from its reader is a writer tested against nothing —
    // which is the argument `parseSnapshotLine` carries about the other pair in
    // this module.
    const shapes = [
      "bridge-notes:meal",
      "bridge-notes:meal tag:dinner",
      "bridge-notes:meal|From the journals",
      "bridge-notes:meal tag:dinner has:task|From the journals",
      "bridge-readings:Mood",
      "bridge-readings:Mood#trend",
      "bridge-readings:Mood#trend is:lesson from:2026-02-10|From the diary",
    ];
    for (const line of shapes) {
      const read = readBridgeDirective(line);
      expect(read, line).not.toBeNull();
      expect(writeBridgeDirective(read!), line).toBe(line);
    }
  });

  it("refuses a line that is not a bridge at all", () => {
    for (const line of [
      "period-nav:month",
      "bridge-trend:Mood",
      "notes:meal",
      "",
    ]) {
      expect(readBridgeDirective(line), line).toBeNull();
    }
  });

  it("keeps the filters out of the target, which is the bug it exists for", () => {
    // 1.0.88's defect in one line: the split used to live in the renderer and
    // the flag strip one function below it, so `bridge-notes:meal tag:dinner`
    // had three readers agreeing by inspection.
    const read = readBridgeArg("notes", "meal tag:dinner has:task");
    expect(read.target).toBe("meal");
    expect(read.filters).toBe("tag:dinner has:task");
    expect(read.trend).toBe(false);
  });

  it("lets the DIRECTION decide whether a `#` is a flag", () => {
    // A tracker named with a `#` in it is not a thing; a NOTE TYPE called
    // `meal#trend` is a typo, and the refusal naming it is how the reader finds
    // that out. So the notes direction keeps the whole head and the readings
    // direction strips the flag — which is also why this is one function with
    // the direction as its first argument rather than two.
    expect(readBridgeArg("notes", "meal#trend").target).toBe("meal#trend");
    expect(readBridgeArg("notes", "meal#trend").trend).toBe(false);
    expect(readBridgeArg("readings", "Mood#trend").target).toBe("Mood");
    expect(readBridgeArg("readings", "Mood#trend").trend).toBe(true);
  });

  it("drops the flag when it is off and never writes an empty tail", () => {
    expect(
      writeBridgeArg({ direction: "readings", target: "Mood", trend: false, filters: "" })
    ).toBe("Mood");
    expect(
      writeBridgeArg({ direction: "readings", target: "Mood", trend: true, filters: "  " })
    ).toBe("Mood#trend");
    // AND A NOTES BRIDGE NEVER CARRIES ONE, whatever it is handed: the flag is
    // a readings view and a `bridge-notes:meal#trend` is a note type nobody
    // has.
    expect(
      writeBridgeArg({ direction: "notes", target: "meal", trend: true, filters: "" })
    ).toBe("meal");
  });

  it("is not in `directive-grammar.ts`, and says why where it is", () => {
    // `splitArgHead` splits an argument at its FIRST colon, so
    // `bridge-readings:Mood is:lesson` comes back with a head of "Mood is" —
    // the shared helper is the wrong splitter for a space-separated tail, and a
    // later hand reaching for it is the failure this note prevents.
    const src = readSrc("core/bridge");
    expect(src).toContain("splitArgHead");
    expect(readCode("core/bridge")).not.toContain("splitArgHead(");
  });
});

// ── the cog ───────────────────────────────────────────────────────────

describe("the cog sits on the bridge's own title row", () => {
  const src = () => readCode("bridge-widgets");
  const head = () => fnBody("bridgeHeader", "bridge-widgets");

  it("goes in the frame's action slot, where the chevron's neighbours are", () => {
    //   "the editor window should be a cog wheel on the sections title row
    //   (next to the chevron).."
    //
    // `frame.actions` is the slot the view-mode button already uses. A cog
    // drawn anywhere else would be a second opinion about a decision the frame
    // has taken — the whole argument 5.10 made when this block stopped drawing
    // its own chevron.
    //
    // ── AND IT IS THE ONLY OPENER THERE NOW (1.0.91) ─────────────────
    //
    //   "The 'More' elipsis menu can be merged into the cog (settings window)."
    //
    // 1.0.89 drew a cog straight to the window AND left the ⋯ beside it, whose
    // first row was that same window: two buttons onto one subject.
    // `settingsButton` is the merge already written — `overflowButton` with
    // 4.20's glyph — so the menu is still built on click and the window is
    // still its first row.
    expect(head()).toContain(
      'settingsButton(frame.actions, "ca-bridge-cog", buildMenu)'
    );
    expect(head()).not.toContain("overflowButton");
  });

  it("names itself after the section rather than the page", () => {
    // `settingsButton` writes "Page settings", which is 4.20's wording for a
    // banner. This cog acts on one SECTION of the page, and there can be a
    // second bridge in the vault's other direction on a note that has both.
    expect(head()).toContain('cog.setAttr("aria-label", "Bridge settings")');
    expect(head()).toContain('cog.setAttr("title", "Bridge settings")');
  });

  it("opens the menu rather than the window, so the acting rows have a home", () => {
    // Freeze, Refresh and Unfreeze are immediate writes to a stored region.
    // `BridgeWindow` is an `EditorModal`: it stages every answer until Save and
    // refuses to commit when the note changed while it was open — so an action
    // button inside it would trip that guard against its own press. The rows
    // that ACT stay rows, and the window is the first of them.
    expect(head()).toContain("const buildMenu = (menu: Menu): void => {");
    const menu = head().slice(head().indexOf("const buildMenu"));
    expect(menu.indexOf('i.setTitle("Bridge settings…")')).toBeGreaterThan(0);
    expect(menu.indexOf('i.setTitle("Bridge settings…")')).toBeLessThan(
      menu.indexOf('setTitle("Freeze this view")')
    );
  });

  it("is drawn on a frozen block, where it is the only way back", () => {
    // THE DEFECT THE MERGE WOULD OTHERWISE HAVE SHIPPED. 1.0.89 withheld the
    // cog on a frozen block on purpose — reconfiguring a snapshot edits a
    // RECORD — and the ⋯ was then the only route to Unfreeze. Delete the ⋯ with
    // that condition standing and a frozen bridge has no control at all.
    //
    // SO THE RULE MOVED ONE LEVEL IN RATHER THAN BEING DROPPED: the BUTTON is
    // unconditional and the *Bridge settings…* ROW is not. The record is still
    // not editable, and the way back is still one press.
    expect(head()).not.toContain("if (actions.configure && !snap.frozen) {\n    const cog");
    const menu = head().slice(head().indexOf("const buildMenu"));
    expect(menu).toContain("if (actions.configure && !snap.frozen) {");
    expect(menu).toContain('i.setTitle("Refresh snapshot")');
    expect(menu).toContain('i.setTitle("Unfreeze (go live)")');
  });

  it("is not drawn on a refusal, and cannot be", () => {
    // `buildBridge` returns `refusalEl` before the frame exists, so a refused
    // bridge has no bar for a cog to stand on. The door onto one is *Edit
    // sections…*, which lists the section whatever its directive says.
    const body = fnBody("buildBridge", "bridge-widgets");
    expect(body.indexOf("return refusalEl(")).toBeGreaterThan(0);
    expect(body.indexOf("return refusalEl(")).toBeLessThan(
      body.indexOf("liveScopedWidget(")
    );
  });

  it("keeps the opener in the window's own file", () => {
    // 1.0.49 §3's rule — the control and the thing it opens are separate — and
    // `test/module-cycles.test.ts`'s scar: an opener imported for one call put
    // `diary-link.ts` and its window in one import component. So the window
    // imports no renderer, and the question it has to ask is handed in.
    expect(src()).toContain("openBridgeWindow(plugin.app, plugin, path,");
    expect(readCode("bridge-window")).not.toContain("bridge-widgets");
  });
});

// ── the window ────────────────────────────────────────────────────────

describe("the window writes through the model and nothing else", () => {
  const src = () => readCode("bridge-window");

  // One method of the window class, and nothing after it.
  //
  // `fnBody` SLICES TO THE NEXT TOP-LEVEL DECLARATION, which for a method in
  // the middle of a class is every method below it — fine for "does this file
  // say X", useless for "does this method do X BEFORE Y". The assertions below
  // are about order, so they need the method and not the tail of the class.
  const method = (name: string): string => {
    const text = readSrc("bridge-window");
    const at = text.search(new RegExp(`\n {2}(?:protected|private) (?:async )?${name}\\(`));
    expect(at, name).toBeGreaterThan(0);
    const rest = text.slice(at + 3);
    const end = /\n {2}(?:protected|private|public) /.exec(rest);
    return end ? rest.slice(0, end.index) : rest;
  };

  it("takes the view from the model rather than reading the file for answers", () => {
    // `prose-window.ts`'s rule: `sections(text)` carries both halves — the
    // questions the catalogue declares and what the note already answers — so
    // the box the window draws and the answer `apply` writes cannot disagree.
    expect(src()).toContain("plugin.sections.modelForNote(path)");
    expect(src()).toContain('.find((v) => v.id === "bridge")');
    expect(src()).toContain("this.spec.view.answered");
  });

  it("re-reads before it writes, and declines a note that moved", () => {
    // A window a reader can leave open is a long gap, and on a note being
    // written in, what a stale write drops is the writing.
    const commit = method("commit");
    expect(commit).toContain("await this.app.vault.read(this.spec.file)");
    expect(commit).toContain("if (current !== this.spec.text)");
    expect(commit.indexOf("if (current !== this.spec.text)")).toBeLessThan(
      commit.indexOf("vault.modify")
    );
  });

  it("writes nothing when nothing would change", () => {
    // `apply` answers null for a plan that is the note it was given, and the
    // rule is `header-title.ts`' and `entryheader.ts`': a no-op write is a
    // modified-time bump, a sync round and a redraw for nothing.
    const commit = method("commit");
    // THE `return` IS THE ASSERTION, not the branch head. A guard that notices
    // and falls through is the defect wearing the shape of the fix.
    expect(commit).toMatch(/if \(next === null\) \{[^}]*return;\n {4}\}/);
    expect(commit.indexOf("if (next === null)")).toBeLessThan(
      commit.indexOf("vault.modify")
    );
  });

  it("asks the renderer whether it would refuse, BEFORE writing", () => {
    // §2.3's double refusal used a third time, at the only place that can
    // prevent one rather than report it. The answer comes from the caller, and
    // it is asked of the TEXT THE SAVE WOULD WRITE — not of a directive the
    // window composed, which would be two compositions of one line.
    const commit = method("commit");
    expect(commit).toContain("this.spec.refusalIn(next)");
    expect(commit.indexOf("this.spec.refusalIn(next)")).toBeLessThan(
      commit.indexOf("vault.modify")
    );
    expect(commit).toContain("this.showError(refusal)");
  });

  it("refuses to clear a required answer backwards", () => {
    // The diary side's target is a `choice` with no empty state, so clearing it
    // would write `bridge-notes:` — the unconfigured directive patch 7 exists
    // to stop the editor producing.
    // THE WHOLE CLAUSE, because `if (false && questionIsRequired(q))` contains
    // the call and gates on nothing.
    expect(method("validate")).toContain(
      "if (questionIsRequired(q) && !this.shown(q).trim()) {"
    );
  });

  it("hands back only the keys the reader touched", () => {
    // `SectionChoice.options`' contract: `reconfigured` reads the presence of an
    // option as "this answer moved", so a window handing back every box would
    // ask the writer to rewrite a line nobody edited.
    expect(src()).toContain("private answers: Record<string, string | undefined> = {}");
    expect(method("commit")).toContain(
      "(each === id ? { id: each, options: this.answers } : each)"
    );
  });
});

describe("what the refusal check is asked about", () => {
  const body = () => fnBody("bridgeTextRefusal", "bridge-widgets");

  it("reads the navigator off the fence the save would write", () => {
    // The period question writes `period-nav:`, so a reader switching month to
    // week has changed the window this bridge resolves — and a refusal asked
    // about the OLD unit is a refusal about a question nobody asked. Found the
    // same way the render loop finds it, in one pass over the fence, because
    // the line that answers may come after the line that asks.
    expect(body()).toContain(
      '.filter((l) => l.split(":")[0].trim() === "period-nav")'
    );
    expect(body()).toContain("periodNavUnit(");
    expect(body()).toContain("bridgeHostFacts(plugin, path, nav ?? null)");
  });

  it("builds the catalogue the same way the renderer does", () => {
    expect(body()).toContain("bridgeCatalogue(plugin, otherSurface(host.surface))");
  });

  it("resolves the host's facts from the path, which is all it has", () => {
    // `bridgeHostFacts` took a `MarkdownPostProcessorContext` and read one
    // field off it, which was true of every caller while the only caller was a
    // renderer. The window has a path and no render context, and it has to
    // assemble the SAME facts — a second near-copy of them is the
    // two-correct-copies drift `modelForNote` exists to end.
    const facts = fnBody("bridgeHostFacts", "bridge-widgets");
    expect(facts).toContain("surface: hostSurface(plugin, path)");
    expect(facts).toContain("fileAt(plugin, path)");
    expect(facts).not.toContain("ctx.sourcePath");
  });

  it("treats a note with no bridge in it as nothing to refuse", () => {
    // A reader who removed the section from *Edit sections…* while the window
    // was open has a note with no bridge, and there is nothing for the renderer
    // to decline.
    expect(body()).toContain("if (!block || !line) return null;");
  });
});

// ── the catalogues ask ────────────────────────────────────────────────

describe("the journal side asks what it composes", () => {
  const ctx = (): SectionContext =>
    ({
      noteKind: "leaf",
      // `vault.trackers` IS A LIST OF ANSWERS, `{ value, label }` — the shape
      // `section-insert.ts`'s `vault()` resolves and `ChoiceQuestion.values`
      // takes, already filtered on `isChartable`.
      vault: {
        trackers: [
          { value: "Mood", label: "Mood" },
          { value: "Energy", label: "Energy" },
        ],
      },
    }) as unknown as SectionContext;

  const bridge = () =>
    JOURNAL_SECTIONS.find((s) => s.id === BRIDGE_SECTION_ID)!;

  it("asked nothing for six releases and asks three things now", () => {
    // `entry-sections.ts` calls its own bridge "THE ONE SECTION IN EITHER DIARY
    // CATALOGUE THAT ASKS THE READER ANYTHING", and that comment was the
    // argument for why this one had to. The premise it stood on — "it cannot
    // read the tracker registry" — expired when `ctx.vault` arrived in 5.26.
    const keys = (bridge().questions?.(ctx()) ?? []).map((q) => q.key);
    expect(keys).toEqual(["tracker", "filters", "grain"]);
  });

  it("offers the vault's trackers, with the old default as the empty state", () => {
    const q = bridge().questions!(ctx())[0];
    expect(q.kind).toBe("choice");
    expect(q.values.map((v: { value: string }) => v.value)).toEqual([
      "Mood",
      "Energy",
    ]);
    // THE DEFAULT IS AN ANSWER, NOT THE ONLY ANSWER. `emptyLabel` is the
    // catalogue saying in the reader's words that a bare directive works, which
    // is also what keeps the row addable with every box left alone.
    expect(q.emptyLabel).toBe(DEFAULT_BRIDGE_TRACKER);
  });

  it("asks nothing that is required, so the row stays addable", () => {
    // The diary side's target IS required — no answer, no section — and that
    // difference is deliberate: a journal leaf's bridge has a working default
    // for all three answers, so a reader can tick it and get a block.
    for (const q of bridge().questions!(ctx())) {
      expect(questionIsRequired(q), q.key).toBe(false);
    }
  });

  it("names the period, and composes the navigator from the answer", () => {
    const q = bridge().questions!(ctx())[2];
    expect(q.values.map((v: { value: string }) => v.value)).toEqual([
      "week",
      "month",
      "quarter",
      "year",
    ]);
    expect(q.emptyLabel).toBe(BRIDGE_NAV_GRAIN);
    expect(q.directive).toBe("period-nav");
  });

  it("carries its own name onto the bar", () => {
    // The journal line carried no label, so a section the catalogue calls
    // "From the diary" drew a bar reading 🌉 Mood — `bridgeHeader` falls back to
    // the target's label. The diary side has composed `|From the journals` all
    // along; this makes the pair symmetric.
    const composed = bridge().render!({ noteKind: "leaf" } as SectionContext, undefined);
    const text = composed.flatMap((b) => b.lines ?? []).join("\n");
    expect(text).toContain(`|${BRIDGE_SECTION_TITLE}`);
    expect(text).toContain(`period-nav:${BRIDGE_NAV_GRAIN}`);
    expect(text).toContain(`bridge-readings:${DEFAULT_BRIDGE_TRACKER}`);
  });

  it("composes the navigator from the period the reader picked", () => {
    // `render` hardcoded `period-nav:month` for six releases, and the comment
    // under it argued for the DEFAULT rather than for there being one answer.
    const weekly = bridge()
      .render!({ noteKind: "leaf" } as SectionContext, { grain: "week" })
      .flatMap((b) => b.lines ?? [])
      .join("\n");
    expect(weekly).toContain("period-nav:week");
    expect(weekly).not.toContain("period-nav:month");
  });

  it("takes a renamed bar, like every other titled section here", () => {
    const renamed = bridge()
      .render!({ noteKind: "leaf" } as SectionContext, { label: "Readings" })
      .flatMap((b) => b.lines ?? [])
      .join("\n");
    expect(renamed).toContain("|Readings");
    expect(renamed).not.toContain(BRIDGE_SECTION_TITLE);
  });

  it("composes a filter tail only when there is one", () => {
    const bare = bridge()
      .render!({ noteKind: "leaf" } as SectionContext, { tracker: "Energy" })
      .flatMap((b) => b.lines ?? [])
      .join("\n");
    expect(bare).toContain(`bridge-readings:Energy|${BRIDGE_SECTION_TITLE}`);
    const filtered = bridge()
      .render!({ noteKind: "leaf" } as SectionContext, {
        tracker: "Energy",
        filters: "is:lesson",
      })
      .flatMap((b) => b.lines ?? [])
      .join("\n");
    expect(filtered).toContain(
      `bridge-readings:Energy is:lesson|${BRIDGE_SECTION_TITLE}`
    );
  });
});

describe("the diary side's target is a piece, not the whole argument", () => {
  const bridge = () => ENTRY_SECTIONS.find((s) => s.id === "bridge")!;

  it("declares the compound argument 4.70 already paid for", () => {
    // 5.1's defect: `argSpanIn` ends an argument at the label bar, so on
    // `bridge-notes:meal tag:dinner|From the journals` the span is
    // `meal tag:dinner` and answering the target spliced over all of it — and
    // `answerInText` read the same span back, so the stored "answer" became
    // `meal tag:dinner`. `part` is the mechanism `time-grid`'s compound
    // argument was given in 4.70, on a space join instead of a `|` one.
    const qs = bridge().questions!({ grain: "daily", journalKinds: [] });
    expect(qs[0].part).toEqual({ at: 0, of: 2, join: " " });
    expect(qs[1].part).toEqual({ at: 1, of: 2, join: " " });
    expect(qs[0].directive).toBe(qs[1].directive);
  });

  it("asks for the tail under the key the directive reads", () => {
    // A question whose key nothing composes is a box the reader types into and
    // a save that drops it — which is the half-persistence
    // `layout-transfer.ts` refuses to ship, arriving by a renamed field.
    const qs = bridge().questions!({ grain: "daily", journalKinds: [] });
    expect(qs.map((q) => q.key)).toEqual(["target", "filters"]);
    const composed = bridge().directive!(
      { grain: "daily", extra: ["bridge"] },
      { target: "meal", filters: "tag:dinner" }
    );
    expect(composed).toBe("bridge-notes:meal tag:dinner|From the journals");
  });
});

// ── the defects the doors exposed ─────────────────────────────────────

describe("saving a page as the grain's default keeps the bridge's answers", () => {
  it("reads them back off the page, which it did not before (5.2)", () => {
    // `wantFromJournalNote` read `label`, prose headings and `answersInText`
    // only `if (isPageWidgetId(id))`, and its own comment said the catalogue
    // gap was real and deliberately left open. That was harmless while nothing
    // could configure a journal note's bridge; the cog makes it a silent loss
    // at the exact moment the reader asks to keep something.
    //
    // ONE ID, NOT EVERY SECTION. The decision that comment reserves — whether
    // to carry every catalogue answer — is still reserved, because widening the
    // read wholesale changes what every existing journal stores.
    const body = fnBody("wantFromJournalNote", "journal-template");
    expect(body).toContain(
      "if (section && (isPageWidgetId(id) || id === BRIDGE_SECTION_ID))"
    );
    expect(BRIDGE_SECTION_ID).toBe("bridge");
  });

  it("names the id once, rather than in each file that needs it", () => {
    expect(readCode("journal-sections")).toContain("id: BRIDGE_SECTION_ID");
  });
});

describe("a readings bridge on a diary host is refused (5.3)", () => {
  it("names why, and what to do instead", () => {
    // `collectPoints` takes no surface argument and walks `entriesOfGrain` —
    // the diary's own entries — whatever the host. So a readings bridge on a
    // diary entry is a note asking itself a question, and the honest fix is the
    // refusal rather than teaching the chart a second store.
    // ASKED OF THE FUNCTION, NOT OF ITS SOURCE. A source match passes over
    // `if (false && …)`, which is the shape every disabled guard has.
    const refusal = bridgeRefusal({
      direction: "readings",
      target: "Mood",
      filters: "",
      host: {
        declares: (prop) => prop === "month-start",
        valueOf: () => "2026-07-01",
        iso: null,
        navUnit: null,
        surface: "diary",
      },
      catalogue: { kinds: [], trackers: [{ id: "Mood", label: "Mood" }] },
    });
    expect(refusal?.check).toBe("direction");
    expect(refusal?.message).toContain("would be reading itself");
    expect(refusal?.message).toContain("bridge-notes:");
  });

  it("still plans the same bridge on a journal host", () => {
    // The guard is about the SURFACE and nothing else, so the one host the
    // feature is for is untouched by it.
    expect(
      bridgeRefusal({
        direction: "readings",
        target: "Mood",
        filters: "",
        host: {
          declares: (prop) => prop === "month-start",
          valueOf: () => "2026-07-01",
          iso: null,
          navUnit: "month",
          surface: "journal",
        },
        catalogue: { kinds: [], trackers: [{ id: "Mood", label: "Mood" }] },
      })
    ).toBeNull();
  });

  it("comes before the target check, so the message is the useful one", () => {
    // A `bridge-readings:Mood` on a diary entry would otherwise be refused for
    // naming an unknown tracker — a true sentence about the wrong problem,
    // which sends the reader looking for a tracker instead of a surface.
    const body = fnBody("planBridge", "core/bridge");
    expect(body.indexOf('host.surface === "diary"')).toBeLessThan(
      body.indexOf("No note type called")
    );
  });

  it("offers no trackers for a journal target, so no menu disagrees with it", () => {
    // The refusal is the rule; `bridgeCatalogue` is what the editor offers, and
    // a picker whose entries are known in advance to refuse is the defect
    // patch 7 named. Readings only exist on the diary side.
    const body = fnBody("bridgeCatalogue", "bridge-widgets");
    // THE TERNARY, NOT THE WORDS. `if (target === "diary")` appears again two
    // lines down for the KINDS walk, so a bare match passes with this gate
    // deleted.
    expect(body).toContain('target === "diary"\n      ? plugin.settings.trackers');
    expect(body).toContain("      : [];");
    // AND FILTERED ON `isChartable`, NOT `chartableType`. A tracker with a
    // chartable VALUE type but no diary grain has no points for `collectPoints`
    // to find, so offering it is a menu entry whose block renders empty —
    // `chart-ui.ts` and `section-insert.ts`'s `vault()` already filter this way.
    expect(body).toContain("filter(isChartable)");
    expect(readCode("bridge-widgets")).not.toContain("chartableType");
  });
});

describe("freeze is refused on any note that re-scopes in place (5.4)", () => {
  it("asks about the note, not about a list of four paths", () => {
    // `setPeriod(ctx.sourcePath, …)` writes the period property into whatever
    // note hosts the navigator, and the journal catalogue composes
    // `period-nav:` beside every bridge it offers — so a journal leaf re-scopes
    // exactly like the four overviews and freeze on it decays on day one.
    const body = fnBody("isRescopingNote", "bridge-widgets");
    expect(body).toContain("if (navUnit) return true;");
    expect(readCode("bridge-widgets")).not.toContain("isRescopingDashboard");
  });
});

describe("a control is drawn where it acts (5.5)", () => {
  const head = () => fnBody("bridgeHeader", "bridge-widgets");

  it("gives the cards/list toggle only to the direction that has one", () => {
    // Only `buildBridgeNotesRegion` installs `body.toggleMode`, so on a
    // readings bridge the icon swapped, the optional call found nothing and
    // nothing happened — "a control that draws, flips, saves and changes
    // nothing", which `journal-sections.ts` names as a defect in those words.
    expect(fnBody("buildBridge", "bridge-widgets")).toContain(
      'direction === "notes"'
    );
  });

  it("gives the trend control only to the direction that has one", () => {
    // Mutually exclusive by direction, in one slot: a notes bridge shows cards
    // or a list, a readings bridge a list or a chart, and both answer "how am I
    // looking at this".
    expect(fnBody("buildBridge", "bridge-widgets")).toContain(
      'direction === "readings"'
    );
    // ANCHORED ON THE BUTTON'S OWN BRANCH, like the cog's: the ⋯ menu carries
    // the same clause.
    expect(head()).toContain(
      "if (actions.trend && !snap.frozen) {\n    const trendBtn"
    );
  });

  it("neither view control is offered on a snapshot", () => {
    // A frozen block is markdown and `renderFrozen` is the only thing that
    // draws it; neither view applies.
    expect(head()).toContain("if (actions.toggleMode && !snap.frozen) {");
  });
});

describe("the trend flag is reachable at last", () => {
  const body = () => fnBody("setBridgeTrend", "bridge-widgets");

  it("writes through the pure writer rather than patching the string", () => {
    // `withToken` would have been the shared route and it cannot be: it builds
    // on `splitArgHead`, which cuts the argument at its first colon, so
    // `bridge-readings:Mood is:lesson` would come back
    // `bridge-readings:Mood is#trend:lesson`.
    expect(body()).toContain("writeBridgeDirective({ ...directive, trend: on })");
    expect(body()).toContain("readBridgeDirective(");
  });

  it("goes through vault.process, like every other body write here", () => {
    expect(body()).toContain("plugin.app.vault.process(file,");
  });

  it("declines an ambiguous note rather than rewriting the first line", () => {
    // `soleArgSpanIn`'s rule, applied to a write: an answer that cannot be told
    // apart from another section's is one nothing may claim to have read. The
    // section machinery cannot compose two bridges on one note, so this guards
    // a hand-written file.
    expect(body()).toContain("if (at.length !== 1) return text;");
  });

  it("keeps the line's own indentation", () => {
    // A directive inside a fence may be indented by whatever wrote the fence,
    // and a rewrite that left-aligned it would move a line the reader did not
    // ask to move.
    // THE WHOLE WRITE, because `const indent` computed and not used is the
    // shape this mutant wears.
    expect(body()).toContain(
      "lines[at[0]] = indent + writeBridgeDirective({ ...directive, trend: on });"
    );
    expect(body()).toContain("const indent = /^\\s*/.exec(lines[at[0]])![0];");
  });
});

// ── the documentation, which is the other half of the fix ─────────────

describe("both directives are documented at last", () => {
  const doc = () => readFileSync(resolve(ROOT, "assets", "documentation.md"), "utf8");

  it("names them, beside the navigator that was explained in their terms", () => {
    // `assets/documentation.md` is compiled into `main.js` and written into
    // every vault, and it held ZERO occurrences of either keyword — the word
    // "bridge" appeared once, inside the `period-nav:` row, explaining the
    // navigator in terms of a directive the document never defined.
    expect(doc()).toContain("bridge-notes:");
    expect(doc()).toContain("bridge-readings:");
  });

  it("lists the five filters off the constant, so a sixth cannot ship undocumented", () => {
    // ASSERTED OFF `BRIDGE_SELECTORS` AND NOT OFF A WRITTEN LIST. The set being
    // closed is the promise the feature makes, and a document naming four of
    // five would be the kind of drift that produced this round.
    for (const selector of BRIDGE_SELECTORS) {
      expect(doc(), selector).toContain(`${selector}:`);
    }
  });

  it("says what the trend flag and the snapshot do", () => {
    expect(doc()).toContain("#trend");
    expect(doc()).toMatch(/freeze/i);
  });
});

// ── the write, end to end through the model ───────────────────────────

describe("answering one piece leaves the other as the reader left it", () => {
  // A journal leaf composed with a bridge on it, which is what the cog opens
  // over. `templateTargets` gives the real contexts a registered type has, and
  // `journalSectionModel` is the model `modelForNote` hands the window.
  const leaf = () => {
    const target = templateTargets(STUDY_JOURNAL).find((t) =>
      defaultSectionIds(t.ctx).length > 0 && t.ctx.noteKind === "leaf"
    );
    expect(target, "a leaf target").toBeTruthy();
    return target!;
  };

  const composed = (): { text: string; model: ReturnType<typeof journalSectionModel> } => {
    const t = leaf();
    const ids = [...defaultSectionIds(t.ctx)];
    const text = composeTemplate(
      t.ctx,
      ids.includes(BRIDGE_SECTION_ID) ? ids : [...ids, BRIDGE_SECTION_ID],
      STUDY_JOURNAL.layout?.[t.key]
    );
    expect(text).toContain("bridge-readings:");
    return { text, model: journalSectionModel(t.ctx) };
  };

  const want = (
    model: ReturnType<typeof journalSectionModel>,
    text: string,
    options: Record<string, string>
  ): string => {
    const next = model.apply(
      text,
      model
        .present(text)
        .map((id) => (id === BRIDGE_SECTION_ID ? { id, options } : id))
    );
    expect(next, JSON.stringify(options)).not.toBeNull();
    return next!;
  };

  const directiveIn = (text: string): string =>
    text.split("\n").find((l) => l.trim().startsWith("bridge-readings:"))!.trim();

  it("writes the tracker the reader chose", () => {
    const { text, model } = composed();
    expect(directiveIn(want(model, text, { tracker: "Energy" }))).toBe(
      `bridge-readings:Energy|${BRIDGE_SECTION_TITLE}`
    );
  });

  it("keeps a hand-written filter when the tracker changes (5.1)", () => {
    // THE TEST THAT MATTERS MOST. `argSpanIn` ends an argument at the label
    // bar, so the span over `bridge-readings:Mood is:lesson|From the diary` is
    // `Mood is:lesson` — and a splice with no `part` would replace all of it
    // with "Energy", silently deleting a filter the reader typed by hand.
    const { text, model } = composed();
    const filtered = text.replace(
      directiveIn(text),
      `bridge-readings:${DEFAULT_BRIDGE_TRACKER} is:lesson|${BRIDGE_SECTION_TITLE}`
    );
    expect(directiveIn(want(model, filtered, { tracker: "Energy" }))).toBe(
      `bridge-readings:Energy is:lesson|${BRIDGE_SECTION_TITLE}`
    );
  });

  it("keeps the tracker when only the filters change", () => {
    // The other direction of the same promise, and the one the window relies on
    // when a reader opens the cog and types into one box.
    const { text, model } = composed();
    expect(directiveIn(want(model, text, { filters: "tag:revision" }))).toBe(
      `bridge-readings:${DEFAULT_BRIDGE_TRACKER} tag:revision|${BRIDGE_SECTION_TITLE}`
    );
  });

  it("clears the tail without leaving a trailing space", () => {
    // `joinParts` drops the empty tail, which is what keeps a cleared filter
    // box from writing `bridge-readings:Mood |From the diary` — a line that
    // parses the same and reads as a mistake.
    const { text, model } = composed();
    const filtered = text.replace(
      directiveIn(text),
      `bridge-readings:${DEFAULT_BRIDGE_TRACKER} is:lesson|${BRIDGE_SECTION_TITLE}`
    );
    expect(directiveIn(want(model, filtered, { filters: "" }))).toBe(
      `bridge-readings:${DEFAULT_BRIDGE_TRACKER}|${BRIDGE_SECTION_TITLE}`
    );
  });

  it("re-scopes the navigator beside it when the period changes", () => {
    // The grain question names `period-nav`, which this section already claims,
    // so the answer lands on the line the reader can see saying the period.
    const { text, model } = composed();
    const next = want(model, text, { grain: "week" });
    expect(next).toContain("period-nav:week");
    expect(next).not.toContain("period-nav:month");
    // And the bridge's own line is untouched by it.
    expect(directiveIn(next)).toBe(directiveIn(text));
  });

  it("answers null when nothing moved, which is what stops a no-op write", () => {
    const { text, model } = composed();
    const same = model.apply(
      text,
      model
        .present(text)
        .map((id) =>
          id === BRIDGE_SECTION_ID
            ? { id, options: { tracker: DEFAULT_BRIDGE_TRACKER } }
            : id
        )
    );
    expect(same).toBeNull();
  });
});

describe("the plan says what a filter answer does", () => {
  it("reads a `text` answer back in the reader's own words", () => {
    // `describeAnswers` writes the sentence under *Apply changes* — "the
    // filters to narrow it by → tag:revision" — and it had two branches asking
    // `q.kind === "title"`, which a seventh kind silently fell out of: an
    // answered filter would have read as an empty string with no fallback.
    const q = {
      kind: "text" as const,
      key: "filters",
      label: "the filters to narrow it by",
      placeholder: "no filters",
    };
    expect(describeAnswers([q], { filters: "tag:revision" })).toContain(
      "tag:revision"
    );
    // AND AN EMPTIED ONE MEANS WHAT THE PLACEHOLDER SAYS, which is a title's
    // rule and the whole reason this kind shares that branch.
    expect(describeAnswers([q], { filters: "" })).toContain("no filters");
  });
});
