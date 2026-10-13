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
  KIND_DATE_DEFAULTS,
  KIND_DATE_KEYS,
  STATUS_DATE_KEY,
  cleanDates,
  cleanHeadings,
  datesOf,
  headingOf,
  kindColumns,
  packDates,
  packHeadings,
  ratingNoun,
  stampStatusChange,
} from "../src/journals/kind-columns";
import type {
  KindColumnKey,
  KindDateKey,
} from "../src/journals/kind-columns";
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

const keys = (kind: Parameters<typeof kindColumns>[1]): string[] =>
  kindColumns(plugin(), kind).map((c) => c.key);

// 1.0.67 PUT A COLUMN ON EVERY TABLE, so the `what` columns of every assertion
// written before it now end in one more word. Spelling `Modified` into each of
// them would have pinned the default in eleven places; this names the ones that
// are about the kind's own facts and leaves the date half to its own describe.
const said = (kind: Parameters<typeof kindColumns>[1]): string[] => {
  const cols = kindColumns(plugin(), kind);
  const dates = KIND_DATE_KEYS as readonly string[];
  return cols.filter((c) => !dates.includes(c.key)).map((c) => c.heading);
};

// All three ticked on, for the assertions that are about the date columns.
const ALL_DATES = { created: true, modified: true, statusdate: true };

describe("what a kind's table calls its columns", () => {
  it("derives every one of them when the kind says nothing", () => {
    // Exactly what it drew before the field existed — which is the whole of the
    // migration story for journals that already exist: there isn't one.
    expect(said({ label: "Lesson", rating: "confidence" })).toEqual([
      "Lesson",
      "Confidence",
      "Status",
    ]);
  });

  it("drops the rating column where the kind is not rated", () => {
    // `kindTableProperties`' rule since it was written: *"its rating if it
    // declares one and nothing where it doesn't"*.
    expect(said({ label: "Cheatsheet" })).toEqual(["Cheatsheet", "Status"]);
  });

  it("lets the kind overrule any of them", () => {
    // THE ASK, in one assertion. `accuracy` is a registry tracker labelled
    // "Accuracy" and this table calls that column "Score" without the tracker
    // being renamed anywhere.
    expect(
      said({
        label: "Drill",
        rating: "accuracy",
        headings: { name: "Exercise", rating: "Score", status: "State" },
      })
    ).toEqual(["Exercise", "Score", "State"]);
  });

  it("keys the override by role, never by the tracker it reads", () => {
    // A kind re-rated from Confidence to Accuracy keeps the word its rating
    // column was given. Keyed by tracker id this would have silently reverted
    // and left a stale entry behind under the old id.
    const kind = { label: "Drill", rating: "confidence", headings: { rating: "Score" } };
    expect(words(kind)[1]).toBe("Score");
    expect(words({ ...kind, rating: "accuracy" })[1]).toBe("Score");
  });

  it("treats an empty box as the derived word, not as a blank heading", () => {
    // A reader who clears the box is asking for the default back. A column with
    // no heading over it is not a thing anyone wants and is what a naive
    // `?? fallback` would have shipped.
    expect(words({ label: "Lesson", headings: { name: "   " } })[0]).toBe(
      "Lesson"
    );
    expect(headingOf({ label: "x" }, "status", "Status")).toBe("Status");
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
    expect(words({ label: "Drill", rating: "recall_pct" })[1]).toBe("recall_pct");
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
      ["status", "State", "State"],
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

  it("lists the roles a column can have, in the order they are drawn", () => {
    // THE `what` COLUMNS, THEN THE THREE `when` ONES (1.0.67). The order is the
    // drawn order: a table reads left to right as the note's own facts and then
    // its history, and appending means a reader who ticks a date column on does
    // not watch their status column move.
    expect([...KIND_COLUMN_KEYS]).toEqual([
      "name",
      "rating",
      "status",
      "created",
      "modified",
      "statusdate",
    ]);
    // And the three a kind chooses are the tail of that list, not a second
    // vocabulary — the tick row in Settings reads this one.
    expect([...KIND_DATE_KEYS]).toEqual(["created", "modified", "statusdate"]);
    expect(KIND_COLUMN_KEYS.slice(3)).toEqual(KIND_DATE_KEYS);

    // AND `date` IS NOT ONE OF THEM, AS OF 1.0.68. It was the second key here
    // from the beginning. The property is untouched and still written on every
    // leaf — what left is the column, because `date:` is an ANCHOR the reader
    // moves (which diary day the note files under, which daily note a tracker
    // written from it lands in) rather than a fact about the note to report,
    // and beside `created` it read as a worse copy of one.
    expect([...KIND_COLUMN_KEYS]).not.toContain("date");
  });
});

// ── THE THREE DATE COLUMNS (1.0.67) ─────────────────────────────────────
//
// The reader's ask: *"the way date flags are used and updated should become
// clearer and more functional. I don't want to overcomplicate this aspect, so
// the variants should be created, modified, and status changed on. All three are
// tracked, and can be put into the column header of the kind."*
//
// The table could say what a note's status IS and had no way of saying how long
// it had been that way.
describe("the date columns a kind draws", () => {
  it("draws Modified and neither of the other two when the kind is silent", () => {
    // The reader's call: *"Modified by default"*. It is the one of the three
    // that needs no setting up — it reads the file, so it is right on a note
    // made before this release and on a note edited outside the plugin.
    expect(keys({ label: "Lesson", rating: "confidence" })).toEqual([
      "name",
      "rating",
      "status",
      "modified",
    ]);
  });

  it("adds exactly the column a tick asks for", () => {
    expect(keys({ label: "Lesson", dates: { created: true } })).toEqual([
      "name",
      "status",
      "created",
      "modified",
    ]);
    expect(keys({ label: "Lesson", dates: { statusdate: true } })).toEqual([
      "name",
      "status",
      "modified",
      "statusdate",
    ]);
    // And in `KIND_DATE_KEYS` order rather than the record's, so two kinds with
    // the same three ticks draw them the same way round.
    expect(
      keys({ label: "Lesson", dates: { statusdate: true, created: true } })
    ).toEqual(["name", "status", "created", "modified", "statusdate"]);
  });

  it("takes Modified away when the kind unticks it", () => {
    // THE CASE A LIST OF WHAT-IS-ON COULD NOT STORE. All three off is
    // `{ modified: false }` — present, and saying so — where a list would have
    // had to be `[]` and be indistinguishable from absent.
    expect(keys({ label: "Lesson", dates: { modified: false } })).toEqual([
      "name",
      "status",
    ]);
  });

  it("leaves the rating column's own presence rule alone", () => {
    // Two different reasons a column is absent, and they must not have become
    // one switch: `rating` is absent because the kind declares none, the dates
    // because the kind has not ticked them.
    expect(keys({ label: "Cheatsheet", dates: ALL_DATES })).not.toContain(
      "rating"
    );
    expect(
      keys({ label: "Drill", rating: "accuracy", dates: ALL_DATES })
    ).toContain("rating");
  });

  it("derives the three words, and reads the status one off its tracker", () => {
    const all = kindColumns(plugin(), { label: "Lesson", dates: ALL_DATES });
    const word = (k: string): string =>
      all.find((c) => c.key === k)?.heading ?? "";
    expect(word("created")).toBe("Created");
    expect(word("modified")).toBe("Modified");
    // "Status changed" — OFF THE STATUS TRACKER'S OWN LABEL. The fixture's
    // status built-in is keyed `state` and labelled "📌 Status", so a literal
    // here would be indistinguishable from the derivation; the next assertion
    // is the one that tells them apart.
    expect(word("statusdate")).toBe("Status changed");
  });

  it("follows a renamed status tracker into the statusdate column", () => {
    // 1.0.32's whole reason for keying a column by its role: rename the tracker
    // and every word derived from it moves, including this one.
    const renamed = {
      settings: {
        trackers: [{ id: "state", label: "📌 State", builtin: "status" }],
      },
    } as unknown as ChronoAnvilPlugin;
    const col = kindColumns(renamed, {
      label: "Lesson",
      dates: { statusdate: true },
    }).find((c) => c.key === "statusdate");
    expect(col?.heading).toBe("State changed");
    // And its property is the stamp's key, not the tracker's — the date lives
    // beside the status, it is not a second spelling of it.
    expect(col?.property).toBe(STATUS_DATE_KEY);
    expect(col?.property).not.toBe("state");
  });

  it("lets the kind overrule each of the three", () => {
    const given = kindColumns(plugin(), {
      label: "Lesson",
      dates: ALL_DATES,
      headings: { created: "Written", modified: "Edited", statusdate: "Moved" },
    });
    expect(given.map((c) => c.heading).slice(-3)).toEqual([
      "Written",
      "Edited",
      "Moved",
    ]);
  });

  it("reads no frontmatter key for Modified, and the right one for the others", () => {
    const all = kindColumns(plugin(), { label: "Lesson", dates: ALL_DATES });
    const prop = (k: string): string =>
      all.find((c) => c.key === k)?.property ?? "MISSING";
    expect(prop("created")).toBe("created");
    // EMPTY, which is already `name`'s meaning here: this column reads the file
    // rather than the frontmatter. There is no `modified:` key in any vault and
    // this round deliberately does not make one.
    expect(prop("modified")).toBe("");
    expect(prop("statusdate")).toBe(STATUS_DATE_KEY);
    expect(STATUS_DATE_KEY).toBe("statusdate");
    // One lowercase word, which is this plugin's rule for a property it writes.
    expect(STATUS_DATE_KEY).toMatch(/^[a-z]+$/);
  });

  it("applies the default through datesOf and nowhere else", () => {
    // The field's shape invites exactly one mistake: reading
    // `kind.dates?.modified` directly gets `undefined` for the common case and
    // reads it as off.
    expect(datesOf({ label: "x" })).toEqual(KIND_DATE_DEFAULTS);
    expect(datesOf({ label: "x", dates: { modified: false } })).toEqual({
      created: false,
      modified: false,
      statusdate: false,
    });
    expect(datesOf({ label: "x", dates: { created: true } }).created).toBe(true);
    // A non-boolean in the record is not an answer — a property editor or an
    // older build can leave anything there.
    expect(
      datesOf({ label: "x", dates: { modified: "no" } as never }).modified
    ).toBe(true);
  });
});

describe("what the ticks store", () => {
  const ticks = (over: Partial<Record<KindDateKey, boolean>>) =>
    packDates({ ...KIND_DATE_DEFAULTS, ...over });

  it("stores nothing when the kind wants what every kind wants", () => {
    // `packHeadings`' rule on a boolean: the common case leaves no record, so
    // `settings.json` does not grow three keys per note type to say "as
    // expected".
    expect(ticks({})).toBeUndefined();
  });

  it("stores only what departs from the default", () => {
    expect(ticks({ created: true })).toEqual({ created: true });
    expect(ticks({ modified: false })).toEqual({ modified: false });
    expect(ticks({ created: true, modified: false, statusdate: true })).toEqual({
      created: true,
      modified: false,
      statusdate: true,
    });
  });

  it("has no empty case, which is why it is a record and not a list", () => {
    // All three off is a PRESENT record saying so. A list would have had to be
    // `[]`, and `[]` and absent are the same value through a JSON round trip —
    // with a non-empty default they have to mean opposite things.
    expect(ticks({ created: false, modified: false, statusdate: false })).toEqual({
      modified: false,
    });
    expect(ticks({ modified: false })).not.toBeUndefined();
  });

  it("carries a key this build has no tick for", () => {
    // 3.20.1's lesson again, and a fourth date column added later would be in
    // exactly `plural`'s position for one release.
    expect(cleanDates({ created: true, someday: false })).toEqual({
      created: true,
      someday: false,
    });
    expect(cleanDates({ created: "yes" })).toBeUndefined();
    expect(cleanDates(undefined)).toBeUndefined();
    expect(cleanDates({})).toBeUndefined();
  });
});

describe("the status stamp", () => {
  const NOW = "2026-10-13T09:15:00";

  it("stamps the date when the status moves", () => {
    const fm: Record<string, unknown> = { state: "completed" };
    stampStatusChange(fm, "state", "state", "in-progress", NOW);
    expect(fm[STATUS_DATE_KEY]).toBe(NOW);
  });

  it("does NOT stamp when the status is the one it already was", () => {
    // THE DEFECT NOBODY WOULD SEE. A reader who opens the dropdown, looks, and
    // picks what was already there has changed nothing, and a table saying
    // otherwise is worse than one saying nothing. This is the no-op-write rule
    // — *"a processFrontMatter that leaves a file identical still moves its
    // modified time, which is a lie about the reader's vault that sync then
    // propagates"* — applied one level in.
    const fm: Record<string, unknown> = {
      state: "in-progress",
      [STATUS_DATE_KEY]: "2026-01-01T00:00:00",
    };
    stampStatusChange(fm, "state", "state", "in-progress", NOW);
    expect(fm[STATUS_DATE_KEY]).toBe("2026-01-01T00:00:00");
  });

  it("reads a hand-typed value the same as a picked one", () => {
    // `isCompletedStatus`' argument: *"`status` is a property a reader can type
    // by hand as easily as pick from the dropdown"*, so the stored value may be
    // anything YAML made of it.
    const fm: Record<string, unknown> = { state: " in-progress " };
    stampStatusChange(fm, "state", "state", "in-progress", NOW);
    expect(fm[STATUS_DATE_KEY]).toBeUndefined();
  });

  it("stamps nothing for any other property", () => {
    // THE FIXTURE CARRIES A STATUS, which is the whole of what makes this bite.
    // Written without one, dropping the property guard made the function read
    // an absent status, call it a change to nothing, and DELETE a key that was
    // already absent — so the assertion passed on a mutant that stamps every
    // write in the vault. `vacuous-sweep-rule`: a fixture whose two answers
    // coincide proves nothing.
    const fm: Record<string, unknown> = { state: "in-progress", confidence: 1 };
    stampStatusChange(fm, "confidence", "state", 4, NOW);
    expect(fm[STATUS_DATE_KEY]).toBeUndefined();
    // Including the one whose NAME contains the status property's — `state` and
    // `statealike` are the prefix trap, and `statusdate` is its sharpest
    // instance in this round.
    const near: Record<string, unknown> = { state: "in-progress", statealike: "y" };
    stampStatusChange(near, "statealike", "state", "x", NOW);
    expect(near[STATUS_DATE_KEY]).toBeUndefined();
  });

  it("clears the date when the status is taken away", () => {
    // "No status" has no date to report — `pruneProperties`' reading of an
    // emptied tracker property — and leaving the old stamp would date a status
    // the note no longer has.
    for (const gone of [undefined, "", null]) {
      const fm: Record<string, unknown> = {
        [STATUS_DATE_KEY]: "2026-01-01T00:00:00",
      };
      if (gone !== undefined) fm["state"] = gone;
      stampStatusChange(fm, "state", "state", "in-progress", NOW);
      expect(fm[STATUS_DATE_KEY]).toBeUndefined();
    }
  });

  it("stamps a status appearing on a note that had none", () => {
    const fm: Record<string, unknown> = { state: "in-progress" };
    stampStatusChange(fm, "state", "state", undefined, NOW);
    expect(fm[STATUS_DATE_KEY]).toBe(NOW);
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

  it("carries the date ticks through the same three places (1.0.67)", () => {
    expect(readSrc("custom-journal")).toContain("dates?: Record<string, boolean>;");
    expect(readSrc("journal")).toContain(
      "...(k.dates ? { dates: { ...k.dates } } : {})"
    );
    expect(readSrc("settings-editors")).toContain("cleanDates(row.dates)");
  });

  it("ticks the date columns ABOVE the boxes they summon (1.0.67)", () => {
    // THE ORDER IS THE CONTROL. This row decides which columns exist and the
    // one below names them, so a reader ticking `Created` watches its box appear
    // underneath — `Rated on`'s own gesture, which this file's 1.0.32 test
    // asserts one case up. Below the boxes it would be a control whose effect
    // happened above it.
    const t = readSrc("settings-editors");
    const ticks = t.indexOf("ca-kind-dates");
    const boxes = t.indexOf("ca-kind-cols-boxes");
    expect(ticks).toBeGreaterThan(-1);
    expect(boxes).toBeGreaterThan(-1);
    expect(ticks).toBeLessThan(boxes);
    expect(t).toContain("kind.dates = packDates(ticks);");
    // AND THE TICK LABELS COME OUT OF `kindColumns`, NOT A LIST IN THAT FILE. A
    // column that is off draws no column object, so the words are read from a
    // probe with all three on — the only way a tick can carry the same word as
    // the box it will summon. A second table of nouns there is how the
    // Confidence heading came to live in four places.
    expect(t).toContain("dates: { created: true, modified: true, statusdate: true },");
    expect(t).not.toContain('text: "Status changed"');
  });

  it("stamps the status in the transaction that moves it (1.0.67)", () => {
    // ONE TRANSACTION, which is `recomputeSleepInFrontmatter`'s arrangement and
    // the reason this is not a second write: the value and its date cannot be
    // read half-written or lag a cache pass.
    const w = readSrc("ui/widgets/index.ts");
    const write = w.slice(w.indexOf("  async write("));
    expect(write).toContain("const before = fm[prop];");
    expect(write).toContain("stampStatusChange(fm, prop, statusId, before, now);");
    // THE ID OFF THE REGISTRY, never the literal: the built-in is re-keyable,
    // and every other reader of it resolves it this way.
    expect(write).toContain(
      'getBuiltinTracker(this.plugin, "status")?.id ?? "status"'
    );
    // AND THE SECOND CHANNEL. The generic Properties window can set or clear any
    // key, the status among them, and a status changed there is still a status
    // changed. Both callers ask the same function, so the two cannot drift.
    const p = readSrc("ui/properties.ts");
    expect(p).toContain("stampStatusChange(fm, key, statusId, before, now);");
    expect(p.match(/stampStatusChange\(/g)).toHaveLength(2);
  });
});
