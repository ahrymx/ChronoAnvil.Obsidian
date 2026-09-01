// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 AhryMX <contact@ahrymx.dev>
//
// Licensed under the GNU Affero General Public License v3.0 or later, with
// attribution and naming terms under its section 7. See LICENSE and
// LICENSING.md.

// What is on the homepage, as data.
//
// WHY THIS EXISTS. 2.59.3 moved the four period dashboards out of `assets/` and
// into a catalogue, on the argument that a file copied verbatim has *"nothing
// to enumerate, nothing to ask 'does this belong here', and nowhere for an
// editor to put a section."* Four shipped notes were left behind by that
// migration and nothing since went back for them. The homepage is one of them,
// and it is the most-visited note in the vault.
//
// The consequence was not subtle. `surfaceOfNote` in section-insert.ts asks
// three questions — journal surface, diary dashboard, diary entry — and returns
// null otherwise, so both **"Edit this note's sections…"** and **"Add a section
// to this note…"** answered "this note isn't one ChronoAnvil recognises" on
// `Homepage.md`. The machinery to rearrange it has existed since 3.0 and
// reached every note but this one.
//
// WHAT IT IS NOT. This is not a second description of the homepage sitting
// beside `assets/home.md` — that file is deleted in the same patch. Keeping
// both would mean maintaining two copies of one arrangement plus a test whose
// only job is to notice them drifting, which is the argument 2.59.3 already
// made and STUDY_COMPOSED made before it. Composing makes drift impossible
// rather than detectable.
//
// WHAT SHIPS AND WHY NOTHING ELSE DOES. Five sections, and three widgets that
// were proposed and declined. `journals-header` is the hero band the `journals`
// card already draws at its top; `events:upcoming` is the list the `diary`
// card already ends with; `sleep-summary` is a chart, and Trends and Statistics
// is where charts go. Each would have been a second way to see something the
// page already shows once. All three stay documented directives for a reader
// building a page of their own — see 3.11 §8.

import {
  HEADER_PREFIX,
  JOURNALS_DIRECTIVE_LINE,
  TRENDS_HEADING,
  isJournalsDirective,
} from "../core/constants";
import {
  composeFlatNote,
  flatNoteModel,
  bannerSection,
} from "../core/note-sections";
import type { FlatSection, FlatNoteSpec } from "../core/note-sections";
import { WIDGETS } from "../core/widget-registry";
import type { VaultLists } from "../core/widget-registry";
import { widgetLine, widgetQuestions } from "../core/widget-sections";
import { WIDGET_FORM, SECTION_FORM, formQuestion, type SectionModel } from "../core/section-model";
import { FRAME_KEYWORD, HEADER_KEYWORD } from "../core/directive-grammar";

const probe = (text: string, re: RegExp): number => text.search(re);

// How many charts the reader has configured here.
//
// Counted off the `chart:` directives rather than by parsing them, because the
// question is "is there anything of yours here" and a malformed directive is
// still theirs. The same count `diary-sections.ts` makes for the same section
// on the four dashboards, and deliberately the same rule rather than a second
// opinion about what a configured chart looks like.
const chartLinesIn = (text: string): number =>
  text.split("\n").filter((l) => /^\s*chart:/.test(l)).length;

// How many upcoming events the diary card folds in below its grid. The
// homepage's own default since 2.13.7; named here rather than left as a bare
// `3` in a template nobody could find.
const HOME_AGENDA = 3;

// The class that gives the homepage a width of its own. 4.2 §2.
//
// WHY THE PAGE HAS TO SAY SOMETHING ABOUT ITS WIDTH AT ALL. *Readable line
// length* is an Obsidian setting, and until rows existed it made no difference
// here: a column of full-width blocks looks the same at 700px and at 1400px,
// only smaller. A row splits the pane, so the setting silently decides how much
// room each cell gets — at the default 700px a two-cell row gives each widget
// about 345px, which is under the 520px at which every widget in this plugin
// collapses to its narrow layout. The page would then be a row of two columns,
// and whether it was would depend on a checkbox in someone's appearance
// settings. A page ChronoAnvil composes should not be shaped by that.
//
// NOT THE PROSE WIDTH, AND NOT UNBOUNDED. `--file-line-width` is a number about
// TEXT — how many characters read comfortably in a line — and this page has
// almost no text in it. Unbounded is the other failure: on a wide monitor the
// month grid stretches to a cell per hand-span with nothing to stop it. So the
// homepage takes a width of its own, and `--ca-page-width` says where the
// number comes from.
//
// `cssclasses` IN THE NOTE, WHICH IS THE MECHANISM AND NOT AN IMPLEMENTATION
// DETAIL. The width lives on Obsidian's own sizer — an ancestor of everything
// this plugin renders, and something a markdown post-processor cannot reach.
// The two ways to it are this frontmatter key, which Obsidian supports and
// every theme already uses, and adding a class to the view container at render
// time. The second is refused: `OBSIDIAN_DOM.viewFooter` exists because a class
// put on a VIEW element outlived the note that caused it — Obsidian reuses a
// leaf across file switches — and a width that stuck to the next note opened in
// that tab is exactly that bug with a new symptom.
//
// It also keeps the decision the reader's. The line is in their note; deleting
// it gives them their setting back, and no part of ChronoAnvil writes it again.
//
// ── AND AS OF 4.11 IT IS NOT WHAT A NEW HOMEPAGE USES ─────────────────────
//
// Everything above is still the argument for the WIDTH; what changed is where the
// note says so. 4.11 gives every dashboard a `wide` line it can carry in the block
// that draws its title, and a toggle in the cog that writes one — which left the
// homepage as the one page whose width was somewhere else, so its cog would have
// reported "not wide" about a page that was.
//
// One width mechanism, and the frontmatter one keeps only the job it can still do:
// KEEPING EXISTING HOMEPAGES WIDE. Repair does not edit frontmatter and never has,
// so a homepage composed before this release keeps its `cssclasses` key and keeps
// its width from this class — and a homepage composed after it has neither and
// gets the same width from `.ca-jtc-wide`. Both selectors live in one rule with one
// `max-width`, so there is nothing to keep in step.
//
// The property this buys, which is the one `cssclasses` was chosen for in the
// first place: the reader can see the setting, and deleting it gives them their
// width back. A line in the block they are looking at is more of that than a key
// in a collapsed frontmatter panel, not less.
export const HOME_CSS_CLASS = "ca-wide";

// The homepage's sections, given the vault's configured diary root.
//
// A FUNCTION RATHER THAN A CONST AS OF 3.11 §6, and the parameter is the only
// thing this catalogue has ever needed from outside itself.
//
// `tag-index` used to default to the diary root inside the renderer, which
// made it the one folder-scoped directive that did not scope to its host.
// Harmonising that default means the homepage has to say which folder it
// means — and saying it here, at compose time, is better than the renderer
// assuming it: the note now states its own scope, which is what makes it
// editable rather than magic.
//
// THE COST, STATED. A path written into a directive is a path that does not
// follow a later rename the way a settings read would. That is the same trade
// every `tasks-table:<folder>` in the vault already makes, it is documented
// beside them, and `MANAGED_ARGS` deliberately excludes `tag-index` from
// repair's rewriting so a reader who points it somewhere of their own is not
// silently reverted.
export function homeSections(diaryRoot: string): FlatSection[] {
  return HOME_SECTION_DEFS.map((s) =>
    s.id === "tags"
      ? {
          ...s,
          render: () => ({
            fence: "chronoanvil",
            lines: [TAGS_BAR, `tag-index:${diaryRoot}`],
          }),
        }
      : s
  );
}

// The homepage's top row, as one name in one place. 4.2 §2.
//
// THE ID IS NOT SHOWN TO ANYBODY — it exists so the composer can tell this row
// from the next one, and a page with two adjacent rows would otherwise compose
// them as one block of six cells.
const HOME_TOP_ROW = "today";

// The right-hand cell of that row: the two small widgets, stacked. 4.4 §3.
//
// WHY THEY STACK RATHER THAN STANDING BESIDE THE DIARY CARD. 4.3.0 put all
// three in a line and the render answered the question — the diary card is a
// greeting, a stat strip, a month grid and an agenda, and the other two are a
// list and a list. Three equal columns gave the heaviest widget on the page the
// same third as a list that is empty on a young vault, and read as a page with
// a gap in it rather than as a page with two halves.
//
// The cell is named for what it is on the page, not for what is in it: a
// section moved out of it should not leave the name lying.
const HOME_ASIDE = "aside";

// ── WHAT 4.70 CONSIDERED AND DID NOT DO: A SECOND ROW ────────────────────
//
// The obvious shape for this release on this page was `time-grid | logbook` —
// the week as it was scheduled beside the week as it was logged, which is a
// genuinely good pair, and it would have put the last two things version 4
// built onto the one page a reader opens.
//
// IT COSTS A SHIPPED FEATURE, AND THE FEATURE WINS. `pageWidgetKeywords`
// withholds a widget from the add list on any page whose CATALOGUE writes its
// keyword — the rule that stops one directive being offered through two doors,
// and the rule `time-grid` is subject to one entry down. A SECTION is withheld
// once the page has it; a WIDGET is offered again however many the page holds,
// which is exactly what 4.56 built (`widgetInstances`' spare) and exactly what
// the report behind it asked for: *"a homepage carrying the work log beside
// Current focus beside what is scheduled is three `logbook:` lines."*
//
// So a `logbook` section here would trade three logbooks for one, on the page
// the feature was reported against. `time-grid` pays no such price — it is one
// per page either way — which is the whole of the difference between the two.
//
// The logbooks are still composed, on their own folder note, one section per
// registered book (`logbook-sections.ts`).

// The Tags cloud's title, spelled once. Its render is written twice — the
// catalogue's bare form below and the folder-filled one in `homeSections` — and
// a toggle whose bar and whose render disagreed by one character would read the
// answer off a line it never wrote.
const TAGS_BAR = `${HEADER_PREFIX}🏷️ Tags`;

const HOME_SECTION_DEFS: FlatSection[] = [
  // THE BANNER, FIRST — and as of 4.19 it is `bannerSection`'s, not a fourth
  // near-copy of one. The homepage carried its own until this release because
  // the shared object could not express the two things this page wants: the BARE
  // title form, and the `wide` line. Both are `BannerSpec` fields now, so the
  // difference is an argument rather than a duplicate definition.
  //
  // IT CARRIED THE THREE DESTINATIONS FROM 4.20, AND IS BARE AGAIN SINCE 5.2 —
  // as is every other page. The whole argument below is kept because it was had
  // twice and lost twice, and because the observation it turned on was false.
  //
  // THE ARGUMENT THAT KEPT IT BARE (4.5–4.19). This page composed the bare
  // `title` on the grounds that the launcher is already here, as content in a
  // cell, "shipping with Diary and Journals among its four tiles" — so ids would
  // draw the same destinations twice on one screen.
  //
  // THAT OBSERVATION WAS NOT TRUE, AND NOBODY CHECKED IT FOR SIX RELEASES.
  // `LAUNCHER_DEFAULT` is `["week", "month", "quarter", "year"]`: the four
  // PERIOD dashboards. A bare `launcher` has never drawn a Diary or a Journals
  // tile. There was no doubling to avoid — which means 4.20 reversed a decision
  // whose premise was wrong, and reached the right composition for a reason
  // that did not apply either.
  //
  // WHAT 4.20 WEIGHED, AND IT STILL HOLDS AS FAR AS IT GOES: the banner meaning
  // something different on this page than on the other eight. A reader learns
  // the banner once, and the homepage was the one place its row was missing,
  // which reads as unfinished rather than considered.
  //
  // AND 5.2 SETTLES IT FROM THE OTHER END. The row was not drawn ANYWHERE: the
  // head that rendered it was replaced in 4.10 and the ids reached nothing after
  // that. So the banner does mean one thing on all nine pages, which is what
  // 4.20 was after — it is just that the thing is a name and a cog. See
  // `PAGE_TITLE_LINE` in note-sections.ts.
  //
  // THE DISTINCTION THAT MADE THE DOUBLING TOLERABLE IS STILL A REAL ONE, for
  // whenever a destinations row comes back: chrome you read to know where you
  // are is not content you click, even when the two name the same places.
  //
  // NO `links:` ROW EITHER: the diary card's destination pills ARE this page's
  // time navigation, and always were. So the homepage banner is a title and
  // nothing else, which is the honest answer for a page whose navigation is two
  // widgets a reader chose. That was also the argument that locked `diary`
  // until 4.53 — see there for why the lock went and this paragraph stayed.
  //
  // AND IT NOW CANNOT BE REMOVED, which is 4.19's one loss and is felt hardest
  // here. The old `title` section was unlocked on the argument that a homepage
  // without a title card is a coherent thing to want; that is still true, and
  // the banner is locked anyway because ONE rule across nine surfaces beats a
  // rule a reader has to learn per page. `bannerSection` states the trade.
  //
  // IT STILL CARRIES THE PAGE'S WIDTH (4.11). `wide` is a fact about the note,
  // read from the block that draws its title — see `HOME_CSS_CLASS` for what
  // that replaced and what it did not.
  bannerSection({ wide: true }),
  {
    id: "diary",
    label: "Diary",
    blurb: "The greeting, today's numbers, the month grid and what's coming up.",
    icon: "📆",
    // UNLOCKED AS OF 4.53, and it was locked from 4.2 until then. The old
    // argument was `links`' one catalogue over: this note has no `links:` row,
    // the diary card's destination pills ARE its time navigation, and a vault
    // whose homepage has no way into the diary is worse than one with no
    // homepage at all.
    //
    // What that argument missed is that the homepage is not the only way in.
    // The ribbon, the command palette and the diary dashboard all open the
    // diary, and none of them can be turned off from here — so the lock was
    // not protecting the only door, it was protecting a preferred one. A
    // reader who wants a homepage of journals and charts was told no by a rule
    // that bought them nothing.
    //
    // The card is still what the section catalogue OFFERS first and what a
    // fresh homepage composes with; unlocking changes what a reader may take
    // away, not what they are given. Compare `banner`, which stays locked
    // because ONE rule across nine surfaces beats a rule learnt per page —
    // that argument survives, and this one did not.
    locked: false,
    // The first cell of the top row. 4.2 §2.
    row: HOME_TOP_ROW,
    render: (options) => ({
      fence: "chronoanvil",
      lines: [
        ...(options?.form === SECTION_FORM ? ["header:📆 Today"] : []),
        `diary:${HOME_AGENDA}`,
      ],
    }),
    questions: () => [formQuestion("header:📆 Today", HEADER_KEYWORD)],
    // THE KEYWORD AND ITS ARGUMENT, AND NOT A LONGER WORD THAT STARTS WITH IT.
    //
    // This was `/^diary\b/m` until 4.12, and `\b` matches at a hyphen — so this
    // section located a `diary-search` fence and claimed it. On the homepage as
    // composed there is no such fence and nothing showed; add one by hand and the
    // Diary card's id is attributed to the search block, which the editor then
    // reports, plans and reorders as if it were the card.
    //
    // Every other `locate` in this file is safe on `\b` because no keyword in the
    // switch extends any of them. `diary` is the one that does — `diary-search`
    // — so it is the one that has to say what follows it. Written as "a colon and
    // whatever it takes, or nothing", which is the grammar `diary:N` has.
    locate: (text) => probe(text, /^diary(?::.*)?$/m),
  },
  {
    id: "launcher",
    label: "Overview navigator",
    blurb: "Tiles for the weekly, monthly, quarterly, and yearly overviews.",
    icon: "🧭",
    locked: false,
    // THE TOP OF THE ASIDE, above the two lists. It is the smallest block on
    // the page and the only one that is about leaving it, so it reads as a
    // header for the column rather than as a fourth thing to scan.
    row: HOME_TOP_ROW,
    cell: HOME_ASIDE,
    // BARE, so the note carries no list to keep in step with the destinations
    // the plugin knows about. `launcher` alone draws the default four, and a
    // reader who wants their own writes them after it.
    // NO `bar`, AND IT IS NOT AN OVERSIGHT. `soloBar` gives a barless cell the
    // title its row's opener was composing for it; this row has no opener that
    // does. Every cell here — the Today card, the tasks list, the logbook —
    // defaults to WIDGET form and composes no `header:` at all, so the top row
    // ships with no band title and a lone launcher is titleless because the
    // page is, not because a section was removed from it.
    render: () => ({ fence: "chronoanvil", lines: ["launcher"] }),
    locate: (text) => probe(text, /^launcher\b/m),
  },
  {
    id: "tasks",
    label: "Open tasks",
    blurb: "Every unticked task in the vault, grouped by the note it is in.",
    icon: "⏳",
    locked: false,
    row: HOME_TOP_ROW,
    cell: HOME_ASIDE,
    questions: (spec) => [
      formQuestion("header:⏳ Open tasks", HEADER_KEYWORD),
      {
        kind: "folder",
        key: "folder",
        label: "the folder to collect tasks from",
        directive: "tasks-table",
        hostFolder: spec.hostFolder ?? null,
        emptyLabel: "the whole vault",
      },
    ],
    render: (options) => ({
      fence: "chronoanvil",
      lines: [
        ...(options?.form === SECTION_FORM ? ["header:⏳ Open tasks"] : []),
        options?.folder && options.folder !== ""
          ? `tasks-table:${options.folder}`
          : "tasks-table",
      ],
    }),
    locate: (text) => probe(text, /^tasks-table\b/m),
  },
  {
    id: "logbook",
    label: WIDGETS.logbook.label,
    blurb: WIDGETS.logbook.blurb,
    icon: WIDGETS.logbook.glyph,
    locked: false,
    row: HOME_TOP_ROW,
    tab: true,
    render: (options) => ({
      fence: "chronoanvil",
      lines: [
        ...(options?.form === SECTION_FORM ? ["header:🗒️ Logbook"] : []),
        widgetLine("logbook", options),
      ],
    }),
    questions: () => [
      formQuestion("header:🗒️ Logbook", HEADER_KEYWORD),
      ...widgetQuestions("logbook"),
    ],
    locate: (text) => probe(text, /^logbook\b/m),
  },
  {
    id: "upcoming",
    label: WIDGETS.upcoming.label,
    blurb: WIDGETS.upcoming.blurb,
    icon: WIDGETS.upcoming.glyph,
    locked: false,
    optIn: true,
    render: (options) => ({
      fence: "chronoanvil",
      lines: [
        ...(options?.form === SECTION_FORM ? ["header:⏭️ Coming up"] : []),
        widgetLine("upcoming", options),
      ],
    }),
    questions: () => [
      formQuestion("header:⏭️ Coming up", HEADER_KEYWORD),
      ...widgetQuestions("upcoming"),
    ],
    locate: (text) => probe(text, /^upcoming\b/m),
  },
  {
    id: "on-this-day",
    label: "On this day",
    blurb: "This date in previous years, newest first.",
    icon: "🕘",
    // OFFERED, NOT SHIPPED, AS OF 3.13 §11 — and the argument for taking it
    // off the homepage is the argument that used to justify shipping it.
    //
    // Bare `on-this-day` renders NOTHING when it has nothing, which is what
    // made it free to put here. The other side of that: it is invisible for a
    // reader's first year, which is exactly when they are learning what this
    // page contains — and then it appears, unannounced, on a note they have
    // by now stopped reading closely.
    //
    // And the homepage is the only note in the vault that is about NOW:
    // today's numbers, this month's grid, what is coming up, the journals as
    // they stand. On this day is the one block here about the past, and the
    // note whose whole job is the past — search, timeline, on this day with
    // `:always` — is one click away and already carries it.
    //
    // THE WIDGET IS NOT RETIRED. It dispatches, it is documented, and it still
    // ships on Search. What changed is which note writes it by default. A
    // homepage that already has the block keeps it: `planLayout` deletes only
    // what `RETIRED_WIDGETS` names, and this is not that.
    //
    // `optIn` IS §11.4's FIELD, ALREADY BUILT. The roadmap proposed adding
    // `ships?: boolean` — not composed, not restored by repair, otherwise an
    // ordinary section, read by the composer and by nothing else. That is
    // `optIn`'s definition word for word (`note-sections.ts`), inherited from
    // `DiarySection.optIn`. A second name for one idea is what this project
    // spends whole releases removing, so: no new field.
    //
    // ── SHIPPED AGAIN AS OF 4.2, AND THE 3.13 §11 ARGUMENT IS ANSWERED RATHER
    // THAN OVERRULED, which is why it is left standing above rather than
    // deleted. Both halves of it were about a block in a COLUMN:
    //
    //   "it is invisible for a reader's first year, and then it appears,
    //   unannounced" — it appears in a row now, in a cell that is already
    //   there. What arrives is content in a slot, not a new band pushing the
    //   page down;
    //
    //   "the one block here about the past, on the note that is about NOW" —
    //   that was a claim about how much of the page it took, and a third of a
    //   row is not what a full-width block was.
    //
    // If the row is ever undone, this argument comes back with it and the entry
    // should go back to `optIn`.
    // ── `:always`, AND THE RENDER IS WHY (4.3.1) ────────────────────────
    //
    // The paragraph above says this section "arrives in a cell that is already
    // there". Looked at in a vault, that was wrong in the case that matters
    // most: the bare form renders NOTHING until the diary is a year old, and a
    // cell that draws nothing still takes its share of the row. A new vault's
    // homepage had a third of its top row as blank space — which is a worse
    // version of the thing 3.13 §11 objected to, because it is not even showing
    // anything.
    //
    // `:always` keeps the empty state, so the cell says what will appear there
    // and when. That is the spelling Search has always used, for the same
    // reason: a page that has reserved the space should explain it. It also
    // answers §11's "appears unannounced" more completely than the row did —
    // the section is now visible from day one and tells the reader what it is
    // waiting for, rather than materialising a year later.
    locked: false,
    // ── OFFERED AGAIN AS OF 4.70, AND 3.13 §11 IS WHY ────────────────────
    //
    // That paragraph ends: *"If the row is ever undone, this argument comes back
    // with it and the entry should go back to `optIn`."* The row is not undone —
    // the cell is still there and still full — so this is the weaker half of
    // that sentence coming due rather than the stated trigger, and it is worth
    // saying which.
    //
    // WHAT 4.2 ACTUALLY ANSWERED was the SPACE half: "a third of a row is not
    // what a full-width block was". True then, true now, and it stops deciding
    // anything the moment something else wants the cell. §11's other half was
    // never answered and is the one that holds — *the homepage is the only note
    // in the vault that is about NOW, and this is the one block here about the
    // past* — and the section that takes the cell is `upcoming`, which is the
    // same sentence from the other end.
    //
    // AND NOTHING IS LOST. Search still composes it, with the same `:always`
    // spelling, and Search is the page whose whole job is the past. The widget
    // is not retired, an existing homepage keeps the block it has — `planLayout`
    // deletes only what `RETIRED_WIDGETS` names — and the section window still
    // offers it here.
    //
    // `:always` STAYS ON THE RENDER, and 4.3.1's reason survives being offered
    // rather than composed: a reader who adds this back has asked for it, and a
    // block that draws nothing at all for a year is a worse answer to that than
    // one saying what it is waiting for.
    optIn: true,
    render: () => ({ fence: "chronoanvil", lines: ["on-this-day:always"] }),
    locate: (text) => probe(text, /^on-this-day\b/m),
  },
  {
    id: "time-grid",
    label: "Time grid",
    // THE REGISTRY'S OWN SENTENCE AND GLYPH. The same widget through a second
    // door, so a reader meeting it here reads what a reader meeting it in the
    // widget list reads — one description, in `widget-registry.ts`.
    blurb: WIDGETS["time-grid"].blurb,
    icon: WIDGETS["time-grid"].glyph,
    // Nothing of the reader's is stored here — the meetings, the log items and
    // the tasks live in their own notes, and this is a view onto them.
    locked: false,
    // ── A BLOCK OF ITS OWN, NOT A CELL ───────────────────────────────────
    //
    // No `row`/`cell`, unlike the four blocks above it: the grid is seven
    // columns of hours and half a page is not enough width for it. The same
    // call `charts` and `tags` make below, and for the same reason.
    //
    // AND THIS IS THE PAGE WHERE IT IS HONEST, alongside the weekly dashboard.
    // `weekStartOf` reads `week-start` off the host note and falls back to the
    // CURRENT week — which is wrong on a month page and exactly right here,
    // because a homepage is a page about now. It is the only surface where the
    // fallback is the intent rather than a miss.
    //
    // ── COMPOSED AS OF 4.70, AND STILL A BLOCK OF ITS OWN ────────────────
    //
    // THE PARAGRAPH ABOVE SURVIVES 4.70 INTACT, which is worth saying because
    // the release that composes this is the release about rows and the obvious
    // thing to do with a newly-default block is put it in one. 4.62 gave the
    // grid a day count precisely so it could take a column — the registry says
    // so: *"a column of a row group cannot draw seven days, and this is the
    // reader saying so before the pane has to"* — so `row` here with `|3` was
    // available and was tried.
    //
    // IT IS NOT TAKEN, BECAUSE THE HOMEPAGE IS `wide` AND THE WEEK IS THE
    // POINT. Three days around today is the compromise a narrow column forces,
    // and this page does not force it; a homepage that shows yesterday, today
    // and tomorrow has thrown away the half of the week a reader opens a grid
    // to see. The day count is for the pages that are genuinely short of
    // width, and this is not one.
    //
    // (The other half of that attempt — `logbook` beside it — is recorded
    // above the catalogue, and is why there is no second row here at all.)
    //
    // `optIn` IS GONE, so this arrives on existing homepages at the next
    // repair — stacked, at the composed position, because reconciliation is
    // additive and reorders nothing. That is stated in the changelog because it
    // is what an existing vault will actually see.
    render: (options) => ({
      fence: "chronoanvil",
      lines: [
        // `WIDGET_FORM`, AS IT HAS BEEN SINCE 4.59. A full-width block above a
        // full-width `journals:cards` needs the bar to say where one ends; the
        // one-line rule that strips bars applies to a section that shares a
        // fence, and this shares none.
        ...(options?.form === WIDGET_FORM
          ? []
          : ["header:⏱️ The week by the hour"]),
        widgetLine("time-grid", options),
      ],
    }),
    // THE REGISTRY'S QUESTION, ASKED FROM HERE — `time-grid`'s three sources are
    // declared once and this composes the same directive, so it asks through
    // `widgetQuestions` rather than re-typing them.
    questions: () => [
      formQuestion("header:⏱️ The week by the hour", HEADER_KEYWORD),
      ...widgetQuestions("time-grid"),
    ],
    // MATCHES THE KEYWORD, NOT THE ARGUMENT, so a reader who narrows the grid to
    // `time-grid:events` still has a section the editor can find rather than a
    // second one it offers to add.
    locate: (text) => probe(text, /^time-grid\b/m),
  },
  {
    id: "journals",
    label: "Journals",
    blurb: "One card per journal, with its numbers.",
    icon: "📚",
    // The counterpart of `diary`, and unlocked as that one now is too: a
    // vault can reasonably have no journals at all — Study is a preset that
    // ships enabled and can be turned off, and custom types are opt-in — so a
    // homepage without this section is a coherent thing to want. The widget
    // already agrees: it renders nothing when no journals are enabled.
    locked: false,
    // ── `journals:cards` RATHER THAN `journals` (4.37) ───────────────────
    //
    // THE ARGUMENT THAT REFUSED THIS PAGE HAS INVERTED. `journals` draws every
    // journal, every top-level container and every child of each — three levels
    // on the homepage — and until 4.36 that was the only place any of it could be
    // seen. 4.1 §2.2 refused a per-journal dashboard on exactly those grounds.
    // The dashboard exists now, and enumerating a journal's contents on the
    // HOMEPAGE is the duplication that release was written to remove: the reader
    // wants to know which journal to open, not what is inside all of them at
    // once.
    //
    // So the homepage asks the arrangement whose card IS a journal — a name that
    // opens its dashboard, over four figures about it. `journals` is untouched and
    // still the right answer on a page about journals; the journals dashboard
    // composes it for that reason.
    render: (options) => ({
      fence: "chronoanvil",
      lines: [
        ...(options?.form === WIDGET_FORM ? [] : ["frame: section"]),
        "journals:cards",
      ],
    }),
    questions: () => [formQuestion("frame: section", FRAME_KEYWORD)],
    // MATCHES BOTH SPELLINGS, which is the same shape of locator 4.36 wrote for
    // `level-(index|cards)` and for the same reason: this page is RECONCILED, so
    // a homepage written before this release must be recognised as already having
    // this section rather than having a second one added beside it. `\S*` rather
    // than `(:cards)?` so a reader who wrote a third arrangement by hand is also
    // found — the section is "the journals block", whichever way it is drawn.
    locate: (text) => probe(text, JOURNALS_DIRECTIVE_LINE),
  },
  {
    id: "charts",
    label: "Trends and statistics",
    blurb: "The charts manager for the whole vault.",
    icon: "📊",
    // NOT LOCKED, AND NOT FREELY REMOVABLE EITHER — the one section here where
    // those are different answers, exactly as on the dashboards.
    //
    // A reader who wants no charts on their homepage should be able to say so;
    // a reader with nine configured must not lose them to an untick.
    locked: false,
    holds: (text) => chartLinesIn(text),
    render: () => ({
      fence: "chronoanvil-charts",
      lines: [`${HEADER_PREFIX}${TRENDS_HEADING.replace(/^#+\s*/, "")}`],
    }),
    locate: (text) => probe(text, /^```chronoanvil-charts/m),
  },
  {
    id: "tags",
    label: "Tags",
    blurb: "Every tag under the diary, most-used first, with the notes carrying it.",
    icon: "🏷️",
    // The last block on the shipped page and the one most likely to be
    // unwanted, which is the whole argument for cataloguing it: before this it
    // could only be removed by editing markdown, and removing it by hand is
    // how a reader ends up with a homepage they are afraid to let repair
    // touch.
    locked: false,
    // OFFERED, NOT SHIPPED, AS OF 4.1 §2.1 — the section moves to the diary
    // dashboard, which is a page about the diary and so the right home for a
    // cloud of the diary's tags. On a homepage it was one of five sections and
    // the one least about NOW.
    //
    // `optIn` RATHER THAN DELETION, and this is 3.13 §11's mechanism reused
    // verbatim for the same reason it was built. Deleting the entry would stop
    // a NEW vault composing it — which is the whole intent — but it would also
    // make an EXISTING homepage's Tags block a block the catalogue no longer
    // recognises: the section editor would report it as one of "N blocks in
    // this file aren't the catalogue's", and a reader could no longer move or
    // remove it through the window. `optIn` gets the intent and keeps the
    // recognition, which is exactly what it did for `on-this-day`.
    //
    // §2.4's rule holds without any further help: `shippedNotes` writes a note
    // only when it is missing, and `planLayout` deletes only what
    // `RETIRED_WIDGETS` names. Nothing removes this from a homepage that has
    // it.
    optIn: true,
    // The folder is filled in by `homeSections` — see there. This default is
    // the bare form and is never the one composed; it exists so the shape of
    // the section is readable here beside its siblings.
    render: () => ({
      fence: "chronoanvil",
      lines: [TAGS_BAR, "tag-index"],
    }),
    // AND NOW THE DIALOG CAN REPOINT IT (3.15). The folder is written into the
    // note by `homeSections` and read back out of it by the section editor;
    // there is still exactly one place it lives, which is the property 3.11 §6
    // chose the note for in the first place.
    questions: (spec) => [
      {
        kind: "folder",
        key: "folder",
        label: "the folder to read tags from",
        directive: "tag-index",
        hostFolder: spec.hostFolder ?? null,
      },
      // AND NO FORM TOGGLE, WHICH IS DELIBERATE (5.11). Every other section
      // composing a `header:` bar over one directive is offered "a section of
      // its own, or a widget?", and this one reads like the copy that was
      // missed. It is not. `hasKnownExtent` asks whether a section renders one
      // line IN EITHER FORM, and a toggle here would make it answer yes for
      // every Tags block — including one a reader has hand-built into a row
      // WITH its bar, where the anchor is `tag-index` and cutting that one line
      // leaves the title standing over nothing. The other toggled sections do
      // not have this problem because their bar is opt-IN (`SECTION_FORM ?
      // [bar] : []`) and a cell of theirs is barless already. Offering it here
      // needs `hasKnownExtent` to ask about the form the FILE is in rather than
      // the two the catalogue can compose, which is a change to machinery four
      // catalogues share; until then the refusal in `home-sections.test.ts`
      // ("refuses a cell whose extent is more than one line") is the one that
      // stands.
    ],
    // MATCHES THE KEYWORD, NOT THE ARGUMENT, so a reader who repoints the
    // cloud at their own folder still has a section the editor can find.
    locate: (text) => probe(text, /^tag-index\b/m),
  },
];

const specFor = (
  diaryRoot: string,
  hostFolder: string | null = null
): FlatNoteSpec => ({
  sections: homeSections(diaryRoot),
  hostFolder,
  noun: "the homepage",
  heldUnit: "chart",
});

// The homepage's whole markdown.
//
// REPRODUCED `assets/home.md`, which 3.11 deleted. The asset carried
// `diary:3`, `on-this-day`, `journals`, the charts fence and a Tags block, in
// that order, with a spacer on line 0 and a blank line between fences. The
// spacer and the blank lines are still exact, because `appendSectionMarkdown`
// and the section walk both read them and a note that gains or loses one reads
// as a section boundary moving.
//
// THREE BLOCKS RATHER THAN FIVE. `on-this-day` became `optIn` in 3.13 §11 and
// `tags` in 4.1 §2.1, so both are offered by the editor and written by nobody.
// Each moved to the page that is ABOUT the thing it shows — Search and the
// diary dashboard — which is why the homepage shrinking is the release working
// rather than the page losing something.
//
// What is left is the homepage as a place to START: the diary card, the
// journals card, and the vault's charts.
// AND IT HAS NO FRONTMATTER, AS OF 4.11. It had four lines of it — a `cssclasses`
// key carrying `ca-wide` — and the note now says the same thing in the head's
// own fence, which is where every other dashboard says it and where the cog can
// write it. See `HOME_CSS_CLASS` for what that key still does for pages composed
// before this release.
//
// WHICH MAKES THIS A FLAT NOTE IN FULL. `composeFlatNote`'s header defines one as
// "one band, one fence per section, no frontmatter the catalogue owns, and no
// context", and the homepage was the exception to the third clause for nine
// releases. It is not any more, and the spacer is back to being line 0 rather than
// the first line of a body under four lines of YAML.
export function composeHomeNote(diaryRoot: string): string {
  return composeFlatNote(homeSections(diaryRoot));
}

// The homepage, as the editor sees it.
// `hostFolder` is what an empty folder answer resolves to, and on the homepage
// that is the vault root — the empty string, which is a KNOWN folder rather
// than an absent one. Defaulting to null keeps every existing caller (the
// composer, the scaffolder) writing exactly what it wrote before.
export function homeSectionModel(
  diaryRoot: string,
  hostFolder: string | null = null,
  // What this vault can answer a widget's argument with (4.15 §4). Supplied by
  // the caller that holds the plugin; absent leaves such a question drawn as the
  // sentence saying there is nothing to choose, which is also what a vault with
  // no journals gets.
  vault?: VaultLists
): SectionModel {
  return flatNoteModel({ ...specFor(diaryRoot, hostFolder), vault });
}

// ── The journals block, collapsed to one and spelled for its page ─────────
//
// ── WHAT THIS REPLACES, AND THE BUG IT IS THE FIX FOR (4.38.2) ────────────
//
// 4.37 shipped `retargetJournalsCards`, which rewrote a bare `journals` line to
// `journals:cards` inside any `chronoanvil` fence. Its comment claimed *"it only
// ever matches one page in the vault, which is why it can sit in this loop
// rather than needing a walk of its own."*
//
// **That was false, and it was the whole bug.** The journals DASHBOARD composes
// a bare `journals` too — it is that page's main section — and the migration
// walked every shipped note, so it rewrote the dashboard's block as well. The
// dashboard's `locate` probe is `/^journals\s*$/m`, strict, so on the next
// repair it could no longer find its own section and `reconcileLayouts` did the
// correct thing with the wrong input: it ADDED one. Then the migration rewrote
// that one too. A reader running repair twice got two Journals sections on the
// dashboard; three times, three — and the window alternated between offering
// "adds journals" and "draw the Journals section as one card per journal"
// forever, which is exactly what was reported.
//
// So the fix is three things and this function is two of them:
//
//   1. THE TARGET IS THE CALLER'S. The homepage wants `journals:cards`; the
//      dashboard wants `journals`. One function cannot know which page it is
//      looking at and must not guess — the parameter is that refusal made
//      explicit. `scaffold.ts` passes the spelling per path.
//   2. DUPLICATES COLLAPSE. A vault that already ran the broken migration has
//      two or more journals fences on a page, and no amount of correct
//      behaviour from here on removes them. The first survives, the rest go.
//   3. And the dashboard's `locate` is widened (see
//      `journals-dashboard-sections.ts`) so a page that is momentarily on the
//      other spelling is recognised rather than duplicated. That is the belt to
//      this function's braces: with it, the growth stops even before this runs.
//
// THE FIRST BLOCK IS THE SURVIVOR, not the last and not the composed position: a
// reader who moved their journals section up the page moved it deliberately, and
// a migration that relocates a section is doing more than it was asked.
//
// WHY A MIGRATION AND NOT RECONCILIATION. `reconcileLayouts` is additive — it
// adds a section this release ships and the note lacks — and these sections are
// already there, twice over. `reconfigure` is not the answer either:
// `note-sections.ts` emits it only for a section the reader asked to rewrite in
// the sections editor, which is a deliberate act and not a release upgrade.
//
// PURE, TEXT-IN AND TEXT-OR-NULL-OUT, which is the property that makes the repair
// window's dry run *be* the migration with the write taken off rather than a
// summary of one — stated for `mergeBannerFences` and inherited here.
//
// ONLY INSIDE A `chronoanvil` FENCE, because "journals" is an ordinary English word
// and a reader's own prose or heading must not be rewritten. The fence state is
// tracked rather than assumed from position: a page may hold several fences and
// the reader may have moved this one.
//
// AND `journals-header:study` MUST NOT MATCH. It is a different widget that
// happens to start with the same seven letters, and it lives on every journal
// dashboard — so the directive is matched whole, with an optional `:argument`,
// rather than by prefix.
export function collapseJournalsBlocks(
  text: string,
  keep: "journals" | "journals:cards"
): string | null {
  const lines = text.split("\n");

  // Every `chronoanvil` fence that holds a journals directive, as [start, end] line
  // indices of the fence including its two ``` lines, plus where the directive
  // sits inside it.
  const found: { start: number; end: number; at: number }[] = [];
  let start = -1;
  let at = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // The opening fence carries the language; the closing one is bare. Matching
    // ``` at a line's start is how every other reader in this project walks
    // fences, and the `chronoanvil` check is what keeps a code sample out of scope.
    if (/^```/.test(line)) {
      if (start === -1) {
        if (/^```chronoanvil\s*$/.test(line.trim())) {
          start = i;
          at = -1;
        }
        continue;
      }
      if (at !== -1) found.push({ start, end: i, at });
      start = -1;
      continue;
    }
    // `journals` or `journals:<argument>` and nothing else on the line. A fence
    // holding `journals-header:study` is a DIFFERENT widget and must not match,
    // which is what the `:` alternative pins down rather than a loose prefix.
    if (start !== -1 && isJournalsDirective(line)) at = i;
  }
  if (found.length === 0) return null;

  const out = [...lines];
  // The survivor is the FIRST, so a reader who moved their journals section up
  // the page keeps it where they put it.
  const first = found[0];
  out[first.at] = out[first.at].replace(/journals(:[a-z-]+)?\s*$/, keep);

  // And every later one goes, with the blank line that separated it — walked
  // backwards so the earlier indices stay valid.
  const drop = new Set<number>();
  for (const block of found.slice(1)) {
    for (let i = block.start; i <= block.end; i++) drop.add(i);
    // One trailing blank, if the fence had one. Not a greedy run: two blank
    // lines in a reader's note are a paragraph break they chose.
    if (lines[block.end + 1] !== undefined && lines[block.end + 1].trim() === "") {
      drop.add(block.end + 1);
    }
  }
  const kept = out.filter((_, i) => !drop.has(i));
  const next = kept.join("\n");
  return next === text ? null : next;
}
