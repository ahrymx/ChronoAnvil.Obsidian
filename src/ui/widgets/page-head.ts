// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// What the Banner section draws now that the bar exists. 4.51.6.
//
// ── THE BANNER IS REMADE, NOT DELETED ────────────────────────────────────
//
// 4.51 took the banner's four jobs — the note's name, its trail, its navigation
// and its cog — and gave every one of them to the vault bar, which left the
// `title` / `entry-header` / `journal-header` directives drawing nothing. A
// required section that renders nothing is a section waiting to be deleted, and
// deleting it would have been a migration on every note in the vault.
//
// So it draws the one thing the bar deliberately does NOT: **the page's own
// head**. The bar names the note the way a breadcrumb names it — small, in
// chrome, at the end of a trail. This names it the way a page names itself.
//
// ── AND IT REPLACES OBSIDIAN'S INLINE TITLE, WHICH IS THE POINT ──────────
//
// Obsidian draws the filename in a large face at the top of every note. On an
// Almanac note that is a third name for the same thing, in the plainest of the
// three. With `banner.absorb` on, the host's title is hidden and this is what
// stands in its place — a head that knows what KIND of note it is, and whose
// name is editable where Obsidian's is not.
//
// ── NO PROPERTIES ON IT, WHICH IS A DECISION ─────────────────────────────
//
// The obvious next move is the reference design's: a row of property cells
// under the title. It is not taken. A diary entry's properties are Mood, Sleep,
// Wake-Up and Bedtime — every one of them a TRACKER, drawn as an editable cell
// in the grid directly below this head. A journal note's are Confidence and
// Status, the same. A head that listed them would be the tracker grid again,
// read-only, four centimetres higher.
//
// What is left after the trackers is the note's plumbing — `journal-date`,
// `type`, `created` — which is reference material rather than something a
// reader looks at while writing. That lives behind the bar's *Properties*
// button, in a window, which is where the reader put it.

import { MarkdownPostProcessorContext, TFile } from "obsidian";
import type AlmanacPlugin from "../../main";
import { liveFrontmatterWidget } from "./live-widgets";
import { BannerSurface, bannerSurfaceOf, titleTargetFor } from "../../core/banner-scope";
import { bannerScopeOf } from "../vault-banner";
import { attachNoteRename, attachPropertyRename } from "../header-title";
import { TITLE_PROP, entryDateLabel } from "../../diary/entryheader";
import { journalTypeAtPath } from "../../journals/journal";
import { CLASS_DEFS, noteKindOf, TrackerClass } from "../../trackers/trackers";
import { OVERVIEW_LABELS, OverviewUnit } from "../../diary/calendar";
import { periodAnchor, valueLabel } from "../../diary/periodnav";
import { folderNotePath, folderPrefix } from "../../core/util";
import { LOGBOOK_TITLE } from "../../core/vocabulary";

/** The class the head carries. Named once — `headerbar.ts` reads it too. */
export const PAGE_HEAD_CLASS = "journal-page-head";

// The head, repainting on the note's own frontmatter. 4.51.7.
//
// ── THE WRAPPER CAME OFF WITH THE BANNER, AND IT WAS NOT THE BANNER'S ────
//
// 4.51.6 replaced `liveFrontmatterWidget(…, () => buildEntryHeader(…))` with a
// bare `buildPageHead(…)` and took the live host with it. The case's own
// sentence is why it was there: *an entry's title and a journal note's crumbs
// and date are all properties, so an edit repaints the band rather than waiting
// for the next file open.* Every one of those facts is still on the head.
//
// THE VAULT RENDER IS WHAT NAMED IT. A lesson note drew no eyebrow and no
// context strip — both built by the POSTPROCESSOR — while the bar, built at
// view time, named the journal on the same note. `buildTrackerHead` had already
// written the diagnosis down: *"Obsidian has not always indexed a note it has
// only just created by the time the postprocessor runs… A LiveWidget repaints
// on the note's next metadata change."* Without one, an eyebrow that loses that
// race stays lost until the note is closed and opened again.
//
// It is also what makes the Properties window honest: an edit to `title`,
// `type` or `journal-date` there now repaints the head under it.
//
// THE NULL CASE IS AN UNCLASSED DIV, NOT AN EMPTY HEAD. `.journal-page-head`
// paints a bottom rule, so a head with nothing in it is a line across a note
// that has no head — which is `nothing dead is drawn` with the sign flipped.
export function livePageHead(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext
): HTMLElement {
  return liveFrontmatterWidget(
    plugin,
    ctx,
    () => buildPageHead(plugin, ctx) ?? createDiv()
  );
}

// ── WHAT THE HEAD SAYS, ASKED WITHOUT DRAWING IT (4.51.7) ───────────────
//
// The head is not the only thing on the page that names what this note is. The
// caption over the logging grid prints the entry's date; the tracker card's
// context strip prints a journal note's level and kind. Both were right when
// the head did not exist, and the first vault render of 4.51.6 showed what they
// are now: `Thu 20 Aug 2026` a hundred pixels under `Thu 20 Aug 2026`, and
// `SUBJECT` under `STUDY · SUBJECT`.
//
// So this module answers the question — *does the head already say this?* — and
// the two callers ASK rather than each deriving the head's text for itself.
// That is the same move `hereText` made for the bar's meta slot in 4.51.5, and
// the reason is the one this release keeps meeting: two functions deriving one
// string is two places a wording change has to land.
export interface PageHeadText {
  surface: BannerSurface;
  /** What this note IS — "Daily entry", "Study · Lesson". "" where none fits. */
  eyebrow: string;
  /** The name the head prints, whatever the pencil writes to. */
  title: string;
  /** The date under the name, or null where the date IS the name. */
  sub: string | null;
  /**
   * What the pencil writes to, or `"none"` where the head prints a name the
   * reader does not own — see the overview arm of `pageHeadText`.
   */
  target: "filename" | "property" | "none";
}

// ── WHICH DIARY NOTE THIS IS (4.51.7) ───────────────────────────────────
//
// Three shapes wear one surface. An ENTRY is a dated note in a grain's folder;
// an OVERVIEW is that folder's own folder note, and the page is a period rather
// than a note the reader wrote; a DASHBOARD is `02 - Diary` itself.
//
// The head said "MONTHLY ENTRY" over "Monthly" on the second of those — an
// eyebrow calling a dashboard an entry, over a filename, on a page whose own
// masthead said *August 2026*. Nothing here is new information: the folder note
// path is `folderNotePath`, the grain is `entryContext`'s, and both were
// already being read one line apart.
//
// A FOURTH SHAPE ARRIVED IN 4.52 and it is the one that was WRONG rather than
// merely unnamed. A logbook is a note under `paths.logbooks` — inside the diary
// root, so the bar draws — and `noteKindOf` returns null for it, because it is
// in no grain folder. `grainOf` falls back to `daily`, so a work log's head read
// **DAILY ENTRY** over its filename: not a missing answer but a confident wrong
// one, which is the kind this table exists to make impossible.
type DiaryRole =
  | { role: "entry" }
  | { role: "overview"; unit: OverviewUnit }
  | { role: "dashboard" }
  | { role: "logbook" };

// The four grains that HAVE a period dashboard. Daily has none — there is no
// "Daily Overview" widget — so a `Daily/Daily.md` is a dashboard rather than an
// overview, which is what the `unit ? …` below says.
const OVERVIEW_UNIT: Partial<Record<TrackerClass, OverviewUnit>> = {
  weekly: "week",
  monthly: "month",
  quarterly: "quarter",
  yearly: "year",
};

// The grain, WITHOUT the neighbours (4.51.7).
//
// `entryContext` answers this too, and three call sites in this file were
// asking it — but it also walks the whole grain FOLDER and reads the
// frontmatter of every note in it to find the previous and next entries. That
// is the right cost for a navigator and an absurd one for a label: on a diary a
// year old it is three folder walks per render, and the head is now asked twice
// more per note by the caption and the context strip.
//
// `noteKindOf` is the one line inside `entryContext` that answers the question,
// and asking it directly is what that function does itself.
function grainOf(plugin: AlmanacPlugin, file: TFile): TrackerClass {
  const fm = plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  const kind = noteKindOf(
    plugin.settings.paths,
    file.path,
    fm["journal"],
    fm["type"]
  );
  return kind?.surface === "diary" ? kind.grain : "daily";
}

function diaryRoleOf(plugin: AlmanacPlugin, file: TFile): DiaryRole {
  const paths = plugin.settings.paths;
  // FIRST, BEFORE THE GRAIN IS ASKED FOR, because the grain has no answer here
  // and gives one anyway. A logbook is neither an entry nor a period; the
  // folder it is in IS the fact.
  //
  // The folder note is a logbook page too — it is the page about all of them —
  // and it takes the same eyebrow rather than a fifth role: what a reader needs
  // told there is that they are looking at logbooks, which the title beneath it
  // then narrows to which.
  if (paths.logbooks && file.path.startsWith(folderPrefix(paths.logbooks))) {
    return { role: "logbook" };
  }
  const grain = grainOf(plugin, file);
  const unit = OVERVIEW_UNIT[grain];
  if (file.path === folderNotePath(paths[CLASS_DEFS[grain].folderKey])) {
    return unit ? { role: "overview", unit } : { role: "dashboard" };
  }
  if (file.path === folderNotePath(paths.diaryRoot)) return { role: "dashboard" };
  return { role: "entry" };
}

// What the head would say on this note, or null where it draws none.
//
// IT ASKS `bannerSuppressed` ITSELF, and that is the load-bearing half: with the
// bar off there is no head, so the caption and the strip must keep saying what
// they have always said. A predicate that answered only "what would the text
// be" would strip those notes of facts nothing on the page replaces.
export function pageHeadText(
  plugin: AlmanacPlugin,
  file: TFile
): PageHeadText | null {
  const surface = bannerSurfaceOf(file.path, bannerScopeOf(plugin));
  if (!surface) return null;
  const eyebrow = eyebrowFor(plugin, file, surface);

  // THE PERIOD IS THE PAGE'S NAME, AND IT IS NOT A NAME ANYONE TYPED (4.51.7).
  // A period dashboard is `Monthly.md` on disk and *August 2026* on screen, and
  // the second is the true one: the note is a window onto whichever month its
  // `month-start` says. So the head prints the period — read through
  // `periodAnchor`, the same seed the band's navigator uses, so the two cannot
  // name different Augusts — and carries NO pencil. There is nothing here to
  // rename: the filename is plumbing and the period is a fact.
  if (surface === "diary") {
    const role = diaryRoleOf(plugin, file);
    if (role.role === "overview") {
      return {
        surface,
        eyebrow,
        title: valueLabel(role.unit, periodAnchor(plugin.app, file, role.unit)),
        sub: null,
        target: "none",
      };
    }
  }

  const date = dateLabel(plugin, file);
  const title = titleTextOf(plugin.app, file, surface, date);
  return {
    surface,
    eyebrow,
    title,
    // THE DATE UNDER THE NAME, AND ONLY WHERE IT IS NOT THE NAME. An untitled
    // entry is called by its date, so a subtitle repeating it is the same words
    // twice — the rule the bar's meta slot already follows.
    sub: date && date !== title ? date : null,
    target: titleTargetFor(surface, date !== null),
  };
}

// Whether the head is printing this exact string as the note's name.
//
// The caption row's question, and it takes the STRING rather than a date so the
// caller keeps owning what it was about to print — see `buildTrackerHead`.
export function pageHeadNames(
  plugin: AlmanacPlugin,
  file: TFile,
  text: string
): boolean {
  return pageHeadText(plugin, file)?.title === text;
}

// Whether the head's eyebrow already carries this fact.
//
// SEGMENT-WISE, because an eyebrow is `Study · Subject` and the strip's fact is
// `Subject`: a substring test would also swallow a kind called `Ub`, and an
// equality test would never fire at all.
export function pageHeadSays(
  plugin: AlmanacPlugin,
  file: TFile,
  fact: string
): boolean {
  const eyebrow = pageHeadText(plugin, file)?.eyebrow;
  if (!eyebrow) return false;
  const want = fact.trim().toLowerCase();
  return eyebrow
    .split("·")
    .some((part) => part.trim().toLowerCase() === want);
}

// The head, or null on a note the bar does not reach.
//
// NULL IS NOT A FAILURE HERE and the caller must not draw an error for it: the
// dispatcher only asks for a head when the bar is drawing, so this can only
// return null on a file that vanished between the render and the call.
export function buildPageHead(
  plugin: AlmanacPlugin,
  ctx: MarkdownPostProcessorContext
): HTMLElement | null {
  const app = plugin.app;
  const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(file instanceof TFile)) return null;
  const said = pageHeadText(plugin, file);
  if (!said) return null;

  const root = createDiv({ cls: PAGE_HEAD_CLASS });
  root.setAttr("data-surface", said.surface);

  if (said.eyebrow) root.createDiv({ cls: "jph-eyebrow", text: said.eyebrow });

  const row = root.createDiv({ cls: "jph-titlerow" });
  const date = dateLabel(plugin, file);
  // THE SAME TWO TARGETS THE BAR USES, through the same table. A journal note's
  // filename IS its name; a diary entry's filename is the date the diary finds
  // it by, so renaming it would remove the entry rather than retitle it — and a
  // period dashboard's name is neither, so it gets text and no pencil.
  if (said.target === "none") {
    row
      .createDiv({ cls: "jph-title is-fixed" })
      .createSpan({ cls: "jph-title-text", text: said.title });
  } else if (said.target === "filename") {
    attachNoteRename(app, row, file, "jph-title");
  } else {
    attachPropertyRename(app, row, file, "jph-title", TITLE_PROP, date ?? file.basename);
  }

  if (said.sub) root.createDiv({ cls: "jph-sub", text: said.sub });
  return root;
}

// What this note IS, in small caps over its name.
//
// THE KIND, NOT THE SURFACE. "Diary" is what the bar's lockup already says and
// what the trail already shows; what a head adds is that this is a *lesson*, a
// *topic*, a *daily entry* — the word a reader would use for the note in a
// sentence. It is also the one fact on the head that the bar has nowhere to put.
function eyebrowFor(
  plugin: AlmanacPlugin,
  file: TFile,
  surface: BannerSurface
): string {
  if (surface === "diary") {
    const role = diaryRoleOf(plugin, file);
    // WHERE THE NOTE LIVES, THEN WHAT IT IS — but only on the pages where the
    // first half earns its space. Both halves of the vault have dashboards, so
    // one says which half it is in; an ENTRY exists nowhere else, and *Daily
    // entry* is already the whole answer.
    //
    // `OVERVIEW_LABELS` had been dead since 3.4, when the band's eyebrow moved
    // to the trail because *"one of them had to move to the top bar, and only
    // one of them was already there."* The head is where it belongs.
    if (role.role === "overview") return `Diary · ${OVERVIEW_LABELS[role.unit]}`;
    if (role.role === "dashboard") return "Diary";
    if (role.role === "logbook") return `Diary · ${LOGBOOK_TITLE}`;
    return `${CLASS_DEFS[grainOf(plugin, file)].label} entry`;
  }
  if (surface === "journal") {
    // BY PATH, NOT BY `type:` (4.51.7). `journalTypeOfNote` refuses a note that
    // does not declare itself, which is right for the refusals that ask it and
    // wrong here: a journal's own dashboard declares nothing, so the strict
    // answer left `Study/Study.md` with no eyebrow at all. See
    // `journalTypeAtPath` for the two-questions note.
    const type = journalTypeAtPath(plugin, file.path);
    if (!type) {
      // The journals root's own folder note is not IN a journal; it is the page
      // that lists them. Anything else this far out is a stray note, and a
      // stray note gets nothing rather than a guess.
      const root = plugin.settings.paths.journalsRoot;
      return root && file.path === folderNotePath(root) ? "Journals" : "";
    }
    // The journal's own dashboard, named as what it is rather than left to
    // repeat its title.
    if (file.path === folderNotePath(type.root)) return `${type.name} · Journal`;
    const raw = plugin.app.metadataCache.getFileCache(file)?.frontmatter?.["type"];
    const id = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    const named =
      type.kinds.find((k) => k.id === id)?.label ??
      type.levels.find((l) => l.id === id)?.noun;
    // A NOTE WITH NO `type` IS STILL SOMETHING — it is a page of this journal,
    // and naming the journal is better than naming nothing.
    return named ? `${type.name} · ${named}` : type.name;
  }
  // HOME AND SEARCH GET NONE, DELIBERATELY. The title on those two pages is
  // *Homepage* and *Search*; an eyebrow reading HOME over it is the doubling
  // this release exists to remove, and there is no second fact to put there.
  return "";
}

function dateLabel(plugin: AlmanacPlugin, file: TFile): string | null {
  return entryDateLabel(plugin.app, file, grainOf(plugin, file));
}

// What the title row will read, so the subtitle can decline to repeat it.
function titleTextOf(
  app: AlmanacPlugin["app"],
  file: TFile,
  surface: BannerSurface,
  date: string | null
): string {
  if (titleTargetFor(surface, date !== null) === "filename") return file.basename;
  const v = app.metadataCache.getFileCache(file)?.frontmatter?.[TITLE_PROP];
  const title = typeof v === "string" ? v.trim() : "";
  return title || date || file.basename;
}
