// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// 4.50 — a title's two templates, and the `⋯` on its row.
//
// WHAT IS CHECKABLE HERE IS THE TABLE. `page-default.ts` holds no `App`, no
// plugin and no DOM, which is 4.48's split and the only reason a release about
// two dialogues and a menu can be tested at all. Everything below takes a config
// and some strings.
//
// WHAT IS NOT: the modal itself, the `⋯`'s rows and the trash. Those need a
// vault, and `ROADMAP-4.50.md` §9 is the list of what has to be looked at
// instead of asserted.

import { describe, expect, it } from "vitest";
import {
  PAGE_LAYOUT_DEFAULT,
  PAGE_LAYOUT_KEY,
  configOfJournal,
  isPromotedPath,
  pageLayoutById,
  pageLayoutChoices,
  pageLayoutOf,
  pageLayoutShown,
  pagePathsOf,
} from "../src/journals/page-default";
import type { JournalConfig, JournalVariantConfig } from "../src/journals/custom-journal";
import { readCode, readCss, readSrc } from "./sources";

// A config with only what these questions read. Cast at the boundary rather
// than built in full: `JournalConfig` carries two dozen fields, none of which
// this module looks at, and a fake that filled them in would be asserting that
// today's shape is today's shape.
function cfgWith(variants: JournalVariantConfig[]): JournalConfig {
  return { id: "media", name: "Media", variants } as unknown as JournalConfig;
}

const pageLayout = (id: string, label: string): JournalVariantConfig => ({
  id,
  label,
  surfaces: ["page"],
});

describe("what a page can be built from", () => {
  it("always offers the journal's own page default, first", () => {
    const rows = pageLayoutChoices(null, "Page");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(PAGE_LAYOUT_DEFAULT);
  });

  it("names the default after the page noun, not the word 'Default'", () => {
    // A journal that calls its pages Chapters says "Chapter default", so the
    // field names the thing it is about. This is the half of 2.54.7 that
    // survives 4.50: the option is drawn, and it is not called "Generic".
    expect(pageLayoutChoices(null, "Chapter")[0].label).toContain("Chapter");
    expect(pageLayoutChoices(null, "Chapter")[0].label).not.toContain("Page");
  });

  it("offers a saved layout that says it belongs on a page", () => {
    const rows = pageLayoutChoices(cfgWith([pageLayout("wide", "Wide")]), "Page");
    expect(rows.map((r) => r.id)).toEqual([PAGE_LAYOUT_DEFAULT, "wide"]);
  });

  it("keeps the default first however many layouts there are", () => {
    const rows = pageLayoutChoices(
      cfgWith([pageLayout("a", "A"), pageLayout("b", "B")]),
      "Page"
    );
    expect(rows[0].id).toBe(PAGE_LAYOUT_DEFAULT);
    expect(rows.map((r) => r.id)).toEqual([PAGE_LAYOUT_DEFAULT, "a", "b"]);
  });

  it("does NOT offer a layout saved for the index surface", () => {
    // `JournalVariantConfig` states the asymmetry this rests on: `surfaces`
    // absent means NONE, deliberately the opposite of `kinds`. A layout reaches
    // a page only by naming one.
    const rows = pageLayoutChoices(
      cfgWith([{ id: "front", label: "Front", surfaces: ["index"] }]),
      "Page"
    );
    expect(rows.map((r) => r.id)).toEqual([PAGE_LAYOUT_DEFAULT]);
  });

  it("does NOT offer a layout saved for a note kind", () => {
    const rows = pageLayoutChoices(
      cfgWith([{ id: "twocol", label: "Two column", kinds: ["title"] }]),
      "Page"
    );
    expect(rows.map((r) => r.id)).toEqual([PAGE_LAYOUT_DEFAULT]);
  });

  it("resolves an id to the layout it names", () => {
    const cfg = cfgWith([pageLayout("wide", "Wide")]);
    expect(pageLayoutById(cfg, "wide")?.label).toBe("Wide");
  });

  it("resolves the default to no layout at all", () => {
    const cfg = cfgWith([pageLayout("wide", "Wide")]);
    expect(pageLayoutById(cfg, PAGE_LAYOUT_DEFAULT)).toBeNull();
  });

  it("resolves the default to no layout even against a config with an empty id", () => {
    // `data.json` is a file a reader can edit, and an id slugified to nothing is
    // what a layout named "———" leaves behind. Without the early return, the
    // DEFAULT row would find that entry and every page in the journal would be
    // composed from a layout nobody chose — which is `newPage` reading a
    // composition where it should have read the template file.
    const cfg = cfgWith([{ id: "", label: "", surfaces: ["page"] }]);
    expect(pageLayoutById(cfg, PAGE_LAYOUT_DEFAULT)).toBeNull();
  });

  it("will not resolve an id whose layout is not a page layout", () => {
    // Otherwise a title could name the Subject front page and every page under
    // it would compose sections a page cannot render.
    const cfg = cfgWith([{ id: "front", label: "Front", surfaces: ["index"] }]);
    expect(pageLayoutById(cfg, "front")).toBeNull();
  });
});

describe("what a title stores", () => {
  it("reads the property a reader's note carries", () => {
    expect(pageLayoutOf({ [PAGE_LAYOUT_KEY]: "wide" })).toBe("wide");
  });

  it("reads a note with no property as the default", () => {
    // Which is every title in every vault written before this release.
    expect(pageLayoutOf({})).toBe(PAGE_LAYOUT_DEFAULT);
  });

  it("reads a hand-typed non-string as the default", () => {
    // A property a reader edited by hand can be a number, a list or a bare
    // `true`, and none of those names a layout.
    expect(pageLayoutOf({ [PAGE_LAYOUT_KEY]: 3 })).toBe(PAGE_LAYOUT_DEFAULT);
    expect(pageLayoutOf({ [PAGE_LAYOUT_KEY]: ["wide"] })).toBe(PAGE_LAYOUT_DEFAULT);
    expect(pageLayoutOf({ [PAGE_LAYOUT_KEY]: true })).toBe(PAGE_LAYOUT_DEFAULT);
  });

  it("trims, so a stray space is not a different layout", () => {
    expect(pageLayoutOf({ [PAGE_LAYOUT_KEY]: " wide " })).toBe("wide");
  });

  it("shows the stored layout when it still exists", () => {
    const cfg = cfgWith([pageLayout("wide", "Wide")]);
    expect(pageLayoutShown(cfg, "wide")).toBe("wide");
  });

  it("falls back to the default when the stored layout is gone", () => {
    // A reader who deletes a saved layout has not asked for every title that
    // named it to stop making pages — and a dropdown opening on a value not in
    // its own list shows the first row while reporting the missing one, which
    // is two lies at once.
    expect(pageLayoutShown(cfgWith([]), "wide")).toBe(PAGE_LAYOUT_DEFAULT);
  });

  it("falls back for a stored id that names an index layout", () => {
    const cfg = cfgWith([{ id: "front", label: "Front", surfaces: ["index"] }]);
    expect(pageLayoutShown(cfg, "front")).toBe(PAGE_LAYOUT_DEFAULT);
  });

  it("what is shown is always a row that is offered", () => {
    // The property this pair exists to hold: the value the field opens on can
    // be selected in the field. Checked over both states rather than asserted
    // of one.
    const cfg = cfgWith([pageLayout("wide", "Wide")]);
    const ids = pageLayoutChoices(cfg, "Page").map((r) => r.id);
    for (const stored of ["wide", "gone", "", "front"]) {
      expect(ids).toContain(pageLayoutShown(cfg, stored));
    }
  });
});

describe("which paths a bin takes", () => {
  const pages = [
    "Study/Algebra/Quadratics/Quadratics.md",
    "Study/Algebra/Quadratics/Roots.md",
    "Study/Algebra/Quadratics/Graphs.md",
  ];

  it("knows a folder note by its own name", () => {
    expect(isPromotedPath("Study/Algebra/Quadratics/Quadratics.md")).toBe(true);
  });

  it("knows a note that sits beside its siblings is not one", () => {
    expect(isPromotedPath("Study/Algebra/Quadratics.md")).toBe(false);
  });

  it("knows a note at the vault root is not one", () => {
    // No folder to match, and `lastIndexOf` returning -1 must not be read as a
    // match against the empty string.
    expect(isPromotedPath("Quadratics.md")).toBe(false);
  });

  it("lists a promoted title's siblings as its pages", () => {
    expect(pagePathsOf("Study/Algebra/Quadratics/Quadratics.md", pages)).toEqual([
      "Study/Algebra/Quadratics/Roots.md",
      "Study/Algebra/Quadratics/Graphs.md",
    ]);
  });

  it("never lists the title as one of its own pages", () => {
    const out = pagePathsOf("Study/Algebra/Quadratics/Quadratics.md", pages);
    expect(out).not.toContain("Study/Algebra/Quadratics/Quadratics.md");
  });

  it("gives an unpromoted title no pages at all", () => {
    // AND THIS IS THE ONE THAT MATTERS. An unpromoted title sits in the TOPIC
    // folder among the other titles, so "the files next to me" without the
    // promotion test would be every title in the topic — and *Move to bin*
    // would take all of them.
    const siblings = [
      "Study/Algebra/Quadratics.md",
      "Study/Algebra/Vectors.md",
      "Study/Algebra/Matrices.md",
    ];
    expect(pagePathsOf("Study/Algebra/Quadratics.md", siblings)).toEqual([]);
  });

  it("gives a promoted title with no pages yet an empty list", () => {
    const only = ["Study/Algebra/Quadratics/Quadratics.md"];
    expect(pagePathsOf("Study/Algebra/Quadratics/Quadratics.md", only)).toEqual([]);
  });

  it("has no list of files to bin, because a promoted title bins as a folder", () => {
    // `binPathsOf` was here in 4.50 and returned the note followed by its pages
    // — a LIST OF FILES TO REMOVE, which is the model the trash call was built
    // on and the model that was wrong. One rename of the folder takes the pages
    // with it by construction, and there is no list to get wrong.
    expect(readCode("page-default.ts")).not.toContain("export function binPathsOf");
  });
});

describe("one config lookup", () => {
  it("finds a journal by id", () => {
    const a = cfgWith([]);
    expect(configOfJournal([a], "media")).toBe(a);
  });

  it("returns null rather than the first for an id nothing carries", () => {
    expect(configOfJournal([cfgWith([])], "study")).toBeNull();
  });

  it("survives a settings file with no journals list at all", () => {
    expect(configOfJournal(undefined, "media")).toBeNull();
  });

  it("is the only implementation, and both managers call it", () => {
    // It was three lines in `JournalManager` and three in `JournalTemplates`,
    // which is how "which config is this journal?" comes to have two answers
    // the day one of them learns about a migration. A shared FUNCTION rather
    // than one manager calling the other: the dependency would be real and
    // would put the lookup out of reach of a test with no plugin.
    for (const mod of ["journal.ts", "journal-template-manager.ts"]) {
      expect(readCode(mod), mod).toContain("configOfJournal(");
      expect(readCode(mod), mod).not.toContain("customJournals.find(");
    }
  });
});

// ── the two dialogues ─────────────────────────────────────────────────────
//
// Source assertions, and they are the honest kind: what is being pinned is that
// a field is DRAWN, and drawing is what a suite with no DOM cannot see. §9 of
// the roadmap is the vault check that actually looks at it.

describe("the new title dialogue", () => {
  const src = () => readCode("journal.ts");

  it("offers every layout the kind has, which is never none", () => {
    // `buildJournalType` puts the default variant first in `kind.templates`, so
    // the list is non-empty for every kind in every journal — which is what
    // makes "always drawn" safe to say.
    expect(src()).toContain("templates: kind.templates.map(");
  });

  it("offers page layouts only where the kind can hold pages", () => {
    const at = src().indexOf("const pageRows =");
    expect(at).toBeGreaterThan(0);
    expect(src().slice(at, at + 120)).toContain("kind.pages");
  });

  it("stamps the chosen page layout onto the note it just made", () => {
    const text = src();
    expect(text).toContain("await this.setPageLayout(file, details.pageTemplateId)");
    // AFTER the file exists and before it is opened: `processFrontMatter` needs
    // something to process.
    expect(text.indexOf("createFileEnsuringFolders(this.app, notePath, content)"))
      .toBeLessThan(text.indexOf("this.setPageLayout(file, details.pageTemplateId)"));
  });
});

describe("the new page dialogue", () => {
  const src = () => readCode("journal.ts");

  it("is the same window as the title's, not a bare text prompt", () => {
    // It was `promptText(this.app, `${pages.label} title`)` — a title and
    // nothing else — which is the other half of what was asked for.
    const at = src().indexOf("async newPage(");
    const body = src().slice(at, at + 3000);
    expect(body).toContain("promptNewNote(");
    expect(body).not.toContain("promptText(");
  });

  it("opens on what the title stores, resolved", () => {
    const at = src().indexOf("async newPage(");
    expect(src().slice(at, at + 3000)).toContain(
      "templateId: pageLayoutShown(cfg, pageLayoutOf(fm))"
    );
  });

  it("asks for no page layout of its own, because a page has no pages", () => {
    const at = src().indexOf("async newPage(");
    const call = src().slice(at, at + 3000);
    const from = call.indexOf("promptNewNote(");
    expect(call.slice(from, from + 400)).not.toContain("pages:");
  });

  it("composes a saved layout and reads the file for the default", () => {
    const at = src().indexOf("async newPage(");
    const body = src().slice(at, at + 3000);
    expect(body).toContain("pageLayoutText(");
    // The `??` is the whole rule: a layout or the file, never both and never
    // neither.
    expect(body).toContain("readTemplate(");
  });
});

describe("the default is absent rather than a word", () => {
  it("is the empty string, so there is one spelling of 'no layout named'", () => {
    expect(PAGE_LAYOUT_DEFAULT).toBe("");
  });

  it("clears the property rather than writing an id meaning 'no id'", () => {
    const text = readCode("journal.ts");
    const at = text.indexOf("async setPageLayout(");
    expect(at).toBeGreaterThan(0);
    expect(text.slice(at, at + 600)).toContain("delete front[PAGE_LAYOUT_KEY]");
  });

  it("writes nothing at all when the note had no property and wants none", () => {
    // The commonest case by far: a reader who opens the dialogue and takes the
    // default. A `processFrontMatter` call there would touch every new note's
    // mtime for no change.
    const text = readCode("journal.ts");
    const at = text.indexOf("async setPageLayout(");
    expect(text.slice(at, at + 600)).toContain(
      "if (!id && !(PAGE_LAYOUT_KEY in fm)) return"
    );
  });

  it("is one lowercase word, like every other property the plugin writes", () => {
    expect(PAGE_LAYOUT_KEY).toBe("pagelayout");
    expect(PAGE_LAYOUT_KEY).toMatch(/^[a-z]+$/);
  });
});

// ── the `⋯` on a row ──────────────────────────────────────────────────────

describe("the control on a title's row", () => {
  const src = () => readCode("kind-row-menu.ts");

  it("is the shared overflow control, not a button of its own", () => {
    // `section-frame.ts` already owns what a `⋯` means — "more things about
    // this row, a cell, a card inside a page" — and a second one would be a
    // second glyph for one meaning.
    expect(src()).toContain("overflowButton(");
  });

  it("names itself after the row, because a table of 'More' reads as nothing", () => {
    expect(src()).toContain('`More about ${file.basename}`');
  });

  it("has no submenu to probe", () => {
    // 4.47's outcome §5: `setSubmenu` is not on Obsidian's public types, so it
    // has to be probed, and a probe that fails must still leave the setting
    // reachable. A flat menu has nothing to probe.
    expect(src()).not.toContain("setSubmenu");
  });

  it("offers no page rows for a kind that cannot hold pages", () => {
    expect(src()).toContain("if (kind.pages) addPageLayoutRows(");
  });

  it("ticks what would be used, not what is stored", () => {
    // A note naming a layout that has since been deleted makes its pages from
    // the default, and a menu ticking the missing row would describe a state
    // the plugin will not honour.
    expect(src()).toContain("pageLayoutShown(cfg, pageLayoutOf(fm))");
    expect(src()).toContain("setChecked(row.id === shown)");
  });

  it("is ONE bin row, with the scope asked in the dialogue", () => {
    // 4.50.1 drew two menu rows whose difference is a scope, under a menu whose
    // other rows are a single list. They are one action at two scopes, and the
    // scope belongs beside the sentence describing what it takes — a reader
    // choosing between two menu rows is choosing before reading either
    // consequence.
    const text = src();
    expect(text.match(/setTitle\("Move to bin"\)/g) ?? []).toHaveLength(1);
    expect(text).not.toContain("Move pages to bin");
    expect(text).toContain("promptAction(");
  });

  it("offers the pages-only answer only where there are pages", () => {
    // Otherwise it is a button that does nothing, in a window whose other
    // button does the whole thing.
    expect(src()).toContain('...(pages.length ? [{ value: "pages"');
  });

  it("asks before either scope", () => {
    // Every other write a gesture commits without asking in this plugin can be
    // undone by the opposite gesture. Taking a note out of its topic is not,
    // even as a move.
    const text = src();
    const at = text.indexOf("const choice = await promptAction(");
    expect(at).toBeGreaterThan(0);
    // Neither answer acts before the reader has given one.
    expect(text.indexOf('if (choice === "all")')).toBeGreaterThan(at);
    expect(text.indexOf('else if (choice === "pages")')).toBeGreaterThan(at);
  });

  it("makes the whole move the highlighted answer", () => {
    // A reader who presses the bright button without reading should get the
    // thing the row's own control said, not a narrower half of it.
    const text = src();
    const at = text.indexOf('{ value: "all"');
    expect(text.slice(at, at + 160)).toContain("cta: true");
  });

  it("does NOT dress a move as a deletion", () => {
    // `promptAction` has no `destructive` flag at all, and that is deliberate:
    // red says *this is gone*, and this files something into a folder the
    // reader can open. Overstating it is how they learn to distrust the
    // confirmations that mean it.
    expect(readCode("modals.ts")).toContain("export function promptAction(");
    const at = readCode("modals.ts").indexOf("class ActionModal extends Modal");
    expect(readCode("modals.ts").slice(at, at + 1800)).not.toContain("mod-warning");
  });

  it("dismissing the window is not an answer", () => {
    // Esc, clicking away and Cancel all resolve null, so a caller can treat
    // "anything but an explicit choice" as a no — `ConfirmModal`'s contract,
    // kept.
    const text = readCode("modals.ts");
    const at = text.indexOf("class ActionModal extends Modal");
    expect(text.slice(at, at + 1800)).toContain("private picked: string | null = null;");
    expect(text.slice(at, at + 1800)).toContain("this.resolve(this.picked);");
  });

  it("focuses Cancel, so Enter on an unread window agrees to nothing", () => {
    const text = readCode("modals.ts");
    const at = text.indexOf("class ActionModal extends Modal");
    const body = text.slice(at, at + 1800);
    expect(body).toContain("cancel.focus();");
    expect(body.indexOf('createEl("button", { text: "Cancel" })')).toBeLessThan(
      body.indexOf("for (const choice of this.choices)")
    );
  });

  it("reports what moved rather than what was asked for", () => {
    // `renameFile` can fail per file, and a flat "moved" over a folder half of
    // which is still there costs a reader an hour.
    expect(src()).toContain("const missed = files.length - moved");
  });

  it("resolves the pages at the click rather than when the menu opened", () => {
    // A second window may have acted since. A path that no longer names a file
    // is skipped rather than reported — telling a reader to do what has been
    // done is worse than silence.
    expect(src()).toContain("(f): f is TFile => f != null");
  });

  it("repaints nothing, because the table watches the folder", () => {
    // `level-index` and `kind-table` are `liveScopedWidget`s, so the write and
    // the trash ARE the events that redraw them.
    expect(src()).not.toContain("repaintOpenNotes");
  });
});

// ── the bin, which the plugin already had (4.50.1) ────────────────────────
//
// 4.50 sent a title's row to OBSIDIAN's trash through `fileManager.trashFile`,
// and it was reported from a vault within the day: *"vault's trash doesn't seem
// to exist."* The symptom is that the *Deleted files* setting can be permanent,
// or a `.trash` folder the explorer does not show. The fault is that
// `journal-removal.ts` had already decided where a bin goes and had written down
// the invariant the trash call broke — **ChronoAnvil has never removed a reader's
// note and this is not where that starts.**

describe("a journal note goes to ChronoAnvil's own bin", () => {
  const src = () => readCode("kind-row-menu.ts");

  it("never reaches Obsidian's trash", () => {
    expect(src()).not.toContain("trashFile");
    expect(src()).not.toContain("vault.trash(");
  });

  it("moves through the module that already owns the bin", () => {
    // Not a second constant and not a second path rule. `BIN_FOLDER`,
    // `binPathFor`'s collision suffix and the `renameFile` that keeps links
    // resolving are all 4.17's, and none of them is restated here.
    expect(src()).toContain("binAway(");
    expect(src()).toContain("binTogether(");
    expect(src()).toContain("BIN_FOLDER");
  });

  it("names the destination in the question", () => {
    // A bin the reader cannot find is the report this patch came from.
    expect(src()).toContain("to ${BIN_FOLDER}/.");
  });

  it("says nothing is deleted, in those words", () => {
    // `journal-removal.ts`: *a move, never a delete, and the wording everywhere
    // this surfaces says so.*
    expect(src()).toContain("Nothing is deleted");
  });

  it("bins a promoted title as its folder, so its pages come with it", () => {
    // ONE rename rather than a list of files. The pages are carried by the
    // structure rather than by an array that could be wrong, and what comes
    // back out is the note and its pages arranged the way they were.
    expect(src()).toContain("isPromotedPath(file.path)");
    expect(src()).toContain("? (file.parent ?? file)");
  });

  it("bins loose pages together, into a folder named after their note", () => {
    // *Roots*, *Graphs*, *Examples* mean something under their parent and
    // nothing at the top of a bin, where next week they sit beside another
    // note's *Examples*.
    expect(src()).toContain("`${host.basename} ${many}`");
  });
});

// ── the reported bug (4.50.2) ─────────────────────────────────────────────
//
// *"Moving to bin just duplicates the folder/files into bin and remains inside
// /03."* Two faults, one visible symptom, and the notice in the screenshot names
// them both: **`Moved to 00 - Infrastructure/Bin/The Avengers-2026-08-20-2026-08-20.md`.**
// Two dates is one note binned twice — the row was still on screen after the
// first move, and the second press acted on the file at its new path.

describe("a table drops a row when its note moves away", () => {
  it("watches paths, not only parsed content", () => {
    // `metadataCache.on("changed")` is a CONTENT event: it fires when a file is
    // parsed, and a rename parses nothing. So every folder-scoped widget drew
    // its rows once and then sat there while notes were moved, renamed and
    // deleted underneath it — since `liveScopedWidget` was written.
    expect(readCode("live-widgets.ts")).toContain("shouldRefreshPath: inScope");
  });

  it("asks ONE predicate of both kinds of event", () => {
    // Two spellings of one scope is how a widget comes to watch two slightly
    // different folders.
    const text = readCode("live-widgets.ts");
    const at = text.indexOf("export function liveScopedWidget(");
    const body = text.slice(at, text.indexOf("export function liveFileWidget("));
    expect(body).toContain("const inScope = (path: string): boolean =>");
    expect(body).toContain("shouldRefresh: (f) => inScope(f.path),");
    // The host note stays in scope for both, or renaming the note the widget is
    // drawn in leaves it describing a file that no longer exists.
    expect(body).toContain("path === ctx.sourcePath");
  });

  it("repaints for BOTH sides of a rename, which LiveWidget already did", () => {
    // A move out of scope is only visible from the OLD path; a move in, only
    // from the new. `LiveWidget` has handled both since it was written — this
    // was the option that was never passed to reach it.
    const text = readCode("livewidget.ts");
    expect(text).toContain("onPath(f.path);");
    expect(text).toContain("onPath(oldPath);");
  });
});

describe("a menu row identifies its note by path, never by TFile", () => {
  const src = () => readCode("kind-row-menu.ts");

  it("captures the path as a string when the row is drawn", () => {
    // Obsidian MUTATES a `TFile` in place on rename, so a menu holding the
    // object holds a live handle to wherever that note went. A string cannot
    // follow the file.
    expect(src()).toContain("const path = file.path;");
  });

  it("resolves the note again when the ⋯ opens", () => {
    expect(src()).toContain("const live = getFile(table.plugin.app, path);");
  });

  it("draws a stale row's menu as a sentence, not as rows that would throw", () => {
    // The guard has to sit BETWEEN the lookup and the row builders. Dropping it
    // hands `null` to `addPageLayoutRows`, which is a thrown menu rather than a
    // refused one — and this is exactly the instant the reported bug lived in.
    const text = src();
    const lookup = text.indexOf("const live = getFile(table.plugin.app, path);");
    const guard = text.indexOf("if (!live) {", lookup);
    const rows = text.indexOf("addPageLayoutRows(menu, table, live, path)", lookup);
    expect(lookup).toBeGreaterThan(0);
    expect(guard).toBeGreaterThan(lookup);
    expect(rows).toBeGreaterThan(guard);
    expect(text.slice(guard, rows)).toContain("return;");
  });

  it("resolves it AGAIN at the click, because that is a second click", () => {
    // Between opening the menu and picking a row, the note may have moved. Both
    // row clicks go through a function that takes the PATH — asserted at the
    // CALL SITE, because a helper that is defined and not called is exactly the
    // mutation this is here to catch.
    expect(src()).toContain("void setLayout(plugin, path, row.id)");
    expect(src()).toContain("void bin(table, path)");
  });

  it("refuses rather than acting on whatever the handle now points at", () => {
    // THE BUG, stated as a rule: a stale row that ACTS is worse than a stale row
    // that says it is stale. Each resolve is immediately followed by its
    // refusal, so a mutation that keeps the lookup and drops the guard is red.
    for (const fn of ["async function setLayout(", "async function bin("]) {
      const at = src().indexOf(fn);
      expect(at, fn).toBeGreaterThan(0);
      const body = src().slice(at, at + 320);
      const lookup = body.indexOf("getFile(plugin.app, path)");
      expect(lookup, fn).toBeGreaterThan(0);
      // Nothing between the lookup and `if (!file)` but the end of that line.
      expect(body.slice(lookup, lookup + 60), fn).toContain("if (!file)");
      expect(body, fn).toContain("return;");
    }
    expect(src()).toContain("This note has moved — the list is out of date");
  });

  it("passes no TFile into the bin at all", () => {
    // The signature is what keeps the rule: a function that cannot be handed a
    // stale object cannot act on one.
    expect(src()).toContain(
      "function addBinRows(menu: Menu, table: KindRowContext, path: string): void"
    );
  });
});

describe("Obsidian's trash keeps its one honest caller", () => {
  it("is the attachment, and the probe is private to it again", () => {
    // PRIVATE AGAIN, and the round trip is the point — 4.50 lifted the probe
    // into `util.ts` for a second caller that should never have been one. An
    // attachment is a binary the reader added to a note rather than a note they
    // wrote, so the vault's *Deleted files* setting is the answer they already
    // gave for files like it.
    expect(readCode("attachment-widgets.ts")).toContain(
      "typeof fm.trashFile === \"function\""
    );
    expect(readCode("util.ts")).not.toContain("trashFile");
  });
});

// ── the row that grew a slot ──────────────────────────────────────────────

describe("the actions slot on a record row", () => {
  it("is a second slot, not another column", () => {
    // A control in `main` would be a column: it would want a heading, it would
    // shrink the title, and at the collapse width it would stack with the
    // values as though it were one.
    const text = readCode("tables.ts");
    expect(text).toContain("interface RecordSlots");
    expect(text).toContain("const { main, actions } = addRow({");
  });

  it("makes the heading strip pay the same reserve as the rows", () => {
    // `actions` is `flex: 0 0 auto` beside the grid, so without this every
    // value column sits a button's width left of its own heading.
    const css = readCss();
    expect(css).toContain(".ca-list.has-row-actions .ca-list-heads");
    expect(css).toContain("--ca-row-action-w");
  });

  it("reads the reserve from one custom property, so the two cannot drift", () => {
    const css = readCss();
    const strip = css.slice(css.indexOf(".ca-list.has-row-actions .ca-list-heads"));
    expect(strip.slice(0, 120)).toContain("var(--ca-row-action-w)");
    const menu = css.slice(css.indexOf(".ca-list-menu {"));
    expect(menu.slice(0, 220)).toContain("var(--ca-row-action-w");
  });

  it("does not put the reserve on a list that has no actions", () => {
    // The folder rollup's rows carry nothing — a folder has no page default and
    // no pages to bin — so its strip must not shift.
    expect(readCss()).toContain(".ca-list.has-row-actions {");
  });

  it("hangs the title's menu in the slot, not in the value grid", () => {
    // The wiring, which nothing else in this file reaches: `tables.ts` draws
    // tables and `kind-row-menu.ts` owns the menu, so the one line joining them
    // is the whole of the contract between the two.
    expect(readCode("tables.ts")).toContain(
      "attachKindRowMenu({ plugin, type, kind }, actions, note.file);"
    );
  });

  it("asks for the reserve on the list that has menus, and only that one", () => {
    // The folder rollup's rows carry nothing — a folder has no page default and
    // no pages to bin — so a reserve there would push its columns off their own
    // headings in the opposite direction.
    const text = readCode("tables.ts");
    expect(text).toContain(
      "recordList(root, [kind.label, ...columns.map(heading)], true)"
    );
    expect(text.match(/recordList\(root, \[[^;]*\], true\)/g) ?? []).toHaveLength(1);
  });

  it("keeps the control in the shared class family", () => {
    // It went in as `.jkt-row-menu` and `appearance.test.ts` caught it: `.jkt-*`
    // is the private family 2.56.9 retired, and a `⋯` in a row's actions slot
    // is what ANY list of records wants.
    expect(readCss()).toContain(".ca-list-menu");
    expect(readSrc("kind-row-menu.ts")).not.toContain('"jkt-');
  });
});
