// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// A PRESET BRINGS ITS OWN MEASUREMENTS. 4.35 §1 and §2.
//
// A preset could not ship one before this release. `JournalKindConfig.rating`
// is an id into the global registry and nothing more, so naming an id the vault
// does not define renders *"Unknown tracker: X"* on every note — Study is safe
// only because `confidence` and `accuracy` are built-ins scoped to every
// journal. A fitness journal that cannot ship Distance is a folder tree.
//
// Most of this file is about the two ways that can go silently wrong: an id
// that is re-derived at install and orphans a layout key, and a surface
// attached from the preset rather than from the config the reader saved.

import { describe, expect, it } from "vitest";
import {
  buildJournalType,
  journalTemplateFiles,
  presetAsNewJournal,
  presetTrackerDefs,
  slugify,
} from "../src/journals/custom-journal";
import {
  EXERCISE_PRESET,
  JOURNAL_PRESETS,
  MEDIA_PRESET,
  PROJECTS_PRESET,
} from "../src/journals/journal";
import { DEFAULT_TRACKERS } from "../src/core/constants";
import {
  isJournalSurface,
  surfaceAcceptsType,
  trackersToSeed,
} from "../src/trackers/trackers";
import type { TrackerDef } from "../src/trackers/trackers";
import {
  defaultSectionIds,
  sectionsFor,
  templateTargets,
} from "../src/journals/journal-sections";
import { readSrc, repoFile } from "./sources";

const PATHS = {
  journalsRoot: "03 - Journals",
  templates: "00 - Infrastructure/Templates",
};

describe("a preset's ids survive the install", () => {
  // THE ORPHANED-LAYOUT-KEY HAZARD, AND THE ONLY THING STANDING BETWEEN IT AND
  // SILENCE. `commit` calls `normaliseKinds(..., { preserveIds: isEstablished })`
  // and `isEstablished` is `mode !== "create"` — so on an INSTALL the id becomes
  // `slugify(label)` and a level id `slugify(noun)`. A preset naming a kind
  // `log` and labelling it "Update" would have its id change at commit, and
  // every `layout["kind:<id>"]` key would then address a template that does not
  // exist. Nothing on the way through would say so.
  for (const preset of JOURNAL_PRESETS) {
    it(`${preset.name}: every kind id is slugify(label)`, () => {
      for (const kind of preset.config.kinds) {
        expect(kind.id, `${preset.id} kind "${kind.label}"`).toBe(
          slugify(kind.label)
        );
      }
    });

    it(`${preset.name}: every level id is slugify(noun)`, () => {
      for (const level of preset.config.levels) {
        expect(level.id, `${preset.id} level "${level.noun}"`).toBe(
          slugify(level.noun)
        );
      }
    });

    it(`${preset.name}: every id its layout addresses is a real template`, () => {
      // A `kind:` or `index:` key naming nothing is dropped in silence, which
      // is the same failure the two above prevent, seen from the other end.
      const keys = new Set(
        templateTargets(buildJournalType(preset.config)).map((t) => t.key)
      );
      for (const key of Object.keys(preset.config.layout ?? {})) {
        expect(keys, `${preset.id} layout key "${key}"`).toContain(key);
      }
    });

    it(`${preset.name}: every id in its \`sections\` is a real catalogue id`, () => {
      // A typo is otherwise dropped silently by `composeTemplate`'s Set — the
      // section simply does not appear, and the template looks merely short.
      const type = buildJournalType(preset.config);
      for (const target of templateTargets(type)) {
        const named = preset.config.layout?.[target.key]?.sections;
        if (!named) continue;
        const real = new Set(sectionsFor(target.ctx).map((s) => s.id));
        for (const id of named) {
          expect(real, `${preset.id} ${target.key} section "${id}"`).toContain(
            id
          );
        }
      }
    });
  }
});

describe("the trackers three presets ship", () => {
  const shipped = JOURNAL_PRESETS.flatMap((p) =>
    (p.trackers ?? []).map((t) => ({ preset: p.id, tracker: t }))
  );

  it("no two presets ship a tracker id in common", () => {
    // Two presets defining one id would mean whichever was installed second
    // silently kept the first's definition — `trackersToSeed` never overwrites
    // — so a Media journal could end up rating Stars out of a scale Exercise
    // chose.
    const seen = new Map<string, string>();
    for (const { preset, tracker } of shipped) {
      expect(seen.get(tracker.id), `${tracker.id} also in ${seen.get(tracker.id)}`).toBeUndefined();
      seen.set(tracker.id, preset);
    }
  });

  it("none collides with a built-in tracker id", () => {
    // WHAT CATCHES `Energy` AND `Focus`. Both are shipped scales a vault
    // already defines, and an Exercise journal reaching for either name would
    // be silently handed the diary's — surface, faces and all.
    const builtin = new Set(DEFAULT_TRACKERS.map((t) => t.id));
    for (const { preset, tracker } of shipped) {
      expect(builtin.has(tracker.id), `${preset}: ${tracker.id}`).toBe(false);
    }
  });

  it("every kind's rating is a tracker something defines", () => {
    // The failure this whole section exists to prevent: a rating naming an id
    // the vault does not define renders "Unknown tracker: X" on every note.
    const builtin = new Set(DEFAULT_TRACKERS.map((t) => t.id));
    for (const preset of JOURNAL_PRESETS) {
      const own = new Set((preset.trackers ?? []).map((t) => t.id));
      for (const kind of preset.config.kinds) {
        if (!kind.rating) continue;
        expect(
          builtin.has(kind.rating) || own.has(kind.rating),
          `${preset.id}: ${kind.label} rated on "${kind.rating}"`
        ).toBe(true);
      }
    }
  });

  it("every tracker a template seeds is one something defines", () => {
    const builtin = new Set(DEFAULT_TRACKERS.map((t) => t.id));
    for (const preset of JOURNAL_PRESETS) {
      const own = new Set((preset.trackers ?? []).map((t) => t.id));
      for (const layout of Object.values(preset.config.layout ?? {})) {
        for (const id of layout.options?.trackers?.trackers ?? []) {
          expect(
            builtin.has(id) || own.has(id),
            `${preset.id} seeds "${id}"`
          ).toBe(true);
        }
      }
    }
  });

  it("only sum-reduced numbers claim a place in the totals band", () => {
    // A total of Intensity readings is a number with no meaning — five workouts
    // at 4/5 do not make 20 of anything — which is why `reduce` defaults to
    // mean and why the default is the silent one.
    for (const { preset, tracker } of shipped) {
      if (tracker.reduce !== "sum") continue;
      expect(tracker.type, `${preset}: ${tracker.id}`).toBe("number");
    }
    const intensity = EXERCISE_PRESET.trackers?.find(
      (t) => t.id === "intensity"
    );
    expect(intensity?.reduce).toBeUndefined();
  });
});

describe("presetTrackerDefs", () => {
  it("scopes to the SAVED config's id, not the preset's", () => {
    // `applyNameChange` re-slugs a new journal's id from its name, so a preset
    // renamed on the Identity step would otherwise seed trackers scoped to a
    // journal that never exists — and every chart on it would refuse with
    // "Stars is a media tracker; this note is in Watchlist."
    const saved = { ...presetAsNewJournal(MEDIA_PRESET, PATHS), id: "watchlist" };
    for (const def of presetTrackerDefs(MEDIA_PRESET, saved)) {
      expect(isJournalSurface(def.surface)).toBe(true);
      expect(surfaceAcceptsType(def.surface, "watchlist")).toBe(true);
      expect(surfaceAcceptsType(def.surface, "media")).toBe(false);
    }
  });

  it("forces the two diary-only flags false", () => {
    // `normalizeTrackers` would do this anyway on a journal surface; stating it
    // here is what makes them un-askable rather than merely overwritten.
    for (const def of presetTrackerDefs(EXERCISE_PRESET, EXERCISE_PRESET.config)) {
      expect(def.showInTemplate).toBe(false);
      expect(def.showInBase).toBe(false);
    }
  });

  it("deep-copies, so a reader's edit cannot reach the shipped literal", () => {
    // 4.33 PAID FOR THIS LESSON ONCE ALREADY. `preset.trackers` IS the
    // module-level literal, so anything shared by reference is shared with the
    // plugin's default for the life of the process.
    const before = JSON.stringify(EXERCISE_PRESET.trackers);
    const defs = presetTrackerDefs(EXERCISE_PRESET, EXERCISE_PRESET.config);
    const scale = defs.find((d) => d.id === "intensity")!;
    scale.faces![0] = "MUTATED";
    scale.label = "MUTATED";
    scale.max = 99;
    expect(JSON.stringify(EXERCISE_PRESET.trackers)).toBe(before);
  });

  it("returns nothing for a preset that ships none", () => {
    // Projects is the preset that measures nothing, deliberately.
    expect(presetTrackerDefs(PROJECTS_PRESET, PROJECTS_PRESET.config)).toEqual(
      []
    );
  });
});

describe("trackersToSeed", () => {
  const def = (id: string, label = id): TrackerDef =>
    ({
      id,
      label,
      type: "number",
      surface: { kind: "journal", typeId: "x" },
      showInTemplate: false,
      showInBase: false,
    }) as TrackerDef;

  it("never overwrites an id the vault already defines", () => {
    // The rule an import has applied since 3.18: a vault that has made
    // `Distance` a date keeps its own, and the band that wanted a number simply
    // omits it. Silence is correct — the reader asked to install a journal, not
    // a tracker.
    const existing = [def("distance", "mine")];
    expect(trackersToSeed(existing, [def("distance", "theirs")])).toEqual([]);
  });

  it("preserves the order it was given", () => {
    const out = trackersToSeed([], [def("a"), def("b"), def("c")]);
    expect(out.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("de-dupes a repeated incoming id", () => {
    const out = trackersToSeed([], [def("a"), def("a"), def("b")]);
    expect(out.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("pushes nothing itself", () => {
    const existing: TrackerDef[] = [];
    trackersToSeed(existing, [def("a")]);
    expect(existing).toEqual([]);
  });

  it("is the rule BOTH seeding paths call, and neither holds twice", () => {
    // THE PROOF THE TWO REALLY ARE SHARED RATHER THAN MERELY ALIKE. Two paths
    // that seed the registry from outside it must not each carry the rule, or
    // the day one is corrected the other keeps the bug.
    expect(readSrc("journals")).toContain("trackersToSeed(");
    expect(readSrc("core")).toContain("trackersToSeed(");
    // And the loop it replaced is gone rather than left beside the call.
    expect(readSrc("journals")).not.toContain("knownTrackerIds");
  });
});

describe("a template only seeds trackers its own note type may carry", () => {
  it("drops another type's rating from a seed list", () => {
    // `kindAllowsTracker` is the rule, reused rather than restated: a tracker
    // that is SOME note type's rating belongs to the types it grades and to
    // nobody else. So a Meal template asking for Intensity — Workout's rating —
    // gets Status and its own two, and not a grid cell for a number a meal has
    // no way to have.
    const cfg = structuredClone(EXERCISE_PRESET.config);
    cfg.layout!["kind:meal"] = {
      options: { trackers: { trackers: ["intensity", "calories"] } },
    };
    const type = buildJournalType(cfg);
    const meal = journalTemplateFiles(type).find((f) => f.name === "meal.md")!;
    expect(meal.content).toContain("tracker:calories");
    expect(meal.content).not.toContain("tracker:intensity");
  });

  it("does not seed a second copy of the rating it already carries", () => {
    const cfg = structuredClone(EXERCISE_PRESET.config);
    cfg.layout!["kind:workout"] = {
      options: { trackers: { trackers: ["intensity", "duration"] } },
    };
    const type = buildJournalType(cfg);
    const out = journalTemplateFiles(type).find((f) => f.name === "workout.md")!;
    expect(out.content.match(/tracker:intensity/g)?.length).toBe(1);
  });

  it("writes no frontmatter for a seeded quantity", () => {
    // A rating is written as `1` because that is what a Recall sitting grades
    // and what the review queue reads. `Distance: 1` would be a kilometre
    // nobody ran — the widget is there to be filled in, and the property
    // arrives when it has a value.
    const type = buildJournalType(EXERCISE_PRESET.config);
    const out = journalTemplateFiles(type).find((f) => f.name === "workout.md")!;
    const fm = out.content.slice(0, out.content.indexOf("---", 3));
    expect(fm).toContain("intensity: 1");
    expect(fm).not.toContain("duration:");
    expect(fm).not.toContain("distance:");
    // And the grid does carry them, which is the half that makes it usable.
    expect(out.content).toContain("tracker:duration");
    expect(out.content).toContain("tracker:distance");
  });
});

describe("the two new sections are off by default", () => {
  // The catalogue holds a JournalType and no plugin, so it cannot see whether a
  // vault has a tracker worth summing — which is `bridge`'s own argument. A
  // section that defaulted on would write a band into every journal in every
  // vault and draw nothing in almost all of them.
  for (const preset of JOURNAL_PRESETS) {
    it(`${preset.name}: no surface defaults to totals or tally`, () => {
      const type = buildJournalType(preset.config);
      for (const target of templateTargets(type)) {
        const ids = defaultSectionIds(target.ctx);
        expect(ids, `${preset.id} ${target.key}`).not.toContain("totals");
        expect(ids, `${preset.id} ${target.key}`).not.toContain("tally");
      }
    });
  }

  it("and they are offered on index surfaces, so a reader can add them", () => {
    // Off by default is not the same as absent: *Edit sections…* must list
    // them, which is the only way an existing journal gains one.
    const type = buildJournalType(EXERCISE_PRESET.config);
    const index = templateTargets(type).find((t) => t.key === "index:0")!;
    const offered = sectionsFor(index.ctx).map((s) => s.id);
    expect(offered).toContain("totals");
    expect(offered).toContain("tally");
  });
});

describe("the presets menu (4.35.1)", () => {
  it("gives each row one glyph, and it is the one that differs", () => {
    // The sparkles was on every row beside the emoji, so a reader scanning the
    // menu got one identical mark and one distinguishing one. The emoji is what
    // the journal wears everywhere else, so it is the one that stays.
    // THE ONE FILE, not `readSrc("core")`'s concatenation — the two anchors
    // below are only in order within settings.ts, and across a joined directory
    // the slice can come back empty and assert nothing.
    const src = repoFile("src/core/settings.ts");
    const menu = src.slice(
      src.indexOf("const offered = JOURNAL_PRESETS.filter"),
      src.indexOf("menu.showAtMouseEvent")
    );
    expect(menu.length).toBeGreaterThan(100);
    expect(menu).toContain("`${preset.emoji}  ${preset.name}`");
    expect(menu).not.toContain('setIcon("sparkles")');
  });

  it("still offers every preset the vault does not already have", () => {
    // The filter this menu is built from, unchanged — dropping an icon must not
    // touch which rows appear.
    const src = repoFile("src/core/settings.ts");
    expect(src).toContain("JOURNAL_PRESETS.filter((p) => !taken().has(p.id))");
  });
});
