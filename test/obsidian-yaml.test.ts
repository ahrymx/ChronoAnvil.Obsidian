// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { load as loadYaml, dump as dumpYaml } from "js-yaml";

import { ROOT, readAsset, readSrc, repoFile } from "./sources";

// ── the plugin no longer carries a YAML parser ────────────────────────────
//
// WHAT CHANGED. `trackers.ts` bundled `js-yaml` for exactly two calls — reading
// and rewriting `Diary.base` — and both now go through Obsidian's `parseYaml`
// and `stringifyYaml`. Same library underneath, since Obsidian bundles it; the
// difference is that a copy of it stops being compiled into `main.js`, and the
// two open advisories against it stop applying to anything a reader runs.
//
// THE ONE THING THE SWAP GIVES UP is `{ lineWidth: -1 }`. `stringifyYaml` takes
// no options, so whether a long value is folded across lines is Obsidian's
// choice now and not the plugin's. This file is here because that is a question
// about a host that cannot be run from a test — so rather than guess, it
// asserts the plugin is correct under EITHER answer.

const diaryBase = (): string => readAsset("diary.base");

// The two emissions Obsidian might plausibly produce. `-1` is what the plugin
// used to ask for and what the stub models; `80` is js-yaml's default and the
// pessimistic case, where every long scalar folds.
const NO_FOLD = { lineWidth: -1 } as const;
const FOLD_AT_80 = { lineWidth: 80 } as const;

describe("Diary.base survives a YAML round trip", () => {
  it("reparses to the same document, folded or not", () => {
    // THE PROPERTY THAT ACTUALLY MATTERS. `syncDiaryBase` reads the reader's
    // Diary.base, mutates the parsed document, and writes the whole file back.
    // Everything about the emitted text is negotiable except this: what Bases
    // reads out of it afterwards has to be what the plugin put in.
    const doc = loadYaml(diaryBase());

    expect(loadYaml(dumpYaml(doc, NO_FOLD))).toEqual(doc);
    expect(loadYaml(dumpYaml(doc, FOLD_AT_80))).toEqual(doc);
  });

  it("keeps the formula expression intact when it is folded", () => {
    // NAMED EXPLICITLY BECAUSE IT IS THE ONLY VALUE THAT CAN FOLD. The
    // `formulas.Type` expression is a 210-character single-quoted scalar — the
    // next longest line in the file is 39 — so it is the whole of the risk in
    // giving up `lineWidth`. If folding could corrupt anything here, it is
    // this, and it is worth failing on the value rather than on a deep-equal
    // that would only say "something changed".
    //
    // It survives because YAML folding breaks at a space and reads the break
    // back as that same single space. The assertion is that this is true of
    // THIS string, not that it is true in general.
    const formula = (d: unknown): string =>
      (d as { formulas: { Type: string } }).formulas.Type;

    const doc = loadYaml(diaryBase());
    const folded = dumpYaml(doc, FOLD_AT_80);

    expect(folded.split("\n").some((l) => l.length > 100)).toBe(false); // it did fold
    expect(formula(loadYaml(folded))).toBe(formula(doc));
    expect(formula(doc)).toContain('if(journal == "Yearly Entry"');
  });

  it("emits a document Bases can still read as a base", () => {
    // A round trip that produced valid YAML of the wrong SHAPE would pass the
    // check above and still break the view. These are the three top-level keys
    // Bases reads, and `views` is a list rather than a map.
    const out = loadYaml(dumpYaml(loadYaml(diaryBase()), NO_FOLD)) as Record<
      string,
      unknown
    >;

    expect(Object.keys(out)).toEqual(["filters", "formulas", "properties", "views"]);
    const views = out.views as { type: string }[];
    expect(Array.isArray(views)).toBe(true);
    expect(views.every((v) => v.type === "table")).toBe(true);
  });
});

describe("no YAML library reaches the bundle", () => {
  it("is imported from obsidian, not from js-yaml", () => {
    const trackers = readSrc("trackers");
    expect(trackers).toContain("parseYaml");
    expect(trackers).toContain("stringifyYaml");

    // Swept over the whole of src/ rather than trackers.ts alone: the failure
    // this guards against is the NEXT module that wants YAML reaching for the
    // package that is still installed for the test suite.
    for (const name of allSrc()) {
      expect(readFileSync(name, "utf8"), `${name} imports js-yaml`).not.toContain(
        'from "js-yaml"'
      );
    }
  });

  it("is not a runtime dependency", () => {
    const pkg = JSON.parse(repoFile("package.json"));
    expect(Object.keys(pkg.dependencies)).not.toContain("js-yaml");
    // Still installed, because test/obsidian-stub.ts backs parseYaml with it
    // and seed-vault.test.ts uses it as an oracle the plugin does not share.
    expect(Object.keys(pkg.devDependencies)).toContain("js-yaml");
  });
});

describe("NOTICE lists exactly what is bundled", () => {
  it("names every shipped third-party package and no other", () => {
    // A CONVEYED COPY CARRIES ITS NOTICES — the argument tools/package.mjs makes
    // for shipping LICENSE and NOTICE at all. The corollary is that the notice
    // has to be TRUE, and the way it stops being true is a dependency changing
    // without the file changing with it. That is exactly what happened here:
    // js-yaml left `dependencies` in 5.0.0 and its MIT block had to leave
    // NOTICE in the same commit.
    //
    // The lockfile's `dev` flag is the authority rather than `dependencies`,
    // because @kurkle/color is bundled and is not a direct dependency — it
    // comes in under chart.js, and a list built from package.json alone would
    // call its notice spurious.
    const lock = JSON.parse(repoFile("package-lock.json"));
    const bundled = new Set<string>();
    for (const [path, meta] of Object.entries(lock.packages) as [
      string,
      { dev?: boolean }
    ][]) {
      if (!path || meta.dev) continue;
      bundled.add(path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length));
    }

    const notice = repoFile("NOTICE");
    // Lowercased on both sides: NOTICE writes the project's own spelling of its
    // name ("Chart.js"), the registry writes the package id ("chart.js"), and
    // the notice should keep saying what its authors call it.
    const third = notice.slice(notice.indexOf("THIRD-PARTY COMPONENTS")).toLowerCase();

    for (const name of bundled) {
      expect(third, `NOTICE does not mention ${name}, which is bundled`).toContain(
        name.toLowerCase()
      );
    }
    expect(third, "NOTICE still credits js-yaml, which is no longer bundled").not.toContain(
      "js-yaml"
    );
  });

  it("agrees with the banner esbuild writes into main.js", () => {
    // TWO PLACES SAY THIS AND BOTH SHIP. NOTICE travels beside main.js in the
    // release zip; the banner is inside main.js and is the only form of the
    // notice a store install carries at all, since the installer writes three
    // files and NOTICE is not one of them. A list that is right in one and
    // stale in the other is the worse failure of the two, because the file
    // nobody edits is the one every reader holds.
    const banner = repoFile("esbuild.config.mjs");
    const claim = banner.slice(
      banner.indexOf("third-party code under the MIT licence"),
      banner.indexOf("See the NOTICE file")
    );

    expect(claim).toContain("Chart.js");
    expect(claim).toContain("@kurkle/color");
    expect(claim, "the main.js banner still credits js-yaml").not.toContain("js-yaml");
  });

  it("agrees with the prose in README.md and LICENSING.md", () => {
    // THE TWO THAT DRIFTED, AND WHY THEY COULD. The two assertions above hold
    // NOTICE and the banner, and both were corrected when js-yaml left the
    // bundle. But the same claim is written out twice more in prose — the
    // README's licence paragraph and LICENSING.md's dependency FAQ — and no
    // test read either, so both went on crediting a parser that is not in
    // main.js. A sentence naming what is bundled is an attribution statement
    // rather than a description, so it is held to the lockfile like the rest.
    //
    // Deriving the list from the lockfile rather than naming it here is the
    // point: the next dependency change breaks this test in four places at
    // once, which is the only way prose stays true to a build.
    const lock = JSON.parse(repoFile("package-lock.json"));
    const bundled = new Set<string>();
    for (const [path, meta] of Object.entries(lock.packages) as [
      string,
      { dev?: boolean }
    ][]) {
      if (!path || meta.dev) continue;
      bundled.add(path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length));
    }

    // One paragraph in each file, anchored on its opening words. The paragraph
    // rather than the file, because "MIT" and the package names both appear
    // elsewhere in passages that are not claims about the bundle.
    const claims: [string, string][] = [
      ["README.md", "Third-party components bundled into"],
      ["LICENSING.md", "ChronoAnvil bundles"],
    ];

    for (const [file, opening] of claims) {
      const text = repoFile(file);
      const start = text.indexOf(opening);
      expect(start, `${file} no longer says what is bundled`).toBeGreaterThan(-1);
      const end = text.indexOf("\n\n", start);
      const claim = (end === -1 ? text.slice(start) : text.slice(start, end)).toLowerCase();

      for (const name of bundled) {
        expect(claim, `${file} does not mention ${name}, which is bundled`).toContain(
          name.toLowerCase()
        );
      }
      expect(claim, `${file} still credits js-yaml, which is not bundled`).not.toContain(
        "js-yaml"
      );
    }
  });
});

// Every .ts under src/, for the import sweep above.
function allSrc(dir = join(ROOT, "src")): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((e) => {
      const p = join(dir, e);
      return statSync(p).isDirectory() ? allSrc(p) : e.endsWith(".ts") ? [p] : [];
    });
}
