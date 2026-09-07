// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// These are source-text tests in the sense of §1 of CONTRIBUTING.md's rule:
// what they protect — that a module name resolves to exactly one place — has
// no runtime form in the plugin at all. It is a property of the test harness.
//
// The ambiguous case cannot be exercised against src/ itself. Creating a
// shadowing src/settings.ts is visible to every other test file that reads a
// module by name, and vitest runs files in parallel workers, so the shadow
// races four other suites and leaves a stray file behind if the process dies
// mid-test. The rules are exercised against a throwaway tree instead, which is
// what the `root` parameter on srcPaths exists for.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSrc, srcPaths } from "./sources";

describe("source module resolution", () => {
  // Against the real tree: the names the suite actually asks for still resolve.
  it("resolves a unique module by name", () => {
    const paths = srcPaths("settings");
    expect(paths.length).toBe(1);
    expect(paths[0]).toContain("src/core/settings.ts");
    expect(readSrc("settings")).toContain("DEFAULT_SETTINGS");
  });

  it("resolves a directory module by name", () => {
    const paths = srcPaths("widgets");
    expect(paths.length).toBeGreaterThan(1);
    expect(paths.some((p) => p.includes("src/ui/widgets/"))).toBe(true);
  });

  it("throws a clear error when a module name is missing", () => {
    expect(() => srcPaths("nonexistent-module-xyz")).toThrow(
      'No source module named "nonexistent-module-xyz"'
    );
  });
});

// Against a fixture tree: the rules themselves, including the ones src/ cannot
// currently express because no name in it is ambiguous.
describe("source module resolution rules", () => {
  let root: string;

  const write = (rel: string, text: string): void => {
    const full = join(root, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, text);
  };

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "ca-srcpaths-"));

    // Unambiguous: one nested file, one nested directory.
    write("core/settings.ts", "export const DEFAULT_SETTINGS = {};\n");
    write("ui/widgets/index.ts", "export const widgets = 1;\n");
    write("ui/widgets/stepper.ts", "export const stepper = 1;\n");

    // A file inside a directory of the same name is part of that directory,
    // not a second candidate competing with it.
    write("ui/panels/panels.ts", "export const panels = 1;\n");

    // Ambiguous: a top-level file shadowing a nested one, and a top-level
    // directory shadowing a nested one. These are the two shapes ROADMAP-4.1
    // §10.2 warns about.
    write("shadowed.ts", "export const top = 1;\n");
    write("core/shadowed.ts", "export const nested = 1;\n");
    write("dupe/index.ts", "export const top = 1;\n");
    write("ui/dupe/index.ts", "export const nested = 1;\n");
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("finds a nested file by bare name", () => {
    expect(srcPaths("settings", root)).toEqual([join(root, "core/settings.ts")]);
  });

  it("reads a split module whole, alphabetically", () => {
    expect(srcPaths("widgets", root)).toEqual([
      join(root, "ui/widgets/index.ts"),
      join(root, "ui/widgets/stepper.ts"),
    ]);
  });

  it("treats a file inside a directory of the same name as part of it", () => {
    expect(srcPaths("panels", root)).toEqual([join(root, "ui/panels/panels.ts")]);
  });

  it("throws on an ambiguous file name, naming both candidates", () => {
    // The pre-4.0.2 behaviour returned the top-level shadowed.ts here and said
    // nothing, which is how four test files could start reading a different
    // module. The assertion is on the message, not merely on throwing: an
    // ambiguous name must not fall through to the absent-name error either.
    let message = "";
    try {
      srcPaths("shadowed", root);
    } catch (err) {
      message = (err as Error).message;
    }

    expect(message).toContain('Ambiguous source module named "shadowed" — found 2');
    expect(message).toContain(join(root, "shadowed.ts"));
    expect(message).toContain(join(root, "core/shadowed.ts"));
    expect(message).toContain("Rename one, or add an entry to ALIASES in test/sources.ts");
  });

  it("throws on an ambiguous directory name", () => {
    expect(() => srcPaths("dupe", root)).toThrow(
      /Ambiguous source module named "dupe" — found 2/
    );
  });

  it("still names the absent case clearly", () => {
    expect(() => srcPaths("no-such-module", root)).toThrow(
      'No source module named "no-such-module"'
    );
  });
});
