// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import { readCode, readCss } from "./sources";
import {
  grainsShowingCapture,
  logbookTargets,
  offersHostEntry,
} from "../src/diary/capture";
import { DEFAULT_LOGBOOKS, LOGBOOK_NOTE_KEY, type LogbookDef } from "../src/core/constants";
// THE FORMATTER MOVED TO THE GRAMMAR'S OWN MODULE IN 4.52 and so did its own
// describe block; what is left here reads it because a scale note IS a capture,
// stamped the same way.
import { formatLogItem } from "../src/diary/log-items";
import { currentEntryKey, labelForGrain } from "../src/diary/nav";
import { moment } from "../src/core/util";
import { TRACKER_CLASSES } from "../src/trackers/trackers";
import type AlmanacPlugin from "../src/main";
import {
  appendToNoteRegion,
  appendedSince,
  ensureNoteRegions,
  hasNoteRegion,
  joinRegionBlocks,
  readNoteRegion,
  reconcileRegionWrite,
  writeNoteRegion,
} from "../src/core/notestore";

// A note with a capture region holding `content`. Module-scoped since 4.27,
// when the merge tests below needed the same fixture the append tests use —
// two spellings of "a note with a region in it" is how the two describes end
// up asserting against subtly different notes.
const withRegion = (content: string): string =>
  writeNoteRegion("# Note\n", "capture", content);

describe("appendToNoteRegion", () => {

  it("appends to an empty region without a leading blank line", () => {
    const out = appendToNoteRegion(withRegion(""), "capture", "14:32 — first");
    expect(readNoteRegion(out, "capture")).toBe("14:32 — first");
  });

  it("separates successive captures by one blank line", () => {
    let text = withRegion("");
    text = appendToNoteRegion(text, "capture", "09:00 — one");
    text = appendToNoteRegion(text, "capture", "10:00 — two");
    expect(readNoteRegion(text, "capture")).toBe("09:00 — one\n\n10:00 — two");
  });

  it("preserves a multi-line block's own structure", () => {
    const block = "09:00 — one\n  continued";
    const out = appendToNoteRegion(withRegion("earlier"), "capture", block);
    expect(readNoteRegion(out, "capture")).toBe(`earlier\n\n${block}`);
  });

  it("creates the region when the note has none", () => {
    const out = appendToNoteRegion("# Note\n", "capture", "14:32 — first");
    expect(readNoteRegion(out, "capture")).toBe("14:32 — first");
  });

  it("is a no-op for empty input", () => {
    const before = withRegion("existing");
    expect(appendToNoteRegion(before, "capture", "   ")).toBe(before);
  });

  it("leaves other regions untouched", () => {
    let text = writeNoteRegion("# Note\n", "log", "my prose");
    text = appendToNoteRegion(text, "capture", "14:32 — captured");
    expect(readNoteRegion(text, "log")).toBe("my prose");
    expect(readNoteRegion(text, "capture")).toBe("14:32 — captured");
  });

  // Captures arrive all day; the region must not accumulate blank lines.
  it("stays stable across many appends", () => {
    let text = withRegion("");
    for (let i = 0; i < 5; i++) {
      text = appendToNoteRegion(text, "capture", `0${i}:00 — n${i}`);
    }
    const lines = readNoteRegion(text, "capture").split("\n");
    expect(lines.filter((l) => l === "")).toHaveLength(4);
    expect(lines.filter((l) => l.startsWith("0"))).toHaveLength(5);
  });
});

// Entries written before the capture field existed have no `capture` region.
// Capture has to work in them anyway — a feature that only works in entries
// created after it shipped is a feature most existing users never see work.
describe("capturing into an older entry", () => {
  const oldEntry = [
    "---",
    "journal-date: 2026-07-20",
    "---",
    "",
    "<!--almanac:log",
    "my prose",
    "-->",
    "",
    "<!--almanac:todo",
    "- ( ) task",
    "-->",
    "",
  ].join("\n");

  const seed = (text: string) =>
    ensureNoteRegions(text, ["capture"]) ?? text;

  it("creates the region on demand and appends into it", () => {
    const out = appendToNoteRegion(seed(oldEntry), "capture", "14:32 — new");
    expect(readNoteRegion(out, "capture")).toBe("14:32 — new");
  });

  it("leaves the entry's existing content alone", () => {
    const out = appendToNoteRegion(seed(oldEntry), "capture", "14:32 — new");
    expect(readNoteRegion(out, "log")).toBe("my prose");
    expect(readNoteRegion(out, "todo")).toBe("- ( ) task");
  });

  it("places the new region after the existing ones", () => {
    const seeded = seed(oldEntry);
    expect(seeded.indexOf("almanac:capture")).toBeGreaterThan(
      seeded.indexOf("almanac:todo")
    );
  });
});

// A scale context note is a tagged fragment run through the same capture
// formatter, so the two pure layers compose: the stamped line still parses back
// to the reading it's about. (The vault write itself, captureScaleNote, is
// thin glue over these + appendCapture and is exercised in the app.)
import { formatScaleNoteTag, parseScaleNoteLine } from "../src/journals/scale-notes";

describe("scale note as a capture line", () => {
  it("stamps a tagged fragment into a parseable capture line", () => {
    const frag = formatScaleNoteTag({ trackerId: "Mood", value: 4, text: "rough day" })!;
    const line = formatLogItem(frag, "09:14");
    expect(line).toBe("09:14 — [scale:Mood=4] rough day");
    expect(parseScaleNoteLine(line)).toEqual({
      trackerId: "Mood", value: 4, text: "rough day",
    });
  });

  it("stamps a bare (prose-less) note so the reading is still timestamped", () => {
    const frag = formatScaleNoteTag({ trackerId: "Energy", value: 2, text: "" })!;
    const line = formatLogItem(frag, "22:30");
    expect(line).toBe("22:30 — [scale:Energy=2]");
    expect(parseScaleNoteLine(line)!.trackerId).toBe("Energy");
  });
});

// Regression: the capture field and a scale note are two writers of one region.
// The scale note appends atomically; the capture field writes the *whole*
// region from its textarea. If the field ever writes a value it loaded before
// the append, it clobbers the note — which is why the live field must re-read
// from disk on external change (NoteFieldWatcher in widgets.ts). These pin the
// two write models so the coexistence stays understood.
describe("capture region: append vs whole-region write", () => {
  const withRegion = (content: string) =>
    writeNoteRegion("# Note\n", "capture", content);

  it("append preserves an earlier capture (the field must show both)", () => {
    let text = withRegion("23:05 — hmm");
    text = appendToNoteRegion(text, "capture", "23:05 — [scale:Mood=5] good day.");
    expect(readNoteRegion(text, "capture")).toBe(
      "23:05 — hmm\n\n23:05 — [scale:Mood=5] good day."
    );
  });

  it("a whole-region write of a stale value drops the appended note", () => {
    // This is the bug the live-refresh guards against, stated plainly: writing
    // back the pre-append textarea value erases the scale note. The fix is not
    // here (writeNoteRegion is correct to do what it's told) but in never
    // letting the field write a value older than what's on disk.
    let text = withRegion("23:05 — hmm");
    text = appendToNoteRegion(text, "capture", "23:05 — [scale:Mood=5] good day.");
    const clobbered = writeNoteRegion(text, "capture", "23:05 — hmm");
    expect(readNoteRegion(clobbered, "capture")).toBe("23:05 — hmm");
  });
});

// ── the merge that closes the clobber above (4.27 §1) ─────────────────
//
// The describe directly above this one asserts that a whole-region write DROPS
// an appended capture, and its comment says the fix is not in `writeNoteRegion`
// — which is right to do what it is told — but in "never letting the field
// write a value older than what's on disk". These are that fix, as pure
// functions, so the property is testable without a DOM the suite does not have.
describe("appendedSince", () => {
  it("recognises a block appended after the baseline", () => {
    expect(appendedSince("A", "A\n\nB")).toBe("B");
  });

  it("treats everything as new when the baseline is empty", () => {
    // A field that mounted on an empty region and then had a capture arrive.
    expect(appendedSince("", "B")).toBe("B");
    // ...but an empty region that is still empty is not an append.
    expect(appendedSince("", "")).toBeNull();
  });

  it("matches a baseline whose trailing whitespace the region dropped", () => {
    // A textarea invites a trailing return, and `joinRegionBlocks` trims before
    // it joins — so without this the field's own buffer would never match its
    // own region and every append would read as a conflict.
    expect(appendedSince("A ", "A\n\nB")).toBe("B");
    expect(appendedSince("A\n", "A\n\nB")).toBe("B");
  });

  it("refuses a divergence that is not an append", () => {
    // Two writers rewrote the same prose. Not this function's to resolve.
    expect(appendedSince("A", "C")).toBeNull();
  });

  it("refuses a shared prefix that is one word being typed", () => {
    // "A" → "Ax" shares a prefix and is not a second block. Requiring the
    // block separator is what tells them apart.
    expect(appendedSince("A", "Ax")).toBeNull();
    expect(appendedSince("A", "A\nx")).toBeNull();
  });

  it("is null when nothing changed", () => {
    expect(appendedSince("A", "A")).toBeNull();
  });
});

describe("reconcileRegionWrite", () => {
  it("keeps a capture that landed under the field's edit", () => {
    // THE PINNED BUG, NOT LOSING THE CAPTURE. The field mounted on "A", the
    // reader typed "A x", a capture appended "B" underneath. The write says
    // what the reader meant and carries the capture after it.
    expect(reconcileRegionWrite("A\n\nB", "A", "A x")).toBe("A x\n\nB");
  });

  it("keeps the capture even when the reader cleared the field", () => {
    // Emptying the box is an edit to the reader's own text, not consent to
    // delete something they never saw arrive.
    expect(reconcileRegionWrite("A\n\nB", "A", "")).toBe("B");
  });

  it("writes the value verbatim when nothing was appended", () => {
    expect(reconcileRegionWrite("A", "A", "A x")).toBe("A x");
  });

  it("falls back to the value on an unrecognised divergence", () => {
    // Deliberately today's behaviour: no merge is better than a guessed one.
    expect(reconcileRegionWrite("C", "A", "A x")).toBe("A x");
  });

  it("closes the clobber the describe above records", () => {
    // The same fixture as "capture region: append vs whole-region write",
    // routed through the merge instead of straight at `writeNoteRegion`.
    const base = "23:05 — hmm";
    let text = withRegion(base);
    text = appendToNoteRegion(text, "capture", "23:05 — [scale:Mood=5] good day.");
    const onDisk = readNoteRegion(text, "capture");
    const merged = writeNoteRegion(
      text,
      "capture",
      reconcileRegionWrite(onDisk, base, base)
    );
    expect(readNoteRegion(merged, "capture")).toContain("[scale:Mood=5]");
    expect(readNoteRegion(merged, "capture")).toContain("23:05 — hmm");
  });
});

describe("joinRegionBlocks", () => {
  // ASSERTED AS OUTPUT, NOT AS AGREEMENT WITH `appendToNoteRegion`. This was
  // first written as a loop comparing the two, which is a test that cannot
  // fail: `appendToNoteRegion` CALLS this function, so a mutation breaks both
  // sides equally and they keep agreeing. Mutating the join to always prefix a
  // blank line left it green while five real assertions went red — RESUME §6's
  // "a test that has never failed has never been tested", caught in the act.
  it("puts exactly one blank line between two blocks", () => {
    expect(joinRegionBlocks("A", "B")).toBe("A\n\nB");
  });

  it("adds no leading blank line to an empty region", () => {
    expect(joinRegionBlocks("", "B")).toBe("B");
  });

  it("trims both sides before joining", () => {
    expect(joinRegionBlocks("A\n", "B")).toBe("A\n\nB");
    expect(joinRegionBlocks("A", "B\n\n")).toBe("A\n\nB");
  });

  it("is a no-op for an empty addition", () => {
    expect(joinRegionBlocks("A", "")).toBe("A");
    expect(joinRegionBlocks("A", "   ")).toBe("A");
  });
});

describe("hasNoteRegion", () => {
  it("is true only when the region is actually there", () => {
    // Quick capture's destination list turns on this: a note whose region is
    // absent is one where a capture lands on disk and renders nowhere.
    expect(hasNoteRegion(withRegion(""), "capture")).toBe(true);
    expect(hasNoteRegion(withRegion("x"), "capture")).toBe(true);
    expect(hasNoteRegion("# Just a note\n\nsome prose", "capture")).toBe(false);
    expect(hasNoteRegion(withRegion("x"), "log")).toBe(false);
  });
});

// ── the merge is actually wired to the field's write (4.27 §1) ────────
//
// The functions above are pure and provable; what they cannot show is that the
// one write path a `note:` field uses goes through them. Scoped to the method
// body rather than matched across the file, per RESUME §6 — a bare `indexOf`
// over a module this size finds the word somewhere and proves nothing.
describe("the region write merges rather than overwrites", () => {
  // THE MERGE MOVED ONE METHOD ALONG IN 4.52, and the two are now a pair worth
  // asserting as one: `writeRegionOf` takes the file and does the write, and
  // `writeNoteRegionToFile` is that with the file resolved from the ctx. The
  // split exists because a `logbook:` widget writes a note it is not drawn on —
  // and the reason the merge stayed in ONE of them is this test: two write paths
  // would be two places to forget the reconcile.
  const method = (name: string): string => {
    const src = readCode("widgets");
    const at = src.indexOf(`async ${name}(`);
    expect(at, `${name} not found`).toBeGreaterThan(0);
    // To the start of the next method declaration at the same indent.
    const end = src.indexOf("\n  async ", at + 1);
    return src.slice(at, end === -1 ? src.length : end);
  };
  const body = (): string => method("writeRegionOf");

  it("is the one write the ctx-taking method delegates to", () => {
    // The call site, not the definition: whatever `writeNoteRegionToFile` does
    // with a ctx, the write itself has to be the merged one below.
    expect(method("writeNoteRegionToFile")).toContain("this.writeRegionOf(");
    expect(method("writeNoteRegionToFile")).not.toContain("vault.process");
  });

  it("reconciles against what is on disk", () => {
    expect(body()).toContain("reconcileRegionWrite(");
    expect(body()).toContain("readNoteRegion(text, key)");
  });

  it("never writes the caller's value straight through when it has a baseline", () => {
    // The pre-4.27 line. Its absence is the fix.
    expect(body()).not.toContain("writeNoteRegion(text, key, value)");
  });

  it("still writes verbatim for a caller with no baseline", () => {
    // The five list-shaped widgets serialise a structure they never read as
    // text, so they have none to offer and must not have one invented — "" as a
    // baseline would make every write look like the whole region was appended
    // beneath it.
    expect(body()).toContain("baseline == null");
  });
});

// ── where a capture goes (4.27 §2) ────────────────────────────────────
//
// Until 4.27 the answer was "today's daily entry", always, and the box could
// not say so. These pin the two decisions the picker makes, both split out of
// their I/O so the suite can reach them: which grains are offered at all, and
// whether the note the reader is on earns a row of its own.
describe("grainsShowingCapture", () => {
  // Only `settings.entrySections` is read, so a settings shape is a plugin
  // enough. Cast rather than mocked: pretending to build an AlmanacPlugin here
  // would be a fixture bigger than the thing it tests.
  const withSections = (
    entrySections: Record<string, { id: string }[]>
  ): AlmanacPlugin =>
    ({ settings: { entrySections } }) as unknown as AlmanacPlugin;

  it("offers daily out of the box, because the daily template ships it", () => {
    expect(grainsShowingCapture(withSections({}))).toEqual(["daily"]);
  });

  it("offers a grain the reader ticked Captured for", () => {
    const grains = grainsShowingCapture(
      withSections({ weekly: [{ id: "capture" }] })
    );
    expect(grains).toContain("weekly");
    expect(grains).toContain("daily");
  });

  it("does not offer a grain whose extra sections are something else", () => {
    // Ticking `bridge` for monthly must not put "This month" in the capture box.
    expect(
      grainsShowingCapture(withSections({ monthly: [{ id: "bridge" }] }))
    ).toEqual(["daily"]);
  });

  it("keeps the catalogue's grain order rather than the settings' key order", () => {
    const grains = grainsShowingCapture(
      withSections({ yearly: [{ id: "capture" }], weekly: [{ id: "capture" }] })
    );
    expect(grains).toEqual(
      TRACKER_CLASSES.filter((g) => grains.includes(g))
    );
  });
});

describe("offersHostEntry", () => {
  const facts = (over: Partial<Parameters<typeof offersHostEntry>[0]> = {}) => ({
    isManagedTemplate: false,
    hasCaptureRegion: true,
    hostKey: "2026-08-11",
    currentKey: "2026-08-15",
    grainAlreadyListed: true,
    ...over,
  });

  it("offers a past entry that can show a capture", () => {
    expect(offersHostEntry(facts())).toBe(true);
  });

  it("refuses a managed template", () => {
    // Composed from the catalogue and rewritten by "Refresh entry templates",
    // so anything captured into one is deleted without explanation.
    expect(offersHostEntry(facts({ isManagedTemplate: true }))).toBe(false);
  });

  it("refuses an entry with no capture region", () => {
    // The text would land on disk and draw nowhere.
    expect(offersHostEntry(facts({ hasCaptureRegion: false }))).toBe(false);
  });

  it("refuses to name one file twice", () => {
    // The reader is on this period's entry and its grain is already listed.
    expect(
      offersHostEntry(facts({ hostKey: "2026-08-15", grainAlreadyListed: true }))
    ).toBe(false);
  });

  it("still offers the current entry when its grain is NOT listed", () => {
    // A weekly entry with a Captured region the reader added by hand, on a
    // vault where weekly's template does not write one — the grain row is
    // absent, so this note is the only way to reach it.
    expect(
      offersHostEntry(facts({ hostKey: "2026-08-15", grainAlreadyListed: false }))
    ).toBe(true);
  });
});

describe("currentEntryKey", () => {
  it("keys every grain at the start of its own period", () => {
    // Derived from CLASS_DEFS.unit, so a sixth grain needs no edit here.
    const at = moment("2026-08-15");
    expect(currentEntryKey("daily", at)).toBe("2026-08-15");
    expect(currentEntryKey("weekly", at)).toBe("2026-08-10"); // ISO Monday
    expect(currentEntryKey("monthly", at)).toBe("2026-08");
    expect(currentEntryKey("quarterly", at)).toBe("2026-07-01");
    expect(currentEntryKey("yearly", at)).toBe("2026-01-01");
  });

  it("agrees with entryDateKey's shape for the same period", () => {
    // The two are counterparts — one reads a key off a note, the other names
    // the period a note would be for — so `labelForGrain` must render either.
    const at = moment("2026-08-15");
    for (const grain of TRACKER_CLASSES) {
      const key = currentEntryKey(grain, at);
      expect(labelForGrain(grain, key), grain).not.toBe(key);
    }
  });
});

// ── logbooks as capture destinations (4.62) ──────────────────────────
//
// The box has asked WHERE since 4.27 and could only ever answer with entries.
// Which notes are offered is the whole of the decision here, and it is a pure
// one: the resolve function needs a vault, the list does not.

describe("which logbooks a capture may go to", () => {
  const book = (over: Partial<LogbookDef>): LogbookDef => ({
    id: "work",
    name: "Work log",
    icon: "📓",
    source: "region",
    path: "Logbooks/Work log.md",
    color: "teal",
    ...over,
  });

  it("offers a region-backed book, dated, into the logbook region", () => {
    const [target] = logbookTargets([book({})]);
    expect(target.id).toBe("logbook:work");
    expect(target.label).toBe("Logbook · Work log");
    expect(target.regionKey).toBe(LOGBOOK_NOTE_KEY);
    // A logbook note spans months, so an item that did not say its day could
    // not be placed in the list or drawn on the grid.
    expect(target.dated).toBe(true);
    expect(target.color).toBe("teal");
  });

  it("refuses an events-backed book, which has no line to append to", () => {
    // Meetings is a VIEW of the events note: its items are `EventDef`s with a
    // title and a date. A thought appended to it would land in a file that
    // draws none of it.
    expect(logbookTargets([book({ id: "meetings", source: "events" })])).toEqual([]);
  });

  it("refuses a book with no note behind it", () => {
    expect(logbookTargets([book({ path: "" })])).toEqual([]);
  });

  it("offers every default book that can take one, and not Meetings", () => {
    const ids = logbookTargets(DEFAULT_LOGBOOKS).map((t) => t.id);
    expect(ids).toContain("logbook:work");
    expect(ids).not.toContain("logbook:meetings");
  });

  it("keeps the books in the order they are configured in", () => {
    // The dropdown is read top to bottom and the settings table is the reader's
    // own arrangement of it; re-sorting here would be this list disagreeing
    // with the one they made.
    const ids = logbookTargets([
      book({ id: "b", name: "Second" }),
      book({ id: "a", name: "First" }),
    ]).map((t) => t.id);
    expect(ids).toEqual(["logbook:b", "logbook:a"]);
  });
});

describe("the capture dialogue visuals", () => {
  it("tags the modal with almanac-capture-modal class", () => {
    const code = readCode("capture");
    expect(code).toContain('addClass("almanac-capture-modal")');
  });

  it("squares off the edges of the time field and inputs", () => {
    const css = readCss();
    expect(css).toContain(".almanac-capture-when-row .journal-capture-time");
    expect(css).toContain("border-radius: var(--am-radius-xs)");
  });
});

