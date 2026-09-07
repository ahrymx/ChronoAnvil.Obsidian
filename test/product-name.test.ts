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

  it("names one product in every reader-facing document", () => {
    // ── THE EARLIER NAME IS OUT OF THE PROSE, AND ONLY OUT OF THE PROSE (1.0.0)
    //
    // This case used to read "keeps Almanac only where it is history" and
    // asserted the narrower thing: that no document credited Almanac as the
    // CURRENT product, which is how LICENSE and NOTICE went stale the first
    // time. The name was allowed to stand as provenance — releases had gone out
    // under it, so the section 7 naming clause covered it and the README told a
    // reader how to migrate a vault written under it.
    //
    // 1.0.0 is the first release anyone can install, and the pre-release
    // history is not part of the repository any more. A naming clause listing a
    // name the repository never mentions protects nothing legible, and a
    // migration section for an era with no readers in it is an instruction
    // nobody can follow. So the four documents below carry ONE name.
    //
    // WHAT IS DELIBERATELY NOT SWEPT: `tools/migrate-vault.mjs`, and the
    // `almanac:` token read-compatibility across ten files in `src/`. Those are
    // not prose — they are how a vault written under the old spelling still
    // opens, and `test/legacy-tokens.test.ts` is their contract. Removing the
    // word from a document is a change to what this project SAYS; removing it
    // from those would be a change to what it can READ.
    for (const file of ["LICENSE", "NOTICE", "LICENSING.md", "README.md"]) {
      expect(
        repoFile(file).toLowerCase(),
        `${file} still names the pre-release product`
      ).not.toContain("almanac");
    }

    // And the name it was briefly given between the two is gone entirely: it
    // was never released, so no vault, no reader and no licence refers to it.
    //
    // `tools/migrate-vault.mjs` IS IN THIS SWEEP, and it is the entry that
    // makes the list a rule rather than a tidy-up. The tool carried a
    // `PRERELEASE_RULES` array, three `FILE_RENAMES` rows and a `chronoforge`
    // plugin-folder id — read-compatibility for vaults that could not exist,
    // kept only until the development vaults were migrated. They have been, the
    // tables are gone, and the one migration the tool performs is the one a
    // real vault needs. What this pins is that nobody adds the dead one back by
    // symmetry with `RULES`.
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
