// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// `02 - Diary/Events.md` became a surface in 1.0.21.
//
// WHAT THIS ASSERTS, AND WHY IT IS A FILE RATHER THAN A BLOCK ELSEWHERE.
// `test/composed-notes.test.ts` already pins the page's BYTES, through the
// golden fixture, and re-pinning them here would be one fixture with two
// owners. What that suite cannot see is the wiring that makes the bytes
// reachable — and the wiring is the whole of this release's second half. Until
// 1.0.21 the Events note was the one page this plugin composed that was absent
// from BOTH `shippedNotes` and `surfaceOfNote`, and the two absences produced
// the same symptom from opposite ends: repair never visited the file, and the
// section editor did not recognise it. So the properties here are the ones
// `dashboard-sections.ts` states for the two folder notes, asked of this page:
//
//   • the composer and the locator agree, so the editor can find what it wrote
//   • the path `shippedNotes` writes is the path the editor recognises
//   • the page is reconcilable, so repair converges it rather than writing it
//     once and walking away
//   • the `eventsEnabled` toggle still governs whether the note is CREATED
//
// THE RESOLVER IS ASKED THROUGH ITS HALVES. `canEditSections` is a method on
// `SectionInserter` (`section-insert.ts:450`, `surfaceOfNote(p) !== null`) and
// wants a live `App` to answer, which is more harness than these properties are
// worth. The half that can go wrong silently is the PATH — one side writing
// `02 - Diary/Events.md` while the other reads a settings key that moved — and
// that half is `modelForSurface` plus `shippedNotes`, both pure. The ordering
// inside the resolver has no pure half at all, so it is scraped: see the last
// block.

import { describe, expect, it } from "vitest";
import { EVENTS_SECTIONS, composeEventsNote } from "../src/events/events-sections";
import { eventsNoteTemplate } from "../src/events/eventstore";
import { modelForSurface } from "../src/ui/section-insert";
import { isReconcilable, shippedNotes } from "../src/core/scaffold";
import { DEFAULT_PATHS } from "../src/core/constants";
import { isPageWidgetId } from "../src/core/widget-sections";
import { readSrc } from "./sources";

const shipped = (paths = DEFAULT_PATHS): ReturnType<typeof shippedNotes> =>
  shippedNotes(paths, [], []);

const noteAt = (dest: string, paths = DEFAULT_PATHS) =>
  shipped(paths).find((n) => n.dest === dest);

describe("where the Events page lives, and who agrees about it", () => {
  it("scaffolds the configured events path", () => {
    // THE ROW THAT MATTERS, in the words `dashboard-sections.test.ts` uses for
    // the same property: if `shippedNotes` writes one path and `surfaceOfNote`
    // reads another, repair composes a page the section editor will not open.
    // Here both sides read `paths.events`, and the assertion is that the entry
    // exists at all — which it did not before 1.0.21, when the note was written
    // by a conditional push outside the list.
    expect(shipped().map((n) => n.dest)).toContain(DEFAULT_PATHS.events);
  });

  it("declares it a surface, and the one the editor resolves", () => {
    // The `surface` field is what `reconcileLayouts` reads to route a note
    // through `repairNote` instead of `planLayout`. It must name the same kind
    // `surfaceOfNote` answers with for this path, or the page is repaired as
    // one thing and edited as another.
    expect(noteAt(DEFAULT_PATHS.events)?.surface).toEqual({ kind: "events" });
  });

  it("composes it rather than shipping an asset or a template", () => {
    const note = noteAt(DEFAULT_PATHS.events);
    expect(note?.content).toBe(composeEventsNote(DEFAULT_PATHS.diaryRoot));
    expect(note?.asset).toBeUndefined();
    expect(note?.template).toBeFalsy();
  });

  it("is reconcilable, so repair visits it after the first write", () => {
    // The defect this release fixed, stated as the predicate that fixes it.
    // `reconcileLayouts` walks `shippedNotes().filter(isReconcilable)`, so a
    // page that is absent OR fails this predicate is created once and never
    // converged — which is why `Events.md` sat unchanged across major versions.
    const note = noteAt(DEFAULT_PATHS.events);
    expect(note).toBeDefined();
    expect(isReconcilable(note!)).toBe(true);
  });

  it("follows the configured path, with no second spelling of it", () => {
    // Settings → Paths lets a reader move the events note, and BOTH sides read
    // the same key — so moving it moves the scaffold entry and the resolver
    // together. A literal `02 - Diary/Events.md` on either side would pass every
    // case above and fail only in a vault that had moved the file.
    const moved = { ...DEFAULT_PATHS, events: "05 - Dates/Occasions.md" };
    expect(shipped(moved).map((n) => n.dest)).toContain("05 - Dates/Occasions.md");
    expect(shipped(moved).map((n) => n.dest)).not.toContain(DEFAULT_PATHS.events);
  });

  it("writes the same page from the calendar's right-click", () => {
    // `ensureEventsNote` creates the note when a reader adds an event from a
    // day that has none, and it asks `eventsNoteTemplate` what a fresh one
    // contains. Two answers to that question is how a vault comes to hold a
    // page repair then rewrites on its next pass.
    expect(eventsNoteTemplate(DEFAULT_PATHS.diaryRoot)).toBe(
      composeEventsNote(DEFAULT_PATHS.diaryRoot)
    );
  });
});

describe("the editor opens on the Events page, as the Events page", () => {
  const own = (ids: readonly string[]): string[] =>
    ids.filter((id) => !isPageWidgetId(id));

  it("hands it its own catalogue", () => {
    const { model, noun } = modelForSurface({ kind: "events" });
    expect(noun).toBe("Events note");
    expect(own(model.sections().map((s) => s.id))).toEqual(
      EVENTS_SECTIONS.map((s) => s.id)
    );
  });

  it("locks the manager, and leaves the rest of the page to the reader", () => {
    // `search`'s reason, applied: the note is named Events, it is where the
    // list is stored, and an Events note with no manager is a broken link
    // rather than a customisation.
    //
    // THE BANNER IS LOCKED TOO, and not by this catalogue — `bannerSection()`
    // sets it for every flat page (`note-sections.ts:447`), because the banner
    // carries the way out of the note. So the assertion names both and the
    // property being pinned is the pair AFTER it: the two sections that are the
    // reader's to remove are declared unlocked.
    const locked = EVENTS_SECTIONS.filter((s) => s.locked).map((s) => s.id);
    expect(locked).toEqual(["banner", "manager"]);
    const free = EVENTS_SECTIONS.filter((s) => !s.locked).map((s) => s.id);
    expect(free).toEqual(["upcoming", "week-grid"]);
  });

  it("does not offer the widgets it already writes", () => {
    const ids = modelForSurface({ kind: "events" })
      .model.addable(composeEventsNote(DEFAULT_PATHS.diaryRoot))
      .map((s) => s.id);
    // ASKED ON THE KEYWORD, NOT THE INSTANCE (4.56), for the reason
    // `dashboard-sections.test.ts` records: every widget is offered as `#1`, so
    // a bare-id assertion had stopped being able to fail.
    expect(ids.filter((id) => id.startsWith("w:events"))).toEqual([]);
    expect(ids.filter((id) => id.startsWith("w:upcoming"))).toEqual([]);
    expect(ids.filter((id) => id.startsWith("w:time-grid"))).toEqual([]);
  });

  it("names it as a reader would", () => {
    // "Events note" rather than "this note": every refusal and every picker
    // title names the thing being edited, and a surface with no noun sends the
    // reader a sentence about the screen they are already looking at.
    expect(modelForSurface({ kind: "events" }).noun).toBe("Events note");
  });
});

describe("the resolver's order, and the toggle", () => {
  const insert = (): string => readSrc("ui/section-insert");
  const scaffold = (): string => readSrc("core/scaffold");

  it("asks about the events path before the diary resolvers", () => {
    // NOT PURE, SO SCRAPED — and worth scraping, because the failure is silent.
    // The note lives under the diary root, so `entryContextFor` is the next
    // question asked about it, and a note in no grain folder falls back to
    // `daily`: the section editor would offer the DAILY ENTRY catalogue on the
    // events list, confidently and wrongly. The logbook branch below it carries
    // the same comment for the same reason.
    // ANCHORED ON THE CALL, NOT THE NAME. `entryContextFor` is also the name of
    // the method itself, declared well above `surfaceOfNote`, and it is quoted
    // in two comments in between — so the bare word finds a position that says
    // nothing about the order questions are asked in.
    const src = insert();
    const events = src.indexOf(
      'this.plugin.settings.paths.events) return { kind: "events" }'
    );
    const entry = src.indexOf("const entry = this.entryContextFor(notePath);");
    expect(events).toBeGreaterThan(-1);
    expect(entry).toBeGreaterThan(-1);
    expect(events).toBeLessThan(entry);
  });

  it("gates creation on the events toggle, not reconciliation", () => {
    // `readEvents`' posture, kept: the toggle governs DRAWING, not existing. A
    // vault with events switched off is not given the note; a vault that
    // already has one still gets it repaired, because the alternative is a page
    // that silently stops converging the moment a reader unticks a box.
    expect(scaffold()).toContain(
      "if (dest === p.events && !this.plugin.settings.eventsEnabled) continue;"
    );
    // And the conditional push it replaced is gone — two places deciding
    // whether this note exists is the shape the release removed.
    expect(scaffold()).not.toContain("eventsNoteTemplate");
  });
});
