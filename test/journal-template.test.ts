// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// A journal note's Template window (4.33) — the pure half.
//
// THE ROUND TRIP IS THE GATE AND IT COMES FIRST. If a freshly created note does
// not read as empty, the Reload control can never be drawn on any note anywhere,
// and every other test in this file would be describing a feature nobody can
// reach. 4.29 put the same assertion at the top of its own suite for the same
// reason.

import { describe, expect, it } from "vitest";
import { STUDY_CONFIG, STUDY_JOURNAL, buildJournalType } from "../src/journals/journal";
import { composeTemplate } from "../src/journals/custom-journal";
import {
  chosenSectionIds,
  sectionContext,
  sectionsFor,
  templateKeyFor,
} from "../src/journals/journal-sections";
import type { SectionContext } from "../src/journals/journal-sections";
import { applySections } from "../src/journals/journal-plan";
import {
  journalReloadLoss,
  wantFromJournalNote,
} from "../src/journals/journal-template";
import { replaceBody } from "../src/core/note-sections";
import { App, TFile } from "obsidian";
import { JournalTemplates } from "../src/journals/journal-template-manager";
import { presetConfig } from "../src/journals/custom-journal";
import type { JournalConfig } from "../src/journals/custom-journal";
import { STUDY_PRESET } from "../src/journals/journal";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import type { ChronoAnvilSettings } from "../src/core/settings";
import { readCode } from "./sources";
import { looseLines, fenceLines } from "../src/core/reload-loss";

// Every template target Study has, as the context it is written against.
const targets = (): { key: string; ctx: SectionContext }[] => {
  const t = STUDY_JOURNAL;
  const out: { key: string; ctx: SectionContext }[] = [];
  t.levels.forEach((_l, depth) => {
    const ctx = sectionContext(t, { depth });
    out.push({ key: templateKeyFor(ctx), ctx });
  });
  for (const kind of t.kinds) {
    const ctx = sectionContext(t, { kind });
    out.push({ key: templateKeyFor(ctx), ctx });
  }
  const paged = t.kinds.find((k) => k.pages);
  if (paged) {
    const ctx = sectionContext(t, { page: paged });
    out.push({ key: templateKeyFor(ctx), ctx });
  }
  return out;
};

// COMPOSED THE WAY THE GENERATOR COMPOSES IT — with the type's own layout for
// this target. `journalTemplateFiles` passes `type.layout?.[t.key]`, and Study
// declares overrides for its Topic Index and both leaf kinds; composing without
// them produces a page the catalogue would never write, and the round-trip test
// then measures a note against a baseline that was never its own. (It did, on
// the first run: three `header:` lines and a resource shelf came out as losses
// on `index:1`.)
const composedFor = (ctx: SectionContext): string =>
  composeTemplate(ctx, undefined, STUDY_JOURNAL.layout?.[templateKeyFor(ctx)]);

// The same page with sections NAMED, for the losses that are about one section
// in particular.
//
// FOUR TESTS BELOW ARE ABOUT A REGION OR A FENCE — a checklist the reader typed
// into, a chart they added to the charts region — and as of 5.20 neither of
// those sections is composed into a fresh page. The loss detector does not ask
// how a section got into the file, so naming it is the whole fix; what it must
// not do is compose without the type's own layout, which is the mistake the
// note above records.
const composedWith = (ctx: SectionContext, ids: string[]): string =>
  composeTemplate(ctx, ids, STUDY_JOURNAL.layout?.[templateKeyFor(ctx)]);

describe("a freshly created note holds nothing a reload would destroy", () => {
  it("has no losses on any of Study's template targets", () => {
    // THE ASSERTION THE WHOLE FEATURE HANGS OFF. Composing a page over itself
    // must destroy nothing — front pages, both leaf kinds, and the page.
    for (const { key, ctx } of targets()) {
      const text = composedFor(ctx);
      expect(journalReloadLoss(text, text, ctx), key).toEqual([]);
    }
  });

  it("covers all five targets, so the loop above is not vacuous", () => {
    // A test that iterates an empty list passes. Name what it must contain.
    expect(targets().map((t) => t.key)).toEqual([
      "index:0",
      "index:1",
      "kind:lesson",
      "kind:practice",
      "page",
    ]);
  });
});

describe("what a reload would destroy", () => {
  const lesson = (): SectionContext =>
    sectionContext(STUDY_JOURNAL, {
      kind: STUDY_JOURNAL.kinds.find((k) => k.id === "lesson")!,
    });
  const topicIndex = (): SectionContext =>
    sectionContext(STUDY_JOURNAL, { depth: 1 });

  it("reports a region the reader has written in", () => {
    const ctx = lesson();
    const clean = composedWith(ctx, ["banner", "checklist", "headings"]);
    const written = clean.replace(
      /(<!--chronoanvil:tasks\n)/,
      "$1- [ ] finish the proof\n"
    );
    expect(written).not.toBe(clean);
    const loss = journalReloadLoss(written, clean, ctx);
    expect(loss.map((l) => l.kind)).toContain("region");
  });

  it("reports a tracker added from this note's own cog", () => {
    // THE LOSS NOBODY PREDICTS, and 4.29's own "worst to get wrong". The
    // directive sits in the body between the tracker markers while its property
    // sits in frontmatter, so a recompose reseeds the block and orphans the
    // property. A regions-are-empty test misses it completely.
    const ctx = lesson();
    const clean = composedFor(ctx);
    const withTracker = clean.replace(
      /(# chronoanvil:trackers:start\n)/,
      "$1tracker:Mood\n"
    );
    expect(withTracker).not.toBe(clean);
    const loss = journalReloadLoss(withTracker, clean, ctx);
    expect(loss.map((l) => l.kind)).toContain("tracker");
    expect(loss.find((l) => l.kind === "tracker")!.label).toBe("tracker:Mood");
  });

  it("reports a paragraph typed under a heading", () => {
    // THE CASE A RUNS WALK IS BLIND TO. `markdownOwnerOf` deliberately
    // over-matches, so `parseSections` attributes this paragraph to `headings`
    // and reports the note as entirely accounted for. The line diff sees it.
    const ctx = lesson();
    const clean = composedFor(ctx);
    // Study's Lesson ships "Overview / Key Concepts / …", not the generic
    // skeleton — asserted here so this test cannot quietly become a no-op the
    // way its first draft did, which replaced a "## Notes" the page never had.
    expect(clean).toContain("## Key Concepts");
    const written = clean.replace(
      "## Key Concepts",
      "## Key Concepts\n\nthe first draft of the proof"
    );
    expect(written).not.toBe(clean);
    const loss = journalReloadLoss(written, clean, ctx);
    const prose = loss.filter((l) => l.kind === "prose");
    expect(prose.map((l) => l.label)).toEqual(["the first draft of the proof"]);
  });

  it("reports a chart the reader added, which the planner calls unchanged", () => {
    // THE FIFTH LOSS, AND THE SHARPEST. `chronoanvil-journal-charts` is an OPAQUE
    // fence kind, so `ownerOf` attributes the fence to `charts` whatever is
    // inside it — a plan over this note reports "Charts — unchanged" while a
    // rewrite would delete every spec in it.
    const ctx = topicIndex();
    const clean = composedWith(ctx, ["banner", "charts"]);
    expect(clean).toContain("jchart:");
    const withChart = clean.replace(
      /(jchart:[^\n]*\n)/,
      "$1jchart:j9:trend:confidence\n"
    );
    expect(withChart).not.toBe(clean);
    const loss = journalReloadLoss(withChart, clean, ctx);
    const added = loss.filter((l) => l.label === "jchart:j9:trend:confidence");
    expect(added).toHaveLength(1);
    expect(added[0].kind).toBe("fence");
  });

  it("reports a directive the reader typed into a fence", () => {
    const ctx = lesson();
    const clean = composedFor(ctx);
    const withOwn = clean.replace(
      /(```chronoanvil\n)/,
      "$1tasks-table:mine\n"
    );
    expect(withOwn).not.toBe(clean);
    const loss = journalReloadLoss(withOwn, clean, ctx);
    const foreign = loss.filter((l) => l.kind === "foreign");
    expect(foreign.map((l) => l.label)).toContain("tasks-table:mine");
  });

  it("does not report a section the reload is meant to drop", () => {
    // 4.29's rule, carried onto a surface whose fences also hold content the
    // reader wrote: "a catalogue directive the replacement drops is not a loss,
    // it is the reload doing what it was asked". The baseline is what the
    // catalogue would write for THIS note's sections, never what the
    // replacement composes — otherwise every reload that changed anything
    // would refuse itself.
    const ctx = lesson();
    const clean = composedFor(ctx);
    const layout = STUDY_JOURNAL.layout?.[templateKeyFor(ctx)];
    // Keep the two sections that hold the reader's own things — the tracker
    // block and the prose skeleton — and drop the rest. Dropping `trackers`
    // WOULD report, and correctly: those directives have readings in
    // frontmatter behind them, so a layout that removes the grid is a loss
    // worth refusing rather than an arrangement.
    const fewer = composeTemplate(ctx, ["banner", "trackers", "headings"], layout);
    expect(fewer.length).toBeLessThan(clean.length);
    expect(journalReloadLoss(clean, fewer, ctx)).toEqual([]);
  });
});

describe("the fence walk the diary never needed", () => {
  it("steps over a journal charts fence rather than reading it as prose", () => {
    // `looseLines` tested `line === "```chronoanvil"` until 4.33. An index note's
    // fence is ```chronoanvil-journal-charts, which failed that equality — so the
    // walk never entered fence mode and collected every spec as the reader's
    // prose. It hid itself, because on a freshly composed page the stray lines
    // appear on both sides of the diff and cancel.
    const ctx = sectionContext(STUDY_JOURNAL, { depth: 1 });
    const text = composedWith(ctx, ["banner", "charts"]);
    expect(text).toContain("```chronoanvil-journal-charts");
    expect(looseLines(text).some((l) => l.startsWith("jchart:"))).toBe(false);
    expect(fenceLines(text).some((l) => l.startsWith("jchart:"))).toBe(true);
  });
});

describe("what this page says", () => {
  const lesson = (): SectionContext =>
    sectionContext(STUDY_JOURNAL, {
      kind: STUDY_JOURNAL.kinds.find((k) => k.id === "lesson")!,
    });

  it("reads the sections in the order the page has them", () => {
    const ctx = lesson();
    const { sections } = wantFromJournalNote(composedFor(ctx), ctx);
    expect(sections[0]).toBe("banner");
    expect(sections).toContain("headings");
  });

  it("keeps a heading the reader renamed", () => {
    // FINDING 5. The existing "Save as layout…" resolves overrides from the
    // journal's stored config rather than from the page, so a renamed heading
    // was dropped without a word at the exact moment the reader asked to keep
    // something.
    const ctx = lesson();
    const clean = composedFor(ctx);
    expect(clean).toContain("## Key Concepts");
    const renamed = clean.replace("## Key Concepts", "## Working");
    const { options } = wantFromJournalNote(renamed, ctx);
    const titles = (options.headings?.headings ?? []).map((h) => h.title);
    expect(titles).toContain("Working");
    expect(titles).not.toContain("Key Concepts");
  });

  it("keeps a header bar the reader retitled", () => {
    // The other half of finding 5. A retitled bar lives as the `header:`
    // argument on the section's own directive.
    //
    // ON THE LESSON, WHICH HAS ONE. The first draft of this test used Practice
    // and opened with `if (!match) return;` — Practice's template draws no
    // header at all, so the test passed against a version with the read
    // disabled. A mutation caught it. There is no early return now, and the
    // precondition is asserted rather than tiptoed around.
    const ctx = lesson();
    const clean = composedFor(ctx);
    expect(clean).toContain("header:📄 Pages");
    const retitled = clean.replace("header:📄 Pages", "header:My own name");
    const { options } = wantFromJournalNote(retitled, ctx);
    expect(options.pages?.label).toBe("My own name");
  });

  it("gives a section's header to that section and to no other", () => {
    // `header:` IS NOT UNIQUE IN A NOTE. A note-wide read hands the same title
    // to every section claiming one, so saving a Lesson would have stamped
    // "📄 Pages" onto the Resources bar. The fence is the unit that
    // disambiguates, because `renderSection` emits exactly one per section.
    const ctx = lesson();
    const retitled = composedFor(ctx).replace(
      "header:📄 Pages",
      "header:My own name"
    );
    const { options, sections } = wantFromJournalNote(retitled, ctx);
    for (const id of sections) {
      if (id === "pages") continue;
      expect(options[id]?.label, id).not.toBe("My own name");
    }
  });

  it("never carries the prose under a heading into the template", () => {
    // A DECISION RATHER THAN AN OMISSION. A heading's name is the shape the
    // reader arranged; the prose under it is what they wrote in THIS note.
    // Carrying the body would leak a sentence about one lesson into every
    // lesson made afterwards.
    const ctx = lesson();
    const written = composedFor(ctx).replace(
      "## Key Concepts",
      "## Key Concepts\n\nsomething about today only"
    );
    const { options } = wantFromJournalNote(written, ctx);
    expect(JSON.stringify(options.headings ?? {})).not.toContain("today only");
    // And the body Study DECLARES for that heading is still carried, matched by
    // title — a save must not strip the prompt text a type ships.
    const kept = (options.headings?.headings ?? []).find(
      (h) => h.title === "Key Concepts"
    );
    expect(kept?.body).toEqual(["- **Definition:** ", "- **Example:** "]);
  });

  it("reports a line it cannot carry rather than dropping it in silence", () => {
    const ctx = lesson();
    const withOwn = composedFor(ctx).replace(
      /(```chronoanvil\n)/,
      "$1tasks-table:mine\n"
    );
    const { drops } = wantFromJournalNote(withOwn, ctx);
    expect(drops).toContain("tasks-table:mine");
  });
});

describe("writing a template back over a note", () => {
  it("keeps the frontmatter byte for byte and replaces the body", () => {
    const head = [
      "---",
      "type: lesson",
      "subject: Maths",
      "topic: Algebra",
      "date: 2026-08-16",
      "created: 2026-08-16T09:00:00",
      "confidence: 4",
      "status: in-progress",
      "---",
    ].join("\n");
    const text = `${head}\nold body\n`;
    const composed = "---\ntype: lesson\n---\nnew body\n";
    const next = replaceBody(text, composed)!;
    expect(next.startsWith(head)).toBe(true);
    expect(next).toContain("new body");
    expect(next).not.toContain("old body");
    // The reading survives, which is the whole reason the body alone is
    // replaced: `confidence: 4` is a measurement, not a template value.
    expect(next).toContain("confidence: 4");
  });

  it("returns null when nothing would change", () => {
    const text = "---\ntype: lesson\n---\nbody\n";
    expect(replaceBody(text, text)).toBeNull();
  });
});

describe("Study's own defaults are not disturbed", () => {
  it("still composes the templates it shipped", () => {
    // The byte-inertness assertion for this release: none of the above changed
    // what a journal composes, only what can be read off it.
    const fresh = buildJournalType(structuredClone(STUDY_CONFIG));
    for (const { ctx } of targets()) {
      expect(composeTemplate(ctx)).toBe(
        composeTemplate(
          sectionContext(fresh, ctxTargetOf(ctx, fresh)) as SectionContext
        )
      );
    }
  });
});

// Rebuild the same target against another build of the same config, so the two
// compositions are comparable without re-deriving the target list.
function ctxTargetOf(
  ctx: SectionContext,
  type: ReturnType<typeof buildJournalType>
): Parameters<typeof sectionContext>[1] {
  if (ctx.noteKind === "index") return { depth: ctx.depth ?? 0 };
  if (ctx.noteKind === "page") {
    return { page: type.kinds.find((k) => k.pages)!.pages! };
  }
  return { kind: type.kinds.find((k) => k.id === ctx.kind!.id)! };
}

// ── the manager, and the gate on the write itself ─────────────────────

// A plugin holding one journal config and nothing else. Everything else the
// manager touches on these paths is a vault call these cases never reach.
const stubPlugin = (): {
  plugin: ConstructorParameters<typeof JournalTemplates>[1];
  cfg: JournalConfig;
} => {
  const cfg = presetConfig(STUDY_PRESET, {
    root: STUDY_CONFIG.root,
    templatesFolder: STUDY_CONFIG.templatesFolder,
  });
  const settings = {
    ...DEFAULT_SETTINGS,
    customJournals: [cfg],
  } as ChronoAnvilSettings;
  const plugin = {
    settings,
    saveSettings: async (): Promise<void> => {},
  } as unknown as ConstructorParameters<typeof JournalTemplates>[1];
  return { plugin, cfg };
};

// An app whose vault holds one note. Enough for `reload`'s refusal paths, which
// read the file and return before reaching the confirmation window.
const appWith = (
  path: string,
  text: string
): { app: App; written: () => string | null } => {
  const file = new TFile(path);
  let written: string | null = null;
  const app = {
    vault: {
      getAbstractFileByPath: (p: string) => (p === path ? file : null),
      read: async (): Promise<string> => text,
      modify: async (_f: TFile, t: string): Promise<void> => {
        written = t;
      },
    },
  } as unknown as App;
  return { app, written: () => written };
};

const lessonCtx = (): SectionContext =>
  sectionContext(STUDY_JOURNAL, {
    kind: STUDY_JOURNAL.kinds.find((k) => k.id === "lesson")!,
  });

describe("the reload refuses rather than trusting the window", () => {
  const PATH = "03 - Journals/Study/Maths/Algebra/Quadratics.md";

  it("declines a note that holds writing, and writes nothing", async () => {
    // THE GATE, ASKED OF THE WRITE ITSELF. The window draws no control over a
    // note like this, and the two are separated by however long the reader
    // leaves the window open.
    //
    // ASKED BEHAVIOURALLY. 4.29's outcome records two source pins on this exact
    // guard that could not fail, because they measured text order where the
    // claim is about what the method does.
    const ctx = lessonCtx();
    const tpl = composedFor(ctx);
    const page = tpl.replace("## Key Concepts", "## Key Concepts\n\nmy working");
    const { app, written } = appWith(PATH, page);
    const { plugin } = stubPlugin();
    const mgr = new JournalTemplates(app, plugin);
    expect(await mgr.reload(PATH, ctx, tpl, "Lesson default")).toBe(false);
    expect(written()).toBeNull();
  });

  it("declines when the note already matches, and writes nothing", async () => {
    const ctx = lessonCtx();
    const tpl = composedFor(ctx);
    const { app, written } = appWith(PATH, tpl);
    const { plugin } = stubPlugin();
    const mgr = new JournalTemplates(app, plugin);
    expect(await mgr.reload(PATH, ctx, tpl, "Lesson default")).toBe(false);
    expect(written()).toBeNull();
  });

  it("declines a note with no properties block at all", async () => {
    // ON AN EMPTY FILE, WHICH IS THE ONLY WAY THIS TEST CAN FAIL. Any file with
    // WORDS in it and no frontmatter is already refused by the loss gate —
    // its text reads as prose — so a version with this guard deleted would
    // still return false and the test would pass against the bug. An empty
    // file has no losses at all, so the guard is the only thing standing
    // between it and the write.
    const ctx = lessonCtx();
    const tpl = composedFor(ctx);
    const { app, written } = appWith(PATH, "");
    const { plugin } = stubPlugin();
    const mgr = new JournalTemplates(app, plugin);
    expect(await mgr.reload(PATH, ctx, tpl, "Lesson default")).toBe(false);
    expect(written()).toBeNull();
  });

  it("is why the guard is there: replaceBody would take the whole file", () => {
    // The hazard the guard exists over, stated rather than implied.
    // `replaceBody` treats a file with no frontmatter as "the whole file is the
    // body" — defensible on a diary entry, destructive here, because a page's
    // `parent:` is the only thing tying it to the note it belongs to and
    // nothing in the body could rebuild it.
    const composed = "---\ntype: lesson\n---\nfresh\n";
    expect(replaceBody("", composed)).toContain("fresh");
    expect(replaceBody("", composed)).not.toContain("type: lesson");
  });
});

describe("saving a default", () => {
  it("merges into the layout rather than replacing it", async () => {
    // ── WHAT THIS TEST GUARDS, AND WHAT IT USED TO GUARD ──────────────
    //
    // Study's Topic index carried `order` and no `sections`, and the claim was
    // that a `{sections, options}` write over that object would delete the
    // `order` and freeze the membership for good. 5.20 deleted every preset
    // `order` and `sections` list, so there is no order left to preserve — but
    // the key is still there and still carries the two OVERRIDES that outlived
    // it, the Learning Path's label and Study's three resource shelves.
    //
    // THOSE ARE NOW WHAT A CARELESS WRITE WOULD DESTROY, and they are worth
    // more than the order was: a reader who saves a Topic index as its default
    // and thereby loses the three shelves has lost data the catalogue cannot
    // reconstruct. `saveDefault` spreads `prev` and merges `options`, which is
    // the line under test either way.
    const ctx = sectionContext(STUDY_JOURNAL, { depth: 1 });
    const key = templateKeyFor(ctx);
    const text = composedWith(ctx, ["banner", "trackers", "children", "path"]);
    const { app } = appWith("03 - Journals/Study/Maths/Maths.md", text);
    const { plugin, cfg } = stubPlugin();
    expect(cfg.layout?.[key]?.order).toBeUndefined();
    const shelves = cfg.layout?.[key]?.options?.resources;
    expect(shelves).toBeTruthy();

    const mgr = new JournalTemplates(app, plugin);
    (plugin as unknown as { scaffold: unknown }).scaffold = {
      refreshJournalTemplates: async (): Promise<void> => {},
    };
    await mgr.saveDefault("03 - Journals/Study/Maths/Maths.md", ctx);

    // The page named no Resources section, so nothing overwrote the shelves.
    expect(cfg.layout![key].options?.resources).toEqual(shelves);
    // And an `order` is not invented for a key that never had one.
    expect(cfg.layout![key].order).toBeUndefined();
    expect(cfg.layout![key].sections?.length).toBeGreaterThan(0);
  });

  it("updates order when a reordered note is saved as default", async () => {
    const ctx = sectionContext(STUDY_JOURNAL, { page: STUDY_JOURNAL.kinds[0] });
    const key = templateKeyFor(ctx);
    const text = composedFor(ctx);
    const reordered = ["banner", "recall", "checklist", "headings"];
    const applied = applySections(
      text,
      ctx,
      reordered.map((id) => ({ id }))
    )!;
    const { app } = appWith("03 - Journals/Study/Maths/Algebra/page.md", applied);
    const { plugin, cfg } = stubPlugin();
    cfg.layout = {
      ...(cfg.layout ?? {}),
      [key]: { order: ["banner", "headings", "recall", "checklist"] },
    };
    const mgr = new JournalTemplates(app, plugin);
    (plugin as unknown as { scaffold: unknown }).scaffold = {
      refreshJournalTemplates: async (): Promise<void> => {},
    };
    await mgr.saveDefault("03 - Journals/Study/Maths/Algebra/page.md", ctx);

    expect(cfg.layout![key].order).toEqual(reordered);
    expect(cfg.layout![key].sections).toEqual(reordered);
    expect(chosenSectionIds(ctx, cfg.layout![key])).toEqual(reordered);
    expect(
      sectionsFor(ctx, cfg.layout![key])
        .filter((s) => reordered.includes(s.id))
        .map((s) => s.id)
    ).toEqual(reordered);
  });

  it("does not reach the shipped preset it was installed from", async () => {
    // The aliasing `presetConfig` used to have, asked of the gesture that would
    // have triggered it: a write through a shared object edits STUDY_CONFIG for
    // the rest of the process.
    //
    // WHAT THIS PINS IS `presetConfig`'s COPY, NOT THE MANAGER'S ASSIGNMENT.
    // Said plainly because a mutation proved it: turning the fresh-object
    // assignment back into `cfg.layout[key] = next` leaves this green, since
    // the config is no longer shared with anything. The assignment is defence
    // in depth and is deliberately unpinned — the same honesty 4.29 gave its
    // own unreachable guard. `test/journal-presets.test.ts` is where the copy
    // itself is pinned, from five directions.
    const ctx = lessonCtx();
    const key = templateKeyFor(ctx);
    const before = JSON.stringify(STUDY_CONFIG.layout);
    const text = composedFor(ctx);
    const { app } = appWith("03 - Journals/Study/M/A/Q.md", text);
    const { plugin, cfg } = stubPlugin();
    const mgr = new JournalTemplates(app, plugin);
    (plugin as unknown as { scaffold: unknown }).scaffold = {
      refreshJournalTemplates: async (): Promise<void> => {},
    };
    await mgr.saveDefault("03 - Journals/Study/M/A/Q.md", ctx);
    expect(cfg.layout![key].sections?.length).toBeGreaterThan(0);
    expect(JSON.stringify(STUDY_CONFIG.layout)).toBe(before);
  });
});

describe("where the window is reached from", () => {
  it("is on the journal banner's cog, beside Edit sections…", () => {
    // Source-scoped: the suite has no DOM, so the menu cannot be opened. What
    // is asserted is that the item exists in the same `settingsButton` callback
    // as the one it sits beside, and after it.
    const src = readCode("study-header");
    expect(src).toContain('setTitle("Template…")');
    expect(src).toContain("openJournalTemplateWindow(");
    expect(src.indexOf('setTitle("Edit sections…")')).toBeLessThan(
      src.indexOf('setTitle("Template…")')
    );
  });

  it("is not offered on a managed template file", () => {
    // The `isTemplate` branch returns before reaching it. "Save this template
    // as the default" is a tautology, and the file is regenerated anyway.
    const src = readCode("study-header");
    const tplBranch = src.indexOf("Preview template changes");
    expect(tplBranch).toBeGreaterThan(-1);
    expect(tplBranch).toBeLessThan(src.indexOf('setTitle("Template…")'));
  });

  it("leaves every judgement to the pure module", () => {
    // The window decides nothing — 4.29's rule, and the reason the suite can
    // test any of this without a DOM.
    const src = readCode("journal-template-modal");
    expect(src).toContain("this.manager.lossOf(");
    expect(src).not.toContain("allNoteRegions(");
    expect(src).not.toContain("parseSections(");
  });
});
