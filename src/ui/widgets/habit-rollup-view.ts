// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Habits rollup, drawn (1.0.55).
//
// `-view`, FOR `time-grid-view.ts`'S REASON: the arithmetic is
// `trackers/habit-rollup.ts` and this is the DOM over it. The suffix is not
// decoration — `test/sources.ts` resolves a module by basename anywhere under
// `src/`, so two files called `habit-rollup.ts` make every source-shape sweep in
// the suite throw rather than fail.
//
// READ-ONLY THROUGHOUT, AND THAT IS THE DIFFERENCE FROM 1.0.54'S SECTION. The
// Habits section on a diary entry carries the three-state box, because the
// entry it sits on IS the day it writes to. Every mark here belongs to another
// note — thirty of them on a month — so there is nothing on this card a click
// could honestly change. 1.0.54 wrote the daily-only rule for exactly this
// reason and this is the other side of it.
//
// ONE ROW PER HABIT: a ring and a rate, the counts and the two runs, and under
// them a strip with one mark per day of the period. The strip is the reader's
// to turn off, and the rows are theirs to choose — see `HabitRollupEditor`,
// behind the door at the foot of the card.

import type { MarkdownPostProcessorContext } from "obsidian";
import { setIcon } from "obsidian";
import type ChronoAnvilPlugin from "../../main";
import { emptyCallout } from "../empty";
import { notify } from "../../core/notify";
import { statRing } from "../stat-strip";
import { periodCoverage, today } from "../../core/util";
import { formatPeriodLabel } from "../../charts/charts";
import { resolvePeriodBounds } from "../../charts/chart-widgets";
import { habitsForSurface, habitTypeOf } from "../../trackers/habits";
import type { TrackerClass, TrackerDef } from "../../trackers/trackers";
import { sparkFraction } from "./habits-section";
import { isManagedTemplate } from "../../trackers/entry-trackers";
import {
  grainOfUnit,
  grainsOf,
  habitRollupRows,
  noteWithHabitRollup,
  resolveGrain,
  rollupWindow,
  parseHabitRollupArg,
  NEEDS_GRAIN,
  type HabitRollupAnswer,
  type HabitRollupRow,
  type HabitSlotReading,
} from "../../trackers/habit-rollup";
import { HabitRollupEditor, type HabitRollupSeed } from "../habit-rollup-editor";

// Past this many slots the strip groups them, which on the only period that
// reaches it means a year of days drawn as a year of weeks.
//
// GROUPED IN RUNS OF SEVEN FROM THE PERIOD'S OWN START, not into ISO weeks.
// Every mark then covers the same span, which is what makes two of them
// comparable — a calendar grouping gives the first bucket however many days are
// left in the week it begins in, and a three-day stub shaded over three days
// reads as a bad week rather than a short one.
const STRIP_CELL_CAP = 100;
const STRIP_GROUP = 7;

interface StripCell {
  // 0..1 of the group that was kept, or null where nothing in it was written.
  ratio: number | null;
  label: string;
  // A single-slot cell says done / not done / nothing, which is 1.0.54's
  // vocabulary; a grouped cell has a density instead. One mark cannot mean both.
  single: boolean;
  state: HabitSlotReading["state"];
  written: boolean;
}

// The marks for one row.
//
// A SLOT WITH NOTHING IN IT IS STILL A MARK. `drawStrip` makes the same promise
// about the chart strips — *"the gaps are the information: a strip that closed
// up its holes would show a perfect month to somebody who logged four days"* —
// and it is the whole reason `habitSlots` emits the empty days at all.
export function stripCells(slots: readonly HabitSlotReading[]): StripCell[] {
  if (slots.length <= STRIP_CELL_CAP) {
    return slots.map((slot) => ({
      ratio: slot.state === 1 ? 1 : 0,
      label: slot.label,
      single: true,
      state: slot.state,
      written: slot.written,
    }));
  }
  const out: StripCell[] = [];
  for (let at = 0; at < slots.length; at += STRIP_GROUP) {
    const group = slots.slice(at, at + STRIP_GROUP);
    const done = group.filter((s) => s.state === 1).length;
    const written = group.some((s) => s.written);
    out.push({
      ratio: written ? done / group.length : null,
      label: `${group[0].label} – ${group[group.length - 1].label}: ${done} of ${group.length}`,
      single: false,
      state: null,
      written,
    });
  }
  return out;
}

// What a row says beside its name. The rate is drawn as the ring, so this is
// the three facts the ring cannot carry.
export function rollupSub(row: HabitRollupRow): string {
  if (!row.slots.length) return "nothing yet";
  // A NUMBER HABIT HAS NO STREAK AND NO RATE, so it reports the two facts it
  // does have: what a logged slot averaged, and how many slots were logged.
  // `habitRuns` is not asked — a run of a quantity is not a defined thing, and
  // "days above the mean" is a statistic nobody asked this card for.
  if (row.type === "number") {
    const unit = row.unit ? ` ${row.unit}` : "";
    const avg =
      row.mean == null ? "nothing logged" : `avg ${round1(row.mean)}${unit}`;
    return `${avg} · ${row.logged} of ${row.slots.length} logged`;
  }
  const parts = [`${row.done} of ${row.slots.length}`];
  // THE CURRENT RUN ONLY WHERE THERE IS ONE. "streak 0" is a true statement
  // that reads as a broken counter, and the best run below it already says
  // what the habit is capable of.
  if (row.current) parts.push(`streak ${row.current}`);
  if (row.best) parts.push(`best ${row.best}`);
  return parts.join(" · ");
}

// Which of the four shades a grouped mark wears.
//
// A FUNCTION BECAUSE THE ARITHMETIC IS THE CLAIM. `1 + floor(ratio * 3.999)`
// reads as a nudge and is in fact the whole mapping: the `.999` is what keeps a
// ratio of exactly 1 inside stop 4 instead of inventing a fifth, and a `4` or a
// `3` there is a mutant no drawing assertion can see. Lifted out so the four
// boundaries can be stated.
//
// STOP 1 IS THE FLOOR AND NOT "NONE". A group with nothing kept never reaches
// here — `drawStrip` leaves it classless, which is `tracker-stat.ts`'s rule for
// the same ramp — so the lightest shade means "some of this week", not "none".
export function stripShade(ratio: number): number {
  return 1 + Math.floor(ratio * 3.999);
}

// One decimal, and no trailing `.0`.
//
// A FUNCTION BECAUSE TWO CALLERS MUST AGREE: the sub-line's average and a
// bar's tooltip are the same quantity read twice, and `toFixed(1)` in one
// place and `Math.round` in the other is a card disagreeing with its own
// hover text.
export function round1(value: number): string {
  return String(Math.round(value * 10) / 10);
}

// The window's own least and greatest readings, or `null` where there are none.
//
// THE WINDOW'S RANGE AND NOT THE TRACKER'S DECLARED `min`/`max` — `drawStrip`
// in `tracker-stat.ts` argues this and the Habits section's sparkline follows
// it: *"a mood tracker scaled 1–5 whose readings all sit between 3 and 4 would
// otherwise draw thirty cells of one shade"*.
export function valueRange(
  slots: readonly HabitSlotReading[]
): { lo: number; hi: number } | null {
  const nums = slots
    .map((s) => s.value)
    .filter((v): v is number => v != null);
  if (!nums.length) return null;
  return { lo: Math.min(...nums), hi: Math.max(...nums) };
}

// The marks for a number row.
//
// EVERY CELL IS SHADED, NEVER BINARY, which is why this is a second function
// rather than a flag on the first. `stripCells` draws a single slot as
// done / not done / nothing — 1.0.54's three-state vocabulary — and a quantity
// has no such reading: 2 km is not "done" and 0 km is not "not done". So a
// number's marks are the shade ramp at every width, grouped or not.
//
// A GROUP AVERAGES ITS LOGGED SLOTS, not its elapsed ones. A week with one
// 10 km run reads as 10 km, not as 1.4 — the same `logged`-not-`written`
// distinction the row's own mean makes, for the same reason.
export function numberStripCells(
  slots: readonly HabitSlotReading[],
  unit: string | null
): StripCell[] {
  const range = valueRange(slots);
  const step = slots.length <= STRIP_CELL_CAP ? 1 : STRIP_GROUP;
  const said = unit ? ` ${unit}` : "";
  const out: StripCell[] = [];
  for (let at = 0; at < slots.length; at += step) {
    const group = slots.slice(at, at + step);
    const nums = group
      .map((s) => s.value)
      .filter((v): v is number => v != null);
    const mean = nums.length
      ? nums.reduce((sum, v) => sum + v, 0) / nums.length
      : null;
    const span =
      step === 1
        ? group[0].label
        : `${group[0].label} – ${group[group.length - 1].label}`;
    out.push({
      ratio: mean == null || range == null
        ? null
        : sparkFraction(mean, range.lo, range.hi),
      label:
        mean == null
          ? `${span}: nothing logged`
          : `${span}: ${round1(mean)}${said}`,
      single: false,
      state: null,
      written: group.some((g) => g.written),
    });
  }
  return out;
}

function drawStrip(parent: HTMLElement, row: HabitRollupRow): void {
  const strip = parent.createDiv({ cls: "ca-hrollup-strip" });
  const number = row.type === "number";
  const cells = number
    ? numberStripCells(row.slots, row.unit)
    : stripCells(row.slots);
  for (const cell of cells) {
    const el = strip.createDiv({ cls: "ca-hrollup-cell" });
    if (cell.single) {
      el.toggleClass("is-done", cell.state === 1);
      el.toggleClass("is-not-done", cell.state === 0);
      const said = cell.written
        ? cell.state === 1
          ? "done"
          : cell.state === 0
            ? "not done"
            : "nothing recorded"
        : "no entry for that day";
      el.setAttr("aria-label", `${cell.label}: ${said}`);
      continue;
    }
    // THE FOUR SHADES THE CHART STRIPS USE, so a colour means the same amount
    // in both places. No class at all for a group with nothing in it, rather
    // than a fifth stop named "none" — `drawStrip` in `tracker-stat.ts` argues
    // this at length and the base rule is what an empty cell looks like there.
    //
    // `> 0` FOR A BOOLEAN GROUP AND NOT FOR A NUMBER. On a boolean, ratio 0
    // means nothing was kept and the mark stays blank; on a number, fraction 0
    // means the LEAST reading of the window, which was logged and must be
    // visible — the sparkline's 12% floor is the same rule drawn as a height.
    if (cell.ratio != null && (number || cell.ratio > 0)) {
      el.addClass(`ca-act-${stripShade(cell.ratio)}`);
    }
    el.setAttr("aria-label", cell.label);
  }
}

export function buildHabitRollup(
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext,
  rest: string
): HTMLElement {
  const app = plugin.app;
  const root = createDiv({ cls: "ca-hrollup" });
  const period = resolvePeriodBounds(plugin, ctx);

  // REFUSING WITH A REASON BEATS A TRAILING WINDOW, which is `entry-rollup`'s
  // own sentence and its own argument: this widget's whole scope is "the
  // dashboard's period", and a silent default would draw a plausible,
  // unrelated set of days. The registry's `needs: "period"` keeps it out of the
  // add list everywhere this is the only thing it could say.
  if (!period) {
    root.appendChild(
      emptyCallout(
        "calendar-range",
        "habit-rollup needs a dashboard period.",
        "Put it on a note carrying week-start, month-start, quarter-start or year-start."
      )
    );
    return root;
  }

  const answer = parseHabitRollupArg(rest);
  const todayIso = today();
  const habits = habitsForSurface(plugin.settings.trackers, null);
  // `win`, NOT `window`: a local of that name shadows the global inside this
  // function, and the next line anybody writes here is `window.moment(...)`.
  const win = rollupWindow(period.start, period.end, todayIso);
  // THE DASHBOARD'S OWN GRAIN IS A FALLBACK AND NOT A FILTER. It decides only
  // what a habit on several grains is read at when the reader has not said;
  // a habit that names one grain is read there whatever dashboard this is.
  const dash = grainOfUnit(period.unit);
  const all = habitRollupRows(
    app,
    plugin.settings.paths,
    habits,
    win,
    answer.grains,
    dash
  );
  const label = formatPeriodLabel(period.unit, period.start);
  // THE SEEDS ARE BUILT HERE AND NOT IN THE DOOR, because the card's count of
  // habits waiting for a grain and the window's list of them must be one
  // answer. Two functions returning the same number is the shape that stays
  // consistent until somebody edits one of them.
  const seeds = rollupSeeds(habits, all, answer, dash);
  const registry = rollupRegistry(habits);
  const waiting = seeds.filter((s) => s.grain == null).length;
  const asking = waiting
    ? `${waiting} ${waiting === 1 ? "habit needs" : "habits need"} a grain`
    : null;

  if (!seeds.length) {
    root.appendChild(
      emptyCallout(
        "check-check",
        "No habits in this vault yet.",
        "Add one in Settings → ChronoAnvil → Trackers, or on any diary entry, and it is reported here."
      )
    );
    drawDoor(root, plugin, ctx, seeds, registry, dash, answer, label);
    return root;
  }

  // AN EXPLICIT LIST IS THE READER'S ORDER, NOT THE REGISTRY'S, and an id in it
  // that no longer exists is dropped rather than drawn as an empty row — a
  // habit can be renamed out from under a directive, which for a tracker means
  // a new habit, and the note saying otherwise is not evidence.
  const rows = answer.ids.length
    ? answer.ids
        .map((id) => all.find((r) => r.id === id))
        .filter((r): r is HabitRollupRow => r != null)
    : all;

  if (!rows.length) {
    root.appendChild(
      emptyCallout(
        "check-check",
        `No habits are shown for ${label}.`,
        // WHICH OF THE TWO REASONS IT IS. Until 1.0.56 a multi-grain habit
        // vanished from this card with no sentence anywhere, which is the
        // defect this round exists to fix — so where that is what happened,
        // the refusal says so instead of blaming the vault.
        asking
          ? `${asking} before it can be read — choose one below.`
          : "The habits this rollup names are no longer in the vault — choose some below."
      )
    );
    drawDoor(root, plugin, ctx, seeds, registry, dash, answer, label);
    return root;
  }

  const list = root.createDiv({ cls: "ca-hrollup-list" });
  for (const row of rows) {
    // ONE GRID FOR THE LIST, AND EVERY ROW `display: contents` — the 1.0.31
    // records-table fix. The same track list declared on each row AS ITS OWN
    // GRID sizes each `auto` track to that row's content, so the rates would
    // not line up down the card and the names would start at a different place
    // on every line.
    const el = list.createDiv({ cls: "ca-hrollup-row" });
    el.toggleClass("is-idle", row.done === 0);

    // A NUMBER HAS NO RATE, SO IT GETS NO RING. A ring is a part of a whole
    // and there is no whole here — 3 km on a day is not 3 km out of anything —
    // so the lead is the total, in the two tracks the ring and its percentage
    // would have taken. One `grid-column: span 2` in the stylesheet, no second
    // SVG, and the names still start in the same column down the card.
    const lead =
      row.type === "number"
        ? el.createSpan({
            cls: "ca-hrollup-total",
            text: `Σ ${round1(row.total)}`,
          })
        : null;
    if (!lead) {
      const ring = el.createDiv({ cls: "ca-stat-ring-wrap" });
      statRing(ring, row.rate ?? 0);
      el.createSpan({
        cls: "ca-hrollup-pct",
        text: row.rate == null ? "—" : `${Math.round(row.rate * 100)}%`,
      });
      const rate =
        row.rate == null
          ? `${row.label} — nothing logged for ${label}`
          : `${row.label} — ${Math.round(row.rate * 100)}% of ${label}, ${row.written} of ${row.slots.length} entries written`;
      ring.setAttr("aria-label", rate);
      ring.setAttr("title", rate);
    } else {
      const said = row.unit ? ` ${row.unit}` : "";
      const total = row.logged
        ? `${row.label} — ${round1(row.total)}${said} over ${label}, logged on ${row.logged} of ${row.slots.length}`
        : `${row.label} — nothing logged for ${label}`;
      lead.setAttr("aria-label", total);
      lead.setAttr("title", total);
    }
    el.createSpan({ cls: "ca-hrollup-name", text: row.label });
    el.createSpan({ cls: "ca-hrollup-sub", text: rollupSub(row) });

    if (answer.strip && row.slots.length) drawStrip(el, row);
  }

  // HOW MUCH OF THE PERIOD IS BEHIND THE NUMBERS, where the numbers are a rate
  // over an unfinished period. The year view has said "so far" since it was
  // written, for the reason `periodCoverage` records.
  //
  // IT RIDES THE DOOR'S ROW rather than taking a line of its own: the door is
  // the only other thing at the foot of the card, and a card whose last two
  // lines are each one short phrase is two rules of chrome under the content.
  const cover = periodCoverage(period.start, period.end, todayIso);
  const so =
    cover.partial && cover.started
      ? `${cover.elapsed} of ${cover.total} days so far`
      : null;
  drawDoor(
    root,
    plugin,
    ctx,
    seeds,
    registry,
    dash,
    answer,
    label,
    // BOTH SENTENCES OR EITHER. The coverage note has been on this row since
    // 1.0.55 and the waiting count is the new one; they are both one short
    // phrase about the card as a whole, and the foot is where such a phrase
    // goes rather than taking a rule of its own.
    [so, asking].filter(Boolean).join(" · ") || null
  );
  return root;
}

// The door onto the window.
//
// A TRAILING ROW, NOT A COG ON THE BAR, and the reason is a defect this plugin
// already shipped once: the Categories control is hosted by the `header:` line
// above its fence, and a fence written without one had no door at all until
// 1.0.49 §1 gave the field head a second slot. This section's bar is removable
// — *Show as widget* takes it off — so a control that lived there would come
// and go with it. A row inside the card is always inside the card.
function drawDoor(
  root: HTMLElement,
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext,
  seeds: readonly HabitRollupSeed[],
  // Registry order, which is what an all-ticked list collapses to. Passed in
  // rather than read here so the card's list and the window's are one list.
  registry: readonly string[],
  // This dashboard's own grain, which the window asks `resolveGrain` for again
  // after every chooser.
  dashboard: TrackerClass | null,
  answer: HabitRollupAnswer,
  label: string,
  // The coverage sentence, which only a drawn rollup over a running period has.
  note: string | null = null
): void {
  const foot = root.createDiv({ cls: "ca-hrollup-foot" });
  const text = seeds.length ? "Choose habits…" : "Add a habit";
  // THE SAME DOOR AS THE HABITS SECTION'S, down to the class, because it is the
  // same control in the same family: a dashed row at the foot of a habits card
  // that opens the window behind it. Two spellings of one shape is what 1.0.49
  // spent a round undoing.
  const door = foot.createEl("button", {
    cls: "ca-habits-door",
    attr: { type: "button", "aria-label": text, title: text },
  });
  setIcon(door.createSpan({ cls: "ca-journal-btn-icon" }), "settings-2");
  door.createSpan({ text });

  // NOT ON A MANAGED TEMPLATE, which is the Habits cell's refusal and the same
  // reason: a stored template is regenerated, so an answer written into one is
  // a change the next sync deletes.
  if (isManagedTemplate(plugin, ctx.sourcePath)) {
    door.disabled = true;
    door.setAttr("title", "This is a stored template — open a dashboard to choose its habits.");
  } else {
    door.addEventListener("click", () => {
      new HabitRollupEditor(
        plugin.app,
        plugin,
        label,
        seeds,
        registry,
        answer.strip,
        dashboard,
        (next: HabitRollupAnswer) => apply(plugin, ctx, door, next)
      ).open();
    });
  }

  // AFTER THE DOOR, AND NOT BEHIND THE REFUSAL ABOVE IT. The template branch
  // used to `return` here, which would have taken the coverage sentence with
  // it — the one fact on this row that has nothing to do with whether the
  // reader may edit the line.
  if (note) foot.createSpan({ cls: "ca-hrollup-foot-note", text: note });
}

// The window's rows: every habit the vault has, ticked where the card shows it.
//
// THE READER'S ORDER FIRST, because it is the card's — a reader who moved three
// habits meets them where they left them. The rest follow in registry order,
// since a habit the line does not name has no place of its own yet.
//
// AN EMPTY LIST TICKS EVERYTHING, which is the one place the grammar has to be
// restated in the UI: the default means "follow the vault", so the window a
// reader opens on an unanswered section shows them what they are starting from
// rather than an empty list they have to fill in.
// BUILT FROM THE DEFINITIONS AND NOT FROM THE ROWS, which is 1.0.56's change
// and the only way the window can fix anything. A habit waiting for a grain has
// no row by construction — that is what waiting means — so a window listing
// rows would list every habit except the ones it exists to settle.
//
// A HABIT ON NO DIARY GRAIN IS NOT LISTED AT ALL. A journal tracker has no
// slots on any of the four dashboards and never had; offering it a chooser of
// five grains it is not logged on is a control that cannot help. `grainsOf`
// returns the empty set for it and that is the gate, which is exactly the set
// `habitRollupRows` skips.
// The habits this card could report, in registry order.
//
// THE SAME GATE AS `rollupSeeds`' AND NOT A SECOND COPY OF IT, because this
// list is what the all-ticked collapse is compared against: a registry holding
// one id the seeds do not (or the other way about) makes the two lists
// permanently unequal, and the window then writes out every id for ever
// without anything on screen looking wrong.
export function rollupRegistry(habits: readonly TrackerDef[]): string[] {
  return habits.filter((h) => grainsOf(h).length > 0).map((h) => h.id);
}

export function rollupSeeds(
  habits: readonly TrackerDef[],
  rows: readonly HabitRollupRow[],
  answer: HabitRollupAnswer,
  dashboard: TrackerClass | null
): HabitRollupSeed[] {
  const named = answer.ids.length ? answer.ids : habits.map((h) => h.id);
  const place = (id: string): number => {
    const at = named.indexOf(id);
    return at === -1 ? named.length : at;
  };
  return habits
    .map((def, i) => ({ def, i }))
    .filter(({ def }) => grainsOf(def).length > 0)
    .map(({ def, i }) => {
      const grains = grainsOf(def);
      const chosen = answer.grains[def.id];
      const grain = resolveGrain(grains, chosen, dashboard);
      const row = rows.find((r) => r.id === def.id);
      return {
        id: def.id,
        label: def.label || def.id,
        shown: named.includes(def.id),
        type: habitTypeOf(def),
        grains,
        // WHAT THE READER SAID, kept apart from what it resolved to. The
        // chooser draws this one: a habit sitting in the Weekly group because
        // the dashboard is weekly has chosen nothing, and a `<select>` showing
        // "Weekly entries" as though it had would write that grain into the
        // note the next time anything else was saved.
        chosen: grains.includes(chosen) ? chosen : null,
        // `null` IS "WAITING", and it is the card's count as well as the
        // window's trailing group. A habit with no diary grain at all never
        // reaches here, so the two meanings cannot be confused.
        grain: grain === NEEDS_GRAIN ? null : grain,
        // WHICHEVER COUNT THE TYPE MEANS. A number habit's `done` would be
        // the slots whose reading happened to equal 1 — true, and about
        // nothing — so a number seed carries the slots it was LOGGED on, which
        // is the fact the row reports and the one a reader deciding what to
        // leave out is entitled to see.
        done: (habitTypeOf(def) === "number" ? row?.logged : row?.done) ?? 0,
        slots: row?.slots.length ?? 0,
        // Registry position, so the hidden tail keeps the order Settings has it
        // in rather than whatever the sort happens to do with equal keys.
        i,
      };
    })
    .sort((a, b) => place(a.id) - place(b.id) || a.i - b.i)
    .map(({ i: _i, ...seed }) => seed);
}

// ── the write ─────────────────────────────────────────────────────────────
//
// `getSectionInfo` IS ASKED AT THE SAVE, NEVER CAPTURED AT RENDER, which is
// `block-drag.ts`'s rule and its reason: it re-reads the live document, and
// every write to this note moves the lines under a range that was kept. The
// file is read again for the same reason.
async function apply(
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext,
  anchor: HTMLElement,
  answer: HabitRollupAnswer
): Promise<void> {
  const info = ctx.getSectionInfo(anchor);
  const file = plugin.app.vault.getFileByPath(ctx.sourcePath);
  if (!info || !file) {
    notify.fail("ChronoAnvil cannot edit this rollup here — it is not in an editable note.");
    return;
  }
  const text = await plugin.app.vault.read(file);
  const lines = text.split("\n");
  const out = noteWithHabitRollup(
    lines,
    { from: info.lineStart + 1, to: info.lineEnd },
    lines
      .slice(info.lineStart + 1, info.lineEnd)
      .find((l) => /^\s*habit-rollup(:|\s*$)/.test(l)) ?? "",
    answer
  );
  if (!out) {
    // BOTH ANSWERS ARE REPORTED, and this is the one the window has already
    // ruled out: Save with nothing changed closes without a write, so a `null`
    // here means the line is no longer where the block says it is.
    notify.fail("ChronoAnvil could not find this rollup's line in the note.");
    return;
  }
  // No repaint call: the widget is live over its own note, so the write it just
  // made is the event that redraws it.
  await plugin.app.vault.modify(file, out.join("\n"));
}
