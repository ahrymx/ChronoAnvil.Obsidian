// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The Tags tracker's model.
//
// WHY A TRACKER AND NOT A DIRECTIVE. An Obsidian tag is only a tag where
// Obsidian's parser can see it, and it cannot see inside a fenced code block.
// Almanac puts almost everything a reader touches inside ````almanac` — that
// is what a section IS here — so `#reading` typed into a section is a string,
// not a tag: no autocomplete, no tag pane, no search, no `tag-index` row. The
// workaround the vault wants is the one Obsidian itself offers, which is the
// frontmatter `tags` property, and the thing that already knows how to read
// and write a frontmatter property from inside a fence is a tracker.
//
// So this is a tracker whose value happens to be a LIST, and everything below
// is the arithmetic of that list, kept away from the DOM for
// `computeFoldHidden`'s reason: what a tag IS, and what adding one to a note
// does, are rules that can be asserted rather than eyeballed on an entry.

import type { App, TFile } from "obsidian";
import { pagesUnder, tagsOf } from "../core/query";

// The frontmatter property this tracker writes.
//
// `tags` and not `Tags` or `almanac-tags`, because the whole point is that
// Obsidian reads it: the tag pane, the search index, `tag:` queries and this
// plugin's own `tag-index` all key off the one property Obsidian defines. A
// tracker's id is normally the reader's to rename (see `TrackerDef.id`); this
// one is locked with the rest of the built-in's fields for the same reason
// `confidence` and `status` are — the name is load-bearing outside the
// registry.
export const TAGS_PROPERTY = "tags";

// Everything a tag may not contain, and the shape of what it may.
//
// Obsidian's own rule: letters, digits, underscore, hyphen and forward slash
// (nesting), and a tag may not be all digits. Spaces are the interesting case
// because they are what a reader will type — "deep work" — so they are
// converted rather than refused: a dialogue that rejects the thing you typed
// and does not say what it wanted is worse than one that shows you what it
// will write.
const TAG_OK = /^[\p{L}\p{N}_/-]+$/u;

// A raw string as the tag it would become, or null if it could not become one.
//
// Total, and deliberately forgiving in the two ways a reader is: a leading `#`
// is stripped (they typed what they see in a note) and internal whitespace
// becomes a hyphen (they typed English). Everything else that survives is
// their business — including case, which Obsidian preserves and matches
// case-insensitively, so `Reading` and `reading` are one tag wearing two
// spellings and normalising them here would silently rewrite the reader's.
export function normaliseTag(raw: string): string | null {
  const trimmed = raw.trim().replace(/^#+/, "").trim();
  if (trimmed === "") return null;
  const dashed = trimmed.replace(/\s+/g, "-").replace(/\/{2,}/g, "/");
  const cleaned = dashed.replace(/^\/+|\/+$/g, "");
  if (cleaned === "") return null;
  if (!TAG_OK.test(cleaned)) return null;
  // Obsidian refuses an all-numeric tag: `#2026` is a number in running text
  // and the parser will not claim it. A nested one is fine as long as some
  // segment is not — `#year/2026` is a tag.
  if (/^[\p{N}/]+$/u.test(cleaned)) return null;
  return cleaned;
}

// The tags a note's frontmatter carries, in the order it carries them.
//
// THREE SHAPES ARRIVE HERE AND ALL THREE ARE VALID YAML for the same property,
// which is why this exists rather than a cast. Obsidian writes a list; a
// reader who edited the property by hand may have written one string; a reader
// coming from another tool may have written a comma-separated one. Any of them
// is what that note MEANS, so all three are read and only the list is written.
export function readTags(value: unknown): string[] {
  const raw: string[] = Array.isArray(value)
    ? // Strings only, and `null` is why. YAML's `tags:` with a blank item
      // parses to a null entry, and `String(null)` is the word "null" — which
      // normalises to a perfectly legal tag and would have appeared in the
      // window as one the reader never wrote.
      value.filter((v): v is string => typeof v === "string")
    : typeof value === "string"
      ? value.split(",")
      : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const tag = normaliseTag(item);
    // A tag already in the note that this function cannot parse is DROPPED
    // from the model and not from the note: nothing here writes, and the
    // callers that do write only ever write what a reader chose in the dialog.
    if (tag == null) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

// Case-insensitive membership, because Obsidian's tags are.
export function hasTag(tags: readonly string[], tag: string): boolean {
  const key = tag.toLowerCase();
  return tags.some((t) => t.toLowerCase() === key);
}

// The three edits, as pure list functions.
//
// Each returns a NEW list and each is idempotent in the direction it moves:
// adding a tag twice adds it once, removing an absent one is a no-op. That is
// what lets the dialogue apply a batch of edits without tracking which of them
// were already true.
export function addTag(tags: readonly string[], tag: string): string[] {
  const clean = normaliseTag(tag);
  if (clean == null || hasTag(tags, clean)) return [...tags];
  return [...tags, clean];
}

export function removeTag(tags: readonly string[], tag: string): string[] {
  const key = tag.toLowerCase();
  return tags.filter((t) => t.toLowerCase() !== key);
}

// Rename in place, keeping the tag's POSITION in the list.
//
// Position rather than append, because the list is the reader's ordering and a
// rename is not a removal followed by an addition — a tag that was second
// should still be second, or the dialogue reshuffles the note every time
// somebody fixes a typo. Renaming onto a tag the note already carries merges
// the two rather than producing a duplicate.
export function renameTag(
  tags: readonly string[],
  from: string,
  to: string
): string[] {
  const clean = normaliseTag(to);
  if (clean == null) return [...tags];
  const at = tags.findIndex((t) => t.toLowerCase() === from.toLowerCase());
  if (at === -1) return addTag(tags, clean);
  const out: string[] = [];
  const seen = new Set<string>();
  tags.forEach((t, i) => {
    const next = i === at ? clean : t;
    const key = next.toLowerCase();
    if (seen.has(key)) return; // the merge case: renaming onto a tag it has
    seen.add(key);
    out.push(next);
  });
  return out;
}

// What gets written back to the property, or null to delete the key.
//
// NULL WHEN EMPTY, and that is the difference between a note with no tags and
// a note with an empty list. `tags: []` is YAML noise that Obsidian's property
// editor then offers to fill in forever; a note that never had tags should
// look, after adding one and removing it again, exactly as it did before.
export function tagsValue(tags: readonly string[]): string[] | null {
  return tags.length === 0 ? null : [...tags];
}

// ── the directory survey ──────────────────────────────────────────────────

export interface TagUse {
  tag: string;
  count: number;
}

// Every tag in use beneath `folder`, most-used first.
//
// DIRECTORY-BASED, WHICH IS THE POINT. A vault-wide list is Obsidian's tag
// pane and this window is not trying to be one: the useful list when tagging a
// diary entry is the tags the rest of the diary already uses, because that is
// what makes the twentieth entry agree with the first about whether it is
// `#deep-work` or `#deepwork`. Same rule, same reason and same scope shape as
// `tag-index` (3.14) — this is the list, and that is the table.
//
// Reads through the metadata cache, so it sees inline tags as well as
// frontmatter ones: a folder whose notes were tagged before this tracker
// existed still offers what it already uses.
export function tagsInFolder(app: App, folder: string): TagUse[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const { file } of pagesUnder(app, folder)) {
    for (const raw of tagsOf(app, file)) {
      const tag = normaliseTag(raw);
      if (tag == null) continue;
      const key = tag.toLowerCase();
      const hit = counts.get(key);
      if (hit) hit.count += 1;
      else counts.set(key, { tag, count: 1 });
    }
  }
  return Array.from(counts.values()).sort(
    (a, b) => b.count - a.count || a.tag.localeCompare(b.tag)
  );
}

// The folder a note's suggestions come from: its own.
//
// The host note's parent, which is the same default `tag-index`, `tasks-table`,
// `review-queue` and `journal-search` all resolve to with no argument. A daily
// entry offers the diary's tags, a Lesson offers its topic's. Nothing here
// takes an argument to override it, because the widget is a tracker cell and a
// tracker directive is `tracker:<id>` — see the roadmap note in
// `buildTagsField` about what would have to change for it to.
export function suggestionFolderFor(file: TFile): string {
  return file.parent?.path ?? "";
}
