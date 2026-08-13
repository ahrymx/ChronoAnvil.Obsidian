// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { App, Notice, TFile } from "obsidian";
import type AlmanacPlugin from "../main";
import { promptText } from "../ui/modals";
import { CLASS_DEFS } from "../trackers/trackers";
import type { TrackerClass } from "../trackers/trackers";
import { ENTRY_EVENTS_PROPERTY } from "../core/constants";
import { eventsOnDay } from "../events/events";
import { readEvents } from "../events/eventstore";
import {
  frontmatterOf,
  createFileEnsuringFolders,
  getFile,
  isoDate,
  moment,
  openFile,
  fillDailyTemplate,
  fillMonthlyTemplate,
  readTemplate,
  today,
  thisMonth,
} from "../core/util";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

// The review-scope cursor properties, and the moment unit each one snaps to.
// These name periods you *read over*; the periods you *write in* are
// TrackerClass in trackers.ts, and the two sets are deliberately different
// (see the axis table above PeriodBounds in charts.ts). A scope needs nothing
// but a property on one dashboard note — no folder, no template, no class —
// which is why `quarter` was added here in 2.26 without touching CLASS_DEFS.
//
// Quarter steps through moment's own `quarter` unit rather than util.ts's
// `shiftQuarter`, which is not a duplicated rollover: `shiftQuarter` works in
// "YYYY-Qn" key space (the activity chart never holds a date), while this
// function works in date space exactly as week/month/year already do. Routing
// through it here would mean date → key → shift → date for no gain.
export type PeriodProp =
  | "week-start"
  | "month-start"
  | "quarter-start"
  | "year-start";
export type PeriodUnit = "isoWeek" | "month" | "quarter" | "year";

export class Diary {
  constructor(private app: App, private plugin: AlmanacPlugin) {}

  private get paths() {
    return this.plugin.settings.paths;
  }

  // ── Daily ─────────────────────────────────────────────────────────────
  // `reveal: false` creates (and stamps) the entry without opening it, for
  // callers that need the file to exist but must not steal focus — quick
  // capture, which exists precisely so you don't leave what you were doing.
  // Everything else defaults to opening, as before.
  async openOrCreateDay(
    dateStr: string,
    opts: { reveal?: boolean } = {}
  ): Promise<TFile | null> {
    if (!DATE_RE.test(dateStr)) {
      new Notice("Use the format YYYY-MM-DD");
      return null;
    }
    const path = `${this.paths.diaryDaily}/Day-${dateStr}.md`;
    let file = getFile(this.app, path);
    if (!file) {
      const tpl = await readTemplate(
        this.app,
        `${this.paths.templatesDiary}/Daily.md`
      );
      if (tpl == null) {
        new Notice("Daily template missing — run 'Set up / repair vault'.");
        return null;
      }
      file = await createFileEnsuringFolders(
        this.app,
        path,
        fillDailyTemplate(tpl, dateStr)
      );
      await this.stampEvents(file, dateStr);
    }
    if (opts.reveal !== false) await openFile(this.app, file);
    return file;
  }

  // Record the ids of any special events falling on this date in the new
  // entry's frontmatter, so the note itself knows it was a birthday without
  // having to consult the events list.
  //
  // On creation only, deliberately. The alternative — re-syncing on every open
  // — would mean the plugin silently rewriting old entries whenever the events
  // list changed, and an entry is a record of a day, not a live view of one. An
  // event added later simply won't appear in an entry written before it; the
  // calendars, which read the events list directly, show it regardless.
  //
  // Note the direction of the dependency: entries read events, never the
  // reverse. Nothing here can create an entry — this only ever runs on a file
  // that was just created because the user asked for it.
  private async stampEvents(file: TFile, dateStr: string): Promise<void> {
    if (!this.plugin.settings.eventsEnabled) return;
    const ids = eventsOnDay(readEvents(this.app, this.plugin), dateStr).map(
      (e) => e.id
    );
    if (!ids.length) return;
    try {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        fm[ENTRY_EVENTS_PROPERTY] = ids;
      });
    } catch (e) {
      // A failed stamp must not cost the user the entry they asked for.
      console.error("[Almanac] could not stamp events onto the new entry", e);
    }
  }

  async openToday(): Promise<void> {
    await this.openOrCreateDay(today());
  }

  async newDiaryEntry(): Promise<void> {
    const input = await promptText(
      this.app,
      "Diary date (YYYY-MM-DD)",
      "YYYY-MM-DD",
      today()
    );
    if (input == null) return;
    const d = input.trim();
    if (!DATE_RE.test(d)) {
      new Notice("Use the format YYYY-MM-DD");
      return;
    }
    await this.openOrCreateDay(d);
  }

  // ── Monthly ───────────────────────────────────────────────────────────
  async openOrCreateMonth(monthStr: string): Promise<TFile | null> {
    if (!MONTH_RE.test(monthStr)) {
      new Notice("Use the format YYYY-MM");
      return null;
    }
    const path = `${this.paths.diaryMonthly}/Month-${monthStr}.md`;
    let file = getFile(this.app, path);
    if (!file) {
      const tpl = await readTemplate(
        this.app,
        `${this.paths.templatesDiary}/Monthly Entry.md`
      );
      if (tpl == null) {
        new Notice("Monthly template missing — run 'Set up / repair vault'.");
        return null;
      }
      file = await createFileEnsuringFolders(
        this.app,
        path,
        fillMonthlyTemplate(tpl, monthStr)
      );
    }
    await openFile(this.app, file);
    return file;
  }

  async openThisMonth(): Promise<void> {
    await this.openOrCreateMonth(thisMonth());
  }

  async newMonthlyEntry(): Promise<void> {
    const input = await promptText(
      this.app,
      "Month (YYYY-MM)",
      "YYYY-MM",
      thisMonth()
    );
    if (input == null) return;
    const m = input.trim();
    if (!MONTH_RE.test(m)) {
      new Notice("Use the format YYYY-MM");
      return;
    }
    await this.openOrCreateMonth(m);
  }

  // ── Per-period entries (2.57) ────────────────────────────────────────
  //
  // A weekly or quarterly ENTRY, as opposed to the single re-scoping dashboard
  // of the same name. The dashboard answers "what does this week look like"
  // and changes what it means when you press next; an entry is a note about one
  // specific week that keeps meaning that forever. Bridges need the second kind
  // to freeze into — see the note on `diaryWeekly` in constants.ts.
  //
  // Created with the period property already set, which is the entire point: it
  // is what makes the note *about* that period rather than a second dashboard
  // that happens to sit in a folder.
  async openOrCreatePeriodEntry(
    unit: "week" | "quarter" | "year",
    startIso: string
  ): Promise<TFile | null> {
    const p = this.paths;
    const at = moment(startIso);
    // Prefixed like `Day-` and `Month-`, so a filename states its grain without
    // needing its folder to say it. The bare `2026-W30.md` this shipped with
    // first was the odd one out in a naming scheme five files deep.
    const spec = {
      week: {
        cls: "weekly" as TrackerClass,
        folder: p.diaryWeekly,
        prop: "week-start" as PeriodProp,
        name: `Week-${at.format("YYYY-[W]WW")}`,
      },
      quarter: {
        cls: "quarterly" as TrackerClass,
        folder: p.diaryQuarterly,
        prop: "quarter-start" as PeriodProp,
        name: `Quarter-${at.format("YYYY")}-Q${Math.floor(at.month() / 3) + 1}`,
      },
      year: {
        cls: "yearly" as TrackerClass,
        folder: p.diaryYearly,
        prop: "year-start" as PeriodProp,
        name: `Year-${at.format("YYYY")}`,
      },
    }[unit];

    const path = `${spec.folder}/${spec.name}.md`;
    let file = getFile(this.app, path);
    if (!file) {
      // SEEDED FROM THE CLASS TEMPLATE. The first version wrote bare
      // frontmatter and argued there was "nothing worth templating" — which was
      // wrong twice over. The note came out empty, so the button that exists to
      // give a bridge somewhere to live created a note with nowhere to put one;
      // and with no `journal:` property it classified as NOTHING, so it got no
      // entry header, no tracker surface, and never appeared in Diary.base.
      //
      // Falls back to bare frontmatter rather than refusing if the template is
      // missing: a "run repair first" dead end on a button whose whole job is
      // "make me somewhere to write" is a worse trade than a plain note.
      const tpl = await readTemplate(
        this.app,
        `${this.paths.templatesDiary}/${CLASS_DEFS[spec.cls].templateFile}`
      );
      const body =
        tpl == null
          ? `---\n${spec.prop}: ${startIso}\njournal: ${CLASS_DEFS[spec.cls].journalProperty}\n---\n`
          : tpl.replace(
              new RegExp(`^${spec.prop}:.*$`, "m"),
              `${spec.prop}: ${startIso}`
            );
      file = await createFileEnsuringFolders(this.app, path, body);
    }
    await openFile(this.app, file);
    return file;
  }

  async newWeekEntry(sourcePath: string): Promise<void> {
    await this.openOrCreatePeriodEntry(
      "week",
      this.periodStartOf(sourcePath, "week-start", "isoWeek")
    );
  }

  async newQuarterEntry(sourcePath: string): Promise<void> {
    await this.openOrCreatePeriodEntry(
      "quarter",
      this.periodStartOf(sourcePath, "quarter-start", "quarter")
    );
  }

  // The month this dashboard is currently scoped to, kept as an entry.
  //
  // ROUTED THROUGH `openOrCreateMonth` rather than through
  // `openOrCreatePeriodEntry`, which is where the other three go. A monthly
  // entry already had a creator — `newMonthlyEntry` prompts for a YYYY-MM and
  // calls it — and giving the grain a second one would mean two functions that
  // must agree about a monthly entry's folder, filename and seeding forever.
  // What was missing was never the creation; it was the SCOPE. So this supplies
  // the scope and reuses the creator.
  async newMonthEntry(sourcePath: string): Promise<void> {
    await this.openOrCreateMonth(
      this.periodStartOf(sourcePath, "month-start", "month").slice(0, 7)
    );
  }

  async newYearEntry(sourcePath: string): Promise<void> {
    await this.openOrCreatePeriodEntry(
      "year",
      this.periodStartOf(sourcePath, "year-start", "year")
    );
  }

  // The period the button was pressed ON, not the current one.
  //
  // Pressing "make an entry for this week" while looking at a week in March has
  // to make March's entry. Reading `moment()` instead would silently create the
  // wrong note and open it, which looks like success.
  private periodStartOf(
    sourcePath: string,
    prop: PeriodProp,
    unit: PeriodUnit
  ): string {
    const file = getFile(this.app, sourcePath);
    const fm = file ? frontmatterOf(this.app, file) : {};
    const raw = isoDate(fm[prop]);
    const base = raw ? moment(raw) : moment();
    return (base.isValid() ? base : moment()).startOf(unit).format("YYYY-MM-DD");
  }

  // ── Week / month / year navigators (replaces Meta Bind updateMetadata) ─
  // Shift a date property on the given note. `unit` is the period being
  // stepped ("isoWeek", "month" or "year" — the year view uses the last);
  // `delta` is the number of units to add (0 = jump to current period).
  async shiftPeriod(
    sourcePath: string,
    prop: PeriodProp,
    unit: PeriodUnit,
    delta: number,
    toCurrent: boolean
  ): Promise<void> {
    const file = getFile(this.app, sourcePath);
    if (!file) return;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      let base = toCurrent ? moment() : moment(isoDate(fm[prop]) || undefined);
      if (!base.isValid()) base = moment();
      base = base.startOf(unit);
      if (!toCurrent && delta) base = base.add(delta, unit);
      fm[prop] = base.format("YYYY-MM-DD");
    });
  }

  // Set a date property to a specific period, snapped to that period's start.
  // Used by the dashboards' date finder to jump the summary to any week/month
  // the user picks from its dropdown (the picker's counterpart to the
  // prev/this/next shifts above).
  async setPeriod(
    sourcePath: string,
    prop: PeriodProp,
    unit: PeriodUnit,
    iso: string
  ): Promise<void> {
    const file = getFile(this.app, sourcePath);
    if (!file) return;
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      let base = moment(isoDate(iso) || iso || undefined);
      if (!base.isValid()) base = moment();
      fm[prop] = base.startOf(unit).format("YYYY-MM-DD");
    });
  }
}
