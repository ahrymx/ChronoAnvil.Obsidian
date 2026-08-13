// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

function parseSemver(v) {
  const parts = v.split(".").map((p) => parseInt(p, 10));
  return parts.length === 3 && parts.every((n) => !isNaN(n)) ? parts : [0, 0, 0];
}

function compareSemver(a, b) {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

async function checkVersions() {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  const manifest = JSON.parse(await readFile("manifest.json", "utf8"));
  const versions = JSON.parse(await readFile("versions.json", "utf8"));

  const pkgVersion = pkg.version;
  const manifestVersion = manifest.version;
  const firstVersionInJSON = Object.keys(versions)[0];

  const allVersions = Object.keys(versions);
  const highestSemverVersion = allVersions.reduce((max, cur) =>
    compareSemver(cur, max) > 0 ? cur : max
  );

  if (pkgVersion !== manifestVersion) {
    throw new Error(
      `Version mismatch: package.json (${pkgVersion}) vs manifest.json (${manifestVersion})`
    );
  }

  // A BUILD THE LEDGER DOES NOT LIST IS A BUILD THAT HAS NOT SHIPPED, and this
  // repo is deliberately in that state whenever a testing build is current.
  //
  // `versions.json` is what Obsidian reads to decide which release a given app
  // version may install, so putting an unreleased number in it is how a testing
  // build gets offered to people. The checks below used to require the current
  // version to BE in the ledger — as its first key, and as its highest semver —
  // which made "not shipped yet" indistinguishable from "somebody forgot", and
  // made the honest state the failing one.
  //
  // So membership decides which rules apply. THE SAME RULE IS IN
  // `test/pure-logic.test.ts` ("keeps manifest, package and versions in step").
  // Two readers of one fact, kept two spellings only because this file is a
  // standalone `.mjs` with nothing to import from the suite; each names the
  // other so a change to one is a change somebody goes looking for.
  const registeredMinApp = versions[pkgVersion];

  if (registeredMinApp === undefined) {
    // Unreleased. The one thing still worth checking is that the ledger itself
    // is well formed and that its head is a real version — a malformed file is
    // just as broken on a day nothing is being released.
    if (firstVersionInJSON !== highestSemverVersion) {
      throw new Error(
        `versions.json is out of order: first key is ${firstVersionInJSON}, highest is ${highestSemverVersion}`
      );
    }
    console.log(
      `✅ Version agreement clean: ${pkgVersion} is an unreleased build ` +
        `(ledger head: ${highestSemverVersion}). Add it to versions.json when it ships.`
    );
    return;
  }

  // Released: it is the head of the ledger, and it agrees about minAppVersion.
  if (pkgVersion !== firstVersionInJSON) {
    throw new Error(
      `Version mismatch: package.json (${pkgVersion}) is not the first key in versions.json (${firstVersionInJSON})`
    );
  }

  if (pkgVersion !== highestSemverVersion) {
    throw new Error(
      `Version mismatch: package.json (${pkgVersion}) is not the highest semver key in versions.json (${highestSemverVersion})`
    );
  }

  if (registeredMinApp !== manifest.minAppVersion) {
    throw new Error(
      `minAppVersion mismatch for ${pkgVersion}: manifest.json (${manifest.minAppVersion}) vs versions.json (${registeredMinApp})`
    );
  }

  console.log(`✅ Version agreement clean: ${pkgVersion} (minAppVersion: ${registeredMinApp})`);
}

checkVersions().catch((err) => {
  console.error(`❌ Version agreement check failed: ${err.message}`);
  process.exit(1);
});
