// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Fill a scaffolded vault with example content. 4.43.
//
//   node tools/seed-vault.mjs ../obsidian-dev-vault
//   node tools/seed-vault.mjs <vault> --today 2026-08-18 --months 13 --force
//
// ── WHAT THIS IS FOR ─────────────────────────────────────────────────────
//
// The vault a stranger downloads to find out what ChronoAnvil is. Every widget in
// the plugin renders somebody's notes, and on an empty vault every one of them
// renders its empty state — which is an honest picture of nothing and a useless
// picture of the plugin. This writes the notes.
//
// A REPO TOOL AND NOT A PLUGIN COMMAND, on the maintainer's call. It ships
// nothing to readers, it can be re-run after every release so the published
// example never lags the build, and it is allowed to be opinionated about
// content in a way a general-purpose command could not be.
//
// ── IT DERIVES, IT DOES NOT RESTATE ──────────────────────────────────────
//
// **Nothing about the vault's shape is written down here.** Paths come from the
// plugin's own `data.json`; each journal's levels, kinds and template filenames
// come from that same file; note bodies come from the vault's templates. So a
// preset that gains a level, a template that gains a section, or a reader who
// renamed `02 - Diary` are all handled by reading rather than by editing this.
//
// The one thing that IS written down is the prose, in `seed-corpus.mjs`, and
// that is the whole point of it.
//
// ── DETERMINISTIC, WITH ONE HONEST EXCEPTION ─────────────────────────────
//
// Same seed, same vault — the generator is a seeded PRNG and nothing consults
// the clock except the end of the date window. `--today` pins that too, which is
// what makes a screenshot reproducible; left off, the history ends today so the
// example looks current rather than abandoned. Both behaviours are wanted, and
// the flag is the seam between them.
//
// ── IT REFUSES TO OVERWRITE ──────────────────────────────────────────────
//
// A vault is somebody's notes. Every write goes through `claim`, which declines
// a path that already exists unless `--force` is given, and the run reports what
// it skipped. A seeded vault re-seeded is therefore a no-op, not a silent
// double-write — which matters because the natural way to use this is to run it
// again after a release.
//
// ── AND, SINCE 4.62, IT FILLS WHAT IS EMPTY ──────────────────────────────
//
// Two passes, not one. Files first — every note that does not exist yet — then
// PATCHES: in-place edits to notes the SCAFFOLD owns. Charts, logbooks and
// events all live in notes the plugin itself created, so a create-only tool
// skipped every one of them and produced a vault with a year of tracker
// readings and not a single chart drawn from them.
//
// A patch fills a chart fence that holds no charts, a logbook region that holds
// no items, a `chronoanvil-events: []` that holds no events — and declines any of
// them that is already answered, which is the same rule as above with the same
// `--force` escape. See `buildPatches` for why each refusal is where it is.
//
// ── AND, SINCE 4.83, IT GENERATES A YEAR RATHER THAN A YEAR OF DICE ──────
//
// Three things were wrong with what came out, and all three were invisible from
// inside the run — it reported "273 written, 0 warnings" every time.
//
// **THE TASKS NEVER ENDED.** Every task was open with probability 0.45 on every
// entry of every one of thirteen months, so a seeded vault held about two
// hundred open ones and `tasks-table` — a folder-scoped rollup of every open
// task under a folder — opened the diary dashboard onto a wall of a hundred and
// thirty items from last autumn. Tasks are now AGED: past the window (a month,
// `--task-window`) a task is done, full stop, and inside it the odds of still
// being open rise the nearer it is to today. Some of them carry a due date and
// an hour, which is the only form the time grid can draw.
//
// **THE NUMBERS DID NOT AGREE WITH EACH OTHER.** Four independent draws about
// one night: a mood, a wake time, a bedtime, and a `Sleep` value that was none
// of the other three. `Sleep` is DERIVED — the plugin recomputes it from the two
// times whenever either is written — so the vault held a figure its own reader
// could not reproduce, and the diary's "Does sleep move mood?" chart drew a
// shapeless cloud on the one surface built to show a relationship. There is now
// one `dayModel` per day and every tracker is read off it.
//
// **AND HALF THE CHART SURFACES WERE NEVER FILLED.** Energy and Focus are
// declared, chartable, and `showInTemplate: false` — *per-entry* trackers, which
// nothing had ever written one of, so every chart naming them was dropped with a
// warning. The run now logs them the way a person would (from the day they
// started, on most days after) and `chartableTrackers` is told what was actually
// written. With them, the journals dashboard's own empty fence, and the four
// journal dashboards' `jchart:` regions, the vault went from 19 charts to 35.
//
// One of those charts could not be written at all until the plugin was fixed
// alongside this: `CHART_TAG`'s scope group read `(daily|monthly)` while
// `serializeChartSpec` would write any of the six, so a `daily-by-month` chart
// — the right shape for a quarter or a year — was dropped on the next parse
// with nothing said. See the note on that regex.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  CORPUS,
  DIARY_CAPTURES,
  DIARY_CHALLENGES,
  DIARY_CHARTS,
  DIARY_FOCUS,
  DIARY_HIGHLIGHTS,
  DIARY_LINES,
  DIARY_LINES_BY_TONE,
  DIARY_TASKS,
  DIARY_TASKS_STANDING,
  LOGBOOK_CORPUS,
  PERIOD_CORPUS,
  SEED_EVENTS,
} from "./seed-corpus.mjs";

// ── Pure helpers, exported for the tests ─────────────────────────────────

// A small seeded PRNG. Not cryptographic and not trying to be: what is required
// is that the same seed gives the same sequence in every Node that will ever run
// this, which rules out `Math.random` and rules in twelve lines of arithmetic.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = (rng, list) => list[Math.floor(rng() * list.length)];

// `n` DISTINCT entries from `list`. Repeated `pick` would happily hand the same
// line back twice, and a Highlights list that says the same thing on both of its
// bullets is the one thing a reader is guaranteed to notice. Draws from a copy so
// the corpus itself is never shuffled — the arrays are module constants shared by
// every journal in the run, and mutating one would make the seed depend on the
// order the journals happen to be written in.
export function uniquePicks(rng, list, n) {
  const pool = [...list];
  const out = [];
  const want = Math.min(n, pool.length);
  for (let i = 0; i < want; i++) out.push(...pool.splice(Math.floor(rng() * pool.length), 1));
  return out;
}

// ISO date arithmetic on plain strings, in UTC.
//
// `new Date("2026-08-18")` is parsed as UTC midnight and `getUTC*` reads it
// back, so a machine in any timezone produces the same dates. A local-time
// `Date` would shift the whole history by one day west of Greenwich, which is
// exactly the kind of difference that shows up only in someone else's
// screenshot.
export function isoShift(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isoDaysBetween(fromIso, toIso) {
  const a = new Date(`${fromIso}T00:00:00Z`).getTime();
  const b = new Date(`${toIso}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

// The days the example vault has entries on.
//
// NOT EVERY DAY, AND NOT A COIN FLIP EITHER. A year of unbroken entries makes
// the streak widgets meaningless (every streak is the whole year) and the
// heatmap a solid block; a per-day coin flip gives a uniform static with no
// streak longer than about five. Neither looks like a person.
//
// So the walk has two states. It keeps going while it is going — that is what
// produces the long streaks the "longest streak" figure exists to show — and
// when it stops it stops for a few days at a time. `run` and `gap` are drawn
// from the generator, so the pattern is reproducible and still irregular.
//
// A LAPSE IS DELIBERATE. One stretch of two to three weeks is dropped somewhere
// in the middle third, because the thing a year of activity is supposed to make
// visible is precisely that you can look back and see where you fell off.
export function activeDays({ today, months = 13, rng }) {
  const start = isoShift(today, -Math.round(months * 30.4));
  const total = isoDaysBetween(start, today);
  const lapseAt = Math.floor(total * (0.35 + rng() * 0.2));
  const lapseLen = 14 + Math.floor(rng() * 8);

  const out = [];
  let i = 0;
  while (i <= total) {
    if (i >= lapseAt && i < lapseAt + lapseLen) {
      i = lapseAt + lapseLen;
      continue;
    }
    const run = 1 + Math.floor(rng() * 12);
    for (let k = 0; k < run && i <= total; k++, i++) {
      if (i >= lapseAt && i < lapseAt + lapseLen) break;
      out.push(isoShift(start, i));
    }
    i += 1 + Math.floor(rng() * 4);
  }
  // TODAY IS ALWAYS AN ENTRY (4.83). The walk can finish its last run four days
  // short of the end, and a vault whose most recent entry is from Tuesday reads
  // as one somebody has stopped keeping — on the one screen (the homepage,
  // "today") where a reader looks first. It is also what makes the open-task
  // window have something in it: tasks are written on entries.
  if (out[out.length - 1] !== today) out.push(today);
  if (out[out.length - 2] !== isoShift(today, -1)) out.splice(out.length - 1, 0, isoShift(today, -1));
  return out;
}

// The longest run of consecutive dates in a sorted list. Reported after a run so
// the operator can see the history has the shape it was asked for, rather than
// finding out from a screenshot.
export function longestStreak(dates) {
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of dates) {
    run = prev && isoDaysBetween(prev, d) === 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return best;
}

// Compute containing period information for an ISO date.
export function periodHierarchy(dateIso) {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const dayNum = d.getUTCDay() || 7; // 1 (Mon) to 7 (Sun)

  // Thursday of this week determines the ISO week-number and month/year
  const thurs = new Date(d);
  thurs.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const thursYear = thurs.getUTCFullYear();
  const thursMonth = thurs.getUTCMonth() + 1;
  const yearStart = new Date(Date.UTC(thursYear, 0, 1));
  const weekNo = Math.ceil(((thurs - yearStart) / 86400000 + 1) / 7);
  const weekName = `Week-${thursYear}-W${String(weekNo).padStart(2, "0")}`;

  // Monday of the week
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() - (dayNum - 1));
  const mondayIso = mon.toISOString().slice(0, 10);

  // Month containing the week (by Thursday)
  const monthNum = String(thursMonth).padStart(2, "0");
  const monthName = `Month-${thursYear}-${monthNum}`;
  const monthStartIso = `${thursYear}-${monthNum}-01`;

  // Quarter containing the month
  const q = Math.floor((thursMonth - 1) / 3) + 1;
  const quarterName = `Quarter-${thursYear}-Q${q}`;
  const quarterStartIso = `${thursYear}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01`;

  // Year
  const yearName = `Year-${thursYear}`;
  const yearStartIso = `${thursYear}-01-01`;

  return {
    day: { name: `Day-${dateIso}`, startIso: dateIso },
    week: { name: weekName, startIso: mondayIso, weekNo, year: thursYear },
    month: { name: monthName, startIso: monthStartIso, monthNum, year: thursYear },
    quarter: { name: quarterName, startIso: quarterStartIso, q, year: thursYear },
    year: { name: yearName, startIso: yearStartIso, year: thursYear },
  };
}

// Compute the folder path for an entry based on vault paths.
export function entryFolder(paths, grain, dateIso) {
  const h = periodHierarchy(dateIso);
  const entriesRoot = paths.diaryEntries ?? `${paths.diaryRoot ?? "02 - Diary"}/Entries`;
  const yearFolder = `${entriesRoot}/${h.year.name}`;
  const quarterFolder = `${yearFolder}/${h.quarter.name}`;
  const monthFolder = `${quarterFolder}/${h.month.name}`;
  const weekFolder = `${monthFolder}/${h.week.name}`;

  switch (grain) {
    case "yearly":
      return yearFolder;
    case "quarterly":
      return quarterFolder;
    case "monthly":
      return monthFolder;
    case "weekly":
      return weekFolder;
    case "daily":
      return weekFolder;
    default:
      return entriesRoot;
  }
}

// Embed or replace the hidden graph link block in a note.
export function setGraphLinks(text, links) {
  const list = Array.isArray(links) ? links : links ? [links] : [];
  const validLinks = list.filter((l) => typeof l === "string" && l.trim() !== "");
  const GRAPH_BLOCK_RE = /%% chronoanvil-graph %%\n%%[^\n]*%%/;
  if (validLinks.length === 0) {
    return GRAPH_BLOCK_RE.test(text)
      ? text
          .replace(GRAPH_BLOCK_RE, "")
          .replace(/\n{3,}/g, "\n\n")
          .replace(/\s*$/, "") + "\n"
      : text;
  }
  const wikilinks = validLinks.map((l) => `[[${l}|\u200B]]`).join(" ");
  const block = `\n\n%% chronoanvil-graph %%\n%% ${wikilinks} %%\n`;
  return GRAPH_BLOCK_RE.test(text)
    ? text.replace(GRAPH_BLOCK_RE, () => block.trim())
    : text.replace(/\s*$/, "") + block;
}

// ── Markdown transforms ──────────────────────────────────────────────────

// Set one frontmatter key.
//
// ── REPLACE ALWAYS, ADD ONLY WHEN THE JOURNAL DECLARES A TRACKER ────────
//
// The templates decide what frontmatter a kind carries, so a seeder inventing
// keys would produce notes the plugin never makes — and a key the corpus names
// that the template does not have is a corpus error, reported as one.
//
// **A LOGGED TRACKER IS THE EXCEPTION, AND IT IS NOT A LOOPHOLE.** `duration`,
// `calories`, `pagesRead` and the rest are not in any template; they arrive when
// a value is logged, and the plugin adds them itself —
// `entry-trackers.ts::ensureProperties` is literally `if (!(key in fm)) fm[key] =
// null`. So a seeded workout with a duration is doing exactly what the plugin
// does when someone types one in, and refusing to add it would produce example
// notes with tracker widgets that have never been used.
//
// `add` IS THEREFORE PASSED ONLY FOR KEYS THE SETTINGS DECLARE as trackers on
// this journal — never for a key the corpus simply named. The caller resolves
// that list; this function does not get to decide.
export function setFrontmatter(body, key, value, { add = false } = {}) {
  const end = body.indexOf("\n---", 4);
  if (!body.startsWith("---\n") || end === -1) return null;
  const head = body.slice(0, end);
  const re = new RegExp(`^${key}:.*$`, "m");
  if (re.test(head)) return head.replace(re, `${key}: ${value}`) + body.slice(end);
  if (!add) return null;
  return `${head}\n${key}: ${value}${body.slice(end)}`;
}

// Replace what sits under a `## Heading`, up to the next heading or block.
//
// THE TEMPLATE OWNS THE HEADINGS AND THIS OWNS WHAT IS UNDER THEM. A seeder that
// wrote whole bodies would have to restate every template, and would drift from
// them the first time one was edited — the templates are shipped assets that
// change with the plugin. This edits in place, so a template that gains a
// section gains it in the example too, empty until the corpus has something to
// say there.
//
// STOPS AT A FENCE AS WELL AS AT A HEADING, because the Study lesson template
// puts ```chronoanvil blocks between prose sections and swallowing one would delete
// a widget from the note.
// AN ARRAY IS A LIST AND A STRING IS A PARAGRAPH, which is the whole of the
// corpus's markup vocabulary — and it has to be, because the template's own
// sections are bullet lists (`- **Definition:** `) and a replacement that dropped
// the marker turned every list in the vault into a run of loose lines. Caught on
// the first real seed rather than reasoned about in advance.
//
// A LINE THAT ALREADY CARRIES A MARKER IS LEFT ALONE — a nested `- `, a blank
// separator, a quote or a sub-heading — so a corpus entry can still write its own
// structure where a flat list is not what it means. `[[A link]]` is NOT treated as
// marked: the template's own `- [[]] — ` is a bullet, and a wiki link at the start
// of a line is the commonest thing a list item begins with.
const asMarkdown = (lines) => {
  if (!Array.isArray(lines)) return String(lines);
  return lines
    // A MARKER IS A BULLET CHARACTER **FOLLOWED BY A SPACE**, and that space is
    // load-bearing: `**Definition:**` starts with `*` and was read as a list item
    // by a looser test, so every bolded lead-in in the corpus came out unbulleted.
    // Markdown itself draws the same distinction — `*x*` is emphasis, `* x` is a
    // list — so this is the language's rule rather than a patch over one case.
    .map((l) => (l.trim() === "" || /^\s*([-*+]\s|>|\||#{1,6}\s)/.test(l) ? l : `- ${l}`))
    .join("\n");
};

export function fillSection(body, heading, lines) {
  const text = asMarkdown(lines);
  const start = body.indexOf(`\n## ${heading}\n`);
  if (start === -1) return null;
  const from = start + `\n## ${heading}\n`.length;
  const rest = body.slice(from).split("\n");
  let take = 0;
  while (take < rest.length) {
    const line = rest[take];
    if (/^#{1,6} /.test(line) || line.startsWith("```") || line.startsWith("<!--")) break;
    take++;
  }
  return `${body.slice(0, from)}\n${text}\n\n${rest.slice(take).join("\n")}`;
}

// Put content inside an `<!--chronoanvil:id … -->` region.
//
// The regions are how ChronoAnvil stores a note's tasks, recall cards and
// attachments — the widget reads the comment, not the prose — so a seeded task
// that went in as a plain markdown checkbox would render nowhere and count for
// nothing. `- ( )` is the marker `parseTaskLine` reads; a native `- [ ]` is not.
export function fillRegion(body, id, lines) {
  const open = `<!--chronoanvil:${id}`;
  const at = body.indexOf(open);
  if (at === -1) return null;
  const close = body.indexOf("-->", at);
  if (close === -1) return null;
  const text = lines.length ? `\n${lines.join("\n")}\n` : "\n";
  return body.slice(0, at + open.length) + text + body.slice(close);
}

// One task line, in `tasks.ts::serializeTaskLine`'s order: the box, the text,
// then `priority`, `due` and `at` — the last only ever alongside a due date,
// because `parseTaskLine` drops an hour that names no day and would hand back a
// line this did not write.
export const taskLine = (t) => {
  const parts = [`- (${t.done ? "x" : " "}) ${String(t.text).trim()}`.trimEnd()];
  if (t.priority && t.priority !== "normal") parts.push(`[priority:: ${t.priority}]`);
  if (t.due) parts.push(`[due:: ${t.due}]`);
  if (t.due && t.at) parts.push(`[at:: ${t.at}]`);
  return parts.join(" ");
};

// A recall card. `question :: answer`, spaced, which is `recall.ts`'s format and
// NOT the task format one line above it.
//
// Both live in `<!--chronoanvil:… -->` regions and they look alike from a distance,
// which is exactly how an earlier version of this file came to write recall cards
// as `- ( ) question`. Nothing failed: the region existed, the write succeeded,
// and the example vault's flashcards came out with `- ( ) ` printed inside the
// prompt and an empty reveal behind every one of them. Four region formats share
// one comment syntax — tasks, entries, attachments, recall — so the region name
// is not enough to know what goes in it.
//
// A BARE QUESTION IS LEGAL AND STILL WRONG HERE. `parseRecallLine` reads a line
// with no separator as a question with no answer yet, so the corpus could carry
// questions alone and nothing would warn. But a card whose reveal is blank
// demonstrates the widget without demonstrating the feature, and this vault exists
// to be looked at — so the corpus carries pairs and this accepts a bare string
// only as the degenerate case.
export const recallLine = (card) =>
  Array.isArray(card) && card[1] ? `${card[0]} :: ${card[1]}` : String(Array.isArray(card) ? card[0] : card);

// ── The log grammar (4.62) ───────────────────────────────────────────────
//
// A stamped line: `2026-08-19 14:32 — text [mins:: 45] [done:: 2026-08-20]`.
// This is `log-items.ts::serializeLogItem` written a second time, in a file that
// cannot import it — the tool is plain `.mjs` and the plugin is TypeScript — and
// a second spelling of a format is exactly the thing this project does not do.
//
// SO THE TEST IS THE JOIN. `seed-vault.test.ts` feeds these lines to the
// plugin's own `parseLogItems` and asserts on what comes back, which is the same
// discipline the task and recall regions are held to and for the same reason:
// four region formats share one comment syntax, the write always succeeds, and
// the only thing that can tell you the format was wrong is the parser.
//
// THE DATE IS OPTIONAL AND THAT IS THE WHOLE DIFFERENCE between the two things
// this writes. A logbook note spans months, so its items carry a day; a capture
// lives in a dated entry, so its stamp is the minute alone.
export function stampLine({ date = null, time = null, text, mins = null, done = null }) {
  const body = String(text).replace(/\s+$/, "");
  if (!body) return "";
  const stamp = [date, time].filter((part) => !!part).join(" ");
  // `mins` BEFORE `done`, which is the order `serializeLogItem` writes them in
  // and not an arbitrary one: every crossed-off line already on disk carries
  // `[done:: …]` last.
  const mark = (mins ? ` [mins:: ${mins}]` : "") + (done ? ` [done:: ${done}]` : "");
  const [first, ...rest] = body.split("\n");
  const head = `${stamp ? `${stamp} — ` : ""}${first.trim()}${mark}`;
  return [head, ...rest.map((l) => (l.trim() === "" ? "" : `  ${l.trimEnd()}`))].join("\n");
}

// Items, as region lines with one blank line between them.
//
// THE BLANK LINE IS LOAD-BEARING, not spacing. `parseLogItems` reads a stamp as
// the start of an item and everything under it as that item's text, so two items
// written back to back would parse as one item with a second stamp inside its
// body — and `appendedSince` only recognises another writer's append when the
// divergence starts with `\n\n`, which is what keeps a capture arriving while
// the list is on screen from being clobbered.
export const logBlock = (items) =>
  items.filter((l) => l !== "").flatMap((line, i) => (i ? ["", line] : [line]));

// Make sure a region exists, appending an empty one at the end of the note if it
// does not — `notestore.ts::writeNoteRegion`'s own append, spacing included.
//
// NEEDED BECAUSE A LOGBOOK NOTE HAS NO REGION UNTIL IT IS USED. The scaffold
// writes the note and its `logbook:` directive; the region is created by the
// widget the first time it renders. A seeder that only ever filled existing
// regions could therefore fill every daily entry and no logbook at all.
export function ensureRegion(body, id) {
  if (body.includes(`<!--chronoanvil:${id}`)) return body;
  const trimmed = body.replace(/\s*$/, "");
  const sep = trimmed.length === 0 ? "" : "\n\n";
  return `${trimmed}${sep}<!--chronoanvil:${id}\n-->\n`;
}

// ── Charts (4.62) ────────────────────────────────────────────────────────

// One `chart:` directive, in the order `charts.ts::serializeChartSpec` writes
// them: scope, then `+y=`, then `+avg`, then the title after a bar. A different
// order would still parse — the suffix parser takes them in any order — and
// would produce a vault whose directives do not match what the chart editor
// writes back the first time somebody touches one.
export function chartLine(spec) {
  const scope = spec.scope && spec.scope !== "daily" ? `:${spec.scope}` : "";
  const y = spec.y ? `+y=${spec.y}` : "";
  const avg = spec.avg ? "+avg" : "";
  const size = spec.size ? `+size=${spec.size}` : "";
  const title = spec.title ? `|${spec.title}` : "";
  return `chart:${spec.key}:${spec.tracker}:${spec.type}:${spec.range}${scope}${y}${avg}${size}${title}`;
}

// Put chart directives inside a note's ```chronoanvil-charts fence.
//
// AND REFUSE ONE THAT ALREADY HAS SOME. The fence is a MANAGED region — the
// chart editor rewrites it — so a seeder that appended to a populated one would
// be adding tiles to a list somebody curated. Returns null for "no fence here"
// and null for "this one is already answered", and the caller reports the
// difference; both mean the same thing to the run, which is: leave it alone.
//
// THE `header:` LINE STAYS WHERE IT IS. In the merged layout the fence carries
// both its own section title and its charts, so the directives go after
// whatever is already in it rather than replacing the body.
export function fillChartsFence(body, lines) {
  const open = body.indexOf("```chronoanvil-charts");
  if (open === -1) return null;
  const bodyStart = body.indexOf("\n", open);
  if (bodyStart === -1) return null;
  const close = body.indexOf("\n```", bodyStart);
  if (close === -1) return null;
  const inner = body.slice(bodyStart + 1, close + 1);
  if (/^chart:/m.test(inner)) return null;
  const kept = inner.replace(/\s*$/, "");
  return `${body.slice(0, bodyStart + 1)}${kept ? `${kept}\n` : ""}${lines.join("\n")}${body.slice(close)}`;
}

// ── Events (4.62) ────────────────────────────────────────────────────────

// The corpus's offsets, resolved against the run's own "today", with an id
// slugged from the title exactly as `slugifyEventId` would.
//
// A WEEKLY EVENT IS STORED AS A RECURRING ONE WITH `every: week` (4.62), which
// is the shape `normalizeEvent` reads — `kind: "weekly"` is this corpus's word
// for it and nothing else's, translated here rather than in the file a reader
// edits.
export function resolveEvents(list, today) {
  return list.map((e) => {
    const id = String(e.title)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48);
    const out = { id, title: e.title, icon: e.icon, color: e.color };
    if (e.note) out.note = e.note;
    if (e.time) out.time = e.time;
    if (e.duration) out.duration = e.duration;
    if (e.kind === "weekly") {
      out.kind = "recurring";
      out.every = "week";
      out.weekday = e.weekday;
      if (e.fromOffset != null) out.from = isoShift(today, e.fromOffset);
      if (e.untilOffset != null) out.until = isoShift(today, e.untilOffset);
      return out;
    }
    if (e.kind === "recurring") {
      out.kind = "recurring";
      out.month = e.month;
      out.day = e.day;
      return out;
    }
    out.kind = "single";
    out.start = e.start ?? isoShift(today, e.startOffset ?? 0);
    if (e.endOffset != null) out.end = isoShift(today, e.endOffset);
    return out;
  });
}

// The events note's frontmatter value, as YAML.
//
// WRITTEN BY HAND BECAUSE THE TOOL HAS NO YAML WRITER, and quoted on every
// string because the titles are prose: an apostrophe, a colon before a space or
// a leading digit each mean something to a YAML parser and none of them means it
// in "One-to-one". Numbers stay bare so `month: 4` reads as a number, which is
// what `asInt` expects to find.
export function eventsYaml(events, key = "chronoanvil-events") {
  const out = [`${key}:`];
  for (const e of events) {
    const rows = Object.entries(e).map(([k, v]) =>
      typeof v === "number" ? `${k}: ${v}` : `${k}: "${String(v).replace(/"/g, '\\"')}"`
    );
    out.push(`  - ${rows[0]}`);
    for (const row of rows.slice(1)) out.push(`    ${row}`);
  }
  return out.join("\n");
}

// Replace an EMPTY `chronoanvil-events: []` with a list, and refuse a note that
// already holds events — somebody's own birthdays are not this tool's to
// overwrite, and `[]` is the scaffold's own way of saying "none yet".
export function fillEvents(body, events, key = "chronoanvil-events") {
  const end = body.indexOf("\n---", 4);
  if (!body.startsWith("---\n") || end === -1) return null;
  const head = body.slice(0, end).split("\n");
  const at = head.findIndex((l) => l.startsWith(`${key}:`));
  if (at === -1) return null;
  // EMPTY MEANS TWO THINGS AND NEITHER OF THEM IS "the key line looks short".
  // `chronoanvil-events:` with nothing after it is also the FIRST LINE of a filled
  // list — the events are the indented lines beneath it — so the next line has
  // to be checked as well. A regex that only read the key line matched both and
  // quietly re-seeded a note that already had a year of events in it.
  const value = head[at].slice(key.length + 1).trim();
  if (value !== "" && value !== "[]") return null;
  if (value === "" && /^\s+\S/.test(head[at + 1] ?? "")) return null;
  head.splice(at, 1, ...eventsYaml(events, key).split("\n"));
  return head.join("\n") + body.slice(end);
}

// `{{token}}` substitution, matching src/core/util.ts::fillTemplate — unknown
// tokens are left in place so a missing value is visible rather than blank.
export function fillTemplate(body, tokens) {
  return body.replace(/\{\{\s*([\w-]+)\s*\}\}/g, (m, k) =>
    Object.prototype.hasOwnProperty.call(tokens, k) ? tokens[k] : m
  );
}

// A filename Obsidian will accept, matching the plugin's own `safeTitle`.
export const safeName = (s) => s.trim().replace(/[\\/:"*?<>|]/g, "-");

const stamp = (iso, rng) => {
  const h = 8 + Math.floor(rng() * 12);
  const m = Math.floor(rng() * 60);
  return `${iso}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
};

// ── The day model (4.83) ─────────────────────────────────────────────────
//
// WHY THE NUMBERS STOPPED BEING INDEPENDENT DICE.
//
// Every tracker in the daily entry used to be its own uniform draw: a mood
// between 2 and 5, a wake-up between 06:00 and 08:30, a bedtime, and a `Sleep`
// value pulled out of the air between 6.0 and 8.5 hours. Four numbers about the
// same night that agreed with each other only by accident.
//
// TWO THINGS WERE WRONG WITH THAT, AND ONE OF THEM WAS A DEFECT. `Sleep` is a
// DERIVED tracker — `recomputeSleepInFrontmatter` sets it to
// `sleepHours(Bedtime, Wake-Up)` every time either time is written — so a
// seeded entry with 06:30 / 22:15 / 7.4 held a number the plugin would replace
// with 8.25 the moment anybody touched the note. The example vault was showing
// a value its own reader could not reproduce.
//
// The other was subtler and worse for the thing this vault is for. The diary
// dashboard ships a chart called *"Does sleep move mood?"*, and against
// independent draws the honest answer it drew was "no": a shapeless cloud, on
// the one surface where a reader is being invited to look for a relationship.
//
// SO THE DAY IS GENERATED ONCE AND THE TRACKERS ARE READ OFF IT. A weekend
// wakes later, a Friday night runs later, sleep is the arithmetic between the
// two, and mood follows sleep with a weekday rhythm and a lot of noise on top —
// enough that the scatter has a slope and nowhere near enough to make it a
// line. Everything still comes from the seeded generator, so the same seed is
// still the same year.

// Minutes since midnight → "HH:mm", wrapping the day, which is `formatClock`.
export const clockOf = (mins) => {
  const w = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(w / 60)).padStart(2, "0")}:${String(w % 60).padStart(2, "0")}`;
};

// Hours asleep from a bedtime the evening before to a wake time the morning
// after, wrapping midnight — `util.ts::sleepHours`, and the SECOND SPELLING of
// it, so the test asserts the two agree rather than trusting this one.
export function sleepHoursOf(bedMin, wakeMin) {
  const span = (((wakeMin - bedMin) % 1440) + 1440) % 1440;
  return Math.round((span / 60) * 100) / 100;
}

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

// The dates a long gap opens after, and the ones it opens onto.
//
// `activeDays` drops a fortnight somewhere in the middle third, because the
// thing a year of entries is supposed to make visible is that you can look back
// and see where you fell off. It does not SAY where — and a mood series that
// walks into a three-week silence at a cheerful 4 tells the reader nothing fell
// off at all. This reads the shape back out of the dates themselves, so the
// engine never has to be told twice and a second gap (or none) needs no flag.
export function gapEdges(dates, { lead = 6, trail = 4, gap = 10 } = {}) {
  const before = new Set();
  const after = new Set();
  for (let i = 0; i + 1 < dates.length; i++) {
    if (isoDaysBetween(dates[i], dates[i + 1]) < gap) continue;
    for (let k = 0; k < lead && i - k >= 0; k++) before.add(dates[i - k]);
    for (let k = 1; k <= trail && i + k < dates.length; k++) after.add(dates[i + k]);
  }
  return { before, after };
}

// One day, as the numbers a person would have logged on it.
//
// The three moods come back NORMALISED to 0..1 rather than as 1-to-5 scores,
// because the scale they land on belongs to the tracker: a reader whose Mood
// runs 0–10 should get a seeded 0–10, and a model that returned 4 would either
// have to know that or be silently wrong. `trackerValueFor` does the mapping.
export function dayModel({ date, rng, dipping = false, returning = false }) {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
  // Saturday and Sunday carry BOTH halves of the rhythm: the night before them
  // is the free one (Friday, Saturday) and the morning after is the slow one.
  const weekend = dow === 0 || dow === 6;

  const fuzz = (spread) => Math.round(((rng() - 0.5) * spread) / 5) * 5;
  const wakeMin = (weekend ? 8 * 60 + 5 : 6 * 60 + 40) + fuzz(70);
  // A late night about one evening in eleven, and it is the tail that makes the
  // sleep distribution look like a person's rather than a rectangle.
  const lateNight = rng() < 0.09 ? 55 + Math.floor(rng() * 70) : 0;
  const bedMin = (weekend ? 23 * 60 + 35 : 22 * 60 + 50) + fuzz(60) + lateNight;

  const sleep = sleepHoursOf(bedMin, wakeMin);
  // Where this night sits between a bad one and a good one, which is what every
  // other reading is hung off.
  const sleepN = clamp01((sleep - 5.4) / 3.2);

  const WEEKDAY_LIFT = [0.08, -0.22, -0.02, 0.0, 0.08, 0.26, 0.3]; // Sun … Sat
  const drift = dipping ? -0.28 : returning ? 0.16 : 0;
  const noise = () => (rng() - 0.5) * 0.42;

  const moodN = clamp01(0.5 + 0.26 * (sleepN - 0.5) * 2 + WEEKDAY_LIFT[dow] + drift + noise());
  const energyN = clamp01(0.48 + 0.3 * (sleepN - 0.5) * 2 + 0.3 * (moodN - 0.5) + drift + noise());
  // Focus is the one that does NOT follow the weekend up: a Saturday is a good
  // day and rarely a productive one, and a vault where every reading rises and
  // falls together is a vault with one tracker in it wearing three labels.
  const focusN = clamp01(0.5 + 0.34 * (energyN - 0.5) - (weekend ? 0.12 : 0) + drift + noise());

  return {
    date,
    dow,
    weekend,
    wake: clockOf(wakeMin),
    bed: clockOf(bedMin),
    wakeMin,
    bedMin: ((bedMin % 1440) + 1440) % 1440,
    sleep,
    sleepN,
    moodN,
    energyN,
    focusN,
    dipping,
    returning,
    // WHICH LIST THE DAY'S PROSE COMES FROM. A five-hour night rated 2 that
    // reads "Cleared the desk, cleared the inbox, cleared the head" is a vault
    // whose numbers and whose sentences are about two different people.
    tone: moodN >= 0.62 ? "good" : moodN <= 0.34 ? "hard" : "mixed",
  };
}

// A tracker's reading for one day.
//
// DERIVED FROM THE DEFINITION, NOT FROM A LIST OF NAMES. The built-ins are
// recognised by their `builtin` kind — never by their id, which a reader is free
// to rename — and anything else is given a value that fits the TYPE and range it
// declares. So a vault whose owner added "Steps" or "Pages" gets seeded readings
// for it and charts that are not empty, which is the whole argument of this
// tool applied to the one thing it used to hard-code.
export function trackerValueFor(def, model, rng) {
  const kind = def.builtin ?? "";
  if (kind === "wake") return model.wake;
  if (kind === "bed") return model.bed;
  // Never the model's own number: `Sleep` is the arithmetic between the two
  // times above, and the plugin will recompute it from them the first time the
  // note is edited.
  if (kind === "sleep") return model.sleep;

  const scale = (n) => {
    const min = Number.isFinite(def.min) ? def.min : 1;
    const max = Number.isFinite(def.max) ? def.max : 5;
    const step = Number.isFinite(def.step) && def.step > 0 ? def.step : 1;
    const raw = min + n * (max - min);
    const snapped = min + Math.round((raw - min) / step) * step;
    const bounded = Math.min(max, Math.max(min, snapped));
    return Number.isInteger(step) ? Math.round(bounded) : Number(bounded.toFixed(2));
  };

  if (kind === "mood") return scale(model.moodN);
  if (kind === "energy") return scale(model.energyN);
  if (kind === "focus") return scale(model.focusN);

  // An unknown tracker is correlated with the day rather than independent of
  // it, for the reason the whole model exists — but only half so, because the
  // seeder has no idea what it measures.
  const n = clamp01(0.5 * model.energyN + 0.5 * rng());
  if (def.type === "scale" || def.type === "number") return scale(n);
  if (def.type === "boolean") return n > 0.42;
  if (def.type === "time") return clockOf(model.wakeMin + 120 + Math.round(n * 480));
  return null;
}

// The diary's daily trackers, as the settings declare them.
export function dailyTrackerDefs(settings) {
  return (settings.trackers ?? []).filter(
    (t) => (t.surface?.kind ?? "") === "diary" && (t.surface?.classes ?? []).includes("daily")
  );
}

// The keys the Daily template writes into every entry's frontmatter — the
// `# chronoanvil:trackers:start` block, which is the plugin's own managed region.
export function templateTrackerKeys(dailyTemplate) {
  const front = /# chronoanvil:trackers:start\n([\s\S]*?)\n# chronoanvil:trackers:end/.exec(dailyTemplate ?? "");
  if (!front) return new Set();
  return new Set(
    front[1]
      .split("\n")
      .map((l) => /^([^:#]+):/.exec(l)?.[1]?.trim())
      .filter(Boolean)
  );
}

// ── Per-entry trackers (4.83) ────────────────────────────────────────────
//
// A tracker with `showInTemplate: false` is not a disabled tracker. Settings
// calls it *"Per-entry only"* and `trackerOptions` says so in as many words —
// *"a tracker switched off there is precisely the occasional one this picker
// exists to reach"* — so the reader's own vault has Energy and Focus in the
// registry, chartable, offered by "+ Add tracker", and in not one note.
//
// Which is how the example vault came to drop two of its six diary charts with
// *"no readings for Energy — dropped"*: the corpus asked for them, the vault
// declared them, and nothing had ever written one.
//
// SEEDED FROM A START DATE RATHER THAN A COIN FLIP, because that is the shape a
// per-entry tracker actually has. Nobody logs energy on a random 60% of the
// days of their life; they start one Tuesday in March because they want to know
// something, and then they mostly keep it up. A start partway through the
// history also makes the year-long chart show the beginning of a habit, which a
// uniform sprinkle cannot.
export function perEntryPlan(defs, dates, rng) {
  const plan = new Map();
  defs.forEach((def, i) => {
    // Staggered so two trackers do not begin on the same day, and never in the
    // last month — a habit with three readings charts as nothing.
    const at = Math.floor(dates.length * (0.32 + 0.17 * i)) % Math.max(1, dates.length);
    plan.set(def.id, {
      from: dates[Math.min(at, Math.max(0, dates.length - 45))] ?? dates[0],
      density: 0.62 + rng() * 0.2,
    });
  });
  return plan;
}

// Insert a `tracker:<id>` directive into a note's own tracker fence, which is
// what `insertTrackerDirective` does when a reader picks one — the property
// alone would give the entry a value with no control to change it.
//
// THE FRONTMATTER'S MARKERS ARE NOT THE BODY'S. A daily note carries
// `# chronoanvil:trackers:start` TWICE: once in the frontmatter, listing keys, and
// once inside a ```chronoanvil fence, listing widgets. `locateTrackerRegion` only
// ever looks inside fences, so this does too — matching on the fence and not on
// the marker is the difference between adding a widget and corrupting the
// frontmatter.
export function addTrackerDirective(body, directive) {
  const want = directive.trim();
  const lines = body.split("\n");
  // Already there — `insertTrackerDirective` dedupes against the whole note and
  // not just the region, "because a directive already rendering from another
  // fence is already writing that property".
  if (lines.some((l) => l.trim() === want)) return body;

  let open = -1;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (open === -1) {
      if (t === "```chronoanvil") open = i;
      continue;
    }
    if (t === "```") {
      open = -1;
      continue;
    }
    // The LAST directive's line is where a new one goes, so the insert lands
    // above the closing marker and below whatever is already logged.
    if (t === "# chronoanvil:trackers:end") {
      lines.splice(i, 0, directive);
      return lines.join("\n");
    }
  }
  return null;
}

// ── Tasks, and the month that bounds them (4.83) ─────────────────────────
//
// WHAT WAS WRONG. Every task the seeder wrote was open with probability 0.45,
// on every entry, over thirteen months — so a freshly seeded vault held about
// two hundred open tasks, the oldest of them thirteen months stale. That is not
// a demo of the task widgets; `tasks-table` is a folder-scoped rollup of every
// still-open task under a folder, so the diary's own dashboard opened onto a
// wall of a hundred and thirty things from last autumn, and the one question a
// reader asks it — *what do I actually have to do?* — had no answer in there.
//
// THE RULE. A task older than the window is DONE. Not usually done: done. The
// window is a month by default and `--task-window` moves it, and the reason it
// is a hard edge rather than a steep probability is that a hard edge is the
// thing a reader can verify at a glance — every open task in the vault is from
// the last month, and the seeder's own report says so.
//
// This is not a lie about how people work. It is a demo vault: the story it
// tells is of somebody who keeps on top of things, which is the story every
// widget in it is built to support. A vault seeded with a year of guilt is
// realistic in a way that is of no use to anybody.
export const OPEN_TASK_WINDOW = 30;

export function taskAging({ date, today, rng, window = OPEN_TASK_WINDOW, standing = false }) {
  const age = isoDaysBetween(date, today);
  if (age > window || age < 0) return { done: true };
  // Nearer to today is likelier to be open, which is what an unfinished list
  // looks like from the inside: yesterday's is half done, last month's is not
  // there any more.
  const openChance = 0.12 + 0.6 * (1 - age / Math.max(1, window));
  if (rng() >= openChance) return { done: true };

  const out = { done: false };
  if (rng() < 0.32) out.priority = rng() < 0.45 ? "high" : "low";
  // A DUE DATE ON SOME OF THEM, AND AN HOUR ON FEWER. The time grid draws a
  // task with an hour as a block and one without in the all-day lane, so a
  // vault whose tasks never carried either left the grid's fourth lane empty.
  if (standing || rng() < 0.4) {
    const due = isoShift(date, standing ? 0 : Math.floor(rng() * 12) - 3);
    // Never further out than a fortnight past today: a demo vault's forward
    // list should fit on the screen the reader is looking at.
    const ahead = isoDaysBetween(today, due);
    out.due = ahead > 14 ? isoShift(today, 14) : due;
    if (standing || rng() < 0.4) {
      const hour = 8 + Math.floor(rng() * 11);
      out.at = `${String(hour).padStart(2, "0")}:${rng() < 0.5 ? "00" : "30"}`;
    }
  }
  return out;
}

// Draw from a list while avoiding what was drawn recently.
//
// `pick` alone gave a year of entries in which the same sentence turned up on
// the 3rd, the 5th and the 11th — invisible in a single note and impossible to
// miss in the on-this-day widget, which is precisely a column of entries from
// different days sitting one above the other. `recent` is the caller's memory
// and this trims it, so the caller can keep one per list without bookkeeping.
export function pickFresh(rng, list, recent, memory = 0) {
  const span = memory || Math.max(1, Math.floor(list.length / 2));
  const fresh = list.filter((l) => !recent.includes(l));
  const chosen = (fresh.length ? fresh : list)[Math.floor(rng() * (fresh.length ? fresh.length : list.length))];
  recent.push(chosen);
  while (recent.length > span) recent.shift();
  return chosen;
}

// ── The plan ─────────────────────────────────────────────────────────────

// Build every file the run would write, without touching the disk.
//
// A PLAN AND THEN A WRITE, which is the shape `repair-plan.ts` uses in the
// plugin and for the same reason: the interesting failures here — a template
// that will not fill, a corpus section the template does not have — are
// discoverable before anything has been created, and a run that stops halfway
// through leaves a vault that is neither empty nor seeded.
export function buildPlan({
  settings,
  templates,
  corpus,
  dates,
  rng,
  warn,
  // The run's own "today", which the tasks are aged against. Defaults to the
  // last active day so the pure tests — and any caller that only cares about
  // paths — can go on passing four arguments and get the same answer.
  today = dates[dates.length - 1] ?? new Date().toISOString().slice(0, 10),
  taskWindow = OPEN_TASK_WINDOW,
  // Filled in as the run goes, and read afterwards by `buildPatches` to decide
  // which charts have readings behind them. An out-parameter rather than a
  // second return value because `buildPlan` returns the file list and half a
  // dozen tests take it as an array.
  seeded = { diaryTrackers: new Set(), journalTrackers: new Map(), openTasks: [] },
}) {
  const files = [];
  const paths = settings.paths;
  const journals = settings.customJournals ?? [];
  // A task that stayed open is recorded here rather than counted afterwards,
  // so the run can report the oldest one and a test can assert there is nothing
  // outside the window without re-reading the vault.
  const noteOpenTask = (date) => seeded.openTasks.push(date);
  // Dates come from `dates`, so a journal note's day is a day the diary was
  // also written on — a heatmap where the journals and the diary disagree about
  // when the year was busy is worse than one with less in it.
  //
  // SPREAD ACROSS THE WINDOW, AND PER JOURNAL (5.3). This was one shared cursor
  // and `dates[cursor++ % dates.length]`, which handed the Nth journal note in
  // the whole vault the Nth active day. About forty notes against thirteen
  // months of dates meant every journal note landed in the OLDEST two months,
  // and nothing was written in the eleven since.
  //
  // WHAT THAT COST, AND WHY IT WAS INVISIBLE. The run reported "402 written, 0
  // warnings" — every note existed, every date was real, every date was an
  // active day. What was wrong was only visible on a dashboard: the activity
  // strip covers 53 weeks back from today, and Study's notes ended 2025-08-24
  // against a strip opening 2025-08-31. One day outside, so the Study dashboard
  // drew a year of empty cells over a Contents section listing seventeen notes.
  // The other three fared no better — a cluster against the left edge and eleven
  // blank months.
  //
  // PER JOURNAL RATHER THAN ACROSS ALL OF THEM, which is the second half of the
  // fix and the one a single shared stride would have missed: dealing four
  // journals in sequence from one cursor gives each of them a contiguous
  // QUARTER of the window and leaves every journal dashboard blank for the other
  // nine months. Each journal now strides the whole window on its own — first
  // note on the oldest active day, last on the newest — which is what a reader
  // keeping four journals over a year actually looks like, and what makes all
  // four dashboards worth a screenshot. Two journals sharing a day is a
  // collision the vault is welcome to have.
  //
  // COUNTED FROM THE CORPUS BEFORE THE WALK, because a stride has to know how
  // many there will be. It counts what `walk` consumes: one date per container
  // node for its index stamp, one per note.
  const dateCalls = (nodes = []) =>
    nodes.reduce(
      (n, node) => n + 1 + (node.notes?.length ?? 0) + dateCalls(node.children),
      0
    );
  const dealDates = (total) => {
    let cursor = 0;
    // `total - 1` so the last note lands ON the newest active day rather than a
    // stride short of it; guarded because a one-note journal would divide by
    // zero, and it takes the oldest day.
    const span = Math.max(1, total - 1);
    return () => {
      const at = Math.round((cursor++ * (dates.length - 1)) / span);
      return dates[Math.min(dates.length - 1, Math.max(0, at))];
    };
  };

  // A VAULT WITH NO JOURNALS IS A LEGITIMATE VAULT AND A SURPRISING RUN. The
  // corpus carries four journals and thirty-two notes, and none of them can be
  // written until the vault has somewhere to put them: the shape comes from
  // `customJournals` in the vault's own `data.json` and the note bodies come
  // from the journal's own templates folder, and both of those appear when a
  // reader adds a journal in Obsidian — not before. So the run finishes with a
  // diary and nothing else, reports "273 written, 0 warnings", and reads as
  // complete. This says otherwise, in the place every other disagreement
  // between the corpus and the vault is reported.
  if (!journals.length) {
    warn(
      "this vault has no journals — Settings → Journals → Presets adds one, " +
        `then re-run and the corpus fills it (${Object.keys(corpus).join(", ")})`
    );
  }

  for (const journal of journals) {
    const entry = corpus[journal.id];
    if (!entry) {
      warn(`no corpus for journal "${journal.id}" — skipped`);
      continue;
    }
    const nextDate = dealDates(dateCalls(entry.containers));
    const levels = journal.levels ?? [];
    const kindsById = new Map((journal.kinds ?? []).map((k) => [k.id, k]));
    // Which tracker keys this journal logs — read from the settings' own tracker
    // list, scoped by surface, so a journal that gains a tracker gains it here
    // without this file being touched. `typeId` absent means every journal.
    const loggable = new Set(
      (settings.trackers ?? [])
        .filter((t) => {
          const s = t.surface ?? {};
          if (s.kind !== "journal") return false;
          return s.typeId == null || s.typeId === journal.id;
        })
        .map((t) => t.id)
    );
    // The id of the built-in review-date tracker, by its KIND and not its name
    // — a reader may have relabelled it, and the id follows the label.
    const reviewedKey = (settings.trackers ?? []).find((t) => t.builtin === "reviewed")?.id ?? null;
    // Every select tracker this journal can carry, as the set of options it
    // declares, so a corpus value outside one can be reported rather than
    // written.
    const selectDefs = new Map(
      (settings.trackers ?? [])
        .filter((t) => t.type === "select" && loggable.has(t.id) && typeof t.options === "string")
        .map((t) => [
          t.id,
          new Set(t.options.split(",").map((pair) => pair.split("=")[0].trim()).filter(Boolean)),
        ])
    );

    const walk = (node, depth, trail) => {
      const level = levels[depth];
      if (!level) return;
      const folder = [journal.root, ...trail, node.name].join("/");
      const tplName = `${level.id}-index.md`;
      const tpl = templates.get(`${journal.templatesFolder}/${tplName}`);
      if (tpl == null) {
        warn(`missing template ${tplName} for ${journal.name}`);
      } else {
        files.push({
          path: `${folder}/${node.name}.md`,
          content: fillTemplate(tpl, {
            emoji: node.emoji ?? level.fallbackEmoji ?? "📁",
            name: node.name,
            subject: trail[0] ?? node.name,
            topic: depth > 0 ? node.name : "",
            folder,
            created: stamp(nextDate(), rng),
          }),
        });
      }

      for (const child of node.children ?? []) walk(child, depth + 1, [...trail, node.name]);

      for (const note of node.notes ?? []) {
        const kind = kindsById.get(note.kind);
        if (!kind) {
          warn(`${journal.name} has no kind "${note.kind}"`);
          continue;
        }
        const variant = (kind.templates ?? [])[0];
        const tplFile = variant?.template ?? `${kind.id}.md`;
        const kindTpl = templates.get(`${journal.templatesFolder}/${tplFile}`);
        if (kindTpl == null) {
          warn(`missing template ${tplFile} for ${journal.name}`);
          continue;
        }
        const date = nextDate();
        const trailAll = [...trail, node.name];
        let body = fillTemplate(kindTpl, {
          title: safeName(note.title),
          name: safeName(note.title),
          emoji: kind.emoji ?? "",
          subject: trailAll[0] ?? "",
          topic: trailAll[1] ?? "",
          parent: trailAll[trailAll.length - 1] ?? "",
          date,
          created: stamp(date, rng),
        });

        // Ratings and trackers, by the names the journal declares — never by a
        // key this file guesses at. `loggable` is the set the settings say this
        // journal tracks, and it is the only set allowed to ADD a frontmatter
        // key; everything else must already be in the template.
        const values = { ...(note.trackers ?? {}) };
        if (kind.rating != null && note.rating != null) values[kind.rating] = note.rating;
        if (note.status) values.status = note.status;

        // ── A REVIEW STAMP ON SOME OF THEM (4.83) ──────────────────────
        //
        // `scheduleFor` counts from `reviewed ?? date`, so a vault where the
        // key was never written is a vault where every note in the queue says
        // "never reviewed" — the review widget's own emptiest state, shown on a
        // page whose whole subject is the difference between a note you have
        // come back to and one you have not. Only on notes the queue can still
        // reach: a completed one is excluded by status, and stamping it would
        // be writing a date nothing reads.
        const openForReview = String(values.status ?? "") !== "completed";
        if (reviewedKey && openForReview && loggable.has(reviewedKey) && rng() < 0.55) {
          const span = Math.max(1, isoDaysBetween(date, today));
          values[reviewedKey] = isoShift(date, 1 + Math.floor(rng() * span));
        }

        for (const [key, value] of Object.entries(values)) {
          // ── AND A VALUE THE TRACKER DOES NOT OFFER IS A CORPUS ERROR ──
          //
          // Found the hard way. Twenty-four notes carried `status: "done"`, and
          // the Status tracker declares `in-progress`, `paused` and
          // `completed` — so `journal-tally:status` drew a bar for a fourth
          // value nothing had ever defined, and `scheduleFor`, which excludes a
          // COMPLETED note from the review queue, went on offering all
          // twenty-four of them for review for ever. Nothing failed and nothing
          // warned: the key existed, the write succeeded, and the vault was
          // wrong in two widgets at once.
          const def = selectDefs.get(key);
          if (def && !def.has(String(value))) {
            warn(`${note.title}: "${key}" has no option "${value}" — the tracker offers ${[...def].join(", ")}`);
          }
          const next = setFrontmatter(body, key, value, { add: loggable.has(key) });
          if (next == null) {
            warn(`${note.title}: nothing declares "${key}"`);
            continue;
          }
          body = next;
          // WHAT THIS JOURNAL HAS READINGS FOR, which is what decides its
          // charts. Recorded as it is written rather than inferred from the
          // corpus afterwards: a value the template refused is a value the
          // vault does not have, and a chart of it would be an empty tile.
          if (loggable.has(key)) {
            const have = seeded.journalTrackers.get(journal.id) ?? new Set();
            have.add(key);
            seeded.journalTrackers.set(journal.id, have);
          }
        }

        for (const [heading, lines] of Object.entries(note.sections ?? {})) {
          const next = fillSection(body, heading, lines);
          if (next == null) warn(`${note.title}: template has no "## ${heading}"`);
          else body = next;
        }
        if (note.tasks?.length) {
          // AGED LIKE EVERY OTHER TASK IN THE VAULT. The corpus says whether a
          // task was ever finished; the DATE says whether it can still be open,
          // and a note written eight months ago whose task is still ticking is
          // one more line on the wall `tasks-table` used to draw.
          const lines = note.tasks.map((t) => {
            const aged = t.done ? { done: true } : taskAging({ date, today, rng, window: taskWindow });
            if (!aged.done) noteOpenTask(date);
            return taskLine({ ...t, ...aged });
          });
          const next = fillRegion(body, "tasks", lines);
          if (next == null) warn(`${note.title}: template has no tasks region`);
          else body = next;
        }
        if (note.recall?.length) {
          const next = fillRegion(body, "recall", note.recall.map(recallLine));
          if (next == null) warn(`${note.title}: template has no recall region`);
          else body = next;
        }

        files.push({ path: `${folder}/${safeName(note.title)}.md`, content: body });
      }
    };

    for (const container of entry.containers ?? []) walk(container, 0, []);
  }

  // ── The diary ──────────────────────────────────────────────────────────
  const daily = templates.get(`${paths.templatesDiary}/Daily.md`);
  if (daily == null) {
    warn("missing Daily.md — no diary entries written");
  } else {
    const useTree = Boolean(paths.diaryEntries || !paths.diaryDaily);
    const entriesRoot = paths.diaryEntries ?? `${paths.diaryRoot ?? "02 - Diary"}/Entries`;

    const seenWeeks = new Map();
    const seenMonths = new Map();
    const seenQuarters = new Map();
    const seenYears = new Map();

    // What the entries log, and which of them the template already carries.
    // Everything else is a per-entry tracker: a widget the reader would have
    // added to one note at a time, seeded here from the day it started.
    const dailyDefs = dailyTrackerDefs(settings);
    const inTemplate = templateTrackerKeys(daily);
    const perEntryDefs = dailyDefs.filter(
      (t) =>
        !inTemplate.has(t.id) &&
        !t.derived &&
        ["number", "scale", "time", "boolean"].includes(t.type ?? "")
    );
    const perEntry = perEntryPlan(perEntryDefs, dates, rng);
    const { before: windingDown, after: comingBack } = gapEdges(dates);
    // One memory per list, so a line cannot come back while it is still the
    // line a reader saw two entries ago.
    const recent = { log: [], focus: [], highlight: [], challenge: [], task: [], capture: [] };

    for (const date of dates) {
      const h = periodHierarchy(date);
      if (!seenWeeks.has(h.week.name)) seenWeeks.set(h.week.name, h);
      if (!seenMonths.has(h.month.name)) seenMonths.set(h.month.name, h);
      if (!seenQuarters.has(h.quarter.name)) seenQuarters.set(h.quarter.name, h);
      if (!seenYears.has(h.year.name)) seenYears.set(h.year.name, h);

      let body = daily.replace(/^journal-date:.*$/m, `journal-date: "${date}"`);

      // ── The day, once, and then read off ────────────────────────────────
      //
      // Every reading below comes from one model of the day rather than from
      // its own die, which is what makes the wake time, the bedtime and the
      // derived Sleep agree — and what gives the diary's "Does sleep move
      // mood?" chart something to draw. See `dayModel`.
      const model = dayModel({
        date,
        rng,
        dipping: windingDown.has(date),
        returning: comingBack.has(date),
      });

      for (const def of dailyDefs) {
        const value = trackerValueFor(def, model, rng);
        if (value == null) continue;
        if (inTemplate.has(def.id)) {
          const next = setFrontmatter(body, def.id, value);
          // ONLY WHAT WAS WRITTEN COUNTS. `setFrontmatter` returns null when
          // the template has no such key, and recording it anyway would tell
          // `buildPatches` there are readings behind a chart there are not.
          if (next == null) continue;
          body = next;
          seeded.diaryTrackers.add(def.id);
          continue;
        }
        // A per-entry tracker: only after the day its owner started keeping it,
        // and not on every day even then.
        const plan = perEntry.get(def.id);
        if (!plan || date < plan.from || rng() >= plan.density) continue;
        // BOTH HALVES OR NEITHER. `addDirectiveToNote` writes the widget and
        // then seeds the property; a property with no widget is a value the
        // reader cannot see or change, and a widget with no property is an
        // empty control on a day that was logged.
        const withWidget = addTrackerDirective(body, `tracker:${def.id}`);
        if (withWidget == null) continue;
        const next = setFrontmatter(withWidget, def.id, value, { add: true });
        if (next == null) continue;
        body = next;
        seeded.diaryTrackers.add(def.id);
      }

      // THE PROSE GOES IN THE REGIONS, NOT UNDER THEM. The daily template's
      // directive block declares `note:focus`, `list:highlights`,
      // `list:challenges`, `note:log` and `tasks:todo`, and each is backed by an
      // `<!--chronoanvil:… -->` comment that the widget reads. An earlier version of
      // this loop appended `## Title` + a line to the end of the file: the widgets
      // then rendered a column of empty prompts with a stray heading below them,
      // which taught a reader opening the example vault that ChronoAnvil's daily note
      // does not work. Filling the regions is the difference between a vault that
      // demonstrates the plugin and one that sits beside it.
      //
      // NOT EVERY DAY GETS EVERY FIELD, and that is the point of the dice. A year
      // where all five regions are full every single day is a year nobody lived,
      // and it hides the thing an example should show — that a half-filled entry
      // is a normal entry. `log` is the one constant, because a day with nothing
      // written at all would leave a hole in the on-this-day and timeline views.
      //
      // AND THE DICE ARE LOADED BY THE DAY (4.83). A good day is likelier to
      // have something under Highlights and a hard one under Challenges, which
      // is both how people write and the only way the two lists stay distinct
      // once there are three hundred of them.
      const fill = (id, lines) => {
        const next = fillRegion(body, id, lines);
        if (next != null) body = next;
      };
      const tone = model.tone;
      fill("log", [pickFresh(rng, DIARY_LINES_BY_TONE[tone] ?? DIARY_LINES, recent.log)]);
      if (rng() < 0.75) fill("focus", [pickFresh(rng, DIARY_FOCUS, recent.focus)]);
      if (rng() < (tone === "good" ? 0.78 : tone === "hard" ? 0.4 : 0.6)) {
        const n = 1 + (tone === "good" && rng() < 0.5 ? 1 : 0);
        fill(
          "highlights",
          Array.from({ length: n }, () => pickFresh(rng, DIARY_HIGHLIGHTS, recent.highlight))
        );
      }
      if (rng() < (tone === "hard" ? 0.72 : tone === "good" ? 0.24 : 0.45)) {
        fill("challenges", [pickFresh(rng, DIARY_CHALLENGES, recent.challenge)]);
      }
      if (rng() < 0.5) {
        const n = 1 + Math.floor(rng() * 3);
        const lines = [];
        for (let i = 0; i < n; i++) {
          // A STANDING TASK EVERY SO OFTEN — one with a day and an hour on it,
          // which is the only kind the time grid can draw as a block.
          const standing = rng() < 0.22;
          const text = pickFresh(
            rng,
            standing ? DIARY_TASKS_STANDING : DIARY_TASKS,
            recent.task
          );
          const aged = taskAging({ date, today, rng, window: taskWindow, standing });
          if (!aged.done) noteOpenTask(date);
          lines.push(taskLine({ text, ...aged }));
        }
        fill("todo", lines);
      }
      // CAPTURES ARE A DIFFERENT GRAMMAR IN THE SAME KIND OF REGION, and the
      // sixth one this loop writes: stamped items, `HH:mm — text`, with no date
      // because the entry already is one. They matter beyond the entry — 4.62's
      // time grid draws them as a source, so a vault seeded without them shows
      // the grid's fourth track permanently empty on every single day.
      //
      // TIMES ASCEND, which the parser does not require and a reader does. A
      // capture list is the order the thoughts arrived in.
      if (rng() < 0.6) {
        // The first thought of the day arrives after the day starts, which the
        // model knows and a constant 7-to-10 did not: a capture stamped 07:15 on
        // a Sunday somebody woke at 09:20 draws on the time grid above the hour
        // they got up.
        let hour = Math.floor(model.wakeMin / 60) + Math.floor(rng() * 3);
        const n = 1 + Math.floor(rng() * 3);
        const lines = [];
        for (let i = 0; i < n; i++) {
          hour = Math.min(23, hour + Math.floor(rng() * 5));
          const time = `${String(hour).padStart(2, "0")}:${String(Math.floor(rng() * 12) * 5).padStart(2, "0")}`;
          lines.push(
            stampLine({
              time,
              text: pickFresh(rng, DIARY_CAPTURES, recent.capture),
              mins: rng() < 0.25 ? [10, 15, 30][Math.floor(rng() * 3)] : null,
            })
          );
        }
        fill("capture", logBlock(lines));
      }

      body = setGraphLinks(body, [h.week.name]);

      const dayPath = useTree
        ? `${entriesRoot}/${h.year.name}/${h.quarter.name}/${h.month.name}/${h.week.name}/Day-${date}.md`
        : `${paths.diaryDaily}/Day-${date}.md`;
      files.push({ path: dayPath, content: body });
    }

    // ── Period entries (Weekly, Monthly, Quarterly, Yearly) ────────────────
    const weeklyTpl =
      templates.get(`${paths.templatesDiary}/Weekly Entry.md`) ??
      templates.get(`${paths.templatesDiary}/Weekly.md`);
    const monthlyTpl =
      templates.get(`${paths.templatesDiary}/Monthly Entry.md`) ??
      templates.get(`${paths.templatesDiary}/Monthly.md`);
    const quarterlyTpl =
      templates.get(`${paths.templatesDiary}/Quarterly Entry.md`) ??
      templates.get(`${paths.templatesDiary}/Quarterly.md`);
    const yearlyTpl =
      templates.get(`${paths.templatesDiary}/Yearly Entry.md`) ??
      templates.get(`${paths.templatesDiary}/Yearly.md`);

    // Weeks
    if (weeklyTpl) {
      for (const [weekName, h] of seenWeeks) {
        let body = weeklyTpl.replace(
          /^week-start:.*$/m,
          `week-start: "${h.week.startIso}"`
        );
        const fill = (id, lines) => {
          const next = fillRegion(body, id, lines);
          if (next != null) body = next;
        };
        fill("focus", [pick(rng, PERIOD_CORPUS.weekly.focus)]);
        fill("highlights", uniquePicks(rng, PERIOD_CORPUS.weekly.highlights, 2));
        fill("challenges", uniquePicks(rng, PERIOD_CORPUS.weekly.challenges, 1));
        // `review` HAS BEEN IN THE CORPUS SINCE IT WAS WRITTEN AND NOTHING
        // ASKED FOR IT (4.83) — the same for the month's `reflections` and the
        // quarter's `objectives` below. `fillRegion` returns null on a template
        // that has no such region, which is why writing them costs nothing on a
        // vault whose templates do not, and fills three more widgets on the
        // vault whose templates do.
        fill("review", [pick(rng, PERIOD_CORPUS.weekly.review)]);
        fill(
          "todo",
          uniquePicks(rng, PERIOD_CORPUS.weekly.tasks, 2).map((text) => {
            // A WEEK'S TASKS ARE AGED FROM ITS OWN MONDAY. Fifty-seven weekly
            // notes carrying two tasks apiece put another forty-odd permanently
            // open items in the rollups, which is the same wall the daily
            // entries built and it was built one grain up.
            const aged = taskAging({ date: h.week.startIso, today, rng, window: taskWindow });
            if (!aged.done) noteOpenTask(h.week.startIso);
            return taskLine({ text, ...aged });
          })
        );
        body = setGraphLinks(body, [h.month.name]);

        const weekPath = useTree
          ? `${entriesRoot}/${h.year.name}/${h.quarter.name}/${h.month.name}/${h.week.name}/${weekName}.md`
          : `${paths.diaryWeekly ?? `${paths.diaryRoot}/Weekly`}/${weekName}.md`;
        files.push({ path: weekPath, content: body });
      }
    }

    // Months
    if (monthlyTpl) {
      for (const [monthName, h] of seenMonths) {
        let body = monthlyTpl.replace(
          /^month:.*$/m,
          `month: "${h.month.startIso.slice(0, 7)}"`
        );
        const fill = (id, lines) => {
          const next = fillRegion(body, id, lines);
          if (next != null) body = next;
        };
        fill("focus", [pick(rng, PERIOD_CORPUS.monthly.focus)]);
        fill("highlights", uniquePicks(rng, PERIOD_CORPUS.monthly.highlights, 2));
        fill("challenges", uniquePicks(rng, PERIOD_CORPUS.monthly.challenges, 1));
        fill("log", [pick(rng, PERIOD_CORPUS.monthly.summary)]);
        fill("review", [pick(rng, PERIOD_CORPUS.monthly.reflections)]);
        body = setGraphLinks(body, [h.quarter.name]);

        const monthPath = useTree
          ? `${entriesRoot}/${h.year.name}/${h.quarter.name}/${h.month.name}/${monthName}.md`
          : `${paths.diaryMonthly ?? `${paths.diaryRoot}/Monthly`}/${monthName}.md`;
        files.push({ path: monthPath, content: body });
      }
    }

    // Quarters
    if (quarterlyTpl) {
      for (const [quarterName, h] of seenQuarters) {
        let body = quarterlyTpl.replace(
          /^quarter-start:.*$/m,
          `quarter-start: "${h.quarter.startIso}"`
        );
        const fill = (id, lines) => {
          const next = fillRegion(body, id, lines);
          if (next != null) body = next;
        };
        fill("focus", [pick(rng, PERIOD_CORPUS.quarterly.focus)]);
        fill("highlights", uniquePicks(rng, PERIOD_CORPUS.quarterly.highlights, 2));
        fill("challenges", uniquePicks(rng, PERIOD_CORPUS.quarterly.challenges, 1));
        fill("todo", uniquePicks(rng, PERIOD_CORPUS.quarterly.objectives, 2).map((text) => {
          const aged = taskAging({ date: h.quarter.startIso, today, rng, window: taskWindow });
          if (!aged.done) noteOpenTask(h.quarter.startIso);
          return taskLine({ text, ...aged });
        }));
        fill("review", [pick(rng, PERIOD_CORPUS.quarterly.review)]);
        body = setGraphLinks(body, [h.year.name]);

        const quarterPath = useTree
          ? `${entriesRoot}/${h.year.name}/${h.quarter.name}/${quarterName}.md`
          : `${paths.diaryQuarterly ?? `${paths.diaryRoot}/Quarterly`}/${quarterName}.md`;
        files.push({ path: quarterPath, content: body });
      }
    }

    // Years
    if (yearlyTpl) {
      for (const [yearName, h] of seenYears) {
        let body = yearlyTpl.replace(
          /^year-start:.*$/m,
          `year-start: "${h.year.startIso}"`
        );
        const fill = (id, lines) => {
          const next = fillRegion(body, id, lines);
          if (next != null) body = next;
        };
        fill("focus", [pick(rng, PERIOD_CORPUS.yearly.focus)]);
        fill("highlights", uniquePicks(rng, PERIOD_CORPUS.yearly.highlights, 2));
        fill("log", [pick(rng, PERIOD_CORPUS.yearly.retrospective)]);
        fill("review", [pick(rng, PERIOD_CORPUS.yearly.retrospective)]);
        body = setGraphLinks(body, []); // Detached root of year tree

        const yearPath = useTree
          ? `${entriesRoot}/${h.year.name}/${yearName}.md`
          : `${paths.diaryYearly ?? `${paths.diaryRoot}/Yearly`}/${yearName}.md`;
        files.push({ path: yearPath, content: body });
      }
    }
  }

  return files;
}

// ── The second pass: patches ─────────────────────────────────────────────
//
// EVERYTHING ABOVE WRITES FILES THAT DO NOT EXIST. That was the whole tool
// until 4.62, and it cannot express what charts and logbooks need: the
// homepage, the five diary dashboards, the three logbook notes and the events
// note are all written by the SCAFFOLD, so by the time this runs they are
// already there — and a create-only seeder skips every one of them. A vault
// with a year of readings and not a single chart is the result, which is the
// exact failure the diary regions were fixed for one pass earlier.
//
// So a patch reads a file, transforms it, and hands back the new text — or
// hands back null, which means LEAVE IT ALONE. Null is not an error and is the
// common case on a second run: the fence already holds charts, the logbook
// already holds items, the events note already holds events. The rule the
// header states for files — it refuses to overwrite — becomes, for the notes
// the scaffold owns: it fills what is empty, and nothing else.
//
// `--force` widens that to "empty it first, then fill", which is why each
// transform takes the flag rather than the caller clearing things behind its
// back; the emptying and the filling are the same decision.

// A region's current contents, or null when the note has no such region.
export function readRegion(body, id) {
  const open = `<!--chronoanvil:${id}`;
  const at = body.indexOf(open);
  if (at === -1) return null;
  const from = body.indexOf("\n", at);
  const close = body.indexOf("-->", at);
  if (from === -1 || close === -1 || from > close) return "";
  return body.slice(from + 1, close).replace(/\s+$/, "");
}

// Strip the `chart:` lines from a fence, leaving its `header:` and anything else
// a reader put there — the `--force` half of `fillChartsFence`.
export function clearChartsFence(body) {
  const open = body.indexOf("```chronoanvil-charts");
  if (open === -1) return body;
  const bodyStart = body.indexOf("\n", open);
  const close = body.indexOf("\n```", bodyStart);
  if (bodyStart === -1 || close === -1) return body;
  const kept = body
    .slice(bodyStart + 1, close + 1)
    .split("\n")
    .filter((l) => !/^chart:/.test(l))
    .join("\n")
    .replace(/\s*$/, "");
  return `${body.slice(0, bodyStart + 1)}${kept ? `${kept}\n` : ""}${body.slice(close + 1)}`;
}

// Drop a `chronoanvil-events:` block — the key line and the indented list under it
// — so a forced run can write a fresh one. Bounded by the next unindented key,
// which is how a YAML block ends.
export function clearEvents(body, key = "chronoanvil-events") {
  const end = body.indexOf("\n---", 4);
  if (!body.startsWith("---\n") || end === -1) return body;
  const head = body.slice(0, end).split("\n");
  const at = head.findIndex((l) => l.startsWith(`${key}:`));
  if (at === -1) return body;
  let stop = at + 1;
  while (stop < head.length && /^\s+\S/.test(head[stop])) stop++;
  head.splice(at, stop - at, `${key}: []`);
  return head.join("\n") + body.slice(end);
}

// The folder-note rule: a folder's own note is the file inside it that carries
// the folder's name. Every diary dashboard is one, so their paths are DERIVED
// from `settings.paths` rather than spelled out here — a vault whose weekly
// folder is called something else still gets its charts.
export const folderNote = (folder) => `${folder}/${folder.split("/").pop()}.md`;

// Which trackers a chart may name.
//
// TWO LISTS HAVE TO AGREE and only their intersection is safe. `settings.trackers`
// is what the plugin will offer in the chart editor; the Daily template's
// `# chronoanvil:trackers:start` block is what actually gets WRITTEN into an entry's
// frontmatter. A tracker in the first but not the second — Energy and Focus, in
// the vault this was built against — is declared, chartable, and has no readings
// at all, so a chart naming it is a permanently empty tile. That is precisely the
// thing the corpus exists to prevent, so it is dropped and reported.
export function chartableTrackers({ settings, dailyTemplate, seeded = [] }) {
  const declared = new Set(
    (settings.trackers ?? [])
      .filter((t) => (t.surface?.kind ?? "") === "diary")
      .map((t) => t.id)
  );
  const written = templateTrackerKeys(dailyTemplate);
  if (!written.size && !seeded.length) return declared;
  // `seeded` IS THE THIRD LIST AND IT IS THE HONEST ONE (4.83). The two above
  // are what the vault DECLARES and what the template WRITES; a per-entry
  // tracker is in the first and not the second, and it used to be dropped for
  // it — correctly, while nothing seeded one. Now the run logs Energy and Focus
  // on the days it decided somebody logged them, so the question this answers
  // has changed from "will there be readings" to "are there readings", and the
  // set the caller passes is the answer.
  const have = new Set([...written, ...seeded]);
  return new Set([...declared].filter((id) => have.has(id)));
}

// ── The logbooks ─────────────────────────────────────────────────────────

// Stamped items for one region-backed logbook, over the days the vault is
// active on.
//
// THE THREE LOGBOOKS ARE NOT THE SAME SHAPE and seeding them alike would hide
// what they are for. A work log is dense and carries `[mins:: N]`, because it
// answers "where did the week go"; a focus log holds seven lines in thirteen
// months, because it changes when the work changes; a review list is half
// crossed off, because that is what a list of things to come back to looks like
// once you have come back to some of them. `LOGBOOK_CORPUS` states each of those
// as numbers, and this reads them.
export function logbookItems({ lines, mins = false, perDay = 0, spread = false, crossOff = 0 }, dates, rng) {
  const items = [];
  if (spread) {
    // One item every so often, in order, so the log reads as a sequence rather
    // than as a shuffle — a focus that moved on the 3rd and back on the 5th is
    // noise, not history.
    //
    // ACROSS THE WHOLE WINDOW, ENDING NEAR TODAY (4.83). Stepping by
    // `length / (lines + 1)` left a whole step of history after the last item,
    // which on a seven-line book is five weeks — so the vault's *Current focus*
    // logbook, whose entire subject is what you are working on NOW, was last
    // updated three months ago. The fractions below put the first item at the
    // start of the history and the last within a few days of the end, and the
    // jitter only ever moves an item EARLIER so the two ends stay put and the
    // order cannot invert.
    const span = Math.max(1, dates.length - 1);
    const drift = Math.max(1, Math.floor(span / (lines.length * 3)));
    lines.forEach((text, i) => {
      const frac = lines.length === 1 ? 1 : i / (lines.length - 1);
      const at = Math.round(frac * span) - (i === 0 ? 0 : Math.floor(rng() * drift));
      items.push({ date: dates[Math.min(span, Math.max(0, at))], text });
    });
  } else {
    for (const date of dates) {
      if (rng() >= perDay) continue;
      items.push({ date, text: pick(rng, lines) });
    }
  }
  return items
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map(({ date, text }) => {
      const hour = 9 + Math.floor(rng() * 9);
      const time = `${String(hour).padStart(2, "0")}:${String(Math.floor(rng() * 12) * 5).padStart(2, "0")}`;
      return stampLine({
        date,
        time,
        text,
        // A round 30 or 45 rather than 37: these are typed by a person reaching
        // for the nearest number, and `mins: null` — not 0 — is how the grammar
        // spells "a moment", which is what every item in the other two logs is.
        mins: mins && rng() < 0.8 ? [15, 25, 30, 45, 60, 90][Math.floor(rng() * 6)] : null,
        done: rng() < crossOff ? isoShift(date, 1 + Math.floor(rng() * 20)) : null,
      });
    });
}

// ── The journals' own charts (4.83) ──────────────────────────────────────
//
// A DIFFERENT FENCE READING A DIFFERENT STORE, and the reason the seeder wrote
// none of them until now. `chart:` plots a DIARY tracker over the diary's dated
// folders; `jchart:` plots a JOURNAL tracker over the dated notes under its host
// note. The corpus gives every workout a duration and every book a page count,
// and the vault drew neither, because the only surfaces the seeder knew about
// were the six that take the diary's fence.
//
// THE SECTION IS OPT-IN AND THAT IS WHY THE FENCE IS ABSENT. `journal-dashboard-
// sections.ts` explains it: the charts section is *"the fourth chart surface a
// journal note can carry and the first that reconciliation would push onto every
// journal in every vault"*, so it is offered rather than composed. Seeding it is
// exactly the tick a reader would make, and `holds` is what keeps it there
// afterwards — a section with content in it is not removed by reconciliation.
export const journalChartLine = (spec) => `jchart:${spec.key}:${spec.shape}:${spec.tracker}`;

const JOURNAL_CHARTS_FENCE = "```chronoanvil-journal-charts";

// Fill a journal-charts fence, appending the whole fence when the note has none
// — and refusing one that already holds specs, which is `fillChartsFence`'s rule
// for the diary's fence and holds here for the same reason: the manager rewrites
// this region, so anything in it is somebody's.
export function fillJournalChartsFence(body, lines, { title = "📊 Trends and statistics" } = {}) {
  const open = body.indexOf(JOURNAL_CHARTS_FENCE);
  if (open !== -1) {
    const bodyStart = body.indexOf("\n", open);
    if (bodyStart === -1) return null;
    const close = body.indexOf("\n```", bodyStart);
    if (close === -1) return null;
    const inner = body.slice(bodyStart + 1, close + 1);
    if (/^jchart:/m.test(inner)) return null;
    const kept = inner.replace(/\s*$/, "");
    return `${body.slice(0, bodyStart + 1)}${kept ? `${kept}\n` : ""}${lines.join("\n")}${body.slice(close)}`;
  }
  const fence = [JOURNAL_CHARTS_FENCE, `header:${title}`, ...lines, "```"].join("\n");
  // ABOVE THE GRAPH BLOCK, NOT AFTER IT. The hidden `%% chronoanvil-graph %%` pair
  // is the last thing in every scaffolded note and `setGraphLinks` finds it by
  // matching to the end of the file; a fence written under it would be read as
  // part of nothing and would move the block off the end.
  const at = body.indexOf("%% chronoanvil-graph %%");
  if (at === -1) return `${body.replace(/\s*$/, "")}\n\n${fence}\n`;
  return `${body.slice(0, at).replace(/\s*$/, "")}\n\n${fence}\n\n${body.slice(at)}`;
}

// The `jchart:` half of `--force`: drop the specs and keep the fence, its header
// and anything else a reader put in it.
export function clearJournalChartsFence(body) {
  const open = body.indexOf(JOURNAL_CHARTS_FENCE);
  if (open === -1) return body;
  const bodyStart = body.indexOf("\n", open);
  const close = body.indexOf("\n```", bodyStart);
  if (bodyStart === -1 || close === -1) return body;
  const kept = body
    .slice(bodyStart + 1, close + 1)
    .split("\n")
    .filter((l) => !/^jchart:/.test(l))
    .join("\n")
    .replace(/\s*$/, "");
  return `${body.slice(0, bodyStart + 1)}${kept ? `${kept}\n` : ""}${body.slice(close + 1)}`;
}

// Which of a journal's trackers are worth charting, most specific first.
//
// TWO FILTERS, AND THE SECOND IS THE ONE THAT MATTERS. `chartableType` in the
// plugin is the value question — a select's arbitrary strings are not a
// magnitude, so `status` is out however many notes carry it. `have` is the
// readings question, and it is the set the RUN actually wrote: a journal whose
// corpus never gives a workout a distance gets no distance chart, which is the
// same refusal `chartableTrackers` makes for the diary and the same reason.
//
// A journal's OWN quantities come before the ones every journal shares, because
// "how far am I running" is what somebody opens the Exercise dashboard to see
// and Confidence is what they would find on any of the four.
export function journalChartTrackers(settings, journalId, have) {
  const chartable = (t) => ["number", "scale", "time", "boolean"].includes(t.type ?? "");
  const mine = [];
  const shared = [];
  for (const t of settings.trackers ?? []) {
    if ((t.surface?.kind ?? "") !== "journal" || !chartable(t)) continue;
    if (!have.has(t.id)) continue;
    if (t.surface.typeId === journalId) mine.push(t.id);
    else if (t.surface.typeId == null) shared.push(t.id);
  }
  return [...mine, ...shared];
}

// ── The patches ──────────────────────────────────────────────────────────

// The key the logbook widget stores its items under — `LOGBOOK_NOTE_KEY` in
// src/core/constants.ts, spelled once here rather than at each site below.
const LOGBOOK_KEY = "logbook";

// Build every in-place edit the run would make, again without touching the disk.
//
// Each entry is `{ path, what, apply }`, where `apply(body, { force })` returns
// the new text or null for "already answered". The caller reports the two apart;
// to the vault they mean the same thing, which is that nothing was clobbered.
export function buildPatches({
  settings,
  templates,
  plans,
  dates,
  today,
  rng,
  warn,
  seeded = { diaryTrackers: new Set(), journalTrackers: new Map() },
}) {
  const paths = settings.paths;
  const out = [];
  const dailyTemplate = templates.get(`${paths.templatesDiary}/Daily.md`) ?? "";
  const usable = chartableTrackers({
    settings,
    dailyTemplate,
    seeded: [...(seeded.diaryTrackers ?? [])],
  });

  // Charts, one plan per surface, each surface's note derived from the paths.
  const dashboardsRoot = paths.diaryDashboards;
  const surfaces = [
    ["home", paths.home],
    ["diary", folderNote(paths.diaryRoot)],
    ["weekly", dashboardsRoot ? `${dashboardsRoot}/Weekly.md` : folderNote(paths.diaryWeekly)],
    ["monthly", dashboardsRoot ? `${dashboardsRoot}/Monthly.md` : folderNote(paths.diaryMonthly)],
    ["quarterly", dashboardsRoot ? `${dashboardsRoot}/Quarterly.md` : folderNote(paths.diaryQuarterly)],
    ["yearly", dashboardsRoot ? `${dashboardsRoot}/Yearly.md` : folderNote(paths.diaryYearly)],
    // The journals dashboard takes the diary's fence — see the corpus's own
    // note on why, and `journals-dashboard-sections.ts` for the ruling.
    ["journals", paths.journalsRoot ? folderNote(paths.journalsRoot) : null],
  ].filter(([, path]) => !!path);
  for (const [surface, path] of surfaces) {
    const plan = (plans.charts ?? {})[surface] ?? [];
    const keep = plan.filter((spec) => {
      const wanted = [spec.tracker, spec.y].filter(Boolean);
      const missing = wanted.filter((id) => !usable.has(id));
      if (missing.length) warn(`${surface} chart "${spec.key}": no readings for ${missing.join(", ")} — dropped`);
      return missing.length === 0;
    });
    if (!keep.length) continue;
    const lines = keep.map(chartLine);
    out.push({
      path,
      what: "charts",
      apply: (body, { force = false } = {}) => fillChartsFence(force ? clearChartsFence(body) : body, lines),
    });
  }

  // One journal dashboard's charts, per journal, out of what that journal's
  // notes were actually given readings for.
  //
  // TWO SHAPES AND NOT ONE. `journal-chart` answers "am I improving?" and
  // `journal-breakdown` answers "where am I weakest?", and the documentation is
  // explicit that only the second changes what you open next — so a dashboard
  // seeded with two trends and no ranking demonstrates half of what the pair is
  // for. The trend goes on the journal's own first quantity and the breakdown
  // on the same one, which is the comparison a reader can actually read: the
  // line above and the bars below are about one thing.
  for (const journal of settings.customJournals ?? []) {
    const have = (seeded.journalTrackers ?? new Map()).get(journal.id) ?? new Set();
    const ids = journalChartTrackers(settings, journal.id, have);
    if (!ids.length) {
      if (have.size) warn(`${journal.name}: no chartable tracker with readings — no journal charts`);
      continue;
    }
    const specs = [
      { key: "js1", shape: "trend", tracker: ids[0] },
      { key: "js2", shape: "breakdown", tracker: ids[0] },
      ...(ids[1] ? [{ key: "js3", shape: "trend", tracker: ids[1] }] : []),
    ];
    const lines = specs.map(journalChartLine);
    out.push({
      path: folderNote(journal.root),
      what: "journal charts",
      apply: (body, { force = false } = {}) =>
        fillJournalChartsFence(force ? clearJournalChartsFence(body) : body, lines),
    });
  }

  // The region-backed logbooks. The events-backed one — Meetings — is not
  // seeded here and does not need to be: it reads the events note, so it fills
  // itself the moment the patch below lands.
  for (const book of settings.logbooks ?? []) {
    if (book.source !== "region") continue;
    const plan = (plans.logbooks ?? {})[book.id];
    if (!plan) {
      warn(`no corpus for logbook "${book.id}" — left empty`);
      continue;
    }
    const lines = logbookItems(plan, dates, rng);
    out.push({
      path: book.path,
      what: "logbook",
      apply: (body, { force = false } = {}) => {
        // The region is created by the widget on first render, so a logbook
        // nobody has opened yet has none — appending an empty one is what
        // `writeNoteRegion` would have done, and is the difference between
        // seeding three logbooks and seeding none.
        const withRegion = ensureRegion(body, LOGBOOK_KEY);
        if (!force && (readRegion(withRegion, LOGBOOK_KEY) ?? "") !== "") return null;
        return fillRegion(withRegion, LOGBOOK_KEY, logBlock(lines));
      },
    });
  }

  // The events note, which four things read: the calendars, the upcoming-events
  // widget, the Meetings logbook and — new in 4.62 — the time grid.
  if (settings.eventsEnabled !== false && paths.events) {
    const events = resolveEvents(plans.events ?? [], today);
    if (events.length) {
      out.push({
        path: paths.events,
        what: "events",
        apply: (body, { force = false } = {}) => fillEvents(force ? clearEvents(body) : body, events),
      });
    }
  }

  return out;
}

// ── The run ──────────────────────────────────────────────────────────────

function readSettings(vault) {
  const path = join(vault, ".obsidian/plugins/chronoanvil/data.json");
  if (!existsSync(path)) {
    throw new Error(
      `No ChronoAnvil settings at ${path}.\n` +
        "Open the vault in Obsidian with the plugin enabled and run " +
        "'Set up / repair vault' first — this tool fills a scaffolded vault, " +
        "it does not create one."
    );
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadTemplates(vault, settings) {
  const out = new Map();
  const tplDiary = settings.paths.templatesDiary;
  const want = [
    `${tplDiary}/Daily.md`,
    `${tplDiary}/Weekly Entry.md`,
    `${tplDiary}/Weekly.md`,
    `${tplDiary}/Monthly Entry.md`,
    `${tplDiary}/Monthly.md`,
    `${tplDiary}/Quarterly Entry.md`,
    `${tplDiary}/Quarterly.md`,
    `${tplDiary}/Yearly Entry.md`,
    `${tplDiary}/Yearly.md`,
  ];
  for (const j of settings.customJournals ?? []) {
    for (const level of j.levels ?? []) want.push(`${j.templatesFolder}/${level.id}-index.md`);
    for (const kind of j.kinds ?? []) {
      const variant = (kind.templates ?? [])[0];
      want.push(`${j.templatesFolder}/${variant?.template ?? `${kind.id}.md`}`);
    }
  }
  for (const rel of want) {
    const abs = join(vault, rel);
    if (existsSync(abs)) out.set(rel, readFileSync(abs, "utf8"));
  }
  return out;
}

export function seedGraphGroups(vault, settings) {
  const configDir = join(vault, ".obsidian");
  const graphConfigPath = join(configDir, "graph.json");
  let existingRaw = null;
  if (existsSync(graphConfigPath)) {
    try {
      existingRaw = readFileSync(graphConfigPath, "utf8");
    } catch {
      existingRaw = null;
    }
  }

  const p = settings.paths;
  const cleanName = (path) => (path ? path.split("/").pop().replace(/\.md$/i, "") : "");
  const homeName = cleanName(p.home);
  const searchName = cleanName(p.search);
  const stagingName = cleanName(p.staging);
  const diaryRootName = cleanName(p.diaryRoot);
  const journalsRootName = cleanName(p.journalsRoot);
  const entriesPath = p.diaryEntries ?? `${p.diaryRoot ?? "02 - Diary"}/Entries`;

  const groups = [
    {
      query: `file:${homeName} OR file:${searchName} OR file:${stagingName}`,
      color: { a: 1, rgb: 14256948 },
    },
    {
      query: `file:"${diaryRootName}" OR file:"${journalsRootName}" OR path:"${p.diaryDashboards}"`,
      color: { a: 1, rgb: 14242639 },
    },
    { query: `path:"${entriesPath}"`, color: { a: 1, rgb: 5809500 } },
    {
      query: `path:"${p.journalsRoot}" -file:"${journalsRootName}"`,
      color: { a: 1, rgb: 4886484 },
    },
    { query: `path:"${p.logbooks}"`, color: { a: 1, rgb: 9138129 } },
    { query: `path:"${p.infrastructureRoot}"`, color: { a: 1, rgb: 9080728 } },
  ];

  let config = {};
  if (existingRaw) {
    try {
      config = JSON.parse(existingRaw);
    } catch {
      config = {};
    }
  }
  const existingGroups = Array.isArray(config.colorGroups) ? config.colorGroups : [];
  const userGroups = existingGroups.filter(
    (g) => !groups.some((ag) => ag.query === g.query)
  );
  config.colorGroups = [...groups, ...userGroups];
  config["collapse-color-groups"] = false;

  mkdirSync(configDir, { recursive: true });
  writeFileSync(graphConfigPath, JSON.stringify(config, null, 2) + "\n", "utf8");
}

function main(argv) {
  const args = argv.slice(2);
  const vault = args.find((a) => !a.startsWith("--"));
  const flag = (name, fallback) => {
    const at = args.indexOf(`--${name}`);
    return at === -1 ? fallback : args[at + 1];
  };
  const force = args.includes("--force");
  const dryRun = args.includes("--dry-run");

  if (!vault) {
    console.error(
      "Usage: node tools/seed-vault.mjs <vault> [--today YYYY-MM-DD] [--months 13]\n" +
        "                                [--seed 20260818] [--task-window 30]\n" +
        "                                [--force] [--dry-run]"
    );
    process.exit(2);
  }
  if (!existsSync(vault)) throw new Error(`No such vault: ${vault}`);

  const today = flag("today", new Date().toISOString().slice(0, 10));
  const months = Number(flag("months", 13));
  const seed = Number(flag("seed", 20260818));
  const taskWindow = Number(flag("task-window", OPEN_TASK_WINDOW));

  const settings = readSettings(vault);
  const templates = loadTemplates(vault, settings);
  const rng = mulberry32(seed);
  const dates = activeDays({ today, months, rng });

  const warnings = [];
  // What the first pass wrote, which the second pass needs: a chart is only
  // worth drawing over readings that exist, and only the run knows which do.
  const seeded = { diaryTrackers: new Set(), journalTrackers: new Map(), openTasks: [] };
  const files = buildPlan({
    settings,
    templates,
    corpus: CORPUS,
    dates,
    rng,
    today,
    taskWindow,
    seeded,
    warn: (m) => warnings.push(m),
  });

  const patches = buildPatches({
    settings,
    templates,
    plans: { charts: DIARY_CHARTS, logbooks: LOGBOOK_CORPUS, events: SEED_EVENTS },
    dates,
    today,
    rng,
    seeded,
    warn: (m) => warnings.push(m),
  });

  let written = 0;
  let skipped = 0;
  for (const file of files) {
    const abs = join(vault, file.path);
    if (existsSync(abs) && !force) {
      skipped++;
      continue;
    }
    if (!dryRun) {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, file.content, "utf8");
    }
    written++;
  }

  // The patches run after the files, and the order is not incidental: the
  // charts and the logbooks are only worth looking at once the entries they
  // read exist, and a dry run that reported them in either order would still be
  // reporting a vault nobody has.
  let patched = 0;
  let intact = 0;
  let absent = 0;
  for (const patch of patches) {
    const abs = join(vault, patch.path);
    if (!existsSync(abs)) {
      warnings.push(`${patch.path} is not there — ${patch.what} not seeded`);
      absent++;
      continue;
    }
    const body = readFileSync(abs, "utf8");
    const next = patch.apply(body, { force });
    if (next == null || next === body) {
      intact++;
      continue;
    }
    if (!dryRun) writeFileSync(abs, next, "utf8");
    patched++;
  }

  // Configure Obsidian Graph View color groups if not dry-run
  if (!dryRun) {
    try {
      seedGraphGroups(vault, settings);
    } catch (e) {
      warnings.push(`could not configure graph view groups: ${e.message}`);
    }
  }

  // ── The report ─────────────────────────────────────────────────────────
  const per = new Map();
  for (const f of files) {
    const top = f.path.split("/")[0];
    per.set(top, (per.get(top) ?? 0) + 1);
  }
  console.log(`\n${dryRun ? "Would seed" : "Seeded"} ${vault}`);
  for (const [top, n] of [...per].sort()) {
    console.log(`  ${String(n).padStart(4)}  ${top}`);
  }
  // ── WHAT THE REPORT IS FOR ─────────────────────────────────────────────
  //
  // The open-task line is here because the defect it reports was invisible for
  // twenty releases. "273 written, 0 warnings" is what a run that left two
  // hundred stale tasks in the vault said, and the only way anybody found out
  // was by opening the diary dashboard and scrolling. A generator should be
  // able to say what it made.
  const openDates = [...(seeded.openTasks ?? [])].sort();
  const oldestOpen = openDates[0] ?? null;
  const chartCount = patches.filter((p) => p.what.includes("charts")).length;
  console.log(
    `\n  ${dates.length} active days over ${months} months, ` +
      `longest streak ${longestStreak(dates)}` +
      `\n  ${openDates.length} tasks left open` +
      `${oldestOpen ? `, oldest ${oldestOpen} (${isoDaysBetween(oldestOpen, today)}d, window ${taskWindow}d)` : ""}` +
      `\n  trackers seeded: ${[...seeded.diaryTrackers].join(", ") || "none"}` +
      `${chartCount ? `\n  ${chartCount} chart fences planned` : ""}` +
      `\n  ${written} written, ${skipped} skipped${skipped && !force ? " (already there — pass --force to overwrite)" : ""}` +
      `\n  ${patched} ${dryRun ? "to patch" : "patched"}, ${intact} left alone` +
      `${intact && !force ? " (charts, logs or events already there — pass --force to replace)" : ""}` +
      `${absent ? `, ${absent} missing` : ""}` +
      `\n  seed ${seed}, ending ${today}\n`
  );
  for (const w of warnings) console.warn(`  ! ${w}`);
  if (warnings.length) {
    console.warn(
      `\n  ${warnings.length} warning(s). These mean the corpus and the vault's ` +
        `templates disagree — nothing was written for them.\n`
    );
  }
}

// Only when run, not when imported by the tests.
if (process.argv[1] && process.argv[1].endsWith("seed-vault.mjs")) {
  try {
    main(process.argv);
  } catch (e) {
    console.error(`\n  ${e.message}\n`);
    process.exit(1);
  }
}
