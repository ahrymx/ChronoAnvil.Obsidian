// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// The ChronoAnvil rename, from both ends.
//
// The plugin was called Almanac and wrote `almanac` into every note it touched.
// Renaming the product cannot rename the notes, so there are two contracts to
// keep and they are easy to let drift apart:
//
//   1. READ BOTH. A vault written before the rename must still give up its
//      content. The failure mode is not a missing feature — it is a region the
//      plugin cannot see, renders empty, and then writes a second copy beside,
//      orphaning what the reader typed.
//   2. WRITE ONE. Everything the plugin emits must be the new spelling, and
//      the migration tool's map must cover every one of those tokens. A token
//      the plugin writes but the map doesn't know about is a vault that can
//      never be fully migrated — and nothing else in the suite would notice.
//
// The second is the one that rots, because it breaks by ADDING a token
// somewhere else in the codebase, which is why it is asserted against the
// plugin's own constants rather than a hand-written list.

import { describe, it, expect } from "vitest";
import {
  EVENTS_PROPERTY,
  LEGACY_EVENTS_PROPERTY,
  LEGACY_TRACKER_MARK_END,
  LEGACY_TRACKER_MARK_START,
  FENCE_OPEN,
  TRACKER_MARK_END,
  TRACKER_MARK_START,
  isTrackerMarkEnd,
  isTrackerMarkStart,
} from "../src/core/constants";
import {
  allNoteRegions,
  readNoteRegion,
  writeNoteRegion,
} from "../src/core/notestore";
import { decodeRegistryMirror } from "../src/core/registry-mirror";
import { decodeJournalManifest } from "../src/journals/journal-manifest";
import { RULES, migrateText } from "../tools/migrate-vault.mjs";
import { STUDY_JOURNAL } from "../src/journals/journal";
import { journalTemplateFiles } from "../src/journals/custom-journal";
import {
  LEGACY_PROSE_KEY,
  PROSE_KEY,
  bracketClose,
  bracketOpen,
  proseCountIn,
  sectionContext,
} from "../src/journals/journal-sections";
import { planSections, sectionsPresent } from "../src/journals/journal-plan";

describe("reading a vault written before the rename", () => {
  it("finds a legacy body region and returns its content", () => {
    const note = ["# Monday", "", "<!--almanac:focus", "ship the thing", "-->"].join("\n");
    expect(readNoteRegion(note, "focus")).toBe("ship the thing");
  });

  it("upgrades a legacy region in place rather than appending a second one", () => {
    // The orphaning bug this whole mechanism exists to prevent: if the write
    // path couldn't find the legacy region it would append, and the reader's
    // original words would sit in a region nothing reads again.
    const note = ["<!--almanac:focus", "old words", "-->"].join("\n");
    const next = writeNoteRegion(note, "focus", "new words");
    expect(next).toContain("<!--chronoanvil:focus");
    expect(next).not.toContain("<!--almanac:focus");
    expect(next.match(/<!--chronoanvil:focus/g)).toHaveLength(1);
    expect(readNoteRegion(next, "focus")).toBe("new words");
  });

  it("discovers regions of both spellings, in document order", () => {
    const note = [
      "<!--almanac:focus",
      "first",
      "-->",
      "",
      "<!--chronoanvil:todo",
      "second",
      "-->",
    ].join("\n");
    expect(allNoteRegions(note)).toEqual([
      { key: "focus", content: "first" },
      { key: "todo", content: "second" },
    ]);
  });

  it("prefers the current region when a note carries both for one key", () => {
    // A half-migrated note: the plugin rewrote one region, another tool left a
    // legacy one above it. The one being kept up to date is the current one.
    const note = [
      "<!--chronoanvil:focus",
      "kept current",
      "-->",
      "<!--almanac:focus",
      "stale",
      "-->",
    ].join("\n");
    expect(readNoteRegion(note, "focus")).toBe("kept current");
  });

  it("accepts either spelling of the tracker region markers", () => {
    expect(isTrackerMarkStart(LEGACY_TRACKER_MARK_START)).toBe(true);
    expect(isTrackerMarkStart(TRACKER_MARK_START)).toBe(true);
    expect(isTrackerMarkEnd(LEGACY_TRACKER_MARK_END)).toBe(true);
    expect(isTrackerMarkEnd(TRACKER_MARK_END)).toBe(true);
    expect(isTrackerMarkStart("  # almanac:trackers:start  ")).toBe(true);
    expect(isTrackerMarkStart("# chronoanvil:trackers:end")).toBe(false);
  });

  it("restores settings from a mirror written under the old version key", () => {
    // This is the case the rename actually creates: the plugin id changed, so
    // there is no data.json, so the mirror is the only way the reader's
    // trackers and journals come back.
    const legacy = JSON.stringify({
      almanacRegistry: 1,
      writtenBy: "Almanac",
      settings: { trackers: [{ key: "Mood" }] },
    });
    const mirror = decodeRegistryMirror(legacy);
    expect(mirror).not.toBeNull();
    expect(mirror?.settings.trackers).toHaveLength(1);
  });

  it("reads a journal manifest written under the old version key", () => {
    const legacy = JSON.stringify({
      almanacJournal: 1,
      config: {
        id: "study",
        name: "Study",
        levels: [{ id: "subject", name: "Subject" }],
        kinds: [{ id: "lesson", name: "Lesson" }],
      },
    });
    expect(decodeJournalManifest(legacy)).not.toBeNull();
  });
});

describe("the migration map covers what the plugin writes", () => {
  const migratable = (legacy: string) => migrateText(legacy);

  it("rewrites every vault token the plugin emits", () => {
    // Each entry is a token this codebase writes into a vault, paired with the
    // pre-rename spelling of it. Adding a new vault token means adding it here
    // AND to tools/migrate-vault.mjs — which is the point of the test.
    const cases: [legacy: string, current: string][] = [
      ["```almanac", FENCE_OPEN],
      ["```almanac-charts", "```chronoanvil-charts"],
      ["```almanac-journal-charts", "```chronoanvil-journal-charts"],
      ["<!--almanac:focus", "<!--chronoanvil:focus"],
      [LEGACY_TRACKER_MARK_START, TRACKER_MARK_START],
      [LEGACY_TRACKER_MARK_END, TRACKER_MARK_END],
      ["%% almanac-graph %%", "%% chronoanvil-graph %%"],
      [`${LEGACY_EVENTS_PROPERTY}:`, `${EVENTS_PROPERTY}:`],
      ["`almanac:button:x`", "`chronoanvil:button:x`"],
      ['"almanacRegistry"', '"chronoanvilRegistry"'],
      ['"almanacJournal"', '"chronoanvilJournal"'],
      // Not a fence or a region, but a token all the same: the homepage's width
      // comes from a `cssclasses` key in the READER'S frontmatter, and repair
      // has never edited frontmatter. Miss it and a homepage composed before
      // the rename silently narrows to the default line length.
      ["cssclasses: almanac-wide", "cssclasses: ca-wide"],
    ];
    for (const [legacy, current] of cases) {
      expect(migratable(legacy), `migrating ${legacy}`).toBe(current);
    }
  });

  it("orders its rules so a compound token is never shortened first", () => {
    // `almanac-journal-charts` must be consumed before `almanac-charts`, and
    // both before the bare fence, or a chart fence migrates into nonsense.
    expect(migrateText("```almanac-journal-charts")).toBe(
      "```chronoanvil-journal-charts"
    );
    expect(migrateText("```almanac-charts")).toBe("```chronoanvil-charts");
  });

  it("is idempotent, so re-running it on a migrated vault changes nothing", () => {
    const once = migrateText(
      ["```almanac", "diary", "```", "<!--almanac:focus", "x", "-->"].join("\n")
    );
    expect(migrateText(once)).toBe(once);
  });

  it("leaves text that merely mentions the old name alone", () => {
    // Prose is not a token. A reader who wrote the word in a diary entry keeps
    // it — the map only matches the delimited forms the plugin emits.
    const prose = "I read that in an almanac last year. The almanac was wrong.";
    expect(migrateText(prose)).toBe(prose);
  });

  it("declares no rule that the plugin no longer writes", () => {
    // The mirror image of the coverage test: a stale rule is dead weight that
    // implies a token still in play. Every `from` must be an `almanac` token,
    // and every `to` must land in one of the two namespaces the rename created
    // — `chronoanvil` for anything the vault format spells out, `ca` for the
    // CSS namespace. A rule that maps somewhere else is a typo with a migration
    // tool behind it.
    for (const [from, to] of RULES as [string, string][]) {
      expect(from).toContain("almanac");
      const asVaultToken = from.replace(/almanac/g, "chronoanvil");
      const asCssClass = from.replace(/almanac/g, "ca");
      expect(
        [asVaultToken, asCssClass],
        `rule ${from} -> ${to} lands outside both namespaces`
      ).toContain(to);
    }
  });
});

// ── THE SECOND READ-BOTH-WRITE-ONE CONTRACT (1.0.36) ─────────────────────
//
// The rename above is not the only place this plugin reads a spelling it no
// longer writes. 5.6 bracketed the prose skeleton in `<!--chronoanvil-skeleton-->`
// and 1.0.36 renamed the section to Prose and the marker with it. Every note
// written between those two releases carries the old pair, and the failure mode
// is the rename's exactly: a block the plugin cannot see is a block it refuses
// to remove, offers to compose a second copy of, and cuts nothing from.
//
// IT IS NOT A MIGRATION RULE, and the last test here says why out loud — both
// spellings are already in the `chronoanvil` namespace, so there is no
// `almanac` form to rewrite and `tools/migrate-vault.mjs` has nothing to do.
// The compatibility lives in `proseSpansIn` and nowhere else.
describe("the prose marker's own rename", () => {
  const lessonCtx = sectionContext(STUDY_JOURNAL, {
    kind: STUDY_JOURNAL.kinds.find((k) => k.id === "lesson")!,
  });
  const lesson = (): string =>
    journalTemplateFiles(STUDY_JOURNAL).find((f) => f.name === "lesson.md")!
      .content;
  // The same Lesson as it was written before 1.0.36.
  const old = (): string =>
    lesson()
      .split(bracketOpen(PROSE_KEY))
      .join(bracketOpen(LEGACY_PROSE_KEY))
      .split(bracketClose(PROSE_KEY))
      .join(bracketClose(LEGACY_PROSE_KEY));

  it("finds a block marked with the old spelling", () => {
    const text = old();
    expect(text).toContain("<!--chronoanvil-skeleton-->");
    expect(text).not.toContain("<!--chronoanvil-prose-->");
    expect(proseCountIn(text)).toBe(1);
    expect(sectionsPresent(text, lessonCtx)).toContain("headings");
  });

  it("plans against it as a marked block, not as loose markdown", () => {
    // THE ASSERTION THAT MATTERS, because the other spelling of "cannot see it"
    // is not a crash — it is the refusal a note with no markers at all gets,
    // which would be wrong here and unexplainable to whoever wrote the note.
    const op = planSections(old(), lessonCtx, []).find(
      (o) => o.sectionId === "headings"
    )!;
    expect(op.kind).toBe("keep");
    expect(op.detail).not.toContain("Reload this page");
  });

  it("writes the new spelling and only the new spelling", () => {
    for (const file of journalTemplateFiles(STUDY_JOURNAL)) {
      expect(file.content, file.name).not.toContain("chronoanvil-skeleton");
    }
    expect(lesson()).toContain("<!--chronoanvil-prose-->");
  });

  it("needs no migration rule, because both spellings are already ours", () => {
    for (const [from] of RULES as [string, string][]) {
      expect(from).not.toContain("skeleton");
    }
    for (const marker of [
      bracketOpen(LEGACY_PROSE_KEY),
      bracketClose(LEGACY_PROSE_KEY),
      bracketOpen(PROSE_KEY),
    ]) {
      expect(migrateText(marker), marker).toBe(marker);
    }
  });
});
