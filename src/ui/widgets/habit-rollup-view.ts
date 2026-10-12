// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Habits rollup, drawn (1.0.55).
//
// `-view`, FOR `time-grid-view.ts`'S REASON: the arithmetic is
// `trackers/habit-rollup.ts` and this is the DOM over it. The suffix is not
// decoration — `test/sources.ts` resolves a module by basename anywhere under
// `src/`, so two files called `habit-rollup.ts` make every source-shape sweep in
// the suite throw rather than fail.
//
// READ-ONLY THROUGHOUT, AND THAT IS THE DIFFERENCE FROM 1.0.54'S SECTION. The
// Habits section on a diary entry carries the three-state box, because the
// entry it sits on IS the day it writes to. Every mark here belongs to another
// note — thirty of them on a month — so there is nothing on this card a click
// could honestly change. 1.0.54 wrote the daily-only rule for exactly this
// reason and this is the other side of it.
//
// ONE ROW PER HABIT: a ring and a rate, the counts and the two runs, and under
// them a strip with one mark per day of the period. The strip is the reader's
// to turn off, and the rows are theirs to choose — see `HabitRollupEditor`,
// behind the door at the foot of the card.

import type { MarkdownPostProcessorContext } from "obsidian";
import { setIcon } from "obsidian";
import type ChronoAnvilPlugin from "../../main";
import { emptyCallout } from "../empty";
import { notify } from "../../core/notify";
import { statRing } from "../stat-strip";
import { periodCoverage, today } from "../../core/util";
import { formatPeriodLabel } from "../../charts/charts";
import { resolvePeriodBounds } from "../../charts/chart-widgets";
import { habitsForSurface } from "../../trackers/habits";
import { isManagedTemplate } from "../../trackers/entry-trackers";
import {
  habitRollupRows,
  noteWithHabitRollup,
  rollupWindow,
  parseHabitRollupArg,
  type HabitRollupAnswer,
  type HabitRollupRow,
  type HabitSlotReading,
} from "../../trackers/habit-rollup";
import { HabitRollupEditor, type HabitRollupSeed } from "../habit-rollup-editor";

// Past this many slots the strip groups them, which on the only period that
// reaches it means a year of days drawn as a year of weeks.
//
// GROUPED IN RUNS OF SEVEN FROM THE PERIOD'S OWN START, not into ISO weeks.
// Every mark then covers the same span, which is what makes two of them
// comparable — a calendar grouping gives the first bucket however many days are
// left in the week it begins in, and a three-day stub shaded over three days
// reads as a bad week rather than a short one.
const STRIP_CELL_CAP = 100;
const STRIP_GROUP = 7;

interface StripCell {
  // 0..1 of the group that was kept, or null where nothing in it was written.
  ratio: number | null;
  label: string;
  // A single-slot cell says done / not done / nothing, which is 1.0.54's
  // vocabulary; a grouped cell has a density instead. One mark cannot mean both.
  single: boolean;
  state: HabitSlotReading["state"];
  written: boolean;
}

// The marks for one row.
//
// A SLOT WITH NOTHING IN IT IS STILL A MARK. `drawStrip` makes the same promise
// about the chart strips — *"the gaps are the information: a strip that closed
// up its holes would show a perfect month to somebody who logged four days"* —
// and it is the whole reason `habitSlots` emits the empty days at all.
export function stripCells(slots: readonly HabitSlotReading[]): StripCell[] {
  if (slots.length <= STRIP_CELL_CAP) {
    return slots.map((slot) => ({
      ratio: slot.state === 1 ? 1 : 0,
      label: slot.label,
      single: true,
      state: slot.state,
      written: slot.written,
    }));
  }
  const out: StripCell[] = [];
  for (let at = 0; at < slots.length; at += STRIP_GROUP) {
    const group = slots.slice(at, at + STRIP_GROUP);
    const done = group.filter((s) => s.state === 1).length;
    const written = group.some((s) => s.written);
    out.push({
      ratio: written ? done / group.length : null,
      label: `${group[0].label} – ${group[group.length - 1].label}: ${done} of ${group.length}`,
      single: false,
      state: null,
      written,
    });
  }
  return out;
}

// What a row says beside its name. The rate is drawn as the ring, so this is
// the three facts the ring cannot carry.
export function rollupSub(row: HabitRollupRow): string {
  if (!row.slots.length) return "nothing yet";
  const parts = [`${row.done} of ${row.slots.length}`];
  // THE CURRENT RUN ONLY WHERE THERE IS ONE. "streak 0" is a true statement
  // that reads as a broken counter, and the best run below it already says
  // what the habit is capable of.
  if (row.current) parts.push(`streak ${row.current}`);
  if (row.best) parts.push(`best ${row.best}`);
  return parts.join(" · ");
}

// Which of the four shades a grouped mark wears.
//
// A FUNCTION BECAUSE THE ARITHMETIC IS THE CLAIM. `1 + floor(ratio * 3.999)`
// reads as a nudge and is in fact the whole mapping: the `.999` is what keeps a
// ratio of exactly 1 inside stop 4 instead of inventing a fifth, and a `4` or a
// `3` there is a mutant no drawing assertion can see. Lifted out so the four
// boundaries can be stated.
//
// STOP 1 IS THE FLOOR AND NOT "NONE". A group with nothing kept never reaches
// here — `drawStrip` leaves it classless, which is `tracker-stat.ts`'s rule for
// the same ramp — so the lightest shade means "some of this week", not "none".
export function stripShade(ratio: number): number {
  return 1 + Math.floor(ratio * 3.999);
}

function drawStrip(parent: HTMLElement, row: HabitRollupRow): void {
  const strip = parent.createDiv({ cls: "ca-hrollup-strip" });
  for (const cell of stripCells(row.slots)) {
    const el = strip.createDiv({ cls: "ca-hrollup-cell" });
    if (cell.single) {
      el.toggleClass("is-done", cell.state === 1);
      el.toggleClass("is-not-done", cell.state === 0);
      const said = cell.written
        ? cell.state === 1
          ? "done"
          : cell.state === 0
            ? "not done"
            : "nothing recorded"
        : "no entry for that day";
      el.setAttr("aria-label", `${cell.label}: ${said}`);
      continue;
    }
    // THE FOUR SHADES THE CHART STRIPS USE, so a colour means the same amount
    // in both places. No class at all for a group with nothing in it, rather
    // than a fifth stop named "none" — `drawStrip` in `tracker-stat.ts` argues
    // this at length and the base rule is what an empty cell looks like there.
    if (cell.ratio != null && cell.ratio > 0) {
      el.addClass(`ca-act-${stripShade(cell.ratio)}`);
    }
    el.setAttr("aria-label", cell.label);
  }
}

export function buildHabitRollup(
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext,
  rest: string
): HTMLElement {
  const app = plugin.app;
  const root = createDiv({ cls: "ca-hrollup" });
  const period = resolvePeriodBounds(plugin, ctx);

  // REFUSING WITH A REASON BEATS A TRAILING WINDOW, which is `entry-rollup`'s
  // own sentence and its own argument: this widget's whole scope is "the
  // dashboard's period", and a silent default would draw a plausible,
  // unrelated set of days. The registry's `needs: "period"` keeps it out of the
  // add list everywhere this is the only thing it could say.
  if (!period) {
    root.appendChild(
      emptyCallout(
        "calendar-range",
        "habit-rollup needs a dashboard period.",
        "Put it on a note carrying week-start, month-start, quarter-start or year-start."
      )
    );
    return root;
  }

  const answer = parseHabitRollupArg(rest);
  const todayIso = today();
  const habits = habitsForSurface(plugin.settings.trackers, null);
  // `win`, NOT `window`: a local of that name shadows the global inside this
  // function, and the next line anybody writes here is `window.moment(...)`.
  const win = rollupWindow(period.start, period.end, todayIso);
  const all = habitRollupRows(app, plugin.settings.paths, habits, win);
  const label = formatPeriodLabel(period.unit, period.start);

  if (!all.length) {
    root.appendChild(
      emptyCallout(
        "check-check",
        "No habits in this vault yet.",
        "Add one in Settings → ChronoAnvil → Trackers, or on any diary entry, and it is reported here."
      )
    );
    drawDoor(root, plugin, ctx, all, answer, label);
    return root;
  }

  // AN EXPLICIT LIST IS THE READER'S ORDER, NOT THE REGISTRY'S, and an id in it
  // that no longer exists is dropped rather than drawn as an empty row — a
  // habit can be renamed out from under a directive, which for a tracker means
  // a new habit, and the note saying otherwise is not evidence.
  const rows = answer.ids.length
    ? answer.ids
        .map((id) => all.find((r) => r.id === id))
        .filter((r): r is HabitRollupRow => r != null)
    : all;

  if (!rows.length) {
    root.appendChild(
      emptyCallout(
        "check-check",
        `No habits are shown for ${label}.`,
        "The habits this rollup names are no longer in the vault — choose some below."
      )
    );
    drawDoor(root, plugin, ctx, all, answer, label);
    return root;
  }

  const list = root.createDiv({ cls: "ca-hrollup-list" });
  for (const row of rows) {
    // ONE GRID FOR THE LIST, AND EVERY ROW `display: contents` — the 1.0.31
    // records-table fix. The same track list declared on each row AS ITS OWN
    // GRID sizes each `auto` track to that row's content, so the rates would
    // not line up down the card and the names would start at a different place
    // on every line.
    const el = list.createDiv({ cls: "ca-hrollup-row" });
    el.toggleClass("is-idle", row.done === 0);

    const ring = el.createDiv({ cls: "ca-stat-ring-wrap" });
    statRing(ring, row.rate ?? 0);
    el.createSpan({
      cls: "ca-hrollup-pct",
      text: row.rate == null ? "—" : `${Math.round(row.rate * 100)}%`,
    });
    el.createSpan({ cls: "ca-hrollup-name", text: row.label });
    el.createSpan({ cls: "ca-hrollup-sub", text: rollupSub(row) });

    const rate =
      row.rate == null
        ? `${row.label} — nothing logged for ${label}`
        : `${row.label} — ${Math.round(row.rate * 100)}% of ${label}, ${row.written} of ${row.slots.length} entries written`;
    ring.setAttr("aria-label", rate);
    ring.setAttr("title", rate);

    if (answer.strip && row.slots.length) drawStrip(el, row);
  }

  // HOW MUCH OF THE PERIOD IS BEHIND THE NUMBERS, where the numbers are a rate
  // over an unfinished period. The year view has said "so far" since it was
  // written, for the reason `periodCoverage` records.
  //
  // IT RIDES THE DOOR'S ROW rather than taking a line of its own: the door is
  // the only other thing at the foot of the card, and a card whose last two
  // lines are each one short phrase is two rules of chrome under the content.
  const cover = periodCoverage(period.start, period.end, todayIso);
  drawDoor(
    root,
    plugin,
    ctx,
    all,
    answer,
    label,
    cover.partial && cover.started
      ? `${cover.elapsed} of ${cover.total} days so far`
      : null
  );
  return root;
}

// The door onto the window.
//
// A TRAILING ROW, NOT A COG ON THE BAR, and the reason is a defect this plugin
// already shipped once: the Categories control is hosted by the `header:` line
// above its fence, and a fence written without one had no door at all until
// 1.0.49 §1 gave the field head a second slot. This section's bar is removable
// — *Show as widget* takes it off — so a control that lived there would come
// and go with it. A row inside the card is always inside the card.
function drawDoor(
  root: HTMLElement,
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext,
  all: readonly HabitRollupRow[],
  answer: HabitRollupAnswer,
  label: string,
  // The coverage sentence, which only a drawn rollup over a running period has.
  note: string | null = null
): void {
  const foot = root.createDiv({ cls: "ca-hrollup-foot" });
  const text = all.length ? "Choose habits…" : "Add a habit";
  // THE SAME DOOR AS THE HABITS SECTION'S, down to the class, because it is the
  // same control in the same family: a dashed row at the foot of a habits card
  // that opens the window behind it. Two spellings of one shape is what 1.0.49
  // spent a round undoing.
  const door = foot.createEl("button", {
    cls: "ca-habits-door",
    attr: { type: "button", "aria-label": text, title: text },
  });
  setIcon(door.createSpan({ cls: "ca-journal-btn-icon" }), "settings-2");
  door.createSpan({ text });

  // NOT ON A MANAGED TEMPLATE, which is the Habits cell's refusal and the same
  // reason: a stored template is regenerated, so an answer written into one is
  // a change the next sync deletes.
  if (isManagedTemplate(plugin, ctx.sourcePath)) {
    door.disabled = true;
    door.setAttr("title", "This is a stored template — open a dashboard to choose its habits.");
  } else {
    door.addEventListener("click", () => {
      new HabitRollupEditor(
        plugin.app,
        plugin,
        label,
        rollupSeeds(all, answer.ids),
        all.map((r) => r.id),
        answer.strip,
        (ids, strip) => apply(plugin, ctx, door, ids, strip)
      ).open();
    });
  }

  // AFTER THE DOOR, AND NOT BEHIND THE REFUSAL ABOVE IT. The template branch
  // used to `return` here, which would have taken the coverage sentence with
  // it — the one fact on this row that has nothing to do with whether the
  // reader may edit the line.
  if (note) foot.createSpan({ cls: "ca-hrollup-foot-note", text: note });
}

// The window's rows: every habit the vault has, ticked where the card shows it.
//
// THE READER'S ORDER FIRST, because it is the card's — a reader who moved three
// habits meets them where they left them. The rest follow in registry order,
// since a habit the line does not name has no place of its own yet.
//
// AN EMPTY LIST TICKS EVERYTHING, which is the one place the grammar has to be
// restated in the UI: the default means "follow the vault", so the window a
// reader opens on an unanswered section shows them what they are starting from
// rather than an empty list they have to fill in.
export function rollupSeeds(
  all: readonly HabitRollupRow[],
  ids: readonly string[]
): HabitRollupSeed[] {
  const named = ids.length ? ids : all.map((r) => r.id);
  const place = (id: string): number => {
    const at = named.indexOf(id);
    return at === -1 ? named.length : at;
  };
  return all
    .map((r, i) => ({
      id: r.id,
      label: r.label,
      shown: named.includes(r.id),
      done: r.done,
      slots: r.slots.length,
      // Registry position, so the hidden tail keeps the order Settings has it
      // in rather than whatever the sort happens to do with equal keys.
      i,
    }))
    .sort((a, b) => place(a.id) - place(b.id) || a.i - b.i)
    .map(({ i: _i, ...seed }) => seed);
}

// ── the write ─────────────────────────────────────────────────────────────
//
// `getSectionInfo` IS ASKED AT THE SAVE, NEVER CAPTURED AT RENDER, which is
// `block-drag.ts`'s rule and its reason: it re-reads the live document, and
// every write to this note moves the lines under a range that was kept. The
// file is read again for the same reason.
async function apply(
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext,
  anchor: HTMLElement,
  ids: readonly string[],
  strip: boolean
): Promise<void> {
  const info = ctx.getSectionInfo(anchor);
  const file = plugin.app.vault.getFileByPath(ctx.sourcePath);
  if (!info || !file) {
    notify.fail("ChronoAnvil cannot edit this rollup here — it is not in an editable note.");
    return;
  }
  const text = await plugin.app.vault.read(file);
  const lines = text.split("\n");
  const out = noteWithHabitRollup(
    lines,
    { from: info.lineStart + 1, to: info.lineEnd },
    lines
      .slice(info.lineStart + 1, info.lineEnd)
      .find((l) => /^\s*habit-rollup(:|\s*$)/.test(l)) ?? "",
    ids,
    strip
  );
  if (!out) {
    // BOTH ANSWERS ARE REPORTED, and this is the one the window has already
    // ruled out: Save with nothing changed closes without a write, so a `null`
    // here means the line is no longer where the block says it is.
    notify.fail("ChronoAnvil could not find this rollup's line in the note.");
    return;
  }
  // No repaint call: the widget is live over its own note, so the write it just
  // made is the event that redraws it.
  await plugin.app.vault.modify(file, out.join("\n"));
}
