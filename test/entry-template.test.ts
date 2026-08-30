// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Saving a page as a grain's template, and reloading one onto a page. 4.29.
//
// WHAT THESE ARE REALLY GUARDING is a write that replaces a note's whole body.
// Two properties carry the release: a page a reader has written in must never
// be offered the reload, and a page that IS reloaded must keep its frontmatter
// byte-for-byte — the events stamp in it cannot be recovered by anything.

import { describe, expect, it } from "vitest";
import { readCode, readSrc } from "./sources";
import {
  ENTRY_SECTIONS,
  composeEntryTemplate,
  detectEntrySections,
  sectionsForEntry,
} from "../src/diary/entry-sections";
import {
  bandWithSection,
  entryReloadLoss,
  reloadEntryBody,
  wantFromEntry,
} from "../src/diary/entry-template";
import { writeNoteRegion } from "../src/core/notestore";
import { TRACKER_CLASSES } from "../src/trackers/trackers";
import type { TrackerClass } from "../src/trackers/trackers";
import { fillDailyTemplate } from "../src/core/util";
import { App, TFile } from "obsidian";
import { EntryTemplates } from "../src/diary/entry-template-manager";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import type { ChronoAnvilSettings } from "../src/core/settings";

// The shared band, in file order.
//
// THROUGH THE PRODUCTION PARSER rather than a regex written for the test. The
// first version of this helper read the id out of the directive by stripping
// the verb, which is wrong for exactly one section — `bridge` writes
// `bridge-notes:` — and so reported an empty id for the one case where a layout
// carries an answer. `detectEntrySections` is what the editor and the planner
// both use, so a band this helper can read is a band the plugin can read.
const sharedBand = (text: string, grain: TrackerClass = "daily"): string[] => {
  const structural = new Set(
    ENTRY_SECTIONS.filter((s) => s.fence !== "shared").map((s) => s.id)
  );
  return detectEntrySections(text, { grain }).filter((id) => !structural.has(id));
};

const ctxFor = (grain: (typeof TRACKER_CLASSES)[number]) => ({ grain });

describe("the shared band's order", () => {
  it("composes in catalogue order when the vault has saved none", () => {
    // BYTE-INERTNESS, STATED AS BEHAVIOUR. Five template files are written from
    // this function and every existing caller passes no order, so the default
    // path has to be exactly what it was. A default that reordered anything —
    // reversed, sorted, stable-but-shuffled — fails here on every grain.
    for (const grain of TRACKER_CLASSES) {
      const expected = sectionsForEntry({ grain })
        .filter((s) => s.fence === "shared")
        .map((s) => s.id);
      expect(sharedBand(composeEntryTemplate(grain), grain), grain).toEqual(expected);
    }
  });

  it("puts the named sections first, in the order given", () => {
    const out = sharedBand(composeEntryTemplate("daily", [], ["capture", "todo"]));
    expect(out.slice(0, 2)).toEqual(["capture", "todo"]);
  });

  it("is the whole band, so a section left out of it is left out", () => {
    // THE GESTURE THE FEATURE EXISTS FOR, and the reason the band is
    // authoritative rather than an ordering laid over the catalogue's
    // membership. A reader who deletes Challenges from their page and saves
    // that page as the default is saying their entries do not have Challenges.
    // An additive store would put it back on tomorrow's entry and say nothing.
    const out = sharedBand(composeEntryTemplate("daily", [], ["capture", "log"]));
    expect(out).toEqual(["capture", "log"]);
    // …and the regions follow it, or the widgets would read each other's text.
    const text = composeEntryTemplate("daily", [], ["capture", "log"]);
    expect([...text.matchAll(/<!--chronoanvil:([a-z-]+)/g)].map((m) => m[1])).toEqual([
      "capture",
      "log",
    ]);
  });

  it("can name a section this grain does not ship", () => {
    // A layout saved from one grain and reloaded onto another. The band joins
    // `extra`, which is what lets `directiveFor`'s borrowing rule fire — a band
    // that could only name what the grain already had could not carry a layout
    // anywhere.
    //
    // The section is DERIVED rather than named, so this keeps asking the
    // question after a release changes which grain ships what.
    const present = new Set(
      sectionsForEntry({ grain: "weekly" })
        .filter((s) => s.fence === "shared")
        .map((s) => s.id)
    );
    const absent = ENTRY_SECTIONS.find(
      (s) => s.fence === "shared" && !present.has(s.id)
    );
    expect(absent).toBeTruthy();
    const id = absent?.id ?? "";
    expect(sharedBand(composeEntryTemplate("weekly", [], [id]), "weekly")).toEqual([
      id,
    ]);
  });

  it("writes no line at all for an id the catalogue does not know", () => {
    // Reachable from a data.json written by a release whose catalogue had a
    // section this one does not — a saved band names ids, and an id can outlive
    // the section it named.
    //
    // The guard is `byId.get` missing, not the directive filter above it: an
    // unknown id never becomes a section object at all. Mutating either line
    // fails this, which is how the two were told apart.
    const out = composeEntryTemplate("daily", [], ["log", "not-a-section"]);
    expect(out).not.toContain("null");
    expect(sharedBand(out)).toEqual(["log"]);
  });

  it("cannot move the structural band", () => {
    // `links` is pinned and `entry-header` is therefore alone among its band's
    // movable members, so every permutation of that band is the identity. A
    // band naming them decides nothing about where they go.
    const out = composeEntryTemplate("daily", [], ["entry-header", "log", "links"]);
    expect(out.indexOf("links:home")).toBeLessThan(out.indexOf("entry-header"));
    expect(sharedBand(out)).toEqual(["log"]);
  });

  it("ignores a section named twice", () => {
    // Two of one section is one region shared by two widgets, which
    // `addableEntrySections` refuses to create for the same reason.
    expect(sharedBand(composeEntryTemplate("daily", [], ["log", "log"]))).toEqual([
      "log",
    ]);
  });

  it("still applies an answer stored beside it", () => {
    // The two keys cooperate rather than compete: membership and order come
    // from the band, and the reader's answers keep coming from
    // `entrySections`. A band that dropped the options would reset every bridge
    // the moment a reader saved a default.
    const text = composeEntryTemplate(
      "daily",
      [{ id: "bridge", options: { target: "lesson" } }],
      ["bridge", "log"]
    );
    expect(text).toContain("bridge-notes:lesson");
    expect(sharedBand(text)).toEqual(["bridge", "log"]);
  });

  it("is kept in step when the settings table ticks a section on", () => {
    // THE ONE WAY THE TWO STORES COULD DISAGREE. A band is authoritative, so a
    // grain that has one would ignore a tick in Settings → Diary entries —
    // changing a setting and nothing else, which is the "built and unreachable"
    // shape that table was added to fix, arriving by the other door.
    expect(bandWithSection(["log", "todo"], "capture", true)).toEqual([
      "log",
      "todo",
      "capture",
    ]);
  });

  it("takes a section out of the band when the table unticks it", () => {
    expect(bandWithSection(["log", "capture", "todo"], "capture", false)).toEqual([
      "log",
      "todo",
    ]);
  });

  it("does not move a section that is already in the band", () => {
    // Re-answering a section's question is not a reorder. `write` re-runs on
    // every dropdown change, so a rule that appended unconditionally would walk
    // a bridge to the bottom of the band one answer at a time.
    expect(bandWithSection(["log", "capture", "todo"], "capture", true)).toEqual([
      "log",
      "todo",
      "capture",
    ]);
  });

  it("creates no band for a grain that has none", () => {
    // Most vaults. The catalogue's own order is still the answer there, and a
    // checkbox must not be what freezes a template.
    expect(bandWithSection(undefined, "capture", true)).toBeUndefined();
  });

  it("is the settings table's only spelling of that rule", () => {
    // Scoped to the write, not searched across the file: `entrySections` is
    // named a dozen times in that module and a bare match would pass on any of
    // them.
    const src = readCode("settings");
    const at = src.indexOf("const write = async (next: SectionChoice | null)");
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, src.indexOf("\n    };", at));
    expect(body).toContain("s.entrySections[grain] = list;");
    // BOTH THE CALL AND THE ASSIGNMENT. A pin on the call alone passed against
    // a version that computed the new band and threw it away — which is the
    // whole defect, spelled as a missing `=`.
    expect(body).toContain("bandWithSection(");
    expect(body).toContain("s.entrySectionBand[grain] = band;");
  });

  it("does not change the regions or their order", () => {
    // The regions are emitted from the same list. If an order rearranged the
    // directives and not the regions the two would stop lining up, which is a
    // note whose widgets read each other's text.
    const text = composeEntryTemplate("daily", [], ["capture", "todo"]);
    const regions = [...text.matchAll(/<!--chronoanvil:([a-z-]+)/g)].map((m) => m[1]);
    expect(regions).toEqual(sharedBand(text));
  });
});

describe("what a reload would destroy", () => {
  it("finds nothing in a page it composed itself", () => {
    // THE ROUND TRIP THE WHOLE FEATURE STANDS ON. If a freshly created entry
    // does not read as empty, the reload can never be offered to anyone.
    for (const grain of TRACKER_CLASSES) {
      const text = composeEntryTemplate(grain);
      expect(entryReloadLoss(text, text, ctxFor(grain)), grain).toEqual([]);
    }
  });

  it("finds nothing in a real entry created from the template", () => {
    // The file on disk is the template with a date filled in, so the thing the
    // reader actually opens has to pass too.
    const tpl = composeEntryTemplate("daily");
    const entry = fillDailyTemplate(tpl, "2026-08-15");
    expect(entry).not.toBe(tpl);
    expect(entryReloadLoss(entry, tpl, ctxFor("daily"))).toEqual([]);
  });

  it("reports a region with writing in it, by the section's name", () => {
    const tpl = composeEntryTemplate("daily");
    const written = writeNoteRegion(tpl, "log", "a thing that happened");
    const loss = entryReloadLoss(written, tpl, ctxFor("daily"));
    expect(loss).toHaveLength(1);
    expect(loss[0].kind).toBe("region");
    expect(loss[0].label).toBe(
      ENTRY_SECTIONS.find((s) => s.id === "log")?.label
    );
  });

  it("reports a tracker this entry gained on its own", () => {
    // THE LOSS NOBODY PREDICTS. "+ Add tracker" writes into the body between
    // the markers while the property sits in frontmatter, so a recompose
    // reseeds the block and orphans the property. A regions-are-empty test
    // misses this entirely.
    const tpl = composeEntryTemplate("daily");
    const withOne = tpl.replace(
      "tracker:Mood\nsleep",
      "tracker:Mood\ntracker:Steps\nsleep"
    );
    expect(withOne).not.toBe(tpl);
    const loss = entryReloadLoss(withOne, tpl, ctxFor("daily"));
    expect(loss.map((l) => l.kind)).toEqual(["tracker"]);
    expect(loss[0].label).toBe("tracker:Steps");
  });

  it("does not mistake the frontmatter's tracker block for the body's", () => {
    // Both carry `# chronoanvil:trackers:start`, and the frontmatter one holds
    // property names rather than directives. Reading the first pair in the file
    // would report every entry's `Mood:` line as a lost tracker.
    const tpl = composeEntryTemplate("daily");
    expect(tpl.indexOf("# chronoanvil:trackers:start")).toBeLessThan(
      tpl.indexOf("`chronoanvil:spacer`")
    );
    expect(entryReloadLoss(tpl, tpl, ctxFor("daily"))).toEqual([]);
  });

  it("reports a directive the catalogue did not write", () => {
    const tpl = composeEntryTemplate("daily");
    const hacked = tpl.replace("tasks:todo|Tasks", "tasks:todo|Tasks\ncalendar:month");
    const loss = entryReloadLoss(hacked, tpl, ctxFor("daily"));
    expect(loss.map((l) => l.kind)).toEqual(["foreign"]);
    expect(loss[0].label).toBe("calendar:month");
  });

  it("reports prose written outside every section", () => {
    const tpl = composeEntryTemplate("daily");
    const withProse = tpl.replace(
      "<!--chronoanvil:focus",
      "I wrote this here by hand.\n\n<!--chronoanvil:focus"
    );
    const loss = entryReloadLoss(withProse, tpl, ctxFor("daily"));
    expect(loss.map((l) => l.kind)).toEqual(["prose"]);
    expect(loss[0].label).toBe("I wrote this here by hand.");
  });

  it("does not call the composer's own furniture prose", () => {
    // The rule and the spacer are loose body lines too. They are recognised by
    // being in the replacement rather than by a list written into the loss
    // walk, which is what stops this going wrong the next time the composer
    // emits something new.
    const tpl = composeEntryTemplate("daily");
    expect(tpl).toContain("`chronoanvil:spacer`");
    expect(tpl.split("\n").filter((l) => l.trim() === "---")).toHaveLength(3);
    expect(entryReloadLoss(tpl, tpl, ctxFor("daily"))).toEqual([]);
  });

  it("does not call a section the layout drops a loss, when it is empty", () => {
    // THE NEGATIVE THAT MAKES THE FEATURE USABLE. Taking an empty section out
    // is the gesture; reporting it as damage would refuse every reload that
    // changed anything.
    const page = composeEntryTemplate("daily");
    const without = composeEntryTemplate("daily", [], ["capture"]);
    expect(entryReloadLoss(page, without, ctxFor("daily"))).toEqual([]);
  });
});

describe("reading a page back as a want", () => {
  it("keeps the page's own order rather than the catalogue's", () => {
    const text = composeEntryTemplate("daily", [], ["capture", "todo"]);
    const { want } = wantFromEntry(text, ctxFor("daily"));
    expect(want.slice(0, 2).map((w) => w.id)).toEqual(["capture", "todo"]);
  });

  it("carries an answer the reader gave, read off the directive", () => {
    // Saving a default that reset a bridge to unconfigured would be a silent
    // loss at the exact moment the reader asked to keep something.
    const text = composeEntryTemplate("daily", [
      { id: "bridge", options: { target: "lesson" } },
    ]);
    expect(text).toContain("bridge-notes:lesson");
    const { want } = wantFromEntry(text, ctxFor("daily"));
    const bridge = want.find((w) => w.id === "bridge");
    expect(bridge?.options).toEqual({ target: "lesson" });
  });

  it("stores nothing for a question the page has not answered", () => {
    // `bridge-notes:` with nothing after the colon is unconfigured, and
    // `directiveFor` reads a blank target as exactly that. Storing "" would
    // make "chose nothing" indistinguishable from "chose the empty string".
    const text = composeEntryTemplate("daily", ["bridge"]);
    const { want } = wantFromEntry(text, ctxFor("daily"));
    expect(want.find((w) => w.id === "bridge")?.options).toBeUndefined();
  });

  it("reads a section written twice as one want", () => {
    // A hand-edited fence can carry two `note:log` lines, and they share one
    // region — which is why `addableEntrySections` refuses to create the state
    // in the first place. Reading it back as two wants would compose a template
    // with the same defect baked in, and this time by the plugin's own hand.
    const text = composeEntryTemplate("daily").replace(
      "note:log:Notes, reflections & learnings…|Notes, reflections & learnings",
      "note:log:Notes, reflections & learnings…|Notes, reflections & learnings\nnote:log:Again|Notes"
    );
    const { want } = wantFromEntry(text, ctxFor("daily"));
    expect(want.filter((w) => w.id === "log")).toHaveLength(1);
  });

  it("reports a hand-written directive rather than swallowing it", () => {
    const text = composeEntryTemplate("daily").replace(
      "tasks:todo|Tasks",
      "tasks:todo|Tasks\ncalendar:month"
    );
    const { want, drops } = wantFromEntry(text, ctxFor("daily"));
    expect(drops).toEqual(["calendar:month"]);
    expect(want.map((w) => w.id)).not.toContain("calendar:month");
  });

  it("round-trips a page through a want and back to the same band", () => {
    // The property that makes "save this page as the default" mean what it
    // says: composing the want the page gave has to reproduce the page's band.
    for (const grain of TRACKER_CLASSES) {
      const text = composeEntryTemplate(grain);
      const { want } = wantFromEntry(text, ctxFor(grain));
      const again = composeEntryTemplate(
        grain,
        want,
        want.map((w) => w.id)
      );
      expect(sharedBand(again, grain), grain).toEqual(sharedBand(text, grain));
    }
  });
});

describe("writing a template back over a page", () => {
  it("keeps the page's frontmatter byte-for-byte and replaces the body", () => {
    // The events stamp cannot be recovered by anything — entries are never
    // re-synced against the events list — and `journal-date` is what scopes the
    // entry to its period. Recomposing the frontmatter would destroy both.
    const tpl = composeEntryTemplate("daily");
    const page = fillDailyTemplate(tpl, "2026-08-15")
      .replace('journal: Daily Notes', 'journal: Daily Notes\ntitle: A good day\nchronoanvil-events:\n  - birthday-sam');
    const next = reloadEntryBody(page, composeEntryTemplate("daily", [], ["capture"]));
    expect(next).not.toBeNull();
    const head = (t: string): string => t.slice(0, t.indexOf("\n---\n", 4) + 5);
    expect(head(next as string)).toBe(head(page));
    expect(next).toContain("title: A good day");
    expect(next).toContain("birthday-sam");
    expect(next).toContain('journal-date: "2026-08-15"');
    // …and the body really is the replacement's.
    expect(sharedBand(next as string)[0]).toBe("capture");
  });

  it("replaces the whole file when there is no frontmatter to keep", () => {
    // The malformed case rather than a supported one — an entry always has
    // properties. Stated because the alternative reading of `frontmatterEnd`'s
    // -1 is "keep everything", which would append a second body.
    const tpl = composeEntryTemplate("daily");
    const next = reloadEntryBody("just some text\n", tpl);
    expect(next).toBe(tpl.split("\n").slice(tpl.split("\n").indexOf("---", 1) + 1).join("\n"));
    expect(next).not.toContain("just some text");
  });

  it("does not read a thematic break in the body as frontmatter", () => {
    // `---` in the middle of a note is a rule the reader typed. Treating one as
    // a frontmatter close would keep half the body and replace the rest — the
    // exact failure `withoutFrontmatter` has guarded against since 4.2, which
    // is why 4.29 shares its expression rather than writing a second one.
    const page = "no properties here\n\n---\n\nand more\n";
    expect(reloadEntryBody(page, "---\na: 1\n---\nBODY\n")).toBe("BODY\n");
  });

  it("is null when the write would change nothing", () => {
    // A rewrite that changes nothing still bumps mtime, and on the diary side
    // mtime is what decides whether an entry is stale.
    const tpl = composeEntryTemplate("weekly");
    expect(reloadEntryBody(tpl, tpl)).toBeNull();
  });
});

// A plugin holding nothing but the two settings keys the manager writes, plus
// the empty journal list `bridgeCatalogue` walks. Everything else it touches is
// a vault call these cases never reach.
const stubPlugin = (): {
  plugin: ConstructorParameters<typeof EntryTemplates>[1];
  settings: ChronoAnvilSettings;
} => {
  const settings = {
    ...DEFAULT_SETTINGS,
    entrySections: {},
    entrySectionBand: {},
    entryLayouts: [],
    customJournals: [],
  } as ChronoAnvilSettings;
  const plugin = {
    settings,
    saveSettings: async (): Promise<void> => {},
  } as unknown as ConstructorParameters<typeof EntryTemplates>[1];
  return { plugin, settings };
};

describe("saved layouts", () => {
  it("start empty and are a list, not a map", () => {
    expect(DEFAULT_SETTINGS.entryLayouts).toEqual([]);
    expect(DEFAULT_SETTINGS.entrySectionBand).toEqual({});
  });

  it("suffixes a repeated name rather than refusing it", async () => {
    // The same repair `saveVariant` makes, and for its reason: a reader naming
    // two layouts "Mondays" wants two layouts, not an error.
    const { plugin, settings } = stubPlugin();
    const mgr = new EntryTemplates(new App(), plugin);
    await mgr.saveLayout("Quiet Monday", [{ id: "log" }], ["daily"]);
    await mgr.saveLayout("Quiet Monday", [{ id: "log" }], ["daily"]);
    expect(settings.entryLayouts.map((l) => l.id)).toEqual([
      "quiet-monday",
      "quiet-monday-2",
    ]);
    expect(settings.entryLayouts.every((l) => l.label === "Quiet Monday")).toBe(true);
  });

  it("stores no options object for sections that answered nothing", () => {
    // A wall of empty objects in data.json makes a layout that differs by one
    // answer look like it differs by everything — `saveVariant`'s reasoning.
    const { plugin, settings } = stubPlugin();
    const mgr = new EntryTemplates(new App(), plugin);
    return mgr.saveLayout("Plain", [{ id: "log" }, { id: "todo" }], ["daily"]).then(() => {
      expect(settings.entryLayouts[0].options).toBeUndefined();
    });
  });

  it("deletes the one it was asked for and keeps the rest", async () => {
    const { plugin, settings } = stubPlugin();
    const mgr = new EntryTemplates(new App(), plugin);
    await mgr.saveLayout("First", [{ id: "log" }], ["daily"]);
    await mgr.saveLayout("Second", [{ id: "todo" }], ["daily"]);
    await mgr.deleteLayout("first");
    expect(settings.entryLayouts.map((l) => l.label)).toEqual(["Second"]);
  });

  it("is offered only on the grains it was saved for", async () => {
    const { plugin } = stubPlugin();
    const mgr = new EntryTemplates(new App(), plugin);
    await mgr.saveLayout("Weeks only", [{ id: "log" }], ["weekly"]);
    expect(mgr.layoutsFor("weekly")).toHaveLength(1);
    expect(mgr.layoutsFor("daily")).toHaveLength(0);
  });

  it("reports a section the grain cannot carry rather than writing it", async () => {
    // `layout-transfer.ts`'s rule on this side of the plugin: composing already
    // drops what it cannot render, and silence is right for a template built
    // where it belongs and wrong for a layout carried somewhere new.
    const { plugin, settings } = stubPlugin();
    const mgr = new EntryTemplates(new App(), plugin);
    await mgr.saveLayout("Odd", [{ id: "log" }, { id: "not-a-section" }], ["daily"]);
    const out = mgr.composedFrom("daily", settings.entryLayouts[0]);
    expect(out.drops).toEqual(["not-a-section"]);
    // …and the composed text is the rest of it, with no "null" line where the
    // missing section would have gone.
    expect(out.text).not.toContain("null");
    expect(sharedBand(out.text)).toEqual(["log"]);
  });
});

// An app whose vault holds one note. Enough for `reload`'s refusal path, which
// reads the file and returns before it reaches the confirmation window.
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

describe("the reload refuses rather than trusting the window", () => {
  it("declines a page that holds writing, and writes nothing", async () => {
    // THE GATE, ASKED OF THE WRITE ITSELF. The window draws no control over a
    // page like this, and the two are separated by however long the reader
    // leaves the window open — a capture arriving in the meantime is exactly
    // the kind of thing 4.27 exists over.
    //
    // ASKED BEHAVIOURALLY, and the first version of this was a source pin that
    // could not do the job: it compared `indexOf` positions, and turning the
    // guard into `if (false)` left every position where it was. This one runs
    // the method.
    const tpl = composeEntryTemplate("daily");
    const page = writeNoteRegion(tpl, "log", "something I wrote");
    const { app, written } = appWith("D/Day-2026-08-15.md", page);
    const { plugin } = stubPlugin();
    const mgr = new EntryTemplates(app, plugin);
    const ok = await mgr.reload("daily", "D/Day-2026-08-15.md", tpl, "Daily default");
    expect(ok).toBe(false);
    expect(written()).toBeNull();
  });

  it("declines when the page already matches, and writes nothing", async () => {
    // A rewrite that changes nothing still bumps mtime, and mtime is what the
    // diary side treats as the source of truth for staleness.
    const tpl = composeEntryTemplate("daily");
    const { app, written } = appWith("D/Day-2026-08-15.md", tpl);
    const { plugin } = stubPlugin();
    const mgr = new EntryTemplates(app, plugin);
    expect(await mgr.reload("daily", "D/Day-2026-08-15.md", tpl, "Daily default")).toBe(
      false
    );
    expect(written()).toBeNull();
  });
});

describe("saving a page as the grain's default", () => {
  const withScaffold = (): {
    plugin: ConstructorParameters<typeof EntryTemplates>[1];
    settings: ChronoAnvilSettings;
    refreshed: () => number;
  } => {
    const { plugin, settings } = stubPlugin();
    let refreshed = 0;
    (plugin as unknown as { scaffold: { refreshTemplates: () => Promise<void> } }).scaffold =
      {
        refreshTemplates: async (): Promise<void> => {
          refreshed += 1;
        },
      };
    return { plugin, settings, refreshed: () => refreshed };
  };

  it("writes both keys, and rewrites the template file", async () => {
    // BOTH, ALWAYS. Membership goes to `entrySections` and the band to
    // `entrySectionBand`; a save that wrote one and not the other would leave
    // the two describing different templates, and the drift survey would offer
    // to undo half of what the reader had just asked for.
    //
    // And the FILE has to be rewritten or the save changes nothing a reader can
    // see — the entry openers read the template file, not the setting.
    const page = composeEntryTemplate("daily", [], ["capture", "log"]);
    const { app } = appWith("D/Day-2026-08-15.md", page);
    const { plugin, settings, refreshed } = withScaffold();
    await new EntryTemplates(app, plugin).saveDefault("daily", "D/Day-2026-08-15.md");
    expect(settings.entrySectionBand.daily).toEqual(["capture", "log"]);
    expect(settings.entrySections.daily?.map((c) => c.id)).toEqual([
      "capture",
      "log",
    ]);
    expect(refreshed()).toBe(1);
  });

  it("carries the reader's answer into the stored choice", async () => {
    const page = composeEntryTemplate(
      "daily",
      [{ id: "bridge", options: { target: "lesson" } }],
      ["bridge", "log"]
    );
    const { app } = appWith("D/Day-2026-08-15.md", page);
    const { plugin, settings } = withScaffold();
    await new EntryTemplates(app, plugin).saveDefault("daily", "D/Day-2026-08-15.md");
    expect(settings.entrySections.daily?.find((c) => c.id === "bridge")?.options).toEqual(
      { target: "lesson" }
    );
  });

  it("round-trips: the saved default composes the page it was saved from", async () => {
    // THE PROPERTY THE GESTURE PROMISES. "Every new entry will be built from
    // this page's sections, in this page's order" is a claim the composer has
    // to be able to honour from what was stored.
    const page = composeEntryTemplate("daily", [], ["capture", "todo", "log"]);
    const { app } = appWith("D/Day-2026-08-15.md", page);
    const { plugin } = withScaffold();
    const mgr = new EntryTemplates(app, plugin);
    await mgr.saveDefault("daily", "D/Day-2026-08-15.md");
    expect(sharedBand(mgr.composedFor("daily"))).toEqual(sharedBand(page));
  });

  it("stores nothing and rewrites nothing for a page with no sections", async () => {
    const { app } = appWith("D/Day-2026-08-15.md", "---\nx: 1\n---\n\nnothing here\n");
    const { plugin, settings: after, refreshed } = withScaffold();
    await new EntryTemplates(app, plugin).saveDefault("daily", "D/Day-2026-08-15.md");
    expect(after.entrySectionBand.daily).toBeUndefined();
    expect(refreshed()).toBe(0);
  });
});

describe("the decisions are not re-spelled in the renderer", () => {
  it("asks the pure module rather than testing regions itself", () => {
    // The suite has no DOM, so anything the window works out for itself is
    // untestable — and a wrong answer there looks like a deliberate blank.
    const modal = readCode("entry-template-modal");
    expect(modal).toContain("entryReloadLoss(");
    expect(modal).not.toContain("allNoteRegions(");
  });

  it("draws no reload control at all over a page that has been written in", () => {
    // "Nothing dead is drawn" — a greyed Reload is a control that cannot do its
    // job, and the block naming what is in the way takes its place instead. The
    // early return is the whole of that rule, so it is what gets pinned.
    const src = readCode("entry-template-modal");
    const at = src.indexOf("private drawLayouts(");
    expect(at).toBeGreaterThan(-1);
    const body = src.slice(at, src.indexOf("\n  }", at));
    const gate = body.indexOf("if (loss.length)");
    const bail = body.indexOf("return;", gate);
    const rows = body.indexOf("drawReloadRow(");
    expect(gate).toBeGreaterThan(-1);
    expect(bail).toBeGreaterThan(gate);
    expect(rows).toBeGreaterThan(bail);
  });

  it("offers Template on the entry banner, beside Edit sections", () => {
    const menu = readSrc("entryheader");
    expect(menu).toContain('setTitle("Template…")');
    expect(menu.indexOf('setTitle("Edit sections…")')).toBeLessThan(
      menu.indexOf('setTitle("Template…")')
    );
  });

  it("passes an arrangement sink on the entry branch of the editor", () => {
    // The second door onto saving a layout, and the seam has been agnostic and
    // single-caller since 3.0.
    //
    // THREE CLAIMS, NOT ONE. A pin on `arrangement:` alone is nearly
    // content-free — it passes on a sink wired to the wrong grain list, or to a
    // second copy of the save. What matters is that the targets are the five
    // grains and that the write is the SAME function the Template window calls,
    // because two spellings of "store this layout" is how they come to disagree
    // about the shape in data.json.
    const src = readCode("section-insert");
    const at = src.indexOf("arrangement: {");
    expect(at).toBeGreaterThan(-1);
    const sink = src.slice(at, src.indexOf("\n            },", at));
    expect(sink).toContain("TRACKER_CLASSES.map(");
    expect(sink).toContain("this.plugin.entryTemplates.saveLayout(");
  });
});
