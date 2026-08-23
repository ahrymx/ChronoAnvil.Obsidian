// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Weekly recurrence — every Wednesday at 09:30. 4.62.
//
// WHY THIS IS ITS OWN FILE. `events.ts` carried a comment saying this would
// never exist ("deliberately not a rule engine") for eleven releases, and it
// was right for what the store was then: a list of birthdays. What changed is
// that an event can carry an hour (4.52), a length (4.55) and a place on a
// clock (4.61), so the store that models "a dated thing at a time" became the
// only sensible home for a standing meeting. These assertions are the fence
// around how far that went: a weekday, a time, and two optional bounds. No
// nth-weekday, no intervals, no monthly, no skipped occurrences, no editing one
// occurrence of a series. If a test here ever needs an exception list to pass,
// the feature has grown past what was agreed.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_EVENT_COLOR,
  DEFAULT_EVENT_ICON,
  type EventDef,
  describeEventDate,
  describeEventWhen,
  expandEvents,
  eventsOnDay,
  isWeeklyEvent,
  nextWeeklyIso,
  normalizeEvent,
  partitionEvents,
  serializeEvents,
  upcomingEvents,
  weekdayOf,
} from "../src/events/events";

const WEDNESDAY = 3;

function weekly(over: Partial<EventDef> = {}): EventDef {
  return {
    id: "standup",
    title: "Stand-up",
    kind: "recurring",
    every: "week",
    weekday: WEDNESDAY,
    time: "09:30",
    icon: DEFAULT_EVENT_ICON,
    color: DEFAULT_EVENT_COLOR,
    ...over,
  };
}

describe("what counts as a weekly event", () => {
  it("is a recurring event with a weekday and an hour", () => {
    expect(isWeeklyEvent(weekly())).toBe(true);
  });

  it("is not one without a time", () => {
    // The refusal that keeps this from being a bar across every Wednesday of
    // every calendar for ever.
    expect(isWeeklyEvent(weekly({ time: undefined }))).toBe(false);
  });

  it("is not one with a weekday no week has", () => {
    expect(isWeeklyEvent(weekly({ weekday: 7 }))).toBe(false);
    expect(isWeeklyEvent(weekly({ weekday: -1 }))).toBe(false);
  });

  it("numbers its weekdays the way the date does", () => {
    // `WEEKDAY_NAMES[weekdayOf(iso)]` has to be the day the reader would say,
    // and nothing translates between the two — so this is the only thing
    // holding the array and the arithmetic together.
    expect(weekdayOf("2026-08-23")).toBe(0);
    expect(weekdayOf("2026-09-02")).toBe(WEDNESDAY);
  });
});

describe("reading one out of a note", () => {
  it("reads every, weekday and the bounds", () => {
    const def = normalizeEvent({
      title: "Stand-up",
      kind: "recurring",
      every: "week",
      weekday: 3,
      time: "09:30",
      from: "2026-09-01",
      until: "2026-12-16",
    });
    expect(def?.every).toBe("week");
    expect(def?.weekday).toBe(3);
    expect(def?.from).toBe("2026-09-01");
    expect(def?.until).toBe("2026-12-16");
  });

  it("refuses a weekly row with no time and reads it as nothing", () => {
    // Nothing else on the row makes an event: no month/day and no start, so
    // the lenient reader has nothing left to fall back to.
    expect(
      normalizeEvent({ title: "Vague", kind: "recurring", every: "week", weekday: 3 })
    ).toBe(null);
  });

  it("falls back to the annual reading when a weekly row is unusable", () => {
    // A hand-edit half-done. The month and day are still there and still mean
    // something, and dropping the row would cost the reader an event they can
    // see in their own file.
    const def = normalizeEvent({
      title: "Birthday",
      kind: "recurring",
      every: "week",
      month: 4,
      day: 12,
    });
    expect(def?.month).toBe(4);
    expect(def?.every).toBeUndefined();
  });

  it("prefers the weekly shape when a row carries both", () => {
    const def = normalizeEvent({
      title: "Both",
      kind: "recurring",
      every: "week",
      weekday: 3,
      time: "09:30",
      month: 4,
      day: 12,
    });
    expect(def?.every).toBe("week");
  });

  it("drops a bound that is not a date rather than the event", () => {
    const def = normalizeEvent({
      title: "Stand-up",
      kind: "recurring",
      every: "week",
      weekday: 3,
      time: "09:30",
      until: "next term",
    });
    expect(def?.until).toBeUndefined();
    expect(def?.weekday).toBe(3);
  });
});

describe("writing one back", () => {
  it("writes the weekly fields and none of the annual ones", () => {
    const [row] = serializeEvents([weekly({ from: "2026-09-01" })]);
    expect(row.every).toBe("week");
    expect(row.weekday).toBe(WEDNESDAY);
    expect(row.from).toBe("2026-09-01");
    expect(row.month).toBeUndefined();
    expect(row.day).toBeUndefined();
    expect(row.until).toBeUndefined();
  });

  it("round-trips through the note unchanged", () => {
    const def = weekly({ until: "2026-12-16" });
    const [row] = serializeEvents([def]);
    expect(normalizeEvent(row)).toEqual(def);
  });

  it("still writes an annual event as month and day", () => {
    const [row] = serializeEvents([
      {
        id: "birthday",
        title: "Anna",
        kind: "recurring",
        month: 4,
        day: 12,
        icon: DEFAULT_EVENT_ICON,
        color: DEFAULT_EVENT_COLOR,
      },
    ]);
    expect(row.month).toBe(4);
    expect(row.every).toBeUndefined();
  });
});

describe("the occurrences it draws", () => {
  it("falls on every one of its weekdays in the window", () => {
    const map = expandEvents([weekly()], "2026-09-01", "2026-09-21");
    expect([...map.keys()].sort()).toEqual([
      "2026-09-02",
      "2026-09-09",
      "2026-09-16",
    ]);
  });

  it("starts no earlier than its first week", () => {
    const map = expandEvents([weekly({ from: "2026-09-09" })], "2026-09-01", "2026-09-21");
    expect([...map.keys()].sort()).toEqual(["2026-09-09", "2026-09-16"]);
  });

  it("stops at its last week", () => {
    const map = expandEvents([weekly({ until: "2026-09-09" })], "2026-09-01", "2026-09-21");
    expect([...map.keys()].sort()).toEqual(["2026-09-02", "2026-09-09"]);
  });

  it("draws every occurrence solo, never as a span", () => {
    // A weekly event is a stack of separate appointments. `pos` is what tells
    // the calendar to draw a continuous bar, and a bar from one Wednesday to
    // the next would claim the days between belong to it.
    const day = expandEvents([weekly()], "2026-09-02", "2026-09-02").get("2026-09-02");
    expect(day?.[0].pos).toBe("solo");
  });

  it("draws nothing at all when it is switched off", () => {
    const map = expandEvents([weekly({ enabled: false })], "2026-09-01", "2026-09-21");
    expect(map.size).toBe(0);
  });

  it("is stamped onto a new entry like any other event", () => {
    expect(eventsOnDay([weekly()], "2026-09-02").map((d) => d.id)).toEqual(["standup"]);
    expect(eventsOnDay([weekly()], "2026-09-03")).toEqual([]);
  });
});

describe("the next one", () => {
  it("is today when today is the day", () => {
    expect(nextWeeklyIso(weekly(), "2026-09-02")).toBe("2026-09-02");
  });

  it("is the coming one otherwise", () => {
    expect(nextWeeklyIso(weekly(), "2026-09-03")).toBe("2026-09-09");
  });

  it("waits for the first week when the series has not begun", () => {
    expect(nextWeeklyIso(weekly({ from: "2026-10-01" }), "2026-09-03")).toBe(
      "2026-10-07"
    );
  });

  it("is nothing once the series has ended", () => {
    expect(nextWeeklyIso(weekly({ until: "2026-09-02" }), "2026-09-03")).toBe(null);
  });

  it("takes one row in the agenda and not fifty-two", () => {
    // A widget five rows tall would otherwise show one meeting, five times.
    const items = upcomingEvents([weekly()], "2026-09-01", 5);
    expect(items).toHaveLength(1);
    expect(items[0].iso).toBe("2026-09-02");
    expect(items[0].ongoing).toBe(false);
  });

  it("leaves the agenda once it has finished", () => {
    expect(upcomingEvents([weekly({ until: "2026-08-26" })], "2026-09-01", 5)).toEqual(
      []
    );
  });
});

describe("how it says when it is", () => {
  it("says the weekday, and nothing more when there is nothing more", () => {
    expect(describeEventDate(weekly())).toBe("Every Wednesday");
  });

  it("says the bounds when it has them", () => {
    expect(describeEventDate(weekly({ until: "2026-12-16" }))).toBe(
      "Every Wednesday, until 16 December 2026"
    );
    expect(describeEventDate(weekly({ from: "2026-09-01" }))).toBe(
      "Every Wednesday, from 1 September 2026"
    );
    expect(
      describeEventDate(weekly({ from: "2026-09-01", until: "2026-12-16" }))
    ).toBe("Every Wednesday, from 1 September 2026 until 16 December 2026");
  });

  it("leaves the annual sentence exactly as it was", () => {
    // The string this file must not have touched.
    const birthday: EventDef = {
      id: "anna",
      title: "Anna",
      kind: "recurring",
      month: 4,
      day: 12,
      icon: DEFAULT_EVENT_ICON,
      color: DEFAULT_EVENT_COLOR,
    };
    expect(describeEventDate(birthday)).toBe("12 April, every year");
  });

  it("adds the hour where every other event adds it", () => {
    expect(describeEventWhen(weekly())).toBe("Every Wednesday, 09:30");
  });
});

describe("where it sits in the manager", () => {
  it("goes in the recurring list, above the birthdays", () => {
    // Two rhythms in one list: the weekly ones are the ones happening this
    // week, so they read first; the annual ones keep the by-month order the
    // list is scanned for gaps in.
    const birthday: EventDef = {
      id: "anna",
      title: "Anna",
      kind: "recurring",
      month: 1,
      day: 3,
      icon: DEFAULT_EVENT_ICON,
      color: DEFAULT_EVENT_COLOR,
    };
    const { recurring, coming, earlier } = partitionEvents(
      [birthday, weekly({ id: "friday", weekday: 5 }), weekly()],
      "2026-09-01"
    );
    expect(recurring.map((d) => d.id)).toEqual(["standup", "friday", "anna"]);
    expect(coming).toEqual([]);
    expect(earlier).toEqual([]);
  });
});
