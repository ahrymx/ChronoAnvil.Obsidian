// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Repair, through the section model.
//
// WHAT THESE ASSERT. The release's thesis is one sentence: a section this
// release ships reaches a note that already exists, wherever in the fence it
// happens to sit. The keyword reconciler could only insert the FIRST directive
// of a block, so the whole of the homepage's top row and each dashboard's
// masthead were unreachable — and unreported, which is the worse half. Every
// test here is against a COMPOSED note rather than a fixture, on 4.0.2's rule
// that a test asserts behaviour rather than that a string is in a file.

import { describe, expect, it } from "vitest";
import { repairNote } from "../src/core/repair-plan";
import {
  MANAGED_FLAGS,
  applyFlags,
  applyLayout,
  planFlags,
  planLayout,
  retiredIn,
  stripRetired,
} from "../src/core/layout";
import { composeHomeNote, homeSectionModel } from "../src/diary/home-sections";
import { composeSearchNote, searchSectionModel } from "../src/diary/search-sections";
import {
  composeDiaryDashboard,
  diarySectionModel,
} from "../src/diary/diary-sections";
import { DEFAULT_PATHS } from "../src/core/constants";
import type { SectionModel } from "../src/core/section-model";

const ROOT = DEFAULT_PATHS.diaryRoot;
const home = (): string => composeHomeNote(ROOT);
const homeModel = (): SectionModel => homeSectionModel(ROOT, "");
const L = (s: string): string[] => s.split("\n");

// A note with one directive line deleted, leaving everything around it exactly
// as it was — which is what a reader who deleted a widget by hand leaves behind.
function withoutLine(text: string, keyword: string): string {
  const out = L(text).filter((l) => l.trim().split(":")[0] !== keyword);
  expect(out.length, `${keyword} was not in the note`).toBeLessThan(L(text).length);
  return out.join("\n");
}

describe("repairNote — the case the keyword reconciler could not reach", () => {
  it("restores a section that is not first in its fence", () => {
    // `tasks-table` is the second cell of the homepage's top row, so its
    // directive is not the first in its block. `assetUnits` marks it
    // `insertable: false` and `planLayout` skips it without a word.
    const shipped = home();
    const text = withoutLine(shipped, "tasks-table");

    expect(planLayout(L(text), L(shipped))).toEqual([]);

    const { ops, next } = repairNote(homeModel(), text, shipped);
    expect(ops.map((o) => o.kind)).toContain("add");
    expect(next).not.toBeNull();
    expect(next).toContain("tasks-table");
  });

  it("restores every section of the top row, one at a time", () => {
    const shipped = home();
    for (const keyword of ["diary", "launcher", "tasks-table", "on-this-day"]) {
      const text = withoutLine(shipped, keyword);
      const { next } = repairNote(homeModel(), text, shipped);
      expect(next, keyword).not.toBeNull();
      expect(next ?? "", keyword).toContain(keyword);
    }
  });

  it("restores a period dashboard's masthead summary", () => {
    // The masthead is one fence holding `links`, the summary and the scoped
    // period button, so only `links` was ever insertable.
    const shipped = composeDiaryDashboard("monthly");
    const text = withoutLine(shipped, "month-summary");

    expect(planLayout(L(text), L(shipped))).toEqual([]);

    const { ops, next } = repairNote(
      diarySectionModel({ grain: "monthly" }),
      text,
      shipped
    );
    expect(ops.map((o) => o.kind)).toContain("add");
    expect(next ?? "").toContain("month-summary");
  });
});

// A 2.x-era homepage: one column, every widget in a fence of its own, a heading
// and some prose of the reader's in the middle, and one retired directive. This
// is the shape every vault created before 4.2 still has.
const OLD_HOME = [
  "`almanac:spacer`",
  "",
  "```almanac",
  "title",
  "```",
  "",
  "```almanac",
  "diary:3",
  "```",
  "",
  "## My own heading",
  "",
  "Some prose I wrote.",
  "",
  "```almanac",
  "year-nav",
  "journals",
  "```",
  "",
].join("\n");

describe("a homepage written before the top row existed", () => {
  it("gains what it is missing, keeps what is the reader's, drops what is dead", () => {
    const shipped = home();
    const { next } = repairNote(homeModel(), OLD_HOME, shipped);
    const out = next ?? "";

    expect(out).toContain("## My own heading");
    expect(out).toContain("Some prose I wrote.");
    expect(out).not.toContain("year-nav");
    for (const gained of ["launcher", "tasks-table", "on-this-day:always"]) {
      expect(out, gained).toContain(gained);
    }
  });

  it("does not duplicate the head or the diary card, which the old path did", () => {
    // THE REGRESSION THIS RELEASE IS FOR, stated as the defect rather than as
    // the feature. `wide` and `row` are the first directives of the head fence
    // and the row fence, so `assetUnits` makes them insertable and carries the
    // WHOLE fence as their block. A note that has `title` but not `wide`, and
    // `diary` but not `row` — which is every pre-4.2 homepage — therefore had
    // both fences inserted wholesale, giving it two page heads and two diary
    // cards. It was never a missing insert; it was a wrong one.
    const shipped = home();
    const lines = (t: string, want: string): number =>
      L(t).filter((l) => l.trim() === want).length;

    const old = applyLayout(L(OLD_HOME), L(shipped))?.join("\n") ?? OLD_HOME;
    expect(lines(old, "title")).toBe(2);
    expect(lines(old, "diary:3")).toBe(2);

    const { next } = repairNote(homeModel(), OLD_HOME, shipped);
    expect(lines(next ?? "", "title")).toBe(1);
    expect(lines(next ?? "", "diary:3")).toBe(1);
  });
});

describe("repairNote — what it must not do", () => {
  it("is a no-op on a note that is already current", () => {
    for (const [label, model, shipped] of [
      ["home", homeModel(), home()],
      ["search", searchSectionModel(), composeSearchNote()],
      [
        "monthly",
        diarySectionModel({ grain: "monthly" }),
        composeDiaryDashboard("monthly"),
      ],
    ] as const) {
      const { ops, next } = repairNote(model, shipped, shipped);
      expect(ops, label).toEqual([]);
      expect(next, label).toBeNull();
    }
  });

  it("is idempotent — a second run has nothing left to do", () => {
    const shipped = home();
    const once = repairNote(homeModel(), withoutLine(shipped, "tasks-table"), shipped);
    expect(once.next).not.toBeNull();
    const twice = repairNote(homeModel(), once.next ?? "", shipped);
    expect(twice.ops).toEqual([]);
    expect(twice.next).toBeNull();
  });

  it("keeps a block the catalogue never wrote, in place", () => {
    const shipped = home();
    const mine = "```almanac\nactivity-chart\n```";
    const text = `${withoutLine(shipped, "tasks-table")}\n\n${mine}\n`;
    const { next } = repairNote(homeModel(), text, shipped);
    expect(next ?? "").toContain(mine);
  });

  it("never reorders what is already there", () => {
    // A reader who moved a block keeps it moved: the want lists present
    // sections in FILE order, so `moveOps` has nothing to diff.
    const shipped = home();
    const text = withoutLine(shipped, "tasks-table");
    const { next } = repairNote(homeModel(), text, shipped);
    const before = L(text).filter((l) => l.trim() === "journals");
    expect(before).toHaveLength(1);
    // Everything the note already had is still in the order it had it.
    const kept = (t: string): string[] =>
      L(t)
        .map((l) => l.trim())
        .filter((l) => /^(diary:\d+|launcher|journals)$/.test(l));
    expect(kept(next ?? "")).toEqual(kept(text));
  });
});

describe("retired directives", () => {
  it("removes a retired keyword the release no longer writes", () => {
    const shipped = home();
    const text = shipped.replace("cell\nlauncher", "cell\nyear-nav\nlauncher");
    expect(text).not.toEqual(shipped);
    const { ops, next } = repairNote(homeModel(), text, shipped);
    expect(ops.some((o) => o.kind === "delete")).toBe(true);
    expect(next ?? "").not.toContain("year-nav");
  });

  it("keeps `topics-table`, which is superseded and still draws", () => {
    // 4.16 §3, and the roadmap's own *Errors made in this release*: an entry in
    // `RETIRED_WIDGETS` is an instruction to DELETE, so retiring a word that
    // still renders would strip a working table out of every Subject index.
    const shipped = home();
    const text = shipped.replace(
      "cell\nlauncher",
      "cell\ntopics-table\nlauncher"
    );
    expect(text).not.toEqual(shipped);
    const { ops, next } = repairNote(homeModel(), text, shipped);
    expect(ops.some((o) => o.kind === "delete")).toBe(false);
    expect(next == null ? text : next).toContain("topics-table");
  });

  it("keeps a retired word the shipped composition still writes", () => {
    // The `keep` predicate, which is what stops a word retired in one release
    // and re-shipped in the next from being cut out the moment it arrives.
    expect(retiredIn(["```almanac", "year-nav", "```"], (k) => k === "year-nav")).toEqual([]);
    expect(stripRetired(["```almanac", "year-nav", "```"], () => true)).toBeNull();
  });

  it("drops a fence the removal emptied, and keeps one it did not", () => {
    expect(
      stripRetired(["```almanac", "year-nav", "```"], () => false)?.join("\n")
    ).toBe("");
    expect(
      stripRetired(["```almanac", "year-nav", "launcher", "```"], () => false)?.join("\n")
    ).toBe("```almanac\nlauncher\n```");
  });

  it("never reads a chart fence for directives", () => {
    // Chart specs are the reader's data. `noteLineFor` read every fence for as
    // long as it existed, so a spec line whose first word was a keyword put an
    // op in the plan that the write would never perform.
    const charts = ["```almanac-charts", "year-nav", "```"];
    expect(retiredIn(charts, () => false)).toEqual([]);
    expect(stripRetired(charts, () => false)).toBeNull();
  });
});

describe("managed flags", () => {
  it("adds an owned token to a directive that is missing it", () => {
    const shipped = home();
    expect(shipped).toContain("on-this-day:always");
    const text = shipped.replace("on-this-day:always", "on-this-day");

    const { ops, next } = repairNote(homeModel(), text, shipped);
    expect(ops.some((o) => o.kind === "flag")).toBe(true);
    expect(next ?? "").toContain("on-this-day:always");
  });

  it("keeps the reader's own argument beside it", () => {
    // `on-this-day[:always][:maxYears]` — `always` is the plugin's, the number
    // is the reader's, and this is the whole reason `MANAGED_FLAGS` is not
    // `MANAGED_ARGS`.
    const shipped = home();
    const text = shipped.replace("on-this-day:always", "on-this-day:5");
    const { next } = repairNote(homeModel(), text, shipped);
    expect(next ?? "").toContain("on-this-day:5:always");
  });

  it("adds nothing where the shipped note does not carry the flag", () => {
    const shipped = home().replace("on-this-day:always", "on-this-day");
    const text = shipped;
    expect(planFlags(L(text), L(shipped))).toEqual([]);
    expect(applyFlags(L(text), L(shipped))).toBeNull();
  });

  it("adds nothing to a note that has no such directive", () => {
    const shipped = home();
    const text = withoutLine(shipped, "on-this-day");
    expect(planFlags(L(text), L(shipped))).toEqual([]);
  });

  it("is idempotent", () => {
    const shipped = home();
    expect(applyFlags(L(shipped), L(shipped))).toBeNull();
  });

  it("declares only tokens whose directive takes more than one argument", () => {
    // The bar `MANAGED_FLAGS` sets for itself: an entry claims a TOKEN, so the
    // directive has to have others the reader owns. A directive whose whole
    // argument is the plugin's belongs in `MANAGED_ARGS` instead.
    expect(Object.keys(MANAGED_FLAGS)).toEqual(["on-this-day"]);
  });
});
