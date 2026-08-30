// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// THE WIZARD DISCARDED A PRESET'S ARRANGEMENT, AT THE ONE MOMENT IT IS USED.
// 4.35 §0.
//
// `syncChoices` seeded the section rail from `defaultSectionIds(t.ctx)` — with
// no layout — and `commit` then wrote `order: [...ids]` over `draft.layout[key]`.
// Both `defaultSectionIds(ctx, layout?)` and `sectionsFor(ctx, layout?)` had
// taken a layout all along; the wizard had never passed one. So installing
// Study through the Presets button produced a Topic Index in CATALOGUE order
// rather than in Study's own, and the arrangement a preset exists to ship was
// replaced on the way in.
//
// The pin is byte-identity: what the wizard seeds must compose to exactly what
// the preset composes with no wizard at all. One assertion, the whole claim.

import { describe, expect, it } from "vitest";
import { JournalEditModal } from "../src/core/settings-editors";
import {
  buildJournalType,
  journalTemplateFiles,
  presetAsNewJournal,
} from "../src/journals/custom-journal";
import type { JournalConfig } from "../src/journals/custom-journal";
import { JOURNAL_PRESETS } from "../src/journals/journal";
import {
  chosenSectionIds,
  defaultSectionIds,
  sectionsFor,
  templateTargets,
} from "../src/journals/journal-sections";
import type ChronoAnvilPlugin from "../src/main";

const PATHS = {
  journalsRoot: "03 - Journals",
  templates: "00 - Infrastructure/Templates",
};

const fakePlugin = (): ChronoAnvilPlugin =>
  ({
    settings: { customJournals: [], paths: PATHS, trackers: [] },
    app: { vault: { getAbstractFileByPath: () => null } },
  }) as unknown as ChronoAnvilPlugin;

// Reaches the two private members this claim is about: the seed the rail opens
// with, and the layout `commit` writes back.
class Probe extends JournalEditModal {
  seed(): Map<string, string[]> {
    const type = buildJournalType(this["draft"]);
    this["syncChoices"](templateTargets(type));
    return this["chosen"] as Map<string, string[]>;
  }
  tick(key: string, ids: string[]): void {
    (this["chosen"] as Map<string, string[]>).set(key, ids);
  }
  // `commit` writes templates and saves; this is the layout half of it, which
  // is the half the claim is about.
  writeLayout(): void {
    for (const [key, ids] of this["chosen"] as Map<string, string[]>) {
      const draft = this["draft"] as JournalConfig;
      const prev = draft.layout?.[key];
      draft.layout = {
        ...(draft.layout ?? {}),
        [key]: {
          ...(prev ?? {}),
          order: [...ids],
          ...(prev?.sections ? { sections: [...ids] } : {}),
        },
      };
    }
  }
  layout(): NonNullable<JournalConfig["layout"]> {
    return (this["draft"] as JournalConfig).layout ?? {};
  }
  draftConfig(): JournalConfig {
    return this["draft"] as JournalConfig;
  }
  chosenIds(): Map<string, string[]> {
    return this["chosen"] as Map<string, string[]>;
  }
}

const wizard = (draft: JournalConfig): Probe => {
  const plugin = fakePlugin();
  return new Probe(
    (plugin as unknown as { app: never }).app,
    plugin,
    draft,
    "create",
    -1,
    async () => {}
  );
};

describe("installing a preset through the wizard", () => {
  // THE ONE THAT FAILED BEFORE §0. Study's `index:1` is the case: its layout
  // arranges the Topic Index and the seed threw that arrangement away.
  // THROUGH `commit`'s LAYOUT WRITE, NOT JUST THE SEED — and that distinction
  // is the whole test.
  //
  // `composeTemplate` drops the chosen ids into a SET and then walks
  // `sectionsFor(ctx, layout)`, so the ids say WHICH sections and the layout
  // says in what order. Comparing the seed alone therefore cannot see this bug
  // at all for a layout that ships `order`: catalogue-ordered ids and
  // design-ordered ids are the same set, and compose to the same bytes.
  //
  // The loss lands one step later. `commit` writes `order: [...ids]` over
  // `draft.layout[key]`, so a seed in catalogue order OVERWRITES the
  // arrangement — and every template composed from the saved journal after
  // that, by refresh or repair or the section editor, reads the flattened
  // order. That is what "installing Study produces a Topic Index in catalogue
  // order" actually means, and it is only visible after the round trip.
  for (const preset of JOURNAL_PRESETS) {
    it(`composes ${preset.name} byte-identically after a wizard round trip`, () => {
      const p = wizard(presetAsNewJournal(preset, PATHS));
      p.seed();
      p.writeLayout();

      // The journal as the wizard saved it, against the preset untouched.
      const saved = buildJournalType(p.draftConfig());
      const direct = buildJournalType(presetAsNewJournal(preset, PATHS));

      const viaWizard = journalTemplateFiles(saved, p.chosenIds());
      const asDesigned = journalTemplateFiles(direct);

      expect(viaWizard.map((f) => f.name)).toEqual(asDesigned.map((f) => f.name));
      for (let i = 0; i < asDesigned.length; i++) {
        expect(viaWizard[i].content).toBe(asDesigned[i].content);
      }
    });
  }

  it("seeds a preset's `sections` list exactly, and not the catalogue's", () => {
    // The field a preset turns a section ON with. `defaultSectionIds` filters
    // on `required || default(ctx)` REGARDLESS of layout, so `order` alone can
    // only rearrange what is already on.
    const draft = presetAsNewJournal(JOURNAL_PRESETS[0], PATHS);
    const type = buildJournalType(draft);
    const target = templateTargets(type)[0];
    const all = sectionsFor(target.ctx).map((s) => s.id);
    const off = all.find(
      (id) => !defaultSectionIds(target.ctx).includes(id)
    );
    expect(off).toBeDefined();

    const want = [...defaultSectionIds(target.ctx), off!];
    draft.layout = { ...(draft.layout ?? {}), [target.key]: { sections: want } };
    expect(wizard(draft).seed().get(target.key)).toEqual(want);
  });

  it("writes both `order` and `sections` where the preset shipped `sections`", () => {
    // A layout that ships `sections` is authoritative for every later reader,
    // so leaving the preset's list beside the reader's order would have
    // `refreshJournalTemplates` offer back the section they just unticked.
    const draft = presetAsNewJournal(JOURNAL_PRESETS[0], PATHS);
    const type = buildJournalType(draft);
    const target = templateTargets(type)[0];
    draft.layout = {
      ...(draft.layout ?? {}),
      [target.key]: { sections: defaultSectionIds(target.ctx) },
    };

    const p = wizard(draft);
    p.seed();
    const kept = defaultSectionIds(target.ctx).slice(0, 1);
    p.tick(target.key, kept);
    p.writeLayout();

    expect(p.layout()[target.key].order).toEqual(kept);
    expect(p.layout()[target.key].sections).toEqual(kept);
  });

  it("never grows a `sections` on a preset that shipped only `order`", () => {
    // The weaker, better field: a journal created today still gains a section
    // the catalogue adds tomorrow.
    const draft = presetAsNewJournal(JOURNAL_PRESETS[0], PATHS);
    const type = buildJournalType(draft);
    const target = templateTargets(type)[0];
    draft.layout = {
      ...(draft.layout ?? {}),
      [target.key]: { order: defaultSectionIds(target.ctx) },
    };

    const p = wizard(draft);
    p.seed();
    p.writeLayout();

    expect(p.layout()[target.key].order).toBeDefined();
    expect(p.layout()[target.key].sections).toBeUndefined();
  });
});

describe("chosenSectionIds", () => {
  it("prefers a layout's `sections` outright", () => {
    const type = buildJournalType(presetAsNewJournal(JOURNAL_PRESETS[0], PATHS));
    const ctx = templateTargets(type)[0].ctx;
    expect(chosenSectionIds(ctx, { sections: ["banner"] })).toEqual(["banner"]);
  });

  it("falls back to the catalogue's defaults, ordered by the layout", () => {
    const type = buildJournalType(presetAsNewJournal(JOURNAL_PRESETS[0], PATHS));
    const ctx = templateTargets(type)[0].ctx;
    const layout = { order: [...defaultSectionIds(ctx)].reverse() };
    expect(chosenSectionIds(ctx, layout)).toEqual(defaultSectionIds(ctx, layout));
  });

  it("copies rather than aliasing the layout's own array", () => {
    // The seed is mutated in place by every tick of a checkbox.
    const sections = ["banner"];
    const type = buildJournalType(presetAsNewJournal(JOURNAL_PRESETS[0], PATHS));
    const ctx = templateTargets(type)[0].ctx;
    chosenSectionIds(ctx, { sections }).push("resources");
    expect(sections).toEqual(["banner"]);
  });
});
