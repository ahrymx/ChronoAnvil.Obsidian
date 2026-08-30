// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// Logbooks — the diary's undated layer. 4.52.
//
// WHAT THESE ASSERT. Four things the release rests on, and each of them is a
// property rather than a string in a file:
//
//   • the WORD is one word. `log` is a verb this plugin has had since 2.56
//     (`button:log:Mood:1`) and `logbook` is the noun — the collision
//     `vocabulary.ts` exists to catch, caught.
//   • the registry survives a hand-edited `data.json` and a renamed folder,
//     which is what makes `LogbookDef.path` safe to store rather than derive.
//   • every registered logbook is a page in all four scaffold walks, which is
//     what the required `books` parameter buys.
//   • the composer and the locator agree, so the editor can find what it wrote
//     — `dashboard-sections.test.ts`'s rule, applied to a fifth catalogue.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOGBOOKS,
  DEFAULT_PATHS,
  LOGBOOK_KEYWORD,
  LOGBOOK_NOTE_KEY,
  type LogbookDef,
} from "../src/core/constants";
import {
  findLogbook,
  logbookChoices,
  logbookNotePath,
  normalizeLogbooks,
} from "../src/diary/logbooks";
import {
  composeLogbookNote,
  composeLogbooksFolderNote,
  logbookSections,
  logbookSectionModel,
  logbooksFolderSections,
} from "../src/diary/logbook-sections";
import { shippedNotes, isReconcilable } from "../src/core/scaffold";
import { remapConfiguredPaths } from "../src/core/pathwatch";
import { WIDGET_FORM } from "../src/core/section-model";
import { LOGBOOK, LOGBOOKS } from "../src/core/vocabulary";
import { DEFAULT_EVENT_COLOR, EVENT_COLORS } from "../src/events/events";
import { readSrc } from "./sources";
import { toPlainMarkdown } from "../src/core/plain-markdown";
import { writeNoteRegion } from "../src/core/notestore";
import { serializeLogItems } from "../src/diary/log-items";
import { composeSearchNote, searchSectionModel } from "../src/diary/search-sections";

const WORK = DEFAULT_LOGBOOKS[0];

describe("the word is one word", () => {
  it("keeps `log` as the verb and `logbook` as the noun", () => {
    // `button:log:<trackerId>:<delta>` has meant "log a value" since 2.56 and
    // is written into shipped notes. A `log:` directive beside it would put one
    // word in the grammar twice, meaning an action in one place and a container
    // in the other — which is `type` meaning two things, the failure
    // `vocabulary.ts` opens by describing.
    expect(LOGBOOK).toBe("logbook");
    expect(LOGBOOKS).toBe("logbooks");
    expect(LOGBOOK_KEYWORD).toBe("logbook");
    const buttons = readSrc("button-widgets");
    expect(buttons).toContain('action === "log"');
    // The dispatcher routes the noun and the button routes the verb, and
    // neither has a case for the other's word.
    expect(readSrc("widgets")).toContain('case "logbook":');
    expect(readSrc("widgets")).not.toContain('case "log":');
  });

  it("names the region for the note, never for the logbook's id", () => {
    // A logbook's id names a NOTE. A region key made from it would have to
    // survive `isValidNoteKey` for a word the reader typed, and would orphan the
    // whole region the day that id was corrected.
    expect(LOGBOOK_NOTE_KEY).toBe("logbook");
    const widget = readSrc("logbook-widget");
    expect(widget).toContain("key: LOGBOOK_NOTE_KEY,");
    expect(widget).not.toMatch(/key: def\.id/);
  });
});

describe("the four that ship", () => {
  it("has unique ids and lives in the logbooks folder", () => {
    const ids = DEFAULT_LOGBOOKS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const book of DEFAULT_LOGBOOKS) {
      expect(book.path.startsWith(`${DEFAULT_PATHS.logbooks}/`)).toBe(true);
      expect(book.path.endsWith(".md")).toBe(true);
      expect(book.name.trim()).not.toBe("");
      expect(book.icon.trim()).not.toBe("");
    }
  });

  it("calls the focus one something the Focus tracker is not called", () => {
    // A built-in tracker is already called Focus — a 1–5 daily scale with its
    // own faces. Two things called Focus in one settings tab is
    // `vocabulary.ts`'s opening complaint at reader scale.
    const focus = findLogbook(DEFAULT_LOGBOOKS, "focus");
    expect(focus?.name).toBe("Current focus");
  });

  it("reads meetings from the events note and everything else from a region", () => {
    // A meeting is a dated fact with an hour on it, and `EventDef` has modelled
    // dated facts on the calendar since 2.20. A second store of dated things
    // the calendar knew nothing about is the outcome this avoids.
    const bySource = DEFAULT_LOGBOOKS.filter((b) => b.source === "events");
    expect(bySource.map((b) => b.id)).toEqual(["meetings"]);
  });

  it("offers them by id and shows them by name", () => {
    expect(logbookChoices(DEFAULT_LOGBOOKS)[0]).toEqual({
      value: WORK.id,
      label: `${WORK.icon} ${WORK.name}`,
    });
  });

  it("finds one only by its id, never by its label", () => {
    // A name is retyped; an id is what `logbook:work` was written against. A
    // name match would silently re-point every widget in the vault at whatever
    // happened to be called that afterwards.
    expect(findLogbook(DEFAULT_LOGBOOKS, "work")?.id).toBe("work");
    expect(findLogbook(DEFAULT_LOGBOOKS, "Work log")).toBeUndefined();
  });
});

describe("a saved list is repaired rather than discarded", () => {
  const folder = DEFAULT_PATHS.logbooks;

  it("gives a vault that predates 4.52 the four defaults", () => {
    expect(normalizeLogbooks(undefined, folder).map((b) => b.id)).toEqual(
      DEFAULT_LOGBOOKS.map((b) => b.id)
    );
  });

  it("keeps an id that no longer resembles its name", () => {
    // Which is the point of an id: `logbook:work` goes on meaning the same note
    // after "Work log" becomes "Graft".
    const [book] = normalizeLogbooks(
      [{ id: "work", name: "Graft", path: "x/Graft.md" }],
      folder
    );
    expect(book.id).toBe("work");
  });

  it("derives a missing id and re-slugs a colliding one", () => {
    const out = normalizeLogbooks(
      [{ name: "Work log" }, { name: "Work log" }],
      folder
    );
    expect(out.map((b) => b.id)).toEqual(["work-log", "work-log-2"]);
  });

  it("repairs an unusable source instead of dropping the logbook", () => {
    const [book] = normalizeLogbooks(
      [{ name: "Work log", source: "carrier pigeon" }],
      folder
    );
    expect(book.source).toBe("region");
  });

  it("drops only a row with no name, because there is nothing to call it", () => {
    expect(normalizeLogbooks([{ id: "x" }, { name: "Keep" }], folder)).toHaveLength(1);
  });

  it("fills a missing path from the configured folder", () => {
    const [book] = normalizeLogbooks([{ name: "Reading" }], folder);
    expect(book.path).toBe(`${folder}/Reading.md`);
    expect(logbookNotePath(folder, "Reading")).toBe(book.path);
  });

  it("does not put a path separator in a filename", () => {
    expect(logbookNotePath(folder, "Half/Term")).toBe(`${folder}/HalfTerm.md`);
  });

  // ── the colour, 4.55 ──────────────────────────────────────────────
  //
  // The time grid draws events and logbook items side by side, and a view where
  // the two came from different palettes would be two designs in one grid. So a
  // logbook's colour is one of `EVENT_COLORS` — the same eight, validated the
  // same way `normalizeEvent` validates an event's, which is also what keeps a
  // hand-edited `data.json` from reaching a style attribute.
  it("gives every shipped logbook a colour from the event palette", () => {
    for (const book of DEFAULT_LOGBOOKS) {
      expect(EVENT_COLORS).toContain(book.color);
    }
    // Four books, four colours: the palette is what tells them apart on a grid.
    expect(new Set(DEFAULT_LOGBOOKS.map((b) => b.color)).size).toBe(
      DEFAULT_LOGBOOKS.length
    );
  });

  it("falls back rather than trusting a colour the file made up", () => {
    for (const bad of ["#ff0000", "chartreuse", "", 3, null]) {
      const [book] = normalizeLogbooks(
        [{ name: "Reading", color: bad }],
        folder
      );
      expect(book.color).toBe(DEFAULT_EVENT_COLOR);
    }
  });

  it("keeps a colour the reader chose", () => {
    const [book] = normalizeLogbooks([{ name: "Reading", color: "purple" }], folder);
    expect(book.color).toBe("purple");
  });
});

describe("the path follows the file", () => {
  it("moves a logbook when its note is dragged elsewhere", () => {
    // `LogbookDef.path` is STORED rather than derived, so that retitling a
    // logbook does not orphan a note full of items. The price of that choice is
    // that the string has to follow the file, and this is where it does — the
    // only entry in `remapConfiguredPaths` a FILE rename may move.
    const settings = {
      paths: { ...DEFAULT_PATHS } as Record<string, string>,
      logbooks: [{ name: "Work log", path: `${DEFAULT_PATHS.logbooks}/Work log.md` }],
    };
    const changed = remapConfiguredPaths(
      settings,
      `${DEFAULT_PATHS.logbooks}/Work log.md`,
      `${DEFAULT_PATHS.logbooks}/Graft.md`,
      false
    );
    expect(settings.logbooks[0].path).toBe(`${DEFAULT_PATHS.logbooks}/Graft.md`);
    expect(changed).toContain("Work log logbook");
  });

  it("carries them all when the folder is renamed", () => {
    const settings = {
      paths: { ...DEFAULT_PATHS } as Record<string, string>,
      logbooks: DEFAULT_LOGBOOKS.map((b) => ({ name: b.name, path: b.path })),
    };
    remapConfiguredPaths(settings, DEFAULT_PATHS.logbooks, "02 - Diary/Books", true);
    expect(settings.paths.logbooks).toBe("02 - Diary/Books");
    for (const book of settings.logbooks) {
      expect(book.path.startsWith("02 - Diary/Books/")).toBe(true);
    }
  });
});

describe("every logbook is a page the vault writes", () => {
  const shipped = (books: readonly LogbookDef[] = DEFAULT_LOGBOOKS) =>
    shippedNotes(DEFAULT_PATHS, [], books);

  it("adds one note per registered logbook, plus the folder note", () => {
    const before = shipped([]).length;
    const after = shipped().length;
    expect(after - before).toBe(DEFAULT_LOGBOOKS.length + 1);
    const dests = shipped().map((n) => n.dest);
    for (const book of DEFAULT_LOGBOOKS) expect(dests).toContain(book.path);
    expect(dests).toContain(`${DEFAULT_PATHS.logbooks}/Logbooks.md`);
  });

  it("writes no folder note for a vault with no logbooks", () => {
    // Nothing dead is drawn, read from the other end: an index page listing
    // nothing is a page a reader has to open to learn it is empty.
    expect(shipped([]).map((n) => n.dest)).not.toContain(
      `${DEFAULT_PATHS.logbooks}/Logbooks.md`
    );
  });

  it("composes them rather than copying an asset, and none is a template", () => {
    for (const note of shipped().filter((n) => n.dest.includes("/Logbooks/"))) {
      expect(note.asset).toBeUndefined();
      expect(typeof note.content).toBe("string");
      expect(note.template).toBeUndefined();
      // Which is what puts them in all four walks — the create, the reconcile
      // and the two migration passes.
      expect(isReconcilable(note)).toBe(true);
    }
  });

  it("hands the editor the surface its catalogue belongs to", () => {
    const note = shipped().find((n) => n.dest === WORK.path);
    expect(note?.surface).toEqual({ kind: "logbook", ctx: { def: WORK } });
    const index = shipped().find(
      (n) => n.dest === `${DEFAULT_PATHS.logbooks}/Logbooks.md`
    );
    expect(index?.surface).toEqual({
      kind: "logbooks",
      ctx: { books: DEFAULT_LOGBOOKS },
    });
  });

  it("follows a renamed diary root with nothing to remap", () => {
    // The folder note is DERIVED from the folder, so it moves for free. The
    // logbooks' own paths are configured, and PathWatch is what moves those —
    // see the describe above.
    const moved = { ...DEFAULT_PATHS, logbooks: "Journal/Books" };
    expect(shippedNotes(moved, [], DEFAULT_LOGBOOKS).map((n) => n.dest)).toContain(
      "Journal/Books/Books.md"
    );
  });
});

describe("the catalogue and the locator agree", () => {
  it("composes the directive the section locates", () => {
    const text = composeLogbookNote(WORK);
    expect(text).toContain(`${LOGBOOK_KEYWORD}:${WORK.id}`);
    for (const section of logbookSections(WORK)) {
      expect(section.locate?.(text) ?? 0).toBeGreaterThanOrEqual(0);
    }
  });

  it("titles the block with the logbook's own name", () => {
    expect(composeLogbookNote(WORK)).toContain(`header:${WORK.icon} ${WORK.name}`);
  });

  it("locks the logbook on its own note and not on the index", () => {
    // Removing it from its own note empties a file of the only thing it is for;
    // removing it from the index is a reader saying which ones they want listed.
    const own = logbookSections(WORK).find((s) => s.id === LOGBOOK_KEYWORD);
    expect(own?.locked).toBe(true);
    const listed = logbooksFolderSections(DEFAULT_LOGBOOKS).filter((s) =>
      s.id.startsWith(`${LOGBOOK_KEYWORD}-`)
    );
    expect(listed).toHaveLength(DEFAULT_LOGBOOKS.length);
    for (const section of listed) expect(section.locked).toBe(false);
  });

  it("does not confuse one logbook's line with another's", () => {
    // The ids are slugs and one can be a prefix of another. `work` must not
    // locate `logbook:work-notes`.
    const near: LogbookDef = { ...WORK, id: "work-notes", name: "Work notes" };
    const text = composeLogbookNote(near);
    const own = logbookSections(WORK).find((s) => s.id === LOGBOOK_KEYWORD);
    expect(own?.locate?.(text)).toBe(-1);
  });

  it("puts every registered logbook on the folder note", () => {
    const text = composeLogbooksFolderNote(DEFAULT_LOGBOOKS);
    for (const book of DEFAULT_LOGBOOKS) {
      expect(text).toContain(`${LOGBOOK_KEYWORD}:${book.id}`);
    }
  });

  it("reports its sections back off the note it wrote", () => {
    // The catalogue's own rows come first and the offerable widgets follow,
    // prefixed `w:` — so the note's own sections are the unprefixed ones, and
    // the logbook has to be among them or the editor cannot show what is there.
    const rows = logbookSectionModel(WORK).sections(composeLogbookNote(WORK));
    const own = rows.filter((v) => !v.id.startsWith("w:")).map((v) => v.id);
    expect(own).toEqual(["banner", LOGBOOK_KEYWORD]);
    // Locked, so the editor draws no remove control on it, and movable, because
    // a reader may put something above it.
    const row = rows.find((v) => v.id === LOGBOOK_KEYWORD);
    expect(row?.removable).toBe(false);
    expect(row?.label).toBe(WORK.name);
  });
});

// ── as many logbooks on a page as the reader wants (4.56) ─────────────
//
// THE REPORT THIS ANSWERS: "the logbook widget can only be added once, which is
// wrong". It was — `WidgetSpec.repeats` was opt-in, three widgets had opted in,
// and a homepage carrying the work log beside Current focus beside what is
// scheduled is three `logbook:` lines. Asserted here rather than only in
// `widget-sections.test.ts` because this is the feature that was broken, and a
// rule proven on `journal-card` alone is a rule that can quietly stop applying
// to the entry that needed it.
describe("a page may hold logbook widgets and sections", () => {
  const note = (): string => composeSearchNote();
  const model = searchSectionModel();
  const logbookIds = (ids: readonly string[]): string[] =>
    ids.filter((id) => id.startsWith(`w:${LOGBOOK_KEYWORD}`));

  it("offers one more however many are already there", () => {
    let text = note();
    for (let n = 1; n <= 3; n++) {
      // The add list holds exactly one logbook row, and it is the next free
      // instance — never the ones the page already has.
      expect(logbookIds(model.addable(text).map((s) => s.id))).toEqual([
        `w:${LOGBOOK_KEYWORD}#${n}`,
      ]);
      text = model.apply(text, [
        ...model.present(text).map((id) => ({ id })),
        {
          id: `w:${LOGBOOK_KEYWORD}#${n}`,
          options: { form: WIDGET_FORM },
        },
      ]) as string;
    }
    expect(logbookIds(model.present(text))).toHaveLength(3);
  });

  it("toggles between section and widget form with formQuestion", () => {
    const bookModel = logbookSectionModel(DEFAULT_LOGBOOKS[0]);
    const noteText = composeLogbookNote(DEFAULT_LOGBOOKS[0]);
    expect(noteText).toContain("header:💼 Work log");
    expect(noteText).toContain("logbook:work");

    const appliedWidget = bookModel.apply(noteText, [
      { id: "banner" },
      { id: LOGBOOK_KEYWORD, options: { form: WIDGET_FORM } },
    ]) as string;
    expect(appliedWidget).not.toContain("header:💼 Work log");
    expect(appliedWidget).toContain("logbook:work");
  });

  it("removes the one that was asked for and leaves the rest alone", () => {
    const text =
      note() +
      "\n```chronoanvil\nlogbook\n```\n\n```chronoanvil\nlogbook\n```\n\n```chronoanvil\nlogbook\n```\n";
    const gone = `w:${LOGBOOK_KEYWORD}#2`;
    const next = model.apply(
      text,
      model.present(text).filter((id) => id !== gone)
    ) as string;
    expect(model.present(next).filter((id) => id.startsWith(`w:${LOGBOOK_KEYWORD}`))).toHaveLength(2);
  });
});

describe("the section editor recognises the pages", () => {
  it("resolves a logbook by the path its def holds, before any diary question", () => {
    // ASSERTED AT THE CALL SITE, since the resolver needs a vault. A logbook
    // lives under the diary root, so the next resolver asked about it would be
    // `entryContextFor` — and a note in no grain folder falls back to `daily`,
    // which would offer the DAILY ENTRY catalogue on a work log. The same
    // confident-wrong-answer the page head had.
    const src = readSrc("section-insert");
    const book = src.indexOf("const book = books.find((b) => b.path === notePath);");
    expect(book).toBeGreaterThan(0);
    expect(src).toContain('return { kind: "logbook", ctx: { def: book } };');
    expect(book).toBeLessThan(src.indexOf("const entry = this.entryContextFor(notePath);"));
    expect(book).toBeLessThan(src.indexOf("const dash = this.diaryContextFor(notePath);"));
  });

  it("gives both logbook surfaces a model and a noun", () => {
    const src = readSrc("section-insert");
    expect(src).toContain("logbookSectionModel(surface.ctx.def, vault)");
    expect(src).toContain("logbooksFolderSectionModel(surface.ctx.books, vault)");
  });
});

describe("a logbook exports as what it holds", () => {
  it("carries its items into plain markdown, stamps and all", () => {
    // The region is in the logbook's OWN note, so this is the one file where
    // the export finds it — a `logbook:work` on the homepage exports nothing,
    // which is right: an export of the homepage is not an export of the work
    // log.
    const items = serializeLogItems([
      { date: "2026-08-21", time: "14:32", text: "rewrote the remap", done: null, mins: null },
      { date: "2026-08-20", time: "09:00", text: "read the roadmap", done: "2026-08-22", mins: null },
    ]);
    const note = writeNoteRegion(composeLogbookNote(WORK), LOGBOOK_NOTE_KEY, items);
    const out = toPlainMarkdown(note, logbookSectionModel(WORK));
    expect(out).toContain("- 2026-08-21 14:32 — rewrote the remap");
    expect(out).toContain("- [x] 2026-08-20 09:00 — read the roadmap");
  });
});
