// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Journals section's header: a hero band carrying at-a-glance numbers and
// a 53-week activity strip across every registered journal.
//
// As of 2.13.9 this is the top band of the Journals banner (journals-section.ts)
// rather than a card of its own — the relationship the diary hero once had to the
// calendar card, before 4.13.1 §3 took that one off and left this the last hero
// in the plugin. Given `actions` it carries the section's Refresh; without it
// the header still renders standalone, which is what the bare `journals-header`
// directive does wherever someone has put one on another dashboard.
//
// It carried a third job until 2.51: a fold chevron on the title that collapsed
// the whole type list. That control went because it was a coarse duplicate of
// controls that already existed — every type head folds its own body and every
// subject group folds its own — drawn as a glyph small enough to be missed, in
// a title that isn't a heading, and on a single-type vault it was not a coarse
// duplicate but an exact one. What is genuinely lost is fold-everything-at-once;
// if that turns out to be missed it belongs in a menu, not back in the title.
//
// It exists for the same reason the Diary header does — the section opened with
// nothing but a title and a row of buttons, so the eye met an unweighted list
// of subject cards and had no sense of whether the thing was being kept up.
// The Diary answers that with a greeting and a stat strip; Journals now answers
// it with the same strip plus a year of activity, because "have I kept this
// up?" is a question about a long horizon, and one number ("14 this month")
// cannot show a habit that lapsed in March.
//
// Deliberately *not* the subject Activity chart (chart-render.ts). That widget
// is browsable — three numbered month grids with quarter chevrons — because on
// one subject you read individual days. This is a fixed, non-navigable window:
// no day numbers, no navigation, ~70px tall, so the journal list it heads stays
// above the fold. The two share the `--am-act-*` ramp and the bucket maths so
// the section has one colour story, but they are different instruments.
//
// Scope is every registered journal's root folder, unioned. A vault with
// Study off and two custom journals gets a strip over those two; a vault with
// no types enabled gets no hero at all (the section's own empty-state copy in
// journal.ts already explains that case, and a band of zeroes above it would
// just be noise).

import { setIcon, TFile } from "obsidian";
import type AlmanacPlugin from "../main";
import { countBodyTasks } from "../ui/tables";
import { registeredJournalTypes } from "./journal";
import type { JournalType } from "./journal";
import { kindPlural } from "./journal-sections";
import {
  activityBucket,
  activityWeight,
  aggregateActivity,
  filesUnder,
  frontmatterOf,
  isoDate,
  moment,
  openFile,
  today,
  yearStripCells,
  yearStripMonthLabels,
  yearStripStats,
  type ActivityCount,
  type YearCell,
} from "../core/util";

// How many weeks the strip covers. 53 rather than 52 so a full year is always
// visible regardless of where today falls in its week.
const STRIP_WEEKS = 53;

// One button in the header's right-hand action group.
export interface JournalsHeaderAction {
  label: string;
  icon: string;
  onClick: () => void;
}

export interface JournalsHeaderOptions {
  // Section-level controls, anchored right of the title.
  actions?: JournalsHeaderAction[];
}

// A stat cell: value over caption. Returns the value element so an async
// caller can fill it in once the note bodies have been read.
// NO ACCENT PARAMETER, AS OF 4.13.5. The first of the four cells took one, so
// ACTIVE DAYS printed its figure in `--interactive-accent` and the three beside
// it printed theirs in `--text-normal`. Rendered on a fresh vault that is four
// zeroes, one of them violet, and nothing about the value earned it — the colour
// marked the cell someone had decided led the row.
//
// That is the same sentence 4.13.1 §1 used to take the accent off every primary
// button — *"the colour was never saying anything you could act on"* — and
// 4.13.2 §3 used to take the wash off the band these cells sit in. Two releases
// removed it as a way of ranking things and left it here, one level in, because
// nobody had looked at this page. The parameter goes with the class so there is
// nothing to pass it to.
function addStat(
  parent: HTMLElement,
  value: string,
  label: string
): HTMLElement {
  // LABEL ABOVE VALUE, as of 3.12 §14.3. This was value-above-label while the
  // diary hero's identical-looking cell (diary-header.ts::statCell) has always
  // been label-above-value — same 2×2 grid, same card, same small-caps grey
  // label, opposite vertical order, on two pages a reader swipes between.
  //
  // Nobody noticed for the reason these things never get noticed: on a wide
  // window the two heroes are never on screen together, and it took stacking
  // them on a phone for the difference to be unmissable. So this is not a
  // mobile fix; it is a mobile SIGHTING of something that was always true.
  //
  // The diary's order wins on an argument rather than on seniority: its cells
  // carry a sub-line ("77% of days", "8 Mar – 4 Apr") that qualifies the value,
  // and a qualifier has to sit under the thing it qualifies. That forces
  // label-value-sub there, and a hero that reads one way where it has a
  // sub-line and the other way where it does not is two components wearing one
  // costume. Journals has no sub-line today and follows anyway, because the
  // point is that the reader learns one shape.
  const cell = parent.createDiv({ cls: "jjh-stat" });
  cell.createDiv({ cls: "jjh-stat-label", text: label });
  return cell.createDiv({ cls: "jjh-stat-value", text: value });
}

// Read every note under every registered type's root, pairing its `date`
// frontmatter with its open/completed task counts.
//
// Task counts come from each note's *body* (countBodyTasks), not the metadata
// cache: an Almanac `- ( )` checkbox is invisible to the listItems cache
// wherever it sits, and a reader's tasks may be written in a note's prose as
// well as inside its `tasks:` widget region. Reading bodies is async, so this
// returns a promise and the strip paints once it resolves.
//
// This comment used to say the journal templates "carry" those checkboxes.
// They do not and, as of 3.12, are not expected to: a composed lesson ships a
// `tasks:tasks|✅ Tasks` widget over an EMPTY region, which is the correct
// shape for a note nobody has written a task in yet. The distinction matters
// because the old wording is what made a vault of task-free lessons look like
// a bug in the reader rather than a sentence in the caller — see the status
// line below.
async function collectRows(
  plugin: AlmanacPlugin,
  roots: string[]
): Promise<{ rows: ActivityCount[]; fileByDate: Map<string, TFile> }> {
  const app = plugin.app;
  const rows: ActivityCount[] = [];
  const fileByDate = new Map<string, TFile>();
  // A file could sit under two roots if a user nests one journal folder inside
  // another; dedupe by path so its tasks aren't counted twice.
  const seen = new Set<string>();
  for (const root of roots) {
    for (const f of filesUnder(app, root)) {
      if (seen.has(f.path)) continue;
      seen.add(f.path);
      const date = isoDate(frontmatterOf(app, f)["date"]);
      if (!date) continue;
      const { open, done } = countBodyTasks(await app.vault.cachedRead(f));
      // `notes: 1` — this file IS the day's activity, whether or not anyone
      // ticked anything off inside it (3.12.1).
      rows.push({ date, open, done, notes: 1 });
      // First note seen for a date wins, so a cell opens something rather
      // than nothing when several notes share a day.
      if (!fileByDate.has(date)) fileByDate.set(date, f);
    }
  }
  return { rows, fileByDate };
}

// Human summary of one day, for the cell tooltip. Mirrors the subject chart's
// dayLabel so hovering a square means the same thing in both places.
function cellLabel(c: YearCell): string {
  const parts: string[] = [];
  if (c.done > 0) parts.push(`${c.done} completed`);
  if (c.open > 0) parts.push(`${c.open} open`);
  const when = moment(c.iso).format("ddd D MMM YYYY");
  return parts.length ? `${when}: ${parts.join(", ")}` : `${when}: no tasks`;
}

// Paint the strip: a column per week, seven rows, plus the month caption row
// above it. Column-major CSS grid (`grid-auto-flow: column`), so a cell's
// position falls out of its order and no per-cell coordinates are needed.
function drawStrip(
  plugin: AlmanacPlugin,
  wrap: HTMLElement,
  cells: YearCell[],
  max: number,
  todayIso: string,
  fileByDate: Map<string, TFile>
): void {
  wrap.empty();

  // Month captions, positioned by grid column so each sits over the week its
  // month begins in rather than being evenly spaced (which would drift out of
  // alignment as months of different lengths accumulate).
  // ── THE TRACKS FILL THE PANE, WITH A FLOOR (4.13.3) ────────────────────
  //
  // `repeat(53, var(--jjh-cell))` until now: 53 fixed 10px columns, about 660px,
  // and `.jjh-strip-wrap` scrolled whatever was left over. That is right on a
  // phone and wrong on a wide page — the homepage caps itself at 1100px and the
  // journals dashboard is wider still, so the band's own strip sat in the left
  // two-thirds of it with a scrollbar under a year that had room to be shown
  // whole.
  //
  // `minmax(--jjh-cell, 1fr)` keeps BOTH behaviours in one expression and needs
  // no measurement: the floor is the old fixed size, so a narrow pane is
  // unchanged and still scrolls, and every pixel past 53 floors is shared out.
  // A resize listener would be the other way to do this and is the way this
  // project has repeatedly refused — `@container` and intrinsic sizing answer to
  // the WIDGET's width, which is what a cell in a row needs and what a listener
  // on the window cannot see.
  //
  // BOTH GRIDS TAKE THE SAME EXPRESSION, which the caption row's own comment
  // already insists on: if the two disagree about their tracks, every caption
  // drifts further from the week it names until one points at the wrong month.
  const tracks = `repeat(${STRIP_WEEKS}, minmax(var(--jjh-cell), 1fr))`;

  const months = wrap.createDiv({ cls: "jjh-strip-months" });
  months.style.gridTemplateColumns = tracks;
  for (const { label, week } of yearStripMonthLabels(cells)) {
    const el = months.createDiv({ cls: "jjh-strip-month", text: label });
    // +1: CSS grid lines are 1-based.
    el.style.gridColumnStart = String(week + 1);
  }

  const grid = wrap.createDiv({ cls: "jjh-strip" });
  grid.style.gridTemplateColumns = tracks;

  for (const c of cells) {
    const cell = grid.createDiv({ cls: "jjh-cell" });
    if (c.future) {
      // Days past today in the final column: held as invisible placeholders so
      // the strip's right edge stays straight instead of ragged.
      cell.addClass("is-future");
      continue;
    }
    const total = activityWeight(c);
    const bucket = activityBucket(total, max);
    if (bucket == null) cell.addClass("is-empty");
    else cell.addClass(`am-act-${bucket}`);
    if (c.iso === todayIso) cell.addClass("is-today");

    const label = cellLabel(c);
    cell.setAttribute("aria-label", label);
    cell.setAttribute("title", label);

    const file = fileByDate.get(c.iso);
    if (file) {
      cell.addClass("is-link");
      cell.setAttribute("role", "link");
      cell.addEventListener("click", () => void openFile(plugin.app, file));
    }
  }
}

// WHAT THIS BAND IS WAITING FOR, IN THE READER'S OWN WORDS. 4.35.1.
//
// This sentence said "as you add lessons and entries" on EVERY journal, so a
// Projects journal — whose notes are Updates and Decisions — was told to add
// lessons. It is the same leak 2.27 and 3.19.1 closed everywhere else, and
// `tables.ts` names the most visible one in its own comment: "Telling a Cooking
// journal to 'add a lesson'". This band is the copy those sweeps did not reach,
// and it survived for the usual reason — nobody had rendered a non-Study
// journal on this page until 4.35 shipped three.
//
// CAPPED AT THREE, then the generic word. The strip aggregates across every
// registered journal, so a vault with four of them has seven or more note types
// and naming them all would be a list where a sentence was wanted. Three is
// enough to be recognisably about THIS vault; past that, what the reader needs
// to know is that dated notes are the thing, not which seven kinds count.
//
// `kindPlural` rather than `plural(label)`, so a type that declares an
// irregular plural ("Practice") gets its own word here exactly as it does on
// the buttons and in the rollups.
const EMPTY_KIND_CAP = 3;

export function kindWords(types: JournalType[]): string {
  const words = types.flatMap((t) => t.kinds.map((k) => kindPlural(k).toLowerCase()));
  // De-duped: two journals that both call their notes "entries" should not make
  // the sentence say it twice.
  const unique = [...new Set(words)];
  if (unique.length === 0 || unique.length > EMPTY_KIND_CAP) return "notes";
  if (unique.length === 1) return unique[0];
  return `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
}

export function buildJournalsHeader(
  plugin: AlmanacPlugin,
  opts: JournalsHeaderOptions = {}
): HTMLElement {
  const types = registeredJournalTypes(plugin);
  const root = createDiv({ cls: "jjh-root" });

  // No journal types enabled: render nothing. journal.ts already writes an
  // explanatory callout into the section body for exactly this case, and a
  // hero full of zeroes above it would say the same thing twice, louder.
  if (types.length === 0) return root;

  const todayIso = today();
  const roots = types.map((t) => t.root);

  // ── Title row ──────────────────────────────────────────────────────────
  //
  // NO TITLE IN IT, AS OF 4.13.5, AND THAT IS THE THIRD TIME THIS PROJECT HAS
  // REMOVED THE SAME OBJECT. The band opened with `Journals` at 1.5em/800
  // directly under a section bar reading `📚 JOURNALS` — the same word, twenty
  // pixels apart, in two sizes. `buildAreaTitlebar` was deleted in 4.8.1 for
  // exactly this (*"two bars over one card, and the upper one repeated what the
  // lower one already shows"*) and the diary hero's went in 4.13.1 §3. This is
  // the copy those two sweeps did not reach, and it survived for the reason the
  // others did: nobody had rendered the page it is on.
  //
  // WHAT NAMES THE BAND NOW is the eyebrow, and it always named it better:
  // `LAST 12 MONTHS · STUDY` says the period the numbers cover and which
  // journals are in them, which is what a reader needs to know to read the four
  // figures under it. `Journals` said only what the bar above had just said.
  //
  // AND THE BARE CASE IS COVERED. `journals-header` is a keyword a reader can
  // write on their own note, where there is no bar and — since the directive is
  // not in `SECTION_TITLES` — no block head either. That band now opens with the
  // eyebrow. It is a smaller name than it had; it is also the only one of the two
  // that was ever true about what follows it.
  const head = root.createDiv({ cls: "jjh-head" });
  const left = head.createDiv({ cls: "jjh-left" });

  const typeNames = types.map((t) => t.name);
  left.createDiv({
    cls: "jjh-eyebrow",
    text: `Last 12 months · ${typeNames.join(" · ")}`,
  });

  const status = left.createDiv({ cls: "jjh-status", text: "Reading activity…" });

  if (opts.actions?.length) {
    const actions = head.createDiv({ cls: "jjh-actions" });
    for (const a of opts.actions) {
      const btn = actions.createEl("button", { cls: "journal-btn" });
      setIcon(btn.createSpan({ cls: "journal-btn-icon" }), a.icon);
      btn.createSpan({ cls: "journal-btn-label", text: a.label });
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        a.onClick();
      });
    }
  }

  // ── Stat strip ─────────────────────────────────────────────────────────
  // Placeholders: every number here depends on reading note bodies, which is
  // async. The cells ship with an ellipsis and fill on resolve rather than the
  // band popping into existence a beat after the rest of the section.
  const stats = root.createDiv({ cls: "jjh-stats" });
  const notesEl = addStat(stats, "…", "notes");
  const streakEl = addStat(stats, "…", "day streak");
  const longestEl = addStat(stats, "…", "longest streak");
  const openEl = addStat(stats, "…", "open tasks");

  // NO AVERAGE RATING HERE, and the omission is the decision.
  //
  // The band carried an "avg confidence" cell until 2.44. It was wrong three
  // ways at once, and the third is why it is gone rather than corrected:
  //
  //   • It averaged over every kind of every registered type, so Study's
  //     Practice notes — rated on `accuracy` — were counted into a Confidence
  //     figure. That is the leak 2.36 closed for topics-table,
  //     confidence-summary and journal-breakdown; this band was missed because
  //     its filter reasoned about types where the rule is about which kinds
  //     carry the tracker.
  //   • It printed `/5` beside a value from a tracker whose range is
  //     configurable, so a 1–10 Confidence read "7.2/5".
  //   • Scoping it correctly would have made it honest and still meaningless.
  //     The band spans every registered journal at once, and a type rates
  //     its kinds on whatever it likes — Study alone has two. One cell can name
  //     one tracker, so it either reports a number for part of what it covers
  //     and silently omits the rest, or goes back to averaging unlike
  //     quantities under a different heading.
  //
  // An average rating is a fact about one journal, and the widgets that say it
  // where it means something already exist: `topic-stats` on an index note,
  // `confidence-summary`, and the Progress rail on a subject's activity chart
  // — each scoped to one folder and one tracker. The four numbers left here
  // are counts of activity, which do compose across types.

  // ── Activity strip ─────────────────────────────────────────────────────
  const stripWrap = root.createDiv({ cls: "jjh-strip-wrap" });
  const loading = stripWrap.createDiv({
    cls: "jjh-strip-loading",
    text: "Loading activity…",
  });

  void collectRows(plugin, roots).then(({ rows: collected, fileByDate }) => {
    // The host may have been torn down (pane closed, LiveWidget rebuilt) while
    // the reads were in flight.
    if (!root.isConnected) return;
    loading.remove();

    const rows = aggregateActivity(collected, null, null);
    const cells = yearStripCells(rows, todayIso, STRIP_WEEKS);
    const s = yearStripStats(cells, todayIso);

    notesEl.setText(String(s.activeDays));
    const notesLabel = notesEl.parentElement?.querySelector(".jjh-stat-label");
    if (notesLabel) {
      notesLabel.setText(s.activeDays === 1 ? "active day" : "active days");
    }
    streakEl.setText(String(s.streak));
    const streakLabel = streakEl.parentElement?.querySelector(".jjh-stat-label");
    if (streakLabel) streakLabel.setText(s.streak === 1 ? "day streak" : "days streak");
    longestEl.setText(String(s.longest));
    openEl.setText(String(s.open));
    const openLabel = openEl.parentElement?.querySelector(".jjh-stat-label");
    if (openLabel) openLabel.setText(s.open === 1 ? "open task" : "open tasks");

    // Status line: say something true about the year rather than restating a
    // number that's already in the strip beside it.
    //
    // THE PREDICATE IS `collected.length`, NOT `activeDays` — 3.12. This read
    // `activeDays === 0` and said "No dated notes yet", which was false on any
    // vault whose dated notes carried no tasks: a Study root of twenty-four
    // lessons was told it had none, directly above a section listing them.
    //
    // 3.12.1 then made the two agree, by teaching the strip that a dated note
    // IS activity (activityWeight). So the middle state this once needed — has
    // notes, has no tasks — no longer exists: a vault with notes now has active
    // days too. The predicate stays `collected.length` anyway, because it is
    // the one that actually matches the sentence, and matching by coincidence
    // is how it came apart the first time.
    if (collected.length === 0) {
      status.setText(
        `No dated notes yet — activity appears here as you add ${kindWords(types)}.`
      );
    } else {
      const last = [...cells]
        .reverse()
        .find((c) => !c.future && activityWeight(c) > 0);
      const gap = last ? moment(todayIso).diff(moment(last.iso), "days") : 0;
      const when =
        gap === 0 ? "today" : gap === 1 ? "yesterday" : `${gap} days ago`;
      // Notes lead, because they are what most of these days are: a reader who
      // writes lessons and never ticks a box should not read a sentence that is
      // entirely about tasks.
      const notes = cells.reduce((n, c) => n + (c.future ? 0 : c.notes), 0);
      const tasks = s.done > 0 ? `, ${s.done} tasks completed` : "";
      status.setText(
        `${notes} dated ${notes === 1 ? "note" : "notes"}${tasks} over ${
          s.activeDays
        } active ${s.activeDays === 1 ? "day" : "days"} — last worked ${when}.`
      );
    }

    drawStrip(plugin, stripWrap, cells, s.max, todayIso, fileByDate);

    // START AT THE RECENT END — 3.12 §14.5.
    //
    // The strip is 53 columns of a 10px cell plus a 2.5px gap, so it is about
    // 660px wide and a phone is not. `.jjh-strip-wrap` has always scrolled,
    // which is right — a year of days is not legible squeezed into 360px, and
    // shrinking the cell to fit would trade one unreadable strip for another.
    //
    // What was wrong is where the scroll STARTED. The strip runs oldest to
    // newest, so a container resting at scrollLeft 0 shows the twelve months
    // ending several months ago and clips the current one off the right edge —
    // on the page a reader opens to see what they did this week. The month
    // captions made it worse by looking deliberate: `Aug Sep Oct … Feb`, with
    // February cut mid-word.
    //
    // Set after drawStrip so scrollWidth is the painted width, not the empty
    // wrap's. Clamped by the browser, so on a pane wide enough to show the
    // whole year this is a no-op rather than a jump.
    stripWrap.scrollLeft = stripWrap.scrollWidth;

    // Legend, under the grid. One legend for the whole strip: the shade scale
    // is a single window-wide max, so a second scale would be a lie.
    const legend = stripWrap.createDiv({ cls: "jjh-legend" });
    legend.createSpan({ cls: "jjh-legend-text", text: "Less" });
    legend.createDiv({ cls: "jjh-cell is-empty" });
    for (let b = 1; b <= 4; b++) {
      legend.createDiv({ cls: `jjh-cell am-act-${b}` });
    }
    legend.createSpan({ cls: "jjh-legend-text", text: "More" });
  });

  return root;
}
