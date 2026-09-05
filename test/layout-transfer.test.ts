// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// 3.18 follow-ups §5, second half: a layout crosses a journal boundary.
//
// SEQUENCED LAST, AS THAT DOCUMENT ASKED, and built as a COPY rather than a
// live reference for the reason it gave: a shared layout has to answer what
// happens when one of its two journals changes shape, and every answer to that
// is a bug report. A copy has no such question — the target owns what it gets.
//
// THE WHOLE DIFFICULTY IS THAT A LAYOUT NAMES THINGS. Section ids, which exist
// or not depending on the surface; tracker ids, which are vault-global; and —
// the one that cannot travel at all — kind ids, which are per journal by
// construction. `sectionsFor` already drops what it cannot compose, silently,
// which is right at home and wrong abroad. These tests are mostly about the
// report that makes the difference.

import { describe, expect, it } from "vitest";
import { resolveLayoutFor } from "../src/journals/layout-transfer";
import {
  buildJournalType,
  freshCustomJournalType,
} from "./layout-transfer-fixture";
import { sectionContext } from "../src/journals/journal-sections";
import { readCode } from "./sources";

const cooking = () =>
  freshCustomJournalType({
    id: "cooking",
    name: "Cooking",
    kinds: [
      { id: "recipe", emoji: "🍳", label: "Recipe" },
      { id: "method", emoji: "🥄", label: "Method" },
    ],
  });

// A LEAF surface, which is where `recall`, `resources` and `pages` live.
const ctxFor = (type: ReturnType<typeof buildJournalType>) =>
  sectionContext(type, { kind: type.kinds[0] });

// An INDEX surface, which is the only place `children` is composable — it is a
// rollup of what is beneath a dashboard, so a leaf note has none. The
// distinction matters here: a layout naming `children` resolved against a leaf
// context loses the section before its options are ever looked at.
const indexCtxFor = (type: ReturnType<typeof buildJournalType>) =>
  sectionContext(type, { depth: 0 });

describe("what crosses", () => {
  it("keeps a section the target can compose", () => {
    const type = cooking();
    const { layout, dropped } = resolveLayoutFor(
      { sections: ["banner", "recall"] },
      type,
      ctxFor(type)
    );
    expect(layout.sections).toEqual(["banner", "recall"]);
    expect(dropped).toEqual([]);
  });

  it("keeps a title, which means the same thing anywhere", () => {
    const type = cooking();
    const { layout, dropped } = resolveLayoutFor(
      { sections: ["resources"], options: { resources: { label: "📚 Reading" } } },
      type,
      ctxFor(type)
    );
    expect(layout.options?.resources?.label).toBe("📚 Reading");
    expect(dropped).toEqual([]);
  });

  it("keeps shelves, which are the reader's own words", () => {
    // `res-docs`/`Docs` is resolved by nothing outside the layout, so it means
    // as much in Cooking as it did in Study.
    const type = cooking();
    const { layout } = resolveLayoutFor(
      {
        sections: ["resources"],
        options: { resources: { fields: [{ key: "res-docs", label: "Docs" }] } },
      },
      type,
      ctxFor(type)
    );
    expect(layout.options?.resources?.fields).toEqual([
      { key: "res-docs", label: "Docs" },
    ]);
  });

  it("keeps a page widget and its argument, on the tracker's argument", () => {
    // 5.26: a journal template can carry a page widget now, so a layout can
    // name one. Its argument is a folder path, a journal id or a kind id —
    // something this module holds a `JournalType` and no vault to resolve — so
    // it travels the way `tracker` does: carried and left for the reader to
    // look at. Dropping it turns a `tasks-table` the reader scoped into a
    // vault-wide one, which looks right and is not.
    const type = cooking();
    const { layout, dropped } = resolveLayoutFor(
      {
        sections: ["banner", "w:tasks-table#1"],
        options: { "w:tasks-table#1": { arg: "03 - Journals/Study" } },
      },
      type,
      ctxFor(type)
    );
    expect(layout.sections).toEqual(["banner", "w:tasks-table#1"]);
    expect(layout.options?.["w:tasks-table#1"]).toEqual({
      arg: "03 - Journals/Study",
    });
    expect(dropped).toEqual([]);
  });

  it("copies rather than sharing, so the source cannot be edited through it", () => {
    // A COPY AND NOT A REFERENCE is the design, and a shared array would make
    // it one by accident — editing the new journal's shelves would rewrite the
    // old journal's.
    const source = {
      sections: ["resources"],
      options: { resources: { fields: [{ key: "a", label: "A" }] } },
    };
    const type = cooking();
    const { layout } = resolveLayoutFor(source, type, ctxFor(type));
    layout.options!.resources!.fields![0].label = "CHANGED";
    expect(source.options.resources.fields[0].label).toBe("A");
    expect(layout.sections).not.toBe(source.sections);
  });
});

describe("what does not, and is said so", () => {
  it("drops a section the target cannot compose, and names it", () => {
    // `pages` applies only where the kind is paged. Cooking's are not.
    const type = cooking();
    const { layout, dropped } = resolveLayoutFor(
      { sections: ["banner", "pages"] },
      type,
      ctxFor(type)
    );
    expect(layout.sections).toEqual(["banner"]);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].sectionId).toBe("pages");
    expect(dropped[0].detail).toContain("Cooking");
  });

  it("drops a per-kind heading for a kind the target does not have", () => {
    // THE ONE THAT CANNOT TRAVEL. `children` keys its `fields` by KIND ID, and
    // kind ids are per journal by construction — `lesson` names nothing in a
    // journal whose kinds are recipe and method. Keeping it silently would
    // leave a stored override nothing resolves and nothing reports.
    const type = cooking();
    const { layout, dropped } = resolveLayoutFor(
      {
        sections: ["children"],
        options: {
          children: { fields: [{ key: "lesson", label: "📖 Lessons" }] },
        },
      },
      type,
      indexCtxFor(type)
    );
    expect(dropped.some((d) => d.detail.includes("lesson"))).toBe(true);
    expect(dropped.some((d) => d.detail.includes("no such note type"))).toBe(
      true
    );
    expect(layout.options?.children?.fields).toBeUndefined();
  });

  it("keeps the half of a kind map that does resolve", () => {
    // Partial rather than all-or-nothing: naming one kind the target has and
    // one it does not should not lose the one that works.
    const type = cooking();
    const { layout, dropped } = resolveLayoutFor(
      {
        sections: ["children"],
        options: {
          children: {
            fields: [
              { key: "recipe", label: "🍳 Recipes" },
              { key: "lesson", label: "📖 Lessons" },
            ],
          },
        },
      },
      type,
      indexCtxFor(type)
    );
    expect(layout.options?.children?.fields).toEqual([
      { key: "recipe", label: "🍳 Recipes" },
    ]);
    expect(dropped.some((d) => d.detail.includes("lesson"))).toBe(true);
  });

  it("does not check a shelf key against the target's kinds", () => {
    // The same `fields` shape on `resources` means something else entirely, and
    // treating `res-docs` as a missing note type would report a loss that is
    // not one — and drop a shelf that travels perfectly well.
    const type = cooking();
    const { layout, dropped } = resolveLayoutFor(
      {
        sections: ["resources"],
        options: {
          resources: { fields: [{ key: "res-docs", label: "Docs" }] },
        },
      },
      type,
      ctxFor(type)
    );
    expect(layout.options?.resources?.fields).toHaveLength(1);
    expect(dropped).toEqual([]);
  });

  it("does not report a section's settings as a second loss", () => {
    // The section is already reported. Saying it twice reads as two problems.
    const type = cooking();
    const { dropped } = resolveLayoutFor(
      { sections: ["pages"], options: { pages: { label: "Pages" } } },
      type,
      ctxFor(type)
    );
    expect(dropped).toHaveLength(1);
    expect(dropped[0].sectionId).toBe("pages");
  });

  it("finds a kind-keyed map without being told which sections have one", () => {
    // Asked of the TARGET — does it have such a kind — rather than by knowing
    // that `children` behaves this way, so a future section keyed the same way
    // is handled without this function learning about it.
    expect(readCode("layout-transfer")).not.toMatch(/=== "children"/);
    expect(readCode("layout-transfer")).toContain('section?.fieldKeys === "kinds"');
    // And the meaning is declared where it lives.
    expect(readCode("journal-sections")).toContain('fieldKeys: "kinds"');
  });
});

describe("the door", () => {
  const src = (): string => readCode("settings-editors");

  it("offers other journals, not this one", () => {
    expect(src()).toContain("(j) => j.id !== this.draft.id");
  });

  it("says so when there is nowhere to copy to", () => {
    expect(src()).toContain("There's no other journal to copy this to");
  });

  it("shows what is lost before writing anything", () => {
    const t = src();
    const ask = t.indexOf('"Copy it"');
    const write = t.indexOf("target.variants = [");
    expect(ask).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(ask);
    expect(t).toContain('label: "Left behind"');
  });

  it("refuses a layout that would compose nothing", () => {
    expect(src()).toContain("can be composed on");
  });

  it("leaves the source journal alone", () => {
    // A COPY. The reader is told so in the dialogue, and it has to be true.
    expect(src()).toContain("Nothing in ${this.draft.name} changes.");
  });

  it("gives the copy a fresh id in the target", () => {
    // The source's id means nothing here, and reusing it would collide the
    // moment the target already held a layout of that name.
    expect(src()).toMatch(/const taken = new Set\(\(target\.variants \?\? \[\]\)/);
  });
});
