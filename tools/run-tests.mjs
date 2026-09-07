// A minimal stand-in for `vitest run`, for environments where vitest's worker
// pools crash (SIGBUS in some sandboxes) but node and esbuild are fine.
//
// NOT A REPLACEMENT. It runs the existing test files unmodified by bundling
// each one with esbuild — resolving `vitest` to a shim and `obsidian` to the
// same stub vitest.config.ts points at — and executing the bundle in-process.
// It implements exactly the API the suite uses and nothing else: describe, it,
// expect with the dozen matchers in play, beforeEach/afterEach, and the three
// vi timer calls. Anything beyond that throws rather than silently passing,
// which is the only property that makes this trustworthy.
//
//   node tools/run-tests.mjs            # everything
//   node tools/run-tests.mjs section    # files matching a substring
import { build } from "esbuild";
import { readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ── the shim ──────────────────────────────────────────────────────────
// Written to disk so esbuild can resolve `vitest` to it by alias.
const SHIM = `
const state = { stack: [], tests: [], only: false };

function pushSuite(name, fn) {
  state.stack.push({ name, before: [], after: [] });
  fn();
  state.stack.pop();
}
export function describe(name, fn) { pushSuite(name, fn); }
describe.skip = () => {};
export function it(name, fn) {
  state.tests.push({
    name: [...state.stack.map((s) => s.name), name].join(" › "),
    fn,
    hooks: state.stack.map((s) => s),
  });
}
it.skip = () => {};
it.each = () => () => {};
export const test = it;
export function beforeEach(fn) {
  const s = state.stack[state.stack.length - 1];
  if (s) s.before.push(fn); else state.rootBefore = [...(state.rootBefore ?? []), fn];
}
export function afterEach(fn) {
  const s = state.stack[state.stack.length - 1];
  if (s) s.after.push(fn); else state.rootAfter = [...(state.rootAfter ?? []), fn];
}
export function beforeAll(fn) { beforeEach(fn); }
export function afterAll(fn) { afterEach(fn); }

const fmt = (v) => {
  if (typeof v === "string") return JSON.stringify(v);
  if (v instanceof Error) return v.message;
  try { return JSON.stringify(v); } catch { return String(v); }
};

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k, v] of a) { if (!b.has(k) || !deepEqual(v, b.get(k))) return false; }
    return true;
  }
  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual(a[k], b[k]));
}

// Subset match, for toMatchObject.
function matchObject(actual, expected) {
  if (expected === null || typeof expected !== "object") return deepEqual(actual, expected);
  if (actual === null || typeof actual !== "object") return false;
  return Object.keys(expected).every((k) => matchObject(actual[k], expected[k]));
}

function makeExpect(actual, negated) {
  const ok = (pass, msg) => {
    if (pass === !negated) return;
    throw new Error(negated ? "not: " + msg : msg);
  };
  const api = {
    toBe: (e) => ok(Object.is(actual, e), \`expected \${fmt(actual)} to be \${fmt(e)}\`),
    toEqual: (e) => ok(deepEqual(actual, e), \`expected \${fmt(actual)} to equal \${fmt(e)}\`),
    toStrictEqual: (e) => ok(deepEqual(actual, e), \`expected \${fmt(actual)} to equal \${fmt(e)}\`),
    toMatchObject: (e) => ok(matchObject(actual, e), \`expected \${fmt(actual)} to match \${fmt(e)}\`),
    toContain: (e) => {
      const pass = typeof actual === "string"
        ? actual.includes(e)
        : actual instanceof Set ? actual.has(e)
        : Array.isArray(actual) ? actual.some((x) => Object.is(x, e) || deepEqual(x, e))
        : false;
      ok(pass, \`expected \${fmt(actual)} to contain \${fmt(e)}\`);
    },
    toContainEqual: (e) => ok(
      Array.isArray(actual) && actual.some((x) => deepEqual(x, e)),
      \`expected \${fmt(actual)} to contain \${fmt(e)}\`
    ),
    toMatch: (re) => ok(
      typeof re === "string" ? String(actual).includes(re) : re.test(String(actual)),
      \`expected \${fmt(actual)} to match \${re}\`
    ),
    toHaveLength: (n) => ok(actual?.length === n, \`expected length \${actual?.length} to be \${n}\`),
    toHaveProperty: (k, v) => {
      const has = actual != null && k.split(".").reduce((o, p) => (o == null ? o : o[p]), actual) !== undefined;
      const val = k.split(".").reduce((o, p) => (o == null ? o : o[p]), actual);
      ok(has && (v === undefined || deepEqual(val, v)), \`expected property \${k}\`);
    },
    toBeNull: () => ok(actual === null, \`expected \${fmt(actual)} to be null\`),
    toBeUndefined: () => ok(actual === undefined, \`expected \${fmt(actual)} to be undefined\`),
    toBeDefined: () => ok(actual !== undefined, \`expected value to be defined\`),
    toBeTruthy: () => ok(!!actual, \`expected \${fmt(actual)} to be truthy\`),
    toBeFalsy: () => ok(!actual, \`expected \${fmt(actual)} to be falsy\`),
    toBeGreaterThan: (n) => ok(actual > n, \`expected \${fmt(actual)} > \${n}\`),
    toBeGreaterThanOrEqual: (n) => ok(actual >= n, \`expected \${fmt(actual)} >= \${n}\`),
    toBeLessThan: (n) => ok(actual < n, \`expected \${fmt(actual)} < \${n}\`),
    toBeLessThanOrEqual: (n) => ok(actual <= n, \`expected \${fmt(actual)} <= \${n}\`),
    toBeCloseTo: (n, d = 2) => ok(Math.abs(actual - n) < Math.pow(10, -d) / 2, \`expected \${fmt(actual)} ≈ \${n}\`),
    toBeInstanceOf: (C) => ok(actual instanceof C, \`expected instance of \${C.name}\`),
    // In the suite since 3.10 (actions.test.ts, discoverability.test.ts) and
    // missing here until 3.17, so those two files failed under this runner and
    // passed under vitest — which is the one thing a stand-in must not do. The
    // header's promise is that anything unimplemented THROWS rather than
    // silently passing, and it kept that promise; it just meant two files could
    // not be checked in a sandbox where vitest's pools crash.
    toBeTypeOf: (t) => ok(typeof actual === t, \`expected typeof \${fmt(actual)} to be \${t}\`),
    toThrow: (m) => {
      let threw = false, err;
      try { actual(); } catch (e) { threw = true; err = e; }
      const pass = threw && (m === undefined ||
        (typeof m === "string" ? String(err?.message ?? err).includes(m) : m.test(String(err?.message ?? err))));
      ok(pass, threw ? \`threw \${fmt(err)}, expected \${fmt(m)}\` : "expected function to throw");
    },
  };
  api.toThrowError = api.toThrow;
  return api;
}

export function expect(actual) {
  const api = makeExpect(actual, false);
  api.not = makeExpect(actual, true);
  api.resolves = {
    ...makeExpect(actual, false),
    get not() { return makeExpect(actual, true); },
  };
  return api;
}
expect.any = (C) => ({ __any: C });

// Fake timers: the suite uses these only to flush debounced/awaited work.
let realSetTimeout = null;
export const vi = {
  useFakeTimers() { realSetTimeout = globalThis.setTimeout; },
  useRealTimers() { if (realSetTimeout) globalThis.setTimeout = realSetTimeout; realSetTimeout = null; },
  // useFakeTimers is a no-op here, so real timers are still running and the
  // honest way to "advance" is to wait. Capped at 5s so a test that asks for
  // an hour fails on its assertion rather than hanging the run.
  async advanceTimersByTimeAsync(ms) { await new Promise((r) => setTimeout(r, Math.min(ms, 5000))); },
  advanceTimersByTime() {},
  fn: (impl) => {
    const f = (...a) => { f.mock.calls.push(a); return impl?.(...a); };
    f.mock = { calls: [] };
    return f;
  },
  spyOn: () => ({ mockImplementation: () => {}, mockRestore: () => {} }),
};

globalThis.__CHRONOANVIL_RUN = __run;
export async function __run() {
  const results = { pass: 0, fail: 0, failures: [] };
  for (const t of state.tests) {
    try {
      for (const s of t.hooks) for (const b of s.before) await b();
      await t.fn();
      for (const s of [...t.hooks].reverse()) for (const a of s.after) await a();
      results.pass++;
    } catch (e) {
      results.fail++;
      results.failures.push({ name: t.name, message: e?.message ?? String(e) });
    }
  }
  return results;
}
`;

const tmp = mkdtempSync(resolve(tmpdir(), "ca-shim-"));
const shimPath = resolve(tmp, "vitest-shim.mjs");
writeFileSync(shimPath, SHIM);

// ── the obsidian stub, augmented ──────────────────────────────────────
//
// esbuild resolves named imports strictly; vitest's ESM loader does not, so
// `test/obsidian-stub.ts` has only ever needed to export what a test TOUCHES,
// not everything the source IMPORTS. Bundling needs the difference.
//
// Re-exported rather than edited, deliberately: the stub is the suite's own
// and a runner that quietly rewrote it would be testing a different vault
// from the one vitest tests. These are inert placeholders for values no test
// calls — if one ever does, it fails loudly rather than passing on a mock.
const STUB_EXTRAS = `
export * from ${JSON.stringify(resolve(root, "test/obsidian-stub.ts"))};
export function setIcon(el, name) { if (el && el.dataset) el.dataset.icon = name; return el; }
export class TAbstractFile {}
export class MarkdownPostProcessorContext {}
export class Component {}
export class Setting {
  constructor(el) { this.el = el; }
  setName() { return this; }  setDesc() { return this; }
  setHeading() { return this; } setClass() { return this; }
  addText(cb) { cb(chainable()); return this; }
  addTextArea(cb) { cb(chainable()); return this; }
  addToggle(cb) { cb(chainable()); return this; }
  addDropdown(cb) { cb(chainable()); return this; }
  addButton(cb) { cb(chainable()); return this; }
  addExtraButton(cb) { cb(chainable()); return this; }
  addSlider(cb) { cb(chainable()); return this; }
}
function chainable() {
  const o = new Proxy({}, { get: (_t, k) => (k === "inputEl" || k === "selectEl" ? {} : () => o) });
  return o;
}
`;
const stubPath = resolve(tmp, "obsidian-stub-plus.mjs");
writeFileSync(stubPath, STUB_EXTRAS);

const filter = process.argv[2] ?? "";
const files = readdirSync(resolve(root, "test"))
  .filter((f) => f.endsWith(".test.ts"))
  .filter((f) => f.includes(filter))
  .sort();

let totalPass = 0;
let totalFail = 0;
const allFailures = [];
const brokenFiles = [];

for (const file of files) {
  const entry = resolve(root, "test", file);
  const out = resolve(tmp, file.replace(/\.test\.ts$/, ".mjs"));
  try {
    await build({
      entryPoints: [entry],
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node18",
      outfile: out,
      logLevel: "silent",
      // Same alias vitest.config.ts sets, via the augmentation above, plus
      // the shim.
      alias: {
        obsidian: stubPath,
        vitest: shimPath,
      },
      // The tests reach the repo through `resolve(__dirname, "..")`. The
      // bundle lives in a temp folder, so __dirname has to be defined to
      // where the SOURCE file sits or every readSrc() in the suite misses.
      define: {
        __dirname: JSON.stringify(resolve(root, "test")),
        __filename: JSON.stringify(entry),
      },
      // Keep node builtins external; bundle everything else so the test sees
      // the real source rather than a mock of it.
      external: ["node:*", "fs", "path", "url", "os"],
      banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
      footer: {
        // Through a global rather than a dynamic import: esbuild BUNDLES the
        // shim into the output, so importing it again by path would load a
        // second module instance with an empty test registry — which is
        // exactly the silent 0-passed the first attempt produced.
        js: `
const __r = await globalThis.__CHRONOANVIL_RUN();
console.log(JSON.stringify({ __result: __r }));
`,
      },
    });
  } catch (e) {
    brokenFiles.push({ file, message: (e?.message ?? String(e)).split("\n").slice(0, 4).join(" ") });
    continue;
  }

  const { spawnSync } = await import("node:child_process");
  const proc = spawnSync(process.execPath, [out], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const line = (proc.stdout ?? "")
    .split("\n")
    .reverse()
    .find((l) => l.trim().startsWith('{"__result"'));
  if (!line) {
    brokenFiles.push({
      file,
      message: (proc.stderr || proc.stdout || "no output").split("\n").slice(0, 4).join(" "),
    });
    continue;
  }
  const r = JSON.parse(line).__result;
  totalPass += r.pass;
  totalFail += r.fail;
  for (const f of r.failures) allFailures.push({ file, ...f });
  const mark = r.fail ? "✗" : "✓";
  console.log(`${mark} ${file.padEnd(32)} ${r.pass} passed${r.fail ? `, ${r.fail} FAILED` : ""}`);
}

if (allFailures.length) {
  console.log("\n── failures ──");
  for (const f of allFailures) console.log(`  ${f.file} › ${f.name}\n     ${f.message}`);
}
if (brokenFiles.length) {
  console.log("\n── files that would not run ──");
  for (const f of brokenFiles) console.log(`  ${f.file}: ${f.message}`);
}

console.log(`\n${totalPass} passed, ${totalFail} failed, ${brokenFiles.length} unrunnable, ${files.length} files`);
rmSync(tmp, { recursive: true, force: true });
process.exit(totalFail > 0 || brokenFiles.length > 0 ? 1 : 0);
