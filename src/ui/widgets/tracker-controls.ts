// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The tracker cell: turning a TrackerDef into the control that logs it.
//
// buildTracker is the dispatcher — it reads a definition out of the registry
// and picks a stepper, a scale picker, a checkbox, a time field, a select. The
// rest of this file is the controls that are specific to trackers rather than
// generic form inputs: the emoji scale picker, the habit checkbox and its
// chip, the coupled sleep control, the "+ Add tracker" tile.
//
// WHY THIS DID NOT MOVE TO src/trackers/
//
// The chart adapters did move, to src/charts/chart-widgets.ts, and the
// reasoning looks like it should apply here too: charts and trackers are both
// domains with their own folders, and both had widget shells stranded in the
// Widgets class.
//
// The difference is which way the dependency points. The chart shells needed
// nothing from the widget layer — they drew a tile and called renderTrackerChart
// — so they could sit in charts/ with charts/ still depending only on
// trackers/. These need WidgetHost: they read and write frontmatter values
// through the same two methods every other control uses. Putting them in
// src/trackers/ would make trackers/ import the widget layer, which is the
// inversion that the charts/trackers split was arranged to avoid. So they stay
// here, next to ./controls.ts, which is what they are a specialisation of.

import { MarkdownPostProcessorContext, setIcon } from "obsidian";
import type { EntryControlHost } from "./controls";
import { CAPTURE_NOTE_KEY } from "../../core/constants";
import { readNoteRegion } from "../../core/notestore";
import {
  awakeHours,
  formatSleepRatio,
  frontmatterOf,
  isoDate,
  sleepHours,
  today,
} from "../../core/util";
import {
  TrackerDef,
  getBuiltinTracker,
  getTracker,
  noteKindOf,
} from "../../trackers/trackers";
import {
  describeDirective,
  isManagedTemplate,
  surfacePathConfig,
} from "../../trackers/entry-trackers";
import { locateEntry } from "../../diary/lineage";
import { hasScaleNoteFor } from "../../journals/scale-notes";
import { TagsEditor } from "../tags-editor";
import {
  TAGS_PROPERTY,
  readTags,
  suggestionFolderFor,
  tagsValue,
} from "../../trackers/tags";
import { openScaleNoteCapture } from "../../diary/capture";
import {
  buildDerivedChip,
  buildSelect,
  buildStepper,
  buildTimeOrDate,
} from "./controls";

/**
 * What a tracker control needs: the value contract every control has, plus the
 * registry (via the plugin) and enough of the vault to find a scale note.
 *
 * Extends WidgetHost rather than restating currentValue/write, because a
 * tracker control IS a control — the extra members are what makes it a tracker
 * one.
 */

export async function hasScaleNote(
  deps: EntryControlHost,
  ctx: MarkdownPostProcessorContext,
  trackerId: string,
  value: number
): Promise<boolean> {
  const file = deps.fileOf(ctx);
  if (!file) return false;
  const paths = surfacePathConfig(deps.plugin);
  const fm = frontmatterOf(deps.plugin.app, file);
  const kind = noteKindOf(paths, file.path, fm["journal"], fm["type"]);
  if (kind?.surface === "journal") {
    const targetDate =
      isoDate(fm["date"]) ?? isoDate(fm["journal-date"]) ?? today();
    const dayFile = locateEntry(
      deps.plugin.app,
      deps.plugin.settings.paths,
      "daily",
      targetDate
    );
    if (!dayFile) return false;
    const text = await deps.plugin.app.vault.cachedRead(dayFile);
    return hasScaleNoteFor(
      readNoteRegion(text, CAPTURE_NOTE_KEY),
      trackerId,
      value
    );
  }
  const text = await deps.plugin.app.vault.cachedRead(file);
  return hasScaleNoteFor(
    readNoteRegion(text, CAPTURE_NOTE_KEY),
    trackerId,
    value
  );
}


export function wireHabit(
  deps: EntryControlHost,
  mark: HTMLElement,
  press: HTMLElement,
  def: TrackerDef,
  ctx: MarkdownPostProcessorContext,
  onState?: (known: number | null) => void
): void {
  const initial = deps.currentValue(ctx, def.id);
  const initialNum =
    initial == null || initial === "" ? NaN : Number(initial);
  // null = unset, 1 = done, 0 = not-done.
  let known: number | null = Number.isFinite(initialNum)
    ? initialNum >= 0.5
      ? 1
      : 0
    : null;

  const render = (): void => {
    mark.toggleClass("is-done", known === 1);
    mark.toggleClass("is-not-done", known === 0);
    mark.setText(known === 1 ? "✓" : known === 0 ? "✗" : "");
    const state = known === 1 ? "done" : known === 0 ? "not done" : "unset";
    press.setAttr("aria-label", `${def.label}: ${state}`);
    press.setAttr("title", `${def.label}: ${state}`);
    onState?.(known);
  };

  press.addEventListener("click", () => {
    // unset → done → not-done → unset
    known = known == null ? 1 : known === 1 ? 0 : null;
    render();
    void deps.write(ctx, def.id, known);
  });

  render();
}


export function attachTrackerRemove(
  deps: EntryControlHost,
  cell: HTMLElement,
  directive: string,
  ctx: MarkdownPostProcessorContext
): void {
  if (isManagedTemplate(deps.plugin, ctx.sourcePath)) return;
  const name = describeDirective(deps.plugin.settings.trackers, directive);
  const btn = cell.createEl("button", {
    cls: "journal-tracker-remove",
    attr: {
      "aria-label": `Remove ${name} from this entry`,
      title: `Remove ${name} from this entry`,
    },
  });
  setIcon(btn, "x");
  btn.addEventListener("click", (evt) => {
    // The cell's own control (a stepper button, a time field) sits under
    // this one; stop the click before it reaches either.
    evt.preventDefault();
    evt.stopPropagation();
    void deps.plugin.entryTrackers.removeTracker(ctx.sourcePath, directive);
  });
}


export function buildCheckbox(
  deps: EntryControlHost,
  def: TrackerDef,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const wrap = createSpan({ cls: "journal-widget journal-habit" });
  const box = wrap.createEl("button", { cls: "journal-habit-box" });
  wireHabit(deps, box, box, def, ctx);
  return wrap;
}


export function buildHabitChip(
  deps: EntryControlHost,
  cell: HTMLElement,
  def: TrackerDef,
  label: string,
  directive: string,
  ctx: MarkdownPostProcessorContext
): void {
  const row = cell.querySelector(".journal-habits-row");
  if (!(row instanceof HTMLElement)) return;
  const chip = row.createSpan({ cls: "journal-habit-chip" });
  const press = chip.createEl("button", { cls: "journal-habit-chip-btn" });
  const box = press.createSpan({ cls: "journal-habit-box" });
  press.createSpan({ cls: "journal-habit-chip-name", text: label });
  wireHabit(deps, box, press, def, ctx, (known) => {
    chip.toggleClass("is-done", known === 1);
    chip.toggleClass("is-not-done", known === 0);
  });
  attachTrackerRemove(deps, chip, directive, ctx);
}


export function cleanFaceGlyph(rawFace: string): string {
  const trimmed = rawFace.trim();
  const chars = Array.from(trimmed);
  if (chars.length > 1 && chars.every((c) => c === chars[0])) {
    return chars[0];
  }
  return trimmed;
}

export function buildScalePicker(
  deps: EntryControlHost,
  def: TrackerDef,
  ctx: MarkdownPostProcessorContext
): HTMLElement | null {
  const rawFaces = def.faces ?? [];
  if (rawFaces.length < 2 || def.min == null || def.max == null || def.max <= def.min) {
    return null;
  }
  const faces = rawFaces.map(cleanFaceGlyph);
  const step = def.step && def.step > 0 ? def.step : 1;
  const span = def.max - def.min;
  // Value each face maps to, snapped onto the tracker's own scale.
  const valueFor = (i: number): number => {
    const raw = def.min! + (span * i) / (faces.length - 1);
    const snapped = def.min! + Math.round((raw - def.min!) / step) * step;
    return Math.round(snapped * 1e6) / 1e6;
  };

  const isStars =
    def.id.toLowerCase().includes("star") ||
    (faces.length > 0 && faces.every((f) => f === "★" || f === "⭐"));
  const wrap = createSpan({
    cls: `journal-widget journal-mood-picker${isStars ? " is-stars" : ""}`,
  });
  const facesRow = wrap.createSpan({ cls: "journal-scale-faces" });
  const initial = deps.currentValue(ctx, def.id);
  const initialNum =
    initial == null || initial === "" ? NaN : Number(initial);
  let known: number | null = Number.isFinite(initialNum) ? initialNum : null;

  // The context-note affordance: a pencil badge pinned to the corner of the
  // SELECTED face, and the second press of that face opens the capture.
  //
  // It used to be a button of its own, sitting after the faces. That put the
  // control for "why was today a 4?" next to the *last* face rather than
  // next to the four, so it read as belonging to the widget rather than to
  // the reading — and in a two-column logging grid it cost a face's worth of
  // width on every scale cell to say something only one value at a time can
  // be true of. Moving the mark onto the chosen face makes the association
  // the layout's job instead of the reader's, and gives the row its width
  // back.
  //
  // The cost is that the selected face's second press is no longer "clear
  // this". Clearing moves to right-click (and Alt-click, for a trackpad
  // without one), which is the right way round: annotating a reading is the
  // thing you do daily, and unsetting one is the thing you do by mistake.
  let hasNote = false;
  const noteMark = createSpan({ cls: "journal-scale-note-mark" });
  setIcon(noteMark, "pencil");

  const paintNote = (): void => {
    noteMark.toggleClass("has-note", hasNote);
  };

  // Refresh the pencil's filled state from the log for the current value.
  const refreshHasNote = (): void => {
    if (known == null) {
      hasNote = false;
      paintNote();
      return;
    }
    const value = known;
    void hasScaleNote(deps, ctx, def.id, value).then((present) => {
      // Guard against a value change landing before this resolves.
      if (known === value) {
        hasNote = present;
        paintNote();
      }
    });
  };

  const openNote = (): void => {
    if (known == null) return;
    const file = deps.fileOf(ctx);
    if (!file) return;
    openScaleNoteCapture(deps.plugin, file, {
      trackerId: def.id,
      value: known,
      label: def.label,
    });
    // The capture writes asynchronously via the modal; re-check the log a
    // moment after the modal is likely closed so the pencil fills in. A
    // metadata/vault change would also re-render the widget, but this makes
    // the affordance feel immediate without depending on that.
    window.setTimeout(refreshHasNote, 400);
  };

  const clear = (): void => {
    known = null;
    hasNote = false;
    paint();
    void deps.write(ctx, def.id, null);
  };

  const buttons: HTMLElement[] = [];
  const paint = (): void => {
    // Highlight the face whose value is closest to the stored value.
    let best = -1;
    let bestDist = Infinity;
    if (known != null) {
      faces.forEach((_, i) => {
        const d = Math.abs(valueFor(i) - known!);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
    }
    buttons.forEach((b, i) => {
      b.toggleClass("is-selected", i === best);
      // Tooltips say what the *next* press of that face does, which is now
      // two different things depending on whether it is the chosen one.
      b.setAttr(
        "title",
        i === best
          ? `${def.label}: ${valueFor(i)} — click to add a note, right-click to clear`
          : `${def.label}: ${valueFor(i)}`
      );
    });
    // One badge, moved rather than one per face: it is a property of the
    // reading, and there is only ever one reading.
    if (best === -1) noteMark.detach();
    else buttons[best].appendChild(noteMark);
    paintNote();
  };

  faces.forEach((face, i) => {
    const value = valueFor(i);
    const btn = facesRow.createEl("button", {
      cls: "journal-mood-face",
      attr: { "aria-label": `${def.label}: ${value}` },
    });
    // The glyph is its own span so the note badge can be a sibling of it
    // rather than a stray node beside a text child — `setText` on the
    // button would otherwise wipe the badge out.
    btn.createSpan({ cls: "journal-mood-face-glyph", text: face });
    btn.createSpan({ cls: "journal-mood-face-val", text: String(value) });
    const selected = (): boolean =>
      known != null && Math.abs(valueFor(i) - known) < 1e-9;
    btn.addEventListener("click", (evt) => {
      if (selected()) {
        // Alt-click is the keyboard-and-trackpad way to the right-click
        // action below, for the same reason Obsidian offers one everywhere
        // it has a context menu.
        if (evt.altKey) clear();
        else openNote();
        return;
      }
      known = value;
      paint();
      void deps.write(ctx, def.id, value);
      // A note is about a specific value, so the pencil's filled state is
      // per-value: switching faces re-checks whether *this* value has a note.
      refreshHasNote();
    });
    btn.addEventListener("contextmenu", (evt) => {
      if (!selected()) return;
      evt.preventDefault();
      evt.stopPropagation();
      clear();
    });
    if (isStars) {
      btn.addEventListener("mouseenter", () => {
        buttons.forEach((b, idx) => {
          b.toggleClass("is-star-trail", idx <= i);
        });
      });
      btn.addEventListener("mouseleave", () => {
        buttons.forEach((b) => b.removeClass("is-star-trail"));
      });
    }
    buttons.push(btn);
  });

  paint();
  refreshHasNote();
  return wrap;
}


export function buildSleep(
  deps: EntryControlHost,ctx: MarkdownPostProcessorContext): HTMLElement | null {
  const bed = getBuiltinTracker(deps.plugin, "bed");
  const wake = getBuiltinTracker(deps.plugin, "wake");
  if (!bed || !wake) {
    return createSpan({
      cls: "journal-widget-error",
      text: "Sleep needs the Wake-Up and Bedtime built-ins (Settings → Trackers).",
    });
  }

  const wrap = createDiv({ cls: "journal-widget journal-sleep" });
  const inputs = wrap.createDiv({ cls: "journal-sleep-inputs" });

  const field = (def: TrackerDef): HTMLInputElement => {
    const group = inputs.createDiv({ cls: "journal-sleep-field" });
    group.createSpan({ cls: "journal-sleep-label", text: def.label });
    const input = group.createEl("input", { type: "time" });
    const cur = deps.currentValue(ctx, def.id);
    if (cur != null && cur !== "") input.value = String(cur);
    return input;
  };

  // Bedtime first, then Wake-Up — the order a night runs.
  const bedInput = field(bed);
  const wakeInput = field(wake);
  const readout = wrap.createDiv({ cls: "journal-sleep-readout" });

  const refresh = (): void => {
    readout.empty();
    const hrs = sleepHours(bedInput.value, wakeInput.value);
    if (hrs == null) {
      readout.createSpan({
        cls: "journal-sleep-hint",
        text: "Set both times to see your sleep.",
      });
      return;
    }
    const awake = awakeHours(bedInput.value, wakeInput.value);
    readout.createSpan({
      cls: "journal-sleep-asleep",
      text: `😴 ${formatSleepRatio(hrs)}`,
    });
    readout.createSpan({
      cls: "journal-sleep-divider",
      text: "/",
    });
    readout.createSpan({
      cls: "journal-sleep-awake",
      text: `${formatSleepRatio(awake)} ☀️`,
    });
  };

  bedInput.addEventListener("change", () => {
    void deps.write(ctx, bed.id, bedInput.value || null);
    refresh();
  });
  wakeInput.addEventListener("change", () => {
    void deps.write(ctx, wake.id, wakeInput.value || null);
    refresh();
  });

  refresh();
  return wrap;
}


export function buildTrackerAddCell(
  deps: EntryControlHost,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const cell = createSpan({
    cls: "journal-widget journal-tracker-cell journal-tracker-add",
  });
  const btn = cell.createEl("button", { cls: "journal-tracker-add-btn" });
  setIcon(btn.createSpan({ cls: "journal-btn-icon" }), "plus");
  btn.createSpan({ cls: "journal-btn-label", text: "Add tracker" });
  const hint = "Add a tracker to this entry only";
  btn.setAttr("aria-label", hint);
  btn.setAttr("title", hint);
  btn.addEventListener("click", () => {
    void deps.plugin.entryTrackers.addTracker(ctx.sourcePath);
  });
  return cell;
}


// The Tags control: what this note carries, and the door to the window that
// changes it.
//
// THE CELL IS A READOUT AND ONE BUTTON, deliberately. Every other tracker
// control edits in place because every other tracker holds ONE value and a tap
// is the whole edit — a face, a checkbox, a stepper. A list has no such tap:
// adding, renaming and removing are three different edits and at least one of
// them needs typing, which is a dialogue's job (see `tags-editor.ts`). So the
// control shows the answer and opens the window, and the window is where the
// note is written.
//
// IT DRAWS NO LABEL OF ITS OWN. `tracker` is not in `SELF_LABELLED_KINDS`, so
// the dispatcher wraps this in `journal-widget-labeled` and puts the eyebrow
// above it — which is what every stepper and picker in the bar gets. The first
// cut drew a second label inside the cell, so a weekly entry read TAGS over
// "Tags" over a control: the exact duplicate that list exists to prevent, and
// the same rule 3.13 §10.2 wrote down for the palette and the ribbon. The
// group is named once per surface.
//
// It reads through `processFrontMatter` like everything else, but not through
// `deps.write`: that method takes `string | number | null`, which is the right
// contract for a value and cannot express a list. Widening it for one caller
// would put an array in the signature of every control that will never write
// one.
function buildTagsField(
  deps: EntryControlHost,
  def: TrackerDef,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const wrap = createDiv({ cls: "journal-widget journal-tags-field" });

  // WHAT THIS NOTE CARRIES, HELD LOCALLY ONCE IT HAS BEEN WRITTEN — the same
  // `known` that every stepper, checkbox and picker in this file keeps, and
  // for the reason written beside them:
  //
  //   processFrontMatter's promise resolves once the file is saved, but
  //   Obsidian updates its cache on a separate, slightly-delayed pass, so
  //   reading it back immediately can return the value from *before* this
  //   write.
  //
  // Reported on a daily entry: adding the first tag left the cell still
  // offering to add one, and adding a second showed the first. Exactly one
  // behind, which is that pass. Null means nothing has been written from here
  // yet, so the cache — which may hold tags a reader typed into the property
  // panel — is the authority; after a save this list is, because it is what
  // went into the file.
  let known: string[] | null = null;
  const read = (): string[] =>
    known ?? readTags(deps.currentValue(ctx, TAGS_PROPERTY));

  const openWindow = (paint: () => void): void => {
    const file = deps.fileOf(ctx);
    if (!file) return;
    new TagsEditor(
      deps.plugin.app,
      deps.plugin,
      suggestionFolderFor(file),
      read(),
      async (next) => {
        await deps.plugin.app.fileManager.processFrontMatter(file, (fm) => {
          const value = tagsValue(next);
          // Null deletes the key rather than writing `tags: []` — a note that
          // had no tags, gained one and lost it again should read exactly as
          // it did before anyone opened the window.
          if (value == null) delete fm[TAGS_PROPERTY];
          else fm[TAGS_PROPERTY] = value;
        });
        known = readTags(next);
        paint();
      }
    ).open();
  };

  const paint = (): void => {
    wrap.empty();
    const tags = read();

    // EMPTY IS ONE CONTROL, NOT AN EMPTY STATE PLUS A CONTROL. The first cut
    // spent two of the cell's three lines on a phrase reporting the absence,
    // above a full-width block button — mostly chrome for the case with
    // nothing to show. A tracker cell with no reading draws its affordance and
    // nothing else; this one now does too.
    if (tags.length === 0) {
      const add = wrap.createEl("button", {
        cls: "journal-tags-add",
        attr: { type: "button", "aria-label": `Add ${def.label.toLowerCase()}` },
      });
      setIcon(add.createSpan({ cls: "journal-btn-icon" }), "plus");
      add.createSpan({ text: "Add tags" });
      add.addEventListener("click", () => openWindow(paint));
      return;
    }

    // The chips ARE the control: clicking any of them opens the window at the
    // list they belong to, so the reading and the way to change it are the
    // same target rather than a readout with a button beside it.
    const chips = wrap.createEl("button", {
      cls: "journal-tags-chips",
      attr: {
        type: "button",
        "aria-label": `Manage ${def.label.toLowerCase()} (${tags.length})`,
      },
    });
    for (const tag of tags) {
      chips.createSpan({ cls: "journal-tags-chip", text: `#${tag}` });
    }
    setIcon(
      chips.createSpan({ cls: "journal-btn-icon journal-tags-pencil" }),
      "pencil"
    );
    chips.addEventListener("click", () => openWindow(paint));
  };

  paint();
  return wrap;
}

export function buildTracker(
  deps: EntryControlHost,
  rest: string,
  ctx: MarkdownPostProcessorContext
): HTMLElement | null {
  const id = rest.trim();
  const def = getTracker(deps.plugin, id);
  if (!def) {
    const err = createSpan({
      cls: "journal-widget-error",
      text: `Unknown tracker: ${id} (check Settings → Trackers)`,
    });
    return err;
  }
  // Derived built-ins (Sleep) are computed, not entered — show a read-only
  // value chip rather than an editable control.
  if (def.derived) return buildDerivedChip(deps, def, ctx);
  // A scale tracker (Mood, Energy, Focus, or any user-defined one) renders as
  // a face/word picker, falling back to the stepper if it declares no usable
  // range or too few faces. Keyed off the type, not a built-in id — that is
  // the generalisation: every scale gets the picker, Mood is just the one
  // that ships enabled.
  if (def.type === "scale") {
    const picker = buildScalePicker(deps, def, ctx);
    if (picker) return picker;
    return buildStepper(deps, def, ctx);
  }
  switch (def.type) {
    case "tags":
      return buildTagsField(deps, def, ctx);
    case "number":
      return buildStepper(deps, def, ctx);
    case "boolean":
      return buildCheckbox(deps, def, ctx);
    case "time":
      return buildTimeOrDate(deps, def.id, ctx, "time");
    case "date":
      return buildTimeOrDate(deps, def.id, ctx, "date");
    case "select":
      return buildSelect(deps, `${def.id}:${def.options ?? ""}`, ctx);
    default:
      return null;
  }
}
