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
// ChronoAnvil note that is a third name for the same thing, in the plainest of the
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
import type ChronoAnvilPlugin from "../../main";
import { liveFrontmatterWidget } from "./live-widgets";
import { BannerSurface, bannerSurfaceOf, titleTargetFor } from "../../core/banner-scope";
import { bannerScopeOf } from "../vault-banner";
import { attachNoteRename, attachPropertyRename } from "../header-title";
import { TITLE_PROP, entryDateLabel } from "../../diary/entryheader";
import { paintJournalRung, journalRungFor, journalNounOf, journalTypeAtPath } from "../../journals/journal";
import { paintRung, pageIconOf } from "../rung";
import { grainRung } from "../../diary/lineage";
import type { JournalType } from "../../journals/journal";
import { CLASS_DEFS, noteKindOf, TrackerClass } from "../../trackers/trackers";
import { OVERVIEW_LABELS, OverviewUnit } from "../../diary/calendar";
import { periodAnchor, valueLabel } from "../../diary/periodnav";
// `moment` FROM `core/util`, NOT FROM `obsidian` (5.31.2). Obsidian types its own
// export as a NAMESPACE, which does not typecheck as callable; `util.ts` holds
// the one cast and the `MomentLike` surface every date-doing module in the tree
// already reads. It is also the import `eslint`'s `no-restricted-globals` rule
// leaves standing — the global is the error, not the module.
import { dashboardGrainOf, folderNotePath, folderPrefix, frontmatterOf, moment, noExt, normaliseTypeValue, noteTypeOf, openFile } from "../../core/util";
import { LOGBOOK_TITLE } from "../../core/vocabulary";
import { resolveUp } from "../../core/links";
import { attachFileGestures } from "../file-gestures";
import { addPageActionsControl } from "./actions-menu";

/** The class the head carries. Named once — `headerbar.ts` reads it too. */
export const PAGE_HEAD_CLASS = "ca-journal-page-head";
/** The tiled glyph layer behind a journal head's words (1.0.42). */
export const PAGE_HEAD_FILM_CLASS = "ca-jph-film";

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
// THE NULL CASE IS AN UNCLASSED DIV, NOT AN EMPTY HEAD. `.ca-journal-page-head`
// paints a bottom rule, so a head with nothing in it is a line across a note
// that has no head — which is `nothing dead is drawn` with the sign flipped.
//
// ── AND THE ACTION MENU IS BUILT HERE, NOT DOCKED HERE (1.0.11) ──────────
//
// `withActions` is the banner fence's `actions` line, read off the body before
// the dispatcher's loop and handed down. It is a parameter rather than a node
// the block moves into the title row afterwards, and the wrapper above is
// exactly why: `LiveWidget` empties this host and calls `build` again on every
// write to the note's frontmatter, so a control docked in from outside would
// survive until the reader's next property edit and then silently vanish. What
// the head draws, the head redraws.
//
// ── `carry` IS THE STACK'S CARD (1.0.42) ────────────────────────────────
//
// A stack's card wears the note's left edge — `30-header-bars.css` has the
// argument — and until this release it could not see the colour to draw it in,
// because `page-head.ts` wrote the grain on the HEAD and a custom property
// reaches descendants and never an ancestor. So the head painted the edge with
// a pseudo-element instead, which cost the head its `position` and, when the
// glyph film arrived, cost the film the only pseudo it could have used.
//
// Handing the card in is the shorter answer to the same question, and it is
// handed in THROUGH THIS WRAPPER rather than set once by the caller because
// `LiveWidget` rebuilds on every frontmatter write: a card painted once would
// keep the tone of the rung the note used to be.
export function livePageHead(
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext,
  withActions = false
): HTMLElement {
  return liveFrontmatterWidget(
    plugin,
    ctx,
    (host) => buildPageHead(plugin, ctx, withActions, stackCardOf(host)) ?? createDiv()
  );
}

// The stack card this head is the top band of, where there is one.
//
// THE LITERAL, NOT AN IMPORT, because the class is pushed by `chromeClasses` in
// `widgets/index.ts` and that module imports this one — naming it there and
// reading it here closes a cycle for one string. `test/journal-stack.test.ts`
// holds the two spellings equal instead, which is the check that would actually
// catch a rename.
function stackCardOf(host: HTMLElement): HTMLElement[] {
  const card = host.closest(".ca-journal-stack");
  return card instanceof HTMLElement ? [card] : [];
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
  /**
   * The note this one is a page OF, when there is one; null on every other
   * surface. The label is already the TAIL of `eyebrow` — see `eyebrowFor`.
   *
   * ── WHY THIS IS A SECOND FIELD AND NOT A RICHER `eyebrow` (1.0.38) ──────
   *
   * `eyebrow` is a plain string because two callers ASK it a question rather
   * than draw it: `pageHeadSays` splits it on `·` so the tracker card's context
   * strip can withhold a fact the head already states. Making it a node, or a
   * list of parts, would move that predicate's work into every caller — and the
   * comment above `PageHeadText` is about exactly the failure that causes.
   *
   * So the string stays whole and this says which part of it is a LINK. The
   * `file` is null when the parent cannot be resolved, and the head then prints
   * the label as text: `journalCrumbs` has followed the same rule since 4.36,
   * because a dead link to a note that is not there is a step to nowhere.
   */
  parent: { label: string; file: TFile | null } | null;
  /** The name the head prints, whatever the pencil writes to. */
  title: string;
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
function grainOf(plugin: ChronoAnvilPlugin, file: TFile): TrackerClass {
  const fm = frontmatterOf(plugin.app, file);
  const kind = noteKindOf(
    plugin.settings.paths,
    file.path,
    fm["journal"],
    fm["type"]
  );
  return kind?.surface === "diary" ? kind.grain : "daily";
}

function diaryRoleOf(plugin: ChronoAnvilPlugin, file: TFile): DiaryRole {
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
  // THE DASHBOARD IS A FILE NOW, NOT A FOLDER'S NOTE (4.81). This asked
  // `file.path === folderNotePath(<the grain folder>)`, which was true of
  // `02 - Diary/Weekly/Weekly.md` and is true of nothing once the four notes
  // live in `Dashboards/` — so every one of them would have read **WEEKLY
  // ENTRY** over its filename, the exact wrong-eyebrow bug the table above this
  // type was written to make impossible. `dashboardGrainOf` knows both
  // addresses, so an un-repaired vault keeps the head it has today.
  const dashboard = dashboardGrainOf(paths, file.path);
  const dashboardUnit = dashboard ? OVERVIEW_UNIT[dashboard] : undefined;
  if (dashboardUnit) return { role: "overview", unit: dashboardUnit };

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
  plugin: ChronoAnvilPlugin,
  file: TFile
): PageHeadText | null {
  const surface = bannerSurfaceOf(file.path, bannerScopeOf(plugin));
  if (!surface) return null;
  const { text: eyebrow, parent } = headEyebrow(plugin, file, surface);

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
        parent,
        title: valueLabel(role.unit, periodAnchor(plugin.app, file, role.unit)),
        target: "none",
      };
    }
  }

  const date = dateLabel(plugin, file);
  const title = titleTextOf(plugin.app, file, surface, date);
  return {
    surface,
    eyebrow,
    parent,
    title,
    target: titleTargetFor(surface, date !== null),
  };
}

// Whether the head's eyebrow already carries this fact.
//
// SEGMENT-WISE, because an eyebrow is `Study · Subject` and the strip's fact is
// `Subject`: a substring test would also swallow a kind called `Ub`, and an
// equality test would never fire at all.
export function pageHeadSays(
  plugin: ChronoAnvilPlugin,
  file: TFile,
  fact: string
): boolean {
  const eyebrow = pageHeadText(plugin, file)?.eyebrow;
  if (!eyebrow) return false;
  const want = fact.trim().toLowerCase();
  return eyebrow.split("·").some((part) => {
    const seg = part.trim().toLowerCase();
    // ── AND A SEGMENT MAY NOW CARRY A SECOND FACT (1.0.38) ───────────────
    //
    // A page's segment reads `Page of HTML + CSS Cheat Sheet`, and an exact
    // match would answer NO to *"does the head say Page?"* on the one surface
    // where it plainly does. The predicate exists to stop a fact being printed
    // twice, so it has to read the segment the way a reader does.
    //
    // THE PREFIX, NOT A `includes`. `of` is the join this file writes and the
    // only one; matching anywhere in the segment would suppress "Lesson" under
    // a head reading `Page of Lesson Four`, which is a different note's name.
    return seg === want || seg.startsWith(`${want} of `);
  });
}

// ── WHICH GRAIN A DIARY PAGE IS COLOURED AND WEIGHTED BY ────────────────
//
// Lifted out of `buildPageHead` when the banner's *Change the page icon* action
// needed the same answer (1.0.42). Every diary page has a grain; the three
// branches differ only in where it comes from.
function diaryGrainOf(
  plugin: ChronoAnvilPlugin,
  file: TFile
): TrackerClass {
  const role = diaryRoleOf(plugin, file);
  if (role.role === "overview") {
    return role.unit === "week"
      ? "weekly"
      : role.unit === "month"
        ? "monthly"
        : role.unit === "quarter"
          ? "quarterly"
          : "yearly";
  }
  if (role.role === "entry") return grainOf(plugin, file);
  // ── THE TWO DIARY ROLES THAT ARE NEITHER A PERIOD NOR AN ENTRY (5.31.2)
  //
  // They took no grain, and until that release that meant no SPINE either: the
  // Diary folder note and every Logbook page drew **DIARY** and
  // **DIARY · LOGBOOK** in the theme's own accent, over folders of amber
  // entries. `98-page-head.css` gives every head a spine now, so all that is
  // left to decide here is its COLOUR — and a dashboard is coloured like the
  // thing it is a dashboard for.
  //
  // DAILY FOR THE DIARY'S OWN NOTE, AND IT IS THE ARGUABLE HALF. That page is
  // about all five grains rather than the first of them. What settles it is the
  // OTHER file this role covers: `diaryRoleOf` returns `dashboard` for the
  // Daily folder's own note too, because `OVERVIEW_UNIT` has no entry for the
  // daily grain — and that page is daily in the plainest sense. One role cannot
  // hold two colours, and amber is the colour a reader already associates with
  // the diary, because the entries they open every day are amber.
  //
  // YEARLY FOR A LOGBOOK. It is the widest window the palette has, and a
  // logbook is the diary's longest-running page: `LOGBOOK_TITLE` names the one
  // that is about a whole run of them.
  return role.role === "logbook" ? "yearly" : "daily";
}

// ── THE GLYPH THIS NOTE WOULD DRAW WITH NO OVERRIDE (1.0.42) ────────────
//
// What *Change the page icon* seeds its picker with, and what it compares a
// reader's choice against: choosing the glyph the note already had stores
// nothing, which is `kind-columns.ts`' rule — a value equal to its default is
// not written, or a reader's frontmatter fills up with records of them agreeing
// with us.
//
// NULL WHERE THERE IS NO FILM TO CHANGE, which is a real case and not a
// failure: a note under a journal root whose `type:` names no rung draws no
// glyph, and the action says so rather than writing a key that does nothing.
export function pageGlyphOf(
  plugin: ChronoAnvilPlugin,
  file: TFile
): string | null {
  const said = pageHeadText(plugin, file);
  if (!said) return null;
  if (said.surface === "diary") return CLASS_DEFS[diaryGrainOf(plugin, file)].emoji;
  if (said.surface !== "journal") return null;
  const type = journalTypeAtPath(plugin, file.path);
  if (!type) return null;
  return journalRungFor(plugin.app, file, type)?.emoji ?? null;
}

// The head, or null on a note the bar does not reach.
//
// NULL IS NOT A FAILURE HERE and the caller must not draw an error for it: the
// dispatcher only asks for a head when the bar is drawing, so this can only
// return null on a file that vanished between the render and the call.
export function buildPageHead(
  plugin: ChronoAnvilPlugin,
  ctx: MarkdownPostProcessorContext,
  withActions = false,
  carry: readonly HTMLElement[] = []
): HTMLElement | null {
  const app = plugin.app;
  const file = app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(file instanceof TFile)) return null;
  const said = pageHeadText(plugin, file);
  if (!said) return null;

  const root = createDiv({ cls: PAGE_HEAD_CLASS });
  root.setAttr("data-surface", said.surface);
  root.setAttr("data-ca-surface", said.surface);
  // THE IDENTITY GOES ON BOTH; THE HEAD'S OWN CHROME GOES ON THE HEAD. Which
  // note this is — its grain, its journal, its rung — is what an ancestor needs
  // and is carried; `data-surface`, `data-ca-surface` and `data-ca-role` say
  // what this ELEMENT is and stay where they are.
  const identity = [root, ...carry];

  if (said.surface === "diary") {
    const role = diaryRoleOf(plugin, file);
    root.setAttr("data-ca-role", role.role);
    const grain = diaryGrainOf(plugin, file);
    for (const el of identity) el.setAttr("data-ca-grain", grain);
    paintRung(identity, grainRung(grain), pageIconOf(frontmatterOf(app, file)));
    root.createDiv({ cls: PAGE_HEAD_FILM_CLASS });
  } else if (said.surface === "journal") {
    const type = journalTypeAtPath(plugin, file.path);
    // ── AND THE ACCENT IS PER RUNG NOW (1.0.42) ──────────────────────────
    //
    // This wrote the two accent properties by hand, and `vault-banner.ts` wrote
    // the same two. Both now go through `paintJournalRung`, which also stamps
    // `data-ca-tier`, `--ca-tier-t` and `--ca-head-glyph` — the four facts
    // `98-page-head.css` needs to step a head's mass and tile its glyph.
    //
    // BOTH HALVES OF THE ACCENT ARE STILL SET, which is what that comment was
    // here to say: `--ca-journal-accent-rgb` is what `--ca-grain-tint` is
    // computed from, and setting only the colour left every journal in the vault
    // washing the same purple on the one surface whose job is to say which
    // journal this is.
    // THE FILM IS A CHILD, AND IT IS DRAWN ONLY WHERE THERE IS A RUNG. See
    // `paintJournalRung` for why it is not the head's `::before` — the stack
    // owns that pseudo. Empty and decorative: everything it shows comes from
    // `--ca-head-glyph`, so there is nothing here for a screen reader to read
    // and nothing to hide from one.
    if (type && paintJournalRung(app, file, type, identity)) {
      root.createDiv({ cls: PAGE_HEAD_FILM_CLASS });
    }
  }

  // THE RAIL REPLACES THE EYEBROW, AND `eyebrowFor` IS UNTOUCHED. Those are one
  // decision: `pageHeadSays` splits the eyebrow on `·` so the tracker card's
  // context strip can withhold what the head already states, and
  // `study-header.ts` records what happens when that predicate and the head
  // disagree — the true half of the strip suppressed and a fabricated level left
  // showing. So what changes here is what the head DRAWS. What it SAYS is the
  // same string it has always said.
  const rail = railOf(plugin, file, said.surface);
  if (rail) buildRail(root, rail);
  else if (said.eyebrow) buildEyebrow(app, root, said, ctx.sourcePath);

  const row = root.createDiv({ cls: "ca-jph-titlerow" });
  const date = dateLabel(plugin, file);
  // THE SAME TWO TARGETS THE BAR USES, through the same table. A journal note's
  // filename IS its name; a diary entry's filename is the date the diary finds
  // it by, so renaming it would remove the entry rather than retitle it — and a
  // period dashboard's name is neither, so it gets text and no pencil.
  if (said.target === "none") {
    row
      .createDiv({ cls: "ca-jph-title is-fixed" })
      .createSpan({ cls: "ca-jph-title-text", text: said.title });
  } else if (said.target === "filename") {
    attachNoteRename(app, row, file, "ca-jph-title");
  } else {
    attachPropertyRename(app, row, file, "ca-jph-title", TITLE_PROP, date ?? file.basename);
  }

  // IN THE TITLE ROW AND LAST, which is where 4.5 put the cog it describes as
  // "a cog in the far corner" and where the CSS floats it with `margin-left:
  // auto`. Beside the name rather than under it: the control acts on the note
  // the name identifies, and a row of its own is the band the first cut drew
  // and the vault rejected.
  //
  // AFTER THE PENCIL, so tab order is name-then-control — reading order and
  // screen order agree, which is the property the entry banner's band reorder
  // was careful about for the same reason.
  if (withActions) addPageActionsControl(row, plugin, file.path);

  // ── AND NOTHING UNDER THE NAME (1.0.35) ─────────────────────────────────
  //
  // A `.ca-jph-sub` div stood here printing the note's date — `sub` on
  // `PageHeadText`, filled where the date was not already the title. It is
  // deleted, field and rule and all, on the reader's call: *"there is a
  // sub-header stating 'Mon 1 Jan 2001'. To be honest, even though it is wrong,
  // there is no need for this subheader to be in a page banner — it is safe to
  // remove."*
  //
  // BOTH HALVES OF THAT ARE TRUE AND THE SECOND IS THE ONE THAT DECIDES IT.
  // The wrong date was real: `entryDateLabel` falls back to `isoDate(basename)`
  // and then formats whatever `journal-date` holds, so an index note that never
  // had a date — a subject page, which is the one in the screenshot — got a
  // formatted epoch rather than nothing. But fixing the date would have left a
  // correct date line on a head that has no business carrying one: a leaf
  // note's date is already in the trail row's meta slot (`metaFor`), a diary
  // entry's is its title, and a period dashboard's is its title. The line
  // repeated something on every surface it appeared on.
  //
  // WHAT THIS DOES NOT DELETE is `dateLabel`. It still decides the pencil's
  // target (`titleTargetFor(surface, date !== null)`) and still stands in as
  // the property pencil's placeholder, which is why it reads as unused here
  // and is not.
  return root;
}

// The eyebrow as the head both SAYS it and DRAWS it. 1.0.38.
//
// ── THE READER WROTE THE PARENT IN BY HAND, WHICH IS THE BUG REPORT ──────
//
// A page's head read `STUDY · PAGE` and stopped. The note it is a page OF was
// named nowhere on the page — the vault bar's trail has it, but that is chrome
// above the note and off entirely in some setups — so the reader typed
// **Parent page:** and the cheatsheet's name into the prose of the page itself.
// A fact a reader maintains by hand is a fact the plugin already knows and is
// not printing.
//
// `PAGE OF HTML + CSS CHEAT SHEET` is what they chose over the alternatives: a
// crumb row under the head, a back arrow beside the title. It costs no new row,
// it reads as a sentence, and the eyebrow was already the line that says what
// this note IS — *a page of that* is the whole answer rather than half of it.
//
// COMPOSED HERE AND NOWHERE ELSE, which is what keeps `eyebrow` a string the
// two asking callers can still split (see `PageHeadText.parent`). `eyebrowFor`
// answers what KIND of note this is, unchanged on every surface; this joins the
// parent on to it, and only this knows the word `of` is the join.
function headEyebrow(
  plugin: ChronoAnvilPlugin,
  file: TFile,
  surface: BannerSurface
): { text: string; parent: PageHeadText["parent"] } {
  const text = eyebrowFor(plugin, file, surface);
  const parent = text ? pageParentOf(plugin, file, surface) : null;
  return { text: parent ? `${text} of ${parent.label}` : text, parent };
}

// The note this one is a page of, or null where the question does not apply.
//
// ── `resolveUp` ANSWERS IT, AT EVERY DEPTH, AND IT ALREADY DID ───────────
//
// `core/links.ts` has computed this since 2.x for the bar's **Up** pill: a
// folder note's parent is its folder's folder, a plain note's is its own
// folder, and the folder note of whichever that is, is the answer. It is stated
// in terms of THIS note's folder rather than the journal's shape, so the moment
// pages nest it keeps being right without being touched — a page of a page of a
// page resolves by the same two lines as a page of a lesson.
//
// THE FALLBACK IS `parent:`, AND IT IS THE FIRST READER THAT PROPERTY HAS EVER
// HAD. `journal-template.ts` calls it *"the ONLY thing tying a page to the note
// it is a page of"*, and until this release nothing in `src/` read it: every
// comment claiming it mattered was describing an intention. It is written at
// creation and stands for the note that HELD the page then, so it is the right
// answer when the folder note is missing and the wrong one when the page has
// been moved — hence second, and hence unlinked. A crumb with no file is text,
// never a dead link; `journalCrumbs` has followed that rule since 4.36.
function pageParentOf(
  plugin: ChronoAnvilPlugin,
  file: TFile,
  surface: BannerSurface
): PageHeadText["parent"] {
  if (surface !== "journal") return null;
  const type = journalTypeAtPath(plugin, file.path);
  if (!type) return null;
  // ONLY A PAGE. A leaf's parent is the index above it, which the rail and the
  // bar's trail both name already, and an index's is the journal — naming
  // either would be the doubling this whole head exists to remove.
  const value = normaliseTypeValue(noteTypeOf(plugin.app, file));
  if (value == null || !type.kinds.some((k) => k.pages.id === value)) return null;

  const up = resolveUp(plugin.app, file);
  if (up.file) return { label: up.file.basename, file: up.file };

  const declared = frontmatterOf(plugin.app, file)["parent"];
  const label = typeof declared === "string" ? declared.trim() : "";
  // AN UNFILLED TOKEN IS NOT A NAME. The page TEMPLATE carries the literal
  // `{{parent}}`, it lives under the journal root, and it declares `type: page`
  // — so a reader who opens their template to edit it reaches every line above.
  // `PAGE OF {{PARENT}}` is the kind of wrong that looks like a broken plugin.
  return label && !label.includes("{{") ? { label, file: null } : null;
}

// The eyebrow's markup: text, with the parent's name as a real link.
//
// THE SAME FOUR GESTURES EVERY OTHER LINK HERE HAS, copied from `renderCrumb`
// (`study-header.ts`) rather than reinvented — `internal-link` for the theme's
// look, a click handler because Obsidian's own are bound to rendered markdown
// and not to chrome a plugin builds, `attachFileGestures` for middle-click and
// the file menu, and a `hover-link` trigger for the page preview. 1.0.30 is the
// release that learned a link wearing the class and none of the behaviour is
// worse than a plain one, because it looks like it should work.
function buildEyebrow(
  app: ChronoAnvilPlugin["app"],
  root: HTMLElement,
  said: PageHeadText,
  sourcePath: string
): void {
  const el = root.createDiv({ cls: "ca-jph-eyebrow" });
  const parent = said.parent;
  // THE LABEL IS THE TAIL OF THE STRING, and `headEyebrow` is what makes that
  // true. The guard is not defensive noise: the two are separate fields, and a
  // future arm that composes them differently must fall back to plain text
  // rather than slice the wrong number of characters off a reader's head.
  if (!parent || !said.eyebrow.endsWith(parent.label)) {
    el.setText(said.eyebrow);
    return;
  }
  el.createSpan({
    text: said.eyebrow.slice(0, said.eyebrow.length - parent.label.length),
  });
  const file = parent.file;
  if (!file) {
    el.createSpan({ cls: "ca-jph-parent", text: parent.label });
    return;
  }
  const href = noExt(file.path);
  const a = el.createEl("a", {
    cls: "internal-link ca-jph-parent",
    href,
    text: parent.label,
    attr: { "data-href": href, "aria-label": parent.label, title: parent.label },
  });
  a.addEventListener("click", (evt) => {
    evt.preventDefault();
    void openFile(app, file);
  });
  attachFileGestures(app, a, file);
  a.addEventListener("mouseover", (evt) => {
    app.workspace.trigger("hover-link", {
      event: evt,
      source: "ca-page-head",
      hoverParent: el,
      targetEl: a,
      linktext: href,
      sourcePath,
    });
  });
}

// What this note IS, in small caps over its name.
//
// THE KIND, NOT THE SURFACE. "Diary" is what the bar's lockup already says and
// what the trail already shows; what a head adds is that this is a *lesson*, a
// *topic*, a *daily entry* — the word a reader would use for the note in a
// sentence. It is also the one fact on the head that the bar has nowhere to put.
function eyebrowFor(
  plugin: ChronoAnvilPlugin,
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
    // ── AND `journalNounOf` KNOWS ABOUT PAGES, WHICH THIS DID NOT (5.20) ──
    //
    // This was two `find`s inline — kinds, then levels — and a page's `type:`
    // is neither: it is `kind.pages.id`, the fourth list `recognisedTypeValues`
    // walks and the only one nothing here looked at. So every page fell to the
    // bare-journal fallback below and wore `STUDY` while the lesson it belongs
    // to wore `STUDY · LESSON`.
    //
    // The lookup moved to `journal.ts` rather than gaining a third `find` here,
    // because the list it walks is the journal's and the omission was the kind
    // that recurs by being retyped one caller at a time.
    const named = journalNounOf(type, noteTypeOf(plugin.app, file));
    // A NOTE WITH NO `type` IS STILL SOMETHING — it is a page of this journal,
    // and naming the journal is better than naming nothing.
    return named ? `${type.name} · ${named}` : type.name;
  }
  // ── HOME AND SEARCH SAY WHAT DAY IT IS (5.31.2) ─────────────────────
  //
  // THEY SAID NOTHING UNTIL THIS RELEASE, and the paragraph that decided it was
  // right about the answer it turned down: *"the title on those two pages is
  // Homepage and Search; an eyebrow reading HOME over it is the doubling this
  // release exists to remove, and there is no second fact to put there."* HOME
  // really would be the third HOME on the screen — the bar's lockup and the nav
  // tile beside it are the first two.
  //
  // THE DATE IS THE SECOND FACT IT COULD NOT FIND, and `home-sections.ts` is
  // where the argument for it is already written: *"the homepage is the only
  // note in the vault that is about NOW — today's numbers, this month's grid,
  // what is coming up, the journals as they stand."* Nothing in the bar carries
  // the date on any page, so this doubles nothing.
  //
  // IT IS THE ONE EYEBROW READ OFF A CLOCK RATHER THAN OFF A FILE, which makes
  // it the one that can go stale where it stands. The head is a
  // `liveFrontmatterWidget`: it repaints on the note's next metadata change, not
  // at midnight, so a vault left open overnight shows yesterday until the note
  // is touched or reopened. That is a smaller wrong than a page about NOW which
  // does not say when now is, and the alternative is a timer per open note for a
  // line nobody is reading at 00:00.
  //
  // SEARCH TAKES IT TOO, because `home` is ONE surface: `BannerScope.flatNotes`
  // holds both paths and `bannerSurfaceOf` does not distinguish them. Search is
  // the page about everything rather than about now, so it is the honest place
  // to split this arm — on the day there is a second fact for it to say.
  return moment().format("dddd · D MMMM YYYY");
}

// ── WHICH LAYER OF THE JOURNAL THIS IS ──────────────────────────────────
//
// THE EYEBROW WAS THE ONLY ANSWER AND IT WAS THE WRONG SHAPE. `PROJECTS ·
// JOURNAL`, `PROJECTS · AREA` and `PROJECTS · PROJECT` are three heads that
// differ by one word, set at 0.7em in the same accent as the word beside it, on
// three pages that are otherwise identical — same wash, same spine, same title
// face. A reader two folders down could not tell the three apart at a glance,
// and none of them said how many layers there were to come.
//
// The rail says all of it in one line: a step per layer, the current one marked,
// the ones behind filled and the ones ahead hollow. Depth stops being a word to
// read and becomes a position to see, and "there is another level under this
// one" — which the eyebrow could not express at all — is the hollow step on the
// end.
//
// THE JOURNAL IS THE FIRST STEP, under its own name. That is what lets the rail
// REPLACE the eyebrow rather than sit beside it: `Projects` was the eyebrow's
// first half, and a rail whose first step is the journal carries that fact in
// the place it already occupied.
export interface LevelRail {
  // One per step, outermost first. `steps[0]` is the journal itself.
  steps: string[];
  // Index into `steps` of the layer this note IS. Always in range.
  here: number;
}

// The rail a note draws, or null for a note that is not a layer.
//
// PURE, AND TAKES THE TYPE RATHER THAN THE PLUGIN. The decision is "given this
// journal and what this note calls itself, which step is it" — no vault, no
// settings, no file. The lookup that answers the two arguments stays in
// `buildPageHead`, which is the only place that has a file to ask about.
//
// BY THE NOTE'S OWN `type:`, NOT BY ITS PATH. `JournalLevel.id` is documented as
// "the `type:` frontmatter value an index note at this depth carries", so the
// note already states which layer it is and `containerDepth` would be a second
// derivation of a fact that is written down. It would also drag
// `page-head → tables → kind-create → settings-editors` into the import graph
// for one line of arithmetic.
//
// NULL FOR A LEAF, A PAGE AND A STRAY, and that is a scope decision rather than
// a gap: an Update is not a layer of the journal, it is what the layers hold, so
// it keeps the eyebrow that names its kind.
export function railFor(
  type: JournalType,
  isJournalHome: boolean,
  typeValue: unknown
): LevelRail | null {
  if (!type.levels.length) return null;
  const steps = [type.name, ...type.levels.map((l) => l.noun)];
  // The journal's own folder note — the page `eyebrowFor` answers `… · Journal`
  // for, which is the string this step replaces.
  if (isJournalHome) return { steps, here: 0 };

  const value = normaliseTypeValue(typeValue);
  const depth = value == null ? -1 : type.levels.findIndex((l) => l.id === value);
  if (depth < 0) return null;
  // `+ 1` FOR THE JOURNAL STEP. Written once, here, because every other reader
  // of this shape would otherwise have to know that `steps` is one longer than
  // `levels` and which end the extra one is on.
  return { steps, here: depth + 1 };
}

// The same question asked of a file, which is what the head has.
function railOf(
  plugin: ChronoAnvilPlugin,
  file: TFile,
  surface: BannerSurface
): LevelRail | null {
  if (surface !== "journal") return null;
  // The lenient resolver, for the reason `eyebrowFor` gives one screen down: a
  // journal's own dashboard declares no `type:` at all, and the strict one
  // answers "no journal" for the single page whose whole subject is the journal.
  const type = journalTypeAtPath(plugin, file.path);
  if (!type) return null;
  return railFor(
    type,
    file.path === folderNotePath(type.root),
    noteTypeOf(plugin.app, file)
  );
}

// The rail's markup. One node per step; the connectors are drawn in CSS, so a
// three-layer journal is three elements rather than five.
//
// NOT LINKS. Obsidian's breadcrumb sits directly above this note and already
// goes to every one of these places. A second set of links to the same folders
// would be chrome competing with navigation that works.
function buildRail(root: HTMLElement, rail: LevelRail): void {
  const el = root.createDiv({ cls: "ca-jph-rail" });
  rail.steps.forEach((label, i) => {
    const state = i < rail.here ? "is-past" : i === rail.here ? "is-here" : "is-ahead";
    const step = el.createDiv({ cls: `ca-jph-step ${state}` });
    step.createSpan({ cls: "ca-jph-step-dot" });
    step.createSpan({ cls: "ca-jph-step-label", text: label });
  });
}

function dateLabel(plugin: ChronoAnvilPlugin, file: TFile): string | null {
  return entryDateLabel(plugin.app, file, grainOf(plugin, file));
}

// What the title row will read. Also decides the pencil's target, which is why
// it survived the subtitle it was written for (1.0.35).
function titleTextOf(
  app: ChronoAnvilPlugin["app"],
  file: TFile,
  surface: BannerSurface,
  date: string | null
): string {
  if (titleTargetFor(surface, date !== null) === "filename") return file.basename;
  const v = frontmatterOf(app, file)[TITLE_PROP];
  const title = typeof v === "string" ? v.trim() : "";
  return title || date || file.basename;
}
