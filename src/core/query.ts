// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// A small read-only layer over the metadata cache for the native table
// widgets (tables.ts). *Not* a query language — just typed helpers on top
// of the vault/cache primitives already in util.ts, giving the table
// widgets roughly the same read surface `dataviewjs` had (`dv.pages`,
// `file.tags`) without the plugin dependency.

import { App, TFile } from "obsidian";
import { filesUnder, frontmatterOf } from "./util";

export interface PageInfo {
  file: TFile;
  fm: Record<string, unknown>;
}

// All markdown files under `folder` (recursive), each paired with its
// frontmatter — mirrors `dv.pages('"folder"')` without a query language.
// `where` filters on frontmatter/file, same shape as Dataview's
// `.where(p => ...)`. Task counts used to ride along here (via taskCounts),
// but that read the listItems cache, which only sees Obsidian's `- [ ]` and
// never Almanac's `- ( )` marker — so it always reported 0 and no caller uses
// it anymore. Counting now happens from note bodies where it's asked for
// (tables.ts::sumBodyTasks / countBodyTasks), so the field is gone.
export function pagesUnder(
  app: App,
  folder: string,
  where?: (fm: Record<string, unknown>, file: TFile) => boolean
): PageInfo[] {
  const pages = filesUnder(app, folder).map((file) => ({
    file,
    fm: frontmatterOf(app, file),
  }));
  return where ? pages.filter((p) => where(p.fm, p.file)) : pages;
}

// Inline (#cache tags) + frontmatter `tags` property, merged — matches
// Dataview's `file.tags` semantics: leading `#` kept, nested `#a/b` kept,
// duplicates between the two sources collapsed.
export function tagsOf(app: App, file: TFile): string[] {
  const cache = app.metadataCache.getFileCache(file);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const t of cache?.tags ?? []) {
    if (seen.has(t.tag)) continue;
    seen.add(t.tag);
    out.push(t.tag);
  }

  const fmTags = cache?.frontmatter?.["tags"];
  const raw: unknown[] = Array.isArray(fmTags)
    ? fmTags
    : fmTags != null && fmTags !== ""
    ? [fmTags]
    : [];
  for (const v of raw) {
    const tag = String(v).trim();
    if (!tag) continue;
    const withHash = tag.startsWith("#") ? tag : `#${tag}`;
    if (seen.has(withHash)) continue;
    seen.add(withHash);
    out.push(withHash);
  }
  return out;
}

// "Today" | "Yesterday" | "Nd ago" (<7d) | "Nw ago" (<30d) | "Nmo ago" —
// lifted verbatim (same buckets, same thresholds) from the old dataviewjs
// `fmtActivity`/`daysAgo` helpers so the native tables read identically.
export function relativeActivity(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((today.getTime() - then.getTime()) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// Millis to break ties when sorting "most recent first": a `created`
// frontmatter value (the plugin writes one on every lesson/practice note)
// falls back to the file's own ctime. Mirrors the old dataviewjs
// `recency()` helper (which preferred Dataview's `created` over
// `file.ctime`).
export function recencyMs(fm: Record<string, unknown>, file: TFile): number {
  const created = fm["created"];
  if (created != null && created !== "") {
    const t = Date.parse(String(created));
    if (!Number.isNaN(t)) return t;
  }
  return file.stat.ctime;
}
