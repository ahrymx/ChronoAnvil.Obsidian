// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Where a note's frontmatter is read from.
//
// `frontmatterOf` and `noteTypeOf` in core/util.ts are the two readers, and
// util.ts is the only file allowed to spell the cache call out. Before 5.2 that
// call was written by hand at thirty-four sites across twenty-one files, and
// the cost was not the repetition — it was that eight of them read the same
// `type:` property and three did something different with the answer.
// `isContainerFolder` compared the RAW value against a set of lowercase kind
// ids, so a folder note written `type: Lesson` was classed as a container while
// `type: lesson` was a leaf. entry-trackers.ts carries the account of the same
// bug the previous time it happened, one property over.
//
// So the rule is a sweep rather than a convention: a new site cannot be written
// by hand without this failing and naming the file it is in.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./sources";

const SRC = join(ROOT, "src");

const tsFilesUnder = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...tsFilesUnder(p));
    else if (entry.endsWith(".ts")) out.push(p);
  }
  return out;
};

// THE ONE SITE THAT CANNOT USE THE HELPER, stated here rather than left to be
// rediscovered. `frontmatterOf` answers `{}` for a file with no YAML block,
// which is the right answer for every caller that then reads a property out of
// it — and the wrong one for this caller, which distinguishes "the template
// file has no frontmatter" from "there is no template file" and treats the two
// differently. Widening the helper to return null would push that distinction
// onto the other thirty-three sites, every one of which would then need a `??
// {}` of its own, which is the expression this file exists to have deleted.
const ALLOWED: Record<string, string> = {
  "src/ui/widgets/bridge-widgets.ts":
    "distinguishes an absent frontmatter block from an absent file",
};

describe("frontmatter has one reader", () => {
  it("only core/util.ts calls getFileCache for frontmatter", () => {
    // `getFileCache` itself is NOT the target — a caller wanting headings,
    // links or tags is asking the cache a question `frontmatterOf` cannot
    // answer, and there are several. What is swept is the `.frontmatter`
    // access on its result, which is the one question that does have a home.
    const offenders: string[] = [];
    for (const p of tsFilesUnder(SRC)) {
      const rel = p.slice(ROOT.length + 1);
      if (rel === "src/core/util.ts" || rel in ALLOWED) continue;
      const text = readFileSync(p, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const m of text.matchAll(/getFileCache\([^)]*\)\s*\??\.\s*frontmatter/g)) {
        const line = text.slice(0, m.index).split("\n").length;
        offenders.push(`${rel}:${line}`);
      }
    }
    expect(
      offenders,
      "frontmatter read without frontmatterOf / noteTypeOf — import the helper " +
        "from core/util rather than spelling the cache call out again"
    ).toEqual([]);
  });

  it("reads the type property in one place", () => {
    // The narrower half, and the one the bug was in. Every reader of `type:`
    // goes through `noteTypeOf`, which normalises; a bare `["type"]` off a
    // frontmatter record is the shape that skipped normalisation at three of
    // the eight sites.
    const offenders: string[] = [];
    for (const p of tsFilesUnder(SRC)) {
      const rel = p.slice(ROOT.length + 1);
      if (rel === "src/core/util.ts") continue;
      const text = readFileSync(p, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const m of text.matchAll(/frontmatter\s*\??\.\s*\[\s*"type"\s*\]/g)) {
        const line = text.slice(0, m.index).split("\n").length;
        offenders.push(`${rel}:${line}`);
      }
    }
    expect(offenders, "raw `type:` reads — use noteTypeOf").toEqual([]);
  });
});
