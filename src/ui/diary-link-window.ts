// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Link to diary window (1.0.51, and a calendar in 1.0.52).
//
// WHAT IT REPLACES. A `SuggestModal` holding every period of every grain within
// reach of one anchor, grouped by grain, with Obsidian's own search box on top.
// Two things were wrong with it and only one of them was the control:
//
//   the list reached BACKWARDS ONLY, so a page dated in September could not be
//   filed under a day in October by any gesture the picker offered;
//
//   and the search box could not rescue that, because a suggester FILTERS THE
//   LIST IT WAS HANDED. Typing a date outside the window matched no row and the
//   reader was told *No results found* about a day that plainly exists.
//
// So the list runs both ways and pages further on demand, and the box above it
// AIMS the list rather than filtering it whenever what was typed is a date.
// `diary-link.ts` holds both halves — `periodsAround` and `anchorFromQuery` —
// because both are arithmetic and neither needs a vault.
//
// WHY A WINDOW. A suggester is a single pick that closes on contact, and this
// action had grown two more jobs: saying which periods the page is ALREADY
// filed under, and taking one of those back. It goes the way the Tags, Habits
// and Categories lists went — one door, a tick per row, nothing written until
// Save — which is the fourth time that shape has been the answer.
//
// A TICK, NOT A PICK. The row says what is true now; the tick says what should
// be true; the difference between the two is the write. Filing a page under
// both the day and the month used to be the action run twice, and unfiling it
// had no gesture at all.
//
// ── TWO SHAPES, NOT ONE (1.0.52) ────────────────────────────────────────
//
// The Days tab is a MONTH CALENDAR and the other four are lists. That is one
// window drawing two things, which is a cost, and it is paid for the reason
// `monthGrid` gives: a month is thirty periods with an obvious second
// dimension, and every row of a calendar is the ISO week the reader asked the
// days to be grouped into. Five to twelve periods have no such structure, so
// the Weeks, Months, Quarters and Years tabs are the same list they were.
//
// WHAT THE TWO SHAPES SHARE, and it is everything that matters: one anchor, one
// find box, one `picked` map, one tab strip with the same counts, and one Save.
// `paintRows` is the only fork — `paintGrid` or `paintList` — and the four
// controls that belong to one shape (the month stepper, the two pagers) are
// built once and hidden by `ca-dl-off` rather than being created and destroyed,
// so switching tabs cannot lose the find box's caret.
//
// ── AND A SAVE SAYS WHERE IT LANDS (1.0.52) ─────────────────────────────
//
// Two selects under the list: which attachments field, and which category on
// it. ONE PAIR FOR THE WHOLE SAVE — the reader's call — because a Save is
// almost always one period and a pair of dropdowns per ticked row would be a
// column of controls answering one question. What they mean, and what gets
// created when an entry has neither, is `landLink`'s business and not this
// file's: the window chooses, the model writes.
//
// ── ONE VOCABULARY, DRAWN TWO WAYS (1.0.53) ─────────────────────────────
//
// *"improve all tabs to improve readability and smart coloring"*. Five
// screenshots, and the complaint is visible in four of them: the calendar had
// three marks and the lists had none, so every row was the same weight and the
// same colour and the one thing that differed between them — whether that
// entry exists — was a phrase halfway down a faint second line that every row
// repeated.
//
// THE FOUR STATES NOW LOOK THE SAME ON BOTH SHAPES, and `marks()` is the one
// place that turns a pair of booleans into classes:
//
//   already written   a dot — under the number in a cell, in a slot of its own
//                     on a row, and the row's label in full contrast rather
//                     than muted. A period with no entry yet is a period a
//                     Save would CREATE, which is worth seeing before pressing
//                     it;
//   linked            the accent — a filled cell, an accent edge down a row;
//   to link           an accent ring, and the state word in the accent;
//   to remove         an ERROR-COLOURED ring and word, because it is the one
//                     state that takes something away and it read identically
//                     to `to link` until this round.
//
// The legend names three of them off `STATE_KEYS` and now sits under all five
// tabs rather than under the calendar alone, because the marks are on all five.
// Two more readability jobs, same round: a list breaks itself on the grain
// above it (`groupOf`), and every tab marks the period we are in (`isNow`) —
// a landmark the four lists had none of.
//
// ── WHAT THIS FILE DOES NOT REDRAW ──────────────────────────────────────
//
// `renderBody` builds the frame ONCE and `paint()` refreshes the parts that
// change — the tab strip, the rows, the month, the caption and the sentence
// under them. Going through `refreshBody()` on every keystroke would rebuild
// the find box the reader is typing in and take the caret with it, which is the
// bug the tags window records against its own rename field.

import { App, TFile, setIcon } from "obsidian";
import { EditorModal } from "./editor-modal";
import type ChronoAnvilPlugin from "../main";
import { CLASS_DEFS, TRACKER_CLASSES } from "../trackers/trackers";
import type { TrackerClass } from "../trackers/trackers";
import { moment, today } from "../core/util";
import {
  REACH,
  anchorFromQuery,
  attachSections,
  defaultDest,
  describeTarget,
  groupOf,
  isNow,
  monthGrid,
  periodsAround,
  rowSentence,
  stateWord,
  targetId,
  weekdayHeads,
} from "../diary/diary-link";
import type {
  DiaryLinkEdit,
  DiaryRow,
  DiaryTarget,
  LinkCategory,
  LinkDest,
} from "../diary/diary-link";

// "Days", "Weeks", … — the grain's own word for its period, which is the same
// string the old suggester used for its group headings. Off `periodNoun` rather
// than off `label`, because `label` is "Daily" and a tab is a noun.
export function grainTabLabel(grain: TrackerClass): string {
  const noun = CLASS_DEFS[grain].periodNoun;
  return `${noun.charAt(0).toUpperCase()}${noun.slice(1)}s`;
}

// What the marks mean, said once and read twice — by the legend and by the
// class list every cell and every row wears. A legend written out separately
// from the classes it explains is a legend that goes stale, and three of these
// four words are `stateWord`'s own, read from it rather than spelled again.
//
// FOUR KEYS AS OF 1.0.53, where there were three: `to link` and `to remove`
// shared one mark and one sentence, which is the two halves of the pending
// write looking identical right up to the moment Save does opposite things
// with them.
const STATE_KEYS: readonly { cls: string; text: string }[] = [
  { cls: "is-written", text: "already written" },
  { cls: "is-on", text: stateWord(true, true) },
  { cls: "is-adding", text: stateWord(false, true) },
  { cls: "is-dropping", text: stateWord(true, false) },
];

export class DiaryLinkWindow extends EditorModal {
  // ONE ANCHOR FOR THE WHOLE WINDOW, five windows onto it. Pressing *Today* on
  // the Days tab and then switching to Months should land on this month, not on
  // whatever month the tab was left at — the reader moved the list, not one
  // list of five. The month stepper moves the same anchor, which is why
  // stepping to November on the Days tab and switching to Months opens on
  // November.
  private anchor: string;
  private grain: TrackerClass = "daily";
  private query = "";
  // How far each list tab has been paged, in its own periods. Per grain because
  // a page of years and a page of days are not the same gesture's worth — and
  // unread by the Days tab, which cycles by month instead.
  private back: Record<TrackerClass, number>;
  private fwd: Record<TrackerClass, number>;
  // Only the rows whose answer DIFFERS from the file's. A tick put back where
  // it was leaves nothing behind, so `edits()` is this map's values and the
  // sentence under the list cannot drift from what Save will do.
  private picked = new Map<string, DiaryLinkEdit>();
  // Which shelf a Save lands on. One answer for the whole window.
  private dest: LinkDest = defaultDest();
  // The last calendar cell the reader touched, for the caption that says what a
  // cell has no room to. Null until they touch one, and the caption then names
  // the day the grid is anchored on — so it is never blank and never a guess.
  private touched: string | null = null;

  private tabsEl!: HTMLElement;
  private monthEl!: HTMLElement;
  private laterEl!: HTMLElement;
  private earlierEl!: HTMLElement;
  private listEl!: HTMLElement;
  private legendEl!: HTMLElement;
  private captionEl!: HTMLElement;
  private noteEl!: HTMLElement;

  constructor(
    app: App,
    plugin: ChronoAnvilPlugin,
    page: TFile,
    anchorIso: string,
    // The date the page already states, or null. Not read for the anchor — the
    // caller has already done that — but for the shortcut button and for the
    // sentence that says the property will not be touched.
    private readonly stated: string | null,
    private readonly linked: Set<string>,
    // The shelves the Category field offers, read off the entries around the
    // anchor before the window opened. A render is not asynchronous, so this
    // arrives finished — `linkedPeriods`' posture, for its reason.
    private readonly cats: readonly LinkCategory[],
    private readonly onSave: (
      edits: DiaryLinkEdit[],
      dest: LinkDest
    ) => Promise<void>
  ) {
    super(
      app,
      plugin,
      "Link to diary",
      `Which diary entries ${page.basename} is filed under`,
      "Save"
    );
    this.anchor = anchorIso;
    this.back = { daily: 0, weekly: 0, monthly: 0, quarterly: 0, yearly: 0 };
    this.fwd = { daily: 0, weekly: 0, monthly: 0, quarterly: 0, yearly: 0 };
    for (const grain of TRACKER_CLASSES) this.back[grain] = REACH[grain];
  }

  // ── the frame ────────────────────────────────────────────────────────

  protected renderBody(): void {
    this.body.empty();
    this.body.addClass("ca-tags-editor");
    this.body.addClass("ca-dl-window");

    this.tabsEl = this.body.createDiv({ cls: "ca-dl-tabs" });

    const find = this.body.createDiv({ cls: "ca-dl-find" });
    const box = find.createEl("input", {
      cls: "ca-tags-input ca-dl-query",
      attr: {
        type: "text",
        // SHORT ENOUGH TO READ. The five forms did not fit the box at any
        // window width this modal has, so what was on screen was a clipped
        // list ending mid-example. Two forms fit, and the title says the rest.
        placeholder: "Find a date — 2026-10-12, 2026-W41…",
        title:
          "A date aims the list: 2026-10-12, 2026-10, 2026-W41, 2026-Q4, 2026, with or without the entry's prefix. Anything else narrows it.",
        "aria-label": "Aim the list at a date, or narrow it by name",
      },
    });
    box.value = this.query;
    box.addEventListener("input", () => {
      this.query = box.value;
      this.paint();
    });
    this.shortcut(find, "Today", today(), "Aim the list at today");
    if (this.stated) {
      this.shortcut(
        find,
        this.stated,
        this.stated,
        `Aim the list at this note's own date, ${this.stated}`
      );
    }

    this.monthEl = this.body.createDiv({ cls: "ca-dl-month" });
    this.laterEl = this.pager(this.body, 1, "chevron-up", "Later");
    this.listEl = this.body.createDiv({ cls: "ca-tags-list ca-dl-list" });
    this.earlierEl = this.pager(this.body, -1, "chevron-down", "Earlier");

    this.legendEl = this.body.createDiv({ cls: "ca-dl-legend" });
    for (const key of STATE_KEYS) {
      const item = this.legendEl.createSpan({ cls: "ca-dl-key" });
      item.createSpan({ cls: `ca-dl-key-mark ${key.cls}` });
      item.createSpan({ text: key.text });
    }
    this.captionEl = this.body.createDiv({ cls: "ca-dl-caption" });

    this.destFields(this.body);
    this.noteEl = this.body.createDiv({ cls: "ca-habits-note ca-dl-note" });
    this.paint();
  }

  // A button that moves the anchor and clears whatever was typed — because a
  // query AIMS the list, so leaving one in the box would aim it straight back.
  private shortcut(host: HTMLElement, text: string, iso: string, why: string): void {
    const btn = host.createEl("button", {
      cls: "ca-dl-jump",
      text,
      attr: { type: "button", title: why, "aria-label": why },
    });
    btn.addEventListener("click", () => {
      this.aim(iso);
    });
  }

  // *Later* and *Earlier*: another page of this grain's periods in one
  // direction. `delta` is +1 for the future, which is the direction that did
  // not exist before 1.0.51.
  private pager(
    host: HTMLElement,
    delta: number,
    icon: string,
    word: string
  ): HTMLElement {
    const btn = host.createEl("button", {
      cls: `ca-dl-pager ca-dl-pager-${delta > 0 ? "later" : "earlier"}`,
      attr: { type: "button" },
    });
    setIcon(btn.createSpan({ cls: "ca-dl-pager-icon" }), icon);
    btn.createSpan({ text: word });
    btn.addEventListener("click", () => {
      const side = delta > 0 ? this.fwd : this.back;
      side[this.grain] += REACH[this.grain];
      this.paint();
    });
    return btn;
  }

  // ── where the link lands ─────────────────────────────────────────────

  private destFields(host: HTMLElement): void {
    const wrap = host.createDiv({ cls: "ca-dl-dest" });
    wrap.createDiv({ cls: "ca-dl-dest-head", text: "Lands in" });

    const sections = attachSections();
    this.select(
      wrap,
      "Section",
      sections.map((s) => ({ value: s.id, label: s.label })),
      this.dest.section,
      (value) => {
        this.dest = { ...this.dest, section: value };
      }
    );
    this.select(
      wrap,
      "Category",
      this.cats.map((c) => ({ value: c.key, label: c.label })),
      this.dest.key,
      (value) => {
        const hit = this.cats.find((c) => c.key === value);
        if (!hit) return;
        // BOTH HALVES TOGETHER. The key recognises a shelf an entry already
        // has; the label is what a shelf gets created as. Setting one without
        // the other is how a reader asks for *Images* and gets a second shelf
        // named *Files & Links*.
        this.dest = { ...this.dest, key: hit.key, label: hit.label };
      }
    );

    wrap.createDiv({
      cls: "ca-dl-dest-note",
      text:
        "An attachments field or a category that is missing is created on the entry.",
    });
  }

  private select(
    host: HTMLElement,
    label: string,
    options: readonly { value: string; label: string }[],
    chosen: string,
    onPick: (value: string) => void
  ): void {
    const row = host.createEl("label", { cls: "ca-dl-dest-row" });
    row.createSpan({ cls: "ca-dl-dest-label", text: label });
    const sel = row.createEl("select", { cls: "dropdown ca-dl-select" });
    for (const opt of options) {
      sel.createEl("option", { value: opt.value, text: opt.label });
    }
    sel.value = chosen;
    sel.addEventListener("change", () => {
      onPick(sel.value);
      this.paintNote();
    });
  }

  // ── the parts that change ────────────────────────────────────────────

  private paint(): void {
    const calendar = this.grain === "daily";
    this.monthEl.toggleClass("ca-dl-off", !calendar);
    // THE LEGEND IS NOT THE CALENDAR'S ANY MORE (1.0.53): the rows wear the
    // same four marks, so the key that names them belongs under every tab. The
    // caption still is, because it names the cell under the pointer and a row
    // says its own sentence.
    this.captionEl.toggleClass("ca-dl-off", !calendar);
    this.laterEl.toggleClass("ca-dl-off", calendar);
    this.earlierEl.toggleClass("ca-dl-off", calendar);
    this.listEl.toggleClass("is-grid", calendar);

    this.paintTabs();
    if (calendar) {
      this.paintMonth();
      this.paintGrid();
      this.paintCaption();
    } else {
      this.paintList();
    }
    this.paintNote();
  }

  private paintTabs(): void {
    this.tabsEl.empty();
    for (const grain of TRACKER_CLASSES) {
      const tab = this.tabsEl.createEl("button", {
        cls: `ca-dl-tab${grain === this.grain ? " is-on" : ""}`,
        attr: { type: "button" },
      });
      tab.createSpan({ text: grainTabLabel(grain) });
      // HOW MANY OF THIS GRAIN THE PAGE WILL BE FILED UNDER WHEN SAVE IS
      // PRESSED, so a reader who ticked a month and went back to Days can see
      // that it is still ticked without going to look.
      const n = this.countFor(grain);
      if (n) tab.createSpan({ cls: "ca-dl-tab-count", text: String(n) });
      tab.addEventListener("click", () => {
        this.grain = grain;
        this.paint();
      });
    }
  }

  // ── the Days tab ─────────────────────────────────────────────────────

  // ◀ October 2026 ▶. The stepper the reader asked for: *"weeks are how the
  // view cycles"* — a grid row is a week, so a month is five of them and ◀ ▶
  // are the cycle.
  //
  // IT MOVES THE ANCHOR AND CLEARS THE QUERY, which is `shortcut`'s rule and
  // is load-bearing here: a date in the find box AIMS the grid, so stepping
  // while one sat there would redraw the same month and the button would look
  // broken.
  private paintMonth(): void {
    this.monthEl.empty();
    const grid = monthGrid(this.shown());
    this.step(this.monthEl, -1, "chevron-left", "The month before");
    this.monthEl.createSpan({
      cls: "ca-dl-month-name",
      text: grid?.label ?? this.shown(),
    });
    this.step(this.monthEl, 1, "chevron-right", "The month after");
  }

  private step(host: HTMLElement, delta: number, icon: string, why: string): void {
    const btn = host.createEl("button", {
      cls: "ca-dl-step",
      attr: { type: "button", title: why, "aria-label": why },
    });
    setIcon(btn, icon);
    btn.addEventListener("click", () => {
      // THE DAY OF THE MONTH IS KEPT, and moment clamps it — 31 October
      // stepped forward is 30 November rather than 1 December — so stepping
      // out of a long month and back lands where it started.
      this.aim(moment(this.shown()).add(delta, "months").format("YYYY-MM-DD"));
    });
  }

  private paintGrid(): void {
    this.listEl.empty();
    const grid = monthGrid(this.shown());
    if (!grid) {
      this.listEl.createDiv({
        cls: "ca-tags-empty",
        text: "That is not a date this calendar can open on.",
      });
      return;
    }
    const table = this.listEl.createDiv({ cls: "ca-dl-grid" });
    // The gutter's own column head, empty: the week numbers are labelled by the
    // W in each one rather than by a word over them.
    table.createSpan({ cls: "ca-dl-dow ca-dl-gutter" });
    for (const day of weekdayHeads()) {
      table.createSpan({ cls: "ca-dl-dow", text: day });
    }
    for (const week of grid.weeks) {
      // THE WEEK NUMBER IS A LABEL AND NOT A CONTROL. Ticking a week from the
      // Days tab would be one gesture filing two different grains depending on
      // which column it landed in; the Weeks tab is where a week is ticked.
      table.createSpan({
        cls: "ca-dl-wk ca-dl-gutter",
        text: week.label,
        attr: { title: `ISO week ${week.label.slice(1)}` },
      });
      // THE COLUMN DECIDES THE WEEKEND, not the date: `monthGrid` starts every
      // row at `startOf("isoWeek")` and `weekdayHeads` is built from a Monday,
      // so columns six and seven are Saturday and Sunday by construction. One
      // fact, read where it is already true.
      week.days.forEach((iso, col) => {
        if (!iso) {
          table.createSpan({ cls: "ca-dl-blank" });
          return;
        }
        this.drawCell(table, iso, col >= 5);
      });
    }
  }

  private drawCell(table: HTMLElement, iso: string, weekend: boolean): void {
    const target: DiaryTarget = { grain: "daily", key: iso };
    const id = targetId(target);
    const was = this.linked.has(id);
    const now = this.want(target);
    const row = describeTarget(this.plugin, target);
    const current = isNow(target);
    // TODAY IS SAID AS WELL AS DRAWN. The outline on the cell is the only
    // thing that marks it, and an outline is nothing at all to a reader on a
    // screen reader or one who cannot tell this border from the next.
    const said = `${row.label} — ${rowSentence(row, was, now)}${
      current ? " — today" : ""
    }`;
    const cell = table.createEl("button", {
      cls: `ca-dl-day${this.marks(was, now, row.exists)}${
        current ? " is-today" : ""
      }${weekend ? " is-weekend" : ""}`,
      // THE BARE NUMBER, which is what a calendar cell says. `Number` strips
      // the leading zero `YYYY-MM-DD` carries — a column of 01 02 03 reads as
      // a filename rather than as a date.
      text: String(Number(iso.slice(8, 10))),
      attr: {
        type: "button",
        title: said,
        "aria-label": said,
        "aria-pressed": now ? "true" : "false",
      },
    });
    cell.addEventListener("click", () => {
      this.touched = iso;
      this.set(target, !now);
      this.paint();
    });
    // THE CAPTION FOLLOWS THE POINTER as well as the click, because the
    // sentence a row used to carry is the thing a reader reaches for before
    // deciding to tick — not after.
    cell.addEventListener("mouseenter", () => {
      this.touched = iso;
      this.paintCaption();
    });
  }

  private paintCaption(): void {
    this.captionEl.empty();
    const iso = this.touched ?? this.shown();
    const row = describeTarget(this.plugin, { grain: "daily", key: iso });
    this.captionEl.createSpan({ cls: "ca-dl-caption-day", text: row.label });
    this.captionEl.createSpan({
      cls: "ca-dl-caption-sub",
      text: rowSentence(
        row,
        this.linked.has(targetId(row.target)),
        this.want(row.target)
      ),
    });
  }

  // ── the other four tabs ──────────────────────────────────────────────

  private paintList(): void {
    this.listEl.empty();
    const grain = this.grain;
    const keys = periodsAround(
      grain,
      this.shown(),
      this.back[grain],
      this.fwd[grain]
    );
    const needle = this.narrowing();

    let drawn = 0;
    let rung: string | null = null;
    for (const key of keys) {
      const row = describeTarget(this.plugin, { grain, key });
      if (
        needle &&
        !row.label.toLowerCase().includes(needle) &&
        !row.note.toLowerCase().includes(needle)
      ) {
        continue;
      }
      drawn++;
      // A HEADING WHEN THE GRAIN ABOVE CHANGES. Twelve months running past the
      // turn of a year with nothing to mark it is what this answers — and it
      // is drawn from the rows that SURVIVED the narrowing, so a filtered list
      // never carries a heading with nothing under it.
      const group = groupOf(row.target);
      if (group && group.key !== rung) {
        rung = group.key;
        this.listEl.createDiv({ cls: "ca-dl-group", text: group.label });
      }
      this.drawRow(row);
    }
    if (!drawn) {
      this.listEl.createDiv({
        cls: "ca-tags-empty",
        text: needle
          ? `Nothing on this tab matches “${this.query.trim()}”. A date aims the list instead — try 2026-10-12.`
          : "No periods in view. Press Later or Earlier.",
      });
    }
  }

  // THE WHOLE ROW IS THE LABEL OF ITS TICK, so a click anywhere on it toggles
  // and the browser does the keyboard handling. A row-level click listener that
  // also had to not fight the checkbox under it is the version of this that has
  // a bug in it.
  private drawRow(row: DiaryRow): void {
    const id = targetId(row.target);
    const was = this.linked.has(id);
    const now = this.want(row.target);
    const current = isNow(row.target);
    const el = this.listEl.createEl("label", {
      cls: `ca-tags-row ca-dl-row${this.marks(was, now, row.exists)}${
        current ? " is-now" : ""
      }`,
      // THE SENTENCE THE ROW STOPPED PRINTING. It is one hover away and it is
      // what a screen reader gets, which is why the second line could afford
      // to lose it.
      attr: { title: `${row.label} — ${rowSentence(row, was, now)}` },
    });
    const tick = el.createEl("input", {
      cls: "ca-dl-tick",
      attr: { type: "checkbox" },
    });
    tick.checked = now;
    tick.addEventListener("change", () => {
      this.set(row.target, tick.checked);
      this.paint();
    });

    // THE SAME DOT THE CALENDAR USES, in a slot that is there whether it is
    // filled or not: a mark that appears and disappears would move every label
    // on the tab beside it, and a column of labels that do not line up is the
    // readability problem rather than its fix.
    el.createSpan({ cls: "ca-dl-pip" });

    const name = el.createDiv({ cls: "ca-tags-name" });
    name.createDiv({ cls: "ca-dl-label", text: row.label });
    // THE FILENAME, AND NOTHING ELSE, as of 1.0.53. `— already written` on
    // every row of fifteen is a phrase a reader stops seeing; the dot says it,
    // the legend names the dot, the label's contrast says it a second time and
    // the row's title still spells it out in words.
    name.createDiv({ cls: "ca-dl-sub", text: row.note });

    // THE ONE LANDMARK EVERY TAB HAS. "this week", "this month" — the grain's
    // own noun, so five tabs need one string and none of them needs the word
    // today, which is only true of one of them.
    if (current) {
      el.createSpan({
        cls: "ca-dl-now",
        text: `this ${CLASS_DEFS[row.target.grain].periodNoun}`,
      });
    }

    el.createSpan({
      cls: "ca-tags-count ca-dl-state",
      text: stateWord(was, now),
    });
  }

  // THE CLASS LIST FOR ONE PERIOD, asked once and worn by both shapes. A cell
  // and a row saying the same thing in different classes is how a legend ends
  // up true of one tab and false of four — which is what 1.0.52 shipped.
  //
  // `to link` AND `to remove` ARE TWO CLASSES, not one `is-changed`: they are
  // the two halves of the pending write and Save does opposite things with
  // them, so they are the last pair that should look alike.
  private marks(was: boolean, now: boolean, written: boolean): string {
    return `${now ? " is-on" : ""}${
      now === was ? "" : now ? " is-adding" : " is-dropping"
    }${written ? " is-written" : ""}`;
  }

  private paintNote(): void {
    this.noteEl.empty();
    const edits = this.edits();
    const adds = edits.filter((e) => e.link).length;
    const gone = edits.length - adds;

    const said: string[] = [];
    if (adds) said.push(`link ${adds} ${adds === 1 ? "entry" : "entries"}`);
    if (gone) said.push(`remove ${gone} ${gone === 1 ? "link" : "links"}`);
    this.noteEl.createDiv({
      text: said.length
        ? `Save will ${said.join(" and ")} under ${this.dest.label}. A period with no entry yet is created when it is linked.`
        : "Tick a period to file this note under it, or untick one to take the link back. Nothing is written until you press Save.",
    });

    // THE PROPERTY, SAID BEFORE IT HAPPENS. `date:` is invisible in reading
    // view, and this is the only moment a reader is in a position to object to
    // it being written.
    this.noteEl.createDiv({
      text: this.stated
        ? `This note states date: ${this.stated} and keeps it.`
        : "This note has no date yet — linking stamps it with the smallest period you tick.",
    });
  }

  // ── the answers ──────────────────────────────────────────────────────

  // WHICH DATE EVERYTHING IS DRAWN AROUND. A date in the find box aims the
  // window; anything else leaves the anchor where it is and narrows the list
  // instead. One rule, asked here, so the grid's month, the list's rows and
  // the caption's default cannot each have their own opinion about it.
  private shown(): string {
    return anchorFromQuery(this.query) ?? this.anchor;
  }

  // What a non-date query narrows a LIST by, and nothing at all on the Days
  // tab: a calendar has no rows to hide, and hiding cells would leave a month
  // with holes in it.
  private narrowing(): string {
    if (anchorFromQuery(this.query)) return "";
    return this.query.trim().toLowerCase();
  }

  private aim(iso: string): void {
    this.anchor = iso;
    this.query = "";
    this.touched = null;
    this.refreshBody();
  }

  private want(target: DiaryTarget): boolean {
    const id = targetId(target);
    return this.picked.get(id)?.link ?? this.linked.has(id);
  }

  // A TICK PUT BACK WHERE IT WAS LEAVES NOTHING BEHIND. Without this the map
  // would hold a no-op edit, `edits()` would hand it to the writer, and the
  // sentence under the list would promise a write nobody asked for.
  private set(target: DiaryTarget, link: boolean): void {
    const id = targetId(target);
    if (link === this.linked.has(id)) this.picked.delete(id);
    else this.picked.set(id, { target, link });
  }

  private countFor(grain: TrackerClass): number {
    let n = 0;
    for (const id of this.linked) {
      if (!id.startsWith(`${grain}:`)) continue;
      if (this.picked.get(id)?.link === false) continue;
      n++;
    }
    for (const [id, edit] of this.picked) {
      if (edit.link && edit.target.grain === grain && !this.linked.has(id)) n++;
    }
    return n;
  }

  private edits(): DiaryLinkEdit[] {
    return [...this.picked.values()];
  }

  // ENTER IN THE FIND BOX AIMS; IT DOES NOT SAVE. The frame submits on Enter
  // from any single-line field, which is right for a window whose fields are
  // the thing being saved and wrong for one whose only text field moves the
  // view: a reader typing a date and pressing Enter has asked to go there.
  // Enter on anything that is not a date still saves, which is the frame's
  // behaviour and the one a keyboard reader expects from a dialog.
  protected async onEnterKey(): Promise<void> {
    const aimed = anchorFromQuery(this.query);
    if (aimed) {
      this.aim(aimed);
      return;
    }
    await super.onEnterKey();
  }

  protected validate(): string | null {
    return null;
  }

  protected async commit(): Promise<void> {
    await this.onSave(this.edits(), this.dest);
  }
}
