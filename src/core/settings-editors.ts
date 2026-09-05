// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Editor modals for the settings tab's list-managed collections.
//
// Trackers and journal types are *collections* — a list you add to, reorder and
// delete from, where each member has a dozen fields of its own. Editing those
// fields inline, in the settings tab, meant every expanded item shoved the rest
// of the page down and every type change (which re-renders to swap the range
// fields in or out) redrew the whole tab and threw away scroll position. The
// settings page is now a list of rows; the fields live in a modal over it.
//
// The event editor (event-ui.ts) already worked exactly this way and is the
// pattern these follow: one modal, opened with a draft, which either commits
// the draft on save or discards it on cancel. Drafts are copies, so Escape is a
// real cancel rather than "stop typing and keep whatever landed".

import { App, Menu, Notice, Setting, setIcon } from "obsidian";
// Moved to list-row.ts in 2.55.4 so the template editor could use it too —
// this file imports that editor, so it importing back would have been a cycle,
// which is why a component used by three files lived inside one of them.
// Re-exported because settings.ts already imports it from here.
import { createListRow } from "../ui/list-row";
import type { ListRowOptions } from "../ui/list-row";
export { createListRow };
export type { ListRowOptions };
import { EditorModal, SteppedEditorModal } from "../ui/editor-modal";
import type { WizardStep, ValidationProblem } from "../ui/editor-modal";
import {
  diffKinds,
  isHandEdited,
  kindChangeNeedsConfirming,
  sectionsPresent,
} from "../journals/journal-plan";
import type { KindChange } from "../journals/journal-plan";
import { confirmAction, confirmPlan, promptText } from "../ui/modals";
import { openTemplateEditor } from "../ui/template-editor";
import type { JournalSection } from "../journals/journal-sections";
import {
  JOURNAL_SECTIONS,
  findSection,
  sectionContext,
} from "../journals/journal-sections";
import { resolveLayoutFor } from "../journals/layout-transfer";
import type { SectionOverrides } from "../journals/journal-sections";
import { getFile, noteTypeOf, plural } from "./util";
import { repaintOpenNotes } from "../ui/livewidget";
import { confirmKindChange } from "../journals/kind-change";
import {
  applyDashboardCatchups,
  findDashboardCatchups,
} from "../journals/dashboard-catchup";
import type { KindChangeCounts } from "../journals/kind-change";
import type ChronoAnvilPlugin from "../main";
import { DEFAULT_MOOD_FACES } from "./constants";
import {
  CLASS_DEFS,
  TRACKER_CLASSES,
  TrackerClass,
  TrackerDef,
  TrackerSurface,
  TrackerType,
  diaryClassOf,
  diaryClassesOf,
  recordsNothing,
  diarySurface,
  journalSurface,
  propertyNameFromLabel,
  surfaceKey,
  uniquePropertyName,
} from "../trackers/trackers";
import { registeredJournalTypes, variantKinds } from "../journals/journal";
import {
  JournalConfig,
  JournalKindConfig,
  JournalVariantConfig,
  buildJournalType,
  deriveJournalFolders,
  journalFolderName,
  normaliseLevels,
  slugify,
} from "../journals/custom-journal";
import {
  TemplateLayout,
  TemplateTarget,
  chosenSectionIds,
  sectionsFor,
  templateTargets,
  splitLayoutTargets,
} from "../journals/journal-sections";
import { notify } from "./notify";
import { journalFoldersOnDisk, removeJournal } from "./journal-removal";

export const TRACKER_TYPE_LABELS: Record<TrackerType, string> = {
  number: "Number (stepper)",
  scale: "Scale (face picker)",
  boolean: "Yes/No (habit)",
  time: "Time",
  date: "Date",
  select: "Select (dropdown)",
  tags: "Tags (list)",
};

// The types a reader may CREATE. `tags` is not one of them, for the reason
// `derived` is not: it is a built-in the plugin owns, its property name is
// Obsidian's rather than the registry's, and a second tracker writing a list
// into `tags` would be two windows editing one property with no way to say
// which won. The label above still exists because the Trackers list draws the
// built-in's row using it.
export const CREATABLE_TRACKER_TYPES: TrackerType[] = [
  "number",
  "scale",
  "boolean",
  "time",
  "date",
  "select",
];

// Dropdown labels for the class, derived from the class table so a new class
// arrives here without an edit.
export const TRACKER_CLASS_LABELS: Record<TrackerClass, string> = Object.
  fromEntries(
    TRACKER_CLASSES.map((c) => [c, `${CLASS_DEFS[c].label} entries`])
  ) as Record<TrackerClass, string>;

// Every surface a user-defined tracker may be given, as (key, label, surface)
// triples in dropdown order: the diary classes first (shortest period first,
// the canonical order), then the all-journals surface, then one entry per
// registered journal type.
//
// `typeId: null` — every journal, present and future — used to be withheld
// here on the grounds that it would let one tracker span types whose notes
// have nothing in common beyond being journals. That was the wrong reading of
// the wrong question. It is exactly the surface the journal built-ins use, and
// the things a reader wants on every journal note are the same *sort* of
// things: a "Minutes spent" or a "Source" belongs on a lesson, a recipe and a
// meeting note alike, and scoping it to Study means recreating it, under a
// second property, the day a second journal exists. Offering it also removes
// the trap the old list set: a vault with only Study in it showed "Study
// notes" as the only journal option, so *everything* journal-shaped got
// written as a Study tracker, and each one then had to be widened by hand
// later (or orphaned when Study was turned off).
//
// It is listed above the per-type entries because it is the more general
// answer, and because a reader who genuinely wants "Study only" will scroll
// past a heading that says "Any journal" to find it, whereas one who wanted
// "any" and was shown only "Study" had no way to know they were choosing.
// The dropdown value standing for "somewhere in the diary". Not a surfaceKey:
// see the note in surfaceChoices.
export const DIARY_CHOICE_KEY = "diary";

// How the seeding question names the entries it covers.
//
// `showInTemplate` stays a BOOLEAN meaning "all of this tracker's grains",
// rather than becoming a set of its own. Per-grain seeding is expressible —
// "in the daily template but not the weekly one" — and it is a question nobody
// has needed to ask; a second set beside `surface` would be a second thing to
// keep in step for a distinction that has never come up. If it ever does, this
// is the field that changes, and this comment is the note that it was a choice.
//
// One grain names itself, because "on every new daily entry" is more useful
// than a generic phrase when there is only one. Several do not: listing five
// adjectives in a setting name is a sentence, not a label.
// Returns the whole noun phrase, not an adjective to be suffixed. The first
// draft returned "entry it can be logged on" for the multi case and the caller
// appended " entry", giving "on every new entry it can be logged on entry".
export function seedingPhrase(surface: TrackerSurface): string {
  const grains = diaryClassesOf(surface);
  return grains.length === 1
    ? `${CLASS_DEFS[grains[0]].adjective} entry`
    : "entry it can be logged on";
}

// The same question asked of the templates rather than the entries.
export function seedingTemplatePhrase(surface: TrackerSurface): string {
  const grains = diaryClassesOf(surface);
  return grains.length === 1
    ? `the ${CLASS_DEFS[grains[0]].adjective} template`
    : "each template it can be logged on";
}

export function surfaceChoices(
  plugin: ChronoAnvilPlugin
): { key: string; label: string; surface: TrackerSurface }[] {
  // ONE DIARY CHOICE, NOT ONE PER GRAIN (2.57.9).
  //
  // This listed every class as its own option, which was right while a tracker
  // belonged to exactly one. Since 2.57.8 it belongs to a SET, and a dropdown
  // cannot express a set — so five grain options would be five ways to pick one
  // grain and no way to pick two, quietly making the new model unreachable from
  // the only place it is edited.
  //
  // The grains move to toggles below. The dropdown answers the question that is
  // genuinely exclusive — diary or journal, which no tracker is both of — and
  // stops pretending to answer the one that is not.
  //
  // The key is fixed rather than `surfaceKey`, because surfaceKey now varies
  // with the set: a tracker on daily+monthly would match no option and the
  // dropdown would silently show the first one instead.
  const out = [
    {
      key: DIARY_CHOICE_KEY,
      label: "📅 Diary entries",
      surface: diarySurface("daily"),
    },
  ];
  const anyJournal = journalSurface(null);
  out.push({
    key: surfaceKey(anyJournal),
    label: "📔 All journals",
    surface: anyJournal,
  });
  for (const type of registeredJournalTypes(plugin)) {
    const surface = journalSurface(type.id);
    out.push({
      key: surfaceKey(surface),
      label: `${type.emoji} ${type.name} notes only`,
      surface,
    });
  }
  return out;
}
// ── Tracker editor ────────────────────────────────────────────────────────
//
// Edits a copy. `onSave` receives the finished definition and is responsible
// for putting it into the registry (push for new, splice-in-place for edit) —
// the modal has no opinion about where in the list it goes.
//
// THREE STEPS SINCE 2.55.5, and the plan for them was half wrong.
//
// §4 called this "the densest form in the plugin" and said all of it was
// visible at once. The sweep in 2.55.1 corrected that: `Range and step`,
// `Faces`, `Options` and `Colour the diary calendar` were already inside
// conditionals, so the win here was never revelation. It is SEQUENCING, and
// two things fall out of it that a flat form could not have:
//
//   the Type dropdown no longer repaints the window. Every field it gates
//   moved to the step after it, so changing Type is a plain assignment
//   instead of a redraw that stole focus back to the Label field above;
//   "Colour the diary calendar" is drawn beside Surface, which is the field
//   that decides whether it may exist at all. In the flat form the two sat
//   four settings apart and changing the lower one made the upper appear.
//
// Exported for test/wizard-steps.test.ts, which builds one and asks it what it
// would draw. Constructing a modal touches no DOM — onOpen() does — so the step
// list, the head strings, the per-step validators and applyTypeChange are all
// reachable from a plain unit test. Same one line of API surface that
// JournalEditModal already spends, and for the same reason.
//
// WHAT IT MEASURES → HOW IT BEHAVES → WHERE IT APPEARS. The last step is the
// one that teaches, as the journal designer's Sections step is, because
// placement is the part a reader cannot picture from the field names — hence
// the schematic under it rather than beside the fields it is a preview of.
export class TrackerEditModal extends SteppedEditorModal {
  private draft: TrackerDef;
  // Raw text of the min/max/step inputs, so a non-numeric entry can be
  // reported as such instead of being silently stored as NaN.
  //
  // NOT cleared when the body repaints, which it was until the wizard existed.
  // A repaint used to mean "the type changed, so these inputs are new"; it now
  // also means "the reader pressed Back", and clearing on that would have let
  // a NaN through: type "abc" into Min, fail the step, step back, step
  // forward, and validate() would find an empty raw map and a draft holding
  // NaN. It is seeded from the draft when a field draws instead, so the input
  // shows what the reader typed rather than the string "NaN".
  private rawNums: { min?: string; max?: string; step?: string } = {};
  // Whether the property name is still tracking the label.
  //
  // True only while the tracker is NEW and nobody has typed in the property
  // field. Both halves matter, and for different reasons:
  //
  //   an EXISTING tracker's id is the frontmatter key already written into
  //   every note that has logged it, so re-deriving it from an edited label
  //   would silently start a second property and strand the readings — the
  //   same trap normaliseKinds preserves ids against. Renaming a label is a
  //   relabel, not a migration;
  //   once the reader has typed a property name, it is theirs. An override
  //   that keeps being overwritten by the next keystroke in the label field
  //   is not an override.
  //
  // There is no way back to following once it is off, which is deliberate:
  // the field shows what it will write, so "make it match again" is done by
  // clearing it and letting the derivation refill it (see below).
  private idFollowsLabel: boolean;
  // The live property input, so a change to the label can repaint it without
  // rebuilding the field under the reader's cursor. Nulled on every body
  // repaint: once step 1 is off screen the element it points at is detached,
  // and writing to a detached input is a value nobody will ever see.
  private idInput: HTMLInputElement | null = null;

  constructor(
    app: App,
    plugin: ChronoAnvilPlugin,
    def: TrackerDef,
    // Retained (not just consumed by super) because the class field warns
    // about reclassifying an existing tracker, which a new one can't do.
    private isNew: boolean,
    // The live registry entry being edited, so validate() can exclude it from
    // its own duplicate-property check. Undefined while adding a new tracker.
    private original: TrackerDef | undefined,
    private onSave: (def: TrackerDef) => Promise<void>,
    private onDismiss?: () => void
  ) {
    super(
      app,
      plugin,
      isNew ? "New tracker" : "Edit tracker",
      "A tracker becomes a widget in the entries of its class and, optionally, a Diary.base column. Numbers and times can be charted.",
      isNew ? "Add tracker" : "Save"
    );
    this.draft = { ...def, faces: def.faces ? [...def.faces] : undefined };
    this.idFollowsLabel = isNew;
    // A new tracker opens on a placeholder label and a matching placeholder
    // id; derive once up front so the two agree before a single key is
    // pressed, rather than only from the first keystroke onwards.
    if (this.idFollowsLabel) this.deriveId();
  }

  // An existing tracker can be saved from any step. See SteppedEditorModal:
  // it arrived with every answer already filled in, and the reader almost
  // always came to change one of them.
  protected get savableFromAnyStep(): boolean {
    return !this.isNew;
  }

  // ── the flow ───────────────────────────────────────────────────────────

  // Three steps, EXCEPT for the types that have nothing in the middle one.
  //
  // A Yes/No, a Time and a Date have no range, no faces and no options: their
  // "how it behaves" step would be a page with one sentence on it explaining
  // that there is nothing to decide. §3 of the plan is that a control whose
  // value cannot change is worse than no control, and a *step* you press Next
  // through is the same complaint one level up — so the step is drawn when it
  // has fields in it and left out when it hasn't. The rail counts what it is
  // given, so a Yes/No tracker simply shows two pips.
  protected stepList(): WizardStep[] {
    const steps: WizardStep[] = [
      {
        title: "What it measures",
        subtitle:
          "What this is called, which frontmatter key it writes, and what shape its values are. The answer to the last one decides what there is to set next.",
        render: (h) => this.renderMeasures(h),
        validate: () => this.validateMeasures(),
      },
    ];
    if (this.hasBehaviourFields) {
      steps.push({
        title: "How it behaves",
        subtitle: this.behaviourSubtitle(),
        render: (h) => this.renderBehaviour(h),
        validate: () => this.validateBehaviour(),
      });
    }
    steps.push({
      title: "Where it appears",
      subtitle:
        "Which entries may carry this tracker, and which of them start with it already there.",
      render: (h) => this.renderPlacement(h),
    });
    return steps;
  }

  // Whether the middle step has anything on it. One question asked in one
  // place, so "add a type with settings of its own" is an edit here rather
  // than a step that silently stays empty.
  private get hasBehaviourFields(): boolean {
    const t = this.draft.type;
    return t === "number" || t === "scale" || t === "select";
  }

  private behaviourSubtitle(): string {
    switch (this.draft.type) {
      case "scale":
        return "The range the faces map across, and the faces themselves.";
      case "select":
        return "The values this writes and the labels shown for them.";
      default:
        return "The bounds of the stepper, what unit it counts in, and how a month's worth of readings collapse into one point on a chart.";
    }
  }

  protected renderBody(): void {
    // Both live-element handles belong to fields that may not be on the step
    // about to be drawn. Cleared here rather than in each renderer, so a new
    // step cannot inherit a pointer into the last one's DOM.
    this.idInput = null;
    super.renderBody();
  }

  // Recompute the property name from the label, if it is still following.
  // Deduped against the rest of the registry so typing a label whose name is
  // taken lands on a free one instead of on a save-blocking clash — the
  // duplicate check in validate() stays, for the id a reader types by hand.
  private deriveId(): void {
    if (!this.idFollowsLabel) return;
    const base = propertyNameFromLabel(this.draft.label);
    // An empty derivation (a label of nothing but emoji, or nothing at all)
    // leaves the id alone rather than blanking it. validate() already refuses
    // an empty property name, and it should complain about a field the reader
    // emptied, not about one this quietly emptied for them.
    if (base === "") return;
    this.draft.id = uniquePropertyName(
      base,
      this.plugin.settings.trackers
        .filter((t) => t !== this.original)
        .map((t) => t.id)
    );
    if (this.idInput) this.idInput.value = this.draft.id;
  }

  // What changing the Type dropdown does to the draft.
  //
  // A METHOD, NOT A CLOSURE, and for the reason 2.54.6 established: the
  // Name field's guard was the exact inverse of the comment above it and
  // survived a release because nothing without a DOM could reach it. This is
  // the other decision in this file with real consequences — it DELETES
  // fields — so it comes out of the dropdown's callback and gets asserted.
  //
  // Every branch here was in that callback and is unchanged. The one thing
  // that is gone is the `refreshBody()` at the end: the fields this reconciles
  // are on the step after this one, so there is nothing on screen to redraw.
  protected applyTypeChange(type: TrackerType): void {
    const t = this.draft;
    t.type = type;
    // Drop the fields the new type has no use for. Without this a number
    // switched to a select keeps a stale min/max/step/unit, which is then
    // written to settings and read back by the widget code as though the
    // tracker still had a range.
    //
    // number and scale both use min/max/step (a scale is a small bounded
    // range with faces on top), so a range only clears when leaving both.
    const rangeless = t.type !== "number" && t.type !== "scale";
    if (rangeless) {
      delete t.min;
      delete t.max;
      delete t.step;
      delete t.unit;
      delete t.reduce;
      // The raw text belongs to inputs that no longer exist. Left behind, it
      // would fail validation on a field the reader cannot see to correct.
      this.rawNums = {};
    }
    if (t.type === "scale") {
      // A scale needs a bounded range and faces to render the picker; seed
      // sensible defaults so switching to it isn't a broken widget the user
      // has to repair before it works.
      if (t.min == null) t.min = 1;
      if (t.max == null) t.max = 5;
      if (t.step == null) t.step = 1;
      if (!t.faces || t.faces.length < 2) t.faces = [...DEFAULT_MOOD_FACES];
      delete t.unit; // a scale's values are faces, not a "5 km" magnitude
      delete t.reduce; // and a scale's sum is meaningless
    } else {
      // Faces only mean something for a scale.
      delete t.faces;
    }
    if (t.type === "number" && t.step == null) t.step = 1;
    if (t.type !== "select") delete t.options;
    // NOT touched here, deliberately: `heatmap` and the `moodTrackerId`
    // global. A scale that claimed the calendar and is then switched to a
    // number leaves the global naming a tracker that can no longer supply a
    // value — which is a real defect, and it is one this method arrived with.
    // §4.4: land the step split with the output identical, then change
    // anything else in a patch that can be bisected on its own.
  }

  // Claim or release the calendar heat map.
  //
  // The source is a single global, so setting it here claims it for this
  // tracker; unsetting only clears it if this tracker was the one holding it,
  // and toggling an unrelated tracker off therefore cannot wipe another's.
  private setHeatmap(on: boolean): void {
    const t = this.draft;
    if (on) this.plugin.settings.moodTrackerId = t.id;
    else if (this.plugin.settings.moodTrackerId === t.id) {
      this.plugin.settings.moodTrackerId = "";
    }
    // Stored as an explicit false rather than as absence, which is what the
    // flat form wrote and what normalizeTrackers reads back.
    t.heatmap = on;
  }

  // ── step 1: what it measures ───────────────────────────────────────────

  private renderMeasures(host: HTMLElement): void {
    const t = this.draft;

    new Setting(host)
      .setName("Label")
      .setDesc('Widget label and Diary.base column header, e.g. "🏃 KM".')
      .addText((c) => {
        c.setPlaceholder("🏃 KM");
        c.setValue(t.label);
        c.onChange((v) => {
          t.label = v;
          this.deriveId();
        });
        window.setTimeout(() => c.inputEl.focus(), 0);
      });

    new Setting(host)
      .setName("Property name")
      .setDesc(
        this.idFollowsLabel
          ? "The frontmatter key this writes to. It follows the label — type here to set it yourself, and it stops following."
          : this.isNew
            ? "The frontmatter key this writes to. Clear it to go back to following the label."
            : "The frontmatter key this writes to. Changing it starts a new property — entries already written keep their original one."
      )
      .addText((c) => {
        this.idInput = c.inputEl;
        c.setPlaceholder("Distance")
          .setValue(t.id)
          .onChange((v) => {
            const typed = v.trim();
            // Emptying the field on a NEW tracker hands the name back to the
            // label rather than leaving the reader with a save they can't
            // make — it is the only "undo my override" gesture the field can
            // offer, and it is the obvious one. On an existing tracker it
            // stays empty and validate() refuses, because there is no
            // following state to return to.
            if (typed === "" && this.isNew) {
              this.idFollowsLabel = true;
              this.deriveId();
              return;
            }
            this.idFollowsLabel = false;
            t.id = typed;
          });
      });

    new Setting(host)
      .setName("Type")
      .setDesc(
        "Decides which widget the daily note draws for this tracker, and what there is to set on the next step."
      )
      .addDropdown((d) => {
        for (const value of CREATABLE_TRACKER_TYPES) {
          d.addOption(value, TRACKER_TYPE_LABELS[value]);
        }
        d.setValue(t.type).onChange((v) => {
          // In the flat form this callback ended in refreshBody(), which
          // rebuilt the two text fields above and pulled focus back to the
          // Label on every type change. Every field the type gates now lives
          // on a later step, so there is nothing under the reader to redraw.
          //
          // The RAIL can still change length — a type with nothing to
          // configure drops the middle step — so the head is repainted, and
          // only when the count actually moved. The head holds no fields.
          const before = this.stepList().length;
          this.applyTypeChange(v as TrackerType);
          if (this.stepList().length !== before) this.refreshHead();
        });
      });
  }

  private validateMeasures(): string | null {
    const id = this.draft.id.trim();
    if (!id) return "Property name can't be empty.";
    // A duplicate property name means two widgets writing the same frontmatter
    // key — the second silently overwrites the first, so block it up front.
    const clash = this.plugin.settings.trackers.some(
      (x) => x !== this.original && x.id === id
    );
    if (clash) return `Another tracker already uses the property "${id}".`;
    if (!this.draft.label.trim()) return "Label can't be empty.";
    return null;
  }

  // ── step 2: how it behaves ─────────────────────────────────────────────

  private renderBehaviour(host: HTMLElement): void {
    const t = this.draft;

    if (t.type === "number" || t.type === "scale") {
      const isScale = t.type === "scale";
      const range = new Setting(host)
        .setName(isScale ? "Range and step" : "Range, step and unit")
        .setDesc(
          isScale
            ? "The numeric range the faces map across, e.g. 1–5. A tap on the nth face writes the value that face lands on."
            : "Leave Min or Max blank for no limit in that direction — a blank Max means the stepper never caps out. Step defaults to 1."
        )
        .setClass("ca-editor-inline-fields");

      // Each numeric field keeps the raw text alongside the parsed value.
      // Number("abc") is NaN, which JSON-serialises to null and quietly
      // breaks the stepper, so validate() checks the raw text and blocks the
      // save rather than storing a broken range.
      const numField = (
        key: "min" | "max" | "step",
        placeholder: string,
        current: number | undefined,
        assign: (n: number | undefined) => void
      ): void => {
        range.addText((c) => {
          c.setPlaceholder(placeholder);
          // The raw text wins where there is any, so a repaint shows the
          // reader what they typed instead of `String(NaN)`.
          c.setValue(
            this.rawNums[key] ?? (current == null ? "" : String(current))
          );
          c.inputEl.addClass("ca-editor-num");
          c.inputEl.setAttribute("aria-label", placeholder);
          c.onChange((v) => {
            const trimmed = v.trim();
            this.rawNums[key] = trimmed;
            assign(trimmed === "" ? undefined : Number(trimmed));
          });
        });
      };

      numField("min", "min", t.min, (n) => (t.min = n));
      numField("max", "max", t.max, (n) => (t.max = n));
      numField("step", "step", t.step, (n) => (t.step = n));

      // Unit is a number-only cosmetic suffix ("5 km"); a scale's values are
      // faces, not a magnitude, so it has none.
      if (!isScale) {
        range.addText((c) => {
          c.setPlaceholder("unit (km, pages…)");
          c.setValue(t.unit ?? "");
          c.inputEl.setAttribute("aria-label", "unit");
          c.onChange((v) => {
            t.unit = v.trim() || undefined;
          });
        });

        // How daily values collapse when a chart buckets them by month
        // (2.52). Offered on plain numbers only: a scale's mean is meaningful
        // and its sum is not, so a scale has no choice to make.
        //
        // "Average" and "Total" rather than "mean" and "sum" — the words are
        // what a reader picking between them actually thinks, and the
        // stored values stay mean/sum because that's what the reduction is.
        range.addDropdown((d) => {
          d.addOption("mean", "chart by month: average");
          d.addOption("sum", "chart by month: total");
          d.setValue(t.reduce ?? "mean");
          d.selectEl.setAttribute("aria-label", "monthly reduction");
          d.onChange((v) => {
            // Absent means mean, so the default is stored as absence rather
            // than as an explicit "mean" — one representation of the default,
            // which is what keeps a settings diff readable.
            t.reduce = v === "sum" ? "sum" : undefined;
          });
        });
      }
    }

    if (t.type === "scale") {
      new Setting(host)
        .setName("Faces")
        .setDesc(
          "Space-separated, low → high, spread across the range above. Emoji or short words — e.g. 😞 😕 😐 🙂 😄, or Low Mid High. At least two."
        )
        .addText((c) =>
          c
            .setPlaceholder(DEFAULT_MOOD_FACES.join(" "))
            .setValue((t.faces ?? DEFAULT_MOOD_FACES).join(" "))
            .onChange((v) => {
              const faces = v.split(/\s+/).filter(Boolean);
              t.faces = faces.length ? faces : undefined;
            })
        );
    }

    if (t.type === "select") {
      new Setting(host)
        .setName("Options")
        .setDesc(
          'One "value=Label" pair per comma, e.g. "low=Low, high=High". The value is written to frontmatter; the label is shown.'
        )
        .addText((c) =>
          c
            .setPlaceholder("low=Low, mid=Medium, high=High")
            .setValue(t.options ?? "")
            .onChange((v) => {
              t.options = v;
            })
        );
    }
  }

  private validateBehaviour(): string | null {
    if (this.draft.type === "number") {
      // A fixed order rather than whatever order the reader typed in. The map
      // used to be walked with Object.entries, so which of two bad fields was
      // named depended on which was touched first — an error message that
      // moves for reasons the reader cannot see.
      for (const key of ["min", "max", "step"] as const) {
        const raw = this.rawNums[key];
        if (raw && !Number.isFinite(Number(raw))) {
          return `${key} must be a number, or blank for no limit.`;
        }
      }
      const { min, max, step } = this.draft;
      if (min != null && max != null && min > max) {
        return "Min can't be greater than Max.";
      }
      if (step != null && step <= 0) {
        return "Step must be greater than zero.";
      }
    }

    if (this.draft.type === "select") {
      const opts = (this.draft.options ?? "").trim();
      if (!opts) return "Add at least one option for a dropdown.";
    }

    return null;
  }

  // ── step 3: where it appears ───────────────────────────────────────────

  private renderPlacement(host: HTMLElement): void {
    const t = this.draft;

    const choices = surfaceChoices(this.plugin);
    new Setting(host)
      .setName("Surface")
      .setDesc(
        this.isNew
          ? "Where this tracker can be logged at all. A daily tracker can't be added to a monthly entry, and a Study tracker can't be added to a note in another journal."
          : "Where this tracker can be logged. Changing it moves the tracker somewhere else; readings already written stay in the notes that hold them. If any exist, you'll be asked to confirm first."
      )
      .addDropdown((d) => {
        for (const c of choices) d.addOption(c.key, c.label);
        d.setValue(
          t.surface.kind === "diary" ? DIARY_CHOICE_KEY : surfaceKey(t.surface)
        ).onChange((v) => {
          const hit = choices.find((c) => c.key === v);
          if (!hit) return;
          // Switching diary → journal drops the grain set, which is correct:
          // a journal tracker has no grains. Switching back restores a default
          // of daily rather than the empty set, so the common case needs no
          // second click.
          t.surface = hit.surface;
          // Every other field on this step is gated on the answer, and so is
          // the schematic under them. This is the one repaint the split did
          // not remove — and now the fields it swaps are the ones directly
          // below the dropdown rather than four settings above it.
          this.refreshBody();
        });
      });

    // ── which grains ──────────────────────────────────────────────────
    //
    // One tracker, many grains — the whole point of 2.57.8, and this is where
    // it is said. A toggle per class rather than a second dropdown, because the
    // answer is a set and a reader ticking two boxes is telling the truth about
    // what they want, where a reader picking one from five is being asked the
    // wrong question.
    if (t.surface.kind === "diary") {
      const grains = new Setting(host)
        .setName("Grains")
        .setDesc(
          "Which diary entries this tracker can be logged on. A tracker on several grains is one tracker — rename it once and every grain follows."
        );

      // A LABELLED CHECKBOX EACH, NOT A ROW OF TOGGLES.
      //
      // 2.57.9 put five `addToggle`s here distinguished only by tooltips, which
      // is five unlabelled switches in a line: a tooltip is a label you have to
      // ask for, and asking five times to find out what a control is means the
      // control does not say what it does.
      //
      // A checkbox rather than a toggle because the answer is a SET. A toggle
      // reads as "this thing is on or off" and belongs beside one subject; a
      // row of checkboxes reads as "tick the ones that apply", which is the
      // question actually being asked. Same reasoning that took the grain out
      // of the dropdown in 2.57.9 — the control's shape should match the shape
      // of the answer.
      // STACKED: the row goes UNDER the description, not beside it.
      //
      // Obsidian's `.setting-item` is a two-column flex — text left, control
      // right — which fits one widget and fights five. Against a three-line
      // description the row got squeezed into whatever the right column had
      // left, and the result read as clutter rather than as a question with
      // five answers.
      //
      // Stacking is a class on the settingEl rather than a bespoke row built
      // outside the Setting, so the name, description and disabled states keep
      // coming from the same place every other setting gets them.
      grains.settingEl.addClass("ca-setting-stacked");
      grains.controlEl.addClass("ca-grain-row");
      for (const c of TRACKER_CLASSES) {
        const label = grains.controlEl.createEl("label", {
          cls: "ca-grain-option",
        });
        const box = label.createEl("input", { type: "checkbox" });
        box.checked = diaryClassesOf(t.surface).includes(c);
        label.createSpan({ text: TRACKER_CLASS_LABELS[c] });
        box.addEventListener("change", () => {
          const now = new Set(diaryClassesOf(t.surface));
          if (box.checked) now.add(c);
          else now.delete(c);
          // Rebuilt through diarySurface rather than mutated in place, so the
          // stored order is the class table's and surfaceKey stays stable.
          t.surface = diarySurface(...TRACKER_CLASSES.filter((k) => now.has(k)));
        });
      }
    }

    const cls = diaryClassOf(t.surface);

    // The heat map shades the *diary* calendar, which reads paths.diaryDaily.
    // A journal tracker promoted to source it would colour a calendar it can
    // never supply a value to — every day blank, and no hint why. Neither
    // built-in journal tracker is a scale, so this is unreachable through
    // them; it guards the user-defined journal scale tracker, which is one
    // dropdown away.
    //
    // MOVED HERE FROM BESIDE `Faces` IN 2.55.5. It is a placement decision —
    // it says where the tracker's values show up — and it is gated on the
    // dropdown directly above it, which in the flat form was four settings
    // below it.
    if (t.type === "scale") {
      if (cls == null) {
        host.createDiv({
          cls: "setting-item-description ca-editor-note",
          text: "Journal trackers can't colour the diary calendar — the heat map reads your daily entries, which this tracker never writes to.",
        });
      } else {
        new Setting(host)
          .setName("Colour the diary calendar")
          .setDesc(
            "Use this scale to shade the calendar heat map (and the monthly average). Only one tracker can — turning it on here takes it off whichever tracker had it."
          )
          .addToggle((c) =>
            c
              .setValue(this.plugin.settings.moodTrackerId === t.id)
              .onChange((v) => {
                this.setHeatmap(v);
                this.refreshBody();
              })
          );
      }
    }

    // Both flags below are diary-only, and the honest control for a field that
    // cannot apply is no control. A journal type has several templates and
    // type-only scoping can't say which one a tracker belongs on; nothing
    // regenerates those templates anyway, so placement there is the user's,
    // made with the "+ Add tracker" tile on the note itself. And a journal
    // tracker's Diary.base column would be blank in every row by construction.
    // ASKED OF THE SURFACE, NOT OF `cls`. This read `cls == null` and meant
    // "journal tracker" — true until 2.57.8, after which `diaryClassOf` also
    // returns null for a diary tracker on SEVERAL grains, because "the class"
    // of a five-grain tracker is not a question with an answer. So ticking a
    // second grain made a diary tracker read the journal branch and be told it
    // is not seeded onto templates, which is flatly wrong. Third instance this
    // release of a two-value assumption outliving the model it was written
    // against.
    if (t.surface.kind === "journal") {
      host.createDiv({
        cls: "setting-item-description ca-editor-note",
        text: "Journal trackers aren't seeded onto templates or added to Diary.base — put this on a note with “+ Add tracker”, or add a tracker: line to that journal's template yourself.",
      });
      this.renderPlacementSchematic(host);
      return;
    }

    new Setting(host)
      .setName(`On every new ${seedingPhrase(t.surface)}`)
      .setDesc(
        `On: written into ${seedingTemplatePhrase(t.surface)}, so every new entry starts with this widget. Off: add it to a single entry, when it applies, with “+ Add tracker” at the end of that entry's logging grid.`
      )
      .addToggle((c) =>
        c.setValue(t.showInTemplate).onChange((v) => {
          t.showInTemplate = v;
          this.refreshBody();
        })
      );

    new Setting(host)
      .setName("Diary.base column")
      .setDesc(
        "Independent of the above — an occasional tracker is usually still worth a column, even though most rows are blank. The column is added to the views that can show this tracker's class."
      )
      .addToggle((c) =>
        c.setValue(t.showInBase).onChange((v) => {
          t.showInBase = v;
          this.refreshBody();
        })
      );

    this.renderPlacementSchematic(host);
  }

  // Where this tracker will and will not turn up, as a list of places.
  //
  // A SCHEMATIC, on the same argument as the journal designer's: the three
  // toggles above it are each individually clear and the *sum* of them is not,
  // because the answer to "so where does this actually show up" is spread over
  // a dropdown, two switches and a rule about journal templates that only
  // appears as prose. This says it in one block, and it says the negatives
  // too — "not in Diary.base" is the half a reader gets wrong.
  private renderPlacementSchematic(host: HTMLElement): void {
    const t = this.draft;
    const cls = diaryClassOf(t.surface);
    const box = host.createDiv({ cls: "ca-wizard-schematic" });
    box.createDiv({
      cls: "ca-wizard-schematic-title",
      text: `${t.label.trim() || "This tracker"} — where it turns up`,
    });
    const stack = box.createDiv({ cls: "ca-wizard-blocks" });

    const place = (on: boolean, icon: string, text: string): void => {
      const block = stack.createDiv({
        cls: `ca-wizard-block${on ? "" : " is-off"}`,
      });
      block.createSpan({ cls: "ca-wizard-block-icon", text: icon });
      block.createSpan({ text });
    };

    if (cls == null) {
      const typeId = t.surface.kind === "journal" ? t.surface.typeId : null;
      const named = registeredJournalTypes(this.plugin).find(
        (j) => j.id === typeId
      );
      place(
        true,
        "📔",
        typeId == null
          ? "Notes in every journal, once you add it to one"
          : `Notes in ${named?.name ?? typeId}, once you add it to one`
      );
      // Not "daily or monthly": that hardcoded pair went stale the moment
      // 2.57.12 added three more grains, and naming five in a negative sentence
      // is worse than naming none.
      place(false, "🗓️", "Not on the diary's entries");
      place(false, "📄", "Not written into any template — “+ Add tracker” puts it on a note");
      place(false, "🧮", "Not a Diary.base column");
      return;
    }

    const adj = seedingPhrase(t.surface);
    place(
      true,
      "🗓️",
      t.showInTemplate
        ? `Every new ${adj}, from its template`
        : `Any ${adj} you add it to with “+ Add tracker”`
    );
    place(t.showInBase, "🧮", t.showInBase
      ? "A column in Diary.base"
      : "Not a Diary.base column");
    if (t.type === "scale") {
      const on = this.plugin.settings.moodTrackerId === t.id;
      place(on, "🎨", on
        ? "Shades the calendar heat map"
        : "Doesn't shade the calendar heat map");
    }
  }

  // ── save ───────────────────────────────────────────────────────────────

  protected async commit(): Promise<void> {
    this.draft.id = this.draft.id.trim();
    this.draft.label = this.draft.label.trim();

    // A diary tracker with no grain ticked records nowhere. Refused here rather
    // than prevented in the toggles: un-ticking the last one is a legitimate
    // step on the way to ticking a different one, and a toggle that refuses to
    // turn off is a worse answer than a sentence at the door.
    if (recordsNothing(this.draft.surface)) {
      notify.fail(
        "Pick at least one grain — this tracker has nowhere to be logged."
      );
      return;
    }
    await this.onSave(this.draft);
  }

  onClose(): void {
    super.onClose();
    this.onDismiss?.();
  }
}

export function openTrackerEditor(
  app: App,
  plugin: ChronoAnvilPlugin,
  def: TrackerDef,
  // `onClose` fires whichever way the modal goes away — saved, cancelled or
  // dismissed. The per-note "New tracker…" flow needs it: it has to carry on
  // (adding the tracker to the note, or not) once the reader is finished, and
  // the save callback alone can't tell it that a cancel has happened.
  opts: { isNew: boolean; original?: TrackerDef; onClose?: () => void },
  onSave: (def: TrackerDef) => Promise<void>
): void {
  new TrackerEditModal(
    app,
    plugin,
    def,
    opts.isNew,
    opts.original,
    onSave,
    opts.onClose
  ).open();
}

// ── Mood settings ─────────────────────────────────────────────────────────
// Mood is a built-in: its property name, type and range are fixed, so it gets
// a small modal for the two things that *are* editable rather than the full
// tracker form.
class MoodEditModal extends EditorModal {
  private faces: string;
  private heatmap: boolean;
  private readonly name: string;

  constructor(
    app: App,
    plugin: ChronoAnvilPlugin,
    private tracker: TrackerDef,
    private onSave: () => Promise<void>
  ) {
    // Bare label without a leading emoji token, for prose ("…span Focus's
    // range"). The label is e.g. "🎯 Focus"; take the last word.
    const name = tracker.label.replace(/^\S+\s+/, "") || tracker.label;
    super(
      app,
      plugin,
      `${name} settings`,
      `${name} is a built-in scale tracker — its property name, type, range and class are fixed so the face picker and heat map keep working. It measures a day, so it is a daily tracker and can't be put on a monthly entry.`,
      "Save"
    );
    this.name = name;
    this.faces = (tracker.faces ?? DEFAULT_MOOD_FACES).join(" ");
    this.heatmap = plugin.settings.moodTrackerId === tracker.id;
  }

  protected renderBody(): void {
    new Setting(this.body)
      .setName(`Colour the calendar heat map from ${this.name}`)
      .setDesc(
        `Shade each diary-calendar day (and the monthly average) by that day's ${this.name}. Only one tracker can be the source — turning this on takes it off whichever tracker had it. The five shades span the range.`
      )
      .addToggle((c) =>
        c.setValue(this.heatmap).onChange((v) => {
          this.heatmap = v;
        })
      );

    new Setting(this.body)
      .setName(`${this.name} faces`)
      .setDesc(
        "The faces shown in the picker, lowest → highest, separated by spaces or commas. Emoji or short words. They're spread evenly across the range."
      )
      .addText((c) => {
        c.setValue(this.faces);
        c.setPlaceholder(DEFAULT_MOOD_FACES.join(" "));
        c.onChange((v) => {
          this.faces = v;
        });
      });
  }

  protected validate(): string | null {
    const faces = this.parseFaces();
    if (faces.length < 2) return "Give at least two faces, lowest to highest.";
    return null;
  }

  private parseFaces(): string[] {
    return this.faces
      .split(/[\s,]+/)
      .map((f) => f.trim())
      .filter(Boolean);
  }

  protected async commit(): Promise<void> {
    this.tracker.faces = this.parseFaces();
    this.tracker.heatmap = this.heatmap;
    // The heat-map source is a single global. Claim it when on; when off, only
    // clear it if *this* tracker was the one holding it — otherwise saving
    // Focus with heatmap off would wipe Mood's claim.
    if (this.heatmap) this.plugin.settings.moodTrackerId = this.tracker.id;
    else if (this.plugin.settings.moodTrackerId === this.tracker.id) {
      this.plugin.settings.moodTrackerId = "";
    }
    await this.onSave();
  }
}

export function openMoodEditor(
  app: App,
  plugin: ChronoAnvilPlugin,
  tracker: TrackerDef,
  onSave: () => Promise<void>
): void {
  new MoodEditModal(app, plugin, tracker, onSave).open();
}

// ── Journal type editor ───────────────────────────────────────────────────

// Assign stable ids and tidy a set of kind rows into storable configs.
//
// The kinds editor used to be a textarea with a grammar of its own —
// `📖 Lesson: confidence*, status` — four concepts, three separators and an
// asterisk whose meaning lived only in a paragraph of help text. The rows that
// replaced it need none of that, but they do still need the one genuinely
// load-bearing thing that parser did: derive a kind's `id` from its label,
// because the id is the `type:` value the note's frontmatter carries and every
// rollup filters on.
//
// PRESERVE IDS ON AN EXISTING TYPE, and this fixes a real bug rather than
// being caution. Re-deriving an id from the label meant renaming a kind from
// "Lesson" to "Class" silently changed every future note's `type` from
// `lesson` to `class` while leaving the existing ones on `lesson` — and a note
// whose `type` its journal no longer recognises drops out of
// recognisedTypeValues, so it stops being classified as that journal's note at
// all. Renaming a label is a relabel; it is not a migration.
// "Lesson", "Lesson and Practice", "Lesson, Practice and Note".
//
// Local and small because the one caller is one sentence in one confirmation.
// Promoting it to util.ts would be a shared helper with a single user, which is
// the kind of reach the codebase argues against elsewhere.
function listSentence(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function normaliseKinds(
  rows: JournalKindConfig[],
  opts: { preserveIds: boolean }
): JournalKindConfig[] {
  const out: JournalKindConfig[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const label = row.label.trim();
    if (!label) continue;
    const base = (opts.preserveIds && row.id) || slugify(label) || "note";
    let id = base;
    let n = 2;
    while (seen.has(id)) id = `${base}-${n++}`;
    seen.add(id);

    // A `trackers` list was normalised here until 3.18 (§7.3), along with the
    // repair that unshifted `rating` into it when the two disagreed. Both are
    // gone with the field. A stored list on an existing config is dropped
    // rather than migrated — it is not read here, so it does not survive.
    out.push({
      id,
      emoji: row.emoji.trim() || "📝",
      label,
      ...(row.rating ? { rating: row.rating } : {}),
      ...(row.pages ? { pages: true } : {}),
      // CARRIED, NOT REBUILT (3.20.1). This routine rebuilds every kind row
      // from the fields the editor knows about, and `plural` was not one of
      // them — so opening a journal in Settings and pressing Save silently
      // dropped it, and `kindPlural` fell back to the crude pluraliser. Study's
      // Practice kind stores `plural: "Practice"` for exactly the reason the
      // field exists, so its heading came back as "Practices" after any edit to
      // the journal, on a word the config had explicitly spelled out.
      //
      // The same shape of loss as `variants` in 3.19.0, and the same fix: a
      // field this window does not edit is a field it must not rebuild. It is
      // carried rather than dropped, and only dropped when the pluraliser
      // already produces it — a relabelled kind whose override no longer says
      // anything should not keep one that pins the OLD label's plural.
      ...(row.plural && row.plural !== plural(label)
        ? { plural: row.plural }
        : {}),
    });
  }
  return out;
}

// The trackers a kind of this journal type can name: the journal built-ins
// (Confidence, Accuracy, Status, Last reviewed — `typeId: null`, so every
// registered type has them) plus any the reader defined on this type's own
// surface. Read off the live registry rather than hardcoded, so a tracker
// added in Settings → Trackers appears here without a second list to update.
export function journalTrackerChoices(
  plugin: ChronoAnvilPlugin,
  typeId: string
): TrackerDef[] {
  return plugin.settings.trackers.filter(
    (t) =>
      t.surface.kind === "journal" &&
      (t.surface.typeId == null || t.surface.typeId === typeId)
  );
}

// Which of those can be a kind's rating. A rating is what a Recall sitting
// grades into and what the trend chart plots, so it has to be a number — a
// date tracker like Last reviewed is carried by a note but is not a score.
export function ratingChoices(
  plugin: ChronoAnvilPlugin,
  typeId: string
): TrackerDef[] {
  return journalTrackerChoices(plugin, typeId).filter(
    (t) => t.type === "number" || t.type === "scale"
  );
}


// Parse "Name: 📚" lines from a textarea back into a map.
export function parseEmojiMap(raw: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(":");
    if (idx === -1) continue;
    const name = trimmed.slice(0, idx).trim();
    const emoji = trimmed.slice(idx + 1).trim();
    if (name && emoji) map[name] = emoji;
  }
  return map;
}

export function stringifyEmojiMap(map: Record<string, string>): string {
  return Object.entries(map)
    .map(([name, emoji]) => `${name}: ${emoji}`)
    .join("\n");
}

// ── Journal type editor / designer ────────────────────────────────────────
//
// Two flows through one modal, and the split is not cosmetic:
//
//   NEW TYPE  — a four-step wizard, Identity → Structure → Sections → Create.
//               The Sections step is the designer: it chooses what markdown
//               each of the type's templates is created with, and on Create
//               those templates are written.
//   EXISTING  — the one-page form it has always been, with no Sections step.
//
// The asymmetry is the constraint, not an omission. "A journal type's
// templates are the user's; nothing regenerates them" — so the designer
// GENERATES, IT NEVER REGENERATES. It writes each template once, at creation,
// and from that moment the file is the user's like every other. Offering a
// Sections step on an existing type would mean either lying (the ticks do
// nothing) or regenerating (the ticks overwrite a file someone has edited),
// and there is no third option. Adding a section later is a different
// operation with a different guarantee, and it is the "Add a section to this
// note…" command — append-only, so it cannot destroy a hand edit.
//
// Nothing about the chosen sections is stored. Markdown is the source of
// truth: the templates are the output, there is no model behind them, and the
// wizard's ticks cease to exist the moment the modal closes.
// How a journal-type editor was opened.
//
// A THIRD MODE RATHER THAN A SECOND BOOLEAN. `isNew` was already standing in
// for four unrelated decisions — preserve ids or re-derive them, run the
// wizard or a single page, check the target folder is free, write templates on
// save — and importing wants exactly the "edit" answer to all four while
// differing only in its strings and what Save does. Adding `isImport` beside
// `isNew` would have made those four reads ask the wrong question in a new
// way, which is the shape of the bug that made Edit open a blank window.
export type JournalEditorMode = "create" | "edit" | "import";

// heading, subtitle, save-button label.
const MODE_STRINGS: Record<JournalEditorMode, [string, string, string]> = {
  create: [
    "New journal",
    "A journal gets its own folder tree, its own section on the homepage, and its own create commands and buttons.",
    "Create journal",
  ],
  edit: [
    "Edit journal",
    "A journal gets its own folder tree, its own section on the homepage, and its own create commands and buttons. Run \u201CSet up / repair vault\u201D afterwards to create any missing folders and templates.",
    "Save",
  ],
  import: [
    "Import journal",
    "This folder looks like a journal ChronoAnvil doesn\u2019t know about. The shape below was read back from the notes and templates on disk \u2014 check anything listed as guessed, then import it.",
    "Import journal",
  ],
};

// Exported for test/settings-editors.ts, which constructs one in edit mode and
// asks it for its head strings. Constructing a modal touches no DOM — onOpen()
// does — so the recursion that used to blank this window is reachable from a
// plain unit test, and worth one line of API surface to keep reachable.
export class JournalEditModal extends SteppedEditorModal {
  private draft: JournalConfig;
  // Live elements the Name field writes into, so typing a name updates the
  // derived folder preview without re-rendering the field under the cursor.
  private folderPreview: { root: HTMLElement; templates: HTMLElement } | null =
    null;
  private kindsHost: HTMLElement | null = null;
  // Section ids per template key. Populated lazily on entering the Sections
  // step, so a change of depth or kinds on the step before is picked up.
  private chosen = new Map<string, string[]>();
  private railKey: string | null = null;

  constructor(
    app: App,
    plugin: ChronoAnvilPlugin,
    cfg: JournalConfig,
    private mode: JournalEditorMode,
    private selfIndex: number,
    private onSave: (cfg: JournalConfig) => Promise<void>,
    // What had to be guessed to fill this form in. Import only; shown above
    // the fields so the reader knows which values to look at before saving.
    private guesses: string[] = [],
    // Trackers a preset is about to install, which the registry does not hold
    // yet. OFFERED TO THE "Rated on" DROPDOWN AND WRITTEN NOWHERE — see
    // paintKinds for why a select with no matching option silently discards
    // the value it was given. The seed itself happens in settings.ts, from the
    // config the reader commits.
    private pendingTrackers: TrackerDef[] = []
  ) {
    super(app, plugin, ...MODE_STRINGS[mode]);
    // Deep-ish copy: levels and kinds are the arrays a cancelled edit must not
    // have touched, so they're rebuilt rather than shared with the stored cfg.
    this.draft = {
      ...cfg,
      levels: cfg.levels.map((l) => ({ ...l })),
      kinds: cfg.kinds.map((k) => ({ ...k })),
    };
    // The kinds as they were when the window opened, kept so commit can say
    // what changed. Taken from `cfg` rather than from `draft`, which the form
    // mutates in place — a diff against a live reference would always be empty.
    this.kindsOnOpen = cfg.kinds.map((k) => ({ ...k }));
  }

  // See the constructor. Only read by commit.
  private kindsOnOpen: JournalKindConfig[];

  private get paths(): { journalsRoot: string; templates: string } {
    return this.plugin.settings.paths;
  }

  // Whether this is a journal being CREATED, which decides how sections are
  // chosen — not whether the chrome is on. Those were one question until
  // 2.54.5, when editing gained a second step, and `showsSteps` is now the
  // base class's, phrased as "is there more than one page". It is safe to ask
  // it that way since 2.55.5: the step list below reads `baseSubtitle`, a
  // field, where it used to call `super.subtitleText()` — an override that
  // called straight back into the step list. That was the loop that blanked
  // the Edit window.
  private get isWizard(): boolean {
    return this.mode === "create";
  }

  // Whether this journal's ids and folders are already committed to notes on
  // disk. True for edit AND for import: an imported journal's `type:` values
  // are written into every note it has, so re-deriving its ids from a noun
  // would declassify all of them exactly as it would for an edit.
  private get isEstablished(): boolean {
    return this.mode !== "create";
  }

  // The flow. One step for an existing type is the old single-page form, so
  // both cases run through the same renderer rather than through a branch.
  protected stepList(): WizardStep[] {
    if (!this.isWizard) {
      return [
        {
          title: "Edit journal",
          // `baseSubtitle` — the string this modal was CONSTRUCTED with.
          //
          // It was `super.subtitleText()`, and that was a loop: the override
          // called stepList() to find the current step's subtitle, and this
          // line called the override back, so building the edit form's first
          // step recursed until the stack gave out. The throw landed in
          // EditorModal.onOpen → renderHead → headingText, before the <h3>,
          // the body or the footer existed — Edit opened a frame with nothing
          // in it and no error anywhere a user could see. Reading the field
          // cannot recurse, because a field cannot be overridden.
          subtitle: this.baseSubtitle,
          render: (h) => {
            this.renderGuesses(h);
            this.renderIdentity(h);
            this.renderFolders(h);
            this.renderStructure(h);
            this.renderKinds(h);
          },
        },
        {
          title: "Sections",
          subtitle:
            "What each of this journal's templates contains. Opens the file — changes are shown before anything is written.",
          render: (h) => this.renderSectionLaunchers(h),
        },
      ];
    }
    return [
      {
        title: "Identity",
        subtitle:
          "What this journal is called. Its folders follow the name.",
        render: (h) => {
          this.renderIdentity(h);
          this.renderFolders(h);
        },
        validate: () => this.validateIdentity(),
      },
      {
        title: "Structure",
        subtitle:
          "How deep the folder tree goes, and what types of note live at the bottom of it.",
        render: (h) => {
          this.renderStructure(h);
          this.renderKinds(h);
        },
        validate: () => this.validateStructure(),
      },
      {
        title: "Sections",
        subtitle:
          "What each template is created with. Everything is ticked as Study arranges it, so Next is a fine answer.",
        render: (h) => this.renderSections(h),
      },
    ];
  }

  // The Sections step, on a journal that already exists.
  //
  // A RAIL OF LAUNCHERS, not a second checklist. The template editor already
  // edits a file's sections, with a plan and a preview and a re-read before it
  // writes; a checklist here would be a worse copy of it that also had to
  // decide what to do when the two disagreed. Two editors of one arrangement
  // is exactly the drift this subsystem keeps declining to build.
  //
  // So this step's whole job is to say which files there are, what each
  // contains, and open the right one. It writes nothing itself — pressing Save
  // on the form saves the form, and any section change was already written
  // when the reader closed the editor.
  //
  // READS FROM DISK, which is async while renderBody is not. Same shape
  // settings.ts::renderImportable uses: draw the rows with a placeholder,
  // start the reads, fill them in as they land. A spinner over the whole step
  // would be worse — the labels and the paths are known immediately and are
  // most of what the reader came to look at.
  private renderSectionLaunchers(host: HTMLElement): void {
    const type = buildJournalType(this.draft);
    const targets = templateTargets(type);

    if (!targets.length) {
      host.createDiv({
        cls: "ca-editor-note",
        text: "This journal has no templates yet.",
      });
      return;
    }

    const list = host.createDiv({ cls: "ca-launcher-list" });
    for (const target of targets) {
      const path = `${this.draft.templatesFolder}/${target.file}`;
      const { actions, pills } = createListRow(list, {
        token: "📄",
        title: target.label,
        subtitle: path,
        pills: [{ text: "reading…", tone: "muted" }],
      });

      const open = actions.createEl("button", { text: "Edit sections" });
      open.disabled = true;

      // Rename and delete, on a saved layout only. "Layout" is the word every
      // user-facing string uses for these — see the note in modals.ts.
      //
      // HERE RATHER THAN IN THE KINDS SECTION, which is the other plausible
      // home. Kinds are about identity — the `type:` value, the trackers, the
      // rating — and a layout is about a file. This is also where the layout
      // was created (Save as variant, from the editor this row opens) and where
      // it is already listed, so it is where a reader will look for it. Two
      // places to manage one thing is the drift this subsystem keeps declining
      // to build.
      const variantId = target.ctx.variantId;
      if (variantId && variantId !== "default" && target.ctx.kind) {
        const kindId = target.ctx.kind.id;
        const rename = actions.createEl("button", { text: "Rename" });
        rename.addEventListener("click", () => {
          void this.renameVariant(kindId, variantId);
        });
        // COPY IT TO ANOTHER JOURNAL (3.18 follow-ups §5, second half).
        //
        // A COPY AND NOT A REFERENCE, which is the whole design. A live
        // cross-journal layout would have to answer what happens when one of
        // the two journals changes shape — loses the kind an override names,
        // stops having paged notes — and every answer to that is a bug report.
        // "Start a new layout from this one" has no such question: the target
        // journal owns what it receives outright.
        const copy = actions.createEl("button", { text: "Copy to…" });
        copy.addEventListener("click", (evt) => {
          this.offerLayoutCopy(evt, variantId);
        });
        const remove = actions.createEl("button", { text: "Delete" });
        remove.addClass("mod-warning");
        remove.addEventListener("click", () => {
          void this.deleteVariant(kindId, variantId, path);
        });
      }

      void (async () => {
        const file = getFile(this.app, path);
        if (!file) {
          // Missing rather than empty, and said as such: this is the state a
          // kind added a moment ago leaves behind until the form is saved,
          // and "0 sections" would read as a broken template rather than an
          // unwritten one.
          pills.empty();
          pills.createSpan({
            cls: "ca-list-pill is-muted",
            text: "not written yet — save to create it",
          });
          return;
        }
        const text = await this.app.vault.read(file);
        const present = sectionsPresent(text, target.ctx);
        const edited = isHandEdited(text, target.ctx);
        {
          pills.empty();
          pills.createSpan({
            cls: "ca-list-pill",
            text: `${present.length} section${present.length === 1 ? "" : "s"}`,
          });
          if (edited) {
            pills.createSpan({
              cls: "ca-list-pill is-muted",
              text: "edited by hand",
            });
          }
        }
        open.disabled = false;
        open.addEventListener("click", () => {
          void openTemplateEditor(
            this.app,
            this.plugin,
            path,
            target.ctx,
            () => this.refreshBody(),
            // PASSED UNCONDITIONALLY SINCE 4.33. It was gated on
            // `variantEligible`, which refused an index and a page; all three
            // note kinds can carry a layout now, so the gate became a tautology
            // and was deleted. `splitLayoutTargets` is the shared half that
            // replaced it — the same call the banner door makes.
            (label, sections, options, targets) => {
              const split = splitLayoutTargets(
                this.draft.kinds.map((k) => k.id),
                targets
              );
              return this.addVariant(
                label,
                sections,
                options,
                split.kinds,
                split.surfaces
              );
            },
            // THE `pages` TICK, WRITTEN BACK (5.20). Only the default target
            // of a kind reaches this — `openTemplateEditor` decides that, and
            // says why — so `ctx.kind` is a kind of this journal and the row
            // it names is this draft's.
            (paged) => this.setKindPaged(target.ctx.kind?.id ?? "", paged)
          );
        });
      })();
    }
  }

  // Store whether a kind's notes can be split across pages, asking first where
  // the answer takes something away.
  //
  // SAVED IMMEDIATELY rather than held until this form's own Save, and
  // `addVariant` above already argues the case: the change has a template file
  // behind it, and config without the file — or the file without the config —
  // is the state `ensureJournalTemplates` exists to prevent rather than to
  // create. The section editor has just written the kind's own template on the
  // strength of this returning true, so the two land together or not at all.
  private async setKindPaged(kindId: string, paged: boolean): Promise<boolean> {
    const row = this.draft.kinds.find((k) => k.id === kindId);
    if (!row) return false;
    const before = this.draft.kinds.map((k) => ({ ...k }));
    row.pages = paged || undefined;

    // `diffKinds` ALREADY HAS THE SENTENCE. It reports this change as `paged`
    // and, for the direction that takes something away, says *"can no longer be
    // split into pages. Notes already split keep their pages and go on
    // working."* — which is the reassurance a reader needs and not one this
    // call site should be writing a second copy of.
    const changes = diffKinds(before, this.draft.kinds);
    if (kindChangeNeedsConfirming(changes)) {
      const ok = await confirmKindChange(
        this.app,
        this.plugin,
        this.draft.name,
        changes,
        // Nothing is being removed, so nothing needs counting: `counts` is read
        // for the "N notes carry this type" line on a `removed` change only.
        {}
      );
      if (!ok) {
        this.draft.kinds = before;
        return false;
      }
    }

    await this.onSave(this.draft);
    // The shared Page template, where turning this on has just created a target
    // for one. Never a delete on the way back: `refreshJournalTemplates` leaves
    // files it no longer composes alone, and a reader may have edited this one.
    const written = await this.plugin.scaffold.ensureJournalTemplates(
      this.draft
    );
    if (written.length) {
      new Notice(`ChronoAnvil: wrote ${written.join(", ")} ✅`);
    }
    this.refreshBody();
    return true;
  }

  // Store an arrangement as one of a kind's saved layouts.
  //
  // Written into the draft and saved immediately rather than waiting for the
  // form's Save, because the variant's template file has to be written too and
  // a half-saved variant — config without a file, or a file the config does not
  // know about — is the state ensureJournalTemplates exists to prevent rather
  // than to create.
  //
  // ON THE JOURNAL SINCE 3.18 follow-ups §5, not on the kind — the second of the
  // two writers that had to move. It is also the one that made the old address
  // dangerous: this window's own `commit` runs `normaliseKinds`, which rebuilds
  // every kind row from the fields it knows about and did not know about
  // `variants`, so a layout saved here and a journal edited afterwards were a
  // saved layout and its deletion.
  //
  // TAKES SPLIT LISTS SINCE 4.33, the same shape and for the same reason as
  // `JournalManager.saveVariant` — the `kindId` parameter's silent `return` on
  // an id that was not a kind is a Save button that does nothing now that a
  // front page and a page can be saved from.
  private async addVariant(
    label: string,
    sections: string[],
    options: Record<string, SectionOverrides>,
    kinds: string[],
    surfaces: ("index" | "page")[] = []
  ): Promise<void> {
    if (!kinds.length && !surfaces.length) {
      new Notice(
        "ChronoAnvil: pick at least one note type or surface to offer this layout on."
      );
      return;
    }

    // Ids unique within the JOURNAL now rather than within the kind, derived
    // from the label like every other id in this plugin, and suffixed rather
    // than rejected on a collision — the same repair normaliseKinds makes. A
    // reader naming two layouts "Math" wants two layouts, not an error.
    const taken = new Set((this.draft.variants ?? []).map((v) => v.id));
    const stem = slugify(label) || "variant";
    let id = stem;
    let n = 2;
    while (taken.has(id)) id = `${stem}-${n++}`;

    this.draft.variants = [
      ...(this.draft.variants ?? []),
      {
        id,
        label,
        sections: [...sections],
        ...(Object.keys(options).length ? { options } : {}),
        // Always written, even empty — see the note on `kinds` in
        // JournalVariantConfig: an absent list means "every kind" to
        // `variantKinds`, which is the wrong answer for a surface layout.
        kinds: [...kinds],
        ...(surfaces.length ? { surfaces } : {}),
      },
    ];

    await this.onSave(this.draft);
    const written = await this.plugin.scaffold.ensureJournalTemplates(
      this.draft
    );
    new Notice(
      written.length
        ? `ChronoAnvil: saved “${label}” — wrote ${written.join(", ")} ✅`
        : `ChronoAnvil: saved “${label}” ✅`
    );
    this.refreshBody();
  }

  // Rename a saved layout.
  //
  // The label only. The id stays, because it is what the layout's template file
  // is named from — re-deriving it would orphan the file and leave a config
  // pointing at nothing. The same reason renaming a kind preserves its id,
  // and for once the consequence is cosmetic rather than a declassification.
  // Offer this layout to another journal, and say what will not survive.
  //
  // THE REPORT IS THE POINT. `sectionsFor` already drops what a surface cannot
  // compose, silently — right when composing a template from a layout that
  // belongs where it is, and wrong when carrying one somewhere new. A layout
  // names section ids, and which sections exist is a function of the surface;
  // an override keyed by kind id cannot cross at all, because kind ids are per
  // journal by construction. The follow-up settled the question in advance:
  // drop silently, drop loudly, or refuse — "and silence is the wrong one".
  //
  // So the reader sees exactly what is lost before anything is written, and a
  // layout that loses nothing says so too rather than opening a dialogue about
  // an empty list.
  private offerLayoutCopy(evt: MouseEvent, variantId: string): void {
    const variant = this.draft.variants?.find((v) => v.id === variantId);
    if (!variant) return;

    // Every OTHER journal in the vault. Copying within a journal is what the
    // cross-kind half already does, from the layout's own `kinds` list.
    const others = this.plugin.settings.customJournals.filter(
      (j) => j.id !== this.draft.id
    );
    if (!others.length) {
      new Notice(
        "There's no other journal to copy this to. Add one, then copy the layout across."
      );
      return;
    }

    const menu = new Menu();
    for (const cfg of others) {
      menu.addItem((i) =>
        i
          .setTitle(cfg.name)
          .setIcon("copy")
          .onClick(() => void this.copyLayoutTo(variant, cfg))
      );
    }
    menu.showAtMouseEvent(evt);
  }

  private async copyLayoutTo(
    variant: JournalVariantConfig,
    target: JournalConfig
  ): Promise<void> {
    const type = buildJournalType(target);
    // RESOLVED AGAINST THE TARGET'S OWN FIRST KIND, because a layout has to
    // land on a surface to be resolvable at all and the first kind is what the
    // copy will be offered on. A kind the reader picks later that cannot host
    // it is the cross-KIND question, which `sectionsFor` already answers by
    // composing what applies.
    const kind = type.kinds[0];
    if (!kind) return;
    const ctx = sectionContext(type, { kind });
    const { layout, dropped } = resolveLayoutFor(
      {
        ...(variant.sections ? { sections: variant.sections } : {}),
        ...(variant.options ? { options: variant.options } : {}),
      },
      type,
      ctx
    );

    if (!layout.sections?.length) {
      new Notice(
        `Nothing in “${variant.label}” can be composed on ${target.name}.`
      );
      return;
    }

    const ok = await confirmPlan(
      this.app,
      `Copy “${variant.label}” to ${target.name}?`,
      dropped.length
        ? `It becomes a new layout on ${target.name}, offered when creating a ` +
            `${kind.label.toLowerCase()}. Some of it names things ${target.name} ` +
            `does not have, and those are listed below — everything else comes across. ` +
            `Nothing in ${this.draft.name} changes.`
        : `It becomes a new layout on ${target.name}, offered when creating a ` +
            `${kind.label.toLowerCase()}. All of it can be composed there. ` +
            `Nothing in ${this.draft.name} changes.`,
      [
        {
          label: "Comes across",
          lines: layout.sections.map((id) => id),
        },
        ...(dropped.length
          ? [
              {
                label: "Left behind",
                lines: dropped.map((d) => d.detail),
              },
            ]
          : []),
      ],
      "Copy it"
    );
    if (!ok) return;

    // A NEW ID IN THE TARGET, derived from the label like every other. The
    // source's id means nothing here and reusing it would collide the moment
    // the target already held a layout of that name.
    const taken = new Set((target.variants ?? []).map((v) => v.id));
    const stem = slugify(variant.label) || "variant";
    let id = stem;
    let n = 2;
    while (taken.has(id)) id = `${stem}-${n++}`;

    target.variants = [
      ...(target.variants ?? []),
      {
        id,
        label: variant.label,
        ...(layout.sections ? { sections: [...layout.sections] } : {}),
        ...(layout.options ? { options: layout.options } : {}),
        kinds: [kind.id],
      },
    ];
    await this.plugin.saveSettings();
    const written = await this.plugin.scaffold.ensureJournalTemplates(target);
    notify.ok(
      written.length
        ? `Copied “${variant.label}” to ${target.name} — wrote ${written.join(", ")}`
        : `Copied “${variant.label}” to ${target.name}`
    );
  }

  private async renameVariant(kindId: string, variantId: string): Promise<void> {
    const kind = this.draft.kinds.find((k) => k.id === kindId);
    const variant = this.draft.variants?.find((v) => v.id === variantId);
    if (!kind || !variant) return;

    const next = await promptText(
      this.app,
      "Rename layout",
      "e.g. Math Lesson",
      variant.label
    );
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === variant.label) return;

    variant.label = trimmed;
    await this.onSave(this.draft);
    notify.ok(`ChronoAnvil: renamed to “${trimmed}”`);
    this.refreshBody();
  }

  // Delete a saved layout.
  //
  // LEAVES THE TEMPLATE FILE, and says so. The same rule removing a kind
  // follows: the plugin does not delete a reader's markdown, and a template is
  // markdown a reader may have spent an evening on. Naming the file is the
  // whole of the help that can be given.
  //
  // Cheaper than removing a kind, and the confirmation says that too — a layout
  // carries no identity, so nothing on disk stops being recognised. Notes
  // created from it keep their `type:` and stay exactly as classified as they
  // were, because a Math Lesson was always just a Lesson.
  private async deleteVariant(
    kindId: string,
    variantId: string,
    templatePath: string
  ): Promise<void> {
    const kind = this.draft.kinds.find((k) => k.id === kindId);
    const variant = this.draft.variants?.find((v) => v.id === variantId);
    if (!kind || !variant) return;

    // A LAYOUT MAY NOW BE SHARED, so "delete" from one kind's row is only a
    // deletion when that row is the last one holding it. 3.18 follow-ups §5.
    //
    // Deleting outright would be the cross-kind half's first way to lose a
    // reader's work: removing "Two column" from Practice would silently take it
    // off Lesson too, from a row that never mentioned Lesson. So the shared case
    // withdraws this kind and says so, and only the sole-holder case deletes.
    const others = variantKinds(this.draft, variant).filter((k) => k !== kindId);
    const shared = others.length > 0;
    const otherLabels = this.draft.kinds
      .filter((k) => others.includes(k.id))
      .map((k) => k.label.toLowerCase());

    const file = templatePath.split("/").pop() ?? templatePath;
    const ok = await confirmAction(
      this.app,
      shared
        ? `Stop offering “${variant.label}” for ${kind.label.toLowerCase()}?`
        : `Delete the “${variant.label}” layout?`,
      `It stops being offered when creating a ${kind.label.toLowerCase()}. ` +
        (shared
          ? `It stays available for ${listSentence(otherLabels)}.\n\n`
          : "") +
        `Notes already made from it are unaffected — a ${variant.label} was ` +
        `always just a ${kind.label.toLowerCase()}, with the same trackers and ` +
        `the same place in every table.\n\n` +
        `${file} stays in your templates folder. Delete it yourself if you want it gone.`,
      shared ? "Stop offering it" : "Delete the layout",
      true
    );
    if (!ok) return;

    if (shared) {
      // Written as an explicit list rather than left absent: absent means every
      // kind, so a shared layout that shed one kind and kept saying nothing
      // would come straight back on the kind just removed.
      variant.kinds = others;
    } else {
      this.draft.variants = (this.draft.variants ?? []).filter(
        (v) => v.id !== variantId
      );
      if (!this.draft.variants.length) delete this.draft.variants;
    }
    await this.onSave(this.draft);
    notify.ok(
      shared
        ? `ChronoAnvil: “${variant.label}” no longer offered for ${kind.label.toLowerCase()}`
        : `ChronoAnvil: deleted “${variant.label}”`
    );
    this.refreshBody();
  }

  // The label on the button that commits.
  //
  // "Create journal" only creates one. On an edit AND on an import the same
  // button saves the form — an import's sections were written by the template
  // editor when the reader closed it, so that step launches rather than
  // queueing, and "Import journal" on it would promise a second write.
  protected finalLabel(): string {
    return this.isWizard ? "Create journal" : "Save";
  }

  // The rail, the Back/Next footer, per-step heads and per-step validation all
  // come from SteppedEditorModal now. They were written here in 2.54.5 and
  // lifted in 2.55.5, when the tracker and chart editors became the second and
  // third things to want them — see the note above the class in
  // editor-modal.ts for why they could not simply import this file.
  //
  // Not taken: `savableFromAnyStep`. Editing a journal could offer Save from
  // the Identity step exactly as the tracker editor now does, and probably
  // should. It is left alone because §5.4's sequencing argument applies to
  // more than icons — this patch already changes two editors, and a third
  // changed in the same breath is how a regression stops being bisectable.

  // ── step content ───────────────────────────────────────────────────────

  // What was guessed rather than read, above the fields it applies to.
  //
  // FIRST, and before anything is saved. 2.48 imported the journal and then
  // said what it had guessed in a notice, which meant the reader had to notice
  // the notice, work out which of several values it referred to, and go and
  // undo it. Everything below this block came off the disk; everything named
  // in it is ChronoAnvil's best reading of something nothing wrote down.
  private renderGuesses(host: HTMLElement): void {
    if (this.guesses.length === 0) return;
    const box = host.createDiv({ cls: "ca-editor-caveats" });
    box.createDiv({
      cls: "ca-editor-caveats-title",
      text:
        this.guesses.length === 1
          ? "One detail had to be guessed"
          : `${this.guesses.length} details had to be guessed`,
    });
    box.createDiv({
      cls: "ca-editor-caveats-blurb",
      text: "Everything else was read from the notes and templates in the folder. Check these before importing — a tracker's range in particular is only as wide as the readings already on disk.",
    });
    const list = box.createEl("ul", { cls: "ca-editor-caveats-list" });
    for (const guess of this.guesses) list.createEl("li", { text: guess });
  }

  // What typing in the Name field does.
  //
  // A NEW type's id and folders follow its name. An established type's do not,
  // and both halves of that matter:
  //
  //   the id is what a per-type tracker's surface names (`{kind: "journal",
  //   typeId}`), so re-deriving it would orphan every tracker defined on this
  //   journal;
  //   the root is a folder full of notes, so re-pointing it would orphan all
  //   of those.
  //
  // Correcting a typo in a title is a relabel, not a migration. To move an
  // established journal, move its folder in the file explorer — pathwatch.ts
  // already follows that.
  //
  // EXTRACTED FROM THE onChange CALLBACK IN 2.54.6, because that is where the
  // polarity of this decision was wrong and unreachable. The guard read
  // `if (!this.isEstablished) return;` — the exact inverse of the paragraph
  // above, and wrong in both directions at once. A new journal's folders never
  // followed its name, so naming one "CookBook" left it in
  // `03 - Journals/Custom Journal`; and renaming an established one silently
  // re-derived the id and re-pointed the root, which is the orphaning the
  // guard exists to prevent.
  //
  // It survived because the comment described the opposite of the code, so
  // reading either alone it looked right — and because nothing could reach it
  // without a DOM. Being a method rather than a closure is the fix for the
  // second half, and the reason there are now four tests on it.
  protected applyNameChange(v: string): void {
    this.draft.name = v;
    if (this.isEstablished) return;

    const auto = slugify(v);
    if (auto && this.idIsFree(auto)) this.draft.id = auto;
    this.syncFolders();
  }

  private renderIdentity(host: HTMLElement): void {
    const cfg = this.draft;
    const identity = this.section(host, "Identity");

    new Setting(identity)
      .setName("Name")
      .setDesc('Display name, e.g. "Meeting Notes". Also derives the id.')
      .addText((c) => {
        c.setPlaceholder("Recipes");
        c.setValue(cfg.name);
        c.onChange((v) => this.applyNameChange(v));
        window.setTimeout(() => c.inputEl.focus(), 0);
      });

    new Setting(identity)
      .setName("Heading emoji")
      .setDesc("Shown on the home-page section heading.")
      .addText((c) => {
        c.setValue(cfg.emoji);
        c.inputEl.addClass("ca-editor-emoji");
        c.onChange((v) => {
          cfg.emoji = v.trim() || "📔";
        });
      });
  }

  // Folders are shown, not typed.
  //
  // They were two free-text fields, and that was three things that could
  // disagree: the shipped default named the folder after the placeholder name,
  // so typing "Cook Book" over "Custom Journal" left the folder behind, and
  // the only way to get matching folders was to notice and fix both fields.
  // Nobody asked to name a folder. They asked to name a journal.
  //
  // Read-only is the same treatment Settings → Paths gives every derived path,
  // and the escape hatch is the same one: to move a journal, move its folder
  // in the file explorer, and pathwatch.ts retargets the setting.
  private renderFolders(host: HTMLElement): void {
    const folders = this.section(host, "Folders");

    const box = folders.createDiv({ cls: "ca-derived-paths" });
    const row = (label: string): HTMLElement => {
      const line = box.createDiv({ cls: "ca-derived-path" });
      line.createSpan({ cls: "ca-derived-path-label", text: label });
      return line.createSpan({ cls: "ca-derived-path-value" });
    };
    this.folderPreview = { root: row("Notes"), templates: row("Templates") };
    box.createDiv({
      cls: "ca-derived-path-note",
      text: !this.isEstablished
        ? "Both follow the name above, under this vault's journals and templates roots."
        : "Fixed once a journal exists — renaming it here won't move its notes. To relocate it, move the folder in the file explorer and ChronoAnvil will follow.",
    });
    this.paintFolders();
  }

  private syncFolders(): void {
    const derived = deriveJournalFolders(this.draft.name, this.paths);
    this.draft.root = derived.root;
    this.draft.templatesFolder = derived.templatesFolder;
    this.paintFolders();
  }

  private paintFolders(): void {
    if (!this.folderPreview) return;
    // An empty name derives a root that is just the journals root with a
    // trailing slash, which reads as a mistake rather than as "not yet". Say
    // so instead of showing it.
    const named = journalFolderName(this.draft.name) !== "";
    this.folderPreview.root.setText(named ? this.draft.root : "—");
    this.folderPreview.templates.setText(
      named ? this.draft.templatesFolder : "—"
    );
  }

  private renderStructure(host: HTMLElement): void {
    const cfg = this.draft;
    const structure = this.section(host, "Structure");

    new Setting(structure)
      .setName("Depth")
      .setDesc(
        "Flat: notes live directly in each top-level folder. Two folder levels: top-level folders contain sub-folders that hold the notes (like Study's Subject → Topic)."
      )
      .addDropdown((d) => {
        d.addOption("1", "Flat (one level)");
        d.addOption("2", "Two levels");
        d.setValue(String(cfg.levels.length));
        d.onChange((v) => {
          this.resizeLevels(Number(v));
          this.refreshBody();
        });
      });

    cfg.levels.forEach((lvl, li) => {
      const levelLabel = li === 0 ? "Top-level" : "Sub-level";
      new Setting(structure)
        .setName(`${levelLabel} noun`)
        .setDesc(
          li === 0
            ? 'Singular noun for a top-level folder, e.g. "Subject", "Cuisine".'
            : 'Singular noun for a sub-folder, e.g. "Topic", "Dish".'
        )
        .setClass("ca-editor-inline-fields")
        .addText((c) =>
          c
            .setPlaceholder(li === 0 ? "Section" : "Item")
            .setValue(lvl.noun)
            .onChange((v) => {
              lvl.noun = v.trim() || (li === 0 ? "Section" : "Item");
            })
        )
        .addText((c) => {
          c.setPlaceholder("emoji");
          c.setValue(lvl.fallbackEmoji);
          c.inputEl.addClass("ca-editor-emoji");
          c.inputEl.setAttribute("aria-label", "fallback emoji");
          c.onChange((v) => {
            lvl.fallbackEmoji = v.trim() || "📂";
          });
        });
    });
  }

  // ── Note types ─────────────────────────────────────────────────────────
  //
  // One row per kind, replacing a textarea whose lines read
  // `📖 Lesson: confidence*, status`. That grammar packed four concepts into
  // one line with three separators, and its worst part was the asterisk: the
  // single most consequential choice a kind makes — what a Recall sitting
  // grades into, what the trend chart plots, what the review queue schedules
  // from — was a punctuation mark explained only in a paragraph of help text
  // below the box. It was also the last freeform mini-language in settings;
  // trackers, events and moods all get real fields.
  //
  // Rows make the rating a dropdown of this journal's actual trackers, so it
  // is picked from what exists rather than typed from memory, and a typo
  // becomes impossible rather than becoming a silent no-op. Nothing is lost:
  // the grammar was never a stored format, only a way of drawing this list.
  private renderKinds(host: HTMLElement): void {
    const wrap = this.section(host, "Note types");
    wrap.createDiv({
      cls: "ca-editor-hint",
      text: "The kinds of note this journal holds. Each becomes a create button and a `type:` value in the note's frontmatter.",
    });
    this.kindsHost = wrap.createDiv({ cls: "ca-kinds" });
    this.paintKinds();
  }

  private paintKinds(): void {
    const host = this.kindsHost;
    if (!host) return;
    host.empty();

    // THE DROPDOWN THAT WOULD OTHERWISE LIE. 4.35 §1.4.
    //
    // A `<select>` handed a value with no matching `<option>` reads back as
    // `""` — so a preset whose Workout is rated on Intensity would show
    // **"Nothing"** on the Structure step, because the tracker it names is not
    // in the registry yet and `ratingChoices` reads the registry. One touch of
    // the dropdown would then make that true, silently discarding the rating
    // the preset shipped.
    //
    // Offered here, WRITTEN NOWHERE: the seed happens in settings.ts at save
    // time, from the config the reader committed. This list only has to make
    // the option exist so the value binds and the label draws.
    const rateable = [
      ...ratingChoices(this.plugin, this.draft.id),
      ...(this.pendingTrackers ?? []).filter(
        (t) => t.type === "number" || t.type === "scale"
      ),
    ].filter(
      (t, i, all) => all.findIndex((o) => o.id === t.id) === i
    );

    this.draft.kinds.forEach((kind, i) => {
      const row = host.createDiv({ cls: "ca-kind" });

      const head = row.createDiv({ cls: "ca-kind-head" });
      const emoji = head.createEl("input", {
        type: "text",
        cls: "ca-editor-emoji",
        value: kind.emoji,
      });
      emoji.setAttribute("aria-label", "kind emoji");
      emoji.addEventListener("input", () => {
        kind.emoji = emoji.value;
      });

      const label = head.createEl("input", {
        type: "text",
        cls: "ca-kind-label",
        value: kind.label,
      });
      label.placeholder = "Entry";
      label.setAttribute("aria-label", "kind name");
      label.addEventListener("input", () => {
        kind.label = label.value;
      });

      // Never the last one: a journal with no kinds has nothing to create in.
      const del = head.createEl("button", { cls: "ca-kind-remove" });
      setIcon(del, "trash-2");
      del.setAttribute("aria-label", "Remove this kind");
      del.disabled = this.draft.kinds.length <= 1;
      del.addEventListener("click", () => {
        this.draft.kinds.splice(i, 1);
        this.paintKinds();
      });

      const rateRow = row.createDiv({ cls: "ca-kind-field" });
      rateRow.createSpan({ cls: "ca-kind-field-label", text: "Rated on" });
      const select = rateRow.createEl("select", { cls: "dropdown" });
      select.createEl("option", { value: "", text: "Nothing" });
      for (const t of rateable) {
        select.createEl("option", { value: t.id, text: t.label });
      }
      select.value = kind.rating ?? "";
      select.addEventListener("change", () => {
        kind.rating = select.value || undefined;
        this.paintKinds();
      });
      rateRow.createSpan({
        cls: "ca-kind-field-note",
        text: kind.rating
          ? "What a Recall sitting grades into, and what this journal's trend charts plot."
          : "Notes of this kind aren't scored.",
      });

      // A `Pages` CHECKBOX SAT HERE AND IS GONE (5.20). Every other field on
      // this row is IDENTITY — what the kind is called, what it is rated on,
      // what it tracks — and `pages` was not. It is a decision about what the
      // kind's template CONTAINS, and it was asked one step before the step
      // that asks exactly that, in a different vocabulary: tick it here, walk
      // to Sections, and a `🗂️ What's below` row had appeared with nothing on
      // screen connecting the two. The documentation had to explain the
      // coupling backwards — *"only a note type that can be split across pages
      // is offered a pages table"* — which is a sentence you only write when
      // the cause is out of reach of the effect.
      //
      // The `pages` SECTION is the control now, on both surfaces that choose
      // sections: `renderSections` below, and `Edit sections…` over a kind's
      // template file. Ticking it writes `kind.pages` back; unticking clears
      // it. `kind.pages` is still the stored fact and `normaliseKinds` still
      // carries it — it just stopped having a second control of its own.

    });

    const add = host.createEl("button", { cls: "ca-kind-add" });
    setIcon(add, "plus");
    add.createSpan({ text: "Add kind" });
    add.addEventListener("click", () => {
      this.draft.kinds.push({ id: "", emoji: "📝", label: "" });
      this.paintKinds();
    });
  }

  // ── the Sections step ──────────────────────────────────────────────────
  //
  // One step regardless of how many templates the type has: a rail of them on
  // the left, and on the right the sections applicable to whichever is
  // selected, filtered by that template's `surface`. Every box starts ticked
  // per the catalogue, so the fast path through the whole wizard is
  // Next-Next-Next-Create.
  private renderSections(host: HTMLElement): void {
    // Both lists normalised, so the rail names the files that will actually be
    // written. A level with no id yet would otherwise fall back to a
    // noun-derived one here and to the normalised one on Create, and the rail
    // would name a template the generator doesn't produce.
    const type = buildJournalType({
      ...this.draft,
      levels: normaliseLevels(this.draft.levels, { preserveIds: this.isEstablished }),
      kinds: normaliseKinds(this.draft.kinds, { preserveIds: this.isEstablished }),
    });
    const targets = templateTargets(type);
    this.syncChoices(targets);
    if (!this.railKey || !targets.some((t) => t.key === this.railKey)) {
      this.railKey = targets[0]?.key ?? null;
    }
    const active = targets.find((t) => t.key === this.railKey);
    if (!active) return;

    const wrap = host.createDiv({ cls: "ca-wizard-sections" });

    const rail = wrap.createDiv({ cls: "ca-wizard-templates" });
    for (const t of targets) {
      const chosen = this.chosen.get(t.key) ?? [];
      const row = rail.createDiv({
        cls: `ca-wizard-template${
          t.key === this.railKey ? " is-active" : ""
        }`,
      });
      row.createDiv({ cls: "ca-wizard-template-name", text: t.label });
      row.createDiv({
        cls: "ca-wizard-template-count",
        text: `${chosen.length} section${chosen.length === 1 ? "" : "s"}`,
      });
      row.addEventListener("click", () => {
        this.railKey = t.key;
        this.refreshBody();
      });
    }

    const pane = wrap.createDiv({ cls: "ca-wizard-pane" });
    const picked = new Set(this.chosen.get(active.key) ?? []);
    const list = pane.createDiv({ cls: "ca-wizard-checklist" });

    for (const section of this.displayOrder(active)) {
      const row = list.createDiv({ cls: "ca-wizard-check" });
      const box = row.createEl("input", { type: "checkbox" });
      this.renderMoveArrows(row, active, section.id);
      box.checked = picked.has(section.id) || !!section.locked;
      box.disabled = !!section.locked;
      const text = row.createDiv({ cls: "ca-wizard-check-text" });
      text.createDiv({
        cls: "ca-wizard-check-label",
        text: `${section.icon} ${section.label}`,
      });
      text.createDiv({ cls: "ca-wizard-check-blurb", text: section.blurb });
      if (section.locked) {
        text
          .createDiv({ cls: "ca-wizard-check-blurb" })
          .setText("Always included — it carries the title and tracker grid.");
      }
      // The sentence the deleted Structure checkbox used to carry, on the row
      // that replaced it. Only while the kind is unpaged: once it is, the table
      // is the section and its own blurb says what it is.
      if (section.id === "pages" && !active.ctx.hasPages) {
        text
          .createDiv({ cls: "ca-wizard-check-blurb" })
          .setText(
            "Long notes of this kind can be split into pages, each with its own Recall deck. Ticking this gives the journal a shared Page template."
          );
      }
      box.addEventListener("change", () => {
        // THE `pages` ROW WRITES CONFIG, NOT JUST THE TICK LIST (5.20). It is
        // the one row on this list whose answer is a fact about the KIND rather
        // than about the template — `sectionContext` derives `hasPages` from
        // `kind.pages`, and that same field is what makes `templateTargets`
        // emit the shared Page template. Writing it here is what lets the
        // checkbox be the only place the question is asked; the repaint below
        // is what makes the rail, the schematic and this very row agree with it
        // a moment later.
        if (section.id === "pages" && this.pagesRowOn(active)) {
          const draftKind = this.draftKindOf(active);
          if (draftKind) draftKind.pages = box.checked || undefined;
        }
        // INSERT AND DELETE IN PLACE (3.18 §2.1). This used to rebuild the list
        // as `sectionsFor(ctx).filter(...).map(id)`, which re-sorted it into
        // catalogue order on every click of any box — so an order the reader
        // had arranged was thrown away by ticking something unrelated. The
        // store was always an ordered array; only its writer disagreed.
        //
        // A newly ticked section lands at its CATALOGUE position among the ones
        // already chosen, rather than at the end: a reader who ticks a section
        // and has not touched the arrows has expressed no opinion about where
        // it goes, and the catalogue's answer is the one every other surface
        // gives.
        const now = [...(this.chosen.get(active.key) ?? [])];
        // RANKED AGAINST THE CONTEXT THE TICK CREATES, not the one it was drawn
        // in (5.20). `pages` is gated on `hasPages` and the row that turns
        // `hasPages` on is drawn while it is still off — so asking the current
        // ctx where `pages` goes gets `indexOf` = -1, which sorts it above the
        // banner. One line, and only the structural row can reach it.
        const rankCtx =
          section.id === "pages" && box.checked && !active.ctx.hasPages
            ? { ...active.ctx, hasPages: true, documentLike: true }
            : active.ctx;
        // ORDER CANNOT MATTER HERE: this Map is only read for `.required`.
        const byId = new Map(sectionsFor(rankCtx).map((sc) => [sc.id, sc]));
        const at = now.indexOf(section.id);
        if (box.checked && at === -1) {
          // With the layout, so re-ticking a section returns it to its DESIGNED
          // slot rather than to its catalogue rank — the same answer
          // `displayOrder` drew it in while it was unticked.
          const order = sectionsFor(rankCtx, this.layoutFor(active)).map(
            (s) => s.id
          );
          const rank = (id: string): number => order.indexOf(id);
          const before = now.findIndex((id) => rank(id) > rank(section.id));
          now.splice(before === -1 ? now.length : before, 0, section.id);
          // Required sections lead, whatever the catalogue rank arithmetic
          // says — see renderMoveArrows for why the banner cannot be second.
          now.sort((a, b) => {
            const ra = byId.get(a)?.locked ? 0 : 1;
            const rb = byId.get(b)?.locked ? 0 : 1;
            return ra - rb;
          });
        } else if (!box.checked && at !== -1) {
          now.splice(at, 1);
        }
        this.chosen.set(active.key, now);
        this.refreshBody();
      });
    }

    this.renderSchematic(pane, active);
  }

  // The rows, in the order the template will be written in. 3.18 §2.
  //
  // CHOSEN SECTIONS IN THE READER'S ORDER, with the unticked ones shown at the
  // position the catalogue would give them. An unticked row has no position in
  // the output — it is not in the file — so it cannot be moved and is placed
  // where it WOULD go if ticked, which is what makes ticking one predictable.
  private displayOrder(target: TemplateTarget): JournalSection[] {
    // With the layout, so an UNTICKED row sits where the design would put it
    // rather than at catalogue rank — the position it would take if ticked,
    // which is the whole promise this function's comment makes.
    const all = sectionsFor(target.ctx, this.layoutFor(target));
    const byId = new Map(all.map((s) => [s.id, s]));
    const chosen = (this.chosen.get(target.key) ?? []).filter((id) =>
      byId.has(id)
    );
    const out: JournalSection[] = [];
    const rest = all.filter((s) => !chosen.includes(s.id));
    let ri = 0;
    for (const id of chosen) {
      // Everything the catalogue puts before this one and nobody chose.
      const rank = all.findIndex((s) => s.id === id);
      while (ri < rest.length && all.indexOf(rest[ri]) < rank) {
        out.push(rest[ri++]);
      }
      out.push(byId.get(id)!);
    }
    while (ri < rest.length) out.push(rest[ri++]);
    return this.withPagesRow(target, out);
  }

  // ── the `pages` row, which the catalogue cannot offer (5.20) ───────────
  //
  // `pages` is gated on `applies: (ctx) => ctx.hasPages`, and that gate STAYS.
  // `layout-transfer.ts` names this section as the example of what a
  // cross-journal layout copy has to drop loudly — a layout saved from a paged
  // journal, pasted into an unpaged one, must not quietly compose a pages table
  // over a kind that has none — and composition reads the same predicate. So
  // the row cannot come from `sectionsFor` while the kind is unpaged.
  //
  // IT COMES FROM THE SURFACE INSTEAD, and ticking it changes the config that
  // makes the catalogue offer it for real. The gate is untouched; what changed
  // is that there is now somewhere to answer it from.
  private withPagesRow(
    target: TemplateTarget,
    rows: JournalSection[]
  ): JournalSection[] {
    if (!this.pagesRowOn(target) || target.ctx.hasPages) return rows;
    const pages = findSection("pages");
    if (!pages) return rows;
    // AT ITS CATALOGUE RANK AMONG THE ROWS ALREADY DRAWN, which is the promise
    // `displayOrder` makes for every unticked row: *"placed where it WOULD go
    // if ticked"*. A layout can move it afterwards; it cannot have an opinion
    // about it yet, having never seen it.
    const rank = (id: string): number =>
      JOURNAL_SECTIONS.findIndex((s) => s.id === id);
    const mine = rank("pages");
    const before = rows.findIndex((s) => rank(s.id) > mine);
    const out = [...rows];
    out.splice(before === -1 ? out.length : before, 0, pages);
    return out;
  }

  // Whether this template is where a kind's `pages` tick lives.
  //
  // A KIND'S DEFAULT TARGET ONLY. `kind.pages` is a property of the kind and a
  // saved layout is one arrangement of it among several, so a Pages box on
  // `kind:lesson:compact` would be a per-variant control over a per-kind fact —
  // ticking it on one layout would silently change every other, including the
  // default nobody was looking at. The page target is excluded for the reason
  // `sectionContext` gives in its own words: a page has no variant, and it is
  // also not the note the tick is about.
  private pagesRowOn(target: TemplateTarget): boolean {
    return (
      target.ctx.noteKind === "leaf" &&
      (target.ctx.variantId ?? "default") === "default"
    );
  }

  // The draft row a template target's kind was built from.
  //
  // PAIRED THROUGH THE NORMALISED LIST rather than indexed into
  // `this.draft.kinds`: `normaliseKinds` DROPS a row whose label is still
  // blank, so the two arrays are the same length only while the form is
  // complete — and this is read from a checkbox handler, which is exactly when
  // it might not be. Zipping the kept rows against their normalised selves is
  // the pairing that holds mid-typing.
  private draftKindOf(target: TemplateTarget): JournalKindConfig | null {
    const id = target.ctx.kind?.id;
    if (!id) return null;
    const kept = this.draft.kinds.filter((k) => k.label.trim());
    const norm = normaliseKinds(this.draft.kinds, {
      preserveIds: this.isEstablished,
    });
    const at = norm.findIndex((k) => k.id === id);
    return at === -1 ? null : (kept[at] ?? null);
  }

  // Up/down, on a chosen row only.
  //
  // ARROWS RATHER THAN DRAG, and the section editor carries both — this is the
  // half that works without a pointer and needs no drop-target rules. `movable`
  // and `group` are the section editor's constraints and do not apply here:
  // this surface has one band, every section in it is being placed rather than
  // relocated, and there is no fixed top row because there is no file yet.
  private renderMoveArrows(
    row: HTMLElement,
    target: TemplateTarget,
    id: string
  ): void {
    const ids = [...(this.chosen.get(target.key) ?? [])];
    const at = ids.indexOf(id);
    // ORDER CANNOT MATTER HERE EITHER: only `.required` is read off this Map.
    const byId = new Map(sectionsFor(target.ctx).map((sc) => [sc.id, sc]));
    // NOTHING MOVES ABOVE THE BANNER, and this is a correctness rule rather
    // than a convention about where a title looks best.
    //
    // The banner section's first block is `chronoanvil:spacer`, which is documented
    // as sitting on LINE 0 OF THE BODY so that a click at the top of the note
    // lands on it rather than inside the banner fence — which would render the
    // fence as raw source. Ordering that let a reader put Resources first would
    // write a template whose spacer is halfway down, and the defect would show
    // up as a note that occasionally displays its own source.
    //
    // The same shape the section editor already uses for its fixed top row: a
    // `required` section is not an arrow host, and the rows below it cannot
    // cross it. Expressed by clamping the reachable range rather than by
    // refusing the move afterwards, so a control that cannot act is disabled
    // rather than misleading (3.2 §4).
    const pinned = ids.filter((x) => byId.get(x)?.locked).length;
    const locked = !!byId.get(id)?.locked;
    const wrap = row.createDiv({ cls: "ca-wizard-arrows" });
    const arrow = (dir: -1 | 1, glyph: string, name: string): void => {
      const b = wrap.createEl("button", {
        cls: "ca-wizard-arrow",
        text: glyph,
        attr: { type: "button" },
      });
      b.setAttribute("aria-label", name);
      // Inert rather than absent on a row that cannot move: a control that
      // disappears from some rows and not others is harder to read than a quiet
      // one, which is the rule the chart range cycle already follows.
      b.disabled =
        at === -1 ||
        locked ||
        at + dir < pinned ||
        at + dir >= ids.length;
      b.addEventListener("click", () => {
        const [moved] = ids.splice(at, 1);
        ids.splice(at + dir, 0, moved);
        this.chosen.set(target.key, ids);
        this.refreshBody();
      });
    };
    arrow(-1, "↑", "Move up");
    arrow(1, "↓", "Move down");
  }

  // The preview is a SCHEMATIC, not a render.
  //
  // A live preview of `topics-table` in a journal that does not exist yet
  // shows an empty state, and an empty state teaches nothing about layout. A
  // labelled block per section — its icon, its label, its blurb — teaches the
  // arrangement, which is the thing actually being chosen here. The real
  // preview is free and comes after: on Create the top-level template is
  // offered, and that one renders against a real note.
  private renderSchematic(host: HTMLElement, target: TemplateTarget): void {
    const chosen = new Set(this.chosen.get(target.key) ?? []);
    const box = host.createDiv({ cls: "ca-wizard-schematic" });
    box.createDiv({
      cls: "ca-wizard-schematic-title",
      text: `${target.file} — how it will be laid out`,
    });
    const stack = box.createDiv({ cls: "ca-wizard-blocks" });
    stack.createDiv({
      cls: "ca-wizard-block is-frontmatter",
      text: "Properties",
    });
    // Same order as the rows, which is the whole point of the preview: it is
    // the arrangement being chosen, not the catalogue's.
    const shown = this.displayOrder(target).filter(
      (s) => chosen.has(s.id) || s.locked
    );
    for (const s of shown) {
      const block = stack.createDiv({ cls: "ca-wizard-block" });
      block.createSpan({ cls: "ca-wizard-block-icon", text: s.icon });
      block.createSpan({ text: s.label });
    }
  }

  // Give every template a choice, defaulting to the catalogue's. Re-run on
  // each visit to the step so a kind renamed on the step before gets defaults
  // rather than nothing, and a kind deleted stops being carried around.
  private syncChoices(targets: TemplateTarget[]): void {
    const live = new Set(targets.map((t) => t.key));
    for (const key of [...this.chosen.keys()]) {
      if (!live.has(key)) this.chosen.delete(key);
    }
    for (const t of targets) {
      if (!this.chosen.has(t.key)) {
        // THE SEED, AND THE ONE THAT MATTERS (4.35 §0.2).
        //
        // This was `defaultSectionIds(t.ctx)` with no layout, so a preset's
        // arrangement was discarded at the single moment it is used: install
        // Study through Presets and its Topic Index came out in CATALOGUE
        // order, not in the order journal.ts argues for at length. `chosen`
        // is then what `commit` writes and what the templates are composed
        // from, so the loss was total rather than cosmetic.
        this.chosen.set(t.key, chosenSectionIds(t.ctx, this.layoutFor(t)));
      }
    }
  }

  // The draft's saved layout for a template, if it has one. `TemplateTarget.key`
  // IS the layout key — both come from `templateKeyFor` — so this cannot drift
  // from what `commit` writes back or what `composeTemplate` reads.
  private layoutFor(target: TemplateTarget): TemplateLayout | undefined {
    return this.draft.layout?.[target.key];
  }

  private section(host: HTMLElement, title: string): HTMLElement {
    const wrap = host.createDiv({ cls: "ca-editor-section" });
    wrap.createEl("h4", {
      cls: "ca-editor-section-title",
      text: title,
    });
    return wrap;
  }

  private idIsFree(id: string): boolean {
    // `study` USED TO BE RESERVED HERE, and stopped being reservable in 3.20.
    //
    // It was correct while Study was a built-in: it lived outside
    // `customJournals`, so the loop below could not see it, and without the
    // clause a reader could name a journal "Study" and collide with a type that
    // was invisible to the check. Study is an ordinary stored journal now, so
    // the loop sees it like any other — and the clause had become a rule that
    // the one journal ChronoAnvil ships is the one journal it will not let you
    // install. Starting from the Study preset failed validation on the Identity
    // step before the reader had touched anything.
    return !this.plugin.settings.customJournals.some(
      (j, i) => i !== this.selfIndex && j.id === id
    );
  }

  // Two journal types may not claim the same root folder.
  //
  // A note's journal type is resolved from its path, longest root first
  // (trackers.ts::journalTypeOfPath) — which is what lets a custom journal
  // live *inside* the journals root that Study itself claims. Longest-first is
  // a rule only while the roots differ; two types sharing one makes it a coin
  // flip, and the loser's notes would quietly take the winner's trackers.
  // Refusing here is cheaper than making the classifier arbitrate.
  // WHICH journal holds it, rather than whether one does. 4.17 §2.
  //
  // THIS WAS `rootIsFree(): boolean` AND THE BOOLEAN IS GONE RATHER THAN KEPT
  // BESIDE IT. A boolean was enough while the refusal said "give this one a
  // different name" — advice that needs no idea who the other party is. It is
  // not enough for a refusal that names the journal and offers to delete it, and
  // keeping a predicate that answers half the question invites a second loop
  // finding the same journal a second time, which is how the message and the
  // button end up disagreeing about which one they mean.
  private rootHolder(root: string): { cfg: JournalConfig; index: number } | null {
    const norm = (r: string): string => r.trim().replace(/\/+$/, "");
    const want = norm(root);
    if (want === "") return null;
    // Study's root used to need its own clause here, because Study was not in
    // `customJournals` and so was invisible to the check below. It is an
    // ordinary entry now (3.20) and the loop catches it like any other — one
    // fewer place for the two lists to disagree about which roots are taken.
    const index = this.plugin.settings.customJournals.findIndex(
      (j, i) => i !== this.selfIndex && norm(j.root) === want
    );
    return index < 0
      ? null
      : { cfg: this.plugin.settings.customJournals[index], index };
  }

  // A NEW journal may not land on a folder that already exists.
  //
  // The check above compares the derived root against other *registered*
  // types, which is not the same question. Study's subjects are ordinary
  // folders under the journals root, so naming a new journal "Maths" when a
  // Maths subject exists derives a root that *is* that subject's folder —
  // free by rootHolder, since no registered type claims it. Longest-root-wins
  // then hands every note in it to the new journal: its banner, its crumbs,
  // its trackers, its charts. Nothing is moved or deleted, and nothing says
  // anything happened.
  //
  // NEW TYPES ONLY. An existing journal's root exists precisely because the
  // journal does, so asking this of the edit form would refuse every save.
  //
  // Both folders, because the templates folder is derived from the same name
  // and colliding with someone's existing templates folder is the same
  // accident with the same silence.
  private occupiedFolder(): string | null {
    if (this.isEstablished) return null;
    for (const path of [this.draft.root, this.draft.templatesFolder]) {
      const norm = path.trim().replace(/\/+$/, "");
      if (norm === "") continue;
      if (this.app.vault.getAbstractFileByPath(norm)) return norm;
    }
    return null;
  }

  private resizeLevels(depth: number): void {
    const levels = this.draft.levels;
    if (depth === levels.length) return;
    if (depth === 1) {
      this.draft.levels = [levels[0]];
    } else if (depth === 2) {
      this.draft.levels = [
        levels[0],
        levels[1] ?? { noun: "Item", fallbackEmoji: "📄" },
      ];
    }
  }

  private validateIdentity(): ValidationProblem | null {
    if (!this.draft.name.trim()) return "Give the journal a name.";
    // The folders are derived from the name, so a name of nothing but
    // punctuation produces no folder at all rather than a bad one.
    if (journalFolderName(this.draft.name) === "")
      return "The name needs at least one letter or number — its folders are named after it.";
    if (!this.draft.root.trim() || !this.draft.templatesFolder.trim())
      return "Couldn't work out this journal's folders from its name.";
    if (!this.idIsFree(this.draft.id))
      return `Another journal type already uses the id "${this.draft.id}". Try a different name.`;
    // The folder message names the NAME, because that is the field there is to
    // change — the folder is no longer typed, so telling someone to give this
    // one a folder of its own would point at a control that isn't there.
    //
    // AND IT NAMES THE OTHER JOURNAL, AND ASKS WHETHER ITS FOLDER IS STILL THERE
    // (4.17 §2). It used to do neither, and the report that changed it is the
    // case where both matter: a reader deleted a journal's folders by hand, came
    // back to make it again, and was told the folder was taken by a journal
    // whose folder they could see was gone. The advice — pick a different name —
    // is advice for a collision with something that exists.
    //
    // The branch below already knew this. `occupiedFolder` was rewritten in 3.21
    // to offer three routes out precisely because "the old wording offered only
    // the two answers that lose the notes", and that judgement was applied to
    // one of a pair of adjacent refusals.
    const holder = this.rootHolder(this.draft.root);
    if (holder) {
      const { cfg, index } = holder;
      const onDisk = journalFoldersOnDisk(this.app, cfg);
      const shared = `"${this.draft.root.trim()}" is already ${cfg.name}'s folder, and two journals sharing a root can't be told apart from a note's path.`;
      // FOLDERS STILL THERE: a live journal with a reader's notes in it. Named,
      // and pointed at the route — but NOT offered a button, which the
      // maintainer chose explicitly. Unregistering a journal somebody is still
      // using is not the quick way past a wizard step, and a confirm is a thin
      // thing to have standing between a misread sentence and a vanished
      // sidebar section.
      if (onDisk.length > 0) {
        return `${shared} Give this one a different name, or delete ${cfg.name} from Settings → ChronoAnvil → Journals first.`;
      }
      // FOLDERS GONE: the reported case, and the only one that gets an action.
      // Deleting here is safe in a way nothing else in this file is — there is
      // nothing on disk left to lose, because the reader already removed it.
      return {
        message: `${shared}\n\nBut ${cfg.name}'s folders are no longer in your vault, so that registration is left over from a journal whose files were deleted. Removing it frees the name.`,
        action: {
          label: `Delete “${cfg.name}” and continue`,
          // WIDEN, NOT DELETE, for the trackers — and unlike the row, this does
          // not ask. The row asks because a reader who chose Delete on a row is
          // in a window about journals with time to answer a second question;
          // this fires mid-wizard, from a button whose label promises one
          // outcome, and quietly destroying trackers behind it would be the
          // opposite of what "and continue" says. Widening keeps every reading
          // ever logged, which is the answer that cannot lose work.
          run: () => removeJournal(this.plugin, index, "widen"),
        },
      };
    }
    const taken = this.occupiedFolder();
    if (taken)
      return (
        `"${taken}" already exists. A new journal would claim that folder and ` +
        `everything in it — its notes would start showing this journal's ` +
        `trackers and crumbs. Pick a different name, move that folder first, ` +
        // THE THIRD ROUTE, WHICH IS THE RIGHT ONE WHEN THE FOLDER IS ALREADY A
        // JOURNAL'S (3.21). Removing a journal no longer reserves its folder,
        // so a reader who removed one and wants it back — or who is starting
        // from the preset that made it — should adopt the folder rather than
        // create a second journal beside it. The old wording offered only the
        // two answers that lose the notes.
        `or adopt it from Settings → Journals if those notes are already a ` +
        `journal's.`
      );
    return null;
  }

  private validateStructure(): string | null {
    const named = normaliseKinds(this.draft.kinds, {
      preserveIds: this.isEstablished,
    });
    if (named.length === 0) return "Give at least one note type a name.";
    // A row with no name is dropped by normaliseKinds, which is right at the
    // point of saving and wrong as the *only* thing that happens: "Add kind"
    // creates a blank row, so a reader who added one and then pressed Next
    // watched it disappear between this step and the Sections rail with
    // nothing said. Refusing names the row and the fix.
    if (named.length < this.draft.kinds.length) {
      const blanks = this.draft.kinds.length - named.length;
      return blanks === 1
        ? "One note type has no name. Give it one, or remove the row."
        : `${blanks} note types have no name. Name them, or remove the rows.`;
    }
    return null;
  }

  protected validate(): ValidationProblem | null {
    return this.validateIdentity() ?? this.validateStructure();
  }

  // How many notes on disk carry a given `type:` value.
  //
  // Read at the moment the confirmation opens rather than tracked, because it
  // is cheap and because a stale number here would be worse than none: the
  // whole point of showing it is that "14 notes" is a thing a reader pictures
  // and "those notes" is not.
  private countNotesOfKind(root: string, kindId: string): number {
    let n = 0;
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith(`${root}/`)) continue;
      if (noteTypeOf(this.app, file) === kindId) n++;
    }
    return n;
  }

  // The offer the kind-change window has been promising. 3.18 follow-ups §4.
  //
  // THE WINDOW ALREADY SAID THIS WOULD HAPPEN. Its guarantee box reads
  // "Dashboards will offer to list the new type; nothing is written until you
  // accept the change" — a sentence 3.18 wrote and nothing kept. `extend` was
  // built, worked, and could only be reached by a reader who thought to open
  // *Edit sections…* on a note and press Save, with nothing anywhere telling
  // them there was a reason to. So the observed behaviour was readers deleting
  // and re-adding the section by hand.
  //
  // ONLY WHEN A KIND WAS ADDED. A rename or a removal cannot leave a dashboard
  // short of a table, so offering after one would be a window appearing to say
  // there is nothing to confirm — which is how a reader learns to dismiss
  // confirmations without reading them (`setupVault`'s argument, and the rule
  // it follows itself).
  //
  // NOTHING TO DO OPENS NOTHING, for the same reason.
  //
  // AFTER THE SAVE, NOT BEFORE. The plan is computed against the journal as it
  // now is: the kinds just added are what make a dashboard short in the first
  // place, so scanning before `onSave` would find nothing every time.
  //
  // DECLINING IS FREE AND STAYS FREE. The kind change is already committed by
  // this point; this is a second, separate consent about the reader's
  // dashboards, and refusing it leaves a vault behaving exactly as 3.17.1 did —
  // the notes exist, carry the right frontmatter, and are simply not listed
  // until the reader says so here or in the section editor later.
  private async offerDashboardCatchup(changes: KindChange[]): Promise<void> {
    if (!changes.some((c) => c.kind === "added")) return;

    const type = buildJournalType(this.draft);
    const pending = await findDashboardCatchups(this.app, type);
    if (!pending.length) return;

    // THE DIALOG IS THE PLAN, not a summary of it — `previewRepair`'s property,
    // and the reason `extend` carries a detail string rather than the word
    // "unchanged". Each line is the op's own detail ("Practice has no table
    // here — it will be added"), so what the reader accepts is what was
    // computed.
    const ok = await confirmPlan(
      this.app,
      `List the new note type on ${pending.length} dashboard${
        pending.length === 1 ? "" : "s"
      }?`,
      "These index notes and templates were written before the note type " +
        "existed, so they have no table for it. Only the missing tables are " +
        "added — nothing already in them is moved, rewritten or removed, and " +
        "no note you have written is touched.",
      pending.map((p) => ({
        label: p.file.basename,
        lines: p.ops.map((o) => `${o.label} — ${o.detail}`),
      })),
      "Add the tables"
    );
    if (!ok) return;

    const written = await applyDashboardCatchups(
      this.app,
      type,
      pending.map((p) => p.file)
    );
    if (written) {
      new Notice(
        `ChronoAnvil: updated ${written} dashboard${written === 1 ? "" : "s"} ✅`
      );
    }
  }

  protected async commit(): Promise<void> {
    this.draft.name = this.draft.name.trim();
    const kindsBefore = this.kindsOnOpen;
    this.draft.kinds = normaliseKinds(this.draft.kinds, {
      preserveIds: this.isEstablished,
    });
    // Same rule as kinds, for the same reason. An existing journal's level ids
    // are the `type:` value on every index note it has already written, so
    // re-deriving them from an edited noun would declassify all of them; a new
    // journal has no notes yet, so its ids follow the noun it was given.
    this.draft.levels = normaliseLevels(this.draft.levels, {
      preserveIds: this.isEstablished,
    });
    // ── kinds, on a type that already has notes ───────────────────────
    //
    // The hard confirmation, and everything downstream of it. Fires before
    // onSave so that Cancel abandons the whole save rather than leaving
    // settings changed and the folder not: the same reading of "I did not
    // answer" the tracker-orphan picker settled on.
    if (this.isEstablished) {
      const changes = diffKinds(kindsBefore, this.draft.kinds);
      if (kindChangeNeedsConfirming(changes)) {
        const counts: KindChangeCounts = {};
        for (const c of changes) {
          if (c.kind === "removed") {
            counts[c.id] = this.countNotesOfKind(this.draft.root, c.id);
          }
        }
        const ok = await confirmKindChange(
          this.app,
          this.plugin,
          this.draft.name,
          changes,
          counts
        );
        if (!ok) return;
      }

      await this.onSave(this.draft);

      // Only now, and only what is missing. A kind added in this window gets
      // its template here rather than the reader being told to run a repair
      // command they have no reason to know about.
      if (changes.length) {
        const written = await this.plugin.scaffold.ensureJournalTemplates(
          this.draft
        );
        if (written.length) {
          new Notice(
            `ChronoAnvil: wrote ${written.join(", ")} ✅`
          );
        }
        await this.offerDashboardCatchup(changes);
      }
      // A LABEL CHANGE IS INVISIBLE TO EVERY FILE WATCHER (3.20.1). Renaming a
      // note type here rewrites no note, so nothing in an open dashboard was
      // told — its buttons and empty states kept the old word until the reader
      // reopened the note. Unconditional rather than gated on a label having
      // changed: an emoji, a rating property and a kind's removal are all just
      // as invisible, and a repaint of open notes costs nothing when nothing
      // differs.
      repaintOpenNotes(this.app);
      return;
    }

    // THE ORDER, WRITTEN WHERE THE COMPOSER READS IT (3.18 §2.2).
    //
    // `composeTemplate` drops the chosen ids into a Set and then walks
    // `sectionsFor(ctx, layout)` — so the ids say WHICH sections and the layout
    // says in what order, and passing an ordered array to the first would have
    // been silently discarded. `sectionsFor` has sorted by `layout.order` since
    // saved layouts existed; nothing there needed changing.
    //
    // `sections` AS WELL AS `order`, UNCONDITIONALLY (5.20).
    //
    // IT USED TO BE `order` ALONE, created beside a `sections` the layout
    // already had and never created otherwise, and the argument was: *"the
    // wizard says where sections go; it must not also freeze which, or a
    // journal created today would never gain a section the catalogue adds
    // tomorrow."* That argument was about the sections the reader did NOT
    // touch. It silently threw away the ones they did.
    //
    // `defaultSectionIds` filters on `default(ctx)` REGARDLESS OF LAYOUT — a
    // layout can reorder, and `sections` is the only field that can turn a
    // `default: never` section on. So a reader who ticked Recall cards in the
    // wizard got them at Create, because `createJournalType` is handed
    // `this.chosen` directly; and then nothing recorded the tick, so
    // `refreshJournalTemplates` — whose own blurb warns *"Custom edits will be
    // replaced"* — recomposed from the catalogue and took them back out.
    //
    // 5.20 IS WHAT MADE THIS BITE. Ten sections became `default: never` and
    // every preset's `sections` pin was deleted, so `prev?.sections` is now
    // false on essentially every key: the branch that saved the reader's
    // answer stopped running at the same moment there were ten more answers
    // worth saving. The list written here is `chosen`, which is seeded from
    // `chosenSectionIds` — the catalogue's own defaults where the reader
    // changed nothing — so a fresh journal still stores what it would have
    // composed anyway.
    for (const [key, ids] of this.chosen) {
      const prev = this.draft.layout?.[key];
      this.draft.layout = {
        ...(this.draft.layout ?? {}),
        [key]: {
          ...(prev ?? {}),
          order: [...ids],
          sections: [...ids],
        },
      };
    }
    await this.onSave(this.draft);
    // Write the templates now, with the sections chosen. This is the one
    // moment a designed template is produced; from here the files are the
    // user's, and nothing in the plugin will rewrite them.
    await this.plugin.scaffold.createJournalType(this.draft, this.chosen);
  }
}

export function openJournalEditor(
  app: App,
  plugin: ChronoAnvilPlugin,
  cfg: JournalConfig,
  opts: {
    mode: JournalEditorMode;
    index: number;
    guesses?: string[];
    // Open on a later step. Settings uses it to land on Sections directly,
    // which was four clicks away. Clamped by goTo, so an out-of-range value
    // opens the last step rather than a blank window.
    step?: number;
    // Trackers a preset is about to install. Offered to the "Rated on"
    // dropdown so a preset's rating draws its own label rather than
    // "Nothing"; never written from here. 4.35 §1.4.
    pendingTrackers?: TrackerDef[];
  },
  onSave: (cfg: JournalConfig) => Promise<void>
): void {
  const modal = new JournalEditModal(
    app,
    plugin,
    cfg,
    opts.mode,
    opts.index,
    onSave,
    opts.guesses ?? [],
    opts.pendingTrackers ?? []
  );
  if (opts.step !== undefined) modal.startAt(opts.step);
  modal.open();
}

// ── Study emoji editor ────────────────────────────────────────────────────
// Study's shape is hand-written, so the only thing to edit is its folder emoji
// map — a tall textarea that had no business sitting inline in the settings
// tab, pushing every journal type below it off screen.
// The vault's folder-emoji pool.
//
// Was "Study folder emojis" and lived on the Study row. The map was never
// Study-specific — a folder called Chemistry wants ⚗️ whether it is a subject,
// a cuisine or a project area — so as of 2.39 it is one pool for every journal
// type and every level, edited once, in the Journals section rather than
// inside one preset's row.
class FolderEmojiModal extends EditorModal {
  private text: string;

  constructor(
    app: App,
    plugin: ChronoAnvilPlugin,
    private onSave: () => Promise<void>
  ) {
    super(
      app,
      plugin,
      "Folder emojis",
      "One pool for every journal and every folder level. Matched case-insensitively against a folder's name; a name that isn't listed falls back to the emoji set on its level.",
      "Save"
    );
    this.text = stringifyEmojiMap(plugin.settings.folderEmojis);
  }

  protected renderBody(): void {
    new Setting(this.body)
      .setName("Emojis")
      .setDesc(
        "One “Name: emoji” per line. Study falls back to 📚 for a Subject and 📂 for a Topic; a custom journal falls back to whatever its level is set to."
      )
      .setClass("ca-editor-textarea")
      .addTextArea((c) => {
        c.setValue(this.text);
        c.inputEl.rows = 12;
        c.inputEl.addClass("ca-editor-mono");
        c.onChange((v) => {
          this.text = v;
        });
      });
  }

  protected validate(): string | null {
    return null;
  }

  protected async commit(): Promise<void> {
    this.plugin.settings.folderEmojis = parseEmojiMap(this.text);
    await this.onSave();
  }
}

export function openFolderEmojiEditor(
  app: App,
  plugin: ChronoAnvilPlugin,
  onSave: () => Promise<void>
): void {
  new FolderEmojiModal(app, plugin, onSave).open();
}


// A ghost icon button for a list row's action cluster.
export function rowButton(
  host: HTMLElement,
  icon: string,
  tooltip: string,
  onClick: () => void,
  opts: { disabled?: boolean; danger?: boolean } = {}
): HTMLElement {
  const btn = host.createEl("button", { cls: "ca-list-btn" });
  setIcon(btn, icon);
  btn.setAttribute("aria-label", tooltip);
  btn.setAttribute("title", tooltip);
  if (opts.danger) btn.addClass("is-danger");
  if (opts.disabled) {
    btn.addClass("is-disabled");
    btn.disabled = true;
  } else {
    btn.addEventListener("click", onClick);
  }
  return btn;
}
