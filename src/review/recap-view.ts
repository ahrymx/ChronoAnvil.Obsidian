// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The `period-recap` widget: the authored rollup, as a block of its own.
//
// WHAT THIS IS AND WHY IT IS NOT NEW CODE. Goals, highlights and challenges
// were rendered by `year-summary` and `quarter-summary` as the last three lines
// of their builders — inside the banner, below the stats, unbounded. This file
// calls the same three functions from the same module. `renderGoals` and
// `renderList` are still exported from `quarter-view.ts` and still have exactly
// one definition each; the year has never had its own copy and does not gain
// one here. That is the promise 3.9 was measured against and it is the reason
// this file imports rather than reimplements.
//
// WHAT CHANGED IS WHERE THEY ARE CALLED FROM. A banner's job is to say what a
// period was in one glance, and on a vault with half a year of monthly entries
// the highlights alone ran to twenty-one items — so the stats band, the part a
// banner is for, was off screen before the reader reached the quarters. Worse,
// none of it was foldable, movable or removable, because none of it was a
// section: `sectionFrame` was already used INSIDE `renderList`, which is the
// tell. These were sections in every respect except the one that would let a
// reader act on them.
//
// ONE SECTION RATHER THAN THREE. The roadmap proposed `period-quarters`,
// `period-goals` and `period-rollup`; the decision taken was one "Recap"
// carrying the lot, on the grounds that it is the smaller diff and that
// splitting it later is one catalogue entry rather than a migration. The known
// cost is on record: "I want the quarters and not the highlights" is
// unanswerable with one section, and that was the complaint's own shape.
//
// AND THE YEAR'S QUARTER CARDS ARE NOT IN IT — see `renderQuarterCards`'s call
// site in year-view.ts, which explains why at length.

import { MarkdownPostProcessorContext, TFile } from "obsidian";
import type AlmanacPlugin from "../main";
import { readIndex } from "../diary/diary-index";
import { emptyLine } from "../ui/empty";
import { quarterStats } from "./quarter-stats";
import type { MonthRollup } from "./quarter-stats";
import { renderGoals, renderList, selectedQuarter } from "./quarter-view";
import { yearStats } from "./year-stats";
import { selectedYear } from "./year-view";
import { today } from "../core/util";

// The two grains that have an authored rollup to show. A month's entry IS the
// authored writing, so there is nothing for a month to roll up but itself; a
// week has no monthly entries under it at all.
export type RecapGrain = "year" | "quarter";

export function parseRecapGrain(rest: string): RecapGrain | null {
  const arg = rest.trim();
  return arg === "year" || arg === "quarter" ? arg : null;
}

// What the recap draws, for either grain: the months, and the goal counts.
//
// The two stats functions return much more than this — entry densities, streaks,
// coverage rates — and the recap reads none of it. Naming the three fields it
// does read is what keeps this widget honest about being a view of the rollup
// rather than a second statistics page growing quietly inside a section.
interface RecapData {
  months: MonthRollup[];
  goalsDone: number;
  goalsOpen: number;
}

export function buildPeriodRecap(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  rest: string
): HTMLElement {
  const root = createDiv({ cls: "journal-period-recap" });
  const grain = parseRecapGrain(rest);

  if (!grain) {
    // Refusing with a reason, the way `entry-rollup` refuses a note with no
    // period property. The grain is written by the catalogue, so a directive
    // that has lost it was hand-edited — and guessing which of two periods was
    // meant would draw a plausible, unrelated rollup.
    emptyLine(
      root,
      "period-recap needs a period \u2014 write `period-recap:year` or `period-recap:quarter`.",
      "jq-empty"
    );
    return root;
  }

  root.createDiv({ cls: "jq-loading", text: "Reading your entries\u2026" });

  void readIndex(plugin).then((entries) => {
    const data = recapData(plugin, ctx, grain, entries);
    root.empty();
    if (!data) {
      emptyLine(root, "This note isn't scoped to a period yet.", "jq-empty");
      return;
    }
    renderRecap(root, data);
  });

  return root;
}

// The rollup for whichever period this note is showing.
//
// The period is resolved through the same two functions the banners use —
// `selectedYear` and `selectedQuarter` — rather than re-read here, so a recap
// and the banner above it on one note cannot name different periods.
function recapData(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  grain: RecapGrain,
  entries: Parameters<typeof yearStats>[1]
): RecapData | null {
  if (grain === "year") {
    // NO JOURNAL NOTES. `yearStats` takes them to count lessons completed and
    // started, which are two stat cards on the year banner and nothing this
    // widget renders — so handing it an empty list buys the recap out of a walk
    // of every page under every journal root on every repaint.
    //
    // The coupling is worth naming because it is invisible: this is correct
    // only while `notes` feeds the note counts alone and never `months` or the
    // goal totals. If that ever stops being true, this is the call site that
    // silently starts under-reporting.
    const s = yearStats(selectedYear(plugin, ctx), entries, [], today());
    return { months: s.months, goalsDone: s.goalsDone, goalsOpen: s.goalsOpen };
  }
  const quarter = selectedQuarter(plugin, ctx);
  if (!quarter) return null;
  const s = quarterStats(quarter, entries, today());
  return { months: s.months, goalsDone: s.goalsDone, goalsOpen: s.goalsOpen };
}

function renderRecap(root: HTMLElement, data: RecapData): void {
  // THE SAME THREE CALLS, IN THE SAME ORDER, from the same module. Goals first,
  // because it is the one question this rollup answers that no single month's
  // note can: what you set out to do across the period, and how much of it
  // happened.
  renderGoals(root, data.months, data.goalsDone, data.goalsOpen);
  renderList(root, data.months, "Highlights", (m) => m.highlights);
  renderList(root, data.months, "Challenges", (m) => m.challenges);

  // All three render nothing at all when they have nothing — which is right
  // inside a banner that has stats above it, and wrong for a block that IS the
  // section. A reader who just added Recap and got an empty rectangle has no
  // way to tell "nothing written yet" from "this is broken".
  if (!root.childElementCount) {
    emptyLine(
      root,
      "Nothing to roll up yet \u2014 this fills in from the goals, highlights and challenges in your monthly entries.",
      "jq-empty"
    );
  }
}

// ── the migration notice ──────────────────────────────────────────────

// "The recap moved", said on the banner that used to draw it.
//
// THIS IS THE MITIGATION FOR THE ONE RISK 3.9 NAMES. The recap section is
// opt-in, so an existing reader upgrades and their year page draws strictly
// less than it did yesterday, with nothing saying where the rest went. Nothing
// is lost — the highlights live in the monthly entries and are being read, not
// stored, by any of this — but "my year page lost my highlights" is what it
// looks like, and being right about the data does not help. Silently drawing
// less than yesterday is the outcome to design out, and this is how.
//
// IT SAYS SO ONLY WHEN THERE IS SOMETHING TO HAVE LOST. Two conditions, and
// both are necessary:
//
//   - the note has no `period-recap` block, so the reader has not already
//     answered this, and
//   - the rollup is non-empty, so there is something they can no longer see.
//
// A fresh vault therefore never sees it, a reader who adds the section never
// sees it again, and a reader who declines and writes nothing in their monthlies
// never sees it either. A notice that cannot retire itself is an advert.
export function renderRecapMoved(
  parent: HTMLElement,
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  data: RecapData
): void {
  const anything =
    data.goalsDone + data.goalsOpen > 0 ||
    data.months.some((m) => m.highlights.length || m.challenges.length);
  if (!anything) return;

  const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(file instanceof TFile)) return;

  // Read rather than pattern-matched against the catalogue, because the
  // question is about THIS note's text and `locate` is the catalogue's own
  // answer to it. Async, so the banner paints without waiting and the row
  // appears a frame later if it is needed at all.
  void plugin.app.vault.cachedRead(file).then((text) => {
    if (/^period-recap\b/m.test(text)) return;

    const row = parent.createDiv({ cls: "jq-recap-moved" });
    row.createSpan({
      cls: "jq-recap-moved-text",
      text: "Goals, highlights and challenges moved into a Recap section you can fold, move or remove.",
    });
    const btn = row.createEl("button", {
      cls: "jq-recap-moved-btn",
      text: "Add it",
      attr: { type: "button" },
    });
    btn.addEventListener("click", () => {
      btn.disabled = true;
      void plugin.sections.addDiarySectionHere(ctx.sourcePath, "recap");
    });
  });
}

// The banners' half of the notice: they hold the stats already, and this is the
// shape `renderRecapMoved` needs them in.
export function recapDataOf(
  months: MonthRollup[],
  goalsDone: number,
  goalsOpen: number
): RecapData {
  return { months, goalsDone, goalsOpen };
}
