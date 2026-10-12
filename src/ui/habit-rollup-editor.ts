// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Habits rollup's window: which habits this dashboard reports, in which
// order, at which grain, and whether their strips are drawn. 1.0.55, grouped
// by grain in 1.0.56.
//
// WHY A WINDOW AND NOT FOUR QUESTIONS IN *Edit sections…*. The answer is a
// LIST, and the section editor asks for folders, choices and flags — there is
// no question kind for "tick some of these and order them", and inventing one
// to be answered by a single section is the trade 4.47 made and 4.48 took back:
// *"a model of the band, beside the band"*. So the control sits on the thing it
// configures, and the window is the one the reader has already met twice (Tags,
// Habits, Categories) down to the row shape.
//
// NOTHING HERE WRITES UNTIL SAVE, and this window has less to lose than the
// others by it: the answer is one line of one note, and Cancel is the line
// staying as it is.

import { App, setIcon } from "obsidian";
import { EditorModal } from "./editor-modal";
import type ChronoAnvilPlugin from "../main";
import {
  NEEDS_GRAIN,
  habitRollupAnswer,
  resolveGrain,
  type HabitRollupAnswer,
} from "../trackers/habit-rollup";
import { TRACKER_CLASSES, TRACKER_CLASS_LABELS } from "../trackers/trackers";
import type { TrackerClass } from "../trackers/trackers";
import type { HabitType } from "../trackers/habits";

/** One habit the dashboard could report, and what it did in the period. */
export interface HabitRollupSeed {
  id: string;
  label: string;
  shown: boolean;
  // Which half of the rollup it is. A number habit's counts read differently
  // and its row says so; nothing else about this window branches on it.
  type: HabitType;
  // Every diary grain this habit is logged on, canonical order. One entry is
  // the ordinary case and gets no chooser — there is nothing to choose.
  grains: TrackerClass[];
  // The grain the reader has already chosen for it, or `null`. NOT the grain
  // it resolves to: see `rollupSeeds`.
  chosen: TrackerClass | null;
  // Where the card reads it, and `null` for a habit waiting to be told. Only
  // the count on the card uses this — the window recomputes it on every draw,
  // because a chooser the reader just moved has to land in its new group.
  grain: TrackerClass | null;
  // Slots that count: kept days for a boolean, logged ones for a number.
  done: number;
  // Elapsed slots — days, for a daily habit. `0` for a period that has not
  // begun, which is why the count is drawn as a sentence rather than a ratio.
  slots: number;
}

interface Row extends HabitRollupSeed {
  shown: boolean;
}

// The groups, in order: the five grains as the registry spells them, and then
// the habits nobody has placed.
//
// A TRAILING GROUP AND NOT A BADGE ON A ROW, because these are the habits the
// card is not drawing and the reader came here to find out why. A group with a
// heading saying so, holding every one of them, is the sentence the 1.0.55 card
// never printed.
const WAITING_HEAD = "Needs a grain";

export class HabitRollupEditor extends EditorModal {
  private rows: Row[];
  private strip: boolean;

  constructor(
    app: App,
    plugin: ChronoAnvilPlugin,
    period: string,
    seeds: readonly HabitRollupSeed[],
    // The registry's own order, which is what an all-ticked list collapses to.
    // Passed in rather than read here for `habitsForSurface`'s reason: one
    // answer to "what is a habit", in the model.
    private readonly registry: readonly string[],
    strip: boolean,
    // The grain of the dashboard this window was opened from, which is what a
    // multi-grain habit falls back to. Carried so `resolveGrain` can be asked
    // again after every chooser — the alternative is this window grouping by
    // a stale answer the card computed before the reader touched anything.
    private readonly dashboard: TrackerClass | null,
    private readonly onSave: (answer: HabitRollupAnswer) => Promise<void>
  ) {
    super(
      app,
      plugin,
      "Habits rollup",
      // The period, because every number in the list is scoped to it and a
      // window reachable from four dashboards must say which one opened it.
      period ? `What this rollup reports for ${period}` : "What this rollup reports",
      "Save"
    );
    this.rows = seeds.map((s) => ({ ...s }));
    this.strip = strip;
  }

  protected renderBody(): void {
    this.body.empty();
    this.body.addClass("ca-tags-editor");
    this.body.addClass("ca-hrollup-editor");
    this.renderRows();
    this.renderStrip();
  }

  // Which group a row is drawn under, asked again on every draw.
  //
  // `resolveGrain`, THE MODEL'S OWN FUNCTION, so this window and the card agree
  // by construction rather than by two people writing the same four clauses.
  // A seed always has at least one grain — `rollupSeeds` filters the rest out —
  // so the `null` arm cannot be reached and the waiting group is `NEEDS_GRAIN`
  // alone.
  private groupOf(row: Row): TrackerClass | typeof NEEDS_GRAIN {
    const at = resolveGrain(row.grains, row.chosen ?? undefined, this.dashboard);
    return at == null ? NEEDS_GRAIN : at;
  }

  private renderRows(): void {
    const wrap = this.body.createDiv({ cls: "ca-tags-section" });

    if (this.rows.length === 0) {
      wrap.createDiv({ cls: "ca-tags-heading", text: "Habits" });
      wrap.createDiv({
        cls: "ca-tags-empty",
        text: "This vault has no habits yet. Add one in Settings → ChronoAnvil → Trackers, or on any diary entry.",
      });
      return;
    }

    const groups = new Map<string, Row[]>();
    for (const row of this.rows) {
      const key = this.groupOf(row);
      const held = groups.get(key);
      if (held) held.push(row);
      else groups.set(key, [row]);
    }

    // EMPTY GROUPS ARE NOT DRAWN. Five headings on a vault whose habits are all
    // daily is four sentences about nothing, and the grouping only exists
    // because the reader has habits on more than one grain.
    for (const key of [...TRACKER_CLASSES, NEEDS_GRAIN] as const) {
      const members = groups.get(key);
      if (!members?.length) continue;
      this.renderGroup(wrap, key, members);
    }
  }

  private renderGroup(
    wrap: HTMLElement,
    key: TrackerClass | typeof NEEDS_GRAIN,
    members: readonly Row[]
  ): void {
    const waiting = key === NEEDS_GRAIN;
    const head = wrap.createDiv({ cls: "ca-hrollup-group" });
    if (!waiting) this.renderGroupTick(head, key, members);
    head.createSpan({
      cls: "ca-tags-heading",
      text: waiting ? WAITING_HEAD : TRACKER_CLASS_LABELS[key],
    });

    if (waiting) {
      wrap.createDiv({
        cls: "ca-hrollup-note",
        text: "These habits are logged on more than one kind of entry, and this dashboard’s own period is not one of them. Choose which entries to read each from — until then they are left off the card.",
      });
    }

    const list = wrap.createDiv({ cls: "ca-tags-list" });
    members.forEach((row, at) => this.renderRow(list, row, members, at));
  }

  // The group's own tick: all, some, or none of its members.
  //
  // IT SETS, IT DOES NOT INVERT. A group drawn half-ticked has two defensible
  // meanings for a click and only one useful one — a reader who sees "some"
  // and clicks wants all of them, not the complement of what they already have.
  private renderGroupTick(
    head: HTMLElement,
    key: TrackerClass,
    members: readonly Row[]
  ): void {
    const on = members.filter((m) => m.shown).length;
    const all = on === members.length;
    const tick = head.createEl("button", {
      cls: "ca-journal-btn-ghost ca-hrollup-tick ca-hrollup-group-tick",
      attr: { type: "button" },
    });
    tick.toggleClass("is-on", all);
    // MIXED IS ITS OWN CLASS AND NOT ITS OWN ICON. Three states drawn with
    // three glyphs invents a mark the reader has not met; the tick is the same
    // `minus` a row wears when it is off, and the class is what colours it.
    tick.toggleClass("is-mixed", on > 0 && !all);
    setIcon(
      tick.createSpan({ cls: "ca-journal-btn-icon" }),
      all ? "check" : "minus"
    );
    const name = TRACKER_CLASS_LABELS[key].toLowerCase();
    const why = all
      ? `Hide every habit read from ${name}`
      : `Show every habit read from ${name}`;
    tick.setAttr("aria-label", why);
    tick.setAttr("title", why);
    tick.addEventListener("click", () => {
      for (const row of members) row.shown = !all;
      this.clearError();
      this.renderBody();
    });
  }

  private renderRow(
    list: HTMLElement,
    row: Row,
    members: readonly Row[],
    at: number
  ): void {
    const el = list.createDiv({ cls: "ca-tags-row" });
    el.toggleClass("is-off", !row.shown);
    const waiting = this.groupOf(row) === NEEDS_GRAIN;

    // THE TICK IS THE ROW'S OWN BUTTON, not a checkbox, for the reason every
    // list in this plugin gives: a `<input type=checkbox>` in a modal row
    // brings its own alignment and its own focus ring, and three windows
    // already agree on the ghost button.
    //
    // AND A WAITING ROW HAS NO TICK AT ALL. The card cannot read the habit
    // until a grain is chosen, so a tick there is a control whose only effect
    // is to write an id the renderer then skips. The chooser beside it is the
    // one thing on the row that can change anything.
    //
    // NOTHING STANDS IN FOR THE MISSING TICK, and nothing needs to: every row
    // in the waiting group is missing it, so they align with each other, and a
    // spacer sized to a button in another file is a number that drifts.
    if (!waiting) {
      const tick = el.createEl("button", {
        cls: "ca-journal-btn-ghost ca-hrollup-tick",
        attr: { type: "button" },
      });
      tick.toggleClass("is-on", row.shown);
      setIcon(
        tick.createSpan({ cls: "ca-journal-btn-icon" }),
        row.shown ? "check" : "minus"
      );
      const why = row.shown
        ? `Hide ${row.label} from this rollup`
        : `Show ${row.label} in this rollup`;
      tick.setAttr("aria-label", why);
      tick.setAttr("title", why);
      tick.addEventListener("click", () => {
        row.shown = !row.shown;
        this.clearError();
        this.renderBody();
      });
    }

    el.createSpan({ cls: "ca-tags-name", text: row.label });

    // WHAT IT DID, BESIDE THE TICK THAT HIDES IT. A reader deciding what to
    // leave out is entitled to see what they are leaving out — and the count
    // is this period's, not the vault's, because that is what the rollup
    // would have said about it.
    el.createSpan({
      cls: "ca-hrollup-count",
      text: row.slots
        ? `${row.done} of ${row.slots}${row.type === "number" ? " logged" : ""}`
        : "nothing yet",
    });

    if (row.grains.length > 1) this.renderGrain(el, row);

    const move = (delta: number, icon: string, word: string): void => {
      const btn = el.createEl("button", {
        cls: "ca-journal-btn-ghost ca-hrollup-move",
        attr: { type: "button" },
      });
      setIcon(btn.createSpan({ cls: "ca-journal-btn-icon" }), icon);
      // WITHIN THE GROUP, AND THE INDEX SAYS SO. `at` is the row's place among
      // its own group's members, not in `this.rows` — across groups a move is
      // meaningless once the card draws them grouped, and the swap below is
      // between two rows that are certainly drawn next to each other.
      const to = at + delta;
      const can = to >= 0 && to < members.length;
      btn.disabled = !can;
      btn.toggleClass("is-static", !can);
      const label = can
        ? `Move ${row.label} ${word}`
        : `${row.label} is already ${delta < 0 ? "first" : "last"} here`;
      btn.setAttr("aria-label", label);
      btn.setAttr("title", label);
      btn.addEventListener("click", () => {
        if (!can) return;
        // SWAPPED IN `this.rows`, WHICH IS THE WRITTEN ORDER. The group's array
        // is a view; moving a row inside it and not in the list the answer is
        // built from is a gesture that survives until Save and then vanishes.
        const next = this.rows.slice();
        const from = next.indexOf(row);
        const onto = next.indexOf(members[to]);
        next[from] = members[to];
        next[onto] = row;
        this.rows = next;
        this.clearError();
        this.renderBody();
      });
    };
    move(-1, "chevron-up", "up");
    move(1, "chevron-down", "down");
  }

  // The chooser, for a habit logged on more than one kind of entry.
  //
  // ITS OWN GRAINS ONLY. A habit on daily and weekly entries offered a monthly
  // option is offered a grain with no slots in it, and the card would answer by
  // dropping the row — which is the 1.0.55 defect this round exists to end,
  // reintroduced through a dropdown.
  //
  // THE FIRST OPTION IS "NOT CHOSEN" AND IT IS A REAL ANSWER, not a prompt. A
  // habit left there follows this dashboard when the dashboard's period is one
  // of its grains and waits when it is not — which is the reader's own ruling,
  // and a note the reader never has to revisit when they add a grain later.
  private renderGrain(el: HTMLElement, row: Row): void {
    const sel = el.createEl("select", { cls: "dropdown ca-hrollup-grain" });
    sel.createEl("option", { value: "", text: "Not chosen" });
    for (const grain of row.grains) {
      sel.createEl("option", {
        value: grain,
        text: TRACKER_CLASS_LABELS[grain],
      });
    }
    sel.value = row.chosen ?? "";
    const why = `Which entries ${row.label} is read from`;
    sel.setAttr("aria-label", why);
    sel.setAttr("title", why);
    sel.addEventListener("change", () => {
      const picked = sel.value;
      row.chosen = row.grains.find((g) => g === picked) ?? null;
      this.clearError();
      this.renderBody();
    });
  }

  private renderStrip(): void {
    const wrap = this.body.createDiv({ cls: "ca-tags-section" });
    const row = wrap.createDiv({ cls: "ca-tags-row ca-hrollup-flag" });

    const btn = row.createEl("button", {
      cls: "ca-journal-btn-ghost ca-hrollup-tick",
      attr: { type: "button" },
    });
    btn.toggleClass("is-on", this.strip);
    setIcon(
      btn.createSpan({ cls: "ca-journal-btn-icon" }),
      this.strip ? "check" : "minus"
    );
    const why = this.strip ? "Hide the day strips" : "Show the day strips";
    btn.setAttr("aria-label", why);
    btn.setAttr("title", why);
    btn.addEventListener("click", () => {
      this.strip = !this.strip;
      this.renderBody();
    });

    row.createSpan({ cls: "ca-tags-name", text: "Day strips" });

    wrap.createDiv({
      cls: "ca-hrollup-note",
      text: "A strip draws one mark per day of this period, filled where the habit was kept — a year draws one mark per week instead. Hiding them leaves the rate and the streaks.",
    });
  }

  protected validate(): string | null {
    // THE GRAMMAR IS WHY THIS IS REFUSED, not taste. An empty list on the
    // directive means EVERY habit — the answer that follows the vault — so
    // "none of them" is a sentence the note cannot hold, and a save that wrote
    // it would come back as all of them ticked.
    if (this.rows.length && !this.rows.some((r) => r.shown)) {
      return "A rollup with no habits has nothing to report. Tick at least one, or remove the section from “Edit sections…”.";
    }
    // AND THE SAME SENTENCE FOR THE SAME OUTCOME ONE STEP FURTHER ON. A list of
    // habits that are all waiting for a grain draws an empty card, which is the
    // thing the refusal above exists to prevent — it is just spelled with ticks
    // somewhere instead of nowhere.
    const shown = this.rows.filter((r) => r.shown);
    if (shown.length && shown.every((r) => this.groupOf(r) === NEEDS_GRAIN)) {
      return `Every habit this rollup names is waiting for a grain. Choose which entries to read one from under “${WAITING_HEAD}”.`;
    }
    return null;
  }

  protected async commit(): Promise<void> {
    await this.onSave(
      habitRollupAnswer(
        this.rows.map((r) => ({ id: r.id, shown: r.shown, grain: r.chosen })),
        this.registry,
        this.strip
      )
    );
  }
}
