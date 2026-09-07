// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The 2.56 scoreboard, executable.
//
//   node tools/surface-count.mjs
//
// §0 of ROADMAP-2.56.md lists five things that can be counted before and
// after. They were counted by hand to write the plan, which is fine for a plan
// and useless for a release: the whole argument of §9 is that this work fails
// by stopping half way, and "are we half way" is exactly the question a hand
// count cannot answer twice the same way.
//
// So the scoreboard is a script. It prints the five numbers and the targets,
// and it is deliberately dumb — greps over the source, no AST, no config. It
// reports; it does not gate. The things that must not regress have tests
// (test/section-frame.test.ts, test/appearance.test.ts); this is for reading
// progress across a release, which is a different job from refusing a commit.

import { readdirSync, readFileSync } from "node:fs";

const src = readdirSync("src").filter((f) => f.endsWith(".ts"));
const read = (f) => readFileSync(`src/${f}`, "utf8");
// Comments are a record of what changed, not code. Same distinction
// vocabulary.test.ts draws.
const code = (f) =>
  read(f)
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
const css = readFileSync("styles.css", "utf8");

const rows = [];
const row = (name, now, target) => rows.push({ name, now, target });

// 1 ── header-shaped CSS components ───────────────────────────────────────
//
// END-ANCHORED, and the plan's number was not. §1.1 said 39; writing this
// script produced 41 on a tree that had just REMOVED two implementations,
// because `.journal-header-glyph` and `.journal-header-count` matched a loose
// `-header` pattern. Those are PARTS of a header, not headers. Counting parts
// as components makes the metric go up every time the frame gains a slot,
// which is the opposite of what it is for. The honest figure is 32 roots.
const headerish = new Set(
  [
    ...css.matchAll(
      /^\.([a-z-]*(?:-head|-header|-bar|-titlerow|-toolbar))(?:[^a-z-]|$)/gm
    ),
  ].map((m) => m[1])
);
row("Header component roots", headerish.size, "1 + editor chrome");

// 2 ── class-prefix families ──────────────────────────────────────────────
const prefixes = new Set(
  [...css.matchAll(/^\.([a-z]+)-/gm)].map((m) => m[1])
);
row("CSS class-prefix families", prefixes.size, 3);

// 3 ── note-surface lists drawn with the shared row ───────────────────────
// `calendar.ts` was in this list and should not have been: its `<table>`
// elements are the month GRID — seven columns of dates — which is a table in
// the sense the element was invented for and is not a list of records. Third
// guess in this file corrected by the work (see also the header-parts count and
// the banner list). A metric written from a guess about the codebase measures
// the guess.
//
// `widgets.ts` is still counted and still at zero. Its rows are the task, path
// and recall widgets: editable, with checkboxes and controls, which is a
// different object from "a named thing and some values" and needs its own
// argument rather than being swept in.
const NOTE_SURFACES = ["widgets.ts", "tables.ts"];
const rowUsers = NOTE_SURFACES.filter((f) =>
  code(f).includes("createListRow(")
).length;
row(
  `Note-surface files using createListRow (of ${NOTE_SURFACES.length})`,
  rowUsers,
  NOTE_SURFACES.length
);

// 4 ── banners carrying the overflow menu ─────────────────────────────────
//
// The list was a guess when this script was written and one of the three was
// wrong: `diary-header.ts` is not a banner. It is the greeting band inside the
// calendar card — a view over pure helpers, with no note of its own to act on
// and therefore nothing for a menu to offer. There are TWO entry banners.
//
// The test is `overflowButton(`, not `new Menu(`, which is the second time
// this scoreboard has measured the wrong thing by accident: the menus moved
// behind a shared button in 2.56.4 and this row promptly reported 1 -> 0 on
// the patch that fixed it. A metric that reads an implementation detail will
// keep doing that. What "has an overflow" means is that it calls the control.
const BANNERS = ["study-header.ts", "entryheader.ts"];
const withMenu = BANNERS.filter((f) =>
  code(f).includes("overflowButton(")
).length;
row(
  `Entry banners with an overflow menu (of ${BANNERS.length})`,
  withMenu,
  BANNERS.length
);

// 5 ── editors on the shared window frame ────────────────────────────────
//
// §5.2's list. `PromptModal`, `ConfirmModal` and `NewNoteModal` are the generic
// primitives in modals.ts and stay on `Modal` — they are not editors and have
// no head/body/footer to share. These five are.
const EDITORS = [
  ["journal-chart-ui.ts", "JournalChartEditModal"],
  ["event-ui.ts", "EventEditModal"],
  ["kind-change.ts", "KindChangeModal"],
  ["tracker-picker.ts", "TrackerPickerModal"],
  ["capture.ts", "CaptureModal"],
];
const framed = EDITORS.filter(([f, cls]) => {
  try {
    return new RegExp(`class ${cls} extends (Stepped)?EditorModal`).test(code(f));
  } catch {
    return false;
  }
}).length;
row(`Editors on the shared frame (of ${EDITORS.length})`, framed, EDITORS.length);

// 6 ── hand-built section headers ─────────────────────────────────────────
// Not in §0's table, but it is the number patches 2-4 actually move, and the
// one that says whether this release stopped half way.
const handBuilt = src.filter(
  (f) => f !== "section-frame.ts" && code(f).includes("cls: `journal-header-bar")
).length;
row("Files still hand-building a header bar", handBuilt, 0);

const w = Math.max(...rows.map((r) => r.name.length));
console.log("\nChronoAnvil 2.56 — surface scoreboard\n");
for (const r of rows) {
  console.log(
    `  ${r.name.padEnd(w)}  ${String(r.now).padStart(5)}   -> ${r.target}`
  );
}
console.log(
  "\n  Counted by grep. See ROADMAP-2.56.md §0 for what each one is for.\n"
);
