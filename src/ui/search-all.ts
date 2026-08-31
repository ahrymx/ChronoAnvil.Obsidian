// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// One search over everything ChronoAnvil knows about. 4.51.
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
import type ChronoAnvilPlugin from "../main";
import {
  DiaryQuery,
  IndexedEntry,
  SORT_FIELDS,
  SearchHit,
  SortField,
  isEmptyQuery,
  parseQuery,
  passesFilters,
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
let sessionSort: SortField = "relevance";

export function openVaultSearch(plugin: ChronoAnvilPlugin): void {
  new VaultSearchModal(plugin.app, plugin).open();
}

// Which `is:` values mean the diary.
function diaryKinds(): string[] {
  return [...TRACKER_CLASSES];
}

// Highlight matching search query substring within text
function highlightFragment(parent: HTMLElement, text: string, query?: string): void {
  if (!query || !query.trim()) {
    parent.setText(text);
    return;
  }
  const cleanQ = query.trim().replace(/^#/, "");
  if (!cleanQ) {
    parent.setText(text);
    return;
  }
  const lower = text.toLowerCase();
  const target = cleanQ.toLowerCase();
  let start = 0;
  let idx = lower.indexOf(target, start);
  if (idx === -1) {
    parent.setText(text);
    return;
  }
  parent.empty();
  while (idx !== -1) {
    if (idx > start) {
      parent.createSpan({ text: text.slice(start, idx) });
    }
    parent.createEl("mark", {
      cls: "ca-jdr-highlight",
      text: text.slice(idx, idx + target.length),
    });
    start = idx + target.length;
    idx = lower.indexOf(target, start);
  }
  if (start < text.length) {
    parent.createSpan({ text: text.slice(start) });
  }
}

class VaultSearchModal extends Modal {
  private query = "";
  private entries: IndexedEntry[] | null = null;
  private hits: SearchHit[] = [];
  private cursor = 0;

  private selectedYear = "all";
  private filterTasks = false;
  private filterAttach = false;
  private filterMonthly = false;
  private isCompact = false;

  private resultsEl!: HTMLElement;
  private chipsEl!: HTMLElement;
  private countEl!: HTMLElement;
  private inputEl!: HTMLInputElement;
  private clearEl!: HTMLElement;

  constructor(app: App, private plugin: ChronoAnvilPlugin) {
    super(app);
  }

  onOpen(): void {
    const { contentEl, modalEl } = this;
    modalEl.addClass("ca-search-modal");
    contentEl.empty();

    const box = contentEl.createDiv({ cls: "ca-ams-query" });
    setIcon(box.createSpan({ cls: "ca-ams-query-icon" }), "search");
    this.inputEl = box.createEl("input", {
      type: "text",
      cls: "ca-ams-input",
      attr: { placeholder: "Search by text, #tag, [mood>=5], has:task...", spellcheck: "false" },
    });

    this.clearEl = box.createEl("button", {
      cls: "ca-ams-clear",
      text: "✕",
      attr: { type: "button", "aria-label": "Clear search" },
    });
    this.clearEl.style.display = "none";

    const bar = contentEl.createDiv({ cls: "ca-ams-bar" });
    this.chipsEl = bar.createDiv({ cls: "ca-ams-chips" });
    this.countEl = bar.createDiv({ cls: "ca-ams-count" });

    this.resultsEl = contentEl.createDiv({ cls: "ca-ams-results" });

    const foot = contentEl.createDiv({ cls: "ca-ams-foot" });
    for (const [key, what] of [
      ["↑↓", "move"],
      ["↵", "open"],
      ["Tab", "cycle sort"],
      ["Esc", "close"],
    ]) {
      const item = foot.createSpan({ cls: "ca-ams-foot-item" });
      item.createSpan({ cls: "ca-ams-kbd", text: key });
      item.createSpan({ text: what });
    }

    this.inputEl.addEventListener("input", () => {
      this.query = this.inputEl.value;
      this.clearEl.style.display = this.query ? "block" : "none";
      this.render();
    });

    this.clearEl.addEventListener("click", () => {
      this.inputEl.value = "";
      this.query = "";
      this.clearEl.style.display = "none";
      this.inputEl.focus();
      this.render();
    });

    this.inputEl.addEventListener("keydown", (evt) => this.onKey(evt));
    window.setTimeout(() => this.inputEl.focus(), 0);

    this.render();
    void this.load();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async load(): Promise<void> {
    const roots = registeredJournalTypes(this.plugin).map((t) => t.root);
    const [diary, journal] = await Promise.all([
      readIndex(this.plugin),
      roots.length ? readJournalIndex(this.plugin, roots) : Promise.resolve([]),
    ]);
    if (!this.resultsEl.isConnected) return;
    this.entries = [...diary, ...journal];
    this.render();
  }

  private parsed(): DiaryQuery {
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
      this.resultsEl.createDiv({ cls: "ca-ams-note", text: "Reading your vault…" });
      return;
    }

    const isFiltering =
      !isEmptyQuery(q) ||
      this.selectedYear !== "all" ||
      this.filterTasks ||
      this.filterAttach ||
      this.filterMonthly;

    if (!isFiltering) {
      this.countEl.setText(`${this.entries.length} notes`);
      this.resultsEl.createDiv({
        cls: "ca-ams-note",
        text: "Type to search. Supports #tag, [mood>=5], has:task, from:30d...",
      });
      return;
    }

    const filtered = this.entries.filter((entry) => {
      if (this.selectedYear !== "all" && (!entry.iso || !entry.iso.startsWith(this.selectedYear))) {
        return false;
      }
      if (this.filterTasks && entry.openTasks === 0) return false;
      if (this.filterAttach && entry.attachments === 0) return false;
      if (this.filterMonthly && entry.kind !== "monthly") return false;
      return passesFilters(entry, q);
    });

    this.hits = sortHits(searchEntries(filtered, q, 200), sessionSort);
    this.cursor = 0;
    this.countEl.setText(
      this.hits.length === 1 ? "1 result" : `${this.hits.length} results`
    );
    if (this.hits.length === 0) {
      this.resultsEl.createDiv({ cls: "ca-ams-note", text: "Nothing matches." });
      return;
    }
    this.hits.forEach((hit, i) => this.renderRow(hit, i, q));
  }

  private renderChips(q: DiaryQuery): void {
    this.chipsEl.empty();

    // Distinct years
    if (this.entries) {
      const years = Array.from(
        new Set(
          this.entries
            .map((e) => (e.iso ? e.iso.slice(0, 4) : null))
            .filter((y): y is string => Boolean(y))
        )
      ).sort().reverse();

      if (years.length > 1) {
        const yearPills = this.chipsEl.createDiv({ cls: "ca-ams-year-pills" });
        for (const y of ["all", ...years.slice(0, 3)]) {
          const pill = yearPills.createEl("button", {
            cls: `ca-ams-year-pill${this.selectedYear === y ? " is-active" : ""}`,
            text: y === "all" ? "All" : y,
            attr: { type: "button" },
          });
          pill.addEventListener("click", () => {
            this.selectedYear = y;
            this.render();
          });
        }
      }
    }

    // Quick filter chips
    const addQuickChip = (label: string, iconName: string, active: boolean, toggle: () => void) => {
      const chip = this.chipsEl.createEl("button", {
        cls: `ca-ams-filter-chip${active ? " is-active" : ""}`,
        attr: { type: "button" },
      });
      const icon = chip.createSpan({ cls: "ca-ams-chip-icon" });
      setIcon(icon, iconName);
      chip.createSpan({ text: label });
      chip.addEventListener("click", () => {
        toggle();
        this.render();
      });
    };

    addQuickChip("Tasks", "square", this.filterTasks, () => { this.filterTasks = !this.filterTasks; });
    addQuickChip("Files", "paperclip", this.filterAttach, () => { this.filterAttach = !this.filterAttach; });
    addQuickChip("Monthly", "calendar", this.filterMonthly, () => { this.filterMonthly = !this.filterMonthly; });

    // Divider
    this.chipsEl.createDiv({ cls: "ca-ams-divider" });

    // Sort chips
    for (const field of SORT_FIELDS) {
      const chip = this.chipsEl.createDiv({
        cls: "ca-ams-chip" + (field.id === sessionSort ? " is-on" : ""),
        text: field.label,
        attr: { role: "button", tabindex: "-1" },
      });
      chip.addEventListener("click", () => {
        sessionSort = field.id;
        this.render();
      });
    }

    // Compact mode button
    const compactBtn = this.chipsEl.createEl("button", {
      cls: `ca-ams-compact-btn${this.isCompact ? " is-active" : ""}`,
      attr: { type: "button", title: "Toggle compact view" },
    });
    const compactIcon = compactBtn.createSpan({ cls: "ca-ams-chip-icon" });
    setIcon(compactIcon, "list");
    compactBtn.createSpan({ text: "Compact" });
    compactBtn.addEventListener("click", () => {
      this.isCompact = !this.isCompact;
      this.resultsEl.toggleClass("is-compact", this.isCompact);
      compactBtn.toggleClass("is-active", this.isCompact);
    });

    const narrowed = queryNarrowsTo(q, diaryKinds());
    if (narrowed) {
      this.chipsEl.createDiv({
        cls: "ca-ams-narrowed",
        text: narrowed === "diary" ? "diary only" : "journals only",
      });
    }
  }

  private renderRow(hit: SearchHit, i: number, q?: DiaryQuery): void {
    const { entry } = hit;
    const row = this.resultsEl.createDiv({
      cls: "ca-ams-row" + (i === this.cursor ? " is-sel" : ""),
    });
    const mark = row.createDiv({
      cls: "ca-ams-mark" + (entry.surface === "journal" ? " is-journal" : ""),
    });
    setIcon(mark, entry.surface === "journal" ? "library" : "calendar-days");

    const main = row.createDiv({ cls: "ca-ams-main" });
    const titleEl = main.createDiv({ cls: "ca-ams-title" });
    highlightFragment(titleEl, entry.title, q?.terms.length ? q.terms.join(" ") : undefined);

    const where = [...entry.crumbs, entry.kind].filter(Boolean).join(" · ");
    if (where) main.createDiv({ cls: "ca-ams-where", text: where });
    if (hit.snippet) {
      const snip = main.createDiv({ cls: "ca-ams-snip" });
      if (hit.snippetKey) {
        snip.createSpan({ cls: "ca-ams-field", text: hit.snippetKey });
      }
      const snipText = snip.createSpan();
      highlightFragment(snipText, hit.snippet, q?.terms.length ? q.terms.join(" ") : undefined);
    }

    row.createDiv({ cls: "ca-ams-date", text: entry.iso ?? "—" });
    row.addEventListener("click", () => this.openHit(entry));
  }

  private onKey(evt: KeyboardEvent): void {
    if (evt.key === "Tab") {
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

  private paintCursor(): void {
    const rows = Array.from(
      this.resultsEl.querySelectorAll<HTMLElement>(".ca-ams-row")
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
