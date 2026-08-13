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
  it("stops offering a move that neither structural section has", () => {
    // `entry-header` is not pinned. It is immovable anyway, because the pin
    // leaves it alone among its band's movable members — so the sentence would
    // be false for it too, and `isMovable` is what notices that without anyone
    // writing `movable: false` on it by hand.
    const banner = ENTRY_SECTIONS.find((s) => s.id === "entry-header")!;
    const why = entryRemovalRefusal(banner, daily())!;
    expect(why).toContain("cannot be removed");
    expect(why).not.toContain("move it");
  });

  it("says navigation is fixed, and says which way", () => {
    // A refusal that only said "no" would send a reader hunting for the setting
    // — 2.59.6's rule. This one names the rule instead of a fix, because there
    // is no fix and pretending otherwise is the whole failure mode.
    const links = ENTRY_SECTIONS.find((s) => s.id === "links")!;
    const why = entryRemovalRefusal(links, daily())!;
    expect(why).toContain("first thing on every entry");
    expect(why).toContain("removed or moved");
  });

  it("refuses the swap the old message invited", () => {
    const text = daily();
    expect(detectEntrySections(text, { grain: "daily" }).slice(0, 2)).toEqual([
      "links",
      "entry-header",
    ]);

    const want = ["entry-header", "links", ...restOf(text)];
    // Null, not a rearranged file: nothing in the structural band can permute,
    // so there is no change to write. Silence here is the correct answer and
    // the next test is what makes sure it is not accidental silence.
    expect(applyEntrySections(text, { grain: "daily" }, want)).toBeNull();
  });

  it("and names no move for it in the plan either", () => {
    // The plan is the preview. A plan that promised a move the write would not
    // perform is the same lie one layer up.
    const text = daily();
    const ops = planEntrySections(text, { grain: "daily" }, [
      "entry-header",
      "links",
      ...restOf(text),
    ]);
    expect(ops.find((o) => o.kind === "move")).toBeUndefined();
  });

  it("still moves what is below the rule", () => {
    // The pin is on one row, not on reordering. If this went quiet too, the
    // patch would have deleted the feature rather than restricting it.
    const text = daily();
    const present = detectEntrySections(text, { grain: "daily" });
    const shared = present.filter((id) => id !== "links" && id !== "entry-header");
    const want = ["links", "entry-header", shared[1], shared[0], ...shared.slice(2)];
    const ops = planEntrySections(text, { grain: "daily" }, want);
    expect(ops.some((o) => o.kind === "move")).toBe(true);
    expect(applyEntrySections(text, { grain: "daily" }, want)).not.toBeNull();
  });
});

const restOf = (text: string): string[] =>
  detectEntrySections(text, { grain: "daily" }).filter(
    (id) => id !== "links" && id !== "entry-header"
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
      "links",
      "entry-header",
      "focus",
      "attachments",
      "todo",
      "capture",
    ]);
    const after = next ?? text;
    // `log` is still below the rule.
    expect(after.indexOf("note:log")).toBeGreaterThan(after.indexOf("\n---\n\n```almanac"));
    // The structural half is still the structural half.
    expect(detectEntrySections(after, { grain: "daily" }).slice(0, 2).sort()).toEqual(
      ["entry-header", "links"]
    );
  });

  it("declares the two bands as data rather than leaving them to the editor", () => {
    const own = ENTRY_SECTIONS.filter((s) => s.fence === "own").map((s) => s.id);
    expect(own).toEqual(["links", "entry-header"]);
    // The locked set and the structural set are the same set, which is §4's
    // rule stated twice and agreeing: a section that owns a region owns the
    // reader's writing, one that does not is structure.
    expect(ENTRY_SECTIONS.filter((s) => s.locked).map((s) => s.id)).toEqual(own);
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
    expect(present.slice(0, 2)).toEqual(["title", "links"]);

    const want = [...present].reverse();
    const ops = planDiarySections(text, { grain: "monthly" }, want);
    expect(ops.filter((o) => o.kind === "move").length).toBeGreaterThan(0);
    // Neither masthead section is reported as moving. A plan that named a move
    // it would not perform is the 2.60.2 defect wearing the other face.
    for (const id of ["title", "links", "summary"]) {
      expect(
        ops.some((o) => o.kind === "move" && o.sectionId === id),
        id
      ).toBe(false);
    }

    // The head keeps its row and the masthead keeps its two, in order, at the
    // top; the body reverses beneath them. Since patch 3 the band is what makes
    // that true, and it is the half of §4's rule the pin alone does not
    // deliver: `links` being immovable stops nobody from dragging the charts
    // above it, and the band does. 4.10 adds a third band and the same sentence
    // still describes it.
    const head = ["title", "links", "summary"];
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
    // Both locked, and they no longer get the same sentence. `summary` has four
    // movable neighbours, so "You can move it, though." names something the
    // reader can actually do; `links` does not, so it says what the rule is
    // instead. One message for two different situations was the thing 3.2 §4
    // had to stop doing.
    for (const id of ["links", "summary"]) {
      expect(DIARY_SECTIONS.find((x) => x.id === id)!.locked, id).toBe(true);
    }

    // `summary` LOST ITS MOVE IN PATCH 3, and this is where that is recorded.
    // Patch 1 deliberately kept "You can move it, though." here on the grounds
    // that it had four movable neighbours — true then, and untrue the moment §3
    // fused it into one card with navigation, which leaves it the only unpinned
    // member of a two-section band. It is not pinned; it is stranded, by the
    // same arithmetic that stranded `entry-header`.
    const summary = DIARY_SECTIONS.find((x) => x.id === "summary")!;
    const whySummary = diaryRemovalRefusal(summary, monthly())!;
    expect(whySummary).toContain("cannot be removed");
    expect(whySummary).not.toContain("move it");

    // `links` IS PINNED AND LOCKED, AND THE LOCK IS WHAT ANSWERS (4.11). It used
    // to reach a `pinned` branch of its own reading "the first thing on every
    // dashboard — it can't be removed or moved", which was true of the only
    // pinned row that existed when it was written. 4.10 added a pinned row that
    // is NOT locked — the page head — and that branch then refused to remove the
    // head as well, against its own `locked: false`. Deleting the branch leaves
    // `links` on the locked path, which already declines to promise a move it
    // cannot deliver: `isMovable` is false for a pinned section.
    const links = DIARY_SECTIONS.find((x) => x.id === "links")!;
    const whyLinks = diaryRemovalRefusal(links, monthly())!;
    expect(whyLinks).toContain("cannot be removed");
    expect(whyLinks).not.toContain("You can move it");
  });

  it("lets the page head go, and never lets it move", () => {
    // The two flags asked separately, because from 4.10 until 4.11 the removal
    // refusal answered the wrong one: the head is the dashboard's only section
    // that is pinned and unlocked, so it is the only row where "cannot be moved"
    // and "cannot be removed" could come apart — and they had not.
    const head = DIARY_SECTIONS.find((x) => x.id === "title")!;
    expect(head.pinned).toBe(true);
    expect(head.locked).toBe(false);
    expect(isMovable(head)).toBe(false);
    expect(diaryRemovalRefusal(head, monthly())).toBeNull();
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
    expect(shape.own.map((o) => o.id)).toEqual(["links", "entry-header"]);
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
      expect(present, grain).toContain("links");
      expect(present, grain).toContain("entry-header");
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
    // Since patch 3 navigation shares the masthead fence with the summary, so
    // "the author moved navigation" means the whole card sits lower down. Moved
    // past the rollup rather than to the end, which keeps the file a plausible
    // thing somebody would actually have.
    const masthead = blocks.findIndex((b) => b.includes("links:"));
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
    expect(ids[0]).not.toBe("links");
    expect(ids).toContain("links");
    // And still reads BOTH of its sections out of the one fence — the
    // first-match defect `ownersOf` fixed, on a file that is not in catalogue
    // order.
    expect(ids.indexOf("summary")).toBe(ids.indexOf("links") + 1);
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

  it("and will not move it back even when asked to", () => {
    // The pin refuses in BOTH directions. A reader who drags navigation to the
    // top of a rearranged dashboard is asking for a move, and the answer is the
    // same one they get for dragging it down: nothing happens, and the plan
    // says nothing happened.
    const text = rearranged();
    const ids = detectDiarySections(text, { grain: "monthly" });
    const want = ["links", ...ids.filter((id) => id !== "links")];
    expect(
      planDiarySections(text, { grain: "monthly" }, want).some(
        (o) => o.kind === "move"
      )
    ).toBe(false);
    expect(applyDiarySections(text, { grain: "monthly" }, want)).toBeNull();
  });

  it("still reorders the body around it", () => {
    // The restriction is the masthead, not the page. If a rearranged dashboard
    // went entirely rigid, patch 3 would have cost the reader a feature rather
    // than fusing two rows of one.
    const text = rearranged();
    const ids = detectDiarySections(text, { grain: "monthly" });
    const body = ids.filter((id) => id !== "links" && id !== "summary");
    const want = ids.map((id) =>
      body.includes(id) ? [...body].reverse()[body.indexOf(id)] : id
    );

    const next = applyDiarySections(text, { grain: "monthly" }, want);
    expect(next).not.toBeNull();
    const after = detectDiarySections(next!, { grain: "monthly" });
    // The masthead's two rows are still adjacent, still in order, and still
    // where the author left them.
    expect(after.indexOf("summary")).toBe(after.indexOf("links") + 1);
    expect(after.indexOf("links")).toBe(ids.indexOf("links"));
  });
});

// ── 3.2 patch 3: the dashboard's masthead ─────────────────────────────

// The masthead's own fence, found by WHAT IT HOLDS rather than by where it sits.
//
// It was `the first ```almanac block`, which was the same thing until 4.10 put
// the page head above it. Position was never what these tests were about — the
// masthead is the fence carrying navigation, and saying so is both more honest
// and immune to the next thing that arrives above it.
const mastheadFence = (text: string): string[] => {
  const lines = text.split("\n");
  let open = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "```almanac") open = i;
    if (open >= 0 && lines[i].startsWith("links:")) break;
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
      expect(body[0], grain).toBe("links:today,scopes#diary");
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
      // Three bands, three rows, in band order: the head, then the masthead's
      // two. The merged fence is still read back as two sections rather than as
      // whichever `locate` matched first, which is what this test is about.
      expect(ids.slice(0, 3), grain).toEqual(["title", "links", "summary"]);
    }
  });
});

describe("a body section cannot climb above navigation", () => {
  it("which the pin alone does not prevent", () => {
    // §4 says navigation is the top row. Pinning `links` stops a reader moving
    // IT — and stops nobody from dragging the charts above it, which puts
    // something above the top row without touching the pinned thing at all.
    //
    // THE BAND DOES NOT REFUSE THE DRAG; IT REINTERPRETS IT. The request is
    // partitioned, so "charts to the top of the page" resolves to "charts to
    // the top of the BODY" — a real move, performed, reported, and landing
    // below the masthead. That is the same mechanism `planEntrySections` uses
    // for a `want` that interleaves the two halves of an entry: not
    // representable, so not refused with a message either.
    const text = monthly();
    const ids = detectDiarySections(text, { grain: "monthly" });
    const want = ["charts", ...ids.filter((id) => id !== "charts")];

    const ops = planDiarySections(text, { grain: "monthly" }, want);
    expect(ops.some((o) => o.kind === "move" && o.sectionId === "charts")).toBe(
      true
    );

    const next = applyDiarySections(text, { grain: "monthly" }, want)!;
    const after = detectDiarySections(next, { grain: "monthly" });
    // "Charts to the top of the page" resolves to "charts to the top of the
    // BODY" — which as of 4.10 is below two bands rather than one, and is the
    // same mechanism doing the same thing with a third partition to respect.
    expect(after.slice(0, 4)).toEqual(["title", "links", "summary", "charts"]);
  });

  it("and the two bands are reported to the editor as different groups", () => {
    const views = diarySectionModel({ grain: "monthly" }).sections();
    const groupOf = (id: string): string | null =>
      views.find((v) => v.id === id)!.group;
    expect(groupOf("links")).toBe(groupOf("summary"));
    expect(groupOf("charts")).not.toBe(groupOf("links"));
  });

  it("but the body still reorders freely within itself", () => {
    const text = monthly();
    const ids = detectDiarySections(text, { grain: "monthly" });
    const body = ids.filter((id) => id !== "links" && id !== "summary");
    const want = ["links", "summary", ...[...body].reverse()];
    expect(applyDiarySections(text, { grain: "monthly" }, want)).not.toBeNull();
  });
});
