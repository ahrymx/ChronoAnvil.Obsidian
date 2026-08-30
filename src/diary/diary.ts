// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { App, Notice, TFile } from "obsidian";
import type ChronoAnvilPlugin from "../main";
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
import { setGraphLinks } from "../core/note-sections";
import {
  containingPeriods,
  entryPath,
  grainFallbackName,
  graphParentName,
  locateEntry,
} from "./lineage";
import type { ContainingPeriod } from "./lineage";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

// Which argument `openOrCreatePeriodEntry` takes for a grain, for the three
// grains it makes. Monthly has its own creator and daily is contained by
// nothing, so neither is here — see `createPeriod`.
const PERIOD_ENTRY_UNIT: Partial<
  Record<TrackerClass, "week" | "quarter" | "year">
> = {
  weekly: "week",
  quarterly: "quarter",
  yearly: "year",
};

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
  constructor(private app: App, private plugin: ChronoAnvilPlugin) {}

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
    // FOUND WHEREVER IT IS, WRITTEN WHERE THIS RELEASE FILES IT. `locateEntry`
    // probes the period tree and then the flat grain folder, so a vault that has
    // `Daily/Day-2026-08-29.md` opens THAT note rather than making a second one
    // in the tree beside it.
    let file = locateEntry(this.app, this.paths, "daily", dateStr);
    if (!file) {
      const path = entryPath(this.paths, "daily", dateStr);
      const tpl = await readTemplate(
        this.app,
        `${this.paths.templatesDiary}/Daily.md`
      );
      if (tpl == null) {
        new Notice("Daily template missing — run 'Set up / repair vault'.");
        return null;
      }
      // AFTER THE TEMPLATE CHECK, NOT BEFORE IT. A day whose own template is
      // missing is a day that will not be written, and four period entries made
      // for a note that never arrives is a vault worse off than it started.
      const parent = await this.ensureLineage("daily", dateStr);
      file = await createFileEnsuringFolders(
        this.app,
        path,
        setGraphLinks(fillDailyTemplate(tpl, dateStr), parent ? [parent] : [])
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
      console.error("[ChronoAnvil] could not stamp events onto the new entry", e);
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
  // `reveal: false` for the same reason the daily opener has it (see above):
  // quick capture needs the entry to exist and must not take the reader out of
  // whatever they were doing. 4.27, when capture gained a destination picker
  // and could be pointed at a grain other than daily.
  // `quiet` SUPPRESSES THE MISSING-TEMPLATE NOTICE, and only that (4.81). The
  // month is the one grain in the chain whose creator refuses rather than
  // falling back to bare frontmatter, so a vault with no Monthly template would
  // otherwise tell a reader who asked for TODAY'S entry that a template they
  // never mentioned is missing. The refusal is unchanged and still returns null;
  // `ensureLineage` reads that as "no month" and links the quarter instead.
  async openOrCreateMonth(
    monthStr: string,
    opts: { reveal?: boolean; quiet?: boolean } = {}
  ): Promise<TFile | null> {
    if (!MONTH_RE.test(monthStr)) {
      new Notice("Use the format YYYY-MM");
      return null;
    }
    let file = locateEntry(this.app, this.paths, "monthly", monthStr);
    if (!file) {
      const path = entryPath(this.paths, "monthly", monthStr);
      const tpl = await readTemplate(
        this.app,
        `${this.paths.templatesDiary}/Monthly Entry.md`
      );
      if (tpl == null) {
        if (!opts.quiet) {
          new Notice("Monthly template missing — run 'Set up / repair vault'.");
        }
        return null;
      }
      const parent = await this.ensureLineage("monthly", monthStr);
      file = await createFileEnsuringFolders(
        this.app,
        path,
        setGraphLinks(fillMonthlyTemplate(tpl, monthStr), parent ? [parent] : [])
      );
    }
    if (opts.reveal !== false) await openFile(this.app, file);
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
  // `reveal: false` as on the daily and monthly openers, and for the same
  // caller — see `openOrCreateDay`. 4.27.
  async openOrCreatePeriodEntry(
    unit: "week" | "quarter" | "year",
    startIso: string,
    opts: { reveal?: boolean } = {}
  ): Promise<TFile | null> {
    const p = this.paths;
    // Prefixed like `Day-` and `Month-`, so a filename states its grain without
    // needing its folder to say it. The bare `2026-W30.md` this shipped with
    // first was the odd one out in a naming scheme five files deep.
    // NAMED FROM THE CLASS TABLE AS OF 4.81, not from three format strings
    // written out here. `Quarter-${YYYY}-Q${month/3+1}` was a second spelling of
    // `CLASS_DEFS.quarterly.fileFormat`, and the hidden links now have to name
    // these files from the outside — see `entryNoteName`, which is the one
    // answer both sides read.
    const spec = {
      week: {
        cls: "weekly" as TrackerClass,
        prop: "week-start" as PeriodProp,
      },
      quarter: {
        cls: "quarterly" as TrackerClass,
        prop: "quarter-start" as PeriodProp,
      },
      year: {
        cls: "yearly" as TrackerClass,
        prop: "year-start" as PeriodProp,
      },
    }[unit];

    let file = locateEntry(this.app, p, spec.cls, startIso);
    if (!file) {
      const path = entryPath(p, spec.cls, startIso);
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
      // The bare-frontmatter fallback has no hidden block for `setGraphLinks` to
      // re-aim, so it gets one appended — which is the case that comment covers,
      // and the reason a note written without a template still joins the spine.
      const parent = await this.ensureLineage(spec.cls, startIso);
      file = await createFileEnsuringFolders(
        this.app,
        path,
        setGraphLinks(body, parent ? [parent] : [])
      );
    }
    if (opts.reveal !== false) await openFile(this.app, file);
    return file;
  }

  // ── §  KEEPING THE SPINE COMPLETE (4.81) ─────────────────────────────
  //
  // Creating an entry creates every period above it that has no note yet, and
  // returns the name the new entry's hidden link should carry.
  //
  // WHY CREATE THEM AT ALL. The alternative — name the period whether or not it
  // exists — draws a hollow node for every unwritten week, and a hollow node
  // emits no links: the whole of August would hang off a `Quarter-2026-Q3` with
  // no edge back to the diary. The alternative to THAT is naming only what
  // exists, which is honest and leaves the stream as ragged as the reader's
  // habits. Making the period is the only answer where the graph reads the same
  // way in every vault.
  //
  // AND WHAT IT COSTS, STATED PLAINLY: a period entry made this way is EMPTY,
  // and "an entry exists" is how four other surfaces answer "did I write
  // anything" — the calendar's period underlines (`buildPeriodEntryKeys`, whose
  // own comment says the entry "is the thing that is either written or not"),
  // the coverage line on a period summary, `Diary.base`, and the diary index.
  // Those now say "yes" for a week you have not touched. That is the trade this
  // release makes for a graph with one shape.
  //
  // ONE HOP, THEN RECURSION. This creates the IMMEDIATE parent only; that
  // creator runs this again for its own parent, so a day made in a fresh vault
  // walks up to the year and stops. Four levels, bounded by `CONTAINING_GRAIN`
  // ending at null — not by a counter this could get wrong.
  private async ensureLineage(
    grain: TrackerClass,
    iso: string
  ): Promise<string | null> {
    const chain = containingPeriods(grain, iso);
    if (chain.length === 0) return grainFallbackName(this.paths, grain);
    await this.createPeriod(chain[0]);
    // ASKED AGAIN AFTER THE WRITE, rather than assuming the parent is there. A
    // grain whose template is missing refuses (see `openOrCreateMonth`), and
    // `graphParentName` then walks to the next period up instead of naming a
    // note nobody made.
    return graphParentName(grain, iso, (p) => this.periodExists(p), this.paths);
  }

  private periodExists(period: ContainingPeriod): boolean {
    return (
      locateEntry(this.app, this.paths, period.grain, period.startIso) != null
    );
  }

  // One containing period, made if it is missing.
  //
  // THROUGH THE PUBLIC CREATORS, which is what stops this becoming a second
  // opinion about where a weekly entry lives and what it is seeded from. Both
  // are no-ops on a note that already exists, and both are told not to steal
  // focus: the reader asked for a day, not for the year it is in.
  private async createPeriod(period: ContainingPeriod): Promise<void> {
    if (this.periodExists(period)) return;
    if (period.grain === "monthly") {
      await this.openOrCreateMonth(period.startIso.slice(0, 7), {
        reveal: false,
        quiet: true,
      });
      return;
    }
    // `daily` cannot appear here — nothing contains a day — and the map says so
    // by having no entry for it rather than by a comment claiming it.
    const unit = PERIOD_ENTRY_UNIT[period.grain];
    if (!unit) return;
    await this.openOrCreatePeriodEntry(unit, period.startIso, { reveal: false });
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
