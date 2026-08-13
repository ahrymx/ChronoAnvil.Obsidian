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
  groupByMonth,
  IndexedEntry,
  isEmptyQuery,
  parseQuery,
  readIndex,
  searchEntries,
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

// One entry as a row: date gutter, title, snippet, and a facts strip. Used by
// all three views so an entry reads identically wherever it's listed.
//
// `dateFormat` varies by view — the timeline groups by month so its rows only
// need the day, while a search result can be from any year and needs the lot.
function entryRow(
  plugin: AlmanacPlugin,
  entry: IndexedEntry,
  sourcePath: string,
  opts: { snippet?: string; snippetKey?: string | null; dateFormat?: string } = {}
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
    text: entry.title,
    href: noExt(entry.file.path),
  });
  wireOpen(titleEl, plugin, entry.file, sourcePath);

  const snippet = opts.snippet ?? "";
  if (snippet) {
    const line = main.createDiv({ cls: "jdr-snippet" });
    if (opts.snippetKey) {
      line.createSpan({ cls: "jdr-snippet-key", text: opts.snippetKey });
    }
    line.createSpan({ text: snippet });
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

  const bar = root.createDiv({ cls: "jdr-search-bar" });
  const iconEl = bar.createDiv({ cls: "jdr-search-icon" });
  setIcon(iconEl, "search");
  const input = bar.createEl("input", {
    cls: "jdr-search-input",
    attr: { type: "text", placeholder: "Search your diary…", spellcheck: "false" },
  });
  const clear = bar.createEl("button", {
    cls: "journal-btn-ghost jdr-search-clear",
    attr: { type: "button", "aria-label": "Clear search" },
  });
  setIcon(clear.createSpan({ cls: "journal-btn-icon" }), "x");
  clear.hide();

  root.createDiv({
    cls: "jdr-search-hint",
    text: "Filters: from:30d · to:2026-03 · tag:health · is:monthly · has:attachment · Mood<=2",
  });

  const status = root.createDiv({ cls: "jdr-search-status" });
  const results = root.createDiv({ cls: "jdr-results" });

  let entries: IndexedEntry[] | null = null;
  let pending = "";

  const render = (): void => {
    results.empty();
    status.empty();
    if (entries == null) {
      status.setText("Reading your diary…");
      return;
    }
    const q = parseQuery(pending);
    if (isEmptyQuery(q)) {
      status.setText(
        `${entries.length} ${entries.length === 1 ? "entry" : "entries"} indexed — type to search.`
      );
      return;
    }
    const hits: SearchHit[] = searchEntries(entries, q);
    if (hits.length === 0) {
      results.appendChild(
        emptyCallout(
          "search-x",
          "No matches",
          "Nothing in your diary matches that. Try fewer words, or widen the date range."
        )
      );
      return;
    }
    status.setText(`${hits.length} ${hits.length === 1 ? "match" : "matches"}`);
    for (const hit of hits) {
      results.appendChild(
        entryRow(plugin, hit.entry, ctx.sourcePath, {
          snippet: hit.snippet,
          snippetKey: hit.snippetKey,
        })
      );
    }
  };

  // Debounced so typing doesn't re-score the whole index on every keystroke.
  // The read itself already happened; this only guards the scoring pass.
  let timer: number | null = null;
  const schedule = (): void => {
    if (timer != null) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      render();
    }, 120);
  };

  input.addEventListener("input", () => {
    pending = input.value;
    if (pending) clear.show();
    else clear.hide();
    schedule();
  });
  input.addEventListener("keydown", (evt) => {
    if (evt.key === "Escape") {
      input.value = "";
      pending = "";
      clear.hide();
      render();
    }
  });
  clear.addEventListener("click", (evt) => {
    evt.preventDefault();
    input.value = "";
    pending = "";
    clear.hide();
    input.focus();
    render();
  });

  render();
  void readIndex(plugin).then((list) => {
    entries = list;
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
  const body = root.createDiv({ cls: "jdr-timeline-body" });
  body.createDiv({ cls: "jdr-loading", text: "Reading your diary…" });

  // Held outside the paint so "show earlier" survives a repaint, the same way
  // calendar.ts holds its viewed month outside its builder.
  let shown = Math.max(1, initialMonths);

  void readIndex(plugin).then((entries) => {
    const groups = groupByMonth(entries);

    const paint = (): void => {
      body.empty();

      if (groups.length === 0) {
        body.appendChild(
          emptyCallout(
            "book-open",
            "No entries yet",
            "Once you've written a few days, they'll all be listed here newest first."
          )
        );
        return;
      }

      const total = entries.length;
      body.createDiv({
        cls: "jdr-timeline-summary",
        text: `${total} ${total === 1 ? "entry" : "entries"} across ${groups.length} ${
          groups.length === 1 ? "month" : "months"
        }`,
      });

      for (const group of groups.slice(0, shown)) {
        const section = body.createDiv({ cls: "jdr-timeline-month" });
        const head = section.createDiv({ cls: "jdr-timeline-head" });
        head.createSpan({
          cls: "jdr-timeline-month-name",
          text: moment(`${group.month}-01`).format("MMMM YYYY"),
        });
        head.createSpan({
          cls: "jdr-timeline-count",
          text: `${group.entries.length} ${group.entries.length === 1 ? "entry" : "entries"}`,
        });
        for (const entry of group.entries) {
          section.appendChild(
            entryRow(plugin, entry, ctx.sourcePath, {
              snippet: firstProse(entry),
              dateFormat: "D",
            })
          );
        }
      }

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
    };

    paint();
  });

  return root;
}
