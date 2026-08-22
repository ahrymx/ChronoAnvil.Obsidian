// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Patch 1 of the 3.0 plan: `move`, for both diary catalogues.
//
// This is the patch that keeps a promise rather than adding a feature. 2.60.2
// shipped a refusal message reading "You can move it, though." and there was no
// move — so the first thing these tests assert is that the sentence is now
// true, on the exact case it was written about.
//
// Testable with no UI at all, which is why it is patch 1 and not part of the
// editor's.

import { describe, expect, it } from "vitest";
import {
  composeDiaryDashboard,
  applyDiarySections,
  detectDiarySections,
  diaryRemovalRefusal,
  isMovable,
  planDiarySections,
  sectionsForDashboard,
  DIARY_SECTIONS,
  diarySectionModel,
} from "../src/diary/diary-sections";
import {
  composeEntryTemplate,
  applyEntrySections,
  detectEntrySections,
  entryRemovalRefusal,
  planEntrySections,
  parseEntry,
  ENTRY_SECTIONS,
} from "../src/diary/entry-sections";
import type { DashboardGrain } from "../src/diary/diary-sections";
import { TRACKER_CLASSES } from "../src/trackers/trackers";

const DASH_GRAINS: DashboardGrain[] = [
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
];

const daily = (): string => composeEntryTemplate("daily");
const monthly = (): string => composeDiaryDashboard("monthly");

// ── the promise 2.60.2 made, and what 3.2 §4 took back ────────────────
//
// These three tests used to assert that "You can move it, though." was true on
// the exact case it was written about — a reader putting their links below the
// banner. 3.2 §4 decides that navigation is the fixed top row of every diary
// surface, so that case is now refused rather than performed.
//
// THE TESTS ARE INVERTED, NOT DELETED. What they were guarding is still worth
// guarding, and it was never really "links can move": it was "the message and
// the machinery agree". That property has to hold in both directions, and it is
// easier to break in this one — a refusal that offers a move nothing performs
// is the 2.60.2 defect, and a refusal that stays silent about a restriction is
// its mirror image.

describe("the refusal and the machinery still agree", () => {
  // ── AND AS OF 4.19 THERE IS ONE STRUCTURAL SECTION, NOT TWO ─────────
  //
  // `links` and `entry-header` were two catalogue entries composing into one
  // fence — an entry has drawn ONE banner and reported TWO sections since 3.2.
  // 4.19 merged the entries. The property these tests guard is unchanged and is
  // now easier to state: the message and the machinery agree about a section
  // that can be neither removed nor moved.

  it("stops offering a move the structural section does not have", () => {
    const banner = ENTRY_SECTIONS.find((s) => s.id === "banner")!;
    const why = entryRemovalRefusal(banner, daily())!;
    expect(why).toContain("can't be removed");
    // The 2.60.2 defect, restated for the merged section: a refusal that offers
    // a move nothing performs.
    expect(why).not.toContain("You can still move it");
  });

  it("says the banner is fixed, and says which way", () => {
    // A refusal that only said "no" would send a reader hunting for the setting
    // — 2.59.6's rule. This one names the rule instead of a fix, because there
    // is no fix and pretending otherwise is the whole failure mode.
    const banner = ENTRY_SECTIONS.find((s) => s.id === "banner")!;
    const why = entryRemovalRefusal(banner, daily())!;
    expect(why).toContain("Part of every entry");
    expect(why).toContain("can't be removed");
  });

  it("opens every entry with the banner and nothing else above the rule", () => {
    const text = daily();
    expect(detectEntrySections(text, { grain: "daily" }).slice(0, 2)).toEqual([
      "banner",
      "trackers",
    ]);

    // THE SWAP THAT USED TO BE REFUSED CANNOT BE ASKED FOR ANY MORE, which is
    // the merge's quietest benefit: two structural sections could be named in
    // the wrong order and the write had to decline it. One cannot.
    const want = ["banner", "trackers", ...restOf(text)];
    expect(applyEntrySections(text, { grain: "daily" }, want)).toBeNull();
  });

  it("and names no move for it in the plan either", () => {
    // The plan is the preview. A plan that promised a move the write would not
    // perform is the same lie one layer up.
    const text = daily();
    const ops = planEntrySections(text, { grain: "daily" }, [
      "banner",
      "trackers",
      ...restOf(text),
    ]);
    expect(ops.find((o) => o.kind === "move")).toBeUndefined();
  });

  it("still moves what is below the rule", () => {
    // The pin is on one row, not on reordering. If this went quiet too, the
    // patch would have deleted the feature rather than restricting it.
    const text = daily();
    const shared = restOf(text);
    const want = ["banner", "trackers", shared[1], shared[0], ...shared.slice(2)];
    const ops = planEntrySections(text, { grain: "daily" }, want);
    expect(ops.some((o) => o.kind === "move")).toBe(true);
    expect(applyEntrySections(text, { grain: "daily" }, want)).not.toBeNull();
  });
});

// Everything BELOW the rule. Two structural sections above it as of 4.20 — the
// banner and the tracker grid — so both are filtered out rather than one.
const restOf = (text: string): string[] =>
  detectEntrySections(text, { grain: "daily" }).filter(
    (id) => id !== "banner" && id !== "trackers"
  );

// ── a move is a splice, not a recomposition ───────────────────────────

describe("a reorder preserves the reader's own bytes", () => {
  it("keeps writing in a region that moved above another section", () => {
    const text = daily().replace(
      "<!--almanac:log\n-->",
      "<!--almanac:log\nI wrote three lines here.\n\nAnd left a blank one.\n-->"
    );
    const present = detectEntrySections(text, { grain: "daily" });
    const want = [
      ...present.filter((id) => id !== "log"),
    ];
    want.splice(2, 0, "log");

    const next = applyEntrySections(text, { grain: "daily" }, want)!;
    expect(next).toContain("I wrote three lines here.");
    expect(next).toContain("And left a blank one.");
    // The REGION did not move — only the directive did. A region renders as
    // nothing and the widget draws where its directive is, so moving the
    // reader's text would rewrite their lines to no visible effect.
    expect(next.indexOf("<!--almanac:focus")).toBeLessThan(
      next.indexOf("<!--almanac:log")
    );
  });

  it("leaves a hand-written directive where it was", () => {
    // A line the catalogue never wrote keeps its index, and the sections trade
    // the slots they had around it. The only rule available: a foreign line has
    // no correct destination.
    const text = daily().replace(
      "tasks:todo|Tasks",
      "tasks:todo|Tasks\nsomething-i-added"
    );
    const present = detectEntrySections(text, { grain: "daily" });
    const want = [present[0], present[1], ...present.slice(2).reverse()];
    const next = applyEntrySections(text, { grain: "daily" }, want)!;
    expect(next).toContain("something-i-added");
    expect(next.split("\n").filter((l) => l === "something-i-added")).toHaveLength(1);
  });

  it("changes nothing outside the fence it reordered", () => {
    const text = daily();
    const present = detectEntrySections(text, { grain: "daily" });
    const next = applyEntrySections(text, { grain: "daily" }, [
      present[0],
      present[1],
      ...present.slice(2).reverse(),
    ])!;
    // Frontmatter, the spacer, the rule and every region survive untouched.
    const head = (t: string): string => t.slice(0, t.indexOf("```almanac"));
    expect(head(next)).toBe(head(text));
    for (const key of ["focus", "log", "attachments", "todo", "capture"]) {
      expect(next).toContain(`<!--almanac:${key}`);
    }
  });
});

// ── the rule a reorder may not cross ──────────────────────────────────

describe("a section cannot be reordered across the rule", () => {
  it("refuses to lift a personal section above the structural fences", () => {
    // §6 of the 3.0 plan asks whether reordering should cross the rule. It does
    // not, and this is what that means in practice: asking for it produces the
    // two halves permuted independently, never a section on the wrong side.
    const text = daily();
    const next = applyEntrySections(text, { grain: "daily" }, [
      "log",
      "banner",
      "trackers",
      "focus",
      "attachments",
      "todo",
      "capture",
    ]);
    const after = next ?? text;
    // `log` is still below the rule.
    expect(after.indexOf("note:log")).toBeGreaterThan(after.indexOf("\n---\n\n```almanac"));
    // The structural half is still the structural half.
    expect(detectEntrySections(after, { grain: "daily" }).slice(0, 2)).toEqual([
      "banner",
      "trackers",
    ]);
  });

  it("declares the two bands as data rather than leaving them to the editor", () => {
    // ONE SECTION ABOVE THE RULE AS OF 4.19, where there were two composing into
    // one fence. The band is still declared as data; there is simply less data.
    const own = ENTRY_SECTIONS.filter((s) => s.fence === "own").map((s) => s.id);
    expect(own).toEqual(["banner"]);
    // AND A THIRD BAND ABOVE THE RULE AS OF 4.20 — the grid, which left the
    // banner's fence so the banner could be the file's name, its navigation and
    // its cog and nothing else.
    expect(ENTRY_SECTIONS.filter((s) => s.fence === "trackers").map((s) => s.id))
      .toEqual(["trackers"]);
    // The locked set and the structural set are the same set, which is §4's
    // rule stated twice and agreeing: a section that owns a region owns the
    // reader's writing, one that does not is structure.
    // The locked set is the STRUCTURAL set — everything above the rule — which
    // is two fences as of 4.20 rather than one.
    expect(ENTRY_SECTIONS.filter((s) => s.locked).map((s) => s.id)).toEqual(
      ENTRY_SECTIONS.filter((s) => s.fence !== "shared").map((s) => s.id)
    );
  });
});

// ── dashboards ────────────────────────────────────────────────────────

describe("a dashboard reorders too", () => {
  it("moves a section and says so first, around the row that cannot move", () => {
    // THE MOST AGGRESSIVE REORDER THERE IS: every section reversed, navigation
    // included. Before 3.2 the file came back exactly reversed. Now the four
    // movable sections reverse around a first row that stays put — which is the
    // pin doing its whole job on the one surface where it is visibly a
    // restriction rather than an arithmetic no-op (an entry's structural band
    // has nothing to reorder either way).
    const text = monthly();
    const present = detectDiarySections(text, { grain: "monthly" });
    // The head is above navigation as of 4.10, and is pinned in a band of one —
    // so the reversal now happens under TWO rows that stay put rather than one.
    // The banner is one pinned row in a band of one as of 4.19, where 4.10 had
    // a head above a navigation row — two rows that stayed put, now one.
    expect(present.slice(0, 1)).toEqual(["banner"]);

    const want = [...present].reverse();
    const ops = planDiarySections(text, { grain: "monthly" }, want);
    expect(ops.filter((o) => o.kind === "move").length).toBeGreaterThan(0);
    // The banner is not reported as moving. A plan that named a move it would
    // not perform is the 2.60.2 defect wearing the other face.
    //
    // AND `summary` IS NO LONGER ON THIS LIST (4.58.0). It was here because it
    // was alone in the masthead band; it is a `body` section now, so it reverses
    // with everything else and a plan that said otherwise would be the same
    // defect in the opposite direction — a refusal the write does not honour.
    expect(
      ops.some((o) => o.kind === "move" && o.sectionId === "banner")
    ).toBe(false);

    // The banner keeps its row at the top; the body reverses beneath it. The
    // band is what makes that true, and it is the half of §4's rule the pin
    // alone does not deliver: a pinned banner stops nobody from dragging the
    // charts above it, and the band does.
    const head = ["banner"];
    const body = present.filter((id) => !head.includes(id));
    const next = applyDiarySections(text, { grain: "monthly" }, want)!;
    expect(detectDiarySections(next, { grain: "monthly" })).toEqual([
      ...head,
      ...[...body].reverse(),
    ]);
  });

  it("is a permutation, not a recomposition", () => {
    // Every fence that went in comes out, byte for byte. A reorder that
    // rebuilt the file from the catalogue would be a formatter.
    for (const grain of DASH_GRAINS) {
      const text = composeDiaryDashboard(grain);
      const present = detectDiarySections(text, { grain });
      const next =
        applyDiarySections(text, { grain }, [...present].reverse()) ?? text;
      const fences = (t: string): string[] => {
        const out: string[] = [];
        const lines = t.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (!lines[i].startsWith("```") || lines[i].trim() === "```") continue;
          const close = lines.indexOf("```", i + 1);
          if (close === -1) continue;
          out.push(lines.slice(i, close + 1).join("\n"));
          i = close;
        }
        return out.sort();
      };
      expect(fences(next), grain).toEqual(fences(text));
    }
  });

  it("returns null when the order asked for is the order it has", () => {
    // Null-means-no-change, the convention shared with applyLayout and
    // applySections — and on the diary side it matters directly, because mtime
    // is the source of truth for what is stale.
    for (const grain of DASH_GRAINS) {
      const text = composeDiaryDashboard(grain);
      const present = detectDiarySections(text, { grain });
      expect(applyDiarySections(text, { grain }, present), grain).toBeNull();
    }
  });

  it("leaves a reader's own fence where it is", () => {
    const text = monthly() + "\n\n```dataview\nLIST\n```\n";
    const present = detectDiarySections(text, { grain: "monthly" });
    const ops = planDiarySections(text, { grain: "monthly" }, present);
    expect(ops.find((o) => o.kind === "foreign")?.detail).toContain("left alone");
    const next =
      applyDiarySections(text, { grain: "monthly" }, [...present].reverse()) ??
      text;
    expect(next).toContain("```dataview\nLIST\n```");
  });
});

// ── what a dashboard refuses ──────────────────────────────────────────

describe("what a dashboard will not let go of", () => {
  it("locks navigation and the banner, and is honest about which can move", () => {
    // Both locked, and they do not get the same sentence. `summary` has four
    // movable neighbours, so "You can move it, though." names something the
    // reader can actually do; the banner is pinned, so it says what the rule is
    // instead. One message for two different situations was the thing 3.2 §4
    // had to stop doing.
    for (const id of ["banner", "summary"]) {
      expect(DIARY_SECTIONS.find((x) => x.id === id)!.locked, id).toBe(true);
    }

    // `summary` GOT ITS MOVE BACK IN 4.58.0, and this is where that is recorded.
    // Patch 1 kept "You can move it, though." here on the grounds that it had
    // four movable neighbours; §3 then fused it into one card with navigation,
    // leaving it the only unpinned member of a two-section band and stranding it
    // by arithmetic. 4.19 dissolved the card and left the band behind, so the
    // strand outlived its cause by four releases. The band is gone and the
    // section is `body`, so the sentence patch 1 wrote is true again.
    const summary = DIARY_SECTIONS.find((x) => x.id === "summary")!;
    expect(summary.band).toBe("body");
    const whySummary = diaryRemovalRefusal(summary, monthly())!;
    expect(whySummary).toContain("can't be removed");
    expect(whySummary).toContain("You can still move it");

    // THE BANNER IS PINNED AND LOCKED, AND THE LOCK IS WHAT ANSWERS (4.11). It
    // used to reach a `pinned` branch of its own reading "the first thing on
    // every dashboard — it can't be removed or moved", which was true of the
    // only pinned row that existed when it was written. 4.10 added a pinned row
    // that was NOT locked — the page head — and that branch then refused to
    // remove the head as well, against its own `locked: false`. Deleting the
    // branch left the locked path, which already declines to promise a move it
    // cannot deliver: `isMovable` is false for a pinned section.
    const banner = DIARY_SECTIONS.find((x) => x.id === "banner")!;
    const whyBanner = diaryRemovalRefusal(banner, monthly())!;
    expect(whyBanner).toContain("can't be removed");
    expect(whyBanner).not.toContain("You can still move it");
  });

  it("no longer lets the page head go, because it is the banner now", () => {
    // ── 4.19 CLOSED THE ONE ROW WHERE THE TWO FLAGS CAME APART ────────
    //
    // From 4.10 until 4.19 the head was the dashboard's only pinned-and-UNLOCKED
    // section, which is why the refusal answered the wrong flag for a release.
    // The merge ends that: the banner carries the navigation row, `links`' lock
    // travels with it, and pinned-and-locked is now the only combination on this
    // surface.
    //
    // THE LOSS IS ASSERTED RATHER THAN LEFT TO A CHANGELOG LINE. A reader could
    // remove a dashboard's title card before this release and cannot now. That
    // is 4.19's one cost and this is the test that would notice it being taken
    // back by accident.
    const banner = DIARY_SECTIONS.find((x) => x.id === "banner")!;
    expect(banner.pinned).toBe(true);
    expect(banner.locked).toBe(true);
    expect(isMovable(banner)).toBe(false);
    expect(diaryRemovalRefusal(banner, monthly())).not.toBeNull();
  });

  it("refuses to remove the charts while charts are in it", () => {
    const charts = DIARY_SECTIONS.find((s) => s.id === "charts")!;
    const empty = monthly();
    expect(diaryRemovalRefusal(charts, empty)).toBeNull();

    const withCharts = empty.replace(
      "```almanac-charts",
      "```almanac-charts\nchart:c1:Mood:line:90d\nchart:c2:Sleep:bar:30d"
    );
    const why = diaryRemovalRefusal(charts, withCharts);
    expect(why).toContain("2 charts");
    // The refusal NAMES THE FIX, so nobody goes looking for a setting.
    expect(why).toContain("first");
  });

  it("keeps a section it refused, and reports the reason as the plan", () => {
    const withCharts = monthly().replace(
      "```almanac-charts",
      "```almanac-charts\nchart:c1:Mood:line:90d"
    );
    const present = detectDiarySections(withCharts, { grain: "monthly" });
    const want = present.filter((id) => id !== "charts");
    const ops = planDiarySections(withCharts, { grain: "monthly" }, want);
    const op = ops.find((o) => o.sectionId === "charts")!;
    expect(op.kind).toBe("keep");
    expect(op.detail).toContain("chart");
    // And nothing is written.
    expect(applyDiarySections(withCharts, { grain: "monthly" }, want)).toBeNull();
  });

  it("removes one that holds nothing, and closes the gap behind it", () => {
    const text = monthly();
    const want = detectDiarySections(text, { grain: "monthly" }).filter(
      (id) => id !== "open-tasks"
    );
    const next = applyDiarySections(text, { grain: "monthly" }, want)!;
    expect(next).not.toContain("tasks-table");
    expect(next).not.toMatch(/\n\n\n/);
  });

  it("restores the file exactly when a removal is undone", () => {
    // The property worth having because it is the one a test can check: an
    // insertion anchored to the sections the file actually has puts a
    // re-added block back where it came from.
    const text = monthly();
    const present = detectDiarySections(text, { grain: "monthly" });
    const without = applyDiarySections(
      text,
      { grain: "monthly" },
      present.filter((id) => id !== "open-tasks")
    )!;
    const back = applyDiarySections(without, { grain: "monthly" }, present)!;
    expect(back).toBe(text);
  });
});

// ── what an entry refuses ─────────────────────────────────────────────

describe("what an entry will not let go of", () => {
  it("refuses to remove a section holding the reader's writing", () => {
    const text = daily().replace(
      "<!--almanac:log\n-->",
      "<!--almanac:log\nMonths of writing.\n-->"
    );
    const present = detectEntrySections(text, { grain: "daily" });
    const want = present.filter((id) => id !== "log");
    const op = planEntrySections(text, { grain: "daily" }, want).find(
      (o) => o.sectionId === "log"
    )!;
    expect(op.kind).toBe("keep");
    expect(op.detail).toContain("Clear it first");
    expect(applyEntrySections(text, { grain: "daily" }, want)).toBeNull();
    // The one that matters: the writing is still there.
    expect(text).toContain("Months of writing.");
  });

  it("removes an empty section, directive and region together", () => {
    const text = daily();
    const want = detectEntrySections(text, { grain: "daily" }).filter(
      (id) => id !== "attachments"
    );
    const next = applyEntrySections(text, { grain: "daily" }, want)!;
    expect(next).not.toContain("attach:attachments");
    expect(next).not.toContain("<!--almanac:attachments");
    expect(next).not.toMatch(/\n\n\n/);
    // And nothing else went with it.
    for (const key of ["focus", "log", "todo", "capture"]) {
      expect(next).toContain(`<!--almanac:${key}`);
    }
  });

  it("adds a section at the end of the fence, with a region for it", () => {
    // WEEKLY + `capture` SINCE 3.11 §4.1. This was daily + `highlights`, which
    // shipped on weekly and up so a daily entry borrowed the nearest grain's
    // wording. §4.1 gave every grain its own highlights; `capture` is the
    // remaining daily-alone section and the same fallback, run the other way
    // up the ladder.
    const text = composeEntryTemplate("weekly");
    const present = detectEntrySections(text, { grain: "weekly" });
    const next = applyEntrySections(text, { grain: "weekly" }, [
      ...present,
      "capture",
    ])!;
    expect(next).toContain("note:capture");
    expect(next).toContain("<!--almanac:capture");
    expect(detectEntrySections(next, { grain: "weekly" })).toEqual([
      ...present,
      "capture",
    ]);
  });

  it("will not add a second copy of something already there", () => {
    const text = daily();
    const present = detectEntrySections(text, { grain: "daily" });
    expect(
      applyEntrySections(text, { grain: "daily" }, [...present, "log"])
    ).toBeNull();
  });
});

// ── the entry parser, on notes nobody composed ────────────────────────

describe("parsing an entry that has been rearranged by hand", () => {
  it("finds a section whose title the reader changed", () => {
    // Identity is the directive's head. Everything after it is arguments, and
    // matching on those would make a renamed section invisible and then offer
    // to add a second copy.
    const text = daily().replace("|Tasks", "|What I owe people");
    expect(detectEntrySections(text, { grain: "daily" })).toContain("todo");
  });

  it("does not write into an almanac fence the reader pasted as an example", () => {
    // §9's scan, narrowed. `addSectionToNote` took the LAST almanac fence,
    // which is right for a note the plugin composed and wrong for one where
    // somebody pasted a fenced example into their notes — and 3.0 reaches that
    // scan with removals and reorders where 2.60 reached it only with an
    // append. The widget fence is now the last one holding a SHARED directive
    // and no structural one.
    const text = composeEntryTemplate("weekly").replace(
      "<!--almanac:log\n-->",
      "<!--almanac:log\nHere is how a fence looks:\n\n```almanac\nsome example I pasted\n```\n-->"
    );
    const present = detectEntrySections(text, { grain: "weekly" });
    const next = applyEntrySections(text, { grain: "weekly" }, [
      ...present,
      "capture",
    ])!;
    // The example is untouched...
    expect(next).toContain("```almanac\nsome example I pasted\n```");
    // ...and the directive landed in the real fence, above the regions.
    expect(next.indexOf("note:capture")).toBeLessThan(
      next.indexOf("<!--almanac:focus")
    );
  });

  it("still finds a fence whose directives were all deleted by hand", () => {
    // The fallback: the last fence that is not structural. An entry somebody
    // emptied is still an entry they can add a section back to.
    const text = composeEntryTemplate("daily")
      .replace(/^(note|list|attach|tasks):.*$/gm, "")
      .replace(/\n\n+```/g, "\n```");
    const shape = parseEntry(text, { grain: "daily" });
    expect(shape.shared).not.toBeNull();
    // Both structural sections, in file order — the banner's fence and the
    // tracker grid's, which 4.20 split apart.
    expect(shape.own.map((o) => o.id)).toEqual(["banner", "trackers"]);
  });

  it("declines rather than guessing when there is no widget fence", () => {
    // §9's risk, answered: a note somebody rearranged past recognition is left
    // alone. Composing a fence into it would be writing a structure into a file
    // whose author may have removed it on purpose.
    const text = "---\njournal: Daily Notes\n---\n\nJust my own prose.\n";
    expect(
      applyEntrySections(text, { grain: "daily" }, ["log"])
    ).toBeNull();
  });

  it("finds regions the reader moved away from their directives", () => {
    const text = daily().replace(
      "<!--almanac:capture\n-->\n",
      ""
    ) + "\n<!--almanac:capture\n-->\n";
    const shape = parseEntry(text, { grain: "daily" });
    expect(shape.regions.has("capture")).toBe(true);
  });

  it("reads every grain it ships", () => {
    for (const grain of TRACKER_CLASSES) {
      const text = composeEntryTemplate(grain);
      const present = detectEntrySections(text, { grain });
      expect(present, grain).toContain("banner");
      expect(present, grain).toContain("trackers");
      // Every section the composer wrote is a section the parser finds.
      const composed = sectionsForEntryIds(grain);
      expect(new Set(present), grain).toEqual(new Set(composed));
    }
  });
});

const sectionsForEntryIds = (grain: (typeof TRACKER_CLASSES)[number]): string[] =>
  ENTRY_SECTIONS.filter((s) => s.directive({ grain }) != null).map((s) => s.id);

// ── icons ─────────────────────────────────────────────────────────────

describe("every section has a token to draw a row with", () => {
  it("on both diary catalogues", () => {
    for (const s of ENTRY_SECTIONS) expect(s.icon, s.id).toBeTruthy();
    for (const s of DIARY_SECTIONS) expect(s.icon, s.id).toBeTruthy();
  });

  it("and the dashboard's match the header bars they render", () => {
    // The rule journal sections follow: where a section renders a header bar,
    // the row's token is that bar's own emoji, so the list and the note agree.
    for (const grain of DASH_GRAINS) {
      for (const s of sectionsForDashboard({ grain })) {
        const header = s
          .render({ grain })
          .lines.find((l) => l.startsWith("header:"));
        if (!header) continue;
        expect(header, `${grain}/${s.id}`).toContain(s.icon);
      }
    }
  });
});

// ── 3.2 §4: navigation is the top row ─────────────────────────────────
//
// The pin is one decision with two halves, and the second is easier to get
// wrong than the first. "The editor will not move it" is enforced by
// `holdPinned` and asserted above. "The editor will not move it FOR you" is the
// half with no natural failure signal: forcing `links` to index 0 would look
// correct on every file the catalogue composed, because on those it already is
// index 0. It only shows up on a file somebody rearranged years ago — which is
// exactly the file a reconciler must not touch.

describe("the pin restricts the editor without relocating anyone's file", () => {
  // A dashboard whose author moved navigation down. Built by swapping the two
  // fences rather than by composing a variant, so it is the real file shape
  // with one thing about it changed.
  const rearranged = (): string => {
    const text = monthly();
    const ids = detectDiarySections(text, { grain: "monthly" });
    const want = [ids[1], ids[0], ...ids.slice(2)];
    // The swap itself predates the pin, so it has to be performed with the pin
    // switched off — which is what constructing the text by hand does.
    const blocks = text.split("\n\n");
    // Since patch 3 the masthead is one card, so "the author moved it" means the
    // whole card sits lower down. Moved past the rollup rather than to the end,
    // which keeps the file a plausible thing somebody would actually have.
    //
    // FOUND BY THE SUMMARY AS OF 4.19, where this looked for `links:`. The
    // navigation row is the banner's now and the banner is a different fence, so
    // the old probe would have picked the block ABOVE the one it meant.
    const masthead = blocks.findIndex((b) => /-summary$/m.test(b));
    const rollup = blocks.findIndex((b) => b.includes("entry-rollup"));
    expect(masthead).toBeGreaterThanOrEqual(0);
    expect(rollup).toBeGreaterThan(masthead);
    const out = [...blocks];
    [out[masthead], out[rollup]] = [out[rollup], out[masthead]];
    expect(want.length).toBeGreaterThan(1);
    return out.join("\n\n");
  };

  it("reads a dashboard whose masthead is not first", () => {
    const ids = detectDiarySections(rearranged(), { grain: "monthly" });
    // The masthead is the summary's fence as of 4.19, and the author moved it
    // below the rollup — so it is neither first nor missing.
    expect(ids[0]).not.toBe("summary");
    expect(ids).toContain("summary");
    // AND THE BANNER IS STILL READ AS ONE SECTION, on a file that is not in
    // catalogue order. Both of its anchors are live on a note like this, so this
    // is the case `parseDiarySections`' `claimed` set exists for: without it the
    // banner would be attributed to two fences and the reorder would write one
    // of them over the other.
    expect(ids.filter((id) => id === "banner")).toHaveLength(1);
  });

  it("leaves it exactly where the author put it", () => {
    // The temptation the comment on `holdPinned` names: "navigation is the top
    // row" reads like an instruction to make it so. It is not. Nobody agreed to
    // have their file rearranged, and a reconciler acting on an opinion of its
    // own is the thing `layout.ts` keeps a list about.
    const text = rearranged();
    const ids = detectDiarySections(text, { grain: "monthly" });
    expect(applyDiarySections(text, { grain: "monthly" }, ids)).toBeNull();
  });

  it("and moves the overview back when asked to, as of 4.58.0", () => {
    // WHAT THIS TEST USED TO ASSERT, AND WHY THE INVERSION IS THE POINT. It read
    // "and will not move it back even when asked to", on the grounds that the
    // masthead band refused in both directions. The band is gone: `summary` is a
    // `body` section, so a reader who drags the overview back above the rollup
    // is asking for an ordinary reorder and gets one.
    //
    // ASKED FOR IT BELOW THE BANNER, not above — the banner is `head` and still
    // pinned, which the next assertion is about.
    const text = rearranged();
    const ids = detectDiarySections(text, { grain: "monthly" });
    const want = ["banner", "summary", ...ids.filter(
      (id) => id !== "summary" && id !== "banner"
    )];
    // A MOVE IS NAMED, THOUGH NOT NECESSARILY THIS SECTION'S. `moveOps` reports
    // the minimal set — hoisting the overview past one block is equally
    // truthfully "the rollup moved down" — so what is pinned is that the plan
    // names a move at all and that the write performs the arrangement asked for.
    expect(
      planDiarySections(text, { grain: "monthly" }, want).some(
        (o) => o.kind === "move"
      )
    ).toBe(true);
    const next = applyDiarySections(text, { grain: "monthly" }, want)!;
    expect(next).not.toBeNull();
    expect(detectDiarySections(next, { grain: "monthly" })).toEqual(want);
  });

  it("but still refuses to move the banner, in both directions", () => {
    // The pin is what is left, and it is the whole of the rule now. A reader who
    // drags the page's own name below the overview is asking for a move, and the
    // answer is nothing happens and the plan says nothing happened.
    const text = rearranged();
    const ids = detectDiarySections(text, { grain: "monthly" });
    const want = [...ids.filter((id) => id !== "banner"), "banner"];
    expect(
      planDiarySections(text, { grain: "monthly" }, want).some(
        (o) => o.kind === "move" && o.sectionId === "banner"
      )
    ).toBe(false);
    expect(detectDiarySections(
      applyDiarySections(text, { grain: "monthly" }, want) ?? text,
      { grain: "monthly" }
    )[0]).toBe("banner");
  });

  it("still reorders the body around it", () => {
    // The restriction is the masthead, not the page. If a rearranged dashboard
    // went entirely rigid, patch 3 would have cost the reader a feature rather
    // than fusing two rows of one.
    const text = rearranged();
    const ids = detectDiarySections(text, { grain: "monthly" });
    const body = ids.filter((id) => id !== "banner" && id !== "summary");
    const want = ids.map((id) =>
      body.includes(id) ? [...body].reverse()[body.indexOf(id)] : id
    );

    const next = applyDiarySections(text, { grain: "monthly" }, want);
    expect(next).not.toBeNull();
    const after = detectDiarySections(next!, { grain: "monthly" });
    // The masthead is still where the author left it. It is one row as of 4.19
    // rather than two — the navigation half moved up into the banner — so what
    // is asserted is its position rather than its internal order.
    expect(after.indexOf("summary")).toBe(ids.indexOf("summary"));
  });
});

// ── 3.2 patch 3: the dashboard's masthead ─────────────────────────────

// The masthead's own fence, found by WHAT IT HOLDS rather than by where it sits.
//
// It was `the first ```almanac block`, which was the same thing until 4.10 put
// the page head above it. Position was never what these tests were about, and
// the thing it holds has now changed twice: it was the fence carrying
// NAVIGATION until 4.19 welded that row into the banner, and it is the fence
// carrying the period SUMMARY now. Keying on the summary is the durable spelling
// — the summary is what a masthead is FOR, where the links row was only ever
// what happened to be first in it.
const mastheadFence = (text: string): string[] => {
  const lines = text.split("\n");
  let open = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "```almanac") open = i;
    if (open >= 0 && /-summary$/.test(lines[i].trim())) break;
  }
  const close = lines.indexOf("```", open + 1);
  return lines.slice(open + 1, close);
};

describe("the dashboard's masthead is one fence", () => {
  it("holds navigation and the period summary, in that order", () => {
    // 3.4 briefly put a `period-nav:` between them and 3.5 withdrew it: the
    // navigator is built by the summary, inside the band, where a LiveWidget
    // rebuild recreates it rather than destroying it.
    for (const grain of DASH_GRAINS) {
      const body = mastheadFence(composeDiaryDashboard(grain));
      // ONE SECTION IN THE MASTHEAD AS OF 4.19. The navigation row that used to
      // open this fence is the banner's, so the summary is first here now — and
      // that is what makes `month-summary` insertable to the old keyword
      // reconciler again, which `repair-plan.test.ts` records.
      //
      // AND ITS OWN BAR OPENS IT AS OF 4.59.0. The summary is a section and now
      // wears a section's bar, which sits directly under the fence for the
      // reason `withAnswers` gives when it writes one there: a bar anchors the
      // widgets that FOLLOW it, so one written below the summary would title
      // nothing and pull the `button:` line into its actions strip.
      expect(body[0], grain).toMatch(/^header:📅 This /);
      expect(body[1], grain).toMatch(/-summary$/);
    }
  });

  it("carries the period button too, on every grain", () => {
    // All four grains, as of 3.3 — monthly's absence was age rather than
    // argument, and it is corrected in the masthead rather than beside it.
    for (const [grain, directive] of [
      ["weekly", "button:new-week"],
      ["monthly", "button:new-month"],
      ["quarterly", "button:new-quarter"],
      ["yearly", "button:new-year"],
    ] as const) {
      expect(mastheadFence(composeDiaryDashboard(grain)), grain).toContain(
        directive
      );
    }
  });

  it("does not weld the body into one block as well", () => {
    // The band is the reason a fence merges, not the mechanism. Body sections
    // all render into an `almanac` fence too, so a rule keyed on "consecutive
    // and same fence kind" collapsed the whole page into one block — and it
    // read as plausible output right up until `assetUnits` saw one unit where
    // the repair path needs three.
    const text = composeDiaryDashboard("monthly");
    const fences = text.match(/```almanac\b/g) ?? [];
    expect(fences.length).toBeGreaterThan(2);
    const rollup = mastheadFence(text);
    expect(rollup).not.toContain("entry-rollup");
    expect(rollup).not.toContain("tasks-table:,period");
  });

  it("reads both of its sections back out", () => {
    // `ownersOf`, and the same first-match defect `parseEntry` carried: a
    // merged fence used to resolve to whichever `locate` matched first.
    for (const grain of DASH_GRAINS) {
      const ids = detectDiarySections(composeDiaryDashboard(grain), { grain });
      // Two bands, two rows, in band order: the banner, then the masthead. The
      // welded banner fence is read back as ONE section rather than as two —
      // which is the point of the merge, and the thing `parseDiarySections`'
      // `claimed` set makes true when both of the banner's anchors match.
      expect(ids.slice(0, 2), grain).toEqual(["banner", "summary"]);
    }
  });
});

describe("a body section cannot climb above the banner", () => {
  it("which the pin alone does not prevent", () => {
    // §4 says the page's own name is the top row. Pinning the banner stops a
    // reader moving IT — and stops nobody from dragging the charts above it,
    // which puts something above the top row without touching the pinned thing
    // at all.
    //
    // THE BAND DOES NOT REFUSE THE DRAG; IT REINTERPRETS IT. The request is
    // partitioned, so "charts to the top of the page" resolves to "charts to
    // the top of the BODY" — a real move, performed, reported, and landing
    // below the banner. That is the same mechanism `planEntrySections` uses
    // for a `want` that interleaves the two halves of an entry: not
    // representable, so not refused with a message either.
    //
    // AND THE BODY NOW STARTS AT THE OVERVIEW (4.58.0), where it used to start
    // below it. `summary` left the masthead for `body`, so "the top of the body"
    // is a slot above the period summary rather than below it — which is the
    // whole of what this release gives back.
    const text = monthly();
    const ids = detectDiarySections(text, { grain: "monthly" });
    const want = ["charts", ...ids.filter((id) => id !== "charts")];

    const ops = planDiarySections(text, { grain: "monthly" }, want);
    expect(ops.some((o) => o.kind === "move" && o.sectionId === "charts")).toBe(
      true
    );

    const next = applyDiarySections(text, { grain: "monthly" }, want)!;
    const after = detectDiarySections(next, { grain: "monthly" });
    expect(after.slice(0, 3)).toEqual(["banner", "charts", "summary"]);
  });

  it("and the banner is the only row in a group of its own", () => {
    const views = diarySectionModel({ grain: "monthly" }).sections();
    const groupOf = (id: string): string | null =>
      views.find((v) => v.id === id)!.group;
    // ONE BAND SEPARATES ANYTHING FROM ANYTHING, AND IT IS THE BANNER'S. The
    // masthead was a second, and until 4.58.0 this test asserted that `summary`
    // sat outside the body — which is exactly the restriction that release
    // removes. The overview shares the body's group now; the banner does not,
    // and that is what stops a section being dragged above the page's name.
    expect(groupOf("charts")).toBe(groupOf("summary"));
    expect(groupOf("banner")).not.toBe(groupOf("summary"));
    expect(groupOf("banner")).not.toBe(groupOf("charts"));
    // And the banner is alone in it, which is the arithmetic half of the same
    // fact: `head` has one member, so there is nowhere for it to go even if the
    // pin were lifted.
    expect(views.filter((v) => v.group === groupOf("banner"))).toHaveLength(1);
  });

  it("but the body still reorders freely within itself", () => {
    const text = monthly();
    const ids = detectDiarySections(text, { grain: "monthly" });
    const body = ids.filter((id) => id !== "banner");
    const want = ["banner", ...[...body].reverse()];
    expect(applyDiarySections(text, { grain: "monthly" }, want)).not.toBeNull();
  });
});
