// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// 3.8 patches 1–3: the diary has five grains, and three of them were invisible.
//
// THE TESTS WALK `TRACKER_CLASSES` RATHER THAN LISTING WHAT THEY EXPECT, and
// that is the whole point of the file. The defect these patches fix is not that
// someone wrote the wrong two grains — `daily` and `monthly` were correct when
// they were written. It is that a listing survives the thing it lists growing.
// A test that asserted `["daily", "monthly"]` would have passed every day
// between 2.57.12 and now, and would pass again the day a sixth grain arrives.
//
// So every assertion here is of the form "for every grain the class table
// knows", and the class table is the one place a grain is added.

import { describe, expect, it } from "vitest";
import { readCode, readCss, readSrc } from "./sources";
import { CLASS_DEFS, TRACKER_CLASSES } from "../src/trackers/trackers";
import { diaryKindOf } from "../src/diary/diary-index";

describe("patch 1: a diary entry of any grain is indexed as one", () => {
  it("names its own grain rather than falling through to daily", () => {
    // The ternary this replaced read: "monthly" if `journal` said Monthly
    // Entry, else "daily". So `is:weekly` matched nothing, and every consumer
    // filtering `kind === "daily"` counted weekly, quarterly and yearly notes
    // as days.
    for (const grain of TRACKER_CLASSES) {
      expect(
        diaryKindOf({ journal: CLASS_DEFS[grain].journalProperty }),
        grain
      ).toBe(grain);
    }
  });

  it("and still reads an entry with no `journal:` line as a daily one", () => {
    // The charitable default `entryContext` also takes. What changed is that it
    // is reached when nothing matches instead of on four grains out of five.
    expect(diaryKindOf({})).toBe("daily");
    expect(diaryKindOf({ journal: "Something Else" })).toBe("daily");
  });

  it("resolves a date from the grain's own property, not just journal-date", () => {
    // WHY THREE GRAINS WERE MISSING ENTIRELY rather than merely mislabelled.
    // `DIARY_SPEC` sets `dateKey: "journal-date"` and `requireDate: true`, and
    // a weekly template writes `week-start:` and no `journal-date:` at all — so
    // `buildIndexed` returned null and the note was never indexed by anything.
    const src = readCode("diary-index");
    expect(src).toContain("diaryFallbackIso(fm, spec)");
    const at = src.indexOf("function diaryFallbackIso(");
    expect(at).toBeGreaterThan(0);
    expect(src.slice(at, src.indexOf("\n}", at))).toContain("def.dateProperty");
  });

  it("and the index scans every entry folder the class table names", () => {
    const src = readCode("diary-index");
    const at = src.indexOf("export async function readIndex(");
    const body = src.slice(at, src.indexOf("\n}", at));
    expect(body).toContain("TRACKER_CLASSES.map");
    expect(body).toContain("CLASS_DEFS[g].folderKey");
    // The two literals it replaced. Either one surviving means one grain is
    // still being read from a hand-written list.
    expect(body).not.toContain("paths.diaryDaily");
    expect(body).not.toContain("paths.diaryMonthly");
  });

  it("and a bridge can name all five as a target", () => {
    const src = readCode("bridge-widgets");
    const at = src.indexOf('if (target === "diary")');
    expect(at).toBeGreaterThan(0);
    const branch = src.slice(at, src.indexOf("  }", at));
    expect(branch).toContain("TRACKER_CLASSES.map");
    expect(branch).not.toContain('id: "daily"');
    expect(branch).not.toContain('id: "monthly"');
  });

  it("and every grain's label is one a reader would recognise", () => {
    // The catalogue prints these in a refusal — "no note type called X; try
    // one of…" — so a label that reads like an id makes the refusal useless.
    for (const grain of TRACKER_CLASSES) {
      expect(`${CLASS_DEFS[grain].label} entry`, grain).toMatch(/^[A-Z]\w* entry$/);
    }
  });

  it("and the folders a bridge watches are the folders it reads", () => {
    // Written out twice, verbatim, as the refresh scope of each builder — and
    // stale in the same way. An edit to a weekly entry did not repaint a bridge
    // that had just listed it.
    const src = readCode("bridge-widgets");
    expect(src).toContain("function diaryFolders(");
    expect(src.match(/diaryFolders\(plugin\)/g) ?? []).toHaveLength(2);
    expect(src).not.toContain("plugin.settings.paths.diaryMonthly,");
  });
});

describe("patch 2: a resolved window can be handed to the chart renderer", () => {
  it("is skipped rather than extracted, and the resolver still runs otherwise", () => {
    // 3.6's precedent split `periodStats` out of `renderPeriodStats` because
    // two callers wanted the figures and one wanted the paragraph. Here every
    // caller wants the chart and only the window's origin differs, so the
    // resolver is short-circuited and no existing call site changes shape.
    const src = readCode("chart-render");
    const at = src.indexOf("const win =");
    expect(at).toBeGreaterThan(0);
    const line = src.slice(at, src.indexOf(";", at));
    expect(line).toContain("args.window ??");
    expect(line).toContain("resolveChartWindow(");
  });

  it("and `range`/`period` stay required, so nothing else moved", () => {
    const src = readSrc("chart-render");
    const at = src.indexOf("export interface RenderChartOptions {");
    const iface = src.slice(at, src.indexOf("\n}", at));
    expect(iface).toContain("range: ChartRange;");
    expect(iface).toContain("period: PeriodBounds | null;");
    expect(iface).toContain("window?:");
  });
});

describe("patch 3: the trend is a flag on the directive that already exists", () => {
  const src = () => readCode("bridge-widgets");

  it("adds no directive", () => {
    // 2.57 §4's test for when to split: different store, different directive.
    // A trend and a list of the same readings come out of one `collectPoints`
    // call, so they are one directive.
    const w = readCode("widgets");
    expect(w).toContain('case "bridge-readings":');
    expect(w).not.toContain('case "bridge-trend"');
    expect(w).not.toContain('case "bridge-chart"');
  });

  it("and no grammar — `#` is the suffix the plugin already uses", () => {
    expect(src()).toContain("function readingsFlags(");
    // Stripped before the target is split off, or the tracker is called
    // "Mood#trend" everywhere below.
    expect(src()).toContain("const { rest: spec, trend } = readingsFlags(rest);");
  });

  it("passes the window it was given rather than deriving a second one", () => {
    // The block's header names the period it covers. A renderer that resolved
    // its own could draw a different one under that header.
    const at = src().indexOf("renderTrackerChart({");
    expect(at).toBeGreaterThan(0);
    const call = src().slice(at, src().indexOf("});", at));
    expect(call).toContain("window: { start: plan.window.start, end: plan.window.end }");
    expect(call).toContain("period: null");
  });

  it("and disposes the chart it drew when the widget rebuilds", () => {
    // A chart parented into a LiveWidget's subtree loses its DOM node on the
    // next rebuild and keeps its Chart.js instance, its resize listener and its
    // memory. `onCleanup` is the channel LiveWidget already provides.
    const s = src();
    expect(s).toContain("let teardown: ChartTeardown = null;");
    expect(s).toContain("teardown?.()");
    // Threaded through the shared entry point rather than added to one builder.
    expect(s).toContain("cleanup?: () => void");
    expect(s).toContain("}, cleanup);");
  });

  it("and the canvas is given a height, because nothing above it supplies one", () => {
    // A chart tile takes its height from the grid it is a cell of. A bridge
    // sits in the ordinary flow of a note, and a Chart.js canvas in a
    // zero-height box draws nothing and reports no error.
    const css = readCss();
    const at = css.indexOf(".am-bridge-trend {");
    expect(at).toBeGreaterThan(0);
    expect(css.slice(at, css.indexOf("}", at))).toContain("height:");
  });
});

describe("3.8 patch 10: `dated` is read, not asserted", () => {
  const src = () => readCode("bridge-widgets");

  it("asks each kind's templates instead of claiming they all write a date", () => {
    // The comment this replaced named its own evidence — "its template writes
    // `date`" — and tested nothing. A custom journal's templates are files in
    // the reader's vault; one they edited `date:` out of still came back dated.
    expect(src()).toContain("dated: kindIsDated(plugin, type, k)");
    expect(src()).toContain("JOURNAL_DATE_PROPERTY in fm");
    // The flat literal it replaced, in the kinds walk. `page` still declares
    // `dated: false` outright and should: it is undated by design, not by an
    // edit.
    const at = src().indexOf("registeredJournalTypes(plugin).flatMap");
    expect(src().slice(at, src().indexOf("  );", at))).not.toContain("dated: true");
  });

  it("stays synchronous, because every refusal that reads it is", () => {
    // `planBridge` and every message it writes are sync; `vault.read` is not.
    // The metadata cache is, and a template is an ordinary note whose
    // frontmatter Obsidian has already parsed.
    const at = src().indexOf("function kindIsDated(");
    const fn = src().slice(at, src().indexOf("\n}", at));
    expect(src().slice(at - 40, at)).not.toContain("async");
    expect(fn).toContain("metadataCache.getFileCache");
    expect(fn).not.toContain("await");
  });

  it("and a missing template is dated, so it fails as the fault it is", () => {
    // `readTemplate` failing means "run Set up / repair vault", which has its
    // own message. Answering false would hide a missing file behind a bridge
    // refusal that blamed the note type instead.
    const at = src().indexOf("function kindIsDated(");
    expect(src().slice(at, src().indexOf("\n}", at))).toContain("return !sawTemplate;");
  });

  it("and the property is named once, for the two readers that agree about it", () => {
    // `readJournalIndex` uses it as its `dateKey` and this now reads it off a
    // template. One question, so one literal.
    expect(readCode("constants")).toContain('JOURNAL_DATE_PROPERTY = "date"');
    expect(readCode("diary-index")).toContain("dateKey: JOURNAL_DATE_PROPERTY");
    expect(readCode("diary-index")).not.toContain('dateKey: "date"');
  });
});
