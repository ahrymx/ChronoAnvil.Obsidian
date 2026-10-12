// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// One number habit's reading, for one entry (1.0.61).
//
// ── WHY A WINDOW AND NOT A STEPPER ────────────────────────────────────────
//
// The reader's own words: *"The number should [trackers name] [number] [unit],
// and make unit clickable to bring up a dialogue to alter the count (this would
// save some horizontal space by leaving plus and minus buttons out)."* A
// stepper is three controls — minus, the reading, plus — in the narrowest
// column on a two-column card, and every one of them is a 30px Obsidian
// button. The row now spends that width on the habit's name and its week, and
// the reading itself is the door.
//
// IT IS ALSO THE ONLY WAY TO ENTER A NUMBER. `buildStepper` can reach 10 km
// from 0 in twenty presses and cannot reach 7.5 at all unless `step` says so;
// a field can.
//
// ── WHAT IT REFUSES, AND WHAT IT DOES NOT ─────────────────────────────────
//
// AN EMPTY FIELD CLEARS THE READING, and that is the one thing a stepper could
// never do: there is no path through plus and minus that takes a number back to
// nothing, which is why `drawNumRow`'s own comment used to say a stepped row is
// logged by definition. A habit the reader logged by mistake is now theirs to
// unlog.
//
// AND A NUMBER OUTSIDE THE HABIT'S RANGE IS REFUSED, NOT CLAMPED.
// `buildStepper` clamps, correctly: a `+` press past the ceiling has no other
// sensible answer, and the reader can see the number stop. A reader who TYPED
// `40` into a field bounded at 10 meant something, and silently writing 10
// while they watch is the window reporting a value it did not store. The bounds
// are named in the subtitle before they are typed into, and named again in the
// refusal.

import { App } from "obsidian";
import { EditorModal } from "./editor-modal";
import type ChronoAnvilPlugin from "../main";
import type { TrackerDef } from "../trackers/trackers";

// What the reading says on the row's own button, and in this window's heading.
//
// THE FIGURE AND THE UNIT TOGETHER, which is what makes the button a control at
// all: a habit that declares no unit would otherwise have nothing but a bare
// number to aim at, and most habits declare none.
//
// `—` FOR NOTHING RECORDED, which is `buildStepper`'s own empty reading — so a
// number habit reads the same before and after it left the stepper behind.
export function readingText(
  value: number | null,
  unit: string | undefined
): string {
  if (value == null) return "—";
  return unit ? `${value} ${unit}` : `${value}`;
}

// The habit's own range, said in words.
//
// THE SUBTITLE AND THE REFUSAL ARE ONE STRING, which is the point of the
// function: a window that offered "0–10 km" and then refused with a different
// sentence would be two claims about one rule.
export function boundsNote(def: TrackerDef): string {
  const said = def.unit ? ` ${def.unit}` : "";
  const { min, max } = def;
  if (min != null && max != null) return `Between ${min} and ${max}${said}`;
  if (min != null) return `${min}${said} or more`;
  if (max != null) return `${max}${said} or less`;
  // NOT "No limit". A habit with no declared range is the common case — see
  // `newHabitDef`'s own note on why blank is a real answer — and a window whose
  // subtitle announces the absence of a rule is louder about it than the rule
  // would have been.
  return def.unit ? `A number of ${def.unit}` : "A number";
}

export class HabitReadingWindow extends EditorModal {
  private draft: string;

  constructor(
    app: App,
    plugin: ChronoAnvilPlugin,
    private readonly def: TrackerDef,
    reading: number | null,
    private readonly onSave: (value: number | null) => Promise<void>
  ) {
    super(app, plugin, def.label || def.id, boundsNote(def), "Save");
    this.draft = reading == null ? "" : String(reading);
  }

  protected renderBody(): void {
    this.body.empty();
    this.body.addClass("ca-habit-reading-editor");
    const row = this.body.createDiv({ cls: "ca-habit-reading-row" });
    const box = row.createEl("input", {
      cls: "ca-tags-input ca-habit-reading-field",
      attr: {
        type: "number",
        // `step` OFF THE DEFINITION, so a habit counted in halves can be typed
        // in halves and the browser's own spinner agrees with the tracker.
        step: String(this.def.step ?? 1),
        inputmode: "decimal",
        "aria-label": `${this.def.label || this.def.id}, ${boundsNote(this.def)}`,
      },
    });
    box.value = this.draft;
    box.addEventListener("input", () => {
      this.draft = box.value;
      this.clearError();
    });
    // THE UNIT BESIDE THE FIELD AND NOT INSIDE IT. A placeholder would vanish
    // the moment the reader typed, which is exactly when they want to know what
    // the number is being counted in.
    if (this.def.unit) {
      row.createSpan({ cls: "ca-habit-reading-unit", text: this.def.unit });
    }
    // ENTER SAVES, AND IT COSTS NOTHING TO ARRANGE. A single-line field that
    // claims no keystroke of its own reaches the frame's own Enter listener,
    // which submits — see the 1.0.59 note on `contentEl`'s handler. So there is
    // deliberately no `keydown` here.
    window.setTimeout(() => {
      box.focus();
      box.select();
    }, 0);
  }

  // What the field says, as a number — or `null` for a reading to be cleared.
  //
  // A FUNCTION BECAUSE TWO CALLERS MUST AGREE. `validate` refuses on it and
  // `commit` writes it, and a window that validated one reading of the field
  // and stored another is the defect this shape makes unreachable.
  private parsed(): number | null {
    const raw = this.draft.trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
  }

  protected validate(): string | null {
    const value = this.parsed();
    // AN EMPTY FIELD IS A REAL ANSWER and means "clear this". It is the only
    // way back to nothing — see the head of this file.
    if (value == null) return null;
    if (Number.isNaN(value)) {
      return `That isn't a number. ${boundsNote(this.def)}.`;
    }
    if (this.def.min != null && value < this.def.min) {
      return `${boundsNote(this.def)}.`;
    }
    if (this.def.max != null && value > this.def.max) {
      return `${boundsNote(this.def)}.`;
    }
    return null;
  }

  protected async commit(): Promise<void> {
    const value = this.parsed();
    await this.onSave(Number.isNaN(value) ? null : value);
  }
}
