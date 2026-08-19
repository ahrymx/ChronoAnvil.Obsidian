// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The vault's read surface: one indexed view of every note worth searching,
// shared by `diary-search`, `on-this-day`, `timeline` and `journal-search`.
//
// Two surfaces, one index. As of 2.33 this reads journal notes as well as diary
// entries, and the temptation was to write a second indexer for them — they
// have a different date property, a different notion of "kind", and no mood.
// That is exactly the split this module exists to avoid: the whole reason it is
// one file is that two scanners drift, the way util.ts::taskCounts and
// countAlmanacTasks did in 2.10. So the differences are named once, in an
// IndexSpec, and everything downstream — matching, scoring, snippets, the
// cache, the query grammar — is surface-agnostic.
//
// Why one module rather than a scanner per widget. The three retrieval widgets
// all want the same thing — "give me the entries in this date range, with their
// facts" — and the vault read behind that is the expensive part (every entry's
// body, not just its frontmatter, since Almanac's content lives in
// `<!--almanac:key-->` regions the metadata cache never sees). Two independent
// scanners would drift the way util.ts::taskCounts and countAlmanacTasks did in
// 2.10, where two answers to "how many open tasks" disagreed and one was
// silently always zero. So: one index, one query surface, three views.
//
// Caching follows the tasks-table pattern (tables.ts) deliberately — keyed by
// path, invalidated on mtime *or* size, in-memory only. Nothing persists to
// data.json: mtime is the source of truth, so there is no stale-cache problem
// to reconcile against sync or an external edit, and a changed file is always
// re-read. The cost is a cold scan at first paint, which is bounded
// (mapWithLimit) and, for a five-year vault of ~1,800 entries, paid once.
//
// The pure half of this file — matching, scoring, filtering, snippets, parsing
// a query string — takes plain data and no App, so it's unit-testable without a
// vault. Only `indexEntry` / `readIndex` touch Obsidian.

import { App, TFile } from "obsidian";
import type AlmanacPlugin from "../main";
import { allNoteRegions } from "../core/notestore";
import { parseTasks } from "../ui/tasks";
import { mapWithLimit } from "../ui/tables";
import { tagsOf } from "../core/query";
import { filesUnder, folderPrefix, frontmatterOf, isoDate, moment } from "../core/util";
import { journalAncestors, journalTypeOfNote } from "../journals/journal";
import { TITLE_PROP } from "./entryheader";
import { ENTRY_EVENTS_PROPERTY, JOURNAL_DATE_PROPERTY } from "../core/constants";
import { CLASS_DEFS, TRACKER_CLASSES } from "../trackers/trackers";
import type { TrackerClass } from "../trackers/trackers";

// ── model ─────────────────────────────────────────────────────────────

export type IndexSurface = "diary" | "journal";

// One note, flattened to what every retrieval view needs. `text` is the
// searchable body — every region's content joined — and `regions` keeps them
// separate so a snippet can say which field it came from.
export interface IndexedEntry {
  path: string;
  file: TFile;
  // The note's own date, or null when it hasn't got one.
  //
  // Nullable since 2.33, and the nullability is the point rather than a
  // loosening. A diary entry always carries `journal-date`, and the diary
  // indexer still skips anything that doesn't. A journal note may or may not:
  // the roadmap's standing rule is that index notes hold state and leaf notes
  // hold series, so a Subject or Topic index deliberately has no date — and
  // neither does a *page*, which is the note type item 1 created and item 4
  // exists to make findable. Requiring a date here would have excluded exactly
  // the notes this feature was built for.
  iso: string | null;
  surface: IndexSurface;
  // What kind of note this is within its surface: "daily" / "monthly" for the
  // diary, and the frontmatter `type` value ("lesson", "practice", "page",
  // "topic") for a journal note. A string rather than a union because the
  // journal half is registry-defined — a custom journal's kinds are whatever
  // the user named them.
  kind: string;
  title: string;
  mood: number | null;
  trackers: Record<string, unknown>;
  tags: string[];
  events: string[];
  text: string;
  regions: { key: string; content: string }[];
  openTasks: number;
  doneTasks: number;
  attachments: number;
  // Journal context: the registered type id the note belongs to, and its
  // ancestor folder names outermost-first (Subject, Topic, and the lesson too
  // when the note is a page). Null and empty for a diary entry — a result row
  // uses them to say *where* a hit lives, which matters far more in a journal
  // than in the diary, where the date already says it.
  typeId: string | null;
  crumbs: string[];
}

// What differs between the two surfaces, named once so nothing downstream has
// to ask which it is looking at.
export interface IndexSpec {
  surface: IndexSurface;
  // The frontmatter key holding the note's date. The diary writes
  // `journal-date`; journal notes write `date`.
  dateKey: string;
  // Whether a note with no date is skipped entirely. True for the diary, where
  // an undated file under the entry folders is a folder note or a dashboard
  // and not an entry at all. False for journals, where undated is a legitimate
  // and common shape.
  requireDate: boolean;
  // The mood built-in's property, for the diary's result rows. Empty elsewhere.
  moodKey: string;
  typeId?: string | null;
  crumbs?: string[];
}

// A parsed query: free text plus whatever filters were pulled out of it.
export interface DiaryQuery {
  terms: string[];
  from: string | null;
  to: string | null;
  tag: string | null;
  // Matched against IndexedEntry.kind, so `is:daily` on the diary and
  // `is:lesson` on a journal are one filter, not two.
  kind: string | null;
  has: ("attachment" | "task" | "event")[];
  // Numeric tracker comparison, e.g. `mood<=2`.
  compare: { key: string; op: "<" | "<=" | ">" | ">=" | "="; value: number } | null;
}

export interface SearchHit {
  entry: IndexedEntry;
  score: number;
  snippet: string;
  snippetKey: string | null;
}

// ── query parsing ─────────────────────────────────────────────────────

// Filters are `key:value` tokens mixed into the search box, so one input
// serves both. Quoted phrases survive as single terms. Anything unrecognised
// stays a search term rather than erroring — a diary search that rejects your
// query because you typed a colon is worse than one that searches for it.
const FILTER_RE = /^(from|to|tag|is|has):(.+)$/i;
const COMPARE_RE = /^([A-Za-z][A-Za-z0-9_-]*)(<=|>=|<|>|=)(-?\d+(?:\.\d+)?)$/;

// What `has:` accepts. NAMED SO THE HINT CAN READ IT — see `searchHintLine`
// below. The switch arm and the line teaching a reader what to type are the
// same fact, and a value added to one and not the other is a filter nobody
// discovers or a hint that promises one the parser rejects.
export const HAS_VALUES = ["attachment", "task", "event"] as const;
export type HasValue = (typeof HAS_VALUES)[number];
const isHasValue = (v: string): v is HasValue =>
  (HAS_VALUES as readonly string[]).includes(v);

// `knownKinds` is what `is:` will accept, and it is a parameter because the
// valid set is surface-dependent: the diary has exactly two, a journal has
// whatever its type declares plus its pages. Passing it keeps the actual rule
// intact on both surfaces — an *unrecognised* filter stays a search term,
// because a search box that rejects your query for a stray colon is worse than
// one that searches for it. Hardcoding daily/monthly here would have made
// `is:lesson` a literal string search on a journal.
// The hint line under a search box, built from the grammar directly above it.
//
// DERIVED, NOT WRITTEN OUT — 4.25 §4. Both hints were literals and both had
// gone wrong in the way a literal does. The diary's froze `to:2026-03`, a month
// that stopped being an example of "up to recently" the moment it arrived and
// would have read as stale in every vault from then on. The journal's offered
// no `to:` at all, so the two surfaces taught two different syntaxes for this
// one parser — the same defect as two names for one section, in prose.
//
// The example month is read off the clock and the `has:` value off
// `HAS_VALUES`, so neither can age and neither can drift from what the switch
// above actually accepts. What stays a parameter is what is genuinely
// surface-dependent, and it is the same set `parseQuery` already takes as one:
// the kind, because `is:` is validated against `knownKinds`, and the tag and
// tracker, because a diary has moods and health tags where a Study journal has
// confidence and topic tags. An example a reader cannot use on the page they
// are reading it on teaches them the filter does not work.
export function searchHintLine(opts: {
  kind: string;
  tag: string;
  tracker: string;
  now?: string;
}): string {
  return [
    "Filters: from:30d",
    `to:${opts.now ?? moment().format("YYYY-MM")}`,
    `tag:${opts.tag}`,
    `is:${opts.kind}`,
    `has:${HAS_VALUES[0]}`,
    `${opts.tracker}<=2`,
  ].join(" · ");
}

export function parseQuery(
  raw: string,
  knownKinds: readonly string[] = ["daily", "monthly"]
): DiaryQuery {
  const q: DiaryQuery = {
    terms: [],
    from: null,
    to: null,
    tag: null,
    kind: null,
    has: [],
    compare: null,
  };
  for (const token of tokenize(raw)) {
    const filter = FILTER_RE.exec(token);
    if (filter) {
      const [, key, value] = filter;
      const v = value.trim();
      switch (key.toLowerCase()) {
        case "from": {
          const iso = relativeOrIso(v);
          if (iso) q.from = iso;
          else q.terms.push(token);
          continue;
        }
        case "to": {
          const iso = relativeOrIso(v);
          if (iso) q.to = iso;
          else q.terms.push(token);
          continue;
        }
        case "tag":
          q.tag = v.startsWith("#") ? v : `#${v}`;
          continue;
        case "is":
          if (knownKinds.some((k) => k.toLowerCase() === v.toLowerCase())) {
            q.kind = v.toLowerCase();
          } else q.terms.push(token);
          continue;
        case "has":
          if (isHasValue(v)) q.has.push(v);
          else q.terms.push(token);
          continue;
      }
    }
    const cmp = COMPARE_RE.exec(token);
    if (cmp) {
      q.compare = {
        key: cmp[1],
        op: cmp[2] as DiaryQuery["compare"] extends null ? never : "<" | "<=" | ">" | ">=" | "=",
        value: Number(cmp[3]),
      };
      continue;
    }
    q.terms.push(token.toLowerCase());
  }
  return q;
}

// Split on whitespace, keeping "quoted phrases" together as one term.
export function tokenize(raw: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const value = m[1] != null ? m[1] : m[2];
    if (value.trim()) out.push(value);
  }
  return out;
}

// `from:2024-01-01`, `from:2024-01`, `from:2024`, or a relative window like
// `from:30d` / `from:6m` / `from:1y`. Relative forms count back from today,
// which is what someone actually means by "the last month" in a search box.
export function relativeOrIso(value: string, todayIso?: string): string | null {
  const v = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  if (/^\d{4}-\d{2}$/.test(v)) return `${v}-01`;
  if (/^\d{4}$/.test(v)) return `${v}-01-01`;
  const rel = /^(\d+)\s*([dwmy])$/i.exec(v);
  if (rel) {
    const n = Number(rel[1]);
    const unit = rel[2].toLowerCase();
    const units: Record<string, string> = { d: "days", w: "weeks", m: "months", y: "years" };
    const base = todayIso ? moment(todayIso) : moment();
    return base.subtract(n, units[unit]).format("YYYY-MM-DD");
  }
  return null;
}

// ── matching + scoring (pure) ─────────────────────────────────────────

// Does an entry pass the non-text filters? Split out from scoring because
// filters are absolute (fail = excluded) while terms are graded.
export function passesFilters(entry: IndexedEntry, q: DiaryQuery): boolean {
  // A dateless note fails any date filter rather than passing it. You asked
  // for a window; a note that isn't in one isn't in this one. (It is still
  // findable by text — only the date filter excludes it.)
  if (q.from && (entry.iso == null || entry.iso < q.from)) return false;
  if (q.to && (entry.iso == null || entry.iso > q.to)) return false;
  if (q.kind && entry.kind.toLowerCase() !== q.kind.toLowerCase()) return false;
  if (q.tag && !entry.tags.some((t) => t.toLowerCase() === q.tag!.toLowerCase()))
    return false;
  for (const h of q.has) {
    if (h === "attachment" && entry.attachments === 0) return false;
    if (h === "task" && entry.openTasks + entry.doneTasks === 0) return false;
    if (h === "event" && entry.events.length === 0) return false;
  }
  if (q.compare) {
    const raw = entry.trackers[q.compare.key];
    const num = raw != null && raw !== "" ? Number(raw) : NaN;
    if (!Number.isFinite(num)) return false;
    const { op, value } = q.compare;
    if (op === "<" && !(num < value)) return false;
    if (op === "<=" && !(num <= value)) return false;
    if (op === ">" && !(num > value)) return false;
    if (op === ">=" && !(num >= value)) return false;
    if (op === "=" && num !== value) return false;
  }
  return true;
}

// Score an entry against the search terms. Every term must appear somewhere
// (AND, not OR — a diary search for "dentist appointment" that returns every
// mention of "appointment" is noise), but *where* it appears grades the hit:
// a title match outranks a body match, and a whole-word match outranks a
// substring, so searching "run" puts "went for a run" above "running late"
// without excluding it.
//
// Returns -1 for "does not match", so callers can filter on a single test.
export function scoreEntry(entry: IndexedEntry, terms: string[]): number {
  if (terms.length === 0) return 0;
  const title = entry.title.toLowerCase();
  const body = entry.text.toLowerCase();
  let score = 0;
  for (const term of terms) {
    const t = term.toLowerCase();
    const inTitle = title.includes(t);
    const inBody = body.includes(t);
    if (!inTitle && !inBody) return -1;
    if (inTitle) score += 10;
    if (inBody) score += 3;
    if (wholeWord(body, t) || wholeWord(title, t)) score += 4;
  }
  return score;
}

function wholeWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\W)${escaped}(\\W|$)`).test(haystack);
}

// A short window of body text around the first matching term, for the result
// row. Prefers the region that actually contains the match so the caller can
// label it ("log", "highlights") rather than showing a decontextualised
// fragment. Ellipses only where text was actually cut.
export function buildSnippet(
  entry: IndexedEntry,
  terms: string[],
  width = 160
): { snippet: string; key: string | null } {
  const flat = (s: string) => s.replace(/\s+/g, " ").trim();
  if (terms.length === 0) {
    for (const r of entry.regions) {
      const content = flat(r.content);
      if (content) return { snippet: clip(content, width), key: r.key };
    }
    return { snippet: "", key: null };
  }
  for (const term of terms) {
    const t = term.toLowerCase();
    for (const r of entry.regions) {
      const content = flat(r.content);
      const at = content.toLowerCase().indexOf(t);
      if (at === -1) continue;
      const start = Math.max(0, at - Math.floor(width / 3));
      const end = Math.min(content.length, start + width);
      let out = content.slice(start, end);
      if (start > 0) out = `…${out}`;
      if (end < content.length) out = `${out}…`;
      return { snippet: out, key: r.key };
    }
  }
  for (const r of entry.regions) {
    const content = flat(r.content);
    if (content) return { snippet: clip(content, width), key: r.key };
  }
  return { snippet: "", key: null };
}

function clip(s: string, width: number): string {
  return s.length <= width ? s : `${s.slice(0, width)}…`;
}

// Newest first, with dateless notes last. They are not "old" — they have no
// position on the axis at all — and sorting them to the top on the strength of
// an empty string would put every Topic index above every lesson.
export function byDateDesc(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a < b ? 1 : -1;
}

// The whole query, applied. Sorted by score then recency, so an exact match
// wins but equally-good matches read newest-first like the rest of the diary.
export function searchEntries(
  entries: IndexedEntry[],
  q: DiaryQuery,
  limit = 100
): SearchHit[] {
  const hits: SearchHit[] = [];
  for (const entry of entries) {
    if (!passesFilters(entry, q)) continue;
    const score = scoreEntry(entry, q.terms);
    if (score < 0) continue;
    const { snippet, key } = buildSnippet(entry, q.terms);
    hits.push({ entry, score, snippet, snippetKey: key });
  }
  hits.sort((a, b) => b.score - a.score || byDateDesc(a.entry.iso, b.entry.iso));
  return hits.slice(0, limit);
}

// True when a query would do nothing — used to show the idle state rather than
// listing the entire vault as "results".
export function isEmptyQuery(q: DiaryQuery): boolean {
  return (
    q.terms.length === 0 &&
    !q.from &&
    !q.to &&
    !q.tag &&
    !q.kind &&
    !q.compare &&
    q.has.length === 0
  );
}

// ── on this day (pure) ────────────────────────────────────────────────

export interface AnniversaryGroup {
  yearsAgo: number;
  entries: IndexedEntry[];
}

// Entries sharing today's month-and-day in earlier years, grouped by how long
// ago. Years with nothing are omitted entirely rather than rendered blank — an
// empty row is a reminder that you weren't journalling then, which is not
// information anyone opened the diary to receive.
//
// Feb 29 is matched literally: on a non-leap year there is no Feb 29 to be
// "on", so the widget simply shows nothing rather than guessing at Feb 28 or
// Mar 1. Deliberate — a wrong anniversary is worse than no anniversary.
export function anniversaries(
  entries: IndexedEntry[],
  todayIso: string,
  maxYears = 25
): AnniversaryGroup[] {
  const monthDay = todayIso.slice(5);
  const thisYear = Number(todayIso.slice(0, 4));
  const byYear = new Map<number, IndexedEntry[]>();
  for (const e of entries) {
    if (e.kind !== "daily" || e.iso == null) continue;
    if (e.iso.slice(5) !== monthDay) continue;
    const year = Number(e.iso.slice(0, 4));
    const ago = thisYear - year;
    if (ago <= 0 || ago > maxYears) continue;
    const arr = byYear.get(ago) ?? [];
    arr.push(e);
    byYear.set(ago, arr);
  }
  return Array.from(byYear.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([yearsAgo, list]) => ({ yearsAgo, entries: list }));
}

// ── timeline grouping (pure) ──────────────────────────────────────────

export interface TimelineGroup {
  month: string; // YYYY-MM
  entries: IndexedEntry[];
}

// Reverse-chronological, grouped by month. The timeline is a reading view, so
// it groups by the unit people actually recall in ("March") rather than
// paginating by a fixed row count that would cut a month in half.
export function groupByMonth(entries: IndexedEntry[]): TimelineGroup[] {
  const byMonth = new Map<string, IndexedEntry[]>();
  for (const e of entries) {
    if (e.iso == null) continue;
    const month = e.iso.slice(0, 7);
    const arr = byMonth.get(month) ?? [];
    arr.push(e);
    byMonth.set(month, arr);
  }
  return Array.from(byMonth.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([month, list]) => ({
      month,
      entries: list.sort((a, b) => byDateDesc(a.iso, b.iso)),
    }));
}

// ── vault-facing index ────────────────────────────────────────────────

interface IndexCacheEntry {
  mtime: number;
  size: number;
  entry: IndexedEntry;
}

// Module-level, so every retrieval widget and every repaint share one index.
const indexCache = new Map<string, IndexCacheEntry>();

// Test-only: drop the cache so cases don't leak into each other.
export function __clearIndexCache(): void {
  indexCache.clear();
}

function cacheKey(surface: IndexSurface, path: string): string {
  return `${surface}\u0000${path}`;
}

// Count attachment items in a region's content. Attachments are stored as
// plain markdown (`![[path]]`, `[[note]]`, `[title](url)`) — see attachments.ts
// — so counting is a line scan rather than a parse.
function countAttachments(content: string): number {
  let n = 0;
  for (const line of content.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (/^!?\[\[.+\]\]$/.test(t) || /^\[.*\]\(.+\)$/.test(t)) n++;
  }
  return n;
}

// The diary's spec, as a named constant rather than a literal at the call
// site: the daily/monthly pair is the historical shape and every test in
// diary-index.test.ts pins it, so it is worth being able to point at.
export const DIARY_SPEC: IndexSpec = {
  surface: "diary",
  dateKey: "journal-date",
  requireDate: true,
  moodKey: "",
};

// Parse one entry from its frontmatter + body text. Pure given both, so the
// shape of an indexed entry is testable without a vault.
//
// The diary-shaped wrapper, kept because it is what the diary's tests are
// written against and because "index a diary entry" is a real, named
// operation, not just buildIndexed with arguments.
export function buildEntry(
  file: TFile,
  fm: Record<string, unknown>,
  text: string,
  tags: string[],
  moodKey: string
): IndexedEntry | null {
  return buildIndexed(file, fm, text, tags, { ...DIARY_SPEC, moodKey });
}

// Which grain a diary entry belongs to, read off its own `journal` property
// against the class table rather than against a literal.
//
// Defaults to "daily" for the same reason `entryContext` does: an entry with no
// `journal:` line is overwhelmingly a hand-made daily note, and calling it one
// is the charitable reading. What changed in 3.8 is that the default is now
// reached only when nothing matches, instead of on four grains out of five.
export function diaryKindOf(fm: Record<string, unknown>): string {
  const journal = String(fm["journal"] ?? "").trim();
  if (journal) {
    for (const grain of TRACKER_CLASSES) {
      if (journal === CLASS_DEFS[grain].journalProperty) return grain;
    }
  }
  return "daily";
}

// A period entry's date, when the spec's own key does not find one.
//
// THE REASON THREE GRAINS WERE INVISIBLE TO THE INDEX ENTIRELY, rather than
// merely mislabelled. `DIARY_SPEC.dateKey` is `journal-date` and `requireDate`
// is true; a weekly entry's template writes `week-start:` and no
// `journal-date:` at all, so `buildIndexed` returned null and the note was
// never indexed. Diary search could not find it, the timeline did not list it,
// and a bridge could not have pulled it however the catalogue was written.
//
// The fallback rather than a change to `dateKey`, because `journal-date` is
// still the daily entry's own property and a monthly entry carries BOTH (see
// the frontmatter note in entry-sections.ts). Reading the grain's property
// second preserves every date the index already resolved and adds the three it
// did not.
function diaryFallbackIso(
  fm: Record<string, unknown>,
  spec: IndexSpec
): string | null {
  if (spec.surface !== "diary") return null;
  const grain = diaryKindOf(fm);
  const def = CLASS_DEFS[grain as TrackerClass];
  if (!def) return null;
  return isoDate(fm[def.dateProperty]);
}

// The general form. Everything surface-specific arrives in `spec`; everything
// below it is the same work for a diary entry and a lesson alike.
export function buildIndexed(
  file: TFile,
  fm: Record<string, unknown>,
  text: string,
  tags: string[],
  spec: IndexSpec
): IndexedEntry | null {
  const iso = isoDate(fm[spec.dateKey]) ?? diaryFallbackIso(fm, spec);
  // Undated is fatal for a diary entry (a folder note or a dashboard sitting
  // in the entry folders) and ordinary for a journal note (an index note, or a
  // page). See the note on IndexedEntry.iso.
  if (!iso && spec.requireDate) return null;

  const regions = allNoteRegions(text);
  let openTasks = 0;
  let doneTasks = 0;
  let attachments = 0;
  const textParts: string[] = [];
  for (const r of regions) {
    const tasks = parseTasks(r.content);
    if (tasks.length) {
      for (const t of tasks) {
        if (t.done) doneTasks++;
        else openTasks++;
        textParts.push(t.text);
      }
      continue;
    }
    attachments += countAttachments(r.content);
    textParts.push(r.content);
  }

  const rawMood = spec.moodKey ? fm[spec.moodKey] : undefined;
  const moodNum = rawMood != null && rawMood !== "" ? Number(rawMood) : NaN;

  const rawEvents = fm[ENTRY_EVENTS_PROPERTY];
  const events = Array.isArray(rawEvents)
    ? rawEvents.map((e) => String(e))
    : rawEvents != null && rawEvents !== ""
    ? [String(rawEvents)]
    : [];

  const rawTitle = fm[TITLE_PROP];
  const title =
    rawTitle != null && String(rawTitle).trim() !== ""
      ? String(rawTitle).trim()
      : file.basename;

  // A journal note names its own kind in frontmatter; a diary entry is told
  // apart by the `journal` property its template carries.
  //
  // ONE WALK, FIVE GRAINS, as of 3.8 patch 1. This was a ternary — `"monthly"`
  // when `journal` said "Monthly Entry", else `"daily"` — and everything
  // downstream inherited the else: a weekly, quarterly or yearly entry was
  // indexed as a DAILY one, so `is:weekly` matched nothing and every consumer
  // that filters `kind === "daily"` counted three grains of period note as
  // days. The grains have existed since 2.57.12; this ternary predates them.
  const kind =
    spec.surface === "journal"
      ? String(fm["type"] ?? "note")
      : diaryKindOf(fm);

  return {
    path: file.path,
    file,
    iso,
    surface: spec.surface,
    kind,
    title,
    mood: Number.isFinite(moodNum) ? moodNum : null,
    trackers: fm,
    tags,
    events,
    text: textParts.join("\n"),
    regions,
    openTasks,
    doneTasks,
    attachments,
    typeId: spec.typeId ?? null,
    crumbs: spec.crumbs ?? [],
  };
}

// Index one file, using the cache when it hasn't changed since the last read.
// A hit costs two integer comparisons and no disk read.
export async function indexEntry(
  app: App,
  file: TFile,
  spec: IndexSpec
): Promise<IndexedEntry | null> {
  // Keyed by surface as well as path. One file can in principle be read by
  // both indexers — the paths are user-configurable and nothing stops a diary
  // folder being pointed inside the journals root, which the docs already warn
  // about — and the two would produce different records for it. A path-only
  // key would hand whichever ran second the other one's answer.
  const key = cacheKey(spec.surface, file.path);
  const cached = indexCache.get(key);
  if (cached && cached.mtime === file.stat.mtime && cached.size === file.stat.size) {
    return cached.entry;
  }
  // cachedRead, not read: nothing here writes, so a slightly stale read that
  // the metadataCache change event will correct is fine (same reasoning as
  // sumAlmanacTasks in tables.ts).
  const text = await app.vault.cachedRead(file);
  const entry = buildIndexed(
    file,
    frontmatterOf(app, file),
    text,
    tagsOf(app, file),
    spec
  );
  if (entry) {
    indexCache.set(key, {
      mtime: file.stat.mtime,
      size: file.stat.size,
      entry,
    });
  }
  return entry;
}

// The whole diary, indexed. Reads both entry folders (daily and monthly), so
// a search covers a monthly review as well as the days it summarises.
//
// Cache sweeping is scoped to the diary folders only, matching readOpenTasks:
// an entry for a file outside them belongs to nothing here and can't be swept
// on our behalf, and sweeping against a subset would evict live entries.
export async function readIndex(plugin: AlmanacPlugin): Promise<IndexedEntry[]> {
  const paths = plugin.settings.paths;
  // FIVE FOLDERS, NOT TWO, as of 3.8 patch 1. This read `[diaryDaily,
  // diaryMonthly]`, so a weekly, quarterly or yearly entry was not in the diary
  // index at all — not found by search, not listed by the timeline, not
  // reachable by a bridge. The three grains arrived in 2.57.12 and this list
  // was written before them.
  //
  // Deduped because a vault may point two grains at one folder, and the set is
  // built from the class table so a sixth grain needs no edit here.
  //
  // THIS WIDENS WHAT EVERY CONSUMER SEES, which is why it is worth stating
  // rather than doing quietly. It is safe because the counting consumers
  // already filter by kind — `year-stats` and `entry-rollup` take
  // `kind === "daily"`, `quarter-stats` takes `"monthly"` — so a period entry
  // arrives as a row they were already written to skip. What genuinely changes
  // is search and the timeline, which now find the three grains of entry a
  // reader can create and could not previously look up. That is the fix, not a
  // side effect of it.
  const folders = Array.from(
    new Set(TRACKER_CLASSES.map((g) => paths[CLASS_DEFS[g].folderKey]).filter(Boolean))
  );
  return readFolders(plugin, folders, () => ({
    ...DIARY_SPEC,
    moodKey: plugin.settings.moodTrackerId,
  }));
}

// Every journal note under `folders`, indexed. The counterpart of readIndex,
// and deliberately the same function underneath: one scanner, one cache, one
// sweep rule, two specs.
//
// Unlike the diary this takes its folders from the caller, because a journal
// search is normally scoped — to a subject, to a topic, or to everything —
// and the widget already resolves that through the same journalFolderScope
// the review queue uses.
//
// The spec is resolved per file rather than once, because the journal type and
// the crumbs are properties of *where the note sits*: a vault with a Study
// journal and a Cooking one indexes both in one pass, and each note needs its
// own type's ancestry.
export async function readJournalIndex(
  plugin: AlmanacPlugin,
  folders: string[]
): Promise<IndexedEntry[]> {
  return readFolders(plugin, folders, (file) => {
    const type = journalTypeOfNote(plugin, file.path);
    return {
      surface: "journal",
      dateKey: JOURNAL_DATE_PROPERTY,
      requireDate: false,
      moodKey: "",
      typeId: type?.id ?? null,
      crumbs: type ? journalAncestors(type, file.path).map((a) => a.name) : [],
    };
  });
}

// The shared scan. Collects the files under a set of folders, indexes them
// with a bounded concurrency, sweeps cache entries for files that have gone,
// and returns them newest-first.
//
// Sweeping is scoped to the folders just read, matching readOpenTasks: an
// entry for a file outside them belongs to nothing here and can't be swept on
// our behalf, and sweeping against a subset would evict live entries. With two
// surfaces sharing the cache that rule has to hold per surface too, which is
// what keying by surface buys — a journal read can no longer evict a diary
// entry that happens to sit under a folder it scanned.
async function readFolders(
  plugin: AlmanacPlugin,
  folders: string[],
  specFor: (file: TFile) => IndexSpec
): Promise<IndexedEntry[]> {
  const app = plugin.app;
  const files: TFile[] = [];
  const seen = new Set<string>();
  for (const folder of folders) {
    for (const f of filesUnder(app, folder)) {
      if (seen.has(f.path)) continue;
      seen.add(f.path);
      files.push(f);
    }
  }

  const results = await mapWithLimit(files, 12, (f) => indexEntry(app, f, specFor(f)));

  const surfaces = new Set(files.map((f) => specFor(f).surface));
  for (const key of indexCache.keys()) {
    const nul = key.indexOf("\u0000");
    if (nul === -1) continue;
    const surface = key.slice(0, nul) as IndexSurface;
    const path = key.slice(nul + 1);
    if (!surfaces.has(surface)) continue;
    // `folderPrefix`, so the sweep asks the same question the read above asked
    // (4.44.0). `folder + "/"` is `"//"` at the vault root — a scope the reader
    // can now name — and a cache entry the read no longer covers would have
    // been kept forever rather than dropped.
    const inScope = folders.some((folder) => path.startsWith(folderPrefix(folder)));
    if (inScope && !seen.has(path)) indexCache.delete(key);
  }

  return results
    .filter((e): e is IndexedEntry => e != null)
    .sort((a, b) => byDateDesc(a.iso, b.iso));
}
