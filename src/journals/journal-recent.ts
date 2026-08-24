// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// `journal-recent[:<scope>[|N]]` — what you wrote lately, newest first. 4.70.
//
// ── THE QUESTION THE JOURNALS COULD NOT ANSWER ───────────────────────────
//
// The diary has `timeline`: a page can say "here is what has been written,
// most recent first" and a reader lands on it. The journals have no
// equivalent, and every widget they do have answers a question about
// STRUCTURE — `level-cards` is what is below this note, `kind-table` is the
// notes of one kind, `review-queue` is what is DUE (an empty queue is the good
// outcome), `journal-search` needs a word typed into it first.
//
// So a per-journal dashboard opened cold said nothing about the last thing the
// reader did. That is what this is, and it is why the per-journal dashboards
// were the thinnest pages in the vault.
//
// ── IT LISTS PAGES, WHICH ALMOST NOTHING ELSE DOES ───────────────────────
//
// `JournalPages`' note states the rule this departs from: a page's `type` is
// deliberately not one of a journal's `kinds`, so everything that filters by
// kinds excludes pages by construction — never reviewed, never averaged, never
// listed as a lesson — and "only code that means to display pages has to know
// they exist".
//
// This means to. A page is a thing the reader WROTE, which is the only
// question being asked here; excluding it would leave an afternoon's work off
// the list of what was worked on that afternoon.
//
// CONTAINERS ARE STILL EXCLUDED, for the reason `leafNotes` gives: an index
// note holds a current value rather than being a piece of writing, and it is
// touched by the plugin itself every time a note is added underneath it.

import { MarkdownPostProcessorContext, setIcon } from "obsidian";
import type AlmanacPlugin from "../main";
import { emptyCallout } from "../ui/empty";
import { PageInfo, pagesUnder, recencyMs, relativeActivity } from "../core/query";
import { openFile } from "../core/util";
import { SCOPE_ALL } from "../core/directive-grammar";
import {
  journalFolderScope,
  journalTypeOfNote,
  pageTypeIds,
  ratingTrackerFor,
  registeredJournalTypes,
} from "./journal";

// How many rows a bare directive draws.
//
// EIGHT, WHICH IS WHAT FITS BESIDE SOMETHING ELSE. This is composed into a row
// group on both pages that ship it, so the height that matters is the height of
// a column and not of a page. `review-queue` beside it draws what is due, which
// on a kept-up journal is nothing and on a neglected one is everything; eight
// is the number that lets the pair sit level in the common case.
export const DEFAULT_RECENT = 8;

export interface RecentRow {
  path: string;
  title: string;
  // Where it lives, as the reader would say it: the journal's name and the
  // container the note sits in. Empty when the note is in neither, which is a
  // hand-placed note rather than a broken one.
  where: string[];
  // The note's own `date`, for the "3d ago" line. Null where the kind declares
  // none — a page has no date of its own — and the row then says nothing rather
  // than printing the file's timestamp as though the reader had dated it.
  iso: string | null;
  // The rating this kind is graded into, where it declares one and the note
  // carries a number for it.
  rating: number | null;
  // What the list is SORTED by, which is not the same as what it shows. See
  // `rankRecent`.
  ms: number;
}

// The notes this scope has, ranked.
//
// ── WHY THE SORT KEY AND THE DISPLAYED DATE ARE DIFFERENT FIELDS ─────────
//
// `date` is what the note is ABOUT and `created` is when it was written, and
// on a journal those come apart constantly: a lesson dated last Tuesday may be
// written up on Friday. "What did I write lately" is the second question, so
// `recencyMs` — `created` falling back to the file's own ctime, the pair
// `topics-table` already sorts on — is the rank.
//
// The ROW still shows `date`, because that is the fact the note asserts about
// itself and the one a reader can check. A row ordered by one date and
// labelled with another is only confusing if it claims the label is the order,
// so it does not: the label is relative ("3d ago") and sits beside the
// container, where `timeline` puts the same thing.
//
// Pure over `PageInfo`, so the ordering is testable without a vault.
export function rankRecent(
  rows: readonly RecentRow[],
  limit: number
): RecentRow[] {
  return [...rows]
    .sort((a, b) => b.ms - a.ms || a.path.localeCompare(b.path))
    .slice(0, Math.max(1, limit));
}

// The count after the separator, or the default. `time-grid`'s compound
// argument, with the same separator and the same permissiveness: a second piece
// that is not a positive number is a piece this widget cannot act on, and
// falling back is better than refusing a directive whose first half is fine.
export function recentLimit(rest: string): number {
  const n = Number(rest.split("|")[1]?.trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_RECENT;
}

export function recentRows(
  plugin: AlmanacPlugin,
  folders: readonly string[]
): RecentRow[] {
  const types = registeredJournalTypes(plugin);
  const pages = pageTypeIds(plugin);
  const kinds = new Set(types.flatMap((t) => t.kinds.map((k) => k.id)));

  const seen = new Set<string>();
  const out: RecentRow[] = [];
  for (const folder of folders) {
    for (const p of pagesUnder(plugin.app, folder)) {
      if (seen.has(p.file.path)) continue;
      seen.add(p.file.path);
      const kindId = typeof p.fm["type"] === "string" ? p.fm["type"] : null;
      if (!kindId || !(kinds.has(kindId) || pages.has(kindId))) continue;
      out.push(rowFor(plugin, p, kindId));
    }
  }
  return out;
}

function rowFor(
  plugin: AlmanacPlugin,
  p: PageInfo,
  kindId: string
): RecentRow {
  const type = journalTypeOfNote(plugin, p.file.path);
  const parent = p.file.parent?.name;
  const where: string[] = [];
  if (type) where.push(type.name);
  // THE CONTAINER, NOT THE WHOLE PATH. `review-queue` shows one folder name for
  // the same reason: a Topic's name is what tells a reader which lesson this
  // is, and the four segments above it are what they already know.
  if (parent && parent !== type?.root.split("/").pop()) where.push(parent);

  const ratingId = ratingTrackerFor(type, kindId);
  const rating = ratingId == null ? NaN : Number(p.fm[ratingId]);
  const date = p.fm["date"];

  return {
    path: p.file.path,
    title: p.file.basename,
    where,
    iso: typeof date === "string" && date ? date.slice(0, 10) : null,
    rating: Number.isFinite(rating) ? rating : null,
    ms: recencyMs(p.fm, p.file),
  };
}

export function buildJournalRecent(
  plugin: AlmanacPlugin,
  rest: string,
  ctx: MarkdownPostProcessorContext,
  hostFolder: string | null
): HTMLElement {
  const root = createDiv({ cls: "journal-table journal-recent" });
  const arg = rest.split("|")[0].trim();
  const folders = journalFolderScope(plugin, arg, hostFolder);

  if (folders.length === 0) {
    root.appendChild(
      emptyCallout(
        "clock",
        "Nothing in scope",
        arg === SCOPE_ALL
          ? "No journals yet — what you write will show up here once you have one."
          : "This points at no folder the vault has."
      )
    );
    return root;
  }

  const rows = rankRecent(recentRows(plugin, folders), recentLimit(rest));
  if (rows.length === 0) {
    root.appendChild(
      emptyCallout(
        "clock",
        "Nothing written here yet",
        "The notes you write under this journal appear here, newest first."
      )
    );
    return root;
  }

  for (const row of rows) drawRow(root, plugin, row, ctx.sourcePath);
  return root;
}

function drawRow(
  root: HTMLElement,
  plugin: AlmanacPlugin,
  row: RecentRow,
  sourcePath: string
): void {
  const app = plugin.app;
  const el = root.createDiv({ cls: "jrn-row" });
  const file = app.vault.getFileByPath(row.path);

  const link = el.createEl("a", {
    cls: "internal-link jrn-title",
    text: row.title,
    href: row.path,
    attr: { "data-href": row.path },
  });
  link.addEventListener("click", (evt) => {
    evt.preventDefault();
    if (file) void openFile(app, file);
  });
  link.addEventListener("mouseover", (evt) => {
    app.workspace.trigger("hover-link", {
      event: evt,
      source: "almanac-journal-recent",
      hoverParent: el,
      targetEl: link,
      linktext: row.path,
      sourcePath,
    });
  });

  // Each fact omitted when it has nothing to say rather than drawn as a dash —
  // `journal-search`'s rule for the same kind of line, and the reason a page
  // (no date, no rating) still reads as a complete row.
  const meta = el.createDiv({ cls: "jrn-meta" });
  for (const bit of row.where) {
    meta.createSpan({ cls: "jrn-fact jrn-where", text: bit });
  }
  if (row.iso) {
    meta.createSpan({ cls: "jrn-fact", text: relativeActivity(row.iso) });
  }
  if (row.rating != null) {
    const f = meta.createSpan({ cls: "jrn-fact" });
    setIcon(f.createSpan({ cls: "jrn-fact-icon" }), "star");
    f.createSpan({ text: `${row.rating}/5` });
  }
}
