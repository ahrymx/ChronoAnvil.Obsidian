// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Habits window (1.0.49): the cell got a door, a count of what it was
// hiding, and the same editor the Tags cell has.
//
// WHAT IS WORTH ASSERTING HERE is the arithmetic, which is why `habits.ts`
// holds no DOM: what a habit reading MEANS (and in particular that unset is
// not zero), which habits a note may carry, and what a Save actually writes
// given a draft. The window and the cell are then source-shape assertions,
// as this suite works.

import { describe, it, expect } from "vitest";
import { App, TFile } from "obsidian";
import {
  HABIT_TYPES,
  addHabitRow,
  describeHabitState,
  habitLabelOf,
  habitRowState,
  habitWeek,
  habitWeekReadings,
  habitWrites,
  habitsForSurface,
  habitsInFolder,
  habitsOnNote,
  hasHabit,
  isHabitType,
  newHabitDef,
  nextHabitState,
  noteHasHabitsSection,
  normaliseHabitLabel,
  readHabitState,
  removeHabitRow,
  setHabitReading,
  type HabitDraft,
  type HabitRow,
} from "../src/trackers/habits";
import { planDirectiveEdits } from "../src/trackers/entry-trackers";
import {
  SPARK_FLOOR,
  habitsDoorLabel,
  sparkFraction,
  sparkHeight,
} from "../src/ui/widgets/habits-section";
import {
  boundsNote,
  readingText,
  stepReading,
} from "../src/ui/habit-reading-window";
import { monthGrid } from "../src/diary/diary-link";
import { entryPath } from "../src/diary/lineage";
import { DEFAULT_PATHS } from "../src/core/constants";
import { moment } from "../src/core/util";
import { NOT_PAGE_WIDGETS, isPageWidget } from "../src/core/widget-registry";
import {
  ENTRY_SECTIONS,
  addSectionToNote,
  applyEntrySections,
  composeEntryTemplate,
  detectEntrySections,
  entrySectionModel,
} from "../src/diary/entry-sections";
import {
  TRACKER_CLASSES,
  TRACKER_TYPE_LABELS,
  anySurface,
  diarySurface,
  journalSurface,
  normalizeTrackers,
  type TrackerDef,
} from "../src/trackers/trackers";
import { readCode, readSrc, readCss, cssRule, cssRules } from "./sources";

// A habit definition, as the registry holds one.
const habit = (id: string, over: Partial<TrackerDef> = {}): TrackerDef => ({
  id,
  label: id,
  type: "boolean",
  surface: diarySurface("daily"),
  showInTemplate: false,
  showInBase: true,
  ...over,
});

// A boolean habit's draft row. `reading` rather than `state` since 1.0.56 —
// one field for both types, because `HabitState` is already a `number | null`.
const row = (id: string, reading: number | null = null): HabitRow => ({
  id,
  directive: `tracker:${id}`,
  label: id,
  type: "boolean",
  reading,
});

// A number habit's draft row, which travels the same channel.
const numRow = (id: string, reading: number | null = null): HabitRow => ({
  id,
  directive: `tracker:${id}`,
  label: id,
  type: "number",
  reading,
});

const draftOf = (rows: HabitRow[], over: Partial<HabitDraft> = {}): HabitDraft => ({
  rows,
  renamed: {},
  created: [],
  ...over,
});

// ── what a reading means ──────────────────────────────────────────────────

describe("readHabitState", () => {
  it("tells a habit nobody answered from one answered no", () => {
    // THE WHOLE REASON THIS IS NOT A BOOLEAN. A streak counts runs of 1, the
    // completion summary divides by the days that were ANSWERED, and Diary.base
    // shows an empty cell rather than a tidy zero. Collapsing unset into 0
    // would make every untouched day a broken streak.
    expect(readHabitState(undefined)).toBe(null);
    expect(readHabitState(null)).toBe(null);
    expect(readHabitState("")).toBe(null);
    expect(readHabitState(0)).toBe(0);
  });

  it("reads the three shapes a vault actually holds", () => {
    // ChronoAnvil's own checkbox writes 1 and 0; a reader who ticked the
    // property in Obsidian's panel wrote `true`; an import may have written a
    // string. All of them are what that entry means.
    expect(readHabitState(1)).toBe(1);
    expect(readHabitState(true)).toBe(1);
    expect(readHabitState(false)).toBe(0);
    expect(readHabitState("1")).toBe(1);
    expect(readHabitState("0")).toBe(0);
  });

  it("refuses to invent a reading out of prose", () => {
    expect(readHabitState("yes")).toBe(null);
    expect(readHabitState({})).toBe(null);
  });

  it("rounds the way the chip does", () => {
    // `wireHabit`'s own threshold, so the window and the chip cannot disagree
    // about a value neither of them wrote.
    expect(readHabitState(0.5)).toBe(1);
    expect(readHabitState(0.49)).toBe(0);
  });
});

describe("nextHabitState", () => {
  it("cycles unset → done → not-done → unset", () => {
    expect(nextHabitState(null)).toBe(1);
    expect(nextHabitState(1)).toBe(0);
    expect(nextHabitState(0)).toBe(null);
    // Three presses come back to where they started, which is what makes the
    // box safe to poke: there is no state you cannot get out of.
    expect(nextHabitState(nextHabitState(nextHabitState(null)))).toBe(null);
  });

  it("names each state for somebody who cannot see the box", () => {
    expect(describeHabitState(1)).toBe("done");
    expect(describeHabitState(0)).toBe("not done");
    expect(describeHabitState(null)).toBe("unset");
  });
});

// ── which habits a note may carry ─────────────────────────────────────────

describe("habitsForSurface", () => {
  const registry: TrackerDef[] = [
    habit("Medication"),
    habit("Exercise"),
    habit("Monthly", { surface: diarySurface("monthly") }),
    habit("Anywhere", { surface: anySurface() }),
    habit("Study", { surface: journalSurface("study") }),
    habit("Computed", { derived: true }),
    { ...habit("Mood"), type: "scale" },
    { ...habit("Steps"), type: "number" },
    { ...habit("Tags"), type: "tags" },
    { ...habit("Clock"), type: "time" },
    { ...habit("Day"), type: "date" },
    { ...habit("Pick"), type: "select" },
  ];

  it("is boolean AND number trackers, and nothing else", () => {
    // THE 1.0.56 WIDENING, AND THE FIVE REFUSALS ARE THE POINT. The reader
    // moved the word — *"Habits can be either boolean or number trackers"* —
    // and a test that only asserted the two admitted would pass on a predicate
    // that admitted all seven. `scale` is named first because it was OFFERED
    // and withdrawn (*"I changed my mind on emoji scale"*), so it is the one a
    // later round is most likely to let back in by accident.
    const ids = habitsForSurface(registry, null).map((t) => t.id);
    expect(ids).toContain("Steps");
    expect(ids).toContain("Medication");
    expect(ids).not.toContain("Mood");
    expect(ids).not.toContain("Tags");
    expect(ids).not.toContain("Clock");
    expect(ids).not.toContain("Day");
    expect(ids).not.toContain("Pick");
  });

  it("names the two types once, so nothing counts them by hand", () => {
    expect([...HABIT_TYPES]).toEqual(["boolean", "number"]);
    expect(isHabitType("boolean")).toBe(true);
    expect(isHabitType("number")).toBe(true);
    for (const t of ["scale", "time", "date", "select", "tags"] as const) {
      expect(isHabitType(t)).toBe(false);
    }
  });

  it("leaves out a derived one, which has nothing to tick", () => {
    expect(habitsForSurface(registry, null).map((t) => t.id)).not.toContain(
      "Computed"
    );
  });

  it("offers a daily note what a daily note may log", () => {
    const ids = habitsForSurface(registry, diarySurface("daily")).map((t) => t.id);
    expect(ids).toEqual(["Medication", "Exercise", "Anywhere", "Steps"]);
    // A window that offered a monthly habit on a Tuesday would watch its own
    // add fail `directiveAllowedOn` afterwards.
    expect(ids).not.toContain("Monthly");
    expect(ids).not.toContain("Study");
  });

  it("refuses nothing on a note whose surface could not be resolved", () => {
    // `directiveAllowedOn`'s answer to the same question: a null surface is
    // "we don't know", and we don't refuse on that.
    expect(habitsForSurface(registry, null).map((t) => t.id)).toEqual([
      "Medication",
      "Exercise",
      "Monthly",
      "Anywhere",
      "Study",
      "Steps",
    ]);
  });
});

// ── the folder survey ─────────────────────────────────────────────────────

describe("habitsInFolder", () => {
  // A vault as `pagesUnder` sees one: markdown paths, each with frontmatter.
  const vaultOf = (notes: Record<string, Record<string, unknown>>): App => {
    const files = Object.keys(notes).map((p) => new TFile(p));
    return {
      vault: { getMarkdownFiles: (): TFile[] => files },
      metadataCache: {
        getFileCache: (f: TFile) => ({ frontmatter: notes[f.path] }),
      },
    } as unknown as App;
  };

  const WEEK = "02 - Diary/Week-2026-W41";
  const app = vaultOf({
    [`${WEEK}/Day-1.md`]: { Medication: 1, Exercise: 1 },
    [`${WEEK}/Day-2.md`]: { Medication: 1, Exercise: 0 },
    [`${WEEK}/Day-3.md`]: { Medication: true, Stretch: "" },
    "02 - Diary/Week-2026-W40/Day-9.md": { Exercise: 1, Stretch: 1 },
  });
  const habits = [habit("Medication"), habit("Exercise"), habit("Stretch")];

  it("counts the entries that answered YES, not the ones carrying the key", () => {
    // A habit seeded blank onto thirty entries is not a habit used thirty
    // times, and a number beside a pill has to mean something.
    const by = new Map(
      habitsInFolder(app, habits, WEEK).map((u) => [u.id, u.count])
    );
    expect(by.get("Medication")).toBe(3); // 1, 1, true
    expect(by.get("Exercise")).toBe(1); // the 0 does not count
    expect(by.get("Stretch")).toBe(0); // present and empty
  });

  it("is scoped to the folder, which is the point", () => {
    // Last week's Stretch is not this week's list. Same rule and same reason
    // as `tagsInFolder`: the useful list when logging a Tuesday is what the
    // rest of the week already tracks.
    const week = habitsInFolder(app, habits, WEEK).find((u) => u.id === "Stretch");
    expect(week?.count).toBe(0);
    const all = habitsInFolder(app, habits, "02 - Diary").find(
      (u) => u.id === "Stretch"
    );
    expect(all?.count).toBe(1);
  });

  it("puts the most-kept first and breaks a tie by name", () => {
    const order = habitsInFolder(app, habits, WEEK).map((u) => u.id);
    expect(order).toEqual(["Medication", "Exercise", "Stretch"]);
  });

  it("offers every habit, including one nobody has logged", () => {
    // Unlike the tags cloud, which can only show what a note already wrote:
    // the registry is the list, so a habit defined and never kept is still
    // one press away rather than invisible until its first tick.
    expect(habitsInFolder(app, habits, WEEK)).toHaveLength(3);
  });
});

// ── a typed name ──────────────────────────────────────────────────────────

describe("normaliseHabitLabel", () => {
  it("keeps prose, because a habit's name is prose", () => {
    // Looser than `normaliseTag` on purpose: this is a label in a pill, not an
    // Obsidian tag, so spaces and punctuation survive.
    expect(normaliseHabitLabel("  Morning meds ")).toBe("Morning meds");
    expect(normaliseHabitLabel("10k steps")).toBe("10k steps");
    expect(normaliseHabitLabel("Read   20 pages")).toBe("Read 20 pages");
  });

  it("refuses only a name with no property in it", () => {
    // The one real failure: a label `propertyNameFromLabel` renders as "" would
    // make a tracker with an empty id.
    expect(normaliseHabitLabel("")).toBe(null);
    expect(normaliseHabitLabel("   ")).toBe(null);
    expect(normaliseHabitLabel("✅ ✅")).toBe(null);
    expect(normaliseHabitLabel("✅ Meds")).toBe("✅ Meds");
  });
});

describe("newHabitDef", () => {
  it("is a boolean on the note's own surface", () => {
    const def = newHabitDef("Morning meds", [], diarySurface("weekly"));
    expect(def?.type).toBe("boolean");
    expect(def?.label).toBe("Morning meds");
    expect(def?.id).toBe("MorningMeds");
    expect(def?.surface).toEqual(diarySurface("weekly"));
  });

  it("starts off the template and on in Diary.base", () => {
    // `seedTrackerFor`'s two decisions, unchanged: naming a habit on today's
    // entry is not a claim about every entry, and an occasional tracker is
    // still worth a column.
    const def = newHabitDef("Stretch", [], diarySurface("daily"));
    expect(def?.showInTemplate).toBe(false);
    expect(def?.showInBase).toBe(true);
  });

  it("has no Diary.base column on a journal surface", () => {
    // Diary.base holds diary entries; a journal tracker's column would be
    // blank in every row by construction.
    const def = newHabitDef("Warm-up", [], journalSurface("study"));
    expect(def?.showInBase).toBe(false);
  });

  it("cannot be handed a property name already in use", () => {
    expect(newHabitDef("Stretch", ["Stretch"], null)?.id).toBe("Stretch2");
    // AND TWO TYPED IN ONE SITTING CANNOT COLLIDE, which is why `taken` is a
    // parameter rather than read off the plugin: the second call is told what
    // the first claimed.
    const first = newHabitDef("Stretch", ["Stretch"], null);
    const second = newHabitDef("Stretch", ["Stretch", first!.id], null);
    expect(second?.id).toBe("Stretch3");
  });

  it("defaults to a daily surface rather than refusing", () => {
    expect(newHabitDef("Stretch", [], null)?.surface).toEqual(
      diarySurface("daily")
    );
  });

  it("is a definition the registry accepts unchanged", () => {
    // `normalizeTrackers` is what load and the settings tab run over every
    // definition, so a habit made here has to survive it — otherwise the
    // window creates one thing and the vault stores another.
    const def = newHabitDef("Morning meds", [], diarySurface("daily"))!;
    const stored = normalizeTrackers([def], false).find((t) => t.id === def.id);
    expect(stored).toBeTruthy();
    expect(stored?.type).toBe("boolean");
    expect(stored?.label).toBe("Morning meds");
  });

  it("returns null for a name it could not make a property out of", () => {
    expect(newHabitDef("  ", [], null)).toBe(null);
  });

  // ── THE SHAPE PARAMETER (1.0.56), which is the window picker's answer ──

  it("takes its type from the shape it was handed", () => {
    // The default stays boolean, which is what every caller that passes no
    // shape means — and is why widening this function did not touch them.
    expect(
      newHabitDef("Pages", [], diarySurface("daily"), { type: "number" })?.type
    ).toBe("number");
    expect(newHabitDef("Pages", [], diarySurface("daily"))?.type).toBe("boolean");
  });

  it("carries a number's bounds and unit where they were answered", () => {
    const def = newHabitDef("Run", [], diarySurface("daily"), {
      type: "number",
      min: 0,
      max: 42,
      unit: "km",
    });
    // ZERO IS AN ANSWER. The guard is `!= null`, not truthiness, because a
    // habit that runs from 0 is the ordinary case for anything counted.
    expect(def?.min).toBe(0);
    expect(def?.max).toBe(42);
    expect(def?.unit).toBe("km");
  });

  it("omits the keys the reader left blank rather than nulling them", () => {
    // `min: null` is a BOUND OF NULL once this round-trips through data.json,
    // and `buildStepper` clamps against whatever it finds. An unanswered
    // bound has to be an absent key.
    const def = newHabitDef("Pages", [], diarySurface("daily"), {
      type: "number",
      min: null,
      max: null,
      unit: null,
    })!;
    expect("min" in def).toBe(false);
    expect("max" in def).toBe(false);
    expect("unit" in def).toBe(false);
    // And the registry takes it unchanged, boundless: this is the blank-range
    // number the add box is expected to produce most of the time.
    const stored = normalizeTrackers([def], false).find((t) => t.id === def.id);
    expect(stored?.type).toBe("number");
    expect(stored?.min).toBe(undefined);
  });

  it("never carries bounds onto a boolean, whatever it is handed", () => {
    const def = newHabitDef("Stretch", [], diarySurface("daily"), {
      type: "boolean",
      min: 0,
      max: 10,
      unit: "km",
    })!;
    expect(def.type).toBe("boolean");
    expect("min" in def).toBe(false);
    expect("max" in def).toBe(false);
    expect("unit" in def).toBe(false);
  });

  it("decides a number's Diary.base column the same way a boolean's is", () => {
    // `showInBase` follows `diaryClassOf` and knows nothing about the type.
    const shape = { type: "number" } as const;
    expect(
      newHabitDef("Pages", [], diarySurface("daily"), shape)?.showInBase
    ).toBe(true);
    expect(
      newHabitDef("Pages", [], journalSurface("study"), shape)?.showInBase
    ).toBe(false);
    expect(
      newHabitDef("Pages", [], diarySurface("daily"), shape)?.showInTemplate
    ).toBe(false);
  });

  it("gives a second number habit its own property name", () => {
    // `taken` is type-blind, and must be: a number named Read and a boolean
    // named Read would otherwise write the same frontmatter key.
    const first = newHabitDef("Read", [], diarySurface("daily"), {
      type: "number",
    })!;
    const second = newHabitDef("Read", [first.id], diarySurface("daily"), {
      type: "number",
    })!;
    expect(second.id).toBe("Read2");
  });
});

// ── the draft ─────────────────────────────────────────────────────────────

describe("the draft's three edits", () => {
  it("adds once, like addTag", () => {
    const rows = addHabitRow([row("A")], row("B"));
    expect(rows.map((r) => r.id)).toEqual(["A", "B"]);
    expect(addHabitRow(rows, row("B")).map((r) => r.id)).toEqual(["A", "B"]);
  });

  it("leaves a habit it already has exactly where it is, reading and all", () => {
    // The cloud's pill and the add field both go through `addHabitRow`, so a
    // habit re-added must not lose the tick it is carrying.
    const rows = addHabitRow([row("A", 1)], row("A"));
    expect(rows).toEqual([row("A", 1)]);
  });

  it("removes, and reports membership", () => {
    expect(hasHabit([row("A")], "A")).toBe(true);
    expect(hasHabit([row("A")], "B")).toBe(false);
    expect(removeHabitRow([row("A"), row("B")], "A").map((r) => r.id)).toEqual([
      "B",
    ]);
    expect(removeHabitRow([row("A")], "nope").map((r) => r.id)).toEqual(["A"]);
  });

  it("sets a reading without moving the row", () => {
    const rows = setHabitReading([row("A"), row("B"), row("C")], "B", 1);
    expect(rows.map((r) => r.id)).toEqual(["A", "B", "C"]);
    expect(rows[1].reading).toBe(1);
  });

  it("takes a number, not a state — one channel for both types", () => {
    // THE 1.0.56 SIGNATURE. A `HabitState` parameter would have typed out the
    // stepper entirely: `setHabitReading(rows, "B", 4.2)` has to compile, and a
    // test that only set 1/0/null would pass against the narrower signature.
    const rows = setHabitReading([numRow("A"), numRow("B")], "B", 4.2);
    expect(rows[1].reading).toBe(4.2);
    // And a boolean row narrows back through the same forgiving parse.
    expect(habitRowState(row("A", 1))).toBe(1);
    expect(habitRowState(row("A", 0))).toBe(0);
    expect(habitRowState(row("A", null))).toBeNull();
    // A reading no boolean wrote still reads as a state rather than throwing —
    // `readHabitState`'s own >= 0.5 rule, which is what makes the shared field
    // safe when a tracker's type is changed in Settings under a draft.
    expect(habitRowState(numRow("A", 4.2))).toBe(1);
  });

  it("returns new lists, so Cancel is free", () => {
    const before = [row("A")];
    addHabitRow(before, row("B"));
    removeHabitRow(before, "A");
    setHabitReading(before, "A", 1);
    expect(before).toEqual([row("A")]);
  });
});

// ── what Save writes ──────────────────────────────────────────────────────

describe("habitWrites", () => {
  it("is the difference, not a journal of the keystrokes", () => {
    const before = [row("A", 1), row("B")];
    const writes = habitWrites(before, draftOf([row("A", 1), row("C")]));
    expect(writes.add).toEqual(["tracker:C"]);
    expect(writes.remove).toEqual(["tracker:B"]);
    // A reading that did not change is not written: `A` was done and still is.
    expect(writes.values).toEqual([]);
  });

  it("writes a reading only where it moved", () => {
    const before = [row("A", null), row("B", 1)];
    const writes = habitWrites(before, draftOf([row("A", 1), row("B", 1)]));
    expect(writes.values).toEqual([["A", 1]]);
  });

  it("writes null for a habit cycled back to unset, which DELETES the key", () => {
    // The `tagsValue` argument applied to one property: an entry that gained a
    // tick and lost it again should read exactly as it did before anyone
    // answered it, not carry an empty key the panel then offers to fill in.
    const writes = habitWrites([row("A", 1)], draftOf([row("A", null)]));
    expect(writes.values).toEqual([["A", null]]);
  });

  it("writes nothing at all for a tick cycled back to where it started", () => {
    const before = [row("A", 0)];
    expect(habitWrites(before, draftOf([row("A", 0)]))).toEqual({
      add: [],
      remove: [],
      values: [],
    });
  });

  it("does not write a reading for a habit that arrived unset", () => {
    // A habit added and not ticked has nothing to log — `applyDirectiveEdits`
    // seeds its property blank, exactly as "+ Add tracker" does, and a null
    // written over that would delete the key it just declared.
    const writes = habitWrites([], draftOf([row("A")]));
    expect(writes.add).toEqual(["tracker:A"]);
    expect(writes.values).toEqual([]);
  });

  it("writes the reading of a habit that arrived ticked", () => {
    const writes = habitWrites([], draftOf([row("A", 1)]));
    expect(writes.add).toEqual(["tracker:A"]);
    expect(writes.values).toEqual([["A", 1]]);
  });

  it("removes the note's own line, not one rebuilt from the id", () => {
    // A hand-written `tracker:Medication|Morning meds` is still that habit's
    // line, and a remove that guessed `tracker:Medication` would hand the write
    // a string the note does not contain.
    const before: HabitRow[] = [
      {
        id: "Med",
        directive: "tracker:Med|Morning meds",
        label: "Med",
        type: "boolean",
        reading: 1,
      },
    ];
    expect(habitWrites(before, draftOf([])).remove).toEqual([
      "tracker:Med|Morning meds",
    ]);
  });

  // ── A NUMBER ROW (1.0.56), down the same `values` channel ─────────────

  it("writes a number reading where it moved", () => {
    // `HabitWrites.values` was `[string, number | null][]` before numbers
    // existed, which is why widening the window needed no new write channel:
    // only the field the row's value is read from changed.
    const writes = habitWrites([numRow("Pages", 20)], draftOf([numRow("Pages", 34)]));
    expect(writes.values).toEqual([["Pages", 34]]);
    expect(writes.add).toEqual([]);
    expect(writes.remove).toEqual([]);
  });

  it("writes a number cycled back to its old reading not at all", () => {
    // THE CANCELLING PAIR, which is what makes Cancel free, asserted for a
    // number: stepping 20 → 21 → 20 is not three writes, it is none.
    expect(
      habitWrites([numRow("Pages", 20)], draftOf([numRow("Pages", 20)]))
    ).toEqual({ add: [], remove: [], values: [] });
  });

  it("writes a zero reading, and does not mistake it for unset", () => {
    // A number logged at 0 is ANSWERED — nought pages read today — and the
    // key has to land, or the strip draws a gap where a reader put a number.
    const writes = habitWrites([numRow("Pages", null)], draftOf([numRow("Pages", 0)]));
    expect(writes.values).toEqual([["Pages", 0]]);
  });

  it("writes null for a number cleared back to unset", () => {
    const writes = habitWrites([numRow("Pages", 7)], draftOf([numRow("Pages", null)]));
    expect(writes.values).toEqual([["Pages", null]]);
  });

  it("adds a number habit with no reading, exactly as a boolean", () => {
    // A number defined in the add box and not stepped has nothing to log:
    // `applyDirectiveEdits` seeds the property blank, and a null over that
    // would delete the key it just declared.
    const writes = habitWrites([], draftOf([numRow("Pages")]));
    expect(writes.add).toEqual(["tracker:Pages"]);
    expect(writes.values).toEqual([]);
  });

  it("asks for no reading on a habit it is removing", () => {
    // Its property is the prune's business (a logged value is KEPT and
    // reported), so the value list must not reach for it.
    const writes = habitWrites([row("A", 1)], draftOf([]));
    expect(writes.values).toEqual([]);
  });
});

// ── one note write for the batch ──────────────────────────────────────────

describe("planDirectiveEdits", () => {
  const NOTE = [
    "---",
    "type: daily",
    "---",
    "",
    "```chronoanvil",
    "header:Trackers",
    "tracker:Mood",
    "tracker:Medication",
    "```",
    "",
  ];

  it("applies a whole batch over one array", () => {
    const out = planDirectiveEdits(NOTE, {
      add: ["tracker:Exercise", "tracker:Stretch"],
      remove: ["tracker:Medication"],
    });
    expect(out.added).toEqual(["tracker:Exercise", "tracker:Stretch"]);
    expect(out.removed).toEqual(["tracker:Medication"]);
    const text = out.lines.join("\n");
    expect(text).toContain("tracker:Exercise");
    expect(text).toContain("tracker:Stretch");
    expect(text).not.toContain("tracker:Medication");
    // The one that was not mentioned is untouched.
    expect(text).toContain("tracker:Mood");
  });

  it("reports what MOVED, not what was asked for", () => {
    const out = planDirectiveEdits(NOTE, {
      // Already there, and never there.
      add: ["tracker:Mood"],
      remove: ["tracker:Nothing"],
    });
    expect(out.added).toEqual([]);
    expect(out.removed).toEqual([]);
    expect(out.lines.join("\n")).toBe(NOTE.join("\n"));
  });

  it("cancels a directive that is on both lists", () => {
    // THE DEFECT THIS GUARDS. A reader who unticks a habit and then picks it
    // straight back out of the cloud hands this the same string twice.
    // Honouring both leaves the note's text as it was — so nothing is written —
    // while the report claims the habit arrived and left, and the housekeeping
    // then seeds its property blank and prunes the blank it just seeded. The
    // habit would still be on the entry with its reading deleted.
    const out = planDirectiveEdits(NOTE, {
      add: ["tracker:Medication"],
      remove: ["tracker:Medication"],
    });
    expect(out.added).toEqual([]);
    expect(out.removed).toEqual([]);
    expect(out.lines.join("\n")).toBe(NOTE.join("\n"));
    expect(out.lines.join("\n")).toContain("tracker:Medication");
  });

  it("leaves the array it was given alone", () => {
    const lines = [...NOTE];
    planDirectiveEdits(lines, { add: ["tracker:Exercise"], remove: [] });
    expect(lines).toEqual(NOTE);
  });
});

// ── the window ────────────────────────────────────────────────────────────

describe("the Habits window", () => {
  const src = () => readSrc("habits-editor");

  it("is the tags window's three sections, in its order", () => {
    const s = src();
    expect(s).toContain("this.renderCurrent();");
    expect(s).toContain("this.renderAdd();");
    expect(s).toContain("this.renderUsed();");
    // Literally the same classes, which is the decision rather than a
    // shortcut: a reader who has met one of these windows has met both.
    expect(s).toContain('this.body.addClass("ca-tags-editor");');
  });

  it("carries the reading, which is what makes the collapse safe", () => {
    // Once a cell with nine habits shows two rows and a `+7` card, this window
    // is the only way to reach the seven. A membership-only editor would have
    // made the overflow a loss of function.
    const s = src();
    expect(s).toContain("nextHabitState(state)");
    expect(s).toContain("setHabitReading(this.rows, row.id,");
    expect(s).toContain("ca-journal-habit-box");
  });

  it("goes through the model rather than toggling the element", () => {
    // A box that painted itself without recording the answer is the oldest bug
    // in this shape: the draft is what Save reads.
    const s = src();
    const at = s.indexOf("box.addEventListener");
    expect(at).toBeGreaterThan(0);
    const body = s.slice(at, at + 700);
    expect(body).toContain("this.rows = setHabitReading");
    expect(body).toContain("this.renderBody()");
  });

  it("writes nothing until Save", () => {
    const s = src();
    // No vault, no frontmatter, no settings: the only way out is `onSave`,
    // which `commit()` calls once.
    expect(s).not.toContain("processFrontMatter");
    expect(s).not.toContain("vault.modify");
    expect(s).not.toContain("saveSettings");
    expect(s.split("this.onSave(")).toHaveLength(2);
  });

  it("hands Save the whole draft, copied", () => {
    const s = src();
    const at = s.indexOf("protected async commit()");
    const body = s.slice(at, at + 400).replace(/\s+/g, " ");
    expect(body).toContain("rows: this.rows.map(");
    expect(body).toContain("renamed: { ...this.renamed }");
    expect(body).toContain("created: this.created.map(");
  });

  it("joins an existing habit rather than defining a second with its name", () => {
    // A reader who types "Exercise" into a vault that already has an Exercise
    // habit means that one. Defining `Exercise2` beside it would split a year
    // of readings in two.
    const s = src();
    const at = s.indexOf("const known = this.habits.find");
    expect(at).toBeGreaterThan(0);
    const body = s.slice(at, s.indexOf("const def = newHabitDef"));
    expect(body).toContain("addHabitRow");
    expect(body).toContain("already has that habit");
    expect(body.replace(/\s+/g, " ")).toContain("toLowerCase() === name.toLowerCase()");
  });

  it("tells each new name what the sitting has already claimed", () => {
    const s = src().replace(/\s+/g, " ");
    expect(s).toContain("...this.plugin.settings.trackers.map((t) => t.id), ...this.created.map((t) => t.id),");
  });

  it("renames the registry label, and says so where the reader is typing", () => {
    const s = src();
    // The pencil was the reader's call: everywhere, not this entry only.
    expect(s).toContain("this.renamed[row.id] = next");
    expect(s).toContain("Renames this habit in Settings, on every entry and in Diary.base");
    // And the row shows the REGISTRY label, not the chip's `|Label` override —
    // a window that displayed the override would be offering to rename one
    // thing while renaming another.
    expect(s).toContain("return this.renamed[row.id] ?? row.label;");
  });

  it("says what Add is about to do before it happens", () => {
    expect(src()).toContain(
      "A new habit is added to Settings → Trackers and put on this entry."
    );
  });

  it("takes the habit off the ENTRY, in one verb", () => {
    const s = src();
    const at = s.indexOf("const drop = el.createEl");
    const body = s.slice(at, at + 1200);
    expect(body).toContain("removeHabitRow");
    expect(body).toContain("from this entry");
    // 1.0.43's rule: one verb for taking something away, and it is not
    // "delete" — the habit stays defined and keeps every other entry's reading.
    expect(body).not.toContain("Delete");
  });

  it("lets Escape cancel the rename without closing the window", () => {
    const s = src();
    const at = s.indexOf('if (evt.key === "Escape")');
    const body = s.slice(at, at + 500);
    expect(body).toContain("evt.stopPropagation()");
    expect(body).toContain("this.editing = null");
  });

  it("does not repaint a detached body after the window closes", () => {
    // The rename field commits on blur and closing blurs it, so `finish()`
    // fires on the way out. Nothing is written, but a repaint of a detached
    // element is the kind of thing that works until something reads a layout.
    const s = src();
    expect(s).toContain("if (!this.open_) return;");
    expect(s).toContain("this.open_ = false;");
  });

  it("adds no document or window listener", () => {
    // The review checklist's rule, asserted as the stronger thing: every
    // listener in this file is on an element it created, so there is nothing
    // to tear down.
    const s = src();
    expect(s).not.toContain("document.addEventListener");
    expect(s).not.toContain("window.addEventListener");
  });
});

// ── defining a number from the add box ────────────────────────────────────

describe("the add box's two types", () => {
  // THE PATH THAT HAD NO COVERAGE AT ALL. 1.0.56 taught this window to define
  // a number habit and nothing in the suite read the add box's number branch,
  // which is how 1.0.57's defect — Enter did nothing from the shape fields —
  // shipped and had to be reported from a vault.
  const add = (): string => {
    const s = readSrc("habits-editor");
    const at = s.indexOf("private renderAdd(): void {");
    expect(at).toBeGreaterThan(0);
    const end = s.indexOf("private renderUsed(): void {", at);
    expect(end).toBeGreaterThan(at);
    return s.slice(at, end);
  };

  // The add row's ACTION, which stopped being a closure inside `renderAdd` in
  // 1.0.60 so that Save could run it too.
  const logic = (): string => {
    const s = readSrc("habits-editor");
    const at = s.indexOf("private addPending(): string | null {");
    expect(at).toBeGreaterThan(0);
    const end = s.indexOf("private renderAdd(): void {", at);
    expect(end).toBeGreaterThan(at);
    return s.slice(at, end);
  };

  it("has a reader-facing label for every habit type", () => {
    // The picker iterates `HABIT_TYPES`, so a third type is one row in that
    // array and nothing else — provided the vocabulary knows its name.
    for (const t of HABIT_TYPES) {
      expect(TRACKER_TYPE_LABELS[t]).toBeTruthy();
    }
    expect(HABIT_TYPES).toEqual(["boolean", "number"]);
  });

  it("offers the types by iterating the list, in the settings tab's words", () => {
    const a = add();
    expect(a).toContain("for (const t of HABIT_TYPES) {");
    expect(a).toContain(
      'type.createEl("option", { value: t, text: TRACKER_TYPE_LABELS[t] });'
    );
    // And the select is themed, which it was not until 1.0.57: `dropdown` is
    // the whole of a select's appearance in Obsidian.
    expect(a).toContain('cls: "dropdown ca-habits-type"');
  });

  it("records the picked type in the draft and repaints", () => {
    const a = add();
    const on = a.slice(
      a.indexOf('type.addEventListener("change"'),
      a.indexOf("const shape = wrap.createDiv")
    );
    expect(on).toContain(
      'this.pendingType = type.value === "number" ? "number" : "boolean";'
    );
    // The repaint is what reveals the three shape fields: they are drawn by
    // `renderAdd`, so the change has to come back through it.
    expect(on).toContain("this.renderBody()");
  });

  it("reveals the three shape fields for a number only", () => {
    const a = add();
    const guard = a.indexOf('if (this.pendingType === "number") {');
    expect(guard).toBeGreaterThan(0);
    for (const f of ["field(this.pendingMin", "field(this.pendingMax", "field(this.pendingUnit"]) {
      expect(a.indexOf(f)).toBeGreaterThan(guard);
    }
    // REVEALED, NOT DISABLED: a boolean has no range to answer, so the row is
    // not there rather than three greyed boxes a reader has to rule out.
    expect(a).toContain('const shape = wrap.createDiv({ cls: "ca-habits-shape" });');
    expect(a).not.toContain("disabled");
  });

  it("reads a blank bound as unanswered and refuses only an inverted one", () => {
    const a = logic();
    const shapeOf = a.slice(a.indexOf("private pendingShape()"));
    expect(shapeOf).toContain('if (this.pendingType !== "number") return { type: "boolean" };');
    expect(shapeOf).toContain("if (!t) return null;");
    expect(shapeOf).toContain("Number.isFinite(n) ? n : null");
    expect(shapeOf).toContain("unit: this.pendingUnit.trim() || null,");
    // THE ONE REFUSAL THE SHAPE EARNS, asserted as its condition and not only
    // its wording: `buildStepper` clamps low-then-high, so a 10–0 habit pins
    // every reading to its floor and the `+` visibly does nothing.
    expect(shapeOf).toContain("if (min != null && max != null && min > max) return null;");
    expect(a).toContain("The smallest value has to be below the largest one.");
    // AND THE SHAPE IS ASKED FOR ON THE ADD PATH, not computed and dropped.
    expect(a).toContain("const shape = this.pendingShape();");
  });

  it("hands the shape to newHabitDef, which is the only way the type lands", () => {
    const a = logic();
    const call = a.slice(
      a.indexOf("const def = newHabitDef("),
      a.indexOf("if (!def) {")
    );
    expect(call.replace(/\s+/g, " ")).toContain("this.surface, shape");
  });

  it("lets the registry's type win over the picker on a join", () => {
    const a = logic();
    const join = a.slice(
      a.indexOf("const known = this.habits.find"),
      a.indexOf("const shape = this.pendingShape();")
    );
    expect(join).toContain("habitRowFor(known,");
    // Typing a name that already names a habit is a JOIN, and joining Read
    // with "Number" selected adds the Read that exists rather than a second
    // property shadowing it. `habitRowFor` reads the type off the definition,
    // so the picker is not consulted here at all.
    expect(join).not.toContain("pendingType");
  });

  it("keeps the picked type after an add and clears the shape", () => {
    const a = logic();
    const after = a.slice(a.indexOf("this.created.push(def);"));
    const tail = after.slice(0, after.indexOf("return null;"));
    expect(tail).toContain('this.pendingMin = "";');
    expect(tail).toContain('this.pendingMax = "";');
    expect(tail).toContain('this.pendingUnit = "";');
    // The shape described THAT habit; the TYPE describes what the reader is
    // sitting there entering, and three numbers in a row should not need the
    // picker set three times.
    expect(tail).not.toContain("this.pendingType =");
  });

  it("adds on Enter from every box in the row, and from none outside it", () => {
    // 1.0.57, AND THE WHOLE OF THE REPORTED BUG. The name field has committed
    // on Enter since this window existed; the three shape fields arrived in
    // 1.0.56 with an `input` listener and no `keydown`. So "type it, press
    // Enter" worked for a Yes/No — where the name box is the only box there
    // is — and did nothing at all once the reader had tabbed into "Least".
    const a = add();
    expect(a).toContain("const enterAdds = (el: HTMLElement): void => {");
    expect(a).toContain("enterAdds(input);");
    expect(a).toContain("for (const box of boxes) enterAdds(box);");
    // ONE HANDLER OVER THE WHOLE ROW, so a fourth field cannot be added
    // without it: the boxes are collected where they are built.
    const field = a.slice(a.indexOf("const field = ("), a.indexOf('if (this.pendingType === "number") {'));
    expect(field).toContain("boxes.push(box);");
    expect(a.split('addEventListener("keydown"')).toHaveLength(2);
    // AND THE TYPE SELECT IS DELIBERATELY OUT OF IT: Enter on an open native
    // dropdown means "take this option", and committing there too would add a
    // habit on the keystroke that picked what kind it is.
    expect(a).not.toContain("enterAdds(type)");
    const handler = a.slice(a.indexOf("const enterAdds = ("), a.indexOf("enterAdds(input);"));
    expect(handler).toContain('if (evt.key !== "Enter") return;');
    expect(handler).toContain("evt.preventDefault();");
    expect(handler).toContain("commit();");
  });
});

// ── the cell's door and its count ─────────────────────────────────────────

describe("the Habits cell", () => {
  const src = () => readSrc("tracker-controls");

  it("ends its row in a count, and puts the door on the cell", () => {
    const s = src();
    const at = s.indexOf("export function finishHabitsCell");
    expect(at).toBeGreaterThan(0);
    const body = s.slice(at, s.indexOf("export function cleanFaceGlyph"));
    expect(body).toContain("ca-journal-habits-overflow");
    expect(body).toContain("ca-journal-habits-add");
    // Both open the same window, which is what makes a habit behind the card
    // reachable at all.
    expect(body.split("openWindow)")).toHaveLength(3);
  });

  it("does not stand the door in the flow that can push it off", () => {
    // THE REPORTED DEFECT. The `+` went in at the end of the chip row and an
    // entry whose two habits filled that row lost it — wrapped to a second line
    // and cut by `overflow: hidden`, with the fitter satisfied because two rows
    // is what it allows. No arithmetic closes that: the cell's height is fixed
    // and two rows of chips are as tall as the reader's font makes them, so
    // there is a width at which the chips, the count and the door cannot all be
    // in one box. The door is a child of the CELL instead.
    const code = readCode("tracker-controls");
    expect(code).toContain('const add = cell.createEl("button", {');
    expect(code).not.toContain('const add = row.createEl("button", {');
    // The count stays in the row — it is about the chips, and it is the other
    // door onto the window.
    expect(code).toContain('const more = row.createEl("button", {');
  });

  it("measures the chips with the count alone", () => {
    // The fitter now keeps one element alive instead of two, and the one it
    // keeps is the one the chips are hiding behind.
    expect(src()).toContain("fitChipRows(row, chipEls, more)");
    expect(src()).not.toContain("fitChipRows(row, chipEls, more, add)");
  });

  it("still protects a trailing control for the cell that has one", () => {
    // Tags' pencil IS in flow after its chips, so the parameter stays — it is
    // optional, not deleted.
    const s = src();
    expect(s).toContain("trailing?: HTMLElement");
    expect(s).toContain("const tail = trailing ? [trailing] : [];");
    expect(s).toContain("fitChipRows(chips, chipEls, more, pencil)");
  });

  it("reads the readings when the window opens, not when the host was drawn", () => {
    // A chip ticked since the render wrote a value the host's copy predates,
    // and the window would show the state from before the tick.
    //
    // THE SAME PROPERTY, NOW STRUCTURAL (1.0.54). It was a `rowsNow` thunk
    // inside `finishHabitsCell`; the Habits section opens the same window and
    // is not a cell, so the opener is a function — and it takes the habits'
    // DEFINITIONS and reads the states itself, which is stronger than a late
    // thunk: neither host can hand it a reading at all.
    const s = src();
    const at = s.indexOf("export function openHabitsWindow(");
    expect(at).toBeGreaterThan(0);
    const body = s.slice(at, s.indexOf("\n}\n", at));
    expect(body).toContain("entries: readonly HabitEntry[]");
    expect(body).toContain("const before: HabitRow[] = entries.map(");
    // NAMES `deps.currentValue`, NOT THE PARSE (1.0.56). The per-type read
    // moved into `habitRowFor`, so `readHabitState` is no longer spelled here —
    // what must still be spelled is the HOST'S LIVE VALUE, which is the whole
    // property this test exists for. Asserted as the full call so a row built
    // without the third argument (every reading `null`, silently) fails.
    expect(body).toContain(
      "habitRowFor(e.def, e.directive, deps.currentValue(ctx, e.def.id))"
    );
    // And no host computes one to pass in.
    expect(s).not.toContain("rowsNow");
    const cell = s.slice(s.indexOf("export function finishHabitsCell("));
    expect(cell).toContain("openHabitsWindow(deps, entries, ctx)");
  });

  it("saves the draft through the one method that applies it", () => {
    expect(src().replace(/\s+/g, " ")).toContain(
      "deps.plugin.entryTrackers.applyHabitDraft( ctx.sourcePath, before, draft )"
    );
  });

  it("refuses the door on an entry template, and keeps the count", () => {
    // A template's tracker list is generated from Settings, so a control that
    // edited it would be writing something the next sync deletes. The card
    // stays: a template holding more habits than fit still has to say so.
    // COMMENT-STRIPPED, because the prose beside the door names the function
    // it calls — the record of the decision rather than a use of it, which is
    // the distinction `vocabulary.test.ts` draws.
    const code = readCode("tracker-controls");
    // The guard reaches the DOOR and nothing else: it is on the same line as
    // the refusal, and the only thing it refuses is the click.
    expect(code.replace(/\s+/g, " ")).toContain(
      "if (isManagedTemplate(deps.plugin, ctx.sourcePath)) add.disabled = true; else add.addEventListener(\"click\", openWindow);"
    );
    // So the count is built and wired before the question is asked.
    const body = code.slice(
      code.indexOf("const more = row.createEl"),
      code.indexOf("const add = cell.createEl")
    );
    expect(body).toContain('more.addEventListener("click", openWindow)');
    expect(body).not.toContain("isManagedTemplate");
  });

  it("disposes of its observer with the cell", () => {
    // An observer left watching a detached element is a reference the view
    // cannot drop — `ChipFit` is the same hook the Tags cell uses.
    const s = src();
    const at = s.indexOf("export function finishHabitsCell");
    const body = s.slice(at, s.indexOf("export function cleanFaceGlyph"));
    expect(body).toContain("new ResizeObserver(fit)");
    expect(body).toContain("new ChipFit(cell, () => watch.disconnect())");
    // And still works where there is no observer at all.
    expect(body).toContain('typeof ResizeObserver === "undefined"');
  });

  it("is called once, after the whole fence is walked", () => {
    // Forced rather than chosen: both controls come after the last chip, and
    // the fit cannot be measured until every chip is in.
    const idx = readSrc("widgets");
    expect(idx.split("finishHabitsCell(this, habitsCell, habitEntries, ctx)")).toHaveLength(2);
    const at = idx.indexOf("finishHabitsCell(this, habitsCell, habitEntries, ctx)");
    // After the tile, which is placed on the same argument.
    expect(at).toBeGreaterThan(idx.indexOf("buildTrackerAddCell(this, ctx)"));
    // And after the loop that pushes the entries.
    expect(at).toBeGreaterThan(
      idx.indexOf("habitEntries.push({ def: habit, directive: line.trim() })")
    );
  });

  it("carries the note's own directive line into the window", () => {
    expect(readSrc("widgets")).toContain(
      "habitEntries.push({ def: habit, directive: line.trim() })"
    );
  });
});

// ── and the stylesheet ────────────────────────────────────────────────────

describe("the row's two end controls", () => {
  it("keeps the count in flow, because that is what the fitter can see", () => {
    // A control taken out of flow is one `fitChipRows` cannot see falling off
    // the bottom of a two-row box — and the count is the one it has to keep.
    const rule = cssRule(".ca-journal-habits-overflow");
    expect(rule).toContain("flex: 0 0 auto");
    expect(rule).not.toContain("position: absolute");
    expect(rule).not.toContain("float:");
  });

  it("pins the door to the cell's corner, out of that flow", () => {
    // Which is the fix rather than a style: a control the fitter has to keep
    // alive is a control one long habit name can kill.
    const rule = cssRule(".ca-journal-habits-add");
    expect(rule).toContain("position: absolute");
    expect(rule).toContain("top:");
    expect(rule).toContain("right:");
    expect(rule).not.toContain("flex: 0 0 auto");
  });

  it("draws the door at a size a finger and an eye can find", () => {
    // 16px with a 10px glyph beside chips twice that tall read as a speck.
    const rule = cssRule(".ca-journal-habits-add");
    const px = (decl: string): number =>
      Number(/:\s*(\d+)px/.exec(rule.split(decl)[1] ?? "")?.[1] ?? 0);
    expect(px("width")).toBeGreaterThanOrEqual(20);
    expect(px("height")).toBeGreaterThanOrEqual(20);
    const icon = cssRule(".ca-journal-habits-add .svg-icon");
    expect(icon).toContain("width: 14px");
    expect(icon).toContain("height: 14px");
  });

  it("keeps the eyebrow out from under it", () => {
    // A long group name would otherwise run beneath the `+`.
    expect(cssRule(".ca-journal-habits-cell > .ca-journal-widget-label")).toContain(
      "padding-right"
    );
  });

  it("collapse into the same object the Tags cell collapses into", () => {
    const more = cssRule(".ca-journal-habits-overflow");
    const tags = cssRule(".ca-journal-tags-chip.ca-journal-tags-overflow");
    for (const decl of ["background: var(--interactive-accent)", "font-weight: 600"]) {
      expect(more, decl).toContain(decl);
      expect(tags, decl).toContain(decl);
    }
  });

  it("draw the refused door rather than removing it", () => {
    expect(cssRule(".ca-journal-habits-add:disabled")).toContain("opacity");
  });

  it("give the window's box and its sentence a rule each", () => {
    expect(cssRule(".ca-habits-box")).toContain("flex: 0 0 auto");
    expect(cssRule(".ca-habits-note")).toContain("color: var(--text-muted)");
  });
});

// THE SECOND LINE OF HABITS, which is arithmetic rather than behaviour and so
// is pinned on the stylesheet. A tracker cell is a fixed 66px — 50px of content
// box — and the reader asked for the two rows the Tags cell beside it shows.
// The reason it could not was that a habit chip's text was `--ca-text-2xs`, a
// relative 0.7em, so the chip grew with the reader's base font: ~26px each,
// 56px for two, into 50px of cell. These four rules are the fix and they are
// one decision; a mutant in any of them takes the second row away again.
describe("two rows of habit chips", () => {
  it("let the chip's own sizing reach it at all", () => {
    // THE CAUSE, and it is not the font. A habit chip is a `<button>` where a
    // tag chip is a `<span>`, and Obsidian gives a `<button>` an explicit
    // `height: var(--input-height)` — 30px — that no padding or line-height in
    // the rule can reach. Every number in this chip's rule was decorative and
    // every chip was app-control height; two of them is 62px against the 36px
    // the cell has. `30-header-bars.css:1627` records the same trap on the
    // reveal toggle, which is where the fix is spelled.
    for (const sel of [
      ".ca-journal-habit-chip-btn",
      ".ca-journal-habits-overflow",
    ]) {
      const rule = cssRule(sel);
      expect(rule).toContain("height: auto");
      expect(rule).toContain("min-height: 0");
    }
  });

  it("size the chip absolutely, as the tags chip has all along", () => {
    const chip = cssRule(".ca-journal-habit-chip-btn");
    expect(chip).toContain("font-size: 11px");
    expect(chip).toContain("line-height: 1.1");
    expect(chip).toContain("padding: 0 6px");
    // The relative size is what made two rows impossible to fit by arithmetic.
    expect(chip).not.toContain("font-size: var(--ca-text-2xs)");
  });

  it("keep the count on the chips' own metrics", () => {
    // The `+N` rides the chips' row and the tallest item sets that row's
    // height, so a count a few pixels taller spends the cell's headroom on
    // itself and takes the second row back.
    const chip = cssRule(".ca-journal-habit-chip-btn");
    const more = cssRule(".ca-journal-habits-overflow");
    for (const decl of ["font-size: 11px", "line-height: 1.1", "padding: 0 6px"]) {
      expect(chip).toContain(decl);
      expect(more).toContain(decl);
    }
  });

  it("take the × off the chip and leave removal to the window", () => {
    // The reader's call, and the `+` door's corner is why they saw it: the
    // rightmost chip's × sat where the door is pinned.
    const code = readCode("tracker-controls");
    const chipFn = code.slice(
      code.indexOf("export function buildHabitChip("),
      code.indexOf("export interface HabitCellEntry")
    );
    expect(chipFn).not.toContain("attachTrackerRemove");
    // Not merely hidden: the rules that positioned and revealed it are gone.
    expect(readCss("85-tracker-controls")).not.toContain(
      ".ca-journal-habits-cell .ca-journal-tracker-remove"
    );
    // And the window is still the door that removes.
    expect(readSrc("habits-editor")).toContain("removeHabitRow");
  });

  it("give the row the leftover rather than letting it size to its chips", () => {
    const row = cssRule(".ca-journal-habits-row");
    // THE BUG THE FIRST CUT SHIPPED. `clientHeight` is what `rowsVisible`
    // reads, and on a content-sized row that is how tall the chips already
    // made it — so "is there room for a second row" comes back "there is as
    // much room as you are using". `height: 100%` with the default shrink
    // hands the row the cell's leftover instead, which is the question's
    // actual answer; `.ca-journal-tags-chips` has had it all along.
    expect(row).toContain("height: 100%");
    expect(row).toContain("min-height: 0");
    expect(row).toContain("overflow: hidden");
    expect(row).not.toContain("max-height: 40px");
    expect(row).not.toContain("max-height: calc(");
    expect(row).toContain("gap: 2px 5px");
    // The cell next door, which is where the shape came from.
    expect(readCss("94-native-tables")).toMatch(
      /\.ca-journal-tags-chips,\n\.ca-journal-tags-add \{[^}]*height: 100%/
    );
  });

  it("pin the eyebrow's line-height, which the cap subtracts", () => {
    // The budget's largest single term. Left inherited (~1.5) the label eats
    // 16.8px of the 50 for one line of 11px uppercase text, and the `* 1.1` in
    // the cap above would then be subtracting less than the label spends.
    //
    // ── AND IT IS THE SHARED EYEBROW'S NOW, NOT THIS CELL'S (1.0.49) ───
    // The habits cell was simply the first one whose budget anybody measured;
    // the four pixels it bought were four pixels EVERY tracker cell was paying
    // for an inherited line-height on a single nowrap line. So the declaration
    // moved up to the rule all of them share, and this cell keeps only the
    // padding that clears its pinned `+`. Asserted in both places on purpose:
    // the budget above is still subtracting 1.1, and the thing that supplies
    // it is a rule with thirty other readers.
    const shared = cssRule(
      ".ca-journal-tracker-bar .ca-journal-tracker-cell > .ca-journal-widget-label"
    );
    expect(shared).toContain("line-height: 1.1");
    const label = cssRule(".ca-journal-habits-cell > .ca-journal-widget-label");
    expect(label).toContain("padding-right: 24px");
    expect(label).not.toContain("line-height");
  });

  it("take the mobile tap-target floor off the chip, which cannot hold it", () => {
    // IT WAS ON THE LIST AND IT HAD TO COME OFF. A habit chip is a tap target,
    // which is why it was there — and it is the only one that lives inside a
    // box of FIXED height: 66px of cell, 50px of content, 36px of row for two
    // rows of chips. A 40px pill in a 36px window is clipped by the cell's
    // `overflow: hidden`, so the floor that was meant to make it hittable was
    // what made it unreadable. The reader reported it as the cell's contents
    // clipping into the bottom of the card.
    //
    // THE FLOOR IS NOT WRONG; THE CONTAINER IS FIXED. The rest of the list
    // keeps it, which is the half of this that must not drift.
    const tokens = readCss("00-tokens");
    expect(tokens).not.toContain("body.is-mobile .ca-journal-habit-chip-btn");
    expect(tokens).toContain("body.is-mobile .ca-journal-tracker-add-btn,");
    expect(tokens).toContain("min-height: var(--ca-control-min)");
  });

  it("count the rows the box can show instead of assuming two", () => {
    const code = readCode("tracker-controls");
    expect(code).toContain("function rowsVisible(");
    expect(code).toContain("const limit = chips.clientHeight;");
    expect(code).toContain("if (!limit) return CHIP_ROWS;");
    // The span is the distance between two rows, never one element's box.
    expect(code).toContain("rows.length > 1\n      ? rows[1] - rows[0]");
    expect(code).toContain("if (mid - rows[0] + span <= limit + CHIP_ROW_SLOP)");
    expect(code).toContain(
      "const cap = Math.min(CHIP_ROWS, rowsVisible(chips, [...chipEls, ...tail]));"
    );
    // Every later use inside the fitter is the measured cap, not the constant:
    // one surviving `CHIP_ROWS` is a cell that still over-promises a row.
    const body = code.slice(
      code.indexOf("rowsVisible(chips, [...chipEls, ...tail]));"),
      code.indexOf("shown -= 1;")
    );
    expect(body).not.toContain("CHIP_ROWS");
    expect(body).toContain("rows[cap - 1]");
    expect(body).toContain("rows.length <= cap");
  });
});

// ── a habit type gets a section (1.0.54) ──────────────────────────────────
//
// The reader asked for "a new category type of sections for trackers", naming
// habits as the type that would gain most and sleep as the next. The Trackers
// grid is unchanged; what is new is that a TYPE can leave it for a section of
// its own, and the first member is Habits.
//
// WHAT THESE CASES ARE ABOUT, since the DOM is not available to them: the
// arithmetic of the week (`habits.ts`, pure), the catalogue's offer and what
// adding it writes (pure), and then the three couplings that would break
// silently — the grid's stand-down, the repaint scope, and the door being one
// door. Those three are source-shape, as this suite works.

describe("the week behind a habit", () => {
  it("runs Monday to Sunday whatever day it is asked about", () => {
    // ISO WEEKS, AND THE SAME ONE FROM ANY DAY IN THEM. A strip whose first
    // column moved with the day being viewed would put Wednesday under the
    // letter M on Wednesday's entry, and the reader comparing two entries of
    // one week would be comparing two different weeks.
    const mon = habitWeek("2026-10-12").map((d) => d.iso);
    expect(mon).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
    ]);
    // Midweek and the Sunday — the day `startOf("week")` would send to the
    // NEXT week, which is this function's one real trap and a measured mutant.
    expect(habitWeek("2026-10-14").map((d) => d.iso)).toEqual(mon);
    expect(habitWeek("2026-10-18").map((d) => d.iso)).toEqual(mon);
    // And a week that crosses a month, where "the seven days around this one"
    // and "this calendar month" disagree.
    expect(habitWeek("2026-11-01").map((d) => d.iso)).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
  });

  it("is the same week the Days calendar draws", () => {
    // ONE DEFINITION OF A WEEK IN THE PLUGIN. `monthGrid` rows a month by
    // `startOf("isoWeek")` for the Link to diary window (1.0.52); a habit's
    // strip is one of those rows. Asserted against the other implementation
    // rather than against a second hand-typed list, because the failure this
    // guards is the two drifting apart.
    const row = monthGrid("2026-10-14")?.weeks.find((w) => w.key === "2026-10-12");
    expect(row?.days).toEqual(habitWeek("2026-10-14").map((d) => d.iso));
  });

  it("names its own columns, off the dates it dated", () => {
    // THE HEADS COME OFF THE SAME SEVEN DAYS, never a typed ["M","T",…] — the
    // 1.0.53 lesson about a legend that spelled its own state words while the
    // cells read theirs off a table. A head that disagreed with its column
    // would be unfalsifiable on screen.
    const week = habitWeek("2026-10-14");
    expect(week.map((d) => d.head)).toEqual(
      week.map((d) => Array.from(moment(d.iso).format("dd"))[0])
    );
    // The tooltip says the date, which is the only place there is room for it.
    expect(week[0].label).toContain("Monday");
    expect(week[0].label).toContain("12");
  });

  it("answers nothing for a date that is not one", () => {
    // A note whose `date:` is missing or malformed asks for the week of "".
    // Seven columns of a week the reader never named is worse than no strip.
    expect(habitWeek("")).toEqual([]);
    expect(habitWeek("not a date")).toEqual([]);
  });
});

describe("what the week reads", () => {
  // The vault as `locateEntry` sees one: a path per entry, each with
  // frontmatter. Keyed through `entryPath`, so the fixture is filed where the
  // plugin files entries rather than where this test guesses.
  const vaultOf = (fm: Record<string, Record<string, unknown>>): App => {
    const files = new Map(
      Object.entries(fm).map(([iso, f]) => [
        entryPath(DEFAULT_PATHS, "daily", iso),
        f,
      ])
    );
    return {
      vault: {
        getAbstractFileByPath: (path: string) =>
          files.has(path) ? new TFile(path) : null,
      },
      metadataCache: {
        getFileCache: (f: TFile) => ({ frontmatter: files.get(f.path) }),
      },
    } as unknown as App;
  };

  it("reads each day's entry through readHabitState, and a 0 is not a blank", () => {
    const app = vaultOf({
      "2026-10-12": { Gym: 1 },
      "2026-10-13": { Gym: true },
      "2026-10-14": { Gym: "1" },
      "2026-10-15": { Gym: 0 },
      "2026-10-16": { Gym: "" },
      // Saturday exists and says nothing about Gym; Sunday does not exist.
      "2026-10-17": { Read: 1 },
    });
    const week = habitWeekReadings(app, DEFAULT_PATHS, "Gym", "2026-10-14");
    expect(week.map((d) => d.state)).toEqual([1, 1, 1, 0, null, null, null]);
  });

  it("says whether the day was written at all, which the mark cannot", () => {
    // TWO FACTS, ONE GLYPH, TWO TOOLTIPS. "No entry for that day" and "this
    // habit is unanswered" are both nothing-recorded and look identical on
    // purpose — three marks on a 9px dot is the mistake 1.0.52 made with the
    // calendar legend. `written` is what lets the tooltip say which.
    const app = vaultOf({ "2026-10-14": { Gym: "" } });
    const week = habitWeekReadings(app, DEFAULT_PATHS, "Gym", "2026-10-14");
    expect(week.map((d) => d.written)).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
      false,
    ]);
    // The unanswered day and the unwritten one, side by side: same state.
    expect(week[2].state).toBeNull();
    expect(week[3].state).toBeNull();
  });

  it("keeps the day's own name and date on the reading", () => {
    // `HabitReading extends HabitDay`, so a dot can be painted from one object
    // rather than from an index into two lists that have to stay aligned.
    const week = habitWeekReadings(vaultOf({}), DEFAULT_PATHS, "Gym", "2026-10-14");
    expect(week.map((d) => d.iso)).toEqual(habitWeek("2026-10-14").map((d) => d.iso));
    expect(week.map((d) => d.head)).toEqual(habitWeek("2026-10-14").map((d) => d.head));
  });

  it("costs seven cache lookups and no vault walk", () => {
    // WHY `locateEntry` AND NOT `pagesUnder`. A strip drawn once per habit per
    // repaint cannot afford a scan: seven probes cost the same on a vault of
    // ten entries and of ten thousand, and this is the half of that claim a
    // test can hold — the folder survey above is never reached.
    const code = readCode("habits");
    const fn = code.slice(
      code.indexOf("export function habitWeekReadings("),
      code.indexOf("export interface HabitRow")
    );
    expect(fn).toContain("locateEntry(app, paths, \"daily\", day.iso)");
    expect(fn).toContain("readHabitState(frontmatterOf(app, file)[id])");
    expect(fn).not.toContain("getMarkdownFiles");
    expect(fn).not.toContain("pagesUnder");
  });
});

describe("which habits a note carries", () => {
  const trackers = normalizeTrackers([
    habit("Gym"),
    habit("Read"),
    habit("Monthly thing", { surface: diarySurface("monthly") }),
    { ...habit("Mood"), type: "slider" as const },
    habit("Streak", { derived: true }),
  ]);
  const fence = (...lines: string[]): string =>
    ["```chronoanvil", ...lines, "```"].join("\n");

  it("is every boolean the note's fences name, in document order", () => {
    const text = fence("tracker:Read", "tracker:Gym", "slider:Mood");
    expect(
      habitsOnNote(trackers, text, diarySurface("daily")).map((e) => e.def.id)
    ).toEqual(["Read", "Gym"]);
  });

  it("leaves a misplaced or derived tracker to the grid", () => {
    // A monthly boolean on a daily entry takes the ordinary tracker path and
    // draws its own visible refusal; a derived one is a readout, not a habit.
    // Answering null here is what leaves both of them to do that.
    const text = fence("tracker:Monthly thing", "tracker:Streak", "tracker:Gym");
    expect(
      habitsOnNote(trackers, text, diarySurface("daily")).map((e) => e.def.id)
    ).toEqual(["Gym"]);
  });

  it("carries the line, because a remove has to match it", () => {
    const [entry] = habitsOnNote(
      trackers,
      fence("tracker:Gym|Morning workout"),
      diarySurface("daily")
    );
    expect(entry.directive).toBe("tracker:Gym|Morning workout");
    // AND THE SECTION'S ROW IS NAMED BY THE SAME RULE THE CHIP USES: an inline
    // override names this habit on this note, and a bare trailing `|` names
    // nothing and falls back rather than drawing a nameless row.
    expect(habitLabelOf(entry.def, entry.directive)).toBe("Morning workout");
    expect(habitLabelOf(entry.def, "tracker:Gym|")).toBe("Gym");
    expect(habitLabelOf(entry.def, "tracker:Gym")).toBe("Gym");
  });

  it("answers the fold-in's question from a `habits` line of its own", () => {
    expect(noteHasHabitsSection(fence("habits"))).toBe(true);
    expect(noteHasHabitsSection(fence("tracker:Gym"))).toBe(false);
    // FENCE-SCOPED, AND THIS RELEASE IS WHY. The shipped documentation note
    // quotes the catalogue in prose, and `habits` is now one of the words it
    // quotes — a raw regex over the note would empty that reader's cell.
    expect(noteHasHabitsSection("A line about `habits` in prose.\n")).toBe(false);
    // THE SHAPE THAT MAKES THIS A FENCE-SCOPED READ AND NOT A REGEX, and this
    // release is what put it in a reader's vault: the shipped documentation
    // note lists the catalogue's keywords in plain code blocks, and `habits` is
    // now one of them. A line that IS the word, in a block that is not a
    // `chronoanvil` fence, is prose — and reading it as a section would empty
    // that reader's Habits cell while they were reading about habits.
    const doc = ["## Habits", "", "```", "habits", "```", ""].join("\n");
    expect(doc).toMatch(/^habits$/m);
    expect(noteHasHabitsSection(doc)).toBe(false);
    expect(noteHasHabitsSection(fence("habits-week"))).toBe(false);
  });
});

describe("the catalogue offers the section, and nothing composes it", () => {
  const sec = ENTRY_SECTIONS.find((s) => s.id === "habits")!;

  it("probes for the whole word, so a later keyword cannot answer for it", () => {
    // THE CATALOGUE'S OWN READ, which is a different function from the
    // renderer's and has to agree with it. Anchored at both ends: `habits` is a
    // word, and a `habits-week` keyword invented later must not be found as
    // this section — the catalogue would report a section the reader does not
    // have and offer to remove a line it does not own.
    expect(sec.probe.test("habits")).toBe(true);
    expect(sec.probe.test("note:log\nhabits\n")).toBe(true);
    expect(sec.probe.test("habits-week")).toBe(false);
    expect(sec.probe.test("tracker:habits")).toBe(false);
  });

  it("is a shared-band Trackers section, unlocked and region-free", () => {
    expect(sec.band).toBe("shared");
    // `locked === (band !== "shared")` is asserted for the whole catalogue;
    // what is stated here is the half that makes it addable and movable at all.
    expect(sec.locked).toBe(false);
    expect(sec.category).toBe("trackers");
    expect(sec.ownsRegion).toBe(false);
  });

  it("is offered on every grain and composed on none", () => {
    for (const grain of TRACKER_CLASSES) {
      // OPT-IN, ON THE `bridge` PATTERN: the directive is null unless the
      // reader's own answer names it, which is what keeps every shipped
      // template and every golden fixture byte-identical.
      expect(sec.directive({ grain }), grain).toBeNull();
      expect(sec.directive({ grain, extra: ["habits"] }), grain).toBe("habits");
      expect(composeEntryTemplate(grain), grain).not.toContain("habits");
    }
  });

  it("writes one keyword line into the band and no region", () => {
    const daily = composeEntryTemplate("daily");
    const out = addSectionToNote(daily, { grain: "daily" }, sec)!;
    expect(out).toBeTruthy();
    const added = out.split("\n").filter((l) => l.trim() === "habits");
    expect(added).toHaveLength(1);
    // NO REGION, which is the half that would show up as an empty pair of
    // markers in the reader's note: this section draws readings and writes no
    // prose, so it has nothing to keep between them.
    expect(out).not.toContain("<!--chronoanvil:habits");
    expect(detectEntrySections(out, { grain: "daily" })).toContain("habits");
    // AND IT COMES OFF AGAIN, taking nothing else: the round trip is what
    // makes "removing the section puts the cell back" a promise rather than a
    // hope, since the cell's return is derived from this line's absence.
    const want = detectEntrySections(out, { grain: "daily" }).filter(
      (id) => id !== "habits"
    );
    const back = applyEntrySections(out, { grain: "daily" }, want)!;
    expect(back).toBeTruthy();
    expect(noteHasHabitsSection(back)).toBe(false);
    expect(back).toBe(daily);
  });

  it("moves with the band's arrows, which is the first bare keyword in it", () => {
    // EVERY OTHER MEMBER OF THE SHARED BAND HAS A FIELD BEHIND IT, so a line
    // that is a keyword and nothing else is new here — and the band's rows are
    // what the section window rearranges. A regroup that dropped it would lose
    // the reader's section while reporting success, with the regions of
    // everything else still in place to make the note look intact.
    const ctx = { grain: "daily" } as const;
    const model = entrySectionModel(ctx);
    const text = addSectionToNote(composeEntryTemplate("daily"), ctx, sec)!;
    const groups = model.blocks(text).map((b) => [...b.ids]);
    expect(groups[groups.length - 1]).toEqual(["habits"]);
    // Added at the end and moved to the top of the band, which is the arrow a
    // reader presses eight times.
    const moved = model.regroup(text, [
      groups[0],
      groups[groups.length - 1],
      ...groups.slice(1, -1),
    ]);
    expect(moved).toBeTruthy();
    const ids = detectEntrySections(moved!, ctx);
    expect(ids.indexOf("habits")).toBe(ids.indexOf("trackers") + 1);
    expect(moved!.split("\n").filter((l) => l.trim() === "habits")).toHaveLength(1);
    // AND BACK, byte for byte. The round trip is what makes the arrows a door
    // rather than a one-way write — and every other field's region is still
    // where it was, which is the half that would fail silently.
    expect(model.regroup(moved!, groups)).toBe(text);
  });

  it("is joinable as a widget, and a titled field is still refused one", () => {
    // THE 1.0.42 RULE, AND THIS SECTION IS ON THE PERMITTED SIDE OF IT: a row
    // is columns side by side, so its members must be widgets — a field
    // wearing a permanent title bar brings a head the row has no room for.
    // `habits` is a widget line, so the editor offers it the join; `capture` is
    // a titled field, so the pair is refused WHOLE rather than trimmed to the
    // part that would render, which would drop a directive on the floor.
    const ctx = { grain: "daily" } as const;
    const model = entrySectionModel(ctx);
    const text = addSectionToNote(composeEntryTemplate("daily"), ctx, sec)!;
    const blocks = model.blocks(text);
    const mine = blocks[blocks.length - 1];
    expect(mine.ids).toEqual(["habits"]);
    expect(mine.column).toEqual(["habits"]);
    // The fields beside it are loose and not joinable, which is what makes the
    // line above a claim about this section rather than about the band.
    expect(blocks[1].column).toEqual([]);
    const groups = blocks.map((b) => [...b.ids]);
    const pairedWithAField = model.regroup(text, [
      ...groups.slice(0, -2),
      [...groups[groups.length - 2], "habits"],
    ]);
    expect(pairedWithAField).toBeNull();
  });
});

describe("the grid lets the type go", () => {
  it("skips the habit line entirely when the note has the section", () => {
    // THE WHOLE OF HOW THE CELL LEAVES THE GRID, and it is one `continue`: no
    // cell is built, so there is no chip, no `+N`, no fitter and no empty box
    // left behind — a cell the bar was never given is not a gap in it.
    const code = readCode("widgets");
    const loop = code.slice(
      code.indexOf("if (habit) {"),
      code.indexOf("buildHabitChip(")
    );
    expect(loop).toContain("habitsElsewhere = noteHasHabitsSection(noteTextNow())");
    expect(loop).toContain("if (habitsElsewhere) continue;");
    // ASKED ONCE PER FENCE: the read is cheap and not free, and a fence with
    // no boolean in it has no reason to ask at all.
    expect(loop).toContain("if (habitsElsewhere == null) {");
    expect(code).toContain("let habitsElsewhere: boolean | null = null;");
    // AND THE CHIP IT STILL BUILDS WHEN IT DOES NOT STAND DOWN takes its name
    // from the same function the section's rows do, so the two surfaces cannot
    // disagree about what a renamed habit is called.
    expect(code).toContain("habitLabelOf(habit, line),");
    // ── AND THE CHIP STILL REFUSES A NUMBER (1.0.56) ────────────────────
    //
    // THE ASSERTION THAT KILLS THE NAIVE WIDENING, and it has to be the guard
    // rather than the prose around it: `habitsForSurface` now admits a number,
    // so every caller followed in one edit and exactly ONE of them had to get
    // narrower. A 14px chip has one tick in it and no room for a stepper, so a
    // number habit with no section on the note keeps its own 66px cell.
    expect(code).toContain('if (habit && habit.type === "boolean") {');
    // THE TWO QUESTIONS, IN THIS ORDER: the stand-down is asked of BOTH types
    // and only the fold is narrowed, which is the whole of the reader's second
    // call. A `continue` inside the boolean branch would leave a number cell
    // drawn beside the section that already draws it.
    expect(loop.indexOf("if (habitsElsewhere) continue;")).toBeGreaterThan(0);
    expect(
      code.indexOf("if (habitsElsewhere) continue;")
    ).toBeLessThan(code.indexOf('if (habit && habit.type === "boolean") {'));
  });

  it("reads the live note, and keeps the last answer it got", () => {
    // `getSectionInfo` IS THE SYNCHRONOUS WHOLE-NOTE READ this plugin already
    // uses, and NULL IS AN ANSWER — an embed, an export, any render outside a
    // live view. Two different wrongs are possible on a null and this picks
    // the lesser: folding the chips back into the grid on a repaint would be
    // visible, while a section drawn from stale text is right again as soon as
    // anything writes to this note.
    const code = readCode("widgets");
    const fn = code.slice(
      code.indexOf("let lastNoteText: string | null = null;"),
      code.indexOf("if (frameSpec.error) {")
    );
    expect(fn).toContain("const text = ctx.getSectionInfo(el)?.text;");
    expect(fn).toContain("if (text != null) lastNoteText = text;");
    expect(fn).toContain("return lastNoteText ?? \"\";");
    // A THUNK AND NOT A STRING, because the section's builder runs again on
    // every repaint, long after the handler that made it returned.
    expect(code).toContain("() => buildHabitsSection(this, ctx, noteText())");
    expect(code).toContain("noteText: () => string");
  });

  it("repaints on the daily folder, which is where its seven days are", () => {
    const code = readCode("widgets");
    const arm = code.slice(
      code.indexOf("case \"habits\":"),
      code.indexOf("case \"tracker-stat\":")
    );
    expect(arm).toContain("liveScopedWidget(");
    expect(arm).toContain("this.plugin.settings.paths.diaryDaily");
    // NOT THE DIARY ROOT, which is the distinction the arm below it draws for
    // the opposite reason: a habit's readings are on daily entries by
    // construction, so a monthly entry being written teaches this nothing.
    expect(arm).not.toContain("diaryRoot");
  });

  it("wears a head because the dispatcher names it, and is not a page widget", () => {
    const widgets = readSrc("widgets");
    expect(widgets).toContain("habits: \"✅ Habits\"");
    // THE SIXTH ALIAS TITLE, and the slot `journal-tally` and `kind-table`
    // already occupy: it dispatches, it has no `WidgetSpec`, and dropped into
    // an entry's shared band it is a non-field keyword `fieldFrame` wraps in
    // the same card every field beside it gets.
    expect(NOT_PAGE_WIDGETS.habits.reason).toBe("readings");
    expect(isPageWidget("habits")).toBe(false);
  });
});

// `fnBody` resolves a top-level function by module; these are class members, so
// the slice is local. To the next `\n  ` member or the end, whichever is nearer.
const fnBodyOf = (code: string, name: string): string => {
  let at = code.indexOf(`  protected ${name}(`);
  if (at < 0) at = code.indexOf(`  protected async ${name}(`);
  if (at < 0) throw new Error(`no member ${name}`);
  const rest = code.slice(at + 10);
  const ends = ["\n  private ", "\n  protected ", "\n  public "]
    .map((m) => rest.indexOf(m))
    .filter((i) => i > 0);
  return rest.slice(0, ends.length ? Math.min(...ends) : rest.length);
};

describe("the section itself", () => {
  const src = readSrc("habits-section");
  const code = readCode("habits-section");

  it("opens the window the cell opens, through one function", () => {
    // ONE DOOR, ONE SAVE PATH. The cell's pinned `+` and this card's row both
    // call `openHabitsWindow`, which was extracted from `finishHabitsCell` for
    // this round — two openers would be two readings of what the window is
    // editing, and the one that drifted would silently save the wrong set.
    expect(code).toContain("openHabitsWindow(deps, entries, ctx)");
    expect(code).not.toContain("new HabitsEditor(");
    expect(readCode("tracker-controls")).toContain("export function openHabitsWindow(");
    const opens = [...readCode("widgets").matchAll(/new HabitsEditor\(/g)];
    expect(opens).toHaveLength(1);
  });

  // The two row builders, sliced out so an assertion about one cannot pass on
  // the other — they share `paintBar`/`paintDay` vocabulary and most of a shape.
  const boolRow = (): string =>
    code.slice(
      code.indexOf("function drawBoolRow"),
      code.indexOf("function drawNumRow")
    );
  const numRow = (): string =>
    code.slice(code.indexOf("function drawNumRow"), code.indexOf("function drawDoor"));

  it("uses the chip's own control and not a second cycle", () => {
    // SAME CLASSES, SAME GLYPHS, SAME THREE-STATE CYCLE, so one habit is one
    // control wherever a reader meets it — and `nextHabitState` is not
    // re-implemented here, which is the drift that would give the section and
    // the cell different ideas of what follows ✗.
    // TWO DIFFERENT ELEMENTS (1.0.61). `wireHabit` has taken the mark and the
    // press apart since it was written, and the reader's *"the boolean name can
    // become its toggle"* is simply the first caller to use that: the mark is a
    // span inside the button and the press is the button round the name.
    // Passing one element twice is the mutant this kills.
    expect(code).toContain("wireHabit(deps, box, press, entry.def, ctx,");
    // EACH ROW READS ITS OWN HABIT'S WEEK, by the id of the tracker that row
    // is — one strip shared by every row is a plausible optimisation and a
    // wrong answer four rows out of five.
    //
    // ASSERTED AS A SHAPE, NOT A LINE (1.0.56). Both row builders call this and
    // the call is wrapped across five lines in each, so a single string would
    // be asserting the formatter. What must hold is that the ARGUMENT is the
    // row's own tracker: a `habits[0].id` or a hoisted `readings` would both
    // fail this, and both are the mistake it exists to catch.
    expect(code.match(/habitWeekReadings\(/g)).toHaveLength(2);
    expect(code.match(/entry\.def\.id,\s+iso\s+\)/g)).toHaveLength(2);
    // AND THE ROW IS NAMED BY THE NOTE'S OWN LINE, not by the registry: an
    // inline `tracker:<id>|Label` names this habit here, exactly as it names
    // the chip the grid would have drawn.
    expect(code).toContain("habitLabelOf(entry.def, entry.directive)");
    expect(code).not.toContain("nextHabitState");
    // THE BOX IS THE PRESS, NOT THE ROW: a row-wide target would make a click
    // on Wednesday's dot tick today, which is the one gesture this must not
    // have, since six of the seven dots are other notes.
    expect(code).not.toContain("wireHabit(deps, row,");
  });

  it("draws the strip on a daily entry only, and marks this entry's column", () => {
    // AND THE REASON IS NOT LAYOUT. The box writes the HOST note's property,
    // so on a weekly entry the seven columns would be seven other notes and a
    // tick would move nothing beside it — a control and a readout disagreeing
    // on one row about one habit.
    expect(code).toContain("const week = grain === \"daily\" ? habitWeek(iso) : [];");
    expect(code).toContain("if (week.length) {");
    expect(src).toContain("The box writes the HOST note's");
    // ONE MARK, ON THE COLUMN'S HEAD, not on each of the seven dots under it.
    expect(code).toContain("if (day.iso === iso) head.addClass(\"is-now\");");
    // AND THE HOST'S OWN DOT FOLLOWS A TICK, repainted from the same function
    // the first paint used: this entry's column is one of the seven, so a tick
    // that did not move it would read as a bug in the strip.
    const wired = boolRow();
    expect(wired).toContain("dots.find(({ day }) => day.iso === iso)");
    expect(wired).toContain("paintDay(");
    expect(wired).toContain("written: true");
  });

  // ── the second column (1.0.56) ────────────────────────────────────────

  it("splits by type into two independent grids, and collapses to one", () => {
    // THE READER'S CALL: *"one side for boolean habits and the other for ...
    // stepper ... trackers"*. Asserted as the filter rather than the drawing,
    // because the filter is where a `!==` would silently put every habit in
    // one column.
    expect(code).toContain(
      'const booleans = entries.filter((e) => habitTypeOf(e.def) === "boolean")'
    );
    expect(code).toContain(
      'const numbers = entries.filter((e) => habitTypeOf(e.def) === "number")'
    );
    // TWO CALLS TO `column`, which is what makes them two grids — the 1.0.31
    // two-grid trap is rows within ONE list, and these must not share tracks.
    // TWO CALLS TO `column`, EACH NAMING ITS KIND (1.0.61) — the two sides no
    // longer have the same tracks, since the boolean's control is its name and
    // the number's is one button, so the list has to know which it is.
    expect(code).toContain('column(pair, "boolean", week, iso)');
    expect(code).toContain('column(pair, "number", week, iso)');
    expect(code.match(/= column\(pair, /g)).toHaveLength(2);
    expect(code).toContain('createDiv({ cls: `ca-habits-list is-${kind}` })');
    // AND A LONE COLUMN DRAWS FULL WIDTH. Every shipped preset is all-boolean,
    // so this is the common case and not the edge one.
    expect(code).toContain(
      'pair.toggleClass("is-single", !booleans.length || !numbers.length)'
    );
    // TWO TRACKS, AND ONE WHEN A COLUMN IS EMPTY. Asserted as the track lists
    // themselves: a pair declared `1fr` draws one column with both lists
    // stacked inside it, which looks like the collapse and is not it.
    expect(cssRule(".ca-habits-pair")).toContain(
      "grid-template-columns: 1fr 1fr"
    );
    expect(cssRule(".ca-habits-pair.is-single")).toContain(
      "grid-template-columns: 1fr"
    );
    // THE DIVIDER IS BESIDE THE COLUMNS AND BETWEEN THEM, which is the one
    // thing a container-query collapse has to remember to move: an inline-start
    // border on a stacked list is a rule down the left of the second half.
    expect(cssRule(".ca-habits-col + .ca-habits-col")).toContain(
      "border-inline-start: var(--ca-rule-hair)"
    );
    const stacked = cssRules(".ca-habits-col + .ca-habits-col");
    expect(stacked).toHaveLength(2);
    expect(stacked[1]).toContain("border-inline-start: none");
    expect(stacked[1]).toContain("border-block-start: var(--ca-rule-hair)");
    expect(cssRules(".ca-habits-pair")).toHaveLength(2);
  });

  it("gives a number row the entry's own stepper, repainting its bar", () => {
    const body = numRow();
    // ── THE STEPPER IS GONE FROM THIS ROW (1.0.61) ──────────────────────
    //
    // *"make unit clickable to bring up a dialogue to alter the count (this
    // would save some horizontal space by leaving plus and minus buttons
    // out)."* The figure and the unit are ONE button, which is what gives a
    // habit with no declared unit — most of them — something to aim at.
    expect(body).not.toContain("buildStepper(");
    expect(body).toContain('cls: "ca-habits-reading"');
    expect(body).toContain("readingText(reading, entry.def.unit)");
    // AND `buildStepper` IS STILL THE GRID'S CONTROL. Only a habit this section
    // has taken over stops drawing one; `dead-code.test.ts` is the other half.
    expect(readSrc("controls")).toContain("export function buildStepper(");
    expect(body).toContain("ca-habit-spark");
    // THE RANGE IS CAPTURED ONCE AND NOT RECOMPUTED ON A STEP, or the other six
    // bars jump around while the reader steps one number.
    expect(body).toContain("paintBar(");
    const at = body.indexOf("const repaint");
    expect(at).toBeGreaterThan(0);
    const inside = body.slice(at, body.indexOf("if (!week.length) return;"));
    expect(inside).not.toContain("Math.min(");
    expect(inside).not.toContain("Math.max(");
  });

  // ── THE NAME BECAME THE TOGGLE (1.0.61) ────────────────────────────────
  it("presses the name and marks it, with no box of its own", () => {
    const row = boolRow();
    // THE 20px BOX IS GONE FROM THIS CARD. *"The boolean box is too heavy."* On
    // the narrower of two columns it was a fifth of the row spent on a control
    // the reader was aiming past.
    expect(row).not.toContain("ca-journal-habit-box");
    expect(row).toContain('cls: "ca-habits-toggle"');
    // THE MARK IS INSIDE THE BUTTON AND IN FRONT OF THE NAME, which is the
    // order on screen and so must be the order here.
    const mark = row.indexOf('cls: "ca-habits-mark"');
    const name = row.indexOf('cls: "ca-habits-name"');
    expect(mark).toBeGreaterThan(0);
    expect(name).toBeGreaterThan(mark);
    expect(row).toContain('const box = press.createSpan({ cls: "ca-habits-mark" })');
  });

  it("keeps the box's own argument now that the box is the name", () => {
    // *"A row-wide press target would make a click on Wednesday's dot tick
    // today"* — the one gesture this section must not have. The press is the
    // name button and stops there; `row` is never the press.
    const row = boolRow();
    expect(row).not.toMatch(/wireHabit\(deps, [a-z]+, row,/);
    expect(row).toContain("wireHabit(deps, box, press,");
  });

  it("draws the unanswered state as the mark's own base rule", () => {
    // `wireHabit` SETS NO TEXT FOR UNSET — `mark.setText(known === 1 ? "✓" :
    // known === 0 ? "✗" : "")` — so the third reading has to come from the
    // element being empty, which makes the base rule the last of the three
    // exactly as `.ca-habit-day`'s is. A colour alone is not a mark.
    expect(readSrc("tracker-controls")).toContain(
      'mark.setText(known === 1 ? "✓" : known === 0 ? "✗" : "")'
    );
    expect(cssRule(".ca-habits-mark:empty::before")).toContain("content:");
    expect(cssRule(".ca-habits-mark.is-done")).toContain(
      "var(--interactive-accent)"
    );
    expect(cssRule(".ca-habits-mark.is-not-done")).toContain("var(--text-muted)");
  });

  it("resets the height of both new buttons", () => {
    // Memory `obsidian-button-height`: a chip-shaped `<button>` is 30px of
    // padded chrome until it is reset, and "no visual change" is the signature
    // of forgetting. Both of these are grid items in a 2px-gap list.
    for (const sel of [".ca-habits-toggle", ".ca-habits-reading"]) {
      const rule = cssRule(sel);
      expect(rule, sel).toContain("height: auto");
      expect(rule, sel).toContain("min-height: 0");
      expect(rule, sel).toContain("box-shadow: none");
    }
    // AND THE BUTTON IS THE TRACK'S ITEM NOW, so it is the thing that has to be
    // allowed to be narrow — `.ca-habits-name`'s ellipsis only works if what
    // contains it can shrink.
    expect(cssRule(".ca-habits-toggle")).toContain("min-width: 0");
  });

  it("left-aligns the toggle and sizes its surface to the name", () => {
    // *"Booleans should be left side aligned not centred and the surface should
    // grow depending on the tracker's text length."* Two faults, one
    // declaration each, and the first is the one worth recording: the button is
    // a FLEX container, so `text-align: start` positions nothing — the items
    // are placed by `justify-content`, which was never set and whose initial
    // value a plain Obsidian `<button>` does not keep.
    const rule = cssRule(".ca-habits-toggle");
    expect(rule).toContain("justify-content: flex-start");
    // AND THE SURFACE IS THE NAME'S. A grid item stretches to its track, so
    // four habits of four lengths drew four identical full-width bars.
    expect(rule).toContain("justify-self: start");
    // WITH A CEILING, so the one name too long for the column still ellipses
    // instead of taking the week off the card.
    expect(rule).toContain("max-width: 100%");
    // ONE RULE, NOT TWO. A second `.ca-habits-toggle` block is the shape that
    // later disagrees with itself about the reset above.
    expect(cssRules(".ca-habits-toggle")).toHaveLength(1);
  });

  it("marks a number habit's name with a colon, and no boolean's", () => {
    // *"Number trackers should have a colon, then the number and unit button."*
    // PUNCTUATION AND NOT CONTENT: the name is also the row's tooltip and the
    // window's heading, and `Reading:` is not what that habit is called — so it
    // is drawn by the stylesheet and never written into the text node.
    expect(cssRule(".ca-habits-row-number .ca-habits-name::after")).toContain(
      'content: ":"'
    );
    expect(numRow()).not.toContain('`${name}:`');
    // AND THE BOOLEAN COLUMN TAKES NONE — its name is a control, and a colon
    // after a thing you press labels something that is not there.
    expect(cssRules(".ca-habits-name::after")).toHaveLength(0);
  });

  it("bands alternate rows, in one box and not in cells", () => {
    // *"Give both columns / the whole surface zebra pattern rows."*
    //
    // A `display: contents` ROW HAS NO BOX AND CANNOT BE PAINTED, which is the
    // whole of the problem: every row's cells are the LIST's grid items, which
    // is the 1.0.31 fix and is what keeps the day letters over the dots they
    // name. Subgrid gives the row its box back without taking the tracks away —
    // the same move `94-native-tables.css` made for the record tables.
    const sub = cssRules(".ca-habits-row");
    expect(sub).toHaveLength(2);
    // THE FALLBACK IS YESTERDAY'S LAYOUT. Outside `@supports` the row is still
    // `display: contents` and simply has no band.
    expect(sub[0]).toContain("display: contents");
    expect(sub[1]).toContain("grid-template-columns: subgrid;");
    // SPANNING EVERY COLUMN, or the band stops at the name.
    expect(sub[1]).toContain("grid-column: 1 / -1;");
    // AND THE BAND IS ON THE ROW, NEVER ON THE CELLS. The column gap falls
    // BETWEEN tracks, so painted cells would draw a band with a slit down it at
    // every track boundary — a zebra that reads as a rendering fault.
    expect(cssRules(".ca-habits-row > *")).toHaveLength(0);
    expect(cssRule(".ca-habits-row:nth-child(odd)")).toContain(
      "background: var(--ca-zebra)"
    );
    // THE HEADS ROW IS CHILD 1, so the odd children are the SECOND habit row,
    // the fourth, and so on — a zebra that begins with a band under the first
    // row reads as a selection. `column` draws the heads whether or not there
    // is a week (1.0.62), which is what makes that true on a weekly entry too.
    expect(cssRules(".ca-habits-row:nth-child(even)")).toHaveLength(0);
    expect(cssRules(".ca-habits-heads:nth-child(odd)")).toHaveLength(0);
    const col = code.slice(
      code.indexOf("function column("),
      code.indexOf("function drawBoolRow")
    );
    expect(col).toContain('createDiv({ cls: "ca-habits-heads" })');
    // THE ROW GAP BECOMES THE ROW'S OWN PADDING, or the bands are a column of
    // pills with 2px of unpainted list between them.
    expect(cssRules(".ca-habits-list").at(-1)).toContain("row-gap: 0");
    expect(sub[1]).toContain("padding-block: 2px");
  });

  it("paints both zebras from one token, declared on `body`", () => {
    // TWO LISTS BANDED BY TWO COPIES OF ONE MAGIC NUMBER is the shape that
    // later disagrees with itself about what a band is. The events rollup has
    // banded its days since 4.62 with this exact mix; 1.0.63 made it a token
    // and pointed both at it.
    expect(cssRule(".ca-jer-day:nth-child(even)")).toContain(
      "background: var(--ca-zebra)"
    );
    // NEITHER BAND SPELLS THE MIX ITSELF ANY MORE — which is the whole claim,
    // and it is about the two ZEBRAS and not about the value. The same 4% of
    // the ink is written twice more in this plugin, on `.ca-journal-bar-chip`
    // and `.jc-yearnav`, and both must keep it: those are control SURFACES —
    // *"a shade above the recessed band it sits on, so the pill reads as a
    // control resting on the navigator rather than a hole cut into it"* — and a
    // token that unified a band with a chip would have to be moved for one of
    // them one day. One number, two decisions.
    for (const rule of [
      cssRule(".ca-jer-day:nth-child(even)"),
      cssRule(".ca-habits-row:nth-child(odd)"),
    ]) {
      expect(rule).not.toContain("color-mix(");
    }
    // ON `body` AND NOT `:root` (4.42). It is a mix over `--text-normal`, which
    // is a theme colour — and Obsidian declares its colours on `body`, so the
    // same token on `:root` resolves to nothing and every band draws
    // `currentColor`. `tokens.test.ts` holds the general rule; this is the
    // reading that would have broken.
    expect(cssRule("body")).toContain("--ca-zebra:");
    expect(cssRule(":root")).not.toContain("--ca-zebra:");
    // A READING AID, NOT A TABLE: 4% of the ink is legible as a band and
    // illegible as a fill, so a row nobody selected cannot look selected.
    expect(cssRule("body")).toContain(
      "--ca-zebra: color-mix(in srgb, var(--text-normal) 4%, transparent)"
    );
  });

  it("keeps the habit names off the column divider", () => {
    // *"Fix number columns margin so tracker titles are not pressed up against
    // the column's dividing line."* The gutter was `--ca-space-2`, and this
    // scale's unit is 2px — four pixels either side of a border, which reads as
    // an underline on the text beside it rather than as a divider.
    expect(cssRule(".ca-habits-col")).toContain(
      "padding-inline: var(--ca-space-4)"
    );
    expect(cssRule(".ca-habits-col")).not.toContain(
      "padding-inline: var(--ca-space-2)"
    );
    // AND THE COLLAPSE STILL CLOSES IT. A stacked pair has no divider beside
    // the columns, so a gutter there is indent for nothing.
    expect(cssRules(".ca-habits-col")[1]).toContain("padding-inline: 0");
  });

  // ── THE READING IS THE DOOR (1.0.61) ───────────────────────────────────
  it("opens a window on the reading, and repaints from its save", () => {
    const row = numRow();
    expect(row).toContain("new HabitReadingWindow(");
    // AND ALL THREE READOUTS MOVE WITH IT: the button's figure, the row's
    // muting, and this entry's own bar in the week beside it.
    //
    // SLICED TO THE CALLBACK, which `vacuous-sweep-rule` is the reason for.
    // `say()` is called twice in this row — once here and once as the initial
    // paint — so a `toContain` over the whole function was satisfied by the
    // call that had not been mutated. Measured: the mutant survived.
    const from = row.indexOf("async (value: number | null) => {");
    const to = row.indexOf(").open();");
    expect(from).toBeGreaterThan(0);
    expect(to).toBeGreaterThan(from);
    const save = row.slice(from, to);
    expect(save).toContain("await deps.write(ctx, entry.def.id, value)");
    expect(save).toContain("reading = value;");
    expect(save).toContain("say();");
    expect(save).toContain("repaint(value);");
  });

  it("spells the figure and its unit in one place", () => {
    // THE ROW AND THE WINDOW CANNOT DISAGREE, because there is one function and
    // the row's button is built from it.
    expect(readingText(5, "km")).toBe("5 km");
    expect(readingText(5, undefined)).toBe("5");
    // `—` IS `buildStepper`'S OWN EMPTY READING, so a number habit reads the
    // same before and after it left the stepper behind.
    expect(readingText(null, "km")).toBe("—");
    expect(readSrc("controls")).toContain('const shown = known == null ? "—"');
  });

  it("matches each column's head spacers to its own track count", () => {
    // THE INVARIANT THAT IS SILENT WHEN BROKEN. The heads row is
    // `display: contents`, so a spacer too few puts every day letter one column
    // to the left — over the names instead of over the marks — and a spacer too
    // many pushes the strip out of the grid entirely. The counts differ by kind
    // as of 1.0.61, which is the whole reason `column` takes one.
    const col = code.slice(
      code.indexOf("function column("),
      code.indexOf("function drawDoor")
    );
    const before = col.slice(0, col.indexOf('cls: "ca-habit-week"'));
    expect(before.match(/heads\.createSpan/g)).toHaveLength(2);
    expect(before).toContain(
      'if (kind === "number") heads.createSpan({ cls: "ca-habits-pad" })'
    );
  });

  it("names each column in its head, in the reader's own two words", () => {
    // *"Label each column on the left side (opposite weekday letters) as
    // Booleans/Units."* The head cell in front of the day letters used to be an
    // empty span holding its place in the grid, and nothing on the card said
    // what the split down the middle of it was.
    const col = code.slice(
      code.indexOf("function column("),
      code.indexOf("function drawBoolRow")
    );
    expect(col).toContain('cls: "ca-habits-name ca-habits-head-name"');
    expect(col).toContain('text: kind === "boolean" ? "Booleans" : "Units"');
    // IN THE NAME'S TRACK, which is what "opposite the weekday letters" means
    // in a grid: the label keeps `.ca-habits-name` so it lands in the same
    // track every habit's name does, and takes a second class for its own size.
    expect(cssRule(".ca-habits-head-name")).toContain("var(--text-muted)");
    expect(cssRule(".ca-habits-head-name")).toContain(
      "font-size: var(--ca-text-2xs)"
    );
  });

  it("draws the heads row, and the week's track, only when there is a week", () => {
    // A LAYOUT DEFECT OLDER THAN THE LABELS. A non-daily entry gets rows and no
    // strip, and `column` used to return before building the heads at all —
    // while the grid's template still carried a week track nothing filled. Auto
    // placement runs on, so the second row's name landed in the first row's
    // empty week column and the list drew in zigzag.
    const col = code.slice(
      code.indexOf("function column("),
      code.indexOf("function drawBoolRow")
    );
    // THE LABEL IS NOT THE WEEK'S, so the early return moved BELOW the heads.
    const heads = col.indexOf('createDiv({ cls: "ca-habits-heads" })');
    const bail = col.indexOf("if (!week.length) return list;");
    const strip = col.indexOf('cls: "ca-habit-week"');
    expect(heads).toBeGreaterThan(0);
    expect(bail).toBeGreaterThan(heads);
    expect(strip).toBeGreaterThan(bail);
    // ONE DECISION, NOT TWO. The class is set from the same `week.length` the
    // strip is drawn from, so a template with a track and a row without a cell
    // for it cannot drift apart.
    expect(col).toContain('list.toggleClass("has-week", week.length > 0)');
  });

  it("normalises a bar over the week's own range, flat weeks included", () => {
    // `drawStrip`'s RULE, not the tracker's declared min/max: a 0–10000 step
    // counter whose week sits between 8000 and 9000 would otherwise draw seven
    // bars at the floor.
    expect(sparkFraction(5, 0, 10)).toBeCloseTo(0.5);
    expect(sparkFraction(0, 0, 10)).toBe(0);
    expect(sparkFraction(10, 0, 10)).toBe(1);
    expect(sparkFraction(8500, 8000, 9000)).toBeCloseTo(0.5);
    // A FLAT WEEK IS FULL HEIGHT. "Every day the same" is not "every day the
    // least" — the boundary a `span === 0 ? 0` would quietly invert.
    expect(sparkFraction(4, 4, 4)).toBe(1);
    expect(sparkFraction(0, 0, 0)).toBe(1);
  });

  it("floors a drawn bar so the least day is not an empty column", () => {
    // A 0%-tall bar cannot be told from the day nobody wrote, which is the one
    // distinction `HabitReading.written` exists to carry.
    expect(SPARK_FLOOR).toBe(12);
    expect(sparkHeight(0)).toBe("12%");
    expect(sparkHeight(1)).toBe("100%");
    expect(sparkHeight(0.5)).toBe("56%");
    // AND AN UNWRITTEN DAY GETS NO HEIGHT AT ALL — `drawStrip`'s rule that the
    // gaps are the information, so the column keeps its slot and the
    // stylesheet gives it a hairline.
    expect(code).toContain('bar.style.removeProperty("height")');
    expect(readCss()).toMatch(/\.ca-habit-spark-bar\.is-blank\b/);
  });

  it("says what is behind the door, and refuses it on a managed template", () => {
    expect(habitsDoorLabel(0)).toBe("Add a habit");
    expect(habitsDoorLabel(3)).toBe("Manage habits");
    // REFUSED RATHER THAN HIDDEN, which is the cell's own rule for the same
    // control: a template's tracker list is generated from Settings, so a
    // control that edited it would be writing what the next sync deletes. The
    // rows still draw — a template holding habits still has to show them.
    expect(code).toContain("if (isManagedTemplate(deps.plugin, ctx.sourcePath)) door.disabled = true;");
    // AND THE EMPTY ANSWER IS A CALLOUT, as every pointable widget's is.
    expect(code).toContain("emptyCallout(");
    expect(code).toContain("No habits on this entry yet.");
    // "remove", never the other word (1.0.43), and no retired vocabulary.
    expect(src).not.toMatch(/\bdelete a habit\b/i);
  });

  it("tells a logged number row from an unanswered one, which its name follows", () => {
    // THE SOURCE HALF OF THE SAME FIX. The class is set from the entry's own
    // current value — so a row drawn on a note that already has a reading is
    // not muted — and added again when the stepper writes, because
    // `buildStepper` always writes a number and there is no path through it
    // that clears a reading back to nothing.
    const num = numRow();
    expect(num).toContain(
      "let reading = readHabitNumber(deps.currentValue(ctx, entry.def.id))"
    );
    expect(num).toContain('row.toggleClass("is-logged", reading != null)');
    // ── AND IT HAS TO COME BACK OFF AGAIN (1.0.61) ──────────────────────
    //
    // `row.addClass("is-logged")` was right while a stepper was the only
    // control: there is no path through plus and minus that takes a reading
    // back to nothing, so a stepped row was logged by definition. The window
    // can CLEAR one — an empty field is a real answer — so a one-way `addClass`
    // would leave a cleared habit drawn as though it still had a value.
    expect(num).toContain('row.toggleClass("is-logged", value != null)');
    expect(num).not.toContain('row.addClass("is-logged")');
  });

  it("is one grid and not a grid per row", () => {
    // THE 1.0.31 RECORDS-TABLE BUG, which this shape would have reproduced: an
    // `auto` track is sized by the content of ITS OWN grid, so a heads row
    // carrying an empty span and habit rows carrying a 1.6em box would size
    // their first track differently and the column letters would sit beside
    // the dots they name rather than over them.
    // EACH KIND'S OWN TRACK LIST (1.0.61): the boolean column's control IS its
    // name, so it is two tracks; the number's is name, reading, spark.
    //
    // THE SEMICOLON IS LOAD-BEARING. `minmax(0, 1fr) auto auto` CONTAINS
    // `minmax(0, 1fr) auto`, so without it the boolean column's assertion was
    // satisfied by the number column's track list and a mutant giving both
    // three tracks survived. Measured, which is the only way that shape is
    // ever found — `vacuous-sweep-rule`'s first shape, on a declaration
    // instead of a class name.
    //
    // AND THE WEEK IS A TRACK ONLY WHEN THERE IS A WEEK (1.0.62). Four
    // templates, not two: a non-daily entry draws no strip, and a template
    // carrying a track nothing fills wraps the next row's first cell into it.
    expect(cssRule(".ca-habits-list.is-boolean")).toContain(
      "grid-template-columns: minmax(0, 1fr);"
    );
    expect(cssRule(".ca-habits-list.is-boolean.has-week")).toContain(
      "grid-template-columns: minmax(0, 1fr) auto;"
    );
    // THE NUMBER'S NAME TRACK IS `max-content` (1.0.62), which is what puts the
    // reading against its own name instead of against the strip: *"number
    // trackers should have a colon, then the number and unit button, aligned on
    // the left side"*. The slack moved to the reading's track, and
    // `.ca-habits-reading` is justified to the start of it.
    expect(cssRule(".ca-habits-list.is-number")).toContain(
      "grid-template-columns: minmax(0, max-content) minmax(0, 1fr);"
    );
    expect(cssRule(".ca-habits-list.is-number.has-week")).toContain(
      "grid-template-columns: minmax(0, max-content) minmax(0, 1fr) auto;"
    );
    expect(cssRule(".ca-habits-reading")).toContain("justify-self: start;");
    // `minmax(0, …)` AND NOT BARE `max-content`: a grid item's automatic
    // minimum is its content, so a habit named at length would push the strip
    // off the card rather than ellipsing.
    expect(cssRule(".ca-habits-list.is-number")).not.toContain(
      "grid-template-columns: max-content"
    );
    // AND STILL ONE GRID PER LIST, with the row carrying no tracks of its own.
    expect(cssRule(".ca-habits-list")).toContain("display: grid");
    expect(cssRule(".ca-habits-list")).not.toContain("grid-template-columns");
    expect(cssRule(".ca-habits-heads")).toContain("display: contents");
    expect(cssRule(".ca-habits-row")).toContain("display: contents");
    // SEVEN EQUAL TRACKS, so Tuesday is under Tuesday on every row.
    expect(cssRule(".ca-habit-week")).toContain("grid-template-columns: repeat(7, 1fr)");
    // `minmax(0, 1fr)` AND NOT `1fr`: a grid item's automatic minimum is its
    // content, so a long habit name would push the week off the card instead
    // of truncating, which looks like a layout bug rather than a long name.
    expect(cssRule(".ca-habits-name")).toContain("text-overflow: ellipsis");
    // ── THE NAME'S CONTRAST, PER TYPE (1.0.56) ───────────────────────────
    //
    // A NUMBER ROW NEVER WEARS `is-done` OR `is-not-done` — a stepper has no
    // such reading — so the boolean rule muted every number habit's name
    // permanently, including on a day with 10 km in it. Found before it
    // shipped, and this is the pair of selectors that separates the two types:
    // the boolean rule must EXCLUDE the number row, and the number row must
    // have its own state class.
    const muted = cssRule(
      ".ca-habits-row:not(.ca-habits-row-number):not(.is-done):not(.is-not-done) .ca-habits-name"
    );
    expect(
      cssRule(".ca-habits-row-number:not(.is-logged) .ca-habits-name")
    ).toContain("var(--text-muted)");
    expect(muted).toContain("var(--text-muted)");
    expect(cssRules(".ca-habits-row:not(.is-done):not(.is-not-done) .ca-habits-name")).toHaveLength(0);
    // THE MARK IS A SIZE AND A FILL, which is how three readings fit on one dot
    // without a third colour: nothing-recorded is the SMALL faint base form,
    // and a reading grows it. A base that was already dot-sized would make an
    // empty week look like a kept one.
    const dot = cssRule(".ca-habit-day");
    expect(dot).toContain("width: 3px");
    expect(dot).toContain("var(--text-faint)");
    expect(cssRule(".ca-habit-day.is-not-done")).toContain("width: 9px");
    expect(cssRule(".ca-habit-day.is-done")).toContain("var(--interactive-accent)");
    expect(cssRule(".ca-habit-day.is-not-done")).toContain("inset 0 0 0");
    // AND THIS ENTRY'S COLUMN IS NAMED BY TWO THINGS, because a colour alone is
    // not a mark for a reader who cannot see it as one.
    const now = cssRule(".ca-habit-dow.is-now");
    expect(now).toContain("var(--text-accent)");
    expect(now).toContain("font-weight: 600");
    // THE DOOR IS A CHIP, AND AN OBSIDIAN `<button>` IS 30px UNTIL TOLD
    // OTHERWISE — the two lines whose absence looks right in a mockup.
    const door = cssRule(".ca-habits-door");
    expect(door).toContain("height: auto");
    expect(door).toContain("min-height: 0");
    expect(door).toContain("dashed");
  });
});

// ── THE READING WINDOW (1.0.61) ───────────────────────────────────────────
//
// The control the stepper's three buttons became. A stepper could reach 10 km
// from 0 in twenty presses, could not reach 7.5 at all unless `step` said so,
// and could never get a reading back to nothing.
describe("boundsNote", () => {
  const def = (over: Record<string, unknown> = {}) =>
    ({ id: "Run", label: "Run", type: "number", ...over }) as TrackerDef;

  it("names both bounds, one bound, or neither", () => {
    expect(boundsNote(def({ min: 0, max: 10, unit: "km" }))).toBe(
      "Between 0 and 10 km"
    );
    expect(boundsNote(def({ min: 0, unit: "km" }))).toBe("0 km or more");
    expect(boundsNote(def({ max: 10, unit: "km" }))).toBe("10 km or less");
  });

  it("does not announce the absence of a rule", () => {
    // BLANK IS THE COMMON CASE — `newHabitDef`'s own note on why — and a
    // subtitle reading "No limit" is louder about the rule than the rule.
    expect(boundsNote(def({ unit: "km" }))).toBe("A number of km");
    expect(boundsNote(def({}))).toBe("A number");
  });

  it("is zero-safe on both sides", () => {
    // `min: 0` IS A BOUND AND `!min` IS NOT THE TEST. A habit floored at zero
    // is the ordinary shape for anything counted, and a `!= null` that became a
    // truthiness check would drop it silently.
    expect(boundsNote(def({ min: 0 }))).toBe("0 or more");
    expect(boundsNote(def({ max: 0 }))).toBe("0 or less");
  });
});

describe("the reading window's own shape", () => {
  const src = readSrc("habit-reading-window");
  const code = readCode("habit-reading-window");

  it("reads the field once, for the refusal and for the write", () => {
    // TWO CALLERS MUST AGREE: a window that validated one reading of the field
    // and stored another is the defect this shape makes unreachable.
    expect(code).toContain("private parsed(): number | null {");
    expect(fnBodyOf(code, "validate")).toContain("const value = this.parsed()");
    expect(fnBodyOf(code, "commit")).toContain("const value = this.parsed()");
  });

  it("lets an empty field clear the reading", () => {
    // THE ONLY CONTROL THAT EVER COULD. There is no path through plus and minus
    // that takes a number back to nothing, which is why a stepped row was
    // logged by definition. Asserted as the guard, not the comment.
    expect(code).toContain('if (!raw) return null;');
    expect(fnBodyOf(code, "validate")).toContain("if (value == null) return null;");
  });

  it("refuses a number outside the range rather than clamping it", () => {
    // `buildStepper` CLAMPS AND IS RIGHT TO: a `+` press past the ceiling has
    // no other sensible answer. A reader who TYPED 40 into a field bounded at
    // 10 meant something, and silently writing 10 while they watch is the
    // window reporting a value it did not store.
    const v = fnBodyOf(code, "validate");
    expect(v).toContain("if (this.def.min != null && value < this.def.min)");
    expect(v).toContain("if (this.def.max != null && value > this.def.max)");
    expect(v).not.toContain("Math.min(");
    expect(v).not.toContain("Math.max(");
    // AND THE REFUSAL IS THE SUBTITLE'S OWN SENTENCE, so the window cannot
    // offer one rule and enforce another.
    expect(v.match(/boundsNote\(this\.def\)/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("takes its step off the definition", () => {
    expect(code).toContain("step: String(this.def.step ?? 1)");
  });

  it("leaves Enter to the frame", () => {
    // 1.0.59: the frame's `contentEl` listener submits from a single-line field
    // UNLESS that field claimed the keystroke. A number box claims nothing, so
    // Enter saves for free — and a `keydown` here would be the one thing that
    // broke it.
    expect(code).not.toContain("keydown");
    expect(readSrc("editor-modal")).toContain("if (e.defaultPrevented) return;");
  });

  it("steps by the definition's own step, and clamps where typing is refused", () => {
    // *"Number edit window should have the plus/minus buttons which increment
    // in the step."* They left the ROW in 1.0.61 and stay gone from it; a
    // window has room for both, and the two readings are different gestures —
    // `7.5` is typed, one more page is pressed.
    const def = (over: Record<string, unknown> = {}) =>
      ({ id: "x", label: "X", type: "number", ...over }) as never;
    expect(stepReading(3, 1, def())).toBe(4);
    expect(stepReading(3, -1, def())).toBe(2);
    // THE STEP COMES OFF THE DEFINITION, which is the whole of the ask.
    expect(stepReading(3, 1, def({ step: 0.5 }))).toBe(3.5);
    expect(stepReading(3, -1, def({ step: 5 }))).toBe(-2);
    // A PRESS CLAMPS WHERE A TYPED NUMBER IS REFUSED — `buildStepper`'s rule,
    // and not an inconsistency: a `+` past the ceiling has no other answer and
    // the reader watches the number stop.
    expect(stepReading(10, 1, def({ max: 10 }))).toBe(10);
    expect(stepReading(0, -1, def({ min: 0 }))).toBe(0);
    // NOTHING RECORDED STEPS FROM THE BASE, which is `buildStepper`'s
    // `known ?? def.min ?? 0` — a habit stepped here and stepped in the 66px
    // grid must land on the same number.
    expect(stepReading(null, 1, def())).toBe(1);
    expect(stepReading(null, 1, def({ min: 5 }))).toBe(6);
    // AND SO DOES A GARBLED FIELD. `parsed()` answers NaN for text that is not
    // a number, and `NaN + 1` is a reading nothing downstream can use.
    expect(stepReading(NaN, 1, def())).toBe(1);
    // ROUNDED AT THE SIXTH DECIMAL, because `0.1 + 0.2` is not `0.3` and a
    // habit counted in tenths would collect a tail of noughts in frontmatter.
    expect(stepReading(0.1, 1, def({ step: 0.2 }))).toBe(0.3);
  });

  it("keeps the same arithmetic the 66px grid's stepper does", () => {
    // ONE OPINION ABOUT WHAT A STEP IS. Asserted against `buildStepper`'s own
    // source, because the defect this guards is the two drifting apart — a
    // habit that reads 10 after a press here and 10.000000001 after one there.
    const stepper = readCode("controls");
    expect(stepper).toContain("if (def.min != null) clamped = Math.max(def.min, clamped)");
    expect(stepper).toContain("if (def.max != null) clamped = Math.min(def.max, clamped)");
    expect(stepper).toContain("Math.round(clamped * 1e6) / 1e6");
    expect(stepper).toContain("(known ?? def.min ?? 0) - step");
    // SLICED TO THE FUNCTION. `fnBodyOf` above is the member slicer and this is
    // a top-level export, and a slice that ran to end of file would be
    // satisfied by the class below it — 1.0.51's survivor, which is why the
    // end is `export class` and is checked for having been found.
    const start = code.indexOf("export function stepReading");
    const end = code.indexOf("export class HabitReadingWindow");
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const mine = code.slice(start, end);
    expect(mine).toContain("def.min ?? 0");
    expect(mine).toContain("def.step ?? 1");
    expect(mine).toContain("Math.max(def.min, next)");
    expect(mine).toContain("Math.min(def.max, next)");
    expect(mine).toContain("Math.round(next * 1e6) / 1e6");
  });

  it("gives the field its focus back after a press", () => {
    // THE PROMISE THIS KEEPS IS ENTER. The frame submits on Enter from a
    // single-line field, so a press that left focus on the button would make
    // the next Enter press `+` again instead of saving — which is the one
    // gesture 1.0.59 exists to have got right.
    //
    // SLICED TO THE HANDLER: `box.focus()` is called twice in this window, here
    // and in the initial `setTimeout`, so a sweep of the whole function would
    // be satisfied by the call that was not mutated — `vacuous-sweep-rule`'s
    // third shape, measured on this very file in 1.0.61.
    const from = code.indexOf("for (const [btn, dir] of");
    const to = code.indexOf("window.setTimeout(");
    expect(from).toBeGreaterThan(0);
    expect(to).toBeGreaterThan(from);
    const handler = code.slice(from, to);
    expect(handler).toContain("this.draft = String(stepReading(this.parsed(), dir, this.def))");
    expect(handler).toContain("box.value = this.draft");
    expect(handler).toContain("this.clearError()");
    expect(handler).toContain("box.focus()");
    // BOTH BUTTONS, AND THEY BRACKET THE READING — `buildStepper`'s own order,
    // where the unit sits inside the value between the two.
    const down = code.indexOf("this.stepButton(row, -1)");
    const unit = code.indexOf('cls: "ca-habit-reading-unit"');
    const up = code.indexOf("this.stepButton(row, 1)");
    expect(down).toBeGreaterThan(0);
    expect(up).toBeGreaterThan(unit);
    expect(unit).toBeGreaterThan(down);
    // AND THEY ARE NOT 30px PILLS beside a 28px box — `obsidian-button-height`.
    const rule = cssRule(".ca-habit-reading-step");
    expect(rule).toContain("height: auto");
    expect(rule).toContain("min-height: 0");
    expect(code).toContain('attr: { type: "button"');
  });

  it("puts the unit beside the field and not inside it", () => {
    // A placeholder vanishes the moment the reader types, which is exactly when
    // they want to know what the number is being counted in.
    expect(code).toContain('cls: "ca-habit-reading-unit"');
    expect(src).not.toContain('placeholder: this.def.unit');
    expect(cssRule(".ca-habit-reading-row")).toContain("display: flex");
  });
});
