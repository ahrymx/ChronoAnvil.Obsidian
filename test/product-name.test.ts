// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";

import { repoFile } from "./sources";

// ── one product, one name, in every file that carries it ──────────────────
//
// WHY THIS EXISTS. The rename to ChronoAnvil is the project's second. The first
// one — Almanac to a name dropped before it was ever released — reached the
// README, LICENSING.md, CONTRIBUTING.md, the manifest and the `main.js` banner,
// and did NOT reach LICENSE or NOTICE. Those two sat for a release naming a
// product that no longer existed, and they are not documentation: LICENSE:40
// states the attribution string a forker is obliged to reproduce, and it said a
// different string from the one the README told them to use.
//
// Nothing catches that by reading. Both files are correct-looking prose, they
// are edited once a year, and the contradiction only shows up if someone reads
// two documents side by side and notices the quoted strings differ.
//
// SO THE ASSERTION IS AGREEMENT, NOT SPELLING. It does not check that any file
// says "ChronoAnvil"; it derives the name from the manifest — the one place
// Obsidian itself reads — and requires every other file to match it.

const NAME = JSON.parse(repoFile("manifest.json")).name as string;
const ID = JSON.parse(repoFile("manifest.json")).id as string;

describe("the product has one name", () => {
  it("is the same in the manifest, the package and the repository URL", () => {
    const pkg = JSON.parse(repoFile("package.json"));
    expect(pkg.name).toBe(`obsidian-${ID}-plugin`);
    expect(pkg.homepage).toContain(`${NAME}.Obsidian`);
    expect(pkg.repository.url).toContain(`${NAME}.Obsidian`);
  });

  it("is the name the licence obliges a forker to credit", () => {
    // THE ONE THAT ACTUALLY BIT. Four documents quote this string and all four
    // have to quote the same one, because it is a term of the licence rather
    // than a description of the product.
    const attribution = `"${NAME}, originally developed by AhryMX"`;
    const italic = `*"${NAME}, originally developed by AhryMX"*`;

    expect(repoFile("LICENSE")).toContain(attribution);
    expect(repoFile("NOTICE")).toContain(attribution);
    expect(repoFile("README.md")).toContain(italic);
    expect(repoFile("LICENSING.md")).toContain(italic);
  });

  it("is protected by the naming clause wherever that clause is restated", () => {
    // Section 7d names the marks. LICENSING.md and NOTICE both paraphrase it
    // for a reader, and a paraphrase that omits the current name protects
    // nothing.
    for (const file of ["LICENSE", "NOTICE", "LICENSING.md", "README.md"]) {
      expect(repoFile(file), `${file} does not protect the name`).toContain(`"${NAME}"`);
    }
  });

  it("names the plugin in the banner compiled into main.js", () => {
    // For a community-store install this banner is the ONLY notice that
    // reaches the reader — the installer writes three files and NOTICE is not
    // one of them. See test/obsidian-yaml.test.ts on the same point.
    const banner = repoFile("esbuild.config.mjs");
    expect(banner).toContain(`${NAME} — a self-contained journaling`);
    expect(banner).toContain(`https://github.com/AhryMX/${NAME}.Obsidian`);
  });

  it("keeps Almanac only where it is history", () => {
    // ALMANAC IS NOT A TYPO — releases through 4.84 went out under it, so the
    // naming clause covers it and the migration tool still reads it. What must
    // not survive is Almanac as the CURRENT name, which is how LICENSE and
    // NOTICE went stale the first time.
    for (const file of ["LICENSE", "NOTICE", "LICENSING.md"]) {
      const text = repoFile(file);
      expect(text, `${file} still credits Almanac as the product`).not.toContain(
        '"Almanac, originally developed by AhryMX"'
      );
    }
    // And the name it was briefly given between the two is gone entirely: it
    // was never released, so no vault, no reader and no licence refers to it.
    //
    // `tools/migrate-vault.mjs` IS IN THIS SWEEP SINCE 5.3, and it is the entry
    // that makes the list a rule rather than a tidy-up. The tool carried a
    // `PRERELEASE_RULES` array, three `FILE_RENAMES` rows and a `chronoforge`
    // plugin-folder id — read-compatibility for vaults that could not exist,
    // kept only until the development vaults were migrated. They have been, the
    // tables are gone, and the migration a real reader needs is Almanac's
    // alone. What this pins is that nobody adds the dead one back by symmetry
    // with `RULES`.
    for (const file of [
      "LICENSE",
      "NOTICE",
      "LICENSING.md",
      "README.md",
      "manifest.json",
      "tools/migrate-vault.mjs",
    ]) {
      expect(repoFile(file), `${file} still mentions the unreleased name`).not.toContain(
        "ChronoForge"
      );
    }
    // The lowercase token too, which is the form a plugin-folder id and a
    // vault marker would wear — and the form the deleted tables were written in.
    expect(repoFile("tools/migrate-vault.mjs")).not.toContain("chronoforge");
  });
});
