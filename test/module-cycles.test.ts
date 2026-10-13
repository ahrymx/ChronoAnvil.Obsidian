// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The module graph's own shape. 1.0.66.
//
// ── THE FAILURE THAT WROTE THIS FILE ──────────────────────────────────────
//
// Twenty-five suites stopped COLLECTING in CI, every one of them with
// `TypeError: stateWord is not a function`, pointing at a module-level `const`
// in `ui/diary-link-window.ts` that calls a function imported from
// `diary/diary-link.ts` — which imported the window straight back, for one
// opener.
//
// A TANGLE IS NOT ITSELF THE BUG, and that is why this file does not forbid
// one. Three of them are in this tree and all three are harmless: a cycle only
// bites when a module READS A BINDING FROM ITS PARTNER WHILE EITHER IS STILL
// BEING EVALUATED — at the top level, outside any function. Vite's SSR
// transform installs each export where the export was written, so a partner
// reached first during the import phase finds a binding that is not a function
// yet, and the loser is not a wrong answer but a crash at import time.
//
// WHAT HID IT FOR A WHOLE SESSION. The development box ran a NEWER vitest than
// the lockfile pins — `node_modules/.bin` held symlinks into an absolute path
// from another machine, so `npm test` fell through to a globally installed one
// whose transform hoists those exports and tolerates the read. CI installs the
// locked one with `npm ci` and does not. A green suite was the reason nobody
// looked, which is `vacuous-sweep-rule`'s own sentence about the test that
// shipped passing for the wrong reason.
//
// ── SO THE CHECK IS THE EVALUATION, NOT THE DRAWING ───────────────────────
//
// `loads every module in a tangle` is the direct reproduction: it imports each
// member AS THE ENTRY, which is the condition that decides evaluation order.
// Importing the window first always worked; importing the model first was the
// crash. A graph assertion alone would be a proxy for that, and a list of
// blessed cycles is a list somebody has to keep.
//
// The graph scan is the second half, and it earns its place by naming the
// members: it turns "something throws" into "this pair is the reason", and it
// makes a NEW tangle arrive with an explanation rather than silently.
//
// Tangles, not cycles, because a strongly connected component is canonical —
// it does not depend on which file a walk happened to enter first, so this
// file's expectations do not move when an unrelated import is added.

import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, dirname, normalize, relative } from "node:path";

const SRC = resolve(__dirname, "..", "src");

const files = (dir: string): string[] =>
  readdirSync(dir)
    .sort()
    .flatMap((entry) => {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) return files(p);
      return entry.endsWith(".ts") ? [p] : [];
    });

// Where a relative specifier lands, as TypeScript resolves it.
const resolveSpec = (from: string, spec: string): string | null => {
  if (!spec.startsWith(".")) return null;
  const p = normalize(join(dirname(from), spec));
  for (const candidate of [`${p}.ts`, join(p, "index.ts")]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      /* not that one */
    }
  }
  return null;
};

// ONLY THE IMPORTS THAT SURVIVE COMPILATION. `import type` and a brace list
// whose every name is `type`-qualified are erased by TypeScript and cannot
// close a runtime cycle — which is exactly why the graph a bundler sees is not
// the graph the type checker sees, and why several modules in this tree read
// each other's types quite safely.
const IMPORTS = /^\s*import\s+(type\s+)?([\s\S]*?)from\s*"([^"]+)"/gm;

const valueImports = (file: string): string[] => {
  const out: string[] = [];
  for (const m of readFileSync(file, "utf8").matchAll(IMPORTS)) {
    if (m[1]) continue;
    const clause = m[2].trim();
    if (clause.startsWith("{") && clause.endsWith("}")) {
      const names = clause
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (names.length > 0 && names.every((n) => n.startsWith("type "))) continue;
    }
    const to = resolveSpec(file, m[3]);
    if (to !== null) out.push(to);
  }
  return out;
};

const graph = new Map<string, string[]>();
for (const f of files(SRC)) graph.set(f, valueImports(f));

const named = (p: string): string => relative(SRC, p).replace(/\\/g, "/");

// Tarjan, so the answer is the strongly connected components and not one walk's
// path. A component of one member is not a tangle unless it imports itself.
const tangles = (): string[][] => {
  let next = 0;
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const found: string[][] = [];
  const walk = (u: string): void => {
    index.set(u, next);
    low.set(u, next);
    next += 1;
    stack.push(u);
    onStack.add(u);
    for (const v of graph.get(u) ?? []) {
      if (!index.has(v)) {
        walk(v);
        low.set(u, Math.min(low.get(u) as number, low.get(v) as number));
      } else if (onStack.has(v)) {
        low.set(u, Math.min(low.get(u) as number, index.get(v) as number));
      }
    }
    if (low.get(u) === index.get(u)) {
      const part: string[] = [];
      for (;;) {
        const w = stack.pop() as string;
        onStack.delete(w);
        part.push(w);
        if (w === u) break;
      }
      const selfish = part.length === 1 && (graph.get(part[0]) ?? []).includes(part[0]);
      if (part.length > 1 || selfish) found.push(part.map(named).sort());
    }
  };
  for (const f of [...graph.keys()].sort()) if (!index.has(f)) walk(f);
  return found.sort((a, b) => a[0].localeCompare(b[0]));
};

describe("the module graph", () => {
  // ── THE KNOWN TANGLES, NAMED ────────────────────────────────────────────
  //
  // Not a budget and not a licence. Each of these is a set of modules that
  // import each other's values and get away with it because none of them reads
  // a partner at module level. Adding a row is allowed and means somebody
  // looked; the import test below is what decides whether the new one is
  // survivable, and it runs on whatever is here.
  const KNOWN = [
    // The page's head and its menus. `page-head` is the hinge: the actions menu
    // reaches back into `page-actions`, and the banner's calendar reaches back
    // into the head.
    [
      "core/page-actions.ts",
      "diary/calendar.ts",
      "journals/study-header.ts",
      "ui/page-icon.ts",
      "ui/vault-banner.ts",
      "ui/widgets/actions-menu.ts",
      "ui/widgets/page-head.ts",
    ],
    // A section and the widgets a section may hold.
    ["core/sections.ts", "core/widget-sections.ts"],
    // A journal entry and the trackers on it.
    ["journals/journal.ts", "trackers/entry-trackers.ts"],
    // The three period reviews, each of which can draw the next one down.
    ["review/quarter-view.ts", "review/recap-view.ts", "review/year-view.ts"],
  ];

  it("has only the tangles somebody has looked at", () => {
    expect(tangles()).toEqual(KNOWN);
  });

  it("no longer runs the diary link through one", () => {
    // THE ONE THAT BIT. `diary/diary-link.ts` imported `DiaryLinkWindow` for a
    // single opener; the opener moved into the window's own file, which is the
    // layer it belonged to all along — the model holds the arithmetic and the
    // writes, and building a modal is neither.
    const members = tangles().flat();
    expect(members).not.toContain("diary/diary-link.ts");
    expect(members).not.toContain("ui/diary-link-window.ts");
  });

  it("loads every module in a tangle, whichever one is reached first", async () => {
    // THE DIRECT REPRODUCTION, and the half of this file that would have caught
    // the defect. Each member is imported as the ENTRY, because that is what
    // fixes the evaluation order, and `vi.resetModules()` is what keeps the
    // iterations independent — without it the first import warms the registry
    // and every later one is a cache hit, which is a sweep that passes for the
    // second reason in `vacuous-sweep-rule`.
    const members = [...new Set(tangles().flat())].sort();
    expect(members.length).toBeGreaterThan(5);
    for (const member of members) {
      vi.resetModules();
      // THE SPECIFIER GOES THROUGH A VARIABLE. Inline, vite's
      // dynamic-import-vars plugin tries to turn the template into a glob and
      // either warns about the missing extension or refuses a path more than
      // one directory deep; held in a binding it is left to the SSR runtime,
      // which resolves it relative to this file exactly as a static one.
      const spec = `../src/${member}`;
      const mod = await import(spec);
      expect(Object.keys(mod).length, `${member} exported nothing`).toBeGreaterThan(0);
    }
  });

  it("would notice a module-level read across a tangle", async () => {
    // THE SWEEP, MEASURED — `vacuous-sweep-rule` says a new check proves
    // nothing until a mutant has been measured against it, and this one's
    // mutant cannot be written as an edit to a source line, because the defect
    // is an ORDERING. So it is checked in instead, as the pair under
    // `test/fixtures/module-cycle/`: two modules that import each other's
    // values and call across at load, which is the exact shape of the failure.
    //
    // If this ever stops throwing, the test above has stopped being able to see
    // the thing it exists for — the transform has been upgraded out from under
    // it, and the twenty-five suites would fail in CI again with nothing here
    // going red.
    vi.resetModules();
    await expect(import("./fixtures/module-cycle/model")).rejects.toThrow(TypeError);
    vi.resetModules();
    await expect(import("./fixtures/module-cycle/window")).rejects.toThrow(TypeError);
  });
});
