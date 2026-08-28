// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Where the source lives, asked by name rather than by path.
//
// WHY THIS FILE EXISTS
//
// A large part of this suite asserts on source TEXT — that a button is built
// before an action, that a class is applied where a comment says it is, that a
// retired word never reaches a reader. Those assertions are deliberate and the
// comments above them are the argument for keeping them. What was not
// deliberate is that they each named a path: seventeen modules were pinned by
// literal string across thirteen test files, so `src/widgets.ts` was not merely
// where the code sat, it was part of the contract the suite enforced.
//
// The cost showed up the moment anything moved. Deleting the duplicate root
// package.mjs in 2.56.25 — a file with an identical copy already in tools/ —
// turned a green suite red with ENOENT, and the failure named a missing file
// rather than the thing that had actually changed. A refactor that relocates
// forty modules would produce forty of those, none of them a real regression,
// and the temptation at that point is to stop refactoring rather than to fix
// forty paths.
//
// So: tests ask for a module by name, and this file knows where names live.
//
// TWO PROPERTIES WORTH THE EXTRA CODE
//
// It finds a module wherever it is. `readSrc("widgets")` resolves whether the file
// is at src/widgets.ts, src/ui/widgets.ts, or src/widgets/index.ts. Grouping
// the flat src/ into directories therefore needs no edit here at all.
//
// It reads a SPLIT module whole. When src/widgets.ts becomes src/widgets/ with
// a dozen files in it, `readSrc("widgets")` returns all of them concatenated, so an
// assertion looking for text that moved from the god class into
// widgets/controls/stepper.ts still finds it. That is what lets a 4,800-line
// class be broken up without rewriting the assertions that describe it.
//
// The one thing it cannot preserve is ORDER across a split: an assertion of the
// form `text.indexOf(a) < text.indexOf(b)` is comparing positions in a
// concatenation whose file order is alphabetical, not meaningful. Those
// assertions are flagged where they exist and are the ones to convert to
// behavioural checks when their module is split.

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, join, sep } from "node:path";

export const ROOT = resolve(__dirname, "..");
const SRC = join(ROOT, "src");

// Logical name -> path relative to src/, for the cases a search cannot guess:
// a module renamed, or one whose test-facing name differs from its filename.
// Empty is the healthy state — every entry here is a name the tests know and
// the filesystem does not.
const ALIASES: Record<string, string> = {};

const isDir = (p: string): boolean => existsSync(p) && statSync(p).isDirectory();

// Every .ts file under a directory, depth-first, alphabetical. Alphabetical so
// that a concatenation is stable between runs and between machines.
const tsFilesUnder = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const p = join(dir, entry);
    if (isDir(p)) out.push(...tsFilesUnder(p));
    else if (entry.endsWith(".ts")) out.push(p);
  }
  return out;
};

// Find <name>.ts anywhere under src/, so grouping into directories is invisible.
const search = (dir: string, file: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const p = join(dir, entry);
    if (isDir(p)) {
      out.push(...search(p, file));
    } else if (entry === file) out.push(p);
  }
  return out;
};

// Find a DIRECTORY named <name> anywhere under src/. This is the case where a
// module has both been grouped and been split: src/widgets.ts becomes
// src/ui/widgets/, which is neither src/widgets.ts nor src/widgets/ and so is
// missed by every lookup above it.
const searchDir = (dir: string, name: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const p = join(dir, entry);
    if (!isDir(p)) continue;
    if (entry === name) out.push(p);
    out.push(...searchDir(p, name));
  }
  return out;
};

/**
 * Absolute path(s) backing a logical module name.
 *
 * `root` exists so that the resolution rules can be tested against a fixture
 * tree instead of against src/. The ambiguity check below is the whole point
 * of this function, and the only way to exercise it against src/ is to create
 * a shadowing file inside it — which every other test file reading a module by
 * name would see, since vitest runs files in parallel workers. A fixture root
 * keeps that test from being a race. Nothing outside test/sources.test.ts
 * passes a second argument.
 */
export function srcPaths(name: string, root: string = SRC): string[] {
  const base = name.replace(/\.ts$/, "");
  const label = root.startsWith(ROOT + sep) ? root.slice(ROOT.length + 1) : root;

  const alias = ALIASES[base];
  if (alias) {
    const aliased = join(root, alias);
    if (isDir(aliased)) return tsFilesUnder(aliased);
    if (existsSync(aliased)) return [aliased];
  }

  const rawCandidates: { path: string; type: "file" | "dir" }[] = [];

  const asDir = join(root, base);
  if (isDir(asDir)) rawCandidates.push({ path: asDir, type: "dir" });

  const flat = join(root, `${base}.ts`);
  if (existsSync(flat)) rawCandidates.push({ path: flat, type: "file" });

  for (const f of search(root, `${base}.ts`)) rawCandidates.push({ path: f, type: "file" });
  for (const d of searchDir(root, base)) rawCandidates.push({ path: d, type: "dir" });

  // A file or subdirectory located inside a candidate directory is part of that directory.
  const dirs = rawCandidates.filter((c) => c.type === "dir").map((c) => c.path);
  const rootCandidates = new Map<string, "file" | "dir">();

  for (const c of rawCandidates) {
    const isInsideDir = dirs.some((d) => c.path !== d && c.path.startsWith(d + sep));
    if (!isInsideDir) {
      rootCandidates.set(c.path, c.type);
    }
  }

  if (rootCandidates.size > 1) {
    const list = Array.from(rootCandidates.keys())
      .map((p) => `  ${p.startsWith(ROOT + sep) ? p.slice(ROOT.length + 1) : p}`)
      .join("\n");
    throw new Error(
      `Ambiguous source module named "${base}" — found ${rootCandidates.size}:\n${list}\n` +
        `Rename one, or add an entry to ALIASES in test/sources.ts.`
    );
  }

  if (rootCandidates.size === 1) {
    const [candPath, type] = rootCandidates.entries().next().value!;
    return type === "dir" ? tsFilesUnder(candPath) : [candPath];
  }

  throw new Error(
    `No source module named "${base}". Looked for ${label}/${base}.ts, ${label}/${base}/, ` +
      `and anywhere under ${label}/. If it was renamed, add it to ALIASES in test/sources.ts.`
  );
}

/**
 * The text of a source module, by name.
 *
 * Accepts "widgets" or "widgets.ts". If the module has been split into a
 * directory, returns every file in it concatenated in alphabetical order,
 * each preceded by a comment naming its path so a failure message can be
 * traced back to a file.
 */
export function readSrc(name: string): string {
  const paths = srcPaths(name);
  if (paths.length === 1) return readFileSync(paths[0], "utf8");
  return paths
    .map((p) => `// ── ${p.slice(ROOT.length + 1)} ──\n${readFileSync(p, "utf8")}`)
    .join("\n");
}

/**
 * The project's stylesheet text.
 *
 * Reads styles.css today. If the stylesheet is ever split into styles/, reads
 * all of it — the thirty call sites in this suite do not need to know which.
 */
export function readCss(): string {
  const dir = join(ROOT, "styles");
  if (isDir(dir)) {
    return readdirSync(dir)
      .sort()
      .filter((f) => f.endsWith(".css"))
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("\n");
  }
  return readFileSync(join(ROOT, "styles.css"), "utf8");
}

/**
 * The stylesheet modules, each with its filename — for assertions that are
 * ABOUT a module rather than about the concatenation. `readCss` joins them, so
 * a failure there can only say "somewhere in 634KB"; this lets a rule sweep
 * name the file it found a problem in, which is the difference between a
 * report you can act on and one you have to go looking through.
 *
 * Falls back to the built `styles.css` as one entry, exactly as readCss does.
 */
export function styleSheets(): { name: string; css: string }[] {
  const dir = join(ROOT, "styles");
  if (isDir(dir)) {
    return readdirSync(dir)
      .sort()
      .filter((f) => f.endsWith(".css"))
      .map((f) => ({ name: f, css: readFileSync(join(dir, f), "utf8") }));
  }
  return [
    { name: "styles.css", css: readFileSync(join(ROOT, "styles.css"), "utf8") },
  ];
}

/**
 * ONE RULE'S DECLARATIONS, ANCHORED AND BOUNDED. 4.35.3.
 *
 * WHY THIS EXISTS. Thirty-odd assertions in this suite reach for a CSS rule as
 * `css.slice(css.indexOf(SEL), css.indexOf("}", css.indexOf(SEL)))`, and that
 * shape has two failure modes that both END IN A PASSING TEST:
 *
 *   NOT ANCHORED — `indexOf(".almanac-section-title {")` also matches inside
 *   `.almanac-head-fold .almanac-section-title {`, so the assertion reads a
 *   DIFFERENT rule, usually the override that states the opposite. Cost one
 *   debugging round in 4.35.1.
 *
 *   NOT FOUND — a renamed selector makes `indexOf` return -1, `slice(-1, …)`
 *   returns "" or a stray tail, and every `toContain` on it fails loudly while
 *   every `not.toContain` passes while asserting nothing. That is the shape
 *   `RESUME.md` records for the 4.16 test that "quietly stopped testing", and
 *   it happened twice more while writing 4.35.1 and 4.35.2.
 *
 * So this walks the stylesheet with brace depth rather than searching text,
 * compares whole selectors in a list rather than substrings, and THROWS when
 * there is no match — because the one thing a helper like this must never do is
 * hand back an empty string that quietly satisfies a negative assertion.
 */
function eachRule(css: string): { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  // COMMENTS COME OUT FIRST, and both halves of that matter. A selector is read
  // as "everything since the last block closed", so a rule preceded by one of
  // this project's long explanatory comments would carry the whole comment in
  // its name and match nothing. And a comment containing a brace — several here
  // quote selectors — would corrupt the depth count for the rest of the file.
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "{") {
      // The selector list runs from the end of the previous block to here.
      if (depth === 0) {
        out.push({ selector: css.slice(start, i).trim(), body: "" });
        start = i + 1;
      }
      depth++;
    } else if (c === "}") {
      depth--;
      // Only the outermost close ends a rule; an at-rule's inner braces are
      // stepped over here and its contents are walked separately by `cssRules`.
      if (depth === 0) {
        out[out.length - 1].body = css.slice(start, i);
        start = i + 1;
      }
    }
  }
  return out;
}

/** Every rule whose selector list names `selector` exactly. At-rules included. */
export function cssRules(selector: string): string[] {
  const found: string[] = [];
  const walk = (css: string): void => {
    for (const rule of eachRule(css)) {
      if (rule.selector.startsWith("@")) {
        walk(rule.body);
        continue;
      }
      const names = rule.selector.split(",").map((x) => x.trim());
      if (names.includes(selector)) found.push(rule.body);
    }
  };
  walk(readCss());
  return found;
}

/**
 * The declarations of the one rule named `selector`, anchored and bounded.
 * Throws when there is no such rule, so a rename fails loudly instead of
 * turning every negative assertion into a no-op.
 */
export function cssRule(selector: string): string {
  const found = cssRules(selector);
  if (found.length === 0) {
    throw new Error(
      `No CSS rule for "${selector}" — it was renamed, or the selector is part of a longer list.`
    );
  }
  return found.join("\n");
}

/** A file from assets/, by filename. */
export function readAsset(name: string): string {
  return readFileSync(join(ROOT, "assets", name), "utf8");
}

/** A file from the repository root, by path relative to it. */
export function repoFile(relative: string): string {
  return readFileSync(join(ROOT, relative), "utf8");
}

/**
 * Every source module name, for suites that sweep the whole tree.
 *
 * Returns BARE names — "widgets", not "ui/widgets" — because a sweep that
 * compares against a name is asserting which module something lives in, not
 * which directory. `expect(defs).toEqual(["empty"])` survives the module being
 * regrouped; `["ui/empty"]` would put the directory back into the contract,
 * which is the coupling this file exists to remove.
 *
 * Throws on a duplicate stem. Two modules with the same filename in different
 * groups would make `readSrc(name)` ambiguous, so it is better to hear about it
 * here than to silently read whichever the search reached first.
 */
export function allSrcNames(): string[] {
  // A "module" is a .ts file, OR a directory holding an index.ts — the shape a
  // module takes once it is split. Group folders (core/, ui/, …) have no
  // index.ts and are not modules; they are recursed into. Without this, a split
  // widgets/ would report itself as "index" and "controls" rather than
  // "widgets", and a second split module would collide on "index".
  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir).sort()) {
      const p = join(dir, entry);
      if (isDir(p)) {
        if (existsSync(join(p, "index.ts"))) out.push(entry);
        else out.push(...walk(p));
      } else if (entry.endsWith(".ts")) {
        out.push(entry.replace(/\.ts$/, ""));
      }
    }
    return out;
  };

  const names = walk(SRC);
  const seen = new Set<string>();
  const dupes = names.filter((n) => (seen.has(n) ? true : (seen.add(n), false)));
  if (dupes.length) {
    throw new Error(
      `Duplicate module names under src/: ${[...new Set(dupes)].join(", ")}. ` +
        `readSrc() resolves by name, so these must be unique.`
    );
  }
  return names.sort();
}

/**
 * The text of one top-level function, by name.
 *
 * A number of assertions in this suite were written against a slice of the
 * directive switch — `widgets.slice(indexOf('case "x":'), indexOf('case "y":'))`
 * — back when a case body held the implementation. In 2.56.25 nineteen of those
 * bodies moved into ./directive-regions.ts and the cases became one-line
 * delegations, so those slices went empty and the assertions passed or failed
 * on nothing.
 *
 * Slicing by function name instead says what was always meant: "the code that
 * implements this directive", wherever it currently lives. It survives the
 * function moving to another file, and it cannot silently shrink to nothing —
 * an unknown name throws rather than returning "".
 */
export function fnBody(name: string, moduleName = "widgets"): string {
  const text = readSrc(moduleName);
  const decl = new RegExp(
    `(?:export )?(?:async )?function ${name}\\b|private (?:async )?${name}\\s*\\(`
  );
  const m = decl.exec(text);
  if (!m) {
    throw new Error(
      `No function "${name}" in module "${moduleName}". If it was renamed or ` +
        `moved to another module, update the caller rather than widening this.`
    );
  }
  const rest = text.slice(m.index);
  // Next top-level declaration, or end of module.
  const next = /\n(?:export )?(?:async )?function |\n(?:export )?(?:const|class|interface) /.exec(
    rest.slice(1)
  );
  return next ? rest.slice(0, next.index + 1) : rest;
}

// The same module with comment lines removed.
//
// FOR NEGATIVE ASSERTIONS ONLY, and it exists because `expect(src).not.toContain(x)`
// keeps failing on the comment explaining why `x` was removed. That happened
// four times in 2.57–2.58 — the `period-nav` ternary, `dailyOverviewPath`,
// `isMonthly`, `DAY_FILE` — and each time the fix was a local strip, which is
// three copies of a rule and a fourth waiting to be written.
//
// A check that cannot tell a line of code from a line describing one is not
// checking what it claims to. Positive assertions should keep using `readSrc`:
// finding a string in a comment is a false PASS, and stripping comments for
// those would hide it.
export function readCode(name: string): string {
  return readSrc(name)
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}
