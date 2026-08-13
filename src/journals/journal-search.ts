// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// ── The `journal-search` widget ───────────────────────────────────────────
//
// Full-text search over journal notes, answering the question the study
// journal could not previously answer at all: *"what did I write about
// closures?"*
//
// Everything else in the journal half of this plugin finds notes by
// *structure* — a folder-filtered `base` table, a topics rollup, a review
// queue. All of those need you to already know where the thing is. The diary
// has had the other half since 2.16 (`diary-index.ts`): body text, typed
// filters, ranked results. This is that surface, pointed at the journals.
//
// WHY IT COMES AFTER PAGES. Splitting a lesson across five pages makes it
// *less* findable, not more: one large note is greppable in one place, five
// pages are five places with no index over them. Item 1 of the roadmap traded
// a navigation problem for a worse one, and this is the payment.
//
// One index, not a second one. The scanner, the cache and the whole pure
// query layer are diary-index.ts's; only the spec differs (see IndexSpec
// there). A second scanner is exactly the drift that module exists to prevent.

import { MarkdownPostProcessorContext, setIcon } from "obsidian";
import type AlmanacPlugin from "../main";
import {
  IndexedEntry,
  SearchHit,
  isEmptyQuery,
  parseQuery,
  readJournalIndex,
  searchEntries,
} from "../diary/diary-index";
import { journalFolderScope, registeredJournalTypes } from "./journal";
import { emptyCallout } from "../ui/tables";
import { moment, noExt, openFile } from "../core/util";

// The `is:` values this surface accepts. Registry-derived rather than a
// literal, so a Cooking journal's `is:recipe` works with no code change — and
// so an unrecognised `is:` still falls through to being a search term, which
// is the rule the diary's parse already follows.
export function journalKinds(plugin: AlmanacPlugin): string[] {
  const out = new Set<string>();
  for (const type of registeredJournalTypes(plugin)) {
    for (const kind of type.kinds) {
      out.add(kind.id);
      // Pages are not a kind — that is the load-bearing decision from item 1 —
      // but they are a note you can search for, and `is:page` is the natural
      // way to ask. Filtering is display, and display is the one thing pages
      // are allowed to appear in.
      if (kind.pages) out.add(kind.pages.id);
    }
    for (const level of type.levels) out.add(level.noun.toLowerCase());
  }
  return [...out];
}

function resultRow(
  plugin: AlmanacPlugin,
  entry: IndexedEntry,
  sourcePath: string,
  hit: { snippet: string; snippetKey: string | null }
): HTMLElement {
  const row = createDiv({ cls: "jjs-row" });

  const main = row.createDiv({ cls: "jjs-main" });
  const title = main.createEl("a", {
    cls: "internal-link jjs-title",
    text: entry.title,
    href: noExt(entry.file.path),
  });
  title.addEventListener("click", (evt) => {
    evt.preventDefault();
    void openFile(plugin.app, entry.file);
  });
  title.addEventListener("mouseover", (evt) => {
    plugin.app.workspace.trigger("hover-link", {
      event: evt,
      source: "almanac-journal-search",
      hoverParent: row,
      targetEl: title,
      linktext: entry.file.path,
      sourcePath,
    });
  });

  // Where it lives, which is the thing a journal result needs and a diary
  // result doesn't — the diary's date already locates it. A page's trail names
  // the lesson it belongs to, so a hit on page three of a long lesson says
  // which lesson without being opened.
  if (entry.crumbs.length) {
    main.createDiv({ cls: "jjs-crumbs", text: entry.crumbs.join(" › ") });
  }

  if (hit.snippet) {
    const line = main.createDiv({ cls: "jjs-snippet" });
    if (hit.snippetKey) {
      line.createSpan({ cls: "jjs-snippet-key", text: hit.snippetKey });
    }
    line.createSpan({ text: hit.snippet });
  }

  // Facts, each omitted when it has nothing to say rather than shown as a zero.
  const facts = main.createDiv({ cls: "jjs-facts" });
  if (entry.kind) {
    facts.createSpan({ cls: "jjs-fact jjs-fact-kind", text: entry.kind });
  }
  if (entry.iso) {
    facts.createSpan({
      cls: "jjs-fact",
      text: moment(entry.iso).format("D MMM YYYY"),
    });
  }
  if (entry.openTasks > 0) {
    const f = facts.createSpan({ cls: "jjs-fact" });
    setIcon(f.createSpan({ cls: "jjs-fact-icon" }), "square");
    f.createSpan({ text: String(entry.openTasks) });
  }
  if (entry.attachments > 0) {
    const f = facts.createSpan({ cls: "jjs-fact" });
    setIcon(f.createSpan({ cls: "jjs-fact-icon" }), "paperclip");
    f.createSpan({ text: String(entry.attachments) });
  }
  for (const tag of entry.tags.slice(0, 3)) {
    facts.createSpan({ cls: "jjs-fact jjs-fact-tag", text: tag });
  }

  return row;
}

export function buildJournalSearch(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext,
  arg: string,
  hostFolder: string | null
): HTMLElement {
  const root = createDiv({ cls: "journal-table jjs-search" });
  const folders = journalFolderScope(plugin, arg, hostFolder);

  const bar = root.createDiv({ cls: "jjs-bar" });
  setIcon(bar.createDiv({ cls: "jjs-icon" }), "search");
  const input = bar.createEl("input", {
    cls: "jjs-input",
    attr: {
      type: "text",
      placeholder: "Search your notes…",
      spellcheck: "false",
    },
  });
  const clear = bar.createEl("button", {
    cls: "journal-btn-ghost jjs-clear",
    attr: { type: "button", "aria-label": "Clear search" },
  });
  setIcon(clear.createSpan({ cls: "journal-btn-icon" }), "x");
  clear.hide();

  const kinds = journalKinds(plugin);
  root.createDiv({
    cls: "jjs-hint",
    text: `Filters: from:30d · tag:algebra · is:${kinds[0] ?? "lesson"} · has:task · confidence<=2`,
  });

  const status = root.createDiv({ cls: "jjs-status" });
  const results = root.createDiv({ cls: "jjs-results" });

  let notes: IndexedEntry[] | null = null;
  let pending = "";

  const render = (): void => {
    results.empty();
    status.empty();
    if (folders.length === 0) {
      status.setText("No journal folders in scope.");
      return;
    }
    if (notes == null) {
      status.setText("Reading your notes…");
      return;
    }
    const q = parseQuery(pending, kinds);
    if (isEmptyQuery(q)) {
      status.setText(
        `${notes.length} ${notes.length === 1 ? "note" : "notes"} indexed — type to search.`
      );
      return;
    }
    const hits: SearchHit[] = searchEntries(notes, q);
    if (hits.length === 0) {
      results.appendChild(
        emptyCallout(
          "search-x",
          "No matches",
          "Nothing here matches that. Try fewer words, or widen the scope."
        )
      );
      return;
    }
    status.setText(`${hits.length} ${hits.length === 1 ? "match" : "matches"}`);
    for (const hit of hits) {
      results.appendChild(
        resultRow(plugin, hit.entry, ctx.sourcePath, {
          snippet: hit.snippet,
          snippetKey: hit.snippetKey,
        })
      );
    }
  };

  // Debounced so typing doesn't re-score the whole index on every keystroke.
  // The read already happened; this only guards the scoring pass.
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
  void readJournalIndex(plugin, folders).then((list) => {
    notes = list;
    render();
  });

  return root;
}
