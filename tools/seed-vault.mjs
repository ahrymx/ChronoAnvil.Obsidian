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
// The vault a stranger downloads to find out what Almanac is. Every widget in
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
// no items, an `almanac-events: []` that holds no events — and declines any of
// them that is already answered, which is the same rule as above with the same
// `--force` escape. See `buildPatches` for why each refusal is where it is.

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
  DIARY_TASKS,
  LOGBOOK_CORPUS,
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
// puts ```almanac blocks between prose sections and swallowing one would delete
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

// Put content inside an `<!--almanac:id … -->` region.
//
// The regions are how Almanac stores a note's tasks, recall cards and
// attachments — the widget reads the comment, not the prose — so a seeded task
// that went in as a plain markdown checkbox would render nowhere and count for
// nothing. `- ( )` is the marker `parseTaskLine` reads; a native `- [ ]` is not.
export function fillRegion(body, id, lines) {
  const open = `<!--almanac:${id}`;
  const at = body.indexOf(open);
  if (at === -1) return null;
  const close = body.indexOf("-->", at);
  if (close === -1) return null;
  const text = lines.length ? `\n${lines.join("\n")}\n` : "\n";
  return body.slice(0, at + open.length) + text + body.slice(close);
}

export const taskLine = (t) => `- (${t.done ? "x" : " "}) ${t.text}`;

// A recall card. `question :: answer`, spaced, which is `recall.ts`'s format and
// NOT the task format one line above it.
//
// Both live in `<!--almanac:… -->` regions and they look alike from a distance,
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
  if (body.includes(`<!--almanac:${id}`)) return body;
  const trimmed = body.replace(/\s*$/, "");
  const sep = trimmed.length === 0 ? "" : "\n\n";
  return `${trimmed}${sep}<!--almanac:${id}\n-->\n`;
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

// Put chart directives inside a note's ```almanac-charts fence.
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
  const open = body.indexOf("```almanac-charts");
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
export function eventsYaml(events, key = "almanac-events") {
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

// Replace an EMPTY `almanac-events: []` with a list, and refuse a note that
// already holds events — somebody's own birthdays are not this tool's to
// overwrite, and `[]` is the scaffold's own way of saying "none yet".
export function fillEvents(body, events, key = "almanac-events") {
  const end = body.indexOf("\n---", 4);
  if (!body.startsWith("---\n") || end === -1) return null;
  const head = body.slice(0, end).split("\n");
  const at = head.findIndex((l) => l.startsWith(`${key}:`));
  if (at === -1) return null;
  // EMPTY MEANS TWO THINGS AND NEITHER OF THEM IS "the key line looks short".
  // `almanac-events:` with nothing after it is also the FIRST LINE of a filled
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

// ── The plan ─────────────────────────────────────────────────────────────

// Build every file the run would write, without touching the disk.
//
// A PLAN AND THEN A WRITE, which is the shape `repair-plan.ts` uses in the
// plugin and for the same reason: the interesting failures here — a template
// that will not fill, a corpus section the template does not have — are
// discoverable before anything has been created, and a run that stops halfway
// through leaves a vault that is neither empty nor seeded.
export function buildPlan({ settings, templates, corpus, dates, rng, warn }) {
  const files = [];
  const paths = settings.paths;
  const journals = settings.customJournals ?? [];
  let cursor = 0;
  // Dates are handed out in order across the whole vault, so a note's date and
  // the diary entry beside it belong to the same day — a heatmap where the
  // journals and the diary disagree about when the year was busy is worse than
  // one with less in it.
  const nextDate = () => dates[cursor++ % dates.length];

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
        for (const [key, value] of Object.entries(values)) {
          const next = setFrontmatter(body, key, value, { add: loggable.has(key) });
          if (next == null) warn(`${note.title}: nothing declares "${key}"`);
          else body = next;
        }

        for (const [heading, lines] of Object.entries(note.sections ?? {})) {
          const next = fillSection(body, heading, lines);
          if (next == null) warn(`${note.title}: template has no "## ${heading}"`);
          else body = next;
        }
        if (note.tasks?.length) {
          const next = fillRegion(body, "tasks", note.tasks.map(taskLine));
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
    for (const date of dates) {
      let body = daily.replace(/^journal-date:.*$/m, `journal-date: "${date}"`);
      // The frontmatter tracker block is what the daily's widgets read. Values
      // are plausible rather than uniform: a mood that is 4 every day makes the
      // mood chart a straight line, which shows the widget and hides the point.
      const mood = 2 + Math.floor(rng() * 4);
      const wake = 6 + Math.floor(rng() * 3);
      const bed = 22 + Math.floor(rng() * 2);
      for (const [key, value] of [
        ["Mood", mood],
        ["Wake-Up", `${String(wake).padStart(2, "0")}:${rng() < 0.5 ? "00" : "30"}`],
        ["Bedtime", `${String(bed).padStart(2, "0")}:${rng() < 0.5 ? "15" : "45"}`],
        ["Sleep", (6 + rng() * 2.5).toFixed(1)],
      ]) {
        const next = setFrontmatter(body, key, value);
        if (next != null) body = next;
      }
      // THE PROSE GOES IN THE REGIONS, NOT UNDER THEM. The daily template's
      // directive block declares `note:focus`, `list:highlights`,
      // `list:challenges`, `note:log` and `tasks:todo`, and each is backed by an
      // `<!--almanac:… -->` comment that the widget reads. An earlier version of
      // this loop appended `## Title` + a line to the end of the file: the widgets
      // then rendered a column of empty prompts with a stray heading below them,
      // which taught a reader opening the example vault that Almanac's daily note
      // does not work. Filling the regions is the difference between a vault that
      // demonstrates the plugin and one that sits beside it.
      //
      // NOT EVERY DAY GETS EVERY FIELD, and that is the point of the dice. A year
      // where all five regions are full every single day is a year nobody lived,
      // and it hides the thing an example should show — that a half-filled entry
      // is a normal entry. `log` is the one constant, because a day with nothing
      // written at all would leave a hole in the on-this-day and timeline views.
      const fill = (id, lines) => {
        const next = fillRegion(body, id, lines);
        if (next != null) body = next;
      };
      fill("log", [pick(rng, DIARY_LINES)]);
      if (rng() < 0.75) fill("focus", [pick(rng, DIARY_FOCUS)]);
      if (rng() < 0.6) fill("highlights", uniquePicks(rng, DIARY_HIGHLIGHTS, 1 + Math.floor(rng() * 2)));
      if (rng() < 0.45) fill("challenges", uniquePicks(rng, DIARY_CHALLENGES, 1));
      if (rng() < 0.5) {
        const n = 1 + Math.floor(rng() * 3);
        fill(
          "todo",
          uniquePicks(rng, DIARY_TASKS, n).map((text) => taskLine({ text, done: rng() < 0.55 }))
        );
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
        let hour = 7 + Math.floor(rng() * 4);
        fill(
          "capture",
          logBlock(
            uniquePicks(rng, DIARY_CAPTURES, 1 + Math.floor(rng() * 3)).map((text) => {
              hour = Math.min(23, hour + Math.floor(rng() * 5));
              const time = `${String(hour).padStart(2, "0")}:${String(Math.floor(rng() * 12) * 5).padStart(2, "0")}`;
              return stampLine({ time, text, mins: rng() < 0.25 ? [10, 15, 30][Math.floor(rng() * 3)] : null });
            })
          )
        );
      }
      files.push({ path: `${paths.diaryDaily}/Day-${date}.md`, content: body });
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
  const open = `<!--almanac:${id}`;
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
  const open = body.indexOf("```almanac-charts");
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

// Drop an `almanac-events:` block — the key line and the indented list under it
// — so a forced run can write a fresh one. Bounded by the next unindented key,
// which is how a YAML block ends.
export function clearEvents(body, key = "almanac-events") {
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
// `# almanac:trackers:start` block is what actually gets WRITTEN into an entry's
// frontmatter. A tracker in the first but not the second — Energy and Focus, in
// the vault this was built against — is declared, chartable, and has no readings
// at all, so a chart naming it is a permanently empty tile. That is precisely the
// thing the corpus exists to prevent, so it is dropped and reported.
export function chartableTrackers({ settings, dailyTemplate }) {
  const declared = new Set(
    (settings.trackers ?? [])
      .filter((t) => (t.surface?.kind ?? "") === "diary")
      .map((t) => t.id)
  );
  const front = /# almanac:trackers:start\n([\s\S]*?)\n# almanac:trackers:end/.exec(dailyTemplate ?? "");
  if (!front) return declared;
  const written = new Set(
    front[1]
      .split("\n")
      .map((l) => /^([^:#]+):/.exec(l)?.[1]?.trim())
      .filter(Boolean)
  );
  return new Set([...declared].filter((id) => written.has(id)));
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
    const step = Math.max(1, Math.floor(dates.length / (lines.length + 1)));
    lines.forEach((text, i) => {
      const date = dates[Math.min(dates.length - 1, i * step + Math.floor(rng() * step))];
      items.push({ date, text });
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

// ── The patches ──────────────────────────────────────────────────────────

// The key the logbook widget stores its items under — `LOGBOOK_NOTE_KEY` in
// src/core/constants.ts, spelled once here rather than at each site below.
const LOGBOOK_KEY = "logbook";

// Build every in-place edit the run would make, again without touching the disk.
//
// Each entry is `{ path, what, apply }`, where `apply(body, { force })` returns
// the new text or null for "already answered". The caller reports the two apart;
// to the vault they mean the same thing, which is that nothing was clobbered.
export function buildPatches({ settings, templates, plans, dates, today, rng, warn }) {
  const paths = settings.paths;
  const out = [];
  const dailyTemplate = templates.get(`${paths.templatesDiary}/Daily.md`) ?? "";
  const usable = chartableTrackers({ settings, dailyTemplate });

  // Charts, one plan per surface, each surface's note derived from the paths.
  const surfaces = [
    ["home", paths.home],
    ["diary", folderNote(paths.diaryRoot)],
    ["weekly", folderNote(paths.diaryWeekly)],
    ["monthly", folderNote(paths.diaryMonthly)],
    ["quarterly", folderNote(paths.diaryQuarterly)],
    ["yearly", folderNote(paths.diaryYearly)],
  ];
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
  const path = join(vault, ".obsidian/plugins/ahrymx.almanac/data.json");
  if (!existsSync(path)) {
    throw new Error(
      `No Almanac settings at ${path}.\n` +
        "Open the vault in Obsidian with the plugin enabled and run " +
        "'Set up / repair vault' first — this tool fills a scaffolded vault, " +
        "it does not create one."
    );
  }
  return JSON.parse(readFileSync(path, "utf8"));
}

function loadTemplates(vault, settings) {
  const out = new Map();
  const want = [`${settings.paths.templatesDiary}/Daily.md`];
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
        "                                [--seed 20260818] [--force] [--dry-run]"
    );
    process.exit(2);
  }
  if (!existsSync(vault)) throw new Error(`No such vault: ${vault}`);

  const today = flag("today", new Date().toISOString().slice(0, 10));
  const months = Number(flag("months", 13));
  const seed = Number(flag("seed", 20260818));

  const settings = readSettings(vault);
  const templates = loadTemplates(vault, settings);
  const rng = mulberry32(seed);
  const dates = activeDays({ today, months, rng });

  const warnings = [];
  const files = buildPlan({
    settings,
    templates,
    corpus: CORPUS,
    dates,
    rng,
    warn: (m) => warnings.push(m),
  });

  const patches = buildPatches({
    settings,
    templates,
    plans: { charts: DIARY_CHARTS, logbooks: LOGBOOK_CORPUS, events: SEED_EVENTS },
    dates,
    today,
    rng,
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
  console.log(
    `\n  ${dates.length} active days over ${months} months, ` +
      `longest streak ${longestStreak(dates)}` +
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
