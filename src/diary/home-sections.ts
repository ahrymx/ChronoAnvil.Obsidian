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
// to this note…"** answered "this note isn't one Almanac recognises" on
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

import { HEADER_PREFIX, TRENDS_HEADING } from "../core/constants";
import { WIDE_KEYWORD } from "../core/directive-grammar";
import { composeFlatNote, flatNoteModel, locateTitle } from "../core/note-sections";
import type { FlatSection, FlatNoteSpec } from "../core/note-sections";
import type { VaultLists } from "../core/widget-registry";
import type { SectionModel } from "../core/section-model";

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
// settings. A page Almanac composes should not be shaped by that.
//
// NOT THE PROSE WIDTH, AND NOT UNBOUNDED. `--file-line-width` is a number about
// TEXT — how many characters read comfortably in a line — and this page has
// almost no text in it. Unbounded is the other failure: on a wide monitor the
// month grid stretches to a cell per hand-span with nothing to stop it. So the
// homepage takes a width of its own, and `--am-page-width` says where the
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
// it gives them their setting back, and no part of Almanac writes it again.
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
// gets the same width from `.jtc-wide`. Both selectors live in one rule with one
// `max-width`, so there is nothing to keep in step.
//
// The property this buys, which is the one `cssclasses` was chosen for in the
// first place: the reader can see the setting, and deleting it gives them their
// width back. A line in the block they are looking at is more of that than a key
// in a collapsed frontmatter panel, not less.
export const HOME_CSS_CLASS = "almanac-wide";

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
            fence: "almanac",
            lines: ["header:🏷️ Tags", `tag-index:${diaryRoot}`],
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

const HOME_SECTION_DEFS: FlatSection[] = [
  {
    id: "title",
    label: "Page title",
    blurb: "The page's own name, with the control that renames it and edits its sections.",
    icon: "🏷️",
    // NOT LOCKED. A homepage without a title card is a coherent thing to want —
    // the note's name is in the tab, the file explorer and the window — where a
    // homepage with no way into the diary is not. `diary` is locked for that
    // reason and this is the counterpart.
    locked: false,
    // PINNED (4.11), which is the other half of `locked: false` rather than a
    // contradiction of it: the card can go, and while it is there it is first.
    // `PAGE_TITLE_SECTION` carries the same flag for the three catalogues that
    // share it and `DIARY_SECTIONS` has carried it since 4.10 — this is the
    // homepage's own copy of one decision, not a fourth one.
    pinned: true,
    // FIRST, AND IN NO ROW. It names the page, so it sits above everything the
    // page contains rather than beside one of the things it contains.
    //
    // AND IT CARRIES THE PAGE'S WIDTH (4.11). `wide` is a fact about the note and
    // is read from the block that draws its title, so the homepage's width is now
    // a line in the homepage rather than a key in its frontmatter — see
    // `HOME_CSS_CLASS` for what that replaces and what it does not.
    //
    // BEFORE THE DIRECTIVE, where `composeFlatNote` already puts `row` and where
    // both other modifiers are read from regardless of order. Removing this
    // section takes the width with it, which is the honest outcome: the width is
    // derived from the card, so a page with no head is a page with no head's
    // opinion about its width.
    render: () => ({ fence: "almanac", lines: [WIDE_KEYWORD, "title"] }),
    // SHARED WITH EVERY OTHER PAGE'S HEAD (4.10). The homepage composes the
    // BARE form and the others carry ids, so the rule has to admit both — and
    // `locateTitle` is where that is decided, once.
    locate: locateTitle,
  },
  {
    id: "diary",
    label: "Diary",
    blurb: "The greeting, today's numbers, the month grid and what's coming up.",
    icon: "📆",
    // LOCKED, for `links`' reason one catalogue over: a vault whose homepage
    // has no way into the diary is worse than one with no homepage at all.
    //
    // It is also the only section here carrying navigation of any kind — there
    // is no `links:` row on this note, because the diary card's destination
    // pills ARE it. That is why the lock is on this section and not on a
    // navigation section that does not exist.
    locked: true,
    // The first cell of the top row. 4.2 §2.
    row: HOME_TOP_ROW,
    render: () => ({ fence: "almanac", lines: [`diary:${HOME_AGENDA}`] }),
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
    label: "Go to",
    blurb: "Tiles for the diary, search, journals and quick capture.",
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
    render: () => ({ fence: "almanac", lines: ["launcher"] }),
    locate: (text) => probe(text, /^launcher\b/m),
  },
  {
    id: "tasks",
    label: "Open tasks",
    blurb: "Every unticked task in the vault, grouped by the note it is in.",
    icon: "⏳",
    // NEW ON THE HOMEPAGE IN 4.2, and it is the row that earned it a place. The
    // widget is not new — `tasks-table` ships on the four period dashboards and
    // on every journal index — but the homepage had no room for it while the
    // page was one column: it would have been a fourth full-width block on a
    // note whose whole job is to be glanced at. Beside the diary card it costs
    // no scrolling at all.
    //
    // BARE, WHICH ON THIS NOTE MEANS THE WHOLE VAULT. Every folder-scoped
    // directive defaults to its host note's own folder and the homepage's is the
    // vault root, so the bare form already means what the page wants — and, per
    // "Caveat on paths", a directive with no argument is the one that never
    // needs updating when a folder is renamed.
    locked: false,
    row: HOME_TOP_ROW,
    cell: HOME_ASIDE,
    render: () => ({ fence: "almanac", lines: ["tasks-table"] }),
    locate: (text) => probe(text, /^tasks-table\b/m),
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
    row: HOME_TOP_ROW,
    cell: HOME_ASIDE,
    render: () => ({ fence: "almanac", lines: ["on-this-day:always"] }),
    locate: (text) => probe(text, /^on-this-day\b/m),
  },
  {
    id: "journals",
    label: "Journals",
    blurb: "Every journal, subject and topic, as one card.",
    icon: "📚",
    // The counterpart of `diary`, and unlocked where that one is locked: a
    // vault can reasonably have no journals at all — Study is a preset that
    // ships enabled and can be turned off, and custom types are opt-in — so a
    // homepage without this section is a coherent thing to want. The widget
    // already agrees: it renders nothing when no journals are enabled.
    locked: false,
    render: () => ({ fence: "almanac", lines: ["journals"] }),
    locate: (text) => probe(text, /^journals\s*$/m),
  },
  {
    id: "charts",
    label: "Trends and Statistics",
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
      fence: "almanac-charts",
      lines: [`${HEADER_PREFIX}${TRENDS_HEADING.replace(/^#+\s*/, "")}`],
    }),
    locate: (text) => probe(text, /^```almanac-charts/m),
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
      fence: "almanac",
      lines: ["header:🏷️ Tags", "tag-index"],
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
// key carrying `almanac-wide` — and the note now says the same thing in the head's
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
