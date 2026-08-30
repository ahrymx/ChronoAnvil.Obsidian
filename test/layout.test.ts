// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import { composeDiaryDashboard } from "../src/diary/diary-sections";
import { composeHomeNote } from "../src/diary/home-sections";
import { composeSearchNote } from "../src/diary/search-sections";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  MANAGED_ARGS,
  applyLayout,
  assetUnits,
  keywordOf,
  planLayout,
  segment,
  serialize,
} from "../src/core/layout";
import { DEFAULT_PATHS, RETIRED_WIDGETS } from "../src/core/constants";
import { isReconcilable, shippedNotes } from "../src/core/scaffold";
import { STUDY_JOURNAL } from "../src/journals/journal";
import { readSrc } from "./sources";

const ASSETS = resolve(__dirname, "..", "assets");
// The four period dashboards are composed from the diary section catalogue as
// of 2.59.3 rather than read from `assets/`. This is what `reconcileLayouts`
// now diffs a vault's note against, so it is what these tests must use — the
// alternative would be checking the layout planner against a description
// nothing writes any more.
const COMPOSED: Record<string, string> = {
  "weekly-overview.md": composeDiaryDashboard("weekly"),
  "monthly-overview.md": composeDiaryDashboard("monthly"),
  "quarter.md": composeDiaryDashboard("quarterly"),
  "year.md": composeDiaryDashboard("yearly"),
};
const asset = (name: string): string =>
  COMPOSED[name] ?? readFileSync(resolve(ASSETS, name), "utf8");
const L = (s: string): string[] => s.split("\n");

// A 2.51-era Monthly Overview: three-rung ladder, no entry-rollup.
//
// ITS TITLES ARE 2.51'S AND STAY THAT WAY. 4.25 §1 put every shipped section
// title into sentence case, and a sweep over this file would have rewritten
// "Open Tasks" here too — which would make the fixture agree with what ChronoAnvil
// composes TODAY and stop being what it is for. The whole point of the note is
// that it is what a vault created before the rename actually contains, so the
// assertions about carrying an old header fence along are testing the migration
// path rather than a copy of the current asset with a 2.51 label on it.
const OLD_MONTHLY = `---
month-start:
---
\`chronoanvil:spacer\`
\`\`\`chronoanvil
links:home,week,all#diary
\`\`\`

\`\`\`chronoanvil
month-summary
\`\`\`

\`\`\`chronoanvil
header:⏳ Open Tasks
\`\`\`

\`\`\`chronoanvil
tasks-table:,period
\`\`\`

\`\`\`chronoanvil-charts
header:📊 Trends and Statistics
chart:Mood|line|period|daily|wide
\`\`\`
`;

// A 2.51-era Year page: the retired year-nav, old ladder, no quarter pill.
const OLD_YEAR = `---
year-start: ""
---
\`chronoanvil:spacer\`
\`\`\`chronoanvil
links:home,month,search#diary
\`\`\`

\`\`\`chronoanvil
year-nav
\`\`\`

\`\`\`chronoanvil
year-summary
\`\`\`

\`\`\`chronoanvil-charts
\`\`\`
`;

describe("segment", () => {
  it("round-trips a note exactly", () => {
    for (const name of readdirSync(ASSETS).filter((n) => n.endsWith(".md"))) {
      const lines = L(asset(name));
      expect(serialize(segment(lines))).toEqual(lines);
    }
  });

  it("keeps frontmatter and prose out of the fences", () => {
    const segs = segment(L(OLD_MONTHLY));
    expect(segs[0].kind).toBe("raw");
    expect(segs[0].lines[0]).toBe("---");
  });

  it("gives a chart fence no keywords, so no rule can reach its specs", () => {
    // Chart specs are user data. migrateTrends owns that fence.
    const charts = segment(L(OLD_MONTHLY)).find(
      (s) => s.fenceKind === "chronoanvil-charts"
    );
    expect(charts?.keywords).toEqual([]);
  });

  it("leaves an unterminated fence as raw text rather than guessing", () => {
    const segs = segment(["```chronoanvil", "month-summary", "no closing fence"]);
    expect(segs.every((s) => s.kind === "raw")).toBe(true);
  });
});

describe("keywordOf", () => {
  it("takes everything before the first colon", () => {
    expect(keywordOf("links:home,week#diary")).toBe("links");
    expect(keywordOf("tasks-table:,period")).toBe("tasks-table");
  });

  it("is the whole line when there are no arguments", () => {
    expect(keywordOf("  month-summary  ")).toBe("month-summary");
  });
});

describe("assetUnits", () => {
  it("keys a block by its content directive, never by its header", () => {
    const units = assetUnits(L(asset("monthly-overview.md")));
    expect(units.map((u) => u.keyword)).toEqual([
      // THE HEAD IS ITS OWN UNIT because it is its own fence — which is the
      // whole reason it is a band of its own (4.10). In the masthead it would
      // be the first directive of a three-directive block, and `insertable`
      // carries the whole block.
      "title",
      "month-summary",
      // 3.3 gave monthly the scoped period button the other three have had
      // since 2.57, so the masthead carries three directives and therefore
      // three units — one per content directive, which is patch 3's rule.
      "button",
      "entry-rollup",
      "tasks-table",
    ]);
  });

  it("carries a same-fence header along with its block", () => {
    const u = assetUnits(L(asset("monthly-overview.md"))).find(
      (x) => x.keyword === "entry-rollup"
    );
    expect(u?.fences).toHaveLength(1);
    expect(u?.fences[0].lines.join("\n")).toContain("header:📖");
  });

  it("carries a preceding header-only fence along with its block", () => {
    // The CAPABILITY, asserted against a fixture rather than a shipped asset.
    //
    // 2.56.24 moved every dashboard onto one fence per section, so no asset
    // has this shape any more — but `OLD_MONTHLY` is a real 2.51-era note and
    // every vault created before this release still reads that way. Inserting a
    // block has to bring its header fence with it, or a repair would strand the
    // title of a section it just moved.
    const u = assetUnits(L(OLD_MONTHLY)).find(
      (x) => x.keyword === "tasks-table"
    );
    expect(u?.fences).toHaveLength(2);
    expect(u?.fences[0].lines.join("\n")).toContain("Open Tasks");
  });

  it("ships no header-only fence of its own", () => {
    // One fence per section, which is what journal notes always did. A section
    // split across two fences is two blocks, and two blocks cannot be one
    // object: it is why the diary's sections folded and shaded differently from
    // the journals' in Live Preview, and why a reader cannot pick a section up
    // and move it without knowing it is secretly a pair.
    for (const name of readdirSync(ASSETS).filter((f) => f.endsWith(".md"))) {
      const units = assetUnits(L(asset(name)));
      const orphans = units.filter((u) => u.fences.length > 1);
      expect(orphans.map((u) => `${name}:${u.keyword}`)).toEqual([]);
    }
  });

  it("never treats a chart fence as a title for what follows", () => {
    const units = assetUnits(L(asset("quarter.md")));
    expect(units.some((u) => u.keyword === "header")).toBe(false);
  });
});

describe("planLayout", () => {
  it("plans nothing for a note already on the shipped layout", () => {
    for (const name of ["monthly-overview.md", "quarter.md", "year.md"]) {
      expect(planLayout(L(asset(name)), L(asset(name)))).toEqual([]);
    }
  });

  it("plans the three operations 2.52 actually needed", () => {
    const ops = planLayout(L(OLD_YEAR), L(asset("year.md")));
    const kinds = ops.map((o) => `${o.kind}:${o.keyword}`);
    expect(kinds).toContain("insert:title");
    expect(kinds).toContain("delete:year-nav");
  });

  it("plans an insert for a block the note never had", () => {
    const ops = planLayout(L(OLD_MONTHLY), L(asset("monthly-overview.md")));
    expect(ops.map((o) => `${o.kind}:${o.keyword}`)).toContain(
      "insert:entry-rollup"
    );
  });

  it("never plans to touch a directive the user added", () => {
    // The load-bearing rule. Unknown and not retired means the user's.
    const note = OLD_MONTHLY.replace(
      "month-summary",
      "month-summary\n```\n\n```chronoanvil\ntag-index:03 - Journals"
    );
    const ops = planLayout(L(note), L(asset("monthly-overview.md")));
    expect(ops.some((o) => o.keyword === "tag-index")).toBe(false);
  });

  it("says what it would do, in words", () => {
    const ops = planLayout(L(OLD_YEAR), L(asset("year.md")));
    const del = ops.find((o) => o.kind === "delete");
    expect(del?.detail).toContain("year-nav");
    expect(del?.detail).toContain("banner");
  });
});

describe("applyLayout", () => {
  const monthly = L(asset("monthly-overview.md"));
  const year = L(asset("year.md"));

  it("returns null for a note that needs nothing", () => {
    expect(applyLayout(monthly, monthly)).toBeNull();
  });

  it("is idempotent — a second run has nothing to do", () => {
    // Asserted rather than claimed in a comment, which is how the four
    // existing migrations state it.
    const once = applyLayout(L(OLD_MONTHLY), monthly);
    expect(once).not.toBeNull();
    expect(applyLayout(once as string[], monthly)).toBeNull();
  });

  it("converges an old note onto the shipped directive set", () => {
    const out = applyLayout(L(OLD_MONTHLY), monthly) as string[];
    const text = out.join("\n");
    expect(text).toContain("title:home,diary,journals");
    expect(text).toContain("entry-rollup");
    expect(text).toContain("links:home,week,all#diary");
  });

  it("gives a dashboard that predates the head one, at the top", () => {
    // THE ASSERTION THE 4.10 RELEASE RESTS ON. Every dashboard in every live
    // vault was composed before the head existed, and none of them would ever
    // get one if repair could not add it — which would make this a feature for
    // new vaults only, on pages a reader has had for a year.
    //
    // `OLD_MONTHLY` has no `title` line at all. Step 3 has no predecessor unit
    // to anchor against, so it lands in front of the earliest successor that IS
    // present — which is the note's first block, and is what "at the top" has
    // to mean when the reader may have rearranged everything below it.
    const out = applyLayout(L(OLD_MONTHLY), monthly) as string[];
    const text = out.join("\n");
    expect(text).toContain("title:home,diary,journals");

    const head = text.indexOf("title:home,diary,journals");
    const summary = text.indexOf("month-summary");
    expect(head).toBeGreaterThan(-1);
    expect(head).toBeLessThan(summary);

    // THE SUMMARY ARRIVES ALONE, WHICH IS STILL THE GUARD THAT MATTERS HERE.
    expect(text.match(/month-summary/g)).toHaveLength(1);
    expect(text.match(/links:/g)).toHaveLength(1);
  });

  it("adds no second head to a dashboard that already has one", () => {
    // `hasKeyword` short-circuits step 3. Without it, repair would append a
    // head on every run — which is the shape of bug that only shows up on the
    // third or fourth repair of a vault nobody is watching.
    const once = applyLayout(L(OLD_MONTHLY), monthly) as string[];
    const twice = applyLayout(once, monthly);
    expect(twice).toBeNull();
    expect(once.join("\n").match(/title:/g)).toHaveLength(1);
  });

  it("removes a retired directive and the fence it emptied", () => {
    const out = applyLayout(L(OLD_YEAR), year) as string[];
    const text = out.join("\n");
    expect(text).not.toContain("year-nav");
    // The fence that held it goes too — an empty ```chronoanvil renders as an
    // empty block, which is what the first cut of this left behind.
    expect(text).not.toMatch(/```chronoanvil\n```/);
  });

  it("preserves user charts verbatim", () => {
    // The property that matters most, and the one a wholesale replace gets
    // wrong. Written before the code that had to satisfy it.
    const out = applyLayout(L(OLD_MONTHLY), monthly) as string[];
    expect(out.join("\n")).toContain("chart:Mood|line|period|daily|wide");
  });

  it("preserves user prose between blocks", () => {
    const note = OLD_MONTHLY.replace(
      "```chronoanvil\nmonth-summary",
      "Some notes I keep here.\n\n```chronoanvil\nmonth-summary"
    );
    const out = applyLayout(L(note), monthly) as string[];
    expect(out.join("\n")).toContain("Some notes I keep here.");
  });

  it("preserves a widget the user added", () => {
    const note = OLD_MONTHLY.replace(
      "```chronoanvil-charts",
      "```chronoanvil\ntag-index:03 - Journals\n```\n\n```chronoanvil-charts"
    );
    const out = applyLayout(L(note), monthly) as string[];
    expect(out.join("\n")).toContain("tag-index:03 - Journals");
  });

  it("preserves frontmatter", () => {
    const out = applyLayout(L(OLD_YEAR), year) as string[];
    expect(out[0]).toBe("---");
    expect(out.join("\n")).toContain("year-start:");
  });

  it("inserts after the block the asset puts it after", () => {
    const out = (applyLayout(L(OLD_MONTHLY), monthly) as string[]).join("\n");
    expect(out.indexOf("month-summary")).toBeLessThan(out.indexOf("entry-rollup"));
    expect(out.indexOf("entry-rollup")).toBeLessThan(out.indexOf("tasks-table"));
  });

  it("still places a new block sensibly in a reordered note", () => {
    // Anchoring on the previous asset unit *the note actually has*, rather
    // than an absolute index, is what makes this work.
    const note = `---
month-start:
---
\`\`\`chronoanvil
tasks-table:,period
\`\`\`

\`\`\`chronoanvil
month-summary
\`\`\`
`;
    const out = (applyLayout(L(note), monthly) as string[]).join("\n");
    expect(out).toContain("entry-rollup");
    expect(out.indexOf("month-summary")).toBeLessThan(out.indexOf("entry-rollup"));
  });

  it("does not rewrite arguments of an unmanaged directive", () => {
    // tag-index is configured by the user; links is owned by the plugin.
    expect(MANAGED_ARGS.has("links")).toBe(true);
    expect(MANAGED_ARGS.has("tag-index")).toBe(false);
  });

  it("keeps a live directive sharing a fence with a retired one", () => {
    const note = `---
year-start: ""
---
\`\`\`chronoanvil
year-nav
year-summary
\`\`\`
`;
    const out = (applyLayout(L(note), year) as string[]).join("\n");
    expect(out).not.toContain("year-nav");
    expect(out).toContain("year-summary");
  });
});

describe("the retired registry", () => {
  it("never names a directive the shipped assets still use", () => {
    // A retired entry that is still shipped would have repair delete a live
    // block on every run.
    const shipped = new Set<string>();
    for (const name of readdirSync(ASSETS).filter((n) => n.endsWith(".md"))) {
      for (const seg of segment(L(asset(name)))) {
        for (const k of seg.keywords ?? []) shipped.add(k);
      }
    }
    for (const key of Object.keys(RETIRED_WIDGETS)) {
      expect(shipped.has(key)).toBe(false);
    }
  });

  it("gives every entry a release and a sentence", () => {
    for (const [, v] of Object.entries(RETIRED_WIDGETS)) {
      expect(v.since).toMatch(/^\d+\.\d+/);
      expect(v.note.length).toBeGreaterThan(0);
    }
  });

  it("never names a directive the renderer still dispatches", () => {
    // THE OTHER HALF OF THE GUARD ABOVE, added in 3.11 §7.1 when the registry
    // went from one entry to four.
    //
    // "Retired" has to mean both things at once: repair strips the directive
    // from shipped notes AND the renderer stops answering to it. A registry
    // entry with a live `case` behind it is the worse of the two failures —
    // repair would delete a block that still worked, on every run, and the
    // reader would see a widget vanish from a note that renders it correctly
    // the moment they type it back.
    //
    // Read off the source rather than by calling the renderer, which needs a
    // plugin. The dispatch table is a `switch` over string literals, so the
    // literals are greppable and this is exact rather than approximate.
    const src = readFileSync(
      resolve(__dirname, "..", "src", "ui", "widgets", "index.ts"),
      "utf8"
    );
    for (const key of Object.keys(RETIRED_WIDGETS)) {
      expect(src, key).not.toContain(`case "${key}":`);
    }
  });

  it("still dispatches diary:, which shares calendar's builder", () => {
    // The reason `calendar` could be retired without touching the homepage:
    // one builder, two spellings, and only one of them was ever written by a
    // shipped note. Retiring the builder along with the spelling would have
    // taken the homepage's whole diary card with it.
    const src = readFileSync(
      resolve(__dirname, "..", "src", "ui", "widgets", "index.ts"),
      "utf8"
    );
    expect(src).toContain('case "diary":');
    expect(src).toContain("buildCalendarRegion");
  });
});

describe("the shipped assets agree with each other", () => {
  // The guard §0.45 needed. 2.52 rewrote the links row on six assets, missed
  // search.md, and shipped a test that enumerated the same six — so the test
  // was written from the memory that forgot the seventh and could not catch
  // it. This one reads the folder.
  it("gives every diary-area note the same scope ladder", () => {
    // READS THE ASSETS *AND* THE COMPOSED NOTES, as of 3.11 §3.
    //
    // The paragraph above is about a test written from the memory that forgot
    // a file; the fix was to read the folder instead of a list. That fix has
    // now failed the same way once — composing `search.md` emptied the folder
    // of the very note the original bug was about, and this assertion went
    // from checking seven notes to checking none while still passing on the
    // day home.md left and failing only because `[]` is not `[the row]`.
    //
    // A folder is not the population any more. The population is "every note
    // ChronoAnvil authors", which is what `shippedNotes` knows and what
    // scope-properties.test.ts learned to enumerate two releases ago. Same
    // list, assembled the same way.
    const authored: { name: string; text: string }[] = [
      ...readdirSync(ASSETS)
        .filter((n) => n.endsWith(".md"))
        .map((name) => ({ name, text: asset(name) })),
      { name: "Homepage", text: composeHomeNote(DEFAULT_PATHS.diaryRoot) },
      { name: "Search", text: composeSearchNote() },
      ...(["weekly", "monthly", "quarterly", "yearly"] as const).map((g) => ({
        name: `${g} dashboard`,
        text: composeDiaryDashboard(g),
      })),
    ];

    const rows = new Map<string, string>();
    for (const { name, text } of authored) {
      const row = L(text).find((l) => l.trim().startsWith("links:"));
      if (row) rows.set(name, row.trim());
    }
    // staging.md is not a diary scope — it is the inbox, and reachable from
    // home rather than a rung of the ladder.
    rows.delete("staging.md");

    // Redundant in-note links lines are removed in favor of Vault Banner
    expect(rows.size).toBe(0);

    for (const item of authored) {
      if (item.name === "staging.md") continue;
      const text = item.text;
      expect(text, `${item.name} should not have in-note links banner`).not.toContain(
        "links:today,scopes#diary"
      );
    }
  });
});

// ── what reconciliation is allowed to touch (4.1 §6.1, §10.3) ─────────────
//
// §10.3 asks for this on a `.canvas` destination SPECIFICALLY, and gives the
// reason: "the guard that exists today is on the *asset* extension and a
// composed entry has no asset to guard." That is why the test is written
// against a synthetic entry rather than against `shippedNotes()` — nothing
// shipped today is non-markdown, so a test that only read the real list would
// pass against the broken predicate and go on passing until the day it mattered.
describe("only markdown is reconciled", () => {
  it("skips a composed .canvas, which has no asset to guard", () => {
    // THE CASE §6.1 CALLS "a bug waiting for the first `.canvas` entry".
    // Composed content, so `asset` is undefined and the old asset-extension
    // check never fired; not a template, so the flag does not save it either.
    // Left in, repair would run `planLayout` over JSON — looking for directive
    // lines in a file that has none, and rewriting one that does.
    expect(
      isReconcilable({ dest: "Homepage.canvas", content: "{}" })
    ).toBe(false);
  });

  it("still skips a non-markdown asset", () => {
    // The older guard, unchanged. Kept separate from the destination check
    // because nothing requires the pair to agree.
    expect(
      isReconcilable({ dest: "Diary.md", asset: "Diary.base" })
    ).toBe(false);
  });

  it("still skips a template by its flag, not its name", () => {
    // 2.60.1's fix, which this refactor must not undo: the exclusion is the
    // flag, because a filename check stops answering once a template stops
    // being a file.
    expect(
      isReconcilable({ dest: "Templates/Daily.md", content: "x", template: true })
    ).toBe(false);
  });

  it("reconciles an ordinary composed note", () => {
    // The inverse, so the predicate cannot pass the three above by refusing
    // everything — which is the way a guard like this usually goes wrong.
    expect(isReconcilable({ dest: "Homepage.md", content: "x" })).toBe(true);
    expect(isReconcilable({ dest: "Search.md", asset: "search.md" })).toBe(true);
  });

  it("is the only place any walk decides", () => {
    // ONE PREDICATE, EVERY READER. The two original sites restated these
    // conditions inline and both got the same one wrong, because both were
    // written from the same memory — the failure `shippedNotes` exists to
    // prevent one layer up. An inline copy would reintroduce exactly that.
    //
    // ASSERTED AS THE PROPERTY, NOT AS A COUNT OF THE WORD (4.18). This pinned
    // `isReconcilable` at exactly three occurrences — one definition, two uses —
    // and 4.18 added a THIRD legitimate caller, the migration survey, which
    // calls the predicate rather than re-deciding. The test failed for a change
    // that was precisely what it wanted. A count is a fact about the file; what
    // matters is that nobody states the conditions themselves.
    const scaffold = readSrc("scaffold");

    // Each condition stated once, inside the predicate.
    expect(scaffold.match(/endsWith\("\.md"\)/g)?.length).toBe(2);

    // And no walk over the shipped notes filters with a predicate of its own.
    expect(/shippedNotes\([^)]*\)\s*\n?\s*\.filter\(\s*\(/.test(scaffold)).toBe(
      false
    );

    // At least the definition and two readers, which is what makes the rule
    // worth stating at all — a predicate with one caller is just a function.
    expect(scaffold.match(/isReconcilable/g)?.length ?? 0).toBeGreaterThanOrEqual(
      3
    );
  });

  it("agrees with every note actually shipped today", () => {
    // The population check, which is the half a synthetic entry cannot make:
    // no real entry is skipped for a reason nobody intended, and none is
    // reconciled that should not be.
    //
    // AND IT FOUND THAT (1) IS ALREADY LIVE. `00 - Infrastructure/Diary.base`
    // is shipped, is not markdown, and was reaching the right answer through
    // the ASSET guard because its asset and destination happen to agree. The
    // destination guard is therefore stating a rule the code already depended
    // on rather than adding one for a file that does not exist yet — which is
    // the opposite of what §6.1 assumed, and the reason to assert the whole
    // population instead of the one entry the change was written for.
    // WITH A JOURNAL IN IT, so the population includes the per-journal
    // dashboards 4.36 adds. Passing `[]` here would make the whole assertion
    // vacuous about the newest entries in the list — which is exactly the shape
    // of hole `shippedNotes`' required parameter exists to close, so this test
    // must not reintroduce it on the test side.
    const shipped = shippedNotes(DEFAULT_PATHS, [STUDY_JOURNAL], []);
    for (const note of shipped) {
      const want =
        note.dest.endsWith(".md") &&
        (note.asset == null || note.asset.endsWith(".md")) &&
        !note.template;
      expect(isReconcilable(note), note.dest).toBe(want);
    }
    // Non-vacuous on both sides: something is reconciled, something is not.
    expect(shipped.filter(isReconcilable).length).toBeGreaterThan(0);
    expect(shipped.filter((n) => !isReconcilable(n)).length).toBeGreaterThan(0);
    // And the non-markdown destination is real rather than hypothetical.
    expect(shipped.some((n) => !n.dest.endsWith(".md"))).toBe(true);
  });
});
