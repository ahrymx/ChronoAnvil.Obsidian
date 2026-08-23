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
  matchesEventFilter,
  partitionEvents,
} from "../src/events/events";

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
