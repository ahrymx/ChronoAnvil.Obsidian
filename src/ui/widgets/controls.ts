// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The plain form controls, lifted out of the Widgets class.
//
// WHY THESE FOUR FIRST
//
// Widgets was a single 4,850-line class with two exports and a forty-six case
// switch inside it. Everything a note can draw lived there, from a spacer with
// no behaviour at all to the chart stack and the attachment tiles. Splitting it
// in one move would have meant reasoning about all of it at once, so the first
// slice is the corner that depends on least: a spacer, a slider, a select and a
// stepper. Between them they touch exactly two things the class owns — reading
// the current frontmatter value, and writing a new one.
//
// That is what WidgetHost names. These builders do not need the plugin, the
// app, the settings, or the twenty other collaborators the class holds; they
// need somewhere to read a value from and somewhere to put one back. Stating
// that in an interface rather than passing `this` keeps the next extraction
// honest — a builder that suddenly wants the whole class shows up as a change
// to this contract instead of disappearing into a method body.
//
// The builders stay `build*`-named and keep their argument order so that the
// call sites in the dispatch switch read exactly as they did before. This is a
// move, not a redesign; the behaviour is intended to be identical, and the
// suite is the check on that.

import { MarkdownPostProcessorContext } from "obsidian";
import type { TFile } from "obsidian";
import type AlmanacPlugin from "../../main";
import { TrackerDef } from "../../trackers/trackers";

/**
 * What a plain control needs from the widget layer.
 *
 * Deliberately two methods. Every addition here is a claim that some control
 * needs more of the class than reading and writing a value, and that claim
 * should be visible in a diff.
 */
export interface WidgetHost {
  currentValue(ctx: MarkdownPostProcessorContext, prop: string): unknown;
  write(
    ctx: MarkdownPostProcessorContext,
    prop: string,
    value: string | number | null
  ): Promise<void>;
}

/**
 * What a control bound to a specific entry needs.
 *
 * WidgetHost covers reading and writing a frontmatter value, which is all a
 * slider or a select ever wants. A tracker cell or an action button wants two
 * more things: the plugin, to resolve a definition or an action out of
 * settings, and the entry's own file, because what the control does depends on
 * which note it was rendered into.
 *
 * There is deliberately no `app` here. AlmanacPlugin extends Obsidian's Plugin,
 * so `plugin.app` is already reachable, and a separate member would be a second
 * way to say the same thing that could drift from the first.
 */
export interface EntryControlHost extends WidgetHost {
  readonly plugin: AlmanacPlugin;
  fileOf(ctx: MarkdownPostProcessorContext): TFile | null;
}

/**
 * A deliberately inert top-of-note element.
 *
 * Carries no behaviour and no host dependency — see the dispatch comment in
 * index.ts for why a note wants one at line 0.
 */
// `quiet` DROPS THE MARK AND KEEPS THE ELEMENT (4.51.1). The wordmark on a
// hairline is a top boundary for the note, and the vault banner is a louder one
// six pixels above it — two rules stacked, which is what the first vault render
// of that bar showed. The element itself stays either way: its primary job is
// being where the cursor lands on open, and nothing about that changes.
export function buildSpacer(quiet = false): HTMLElement {
  const wrap = createDiv({ cls: "journal-spacer" + (quiet ? " is-quiet" : "") });
  if (!quiet) wrap.createSpan({ cls: "journal-spacer-mark", text: "Almanac" });
  return wrap;
}

export function buildSlider(
  host: WidgetHost,
  rest: string,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const [prop, minS, maxS, stepS] = rest.split(":");
  const min = Number(minS ?? 1) || 1;
  const max = Number(maxS ?? 5) || 5;
  const step = Number(stepS ?? 1) || 1;

  const wrap = createSpan({ cls: "journal-widget journal-slider" });
  const input = wrap.createEl("input", { type: "range" });
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  const current = host.currentValue(ctx, prop);
  const currentNum = current == null || current === "" ? NaN : Number(current);
  const value = Number.isFinite(currentNum) ? currentNum : "";
  if (value !== "") input.value = String(value);
  else input.value = String(min);

  const label = wrap.createSpan({ cls: "journal-slider-value" });
  label.setText(value === "" ? "—" : `${value}`);

  input.addEventListener("input", () => {
    label.setText(input.value);
  });
  input.addEventListener("change", () => {
    void host.write(ctx, prop, Number(input.value));
  });
  return wrap;
}

export function buildSelect(
  host: WidgetHost,
  rest: string,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const firstColon = rest.indexOf(":");
  const prop = firstColon === -1 ? rest : rest.slice(0, firstColon);
  const optionsRaw = firstColon === -1 ? "" : rest.slice(firstColon + 1);

  const wrap = createSpan({ cls: "journal-widget journal-select" });
  const select = wrap.createEl("select");
  const options = optionsRaw
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const eq = pair.indexOf("=");
      return eq === -1
        ? { value: pair, label: pair }
        : { value: pair.slice(0, eq).trim(), label: pair.slice(eq + 1).trim() };
    });

  const current = host.currentValue(ctx, prop);
  for (const opt of options) {
    const optEl = select.createEl("option", {
      text: opt.label,
      value: opt.value,
    });
    if (current != null && String(current) === opt.value) optEl.selected = true;
  }
  select.addEventListener("change", () => {
    void host.write(ctx, prop, select.value);
  });
  return wrap;
}

export function buildStepper(
  host: WidgetHost,
  def: TrackerDef,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const step = def.step ?? 1;
  const wrap = createSpan({ cls: "journal-widget journal-stepper" });

  const minus = wrap.createEl("button", { text: "−", cls: "journal-step-btn" });
  const valueEl = wrap.createSpan({ cls: "journal-step-value" });
  const plus = wrap.createEl("button", { text: "+", cls: "journal-step-btn" });

  const initial = host.currentValue(ctx, def.id);
  // A non-numeric or empty stored value shows as "—" and starts stepping
  // from def.min/0 — coerce a NaN to null so it doesn't display "NaN" or
  // propagate through the +/- math.
  const initialNum = initial == null || initial === "" ? NaN : Number(initial);
  let known: number | null = Number.isFinite(initialNum) ? initialNum : null;

  const render = (): void => {
    const shown = known == null ? "—" : `${known}`;
    valueEl.setText(def.unit ? `${shown} ${def.unit}` : shown);
  };

  const commit = (next: number): void => {
    let clamped = next;
    if (def.min != null) clamped = Math.max(def.min, clamped);
    if (def.max != null) clamped = Math.min(def.max, clamped);
    clamped = Math.round(clamped * 1e6) / 1e6; // avoid float drift
    known = clamped;
    render(); // update immediately — don't wait on the write below
    void host.write(ctx, def.id, clamped);
  };

  minus.addEventListener("click", () => commit((known ?? def.min ?? 0) - step));
  plus.addEventListener("click", () => commit((known ?? def.min ?? 0) + step));

  render();
  return wrap;
}

/**
 * A time or date input bound to a frontmatter property.
 *
 * The date branch slices to ten characters because a stored value may carry a
 * time component that `<input type="date">` refuses to display — it wants
 * exactly YYYY-MM-DD and silently shows nothing for anything longer.
 */
export function buildTimeOrDate(
  host: WidgetHost,
  rest: string,
  ctx: MarkdownPostProcessorContext,
  type: "time" | "date"
): HTMLElement {
  const prop = rest.split(":")[0];
  const wrap = createSpan({ cls: `journal-widget journal-${type}` });
  const input = wrap.createEl("input", { type });
  const current = host.currentValue(ctx, prop);
  if (current != null && current !== "") {
    input.value =
      type === "date" ? String(current).slice(0, 10) : String(current);
  }
  input.addEventListener("change", () => {
    void host.write(ctx, prop, input.value || null);
  });
  return wrap;
}

/**
 * A read-only chip for a tracker whose value is computed rather than entered.
 *
 * Reads but never writes — the value comes from whatever recomputes it, so
 * there is no control here to change it with, only a title saying so.
 */
export function buildDerivedChip(
  host: WidgetHost,
  def: TrackerDef,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const wrap = createSpan({ cls: "journal-widget journal-derived-chip" });
  const val = host.currentValue(ctx, def.id);
  const num = val == null || val === "" ? NaN : Number(val);
  const shown = Number.isFinite(num) ? `${num}` : "—";
  wrap.setText(def.unit ? `${shown} ${def.unit}` : shown);
  wrap.setAttr("title", `${def.label} (computed)`);
  return wrap;
}
