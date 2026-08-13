// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";
import { STUDY_JOURNAL, buildJournalType } from "../src/journals/journal";
import {
  freshCustomJournal,
  journalTemplateFiles,
  composeTemplate,
} from "../src/journals/custom-journal";
import type { JournalConfig } from "../src/journals/custom-journal";
import { templateTargets } from "../src/journals/journal-sections";
import { sectionsPresent } from "../src/journals/journal-plan";

import { readSrc } from "./sources";
// ── saved layouts (variants) ──────────────────────────────────────────────
//
// A variant is a LAYOUT, not a kind: "Math Lesson" is a Lesson, with the same
// `type:`, the same trackers and the same place in the review queue. What
// differs is which sections its template starts with.
//
// The stored layout is a SEED. It is what the variant's template file is
// composed from when first written; after that the file is the truth and the
// template editor edits the file. That distinction is the whole reason
// persisting a layout does not create a second record of one arrangement, and
// it is what these tests are mostly about.

// STORED ON THE JOURNAL SINCE 3.18 follow-ups §5, not on the kind. Only the
// address moved: every assertion below is about what a saved layout DOES — one
// template per layout, its own file, its own target and key, composed from its
// own sections — and none of them changed, which is what "a storage move with
// no new semantics" has to mean if it is true.
//
// The fixture names `lesson` explicitly rather than relying on "absent means
// every kind", so these stay tests of the single-kind behaviour they were
// written for; sharing across kinds is asserted separately below.
const cfg = (variants?: JournalConfig["variants"]): JournalConfig => ({
  ...freshCustomJournal(new Set()),
  id: "study-notes",
  name: "Study Notes",
  levels: [{ id: "subject", noun: "Subject", fallbackEmoji: "📚" }],
  kinds: [{ id: "lesson", emoji: "📖", label: "Lesson" }],
  ...(variants
    ? { variants: variants.map((v) => ({ kinds: ["lesson"], ...v })) }
    : {}),
});

describe("a kind with no saved layouts", () => {
  it("has exactly one template, named after the kind", () => {
    const type = buildJournalType(cfg());
    expect(type.kinds[0].templates).toHaveLength(1);
    expect(type.kinds[0].templates[0].id).toBe("default");
    // "Generic" until 2.54.7, which read as a category nobody had chosen. With
    // one entry the dropdown is hidden anyway; with several, "Lesson" is what
    // the plain one is called.
    expect(type.kinds[0].templates[0].label).toBe("Lesson");
  });

  it("keeps the bare kind key, so existing layouts still resolve", () => {
    const type = buildJournalType(cfg());
    const target = templateTargets(type).find((t) => t.file === "lesson.md")!;
    expect(target.key).toBe("kind:lesson");
  });
});

describe("a kind with saved layouts", () => {
  const withMath = () =>
    buildJournalType(
      cfg([{ id: "math", label: "Math Lesson", sections: ["banner", "recall"] }])
    );

  it("offers one template per layout", () => {
    const type = withMath();
    expect(type.kinds[0].templates.map((t) => t.id)).toEqual([
      "default",
      "math",
    ]);
  });

  it("gives each layout its own file, through the same allocator", () => {
    // A variant called "index" must not be able to take a level's template —
    // hence the shared allocator rather than a bespoke name.
    const type = withMath();
    expect(type.kinds[0].templates.map((t) => t.template)).toEqual([
      "lesson.md",
      "lesson-math.md",
    ]);
  });

  it("emits a target for each, so the designer can reach them", () => {
    // The failure the old shape guaranteed: templateTargets took
    // `templates[0]`, so a second variant would have been invisible to the
    // launcher rail, the template editor, ensureJournalTemplates and
    // refreshJournalTemplates. That is why "just another entry in this list, no
    // new plumbing" had stopped being true.
    const files = templateTargets(withMath()).map((t) => t.file);
    expect(files).toContain("lesson.md");
    expect(files).toContain("lesson-math.md");
  });

  it("labels a variant's target so a rail says which is which", () => {
    const labels = templateTargets(withMath()).map((t) => t.label);
    expect(labels).toContain("Lesson");
    expect(labels).toContain("Lesson — Math Lesson");
  });

  it("writes a file per layout", () => {
    const names = journalTemplateFiles(withMath()).map((f) => f.name);
    expect(names).toContain("lesson.md");
    expect(names).toContain("lesson-math.md");
  });

  it("composes the variant from its saved sections, not the defaults", () => {
    // The point of the whole feature. Without layout.sections reaching
    // composeTemplate, every variant of a kind would compose identically and
    // the dropdown would be decoration again.
    const type = withMath();
    const files = journalTemplateFiles(type);
    const target = templateTargets(type).find(
      (t) => t.file === "lesson-math.md"
    )!;
    const text = files.find((f) => f.name === "lesson-math.md")!.content;
    const present = sectionsPresent(text, target.ctx);
    expect(present).toContain("recall");
    // Saved as banner+recall, so a section the catalogue would have offered is
    // absent — "a Lesson without the checklist" has to keep not having one.
    expect(present).not.toContain("checklist");
  });

  it("still keeps the banner, which no layout can drop", () => {
    // composeTemplate enforces `required` rather than trusting its caller, and
    // a saved layout is just another caller.
    const type = buildJournalType(
      cfg([{ id: "min", label: "Minimal", sections: ["recall"] }])
    );
    const text = journalTemplateFiles(type).find(
      (f) => f.name === "lesson-min.md"
    )!.content;
    expect(text).toContain("journal-header");
  });

  it("carries a variant's key without touching the default's", () => {
    const type = withMath();
    const keys = templateTargets(type).map((t) => t.key);
    expect(keys).toContain("kind:lesson");
    expect(keys).toContain("kind:lesson:math");
  });

  it("folds the saved layout into the type's layout map", () => {
    // What makes the feature nearly free: composeTemplate, sectionOverrides,
    // the launcher rail and refreshJournalTemplates all read
    // `type.layout[key]` already, so none of them had to learn what a variant
    // is.
    const type = withMath();
    expect(type.layout?.["kind:lesson:math"]?.sections).toEqual([
      "banner",
      "recall",
    ]);
  });
});

describe("a variant is not a kind", () => {
  it("writes the kind's own type: value, not the variant's", () => {
    // The line that keeps a variant from being a second kind. A Math Lesson is
    // a Lesson: same frontmatter, so the same tables, the same review queue and
    // the same trackers. Nothing about a variant reaches a note.
    const type = buildJournalType(
      cfg([{ id: "math", label: "Math Lesson", sections: ["banner"] }])
    );
    const target = templateTargets(type).find(
      (t) => t.file === "lesson-math.md"
    )!;
    expect(target.ctx.typeValue).toBe("lesson");
    expect(composeTemplate(target.ctx)).toContain("type: lesson");
  });

  it("gives a variant no trackers or rating of its own", () => {
    const type = buildJournalType({
      ...cfg([{ id: "math", label: "Math Lesson" }]),
      kinds: [
        {
          id: "lesson",
          emoji: "📖",
          label: "Lesson",
          rating: "confidence",
          variants: [{ id: "math", label: "Math Lesson" }],
        },
      ],
    });
    // One kind, one rating — the variant is a layout hanging off it.
    expect(type.kinds).toHaveLength(1);
    expect(type.kinds[0].rating).toBe("confidence");
  });
});

describe("Study is unchanged", () => {
  it("still ships one template per kind", () => {
    for (const kind of STUDY_JOURNAL.kinds) {
      expect(kind.templates.length, kind.id).toBeGreaterThanOrEqual(1);
    }
  });

  it("still keeps its per-template ordering layout", () => {
    // `order` and `sections` are different claims: `order` says where sections
    // go and lets the catalogue decide which there are, so Study's dashboards
    // gain a section the day the catalogue does. A saved variant needs the
    // stricter one. Study must still be using the looser.
    for (const layout of Object.values(STUDY_JOURNAL.layout ?? {})) {
      expect(layout.sections).toBeUndefined();
    }
    expect(Object.keys(STUDY_JOURNAL.layout ?? {}).length).toBeGreaterThan(0);
  });
});

describe("one word for one thing", () => {
  it("calls a saved layout a layout in every user-facing string", () => {
    // 2.54.7 shipped three words for one concept — "variant" in the code,
    // "Template type" in the new-note popup, "layout" in the docs — which is
    // two too many for something a reader meets in three places. The type name
    // is still JournalTemplateVariant and that is admitted to in modals.ts;
    // what a reader SEES is unified, and this is what keeps it that way.
    const src = [
      readSrc("template-editor"),
      readSrc("settings-editors"),
      readSrc("modals"),
    ].join("\n");

    // Strings, not comments: a quoted "variant" reaching a button or a field
    // name is the regression.
    const quoted = src.match(/"[^"\n]*[Vv]ariant[^"\n]*"/g) ?? [];
    const uiish = quoted.filter(
      (q) => /^"[A-Z]/.test(q) && !q.includes("./")
    );
    expect(uiish).toEqual([]);
    expect(src).toContain('"Save as layout…"');
    expect(src).toContain('"Layout"');
  });
});
