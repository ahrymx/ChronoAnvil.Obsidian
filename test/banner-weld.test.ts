// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// 4.19's migration: a banner that is still two fences, welded into one.
//
// WHY THIS FILE IS SEPARATE FROM THE CATALOGUE TESTS. `mergeBannerFences` is the
// only thing in this release that WRITES to a note a reader already has. Repair
// is additive and refuses to move a line; this moves one, which is why it ships
// in the `migrations` group a reader ticks separately. The catalogue tests
// assert what a fresh note composes to; these assert what happens to an old one,
// and the interesting half is everything the function DECLINES to do.
//
// THE FIXTURES ARE COMPOSED, NOT WRITTEN. A hand-typed "old dashboard" is a
// guess about what readers have. `composeDiaryDashboard` at 4.18 is not
// available to import, so the pre-4.19 shape is reconstructed from the current
// composition by splitting the banner fence back into two — which is exactly the
// edit 4.19 made, run backwards, and therefore the one shape that is certainly
// what a reader's file looks like.

import { describe, expect, it } from "vitest";
import { mergeBannerFences } from "../src/core/note-sections";
import { composeDiaryDashboard } from "../src/diary/diary-sections";
import { composeSearchNote } from "../src/diary/search-sections";
import { composeHomeNote } from "../src/diary/home-sections";
import { composeDiaryDashboardNote } from "../src/diary/diary-dashboard-sections";
import { DEFAULT_PATHS } from "../src/core/constants";

const ROOT = DEFAULT_PATHS.diaryRoot;
const GRAINS = ["weekly", "monthly", "quarterly", "yearly"] as const;

// A 4.18-shaped note: the banner's two lines in two fences.
function unwelded(text: string): string {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => l.startsWith("title:"));
  expect(at, "fixture must have a title row").toBeGreaterThan(-1);
  const out = [...lines];
  const close = out.findIndex((l, i) => i >= at && l.trim() === "```");
  out.splice(close + 1, 0, "", "```almanac", "links:today,scopes#diary", "```");
  return out.join("\n");
}

const PAGES: { name: string; text: () => string }[] = [
  { name: "Search", text: () => composeSearchNote(ROOT) },
  ...GRAINS.map((g) => ({
    name: `the ${g} dashboard`,
    text: () => composeDiaryDashboard(g),
  })),
];

describe("welding a banner that is still two fences", () => {
  for (const page of PAGES) {
    it(`welds ${page.name} banner and links into one fence`, () => {
      const now = page.text();
      const welded = mergeBannerFences(unwelded(now))!;
      expect(welded).not.toBeNull();
      const fence = welded
        .split("```")
        .find((f) => f.includes("title:home,diary,journals"))!;
      expect(fence).toContain("links:today,scopes#diary");
    });

    it(`leaves ${page.name} alone once it has no links fence below`, () => {
      expect(mergeBannerFences(page.text())).toBeNull();
    });
  }

  it("moves the row rather than rewriting it", () => {
    const mine = unwelded(composeDiaryDashboard("weekly")).replace(
      "links:today,scopes#diary",
      "links:today,week,month,capture#diary"
    );
    const out = mergeBannerFences(mine)!;
    expect(out).toContain("links:today,week,month,capture#diary");
    expect(out).not.toContain("links:today,scopes#diary");
  });

  it("puts the row under the title, inside one fence", () => {
    const out = mergeBannerFences(unwelded(composeDiaryDashboard("monthly")))!;
    const fence = out
      .split("```")
      .find((f) => f.includes("title:home,diary,journals"))!;
    expect(fence).toContain("links:today,scopes#diary");
    expect(fence.indexOf("title:")).toBeLessThan(fence.indexOf("links:"));
    // And the masthead below it keeps everything else it had.
    expect(out).toContain("month-summary");
    expect(out).toContain("button:new-month");
    expect(out.match(/links:/g)).toHaveLength(1);
  });
});

describe("what it declines to do", () => {
  it("does nothing to a page that composes no navigation row", () => {
    // The homepage and both folder notes never had one — their navigation is a
    // widget the reader chose. A migration that invented a row for them would be
    // adding a feature under cover of a format fix.
    expect(mergeBannerFences(composeHomeNote(ROOT))).toBeNull();
    expect(mergeBannerFences(composeDiaryDashboardNote())).toBeNull();
  });

  it("does nothing to a note with no page title at all", () => {
    // `setPageWide` answers the same way for the same reason: there is no line
    // to weld onto and no second sentence to invent. A dashboard in this state
    // is one whose head a reader removed while that was still allowed.
    const text = unwelded(composeDiaryDashboard("weekly"))
      .split("\n")
      .filter((l) => !l.startsWith("title:"))
      .join("\n");
    expect(mergeBannerFences(text)).toBeNull();
  });

  it("refuses when the reader put something between the two blocks", () => {
    // THE REFUSAL THAT MATTERS. A note with a widget between its title card and
    // its navigation row is a note somebody ARRANGED, and hoisting the row past
    // it would rewrite a page they made rather than one this plugin composed.
    const text = unwelded(composeDiaryDashboard("weekly")).replace(
      "\n```almanac\nlinks:",
      "\n```almanac\ntasks-table\n```\n\n```almanac\nlinks:"
    );
    expect(mergeBannerFences(text)).toBeNull();
  });

  it("refuses when the reader wrote prose between them", () => {
    const text = unwelded(composeDiaryDashboard("weekly")).replace(
      "\n```almanac\nlinks:",
      "\n## My own heading\n\n```almanac\nlinks:"
    );
    expect(mergeBannerFences(text)).toBeNull();
  });

  it("keeps the reader's own blocks and bytes everywhere else", () => {
    const text =
      unwelded(composeDiaryDashboard("quarterly")) +
      "\n## Notes to myself\n\nSomething I wrote.\n";
    const out = mergeBannerFences(text)!;
    expect(out).toContain("## Notes to myself");
    expect(out).toContain("Something I wrote.");
    // One line moved and nothing else did: the note is shorter by exactly the
    // two fence lines the weld removed.
    expect(out.split("\n")).toHaveLength(text.split("\n").length - 3);
  });

  it("drops the donor block when the row was the whole of it", () => {
    // A dashboard whose summary a reader removed leaves a fence holding only the
    // navigation row. Welding empties it, and an empty fence renders as an empty
    // block — worse than the seam this closes.
    const text = [
      "`almanac:spacer`",
      "```almanac",
      "title:home,diary,journals",
      "```",
      "",
      "```almanac",
      "links:today,scopes#diary",
      "```",
      "",
      "```almanac",
      "tag-index",
      "```",
      "",
    ].join("\n");
    const out = mergeBannerFences(text)!;
    expect(out).toBe(
      [
        "`almanac:spacer`",
        "```almanac",
        "title:home,diary,journals",
        "links:today,scopes#diary",
        "```",
        "",
        "```almanac",
        "tag-index",
        "```",
        "",
      ].join("\n")
    );
  });
});
