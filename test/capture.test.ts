// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import { formatCapture } from "../src/diary/capture";
import {
  appendToNoteRegion,
  ensureNoteRegions,
  readNoteRegion,
  writeNoteRegion,
} from "../src/core/notestore";

describe("formatCapture", () => {
  it("stamps a single line with the time", () => {
    expect(formatCapture("bought milk", "14:32")).toBe("14:32 — bought milk");
  });

  // One capture is one moment. Stamping every line would make a three-line
  // thought read as three separate ones.
  it("stamps a multi-line capture once, indenting the rest", () => {
    expect(formatCapture("first\nsecond\nthird", "09:05")).toBe(
      "09:05 — first\n  second\n  third"
    );
  });

  // The stamped line is trimmed, but a continuation line's own indentation is
  // preserved on top of the block indent — someone who indented a sub-point
  // meant it, and flattening it would lose the structure they typed.
  it("trims the stamped line and keeps deliberate inner indentation", () => {
    expect(formatCapture("  spaced  \n  indented", "10:00")).toBe(
      "10:00 — spaced\n    indented"
    );
  });

  it("keeps blank continuation lines blank rather than indenting them", () => {
    expect(formatCapture("one\n\ntwo", "10:00")).toBe("10:00 — one\n\n  two");
  });

  it("drops leading blank lines so the stamp always has text beside it", () => {
    expect(formatCapture("\n\nactual thought", "11:11")).toBe(
      "11:11 — actual thought"
    );
  });

  it("returns nothing for empty or whitespace-only input", () => {
    expect(formatCapture("", "12:00")).toBe("");
    expect(formatCapture("   \n  \n", "12:00")).toBe("");
  });

  it("strips trailing whitespace", () => {
    expect(formatCapture("thought\n\n\n", "12:00")).toBe("12:00 — thought");
  });
});

describe("appendToNoteRegion", () => {
  const withRegion = (content: string) =>
    writeNoteRegion("# Note\n", "capture", content);

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
    const line = formatCapture(frag, "09:14");
    expect(line).toBe("09:14 — [scale:Mood=4] rough day");
    expect(parseScaleNoteLine(line)).toEqual({
      trackerId: "Mood", value: 4, text: "rough day",
    });
  });

  it("stamps a bare (prose-less) note so the reading is still timestamped", () => {
    const frag = formatScaleNoteTag({ trackerId: "Energy", value: 2, text: "" })!;
    const line = formatCapture(frag, "22:30");
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
