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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  CORPUS,
  DIARY_CHALLENGES,
  DIARY_FOCUS,
  DIARY_HIGHLIGHTS,
  DIARY_LINES,
  DIARY_TASKS,
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
      files.push({ path: `${paths.diaryDaily}/Day-${date}.md`, content: body });
    }
  }

  return files;
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
