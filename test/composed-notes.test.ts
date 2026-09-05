// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The composed notes, pinned byte for byte — and read back by the models that
// edit them.
//
// WHAT THIS IS FOR. The section machinery is four catalogue types and four
// parse/plan/apply implementations describing one object, being converged onto
// one of each. `test/golden-notes.ts` carries the argument for why the
// invariant is byte-equality and not "looks the same"; this file is the
// assertion.
//
// TWO HALVES, AND THE SECOND IS THE ONE THAT CATCHES PARSERS.
//
//   THE WRITE PATH is the fixture comparison. A composer that reorders one
//   line fails here, loudly, with a diff a reviewer can read.
//
//   THE READ PATH is the idempotence check. A parser that stops recognising a
//   section writes nothing wrong and composes nothing wrong — it reports the
//   block as foreign, or claims it twice, and the damage appears only when a
//   reader opens *Edit sections…* and presses Save. So every model is asked to
//   plan over the note its own catalogue just composed, and the only honest
//   answer is "nothing to do".
//
// REGENERATING THE FIXTURES. `UPDATE_GOLDEN=1 npx vitest run
// test/composed-notes.test.ts` writes them. Do that ONLY when a composed note
// is meant to change, and read the resulting diff before committing it — that
// diff is the change, and it is the one thing this file exists to put in front
// of somebody.

import { describe, expect, it, beforeAll } from "vitest";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./sources";
import { goldenNotes } from "./golden-notes";
import type { GoldenNote } from "./golden-notes";

const DIR = join(ROOT, "test", "golden");
const UPDATING = process.env.UPDATE_GOLDEN === "1";

const notes = goldenNotes();
const fileFor = (note: GoldenNote): string => join(DIR, `${note.name}.md`);

beforeAll(() => {
  if (!UPDATING) return;
  mkdirSync(DIR, { recursive: true });
  for (const note of notes) writeFileSync(fileFor(note), note.text, "utf8");
});

describe("every composed note is enumerated", () => {
  it("covers all nine composers", () => {
    // A FLOOR, because every assertion below iterates `notes`. An enumeration
    // that stopped enumerating would leave the loop empty and this whole file
    // would pass while asserting nothing — the failure `widget-registry.test.ts`
    // states its own floor to prevent.
    expect(notes.length).toBeGreaterThanOrEqual(30);
  });

  it("gives each note a name of its own", () => {
    // A DUPLICATE NAME IS A FIXTURE OVERWRITING ANOTHER, which would compare
    // one note twice and the other never — passing, silently, for whichever
    // surface came second.
    const seen = new Set<string>();
    const dupes = notes.filter((n) => !seen.has(n.name) ? (seen.add(n.name), false) : true);
    expect(dupes.map((n) => n.name)).toEqual([]);
  });

  it("composes something for every one of them", () => {
    for (const note of notes) {
      expect(note.text.trim().length, note.name).toBeGreaterThan(0);
    }
  });
});

describe("the composed notes are byte-identical to their fixtures", () => {
  for (const note of notes) {
    it(note.name, () => {
      const path = fileFor(note);
      expect(
        existsSync(path),
        `no fixture for ${note.name}. If this note is new, run ` +
          `UPDATE_GOLDEN=1 npx vitest run test/composed-notes.test.ts`
      ).toBe(true);
      expect(note.text).toBe(readFileSync(path, "utf8"));
    });
  }
});

describe("every model reads back the note its own catalogue composed", () => {
  for (const note of notes) {
    // WHY `present` IS THE `want`. The question is not "would the catalogue
    // compose this note again" — it is "does the model agree that this note
    // already has exactly the sections it has". Handing back what `present`
    // reported and getting a change out is the parser and the planner
    // disagreeing about one file, which is the state that loses a reader's
    // content on Save.
    it(`${note.name} — plans no change`, () => {
      const model = note.model();
      const present = model.present(note.text);
      expect(present.length, `${note.name}: nothing recognised`).toBeGreaterThan(0);
      const ops = model.plan(note.text, present);
      const moving = ops.filter((o) => o.kind !== "keep");
      expect(
        moving.map((o) => `${o.kind} ${o.sectionId ?? ""} — ${o.detail}`),
        note.name
      ).toEqual([]);
    });

    it(`${note.name} — writes no change`, () => {
      const model = note.model();
      const present = model.present(note.text);
      expect(model.apply(note.text, present), note.name).toBeNull();
    });

    it(`${note.name} — offers no section it already has`, () => {
      const model = note.model();
      const present = new Set(model.present(note.text));
      const offered = model
        .addable(note.text)
        .map((v) => v.id)
        .filter((id) => present.has(id));
      expect(offered, note.name).toEqual([]);
    });
  }
});

describe("the fixtures are checked in", () => {
  it("is not running in update mode", () => {
    // A GUARD ON THE ENVIRONMENT, so a `UPDATE_GOLDEN=1` left in a shell or a
    // CI file cannot turn every assertion above into a tautology that rewrites
    // its own expectation and passes.
    expect(UPDATING, "UPDATE_GOLDEN is set — the comparisons above rewrote their own fixtures").toBe(false);
  });
});
