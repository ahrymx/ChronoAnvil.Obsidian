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
  addHabitRow,
  describeHabitState,
  habitWrites,
  habitsForSurface,
  habitsInFolder,
  hasHabit,
  newHabitDef,
  nextHabitState,
  normaliseHabitLabel,
  readHabitState,
  removeHabitRow,
  setHabitState,
  type HabitDraft,
  type HabitRow,
} from "../src/trackers/habits";
import { planDirectiveEdits } from "../src/trackers/entry-trackers";
import {
  anySurface,
  diarySurface,
  journalSurface,
  normalizeTrackers,
  type TrackerDef,
} from "../src/trackers/trackers";
import { readCode, readSrc, readCss, cssRule } from "./sources";

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

const row = (id: string, state: 1 | 0 | null = null): HabitRow => ({
  id,
  directive: `tracker:${id}`,
  label: id,
  state,
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
  ];

  it("is boolean trackers and nothing else", () => {
    // The same test `habitTrackerFor` applies before folding a directive into
    // the cell — written once, so the window cannot offer a row the cell would
    // refuse to draw.
    const ids = habitsForSurface(registry, null).map((t) => t.id);
    expect(ids).not.toContain("Mood");
    expect(ids).not.toContain("Steps");
    expect(ids).not.toContain("Tags");
  });

  it("leaves out a derived one, which has nothing to tick", () => {
    expect(habitsForSurface(registry, null).map((t) => t.id)).not.toContain(
      "Computed"
    );
  });

  it("offers a daily note what a daily note may log", () => {
    const ids = habitsForSurface(registry, diarySurface("daily")).map((t) => t.id);
    expect(ids).toEqual(["Medication", "Exercise", "Anywhere"]);
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
    const rows = setHabitState([row("A"), row("B"), row("C")], "B", 1);
    expect(rows.map((r) => r.id)).toEqual(["A", "B", "C"]);
    expect(rows[1].state).toBe(1);
  });

  it("returns new lists, so Cancel is free", () => {
    const before = [row("A")];
    addHabitRow(before, row("B"));
    removeHabitRow(before, "A");
    setHabitState(before, "A", 1);
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
      { id: "Med", directive: "tracker:Med|Morning meds", label: "Med", state: 1 },
    ];
    expect(habitWrites(before, draftOf([])).remove).toEqual([
      "tracker:Med|Morning meds",
    ]);
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
    expect(s).toContain("nextHabitState(row.state)");
    expect(s).toContain("setHabitState(this.rows, row.id,");
    expect(s).toContain("ca-journal-habit-box");
  });

  it("goes through the model rather than toggling the element", () => {
    // A box that painted itself without recording the answer is the oldest bug
    // in this shape: the draft is what Save reads.
    const s = src();
    const at = s.indexOf("box.addEventListener");
    expect(at).toBeGreaterThan(0);
    const body = s.slice(at, at + 700);
    expect(body).toContain("this.rows = setHabitState");
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

  it("reads the readings when the window opens, not when the cell was drawn", () => {
    // A chip ticked since the render wrote a value the cell's copy predates,
    // and the window would show the state from before the tick.
    const s = src();
    const at = s.indexOf("const rowsNow =");
    expect(at).toBeGreaterThan(0);
    expect(s.slice(at, at + 400)).toContain("readHabitState(deps.currentValue(");
    const open = s.indexOf("const openWindow = (): void =>", at);
    expect(s.slice(open, open + 600)).toContain("const before = rowsNow();");
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
