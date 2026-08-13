// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "fs";
import { RETIRED_WORDS } from "../src/core/vocabulary";

import { readSrc } from "./sources";
// ── the words a reader sees ───────────────────────────────────────────────
//
// This test is the only thing that makes src/vocabulary.ts mean anything. The
// words it retires drifted three ways inside a single release when nothing was
// watching — "variant", "Template type" and "layout" all shipped for one
// concept in 2.54.7 — so the registry without the assertion is a wish.
//
// SCANS STRING LITERALS, NOT COMMENTS. A comment quoting a rule that has been
// retired is a record of what the rule was, and rewriting those would be
// revising the minutes. scaffold.ts still quotes "a journal type's templates
// are the user's" in its history, correctly.

// WALKS THE TREE, NOT THE TOP LEVEL.
//
// This read `readdirSync("src")` and filtered for `.ts`, which was the whole
// codebase until 2.56.25 grouped src/ into folders — and has been `main.ts`
// alone ever since. One file out of ninety-one, for four releases, by a test
// whose own comment says it is the only thing making vocabulary.ts mean
// anything. It passed the entire time.
//
// The failure is not the refactor's. A test that enumerates a directory is
// making a claim about the shape of the tree, and this one never said so out
// loud — so when the shape changed there was nothing to notice. Hence the
// count assertion below: the scan now states how much it expects to see, and a
// second collapse of the same kind fails instead of going quiet.
const SRC = "src";
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? walk(`${dir}/${e.name}`)
      : e.name.endsWith(".ts") && e.name !== "vocabulary.ts"
        ? [`${dir}/${e.name}`]
        : []
  );
}
const sources = walk(SRC).map((file) => ({
  file,
  text: readFileSync(file, "utf8"),
}));

// Every quoted string in a file, minus the ones on a line that has already
// opened a `//` comment before them.
const stringsIn = (text: string): string[] => {
  const out: string[] = [];
  const pattern = /(["`])((?:[^"`\\\n]|\\.)*?)\1/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    const lineStart = text.lastIndexOf("\n", m.index) + 1;
    if (text.slice(lineStart, m.index).includes("//")) continue;
    out.push(m[2]);
  }
  return out;
};

describe("retired words never reach a reader", () => {
  it("scans the whole source tree, not one directory of it", () => {
    // The guard on the guard. A number rather than "> 0" because the failure
    // being prevented was a scan that shrank to one file and stayed green:
    // "some files" would have passed throughout.
    expect(sources.length).toBeGreaterThan(80);
    expect(sources.some((s) => s.file.includes("/journals/"))).toBe(true);
    expect(sources.some((s) => s.file.includes("/diary/"))).toBe(true);
  });

  for (const { was, use } of RETIRED_WORDS) {
    it(`says "${use}" rather than "${was}"`, () => {
      const offenders: string[] = [];
      for (const { file, text } of sources) {
        for (const s of stringsIn(text)) {
          if (s.toLowerCase().includes(was)) offenders.push(`${file}: ${s}`);
        }
      }
      expect(offenders).toEqual([]);
    });
  }
});

describe("the words it does use", () => {
  it("names the journal container without qualifying it", () => {
    // "Journal type" was the old label and the collision: a JournalType is a
    // journal, and `type:` on a note holds the note type. Dropping the
    // qualifier is what makes the frontmatter correct rather than
    // contradictory.
    const settings = readSrc("settings");
    expect(settings).toContain('"Journals"');
    expect(settings).toContain("Add journal");
  });

  it("calls a note's kind its type, matching the frontmatter", () => {
    // The whole point. A reader taught "note type" in Settings opens a note,
    // reads `type: recipe`, and the word means what they were told.
    const editors = readSrc("settings-editors");
    expect(editors).toContain("Note types");
  });

  it("qualifies a folder level so it cannot be heard as a section", () => {
    const editors = readSrc("settings-editors");
    expect(editors).toContain("folder level");
  });
});

describe("the frontmatter key is untouched", () => {
  it("still writes type:", () => {
    // The half of the rename that was NOT done, deliberately. Renaming the key
    // would touch every note in every vault and would still leave the
    // reader-facing collision unless the labels moved too — so the labels
    // moved and the key stayed. If this ever fails, the expensive half has
    // been done by accident.
    const sections = readSrc("journal-sections");
    expect(sections).toContain("type: ");
    expect(sections).not.toContain("kind: ${");
  });
});

describe("the docs agree with the UI", () => {
  it("uses the current words in the reference sections", () => {
    // The README was cut down in 2.56.25 and its reference material moved to
    // docs/. Both are reader-facing, so both are held to the current words —
    // the check widened rather than narrowed when the file split. In 4.0.1,
    // the reader-facing CHANGELOG.md joined the held set.
    for (const f of ["README.md", "docs/reference.md", "docs/what-it-replaces.md", "CHANGELOG.md"]) {
      const text = readFileSync(f, "utf8").toLowerCase();
      for (const { was } of RETIRED_WORDS) {
        expect(text, `${f} uses the retired word "${was}"`).not.toContain(was);
      }
    }
  });

  it("leaves the dev log as written", () => {
    // A changelog is a record of what was said at the time. Rewriting old
    // entries to use new words would make the history claim a consistency it
    // did not have, and the 2.55.0 entry explaining the rename would sit above
    // entries that appear never to have needed it.
    //
    // The log lived in the README under "## Dev log" until 2.56.25, when it
    // moved to CHANGELOG.md unchanged. In 4.0.1 it moved to docs/dev-log.md.
    // This asserts the old words survived the move — if the log is ever
    // regenerated or tidied, this fails, which is the point.
    const log = readFileSync("docs/dev-log.md", "utf8");
    expect(log.toLowerCase()).toContain("journal type");
  });

  it("uses the current words in the in-vault documentation", () => {
    const docs = readFileSync("assets/documentation.md", "utf8");
    for (const { was } of RETIRED_WORDS) {
      expect(docs.toLowerCase()).not.toContain(was);
    }
  });
});
