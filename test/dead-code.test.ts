// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Code that is still here and is no longer reached.
//
// WHY THIS FILE EXISTS, AND IT IS NOT TIDINESS
//
// A large part of this suite asserts on source TEXT, and that is a deliberate
// tradeoff written down at the top of sources.ts. It has one failure mode, and
// 5.2 found three instances of it in one afternoon: an assertion that reads
// what the source SAYS goes on passing after the code stops being CALLED.
//
//   THE DIARY CARD'S ACTION STRIP. `buildDiaryActions` in diary-header.ts drew
//   Capture and Search above the month navigator. Somewhere between 4.13.2 and
//   5.1 the one `appendChild` that put it on the page was lost. Everything
//   round it survived — `opts.header` and `opts.ctx` on `CalendarOptions`,
//   `header: true` at the call site in directive-regions.ts, `.ca-jc-actions`
//   and its `:has()` rule in the stylesheet, the whole module, and the
//   assertions in appearance.test.ts that check the module's contents and the
//   rule's declarations. Every one of them passed against a card that had not
//   drawn the strip for two minor versions. NOTHING in the suite asked whether
//   any file still imported diary-header.ts, and the answer was no.
//
//   `buildConfidenceSummary` in tables.ts, the builder for a widget retired in
//   3.11, exported with no caller for two majors.
//
//   Six predicates in trackers.ts whose comments each said "three places ask",
//   with no place asking.
//
// So: three cheap questions the text assertions cannot ask, because each is a
// question about the ABSENCE of a reference.
//
// WHAT THIS DOES NOT CHECK. A symbol used only inside its own file is
// over-exported, not dead — 265 of those exist and every one of them runs. That
// is a narrowing job, not a correctness one, and a failing test is the wrong
// place to argue it.

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ROOT } from "./sources";

const SRC = join(ROOT, "src");

const tsFilesUnder = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...tsFilesUnder(p));
    else if (entry.endsWith(".ts")) out.push(p);
  }
  return out;
};

const srcFiles = tsFilesUnder(SRC);
const testFiles = tsFilesUnder(join(ROOT, "test"));
const text = new Map(
  [...srcFiles, ...testFiles].map((p) => [p, readFileSync(p, "utf8")])
);
const rel = (p: string): string => p.slice(ROOT.length + 1);

// Comments are stripped before every reference count below. This project
// writes long ones and they NAME THINGS — `STUDY_COMPOSED` is argued from in
// two other modules, `page-title.ts` is discussed in five. A sweep that counted
// prose would report every dead symbol as live, which is the one result that
// would make this file worse than not having it.
const stripped = new Map<string, string>();
const code = (p: string): string => {
  let s = stripped.get(p);
  if (s === undefined) {
    s = text
      .get(p)!
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    stripped.set(p, s);
  }
  return s;
};

// Identifier COUNTS per file, built once. The obvious shape for the orphan
// sweep is a `\bname\b` regex run against every other file, and it is what
// this started as: 1,700 exports against 310 files is half a million regex
// compiles, and it took twice as long as the other 139 suites put together.
// One tokenise per file answers the same question by lookup.
const identifiers = new Map<string, Map<string, number>>();
const idsOf = (p: string): Map<string, number> => {
  let m = identifiers.get(p);
  if (!m) {
    m = new Map();
    for (const tok of code(p).match(/[A-Za-z_$][\w$]*/g) ?? []) {
      m.set(tok, (m.get(tok) ?? 0) + 1);
    }
    identifiers.set(p, m);
  }
  return m;
};

describe("nothing in src/ is unreachable", () => {
  it("every module is imported, transitively, from main.ts", () => {
    // THE IMPORT GRAPH, WALKED FROM THE PLUGIN'S ENTRY POINT. esbuild walks
    // exactly this graph to build main.js, so a module outside it is not merely
    // uncalled — it is not in the shipped bundle at all, and every test that
    // reads its text is describing a file no reader can run.
    const resolveSpec = (from: string, spec: string): string | null => {
      if (!spec.startsWith(".")) return null;
      const base = resolve(dirname(from), spec);
      for (const c of [`${base}.ts`, join(base, "index.ts")]) {
        if (existsSync(c)) return c;
      }
      return null;
    };

    const seen = new Set<string>();
    const stack = [join(SRC, "main.ts")];
    while (stack.length) {
      const f = stack.pop()!;
      if (seen.has(f) || !text.has(f)) continue;
      seen.add(f);
      const s = text.get(f)!;
      // Static `import … from "x"` / `export … from "x"`, and dynamic
      // `import("x")`. A `import type` counts: it is erased from the bundle,
      // but a module that is only ever a type source is still deliberately
      // wired in, and calling that dead would report every interface file.
      const specs = [
        ...s.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*["']([^"']+)["']/g),
        ...s.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g),
      ].map((m) => m[1]);
      for (const spec of specs) {
        const target = resolveSpec(f, spec);
        if (target) stack.push(target);
      }
    }

    const unreachable = srcFiles.filter((f) => !seen.has(f)).map(rel);
    expect(
      unreachable,
      "modules no import path from src/main.ts reaches — either wire them up " +
        "or delete them; do not add an allowance here"
    ).toEqual([]);
  });
});

describe("test-only exports have a test", () => {
  it("every __ hook is called from test/", () => {
    // The `__`-prefix marks a function that exists ONLY so a suite can reset
    // module-level state between cases. Two of the three had no caller: the
    // comment on `__resetSessionSort` named "the test that pins the session
    // rule", which did not exist, and `__clearIndexCache` guarded a cache no
    // test ever populated. A reset hook with no caller is worse than none —
    // the next person to add a case to that module reads the export and
    // believes isolation is handled.
    const hooks: { name: string; file: string }[] = [];
    for (const p of srcFiles) {
      for (const m of code(p).matchAll(
        /export\s+(?:async\s+)?function\s+(__[A-Za-z_$][\w$]*)/g
      )) {
        hooks.push({ name: m[1], file: rel(p) });
      }
    }
    const uncalled = hooks
      .filter(({ name }) =>
        testFiles.every((t) => !new RegExp(`\\b${name}\\s*\\(`).test(code(t)))
      )
      .map((h) => `${h.file}: ${h.name}`);
    expect(uncalled, "test-only hooks nothing calls").toEqual([]);
  });
});

describe("no export is referenced by nothing", () => {
  // The two allowances, each with the argument for it. An entry here is a
  // claim that the symbol's ABSENCE of callers is the intended state — which
  // is true of exactly one kind of thing in this codebase and is not a place
  // to park something on the way to fixing it.
  const KEPT: Record<string, string> = {
    // vocabulary.ts is a REGISTRY OF NOUNS, and its own header says why: it
    // holds the handful of words that must be the same in every sentence, "so
    // that a fourth name for one of them cannot appear without editing the
    // file whose whole purpose is preventing that." A noun with no current
    // caller is the registry being complete, not the constant being dead —
    // deleting `LAYOUTS` because nothing says "layouts" this month is how the
    // fourth spelling gets written next month.
    "src/core/vocabulary.ts": "the noun registry is deliberately complete",
    //
    // `src/ui/widgets/page-title.ts` WAS THE SECOND ENTRY AND THE DECISION WENT
    // THE OTHER WAY. It held `buildPageTitle`, the 4.5 head — a name, a cog and
    // a row of destination links — which `title:` stopped dispatching to in
    // 4.10 in favour of `livePageHead`, and which went on being described by
    // nine assertions across four suites for a year. The allowlist entry said
    // the choice between bringing the row back and dropping the argument was a
    // product decision rather than this file's to force. It was made in 5.2: the
    // argument left the grammar and the widget left the tree, the file now holds
    // the page cog alone, and `vault-banner.ts` imports it — so it is reachable
    // on the graph and needs no entry here.
  };

  it("every exported symbol is named somewhere outside its own declaration", () => {
    const decl =
      /^export\s+(?:declare\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm;
    const orphans: string[] = [];
    for (const p of srcFiles) {
      if (KEPT[rel(p)]) continue;
      for (const m of code(p).matchAll(decl)) {
        const name = m[1];
        const elsewhere = [...srcFiles, ...testFiles].some(
          (o) => o !== p && idsOf(o).has(name)
        );
        if (elsewhere) continue;
        // Twice in its own file means the declaration and at least one use:
        // over-exported, which this file does not police.
        if ((idsOf(p).get(name) ?? 0) <= 1) orphans.push(`${rel(p)}: ${name}`);
      }
    }
    expect(
      orphans,
      "exports nothing references — delete them, or wire up the caller that " +
        "was meant to exist"
    ).toEqual([]);
  });

  it("keeps no allowance for a file that no longer needs one", () => {
    // An allowance that has outlived its reason is the same defect one level
    // up: a list nobody rereads, protecting nothing.
    for (const file of Object.keys(KEPT)) {
      expect(existsSync(join(ROOT, file)), file).toBe(true);
    }
  });
});
