// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { BUNDLED_ASSETS } from "../generated/bundled-assets";
import { Scaffold } from "../src/core/scaffold";
import { readSrc, ROOT } from "./sources";

// ── the shipped notes reach an install that has no assets/ folder ─────────
//
// THE BUG THIS FILE EXISTS FOR. `Scaffold.readAsset` read
// `manifest.dir + "/assets/<name>"` through the vault adapter. Obsidian's
// community installer writes manifest.json, main.js and styles.css into the
// plugin folder and creates no subdirectories, so for every reader who
// installed ChronoAnvil the ordinary way that path did not exist. The plugin
// loaded and rendered perfectly; "Set up / repair vault" then built the folder
// tree, skipped Diary.base, Staging.md and the documentation README without
// creating them, and finished on a notice about three missing assets.
//
// It was invisible for the whole of 4.x because tools/package.mjs copies
// assets/ into the zip and has guarded that since 2.10 — so every build anyone
// working on this plugin ever installed was a zip, which is the one shape of
// install that worked.
//
// The fix compiles assets/ into generated/bundled-assets.ts at build time and
// reads from there. What follows is the set of things that have to stay true
// for that to keep working, because none of them fail loudly on their own: a
// missing key returns null, and the copy loop `continue`s past a null.

const ASSETS = join(ROOT, "assets");

// The asset filenames scaffold.ts actually asks for, read out of its own
// table rather than listed here. A fourth shipped note added to `shippedNotes`
// is then covered by this file the moment it is written, which is the whole
// point — a list maintained by hand is a list that agrees with the code until
// the day it matters.
const named = (): string[] => {
  const src = readSrc("scaffold");
  return [...src.matchAll(/\{\s*asset:\s*"([^"]+)"/g)].map((m) => m[1]).sort();
};

describe("the notes this plugin ships travel inside the bundle", () => {
  it("finds every asset scaffold.ts names", () => {
    const asked = named();

    // A guard on the guard. If the regex above ever stops matching — the table
    // is reformatted, `asset:` is renamed — every assertion below would pass
    // over an empty list and this file would go quiet while asserting nothing.
    expect(asked.length).toBeGreaterThanOrEqual(3);

    for (const name of asked) {
      expect(
        Object.prototype.hasOwnProperty.call(BUNDLED_ASSETS, name),
        `scaffold.ts asks for "${name}" but it is not in the bundle. Either it ` +
          `is missing from assets/, or its extension is not in TEXT in ` +
          `tools/build-assets.mjs — in which case the build skipped it silently.`
      ).toBe(true);
    }
  });

  it("carries each one byte for byte", () => {
    // Catches a stale generated module: the file is gitignored and rebuilt by
    // `pretest`, so the failure mode is a run where the build did not happen and
    // the suite quietly asserts against the previous release's documentation.
    for (const [name, text] of Object.entries(BUNDLED_ASSETS)) {
      expect(text, `${name} in the bundle differs from assets/${name}`).toBe(
        readFileSync(join(ASSETS, name), "utf8")
      );
    }
  });

  it("bundles every file in assets/", () => {
    // TEXT in tools/build-assets.mjs filters by extension so that a screenshot
    // dropped into assets/ is not inlined as a UTF-8 string. That filter is
    // right, and it is also exactly how a fourth shipped note would go missing
    // — added as `.txt`, named in scaffold.ts, skipped by the build, and
    // reported only as a notice at the end of a repair. If assets/ ever holds
    // something that genuinely should not be inlined, narrow this test to the
    // notes rather than widening TEXT.
    expect(readdirSync(ASSETS).sort()).toEqual(Object.keys(BUNDLED_ASSETS).sort());
  });

  it("serves a note with no plugin folder and no vault to read from", () => {
    // THE STORE INSTALL, as close as this suite can stand it up. A `Scaffold`
    // handed neither an App nor a manifest.dir is exactly the shape of the
    // failure: before the fix this could not have returned anything, because
    // every route to the text went through `app.vault.adapter.read` against a
    // directory that does not exist on a community install.
    //
    // Reaching past `private` on purpose. The alternative is to assert this
    // through the copy loop, which needs a whole fake vault to answer a
    // question about one lookup.
    const scaffold = new Scaffold(
      undefined as never,
      { manifest: {} } as never
    ) as unknown as { readAsset(name: string): Promise<string | null> };

    return Promise.all(
      named().map(async (name) => {
        const text = await scaffold.readAsset(name);
        expect(text, `readAsset("${name}") came back empty`).toBe(
          readFileSync(join(ASSETS, name), "utf8")
        );
      })
    );
  });

  it("no longer reads assets through the vault adapter", () => {
    // The regression itself. A `readAsset` that falls back to the plugin folder
    // looks harmless and reintroduces the bug in a quieter form: an upgrade that
    // replaces main.js and leaves an old assets/ behind would serve the previous
    // release's notes over the ones the running build ships.
    const src = readSrc("scaffold");
    expect(src).not.toContain("/assets/${name}");
    expect(src).not.toMatch(/adapter\.read\([^)]*assets/);
  });
});
