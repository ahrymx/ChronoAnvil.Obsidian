// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Habits section (1.0.54).
//
// ── WHY A TRACKER TYPE GETS A SECTION ─────────────────────────────────────
//
// Every tracker on a diary entry is drawn in one grid of fixed cells —
// `--ca-tracker-cell-h`, 66px, `overflow: hidden` — which is the right box for a
// number, a scale or a time pair and the wrong box for a LIST. The boolean
// trackers fold into one of those cells, and `85-tracker-controls.css` spends
// forty lines of arithmetic fitting two rows of 14px chips into 36px of it: four
// habits is the comfortable maximum, and a chip has room for a name and a tick
// and nothing else. The reader asked for the type to be able to leave the grid,
// and this is where it goes.
//
// WHAT THE SECTION SAYS THAT THE CELL CANNOT. One row per habit, with the week
// it sits in behind the name — seven days read from the entries either side of
// this one. That is the whole reason a habit wants more than a chip: a habit is
// a thing you keep, and the only question a chip can answer is today's.
//
// THE CELL IS NOT DELETED AND NOTHING IS MIGRATED. The note's `tracker:<id>`
// lines stay exactly where they are; the grid's fold-in reads
// `noteHasHabitsSection` and stands down while this section is on the note. Take
// the section off and the cell comes back, with its chips and its readings,
// because the only thing that ever changed was which of the two drew them.
//
// ── WHY IT IS NOT A PAGE WIDGET ───────────────────────────────────────────
//
// The boxes write onto the host note's own frontmatter. On a dashboard that is
// the dashboard's frontmatter, which is not where a reading lives — the same
// argument `NOT_PAGE_WIDGETS` makes for `tracker` and `sleep`, drawn full width
// instead of inline. A page wants a habits SUMMARY (a rate, a streak, a density
// strip) and that is a different widget, read-only, for a later release.

import type { MarkdownPostProcessorContext } from "obsidian";
import { setIcon } from "obsidian";
import { frontmatterOf } from "../../core/util";
import { emptyCallout } from "../empty";
import {
  describeHabitState,
  habitLabelOf,
  habitWeek,
  habitWeekReadings,
  habitsOnNote,
  type HabitEntry,
  type HabitReading,
  type HabitState,
} from "../../trackers/habits";
import { isManagedTemplate, noteSurfaceOf } from "../../trackers/entry-trackers";
import { entryDateKey } from "../../diary/nav";
import type { TrackerClass } from "../../trackers/trackers";
import { openHabitsWindow, wireHabit } from "./tracker-controls";
import type { EntryControlHost } from "./controls";

// What the door says, which depends on whether there is anything behind it.
//
// ONE CONTROL, TWO VERBS. The window adds, renames, reorders and removes, so
// "Manage" is what it does — but a reader whose section is empty has one thing
// to do in there and the row is the only thing on the card. Naming the act
// rather than the window is what the Tags cell does with "+ Add tags".
export function habitsDoorLabel(count: number): string {
  return count ? "Manage habits" : "Add a habit";
}

// One day's mark. The class is the reading; the title is the fact behind it.
//
// TWO FACTS AND ONE MARK — see `HabitReading.written`. An unwritten day and an
// unanswered habit are both "nothing recorded" and look identical on purpose;
// the tooltip is where there is room to say which, and it is also the only
// place the DATE can be said, since a 10px dot cannot carry one.
function paintDay(
  dot: HTMLElement,
  day: { label: string; state: HabitState; written: boolean },
  name: string
): void {
  dot.toggleClass("is-done", day.state === 1);
  dot.toggleClass("is-not-done", day.state === 0);
  dot.toggleClass("is-blank", day.state == null);
  const said = day.written
    ? describeHabitState(day.state)
    : "no entry for that day";
  const text = `${name} — ${day.label}: ${said}`;
  dot.setAttr("title", text);
  dot.setAttr("aria-label", text);
}

export function buildHabitsSection(
  deps: EntryControlHost,
  ctx: MarkdownPostProcessorContext,
  noteText: string
): HTMLElement {
  const plugin = deps.plugin;
  const app = plugin.app;
  const root = createDiv({ cls: "ca-habits-section" });

  const surface = noteSurfaceOf(app, plugin, ctx.sourcePath);
  const entries = habitsOnNote(plugin.settings.trackers, noteText, surface);

  // ── WHICH WEEK, AND WHEN THERE IS NONE ──────────────────────────────
  //
  // THE GRAIN COMES OFF THE SURFACE, which is `surfaceFolders`' own read
  // (`surface.classes[0]`) rather than a second classification of the path, and
  // the date comes off `entryDateKey` — the one function that knows where each
  // grain keeps its key, written because the three copies that preceded it did
  // not all agree.
  //
  // DAILY ONLY, AND THE REASON IS NOT LAYOUT. The box writes the HOST note's
  // property. On a weekly entry the seven columns are seven other notes, so
  // ticking the box would move nothing on the strip beside it — a control and a
  // readout that disagree, on one row, about one habit. A non-daily entry gets
  // the rows and no strip.
  const grain: TrackerClass | null =
    surface?.kind === "diary" ? surface.classes[0] : null;
  const file = deps.fileOf(ctx);
  const iso =
    file && grain ? entryDateKey(frontmatterOf(app, file), grain) : "";
  const week = grain === "daily" ? habitWeek(iso) : [];

  if (!entries.length) {
    root.appendChild(
      emptyCallout(
        "check-check",
        "No habits on this entry yet.",
        "Add one below, or in Settings → ChronoAnvil → Trackers."
      )
    );
    drawDoor(root, deps, entries, ctx);
    return root;
  }

  const list = root.createDiv({ cls: "ca-habits-list" });

  // The column heads, off the same seven days the dots are drawn from — never a
  // typed `["M","T",…]`, which is a second list that can disagree about which
  // column is which.
  if (week.length) {
    const heads = list.createDiv({ cls: "ca-habits-heads" });
    // The two cells a head has nothing to put in. Present rather than skipped:
    // the row is a three-column grid and a strip that landed in the name's
    // track would sit over the names instead of over the dots.
    heads.createSpan({ cls: "ca-habits-pad" });
    heads.createSpan({ cls: "ca-habits-name" });
    const strip = heads.createDiv({ cls: "ca-habit-week" });
    for (const day of week) {
      const head = strip.createSpan({
        cls: "ca-habit-dow",
        text: day.head,
        attr: { title: day.label },
      });
      // THIS ENTRY'S COLUMN IS MARKED ONCE, ON ITS HEAD, and not on each of the
      // dots under it. Seven marks down a strip of five rows is a second
      // vocabulary competing with the readings themselves — the 1.0.52 lesson
      // about a calendar cell asked to carry three facts — and a column is the
      // thing being named, which is what a head is for.
      if (day.iso === iso) head.addClass("is-now");
    }
  }

  for (const entry of entries) {
    const name = habitLabelOf(entry.def, entry.directive);
    const row = list.createDiv({ cls: "ca-habits-row" });
    // The chip's and the window's own control, for the third time: same
    // classes, same glyphs, same three-state cycle, so one habit is one
    // control wherever a reader meets it.
    const box = row.createEl("button", {
      cls: "ca-journal-habit-box",
      attr: { type: "button" },
    });
    row.createSpan({ cls: "ca-habits-name", text: name });

    const dots: { day: HabitReading; el: HTMLElement }[] = [];
    if (week.length) {
      const strip = row.createDiv({ cls: "ca-habit-week" });
      const readings = habitWeekReadings(app, plugin.settings.paths, entry.def.id, iso);
      for (const day of readings) {
        const dot = strip.createSpan({ cls: "ca-habit-day" });
        paintDay(dot, day, name);
        dots.push({ day, el: dot });
      }
    }

    // THE BOX IS THE PRESS, NOT THE ROW. A row-wide press target would make a
    // click on Wednesday's dot tick today — the one gesture this section must
    // not have, since the dots are a readout and six of them are other notes.
    wireHabit(deps, box, box, entry.def, ctx, (known) => {
      row.toggleClass("is-done", known === 1);
      row.toggleClass("is-not-done", known === 0);
      // THIS ENTRY'S OWN COLUMN IS ONE OF THE SEVEN, so a tick that did not
      // move it would read as a bug in the strip. Repainted from the same
      // function the first paint used, with the day's own facts kept.
      const here = dots.find(({ day }) => day.iso === iso);
      if (here) {
        paintDay(
          here.el,
          { ...here.day, state: known === 1 ? 1 : known === 0 ? 0 : null, written: true },
          name
        );
      }
    });
  }

  drawDoor(root, deps, entries, ctx);
  return root;
}

// The door onto the Habits window.
//
// A ROW AT THE END, NOT A ＋ IN THE CORNER, and that is a departure from the
// sketch this section was agreed from. The corner of a full-width card is where
// the week's last column head sits, so a pinned button would land on top of
// Sunday — the Habits cell can pin one because its own top-right is empty by
// construction (a short, left-aligned eyebrow), and this card's is not. A row
// has room for a verb, which the corner never did.
function drawDoor(
  root: HTMLElement,
  deps: EntryControlHost,
  entries: readonly HabitEntry[],
  ctx: MarkdownPostProcessorContext
): void {
  const label = habitsDoorLabel(entries.length);
  const door = root.createEl("button", {
    cls: "ca-habits-door",
    attr: { type: "button", "aria-label": label, title: label },
  });
  setIcon(door.createSpan({ cls: "ca-journal-btn-icon" }), "plus");
  door.createSpan({ text: label });
  // NOT ON A MANAGED TEMPLATE, which is the cell's own refusal and the same
  // reason: a template's tracker list is generated from Settings, so a control
  // that edited it would be writing something the next sync deletes. The rows
  // still draw — a template holding habits still has to show them.
  if (isManagedTemplate(deps.plugin, ctx.sourcePath)) door.disabled = true;
  else door.addEventListener("click", () => openHabitsWindow(deps, entries, ctx));
}
