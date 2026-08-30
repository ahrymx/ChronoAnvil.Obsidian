// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The `period-nav` widget: the weekly/monthly dashboards' date navigator.
//
// It is the dashboard counterpart to a diary entry's `entry-header` nav — the
// same visual family (a left-divided strip of a prev pill, a date-picker pill,
// and a next pill) reusing the very same `.ca-jeh-nav` / `.ca-jeh-navpill` /
// `.ca-jeh-datenav` chrome — so the overviews and the entries read as one system.
// Below the strip sits one more thing an entry has no need for: a standalone
// "This Week" / "This Month" button that jumps straight back to the current
// period (2.23; previously this lived as a pinned row inside the dropdown —
// the dropdown itself is now the entry picker's list 1:1, see
// entryheader.ts::buildDatePicker, and "jump to now" is its own affordance).
//
// The difference from the entry nav is behaviour, not looks. An entry's
// picker opens a different *note*; a dashboard's picker re-scopes the in-page
// summary by writing this note's `week-start` / `month-start` property (the
// week/month summaries are live and recompute off it). The dropdown lists the
// periods you've actually journaled — weeks/months that contain daily
// entries, plus any month with a review note — always including the current
// and currently-selected period so there's a row that lines up with "now".
//
//   ```chronoanvil
//   period-nav:week      (on the Weekly Overview — drives `week-start`)
//   period-nav:month     (on the Monthly Overview — drives `month-start`)
//   period-nav:quarter   (on the Quarterly Overview — drives `quarter-start`)
//   ```

import { App, MarkdownPostProcessorContext, setIcon, TFile } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import {
  frontmatterOf,
  isoDate,
  moment,
  quarterMonths,
  quarterOfMonth,
} from "../core/util";
import { entriesOfGrain } from "./lineage";
import type { PeriodProp, PeriodUnit } from "./diary";

export type Unit = "week" | "month" | "quarter" | "year";

interface PeriodMeta {
  prop: PeriodProp;
  momentUnit: PeriodUnit;
}

const META: Record<Unit, PeriodMeta> = {
  week: { prop: "week-start", momentUnit: "isoWeek" },
  month: { prop: "month-start", momentUnit: "month" },
  quarter: { prop: "quarter-start", momentUnit: "quarter" },
  year: { prop: "year-start", momentUnit: "year" },
};

function metaFor(unit: Unit): PeriodMeta {
  return META[unit];
}

// Prose for the stepper's tooltips and the "jump to now" button, per unit.
const NOUN: Record<Unit, string> = {
  week: "week",
  month: "month",
  quarter: "quarter",
  year: "year",
};
// The period's VALUE, as the headline says it: short, self-locating where it
// can be, and the same shape on the first day of a period as on the last.
//
// SEPARATE FROM THE SPAN the banner prints above it. The two answer different
// questions — "what stretch of days is this" and "which one of these is it" —
// and the title used to try to be both, which is why it was long enough to wrap
// and why it changed shape as a period ran ("Jul – Sep so far").
//
// `Week 31` is the one that needs its span line to be placed, and it keeps the
// pattern anyway: a headline that needs its subtitle costs less than one grain
// out of four not matching the other three.
export const valueLabel = (unit: Unit, at: ReturnType<typeof moment>): string => {
  if (unit === "week") return `Week ${at.isoWeek()}`;
  if (unit === "month") return at.format("MMMM YYYY");
  if (unit === "quarter") {
    return `Q${Math.floor(at.month() / 3) + 1} ${at.format("YYYY")}`;
  }
  return at.format("YYYY");
};

// The period's SPAN, as the band prints it above the value.
//
// HERE, BESIDE `valueLabel`, AND THAT IS THE POINT OF THE FUNCTION. 3.5 split
// the headline into a span and a value on the argument that they answer
// different questions, and then wrote the four spans at four call sites in
// three files while the four values stayed here. Nothing was in a position to
// notice that three of the four spans said the year the value beside them was
// already saying — `1 Aug – 31 Aug 2026` above `August 2026`, `Jul – Sep 2026
// so far` above `Q3 2026` — or that monthly's said its own month twice.
//
// THE RULE: the span says what the value cannot. The value carries the year at
// three grains out of four, so the span drops it at those three; `Week 31`
// carries neither a year nor a month, so the week's span is the one that keeps
// the year, and it is the only line on that page that can.
//
// NO "SO FAR" HERE ANY MORE. The quarter's span used to change shape as the
// quarter ran, which is exactly the wobble the 3.5 split existed to remove from
// the headline — and the stats line one row down already says "so far" off the
// same bounds. The span states the stretch of days the page is ABOUT; how much
// of it has happened is the next line's job.
//
// The year is the exception on both counts, and deliberately: `2026` cannot
// carry a date range at all, so its span is the only one that reports elapsed
// days rather than the period's own bounds.
export interface ElapsedSpan {
  end: string; // last day the page counts, ISO
  days: number;
}

export function periodSpan(
  unit: Unit,
  at: ReturnType<typeof moment>,
  elapsed?: ElapsedSpan
): string {
  if (unit === "week") {
    // The only span that keeps a year, because `Week 31` is the only value
    // that has nowhere to put one. The weekday names went with it: `Mon` and
    // `Sun` restate what "week" means, and the days table below names all
    // seven.
    return `${at.format("D MMM")} – ${at.clone().endOf("isoWeek").format("D MMM YYYY")}`;
  }
  if (unit === "month") {
    // `1 – 31 August`, not `1 Aug – 31 Aug 2026`: one month name for a range
    // inside one month, and the year is on the line below.
    return `${at.format("D")} – ${at.clone().endOf("month").format("D MMMM")}`;
  }
  if (unit === "quarter") {
    const start = at.clone().startOf("quarter");
    return `${start.format("D MMM")} – ${start.clone().endOf("quarter").format("D MMM")}`;
  }
  // A year that has not begun has no stretch of days to name. The wording is
  // `renderPeriodStats`'s, verbatim, because it is the same sentence one grain
  // down.
  if (!elapsed || elapsed.days === 0) return "Hasn't started yet";
  const from = at.clone().startOf("year").format("D MMMM");
  const to = moment(elapsed.end).format("D MMMM");
  return `${from} – ${to} · ${elapsed.days} ${
    elapsed.days === 1 ? "day" : "days"
  } elapsed`;
}

const NOW_LABEL: Record<Unit, string> = {
  week: "This Week",
  month: "This Month",
  quarter: "This Quarter",
  // The year had no "now" affordance at all before 2.52: `year-nav` was a
  // bounded stepper over the years that happened to hold entries, with no way
  // back to the current one except stepping.
  year: "This Year",
};

// The canonical key for the period a date falls in: "YYYY-MM" for months,
// the ISO-week Monday ("YYYY-MM-DD") for weeks. Keys sort lexicographically
// within a unit, which is the order the dropdown uses (newest first).
function keyOf(unit: Unit, iso: string): string {
  if (unit === "year") return iso.slice(0, 4);
  if (unit === "month") return iso.slice(0, 7);
  if (unit === "quarter") return quarterOfMonth(iso.slice(0, 7));
  return moment(iso).startOf("isoWeek").format("YYYY-MM-DD");
}

// The frontmatter date to write for a given period key (start of the period).
function startFor(unit: Unit, key: string): string {
  if (unit === "year") return `${key}-01-01`;
  if (unit === "month") return `${key}-01`;
  if (unit === "quarter") return `${quarterMonths(key)[0]}-01`;
  return key;
}

// The dropdown row's primary label (carries the year).
function rowLabel(unit: Unit, key: string): string {
  if (unit === "year") return key;
  if (unit === "month") return moment(`${key}-01`).format("MMMM YYYY");
  if (unit === "quarter") {
    const months = quarterMonths(key);
    const from = moment(`${months[0]}-01`).format("MMM");
    const to = moment(`${months[2]}-01`).format("MMM");
    return `Q${key.slice(6)} ${key.slice(0, 4)} · ${from}–${to}`;
  }
  const s = moment(key);
  const e = s.clone().add(6, "days");
  const startFmt = s.month() === e.month() ? s.format("D") : s.format("D MMM");
  return `${startFmt}–${e.format("D MMM YYYY")}`;
}

interface PeriodOption {
  key: string;
  count: number; // daily entries logged in this period
}

// Every period worth listing: those containing daily entries (with a count),
// every month that has a review note, and always the current + selected period
// so the user can jump back to "now". Newest first.
function periodOptions(
  plugin: ChronoAnvilPlugin,
  unit: Unit,
  selKey: string
): PeriodOption[] {
  const app = plugin.app;
  const paths = plugin.settings.paths;
  const counts = new Map<string, number>();

  for (const f of entriesOfGrain(app, paths, "daily")) {
    const d = isoDate(frontmatterOf(app, f)["journal-date"]);
    if (!d) continue;
    const k = keyOf(unit, d);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const keys = new Set<string>(counts.keys());

  // Months with a review note but no daily entries still deserve a row — and
  // so does the quarter or year that contains one. A year in which you wrote
  // twelve reviews and no daily entries is exactly the year worth revisiting,
  // and before 2.52 the year picker (`buildYearNav`) listed years by daily
  // entries alone, so that year did not appear in it at all.
  if (unit === "month" || unit === "quarter" || unit === "year") {
    for (const f of entriesOfGrain(app, paths, "monthly")) {
      const fm = frontmatterOf(app, f);
      const raw = fm["month"] ? String(fm["month"]) : isoDate(fm["journal-date"]) ?? "";
      const k = raw.slice(0, 7);
      if (!k) continue;
      keys.add(
        unit === "quarter"
          ? quarterOfMonth(k)
          : unit === "year"
            ? k.slice(0, 4)
            : k
      );
    }
  }

  keys.add(selKey);
  keys.add(keyOf(unit, moment().format("YYYY-MM-DD")));

  return Array.from(keys)
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map((key) => ({ key, count: counts.get(key) ?? 0 }));
}

// A single icon-only chevron — one end of the segmented stepper. `side` picks
// the rounded outer edge so the three segments read as one connected control,
// matching the entry header's own arrows.
function navPill(
  parent: HTMLElement,
  icon: string,
  label: string,
  side: "left" | "right",
  onClick: () => void
): void {
  const sideCls = side === "left" ? "ca-jeh-seg-start" : "ca-jeh-seg-end";
  const pill = parent.createEl("a", {
    cls: `ca-jeh-navpill ${sideCls}`,
    attr: { "aria-label": label, title: label },
  });
  setIcon(pill, icon);
  pill.addEventListener("click", (evt) => {
    evt.preventDefault();
    onClick();
  });
}

// Set the footer button's "you have navigated away" cue from inside the strip.
//
// Scoped to the BLOCK: from the strip, up to the fence's own container, and
// down to the one button. Outside a masthead — a bare `period-nav` in some
// other note — there is no button, and this does nothing rather than reaching
// into the page. The search still never leaves the fence, which is the property
// this scoping is for.
//
// NOT `.ca-journal-overview-card`, WHICH IS A FRAME AND NOT A CONTAINER (4.1 §4).
// That class is the composite card, and `frame: section` withholds it — so on
// the diary dashboard's `This month` the walk found nothing and the button
// never lit up. The button itself is drawn either way, because `openActionsBar`
// guards on `isOverviewCard`, which is a fact about the fence's CONTENT and is
// set from `OVERVIEW_KINDS` regardless of frame. Two conditions that used to
// agree by accident, told apart by the modifier — the same mistake as the two
// CSS rules 4.1.1 fixed, and the reason to reach for the class that survives
// all three frames. `.ca-journal-widget-block` is that class: §4 names keeping it
// as the one rule every frame value has to honour.
function syncNowButton(from: HTMLElement, browsing: boolean): void {
  const block = from.closest(".ca-journal-widget-block");
  const btn = block?.querySelector(".ca-jpn-now-btn");
  if (btn instanceof HTMLElement) btn.toggleClass("is-browsing", browsing);
}

// The "This Week" / "This Month" / "This Quarter" / "This Year" button, for the
// masthead card's footer.
//
// BUILT BY THE FOOTER'S OWNER, which is `widgets.ts`, because the footer bar is
// the postprocessor's and the summary above it is a `LiveWidget`'s. That is the
// same rule the period button itself follows and the same rule 3.2 patch 6
// learned the hard way; the difference is only that this control's LOGIC lives
// here, with the rest of the period logic, rather than in the file that happens
// to own its parent element.
//
// It reads its own initial state instead of being handed one. The strip is
// built before this and cannot see it yet, so a button that waited to be told
// would render in the wrong state until the reader navigated — which is exactly
// when the cue stops being useful.
//
// It has no update path of its own, and does not need one: every route that
// changes the period writes the note's frontmatter, and all four summaries are
// live on their own note, so the strip is rebuilt and `render()` syncs this
// button on its way through.
export function buildNowButton(
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext,
  unit: Unit
): HTMLElement {
  const { prop, momentUnit } = metaFor(unit);
  const btn = createEl("button", {
    cls: "ca-journal-btn-subtle ca-jpn-now-btn",
    text: NOW_LABEL[unit],
    attr: { type: "button", "aria-label": `Show the current ${NOUN[unit]}` },
  });

  const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (file instanceof TFile) {
    const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const seed = moment(isoDate(fm[prop]) ?? undefined);
    const at = (seed.isValid() ? seed : moment()).startOf(momentUnit);
    const nowKey = keyOf(unit, moment().format("YYYY-MM-DD"));
    btn.toggleClass("is-browsing", keyOf(unit, at.format("YYYY-MM-DD")) !== nowKey);
  }

  btn.addEventListener("click", (evt) => {
    evt.preventDefault();
    void plugin.diary.setPeriod(
      ctx.sourcePath,
      prop,
      momentUnit,
      moment().startOf(momentUnit).format("YYYY-MM-DD")
    );
  });
  return btn;
}

// The period a dashboard is currently showing.
//
// ITS OWN `<unit>-start` PROPERTY, FALLING BACK TO NOW — and the fallback is the
// half worth stating: a period dashboard that has never been navigated has no
// such property at all, and it shows the current period. A reader of `month:`
// would get nothing on exactly the note that draws August (4.51.7 found this on
// the Monthly overview, where the head printed the FILENAME because
// `entryDateKey` reads `CLASS_DEFS.monthly.dateProperty` — which is `month`,
// the ENTRY's property, not this one).
//
// EXPORTED SO THE HEAD CAN NAME THE PAGE. The band and the head must agree
// about which August this is, and one function is how.
export function periodAnchor(
  app: App,
  file: TFile,
  unit: Unit
): ReturnType<typeof moment> {
  const { momentUnit } = metaFor(unit);
  const fm = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  const seed = moment(isoDate(fm[metaFor(unit).prop]) ?? undefined);
  return (seed.isValid() ? seed : moment()).startOf(momentUnit);
}

export function buildPeriodNav(
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext,
  unit: Unit
): HTMLElement {
  const app = plugin.app;
  const { prop, momentUnit } = metaFor(unit);
  // The strip (prev pill / picker / next pill) and the standalone "This
  // Week"/"This Month" button beneath it are two separate controls now, not
  // one — stacked in their own wrapper so the button reads as a distinct
  // affordance under the navigator rather than a fourth segment welded to it.
  const outer = createDiv({ cls: "ca-journal-period-nav-stack" });
  const wrap = outer.createDiv({ cls: "ca-journal-period-nav ca-jeh-nav ca-jeh-seg" });

  const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(file instanceof TFile)) return outer;

  // The selected period is tracked here rather than re-read from the metadata
  // cache after each write — `processFrontMatter` resolves before the cache's
  // "changed" event lands, so a re-read could show the pre-write value. Seed it
  // from the note once; every shift/pick advances it in lock-step with the file.
  let cur = periodAnchor(app, file, unit);

  const jumpTo = async (next: ReturnType<typeof moment>): Promise<void> => {
    cur = next.startOf(momentUnit);
    await plugin.diary.setPeriod(ctx.sourcePath, prop, momentUnit, cur.format("YYYY-MM-DD"));
    render();
  };

  // NO "JUMP TO NOW" BUTTON HERE ANY MORE — 3.6 patch 7. It moved to the
  // card's footer, on the left of "Keep this week", and it is BUILT there
  // rather than moved there for the reason 3.2 already paid for: the footer
  // bar belongs to the postprocessor and this stack belongs to a `LiveWidget`,
  // so a button parented here and re-parented into the bar would be recreated
  // on every rebuild and appended to a bar that is never cleared. One per
  // metadata change, stacking forever. See `buildNowButton` below.
  // Rebuild the strip from the tracked period each time it changes, so the
  // trigger label + dropdown marks stay in sync after a shift or a pick.
  const render = (): void => {
    wrap.empty();

    const selKey = keyOf(unit, cur.format("YYYY-MM-DD"));
    const nowKey = keyOf(unit, moment().format("YYYY-MM-DD"));
    // The footer's button is not ours, but its "you have navigated away" state
    // is a fact about this strip, and this is the only code that knows when it
    // changes. A DOM lookup rather than a callback registry because the two
    // controls are parts of ONE card and the search never leaves it — and
    // because a registry would need a lifecycle, which is the thing that goes
    // wrong when one of the two is rebuilt and the other is not.
    //
    // Misses on the very first render, when the summary is built and the
    // footer bar below it does not exist yet. That is why `buildNowButton`
    // computes its own initial state rather than waiting to be told.
    syncNowButton(outer, selKey !== nowKey);

    navPill(wrap, "chevron-left", `Previous ${NOUN[unit]}`, "left", () =>
      void jumpTo(cur.clone().subtract(1, momentUnit))
    );

    buildPicker(wrap, selKey, nowKey, (key) => jumpTo(moment(startFor(unit, key))));

    navPill(wrap, "chevron-right", `Next ${NOUN[unit]}`, "right", () =>
      void jumpTo(cur.clone().add(1, momentUnit))
    );
  };

  // The "Select period" pill + its scrollable dropdown — the dashboards' analog
  // of the entry header's date picker, wired to write the period instead of
  // opening a note. The list itself is now the entry picker's list 1:1 (see
  // entryheader.ts::buildDatePicker) — no pinned "This week"/"This month" row
  // of its own; that's the standalone button's job now.
  const buildPicker = (
    parent: HTMLElement,
    selKey: string,
    nowKey: string,
    onPick: (key: string) => Promise<void>
  ): void => {
    const nav = parent.createDiv({ cls: "ca-jeh-datenav" });

    // THE TRIGGER IS THE HEADLINE NOW, and the comment this replaces is the
    // argument for it read backwards. It said the trigger was icon-only because
    // "the banner's `.ca-job-title` right above this already carries the period,
    // so echoing it again here was redundant" — which was true, and the fix for
    // a label printed twice is to keep the copy that can be pressed. The band
    // no longer prints a title; this is it.
    //
    // Still a `<button>`, so it is focusable, reachable by keyboard and
    // announced as a control without anything being added for it — which is the
    // whole reason to make the existing trigger big rather than to make the
    // existing title clickable.
    //
    // Rebuilt on every `render()`, so the label tracks `cur` with no separate
    // update path to forget.
    const trigger = nav.createEl("button", {
      cls: "ca-jeh-datenav-trigger ca-jeh-seg-mid ca-jpn-value",
      attr: { "aria-label": "Select period", title: "Select period", type: "button" },
    });
    trigger.createSpan({ cls: "ca-jpn-value-label", text: valueLabel(unit, cur) });
    setIcon(trigger.createSpan({ cls: "ca-jeh-datenav-caret" }), "chevrons-up-down");

    let menu: HTMLElement | null = null;
    const closeMenu = (): void => {
      if (!menu) return;
      menu.remove();
      menu = null;
      trigger.removeClass("is-open");
      document.removeEventListener("click", onDocClick, true);
      document.removeEventListener("keydown", onKey, true);
    };
    const onDocClick = (evt: MouseEvent): void => {
      if (!nav.contains(evt.target as Node)) closeMenu();
    };
    const onKey = (evt: KeyboardEvent): void => {
      if (evt.key === "Escape") {
        evt.preventDefault();
        closeMenu();
      }
    };

    const pick = (key: string): void => {
      closeMenu();
      void onPick(key);
    };

    const openMenu = (): void => {
      menu = nav.createDiv({ cls: "ca-jeh-datenav-menu" });
      trigger.addClass("is-open");
      const list = menu.createDiv({ cls: "ca-jeh-datenav-list" });

      const options = periodOptions(plugin, unit, selKey);
      let currentRow: HTMLElement | null = null;
      for (const opt of options) {
        const isCurrent = opt.key === selKey;
        const row = list.createEl("button", {
          cls: "ca-jeh-datenav-row" + (isCurrent ? " is-current" : ""),
          attr: { type: "button", title: rowLabel(unit, opt.key) },
        });
        const text = row.createDiv({ cls: "ca-jeh-datenav-row-text" });
        text.createSpan({ cls: "ca-jeh-datenav-row-label", text: rowLabel(unit, opt.key) });
        const bits: string[] = [];
        if (opt.count > 0) bits.push(`${opt.count} ${opt.count === 1 ? "day" : "days"} logged`);
        if (opt.key === nowKey) bits.push("now");
        if (bits.length) row.createDiv({ cls: "ca-jeh-datenav-row-sub", text: bits.join(" · ") });
        if (isCurrent) {
          currentRow = row;
          setIcon(row.createSpan({ cls: "ca-jeh-datenav-row-mark" }), "check");
        }
        row.addEventListener("click", () => void pick(opt.key));
      }

      if (currentRow) currentRow.scrollIntoView({ block: "center" });

      setTimeout(() => {
        document.addEventListener("click", onDocClick, true);
        document.addEventListener("keydown", onKey, true);
      }, 0);
    };

    trigger.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      if (menu) closeMenu();
      else openMenu();
    });
  };

  render();
  return outer;
}
