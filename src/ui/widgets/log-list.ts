// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// A stamped region, drawn as one card per item.
//
// WHAT IT REPLACES, AND WHY
//
// A textarea holding the whole region. Captures arrive stamped and separated —
// they have been items since the feature shipped — but the only view of them
// was the raw text, so there was no way to cross one off, delete one, or fix a
// typo in one without editing all of them at once. People treat a capture log
// as a to-do list whether or not it is one, and a list you cannot tick is a
// list you stop using.
//
// ── ONE LIST, TWO CALLERS (4.52) ────────────────────────────────────
//
// This was `buildCaptureLog` and it is now the body under two builders: the
// capture region on a diary entry, and a LOGBOOK — a standing note holding what
// belongs to the diary and to no single day. They are the same region grammar
// (`diary/log-items.ts`) drawn the same way, and the differences between them
// are four options rather than four hundred lines:
//
//   • WHOSE FILE. A capture list writes the note it is drawn on; a logbook
//     writes the logbook's note, wherever the widget happens to sit.
//   • WHETHER THE STAMP CARRIES A DATE. A capture's note already knows the day.
//   • WHETHER THERE IS AN ADD BOX. Captures arrive from the capture box; a
//     logbook's only surface is this widget, so it must be able to take one.
//   • WHAT THE EMPTY STATE SAYS, which is the one thing a reader reads when
//     there is nothing else to read.
//
// MODELLED ON `buildTasks` (note-regions.ts), WITH TWO DIFFERENCES that are
// both forced rather than chosen:
//
//   AN ITEM IS MULTI-LINE. `tasks:`, `recall` and `attach:` all collapse an
//   item to one line, and `formatLogItem` deliberately does not — "a three-line
//   thought is one moment". So the card body is a textarea rather than an
//   input, and edit is a mode on the card rather than a permanently live field.
//
//   IT WATCHES THE FILE. `buildTasks` reads its region once and owns the array
//   thereafter, which is right for a list only its own controls write to. The
//   capture region has a second writer by design — the capture box, and the
//   mood pencil — and the whole point of 4.27 was that an arriving capture must
//   appear rather than be overwritten. So this re-reads on change, and the
//   guard against clobbering an open editor is the same one the textarea used:
//   skip while something here is being edited.
//
// THE BASELINE IS CARRIED for the same reason. `buildTasks`'s `persist` passes
// none and writes straight through; this one cannot, or an item arriving
// between a render and a click would be lost to the click.

import { MarkdownRenderChild, setIcon } from "obsidian";
import type { App, TFile } from "obsidian";
import type { NoteRegionHost } from "./note-regions";
import { fieldHead } from "./note-field";
import { readNoteRegion } from "../../core/notestore";
import { whenEditor, type WhenValue } from "../when-editor";
import {
  parseLogItems,
  serializeLogItems,
  type LogItem,
} from "../../diary/log-items";
import { today } from "../../core/util";

// Re-reads the region when the file changes underneath the list. Same shape as
// `NoteFieldWatcher`, and named separately because the two guard different
// things: that one protects a cursor in a textarea, this one protects a card
// that is open for editing.
export class LogListWatcher extends MarkdownRenderChild {
  private paths: Set<string>;
  constructor(
    private app: App,
    hostEl: HTMLElement,
    watchPathOrPaths: string | readonly string[],
    private refresh: () => void
  ) {
    super(hostEl);
    this.paths = new Set(
      typeof watchPathOrPaths === "string"
        ? [watchPathOrPaths]
        : watchPathOrPaths
    );
  }

  onload(): void {
    const trigger = (path: string) => {
      if (this.paths.has(path)) this.refresh();
    };
    this.registerEvent(this.app.vault.on("modify", (f) => trigger(f.path)));
    this.registerEvent(this.app.vault.on("create", (f) => trigger(f.path)));
    this.registerEvent(this.app.vault.on("delete", (f) => trigger(f.path)));
    this.registerEvent(
      this.app.vault.on("rename", (f, oldPath) => {
        trigger(f.path);
        trigger(oldPath);
      })
    );
  }
}

export interface LogTypeOption {
  id: string;
  label: string;
  icon?: string;
  color?: string;
}

export interface LogListOptions {
  /** The region key. `capture` for a capture log, `logbook` for a logbook. */
  key: string;
  /**
   * The note whose region this is, or null when there is not one yet.
   *
   * NULL IS A REAL STATE AND NOT A FAILURE: a logbook's note is written on the
   * first item, never on a render, so a widget pointed at one that does not
   * exist draws its empty state and waits. See `onAdd`.
   */
  file: TFile | null;
  /** Explicit path or paths to watch for external modifications/creates */
  watchPath?: string;
  watchPaths?: string[];
  /** Extra modifier class on the wrapper, so the two callers can be told apart. */
  modifier: string;
  /** The field head's title, or null for a list with no head. */
  label: string | null;
  /**
   * WHETHER SOMETHING ELSE ALREADY NAMES THIS LIST, and that bar's actions
   * slot. 5.14, and the same pair every field renderer now takes.
   */
  titled?: boolean;
  barActions?: HTMLElement | null;
  /**
   * Where the fold is remembered.
   *
   * `collapsible` USED TO BE HERE AND IS GONE (5.14). It meant "draw a fold
   * bar", and a labelled list that did not fold is not a thing any more: a head
   * is a head, and every one of them folds. Both logbook callers passed
   * `label: null` with it false, which is the same widget it was before —
   * no label, no head, nothing to fold.
   */
  startCollapsed: () => boolean;
  onFold: (v: boolean) => void;
  /** What to say when there is nothing here. */
  emptyText: string;
  /**
   * The add box, or null for a list nothing is typed into directly.
   *
   * `stamp` is asked at the moment of the add rather than at render, because a
   * page left open past midnight would otherwise file tomorrow's item under
   * today — the same reason `captureTo` resolves its target on save.
   */
  add: {
    placeholder: string;
    stamp: () => Pick<LogItem, "date" | "time" | "mins">;
  } | null;
  /**
   * Whether an item here carries a day of its own.
   *
   * A CAPTURE'S DAY IS ITS NOTE'S, so its cards show no date and its *when*
   * control offers none — a date field on a capture would let a reader file an
   * item into a day the note it lives in is not. A logbook spans months and
   * every item states its own.
   *
   * STATED RATHER THAN INFERRED FROM `stamp().date`. The two callers know the
   * answer and it does not change; reading it off a function that is
   * deliberately called at the moment of the add would ask a live question to
   * settle a fixed one.
   */
  dated: boolean;
  /**
   * Makes the note when there is none, or null where there always is one.
   *
   * THE CALLER OWNS THIS BECAUSE THE CALLER KNOWS THE PATH. A capture region
   * lives in an entry that exists by definition — you are looking at it — and
   * passes null. A logbook's note is written by its first item, from the def's
   * own `path`, which is a fact about the registry and not about a list.
   */
  createNote: (() => Promise<TFile | null>) | null;
  /**
   * Registers the file watcher's lifetime with the block that drew this. The
   * ctx's own `addChild`, taken as a function so this module needs nothing from
   * the postprocessor but the one method it uses.
   */
  addChild: (child: MarkdownRenderChild) => void;
  /** Optional multi-type filter options for logbooks */
  types?: LogTypeOption[];
  activeType?: string;
  getItemType?: (item: LogItem) => string | undefined;
  getItemTypeTag?: (item: LogItem) => { label: string; icon?: string; color?: string } | undefined;
  onAddMulti?: (typeId: string, item: LogItem) => Promise<void>;
  onItemUpdate?: (item: LogItem, prevItem: LogItem) => Promise<void>;
  onItemDelete?: (item: LogItem) => Promise<void>;
  itemsProvider?: () => Promise<LogItem[]>;
}

function highlightMatches(el: HTMLElement, text: string, query: string): void {
  const q = query.trim().toLowerCase();
  if (!q) {
    el.setText(text);
    return;
  }
  el.empty();
  const lower = text.toLowerCase();
  let start = 0;
  let idx = lower.indexOf(q, start);
  while (idx !== -1) {
    if (idx > start) {
      el.appendText(text.slice(start, idx));
    }
    el.createEl("mark", {
      cls: "ca-jcl-highlight",
      text: text.slice(idx, idx + q.length),
    });
    start = idx + q.length;
    idx = lower.indexOf(q, start);
  }
  if (start < text.length) {
    el.appendText(text.slice(start));
  }
}

function formatLogText(el: HTMLElement, text: string, query: string): void {
  el.empty();
  const q = query.trim().toLowerCase();
  const tokenRegex = /(`[^`]+`)|(#[a-zA-Z0-9_\-/]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const appendSegment = (segmentText: string, kind?: "tag" | "code"): void => {
    if (!segmentText) return;
    if (kind === "tag") {
      const tagSpan = el.createSpan({ cls: "ca-jcl-text-tag", text: segmentText });
      if (q && segmentText.toLowerCase().includes(q)) {
        highlightMatches(tagSpan, segmentText, q);
      }
    } else if (kind === "code") {
      const codeSpan = el.createEl("code", {
        cls: "ca-jcl-text-code",
        text: segmentText.slice(1, -1),
      });
      if (q && segmentText.toLowerCase().includes(q)) {
        highlightMatches(codeSpan, segmentText.slice(1, -1), q);
      }
    } else {
      highlightMatches(el, segmentText, q);
    }
  };

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      appendSegment(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      appendSegment(match[1], "code");
    } else if (match[2]) {
      appendSegment(match[2], "tag");
    }
    lastIndex = tokenRegex.lastIndex;
  }
  if (lastIndex < text.length) {
    appendSegment(text.slice(lastIndex));
  }
}

// What the deck sets and `render` reads: the four questions a reader can ask of
// the list without touching the note behind it.
//
// A MUTABLE RECORD RATHER THAN FOUR SETTERS. The deck writes it, `render` reads
// it, and the alternative — four callbacks passed down against four `let`s held
// up — is the same coupling written twice. Nothing outlives the widget: one
// record per list, reachable from nowhere else.
interface LogFilters {
  search: string;
  type: string;
  status: "all" | "open" | "done" | "timed";
  sort: "desc" | "asc";
}

// The bar above the list: which logbook, what text, which status, which way up,
// and how tightly drawn.
//
// EXTRACTED FROM `buildLogList` IN 5.2 — the filter bar M7 names, and the one
// stretch of that function whose entire job is to set four values and ask for a
// repaint. Every element it builds is its own; the only things that leave are
// the count badges, which `render` fills because only `render` knows how many
// items there are.
//
// THE DISMISSAL LISTENER MOVES WITH IT, its add and its remove still in one pair
// of lines — which is what `test/review-checklist.test.ts` sweeps for, and what
// the essay inside is about.
//
// `onChange` IS A THUNK OVER `render`, which the caller declares AFTER this
// call. Safe for exactly the reason it was safe inline: nothing here calls it
// while building, only listeners do, and by then the const is bound. Same for
// `setCompact`, which reaches a scroll container that does not exist yet.
function buildLogDeck(
  wrap: HTMLElement,
  opts: LogListOptions,
  filters: LogFilters,
  onChange: () => void,
  setCompact: (on: boolean) => void
): Map<string, HTMLElement> {
  // ── CONTROLS DECK (Dropdown Type Selector, Collapsible Search, Status Segment) ───
  const deck = wrap.createDiv({ cls: "ca-journal-logbook-deck" });

  // `isCompact` and `searchOpen` STAY HERE while the four filters do not: they
  // are how this bar looks, not what the list shows. Nothing below the deck ever
  // asks whether the search strip is open.
  let isCompact = false;
  let searchOpen = false;

  // Top row: Leading type filter dropdown on left (replaces title), Action buttons on right
  const topBar = deck.createDiv({ cls: "ca-jcl-top-bar" });

  const pillCountMap = new Map<string, HTMLElement>();
  let typeIconEl: HTMLElement | null = null;
  let typeLabelEl: HTMLElement | null = null;
  let dropdownMenuEl: HTMLElement | null = null;
  let typeDropdownBtn: HTMLButtonElement | null = null;

  // THE DISMISSAL LISTENER LIVES AS LONG AS THE MENU IS OPEN, AND NO LONGER.
  //
  // This used to be one `document.addEventListener("click", …)` wired once when
  // the list was built, with an anonymous handler and no removal — so it could
  // not be taken off, and it outlived the dropdown, the note it was drawn on,
  // and the plugin being disabled. Every re-render of every logbook widget
  // added another. `buildLogList` returns an element and has no render child to
  // register a teardown on, so the fix is not `registerDomEvent`: it is to hold
  // the listener only while there is something for it to close.
  //
  // THE SHAPE `periodnav.ts` AND `entryheader.ts` ALREADY USE — attach on open,
  // remove in the close path — so the three menus in this plugin now dismiss
  // the same way rather than two ways.
  //
  // BUBBLE PHASE, NOT CAPTURE, and unlike those two this needs no deferred
  // attach. The trigger calls `stopPropagation`, which keeps the opening click
  // from reaching document — and would NOT keep it from a capture-phase
  // listener, since capture runs document-first. That is the whole reason the
  // other two defer with a `setTimeout` and this one does not.
  const onDocClick = (): void => setDropdownOpen(false);

  const setDropdownOpen = (next: boolean): void => {
    dropdownMenuEl?.toggleClass("is-open", next);
    typeDropdownBtn?.toggleClass("is-open", next);
    if (next) document.addEventListener("click", onDocClick);
    else document.removeEventListener("click", onDocClick);
  };

  if (opts.types && opts.types.length > 1) {
    const dropdownWrap = topBar.createDiv({ cls: "ca-jcl-dropdown-wrap" });
    typeDropdownBtn = dropdownWrap.createEl("button", {
      cls: "ca-jcl-type-dropdown-btn",
      attr: { type: "button", "aria-label": "Select logbook type" },
    });
    typeIconEl = typeDropdownBtn.createSpan({ cls: "ca-jcl-type-icon", text: "📚" });
    typeLabelEl = typeDropdownBtn.createSpan({ cls: "ca-jcl-type-label", text: "All Logbooks" });
    const caret = typeDropdownBtn.createSpan({ cls: "ca-jcl-dropdown-caret" });
    setIcon(caret, "chevron-down");

    dropdownMenuEl = dropdownWrap.createDiv({ cls: "ca-jcl-dropdown-menu" });

    // "All" option
    const allItem = dropdownMenuEl.createEl("button", {
      cls: `ca-jcl-dropdown-item${filters.type === "all" ? " is-selected" : ""}`,
      attr: { type: "button" },
    });
    const allLeft = allItem.createDiv({ cls: "ca-jcl-dropdown-item-left" });
    allLeft.createSpan({ cls: "ca-jcl-item-icon", text: "📚" });
    allLeft.createSpan({ cls: "ca-jcl-item-label", text: "All Logbooks" });
    const allCount = allItem.createSpan({ cls: "ca-jcl-dropdown-badge", text: "0" });
    pillCountMap.set("all", allCount);

    allItem.addEventListener("click", (e) => {
      e.stopPropagation();
      filters.type = "all";
      updateDropdownSelection();
      onChange();
    });

    for (const t of opts.types) {
      const item = dropdownMenuEl.createEl("button", {
        cls: `ca-jcl-dropdown-item${filters.type === t.id ? " is-selected" : ""}`,
        attr: { type: "button" },
      });
      const itemLeft = item.createDiv({ cls: "ca-jcl-dropdown-item-left" });
      if (t.icon) itemLeft.createSpan({ cls: "ca-jcl-item-icon", text: t.icon });
      itemLeft.createSpan({ cls: "ca-jcl-item-label", text: t.label });
      const c = item.createSpan({ cls: "ca-jcl-dropdown-badge", text: "0" });
      pillCountMap.set(t.id, c);

      item.addEventListener("click", (e) => {
        e.stopPropagation();
        filters.type = t.id;
        updateDropdownSelection();
        onChange();
      });
    }

    typeDropdownBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setDropdownOpen(!dropdownMenuEl?.hasClass("is-open"));
    });
  }

  const updateDropdownSelection = (): void => {
    if (!dropdownMenuEl || !typeDropdownBtn || !typeIconEl || !typeLabelEl) return;
    // Through the same door as every other close, so the dismissal listener
    // comes off here too. Picking an item used to clear the class directly and
    // leave the listener attached, which is how one open menu could leave two.
    setDropdownOpen(false);
    const items = Array.from(
      dropdownMenuEl.querySelectorAll<HTMLButtonElement>(".ca-jcl-dropdown-item")
    );
    if (items[0]) items[0].toggleClass("is-selected", filters.type === "all");
    if (opts.types) {
      opts.types.forEach((t, i) => {
        if (items[i + 1]) {
          items[i + 1].toggleClass("is-selected", filters.type === t.id);
        }
      });
    }
    if (filters.type === "all") {
      typeIconEl.setText("📚");
      typeLabelEl.setText("All Logbooks");
    } else {
      const activeDef = opts.types?.find((t) => t.id === filters.type);
      if (activeDef) {
        typeIconEl.setText(activeDef.icon ?? "🗒️");
        typeLabelEl.setText(activeDef.label);
      }
    }
  };

  // Top right actions
  const actionsGroup = topBar.createDiv({ cls: "ca-jcl-actions-group" });

  const searchToggle = actionsGroup.createEl("button", {
    cls: "ca-jcl-action-chip ca-jcl-search-toggle",
    attr: { type: "button", title: "Toggle search bar", "aria-label": "Toggle search bar" },
  });
  const searchToggleIcon = searchToggle.createSpan({ cls: "ca-jcl-action-icon" });
  setIcon(searchToggleIcon, "search");
  searchToggle.createSpan({ cls: "ca-jcl-action-label", text: "Search" });

  const sortBtn = actionsGroup.createEl("button", {
    cls: "ca-jcl-action-chip",
    attr: { type: "button", title: "Toggle sort order", "aria-label": "Toggle sort order" },
  });
  const sortIcon = sortBtn.createSpan({ cls: "ca-jcl-action-icon" });
  setIcon(sortIcon, "arrow-down-up");
  const sortLabel = sortBtn.createSpan({ cls: "ca-jcl-action-label", text: "Newest" });
  sortBtn.addEventListener("click", () => {
    filters.sort = filters.sort === "desc" ? "asc" : "desc";
    sortLabel.setText(filters.sort === "desc" ? "Newest" : "Oldest");
    onChange();
  });

  const compactBtn = actionsGroup.createEl("button", {
    cls: "ca-jcl-action-chip",
    attr: { type: "button", title: "Toggle compact view", "aria-label": "Toggle compact view" },
  });
  const compactIcon = compactBtn.createSpan({ cls: "ca-jcl-action-icon" });
  setIcon(compactIcon, "list");
  compactBtn.createSpan({ cls: "ca-jcl-action-label", text: "Compact" });
  compactBtn.addEventListener("click", () => {
    isCompact = !isCompact;
    compactBtn.toggleClass("is-active", isCompact);
    setCompact(isCompact);
  });

  // Collapsible Search Strip
  const searchStrip = deck.createDiv({ cls: "ca-jcl-search-strip" });
  const searchWrap = searchStrip.createDiv({ cls: "ca-jcl-search-wrap" });
  const searchIcon = searchWrap.createSpan({ cls: "ca-jcl-search-icon" });
  setIcon(searchIcon, "search");
  const searchInput = searchWrap.createEl("input", {
    cls: "ca-jcl-search-input",
    attr: { type: "text", placeholder: "Filter log items by text, time, #tag…" },
  });
  const searchClear = searchWrap.createEl("button", {
    cls: "ca-jcl-search-clear",
    text: "✕",
    attr: { type: "button", "aria-label": "Clear search", style: "display: none;" },
  });

  searchToggle.addEventListener("click", () => {
    searchOpen = !searchOpen;
    searchStrip.toggleClass("is-open", searchOpen);
    searchToggle.toggleClass("is-active", searchOpen);
    if (searchOpen) {
      searchInput.focus();
    } else {
      searchInput.value = "";
      filters.search = "";
      searchClear.style.display = "none";
      onChange();
    }
  });

  searchInput.addEventListener("input", () => {
    filters.search = searchInput.value;
    searchClear.style.display = filters.search ? "inline-flex" : "none";
    onChange();
  });
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    filters.search = "";
    searchClear.style.display = "none";
    searchInput.focus();
    onChange();
  });

  // Status Segment Row
  const statusRow = deck.createDiv({ cls: "ca-jcl-status-row" });
  const statusSegment = statusRow.createDiv({ cls: "ca-jcl-status-segment" });
  const statusPills: { id: "all" | "open" | "done" | "timed"; label: string; btn: HTMLButtonElement }[] = [];
  for (const s of [
    { id: "all" as const, label: "All" },
    { id: "open" as const, label: "Open" },
    { id: "done" as const, label: "Done" },
    { id: "timed" as const, label: "Timed" },
  ]) {
    const btn = statusSegment.createEl("button", {
      cls: `ca-jcl-status-segment-btn${filters.status === s.id ? " is-active" : ""}`,
      text: s.label,
      attr: { type: "button" },
    });
    btn.addEventListener("click", () => {
      filters.status = s.id;
      statusPills.forEach((p) => p.btn.toggleClass("is-active", p.id === filters.status));
      onChange();
    });
    statusPills.push({ ...s, btn });
  }

  return pillCountMap;
}

// The list the reader is looking at: the items, minus the ones the deck's four
// filters exclude, in the order the sort button asks for.
//
// EXTRACTED FROM `render` IN 5.2 and the only piece of it with no DOM in it —
// which is the whole reason it is the piece that came out. `render` keeps the
// counts, the empty states, the cards and their callbacks, because every one of
// those closes over state this function must not see.
//
// CARRIES `originalIndex` THROUGH. A card edits, toggles or deletes by position
// in `items`, not by position on screen, and filtering or reversing the list
// must not change which item a click lands on — that pairing is the reason this
// maps to a record before it filters rather than filtering the items directly.
function filterLogItems(
  items: LogItem[],
  filters: LogFilters,
  opts: LogListOptions
): { item: LogItem; originalIndex: number }[] {
  // Filter items
  let filtered = items.map((item, originalIndex) => ({ item, originalIndex }));

  if (filters.type !== "all" && opts.getItemType) {
    filtered = filtered.filter(({ item }) => opts.getItemType!(item) === filters.type);
  }

  if (filters.status === "open") {
    filtered = filtered.filter(({ item }) => !item.done);
  } else if (filters.status === "done") {
    filtered = filtered.filter(({ item }) => !!item.done);
  } else if (filters.status === "timed") {
    filtered = filtered.filter(({ item }) => item.mins != null);
  }

  if (filters.search.trim()) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter(({ item }) => {
      const matchesText = item.text.toLowerCase().includes(q);
      const matchesDate = item.date ? item.date.toLowerCase().includes(q) : false;
      const matchesTime = item.time ? item.time.toLowerCase().includes(q) : false;
      return matchesText || matchesDate || matchesTime;
    });
  }

  // Sort items
  filtered.sort((a, b) => {
    const stampA = `${a.item.date ?? ""} ${a.item.time ?? ""}`;
    const stampB = `${b.item.date ?? ""} ${b.item.time ?? ""}`;
    return filters.sort === "desc" ? stampB.localeCompare(stampA) : stampA.localeCompare(stampB);
  });
  return filtered;
}

// What the add box needs from the list it sits under. Every one of these is a
// closure in `buildLogList`, and they are handed over rather than duplicated
// because there must be exactly one write path — see `persist`, and 4.27, which
// is what a second one cost.
//
// `file` IS A FUNCTION PAIR, not a value. A logbook's note may not exist yet,
// and the first item added is what creates it, so the box both reads the field
// and assigns it. Passing the `TFile` would hand over a copy of the answer at
// build time, which is `null` in exactly the case this matters in.
interface LogAddIO {
  items: () => LogItem[];
  file: () => TFile | null;
  setFile: (f: TFile) => void;
  persist: () => void;
  render: () => void;
  refresh: () => Promise<void>;
  watch: (target: TFile) => void;
}

// The box at the foot of the list: which type, when it happened, and the text.
//
// EXTRACTED FROM `buildLogList` IN 5.2 alongside `buildLogDeck` — the deck asks
// questions of the items and this is the one control that adds one, so between
// them they are everything on the widget that is not the list itself.
//
// DRAWN LAST AND ONLY WHERE THERE IS SOMEWHERE TO PUT AN ITEM. `opts.add` is
// what says there is; a read-only list of somebody else's log has no box.
function buildLogAddBox(
  wrap: HTMLElement,
  opts: LogListOptions,
  add: NonNullable<LogListOptions["add"]>,
  io: LogAddIO
): void {
  const row = wrap.createDiv({ cls: "ca-journal-capture-add" });
  const box = row.createDiv({ cls: "ca-journal-capture-add-box" });
  const controls = box.createDiv({ cls: "ca-journal-capture-add-controls" });

  let chosenType = opts.types && opts.types.length > 0 ? opts.types[0].id : undefined;
  if (opts.types && opts.types.length > 1) {
    const typeSelect = controls.createEl("select", { cls: "ca-jcl-add-type-select" });
    for (const t of opts.types) {
      const opt = typeSelect.createEl("option", { value: t.id, text: `${t.icon ? t.icon + " " : ""}${t.label}` });
      if (t.id === chosenType) opt.selected = true;
    }
    typeSelect.addEventListener("change", () => {
      chosenType = typeSelect.value;
    });
  }

  let chosen: WhenValue | null = null;
  let when: HTMLElement | null = null;

  const reveal = controls.createEl("button", {
    cls: "ca-journal-capture-when-btn",
    attr: { type: "button", "aria-label": "Say when this happened", title: "Say when this happened" },
  });
  setIcon(reveal, "clock");
  const revealLabel = reveal.createSpan({ cls: "ca-journal-capture-when-label", text: "Now" });

  reveal.addEventListener("click", () => {
    if (when) {
      when.remove();
      when = null;
      chosen = null;
      reveal.removeClass("is-active");
      revealLabel.setText("Now");
      return;
    }
    const now = add.stamp();
    chosen = { date: now.date, time: now.time, mins: now.mins };
    when = whenEditor(row, chosen, opts.dated, (v) => {
      chosen = v;
      const parts: string[] = [];
      if (v.time) parts.push(v.time);
      else if (v.date) parts.push(v.date);
      revealLabel.setText(parts.join(" ") || "Custom");
    });
    reveal.addClass("is-active");
  });

  const resetWhen = (): void => {
    if (!when) return;
    when.remove();
    when = null;
    chosen = null;
    reveal.removeClass("is-active");
    revealLabel.setText("Now");
  };

  const input = box.createEl("textarea", {
    cls: "ca-journal-capture-add-input",
    attr: { placeholder: add.placeholder, rows: "1" },
  });

  const commit = (): void => {
    const text = input.value;
    if (!text.trim()) return;
    input.value = "";
    const stamp = chosen ?? add.stamp();
    const newItem: LogItem = {
      date: stamp.date,
      time: stamp.time,
      text,
      done: null,
      mins: stamp.mins ?? null,
    };

    if (opts.onAddMulti && chosenType) {
      void opts.onAddMulti(chosenType, newItem).then(async () => {
        resetWhen();
        if (opts.itemsProvider) {
          await io.refresh();
        } else {
          io.items().push(newItem);
          io.render();
        }
      });
      return;
    }

    // APPENDED TO THE LIST IN HAND AND WRITTEN THROUGH `persist`, so the one
    // write path — and the one merge — is the one every other control here
    // uses. A direct `appendToNoteRegion` would be a second writer racing the
    // first, which is the shape of the bug 4.27 closed.
    io.items().push(newItem);
    resetWhen();
    if (io.file()) {
      io.persist();
      io.render();
      return;
    }
    // NO NOTE YET. This is the one place a logbook's note is created, and it
    // is the first item that creates it — never a render, on the rule
    // `captureDestinations` states in its own words: "a reader who opens the
    // box, reads the options and presses Escape has not asked for five
    // notes."
    const make = opts.createNote;
    if (!make) return;
    void make().then((made) => {
      if (!made) return;
      io.setFile(made);
      io.persist();
      io.render();
      io.watch(made);
    });
  };
  input.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter" && !evt.shiftKey) {
      evt.preventDefault();
      commit();
    }
  });
  input.addEventListener("blur", commit);
}

export function buildLogList(
  host: NoteRegionHost,
  opts: LogListOptions
): HTMLElement {
  const { key } = opts;
  const wrap = createDiv({
    cls: `ca-journal-capture-log ca-journal-note ${opts.modifier}`,
  });

  // ── THE HEAD IS THE FRAME'S (5.14) ───────────────────────────────────
  //
  // What was here: a private copy of the `note:` collapse bar — chevron on the
  // left, micro-label, its own click handler — plus a second branch drawing a
  // bare label for a list that was labelled but not collapsible. Both are
  // `fieldHead`'s cases now, and the second one no longer exists: a labelled
  // field folds.
  //
  // THE STORE IS PASSED IN rather than derived, because this widget's fold has
  // always been the CALLER's: `captureCollapsedByDefault` is read by
  // `noteFoldState` through the capture widget's own `startCollapsed`, and a
  // logbook's is a no-op. Handing the frame those two functions keeps every
  // caller's answer exactly where it was.
  const chrome = fieldHead({
    wrap,
    key,
    label: opts.label,
    titled: opts.titled,
    barActions: opts.barActions,
    store: {
      isCollapsed: (): boolean => opts.startCollapsed(),
      setCollapsed: (_k: string, v: boolean): void => opts.onFold(v),
    },
  });

  const filters: LogFilters = {
    search: "",
    type: opts.activeType ?? "all",
    status: "all",
    sort: "desc",
  };
  const pillCountMap = buildLogDeck(
    chrome.body,
    opts,
    filters,
    () => render(),
    (on) => scrollContainer.toggleClass("is-compact", on)
  );

  // ── CONTAINED SCROLL VIEWPORT ─────────────────────────────────────────
  const scrollContainer = chrome.body.createDiv({
    cls: "ca-journal-capture-scroll",
  });
  const list = scrollContainer.createDiv({ cls: "ca-journal-capture-list" });

  // ── FOOTER STATUS ─────────────────────────────────────────────────────
  const footer = chrome.body.createDiv({ cls: "ca-journal-logbook-footer" });
  const footerCount = footer.createSpan({ cls: "ca-jcl-footer-count" });
  footer.createSpan({ cls: "ca-jcl-footer-cap", text: "Scrollable viewport" });

  let file = opts.file;
  let items: LogItem[] = [];
  // The region text this list was parsed from — see `writeRegionOf`.
  let baseline = "";
  // Which card is open for editing, by index. Nothing is re-rendered under an
  // open editor, and an arriving item waits rather than closing it.
  let editing: number | null = null;

  const persist = (): void => {
    if (!file) return;
    const next = serializeLogItems(items);
    void host.writeRegionOf(file, key, next, baseline);
    // The write may merge an append on top of `next`, so the baseline is only
    // safely advanced by the re-read the modify event brings. Advancing it to
    // `next` here would claim we had absorbed something we have not seen.
  };

  const render = (): void => {
    list.empty();

    // Compute dynamic counts per type
    if (pillCountMap.size > 0) {
      const allCountEl = pillCountMap.get("all");
      if (allCountEl) allCountEl.setText(String(items.length));
      if (opts.types && opts.getItemType) {
        for (const t of opts.types) {
          const cEl = pillCountMap.get(t.id);
          if (cEl) {
            const count = items.filter((item) => opts.getItemType!(item) === t.id).length;
            cEl.setText(String(count));
          }
        }
      }
    }

    if (items.length === 0) {
      list.createDiv({ cls: "ca-journal-capture-empty", text: opts.emptyText });
      footerCount.setText("0 items");
      return;
    }

    // WHAT IS SHOWN, worked out in `filterLogItems` (5.2); what follows is
    // what that is drawn as.
    const filtered = filterLogItems(items, filters, opts);

    footerCount.setText(`Showing ${filtered.length} of ${items.length} items`);

    if (filtered.length === 0) {
      list.createDiv({
        cls: "ca-journal-capture-empty",
        text: "No log items match the current filter.",
      });
      return;
    }

    filtered.forEach(({ item, originalIndex }) => {
      const typeTag = opts.getItemTypeTag ? opts.getItemTypeTag(item) : undefined;
      renderLogItemCard(
        list,
        item,
        originalIndex === editing,
        opts.dated,
        filters.search,
        typeTag,
        {
          onWhen: (value) => {
            // WRITTEN ON EVERY FIELD CHANGE, not on a Save button. Every other
            // control on this card commits as it is used — the checkbox, the
            // delete — and a stamp editor that needed confirming would be the one
            // thing here a reader could lose work in by clicking away.
            const prev = { ...item };
            item.date = opts.dated ? value.date : null;
            item.time = value.time;
            item.mins = value.mins;
            if (opts.onItemUpdate) {
              void opts.onItemUpdate(item, prev);
            }
            persist();
          },
          onWhenCancel: () => render(),
          onToggle: () => {
            // A date rather than a flag, so a crossed-off item says when.
            const prev = { ...item };
            item.done = item.done ? null : today();
            if (opts.onItemUpdate) {
              void opts.onItemUpdate(item, prev);
            }
            persist();
            render();
          },
          onEdit: () => {
            editing = originalIndex;
            render();
          },
          onCommit: (text) => {
            editing = null;
            if (text.trim() !== item.text.trim()) {
              const prev = { ...item };
              item.text = text;
              if (opts.onItemUpdate) {
                void opts.onItemUpdate(item, prev);
              }
              persist();
            }
            render();
          },
          onDelete: () => {
            // NO CONFIRMATION, which is the task widget's call and not obviously
            // right for a typed thought. It is the same call because an undo the
            // reader has is better than a dialog they learn to click through:
            // Obsidian's own file history holds the note, and an item deleted by
            // accident is one Ctrl+Z away in source view.
            const [removed] = items.splice(originalIndex, 1);
            editing = null;
            if (opts.onItemDelete && removed) {
              void opts.onItemDelete(removed);
            }
            persist();
            render();
          },
        }
      );
    });
  };

  const refresh = async (): Promise<void> => {
    if (opts.itemsProvider) {
      items = await opts.itemsProvider();
      render();
    }
  };

  const load = (text: string): void => {
    baseline = readNoteRegion(text, key);
    items = parseLogItems(baseline);
    render();
  };

  const watch = (target: TFile): void => {
    host.app.vault.read(target).then(
      (text) => {
        load(text);
        void host.ensureNoteRegion(target, key);
      },
      () => render()
    );
  };

  if (opts.add) {
    buildLogAddBox(chrome.body, opts, opts.add, {
      items: () => items,
      file: () => file,
      setFile: (f) => {
        file = f;
      },
      persist,
      render,
      refresh,
      watch,
    });
  }

  const watchPaths: string[] = [
    ...(opts.watchPaths ?? []),
    ...(opts.watchPath ? [opts.watchPath] : []),
    ...(file ? [file.path] : []),
  ];

  if (opts.itemsProvider) {
    void refresh();
    if (watchPaths.length > 0) {
      opts.addChild(
        new LogListWatcher(host.app, wrap, watchPaths, () => {
          void refresh();
        })
      );
    }
  } else {
    if (file) {
      watch(file);
    } else {
      render();
    }

    if (watchPaths.length > 0) {
      opts.addChild(
        new LogListWatcher(host.app, wrap, watchPaths, () => {
          // Mid-edit, the reader's card wins — the same rule the textarea used,
          // for the same reason. The next commit re-renders from disk anyway, and
          // the write carries a baseline so the arriving item is not lost.
          if (editing != null) return;
          const target =
            file ??
            (watchPaths[0]
              ? (host.app.vault.getAbstractFileByPath(watchPaths[0]) as TFile | null)
              : null);
          if (!target) {
            if (items.length > 0) {
              items = [];
              baseline = "";
              render();
            }
            return;
          }
          file = target;
          void host.app.vault.read(target).then((text) => {
            const onDisk = readNoteRegion(text, key);
            if (onDisk === baseline && items.length > 0) return;
            load(text);
          });
        })
      );
    }
  }

  return wrap;
}

// One item.
function renderLogItemCard(
  list: HTMLElement,
  item: LogItem,
  isEditing: boolean,
  dated: boolean,
  searchQuery: string,
  typeTag: { label: string; icon?: string; color?: string } | undefined,
  cb: {
    onToggle: () => void;
    onEdit: () => void;
    onCommit: (text: string) => void;
    onDelete: () => void;
    onWhen: (value: WhenValue) => void;
    onWhenCancel: () => void;
  }
): void {
  const card = list.createDiv({
    cls: `ca-journal-capture-card${item.done ? " is-done" : ""}`,
  });
  if (typeTag?.color) {
    card.style.borderLeftColor = typeTag.color;
  }

  const head = card.createDiv({ cls: "ca-journal-capture-head" });

  if (typeTag) {
    const tagEl = head.createSpan({ cls: "ca-journal-capture-type-tag" });
    if (typeTag.icon) tagEl.createSpan({ cls: "ca-jcl-tag-icon", text: `${typeTag.icon} ` });
    tagEl.createSpan({ cls: "ca-jcl-tag-label", text: typeTag.label });
  }

  // An item with no stamp is one somebody typed into the region by hand. It is
  // still theirs and still gets a card; it just has nothing to say about when.
  // Drawing an empty slot keeps the bodies aligned down the column.
  //
  // THE DATE IS READ OFF THE ITEM, NOT PASSED IN. A capture has none because
  // its note is a day; a logbook item has one because its note is not. Asking
  // the item is what lets one card draw both without being told which it is.
  const stamp = [item.date, item.time].filter((part) => !!part).join(" ");
  // THE STAMP IS A BUTTON NOW (4.55), where it was dead text for three
  // releases. It is the only way to correct an item logged late — and the only
  // way to give a length to the months of items a work log already holds, which
  // is what the time grid needs to draw them as anything but a moment.
  const clock = head.createEl("button", {
    cls: `ca-journal-capture-time${stamp ? "" : " is-empty"}`,
    text: stamp || "no time",
    attr: {
      type: "button",
      "aria-label": "Change when this happened",
      ...(item.done ? { title: `Crossed off ${item.done}` } : {}),
    },
  });
  if (item.mins) {
    head.createSpan({
      cls: "ca-journal-capture-mins",
      text: `${item.mins} min`,
    });
  }
  clock.addEventListener("click", () => {
    const existing = card.querySelector(".ca-journal-capture-when");
    if (existing) {
      existing.remove();
      cb.onWhenCancel();
      return;
    }
    whenEditor(
      card,
      { date: item.date, time: item.time, mins: item.mins },
      dated,
      cb.onWhen
    );
  });

  const actions = head.createDiv({ cls: "ca-journal-capture-actions" });
  const button = (icon: string, aria: string, on: () => void): void => {
    const b = actions.createEl("button", {
      cls: "ca-journal-capture-btn",
      attr: { "aria-label": aria, type: "button" },
    });
    setIcon(b, icon);
    b.addEventListener("click", on);
  };
  button(
    item.done ? "rotate-ccw" : "check",
    item.done ? "Bring this back" : "Cross this off",
    cb.onToggle
  );
  if (!isEditing) button("pencil", "Edit this item", cb.onEdit);
  button("x", "Delete this item", cb.onDelete);

  if (!isEditing) {
    // Text, not markdown. The region is plain text by contract — see the
    // `note:` field this replaces — and rendering it would make an item
    // beginning with `#` into a heading inside a card.
    const textEl = card.createDiv({ cls: "ca-journal-capture-text" });
    formatLogText(textEl, item.text, searchQuery);
    return;
  }

  const area = card.createEl("textarea", { cls: "ca-journal-capture-edit" });
  area.value = item.text;
  area.rows = Math.max(1, item.text.split("\n").length);
  // Cmd/Ctrl+Enter commits and plain Enter is a newline, which is the capture
  // box's own binding — a capture is written in one place and edited in
  // another, and the two must not disagree about what Enter does. Escape
  // abandons the edit.
  area.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter" && (evt.metaKey || evt.ctrlKey)) {
      evt.preventDefault();
      cb.onCommit(area.value);
    } else if (evt.key === "Escape") {
      evt.preventDefault();
      cb.onCommit(item.text);
    }
  });
  area.addEventListener("blur", () => cb.onCommit(area.value));
  window.setTimeout(() => {
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  }, 0);
}
