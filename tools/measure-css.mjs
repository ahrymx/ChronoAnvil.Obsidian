// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// ROADMAP-4.0.1 §4: how much of styles/ has no source that could produce it.
//
// A class name in the stylesheet is live if src/ can produce it. Most are
// produced as a literal string, which a substring search settles. The rest are
// built by interpolation — `cal-tint-${eventColor(def)}` — and those cannot be
// found by searching for the finished name.
//
// WHY THE INTERPOLATED CASES ARE ENUMERATED RATHER THAN PREFIX-MATCHED
//
// The obvious shortcut is to treat any class starting with a known prefix as
// live. It is wrong in the direction that matters: a prefix absorbs its own
// neighbours. `job-` covers the four `job-${unit}` values, and it also covered
// `job-eyebrow`, `job-eyebrow-icon` and `job-nav` — three rules left behind by
// the 3.4 band cleanup, hidden by the prefix that was supposed to explain four
// others. The first version of this tool carried a hardcoded exception for two
// of the three, which is the measurement knowing its answer in advance.
//
// So each interpolation site is listed with the CLOSED set of values its
// variable can take, traced to the type or const that bounds it. A class
// matching a prefix but not its enumerated suffix is reported, not absorbed.
//
// Where the variable is genuinely unbounded — a section key the reader named,
// a tracker id — the prefix is listed under OPEN with the reason. Those cannot
// be checked by this tool, and saying so is more useful than pretending the
// prefix is an answer.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

// Classes Obsidian or the DOM supplies. Nothing in src/ constructs them.
const BUILTINS = new Set([
  "is-mobile",
  "theme-light",
  "setting-item-control",
  "setting-item-info",
  "svg-icon",
]);

// src/events/events.ts: EVENT_COLORS
const EVENT_COLORS = ["red", "amber", "green", "teal", "blue", "purple", "pink", "grey"];

const range = (n) => Array.from({ length: n }, (_, i) => String(i + 1));

// prefix -> the complete set of suffixes the interpolated variable can take.
const ENUMERATED = [
  // `job-${unit}` — src/diary/calendar.ts, OverviewUnit
  { prefix: "job-", suffixes: ["week", "month", "quarter", "year"] },

  // `journal-${type}` — src/ui/widgets/controls.ts, buildTimeOrDate
  { prefix: "journal-", suffixes: ["time", "date"] },

  // `is-${span}` ChartSpan, `is-${p.tone}` list-row tone, `is-${grade}` RecallGrade
  { prefix: "is-", suffixes: ["wide", "tall", "large", "on", "off", "muted", "got", "missed"] },

  // `ca-act-${activityBucket(...)}` — src/core/util.ts, clamped to 1..4
  { prefix: "ca-act-", suffixes: range(4) },
  // `ca-heat-${moodBucket(...)}` and `cal-mood-${bucket}` — clamped to 1..5
  { prefix: "ca-heat-", suffixes: range(5) },
  { prefix: "cal-mood-", suffixes: range(5) },
  // `journal-sec-l${opts.level}` — src/ui/section-frame.ts
  { prefix: "journal-sec-l", suffixes: range(2) },

  // `${...}-${eventColor(def)}` — src/events/events.ts, COLOR_SET
  { prefix: "ca-color-", suffixes: EVENT_COLORS },
  { prefix: "ca-ev-chip-", suffixes: EVENT_COLORS },
  { prefix: "cal-badge-", suffixes: EVENT_COLORS },
  { prefix: "cal-tint-", suffixes: EVENT_COLORS },
  // cal-bar- takes a colour AND a span position — src/diary/calendar.ts
  { prefix: "cal-bar-", suffixes: [...EVENT_COLORS, "solo", "start", "mid", "end"] },

  // `ca-tpl-op-${op.kind}` — src/ui/section-editor.ts
  { prefix: "ca-tpl-op-", suffixes: ["add", "remove", "keep", "move", "extend", "foreign"] },
  // `ca-kind-${tone}` — src/journals/kind-change.ts, called with two values
  { prefix: "ca-kind-", suffixes: ["add", "remove"] },
  // `journal-task-${row.task.priority}` — src/ui/tasks.ts, TaskPriority
  { prefix: "journal-task-", suffixes: ["high", "normal", "low"] },
  // `journal-attach-chip--${item.kind}` — src/ui/widgets/attachment-widgets.ts
  { prefix: "journal-attach-chip--", suffixes: ["text", "link", "image"] },
  // `ca-titlebar-${area}` and `journal-links-card-${area}` — VaultArea
  { prefix: "ca-titlebar-", suffixes: ["diary", "journals"] },
  { prefix: "journal-links-card-", suffixes: ["diary", "journals"] },
];

// Prefixes whose suffix comes from reader-supplied data. Unbounded by
// construction, so a class matching one cannot be called dead by this tool.
const OPEN = [
  { prefix: "journal-attach--", why: "section key — a reader names the shelf" },
  { prefix: "journal-list--", why: "section key — a reader names the list" },
  { prefix: "journal-note--", why: "section key — a reader names the note field" },
  { prefix: "level-", why: "heading depth, unbounded" },
  { prefix: "bridge-", why: "tracker id, reader-defined" },
];

const byLongestPrefix = (a, b) => b.prefix.length - a.prefix.length;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(path.join(dir, e.name))
      : e.name.endsWith(".ts")
        ? [path.join(dir, e.name)]
        : []
  );
}

export function measureCSS() {
  const cssFiles = readdirSync("styles")
    .filter((f) => f.endsWith(".css"))
    .map((f) => path.join("styles", f));

  const allCss = cssFiles
    .map((f) => readFileSync(f, "utf8"))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  const selectors = new Set();
  const pattern = /\.([a-zA-Z][a-zA-Z0-9_-]*)/g;
  let m;
  while ((m = pattern.exec(allCss)) !== null) selectors.add(m[1]);

  const src = walk("src")
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");

  const enumerated = [...ENUMERATED].sort(byLongestPrefix);
  const open = [...OPEN].sort(byLongestPrefix);

  const direct = [];
  const interpolated = [];
  const openEnded = [];
  const builtins = [];
  const unaccounted = [];

  for (const cls of Array.from(selectors).sort()) {
    if (src.includes(cls)) {
      direct.push(cls);
      continue;
    }
    if (BUILTINS.has(cls)) {
      builtins.push(cls);
      continue;
    }

    const openHit = open.find((o) => cls.startsWith(o.prefix) && cls !== o.prefix);
    if (openHit) {
      openEnded.push(cls);
      continue;
    }

    // A prefix only explains a class whose suffix is in its enumerated set.
    // Matching the prefix and missing the set is exactly the case worth
    // reporting, so it falls through to unaccounted rather than being absorbed.
    const enumHit = enumerated.find((e) =>
      e.suffixes.some((s) => cls === e.prefix + s)
    );
    if (enumHit) {
      interpolated.push(cls);
      continue;
    }

    unaccounted.push(cls);
  }

  return {
    total: selectors.size,
    direct,
    interpolated,
    openEnded,
    builtins,
    unaccounted,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = measureCSS();
  const pct = (n) => ((n / r.total) * 100).toFixed(1);
  console.log(`Class selectors in styles/:        ${r.total}`);
  console.log(`  literal in src/:                 ${r.direct.length}`);
  console.log(`  built by enumerated interpolation: ${r.interpolated.length}`);
  console.log(`  built from reader-supplied keys:   ${r.openEnded.length}`);
  console.log(`  Obsidian / DOM built-ins:          ${r.builtins.length}`);
  console.log(`  UNACCOUNTED:                       ${r.unaccounted.length} (${pct(r.unaccounted.length)}%)`);
  if (r.unaccounted.length) {
    console.log("\nNo source in src/ could produce these:");
    for (const c of r.unaccounted) console.log(`  .${c}`);
  }
}
