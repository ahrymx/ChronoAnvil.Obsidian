// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Habits section (1.0.54).
//
// ── WHY A TRACKER TYPE GETS A SECTION ─────────────────────────────────────
//
// Every tracker on a diary entry is drawn in one grid of fixed cells —
// `--ca-tracker-cell-h`, 66px, `overflow: hidden` — which is the right box for a
// number, a scale or a time pair and the wrong box for a LIST. The boolean
// trackers fold into one of those cells, and `85-tracker-controls.css` spends
// forty lines of arithmetic fitting two rows of 14px chips into 36px of it: four
// habits is the comfortable maximum, and a chip has room for a name and a tick
// and nothing else. The reader asked for the type to be able to leave the grid,
// and this is where it goes.
//
// WHAT THE SECTION SAYS THAT THE CELL CANNOT. One row per habit, with the week
// it sits in behind the name — seven days read from the entries either side of
// this one. That is the whole reason a habit wants more than a chip: a habit is
// a thing you keep, and the only question a chip can answer is today's.
//
// ── TWO COLUMNS, AS OF 1.0.56 ─────────────────────────────────────────────
//
// The reader widened the word: *"Habits can be either boolean or number
// trackers"*, with the two drawn side by side — *"one side for boolean habits
// and the other for ... stepper ... trackers"*. A number tracker was in the
// grid for exactly the reason a boolean was: 66px with `overflow: hidden` is
// the wrong box for a value that wants its own history beside it.
//
// EACH COLUMN IS ITS OWN GRID, AND THAT IS NOT THE 1.0.31 BUG. That bug is
// rows WITHIN one list failing to line up because each sized its own tracks —
// which is why `.ca-habits-list` is one grid with `display: contents` rows and
// must stay one. These two lists must deliberately NOT share tracks: a 16px
// tick box and a 90px stepper have nothing to align with each other, and
// forcing them into one grid would give the boolean column the stepper's
// width. So the pair is `.ca-jld-pair`'s shape — a wrapper grid holding two
// independent cards with a divider between them — and the next reader who
// wants to "fix" this into one grid should read this paragraph first.
//
// A LONE COLUMN DRAWS FULL WIDTH, which is the common case: every shipped
// preset is all-boolean, so a vault that has never defined a number habit must
// not get a card with an empty right half and a divider down the middle of it.
//
// THE CELL IS NOT DELETED AND NOTHING IS MIGRATED. The note's `tracker:<id>`
// lines stay exactly where they are; the grid's fold-in reads
// `noteHasHabitsSection` and stands down while this section is on the note. Take
// the section off and the cell comes back, with its chips and its readings,
// because the only thing that ever changed was which of the two drew them.
//
// ── WHY IT IS NOT A PAGE WIDGET ───────────────────────────────────────────
//
// The boxes write onto the host note's own frontmatter. On a dashboard that is
// the dashboard's frontmatter, which is not where a reading lives — the same
// argument `NOT_PAGE_WIDGETS` makes for `tracker` and `sleep`, drawn full width
// instead of inline. A page wants a habits SUMMARY (a rate, a streak, a density
// strip) and that is a different widget, read-only, for a later release.

import type { MarkdownPostProcessorContext } from "obsidian";
import { setIcon } from "obsidian";
import { frontmatterOf } from "../../core/util";
import { emptyCallout } from "../empty";
import {
  describeHabitState,
  habitLabelOf,
  habitTypeOf,
  habitWeek,
  habitWeekReadings,
  habitsOnNote,
  readHabitNumber,
  type HabitDay,
  type HabitEntry,
  type HabitReading,
  type HabitState,
} from "../../trackers/habits";
import { buildStepper } from "./controls";
import { isManagedTemplate, noteSurfaceOf } from "../../trackers/entry-trackers";
import { entryDateKey } from "../../diary/nav";
import type { TrackerClass } from "../../trackers/trackers";
import { openHabitsWindow, wireHabit } from "./tracker-controls";
import type { EntryControlHost } from "./controls";

// What the door says, which depends on whether there is anything behind it.
//
// ONE CONTROL, TWO VERBS. The window adds, renames, reorders and removes, so
// "Manage" is what it does — but a reader whose section is empty has one thing
// to do in there and the row is the only thing on the card. Naming the act
// rather than the window is what the Tags cell does with "+ Add tags".
export function habitsDoorLabel(count: number): string {
  return count ? "Manage habits" : "Add a habit";
}

// One day's mark. The class is the reading; the title is the fact behind it.
//
// TWO FACTS AND ONE MARK — see `HabitReading.written`. An unwritten day and an
// unanswered habit are both "nothing recorded" and look identical on purpose;
// the tooltip is where there is room to say which, and it is also the only
// place the DATE can be said, since a 10px dot cannot carry one.
function paintDay(
  dot: HTMLElement,
  day: { label: string; state: HabitState; written: boolean },
  name: string
): void {
  dot.toggleClass("is-done", day.state === 1);
  dot.toggleClass("is-not-done", day.state === 0);
  dot.toggleClass("is-blank", day.state == null);
  const said = day.written
    ? describeHabitState(day.state)
    : "no entry for that day";
  const text = `${name} — ${day.label}: ${said}`;
  dot.setAttr("title", text);
  dot.setAttr("aria-label", text);
}

// ── A NUMBER HABIT'S WEEK (1.0.56) ────────────────────────────────────────
//
// A boolean's week is seven dots because its answer is one bit. A number's is a
// SHAPE: seven values of differing width would not line up down a column the
// way seven dots do, and seven numbers at 10px are unreadable anyway. So the
// strip is a bar per day, which is the reader's own call.
//
// NO BAR-CHART PRECEDENT EXISTED TO REUSE. `chart-render.ts`' bars are Chart.js
// — a whole canvas and a config object, far too much for a table row — and the
// three density strips in the tree (`ca-tstat-cell`, `ca-jjh-cell`,
// `ca-hrollup-cell`) are SHADE ramps over the `--ca-act-*` tokens, which answer
// "how much" with colour rather than with height. `year-view.ts:287` is the one
// thing in the plugin shaped like this and it is one line of arithmetic, not a
// function. So: seven elements in a flex row, bottom-aligned, with a height.

// Where a value sits in the week's own range, as 0…1.
//
// OVER THE WEEK'S OWN MIN AND MAX, NOT THE TRACKER'S DECLARED `min`/`max`, and
// `drawStrip` states the reason in `tracker-stat.ts`: *"a mood tracker scaled
// 1–5 whose readings all sit between 3 and 4 would otherwise draw thirty cells
// of one shade"* — a strip that has stopped saying anything. The same week of
// a 0–10000 step counter would draw seven bars at the floor.
//
// A FLAT WEEK IS FULL HEIGHT, NOT EMPTY. `span === 0` is "every day the same",
// which is not "every day the least" — the other half of that function's rule,
// and the boundary a `span === 0 ? 0` mutant would quietly invert.
export function sparkFraction(value: number, lo: number, hi: number): number {
  const span = hi - lo;
  return span === 0 ? 1 : (value - lo) / span;
}

// The floor a drawn bar never goes below, in percent.
//
// BECAUSE A 0%-TALL BAR IS NOT A BAR. The least day of the week normalises to
// `0`, and a reader looking at a column with nothing in it cannot tell it from
// the day nobody wrote — which is the one distinction `HabitReading.written`
// exists to carry. 12% is a visible sliver at the 22px strip height and still
// unmistakably the bottom of the range.
export const SPARK_FLOOR = 12;

export function sparkHeight(frac: number): string {
  return `${SPARK_FLOOR + frac * (100 - SPARK_FLOOR)}%`;
}

// One day's bar. `null` is an unwritten day, which gets the baseline instead.
function paintBar(
  bar: HTMLElement,
  day: { label: string; value: number | null; written: boolean },
  lo: number,
  hi: number,
  name: string,
  unit: string | undefined
): void {
  const value = day.value;
  bar.toggleClass("is-blank", value == null);
  if (value == null) {
    // NO HEIGHT AND NO RAMP, which is `drawStrip`'s rule for the same case:
    // *"a day with no reading is drawn as an empty cell rather than skipped,
    // because the gaps are the information"*. The column keeps its place and
    // the stylesheet gives it a hairline, so the week still has seven slots.
    bar.style.removeProperty("height");
  } else {
    bar.style.height = sparkHeight(sparkFraction(value, lo, hi));
  }
  const said = value == null
    ? day.written
      ? "nothing recorded"
      : "no entry for that day"
    : unit
      ? `${value} ${unit}`
      : `${value}`;
  const text = `${name} — ${day.label}: ${said}`;
  bar.setAttr("title", text);
  bar.setAttr("aria-label", text);
}

export function buildHabitsSection(
  deps: EntryControlHost,
  ctx: MarkdownPostProcessorContext,
  noteText: string
): HTMLElement {
  const plugin = deps.plugin;
  const app = plugin.app;
  const root = createDiv({ cls: "ca-habits-section" });

  const surface = noteSurfaceOf(app, plugin, ctx.sourcePath);
  const entries = habitsOnNote(plugin.settings.trackers, noteText, surface);

  // ── WHICH WEEK, AND WHEN THERE IS NONE ──────────────────────────────
  //
  // THE GRAIN COMES OFF THE SURFACE, which is `surfaceFolders`' own read
  // (`surface.classes[0]`) rather than a second classification of the path, and
  // the date comes off `entryDateKey` — the one function that knows where each
  // grain keeps its key, written because the three copies that preceded it did
  // not all agree.
  //
  // DAILY ONLY, AND THE REASON IS NOT LAYOUT. The box writes the HOST note's
  // property. On a weekly entry the seven columns are seven other notes, so
  // ticking the box would move nothing on the strip beside it — a control and a
  // readout that disagree, on one row, about one habit. A non-daily entry gets
  // the rows and no strip.
  const grain: TrackerClass | null =
    surface?.kind === "diary" ? surface.classes[0] : null;
  const file = deps.fileOf(ctx);
  const iso =
    file && grain ? entryDateKey(frontmatterOf(app, file), grain) : "";
  const week = grain === "daily" ? habitWeek(iso) : [];

  if (!entries.length) {
    root.appendChild(
      emptyCallout(
        "check-check",
        "No habits on this entry yet.",
        "Add one below, or in Settings → ChronoAnvil → Trackers."
      )
    );
    drawDoor(root, deps, entries, ctx);
    return root;
  }

  // ── THE SPLIT (1.0.56) ──────────────────────────────────────────────
  //
  // BY TYPE AND IN THE NOTE'S OWN ORDER WITHIN EACH SIDE. A `filter` rather
  // than a sort, so a reader who put Gym above Read still sees Gym above Read;
  // the two columns are two lists, not one list rearranged.
  const booleans = entries.filter((e) => habitTypeOf(e.def) === "boolean");
  const numbers = entries.filter((e) => habitTypeOf(e.def) === "number");

  const pair = root.createDiv({ cls: "ca-habits-pair" });
  // ONE TRACK WHEN ONE SIDE IS EMPTY — see the note at the top of this file.
  // Set as a class rather than left to `:only-child`, because the divider is a
  // border on the second column and a lone column is still the first.
  pair.toggleClass("is-single", !booleans.length || !numbers.length);

  if (booleans.length) {
    const list = column(pair, week, iso);
    for (const entry of booleans) drawBoolRow(deps, list, entry, week, iso, ctx);
  }
  if (numbers.length) {
    const list = column(pair, week, iso);
    for (const entry of numbers) drawNumRow(deps, list, entry, week, iso, ctx);
  }

  drawDoor(root, deps, entries, ctx);
  return root;
}

// One side of the pair: its own grid, with its own heads.
//
// The column heads come off the same seven days the marks are drawn from —
// never a typed `["M","T",…]`, which is a second list that can disagree about
// which column is which.
function column(
  pair: HTMLElement,
  week: readonly HabitDay[],
  iso: string
): HTMLElement {
  const list = pair
    .createDiv({ cls: "ca-habits-col" })
    .createDiv({ cls: "ca-habits-list" });
  if (!week.length) return list;

  const heads = list.createDiv({ cls: "ca-habits-heads" });
  // The two cells a head has nothing to put in. Present rather than skipped:
  // the row is a three-column grid and a strip that landed in the name's
  // track would sit over the names instead of over the marks.
  heads.createSpan({ cls: "ca-habits-pad" });
  heads.createSpan({ cls: "ca-habits-name" });
  const strip = heads.createDiv({ cls: "ca-habit-week" });
  for (const day of week) {
    const head = strip.createSpan({
      cls: "ca-habit-dow",
      text: day.head,
      attr: { title: day.label },
    });
    // THIS ENTRY'S COLUMN IS MARKED ONCE, ON ITS HEAD, and not on each of the
    // marks under it. Seven marks down a strip of five rows is a second
    // vocabulary competing with the readings themselves — the 1.0.52 lesson
    // about a calendar cell asked to carry three facts — and a column is the
    // thing being named, which is what a head is for.
    if (day.iso === iso) head.addClass("is-now");
  }
  return list;
}

// A boolean habit's row: the box, the name, the week as dots.
function drawBoolRow(
  deps: EntryControlHost,
  list: HTMLElement,
  entry: HabitEntry,
  week: readonly HabitDay[],
  iso: string,
  ctx: MarkdownPostProcessorContext
): void {
  const app = deps.plugin.app;
  const name = habitLabelOf(entry.def, entry.directive);
  const row = list.createDiv({ cls: "ca-habits-row" });
  // The chip's and the window's own control, for the third time: same
  // classes, same glyphs, same three-state cycle, so one habit is one
  // control wherever a reader meets it.
  const box = row.createEl("button", {
    cls: "ca-journal-habit-box",
    attr: { type: "button" },
  });
  row.createSpan({ cls: "ca-habits-name", text: name });

  const dots: { day: HabitReading; el: HTMLElement }[] = [];
  if (week.length) {
    const strip = row.createDiv({ cls: "ca-habit-week" });
    for (const day of habitWeekReadings(
      app,
      deps.plugin.settings.paths,
      entry.def.id,
      iso
    )) {
      const dot = strip.createSpan({ cls: "ca-habit-day" });
      paintDay(dot, day, name);
      dots.push({ day, el: dot });
    }
  }

  // THE BOX IS THE PRESS, NOT THE ROW. A row-wide press target would make a
  // click on Wednesday's dot tick today — the one gesture this section must
  // not have, since the dots are a readout and six of them are other notes.
  wireHabit(deps, box, box, entry.def, ctx, (known) => {
    row.toggleClass("is-done", known === 1);
    row.toggleClass("is-not-done", known === 0);
    // THIS ENTRY'S OWN COLUMN IS ONE OF THE SEVEN, so a tick that did not
    // move it would read as a bug in the strip. Repainted from the same
    // function the first paint used, with the day's own facts kept.
    const here = dots.find(({ day }) => day.iso === iso);
    if (here) {
      paintDay(
        here.el,
        { ...here.day, state: known === 1 ? 1 : known === 0 ? 0 : null, written: true },
        name
      );
    }
  });
}

// A number habit's row: the stepper, the name, the week as bars.
function drawNumRow(
  deps: EntryControlHost,
  list: HTMLElement,
  entry: HabitEntry,
  week: readonly HabitDay[],
  iso: string,
  ctx: MarkdownPostProcessorContext
): void {
  const app = deps.plugin.app;
  const name = habitLabelOf(entry.def, entry.directive);
  const row = list.createDiv({ cls: "ca-habits-row ca-habits-row-number" });
  // THE NAME FOLLOWS THE READING HERE TOO, and it needs its own class to do
  // it. A boolean row's contrast comes off `is-done` / `is-not-done`, which a
  // stepper never wears — so without this the row's name would be muted for
  // ever, including on a day the reader logged 10 km. `is-logged` is the
  // number's side of that same 1.0.53 rule: full contrast for a thing that is
  // so, muted for a thing that is not.
  row.toggleClass(
    "is-logged",
    readHabitNumber(deps.currentValue(ctx, entry.def.id)) != null
  );

  // `buildStepper` ITSELF, not a copy of it. It is already the control this
  // tracker had in its grid cell, it already writes through `host.write`, and
  // the host here IS an `EntryControlHost` — so a number habit's reading is
  // answered by the same code before and after the type left the grid. The
  // window's stepper is the one that had to be rewritten, and only because
  // nothing there may write until Save.
  const stepper = buildStepper(deps, entry.def, ctx, (value) => repaint(value));
  stepper.addClass("ca-habits-stepper");
  row.appendChild(stepper);
  row.createSpan({ cls: "ca-habits-name", text: name });

  let here: { day: HabitReading; el: HTMLElement } | undefined;
  let lo = 0;
  let hi = 0;
  const repaint = (value: number): void => {
    // THIS ENTRY'S OWN BAR MOVES WITH THE STEPPER, which is `wireHabit`'s
    // argument about the dots applied to the other type. The RANGE is not
    // recomputed: a bar that redrew the whole week's normalisation on every
    // click would make the other six jump around while the reader steps one
    // number, and the week they are reading is the week they opened.
    // AND THE NAME COMES UP WITH IT. `buildStepper` writes a number, so a row
    // the reader has just stepped is logged by definition — there is no path
    // through that control that clears a reading back to nothing.
    row.addClass("is-logged");
    if (here) {
      paintBar(
        here.el,
        { ...here.day, value, written: true },
        lo,
        hi,
        name,
        entry.def.unit
      );
    }
  };

  if (!week.length) return;
  const strip = row.createDiv({ cls: "ca-habit-week ca-habit-spark" });
  const readings = habitWeekReadings(
    app,
    deps.plugin.settings.paths,
    entry.def.id,
    iso
  );
  const values = readings
    .map((r) => r.value)
    .filter((v): v is number => v != null);
  lo = values.length ? Math.min(...values) : 0;
  hi = values.length ? Math.max(...values) : 0;
  for (const day of readings) {
    const bar = strip.createSpan({ cls: "ca-habit-spark-bar" });
    paintBar(bar, day, lo, hi, name, entry.def.unit);
    if (day.iso === iso) here = { day, el: bar };
  }
}

// The door onto the Habits window.
//
// A ROW AT THE END, NOT A ＋ IN THE CORNER, and that is a departure from the
// sketch this section was agreed from. The corner of a full-width card is where
// the week's last column head sits, so a pinned button would land on top of
// Sunday — the Habits cell can pin one because its own top-right is empty by
// construction (a short, left-aligned eyebrow), and this card's is not. A row
// has room for a verb, which the corner never did.
function drawDoor(
  root: HTMLElement,
  deps: EntryControlHost,
  entries: readonly HabitEntry[],
  ctx: MarkdownPostProcessorContext
): void {
  const label = habitsDoorLabel(entries.length);
  const door = root.createEl("button", {
    cls: "ca-habits-door",
    attr: { type: "button", "aria-label": label, title: label },
  });
  setIcon(door.createSpan({ cls: "ca-journal-btn-icon" }), "plus");
  door.createSpan({ text: label });
  // NOT ON A MANAGED TEMPLATE, which is the cell's own refusal and the same
  // reason: a template's tracker list is generated from Settings, so a control
  // that edited it would be writing something the next sync deletes. The rows
  // still draw — a template holding habits still has to show them.
  if (isManagedTemplate(deps.plugin, ctx.sourcePath)) door.disabled = true;
  else door.addEventListener("click", () => openHabitsWindow(deps, entries, ctx));
}
