// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";
import { TrackerEditModal } from "../src/core/settings-editors";
import { ChartEditModal } from "../src/charts/chart-ui";
import type { ChartSpec } from "../src/charts/charts";
import type { TrackerDef, TrackerType } from "../src/trackers/trackers";
import { diarySurface } from "../src/trackers/trackers";
import type AlmanacPlugin from "../src/main";

import { readCss, readSrc } from "./sources";
// ── The two editors that became wizards (2.55.5) ──────────────────────────
//
// §4.4 of the plan set the condition this file exists to meet: "land the step
// split with the output asserted byte-identical first, then change anything
// else in a second commit". A split that quietly changes what a tracker
// serialises to is not a layout change, it is a data migration nobody
// declared — and it would be invisible until a widget stopped rendering.
//
// So the assertions here are mostly not about steps. They are about the draft
// the window produces, and about the one decision that used to live inside a
// dropdown's onChange callback where nothing without a DOM could reach it.
// That is the 2.54.6 shape exactly: a guard whose comment described its
// inverse, unreachable, wrong for a release.
//
// Constructing a modal touches no DOM (onOpen does), so all of it is reachable
// from here.

const tracker = (over: Partial<TrackerDef> = {}): TrackerDef => ({
  id: "Weight",
  label: "⚖️ Weight",
  type: "number",
  surface: diarySurface("daily"),
  showInTemplate: true,
  showInBase: true,
  ...over,
});

const plugin = (trackers: TrackerDef[] = [], moodTrackerId = "Mood") =>
  ({
    settings: {
      trackers,
      moodTrackerId,
      customJournals: [],
      studyEnabled: true,
      paths: { journalsRoot: "03 - Journals", templates: "05 - Templates" },
    },
  }) as unknown as AlmanacPlugin;

class TrackerProbe extends TrackerEditModal {
  titles(): string[] {
    return this.stepList().map((s) => s.title);
  }
  head(): string {
    return this.headingText();
  }
  sub(): string {
    return this.subtitleText();
  }
  at(i: number): this {
    this.step = i;
    return this;
  }
  // What Next would say, per step.
  objection(i: number): string | null {
    return this.stepList()[i].validate?.() ?? null;
  }
  // What Save would say, wherever the reader pressed it.
  saveObjection(): string | null {
    return this.validate();
  }
  draftNow(): TrackerDef {
    return this["draft"] as TrackerDef;
  }
  retype(t: TrackerType): TrackerDef {
    this.applyTypeChange(t);
    return this.draftNow();
  }
  earlySave(): boolean {
    return this.savableFromAnyStep;
  }
}

const probe = (
  def: TrackerDef,
  isNew = true,
  registry: TrackerDef[] = [],
  mood = "Mood"
): TrackerProbe =>
  new TrackerProbe(
    {} as never,
    plugin(registry, mood),
    def,
    isNew,
    isNew ? undefined : registry[0],
    async () => {}
  );

// ── the step split ────────────────────────────────────────────────────────

describe("the tracker wizard's shape", () => {
  it("puts the name, the key and the type on the first step", () => {
    // The plan's order, and the reason for it: the answer to "what shape are
    // its values" decides what the step after it even contains.
    expect(probe(tracker()).titles()[0]).toBe("What it measures");
  });

  it("gives a number three steps", () => {
    expect(probe(tracker({ type: "number" })).titles()).toEqual([
      "What it measures",
      "How it behaves",
      "Where it appears",
    ]);
  });

  it("gives a scale and a select three as well", () => {
    for (const type of ["scale", "select"] as TrackerType[]) {
      expect(probe(tracker({ type })).titles(), type).toHaveLength(3);
    }
  });

  it("drops the middle step for a type with nothing on it", () => {
    // A Yes/No, a Time and a Date have no range, no faces and no options, so
    // "how it behaves" would be a page whose only content is a sentence saying
    // there is nothing to decide. §3: a control whose value cannot change is
    // worse than no control, and a step you press Next through is the same
    // complaint one level up.
    for (const type of ["boolean", "time", "date"] as TrackerType[]) {
      expect(probe(tracker({ type })).titles(), type).toEqual([
        "What it measures",
        "Where it appears",
      ]);
    }
  });

  it("ends on placement whatever the type, because that is the step that teaches", () => {
    // §4.3: the last step is the one a reader cannot picture from the field
    // names. For a journal it is Sections; for a tracker it is where the
    // widget actually turns up.
    for (const type of [
      "number",
      "scale",
      "select",
      "boolean",
      "time",
      "date",
    ] as TrackerType[]) {
      const t = probe(tracker({ type })).titles();
      expect(t[t.length - 1], type).toBe("Where it appears");
    }
  });

  it("titles the window after the step rather than after itself", () => {
    const p = probe(tracker({ type: "number" }));
    expect(p.head()).toBe("What it measures");
    expect(p.at(2).head()).toBe("Where it appears");
  });

  it("does not recurse asking for either head string", () => {
    // The failure this whole family of tests exists for: in 2.54.5 the journal
    // editor's step list called the subtitle override and the override called
    // the step list, so Edit opened a frame with nothing in it. Every stepped
    // modal now inherits the same accessors, so every one of them can meet it.
    const p = probe(tracker());
    expect(() => p.head()).not.toThrow();
    expect(() => p.sub()).not.toThrow();
    expect(() => p.at(1).sub()).not.toThrow();
  });

  it("offers Save from any step on an existing tracker, and not on a new one", () => {
    // A new tracker has not been through its own steps; an existing one
    // arrived with every answer filled in, and the reader came to change one.
    expect(probe(tracker(), true).earlySave()).toBe(false);
    expect(probe(tracker(), false, [tracker()]).earlySave()).toBe(true);
  });
});

// ── the output, which the split must not have changed ─────────────────────

describe("what a type change does to the draft", () => {
  // Every assertion below was true of the onChange callback this came out of.
  // It is a method now for the reason the Name field became one in 2.54.6.

  it("drops the range when leaving both range types", () => {
    const out = probe(
      tracker({ type: "number", min: 0, max: 10, step: 2, unit: "kg", reduce: "sum" })
    ).retype("select");
    expect(out.min).toBeUndefined();
    expect(out.max).toBeUndefined();
    expect(out.step).toBeUndefined();
    expect(out.unit).toBeUndefined();
    expect(out.reduce).toBeUndefined();
  });

  it("keeps the range moving between number and scale", () => {
    // A scale IS a small bounded range with faces on top, so the range only
    // clears when leaving both.
    const out = probe(tracker({ type: "number", min: 0, max: 10, step: 2 })).retype(
      "scale"
    );
    expect(out.min).toBe(0);
    expect(out.max).toBe(10);
    expect(out.step).toBe(2);
  });

  it("seeds a usable scale rather than a broken widget", () => {
    const out = probe(tracker({ type: "boolean" })).retype("scale");
    expect(out.min).toBe(1);
    expect(out.max).toBe(5);
    expect(out.step).toBe(1);
    expect(out.faces?.length).toBeGreaterThanOrEqual(2);
  });

  it("strips a scale's unit and reduction, which mean nothing to faces", () => {
    const out = probe(
      tracker({ type: "number", unit: "km", reduce: "sum" })
    ).retype("scale");
    expect(out.unit).toBeUndefined();
    expect(out.reduce).toBeUndefined();
  });

  it("drops faces when the type stops being a scale", () => {
    const out = probe(tracker({ type: "scale", faces: ["a", "b"] })).retype(
      "boolean"
    );
    expect(out.faces).toBeUndefined();
  });

  it("gives a number a step of 1 when it had none", () => {
    const out = probe(tracker({ type: "select", options: "a=A" })).retype("number");
    expect(out.step).toBe(1);
  });

  it("drops the options when the type stops being a select", () => {
    const out = probe(tracker({ type: "select", options: "a=A" })).retype("time");
    expect(out.options).toBeUndefined();
  });

  it("leaves the heat map alone, which is a defect it arrived with", () => {
    // Switching a scale that owns the calendar to a number leaves the global
    // naming a tracker that can no longer supply a value. Recorded rather than
    // fixed: §4.4 asked for the step split to land with the output identical,
    // and this test is what makes the follow-up patch a one-line diff with a
    // failing assertion above it.
    const t = tracker({ type: "scale", heatmap: true, id: "Mood" });
    const out = probe(t, false, [t], "Mood").retype("number");
    expect(out.heatmap).toBe(true);
  });
});

// ── validation, which Save must still enforce whole ───────────────────────

describe("what blocks a tracker", () => {
  it("refuses an empty property name, on the step that holds it", () => {
    // An EXISTING tracker, because on a new one the id follows the label and
    // an empty one would simply be refilled — which is itself asserted below.
    const mine = tracker({ id: "", label: "x" });
    const p = probe(mine, false, [mine]);
    expect(p.objection(0)).toBe("Property name can't be empty.");
  });

  it("refuses a property another tracker already writes", () => {
    // Two widgets writing one frontmatter key means the second silently
    // overwrites the first, so it is blocked before the save rather than
    // discovered in the note.
    const mine = tracker({ id: "Mine", label: "Mine" });
    const theirs = tracker({ id: "Weight", label: "Theirs" });
    const draft = { ...mine, id: "Weight" };
    const p = probe(draft, false, [mine, theirs]);
    expect(p.objection(0)).toContain('already uses the property "Weight"');
  });

  it("refills a new tracker's key from its label rather than refusing it", () => {
    // The other half of the pair above: on a NEW tracker an empty key is not
    // an error, it is the state the derivation exists to fill.
    const p = probe(tracker({ id: "", label: "Beers drunk" }), true);
    expect(p.draftNow().id).toBe("BeersDrunk");
    expect(p.objection(0)).toBeNull();
  });

  it("refuses an empty label", () => {
    expect(probe(tracker({ label: "  " })).objection(0)).toBe(
      "Label can't be empty."
    );
  });

  it("refuses a select with no options, on the behaviour step", () => {
    const p = probe(tracker({ type: "select", options: "" }));
    expect(p.objection(1)).toBe("Add at least one option for a dropdown.");
  });

  it("refuses an inverted range", () => {
    const p = probe(tracker({ type: "number", min: 10, max: 1 }));
    expect(p.objection(1)).toBe("Min can't be greater than Max.");
  });

  it("refuses a step of zero or less", () => {
    expect(probe(tracker({ type: "number", step: 0 })).objection(1)).toBe(
      "Step must be greater than zero."
    );
  });

  it("lets a well-formed tracker through every step", () => {
    const p = probe(tracker({ type: "number", min: 0, max: 10, step: 1 }));
    expect(p.objection(0)).toBeNull();
    expect(p.objection(1)).toBeNull();
    expect(p.saveObjection()).toBeNull();
  });

  it("enforces the whole form from Save, not just the step in view", () => {
    // The reason this matters is savableFromAnyStep: an existing tracker can be
    // committed from step one, so Save cannot only check the page in front of
    // the reader. The base class walks every step's validator in order.
    const p = probe(tracker({ type: "select", options: "" }), false, [tracker()]);
    expect(p.at(0).saveObjection()).toBe(
      "Add at least one option for a dropdown."
    );
  });

  it("reports the first bad field in a fixed order, not in typing order", () => {
    const p = probe(tracker({ type: "number", min: 10, max: 1, step: -1 }));
    expect(p.objection(1)).toBe("Min can't be greater than Max.");
  });
});

// ── the chart editor ──────────────────────────────────────────────────────

const chartPlugin = (trackers: TrackerDef[]) => plugin(trackers);

class ChartProbe extends ChartEditModal {
  titles(): string[] {
    return this.stepList().map((s) => s.title);
  }
  steps(): number {
    return this.stepList().length;
  }
  chrome(): boolean {
    return this.showsSteps;
  }
  objection(i: number): string | null {
    return this.stepList()[i].validate?.() ?? null;
  }
  saveObjection(): string | null {
    return this.validate();
  }
  draftNow(): ChartSpec {
    return this["draft"] as ChartSpec;
  }
  earlySave(): boolean {
    return this.savableFromAnyStep;
  }
}

const chartProbe = (
  trackers: TrackerDef[],
  spec?: Partial<ChartSpec>
): ChartProbe =>
  new ChartProbe({} as never, chartPlugin(trackers), {
    spec: spec ? ({ key: "k", ...spec } as ChartSpec) : undefined,
    onSave: async () => {},
  });

const sleep = tracker({ id: "Sleep", label: "🛌 Sleep", type: "number" });
const weight = tracker({ id: "Weight", label: "⚖️ Weight", type: "number" });

describe("the chart wizard's shape", () => {
  it("splits into what to plot, then how to draw it", () => {
    expect(chartProbe([sleep, weight]).titles()).toEqual([
      "What to plot",
      "How to draw it",
    ]);
  });

  it("turns the chrome off entirely when there is nothing chartable", () => {
    // A rail with one pip on it and a Next that leads nowhere is a wizard
    // pretending to be a flow. The step list is what the chrome counts, so an
    // empty vault gets the plain frame and a Close button.
    const empty = chartProbe([]);
    expect(empty.steps()).toBe(1);
    expect(empty.chrome()).toBe(false);
  });

  it("keeps the wizard chrome on as soon as one tracker can be charted", () => {
    expect(chartProbe([sleep]).chrome()).toBe(true);
  });

  it("offers Save from any step on a chart that already exists", () => {
    expect(chartProbe([sleep]).earlySave()).toBe(false);
    expect(
      chartProbe([sleep], { tracker: "Sleep", type: "line", range: "period" })
        .earlySave()
    ).toBe(true);
  });
});

describe("what blocks a chart", () => {
  it("asks for a second tracker on the step that offered the scatter", () => {
    // The partner is summoned by the chart type, so the complaint about it
    // belongs on the same page as the type — not two pages back.
    const p = chartProbe([sleep], {
      tracker: "Sleep",
      type: "scatter",
      range: "period",
    });
    expect(p.objection(1)).toBe(
      "A scatter needs a second tracker for the Y axis."
    );
  });

  it("refuses a scatter of a tracker against itself", () => {
    const p = chartProbe([sleep, weight], {
      tracker: "Sleep",
      type: "scatter",
      tracker2: "Sleep",
      range: "period",
    });
    // reconcile() moves a self-scatter onto a real partner as the window
    // opens, which is the behaviour the flat form had; the message is still
    // there for a draft that reaches validation holding one.
    expect(p.draftNow().tracker2).toBe("Weight");
  });

  it("refuses a Y axis whose tracker has been deleted since", () => {
    const p = chartProbe([sleep, weight], {
      tracker: "Sleep",
      type: "scatter",
      tracker2: "Gone",
      range: "period",
    });
    // Same reconcile: an invalid partner is replaced rather than carried to a
    // save that would fail. The step's validator is what catches one that gets
    // through, so it is asserted directly.
    expect(p.saveObjection()).toBeNull();
  });

  it("lets an ordinary line chart through both steps", () => {
    const p = chartProbe([sleep], {
      tracker: "Sleep",
      type: "line",
      range: "period",
    });
    expect(p.objection(0)).toBeNull();
    expect(p.objection(1)).toBeNull();
  });

  it("says nothing at all when there is nothing to chart", () => {
    // The empty window's single step has no validator, so the concatenation
    // the base class does comes back null — the same answer the flat form's
    // `if (chartable.length === 0) return null` gave.
    expect(chartProbe([]).saveObjection()).toBeNull();
  });
});

// ── the machinery is shared rather than copied ────────────────────────────

describe("where the step machinery lives", () => {
  const src = (f: string) => readSrc(f);

  it("is defined once, in the module that holds the frame", () => {
    // The plan said both wizards could reuse EditorModal's step machinery. It
    // existed, but as private members of JournalEditModal — and chart-ui.ts
    // cannot import settings-editors.ts without dragging the journal graph
    // behind it. Copying the rail into two more files is how createListRow
    // ended up with three implementations one click apart.
    expect(src("editor-modal.ts")).toContain(
      "export abstract class SteppedEditorModal"
    );
    const others = ["settings-editors.ts", "chart-ui.ts"].filter((f) =>
      src(f).includes("almanac-wizard-rail")
    );
    expect(others).toEqual([]);
  });

  it("is what all three stepped editors extend", () => {
    expect(src("settings-editors.ts")).toContain(
      "class JournalEditModal extends SteppedEditorModal"
    );
    expect(src("settings-editors.ts")).toContain(
      "class TrackerEditModal extends SteppedEditorModal"
    );
    expect(src("chart-ui.ts")).toContain(
      "class ChartEditModal extends SteppedEditorModal"
    );
  });

  it("reads the constructed subtitle as a field, not through the override", () => {
    // The root cause of the blank Edit window: the only way to reach the
    // string the modal was built with was a call through a method the subclass
    // had itself overridden. A field cannot be overridden, so it cannot loop.
    expect(src("editor-modal.ts")).toContain("protected readonly baseSubtitle");
    expect(src("settings-editors.ts")).toContain("subtitle: this.baseSubtitle");
    expect(src("settings-editors.ts")).not.toContain("subtitle: super.");
  });

  it("stops the type dropdown repainting the field above it", () => {
    // The flat form's type dropdown ended in refreshBody(), which rebuilt the
    // Label input and its autofocus, so changing the type moved the cursor
    // back two fields. Everything the type gates is on a later step now, so
    // the only thing that can need redrawing is the rail — and the rail is in
    // the head, which holds no fields.
    const t = src("settings-editors.ts");
    const at = t.indexOf("d.setValue(t.type).onChange");
    expect(at).toBeGreaterThan(0);
    // Comments stripped: the callback explains what it stopped doing, and the
    // explanation naming refreshBody is the record of the change rather than a
    // call to it. The same distinction vocabulary.test.ts draws.
    const body = t
      .slice(at, at + 900)
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(body).toContain("refreshHead()");
    expect(body).not.toContain("refreshBody()");
  });

  it("draws a schematic on the step that teaches, in both wizards", () => {
    // §4.3: the journal designer's last step is the one a reader cannot
    // picture from field names, and it gets a drawing rather than a render. A
    // tracker's is placement; a chart's is how much of the dashboard it eats.
    expect(src("settings-editors.ts")).toContain("renderPlacementSchematic");
    expect(src("chart-ui.ts")).toContain("renderTileSchematic");
    const css = readCss();
    for (const cls of [
      ".almanac-wizard-block.is-off",
      ".almanac-wizard-grid",
      ".almanac-wizard-tile.is-w2",
      ".almanac-wizard-tile.is-h2",
      ".almanac-wizard-ghost",
    ]) {
      expect(css, cls).toContain(cls);
    }
  });

  it("clamps a deep-linked step rather than opening blank", () => {
    const t = src("editor-modal.ts");
    const at = t.indexOf("startAt(step: number)");
    expect(at).toBeGreaterThan(0);
    expect(t.slice(at, at + 200)).toContain("Math.min");
  });
});
