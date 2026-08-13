// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The `entry-rollup` widget: what the days in this period actually said.
//
// The gap this fills is the second of the three joints the 2.52 roadmap named.
// A monthly review is authored by hand, and until now the page you write it on
// showed you nothing it is made of: `month-summary` is a day grid over a
// year-of-reviews grid — two calendars and a stats line, aggregating nothing.
// To write August's Highlights you opened thirty-one notes.
//
// So this is the rollup one rung down from the quarter's. The quarter gathers
// three authored monthly reviews; this gathers the days underneath one of them.
// Both go through fields.ts, so neither can disagree with the other about what
// an entry contributes — which is the whole reason the registry exists.
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
import type AlmanacPlugin from "../main";
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
export type RollupGrain = "daily" | "monthly";

// The spelling the directive takes after the colon, mapped to the index kind.
// `entry-rollup:month`, not `:monthly`, because the period nouns everywhere
// else in the fence language are singular (`month-start`, `tasks-table:…,month`).
const ROLLUP_ARG: Record<string, RollupGrain> = {
  day: "daily",
  month: "monthly",
};

export function rollupGrainOf(rest: string): RollupGrain {
  return ROLLUP_ARG[rest.trim().toLowerCase()] ?? "daily";
}

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

export function buildEntryRollup(
  plugin: AlmanacPlugin,
  period: PeriodBounds | null,
  grain: RollupGrain = "daily"
): HTMLElement {
  const root = createDiv({ cls: "journal-table jer-rollup" });

  if (!period) {
    // No period property on the host note. Refusing with a reason beats
    // falling back to a trailing window: this widget's whole scope is "the
    // dashboard's period", and a silent default would draw a plausible,
    // unrelated set of days — the failure mode resolveChartWindow's `period`
    // range is documented as having.
    emptyLine(
      root,
      "entry-rollup needs a dashboard period \u2014 put it on a note carrying week-start, month-start, quarter-start or year-start.",
      "jer-empty"
    );
    return root;
  }

  root.createDiv({ cls: "jer-loading", text: "Reading your entries…" });

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
  plugin: AlmanacPlugin,
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
  const head = root.createDiv({ cls: "jer-head" });
  const title = head.createDiv({ cls: "jer-title" });
  setIcon(title.createSpan({ cls: "jer-title-icon" }), "pen-line");
  title.createSpan({ text: `Entries · ${periodLabel}` });
  if (logged) {
    head.createSpan({
      cls: "jer-pill",
      text: `${days.length} of ${logged} ${logged === 1 ? "entry" : "entries"}`,
    });
  }

  if (!days.length) {
    emptyLine(
      root,
      logged
        ? `Nothing to gather yet \u2014 this fills in from each ${
            grain === "monthly" ? "month" : "day"
          }'s focus, so write one and it'll appear here.`
        : `No entries in this period yet \u2014 each ${
            grain === "monthly" ? "month" : "day"
          } you log adds its focus to this list.`,
      "jer-empty"
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

  const list = root.createDiv({ cls: "jer-days" });
  for (const day of days) {
    const row = list.createDiv({ cls: "jer-day" });

    // The date is the link. A rollup is a reading surface that sends you to
    // the entry to change it — the same outward write direction the quarter's
    // month cards have, and the reason a derived page stays derived.
    const m = moment(day.iso);
    const date = row.createEl("a", {
      cls: "jer-date",
      attr: {
        title:
          day.title ||
          m.format(grain === "monthly" ? "MMMM YYYY" : "dddd D MMMM YYYY"),
      },
    });
    // THE PILL READS AS ITS GRAIN. A monthly entry's `iso` is its
    // `month-start`, so the daily formatting would have rendered every row as
    // "1 / Mon" — twelve identical-looking pills whose only real content was
    // the day-of-week the month happened to begin on. Nothing would have
    // errored; the widget would simply have been unreadable, which is the
    // failure a grain argument added without touching the view would produce.
    if (grain === "monthly") {
      date.createSpan({ cls: "jer-date-day", text: m.format("MMM") });
      date.createSpan({ cls: "jer-date-dow", text: m.format("YYYY") });
    } else {
      date.createSpan({ cls: "jer-date-day", text: m.format("D") });
      date.createSpan({ cls: "jer-date-dow", text: m.format("ddd") });
    }
    date.addEventListener("click", (evt) => {
      evt.preventDefault();
      const file = plugin.app.vault.getAbstractFileByPath(day.path);
      if (file instanceof TFile) void openFile(plugin.app, file);
    });

    const lines = row.createDiv({ cls: "jer-lines" });
    for (const v of day.values) {
      for (const item of v.items) {
        const line = lines.createDiv({ cls: "jer-line" });
        if (label) {
          line.createSpan({
            cls: "jer-line-key",
            text: v.field.rollupNoun ?? v.field.label,
          });
        }
        line.createSpan({ cls: "jer-line-text", text: item });
      }
      for (const g of v.goals) {
        const line = lines.createDiv({
          cls: "jer-line jer-goal" + (g.done ? " is-done" : ""),
        });
        setIcon(
          line.createSpan({ cls: "jer-goal-icon" }),
          g.done ? "check-square" : "square"
        );
        line.createSpan({ cls: "jer-line-text", text: g.text });
      }
    }
  }
}
