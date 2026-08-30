// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The year view: `year-summary`.
//
// One view over a *calendar* year, with a year picker — rather than three
// panes for "this year", "last year" and "a year". Those are the same view
// over different ranges, so they're one component with a selection; next year
// it keeps working with no change, and "so far" falls out naturally from the
// current year being partial.
//
// The tracker charts on this page are NOT built here. They're the ordinary
// `chronoanvil-charts` fence with its existing Add/Edit/Remove manager, scoped by
// each chart's `period` range. What makes that resolve to the selected year is
// the `year-start` frontmatter property this view writes — the same mechanism
// the weekly and monthly dashboards use. So a year's tracker section is
// user-defined with the modules that already exist, and the charts code needed
// no knowledge of the year view at all.

import { MarkdownPostProcessorContext, TFile } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import { buildOverviewBanner } from "../diary/calendar";
import { periodSpan } from "../diary/periodnav";
import { statStrip } from "../ui/stat-strip";
import type { StatCard } from "../ui/stat-strip";
import { recapDataOf, renderRecapMoved } from "./recap-view";
import { readIndex } from "../diary/diary-index";
import { pagesUnder } from "../core/query";
import { registeredJournalTypes } from "../journals/journal";
import { kindPlural } from "../journals/journal-sections";
import type { JournalKind } from "../journals/journal";
import {
  JournalNoteFact,
  YearStats,
  yearStats,
} from "./year-stats";
import {
  frontmatterOf,
  isoDate,
  moment,
  openFile,
  quarterMonths,
  today,
  quarterOverviewPath,
} from "../core/util";
import { sectionFrame } from "../ui/section-frame";

// The `year-start` property this view drives. Named to match `week-start` /
// `month-start` so the period-resolution in widgets.ts treats it identically.
const YEAR_PROP = "year-start";

// Which year the host note is showing. Falls back to the current year when the
// property is missing or unparseable, so a note that's lost its frontmatter
// still renders something sensible.
// Exported as of 3.9 §2 so `period-recap` resolves the year the same way this
// view does. The recap is a separate block on the same note and must agree with
// the banner above it about which year the note is showing — one derivation,
// not two that drift the first time the property's spelling changes.
export function selectedYear(plugin: ChronoAnvilPlugin, ctx: MarkdownPostProcessorContext): number {
  const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(file instanceof TFile)) return Number(today().slice(0, 4));
  const iso = isoDate(frontmatterOf(plugin.app, file)[YEAR_PROP]);
  const year = iso ? Number(iso.slice(0, 4)) : NaN;
  return Number.isFinite(year) ? year : Number(today().slice(0, 4));
}

// Every registered journal type's dated leaf notes, as flat facts. Reads
// frontmatter only — `type`, `date` and `status` are all properties — so this
// needs no body reads and stays cheap across a large vault.
//
// Was `type === "lesson"` under `paths.journalsRoot`, which made the year's
// headline count Study's alone: a vault whose journalling was all Cooking saw
// a permanent zero. Each type contributes the notes of its own kinds, so a
// container's folder note and a page are both correctly out.
function readJournalNotes(plugin: ChronoAnvilPlugin): JournalNoteFact[] {
  const out: JournalNoteFact[] = [];
  // A type's root may sit inside another's (not the default layout since 2.45,
  // but a root is a settings value), so the same file can be walked by two
  // types' passes. It only counts
  // once — its `type` matches at most one of them unless two types happen to
  // share a kind id, which this guards rather than assumes.
  const seen = new Set<string>();
  for (const type of registeredJournalTypes(plugin)) {
    const root = type.root;
    if (!root) continue;
    const kinds = new Set(type.kinds.map((k: JournalKind) => k.id));
    for (const page of pagesUnder(plugin.app, root)) {
      const value = page.fm["type"];
      if (typeof value !== "string" || !kinds.has(value)) continue;
      if (seen.has(page.file.path)) continue;
      seen.add(page.file.path);
      const iso = isoDate(page.fm["date"]);
      if (!iso) continue;
      out.push({
        iso,
        completed: String(page.fm["status"] ?? "") === "completed",
      });
    }
  }
  return out;
}

// What to call those notes in the year's stat band.
//
// One registered type keeps its own word — a Study-only vault still reads
// "Lessons completed", which is what it said before this was generalised. With
// more than one there is no single right noun, so the band says what it is
// actually counting rather than picking a winner.
function journalNoteWord(plugin: ChronoAnvilPlugin): string {
  const types = registeredJournalTypes(plugin);
  const primary = types.length === 1 ? types[0].kinds[0] : null;
  return primary ? kindPlural(primary) : "Journal notes";
}

// ── year-summary ──────────────────────────────────────────────────────

// Kept as a local shim over `statStrip` rather than rewritten into one call,
// because the four cards below read as four statements about the year and a
// single array literal would read as a data structure. The argument order is
// value-then-label, which is this file's and not the component's — the
// component takes a record precisely so a caller cannot get the order wrong.
function statCard(
  cards: StatCard[],
  value: string,
  label: string,
  sub: string | null
): void {
  cards.push({ label, value, sub });
}

export function buildYearSummary(
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  // `journal-overview-summary`, not a class of its own: buildOverviewBanner's
  // band cancels its parent's padding with `margin: -12px -14px 0` and
  // re-applies it inside, so the banner is only correct inside a container that
  // *has* that padding. Adopting the banner function while keeping a bespoke
  // root is what made the first cut of this bleed 14px past its own body on
  // both sides — the negative margin is a contract with the parent, not a
  // decoration.
  const root = createDiv({
    cls: "ca-journal-year-summary ca-journal-overview-summary",
  });
  root.createDiv({ cls: "ca-jyr-loading", text: "Reading your year…" });

  void readIndex(plugin).then((entries) => {
    const year = selectedYear(plugin, ctx);
    const stats = yearStats(year, entries, readJournalNotes(plugin), today());
    root.empty();
    renderSummary(root, plugin, ctx, stats, journalNoteWord(plugin));
  });

  return root;
}

function renderSummary(
  root: HTMLElement,
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext,
  s: YearStats,
  noteWord: string
): void {
  // 2.52: the year adopts the construction the other three scopes share.
  //
  // It used to be its own thing — a bespoke `.jyr-panel` under a separate
  // `year-nav` directive, while the week, month and quarter were one
  // banner-over-body card with the navigator folded into the band. `OverviewUnit`
  // literally excluded "year" from the type that exists to make these read as one
  // family. The four scopes are one object at four zooms, and presenting the
  // widest of them as a different kind of page is what made prev/next feel like
  // travel between unrelated views rather than zoom.
  //
  // Folding the navigator in also gave the year a "This Year" button, which it
  // had never had: `buildYearNav` was a bounded stepper over the years that
  // happened to contain entries, with no way back to now except stepping.
  const { band } = buildOverviewBanner(
    plugin,
    ctx,
    "year",
    "calendar",
    // The span, which the year page used to print BELOW the title as its stats
    // line while the title said "2026 so far". Two lines for one fact, and the
    // headline was the half that could not say which days it meant. Now the
    // navigator says the year and this says the days.
    //
    // 3.6 moved the sentence itself next to the other three, in periodnav.ts.
    // It is still the odd one out — the only span reporting elapsed days
    // rather than the period's own bounds — but that is now a visible
    // exception in a list of four rather than a private function in the file
    // that happened to need it.
    periodSpan("year", moment(s.start), { end: s.end, days: s.daysElapsed })
  );
  root.appendChild(band);

  const panel = root.createDiv({ cls: "ca-journal-overview-body" });

  // Stats and density share one inset frame. They were flush against the old
  // bordered panel's edges; inside the shared body they need a frame of their
  // own, or the stat cells run to the full text width while every rollup
  // section below them is inset — which is what made the first cut look like
  // two pages stacked.
  const wrap = panel.createDiv({ cls: "ca-jyr-stats-wrap" });
  const grid: StatCard[] = [];

  // "Diary entries", not "Entries" — this page also counts lessons, and an
  // unqualified "entries" beside them reads as "things you wrote" in general.
  statCard(
    grid,
    String(s.entryCount),
    "Diary entries",
    s.daysElapsed > 0 ? `${Math.round(s.entryRate * 100)}% of days` : null
  );

  statCard(
    grid,
    String(s.longestStreak),
    "Longest streak",
    s.streakStart && s.streakEnd && s.longestStreak > 1
      ? `${moment(s.streakStart).format("D MMM")} – ${moment(s.streakEnd).format("D MMM")}`
      : s.longestStreak === 1
      ? "One day"
      : null
  );

  statCard(
    grid,
    String(s.notesCompleted),
    `${noteWord} completed`,
    s.notesStarted > s.notesCompleted
      ? `${s.notesStarted - s.notesCompleted} still in progress`
      : null
  );

  statCard(
    grid,
    String(s.tasksDone),
    "Tasks done",
    s.tasksOpen > 0 ? `${s.tasksOpen} still open` : null
  );

  // Built once the four are collected, because the strip needs to know how many
  // it is laying out before it lays any of them out. That is also the whole of
  // §4.1's deferred blocker: the count is an argument now rather than a
  // hardcoded four with a hardcoded fallback.
  statStrip(wrap, grid);

  // ── Entry density ───────────────────────────────────────────────────
  const density = wrap.createDiv({ cls: "ca-jyr-density" });
  sectionFrame(density, {
    title: "Entry density",
    level: 2,
    note: `${s.entryCount} of ${s.daysElapsed} ${
      s.daysElapsed === 1 ? "day" : "days"
    }`,
    owns: "children",
  });

  const strip = density.createDiv({ cls: "ca-jyr-months" });
  const peak = Math.max(1, ...s.entriesByMonth);
  for (let m = 0; m < 12; m++) {
    const col = strip.createDiv({ cls: "ca-jyr-month" });
    const count = s.entriesByMonth[m];
    const monthName = moment(
      `${s.year}-${String(m + 1).padStart(2, "0")}-01`
    ).format("MMMM");
    // Months that haven't happened yet are drawn as pending, not empty: an
    // empty August seen in July means "not yet", not "you didn't write".
    const future = m + 1 > s.monthsElapsed;

    // Each bar sits in a full-height track, so a quiet month reads as a low bar
    // in its slot rather than a small rectangle adrift on the background. The
    // track is what gives the row a baseline to measure against.
    const track = col.createDiv({
      cls: `ca-jyr-month-track${future ? " is-future" : ""}${
        !future && count === 0 ? " is-empty" : ""
      }`,
    });
    if (!future && count > 0) {
      const bar = track.createDiv({ cls: "ca-jyr-month-bar" });
      // Height encodes volume against the year's best month, so the shape of
      // the year is legible without a number on every bar.
      bar.style.height = `${Math.round((count / peak) * 100)}%`;
    }
    track.setAttr(
      "aria-label",
      `${monthName}: ${
        future ? "not yet" : `${count} ${count === 1 ? "entry" : "entries"}`
      }`
    );
    col.createDiv({ cls: "ca-jyr-month-label", text: monthName[0] });
  }

  if (s.entryCount === 0 && s.daysElapsed > 0) {
    panel.createDiv({
      cls: "ca-jyr-empty",
      text: "No diary entries this year yet.",
    });
  }

  // ── the quarters ────────────────────────────────────────────────────
  //
  // THIS STAYED WHEN THE ROLLUP LEFT — 3.9 §2, and it is where the build
  // disagreed with the plan, so the argument is here rather than in a commit
  // message.
  //
  // The roadmap proposed a `period-quarters` section drawing these cards. Two
  // things decided otherwise once the recap became ONE opt-in section:
  //
  //   - THE COMPLAINT DOES NOT REACH THEM. §2's case against the banner is that
  //     it is UNBOUNDED — twenty-one highlights on half a year of entries, with
  //     the stats band pushed off screen. There are always exactly four quarter
  //     cards in one row. They fail the foldability test and pass the one that
  //     started this, and the three rollup calls below fail both.
  //
  //   - THEY ARE THE YEAR'S ONLY DOOR TO THE QUARTER. The year had no link to
  //     the scope directly beneath it at all before 2.52 — `links:` went home,
  //     month, search, skipping it — and these cards are what closed that. With
  //     the recap opt-in, folding them into it would reopen the hole 2.52 shut,
  //     for every reader who does not opt in.
  //
  // The cost is real and is the plan's: this is content on a diary dashboard a
  // reader still cannot fold, move or remove, which is the complaint §2 is
  // about. It is now the ONLY such content, and a `period-quarters` section is
  // one catalogue entry away if the argument above turns out to be wrong.
  renderQuarterCards(panel, plugin, s);

  // ── where the rollup went ───────────────────────────────────────────
  //
  // `renderGoals` and `renderList` used to be called here, over twelve months
  // instead of three. They are called from `period-recap` now — the same
  // functions, still exported from quarter-view.ts, still with one definition
  // each. See recap-view.ts.
  //
  // The recap is opt-in, so this page draws less than it did in 3.8 until the
  // reader says otherwise. That is the release's one real risk and this row is
  // the mitigation: it names where the rollup went and offers to put it back,
  // and it appears only on a page that has something to have lost.
  renderRecapMoved(panel, plugin, ctx, recapDataOf(s.months, s.goalsDone, s.goalsOpen));
}

// The four quarters, as cards. The year had no door to the quarter at all
// before 2.52 — its `links:` row went home, month, search, skipping the scope
// directly beneath it — so this is the missing rung as much as it is a summary.
function renderQuarterCards(
  parent: HTMLElement,
  plugin: ChronoAnvilPlugin,
  s: YearStats
): void {
  const sec = parent.createDiv({ cls: "ca-jq-section" });
  // ON THE FRAME, like every other section on this page. This was the last
  // caller of `.jq-section-head` / `-title` / `-note`, and 2.56.2 RETIRED those
  // three rules when it moved the quarter's and the year's inner sections onto
  // `sectionFrame` — it moved the two in this file's `renderGoals`/`renderList`
  // neighbours and missed this one. The markup outlived its stylesheet, so the
  // two spans rendered as unstyled inline text with nothing between them and
  // the page read `Quarters0 of 12 entries`.
  //
  // The fix is the migration, not a revived rule: re-adding a deliberately
  // deleted rule to serve one caller is how a stylesheet grows two ways of
  // saying the same thing, which is what 2.56.2 was for.
  //
  // `owns: "children"` — the body is the cards below, inside this widget's own
  // DOM, not the note's following blocks. Giving it the block-owning marker
  // would put it in HeaderBar's fold walk and make the enclosing dashboard read
  // its fold level off this.
  sectionFrame(sec, {
    title: "Quarters",
    level: 2,
    note: `${s.reviewsWritten} of 12 entries`,
    owns: "children",
  });

  const row = sec.createDiv({ cls: "ca-jq-months ca-jyr-quarters" });
  for (let q = 1; q <= 4; q++) {
    const key = `${s.year}-Q${q}`;
    const months = quarterMonths(key);
    const mine = s.months.filter((m) => months.includes(m.monthKey));
    const written = mine.filter((m) => m.path).length;
    const future = mine.every((m) => m.future);

    const card = row.createDiv({
      cls: "ca-jq-month" + (future ? " is-future" : ""),
    });
    const cardHead = card.createDiv({ cls: "ca-jq-month-head" });
    cardHead.createDiv({
      cls: "ca-jq-month-dot" + (written ? " is-logged" : ""),
    });
    cardHead.createDiv({ cls: "ca-jq-month-name", text: `Q${q}` });

    const entries = months.reduce(
      (n, mk) => n + s.entriesByMonth[Number(mk.slice(5, 7)) - 1],
      0
    );
    card.createDiv({
      cls: "ca-jq-month-meta",
      text: future
        ? "Not yet"
        : `${entries} ${entries === 1 ? "entry" : "entries"} · ${written}/3 written`,
    });

    // The card opens the Quarterly Overview on that quarter, the same write
    // the calendar's Q labels make — one derivation of "how you get to a
    // quarter", not two.
    card.addEventListener("click", () => {
      const path = quarterOverviewPath(plugin.settings.paths);
      void plugin.diary
        .setPeriod(path, "quarter-start", "quarter", `${months[0]}-01`)
        .then(() => {
          const file = plugin.app.vault.getAbstractFileByPath(path);
          if (file instanceof TFile) void openFile(plugin.app, file);
        });
    });
  }
}
