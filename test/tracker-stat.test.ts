// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// `tracker-stat:<tracker>` (4.70): the cells one tracker can honestly fill.
//
// The renderer needs a document and is covered by the registry and reference
// suites; what is asserted here is the half that is pure and the half that is
// easy to get wrong — which cells appear for which tracker TYPE, and how a
// value is printed. A `time` tracker printed as a number is the specific bug
// this file exists to catch: `collectPoints` hands over minutes since midnight,
// so a bedtime reaches this function as 1350.

import { describe, it, expect, beforeAll } from "vitest";
import { moment } from "./obsidian-stub";
import { trackerCards } from "../src/trackers/tracker-stat";
import type { TrackerDef } from "../src/trackers/trackers";
import type { ChartPoint } from "../src/charts/charts";
import { confidenceKinds, confidenceStats } from "../src/ui/tables";
import { cleanFaceGlyph } from "../src/ui/widgets/tracker-controls";
import { MEDIA_PRESET } from "../src/journals/journal";
import type ChronoAnvilPlugin from "../src/main";

beforeAll(() => {
  // `window.moment` IS OBSIDIAN'S GLOBAL, not an import, so the shim has to be
  // installed rather than aliased — the `obsidian` module alias in
  // `vitest.config.ts` cannot reach a property of `window`. Only the date
  // formatting under "Latest" reads it.
  (globalThis as { window?: unknown }).window ??= { moment };
});

const def = (over: Partial<TrackerDef>): TrackerDef =>
  ({
    id: "mood",
    label: "Mood",
    type: "scale",
    surface: "daily",
    min: 1,
    max: 5,
    ...over,
  }) as TrackerDef;

const pts = (...pairs: [string, number][]): ChartPoint[] =>
  pairs.map(([date, value]) => ({ date, value }) as ChartPoint);

describe("the cells a tracker can fill", () => {
  it("says nothing at all rather than zeroes, with no readings", () => {
    // `summarize` returns null on an empty series and this returns [] rather
    // than three cells reading 0 — the empty state is the caller's callout,
    // which names the tracker and says where to log it. A band of zeroes is a
    // claim that the reader logged zero, not that they logged nothing.
    expect(trackerCards(def({}), [])).toEqual([]);
  });

  it("gives a scale its latest, its average and its range", () => {
    const cards = trackerCards(
      def({}),
      pts(["2026-08-01", 3], ["2026-08-02", 5], ["2026-08-03", 4])
    );
    expect(cards.map((c) => c.label)).toEqual(["Latest", "Average", "Range"]);
    expect(cards[0].value).toBe("4");
    expect(cards[0].sub).toBe("3 Aug");
    expect(cards[1].value).toBe("4");
    expect(cards[1].sub).toBe("over 3 entries");
    expect(cards[2].value).toBe("3–5");
  });

  it("gives a habit a streak instead of a range", () => {
    // `streakableType` is boolean-only, and the reason is in its own comment: a
    // number has no notion of "the same again". The two branches are exclusive,
    // so a tracker never draws both and never draws neither.
    const cards = trackerCards(
      def({ id: "exercise", label: "Exercise", type: "boolean" }),
      pts(
        ["2026-08-01", 1],
        ["2026-08-02", 0],
        ["2026-08-03", 1],
        ["2026-08-04", 1]
      )
    );
    expect(cards.map((c) => c.label)).toEqual(["Latest", "Average", "Streak"]);
    expect(cards[2].value).toBe("2");
    expect(cards[2].sub).toBe("best 2");
  });

  it("orders by date rather than trusting the series", () => {
    // `collectPoints` walks a folder, and a folder's order is not a promise.
    // "Latest" reading the last ELEMENT rather than the last DATE would be a
    // number that changes when a file is renamed.
    const cards = trackerCards(
      def({}),
      pts(["2026-08-03", 4], ["2026-08-01", 3], ["2026-08-02", 5])
    );
    expect(cards[0].value).toBe("4");
    expect(cards[0].sub).toBe("3 Aug");
  });

  it("prints a time tracker as a clock, never as its minutes", () => {
    const cards = trackerCards(
      def({ id: "bedtime", label: "Bedtime", type: "time" }),
      pts(["2026-08-01", 1350], ["2026-08-02", 1410])
    );
    expect(cards[0].value).toBe("23:30");
    expect(cards[1].value).toBe("23:00");
    expect(cards[2].value).toBe("22:30–23:30");
  });

  it("rounds to one place and appends the unit where there is one", () => {
    // 3.7142857 is noise past the first place, and a whole number keeps no
    // decimal at all — a band whose cells change width day to day reads as
    // unstable.
    const cards = trackerCards(
      def({ id: "water", label: "Water", type: "number", unit: "L" }),
      pts(["2026-08-01", 2], ["2026-08-02", 1], ["2026-08-03", 2])
    );
    expect(cards[0].value).toBe("2 L");
    expect(cards[1].value).toBe("1.7 L");
    expect(cards[2].value).toBe("1–2 L");
  });

  it("says entry rather than entries for a series of one", () => {
    const cards = trackerCards(def({}), pts(["2026-08-01", 3]));
    expect(cards[1].sub).toBe("over 1 entry");
  });
});

describe("confidenceKinds and confidenceStats on journal containers and roots", () => {
  const plugin = {
    settings: {
      customJournals: [
        {
          id: "study",
          name: "Study",
          emoji: "🎓",
          root: "03 - Journals/Study",
          levels: [
            { id: "subject", noun: "Subject" },
            { id: "topic", noun: "Topic" },
          ],
          kinds: [
            { id: "lesson", label: "Lesson", rating: "confidence" },
            { id: "practice", label: "Practice", rating: "accuracy" },
          ],
        },
        {
          id: "media",
          name: "Media",
          emoji: "🍿",
          root: "03 - Journals/Media",
          levels: [{ id: "medium", noun: "Medium" }],
          kinds: [{ id: "title", label: "Title", rating: "stars" }],
        },
      ],
      trackers: [],
    },
  } as unknown as ChronoAnvilPlugin;

  it("resolves kinds for container folder paths, journal roots, and dashboard paths", () => {
    expect(
      confidenceKinds(plugin, "03 - Journals/Study/Linear Algebra", "confidence")
    ).toEqual(["lesson"]);
    expect(
      confidenceKinds(plugin, "03 - Journals/Study", "confidence")
    ).toEqual(["lesson"]);
    expect(
      confidenceKinds(plugin, "03 - Journals/Study/Study.md", "confidence")
    ).toEqual(["lesson"]);
    expect(
      confidenceKinds(plugin, "03 - Journals/Media/Books", "stars")
    ).toEqual(["title"]);
    expect(
      confidenceKinds(plugin, "03 - Journals/Media", "stars")
    ).toEqual(["title"]);
  });

  it("returns empty array for paths outside any journal root", () => {
    expect(
      confidenceKinds(plugin, "01 - Workbenches/Homepage.md", "confidence")
    ).toEqual([]);
  });

  it("computes confidenceStats average over typed pages in a container", () => {
    const pages = [
      {
        file: { basename: "Lesson 1", path: "03 - Journals/Study/Linear Algebra/Vector Spaces/Lesson 1.md" } as any,
        fm: { type: "lesson", confidence: 4, date: "2026-08-01" },
      },
      {
        file: { basename: "Lesson 2", path: "03 - Journals/Study/Linear Algebra/Vector Spaces/Lesson 2.md" } as any,
        fm: { type: "lesson", confidence: 5, date: "2026-08-02" },
      },
      {
        file: { basename: "Practice 1", path: "03 - Journals/Study/Linear Algebra/Vector Spaces/Practice 1.md" } as any,
        fm: { type: "practice", accuracy: 90, date: "2026-08-02" },
      },
    ];
    const kinds = confidenceKinds(
      plugin,
      "03 - Journals/Study/Linear Algebra/Vector Spaces",
      "confidence"
    );
    const stats = confidenceStats(pages, "confidence", kinds);
    expect(stats).not.toBeNull();
    expect(stats?.avg).toBe("4.5");
    expect(stats?.count).toBe(2);
  });
});

describe("scale picker faces and value labels", () => {
  it("simplifies repeating face strings to a single emoji/glyph", () => {
    expect(cleanFaceGlyph("★")).toBe("★");
    expect(cleanFaceGlyph("★★★★")).toBe("★");
    expect(cleanFaceGlyph("⭐⭐⭐⭐⭐")).toBe("⭐");
    expect(cleanFaceGlyph("🔥🔥🔥")).toBe("🔥");
    expect(cleanFaceGlyph("😄")).toBe("😄");
    expect(cleanFaceGlyph("Low")).toBe("Low");
  });

  it("MEDIA_PRESET defines one star emoji per value", () => {
    const starTracker = MEDIA_PRESET.trackers.find((t) => t.id === "stars");
    expect(starTracker?.faces).toEqual(["★", "★", "★", "★", "★"]);
  });

  it("maps legacy repeating star strings cleanly across min..max", () => {
    const legacyFaces = ["★", "★★", "★★★", "★★★★", "★★★★★"];
    const cleaned = legacyFaces.map(cleanFaceGlyph);
    expect(cleaned).toEqual(["★", "★", "★", "★", "★"]);
  });
});


