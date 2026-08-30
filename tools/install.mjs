// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Copy the packaged plugin folder into a vault.
//
// THIS EXISTS BECAUSE `dist/` IS NOT A VAULT AND NOTHING SAID SO OUT LOUD.
// `package.mjs` assembles a complete plugin folder and prints *"Install: copy
// dist/chronoanvil/ into <vault>/.obsidian/plugins/"*, and that sentence was
// the entire install step: a hand copy, done from memory, outside the build.
//
// The failure mode is the quietest one this project has had. Every check passes
// — the suite is green, the package is assembled, the archive is written — and
// the plugin in Obsidian is whatever was last copied by hand. 4.47.0 was built,
// packaged and archived while the dev vault ran 4.45.1, and the report was
// *"the plugin doesn't seem to have been updated"*, which is exactly right and
// is not a bug in anything the build looked at.
//
// TWO RULES, AND THEY ARE WHY THIS IS A SCRIPT RATHER THAN A `cp`:
//
//   1. `data.json` IS THE READER'S SETTINGS AND IS NEVER TOUCHED. It lives in
//      the plugin folder beside the code, so `rm -rf` on the destination — the
//      obvious way to write this — deletes every journal, tracker and
//      preference in the vault. Files are copied ONE BY ONE, from a list.
//   2. WHAT IS INSTALLED IS WHAT WAS PACKAGED, and if `dist/` disagrees with
//      `manifest.json` the install is refused rather than done: a stale `dist/`
//      installed over a vault is the same silence one step further along.

import { cp, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

// The pieces `package.mjs` assembles, minus nothing: an install that copies
// main.js and forgets assets/ reproduces the bug that script was written for.
const PIECES = [
  { src: "main.js", dir: false },
  { src: "manifest.json", dir: false },
  { src: "styles.css", dir: false },
  { src: "assets", dir: true },
  { src: "LICENSE", dir: false },
  { src: "NOTICE", dir: false },
];

// NAMED, NOT GUESSED. A vault path is the one thing this script cannot derive,
// so it is taken from the command line, then the environment, and only then
// from the sibling development vault — which is a default for THIS tree and is
// announced whenever it is used.
function vaultPath() {
  const given = process.argv[2] ?? process.env.CHRONOANVIL_VAULT ?? null;
  if (given) return { dir: path.resolve(given), how: "given" };
  return { dir: path.resolve(ROOT, "..", "obsidian-dev-vault"), how: "default" };
}

async function main() {
  const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
  const built = path.join("dist", manifest.id);

  if (!existsSync(built)) {
    throw new Error(`${built}/ does not exist — run \`node tools/package.mjs\` first`);
  }

  // The version check is the whole point of refusing rather than warning: an
  // install is the last step where a stale build is still cheap to notice.
  const packaged = JSON.parse(await readFile(path.join(built, "manifest.json"), "utf8"));
  if (packaged.version !== manifest.version) {
    throw new Error(
      `${built}/ holds ${packaged.version} and this tree is ${manifest.version} — repackage first`
    );
  }

  const { dir: vault, how } = vaultPath();
  if (!existsSync(path.join(vault, ".obsidian"))) {
    throw new Error(
      `${vault} has no .obsidian/ — that is not a vault. Pass one: node tools/install.mjs <vault>`
    );
  }

  const dest = path.join(vault, ".obsidian", "plugins", manifest.id);
  const was = existsSync(path.join(dest, "manifest.json"))
    ? JSON.parse(await readFile(path.join(dest, "manifest.json"), "utf8")).version
    : null;

  for (const { src, dir } of PIECES) {
    await cp(path.join(built, src), path.join(dest, src), dir ? { recursive: true } : {});
  }

  // Said out loud because it is the reader's data and because a script that
  // touches a plugin folder should account for what it did NOT write.
  const settings = path.join(dest, "data.json");
  const kept = existsSync(settings) ? (await stat(settings)).size : 0;

  console.log(`✅ Installed ${manifest.id} ${manifest.version} -> ${dest}/`);
  console.log(`   ${was ? `was ${was}` : "fresh install"}${how === "default" ? " · default dev vault" : ""}`);
  console.log(`   data.json untouched${kept ? ` (${kept} bytes)` : " (none there)"}`);
  console.log("   OBSIDIAN WILL STILL BE RUNNING THE OLD CODE. Reload it:");
  console.log("   Settings → Community plugins → toggle ChronoAnvil off and on,");
  console.log("   or Ctrl+P → “Reload app without saving”.");
}

main().catch((e) => {
  console.error(`❌ Install failed: ${e.message}`);
  process.exit(1);
});
