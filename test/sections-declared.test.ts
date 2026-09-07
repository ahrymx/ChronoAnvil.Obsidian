// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// How much of this plugin's section catalogue is DATA.
//
// WHY THIS FILE EXISTS, AND IT IS A MEASUREMENT RATHER THAN A RULE
//
// 5.22–5.24 merged four section types into one, four parsers into one walk and
// thirteen declarations of the shared reconciler rules into eight. What that
// left is a `Section` whose every member a catalogue still writes by hand: a
// `render` closure composing two literal lines, a `questions` closure returning
// one form toggle, a `locate` closure calling `String.search` on a literal
// pattern. Three closures per entry, sixty-odd entries, all saying the same
// thing in the same shape.
//
// `sectionOf` (`core/sections.ts`) takes the shape as data — a `DeclaredSection`
// — and synthesises the three. The question this file asks, and asks in a way
// that cannot quietly stop being true, is HOW MANY entries fit through it.
//
// THAT NUMBER IS THE DISTANCE TO AN API, and there is no other honest way to
// know it. A user-defined section can only ever be data: settings hold JSON,
// `registry-mirror.ts` copies JSON, and a reader typing into a settings box is
// not writing a closure. So every entry that still needs one is an entry whose
// shape a reader could not have asked for — and the eventual answer to "can a
// reader define a section?" is decided here, one conversion at a time, rather
// than by a design document written in advance.
//
// A FLOOR, NOT AN EQUALITY, in `dead-code.test.ts`' idiom. Converting one more
// catalogue entry must never turn the suite red; un-converting one must. Raise
// the numbers when they move, and only ever upward.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./sources";

// The catalogue files, and what each has declared as of this release.
//
// PER FILE RATHER THAN ONE TOTAL, because the total hides the thing worth
// seeing: `home-sections.ts` is seven of ten and `diary-sections.ts` is none of
// seven, and those two facts have different causes and different fixes.
const FLOOR: Record<string, number> = {
  "src/core/widget-sections.ts": 1,
  "src/diary/diary-dashboard-sections.ts": 4,
  "src/diary/home-sections.ts": 7,
  "src/diary/logbook-sections.ts": 2,
  "src/diary/search-sections.ts": 3,
  "src/journals/journal-dashboard-sections.ts": 4,
  "src/journals/journals-dashboard-sections.ts": 1,
};

const TOTAL = 22;

const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

// Every `sectionOf({ … })` argument in a file, brace-matched.
//
// TEXT RATHER THAN A RUNTIME COUNT, and deliberately: what is being measured is
// what the CATALOGUE WROTE. Two of these files build their entries from a
// runtime list — a logbook per definition, a widget instance per id — so a live
// count would report a vault's contents rather than a codebase's shape, and the
// number would move without anybody converting anything.
function declarations(text: string): string[] {
  const out: string[] = [];
  const marker = "sectionOf({";
  for (let at = text.indexOf(marker); at >= 0; at = text.indexOf(marker, at + 1)) {
    let depth = 0;
    let end = at + marker.length - 1;
    for (; end < text.length; end += 1) {
      if (text[end] === "{") depth += 1;
      else if (text[end] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push(text.slice(at + marker.length - 1, end + 1));
  }
  return out;
}

describe("sections declared as data", () => {
  it("every catalogue has declared at least what it had", () => {
    for (const [file, floor] of Object.entries(FLOOR)) {
      expect(declarations(read(file)).length, file).toBeGreaterThanOrEqual(floor);
    }
  });

  it("the tree as a whole has not gone backwards", () => {
    const total = Object.keys(FLOOR).reduce(
      (n, file) => n + declarations(read(file)).length,
      0
    );
    expect(total).toBeGreaterThanOrEqual(TOTAL);
  });

  // ── THE PROPERTY THE COUNT IS ONLY WORTH ANYTHING WITH ──────────────────
  //
  // A `DeclaredSection` that may hold a closure measures nothing: every entry
  // in the tree would convert, the count would read sixty-eight, and not one of
  // them would be writable into `data.json`. So the two checks below are what
  // make the number above mean "a reader could have typed this".
  it("declares no closures", () => {
    for (const file of Object.keys(FLOOR)) {
      for (const decl of declarations(read(file))) {
        expect(decl, `${file}: ${decl.slice(0, 60)}`).not.toContain("=>");
      }
    }
  });

  it("the declaration type holds no functions", () => {
    const src = read("src/core/sections.ts");
    const at = src.indexOf("export interface DeclaredFields {");
    expect(at).toBeGreaterThan(0);
    const end = src.indexOf("\n}", at);
    expect(src.slice(at, end)).not.toContain("=>");
  });

  // A declaration widened at the call site is not a declaration.
  //
  // `{ ...sectionOf({ … }), applies: (ctx) => … }` typechecks, reads well, and
  // would let every catalogue in the tree join the count while changing nothing
  // about what a reader could define. `DIARY_SECTIONS` is the catalogue that
  // would have taken it — `DiarySection` requires `applies` and narrows `band`,
  // so its one otherwise-convertible entry (`time-grid`) cannot go through
  // `sectionOf` alone — and leaving it out is what keeps the seven-of-seven
  // gap visible instead of papered over.
  it("is never spread and widened at the call site", () => {
    for (const file of Object.keys(FLOOR)) {
      expect(read(file), file).not.toContain("...sectionOf(");
    }
  });
});
