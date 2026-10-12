// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Habits window: this entry's habits, and the ones the folder around it
// logs.
//
// THE SAME WINDOW AS TAGS', DELIBERATELY, down to the three sections and the
// order they come in — a list of what this note carries, a field that adds one,
// and a cloud of what the folder uses. Two cells in the same tracker grid hold
// a LIST rather than a value, and `tags-editor.ts`' whole argument for a
// dialogue is about lists rather than about tags: "adding, renaming and
// removing are three different edits and at least one of them needs typing".
// A reader who has met one of these windows has met both.
//
// WHAT THIS WINDOW CAN DO THAT TAGS' CANNOT, and why it has to. A habit's row
// carries its READING — the three-state box the chip cycles — because of the
// overflow this round also adds: once a cell with nine habits shows two rows
// and a `+7` card, the window is the only way to reach the seven. A membership
// editor would have made the collapse a loss of function.
//
// TWO TYPES SINCE 1.0.56, AND THE ROW IS WHERE THEY DIFFER. A habit is a
// boolean or a number now (see `HABIT_TYPES`), so a row carries either the
// three-state box or a stepper, and the add field below asks which before it
// defines one. Everything around the control — the name, the pencil, the ×, the
// folder cloud, the draft, Cancel — is type-blind, which is the point of
// `HabitRow.reading` being one field: this window grew a second control, not a
// second model.
//
// AND THE × IS NOW LOAD-BEARING FOR THE OTHER TYPE. A number tracker's remove
// control was the × on its own grid cell (`attachTrackerRemove`); a Habits
// section takes that cell off the grid, so the per-row × here is the only place
// left to take a number habit off an entry. 1.0.49 made the same argument for
// the boolean when the chip's × was retired — *"removal belongs where it can be
// read before it is taken"* — and the number arrives at the same window for the
// same reason.
//
// NOTHING HERE WRITES UNTIL SAVE, and for a habit that promise is worth more
// than it is for a tag: the draft holds note membership, per-note readings,
// registry renames and registry rows yet to exist, and `habitWrites` works out
// the difference at the end. So Cancel is free even after creating a habit and
// renaming two others, and the vault is touched once (see
// `EntryTrackers.applyHabitDraft`).

import { App, setIcon } from "obsidian";
import { EditorModal } from "./editor-modal";
import type ChronoAnvilPlugin from "../main";
import type { TrackerDef, TrackerSurface } from "../trackers/trackers";
import { TRACKER_TYPE_LABELS } from "../trackers/trackers";
import {
  HABIT_TYPES,
  addHabitRow,
  describeHabitState,
  habitRowFor,
  habitRowState,
  habitsInFolder,
  hasHabit,
  newHabitDef,
  nextHabitState,
  normaliseHabitLabel,
  removeHabitRow,
  setHabitReading,
  type HabitDraft,
  type HabitRow,
  type HabitShape,
  type HabitType,
  type HabitUse,
} from "../trackers/habits";
import { trackerDirective } from "../trackers/entry-trackers";

export class HabitsEditor extends EditorModal {
  private rows: HabitRow[];
  private renamed: Record<string, string> = {};
  private created: TrackerDef[] = [];
  private readonly used: HabitUse[];
  private pending = "";
  // What the add field is about to define. HELD ACROSS A REPAINT, like
  // `pending` beside it and for the same reason: picking "Number" repaints to
  // reveal the three shape fields, and a reader who had already typed a name
  // must not lose it to the control that asks about it.
  //
  // THE TYPE SURVIVES A SUCCESSFUL ADD AND THE SHAPE DOES NOT. Somebody
  // defining their kilometres habit is likely defining their pages habit next;
  // nobody wants the previous habit's bounds applied to it.
  private pendingType: HabitType = "boolean";
  private pendingMin = "";
  private pendingMax = "";
  private pendingUnit = "";
  // Whether the next repaint should put the cursor back in the add field.
  //
  // SET ONLY BY AN ADD, and it matters now in a way it did not before 1.0.59:
  // until then Enter in the add box added the habit and then saved and closed
  // the window, so there was no "next" to put a cursor in. With the window
  // staying open, a reader naming three habits in a row would otherwise have
  // to reach for the mouse between each one — `renderBody` empties the body,
  // and the element that had focus goes with it.
  private focusAdd = false;
  // Which habit is open for renaming, or null. One at a time, for the reason
  // the tags window gives: two open editors over one list is a merge conflict
  // a reader cannot see.
  private editing: string | null = null;
  // Whether this window is still on screen. The rename field commits on blur
  // and closing the window blurs it, so Escape would otherwise repaint a body
  // that is no longer in the document — `tags-editor.ts` carries the full note.
  private open_ = true;

  constructor(
    app: App,
    plugin: ChronoAnvilPlugin,
    private readonly folder: string,
    private readonly surface: TrackerSurface | null,
    // Every habit this note's surface admits, registry order. The cloud is
    // drawn from this; passing it in rather than reading the registry here
    // keeps the one "what is a habit" test (`habitsForSurface`) in the model.
    private readonly habits: readonly TrackerDef[],
    rows: readonly HabitRow[],
    private readonly onSave: (draft: HabitDraft) => Promise<void>
  ) {
    super(
      app,
      plugin,
      "Habits",
      // Names the folder, because the cloud below is scoped to it and a list of
      // habits with no stated scope is a list a reader has to guess the
      // boundaries of.
      folder ? `On this entry, and what ${folder} already logs` : "On this entry",
      "Save"
    );
    this.rows = rows.map((r) => ({ ...r }));
    this.used = habitsInFolder(app, habits, folder);
  }

  protected renderBody(): void {
    this.body.empty();
    this.body.addClass("ca-tags-editor");
    this.body.addClass("ca-habits-editor");
    this.renderCurrent();
    this.renderAdd();
    this.renderUsed();
  }

  // The label to show for a habit: the rename in the draft if there is one,
  // otherwise the registry's. NOT the chip's effective name — a note carrying
  // a `tracker:<id>|Label` override shows that override on its chip, and a
  // window that displayed it would be offering to rename one thing while
  // renaming another.
  private nameOf(row: HabitRow): string {
    return this.renamed[row.id] ?? row.label;
  }

  private labelOf(use: HabitUse): string {
    return this.renamed[use.id] ?? use.label;
  }

  // The registry row behind a draft row, for the step, the bounds and the unit.
  //
  // `created` FIRST, BECAUSE A HABIT DEFINED IN THIS SITTING IS NOT IN THE
  // REGISTRY YET. A reader who adds a 0–10 km habit and then steps its reading
  // would otherwise step an unbounded, unitless number and see their own
  // answer ignored until after Save.
  private defOf(id: string): TrackerDef | undefined {
    return (
      this.created.find((d) => d.id === id) ??
      this.habits.find((h) => h.id === id)
    );
  }

  // ── this entry's habits ─────────────────────────────────────────────────

  private renderCurrent(): void {
    const wrap = this.body.createDiv({ cls: "ca-tags-section" });
    wrap.createDiv({ cls: "ca-tags-heading", text: "On this entry" });

    if (this.rows.length === 0) {
      wrap.createDiv({
        cls: "ca-tags-empty",
        text: "No habits on this entry yet — add one below, or pick from what this folder logs.",
      });
      return;
    }

    const list = wrap.createDiv({ cls: "ca-tags-list" });
    for (const row of this.rows) {
      if (this.editing === row.id) {
        this.renderRename(list, row);
        continue;
      }
      const el = list.createDiv({ cls: "ca-tags-row" });
      el.toggleClass("ca-habits-row-number", row.type === "number");

      // ONE CHILD, TWO CONTROLS, AND THE ROW DOES NOT CARE WHICH (1.0.56). The
      // reading sits in the same slot at the same width whichever type answers
      // it, so the names below it still line up down the list — which is the
      // whole reason the branch is here and not around the row.
      if (row.type === "number") this.renderStep(el, row);
      else this.renderBox(el, row);

      el.createSpan({ cls: "ca-tags-name", text: this.nameOf(row) });

      const edit = el.createEl("button", {
        cls: "ca-journal-btn-ghost",
        attr: { type: "button", "aria-label": `Rename ${this.nameOf(row)}` },
      });
      setIcon(edit.createSpan({ cls: "ca-journal-btn-icon" }), "pencil");
      edit.addEventListener("click", () => {
        this.editing = row.id;
        this.renderBody();
      });

      const drop = el.createEl("button", {
        cls: "ca-journal-btn-ghost ca-tags-remove",
        attr: {
          type: "button",
          "aria-label": `Remove ${this.nameOf(row)} from this entry`,
        },
      });
      setIcon(drop.createSpan({ cls: "ca-journal-btn-icon" }), "x");
      drop.addEventListener("click", () => {
        // FROM THE ENTRY, NOT FROM THE VAULT. One verb, one meaning (1.0.43):
        // the habit stays defined in Settings and keeps every reading it has
        // on every other entry — this takes its widget off this note, exactly
        // as the × on its chip does.
        this.rows = removeHabitRow(this.rows, row.id);
        this.renderBody();
      });
    }
  }

  // THE READING, AS THE CHIP DRAWS IT — same glyphs, same cycle, same classes,
  // so the box in the window and the box on the entry are visibly one control
  // in two places rather than two controls that agree.
  private renderBox(el: HTMLElement, row: HabitRow): void {
    const state = habitRowState(row);
    const box = el.createEl("button", {
      cls: "ca-journal-habit-box ca-habits-box",
      attr: { type: "button" },
    });
    box.toggleClass("is-done", state === 1);
    box.toggleClass("is-not-done", state === 0);
    box.setText(state === 1 ? "✓" : state === 0 ? "✗" : "");
    const said = describeHabitState(state);
    box.setAttr("aria-label", `${this.nameOf(row)}: ${said}`);
    box.setAttr("title", `${this.nameOf(row)}: ${said}`);
    box.addEventListener("click", () => {
      // Through the model's cycle and back into the draft, rather than
      // toggling the element: the draft is what Save reads, and a box that
      // painted itself without recording the answer is the oldest bug in
      // this shape.
      this.rows = setHabitReading(this.rows, row.id, nextHabitState(state));
      this.renderBody();
    });
  }

  // A NUMBER HABIT'S READING (1.0.56), wearing `buildStepper`'s own classes for
  // the same reason the box wears the chip's: one control, two places.
  //
  // NOT `buildStepper` ITSELF, and the reason is the sink rather than the look.
  // That function takes a `WidgetHost` and a `MarkdownPostProcessorContext` and
  // writes through `host.write` — straight into the note's frontmatter, on
  // every click. This window's entire promise is that nothing is written until
  // Save, so the control here has to put its answer in the draft. The
  // arithmetic is copied deliberately and in full (the step, the clamp, the
  // 1e6 float round, stepping from `min ?? 0` when there is no reading yet),
  // because a stepper in the window that rounded differently from the stepper
  // on the entry would be two controls disagreeing about one property.
  //
  // THE VALUE IS AN INPUT AND THE BOX IS NOT, which is the one visible
  // difference. A boolean has three states and a button cycles them; a number
  // has a range, and a reader whose habit reads 4.2 wants to type 7 rather than
  // press `+` fourteen times. An emptied field is `null` — the only way a
  // number habit can be returned to unanswered, which the box gets from its
  // third state.
  //
  // NO REPAINT ON A STEP, unlike the box. The box repaints because its row's
  // classes change with its state; a stepper changes one number, and
  // `renderBody` would take the focus out of a field the reader is typing in.
  // `known` tracks the value locally, exactly as `buildStepper`'s does, because
  // `setHabitReading` returns a new array and the closure's `row` goes stale.
  private renderStep(el: HTMLElement, row: HabitRow): void {
    const def = this.defOf(row.id);
    const step = def?.step ?? 1;
    const wrap = el.createDiv({ cls: "ca-journal-stepper ca-habits-step" });

    const minus = wrap.createEl("button", {
      text: "−",
      cls: "ca-journal-step-btn",
      attr: { type: "button", "aria-label": `Less ${this.nameOf(row)}` },
    });
    const input = wrap.createEl("input", {
      cls: "ca-journal-step-value ca-habits-step-value",
      attr: {
        type: "number",
        inputmode: "decimal",
        step: String(step),
        "aria-label": `${this.nameOf(row)} — leave empty for unanswered`,
        title: `${this.nameOf(row)} — leave empty for unanswered`,
      },
    });
    const plus = wrap.createEl("button", {
      text: "+",
      cls: "ca-journal-step-btn",
      attr: { type: "button", "aria-label": `More ${this.nameOf(row)}` },
    });
    // THE UNIT SITS OUTSIDE THE VALUE, which is where this parts company with
    // `buildStepper`: that control draws `4.2 km` as the text of a span, and a
    // span is not something a reader can type into.
    if (def?.unit) wrap.createSpan({ cls: "ca-habits-step-unit", text: def.unit });

    let known = row.reading;
    const show = (): void => {
      input.value = known == null ? "" : String(known);
    };
    const commit = (next: number | null): void => {
      let v = next;
      if (v != null) {
        if (def?.min != null) v = Math.max(def.min, v);
        if (def?.max != null) v = Math.min(def.max, v);
        v = Math.round(v * 1e6) / 1e6; // avoid float drift
      }
      known = v;
      show();
      this.rows = setHabitReading(this.rows, row.id, v);
      this.clearError();
    };
    show();

    minus.addEventListener("click", () => commit((known ?? def?.min ?? 0) - step));
    plus.addEventListener("click", () => commit((known ?? def?.min ?? 0) + step));
    // ON `change`, NOT `input`. Committing per keystroke would clamp "1" into
    // the minimum before the reader finished typing "12".
    input.addEventListener("change", () => {
      const raw = input.value.trim();
      if (!raw) return commit(null);
      const n = Number(raw);
      commit(Number.isFinite(n) ? n : null);
    });
  }

  // Renaming reaches the REGISTRY, which is the one edit in this window that
  // leaves the note. The subtitle of the field says so rather than leaving a
  // reader to find out from the Diary.base column header.
  private renderRename(list: HTMLElement, row: HabitRow): void {
    const el = list.createDiv({ cls: "ca-tags-row is-editing" });
    const input = el.createEl("input", {
      cls: "ca-tags-input",
      attr: {
        type: "text",
        value: this.nameOf(row),
        "aria-label": `Rename ${this.nameOf(row)} everywhere`,
        title: "Renames this habit in Settings, on every entry and in Diary.base",
      },
    });
    const finish = (): void => {
      if (!this.open_) return;
      const next = normaliseHabitLabel(input.value);
      // A rename to something unusable keeps the old name rather than dropping
      // it — the tags window's rule, and the same reasoning: the reader can see
      // what they typed, and silently losing a habit they meant to keep is the
      // failure worth avoiding.
      if (next != null && next !== row.label) this.renamed[row.id] = next;
      else if (next != null) delete this.renamed[row.id];
      this.editing = null;
      this.renderBody();
    };
    input.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter") {
        evt.preventDefault();
        finish();
      }
      if (evt.key === "Escape") {
        // Escape cancels the RENAME, not the window — a reader half way
        // through fixing a name does not mean "discard everything".
        evt.preventDefault();
        evt.stopPropagation();
        this.editing = null;
        this.renderBody();
      }
    });
    input.addEventListener("blur", finish);
    window.setTimeout(() => {
      input.focus();
      input.select();
    }, 0);
  }

  // ── adding ──────────────────────────────────────────────────────────────

  // Take whatever is in the add row and put it on the entry: join a habit the
  // registry already has, or define a new one. Returns the refusal to show, or
  // null — including when there is nothing there to add.
  //
  // A METHOD RATHER THAN A CLOSURE IN `renderAdd`, AND THAT IS THE FIX FOR THE
  // THING READERS KEPT HITTING (1.0.60). A reader who has typed "Running",
  // picked Number and filled in 0 / 50 / km has SAID WHAT THEY WANT. Pressing
  // Save there is not "discard that"; it is the most natural way in the world
  // to finish. The window used to throw the whole row away and report "Nothing
  // to change — this entry's habits are as they were", which reads as a
  // failure to create the habit, because that is exactly what it was.
  //
  // So `validate()` runs this first, and Save means "add it, then save". It
  // reads `this.pending` rather than an element because it has to work from
  // the footer, where there is no add row in scope — and the field has kept
  // `pending` in step on every keystroke since this window was written.
  private addPending(): string | null {
    if (!this.pending.trim()) return null;
    const name = normaliseHabitLabel(this.pending);
    if (name == null) {
      return "That isn't a usable habit name — it needs a letter or a digit in it.";
    }
    // AN EXISTING HABIT IS JOINED, NOT DUPLICATED. A reader who types
    // "Exercise" into a vault that already has an Exercise habit means that
    // one; defining a second `Exercise2` property beside it would split a
    // year of readings in two and is the kind of thing nobody notices until
    // a chart is wrong.
    const known = this.habits.find(
      (h) => (h.label || h.id).toLowerCase() === name.toLowerCase()
    );
    if (known) {
      if (hasHabit(this.rows, known.id)) {
        return "This entry already has that habit.";
      }
      // THE REGISTRY'S TYPE WINS OVER THE PICKER, and that is the right way
      // round. The picker describes a habit about to be DEFINED; a name that
      // already names one is a join, and joining Read with "Number" selected
      // adds the Read that exists rather than a second property shadowing it.
      // `habitRowFor` reads the type off the definition, so the branch is
      // not even written here.
      this.rows = addHabitRow(
        this.rows,
        habitRowFor(known, trackerDirective(known.id))
      );
      this.pending = "";
      return null;
    }

    // A NEW ONE IS DEFINED, and `taken` carries the ids this sitting has
    // already claimed as well as the registry's, so two habits typed one
    // after the other cannot be handed the same property name.
    const shape = this.pendingShape();
    if (!shape) {
      return "The smallest value has to be below the largest one.";
    }

    const def = newHabitDef(
      name,
      [
        ...this.plugin.settings.trackers.map((t) => t.id),
        ...this.created.map((t) => t.id),
      ],
      this.surface,
      shape
    );
    if (!def) {
      return "That isn't a usable habit name — it needs a letter or a digit in it.";
    }
    this.created.push(def);
    this.rows = addHabitRow(
      this.rows,
      habitRowFor(def, trackerDirective(def.id))
    );
    this.pending = "";
    // The shape described THAT habit and nothing after it — see
    // `pendingType`'s note on why the type itself stays picked.
    this.pendingMin = "";
    this.pendingMax = "";
    this.pendingUnit = "";
    return null;
  }

  // What the three range boxes add up to, or null if they contradict.
  private pendingShape(): HabitShape | null {
    if (this.pendingType !== "number") return { type: "boolean" };
    const num = (raw: string): number | null => {
      const t = raw.trim();
      if (!t) return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    };
    const min = num(this.pendingMin);
    const max = num(this.pendingMax);
    // THE ONE REFUSAL THE SHAPE EARNS. An inverted range is not a taste
    // question: `buildStepper` clamps with `max(min, …)` and then
    // `min(max, …)`, so a 10–0 habit pins every reading to 0 and the
    // stepper's `+` does nothing at all — a control that is visibly broken
    // and gives no reason. Caught here, where the reader can still see what
    // they typed.
    if (min != null && max != null && min > max) return null;
    return {
      type: "number",
      min,
      max,
      unit: this.pendingUnit.trim() || null,
    };
  }

  private renderAdd(): void {
    const wrap = this.body.createDiv({ cls: "ca-tags-section" });
    const row = wrap.createDiv({ cls: "ca-tags-add" });
    const input = row.createEl("input", {
      cls: "ca-tags-input",
      attr: {
        type: "text",
        placeholder: "New habit…",
        "aria-label": "New habit",
        list: "ca-habits-suggest",
      },
    });
    // A native `<datalist>` over what the folder logs, for the reasons the tags
    // window gives: it filters as you type, it is keyboard-navigable for free,
    // and it does not fight the modal for focus. Typing a name that is already
    // a habit therefore ADDS that habit rather than defining a second one with
    // the same label — see `commit` below.
    const suggest = row.createEl("datalist");
    suggest.id = "ca-habits-suggest";
    for (const use of this.used) {
      suggest.createEl("option", { value: this.labelOf(use) });
    }

    // WHICH KIND, ASKED BESIDE THE NAME (1.0.56). A select rather than two
    // buttons because `HABIT_TYPES` is iterated: a third habit type would be a
    // third option here and nothing else, which is why that list is an array.
    //
    // THE WORDS ARE THE SETTINGS TAB'S, through `TRACKER_TYPE_LABELS` — a
    // reader who defines a habit here and then opens Settings → Trackers must
    // find it filed under the same phrase they picked.
    // `dropdown` IS OBSIDIAN'S, AND IT WAS THE ONE SELECT IN THE PLUGIN
    // WITHOUT IT (1.0.57). Every other `<select>` here — the capture window's
    // destination, the diary link window's five, the settings tab's — carries
    // it, because that class is the whole of a select's theming: without it the
    // control falls back to the browser's native widget and renders as a pale
    // box in a dark modal, which is not what a reader is looking for when they
    // are looking for a control.
    const type = row.createEl("select", {
      cls: "dropdown ca-habits-type",
      attr: { "aria-label": "What kind of habit" },
    });
    for (const t of HABIT_TYPES) {
      type.createEl("option", { value: t, text: TRACKER_TYPE_LABELS[t] });
    }
    type.value = this.pendingType;
    type.addEventListener("change", () => {
      this.pendingType = type.value === "number" ? "number" : "boolean";
      this.clearError();
      this.renderBody();
    });

    // ── THE NUMBER'S SHAPE, REVEALED (1.0.56) ───────────────────────────
    //
    // THREE FIELDS, ALL OPTIONAL, AND REVEALED RATHER THAN DISABLED. A boolean
    // has no range to answer, so the row simply is not there for it — the
    // alternative is three greyed boxes that a reader has to work out do not
    // apply to what they just picked.
    //
    // BLANK IS A REAL ANSWER AND THE COMMON ONE. `buildStepper` steps from
    // `min ?? 0` with no bounds and shows a bare number, so a habit somebody
    // is counting — pages, glasses of water — wants nothing filled in here.
    // `newHabitDef` sets only the keys that were answered, for its own stated
    // reason about `min: null` being a bound of null.
    const shape = wrap.createDiv({ cls: "ca-habits-shape" });
    // Collected so Enter can be wired onto every one of them below, once
    // `commit` exists — see `enterAdds`.
    const boxes: HTMLInputElement[] = [];
    const field = (
      value: string,
      placeholder: string,
      aria: string,
      numeric: boolean,
      keep: (raw: string) => void
    ): void => {
      const box = shape.createEl("input", {
        cls: "ca-tags-input ca-habits-shape-field",
        attr: {
          type: numeric ? "number" : "text",
          placeholder,
          "aria-label": aria,
          ...(numeric ? { inputmode: "decimal" } : {}),
        },
      });
      box.value = value;
      box.addEventListener("input", () => {
        keep(box.value);
        this.clearError();
      });
      boxes.push(box);
    };
    if (this.pendingType === "number") {
      field(this.pendingMin, "Least", "Smallest value", true, (v) => {
        this.pendingMin = v;
      });
      field(this.pendingMax, "Most", "Largest value", true, (v) => {
        this.pendingMax = v;
      });
      field(this.pendingUnit, "Unit", "Unit, such as km", false, (v) => {
        this.pendingUnit = v;
      });
    }

    // The add row's action, and `addPending` is where it lives — see the
    // method. Here it is only "do it, and say so if it was refused".
    const commit = (): void => {
      const problem = this.addPending();
      if (problem) {
        this.showError(problem);
        return;
      }
      this.focusAdd = true;
      this.renderBody();
    };

    input.addEventListener("input", () => {
      this.pending = input.value;
      this.clearError();
    });

    // ── ENTER ADDS, FROM ANY BOX IN THIS ROW (1.0.57) ──────────────────
    //
    // THE ONE ASYMMETRY BETWEEN THE TWO TYPES' ADD PATHS, and it was reported
    // as *"number habits can't be created, but booleans are working as
    // intended"*. The name field has committed on Enter since this window
    // existed; the three shape fields arrived in 1.0.56 with an `input`
    // listener and nothing else. So the gesture that defines a habit — type
    // it, press Enter — worked for a Yes/No, where the name box is the only
    // box there is, and did nothing whatever once the reader had tabbed into
    // "Least" to say how far a number runs. Nothing was written, nothing was
    // refused, and the window sat there looking like it had not heard.
    //
    // A boolean could not reach the dead key and a number could barely avoid
    // it, which is why one type looked broken and the other looked fine.
    //
    // ONE HANDLER OVER THE WHOLE ROW, so a fourth field cannot be added
    // without it. The TYPE SELECT IS DELIBERATELY NOT IN IT: Enter on an open
    // native dropdown means "take this option", which fires `change` and
    // repaints — committing there as well would add a habit on the keystroke
    // that picked what kind it is.
    const enterAdds = (el: HTMLElement): void => {
      el.addEventListener("keydown", (evt) => {
        if (evt.key !== "Enter") return;
        evt.preventDefault();
        commit();
      });
    };
    enterAdds(input);
    for (const box of boxes) enterAdds(box);
    input.value = this.pending;

    const btn = row.createEl("button", {
      cls: "ca-journal-btn",
      text: "Add",
      attr: { type: "button" },
    });
    btn.addEventListener("click", commit);

    // WHAT PRESSING ADD IS ABOUT TO DO, said before it happens. A tag is a
    // string in this note; a habit typed here becomes a row in Settings →
    // Trackers that every entry of this kind can then log, and a reader is
    // owed that sentence at the moment they are deciding whether to type.
    wrap.createDiv({
      cls: "ca-habits-note",
      text: "A new habit is added to Settings → Trackers and put on this entry. Existing entries are untouched. A number habit's step, and anything else about it, is in Settings.",
    });

    // AFTER THE PAINT, not during it: this runs inside `renderBody`, and the
    // element is not in the document until the call that asked for the repaint
    // has returned. The rename field focuses itself the same way and for the
    // same reason.
    if (this.focusAdd) {
      this.focusAdd = false;
      window.setTimeout(() => input.focus(), 0);
    }
  }

  // ── what the folder logs ────────────────────────────────────────────────

  private renderUsed(): void {
    if (this.used.length === 0) return;
    const wrap = this.body.createDiv({ cls: "ca-tags-section" });
    wrap.createDiv({
      cls: "ca-tags-heading",
      text: `Logged in ${this.folder || "this vault"}`,
    });
    const cloud = wrap.createDiv({ cls: "ca-tags-used" });
    for (const use of this.used) {
      const has = hasHabit(this.rows, use.id);
      const pill = cloud.createEl("button", {
        cls: has ? "ca-tags-pill is-on" : "ca-tags-pill",
        attr: { type: "button" },
      });
      pill.createSpan({ text: this.labelOf(use) });
      // The count is how many entries beneath the folder logged it DONE, so a
      // habit nobody has kept reads 0 rather than reading like a new one.
      pill.createSpan({ cls: "ca-tags-count", text: String(use.count) });
      // A pill TOGGLES, so the same control adds and removes and the cloud
      // doubles as a picture of what this entry carries.
      pill.addEventListener("click", () => {
        this.rows = has
          ? removeHabitRow(this.rows, use.id)
          : addHabitRow(this.rows, {
              id: use.id,
              directive: trackerDirective(use.id),
              label: use.label,
              // `HabitUse` CARRIES THE TYPE for exactly this line. The cloud is
              // the one place a row is built from a survey rather than from a
              // `TrackerDef`, and a pill that added a number habit as a boolean
              // would hand it the box and write `1` into a kilometre count.
              type: use.type,
              reading: null,
            });
        this.renderBody();
      });
    }
  }

  protected validate(): string | null {
    // A FILLED-IN ADD ROW IS AN INTENTION, NOT NOISE (1.0.60). Save flushes it
    // onto the entry before the draft leaves, so "type a name, press Save"
    // does what it plainly looks like it does. An empty row adds nothing and
    // refuses nothing; a bad one refuses HERE, with the window still open and
    // what the reader typed still on screen.
    //
    // There is nothing else to reject: every other edit above went through
    // `normaliseHabitLabel` at the moment it was made, and a pill can only
    // name a habit the registry already holds.
    return this.addPending();
  }

  onClose(): void {
    this.open_ = false;
    super.onClose();
  }

  protected async commit(): Promise<void> {
    await this.onSave({
      rows: this.rows.map((r) => ({
        ...r,
        label: this.renamed[r.id] ?? r.label,
      })),
      renamed: { ...this.renamed },
      created: this.created.map((d) => ({ ...d })),
    });
  }
}
