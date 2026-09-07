// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The journal chart editor.
//
// The counterpart of chart-ui.ts, for the region journal-charts.ts manages.
// Same move for the same reason: one window with every field visible, rather
// than a chain of suggesters you cannot see your earlier answers in.
//
// It is a much smaller form than the diary's, and the difference is the point.
// A diary chart has to be told a type, a range and sometimes a scope, because
// the chart system needs a window to read and a folder to read it from. A
// journal chart is told none of those: its scope is the host note's own
// folder, and neither shape has a time window to choose. So what is left is
// the subject (which tracker), the question (which of the two shapes), and a
// title — and there are no dependencies between them, so nothing here has to
// be redrawn when something above it changes.
//
// IT CANNOT OFFER A CHART THAT REFUSES. The tracker list is filtered through
// `journalChartRefusal` — the widget's own refusal, not a second copy of its
// conditions — so every chart this window can save is one that draws. Because
// the window is opened *on a note*, it has the thing chart-ui never does: the
// host, and therefore the journal type to ask the refusal about.

import { App, Notice, Setting } from "obsidian";
import { EditorModal } from "../ui/editor-modal";
import type ChronoAnvilPlugin from "../main";
import { journalChartRefusal } from "./charts";
import { describeSurface } from "../trackers/trackers";
import type { TrackerDef, TrackerSurface } from "../trackers/trackers";
import { journalTypeNamer } from "../trackers/entry-trackers";
import { journalTypeAtPath } from "../journals/journal";
import type { JournalType } from "../journals/journal";
import { cleanLabel } from "./journal-charts";
import type { JournalChartShape, JournalChartSpec } from "./journal-charts";

export const SHAPE_LABELS: Record<JournalChartShape, string> = {
  trend: "Trend over time — which way it is going",
  breakdown: "Ranked breakdown — where you are weakest",
};

// Every journal tracker that would actually draw on a note of `typeId`.
//
// Deliberately expressed as "the ones the widget would not refuse" rather than
// as its own set of conditions. The rule — numeric value, journal surface,
// surface admits this type — is stated once, in journalChartRefusal, and this
// window asks it rather than restating it. A picker whose offer set drifts
// from the widget's refusal set is how you get an option that saves a chart
// which then renders an error message.
export function chartableJournalTrackers(
  trackers: TrackerDef[],
  typeId: string | null,
  surfaceName: (s: TrackerSurface) => string
): TrackerDef[] {
  return trackers.filter(
    (t) => journalChartRefusal(t, t.id, typeId, surfaceName) == null
  );
}

// What this shape reads, in the host journal's own vocabulary — so a Cooking
// journal is told about Sections rather than Topics. The one thing about a
// journal chart that isn't in the form: scope comes from the note it sits on,
// which is a fact about where you are rather than a field you fill.
export function scopeNote(type: JournalType | null, shape: JournalChartShape): string {
  const top = type?.levels[0]?.noun ?? "index";
  const child = type?.levels[1]?.noun ?? null;
  const lowerChild = child?.toLowerCase() ?? "";

  if (shape === "trend") {
    return child
      ? `Reads the dated notes in this note's folder — on a ${top} index that is every ${lowerChild} beneath it, on a ${child} index just that ${lowerChild}'s own notes. Needs at least two readings; one is a dot, not a trend.`
      : `Reads the dated notes in this note's folder. Needs at least two readings; one is a dot, not a trend.`;
  }
  return child
    ? `One bar per thing below this note, worst first — on a ${top} index that is one per ${lowerChild}; a ${child} index holds notes rather than folders, so it ranks the rated notes instead.`
    : `One bar per thing below this note, worst first. A ${top} holds notes rather than folders, so it ranks the rated notes rather than sub-folders.`;
}

// How one chart reads in the Edit…/Remove… picker. Enough to tell two charts
// of the same tracker apart, which is the case the picker exists for — a
// subject page carrying both readings of Confidence is the documented common
// one.
export function describeJournalChart(
  spec: JournalChartSpec,
  def: TrackerDef | undefined
): string {
  const name = def?.label || spec.tracker;
  const shape = spec.shape === "trend" ? "trend" : "ranked";
  const label = cleanLabel(spec.label ?? "");
  return label ? `${name}  ·  ${shape}  ·  “${label}”` : `${name}  ·  ${shape}`;
}

export type JournalChartDraft = Omit<JournalChartSpec, "key">;

export interface JournalChartEditorOptions {
  // The note the region lives on. Supplies the journal type, which is what
  // makes the refusal answerable — see the header comment.
  notePath: string;
  spec?: JournalChartSpec;
  onSave: (draft: JournalChartDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
}

// ON THE SHARED FRAME SINCE 2.56.10, AND NOT AS A WIZARD.
//
// §4.2 of the 2.56 plan said this window should go "onto `SteppedEditorModal`,
// two steps, the same split: what to plot, then how to draw it". It is on the
// shared frame; it is not stepped, and the reason is the paragraph at the top
// of this file. The diary's editor has a tracker, a scope, a range, a type,
// sometimes a second tracker, an average and a size — seven fields with real
// dependencies, which is a flow. This one has three fields and no dependencies
// at all, and splitting three independent fields across two pages would be §3's
// complaint one level up: a step you press Next through. The tracker wizard
// already drops its middle step for exactly this, when a type has nothing to
// configure.
//
// What §4 was actually about is that the two editors were built out of
// different parts. This one hand-rolled its `<h3>`, its error line, its button
// row and its Enter handling while the diary's got all four from the frame —
// so a bug fixed in one could not reach the other, and 2.55.5's wizard work
// widened the gap. `EditorModal` is the single-page frame and this is a single
// page. That is the whole fix.
class JournalChartEditModal extends EditorModal {
  private draft: JournalChartDraft;
  private readonly isNew: boolean;
  private readonly type: JournalType | null;
  private readonly chartable: TrackerDef[];
  private scopeEl: HTMLElement | null = null;
  // The spec's tracker when the picker can no longer offer it, else null.
  private readonly staleTracker: string | null;

  constructor(
    app: App,
    plugin: ChronoAnvilPlugin,
    private opts: JournalChartEditorOptions
  ) {
    super(
      app,
      plugin,
      opts.spec ? "Edit chart" : "New chart",
      // The one thing the fields cannot say: a journal chart reads the folder
      // of the note it sits on, so there is no scope to choose and none to
      // wonder about. Stated once up here rather than repeated in each field's
      // description.
      "A journal chart reads the notes under this one — it has no range to pick and no folder to point at, so all it needs is what to plot and which of the two readings to draw.",
      opts.spec ? "Save" : "Add chart"
    );
    this.isNew = !opts.spec;
    this.type = journalTypeAtPath(plugin, opts.notePath) ?? null;
    const namer = journalTypeNamer(plugin);
    this.chartable = chartableJournalTrackers(
      plugin.settings.trackers,
      this.type?.id ?? null,
      (surface) => describeSurface(surface, namer)
    );
    this.draft = opts.spec
      ? { shape: opts.spec.shape, tracker: opts.spec.tracker, label: opts.spec.label }
      : { shape: "trend", tracker: this.chartable[0]?.id ?? "" };
    const named = this.draft.tracker;
    this.staleTracker =
      named && !this.chartable.some((t) => t.id === named) ? named : null;
  }

  private trackerDef(): TrackerDef | undefined {
    return this.chartable.find((t) => t.id === this.draft.tracker);
  }

  protected renderBody(): void {
    const contentEl = this.body;

    // The whole form stands aside for one sentence when there is nothing to
    // offer — a window of dropdowns with nothing in them explains less. The
    // same move chart-ui makes when no tracker is chartable.
    if (this.chartable.length === 0) {
      contentEl.createEl("p", {
        cls: "ca-chart-empty",
        text: this.type
          ? `${this.type.name} has no numeric tracker to chart yet. 🎯 Confidence ships with every journal — if it has been removed, or you want to plot something of your own, add a number tracker on this journal's surface in Settings → Trackers.`
          : "This note isn't inside a journal, so there are no journal trackers to offer. Charts belong on a journal's index notes.",
      });
      return;
    }

    new Setting(contentEl)
      .setName("Chart")
      .setDesc(
        "Two readings of the same numbers. The trend says which way you are going; the breakdown says where to go next, and only the second changes what you open."
      )
      .addDropdown((d) => {
        for (const [k, label] of Object.entries(SHAPE_LABELS)) d.addOption(k, label);
        d.setValue(this.draft.shape).onChange((v) => {
          this.draft.shape = v as JournalChartShape;
          this.scopeEl?.setText(scopeNote(this.type, this.draft.shape));
        });
      });

    new Setting(contentEl)
      .setName("Tracker")
      .setDesc(
        "Every numeric tracker this journal can carry. A tracker missing from this list either isn't a number, or belongs to the diary or to another journal — in any of those cases the chart would draw nothing."
      )
      .addDropdown((d) => {
        // A saved chart may name a tracker that is no longer offered here —
        // deleted from Settings, retyped, or moved to another surface. Setting
        // a <select> to a value with no matching option leaves selectedIndex
        // at -1, so the control rendered *empty*: the one piece of information
        // the reader needs (what this chart currently points at) was the thing
        // the window hid, while validate() refused to save without saying
        // which tracker it meant.
        //
        // The stale id gets an option of its own instead, marked and selected.
        // It cannot be saved — validate() still refuses it — but the refusal
        // now names something visible on screen.
        if (this.staleTracker) {
          d.addOption(this.staleTracker, `⚠️ ${this.staleTracker} — unavailable`);
        }
        for (const t of this.chartable) d.addOption(t.id, `${t.label}  ·  ${t.id}`);
        d.setValue(this.draft.tracker).onChange((v) => {
          this.draft.tracker = v;
          this.clearError();
        });
      });

    new Setting(contentEl)
      .setName("Title")
      .setDesc(
        "Optional. Left empty the chart titles itself with the tracker's own name, which is what you want unless the note holds two charts of the same thing."
      )
      .addText((t) => {
        t.setPlaceholder(this.trackerDef()?.label ?? "")
          .setValue(this.draft.label ?? "")
          .onChange((v) => {
            this.draft.label = v;
          });
      });

    // Not a field: scope comes from the note this was opened on. Stated rather
    // than asked, the same way chart-ui states a tracker's scope when its class
    // gives only one answer.
    this.scopeEl = contentEl.createDiv({
      cls: "ca-chart-scope",
      text: scopeNote(this.type, this.draft.shape),
    });

    // Said on open, not on submit. The chart is already broken; waiting for
    // the reader to press Save before mentioning it would make them discover
    // it by being refused.
    if (this.staleTracker) {
      this.showError(
        `This chart plots "${this.staleTracker}", which this journal can no longer carry. Pick another tracker, or delete the chart.`
      );
    }
  }

  protected renderFooter(footer: HTMLElement): void {
    // The empty window needs a way out that is neither Cancel nor Save.
    if (this.chartable.length === 0) {
      const close = footer.createEl("button", { text: "Close", cls: "mod-cta" });
      close.addEventListener("click", () => this.close());
      return;
    }

    const cancel = footer.createEl("button", { text: "Cancel" });
    cancel.addEventListener("click", () => this.close());

    if (!this.isNew && this.opts.onDelete) {
      const del = footer.createEl("button", { text: "Delete", cls: "mod-warning" });
      del.addEventListener("click", () => void this.remove());
    }

    // Charts arrive in sets more often than singly here too, and the set is
    // usually the pair: the trend and the ranking of one tracker on one
    // subject page. See nextShape below.
    if (this.isNew) {
      const again = footer.createEl("button", { text: "Add and start another" });
      again.addEventListener("click", () => void this.submit(true));
    }

    const save = footer.createEl("button", {
      text: this.saveLabel,
      cls: "mod-cta",
    });
    save.addEventListener("click", () => void this.trySubmit());
  }

  protected validate(): string | null {
    if (this.chartable.length === 0) return null;
    if (!this.draft.tracker) return "Pick a tracker to chart.";
    if (!this.trackerDef()) {
      return `"${this.draft.tracker}" isn't a tracker this journal can chart — pick another, or delete the chart.`;
    }
    return null;
  }

  // The frame's commit path: validate() has already passed.
  protected async commit(): Promise<void> {
    await this.write();
  }

  private async submit(addAnother: boolean): Promise<void> {
    const problem = this.validate();
    if (problem) {
      this.showError(problem);
      return;
    }
    await this.write();
    if (!addAnother) {
      this.close();
      return;
    }
    this.startAnother();
  }

  private async write(): Promise<void> {
    const label = cleanLabel(this.draft.label ?? "");
    await this.opts.onSave({
      shape: this.draft.shape,
      tracker: this.draft.tracker,
      ...(label ? { label } : {}),
    });

  }

  // The other reading of the same tracker, not a blank form and not a copy:
  // the trend and the breakdown are the documented pair, so that is what the
  // next one should start on. The title is dropped — it described the chart
  // just saved.
  private startAnother(): void {
    this.draft = {
      shape: this.draft.shape === "trend" ? "breakdown" : "trend",
      tracker: this.draft.tracker,
    };
    // `refreshBody`, not a hand-rolled empty-and-reopen. The old version called
    // `contentEl.empty()` and then `onOpen()` again, which rebuilt the head and
    // the footer along with the fields — and would have discarded the frame's
    // own error element with them.
    this.clearError();
    this.refreshBody();
    new Notice("Chart added. Next one…");
  }

  private async remove(): Promise<void> {
    if (!this.opts.onDelete) return;
    await this.opts.onDelete();
    this.close();
  }
}

export function openJournalChartEditor(
  app: App,
  plugin: ChronoAnvilPlugin,
  opts: JournalChartEditorOptions
): void {
  new JournalChartEditModal(app, plugin, opts).open();
}
