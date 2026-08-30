// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// THE TWO WIDGETS 4.35 SHIPS, AND THE REFUSAL SPLIT THAT MADE ONE POSSIBLE.
// 4.35 §3.
//
// `journalChartRefusal` could not be reused for a tally: its second check is
// `chartableType`, which refuses `select` BY DESIGN — and a select is precisely
// what a tally requires. So the two shared arms were split out ABOVE it and the
// chart's refusal recomposed from them with its own arm between.
//
// THE DIRECTION OF THE SPLIT IS THE ARGUMENT. Teaching `journalChartRefusal` a
// second mode would have meant editing the function every existing assertion
// runs through; splitting underneath it means `test/journal-chart.test.ts`
// passes UNEDITED. That file's continued health is a requirement of this
// release, stated in advance rather than observed afterwards.

import { describe, expect, it } from "vitest";
import {
  journalChartRefusal,
  journalSurfaceRefusal,
  journalTallyRefusal,
  trackerMissingRefusal,
} from "../src/charts/charts";
import { summableTrackers } from "../src/ui/tables";
import type { TrackerDef, TrackerSurface } from "../src/trackers/trackers";
import { buildJournalType } from "../src/journals/journal";
import { EXERCISE_PRESET } from "../src/journals/journal";
import type ChronoAnvilPlugin from "../src/main";

const surfaceName = (s: TrackerSurface): string =>
  s.kind === "journal" ? (s.typeId ?? "journal") : "diary";

const tracker = (over: Partial<TrackerDef> = {}): TrackerDef =>
  ({
    id: "status",
    label: "📌 Status",
    type: "select",
    options: "in-progress=In Progress,completed=Completed",
    surface: { kind: "journal", typeId: "projects" },
    showInTemplate: false,
    showInBase: false,
    ...over,
  }) as TrackerDef;

const refuse = (
  def: TrackerDef | undefined,
  id: string,
  host: string | null
): string | null => journalTallyRefusal(def, id, host, surfaceName);

describe("journalTallyRefusal", () => {
  it("accepts a select on this journal", () => {
    expect(refuse(tracker(), "status", "projects")).toBeNull();
  });

  it("refuses a number, because a tally has no vocabulary to group by", () => {
    // The exact inverse of the chart's arm, which is why the two cannot share
    // one function with a flag.
    const msg = refuse(tracker({ type: "number" }), "status", "projects");
    expect(msg).toContain("isn't a select tracker");
  });

  it("refuses a diary select — its readings are not under this folder", () => {
    const diary = tracker({
      surface: { kind: "diary", classes: ["daily"] } as TrackerSurface,
    });
    expect(refuse(diary, "status", "projects")).toContain(
      "its readings live in the diary"
    );
  });

  it("refuses another journal's select, and names the journal", () => {
    const msg = refuse(tracker(), "status", "media");
    expect(msg).toContain("this note is in media");
  });

  it("is permissive on an unclassified note", () => {
    // The same permissiveness `directiveAllowedOn` applies for the same reason:
    // a dashboard outside every journal root is a place we do not know enough
    // about to refuse.
    expect(refuse(tracker(), "status", null)).toBeNull();
  });

  it("names itself in the missing-id message, not the chart", () => {
    // Three widgets take a tracker id; "needs a tracker id" with no subject is
    // advice a reader cannot act on.
    expect(refuse(tracker(), "", "projects")).toContain("journal-tally");
    expect(refuse(undefined, "nope", "projects")).toContain(
      'No tracker called "nope"'
    );
  });
});

describe("the split is a refactor, not a rewrite", () => {
  it("gives the chart the same answers it always gave", () => {
    // Same checks, same order, same strings — asserted against the recomposed
    // function rather than trusted from the diff.
    const numeric = tracker({ type: "number" });
    expect(
      journalChartRefusal(numeric, "status", "projects", surfaceName)
    ).toBeNull();
    expect(
      journalChartRefusal(tracker(), "status", "projects", surfaceName)
    ).toContain("isn't a numeric tracker");
    expect(journalChartRefusal(undefined, "", "projects", surfaceName)).toContain(
      "journal-chart needs a tracker id"
    );
  });

  it("shares the surface arm verbatim between the two widgets", () => {
    // One function, so a correction to the wording cannot reach one widget and
    // miss the other.
    const other = tracker({ type: "number" });
    expect(journalSurfaceRefusal(other, "media", surfaceName)).toBe(
      journalChartRefusal(other, "status", "media", surfaceName)
    );
    const sel = tracker();
    expect(journalSurfaceRefusal(sel, "media", surfaceName)).toBe(
      journalTallyRefusal(sel, "status", "media", surfaceName)
    );
  });

  it("shares the missing-tracker arm, parameterised by the directive", () => {
    expect(trackerMissingRefusal(undefined, "", "journal-tally", "status")).toBe(
      "journal-tally needs a tracker id — e.g. `journal-tally:status`."
    );
  });
});

describe("the totals predicate", () => {
  const type = buildJournalType(EXERCISE_PRESET.config);
  const withTrackers = (trackers: TrackerDef[]): ChronoAnvilPlugin =>
    ({ settings: { trackers } }) as unknown as ChronoAnvilPlugin;

  const num = (over: Partial<TrackerDef>): TrackerDef =>
    ({
      id: "x",
      label: "X",
      type: "number",
      surface: { kind: "journal", typeId: "exercise-diet" },
      showInTemplate: false,
      showInBase: false,
      ...over,
    }) as TrackerDef;

  it("takes a sum-reduced number on this journal", () => {
    const t = num({ id: "duration", reduce: "sum" });
    expect(summableTrackers(withTrackers([t]), type).map((d) => d.id)).toEqual([
      "duration",
    ]);
  });

  it("leaves out a mean-reduced number", () => {
    // `reduce` is the field that says a quantity adds up, and mean is the
    // silent default precisely because a wrong sum reads as a wildly inflated
    // number where a wrong mean reads as a plausible one.
    const t = num({ id: "weight", reduce: "mean" });
    expect(summableTrackers(withTrackers([t]), type)).toEqual([]);
  });

  it("leaves out a number that declares no reduction at all", () => {
    expect(summableTrackers(withTrackers([num({ id: "bare" })]), type)).toEqual(
      []
    );
  });

  it("leaves out confidence", () => {
    // The built-in every journal has. An average of it is meaningful and a
    // total of it is not, which is exactly what `reduce` encodes.
    const conf = num({ id: "confidence", surface: { kind: "journal", typeId: null } as TrackerSurface });
    expect(summableTrackers(withTrackers([conf]), type)).toEqual([]);
  });

  it("leaves out a scale, even a sum-reduced one", () => {
    // Five workouts at 4/5 do not make 20 of anything.
    const scale = num({ id: "intensity", type: "scale", reduce: "sum" });
    expect(summableTrackers(withTrackers([scale]), type)).toEqual([]);
  });

  it("leaves out a diary tracker", () => {
    const diary = num({
      id: "steps",
      reduce: "sum",
      surface: { kind: "diary", classes: ["daily"] } as TrackerSurface,
    });
    expect(summableTrackers(withTrackers([diary]), type)).toEqual([]);
  });

  it("leaves out another journal's tracker", () => {
    const other = num({
      id: "pagesRead",
      reduce: "sum",
      surface: { kind: "journal", typeId: "media" } as TrackerSurface,
    });
    expect(summableTrackers(withTrackers([other]), type)).toEqual([]);
  });

  it("bands all four of the quantities Exercise ships, and only those", () => {
    // DROP ANY ONE AND THE BAND HAS A CELL MISSING FROM IT — the release's own
    // sentence, asserted rather than asserted about.
    const defs = (EXERCISE_PRESET.trackers ?? []).map(
      (t) =>
        ({
          ...t,
          surface: { kind: "journal", typeId: "exercise-diet" },
          showInTemplate: false,
          showInBase: false,
        }) as TrackerDef
    );
    expect(summableTrackers(withTrackers(defs), type).map((d) => d.id)).toEqual([
      "duration",
      "distance",
      "calories",
      "protein",
    ]);
  });
});
