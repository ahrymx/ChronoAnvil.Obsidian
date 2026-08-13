// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Assemble a complete, installable plugin folder in dist/.
//
// This exists because `npm run build` only ever produced main.js. Everything
// else an installed plugin needs was assumed to be already sitting in the
// vault's .obsidian/plugins/almanac/ directory — which is true when you develop
// in place, and false the moment anyone hands the plugin to someone else.
//
// The failure mode was quiet and total: scaffold.ts::readAsset resolves
// `manifest.dir + "/assets/<name>"` at *runtime*, so a plugin folder without
// assets/ loads and enables perfectly, then fails on first use — "Set up /
// repair vault" creates the folder tree and no notes, and "Refresh entry
// templates" refreshes nothing. Nothing in the build caught it because nothing
// in the build knew the folder had a required shape.
//
// So: one script that knows the shape, and fails loudly if a piece is missing.

import { cp, mkdir, rm, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Anchored to the repository, not to wherever it was invoked from.
//
// Every path below was relative to `process.cwd()`, which was fine while this
// script sat in the root and `npm run package` was the only caller. It moved to
// tools/ in 2.56.26 — it is a script, not a config, and the two scripts already
// here are how the project spells that — so `node tools/package.mjs` and
// `cd tools && node package.mjs` are both things a reader will now try. One of
// them would have silently packaged nothing.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

const OUT_DIR = "dist";

// Everything an installed Almanac plugin folder must contain. `dir: true`
// entries are copied recursively.
const REQUIRED = [
  { src: "main.js", dir: false },
  { src: "manifest.json", dir: false },
  { src: "styles.css", dir: false },
  { src: "assets", dir: true },

  // The licence files ship WITH the plugin, not just with the repository.
  //
  // Until 2.56.25 they did not, and that was a compliance bug rather than an
  // oversight of tidiness: AGPL-3.0 section 4 requires a copy of the licence to
  // travel with every conveyed copy, and the section 7 attribution terms only
  // bind someone who can read them. A plugin folder is exactly such a conveyed
  // copy — it is what a user installs, and for most users it is the ONLY form
  // of Almanac they will ever hold.
  //
  // TRADEMARK.md was on this list until 3.17.1 and the file no longer exists.
  // What it explained now lives in LICENSE's own section 7 terms, which ship
  // here anyway — so the recipient who may fork still receives the naming
  // terms, in the one file that binds them.
  { src: "LICENSE", dir: false },
  { src: "NOTICE", dir: false },
];

async function main() {
  const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
  const pkg = JSON.parse(await readFile("package.json", "utf8"));

  // A mismatch here ships a plugin that reports the wrong version in Obsidian's
  // UI while the repo says something else — cheap to check, annoying to debug.
  if (manifest.version !== pkg.version) {
    throw new Error(
      `version mismatch: manifest.json ${manifest.version} vs package.json ${pkg.version}`
    );
  }
  // AN UNRELEASED BUILD IS PACKAGED, AND SAYS SO. `versions.json` is what
  // Obsidian reads to decide what it may install, so a build that is not in it
  // has not shipped — which is exactly the state this repo is in while a testing
  // build is current, and refusing to package one made the honest state the
  // broken one. What is worth catching is a build that would go OUT with no
  // ledger entry, so this warns loudly rather than throwing.
  //
  // THE SAME RULE IS IN `tools/check-version-agreement.mjs` and in
  // `test/pure-logic.test.ts` ("keeps manifest, package and versions in step").
  // Three readers of one fact, kept apart only because a `.mjs` tool and the
  // suite have nothing to share; each names the others.
  const released = Object.prototype.hasOwnProperty.call(
    JSON.parse(await readFile("versions.json", "utf8")),
    manifest.version
  );

  const missing = REQUIRED.filter((f) => !existsSync(f.src)).map((f) => f.src);
  if (missing.length) {
    throw new Error(
      `missing before packaging: ${missing.join(", ")}` +
        (missing.includes("main.js") ? " — run `npm run build` first" : "")
    );
  }

  const dest = path.join(OUT_DIR, manifest.id);
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });

  for (const { src, dir } of REQUIRED) {
    await cp(src, path.join(dest, src), dir ? { recursive: true } : {});
  }

  // The templates are the assets whose absence is silent, so count them rather
  // than trusting that the directory copied.
  const assets = await readdir(path.join(dest, "assets"));
  if (assets.length === 0) throw new Error("assets/ copied but empty");

  console.log(`✅ Packaged ${manifest.id} ${manifest.version} -> ${dest}/`);
  console.log(`   ${REQUIRED.length - 1} files + assets/ (${assets.length} entries)`);
  if (!released) {
    console.log(
      `   ⚠️  ${manifest.version} is not in versions.json — this is a TESTING BUILD.`
    );
    console.log(
      "      Install it by hand; Obsidian will not offer it. Add the entry when it ships."
    );
  }
  console.log(`   Install: copy ${dest}/ into <vault>/.obsidian/plugins/`);
}

main().catch((e) => {
  console.error(`❌ Packaging failed: ${e.message}`);
  process.exit(1);
});
