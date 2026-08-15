// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The capture region read as items. 4.28.
//
// What these are really guarding is that the region on disk does not change
// shape. A reader's captures are their own text, written by a feature that has
// existed for years, and the card list is a new VIEW of it — so the parse has
// to accept everything the old format produced and the serialise has to write
// it back unchanged.

import { describe, expect, it } from "vitest";
import { formatCapture } from "../src/diary/capture";
import {
  parseCaptures,
  serializeCaptureNote,
  serializeCaptures,
} from "../src/diary/capture-log";
import {
  appendToNoteRegion,
  appendedSince,
  readNoteRegion,
  writeNoteRegion,
} from "../src/core/notestore";
import { parseTasks } from "../src/ui/tasks";

describe("parseCaptures", () => {
  it("reads one stamped item", () => {
    expect(parseCaptures("14:32 — bought milk")).toEqual([
      { time: "14:32", text: "bought milk", done: null },
    ]);
  });

  it("keeps a multi-line capture as ONE item", () => {
    // The whole reason the parse is stamp-led rather than a `\n\n` split.
    // `formatCapture` keeps a blank continuation line blank, so a thought with
    // a gap in it looks exactly like two items to a naive separator split —
    // and the second one would come out with no timestamp.
    const region = formatCapture("one\n\ntwo", "10:00");
    expect(region).toBe("10:00 — one\n\n  two");
    expect(parseCaptures(region)).toEqual([
      { time: "10:00", text: "one\n\ntwo", done: null },
    ]);
  });

  it("separates two captures", () => {
    const region = "09:00 — one\n\n10:00 — two";
    expect(parseCaptures(region).map((n) => n.text)).toEqual(["one", "two"]);
  });

  it("reads the crossed-off marker off the stamp line", () => {
    expect(parseCaptures("14:02 — ring the dentist [done:: 2026-08-15]")).toEqual([
      { time: "14:02", text: "ring the dentist", done: "2026-08-15" },
    ]);
  });

  it("takes a marker only from the end of the stamp line", () => {
    // A reader writing about the syntax is writing prose, not crossing a
    // capture off.
    const notes = parseCaptures("14:02 — I wrote [done:: x] in a note today");
    expect(notes[0].done).toBeNull();
    expect(notes[0].text).toBe("I wrote [done:: x] in a note today");
  });

  it("accepts a hand-typed single-digit hour", () => {
    // `formatCapture` writes HH:mm; a person writes 9:05. Refusing theirs
    // would make the region ours rather than theirs.
    expect(parseCaptures("9:05 — early")[0]).toEqual({
      time: "9:05",
      text: "early",
      done: null,
    });
  });

  it("keeps text above the first stamp rather than swallowing it", () => {
    const notes = parseCaptures("a stray line\n\n10:00 — stamped");
    expect(notes).toHaveLength(2);
    expect(notes[0]).toEqual({ time: null, text: "a stray line", done: null });
    expect(notes[1].text).toBe("stamped");
  });

  it("keeps a stamp with nothing after it", () => {
    // It records that the moment happened — the same argument the scale-note
    // path makes for writing a bare tag with no prose.
    expect(parseCaptures("14:00 —")).toEqual([
      { time: "14:00", text: "", done: null },
    ]);
  });

  it("is empty for an empty region", () => {
    expect(parseCaptures("")).toEqual([]);
  });
});

describe("serializeCaptures", () => {
  it("writes an unmarked capture exactly as formatCapture does", () => {
    // THE PROPERTY THAT MATTERS MOST. The card list must not rewrite a region
    // it merely displayed — a reader who opens an entry and touches nothing
    // should see no diff, and the quick-capture box and this widget must agree
    // about what a capture looks like.
    for (const [text, time] of [
      ["bought milk", "14:32"],
      ["one\n\ntwo", "10:00"],
      ["spaced\n  indented", "10:00"],
    ] as const) {
      const block = formatCapture(text, time);
      expect(serializeCaptures(parseCaptures(block))).toBe(block);
    }
  });

  it("round-trips a whole region unchanged", () => {
    const region = [
      formatCapture("first", "09:00"),
      formatCapture("second\n\nwith a gap", "10:00"),
      "11:00 — third [done:: 2026-08-15]",
    ].join("\n\n");
    expect(serializeCaptures(parseCaptures(region))).toBe(region);
  });

  it("separates items by exactly one blank line", () => {
    // Load-bearing beyond how it looks — see the append test below.
    const out = serializeCaptures([
      { time: "09:00", text: "a", done: null },
      { time: "10:00", text: "b", done: null },
    ]);
    expect(out).toBe("09:00 — a\n\n10:00 — b");
  });

  it("puts the marker at the end of the stamp line, not the block", () => {
    const out = serializeCaptureNote({
      time: "10:00",
      text: "one\ntwo",
      done: "2026-08-15",
    });
    expect(out).toBe("10:00 — one [done:: 2026-08-15]\n  two");
    // ...and it reads back as the same item.
    expect(parseCaptures(out)).toEqual([
      { time: "10:00", text: "one\ntwo", done: "2026-08-15" },
    ]);
  });

  it("keeps the stamp when a capture is emptied", () => {
    // `formatCapture` returns "" for whitespace-only text, which would drop
    // the item entirely on the next save.
    expect(serializeCaptureNote({ time: "10:00", text: "  ", done: null })).toBe(
      "10:00 —"
    );
  });
});

describe("the card list does not break the append path", () => {
  it("leaves a serialised region appendable", () => {
    // `appendToNoteRegion` is how every capture arrives, and it must still
    // land after what the widget wrote.
    const note = writeNoteRegion("# Note\n", "capture", "09:00 — one");
    const after = appendToNoteRegion(note, "capture", "10:00 — two");
    expect(parseCaptures(readNoteRegion(after, "capture")).map((n) => n.text)).toEqual([
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
    const before = serializeCaptures([{ time: "09:00", text: "one", done: null }]);
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

describe("the crossed-off marker is invisible to the task machinery", () => {
  it("never produces a line the task parser claims", () => {
    // `parseTasks` is run KEY-BLIND over every region by diary-index.ts and by
    // four sites in tables.ts. A capture line it recognised would be counted
    // in every task total in the vault, would lose its timestamp from the
    // search index, and would be REWRITTEN in the task format the first time
    // anyone ticked a box in the tasks table. `CHECKBOX_RE` is anchored at
    // `^-`, so the marker must never make a line start that way.
    const region = serializeCaptures([
      { time: "09:00", text: "one", done: "2026-08-15" },
      { time: "10:00", text: "two\nand more", done: null },
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
