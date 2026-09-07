// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Compiles assets/ into a TypeScript module so the bundle carries its own
// shipped notes.
//
// WHY THIS EXISTS: THE COMMUNITY INSTALLER COPIES THREE FILES.
//
// Obsidian's community-plugin installer downloads `manifest.json`, `main.js`
// and `styles.css` from a release and writes them into the plugin folder. It
// does not create subdirectories, and it has no notion of a plugin needing a
// fourth thing. `Scaffold.readAsset` resolved `manifest.dir + "/assets/<name>"`
// against the vault adapter at RUNTIME, so a store install loaded and enabled
// perfectly, and then "Set up / repair vault" — the first thing the README
// tells a new reader to do — created the folder tree, skipped `Diary.base`,
// `Staging.md` and the documentation README, and finished with a notice saying
// three bundled assets were missing.
//
// `tools/package.mjs` has described that exact failure since 2.10 and fixes it
// for the ZIP, which is the artefact a hand-install uses. The store never sees
// the zip. So the assets have to travel inside `main.js`, which is the one file
// every install route is guaranteed to carry.
//
// WHY GENERATED RATHER THAN HAND-WRITTEN. The alternative was to move the three
// files into a catalogue the way `home.md` and `search.md` went in 3.11 — the
// project's usual direction, and right for a note whose content is structure.
// It is wrong for these three. `documentation.md` is 95 KB of prose that gets
// edited as prose; putting it inside a TypeScript template literal makes every
// backtick and every `${` in a worked example a build hazard, and makes the
// file unreadable in the one place it most needs to stay readable. So the
// markdown stays markdown, and the build does the escaping — with
// `JSON.stringify`, which cannot be wrong about a quote.
//
// WHY NOT AN ESBUILD TEXT LOADER, which is the obvious answer. A loader teaches
// esbuild to import `.md`, and teaches nothing to `tsc --noEmit` or to vitest —
// both of which read this tree without going through esbuild. That is two more
// configurations to keep in step with this one, to save a file. A generated
// module is plain TypeScript: every tool already understands it.
//
// WHY `generated/` AND NOT `src/`. Several suites walk `src/**/*.ts` and assert
// things about what they find there — vocabulary.test.ts scans every string
// literal for retired words, and others enumerate module names. A 95 KB string
// of documentation is not a source module and should not answer those
// questions; `assets/documentation.md` is already checked directly, by name.
// tsconfig.json includes `generated/` so the module still typechecks.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "assets");
const OUT_DIR = join(ROOT, "generated");
const OUT = join(OUT_DIR, "bundled-assets.ts");

// The files that are NOTES rather than assets of some other kind. Today that is
// everything in the directory, and the filter exists so that adding a
// screenshot or a font to assets/ later does not silently inline a binary as a
// UTF-8 string. A new note extension goes here, and `scaffold.ts` names the
// file itself — see BUNDLED_ASSETS's use there.
const TEXT = [".md", ".base"];

export function buildAssets() {
  if (!existsSync(SRC)) {
    throw new Error(
      `No assets/ directory at ${SRC}. generated/bundled-assets.ts is built ` +
        `from it, and the plugin's shipped notes live there.`
    );
  }

  const names = readdirSync(SRC)
    .filter((f) => TEXT.some((ext) => f.endsWith(ext)))
    .sort();

  if (names.length === 0) {
    throw new Error(
      `assets/ contains no ${TEXT.join(" or ")} files. Every note this plugin ` +
        `ships would be missing from the bundle.`
    );
  }

  // JSON.stringify, NOT a template literal. The content is arbitrary markdown:
  // documentation.md contains backticks by the hundred, fenced examples, and at
  // least one `${` inside a worked example. A template literal would need three
  // separate escapes applied in the right order, and getting one wrong produces
  // a file that still compiles and ships the wrong text. A JSON string has one
  // escaping rule and this is it.
  const entries = names
    .map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(readFileSync(join(SRC, n), "utf8"))},`)
    .join("\n");

  const text = `// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// GENERATED FILE — DO NOT EDIT, AND DO NOT COMMIT.
//
// Written by tools/build-assets.mjs from assets/. Edit the markdown in assets/
// and rebuild; anything typed here is overwritten on the next build.
//
// This module exists so the shipped notes travel inside main.js. Obsidian's
// community installer copies manifest.json, main.js and styles.css and nothing
// else, so an asset read from the plugin folder at runtime does not exist for
// anyone who installed from the store. See tools/build-assets.mjs for the whole
// argument.

/** Every note this plugin ships, keyed by its filename under assets/. */
export const BUNDLED_ASSETS: Readonly<Record<string, string>> = {
${entries}
};
`;

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, text, "utf8");
  return { files: names.length, bytes: Buffer.byteLength(text, "utf8") };
}

// Runnable on its own (`node tools/build-assets.mjs`) as well as importable.
if (process.argv[1] && process.argv[1].endsWith("build-assets.mjs")) {
  const { files, bytes } = buildAssets();
  console.log(
    `✅ generated/bundled-assets.ts ← ${files} assets (${(bytes / 1024).toFixed(0)} KB)`
  );
}
