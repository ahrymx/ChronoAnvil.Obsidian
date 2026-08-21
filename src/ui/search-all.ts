// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// One search over everything Almanac knows about. 4.51.
//
// ── THE FOURTH VIEW, AND THE FIRST WITH NO SURFACE FILTER ────────────────
//
// `diary-index.ts` opens by settling this, three views before there was a fourth:
//
//   Two independent scanners would drift... So: **one index, one query surface,
//   three views.**
//
// Surface is a FIELD on an indexed entry rather than a boundary between two
// indexes, so combining the searches is mostly *removing a scope restriction*.
// The parser, the scoring, the snippets, the cache and the filter grammar are
// all that module's and none of them is touched. What is new here is a view that
// reads both halves, a sort control over fields that already exist, and a
// shortcut.
//
// ── WHAT IT COSTS, STATED RATHER THAN HIDDEN ─────────────────────────────
//
// THE COLD SCAN MOVES. Each existing widget warms the half of the index it
// needs; this warms both. That is bounded and paid once — *"for a five-year
// vault of ~1,800 entries, paid once"* — but it is now paid on the first
// `Ctrl K` rather than on opening a dashboard. The window says it is reading
// rather than showing an empty list, because an empty list is a lie for as long
// as the scan takes.

import { App, Modal, TFile, setIcon } from "obsidian";
import type AlmanacPlugin from "../main";
import {
  DiaryQuery,
  IndexedEntry,
  SORT_FIELDS,
  SearchHit,
  SortField,
  isEmptyQuery,
  parseQuery,
  queryNarrowsTo,
  readIndex,
  readJournalIndex,
  searchEntries,
  sortHits,
} from "../diary/diary-index";
import { openFile } from "../core/util";
import { TRACKER_CLASSES } from "../trackers/trackers";
import { registeredJournalTypes } from "../journals/journal";

// The sort the reader last chose, for as long as Obsidian is running.
//
// SESSION ONLY, WHICH IS A DECISION (4.51, Q13). A reader who sorts by Date is
// usually mid-task and wants it to hold for the next three searches — and a
// PERSISTED sort is invisible state that makes the first search after a restart
// quietly wrong for somebody who has forgotten setting it. A module-level
// variable is exactly "for this session": it dies with the process and nothing
// writes it to `data.json`.
//
// NOT IN SETTINGS, therefore, and deliberately not — see `BannerOptions`, which
// holds the two things that genuinely are the reader's configuration.
let sessionSort: SortField = "relevance";

/** Exported for the test that pins the session rule; resets what a reload would. */
export function __resetSessionSort(): void {
  sessionSort = "relevance";
}

export function openVaultSearch(plugin: AlmanacPlugin): void {
  new VaultSearchModal(plugin.app, plugin).open();
}

// Which `is:` values mean the diary. Read from the class table rather than
// written out, so a sixth grain needs no edit here.
function diaryKinds(): string[] {
  return [...TRACKER_CLASSES];
}

class VaultSearchModal extends Modal {
  private query = "";
  private entries: IndexedEntry[] | null = null;
  private hits: SearchHit[] = [];
  private cursor = 0;

  private resultsEl!: HTMLElement;
  private chipsEl!: HTMLElement;
  private countEl!: HTMLElement;

  constructor(app: App, private plugin: AlmanacPlugin) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("am-search-modal");
    contentEl.empty();

    const box = contentEl.createDiv({ cls: "ams-query" });
    setIcon(box.createSpan({ cls: "ams-query-icon" }), "search");
    const input = box.createEl("input", {
      type: "text",
      cls: "ams-input",
      attr: { placeholder: "Search your diary and journals…" },
    });

    const bar = contentEl.createDiv({ cls: "ams-bar" });
    bar.createSpan({ cls: "ams-sort-label", text: "Sort" });
    this.chipsEl = bar.createDiv({ cls: "ams-chips" });
    this.countEl = bar.createDiv({ cls: "ams-count" });

    this.resultsEl = contentEl.createDiv({ cls: "ams-results" });

    const foot = contentEl.createDiv({ cls: "ams-foot" });
    for (const [key, what] of [
      ["↑↓", "move"],
      ["↵", "open"],
      ["Tab", "cycle sort"],
      ["Esc", "close"],
    ]) {
      const item = foot.createSpan({ cls: "ams-foot-item" });
      item.createSpan({ cls: "ams-kbd", text: key });
      item.createSpan({ text: what });
    }

    input.addEventListener("input", () => {
      this.query = input.value;
      this.render();
    });
    input.addEventListener("keydown", (evt) => this.onKey(evt));
    window.setTimeout(() => input.focus(), 0);

    this.render();
    void this.load();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  // Both halves of the index, concatenated.
  //
  // `readIndex` KNOWS THE DIARY'S FOLDERS AND `readJournalIndex` TAKES THEM,
  // which is the asymmetry that module explains: a journal search is normally
  // scoped and the diary's never is. Unscoped here means every registered
  // journal's root — the widest a journal search has ever been asked to be.
  private async load(): Promise<void> {
    const roots = registeredJournalTypes(this.plugin).map((t) => t.root);
    const [diary, journal] = await Promise.all([
      readIndex(this.plugin),
      roots.length ? readJournalIndex(this.plugin, roots) : Promise.resolve([]),
    ]);
    // THE WINDOW MAY HAVE GONE while that resolved — a reader who opened and
    // pressed Esc during a cold scan. Writing into a closed modal's DOM throws.
    if (!this.resultsEl.isConnected) return;
    this.entries = [...diary, ...journal];
    this.render();
  }

  private parsed(): DiaryQuery {
    // EVERY KIND EITHER SURFACE KNOWS, so `is:` accepts `daily` and `lesson` in
    // one box. `parseQuery`'s own rule keeps an unrecognised value a search
    // TERM rather than an error, which is what makes a wrong guess harmless.
    const kinds = [
      ...diaryKinds(),
      ...registeredJournalTypes(this.plugin).flatMap((t) => [
        ...t.kinds.map((k) => k.id),
        ...t.levels.map((l) => l.id),
        "page",
      ]),
    ];
    return parseQuery(this.query, kinds);
  }

  private render(): void {
    const q = this.parsed();
    this.renderChips(q);

    this.resultsEl.empty();
    if (this.entries === null) {
      this.countEl.setText("");
      this.resultsEl.createDiv({ cls: "ams-note", text: "Reading your vault…" });
      return;
    }
    if (isEmptyQuery(q)) {
      this.countEl.setText(`${this.entries.length} notes`);
      this.resultsEl.createDiv({
        cls: "ams-note",
        text: "Type to search. Filters: tag:, from:, to:, is:, has:",
      });
      return;
    }

    this.hits = sortHits(searchEntries(this.entries, q, 200), sessionSort);
    this.cursor = 0;
    this.countEl.setText(
      this.hits.length === 1 ? "1 result" : `${this.hits.length} results`
    );
    if (this.hits.length === 0) {
      this.resultsEl.createDiv({ cls: "ams-note", text: "Nothing matches." });
      return;
    }
    this.hits.forEach((hit, i) => this.renderRow(hit, i));
  }

  // The sort chips.
  //
  // FOUR ALWAYS, AND A TRACKER CHIP NEVER (4.51, Q12). The four are universal
  // fields of an indexed entry, so a mixed list can be ordered by any of them
  // without half the rows having nothing to sort on. Mood is the diary's and a
  // journal rating is declared per KIND — so a fifth chip appears only once the
  // query has narrowed to one surface, and this release ships the narrowing test
  // and the readout rather than the chip. `queryNarrowsTo` is the rule.
  private renderChips(q: DiaryQuery): void {
    this.chipsEl.empty();
    for (const field of SORT_FIELDS) {
      const chip = this.chipsEl.createDiv({
        cls: "ams-chip" + (field.id === sessionSort ? " is-on" : ""),
        text: field.label,
        attr: { role: "button", tabindex: "-1" },
      });
      chip.addEventListener("click", () => {
        sessionSort = field.id;
        this.render();
      });
    }
    const narrowed = queryNarrowsTo(q, diaryKinds());
    if (narrowed) {
      this.chipsEl.createDiv({
        cls: "ams-narrowed",
        text: narrowed === "diary" ? "diary only" : "journals only",
      });
    }
  }

  private renderRow(hit: SearchHit, i: number): void {
    const { entry } = hit;
    const row = this.resultsEl.createDiv({
      cls: "ams-row" + (i === this.cursor ? " is-sel" : ""),
    });
    const mark = row.createDiv({
      cls: "ams-mark" + (entry.surface === "journal" ? " is-journal" : ""),
    });
    setIcon(mark, entry.surface === "journal" ? "library" : "calendar-days");

    const main = row.createDiv({ cls: "ams-main" });
    main.createDiv({ cls: "ams-title", text: entry.title });
    // WHERE THE HIT LIVES, because results now mix surfaces. `crumbs` is on an
    // indexed entry for exactly this — *"a result row uses them to say where a
    // hit lives, which matters far more in a journal than in the diary, where
    // the date already says it."*
    const where = [...entry.crumbs, entry.kind].filter(Boolean).join(" · ");
    if (where) main.createDiv({ cls: "ams-where", text: where });
    if (hit.snippet) {
      const snip = main.createDiv({ cls: "ams-snip" });
      // WHICH FIELD IT CAME FROM. `regions` keeps them separate so a hit in a
      // reader's `log` reads differently from one in a `summary`. Indexed since
      // 2.33 and never yet shown.
      if (hit.snippetKey) {
        snip.createSpan({ cls: "ams-field", text: hit.snippetKey });
      }
      snip.createSpan({ text: hit.snippet });
    }

    row.createDiv({ cls: "ams-date", text: entry.iso ?? "—" });
    row.addEventListener("click", () => this.openHit(entry));
  }

  private onKey(evt: KeyboardEvent): void {
    if (evt.key === "Tab") {
      // CYCLES THE SORT, which is what the foot promises. Preventing the default
      // matters: a Tab that moved focus out of the input would leave the arrow
      // keys doing nothing.
      evt.preventDefault();
      const ids = SORT_FIELDS.map((f) => f.id);
      sessionSort = ids[(ids.indexOf(sessionSort) + 1) % ids.length];
      this.render();
      return;
    }
    if (evt.key === "ArrowDown" || evt.key === "ArrowUp") {
      evt.preventDefault();
      if (!this.hits.length) return;
      const next = this.cursor + (evt.key === "ArrowDown" ? 1 : -1);
      this.cursor = Math.min(Math.max(next, 0), this.hits.length - 1);
      this.paintCursor();
      return;
    }
    if (evt.key === "Enter") {
      evt.preventDefault();
      const hit = this.hits[this.cursor];
      if (hit) this.openHit(hit.entry);
    }
  }

  // MOVES THE CLASS RATHER THAN REBUILDING. A re-render on every arrow key would
  // rebuild two hundred rows to change one, and would lose the scroll position
  // the cursor is being scrolled to.
  private paintCursor(): void {
    const rows = Array.from(
      this.resultsEl.querySelectorAll<HTMLElement>(".ams-row")
    );
    rows.forEach((el, i) => el.toggleClass("is-sel", i === this.cursor));
    rows[this.cursor]?.scrollIntoView({ block: "nearest" });
  }

  private openHit(entry: IndexedEntry): void {
    const file = this.app.vault.getAbstractFileByPath(entry.path);
    this.close();
    if (file instanceof TFile) void openFile(this.app, file);
  }
}
