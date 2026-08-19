// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The chart editor.
//
// Adding a chart used to be four suggester prompts in a row — tracker, then
// type, then range, with scope wedged in between once monthly charts existed.
// A chain of modals is a bad shape for a form with dependencies in it: you
// can't see what you already picked, you can't change your mind about step one
// without cancelling out of steps two and three, and every field you add makes
// the chain longer rather than the window fuller. The event editor made the
// same move for the same reason, and this follows it deliberately — one window,
// every field visible, dependent fields re-drawn in place.
//
// The dependencies are real, not cosmetic. Which scopes exist depends on the
// tracker (a tracker on one template has no choice to make), and which types
// and ranges are offered depends on the scope (a calendar heatmap of monthly
// values shades one cell in thirty). So the fields get rebuilt whenever
// something they depend on changes.
//
// TWO STEPS SINCE 2.55.5 — and this is not a return to the chain of modals the
// paragraph above rejects. The difference is the whole argument: a suggester
// chain asks one question per window, forgets the answers, and cannot be
// walked backwards. These steps are two pages of one window, both reachable
// from the rail, with everything on a page visible at once.
//
// The split is not arbitrary either. WHAT TO PLOT is the tracker, the
// granularity its values are read at, and the window of time — the three
// fields that decide which numbers exist. HOW TO DRAW IT is the chart type
// and everything the type summons. Every dependency in the form runs forwards
// across that line: `typesFor(scope, def)` and `rangesFor(scope)` read only
// step one's answers, so step two is fully determined by the page before it
// and nothing on step two can withdraw an answer on step one.

import { App, Notice, Setting } from "obsidian";
import { SteppedEditorModal } from "../ui/editor-modal";
import type { WizardStep } from "../ui/editor-modal";
import type AlmanacPlugin from "../main";
import type { ChartSpec, PeriodBounds } from "./charts";
import { chartTitle, defaultSpan, isChartable, rangeDays, scopesFor } from "./charts";
export { scopesFor };
import type {
  ChartRange,
  ChartScope,
  ChartSpan,
  ChartType,
  TrackerDef,
} from "../trackers/trackers";

export const CHART_TYPE_LABELS: Record<Exclude<ChartType, "none">, string> = {
  line: "Line (trend over time)",
  bar: "Bar (per-day totals)",
  summary: "Summary (avg / min / max / total)",
  month: "Calendar heatmap",
  scatter: "Scatter (two trackers correlated)",
  streak: "Streak (habit run length)",
};

// "period" leads the list so it's the natural default: it needs no date entry
// and tracks the dashboard the chart lives on (this week / this month), which
// is what a chart on a weekly or monthly overview almost always wants. The
// fixed windows remain for anyone who wants a chart that ignores the period.
export const RANGE_LABELS: Record<ChartRange, string> = {
  period: "This period (follows the page)",
  "30": "Last 30 days",
  "90": "Last 90 days",
  "365": "Last year",
  all: "All time",
};

// The same five, at the width a chart tile's title bar can spare.
//
// A separate table rather than a truncation of the one above, because the
// short forms are not abbreviations of those sentences — "This period (follows
// the page)" shortens to "Page", which is a different word chosen to be
// readable at 11px beside an eyebrow label, not the first four characters of
// anything. The full label is still what the button's tooltip says, so the
// short form never has to carry the whole meaning on its own.
export const RANGE_SHORT_LABELS: Record<ChartRange, string> = {
  period: "Page",
  "30": "30d",
  "90": "90d",
  "365": "1y",
  all: "All",
};

export const SCOPE_LABELS: Record<ChartScope, string> = {
  daily: "Daily entries",
  weekly: "Weekly entries",
  monthly: "Monthly entries",
  quarterly: "Quarterly entries",
  yearly: "Yearly entries",
  // Named for what it reads and what it draws, in that order, because the
  // distinction from "Daily entries" is the *output* granularity — both read
  // the same notes.
  "daily-by-month": "Daily entries, by month",
};

// The dimensions are shown in the label because the names alone don't say which
// way round they go — "Tall" is unambiguous but "Wide (2×1)" tells you it costs
// two columns of the dashboard, which is the thing being spent.
export const SPAN_LABELS: Record<ChartSpan, string> = {
  small: "Small (1×1)",
  wide: "Wide (2×1)",
  tall: "Tall (1×2)",
  large: "Large (2×2)",
};

// Which chart types a given tracker+scope can offer. Two constraints stack:
//
//  • Scope: monthly values land one per month, so the calendar heatmap (a grid
//    of days) would shade one cell in thirty and reads as a fault.
//  • Tracker type: scatter needs a *second* axis, so it's offered for any
//    chartable tracker (the partner is chosen in the editor); streak is only
//    meaningful for a boolean/habit, where "the same again" is a notion — a
//    number has no streak. So streak appears only for booleans, and the
//    time-series types (line/bar) are withheld from a boolean, whose 0/1 over
//    time is better read as a streak or a summary rate than a square wave.
//
// Withholding rather than offering-then-disappointing keeps a one-dot or
// nonsensical chart out of the list entirely, the same principle the monthly
// rules already follow.
export function typesFor(scope: ChartScope, def?: TrackerDef): [string, string][] {
  const isBoolean = def?.type === "boolean";
  return Object.entries(CHART_TYPE_LABELS).filter(([k]) => {
    if (scope === "monthly" && k === "month") return false;
    if (k === "streak") return isBoolean;
    // A boolean charts as streak/summary/scatter, not as a raw line or bar.
    if ((k === "line" || k === "bar") && isBoolean) return false;
    return true;
  });
}

export function rangesFor(scope: ChartScope): [string, string][] {
  return Object.entries(RANGE_LABELS).filter(
    ([k]) => !(scope === "monthly" && (k === "30" || k === "90"))
  );
}


export type ChartDraft = Omit<ChartSpec, "key">;

export interface ChartEditorOptions {
  spec?: ChartSpec;
  // The period the host note is a dashboard for, when it is one. Needed only to
  // resolve the Auto size label: a `period` chart is seven days on the weekly
  // overview and a full year on the year dashboard, so "Auto" resolves to
  // different sizes on different notes and the label has to say which. Absent
  // or null is treated as a plain 30-day window, matching resolveChartWindow's
  // own fallback for a chart on a non-dashboard note.
  periodUnit?: PeriodBounds["unit"] | null;
  onSave: (draft: ChartDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
}

// Exported for test/wizard-steps.test.ts. See the note on TrackerEditModal:
// constructing a modal touches no DOM, so the flow is unit-testable.
export class ChartEditModal extends SteppedEditorModal {
  private draft: ChartDraft;
  private readonly isNew: boolean;
  private readonly chartable: TrackerDef[];

  constructor(
    app: App,
    plugin: AlmanacPlugin,
    private opts: ChartEditorOptions
  ) {
    const isNew = !opts.spec;
    super(
      app,
      plugin,
      isNew ? "New chart" : "Edit chart",
      // Read only when the window has no steps — that is, when the vault
      // holds nothing chartable and there is one page saying so. The stepped
      // path puts the same fact on step one, where the fields it describes
      // are: a chart is stored in the note rather than in Settings, so it
      // travels with the dashboard and can be edited as text.
      "Charts live in this note, not in Settings — a chart is written into its chart block.",
      isNew ? "Add chart" : "Save"
    );
    this.isNew = isNew;
    // isChartable, not chartableType: the latter only asks whether the value
    // is a magnitude, and a journal `confidence` is a number like any other.
    // Filtering on type alone would put every journal tracker in the diary's
    // Add Chart dialog, where picking one draws an empty series read from the
    // daily folder.
    this.chartable = plugin.settings.trackers.filter(isChartable);
    const first = this.chartable[0];
    // Field by field rather than a spread, so the draft can't carry `key` — but
    // that means every field on ChartSpec has to be named here or it is silently
    // dropped on save. `size` was the case that taught this: leave it out and a
    // reader who sets a chart to Large, then later changes its range, loses the
    // size with no error and no obvious cause.
    //
    // THERE IS A TEST NOW (4.45). This comment used to end "there is no test
    // that can catch this shape of omission, so it is called out rather than
    // trusted to review", and that was true of a test that runs the modal —
    // there is no DOM in the suite. It is not true of one that reads the
    // SOURCE: `test/chart-series.test.ts` takes the field names out of
    // `ChartSpec` and asserts each appears in this object, which fails the next
    // time a field is added and not copied. `title` is the field that was added
    // the day the test was written.
    this.draft = opts.spec
      ? {
          tracker: opts.spec.tracker,
          type: opts.spec.type,
          range: opts.spec.range,
          scope: opts.spec.scope,
          tracker2: opts.spec.tracker2,
          avg: opts.spec.avg,
          size: opts.spec.size,
          title: opts.spec.title,
        }
      : { tracker: first?.id ?? "", type: "line", range: "period" };
    // Whatever the controls will display, the draft has to already agree with
    // — the lesson the event editor's seedDates() exists for. A form that shows
    // an answer the draft doesn't hold fails validation while pointing at a
    // field that visibly has something in it.
    this.reconcile();
  }

  // The chart type as one word, for a sentence rather than a dropdown. The
  // labels carry a parenthetical gloss ("Bar (per-day totals)") that earns its
  // place in the list and reads as noise inside prose.
  private typeWord(): string {
    const label = CHART_TYPE_LABELS[this.draft.type as Exclude<ChartType, "none">];
    return (label ?? this.draft.type).split(" (")[0].toLowerCase();
  }

  private trackerDef(): TrackerDef | undefined {
    return this.chartable.find((t) => t.id === this.draft.tracker);
  }

  // Force the draft back into a combination the form can actually offer, after
  // a change above it may have withdrawn the current answer. Called on
  // construction and after every tracker or scope change, so the invariant
  // holds rather than being re-derived at each read site.
  private reconcile(): void {
    const def = this.trackerDef();
    const scopes = scopesFor(def);
    let scope: ChartScope = this.draft.scope ?? "daily";
    // `scopes` is empty for a tracker that can't be charted at all. The list
    // this modal offers is filtered by isChartable so the draft should never
    // name one — but reconcile() runs before anything else and its job is to
    // leave the draft in a state the form can render, so it falls back rather
    // than handing `undefined` to typesFor and rangesFor below.
    if (!scopes.includes(scope)) scope = scopes[0] ?? "daily";

    const types = typesFor(scope, def).map(([k]) => k);
    const type = types.includes(this.draft.type) ? this.draft.type : (types[0] as ChartType);
    const ranges = rangesFor(scope).map(([k]) => k);
    const range = ranges.includes(this.draft.range) ? this.draft.range : (ranges[0] as ChartRange);

    this.draft.type = type;
    this.draft.range = range;
    // Stored only when it isn't the default, so a daily chart's directive stays
    // byte-identical to what every existing vault already has on disk.
    if (scope === "monthly") this.draft.scope = "monthly";
    else delete this.draft.scope;

    // tracker2 and avg only mean something for one chart type each; drop them
    // otherwise so a directive never carries a token its type ignores, and so
    // switching type→scatter→line→scatter doesn't resurrect a stale partner.
    const others = this.chartable.filter((t) => t.id !== this.draft.tracker);
    const partnerValid =
      this.draft.tracker2 != null &&
      this.draft.tracker2 !== this.draft.tracker &&
      others.some((t) => t.id === this.draft.tracker2);
    if (type === "scatter") {
      // Default the Y-axis to a different tracker than X where one exists, so a
      // fresh scatter isn't X-against-itself (a diagonal line, never the
      // intent). Keep an explicit prior choice if it's still valid.
      this.draft.tracker2 = partnerValid ? this.draft.tracker2 : others[0]?.id;
    } else if (type === "line") {
      // A LINE KEEPS A PARTNER AND IS NEVER GIVEN ONE (4.45), and the asymmetry
      // with the branch above is the whole difference between the two charts. A
      // scatter without a second tracker is not a chart — one coordinate is not
      // a point — so it defaults. A line without one is the ordinary case, and
      // defaulting would draw a second trend nobody asked for on a tile that
      // was about one thing.
      //
      // Kept when it is still valid, so scatter → line → scatter does not lose
      // the reader's choice on the way through.
      if (!partnerValid) delete this.draft.tracker2;
    } else {
      delete this.draft.tracker2;
    }
    // The rolling average is a line's, and a single line's — see ChartSpec.avg.
    // Enforced here rather than only withheld in the form, so a `+avg+y=`
    // directive somebody typed by hand is resolved the moment it is opened.
    if (type !== "line" || this.draft.tracker2) delete this.draft.avg;
  }

  // An existing chart can be saved from any step — see SteppedEditorModal. A
  // chart that is already on the page arrived with every field answered, and
  // "change this one from a line to a bar" should not cost a walk through the
  // page that says which tracker it reads.
  protected get savableFromAnyStep(): boolean {
    return !this.isNew;
  }

  // ── the flow ───────────────────────────────────────────────────────────

  // ONE step when there is nothing to chart, which is what turns the wizard
  // chrome off: `showsSteps` counts the list, so an empty vault gets the plain
  // frame, the constructed subtitle and the Close footer below rather than a
  // rail with a single pip on it and a Next that leads nowhere.
  protected stepList(): WizardStep[] {
    if (this.chartable.length === 0) {
      return [
        {
          title: this.baseHeading,
          subtitle: this.baseSubtitle,
          render: (h) => {
            h.createDiv({
              cls: "almanac-editor-note setting-item-description",
              text: "No chartable trackers yet. Add a number, time, scale or habit tracker in Settings → Trackers, then come back — a select's values aren't magnitudes, so there is nothing to plot.",
            });
          },
        },
      ];
    }
    return [
      {
        title: "What to plot",
        subtitle:
          "Which values this chart reads, at what granularity, and how far back. Charts live in this note rather than in Settings, so this one travels with the dashboard and can be edited as text.",
        render: (h) => this.renderSubject(h),
        validate: () => this.validateSubject(),
      },
      {
        title: "How to draw it",
        subtitle:
          "The shape the values are drawn in, and how much of the dashboard the tile takes.",
        render: (h) => this.renderDrawing(h),
        validate: () => this.validateDrawing(),
      },
    ];
  }

  // ── step 1: what to plot ───────────────────────────────────────────────

  private renderSubject(host: HTMLElement): void {
    new Setting(host)
      .setName("Tracker")
      .setDesc(
        "The values this chart reads. Number, time, scale and habit trackers can be charted; a select's values aren't magnitudes, so they aren't offered."
      )
      .addDropdown((d) => {
        for (const t of this.chartable) d.addOption(t.id, `${t.label}  ·  ${t.id}`);
        d.setValue(this.draft.tracker).onChange((v) => {
          this.draft.tracker = v;
          // A different tracker can withdraw the scope that was picked, which
          // can in turn withdraw the type and range.
          this.reconcile();
          this.refreshBody();
        });
      });

    const def = this.trackerDef();
    const scopes = scopesFor(def);
    const scope: ChartScope = this.draft.scope ?? "daily";

    // Only a question when there are two answers, and since 2.19 a tracker's
    // class gives exactly one — so this is normally a plain statement of where
    // the values come from rather than a dropdown that can only be set one
    // way. The branch is kept because scopesFor is allowed to widen (a class
    // readable at two granularities), not out of superstition.
    if (scopes.length > 1) {
      new Setting(host)
        .setName("Read values from")
        .setDesc(
          `${def?.label ?? "This tracker"} can be read at more than one granularity. A chart reads one of them — add a second chart for the other rather than mixing them into one series.`
        )
        .addDropdown((d) => {
          for (const s of scopes) d.addOption(s, SCOPE_LABELS[s]);
          d.setValue(scope).onChange((v) => {
            this.draft.scope = v as ChartScope;
            this.reconcile();
            this.refreshBody();
          });
        });
    } else {
      new Setting(host)
        .setName("Read values from")
        .setDesc(
          scopes[0] === "monthly"
            ? "Monthly entries — this is a monthly tracker, so that is where its values are written."
            : "Daily entries — this is a daily tracker, so that is where its values are written."
        );
    }

    new Setting(host)
      .setName("Time range")
      .setDesc(
        scope === "monthly"
          ? "Monthly values land one per month, so the 30- and 90-day windows are left out — they'd hold one point and three. “Last year” is the last twelve."
          : "“This period” follows the note it sits on, so a chart on the weekly overview tracks that week. You can also change this from the chart itself — its title bar carries a button that cycles the range."
      )
      .addDropdown((d) => {
        for (const [k, label] of rangesFor(scope)) d.addOption(k, label);
        d.setValue(this.draft.range).onChange((v) => {
          this.draft.range = v as ChartRange;
          // No repaint, unlike the flat form, which redrew everything here so
          // that Size could re-resolve its "Auto" label against the new range.
          // Size is on the step after this one and is built when that step
          // draws, so the label is current by construction rather than by
          // rebuilding four fields that did not change.
        });
      });
  }

  private validateSubject(): string | null {
    if (!this.draft.tracker) return "Pick a tracker to chart.";
    if (!this.trackerDef()) {
      return "That tracker no longer exists — pick another.";
    }
    return null;
  }

  // ── step 2: how to draw it ─────────────────────────────────────────────

  private renderDrawing(host: HTMLElement): void {
    const def = this.trackerDef();
    const scope: ChartScope = this.draft.scope ?? "daily";

    new Setting(host)
      .setName("Chart type")
      .setDesc(
        scope === "monthly"
          ? "The calendar heatmap is a grid of days, so it isn't offered for monthly values — it would shade one cell in thirty."
          : def?.type === "boolean"
            ? "A habit charts as a streak (its run of consecutive days), a summary (its completion rate), or a scatter against another tracker."
            : "Line and bar plot the values over time; summary reduces them to a few numbers; scatter plots this tracker against another."
      )
      .addDropdown((d) => {
        for (const [k, label] of typesFor(scope, def)) d.addOption(k, label);
        d.setValue(this.draft.type).onChange((v) => {
          this.draft.type = v as ChartType;
          // Type gates the scatter/average controls below, so redraw — and
          // reconcile first, since scatter needs a default partner and the
          // other types must shed one.
          this.reconcile();
          this.refreshBody();
        });
      });

    // The second tracker. Its own dropdown rather than a positional token, and
    // shown for the two types that read two series — a scatter, which REQUIRES
    // one, and since 4.45 a line, which OFFERS one.
    //
    // ON THIS STEP RATHER THAN THE ONE CALLED "WHAT TO PLOT", which is the one
    // placement in this window that had to be argued. It does name a second
    // series, so on the words alone it belongs on step one. But it does not
    // exist until a chart type asks for it: put it on step one and it is a
    // blank dropdown with no reason to be there, whose reason arrives a page
    // later. A field summoned by a control belongs beside that control.
    //
    // TWO CHARTS, TWO SENTENCES, ONE CONTROL. A scatter plots X against Y and
    // keeps whichever entries logged both; a line draws two trends over one
    // date axis and keeps every day either of them logged. Describing both with
    // one string would be describing neither.
    const wantsPartner = this.draft.type === "scatter" || this.draft.type === "line";
    if (wantsPartner) {
      const others = this.chartable.filter((t) => t.id !== this.draft.tracker);
      const isScatter = this.draft.type === "scatter";
      if (others.length === 0) {
        // Only a scatter is BLOCKED by this — a line with nothing to pair is
        // simply a line — so the sentence is only worth showing there.
        if (isScatter) {
          new Setting(host)
            .setName("Against")
            .setDesc(
              "A scatter needs a second tracker to plot against, and there's only one chartable tracker so far. Add another in Settings → Trackers."
            );
        }
      } else {
        new Setting(host)
          .setName(isScatter ? "Against (Y axis)" : "Second tracker")
          .setDesc(
            isScatter
              ? `${def?.label ?? "This tracker"} is the X axis; pick the tracker for the Y axis. Only entries that logged both appear as points, and days that logged the same pair twice merge into one larger dot.`
              : `Optional. Draws a second line on its own axis at the right, scaled to its own values and coloured to match. The two axes are independent, so where the lines cross means nothing — read each line against its own side.`
          )
          .addDropdown((d) => {
            // NONE IS AN ANSWER ON A LINE AND NOT ON A SCATTER, which is the
            // same asymmetry `reconcile()` states from the other end: one chart
            // is incomplete without a partner and the other is complete with
            // one series. The empty value DELETES the field rather than storing
            // a sentinel — the rule Size already follows with its "auto".
            if (!isScatter) d.addOption("", "— none —");
            for (const t of others) d.addOption(t.id, `${t.label}  ·  ${t.id}`);
            d.setValue(this.draft.tracker2 ?? "");
            d.onChange((v) => {
              if (!v) delete this.draft.tracker2;
              else this.draft.tracker2 = v;
              // The rolling average is withheld the moment a partner is
              // chosen, so the form has to redraw to take it away — and to put
              // it back when the partner is cleared.
              if (!isScatter) {
                this.reconcile();
                this.refreshBody();
              }
            });
          });
      }
    }

    // Rolling-average overlay: a display option on the line chart only.
    //
    // AND ON A SINGLE LINE ONLY, SINCE 4.45. Withheld rather than disabled,
    // with the reason in its place: a control that is present and refusing
    // teaches nothing here, because the thing to change is a field two rows up
    // rather than the toggle itself.
    if (this.draft.type === "line") {
      if (this.draft.tracker2) {
        new Setting(host)
          .setName("Rolling average")
          .setDesc(
            "Not available with a second tracker. A trailing mean is a guide through the noise of one trend; drawn through two, on two axes, it is a third dashed line belonging visibly to neither. Clear the second tracker to bring it back."
          );
      } else {
        new Setting(host)
          .setName("Rolling average")
          .setDesc(
            "Overlay a trailing mean to show the trend through the day-to-day noise. The window adapts to the range (about a week for daily data)."
          )
          .addToggle((c) =>
            c.setValue(this.draft.avg ?? false).onChange((v) => {
              this.draft.avg = v || undefined;
            })
          );
      }
    }

    // What the tile calls itself. 4.45.
    //
    // PLACEHOLDER, NEVER PRE-FILLED, which is `TitleQuestion`'s rule in the
    // section editor and holds for the same reason: seeding the box with the
    // derived name would write it into the directive as though the reader had
    // chosen it, and a later change of default — a renamed tracker, a second
    // series added — could never reach that chart again.
    //
    // ON THIS STEP because a title decides no numbers, and step one is the
    // three fields that decide which numbers exist.
    new Setting(host)
      .setName("Title")
      .setDesc(
        "Optional. Left empty, the tile names itself after the tracker it reads — or after both, for a chart with two."
      )
      .addText((t) => {
        t.setPlaceholder(this.derivedTitle());
        t.setValue(this.draft.title ?? "");
        t.onChange((v) => {
          const next = v.trim();
          if (next) this.draft.title = next;
          else delete this.draft.title;
        });
      });

    // Size, last because it depends on everything above it — and, now, on the
    // range chosen on the step before, which is why the Auto label is resolved
    // here rather than carried forward.
    const auto = defaultSpan(
      this.draft.type,
      rangeDays(this.draft.range, this.opts.periodUnit ?? null)
    );
    new Setting(host)
      .setName("Size")
      .setDesc(
        "How much of the dashboard this chart takes. Auto sizes it from the chart type and the length of the window it draws — a long trend is easier to read wide, a long calendar heatmap easier to read tall. On a narrow pane every chart drops to full width regardless."
      )
      .addDropdown((d) => {
        // Naming the resolved size inside the Auto option is what makes the
        // automatic rule discoverable. Without it the reader sees a chart that
        // came out wide and a control that says "Auto", with nothing connecting
        // the two and no way to tell whether the size was chosen or inherited.
        d.addOption("auto", `Auto — ${SPAN_LABELS[auto].toLowerCase()}`);
        for (const span of Object.keys(SPAN_LABELS) as ChartSpan[]) {
          d.addOption(span, SPAN_LABELS[span]);
        }
        d.setValue(this.draft.size ?? "auto").onChange((v) => {
          // Auto *deletes* the field rather than storing a default. Absence is
          // the derivation, and it is what keeps `+size=` off the directive —
          // so a chart nobody has resized serialises exactly as it did before
          // this feature existed.
          if (v === "auto") delete this.draft.size;
          else this.draft.size = v as ChartSpan;
          // The schematic below draws the tile at this size, so it repaints.
          this.refreshBody();
        });
      });

    // No withholding by type here, deliberately, unlike typesFor above. That
    // withholds combinations that are *nonsensical* — a calendar heatmap of
    // monthly values shades one cell in thirty. A wide scatter is merely
    // suboptimal, and the automatic default already steers away from it.
    // Removing the option as well would be the form arguing with the reader
    // about taste rather than protecting them from a broken chart.

    this.renderTileSchematic(host, auto);
  }

  private validateDrawing(): string | null {
    // ONLY A SCATTER REQUIRES A PARTNER. A line with none is an ordinary line,
    // which is why this refusal stayed where it was while the two below moved
    // out to cover both charts.
    if (this.draft.type === "scatter" && !this.draft.tracker2) {
      return "A scatter needs a second tracker for the Y axis.";
    }
    if (this.draft.tracker2) {
      if (this.draft.tracker2 === this.draft.tracker) {
        return "A chart can't plot a tracker against itself — pick a different second tracker.";
      }
      if (!this.chartable.some((t) => t.id === this.draft.tracker2)) {
        return "The second tracker no longer exists — pick another, or clear it.";
      }
    }
    return null;
  }

  // What the tile would call itself if the reader gave it no title — the
  // placeholder, and the thing the schematic below draws.
  //
  // THROUGH `chartTitle`, so this window and the tile cannot disagree. A
  // placeholder promising one name over a tile that draws another is a reader
  // typing a title to fix a name that was never wrong.
  private derivedTitle(): string {
    const def = this.trackerDef();
    const other = this.draft.tracker2
      ? this.chartable.find((t) => t.id === this.draft.tracker2)
      : undefined;
    return chartTitle(
      { type: this.draft.type, title: undefined },
      def?.label ?? "This chart",
      other?.label
    );
  }

  // How much of the dashboard the tile takes, drawn.
  //
  // The one field on this step a reader cannot picture from its label. "Wide
  // (2×1)" already says the dimensions — that was 2.52's fix for names that
  // did not say which way round they went — but two columns of WHAT is not on
  // the screen anywhere, and neither is the fact that "Auto" resolved to one
  // of these four rather than to some fifth automatic thing.
  //
  // A SCHEMATIC, on the journal designer's argument: a live render of a chart
  // over a tracker with no readings is an empty state, and an empty state
  // teaches nothing about proportion.
  private renderTileSchematic(host: HTMLElement, auto: ChartSpan): void {
    const span = this.draft.size ?? auto;
    const box = host.createDiv({ cls: "almanac-wizard-schematic" });
    box.createDiv({
      cls: "almanac-wizard-schematic-title",
      text: `${SPAN_LABELS[span]} — how it will sit on the dashboard`,
    });
    const grid = box.createDiv({ cls: "almanac-wizard-grid" });
    const wide = span === "wide" || span === "large";
    const tall = span === "tall" || span === "large";
    const tile = grid.createDiv({
      cls: `almanac-wizard-tile${wide ? " is-w2" : ""}${tall ? " is-h2" : ""}`,
    });
    // The name the tile will actually carry, not the tracker's — a reader who
    // has just typed a title should see it in the picture of their tile.
    tile.setText(this.draft.title ?? this.derivedTitle());
    // The cells the tile does not take, so the proportion has something to be
    // a proportion OF. Four cells is the widest a dashboard row gets before it
    // wraps, which is why "large" fills the drawing exactly.
    const taken = (wide ? 2 : 1) * (tall ? 2 : 1);
    for (let i = taken; i < 4; i++) {
      grid.createDiv({ cls: "almanac-wizard-ghost" });
    }
    box.createDiv({
      cls: "almanac-wizard-schematic-note",
      text: this.draft.size
        ? "Set by hand. Choose Auto above to let the chart type and the range decide instead."
        : `Auto: a ${this.typeWord()} over ${RANGE_LABELS[
            this.draft.range
          ].toLowerCase()} sizes to this.`,
    });
  }

  // Delete, and the repeat-add shortcut on a new chart.
  //
  // Delete sits in the footer rather than in the toolbar it used to have a
  // button of its own in: since 2.47 the section's Edit… and Remove… are one
  // control, and this is where the second half of it went. It is `mod-warning`
  // and deliberately not adjacent to the CTA — the base class puts Back and
  // Next between them.
  //
  // Delete is drawn on EVERY step. It acts on the chart that is already in the
  // note rather than on the draft, so no page of this window is more or less
  // qualified to offer it, and hiding it behind a Next would be a step that
  // exists to reach a button.
  protected decorateFooter(footer: HTMLElement, last: boolean): void {
    if (this.chartable.length === 0) return;

    if (!this.isNew && this.opts.onDelete) {
      const del = footer.createEl("button", {
        text: "Delete",
        cls: "mod-warning",
      });
      del.setAttr("title", "Remove this chart from the note");
      del.addEventListener("click", () => void this.remove());
    }

    // Charts arrive in sets far more often than singly — you sit down to build
    // a Trends section, not to add one line. Without this every chart after the
    // first is a round trip out to the toolbar and back in through Add. On the
    // last step only: it commits, and a commit offered from the page before the
    // one that validates it would be a Save wearing a Next's clothes.
    if (this.isNew && last) {
      const again = footer.createEl("button", { text: "Add and start another" });
      again.addEventListener("click", () => void this.submitDraft(true));
    }
  }

  // The one page with no steps needs a way out that isn't Cancel-or-Save.
  protected renderFooter(footer: HTMLElement): void {
    if (this.chartable.length === 0) {
      const close = footer.createEl("button", { text: "Close", cls: "mod-cta" });
      close.addEventListener("click", () => this.close());
      return;
    }
    super.renderFooter(footer);
  }

  protected async commit(): Promise<void> {
    await this.opts.onSave({ ...this.draft });
  }

  // The shared chrome's own submit path (Enter, and the Save CTA) validates,
  // commits and closes. "Add and start another" needs the first two without
  // the third, so both routes go through here and differ only in what they do
  // afterwards.
  private async submitDraft(addAnother: boolean): Promise<void> {
    const problem = this.validate();
    if (problem) {
      this.showError(problem);
      return;
    }
    await this.commit();

    if (!addAnother) {
      this.close();
      return;
    }
    // Keep the shape and change only the subject — the next chart in a Trends
    // section is usually the same type and range over a different tracker.
    const used = this.draft.tracker;
    const next = this.chartable.find((t) => t.id !== used) ?? this.chartable[0];
    this.draft = { ...this.draft, tracker: next.id };
    // BUT NOT THE TITLE (4.45). Everything else here is carried forward because
    // the next chart in a Trends section is usually the same shape over a
    // different tracker — and a title is the one field that described the chart
    // just saved. Carried over, it would name the new chart after the old one,
    // silently, on a page where both are visible. `journal-chart-ui.ts` states
    // the same rule for the same field.
    delete this.draft.title;
    this.reconcile();
    this.clearError();
    // Back to the top of the flow rather than a repaint in place. The subject
    // is the thing that changed, and the step named "what to plot" is where it
    // is chosen — landing on "how to draw it" would open the next chart on the
    // page whose answers were carried over unchanged.
    this.goTo(0);
    new Notice("Chart added. Next one…");
  }

  private async remove(): Promise<void> {
    if (!this.opts.onDelete) return;
    await this.opts.onDelete();
    this.close();
  }
}

export function openChartEditor(
  app: App,
  plugin: AlmanacPlugin,
  opts: ChartEditorOptions
): void {
  new ChartEditModal(app, plugin, opts).open();
}
