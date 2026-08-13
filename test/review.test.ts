// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import {
  addDays,
  daysBetween,
  describeDue,
  describeNext,
  dueItems,
  isDue,
  nextDue,
  reviewIntervalDays,
  scheduleFor,
} from "../src/review/review";

const TODAY = "2026-07-26";

describe("reviewIntervalDays", () => {
  it("grows the gap with confidence", () => {
    expect(reviewIntervalDays(1)).toBe(1);
    expect(reviewIntervalDays(2)).toBe(3);
    expect(reviewIntervalDays(3)).toBe(7);
    expect(reviewIntervalDays(4)).toBe(14);
    expect(reviewIntervalDays(5)).toBe(30);
  });

  it("is monotonic, which is the only property worth pinning", () => {
    // The exact numbers are a judgement call and may be tuned. That each step
    // is longer than the last is the model.
    const steps = [1, 2, 3, 4, 5].map(reviewIntervalDays);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]).toBeGreaterThan(steps[i - 1]);
    }
  });

  it("falls to the shortest interval for a value it can't read", () => {
    // No evidence is not the same as good evidence, and the safe direction for
    // no evidence is "look at it soon".
    for (const bad of [undefined, null, "", "high", 0, 9, NaN]) {
      expect(reviewIntervalDays(bad)).toBe(1);
    }
  });

  it("rounds a fractional confidence rather than falling through", () => {
    expect(reviewIntervalDays(3.4)).toBe(reviewIntervalDays(3));
    expect(reviewIntervalDays("4")).toBe(14);
  });
});

describe("ISO date arithmetic", () => {
  it("adds days across a month boundary", () => {
    expect(addDays("2026-07-30", 3)).toBe("2026-08-02");
  });

  it("adds days across a year boundary", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("counts the gap in both directions", () => {
    expect(daysBetween("2026-07-26", "2026-08-02")).toBe(7);
    expect(daysBetween("2026-08-02", "2026-07-26")).toBe(-7);
    expect(daysBetween("2026-07-26", "2026-07-26")).toBe(0);
  });

  it("leaves an unparseable date alone rather than producing NaN-01-01", () => {
    expect(addDays("not a date", 3)).toBe("not a date");
    expect(daysBetween("nope", "2026-07-26")).toBe(0);
  });
});

describe("scheduleFor", () => {
  it("counts from the note's date when it has never been reviewed", () => {
    const s = scheduleFor({ date: "2026-07-20", confidence: 3 }, TODAY)!;
    expect(s.due).toBe("2026-07-27"); // +7 for confidence 3
    expect(s.inDays).toBe(1);
    expect(s.everReviewed).toBe(false);
  });

  it("counts from the last review once there is one", () => {
    const s = scheduleFor(
      { date: "2026-01-01", reviewed: "2026-07-24", confidence: 2 },
      TODAY
    )!;
    expect(s.due).toBe("2026-07-27"); // +3 from the review, not from January
    expect(s.everReviewed).toBe(true);
  });

  it("reports an overdue note with a negative gap", () => {
    const s = scheduleFor({ date: "2026-07-01", confidence: 1 }, TODAY)!;
    expect(s.due).toBe("2026-07-02");
    expect(s.inDays).toBeLessThan(0);
    expect(isDue(s)).toBe(true);
  });

  it("treats due today as due", () => {
    const s = scheduleFor({ date: "2026-07-25", confidence: 1 }, TODAY)!;
    expect(s.due).toBe(TODAY);
    expect(isDue(s)).toBe(true);
  });

  // ── the exclusions ────────────────────────────────────────────────────

  it("has no schedule for an index note, which carries no date", () => {
    // Subject and Topic notes deliberately have no `date` — otherwise
    // buildTopicsTable would report a topic's creation day as study activity.
    // An index holds a current value; only a dated note forms a series.
    expect(scheduleFor({ confidence: 3, status: "in-progress" }, TODAY)).toBeNull();
  });

  it("schedules an index note that has somehow been reviewed", () => {
    // `reviewed` alone is enough to count from, so the missing-date rule is
    // about having no anchor rather than about being an index per se.
    expect(
      scheduleFor({ reviewed: "2026-07-20", confidence: 3 }, TODAY)
    ).not.toBeNull();
  });

  it("drops a completed note", () => {
    // A finished note is not homework, and a queue that keeps surfacing things
    // you deliberately closed is a queue you stop reading.
    expect(
      scheduleFor({ date: "2026-01-01", confidence: 1, status: "completed" }, TODAY)
    ).toBeNull();
  });

  it("drops a paused note", () => {
    expect(
      scheduleFor({ date: "2026-01-01", confidence: 1, status: "paused" }, TODAY)
    ).toBeNull();
  });

  it("keeps an in-progress note, and one with no status at all", () => {
    expect(
      scheduleFor({ date: "2026-07-01", status: "in-progress" }, TODAY)
    ).not.toBeNull();
    expect(scheduleFor({ date: "2026-07-01" }, TODAY)).not.toBeNull();
  });

  it("ignores a timestamp on a date property", () => {
    // Obsidian writes a date property as YYYY-MM-DD, but a hand-edited or
    // imported note may carry a full timestamp.
    const s = scheduleFor(
      { date: "2026-07-20T09:14:00", confidence: 3 },
      TODAY
    )!;
    expect(s.due).toBe("2026-07-27");
  });

  it("ignores a date it can't parse rather than scheduling nonsense", () => {
    expect(scheduleFor({ date: "last Tuesday", confidence: 3 }, TODAY)).toBeNull();
  });
});

describe("dueItems", () => {
  const notes = [
    { id: "cold", date: "2026-01-01", confidence: 1 },
    { id: "warm", date: "2026-07-20", confidence: 3 },
    { id: "fresh", date: "2026-07-25", confidence: 5 },
    { id: "done", date: "2026-01-01", confidence: 1, status: "completed" },
    { id: "index", confidence: 2 },
  ];
  const read = (n: (typeof notes)[number]) => n;

  it("returns only what is due", () => {
    const ids = dueItems(notes, read, TODAY).map((i) => i.note.id);
    expect(ids).toContain("cold");
    expect(ids).not.toContain("fresh");
    expect(ids).not.toContain("done");
    expect(ids).not.toContain("index");
  });

  it("puts the most overdue first", () => {
    const withMid = [...notes, { id: "mid", date: "2026-07-10", confidence: 1 }];
    const ids = dueItems(withMid, read, TODAY).map((i) => i.note.id);
    expect(ids[0]).toBe("cold");
    expect(ids.indexOf("cold")).toBeLessThan(ids.indexOf("mid"));
  });

  it("caps the list when asked", () => {
    // A short list is a next action; a long one is a backlog.
    expect(dueItems(notes, read, TODAY, 1)).toHaveLength(1);
  });

  it("returns nothing when everything is fresh", () => {
    expect(dueItems([notes[2]], read, TODAY)).toEqual([]);
  });
});

describe("nextDue", () => {
  it("finds the soonest not-yet-due note", () => {
    const notes = [
      { id: "a", date: "2026-07-25", confidence: 5 }, // due +30 → 24 Aug
      { id: "b", date: "2026-07-25", confidence: 3 }, // due +7 → 1 Aug
    ];
    const s = nextDue(notes, (n) => n, TODAY)!;
    expect(s.due).toBe("2026-08-01");
  });

  it("ignores notes that are already due", () => {
    const notes = [
      { id: "overdue", date: "2026-01-01", confidence: 1 },
      { id: "later", date: "2026-07-25", confidence: 5 },
    ];
    expect(nextDue(notes, (n) => n, TODAY)!.due).toBe("2026-08-24");
  });

  it("is null when nothing is scheduled at all", () => {
    // Reads differently from "all caught up", and should: one means there is
    // nothing here, the other means you are ahead of it.
    expect(nextDue([{ id: "index", confidence: 3 }], (n) => n, TODAY)).toBeNull();
  });
});

describe("wording", () => {
  const at = (days: number) => ({ due: "x", inDays: days, everReviewed: true });

  it("states lateness without escalating", () => {
    // No exclamation, no count of how many you have let slip, no colour word.
    // The queue surfaces; it does not nag.
    expect(describeDue(at(0))).toBe("due today");
    expect(describeDue(at(-1))).toBe("due yesterday");
    expect(describeDue(at(-3))).toBe("due 3 days ago");
    expect(describeDue(at(-9))).toBe("due last week");
    expect(describeDue(at(-30))).toBe("due 4 weeks ago");
    expect(describeDue(at(-90))).toBe("due 3 months ago");
    for (const d of [0, -1, -3, -9, -30, -90, -400]) {
      expect(describeDue(at(d))).not.toMatch(/!|overdue|behind|missed/i);
    }
  });

  it("states the next one in the same register", () => {
    expect(describeNext(at(1))).toBe("tomorrow");
    expect(describeNext(at(3))).toBe("in 3 days");
    expect(describeNext(at(9))).toBe("next week");
    expect(describeNext(at(30))).toBe("in 4 weeks");
    expect(describeNext(at(90))).toBe("in 3 months");
  });
});

// ── review-queue.ts: which folders a queue reads ─────────────────────────
// Pulled in separately from the pure module because it reads the journal
// registry, which needs a plugin shape.
import { queueScope } from "../src/review/review-queue";
import { readSrc } from "./sources";
import { studyConfigFor } from "./study-template";

describe("queueScope", () => {
  const plugin = (custom: { id: string; name: string; root: string }[] = []) =>
    ({
      settings: {
        paths: {
          journalsRoot: "03 - Journals",
          studyRoot: "03 - Journals/Study",
        },
        // STUDY IS A STORED JOURNAL SINCE 3.20, so a fixture that wants it
        // registered puts it in the store — which is what the migration does to
        // a real vault on load. It used to be `studyEnabled: true` and no
        // entry, which is the shape no vault has any more.
        customJournals: [
          studyConfigFor({ root: "03 - Journals/Study" }),
          ...custom.map((c) => ({
          ...c,
          emoji: "📔",
          templatesFolder: `T/${c.name}`,
          levels: [{ noun: "Section", fallbackEmoji: "📂" }],
          kinds: [{ id: "entry", emoji: "📝", label: "Entry" }],
          })),
        ],
      },
    }) as unknown as Parameters<typeof queueScope>[0];

  it("scopes a bare directive to the host note's folder", () => {
    expect(queueScope(plugin(), "", "03 - Journals/Maths")).toEqual([
      "03 - Journals/Maths",
    ]);
  });

  it("takes an explicit folder argument", () => {
    expect(queueScope(plugin(), "03 - Journals/Maths/Algebra", null)).toEqual([
      "03 - Journals/Maths/Algebra",
    ]);
  });

  it("reads nothing when a bare directive has no host folder", () => {
    expect(queueScope(plugin(), "", null)).toEqual([]);
  });

  it("spans every journal root for `all`", () => {
    const p = plugin([{ id: "cooking", name: "Cooking", root: "04 - Cooking" }]);
    expect(queueScope(p, "all", null).sort()).toEqual([
      "03 - Journals/Study",
      "04 - Cooking",
    ]);
  });

  it("drops a root nested inside another, so notes aren't counted twice", () => {
    // Not the default layout since 2.45 — Study and each custom journal are
    // siblings under the journals root — but a root is a settings value and
    // one can still be pointed inside another. Listing both would walk every
    // Cooking note twice, once as Cooking and once as Study.
    const p = plugin([
      { id: "cooking", name: "Cooking", root: "03 - Journals/Study/Cooking" },
    ]);
    expect(queueScope(p, "all", null)).toEqual(["03 - Journals/Study"]);
  });

  it("keeps both roots when neither contains the other", () => {
    const p = plugin([
      { id: "cooking", name: "Cooking", root: "03 - Journals Cooking" },
    ]);
    // "03 - Journals Cooking" is not inside "03 - Journals" — prefix matching
    // has to respect the separator, the same rule pathInFolder follows.
    expect(queueScope(p, "all", null)).toHaveLength(2);
  });

  it("reads only the custom roots when Study is not installed", () => {
    // "Turned off" was a state a journal could be in until 3.20. Removing it is
    // now the same operation as removing any other journal: it leaves the store.
    const p = plugin([{ id: "cooking", name: "Cooking", root: "04 - Cooking" }]);
    p.settings.customJournals = p.settings.customJournals.filter(
      (j: { id: string }) => j.id !== "study"
    );
    expect(queueScope(p, "all", null)).toEqual(["04 - Cooking"]);
  });

  it("reads nothing at all on a vault with no journals", () => {
    // THE PRECONDITION THAT BROKE THE JOURNALS DASHBOARD, pinned so the next
    // reader meets it before a screenshot does. `registeredJournalTypes` is
    // `settings.customJournals` and nothing else, so a brand-new vault resolves
    // `:all` to no folders — which is correct, and is exactly the state the
    // dashboard's Review section is first seen in.
    //
    // This is not a bug in `queueScope`. It is the input every CALLER of it has
    // to handle, and until 4.1 one of them did not.
    const p = plugin();
    p.settings.customJournals = [];
    expect(queueScope(p, "all", null)).toEqual([]);
  });
});

describe("an empty scope is an empty state, not an unknown widget", () => {
  // ASSERTED ON THE SOURCE, AND SAYING SO. The suite has no DOM, so a builder
  // that calls `createDiv` cannot be run here — the property has to be pinned
  // at the one place it is decided instead of at the one place it is seen.
  //
  // WHAT WENT WRONG, because the shape is worth keeping. `buildReviewQueueRegion`
  // returned `null` when its scope resolved to no folders, and a null from a
  // builder makes the dispatcher print `Unknown Almanac widget: review-queue:all`
  // — false twice over: the widget is known, and the note is fine. It was a
  // vault with no journals in it yet.
  //
  // It was unreachable for as long as this directive only ever appeared on a
  // journal's own index note, which cannot exist before the journal does. 4.1's
  // journals dashboard is the first page to ship one ABOVE every journal, so a
  // new vault's first sight of that page was a red error where the section
  // should be.
  it("does not return null when the queue has no folders in scope", () => {
    const src = readSrc("directive-regions");
    const region = src.slice(
      src.indexOf("export function buildReviewQueueRegion"),
      src.indexOf("export function buildJournalSearchRegion")
    );
    expect(region).toContain("folders.length === 0");
    expect(region).not.toMatch(/folders\.length === 0\)\s*return null/);
  });

  it("says what will appear there and how, rather than drawing a blank", () => {
    // `empty.ts`'s rule, and the branch it had never been applied to: the
    // no-scope case returned a bare root div, which reads as a rendering fault
    // rather than as an answer.
    const q = readSrc("review-queue");
    const branch = q.slice(
      q.indexOf("const folders = queueScope(plugin, arg, hostFolder);"),
      q.indexOf("const props = reviewProperties(plugin);")
    );
    expect(branch).toContain("emptyLine");
    expect(branch).toMatch(/No journals yet/);
  });
});
