// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// How the events manager orders and filters what it draws. 4.62.
//
// THE PAGE ITSELF IS NOT TESTED HERE AND CANNOT BE — `event-widgets.ts` builds
// DOM and the suite has no document. What can be wrong in a way a reader would
// see is the ORDER (a past trip above next week's meeting) and the REFUSAL to
// match (a filter that hides a row it should keep), and both of those are
// decided by two pure functions in `events.ts`. That split is the one
// `time-grid.ts` makes, applied to a list instead of a grid.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_EVENT_COLOR,
  DEFAULT_EVENT_ICON,
  type EventDef,
  describeLength,
  describeRelative,
  eventRelative,
  matchesEventFilter,
  matchesEventKind,
  nextOccurrence,
  partitionEvents,
  sortEvents,
  tallyEventKinds,
  upcomingEvents,
} from "../src/events/events";
import { readCss, readSrc } from "./sources";

const TODAY = "2026-08-23";

function single(
  id: string,
  start: string,
  end?: string,
  extra: Partial<EventDef> = {}
): EventDef {
  return {
    id,
    title: id,
    kind: "single",
    start,
    ...(end ? { end } : {}),
    icon: DEFAULT_EVENT_ICON,
    color: DEFAULT_EVENT_COLOR,
    ...extra,
  };
}

function annual(id: string, month: number, day: number): EventDef {
  return {
    id,
    title: id,
    kind: "recurring",
    month,
    day,
    icon: DEFAULT_EVENT_ICON,
    color: DEFAULT_EVENT_COLOR,
  };
}

describe("the manager's three lists", () => {
  it("reads the future forwards and the past backwards", () => {
    // A list of what is coming is scanned from the near end; a list of what has
    // been is scanned from the recent end. One order could not do both, which
    // is why there are two lists rather than one sort.
    const { coming, earlier } = partitionEvents(
      [
        single("sept-4", "2026-09-04"),
        single("sept-1", "2026-09-01"),
        single("aug-22", "2026-08-22"),
        single("aug-10", "2026-08-10"),
      ],
      TODAY
    );
    expect(coming.map((d) => d.id)).toEqual(["sept-1", "sept-4"]);
    expect(earlier.map((d) => d.id)).toEqual(["aug-22", "aug-10"]);
  });

  it("counts today as coming up, not as earlier", () => {
    const { coming, earlier } = partitionEvents([single("now", TODAY)], TODAY);
    expect(coming.map((d) => d.id)).toEqual(["now"]);
    expect(earlier).toEqual([]);
  });

  it("keeps a span that has started and not finished in coming up", () => {
    // Day 4 of a trip is a fact about now. Filing it under "earlier" because it
    // began last week would fold away the thing the reader is doing.
    const trip = single("berlin", "2026-08-20", "2026-08-26");
    const { coming, earlier } = partitionEvents([trip], TODAY);
    expect(coming.map((d) => d.id)).toEqual(["berlin"]);
    expect(earlier).toEqual([]);
  });

  it("files a span that finished yesterday under earlier", () => {
    const trip = single("last", "2026-08-16", "2026-08-22");
    const { coming, earlier } = partitionEvents([trip], TODAY);
    expect(coming).toEqual([]);
    expect(earlier.map((d) => d.id)).toEqual(["last"]);
  });

  it("sorts a span by when it starts, so an overlap reads in order", () => {
    const { coming } = partitionEvents(
      [
        single("late", "2026-09-10", "2026-09-20"),
        single("early", "2026-09-01", "2026-09-30"),
      ],
      TODAY
    );
    expect(coming.map((d) => d.id)).toEqual(["early", "late"]);
  });

  it("keeps recurring events in month order, whatever the year is doing", () => {
    // The list is scanned for a gap — "have I entered every birthday" — and a
    // gap is only visible in date order.
    const { recurring, coming, earlier } = partitionEvents(
      [annual("dec", 12, 25), annual("feb", 2, 14), annual("feb-early", 2, 1)],
      TODAY
    );
    expect(recurring.map((d) => d.id)).toEqual(["feb-early", "feb", "dec"]);
    expect(coming).toEqual([]);
    expect(earlier).toEqual([]);
  });

  it("keeps every event it was given, in exactly one list", () => {
    const defs = [
      annual("birthday", 4, 12),
      single("past", "2026-01-01"),
      single("future", "2026-12-01"),
    ];
    const { recurring, coming, earlier } = partitionEvents(defs, TODAY);
    expect(recurring.length + coming.length + earlier.length).toBe(defs.length);
  });
});

describe("the filter box", () => {
  const def = single("trip", "2026-09-01", undefined, {
    title: "Berlin trip",
    note: "flights booked",
  });

  it("matches nothing away when it is empty", () => {
    expect(matchesEventFilter(def, "")).toBe(true);
    expect(matchesEventFilter(def, "   ")).toBe(true);
  });

  it("matches part of a title, either case", () => {
    expect(matchesEventFilter(def, "berlin")).toBe(true);
    expect(matchesEventFilter(def, "TRIP")).toBe(true);
    expect(matchesEventFilter(def, "rli")).toBe(true);
  });

  it("matches the note, because that is where the detail was written", () => {
    expect(matchesEventFilter(def, "flights")).toBe(true);
  });

  it("says no to a word that is on neither", () => {
    expect(matchesEventFilter(def, "dentist")).toBe(false);
  });

  it("does not match a date, which is not text the reader typed", () => {
    expect(matchesEventFilter(def, "2026-09-01")).toBe(false);
  });
});

describe("a length, said the way a reader would say it", () => {
  it("is minutes under an hour", () => {
    expect(describeLength(45)).toBe("45 min");
    expect(describeLength(5)).toBe("5 min");
  });

  it("is hours when it is hours", () => {
    expect(describeLength(60)).toBe("1 h");
    expect(describeLength(90)).toBe("1 h 30");
    expect(describeLength(150)).toBe("2 h 30");
  });

  it("is nothing at all when there is no length", () => {
    // A moment has no duration to print, and `0` is not a duration either — the
    // distinction `LogItem.mins` makes and this must not flatten.
    expect(describeLength(null)).toBe("");
    expect(describeLength(undefined)).toBe("");
    expect(describeLength(0)).toBe("");
  });
});


// ── The deck, 1.0.21 ──────────────────────────────────────────────────────
//
// Everything the manager's toolbar decides, which is the half of it that can be
// wrong in a way a reader would see: a chip counting the wrong rows, a birthday
// with no "in 7 months" beside it, a sort that reordered the groups instead of
// the rows in them. The DRAWING is still untestable here for the reason this
// file's header gives.

function weekly(id: string, weekday: number, time: string): EventDef {
  return {
    id,
    title: id,
    kind: "recurring",
    every: "week",
    weekday,
    time,
    icon: DEFAULT_EVENT_ICON,
    color: DEFAULT_EVENT_COLOR,
  };
}

describe("when a definition next comes round", () => {
  it("rolls an annual date into next year once this year's has gone", () => {
    // TODAY is 23 August 2026.
    expect(nextOccurrence(annual("soon", 12, 25), TODAY)?.iso).toBe("2026-12-25");
    expect(nextOccurrence(annual("gone", 1, 4), TODAY)?.iso).toBe("2027-01-04");
  });

  it("answers a weekly rhythm with the next one of it, not fifty-two", () => {
    // 23 August 2026 is a Sunday, so the next Wednesday is the 26th.
    expect(nextOccurrence(weekly("standup", 3, "09:00"), TODAY)?.iso).toBe(
      "2026-08-26"
    );
  });

  it("answers a span under way with the day it began", () => {
    const trip = single("trip", "2026-08-20", "2026-08-27");
    const hit = nextOccurrence(trip, TODAY);
    expect(hit?.iso).toBe("2026-08-20");
    expect(hit?.ongoing).toBe(true);
    expect(hit?.daysAway).toBe(-3);
  });

  it("has no answer for a single event already over", () => {
    expect(nextOccurrence(single("past", "2026-07-01"), TODAY)).toBeNull();
  });

  it("does not ask whether the event is switched on", () => {
    // THE CALLERS DISAGREE ABOUT THAT, which is why the guard is not here: the
    // countdown draws only what the calendars draw, and the manager draws
    // everything it manages and says which of it is off.
    const off = single("off", "2026-09-01", undefined, { enabled: false });
    expect(nextOccurrence(off, TODAY)?.iso).toBe("2026-09-01");
    expect(upcomingEvents([off], TODAY, 5)).toEqual([]);
  });
});

describe("the relative phrase, for any definition", () => {
  it("says the same thing the countdown says, for what the countdown draws", () => {
    // ONE ANSWER, TWO LISTS. The manager and the countdown printing different
    // phrases about one event is the drift `nextOccurrence` was lifted out to
    // prevent, and this is that property asserted rather than asserted about.
    const defs = [
      single("a", "2026-08-24"),
      single("b", "2026-09-10"),
      single("c", "2026-08-20", "2026-08-27"),
    ];
    for (const item of upcomingEvents(defs, TODAY, 5)) {
      expect(eventRelative(item.def, TODAY), item.def.id).toBe(
        describeRelative(item)
      );
    }
  });

  it("answers for a recurring definition, which the countdown's own input cannot", () => {
    expect(eventRelative(annual("xmas", 12, 25), TODAY)).toBe("in 4 months");
    expect(eventRelative(weekly("standup", 3, "09:00"), TODAY)).toBe("in 3 days");
  });

  it("says nothing at all about an event with nothing left to happen", () => {
    // The row already prints the date it was. A phrase about the past would be
    // the same fact twice, in a column headed by how long until things.
    expect(eventRelative(single("past", "2026-07-01"), TODAY)).toBe("");
  });
});

describe("the kind chips", () => {
  const defs = [
    annual("birthday", 4, 12),
    weekly("standup", 3, "09:00"),
    single("trip", "2026-12-17", "2027-01-05"),
    single("dentist", "2026-10-02"),
    single("cancelled", "2026-11-01", undefined, { enabled: false }),
  ];

  it("counts repeating and one-off, and All is the two of them", () => {
    const tally = tallyEventKinds(defs);
    expect(tally.repeating).toBe(2);
    expect(tally.single).toBe(3);
    expect(tally.all).toBe(5);
    expect(tally.all).toBe(tally.repeating + tally.single);
  });

  it("counts Off across the other two rather than beside them", () => {
    // The strip is one row of four and it is TWO questions. A disabled birthday
    // is a repeating event AND a switched-off one, so the four numbers do not
    // sum to the list — which is the thing a reader would otherwise read into
    // them.
    const withOffAnnual = [...defs, annual("skipped", 6, 1)].map((d) =>
      d.id === "skipped" ? { ...d, enabled: false } : d
    );
    const tally = tallyEventKinds(withOffAnnual);
    expect(tally.off).toBe(2);
    expect(tally.repeating).toBe(3);
    expect(matchesEventKind(withOffAnnual[5], "repeating")).toBe(true);
    expect(matchesEventKind(withOffAnnual[5], "off")).toBe(true);
    expect(tally.all).not.toBe(
      tally.repeating + tally.single + tally.off
    );
  });

  it("keeps every event under All", () => {
    for (const def of defs) expect(matchesEventKind(def, "all")).toBe(true);
  });

  it("files a weekly event under repeating, with the annual ones", () => {
    // The chip asks whether this comes round again, not how often. `Repeating`
    // splitting into two would be a strip that answers a question the groups
    // below it already answer — `partitionEvents` puts weekly first inside the
    // recurring list for exactly that reason.
    expect(matchesEventKind(weekly("standup", 3, "09:00"), "repeating")).toBe(true);
  });
});

describe("the sort inside a group", () => {
  const list = [single("Zebra", "2026-09-01"), single("apple", "2026-10-01")];

  it("by date is the identity, because the group arrived sorted", () => {
    // `partitionEvents` argues three paragraphs for the order it hands over —
    // by month for recurring so a gap is visible, ascending for coming,
    // descending for earlier. Re-sorting here would be a second opinion about
    // all three.
    expect(sortEvents(list, "date")).toBe(list);
  });

  it("by name is case-insensitive, and leaves the input alone", () => {
    expect(sortEvents(list, "name").map((d) => d.id)).toEqual(["apple", "Zebra"]);
    expect(list.map((d) => d.id)).toEqual(["Zebra", "apple"]);
  });

  it("does not move an event between groups", () => {
    // The groups are the page's structure; the sort is about rows. A sort that
    // could lift a past trip into "Coming up" would be a control that changed
    // what the list MEANS.
    const defs = [
      single("apple", "2026-07-01"),
      single("Zebra", "2026-09-01"),
      annual("mid", 6, 1),
    ];
    const by = partitionEvents(defs, TODAY);
    const sorted = {
      recurring: sortEvents(by.recurring, "name"),
      coming: sortEvents(by.coming, "name"),
      earlier: sortEvents(by.earlier, "name"),
    };
    expect(sorted.coming.map((d) => d.id)).toEqual(["Zebra"]);
    expect(sorted.earlier.map((d) => d.id)).toEqual(["apple"]);
    expect(sorted.recurring.map((d) => d.id)).toEqual(["mid"]);
  });
});

// ── What the widget does with it ──────────────────────────────────────────
//
// Source and stylesheet scrapes, the idiom `test/time-grid.test.ts` uses for a
// widget the suite cannot render. These pin the three things a reader met on a
// phone and could do nothing about.

describe("the manager's row is reachable without a pointer", () => {
  const src = (): string => readSrc("events/event-widgets");

  it("opens the editor when the row itself is pressed", () => {
    const text = src();
    expect(text).toContain('role: "button"');
    expect(text).toContain('tabindex: "0"');
    expect(text).toContain('row.addEventListener("click", open)');
    // Enter and Space, because a row that is a button has to behave like one.
    expect(text).toContain('evt.key !== "Enter" && evt.key !== " "');
  });

  it("puts the other three actions in one menu rather than four buttons", () => {
    const text = src();
    expect(text).toContain("overflowButton(row,");
    expect(text).toContain('"ca-ev-more"');
    // The four hover-revealed icon buttons and the helper that drew them.
    expect(text).not.toContain("ca-ev-edit");
    expect(text).not.toContain("ca-ev-actions");
  });

  it("draws the filter box whatever the list holds", () => {
    // `FILTER_FROM = 8` argued that a box over six rows is a control that
    // cannot do its job. True of a box alone; false of a deck that carries the
    // counts and the sort whatever the list holds.
    // The CONSTANT, not the word — the comment above the box in that file
    // names it, and a sweep for the name would fail on the paragraph that
    // explains why it is gone.
    expect(src()).not.toContain("const FILTER_FROM");
    expect(src()).not.toMatch(/>= FILTER_FROM/);
  });

  it("no longer hides anything behind a hover", () => {
    const css = readCss();
    expect(css).not.toContain(".ca-ev-row:hover .ca-ev-edit");
    // And the touch fallback that dimmed them to 0.45 rather than revealing
    // them, which is what let the defect ship looking answered.
    expect(css).not.toContain(".ca-ev-edit");
  });
});
