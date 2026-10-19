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
// ONE ROW PER HABIT: a figure, the name, and the counts and the two runs, with
// a strip under them carrying one mark per slot of the period. The strip is the
// reader's to turn off, and the rows are theirs to choose — see
// `HabitRollupEditor`, behind the door at the foot of the card.

import type { MarkdownPostProcessorContext } from "obsidian";
import { setIcon } from "obsidian";
import type ChronoAnvilPlugin from "../../main";
import { emptyCallout } from "../empty";
import { notify } from "../../core/notify";
import { periodCoverage, plural, today } from "../../core/util";
import { formatPeriodLabel } from "../../charts/charts";
import { resolvePeriodBounds } from "../../charts/chart-widgets";
import { habitsForSurface, habitTypeOf } from "../../trackers/habits";
import {
  CLASS_DEFS,
  TRACKER_CLASS_LABELS,
  type TrackerClass,
  type TrackerDef,
} from "../../trackers/trackers";
import { sparkFraction } from "./habits-section";
import { isManagedTemplate } from "../../trackers/entry-trackers";
import {
  grainOfUnit,
  grainsOf,
  habitRollupRows,
  noteWithHabitRollup,
  resolveGrain,
  rollupGroups,
  rollupWindow,
  parseHabitRollupArg,
  NEEDS_GRAIN,
  type HabitRollupAnswer,
  type HabitRollupRow,
  type HabitSlotReading,
} from "../../trackers/habit-rollup";
import { HabitRollupEditor, type HabitRollupSeed } from "../habit-rollup-editor";
import type { FoldStore } from "../section-frame";

// ── DAY CELLS UP TO A MONTH, WEEK CELLS BEYOND IT (1.0.97) ──────────────
//
// *"a week overview should show 7 long cells, a month 28-31 small day cells. At
// a quarter overview using day cells stops making sense … averaging the days
// into one value per week and then quarters become ~12 cells for each week."*
//
// THE MECHANISM WAS ALREADY HERE AND ONLY THE RULE CHANGED. This was a cap of
// 100, which no period but the year reached — so a year already drew one mark
// per week and a quarter drew ninety-two slivers. A month is at most 31 daily
// slots, so 31 is where the rule actually sits, said as the calendar rather
// than as a number nothing is measured against.
//
// AND IT IS ASKED OF A DAILY ROW ONLY, which a count alone cannot express: a
// weekly habit on a year card has 52 slots and a bare cap would group them into
// runs of seven WEEKS. A week cannot be split into days either, so a weekly row
// is never re-grained in either direction — see `stripRuns`.
const STRIP_DAY_CAP = 31;

// GROUPED IN RUNS OF SEVEN FROM THE PERIOD'S OWN START, not into ISO weeks.
// Every mark then covers the same span, which is what makes two of them
// comparable — a calendar grouping gives the first bucket however many days are
// left in the week it begins in, and a three-day stub shaded over three days
// reads as a bad week rather than a short one.
const STRIP_GROUP = 7;

// A trailing remainder shorter than this joins the mark before it (1.0.97).
//
// THE STUB THE LINE ABOVE ARGUES AGAINST, ARRIVING FROM THE OTHER END. Ninety-two
// days is thirteen sevens and one day over, and a one-day mark drawn the same
// width as the thirteen beside it is exactly the misreading — so the quarter is
// thirteen marks, the last covering eight days, and its label says eight. A
// remainder of four or more stands as its own shorter mark instead, because
// folding it would make one mark nearly twice its neighbours.
const STRIP_STUB = 4;

// Past this many day marks the label needs the stylesheet's permission (1.0.97).
const STRIP_DENSE = 10;

// Which slots each mark covers, as half-open ranges over the slot array.
//
// ONE ANSWER FOR BOTH BUILDERS. `stripCells` and `numberStripCells` draw two
// different things out of the same arithmetic, and a second copy of "where does
// mark 3 start" is how the two come to disagree about what a quarter is — the
// shape `fencesOf` is written around in `core/block-move.ts`, for the reason it
// gives there.
export function stripRuns(
  count: number,
  grain: TrackerClass
): { at: number; to: number }[] {
  if (grain !== "daily" || count <= STRIP_DAY_CAP) {
    return Array.from({ length: count }, (_, at) => ({ at, to: at + 1 }));
  }
  const runs: { at: number; to: number }[] = [];
  for (let at = 0; at < count; at += STRIP_GROUP) {
    runs.push({ at, to: Math.min(at + STRIP_GROUP, count) });
  }
  const last = runs[runs.length - 1];
  if (runs.length > 1 && last.to - last.at < STRIP_STUB) {
    runs[runs.length - 2].to = last.to;
    runs.pop();
  }
  return runs;
}

// The day of the month a single DAY cell is wide enough to carry (1.0.97).
//
// *"also do this for day cells, if they fit."* A slice of the ISO date and not
// `labelForGrain`: that function is grain-aware because a label names a period,
// and this names a day of the month in the one case where the slot IS a day —
// so it is presentation and it stays in the view.
//
// THE DAY OF THE MONTH AND NOT A WEEKDAY LETTER, for both counts. One rule
// serves 7 cells and 31, it never repeats inside a card, and the weekday a
// letter would give is already on the card's own title bar.
function dayMark(date: string): string {
  return String(Number(date.slice(8, 10)));
}

interface StripCell {
  // 0..1 of the group that was kept, or null where nothing in it was written.
  ratio: number | null;
  label: string;
  // The day of the month, where this mark IS one day of one month (1.0.97).
  // Null on every grouped mark and on a weekly row's single marks alike: a
  // mark covering seven days, or one covering a week, belongs to no one date.
  short: string | null;
  // A single-slot cell says done / not done / nothing, which is 1.0.54's
  // vocabulary; a grouped cell has a density instead. One mark cannot mean both.
  single: boolean;
  // A slot the period has not reached (1.0.64). NOT the same as a slot nobody
  // wrote: the strip covers the whole period now, so without this the eighteen
  // days left in a month would be drawn exactly like eighteen days missed.
  ahead: boolean;
  state: HabitSlotReading["state"];
  written: boolean;
}

// The marks for one row.
//
// A SLOT WITH NOTHING IN IT IS STILL A MARK. `drawStrip` makes the same promise
// about the chart strips — *"the gaps are the information: a strip that closed
// up its holes would show a perfect month to somebody who logged four days"* —
// and it is the whole reason `habitSlots` emits the empty days at all.
// `ahead` IS HOW MANY OF THE SLOTS AT THE END HAVE NOT HAPPENED (1.0.64), and
// they are passed as part of one array rather than as a second one so the
// GROUPING sees the period whole. Grouped separately, the lived half would end
// in a stub of however many days were left in its last seven — and a three-day
// stub shaded over three days reads as a bad week rather than as a short one,
// which is the argument `STRIP_GROUP` is already written around. A group that
// STRADDLES today is a lived group: it holds real readings.
export function stripCells(
  slots: readonly HabitSlotReading[],
  grain: TrackerClass,
  ahead = 0
): StripCell[] {
  const lived = slots.length - ahead;
  const out: StripCell[] = [];
  for (const run of stripRuns(slots.length, grain)) {
    const group = slots.slice(run.at, run.to);
    if (group.length === 1) {
      const slot = group[0];
      out.push({
        ratio: slot.state === 1 ? 1 : 0,
        label: slot.label,
        short: grain === "daily" ? dayMark(slot.date) : null,
        single: true,
        ahead: run.at >= lived,
        state: slot.state,
        written: slot.written,
      });
      continue;
    }
    const done = group.filter((s) => s.state === 1).length;
    const written = group.some((s) => s.written);
    const span = `${group[0].label} – ${group[group.length - 1].label}`;
    out.push({
      ratio: written ? done / group.length : null,
      // AN UNLIVED GROUP IS NAMED AND NOT TALLIED. "0 of 7" is a true sentence
      // about seven days nobody has reached and a false one about this habit.
      label: run.at >= lived ? span : `${span}: ${done} of ${group.length}`,
      short: null,
      single: false,
      ahead: run.at >= lived,
      state: null,
      written,
    });
  }
  return out;
}

// What this row's slots ARE, named, and agreeing with the count in front of
// it (1.0.61).
//
// THE DENOMINATOR IS THE ONLY THING ON THIS CARD THAT SAID THE GRAIN, and it
// said it by arithmetic: a daily habit on a quarter reads `1 of 92` and a
// weekly one `1 of 13`, one under the other, and a reader had to know how many
// days are in a quarter to tell which calendar they were looking at. The
// headings group the rows and this names the unit inside the row — the reader
// asked for both, and each covers a case the other cannot: `@container
// (max-width: 360px)` hides this line entirely, and a reader scrolled past a
// heading still has the noun in front of them.
//
// OFF `periodNoun`, which is `CLASS_DEFS`' own word for one slot of a grain and
// is already what four other surfaces say ("Jump to week", "this month"). A
// sixth hand-written table of five nouns is how two of them come to disagree.
//
// IT AGREES WITH THE COUNT AFTER IT, not with the row: "1 of 12 days" and
// "1 of 1 day". The denominator is the thing being counted, so it is the
// denominator the noun answers to.
export function slotNoun(row: HabitRollupRow): string {
  const noun = CLASS_DEFS[row.grain].periodNoun;
  return row.slots.length === 1 ? noun : plural(noun);
}

// What a row says after its name. The rate leads the row as the figure, so this
// is the three facts the figure cannot carry.
export function rollupSub(row: HabitRollupRow): string {
  if (!row.slots.length) return "nothing yet";
  const noun = slotNoun(row);
  // A NUMBER HABIT HAS NO STREAK AND NO RATE, so it reports the two facts it
  // does have: what a logged slot averaged, and how many slots were logged.
  // `habitRuns` is not asked — a run of a quantity is not a defined thing, and
  // "days above the mean" is a statistic nobody asked this card for.
  if (row.type === "number") {
    const unit = row.unit ? ` ${row.unit}` : "";
    const avg =
      row.mean == null ? "nothing logged" : `avg ${round1(row.mean)}${unit}`;
    return `${avg} · ${row.logged} of ${row.slots.length} ${noun} logged`;
  }
  // THE STREAKS STAY BARE. "23 of 31 days · streak 5 days · best 9 days" says
  // the noun three times in one line of a card that has already grouped itself
  // under a heading carrying it — and a streak is a run of consecutive slots,
  // which is the one count on this line whose unit is never in doubt.
  const parts = [`${row.done} of ${row.slots.length} ${noun}`];
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

// The figure a row leads with, for either type (1.0.61, reduced 1.0.64).
//
// ONE SHAPE FOR BOTH ROWS, which is the reader's call and is why this is a
// function rather than two arms of the drawing code. Before 1.0.61 a boolean
// led with a ring and a percentage and a number led with `Σ 128` spanning both
// of their tracks — two different pictures down one card, and the Σ was a
// symbol the card never explained.
//
// IT RETURNED A PROPORTION TOO, FOR THE RING, UNTIL 1.0.64 TOOK THE RING OFF.
// The proportion was `logged / slots.length` on a number and emphatically not
// `row.rate`: `rate` is `done / slots.length` and `done` counts slots whose
// `state === 1`, which for a number means `readHabitState` rounded the stored
// value to >= 0.5 — so a ring drawn from it reported "the share of days I ran
// at least half a kilometre". That reasoning is kept here because the strip
// now draws the proportion instead, slot by slot, and the next hand to want a
// single mark back should start from it rather than from `rate`.
export function rollupFigure(row: HabitRollupRow): string {
  if (row.type === "number") {
    const said = row.unit ? ` ${row.unit}` : "";
    return row.logged ? `${round1(row.total)}${said}` : "—";
  }
  return row.rate == null ? "—" : `${Math.round(row.rate * 100)}%`;
}

export function rollupIdle(row: HabitRollupRow): boolean {
  return row.type === "number" ? row.logged === 0 : row.done === 0;
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
  unit: string | null,
  grain: TrackerClass,
  ahead = 0
): StripCell[] {
  const lived = slots.length - ahead;
  // THE RANGE IS THE LIVED SLOTS', which is the whole reason this normalises at
  // all: an unlived slot has no value, so it would not move `lo` or `hi` — but
  // reading the array whole would say it might, and the next hand to add a
  // default would find out it does.
  const range = valueRange(slots.slice(0, lived));
  const said = unit ? ` ${unit}` : "";
  const out: StripCell[] = [];
  for (const run of stripRuns(slots.length, grain)) {
    const group = slots.slice(run.at, run.to);
    const one = group.length === 1;
    const nums = group
      .map((s) => s.value)
      .filter((v): v is number => v != null);
    const mean = nums.length
      ? nums.reduce((sum, v) => sum + v, 0) / nums.length
      : null;
    const span = one
      ? group[0].label
      : `${group[0].label} – ${group[group.length - 1].label}`;
    out.push({
      ratio: mean == null || range == null
        ? null
        : sparkFraction(mean, range.lo, range.hi),
      label:
        run.at >= lived
          ? span
          : mean == null
            ? `${span}: nothing logged`
            : `${span}: ${round1(mean)}${said}`,
      // THE DAY IS THE SAME QUESTION FOR BOTH TYPES, and `single` is not it.
      // A number's marks are never `single` — the three-state vocabulary has
      // nothing to say about 2 km — but a number row on a month card draws
      // thirty-one one-day marks exactly as a boolean row does, and the day
      // each one covers is as true there as it is there.
      short: one && grain === "daily" ? dayMark(group[0].date) : null,
      single: false,
      ahead: run.at >= lived,
      state: null,
      written: group.some((g) => g.written),
    });
  }
  return out;
}

function drawStrip(parent: HTMLElement, row: HabitRollupRow): void {
  const strip = parent.createDiv({ cls: "ca-hrollup-strip" });
  const number = row.type === "number";
  // THE SLOT IS NOT ALWAYS A DAY, and this string said it was. A weekly habit's
  // unwritten mark read "no entry for that day" on a card that had just drawn
  // thirteen of them across a quarter. `periodNoun` again — see `slotNoun`.
  const noun = CLASS_DEFS[row.grain].periodNoun;
  // THE PERIOD, NOT THE PART OF IT THAT HAS HAPPENED (1.0.64). `row.ahead`
  // carries the rest of it, with nothing in it to read, so that the strip's
  // LENGTH is the period's length: seven marks on a week card and ninety-two on
  // a quarter's, the same shape every morning rather than one mark longer.
  const rest: HabitSlotReading[] = row.ahead.map((slot) => ({
    ...slot,
    state: null,
    value: null,
    written: false,
  }));
  const all = [...row.slots, ...rest];
  const cells = number
    ? numberStripCells(all, row.unit, row.grain, rest.length)
    : stripCells(all, row.grain, rest.length);
  // THE LABELS ARE A SECOND GRID ROW, not text inside the marks (1.0.97).
  //
  // A MARK IS A COLOUR AND NOTHING MAY BE WRITTEN ON IT. The fills are the
  // grain hue, four shades of the ramp, a hollow outline and a faint not-yet —
  // six backgrounds a day label would have to stay legible over, which is six
  // contrast problems rather than one. Under the mark it has the card's own
  // background, every rule from 1.0.61 through 1.0.65 keeps the mark it was
  // written for, and `.is-ahead` keeps declaring no height.
  //
  // SO EVERY MARK GETS A LABEL OR NONE DO. `grid-auto-flow: column` over two
  // rows fills each column downwards, which aligns a label with its mark by
  // POSITION — and a strip that labelled only some of its marks would put the
  // rest of them in the label row. A run is one slot for every mark or for none
  // of them, so the flag is the whole strip's; the empty string is the guard
  // for the next hand that makes it per-mark.
  const labelled = cells.some((cell) => cell.short != null);
  if (labelled) {
    strip.addClass("is-labelled");
    // TEN IS WHERE TWO DIGITS STOP FITTING BY THEMSELVES. A week's seven marks
    // are ~94px and carry a date at any pane width; a month's thirty-one are
    // ~20px at full width and ~10px in a sidebar, so past this many the
    // stylesheet asks a container query whether the card is wide enough. TS
    // cannot see the width and CSS cannot count the marks, which is why the
    // answer takes both — see `85-tracker-controls.css`.
    if (cells.length > STRIP_DENSE) strip.addClass("is-dense");
  }
  for (const cell of cells) {
    const el = strip.createDiv({ cls: "ca-hrollup-cell" });
    // BEFORE THE BRANCHES, every one of which `continue`s. An unreached day is
    // still a date — what is absent there is the reading, which `.is-ahead`
    // already says — so the label cannot sit behind the `ahead` test.
    if (labelled) {
      strip.createDiv({ cls: "ca-hrollup-day", text: cell.short ?? "" });
    }
    // A SLOT NOBODY HAS REACHED SAYS SO, and says it before anything else can
    // paint it: without this the days left in the month are drawn exactly like
    // the days that were missed, which is the misreading `rollupWindow`'s clip
    // exists to prevent, moved from the arithmetic into the picture.
    if (cell.ahead) {
      el.addClass("is-ahead");
      el.setAttr("aria-label", `${cell.label}: not yet`);
      continue;
    }
    if (cell.single) {
      el.toggleClass("is-done", cell.state === 1);
      el.toggleClass("is-not-done", cell.state === 0);
      const said = cell.written
        ? cell.state === 1
          ? "done"
          : cell.state === 0
            ? "not done"
            : "nothing recorded"
        : `no entry for that ${noun}`;
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

// ── WHERE A GRAIN SECTION REMEMBERS THAT IT IS CLOSED (1.0.65) ───────────
//
// `settings.collapsedNoteSections`, the one record every fold in this plugin
// keeps its answer in: `"<notePath>::<title>"` for a header bar, `"::frame:"`
// for a `frame: section`, `"::note:"` for a diary field, `"::reveal:"` for a
// banner chevron, `"::calendar:"` for a diary card's footer panel — and now
// `"::hrollup:<grain>"`. Namespaced so it cannot collide with a title a reader
// wrote, which is the rule every one of those followed.
//
// THE KEY IS THE NOTE AND THE GRAIN, NOT THE BLOCK. Two habit rollups on one
// note would share a fold, and that is the right answer rather than a
// limitation: they are the same list of grains over the same period, and a
// reader who closed Weekly on one of them meant Weekly. A block index would also
// go stale the moment a line was added above — `openGroupTabs` is the one record
// that takes that risk and says so.
export function rollupFoldKey(sourcePath: string, grain: TrackerClass): string {
  return `${sourcePath}::hrollup:${grain}`;
}

// ── ABSENT MEANS OPEN, SO A CLOSED SECTION IS THE ONLY THING STORED ──────
//
// `Widgets.foldStore()`'s policy and not `directive-regions.ts`', and the
// difference is the default. The calendar's two panels ship CLOSED, so "the
// reader opened this" is a fact only a stored `false` can carry; these ship
// OPEN, so a `false` would be a row recording that nothing happened. Deleting
// the key is what keeps a record that only ever grows from doing so.
//
// A FOURTH ADAPTER AND NOT A FIFTH POLICY. Nine files write this map and each
// builds the smallest reader it needs; what must not happen is one that
// disagrees about what an absent key means, which is why the sentence above is
// here rather than assumed.
//
// Fire-and-forget on the write, as every other fold is: a failed save costs a
// remembered section, not correctness, and awaiting it would make a click on a
// header wait for disk.
function rollupFolds(plugin: ChronoAnvilPlugin): FoldStore {
  return {
    isCollapsed: (key) =>
      plugin.settings.collapsedNoteSections?.[key] === true,
    setCollapsed: (key, value) => {
      if (!plugin.settings.collapsedNoteSections) {
        plugin.settings.collapsedNoteSections = {};
      }
      const map = plugin.settings.collapsedNoteSections;
      if (value) map[key] = true;
      else delete map[key];
      void plugin.saveSettings();
    },
  };
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
  const folds = rollupFolds(plugin);
  // EVERY GRAIN PRESENT GETS A HEADING, INCLUDING WHEN THERE IS ONLY ONE, and
  // the single-grain case is the one that decided it. Suppressing a lone
  // heading was the obvious economy — chrome that separates one thing from
  // nothing is chrome — and it fails on the two counts that matter:
  //
  //   `@container (max-width: 360px)` HIDES `.ca-hrollup-sub` ENTIRELY. On a
  //   phone the sub line's noun is gone, so a suppressed heading leaves an
  //   all-daily card saying nothing whatsoever about its grain — which is the
  //   exact complaint this round answers, in the one configuration where the
  //   heading is the sole carrier of the answer.
  //
  //   AND THE WINDOW ALREADY DRAWS IT. `HabitRollupEditor.renderRows` skips
  //   EMPTY groups, which on an all-daily vault is one heading reading "Daily
  //   entries". "Draw the groups you have" is then one rule on both sides of
  //   the door; "suppress a lone one" would be a second rule only the card had.
  //
  // It also keeps the card's shape off facts outside the rows: defining one
  // weekly habit would otherwise shift every existing row down a line.
  for (const group of rollupGroups(rows)) {
    // THE HEADING IS A CHILD OF THE LIST, NOT A WRAPPER ROUND A GROUP. The list
    // is ONE grid with every row `display: contents` — see below — and a group
    // in its own `<div>` would be a second grid per heading, which is the exact
    // 1.0.31 bug that shape exists to prevent. `grid-column: 1 / -1` is how an
    // item spans the whole list, and the strip has done it since 1.0.55.
    //
    // ON `list` AND NEVER ON THE ROW, for a second reason: `.is-idle` mutes a
    // row's children, and a grain is a fact about where a habit is logged
    // rather than about whether anything was kept. A heading greyed out over
    // three idle rows reads as a disabled section.
    //
    // AND IT SAYS WHAT THE WINDOW BEHIND THE DOOR SAYS. `TRACKER_CLASS_LABELS`
    // is `HabitRollupEditor`'s own heading table, derived from `CLASS_DEFS`;
    // until now the window grouped by grain and the card did not, so the two
    // sides of one door described one list in two different languages.
    const sect = list.createDiv({ cls: "ca-hrollup-sect" });
    // THE GRAIN AS A COLOUR, AND NOT UNDER THE NAME `data-ca-grain`. Five rules
    // in `99-aesthetic-presets.css` bind `--ca-grain-accent` off that attribute,
    // and one of the rules READING it is `[data-ca-grain] .ca-stat-ring-val`. A
    // `var()` is substituted on the element that DECLARES the property, so an
    // element that bound `--ca-grain-accent` — by wearing that attribute or by
    // hand — would repaint any ring inside it. A private attribute binding a
    // private property reaches nothing it was not pointed at.
    //
    // ON THE SECTION AND NO LONGER ON EACH ROW (1.0.65). A group IS one grain —
    // that is what `rollupGroups` returns — so the row was stamping a fact about
    // its section n times, and the section head could not read a property its
    // own children declared. Custom properties inherit through `display:
    // contents`, so the fallback arm of the stylesheet is unaffected.
    sect.setAttr("data-ca-row-grain", group.grain);

    const key = rollupFoldKey(ctx.sourcePath, group.grain);
    const head = sect.createEl("button", {
      cls: "ca-hrollup-head",
      attr: { type: "button" },
    });
    const chev = head.createSpan({ cls: "ca-hrollup-chev" });
    setIcon(chev, "chevron-down");
    head.createSpan({
      cls: "ca-hrollup-head-name",
      text: TRACKER_CLASS_LABELS[group.grain],
    });
    // THE COUNT IS WHAT A CLOSED SECTION STILL SAYS. A header that folds away
    // eight habits and then reads exactly as it did with one is a control whose
    // own state is invisible — the settings tab's groups have carried their
    // count for the same reason since 4.x.
    head.createSpan({
      cls: "ca-hrollup-head-count",
      text: String(group.rows.length),
    });

    const body = sect.createDiv({ cls: "ca-hrollup-body" });
    for (const row of group.rows) drawRow(body, row, label, answer.strip);

    // THE BODY FOLDS AND THE HEAD DOES NOT, which is `foldableSection`'s own
    // rule: a section that folded itself away entirely would leave the reader
    // nothing to click to get it back.
    const apply = (closed: boolean): void => {
      sect.toggleClass("is-closed", closed);
      head.setAttr("aria-expanded", String(!closed));
    };
    apply(folds.isCollapsed(key));
    head.addEventListener("click", () => {
      const next = !folds.isCollapsed(key);
      apply(next);
      folds.setCollapsed(key, next);
    });
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

// One habit's line, and its strip under it.
//
// A FUNCTION SO THE ROW IS REACHABLE, which is what `test/sources.ts`'s
// `fnBody` needs: the suite has no DOM, so every claim about what this draws is
// a claim about this text, and a loop body nested two deep inside a 170-line
// builder cannot be sliced out of it.
function drawRow(
  host: HTMLElement,
  row: HabitRollupRow,
  label: string,
  strip: boolean
): void {
  // ONE GRID FOR THE LIST, AND EVERY ROW `display: contents` — the 1.0.31
  // records-table fix. The same track list declared on each row AS ITS OWN
  // GRID sizes each `auto` track to that row's content, so the rates would
  // not line up down the card and the names would start at a different place
  // on every line.
  const el = host.createDiv({ cls: "ca-hrollup-row" });
  el.toggleClass("is-idle", rollupIdle(row));

  // ── THE RING IS GONE (1.0.64) ───────────────────────────────────────────
  //
  // Eight of them down a card, most drawn empty, was the largest thing on it
  // and the least said: *"the row becomes figure, name, sub — and the strip
  // under it is already the picture"*. It drew a PROPORTION, and the strip
  // under it draws the same proportion slot by slot, which is strictly more.
  //
  // `rollupLead` WENT WITH IT, down to `rollupFigure`. Its `frac` had exactly
  // one reader — the ring — and a function returning a number nothing reads is
  // how a later hand concludes the number must matter.
  const figure = rollupFigure(row);
  el.createSpan({ cls: "ca-hrollup-pct", text: figure });
  const noun = slotNoun(row);
  const said =
    row.type === "number"
      ? row.logged
        ? `${row.label} — ${figure} over ${label}, logged on ${row.logged} of ${row.slots.length} ${noun}`
        : `${row.label} — nothing logged for ${label}`
      : row.rate == null
        ? `${row.label} — nothing logged for ${label}`
        : `${row.label} — ${figure} of ${label}, ${row.written} of ${row.slots.length} ${noun} written`;
  // THE SENTENCE MOVES TO THE NAME, which is where it can be read: it used to
  // hang off the ring, and `.ca-hrollup-row` is `display: contents` and so has
  // no box to hover.
  const name = el.createSpan({ cls: "ca-hrollup-name", text: row.label });
  name.setAttr("aria-label", said);
  name.setAttr("title", said);
  el.createSpan({ cls: "ca-hrollup-sub", text: rollupSub(row) });

  if (strip && row.slots.length) drawStrip(el, row);
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
