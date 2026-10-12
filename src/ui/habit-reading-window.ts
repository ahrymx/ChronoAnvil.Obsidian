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

// One press of − or +, as a number.
//
// THE SAME ARITHMETIC `buildStepper` DOES, and deliberately not a second
// opinion about it: step off the definition, the base when there is no reading
// yet is `min ?? 0`, the result is clamped to the declared range, and it is
// rounded at the sixth decimal because `0.1 + 0.2` is not `0.3` and a habit
// counted in tenths would otherwise collect a tail of noughts in the reader's
// frontmatter. A HABIT STEPPED HERE AND STEPPED IN THE 66px GRID MUST LAND ON
// THE SAME NUMBER; that is the only reason this is a function rather than four
// lines in the handler.
//
// AND A PRESS CLAMPS WHERE A TYPED NUMBER IS REFUSED. That is not an
// inconsistency, it is the rule at the head of this file applied to a second
// gesture: a `+` past the ceiling has no other sensible answer and the reader
// watches the number stop, while a reader who TYPED `40` into a field bounded
// at 10 meant something that silently becoming 10 would misreport.
//
// A GARBLED FIELD STEPS FROM THE BASE. `parsed()` answers `NaN` for text that
// is not a number, and `NaN + 1` is `NaN` — which would write a reading no
// validator downstream could make sense of.
export function stepReading(
  value: number | null,
  dir: 1 | -1,
  def: TrackerDef
): number {
  const from = value == null || Number.isNaN(value) ? (def.min ?? 0) : value;
  let next = from + dir * (def.step ?? 1);
  if (def.min != null) next = Math.max(def.min, next);
  if (def.max != null) next = Math.min(def.max, next);
  return Math.round(next * 1e6) / 1e6;
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
    // ── THE STEPS COME BACK, HERE (1.0.62) ──────────────────────────────
    //
    // *"Number edit window should have the plus/minus buttons which increment
    // in the step."* They left the ROW in 1.0.61 and that is unchanged: the
    // reader's *"leaving plus and minus buttons out"* was about the width of a
    // half-card column, not about the gesture. A window has room for both, and
    // the two kinds of reading they are for are different — `7.5` is typed, and
    // one more page is pressed.
    const down = this.stepButton(row, -1);
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
    // THE PAIR BRACKETS THE READING, unit and all, which is `buildStepper`'s
    // own order — there the unit is inside the value between the two buttons.
    const up = this.stepButton(row, 1);
    // ONE PRESS, FOUR THINGS: the draft (what `validate` and `commit` read),
    // the field (what the reader reads), any refusal still on screen from a
    // number they have now stepped away from, and THE FOCUS.
    //
    // THE FOCUS IS NOT A FLOURISH. A press leaves focus on the button, and the
    // frame submits on Enter from a single-line field — so a reader who pressed
    // `+` and then Enter would press `+` again instead of saving, which is the
    // one gesture this window promises. Putting it back on the field is what
    // keeps that promise after a press.
    for (const [btn, dir] of [[down, -1], [up, 1]] as const) {
      btn.addEventListener("click", () => {
        this.draft = String(stepReading(this.parsed(), dir, this.def));
        box.value = this.draft;
        this.clearError();
        box.focus();
      });
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

  // One of the two step buttons. `type="button"` and the height reset, which is
  // `obsidian-button-height`: a chip-shaped `<button>` is 30px until it is told
  // otherwise, and a 30px control beside a field is the shape that looks right
  // in a mockup and wrong in the vault.
  private stepButton(row: HTMLElement, dir: 1 | -1): HTMLButtonElement {
    const said = `${dir < 0 ? "Less" : "More"} by ${this.def.step ?? 1}${
      this.def.unit ? ` ${this.def.unit}` : ""
    }`;
    return row.createEl("button", {
      cls: "ca-habit-reading-step",
      text: dir < 0 ? "−" : "+",
      attr: { type: "button", "aria-label": said, title: said },
    });
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
