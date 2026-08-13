// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { composeEntryTemplate } from "../src/diary/entry-sections";
import { describe, it, expect } from "vitest";
import {
  DIARY_FIELDS,
  DiaryField,
  fieldDirective,
  fieldsForClass,
  firstLine,
  getField,
  goalsOf,
  itemsOf,
  lineOf,
  readField,
  readRollup,
  regionContent,
  rollupFields,
  valueOf,
} from "../src/trackers/fields";
import { allNoteRegions } from "../src/core/notestore";


// ALL FIVE GRAINS, SINCE 3.12. This was `daily` and `monthly`, which is
// exactly the pair the registry declared — so the test checked the two grains
// that existed and said nothing about the three that shipped six authored
// fields apiece with no declaration behind them (3.11 §13.3). Checking two of
// five is what let that sit for two grains' worth of releases.
//
// Driven off `GRAINS` rather than named fixtures for the same reason
// `layout.test.ts` reads a folder rather than a list: a sixth grain should
// arrive already covered, or fail loudly on the day it is added.
const GRAINS = ["daily", "weekly", "monthly", "quarterly", "yearly"] as const;
const TEMPLATES = new Map(
  GRAINS.map((g) => [g, composeEntryTemplate(g)] as const)
);


// The directive lines a template actually carries, in order.
function directivesIn(template: string): string[] {
  return template
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^(note|list|tasks|attach):/.test(l));
}

describe("the registry matches the shipped templates", () => {
  // This is the guarantee that makes introducing the registry a no-op. If a
  // placeholder is edited in the asset and not here (or the reverse), the two
  // sources of truth have already drifted and every rollup built on this list
  // is reading a field the note doesn't have.
  it.each(GRAINS)(
    "reconstructs the %s template's fields exactly, in order",
    (cls) => {
      expect(fieldsForClass(cls).map(fieldDirective)).toEqual(
        directivesIn(TEMPLATES.get(cls)!)
      );
    }
  );

  it("declares fields for every grain, so an empty one cannot pass quietly", () => {
    // The reconstruction above compares two lists, and two EMPTY lists are
    // equal. Before 3.12 that is precisely what `weekly` would have done if
    // anyone had thought to check it — an undeclared grain reconstructs a
    // template it knows nothing about, perfectly, by both sides being nothing.
    //
    // Same failure `layout.test.ts` grew a guard for in 3.11 §13.2: assert the
    // population is non-empty BEFORE asserting anything about its contents.
    for (const g of GRAINS) {
      expect(fieldsForClass(g).length, g).toBeGreaterThan(0);
    }
  });

  it("declares a region for every field, and no field without a region", () => {
    // The template carries `<!--almanac:key-->` anchors alongside the
    // directives; a directive with no anchor still works (the widget appends
    // one on first render) but ships a note whose raw body is missing a field
    // until it's touched.
    for (const cls of GRAINS) {
      const template = TEMPLATES.get(cls)!;
      const regions = allNoteRegions(template).map((r) => r.key);
      const ids = fieldsForClass(cls).map((f) => f.id);
      expect(regions.sort()).toEqual([...ids].sort());
    }
  });
});

describe("which grains a scope gathers from", () => {
  it("rolls up nothing from a week, a quarter or a year", () => {
    // 3.12, and the argument behind eighteen `none`s rather than eighteen
    // omissions. `rollup` says what a scope ABOVE does with a field, not what
    // the field contains — which is why `log` is `none` at both source grains
    // while holding perfectly rollupable prose.
    //
    // Nothing reads these three as a source, by 3.11 §5's decision: a week and
    // a month are written from their days and a quarter from its months, so
    // weeks under a quarter and quarters under a year would be summaries of
    // summaries. This pins that these grains declare their fields AND gather
    // none of them, which is a different statement from having no fields.
    for (const g of ["weekly", "quarterly", "yearly"] as const) {
      expect(fieldsForClass(g).length, g).toBeGreaterThan(0);
      expect(rollupFields(g).map((f) => f.id), g).toEqual([]);
    }
  });

  it("keeps the two source grains gathering, so this is a claim not a blanket", () => {
    // If `rollupFields` ever returned nothing for everything, the test above
    // would pass for the wrong reason.
    expect(rollupFields("daily").map((f) => f.id)).toContain("highlights");
    expect(rollupFields("monthly").map((f) => f.id)).toContain("todo");
  });
});

describe("registry shape", () => {
  it("identifies a field by (id, class), not by id alone", () => {
    // `focus` is a field of the day and a field of the month, with different
    // prompts. Keying globally would make one overwrite the other.
    const day = getField("focus", "daily");
    const month = getField("focus", "monthly");
    expect(day?.label).toBe("Today's focus");
    expect(month?.label).toBe("Monthly focus");
    expect(day?.placeholder).not.toBe(month?.placeholder);
  });

  it("has no duplicate (id, class) pairs", () => {
    const seen = new Set<string>();
    for (const f of DIARY_FIELDS) {
      const key = `${f.class}\u0000${f.id}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("returns undefined for an unregistered region rather than throwing", () => {
    // A hand-added `<!--almanac:dreams-->` is legitimate. The registry says
    // what rolls up, not what exists.
    expect(getField("dreams", "daily")).toBeUndefined();
  });

  it("gives every rollupable field a noun to be gathered under", () => {
    for (const f of rollupFields("daily")) expect(f.rollupNoun).toBeTruthy();
    for (const f of rollupFields("monthly")) expect(f.rollupNoun).toBeTruthy();
  });

  it("keeps the monthly log out of every rollup, deliberately", () => {
    // Not by omission from a list of literals, which is how it was excluded
    // before — by a stated value that a reader can disagree with.
    expect(getField("log", "monthly")?.rollup).toBe("none");
    expect(getField("log", "daily")?.rollup).toBe("none");
    expect(rollupFields("monthly").map((f) => f.id)).not.toContain("log");
  });

  it("rolls up the day's focus and its two lists, and nothing else", () => {
    // WAS "focus and nothing else the day writes" until 3.11 §4.1, when the
    // daily template gained Highlights and Challenges. The three that roll up
    // are the three a month is written FROM; `log`, `attachments`, `todo` and
    // `capture` all state `rollup: "none"` with an argument attached.
    expect(rollupFields("daily").map((f) => f.id)).toEqual([
      "focus",
      "highlights",
      "challenges",
    ]);
  });

  it("keeps the day's prose, tasks and captures out of every rollup", () => {
    // The half of the assertion above that did the real work, kept as its own
    // test now that the first one has three ids in it rather than one. Each of
    // these is a stated `none` rather than an omission.
    for (const id of ["log", "attachments", "todo", "capture"]) {
      expect(getField(id, "daily")?.rollup, id).toBe("none");
    }
  });

  it("rolls up the month's theme, both lists, and its goals", () => {
    expect(rollupFields("monthly").map((f) => f.id)).toEqual([
      "focus",
      "highlights",
      "challenges",
      "todo",
    ]);
  });

  it("treats a day's tasks and a month's goals differently", () => {
    // A day's tasks are ticked; a month's goals accumulate. The quarter counts
    // the second set versus met and would drown in the first.
    expect(getField("todo", "daily")?.rollup).toBe("none");
    expect(getField("todo", "monthly")?.rollup).toBe("goals");
  });
});

describe("fieldDirective", () => {
  it("emits the variant suffix before the placeholder", () => {
    const f = getField("focus", "daily") as DiaryField;
    expect(fieldDirective(f)).toBe(
      "note:focus#line:What are you focusing on today?|Today's focus"
    );
  });

  it("omits the placeholder segment when there isn't one", () => {
    const f = getField("attachments", "daily") as DiaryField;
    expect(fieldDirective(f)).toBe("attach:attachments|Attachments");
  });

  it("emits a collapse variant", () => {
    const f = getField("capture", "daily") as DiaryField;
    expect(fieldDirective(f)).toBe(
      "note:capture#collapse:Captured thoughts land here…|Captured"
    );
  });
});

describe("firstLine", () => {
  it("takes the first non-empty line", () => {
    expect(firstLine("\n\n  ship it  \nand more\n")).toBe("ship it");
  });

  it("is empty for an empty region", () => {
    expect(firstLine("")).toBe("");
    expect(firstLine("\n  \n")).toBe("");
  });
});

describe("regionContent", () => {
  it("returns the content of a named region", () => {
    const regions = [{ key: "focus", content: "ship it" }];
    expect(regionContent(regions, "focus")).toBe("ship it");
  });

  it("returns empty for a region the note doesn't carry", () => {
    expect(regionContent([], "focus")).toBe("");
  });
});

describe("readField", () => {
  const field = (id: string, cls: "daily" | "monthly"): DiaryField =>
    getField(id, cls) as DiaryField;

  it("reads a line field as at most one item", () => {
    const v = readField(
      [{ key: "focus", content: "the theme\nsomething else" }],
      field("focus", "monthly")
    );
    expect(v.items).toEqual(["the theme"]);
    expect(v.goals).toEqual([]);
  });

  it("reads a line field that was never written as no items", () => {
    expect(readField([], field("focus", "monthly")).items).toEqual([]);
  });

  it("reads an items field as one entry per non-blank line", () => {
    const v = readField(
      [{ key: "highlights", content: "loan approved\n\nbrother's birthday\n" }],
      field("highlights", "monthly")
    );
    expect(v.items).toEqual(["loan approved", "brother's birthday"]);
  });

  it("reads a goals field as tasks with their done state", () => {
    const v = readField(
      [{ key: "todo", content: "- ( ) run 5k\n- (x) call the bank" }],
      field("todo", "monthly")
    );
    expect(v.goals).toEqual([
      { text: "run 5k", done: false },
      { text: "call the bank", done: true },
    ]);
    expect(v.items).toEqual([]);
  });

  it("yields nothing for a field whose rollup is none", () => {
    const v = readField(
      [{ key: "log", content: "a long paragraph of prose" }],
      field("log", "monthly")
    );
    expect(v.items).toEqual([]);
    expect(v.goals).toEqual([]);
  });
});

describe("readRollup", () => {
  const monthRegions = [
    { key: "focus", content: "consolidate" },
    { key: "highlights", content: "loan approved\nbrother's birthday" },
    { key: "challenges", content: "slept badly" },
    { key: "log", content: "three paragraphs of prose" },
    { key: "todo", content: "- ( ) run 5k\n- (x) call the bank" },
  ];

  it("returns one value per rollupable field, in template order", () => {
    const values = readRollup(monthRegions, "monthly");
    expect(values.map((v) => v.field.id)).toEqual([
      "focus",
      "highlights",
      "challenges",
      "todo",
    ]);
  });

  it("never surfaces the log region", () => {
    // The quarter's oldest rule, now enforced by the registry rather than by
    // a list of four literals that happened not to include it.
    const values = readRollup(monthRegions, "monthly");
    expect(values.some((v) => v.field.id === "log")).toBe(false);
    const flat = JSON.stringify(values);
    expect(flat).not.toContain("three paragraphs");
  });

  it("returns a value for a field the note never wrote", () => {
    // An absent field is an empty section, not a missing one — the same
    // reasoning that gives a month with no review note a row in the quarter.
    const values = readRollup([], "monthly");
    expect(values).toHaveLength(4);
    expect(values.every((v) => v.items.length === 0 && v.goals.length === 0)).toBe(
      true
    );
  });

  it("reads a day as its focus and its two lists", () => {
    const values = readRollup(
      [
        { key: "focus", content: "finish the report" },
        { key: "highlights", content: "- shipped the thing" },
        { key: "log", content: "prose" },
        { key: "todo", content: "- ( ) water plants" },
        { key: "capture", content: "a stray thought" },
      ],
      "daily"
    );
    // ONE VALUE PER DECLARED FIELD, WRITTEN OR NOT. `challenges` is absent
    // from this note and still comes back — with no items. That is the
    // contract (`rollupFields(cls).map(readField)`) and the reason every
    // consumer filters for itself: `rollupDays` drops values with no items so
    // a month does not render twenty-five blank rows, and `itemsOf` returns
    // [] rather than throwing. Asserting the empty one is here is what stops
    // a future reader "fixing" readRollup to skip it and quietly changing
    // what four callers receive.
    expect(values.map((v) => v.field.id)).toEqual([
      "focus",
      "highlights",
      "challenges",
    ]);
    expect(values[0].items).toEqual(["finish the report"]);
    expect(values[1].items).toEqual(["- shipped the thing"]);
    expect(values[2].items).toEqual([]);
  });
});

describe("accessors", () => {
  const values = readRollup(
    [
      { key: "focus", content: "consolidate" },
      { key: "highlights", content: "a\nb" },
      { key: "todo", content: "- (x) done it" },
    ],
    "monthly"
  );

  it("lineOf gives the phrase", () => {
    expect(lineOf(values, "focus")).toBe("consolidate");
  });

  it("itemsOf gives the rows", () => {
    expect(itemsOf(values, "highlights")).toEqual(["a", "b"]);
  });

  it("goalsOf gives the tasks", () => {
    expect(goalsOf(values, "todo")).toEqual([{ text: "done it", done: true }]);
  });

  it("returns empty rather than undefined for a field that isn't there", () => {
    expect(lineOf(values, "nope")).toBe("");
    expect(itemsOf(values, "nope")).toEqual([]);
    expect(goalsOf(values, "nope")).toEqual([]);
    expect(valueOf(values, "nope")).toBeUndefined();
  });
});
