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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { regroupShippedPages, repairNote } from "../src/core/repair-plan";
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
import { DEFAULT_PATHS, DEFAULT_LOGBOOKS } from "../src/core/constants";
import { shippedNotes, isReconcilable } from "../src/core/scaffold";
import {
  mergeTrendsSection,
  ensureTrendsHeader,
  retitleTrends,
} from "../src/charts/charts";
import { titleSummaryFence } from "../src/diary/diary-sections";
import { mergeBannerFences } from "../src/core/note-sections";
import { collapseJournalsBlocks } from "../src/diary/home-sections";
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
    for (const keyword of ["diary", "launcher", "tasks-table", "logbook"]) {
      const text = withoutLine(shipped, keyword);
      const { next } = repairNote(homeModel(), text, shipped);
      expect(next, keyword).not.toBeNull();
      expect(next ?? "", keyword).toContain(keyword);
    }
  });

  it("restores a period dashboard's masthead summary", () => {
    // The masthead was one fence holding `links`, the summary and the scoped
    // period button, so only `links` was ever insertable and the summary was
    // the section the keyword reconciler could not reach.
    //
    // ── 4.19 MOVED THE ROW OUT, AND THE OLD RECONCILER CAN NOW SEE THE
    //    SUMMARY ──────────────────────────────────────────────────────
    //
    // The navigation row is the banner's now, so `month-summary` is the FIRST
    // directive of the masthead fence — and `AssetUnit.insertable` is `n === 0`,
    // so `planLayout` finds it. The `toEqual([])` that used to be here was
    // asserting the LIMIT, and the limit has moved rather than gone: the scoped
    // period button under the summary is still the second directive of that
    // fence and is still invisible to it.
    //
    // WHAT IS ASSERTED INSTEAD: that the section model still restores it. That
    // was always this test's subject; the `toEqual([])` beside it was evidence
    // for why the model was needed, and the evidence expired while the claim
    // did not. It is replaced by the honest statement of the new arrangement —
    // the reconciler sees the summary now, and BOTH have to get it right.
    //
    // The scoped period button is not a second case to test here: it is a line
    // of the summary section's own render, not a section, and repair works at
    // section granularity. A note missing it has no missing SECTION, so neither
    // path adds it back, which is correct and is `FlatSection.locate`'s rule
    // about anchors rather than spans.
    const shipped = composeDiaryDashboard("monthly");
    const text = withoutLine(shipped, "month-summary");

    expect(planLayout(L(text), L(shipped)).map((o) => o.kind)).toContain("insert");

    const { ops, next } = repairNote(
      diarySectionModel({ grain: "monthly" }),
      text,
      shipped
    );
    expect(ops.map((o) => o.kind)).toContain("add");
    expect(next ?? "").toContain("month-summary");

    // AND IT ADDS EXACTLY ONE. The masthead fence is welded, so an insert that
    // carried the whole block would bring a second summary and a second button.
    expect((next ?? "").match(/month-summary/g)).toHaveLength(1);
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
    for (const gained of ["launcher", "tasks-table", "logbook"]) {
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
    // COUNTED BY KEYWORD, NOT BY WHOLE LINE (4.20). `OLD_HOME` carries the bare
    // `title` every pre-4.2 homepage has and the shipped page now composes
    // `title:home,diary,journals`, so an exact-line count would report the two
    // heads as one of each and pass while the duplication happened. The defect
    // is TWO HEADS, whatever arguments they carry.
    const lines = (t: string, want: string): number =>
      L(t).filter((l) => l.trim().split(":")[0] === want).length;

    // ── AND THE OLD PATH STOPPED DOING IT IN 4.70 ─────────────────────
    //
    // These two lines asserted the DEFECT — `applyLayout` returning a note with
    // two heads and two diary cards, so that the fix one paragraph down could
    // be seen to be a fix. They now assert one of each, and nothing about
    // `repairNote` changed: `assetUnits` stopped making a UNIT of `wide` and
    // `row` at all.
    //
    // WHICH IS THE SAME DEFECT, CURED AT ITS SOURCE. The sentence above —
    // *"`wide` and `row` are the first directives of the fence, so `assetUnits`
    // makes them insertable"* — was the diagnosis, and 4.20 answered it by
    // routing eight shipped notes through their `SectionModel` instead. What it
    // did not do is stop the module believing a modifier is a directive, which
    // it then kept believing about `frame:`, `cell`, `tab` and `height:` as
    // each arrived. `MODIFIER_KEYWORDS` is that list, in the grammar, and this
    // is what it looks like from here.
    //
    // BOTH PATHS ARE ASSERTED, and the model is still the supported one: three
    // notes are copied from assets rather than composed, and `applyLayout` is
    // what reconciles those.
    const old = applyLayout(L(OLD_HOME), L(shipped))?.join("\n") ?? OLD_HOME;
    expect(lines(old, "title")).toBe(1);
    expect(lines(old, "diary")).toBe(1);

    const { next } = repairNote(homeModel(), OLD_HOME, shipped);
    expect(lines(next ?? "", "title")).toBe(1);
    expect(lines(next ?? "", "diary")).toBe(1);
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
    const before = L(text).filter((l) => l.trim() === "journals:cards");
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
  // SEARCH IS THE FIXTURE AS OF 4.70, AND IT HAS TO BE. `MANAGED_FLAGS` holds
  // exactly one entry — `on-this-day` — and these cases need a SHIPPED note
  // that composes that directive, because a flag op is the difference between
  // the note the reader has and the note the release writes.
  //
  // The homepage composed it until 4.70, when `upcoming` took the cell (3.13
  // §11's unanswered half: the homepage is the one page about now and that was
  // the one block on it about the past). Search composes it still, with the
  // same `:always` spelling — that agreement is pinned in
  // `test/search-sections.test.ts` — so this moved page rather than losing the
  // coverage.
  const shippedFlagNote = (): string => composeSearchNote();
  const flagModel = (): SectionModel => searchSectionModel(ROOT);

  it("adds an owned token to a directive that is missing it", () => {
    const shipped = shippedFlagNote();
    expect(shipped).toContain("on-this-day:always");
    const text = shipped.replace("on-this-day:always", "on-this-day");

    const { ops, next } = repairNote(flagModel(), text, shipped);
    expect(ops.some((o) => o.kind === "flag")).toBe(true);
    expect(next ?? "").toContain("on-this-day:always");
  });

  it("keeps the reader's own argument beside it", () => {
    // `on-this-day[:always][:maxYears]` — `always` is the plugin's, the number
    // is the reader's, and this is the whole reason `MANAGED_FLAGS` is not
    // `MANAGED_ARGS`.
    const shipped = shippedFlagNote();
    const text = shipped.replace("on-this-day:always", "on-this-day:5");
    const { next } = repairNote(flagModel(), text, shipped);
    expect(next ?? "").toContain("on-this-day:5:always");
  });

  it("adds nothing where the shipped note does not carry the flag", () => {
    const shipped = shippedFlagNote().replace("on-this-day:always", "on-this-day");
    const text = shipped;
    expect(planFlags(L(text), L(shipped))).toEqual([]);
    expect(applyFlags(L(text), L(shipped))).toBeNull();
  });

  it("adds nothing to a note that has no such directive", () => {
    const shipped = shippedFlagNote();
    const text = withoutLine(shipped, "on-this-day");
    expect(planFlags(L(text), L(shipped))).toEqual([]);
  });

  it("adds nothing to the homepage, which stopped composing the flag", () => {
    // THE OTHER HALF OF THE MOVE ABOVE, as a test rather than as a comment. A
    // homepage that still holds the reader's own `on-this-day` — the widget is
    // not retired, and `planLayout` deletes only what `RETIRED_WIDGETS` names —
    // must not have `:always` written into it by repair, because the shipped
    // page it is compared against no longer carries the flag to copy.
    const shipped = home();
    const text = shipped.replace(
      "```almanac\nframe: section",
      "```almanac\non-this-day\n```\n\n```almanac\nframe: section"
    );
    expect(text, "fixture matched nothing").not.toBe(shipped);
    expect(planFlags(L(text), L(shipped))).toEqual([]);
  });

  it("is idempotent", () => {
    const shipped = shippedFlagNote();
    expect(applyFlags(L(shipped), L(shipped))).toBeNull();
  });

  it("declares only tokens whose directive takes more than one argument", () => {
    // The bar `MANAGED_FLAGS` sets for itself: an entry claims a TOKEN, so the
    // directive has to have others the reader owns. A directive whose whole
    // argument is the plugin's belongs in `MANAGED_ARGS` instead.
    expect(Object.keys(MANAGED_FLAGS)).toEqual(["on-this-day"]);
  });
});

// ── The dotfile that stopped repair dead (4.38.1) ────────────────────────
//
// A reader reported that the repair window listed two notes under "Run format
// migrations" and applying it did nothing at all — no writes, no toast. The
// migration was innocent. What happened is in the group ABOVE it:
//
// A journal manifest is `.almanac-journal.json`, a DOTFILE, and Obsidian keeps
// dotfiles out of the vault index. `planCreate` asked the vault whether one
// existed, was told no whatever the truth, and listed all four of them as
// missing on every run — the window in the report shows four identical rows.
// Applying then called `vault.create` on a path already on disk, which throws
// "File already exists"; the create loop had no `try`, so the throw escaped
// `applyRepair`, took the migrations group with it, and skipped the closing
// notice that would have said so.
//
// `journal-manifest.ts` had stated the rule the whole time — *"the adapter
// while the rest of the plugin talks to the vault"* — and `writeManifest`
// obeyed it. This is the one caller that did not.
//
// ASSERTED AGAINST THE SOURCE, because the failure is which API is called and
// there is no vault here to call one on.
describe("a manifest is a dotfile, and the vault cannot see it", () => {
  const scaffold = (): string =>
    readFileSync(join(__dirname, "..", "src", "core", "scaffold.ts"), "utf8");

  it("plans manifests through the adapter, not through the vault index", () => {
    const src = scaffold();
    const at = src.indexOf("const dest = manifestPathFor(cfg.root);");
    expect(at, "the manifest planner moved").toBeGreaterThan(0);
    const block = src.slice(at, at + 2400);
    // The existence check and the drift read both go to the adapter. Either one
    // left on the vault reintroduces "listed as missing on every run".
    expect(block).toContain("await adapter.exists(dest)");
    expect(block).toContain("await adapter.read(dest)");
    expect(block).not.toContain("const existing = getFile(this.app, dest);");
    // And the plan carries the fact forward, so the write does not have to
    // re-derive "is this a dotfile" from the path.
    expect(block).toContain("files.push({ dest, content, hidden: true })");
  });

  it("writes a hidden file through the adapter too", () => {
    const src = scaffold();
    const at = src.indexOf('if (chosen.has("create")) {');
    expect(at, "the create group moved").toBeGreaterThan(0);
    const block = src.slice(at, src.indexOf('if (chosen.has("pages"))', at));
    expect(block).toContain("await this.app.vault.adapter.write(dest, content)");
    // A FOLDER IS INDEXED EVEN WHEN A FILE IN IT IS NOT, so the parent still
    // comes from the vault — the adapter write would otherwise fail on a journal
    // whose root has not been made yet.
    expect(block).toContain("await ensureFolder(this.app, parent)");
    // The vault path survives for everything that is not hidden.
    expect(block).toContain("createFileEnsuringFolders(this.app, dest, content)");
  });

  it("does not let one file's failure end the repair", () => {
    // THE SHAPE OF THE FAILURE IS THE PART WORTH DEFENDING. Create is the FIRST
    // group, so anything it throws takes every later group and the closing
    // notice with it — which is why the reader saw no toast rather than an
    // error. Every other group in this method already had a `try`.
    const src = scaffold();
    const at = src.indexOf('if (chosen.has("create")) {');
    const block = src.slice(at, src.indexOf('if (chosen.has("pages"))', at));
    expect(block).toContain("try {");
    expect(block).toContain("catch (e) {");
    // Counted and REPORTED, not swallowed: a silent skip is the same defect one
    // level quieter.
    expect(block).toContain("failed++");
    expect(block).toContain("check the console");
  });

  it("still reaches the migrations group, which is what the report was about", () => {
    // The ordering that made a create failure fatal to the migration. Pinned so
    // the two stay in one method and the later group is genuinely later.
    const src = scaffold();
    expect(src.indexOf('if (chosen.has("create")) {')).toBeLessThan(
      src.indexOf('if (chosen.has("migrations")) {')
    );
    // And the notice at the end is unconditional — it is the only thing that
    // tells a reader the command finished at all.
    expect(src).toContain('notify.ok("Almanac: nothing to do")');
  });
});

// ── §N. A RELEASE MUST NOT OFFER TO MIGRATE ITS OWN OUTPUT ────────────────
//
// `Set up / repair vault` on a vault scaffolded minutes earlier showed
// "Run format migrations — 2 notes", offering to rewrite `02 - Diary.md` and
// the DOCUMENTATION. Two distinct defects met in one dialog, and neither was a
// fact about the reader's vault:
//
//   1. `titleSummaryFence` asked `hasSectionBar` — is there a `header:` line —
//      when the composer titles that fence with `frame: section` instead. So the
//      migration wanted to insert a header into what the scaffolder had just
//      written. It converged after one apply, which is the only reason this was
//      a wart rather than 4.38.2's loop.
//
//   2. `segment()` matched a three-backtick ```almanac opener anywhere,
//      including inside the FOUR-backtick fence `assets/documentation.md` uses
//      to print an example rather than render it. The docs' illustration of a
//      bare directive was read as a live widget block.
//
// The gate below is deliberately not two regression tests. It is the property
// both defects broke: run every format migration the repair window runs, over
// every note this release actually writes, and nothing may fire. A migration
// exists to carry an OLDER note forward; one that fires on current output is
// either wrong or the composer is, and this fails without needing to know which.
describe("format migrations, against what this release writes", () => {
  // `composed` is what this release WRITES for the page, where the page is one
  // it composes — the seventh migration is the first that needs it, because it
  // asks whether the note already has this release's grouping rather than
  // whether it has a shape it can recognise on sight. For a note copied from an
  // asset there is no composed text and the step does not apply; passing the
  // note's own text where there IS one is exactly the property under test, since
  // a page identical to the composition must produce no offer.
  const migrated = (path: string, text: string, composed?: string): string => {
    const merged = mergeTrendsSection(text.split("\n"))?.join("\n") ?? text;
    const titled = ensureTrendsHeader(merged.split("\n"))?.join("\n") ?? merged;
    const respelled = retitleTrends(titled.split("\n"))?.join("\n") ?? titled;
    const welded = mergeBannerFences(respelled) ?? respelled;
    const carded =
      collapseJournalsBlocks(
        welded,
        path === DEFAULT_PATHS.home ? "journals:cards" : "journals"
      ) ?? welded;
    const titledSummary = titleSummaryFence(carded) ?? carded;
    return composed == null
      ? titledSummary
      : regroupShippedPages(titledSummary, composed) ?? titledSummary;
  };

  const shipped = () =>
    shippedNotes(DEFAULT_PATHS, [], DEFAULT_LOGBOOKS)
      .filter(isReconcilable)
      .flatMap((n) => {
        const text =
          typeof n.content === "string"
            ? n.content
            : n.asset
            ? readFileSync(join(process.cwd(), "assets", n.asset), "utf8")
            : null;
        return text == null
          ? []
          : [{ dest: n.dest, text, composed: n.content }];
      });

  it("offers no migration for any note the scaffolder writes", () => {
    const notes = shipped();
    // Not vacuous: the walk has to actually be reading pages. `isReconcilable`
    // narrowing to nothing would otherwise pass this silently.
    expect(notes.length).toBeGreaterThan(5);
    const offered = notes
      .filter((n) => migrated(n.dest, n.text, n.composed) !== n.text)
      .map((n) => n.dest);
    expect(offered).toEqual([]);
  });

  // The documentation is prose, and its fences are printed rather than drawn.
  // Called out on its own because it is the one page where a migration firing is
  // not merely premature but categorically wrong: there is no widget there to
  // bring up to date.
  it("never rewrites the documentation, whose fences are illustrations", () => {
    const doc = shipped().find((n) => n.dest.endsWith("README.md"));
    expect(doc, "the documentation is in the reconcilable walk").toBeDefined();
    expect(doc!.text).toContain("```almanac");
    expect(migrated(doc!.dest, doc!.text, doc!.composed)).toBe(doc!.text);
  });
});

// ── §N+1. THE REGROUP, WHICH IS THE ONLY MIGRATION THAT MOVES A BLOCK ─────
//
// 4.70 grouped sections that shipped stacked, and an additive reconciler cannot
// reach a group: it converges every word on the page and leaves the fences where
// they are. `regroupShippedPages` is the opt-in half — see its own comment for
// the three refusals. These are the four properties that make it safe to tick.
describe("regrouping a page onto this release's rows", () => {
  const SHIPPED = [
    "`almanac:spacer`",
    "```almanac",
    "frame: section",
    "diary:3",
    "```",
    "",
    "```almanac",
    "row",
    "header:🗂️ Across the diary",
    "tasks-table",
    "tag-index",
    "```",
    "",
    "%% almanac-graph %%",
  ].join("\n");

  // What the release before it wrote for the same page: the same two widgets,
  // one per fence, each with the bar that was true of it alone, and two other
  // blocks in between — which is the case the first draft of this could not
  // handle and the reason it matches by widget rather than by adjacency.
  const BEFORE = [
    "`almanac:spacer`",
    "```almanac",
    "frame: section",
    "diary:3",
    "```",
    "",
    "```almanac",
    "header:⏳ Open tasks",
    "tasks-table",
    "```",
    "",
    "```almanac-charts",
    "header:📊 Trends",
    "jchart:mood",
    "```",
    "",
    "```almanac",
    "header:🏷️ Tags",
    "tag-index",
    "```",
    "",
    "%% almanac-graph %%",
  ].join("\n");

  it("welds two stacked cells into the row, at the first of them", () => {
    const out = regroupShippedPages(BEFORE, SHIPPED);
    expect(out).not.toBeNull();
    expect(out).toContain(
      ["```almanac", "row", "header:🗂️ Across the diary", "tasks-table", "tag-index", "```"].join(
        "\n"
      )
    );
    // AT THE TOPMOST CELL, not at the last and not at the composed position: the
    // band stays where the reader has been looking for it. The charts fence,
    // which sat between the two, keeps its place and its contents.
    expect(out!.indexOf("row")).toBeLessThan(out!.indexOf("almanac-charts"));
    expect(out).toContain("jchart:mood");
    // AND THE SEPARATOR GOES WITH THE CELL THAT MOVED. Two fences became one, so
    // the page loses a block and its blank line — not a blank line on its own,
    // which would widen the gap a little further on every repair.
    expect(out).not.toContain("\n\n\n");
    // The bars that named one cell each are gone, because a row draws ONE bar
    // above BOTH columns and either of those two would now be a lie.
    expect(out).not.toContain("header:⏳ Open tasks");
    expect(out).not.toContain("header:🏷️ Tags");
  });

  it("keeps each cell's own arguments", () => {
    // The widget lines are the READER's, verbatim. Only the modifiers come from
    // the composition — the whole point being that a page keeps what it says and
    // changes only how it is grouped.
    const out = regroupShippedPages(
      BEFORE.replace("tasks-table", "tasks-table:,period"),
      SHIPPED
    );
    expect(out).toContain("tasks-table:,period");
  });

  it("declines a row whose second cell is not on the page yet", () => {
    // Refusal 1. The diary dashboard's second row pairs `on-this-day` with
    // `sleep-summary`, which this release also ADDS — so on the first pass there
    // is nothing to group, and a half-built row is not an improvement on a
    // stacked one. It welds on the run after the reconciler has added the cell.
    const short = BEFORE.split("\n").filter((l) => l !== "tag-index").join("\n");
    expect(regroupShippedPages(short, SHIPPED)).toBeNull();
  });

  it("declines a cell the page writes twice", () => {
    // Refusal 2. With `tasks-table` in two fences there is no answer to which
    // one is the cell, and picking one would silently orphan the other.
    const twice = BEFORE.replace(
      "%% almanac-graph %%",
      "```almanac\ntasks-table\n```\n\n%% almanac-graph %%"
    );
    expect(regroupShippedPages(twice, SHIPPED)).toBeNull();
  });

  it("declines a cell the reader has put on a page or given a height", () => {
    // Refusal 3, and the reason it is a refusal rather than a dropped line:
    // `tab:` and `height:` are gestures made in the section editor, and a cell
    // has no room for either. The block stays exactly where they put it.
    for (const gesture of ["tab:Later", "height:280", "frame: card", "wide"]) {
      const fussy = BEFORE.replace("header:🏷️ Tags", `header:🏷️ Tags\n${gesture}`);
      expect(regroupShippedPages(fussy, SHIPPED), gesture).toBeNull();
    }
  });

  it("declines a fence holding more than the row groups", () => {
    // The other half of refusal 3. Welding this fence would drag `timeline` into
    // a band that says nothing about it.
    const extra = BEFORE.replace("tag-index", "tag-index\ntimeline");
    expect(regroupShippedPages(extra, SHIPPED)).toBeNull();
  });

  it("is idempotent, which is what makes it safe to tick twice", () => {
    const once = regroupShippedPages(BEFORE, SHIPPED);
    expect(once).not.toBeNull();
    expect(regroupShippedPages(once!, SHIPPED)).toBeNull();
  });

  it("has nothing to say about a page this release composes no row for", () => {
    const flat = SHIPPED.split("\n")
      .filter((l) => l !== "row" && l !== "tag-index")
      .join("\n");
    expect(regroupShippedPages(BEFORE, flat)).toBeNull();
  });
});
