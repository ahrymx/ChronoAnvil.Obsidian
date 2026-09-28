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

import { MarkdownPostProcessorContext, MarkdownRenderChild, setIcon } from "obsidian";
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
    cls: "ca-journal-tracker-remove",
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
  const wrap = createSpan({ cls: "ca-journal-widget ca-journal-habit" });
  const box = wrap.createEl("button", { cls: "ca-journal-habit-box" });
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
  const row = cell.querySelector(".ca-journal-habits-row");
  if (!(row instanceof HTMLElement)) return;
  const chip = row.createSpan({ cls: "ca-journal-habit-chip" });
  const press = chip.createEl("button", { cls: "ca-journal-habit-chip-btn" });
  const box = press.createSpan({ cls: "ca-journal-habit-box" });
  press.createSpan({ cls: "ca-journal-habit-chip-name", text: label });
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
    cls: `ca-journal-widget ca-journal-mood-picker${isStars ? " is-stars" : ""}`,
  });
  const facesRow = wrap.createSpan({ cls: "ca-journal-scale-faces" });
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
  const noteMark = createSpan({ cls: "ca-journal-scale-note-mark" });
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
      cls: "ca-journal-mood-face",
      attr: { "aria-label": `${def.label}: ${value}` },
    });
    // The glyph is its own span so the note badge can be a sibling of it
    // rather than a stray node beside a text child — `setText` on the
    // button would otherwise wipe the badge out.
    btn.createSpan({ cls: "ca-journal-mood-face-glyph", text: face });
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
      cls: "ca-journal-widget-error",
      text: "Sleep needs the Wake-Up and Bedtime built-ins (Settings → Trackers).",
    });
  }

  const wrap = createDiv({ cls: "ca-journal-widget ca-journal-sleep" });
  const buttonsRow = wrap.createDiv({ cls: "ca-journal-sleep-inputs" });

  const createSleepButton = (
    def: TrackerDef,
    icon: string,
    defaultLabel: string
  ): { getValue: () => string; setValue: (v: string | null) => void } => {
    const btn = buttonsRow.createEl("button", {
      cls: "ca-journal-sleep-btn",
      attr: {
        type: "button",
        "aria-label": `${def.label}: click to set time`,
        title: `${def.label}: click to set time (right-click to clear)`,
      },
    });

    btn.createSpan({ cls: "ca-journal-sleep-btn-icon", text: icon });
    const labelSpan = btn.createSpan({
      cls: "ca-journal-sleep-btn-text",
      text: defaultLabel,
    });

    const hiddenInput = btn.createEl("input", {
      type: "time",
      cls: "ca-journal-sleep-hidden-input",
      attr: {
        "aria-label": def.label,
        title: def.label,
      },
    });

    const updateDisplay = (val: string | null): void => {
      if (val && val.trim() !== "") {
        hiddenInput.value = val;
        labelSpan.setText(val);
        btn.addClass("is-set");
      } else {
        hiddenInput.value = "";
        labelSpan.setText(defaultLabel);
        btn.removeClass("is-set");
      }
    };

    const initial = deps.currentValue(ctx, def.id);
    updateDisplay(initial != null && initial !== "" ? String(initial) : null);

    const openPicker = (): void => {
      try {
        if (typeof hiddenInput.showPicker === "function") {
          hiddenInput.showPicker();
        } else {
          hiddenInput.focus();
          hiddenInput.click();
        }
      } catch {
        hiddenInput.focus();
        hiddenInput.click();
      }
    };

    btn.addEventListener("click", (evt) => {
      if (evt.defaultPrevented) return;
      openPicker();
    });

    btn.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        openPicker();
      }
    });

    hiddenInput.addEventListener("change", () => {
      const val = hiddenInput.value || null;
      updateDisplay(val);
      void deps.write(ctx, def.id, val);
      refresh();
    });

    btn.addEventListener("contextmenu", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      updateDisplay(null);
      void deps.write(ctx, def.id, null);
      refresh();
    });

    return {
      getValue: () => hiddenInput.value,
      setValue: (v: string | null) => updateDisplay(v),
    };
  };

  // Bedtime first, then Wake-Up — the order a night runs.
  const bedCtrl = createSleepButton(bed, "🌙", "Bed");
  const wakeCtrl = createSleepButton(wake, "⏰", "Wake");
  const readout = wrap.createDiv({ cls: "ca-journal-sleep-readout" });

  const refresh = (): void => {
    readout.empty();
    const hrs = sleepHours(bedCtrl.getValue(), wakeCtrl.getValue());
    if (hrs == null) {
      readout.createSpan({
        cls: "ca-journal-sleep-hint",
        text: "Set both times to see your sleep.",
      });
      return;
    }
    const awake = awakeHours(bedCtrl.getValue(), wakeCtrl.getValue());
    readout.createSpan({
      cls: "ca-journal-sleep-asleep",
      text: `😴 ${formatSleepRatio(hrs)}`,
    });
    readout.createSpan({
      cls: "ca-journal-sleep-divider",
      text: "/",
    });
    readout.createSpan({
      cls: "ca-journal-sleep-awake",
      text: `${formatSleepRatio(awake)} ☀️`,
    });
  };

  refresh();
  return wrap;
}


export function buildTrackerAddCell(
  deps: EntryControlHost,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const cell = createSpan({
    cls: "ca-journal-widget ca-journal-tracker-cell ca-journal-tracker-add",
  });
  const btn = cell.createEl("button", { cls: "ca-journal-tracker-add-btn" });
  setIcon(btn.createSpan({ cls: "ca-journal-btn-icon" }), "plus");
  btn.createSpan({ cls: "ca-journal-btn-label", text: "Add tracker" });
  const hint = "Add a tracker to this entry only";
  btn.setAttr("aria-label", hint);
  btn.setAttr("title", hint);
  btn.addEventListener("click", () => {
    void deps.plugin.entryTrackers.addTracker(ctx.sourcePath);
  });
  return cell;
}


// ── HOW MANY TAG CHIPS FIT, ASKED OF THE LAYOUT (1.0.46) ────────────────

/** Rows of chips the cell has room for — `max-height: 40px` on
    `.ca-journal-tags-chips`, in `94-native-tables.css`, expressed as rows. */
const TAG_ROWS = 2;

/** How far apart two centres must be to be different rows. A chip is about
    17px tall, so half a row is the widest this can safely be. */
const TAG_ROW_SLOP = 6;

// Which rows a set of visible elements occupies.
//
// BY THE CENTRE, NOT BY `offsetTop`, and the difference is the whole bug this
// function shipped with. `block-drag.ts` compares `offsetTop` to decide "same
// line", and it is right to: the blocks it drags are full-width rows of equal
// height. These are not. The box is `align-items: center`
// (`94-native-tables.css`), so every item on a line is centred against the
// TALLEST item on it — and the pencil is `0.8em` against a chip's ~17px, so it
// sits three pixels lower than the chips beside it and reported an `offsetTop`
// of its own. One phantom row per measurement, always; the fitter read two real
// rows as three and shrank the cell to one row of tags and a `+N` until the
// count came back under the cap. Which is exactly what it did in the vault.
//
// Centres coincide under `align-items: center` however tall the items are, so
// the centre is the thing that actually identifies a line. Sub-pixel heights
// and the odd half-pixel baseline mean it has to be a proximity test rather
// than an equality one.
function tagRows(els: HTMLElement[]): number[] {
  const rows: number[] = [];
  for (const el of els) {
    const mid = el.offsetTop + el.offsetHeight / 2;
    if (!rows.some((r) => Math.abs(r - mid) <= TAG_ROW_SLOP)) rows.push(mid);
  }
  return rows;
}

// Show the chips that fit in the cell, count the ones that do not.
//
// EVERYTHING IS SHOWN FIRST, every time. The pass has to measure the unhidden
// arrangement or it measures its own previous answer — which on a cell that
// got wider would keep hiding chips that now fit.
//
// COUNTED, NOT COMPARED AGAINST A REMEMBERED OFFSET. The box centres its rows
// (`align-content: center`), so hiding a chip moves the rows that are left and
// an offset measured before the hide means nothing after it. Every decision
// below is "how many rows is this arrangement", asked of the arrangement it is
// about.
//
// THE `+N` AND THE PENCIL ARE MEASURED WITH THE CHIPS. Both are in flow and
// both sit at the end, so revealing the count can push it — or the pencil
// behind it — onto a third row, where `overflow: hidden` eats it. The loop
// gives back one chip at a time until the whole control lands, and stops at
// none rather than spinning on a cell too narrow for any of it. The pencil
// matters here in a way it did not under the old fixed cap of five: the rows
// are now filled to the edge, so it is the thing most likely to fall off, and
// it is the only hint that the readout is a button.
export function fitTagChips(
  chips: HTMLElement,
  chipEls: HTMLElement[],
  more: HTMLElement,
  pencil: HTMLElement
): void {
  if (!chips.isConnected) return;

  for (const c of chipEls) c.style.removeProperty("display");
  more.style.display = "none";
  if (tagRows([...chipEls, pencil]).length <= TAG_ROWS) return;

  // A starting count from the full arrangement rather than one hide per tag
  // from the end: the chips are the same width whether or not the ones after
  // them are drawn, so the number that reach the second row is already known.
  // What is not known is whether the `+N` fits beside them, and that is what
  // the loop settles.
  const rows = tagRows(chipEls);
  const floor = rows[TAG_ROWS - 1] + TAG_ROW_SLOP;
  let shown = Math.min(
    chipEls.length,
    rows.length <= TAG_ROWS
      ? chipEls.length
      : chipEls.filter((c) => c.offsetTop + c.offsetHeight / 2 <= floor).length
  );
  more.style.removeProperty("display");
  for (;;) {
    for (let i = 0; i < chipEls.length; i += 1) {
      chipEls[i].style.display = i < shown ? "" : "none";
    }
    more.setText(`+${chipEls.length - shown}`);
    if (shown === 0) return;
    if (tagRows([...chipEls.slice(0, shown), more, pencil]).length <= TAG_ROWS) {
      return;
    }
    shown -= 1;
  }
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
  const wrap = createDiv({ cls: "ca-journal-widget ca-journal-tags-field" });

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

  // The observer behind `fitTagChips`, held so a repaint disposes of the one
  // watching the chips it is about to destroy.
  let watch: ResizeObserver | null = null;
  ctx.addChild(new TagsFit(wrap, () => watch?.disconnect()));

  const paint = (): void => {
    wrap.empty();
    watch?.disconnect();
    watch = null;
    const tags = read();

    // EMPTY IS ONE CONTROL, NOT AN EMPTY STATE PLUS A CONTROL. The first cut
    // spent two of the cell's three lines on a phrase reporting the absence,
    // above a full-width block button — mostly chrome for the case with
    // nothing to show. A tracker cell with no reading draws its affordance and
    // nothing else; this one now does too.
    if (tags.length === 0) {
      const add = wrap.createEl("button", {
        cls: "ca-journal-tags-add",
        attr: { type: "button", "aria-label": `Add ${def.label.toLowerCase()}` },
      });
      setIcon(add.createSpan({ cls: "ca-journal-btn-icon" }), "plus");
      add.createSpan({ text: "Add tags" });
      add.addEventListener("click", () => openWindow(paint));
      return;
    }

    // The chips ARE the control: clicking any of them opens the window at the
    // list they belong to, so the reading and the way to change it are the
    // same target rather than a readout with a button beside it.
    const chips = wrap.createEl("button", {
      cls: "ca-journal-tags-chips",
      attr: {
        type: "button",
        "aria-label": `Manage ${def.label.toLowerCase()} (${tags.length})`,
      },
    });
    // EVERY TAG IS DRAWN, AND THE FIT DECIDES WHAT SHOWS (1.0.46).
    //
    // `const maxVisibleTags = 5` STOOD HERE, with `tags.slice(0, 4)` behind it.
    // A count is the one thing the answer does not depend on: the cell holds two
    // rows of chips (`max-height: 40px` on `.ca-journal-tags-chips`), a chip is
    // as wide as its tag, and the cell is as wide as the tracker grid makes it.
    // Six short tags went four on the first row and `+2` alone on the second
    // with room for both beside it — reported from a daily entry, and the same
    // arithmetic hides three of eight on a phone.
    //
    // So the chips all go in and `fitTagChips` hides the ones that did not
    // land, which is a question only layout can answer.
    const chipEls = tags.map((tag) =>
      chips.createSpan({ cls: "ca-journal-tags-chip", text: `#${tag}` })
    );
    const more = chips.createSpan({
      cls: "ca-journal-tags-chip ca-journal-tags-overflow",
    });
    const pencil = chips.createSpan({
      cls: "ca-journal-btn-icon ca-journal-tags-pencil",
    });
    setIcon(pencil, "pencil");
    chips.addEventListener("click", () => openWindow(paint));

    // ON A RESIZE, NOT ON A FRAME (1.0.46). A `requestAnimationFrame` is a
    // duration standing in for an event, which is the shape `headerbar.ts`
    // argued its way out of in 3.13 — and it would answer once, for the width
    // the cell happened to have when the note opened. A `ResizeObserver` fires
    // on the first layout AND on every later one, so *Wide page*, a split pane
    // and a rotated phone each re-ask the question instead of keeping an answer
    // from a width that is gone.
    //
    // HIDING A CHIP DOES NOT RESIZE THE BOX — it is `height: 100%` inside a
    // fixed cell — so there is no feedback loop to guard against. The previous
    // observer went at the top of `paint`, with the chips it was watching.
    const fit = () => fitTagChips(chips, chipEls, more, pencil);
    if (typeof ResizeObserver === "undefined") fit();
    else {
      watch = new ResizeObserver(fit);
      watch.observe(chips);
    }
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
      cls: "ca-journal-widget-error",
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

// The unload hook behind the chips' `ResizeObserver`.
//
// A PLAIN OBJECT WOULD NOT DO: Obsidian unloads a block's children when the
// block is rebuilt or the note is closed, and an observer left watching a
// detached element is a reference the view cannot drop. `reveal.ts` gives the
// same reason for its two.
class TagsFit extends MarkdownRenderChild {
  constructor(el: HTMLElement, private readonly stop: () => void) {
    super(el);
  }
  onunload(): void {
    this.stop();
  }
}
