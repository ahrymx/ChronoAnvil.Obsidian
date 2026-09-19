// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// A kind's table gets to say what its columns are called — 1.0.32.
//
// The reader's ask: *"there needs to be a way to edit these headers for page
// kinds, especially for trackers such as confidence or accuracy."*
//
// WHAT THE SHAPE OF THE PROBLEM WAS. Four headings from four places, none of
// them the table: the name from `kind.label`, `Date` from a literal in the
// render, and the two tracker columns from the REGISTRY's label. So the only
// way to change the word over the Confidence column was to rename the
// Confidence tracker — in the cell a reader fills in, in the stats band, in the
// chart legend, and in every other journal that uses it.
//
// The derivation is still the answer where the kind says nothing, which is what
// makes the field safe on every journal that already exists.

import { describe, expect, it } from "vitest";

import {
  KIND_COLUMN_KEYS,
  cleanHeadings,
  headingOf,
  kindColumns,
  packHeadings,
  ratingNoun,
} from "../src/journals/kind-columns";
import type { KindColumnKey } from "../src/journals/kind-columns";
import type ChronoAnvilPlugin from "../src/main";
import { readSrc } from "./sources";

const TRACKERS = [
  { id: "confidence", label: "🎯 Confidence", builtin: "confidence" },
  { id: "accuracy", label: "🎯 Accuracy" },
  { id: "state", label: "📌 Status", builtin: "status" },
];

const plugin = (): ChronoAnvilPlugin =>
  ({ settings: { trackers: TRACKERS } }) as unknown as ChronoAnvilPlugin;

const words = (kind: Parameters<typeof kindColumns>[1]): string[] =>
  kindColumns(plugin(), kind).map((c) => c.heading);

describe("what a kind's table calls its columns", () => {
  it("derives every one of them when the kind says nothing", () => {
    // Exactly what it drew before the field existed — which is the whole of the
    // migration story for journals that already exist: there isn't one.
    expect(words({ label: "Lesson", rating: "confidence" })).toEqual([
      "Lesson",
      "Date",
      "Confidence",
      "Status",
    ]);
  });

  it("drops the rating column where the kind is not rated", () => {
    // `kindTableProperties`' rule since it was written: *"its rating if it
    // declares one and nothing where it doesn't"*.
    expect(words({ label: "Cheatsheet" })).toEqual([
      "Cheatsheet",
      "Date",
      "Status",
    ]);
  });

  it("lets the kind overrule any of them", () => {
    // THE ASK, in one assertion. `accuracy` is a registry tracker labelled
    // "Accuracy" and this table calls that column "Score" without the tracker
    // being renamed anywhere.
    expect(
      words({
        label: "Drill",
        rating: "accuracy",
        headings: { name: "Exercise", rating: "Score", status: "State" },
      })
    ).toEqual(["Exercise", "Date", "Score", "State"]);
  });

  it("keys the override by role, never by the tracker it reads", () => {
    // A kind re-rated from Confidence to Accuracy keeps the word its rating
    // column was given. Keyed by tracker id this would have silently reverted
    // and left a stale entry behind under the old id.
    const kind = { label: "Drill", rating: "confidence", headings: { rating: "Score" } };
    expect(words(kind)[2]).toBe("Score");
    expect(words({ ...kind, rating: "accuracy" })[2]).toBe("Score");
  });

  it("treats an empty box as the derived word, not as a blank heading", () => {
    // A reader who clears the box is asking for the default back. A column with
    // no heading over it is not a thing anyone wants and is what a naive
    // `?? fallback` would have shipped.
    expect(words({ label: "Lesson", headings: { name: "   " } })[0]).toBe(
      "Lesson"
    );
    expect(headingOf({ label: "x" }, "date", "Date")).toBe("Date");
  });

  it("still strips the registry's glyph off a derived tracker word", () => {
    // `ratingNoun` moved out of `tables.ts` for the editor's sake and must be
    // the same function it was — the placeholder in Settings and the heading on
    // the page are the same word or the box lies about what it overrides.
    expect(ratingNoun({ label: "🎯 Confidence" } as never, "x")).toBe(
      "Confidence"
    );
    expect(ratingNoun(null, "accuracy")).toBe("accuracy");
  });

  it("names a tracker the registry has forgotten by its property", () => {
    // A kind rated on something no longer in the registry: the column reads the
    // property it is actually reading rather than an empty heading — and that
    // is precisely the case a reader most wants a box for.
    expect(words({ label: "Drill", rating: "recall_pct" })[2]).toBe("recall_pct");
  });
});

describe("what gets stored", () => {
  const boxes = (
    rows: [KindColumnKey, string, string][]
  ): Record<string, string> | undefined =>
    packHeadings(rows.map(([key, value, fallback]) => ({ key, value, fallback })));

  it("stores nothing for a box that agrees with its own derivation", () => {
    // NOT TIDINESS. A heading equal to the derived word, stored, would PIN that
    // word as it stood when the box was touched — so renaming the Confidence
    // tracker afterwards would move it everywhere except the table the reader
    // happened to visit. `normaliseKinds` makes the same call for `plural`.
    expect(boxes([["rating", "Confidence", "Confidence"]])).toBeUndefined();
    expect(boxes([["rating", "  Confidence  ", "Confidence"]])).toBeUndefined();
    expect(boxes([["name", "", "Lesson"]])).toBeUndefined();
  });

  it("stores the ones that say something, trimmed", () => {
    expect(boxes([
      ["name", " Exercise ", "Drill"],
      ["date", "Date", "Date"],
      ["rating", "Score", "Accuracy"],
    ])).toEqual({ name: "Exercise", rating: "Score" });
  });

  it("carries a key this build has no box for", () => {
    // 3.20.1's lesson on `plural`, and a map is the shape most exposed to it:
    // rebuilt key by key from the boxes on screen, a role added in a later
    // release would be dropped by opening Settings and pressing Save.
    expect(cleanHeadings({ rating: "Score", someday: "Later" })).toEqual({
      rating: "Score",
      someday: "Later",
    });
    // And what says nothing is still dropped.
    expect(cleanHeadings({ rating: "  ", n: 4 })).toBeUndefined();
    expect(cleanHeadings(undefined)).toBeUndefined();
  });

  it("lists the four roles a column can have", () => {
    expect([...KIND_COLUMN_KEYS]).toEqual(["name", "date", "rating", "status"]);
  });
});

describe("where it is read and written", () => {
  it("is what the table draws its headings from", () => {
    const t = readSrc("tables");
    // `page` RATHER THAN `kind` SINCE 1.0.33, which is the merge of the journal's
    // answer with the host note's own — see `test/kind-tables.test.ts`. The claim
    // this line makes is unchanged: the table's headings come from `kindColumns`
    // and from nowhere else.
    expect(t).toContain("const cols = kindColumns(plugin, page);");
    expect(t).toContain("recordList(root, cols.map((c) => c.heading), true)");
    // And the cells come off the same list, so one cannot drift from the other.
    expect(t).toContain("for (const col of cols.slice(1)) {");
  });

  it("survives the config, the builder and a round trip through Settings", () => {
    // Three places a field like this is lost, and the third is the one that
    // actually happened to `plural` and to `variants`.
    expect(readSrc("custom-journal")).toContain("headings?: Record<string, string>;");
    expect(readSrc("journal")).toContain(
      "...(k.headings ? { headings: { ...k.headings } } : {})"
    );
    expect(readSrc("settings-editors")).toContain("cleanHeadings(row.headings)");
  });

  it("is edited where the kind's other identity is", () => {
    // Beside `Rated on`, which is the field that decides whether the rating
    // column exists at all — so a reader changing it watches that box appear.
    const t = readSrc("settings-editors");
    expect(t).toContain("kindColumns(this.plugin, kind)");
    expect(t).toContain("box.placeholder = col.fallback;");
    expect(t).toContain("packHeadings(");
  });
});
