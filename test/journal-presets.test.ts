// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Study stops being built in. 3.20 — §3 of the 3.18 follow-ups.
//
// THE RISK IS DECLASSIFICATION AND NOTHING ELSE COMES CLOSE. A vault's Study
// notes are matched through the journal that declares `lesson`, `practice`,
// `subject` and `topic`, and through a `root` the reader may have moved years
// ago. A migration that rebuilt either from the shipped literal would leave
// every one of those notes belonging to no journal — no tables, no banner, no
// review queue — and would do it silently, on load, to a vault that was working
// a minute earlier. Most of this file is about that one sentence.
//
// The rest is the claim that made it worth doing: a preset is an ORDINARY
// journal. Not "resembles one" — the same object, through the same constructor,
// carrying no field a reader's own journal could not carry.

import { describe, expect, it } from "vitest";
import { composeJournalDashboardNote } from "../src/journals/journal-dashboard-sections";
import {
  presetAsNewJournal,
  presetConfig,
} from "../src/journals/custom-journal";
import type {
  JournalConfig,
  JournalPreset,
} from "../src/journals/custom-journal";
import {
  JOURNAL_PRESETS,
  STUDY_CONFIG,
  STUDY_PRESET,
  buildJournalType,
  registeredJournalTypes,
} from "../src/journals/journal";
import { journalTemplateFiles } from "../src/journals/custom-journal";
import { sectionsFor, templateTargets } from "../src/journals/journal-sections";
import { STUDY_COMPOSED } from "../src/core/scaffold";
import { readCode } from "./sources";
import { studyTemplate } from "./study-template";

describe("a preset is an ordinary journal", () => {
  it("composes the templates the built-in composed", () => {
    // THE EQUIVALENCE CLAIM, REPOINTED. It used to assert that
    // `buildJournalType(STUDY_CONFIG)` equalled `STUDY_JOURNAL` — trivially
    // true, because the second was defined as the first. As a preset it becomes
    // a claim about two different objects: what a reader installs composes the
    // template files Study has always shipped, byte for byte.
    const installed = buildJournalType(
      presetConfig(STUDY_PRESET, {
        root: STUDY_CONFIG.root,
        templatesFolder: STUDY_CONFIG.templatesFolder,
      })
    );
    const from = journalTemplateFiles(installed);
    for (const name of ["topic-index.md", "subject-index.md", "lesson.md"]) {
      const composed = from.find((f) => f.name === name);
      expect(composed, name).toBeTruthy();
      expect(composed!.content, name).toBe(studyTemplate(name));
    }
    // AND THE WHOLE SET, NOT JUST THE THREE NAMED ABOVE. `STUDY_COMPOSED`'s
    // comment in scaffold.ts calls it "the SHAPE Study composes to, which is
    // what the equivalence suite checks a preset against" — and until 5.2 no
    // suite checked it against anything: the constant was exported, derived on
    // every module load, and read by nothing. Three literal filenames cannot
    // notice a fourth template appearing on one side and not the other, which
    // is the drift the constant exists to make impossible. This is the claim
    // its comment already made, finally asserted.
    expect(from.map((f) => f.name).sort()).toEqual([...STUDY_COMPOSED].sort());
  });

  it("carries no field a reader's own journal could not", () => {
    // The property the old equivalence suite policed, and it still holds: a
    // preset is a `JournalConfig`, so anything it expresses is expressible.
    for (const preset of JOURNAL_PRESETS) {
      const mine: JournalConfig = {
        ...preset.config,
        id: "mine",
        name: "Mine",
        root: "J/Mine",
        templatesFolder: "T/Mine",
      };
      const built = buildJournalType(mine);
      expect(built.kinds.map((k) => k.id)).toEqual(
        buildJournalType(preset.config).kinds.map((k) => k.id)
      );
    }
  });

  it("is registered like one, with no branch of its own", () => {
    const plugin = {
      settings: {
        customJournals: [presetConfig(STUDY_PRESET, { root: "N/S" })],
      },
    } as unknown as Parameters<typeof registeredJournalTypes>[0];
    const [study] = registeredJournalTypes(plugin);
    expect(study.id).toBe("study");
    expect(study.root).toBe("N/S");
  });

  it("leaves a vault with no journals when none are installed", () => {
    const plugin = {
      settings: { customJournals: [] },
    } as unknown as Parameters<typeof registeredJournalTypes>[0];
    expect(registeredJournalTypes(plugin)).toEqual([]);
  });

  it("places the trackers section at the top of every preset template where it appears", () => {
    // SECOND, ON EVERY SURFACE, IN EVERY PRESET (5.20). It was second until
    // 5.18 moved what-is-below above it on the six index templates, and it is
    // second again — the reason 5.18 had is gone. An index no longer opens with
    // a block of numbers for the reader to look past; it opens with one tracker
    // card, and the table of what is below sits directly under it.
    //
    // WHAT THE TEST IS ACTUALLY FOR is unchanged across all three arrangements:
    // the ratings a note is graded on are never below the fold, on any surface,
    // in any preset.
    for (const preset of JOURNAL_PRESETS) {
      const type = buildJournalType(preset.config);
      for (const target of templateTargets(type)) {
        const layout = type.layout?.[target.key];
        const sections = sectionsFor(target.ctx, layout);
        const trackerIndex = sections.findIndex((s) => s.id === "trackers");
        if (trackerIndex === -1) continue;
        const where = `${preset.id} ${target.key}`;
        expect(sections[0].id, `${where} banner`).toBe("banner");
        expect(trackerIndex, where).toBe(1);
      }
      // AND NO PRESET DECLARES AN ARRANGEMENT TO CHECK IT AGAINST. This loop
      // used to read the same two placements back off `layout.sections` /
      // `layout.order`; 5.20 deleted every one of those lists, so the honest
      // assertion is that they are gone rather than a loop that silently runs
      // zero times.
      for (const [key, tLayout] of Object.entries(preset.config.layout ?? {})) {
        expect(tLayout.sections, `${preset.id} layout.${key}.sections`).toBeUndefined();
        expect(tLayout.order, `${preset.id} layout.${key}.order`).toBeUndefined();
      }
    }
  });
});

// INSTALLING A PRESET COPIES IT, ALL OF IT (4.33).
//
// `STUDY_PRESET.config` IS `STUDY_CONFIG` — the module-level literal, not a
// copy of it — so any field `presetConfig` shares by reference is shared with
// the shipped default for the life of the process.
//
// This was invisible until 4.33, and the reason is worth keeping: the two
// writers that existed both ASSIGN a fresh array (`cfg.variants = [...]`)
// rather than mutating in place, so they were safe by accident. 4.33 gives a
// reader a way to write `cfg.layout`, and the obvious spelling of that is a
// property write — which through an aliased object edits the plugin's own
// default.
//
// Asserted on `layout` and `variants` specifically because those are the two
// the old hand-copy missed, and on a SECOND INSTALL because that is the state a
// reader reaches without doing anything unusual: install Study, edit it, then
// use Presets or "Start from Study" again.
describe("installing a preset copies it, all of it", () => {
  const installed = (): JournalConfig =>
    presetConfig(STUDY_PRESET, { root: "J/S", templatesFolder: "T/S" });

  it("does not share `layout` with the shipped literal", () => {
    const key = Object.keys(STUDY_CONFIG.layout ?? {})[0];
    expect(key, "Study ships a layout to alias").toBeTruthy();
    const before = JSON.stringify(STUDY_CONFIG.layout);

    const mine = installed();
    // The property write 4.33's "save this page as the default" would make.
    mine.layout![key] = { sections: ["banner"] };
    mine.layout![key].options = { banner: { label: "Mine" } };

    expect(JSON.stringify(STUDY_CONFIG.layout)).toBe(before);
  });

  it("does not share `layout` between two installs", () => {
    const first = installed();
    const second = installed();
    const key = Object.keys(first.layout ?? {})[0];

    first.layout![key] = { sections: ["banner"] };

    expect(second.layout![key]).not.toEqual({ sections: ["banner"] });
  });

  it("does not share a nested `options` object either", () => {
    // The half a one-level-deeper hand-copy would still have missed: `layout`
    // holds `TemplateLayout`, which holds `options`, which holds
    // `SectionOverrides`. This is why the fix is a structured clone rather
    // than a third `.map`.
    const key = Object.keys(STUDY_CONFIG.layout ?? {}).find(
      (k) => STUDY_CONFIG.layout?.[k]?.options
    );
    expect(key, "Study ships nested options to alias").toBeTruthy();
    const before = JSON.stringify(STUDY_CONFIG.layout![key!].options);

    const mine = installed();
    const opts = mine.layout![key!].options!;
    opts[Object.keys(opts)[0]] = { label: "Mine" };

    expect(JSON.stringify(STUDY_CONFIG.layout![key!].options)).toBe(before);
  });

  it("does not share `variants` with the shipped literal", () => {
    // ON A PRESET THAT HAS SOME, and that is not padding: Study ships none, so
    // asserting this against Study would be an assertion that cannot fail —
    // `other.variants ?? []` mints a fresh array when the field is absent, and
    // the test would pass against the aliasing version it exists to catch.
    // (It did. That is how this came to be written this way.)
    const shipped: JournalPreset = {
      id: "withlayouts",
      name: "With layouts",
      emoji: "📐",
      blurb: "A preset that ships a saved layout.",
      config: {
        ...structuredClone(STUDY_CONFIG),
        id: "withlayouts",
        variants: [
          { id: "two-column", label: "Two column", sections: ["banner"] },
        ],
      },
    };

    const mine = presetConfig(shipped);
    mine.variants![0].label = "Mine";
    mine.variants!.push({ id: "x", label: "X" });

    expect(shipped.config.variants).toHaveLength(1);
    expect(shipped.config.variants![0].label).toBe("Two column");
  });

  it("still composes Study's own templates after all of that", () => {
    // The clone must not change WHAT is installed, only who owns it. Same
    // assertion as the equivalence test above, run last so it also catches a
    // preceding case having damaged the literal.
    const from = journalTemplateFiles(
      buildJournalType(
        presetConfig(STUDY_PRESET, {
          root: STUDY_CONFIG.root,
          templatesFolder: STUDY_CONFIG.templatesFolder,
        })
      )
    );
    for (const name of ["topic-index.md", "subject-index.md", "lesson.md"]) {
      expect(from.find((f) => f.name === name)!.content, name).toBe(
        studyTemplate(name)
      );
    }
  });
});

describe("the special cases that are gone", () => {
  it("registration has no toggle branch", () => {
    expect(readCode("journal")).not.toMatch(
      /studyEnabled\s*\n?\s*\?\s*\[studyType/
    );
  });

  it("the settings list has no hardcoded Study row", () => {
    // It ended in a switch where every other row ends in a delete, which is
    // what "just another journal" had been claiming not to be since 2.39.
    expect(readCode("settings")).not.toContain("renderStudyRow");
  });

  it("the journal editor's root check has one list to consult", () => {
    // Study's root needed its own clause because it was invisible to the loop
    // over `customJournals`. One list, one check.
    expect(readCode("settings-editors")).not.toContain(
      "norm(this.plugin.settings.paths.studyRoot) === want"
    );
  });

  it("scaffold writes Study's templates through the generic loop", () => {
    expect(readCode("scaffold")).not.toContain("if (studyOn)");
  });

  it("commands ask whether the journal exists, not whether it is enabled", () => {
    // Generated since 3.21, so the question is asked once for every journal
    // rather than written out for Study — see `journal-actions.ts` and
    // `test/actions.test.ts`. The table holds no journal action at all now.
    expect(readCode("journal-actions")).toContain(
      "(p.settings.customJournals ?? []).some((j) => j.id === typeId)"
    );
    expect(readCode("actions")).not.toContain("studyOn");
  });

});

describe("the presets door", () => {
  const settings = (): string => readCode("settings");

  it("offers each preset that is not already installed", () => {
    // A preset's id is the handle its notes are classified through, so a
    // second copy would be either a rename or a collision.
    expect(settings()).toContain(
      "JOURNAL_PRESETS.filter((p) => !taken().has(p.id))"
    );
  });

  it("opens the editor rather than installing silently", () => {
    // The whole claim of turning Study into a preset is that it is editable
    // before it exists. Installing outright would hand back the un-editable
    // built-in under a new name.
    expect(settings()).toContain("presetAsNewJournal(preset, this.plugin.settings.paths)");
  });

  it("is its own button, not an entry in `Add journal`", () => {
    // "Add journal" starts from what this vault already has; "Presets" starts
    // from what the plugin ships. One menu made the reader's list and the
    // shipped list read as one list, which they are not.
    const src = settings();
    expect(src).toContain('label: "Presets"');
    expect(src).toContain('label: "Add journal"');
    expect(src).not.toMatch(/setTitle\(`Start from \$\{preset\.name\}`\)/);
  });

  it("says so when there is nothing left to offer", () => {
    // Rather than opening an empty menu, or silently doing nothing.
    expect(settings()).toContain("Every preset is already in this vault");
  });
});

describe("starting a journal from an existing one", () => {
  const settings = (): string => readCode("settings");

  it("offers every journal in the vault", () => {
    // GENERALISED FROM "Start from Study" (3.20.1). Study was only ever the
    // first example of a journal whose shape somebody would want again.
    expect(settings()).toContain("setTitle(`Start from ${src.name}`)");
    expect(settings()).toContain("for (const src of journals)");
  });

  it("takes the arrangement and not the identity", () => {
    // The levels and kinds are the part that took work. The id, name and
    // folders are what make it THAT journal rather than this one.
    const src = settings();
    expect(src).toContain("structuredClone(src)");
    expect(src).toMatch(/deriveJournalFolders\(name, this\.plugin\.settings\.paths\)/);
  });

  it("cannot collide with an id already taken", () => {
    expect(settings()).toContain("while (ids.has(id))");
  });

  it("skips the choice when there is nothing to copy", () => {
    expect(settings()).toContain("if (!journals.length) {");
  });
});

describe("a preset's folders follow its name", () => {
  it("derives them rather than taking the shipped literal", () => {
    // The literal carries `Templates/Studies`, a plural predating derived
    // folders — so installing produced a journal called "Study" whose templates
    // lived under "Studies", and the mismatch only resolved if the reader
    // happened to edit the name.
    const cfg = presetAsNewJournal(STUDY_PRESET, {
      journalsRoot: "03 - Journals",
      templates: "00 - Templates",
    });
    expect(cfg.templatesFolder).toBe("00 - Templates/Study");
    expect(cfg.root).toBe("03 - Journals/Study");
    expect(cfg.templatesFolder).not.toContain("Studies");
  });

  it("takes folders it is given, for a caller that has some", () => {
    // `presetConfig` passes them through rather than deriving under them. The
    // Study migration was the caller that needed this — a root already
    // classifying notes must survive verbatim — and while it has gone, the two
    // functions stay distinct because that is the distinction, not the caller.
    const held = presetConfig(STUDY_PRESET, {
      root: "Notes/Learning",
      templatesFolder: "T/Studies",
    });
    expect(held.root).toBe("Notes/Learning");
    expect(held.templatesFolder).toBe("T/Studies");
  });
});

// ── THE ARRANGEMENT THE READER SHIPPED (5.18) ────────────────────────────
//
// The four presets were installed into a vault, rearranged there with the drag
// grips and *Edit sections…*, and the result was read back into their configs.
// This is that result, stated as the block a reader meets in the order they
// meet it, so the arrangement cannot drift without somebody saying so here.
//
// WHAT THE FOUR PAGES AGREE ON IS NOW EVERYTHING (5.20). There is no per-preset
// arrangement left to state: every index in every preset composes banner →
// trackers → what is below, because that is what the catalogue gives every
// journal and no preset overrides it any more. The table below is fifteen
// templates' worth of the same three answers, which is the change.
//
//   THE TRACKER CARD IS SECOND. 5.18 put what-is-below above it on the argument
//   that an index exists to get the reader into the folder and the numbers are
//   second. The numbers were a stats band, a progress band and a charts region
//   then; they are one card now, so the table it displaced is one card down
//   rather than one screen down, and catalogue order stands.
//
//   THE GRID STANDS ALONE, TITLED, ON EVERY SURFACE. It used to weld into a
//   state row with the stats band on a deepest index — the `# chronoanvil:
//   trackers:start` opener three of these cases carried. With the band off by
//   default there is no second cell to weld to, so the group is one grid and it
//   draws its own bar.
//
//   NOTHING CLOSES THE PAGE BUT THE PROSE. Find and Charts used to; both are
//   off, and on a leaf the last thing composed is the skeleton — asserted
//   separately below, because it is markdown and this helper reads fences.
//
// READ OFF THE COMPOSED FILE, not off the layout it was composed from: a
// `sections` list that named the right ids in the right order and composed to
// something else would pass a test written against the config. That the configs
// no longer carry such a list is `journal-presets`' other test, above.
describe("the arrangement the presets ship (5.20)", () => {
  // The line that opens each block, which on a titled fence is its bar and on
  // the state row is the first thing in the group. `row` and `tab` are the
  // grammar of the fence rather than a block, so they are named separately by
  // the group's own test in `journal-rows.test.ts`.
  const blocks = (text: string): string[] => {
    const out: string[] = [];
    let open = false;
    let want = false;
    for (const line of text.split("\n")) {
      if (line.startsWith("```")) {
        open = !open && line.length > 3;
        want = open;
        continue;
      }
      if (!open || !want) continue;
      if (line.trim() === "row") continue;
      out.push(line);
      want = false;
    }
    return out;
  };

  const templateFor = (presetId: string, stem: string): string => {
    const preset = JOURNAL_PRESETS.find((p) => p.id === presetId)!;
    const type = buildJournalType(preset.config);
    const file = journalTemplateFiles(type).find((f) => f.name.includes(stem));
    if (!file) throw new Error(`no ${stem} template in ${presetId}`);
    return file.content;
  };

  // EVERY TEMPLATE ALL FOUR PRESETS WRITE, not just the indexes. The six index
  // cases were the whole table until 5.20, because the leaves had nothing
  // preset-specific to say; now neither do the indexes, and the reason to list
  // all fifteen is that "the same three answers everywhere" is only worth
  // asserting if everywhere is where it is asserted.
  const CASES: [string, string, string[]][] = [
    ["study", "subject-index", ["journal-header", "header:📊 Trackers", "header:🗂️ Topics"]],
    ["study", "topic-index", ["journal-header", "header:📊 Trackers", "header:🗂️ What's below"]],
    ["study", "lesson", ["journal-header", "header:📊 Trackers", "header:📄 Pages"]],
    // A kind with no pages under it has nothing below to table, so its leaf is
    // the banner, the grid and the prose.
    ["study", "practice", ["journal-header", "header:📊 Trackers"]],
    // AND A PAGE IS THE BANNER AND THE PROSE. It is not graded — a per-page
    // rating would count a note's own parts as its peers — so even `trackers`
    // is absent here, and this is the shortest template the plugin writes.
    ["study", "page", ["journal-header"]],
    ["projects", "area-index", ["journal-header", "header:📊 Trackers", "header:🗂️ Projects"]],
    ["projects", "project-index", ["journal-header", "header:📊 Trackers", "header:🗂️ What's below"]],
    ["projects", "update", ["journal-header", "header:📊 Trackers"]],
    ["projects", "decision", ["journal-header", "header:📊 Trackers"]],
    ["exercise-diet", "block-index", ["journal-header", "header:📊 Trackers", "header:🗂️ What's below"]],
    ["exercise-diet", "workout", ["journal-header", "header:📊 Trackers"]],
    ["exercise-diet", "meal", ["journal-header", "header:📊 Trackers"]],
    ["media", "medium-index", ["journal-header", "header:📊 Trackers", "header:🎬 Titles"]],
    ["media", "title", ["journal-header", "header:📊 Trackers", "header:📄 Pages"]],
    ["media", "page", ["journal-header"]],
  ];

  for (const [presetId, stem, expected] of CASES) {
    it(`${presetId}'s ${stem.replace("-", " ")}`, () => {
      expect(blocks(templateFor(presetId, stem))).toEqual(expected);
    });
  }

  it("ends every leaf on the reader's own prose", () => {
    // THE FOURTH DEFAULT, AND THE ONE `blocks` CANNOT SEE — a skeleton is `##`
    // markdown, not a fence, which is the whole reason it survives the plugin
    // being uninstalled. So it is asserted by position instead: on every leaf
    // and every page, the last fence closes before the first heading opens, and
    // nothing composed sits under what the reader wrote.
    for (const preset of JOURNAL_PRESETS) {
      const type = buildJournalType(preset.config);
      for (const f of journalTemplateFiles(type)) {
        const where = `${preset.id}/${f.name}`;
        if (f.name.includes("-index")) {
          expect(f.content, where).not.toMatch(/^## /m);
          continue;
        }
        const firstHeading = f.content.search(/^## /m);
        expect(firstHeading, `${where} has a skeleton`).toBeGreaterThan(-1);
        expect(
          f.content.lastIndexOf("```"),
          `${where} prose is last`
        ).toBeLessThan(firstHeading);
      }
    }
  });

  it("opens every journal's front page on the way in", () => {
    // ONE PAGE FOR ALL FOUR, because a journal folder note is composed from a
    // catalogue rather than from a preset — so this is the arrangement every
    // journal gets, custom ones included. The activity band moved below the
    // stats band in 5.18 for the reason the two indexes moved their children
    // up: the destinations come first.
    for (const preset of JOURNAL_PRESETS) {
      const type = buildJournalType(preset.config);
      expect(blocks(composeJournalDashboardNote(type)), preset.id).toEqual([
        "title",
        "frame: section",
        "frame: section",
        "frame: section",
        "header:🕒 Lately",
      ]);
      const note = composeJournalDashboardNote(type);
      expect(note.indexOf(`level-cards:${type.id}`)).toBeLessThan(
        note.indexOf("stats-band")
      );
      expect(note.indexOf("stats-band")).toBeLessThan(
        note.indexOf(`journals-header:${type.id}`)
      );
    }
  });
});
