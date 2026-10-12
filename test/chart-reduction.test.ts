// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// One field, two meanings, and the one that was unreachable — 1.0.57.
//
// THE QUESTION THAT STARTED IT was a reader's: *"is the chart by month option
// really necessary? It seems confusing for users"*. It was worse than
// confusing. `TrackerDef.reduce` had two readers — `daily-by-month` bucketing
// on a chart, and `journal-totals`' "does this quantity add up" — and one
// control on the tracker's "How it behaves" step, labelled *chart by month:
// average / total*, setting both. It therefore named the meaning nobody could
// use and described the one that worked not at all:
//
//   • the chart meaning was UNREACHABLE, because `ChartEditor.reconcile`
//     persisted `"monthly"` and deleted every other non-default scope — from
//     inside the scope dropdown's own `onChange`, so picking "Daily entries, by
//     month" undid itself in the same keystroke;
//   • the journal meaning was the one that worked, and the control did not
//     mention journals, totals or bands.
//
// So the readers split. The chart carries its own reduction (`+sum` on the
// directive), the tracker keeps the journal one alone under the name it has on
// screen (*Readings add up*), and the scope can be chosen. Three defects, and
// `reconcile`'s is two: a weekly or quarterly chart opened in the editor had
// its scope token deleted on save as well, and only `renderTrackerChart`'s
// charitable fallback kept it drawing the right folder afterwards.
//
// WHAT IS ASSERTED HOW. The grammar and the editor's draft are run — a modal
// constructs without a DOM, which is what `ChartProbe` in wizard-steps.test.ts
// established. The drawing and the two moved controls are source-shape
// assertions, because there is no DOM in this suite.

import { describe, expect, it } from "vitest";

import { ChartEditModal } from "../src/charts/chart-ui";
import { parseChartDirectives, serializeChartSpec } from "../src/charts/charts";
import type { ChartSpec } from "../src/charts/charts";
import { diarySurface } from "../src/trackers/trackers";
import type { TrackerClass, TrackerDef } from "../src/trackers/trackers";
import type ChronoAnvilPlugin from "../src/main";
import { allSrcNames, readCode, readSrc } from "./sources";

// ── the grammar ───────────────────────────────────────────────────────────

const parse = (line: string): ChartSpec | undefined => parseChartDirectives([line])[0];

describe("a chart's own reduction, on the directive", () => {
  it("reads `+sum` as the total of a month's days", () => {
    expect(parse("chart:c1:Distance:line:365:daily-by-month+sum")?.reduce).toBe("sum");
  });

  it("reads its absence as the mean, and stores no answer at all", () => {
    // Absence IS the default, not a stored "mean" — the rule `scope` and
    // `size` already follow, and what keeps every directive written before
    // 1.0.57 byte-identical.
    expect(parse("chart:c1:Sleep:line:365:daily-by-month")?.reduce).toBeUndefined();
  });

  it("writes `+sum` and writes nothing for a mean", () => {
    const base: ChartSpec = {
      key: "c1",
      tracker: "Distance",
      type: "line",
      range: "365",
      scope: "daily-by-month",
    };
    expect(serializeChartSpec({ ...base, reduce: "sum" })).toBe(
      "chart:c1:Distance:line:365:daily-by-month+sum"
    );
    expect(serializeChartSpec({ ...base, reduce: "mean" })).toBe(
      "chart:c1:Distance:line:365:daily-by-month"
    );
    expect(serializeChartSpec(base)).toBe("chart:c1:Distance:line:365:daily-by-month");
  });

  it("round-trips beside every other token, in a fixed order", () => {
    const line =
      "chart:c3:Distance:line:365:daily-by-month+y=Mood+avg+sum+size=large|Both";
    const spec = parse(line);
    expect(spec).toMatchObject({
      key: "c3",
      tracker: "Distance",
      type: "line",
      range: "365",
      scope: "daily-by-month",
      tracker2: "Mood",
      avg: true,
      reduce: "sum",
      size: "large",
      title: "Both",
    });
    expect(serializeChartSpec(spec as ChartSpec)).toBe(line);
  });

  it("takes the tokens in any order and writes them in one", () => {
    expect(
      serializeChartSpec(
        parse("chart:c1:Distance:line:365:daily-by-month+size=wide+sum+avg") as ChartSpec
      )
    ).toBe("chart:c1:Distance:line:365:daily-by-month+avg+sum+size=wide");
  });

  it("drops an unknown reduction token rather than losing the chart", () => {
    // `+mean` is not a token — absence says mean — and a reader who writes one
    // should get their chart, the way a typo'd `+size=huge` keeps its chart and
    // loses only the size. An unrecognised SCOPE is the one that drops a line,
    // because it names where the data comes from.
    const spec = parse("chart:c1:Sleep:line:365:daily-by-month+mean");
    expect(spec?.tracker).toBe("Sleep");
    expect(spec?.reduce).toBeUndefined();
  });

  it("does not read `sum` out of a title", () => {
    // The bar is what makes the first `|` the delimiter, so everything after it
    // is the reader's words — `+sum` among them.
    const spec = parse("chart:c1:Mood:line:30|summer, and +sum");
    expect(spec?.title).toBe("summer, and +sum");
    expect(spec?.reduce).toBeUndefined();
  });
});

// ── the editor, which can now reach the scope ─────────────────────────────

const tracker = (over: Partial<TrackerDef> = {}): TrackerDef => ({
  id: "Sleep",
  label: "🛌 Sleep",
  type: "number",
  surface: diarySurface("daily"),
  showInTemplate: true,
  showInBase: true,
  ...over,
});

const plugin = (trackers: TrackerDef[]) =>
  ({
    settings: {
      trackers,
      moodTrackerId: "Mood",
      customJournals: [],
      studyEnabled: true,
      paths: { journalsRoot: "03 - Journals", templates: "05 - Templates" },
    },
  }) as unknown as ChronoAnvilPlugin;

class ChartProbe extends ChartEditModal {
  draftNow(): ChartSpec {
    return this["draft"] as ChartSpec;
  }
}

const probe = (trackers: TrackerDef[], spec: Partial<ChartSpec>): ChartProbe =>
  new ChartProbe({} as never, plugin(trackers), {
    spec: { key: "k", ...spec } as ChartSpec,
    onSave: async () => {},
  });

const sleep = tracker();
const distance = tracker({ id: "Distance", label: "📏 Distance" });

describe("the scope a reader could not choose", () => {
  it("keeps `daily-by-month` on the draft", () => {
    // THE DEFECT, STATED. This came back `undefined` before 1.0.57: reconcile
    // ran from the dropdown's own onChange and deleted anything that was not
    // "monthly", so the option reverted the instant it was picked.
    const p = probe([sleep], {
      tracker: "Sleep",
      type: "line",
      range: "365",
      scope: "daily-by-month",
    });
    expect(p.draftNow().scope).toBe("daily-by-month");
  });

  it("keeps the other four grains too, which the same line deleted", () => {
    // The second half of the same defect, and quieter: a weekly chart opened in
    // the editor lost its scope token on save and only drew the right folder
    // afterwards because renderTrackerChart reads a stale scope charitably.
    for (const cls of ["weekly", "monthly", "quarterly", "yearly"] as TrackerClass[]) {
      const def = tracker({ id: "Grain", surface: diarySurface(cls) });
      const p = probe([def], {
        tracker: "Grain",
        type: "line",
        range: "all",
        scope: cls,
      });
      expect(p.draftNow().scope, cls).toBe(cls);
    }
  });

  it("still stores no token for the default", () => {
    const p = probe([sleep], {
      tracker: "Sleep",
      type: "line",
      range: "365",
      scope: "daily",
    });
    expect(p.draftNow().scope).toBeUndefined();
  });

  it("falls back to a scope the tracker has when the directive names one it does not", () => {
    // reconcile's original job, unchanged: a chart written while a tracker was
    // monthly, on a tracker since made daily.
    const p = probe([sleep], {
      tracker: "Sleep",
      type: "line",
      range: "365",
      scope: "monthly",
    });
    expect(p.draftNow().scope).toBeUndefined();
  });
});

describe("a reduction belongs to the scope that buckets", () => {
  it("keeps `sum` on a by-month chart", () => {
    const p = probe([distance], {
      tracker: "Distance",
      type: "line",
      range: "365",
      scope: "daily-by-month",
      reduce: "sum",
    });
    expect(p.draftNow().reduce).toBe("sum");
  });

  it("drops it when the scope does not bucket", () => {
    // So daily → by-month → daily does not leave `+sum` on a directive whose
    // renderer ignores it — the discipline `tracker2` and `avg` follow.
    const p = probe([distance], {
      tracker: "Distance",
      type: "line",
      range: "365",
      scope: "daily",
      reduce: "sum",
    });
    expect(p.draftNow().reduce).toBeUndefined();
  });

  it("drops it on a grain that has no by-month form", () => {
    const def = tracker({ id: "Grain", surface: diarySurface("weekly") });
    const p = probe([def], {
      tracker: "Grain",
      type: "line",
      range: "all",
      scope: "weekly",
      reduce: "sum",
    });
    expect(p.draftNow().reduce).toBeUndefined();
  });

  it("carries the field into the draft at all", () => {
    // The field-by-field copy in the constructor is the shape that silently
    // drops a new ChartSpec field on every save; chart-series.test.ts asserts
    // the list is complete, and this is the same claim from the other end.
    expect(readSrc("chart-ui")).toContain("reduce: opts.spec.reduce");
  });
});

describe("the control that asks it", () => {
  const code = readCode("chart-ui");

  it("is drawn only where a month is a point", () => {
    expect(code).toContain('if (scope === "daily-by-month") {');
    expect(code).toContain('.setName("A month\'s point is")');
  });

  it("sits beside the control that summons it, not on the drawing step", () => {
    // A field that does not exist until another answer brings it into being
    // belongs where that answer is — the rule the second tracker's dropdown
    // states on the next step. "Read values from" is what offers the scope.
    const subject = code.slice(
      code.indexOf("private renderSubject"),
      code.indexOf("private validateSubject")
    );
    expect(subject).toContain('.setName("A month\'s point is")');
    expect(subject).toContain('.setName("Read values from")');
    expect(subject.indexOf('.setName("Read values from")')).toBeLessThan(
      subject.indexOf('.setName("A month\'s point is")')
    );
  });

  it("names both answers rather than toggling one", () => {
    // Either answer draws a plausible chart and only one is right, so a reader
    // scanning the form has to be able to see which they picked.
    expect(code).toContain('d.addOption("mean", "the average of its days")');
    expect(code).toContain('d.addOption("sum", "the total of its days")');
  });

  it("stores the default as absence", () => {
    expect(code).toContain('if (v === "sum") this.draft.reduce = "sum";');
    expect(code).toContain("else delete this.draft.reduce;");
  });

  it("names each grain rather than calling four of them daily", () => {
    // The statement branch below the dropdown read `scopes[0] === "monthly"`
    // and called everything else daily, which told a weekly tracker in so many
    // words that it is a daily one.
    expect(code).toContain("SCOPE_LABELS[only]");
    expect(code).not.toContain("this is a daily tracker");
  });
});

// ── the tracker's half: one meaning, on the step that knows the surface ───

describe("the tracker field stopped speaking for charts", () => {
  const code = readCode("settings-editors");

  it("has no chart-by-month control anywhere", () => {
    expect(code).not.toContain("chart by month");
    expect(code).not.toContain("monthly reduction");
  });

  it("asks nothing about reductions on the step before the surface is known", () => {
    const behaviour = code.slice(
      code.indexOf("private renderBehaviour"),
      code.indexOf("private renderPlacement")
    );
    expect(behaviour).not.toContain("reduce");
  });

  it("promises nothing about charts in that step's subtitle", () => {
    expect(code).not.toContain("collapse into one point on a chart");
  });

  it("asks it on the placement step instead, in the journal branch", () => {
    const placement = code.slice(code.indexOf("private renderPlacement"));
    const journal = placement.slice(
      placement.indexOf('if (t.surface.kind === "journal") {'),
      placement.indexOf("this.renderPlacementSchematic(host);")
    );
    expect(journal).toContain('.setName("Readings add up")');
    expect(journal).toContain('t.reduce = v ? "sum" : undefined;');
  });

  it("asks it of a number only, which is the band's own gate", () => {
    const placement = code.slice(code.indexOf("private renderPlacement"));
    const journal = placement.slice(
      placement.indexOf('if (t.surface.kind === "journal") {'),
      placement.indexOf("this.renderPlacementSchematic(host);")
    );
    // A total of Intensity readings is a number with no meaning — five
    // workouts at 4/5 do not make 20 of anything.
    expect(journal).toContain('if (t.type === "number") {');
    expect(
      journal.indexOf('if (t.type === "number") {')
    ).toBeLessThan(journal.indexOf('.setName("Readings add up")'));
  });

  it("is reachable for a journal tracker and not for a diary one", () => {
    // The gate is the surface, which is the answer above the control on the
    // same step — asserted through the branch rather than through a DOM.
    const placement = code.slice(code.indexOf("private renderPlacement"));
    const afterJournal = placement.slice(
      placement.indexOf("this.renderPlacementSchematic(host);")
    );
    expect(afterJournal).not.toContain("Readings add up");
    // And the journal branch returns, so the diary controls below are the only
    // other half.
    expect(placement).toContain("this.renderPlacementSchematic(host);\n      return;");
  });
});

// ── the drawing reads the chart, not the tracker ──────────────────────────

describe("what buckets a month", () => {
  const render = readSrc("chart-render");

  it("passes the collector's own argument through, not the tracker's field", () => {
    expect(render).toContain('scope === "daily-by-month" ? bucketByMonth(out, reduce)');
    expect(readCode("chart-render")).not.toContain("def.reduce");
  });

  it("takes the reduction as the last parameter of the collector", () => {
    expect(render).toContain("reduce?: ChartReduce\n): ChartPoint[] {");
  });

  it("is handed the directive's answer by the tile that draws it", () => {
    expect(readSrc("chart-widgets")).toContain("reduce: spec.reduce,");
  });
});

describe("nothing else reads a tracker's reduction for a chart", () => {
  it("leaves two modules touching TrackerDef.reduce, and the chart path is neither", () => {
    // THE SWEEP THAT MAKES THE SPLIT STICK, and the whole tree is swept because
    // the thing being prevented is a THIRD reader quietly appearing — which is
    // how the field came to mean two things in the first place.
    //
    // `t`/`def`/`tracker` are what a TrackerDef is called here; a ChartSpec's
    // own field is `spec.reduce` or `this.draft.reduce` and is not this
    // question. Comment-stripped, so the paragraphs explaining the split do not
    // register as uses of it.
    const offenders = allSrcNames()
      .filter((name) => /\b(?:t|def|tracker)\.reduce\b/.test(readCode(name)))
      .sort();
    expect(offenders).toEqual([
      // the one control that sets it, on the step that knows the surface
      "settings-editors",
      // and `summableTrackers` — does this quantity add up
      "tables",
    ]);
  });
});
