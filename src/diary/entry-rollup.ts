// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The `entry-rollup` widget: what the entries one rung under this period said.
//
// The gap this fills is the second of the three joints the 2.52 roadmap named.
// A monthly review is authored by hand, and until now the page you write it on
// showed you nothing it is made of: `month-summary` is a day grid over a
// year-of-reviews grid — two calendars and a stats line, aggregating nothing.
// To write August's Highlights you opened thirty-one notes.
//
// So this is the rollup one rung down from the quarter's. The quarter gathers
// three authored monthly reviews; this gathers whatever is one rung under the
// page it is on. Both go through fields.ts, so neither can disagree with the
// other about what an entry contributes — which is the whole reason the registry
// exists.
//
// ONE RUNG, AND FOR A MONTH THAT IS THE WEEKS (1.0.48). The sentence above read
// "this gathers the days underneath one of them", which is what it did on a
// month and is two rungs. See `RUNG_BELOW`.
//
// Scope comes from the host note's period property, exactly as the charts and
// `tasks-table:,period` take theirs, so the widget follows the dashboard's
// navigator without knowing the navigator exists.
//
// The pure half — which days contributed, in what order, with what on them —
// takes plain data and returns plain data, so the grouping is unit-testable
// without a vault. Only `buildEntryRollup` touches Obsidian.

import { setIcon, TFile } from "obsidian";
import { emptyLine } from "../ui/empty";
import type ChronoAnvilPlugin from "../main";
import { formatPeriodLabel, type PeriodBounds } from "../charts/charts";
import { IndexedEntry, readIndex } from "./diary-index";
import { FieldValue, readRollup } from "../trackers/fields";
import { moment, openFile } from "../core/util";

// WHICH KIND OF ENTRY A ROLLUP GATHERS.
//
// Two of the five, not all five. `daily` and `monthly` are the grains that
// hold authored writing beneath another period: a week and a month are written
// FROM their days, a quarter from its months. Weeks under a quarter and
// quarters under a year are review surfaces rather than sources — a quarter
// summarising four weekly reviews is a summary of summaries, which is what
// `recap` is for and does better.
//
// ── THREE OF THE FIVE, BECAUSE A WEEK IS ALSO A SOURCE (1.0.48) ──────────
//
// *"the diary section 'what the entries said' does not look correct on the
// monthly overview dashboard, where it shows the days for the entire month but
// should show the week grains."*
//
// The paragraph above is right about a quarter and was applied one rung too
// far. "A week is a review surface" is a claim about what sits ABOVE a week —
// a quarter, a year — and the scope directly above a week is a MONTH, which is
// the one place a week is the obvious source. The month was reading its
// thirty-one days instead: the only rollup here that reached two rungs down,
// and the reason the section read as a list of somebody's month rather than a
// review of it.
//
// A QUARTER STILL TAKES MONTHS. Nothing about the ladder changed except that
// its middle rung exists.
export type RollupGrain = "daily" | "weekly" | "monthly";

// The spelling the directive takes after the colon, mapped to the index kind.
// `entry-rollup:month`, not `:monthly`, because the period nouns everywhere
// else in the fence language are singular (`month-start`, `tasks-table:…,month`).
const ROLLUP_ARG: Record<string, RollupGrain> = {
  day: "daily",
  week: "weekly",
  month: "monthly",
};

// ONE RUNG DOWN FROM THE HOST, which is what a bare directive now means.
//
// THE ALTERNATIVE WAS A MIGRATION, and this is why it was not taken. The
// composed monthly dashboard writes `entry-rollup` bare, so fixing the grain by
// writing `entry-rollup:week` into the composition fixes it for a vault created
// after this release and for nobody else: a repair is additive at the section
// level — `repairNote` inserts a section a note lacks and never rewrites the
// lines of one it has — so every existing monthly dashboard in every vault
// would have kept gathering days, and the only way to get the fix would have
// been to remove the section and add it back.
//
// AND THE DERIVED DEFAULT IS THE MORE HONEST OF THE TWO ANYWAY. This widget's
// whole scope already comes from the host note's period property rather than
// from its own argument — *"so the widget follows the dashboard's navigator
// without knowing the navigator exists"* — and the grain is the same question
// asked about the same property. A bare directive saying "one rung below
// whatever page I am on" is the sentence that was already true of its bounds.
//
// A READER WHO WANTS THE DAYS STILL WRITES `entry-rollup:day`. That is what the
// argument is for, and it is now the only thing that CAN say so, which is a
// small gain: before this, `:day` and bare were the same line typed two ways.
//
// A YEAR TAKES MONTHS RATHER THAN QUARTERS, breaking the one-rung rule at the
// top on the type's own argument — a quarter is a review surface, and
// `year-stats` reads `monthly` for the same reason. The section declines a year
// outright; this is the answer for a reader who adds the card to one.
const RUNG_BELOW: Record<string, RollupGrain> = {
  week: "daily",
  month: "weekly",
  quarter: "monthly",
  year: "monthly",
};

export function rollupGrainOf(
  rest: string,
  host?: PeriodBounds["unit"] | null
): RollupGrain {
  return (
    ROLLUP_ARG[rest.trim().toLowerCase()] ??
    // `daily` WHEN THE HOST IS UNKNOWN, so a caller with no bounds reads what a
    // bare directive read before this. Nothing in the plugin is such a caller —
    // the widget refuses a note with no period — and a default of "the thing it
    // used to be" is the right answer for one that appears.
    (host ? RUNG_BELOW[host] ?? "daily" : "daily")
  );
}

// THE FOLDER A GRAIN'S ENTRIES LIVE IN, named as a settings key rather than as a
// path so this table needs nothing from settings and the suite can read it.
//
// IT EXISTS BECAUSE THE DISPATCHER'S TERNARY HAD NO THIRD BRANCH. `grain ===
// "monthly" ? diaryMonthly : diaryDaily` is exhaustive over two grains and
// silently wrong over three: a weekly rollup would have watched the daily folder
// and sat still while a week's focus was written underneath it — the same class
// of bug the comment beside it warns about for months.
export const ROLLUP_FOLDER: Record<
  RollupGrain,
  "diaryDaily" | "diaryWeekly" | "diaryMonthly"
> = {
  daily: "diaryDaily",
  weekly: "diaryWeekly",
  monthly: "diaryMonthly",
};

// The noun for one entry of a grain, for the sentences a rollup writes about
// itself. Said once: the empty line names the grain twice and the view named it
// with a ternary that had no room for a third answer.
const GRAIN_NOUN: Record<RollupGrain, string> = {
  daily: "day",
  weekly: "week",
  monthly: "month",
};

// The state class the root wears, so the stylesheet can size the date column for
// what this rollup's dates actually say.
//
// PER WIDGET, NOT PER ROW, which is what keeps the fixed width honest. The date
// column is `width: 42px` and `justify-content: flex-end` precisely so every
// line of text starts on one edge — *"a ragged left margin is what stops a list
// of thirty-one rows scanning"* — and every row inside one rollup is the same
// grain, so a width chosen per grain is still one width per list.
//
// 42px WAS CHOSEN FOR "7" + "Mon" AND NOTHING CHECKED THE OTHERS. A month drew
// "Aug" + "2026" into it and the overflow was clipped from the LEFT, so a
// quarter's rollup read "g 2026" and "p 2026" — the tails of two month names,
// which is a pill that looks like a rendering fault because it is one.
const GRAIN_CLASS: Record<RollupGrain, string> = {
  daily: "is-daily",
  weekly: "is-weekly",
  monthly: "is-monthly",
};

// One day's contribution. `values` holds only the fields that were actually
// written — a day that logged nothing rollupable produces no DayLine at all
// (see rollupDays), so this is never an empty row.
export interface DayLine {
  iso: string;
  path: string;
  title: string;
  values: FieldValue[];
}

// The days in `[start, end]` that wrote something rollupable, oldest first.
//
// Two decisions worth stating.
//
// **Oldest first**, unlike the timeline and every search result in the plugin,
// which are newest-first. Those are retrieval surfaces answering "what happened
// recently"; this is a writing aid answering "how did the month go", and a
// month is read forwards. Reversing it would mean composing a review by
// scrolling up.
//
// **Only days with content.** A month with thirty-one entries of which six
// carry a focus would otherwise render twenty-five blank rows, and a blank row
// is a reminder that you didn't write rather than information — the same
// argument `anniversaries` in diary-index.ts makes for omitting empty years.
// The section head states the ratio instead, which is the honest place for it.
// **Which grain it gathers**, as of 3.11 §5. This read `e.kind !== "daily"`
// and `readRollup(regions, "daily")` with both spellings hardcoded, so the
// widget could only ever roll up days no matter which dashboard hosted it.
// A quarter wanting its three monthly entries had no way to ask.
//
// The parameter defaults to `daily`, so every note written before this reads
// exactly as it did — the argument is additive and the bare directive is
// unchanged.
export function rollupDays(
  entries: IndexedEntry[],
  start: string,
  end: string,
  grain: RollupGrain = "daily"
): DayLine[] {
  const out: DayLine[] = [];
  for (const e of entries) {
    if (e.kind !== grain || e.iso == null) continue;
    if (e.iso < start || e.iso > end) continue;
    const values = readRollup(e.regions, grain).filter(
      (v) => v.items.length > 0 || v.goals.length > 0
    );
    if (!values.length) continue;
    out.push({ iso: e.iso, path: e.path, title: e.title, values });
  }
  return out.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
}

// How many daily entries the period holds at all, so the section head can say
// "6 of 28 days" rather than just "6" — six days written out of twenty-eight
// logged is a different month from six out of six.
export function loggedDays(
  entries: IndexedEntry[],
  start: string,
  end: string,
  grain: RollupGrain = "daily"
): number {
  let n = 0;
  for (const e of entries) {
    if (e.kind !== grain || e.iso == null) continue;
    if (e.iso >= start && e.iso <= end) n++;
  }
  return n;
}

// What a row's date pill says: the figure, the word under or beside it, and the
// tooltip. Pure, so the suite can read a week's pill without a DOM — the same
// split the head of this module states for `rollupDays`.
export interface RollupDateLabel {
  figure: string;
  // "" where the grain needs no second word. A month's pill is the month name.
  unit: string;
  title: string;
}

export function rollupDateLabel(
  iso: string,
  grain: RollupGrain
): RollupDateLabel {
  const m = moment(iso);
  if (grain === "monthly") {
    // ── THE MONTH ALONE, AND NOT THE YEAR (1.0.48) ────────────────────
    //
    // *"im not sure what g or p is hinting at, but I think it and the year can
    // be replaced by a 3 letter shorthand month name."*
    //
    // The `g` and the `p` were "Aug" and "Sep" with their fronts clipped off —
    // see `GRAIN_CLASS`. The year goes with them because it cannot vary inside
    // one of these lists: a quarter holds three months of one year, a year
    // holds twelve, and the head above the list already names the period. A
    // column repeating "2026" down every row was the half of the pill carrying
    // no information, and it was the half taking the width the month name
    // needed.
    return { figure: m.format("MMM"), unit: "", title: m.format("MMMM YYYY") };
  }
  if (grain === "weekly") {
    // ── A WEEK IS ITS DAYS, NOT THE FIRST OF THEM (1.0.48) ────────────
    //
    // *"weeks in month rollup should say the week days (in screenshot it says
    // 7 sept which is just the first day of the week)."*
    //
    // THE FIRST SHIPPED FORM WAS THE START DATE, which is what a week's `iso`
    // is — its `week-start` — and it read as a daily row that had lost its
    // weekday. A month's rollup is four or five of them under a head saying
    // "September 2026", so "7 Sep" above "14 Sep" is a list of Mondays rather
    // than a list of weeks. The span says which days the row is about.
    //
    // AND THE MONTH GOES PLURAL WHERE THE WEEK DOES. A week crossing a month
    // boundary drawn as "28–4 Sep" states a range that runs backwards; drawn as
    // "28–4 / Sep–Oct" it states the one it means. At most one row of a month's
    // rollup can need this.
    //
    // NOT A WEEK NUMBER. `format("W")` and `format("w")` answer to moment's
    // locale, and this plugin lets a reader choose which day a week starts on —
    // so a pill reading "W39" could disagree with the week the row links to.
    // The dates cannot.
    //
    // SEVEN DAYS, COUNTED FROM THE START RATHER THAN RESOLVED. `iso` IS the
    // week-start this rollup filtered on, so the end is arithmetic and needs no
    // second opinion about which day a week begins.
    const end = m.clone().add(6, "days");
    const from = m.format("MMM");
    const to = end.format("MMM");
    return {
      figure: `${m.format("D")}\u2013${end.format("D")}`,
      unit: from === to ? from : `${from}\u2013${to}`,
      // "week of 22 Sep 2026" — `formatPeriodLabel`'s words rather than a format
      // string of this module's, so the tooltip and the head above it agree.
      title: formatPeriodLabel("week", iso),
    };
  }
  return {
    figure: m.format("D"),
    unit: m.format("ddd"),
    title: m.format("dddd D MMMM YYYY"),
  };
}

export function buildEntryRollup(
  plugin: ChronoAnvilPlugin,
  period: PeriodBounds | null,
  grain: RollupGrain = "daily"
): HTMLElement {
  const root = createDiv({
    cls: ["ca-journal-table", "ca-jer-rollup", GRAIN_CLASS[grain]],
  });

  if (!period) {
    // No period property on the host note. Refusing with a reason beats
    // falling back to a trailing window: this widget's whole scope is "the
    // dashboard's period", and a silent default would draw a plausible,
    // unrelated set of days — the failure mode resolveChartWindow's `period`
    // range is documented as having.
    emptyLine(
      root,
      "entry-rollup needs a dashboard period \u2014 put it on a note carrying week-start, month-start, quarter-start or year-start.",
      "ca-jer-empty"
    );
    return root;
  }

  root.createDiv({ cls: "ca-jer-loading", text: "Reading your entries…" });

  void readIndex(plugin).then((entries) => {
    const days = rollupDays(entries, period.start, period.end, grain);
    const logged = loggedDays(entries, period.start, period.end, grain);
    root.empty();
    render(
      root,
      plugin,
      days,
      logged,
      formatPeriodLabel(period.unit, period.start),
      grain
    );
  });

  return root;
}

function render(
  root: HTMLElement,
  plugin: ChronoAnvilPlugin,
  days: DayLine[],
  logged: number,
  periodLabel: string,
  grain: RollupGrain
): void {
  // A light in-widget line, not a second title. The collapsible `header:` bar
  // this widget sits under is the section's primary heading, so repeating it
  // in bold here would be the same words twice — the rule tasks-table's own
  // head states and follows.
  //
  // What this line adds instead is the scope. "18 of 25 entries" on a page
  // showing March is indistinguishable from a widget that has quietly lost
  // most of its rows; naming the period is what stops a scoped widget reading
  // as a broken unscoped one.
  const head = root.createDiv({ cls: "ca-jer-head" });
  const title = head.createDiv({ cls: "ca-jer-title" });
  setIcon(title.createSpan({ cls: "ca-jer-title-icon" }), "pen-line");
  title.createSpan({ text: `Entries · ${periodLabel}` });
  if (logged) {
    head.createSpan({
      cls: "ca-jer-pill",
      text: `${days.length} of ${logged} ${logged === 1 ? "entry" : "entries"}`,
    });
  }

  if (!days.length) {
    emptyLine(
      root,
      logged
        ? `Nothing to gather yet \u2014 this fills in from each ${GRAIN_NOUN[grain]}'s focus, so write one and it'll appear here.`
        : `No entries in this period yet \u2014 each ${GRAIN_NOUN[grain]} you log adds its focus to this list.`,
      "ca-jer-empty"
    );
    return;
  }

  // Whether to label each line with the field it came from. With one
  // rollupable field in play a label on every row is thirty-one repetitions of
  // the same word, so it is omitted — the section title already says what
  // these are. With two or more the labels appear, because then the rows
  // genuinely differ.
  //
  // COUNTED OFF WHAT THE DAYS ACTUALLY WROTE, not off the registry, which is
  // what makes this keep working after 3.11 §4.1. The shipped daily case used
  // to be `focus` alone; days now also roll up `highlights` and `challenges`,
  // so a month whose days wrote more than one of them gets labels and a month
  // whose days only ever set a focus still does not. Had this read
  // `rollupFields(grain).length` it would have switched every rollup in every
  // vault to labelled the moment the registry grew.
  const fieldIds = new Set<string>();
  for (const d of days) for (const v of d.values) fieldIds.add(v.field.id);
  const label = fieldIds.size > 1;

  const list = root.createDiv({ cls: "ca-jer-days" });
  for (const day of days) {
    const row = list.createDiv({ cls: "ca-jer-day" });

    // The date is the link. A rollup is a reading surface that sends you to
    // the entry to change it — the same outward write direction the quarter's
    // month cards have, and the reason a derived page stays derived.
    const pill = rollupDateLabel(day.iso, grain);
    const date = row.createEl("a", {
      cls: "ca-jer-date",
      attr: { title: day.title || pill.title },
    });
    date.createSpan({ cls: "ca-jer-date-day", text: pill.figure });
    // NO EMPTY SPAN WHERE THERE IS NO WORD. A month's pill is the month name
    // and nothing else, and a `gap`ped flex row with a zero-width child is a
    // pill sitting 5px off the edge every other row is aligned to.
    if (pill.unit) date.createSpan({ cls: "ca-jer-date-dow", text: pill.unit });
    date.addEventListener("click", (evt) => {
      evt.preventDefault();
      const file = plugin.app.vault.getAbstractFileByPath(day.path);
      if (file instanceof TFile) void openFile(plugin.app, file);
    });

    const lines = row.createDiv({ cls: "ca-jer-lines" });
    for (const v of day.values) {
      for (const item of v.items) {
        const line = lines.createDiv({ cls: "ca-jer-line" });
        if (label) {
          line.createSpan({
            cls: "ca-jer-line-key",
            text: v.field.rollupNoun ?? v.field.label,
          });
        }
        line.createSpan({ cls: "ca-jer-line-text", text: item });
      }
      for (const g of v.goals) {
        const line = lines.createDiv({
          cls: "ca-jer-line ca-jer-goal" + (g.done ? " is-done" : ""),
        });
        setIcon(
          line.createSpan({ cls: "ca-jer-goal-icon" }),
          g.done ? "check-square" : "square"
        );
        line.createSpan({ cls: "ca-jer-line-text", text: g.text });
      }
    }
  }
}
