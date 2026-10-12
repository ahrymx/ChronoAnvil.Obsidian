// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Habits rollup's window: which habits this dashboard reports, in which
// order, and whether their strips are drawn. 1.0.55.
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
import { habitRollupIds } from "../trackers/habit-rollup";

/** One habit the dashboard could report, and what it did in the period. */
export interface HabitRollupSeed {
  id: string;
  label: string;
  shown: boolean;
  done: number;
  // Elapsed slots — days, for a daily habit. `0` for a period that has not
  // begun, which is why the count is drawn as a sentence rather than a ratio.
  slots: number;
}

interface Row extends HabitRollupSeed {
  shown: boolean;
}

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
    private readonly onSave: (ids: string[], strip: boolean) => Promise<void>
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

  private renderRows(): void {
    const wrap = this.body.createDiv({ cls: "ca-tags-section" });
    wrap.createDiv({ cls: "ca-tags-heading", text: "Habits" });

    if (this.rows.length === 0) {
      wrap.createDiv({
        cls: "ca-tags-empty",
        text: "This vault has no habits yet. Add one in Settings → ChronoAnvil → Trackers, or on any diary entry.",
      });
      return;
    }

    const list = wrap.createDiv({ cls: "ca-tags-list" });
    this.rows.forEach((row, at) => {
      const el = list.createDiv({ cls: "ca-tags-row" });
      el.toggleClass("is-off", !row.shown);

      // THE TICK IS THE ROW'S OWN BUTTON, not a checkbox, for the reason every
      // list in this plugin gives: a `<input type=checkbox>` in a modal row
      // brings its own alignment and its own focus ring, and three windows
      // already agree on the ghost button.
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

      el.createSpan({ cls: "ca-tags-name", text: row.label });

      // WHAT IT DID, BESIDE THE TICK THAT HIDES IT. A reader deciding what to
      // leave out is entitled to see what they are leaving out — and the count
      // is this period's, not the vault's, because that is what the rollup
      // would have said about it.
      el.createSpan({
        cls: "ca-hrollup-count",
        text: row.slots ? `${row.done} of ${row.slots}` : "nothing yet",
      });

      const move = (delta: number, icon: string, word: string): void => {
        const btn = el.createEl("button", {
          cls: "ca-journal-btn-ghost ca-hrollup-move",
          attr: { type: "button" },
        });
        setIcon(btn.createSpan({ cls: "ca-journal-btn-icon" }), icon);
        const to = at + delta;
        const can = to >= 0 && to < this.rows.length;
        btn.disabled = !can;
        btn.toggleClass("is-static", !can);
        const label = can
          ? `Move ${row.label} ${word}`
          : `${row.label} is already ${delta < 0 ? "first" : "last"}`;
        btn.setAttr("aria-label", label);
        btn.setAttr("title", label);
        btn.addEventListener("click", () => {
          if (!can) return;
          const next = this.rows.slice();
          next.splice(to, 0, ...next.splice(at, 1));
          this.rows = next;
          this.clearError();
          this.renderBody();
        });
      };
      move(-1, "chevron-up", "up");
      move(1, "chevron-down", "down");
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
    return null;
  }

  protected async commit(): Promise<void> {
    await this.onSave(habitRollupIds(this.rows, this.registry), this.strip);
  }
}
