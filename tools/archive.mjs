// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// File this build, and prove the file is not hollow.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────
//
// The two archives were made by hand until 4.34.4, and by hand is how they went
// wrong: three times in one session a `tar` ran in a subshell that had inherited
// a `cd` from earlier on the same command line, and wrote a valid, correctly
// named, 410-byte archive of nothing. Exit code 0 every time. The only symptom
// was the file size, and the only reason it was caught is that somebody happened
// to run `ls`.
//
// An archive is opened for the first time on the day it is the only copy of
// something. This repo has no git — `RESUME.md` itself was once restored from
// `almanac-source-4.21.3.zip`, and its own header says so — which makes a hollow
// archive not an inconvenience but the loss it was written to prevent.
//
// ── THE THREE THINGS IT DOES THAT A COMMAND LINE DOES NOT ────────────────
//
//   1. It has no cwd to be wrong about. Every path is resolved from this file,
//      and `zip` is TOLD where to run rather than the process being moved there.
//   2. It reads back what it wrote. A zip that does not contain what its name
//      claims is deleted rather than left to be believed later.
//   3. It refuses to file a stale build under a new number — the one error
//      verification cannot catch, because everything in the archive is real.

import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// THE REPOSITORY, FROM THIS FILE, AND NEVER FROM THE CALLER. `tools/package.mjs`
// anchors itself the same way and says why: `node tools/archive.mjs` and
// `cd tools && node archive.mjs` are both things a reader will try.
//
// AND THE PROCESS NEVER MOVES ITSELF, which is the difference from that file and
// the whole point of this one. A script that changes its own working directory
// leaves every line after it depending on where it got to; every `zip` below is
// handed the directory to run in instead.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Where the two records live, beside the working tree rather than inside it —
// an archive of a tree cannot live in the tree it archives.
const BUILDS = path.resolve(ROOT, "..", "almanac-builds");
const SOURCES = path.resolve(ROOT, "..", "almanac-source");

// The built plugin folder `npm run package` assembles.
const DIST = path.join(ROOT, "dist", "ahrymx.almanac");

// What never goes into the source archive.
//
// `dist` IS THE INTERESTING ONE. It is the build, and the build already has an
// archive of its own beside this one — two copies of it in two files that drift
// the first time either is rebuilt. `node_modules` is the obvious one and would
// take the zip from four megabytes to two hundred.
//
// `.git` WAS MISSING AND WENT UNNOTICED UNTIL 4.36, because the working tree
// had none — every archive before this one was taken from a directory with no
// repository in it, so the omission cost nothing and looked like a decision.
// The first archive taken beside a `.git` swept 849 files in and took the zip
// from 3.5MB to 9.7MB, most of it object history.
//
// AND SIZE IS THE SMALLER HALF. A source archive is a snapshot of the TREE at
// one version; a repository inside it carries every other version as well, plus
// remotes, credentials in a config, and whatever is on branches nobody meant to
// hand over. A snapshot that contains its own history is not a snapshot.
const SOURCE_SKIP = new Set(["node_modules", "dist", ".git", "docs"]);

// What each archive must contain to be worth keeping. Read back OUT of the file
// on disk, not asserted about the directory that went in.
const PLUGIN_MUST_HOLD = [
  "ahrymx.almanac/manifest.json",
  "ahrymx.almanac/main.js",
  "ahrymx.almanac/styles.css",
  "ahrymx.almanac/assets/",
];
const SOURCE_MUST_HOLD = ["/src/", "/test/", "/package.json", "/manifest.json"];

// Run a command and hand back its output.
//
// `from` DEFAULTS TO THE REPOSITORY rather than to wherever node was started,
// so a caller that forgets it still cannot be wrong — the failure this file
// exists to stop is exactly a command that ran somewhere nobody meant.
function run(cmd, args, from = ROOT) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: from });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`${cmd} exited ${code}: ${err.trim() || out.trim()}`))
    );
  });
}

// Open the archive and check it holds what its name claims.
//
// THE WHOLE POINT OF THE SCRIPT. Writing a file proves nothing: a hollow zip is
// a valid zip, and the three that were written by hand were all valid.
//
// AND IT DELETES RATHER THAN WARNING, which is the half that is easy to soften.
// A hollow archive left on disk is indistinguishable from a good one at a glance
// and will be believed on the day it is needed; a missing one fails loudly at
// the moment somebody could still do something about it.
async function verify(archive, mustHold, leastFiles) {
  const listing = await run("unzip", ["-l", archive]);
  const missing = mustHold.filter((entry) => !listing.includes(entry));
  const files = Number(/(\d+)\s+files?\s*$/.exec(listing.trim())?.[1] ?? 0);
  if (missing.length === 0 && files >= leastFiles) return files;
  await rm(archive, { force: true });
  throw new Error(
    `${path.basename(archive)} did not contain what it claims — ` +
      `${files} files, missing ${missing.join(", ") || "nothing named"}. ` +
      `The archive has been deleted rather than left to be trusted.`
  );
}

// Refuse to overwrite one that is already there.
//
// AN ARCHIVED VERSION IS THE RECORD OF WHAT SHIPPED UNDER THAT NUMBER, and this
// repo has no git to recover one from. `--force` is the way to say it on purpose.
async function claim(archive, force) {
  if (!existsSync(archive)) return;
  if (!force) {
    throw new Error(
      `${path.basename(archive)} already exists. Pass --force to replace it, ` +
        `or bump the version if this is a new build.`
    );
  }
  await rm(archive, { force: true });
}

async function main() {
  const force = process.argv.includes("--force");

  const manifest = JSON.parse(
    await readFile(path.join(ROOT, "manifest.json"), "utf8")
  );
  const version = manifest.version;

  // ── THE STALE BUILD, WHICH VERIFICATION CANNOT CATCH ──────────────────
  //
  // Bump the version, archive, forget to package: every file in the zip is real,
  // every path is where it should be, and what has been filed under the new
  // number is the PREVIOUS build. The only witness is the manifest inside the
  // built folder, so that is what gets asked.
  const folder = DIST;
  if (!existsSync(folder)) {
    throw new Error(
      `No built plugin at ${path.relative(ROOT, folder)} — run \`npm run package\` first.`
    );
  }
  const built = JSON.parse(
    await readFile(path.join(folder, "manifest.json"), "utf8")
  );
  if (built.version !== version) {
    throw new Error(
      `The built plugin says ${built.version} and this repo says ${version}. ` +
        `Run \`npm run package\` so the archive is of the build you mean.`
    );
  }

  await mkdir(BUILDS, { recursive: true });
  await mkdir(SOURCES, { recursive: true });

  // ── the plugin ────────────────────────────────────────────────────────
  const pluginZip = path.join(BUILDS, `ahrymx.almanac-${version}-plugin.zip`);
  await claim(pluginZip, force);
  // TOLD WHERE TO RUN. `dist` is the cwd so the archive opens onto
  // `ahrymx.almanac/`, which is the folder a reader drops into their vault.
  await run("zip", ["-rq", pluginZip, "ahrymx.almanac"], path.join(ROOT, "dist"));
  const pluginFiles = await verify(pluginZip, PLUGIN_MUST_HOLD, 5);

  // ── the source ────────────────────────────────────────────────────────
  //
  // STAGED, BECAUSE THE ARCHIVE HAS A NAMED FOLDER AT ITS ROOT and every one
  // since 4.10 has had one. `zip` writes the paths it is given, so the only way
  // to a top-level `almanac-source-<version>/` is for one to exist — which is
  // also what makes `SOURCE_SKIP` a filter on a copy rather than a list of
  // `-x` patterns nobody can read.
  const name = `almanac-source-${version}`;
  const sourceZip = path.join(SOURCES, `${name}.zip`);
  await claim(sourceZip, force);
  const staging = await mkdtemp(path.join(tmpdir(), "almanac-archive-"));
  try {
    await cp(ROOT, path.join(staging, name), {
      recursive: true,
      filter: (from) => !SOURCE_SKIP.has(path.relative(ROOT, from)),
    });
    await run("zip", ["-rq", sourceZip, name], staging);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  const sourceFiles = await verify(sourceZip, SOURCE_MUST_HOLD, 100);

  const size = async (f) => `${Math.round((await stat(f)).size / 1024)} KB`;
  console.log(
    `✅ Archived ${version}\n` +
      `   ${path.relative(ROOT, pluginZip)} — ${pluginFiles} files, ${await size(pluginZip)}\n` +
      `   ${path.relative(ROOT, sourceZip)} — ${sourceFiles} files, ${await size(sourceZip)}`
  );
}

main().catch((err) => {
  console.error(`❌ Archive failed: ${err.message}`);
  process.exit(1);
});
