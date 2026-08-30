// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The quarter view: `quarter-summary`.
//
// A quarter is a review *scope*, not an entry class — there is no
// `Quarter-2026-Q3.md` and there never will be. Everything on this page is
// derived from the three Monthly Entries it spans and the daily entries
// underneath them, and the note it renders into holds exactly one piece of
// state: its `quarter-start` cursor. Delete the note and nothing is lost but
// where you were pointing.
//
// Construction is the month summary's, unchanged: an accent-washed banner
// (eyebrow + title + stats + the period navigator) welded above a body. The
// banner and the stats strip are imported from calendar.ts rather than
// reimplemented, so the week, month and quarter dashboards cannot drift apart
// on how a logged day or an open task is counted — the same guarantee
// renderPeriodStats was extracted to give the first two in 2.10.
//
// The tracker charts on this page are not built here. They are the ordinary
// `chronoanvil-charts` fence, scoped by `quarter-start` through
// resolvePeriodBounds, exactly as the year note's are by `year-start`.

import { MarkdownPostProcessorContext, setIcon, TFile } from "obsidian";
import type ChronoAnvilPlugin from "../main";
import { buildOverviewBanner, renderPeriodStats } from "../diary/calendar";
import { periodSpan } from "../diary/periodnav";
import { readIndex } from "../diary/diary-index";
import { MonthRollup, QuarterStats, quarterStats } from "./quarter-stats";
import {
  frontmatterOf,
  isoDate,
  moment,
  quarterMonths,
  quarterOfMonth,
  today,
} from "../core/util";
import { entriesOfGrain } from "../diary/lineage";
import { sectionFrame } from "../ui/section-frame";
import { recapDataOf, renderRecapMoved } from "./recap-view";

const QUARTER_PROP = "quarter-start";

// Which quarter the host note is showing, as `YYYY-Qn`.
//
// A blank `quarter-start` means "this quarter", the same read the week and
// month summaries give their own blank cursor — the shipped note ships the
// property empty and only gains a value once you navigate.
//
// EXTRACTED AND EXPORTED IN 3.9 §2, because `period-recap` is a second block on
// this same note and the two have to agree about which quarter it is. Inlined
// in the builder it was one derivation that happened to have one caller; the
// recap would have made it two, and two is how the banner and the section below
// it come to name different quarters after somebody edits one of them.
export function selectedQuarter(
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext
): string | null {
  const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(file instanceof TFile)) return null;
  let anchor = moment(isoDate(frontmatterOf(plugin.app, file)[QUARTER_PROP]) ?? undefined);
  if (!anchor.isValid()) anchor = moment();
  return quarterOfMonth(anchor.format("YYYY-MM"));
}

// ── quarter-summary ───────────────────────────────────────────────────

export function buildQuarterSummary(
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const app = plugin.app;
  const paths = plugin.settings.paths;
  const root = createDiv({
    cls: "ca-journal-quarter-summary ca-journal-overview-summary",
  });

  const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(file instanceof TFile)) return root;

  const quarter = selectedQuarter(plugin, ctx) ?? quarterOfMonth(today().slice(0, 7));
  const months = quarterMonths(quarter);
  const startIso = `${months[0]}-01`;
  const endIso = moment(`${months[2]}-01`).endOf("month").format("YYYY-MM-DD");

  // The stats strip counts daily entries, and those come from the metadata
  // cache synchronously — so the band paints complete on first frame and only
  // the rollup below it waits on the index (which needs note *bodies*).
  const quarterFiles: TFile[] = [];
  for (const f of entriesOfGrain(app, paths, "daily")) {
    const iso = isoDate(frontmatterOf(app, f)["journal-date"]);
    if (iso && iso >= startIso && iso <= endIso) quarterFiles.push(f);
  }

  const { band, textCol } = buildOverviewBanner(
    plugin,
    ctx,
    "quarter",
    "calendar",
    // The span only, and now the span alone: `1 Jul – 30 Sep`. It used to read
    // `Jul – Sep 2026 so far`, which said the year the headline `Q3 2026` was
    // already saying and changed shape as the quarter ran — the two things the
    // 3.5 split was for. "so far" belongs to the stats line below, which
    // computes it from the same bounds and is the line that has a fraction to
    // qualify.
    periodSpan("quarter", moment(startIso))
  );
  root.appendChild(band);
  renderPeriodStats(textCol, quarterFiles, { start: startIso, end: endIso }, app);

  const body = root.createDiv({ cls: "ca-journal-overview-body" });
  body.createDiv({ cls: "ca-jq-loading", text: "Reading your quarter…" });

  void readIndex(plugin).then((entries) => {
    const stats = quarterStats(quarter, entries, today());
    body.empty();
    renderBody(body, plugin, ctx, stats);
  });

  return root;
}

// ── body ──────────────────────────────────────────────────────────────

function renderBody(
  body: HTMLElement,
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext,
  s: QuarterStats
): void {
  renderCoverage(body, s);
  renderMonthCards(body, plugin, s);

  // THE SAME THREE LINES THE YEAR LOST, IN THE SAME PATCH — 3.9 §2, and the
  // fact that it is the same patch is the point rather than a convenience.
  //
  // `year-view.ts` imports `renderGoals` and `renderList` from this file
  // precisely so the two grains cannot drift. Sectioning the year alone would
  // have put that drift straight back into the place the source carries a
  // comment warning about it: one set of functions rendering three foldable
  // blocks at one zoom and a wall inside a banner at the other. So the quarter
  // loses them when the year does, and `period-recap` declares both grains.
  //
  // The month cards above stay for the reason the year's quarter cards do —
  // they are this page's doors to the months, not part of the authored rollup.
  renderRecapMoved(body, plugin, ctx, recapDataOf(s.months, s.goalsDone, s.goalsOpen));

  // The empty state now asks a narrower question than it did. It used to mean
  // "there is no rollup below this", which was a statement about the three
  // sections that are no longer here; it means "there is nothing under this
  // quarter at all" — no monthly entries, no goals, nothing authored — which is
  // still worth saying on a page whose month cards would otherwise be the only
  // thing on it.
  const nothing =
    s.reviewsWritten === 0 &&
    s.goalsDone + s.goalsOpen === 0 &&
    s.months.every((m) => !m.highlights.length && !m.challenges.length);
  if (nothing) {
    body.createDiv({
      cls: "ca-jq-empty",
      text:
        s.months.every((m) => m.future)
          ? "This quarter hasn't started yet."
          : "Nothing to roll up yet — this page fills in from the monthly entries.",
    });
  }
}

// The span this page covers, and how much of it you wrote in.
//
// quarterStats has computed `partial`, `daysElapsed`, `dailyCount` and
// `entryRate` since 2.26 and this view rendered none of them — nine fields
// computed, four read. test/quarter-stats.test.ts even pinned "divides
// coverage by elapsed days, not by the whole quarter" against arithmetic no
// reader could see. This is that arithmetic, on the page.
//
// Deliberately a line rather than the year view's four stat cards: the banner
// above already carries the logged/tasks strip, and a second grid of numbers
// under it would make the quarter a statistics page. The quarter is a review;
// the numbers are context for the rollup, not the point of it.
function renderCoverage(parent: HTMLElement, s: QuarterStats): void {
  if (!s.daysElapsed) return;

  const line = parent.createDiv({ cls: "ca-jq-coverage" });
  // NO RANGE HERE ANY MORE — 3.6 patch 2. This printed `1 Jul – 2 Aug · 33
  // days so far`, which was the third statement of this quarter's stretch of
  // days on one screen: the band's span above it, the stats line under that,
  // and then this. It is the oldest of the three and the only one a reader
  // has to scroll past the card's band to reach, so it is the one that goes.
  //
  // What survives is what the band cannot say: the rate, and how many of the
  // three monthly reviews exist — the number that actually caps everything
  // below this row.
  line.createSpan({
    cls: "ca-jq-coverage-rate",
    text: `${s.dailyCount} ${
      s.dailyCount === 1 ? "entry" : "entries"
    } · ${Math.round(s.entryRate * 100)}% of days`,
  });
  // Reviews written is the number that actually caps this page — every
  // section below is a function of it — so it says so rather than leaving a
  // reader to count the cards.
  line.createSpan({
    cls: "ca-jq-coverage-reviews",
    text: `${s.reviewsWritten}/3 entries`,
  });
}

// The three months, as cards. Each one is the door to its own review: the
// quarter shows what the months said, and sends you to the month to change it.
// That is the whole write direction of a derived review — outward, into the
// entries, never into itself.
function renderMonthCards(
  parent: HTMLElement,
  plugin: ChronoAnvilPlugin,
  s: QuarterStats
): void {
  const row = parent.createDiv({ cls: "ca-jq-months" });
  for (const m of s.months) {
    const card = row.createDiv({
      cls:
        "ca-jq-month" +
        (m.path ? " is-written" : "") +
        (m.future ? " is-future" : ""),
    });

    const head = card.createDiv({ cls: "ca-jq-month-head" });
    head.createSpan({ cls: "ca-jq-month-name", text: m.label });
    const dot = head.createSpan({ cls: "ca-jq-month-dot" });
    if (m.path) dot.addClass("is-logged");

    // A future month reads as "not yet" rather than as a review you failed to
    // write — the same distinction the year view's dashed month bars make.
    if (m.future) {
      card.createDiv({ cls: "ca-jq-month-note", text: "Not yet" });
      continue;
    }

    const action = card.createEl("a", {
      cls: "ca-jq-month-link",
      attr: {
        title: m.path
          ? `Open the ${m.label} entry`
          : `Start the ${m.label} entry`,
      },
    });
    setIcon(
      action.createSpan({ cls: "ca-jq-month-icon" }),
      m.path ? "notebook" : "plus"
    );
    action.createSpan({
      text: m.path ? m.title || "Entry" : "Start the entry",
    });
    action.addEventListener("click", (evt) => {
      evt.preventDefault();
      void plugin.diary.openOrCreateMonth(m.monthKey);
    });

    if (m.focus) card.createDiv({ cls: "ca-jq-month-focus", text: m.focus });
  }
}

// Goals set vs met, grouped by the month that set them. Grouped rather than
// pooled because a goal is a fact about its month — flattening the three lists
// would lose which month you were answering to, which is most of what makes
// the rollup readable.
// Exported in 2.52 so the year renders the identical sections over twelve
// months instead of growing a second set that drifts. The signature takes the
// rollups and the counts rather than a QuarterStats, which is what makes it
// scope-agnostic — the quarter and the year differ only in how many months
// they hand over.
export function renderGoals(
  parent: HTMLElement,
  months: MonthRollup[],
  goalsDone: number,
  goalsOpen: number
): void {
  const total = goalsDone + goalsOpen;
  if (!total) return;

  const sec = parent.createDiv({ cls: "ca-jq-section" });
  // `owns: "children"` — this section's body is the divs below it inside this
  // widget's own DOM, not the note's following blocks. See section-frame.ts:
  // giving it the block-owning marker would make the enclosing dashboard read
  // its fold level off this and fold wrong.
  sectionFrame(sec, {
    title: "Goals",
    level: 2,
    note: `${goalsDone} of ${total} met`,
    owns: "children",
  });

  for (const m of months) {
    if (!m.goals.length) continue;
    const group = sec.createDiv({ cls: "ca-jq-group" });
    group.createDiv({ cls: "ca-jq-group-label", text: m.label });
    const list = group.createDiv({ cls: "ca-jq-goals" });
    for (const g of m.goals) {
      const row = list.createDiv({
        cls: "ca-jq-goal" + (g.done ? " is-done" : ""),
      });
      setIcon(
        row.createSpan({ cls: "ca-jq-goal-icon" }),
        g.done ? "check-square" : "square"
      );
      row.createSpan({ cls: "ca-jq-goal-text", text: g.text });
    }
  }
}

// Highlights / Challenges: the two `list:` regions, one row per line, kept
// under the month that wrote them. `log` is deliberately absent — it is free
// prose, and three months of it stacked is not a review.
export function renderList(
  parent: HTMLElement,
  months: MonthRollup[],
  title: string,
  pick: (m: MonthRollup) => string[]
): void {
  const groups = months.filter((m) => pick(m).length);
  if (!groups.length) return;

  const count = groups.reduce((n, m) => n + pick(m).length, 0);
  const sec = parent.createDiv({ cls: "ca-jq-section" });
  sectionFrame(sec, {
    title,
    level: 2,
    // A quantity, so the pill rather than the note slot.
    count,
    owns: "children",
  });

  for (const m of groups) {
    const group = sec.createDiv({ cls: "ca-jq-group" });
    group.createDiv({ cls: "ca-jq-group-label", text: m.label });
    const list = group.createEl("ul", { cls: "ca-jq-items" });
    for (const item of pick(m)) list.createEl("li", { text: item });
  }
}
