// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// 3.18 follow-ups §5, the cross-kind half: a layout stops belonging to one kind.
//
// SEQUENCED FIRST BECAUSE IT IS A STORAGE MOVE WITH NO NEW SEMANTICS, and these
// tests are mostly about that claim being literally true — test/variants.test.ts
// keeps all sixteen of its assertions, unedited, against the new address.
//
// What is genuinely new is small and is here: a layout may name several kinds,
// an unnamed one means all of them, and anything a reader had saved under the
// old address arrives at the new one with its id intact. The cross-JOURNAL half
// is deliberately not attempted — see the note on `JournalConfig.variants` for
// why a layout naming section ids cannot simply travel.

import { describe, expect, it } from "vitest";
import {
  STUDY_CONFIG,
  STUDY_JOURNAL,
  buildJournalType,
  variantKinds,
} from "../src/journals/journal";
import {
  freshCustomJournal,
  journalTemplateFiles,
  normalizeJournalConfigs,
} from "../src/journals/custom-journal";
import type { JournalConfig } from "../src/journals/custom-journal";
import {
  layoutTargetsFor,
  splitLayoutTargets,
  templateTargets,
} from "../src/journals/journal-sections";
import { readCode, readSrc } from "./sources";

// Two kinds, so "shared across kinds" is a thing that can be observed at all.
const twoKinds = (variants?: JournalConfig["variants"]): JournalConfig => ({
  ...freshCustomJournal(new Set()),
  id: "study-notes",
  name: "Study Notes",
  levels: [{ id: "subject", noun: "Subject", fallbackEmoji: "📚" }],
  kinds: [
    { id: "lesson", emoji: "📖", label: "Lesson" },
    { id: "practice", emoji: "🛠️", label: "Practice" },
  ],
  ...(variants ? { variants } : {}),
});

const twoColumn = { id: "two-col", label: "Two column", sections: ["banner", "recall"] };

describe("a layout can reach more than one kind", () => {
  it("is offered on every kind it names", () => {
    // THE ASK, STATED PLAINLY: "my two-column Lesson" reused on Practice.
    const type = buildJournalType(
      twoKinds([{ ...twoColumn, kinds: ["lesson", "practice"] }])
    );
    for (const kind of type.kinds) {
      expect(kind.templates.map((t) => t.id)).toEqual(["default", "two-col"]);
    }
  });

  it("gives each kind its own file, not a shared one", () => {
    // A template file is a real note the reader edits afterwards, so two kinds
    // sharing a layout must not share a FILE — editing Practice's copy would
    // otherwise rewrite Lesson's.
    const type = buildJournalType(
      twoKinds([{ ...twoColumn, kinds: ["lesson", "practice"] }])
    );
    expect(type.kinds[0].templates[1].template).toBe("lesson-two-col.md");
    expect(type.kinds[1].templates[1].template).toBe("practice-two-col.md");
  });

  it("gives each kind its own layout key", () => {
    const type = buildJournalType(
      twoKinds([{ ...twoColumn, kinds: ["lesson", "practice"] }])
    );
    expect(Object.keys(type.layout ?? {})).toContain("kind:lesson:two-col");
    expect(Object.keys(type.layout ?? {})).toContain("kind:practice:two-col");
  });

  it("writes a template per kind that opted in", () => {
    const cfg = twoKinds([{ ...twoColumn, kinds: ["lesson", "practice"] }]);
    const names = journalTemplateFiles(buildJournalType(cfg)).map((f) => f.name);
    expect(names).toContain("lesson-two-col.md");
    expect(names).toContain("practice-two-col.md");
  });

  it("leaves a kind it does not name alone", () => {
    const type = buildJournalType(twoKinds([{ ...twoColumn, kinds: ["lesson"] }]));
    expect(type.kinds[0].templates.map((t) => t.id)).toEqual(["default", "two-col"]);
    expect(type.kinds[1].templates.map((t) => t.id)).toEqual(["default"]);
    expect(Object.keys(type.layout ?? {})).not.toContain("kind:practice:two-col");
  });

  it("reaches every kind when it names none", () => {
    // The default that makes this a move rather than a feature: a layout that
    // says nothing is offered wherever it can be composed.
    const type = buildJournalType(twoKinds([twoColumn]));
    for (const kind of type.kinds) {
      expect(kind.templates.map((t) => t.id)).toContain("two-col");
    }
  });

  it("drops a kind that no longer exists rather than composing for it", () => {
    const cfg = twoKinds([{ ...twoColumn, kinds: ["lesson", "deleted-kind"] }]);
    expect(variantKinds(cfg, cfg.variants![0])).toEqual(["lesson"]);
    const keys = Object.keys(buildJournalType(cfg).layout ?? {});
    expect(keys).toContain("kind:lesson:two-col");
    expect(keys).not.toContain("kind:deleted-kind:two-col");
  });

  it("is reachable from the designer on each kind", () => {
    const type = buildJournalType(
      twoKinds([{ ...twoColumn, kinds: ["lesson", "practice"] }])
    );
    const files = templateTargets(type).map((t) => t.file);
    expect(files).toContain("lesson-two-col.md");
    expect(files).toContain("practice-two-col.md");
  });
});

describe("what a reader already saved", () => {
  // The old address: a layout stored on the kind itself.
  const legacy = (): JournalConfig =>
    ({
      ...twoKinds(),
      kinds: [
        { id: "lesson", emoji: "📖", label: "Lesson", variants: [twoColumn] },
        { id: "practice", emoji: "🛠️", label: "Practice" },
      ],
    }) as JournalConfig;

  it("arrives at the new address on load", () => {
    const [cfg] = normalizeJournalConfigs([legacy()]);
    expect(cfg.variants).toHaveLength(1);
    expect(cfg.variants![0].id).toBe("two-col");
    expect(cfg.variants![0].kinds).toEqual(["lesson"]);
    expect(cfg.kinds[0].variants).toBeUndefined();
  });

  it("keeps its id, because the id names its file", () => {
    // `kind:<kindId>:<variantId>` is the layout key and `${kind.id}-${v.id}` is
    // the FILENAME, so a variant that came back under a different id would
    // orphan the template it had already written and compose a second beside it.
    const [cfg] = normalizeJournalConfigs([legacy()]);
    const type = buildJournalType(cfg);
    expect(type.kinds[0].templates[1].template).toBe("lesson-two-col.md");
    expect(Object.keys(type.layout ?? {})).toContain("kind:lesson:two-col");
  });

  it("lands on exactly the config a reader would write today", () => {
    // The migration's whole job, stated as an equivalence rather than as a diff
    // against the old build: a lifted legacy config and a hand-written new-shape
    // one compose the same type. Comparing against `buildJournalType(legacy())`
    // would prove nothing — that path no longer reads kind-level variants, so
    // it is the unmigrated result rather than the old one.
    const lifted = buildJournalType(normalizeJournalConfigs([legacy()])[0]);
    const native = buildJournalType(
      twoKinds([{ ...twoColumn, kinds: ["lesson"] }])
    );
    expect(lifted.kinds.map((k) => k.templates)).toEqual(
      native.kinds.map((k) => k.templates)
    );
    expect(lifted.layout).toEqual(native.layout);
  });

  it("keeps both when two kinds saved the same name", () => {
    // Ids were unique within a KIND and are now unique within the JOURNAL, so
    // the lift is the one moment a collision can appear. Suffixed rather than
    // merged — `saveVariant`'s own rule: a reader with two layouts wants two.
    const clash = {
      ...twoKinds(),
      kinds: [
        { id: "lesson", emoji: "📖", label: "Lesson", variants: [twoColumn] },
        { id: "practice", emoji: "🛠️", label: "Practice", variants: [twoColumn] },
      ],
    } as JournalConfig;
    const [cfg] = normalizeJournalConfigs([clash]);
    expect(cfg.variants!.map((v) => v.id)).toEqual(["two-col", "two-col-2"]);
    expect(cfg.variants!.map((v) => v.kinds)).toEqual([["lesson"], ["practice"]]);
  });

  it("runs once and then leaves the config alone", () => {
    // Keyed on the old field being present rather than on a version marker, so
    // there is no marker to get out of step with the data it describes.
    const once = normalizeJournalConfigs([legacy()])[0];
    expect(normalizeJournalConfigs([once])[0]).toEqual(once);
  });

  it("does nothing to a journal that never had one", () => {
    const plain = twoKinds();
    expect(normalizeJournalConfigs([plain])[0].variants).toBeUndefined();
  });
});

describe("the loss the move also fixes", () => {
  it("saved layouts are no longer in normaliseKinds' path", () => {
    // `normaliseKinds` rebuilds every kind row from the fields the journal
    // editor knows about, and `variants` was not one of them — so a reader who
    // saved a layout and then edited that journal in Settings had it silently
    // discarded. Asserted as an absence because that is what the fix is: the
    // data is no longer anywhere this routine writes.
    const src = readCode("settings-editors");
    const fn = src.slice(
      src.indexOf("export function normaliseKinds"),
      src.indexOf("export function journalTrackerChoices")
    );
    expect(fn).not.toContain("variants");
  });

  it("saveVariant writes to the journal, not to the kind", () => {
    const src = readCode("journal");
    expect(src).toContain("cfg.variants = [");
    expect(src).not.toContain("kind.variants = [");
  });
});

describe("what is deliberately not attempted", () => {
  it("a layout still cannot cross a journal boundary", () => {
    // Cross-journal is a different problem: a layout names SECTION IDS, and an
    // `options` entry keyed by kind id cannot survive a journey to a journal
    // whose kind ids are different by construction. The follow-up's own
    // sequencing puts it last, and as a COPY rather than a live reference.
    const type = buildJournalType(twoKinds([twoColumn]));
    for (const key of Object.keys(type.layout ?? {})) {
      expect(key.startsWith("kind:") || key.startsWith("index:")).toBe(true);
    }
  });
});

describe("the door a reader actually uses", () => {
  const editor = () => readCode("section-editor");
  const tpl = () => readCode("template-editor");

  it("asks the name and the kinds in one window", () => {
    // `promptNewNote`'s rule: naming a layout and saying where it applies are
    // two halves of one decision, and a reader who cancels a second modal has
    // already committed to the first.
    expect(editor()).toContain("promptLayoutSave(");
    expect(editor()).not.toContain("promptText(\n      this.app,\n      sink.promptTitle");
  });

  it("hides the kind list when there is nothing to choose", () => {
    // A control whose value cannot change spends attention and returns nothing
    // — the complaint the "Layout" dropdown earned in 2.54.7.
    expect(readCode("modals")).toContain("if (this.kinds.length > 1)");
  });

  it("cannot save a layout that applies to nothing", () => {
    // The origin is ticked and disabled, and re-added on close rather than
    // trusted — the invariant rather than the control's behaviour.
    const src = readCode("modals");
    expect(src).toContain("tg.setDisabled(origin)");
    expect(src).toContain("this.picked.add(this.originId)");
  });

  it("offers every kind of the journal, and no other journal's", () => {
    // The whole point of the storage move, and the limit on it: cross-kind is
    // offered, cross-journal is not.
    //
    // ASKED OF `layoutTargetsFor` RATHER THAN OF THE SOURCE TEXT (4.33). This
    // used to pin the literal `ctx.type.kinds.map(...)` in template-editor.ts,
    // which broke the moment the expression moved into a named function
    // without one word of the CLAIM becoming false. A pin that fails on a
    // rename is measuring the spelling; the claim is about what comes back.
    const targets = layoutTargetsFor(STUDY_JOURNAL);
    const ids = targets.map((t) => t.id);
    for (const k of STUDY_JOURNAL.kinds) expect(ids).toContain(k.id);
    // And nothing from a journal that is not this one.
    expect(ids).not.toContain("recipe");
    expect(targets.every((t) => t.label.length > 0)).toBe(true);
    // Still resolved caller-side, so the window stays ignorant — the next test.
    expect(tpl()).toContain("targets: layoutTargetsFor(ctx.type)");
  });

  // ── the two surfaces (4.33) ──────────────────────────────────────────
  it("offers a front page, and a page only where the journal has any", () => {
    // Study's Lesson declares `pages`, so both surfaces are on offer.
    const study = layoutTargetsFor(STUDY_JOURNAL).map((t) => t.id);
    expect(study).toContain("surface:index");
    expect(study).toContain("surface:page");

    // A journal with no paged kind is not offered `Page`: `templateTargets`
    // emits no page template for it, so the checkbox would tick a surface the
    // journal does not have and produce a layout nothing could ever reload.
    const flat = buildJournalType({
      ...structuredClone(STUDY_CONFIG),
      id: "flat",
      kinds: [{ id: "note", emoji: "📝", label: "Note" }],
    });
    const ids = layoutTargetsFor(flat).map((t) => t.id);
    expect(ids).toContain("surface:index");
    expect(ids).not.toContain("surface:page");
  });

  it("prefixes the surfaces so a kind cannot collide with one", () => {
    // A reader may name a kind `index` or `page`; nothing stops them. Bare ids
    // would make the two indistinguishable in a ticked-target list.
    const clash = buildJournalType({
      ...structuredClone(STUDY_CONFIG),
      id: "clash",
      kinds: [
        { id: "index", emoji: "📇", label: "Index card" },
        { id: "page", emoji: "📄", label: "Page note", pages: true },
      ],
    });
    const ids = layoutTargetsFor(clash).map((t) => t.id);
    expect(ids).toEqual(["index", "page", "surface:index", "surface:page"]);

    // And the split reads them apart rather than by resemblance.
    const split = splitLayoutTargets(
      ["index", "page"],
      ["index", "surface:page"]
    );
    expect(split.kinds).toEqual(["index"]);
    expect(split.surfaces).toEqual(["page"]);
  });

  it("a surface layout is offered on no kind at all", () => {
    // `variantKinds` reads an absent `kinds` as EVERY kind, which on a surface
    // layout would put a row in every create dropdown and claim a template file
    // per kind. Closed at both ends: the writers pass `kinds: []`, and the
    // reader treats absent-plus-surfaces as none.
    const cfg = { kinds: [{ id: "lesson", emoji: "📖", label: "Lesson" }] };
    expect(
      variantKinds(cfg, { id: "v", label: "V", surfaces: ["index"] })
    ).toEqual([]);
    // A layout that names no surface keeps the old meaning exactly.
    expect(variantKinds(cfg, { id: "v", label: "V" })).toEqual(["lesson"]);
  });

  it("keeps the editor ignorant of what a kind is", () => {
    // The seam this window has held since 3.0: it draws the labels the caller
    // supplied and hands back the ids the reader ticked. `targets`, not `kinds`.
    const src = readSrc("section-editor");
    expect(src).toContain("targets?: { id: string; label: string }[]");
    expect(src).not.toMatch(/ctx\.type\.kinds/);
  });
});

describe("removing a shared layout", () => {
  it("withdraws one kind rather than deleting for all of them", () => {
    // THE CROSS-KIND HALF'S FIRST WAY TO LOSE WORK: deleting "Two column" from
    // Practice's row would otherwise take it off Lesson too, from a row that
    // never mentioned Lesson.
    const src = readCode("settings-editors");
    expect(src).toContain("variant.kinds = others;");
    expect(src).toMatch(/shared[\s\S]{0,400}Stop offering it/);
  });

  it("writes the remaining kinds explicitly, never leaving it absent", () => {
    // Absent means EVERY kind, so a shared layout that shed one and went quiet
    // would come straight back on the kind just removed.
    const src = readCode("settings-editors");
    expect(src).not.toMatch(/delete variant\.kinds/);
  });

  it("still deletes outright when it was the last kind holding it", () => {
    const src = readCode("settings-editors");
    expect(src).toContain("(v) => v.id !== variantId");
    expect(src).toMatch(/if \(!this\.draft\.variants\.length\) delete this\.draft\.variants;/);
  });

  it("says which kinds keep it", () => {
    expect(readCode("settings-editors")).toContain("It stays available for ${listSentence(otherLabels)}");
  });
});

describe("both writers moved, not just one", () => {
  it("the settings rail writes to the journal too", () => {
    // `addVariant` was the second writer and the dangerous one: this window's
    // own commit runs `normaliseKinds`, so a layout saved here and a journal
    // edited afterwards were a saved layout and its deletion.
    const src = readCode("settings-editors");
    expect(src).toContain("this.draft.variants = [");
    expect(src).not.toContain("kind.variants = [");
  });
});
