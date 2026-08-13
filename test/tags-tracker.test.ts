// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

import { describe, it, expect } from "vitest";
import {
  addTag,
  hasTag,
  normaliseTag,
  readTags,
  removeTag,
  renameTag,
  tagsValue,
  TAGS_PROPERTY,
} from "../src/trackers/tags";
import {
  anySurface,
  diarySurface,
  diaryClassOf,
  diaryClassesOf,
  describeSurfaceLabel,
  isJournalSurface,
  journalSurface,
  normalizeTrackers,
  surfaceAcceptsType,
  surfaceAdmits,
  surfaceKey,
} from "../src/trackers/trackers";
import { readSrc } from "./sources";

const tagsDef = () =>
  normalizeTrackers([], false).find((t) => t.builtin === "tags");

// ── what a tag is ─────────────────────────────────────────────────────────

describe("normaliseTag", () => {
  it("takes what a reader types out of a note", () => {
    // They are copying `#reading` off the page, so the hash comes with it.
    expect(normaliseTag("#reading")).toBe("reading");
    expect(normaliseTag("  #reading  ")).toBe("reading");
  });

  it("converts spaces rather than refusing them", () => {
    // The thing a reader will type is English. A dialogue that rejects "deep
    // work" without saying what it wanted is worse than one that shows what it
    // is about to write.
    expect(normaliseTag("deep work")).toBe("deep-work");
    expect(normaliseTag("deep   work")).toBe("deep-work");
  });

  it("keeps nesting, and keeps case", () => {
    // Obsidian nests on `/` and matches case-insensitively while preserving
    // what you wrote. Folding case here would silently rewrite the reader's
    // spelling on every save.
    expect(normaliseTag("year/2026")).toBe("year/2026");
    expect(normaliseTag("Reading")).toBe("Reading");
  });

  it("refuses what Obsidian's parser would not claim", () => {
    // An all-numeric tag is a number in running text; the parser skips it, so
    // writing one would produce a frontmatter entry the tag pane never shows.
    expect(normaliseTag("2026")).toBeNull();
    expect(normaliseTag("#2026")).toBeNull();
    // Punctuation Obsidian does not allow in a tag.
    expect(normaliseTag("read:ing")).toBeNull();
    expect(normaliseTag("what?")).toBeNull();
    expect(normaliseTag("")).toBeNull();
    expect(normaliseTag("#")).toBeNull();
  });
});

// ── what a note carries ───────────────────────────────────────────────────

describe("readTags", () => {
  it("reads the list Obsidian writes", () => {
    expect(readTags(["reading", "deep-work"])).toEqual(["reading", "deep-work"]);
  });

  it("reads a hand-written string, and a comma-separated one", () => {
    // Both are valid YAML for this property and both are what that note MEANS.
    // Only the list is ever written back.
    expect(readTags("reading")).toEqual(["reading"]);
    expect(readTags("reading, deep work")).toEqual(["reading", "deep-work"]);
  });

  it("dedupes case-insensitively, keeping the first spelling", () => {
    expect(readTags(["Reading", "reading"])).toEqual(["Reading"]);
  });

  it("drops what it cannot parse from the MODEL, not from the note", () => {
    // Nothing in this module writes. A tag the reader hand-wrote that this
    // cannot read simply is not offered for editing — it is not deleted,
    // because deletion only ever happens through a draft the reader saved.
    expect(readTags(["reading", "2026", 7, null])).toEqual(["reading"]);
    expect(readTags(undefined)).toEqual([]);
    expect(readTags({})).toEqual([]);
  });
});

// ── the three edits ───────────────────────────────────────────────────────

describe("the edits are pure and idempotent", () => {
  it("adds once", () => {
    expect(addTag(["a"], "b")).toEqual(["a", "b"]);
    expect(addTag(["a"], "a")).toEqual(["a"]);
    expect(addTag(["a"], "A")).toEqual(["a"]);
    expect(addTag(["a"], "#b")).toEqual(["a", "b"]);
  });

  it("refuses to add what is not a tag, without disturbing the list", () => {
    expect(addTag(["a"], "??")).toEqual(["a"]);
  });

  it("removes case-insensitively, and removing an absent tag is a no-op", () => {
    expect(removeTag(["a", "b"], "A")).toEqual(["b"]);
    expect(removeTag(["a"], "z")).toEqual(["a"]);
  });

  it("renames in place, keeping the tag's position", () => {
    // A rename is not a removal followed by an addition. If it were, fixing a
    // typo would reshuffle the note's list every time.
    expect(renameTag(["a", "b", "c"], "b", "beta")).toEqual(["a", "beta", "c"]);
  });

  it("merges when renaming onto a tag the note already has", () => {
    expect(renameTag(["a", "b"], "a", "b")).toEqual(["b"]);
    expect(renameTag(["a", "b", "c"], "c", "a")).toEqual(["a", "b"]);
  });

  it("leaves the list alone when the new name is unusable", () => {
    // The dialogue keeps the old tag rather than dropping it: silently
    // deleting a tag somebody meant to keep is the failure worth avoiding.
    expect(renameTag(["a", "b"], "a", "??")).toEqual(["a", "b"]);
  });

  it("does not mutate its input", () => {
    const before = ["a", "b"];
    addTag(before, "c");
    removeTag(before, "a");
    renameTag(before, "a", "z");
    expect(before).toEqual(["a", "b"]);
  });

  it("answers membership the way Obsidian matches", () => {
    expect(hasTag(["Reading"], "reading")).toBe(true);
    expect(hasTag(["Reading"], "read")).toBe(false);
  });
});

describe("what gets written back", () => {
  it("deletes the key rather than writing an empty list", () => {
    // `tags: []` is YAML noise Obsidian's property editor then offers to fill
    // in forever. A note that had no tags, gained one and lost it again should
    // read exactly as it did before anyone opened the window.
    expect(tagsValue([])).toBeNull();
    expect(tagsValue(["a"])).toEqual(["a"]);
  });

  it("writes Obsidian's own property, not one of ours", () => {
    // The whole point of the tracker: the tag pane, `tag:` search and this
    // plugin's own `tag-index` all key off the property Obsidian defines.
    expect(TAGS_PROPERTY).toBe("tags");
    expect(tagsDef()?.id).toBe("tags");
  });
});

// ── the global surface ────────────────────────────────────────────────────

describe("a third surface kind", () => {
  it("admits every note, of every grain and every journal type", () => {
    for (const note of [
      diarySurface("daily"),
      diarySurface("yearly"),
      journalSurface("study"),
      journalSurface("cooking"),
    ]) {
      expect(surfaceAdmits(anySurface(), note)).toBe(true);
    }
    expect(surfaceAcceptsType(anySurface(), "anything")).toBe(true);
  });

  it("is not a wildcard on both sides", () => {
    // A NOTE is never `any` — `surfaceOf` resolves one concrete grain or one
    // type — so this asymmetry is the guard that stops a daily tracker being
    // admitted to everything by an accidental `any` on the other side.
    expect(surfaceAdmits(diarySurface("daily"), anySurface())).toBe(false);
  });

  it("answers the questions it has no answer to with nothing", () => {
    // It measures no period, so it has no class and is not a journal surface.
    // These are the same empty answers the model already gives for the
    // surfaces that cannot answer them, which is what let the third kind land
    // without a branch in every caller.
    expect(diaryClassesOf(anySurface())).toEqual([]);
    expect(diaryClassOf(anySurface())).toBeNull();
    expect(isJournalSurface(anySurface())).toBe(false);
  });

  it("has its own key and its own label", () => {
    expect(surfaceKey(anySurface())).toBe("any");
    expect(surfaceKey(anySurface())).not.toBe(surfaceKey(diarySurface("daily")));
    expect(describeSurfaceLabel(anySurface())).toBe("Any note");
  });

  it("survives a round trip through normalisation", () => {
    // A built-in's surface is re-asserted from its template on every load, so
    // a `data.json` that was hand-edited to move Tags onto Tuesdays is
    // corrected rather than carried forward.
    const moved = normalizeTrackers(
      [{ id: "tags", label: "Tags", type: "tags", builtin: "tags", surface: diarySurface("daily"), showInTemplate: true, showInBase: true }],
      false
    ).find((t) => t.builtin === "tags");
    expect(moved?.surface).toEqual(anySurface());
  });
});

// ── the built-in ──────────────────────────────────────────────────────────

describe("the Tags built-in", () => {
  it("exists in a fresh vault without being seeded per anything", () => {
    expect(tagsDef()).toBeDefined();
    expect(tagsDef()?.type).toBe("tags");
  });

  it("is global and never automatic", () => {
    // The ask, in one assertion: on every note, on no template, in no column.
    expect(tagsDef()?.surface).toEqual(anySurface());
    expect(tagsDef()?.showInTemplate).toBe(false);
    expect(tagsDef()?.showInBase).toBe(false);
  });

  it("stays off the template and out of the base however data.json arrives", () => {
    const forced = normalizeTrackers(
      [{ id: "tags", label: "Tags", type: "tags", builtin: "tags", surface: anySurface(), showInTemplate: true, showInBase: true }],
      true
    ).find((t) => t.builtin === "tags");
    expect(forced?.showInTemplate).toBe(false);
    expect(forced?.showInBase).toBe(false);
  });

  it("cannot be created by hand in the tracker editor", () => {
    // A second tracker writing a list into `tags` would be two windows editing
    // one property with no way to say which won — the reason `derived` is not
    // creatable either.
    const src = readSrc("settings-editors");
    const at = src.indexOf("export const CREATABLE_TRACKER_TYPES");
    const list = src.slice(at, src.indexOf("];", at));
    expect(list).not.toContain('"tags"');
    expect(src).toContain("for (const value of CREATABLE_TRACKER_TYPES)");
  });

  it("draws no label of its own, because the wrapper draws one", () => {
    // FOUND ON A WEEKLY ENTRY, not in review: the cell read TAGS over "Tags"
    // over a control. `tracker` is not in `SELF_LABELLED_KINDS`, so the
    // dispatcher wraps every tracker widget in `journal-widget-labeled` and
    // puts the eyebrow above it — the comment beside that list warns about
    // exactly this and the first cut of this control did it anyway. Same rule
    // 3.13 §10.2 wrote down for the palette and the ribbon: the group is named
    // once per surface.
    const src = readSrc("tracker-controls");
    const at = src.indexOf("function buildTagsField");
    const body = src.slice(at, src.indexOf("\nexport function buildTracker", at));
    expect(body).not.toContain("journal-tracker-label");
    expect(body).not.toContain("def.label,");
    expect(readSrc("index")).not.toContain('SELF_LABELLED_KINDS = new Set([\n  "tracker"');
  });

  it("is one control in both states, not a readout beside a button", () => {
    // The empty state was two of the cell's three lines saying "None yet" over
    // a full-width Manage button — mostly chrome for the case with nothing to
    // show. A tracker cell with no reading draws its affordance and nothing
    // else, and one with a reading makes the reading itself the target.
    const src = readSrc("tracker-controls");
    const at = src.indexOf("function buildTagsField");
    const body = src.slice(at, src.indexOf("\nexport function buildTracker", at));
    expect(body).not.toContain("None yet");
    expect(body).toContain("Add tags");
    expect(body).toContain('cls: "journal-tags-chips"');
  });

  it("draws a list cell rather than one of the value controls", () => {
    const src = readSrc("tracker-controls");
    expect(src).toContain('case "tags":');
    expect(src).toContain("buildTagsField(deps, def, ctx)");
  });

  it("paints from what it wrote, not from the cache it just raced", () => {
    // REPORTED ON A DAILY ENTRY: adding the first tag left the cell still
    // offering to add one, and adding a second showed the first — exactly one
    // behind. `processFrontMatter` resolves when the file is saved and
    // Obsidian updates its cache on a separate, slightly-delayed pass, so
    // reading the property straight back returns the value from before the
    // write. Every other control in this file keeps a local `known` for that
    // reason and says so in a comment; this one did not.
    const src = readSrc("tracker-controls");
    const at = src.indexOf("function buildTagsField");
    const body = src.slice(at, src.indexOf("\nexport function buildTracker", at));
    expect(body).toContain("let known: string[] | null = null;");
    expect(body).toContain("known = readTags(next);");
    // One reader of the cache, inside `read()`, where the null case documents
    // that the property panel is the authority until this cell has written.
    expect(body.match(/deps\.currentValue\(/g) ?? []).toHaveLength(1);
  });

  it("writes through processFrontMatter rather than widening `write`", () => {
    // `WidgetHost.write` takes `string | number | null`, which is the right
    // contract for a value and cannot express a list. Widening it for one
    // caller would put an array in the signature of every control that will
    // never write one.
    const src = readSrc("controls");
    expect(src).toContain("value: string | number | null");
    expect(readSrc("tracker-controls")).toContain(
      "processFrontMatter(file, (fm)"
    );
  });
});
