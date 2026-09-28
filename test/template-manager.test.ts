// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Template window as a MANAGER (1.0.46) — the pure half.
//
// WHAT THIS RELEASE ADDED, AND WHY EACH PIECE IS PINNED HERE RATHER THAN IN THE
// WINDOW. The two Template windows decide nothing: the suite has no DOM, so a
// judgement made in a renderer is a judgement no test can reach. So the four
// new verbs — what ChronoAnvil ships, use as default, rename, remove — are
// manager methods over pure decisions, and this file is what makes them mean
// something.
//
// TWO OF THEM CLOSE DEFECTS THAT SHIPPED:
//
//   • A SHARED TEMPLATE WAS DELETED OUTRIGHT by the Template window's Remove.
//     The settings rail had guarded this since 3.18 — *"removing “Two column”
//     from Practice would silently take it off Lesson too, from a row that never
//     mentioned Lesson"* — and the window, added in 4.33, was three lines with
//     no such guard. `planTemplateRemoval` is now the one decision.
//
//   • THE SHIPPED ARRANGEMENT WAS UNRECOVERABLE. "Save this note as the
//     default" writes `cfg.layout[key]` and the refresh rewrites the template
//     file; nothing kept what the plugin came with. The 🔒 row is the fix, and
//     `shippedLayoutOf` is what it reads.

import { describe, expect, it } from "vitest";
import { App } from "obsidian";

import {
  JOURNAL_PRESETS,
  STUDY_CONFIG,
  STUDY_PRESET,
  buildJournalType,
} from "../src/journals/journal";
import { presetConfig } from "../src/journals/custom-journal";
import type { JournalConfig } from "../src/journals/custom-journal";
import {
  planTemplateRemoval,
  sectionContext,
  templateKeyFor,
  templateTargetsOf,
} from "../src/journals/journal-sections";
import type { SectionContext } from "../src/journals/journal-sections";
import { shippedLayoutOf } from "../src/journals/page-default";
import { JournalTemplates } from "../src/journals/journal-template-manager";
import { EntryTemplates } from "../src/diary/entry-template-manager";
import { composeEntryTemplate } from "../src/diary/entry-sections";
import { TRACKER_CLASSES } from "../src/trackers/trackers";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import type { ChronoAnvilSettings } from "../src/core/settings";

// ── what the plugin ships ────────────────────────────────────────────────

describe("the arrangement ChronoAnvil ships is still reachable", () => {
  it("is the preset's own layout for a journal installed from one", () => {
    // A PRESET JOURNAL KEEPS THE PRESET'S ID, which is what makes the lookup
    // possible at all: `presetConfig` does not re-slug, because `type: lesson`
    // in a reader's notes is matched through the journal that declares it.
    const cfg = presetConfig(STUDY_PRESET, {
      root: STUDY_CONFIG.root,
      templatesFolder: STUDY_CONFIG.templatesFolder,
    });
    expect(cfg.id).toBe(STUDY_PRESET.id);

    for (const key of Object.keys(STUDY_CONFIG.layout ?? {})) {
      expect(shippedLayoutOf(JOURNAL_PRESETS, cfg.id, key)).toEqual(
        STUDY_CONFIG.layout?.[key]
      );
    }
  });

  it("is undefined — the catalogue's own — for a journal the reader defined", () => {
    // `undefined` is exactly how `composeTemplate` spells "no override", so the
    // honest answer needs no special case downstream. A journal STARTED from a
    // preset is re-slugged and so is not a preset; it lands here, which is what
    // it is rather than a near-miss.
    expect(shippedLayoutOf(JOURNAL_PRESETS, "study-2", "kind:lesson")).toBeUndefined();
    expect(shippedLayoutOf(JOURNAL_PRESETS, "book-club", "index:0")).toBeUndefined();
  });

  it("is not the same bytes as today's default once the reader has saved over it", () => {
    // THE WHOLE POINT OF THE 🔒 ROW. If `shippedFor` read the stored config it
    // would return whatever was last saved, and the row would be a second copy
    // of ⭐ that claims to undo something.
    const { plugin, cfg } = journalStub();
    const app = new App();
    const mgr = new JournalTemplates(app, plugin);
    const ctx = lessonCtx(cfg);
    const key = templateKeyFor(ctx);

    const shipped = mgr.shippedFor(ctx);
    expect(mgr.composedFor(ctx)).toBe(shipped);

    // A reader saves a one-section arrangement over it. The context is rebuilt,
    // because `ctx.type` is BUILT from the config and so already carries it.
    cfg.layout = { ...(cfg.layout ?? {}), [key]: { sections: ["banner"] } };
    const after = new JournalTemplates(app, buildPlugin(cfg));
    const rebuilt = lessonCtx(cfg);
    expect(after.composedFor(rebuilt)).not.toBe(shipped);
    expect(after.shippedFor(rebuilt)).toBe(shipped);
  });

  it("names which shipped arrangement it is, or says nothing", () => {
    const { plugin, cfg } = journalStub();
    const mgr = new JournalTemplates(new App(), plugin);
    expect(mgr.shippedNameFor(lessonCtx(cfg))).toBe(STUDY_PRESET.name);

    const own: JournalConfig = { ...cfg, id: "book-club" };
    const mine = new JournalTemplates(new App(), buildPlugin(own));
    expect(mine.shippedNameFor(lessonCtx(own))).toBeNull();
  });

  it("on the diary side is the stored override removed, literally", () => {
    // `DEFAULT_SETTINGS` ships `entrySections: {}` and `entrySectionBand: {}`,
    // and `entrySectionBand`'s own comment pins that an absent grain "composes
    // byte-for-byte what it composed before this key existed". So `[]`/`[]` IS
    // the shipped arrangement, and any other spelling would be a second answer.
    const { plugin } = entryStub();
    const mgr = new EntryTemplates(new App(), plugin);
    for (const grain of TRACKER_CLASSES) {
      expect(mgr.shippedFor(grain)).toBe(composeEntryTemplate(grain, [], []));
      // And it is what a fresh vault already composes.
      expect(mgr.shippedFor(grain)).toBe(mgr.composedFor(grain));
    }
  });
});

// ── use as default ───────────────────────────────────────────────────────

describe("a template becomes the default", () => {
  it("keeps `order` when the target already had one", async () => {
    // `TemplateLayout`'s own comment calls this distinction load-bearing:
    // `order` says WHERE the catalogue's sections go and lets the catalogue keep
    // deciding WHICH there are; `sections` says which as well. A
    // `{sections, options}` write over a key that had `order` freezes that
    // target's membership for good, so both doors that write a default merge.
    const cfg = withLayout({ order: ["banner", "trackers"], sections: ["banner"] });
    const plugin = buildPlugin(cfg);
    const mgr = new JournalTemplates(new App(), plugin);
    const ctx = lessonCtx(cfg);

    await mgr.useAsDefault(ctx, {
      id: "two-column",
      label: "Two column",
      sections: ["banner", "prose"],
    });

    const next = cfg.layout![templateKeyFor(ctx)];
    expect(next.order).toEqual(["banner", "prose"]);
    expect(next.sections).toEqual(["banner", "prose"]);
  });

  it("does not invent an `order` on a target that had none", async () => {
    const cfg = withLayout({ sections: ["banner"] });
    const mgr = new JournalTemplates(new App(), buildPlugin(cfg));
    const ctx = lessonCtx(cfg);

    await mgr.useAsDefault(ctx, {
      id: "two-column",
      label: "Two column",
      sections: ["banner", "prose"],
    });
    expect(cfg.layout![templateKeyFor(ctx)].order).toBeUndefined();
  });

  it("DELETES the stored key for the shipped row rather than writing it back", async () => {
    // Writing today's composition back would freeze this version's catalogue
    // into the config, so a section added by a later release would never reach
    // a journal somebody had once pressed "put it back" on — the exact fault
    // `order` exists to avoid. The key's absence is what "shipped" means.
    const cfg = withLayout({ sections: ["banner"] });
    const mgr = new JournalTemplates(new App(), buildPlugin(cfg));
    const ctx = lessonCtx(cfg);

    await mgr.useAsDefault(ctx, null);
    expect(cfg.layout?.[templateKeyFor(ctx)]).toBeUndefined();
  });

  it("writes both diary keys together, and deletes both for the shipped row", async () => {
    // Membership goes to `entrySections` and order to `entrySectionBand`; one
    // without the other leaves the two describing different templates, and the
    // drift survey then offers to undo half of what the reader just asked for.
    const { plugin, settings } = entryStub();
    const mgr = new EntryTemplates(new App(), plugin);

    await mgr.useAsDefault("daily", {
      id: "quiet",
      label: "Quiet Monday",
      sections: ["log", "todo"],
      grains: ["daily"],
    });
    expect(settings.entrySections.daily?.map((w) => w.id)).toEqual(["log", "todo"]);
    expect(settings.entrySectionBand.daily).toEqual(["log", "todo"]);

    await mgr.useAsDefault("daily", null);
    expect(settings.entrySections.daily).toBeUndefined();
    expect(settings.entrySectionBand.daily).toBeUndefined();
    expect(mgr.composedFor("daily")).toBe(mgr.shippedFor("daily"));
  });
});

// ── rename ───────────────────────────────────────────────────────────────

describe("renaming a template", () => {
  it("changes the label and never the id", async () => {
    // THE ID IS HALF A FILENAME. `templateTargets` allocates
    // `<kind>-<variant>.md` per saved template, so re-slugging on a rename
    // would orphan the file the reader has open and write a second one beside
    // it.
    const cfg = withVariants([
      { id: "two-column", label: "Two column", sections: ["banner"], kinds: ["lesson"] },
    ]);
    const mgr = new JournalTemplates(new App(), buildPlugin(cfg));
    expect(await mgr.renameLayout(lessonCtx(cfg), "two-column", "Wide")).toBe(true);
    expect(cfg.variants![0]).toMatchObject({ id: "two-column", label: "Wide" });
  });

  it("declines a blank name and a name that did not change", async () => {
    const cfg = withVariants([
      { id: "two-column", label: "Two column", sections: ["banner"], kinds: ["lesson"] },
    ]);
    const mgr = new JournalTemplates(new App(), buildPlugin(cfg));
    const ctx = lessonCtx(cfg);
    expect(await mgr.renameLayout(ctx, "two-column", "   ")).toBe(false);
    expect(await mgr.renameLayout(ctx, "two-column", "Two column")).toBe(false);
    expect(cfg.variants![0].label).toBe("Two column");
  });

  it("does the same on the diary side", async () => {
    const { plugin, settings } = entryStub();
    const mgr = new EntryTemplates(new App(), plugin);
    await mgr.saveLayout("Quiet", [{ id: "log" }], ["daily"]);
    const id = settings.entryLayouts[0].id;
    expect(await mgr.renameLayout(id, "Loud")).toBe(true);
    expect(settings.entryLayouts[0]).toMatchObject({ id, label: "Loud" });
  });
});

// ── removing a shared template ───────────────────────────────────────────

describe("removing a template takes it off ONE target", () => {
  const cfg = (): JournalConfig =>
    withVariants([
      {
        id: "two-column",
        label: "Two column",
        sections: ["banner"],
        kinds: ["lesson", "practice"],
      },
    ]);

  it("plans a withdrawal while another target still holds it", () => {
    const c = cfg();
    const plan = planTemplateRemoval(c, c.variants![0], "practice");
    expect(plan).toEqual({
      kind: "withdraw",
      kinds: ["lesson"],
      surfaces: [],
      others: ["lesson"],
    });
  });

  it("plans a removal only for the last holder", () => {
    const c = withVariants([
      { id: "two-column", label: "Two column", sections: [], kinds: ["lesson"] },
    ]);
    expect(planTemplateRemoval(c, c.variants![0], "lesson")).toEqual({
      kind: "remove",
    });
  });

  it("counts SURFACES as holders, which the kind list alone cannot", () => {
    // THE HOLE THE SHARED DECISION CLOSED IN THE SETTINGS RAIL TOO. It computed
    // the others from `variantKinds`, which knows nothing about `surfaces`, so a
    // template offered on one kind AND the front page was deleted outright when
    // that kind's row removed it — taking the front page's offering with it.
    const c = withVariants([
      {
        id: "two-column",
        label: "Two column",
        sections: [],
        kinds: ["lesson"],
        surfaces: ["index"],
      },
    ]);
    const plan = planTemplateRemoval(c, c.variants![0], "lesson");
    expect(plan.kind).toBe("withdraw");
    expect(plan).toMatchObject({ kinds: [], surfaces: ["index"] });
  });

  it("reads an absent `kinds` as every kind, exactly as `variantKinds` does", () => {
    // Asked through `templateTargetsOf` rather than off `variant.kinds`, so the
    // removal agrees with the create dropdown and the template-file allocator.
    const c = withVariants([{ id: "v", label: "V", sections: [] }]);
    expect(templateTargetsOf(c, c.variants![0])).toEqual(
      c.kinds.map((k) => k.id)
    );
    const plan = planTemplateRemoval(c, c.variants![0], c.kinds[0].id);
    expect(plan.kind).toBe("withdraw");
  });

  it("writes `kinds` explicitly on a withdrawal, even when it empties", async () => {
    // Absent means every kind, so a shared template that shed its last kind and
    // kept saying nothing would come straight back on all of them.
    const c = withVariants([
      {
        id: "v",
        label: "V",
        sections: [],
        kinds: ["lesson"],
        surfaces: ["index"],
      },
    ]);
    const mgr = new JournalTemplates(new App(), buildPlugin(c));
    const plan = await mgr.deleteLayout(lessonCtx(c), "v");
    expect(plan?.kind).toBe("withdraw");
    expect(c.variants![0].kinds).toEqual([]);
    expect(c.variants![0].surfaces).toEqual(["index"]);
  });

  it("withdraws rather than deleting, through the manager", async () => {
    const c = cfg();
    const mgr = new JournalTemplates(new App(), buildPlugin(c));
    const plan = await mgr.deleteLayout(practiceCtx(c), "two-column");
    expect(plan).toMatchObject({ kind: "withdraw", others: ["lesson"] });
    expect(c.variants).toHaveLength(1);
    expect(c.variants![0].kinds).toEqual(["lesson"]);
  });

  it("deletes when this was the last holder, and drops the empty list", async () => {
    const c = withVariants([
      { id: "two-column", label: "Two column", sections: [], kinds: ["lesson"] },
    ]);
    const mgr = new JournalTemplates(new App(), buildPlugin(c));
    expect(await mgr.deleteLayout(lessonCtx(c), "two-column")).toEqual({
      kind: "remove",
    });
    expect(c.variants).toBeUndefined();
  });

  it("does the same on the diary side, against `grains`", async () => {
    const { plugin, settings } = entryStub();
    const mgr = new EntryTemplates(new App(), plugin);
    await mgr.saveLayout("Quiet", [{ id: "log" }], ["daily", "weekly"]);
    const id = settings.entryLayouts[0].id;

    expect(await mgr.deleteLayout(id, "weekly")).toEqual({
      removed: false,
      others: ["daily"],
    });
    expect(settings.entryLayouts).toHaveLength(1);
    expect(settings.entryLayouts[0].grains).toEqual(["daily"]);

    expect(await mgr.deleteLayout(id, "daily")).toEqual({
      removed: true,
      others: [],
    });
    expect(settings.entryLayouts).toEqual([]);
  });
});

// ── the stubs ────────────────────────────────────────────────────────────

// A plugin whose settings hold one journal and whose scaffold does nothing.
//
// THE SCAFFOLD IS A NO-OP RATHER THAN ABSENT, because every default write goes
// through `refreshJournalTemplates` — that is this manager's header rule, the
// reader sees the template FILE and not the config — so a stub without one
// would be testing a code path the plugin does not take.
const buildPlugin = (
  cfg: JournalConfig
): ConstructorParameters<typeof JournalTemplates>[1] =>
  ({
    settings: { ...DEFAULT_SETTINGS, customJournals: [cfg] } as ChronoAnvilSettings,
    saveSettings: async (): Promise<void> => {},
    scaffold: { refreshJournalTemplates: async (): Promise<void> => {} },
  }) as unknown as ConstructorParameters<typeof JournalTemplates>[1];

const journalStub = (): {
  plugin: ConstructorParameters<typeof JournalTemplates>[1];
  cfg: JournalConfig;
} => {
  const cfg = presetConfig(STUDY_PRESET, {
    root: STUDY_CONFIG.root,
    templatesFolder: STUDY_CONFIG.templatesFolder,
  });
  return { plugin: buildPlugin(cfg), cfg };
};

const withLayout = (layout: Record<string, unknown>): JournalConfig => {
  const { cfg } = journalStub();
  cfg.layout = { ...(cfg.layout ?? {}), "kind:lesson": layout };
  return cfg;
};

const withVariants = (
  variants: JournalConfig["variants"]
): JournalConfig => {
  const { cfg } = journalStub();
  cfg.variants = variants;
  return cfg;
};

const kindCtx = (cfg: JournalConfig, id: string): SectionContext => {
  const type = buildJournalType(cfg);
  const kind = type.kinds.find((k) => k.id === id);
  if (!kind) throw new Error(`no kind ${id} — the stub is wrong, not the code`);
  return sectionContext(type, { kind });
};
const lessonCtx = (cfg: JournalConfig): SectionContext => kindCtx(cfg, "lesson");
const practiceCtx = (cfg: JournalConfig): SectionContext =>
  kindCtx(cfg, "practice");

const entryStub = (): {
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
  return {
    plugin: {
      settings,
      saveSettings: async (): Promise<void> => {},
      scaffold: { refreshTemplates: async (): Promise<void> => {} },
    } as unknown as ConstructorParameters<typeof EntryTemplates>[1],
    settings,
  };
};
