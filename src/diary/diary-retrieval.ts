// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The three retrieval views over the diary index (diary-index.ts):
//
//   diary-search     a search box + filters over every entry's body
//   on-this-day      this date in earlier years
//   timeline         every entry, newest first, grouped by month
//
// All three read through `readIndex`, which is cached by mtime/size, so the
// three can sit on one page without three scans of the vault. They share one
// row renderer (`entryRow`) deliberately: an entry looks the same wherever it
// is listed, and three near-identical row builders would drift apart the first
// time one of them gained a field.
//
// Reads are async (Almanac's content is in body regions the metadata cache
// can't see), so each view paints a placeholder and fills in. That's the same
// shape diary-header.ts uses for its open-tasks cell.

import { MarkdownPostProcessorContext, setIcon, TFile } from "obsidian";
import type AlmanacPlugin from "../main";
import {
  anniversaries,
  buildSnippet,
  byDateDesc,
  groupByMonth,
  IndexedEntry,
  isEmptyQuery,
  parseQuery,
  passesFilters,
  readIndex,
  scoreEntry,
  searchHintLine,
  SearchHit,
} from "./diary-index";
import { emptyCallout } from "../ui/tables";
import { moment, noExt, openFile, today } from "../core/util";

// Open an entry, with the same hover-preview wiring the nav pills use so a
// result behaves like any other internal link.
function wireOpen(
  el: HTMLElement,
  plugin: AlmanacPlugin,
  file: TFile,
  sourcePath: string
): void {
  const href = noExt(file.path);
  el.setAttr("data-href", href);
  el.addEventListener("click", (evt) => {
    evt.preventDefault();
    void openFile(plugin.app, file);
  });
  el.addEventListener("mouseover", (evt) => {
    plugin.app.workspace.trigger("hover-link", {
      event: evt,
      source: "almanac-diary-retrieval",
      hoverParent: el,
      targetEl: el,
      linktext: href,
      sourcePath,
    });
  });
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
      cls: "jdr-highlight",
      text: text.slice(idx, idx + target.length),
    });
    start = idx + target.length;
    idx = lower.indexOf(target, start);
  }
  if (start < text.length) {
    parent.createSpan({ text: text.slice(start) });
  }
}

// One entry as a row: date gutter, title, snippet, and a facts strip. Used by
// all three views so an entry reads identically wherever it's listed.
//
// `dateFormat` varies by view — the timeline groups by month so its rows only
// need the day, while a search result can be from any year and needs the lot.
function entryRow(
  plugin: AlmanacPlugin,
  entry: IndexedEntry,
  sourcePath: string,
  opts: {
    snippet?: string;
    snippetKey?: string | null;
    dateFormat?: string;
    highlightQuery?: string;
  } = {}
): HTMLElement {
  const row = createDiv({ cls: "jdr-row" });

  const gutter = row.createDiv({ cls: "jdr-gutter" });
  const m = moment(entry.iso);
  gutter.createDiv({
    cls: "jdr-date",
    text: m.format(opts.dateFormat ?? "D MMM YYYY"),
  });
  gutter.createDiv({ cls: "jdr-dow", text: m.format("ddd") });

  const main = row.createDiv({ cls: "jdr-main" });
  const titleEl = main.createEl("a", {
    cls: "internal-link jdr-title",
    href: noExt(entry.file.path),
  });
  highlightFragment(titleEl, entry.title, opts.highlightQuery);
  wireOpen(titleEl, plugin, entry.file, sourcePath);

  const snippet = opts.snippet ?? "";
  if (snippet) {
    const line = main.createDiv({ cls: "jdr-snippet" });
    if (opts.snippetKey) {
      line.createSpan({ cls: "jdr-snippet-key", text: opts.snippetKey });
    }
    const snippetSpan = line.createSpan();
    highlightFragment(snippetSpan, snippet, opts.highlightQuery);
  }

  // Facts worth seeing without opening the note. Each is omitted when it's
  // zero rather than shown as "0", so a quiet day reads as a quiet day rather
  // than a row of empty counters.
  const facts = main.createDiv({ cls: "jdr-facts" });
  if (entry.kind === "monthly") {
    facts.createSpan({ cls: "jdr-fact jdr-fact-kind", text: "monthly" });
  }
  if (entry.mood != null) {
    const f = facts.createSpan({ cls: "jdr-fact" });
    setIcon(f.createSpan({ cls: "jdr-fact-icon" }), "sun");
    f.createSpan({ text: String(entry.mood) });
  }
  if (entry.openTasks > 0) {
    const f = facts.createSpan({ cls: "jdr-fact" });
    setIcon(f.createSpan({ cls: "jdr-fact-icon" }), "square");
    f.createSpan({ text: String(entry.openTasks) });
  }
  if (entry.attachments > 0) {
    const f = facts.createSpan({ cls: "jdr-fact" });
    setIcon(f.createSpan({ cls: "jdr-fact-icon" }), "paperclip");
    f.createSpan({ text: String(entry.attachments) });
  }
  for (const tag of entry.tags.slice(0, 3)) {
    facts.createSpan({ cls: "jdr-fact jdr-fact-tag", text: tag });
  }

  return row;
}

// ── diary-search ──────────────────────────────────────────────────────
// A search box over every entry's body, with filters mixed into the same
// input (`from:`, `to:`, `tag:`, `is:`, `has:`, `Mood<=2`). One input rather
// than a row of dropdowns: the filters are a power-user affordance, and a
// dropdown for each would cost every user the space while most never touch
// them. The syntax is shown in the hint line under the box.
//
// The index is read once per render and held for the life of this widget, so
// typing filters in memory rather than re-reading the vault per keystroke.
export function buildDiarySearch(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  const root = createDiv({ cls: "journal-table jdr-search" });
  const controls = root.createDiv({ cls: "jdr-timeline-controls" });
  const summaryEl = root.createDiv({ cls: "jdr-timeline-summary" });
  const scrollViewport = root.createDiv({ cls: "jdr-timeline-scroll" });
  const results = scrollViewport.createDiv({ cls: "jdr-results" });
  results.createDiv({ cls: "jdr-loading", text: "Reading your diary…" });

  // State
  let entries: IndexedEntry[] | null = null;
  let searchQuery = "";
  let selectedYear = "all";
  let filterTasks = false;
  let filterAttach = false;
  let filterMonthly = false;
  let sortMode: "rank" | "desc" | "asc" = "rank";
  let isCompact = false;

  void readIndex(plugin).then((list) => {
    entries = list;

    // Distinct years in descending order
    const years = Array.from(
      new Set(
        list
          .map((e) => (e.iso ? e.iso.slice(0, 4) : null))
          .filter((y): y is string => Boolean(y))
      )
    ).sort().reverse();

    // ── Build Controls ──
    controls.empty();

    // 1. Search Row
    const searchRow = controls.createDiv({ cls: "jdr-timeline-search-row" });
    const searchWrap = searchRow.createDiv({ cls: "jdr-timeline-search-wrap" });
    const searchIcon = searchWrap.createDiv({ cls: "jdr-timeline-search-icon" });
    setIcon(searchIcon, "search");

    const searchInput = searchWrap.createEl("input", {
      cls: "jdr-timeline-search-input",
      attr: {
        type: "text",
        placeholder: "Search by text, #tag, [mood>=5], has:task...",
        spellcheck: "false",
      },
    });

    const searchClear = searchWrap.createEl("button", {
      cls: "jdr-timeline-search-clear",
      text: "✕",
      attr: { type: "button", "aria-label": "Clear search" },
    });
    searchClear.style.display = "none";

    let timer: number | null = null;
    const schedule = (): void => {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        render();
      }, 100);
    };

    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value;
      searchClear.style.display = searchQuery ? "block" : "none";
      schedule();
    });

    searchInput.addEventListener("keydown", (evt) => {
      if (evt.key === "Escape") {
        searchInput.value = "";
        searchQuery = "";
        searchClear.style.display = "none";
        render();
      }
    });

    searchClear.addEventListener("click", () => {
      searchInput.value = "";
      searchQuery = "";
      searchClear.style.display = "none";
      searchInput.focus();
      render();
    });

    // 2. Filters & View Actions Row
    const filterRow = controls.createDiv({ cls: "jdr-timeline-filters-row" });
    const chipsWrap = filterRow.createDiv({ cls: "jdr-timeline-chips" });

    // Year Pills
    if (years.length > 1) {
      const yearPills = chipsWrap.createDiv({ cls: "jdr-timeline-year-pills" });
      const yearOptions = ["all", ...years];
      for (const y of yearOptions) {
        const pill = yearPills.createEl("button", {
          cls: `jdr-timeline-year-pill${selectedYear === y ? " is-active" : ""}`,
          text: y === "all" ? "All" : y,
          attr: { type: "button" },
        });
        pill.addEventListener("click", () => {
          selectedYear = y;
          yearPills
            .findAll(".jdr-timeline-year-pill")
            .forEach((p) => p.removeClass("is-active"));
          pill.addClass("is-active");
          render();
        });
      }
    }

    // Attribute Filter Buttons
    const addFilterBtn = (
      label: string,
      iconName: string,
      isChecked: () => boolean,
      onToggle: (active: boolean) => void
    ) => {
      const btn = chipsWrap.createEl("button", {
        cls: `jdr-timeline-chip${isChecked() ? " is-active" : ""}`,
        attr: { type: "button" },
      });
      const iconSpan = btn.createSpan({ cls: "jdr-timeline-chip-icon" });
      setIcon(iconSpan, iconName);
      btn.createSpan({ text: label });
      btn.addEventListener("click", () => {
        const next = !isChecked();
        onToggle(next);
        btn.toggleClass("is-active", next);
        render();
      });
      return btn;
    };

    const tasksBtn = addFilterBtn("Tasks", "square", () => filterTasks, (v) => { filterTasks = v; });
    const attachBtn = addFilterBtn("Files", "paperclip", () => filterAttach, (v) => { filterAttach = v; });
    const monthlyBtn = addFilterBtn("Monthly", "calendar", () => filterMonthly, (v) => { filterMonthly = v; });

    // View Actions (Sort & Compact)
    const actionsWrap = filterRow.createDiv({ cls: "jdr-timeline-actions" });

    const sortBtn = actionsWrap.createEl("button", {
      cls: "jdr-timeline-action-btn",
      attr: { type: "button", title: "Toggle sort mode" },
    });
    const sortIcon = sortBtn.createSpan({ cls: "jdr-timeline-chip-icon" });
    setIcon(sortIcon, "arrow-down-up");
    const sortText = sortBtn.createSpan({ text: "Rank" });
    sortBtn.addEventListener("click", () => {
      if (sortMode === "rank") sortMode = "desc";
      else if (sortMode === "desc") sortMode = "asc";
      else sortMode = "rank";
      sortText.setText(sortMode === "rank" ? "Rank" : sortMode === "desc" ? "Newest" : "Oldest");
      render();
    });

    const compactBtn = actionsWrap.createEl("button", {
      cls: "jdr-timeline-action-btn",
      attr: { type: "button", title: "Toggle compact view" },
    });
    const compactIcon = compactBtn.createSpan({ cls: "jdr-timeline-chip-icon" });
    setIcon(compactIcon, "list");
    compactBtn.createSpan({ text: "Compact" });
    compactBtn.addEventListener("click", () => {
      isCompact = !isCompact;
      compactBtn.toggleClass("is-active", isCompact);
      scrollViewport.toggleClass("is-compact", isCompact);
    });

    // Hint line below controls
    controls.createDiv({
      cls: "jdr-search-hint",
      text: searchHintLine({ kind: "monthly", tag: "health", tracker: "Mood" }),
    });

    // ── Render Function ──
    const render = (): void => {
      results.empty();
      summaryEl.empty();

      if (entries == null) {
        results.createDiv({ cls: "jdr-loading", text: "Reading your diary…" });
        return;
      }

      const q = parseQuery(searchQuery);
      const isFiltering =
        !isEmptyQuery(q) ||
        selectedYear !== "all" ||
        filterTasks ||
        filterAttach ||
        filterMonthly;

      if (!isFiltering) {
        summaryEl.createSpan({
          text: `${entries.length} ${entries.length === 1 ? "entry" : "entries"} indexed — type to search or select a filter.`,
        });
        results.appendChild(
          emptyCallout(
            "search",
            "Ready to search",
            "Type search terms, tags, or tracker filters above to find entries."
          )
        );
        return;
      }

      // Filter entries
      const hits: SearchHit[] = [];
      for (const entry of entries) {
        if (selectedYear !== "all" && (!entry.iso || !entry.iso.startsWith(selectedYear))) {
          continue;
        }
        if (filterTasks && entry.openTasks === 0) continue;
        if (filterAttach && entry.attachments === 0) continue;
        if (filterMonthly && entry.kind !== "monthly") continue;
        if (!passesFilters(entry, q)) continue;

        const score = scoreEntry(entry, q.terms);
        if (score < 0) continue;
        const { snippet, key } = buildSnippet(entry, q.terms);
        hits.push({ entry, score, snippet, snippetKey: key });
      }

      // Sort
      if (sortMode === "rank") {
        hits.sort((a, b) => b.score - a.score || byDateDesc(a.entry.iso, b.entry.iso));
      } else if (sortMode === "desc") {
        hits.sort((a, b) => byDateDesc(a.entry.iso, b.entry.iso));
      } else {
        hits.sort((a, b) => byDateDesc(b.entry.iso, a.entry.iso));
      }

      // Summary
      summaryEl.createSpan({
        text: `Found ${hits.length} ${hits.length === 1 ? "match" : "matches"} out of ${entries.length} ${
          entries.length === 1 ? "entry" : "entries"
        }`,
      });

      const clearLink = summaryEl.createEl("a", {
        cls: "jdr-timeline-clear-link",
        text: "Clear filters",
      });
      clearLink.addEventListener("click", () => {
        searchQuery = "";
        searchInput.value = "";
        searchClear.style.display = "none";
        selectedYear = "all";
        controls
          .findAll(".jdr-timeline-year-pill")
          .forEach((p, idx) => p.toggleClass("is-active", idx === 0));
        filterTasks = false;
        filterAttach = false;
        filterMonthly = false;
        tasksBtn.removeClass("is-active");
        attachBtn.removeClass("is-active");
        monthlyBtn.removeClass("is-active");
        render();
      });

      if (hits.length === 0) {
        results.appendChild(
          emptyCallout(
            "search-x",
            "No matches",
            "Nothing in your diary matches that. Try fewer words, or widen the filter criteria."
          )
        );
        return;
      }

      for (const hit of hits) {
        results.appendChild(
          entryRow(plugin, hit.entry, ctx.sourcePath, {
            snippet: hit.snippet,
            snippetKey: hit.snippetKey,
            highlightQuery: q.terms.length > 0 ? q.terms.join(" ") : undefined,
          })
        );
      }
    };

    render();
  });

  return root;
}

// ── on-this-day ───────────────────────────────────────────────────────
// This date in earlier years. The one feature here that gives an old archive a
// reason to be opened: everything else answers a question you already had,
// this one hands you something you didn't ask for.
//
// Renders nothing at all — not an empty box — when there are no anniversaries,
// because on a young vault that would be a permanent "you have no history"
// panel on the homepage. `on-this-day:always` opts into the empty state for
// anyone who'd rather see the placeholder hold its space.
export function buildOnThisDay(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  opts: { always?: boolean; maxYears?: number } = {}
): HTMLElement {
  const root = createDiv({ cls: "journal-table jdr-otd" });
  const body = root.createDiv({ cls: "jdr-otd-body" });
  body.createDiv({ cls: "jdr-loading", text: "Looking back…" });

  void readIndex(plugin).then((entries) => {
    const todayIso = today();
    const groups = anniversaries(entries, todayIso, opts.maxYears ?? 25);
    body.empty();

    if (groups.length === 0) {
      if (!opts.always) {
        root.hide();
        return;
      }
      body.appendChild(
        emptyCallout(
          "history",
          "Nothing on this day yet",
          "Once you've kept the diary through a year, this is where the same date in earlier years shows up."
        )
      );
      return;
    }

    const head = body.createDiv({ cls: "jdr-otd-head" });
    setIcon(head.createSpan({ cls: "jdr-otd-icon" }), "history");
    head.createSpan({
      cls: "jdr-otd-title",
      text: `On this day · ${moment(todayIso).format("D MMMM")}`,
    });

    for (const group of groups) {
      const section = body.createDiv({ cls: "jdr-otd-group" });
      section.createDiv({
        cls: "jdr-otd-year",
        text: group.yearsAgo === 1 ? "1 year ago" : `${group.yearsAgo} years ago`,
      });
      for (const entry of group.entries) {
        section.appendChild(
          entryRow(plugin, entry, ctx.sourcePath, {
            snippet: firstProse(entry),
            dateFormat: "YYYY",
          })
        );
      }
    }
  });

  return root;
}

// The opening of an entry's own prose, for a row that has no search term to
// centre a snippet on.
function firstProse(entry: IndexedEntry, width = 160): string {
  for (const r of entry.regions) {
    const content = r.content.replace(/\s+/g, " ").trim();
    if (content) return content.length <= width ? content : `${content.slice(0, width)}…`;
  }
  return "";
}

// ── timeline ──────────────────────────────────────────────────────────
// Every entry, newest first, grouped by month — what the "All Entries" link
// should always have meant. Diary.base is a Bases table: good for scanning
// properties, useless for reading, because the one thing it can't show is what
// you actually wrote.
//
// Windowed rather than paginated, and by month rather than by row count: a
// fixed page size cuts a month in half, and the month is the unit people
// recall in. "Show earlier" extends the window by a fixed number of months.
const TIMELINE_MONTHS = 3;

export function buildTimeline(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  initialMonths = TIMELINE_MONTHS
): HTMLElement {
  const root = createDiv({ cls: "journal-table jdr-timeline" });
  const controls = root.createDiv({ cls: "jdr-timeline-controls" });
  const summaryEl = root.createDiv({ cls: "jdr-timeline-summary" });
  const scrollViewport = root.createDiv({ cls: "jdr-timeline-scroll" });
  const body = scrollViewport.createDiv({ cls: "jdr-timeline-body" });
  body.createDiv({ cls: "jdr-loading", text: "Reading your diary…" });

  // State held across repaints
  let shown = Math.max(1, initialMonths);
  let searchQuery = "";
  let selectedYear = "all";
  let filterTasks = false;
  let filterAttach = false;
  let filterMonthly = false;
  let sortOrder: "desc" | "asc" = "desc";
  let isCompact = false;
  const collapsedMonths = new Set<string>();

  void readIndex(plugin).then((entries) => {
    // Distinct years in descending order
    const years = Array.from(
      new Set(
        entries
          .map((e) => (e.iso ? e.iso.slice(0, 4) : null))
          .filter((y): y is string => Boolean(y))
      )
    ).sort().reverse();

    // ── Build Controls ──
    controls.empty();

    // 1. Search Row
    const searchRow = controls.createDiv({ cls: "jdr-timeline-search-row" });
    const searchWrap = searchRow.createDiv({ cls: "jdr-timeline-search-wrap" });
    const searchIcon = searchWrap.createDiv({ cls: "jdr-timeline-search-icon" });
    setIcon(searchIcon, "search");

    const searchInput = searchWrap.createEl("input", {
      cls: "jdr-timeline-search-input",
      attr: {
        type: "text",
        placeholder: "Filter by text, #tag, [mood>=5], has:task...",
      },
    });

    const searchClear = searchWrap.createEl("button", {
      cls: "jdr-timeline-search-clear",
      text: "✕",
      attr: { type: "button" },
    });
    searchClear.style.display = "none";

    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value;
      searchClear.style.display = searchQuery ? "block" : "none";
      paint();
    });

    searchClear.addEventListener("click", () => {
      searchInput.value = "";
      searchQuery = "";
      searchClear.style.display = "none";
      searchInput.focus();
      paint();
    });

    // 2. Filters & View Actions Row
    const filterRow = controls.createDiv({ cls: "jdr-timeline-filters-row" });
    const chipsWrap = filterRow.createDiv({ cls: "jdr-timeline-chips" });

    // Year Pills
    if (years.length > 1) {
      const yearPills = chipsWrap.createDiv({ cls: "jdr-timeline-year-pills" });
      const yearOptions = ["all", ...years];
      for (const y of yearOptions) {
        const pill = yearPills.createEl("button", {
          cls: `jdr-timeline-year-pill${selectedYear === y ? " is-active" : ""}`,
          text: y === "all" ? "All" : y,
          attr: { type: "button" },
        });
        pill.addEventListener("click", () => {
          selectedYear = y;
          yearPills
            .findAll(".jdr-timeline-year-pill")
            .forEach((p) => p.removeClass("is-active"));
          pill.addClass("is-active");
          paint();
        });
      }
    }

    // Attribute Filter Buttons
    const addFilterBtn = (
      label: string,
      iconName: string,
      isChecked: () => boolean,
      onToggle: (active: boolean) => void
    ) => {
      const btn = chipsWrap.createEl("button", {
        cls: `jdr-timeline-chip${isChecked() ? " is-active" : ""}`,
        attr: { type: "button" },
      });
      const iconSpan = btn.createSpan({ cls: "jdr-timeline-chip-icon" });
      setIcon(iconSpan, iconName);
      btn.createSpan({ text: label });
      btn.addEventListener("click", () => {
        const next = !isChecked();
        onToggle(next);
        btn.toggleClass("is-active", next);
        paint();
      });
      return btn;
    };

    const tasksBtn = addFilterBtn("Tasks", "square", () => filterTasks, (v) => { filterTasks = v; });
    const attachBtn = addFilterBtn("Files", "paperclip", () => filterAttach, (v) => { filterAttach = v; });
    const monthlyBtn = addFilterBtn("Monthly", "calendar", () => filterMonthly, (v) => { filterMonthly = v; });

    // View Actions (Sort & Compact)
    const actionsWrap = filterRow.createDiv({ cls: "jdr-timeline-actions" });

    const sortBtn = actionsWrap.createEl("button", {
      cls: "jdr-timeline-action-btn",
      attr: { type: "button", title: "Toggle sort order" },
    });
    const sortIcon = sortBtn.createSpan({ cls: "jdr-timeline-chip-icon" });
    setIcon(sortIcon, "arrow-down-up");
    const sortText = sortBtn.createSpan({ text: sortOrder === "desc" ? "Newest" : "Oldest" });
    sortBtn.addEventListener("click", () => {
      sortOrder = sortOrder === "desc" ? "asc" : "desc";
      sortText.setText(sortOrder === "desc" ? "Newest" : "Oldest");
      paint();
    });

    const compactBtn = actionsWrap.createEl("button", {
      cls: "jdr-timeline-action-btn",
      attr: { type: "button", title: "Toggle compact view" },
    });
    const compactIcon = compactBtn.createSpan({ cls: "jdr-timeline-chip-icon" });
    setIcon(compactIcon, "list");
    compactBtn.createSpan({ text: "Compact" });
    compactBtn.addEventListener("click", () => {
      isCompact = !isCompact;
      compactBtn.toggleClass("is-active", isCompact);
      scrollViewport.toggleClass("is-compact", isCompact);
    });

    // ── Paint Function ──
    const paint = (): void => {
      body.empty();
      summaryEl.empty();

      // Parse full query from input
      const parsed = parseQuery(searchQuery);
      const isFiltering =
        !isEmptyQuery(parsed) ||
        selectedYear !== "all" ||
        filterTasks ||
        filterAttach ||
        filterMonthly;

      const filtered = entries.filter((e) => {
        if (selectedYear !== "all" && (!e.iso || !e.iso.startsWith(selectedYear))) {
          return false;
        }
        if (filterTasks && e.openTasks === 0) return false;
        if (filterAttach && e.attachments === 0) return false;
        if (filterMonthly && e.kind !== "monthly") return false;

        if (!passesFilters(e, parsed)) return false;

        if (parsed.terms.length > 0) {
          const score = scoreEntry(e, parsed.terms);
          if (score < 0) return false;
        }
        return true;
      });

      // Group
      const sortedEntries = [...filtered].sort((a, b) => {
        const isoA = a.iso ?? "";
        const isoB = b.iso ?? "";
        return sortOrder === "desc"
          ? isoB.localeCompare(isoA)
          : isoA.localeCompare(isoB);
      });
      const groups = groupByMonth(sortedEntries);
      if (sortOrder === "asc") {
        groups.reverse();
      }

      // Summary
      summaryEl.createSpan({
        text: `Showing ${filtered.length} of ${entries.length} ${
          entries.length === 1 ? "entry" : "entries"
        } across ${groups.length} ${groups.length === 1 ? "month" : "months"}`,
      });

      if (isFiltering) {
        const clearLink = summaryEl.createEl("a", {
          cls: "jdr-timeline-clear-link",
          text: "Clear filters",
        });
        clearLink.addEventListener("click", () => {
          searchQuery = "";
          searchInput.value = "";
          searchClear.style.display = "none";
          selectedYear = "all";
          controls
            .findAll(".jdr-timeline-year-pill")
            .forEach((p, idx) => p.toggleClass("is-active", idx === 0));
          filterTasks = false;
          filterAttach = false;
          filterMonthly = false;
          tasksBtn.removeClass("is-active");
          attachBtn.removeClass("is-active");
          monthlyBtn.removeClass("is-active");
          paint();
        });
      }

      if (groups.length === 0) {
        body.appendChild(
          emptyCallout(
            "book-open",
            isFiltering ? "No matching entries" : "No entries yet",
            isFiltering
              ? "Try adjusting or clearing your search filters."
              : "Once you've written a few days, they'll all be listed here."
          )
        );
        return;
      }

      // Render month groups
      const monthsToRender = isFiltering ? groups : groups.slice(0, shown);
      for (const group of monthsToRender) {
        const isCollapsed = collapsedMonths.has(group.month);
        const section = body.createDiv({ cls: "jdr-timeline-month" });
        const head = section.createDiv({ cls: "jdr-timeline-head" });

        const nameEl = head.createDiv({ cls: "jdr-timeline-month-name" });
        const headIcon = nameEl.createSpan({ cls: "jdr-timeline-head-icon" });
        setIcon(headIcon, isCollapsed ? "chevron-right" : "chevron-down");
        nameEl.createSpan({ text: moment(`${group.month}-01`).format("MMMM YYYY") });

        head.createSpan({
          cls: "jdr-timeline-count",
          text: `${group.entries.length} ${group.entries.length === 1 ? "entry" : "entries"}`,
        });

        head.addEventListener("click", () => {
          if (collapsedMonths.has(group.month)) {
            collapsedMonths.delete(group.month);
          } else {
            collapsedMonths.add(group.month);
          }
          paint();
        });

        if (!isCollapsed) {
          for (const entry of group.entries) {
            section.appendChild(
              entryRow(plugin, entry, ctx.sourcePath, {
                snippet: firstProse(entry),
                dateFormat: "D",
                highlightQuery: parsed.terms.length > 0 ? parsed.terms.join(" ") : undefined,
              })
            );
          }
        }
      }

      // Show earlier button (when not filtering)
      if (!isFiltering) {
        const remaining = groups.length - shown;
        if (remaining > 0) {
          const more = body.createEl("button", {
            cls: "journal-btn jdr-timeline-more",
            attr: { type: "button" },
          });
          setIcon(more.createSpan({ cls: "journal-btn-icon" }), "chevron-down");
          more.createSpan({
            cls: "journal-btn-label",
            text: `Show earlier — ${remaining} more ${remaining === 1 ? "month" : "months"}`,
          });
          more.addEventListener("click", (evt) => {
            evt.preventDefault();
            shown += TIMELINE_MONTHS;
            paint();
          });
        }
      }
    };

    paint();
  });

  return root;
}
