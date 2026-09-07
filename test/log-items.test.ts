// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// A stamped region read as items. 4.28, widened to logbooks in 4.52.
//
// What these are really guarding is that the region on disk does not change
// shape. A reader's captures are their own text, written by a feature that has
// existed for years, and the card list is a new VIEW of it — so the parse has
// to accept everything the old format produced and the serialise has to write
// it back unchanged.
//
// THAT IS ALSO WHAT MAKES THE 4.52 ROWS BELOW WORTH HAVING. The grammar grew an
// optional date so a logbook item can say which day it belongs to; every
// undated row here is a capture, and every one of them passing unchanged is the
// proof that the widening cost the existing regions nothing.

import { describe, expect, it } from "vitest";
import {
  formatLogItem,
  parseLogItems,
  serializeLogItem,
  serializeLogItems,
} from "../src/diary/log-items";
import {
  appendToNoteRegion,
  appendedSince,
  readNoteRegion,
  writeNoteRegion,
} from "../src/core/notestore";
import { parseTasks } from "../src/ui/tasks";

// MOVED HERE FROM `capture.test.ts` IN 4.52, with the function it tests. These
// rows were written about `formatCapture`, which is `formatLogItem` with no
// date, and every one of them still asserts the exact bytes it always did —
// which is the point of keeping them rather than rewriting them.
describe("formatLogItem", () => {
  it("stamps a single line with the time", () => {
    expect(formatLogItem("bought milk", "14:32")).toBe("14:32 — bought milk");
  });

  // One capture is one moment. Stamping every line would make a three-line
  // thought read as three separate ones.
  it("stamps a multi-line capture once, indenting the rest", () => {
    expect(formatLogItem("first\nsecond\nthird", "09:05")).toBe(
      "09:05 — first\n  second\n  third"
    );
  });

  // The stamped line is trimmed, but a continuation line's own indentation is
  // preserved on top of the block indent — someone who indented a sub-point
  // meant it, and flattening it would lose the structure they typed.
  it("trims the stamped line and keeps deliberate inner indentation", () => {
    expect(formatLogItem("  spaced  \n  indented", "10:00")).toBe(
      "10:00 — spaced\n    indented"
    );
  });

  it("keeps blank continuation lines blank rather than indenting them", () => {
    expect(formatLogItem("one\n\ntwo", "10:00")).toBe("10:00 — one\n\n  two");
  });

  it("drops leading blank lines so the stamp always has text beside it", () => {
    expect(formatLogItem("\n\nactual thought", "11:11")).toBe(
      "11:11 — actual thought"
    );
  });

  it("returns nothing for empty or whitespace-only input", () => {
    expect(formatLogItem("", "12:00")).toBe("");
    expect(formatLogItem("   \n  \n", "12:00")).toBe("");
  });

  it("strips trailing whitespace", () => {
    expect(formatLogItem("thought\n\n\n", "12:00")).toBe("12:00 — thought");
  });
});

describe("parseLogItems", () => {
  it("reads one stamped item", () => {
    expect(parseLogItems("14:32 — bought milk")).toEqual([
      { date: null, time: "14:32", text: "bought milk", done: null, mins: null },
    ]);
  });

  it("keeps a multi-line capture as ONE item", () => {
    // The whole reason the parse is stamp-led rather than a `\n\n` split.
    // `formatLogItem` keeps a blank continuation line blank, so a thought with
    // a gap in it looks exactly like two items to a naive separator split —
    // and the second one would come out with no timestamp.
    const region = formatLogItem("one\n\ntwo", "10:00");
    expect(region).toBe("10:00 — one\n\n  two");
    expect(parseLogItems(region)).toEqual([
      { date: null, time: "10:00", text: "one\n\ntwo", done: null, mins: null },
    ]);
  });

  it("separates two captures", () => {
    const region = "09:00 — one\n\n10:00 — two";
    expect(parseLogItems(region).map((n) => n.text)).toEqual(["one", "two"]);
  });

  it("reads the crossed-off marker off the stamp line", () => {
    expect(parseLogItems("14:02 — ring the dentist [done:: 2026-08-15]")).toEqual([
      { date: null, time: "14:02", text: "ring the dentist", done: "2026-08-15", mins: null },
    ]);
  });

  it("takes a marker only from the end of the stamp line", () => {
    // A reader writing about the syntax is writing prose, not crossing a
    // capture off.
    const notes = parseLogItems("14:02 — I wrote [done:: x] in a note today");
    expect(notes[0].done).toBeNull();
    expect(notes[0].text).toBe("I wrote [done:: x] in a note today");
  });

  it("accepts a hand-typed single-digit hour", () => {
    // `formatLogItem` writes HH:mm; a person writes 9:05. Refusing theirs
    // would make the region ours rather than theirs.
    expect(parseLogItems("9:05 — early")[0]).toEqual({
      date: null,
      time: "9:05",
      text: "early",
      done: null,
      mins: null,
    });
  });

  it("keeps text above the first stamp rather than swallowing it", () => {
    const notes = parseLogItems("a stray line\n\n10:00 — stamped");
    expect(notes).toHaveLength(2);
    expect(notes[0]).toEqual({ date: null, time: null, text: "a stray line", done: null, mins: null });
    expect(notes[1].text).toBe("stamped");
  });

  it("keeps a stamp with nothing after it", () => {
    // It records that the moment happened — the same argument the scale-note
    // path makes for writing a bare tag with no prose.
    expect(parseLogItems("14:00 —")).toEqual([
      { date: null, time: "14:00", text: "", done: null, mins: null },
    ]);
  });

  it("is empty for an empty region", () => {
    expect(parseLogItems("")).toEqual([]);
  });
});

describe("serializeLogItems", () => {
  it("writes an unmarked capture exactly as formatLogItem does", () => {
    // THE PROPERTY THAT MATTERS MOST. The card list must not rewrite a region
    // it merely displayed — a reader who opens an entry and touches nothing
    // should see no diff, and the quick-capture box and this widget must agree
    // about what a capture looks like.
    for (const [text, time] of [
      ["bought milk", "14:32"],
      ["one\n\ntwo", "10:00"],
      ["spaced\n  indented", "10:00"],
    ] as const) {
      const block = formatLogItem(text, time);
      expect(serializeLogItems(parseLogItems(block))).toBe(block);
    }
  });

  it("round-trips a whole region unchanged", () => {
    const region = [
      formatLogItem("first", "09:00"),
      formatLogItem("second\n\nwith a gap", "10:00"),
      "11:00 — third [done:: 2026-08-15]",
    ].join("\n\n");
    expect(serializeLogItems(parseLogItems(region))).toBe(region);
  });

  it("separates items by exactly one blank line", () => {
    // Load-bearing beyond how it looks — see the append test below.
    const out = serializeLogItems([
      { date: null, time: "09:00", text: "a", done: null, mins: null },
      { date: null, time: "10:00", text: "b", done: null, mins: null },
    ]);
    expect(out).toBe("09:00 — a\n\n10:00 — b");
  });

  it("puts the marker at the end of the stamp line, not the block", () => {
    const out = serializeLogItem({
      date: null,
      time: "10:00",
      text: "one\ntwo",
      done: "2026-08-15",
      mins: null,
    });
    expect(out).toBe("10:00 — one [done:: 2026-08-15]\n  two");
    // ...and it reads back as the same item.
    expect(parseLogItems(out)).toEqual([
      { date: null, time: "10:00", text: "one\ntwo", done: "2026-08-15", mins: null },
    ]);
  });

  it("keeps the stamp when a capture is emptied", () => {
    // `formatLogItem` returns "" for whitespace-only text, which would drop
    // the item entirely on the next save.
    expect(serializeLogItem({ date: null, time: "10:00", text: "  ", done: null, mins: null })).toBe(
      "10:00 —"
    );
  });
});

describe("the date on the stamp (4.52)", () => {
  it("reads a logbook item's day and minute off one stamp", () => {
    expect(parseLogItems("2026-08-21 14:32 — rewrote the remap")).toEqual([
      { date: "2026-08-21", time: "14:32", text: "rewrote the remap", done: null, mins: null },
    ]);
  });

  it("reads a hand-typed day with no minute", () => {
    // Nothing writes one. It is here because a reader typing into a work log by
    // hand writes the day and not the minute, and an item that parsed as
    // untimed prose would lose its place in the list.
    expect(parseLogItems("2026-08-21 — shipped 4.51.9")).toEqual([
      { date: "2026-08-21", time: null, text: "shipped 4.51.9", done: null, mins: null },
    ]);
  });

  it("round-trips a dated item, marker and continuation included", () => {
    const region = [
      formatLogItem("first", "09:00", "2026-08-20"),
      "2026-08-21 10:00 — second [done:: 2026-08-22]\n  and more",
      "2026-08-21 — a day with no minute",
    ].join("\n\n");
    expect(serializeLogItems(parseLogItems(region))).toBe(region);
  });

  it("writes no date when it is given none, which is every capture", () => {
    // THE PROOF THE WIDENING COST THE CAPTURE REGION NOTHING. A capture lives in
    // a dated entry, so the day is the note's; the third argument is what a
    // logbook adds, and an absent one produces the exact bytes 4.28 shipped.
    expect(formatLogItem("bought milk", "14:32")).toBe("14:32 — bought milk");
    expect(formatLogItem("bought milk", "14:32", null)).toBe("14:32 — bought milk");
  });

  it("keeps the whole stamp when a dated item is emptied", () => {
    expect(
      serializeLogItem({ date: "2026-08-21", time: "14:32", text: " ", done: null, mins: null })
    ).toBe("2026-08-21 14:32 —");
  });

  it("is not fooled by a date inside the text", () => {
    const items = parseLogItems("14:32 — 2026-08-21 was a good day");
    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      date: null,
      time: "14:32",
      text: "2026-08-21 was a good day",
      done: null,
      mins: null,
    });
  });
});

describe("the card list does not break the append path", () => {
  it("leaves a serialised region appendable", () => {
    // `appendToNoteRegion` is how every capture arrives, and it must still
    // land after what the widget wrote.
    const note = writeNoteRegion("# Note\n", "capture", "09:00 — one");
    const after = appendToNoteRegion(note, "capture", "10:00 — two");
    expect(parseLogItems(readNoteRegion(after, "capture")).map((n) => n.text)).toEqual([
      "one",
      "two",
    ]);
  });

  it("keeps an append recognisable to the merge", () => {
    // THE ONE THAT PINS THE SEPARATOR. `appendedSince` only sees an append
    // when the divergence starts with a blank line, so a serialiser that
    // joined items any other way would silently re-open the clobber 4.27
    // closed — a capture arriving while the list is on screen would be
    // overwritten by the next click on it.
    const before = serializeLogItems([{ date: null, time: "09:00", text: "one", done: null, mins: null }]);
    const after = appendToNoteRegion(
      writeNoteRegion("", "capture", before),
      "capture",
      "10:00 — two"
    );
    expect(appendedSince(before, readNoteRegion(after, "capture"))).toBe(
      "10:00 — two"
    );
  });
});

describe("the length on the stamp (4.55)", () => {
  // WHY THE STAMP LINE AND NOT A SECOND CLOCK. `formatLogItem` writes one stamp
  // and `STAMP_RE` already has a bare `\d{1,2}:\d{2}` alternative in it, so a
  // second `HH:mm` would read as a range and collide with the hand-typed hour
  // the parser has taken since 4.28. `[mins:: N]` goes in the same extensible
  // slot `[done:: …]` occupies, and cannot.

  it("reads a length off the stamp line", () => {
    expect(parseLogItems("14:00 — pairing [mins:: 90]")).toEqual([
      { date: null, time: "14:00", text: "pairing", done: null, mins: 90 },
    ]);
  });

  it("reads a length and a marker together, in either order", () => {
    const both = parseLogItems("14:00 — pairing [mins:: 90] [done:: 2026-08-22]")[0];
    expect(both.mins).toBe(90);
    expect(both.done).toBe("2026-08-22");
    const swapped = parseLogItems("14:00 — pairing [done:: 2026-08-22] [mins:: 90]")[0];
    expect(swapped.mins).toBe(90);
    expect(swapped.done).toBe("2026-08-22");
  });

  it("ignores a length that is not one, and leaves the text alone", () => {
    // `readMinutes` is `events.ts`' — ONE definition of what a duration is,
    // shared by both grammars, so a note cannot hold a length the event store
    // would refuse.
    for (const bad of ["0", "-30", "half an hour", ""]) {
      const item = parseLogItems(`14:00 — thing [mins:: ${bad}]`)[0];
      expect(item.mins).toBeNull();
    }
  });

  it("takes a length only from the end of the stamp line", () => {
    // A reader writing ABOUT the syntax is writing prose, which is the rule
    // `[done:: …]` has followed since 4.28.
    const item = parseLogItems("14:02 — I wrote [mins:: 90] in a note today")[0];
    expect(item.mins).toBeNull();
    expect(item.text).toBe("I wrote [mins:: 90] in a note today");
  });

  it("writes the length before the marker, so the marker stays last", () => {
    // NOT COSMETIC. Every crossed-off item already on disk ends `[done:: …]`,
    // and a serializer that put the new field after it would rewrite every one
    // of them the first time anything saved the region.
    const out = serializeLogItem({
      date: null,
      time: "14:00",
      text: "pairing",
      done: "2026-08-22",
      mins: 90,
    });
    expect(out).toBe("14:00 — pairing [mins:: 90] [done:: 2026-08-22]");
    expect(parseLogItems(out)[0].mins).toBe(90);
  });

  it("writes no length for an item that has none", () => {
    // THE COMPATIBILITY CLAIM. Every capture in every vault has no length, and
    // a round trip must not start writing the field into all of them.
    expect(serializeLogItem({ date: null, time: "14:00", text: "x", done: null, mins: null })).toBe(
      "14:00 — x"
    );
  });

  it("round-trips a dated, timed, measured, crossed-off item", () => {
    const region = "2026-08-21 14:00 — pairing [mins:: 90] [done:: 2026-08-22]\n  and more";
    expect(serializeLogItems(parseLogItems(region))).toBe(region);
  });
});

describe("the crossed-off marker is invisible to the task machinery", () => {
  it("never produces a line the task parser claims", () => {
    // `parseTasks` is run KEY-BLIND over every region by diary-index.ts and by
    // four sites in tables.ts. A capture line it recognised would be counted
    // in every task total in the vault, would lose its timestamp from the
    // search index, and would be REWRITTEN in the task format the first time
    // anyone ticked a box in the tasks table. `CHECKBOX_RE` is anchored at
    // `^-`, so the marker must never make a line start that way.
    const region = serializeLogItems([
      { date: null, time: "09:00", text: "one", done: "2026-08-15", mins: null },
      { date: null, time: "10:00", text: "two\nand more", done: null, mins: null },
    ]);
    // ASKED OF THE PARSER, not of a `startsWith` standing in for it. A proxy
    // assertion would still pass if `CHECKBOX_RE` were ever loosened, which is
    // exactly the change that would make this dangerous again.
    expect(parseTasks(region)).toEqual([]);
    // And the region still reaches the search index as its own text: the
    // task branch in `parseEntryText` only fires when a region yields tasks.
    expect(parseTasks(region)).toHaveLength(0);
  });
});
