// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import { studyFile, studyTemplate } from "./study-template";

import { journalChartRefusal, isChartable, chartableType } from "../src/charts/charts";
import {
  TrackerDef,
  TrackerSurface,
  describeSurface,
  diarySurface,
  journalSurface,
} from "../src/trackers/trackers";
import { scopesFor } from "../src/charts/charts";
import { STUDY_JOURNAL } from "../src/journals/journal";
import { buildJournalType } from "../src/journals/custom-journal";
import { chartableJournalTrackers, scopeNote } from "../src/charts/journal-chart-ui";
import {
  JournalChartSpec,
  cleanLabel,
  journalChartDirective,
  nextJournalChartKey,
  parseJournalChartRegion,
  serializeJournalChartSpec,
  spliceJournalChartRegion,
} from "../src/charts/journal-charts";

import { fnBody, readSrc } from "./sources";
const NAMES: Record<string, string> = { study: "Study", cooking: "Cooking" };
const name = (s: TrackerSurface): string =>
  describeSurface(s, (id) => NAMES[id]);

function tracker(over: Partial<TrackerDef> = {}): TrackerDef {
  return {
    id: "confidence",
    label: "Confidence",
    type: "scale",
    surface: journalSurface(null),
    showInTemplate: false,
    showInBase: false,
    ...over,
  } as TrackerDef;
}

const refuse = (
  def: TrackerDef | undefined,
  id: string,
  hostTypeId: string | null,
  hostTypeName?: string
): string | null => journalChartRefusal(def, id, hostTypeId, name, hostTypeName);

describe("journal-chart: what it will draw", () => {
  it("draws a journal tracker on a note of a type it covers", () => {
    expect(refuse(tracker(), "confidence", "study", "Study")).toBeNull();
  });

  it("draws a type-scoped tracker on a note of that type", () => {
    expect(
      refuse(
        tracker({ id: "difficulty", label: "Difficulty", surface: journalSurface("cooking") }),
        "difficulty",
        "cooking",
        "Cooking"
      )
    ).toBeNull();
  });

  it("draws any numeric tracker type", () => {
    for (const type of ["number", "time", "scale", "boolean"] as const) {
      expect(refuse(tracker({ type }), "confidence", "study")).toBeNull();
    }
  });
});

describe("journal-chart: what it refuses, and why", () => {
  it("asks for a tracker id when given none", () => {
    expect(refuse(undefined, "", "study")).toMatch(/needs a tracker id/);
  });

  it("names an unknown tracker rather than drawing nothing", () => {
    expect(refuse(undefined, "pages-read", "study")).toContain('"pages-read"');
  });

  it("refuses a non-numeric tracker", () => {
    // A select's arbitrary strings and a bare date aren't a magnitude. Same
    // rule the chart system applies; only the scope half differs.
    for (const type of ["select", "date"] as const) {
      expect(refuse(tracker({ type }), "confidence", "study")).toMatch(
        /isn't a numeric tracker/
      );
    }
  });

  it("refuses a diary tracker, and says where its readings are", () => {
    // Folder-scoping a daily tracker to a journal note draws an empty chart
    // that looks broken rather than wrong.
    const out = refuse(
      tracker({ id: "mood", label: "Mood", surface: diarySurface("daily") }),
      "mood",
      "study",
      "Study"
    );
    expect(out).toMatch(/live in the diary/);
  });

  it("refuses another journal type's tracker, naming both", () => {
    const out = refuse(
      tracker({ id: "difficulty", label: "Difficulty", surface: journalSurface("cooking") }),
      "difficulty",
      "study",
      "Study"
    );
    expect(out).toContain("Cooking");
    expect(out).toContain("Study");
  });

  it("stays permissive on an unclassified note", () => {
    // A dashboard outside every journal root is a place we don't know enough
    // about to refuse — the same rule directiveAllowedOn applies.
    expect(
      refuse(
        tracker({ surface: journalSurface("cooking") }),
        "confidence",
        null
      )
    ).toBeNull();
  });
});

describe("the chart-system gate is untouched", () => {
  // The roadmap's standing constraint: `isChartable` says "not chartable
  // through the chart system", and that stays true. This widget is not the
  // chart system — it has the host note, which is the whole difference.
  const journal = tracker();

  it("still refuses a journal tracker to the chart system", () => {
    expect(isChartable(journal)).toBe(false);
    expect(scopesFor(journal)).toEqual([]);
  });

  it("draws it here anyway, on the value-type half alone", () => {
    expect(chartableType(journal)).toBe(true);
    expect(refuse(journal, "confidence", "study")).toBeNull();
  });

  it("does not consult scopesFor", () => {
    const charts = readSrc("charts");
    const fn = charts.slice(
      charts.indexOf("export function journalChartRefusal"),
      charts.indexOf("// A tracker whose value axis can pair")
    );
    expect(fn).toContain("chartableType(def)");
    expect(fn).not.toContain("scopesFor");
    expect(fn).not.toContain("isChartable");
  });
});

describe("journal-chart widget registration", () => {
  const widgets = readSrc("widgets");
  // Was a slice between two case labels, back when the case body held the
  // implementation. The body moved to ./directive-regions.ts in 2.56.25 and
  // the case became a one-line delegation, which made that slice empty — and
  // an empty slice makes every `toContain` below fail for the wrong reason.
  const block =
    fnBody("buildJournalChartRegion") +
    widgets.slice(
      widgets.indexOf('case "confidence-trend":'),
      widgets.indexOf('case "review-queue":')
    );

  it("is registered as a composite kind", () => {
    const composites = widgets.slice(
      widgets.indexOf("const INLINE_KINDS"),
      widgets.indexOf("]", widgets.indexOf("const INLINE_KINDS"))
    );
    expect(composites).not.toContain('"journal-chart"');
    expect(composites).not.toContain('"confidence-trend"');
  });

  it("keeps confidence-trend as a preset spelling of the same case", () => {
    // A directive is content in someone's markdown. The old spelling keeps
    // working rather than turning every shipped Topic note's chart into an
    // "Unknown widget" line — the same rule `study-header` got in 2.28.
    expect(block).toContain('case "journal-chart":');
    expect(block).toContain('kind === "confidence-trend"');
  });

  it("resolves the preset's property through the registry", () => {
    expect(block).toContain('getBuiltinTracker(plugin, "confidence")');
  });

  it("scopes to the host note's own folder", () => {
    expect(block).toContain("file.parent.path");
    expect(block).toContain("liveScopedWidget");
  });

  it("stays silent for the preset and speaks up for an explicit request", () => {
    // `confidence-trend` sits in every shipped Topic template, so a vault that
    // rates nothing must not show a refusal on every topic page.
    expect(block).toMatch(/if \(preset\) return null;/);
    expect(block).toContain("journal-widget-error");
  });
});

// ── The charts region (2.35) ─────────────────────────────────────────────
//
// `journal-chart` / `journal-breakdown` as a managed area of a note rather
// than as directives written by hand. The region owns a *list*; the directive
// path still does the drawing, which is what these tests mostly pin.

const spec = (over: Partial<JournalChartSpec> = {}): JournalChartSpec => ({
  key: "j1",
  shape: "trend",
  tracker: "confidence",
  ...over,
});

describe("what a stored chart means", () => {
  it("stands for the directive it would have been written as", () => {
    // The whole reason the region renders nothing itself: a spec is a managed
    // way of writing a line that already had a meaning.
    expect(journalChartDirective(spec())).toBe("journal-chart:confidence");
    expect(journalChartDirective(spec({ shape: "breakdown" }))).toBe(
      "journal-breakdown:confidence"
    );
    expect(
      journalChartDirective(spec({ shape: "breakdown", label: "Weakest topics" }))
    ).toBe("journal-breakdown:confidence|Weakest topics");
  });

  it("never writes a bar with nothing after it", () => {
    // Correctness, not tidiness. The widget parser reads everything after the
    // first bar as the label, so a trailing bar yields "" where an absent bar
    // yields null — and the two are read differently downstream.
    for (const shape of ["trend", "breakdown"] as const) {
      for (const label of ["", "   ", "\n", "``"]) {
        expect(journalChartDirective(spec({ shape, label }))).not.toContain("|");
        expect(serializeJournalChartSpec(spec({ shape, label }))).not.toContain("|");
      }
    }
  });

  it("keeps a title on one line, and out of the fence's way", () => {
    expect(cleanLabel("  Weakest\ntopics  ")).toBe("Weakest topics");
    expect(cleanLabel("How ```hard```")).toBe("How hard");
  });

  it("round-trips through its stored form", () => {
    for (const s of [
      spec(),
      spec({ key: "j7", shape: "breakdown", label: "Weakest topics" }),
      spec({ tracker: "pages:read" }),
    ]) {
      expect(parseJournalChartRegion([
        "```almanac-journal-charts",
        serializeJournalChartSpec(s),
        "```",
      ])).toEqual([s]);
    }
  });

  it("keeps parsing a tracker id containing a colon", () => {
    // The shape is anchored to its known set, which bounds the greedy id on
    // the left; the id is the last positional token, so nothing bounds it on
    // the right and nothing needs to.
    expect(parseJournalChartRegion([
      "```almanac-journal-charts",
      "jchart:j1:breakdown:a:b:c|Odd",
      "```",
    ])).toEqual([{ key: "j1", shape: "breakdown", tracker: "a:b:c", label: "Odd" }]);
  });
});

describe("reading the region", () => {
  const fence = (...body: string[]): string[] => [
    "# Topic",
    "",
    "```almanac-journal-charts",
    ...body,
    "```",
    "",
    "prose after",
  ];

  it("ignores the header line and anything else the reader keeps", () => {
    expect(
      parseJournalChartRegion(
        fence("header:📊 Charts", "", "jchart:j1:trend:confidence", "# a note")
      )
    ).toEqual([spec()]);
  });

  it("finds nothing on a note with no region", () => {
    expect(parseJournalChartRegion(["# Topic", "prose"])).toEqual([]);
  });

  it("does not read the diary's chart region as its own", () => {
    // The two fences are separate on purpose; a `chart:` line is not a
    // `jchart:` one and neither parser should ever see the other's.
    expect(
      parseJournalChartRegion([
        "```almanac-charts",
        "chart:c1:Mood:line:30",
        "```",
      ])
    ).toEqual([]);
  });

  it("allocates the smallest unused key", () => {
    expect(nextJournalChartKey([])).toBe("j1");
    expect(nextJournalChartKey([spec()])).toBe("j2");
    expect(nextJournalChartKey([spec(), spec({ key: "j3" })])).toBe("j2");
  });
});

describe("writing the region", () => {
  const note = [
    "---",
    "type: topic",
    "---",
    "```almanac",
    "review-queue",
    "```",
    "",
    "```almanac-journal-charts",
    "header:📊 Charts",
    "jchart:j1:trend:confidence",
    "```",
    "",
    "## Notes of my own",
  ];

  it("rewrites only the jchart lines", () => {
    const out = spliceJournalChartRegion(note, [
      spec(),
      spec({ key: "j2", shape: "breakdown", label: "Weakest" }),
    ]);
    expect(out).not.toBeNull();
    expect(out!.join("\n")).toContain("jchart:j2:breakdown:confidence|Weakest");
    // Everything outside the fence is the reader's.
    expect(out![0]).toBe("---");
    expect(out![4]).toBe("review-queue");
    expect(out![out!.length - 1]).toBe("## Notes of my own");
  });

  it("preserves a retitled header rather than restoring the shipped one", () => {
    // A rewrite that helpfully put "📊 Charts" back every time would be the
    // plugin arguing with the reader.
    const mine = note.map((l) => (l === "header:📊 Charts" ? "header:📉 Mine" : l));
    expect(spliceJournalChartRegion(mine, [spec()])!.join("\n")).toContain(
      "header:📉 Mine"
    );
  });

  it("empties cleanly, leaving a section to add into", () => {
    const out = spliceJournalChartRegion(note, [])!;
    expect(out.join("\n")).not.toContain("jchart:");
    expect(out.join("\n")).toContain("```almanac-journal-charts");
    expect(parseJournalChartRegion(out)).toEqual([]);
  });

  it("refuses a note with no region rather than inventing one", () => {
    expect(spliceJournalChartRegion(["# Topic"], [spec()])).toBeNull();
  });

  it("is idempotent", () => {
    const once = spliceJournalChartRegion(note, [spec()])!;
    expect(spliceJournalChartRegion(once, [spec()])).toEqual(once);
  });
});

describe("what the editor will offer", () => {
  const trackers = [
    tracker(),
    tracker({ id: "mood", label: "Mood", surface: diarySurface("daily") }),
    tracker({ id: "status", label: "Status", type: "select" }),
    tracker({
      id: "difficulty",
      label: "Difficulty",
      surface: journalSurface("cooking"),
    }),
  ];

  it("offers only what the widget would draw", () => {
    expect(chartableJournalTrackers(trackers, "study", name).map((t) => t.id)).toEqual([
      "confidence",
    ]);
    expect(chartableJournalTrackers(trackers, "cooking", name).map((t) => t.id)).toEqual(
      ["confidence", "difficulty"]
    );
  });

  it("cannot save a chart that refuses", () => {
    for (const typeId of ["study", "cooking", null]) {
      for (const def of chartableJournalTrackers(trackers, typeId, name)) {
        expect(refuse(def, def.id, typeId)).toBeNull();
      }
    }
  });

  it("asks the refusal rather than restating it", () => {
    const src = readSrc("journal-chart-ui");
    expect(src).toContain("journalChartRefusal");
    // The rule is stated once, in charts.ts. A second copy here is how the two
    // drift, and the drift shows up as an option that saves a broken chart.
    expect(src).not.toContain("chartableType(");
    expect(src).not.toContain("isJournalSurface(");
  });
});

describe("what the editor says it will read", () => {
  const flat = buildJournalType({
    id: "cooking",
    name: "Cooking",
    emoji: "🍳",
    root: "03 - Journals/Cooking",
    templatesFolder: "T/Cooking",
    levels: [{ noun: "Section", fallbackEmoji: "📂" }],
    kinds: [{ id: "recipe", emoji: "🍲", label: "Recipe" }],
  });

  it("names the host type's own levels, not Study's", () => {
    const note = scopeNote(flat, "breakdown");
    expect(note).toContain("Section");
    expect(note).not.toContain("Topic");
    expect(note).not.toContain("Subject");
  });

  it("tells a two-level journal what each level gives it", () => {
    const note = scopeNote(STUDY_JOURNAL, "breakdown");
    expect(note).toContain("Subject");
    expect(note).toContain("topic");
  });

  it("says a flat journal ranks notes, since it has no sub-folders", () => {
    expect(scopeNote(flat, "breakdown")).toMatch(/rated notes/);
  });

  it("still says something on a note outside every journal", () => {
    expect(scopeNote(null, "trend").length).toBeGreaterThan(0);
  });
});

describe("how the region is wired up", () => {
  const widgets = readSrc("widgets");
  const main = readSrc("main");

  it("registers its own fence, separate from the diary's", () => {
    expect(widgets).toContain('"almanac-journal-charts"');
    expect(widgets).toContain('"almanac-charts"');
  });

  it("draws each chart through the ordinary directive path", () => {
    // The point of the region: it manages a list and renders nothing, so a
    // chart added here and one written by hand are the same object taking the
    // same refusal. A second renderer here is the thing to catch.
    const block = widgets.slice(
      widgets.indexOf("private buildJournalChartStack"),
      widgets.indexOf("// One chart tile:")
    );
    expect(block).toContain("this.buildFromSpec(journalChartDirective(spec), ctx)");
    expect(block).not.toContain("renderJournalTrend");
    expect(block).not.toContain("buildJournalBreakdown");
  });

  it("routes its toolbar to its own manager", () => {
    // `this.plugin` while the button builder sat on the Widgets class,
    // `deps.plugin` since it moved to ./button-widgets.ts. What is being
    // asserted is the MANAGER — journalCharts, not the diary charts manager —
    // and that is what the two forms have in common.
    for (const op of ["addChart", "editChart", "removeChart"]) {
      expect(widgets).toMatch(
        new RegExp(`(?:this|deps)\\.plugin\\.journalCharts\\.${op}`)
      );
    }
  });

  it("is reached from the note, not from the ribbon", () => {
    // Charting is note-scoped now: the region is the entry point, and the
    // host note is what makes the refusal answerable in the first place.
    expect(main).not.toContain("Chart manager");
    expect(main).not.toContain("open-chart-manager");
  });
});

describe("the shipped index templates carry a region", () => {
  const read = studyFile;

  it("gives a subject index both readings of confidence", () => {
    const t = studyTemplate("Subject Index.md");
    expect(t).toContain("```almanac-journal-charts");
    expect(parseJournalChartRegion(t.split("\n")).map((s) => s.shape)).toEqual([
      "trend",
      "breakdown",
    ]);
  });

  it("gives a topic index the trend it always had", () => {
    // The shipped default doesn't change by moving into the region — a fresh
    // Topic note still opens with a confidence trend on it.
    const t = studyTemplate("Topic Index.md");
    expect(parseJournalChartRegion(t.split("\n"))).toEqual([
      { key: "j1", shape: "trend", tracker: "confidence" },
    ]);
  });

  it("allocates keys the manager would agree with", () => {
    for (const f of ["Subject Index.md", "Topic Index.md"]) {
      const specs = parseJournalChartRegion(read(f).split("\n"));
      expect(new Set(specs.map((s) => s.key)).size).toBe(specs.length);
      expect(nextJournalChartKey(specs)).toBe(`j${specs.length + 1}`);
    }
  });
});
